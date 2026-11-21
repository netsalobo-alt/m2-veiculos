// Módulo fiscal: emissão de NF-e pela API da Notavia (https://app.notavia.com.br/devs).
// Fluxo: monta o pedido a partir da venda → cadastra o veículo como produto → POST /emissoes (fica na fila) →
// consulta o job até concluir → baixa XML e DANFE. Os impostos são calculados pela Notavia, pela matriz
// configurada no portal dela (contador). Aqui não se calcula imposto.
const fs = require('fs');
const path = require('path');
const { db, DATA_DIR, getSettings } = require('./db');
const { descVeiculo } = require('./util');
const { bad } = require('./routes-cadastros');

const DIR = path.join(DATA_DIR, 'uploads', 'fiscal'); // protegido: /uploads/fiscal não é servido como estático
const so = (s) => String(s || '').replace(/\D/g, '');
// formas de pagamento do sistema → código tPag da SEFAZ
const TPAG = { dinheiro: '01', cheque: '02', cartao_credito: '03', cartao_debito: '04', boleto: '15', pix: '17', transferencia: '18', financiamento: '99', troca: '99', outro: '99' };
const STATUS_TXT = { pendente: 'Na fila', processando: 'Transmitindo', autorizada: 'Aprovada', rejeitada: 'Rejeitada', falha: 'Falha', cancelada: 'Cancelada' };

function cfg() {
  const s = getSettings();
  return {
    chave: s.notavia_api_key || process.env.NOTAVIA_API_KEY || '',
    url: (s.notavia_url || process.env.NOTAVIA_URL || 'https://app.notavia.com.br').replace(/\/+$/, ''),
    ambiente: s.notavia_ambiente === 'producao' ? 'producao' : 'homologacao',
    cnpj: so(s.notavia_cnpj || s.cnpj),
    serie: s.notavia_serie ? Number(s.notavia_serie) : null,
    opVenda: (s.notavia_op_venda || '').trim(),
    ncm: { carro: so(s.notavia_ncm_carro), moto: so(s.notavia_ncm_moto), bike: so(s.notavia_ncm_bike) },
    cest: { carro: so(s.notavia_cest_carro), moto: so(s.notavia_cest_moto), bike: so(s.notavia_cest_bike) },
  };
}

// chamada à API de integração da Notavia, com mensagens claras em português
async function notavia(method, rota, body, { binario = false } = {}) {
  const c = cfg();
  if (!c.chave) throw bad('A emissão de NF-e não está configurada. Cole a chave da Notavia em Configurações → Fiscal.');
  let r;
  try {
    r = await fetch(`${c.url}/api/integracao${rota}`, {
      method, headers: { 'X-Api-Key': c.chave, ...(body ? { 'content-type': 'application/json' } : {}), accept: binario ? '*/*' : 'application/json' },
      body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000),
    });
  } catch (e) { throw bad('Sem conexão com a Notavia agora. Tente de novo em instantes.'); }
  if (r.ok) return binario ? Buffer.from(await r.arrayBuffer()) : (r.status === 204 ? null : r.json().catch(() => null));
  let j = null; try { j = await r.json(); } catch (e) { /* sem corpo */ }
  const detalhe = j && (j.errors ? Object.entries(j.errors).map(([k, v]) => `${k}: ${[].concat(v).join(', ')}`).join('; ') : j.detail || j.title || j.erro || j.message);
  if (r.status === 401) throw bad('A chave da Notavia é inválida ou foi revogada. Confira em Configurações → Fiscal.');
  if (r.status === 403) throw bad('A chave da Notavia não tem acesso a este recurso.');
  if (r.status === 402) throw bad('A cota de emissão do seu plano na Notavia acabou por hoje (o plano Free permite 3 NF-e por dia em produção).');
  if (r.status === 429) throw bad(`Muitas requisições à Notavia. Tente de novo em ${r.headers.get('retry-after') || 60} segundos.`);
  if (r.status === 404 && binario) { const e = bad('Arquivo ainda não disponível na Notavia.'); e.status = 404; throw e; }
  if (r.status === 409) { const e = bad('A nota não tem XML autorizado (provavelmente foi rejeitada).'); e.status = 409; throw e; }
  if (r.status >= 500) throw bad('A Notavia está com instabilidade. Tente de novo em alguns minutos.');
  throw bad(`A Notavia recusou o pedido${detalhe ? ': ' + detalhe : '.'}`);
}

