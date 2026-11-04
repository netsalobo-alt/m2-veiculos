import { get, post, put, del, esc, dth, modal, confirmDlg, toast, fail, field, selectField, areaField, table, bindRows, pill, icon, openUrl } from '../core.js';
import { setCrumbs } from '../main.js';
import { docHtml } from '../dochtml.js';
export { docHtml };

// Diálogo para gerar documento a partir de um modelo
export async function gerarDocumento({ venda_id, veiculo_id, tipo }) {
  const modelos = (await get('/modelos')).filter((m) => m.ativo);
  if (!modelos.length) return toast('Cadastre um modelo de documento primeiro.', true);
  const sel = modelos.find((m) => m.tipo === tipo) || modelos[0];
  modal({
    title: 'Gerar documento',
    body: `${selectField('Modelo', 'modelo_id', modelos.map((m) => [m.id, m.nome]), sel.id)}
      <p class="hint">Os dados da venda, do cliente, do veículo e da loja são preenchidos automaticamente. Você poderá revisar o texto antes de enviar.</p>`,
    submitLabel: 'Gerar',
    onSubmit: async (d) => {
      const r = await post('/documentos', { modelo_id: d.modelo_id, venda_id, veiculo_id });
      toast('Documento gerado.');
      location.hash = `#/documento/${r.id}`;
    },
  });
}

const situacao = (d) => (d.assinado_em ? pill('Assinado', 'ok') : d.status === 'enviado' ? pill('Aguardando assinatura', 'warn') : pill('Gerado'));

export async function list(view) {
  setCrumbs('Documentos');
  view.innerHTML = `<div class="ph"><div><p class="eyebrow">DOCUMENTOS</p><h1>Documentos</h1><p>Contratos, recibos e termos gerados, com assinatura eletrônica por link.</p></div>
    <div class="acts"><a class="btn ghost" href="#/modelos">${icon('tpl')}Modelos</a></div></div>
    <div class="alert info">Para gerar um documento, abra uma <a class="linkbtn" href="#/vendas">venda</a> (contrato, recibo, garantia) ou um <a class="linkbtn" href="#/estoque">veículo</a> (recibo de compra).</div>
    <div class="filters"><input type="search" id="q" placeholder="Buscar por título ou cliente" aria-label="Buscar"></div><div id="lst"></div>`;
  const load = async (q = '') => {
    const rows = await get('/documentos?q=' + encodeURIComponent(q));
    view.querySelector('#lst').innerHTML = table([
      { label: 'Nº', key: 'id' }, { label: 'Documento', html: (d) => `<div class="t1">${esc(d.titulo)}</div>` }, { label: 'Signatário', key: 'pessoa_nome' },
      { label: 'Criado', html: (d) => dth(d.criado_em) }, { label: 'Enviado', html: (d) => [d.enviado_whatsapp_em && 'WhatsApp', d.enviado_email_em && 'E-mail'].filter(Boolean).join(' · ') || '–' },
      { label: 'Situação', html: situacao },
    ], rows, { onRow: true, empty: 'Nenhum documento gerado.' });
    bindRows(view.querySelector('#lst'), rows, (d) => (location.hash = `#/documento/${d.id}`));
  };
  let t;
  view.querySelector('#q').oninput = (e) => { clearTimeout(t); t = setTimeout(() => load(e.target.value).catch(fail), 250); };
  await load();
}

