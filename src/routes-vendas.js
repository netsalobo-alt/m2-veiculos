const crypto = require('crypto');
const { db, getSettings } = require('./db');
const { today, brl, descVeiculo, buildContext, renderTemplate, VARIAVEIS, FORMAS, dataBR } = require('./util');
const { bad } = require('./routes-cadastros');
const { enrich } = require('./routes-estoque');
const { documentoPDF } = require('./pdf');
const { sendMail } = require('./mail');

const TIPOS_DOC = {
  contrato_venda: 'Contrato de compra e venda', recibo_pagamento: 'Recibo de pagamento', recibo_compra: 'Recibo de compra',
  termo_garantia: 'Termo de garantia', termo_entrega: 'Termo de entrega', procuracao: 'Procuração', outro: 'Outro',
};

function baseUrl(req) {
  const s = getSettings();
  return (s.site_url || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
}
const soDigitos = (s) => String(s || '').replace(/\D/g, '');
function waNumber(tel) {
  let n = soDigitos(tel);
  if (!n) return '';
  if (n.length <= 11) n = '55' + n;
  return n;
}

module.exports = function (api, can) {
  // ---------------- vendas ----------------
  api.get('/vendas', can('vendas'), (req, res) => {
    const where = ['1=1'], p = [];
    if (req.query.de) { where.push('s.data_venda>=?'); p.push(req.query.de); }
    if (req.query.ate) { where.push('s.data_venda<=?'); p.push(req.query.ate); }
    if (req.query.status) { where.push('s.status=?'); p.push(req.query.status); }
    if (req.user.perfil === 'vendedor' && req.query.minhas) { where.push('s.vendedor_id=?'); p.push(req.user.id); }
    const rows = db.prepare(`SELECT s.*, c.nome cliente_nome, c.telefone cliente_telefone, u.nome vendedor_nome,
        v.marca, v.modelo, v.versao, v.placa, v.categoria, v.ano_mod
      FROM vendas s JOIN pessoas c ON c.id=s.cliente_id JOIN veiculos v ON v.id=s.veiculo_id LEFT JOIN users u ON u.id=s.vendedor_id
      WHERE ${where.join(' AND ')} ORDER BY s.data_venda DESC, s.id DESC`).all(...p);
    const verCusto = req.user.perms.includes('custos');
    res.json(rows.map((r) => {
      if (!verCusto) return r;
      const v = enrich(db.prepare('SELECT * FROM veiculos WHERE id=?').get(r.veiculo_id));
      return { ...r, custo_total: v.custo_total, lucro: r.valor_venda - v.custo_total - (r.comissao_valor || 0) };
    }));
  });

  api.get('/vendas/:id', can('vendas'), (req, res) => {
    const s = db.prepare(`SELECT s.*, c.nome cliente_nome, c.telefone cliente_telefone, c.email cliente_email, c.cpf_cnpj cliente_doc, u.nome vendedor_nome
      FROM vendas s JOIN pessoas c ON c.id=s.cliente_id LEFT JOIN users u ON u.id=s.vendedor_id WHERE s.id=?`).get(req.params.id);
    if (!s) return res.status(404).json({ error: 'Venda não encontrada.' });
    s.veiculo = enrich(db.prepare('SELECT * FROM veiculos WHERE id=?').get(s.veiculo_id));
    s.pagamentos = db.prepare('SELECT * FROM venda_pagamentos WHERE venda_id=? ORDER BY id').all(s.id);
    s.troca = s.veiculo_troca_id ? db.prepare('SELECT id,marca,modelo,versao,placa,ano_mod,valor_compra FROM veiculos WHERE id=?').get(s.veiculo_troca_id) : null;
    s.documentos = db.prepare('SELECT id,titulo,tipo,status,criado_em,assinado_em FROM documentos WHERE venda_id=? ORDER BY id DESC').all(s.id);
    s.lancamentos = db.prepare('SELECT id,tipo,descricao,valor,vencimento,status FROM lancamentos WHERE venda_id=? ORDER BY vencimento').all(s.id);
    if (req.user.perms.includes('custos')) s.lucro = s.valor_venda - s.veiculo.custo_total - (s.comissao_valor || 0);
    else { delete s.veiculo.valor_compra; delete s.veiculo.custo_total; delete s.veiculo.custos_total; delete s.veiculo.margem; }
    res.json(s);
  });

  api.post('/vendas', can('vendas'), (req, res) => {
    const b = req.body || {};
    const v = db.prepare('SELECT * FROM veiculos WHERE id=?').get(b.veiculo_id);
    if (!v) throw bad('Selecione o veículo.');
    if (v.status === 'vendido') throw bad('Este veículo já foi vendido.');
    if (!b.cliente_id) throw bad('Selecione o cliente.');
    const valor = Number(b.valor_venda);
    if (!(valor > 0)) throw bad('Informe o valor da venda.');
    const pags = (b.pagamentos || []).filter((x) => Number(x.valor) > 0);
    const soma = pags.reduce((a, x) => a + Number(x.valor), 0);
    if (Math.abs(soma - valor) > 0.009) throw bad(`A soma das formas de pagamento (${brl(soma)}) precisa ser igual ao valor da venda (${brl(valor)}).`);
    const troca = pags.find((x) => x.forma === 'troca');
    if (troca && !(b.troca && b.troca.marca && b.troca.modelo)) throw bad('Informe marca e modelo do veículo recebido na troca.');
    const data = b.data_venda || today();
    const conta = db.prepare("SELECT id FROM contas WHERE ativo=1 AND tipo='banco' ORDER BY id LIMIT 1").get() || db.prepare('SELECT id FROM contas WHERE ativo=1 ORDER BY id LIMIT 1').get();

    const id = db.transaction(() => {
      let trocaId = null;
      if (troca) {
        const t = b.troca;
        trocaId = db.prepare(`INSERT INTO veiculos(categoria,marca,modelo,versao,ano_fab,ano_mod,placa,renavam,chassi,cor,km,combustivel,cambio,data_entrada,fornecedor_id,origem,valor_compra,compra_pago,status)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'troca',?,1,'preparacao')`)
          .run(t.categoria || 'carro', t.marca, t.modelo, t.versao || null, t.ano_fab || null, t.ano_mod || null, t.placa || null, t.renavam || null, t.chassi || null, t.cor || null, t.km || null, t.combustivel || null, t.cambio || null, data, b.cliente_id, Number(troca.valor)).lastInsertRowid;
      }
      const vid = db.prepare(`INSERT INTO vendas(veiculo_id,cliente_id,vendedor_id,data_venda,valor_venda,valor_troca,veiculo_troca_id,financeira,comissao_valor,garantia_dias,observacoes)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(v.id, b.cliente_id, b.vendedor_id || req.user.id, data, valor, troca ? Number(troca.valor) : 0, trocaId, b.financeira || null, Number(b.comissao_valor) || 0, b.garantia_dias ?? 90, b.observacoes || null).lastInsertRowid;
      const insP = db.prepare('INSERT INTO venda_pagamentos(venda_id,forma,valor,vencimento,pago,descricao) VALUES (?,?,?,?,?,?)');
      const insL = db.prepare(`INSERT INTO lancamentos(tipo,descricao,categoria,valor,vencimento,data_pagamento,status,conta_id,forma,veiculo_id,venda_id,pessoa_id,criado_por)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
      const label = `${descVeiculo(v)}${v.placa ? ' (' + v.placa + ')' : ''}`;
      for (const pg of pags) {
        const pago = pg.forma === 'troca' ? 1 : pg.pago ? 1 : 0;
        const venc = pg.vencimento || data;
        insP.run(vid, pg.forma, Number(pg.valor), venc, pago, pg.descricao || null);
        if (pg.forma === 'troca') continue; // troca não movimenta caixa: vira veículo no estoque
        insL.run('entrada', `Venda ${label} – ${FORMAS[pg.forma] || pg.forma}${pg.descricao ? ' ' + pg.descricao : ''}`, 'Venda de veículos', Number(pg.valor), venc, pago ? venc : null, pago ? 'pago' : 'pendente', conta && conta.id, pg.forma, v.id, vid, b.cliente_id, req.user.id);
      }
      if (Number(b.comissao_valor) > 0) {
        const vend = db.prepare('SELECT nome FROM users WHERE id=?').get(b.vendedor_id || req.user.id);
        insL.run('saida', `Comissão ${vend ? vend.nome : ''} – venda ${label}`, 'Comissões', Number(b.comissao_valor), data, null, 'pendente', conta && conta.id, null, v.id, vid, null, req.user.id);
      }
      db.prepare("UPDATE veiculos SET status='vendido', data_venda=?, publicado=0 WHERE id=?").run(data, v.id);
      db.prepare("UPDATE leads SET status='convertido' WHERE veiculo_id=? AND status IN ('novo','em_contato')").run(v.id);
      return vid;
    })();
    require('./routes-olx').aoVender(v.id); // tira o anúncio da OLX em segundo plano
    res.json({ id });
  });

  api.post('/vendas/:id/cancelar', can('vendas'), (req, res) => {
    if (!['admin', 'gerente'].includes(req.user.perfil)) throw bad('Apenas administradores ou gerentes podem cancelar vendas.', 403);
    const s = db.prepare('SELECT * FROM vendas WHERE id=?').get(req.params.id);
    if (!s || s.status === 'cancelada') throw bad('Venda não encontrada ou já cancelada.');
    db.transaction(() => {
      db.prepare("UPDATE vendas SET status='cancelada', observacoes=COALESCE(observacoes,'')||? WHERE id=?").run(`\nCancelada em ${dataBR(today())} por ${req.user.nome}. ${req.body.motivo || ''}`, s.id);
      db.prepare("UPDATE lancamentos SET status='cancelado' WHERE venda_id=?").run(s.id);
      db.prepare("UPDATE veiculos SET status='disponivel', data_venda=NULL WHERE id=?").run(s.veiculo_id);
    })();
    res.json({ ok: true });
  });

  // ---------------- modelos ----------------
  api.get('/modelos', can('documentos'), (req, res) => res.json(db.prepare('SELECT * FROM modelos ORDER BY ativo DESC, nome').all()));
  api.get('/modelos/variaveis', can('documentos'), (req, res) => res.json({ variaveis: VARIAVEIS, tipos: TIPOS_DOC }));
  api.post('/modelos', can('documentos'), (req, res) => {
    const { nome, tipo, conteudo } = req.body || {};
    if (!nome || !conteudo) throw bad('Informe nome e conteúdo do modelo.');
    res.json({ id: db.prepare('INSERT INTO modelos(nome,tipo,conteudo) VALUES (?,?,?)').run(nome, tipo || 'outro', conteudo).lastInsertRowid });
  });
  api.put('/modelos/:id', can('documentos'), (req, res) => {
    const { nome, tipo, conteudo, ativo } = req.body || {};
    db.prepare("UPDATE modelos SET nome=COALESCE(?,nome), tipo=COALESCE(?,tipo), conteudo=COALESCE(?,conteudo), ativo=COALESCE(?,ativo), atualizado_em=datetime('now','localtime') WHERE id=?")
      .run(nome || null, tipo || null, conteudo || null, ativo == null ? null : ativo ? 1 : 0, req.params.id);
    res.json({ ok: true });
  });
  api.delete('/modelos/:id', can('documentos'), (req, res) => {
    db.prepare('DELETE FROM modelos WHERE id=?').run(req.params.id);
    res.json({ ok: true });
  });

  // ---------------- documentos ----------------
  api.get('/documentos', can('documentos'), (req, res) => {
    const q = `%${req.query.q || ''}%`;
    res.json(db.prepare(`SELECT d.id,d.titulo,d.tipo,d.status,d.criado_em,d.assinado_em,d.enviado_email_em,d.enviado_whatsapp_em,d.venda_id,d.veiculo_id,
        p.nome pessoa_nome, p.telefone pessoa_telefone, p.email pessoa_email
      FROM documentos d LEFT JOIN pessoas p ON p.id=d.pessoa_id WHERE d.titulo LIKE ? OR IFNULL(p.nome,'') LIKE ? ORDER BY d.id DESC LIMIT 500`).all(q, q));
  });
  api.get('/documentos/:id', can('documentos'), (req, res) => {
    const d = db.prepare(`SELECT d.*, p.nome pessoa_nome, p.telefone pessoa_telefone, p.email pessoa_email FROM documentos d LEFT JOIN pessoas p ON p.id=d.pessoa_id WHERE d.id=?`).get(req.params.id);
    if (!d) return res.status(404).json({ error: 'Documento não encontrado.' });
    d.link_assinatura = `${baseUrl(req)}/assinar/${d.token}`;
    res.json(d);
  });
  api.post('/documentos', can('documentos'), (req, res) => {
    const { modelo_id, venda_id, veiculo_id, pessoa_id, titulo } = req.body || {};
    const m = db.prepare('SELECT * FROM modelos WHERE id=?').get(modelo_id);
    if (!m) throw bad('Selecione um modelo.');
    let vId = veiculo_id || null, pId = pessoa_id || null;
    if (venda_id) {
      const s = db.prepare('SELECT * FROM vendas WHERE id=?').get(venda_id);
      if (!s) throw bad('Venda não encontrada.');
      vId = vId || s.veiculo_id; pId = pId || s.cliente_id;
    }
    if (m.tipo === 'recibo_compra' && vId && !pId) {
      const v = db.prepare('SELECT fornecedor_id FROM veiculos WHERE id=?').get(vId);
      pId = v && v.fornecedor_id;
    }
    const ctx = buildContext({ venda_id, veiculo_id: vId, pessoa_id: m.tipo === 'recibo_compra' ? null : pId });
    const conteudo = renderTemplate(m.conteudo, ctx);
    const v = vId ? db.prepare('SELECT * FROM veiculos WHERE id=?').get(vId) : null;
    const t = titulo || `${m.nome}${v ? ' – ' + descVeiculo(v) : ''}`;
    const r = db.prepare('INSERT INTO documentos(modelo_id,tipo,titulo,venda_id,veiculo_id,pessoa_id,conteudo,token,criado_por) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(m.id, m.tipo, t, venda_id || null, vId, pId, conteudo, crypto.randomBytes(18).toString('base64url'), req.user.id);
    res.json({ id: r.lastInsertRowid });
  });
  api.put('/documentos/:id', can('documentos'), (req, res) => {
    const d = db.prepare('SELECT * FROM documentos WHERE id=?').get(req.params.id);
    if (!d) return res.status(404).end();
    if (d.assinado_em) throw bad('Documento assinado não pode ser alterado.');
    db.prepare('UPDATE documentos SET titulo=COALESCE(?,titulo), conteudo=COALESCE(?,conteudo) WHERE id=?').run(req.body.titulo || null, req.body.conteudo || null, d.id);
    res.json({ ok: true });
  });
  api.delete('/documentos/:id', can('documentos'), (req, res) => {
    db.prepare('DELETE FROM documentos WHERE id=?').run(req.params.id);
    res.json({ ok: true });
  });
  api.get('/documentos/:id/pdf', can('documentos'), async (req, res) => {
    const d = db.prepare('SELECT * FROM documentos WHERE id=?').get(req.params.id);
    if (!d) return res.status(404).end();
    const buf = await documentoPDF(d, buildContext(d.tipo === 'recibo_compra' ? { veiculo_id: d.veiculo_id } : d));
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `${req.query.download ? 'attachment' : 'inline'}; filename="${d.titulo.replace(/[^\w\- ]+/g, '').slice(0, 60) || 'documento'}.pdf"`);
    res.send(buf);
  });
  api.post('/documentos/:id/email', can('documentos'), async (req, res) => {
    const d = db.prepare('SELECT d.*, p.email pessoa_email, p.nome pessoa_nome FROM documentos d LEFT JOIN pessoas p ON p.id=d.pessoa_id WHERE d.id=?').get(req.params.id);
    if (!d) return res.status(404).end();
    const s = getSettings();
    const to = req.body.to || d.pessoa_email;
    const link = `${baseUrl(req)}/assinar/${d.token}`;
    const incluirLink = req.body.incluir_link !== false && !d.assinado_em;
    const msg = (req.body.mensagem || `Olá${d.pessoa_nome ? ', ' + d.pessoa_nome.split(' ')[0] : ''}!\n\nSegue em anexo o documento "${d.titulo}".`) + (incluirLink ? `\n\nPara assinar eletronicamente, acesse: ${link}` : '') + `\n\n${s.empresa_nome}${s.telefone ? '\n' + s.telefone : ''}`;
    const pdf = await documentoPDF(d, buildContext(d.tipo === 'recibo_compra' ? { veiculo_id: d.veiculo_id } : d));
    await sendMail({ to, subject: req.body.assunto || `${d.titulo} – ${s.empresa_nome}`, text: msg, attachments: [{ filename: `documento-${d.id}.pdf`, content: pdf }] });
    db.prepare("UPDATE documentos SET enviado_email_em=datetime('now','localtime'), status=CASE WHEN status='gerado' THEN 'enviado' ELSE status END WHERE id=?").run(d.id);
    res.json({ ok: true, to });
  });
  api.post('/documentos/:id/whatsapp', can('documentos'), (req, res) => {
    const d = db.prepare('SELECT d.*, p.telefone pessoa_telefone, p.nome pessoa_nome FROM documentos d LEFT JOIN pessoas p ON p.id=d.pessoa_id WHERE d.id=?').get(req.params.id);
    if (!d) return res.status(404).end();
    const s = getSettings();
    const tel = waNumber(req.body.telefone || d.pessoa_telefone);
    const link = `${baseUrl(req)}/assinar/${d.token}`;
    const nome = d.pessoa_nome ? d.pessoa_nome.split(' ')[0] : '';
    const texto = d.assinado_em
      ? `Olá${nome ? ', ' + nome : ''}! Aqui está o seu documento "${d.titulo}" assinado: ${link}\n\n${s.empresa_nome}`
      : `Olá${nome ? ', ' + nome : ''}! Aqui é da ${s.empresa_nome}. Segue o link para ler e assinar o documento "${d.titulo}":\n${link}\n\nQualquer dúvida, é só responder esta mensagem.`;
    db.prepare("UPDATE documentos SET enviado_whatsapp_em=datetime('now','localtime'), status=CASE WHEN status='gerado' THEN 'enviado' ELSE status END WHERE id=?").run(d.id);
    res.json({ url: `https://wa.me/${tel}?text=${encodeURIComponent(texto)}`, link, telefone: tel });
  });
};
module.exports.waNumber = waNumber;
