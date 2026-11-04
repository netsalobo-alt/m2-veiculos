import { get, post, put, del, esc, brl, dt, today, monthStart, monthEnd, modal, confirmDlg, toast, fail, field, moneyField, selectField, areaField, table, pill, icon, FORMAS, MESES } from '../core.js';
import { setCrumbs } from '../main.js';

let mesOff = 0;
const mesLabel = (off) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + off); return `${MESES[d.getMonth()]}/${d.getFullYear()}`; };

// ------------------------------------------------------------------ fluxo de caixa
export async function fluxo(view) {
  setCrumbs('Financeiro', 'Fluxo de caixa');
  const de = monthStart(mesOff), ate = monthEnd(mesOff);
  const [r, fx] = await Promise.all([get(`/financeiro/resumo?de=${de}&ate=${ate}`), get(`/financeiro/fluxo?de=${de}&ate=${ate}`)]);
  view.innerHTML = `<div class="ph"><div><p class="eyebrow">FINANCEIRO</p><h1>Fluxo de caixa</h1><p>Entradas e saídas realizadas e previstas, com saldo dia a dia.</p></div>
    <div class="acts"><button class="btn ghost" id="contas">Contas e caixas</button><button class="btn ghost" id="nsai">${icon('plus')}Nova saída</button><button class="btn" id="nent">${icon('plus')}Nova entrada</button></div></div>
    <div class="filters" style="align-items:center"><div class="seg" role="group" aria-label="Mês">
      <button type="button" id="prev" aria-label="Mês anterior">←</button><button type="button" aria-pressed="true" style="min-width:110px">${mesLabel(mesOff)}</button><button type="button" id="next" aria-label="Próximo mês">→</button></div>
      ${mesOff ? '<button class="btn sm ghost" id="hoje">Mês atual</button>' : ''}</div>
    <div class="grid g4">
      <div class="kpi dark"><div class="k">Saldo atual (todas as contas)</div><div class="v">${brl(r.saldo_atual)}</div><div class="s">${r.contas.map((c) => `${esc(c.nome)}: ${brl(c.saldo)}`).join(' · ')}</div></div>
      <div class="kpi"><div class="k">Entradas realizadas no mês</div><div class="v pos">${brl(r.entradas)}</div></div>
      <div class="kpi"><div class="k">Saídas realizadas no mês</div><div class="v neg">${brl(r.saidas)}</div></div>
      <div class="kpi"><div class="k">Resultado de caixa no mês</div><div class="v ${r.entradas - r.saidas < 0 ? 'neg' : ''}">${brl(r.entradas - r.saidas)}</div></div>
      <div class="kpi"><div class="k">Total a receber</div><div class="v">${brl(r.a_receber)}</div><div class="s">${r.receber_vencido ? `<span class="neg">${brl(r.receber_vencido)} vencido</span>` : 'Nada vencido'}</div></div>
      <div class="kpi"><div class="k">Total a pagar</div><div class="v">${brl(r.a_pagar)}</div><div class="s">${r.pagar_vencido ? `<span class="neg">${brl(r.pagar_vencido)} vencido</span>` : 'Nada vencido'}</div></div>
      <div class="kpi"><div class="k">Saldo no fim do mês (realizado)</div><div class="v">${brl(fx.saldo_final)}</div></div>
      <div class="kpi"><div class="k">Saldo previsto no fim do mês</div><div class="v ${fx.saldo_final_previsto < 0 ? 'neg' : ''}">${brl(fx.saldo_final_previsto)}</div><div class="s">Inclui pendentes do mês</div></div>
    </div>
    <section class="card" style="margin-top:18px"><div class="card-h"><h2>Movimento diário · ${mesLabel(mesOff)}</h2><span class="muted">Saldo inicial: <strong>${brl(fx.saldo_inicial)}</strong>${fx.atrasados ? ` · pendentes atrasados de meses anteriores: <strong>${brl(fx.atrasados)}</strong>` : ''}</span></div>
      ${table([
        { label: 'Dia', html: (d) => `${dt(d.dia)}${d.dia === today() ? ' ' + pill('Hoje', 'info') : ''}` },
        { label: 'Entradas', num: true, html: (d) => (d.entradas ? `<span class="pos">${brl(d.entradas)}</span>` : '–') },
        { label: 'Saídas', num: true, html: (d) => (d.saidas ? `<span class="neg">${brl(d.saidas)}</span>` : '–') },
        { label: 'A receber', num: true, html: (d) => (d.entradas_prev ? brl(d.entradas_prev) : '–') },
        { label: 'A pagar', num: true, html: (d) => (d.saidas_prev ? brl(d.saidas_prev) : '–') },
        { label: 'Saldo realizado', num: true, html: (d) => `<strong class="${d.saldo < 0 ? 'neg' : ''}">${brl(d.saldo)}</strong>` },
        { label: 'Saldo previsto', num: true, html: (d) => `<span class="${d.saldo_previsto < 0 ? 'neg' : ''}">${brl(d.saldo_previsto)}</span>` },
      ], fx.dias, { empty: 'Nenhuma movimentação neste mês.', foot: fx.dias.length ? ['Total', brl(fx.dias.reduce((a, d) => a + d.entradas, 0)), brl(fx.dias.reduce((a, d) => a + d.saidas, 0)), brl(fx.dias.reduce((a, d) => a + d.entradas_prev, 0)), brl(fx.dias.reduce((a, d) => a + d.saidas_prev, 0)), brl(fx.saldo_final), brl(fx.saldo_final_previsto)] : null })}
      <p class="small" style="margin:14px 0 0">Realizado = lançamentos pagos/recebidos na data do pagamento. Previsto = pendentes na data de vencimento.</p></section>`;
  const re = () => fluxo(view).catch(fail);
  view.querySelector('#prev').onclick = () => { mesOff--; re(); };
  view.querySelector('#next').onclick = () => { mesOff++; re(); };
  const h = view.querySelector('#hoje'); if (h) h.onclick = () => { mesOff = 0; re(); };
  view.querySelector('#nent').onclick = () => lancForm({ tipo: 'entrada' }, re);
  view.querySelector('#nsai').onclick = () => lancForm({ tipo: 'saida' }, re);
  view.querySelector('#contas').onclick = () => contasDlg(re);
}

