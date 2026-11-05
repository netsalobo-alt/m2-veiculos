import { get, post, put, del, api, esc, brl, num, pct, dt, dth, today, can, modal, confirmDlg, toast, fail, field, moneyField, selectField, areaField, table, bindRows, statusVeic, vdesc, CATEG, STATUS_V, FORMAS, fotoUrl, icon, pill, pessoaPicker, formData } from '../core.js';
import { setCrumbs } from '../main.js';
import { gerarDocumento } from './documentos.js';

const COMBUST = ['Flex', 'Gasolina', 'Etanol', 'Diesel', 'Híbrido', 'Elétrico', 'GNV'];
const CAMBIO = ['Manual', 'Automático', 'CVT', 'Automatizado', 'Não se aplica'];
const CUSTO_CATS = ['Mecânica', 'Funilaria e pintura', 'Pneus', 'Elétrica', 'Estética / higienização', 'Documentação / despachante', 'Vistoria / laudo', 'IPVA / licenciamento', 'Multas', 'Transporte / guincho', 'Comissão de compra', 'Anúncios', 'Peças', 'Bateria (bike)', 'Outros'];

const listState = { status: 'estoque', categoria: '', q: '' };

// ------------------------------------------------------------------ lista
export async function list(view) {
  setCrumbs('Estoque');
  view.innerHTML = `<div class="ph"><div><p class="eyebrow">COMERCIAL</p><h1>Estoque</h1><p>Carros, motos e bikes elétricas: compra, custos, FIPE e tempo no pátio.</p></div>
    <div class="acts">${can('estoque') ? `<button class="btn ghost" id="fipe-all">${icon('refresh')}Atualizar FIPE do estoque</button>` : ''}<a class="btn" href="#/estoque/novo">${icon('plus')}Cadastrar veículo</a></div></div>
    <div class="filters">
      <input type="search" id="f-q" placeholder="Buscar por marca, modelo, placa ou chassi" value="${esc(listState.q)}" aria-label="Buscar">
      <select id="f-cat" aria-label="Categoria"><option value="">Todas as categorias</option>${Object.entries(CATEG).map(([k, v]) => `<option value="${k}" ${listState.categoria === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
      <div class="seg" role="group" aria-label="Situação">${[['estoque', 'Em estoque'], ['disponivel', 'Disponíveis'], ['preparacao', 'Em preparação'], ['reservado', 'Reservados'], ['vendido', 'Vendidos'], ['', 'Todos']].map(([k, l]) => `<button type="button" data-st="${k}" aria-pressed="${listState.status === k}">${l}</button>`).join('')}</div>
    </div>
    <div id="kpis" class="grid g4" style="margin-bottom:16px"></div>
    <div id="lst"></div>`;
  const load = async () => {
    const qs = new URLSearchParams({ status: listState.status, categoria: listState.categoria, q: listState.q });
    const rows = await get('/veiculos?' + qs);
    const custo = can('custos');
    const tot = rows.reduce((a, v) => ({ inv: a.inv + (v.custo_total || 0), an: a.an + (v.preco_venda || 0), fipe: a.fipe + (v.fipe_valor || 0), dias: a.dias + v.dias_patio }), { inv: 0, an: 0, fipe: 0, dias: 0 });
    view.querySelector('#kpis').innerHTML = `
      <div class="kpi"><div class="k">Veículos listados</div><div class="v">${rows.length}</div></div>
      ${custo ? `<div class="kpi"><div class="k">Custo total (compra + custos)</div><div class="v">${brl(tot.inv)}</div></div>` : ''}
      <div class="kpi"><div class="k">Valor anunciado</div><div class="v">${brl(tot.an)}</div></div>
      <div class="kpi"><div class="k">Tempo médio no pátio</div><div class="v">${rows.length ? num(tot.dias / rows.length) : 0} dias</div></div>`;
    const cols = [
      { label: '', html: (v) => `<span class="thumb-s ${v.foto ? '' : 'noimg'}" style="${v.foto ? `background-image:url('${fotoUrl(v.foto)}')` : ''}"></span>` },
      { label: 'Veículo', html: (v) => `<div class="t1">${esc(vdesc(v))}</div><div class="t2">${CATEG[v.categoria]} · ${v.ano_fab || '–'}/${v.ano_mod || '–'} · ${esc(v.placa || 'sem placa')}${v.km != null ? ' · ' + num(v.km) + ' km' : ''}</div>` },
      { label: 'Situação', html: (v) => statusVeic(v.status) + (v.publicado ? ' <span class="pill info" title="Publicado no site">Site</span>' : '') },
      { label: 'Pátio', num: true, html: (v) => `<span class="pill ${v.status === 'vendido' ? '' : v.dias_patio > 90 ? 'bad' : v.dias_patio > 60 ? 'warn' : ''}">${v.dias_patio} d</span>` },
      ...(custo ? [{ label: 'Compra', num: true, html: (v) => brl(v.valor_compra) }, { label: 'Custos', num: true, html: (v) => brl(v.custos_total) }] : []),
      { label: 'FIPE', num: true, html: (v) => (v.fipe_valor ? `${brl(v.fipe_valor)}<div class="t2">${v.fipe_pct ? 'preço ' + pct(v.fipe_pct) : ''}</div>` : '<span class="muted">–</span>') },
      { label: 'Preço', num: true, html: (v) => `<strong>${brl(v.preco_venda)}</strong>` },
      ...(custo ? [{ label: 'Margem', num: true, html: (v) => (v.margem == null ? '–' : `<span class="${v.margem < 0 ? 'neg' : ''}">${brl(v.margem)}</span><div class="t2">${pct(v.margem_pct)}</div>`) }] : []),
    ];
    view.querySelector('#lst').innerHTML = table(cols, rows, { onRow: true, empty: 'Nenhum veículo encontrado. Cadastre o primeiro em "Cadastrar veículo".' });
    bindRows(view.querySelector('#lst'), rows, (v) => (location.hash = `#/veiculo/${v.id}`));
  };
  let t;
  view.querySelector('#f-q').oninput = (e) => { clearTimeout(t); t = setTimeout(() => { listState.q = e.target.value; load().catch(fail); }, 250); };
  view.querySelector('#f-cat').onchange = (e) => { listState.categoria = e.target.value; load().catch(fail); };
  view.querySelectorAll('[data-st]').forEach((b) => (b.onclick = () => {
    listState.status = b.dataset.st;
    view.querySelectorAll('[data-st]').forEach((x) => x.setAttribute('aria-pressed', x === b));
    load().catch(fail);
  }));
  const fa = view.querySelector('#fipe-all');
  if (fa) fa.onclick = async () => {
    fa.disabled = true; fa.textContent = 'Atualizando FIPE…';
    try {
      const r = await post('/fipe/atualizar-todos');
      toast(`FIPE atualizada em ${r.atualizados} de ${r.total} veículo(s) com consulta vinculada.${r.erros.length ? ' Falhas: ' + r.erros.length : ''}`, r.erros.length > 0);
      await load();
    } catch (e) { fail(e); }
    fa.disabled = false; fa.innerHTML = `${icon('refresh')}Atualizar FIPE do estoque`;
  };
  await load();
}

