// Sócios e capital investido por veículo
// Regras (combinadas com a loja):
// - Capital do carro = valor de compra + custos lançados.
// - Cada sócio informa quanto aportou no carro (na compra, num custo ou "outro"). O que ninguém cobriu fica com o "Caixa da loja".
// - Participação = aporte do sócio / capital do carro (se aportarem mais que o capital, a base é o total aportado).
// - Resultado da venda = valor da venda − capital − comissão. Lucro (ou prejuízo) dividido pela participação.
// - Retorno do sócio = aporte + parte do resultado. "A repassar" = retorno − repasses já lançados no caixa.
const { db } = require('./db');
const { today, brl, dataBR, descVeiculo } = require('./util');
const { bad } = require('./routes-cadastros');
const { enrich } = require('./routes-estoque');
const { relatorioPDF } = require('./pdf');

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const lojaId = () => db.prepare('SELECT id FROM socios WHERE loja=1').get().id;
const { contaPadrao } = require('./db');
// conta onde entra o aporte: a mesma da saída que ele cobre (custo, compra ou a conta paga), para as duas se anularem
function contaDoAporte(ap) {
  const r = (ap.custo_id && db.prepare('SELECT conta_id FROM lancamentos WHERE custo_id=?').get(ap.custo_id))
    || (ap.lancamento_id && db.prepare('SELECT conta_id FROM lancamentos WHERE id=?').get(ap.lancamento_id))
    || (ap.referente === 'compra' && db.prepare("SELECT conta_id FROM lancamentos WHERE veiculo_id=? AND categoria='Compra de veículos' AND venda_id IS NULL").get(ap.veiculo_id));
  return (r && r.conta_id) || contaPadrao();
}
const getSocio = (id) => db.prepare('SELECT * FROM socios WHERE id=?').get(id);

// ---------- cálculo por veículo ----------
function divisao(vid) {
  const raw = db.prepare('SELECT * FROM veiculos WHERE id=?').get(vid);
  if (!raw) return null;
  const v = enrich(raw);
  const venda = db.prepare("SELECT * FROM vendas WHERE veiculo_id=? AND status='concluida'").get(vid) || null;
  const aps = db.prepare(`SELECT a.socio_id, s.nome, s.loja, SUM(a.valor) valor FROM veiculo_aportes a JOIN socios s ON s.id=a.socio_id
    WHERE a.veiculo_id=? GROUP BY a.socio_id`).all(vid);
  const capital = r2(v.custo_total);
  const aportado = r2(aps.reduce((t, a) => t + a.valor, 0));
  const naoAtrib = r2(Math.max(0, capital - aportado));
  const base = Math.max(capital, aportado);
  const L = lojaId();
  const m = new Map(aps.map((a) => [a.socio_id, { socio_id: a.socio_id, nome: a.nome, loja: !!a.loja, aporte: r2(a.valor), nao_atribuido: 0 }]));
  if (naoAtrib > 0) {
    const l = m.get(L) || { socio_id: L, nome: 'Caixa da loja', loja: true, aporte: 0, nao_atribuido: 0 };
    l.aporte = r2(l.aporte + naoAtrib); l.nao_atribuido = naoAtrib; m.set(L, l);
  }
  const resultado = venda ? r2(venda.valor_venda - capital - (venda.comissao_valor || 0)) : null;
  const previsto = !venda && v.preco_venda ? r2(v.preco_venda - capital) : null;
  const reps = Object.fromEntries(db.prepare(`SELECT socio_id, SUM(valor) t FROM lancamentos WHERE veiculo_id=? AND categoria='Repasse a sócios'
    AND status!='cancelado' AND socio_id IS NOT NULL GROUP BY socio_id`).all(vid).map((r) => [r.socio_id, r2(r.t)]));
  const socios = [...m.values()].map((s) => {
    const p = base ? s.aporte / base : 0;
    const lucro = resultado != null ? r2(p * resultado) : null;
    const retorno = lucro != null ? r2(s.aporte + lucro) : null;
    const repassado = reps[s.socio_id] || 0;
    return { ...s, participacao: r2(p * 100), lucro, lucro_previsto: previsto != null ? r2(p * previsto) : null, retorno, repassado, a_repassar: !s.loja && retorno != null ? r2(retorno - repassado) : null };
  }).sort((a, b) => a.loja - b.loja || b.aporte - a.aporte);
  // centavos de arredondamento ficam com o caixa da loja (ou com o maior aporte), para a soma fechar exata
  const ajusta = (campo, total) => {
    if (total == null || !socios.length) return;
    const dif = r2(total - socios.reduce((t, s) => t + (s[campo] || 0), 0));
    if (!dif) return;
    const alvo = socios.find((s) => s.loja) || socios[0];
    alvo[campo] = r2(alvo[campo] + dif);
    if (campo === 'lucro') { alvo.retorno = r2(alvo.aporte + alvo.lucro); if (!alvo.loja) alvo.a_repassar = r2(alvo.retorno - alvo.repassado); }
  };
  ajusta('lucro', resultado);
  ajusta('lucro_previsto', previsto);
  return {
    veiculo: { id: v.id, descricao: descVeiculo(v), placa: v.placa, categoria: v.categoria, status: v.status, data_entrada: v.data_entrada, dias_patio: v.dias_patio, valor_compra: v.valor_compra || 0, custos_total: v.custos_total, preco_venda: v.preco_venda },
    venda: venda ? { id: venda.id, data: venda.data_venda, valor: venda.valor_venda, comissao: venda.comissao_valor || 0 } : null,
    capital, aportado, nao_atribuido: naoAtrib, excedente: r2(Math.max(0, aportado - capital)), resultado, resultado_previsto: previsto, socios,
  };
}

