// Fiscal: NF-e emitidas pela Notavia (lista no estilo do BomSaldo, detalhe e emissão a partir da venda)
import { api, get, post, esc, brl, dt, dth, table, modal, toast, fail, icon, pill, can, today } from '../core.js';
import { setCrumbs } from '../main.js';

const MESES_LONGO = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const COR = { autorizada: 'ok', pendente: 'info', processando: 'info', rejeitada: 'bad', falha: 'bad', cancelada: 'dark' };
const FORMA = { '01': 'Dinheiro', '02': 'Cheque', '03': 'Cartão de crédito', '04': 'Cartão de débito', '15': 'Boleto', '17': 'PIX', '18': 'Transferência', '99': 'Outros' };
const situacao = (n) => `${pill(n.status_txt || n.status, COR[n.status] || '')}${n.ambiente === 'homologacao' ? ' <span class="pill warn" title="Emitida em homologação: sem valor fiscal">Teste</span>' : ''}`;
const st = { mes: today().slice(0, 7), status: '', q: '' };
let timer = null;

export async function list(view) {
  setCrumbs('Fiscal', 'NF-e');
  view.innerHTML = `<div class="ph"><div><p class="eyebrow">FISCAL</p><h1>NF-e</h1><p>Notas fiscais eletrônicas emitidas pela Notavia. Emita a partir da venda ou pelo botão ao lado.</p></div>
    <div class="acts"><a class="btn ghost" href="#/config">${icon('cog')}Configurações fiscais</a><button class="btn" id="nova">${icon('plus')}Emitir NF-e</button></div></div>
    <div class="fx-bar">
      <div class="seg" role="group" aria-label="Situação">${[['', 'Todas'], ['autorizada', 'Aprovadas'], ['pendente', 'Na fila'], ['rejeitada', 'Rejeitadas'], ['falha', 'Falhas'], ['cancelada', 'Canceladas']].map(([k, l]) => `<button type="button" data-st="${k}" aria-pressed="${st.status === k}">${l}</button>`).join('')}</div>
      <div class="fx-right"><input type="search" id="q" placeholder="Buscar destinatário, nº, chave ou placa" value="${esc(st.q)}" aria-label="Buscar" style="min-width:260px">
        <div class="seg" role="group" aria-label="Mês"><button type="button" id="mp" aria-label="Mês anterior">←</button><button type="button" aria-pressed="true" id="ml" style="min-width:170px"></button><button type="button" id="mn" aria-label="Próximo mês">→</button></div></div>
    </div>
    <div id="lst"></div><p class="small muted" id="tot" style="margin-top:10px"></p>`;
  const load = async () => {
    const [y, m] = st.mes.split('-').map(Number);
    view.querySelector('#ml').textContent = `${MESES_LONGO[m - 1]} de ${y}`;
    view.querySelectorAll('[data-st]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.st === st.status));
    const qs = new URLSearchParams({ mes: st.mes, status: st.status === 'pendente' ? '' : st.status, q: st.q });
    let rows = await get('/fiscal/notas?' + qs);
    if (st.status === 'pendente') rows = rows.filter((n) => ['pendente', 'processando'].includes(n.status));
    view.querySelector('#lst').innerHTML = table([
      { label: 'Nº', html: (n) => (n.numero ? `<strong>${n.numero}</strong><div class="t2">série ${n.serie ?? '–'}</div>` : '<span class="muted">—</span>') },
      { label: 'Venda', html: (n) => (n.venda_id ? `<a class="linkbtn" href="#/venda/${n.venda_id}">#${n.venda_id}</a>` : '<span class="muted">—</span>') },
      { label: 'Data', html: (n) => dt(n.autorizada_em || n.criado_em) },
      { label: 'Destinatário', html: (n) => `${n.pessoa_id ? `<a class="linkbtn" href="#/pessoa/${n.pessoa_id}">${esc(n.destinatario || '')}</a>` : esc(n.destinatario || '')}${n.veiculo ? `<div class="t2">${esc(n.veiculo)}${n.placa ? ' · ' + esc(n.placa) : ''}</div>` : ''}` },
      { label: 'Natureza da operação', html: (n) => esc(n.natureza || '—') },
      { label: 'Valor', num: true, html: (n) => brl(n.valor) },
      { label: 'Situação', html: (n) => `${situacao(n)}${['rejeitada', 'falha'].includes(n.status) && n.motivo ? `<div class="t2 neg" style="max-width:260px;white-space:normal">${esc(n.motivo).slice(0, 120)}</div>` : ''}` },
      { label: 'Ações', cls: 'nowrap right', html: (n) => `<button class="btn sm ghost" data-ver="${n.id}" aria-label="Ver nota">${icon('list')}</button>${n.status === 'autorizada' ? ` <a class="btn sm ghost" href="/api/fiscal/notas/${n.id}/danfe" target="_blank" rel="noopener">DANFE</a> <a class="btn sm ghost" href="/api/fiscal/notas/${n.id}/xml">XML</a>` : ''}${['pendente', 'processando'].includes(n.status) ? ` <button class="btn sm ghost" data-at="${n.id}">Atualizar</button>` : ''}` },
    ], rows, { empty: 'Nenhuma NF-e neste mês.' });
    view.querySelector('#tot').textContent = rows.length ? `${rows.length} nota(s) · ${brl(rows.filter((n) => n.status === 'autorizada').reduce((a, n) => a + (n.valor || 0), 0))} aprovadas` : '';
    view.querySelectorAll('[data-ver]').forEach((b) => (b.onclick = () => detalhe(Number(b.dataset.ver), load)));
    view.querySelectorAll('[data-at]').forEach((b) => (b.onclick = async () => { b.disabled = true; try { await post(`/fiscal/notas/${b.dataset.at}/atualizar`); await load(); } catch (e) { fail(e); b.disabled = false; } }));
    // enquanto houver nota na fila, atualiza sozinho
    clearTimeout(timer);
    if (rows.some((n) => ['pendente', 'processando'].includes(n.status))) timer = setTimeout(() => { if (document.body.contains(view.querySelector('#lst'))) load().catch(() => {}); }, 5000);
  };
  const re = () => load().catch(fail);
  view.querySelectorAll('[data-st]').forEach((b) => (b.onclick = () => { st.status = b.dataset.st; re(); }));
  const mover = (n) => { const [y, m] = st.mes.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); st.mes = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; re(); };
  view.querySelector('#mp').onclick = () => mover(-1); view.querySelector('#mn').onclick = () => mover(1);
  let t; view.querySelector('#q').oninput = (e) => { clearTimeout(t); t = setTimeout(() => { st.q = e.target.value.trim(); re(); }, 250); };
  view.querySelector('#nova').onclick = () => escolherVenda(re).catch(fail);
  await load();
}