// ------------------------------------------------------------------ formulário
function veiculoForm(v = {}) {
  const custo = can('custos');
  const isNew = !v.id;
  return `<div class="form-grid">
    <p class="form-sec">Identificação</p>
    ${field('Placa', 'placa', v.placa, { cls: 'c3', attrs: 'style="text-transform:uppercase" maxlength="8" placeholder="ABC1D23" autocomplete="off"' })}
    <div class="c3" style="display:flex;align-items:end"><button type="button" class="btn ghost full" data-placa-busca>${icon('refresh')}Buscar placa (FIPE)</button></div>
    <p class="hint c6" data-placa-info style="align-self:end;margin-bottom:12px">Digite a placa e clique em <strong>Buscar placa</strong> para preencher marca, modelo, ano, cor e combustível.</p>
    <div class="c12" data-placa-res></div>
    <input type="hidden" name="_fipe_valor"><input type="hidden" name="_fipe_codigo">
    ${selectField('Categoria', 'categoria', CATEG, v.categoria || 'carro', { cls: 'c3', attrs: 'data-cat' })}
    ${field('Marca', 'marca', v.marca, { cls: 'c3', attrs: 'required' })}
    ${field('Modelo', 'modelo', v.modelo, { cls: 'c3', attrs: 'required' })}
    ${field('Versão', 'versao', v.versao, { cls: 'c3' })}
    ${field('Ano fabricação', 'ano_fab', v.ano_fab, { type: 'number', cls: 'c2', attrs: 'min="1950" max="2100"' })}
    ${field('Ano modelo', 'ano_mod', v.ano_mod, { type: 'number', cls: 'c2', attrs: 'min="1950" max="2100"' })}
    ${field('Cor', 'cor', v.cor, { cls: 'c2' })}
    ${field('Quilometragem', 'km', v.km, { type: 'number', cls: 'c2', attrs: 'min="0"' })}
    ${field('RENAVAM', 'renavam', v.renavam, { cls: 'c3' })}
    ${field('Chassi', 'chassi', v.chassi, { cls: 'c3', attrs: 'style="text-transform:uppercase" maxlength="17"' })}
    <span class="c3 only-car-moto">${selectField('Combustível', 'combustivel', ['', ...COMBUST], v.combustivel)}</span>
    <span class="c3 only-car">${selectField('Câmbio', 'cambio', ['', ...CAMBIO], v.cambio)}</span>
    <span class="c3 only-car">${field('Portas', 'portas', v.portas, { type: 'number', attrs: 'min="0" max="6"' })}</span>
    <span class="c3 only-car-moto">${field('Motor / cilindrada', 'motor', v.motor, { hint: 'Ex.: 1.0 turbo, 160 cc' })}</span>
    <span class="c3 only-bike">${field('Autonomia', 'autonomia', v.autonomia, { hint: 'Ex.: 60 km' })}</span>
    <span class="c3 only-bike">${field('Bateria / motor', 'bateria', v.bateria, { hint: 'Ex.: 48V 15Ah · 350W' })}</span>
    ${areaField('Opcionais', 'opcionais', v.opcionais, { rows: 2 })}
    ${areaField('Descrição para o site', 'descricao', v.descricao, { rows: 3 })}

    <p class="form-sec">Entrada e compra</p>
    ${field('Data de entrada no pátio', 'data_entrada', v.data_entrada || today(), { type: 'date', cls: 'c3' })}
    ${selectField('Origem', 'origem', { compra: 'Compra', troca: 'Recebido na troca', consignado: 'Consignado' }, v.origem || 'compra', { cls: 'c3' })}
    <div class="c6" data-forn></div>
    ${custo ? `${moneyField('Valor de compra', 'valor_compra', v.valor_compra, { cls: 'c3' })}
    ${selectField('Forma de pagamento da compra', 'forma_pagamento_compra', { '': '—', ...FORMAS }, v.forma_pagamento_compra, { cls: 'c3' })}
    <label class="check c6" style="margin-top:42px"><input type="checkbox" name="compra_pago" ${v.compra_pago === 0 ? '' : 'checked'}> Compra já paga (lança saída no caixa)</label>` : ''}

    <p class="form-sec">Venda e anúncio</p>
    ${moneyField('Preço de venda anunciado', 'preco_venda', v.preco_venda, { cls: 'c3' })}
    ${custo ? moneyField('Preço mínimo (negociação)', 'preco_minimo', v.preco_minimo, { cls: 'c3' }) : ''}
    ${v.status === 'vendido' ? '' : selectField('Situação', 'status', { preparacao: 'Em preparação', disponivel: 'Disponível', reservado: 'Reservado' }, v.status || 'preparacao', { cls: 'c3' })}
    <label class="check c3" style="margin-top:42px"><input type="checkbox" name="publicado" ${v.publicado ? 'checked' : ''}> Publicar no site</label>
    <label class="check c3"><input type="checkbox" name="destaque" ${v.destaque ? 'checked' : ''}> Destaque no site</label>
    ${isNew ? '<p class="hint c12">Depois de salvar você poderá adicionar fotos, custos e consultar a FIPE.</p>' : ''}
  </div>`;
}
function wireForm(root, v = {}) {
  const sel = root.querySelector('[data-cat]');
  const apply = () => {
    const c = sel.value;
    root.querySelectorAll('.only-car').forEach((e) => (e.hidden = c !== 'carro'));
    root.querySelectorAll('.only-car-moto').forEach((e) => (e.hidden = c === 'bike'));
    root.querySelectorAll('.only-bike').forEach((e) => (e.hidden = c !== 'bike'));
  };
  sel.onchange = apply; apply();
  pessoaPicker(root.querySelector('[data-forn]'), { name: 'fornecedor_id', value: v.fornecedor_id, label: 'Comprado de (fornecedor)' }).then(() => {
    const s = root.querySelector('[name=fornecedor_id]'); if (s) s.required = false;
  });
  wirePlaca(root, !v.id, apply);
}

// Consulta por placa (FIPE API v2): preenche os campos e oferece os preços FIPE das versões compatíveis.
function wirePlaca(root, isNew, applyCat) {
  const btn = root.querySelector('[data-placa-busca]');
  const inp = root.querySelector('[name=placa]');
  const info = root.querySelector('[data-placa-info]');
  const res = root.querySelector('[data-placa-res]');
  const hv = root.querySelector('[name=_fipe_valor]');
  const hc = root.querySelector('[name=_fipe_codigo]');
  if (!btn || !inp) return;
  const set = (name, val) => {
    const el = root.querySelector(`[name=${name}]`);
    if (!el || val == null || val === '') return;
    if (!isNew && el.value && name !== 'categoria') return; // na edição, não sobrescreve o que já foi preenchido
    if (!isNew && name === 'categoria') return;
    if (el.tagName === 'SELECT' && ![...el.options].some((o) => o.value === String(val))) return;
    el.value = val;
  };
  const buscar = async () => {
    const placa = inp.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!placa) { toast('Digite a placa.'); inp.focus(); return; }
    btn.disabled = true; const label = btn.innerHTML; btn.textContent = 'Consultando…';
    try {
      const r = await get('/fipe/placa/' + placa);
      inp.value = r.placa || placa;
      ['categoria', 'marca', 'modelo', 'versao', 'ano_fab', 'ano_mod', 'cor', 'combustivel'].forEach((k) => set(k, r[k]));
      applyCat();
      info.innerHTML = `<strong>${esc(`${r.marca} ${r.modelo} ${r.versao}`.trim())}</strong> · ${esc(String(r.ano_mod || ''))}${r.cor ? ' · ' + esc(r.cor) : ''}${r.municipio ? ' · ' + esc(r.municipio) : ''}${r.chassi_final ? ' · chassi ' + esc(r.chassi_final) : ''}<br>${r.cache ? 'Dados já consultados antes (sem gastar cota).' : `Consulta feita${r.cota_restante != null ? ` · restam ${r.cota_restante} consulta(s) de placa hoje` : ''}.`} Confira os campos abaixo.`;
      hv.value = ''; hc.value = '';
      if (r.fipe && r.fipe.length) {
        res.innerHTML = `<div class="card" style="margin:4px 0 16px;padding:14px 16px"><p style="margin:0 0 8px;font-weight:700">Valor FIPE: escolha a versão do veículo</p>
          ${r.fipe.map((p, i) => `<label class="check" style="margin-top:6px;font-weight:500"><input type="radio" name="_fipe_opt" value="${i}" ${r.fipe.length === 1 ? 'checked' : ''}> <span style="flex:1">${esc(p.modelo)} <span class="muted">· ${esc(p.codigo)}</span></span><strong>${brl(p.valor)}</strong></label>`).join('')}
          <label class="check" style="margin-top:6px;font-weight:500"><input type="radio" name="_fipe_opt" value=""> <span class="muted">Não usar valor FIPE agora</span></label></div>`;
        const pick = () => {
          const sel = res.querySelector('[name=_fipe_opt]:checked');
          const p = sel && sel.value !== '' ? r.fipe[Number(sel.value)] : null;
          hv.value = p ? p.valor : ''; hc.value = p ? p.codigo : '';
        };
        res.querySelectorAll('[name=_fipe_opt]').forEach((x) => (x.onchange = pick)); pick();
      } else {
        res.innerHTML = '<p class="hint" style="margin:0 0 12px">A consulta não trouxe preço FIPE para esta placa. Você pode consultar depois na aba FIPE do veículo.</p>';
      }
    } catch (e) { fail(e); }
    btn.disabled = false; btn.innerHTML = label;
  };
  btn.onclick = buscar;
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); buscar(); } });
}
// Grava o valor FIPE escolhido na consulta por placa (se houver) no histórico do veículo.
async function salvarFipePlaca(id, d) {
  const valor = Number(d._fipe_valor);
  if (!(valor > 0)) return;
  const referencia = new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  try { await post(`/veiculos/${id}/fipe`, { valor, codigo: d._fipe_codigo || null, referencia, origem: 'placa' }); } catch (e) { fail(e); }
}
const clean = (d) => { if (d.placa) d.placa = d.placa.toUpperCase(); if (d.chassi) d.chassi = d.chassi.toUpperCase(); if (d.fornecedor_id === '') d.fornecedor_id = null; return d; };