// resumo de todos os sócios (percorre os veículos com aporte ou capital da loja)
function resumo() {
  const socios = db.prepare('SELECT * FROM socios ORDER BY loja, ativo DESC, nome').all();
  const out = new Map(socios.map((s) => [s.id, { ...s, capital_estoque: 0, carros_estoque: 0, lucro_realizado: 0, lucro_previsto: 0, a_repassar: 0, carros_vendidos: 0, estoque: [], vendidos: [] }]));
  const ids = db.prepare(`SELECT id FROM veiculos WHERE status!='vendido' OR id IN (SELECT veiculo_id FROM veiculo_aportes)
    OR id IN (SELECT veiculo_id FROM vendas WHERE status='concluida') ORDER BY data_entrada DESC, id DESC`).all().map((r) => r.id);
  for (const id of ids) {
    const d = divisao(id);
    for (const s of d.socios) {
      const o = out.get(s.socio_id); if (!o) continue;
      const linha = { veiculo_id: id, veiculo: d.veiculo.descricao, placa: d.veiculo.placa, status: d.veiculo.status, dias: d.veiculo.dias_patio, capital: d.capital, aporte: s.aporte, participacao: s.participacao, nao_atribuido: s.nao_atribuido };
      if (d.venda) {
        o.carros_vendidos++; o.lucro_realizado = r2(o.lucro_realizado + s.lucro); if (s.a_repassar) o.a_repassar = r2(o.a_repassar + s.a_repassar);
        o.vendidos.push({ ...linha, data_venda: d.venda.data, valor_venda: d.venda.valor, resultado: d.resultado, lucro: s.lucro, retorno: s.retorno, repassado: s.repassado, a_repassar: s.a_repassar });
      } else {
        o.carros_estoque++; o.capital_estoque = r2(o.capital_estoque + s.aporte); if (s.lucro_previsto != null) o.lucro_previsto = r2(o.lucro_previsto + s.lucro_previsto);
        o.estoque.push({ ...linha, preco_venda: d.veiculo.preco_venda, lucro_previsto: s.lucro_previsto });
      }
    }
  }
  // aportes na empresa sem carro e restituições pendentes (contas pagas pelo sócio)
  db.prepare(`SELECT socio_id, SUM(valor) t FROM lancamentos WHERE categoria='Aporte de sócios' AND aporte_id IS NULL AND socio_id IS NOT NULL
    AND status!='cancelado' GROUP BY socio_id`).all().forEach((r) => { const o = out.get(r.socio_id); if (o) o.aporte_geral = r2(r.t); });
  db.prepare(`SELECT socio_id, SUM(valor) t FROM lancamentos WHERE categoria='Restituição a sócios' AND status='pendente' AND socio_id IS NOT NULL
    GROUP BY socio_id`).all().forEach((r) => { const o = out.get(r.socio_id); if (o) o.a_restituir = r2(r.t); });
  for (const o of out.values()) { o.aporte_geral = o.aporte_geral || 0; o.a_restituir = o.a_restituir || 0; }
  return [...out.values()];
}

