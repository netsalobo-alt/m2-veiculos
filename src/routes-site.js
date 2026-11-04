// Editor do site público: conteúdo configurável pelo sistema (aviso, cabeçalho, destaque,
// promoções, vídeos, pop-up, ordem das seções e rodapé). Tudo fica em settings.site_conteudo (JSON).
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const { db, DATA_DIR } = require('./db');
const { bad } = require('./routes-cadastros');

const ACOES = ['estoque', 'contato', 'vender', 'whatsapp', 'link', 'nenhum'];
const SECOES = ['promocoes', 'videos', 'estoque'];
const CORES = ['dourado', 'preto', 'vermelho', 'verde'];
const FREQ = ['sessao', 'dia', 'sempre'];

const DEFAULT = {
  aviso: { ativo: 0, texto: '', cor: 'dourado', acao: 'nenhum', url: '' },
  cabecalho: { logo: '', botao_texto: 'Fale com a M2' },
  destaque: {
    eyebrow: 'M2 SEMINOVOS',
    titulo: 'Seu próximo carro. Uma nova conquista.',
    subtitulo: 'Carros, motos e bikes elétricas seminovos, com atendimento próximo, claro e confiável. Escolha o seu e fale com a gente.',
    imagem: '',
    botao1_texto: 'Ver estoque', botao1_acao: 'estoque', botao1_url: '',
    botao2_texto: 'Venda seu veículo', botao2_acao: 'vender', botao2_url: '',
    mostrar_contadores: 1,
  },
  secoes: ['promocoes', 'videos', 'estoque'],
  promocoes: { ativo: 1, titulo: 'Promoções', subtitulo: '', itens: [] },
  videos: { ativo: 1, titulo: 'Vídeos', subtitulo: '', itens: [] },
  estoque: { titulo: 'Veículos disponíveis' },
  popup: { ativo: 0, titulo: '', texto: '', imagem: '', botao_texto: 'Quero saber mais', acao: 'contato', url: '', frequencia: 'sessao', atraso: 3, inicio: '', fim: '' },
  rodape: {
    banner_titulo: 'Seu próximo carro começa com uma conversa.',
    banner_texto: '',
    aviso_legal: 'Preços, disponibilidade e condições sob consulta e sujeitos a alteração sem aviso. Imagens dos veículos podem ser ilustrativas.',
  },
};

