// Sócios e capital investido: quanto cada sócio tem em cada carro, lucro realizado e valores a repassar
import { get, post, put, del, esc, brl, dt, today, table, bindRows, modal, confirmDlg, toast, fail, field, moneyField, areaField, selectField, icon, pill, can, statusVeic } from '../core.js';
import { setCrumbs } from '../main.js';

const pc = (n) => `${Number(n || 0).toFixed(1).replace('.', ',')}%`;
const neg = (n) => (n < 0 ? 'neg' : n > 0 ? 'pos' : '');

export function socioForm(s, done) {
  modal({
    title: s ? 'Editar sócio' : 'Novo sócio', size: 'wide',
    body: `<div class="form-grid">
      ${field('Nome', 'nome', s && s.nome, { cls: 'c6', attrs: `required ${s && s.loja ? 'readonly' : ''}` })}${field('CPF / CNPJ', 'cpf_cnpj', s && s.cpf_cnpj, { cls: 'c3' })}${field('Telefone', 'telefone', s && s.telefone, { cls: 'c3' })}
      ${field('E-mail', 'email', s && s.email, { type: 'email', cls: 'c6' })}${field('Chave PIX (para repasses)', 'pix', s && s.pix, { cls: 'c6' })}
      ${areaField('Observações', 'observacoes', s && s.observacoes, { rows: 2 })}
      ${s && !s.loja ? `<label class="check c12"><input type="checkbox" name="ativo" ${s.ativo ? 'checked' : ''}> Sócio ativo (aparece nas listas de aporte)</label>` : ''}</div>`,
    onSubmit: async (d) => {
      if (!d.nome) throw new Error('Informe o nome.');
      if (s) await put('/socios/' + s.id, { ...d, ativo: d.ativo ?? 1 }); else await post('/socios', d);
      toast('Sócio salvo.'); done && done();
    },
  });
}

// ------------------------------------------------------------------ lista
export async function list(view) {
  setCrumbs('Sócios e investimentos');
  const rows = await get('/socios');
  const socios = rows.filter((s) => !s.loja);
  const loja = rows.find((s) => s.loja) || {};
  const tot = rows.reduce((a, s) => ({ cap: a.cap + s.capital_estoque, luc: a.luc + s.lucro_realizado, rep: a.rep + (s.loja ? 0 : s.a_repassar) }), { cap: 0, luc: 0, rep: 0 });
  view.innerHTML = `<div class="ph"><div><p class="eyebrow">FINANCEIRO</p><h1>Sócios e investimentos</h1><p>Quanto cada sócio tem investido em cada carro, o lucro de cada um e o que falta repassar.</p></div>
    <div class="acts"><button class="btn ghost" id="csv">${icon('csv')}Exportar CSV</button><button class="btn black" id="pdf">${icon('pdf')}Gerar PDF</button>${can('financeiro') ? `<button class="btn" id="novo">${icon('plus')}Novo sócio</button>` : ''}</div></div>
    <div class="grid g4">
      <div class="kpi dark"><div class="k">Capital investido em estoque</div><div class="v">${brl(tot.cap)}</div><div class="s">Sócios + caixa da loja</div></div>
      <div class="kpi"><div class="k">Dos sócios</div><div class="v">${brl(tot.cap - (loja.capital_estoque || 0))}</div><div class="s">${socios.filter((s) => s.capital_estoque > 0).length} sócio(s) com carros no pátio</div></div>
      <div class="kpi"><div class="k">Do caixa da loja</div><div class="v">${brl(loja.capital_estoque || 0)}</div><div class="s">Inclui o que nenhum sócio cobriu</div></div>
      <div class="kpi"><div class="k">A repassar aos sócios</div><div class="v">${brl(tot.rep)}</div><div class="s">Capital + lucro de carros vendidos</div></div></div>
    <div class="card" style="margin-top:18px"><div class="card-h"><h2>Sócios</h2></div>
    ${table([
      { label: 'Sócio', html: (s) => `<div class="t1">${esc(s.nome)} ${s.loja ? pill('Empresa', 'dark') : !s.ativo ? pill('Inativo') : ''}</div>${s.telefone ? `<div class="t2">${esc(s.telefone)}</div>` : ''}` },
      { label: 'Carros no pátio', num: true, key: 'carros_estoque' },
      { label: 'Capital em estoque', num: true, html: (s) => `<strong>${brl(s.capital_estoque)}</strong>` },
      { label: 'Lucro previsto', num: true, html: (s) => `<span class="${neg(s.lucro_previsto)}">${brl(s.lucro_previsto)}</span><div class="t2">pelo preço anunciado</div>` },
      { label: 'Vendidos', num: true, key: 'carros_vendidos' },
      { label: 'Lucro realizado', num: true, html: (s) => `<span class="${neg(s.lucro_realizado)}">${brl(s.lucro_realizado)}</span>` },
      { label: 'A repassar', num: true, html: (s) => (s.loja ? '<span class="muted">–</span>' : s.a_repassar > 0.009 ? `<strong class="gold">${brl(s.a_repassar)}</strong>` : brl(s.a_repassar)) },
      { label: 'A restituir', num: true, html: (s) => (s.loja ? '<span class="muted">–</span>' : s.a_restituir > 0.009 ? `<strong class="gold">${brl(s.a_restituir)}</strong>` : brl(s.a_restituir)) },
    ], rows, { onRow: true, empty: 'Nenhum sócio cadastrado.' })}</div>
    ${socios.length ? '' : '<div class="alert info" style="margin-top:16px">Cadastre os sócios em <strong>Novo sócio</strong>. Depois, na página de cada veículo, aba <strong>Investimento</strong>, informe quanto cada um aportou. O que ninguém cobrir conta como capital do caixa da loja.</div>'}`;
  bindRows(view, rows, (s) => (location.hash = '#/socio/' + s.id));
  const n = view.querySelector('#novo'); if (n) n.onclick = () => socioForm(null, () => list(view));
  view.querySelector('#pdf').onclick = () => window.open('/api/socios-relatorio?formato=pdf', '_blank');
  view.querySelector('#csv').onclick = () => (location.href = '/api/socios-relatorio?formato=csv');
}

