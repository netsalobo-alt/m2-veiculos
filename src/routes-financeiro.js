const { db } = require('./db');
const { today, brl, dataBR, descVeiculo, CATEGORIAS, diasEntre } = require('./util');
const { bad } = require('./routes-cadastros');
const { enrich } = require('./routes-estoque');
const { relatorioPDF } = require('./pdf');

const CATS = {
  entrada: ['Venda de veículos', 'Retorno de financiamento', 'Serviços / despachante', 'Aporte de sócios', 'Adiantamento de sócios', 'Empréstimos', 'Outras receitas'],
  saida: ['Compra de veículos', 'Custos de veículos', 'Comissões', 'Repasse a sócios', 'Restituição a sócios', 'Aluguel', 'Salários e encargos', 'Pró-labore', 'Impostos e taxas', 'Marketing e anúncios', 'Água, luz e internet', 'Despachante / documentação', 'Tarifas bancárias', 'Manutenção da loja', 'Outras despesas'],
};
const firstOfMonth = () => today().slice(0, 8) + '01';
const pct = (a, b) => (b ? `${((a / b) * 100).toFixed(1).replace('.', ',')}%` : '–');

function saldoContas(ate) {
  return db.prepare(`SELECT c.*, c.saldo_inicial
      + COALESCE((SELECT SUM(CASE WHEN tipo='entrada' THEN valor ELSE -valor END) FROM lancamentos l WHERE l.conta_id=c.id AND l.status='pago' ${ate ? 'AND l.data_pagamento<=?' : ''}),0) saldo
    FROM contas c WHERE c.ativo=1 ORDER BY c.id`).all(...(ate ? [ate] : []));
}

// ---------- dados dos relatórios ----------
function relVendas(de, ate) {
  const rows = db.prepare(`SELECT s.*, c.nome cliente, u.nome vendedor FROM vendas s JOIN pessoas c ON c.id=s.cliente_id LEFT JOIN users u ON u.id=s.vendedor_id
    WHERE s.status='concluida' AND s.data_venda BETWEEN ? AND ? ORDER BY s.data_venda`).all(de, ate);
  const linhas = rows.map((s) => {
    const v = enrich(db.prepare('SELECT * FROM veiculos WHERE id=?').get(s.veiculo_id));
    const lucro = s.valor_venda - v.custo_total - (s.comissao_valor || 0);
    return { id: s.id, data: s.data_venda, veiculo: descVeiculo(v), placa: v.placa, categoria: v.categoria, cliente: s.cliente, vendedor: s.vendedor || '', valor: s.valor_venda, compra: v.valor_compra, custos: v.custos_total, comissao: s.comissao_valor || 0, lucro, dias: v.dias_patio, fipe: v.fipe_valor };
  });
  const tot = linhas.reduce((a, l) => ({ valor: a.valor + l.valor, compra: a.compra + l.compra, custos: a.custos + l.custos, comissao: a.comissao + l.comissao, lucro: a.lucro + l.lucro, dias: a.dias + l.dias }), { valor: 0, compra: 0, custos: 0, comissao: 0, lucro: 0, dias: 0 });
  const agrupa = (key) => Object.values(linhas.reduce((m, l) => {
    const k = l[key] || '–';
    m[k] = m[k] || { nome: key === 'categoria' ? CATEGORIAS[k] || k : k, qtd: 0, valor: 0, lucro: 0 };
    m[k].qtd++; m[k].valor += l.valor; m[k].lucro += l.lucro;
    return m;
  }, {}));
  return { linhas, total: tot, qtd: linhas.length, ticket: linhas.length ? tot.valor / linhas.length : 0, tempo_medio: linhas.length ? tot.dias / linhas.length : 0, por_vendedor: agrupa('vendedor'), por_categoria: agrupa('categoria') };
}

