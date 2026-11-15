// Contas fixas: cadastro de despesas que se repetem todo mês (aluguel, luz, internet, salários...).
// Cada conta fixa gera, sozinha, uma conta a pagar por mês (mês atual e o próximo), no dia de vencimento escolhido.
// - Valor é o previsto; contas variáveis (luz, água) têm o valor ajustado na própria conta a pagar quando chegar.
// - Editar a conta fixa atualiza as contas a pagar ainda pendentes deste mês em diante.
// - Pausar ou excluir apaga as pendentes de meses futuros; as já pagas ficam no histórico.
const { db, contaPadrao } = require('./db');
const { today } = require('./util');
const { bad } = require('./routes-cadastros');

const MES = /^\d{4}-\d{2}$/;
const mesDe = (d = today()) => String(d).slice(0, 7);
const somaMes = (m, n) => { const [y, mo] = m.split('-').map(Number); const d = new Date(y, mo - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
// dia 31 em fevereiro vira o último dia do mês
const vencimento = (m, dia) => { const [y, mo] = m.split('-').map(Number); const ult = new Date(y, mo, 0).getDate(); return `${m}-${String(Math.min(dia, ult)).padStart(2, '0')}`; };
const descMes = (f, m) => `${f.descricao} (${m.slice(5)}/${m.slice(0, 4)})`;

// gera as contas a pagar que faltam (mês atual e o próximo) para as contas fixas ativas
function gerar(id = null) {
  const atual = mesDe();
  const ate = somaMes(atual, 1);
  const fixas = db.prepare(`SELECT * FROM contas_fixas WHERE ativo=1 ${id ? 'AND id=?' : ''}`).all(...(id ? [id] : []));
  const existe = db.prepare('SELECT 1 FROM lancamentos WHERE conta_fixa_id=? AND competencia=?');
  const ins = db.prepare(`INSERT INTO lancamentos(tipo,descricao,categoria,valor,vencimento,status,conta_id,forma,pessoa_id,observacoes,conta_fixa_id,competencia,criado_por)
    VALUES ('saida',?,?,?,?,'pendente',?,?,?,?,?,?,?)`);
  let n = 0;
  db.transaction(() => {
    for (const f of fixas) {
      let m = f.inicio > atual ? f.inicio : atual;
      for (; m <= ate; m = somaMes(m, 1)) {
        if (f.fim && m > f.fim) break;
        if (existe.get(f.id, m)) continue;
        ins.run(descMes(f, m), f.categoria || null, f.valor, vencimento(m, f.dia), f.conta_id || contaPadrao(), f.forma || null, f.pessoa_id || null, f.observacoes || null, f.id, m, f.criado_por || null);
        n++;
      }
    }
  })();
  return n;
}
// pendentes deste mês em diante acompanham a conta fixa editada
function atualizarPendentes(f, valorAntigo = f.valor) {
  const atual = mesDe();
  const rows = db.prepare("SELECT id, competencia, valor FROM lancamentos WHERE conta_fixa_id=? AND status='pendente' AND competencia>=?").all(f.id, atual);
  const up = db.prepare('UPDATE lancamentos SET descricao=?, categoria=?, valor=?, vencimento=?, conta_id=?, forma=?, pessoa_id=? WHERE id=?');
  const del = db.prepare('DELETE FROM lancamentos WHERE id=?');
  rows.forEach((r) => {
    const fora = r.competencia < f.inicio || (f.fim && r.competencia > f.fim);
    // pausada: a do mês atual continua (já está devendo); as dos próximos meses saem
    if (fora || (!f.ativo && r.competencia > atual)) return del.run(r.id);
    if (!f.ativo) return;
    // valor já ajustado à mão (ex.: conta de luz que chegou) é mantido
    up.run(descMes(f, r.competencia), f.categoria || null, Math.abs(r.valor - valorAntigo) < 0.005 ? f.valor : r.valor, vencimento(r.competencia, f.dia), f.conta_id || contaPadrao(), f.forma || null, f.pessoa_id || null, r.id);
  });
}

function validar(b) {
  const d = {
    descricao: String(b.descricao || '').trim().slice(0, 150),
    categoria: String(b.categoria || '').trim().slice(0, 80) || null,
    valor: Number(b.valor),
    dia: Math.round(Number(b.dia)),
    conta_id: Number(b.conta_id) || null,
    forma: b.forma || null,
    pessoa_id: Number(b.pessoa_id) || null,
    inicio: MES.test(b.inicio || '') ? b.inicio : mesDe(),
    fim: MES.test(b.fim || '') ? b.fim : null,
    observacoes: String(b.observacoes || '').trim().slice(0, 1000) || null,
  };
  if (!d.descricao) throw bad('Informe a descrição da conta (ex.: Aluguel da loja).');
  if (!(d.valor > 0)) throw bad('Informe o valor previsto da conta.');
  if (!(d.dia >= 1 && d.dia <= 31)) throw bad('O dia de vencimento vai de 1 a 31.');
  if (d.fim && d.fim < d.inicio) throw bad('O último mês não pode ser antes do primeiro.');
  return d;
}

function lista() {
  const atual = mesDe();
  return db.prepare(`SELECT f.*, c.nome conta_nome, p.nome pessoa_nome,
      (SELECT MIN(vencimento) FROM lancamentos l WHERE l.conta_fixa_id=f.id AND l.status='pendente') proximo,
      (SELECT status FROM lancamentos l WHERE l.conta_fixa_id=f.id AND l.competencia=?) status_mes,
      (SELECT COUNT(*) FROM lancamentos l WHERE l.conta_fixa_id=f.id AND l.status='pago') pagas
    FROM contas_fixas f LEFT JOIN contas c ON c.id=f.conta_id LEFT JOIN pessoas p ON p.id=f.pessoa_id
    ORDER BY f.ativo DESC, f.dia, f.descricao`).all(atual);
}

function rotas(api, can) {
  api.get('/contas-fixas', can('financeiro'), (req, res) => res.json(lista()));
  api.post('/contas-fixas', can('financeiro'), (req, res) => {
    const d = validar(req.body || {});
    const r = db.prepare(`INSERT INTO contas_fixas(descricao,categoria,valor,dia,conta_id,forma,pessoa_id,inicio,fim,observacoes,criado_por)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(d.descricao, d.categoria, d.valor, d.dia, d.conta_id, d.forma, d.pessoa_id, d.inicio, d.fim, d.observacoes, req.user.id);
    const geradas = gerar(r.lastInsertRowid);
    res.json({ id: r.lastInsertRowid, geradas });
  });
  api.put('/contas-fixas/:id', can('financeiro'), (req, res) => {
    const cur = db.prepare('SELECT * FROM contas_fixas WHERE id=?').get(req.params.id);
    if (!cur) return res.status(404).json({ error: 'Conta fixa não encontrada.' });
    const b = req.body || {};
    // só pausar/ativar
    if (Object.keys(b).length === 1 && 'ativo' in b) {
      db.transaction(() => {
        db.prepare('UPDATE contas_fixas SET ativo=? WHERE id=?').run(b.ativo ? 1 : 0, cur.id);
        atualizarPendentes(db.prepare('SELECT * FROM contas_fixas WHERE id=?').get(cur.id));
      })();
      return res.json({ ok: true, geradas: b.ativo ? gerar(cur.id) : 0 });
    }
    const d = validar(b);
    db.transaction(() => {
      db.prepare('UPDATE contas_fixas SET descricao=?,categoria=?,valor=?,dia=?,conta_id=?,forma=?,pessoa_id=?,inicio=?,fim=?,observacoes=? WHERE id=?')
        .run(d.descricao, d.categoria, d.valor, d.dia, d.conta_id, d.forma, d.pessoa_id, d.inicio, d.fim, d.observacoes, cur.id);
      atualizarPendentes(db.prepare('SELECT * FROM contas_fixas WHERE id=?').get(cur.id), cur.valor);
    })();
    res.json({ ok: true, geradas: gerar(cur.id) });
  });
  api.delete('/contas-fixas/:id', can('financeiro'), (req, res) => {
    const cur = db.prepare('SELECT * FROM contas_fixas WHERE id=?').get(req.params.id);
    if (!cur) return res.json({ ok: true });
    db.transaction(() => {
      // pendentes do mês atual em diante saem; pagas e vencidas antigas ficam no histórico (sem vínculo)
      db.prepare("DELETE FROM lancamentos WHERE conta_fixa_id=? AND status='pendente' AND competencia>=?").run(cur.id, mesDe());
      db.prepare('DELETE FROM contas_fixas WHERE id=?').run(cur.id);
    })();
    res.json({ ok: true });
  });
}

// confere de hora em hora (vira o mês sozinho, sem precisar abrir o sistema)
function agendar() {
  try { const n = gerar(); if (n) console.log(`[M2] Contas fixas: ${n} conta(s) a pagar gerada(s).`); } catch (e) { console.error('[M2] Contas fixas:', e.message); }
  setInterval(() => { try { gerar(); } catch (e) { /* tenta na próxima */ } }, 60 * 60e3).unref();
}

module.exports = { rotas, gerar, agendar };
