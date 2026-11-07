// Site público M2 Seminovos
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const brl = (v) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const num = (v) => Number(v).toLocaleString('pt-BR');
const CAT = { carro: 'Carro', moto: 'Moto', bike: 'Bike elétrica' };
const CATP = { carro: 'Carros', moto: 'Motos', bike: 'Bikes elétricas' };
const view = document.getElementById('view');
const st = { cat: '', q: '', ordem: 'recentes' };
let veiculos = [], empresa = {};
// conteúdo editável (vem de "Editar site" no sistema); o padrão abaixo é usado se a API falhar
let site = {
  aviso: { ativo: 0 }, cabecalho: {}, popup: { ativo: 0 }, rodape: {}, estoque: { titulo: 'Veículos disponíveis' },
  destaque: { eyebrow: 'M2 SEMINOVOS', titulo: 'Seu próximo carro. Uma nova conquista.', subtitulo: 'Carros, motos e bikes elétricas seminovos, com atendimento próximo, claro e confiável. Escolha o seu e fale com a gente.', botao1_texto: 'Ver estoque', botao1_acao: 'estoque', botao2_texto: 'Venda seu veículo', botao2_acao: 'vender', mostrar_contadores: 1 },
  secoes: ['promocoes', 'videos', 'estoque'], promocoes: { itens: [] }, videos: { itens: [] },
};
const cssUrl = (u) => String(u || '').replace(/['"()\\\s]/g, encodeURIComponent);
// botão configurável: a ação vem do editor (estoque, contato, vender, whatsapp, link)
function botao(texto, acao, url, cls = 'btn', msgWa = 'Olá! Vim pelo site da M2 Seminovos.') {
  if (!texto || acao === 'nenhum') return '';
  if (acao === 'estoque') return `<button class="${cls}" type="button" data-go="estoque">${esc(texto)}</button>`;
  if (acao === 'contato' || acao === 'vender') return `<button class="${cls}" type="button" data-open="${acao}">${esc(texto)}</button>`;
  if (acao === 'whatsapp') { const w = waLink(msgWa); return w ? `<a class="${cls}" href="${esc(w)}" target="_blank" rel="noopener">${esc(texto)}</a>` : `<button class="${cls}" type="button" data-open="contato">${esc(texto)}</button>`; }
  if (acao === 'link' && url) { const ext = /^https?:/i.test(url); return `<a class="${cls}" href="${esc(url)}"${ext ? ' target="_blank" rel="noopener"' : ''}>${esc(texto)}</a>`; }
  return '';
}

function secPromocoes() {
  const it = site.promocoes.itens || [];
  if (!it.length) return '';
  return `<section class="wrap" id="promocoes"><div class="sec-h"><div><p class="eyebrow">OFERTAS</p><h2>${esc(site.promocoes.titulo || 'Promoções')}</h2>${site.promocoes.subtitulo ? `<p class="small" style="margin:6px 0 0">${esc(site.promocoes.subtitulo)}</p>` : ''}</div></div>
    <div class="promos">${it.map((p) => `<article class="promo">
      <div class="promo-img ${p.imagem ? '' : 'noimg'}" style="${p.imagem ? `background-image:url('${cssUrl(p.imagem)}')` : ''}">${p.selo ? `<span class="badge">${esc(p.selo)}</span>` : ''}</div>
      <div class="promo-body"><h3>${esc(p.titulo)}</h3>${p.texto ? `<p>${esc(p.texto)}</p>` : ''}${p.fim ? `<p class="small">Válida até ${p.fim.split('-').reverse().join('/')}</p>` : ''}
      ${botao(p.botao_texto, p.acao, p.url, 'btn', `Olá! Vi a promoção "${p.titulo}" no site da M2 Seminovos.`)}</div></article>`).join('')}</div></section>`;
}
function secVideos() {
  const it = site.videos.itens || [];
  if (!it.length) return '';
  return `<section class="wrap" id="videos"><div class="sec-h"><div><p class="eyebrow">VÍDEOS</p><h2>${esc(site.videos.titulo || 'Vídeos')}</h2>${site.videos.subtitulo ? `<p class="small" style="margin:6px 0 0">${esc(site.videos.subtitulo)}</p>` : ''}</div></div>
    <div class="videos">${it.map((v) => `<figure class="video"><div class="video-frame"><iframe src="${esc(v.embed)}" title="${esc(v.titulo || 'Vídeo')}" loading="lazy" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>${v.titulo ? `<figcaption>${esc(v.titulo)}</figcaption>` : ''}</figure>`).join('')}</div></section>`;
}

const preco = (v) => (v.preco_venda > 0 ? brl(v.preco_venda) : 'Consulte condições');
const titulo = (v) => [v.marca, v.modelo, v.versao].filter(Boolean).join(' ');
const ano = (v) => (v.ano_fab || v.ano_mod ? `${v.ano_fab || '–'}/${v.ano_mod || '–'}` : 'A confirmar');
const waLink = (msg) => {
  const n = String(empresa.whatsapp || empresa.telefone || '').replace(/\D/g, '');
  return n ? `https://wa.me/${n.length <= 11 ? '55' + n : n}?text=${encodeURIComponent(msg)}` : null;
};
const meta = (v) => [ano(v), v.categoria === 'bike' ? (v.autonomia ? 'autonomia ' + v.autonomia : null) : v.km != null ? num(v.km) + ' km' : null, v.categoria === 'carro' ? v.cambio : v.categoria === 'moto' ? v.motor : v.bateria].filter(Boolean).join(' · ');
const isNovo = (v) => v.data_entrada && (Date.now() - new Date(v.data_entrada + 'T00:00:00')) / 864e5 <= 15;

function card(v) {
  const f = v.fotos[0];
  return `<a class="vcard" href="#/veiculo/${v.id}">
    <span class="photo ${f ? '' : 'noimg'}" style="${f ? `background-image:url('${f}')` : ''}">${v.status === 'reservado' ? '<span class="badge">Reservado</span>' : isNovo(v) ? '<span class="badge">Novo no estoque</span>' : v.destaque ? '<span class="badge">Destaque</span>' : ''}</span>
    <span class="vcard-body"><span class="eyebrow">${esc(CAT[v.categoria].toUpperCase())}</span><span class="vcard-title">${esc(titulo(v))}</span>
    <span class="vcard-meta">${esc(meta(v))}</span><span class="vcard-price">${preco(v)}</span></span></a>`;
}

function lista() {
  let l = veiculos.filter((v) => (!st.cat || v.categoria === st.cat) && (!st.q || `${titulo(v)} ${v.ano_mod} ${v.cor}`.toLowerCase().includes(st.q.toLowerCase())));
  if (st.ordem === 'menor') l = [...l].sort((a, b) => (a.preco_venda || 1e12) - (b.preco_venda || 1e12));
  if (st.ordem === 'maior') l = [...l].sort((a, b) => (b.preco_venda || 0) - (a.preco_venda || 0));
  if (st.ordem === 'km') l = [...l].sort((a, b) => (a.km ?? 1e9) - (b.km ?? 1e9));
  const box = document.getElementById('cards');
  box.innerHTML = l.length ? l.map(card).join('') : '';
  document.getElementById('vazio').hidden = !!l.length;
  document.getElementById('qtd').textContent = `${l.length} ${l.length === 1 ? 'veículo' : 'veículos'}`;
}

function home() {
  document.title = 'M2 Seminovos · Carros, motos e bikes elétricas seminovos';
  const cnt = (c) => veiculos.filter((v) => v.categoria === c).length;
  const h = site.destaque;
  const secs = { promocoes: secPromocoes(), videos: secVideos(), estoque: '<!--estoque-->' };
  const ordem = (site.secoes || ['promocoes', 'videos', 'estoque']).map((s) => secs[s] || '').join('');
  const [antes, depois] = ordem.split('<!--estoque-->');
  view.innerHTML = `<section class="hero"><div class="wrap hero-grid"><div>
      ${h.eyebrow ? `<p class="eyebrow">${esc(h.eyebrow)}</p>` : ''}<h1>${esc(h.titulo)}</h1>
      ${h.subtitulo ? `<p class="lead">${esc(h.subtitulo)}</p>` : ''}
      <div class="hero-actions">${botao(h.botao1_texto, h.botao1_acao, h.botao1_url, 'btn')}${botao(h.botao2_texto, h.botao2_acao, h.botao2_url, 'btn outline')}</div>
      ${h.mostrar_contadores ? `<div class="facts"><div><strong>${cnt('carro')}</strong><span>carros</span></div><div><strong>${cnt('moto')}</strong><span>motos</span></div><div><strong>${cnt('bike')}</strong><span>bikes elétricas</span></div></div>` : ''}
    </div>${h.imagem ? `<div class="hero-art hero-foto" style="background-image:url('${cssUrl(h.imagem)}')" role="img" aria-label="${esc(h.titulo)}"></div>` : '<div class="hero-art" aria-hidden="true"><img src="/assets/m2-logo.svg" alt=""></div>'}</div></section>
  ${antes || ''}
  <section class="wrap" id="estoque"><div class="sec-h"><div><p class="eyebrow">ESTOQUE</p><h2>${esc(site.estoque.titulo || 'Veículos disponíveis')}</h2></div><span class="small" id="qtd"></span></div>
    <div class="toolbar" style="margin-bottom:20px">
      <div class="chips" role="group" aria-label="Categoria">${[['', 'Todos'], ...Object.entries(CATP)].map(([k, l]) => `<button type="button" class="chip" data-chip="${k}" aria-pressed="${st.cat === k}">${l}</button>`).join('')}</div>
      <input type="search" id="busca" placeholder="Buscar marca ou modelo" value="${esc(st.q)}" aria-label="Buscar marca ou modelo">
      <select id="ordem" aria-label="Ordenar"><option value="recentes">Mais recentes</option><option value="menor">Menor preço</option><option value="maior">Maior preço</option><option value="km">Menor quilometragem</option></select>
    </div>
    <div class="cards" id="cards"></div>
    <div class="empty-s" id="vazio" hidden>Nenhum veículo encontrado com esses filtros. <button class="linkbtn" type="button" data-open="contato" style="background:none;border:0;text-decoration:underline;font-weight:600">Conte o que você procura</button> e avisamos quando chegar.</div>
  </section>
  ${depois || ''}`;
  document.getElementById('ordem').value = st.ordem;
  view.querySelectorAll('[data-chip]').forEach((b) => (b.onclick = () => { st.cat = b.dataset.chip; view.querySelectorAll('[data-chip]').forEach((x) => x.setAttribute('aria-pressed', x === b)); lista(); }));
  document.getElementById('busca').oninput = (e) => { st.q = e.target.value; lista(); };
  document.getElementById('ordem').onchange = (e) => { st.ordem = e.target.value; lista(); };
  lista();
}

async function detalhe(id) {
  let v = veiculos.find((x) => String(x.id) === id);
  if (!v) {
    const r = await fetch('/api/public/veiculos/' + id);
    if (!r.ok) { view.innerHTML = `<div class="wrap"><nav class="crumb"><button type="button" data-go="estoque">Estoque</button><span>/</span><strong>Indisponível</strong></nav><div class="empty-s">Este veículo não está mais disponível. <a href="#/" style="text-decoration:underline">Ver o estoque</a></div></div>`; return; }
    v = await r.json();
  }
  document.title = `${titulo(v)} · M2 Seminovos`;
  const fotos = v.fotos.length ? v.fotos : [null];
  let atual = 0;
  const specs = [['Ano', ano(v)], ...(v.categoria === 'bike' ? [['Autonomia', v.autonomia], ['Bateria / motor', v.bateria]] : [['Quilometragem', v.km != null ? num(v.km) + ' km' : null], ['Combustível', v.combustivel]]),
    ...(v.categoria === 'carro' ? [['Câmbio', v.cambio], ['Portas', v.portas]] : []), ...(v.categoria === 'moto' ? [['Motor', v.motor]] : []), ['Cor', v.cor], ['Categoria', CAT[v.categoria]]].slice(0, 6);
  while (specs.length < 6) specs.push(['Disponibilidade', 'Sob consulta']);
  const wa = waLink(`Olá! Tenho interesse no ${titulo(v)} ${v.ano_mod || ''} que vi no site da M2 Seminovos.`);
  view.innerHTML = `<div class="wrap"><nav class="crumb" aria-label="Caminho"><button type="button" data-go="estoque">Estoque</button><span>/</span><button type="button" data-cat="${v.categoria}">${CATP[v.categoria]}</button><span>/</span><strong>${esc(titulo(v))}</strong></nav>
    <div class="layout"><div class="gallery">
      <button class="main-photo ${fotos[0] ? '' : 'noimg'}" type="button" id="mp" aria-label="Ampliar foto"></button>
      ${fotos.length > 1 ? `<div class="thumbs">${fotos.slice(0, 8).map((f, i) => `<button class="thumb" type="button" data-i="${i}" aria-label="Foto ${i + 1}" style="background-image:url('${f}')"></button>`).join('')}</div>` : ''}
    </div>
    <aside class="summary"><p class="eyebrow">${esc(CAT[v.categoria].toUpperCase())}${v.status === 'reservado' ? ' · RESERVADO' : ''}</p><h1>${esc(titulo(v))}</h1>
      <p class="demo">${esc(meta(v))}</p><p class="price">${preco(v)}</p>
      <p class="lead">${esc(v.descricao || 'Fale com a equipe para conhecer este veículo, agendar uma visita ou simular as condições de pagamento.')}</p>
      <div class="actions"><button class="btn full" type="button" id="interesse">Tenho interesse</button>
        ${wa ? `<a class="btn black full" href="${wa}" target="_blank" rel="noopener">Chamar no WhatsApp</a>` : ''}
        <button class="btn outline full" type="button" data-open="vender">Tenho um veículo para a troca</button></div>
      <p class="small">Disponibilidade e condições sob consulta.</p></aside></div>
    <section class="info"><h2>Informações do veículo</h2><dl class="specs">${specs.map(([k, x]) => `<div><dt>${esc(k)}</dt><dd>${esc(x || 'A confirmar')}</dd></div>`).join('')}</dl></section>
    ${v.opcionais ? `<section class="story"><h2>Opcionais</h2><p>${esc(v.opcionais)}</p></section>` : ''}
    </div>`;
  const mp = document.getElementById('mp');
  const show = (i) => {
    atual = i;
    if (fotos[i]) mp.style.backgroundImage = `url('${fotos[i]}')`;
    view.querySelectorAll('.thumb').forEach((t) => t.setAttribute('aria-current', String(Number(t.dataset.i) === i)));
  };
  show(0);
  view.querySelectorAll('.thumb').forEach((t) => (t.onclick = () => show(Number(t.dataset.i))));
  mp.onclick = () => { if (fotos[0]) lightbox(fotos, atual); };
  document.getElementById('interesse').onclick = () => abrirContato(v);
}

function lightbox(fotos, i) {
  const d = document.getElementById('dlg-foto');
  const img = document.getElementById('lb-img');
  const set = (k) => { i = (k + fotos.length) % fotos.length; img.src = fotos[i]; document.getElementById('lb-count').textContent = `${i + 1} de ${fotos.length}`; };
  document.getElementById('lb-prev').onclick = () => set(i - 1);
  document.getElementById('lb-next').onclick = () => set(i + 1);
  d.querySelector('.close-lb').onclick = () => d.close();
  set(i); d.showModal();
}

function abrirContato(v) {
  const d = document.getElementById('dlg-contato');
  const f = d.querySelector('form');
  f.reset(); f.querySelector('.status').textContent = '';
  f.veiculo_id.value = v ? v.id : '';
  document.getElementById('dc-t').textContent = v ? 'Tenho interesse' : 'Fale com a M2';
  document.getElementById('dc-sub').textContent = v ? `${titulo(v)} · ${preco(v)}. Deixe seu contato e retornamos rapidinho.` : 'Deixe seu contato e a nossa equipe retorna rapidinho.';
  f.mensagem.value = v ? `Olá! Tenho interesse no ${titulo(v)} ${v.ano_mod || ''}.` : '';
  const wa = waLink(v ? `Olá! Tenho interesse no ${titulo(v)} que vi no site.` : 'Olá! Vim pelo site da M2 Seminovos.');
  f.querySelector('.wa-alt').hidden = !wa;
  if (wa) f.querySelector('.wa-link').href = wa;
  d.showModal();
}

// envio de leads
document.querySelectorAll('form[data-lead]').forEach((f) => (f.onsubmit = async (e) => {
  e.preventDefault();
  const s = f.querySelector('.status');
  const data = Object.fromEntries(new FormData(f));
  data.tipo = f.dataset.lead;
  if (data.veiculo) { data.mensagem = `Veículo: ${data.veiculo}\n${data.mensagem || ''}`; delete data.veiculo; }
  if (!data.nome || !data.telefone) { s.textContent = 'Informe seu nome e telefone.'; return; }
  const btn = f.querySelector('[type=submit]'); btn.disabled = true;
  try {
    const r = await fetch('/api/public/leads', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error);
    s.textContent = 'Recebemos seu contato. Em breve a equipe da M2 fala com você.';
    f.reset();
  } catch (err) { s.textContent = err.message || 'Não foi possível enviar agora. Tente pelo WhatsApp.'; }
  btn.disabled = false;
}));

// navegação
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-go],[data-cat],[data-open]');
  if (!t) return;
  document.getElementById('links').classList.remove('open');
  if (t.dataset.open === 'contato') return abrirContato(null);
  if (t.dataset.open === 'vender') { const d = document.getElementById('dlg-vender'); d.querySelector('.status').textContent = ''; return d.showModal(); }
  if (t.dataset.cat !== undefined && t.dataset.cat !== null && t.hasAttribute('data-cat')) st.cat = t.dataset.cat;
  const alvo = t.dataset.go || 'estoque';
  const ir = () => document.getElementById(alvo)?.scrollIntoView({ behavior: 'smooth' });
  if (location.hash.startsWith('#/veiculo')) { location.hash = '#/'; setTimeout(ir, 60); } else { if (t.hasAttribute('data-cat')) home(); ir(); }
});
document.querySelectorAll('dialog .close').forEach((b) => (b.onclick = () => b.closest('dialog').close()));
const mt = document.getElementById('mt');
mt.onclick = () => { const l = document.getElementById('links'); l.classList.toggle('open'); mt.setAttribute('aria-expanded', l.classList.contains('open')); };

