// Editor do site público: o usuário altera textos, imagens, promoções, vídeos, pop-up e ordem das seções
// sem mexer em código. Os dados são salvos em /api/site e lidos pelo site em /api/public/site.
import { get, put, api, esc, toast, fail, icon, confirmDlg } from '../core.js';
import { setCrumbs } from '../main.js';

const ACOES = {
  estoque: 'Ir para o estoque', contato: 'Abrir "Fale com a M2"', vender: 'Abrir "Venda seu veículo"',
  whatsapp: 'Chamar no WhatsApp', link: 'Abrir um link (endereço)', nenhum: 'Nada (sem botão)',
};
const CORES = { dourado: 'Dourado', preto: 'Preto', vermelho: 'Vermelho (urgente)', verde: 'Verde' };
const FREQ = { sessao: 'Uma vez por visita', dia: 'Uma vez por dia', sempre: 'Toda vez que abrir o site' };
const SECAO_NOME = { promocoes: 'Promoções', videos: 'Vídeos', estoque: 'Estoque (veículos à venda)' };

let st = null, padrao = null, dirty = false, root = null;

const getP = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
const setP = (o, p, v) => { const ks = p.split('.'); const last = ks.pop(); ks.reduce((a, k) => a[k], o)[last] = v; };
const marca = (on = true) => {
  dirty = on;
  const b = root && root.querySelector('[data-dirty]');
  if (b) b.hidden = !on;
};
window.addEventListener('beforeunload', (e) => { if (dirty && location.hash.startsWith('#/site')) { e.preventDefault(); e.returnValue = ''; } });

// ---------- campos ----------
const val = (p) => esc(getP(st, p) ?? '');
const inp = (label, p, { type = 'text', cls = 'c6', hint = '', attrs = '' } = {}) =>
  `<label class="${cls}">${esc(label)}<input type="${type}" data-k="${p}" value="${val(p)}" ${attrs}>${hint ? `<span class="hint">${hint}</span>` : ''}</label>`;
const area = (label, p, { cls = 'c12', rows = 3, hint = '', attrs = '' } = {}) =>
  `<label class="${cls}">${esc(label)}<textarea data-k="${p}" rows="${rows}" ${attrs}>${val(p)}</textarea>${hint ? `<span class="hint">${hint}</span>` : ''}</label>`;