// escolher a venda para emitir (vendas concluídas sem NF-e aprovada)
async function escolherVenda(onDone) {
  const vendas = (await get('/vendas?status=concluida')).slice(0, 200);
  modal({
    title: 'Emitir NF-e de venda', size: 'wide',
    body: `<p class="muted" style="margin-top:0">Escolha a venda. A nota é montada com o cliente, o veículo e as formas de pagamento da venda.</p>
      ${table([
        { label: 'Venda', html: (v) => `#${v.id}<div class="t2">${dt(v.data_venda)}</div>` },
        { label: 'Cliente', html: (v) => esc(v.cliente_nome || v.cliente || '') },
        { label: 'Veículo', html: (v) => esc(v.veiculo || [v.marca, v.modelo].filter(Boolean).join(' ')) },
        { label: 'Valor', num: true, html: (v) => brl(v.valor_venda) },
        { label: '', cls: 'right', html: (v) => `<button class="btn sm" data-em="${v.id}">Continuar</button>` },
      ], vendas, { empty: 'Nenhuma venda concluída.' })}`,
    onOpen: (d, close) => d.querySelectorAll('[data-em]').forEach((b) => (b.onclick = () => { close(); emitirNotaVenda(Number(b.dataset.em), onDone).catch(fail); })),
  });
}

// prévia e emissão da NF-e de uma venda (usada também na tela da venda)
export async function emitirNotaVenda(vendaId, onDone) {
  const p = await get(`/fiscal/vendas/${vendaId}/previa`);
  const bloqueia = p.pendencias.length > 0;
  modal({
    title: `NF-e da venda #${vendaId}`, size: 'wide', submitLabel: 'Emitir NF-e',
    body: `${p.ambiente === 'homologacao' ? '<div class="alert" style="margin-bottom:12px"><strong>Homologação (teste):</strong> a nota vai para o ambiente de teste da SEFAZ, sem valor fiscal. Troque para Produção em Configurações → Fiscal quando estiver tudo certo.</div>' : '<div class="alert info" style="margin-bottom:12px"><strong>Produção:</strong> a nota terá valor fiscal.</div>'}
      ${bloqueia ? `<div class="alert" style="margin-bottom:12px;border-color:var(--danger)"><strong>Falta resolver antes de emitir:</strong><ul style="margin:6px 0 0;padding-left:18px">${p.pendencias.map((x) => `<li>${esc(x.msg)}</li>`).join('')}</ul></div>` : ''}
      <div class="grid g2">
        <div><div class="kv"><span>Destinatário</span><strong>${esc(p.cliente ? p.cliente.nome : '—')}</strong></div><div class="kv"><span>CPF/CNPJ</span><strong>${esc((p.cliente && p.cliente.cpf_cnpj) || '—')}</strong></div><div class="kv"><span>Cidade</span><strong>${esc(p.cliente ? `${p.cliente.cidade || ''}${p.cliente.uf ? '/' + p.cliente.uf : ''}` : '—')}</strong></div></div>
        <div><div class="kv"><span>Operação</span><strong>${esc(p.operacao || '—')}</strong></div><div class="kv"><span>NCM</span><strong>${esc(p.veiculo.ncm || '—')}</strong></div><div class="kv"><span>Valor da nota</span><strong>${brl(p.valor)}</strong></div></div>
      </div>
      <p style="margin:14px 0 4px"><strong>${esc(p.veiculo.descricao)}</strong></p><p class="small muted" style="margin:0">${esc(p.veiculo.info || '')}</p>
      <p style="margin:14px 0 4px"><strong>Pagamentos</strong></p><p class="small" style="margin:0">${p.pagamentos.map((g) => `${esc(FORMA[g.tpag] || g.forma)} ${brl(g.valor)}`).join(' · ') || 'Sem formas de pagamento (vai como "Outros")'}</p>
      <p class="hint" style="margin-top:12px">Os impostos são calculados pela Notavia, conforme a matriz configurada pelo contador no portal dela.</p>
      ${p.notas.length ? `<p style="margin:12px 0 4px"><strong>Notas desta venda</strong></p>${p.notas.map((n) => `<div class="small">${n.numero ? 'Nº ' + n.numero + ' · ' : ''}${esc(n.status_txt)} · ${dth(n.criado_em)}${n.ambiente === 'homologacao' ? ' · teste' : ''}${n.motivo ? ` · <span class="neg">${esc(n.motivo).slice(0, 140)}</span>` : ''}</div>`).join('')}` : ''}`,
    onOpen: (d) => { const b = d.querySelector('form [type=submit]'); if (b && bloqueia) { b.disabled = true; b.title = 'Resolva as pendências acima'; } },
    onSubmit: async () => {
      if (bloqueia) return false;
      const n = await post(`/fiscal/vendas/${vendaId}/emitir`);
      toast('NF-e enviada à SEFAZ. Aguardando aprovação…');
      onDone && onDone();
      detalhe(n.id, onDone);
    },
  });
}