// ---------- aportes e caixa ----------
function lancarAporte(ap, userId) {
  const s = getSocio(ap.socio_id);
  const v = db.prepare('SELECT * FROM veiculos WHERE id=?').get(ap.veiculo_id);
  const desc = `Aporte de ${s.nome} – ${descVeiculo(v)}${v.placa ? ' (' + v.placa + ')' : ''}${ap.descricao ? ' · ' + ap.descricao : ''}`;
  const ex = db.prepare('SELECT id FROM lancamentos WHERE aporte_id=?').get(ap.id);
  const dt = ap.data || today();
  if (ex) db.prepare('UPDATE lancamentos SET descricao=?, valor=?, vencimento=?, data_pagamento=?, socio_id=?, conta_id=? WHERE id=?').run(desc, ap.valor, dt, dt, ap.socio_id, contaDoAporte(ap), ex.id);
  else db.prepare(`INSERT INTO lancamentos(tipo,descricao,categoria,valor,vencimento,data_pagamento,status,conta_id,veiculo_id,socio_id,aporte_id,criado_por)
    VALUES ('entrada',?,'Aporte de sócios',?,?,?,'pago',?,?,?,?,?)`).run(desc, ap.valor, dt, dt, contaDoAporte(ap), ap.veiculo_id, ap.socio_id, ap.id, userId);
}
// o total aportado num veículo não pode passar do capital dele (valor de compra + custos lançados)
function checarLimite(veiculoId, valor, ignorarAporteId = null) {
  const d = divisao(veiculoId);
  const outros = r2(db.prepare('SELECT COALESCE(SUM(valor),0) t FROM veiculo_aportes WHERE veiculo_id=? AND id IS NOT ?').get(veiculoId, ignorarAporteId).t);
  const livre = r2(Math.max(0, d.capital - outros));
  if (r2(valor) > livre + 0.009) {
    throw bad(livre > 0
      ? `O aporte passa do capital do veículo. Capital (compra + custos): ${brl(d.capital)}; já aportado: ${brl(outros)}; ainda disponível: ${brl(livre)}.`
      : `O veículo já está todo coberto por aportes (capital ${brl(d.capital)}). Para aportar mais, lance antes a compra ou o custo que o sócio pagou.`);
  }
}
function validarAporte(b) {
  const s = getSocio(b.socio_id);
  if (!s || !s.ativo) throw bad('Escolha o sócio.');
  if (!(Number(b.valor) > 0)) throw bad('Informe o valor do aporte.');
  return s;
}
// custo pago por um sócio vira aporte automático (e sai junto se o custo for excluído)
function syncAporteCusto(c, socioId, userId) {
  const ex = db.prepare('SELECT * FROM veiculo_aportes WHERE custo_id=?').get(c.id);
  const s = socioId ? getSocio(socioId) : null;
  // se a conta do custo foi paga como aporte de um sócio, o "Pago por" do custo manda: acompanha a troca ou a remoção
  db.prepare("UPDATE lancamentos SET pago_socio_id=?, pago_socio_modo=CASE WHEN ? IS NULL THEN NULL ELSE pago_socio_modo END WHERE custo_id=? AND pago_socio_modo='aporte'")
    .run(s && !s.loja ? s.id : null, s && !s.loja ? s.id : null, c.id);
  if (!s || s.loja) { if (ex) db.prepare('DELETE FROM veiculo_aportes WHERE id=?').run(ex.id); return; }
  const desc = `${c.categoria || 'Custo'}${c.descricao ? ': ' + c.descricao : ''}`.slice(0, 200);
  let id = ex && ex.id;
  if (ex) db.prepare('UPDATE veiculo_aportes SET socio_id=?, valor=?, data=?, descricao=? WHERE id=?').run(s.id, c.valor, c.data || today(), desc, ex.id);
  else id = db.prepare("INSERT INTO veiculo_aportes(veiculo_id,socio_id,referente,custo_id,valor,data,descricao,criado_por) VALUES (?,?,'custo',?,?,?,?,?)")
    .run(c.veiculo_id, s.id, c.id, c.valor, c.data || today(), desc, userId).lastInsertRowid;
  lancarAporte(db.prepare('SELECT * FROM veiculo_aportes WHERE id=?').get(id), userId);
}

