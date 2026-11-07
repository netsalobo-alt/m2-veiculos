import { get, esc, brl, num, pct, dt, today, monthStart, monthEnd, table, CATEG, STATUS_V, statusVeic, vdesc, icon, fail } from '../core.js';
import { setCrumbs } from '../main.js';

const st = { aba: 'vendas', de: monthStart(), ate: today() };
const PRESETS = [['Este mês', () => [monthStart(), today()]], ['Mês passado', () => [monthStart(-1), monthEnd(-1)]], ['Últimos 3 meses', () => [monthStart(-2), today()]], ['Este ano', () => [today().slice(0, 4) + '-01-01', today()]]];

export async function render(view) {
  setCrumbs('Relatórios');
  view.innerHTML = `<div class="ph"><div><p class="eyebrow">FINANCEIRO</p><h1>Relatórios</h1><p>Vendas, resultado financeiro e estoque. Exporte em PDF ou planilha (CSV).</p></div>
    <div class="acts"><button class="btn ghost" id="csv">${icon('csv')}Exportar CSV</button><button class="btn black" id="pdf">${icon('pdf')}Gerar PDF</button></div></div>
    <div class="tabs" role="tablist">${[['vendas', 'Vendas'], ['financeiro', 'Financeiro (DRE)'], ['estoque', 'Estoque e tempo no pátio']].map(([k, l]) => `<button role="tab" data-aba="${k}" aria-selected="${st.aba === k}">${l}</button>`).join('')}</div>
    <div class="filters" id="per"><label>De<input type="date" id="de" value="${st.de}"></label><label>Até<input type="date" id="ate" value="${st.ate}"></label>
      ${PRESETS.map(([l], i) => `<button type="button" class="btn sm ghost" data-p="${i}">${l}</button>`).join('')}</div>
    <div id="out"></div>`;
  const url = (fmt) => `/api/relatorios/${st.aba}?de=${st.de}&ate=${st.ate}${fmt ? '&formato=' + fmt : ''}`;
  view.querySelector('#pdf').onclick = () => window.open(url('pdf'), '_blank');
  view.querySelector('#csv').onclick = () => (location.href = url('csv'));
  view.querySelectorAll('[data-aba]').forEach((b) => (b.onclick = () => { st.aba = b.dataset.aba; render(view).catch(fail); }));
  view.querySelector('#de').onchange = (e) => { st.de = e.target.value; load(); };
  view.querySelector('#ate').onchange = (e) => { st.ate = e.target.value; load(); };
  view.querySelectorAll('[data-p]').forEach((b) => (b.onclick = () => { [st.de, st.ate] = PRESETS[b.dataset.p][1](); view.querySelector('#de').value = st.de; view.querySelector('#ate').value = st.ate; load(); }));
  view.querySelector('#per').hidden = st.aba === 'estoque';
  const out = view.querySelector('#out');
  async function load() {
    out.innerHTML = '<div class="empty">Carregando…</div>';
    try {
      const r = await get(url().replace('/api', ''));
      out.innerHTML = ({ vendas: vendasHtml, financeiro: finHtml, estoque: estHtml })[st.aba](r);
    } catch (e) { fail(e); }
  }
  await load();
}