// aplica aviso, cabeçalho, rodapé e pop-up configurados no sistema
function aplicarSite() {
  const a = site.aviso || {};
  const bar = document.getElementById('aviso');
  if (a.ativo && a.texto) {
    const cls = `aviso-bar aviso-${['dourado', 'preto', 'vermelho', 'verde'].includes(a.cor) ? a.cor : 'dourado'}`;
    bar.className = cls;
    const link = botao(a.texto, a.acao === 'nenhum' ? '' : a.acao, a.url, 'aviso-link');
    bar.innerHTML = `<div class="wrap">${link || `<span>${esc(a.texto)}</span>`}</div>`;
    bar.hidden = false;
  }
  const c = site.cabecalho || {};
  if (c.logo) document.getElementById('logo-topo').src = c.logo;
  if (c.botao_texto) document.getElementById('btn-topo').textContent = c.botao_texto;
  const r = site.rodape || {};
  if (r.banner_titulo) document.getElementById('banner-tit').textContent = r.banner_titulo;
  if (r.aviso_legal) document.getElementById('aviso-legal').textContent = r.aviso_legal;
  popup();
}

function popup() {
  const p = site.popup || {};
  const forcar = new URLSearchParams(location.search).has('popup');
  if (!p.ativo && !forcar) return;
  if (!p.titulo && !p.texto && !p.imagem) return;
  // a "assinatura" muda quando o conteúdo muda: um pop-up novo volta a aparecer
  const chave = 'm2-popup-' + Array.from(JSON.stringify([p.titulo, p.texto, p.imagem])).reduce((h, ch) => ((h * 31 + ch.charCodeAt(0)) | 0), 7);
  const hojeStr = new Date().toISOString().slice(0, 10);
  if (!forcar) {
    try {
      if (p.frequencia === 'sessao' && sessionStorage.getItem(chave)) return;
      if (p.frequencia === 'dia' && localStorage.getItem(chave) === hojeStr) return;
    } catch (e) { /* navegador sem armazenamento: mostra normalmente */ }
  }
  const d = document.getElementById('dlg-popup');
  document.getElementById('pp-t').textContent = p.titulo || '';
  document.getElementById('pp-body').innerHTML = `${p.imagem ? `<img class="popup-img" src="${esc(p.imagem)}" alt="">` : ''}${p.texto ? `<p style="white-space:pre-line">${esc(p.texto)}</p>` : ''}
    ${botao(p.botao_texto, p.acao, p.url, 'btn full', `Olá! Vi a oferta "${p.titulo || ''}" no site da M2 Seminovos.`)}`;
  // fecha o pop-up antes de abrir outro diálogo (contato, vender) ou seguir um link
  d.querySelectorAll('#pp-body [data-open],#pp-body [data-go],#pp-body a').forEach((el) => el.addEventListener('click', () => d.close()));
  setTimeout(() => {
    if (document.querySelector('dialog[open]')) return; // não atrapalha quem já abriu outro formulário
    d.showModal();
    try { sessionStorage.setItem(chave, '1'); localStorage.setItem(chave, hojeStr); } catch (e) { /* ignora */ }
  }, forcar ? 300 : Math.max(0, Number(p.atraso) || 0) * 1000);
}

