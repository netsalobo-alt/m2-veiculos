// Integração com a OLX (API oficial "Autoupload" – developers.olx.com.br)
// - Conexão da conta da loja por OAuth (client_id/client_secret fornecidos pela OLX ao integrador)
// - Catálogo de marcas/modelos/versões da OLX e sugestão automática a partir do cadastro
// - Publicar / atualizar / tirar anúncio; consultar situação; remoção automática ao vender ou excluir
const crypto = require('crypto');
const { db, getSettings } = require('./db');
const { bad } = require('./routes-cadastros');

const AUTH = process.env.OLX_AUTH_URL || 'https://auth.olx.com.br';
const APPS = process.env.OLX_API_URL || 'https://apps.olx.com.br';

db.exec(`CREATE TABLE IF NOT EXISTS olx_anuncios (
  veiculo_id INTEGER PRIMARY KEY,
  ad_id TEXT NOT NULL,
  ativo INTEGER NOT NULL DEFAULT 0,
  marca_id TEXT, marca_nome TEXT, modelo_id TEXT, modelo_nome TEXT, versao_id TEXT, versao_nome TEXT,
  cilindrada_id TEXT, opcoes TEXT,
  status TEXT, mensagens TEXT, list_id TEXT, url TEXT, import_token TEXT, operacao TEXT,
  enviado_em TEXT, atualizado_em TEXT
)`);