// código IBGE do município pelo CEP (ViaCEP, gratuito). Guarda no cadastro do cliente.
async function ibgeDoCep(cep) {
  const c = so(cep); if (c.length !== 8) return null;
  try { const r = await fetch(`https://viacep.com.br/ws/${c}/json/`, { signal: AbortSignal.timeout(6000) }); const j = await r.json(); return j && j.ibge ? String(j.ibge) : null; } catch (e) { return null; }
}

function descricaoProduto(v) {
  const base = `VEICULO USADO ${descVeiculo(v)}${v.ano_fab || v.ano_mod ? ` ${v.ano_fab || ''}/${v.ano_mod || ''}` : ''}${v.cor ? ' ' + v.cor : ''}`;
  return base.toUpperCase().replace(/\s+/g, ' ').trim().slice(0, 120);
}
function infoVeiculo(v) {
  return [v.chassi && `CHASSI ${v.chassi}`, v.renavam && `RENAVAM ${v.renavam}`, v.placa && `PLACA ${v.placa}`, v.km != null && `KM ${v.km}`, v.combustivel && `COMBUSTIVEL ${v.combustivel}`, v.motor && `MOTOR ${v.motor}`]
    .filter(Boolean).join(' - ').toUpperCase().slice(0, 500);
}

// dados da venda + lista do que falta para emitir
function dadosVenda(vendaId) {
  const s = db.prepare('SELECT * FROM vendas WHERE id=?').get(vendaId);
  if (!s) throw bad('Venda não encontrada.', 404);
  const v = db.prepare('SELECT * FROM veiculos WHERE id=?').get(s.veiculo_id);
  const p = db.prepare('SELECT * FROM pessoas WHERE id=?').get(s.cliente_id);
  const pags = db.prepare('SELECT * FROM venda_pagamentos WHERE venda_id=? ORDER BY id').all(s.id);
  const c = cfg();
  const doc = so(p && p.cpf_cnpj);
  const ncm = so(v.ncm) || c.ncm[v.categoria] || '';
  const pend = [];
  if (!c.chave) pend.push({ campo: 'config', msg: 'Chave da Notavia não configurada (Configurações → Fiscal).' });
  if (c.cnpj.length !== 14) pend.push({ campo: 'config', msg: 'CNPJ do emitente não configurado (Configurações → Fiscal ou Dados da empresa).' });
  if (!c.opVenda) pend.push({ campo: 'config', msg: 'Código da operação fiscal de venda não configurado (Configurações → Fiscal).' });
  // em produção a série é obrigatória: sem ela a Notavia usa a série padrão do emitente, que pode ser a de outro sistema
  if (c.ambiente === 'producao' && !c.serie) pend.push({ campo: 'config', msg: 'Em produção, informe a série da NF-e (Configurações → Fiscal) para não usar a série padrão do emitente.' });
  if (s.status === 'cancelada') pend.push({ campo: 'venda', msg: 'A venda está cancelada.' });
  if (ncm.length !== 8) pend.push({ campo: 'veiculo', msg: `NCM do veículo não definido (Configurações → Fiscal, NCM de ${({ carro: 'carro', moto: 'moto', bike: 'bike elétrica' })[v.categoria] || v.categoria}).` });
  if (!v.chassi) pend.push({ campo: 'veiculo', msg: 'Veículo sem chassi cadastrado.' });
  if (![11, 14].includes(doc.length)) pend.push({ campo: 'cliente', msg: 'Cliente sem CPF/CNPJ válido.' });
  for (const [k, nome] of [['endereco', 'logradouro'], ['numero', 'número'], ['bairro', 'bairro'], ['cidade', 'cidade'], ['uf', 'UF']]) if (!p || !String(p[k] || '').trim()) pend.push({ campo: 'cliente', msg: `Endereço do cliente sem ${nome}.` });
  if (!p || so(p.cep).length !== 8) pend.push({ campo: 'cliente', msg: 'Cliente sem CEP válido.' });
  const ativa = db.prepare("SELECT * FROM notas_fiscais WHERE venda_id=? AND status IN ('pendente','processando','autorizada') ORDER BY id DESC").get(s.id);
  if (ativa) pend.push({ campo: 'nota', msg: ativa.status === 'autorizada' ? `Esta venda já tem a NF-e nº ${ativa.numero} aprovada.` : 'Já existe uma NF-e desta venda em processamento.' });
  return { s, v, p, pags, c, doc, ncm, pend };
}

