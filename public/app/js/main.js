import { state, get, post, esc, icon, fail, modal, field, PERFIS, put, toast } from './core.js';

const NAV = [
  { grp: 'Geral' },
  { href: '#/', label: 'Painel', icon: 'dash', page: 'dashboard' },
  { grp: 'Comercial' },
  { href: '#/estoque', label: 'Estoque', icon: 'car', perm: 'estoque', page: 'estoque' },
  { href: '#/vendas', label: 'Vendas', icon: 'sale', perm: 'vendas', page: 'vendas' },
  { href: '#/pessoas', label: 'Clientes e fornecedores', icon: 'users', perm: 'pessoas', page: 'pessoas' },
  { href: '#/leads', label: 'Leads do site', icon: 'lead', perm: 'leads', page: 'leads', count: 'leads' },
  { grp: 'Documentos' },
  { href: '#/documentos', label: 'Documentos', icon: 'doc', perm: 'documentos', page: 'documentos' },
  { href: '#/modelos', label: 'Modelos de contrato', icon: 'tpl', perm: 'documentos', page: 'modelos' },
  { grp: 'Financeiro' },
  { href: '#/financeiro', label: 'Fluxo de caixa', icon: 'cash', perm: 'financeiro', page: 'financeiro' },
  { href: '#/lancamentos', label: 'Contas a pagar e receber', icon: 'list', perm: 'financeiro', page: 'lancamentos' },
  { href: '#/socios', label: 'Sócios e investimentos', icon: 'users', perm: 'custos', page: 'socios' },
  { href: '#/relatorios', label: 'Relatórios', icon: 'chart', perm: 'relatorios', page: 'relatorios' },
  { grp: 'Administração' },
  { href: '#/usuarios', label: 'Usuários', icon: 'user', perm: 'usuarios', page: 'usuarios' },
  { href: '#/site', label: 'Editar site', icon: 'globe', perm: 'config', page: 'site' },
  { href: '#/config', label: 'Configurações', icon: 'cog', perm: 'config', page: 'config' },
];

// rota -> [módulo, função]
const ROUTES = [
  [/^\/?$/, 'dashboard', 'render'],
  [/^\/estoque$/, 'estoque', 'list'],
  [/^\/estoque\/novo$/, 'estoque', 'novo'],
  [/^\/veiculo\/(\d+)$/, 'estoque', 'detail'],
  [/^\/vendas$/, 'vendas', 'list'],
  [/^\/vendas\/nova$/, 'vendas', 'nova'],
  [/^\/venda\/(\d+)$/, 'vendas', 'detail'],
  [/^\/pessoas$/, 'pessoas', 'list'],
  [/^\/pessoa\/(\d+)$/, 'pessoas', 'detail'],
  [/^\/leads$/, 'leads', 'list'],
  [/^\/documentos$/, 'documentos', 'list'],
  [/^\/documento\/(\d+)$/, 'documentos', 'detail'],
  [/^\/modelos$/, 'modelos', 'list'],
  [/^\/modelo\/(\d+|novo)$/, 'modelos', 'edit'],
  [/^\/financeiro$/, 'financeiro', 'fluxo'],
  [/^\/lancamentos$/, 'financeiro', 'lancamentos'],
  [/^\/relatorios$/, 'relatorios', 'render'],
  [/^\/usuarios$/, 'usuarios', 'render'],
  [/^\/config$/, 'config', 'render'],
  [/^\/site$/, 'site', 'render'],
  [/^\/socios$/, 'socios', 'list'],
  [/^\/socio\/(\d+)$/, 'socios', 'detail'],
];