const setS = db.prepare('INSERT INTO settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
const cfg = () => getSettings();
const digits = (s) => String(s || '').replace(/\D/g, '');
const agora = () => new Date().toISOString().slice(0, 19).replace('T', ' ');
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();

// mensagens da OLX em português simples
const ERROS = {
  NO_IMAGE: 'O anúncio precisa de pelo menos uma foto.',
  NO_REGION: 'CEP inválido. Confira o CEP da OLX em Configurações.',
  UNDEFINED_AD_ID: 'Identificação do anúncio inválida.',
  INVALID_PLATE: 'A OLX não reconheceu a placa (ou a validação de placas está fora do ar). Confira a placa.',
  ERROR_VEHICLE_TAG_INVALID: 'Placa inválida.',
  ERROR_VEHICLE_BRAND_INVALID: 'Marca não encontrada no catálogo da OLX. Escolha a marca novamente.',
  ERROR_VEHICLE_MODEL_INVALID: 'Modelo não encontrado no catálogo da OLX. Escolha o modelo novamente.',
  ERROR_VEHICLE_VERSION_INVALID: 'Versão não encontrada no catálogo da OLX. Escolha a versão novamente.',
  ERROR_VEHICLE_BRAND_MODEL_VERSION_INVALID: 'Marca, modelo e versão não combinam no catálogo da OLX. Escolha de novo.',
  ERROR_IMAGE_TOO_SMALL: 'Alguma foto é pequena demais para a OLX. Use fotos maiores (ex.: 1200×800).',
  NOT_ENOUGH_AD_SLOTS: 'O plano da OLX não tem mais vagas de anúncio.',
  REFUSED_SUSPECT_DUPLICATES: 'A OLX recusou por suspeita de anúncio duplicado.',
  REFUSED_GENERIC: 'A OLX recusou o anúncio na moderação. Veja os detalhes no painel da OLX.',
  ERROR_DOWNLOADING_IMAGE: 'A OLX não conseguiu baixar uma foto. Confira o "Endereço público do sistema" em Configurações.',
};
const STATUS_IMPORT = {
  '-1': 'Erro inesperado na OLX. Tente novamente.', '-2': 'Muitas requisições seguidas. Aguarde alguns minutos.', '-3': 'Nenhum anúncio para enviar.',
  '-4': 'A OLX recusou os dados do anúncio.', '-5': 'O serviço de importação da OLX está desativado no momento.',
  '-6': 'Sem permissão: a conta precisa de um plano profissional ativo e compatível na OLX.', '-7': 'O plano da OLX não tem vagas suficientes.', '-8': 'Limite de anúncios do plano excedido.',
};
const traduz = (m) => { const k = typeof m === 'string' ? m : m && (m.error || m.category || m.message); return ERROS[k] || (k ? String(k) : ''); };

// ---------- chamadas à OLX ----------
function token() {
  const t = cfg().olx_access_token;
  if (!t) throw bad('A conta da OLX não está conectada. Vá em Configurações → OLX e clique em "Conectar com a OLX".');
  return t;
}
async function olx(method, path, { body, bearer } = {}) {
  let r;
  try {
    r = await fetch(APPS + path, {
      method, signal: AbortSignal.timeout(30000),
      headers: { 'content-type': 'application/json', accept: 'application/json', ...(bearer ? { authorization: 'Bearer ' + bearer } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) { throw bad('Não foi possível falar com a OLX agora. Verifique a internet e tente novamente.', 502); }
  const txt = await r.text();
  let j = null; try { j = JSON.parse(txt); } catch (e) { /* resposta não-JSON */ }
  if (r.status === 401 || (j && j.reason === 'ACCESS_DENIED')) throw bad('A OLX recusou o acesso. Conecte a conta novamente em Configurações → OLX.', 401);
  if (r.status === 429) throw bad('A OLX limitou as consultas por alguns minutos. Tente de novo daqui a pouco.', 429);
  if (!r.ok) throw bad(`A OLX respondeu com erro (${r.status}). Tente novamente mais tarde.`, 502);
  return j;
}

// catálogo (cache de 12 h em memória)
const cache = new Map();
async function catalogo(path) {
  const c = cache.get(path);
  if (c && Date.now() - c.t < 12 * 3600e3) return c.data;
  const j = await olx('POST', '/autoupload/' + path, { body: { access_token: token() } });
  const data = (j && j.data) || {};
  const lista = path === 'moto_cubiccms_info'
    ? Object.entries(data).map(([id, nome]) => ({ id: String(id), nome: String(nome) }))
    : Object.entries(data).map(([nome, id]) => ({ id: String(id), nome: String(nome) })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  cache.set(path, { t: Date.now(), data: lista });
  return lista;
}
const base = (cat) => (cat === 'moto' ? 'moto_info' : 'car_info');

// sugestão automática de marca/modelo/versão a partir do cadastro do veículo
const ALIAS = { VW: 'VOLKSWAGEN', GM: 'CHEVROLET', 'MERCEDES': 'MERCEDES BENZ', 'CAOA CHERY': 'CHERY' };
function melhor(lista, alvo, extra = '') {
  const a = norm(ALIAS[norm(alvo)] || alvo);
  if (!a && !extra) return null;
  const m = a && (lista.find((x) => norm(x.nome) === a)
    || lista.find((x) => norm(x.nome).split(' - ').pop() === a || norm(x.nome).endsWith(' ' + a))
    || lista.find((x) => norm(x.nome).startsWith(a + ' ') || a.startsWith(norm(x.nome) + ' '))
    || lista.find((x) => norm(x.nome).includes(a)));
  if (m || !extra) return m || null;
  // versão: maior número de palavras em comum
  const tokens = new Set(norm(`${alvo} ${extra}`).split(' ').filter(Boolean));
  let best = null, score = 0;
  for (const x of lista) {
    const s = norm(x.nome).split(' ').filter((t) => tokens.has(t)).length;
    if (s > score) { score = s; best = x; }
  }
  return score ? best : null;
}
async function sugerir(v) {
  const b = base(v.categoria);
  const marcas = await catalogo(b);
  const ma = melhor(marcas, v.marca);
  if (!ma) return {};
  const modelos = await catalogo(`${b}/${ma.id}`);
  const mo = melhor(modelos, v.modelo);
  if (!mo) return { marca_id: ma.id, marca_nome: ma.nome };
  const versoes = await catalogo(`${b}/${ma.id}/${mo.id}`);
  const ve = melhor(versoes, '', `${v.versao || ''} ${v.motor || ''} ${v.cambio || ''} ${v.ano_mod || ''}`) || (versoes.length === 1 ? versoes[0] : null);
  return { marca_id: ma.id, marca_nome: ma.nome, modelo_id: mo.id, modelo_nome: mo.nome, ...(ve ? { versao_id: ve.id, versao_nome: ve.nome } : {}) };
}

// ---------- montagem do anúncio ----------
const FUEL_CARRO = { Gasolina: '1', Etanol: '2', Flex: '3', Diesel: '5', 'Híbrido': '6', 'Elétrico': '7' };
const FUEL_MOTO = { Gasolina: '1', Etanol: '2', Flex: '3', Diesel: '4', 'Híbrido': '5', 'Elétrico': '6' };
const GEAR = { Manual: '1', 'Automático': '2', CVT: '2', Automatizado: '4' };
const CORES = [['preto', '1'], ['preta', '1'], ['branc', '2'], ['prata', '3'], ['vermelh', '4'], ['vinho', '4'], ['cinza', '5'], ['grafite', '5'], ['azul', '6'], ['amarel', '7'], ['verde', '8'], ['laranja', '9']];
const corOlx = (c) => { const t = String(c || '').toLowerCase(); if (!t) return null; const m = CORES.find(([k]) => t.includes(k)); return m ? m[1] : '10'; };
const FEATURES = [[/ar[- ]?(condicionado|digital)|climatiza/i, '1'], [/vidros? el[eé]tric/i, '3'], [/trava/i, '4'], [/airbag/i, '5'], [/alarme/i, '6'], [/\bsom\b|multim[ií]dia|r[aá]dio/i, '7'],
  [/sensor (de )?(r[eé]|estacionamento)/i, '8'], [/c[aâ]mera/i, '9'], [/blindad/i, '10'], [/couro/i, '11'], [/computador de bordo/i, '12'], [/\busb\b/i, '13'], [/volante multifuncional/i, '14'],
  [/bluetooth/i, '15'], [/\bgps\b|navegador/i, '16'], [/piloto autom[aá]tico|controle (autom[aá]tico )?de velocidade/i, '17'], [/liga leve/i, '18'], [/teto solar/i, '19'], [/4x4|tra[cç][aã]o integral/i, '20']];
function motorpower(m) {
  const x = String(m || '').replace(',', '.').match(/(\d)\.(\d)/);
  if (!x) return null;
  const n = Number(`${x[1]}.${x[2]}`);
  if (n < 1) return null;
  if (n < 2) { const d = Math.round((n - 1) * 10); return String(d <= 1 ? 1 : d); } // 1.0 → 1, 1.2 → 2 … 1.9 → 9
  return n < 3 ? '10' : n < 4 ? '11' : '12';
}
const regdate = (ano) => { const a = Number(ano); if (!a) return null; if (a >= 1980) return String(a); return String(Math.max(1950, Math.floor(a / 5) * 5)); };
const fotosPublicas = (id, siteUrl) => db.prepare('SELECT arquivo FROM veiculo_fotos WHERE veiculo_id=? ORDER BY ordem,id').all(id).slice(0, 20).map((f) => `${siteUrl}/uploads/${f.arquivo}`);
const publicoOk = (u) => /^https?:\/\//i.test(u) && !/\/\/(localhost|127\.|0\.0\.0\.0|\[::1\]|192\.168\.|10\.)/i.test(u);

// devolve { ad, problemas[] } – problemas impedem o envio
function montar(v, a) {
  const s = cfg();
  const op = JSON.parse((a && a.opcoes) || '{}');
  const problemas = [];
  const siteUrl = String(s.site_url || '').replace(/\/+$/, '');
  if (v.categoria === 'bike') problemas.push('A OLX não tem categoria de bike elétrica nesta integração (só carros e motos).');
  if (!publicoOk(siteUrl) && !process.env.OLX_PERMITIR_LOCAL) problemas.push('Configure o "Endereço público do sistema" (com https) em Configurações. A OLX baixa as fotos por esse endereço.');
  const fotos = fotosPublicas(v.id, siteUrl);
  if (!fotos.length) problemas.push('Envie pelo menos uma foto do veículo.');
  const preco = Math.round(Number(v.preco_venda) || 0);
  if (!(preco > 0)) problemas.push('Informe o preço de venda anunciado.');
  if (v.km == null || v.km === '') problemas.push('Informe a quilometragem.');
  if (!regdate(v.ano_mod || v.ano_fab)) problemas.push('Informe o ano do veículo.');
  const fone = digits(s.olx_telefone || s.whatsapp || s.telefone).replace(/^55(?=\d{10,11}$)/, '');
  if (!/^\d{10,11}$/.test(fone)) problemas.push('Informe o telefone dos anúncios (DDD + número) em Configurações → OLX.');
  const cep = digits(s.olx_cep || s.cep);
  if (!/^\d{8}$/.test(cep)) problemas.push('Informe o CEP dos anúncios em Configurações → OLX.');
  if (!a || !a.marca_id || !a.modelo_id || !a.versao_id) problemas.push('Escolha a marca, o modelo e a versão do catálogo da OLX.');
  const moto = v.categoria === 'moto';
  if (moto && !(a && a.cilindrada_id)) problemas.push('Escolha a cilindrada (catálogo da OLX).');
  const fuel = (moto ? FUEL_MOTO : FUEL_CARRO)[v.combustivel];
  if (moto && !fuel) problemas.push('Informe o combustível da moto (gasolina, flex etc.).');
  if (!moto && !v.placa) problemas.push('Informe a placa (a OLX exige para carros usados).');

  const titulo = [v.marca, v.modelo, v.versao].filter(Boolean).join(' ').slice(0, 90);
  const corpo = [v.descricao, v.opcionais ? `Opcionais: ${v.opcionais}` : '', `${s.empresa_nome || 'M2 Seminovos'}${s.cidade ? ' · ' + s.cidade + (s.uf ? '/' + s.uf : '') : ''}`]
    .filter(Boolean).join('\n\n').slice(0, 6000);
  const p = { regdate: regdate(v.ano_mod || v.ano_fab), mileage: Math.round(Number(v.km) || 0), vehicle_brand: a && a.marca_id, vehicle_model: a && a.modelo_id, vehicle_version: a && a.versao_id };
  const yes = (k) => (op[k] === 1 || op[k] === '1' ? '1' : op[k] === 0 || op[k] === '0' ? '2' : null);
  if (moto) {
    p.fuel = fuel; p.cubiccms = a && a.cilindrada_id;
    if (GEAR[v.cambio]) p.gearbox = GEAR[v.cambio] === '4' ? '3' : GEAR[v.cambio];
    if (op.mototype) p.mototype = String(op.mototype);
  } else {
    p.vehicle_tag = String(v.placa || '').toUpperCase().replace(/[^A-Z0-9]/g, '') || undefined;
    if (fuel) p.fuel = fuel;
    if (GEAR[v.cambio]) p.gearbox = GEAR[v.cambio];
    const portas = { 2: '1', 3: '3', 4: '2', 5: '2' }[Number(v.portas)]; if (portas) p.doors = portas;
    const mp = motorpower(v.motor || v.versao); if (mp) p.motorpower = mp;
    if (v.chassi) p.chassi = String(v.chassi).toUpperCase();
    if (op.cartype) p.cartype = String(op.cartype);
    const feats = FEATURES.filter(([re]) => re.test(v.opcionais || '')).map(([, c]) => c); if (feats.length) p.car_features = feats;
    if (yes('extra_key')) p.extra_key = yes('extra_key');
    if (yes('owner_manual')) p.owner_manual = yes('owner_manual');
    if (yes('dealership_review')) p.dealership_review = yes('dealership_review');
    if (yes('warranty')) p.warranty = yes('warranty');
  }
  const cor = corOlx(v.cor); if (cor) p.carcolor = cor;
  if (yes('exchange')) p.exchange = yes('exchange');
  if (yes('owner')) p.owner = yes('owner');
  if (op.ipva_pago === 1 || op.ipva_pago === '1') p.financial = ['2'];
  if (op.quitado === 1 || op.quitado === '1') p.financial_status = '1';
  Object.keys(p).forEach((k) => (p[k] == null || p[k] === '' ? delete p[k] : null)); // a OLX rejeita parâmetros vazios

  const ad = { id: a ? a.ad_id : `m2v${v.id}`, operation: 'insert', category: moto ? 2060 : 2020, subject: titulo, body: corpo.length >= 2 ? corpo : titulo, phone: Number(fone), type: 's', price: preco, zipcode: cep, params: p, images: fotos };
  return { ad, problemas };
}

// ---------- operações ----------
const getA = (id) => db.prepare('SELECT * FROM olx_anuncios WHERE veiculo_id=?').get(id);
function garantirA(id) {
  let a = getA(id);
  if (!a) { db.prepare('INSERT INTO olx_anuncios(veiculo_id,ad_id) VALUES (?,?)').run(id, `m2v${id}`); a = getA(id); }
  return a;
}
function salvarResultado(id, campos) {
  const keys = Object.keys(campos);
  db.prepare(`UPDATE olx_anuncios SET ${keys.map((k) => k + '=?').join(',')}, atualizado_em=? WHERE veiculo_id=?`).run(...keys.map((k) => campos[k]), agora(), id);
}
async function importar(id, ad) {
  const j = await olx('PUT', '/autoupload/import', { body: { access_token: token(), ad_list: [ad] } });
  const code = j && j.statusCode;
  if (code !== 0) {
    const msgs = (j && j.errors || []).flatMap((e) => (e.messages || []).map(traduz)).filter(Boolean);
    salvarResultado(id, { status: 'erro', operacao: ad.operation, mensagens: JSON.stringify([STATUS_IMPORT[String(code)] || (j && j.statusMessage) || 'Erro ao enviar.', ...msgs]) });
    throw bad([STATUS_IMPORT[String(code)] || 'A OLX não aceitou o anúncio.', ...msgs].join(' '), 400);
  }
  salvarResultado(id, { status: 'enviado', operacao: ad.operation, import_token: j.token || null, mensagens: '[]', enviado_em: agora() });
  return j;
}
async function publicar(id) {
  const v = db.prepare('SELECT * FROM veiculos WHERE id=?').get(id);
  if (!v) throw bad('Veículo não encontrado.', 404);
  if (v.status === 'vendido') throw bad('Veículo vendido não pode ser anunciado.');
  const a = garantirA(id);
  const { ad, problemas } = montar(v, a);
  if (problemas.length) throw bad('Antes de publicar: ' + problemas.join(' '), 400);
  db.prepare('UPDATE olx_anuncios SET ativo=1 WHERE veiculo_id=?').run(id);
  return importar(id, ad);
}
async function remover(id) {
  const a = getA(id);
  if (!a || !a.ativo) return null;
  const j = await importar(id, { id: a.ad_id, operation: 'delete' });
  db.prepare('UPDATE olx_anuncios SET ativo=0 WHERE veiculo_id=?').run(id);
  return j;
}
async function atualizarStatus(id) {
  const a = getA(id);
  if (!a) return null;
  const tk = token();
  if (a.import_token) {
    const j = await olx('POST', `/autoupload/import/${encodeURIComponent(a.import_token)}`, { body: { access_token: tk } });
    const r = j && j.ads && (j.ads[a.ad_id] || Object.values(j.ads)[0]);
    if (r) {
      const st = r.status === 'accept' ? 'accepted' : r.status;
      const msgs = [...(r.message || []).map(traduz), ...((r.image_errors || r.imageErrors || []).map((e) => traduz(e.status)))].filter(Boolean);
      salvarResultado(id, { status: st, mensagens: JSON.stringify(msgs), list_id: r.list_id ? String(r.list_id) : a.list_id, url: r.url || a.url, ...(j.autoupload_status === 'done' ? { import_token: null } : {}) });
    }
  }
  const b = getA(id);
  if (b.list_id && !b.import_token) {
    try {
      const r = await olx('GET', `/autoupload/ads/${encodeURIComponent(b.list_id)}`, { bearer: tk });
      if (r && r.status) salvarResultado(id, { status: r.status, mensagens: JSON.stringify((r.message || []).map(traduz).filter(Boolean)), url: r.url || b.url });
    } catch (e) { if (e.status === 401) throw e; }
  }
  return getA(id);
}
// tarefas em segundo plano (venda, exclusão, edição): não travam a tela; o erro fica registrado no anúncio
function emSegundoPlano(id, fn, rotulo) {
  if (!cfg().olx_access_token) return;
  const a = getA(id);
  if (!a || !a.ativo) return;
  setImmediate(() => fn(id).catch((e) => {
    try { salvarResultado(id, { status: 'erro', mensagens: JSON.stringify([`${rotulo}: ${e.message}`]) }); } catch (x) { /* veículo excluído */ }
    console.error('[OLX]', rotulo, id, e.message);
  }));
}
const aoVender = (id) => emSegundoPlano(id, remover, 'Ao tirar da OLX após a venda');
const aoEditar = (id) => emSegundoPlano(id, publicar, 'Ao atualizar na OLX');
// exclusão: o veículo some do banco, então guardamos o id do anúncio antes
function aoExcluir(id) {
  const a = getA(id);
  if (!a || !a.ativo || !cfg().olx_access_token) return;
  setImmediate(() => olx('PUT', '/autoupload/import', { body: { access_token: cfg().olx_access_token, ad_list: [{ id: a.ad_id, operation: 'delete' }] } })
    .then(() => db.prepare('DELETE FROM olx_anuncios WHERE veiculo_id=?').run(id))
    .catch((e) => console.error('[OLX] ao excluir', id, e.message)));
}

// ---------- rotas ----------
const estados = new Map(); // state do OAuth -> { user, t }
function redirectUri(req) {
  const s = cfg();
  const b = String(s.site_url || '').replace(/\/+$/, '') || `${req.protocol}://${req.get('host')}`;
  return `${b}/api/olx/retorno`;
}

module.exports = function (api, can) {
  api.get('/olx/status', can('estoque'), (req, res) => {
    const s = cfg();
    res.json({
      configurado: !!(s.olx_client_id && s.olx_client_secret), conectado: !!s.olx_access_token,
      conta: s.olx_conta || '', conectado_em: s.olx_conectado_em || '', redirect_uri: redirectUri(req),
      site_publico: publicoOk(String(s.site_url || '')),
    });
  });

  // 1) leva o usuário para o login da OLX
  api.get('/olx/conectar', can('config'), (req, res) => {
    const s = cfg();
    if (!s.olx_client_id || !s.olx_client_secret) return res.redirect('/app/#/config?olx=sem_chaves');
    const state = crypto.randomBytes(16).toString('hex');
    estados.set(state, { user: req.user.id, t: Date.now() });
    for (const [k, v] of estados) if (Date.now() - v.t > 15 * 60e3) estados.delete(k);
    const q = new URLSearchParams({ response_type: 'code', client_id: s.olx_client_id, redirect_uri: redirectUri(req), scope: 'autoupload basic_user_info', state });
    res.redirect(`${AUTH}/oauth?${q}`);
  });

  // 2) a OLX devolve o "code"; trocamos pelo access_token
  api.get('/olx/retorno', can('config'), async (req, res) => {
    const { code, state, error } = req.query;
    const st = estados.get(String(state || ''));
    estados.delete(String(state || ''));
    if (error) return res.redirect('/app/#/config?olx=negado');
    if (!st || st.user !== req.user.id || !code) return res.redirect('/app/#/config?olx=invalido');
    const s = cfg();
    try {
      const r = await fetch(`${AUTH}/oauth/token`, {
        method: 'POST', signal: AbortSignal.timeout(20000), headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ code: String(code), client_id: s.olx_client_id, client_secret: s.olx_client_secret, redirect_uri: redirectUri(req), grant_type: 'authorization_code' }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.access_token) return res.redirect('/app/#/config?olx=falhou');
      setS.run('olx_access_token', j.access_token);
      setS.run('olx_conectado_em', agora());
      try {
        const u = await olx('POST', '/oauth_api/basic_user_info', { body: { access_token: j.access_token } });
        setS.run('olx_conta', [u && u.user_name, u && u.user_email].filter(Boolean).join(' · '));
      } catch (e) { setS.run('olx_conta', ''); }
      cache.clear();
      res.redirect('/app/#/config?olx=ok');
    } catch (e) { res.redirect('/app/#/config?olx=falhou'); }
  });

  api.post('/olx/desconectar', can('config'), (req, res) => {
    ['olx_access_token', 'olx_conta', 'olx_conectado_em'].forEach((k) => setS.run(k, ''));
    cache.clear();
    res.json({ ok: true });
  });

  // catálogo da OLX
  api.get('/olx/catalogo/:cat', can('estoque'), async (req, res) => res.json(await catalogo(base(req.params.cat))));
  api.get('/olx/catalogo/:cat/:marca', can('estoque'), async (req, res) => res.json(await catalogo(`${base(req.params.cat)}/${encodeURIComponent(req.params.marca)}`)));
  api.get('/olx/catalogo/:cat/:marca/:modelo', can('estoque'), async (req, res) => res.json(await catalogo(`${base(req.params.cat)}/${encodeURIComponent(req.params.marca)}/${encodeURIComponent(req.params.modelo)}`)));
  api.get('/olx/cilindradas', can('estoque'), async (req, res) => res.json(await catalogo('moto_cubiccms_info')));

  // anúncio de um veículo
  api.get('/olx/veiculos/:id', can('estoque'), (req, res) => {
    const v = db.prepare('SELECT * FROM veiculos WHERE id=?').get(req.params.id);
    if (!v) return res.status(404).json({ error: 'Veículo não encontrado.' });
    const a = getA(v.id);
    const { ad, problemas } = montar(v, a);
    res.json({ anuncio: a ? { ...a, opcoes: JSON.parse(a.opcoes || '{}'), mensagens: JSON.parse(a.mensagens || '[]') } : null, previa: ad, problemas, conectado: !!cfg().olx_access_token });
  });
  api.get('/olx/veiculos/:id/sugestao', can('estoque'), async (req, res) => {
    const v = db.prepare('SELECT * FROM veiculos WHERE id=?').get(req.params.id);
    if (!v) return res.status(404).json({ error: 'Veículo não encontrado.' });
    res.json(await sugerir(v));
  });
  api.put('/olx/veiculos/:id', can('estoque'), (req, res) => {
    const v = db.prepare('SELECT id FROM veiculos WHERE id=?').get(req.params.id);
    if (!v) return res.status(404).json({ error: 'Veículo não encontrado.' });
    garantirA(v.id);
    const b = req.body || {};
    const s = (x) => (x == null || x === '' ? null : String(x).slice(0, 120));
    const op = {}; ['exchange', 'owner', 'extra_key', 'owner_manual', 'dealership_review', 'warranty', 'ipva_pago', 'quitado'].forEach((k) => { if (b.opcoes && b.opcoes[k] !== undefined && b.opcoes[k] !== '') op[k] = Number(b.opcoes[k]) ? 1 : 0; });
    ['cartype', 'mototype'].forEach((k) => { if (b.opcoes && /^\d{1,2}$/.test(String(b.opcoes[k] || ''))) op[k] = String(b.opcoes[k]); });
    db.prepare(`UPDATE olx_anuncios SET marca_id=?,marca_nome=?,modelo_id=?,modelo_nome=?,versao_id=?,versao_nome=?,cilindrada_id=?,opcoes=?,atualizado_em=? WHERE veiculo_id=?`)
      .run(s(b.marca_id), s(b.marca_nome), s(b.modelo_id), s(b.modelo_nome), s(b.versao_id), s(b.versao_nome), s(b.cilindrada_id), JSON.stringify(op), agora(), v.id);
    res.json({ ok: true });
  });
  api.post('/olx/veiculos/:id/publicar', can('estoque'), async (req, res) => { await publicar(Number(req.params.id)); res.json({ ok: true, anuncio: getA(req.params.id) }); });
  api.post('/olx/veiculos/:id/remover', can('estoque'), async (req, res) => { await remover(Number(req.params.id)); res.json({ ok: true, anuncio: getA(req.params.id) }); });
  api.post('/olx/veiculos/:id/status', can('estoque'), async (req, res) => res.json({ anuncio: await atualizarStatus(Number(req.params.id)) }));
  api.get('/olx/anuncios', can('estoque'), (req, res) => res.json(db.prepare('SELECT veiculo_id,ativo,status,url FROM olx_anuncios').all()));
};
module.exports.aoVender = aoVender;
module.exports.aoEditar = aoEditar;
module.exports.aoExcluir = aoExcluir;
module.exports.montar = montar;
