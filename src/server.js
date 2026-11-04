const path = require('path');
const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const { db, DATA_DIR, getSettings } = require('./db');
const { buildContext } = require('./util');
const { documentoPDF } = require('./pdf');

const app = express();
app.set('trust proxy', true);
app.use(express.json({ limit: '5mb' }));

// ---------------- autenticação ----------------
const PERMS = {
  admin: ['estoque', 'custos', 'pessoas', 'vendas', 'documentos', 'financeiro', 'relatorios', 'leads', 'usuarios', 'config'],
  gerente: ['estoque', 'custos', 'pessoas', 'vendas', 'documentos', 'financeiro', 'relatorios', 'leads', 'config'],
  financeiro: ['estoque', 'custos', 'pessoas', 'vendas', 'documentos', 'financeiro', 'relatorios'],
  vendedor: ['estoque', 'pessoas', 'vendas', 'documentos', 'leads'],
};
function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach((c) => {
    const i = c.indexOf('=');
    if (i > 0) out[c.slice(0, i).trim()] = decodeURIComponent(c.slice(i + 1).trim());
  });
  return out;
}
function auth(req, res, next) {
  const token = parseCookies(req).m2s;
  if (token) {
    const row = db.prepare(`SELECT u.id,u.nome,u.email,u.perfil,u.ativo FROM sessions s JOIN users u ON u.id=s.user_id
      WHERE s.token=? AND s.expira_em > datetime('now','localtime')`).get(token);
    if (row && row.ativo) {
      req.user = { ...row, perms: PERMS[row.perfil] || [] };
      return next();
    }
  }
  res.status(401).json({ error: 'Sessão expirada. Faça login novamente.' });
}
const can = (perm) => (req, res, next) => (req.user.perms.includes(perm) ? next() : res.status(403).json({ error: 'Seu perfil não tem acesso a esta função.' }));

const tentativas = new Map(); // limite simples contra força bruta: 10 erros / 15 min por IP
app.post('/api/login', (req, res) => {
  const { email, senha } = req.body || {};
  const now = Date.now();
  const t = tentativas.get(req.ip) || { n: 0, desde: now };
  if (now - t.desde > 15 * 60e3) { t.n = 0; t.desde = now; }
  if (t.n >= 10) return res.status(429).json({ error: 'Muitas tentativas. Aguarde 15 minutos e tente novamente.' });
  const u = db.prepare('SELECT * FROM users WHERE lower(email)=lower(?)').get(String(email || '').trim());
  if (!u || !u.ativo || !bcrypt.compareSync(String(senha || ''), u.senha_hash)) {
    t.n++; tentativas.set(req.ip, t);
    return res.status(401).json({ error: 'E-mail ou senha inválidos.' });
  }
  tentativas.delete(req.ip);
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare("INSERT INTO sessions(token,user_id,expira_em) VALUES (?,?,datetime('now','localtime','+12 hours'))").run(token, u.id);
  db.prepare("DELETE FROM sessions WHERE expira_em < datetime('now','localtime')").run();
  res.setHeader('Set-Cookie', `m2s=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=43200${req.secure ? '; Secure' : ''}`);
  res.json({ ok: true });
});
app.post('/api/logout', (req, res) => {
  const token = parseCookies(req).m2s;
  if (token) db.prepare('DELETE FROM sessions WHERE token=?').run(token);
  res.setHeader('Set-Cookie', 'm2s=; HttpOnly; Path=/; Max-Age=0');
  res.json({ ok: true });
});

// ---------------- API pública (site e assinatura) ----------------
const PUBLIC_FIELDS = 'v.id,v.categoria,v.marca,v.modelo,v.versao,v.ano_fab,v.ano_mod,v.cor,v.km,v.combustivel,v.cambio,v.portas,v.motor,v.autonomia,v.bateria,v.opcionais,v.descricao,v.preco_venda,v.status,v.destaque,v.data_entrada';
function fotosDe(id) { return db.prepare('SELECT arquivo FROM veiculo_fotos WHERE veiculo_id=? ORDER BY ordem,id').all(id).map((f) => '/uploads/' + f.arquivo); }

