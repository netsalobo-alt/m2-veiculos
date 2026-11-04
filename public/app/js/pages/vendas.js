import { get, post, esc, brl, num, pct, dt, dth, today, monthStart, can, state, modal, toast, fail, field, moneyField, selectField, areaField, table, bindRows, vdesc, CATEG, FORMAS, pill, icon, parseMoney, moneyInput, pessoaPicker, formData, statusVeic } from '../core.js';
import { setCrumbs } from '../main.js';
import { gerarDocumento } from './documentos.js';

const per = { de: monthStart(), ate: today() };

export async function list(view) {
  setCrumbs('Vendas');
  view.innerHTML = `<div class="ph"><div><p class="eyebrow">COMERCIAL</p><h1>Vendas</h1><p>Vendas registradas, formas de pagamento e documentos.</p></div>
    <div class="acts"><a class="btn" href="#/vendas/nova">${icon('plus')}Nova venda</a></div></div>
    <div class="filters"><label>De<input type="date" id="de" value="${per.de}"></label><label>Até<input type="date" id="ate" value="${per.ate}"></label>
      <label>Situação<select id="st"><option value="concluida">Concluídas</option><option value="cancelada">Canceladas</option><option value="">Todas</option></select></label></div>
    <div id="kpis" class="grid g4" style="margin-bottom:16px"></div><div id="lst"></div>`;
  const load = async () => {
    per.de = view.querySelector('#de').value; per.ate = view.querySelector('#ate').value;
    const rows = await get(`/vendas?de=${per.de}&ate=${per.ate}&status=${view.querySelector('#st').value}`);
    const custo = can('custos');
    const ok = rows.filter((r) => r.status === 'concluida');
    const tot = ok.reduce((a, r) => ({ v: a.v + r.valor_venda, l: a.l + (r.lucro || 0) }), { v: 0, l: 0 });
    view.querySelector('#kpis').innerHTML = `<div class="kpi dark"><div class="k">Faturamento</div><div class="v">${brl(tot.v)}</div></div>
      <div class="kpi"><div class="k">Veículos vendidos</div><div class="v">${ok.length}</div></div>
      <div class="kpi"><div class="k">Ticket médio</div><div class="v">${brl(ok.length ? tot.v / ok.length : 0)}</div></div>
      ${custo ? `<div class="kpi"><div class="k">Lucro</div><div class="v ${tot.l < 0 ? 'neg' : ''}">${brl(tot.l)}</div><div class="s">Margem ${pct(tot.v ? (tot.l / tot.v) * 100 : null)}</div></div>` : ''}`;
    view.querySelector('#lst').innerHTML = table([
      { label: 'Data', html: (r) => dt(r.data_venda) },
      { label: 'Veículo', html: (r) => `<div class="t1">${esc(vdesc(r))}</div><div class="t2">${CATEG[r.categoria]} · ${esc(r.placa || '')}</div>` },
      { label: 'Cliente', html: (r) => `<div class="t1">${esc(r.cliente_nome)}</div><div class="t2">${esc(r.cliente_telefone || '')}</div>` },
      { label: 'Vendedor', key: 'vendedor_nome' },
      { label: 'Situação', html: (r) => (r.status === 'concluida' ? pill('Concluída', 'ok') : pill('Cancelada', 'bad')) },
      { label: 'Valor', num: true, html: (r) => `<strong>${brl(r.valor_venda)}</strong>` },
      ...(custo ? [{ label: 'Lucro', num: true, html: (r) => `<span class="${r.lucro < 0 ? 'neg' : ''}">${brl(r.lucro)}</span>` }] : []),
    ], rows, { onRow: true, empty: 'Nenhuma venda no período.' });
    bindRows(view.querySelector('#lst'), rows, (r) => (location.hash = `#/venda/${r.id}`));
  };
  view.querySelectorAll('#de,#ate,#st').forEach((e) => (e.onchange = () => load().catch(fail)));
  await load();
}