function relFinanceiro(de, ate) {
  const realizados = db.prepare(`SELECT tipo, categoria, SUM(valor) total, COUNT(*) n FROM lancamentos WHERE status='pago' AND data_pagamento BETWEEN ? AND ? GROUP BY tipo, categoria ORDER BY tipo, total DESC`).all(de, ate);
  const ent = realizados.filter((r) => r.tipo === 'entrada'), sai = realizados.filter((r) => r.tipo === 'saida');
  const sum = (a) => a.reduce((x, r) => x + r.total, 0);
  // DRE por competência (vendas do período)
  const vendas = relVendas(de, ate);
  const despesas = db.prepare(`SELECT categoria, SUM(valor) total FROM lancamentos WHERE tipo='saida' AND status!='cancelado' AND vencimento BETWEEN ? AND ?
    AND categoria NOT IN ('Compra de veículos','Custos de veículos','Comissões','Repasse a sócios','Restituição a sócios') GROUP BY categoria ORDER BY total DESC`).all(de, ate);
  const outrasRec = db.prepare(`SELECT categoria, SUM(valor) total FROM lancamentos WHERE tipo='entrada' AND status!='cancelado' AND vencimento BETWEEN ? AND ?
    AND categoria NOT IN ('Venda de veículos','Aporte de sócios','Adiantamento de sócios') GROUP BY categoria ORDER BY total DESC`).all(de, ate);
  const despTotal = sum(despesas), outrasTotal = sum(outrasRec);
  const cmv = vendas.total.compra + vendas.total.custos;
  const dre = {
    receita_vendas: vendas.total.valor, cmv, lucro_bruto: vendas.total.valor - cmv, comissoes: vendas.total.comissao,
    outras_receitas: outrasTotal, despesas_operacionais: despTotal,
    resultado: vendas.total.valor - cmv - vendas.total.comissao + outrasTotal - despTotal,
    despesas, outras: outrasRec,
  };
  const pendentes = db.prepare(`SELECT tipo, SUM(valor) total, COUNT(*) n FROM lancamentos WHERE status='pendente' GROUP BY tipo`).all();
  return { entradas: ent, saidas: sai, total_entradas: sum(ent), total_saidas: sum(sai), saldo: sum(ent) - sum(sai), dre, pendentes, contas: saldoContas(ate) };
}

function relEstoque() {
  const rows = db.prepare("SELECT * FROM veiculos WHERE status!='vendido' ORDER BY data_entrada").all().map(enrich);
  const faixas = [['0–30 dias', 0, 30], ['31–60 dias', 31, 60], ['61–90 dias', 61, 90], ['Mais de 90 dias', 91, 1e9]].map(([nome, a, b]) => {
    const l = rows.filter((r) => r.dias_patio >= a && r.dias_patio <= b);
    return { nome, qtd: l.length, investido: l.reduce((x, r) => x + r.custo_total, 0) };
  });
  const tot = rows.reduce((a, r) => ({ investido: a.investido + r.custo_total, anunciado: a.anunciado + (r.preco_venda || 0), fipe: a.fipe + (r.fipe_valor || 0), dias: a.dias + r.dias_patio }), { investido: 0, anunciado: 0, fipe: 0, dias: 0 });
  return { linhas: rows, faixas, total: tot, qtd: rows.length, tempo_medio: rows.length ? tot.dias / rows.length : 0 };
}

