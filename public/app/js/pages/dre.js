// DRE gerencial: resultado da loja mês a mês no ano, com grupos de despesa abertos por categoria e indicadores
import { get, esc, brl, today, icon, fail } from '../core.js';
import { setCrumbs } from '../main.js';

const MES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const st = { ano: today().slice(0, 4), abertos: new Set() };
const k = (v) => (v == null ? '–' : Math.round(v).toLocaleString('pt-BR'));
const pc = (v) => (v == null || !isFinite(v) ? '–' : `${v.toFixed(1).replace('.', ',')}%`);
const cor = (v) => (v < -0.005 ? 'neg' : '');

export async function render(view) {
  setCrumbs('Financeiro', 'DRE gerencial');
  view.innerHTML = `<div class="ph"><div><p class="eyebrow">FINANCEIRO</p><h1>DRE gerencial</h1><p>Resultado da loja mês a mês: vendas, custo dos carros, comissões e despesas por grupo.</p></div>
    <div class="acts"><a class="btn ghost" id="csv">${icon('csv')}Exportar CSV</a><button class="btn black" id="pdf">${icon('pdf')}Gerar PDF</button></div></div>
    <div class="filters" style="align-items:center"><div class="seg" role="group" aria-label="Ano"><button type="button" id="prev" aria-label="Ano anterior">←</button><button type="button" aria-pressed="true" id="ano" style="min-width:90px"></button><button type="button" id="next" aria-label="Próximo ano">→</button></div></div>
    <div id="dre"><div class="empty">Carregando…</div></div>`;
  const load = async () => {
    view.querySelector('#ano').textContent = st.ano;
    view.querySelector('#csv').href = `/api/financeiro/dre-gerencial?ano=${st.ano}&formato=csv`;
    const r = await get('/financeiro/dre-gerencial?ano=' + st.ano);
    desenhar(view.querySelector('#dre'), r);
  };
  view.querySelector('#prev').onclick = () => { st.ano = String(Number(st.ano) - 1); load().catch(fail); };
  view.querySelector('#next').onclick = () => { st.ano = String(Number(st.ano) + 1); load().catch(fail); };
  view.querySelector('#pdf').onclick = () => window.open(`/api/financeiro/dre-gerencial?ano=${st.ano}&formato=pdf`, '_blank');
  await load();
}

