// Fiscal: NF-e emitidas pela Notavia (lista no estilo do BomSaldo, detalhe e emissão a partir da venda)
import { api, get, post, esc, brl, dt, dth, table, modal, toast, fail, icon, pill, can, today } from '../core.js';
import { setCrumbs } from '../main.js';

const MESES_LONGO = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const COR = { autorizada: 'ok', pendente: 'info', processando: 'info', rejeitada: 'bad', falha: 'bad', cancelada: 'dark' };
const FORMA = { '01': 'Dinheiro', '02': 'Cheque', '03': 'Cartão de crédito', '04': 'Cartão de débito', '15': 'Boleto', '17': 'PIX', '18': 'Transferência', '99': 'Outros' };
const situacao = (n) => `${pill(n.status_txt || n.status, COR[n.status] || '')}${n.ambiente === 'homologacao' ? ' <span class="pill warn" title="Emitida em homologação: sem valor fiscal">Teste</span>' : ''}`;
const st = { mes: today().slice(0, 7), status: '', q: '' };
let timer = null;
const emCanc = (n) => ['pendente', 'processando'].includes(n.cancel_status);

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
      { label: 'Situação', html: (n) => `${situacao(n)}${emCanc(n) ? ' <span class="pill info">Cancelando…</span>' : ''}${['rejeitada', 'falha'].includes(n.status) && n.motivo ? `<div class="t2 neg" style="max-width:260px;white-space:normal">${esc(n.motivo).slice(0, 120)}</div>` : ''}` },
      { label: 'Ações', cls: 'nowrap right', html: (n) => `<button class="btn sm ghost" data-ver="${n.id}" aria-label="Ver nota">${icon('list')}</button>${['autorizada', 'cancelada'].includes(n.status) ? ` <a class="btn sm ghost" href="/api/fiscal/notas/${n.id}/danfe" target="_blank" rel="noopener">DANFE</a> <a class="btn sm ghost" href="/api/fiscal/notas/${n.id}/xml">XML</a>` : ''}${['pendente', 'processando'].includes(n.status) || emCanc(n) ? ` <button class="btn sm ghost" data-at="${n.id}">Atualizar</button>` : ''}` },
    ], rows, { empty: 'Nenhuma NF-e neste mês.' });
    view.querySelector('#tot').textContent = rows.length ? `${rows.length} nota(s) · ${brl(rows.filter((n) => n.status === 'autorizada').reduce((a, n) => a + (n.valor || 0), 0))} aprovadas` : '';
    view.querySelectorAll('[data-ver]').forEach((b) => (b.onclick = () => detalhe(Number(b.dataset.ver), load)));
    view.querySelectorAll('[data-at]').forEach((b) => (b.onclick = async () => { b.disabled = true; try { await post(`/fiscal/notas/${b.dataset.at}/atualizar`); await load(); } catch (e) { fail(e); b.disabled = false; } }));
    // enquanto houver nota na fila, atualiza sozinho
    clearTimeout(timer);
    if (rows.some((n) => ['pendente', 'processando'].includes(n.status) || emCanc(n))) timer = setTimeout(() => { if (document.body.contains(view.querySelector('#lst'))) load().catch(() => {}); }, 5000);
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
      <label style="display:block;margin-top:14px"><strong>Observações (informações complementares da nota)</strong>
        <textarea name="observacoes" rows="4" maxlength="2000" style="width:100%;margin-top:6px">${esc(p.observacoes || '')}</textarea></label>
      <div class="small muted" style="display:flex;justify-content:space-between;gap:8px"><span>Saem no campo "Informações complementares" do DANFE.</span><span><span data-cont></span>/2000 · <button type="button" class="linkbtn" data-padrao>Restaurar texto padrão</button></span></div>
      <p class="hint" style="margin-top:12px">Os impostos são calculados pela Notavia, conforme a matriz configurada pelo contador no portal dela.</p>
      ${p.notas.length ? `<p style="margin:12px 0 4px"><strong>Notas desta venda</strong></p>${p.notas.map((n) => `<div class="small">${n.numero ? 'Nº ' + n.numero + ' · ' : ''}${esc(n.status_txt)} · ${dth(n.criado_em)}${n.ambiente === 'homologacao' ? ' · teste' : ''}${n.motivo ? ` · <span class="neg">${esc(n.motivo).slice(0, 140)}</span>` : ''}</div>`).join('')}` : ''}`,
    onOpen: (d) => {
      const b = d.querySelector('form [type=submit]'); if (b && bloqueia) { b.disabled = true; b.title = 'Resolva as pendências acima'; }
      const ta = d.querySelector('[name=observacoes]'), ct = d.querySelector('[data-cont]');
      const conta = () => (ct.textContent = ta.value.length); ta.oninput = conta; conta();
      d.querySelector('[data-padrao]').onclick = () => { ta.value = p.observacoes_padrao || ''; conta(); ta.focus(); };
    },
    onSubmit: async (f) => {
      if (bloqueia) return false;
      const n = await post(`/fiscal/vendas/${vendaId}/emitir`, { observacoes: f.observacoes || '' });
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
      ${n.status === 'cancelada' ? `<div class="alert" style="margin-bottom:12px"><strong>NF-e cancelada${n.cancelada_em ? ' em ' + dth(n.cancelada_em) : ''}.</strong> A venda continua registrada; se precisar, emita uma nova nota pela venda.${n.cancel_justificativa ? `<div class="small" style="margin-top:4px">Justificativa: ${esc(n.cancel_justificativa)}</div>` : ''}${n.cancel_protocolo ? `<div class="small">Protocolo do cancelamento: ${esc(n.cancel_protocolo)}</div>` : ''}</div>` : ''}
      ${emCanc(n) ? '<div class="alert info" style="margin-bottom:12px"><strong>Cancelamento enviado à SEFAZ.</strong> <span class="muted small">atualizando sozinho…</span></div>' : ''}
      ${n.status === 'autorizada' && ['falha', 'rejeitado'].includes(n.cancel_status) ? `<div class="alert" style="margin-bottom:12px;border-color:var(--danger)"><strong>O cancelamento não foi aceito:</strong> ${esc(n.cancel_motivo || '')}<div class="small muted" style="margin-top:4px">A nota continua aprovada.</div></div>` : ''}
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
        ${['autorizada', 'cancelada'].includes(n.status) ? `<a class="btn" href="/api/fiscal/notas/${n.id}/danfe" target="_blank" rel="noopener">${icon('pdf')}Abrir DANFE</a><a class="btn ghost" href="/api/fiscal/notas/${n.id}/xml">Baixar XML</a>` : ''}
        ${n.status === 'autorizada' && !emCanc(n) ? '<button class="btn ghost" data-cnf style="color:var(--danger)">Cancelar nota</button>' : ''}
        ${['pendente', 'processando'].includes(n.status) || emCanc(n) ? '<button class="btn ghost" data-at>Atualizar agora</button>' : ''}
        ${['rejeitada', 'falha'].includes(n.status) && n.venda_id ? '<button class="btn" data-de>Corrigir e emitir de novo</button>' : ''}
        ${n.venda_id ? `<a class="btn ghost" href="#/venda/${n.venda_id}">Ver venda #${n.venda_id}</a>` : ''}
      </div>
      ${n.pedido ? `<details style="margin-top:14px"><summary class="muted small" style="cursor:pointer">Dados enviados à Notavia</summary><pre style="white-space:pre-wrap;font-size:11.5px;background:#f6f6f8;padding:10px;border-radius:8px;max-height:260px;overflow:auto">${esc(JSON.stringify(n.pedido, null, 2))}</pre></details>` : ''}`;
    const at = m.el.querySelector('[data-at]'); if (at) at.onclick = () => atualizar().catch(fail);
    const cb = m.el.querySelector('[data-cnf]'); if (cb) cb.onclick = () => cancelarNota(n, async () => { n = { ...n, ...(await get(`/fiscal/notas/${id}`)) }; desenhar(); onChange && onChange(); agenda(); });
    const de = m.el.querySelector('[data-de]'); if (de) de.onclick = () => { m.close(); emitirNotaVenda(n.venda_id, onChange).catch(fail); };
  };
  const atualizar = async () => {
    const antes = n.status, antesC = n.cancel_status;
    const r = await post(`/fiscal/notas/${id}/atualizar`);
    n = { ...n, ...r };
    desenhar();
    if (r.cancel_status !== antesC) { onChange && onChange(); if (r.status === 'cancelada') toast('NF-e cancelada. A venda não foi alterada.'); else if (['falha', 'rejeitado'].includes(r.cancel_status)) toast('O cancelamento não foi aceito. Veja o motivo.', true); }
    else if (r.status !== antes) { onChange && onChange(); if (r.status === 'autorizada') toast(`NF-e nº ${r.numero} aprovada.`); else if (['rejeitada', 'falha'].includes(r.status)) toast('A NF-e não foi aprovada. Veja o motivo.', true); }
    agenda();
  };
  const agenda = () => { clearTimeout(t); if ((['pendente', 'processando'].includes(n.status) || emCanc(n)) && m.el.isConnected) t = setTimeout(() => atualizar().catch(() => agenda()), 3000); };
  m.el.addEventListener('close', () => clearTimeout(t));
  desenhar(); agenda();
}

// cancelamento só da nota fiscal (a venda continua como está)
function cancelarNota(n, onDone) {
  const horas = n.autorizada_em ? (Date.now() - new Date(n.autorizada_em.replace(' ', 'T')).getTime()) / 36e5 : 0;
  modal({
    title: `Cancelar NF-e${n.numero ? ' nº ' + n.numero : ''}`, submitLabel: 'Confirmar cancelamento',
    body: `<div class="alert info" style="margin-top:0;margin-bottom:12px">Cancela <strong>só a nota fiscal</strong> na SEFAZ. A venda, o estoque e o financeiro <strong>não mudam</strong>. Depois, se precisar, emita uma nova NF-e pela venda.</div>
      ${horas > 24 ? '<div class="alert" style="margin-bottom:12px;border-color:var(--danger)"><strong>Atenção:</strong> a nota foi aprovada há mais de 24 h. Pela regra da SEFAZ o cancelamento costuma ser recusado depois desse prazo; nesse caso, fale com o contador (pode ser preciso uma nota de devolução).</div>' : ''}
      <label>Justificativa (mínimo 15 caracteres)<textarea name="justificativa" rows="3" minlength="15" maxlength="255" required placeholder="Ex.: Nota emitida com dados do cliente incorretos" style="width:100%;margin-top:6px"></textarea></label>
      <div class="small muted" style="text-align:right"><span data-cj>0</span>/255</div>`,
    onOpen: (d) => { d.querySelector('.form-actions [data-cancel]').textContent = 'Voltar'; const ta = d.querySelector('[name=justificativa]'), c = d.querySelector('[data-cj]'); ta.oninput = () => (c.textContent = ta.value.trim().length); },
    onSubmit: async (f) => {
      const j = String(f.justificativa || '').trim();
      if (j.length < 15) throw new Error('A justificativa precisa ter pelo menos 15 caracteres.');
      await post(`/fiscal/notas/${n.id}/cancelar`, { justificativa: j });
      toast('Cancelamento enviado à SEFAZ. Aguardando resposta…');
      onDone && onDone();
    },
  });
}

// ------------------------------------------------------------------ operações fiscais (na Notavia, gerenciadas por aqui)
const FINALIDADE = { 1: 'Normal', 2: 'Complementar', 3: 'Ajuste', 4: 'Devolução' };
// modelos comuns em revenda de veículos: CFOPs para o contador conferir
const MODELOS = [
  { codigo: 'Venda', descricao: 'Venda de veículo usado', tipoOperacao: 1, finalidade: 1, consumidorFinal: true, cfopDentroEstado: '5102', cfopForaEstado: '6102', dica: 'Venda de mercadoria adquirida de terceiros.' },
  { codigo: 'VendaMercadoria', descricao: 'Venda de mercadoria', tipoOperacao: 1, finalidade: 1, consumidorFinal: true, cfopDentroEstado: '5102', cfopForaEstado: '6102', dica: 'Venda de produto novo, como as bikes elétricas.' },
  { codigo: 'Demonstracao', descricao: 'Remessa para demonstração', tipoOperacao: 1, finalidade: 1, consumidorFinal: true, cfopDentroEstado: '5912', cfopForaEstado: '6912', dica: 'Saída do veículo para test-drive ou demonstração.' },
  { codigo: 'RetornoDemonstracao', descricao: 'Retorno de demonstração', tipoOperacao: 0, finalidade: 1, consumidorFinal: false, cfopDentroEstado: '1913', cfopForaEstado: '2913', dica: 'Volta do veículo que saiu em demonstração.' },
  { codigo: 'CompraPF', descricao: 'Entrada de veículo usado comprado', tipoOperacao: 0, finalidade: 1, consumidorFinal: false, cfopDentroEstado: '1102', cfopForaEstado: '2102', dica: 'Compra de veículo de pessoa física (NF-e de entrada emitida pela loja).' },
  { codigo: 'DevolucaoVenda', descricao: 'Devolução de venda', tipoOperacao: 0, finalidade: 4, consumidorFinal: false, cfopDentroEstado: '1202', cfopForaEstado: '2202', dica: 'Cliente devolve o veículo vendido.' },
];

export async function operacoes(view) {
  setCrumbs('Fiscal', 'Operações fiscais');
  view.innerHTML = `<div class="ph"><div><p class="eyebrow">FISCAL</p><h1>Operações fiscais</h1><p>Natureza da operação e CFOPs usados nas NF-e. Ficam guardadas na Notavia e são gerenciadas por aqui. Os impostos de cada operação são definidos na matriz de impostos, no portal da Notavia.</p></div>
    <div class="acts">${can('config') ? `<button class="btn ghost" id="modelos">Modelos prontos</button><button class="btn" id="nova">${icon('plus')}Nova operação</button>` : ''}</div></div>
    <div id="ops"><div class="empty">Carregando da Notavia…</div></div>
    <p class="hint" style="margin-top:12px">Para excluir uma operação, use o portal da Notavia (a API não permite excluir). Confira os CFOPs com o contador antes de emitir em produção.</p>`;
  const load = async () => {
    const r = await get('/fiscal/operacoes');
    const ops = r.operacoes;
    const NOMES = { carro: 'carro', moto: 'moto', bike: 'bike' };
    const efetiva = (t) => (r.op_tipo && r.op_tipo[t]) || r.op_venda;
    const usos = (cod) => ['carro', 'moto', 'bike'].filter((t) => efetiva(t) === cod).map((t) => NOMES[t]);
    view.querySelector('#ops').innerHTML = table([
      { label: 'Código', html: (o) => `<strong>${esc(o.codigo)}</strong>${usos(o.codigo).length ? `<div style="margin-top:4px">${usos(o.codigo).map((t) => `<span class="pill ok">Venda: ${t}</span>`).join(' ')}</div>` : ''}` },
      { label: 'Natureza da operação', html: (o) => esc(o.descricao) },
      { label: 'Tipo', html: (o) => (o.tipoOperacao === 0 ? pill('Entrada', 'info') : pill('Saída', '')) },
      { label: 'Finalidade', html: (o) => esc(FINALIDADE[o.finalidade] || o.finalidade) },
      { label: 'Consumidor final', html: (o) => (o.consumidorFinal ? 'Sim' : 'Não') },
      { label: 'CFOP no estado', html: (o) => `<span style="font-family:monospace">${esc(String(o.cfopDentroEstado || ''))}</span>` },
      { label: 'CFOP fora do estado', html: (o) => `<span style="font-family:monospace">${esc(String(o.cfopForaEstado || ''))}</span>` },
      { label: '', cls: 'nowrap right', html: (o) => (can('config') ? `${o.tipoOperacao === 1 ? `<button class="btn sm ghost" data-venda="${esc(o.codigo)}">Usar na venda…</button> ` : ''}<button class="btn sm ghost" data-ed="${esc(o.codigo)}">Editar</button>` : '') },
    ], ops, { empty: 'Nenhuma operação na Notavia. Use "Modelos prontos" para criar as mais comuns.' });
    view.querySelectorAll('[data-ed]').forEach((b) => (b.onclick = () => form(ops.find((o) => o.codigo === b.dataset.ed), false, load)));
    view.querySelectorAll('[data-venda]').forEach((b) => (b.onclick = () => {
      const cod = b.dataset.venda;
      modal({
        title: `Usar "${cod}" na venda de…`, submitLabel: 'Salvar',
        body: `<p class="muted" style="margin-top:0">Marque os tipos de veículo que usam esta operação na NF-e de venda.</p>
          ${['carro', 'moto', 'bike'].map((t) => `<label class="check"><input type="checkbox" name="t_${t}" ${efetiva(t) === cod ? 'checked' : ''}> ${({ carro: 'Carro', moto: 'Moto', bike: 'Bike elétrica' })[t]}${efetiva(t) && efetiva(t) !== cod ? ` <span class="muted small">(hoje: ${esc(efetiva(t))})</span>` : ''}</label>`).join('')}`,
        onSubmit: async (f) => {
          const tipos = ['carro', 'moto', 'bike'].filter((t) => f['t_' + t]);
          await api('/fiscal/operacao-venda', { method: 'PUT', body: { codigo: cod, tipos } });
          toast('Operação de venda por tipo salva.'); load();
        },
      });
    }));
    const mb = view.querySelector('#modelos'); if (mb) mb.onclick = () => modelos(ops, load);
  };
  const nb = view.querySelector('#nova'); if (nb) nb.onclick = () => form(null, true, load);
  try { await load(); } catch (e) { view.querySelector('#ops').innerHTML = `<div class="alert">${esc(e.message)}</div>`; }
}

function form(o, novo, onSaved) {
  const v = o || { tipoOperacao: 1, finalidade: 1, consumidorFinal: true };
  modal({
    title: novo ? 'Nova operação fiscal' : `Editar operação "${o.codigo}"`, size: 'wide', submitLabel: 'Salvar na Notavia',
    body: `<div class="form-grid">
      <label class="c4">Código<input name="codigo" value="${esc(v.codigo || '')}" ${novo ? '' : 'readonly'} required maxlength="40" placeholder="Ex.: Venda"></label>
      <label class="c8">Natureza da operação (descrição)<input name="descricao" value="${esc(v.descricao || '')}" required maxlength="120" placeholder="Ex.: Venda de veículo usado"></label>
      <label class="c4">Tipo<select name="tipoOperacao"><option value="1" ${v.tipoOperacao !== 0 ? 'selected' : ''}>Saída</option><option value="0" ${v.tipoOperacao === 0 ? 'selected' : ''}>Entrada</option></select></label>
      <label class="c4">Finalidade<select name="finalidade">${Object.entries(FINALIDADE).map(([k, l]) => `<option value="${k}" ${String(v.finalidade) === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="c4">Consumidor final<select name="consumidorFinal"><option value="1" ${v.consumidorFinal ? 'selected' : ''}>Sim</option><option value="0" ${!v.consumidorFinal ? 'selected' : ''}>Não</option></select></label>
      <label class="c4">CFOP dentro do estado<input name="cfopDentroEstado" value="${esc(String(v.cfopDentroEstado || ''))}" required inputmode="numeric" maxlength="5" placeholder="5102"></label>
      <label class="c4">CFOP fora do estado<input name="cfopForaEstado" value="${esc(String(v.cfopForaEstado || ''))}" required inputmode="numeric" maxlength="5" placeholder="6102"></label>
      <label class="check c12"><input type="checkbox" name="usar_na_venda"> Usar esta operação na NF-e de venda</label>
      <p class="hint c12">Saída usa CFOP começando com 5 (no estado) ou 6 (fora); entrada com 1 ou 2. O CFOP de cada nota é escolhido pela UF do destinatário.${novo ? '' : ' Alterar uma operação vale para as próximas notas.'}</p></div>`,
    onSubmit: async (d) => {
      const codigo = String(d.codigo || '').trim();
      await api(`/fiscal/operacoes/${encodeURIComponent(codigo)}`, { method: 'PUT', body: d });
      toast(`Operação "${codigo}" salva na Notavia.`); onSaved && onSaved();
    },
  });
}