// ------------------------------------------------------------------ nova venda
export async function nova(view, { params }) {
  setCrumbs('Vendas', 'Nova venda');
  const [veics, vendedores] = await Promise.all([get('/veiculos?status=estoque'), get('/usuarios/vendedores')]);
  const pre = params.veiculo ? veics.find((v) => String(v.id) === String(params.veiculo)) : null;
  view.innerHTML = `<div class="ph"><div><p class="eyebrow">VENDAS</p><h1>Nova venda</h1><p>Registre a venda, as formas de pagamento e gere o contrato em seguida.</p></div></div>
  <form id="fv" novalidate><div class="grid g-main">
    <div class="stack">
      <section class="card"><h2>Veículo e cliente</h2><div class="form-grid">
        <label class="c12">Veículo<select name="veiculo_id" required><option value="">Selecione o veículo…</option>
          ${veics.map((v) => `<option value="${v.id}" ${pre && pre.id === v.id ? 'selected' : ''}>${esc(vdesc(v))} · ${v.ano_mod || ''} · ${esc(v.placa || 'sem placa')} · ${brl(v.preco_venda)}</option>`).join('')}</select></label>
        <div class="c12" id="vinfo"></div>
        <div class="c8" id="cli"></div>
        ${selectField('Vendedor', 'vendedor_id', vendedores.map((u) => [u.id, u.nome]), state.user.id, { cls: 'c4' })}
        ${field('Data da venda', 'data_venda', today(), { type: 'date', cls: 'c4' })}
        ${moneyField('Valor da venda', 'valor_venda', pre ? pre.preco_venda : '', { cls: 'c4', attrs: 'required' })}
        ${field('Garantia (dias)', 'garantia_dias', 90, { type: 'number', cls: 'c4', attrs: 'min="0"' })}
      </div></section>

      <section class="card"><div class="card-h"><h2>Formas de pagamento</h2>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="btn sm ghost" id="add-p">${icon('plus')}Adicionar</button><button type="button" class="btn sm ghost" id="parc">Gerar parcelas</button></div></div>
        <div id="pags"></div>
        <div class="kv total" style="margin-top:12px"><span>Soma dos pagamentos</span><strong id="soma">R$ 0,00</strong></div>
        <p class="small" id="dif" style="margin:4px 0 0"></p>
      </section>

      <section class="card" id="troca-box" hidden><h2>Veículo recebido na troca</h2>
        <p class="muted" style="margin:-6px 0 6px">Ele entra automaticamente no estoque com o valor da troca como valor de compra.</p>
        <div class="form-grid">
          ${selectField('Categoria', 't_categoria', CATEG, 'carro', { cls: 'c3' })}${field('Marca', 't_marca', '', { cls: 'c3' })}${field('Modelo', 't_modelo', '', { cls: 'c3' })}${field('Versão', 't_versao', '', { cls: 'c3' })}
          ${field('Ano fab.', 't_ano_fab', '', { type: 'number', cls: 'c2' })}${field('Ano mod.', 't_ano_mod', '', { type: 'number', cls: 'c2' })}${field('Placa', 't_placa', '', { cls: 'c2' })}${field('Cor', 't_cor', '', { cls: 'c2' })}${field('KM', 't_km', '', { type: 'number', cls: 'c2' })}${field('Chassi', 't_chassi', '', { cls: 'c2' })}
          ${field('RENAVAM', 't_renavam', '', { cls: 'c3' })}
        </div></section>
    </div>
    <aside class="stack">
      <section class="card"><h2>Complementos</h2><div class="form-grid">
        ${field('Financeira / banco', 'financeira', '', { cls: 'c12', hint: 'Quando houver financiamento.' })}
        ${moneyField('Comissão do vendedor', 'comissao_valor', '', { cls: 'c12', hint: 'Gera uma conta a pagar.' })}
        ${areaField('Observações', 'observacoes', '', { rows: 3 })}</div></section>
      <section class="card" id="resumo"></section>
      <button class="btn full" type="submit">Registrar venda</button>
      <a class="btn ghost full" href="#/vendas">Cancelar</a>
    </aside>
  </div></form>`;

  const f = view.querySelector('#fv');
  await pessoaPicker(f.querySelector('#cli'), { name: 'cliente_id', label: 'Cliente (comprador)' });
  const pagsEl = f.querySelector('#pags');
  const vendSel = f.querySelector('[name=vendedor_id]');
  const vSel = f.querySelector('[name=veiculo_id]');
  const valorEl = f.querySelector('[name=valor_venda]');

  const pagRow = (p = {}) => {
    const div = document.createElement('div');
    div.className = 'form-grid pag';
    div.style.cssText = 'align-items:end;padding:6px 0 12px;border-bottom:1px solid var(--line-header)';
    div.innerHTML = `${selectField('Forma', 'forma', FORMAS, p.forma || 'pix', { cls: 'c3' })}
      ${moneyField('Valor', 'valor', p.valor, { cls: 'c3' })}
      ${field('Vencimento', 'vencimento', p.vencimento || f.querySelector('[name=data_venda]').value, { type: 'date', cls: 'c3' })}
      <label class="check c2" style="margin-bottom:12px"><input type="checkbox" name="pago" ${p.pago === false ? '' : 'checked'}> Recebido</label>
      <div class="c1" style="grid-column:span 1;text-align:right"><button type="button" class="btn sm danger" aria-label="Remover forma de pagamento" data-rm>×</button></div>
      ${field('Descrição', 'descricao', p.descricao || '', { cls: 'c12', attrs: 'placeholder="Ex.: entrada, parcela 1/10, financiamento banco X"' })}`;
    div.querySelector('[data-rm]').onclick = () => { div.remove(); update(); };
    div.querySelectorAll('input,select').forEach((e) => e.addEventListener('input', update));
    div.querySelector('[name=forma]').addEventListener('change', (e) => {
      const pago = div.querySelector('[name=pago]');
      if (['financiamento', 'boleto', 'cheque'].includes(e.target.value)) pago.checked = false;
      if (e.target.value === 'troca') pago.checked = true;
      update();
    });
    pagsEl.append(div);
    update();
  };
  const pags = () => [...pagsEl.querySelectorAll('.pag')].map((d) => {
    const o = formData(d);
    return { forma: o.forma, valor: o.valor || 0, vencimento: o.vencimento, pago: !!o.pago, descricao: o.descricao };
  });
  function update() {
    const valor = parseMoney(valorEl.value);
    const soma = pags().reduce((a, p) => a + (p.valor || 0), 0);
    f.querySelector('#soma').textContent = brl(soma);
    const dif = valor - soma;
    f.querySelector('#dif').innerHTML = Math.abs(dif) < 0.01 ? '<span class="pos">Pagamentos conferem com o valor da venda.</span>' : `<span class="neg">${dif > 0 ? 'Faltam' : 'Sobram'} ${brl(Math.abs(dif))} para fechar o valor da venda.</span>`;
    f.querySelector('#troca-box').hidden = !pags().some((p) => p.forma === 'troca');
    resumo();
  }
  function resumo() {
    const v = veics.find((x) => String(x.id) === vSel.value);
    const box = f.querySelector('#resumo');
    const vi = f.querySelector('#vinfo');
    if (!v) { box.innerHTML = '<h2>Resumo</h2><p class="muted">Selecione o veículo.</p>'; vi.innerHTML = ''; return; }
    vi.innerHTML = `<p class="muted" style="margin:8px 0 0">${statusVeic(v.status)} · ${v.dias_patio} dias no pátio · anunciado ${brl(v.preco_venda)}${v.preco_minimo ? ' · mínimo ' + brl(v.preco_minimo) : ''}${v.fipe_valor ? ' · FIPE ' + brl(v.fipe_valor) : ''}</p>`;
    const valor = parseMoney(valorEl.value);
    const com = parseMoney(f.querySelector('[name=comissao_valor]').value);
    const custo = v.custo_total;
    box.innerHTML = `<h2>Resumo</h2>
      <div class="kv"><span>Valor da venda</span><strong>${brl(valor)}</strong></div>
      ${v.fipe_valor ? `<div class="kv"><span>Venda / FIPE</span><strong>${pct((valor / v.fipe_valor) * 100)}</strong></div>` : ''}
      ${custo != null ? `<div class="kv"><span>Custo total do veículo</span><strong>${brl(custo)}</strong></div>
      <div class="kv"><span>Comissão</span><strong>${brl(com)}</strong></div>
      <div class="kv total"><span>Lucro previsto</span><strong class="${valor - custo - com < 0 ? 'neg' : 'pos'}">${brl(valor - custo - com)}</strong></div>` : ''}
      ${v.preco_minimo && valor < v.preco_minimo ? '<p class="small neg" style="margin-top:8px">Valor abaixo do preço mínimo definido.</p>' : ''}`;
  }
  const autoComissao = () => {
    const u = vendedores.find((x) => String(x.id) === vendSel.value);
    if (u && u.comissao_pct) f.querySelector('[name=comissao_valor]').value = moneyInput((parseMoney(valorEl.value) * u.comissao_pct) / 100);
    resumo();
  };
  vSel.onchange = () => { const v = veics.find((x) => String(x.id) === vSel.value); if (v && v.preco_venda) valorEl.value = moneyInput(v.preco_venda); autoComissao(); update(); };
  vendSel.onchange = autoComissao;
  valorEl.addEventListener('input', () => { update(); });
  valorEl.addEventListener('change', autoComissao);
  f.querySelector('[name=comissao_valor]').addEventListener('input', resumo);
  f.querySelector('#add-p').onclick = () => {
    const falta = parseMoney(valorEl.value) - pags().reduce((a, p) => a + (p.valor || 0), 0);
    pagRow({ valor: falta > 0 ? falta : '' });
  };
  f.querySelector('#parc').onclick = () => modal({
    title: 'Gerar parcelas', body: `<div class="form-grid">${selectField('Forma', 'forma', { boleto: 'Boleto', cheque: 'Cheque', cartao_credito: 'Cartão de crédito', pix: 'PIX', outro: 'Promissória / outro' }, 'boleto', { cls: 'c6' })}
      ${field('Nº de parcelas', 'n', 10, { type: 'number', cls: 'c6', attrs: 'min="1" max="72"' })}
      ${moneyField('Valor total parcelado', 'total', Math.max(0, parseMoney(valorEl.value) - pags().reduce((a, p) => a + (p.valor || 0), 0)), { cls: 'c6' })}
      ${field('1º vencimento', 'venc', (() => { const d = new Date(); d.setMonth(d.getMonth() + 1); return d.toISOString().slice(0, 10); })(), { type: 'date', cls: 'c6' })}</div>`,
    submitLabel: 'Gerar',
    onSubmit: (d) => {
      const n = Math.max(1, Number(d.n) || 1);
      const base = Math.floor((d.total / n) * 100) / 100;
      for (let i = 0; i < n; i++) {
        const dd = new Date(d.venc + 'T12:00:00'); dd.setMonth(dd.getMonth() + i);
        const val = i === n - 1 ? Math.round((d.total - base * (n - 1)) * 100) / 100 : base;
        pagRow({ forma: d.forma, valor: val, vencimento: dd.toISOString().slice(0, 10), pago: false, descricao: `parcela ${i + 1}/${n}` });
      }
    },
  });
  pagRow({ forma: 'pix', valor: pre ? pre.preco_venda : '' });
  if (pre) autoComissao();

  f.onsubmit = async (e) => {
    e.preventDefault();
    const d = formData(f);
    const troca = {};
    Object.keys(d).filter((k) => k.startsWith('t_')).forEach((k) => { troca[k.slice(2)] = d[k]; delete d[k]; });
    ['forma', 'valor', 'vencimento', 'pago', 'descricao'].forEach((k) => delete d[k]);
    const body = { ...d, pagamentos: pags(), troca };
    const btn = f.querySelector('[type=submit]');
    btn.disabled = true;
    try {
      const r = await post('/vendas', body);
      toast('Venda registrada.');
      location.hash = `#/venda/${r.id}?novo=1`;
    } catch (err) { fail(err); btn.disabled = false; }
  };
}