export async function detail(view, { id }) {
  const d = await get('/documentos/' + id);
  setCrumbs('Documentos', d.titulo);
  const pdfUrl = `/api/documentos/${d.id}/pdf`;
  view.innerHTML = `<div class="ph"><div><p class="eyebrow">DOCUMENTO Nº ${d.id}</p><h1>${esc(d.titulo)}</h1><p>${situacao(d)} · criado em ${dth(d.criado_em)}${d.pessoa_nome ? ' · ' + esc(d.pessoa_nome) : ''}</p></div>
    <div class="acts"><a class="btn black" href="${pdfUrl}" target="_blank" rel="noopener">${icon('pdf')}Ver PDF</a><a class="btn ghost" href="${pdfUrl}?download=1">Baixar PDF</a></div></div>
    <div class="grid g-main" style="align-items:start">
      <div class="doc-preview" id="prev">${docHtml(d.conteudo, d)}</div>
      <aside class="stack">
        <section class="card"><h2>Enviar para assinatura</h2>
          <p class="muted" style="margin:-6px 0 14px">O cliente abre o link no celular, lê o documento, informa nome e CPF e assina com o dedo.</p>
          <div class="stack" style="gap:10px">
            <button class="btn wa full" id="wa">${icon('wa')}Enviar link por WhatsApp</button>
            <button class="btn ghost full" id="mail">${icon('mail')}Enviar PDF por e-mail</button>
            <button class="btn ghost full" id="copy">${icon('link')}Copiar link de assinatura</button>
          </div>
          <div class="kv" style="margin-top:12px"><span>WhatsApp</span><strong>${dth(d.enviado_whatsapp_em)}</strong></div>
          <div class="kv"><span>E-mail</span><strong>${dth(d.enviado_email_em)}</strong></div></section>
        ${d.assinado_em ? `<section class="card"><h2>Assinatura</h2>
          <img src="${d.assinatura_img}" alt="Assinatura" style="max-width:100%;max-height:90px;display:block;margin-bottom:10px">
          <div class="kv"><span>Assinado por</span><strong>${esc(d.assinatura_nome)}</strong></div>
          <div class="kv"><span>CPF/CNPJ</span><strong>${esc(d.assinatura_doc)}</strong></div>
          <div class="kv"><span>Data</span><strong>${dth(d.assinado_em)}</strong></div>
          <div class="kv"><span>IP</span><strong>${esc(d.assinatura_ip)}</strong></div>
          <p class="small" style="word-break:break-all;margin:8px 0 0">Hash SHA-256: ${esc(d.assinatura_hash)}</p></section>` : `
        <section class="card"><h2>Revisar texto</h2><p class="muted" style="margin:-6px 0 14px">Ajuste o documento antes de enviar. Depois de assinado ele fica bloqueado.</p>
          <button class="btn ghost full" id="edit">Editar texto</button></section>`}
        <button class="btn danger full" id="rm">Excluir documento</button>
      </aside></div>`;

  view.querySelector('#wa').onclick = () => modal({
    title: 'Enviar por WhatsApp',
    body: `${field('Telefone com DDD', 'telefone', d.pessoa_telefone || '', { attrs: 'inputmode="tel" required', hint: 'Abre o WhatsApp com a mensagem e o link de assinatura prontos para enviar.' })}`,
    submitLabel: 'Abrir WhatsApp',
    onSubmit: async (f) => {
      if (f.telefone.replace(/\D/g, '').length < 10) throw new Error('Informe um telefone válido com DDD.');
      const w = window.open('about:blank', '_blank'); // abre antes do await para não ser bloqueado
      try {
        const r = await post(`/documentos/${d.id}/whatsapp`, f);
        if (w) w.location.href = r.url; else location.href = r.url;
      } catch (e) { if (w) w.close(); throw e; }
      detail(view, { id });
    },
  });
  view.querySelector('#mail').onclick = () => modal({
    title: 'Enviar por e-mail', size: 'wide',
    body: `${field('Para', 'to', d.pessoa_email || '', { type: 'email', attrs: 'required' })}${field('Assunto', 'assunto', d.titulo + ' – M2 Seminovos')}
      ${areaField('Mensagem', 'mensagem', `Olá${d.pessoa_nome ? ', ' + d.pessoa_nome.split(' ')[0] : ''}!\n\nSegue em anexo o documento "${d.titulo}".`, { rows: 5 })}
      ${d.assinado_em ? '' : '<label class="check"><input type="checkbox" name="incluir_link" checked> Incluir link para assinatura eletrônica</label>'}`,
    submitLabel: 'Enviar',
    onSubmit: async (f) => { f.incluir_link = !!f.incluir_link; const r = await post(`/documentos/${d.id}/email`, f); toast('E-mail enviado para ' + r.to); detail(view, { id }); },
  });
  view.querySelector('#copy').onclick = async () => {
    try { await navigator.clipboard.writeText(d.link_assinatura); toast('Link copiado.'); } catch (e) { modal({ title: 'Link de assinatura', body: `<input readonly value="${esc(d.link_assinatura)}" onfocus="this.select()">` }); }
  };
  const ed = view.querySelector('#edit');
  if (ed) ed.onclick = () => modal({
    title: 'Editar texto do documento', size: 'xwide',
    body: `${field('Título', 'titulo', d.titulo)}<label>Texto<textarea name="conteudo" class="code" rows="22">${esc(d.conteudo)}</textarea><span class="hint"># título · ## subtítulo · **negrito** · linha em branco separa parágrafos · {{assinaturas}} insere o bloco de assinaturas</span></label>`,
    onSubmit: async (f) => { await put('/documentos/' + d.id, f); toast('Documento atualizado.'); detail(view, { id }); },
  });
  view.querySelector('#rm').onclick = async () => {
    if (!(await confirmDlg('Excluir este documento? O link de assinatura deixará de funcionar.', 'Excluir'))) return;
    await del('/documentos/' + d.id); toast('Documento excluído.'); location.hash = '#/documentos';
  };
}