export async function novo(view) {
  setCrumbs('Estoque', 'Cadastrar veículo');
  view.innerHTML = `<div class="ph"><div><p class="eyebrow">ESTOQUE</p><h1>Cadastrar veículo</h1><p>Carro, moto ou bike elétrica.</p></div></div>
    <form class="card" id="fv" novalidate>${veiculoForm()}<div class="form-actions"><a class="btn ghost" href="#/estoque">Cancelar</a><button class="btn" type="submit">Salvar veículo</button></div></form>`;
  const f = view.querySelector('#fv');
  wireForm(f);
  f.onsubmit = async (e) => {
    e.preventDefault();
    try {
      const d = clean(formData(f));
      const r = await post('/veiculos', d);
      await salvarFipePlaca(r.id, d);
      toast('Veículo cadastrado.');
      location.hash = `#/veiculo/${r.id}`;
    } catch (err) { fail(err); }
  };
}

// ------------------------------------------------------------------ detalhe
let tabAtual = 'resumo';
export async function detail(view, { id, params }) {
  const v = await get('/veiculos/' + id);
  setCrumbs('Estoque', vdesc(v));
  if (params.tab) tabAtual = params.tab;
  const custo = can('custos');
  const capa = v.fotos[0];
  const tabs = [['resumo', 'Resumo'], ...(custo ? [['custos', `Custos (${v.custos.length})`], ['investimento', 'Investimento']] : []), ['fipe', 'FIPE'], ['fotos', `Fotos (${v.fotos.length})`], ['documentos', `Documentos (${v.documentos.length})`], ...(v.categoria !== 'bike' ? [['olx', 'OLX']] : [])];
  if (!tabs.find((t) => t[0] === tabAtual)) tabAtual = 'resumo';

  view.innerHTML = `<div class="ph"><div class="vhead">
      <div class="ph-img ${capa ? '' : 'noimg'}" style="${capa ? `background-image:url('${fotoUrl(capa.arquivo)}')` : ''}"></div>
      <div><p class="eyebrow">${esc(CATEG[v.categoria].toUpperCase())} · ${v.ano_fab || '–'}/${v.ano_mod || '–'}</p><h1>${esc(vdesc(v))}</h1>
      <p>${statusVeic(v.status)} ${v.publicado ? pill('No site', 'info') : ''} · ${esc(v.placa || 'sem placa')} · ${v.dias_patio} dias no pátio${v.status === 'vendido' ? ' (até a venda)' : ''}</p></div></div>
    <div class="acts">
      <button class="btn ghost" id="b-edit">Editar dados</button>
      ${v.status !== 'vendido' && can('vendas') ? `<a class="btn" href="#/vendas/nova?veiculo=${v.id}">${icon('sale')}Vender</a>` : ''}
      ${v.venda ? `<a class="btn black" href="#/venda/${v.venda.id}">Ver venda</a>` : ''}
    </div></div>
    <div class="tabs" role="tablist">${tabs.map(([k, l]) => `<button role="tab" data-tab="${k}" aria-selected="${tabAtual === k}">${esc(l)}</button>`).join('')}</div>
    <div id="tab"></div>`;
  view.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => { tabAtual = b.dataset.tab; detail(view, { id, params: {} }); }));
  view.querySelector('#b-edit').onclick = () => modal({
    title: 'Editar veículo', size: 'xwide', body: veiculoForm(v), onOpen: (d) => wireForm(d, v),
    onSubmit: async (d) => { await put('/veiculos/' + v.id, clean(d)); await salvarFipePlaca(v.id, d); toast('Dados salvos.'); detail(view, { id, params: {} }); },
  });
  const reload = () => detail(view, { id, params: {} });
  const tab = view.querySelector('#tab');
  ({ resumo: tabResumo, custos: tabCustos, fipe: tabFipe, fotos: tabFotos, documentos: tabDocs, olx: tabOlx, investimento: tabInvest })[tabAtual](tab, v, reload);
}