// ---------- conta paga com dinheiro de um sócio ----------
// O pagamento continua saindo da conta escolhida e, no mesmo dia, entra o mesmo valor vindo do sócio, então o saldo
// do banco não muda (o dinheiro não saiu da loja). Depois:
// - modo "aporte": o valor vira capital do sócio. Se a conta é de um carro, vira aporte no carro (entra na participação);
//   sem carro, fica como aporte na empresa.
// - modo "restituir": a loja fica devendo ao sócio. Nasce uma conta a pagar "Restituição a sócios".
function pagarPorSocio(l, socioId, modo, userId) {
  const s = getSocio(socioId);
  if (!s || s.loja || !s.ativo) throw bad('Escolha o sócio que pagou.');
  if (!['aporte', 'restituir'].includes(modo)) throw bad('Escolha se o valor soma aos aportes ou fica a restituir.');
  if (l.tipo !== 'saida') throw bad('Só contas a pagar podem ser pagas por um sócio.');
  if (['Repasse a sócios', 'Restituição a sócios'].includes(l.categoria)) throw bad('Este lançamento já é um pagamento ao sócio.');
  const dt = l.data_pagamento || today();
  const v = l.veiculo_id ? db.prepare('SELECT * FROM veiculos WHERE id=?').get(l.veiculo_id) : null;
  const ref = v ? ` – ${descVeiculo(v)}${v.placa ? ' (' + v.placa + ')' : ''}` : '';
  db.prepare('UPDATE lancamentos SET pago_socio_id=?, pago_socio_modo=? WHERE id=?').run(s.id, modo, l.id);
  // a entrada do sócio cai na mesma conta do pagamento, para o saldo dela não mudar
  const mesmaConta = (aporteId) => db.prepare('UPDATE lancamentos SET conta_id=COALESCE(?,conta_id), vencimento=?, data_pagamento=? WHERE aporte_id=?').run(l.conta_id, dt, dt, aporteId);
  if (modo === 'aporte') {
    if (l.custo_id) {
      const c = db.prepare('SELECT * FROM veiculo_custos WHERE id=?').get(l.custo_id);
      syncAporteCusto(c, s.id, userId); // mesmo efeito do "Pago por" do custo
      mesmaConta(db.prepare('SELECT id FROM veiculo_aportes WHERE custo_id=?').get(c.id).id);
      return;
    }
    if (v) {
      checarLimite(v.id, l.valor);
      const id = db.prepare('INSERT INTO veiculo_aportes(veiculo_id,socio_id,referente,valor,data,descricao,criado_por,lancamento_id) VALUES (?,?,?,?,?,?,?,?)')
        .run(v.id, s.id, l.categoria === 'Compra de veículos' ? 'compra' : 'outro', r2(l.valor), dt, `Pagou: ${l.descricao}`.slice(0, 200), userId, l.id).lastInsertRowid;
      lancarAporte(db.prepare('SELECT * FROM veiculo_aportes WHERE id=?').get(id), userId);
      mesmaConta(id);
      return;
    }
    db.prepare(`INSERT INTO lancamentos(tipo,descricao,categoria,valor,vencimento,data_pagamento,status,conta_id,socio_id,origem_id,criado_por)
      VALUES ('entrada',?,'Aporte de sócios',?,?,?,'pago',?,?,?,?)`).run(`Aporte de ${s.nome} – pagou: ${l.descricao}`.slice(0, 250), r2(l.valor), dt, dt, l.conta_id || contaPadrao(), s.id, l.id, userId);
    return;
  }
  db.prepare(`INSERT INTO lancamentos(tipo,descricao,categoria,valor,vencimento,data_pagamento,status,conta_id,veiculo_id,socio_id,origem_id,criado_por)
    VALUES ('entrada',?,'Adiantamento de sócios',?,?,?,'pago',?,?,?,?,?)`).run(`${s.nome} pagou: ${l.descricao}`.slice(0, 250), r2(l.valor), dt, dt, l.conta_id || contaPadrao(), l.veiculo_id || null, s.id, l.id, userId);
  db.prepare(`INSERT INTO lancamentos(tipo,descricao,categoria,valor,vencimento,status,conta_id,forma,veiculo_id,socio_id,origem_id,criado_por)
    VALUES ('saida',?,'Restituição a sócios',?,?,'pendente',?,'pix',?,?,?,?)`).run(`Restituir ${s.nome}: ${l.descricao}`.slice(0, 250), r2(l.valor), dt, l.conta_id || contaPadrao(), l.veiculo_id || null, s.id, l.id, userId);
}
// estorno ou exclusão da conta: desfaz o que nasceu dela
function desfazerPagoPorSocio(l) {
  if (!l.pago_socio_id) return;
  const restPaga = db.prepare("SELECT 1 FROM lancamentos WHERE origem_id=? AND categoria='Restituição a sócios' AND status='pago'").get(l.id);
  if (restPaga) throw bad('A restituição ao sócio já foi paga. Estorne a restituição primeiro.');
  if (l.pago_socio_modo === 'aporte' && l.custo_id) {
    const ap = db.prepare('SELECT * FROM veiculo_aportes WHERE custo_id=?').get(l.custo_id);
    if (ap && ap.socio_id === l.pago_socio_id) db.prepare('DELETE FROM veiculo_aportes WHERE id=?').run(ap.id);
  }
  db.prepare('DELETE FROM veiculo_aportes WHERE lancamento_id=?').run(l.id);
  db.prepare('DELETE FROM lancamentos WHERE origem_id=?').run(l.id);
  db.prepare('UPDATE lancamentos SET pago_socio_id=NULL, pago_socio_modo=NULL WHERE id=?').run(l.id);
}

