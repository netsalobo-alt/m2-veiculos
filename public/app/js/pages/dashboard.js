import { get, esc, brl, num, dt, can, state, barChart, MESES, CATEG, icon, today, table, fail } from '../core.js';
import { setCrumbs } from '../main.js';

export async function render(view) {
  setCrumbs('Painel');
  const d = await get('/dashboard');
  const f = d.financeiro;
  const hora = new Date().getHours();
  const saud = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
  const mesNome = new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const totalFaixas = d.estoque.faixas.reduce((a, x) => a + x.qtd, 0) || 1;

  view.innerHTML = `
  <div class="ph"><div><p class="eyebrow">M2 SEMINOVOS</p><h1>${saud}, ${esc(state.user.nome.split(' ')[0])}.</h1><p>Resumo da loja em ${esc(mesNome)}.</p></div>
    <div class="acts">${can('estoque') ? `<a class="btn ghost" href="#/estoque/novo">${icon('plus')}Cadastrar veículo</a>` : ''}${can('vendas') ? `<a class="btn" href="#/vendas/nova">${icon('sale')}Nova venda</a>` : ''}</div></div>

  <div class="grid g4">
    <div class="kpi dark"><div class="k">Vendas no mês</div><div class="v">${brl(d.mes.valor)}</div><div class="s">${d.mes.qtd} veículo(s) · ticket ${brl(d.mes.ticket)}</div></div>
    ${d.mes.lucro != null ? `<div class="kpi"><div class="k">Lucro no mês</div><div class="v ${d.mes.lucro < 0 ? 'neg' : ''}">${brl(d.mes.lucro)}</div><div class="s">Venda – compra – custos – comissão</div></div>` : ''}
    <div class="kpi"><div class="k">Veículos em estoque</div><div class="v">${d.estoque.qtd}</div><div class="s">${d.estoque.por_categoria.map((c) => `${c.qtd} ${CATEG[c.categoria].toLowerCase()}${c.qtd === 1 ? '' : 's'}`).join(' · ').replace('bike elétricas', 'bikes elétricas')}</div></div>
    <div class="kpi"><div class="k">Tempo médio no pátio</div><div class="v">${num(d.estoque.tempo_medio)} dias</div><div class="s">${d.parados.length ? `${d.parados.length} veículo(s) acima de 60 dias` : 'Nenhum veículo acima de 60 dias'}</div></div>
    ${d.estoque.investido != null ? `<div class="kpi"><div class="k">Capital investido em estoque</div><div class="v">${brl(d.estoque.investido)}</div><div class="s">Anunciado: ${brl(d.estoque.anunciado)}</div></div>` : ''}
    ${f ? `<div class="kpi"><div class="k">Saldo em caixa e bancos</div><div class="v ${f.saldo < 0 ? 'neg' : ''}">${brl(f.saldo)}</div><div class="s">${f.vencidos ? `<a class="linkbtn" href="#/lancamentos?status=vencido">${f.vencidos} lançamento(s) vencido(s)</a>` : 'Nenhum lançamento vencido'}</div></div>
    <div class="kpi"><div class="k">A receber em 7 dias</div><div class="v">${brl(f.receber7)}</div><div class="s">Inclui vencidos</div></div>
    <div class="kpi"><div class="k">A pagar em 7 dias</div><div class="v">${brl(f.pagar7)}</div><div class="s">Inclui vencidos</div></div>` : ''}
    ${can('leads') ? `<div class="kpi"><div class="k">Leads novos do site</div><div class="v">${d.leads_novos}</div><div class="s"><a class="linkbtn" href="#/leads">Ver leads</a></div></div>` : ''}
    <div class="kpi"><div class="k">Documentos aguardando assinatura</div><div class="v">${d.docs_pendentes}</div><div class="s"><a class="linkbtn" href="#/documentos">Ver documentos</a></div></div>
  </div>

  ${can('financeiro') ? '<section class="card cg" id="cg" style="margin-top:18px"></section>' : ''}

  <div class="grid g-main" style="margin-top:18px">
    <section class="card"><div class="card-h"><h2>Faturamento dos últimos 6 meses</h2></div>
      ${barChart(d.meses.map((m) => ({ label: MESES[Number(m.mes.slice(5)) - 1], v: m.valor, tip: `${MESES[Number(m.mes.slice(5)) - 1]}/${m.mes.slice(2, 4)}: ${brl(m.valor)} · ${m.qtd} venda(s)${m.lucro != null ? ' · lucro ' + brl(m.lucro) : ''}` })))}
      <details style="margin-top:14px"><summary class="muted" style="cursor:pointer;font-size:13px">Ver em tabela</summary>
        <table class="tbl" style="margin-top:10px"><thead><tr><th>Mês</th><th class="num">Vendas</th><th class="num">Faturamento</th>${d.meses[0].lucro != null ? '<th class="num">Lucro</th>' : ''}</tr></thead>
        <tbody>${d.meses.map((m) => `<tr><td>${MESES[Number(m.mes.slice(5)) - 1]}/${m.mes.slice(0, 4)}</td><td class="num">${m.qtd}</td><td class="num">${brl(m.valor)}</td>${m.lucro != null ? `<td class="num">${brl(m.lucro)}</td>` : ''}</tr>`).join('')}</tbody></table></details>
    </section>
    <section class="card"><h2>Tempo no pátio</h2>
      ${d.estoque.faixas.map((x) => `<div style="margin-bottom:14px"><div class="kv" style="border:0;padding:0 0 6px"><span>${esc(x.nome)}</span><strong>${x.qtd}</strong></div><div class="meter"><i style="width:${(x.qtd / totalFaixas) * 100}%"></i></div></div>`).join('')}
      <p class="small" style="margin:6px 0 0">Veículos parados há muito tempo prendem capital. Revise preço ou anúncio acima de 60 dias.</p>
    </section>
  </div>

  <div class="grid g2" style="margin-top:18px">
    <section class="card"><div class="card-h"><h2>Parados há mais de 60 dias</h2><a class="linkbtn" href="#/estoque">Estoque</a></div>
      ${d.parados.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Veículo</th><th class="num">Dias</th><th class="num">Preço</th><th class="num">FIPE</th></tr></thead><tbody>
      ${d.parados.map((p) => `<tr class="click" onclick="location.hash='#/veiculo/${p.id}'"><td><div class="t1">${esc(p.descricao)}</div><div class="t2">${esc(p.placa || '')}</div></td><td class="num"><span class="pill ${p.dias > 90 ? 'bad' : 'warn'}">${p.dias}</span></td><td class="num">${brl(p.preco)}</td><td class="num">${brl(p.fipe)}</td></tr>`).join('')}
      </tbody></table></div>` : '<div class="empty">Nenhum veículo parado há mais de 60 dias.</div>'}
    </section>
    <section class="card"><div class="card-h"><h2>Últimas vendas do mês</h2>${can('vendas') ? '<a class="linkbtn" href="#/vendas">Vendas</a>' : ''}</div>
      ${d.ultimas.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Data</th><th>Veículo</th><th>Cliente</th><th class="num">Valor</th></tr></thead><tbody>
      ${d.ultimas.map((u) => `<tr class="click" onclick="location.hash='#/venda/${u.id}'"><td>${dt(u.data)}</td><td>${esc(u.veiculo)}</td><td>${esc(u.cliente)}</td><td class="num">${brl(u.valor)}</td></tr>`).join('')}
      </tbody></table></div>` : '<div class="empty">Nenhuma venda registrada neste mês.</div>'}
    </section>
  </div>`;
  const cg = view.querySelector('#cg');
  if (cg) capitalGiro(cg).catch(fail);
}