function montarPedido({ s, v, p, pags, c, doc, ncm }, referencia, ibge) {
  const pagamentos = (pags.length ? pags : [{ forma: 'outro', valor: s.valor_venda, pago: 1 }])
    .map((g) => ({ forma: TPAG[g.forma] || '99', valor: Math.round(g.valor * 100) / 100, aVista: !!g.pago || g.forma === 'troca' }));
  const pj = doc.length === 14;
  // inscrição estadual só para empresa (o cadastro usa o campo "RG / IE")
  const ie = pj ? so(p.inscricao_estadual || p.rg) : '';
  return {
    referenciaExterna: referencia,
    cnpjEmitente: c.cnpj,
    cpfCnpjCliente: doc,
    codigoOperacao: c.opVenda,
    ...(c.serie ? { serie: c.serie } : {}),
    ambiente: c.ambiente,
    itens: [{ codigoProduto: `V${v.id}`, quantidade: 1, valorUnitario: Math.round(s.valor_venda * 100) / 100, infoAdicional: infoVeiculo(v) || null }],
    pagamentos,
    observacoes: [`Venda nº ${s.id} - ${descVeiculo(v)}${v.placa ? ' placa ' + v.placa : ''}.`, s.valor_troca > 0 ? `Veículo recebido na troca como parte do pagamento: R$ ${Number(s.valor_troca).toFixed(2).replace('.', ',')}.` : '']
      .filter(Boolean).join(' ').slice(0, 2000),
    cliente: {
      nome: p.nome, email: p.email || null, telefone: p.telefone || null,
      tipoPessoa: pj ? 1 : 0, indicadorIe: ie ? 1 : 9, inscricaoEstadual: ie || null,
      endereco: { logradouro: p.endereco, numero: p.numero, complemento: p.complemento || null, bairro: p.bairro, municipio: p.cidade, uf: String(p.uf || '').toUpperCase(), cep: so(p.cep), codigoMunicipioIbge: ibge || null },
    },
  };
}

async function emitirVenda(vendaId, userId) {
  const d = dadosVenda(vendaId);
  if (d.pend.length) throw bad(`Não dá para emitir ainda: ${d.pend.map((x) => x.msg).join(' ')}`);
  // código IBGE do município (cacheado no cadastro)
  // guardado como "CEP|IBGE": se o CEP do cliente mudar, busca de novo
  const [cepCache, ibgeCache] = String(d.p.municipio_ibge || '').split('|');
  let ibge = cepCache === so(d.p.cep) ? ibgeCache : null;
  if (!ibge) { ibge = await ibgeDoCep(d.p.cep); if (ibge) db.prepare('UPDATE pessoas SET municipio_ibge=? WHERE id=?').run(`${so(d.p.cep)}|${ibge}`, d.p.id); }
  // cadastra/atualiza o veículo como produto na Notavia (upsert idempotente)
  await notavia('PUT', `/produtos/V${d.v.id}`, {
    codigo: `V${d.v.id}`, descricao: descricaoProduto(d.v), ncm: d.ncm, cest: d.c.cest[d.v.categoria] || null, unidadeComercial: 'UN', gtin: null,
    valorUnitario: Math.round(d.s.valor_venda * 100) / 100, origemMercadoria: 0, grupoProdutoId: null,
  });
  const nota = db.prepare(`INSERT INTO notas_fiscais(venda_id,veiculo_id,pessoa_id,natureza,operacao_codigo,ambiente,referencia,status,valor,destinatario,cpf_cnpj,criado_por)
    VALUES (?,?,?,?,?,?,?,'pendente',?,?,?,?)`).run(d.s.id, d.v.id, d.p.id, 'Venda de veículo', d.c.opVenda, d.c.ambiente, `tmp-${Date.now()}-${Math.random()}`, d.s.valor_venda, d.p.nome, d.doc, userId);
  const id = Number(nota.lastInsertRowid);
  // única de verdade: a Notavia devolve o job antigo se a referência se repetir (ex.: banco restaurado de backup)
  const referencia = `m2-venda-${d.s.id}-nf-${id}-${Date.now().toString(36)}`;
  const pedido = montarPedido(d, referencia, ibge);
  db.prepare('UPDATE notas_fiscais SET referencia=?, payload=? WHERE id=?').run(referencia, JSON.stringify(pedido), id);
  try {
    const r = await notavia('POST', '/emissoes', pedido);
    db.prepare("UPDATE notas_fiscais SET job_id=?, status=?, resposta=?, atualizado_em=datetime('now','localtime') WHERE id=?")
      .run(r && r.jobId, mapStatusJob(r && r.status) || 'pendente', JSON.stringify(r), id);
  } catch (e) {
    db.prepare("UPDATE notas_fiscais SET status='falha', motivo=?, atualizado_em=datetime('now','localtime') WHERE id=?").run(e.publicMessage || e.message, id);
    throw e;
  }
  setTimeout(() => atualizar(id).catch(() => {}), 3000); // a maioria conclui em poucos segundos
  return db.prepare('SELECT * FROM notas_fiscais WHERE id=?').get(id);
}