// detalhe da nota, com atualização automática enquanto estiver na fila
export async function detalhe(id, onChange) {
  let n = await get(`/fiscal/notas/${id}`);
  const m = modal({ title: 'NF-e', size: 'wide', body: '<div id="nfd"></div>' });
  let t = null;
  const desenhar = () => {
    m.el.querySelector('.dialog-top h2').textContent = n.numero ? `NF-e nº ${n.numero} (série ${n.serie ?? '–'})` : 'NF-e';
    m.el.querySelector('#nfd').innerHTML = `<p style="margin:0 0 12px">${situacao(n)}${['pendente', 'processando'].includes(n.status) ? ' <span class="muted small">atualizando sozinho…</span>' : ''}</p>
      ${n.motivo ? `<div class="alert" style="margin-bottom:12px;${['rejeitada', 'falha'].includes(n.status) ? 'border-color:var(--danger)' : ''}">${n.cstat ? `<strong>Código ${n.cstat}:</strong> ` : ''}${esc(n.motivo)}</div>` : ''}
      <div class="grid g2"><div>
        <div class="kv"><span>Destinatário</span><strong>${esc(n.destinatario || '—')}</strong></div><div class="kv"><span>CPF/CNPJ</span><strong>${esc(n.cpf_cnpj || '—')}</strong></div>
        <div class="kv"><span>Veículo</span><strong>${esc(n.veiculo || '—')}${n.placa ? ' · ' + esc(n.placa) : ''}</strong></div><div class="kv"><span>Valor</span><strong>${brl(n.valor)}</strong></div>
      </div><div>
        <div class="kv"><span>Natureza</span><strong>${esc(n.natureza || '—')}</strong></div><div class="kv"><span>Ambiente</span><strong>${n.ambiente === 'producao' ? 'Produção' : 'Homologação (teste)'}</strong></div>
        <div class="kv"><span>Pedido em</span><strong>${dth(n.criado_em)}</strong></div><div class="kv"><span>Aprovada em</span><strong>${n.autorizada_em ? dth(n.autorizada_em) : '—'}</strong></div>
      </div></div>
      ${n.chave ? `<div class="kv"><span>Chave de acesso</span><strong style="font-family:monospace;font-size:12px;word-break:break-all">${esc(n.chave)}</strong></div><div class="kv"><span>Protocolo</span><strong>${esc(n.protocolo || '—')}</strong></div>` : ''}
      <div class="kv"><span>Referência</span><strong class="small">${esc(n.referencia)}</strong></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px">
        ${n.status === 'autorizada' ? `<a class="btn" href="/api/fiscal/notas/${n.id}/danfe" target="_blank" rel="noopener">${icon('pdf')}Abrir DANFE</a><a class="btn ghost" href="/api/fiscal/notas/${n.id}/xml">Baixar XML</a>` : ''}
        ${['pendente', 'processando'].includes(n.status) ? '<button class="btn ghost" data-at>Atualizar agora</button>' : ''}
        ${['rejeitada', 'falha'].includes(n.status) && n.venda_id ? '<button class="btn" data-de>Corrigir e emitir de novo</button>' : ''}
        ${n.venda_id ? `<a class="btn ghost" href="#/venda/${n.venda_id}">Ver venda #${n.venda_id}</a>` : ''}
      </div>
      ${n.pedido ? `<details style="margin-top:14px"><summary class="muted small" style="cursor:pointer">Dados enviados à Notavia</summary><pre style="white-space:pre-wrap;font-size:11.5px;background:#f6f6f8;padding:10px;border-radius:8px;max-height:260px;overflow:auto">${esc(JSON.stringify(n.pedido, null, 2))}</pre></details>` : ''}`;
    const at = m.el.querySelector('[data-at]'); if (at) at.onclick = () => atualizar().catch(fail);
    const de = m.el.querySelector('[data-de]'); if (de) de.onclick = () => { m.close(); emitirNotaVenda(n.venda_id, onChange).catch(fail); };
  };
  const atualizar = async () => {
    const antes = n.status;
    const r = await post(`/fiscal/notas/${id}/atualizar`);
    n = { ...n, ...r };
    desenhar();
    if (r.status !== antes) { onChange && onChange(); if (r.status === 'autorizada') toast(`NF-e nº ${r.numero} aprovada.`); else if (['rejeitada', 'falha'].includes(r.status)) toast('A NF-e não foi aprovada. Veja o motivo.', true); }
    agenda();
  };
  const agenda = () => { clearTimeout(t); if (['pendente', 'processando'].includes(n.status) && m.el.isConnected) t = setTimeout(() => atualizar().catch(() => agenda()), 3000); };
  m.el.addEventListener('close', () => clearTimeout(t));
  desenhar(); agenda();
}