function layout() {
  const u = state.user;
  document.body.innerHTML = `<div class="shell">
    <aside class="side" id="side">
      <a class="logo" href="#/" aria-label="M2 Seminovos — painel"><img src="/assets/m2-logo.svg" alt="M2 Seminovos"></a>
      <nav aria-label="Menu do sistema">${NAV.filter((n) => n.grp || !n.perm || u.perms.includes(n.perm)).map((n) => n.grp
        ? `<div class="grp">${esc(n.grp)}</div>`
        : `<a href="${n.href}" data-page="${n.page}">${icon(n.icon)}<span>${esc(n.label)}</span>${n.count ? `<b class="count" data-count="${n.count}" hidden></b>` : ''}</a>`).join('')
        .replace(/<div class="grp">[^<]*<\/div>(?=<div class="grp">|$)/g, '')}</nav>
      <div class="me"><strong>${esc(u.nome)}</strong><span>${esc(PERFIS[u.perfil] || u.perfil)} · ${esc(u.email)}</span>
        <div class="row"><button type="button" id="btn-senha">Trocar senha</button><button type="button" id="btn-sair">Sair</button></div></div>
    </aside>
    <div class="main">
      <header class="top"><button class="menu" type="button" aria-label="Abrir menu" id="btn-menu">☰</button>
        <div class="crumbs" id="crumbs"></div><div class="spacer"></div>
        <a class="site-link" href="/" target="_blank" rel="noopener">Ver site ↗</a></header>
      <main class="content" id="view" tabindex="-1"></main>
    </div></div>`;
  document.getElementById('btn-menu').onclick = () => document.getElementById('side').classList.toggle('open');
  document.getElementById('btn-sair').onclick = async () => { await post('/logout'); location.href = '/login'; };
  document.getElementById('btn-senha').onclick = () => modal({
    title: 'Trocar senha',
    body: field('Senha atual', 'atual', '', { type: 'password', attrs: 'autocomplete="current-password" required' }) + field('Nova senha', 'nova', '', { type: 'password', attrs: 'autocomplete="new-password" minlength="6" required', hint: 'Mínimo de 6 caracteres.' }),
    onSubmit: async (d) => { await put('/me/senha', d); toast('Senha alterada.'); },
  });
}

export function setCrumbs(...parts) {
  const el = document.getElementById('crumbs');
  if (el) el.innerHTML = parts.map((p, i) => (i === parts.length - 1 ? `<strong>${esc(p)}</strong>` : esc(p))).join(' / ');
  document.title = `${parts[parts.length - 1]} · M2 Seminovos`;
}

async function route() {
  const hash = location.hash.slice(1) || '/';
  const [path, qs] = hash.split('?');
  const params = Object.fromEntries(new URLSearchParams(qs || ''));
  const view = document.getElementById('view');
  document.getElementById('side').classList.remove('open');
  for (const [re, mod, fn] of ROUTES) {
    const m = path.match(re);
    if (!m) continue;
    document.querySelectorAll('.side a[data-page]').forEach((a) => a.toggleAttribute('aria-current', false));
    const navPage = { estoque: 'estoque', vendas: 'vendas', pessoas: 'pessoas', documentos: 'documentos', modelos: 'modelos', leads: 'leads', usuarios: 'usuarios', config: 'config', site: 'site', socios: 'socios', relatorios: 'relatorios', dashboard: 'dashboard' }[mod] || (fn === 'fluxo' ? 'financeiro' : 'lancamentos');
    const a = document.querySelector(`.side a[data-page="${navPage}"]`);
    if (a) a.setAttribute('aria-current', 'page');
    view.innerHTML = '<div class="empty">Carregando…</div>';
    try {
      const page = await import(`./pages/${mod}.js`);
      await page[fn](view, { id: m[1], params });
    } catch (e) {
      console.error(e);
      view.innerHTML = `<div class="alert">${esc(e.message)}</div>`;
    }
    window.scrollTo(0, 0);
    refreshCounts();
    return;
  }
  view.innerHTML = '<div class="empty">Página não encontrada.</div>';
}

async function refreshCounts() {
  if (!state.user.perms.includes('leads')) return;
  try {
    const leads = await get('/leads');
    const n = leads.filter((l) => l.status === 'novo').length;
    const b = document.querySelector('[data-count="leads"]');
    if (b) { b.textContent = n; b.hidden = !n; }
  } catch (e) { /* ignora */ }
}

(async function init() {
  try {
    state.user = await get('/me');
  } catch (e) { return; }
  layout();
  window.addEventListener('hashchange', route);
  route().catch(fail);
})();