// ---------- relatórios (CSV / PDF) ----------
function csv(res, nome, header, rows) {
  const esc = (v) => { const s = v == null ? '' : String(v); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const num = (v) => (typeof v === 'number' ? v.toFixed(2).replace('.', ',') : v);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${nome}.csv"`);
  res.send('﻿' + [header, ...rows].map((r) => r.map((c) => esc(num(c))).join(';')).join('\r\n'));
}
async function pdf(res, nome, opts) {
  const buf = await relatorioPDF(opts);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${nome}.pdf"`);
  res.send(buf);
}
const pc = (n) => `${Number(n || 0).toFixed(1).replace('.', ',')}%`;

module.exports = function (api, can) {
  // cadastro
  api.get('/socios', can('custos'), (req, res) => {
    if (req.query.simples) return res.json(db.prepare('SELECT id,nome,loja,ativo FROM socios ORDER BY loja DESC, nome').all());
    res.json(resumo().map(({ estoque, vendidos, ...s }) => s));
  });
  api.post('/socios', can('financeiro'), (req, res) => {
    const b = req.body || {};
    if (!String(b.nome || '').trim()) throw bad('Informe o nome do sócio.');
    const r = db.prepare('INSERT INTO socios(nome,cpf_cnpj,telefone,email,pix,observacoes) VALUES (?,?,?,?,?,?)')
      .run(String(b.nome).trim(), b.cpf_cnpj || null, b.telefone || null, b.email || null, b.pix || null, b.observacoes || null);
    res.json({ id: r.lastInsertRowid });
  });
  api.put('/socios/:id', can('financeiro'), (req, res) => {
    const s = getSocio(req.params.id); if (!s) return res.status(404).json({ error: 'Sócio não encontrado.' });
    const b = req.body || {};
    if (!String(b.nome || '').trim()) throw bad('Informe o nome.');
    db.prepare('UPDATE socios SET nome=?,cpf_cnpj=?,telefone=?,email=?,pix=?,observacoes=?,ativo=? WHERE id=?')
      .run(String(b.nome).trim(), b.cpf_cnpj || null, b.telefone || null, b.email || null, b.pix || null, b.observacoes || null, s.loja ? 1 : b.ativo === 0 || b.ativo === '0' ? 0 : 1, s.id);
    res.json({ ok: true });
  });
  api.delete('/socios/:id', can('financeiro'), (req, res) => {
    const s = getSocio(req.params.id); if (!s) return res.status(404).json({ error: 'Sócio não encontrado.' });
    if (s.loja) throw bad('O "Caixa da loja" não pode ser excluído.');
    const usado = db.prepare('SELECT 1 FROM veiculo_aportes WHERE socio_id=? UNION SELECT 1 FROM lancamentos WHERE socio_id=?').get(s.id, s.id);
    if (usado) { db.prepare('UPDATE socios SET ativo=0 WHERE id=?').run(s.id); return res.json({ ok: true, inativado: true }); }
    db.prepare('DELETE FROM socios WHERE id=?').run(s.id);
    res.json({ ok: true });
  });

  // ficha do sócio
  api.get('/socios/:id', can('custos'), (req, res) => {
    const o = resumo().find((s) => String(s.id) === String(req.params.id));
    if (!o) return res.status(404).json({ error: 'Sócio não encontrado.' });
    o.movimentos = db.prepare(`SELECT l.id,l.tipo,l.descricao,l.categoria,l.valor,l.vencimento,l.data_pagamento,l.status,l.veiculo_id FROM lancamentos l
      WHERE l.socio_id=? AND l.status!='cancelado' ORDER BY COALESCE(l.data_pagamento,l.vencimento) DESC, l.id DESC LIMIT 300`).all(o.id);
    res.json(o);
  });

  // aportes por veículo
  api.get('/veiculos/:id/investimento', can('custos'), (req, res) => {
    const d = divisao(req.params.id);
    if (!d) return res.status(404).json({ error: 'Veículo não encontrado.' });
    d.aportes = db.prepare(`SELECT a.*, s.nome socio_nome, s.loja, c.categoria custo_categoria, (SELECT id FROM lancamentos WHERE aporte_id=a.id) lancamento_id
      FROM veiculo_aportes a JOIN socios s ON s.id=a.socio_id LEFT JOIN veiculo_custos c ON c.id=a.custo_id WHERE a.veiculo_id=? ORDER BY a.data, a.id`).all(req.params.id);
    res.json(d);
  });
  api.post('/veiculos/:id/aportes', can('custos'), (req, res) => {
    const b = req.body || {};
    const v = db.prepare('SELECT id FROM veiculos WHERE id=?').get(req.params.id); if (!v) return res.status(404).json({ error: 'Veículo não encontrado.' });
    const s = validarAporte(b);
    checarLimite(v.id, b.valor);
    const referente = ['compra', 'outro'].includes(b.referente) ? b.referente : 'compra';
    const id = db.transaction(() => {
      const r = db.prepare('INSERT INTO veiculo_aportes(veiculo_id,socio_id,referente,valor,data,descricao,criado_por) VALUES (?,?,?,?,?,?,?)')
        .run(v.id, s.id, referente, r2(b.valor), b.data || today(), String(b.descricao || '').slice(0, 200) || null, req.user.id);
      if (!s.loja && Number(b.lancar_caixa) !== 0) lancarAporte(db.prepare('SELECT * FROM veiculo_aportes WHERE id=?').get(r.lastInsertRowid), req.user.id);
      return r.lastInsertRowid;
    })();
    res.json({ id });
  });
  api.put('/aportes/:aid', can('custos'), (req, res) => {
    const a = db.prepare('SELECT * FROM veiculo_aportes WHERE id=?').get(req.params.aid); if (!a) return res.status(404).json({ error: 'Aporte não encontrado.' });
    if (a.custo_id) throw bad('Este aporte vem de um custo. Edite o custo na aba Custos.');
    const b = req.body || {};
    const s = validarAporte(b);
    checarLimite(a.veiculo_id, b.valor, a.id);
    db.transaction(() => {
      db.prepare('UPDATE veiculo_aportes SET socio_id=?, referente=?, valor=?, data=?, descricao=? WHERE id=?')
        .run(s.id, ['compra', 'outro'].includes(b.referente) ? b.referente : a.referente, r2(b.valor), b.data || a.data, String(b.descricao || '').slice(0, 200) || null, a.id);
      const ex = db.prepare('SELECT id FROM lancamentos WHERE aporte_id=?').get(a.id);
      const novo = db.prepare('SELECT * FROM veiculo_aportes WHERE id=?').get(a.id);
      if (s.loja || Number(b.lancar_caixa) === 0) { if (ex) db.prepare('DELETE FROM lancamentos WHERE id=?').run(ex.id); } else lancarAporte(novo, req.user.id);
    })();
    res.json({ ok: true });
  });
  api.delete('/aportes/:aid', can('custos'), (req, res) => {
    const a = db.prepare('SELECT * FROM veiculo_aportes WHERE id=?').get(req.params.aid); if (!a) return res.json({ ok: true });
    if (a.custo_id) throw bad('Este aporte vem de um custo. Para tirar, mude o "Pago por" do custo na aba Custos.');
    db.prepare('DELETE FROM veiculo_aportes WHERE id=?').run(a.id); // o lançamento no caixa sai junto (ON DELETE CASCADE)
    res.json({ ok: true });
  });

  // repasse ao sócio (saída no caixa)
  api.post('/socios/:id/repasses', can('financeiro'), (req, res) => {
    const s = getSocio(req.params.id); if (!s || s.loja) throw bad('Sócio inválido.');
    const b = req.body || {};
    const v = db.prepare('SELECT * FROM veiculos WHERE id=?').get(b.veiculo_id); if (!v) throw bad('Escolha o veículo.');
    if (!(Number(b.valor) > 0)) throw bad('Informe o valor do repasse.');
    const pago = Number(b.pago) !== 0;
    const dt = b.data || today();
    const r = db.prepare(`INSERT INTO lancamentos(tipo,descricao,categoria,valor,vencimento,data_pagamento,status,conta_id,forma,veiculo_id,socio_id,criado_por)
      VALUES ('saida',?,'Repasse a sócios',?,?,?,?,?,?,?,?,?)`).run(`Repasse a ${s.nome} – ${descVeiculo(v)}${v.placa ? ' (' + v.placa + ')' : ''}`, r2(b.valor), dt, pago ? dt : null, pago ? 'pago' : 'pendente', contaPadrao(), b.forma || 'pix', v.id, s.id, req.user.id);
    res.json({ id: r.lastInsertRowid });
  });

  // relatórios
  api.get('/socios-relatorio', can('custos'), async (req, res) => {
    const lista = resumo().filter((s) => s.ativo || s.capital_estoque || s.a_repassar);
    const h = ['Sócio', 'Carros em estoque', 'Capital em estoque', 'Lucro previsto (estoque)', 'Carros vendidos', 'Lucro realizado', 'A repassar'];
    const linhas = lista.map((s) => [s.nome, s.carros_estoque, s.capital_estoque, s.lucro_previsto, s.carros_vendidos, s.lucro_realizado, s.loja ? '' : s.a_repassar]);
    if (req.query.formato === 'csv') return csv(res, `socios_${today()}`, h, linhas);
    const tot = lista.reduce((a, s) => ({ cap: a.cap + s.capital_estoque, luc: a.luc + s.lucro_realizado, rep: a.rep + (s.loja ? 0 : s.a_repassar) }), { cap: 0, luc: 0, rep: 0 });
    return pdf(res, `socios_${today()}`, {
      titulo: 'Sócios e capital investido', subtitulo: `Posição em ${dataBR(today())}`,
      secoes: [{ resumo: [['Capital em estoque', brl(tot.cap)], ['Lucro realizado', brl(tot.luc)], ['A repassar aos sócios', brl(tot.rep)], ['Sócios', lista.filter((s) => !s.loja).length]] },
        { titulo: 'Por sócio', colunas: [{ label: 'Sócio', w: 2.4 }, { label: 'Em estoque', w: 0.9, align: 'right' }, { label: 'Capital em estoque', w: 1.3, align: 'right' }, { label: 'Lucro previsto', w: 1.2, align: 'right' }, { label: 'Vendidos', w: 0.8, align: 'right' }, { label: 'Lucro realizado', w: 1.2, align: 'right' }, { label: 'A repassar', w: 1.2, align: 'right' }],
          linhas: lista.map((s) => [s.nome, s.carros_estoque, brl(s.capital_estoque), brl(s.lucro_previsto), s.carros_vendidos, brl(s.lucro_realizado), s.loja ? '–' : brl(s.a_repassar)]),
          total: ['Total', '', brl(tot.cap), '', '', brl(tot.luc), brl(tot.rep)] }],
    });
  });
  api.get('/socios/:id/relatorio', can('custos'), async (req, res) => {
    const s = resumo().find((x) => String(x.id) === String(req.params.id));
    if (!s) return res.status(404).json({ error: 'Sócio não encontrado.' });
    const nome = `socio_${s.nome.replace(/\W+/g, '_').toLowerCase()}_${today()}`;
    if (req.query.formato === 'csv') {
      return csv(res, nome, ['Situação', 'Veículo', 'Placa', 'Capital do carro', 'Aporte', 'Participação %', 'Dias no pátio', 'Data da venda', 'Valor da venda', 'Resultado do carro', 'Lucro do sócio', 'Retorno', 'Repassado', 'A repassar'], [
        ...s.estoque.map((l) => ['Em estoque', l.veiculo, l.placa, l.capital, l.aporte, l.participacao, l.dias, '', '', '', l.lucro_previsto ?? '', '', '', '']),
        ...s.vendidos.map((l) => ['Vendido', l.veiculo, l.placa, l.capital, l.aporte, l.participacao, l.dias, dataBR(l.data_venda), l.valor_venda, l.resultado, l.lucro, l.retorno, l.repassado, s.loja ? '' : l.a_repassar]),
      ]);
    }
    return pdf(res, nome, {
      titulo: `Investimentos de ${s.nome}`, subtitulo: `Posição em ${dataBR(today())}`,
      secoes: [
        { resumo: [['Capital em estoque', brl(s.capital_estoque)], ['Carros em estoque', s.carros_estoque], ['Lucro realizado', brl(s.lucro_realizado)], ['A repassar', s.loja ? '–' : brl(s.a_repassar)]] },
        { titulo: 'Carros em estoque', colunas: [{ label: 'Veículo', w: 2.6 }, { label: 'Placa', w: 0.8 }, { label: 'Dias', w: 0.6, align: 'right' }, { label: 'Capital do carro', w: 1.2, align: 'right' }, { label: 'Aporte', w: 1.1, align: 'right' }, { label: 'Part.', w: 0.7, align: 'right' }, { label: 'Lucro previsto', w: 1.1, align: 'right' }],
          linhas: s.estoque.map((l) => [l.veiculo, l.placa || '', l.dias, brl(l.capital), brl(l.aporte), pc(l.participacao), l.lucro_previsto != null ? brl(l.lucro_previsto) : '–']), total: ['Total', '', '', '', brl(s.capital_estoque), '', brl(s.lucro_previsto)] },
        { titulo: 'Carros vendidos', colunas: [{ label: 'Veículo', w: 2.4 }, { label: 'Venda', w: 0.8 }, { label: 'Aporte', w: 1, align: 'right' }, { label: 'Part.', w: 0.6, align: 'right' }, { label: 'Resultado do carro', w: 1.1, align: 'right' }, { label: 'Lucro do sócio', w: 1, align: 'right' }, { label: 'Retorno', w: 1, align: 'right' }, { label: 'Repassado', w: 1, align: 'right' }, { label: 'A repassar', w: 1, align: 'right' }],
          linhas: s.vendidos.map((l) => [l.veiculo, dataBR(l.data_venda), brl(l.aporte), pc(l.participacao), brl(l.resultado), brl(l.lucro), brl(l.retorno), brl(l.repassado), s.loja ? '–' : brl(l.a_repassar)]),
          total: ['Total', '', '', '', '', brl(s.lucro_realizado), '', '', s.loja ? '–' : brl(s.a_repassar)] },
      ],
    });
  });
};
module.exports.divisao = divisao;
module.exports.syncAporteCusto = syncAporteCusto;
module.exports.pagarPorSocio = pagarPorSocio;
module.exports.desfazerPagoPorSocio = desfazerPagoPorSocio;
module.exports.contaDoAporte = contaDoAporte;