function vendasHtml(r) {
  const t = r.total;
  return `<div class="grid g4">
    <div class="kpi dark"><div class="k">Faturamento</div><div class="v">${brl(t.valor)}</div><div class="s">${r.qtd} veículo(s)</div></div>
    <div class="kpi"><div class="k">Lucro líquido</div><div class="v ${t.lucro < 0 ? 'neg' : ''}">${brl(t.lucro)}</div><div class="s">Margem ${pct(t.valor ? (t.lucro / t.valor) * 100 : null)}</div></div>
    <div class="kpi"><div class="k">Ticket médio</div><div class="v">${brl(r.ticket)}</div></div>
    <div class="kpi"><div class="k">Tempo médio até a venda</div><div class="v">${num(r.tempo_medio)} dias</div></div></div>
  <section class="card" style="margin-top:18px"><h2>Vendas no período</h2>${table([
    { label: 'Data', html: (l) => dt(l.data) }, { label: 'Veículo', html: (l) => `<div class="t1">${esc(l.veiculo)}</div><div class="t2">${CATEG[l.categoria]} · ${esc(l.placa || '')}</div>` },
    { label: 'Cliente', key: 'cliente' }, { label: 'Vendedor', key: 'vendedor' }, { label: 'Venda', num: true, html: (l) => brl(l.valor) }, { label: 'Compra + custos', num: true, html: (l) => brl(l.compra + l.custos) },
    { label: 'Comissão', num: true, html: (l) => brl(l.comissao) }, { label: 'Lucro', num: true, html: (l) => `<strong class="${l.lucro < 0 ? 'neg' : ''}">${brl(l.lucro)}</strong>` }, { label: 'Dias', num: true, key: 'dias' },
  ], r.linhas, { empty: 'Nenhuma venda no período.', foot: r.linhas.length ? ['Total', `${r.qtd} veículos`, '', '', brl(t.valor), brl(t.compra + t.custos), brl(t.comissao), brl(t.lucro), ''] : null })}</section>
  <div class="grid g2" style="margin-top:18px">
    <section class="card"><h2>Por vendedor</h2>${table([{ label: 'Vendedor', key: 'nome' }, { label: 'Qtd', num: true, key: 'qtd' }, { label: 'Faturamento', num: true, html: (g) => brl(g.valor) }, { label: 'Lucro', num: true, html: (g) => brl(g.lucro) }], r.por_vendedor, { empty: '–' })}</section>
    <section class="card"><h2>Por categoria</h2>${table([{ label: 'Categoria', key: 'nome' }, { label: 'Qtd', num: true, key: 'qtd' }, { label: 'Faturamento', num: true, html: (g) => brl(g.valor) }, { label: 'Lucro', num: true, html: (g) => brl(g.lucro) }], r.por_categoria, { empty: '–' })}</section></div>`;
}

function finHtml(r) {
  const d = r.dre;
  const linha = (l, v, cls = '', ind = false) => `<div class="kv ${cls}"><span style="${ind ? 'padding-left:18px' : ''}">${esc(l)}</span><strong class="${v < 0 ? 'neg' : ''}">${brl(v)}</strong></div>`;
  return `<div class="grid g4">
    <div class="kpi"><div class="k">Entradas realizadas</div><div class="v pos">${brl(r.total_entradas)}</div></div>
    <div class="kpi"><div class="k">Saídas realizadas</div><div class="v neg">${brl(r.total_saidas)}</div></div>
    <div class="kpi"><div class="k">Saldo de caixa do período</div><div class="v ${r.saldo < 0 ? 'neg' : ''}">${brl(r.saldo)}</div></div>
    <div class="kpi dark"><div class="k">Resultado (DRE)</div><div class="v">${brl(d.resultado)}</div><div class="s">${pct(d.receita_vendas ? (d.resultado / d.receita_vendas) * 100 : null)} da receita</div></div></div>
  <div class="grid g2" style="margin-top:18px">
    <section class="card"><h2>Demonstrativo de resultado</h2><p class="muted" style="margin:-6px 0 10px;font-size:13px">Regime de competência: vendas e despesas pela data da venda / vencimento.</p>
      ${linha('(+) Receita com vendas', d.receita_vendas)}${linha('(–) Custo dos veículos vendidos', -d.cmv)}${linha('(=) Lucro bruto', d.lucro_bruto, 'total')}
      ${linha('(–) Comissões', -d.comissoes)}${linha('(+) Outras receitas', d.outras_receitas)}${d.outras.map((o) => linha(o.categoria, o.total, '', true)).join('')}
      ${linha('(–) Despesas operacionais', -d.despesas_operacionais)}${d.despesas.map((o) => linha(o.categoria, -o.total, '', true)).join('')}
      ${linha('(=) Resultado do período', d.resultado, 'total')}</section>
    <div class="stack">

      <section class="card"><h2>Entradas por categoria (caixa)</h2>${table([{ label: 'Categoria', html: (e) => esc(e.categoria || '–') }, { label: 'Lanç.', num: true, key: 'n' }, { label: 'Total', num: true, html: (e) => brl(e.total) }], r.entradas, { empty: 'Sem entradas.' })}</section>
      <section class="card"><h2>Saídas por categoria (caixa)</h2>${table([{ label: 'Categoria', html: (e) => esc(e.categoria || '–') }, { label: 'Lanç.', num: true, key: 'n' }, { label: 'Total', num: true, html: (e) => brl(e.total) }], r.saidas, { empty: 'Sem saídas.' })}</section>
      <section class="card"><h2>Saldo por conta</h2>${r.contas.map((c) => linha(c.nome, c.saldo)).join('')}</section>
    </div></div>
      <section class="card" style="margin-top:18px"><h2>Aportes por sócio</h2><p class="muted" style="margin:-6px 0 10px;font-size:13px">Pagos no período. Ficam fora do resultado: são capital dos sócios, não receita nem despesa da loja.</p>
      ${table([
        { label: 'Sócio', html: (o) => (o.socio_id ? `<a class="linkbtn" href="#/socio/${o.socio_id}">${esc(o.nome)}</a>` : `<span class="muted">${esc(o.nome)}</span>`) },
        { label: 'Aportes', num: true, html: (o) => `<strong>${brl(o.aportes)}</strong>` },
        { label: 'Pagou (a restituir)', num: true, html: (o) => brl(o.adiantamentos) },
        { label: 'Restituído', num: true, html: (o) => brl(o.restituicoes) },
        { label: 'Repassado', num: true, html: (o) => brl(o.repasses) },
        { label: 'A restituir hoje', num: true, html: (o) => (o.a_restituir > 0.009 ? `<strong class="gold">${brl(o.a_restituir)}</strong>` : brl(0)) },
      ], r.socios.linhas, { empty: 'Nenhum aporte ou movimento de sócio no período.', foot: r.socios.linhas.length ? ['Total', brl(r.socios.total.aportes), brl(r.socios.total.adiantamentos), brl(r.socios.total.restituicoes), brl(r.socios.total.repasses), brl(r.socios.total.a_restituir)] : null })}</section>`;
}