app.get('/api/public/empresa', (req, res) => {
  const s = getSettings();
  res.json({ nome: s.empresa_nome, telefone: s.telefone, whatsapp: s.whatsapp, email: s.email, endereco: s.endereco, cidade: s.cidade, uf: s.uf, horario: s.horario, sobre: s.sobre, cnpj: s.cnpj });
});
app.get('/api/public/veiculos', (req, res) => {
  const rows = db.prepare(`SELECT ${PUBLIC_FIELDS} FROM veiculos v WHERE v.publicado=1 AND v.status IN ('disponivel','reservado') ORDER BY v.destaque DESC, v.data_entrada DESC, v.id DESC`).all();
  res.json(rows.map((r) => ({ ...r, fotos: fotosDe(r.id) })));
});
app.get('/api/public/veiculos/:id', (req, res) => {
  const r = db.prepare(`SELECT ${PUBLIC_FIELDS} FROM veiculos v WHERE v.id=? AND v.publicado=1 AND v.status IN ('disponivel','reservado')`).get(req.params.id);
  if (!r) return res.status(404).json({ error: 'Veículo não encontrado ou já vendido.' });
  res.json({ ...r, fotos: fotosDe(r.id) });
});
app.post('/api/public/leads', (req, res) => {
  const { nome, telefone, email, mensagem, veiculo_id, tipo } = req.body || {};
  if (!nome || !(telefone || email)) return res.status(400).json({ error: 'Informe seu nome e um telefone ou e-mail.' });
  db.prepare('INSERT INTO leads(tipo,nome,telefone,email,mensagem,veiculo_id) VALUES (?,?,?,?,?,?)')
    .run(tipo === 'avaliacao' ? 'avaliacao' : 'interesse', String(nome).slice(0, 120), String(telefone || '').slice(0, 40), String(email || '').slice(0, 120), String(mensagem || '').slice(0, 2000), veiculo_id || null);
  res.json({ ok: true });
});

app.get('/api/public/assinatura/:token', (req, res) => {
  const d = db.prepare('SELECT id,titulo,conteudo,status,assinado_em,assinatura_nome,pessoa_id,tipo FROM documentos WHERE token=?').get(req.params.token);
  if (!d) return res.status(404).json({ error: 'Link de assinatura inválido ou expirado.' });
  const p = d.pessoa_id ? db.prepare('SELECT nome,cpf_cnpj FROM pessoas WHERE id=?').get(d.pessoa_id) : null;
  res.json({ ...d, signatario: p, empresa: getSettings().empresa_nome });
});
app.post('/api/public/assinatura/:token', (req, res) => {
  const d = db.prepare('SELECT * FROM documentos WHERE token=?').get(req.params.token);
  if (!d) return res.status(404).json({ error: 'Link inválido.' });
  if (d.assinado_em) return res.status(400).json({ error: 'Este documento já foi assinado.' });
  const { nome, documento, imagem, aceite } = req.body || {};
  if (!aceite) return res.status(400).json({ error: 'É preciso concordar com os termos.' });
  if (!nome || !documento) return res.status(400).json({ error: 'Informe nome completo e CPF/CNPJ.' });
  if (!/^data:image\/png;base64,/.test(imagem || '') || imagem.length < 2000) return res.status(400).json({ error: 'Desenhe sua assinatura no quadro.' });
  const hash = crypto.createHash('sha256').update(d.conteudo).digest('hex');
  db.prepare(`UPDATE documentos SET status='assinado', assinado_em=datetime('now','localtime'), assinatura_nome=?, assinatura_doc=?, assinatura_img=?, assinatura_ip=?, assinatura_hash=? WHERE id=?`)
    .run(String(nome).slice(0, 150), String(documento).slice(0, 30), imagem, req.ip, hash, d.id);
  res.json({ ok: true });
});
app.get('/api/public/assinatura/:token/pdf', async (req, res) => {
  const d = db.prepare('SELECT * FROM documentos WHERE token=?').get(req.params.token);
  if (!d) return res.status(404).end();
  const buf = await documentoPDF(d, buildContext(d));
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="documento-${d.id}.pdf"`);
  res.send(buf);
});

// ---------------- API autenticada ----------------
const api = express.Router();
api.use(auth);
api.get('/me', (req, res) => res.json(req.user));
api.put('/me/senha', (req, res) => {
  const { atual, nova } = req.body || {};
  const u = db.prepare('SELECT senha_hash FROM users WHERE id=?').get(req.user.id);
  if (!bcrypt.compareSync(String(atual || ''), u.senha_hash)) return res.status(400).json({ error: 'Senha atual incorreta.' });
  if (!nova || String(nova).length < 6) return res.status(400).json({ error: 'A nova senha precisa de ao menos 6 caracteres.' });
  db.prepare('UPDATE users SET senha_hash=? WHERE id=?').run(bcrypt.hashSync(String(nova), 10), req.user.id);
  res.json({ ok: true });
});

require('./routes-cadastros')(api, can);
require('./routes-estoque')(api, can);
require('./routes-vendas')(api, can);
require('./routes-financeiro')(api, can);
app.use('/api', api);

// erros
app.use('/api', (err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.publicMessage || err.message || 'Erro interno.' });
});

// ---------------- arquivos estáticos ----------------
const PUB = path.join(__dirname, '..', 'public');
app.use('/uploads', express.static(path.join(DATA_DIR, 'uploads'), { maxAge: '7d' }));
app.use(express.static(PUB, { extensions: ['html'] }));
app.get('/assinar/:token', (req, res) => res.sendFile(path.join(PUB, 'assinar.html')));
app.get('/sistema', (req, res) => res.sendFile(path.join(PUB, 'app', 'index.html')));
app.get('/login', (req, res) => res.sendFile(path.join(PUB, 'login.html')));

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => console.log(`[M2] Sistema rodando em http://localhost:${PORT}`));
}
module.exports = app;