// ------------------------------------------------------------------ detalhe
export async function detail(view, { id, params }) {
  const s = await get('/vendas/' + id);
  const v = s.veiculo;
  setCrumbs('Vendas', `Venda nº ${s.id}`);
  const canc = s.status === 'cancelada';
  view.innerHTML = `<div class="ph"><div><p class="eyebrow">VENDA Nº ${s.id} · ${dt(s.data_venda)}</p><h1>${esc(vdesc(v))}</h1>
      <p>${canc ? pill('Cancelada', 'bad') : pill('Concluída', 'ok')} · ${esc(s.cliente_nome)} · vendedor ${esc(s.vendedor_nome || '–')}</p></div>
    <div class="acts">${!canc ? `<button class="btn" id="contrato">${icon('doc')}Gerar contrato</button><button class="btn ghost" id="recibo">Recibo de pagamento</button><button class="btn ghost" id="outro">Outro documento</button>` : ''}
      ${!canc && ['admin', 'gerente'].includes(state.user.perfil) ? '<button class="btn danger" id="cancelar">Cancelar venda</button>' : ''}</div></div>
    ${params.novo ? '<div class="alert info">Venda registrada. Próximo passo: gere o contrato e envie para assinatura por WhatsApp ou e-mail.</div>' : ''}
    <div class="grid g-main">
      <div class="stack">
        <section class="card"><h2>Formas de pagamento</h2>${table([
          { label: 'Forma', html: (p) => esc(FORMAS[p.forma] || p.forma) + (p.descricao ? `<div class="t2">${esc(p.descricao)}</div>` : '') },
          { label: 'Vencimento', html: (p) => dt(p.vencimento) },
          { label: 'Situação', html: (p) => (p.forma === 'troca' ? pill('Veículo recebido', 'info') : p.pago ? pill('Recebido', 'ok') : pill('A receber', 'warn')) },
          { label: 'Valor', num: true, html: (p) => brl(p.valor) }], s.pagamentos, { foot: ['Total', '', '', brl(s.valor_venda)] })}
          ${can('financeiro') ? '<p class="small" style="margin:12px 0 0">Recebimentos pendentes são baixados em Contas a pagar e receber.</p>' : ''}</section>
        ${s.troca ? `<section class="card"><h2>Veículo recebido na troca</h2><div class="kv"><span>${esc(vdesc(s.troca))} · ${s.troca.ano_mod || ''} · ${esc(s.troca.placa || '')}</span><strong>${brl(s.valor_troca)}</strong></div>
          <a class="linkbtn" href="#/veiculo/${s.troca.id}">Abrir no estoque</a></section>` : ''}
        <section class="card"><div class="card-h"><h2>Documentos</h2></div>${table([{ label: 'Documento', key: 'titulo' }, { label: 'Criado', html: (d) => dth(d.criado_em) },
          { label: 'Situação', html: (d) => (d.assinado_em ? pill('Assinado', 'ok') : d.status === 'enviado' ? pill('Aguardando assinatura', 'warn') : pill('Gerado')) }], s.documentos, { onRow: true, empty: 'Nenhum documento gerado ainda.' })}</section>
        ${s.observacoes ? `<section class="card"><h2>Observações</h2><p class="muted" style="white-space:pre-line;margin:0">${esc(s.observacoes)}</p></section>` : ''}
      </div>
      <aside class="stack">
        <section class="card"><h2>Resumo financeiro</h2>
          <div class="kv"><span>Valor da venda</span><strong class="gold">${brl(s.valor_venda)}</strong></div>
          ${v.fipe_valor ? `<div class="kv"><span>FIPE</span><strong>${brl(v.fipe_valor)} · ${pct((s.valor_venda / v.fipe_valor) * 100)}</strong></div>` : ''}
          ${v.custo_total != null ? `<div class="kv"><span>Compra</span><strong>${brl(v.valor_compra)}</strong></div><div class="kv"><span>Custos</span><strong>${brl(v.custos_total)}</strong></div>` : ''}
          <div class="kv"><span>Comissão</span><strong>${brl(s.comissao_valor)}</strong></div>
          ${s.lucro != null ? `<div class="kv total"><span>Lucro</span><strong class="${s.lucro < 0 ? 'neg' : 'pos'}">${brl(s.lucro)}</strong></div>` : ''}
          <div class="kv"><span>Dias no pátio</span><strong>${v.dias_patio}</strong></div>
          ${s.financeira ? `<div class="kv"><span>Financeira</span><strong>${esc(s.financeira)}</strong></div>` : ''}
          <div class="kv"><span>Garantia</span><strong>${s.garantia_dias} dias</strong></div></section>
        <section class="card"><h2>Cliente</h2><p style="margin:0"><a class="linkbtn" href="#/pessoa/${s.cliente_id}">${esc(s.cliente_nome)}</a></p>
          <p class="muted" style="margin:6px 0 0">${esc(s.cliente_doc || '')}<br>${esc(s.cliente_telefone || '')}<br>${esc(s.cliente_email || '')}</p></section>
        <section class="card"><h2>Veículo</h2><p style="margin:0"><a class="linkbtn" href="#/veiculo/${v.id}">${esc(vdesc(v))}</a></p><p class="muted" style="margin:6px 0 0">${v.ano_fab}/${v.ano_mod} · ${esc(v.placa || '')} · ${num(v.km)} km</p></section>
      </aside></div>`;
  bindRows(view.querySelectorAll('.card')[s.troca ? 2 : 1], s.documentos, (d) => (location.hash = `#/documento/${d.id}`));
  const on = (sel, fn) => { const b = view.querySelector(sel); if (b) b.onclick = fn; };
  on('#contrato', () => gerarDocumento({ venda_id: s.id, tipo: 'contrato_venda' }));
  on('#recibo', () => gerarDocumento({ venda_id: s.id, tipo: 'recibo_pagamento' }));
  on('#outro', () => gerarDocumento({ venda_id: s.id }));
  on('#cancelar', () => modal({
    title: 'Cancelar venda', body: `<p>O veículo volta para o estoque como disponível e os lançamentos financeiros desta venda serão cancelados. Um veículo recebido na troca continua no estoque.</p>${areaField('Motivo', 'motivo', '', { rows: 2 })}`,
    submitLabel: 'Cancelar venda',
    onSubmit: async (d) => { await post(`/vendas/${s.id}/cancelar`, d); toast('Venda cancelada.'); detail(view, { id, params: {} }); },
  }));
}
