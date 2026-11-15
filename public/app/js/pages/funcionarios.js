// Funcionários: cadastro e histórico de salários pagos
import { get, post, put, del, esc, brl, dt, table, bindRows, modal, confirmDlg, toast, fail, field, moneyField, areaField, icon, pill } from '../core.js';
import { setCrumbs } from '../main.js';

export function funcForm(f, done) {
  modal({
    title: f ? 'Editar funcionário' : 'Novo funcionário', size: 'wide', submitLabel: f ? 'Salvar' : 'Cadastrar',
    body: `<div class="form-grid">
      ${field('Nome', 'nome', f && f.nome, { cls: 'c6', attrs: 'required maxlength="150"' })}${field('Cargo / função', 'cargo', f && f.cargo, { cls: 'c3', attrs: 'placeholder="Ex.: Vendedor, Limpeza"' })}${field('CPF', 'cpf', f && f.cpf, { cls: 'c3' })}
      ${field('Telefone', 'telefone', f && f.telefone, { cls: 'c4' })}${field('E-mail', 'email', f && f.email, { type: 'email', cls: 'c4' })}${field('Chave PIX', 'pix', f && f.pix, { cls: 'c4' })}
      ${moneyField('Salário', 'salario', f && f.salario, { cls: 'c4', hint: 'Sugerido ao lançar o salário no financeiro.' })}${field('Admissão', 'admissao', f && f.admissao, { type: 'date', cls: 'c4' })}${field('Demissão', 'demissao', f && f.demissao, { type: 'date', cls: 'c4' })}
      ${areaField('Observações', 'observacoes', f && f.observacoes, { rows: 2 })}
      ${f ? `<label class="check c12"><input type="checkbox" name="ativo" ${f.ativo ? 'checked' : ''}> Funcionário ativo (aparece na lista ao lançar salários)</label>` : ''}</div>`,
    onSubmit: async (d) => {
      if (f) await put('/funcionarios/' + f.id, { ...d, ativo: d.ativo ?? 1 }); else await post('/funcionarios', d);
      toast(f ? 'Funcionário salvo.' : 'Funcionário cadastrado.'); done && done();
    },
  });
}

export async function list(view) {
  setCrumbs('Financeiro', 'Funcionários');
  const rows = await get('/funcionarios');
  const ativos = rows.filter((f) => f.ativo);
  view.innerHTML = `<div class="ph"><div><p class="eyebrow">FINANCEIRO</p><h1>Funcionários</h1><p>Cadastro da equipe e histórico de salários pagos. Ao lançar uma saída de Salários, escolha o funcionário.</p></div>
    <div class="acts"><button class="btn" id="novo">${icon('plus')}Novo funcionário</button></div></div>
    <div class="grid g3">
      <div class="kpi dark"><div class="k">Folha mensal (salários cadastrados)</div><div class="v">${brl(ativos.reduce((a, f) => a + (f.salario || 0), 0))}</div><div class="s">${ativos.length} funcionário(s) ativo(s)</div></div>
      <div class="kpi"><div class="k">Pago no ano</div><div class="v">${brl(rows.reduce((a, f) => a + f.pago_ano, 0))}</div></div>
      <div class="kpi"><div class="k">A pagar</div><div class="v">${brl(rows.reduce((a, f) => a + f.a_pagar, 0))}</div><div class="s">salários lançados e ainda pendentes</div></div></div>
    <div class="card" style="margin-top:18px">
    ${table([
      { label: 'Funcionário', html: (f) => `<div class="t1">${esc(f.nome)} ${f.ativo ? '' : pill('Inativo')}</div><div class="t2">${esc(f.cargo || '')}${f.telefone ? ' · ' + esc(f.telefone) : ''}</div>` },
      { label: 'Admissão', html: (f) => (f.admissao ? dt(f.admissao) : '–') },
      { label: 'Salário', num: true, html: (f) => brl(f.salario) },
      { label: 'Último pagamento', html: (f) => (f.ultimo_pagamento ? dt(f.ultimo_pagamento) : '–') },
      { label: 'Pago no ano', num: true, html: (f) => brl(f.pago_ano) },
      { label: 'A pagar', num: true, html: (f) => (f.a_pagar > 0.009 ? `<strong class="gold">${brl(f.a_pagar)}</strong>` : brl(0)) },
    ], rows, { onRow: true, empty: 'Nenhum funcionário cadastrado.' })}</div>`;
  bindRows(view, rows, (f) => (location.hash = '#/funcionario/' + f.id));
  view.querySelector('#novo').onclick = () => funcForm(null, () => list(view).catch(fail));
}