const sel = (label, p, opts, { cls = 'c3', hint = '' } = {}) =>
  `<label class="${cls}">${esc(label)}<select data-k="${p}">${Object.entries(opts).map(([k, l]) => `<option value="${k}" ${String(getP(st, p)) === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>${hint ? `<span class="hint">${hint}</span>` : ''}</label>`;
const chk = (label, p, { cls = 'c12' } = {}) =>
  `<label class="check ${cls}" style="margin-top:4px"><input type="checkbox" data-k="${p}" ${getP(st, p) ? 'checked' : ''}> ${esc(label)}</label>`;
// "o que o botão faz" + link (o link só aparece quando a ação é "Abrir um link")
const acao = (label, pAcao, pUrl, { semNada = false } = {}) => {
  const opts = { ...ACOES }; if (semNada) delete opts.nenhum;
  return `${sel(label, pAcao, opts, { cls: 'c3' })}
  <label class="c6" data-url-for="${pAcao}" ${getP(st, pAcao) === 'link' ? '' : 'hidden'}>Endereço do link<input data-k="${pUrl}" value="${val(pUrl)}" placeholder="https://..."><span class="hint">Ex.: https://www.instagram.com/m2seminovos</span></label>`;
};
const imgBox = (label, p, hint) => {
  const u = getP(st, p);
  return `<div class="c6"><span style="display:block;font-weight:600;font-size:14px;margin:14px 0 6px">${esc(label)}</span>
    <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
      <div style="width:132px;height:84px;border-radius:10px;border:1px dashed var(--line);background:${u ? `#fff url('${esc(u)}') center/cover no-repeat` : 'var(--bg)'};display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:12px">${u ? '' : 'Sem imagem'}</div>
      <div style="display:flex;flex-direction:column;gap:6px">
        <label class="btn sm ghost" style="margin:0;cursor:pointer">${icon('plus')}${u ? 'Trocar imagem' : 'Enviar imagem'}<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden data-img="${p}"></label>
        ${u ? `<button type="button" class="btn sm ghost" data-img-rm="${p}">Remover</button>` : ''}
      </div></div>${hint ? `<span class="hint">${hint}</span>` : ''}</div>`;
};
const listaBtns = (lista, i, n) => `<div style="display:flex;gap:6px;flex-wrap:wrap">
  <button type="button" class="btn sm ghost" data-act="up" data-list="${lista}" data-i="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Mover para cima">↑</button>
  <button type="button" class="btn sm ghost" data-act="down" data-list="${lista}" data-i="${i}" ${i === n - 1 ? 'disabled' : ''} aria-label="Mover para baixo">↓</button>
  <button type="button" class="btn sm danger" data-act="rm" data-list="${lista}" data-i="${i}">Remover</button></div>`;
const card = (id, titulo, desc, corpo, extra = '') => `<section class="card" id="sec-${id}"><div class="card-h"><div><h2>${esc(titulo)}</h2>${desc ? `<p class="muted" style="margin:4px 0 0;font-size:13.5px">${desc}</p>` : ''}</div>${extra}</div><div class="form-grid">${corpo}</div></section>`;
const hojeISO = () => new Date().toISOString().slice(0, 10);
const status = (i) => {
  if (!i.ativo) return '<span class="pill">Desligada</span>';
  const h = hojeISO();
  if (i.fim && i.fim < h) return '<span class="pill bad">Vencida</span>';
  if (i.inicio && i.inicio > h) return '<span class="pill info">Agendada</span>';
  return '<span class="pill ok">No ar</span>';
};

// ---------- seções do editor ----------
function html() {
  const promo = st.promocoes.itens;
  const vids = st.videos.itens;
  return `<div class="ph"><div><p class="eyebrow">ADMINISTRAÇÃO</p><h1>Editar site</h1><p>Altere textos, imagens, promoções, vídeos e o pop-up do site sem mexer em código. Depois clique em <strong>Salvar alterações</strong>.</p></div>
    <div class="acts"><a class="btn ghost" href="/" target="_blank" rel="noopener">${icon('link')}Ver site</a><button class="btn" type="button" data-save>Salvar alterações</button></div></div>
  <nav class="tabs" aria-label="Partes do site" style="position:sticky;top:0;background:var(--bg);z-index:5">
    ${[['aviso', 'Barra de aviso'], ['cabecalho', 'Cabeçalho'], ['destaque', 'Destaque principal'], ['promocoes', `Promoções (${promo.length})`], ['videos', `Vídeos (${vids.length})`], ['popup', 'Pop-up'], ['ordem', 'Ordem das seções'], ['rodape', 'Rodapé']]
      .map(([k, l]) => `<button type="button" data-go="${k}">${esc(l)}</button>`).join('')}
  </nav>
  <div class="stack">
  ${card('aviso', 'Barra de aviso no topo', 'Uma faixa fina acima do menu, para recados rápidos: "Feirão neste sábado!", "Aceitamos sua moto na troca".',
    `${chk('Mostrar a barra de aviso', 'aviso.ativo')}
     ${inp('Texto do aviso', 'aviso.texto', { cls: 'c8', attrs: 'maxlength="200" placeholder="Ex.: Feirão de seminovos neste sábado, das 8h às 17h!"' })}
     ${sel('Cor da faixa', 'aviso.cor', CORES, { cls: 'c4' })}
     ${acao('Ao clicar no aviso', 'aviso.acao', 'aviso.url')}`)}

  ${card('cabecalho', 'Cabeçalho (menu do topo)', 'A logo e o botão que ficam fixos no topo de todas as páginas.',
    `${imgBox('Logo do cabeçalho', 'cabecalho.logo', 'Deixe sem imagem para usar a logo padrão da M2. Prefira PNG com fundo transparente.')}
     ${inp('Texto do botão do topo', 'cabecalho.botao_texto', { cls: 'c6', attrs: 'maxlength="40"', hint: 'O botão abre o formulário de contato.' })}`)}

  ${card('destaque', 'Destaque principal (primeira tela)', 'O título grande, o texto e os botões que o cliente vê assim que abre o site.',
    `${inp('Texto pequeno acima do título', 'destaque.eyebrow', { cls: 'c4', attrs: 'maxlength="60"' })}
     ${inp('Título', 'destaque.titulo', { cls: 'c8', attrs: 'maxlength="140"' })}
     ${area('Texto abaixo do título', 'destaque.subtitulo', { rows: 2, attrs: 'maxlength="400"' })}
     ${imgBox('Imagem ao lado do título', 'destaque.imagem', 'Opcional. Uma foto da loja ou de um carro (paisagem, 1200×900). Sem imagem, aparece a logo.')}
     ${chk('Mostrar a quantidade de carros, motos e bikes', 'destaque.mostrar_contadores', { cls: 'c6' })}
     <p class="form-sec">Botão 1 (dourado)</p>
     ${inp('Texto do botão', 'destaque.botao1_texto', { cls: 'c3', attrs: 'maxlength="40"', hint: 'Deixe vazio para esconder.' })}${acao('O que o botão faz', 'destaque.botao1_acao', 'destaque.botao1_url', { semNada: true })}
     <p class="form-sec">Botão 2 (contorno)</p>
     ${inp('Texto do botão', 'destaque.botao2_texto', { cls: 'c3', attrs: 'maxlength="40"', hint: 'Deixe vazio para esconder.' })}${acao('O que o botão faz', 'destaque.botao2_acao', 'destaque.botao2_url', { semNada: true })}`)}

  ${card('promocoes', 'Promoções', 'Cartões de oferta na página inicial. Cada promoção pode ter imagem, selo (ex.: "Taxa 0%") e data para sair do ar sozinha.',
    `${chk('Mostrar a seção de promoções no site', 'promocoes.ativo')}
     ${inp('Título da seção', 'promocoes.titulo', { cls: 'c4', attrs: 'maxlength="80"' })}${inp('Subtítulo (opcional)', 'promocoes.subtitulo', { cls: 'c8', attrs: 'maxlength="200"' })}
     <div class="c12 stack" style="margin-top:14px">${promo.length ? promo.map((p, i) => `<div style="border:1px solid var(--line-card);border-radius:12px;padding:14px 16px;background:var(--bg)">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap"><strong>${esc(p.titulo || `Promoção ${i + 1}`)} ${status(p)}</strong>${listaBtns('promocoes.itens', i, promo.length)}</div>
        <div class="form-grid">
          ${chk('Promoção ligada', `promocoes.itens.${i}.ativo`)}
          ${inp('Título', `promocoes.itens.${i}.titulo`, { cls: 'c6', attrs: 'maxlength="100" placeholder="Ex.: Feirão de motos"' })}
          ${inp('Selo (opcional)', `promocoes.itens.${i}.selo`, { cls: 'c3', attrs: 'maxlength="30" placeholder="Ex.: Taxa 0%"' })}
          ${inp('Texto do botão', `promocoes.itens.${i}.botao_texto`, { cls: 'c3', attrs: 'maxlength="40" placeholder="Quero aproveitar"' })}
          ${area('Descrição', `promocoes.itens.${i}.texto`, { rows: 2, attrs: 'maxlength="500"' })}
          ${imgBox('Imagem da promoção', `promocoes.itens.${i}.imagem`, 'Paisagem, por exemplo 1200×800.')}
          ${inp('Começa em (opcional)', `promocoes.itens.${i}.inicio`, { type: 'date', cls: 'c3' })}${inp('Termina em (opcional)', `promocoes.itens.${i}.fim`, { type: 'date', cls: 'c3', hint: 'Depois dessa data a promoção sai do site sozinha.' })}
          ${acao('O que o botão faz', `promocoes.itens.${i}.acao`, `promocoes.itens.${i}.url`)}
        </div></div>`).join('') : '<div class="empty" style="padding:20px">Nenhuma promoção cadastrada.</div>'}
       <div><button type="button" class="btn ghost" data-act="add" data-list="promocoes.itens">${icon('plus')}Adicionar promoção</button></div></div>`)}

  ${card('videos', 'Vídeos', 'Cole o link de um vídeo do YouTube (inclusive Shorts) ou do Vimeo. O vídeo aparece no site pronto para tocar.',
    `${chk('Mostrar a seção de vídeos no site', 'videos.ativo')}
     ${inp('Título da seção', 'videos.titulo', { cls: 'c4', attrs: 'maxlength="80"' })}${inp('Subtítulo (opcional)', 'videos.subtitulo', { cls: 'c8', attrs: 'maxlength="200"' })}
     <div class="c12 stack" style="margin-top:14px">${vids.length ? vids.map((v, i) => `<div style="border:1px solid var(--line-card);border-radius:12px;padding:14px 16px;background:var(--bg)">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap"><strong>${esc(v.titulo || `Vídeo ${i + 1}`)} ${v.ativo ? '<span class="pill ok">No ar</span>' : '<span class="pill">Desligado</span>'}</strong>${listaBtns('videos.itens', i, vids.length)}</div>
        <div class="form-grid">
          ${chk('Vídeo ligado', `videos.itens.${i}.ativo`)}
          ${inp('Título (opcional)', `videos.itens.${i}.titulo`, { cls: 'c4', attrs: 'maxlength="100" placeholder="Ex.: Conheça a loja"' })}
          ${inp('Link do vídeo', `videos.itens.${i}.url`, { cls: 'c8', attrs: 'placeholder="https://www.youtube.com/watch?v=..."' })}
          <p class="hint c12" data-vid-check="${i}"></p>
        </div></div>`).join('') : '<div class="empty" style="padding:20px">Nenhum vídeo cadastrado.</div>'}
       <div><button type="button" class="btn ghost" data-act="add" data-list="videos.itens">${icon('plus')}Adicionar vídeo</button></div></div>`)}

  ${card('popup', 'Pop-up (janela que abre sozinha)', 'Uma janela que aparece alguns segundos depois que o cliente entra no site. Use para uma oferta especial ou um evento.',
    `${chk('Mostrar o pop-up', 'popup.ativo')}
     ${inp('Título', 'popup.titulo', { cls: 'c6', attrs: 'maxlength="100" placeholder="Ex.: Feirão neste sábado!"' })}
     ${inp('Texto do botão', 'popup.botao_texto', { cls: 'c3', attrs: 'maxlength="40"' })}
     ${area('Texto', 'popup.texto', { rows: 3, attrs: 'maxlength="600"' })}
     ${imgBox('Imagem (opcional)', 'popup.imagem', 'Pode ser a arte pronta da promoção.')}
     ${acao('O que o botão faz', 'popup.acao', 'popup.url')}
     ${sel('Quando mostrar', 'popup.frequencia', FREQ, { cls: 'c3' })}
     ${inp('Esperar (segundos)', 'popup.atraso', { type: 'number', cls: 'c3', attrs: 'min="0" max="60"', hint: 'Tempo depois que a página abre.' })}
     ${inp('Começa em (opcional)', 'popup.inicio', { type: 'date', cls: 'c3' })}${inp('Termina em (opcional)', 'popup.fim', { type: 'date', cls: 'c3' })}
     <p class="hint c12">Para ver o pop-up agora, salve e abra <a class="linkbtn" href="/?popup=1" target="_blank" rel="noopener">o site com o pop-up forçado</a>.</p>`)}

  ${card('ordem', 'Ordem das seções da página inicial', 'Escolha o que aparece primeiro logo abaixo do destaque principal.',
    `<div class="c12 stack" style="gap:8px">${st.secoes.map((s, i) => `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;border:1px solid var(--line-card);border-radius:10px;padding:10px 14px">
      <span><strong>${i + 1}.</strong> ${esc(SECAO_NOME[s])}</span>
      <span style="display:flex;gap:6px"><button type="button" class="btn sm ghost" data-act="up" data-list="secoes" data-i="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Subir">↑</button><button type="button" class="btn sm ghost" data-act="down" data-list="secoes" data-i="${i}" ${i === st.secoes.length - 1 ? 'disabled' : ''} aria-label="Descer">↓</button></span></div>`).join('')}</div>
     ${inp('Título da seção do estoque', 'estoque.titulo', { cls: 'c6', attrs: 'maxlength="80"' })}`)}

  ${card('rodape', 'Rodapé', 'A faixa preta no fim da página e o aviso legal.',
    `${inp('Título da faixa preta', 'rodape.banner_titulo', { cls: 'c12', attrs: 'maxlength="140"' })}
     ${area('Texto da faixa preta', 'rodape.banner_texto', { rows: 2, attrs: 'maxlength="400"', hint: 'Deixe vazio para usar o texto "Sobre a loja" das Configurações.' })}
     ${area('Aviso legal (letras pequenas)', 'rodape.aviso_legal', { rows: 2, attrs: 'maxlength="400"' })}`)}
  </div>
  <div style="position:sticky;bottom:0;z-index:5;margin-top:20px;padding:12px 0;background:linear-gradient(transparent,var(--bg) 30%)">
    <div class="card" style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;padding:14px 18px">
      <span class="muted"><span data-dirty ${dirty ? '' : 'hidden'} style="color:var(--warn);font-weight:650">● Alterações não salvas. </span>Endereços de contato e WhatsApp ficam em Configurações.</span>
      <span style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="btn ghost" data-reset>Restaurar padrão</button><button class="btn" type="button" data-save>Salvar alterações</button></span>
    </div></div>`;
}

function novoItem(lista) {
  const id = Math.random().toString(36).slice(2, 10);
  if (lista === 'promocoes.itens') return { id, ativo: 1, titulo: '', texto: '', selo: '', imagem: '', botao_texto: 'Quero aproveitar', acao: 'contato', url: '', inicio: '', fim: '' };
  return { id, ativo: 1, titulo: '', url: '' };
}

async function checarVideos() {
  for (const [i, v] of st.videos.itens.entries()) {
    const el = root.querySelector(`[data-vid-check="${i}"]`);
    if (!el) continue;
    if (!v.url) { el.textContent = ''; continue; }
    try {
      const r = await api('/site/video-info', { method: 'POST', body: { url: v.url } });
      el.innerHTML = r.ok ? `✓ Vídeo reconhecido (${r.tipo === 'youtube' ? 'YouTube' : 'Vimeo'}).${r.thumb ? ` <img src="${esc(r.thumb)}" alt="" style="height:54px;border-radius:6px;vertical-align:middle;margin-left:8px">` : ''}`
        : '<span style="color:var(--danger)">Link não reconhecido. Use um link do YouTube ou do Vimeo.</span>';
    } catch (e) { el.textContent = ''; }
  }
}

function draw() {
  const y = window.scrollY;
  root.innerHTML = html();
  window.scrollTo(0, y);
  checarVideos();
}

async function salvar(btn) {
  if (btn) btn.disabled = true;
  try {
    const r = await put('/site', st);
    st = r.conteudo; marca(false); draw();
    toast('Site atualizado! As mudanças já estão no ar.');
  } catch (e) { fail(e); }
  if (btn) btn.disabled = false;
}

export async function render(view) {
  setCrumbs('Editar site');
  const r = await get('/site');
  st = r.conteudo; padrao = r.padrao; dirty = false;
  // contêiner próprio: é descartado quando o usuário troca de tela, junto com os eventos abaixo
  root = document.createElement('div');
  view.innerHTML = ''; view.append(root);
  view = root;
  draw();

  const ler = (el) => (el.type === 'checkbox' ? (el.checked ? 1 : 0) : el.type === 'number' ? Number(el.value || 0) : el.value);
  view.addEventListener('input', (e) => {
    const el = e.target.closest('[data-k]'); if (!el) return;
    setP(st, el.dataset.k, ler(el)); marca();
  });
  view.addEventListener('change', async (e) => {
    const el = e.target;
    if (el.matches('[data-k]')) {
      setP(st, el.dataset.k, ler(el)); marca();
      const u = view.querySelector(`[data-url-for="${el.dataset.k}"]`);
      if (u) u.hidden = el.value !== 'link';
      if (/^(promocoes|videos)\.itens\.\d+\.(ativo|titulo|inicio|fim|url)$/.test(el.dataset.k)) draw(); // atualiza selos "No ar"/"Vencida" e a checagem do vídeo
      return;
    }
    if (el.matches('[data-img]') && el.files[0]) {
      const fd = new FormData(); fd.append('imagem', el.files[0]);
      try {
        const r2 = await api('/site/imagem', { method: 'POST', body: fd });
        setP(st, el.dataset.img, r2.url); marca(); draw();
        toast('Imagem enviada. Clique em Salvar alterações para publicar.');
      } catch (err) { fail(err); }
    }
  });
  view.addEventListener('click', async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.matches('[data-save]')) return salvar(b);
    if (b.matches('[data-go]')) { const s = view.querySelector('#sec-' + b.dataset.go); if (s) window.scrollTo({ top: s.getBoundingClientRect().top + window.scrollY - 60, behavior: 'smooth' }); return; }
    if (b.matches('[data-img-rm]')) { setP(st, b.dataset.imgRm, ''); marca(); return draw(); }
    if (b.matches('[data-reset]')) {
      if (await confirmDlg('Voltar todos os textos, imagens, promoções, vídeos e pop-up ao padrão original? Isso só vale depois de salvar.', 'Restaurar padrão')) {
        st = JSON.parse(JSON.stringify(padrao)); marca(); draw();
      }
      return;
    }
    const act = b.dataset.act; if (!act) return;
    const lista = getP(st, b.dataset.list); const i = Number(b.dataset.i);
    if (act === 'add') lista.push(novoItem(b.dataset.list));
    if (act === 'rm') { if (!(await confirmDlg('Remover este item do site?', 'Remover'))) return; lista.splice(i, 1); }
    if (act === 'up' && i > 0) [lista[i - 1], lista[i]] = [lista[i], lista[i - 1]];
    if (act === 'down' && i < lista.length - 1) [lista[i + 1], lista[i]] = [lista[i], lista[i + 1]];
    marca(); draw();
  });
}
