// Site público M2 Seminovos
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const brl = (v) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const num = (v) => Number(v).toLocaleString('pt-BR');
const CAT = { carro: 'Carro', moto: 'Moto', bike: 'Bike elétrica' };
const CATP = { carro: 'Carros', moto: 'Motos', bike: 'Bikes elétricas' };
const view = document.getElementById('view');
const st = { cat: '', q: '', ordem: 'recentes' };
let veiculos = [], empresa = {};

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
  view.innerHTML = `<section class="hero"><div class="wrap hero-grid"><div>
      <p class="eyebrow">M2 SEMINOVOS</p><h1>Seu próximo carro. Uma nova conquista.</h1>
      <p class="lead">Carros, motos e bikes elétricas seminovos, com atendimento próximo, claro e confiável. Escolha o seu e fale com a gente.</p>
      <div class="hero-actions"><button class="btn" type="button" data-go="estoque">Ver estoque</button><button class="btn outline" type="button" data-open="vender">Venda seu veículo</button></div>
      <div class="facts"><div><strong>${cnt('carro')}</strong><span>carros</span></div><div><strong>${cnt('moto')}</strong><span>motos</span></div><div><strong>${cnt('bike')}</strong><span>bikes elétricas</span></div></div>
    </div><div class="hero-art" aria-hidden="true"><img src="/assets/m2-logo.svg" alt=""></div></div></section>
  <section class="wrap" id="estoque"><div class="sec-h"><div><p class="eyebrow">ESTOQUE</p><h2>Veículos disponíveis</h2></div><span class="small" id="qtd"></span></div>
    <div class="toolbar" style="margin-bottom:20px">
      <div class="chips" role="group" aria-label="Categoria">${[['', 'Todos'], ...Object.entries(CATP)].map(([k, l]) => `<button type="button" class="chip" data-chip="${k}" aria-pressed="${st.cat === k}">${l}</button>`).join('')}</div>
      <input type="search" id="busca" placeholder="Buscar marca ou modelo" value="${esc(st.q)}" aria-label="Buscar marca ou modelo">
      <select id="ordem" aria-label="Ordenar"><option value="recentes">Mais recentes</option><option value="menor">Menor preço</option><option value="maior">Maior preço</option><option value="km">Menor quilometragem</option></select>
    </div>
    <div class="cards" id="cards"></div>
    <div class="empty-s" id="vazio" hidden>Nenhum veículo encontrado com esses filtros. <button class="linkbtn" type="button" data-open="contato" style="background:none;border:0;text-decoration:underline;font-weight:600">Conte o que você procura</button> e avisamos quando chegar.</div>
  </section>`;
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
  document.getElementById('sobre-txt').textContent = empresa.sobre || '';
  document.getElementById('foot-info').innerHTML = [empresa.endereco && `${esc(empresa.endereco)}${empresa.cidade ? ' – ' + esc(empresa.cidade) + (empresa.uf ? '/' + esc(empresa.uf) : '') : ''}`, [empresa.telefone, empresa.email].filter(Boolean).map(esc).join(' · '), esc(empresa.horario || '')].filter(Boolean).join('<br>');
  route();
})();