export async function detail(view, { id }) {
  const f = await get('/funcionarios/' + id);
  setCrumbs('Funcionários', f.nome);
  const pagos = f.pagamentos.filter((p) => p.status === 'pago');
  view.innerHTML = `<div class="ph"><div><p class="eyebrow">FUNCIONÁRIO ${f.ativo ? '' : '· INATIVO'}</p><h1>${esc(f.nome)}</h1>
      <p>${[f.cargo, f.cpf && 'CPF ' + f.cpf, f.telefone, f.email, f.pix && 'PIX: ' + f.pix].filter(Boolean).map(esc).join(' · ')}</p></div>
    <div class="acts"><button class="btn ghost" id="ed">Editar</button><button class="btn danger" id="rm">Excluir</button></div></div>
    <div class="grid g4">
      <div class="kpi dark"><div class="k">Salário</div><div class="v">${brl(f.salario)}</div></div>
      <div class="kpi"><div class="k">Admissão</div><div class="v">${f.admissao ? dt(f.admissao) : '–'}</div><div class="s">${f.demissao ? 'demissão ' + dt(f.demissao) : ''}</div></div>
      <div class="kpi"><div class="k">Total pago</div><div class="v">${brl(pagos.reduce((a, p) => a + p.valor, 0))}</div><div class="s">${pagos.length} pagamento(s)</div></div>
      <div class="kpi"><div class="k">A pagar</div><div class="v">${brl(f.pagamentos.filter((p) => p.status === 'pendente').reduce((a, p) => a + p.valor, 0))}</div></div></div>
    ${f.observacoes ? `<div class="alert info" style="margin-top:16px;white-space:pre-wrap">${esc(f.observacoes)}</div>` : ''}
    <div class="card" style="margin-top:18px"><h2>Pagamentos</h2>
    ${table([
      { label: 'Data', html: (p) => dt(p.data_pagamento || p.vencimento) },
      { label: 'Descrição', html: (p) => `<div class="t1">${esc(p.descricao)}</div><div class="t2">${esc(p.categoria || '')}${p.conta_nome ? ' · ' + esc(p.conta_nome) : ''}</div>` },
      { label: 'Situação', html: (p) => (p.status === 'pago' ? pill('Pago', 'ok') : pill('A pagar', 'warn')) },
      { label: 'Valor', num: true, html: (p) => `<strong>${brl(p.valor)}</strong>` },
    ], f.pagamentos, { empty: 'Nenhum pagamento lançado. Em Contas a pagar e receber, faça uma Nova saída na categoria Salários e escolha este funcionário.' })}</div>`;
  view.querySelector('#ed').onclick = () => funcForm(f, () => detail(view, { id }).catch(fail));
  view.querySelector('#rm').onclick = async () => {
    if (!(await confirmDlg(`Excluir ${f.nome}? Se já tiver pagamentos lançados, o cadastro é apenas desativado e o histórico continua.`, 'Excluir'))) return;
    try { const r = await del('/funcionarios/' + f.id); toast(r.inativado ? 'Funcionário desativado (tem pagamentos).' : 'Funcionário excluído.'); location.hash = '#/funcionarios'; } catch (e) { fail(e); }
  };
}