// ------------------------------------------------------------------ ficha do sócio
export async function detail(view, { id }) {
  const s = await get('/socios/' + id);
  setCrumbs('Sócios e investimentos', s.nome);
  const fin = can('financeiro');
  view.innerHTML = `<div class="ph"><div><p class="eyebrow">${s.loja ? 'CAPITAL DA EMPRESA' : 'SÓCIO'}</p><h1>${esc(s.nome)}</h1>
      <p>${[s.cpf_cnpj, s.telefone, s.email, s.pix ? 'PIX: ' + s.pix : ''].filter(Boolean).map(esc).join(' · ') || (s.loja ? 'Capital próprio da loja e tudo o que nenhum sócio cobriu.' : '')}</p></div>
    <div class="acts"><a class="btn ghost" href="/api/socios/${s.id}/relatorio?formato=csv">${icon('csv')}CSV</a><button class="btn black" id="pdf">${icon('pdf')}PDF</button>${fin ? '<button class="btn ghost" id="ed">Editar</button>' : ''}${fin && !s.loja ? '<button class="btn danger" id="rm">Excluir</button>' : ''}</div></div>
    <div class="grid g4">
      <div class="kpi dark"><div class="k">Capital em estoque</div><div class="v">${brl(s.capital_estoque)}</div><div class="s">${s.carros_estoque} carro(s) no pátio</div></div>
      <div class="kpi"><div class="k">Lucro previsto</div><div class="v ${neg(s.lucro_previsto)}">${brl(s.lucro_previsto)}</div><div class="s">se vender pelo preço anunciado</div></div>
      <div class="kpi"><div class="k">Lucro realizado</div><div class="v ${neg(s.lucro_realizado)}">${brl(s.lucro_realizado)}</div><div class="s">${s.carros_vendidos} carro(s) vendido(s)</div></div>
      <div class="kpi"><div class="k">A repassar</div><div class="v">${s.loja ? '–' : brl(s.a_repassar)}</div><div class="s">${s.loja ? 'fica no caixa da loja' : 'capital + lucro ainda não pago'}</div></div></div>
    ${!s.loja && (s.a_restituir > 0.009 || s.aporte_geral > 0.009) ? `<div class="grid g4" style="margin-top:16px">
      ${s.a_restituir > 0.009 ? `<div class="kpi"><div class="k">A restituir</div><div class="v gold">${brl(s.a_restituir)}</div><div class="s">contas que ${esc(s.nome)} pagou e a loja vai devolver${fin ? ` · <a class="linkbtn" href="#/lancamentos">ver em Contas a pagar</a>` : ''}</div></div>` : ''}
      ${s.aporte_geral > 0.009 ? `<div class="kpi"><div class="k">Aportes na empresa</div><div class="v">${brl(s.aporte_geral)}</div><div class="s">contas da loja (sem carro) pagas pelo sócio</div></div>` : ''}</div>` : ''}
    <div class="card" style="margin-top:18px"><h2>Carros no pátio</h2>
    ${table([
      { label: 'Veículo', html: (l) => `<div class="t1">${esc(l.veiculo)}</div><div class="t2">${esc(l.placa || 'sem placa')} · ${l.dias} dias no pátio</div>` },
      { label: 'Situação', html: (l) => statusVeic(l.status) },
      { label: 'Capital do carro', num: true, html: (l) => brl(l.capital) },
      { label: 'Aporte', num: true, html: (l) => `<strong>${brl(l.aporte)}</strong>${l.nao_atribuido ? `<div class="t2">${brl(l.nao_atribuido)} sem sócio</div>` : ''}` },
      { label: 'Participação', num: true, html: (l) => pc(l.participacao) },
      { label: 'Lucro previsto', num: true, html: (l) => (l.lucro_previsto != null ? `<span class="${neg(l.lucro_previsto)}">${brl(l.lucro_previsto)}</span>` : '<span class="muted">sem preço</span>') },
    ], s.estoque, { onRow: true, empty: 'Nenhum carro no pátio com capital deste sócio.', foot: s.estoque.length ? ['Total', '', '', brl(s.capital_estoque), '', brl(s.lucro_previsto)] : null })}</div>
    <div class="card" style="margin-top:18px"><h2>Carros vendidos</h2>
    ${table([
      { label: 'Veículo', html: (l) => `<div class="t1">${esc(l.veiculo)}</div><div class="t2">vendido em ${dt(l.data_venda)} por ${brl(l.valor_venda)}</div>` },
      { label: 'Aporte', num: true, html: (l) => brl(l.aporte) },
      { label: 'Part.', num: true, html: (l) => pc(l.participacao) },
      { label: 'Resultado do carro', num: true, html: (l) => `<span class="${neg(l.resultado)}">${brl(l.resultado)}</span>` },
      { label: 'Lucro do sócio', num: true, html: (l) => `<strong class="${neg(l.lucro)}">${brl(l.lucro)}</strong>` },
      { label: 'Retorno', num: true, html: (l) => brl(l.retorno) },
      ...(s.loja ? [] : [{ label: 'Repassado', num: true, html: (l) => brl(l.repassado) },
        { label: 'A repassar', num: true, html: (l) => (l.a_repassar > 0.009 ? `<strong class="gold">${brl(l.a_repassar)}</strong>` : l.a_repassar < -0.009 ? `<span class="neg">${brl(l.a_repassar)}</span>` : pill('Quitado', 'ok')) },
        { label: '', cls: 'nowrap right', html: (l) => (fin && l.a_repassar > 0.009 ? `<button class="btn sm" data-rep="${l.veiculo_id}">Registrar repasse</button>` : '') }]),
    ], s.vendidos, { onRow: true, empty: 'Nenhum carro vendido com capital deste sócio.' })}</div>
    <div class="card" style="margin-top:18px"><h2>Movimentos no caixa</h2>
    ${table([
      { label: 'Data', html: (m) => dt(m.data_pagamento || m.vencimento) }, { label: 'Descrição', key: 'descricao' }, { label: 'Categoria', key: 'categoria' },
      { label: 'Situação', html: (m) => (m.status === 'pago' ? pill('Pago', 'ok') : pill('Pendente', 'warn')) },
      { label: 'Valor', num: true, html: (m) => `<span class="${m.tipo === 'entrada' ? 'pos' : 'neg'}">${m.tipo === 'entrada' ? '+' : '−'} ${brl(m.valor)}</span>` },
    ], s.movimentos, { empty: 'Nenhum aporte, repasse ou restituição lançado no caixa.' })}</div>`;
  view.querySelectorAll('.card').forEach((c, i) => { const lista = [s.estoque, s.vendidos][i]; if (lista) bindRows(c, lista, (l) => (location.hash = `#/veiculo/${l.veiculo_id}?tab=investimento`)); });
  view.querySelector('#pdf').onclick = () => window.open(`/api/socios/${s.id}/relatorio?formato=pdf`, '_blank');
  const ed = view.querySelector('#ed'); if (ed) ed.onclick = () => socioForm(s, () => detail(view, { id }));
  const rm = view.querySelector('#rm');
  if (rm) rm.onclick = async () => {
    if (!(await confirmDlg(`Excluir ${s.nome}? Se ele já tiver aportes ou repasses, o cadastro é apenas desativado e o histórico continua.`, 'Excluir'))) return;
    try { const r = await del('/socios/' + s.id); toast(r.inativado ? 'Sócio desativado (tem histórico).' : 'Sócio excluído.'); location.hash = '#/socios'; } catch (e) { fail(e); }
  };
  view.querySelectorAll('[data-rep]').forEach((b) => (b.onclick = () => {
    const l = s.vendidos.find((x) => String(x.veiculo_id) === b.dataset.rep);
    modal({
      title: 'Registrar repasse', size: 'wide',
      body: `<p class="muted" style="margin-top:0">${esc(s.nome)} · ${esc(l.veiculo)}. Retorno ${brl(l.retorno)} (aporte ${brl(l.aporte)} + lucro ${brl(l.lucro)}), já repassado ${brl(l.repassado)}.</p>
        <div class="form-grid">${moneyField('Valor do repasse', 'valor', l.a_repassar, { cls: 'c4' })}${field('Data', 'data', today(), { type: 'date', cls: 'c4' })}
        ${selectField('Forma', 'forma', { pix: 'PIX', transferencia: 'Transferência', dinheiro: 'Dinheiro', cheque: 'Cheque', outro: 'Outro' }, 'pix', { cls: 'c4' })}
        <label class="check c12"><input type="checkbox" name="pago" checked> Já pago (sai do caixa agora). Desmarque para deixar em "Contas a pagar".</label></div>`,
      submitLabel: 'Registrar repasse',
      onSubmit: async (d) => { await post(`/socios/${s.id}/repasses`, { ...d, veiculo_id: l.veiculo_id }); toast('Repasse lançado no caixa.'); detail(view, { id }); },
    });
  }));
}