// ------------------------------------------------------------------ investimento (capital por sócio)
const neg = (n) => (n < 0 ? 'neg' : n > 0 ? 'pos' : '');
const pc1 = (n) => `${Number(n || 0).toFixed(1).replace('.', ',')}%`;
async function tabInvest(el, v, reload) {
  el.innerHTML = '<div class="empty">Carregando…</div>';
  const [d, socios] = await Promise.all([get(`/veiculos/${v.id}/investimento`), get('/socios?simples=1')]);
  const vendido = !!d.venda;
  const loja = d.socios.find((s) => s.loja);
  const REF = { compra: 'Compra do veículo', custo: 'Custo', outro: 'Outro' };
  el.innerHTML = `<div class="grid g4">
      <div class="kpi dark"><div class="k">Capital do carro</div><div class="v">${brl(d.capital)}</div><div class="s">compra ${brl(d.veiculo.valor_compra)} + custos ${brl(d.veiculo.custos_total)}</div></div>
      <div class="kpi"><div class="k">Aportado por sócios</div><div class="v">${brl(d.socios.filter((s) => !s.loja).reduce((t, s) => t + s.aporte, 0))}</div><div class="s">${d.socios.filter((s) => !s.loja).length} sócio(s)</div></div>
      <div class="kpi"><div class="k">Caixa da loja</div><div class="v">${brl(loja ? loja.aporte : 0)}</div><div class="s">${d.nao_atribuido ? `${brl(d.nao_atribuido)} sem sócio definido` : 'tudo atribuído'}</div></div>
      <div class="kpi"><div class="k">${vendido ? 'Resultado da venda' : 'Lucro previsto'}</div><div class="v ${neg(vendido ? d.resultado : d.resultado_previsto)}">${brl(vendido ? d.resultado : d.resultado_previsto)}</div>
        <div class="s">${vendido ? `venda ${brl(d.venda.valor)} − capital − comissão ${brl(d.venda.comissao)}` : d.veiculo.preco_venda ? `pelo preço anunciado ${brl(d.veiculo.preco_venda)}` : 'informe o preço de venda'}</div></div></div>
    ${d.excedente ? `<div class="alert" style="margin-top:16px">Os aportes somam ${brl(d.excedente)} a mais que o capital do carro. A divisão usa o total aportado como base. Confira se algum aporte foi lançado em dobro.</div>` : ''}
    <div class="card" style="margin-top:18px"><div class="card-h"><h2>Divisão por sócio</h2></div>
    ${table([
      { label: 'Sócio', html: (s) => `<div class="t1">${esc(s.nome)} ${s.loja ? pill('Empresa', 'dark') : ''}</div>${s.nao_atribuido ? `<div class="t2">inclui ${brl(s.nao_atribuido)} sem sócio definido</div>` : ''}` },
      { label: 'Aporte', num: true, html: (s) => `<strong>${brl(s.aporte)}</strong>` },
      { label: 'Participação', num: true, html: (s) => pc1(s.participacao) },
      { label: vendido ? 'Lucro' : 'Lucro previsto', num: true, html: (s) => { const x = vendido ? s.lucro : s.lucro_previsto; return x == null ? '<span class="muted">–</span>' : `<span class="${neg(x)}">${brl(x)}</span>`; } },
      ...(vendido ? [{ label: 'Retorno', num: true, html: (s) => brl(s.retorno) }, { label: 'Repassado', num: true, html: (s) => (s.loja ? '–' : brl(s.repassado)) },
        { label: 'A repassar', num: true, html: (s) => (s.loja ? '<span class="muted">fica na loja</span>' : s.a_repassar > 0.009 ? `<strong class="gold">${brl(s.a_repassar)}</strong>` : pill('Quitado', 'ok')) }] : []),
    ], d.socios, { empty: 'Sem capital neste veículo ainda (informe o valor de compra).' })}
    <p class="hint" style="margin:12px 0 0">Participação = aporte ÷ capital do carro. O lucro${vendido ? '' : ' (quando vender)'} é dividido nessa proporção, depois de descontar a comissão do vendedor. ${vendido && d.socios.some((s) => !s.loja && s.a_repassar > 0.009) ? 'Registre os repasses na ficha de cada sócio (Financeiro → Sócios e investimentos).' : ''}</p></div>
    <div class="card" style="margin-top:18px"><div class="card-h"><h2>Aportes</h2><button class="btn sm" id="ap-add" ${socios.filter((s) => !s.loja && s.ativo).length ? '' : 'disabled'}>${icon('plus')}Registrar aporte</button></div>
    ${socios.filter((s) => !s.loja).length ? '' : `<div class="alert info">Nenhum sócio cadastrado. ${can('financeiro') ? '<a class="linkbtn" href="#/socios">Cadastre os sócios</a> para registrar aportes.' : 'Peça ao financeiro para cadastrar os sócios.'}</div>`}
    ${table([
      { label: 'Data', html: (a) => dt(a.data) },
      { label: 'Sócio', html: (a) => esc(a.socio_nome) },
      { label: 'Referente a', html: (a) => esc(a.referente === 'custo' ? `Custo: ${a.custo_categoria || ''}` : REF[a.referente] || a.referente) },
      { label: 'Descrição', html: (a) => esc(a.descricao || '') },
      { label: 'No caixa', html: (a) => (a.lancamento_id ? pill('Entrada lançada', 'ok') : a.loja ? '<span class="muted">–</span>' : pill('Não lançado')) },
      { label: 'Valor', num: true, html: (a) => `<strong>${brl(a.valor)}</strong>` },
      { label: '', cls: 'nowrap right', html: (a) => (a.custo_id ? '<span class="t2">editar na aba Custos</span>' : '<button class="btn sm ghost" data-ed>Editar</button> <button class="btn sm danger" data-rm>Excluir</button>') },
    ], d.aportes, { empty: 'Nenhum aporte registrado. Todo o capital deste carro está contando como do caixa da loja.' })}
    <p class="hint" style="margin:12px 0 0">Custos pagos por um sócio entram aqui sozinhos: ao lançar o custo, escolha quem pagou em <strong>Pago por</strong>.</p></div>`;

  const form = (a) => modal({
    title: a ? 'Editar aporte' : 'Registrar aporte', size: 'wide',
    body: `<div class="form-grid">
      ${selectField('Sócio', 'socio_id', socios.filter((s) => !s.loja && (s.ativo || (a && a.socio_id === s.id))).map((s) => [s.id, s.nome]), a ? a.socio_id : '', { cls: 'c6', empty: 'Escolha…' })}
      ${selectField('Referente a', 'referente', { compra: 'Compra do veículo', outro: 'Outro (ex.: reforço de capital)' }, a ? a.referente : 'compra', { cls: 'c6' })}
      ${moneyField('Valor', 'valor', a ? a.valor : d.nao_atribuido || null, { cls: 'c4', hint: a ? '' : d.nao_atribuido ? `Sugestão: ${brl(d.nao_atribuido)} ainda sem sócio.` : '' })}
      ${field('Data', 'data', a ? a.data : v.data_entrada || today(), { type: 'date', cls: 'c4' })}
      ${field('Descrição (opcional)', 'descricao', a && a.descricao, { cls: 'c4', attrs: 'placeholder="Ex.: metade da compra"' })}
      <label class="check c12"><input type="checkbox" name="lancar_caixa" ${!a || a.lancamento_id ? 'checked' : ''}> Lançar no caixa como entrada "Aporte de sócios"</label>
      <p class="hint c12">Deixe marcado quando o dinheiro passou pelo caixa da loja ou quando o sócio pagou direto ao vendedor (a compra já saiu do caixa, e esta entrada compensa). Desmarque só se a compra não foi lançada no caixa.</p></div>`,
    onSubmit: async (f) => {
      if (!f.socio_id) throw new Error('Escolha o sócio.');
      if (!(f.valor > 0)) throw new Error('Informe o valor.');
      if (a) await put('/aportes/' + a.id, f); else await post(`/veiculos/${v.id}/aportes`, f);
      toast('Aporte salvo.'); reload();
    },
  });
  const add = el.querySelector('#ap-add'); if (add) add.onclick = () => form(null);
  const cards = el.querySelectorAll('.card');
  const tb = cards[cards.length - 1];
  tb.querySelectorAll('tbody tr').forEach((tr, i) => {
    const a = d.aportes[i];
    const e = tr.querySelector('[data-ed]'); if (e) e.onclick = () => form(a);
    const r = tr.querySelector('[data-rm]');
    if (r) r.onclick = async () => { if (!(await confirmDlg('Excluir este aporte? A entrada no caixa (se houver) também sai.', 'Excluir'))) return; try { await del('/aportes/' + a.id); toast('Aporte excluído.'); reload(); } catch (err) { fail(err); } };
  });
}

// ------------------------------------------------------------------ OLX
const OLX_ST = {
  '': ['Não anunciado', ''], enviado: ['Enviado · aguardando a OLX', 'info'], pending: ['Em análise na OLX', 'info'], queued: ['Na fila da OLX', 'info'],
  accepted: ['No ar na OLX', 'ok'], refused: ['Recusado pela OLX', 'bad'], error: ['Erro na OLX', 'bad'], erro: ['Erro ao enviar', 'bad'], deleted: ['Removido da OLX', ''],
};
// listas como [valor, texto] para manter a ordem (objetos com chaves numéricas reordenam)
const SIMNAO = [['', '—'], ['1', 'Sim'], ['0', 'Não']];
const CARTYPE = [['', '—'], ['9', 'Hatch'], ['8', 'Sedã'], ['5', 'SUV'], ['3', 'Pick-up'], ['7', 'Van / utilitário'], ['12', 'Perua'], ['11', 'Cupê'], ['2', 'Conversível'], ['6', 'Buggy'], ['10', 'Caminhão leve']];
const MOTOTYPE = [['', '—'], ['1', 'Street'], ['2', 'Esportiva'], ['3', 'Custom'], ['4', 'Trail'], ['5', 'Naked'], ['6', 'Scooter'], ['7', 'Off-road'], ['8', 'Touring'], ['15', 'Adventure'], ['16', 'Enduro'], ['9', 'Utilitária'], ['17', 'Ciclomotor']];