function csv(res, nome, header, rows) {
  const esc = (v) => { const s = v == null ? '' : String(v); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const num = (v) => (typeof v === 'number' ? v.toFixed(2).replace('.', ',') : v);
  const body = [header, ...rows].map((r) => r.map((c) => esc(num(c))).join(';')).join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${nome}.csv"`);
  res.send('﻿' + body);
}
async function pdf(res, nome, opts) {
  const buf = await relatorioPDF(opts);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${nome}.pdf"`);
  res.send(buf);
}

module.exports = function (api, can) {
  // ---------- contas ----------
  api.get('/contas', can('financeiro'), (req, res) => res.json(saldoContas()));
  api.post('/contas', can('financeiro'), (req, res) => {
    const { nome, tipo, saldo_inicial } = req.body || {};
    if (!nome) throw bad('Informe o nome da conta.');
    res.json({ id: db.prepare('INSERT INTO contas(nome,tipo,saldo_inicial) VALUES (?,?,?)').run(nome, tipo || 'banco', Number(saldo_inicial) || 0).lastInsertRowid });
  });
  api.put('/contas/:id', can('financeiro'), (req, res) => {
    const { nome, tipo, saldo_inicial, ativo } = req.body || {};
    db.prepare('UPDATE contas SET nome=COALESCE(?,nome), tipo=COALESCE(?,tipo), saldo_inicial=COALESCE(?,saldo_inicial), ativo=COALESCE(?,ativo) WHERE id=?')
      .run(nome || null, tipo || null, saldo_inicial == null ? null : Number(saldo_inicial), ativo == null ? null : ativo ? 1 : 0, req.params.id);
    res.json({ ok: true });
  });

  // ---------- lançamentos ----------
  api.get('/financeiro/categorias', can('financeiro'), (req, res) => {
    const extra = db.prepare('SELECT DISTINCT tipo, categoria FROM lancamentos WHERE categoria IS NOT NULL').all();
    const out = { entrada: [...CATS.entrada], saida: [...CATS.saida] };
    extra.forEach((e) => { if (!out[e.tipo].includes(e.categoria)) out[e.tipo].push(e.categoria); });
    res.json(out);
  });
  api.get('/lancamentos', can('financeiro'), (req, res) => {
    const w = ['1=1'], p = [];
    const campo = req.query.por === 'pagamento' ? "COALESCE(l.data_pagamento,l.vencimento)" : 'l.vencimento';
    if (req.query.de) { w.push(`${campo}>=?`); p.push(req.query.de); }
    if (req.query.ate) { w.push(`${campo}<=?`); p.push(req.query.ate); }
    if (req.query.tipo) { w.push('l.tipo=?'); p.push(req.query.tipo); }
    if (req.query.status === 'vencido') { w.push("l.status='pendente' AND l.vencimento<?"); p.push(today()); }
    else if (req.query.status) { w.push('l.status=?'); p.push(req.query.status); }
    else w.push("l.status!='cancelado'");
    if (req.query.conta_id) { w.push('l.conta_id=?'); p.push(req.query.conta_id); }
    if (req.query.categoria) { w.push('l.categoria=?'); p.push(req.query.categoria); }
    if (req.query.q) { w.push('l.descricao LIKE ?'); p.push(`%${req.query.q}%`); }
    res.json(db.prepare(`SELECT l.*, c.nome conta_nome, p.nome pessoa_nome, ps.nome pago_socio_nome FROM lancamentos l LEFT JOIN contas c ON c.id=l.conta_id LEFT JOIN pessoas p ON p.id=l.pessoa_id LEFT JOIN socios ps ON ps.id=l.pago_socio_id
      WHERE ${w.join(' AND ')} ORDER BY ${campo}, l.id LIMIT 2000`).all(...p));
  });
  api.post('/lancamentos', can('financeiro'), (req, res) => {
    const b = req.body || {};
    if (!['entrada', 'saida'].includes(b.tipo)) throw bad('Tipo inválido.');
    if (!b.descricao || !(Number(b.valor) > 0)) throw bad('Informe descrição e valor.');
    const parcelas = Math.max(1, Math.min(60, Number(b.parcelas) || 1));
    const ins = db.prepare(`INSERT INTO lancamentos(tipo,descricao,categoria,valor,vencimento,data_pagamento,status,conta_id,forma,pessoa_id,veiculo_id,observacoes,criado_por) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const socioId = b.tipo === 'saida' && b.status === 'pago' ? Number(b.pago_socio_id) || null : null;
    db.transaction(() => {
      for (let i = 0; i < parcelas; i++) {
        const d = new Date((b.vencimento || today()) + 'T12:00:00');
        d.setMonth(d.getMonth() + i);
        const venc = d.toISOString().slice(0, 10);
        const pago = i === 0 && b.status === 'pago';
        const r = ins.run(b.tipo, parcelas > 1 ? `${b.descricao} (${i + 1}/${parcelas})` : b.descricao, b.categoria || null, Number(b.valor), venc, pago ? b.data_pagamento || venc : null, pago ? 'pago' : 'pendente', b.conta_id || null, b.forma || null, b.pessoa_id || null, b.veiculo_id || null, b.observacoes || null, req.user.id);
        // só a parcela já paga pode ter sido paga por um sócio
        if (pago && socioId) require('./routes-socios').pagarPorSocio(db.prepare('SELECT * FROM lancamentos WHERE id=?').get(r.lastInsertRowid), socioId, b.pago_socio_modo, req.user.id);
      }
    })();
    res.json({ ok: true });
  });
  api.put('/lancamentos/:id', can('financeiro'), (req, res) => {
    const b = req.body || {};
    const cur = db.prepare('SELECT * FROM lancamentos WHERE id=?').get(req.params.id);
    if (!cur) return res.status(404).end();
    const status = b.status || cur.status;
    const socios = require('./routes-socios');
    const socioId = Number(b.pago_socio_id) || null;
    if (cur.origem_id && (b.valor != null && Number(b.valor) !== cur.valor)) throw bad('Este lançamento nasceu de uma conta paga por sócio. Altere a conta de origem.');
    db.transaction(() => {
      // mudou de pago para pendente, mudou o valor ou trocou quem pagou: desfaz o que foi gerado e refaz se for o caso
      const refaz = cur.pago_socio_id && (status !== 'pago' || socioId !== cur.pago_socio_id || (b.pago_socio_modo && b.pago_socio_modo !== cur.pago_socio_modo) || (b.valor != null && Number(b.valor) !== cur.valor) || (b.pago_socio_id !== undefined && !socioId));
      if (refaz) socios.desfazerPagoPorSocio(cur);
      db.prepare('UPDATE lancamentos SET descricao=?, categoria=?, valor=?, vencimento=?, status=?, data_pagamento=?, conta_id=?, forma=?, observacoes=? WHERE id=?')
        .run(b.descricao ?? cur.descricao, b.categoria ?? cur.categoria, Number(b.valor ?? cur.valor), b.vencimento || cur.vencimento, status,
          status === 'pago' ? b.data_pagamento || cur.data_pagamento || today() : null, b.conta_id ?? cur.conta_id, b.forma ?? cur.forma, b.observacoes ?? cur.observacoes, cur.id);
      const atual = db.prepare('SELECT * FROM lancamentos WHERE id=?').get(cur.id);
      if (status === 'pago' && socioId && (!cur.pago_socio_id || refaz)) socios.pagarPorSocio(atual, socioId, b.pago_socio_modo, req.user.id);
      else if (status === 'pago' && cur.pago_socio_id && !refaz && atual.data_pagamento !== cur.data_pagamento) {
        // só mudou a data: acompanha nos lançamentos gerados
        db.prepare(`UPDATE lancamentos SET vencimento=?, data_pagamento=CASE WHEN status='pago' THEN ? ELSE data_pagamento END
          WHERE origem_id=? AND NOT (categoria='Restituição a sócios' AND status='pago')`).run(atual.data_pagamento, atual.data_pagamento, cur.id);
      }
    })();
    if (cur.venda_id) db.prepare('UPDATE venda_pagamentos SET pago=? WHERE venda_id=? AND valor=? AND vencimento=?').run(status === 'pago' ? 1 : 0, cur.venda_id, cur.valor, cur.vencimento);
    res.json({ ok: true });
  });
  api.delete('/lancamentos/:id', can('financeiro'), (req, res) => {
    const cur = db.prepare('SELECT * FROM lancamentos WHERE id=?').get(req.params.id);
    if (cur && (cur.custo_id || cur.venda_id || cur.categoria === 'Compra de veículos' && cur.veiculo_id)) throw bad('Este lançamento é gerado por um veículo, custo ou venda. Altere-o pela origem.');
    if (cur && cur.origem_id) throw bad('Este lançamento nasceu de uma conta paga por sócio. Estorne ou exclua a conta de origem.');
    db.transaction(() => {
      if (cur) require('./routes-socios').desfazerPagoPorSocio(cur);
      db.prepare('DELETE FROM lancamentos WHERE id=?').run(req.params.id);
    })();
    res.json({ ok: true });
  });

  api.get('/financeiro/resumo', can('financeiro'), (req, res) => {
    const de = req.query.de || firstOfMonth(), ate = req.query.ate || today();
    const real = db.prepare(`SELECT tipo, SUM(valor) t FROM lancamentos WHERE status='pago' AND data_pagamento BETWEEN ? AND ? GROUP BY tipo`).all(de, ate);
    const pend = db.prepare(`SELECT tipo, SUM(valor) t, SUM(CASE WHEN vencimento<? THEN valor ELSE 0 END) vencido FROM lancamentos WHERE status='pendente' GROUP BY tipo`).all(today());
    const g = (a, t, k = 't') => (a.find((r) => r.tipo === t) || {})[k] || 0;
    const contas = saldoContas();
    res.json({
      de, ate, contas, saldo_atual: contas.reduce((a, c) => a + c.saldo, 0),
      entradas: g(real, 'entrada'), saidas: g(real, 'saida'),
      a_receber: g(pend, 'entrada'), a_pagar: g(pend, 'saida'), receber_vencido: g(pend, 'entrada', 'vencido'), pagar_vencido: g(pend, 'saida', 'vencido'),
    });
  });

  // fluxo diário: realizado (data_pagamento) + previsto (vencimento de pendentes)
  api.get('/financeiro/fluxo', can('financeiro'), (req, res) => {
    const de = req.query.de || firstOfMonth();
    const ate = req.query.ate || (() => { const d = new Date(de + 'T12:00:00'); d.setMonth(d.getMonth() + 1, 0); return d.toISOString().slice(0, 10); })();
    const inicial = db.prepare('SELECT COALESCE(SUM(saldo_inicial),0) s FROM contas WHERE ativo=1').get().s
      + db.prepare(`SELECT COALESCE(SUM(CASE WHEN tipo='entrada' THEN valor ELSE -valor END),0) s FROM lancamentos WHERE status='pago' AND data_pagamento<?`).get(de).s;
    const rows = db.prepare(`SELECT COALESCE(CASE WHEN status='pago' THEN data_pagamento END, vencimento) dia, tipo, status, SUM(valor) t FROM lancamentos
      WHERE status!='cancelado' AND COALESCE(CASE WHEN status='pago' THEN data_pagamento END, vencimento) BETWEEN ? AND ? GROUP BY dia, tipo, status ORDER BY dia`).all(de, ate);
    const dias = {};
    rows.forEach((r) => {
      const d = (dias[r.dia] = dias[r.dia] || { dia: r.dia, entradas: 0, saidas: 0, entradas_prev: 0, saidas_prev: 0 });
      const k = (r.tipo === 'entrada' ? 'entradas' : 'saidas') + (r.status === 'pago' ? '' : '_prev');
      d[k] += r.t;
    });
    // pendentes vencidos antes do período entram no saldo previsto
    const atrasados = db.prepare(`SELECT COALESCE(SUM(CASE WHEN tipo='entrada' THEN valor ELSE -valor END),0) s FROM lancamentos WHERE status='pendente' AND vencimento<?`).get(de).s;
    let saldo = inicial, saldoPrev = inicial + atrasados;
    const lista = Object.values(dias).sort((a, b) => a.dia.localeCompare(b.dia)).map((d) => {
      saldo += d.entradas - d.saidas;
      saldoPrev += d.entradas - d.saidas + d.entradas_prev - d.saidas_prev;
      return { ...d, saldo, saldo_previsto: saldoPrev };
    });
    res.json({ de, ate, saldo_inicial: inicial, atrasados, dias: lista, saldo_final: saldo, saldo_final_previsto: lista.length ? saldoPrev : inicial + atrasados });
  });

  // ---------- dashboard ----------
  api.get('/dashboard', (req, res) => {
    const verCusto = req.user.perms.includes('custos');
    const est = relEstoque();
    const ini = firstOfMonth();
    const vm = relVendas(ini, today());
    const meses = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i);
      const a = d.toISOString().slice(0, 8) + '01';
      const e = new Date(d.getFullYear(), d.getMonth() + 1, 0); const b = `${e.getFullYear()}-${String(e.getMonth() + 1).padStart(2, '0')}-${String(e.getDate()).padStart(2, '0')}`;
      const r = relVendas(a, b);
      meses.push({ mes: a.slice(0, 7), qtd: r.qtd, valor: r.total.valor, lucro: verCusto ? r.total.lucro : null });
    }
    const porCat = ['carro', 'moto', 'bike'].map((c) => ({ categoria: c, qtd: est.linhas.filter((v) => v.categoria === c).length }));
    const parados = est.linhas.filter((v) => v.dias_patio > 60).sort((a, b) => b.dias_patio - a.dias_patio).slice(0, 8)
      .map((v) => ({ id: v.id, descricao: descVeiculo(v), placa: v.placa, dias: v.dias_patio, preco: v.preco_venda, fipe: v.fipe_valor }));
    const out = {
      estoque: { qtd: est.qtd, por_categoria: porCat, tempo_medio: est.tempo_medio, anunciado: est.total.anunciado, investido: verCusto ? est.total.investido : null, faixas: est.faixas.map((f) => ({ nome: f.nome, qtd: f.qtd })) },
      mes: { qtd: vm.qtd, valor: vm.total.valor, lucro: verCusto ? vm.total.lucro : null, ticket: vm.ticket },
      meses, parados,
      ultimas: vm.linhas.slice(-5).reverse().map((l) => ({ id: l.id, data: l.data, veiculo: l.veiculo, cliente: l.cliente, valor: l.valor })),
      leads_novos: db.prepare("SELECT COUNT(*) n FROM leads WHERE status='novo'").get().n,
      docs_pendentes: db.prepare("SELECT COUNT(*) n FROM documentos WHERE status='enviado'").get().n,
    };
    if (req.user.perms.includes('financeiro')) {
      const contas = saldoContas();
      const em7 = new Date(); em7.setDate(em7.getDate() + 7);
      const lim = em7.toISOString().slice(0, 10);
      out.financeiro = {
        saldo: contas.reduce((a, c) => a + c.saldo, 0),
        pagar7: db.prepare("SELECT COALESCE(SUM(valor),0) t FROM lancamentos WHERE tipo='saida' AND status='pendente' AND vencimento<=?").get(lim).t,
        receber7: db.prepare("SELECT COALESCE(SUM(valor),0) t FROM lancamentos WHERE tipo='entrada' AND status='pendente' AND vencimento<=?").get(lim).t,
        vencidos: db.prepare("SELECT COUNT(*) n FROM lancamentos WHERE status='pendente' AND vencimento<?").get(today()).n,
      };
    }
    res.json(out);
  });

  // ---------- relatórios ----------
  const periodo = (req) => [req.query.de || firstOfMonth(), req.query.ate || today()];
  const sub = (de, ate) => `Período: ${dataBR(de)} a ${dataBR(ate)}`;

  api.get('/relatorios/vendas', can('relatorios'), async (req, res) => {
    const [de, ate] = periodo(req);
    const r = relVendas(de, ate);
    if (req.query.formato === 'csv') return csv(res, `vendas_${de}_${ate}`, ['Data', 'Veículo', 'Placa', 'Categoria', 'Cliente', 'Vendedor', 'Valor venda', 'Compra', 'Custos', 'Comissão', 'Lucro', 'Dias no pátio', 'FIPE'],
      r.linhas.map((l) => [dataBR(l.data), l.veiculo, l.placa, CATEGORIAS[l.categoria], l.cliente, l.vendedor, l.valor, l.compra, l.custos, l.comissao, l.lucro, l.dias, l.fipe || '']));
    if (req.query.formato === 'pdf') return pdf(res, `vendas_${de}_${ate}`, {
      titulo: 'Relatório de vendas', subtitulo: sub(de, ate), secoes: [
        { resumo: [['Veículos vendidos', r.qtd], ['Faturamento', brl(r.total.valor)], ['Lucro líquido', brl(r.total.lucro)], ['Margem s/ faturamento', pct(r.total.lucro, r.total.valor)], ['Ticket médio', brl(r.ticket)], ['Custo dos vendidos', brl(r.total.compra + r.total.custos)], ['Comissões', brl(r.total.comissao)], ['Tempo médio no pátio', `${Math.round(r.tempo_medio)} dias`]] },
        { titulo: 'Vendas', colunas: [{ label: 'Data', w: 0.8 }, { label: 'Veículo', w: 2.2 }, { label: 'Placa', w: 0.8 }, { label: 'Cliente', w: 1.8 }, { label: 'Vendedor', w: 1.2 }, { label: 'Venda', w: 1.1, align: 'right' }, { label: 'Compra + custos', w: 1.2, align: 'right' }, { label: 'Comissão', w: 0.9, align: 'right' }, { label: 'Lucro', w: 1.1, align: 'right' }, { label: 'Dias', w: 0.5, align: 'right' }],
          linhas: r.linhas.map((l) => [dataBR(l.data), l.veiculo, l.placa || '', l.cliente, l.vendedor, brl(l.valor), brl(l.compra + l.custos), brl(l.comissao), brl(l.lucro), l.dias]),
          total: ['Total', `${r.qtd} veículos`, '', '', '', brl(r.total.valor), brl(r.total.compra + r.total.custos), brl(r.total.comissao), brl(r.total.lucro), ''] },
        { titulo: 'Por vendedor', colunas: [{ label: 'Vendedor', w: 3 }, { label: 'Qtd', w: 1, align: 'right' }, { label: 'Faturamento', w: 2, align: 'right' }, { label: 'Lucro', w: 2, align: 'right' }], linhas: r.por_vendedor.map((g) => [g.nome, g.qtd, brl(g.valor), brl(g.lucro)]) },
        { titulo: 'Por categoria', colunas: [{ label: 'Categoria', w: 3 }, { label: 'Qtd', w: 1, align: 'right' }, { label: 'Faturamento', w: 2, align: 'right' }, { label: 'Lucro', w: 2, align: 'right' }], linhas: r.por_categoria.map((g) => [g.nome, g.qtd, brl(g.valor), brl(g.lucro)]) },
      ],
    });
    res.json(r);
  });

  api.get('/relatorios/financeiro', can('relatorios'), async (req, res) => {
    const [de, ate] = periodo(req);
    const r = relFinanceiro(de, ate);
    if (req.query.formato === 'csv') {
      const lanc = db.prepare(`SELECT l.*, c.nome conta FROM lancamentos l LEFT JOIN contas c ON c.id=l.conta_id WHERE l.status!='cancelado' AND l.vencimento BETWEEN ? AND ? ORDER BY l.vencimento`).all(de, ate);
      return csv(res, `financeiro_${de}_${ate}`, ['Vencimento', 'Pagamento', 'Tipo', 'Categoria', 'Descrição', 'Conta', 'Status', 'Valor'],
        lanc.map((l) => [dataBR(l.vencimento), dataBR(l.data_pagamento), l.tipo, l.categoria, l.descricao, l.conta, l.status, l.tipo === 'saida' ? -l.valor : l.valor]));
    }
    if (req.query.formato === 'pdf') {
      const d = r.dre;
      return pdf(res, `financeiro_${de}_${ate}`, {
        titulo: 'Relatório financeiro', subtitulo: sub(de, ate), secoes: [
          { resumo: [['Entradas realizadas', brl(r.total_entradas)], ['Saídas realizadas', brl(r.total_saidas)], ['Saldo do período', brl(r.saldo)], ['Saldo em contas', brl(r.contas.reduce((a, c) => a + c.saldo, 0))]] },
          { titulo: 'Demonstrativo de resultado (competência)', colunas: [{ label: 'Conta', w: 4 }, { label: 'Valor', w: 2, align: 'right' }, { label: '% receita', w: 1, align: 'right' }], linhas: [
            ['(+) Receita com vendas de veículos', brl(d.receita_vendas), '100%'],
            ['(–) Custo dos veículos vendidos (compra + preparação)', brl(-d.cmv), pct(d.cmv, d.receita_vendas)],
            ['(=) Lucro bruto', brl(d.lucro_bruto), pct(d.lucro_bruto, d.receita_vendas)],
            ['(–) Comissões', brl(-d.comissoes), pct(d.comissoes, d.receita_vendas)],
            ['(+) Outras receitas', brl(d.outras_receitas), pct(d.outras_receitas, d.receita_vendas)],
            ...d.outras.map((o) => [`      ${o.categoria}`, brl(o.total), '']),
            ['(–) Despesas operacionais', brl(-d.despesas_operacionais), pct(d.despesas_operacionais, d.receita_vendas)],
            ...d.despesas.map((o) => [`      ${o.categoria}`, brl(-o.total), '']),
          ], total: ['(=) Resultado do período', brl(d.resultado), pct(d.resultado, d.receita_vendas)] },
          { titulo: 'Entradas realizadas por categoria', colunas: [{ label: 'Categoria', w: 4 }, { label: 'Lançamentos', w: 1, align: 'right' }, { label: 'Total', w: 2, align: 'right' }], linhas: r.entradas.map((e) => [e.categoria || '–', e.n, brl(e.total)]), total: ['Total', '', brl(r.total_entradas)] },
          { titulo: 'Saídas realizadas por categoria', colunas: [{ label: 'Categoria', w: 4 }, { label: 'Lançamentos', w: 1, align: 'right' }, { label: 'Total', w: 2, align: 'right' }], linhas: r.saidas.map((e) => [e.categoria || '–', e.n, brl(e.total)]), total: ['Total', '', brl(r.total_saidas)] },
          { titulo: 'Saldo por conta', colunas: [{ label: 'Conta', w: 4 }, { label: 'Tipo', w: 1 }, { label: 'Saldo', w: 2, align: 'right' }], linhas: r.contas.map((c) => [c.nome, c.tipo, brl(c.saldo)]) },
        ],
      });
    }
    res.json(r);
  });

  api.get('/relatorios/estoque', can('relatorios'), async (req, res) => {
    const r = relEstoque();
    const ST = { preparacao: 'Em preparação', disponivel: 'Disponível', reservado: 'Reservado' };
    if (req.query.formato === 'csv') return csv(res, `estoque_${today()}`, ['Veículo', 'Categoria', 'Ano', 'Placa', 'Status', 'Entrada', 'Dias no pátio', 'Compra', 'Custos', 'Custo total', 'Preço anunciado', 'FIPE', 'Preço/FIPE %', 'Margem prevista'],
      r.linhas.map((v) => [descVeiculo(v), CATEGORIAS[v.categoria], `${v.ano_fab || ''}/${v.ano_mod || ''}`, v.placa, ST[v.status], dataBR(v.data_entrada), v.dias_patio, v.valor_compra, v.custos_total, v.custo_total, v.preco_venda, v.fipe_valor || '', v.fipe_pct ? v.fipe_pct.toFixed(1) : '', v.margem ?? '']));
    if (req.query.formato === 'pdf') return pdf(res, `estoque_${today()}`, {
      titulo: 'Relatório de estoque', subtitulo: `Posição em ${dataBR(today())}`, secoes: [
        { resumo: [['Veículos em estoque', r.qtd], ['Capital investido', brl(r.total.investido)], ['Valor anunciado', brl(r.total.anunciado)], ['Tempo médio no pátio', `${Math.round(r.tempo_medio)} dias`]] },
        { titulo: 'Tempo no pátio', colunas: [{ label: 'Faixa', w: 3 }, { label: 'Veículos', w: 1, align: 'right' }, { label: 'Capital investido', w: 2, align: 'right' }], linhas: r.faixas.map((f) => [f.nome, f.qtd, brl(f.investido)]) },
        { titulo: 'Veículos', colunas: [{ label: 'Veículo', w: 2.4 }, { label: 'Ano', w: 0.7 }, { label: 'Placa', w: 0.8 }, { label: 'Status', w: 1 }, { label: 'Dias', w: 0.5, align: 'right' }, { label: 'Custo total', w: 1.1, align: 'right' }, { label: 'Anunciado', w: 1.1, align: 'right' }, { label: 'FIPE', w: 1.1, align: 'right' }, { label: '% FIPE', w: 0.7, align: 'right' }, { label: 'Margem', w: 1.1, align: 'right' }],
          linhas: r.linhas.map((v) => [descVeiculo(v), `${v.ano_fab || ''}/${v.ano_mod || ''}`, v.placa || '', ST[v.status], v.dias_patio, brl(v.custo_total), brl(v.preco_venda), v.fipe_valor ? brl(v.fipe_valor) : '–', v.fipe_pct ? v.fipe_pct.toFixed(0) + '%' : '–', v.margem != null ? brl(v.margem) : '–']),
          total: ['Total', '', '', '', '', brl(r.total.investido), brl(r.total.anunciado), brl(r.total.fipe), '', brl(r.total.anunciado - r.total.investido)] },
      ],
    });
    res.json(r);
  });
};