// botão flutuante do WhatsApp (número em Configurações → WhatsApp da loja)
const WA_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.64.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.61-.92-2.21-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.08c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.63.71.23 1.36.2 1.87.12.57-.09 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35zM12.05 21.5h-.01a9.4 9.4 0 0 1-4.8-1.31l-.34-.2-3.57.93.95-3.48-.22-.36a9.42 9.42 0 0 1-1.44-5.02c0-5.2 4.24-9.44 9.44-9.44 2.52 0 4.89.98 6.67 2.77a9.37 9.37 0 0 1 2.76 6.68c0 5.2-4.24 9.43-9.44 9.43zm8.03-17.46A11.27 11.27 0 0 0 12.05.72C5.79.72.7 5.8.7 12.07c0 2 .52 3.95 1.52 5.67L.6 23.28l5.68-1.49a11.33 11.33 0 0 0 5.77 1.47h.01c6.26 0 11.35-5.09 11.35-11.35 0-3.03-1.18-5.88-3.33-8.02z"/></svg>';
function botaoWhatsapp() {
  const w = waLink(`Olá! Vim pelo site da ${empresa.nome || 'M2 Seminovos'} e gostaria de mais informações.`);
  if (!w || document.querySelector('.wa-float')) return;
  const a = document.createElement('a');
  a.className = 'wa-float'; a.href = w; a.target = '_blank'; a.rel = 'noopener';
  a.setAttribute('aria-label', 'Falar com a loja no WhatsApp'); a.title = 'Falar no WhatsApp';
  a.innerHTML = WA_ICON;
  document.body.appendChild(a);
}

function route() {
  const m = location.hash.match(/^#\/veiculo\/(\d+)/);
  if (m) detalhe(m[1]); else home();
  if (m) window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);

(async () => {
  try {
    [veiculos, empresa] = await Promise.all([fetch('/api/public/veiculos').then((r) => r.json()), fetch('/api/public/empresa').then((r) => r.json())]);
  } catch (e) { veiculos = []; }
  try { const r = await fetch('/api/public/site'); if (r.ok) site = { ...site, ...(await r.json()) }; } catch (e) { /* usa o padrão */ }
  aplicarSite();
  document.getElementById('sobre-txt').textContent = (site.rodape && site.rodape.banner_texto) || empresa.sobre || '';
  document.getElementById('foot-info').innerHTML = [empresa.endereco && `${esc(empresa.endereco)}${empresa.cidade ? ' – ' + esc(empresa.cidade) + (empresa.uf ? '/' + esc(empresa.uf) : '') : ''}`, [empresa.telefone, empresa.email].filter(Boolean).map(esc).join(' · '), esc(empresa.horario || '')].filter(Boolean).join('<br>');
  botaoWhatsapp();
  route();
})();
