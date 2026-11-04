import { get, esc, brl, num, dt, can, state, barChart, MESES, CATEG, icon } from '../core.js';
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
}
