// Funcionários: cadastro e histórico de pagamentos (lançamentos de salário ligados ao funcionário)
const { db } = require('./db');
const { today } = require('./util');
const { bad } = require('./routes-cadastros');

const CAMPOS = ['nome', 'cpf', 'cargo', 'telefone', 'email', 'pix', 'salario', 'admissao', 'demissao', 'observacoes'];
function dados(b) {
  const d = {};
  CAMPOS.forEach((k) => { const v = b[k]; d[k] = v === '' || v == null ? null : typeof v === 'string' ? v.trim().slice(0, k === 'observacoes' ? 1000 : 150) : v; });
  d.salario = Number(d.salario) > 0 ? Number(d.salario) : 0;
  if (!d.nome) throw bad('Informe o nome do funcionário.');
  if (d.admissao && !/^\d{4}-\d{2}-\d{2}$/.test(d.admissao)) d.admissao = null;
  if (d.demissao && !/^\d{4}-\d{2}-\d{2}$/.test(d.demissao)) d.demissao = null;
  return d;
}

module.exports = function (api, can) {
  api.get('/funcionarios', can('financeiro'), (req, res) => {
    if (req.query.simples) return res.json(db.prepare('SELECT id,nome,cargo,salario,ativo FROM funcionarios ORDER BY ativo DESC, nome').all());
    const ano = today().slice(0, 4);
    res.json(db.prepare(`SELECT f.*,
        (SELECT COALESCE(SUM(valor),0) FROM lancamentos l WHERE l.funcionario_id=f.id AND l.status='pago' AND substr(l.data_pagamento,1,4)=?) pago_ano,
        (SELECT MAX(data_pagamento) FROM lancamentos l WHERE l.funcionario_id=f.id AND l.status='pago') ultimo_pagamento,
        (SELECT COALESCE(SUM(valor),0) FROM lancamentos l WHERE l.funcionario_id=f.id AND l.status='pendente') a_pagar
      FROM funcionarios f ORDER BY f.ativo DESC, f.nome`).all(ano));
  });
  api.get('/funcionarios/:id', can('financeiro'), (req, res) => {
    const f = db.prepare('SELECT * FROM funcionarios WHERE id=?').get(req.params.id);
    if (!f) return res.status(404).json({ error: 'Funcionário não encontrado.' });
    f.pagamentos = db.prepare(`SELECT l.id,l.descricao,l.categoria,l.valor,l.vencimento,l.data_pagamento,l.status,c.nome conta_nome FROM lancamentos l
      LEFT JOIN contas c ON c.id=l.conta_id WHERE l.funcionario_id=? AND l.status!='cancelado' ORDER BY COALESCE(l.data_pagamento,l.vencimento) DESC, l.id DESC LIMIT 500`).all(f.id);
    res.json(f);
  });
  api.post('/funcionarios', can('financeiro'), (req, res) => {
    const d = dados(req.body || {});
    const r = db.prepare(`INSERT INTO funcionarios(${CAMPOS.join(',')}) VALUES (${CAMPOS.map(() => '?').join(',')})`).run(...CAMPOS.map((k) => d[k]));
    res.json({ id: r.lastInsertRowid });
  });
  api.put('/funcionarios/:id', can('financeiro'), (req, res) => {
    const cur = db.prepare('SELECT * FROM funcionarios WHERE id=?').get(req.params.id);
    if (!cur) return res.status(404).json({ error: 'Funcionário não encontrado.' });
    const d = dados(req.body || {});
    const ativo = req.body.ativo === 0 || req.body.ativo === '0' ? 0 : 1;
    db.prepare(`UPDATE funcionarios SET ${CAMPOS.map((k) => k + '=?').join(',')}, ativo=? WHERE id=?`).run(...CAMPOS.map((k) => d[k]), ativo, cur.id);
    res.json({ ok: true });
  });
  api.delete('/funcionarios/:id', can('financeiro'), (req, res) => {
    const cur = db.prepare('SELECT * FROM funcionarios WHERE id=?').get(req.params.id);
    if (!cur) return res.json({ ok: true });
    // com pagamentos lançados, só desativa (o histórico continua)
    if (db.prepare('SELECT 1 FROM lancamentos WHERE funcionario_id=?').get(cur.id)) {
      db.prepare('UPDATE funcionarios SET ativo=0 WHERE id=?').run(cur.id);
      return res.json({ ok: true, inativado: true });
    }
    db.prepare('DELETE FROM funcionarios WHERE id=?').run(cur.id);
    res.json({ ok: true });
  });
};
