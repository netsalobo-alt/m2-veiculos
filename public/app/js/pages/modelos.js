import { get, post, put, del, esc, dth, confirmDlg, toast, fail, field, selectField, table, bindRows, pill, icon } from '../core.js';
import { setCrumbs } from '../main.js';
import { docHtml } from '../dochtml.js';

export async function list(view) {
  setCrumbs('Modelos de contrato');
  const [rows, meta] = await Promise.all([get('/modelos'), get('/modelos/variaveis')]);
  view.innerHTML = `<div class="ph"><div><p class="eyebrow">DOCUMENTOS</p><h1>Modelos de contrato</h1><p>Textos-base de contratos, recibos e termos. Os campos entre {{ }} são preenchidos pelo sistema.</p></div>
    <div class="acts"><a class="btn" href="#/modelo/novo">${icon('plus')}Novo modelo</a></div></div><div id="lst"></div>`;
  view.querySelector('#lst').innerHTML = table([
    { label: 'Modelo', html: (m) => `<div class="t1">${esc(m.nome)}</div>` }, { label: 'Tipo', html: (m) => esc(meta.tipos[m.tipo] || m.tipo) },
    { label: 'Atualizado', html: (m) => dth(m.atualizado_em) }, { label: 'Situação', html: (m) => (m.ativo ? pill('Ativo', 'ok') : pill('Inativo')) },
  ], rows, { onRow: true });
  bindRows(view.querySelector('#lst'), rows, (m) => (location.hash = `#/modelo/${m.id}`));
}

export async function edit(view, { id }) {
  const novo = id === 'novo';
  const [meta, m] = await Promise.all([get('/modelos/variaveis'), novo ? Promise.resolve({ nome: '', tipo: 'outro', conteudo: '# TÍTULO DO DOCUMENTO\n\nTexto com {{cliente.nome}}...\n\n{{empresa.cidade}}, {{data_extenso}}.\n\n{{assinaturas}}', ativo: 1 }) : get('/modelos').then((l) => l.find((x) => String(x.id) === id))]);
  if (!m) throw new Error('Modelo não encontrado.');
  setCrumbs('Modelos de contrato', novo ? 'Novo modelo' : m.nome);
  view.innerHTML = `<div class="ph"><div><p class="eyebrow">MODELO</p><h1>${novo ? 'Novo modelo' : esc(m.nome)}</h1></div>
    <div class="acts">${novo ? '' : '<button class="btn danger" id="rm">Excluir</button>'}<button class="btn ghost" id="pv">Pré-visualizar</button><button class="btn" id="save">Salvar modelo</button></div></div>
    <div class="grid g-main" style="align-items:start">
      <section class="card"><form id="f" class="form-grid">
        ${field('Nome do modelo', 'nome', m.nome, { cls: 'c6', attrs: 'required' })}
        ${selectField('Tipo', 'tipo', meta.tipos, m.tipo, { cls: 'c3' })}
        <label class="check c3" style="margin-top:42px"><input type="checkbox" name="ativo" ${m.ativo ? 'checked' : ''}> Ativo</label>
        <label class="c12">Texto do modelo<textarea name="conteudo" class="code" id="txt" rows="26">${esc(m.conteudo)}</textarea>
          <span class="hint"># título · ## subtítulo de cláusula · **negrito** · linha em branco separa parágrafos</span></label>
      </form><div id="prev-box" hidden style="margin-top:18px"><div class="doc-preview" id="prev"></div></div></section>
      <aside class="card" style="position:sticky;top:84px"><h2>Campos disponíveis</h2><p class="muted" style="margin:-6px 0 10px;font-size:13px">Clique para inserir no cursor.</p>
        <div class="vars">${meta.variaveis.map(([k, l]) => `<button type="button" data-var="${esc(k)}"><span>${esc(l)}</span><code>{{${esc(k)}}}</code></button>`).join('')}</div></aside>
    </div>`;
  const txt = view.querySelector('#txt');
  view.querySelectorAll('[data-var]').forEach((b) => (b.onclick = () => {
    const ins = `{{${b.dataset.var}}}`;
    const s = txt.selectionStart, e = txt.selectionEnd;
    txt.value = txt.value.slice(0, s) + (b.dataset.var.startsWith('assinatura') ? `\n\n${ins}\n\n` : ins) + txt.value.slice(e);
    txt.focus(); txt.selectionStart = txt.selectionEnd = s + ins.length;
  }));
  view.querySelector('#pv').onclick = () => {
    const box = view.querySelector('#prev-box');
    box.hidden = !box.hidden;
    view.querySelector('#prev').innerHTML = docHtml(txt.value.replace(/\{\{\s*((?!assinatura)[\w.]+)\s*\}\}/g, (x, k) => `[${k}]`));
  };
  view.querySelector('#save').onclick = async () => {
    const f = view.querySelector('#f');
    const d = { nome: f.nome.value, tipo: f.tipo.value, conteudo: txt.value, ativo: f.ativo.checked ? 1 : 0 };
    try {
      if (novo) { const r = await post('/modelos', d); location.hash = `#/modelo/${r.id}`; } else await put('/modelos/' + id, d);
      toast('Modelo salvo.');
    } catch (e) { fail(e); }
  };
  const rm = view.querySelector('#rm');
  if (rm) rm.onclick = async () => { if (await confirmDlg('Excluir este modelo? Documentos já gerados não são afetados.', 'Excluir')) { await del('/modelos/' + id); location.hash = '#/modelos'; } };
}