const mapStatusJob = (st) => ({ Pendente: 'pendente', Processando: 'processando' })[st] || null;

// consulta o job e atualiza a nota; quando aprovada, baixa XML e DANFE
async function atualizar(id) {
  const n = db.prepare('SELECT * FROM notas_fiscais WHERE id=?').get(id);
  if (!n) throw bad('Nota não encontrada.', 404);
  if (['pendente', 'processando'].includes(n.status) && n.job_id) {
    const j = await notavia('GET', `/emissoes/${encodeURIComponent(n.job_id)}`);
    const upd = (campos) => {
      const ks = Object.keys(campos);
      db.prepare(`UPDATE notas_fiscais SET ${ks.map((k) => k + '=?').join(',')}, tentativas=tentativas+1, atualizado_em=datetime('now','localtime') WHERE id=?`).run(...ks.map((k) => campos[k]), id);
    };
    if (j.status === 'Falha') upd({ status: 'falha', motivo: j.erro || 'Falha na emissão', resposta: JSON.stringify(j) });
    else if (j.status === 'Concluido') {
      const r = j.resultado || {};
      if (['Rejeitada', 'Denegada'].includes(r.status)) upd({ status: 'rejeitada', cstat: r.cStat || null, motivo: [r.motivo, r.orientacao && (r.orientacao.mensagem || r.orientacao.texto || JSON.stringify(r.orientacao))].filter(Boolean).join(' — '), resposta: JSON.stringify(j) });
      else if (r.chaveAcesso) upd({ status: 'autorizada', chave: r.chaveAcesso, numero: r.numero || null, serie: r.serie || null, protocolo: r.protocolo || null, motivo: null, resposta: JSON.stringify(j), autorizada_em: (j.processadoEmUtc || new Date().toISOString()).slice(0, 19).replace('T', ' ') });
      else upd({ status: 'falha', motivo: 'Resposta da Notavia sem chave de acesso.', resposta: JSON.stringify(j) });
    } else upd({ status: mapStatusJob(j.status) || n.status, resposta: JSON.stringify(j) });
  }
  const atual = db.prepare('SELECT * FROM notas_fiscais WHERE id=?').get(id);
  if (atual.status === 'autorizada' && atual.chave && (!atual.xml_arquivo || !atual.danfe_arquivo)) await baixarArquivos(atual).catch(() => {});
  return db.prepare('SELECT * FROM notas_fiscais WHERE id=?').get(id);
}

async function baixarArquivos(n) {
  fs.mkdirSync(DIR, { recursive: true });
  const ch = so(n.chave);
  if (!n.xml_arquivo) { const b = await notavia('GET', `/notas/${ch}/xml`, null, { binario: true }); fs.writeFileSync(path.join(DIR, `${ch}-nfe.xml`), b); db.prepare('UPDATE notas_fiscais SET xml_arquivo=? WHERE id=?').run(`${ch}-nfe.xml`, n.id); }
  if (!n.danfe_arquivo) { const b = await notavia('GET', `/notas/${ch}/danfe`, null, { binario: true }); fs.writeFileSync(path.join(DIR, `${ch}-danfe.pdf`), b); db.prepare('UPDATE notas_fiscais SET danfe_arquivo=? WHERE id=?').run(`${ch}-danfe.pdf`, n.id); }
}