// ------------------------------------------------------------------ lançamento
export async function lancForm(l, onSaved) {
  const [cats, contas] = await Promise.all([get('/financeiro/categorias'), get('/contas')]);
  const novo = !l.id;
  const tipo = l.tipo || 'saida';
  const auto = l.custo_id || l.venda_id || (l.categoria === 'Compra de veículos' && l.veiculo_id);
  modal({
    title: novo ? (tipo === 'entrada' ? 'Nova entrada' : 'Nova saída') : 'Editar lançamento', size: 'wide',
    body: `${auto ? '<div class="alert info">Lançamento gerado automaticamente por um veículo, custo ou venda. Você pode dar baixa e ajustar datas e conta.</div>' : ''}
      <div class="form-grid">
      ${field('Descrição', 'descricao', l.descricao, { cls: 'c8', attrs: 'required' })}
      <label class="c4">Categoria<input name="categoria" list="cats" value="${esc(l.categoria || '')}"><datalist id="cats">${cats[tipo].map((c) => `<option value="${esc(c)}">`).join('')}</datalist></label>
      ${moneyField('Valor', 'valor', l.valor, { cls: 'c4', attrs: 'required' })}
      ${field('Vencimento', 'vencimento', l.vencimento || today(), { type: 'date', cls: 'c4' })}
      ${selectField('Conta', 'conta_id', contas.map((c) => [c.id, c.nome]), l.conta_id || (contas[0] && contas[0].id), { cls: 'c4' })}
      ${selectField('Forma', 'forma', { '': '—', ...FORMAS }, l.forma, { cls: 'c4' })}
      ${selectField('Situação', 'status', { pendente: tipo === 'entrada' ? 'A receber' : 'A pagar', pago: tipo === 'entrada' ? 'Recebido' : 'Pago' }, l.status || 'pendente', { cls: 'c4' })}
      ${field('Data do pagamento', 'data_pagamento', l.data_pagamento || today(), { type: 'date', cls: 'c4' })}
      ${novo ? field('Repetir mensalmente (parcelas)', 'parcelas', 1, { type: 'number', cls: 'c4', attrs: 'min="1" max="60"', hint: 'Ex.: aluguel 12x, empréstimo 24x.' }) : ''}
      ${areaField('Observações', 'observacoes', l.observacoes, { rows: 2 })}</div>`,
    onSubmit: async (d) => {
      d.tipo = tipo;
      if (novo) await post('/lancamentos', d); else await put('/lancamentos/' + l.id, d);
      toast('Lançamento salvo.'); onSaved && onSaved();
    },
  });
}

