import { get, put, del, esc, dth, table, pill, confirmDlg, fail, icon } from '../core.js';
import { setCrumbs } from '../main.js';

const ST = { novo: ['Novo', 'warn'], em_contato: ['Em contato', 'info'], convertido: ['Convertido', 'ok'], perdido: ['Perdido', ''] };

export async function list(view) {
  setCrumbs('Leads do site');
  const rows = await get('/leads');
  view.innerHTML = `<div class="ph"><div><p class="eyebrow">COMERCIAL</p><h1>Leads do site</h1><p>Pedidos de contato e de avaliação enviados pelo site.</p></div></div><div id="lst"></div>`;
  const wa = (t) => { const n = String(t || '').replace(/\D/g, ''); return n ? `https://wa.me/${n.length <= 11 ? '55' + n : n}` : null; };
  view.querySelector('#lst').innerHTML = table([
    { label: 'Recebido', html: (l) => dth(l.criado_em) },
    { label: 'Contato', html: (l) => `<div class="t1">${esc(l.nome)}</div><div class="t2">${esc([l.telefone, l.email].filter(Boolean).join(' · '))}</div>` },
    { label: 'Interesse', html: (l) => `${l.tipo === 'avaliacao' ? pill('Quer vender o veículo', 'info') : esc(l.veiculo || 'Contato geral')}${l.veiculo_id ? ` <a class="linkbtn" href="#/veiculo/${l.veiculo_id}">abrir</a>` : ''}<div class="t2" style="max-width:360px;white-space:pre-line">${esc(l.mensagem || '')}</div>` },
    { label: 'Situação', html: (l) => `<select data-st aria-label="Situação" style="margin:0;min-height:36px;padding:6px 10px;width:auto">${Object.entries(ST).map(([k, [lab]]) => `<option value="${k}" ${l.status === k ? 'selected' : ''}>${lab}</option>`).join('')}</select>` },
    { label: '', cls: 'nowrap right', html: (l) => `${wa(l.telefone) ? `<a class="btn sm wa" href="${wa(l.telefone)}?text=${encodeURIComponent(`Olá, ${l.nome.split(' ')[0]}! Aqui é da M2 Seminovos. Recebemos seu contato pelo site${l.veiculo ? ' sobre o ' + l.veiculo : ''}.`)}" target="_blank" rel="noopener">${icon('wa')}WhatsApp</a> ` : ''}<button class="btn sm danger" data-rm aria-label="Excluir">×</button>` },
  ], rows, { empty: 'Nenhum lead recebido pelo site ainda.' });
  view.querySelectorAll('#lst tbody tr').forEach((tr, i) => {
    tr.querySelector('[data-st]').onchange = (e) => put('/leads/' + rows[i].id, { status: e.target.value }).catch(fail);
    tr.querySelector('[data-rm]').onclick = async () => { if (await confirmDlg('Excluir este lead?', 'Excluir')) { await del('/leads/' + rows[i].id); list(view); } };
  });
}