async function tabOlx(el, v, reload) {
  el.innerHTML = '<div class="empty">Carregando…</div>';
  const info = await get('/olx/veiculos/' + v.id);
  const a = info.anuncio || {};
  const op = a.opcoes || {};
  const moto = v.categoria === 'moto';
  const removido = !a.ativo && a.operacao === 'delete' && ['enviado', 'accepted', 'deleted'].includes(a.status);
  const [stTxt, stCls] = removido ? ['Removido da OLX', ''] : OLX_ST[a.ativo || a.status ? a.status || '' : ''] || [a.status, ''];
  const msgs = a.mensagens || [];
  if (!info.conectado) {
    el.innerHTML = `<div class="card"><h2>OLX</h2><p class="muted" style="margin:0">A conta da OLX ainda não está conectada. ${can('config') ? 'Vá em <a class="linkbtn" href="#/config">Configurações → OLX</a>, preencha as chaves enviadas pela OLX e clique em <strong>Conectar com a OLX</strong>.' : 'Peça a um administrador para conectar a conta em Configurações → OLX.'}</p>
      ${info.problemas.length ? `<h3 style="margin:18px 0 8px;font-size:15px">O que também falta neste veículo</h3><ul style="margin:0;padding-left:20px;color:var(--muted)">${info.problemas.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}</div>`;
    return;
  }
  el.innerHTML = `<div class="grid g-main">
    <section class="card"><h2>Dados para a OLX</h2>
      <p class="muted" style="margin:-6px 0 6px;font-size:13.5px">A OLX exige marca, modelo e versão do catálogo dela. O resto (preço, km, ano, cor, câmbio, fotos, descrição) vem do cadastro do veículo.</p>
      <form id="fo" novalidate><div class="form-grid">
        <label class="c4">Marca (OLX)<select name="marca_id" data-lvl="marca"><option value="">Carregando…</option></select></label>
        <label class="c4">Modelo (OLX)<select name="modelo_id" data-lvl="modelo" disabled><option value="">—</option></select></label>
        <label class="c4">Versão (OLX)<select name="versao_id" data-lvl="versao" disabled><option value="">—</option></select></label>
        ${moto ? '<label class="c4">Cilindrada (OLX)<select name="cilindrada_id"><option value="">Carregando…</option></select></label>' : ''}
        <div class="c12"><button type="button" class="btn sm ghost" id="sug">${icon('refresh')}Sugerir pelo cadastro</button> <span class="hint" id="sug-msg"></span></div>
        <p class="form-sec">Informações extras (opcionais)</p>
        ${moto ? selectField('Estilo da moto', 'mototype', MOTOTYPE, op.mototype ?? '', { cls: 'c3' }) : selectField('Carroceria', 'cartype', CARTYPE, op.cartype ?? '', { cls: 'c3' })}
        ${selectField('Aceita troca', 'exchange', SIMNAO, op.exchange ?? '', { cls: 'c3' })}
        ${selectField('Único dono', 'owner', SIMNAO, op.owner ?? '', { cls: 'c3' })}
        ${selectField('IPVA pago', 'ipva_pago', SIMNAO, op.ipva_pago ?? '', { cls: 'c3' })}
        ${selectField('Quitado', 'quitado', SIMNAO, op.quitado ?? '', { cls: 'c3' })}
        ${moto ? '' : `${selectField('Chave reserva', 'extra_key', SIMNAO, op.extra_key ?? '', { cls: 'c3' })}${selectField('Manual do proprietário', 'owner_manual', SIMNAO, op.owner_manual ?? '', { cls: 'c3' })}
        ${selectField('Revisões na concessionária', 'dealership_review', SIMNAO, op.dealership_review ?? '', { cls: 'c3' })}${selectField('Com garantia', 'warranty', SIMNAO, op.warranty ?? '', { cls: 'c3' })}`}
      </div>
      <div class="form-actions"><button type="button" class="btn ghost" id="so">Salvar</button><button type="submit" class="btn" ${v.status === 'vendido' ? 'disabled' : ''}>${a.ativo ? 'Salvar e atualizar na OLX' : 'Salvar e publicar na OLX'}</button></div></form>
    </section>
    <section class="stack">
      <div class="card"><h2>Situação</h2>
        <div class="kv"><span>Anúncio</span><strong>${pill(stTxt, stCls)}</strong></div>
        ${a.url ? `<div class="kv"><span>Link</span><strong><a class="linkbtn" href="${esc(a.url)}" target="_blank" rel="noopener">Ver na OLX ↗</a></strong></div>` : ''}
        ${a.enviado_em ? `<div class="kv"><span>Último envio</span><strong>${dth(a.enviado_em)}</strong></div>` : ''}
        ${msgs.length ? `<div class="alert" style="margin-top:10px">${msgs.map((m) => `<div>${esc(m)}</div>`).join('')}</div>` : ''}
        <div class="stack" style="gap:10px;margin-top:16px">
          ${a.ad_id && (a.ativo || a.status) ? `<button class="btn ghost full" id="ost">${icon('refresh')}Atualizar situação</button>` : ''}
          ${a.ativo ? '<button class="btn danger full" id="orm">Tirar da OLX</button>' : ''}
        </div>
        <p class="hint" style="margin-top:12px">Ao vender ou excluir o veículo, o anúncio sai da OLX sozinho. Ao editar os dados, ele é atualizado.</p></div>
      <div class="card"><h2>Antes de publicar</h2>
        <div id="chk">${info.problemas.length ? `<ul style="margin:0;padding-left:20px">${info.problemas.map((p) => `<li style="margin:4px 0">${esc(p)}</li>`).join('')}</ul>` : '<p style="margin:0;color:var(--ok);font-weight:650">✓ Tudo pronto para publicar.</p>'}</div>
        <p class="hint" style="margin-top:10px">Título que vai para a OLX: <strong>${esc(info.previa.subject)}</strong> · ${info.previa.images.length} foto(s) · ${brl(info.previa.price)}</p></div>
    </section></div>`;

  const f = el.querySelector('#fo');
  const selM = f.querySelector('[data-lvl=marca]'), selMo = f.querySelector('[data-lvl=modelo]'), selV = f.querySelector('[data-lvl=versao]');
  const cat = moto ? 'moto' : 'carro';
  const fill = (sel, list, val) => {
    sel.innerHTML = `<option value="">Escolha…</option>${list.map((x) => `<option value="${esc(x.id)}" ${String(val) === x.id ? 'selected' : ''}>${esc(x.nome)}</option>`).join('')}`;
    sel.disabled = false;
  };
  const loadModelos = async (marca, val) => { selMo.disabled = true; selV.disabled = true; selV.innerHTML = '<option value="">—</option>'; if (!marca) { selMo.innerHTML = '<option value="">—</option>'; return; } fill(selMo, await get(`/olx/catalogo/${cat}/${marca}`), val); };
  const loadVersoes = async (marca, modelo, val) => { selV.disabled = true; if (!modelo) { selV.innerHTML = '<option value="">—</option>'; return; } fill(selV, await get(`/olx/catalogo/${cat}/${marca}/${modelo}`), val); };
  const nome = (sel) => (sel.value ? sel.options[sel.selectedIndex].text : null);
  const sugestao = async () => {
    const m = el.querySelector('#sug-msg'); m.textContent = 'Procurando no catálogo da OLX…';
    try {
      const s = await get(`/olx/veiculos/${v.id}/sugestao`);
      if (!s.marca_id) { m.textContent = 'Não encontrei a marca no catálogo. Escolha manualmente.'; return; }
      selM.value = s.marca_id; await loadModelos(s.marca_id, s.modelo_id);
      if (s.modelo_id) await loadVersoes(s.marca_id, s.modelo_id, s.versao_id);
      m.textContent = s.versao_id ? 'Sugestão aplicada. Confira a versão antes de salvar.' : s.modelo_id ? 'Encontrei marca e modelo. Escolha a versão.' : 'Encontrei a marca. Escolha o modelo e a versão.';
    } catch (e) { m.textContent = ''; fail(e); }
  };
  try {
    fill(selM, await get(`/olx/catalogo/${cat}`), a.marca_id);
    if (a.marca_id) await loadModelos(a.marca_id, a.modelo_id);
    if (a.modelo_id) await loadVersoes(a.marca_id, a.modelo_id, a.versao_id);
    if (moto) { const sc = f.querySelector('[name=cilindrada_id]'); const l = await get('/olx/cilindradas'); fill(sc, l, a.cilindrada_id); }
    if (!a.marca_id) sugestao();
  } catch (e) { fail(e); }
  selM.onchange = () => loadModelos(selM.value).catch(fail);
  selMo.onchange = () => loadVersoes(selM.value, selMo.value).catch(fail);
  el.querySelector('#sug').onclick = sugestao;

  const salvar = async () => {
    const d = formData(f);
    await put('/olx/veiculos/' + v.id, {
      marca_id: d.marca_id, marca_nome: nome(selM), modelo_id: d.modelo_id, modelo_nome: nome(selMo), versao_id: d.versao_id, versao_nome: nome(selV), cilindrada_id: d.cilindrada_id,
      opcoes: Object.fromEntries(['exchange', 'owner', 'extra_key', 'owner_manual', 'dealership_review', 'warranty', 'ipva_pago', 'quitado', 'cartype', 'mototype'].map((k) => [k, d[k] ?? ''])),
    });
  };
  el.querySelector('#so').onclick = async () => { try { await salvar(); toast('Dados da OLX salvos.'); reload(); } catch (e) { fail(e); } };
  f.onsubmit = async (e) => {
    e.preventDefault();
    const b = f.querySelector('[type=submit]'); b.disabled = true; b.textContent = 'Enviando para a OLX…';
    try { await salvar(); await post(`/olx/veiculos/${v.id}/publicar`); toast('Anúncio enviado para a OLX. A OLX analisa em alguns minutos.'); }
    catch (err) { fail(err); }
    reload();
  };
  const st = el.querySelector('#ost');
  if (st) st.onclick = async () => { st.disabled = true; try { await post(`/olx/veiculos/${v.id}/status`); toast('Situação atualizada.'); } catch (e) { fail(e); } reload(); };
  const rm = el.querySelector('#orm');
  if (rm) rm.onclick = async () => { if (!(await confirmDlg('Tirar este anúncio da OLX?', 'Tirar da OLX'))) return; try { await post(`/olx/veiculos/${v.id}/remover`); toast('Pedido de remoção enviado à OLX.'); } catch (e) { fail(e); } reload(); };
}

function tabResumo(el, v, reload) {
  const custo = can('custos');
  el.innerHTML = `<div class="grid g-main">
    <section class="card"><h2>Dados do veículo</h2><dl class="dl">
      ${[['Categoria', CATEG[v.categoria]], ['Marca', v.marca], ['Modelo', v.modelo], ['Versão', v.versao], ['Ano', `${v.ano_fab || '–'}/${v.ano_mod || '–'}`], ['Cor', v.cor], ['Quilometragem', v.km != null ? num(v.km) + ' km' : null], ['Placa', v.placa], ['RENAVAM', v.renavam], ['Chassi', v.chassi],
        ...(v.categoria === 'bike' ? [['Autonomia', v.autonomia], ['Bateria / motor', v.bateria]] : [['Combustível', v.combustivel], ['Motor', v.motor]]), ...(v.categoria === 'carro' ? [['Câmbio', v.cambio], ['Portas', v.portas]] : []),
        ['Entrada no pátio', dt(v.data_entrada)], ['Origem', { compra: 'Compra', troca: 'Troca', consignado: 'Consignado' }[v.origem] || v.origem], ...(custo ? [['Fornecedor', v.fornecedor_nome]] : [])]
        .map(([k, x]) => `<div><dt>${esc(k)}</dt><dd>${esc(x ?? '–') || '–'}</dd></div>`).join('')}
    </dl>${v.opcionais ? `<p style="margin:16px 0 0"><strong>Opcionais:</strong> <span class="muted">${esc(v.opcionais)}</span></p>` : ''}
    ${v.descricao ? `<p style="margin:10px 0 0" class="muted">${esc(v.descricao)}</p>` : ''}</section>
    <section class="stack">
      <div class="card"><h2>Valores</h2>
        ${custo ? `<div class="kv"><span>Valor de compra</span><strong>${brl(v.valor_compra)}</strong></div>
        <div class="kv"><span>Custos de preparação</span><strong>${brl(v.custos_total)}</strong></div>
        <div class="kv total"><span>Custo total</span><strong>${brl(v.custo_total)}</strong></div>` : ''}
        <div class="kv"><span>Preço anunciado</span><strong class="gold">${brl(v.preco_venda)}</strong></div>
        ${custo && v.preco_minimo ? `<div class="kv"><span>Preço mínimo</span><strong>${brl(v.preco_minimo)}</strong></div>` : ''}
        ${custo ? `<div class="kv"><span>Margem prevista</span><strong class="${v.margem < 0 ? 'neg' : ''}">${brl(v.margem)} · ${pct(v.margem_pct)}</strong></div>` : ''}
        <div class="kv"><span>Tabela FIPE</span><strong>${v.fipe_valor ? brl(v.fipe_valor) : '–'}</strong></div>
        ${v.fipe_valor ? `<div class="kv"><span>Preço / FIPE</span><strong>${pct(v.fipe_pct)}</strong></div>${custo ? `<div class="kv"><span>Compra / FIPE</span><strong>${pct(v.compra_fipe_pct)}</strong></div>` : ''}` : ''}
        ${v.venda ? `<div class="kv total"><span>Vendido por</span><strong>${brl(v.venda.valor_venda)}</strong></div>${v.lucro != null ? `<div class="kv"><span>Lucro na venda</span><strong class="${v.lucro < 0 ? 'neg' : 'pos'}">${brl(v.lucro)}</strong></div>` : ''}<div class="kv"><span>Cliente</span><strong>${esc(v.venda.cliente_nome)}</strong></div>` : ''}
      </div>
      <div class="card"><h2>Ações rápidas</h2><div class="stack" style="gap:10px">
        ${custo ? `<button class="btn ghost full" data-act="custo">${icon('plus')}Lançar custo</button>` : ''}
        <button class="btn ghost full" data-act="fipe">${icon('refresh')}Consultar FIPE</button>
        ${custo && v.origem === 'compra' ? `<button class="btn ghost full" data-act="recibo">${icon('doc')}Gerar recibo de compra</button>` : ''}
        ${v.status !== 'vendido' && can('custos') ? `<button class="btn danger full" data-act="del">Excluir veículo</button>` : ''}
      </div></div>
    </section></div>`;
  const act = (k, fn) => { const b = el.querySelector(`[data-act=${k}]`); if (b) b.onclick = fn; };
  act('custo', () => custoForm(v, null, reload));
  act('fipe', () => fipeDialog(v, reload));
  act('recibo', () => gerarDocumento({ veiculo_id: v.id, tipo: 'recibo_compra' }));
  act('del', async () => {
    if (!(await confirmDlg('Excluir este veículo, suas fotos, custos e o lançamento de compra? Esta ação não pode ser desfeita.', 'Excluir'))) return;
    try { await del('/veiculos/' + v.id); toast('Veículo excluído.'); location.hash = '#/estoque'; } catch (e) { fail(e); }
  });
}

async function custoForm(v, c, reload) {
  let socios = [];
  try { socios = await get('/socios?simples=1'); } catch (e) { /* sem sócios: só caixa da loja */ }
  const opcSocio = socios.filter((s) => s.ativo || (c && c.pago_por === s.id)).map((s) => [s.loja ? '' : s.id, s.nome]);
  modal({
    title: c ? 'Editar custo' : 'Lançar custo', size: 'wide',
    body: `<div class="form-grid">${field('Data', 'data', c ? c.data : today(), { type: 'date', cls: 'c3' })}
      ${selectField('Categoria', 'categoria', CUSTO_CATS, c ? c.categoria : 'Mecânica', { cls: 'c3' })}
      ${moneyField('Valor', 'valor', c && c.valor, { cls: 'c3', attrs: 'required' })}
      <label class="check c3" style="margin-top:42px"><input type="checkbox" name="pago" ${!c || c.lanc_status === 'pago' ? 'checked' : ''}> Já pago</label>
      ${field('Descrição', 'descricao', c && c.descricao, { cls: 'c8', attrs: 'placeholder="Ex.: troca de pastilhas e discos"' })}
      ${field('Fornecedor / oficina', 'fornecedor', c && c.fornecedor, { cls: 'c4' })}
      ${opcSocio.length > 1 ? selectField('Pago por', 'pago_por', opcSocio, c && c.pago_por ? c.pago_por : '', { cls: 'c6' }) : ''}
      <p class="hint c12">O custo entra no cálculo de margem do veículo e gera uma saída no fluxo de caixa (paga ou a pagar).${opcSocio.length > 1 ? ' Se um sócio pagou, ele vira aporte desse sócio no carro.' : ''}</p></div>`,
    onSubmit: async (d) => {
      if (c) await put('/custos/' + c.id, d); else await post(`/veiculos/${v.id}/custos`, d);
      toast('Custo salvo.'); tabAtual = 'custos'; reload();
    },
  });
}

function tabCustos(el, v, reload) {
  const rows = v.custos;
  el.innerHTML = `<div class="card"><div class="card-h"><h2>Custos do veículo</h2><button class="btn sm" id="add">${icon('plus')}Lançar custo</button></div>
    ${table([
      { label: 'Data', html: (c) => dt(c.data) }, { label: 'Categoria', key: 'categoria' }, { label: 'Descrição', key: 'descricao' }, { label: 'Fornecedor', key: 'fornecedor' },
      { label: 'Pagamento', html: (c) => (c.lanc_status === 'pago' ? pill('Pago', 'ok') : pill('A pagar', 'warn')) },
      { label: 'Pago por', html: (c) => esc(c.pago_por_nome || 'Caixa da loja') },
      { label: 'Valor', num: true, html: (c) => brl(c.valor) },
      { label: '', html: () => '<button class="btn sm ghost" data-ed>Editar</button> <button class="btn sm danger" data-rm>Excluir</button>', cls: 'nowrap right' },
    ], rows, { empty: 'Nenhum custo lançado para este veículo.', foot: rows.length ? ['Total', '', '', '', '', '', brl(v.custos_total), ''] : null })}</div>
    <div class="grid g3" style="margin-top:18px">
      <div class="kpi"><div class="k">Compra</div><div class="v">${brl(v.valor_compra)}</div></div>
      <div class="kpi"><div class="k">Custos</div><div class="v">${brl(v.custos_total)}</div></div>
      <div class="kpi dark"><div class="k">Custo total</div><div class="v">${brl(v.custo_total)}</div><div class="s">Margem prevista: ${brl(v.margem)} (${pct(v.margem_pct)})</div></div></div>`;
  el.querySelector('#add').onclick = () => custoForm(v, null, reload);
  el.querySelectorAll('tbody tr').forEach((tr, i) => {
    const c = rows[i];
    tr.querySelector('[data-ed]').onclick = () => custoForm(v, c, reload);
    tr.querySelector('[data-rm]').onclick = async () => {
      if (!(await confirmDlg('Excluir este custo? O lançamento no caixa também será removido.', 'Excluir'))) return;
      try { await del('/custos/' + c.id); toast('Custo excluído.'); reload(); } catch (e) { fail(e); }
    };
  });
}

// ------------------------------------------------------------------ FIPE
export function fipeDialog(v, reload) {
  const tipoPadrao = v.categoria === 'moto' ? 'motos' : 'carros';
  const m = modal({
    title: 'Consulta FIPE', size: 'wide',
    body: `${v.categoria === 'bike' ? '<div class="alert">Bikes elétricas não constam na tabela FIPE. Informe um valor de referência manualmente (ex.: preço de mercado).</div>' : ''}
      <div class="form-grid" ${v.categoria === 'bike' ? 'hidden' : ''}>
        ${selectField('Tipo', 'tipo', { carros: 'Carros', motos: 'Motos', caminhoes: 'Caminhões' }, v.fipe_tipo || tipoPadrao, { cls: 'c3' })}
        <label class="c3">Marca<select name="marca"><option>Carregando…</option></select></label>
        <label class="c6">Modelo<select name="modelo" disabled><option value="">Escolha a marca</option></select></label>
        <label class="c6">Ano / combustível<select name="ano" disabled><option value="">Escolha o modelo</option></select></label>
        <div class="c6" style="display:flex;align-items:end"><button type="button" class="btn black full" data-consultar disabled>Consultar valor</button></div>
      </div>
      <div id="fipe-res" style="margin-top:18px"></div>
      <details ${v.categoria === 'bike' ? 'open' : ''} style="margin-top:16px"><summary style="cursor:pointer;font-weight:600">Informar valor manualmente</summary>
        <form class="form-grid" id="fipe-man">${moneyField('Valor de referência', 'valor', '', { cls: 'c6' })}${field('Referência', 'referencia', '', { cls: 'c6', attrs: 'placeholder="Ex.: novembro de 2026"' })}
        <div class="c12 form-actions"><button class="btn" type="submit">Salvar valor manual</button></div></form></details>`,
  });
  const d = m.el;
  const sel = (n) => d.querySelector(`[name=${n}]`);
  const res = d.querySelector('#fipe-res');
  const opt = (arr, k, l, first) => `<option value="">${first}</option>` + arr.map((x) => `<option value="${esc(x[k])}">${esc(x[l])}</option>`).join('');
  const loadMarcas = async () => {
    sel('marca').innerHTML = '<option>Carregando…</option>';
    try {
      const ms = await get(`/fipe/${sel('tipo').value}/marcas`);
      sel('marca').innerHTML = opt(ms, 'codigo', 'nome', 'Selecione a marca');
      const match = ms.find((x) => v.fipe_marca ? String(x.codigo) === String(v.fipe_marca) : x.nome.toLowerCase().includes(String(v.marca || '').toLowerCase()));
      if (match) { sel('marca').value = match.codigo; loadModelos(); }
    } catch (e) { sel('marca').innerHTML = '<option value="">Indisponível</option>'; res.innerHTML = `<div class="alert">${esc(e.message)}</div>`; }
  };
  const loadModelos = async () => {
    sel('modelo').disabled = true; sel('ano').disabled = true; d.querySelector('[data-consultar]').disabled = true;
    if (!sel('marca').value) return;
    sel('modelo').innerHTML = '<option>Carregando…</option>';
    try {
      const ms = await get(`/fipe/${sel('tipo').value}/marcas/${sel('marca').value}/modelos`);
      sel('modelo').innerHTML = opt(ms, 'codigo', 'nome', 'Selecione o modelo'); sel('modelo').disabled = false;
      if (v.fipe_modelo && ms.find((x) => String(x.codigo) === String(v.fipe_modelo))) { sel('modelo').value = v.fipe_modelo; loadAnos(); }
    } catch (e) { fail(e); }
  };
  const loadAnos = async () => {
    sel('ano').disabled = true; d.querySelector('[data-consultar]').disabled = true;
    if (!sel('modelo').value) return;
    try {
      const as = await get(`/fipe/${sel('tipo').value}/marcas/${sel('marca').value}/modelos/${sel('modelo').value}/anos`);
      sel('ano').innerHTML = opt(as, 'codigo', 'nome', 'Selecione o ano'); sel('ano').disabled = false;
      const pre = v.fipe_ano || (as.find((a) => String(a.codigo).startsWith(String(v.ano_mod))) || {}).codigo;
      if (pre) { sel('ano').value = pre; d.querySelector('[data-consultar]').disabled = !sel('ano').value; }
    } catch (e) { fail(e); }
  };
  sel('tipo').onchange = loadMarcas; sel('marca').onchange = loadModelos; sel('modelo').onchange = loadAnos;
  sel('ano').onchange = () => (d.querySelector('[data-consultar]').disabled = !sel('ano').value);
  d.querySelector('[data-consultar]').onclick = async () => {
    try {
      const r = await get(`/fipe/${sel('tipo').value}/marcas/${sel('marca').value}/modelos/${sel('modelo').value}/anos/${sel('ano').value}`);
      res.innerHTML = `<div class="card" style="background:var(--bg)"><p class="eyebrow">TABELA FIPE · ${esc(r.MesReferencia || '')}</p>
        <div class="price" style="font-size:30px">${esc(r.Valor)}</div>
        <p class="muted" style="margin:0">${esc(r.Marca)} ${esc(r.Modelo)} · ${esc(r.AnoModelo)} · ${esc(r.Combustivel)} · código ${esc(r.CodigoFipe)}</p>
        ${v.preco_venda ? `<p class="muted" style="margin:6px 0 0">Preço anunciado = ${pct((v.preco_venda / r.valor_num) * 100)} da FIPE</p>` : ''}
        <div class="form-actions"><button class="btn" type="button" data-salvar>Salvar no veículo</button></div></div>`;
      res.querySelector('[data-salvar]').onclick = async () => {
        try {
          await post(`/veiculos/${v.id}/fipe`, { valor: r.valor_num, referencia: r.MesReferencia, codigo: r.CodigoFipe, tipo: sel('tipo').value, marca: sel('marca').value, modelo: sel('modelo').value, ano: sel('ano').value, origem: 'api' });
          toast('Valor FIPE salvo.'); m.close(); reload();
        } catch (e) { fail(e); }
      };
    } catch (e) { res.innerHTML = `<div class="alert">${esc(e.message)}</div>`; }
  };
  d.querySelector('#fipe-man').onsubmit = async (e) => {
    e.preventDefault();
    try { await post(`/veiculos/${v.id}/fipe`, { ...formData(e.target), origem: 'manual' }); toast('Valor salvo.'); m.close(); reload(); } catch (err) { fail(err); }
  };
  if (v.categoria !== 'bike') loadMarcas();
}

function tabFipe(el, v, reload) {
  el.innerHTML = `<div class="grid g-main"><section class="card"><div class="card-h"><h2>Histórico de valores FIPE</h2></div>
    ${table([{ label: 'Consulta', html: (h) => dth(h.data) }, { label: 'Referência', key: 'referencia' }, { label: 'Origem', html: (h) => (h.origem === 'api' ? 'Tabela FIPE' : h.origem === 'placa' ? 'FIPE (placa)' : 'Manual') }, { label: 'Valor', num: true, html: (h) => brl(h.valor) }], v.fipe_historico, { empty: 'Nenhuma consulta registrada.' })}</section>
    <section class="card"><h2>Situação atual</h2>
      <div class="kv"><span>Valor FIPE</span><strong>${brl(v.fipe_valor)}</strong></div>
      <div class="kv"><span>Referência</span><strong>${esc(v.fipe_referencia || '–')}</strong></div>
      <div class="kv"><span>Código FIPE</span><strong>${esc(v.fipe_codigo || '–')}</strong></div>
      <div class="kv"><span>Atualizado em</span><strong>${dth(v.fipe_atualizado_em)}</strong></div>
      <div class="kv"><span>Preço anunciado / FIPE</span><strong>${pct(v.fipe_pct)}</strong></div>
      ${can('custos') ? `<div class="kv"><span>Compra / FIPE</span><strong>${pct(v.compra_fipe_pct)}</strong></div>` : ''}
      <div class="stack" style="gap:10px;margin-top:16px">
        <button class="btn full" id="cons">Nova consulta FIPE</button>
        ${v.fipe_marca && v.fipe_ano ? `<button class="btn ghost full" id="upd">${icon('refresh')}Atualizar com a tabela do mês</button>` : ''}
      </div></section></div>`;
  el.querySelector('#cons').onclick = () => fipeDialog(v, reload);
  const u = el.querySelector('#upd');
  if (u) u.onclick = async () => { u.disabled = true; try { const r = await post(`/veiculos/${v.id}/fipe/atualizar`); toast('FIPE atualizada: ' + brl(r.valor)); reload(); } catch (e) { fail(e); u.disabled = false; } };
}

function tabFotos(el, v, reload) {
  el.innerHTML = `<div class="card"><div class="card-h"><h2>Fotos</h2><label class="btn sm" style="margin:0;cursor:pointer">${icon('plus')}Enviar fotos<input type="file" accept="image/jpeg,image/png,image/webp" multiple hidden id="up"></label></div>
    <p class="muted" style="margin:-6px 0 16px">A primeira foto é a capa no site. Use fotos em fundo neutro, proporção 3:2: dianteira, lateral, traseira e interior.</p>
    ${v.fotos.length ? `<div class="photos">${v.fotos.map((f, i) => `<figure class="${i === 0 ? 'capa' : ''}" style="background-image:url('${fotoUrl(f.arquivo)}')">${i === 0 ? '<span class="badge tag">Capa</span>' : ''}
      <div class="ops">${i ? `<button type="button" data-capa="${f.id}">Usar como capa</button>` : ''}<button type="button" data-rm="${f.id}">Excluir</button></div></figure>`).join('')}</div>` : '<div class="empty">Nenhuma foto enviada.</div>'}</div>`;
  el.querySelector('#up').onchange = async (e) => {
    const fd = new FormData();
    [...e.target.files].forEach((f) => fd.append('fotos', f));
    try { const r = await api(`/veiculos/${v.id}/fotos`, { method: 'POST', body: fd }); toast(`${r.enviadas} foto(s) enviada(s).`); reload(); } catch (err) { fail(err); }
  };
  el.querySelectorAll('[data-capa]').forEach((b) => (b.onclick = async () => { await put(`/fotos/${b.dataset.capa}/capa`, {}); reload(); }));
  el.querySelectorAll('[data-rm]').forEach((b) => (b.onclick = async () => { if (await confirmDlg('Excluir esta foto?', 'Excluir')) { await del('/fotos/' + b.dataset.rm); reload(); } }));
}

function tabDocs(el, v) {
  el.innerHTML = `<div class="card"><div class="card-h"><h2>Documentos do veículo</h2><button class="btn sm" id="nd">${icon('plus')}Gerar documento</button></div>
    ${table([{ label: 'Documento', key: 'titulo' }, { label: 'Criado', html: (d) => dth(d.criado_em) }, { label: 'Situação', html: (d) => (d.assinado_em ? pill('Assinado', 'ok') : d.status === 'enviado' ? pill('Aguardando assinatura', 'warn') : pill('Gerado')) }], v.documentos, { onRow: true, empty: 'Nenhum documento gerado.' })}</div>`;
  bindRows(el, v.documentos, (d) => (location.hash = `#/documento/${d.id}`));
  el.querySelector('#nd').onclick = () => gerarDocumento({ veiculo_id: v.id, venda_id: v.venda && v.venda.id });
}