function contasDlg(onSaved) {
  get('/contas').then((contas) => {
    const m = modal({
      title: 'Contas e caixas', size: 'wide',
      body: `${table([{ label: 'Conta', key: 'nome' }, { label: 'Tipo', html: (c) => ({ caixa: 'Caixa', banco: 'Banco', aplicacao: 'Aplicação' }[c.tipo] || c.tipo) }, { label: 'Saldo inicial', num: true, html: (c) => brl(c.saldo_inicial) }, { label: 'Saldo atual', num: true, html: (c) => `<strong>${brl(c.saldo)}</strong>` }, { label: '', html: () => '<button class="btn sm ghost" data-ed>Editar</button>' }], contas)}
        <form id="nc" class="form-grid" style="margin-top:16px"><p class="form-sec">Nova conta</p>${field('Nome', 'nome', '', { cls: 'c4' })}${selectField('Tipo', 'tipo', { banco: 'Banco', caixa: 'Caixa', aplicacao: 'Aplicação' }, 'banco', { cls: 'c3' })}${moneyField('Saldo inicial', 'saldo_inicial', '', { cls: 'c3' })}<div class="c2" style="display:flex;align-items:end"><button class="btn full" type="submit">Adicionar</button></div></form>`,
    });
    m.el.querySelectorAll('tbody tr').forEach((tr, i) => (tr.querySelector('[data-ed]').onclick = () => {
      const c = contas[i];
      modal({ title: 'Editar conta', body: field('Nome', 'nome', c.nome) + moneyField('Saldo inicial', 'saldo_inicial', c.saldo_inicial, { hint: 'Saldo da conta antes do primeiro lançamento no sistema.' }) + `<label class="check"><input type="checkbox" name="ativo" ${c.ativo ? 'checked' : ''}> Ativa</label>`,
        onSubmit: async (d) => { await put('/contas/' + c.id, d); m.close(); toast('Conta salva.'); onSaved(); } });
    }));
    m.el.querySelector('#nc').onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target;
      try { await post('/contas', { nome: f.nome.value, tipo: f.tipo.value, saldo_inicial: f.saldo_inicial.value.replace(/\./g, '').replace(',', '.') }); m.close(); toast('Conta criada.'); onSaved(); } catch (err) { fail(err); }
    };
  }).catch(fail);
}

