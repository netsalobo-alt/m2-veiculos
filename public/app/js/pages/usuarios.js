import { get, post, put, esc, dth, table, pill, modal, toast, field, selectField, PERFIS, icon, state } from '../core.js';
import { setCrumbs } from '../main.js';

const DESC = {
  admin: 'Acesso total, inclusive usuários e configurações.',
  gerente: 'Tudo, exceto gerenciar usuários.',
  financeiro: 'Financeiro, relatórios, estoque com custos, vendas e documentos.',
  vendedor: 'Estoque (sem custos de compra), clientes, vendas, documentos e leads.',
};

export async function render(view) {
  setCrumbs('Usuários');
  const rows = await get('/usuarios');
  view.innerHTML = `<div class="ph"><div><p class="eyebrow">ADMINISTRAÇÃO</p><h1>Usuários</h1><p>Quem acessa o sistema e o que cada perfil pode fazer.</p></div>
    <div class="acts"><button class="btn" id="novo">${icon('plus')}Novo usuário</button></div></div>
    <div id="lst"></div>
    <section class="card" style="margin-top:18px"><h2>Perfis de acesso</h2>${Object.entries(PERFIS).map(([k, v]) => `<div class="kv"><span><strong style="color:var(--ink)">${v}</strong></span><span>${DESC[k]}</span></div>`).join('')}</section>`;
  view.querySelector('#lst').innerHTML = table([
    { label: 'Nome', html: (u) => `<div class="t1">${esc(u.nome)}</div><div class="t2">${esc(u.email)}</div>` },
    { label: 'Perfil', html: (u) => esc(PERFIS[u.perfil]) }, { label: 'Telefone', key: 'telefone' },
    { label: 'Comissão', num: true, html: (u) => (u.comissao_pct ? `${String(u.comissao_pct).replace('.', ',')}%` : '–') },
    { label: 'Situação', html: (u) => (u.ativo ? pill('Ativo', 'ok') : pill('Inativo')) }, { label: 'Criado', html: (u) => dth(u.criado_em) },
  ], rows, { onRow: true });
  view.querySelectorAll('#lst tr[data-row]').forEach((tr) => (tr.onclick = () => form(rows[tr.dataset.row])));
  view.querySelector('#novo').onclick = () => form(null);
  function form(u) {
    const novo = !u;
    u = u || { perfil: 'vendedor', ativo: 1 };
    modal({
      title: novo ? 'Novo usuário' : 'Editar usuário', size: 'wide',
      body: `<div class="form-grid">${field('Nome', 'nome', u.nome, { cls: 'c6', attrs: 'required' })}${field('E-mail (login)', 'email', u.email, { type: 'email', cls: 'c6', attrs: 'required autocomplete="off"' })}
        ${selectField('Perfil', 'perfil', PERFIS, u.perfil, { cls: 'c4' })}${field('Telefone', 'telefone', u.telefone, { cls: 'c4' })}${field('Comissão padrão (%)', 'comissao_pct', u.comissao_pct || '', { type: 'number', cls: 'c4', attrs: 'step="0.1" min="0" max="100"', hint: 'Sugerida ao registrar a venda.' })}
        ${field(novo ? 'Senha' : 'Nova senha (deixe em branco para manter)', 'senha', '', { type: 'password', cls: 'c6', attrs: `autocomplete="new-password" ${novo ? 'required' : ''} minlength="6"` })}
        ${novo ? '' : `<label class="check c6" style="margin-top:42px"><input type="checkbox" name="ativo" ${u.ativo ? 'checked' : ''} ${u.id === state.user.id ? 'disabled' : ''}> Usuário ativo</label>`}</div>`,
      onSubmit: async (d) => {
        if (!novo && u.id === state.user.id) d.ativo = 1;
        if (novo) await post('/usuarios', d); else await put('/usuarios/' + u.id, d);
        toast('Usuário salvo.'); render(view);
      },
    });
  }
}
