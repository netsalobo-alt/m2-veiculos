const bcrypt = require('bcryptjs');
const { db, getSettings } = require('./db');
const { sendMail } = require('./mail');

const PESSOA_FIELDS = ['tipo_pessoa', 'nome', 'cpf_cnpj', 'rg', 'nascimento', 'profissao', 'estado_civil', 'telefone', 'email', 'cep', 'endereco', 'numero', 'complemento', 'bairro', 'cidade', 'uf', 'observacoes'];
const pick = (o, fields) => Object.fromEntries(fields.filter((f) => o[f] !== undefined).map((f) => [f, o[f] === '' ? null : o[f]]));

function bad(msg, status = 400) { const e = new Error(msg); e.status = status; e.publicMessage = msg; return e; }

module.exports = function (api, can) {
  // ---------- pessoas (clientes / fornecedores) ----------
  api.get('/pessoas', can('pessoas'), (req, res) => {
    const q = `%${(req.query.q || '').trim()}%`;
    res.json(db.prepare(`SELECT p.*,
      (SELECT COUNT(*) FROM vendas v WHERE v.cliente_id=p.id AND v.status='concluida') compras,
      (SELECT COUNT(*) FROM veiculos x WHERE x.fornecedor_id=p.id) fornecimentos
      FROM pessoas p WHERE p.nome LIKE ? OR IFNULL(p.cpf_cnpj,'') LIKE ? OR IFNULL(p.telefone,'') LIKE ? ORDER BY p.nome LIMIT 500`).all(q, q, q));
  });
  api.get('/pessoas/:id', can('pessoas'), (req, res) => {
    const p = db.prepare('SELECT * FROM pessoas WHERE id=?').get(req.params.id);
    if (!p) return res.status(404).json({ error: 'Cadastro não encontrado.' });
    p.compras = db.prepare(`SELECT v.id,v.data_venda,v.valor_venda,v.status, x.marca||' '||x.modelo veiculo FROM vendas v JOIN veiculos x ON x.id=v.veiculo_id WHERE v.cliente_id=? ORDER BY v.data_venda DESC`).all(p.id);
    p.fornecimentos = db.prepare(`SELECT id,marca,modelo,placa,data_entrada,valor_compra,status FROM veiculos WHERE fornecedor_id=? ORDER BY data_entrada DESC`).all(p.id);
    res.json(p);
  });
  api.post('/pessoas', can('pessoas'), (req, res) => {
    const d = pick(req.body, PESSOA_FIELDS);
    if (!d.nome) throw bad('Informe o nome.');
    const keys = Object.keys(d);
    const r = db.prepare(`INSERT INTO pessoas(${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(...keys.map((k) => d[k]));
    res.json({ id: r.lastInsertRowid });
  });
  api.put('/pessoas/:id', can('pessoas'), (req, res) => {
    const d = pick(req.body, PESSOA_FIELDS);
    const keys = Object.keys(d);
    if (!keys.length) return res.json({ ok: true });
    db.prepare(`UPDATE pessoas SET ${keys.map((k) => k + '=?').join(',')} WHERE id=?`).run(...keys.map((k) => d[k]), req.params.id);
    res.json({ ok: true });
  });
  api.delete('/pessoas/:id', can('pessoas'), (req, res) => {
    const used = db.prepare('SELECT (SELECT COUNT(*) FROM vendas WHERE cliente_id=?) + (SELECT COUNT(*) FROM veiculos WHERE fornecedor_id=?) n').get(req.params.id, req.params.id).n;
    if (used) throw bad('Este cadastro tem vendas ou veículos vinculados e não pode ser excluído.');
    db.prepare('DELETE FROM pessoas WHERE id=?').run(req.params.id);
    res.json({ ok: true });
  });

  // ---------- usuários ----------
  api.get('/usuarios/vendedores', (req, res) => {
    res.json(db.prepare("SELECT id,nome,comissao_pct FROM users WHERE ativo=1 ORDER BY nome").all());
  });
  api.get('/usuarios', can('usuarios'), (req, res) => {
    res.json(db.prepare('SELECT id,nome,email,perfil,telefone,comissao_pct,ativo,criado_em FROM users ORDER BY nome').all());
  });
  api.post('/usuarios', can('usuarios'), (req, res) => {
    const { nome, email, senha, perfil, telefone, comissao_pct } = req.body || {};
    if (!nome || !email || !senha) throw bad('Nome, e-mail e senha são obrigatórios.');
    if (String(senha).length < 6) throw bad('A senha precisa de ao menos 6 caracteres.');
    if (db.prepare('SELECT 1 FROM users WHERE lower(email)=lower(?)').get(email)) throw bad('Já existe um usuário com este e-mail.');
    const r = db.prepare('INSERT INTO users(nome,email,senha_hash,perfil,telefone,comissao_pct) VALUES (?,?,?,?,?,?)')
      .run(nome, email.trim(), bcrypt.hashSync(String(senha), 10), perfil || 'vendedor', telefone || null, Number(comissao_pct) || 0);
    res.json({ id: r.lastInsertRowid });
  });
  api.put('/usuarios/:id', can('usuarios'), (req, res) => {
    const { nome, email, senha, perfil, telefone, comissao_pct, ativo } = req.body || {};
    const id = Number(req.params.id);
    if (id === req.user.id && (ativo === 0 || ativo === false || (perfil && perfil !== 'admin'))) throw bad('Você não pode desativar ou rebaixar seu próprio usuário.');
    db.prepare('UPDATE users SET nome=COALESCE(?,nome), email=COALESCE(?,email), perfil=COALESCE(?,perfil), telefone=?, comissao_pct=?, ativo=COALESCE(?,ativo) WHERE id=?')
      .run(nome || null, email || null, perfil || null, telefone || null, Number(comissao_pct) || 0, ativo == null ? null : ativo ? 1 : 0, id);
    if (senha) {
      if (String(senha).length < 6) throw bad('A senha precisa de ao menos 6 caracteres.');
      db.prepare('UPDATE users SET senha_hash=? WHERE id=?').run(bcrypt.hashSync(String(senha), 10), id);
      db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);
    }
    if (ativo === 0 || ativo === false) db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);
    res.json({ ok: true });
  });

  // ---------- configurações ----------
  api.get('/config', can('config'), (req, res) => {
    const s = getSettings();
    s.smtp_pass = s.smtp_pass ? '********' : '';
    s.fipe_token = s.fipe_token ? '********' : '';
    res.json(s);
  });
  api.put('/config', can('config'), (req, res) => {
    const up = db.prepare('INSERT INTO settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
    const tx = db.transaction((o) => {
      for (const [k, v] of Object.entries(o)) {
        if ((k === 'smtp_pass' || k === 'fipe_token') && v === '********') continue;
        up.run(k, v == null ? '' : String(v));
      }
    });
    tx(req.body || {});
    res.json({ ok: true });
  });
  api.post('/config/testar-email', can('config'), async (req, res) => {
    await sendMail({ to: req.body.to, subject: 'Teste de e-mail – M2 Seminovos', text: 'Se você recebeu esta mensagem, o envio de e-mails do sistema está funcionando.' });
    res.json({ ok: true });
  });

  // ---------- leads do site ----------
  api.get('/leads', can('leads'), (req, res) => {
    res.json(db.prepare(`SELECT l.*, v.marca||' '||v.modelo veiculo FROM leads l LEFT JOIN veiculos v ON v.id=l.veiculo_id ORDER BY l.id DESC LIMIT 500`).all());
  });
  api.put('/leads/:id', can('leads'), (req, res) => {
    db.prepare('UPDATE leads SET status=? WHERE id=?').run(req.body.status, req.params.id);
    res.json({ ok: true });
  });
  api.delete('/leads/:id', can('leads'), (req, res) => {
    db.prepare('DELETE FROM leads WHERE id=?').run(req.params.id);
    res.json({ ok: true });
  });
};
module.exports.bad = bad;
module.exports.pick = pick;