function modelos(existentes, onSaved) {
  const tem = new Set(existentes.map((o) => o.codigo));
  modal({
    title: 'Modelos de operação para revenda de veículos', size: 'wide', submitLabel: 'Criar selecionadas',
    body: `<p class="muted" style="margin-top:0">Marque as operações que quer criar na Notavia. <strong>Confira os CFOPs com o contador</strong> (alguns usam outros CFOPs quando há substituição tributária).</p>
      ${MODELOS.map((m, i) => `<label class="check" style="align-items:flex-start;margin-bottom:10px"><input type="checkbox" name="m${i}" ${tem.has(m.codigo) ? 'disabled' : ''}> <span><strong>${esc(m.descricao)}</strong> <span class="muted">(${esc(m.codigo)} · ${m.tipoOperacao === 0 ? 'entrada' : 'saída'} · CFOP ${m.cfopDentroEstado}/${m.cfopForaEstado})</span>${tem.has(m.codigo) ? ' <span class="pill ok">já existe</span>' : ''}<br><span class="small muted">${esc(m.dica)}</span></span></label>`).join('')}`,
    onSubmit: async (d) => {
      const sel = MODELOS.filter((m, i) => d['m' + i] && !tem.has(m.codigo));
      if (!sel.length) throw new Error('Marque ao menos uma operação.');
      for (const m of sel) await api(`/fiscal/operacoes/${encodeURIComponent(m.codigo)}`, { method: 'PUT', body: { ...m, consumidorFinal: m.consumidorFinal ? 1 : 0 } });
      toast(`${sel.length} operação(ões) criada(s) na Notavia.`); onSaved && onSaved();
    },
  });
}