function estHtml(r) {
  const t = r.total;
  return `<div class="grid g4">
    <div class="kpi"><div class="k">Veículos em estoque</div><div class="v">${r.qtd}</div></div>
    <div class="kpi dark"><div class="k">Capital investido</div><div class="v">${brl(t.investido)}</div></div>
    <div class="kpi"><div class="k">Valor anunciado</div><div class="v">${brl(t.anunciado)}</div><div class="s">Margem potencial ${brl(t.anunciado - t.investido)}</div></div>
    <div class="kpi"><div class="k">Tempo médio no pátio</div><div class="v">${num(r.tempo_medio)} dias</div></div></div>
  <section class="card" style="margin-top:18px"><h2>Tempo no pátio</h2>${table([{ label: 'Faixa', key: 'nome' }, { label: 'Veículos', num: true, key: 'qtd' }, { label: 'Capital investido', num: true, html: (f) => brl(f.investido) }], r.faixas)}</section>
  <section class="card" style="margin-top:18px"><h2>Veículos em estoque</h2>${table([
    { label: 'Veículo', html: (v) => `<a class="linkbtn" href="#/veiculo/${v.id}">${esc(vdesc(v))}</a><div class="t2">${CATEG[v.categoria]} · ${v.ano_fab || ''}/${v.ano_mod || ''} · ${esc(v.placa || '')}</div>` },
    { label: 'Situação', html: (v) => statusVeic(v.status) }, { label: 'Dias', num: true, html: (v) => `<span class="pill ${v.dias_patio > 90 ? 'bad' : v.dias_patio > 60 ? 'warn' : ''}">${v.dias_patio}</span>` },
    { label: 'Custo total', num: true, html: (v) => brl(v.custo_total) }, { label: 'Anunciado', num: true, html: (v) => brl(v.preco_venda) }, { label: 'FIPE', num: true, html: (v) => brl(v.fipe_valor) },
    { label: '% FIPE', num: true, html: (v) => pct(v.fipe_pct) }, { label: 'Margem', num: true, html: (v) => `<span class="${v.margem < 0 ? 'neg' : ''}">${brl(v.margem)}</span>` },
  ], r.linhas, { empty: 'Estoque vazio.', foot: r.linhas.length ? ['Total', '', '', brl(t.investido), brl(t.anunciado), brl(t.fipe), '', brl(t.anunciado - t.investido)] : null })}</section>`;
}