function desenhar(el, r) {
  const ind = r.indicadores;
  const atual = today().slice(0, 7);
  const res = r.linhas.find((l) => l.key === 'resultado');
  const max = Math.max(1, ...res.valores.map((v) => Math.abs(v)));
  const linha = (l, sub = false) => {
    const grupo = l.tipo === 'grupo' && (l.itens || []).length;
    const aberto = st.abertos.has(l.key);
    return `<tr class="dre-${sub ? 'sub' : l.tipo}" ${grupo ? `data-g="${esc(l.key)}" tabindex="0" role="button" aria-expanded="${aberto}"` : ''}>
      <th scope="row">${grupo ? `<span class="dre-seta">${aberto ? '▾' : '▸'}</span>` : ''}${esc(l.label)}</th>
      ${l.valores.map((v, i) => `<td class="num ${cor(v)} ${r.meses[i] === atual ? 'dre-atual' : ''}">${v ? k(v) : '<span class="muted">–</span>'}</td>`).join('')}
      <td class="num dre-tot ${cor(l.total)}">${k(l.total)}</td><td class="num muted">${pc(l.pct)}</td></tr>
      ${grupo && aberto ? l.itens.map((it) => linha({ ...it, tipo: 'sub' }, true)).join('') : ''}`;
  };
  const indLinha = (label, arr, tot, f = k) => `<tr><th scope="row">${esc(label)}</th>${arr.map((v, i) => `<td class="num ${r.meses[i] === atual ? 'dre-atual' : ''}">${f(v)}</td>`).join('')}<td class="num dre-tot">${f(tot)}</td><td></td></tr>`;
  const head = `<thead><tr><th>Conta</th>${MES.map((m, i) => `<th class="num ${r.meses[i] === atual ? 'dre-atual' : ''}">${m}</th>`).join('')}<th class="num">Total</th><th class="num">% rec.</th></tr></thead>`;
  el.innerHTML = `<div class="grid g4">
      <div class="kpi dark"><div class="k">Resultado do ano</div><div class="v">${brl(r.resultado_total)}</div><div class="s">margem líquida ${pc(ind.margem_liquida_total)}</div></div>
      <div class="kpi"><div class="k">Receita com vendas</div><div class="v">${brl(r.receita_total)}</div><div class="s">${ind.vendidos_total} veículo(s) · ticket ${ind.ticket_total == null ? '–' : brl(ind.ticket_total)}</div></div>
      <div class="kpi"><div class="k">Lucro bruto por veículo</div><div class="v">${ind.lucro_bruto_medio_total == null ? '–' : brl(ind.lucro_bruto_medio_total)}</div><div class="s">margem bruta ${pc(ind.margem_bruta_total)}</div></div>
      <div class="kpi"><div class="k">Ponto de equilíbrio</div><div class="v">${ind.ponto_equilibrio == null ? '–' : `${ind.ponto_equilibrio.toFixed(1).replace('.', ',')} carros/mês`}</div><div class="s">despesa média ${brl(ind.despesa_media_mes)} por mês</div></div></div>
    <section class="card" style="margin-top:18px"><h2>Resultado por mês</h2>
      <div class="dre-chart" role="img" aria-label="${esc(res.valores.map((v, i) => `${MES[i]}: ${brl(v)}`).join('; '))}">${res.valores.map((v, i) => `<div class="dre-col" title="${MES[i]}: ${brl(v)}"><div class="dre-pos">${v > 0 ? `<div class="dre-bar pos" style="height:${(v / max) * 100}%"></div>` : ''}</div><div class="dre-neg">${v < 0 ? `<div class="dre-bar neg" style="height:${(-v / max) * 100}%"></div>` : ''}</div><span>${MES[i]}</span></div>`).join('')}</div></section>
    <section class="card" style="margin-top:18px"><h2>Demonstrativo</h2>
      <p class="muted" style="margin:-6px 0 12px;font-size:13px">Valores em R$, sem centavos. Vendas pela data da venda; despesas e outras receitas pelo vencimento. Clique num grupo para ver as categorias. Aportes, repasses, empréstimos e a compra dos carros em estoque ficam fora.</p>
      <div class="tbl-wrap dre-wrap"><table class="tbl dre">${head}<tbody>${r.linhas.map((l) => linha(l)).join('')}</tbody></table></div></section>
    <section class="card" style="margin-top:18px"><h2>Indicadores</h2>
      <div class="tbl-wrap dre-wrap"><table class="tbl dre">${head.replace('<th>Conta</th>', '<th>Indicador</th>').replace('% rec.', '')}<tbody>
        ${indLinha('Veículos vendidos', ind.vendidos, ind.vendidos_total, (v) => (v == null ? '–' : String(v)))}
        ${indLinha('Ticket médio', ind.ticket, ind.ticket_total)}
        ${indLinha('Lucro bruto por veículo', ind.lucro_bruto_medio, ind.lucro_bruto_medio_total)}
        ${indLinha('Margem bruta', ind.margem_bruta, ind.margem_bruta_total, pc)}
        ${indLinha('Margem líquida', ind.margem_liquida, ind.margem_liquida_total, pc)}
        ${indLinha('Dias no pátio (vendidos)', ind.dias_patio, ind.dias_patio_total, (v) => (v == null ? '–' : String(Math.round(v))))}
      </tbody></table></div>
      <p class="hint" style="margin:12px 0 0">Ponto de equilíbrio: quantos carros por mês a loja precisa vender para pagar as despesas, usando o lucro médio por carro do ano (já sem comissão).</p></section>`;
  el.querySelectorAll('[data-g]').forEach((tr) => {
    const alterna = () => { const g = tr.dataset.g; if (st.abertos.has(g)) st.abertos.delete(g); else st.abertos.add(g); desenhar(el, r); };
    tr.onclick = alterna;
    tr.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); alterna(); } };
  });
}
