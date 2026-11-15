// Contas fixas: despesas que se repetem todo mês e viram contas a pagar sozinhas
import { get, post, put, del, esc, brl, dt, today, table, modal, confirmDlg, toast, fail, field, moneyField, selectField, areaField, icon, pill, FORMAS } from '../core.js';
import { setCrumbs } from '../main.js';

const mesAtual = () => today().slice(0, 7);
const mesBR = (m) => (m ? `${m.slice(5)}/${m.slice(0, 4)}` : '');

async function form(f, done) {
  const [cats, contas] = await Promise.all([get('/financeiro/categorias'), get('/contas')]);
  const padrao = (contas.find((c) => c.tipo === 'banco') || contas[0] || {}).id;
  modal({
    title: f ? 'Editar conta fixa' : 'Nova conta fixa', size: 'wide', submitLabel: f ? 'Salvar' : 'Cadastrar',
    body: `<div class="form-grid">
      ${field('Descrição', 'descricao', f && f.descricao, { cls: 'c8', attrs: 'required maxlength="150" placeholder="Ex.: Aluguel da loja, Energia, Internet, Salário da Dona Maria"' })}
      <label class="c4">Categoria<input name="categoria" list="cats-fixas" value="${esc((f && f.categoria) || '')}" placeholder="Ex.: Aluguel"><datalist id="cats-fixas">${cats.saida.map((c) => `<option value="${esc(c)}">`).join('')}</datalist></label>
      ${moneyField('Valor previsto', 'valor', f && f.valor, { cls: 'c4', attrs: 'required', hint: 'Para contas que variam (luz, água), ajuste o valor na conta a pagar quando ela chegar.' })}
      ${field('Dia do vencimento', 'dia', f ? f.dia : 10, { type: 'number', cls: 'c4', attrs: 'required min="1" max="31"', hint: 'Dia 31 em meses mais curtos vira o último dia.' })}
      ${selectField('Conta', 'conta_id', contas.map((c) => [c.id, c.nome]), (f && f.conta_id) || padrao, { cls: 'c4' })}
      ${selectField('Forma de pagamento', 'forma', { '': '—', ...FORMAS }, f && f.forma, { cls: 'c4' })}
      ${field('Começa em', 'inicio', (f && f.inicio) || mesAtual(), { type: 'month', cls: 'c4', hint: 'Primeiro mês que gera conta a pagar.' })}
      ${field('Termina em (opcional)', 'fim', f && f.fim, { type: 'month', cls: 'c4', hint: 'Deixe vazio se não tem fim (ex.: contrato de 12 meses).' })}
      ${areaField('Observações', 'observacoes', f && f.observacoes, { rows: 2 })}</div>
      <p class="hint" style="margin:0">O sistema cria sozinho a conta a pagar do mês atual e a do próximo mês. Ela aparece em <strong>Contas a pagar e receber</strong>, onde você dá baixa normalmente.</p>`,
    onSubmit: async (d) => {
      const r = f ? await put('/contas-fixas/' + f.id, d) : await post('/contas-fixas', d);
      toast(f ? 'Conta fixa salva.' : `Conta fixa cadastrada${r.geradas ? ` e ${r.geradas} conta(s) a pagar criada(s)` : ''}.`);
      done && done();
    },
  });
}

export async function render(view) {
  setCrumbs('Financeiro', 'Contas fixas');
  const rows = await get('/contas-fixas');
  const ativas = rows.filter((f) => f.ativo);
  const totalMes = ativas.reduce((a, f) => a + f.valor, 0);
  view.innerHTML = `<div class="ph"><div><p class="eyebrow">FINANCEIRO</p><h1>Contas fixas</h1><p>Despesas que se repetem todo mês. Cada uma vira uma conta a pagar sozinha, no dia do vencimento.</p></div>
    <div class="acts"><a class="btn ghost" href="#/lancamentos">Ver contas a pagar</a><button class="btn" id="nova">${icon('plus')}Nova conta fixa</button></div></div>
    <div class="grid g3">
      <div class="kpi dark"><div class="k">Total previsto por mês</div><div class="v">${brl(totalMes)}</div><div class="s">${ativas.length} conta(s) ativa(s)</div></div>
      <div class="kpi"><div class="k">Pagas neste mês</div><div class="v">${ativas.filter((f) => f.status_mes === 'pago').length} de ${ativas.length}</div></div>
      <div class="kpi"><div class="k">Pausadas</div><div class="v">${rows.length - ativas.length}</div></div></div>
    <div class="card" style="margin-top:18px">
    ${table([
      { label: 'Conta', html: (f) => `<div class="t1">${esc(f.descricao)} ${f.ativo ? '' : pill('Pausada')}</div><div class="t2">${esc(f.categoria || 'Sem categoria')}${f.conta_nome ? ' · ' + esc(f.conta_nome) : ''}</div>` },
      { label: 'Vence', html: (f) => `todo dia ${f.dia}<div class="t2">${f.fim ? `de ${mesBR(f.inicio)} a ${mesBR(f.fim)}` : `desde ${mesBR(f.inicio)}`}</div>` },
      { label: 'Este mês', html: (f) => (!f.ativo ? '<span class="muted">–</span>' : f.status_mes === 'pago' ? pill('Paga', 'ok') : f.status_mes ? pill('A pagar', 'warn') : '<span class="muted">não gerada</span>') },
      { label: 'Próximo vencimento', html: (f) => (f.proximo ? dt(f.proximo) : '–') },
      { label: 'Valor previsto', num: true, html: (f) => `<strong>${brl(f.valor)}</strong>` },
      { label: '', cls: 'nowrap right', html: (f) => `<button class="btn sm ghost" data-ed="${f.id}">Editar</button> <button class="btn sm ghost" data-at="${f.id}">${f.ativo ? 'Pausar' : 'Reativar'}</button> <button class="btn sm danger" data-rm="${f.id}" aria-label="Excluir ${esc(f.descricao)}">×</button>` },
    ], rows, { empty: 'Nenhuma conta fixa cadastrada. Comece pelo aluguel, energia, internet e salários.' })}</div>`;
  const re = () => render(view).catch(fail);
  const achar = (id) => rows.find((f) => String(f.id) === String(id));
  view.querySelector('#nova').onclick = () => form(null, re).catch(fail);
  view.querySelectorAll('[data-ed]').forEach((b) => (b.onclick = () => form(achar(b.dataset.ed), re).catch(fail)));
  view.querySelectorAll('[data-at]').forEach((b) => (b.onclick = async () => {
    const f = achar(b.dataset.at);
    if (f.ativo && !(await confirmDlg(`Pausar "${f.descricao}"? As contas a pagar dos próximos meses saem; a deste mês continua.`, 'Pausar'))) return;
    try { await put('/contas-fixas/' + f.id, { ativo: f.ativo ? 0 : 1 }); toast(f.ativo ? 'Conta pausada.' : 'Conta reativada.'); re(); } catch (e) { fail(e); }
  }));
  view.querySelectorAll('[data-rm]').forEach((b) => (b.onclick = async () => {
    const f = achar(b.dataset.rm);
    if (!(await confirmDlg(`Excluir a conta fixa "${f.descricao}"? As contas a pagar ainda pendentes deste mês em diante também saem. As já pagas continuam no histórico.`, 'Excluir'))) return;
    try { await del('/contas-fixas/' + f.id); toast('Conta fixa excluída.'); re(); } catch (e) { fail(e); }
  }));
}