// ------------------------------------------------------------------ capital de giro para reposição de estoque (consulta)
const MES_LONGO = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
let cgMes = null;
async function capitalGiro(el) {
  cgMes = cgMes || today().slice(0, 7);
  const r = await get('/capital-giro?mes=' + cgMes);
  const [ano, m] = cgMes.split('-').map(Number);
  const mover = (n) => { const d = new Date(ano, m - 1 + n, 1); cgMes = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; capitalGiro(el).catch(fail); };
  const anos = []; const a0 = Number((r.primeiro_mes || cgMes).slice(0, 4)); for (let y = Math.min(a0, ano); y <= Math.max(Number(today().slice(0, 4)), ano); y++) anos.push(y);
  const bloco = (k, v, s, cls = '') => `<div class="cg-box ${cls}"><span class="k">${k}</span><strong class="${v < 0 ? 'neg' : ''}">${brl(v)}</strong><span class="s">${s}</span></div>`;
  const op = (x) => `<span class="cg-op" aria-hidden="true">${x}</span>`;
  const fimTxt = `${dt(r.fim)}`;
  el.innerHTML = `<div class="card-h" style="flex-wrap:wrap;gap:10px"><div><h2 style="margin:0">Capital de giro para reposição de estoque</h2>
      <p class="muted" style="margin:4px 0 0;font-size:13px">Somente consulta. Posição em ${fimTxt}: o dinheiro dos sócios, menos o que está parado em carros no pátio e o que ainda falta voltar das vendas.</p></div>
      <div class="seg cg-filtro" role="group" aria-label="Mês e ano"><button type="button" data-n="-1" aria-label="Mês anterior">←</button>
        <select id="cg-m" aria-label="Mês">${MES_LONGO.map((n, i) => `<option value="${i + 1}" ${i + 1 === m ? 'selected' : ''}>${n}</option>`).join('')}</select>
        <select id="cg-a" aria-label="Ano">${anos.map((y) => `<option ${y === ano ? 'selected' : ''}>${y}</option>`).join('')}</select>
        <button type="button" data-n="1" aria-label="Próximo mês">→</button></div></div>
    <div class="cg-eq ${r.sem_veiculo ? '' : 'cg-4'}">
      ${bloco('Aportes dos sócios', r.aportes, r.mes_aportes ? `no mês: ${brl(r.mes_aportes)}${r.aportes_socios.length ? ' · ' + r.aportes_socios.map((a) => `${esc(a.socio.split(' ')[0])} ${brl(a.valor)}`).join(' · ') : ''}` : 'total colocado pelos sócios', 'pos')}${op('−')}
      ${bloco('Parado no estoque', r.estoque, `pago dos ${r.estoque_qtd} carro(s) no pátio · custo cadastrado ${brl(r.estoque_custo)}`, 'negbox')}${op('−')}
      ${bloco('Falta voltar das vendas', r.falta_vendas, `${r.vendidos_qtd} vendido(s): custo pago ${brl(r.vendidos_pago)} · já recuperado ${brl(r.vendidos_recuperado)}`, 'negbox')}
      ${r.sem_veiculo ? `${op('−')}${bloco('Pagos sem veículo', r.sem_veiculo, 'compras ou preparação sem carro ligado: confira a categoria', 'warnbox')}` : ''}${op('=')}
      ${bloco('Capital de giro', r.saldo, `em ${fimTxt} · mês anterior: ${brl(r.saldo_anterior)}`, 'dark')}
    </div>
    <p class="small" style="margin:12px 0 0">No mês: entraram ${brl(r.mes_aportes)} de aportes, voltaram ${brl(r.mes_recuperado)} das vendas (até o custo de cada carro) e foram pagos ${brl(r.mes_pago)} em compras e preparação. Parcelas pendentes e veículos recebidos na troca não contam como dinheiro disponível.</p>
    <details style="margin-top:12px"><summary class="muted" style="cursor:pointer;font-size:13px">Ver detalhes</summary>
      <h3 style="font-size:14px;margin:14px 0 8px">Carros parados no estoque em ${fimTxt}</h3>
      ${table([
        { label: 'Veículo', html: (c) => `<a class="linkbtn" href="#/veiculo/${c.veiculo_id}">${esc(c.veiculo)}</a>${c.placa ? `<div class="t2">${esc(c.placa)}</div>` : ''}` },
        { label: 'Custo cadastrado', num: true, html: (c) => brl(c.custo) },
        { label: 'Já pago', num: true, html: (c) => `<strong>${brl(c.pago)}</strong>` },
        { label: 'Diferença', num: true, html: (c) => (Math.abs(c.custo - c.pago) < 0.01 ? '<span class="muted">—</span>' : `<span class="gold">${brl(c.custo - c.pago)}</span>`) },
      ], r.carros, { empty: 'Nenhum carro com pagamento no estoque.', foot: r.carros.length ? ['Total', brl(r.estoque_custo), brl(r.estoque), brl(r.estoque_custo - r.estoque)] : null })}
      <h3 style="font-size:14px;margin:16px 0 8px">Capital recuperado das vendas no mês</h3>
      ${table([
        { label: 'Veículo vendido', html: (v) => `<a class="linkbtn" href="#/venda/${v.venda_id}">${esc(v.veiculo)}</a><div class="t2">${esc(v.placa || '')} · venda em ${dt(v.data_venda)}</div>` },
        { label: 'Compra + preparação', num: true, html: (v) => brl(v.custo) },
        { label: 'Recebido no mês', num: true, html: (v) => brl(v.recebido_mes) },
        { label: 'Recuperado no mês', num: true, html: (v) => `<strong class="pos">${brl(v.recuperado_mes)}</strong>` },
        { label: 'Falta recuperar', num: true, html: (v) => (v.falta > 0.009 ? brl(v.falta) : '<span class="pill ok">Recuperado</span>') },
      ], r.vendas, { empty: 'Nenhum recebimento de venda neste mês.' })}
      <h3 style="font-size:14px;margin:16px 0 8px">Pagamentos de compra e preparação no mês</h3>
      ${table([
        { label: 'Data', html: (p) => dt(p.data) },
        { label: 'Descrição', html: (p) => `${esc(p.descricao)}${p.veiculo ? `<div class="t2"><a class="linkbtn" href="#/veiculo/${p.veiculo_id}">${esc(p.veiculo)}</a>${p.placa ? ' · ' + esc(p.placa) : ''}</div>` : ''}` },
        { label: 'Tipo', html: (p) => (p.categoria === 'Compra de veículos' ? 'Compra' : 'Preparação') },
        { label: 'Carro', html: (p) => (p.grupo === 'vendidos' ? '<span class="pill">Já vendido</span>' : p.grupo === 'estoque' ? '<span class="pill info">No estoque</span>' : '<span class="pill warn" title="Lançamento sem veículo ligado. Confira a categoria ou ligue ao carro.">Sem veículo</span>') },
        { label: 'Valor', num: true, html: (p) => `<strong class="neg">${brl(p.valor)}</strong>` },
      ], r.pagamentos, { empty: 'Nenhuma compra ou preparação paga neste mês.' })}
    </details>`;
  el.querySelectorAll('[data-n]').forEach((b) => (b.onclick = () => mover(Number(b.dataset.n))));
  const muda = () => { cgMes = `${el.querySelector('#cg-a').value}-${String(el.querySelector('#cg-m').value).padStart(2, '0')}`; capitalGiro(el).catch(fail); };
  el.querySelector('#cg-m').onchange = muda; el.querySelector('#cg-a').onchange = muda;
}