// ---------- validação ----------
const str = (v, max = 300) => String(v ?? '').trim().slice(0, max);
const flag = (v) => (v === 1 || v === true || v === '1' || v === 'on' ? 1 : 0);
const one = (v, list, def) => (list.includes(v) ? v : def);
const data = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : '');
const newId = () => crypto.randomBytes(4).toString('hex');
// links: só http(s), caminhos do próprio site ou âncoras
function url(v) {
  const s = str(v, 500);
  if (!s) return '';
  if (/^https?:\/\//i.test(s) || /^\/(?!\/)/.test(s) || /^#/.test(s)) return s;
  if (/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(s)) return 'https://' + s; // "www.site.com.br" vira https://
  return '';
}
// imagens: só arquivos enviados pelo editor (/uploads/site-...) ou endereços https
const img = (v) => { const s = str(v, 500); return /^\/uploads\/site-[\w.-]+$/.test(s) || /^https:\/\//i.test(s) ? s : ''; };

function sanitize(b = {}) {
  const d = JSON.parse(JSON.stringify(DEFAULT));
  const a = b.aviso || {}, c = b.cabecalho || {}, h = b.destaque || {}, p = b.promocoes || {}, v = b.videos || {}, pp = b.popup || {}, r = b.rodape || {};
  d.aviso = { ativo: flag(a.ativo), texto: str(a.texto, 200), cor: one(a.cor, CORES, 'dourado'), acao: one(a.acao, ACOES, 'nenhum'), url: url(a.url) };
  d.cabecalho = { logo: img(c.logo), botao_texto: str(c.botao_texto, 40) || DEFAULT.cabecalho.botao_texto };
  d.destaque = {
    eyebrow: str(h.eyebrow, 60), titulo: str(h.titulo, 140) || DEFAULT.destaque.titulo, subtitulo: str(h.subtitulo, 400), imagem: img(h.imagem),
    botao1_texto: str(h.botao1_texto, 40), botao1_acao: one(h.botao1_acao, ACOES, 'estoque'), botao1_url: url(h.botao1_url),
    botao2_texto: str(h.botao2_texto, 40), botao2_acao: one(h.botao2_acao, ACOES, 'vender'), botao2_url: url(h.botao2_url),
    mostrar_contadores: flag(h.mostrar_contadores),
  };
  const ordem = Array.isArray(b.secoes) ? b.secoes.filter((s) => SECOES.includes(s)) : [];
  d.secoes = [...new Set([...ordem, ...SECOES])];
  d.promocoes = {
    ativo: flag(p.ativo), titulo: str(p.titulo, 80), subtitulo: str(p.subtitulo, 200),
    itens: (Array.isArray(p.itens) ? p.itens : []).slice(0, 30).map((i) => ({
      id: str(i.id, 20) || newId(), ativo: flag(i.ativo), titulo: str(i.titulo, 100), texto: str(i.texto, 500), selo: str(i.selo, 30), imagem: img(i.imagem),
      botao_texto: str(i.botao_texto, 40), acao: one(i.acao, ACOES, 'contato'), url: url(i.url), inicio: data(i.inicio), fim: data(i.fim),
    })),
  };
  d.videos = {
    ativo: flag(v.ativo), titulo: str(v.titulo, 80), subtitulo: str(v.subtitulo, 200),
    itens: (Array.isArray(v.itens) ? v.itens : []).slice(0, 20).map((i) => ({ id: str(i.id, 20) || newId(), ativo: flag(i.ativo), titulo: str(i.titulo, 100), url: url(i.url) })),
  };
  d.estoque = { titulo: str((b.estoque || {}).titulo, 80) || DEFAULT.estoque.titulo };
  d.popup = {
    ativo: flag(pp.ativo), titulo: str(pp.titulo, 100), texto: str(pp.texto, 600), imagem: img(pp.imagem), botao_texto: str(pp.botao_texto, 40),
    acao: one(pp.acao, ACOES, 'contato'), url: url(pp.url), frequencia: one(pp.frequencia, FREQ, 'sessao'),
    atraso: Math.max(0, Math.min(60, Math.round(Number(pp.atraso) || 0))), inicio: data(pp.inicio), fim: data(pp.fim),
  };
  d.rodape = { banner_titulo: str(r.banner_titulo, 140), banner_texto: str(r.banner_texto, 400), aviso_legal: str(r.aviso_legal, 400) };
  return d;
}

function carregar() {
  const row = db.prepare("SELECT value FROM settings WHERE key='site_conteudo'").get();
  if (!row || !row.value) return JSON.parse(JSON.stringify(DEFAULT));
  try { return sanitize(JSON.parse(row.value)); } catch (e) { return JSON.parse(JSON.stringify(DEFAULT)); }
}

// YouTube / Vimeo -> endereço de incorporação
function embedDe(u) {
  let m = String(u || '').match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/i);
  if (m) return { tipo: 'youtube', embed: `https://www.youtube-nocookie.com/embed/${m[1]}`, thumb: `https://i.ytimg.com/vi/${m[1]}/hqdefault.jpg` };
  m = String(u || '').match(/vimeo\.com\/(?:video\/)?(\d+)/i);
  if (m) return { tipo: 'vimeo', embed: `https://player.vimeo.com/video/${m[1]}` };
  return null;
}
const hoje = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const vigente = (i, h) => (!i.inicio || i.inicio <= h) && (!i.fim || i.fim >= h);

const upload = multer({
  storage: multer.diskStorage({
    destination: path.join(DATA_DIR, 'uploads'),
    filename: (req, file, cb) => cb(null, `site-${Date.now().toString(36)}-${crypto.randomBytes(5).toString('hex')}${({ 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' })[file.mimetype] || '.jpg'}`),
  }),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => cb(null, /^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)),
});

// rotas do sistema (precisam de login e permissão "config")
module.exports = function (api, can) {
  api.get('/site', can('config'), (req, res) => res.json({ conteudo: carregar(), padrao: DEFAULT }));
  api.put('/site', can('config'), (req, res) => {
    const d = sanitize(req.body || {});
    db.prepare("INSERT INTO settings(key,value) VALUES ('site_conteudo',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify(d));
    res.json({ ok: true, conteudo: d });
  });
  api.post('/site/imagem', can('config'), upload.single('imagem'), (req, res) => {
    if (!req.file) throw bad('Envie uma imagem JPG, PNG, WEBP ou GIF de até 8 MB.');
    res.json({ url: '/uploads/' + req.file.filename });
  });
  api.post('/site/video-info', can('config'), (req, res) => res.json({ ok: !!embedDe((req.body || {}).url), ...(embedDe((req.body || {}).url) || {}) }));
};

// rota pública usada pelo site: devolve só o que está ativo e dentro da validade
module.exports.publico = function (app) {
  app.get('/api/public/site', (req, res) => {
    const c = carregar();
    const h = hoje();
    c.promocoes.itens = c.promocoes.ativo ? c.promocoes.itens.filter((i) => i.ativo && i.titulo && vigente(i, h)) : [];
    c.videos.itens = c.videos.ativo ? c.videos.itens.filter((i) => i.ativo).map((i) => ({ ...i, ...embedDe(i.url) })).filter((i) => i.embed) : [];
    if (!c.popup.ativo || !vigente(c.popup, h) || !(c.popup.titulo || c.popup.texto || c.popup.imagem)) c.popup = { ativo: 0 };
    if (!c.aviso.ativo || !c.aviso.texto) c.aviso = { ativo: 0 };
    res.setHeader('Cache-Control', 'no-store');
    res.json(c);
  });
};
module.exports.DEFAULT = DEFAULT;
module.exports.sanitize = sanitize;
