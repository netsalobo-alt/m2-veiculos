// Núcleo do front-end: API, formatação, diálogos, rotas
export const state = { user: null };

export async function api(path, opts = {}) {
  const o = { method: opts.method || 'GET', headers: {}, credentials: 'same-origin' };
  if (opts.body instanceof FormData) o.body = opts.body;
  else if (opts.body !== undefined) { o.headers['content-type'] = 'application/json'; o.body = JSON.stringify(opts.body); }
  const r = await fetch('/api' + path, o);
  if (r.status === 401) { location.href = '/login?volta=' + encodeURIComponent(location.hash); throw new Error('Sessão expirada'); }
  const ct = r.headers.get('content-type') || '';
  const data = ct.includes('json') ? await r.json() : await r.text();
  if (!r.ok) throw new Error((data && data.error) || 'Erro ao comunicar com o servidor.');
  return data;
}
export const get = (p) => api(p);
export const post = (p, body) => api(p, { method: 'POST', body: body ?? {} });
export const put = (p, body) => api(p, { method: 'PUT', body });
export const del = (p) => api(p, { method: 'DELETE' });

// ---------- formatação ----------
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const brl = (v) => (v == null || v === '' || isNaN(v) ? '–' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
export const num = (v, d = 0) => (v == null || v === '' ? '–' : Number(v).toLocaleString('pt-BR', { maximumFractionDigits: d, minimumFractionDigits: d }));
export const pct = (v) => (v == null || !isFinite(v) ? '–' : `${Number(v).toFixed(1).replace('.', ',')}%`);
export const dt = (iso) => { if (!iso) return '–'; const [y, m, d] = String(iso).slice(0, 10).split('-'); return `${d}/${m}/${y}`; };
export const dth = (iso) => (iso ? `${dt(iso)} ${String(iso).slice(11, 16)}` : '–');
export const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
export const monthStart = (off = 0) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + off); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; };
export const monthEnd = (off = 0) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + off + 1, 0); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
export const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export const parseMoney = (s) => { if (typeof s === 'number') return s; s = String(s || '').trim(); if (!s) return 0; if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.'); return Number(s.replace(/[^\d.-]/g, '')) || 0; };
export const moneyInput = (v) => (v == null || v === '' ? '' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

export const CATEG = { carro: 'Carro', moto: 'Moto', bike: 'Bike elétrica' };
export const STATUS_V = { preparacao: ['Em preparação', 'info'], disponivel: ['Disponível', 'ok'], reservado: ['Reservado', 'warn'], vendido: ['Vendido', 'dark'] };
export const FORMAS = { dinheiro: 'Dinheiro', pix: 'PIX', transferencia: 'Transferência', cartao_debito: 'Cartão de débito', cartao_credito: 'Cartão de crédito', boleto: 'Boleto', financiamento: 'Financiamento', cheque: 'Cheque', troca: 'Veículo na troca', outro: 'Outro' };
export const PERFIS = { admin: 'Administrador', gerente: 'Gerente', vendedor: 'Vendedor', financeiro: 'Financeiro' };
export const pill = (txt, cls = '') => `<span class="pill ${cls}">${esc(txt)}</span>`;
export const statusVeic = (s) => pill(...(STATUS_V[s] || [s, '']));
export const vdesc = (v) => [v.marca, v.modelo, v.versao].filter(Boolean).join(' ');
export const can = (p) => state.user && state.user.perms.includes(p);
export const fotoUrl = (f) => (f ? '/uploads/' + f : '');

export const ICONS = {
  dash: '<path d="M3 13h8V3H3zM13 21h8V11h-8zM3 21h8v-6H3zM13 3v6h8V3z"/>',
  car: '<path d="M5 17h14M3 13l2-6h14l2 6v5H3z"/><circle cx="7.5" cy="16.5" r="1.5"/><circle cx="16.5" cy="16.5" r="1.5"/>',
  sale: '<path d="M20 12V8H6a2 2 0 0 1 0-4h12v4"/><path d="M4 6v12a2 2 0 0 0 2 2h14v-4"/><path d="M18 12a2 2 0 0 0 0 4h4v-4z"/>',
  users: '<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0M16 3.5a4 4 0 0 1 0 8M22 21a7 7 0 0 0-4-6.3"/>',
  doc: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
  tpl: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>',
  cash: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  chart: '<path d="M3 3v18h18"/><path d="M7 16V10M12 16V6M17 16v-4"/>',
  lead: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  cog: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  pdf: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M12 12v6M9 15l3 3 3-3"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 6-10 7L2 6"/>',
  wa: '<path d="M3 21l1.6-4.8A8.5 8.5 0 1 1 7.8 19.4z"/><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1.2-1.4-2-1-1 .8a4 4 0 0 1-2.1-2.1l.8-1-1-2z"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-2.6-6.4L21 8"/><path d="M21 3v5h-5"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  csv: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h8M12 11v8"/>',
};
export const icon = (n) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ''}</svg>`;

// ---------- feedback ----------
export function toast(msg, err = false) {
  let box = document.querySelector('.toasts');
  if (!box) { box = document.createElement('div'); box.className = 'toasts'; box.setAttribute('role', 'status'); document.body.append(box); }
  const t = document.createElement('div');
  t.className = 'toast' + (err ? ' err' : '');
  t.textContent = msg;
  box.append(t);
  setTimeout(() => t.remove(), err ? 6000 : 3500);
}
export const fail = (e) => toast(e.message || String(e), true);

// diálogo modal: retorna {el, close}. onSubmit(formData, form) -> fecha se não lançar erro
export function modal({ title, body, size = '', submitLabel = 'Salvar', onSubmit, onOpen, actions = '' }) {
  const d = document.createElement('dialog');
  if (size) d.className = size;
  d.innerHTML = `<div class="dialog-top"><h2>${esc(title)}</h2><button class="close" type="button" aria-label="Fechar">×</button></div>
    ${onSubmit ? `<form novalidate>${body}<div class="form-actions">${actions}<button type="button" class="btn ghost" data-cancel>Cancelar</button><button class="btn" type="submit">${esc(submitLabel)}</button></div></form>` : body}`;
  document.body.append(d);
  const close = () => { d.close(); d.remove(); };
  d.querySelector('.close').onclick = close;
  d.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
  const cancel = d.querySelector('[data-cancel]');
  if (cancel) cancel.onclick = close;
  const form = d.querySelector('form');
  if (form && onSubmit) {
    form.onsubmit = async (e) => {
      e.preventDefault();
      const btn = form.querySelector('[type=submit]');
      btn.disabled = true;
      try { const r = await onSubmit(formData(form), form); if (r !== false) close(); } catch (err) { fail(err); } finally { btn.disabled = false; }
    };
  }
  d.showModal();
  if (onOpen) onOpen(d, close);
  return { el: d, close };
}
export function confirmDlg(msg, okLabel = 'Confirmar') {
  return new Promise((resolve) => {
    const m = modal({ title: 'Confirmar', body: `<p>${esc(msg)}</p>`, submitLabel: okLabel, onSubmit: () => resolve(true) });
    m.el.addEventListener('close', () => resolve(false));
  });
}

// converte form em objeto (campos .money viram número; checkbox vira 0/1)
export function formData(form) {
  const o = {};
  form.querySelectorAll('input[name],select[name],textarea[name]').forEach((el) => {
    if (el.type === 'checkbox') o[el.name] = el.checked ? 1 : 0;
    else if (el.type === 'radio') { if (el.checked) o[el.name] = el.value; }
    else if (el.type === 'file') return;
    else if (el.classList.contains('money')) o[el.name] = el.value === '' ? null : parseMoney(el.value);
    else if (el.type === 'number') o[el.name] = el.value === '' ? null : Number(el.value);
    else o[el.name] = el.value;
  });
  return o;
}
// helpers de campos
export const field = (label, name, val = '', { type = 'text', cls = '', attrs = '', hint = '' } = {}) =>
  `<label class="${cls}">${esc(label)}<input type="${type}" name="${name}" value="${esc(val ?? '')}" ${attrs}>${hint ? `<span class="hint">${hint}</span>` : ''}</label>`;
export const moneyField = (label, name, val, { cls = '', attrs = '', hint = '' } = {}) =>
  `<label class="${cls}">${esc(label)}<input class="money" inputmode="decimal" name="${name}" value="${esc(moneyInput(val))}" placeholder="0,00" ${attrs}>${hint ? `<span class="hint">${hint}</span>` : ''}</label>`;
export const selectField = (label, name, options, val, { cls = '', attrs = '', empty = null } = {}) =>
  `<label class="${cls}">${esc(label)}<select name="${name}" ${attrs}>${empty != null ? `<option value="">${esc(empty)}</option>` : ''}${(Array.isArray(options) ? options.map((o) => (Array.isArray(o) ? o : [o, o])) : Object.entries(options))
    .map(([k, v]) => `<option value="${esc(k)}" ${String(k) === String(val ?? '') ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></label>`;
export const areaField = (label, name, val = '', { cls = 'c12', rows = 3 } = {}) => `<label class="${cls}">${esc(label)}<textarea name="${name}" rows="${rows}">${esc(val ?? '')}</textarea></label>`;

// formata campos de dinheiro ao sair
document.addEventListener('focusout', (e) => {
  if (e.target.classList && e.target.classList.contains('money') && e.target.value !== '') e.target.value = moneyInput(parseMoney(e.target.value));
});

// gráfico de barras simples (uma série) com tooltip
export function barChart(data, { fmt = brl } = {}) {
  const max = Math.max(1, ...data.map((d) => Math.abs(d.v || 0)));
  return `<div class="chart" role="img" aria-label="${esc(data.map((d) => `${d.label}: ${fmt(d.v)}`).join('; '))}">${data.map((d) =>
    `<div class="col"><span class="val">${d.v ? fmt(d.v).replace(/,\d\d$/, '') : ''}</span><div class="bar" data-tip="${esc(d.tip || `${d.label}: ${fmt(d.v)}`)}" style="height:${Math.max(0, (d.v || 0) / max) * 82}%"></div></div>`).join('')}</div>
    <div class="chart-x">${data.map((d) => `<span>${esc(d.label)}</span>`).join('')}</div>`;
}
let tipEl;
document.addEventListener('mouseover', (e) => {
  const t = e.target.closest && e.target.closest('[data-tip]');
  if (!t) { if (tipEl) tipEl.hidden = true; return; }
  if (!tipEl) { tipEl = document.createElement('div'); tipEl.className = 'tip'; document.body.append(tipEl); }
  tipEl.textContent = t.dataset.tip; tipEl.hidden = false;
  const r = t.getBoundingClientRect();
  tipEl.style.left = Math.min(window.innerWidth - tipEl.offsetWidth - 8, r.left + r.width / 2 - tipEl.offsetWidth / 2) + 'px';
  tipEl.style.top = r.top - tipEl.offsetHeight - 8 + 'px';
});

// tabela genérica
export function table(cols, rows, { onRow, empty = 'Nenhum registro encontrado.', foot } = {}) {
  if (!rows.length) return `<div class="tbl-wrap"><div class="empty">${esc(empty)}</div></div>`;
  return `<div class="tbl-wrap"><table class="tbl"><thead><tr>${cols.map((c) => `<th class="${c.num ? 'num' : ''}">${esc(c.label)}</th>`).join('')}</tr></thead>
  <tbody>${rows.map((r, i) => `<tr ${onRow ? `class="click" data-row="${i}"` : ''}>${cols.map((c) => `<td class="${c.num ? 'num' : ''} ${c.cls || ''}">${c.html ? c.html(r) : esc(r[c.key] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody>
  ${foot ? `<tfoot><tr>${foot.map((f, i) => `<td class="${cols[i] && cols[i].num ? 'num' : ''}">${f ?? ''}</td>`).join('')}</tr></tfoot>` : ''}</table></div>`;
}
export function bindRows(root, rows, fn) {
  root.querySelectorAll('tr[data-row]').forEach((tr) => {
    tr.onclick = (e) => { if (e.target.closest('button,a,input,select')) return; fn(rows[tr.dataset.row], e); };
  });
}

// abre PDF autenticado em nova aba
export function openUrl(url) { window.open(url, '_blank', 'noopener'); }

// busca de pessoa com cadastro rápido
export async function pessoaPicker(container, { name = 'cliente_id', value = null, label = 'Cliente' } = {}) {
  const pessoas = await get('/pessoas');
  container.innerHTML = `<label>${esc(label)}<div style="display:flex;gap:8px;margin-top:7px"><select name="${name}" style="margin:0" required>
    <option value="">Selecione…</option>${pessoas.map((p) => `<option value="${p.id}" ${p.id == value ? 'selected' : ''}>${esc(p.nome)}${p.cpf_cnpj ? ' · ' + esc(p.cpf_cnpj) : ''}</option>`).join('')}
    </select><button type="button" class="btn ghost" data-new style="min-height:46px">Novo</button></div></label>`;
  container.querySelector('[data-new]').onclick = async () => {
    const { pessoaForm } = await import('./pages/pessoas.js');
    pessoaForm(null, async (id) => { await pessoaPicker(container, { name, value: id, label }); });
  };
}