// acompanhamento automático: notas na fila são consultadas a cada 20 s (até 2 dias); aprovadas sem arquivo tentam baixar
function agendar() {
  setInterval(async () => {
    if (!cfg().chave) return;
    const fila = db.prepare(`SELECT id FROM notas_fiscais WHERE (status IN ('pendente','processando') AND job_id IS NOT NULL AND criado_em >= datetime('now','localtime','-2 days'))
      OR (status='autorizada' AND (xml_arquivo IS NULL OR danfe_arquivo IS NULL) AND tentativas < 60) ORDER BY id LIMIT 10`).all();
    for (const { id } of fila) { try { await atualizar(id); } catch (e) { /* tenta na próxima rodada */ } }
  }, 20000).unref();
}

const publica = (n) => n && ({ ...n, payload: undefined, resposta: undefined, status_txt: STATUS_TXT[n.status] || n.status, tem_xml: !!n.xml_arquivo, tem_danfe: !!n.danfe_arquivo });

function rotas(api, can) {
  api.get('/fiscal/notas', can('fiscal'), (req, res) => {
    const w = ['1=1'], p = [];
    if (/^\d{4}-\d{2}$/.test(req.query.mes || '')) { w.push("substr(n.criado_em,1,7)=?"); p.push(req.query.mes); }
    if (req.query.status) { w.push('n.status=?'); p.push(req.query.status); }
    if (req.query.ambiente) { w.push('n.ambiente=?'); p.push(req.query.ambiente); }
    if (req.query.q) { w.push("(IFNULL(n.destinatario,'') LIKE ? OR IFNULL(n.chave,'') LIKE ? OR CAST(IFNULL(n.numero,'') AS TEXT) LIKE ? OR IFNULL(v.placa,'') LIKE ?)"); p.push(...Array(4).fill(`%${req.query.q}%`)); }
    const rows = db.prepare(`SELECT n.*, v.marca, v.modelo, v.versao, v.placa FROM notas_fiscais n LEFT JOIN veiculos v ON v.id=n.veiculo_id
      WHERE ${w.join(' AND ')} ORDER BY n.id DESC LIMIT 1000`).all(...p);
    res.json(rows.map((r) => ({ ...publica(r), veiculo: r.marca ? descVeiculo(r) : null })));
  });
  api.get('/fiscal/notas/:id', can('fiscal'), (req, res) => {
    const n = db.prepare('SELECT * FROM notas_fiscais WHERE id=?').get(req.params.id);
    if (!n) return res.status(404).json({ error: 'Nota não encontrada.' });
    const v = n.veiculo_id ? db.prepare('SELECT * FROM veiculos WHERE id=?').get(n.veiculo_id) : null;
    let pedido = null; try { pedido = JSON.parse(n.payload || 'null'); } catch (e) { /* */ }
    res.json({ ...publica(n), veiculo: v ? descVeiculo(v) : null, placa: v && v.placa, pedido });
  });
  api.post('/fiscal/notas/:id/atualizar', can('fiscal'), async (req, res, next) => { try { res.json(publica(await atualizar(Number(req.params.id)))); } catch (e) { next(e); } });
  api.get('/fiscal/vendas/:id/previa', can('fiscal'), (req, res) => {
    const d = dadosVenda(Number(req.params.id));
    res.json({ pendencias: d.pend, ambiente: d.c.ambiente, valor: d.s.valor_venda, cliente: d.p && { nome: d.p.nome, cpf_cnpj: d.p.cpf_cnpj, cidade: d.p.cidade, uf: d.p.uf }, veiculo: { descricao: descricaoProduto(d.v), info: infoVeiculo(d.v), ncm: d.ncm },
      pagamentos: d.pags.map((g) => ({ forma: g.forma, valor: g.valor, tpag: TPAG[g.forma] || '99' })), operacao: d.c.opVenda,
      notas: db.prepare('SELECT id,numero,serie,status,ambiente,criado_em,motivo FROM notas_fiscais WHERE venda_id=? ORDER BY id DESC').all(d.s.id).map((n) => ({ ...n, status_txt: STATUS_TXT[n.status] })) });
  });
  api.post('/fiscal/vendas/:id/emitir', can('fiscal'), async (req, res, next) => { try { res.json(publica(await emitirVenda(Number(req.params.id), req.user.id))); } catch (e) { next(e); } });
  // arquivos: do disco; se ainda não baixou, busca na Notavia na hora
  const arquivo = (tipo) => async (req, res, next) => {
    try {
      let n = db.prepare('SELECT * FROM notas_fiscais WHERE id=?').get(req.params.id);
      if (!n || n.status !== 'autorizada' || !n.chave) return res.status(404).json({ error: 'A nota ainda não foi aprovada.' });
      const campo = tipo === 'xml' ? 'xml_arquivo' : 'danfe_arquivo';
      if (!n[campo]) { await baixarArquivos(n); n = db.prepare('SELECT * FROM notas_fiscais WHERE id=?').get(n.id); }
      const f = path.join(DIR, path.basename(n[campo]));
      res.setHeader('Content-Type', tipo === 'xml' ? 'application/xml' : 'application/pdf');
      res.setHeader('Content-Disposition', `${tipo === 'xml' || req.query.baixar ? 'attachment' : 'inline'}; filename="${path.basename(n[campo])}"`);
      fs.createReadStream(f).pipe(res);
    } catch (e) { next(e); }
  };
  // operações fiscais (ficam na Notavia; a API permite listar, criar e editar — excluir só no portal)
  api.get('/fiscal/operacoes', can('fiscal'), async (req, res, next) => {
    try {
      const todas = [];
      for (let pagina = 1; pagina <= 20; pagina++) {
        const r = await notavia('GET', `/operacoes-fiscais?pagina=${pagina}&tamanho=100`);
        const itens = (r && (r.items || r.itens)) || (Array.isArray(r) ? r : []);
        todas.push(...itens);
        if (!r || !r.total || todas.length >= r.total || !itens.length) break;
      }
      res.json({ operacoes: todas.sort((a, b) => String(a.codigo).localeCompare(String(b.codigo))), op_venda: cfg().opVenda });
    } catch (e) { next(e); }
  });
  api.put('/fiscal/operacoes/:codigo', can('config'), async (req, res, next) => {
    try {
      const b = req.body || {};
      const codigo = String(req.params.codigo || '').trim();
      const cfop = (v) => so(v);
      const d = {
        codigo, descricao: String(b.descricao || '').trim().slice(0, 120),
        tipoOperacao: Number(b.tipoOperacao) === 0 ? 0 : 1, finalidade: [1, 2, 3, 4].includes(Number(b.finalidade)) ? Number(b.finalidade) : 1,
        consumidorFinal: !!Number(b.consumidorFinal), cfopDentroEstado: cfop(b.cfopDentroEstado), cfopForaEstado: cfop(b.cfopForaEstado),
      };
      if (!/^[A-Za-z0-9_\-.]{1,40}$/.test(codigo)) throw bad('Código inválido: use letras, números, ponto, hífen ou sublinhado (até 40), sem espaços.');
      if (!d.descricao) throw bad('Informe a descrição (natureza da operação).');
      for (const [k, nome] of [['cfopDentroEstado', 'dentro do estado'], ['cfopForaEstado', 'fora do estado']]) if (!/^\d{4}$/.test(d[k])) throw bad(`CFOP ${nome} precisa ter 4 dígitos.`);
      // CFOP de entrada começa com 1/2/3; de saída com 5/6/7
      const ok = d.tipoOperacao === 0 ? /^[123]/ : /^[567]/;
      if (!ok.test(d.cfopDentroEstado) || !ok.test(d.cfopForaEstado)) throw bad(d.tipoOperacao === 0 ? 'Operação de entrada usa CFOP começando com 1, 2 ou 3.' : 'Operação de saída usa CFOP começando com 5, 6 ou 7.');
      const r = await notavia('PUT', `/operacoes-fiscais/${encodeURIComponent(codigo)}`, d);
      if (Number(b.usar_na_venda)) db.prepare("INSERT INTO settings(key,value) VALUES ('notavia_op_venda',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(codigo);
      res.json(r || d);
    } catch (e) { next(e); }
  });
  api.put('/fiscal/operacao-venda', can('config'), (req, res) => {
    const codigo = String((req.body || {}).codigo || '').trim();
    if (!codigo) throw bad('Escolha a operação.');
    db.prepare("INSERT INTO settings(key,value) VALUES ('notavia_op_venda',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(codigo);
    res.json({ ok: true });
  });
  api.get('/fiscal/notas/:id/xml', can('fiscal'), arquivo('xml'));
  api.get('/fiscal/notas/:id/danfe', can('fiscal'), arquivo('danfe'));
}

module.exports = { rotas, agendar, emitirVenda, atualizar, montarPedido, TPAG };