// ------------------------------------------------------------------ contas a pagar / receber
const lf = { aba: 'receber', de: '', ate: '', q: '' };
export async function lancamentos(view, { params }) {
  setCrumbs('Financeiro', 'Contas a pagar e receber');
  if (params.status === 'vencido') lf.aba = 'vencido';
  const ABAS = [['receber', 'A receber'], ['pagar', 'A pagar'], ['vencido', 'Vencidos'], ['pago', 'Pagos / recebidos'], ['todos', 'Todos']];
  view.innerHTML = `<div class="ph"><div><p class="eyebrow">FINANCEIRO</p><h1>Contas a pagar e receber</h1><p>Baixe recebimentos e pagamentos e acompanhe vencimentos.</p></div>
    <div class="acts"><button class="btn ghost" id="nsai">${icon('plus')}Nova saída</button><button class="btn" id="nent">${icon('plus')}Nova entrada</button></div></div>
    <div class="tabs" role="tablist">${ABAS.map(([k, l]) => `<button role="tab" data-aba="${k}" aria-selected="${lf.aba === k}">${l}</button>`).join('')}</div>
    <div class="filters"><input type="search" id="q" placeholder="Buscar descrição" value="${esc(lf.q)}" aria-label="Buscar">
      <label>Vencimento de<input type="date" id="de" value="${lf.de}"></label><label>até<input type="date" id="ate" value="${lf.ate}"></label></div>
    <div id="tot" class="grid g3" style="margin-bottom:16px"></div><div id="lst"></div>`;
  const load = async () => {
    const qs = new URLSearchParams({ de: lf.de, ate: lf.ate, q: lf.q });
    if (lf.aba === 'receber') { qs.set('tipo', 'entrada'); qs.set('status', 'pendente'); }
    if (lf.aba === 'pagar') { qs.set('tipo', 'saida'); qs.set('status', 'pendente'); }
    if (lf.aba === 'vencido') qs.set('status', 'vencido');
    if (lf.aba === 'pago') { qs.set('status', 'pago'); qs.set('por', 'pagamento'); }
    const rows = await get('/lancamentos?' + qs);
    const ent = rows.filter((l) => l.tipo === 'entrada').reduce((a, l) => a + l.valor, 0);
    const sai = rows.filter((l) => l.tipo === 'saida').reduce((a, l) => a + l.valor, 0);
    view.querySelector('#tot').innerHTML = `<div class="kpi"><div class="k">Entradas listadas</div><div class="v pos">${brl(ent)}</div></div><div class="kpi"><div class="k">Saídas listadas</div><div class="v neg">${brl(sai)}</div></div><div class="kpi"><div class="k">Lançamentos</div><div class="v">${rows.length}</div></div>`;
    const hoje = today();
    view.querySelector('#lst').innerHTML = table([
      { label: 'Vencimento', html: (l) => `${dt(l.vencimento)}${l.status === 'pendente' && l.vencimento < hoje ? '<div class="t2 neg">vencido</div>' : ''}` },
      { label: 'Descrição', html: (l) => `<div class="t1">${esc(l.descricao)}</div><div class="t2">${esc(l.categoria || '')}${l.pessoa_nome ? ' · ' + esc(l.pessoa_nome) : ''}</div>` },
      { label: 'Conta', key: 'conta_nome' },
      { label: 'Situação', html: (l) => (l.status === 'pago' ? pill(`${l.tipo === 'entrada' ? 'Recebido' : 'Pago'} ${dt(l.data_pagamento)}`, 'ok') : l.vencimento < hoje ? pill('Vencido', 'bad') : pill(l.tipo === 'entrada' ? 'A receber' : 'A pagar', 'warn')) },
      { label: 'Valor', num: true, html: (l) => `<strong class="${l.tipo === 'entrada' ? 'pos' : 'neg'}">${l.tipo === 'saida' ? '– ' : ''}${brl(l.valor)}</strong>` },
      { label: '', cls: 'nowrap right', html: (l) => `${l.status === 'pendente' ? `<button class="btn sm" data-baixa>${l.tipo === 'entrada' ? 'Receber' : 'Pagar'}</button> ` : `<button class="btn sm ghost" data-estorno>Estornar</button> `}<button class="btn sm ghost" data-ed>Editar</button>${l.custo_id || l.venda_id || (l.categoria === 'Compra de veículos' && l.veiculo_id) ? '' : ' <button class="btn sm danger" data-rm aria-label="Excluir">×</button>'}` },
    ], rows, { empty: 'Nenhum lançamento nesta lista.' });
    view.querySelectorAll('#lst tbody tr').forEach((tr, i) => {
      const l = rows[i];
      const on = (s, fn) => { const b = tr.querySelector(s); if (b) b.onclick = fn; };
      on('[data-baixa]', () => get('/contas').then((contas) => modal({
        title: l.tipo === 'entrada' ? 'Registrar recebimento' : 'Registrar pagamento',
        body: `<p><strong>${esc(l.descricao)}</strong><br>${brl(l.valor)} · vence ${dt(l.vencimento)}</p>${field('Data do pagamento', 'data_pagamento', today(), { type: 'date' })}${selectField('Conta', 'conta_id', contas.map((c) => [c.id, c.nome]), l.conta_id)}${moneyField('Valor pago', 'valor', l.valor)}`,
        submitLabel: 'Confirmar', onSubmit: async (d) => { await put('/lancamentos/' + l.id, { ...d, status: 'pago' }); toast('Baixa registrada.'); load(); },
      })));
      on('[data-estorno]', async () => { if (await confirmDlg('Voltar este lançamento para pendente?', 'Estornar')) { await put('/lancamentos/' + l.id, { status: 'pendente' }); load(); } });
      on('[data-ed]', () => lancForm(l, load));
      on('[data-rm]', async () => { if (await confirmDlg('Excluir este lançamento?', 'Excluir')) { try { await del('/lancamentos/' + l.id); load(); } catch (e) { fail(e); } } });
    });
  };
  view.querySelectorAll('[data-aba]').forEach((b) => (b.onclick = () => { lf.aba = b.dataset.aba; view.querySelectorAll('[data-aba]').forEach((x) => x.setAttribute('aria-selected', x === b)); load().catch(fail); }));
  let t;
  view.querySelector('#q').oninput = (e) => { clearTimeout(t); t = setTimeout(() => { lf.q = e.target.value; load().catch(fail); }, 250); };
  view.querySelector('#de').onchange = (e) => { lf.de = e.target.value; load().catch(fail); };
  view.querySelector('#ate').onchange = (e) => { lf.ate = e.target.value; load().catch(fail); };
  view.querySelector('#nent').onclick = () => lancForm({ tipo: 'entrada' }, load);
  view.querySelector('#nsai').onclick = () => lancForm({ tipo: 'saida' }, load);
  await load();
}
