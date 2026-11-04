import { get, post, put, del, esc, brl, dt, modal, confirmDlg, toast, fail, field, selectField, areaField, table, bindRows, statusVeic, icon } from '../core.js';
import { setCrumbs } from '../main.js';

const UFS = ['', 'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];

export function pessoaForm(p, onSaved) {
  p = p || {};
  modal({
    title: p.id ? 'Editar cadastro' : 'Novo cliente / fornecedor', size: 'xwide',
    body: `<div class="form-grid">
      ${selectField('Tipo', 'tipo_pessoa', { PF: 'Pessoa física', PJ: 'Pessoa jurídica' }, p.tipo_pessoa || 'PF', { cls: 'c3' })}
      ${field('Nome completo / razão social', 'nome', p.nome, { cls: 'c6', attrs: 'required' })}
      ${field('CPF / CNPJ', 'cpf_cnpj', p.cpf_cnpj, { cls: 'c3', attrs: 'inputmode="numeric"' })}
      ${field('RG / IE', 'rg', p.rg, { cls: 'c3' })}
      ${field('Nascimento', 'nascimento', p.nascimento, { type: 'date', cls: 'c3' })}
      ${selectField('Estado civil', 'estado_civil', ['', 'solteiro(a)', 'casado(a)', 'divorciado(a)', 'viúvo(a)', 'união estável'], p.estado_civil, { cls: 'c3' })}
      ${field('Profissão', 'profissao', p.profissao, { cls: 'c3' })}
      ${field('Telefone / WhatsApp', 'telefone', p.telefone, { cls: 'c3', attrs: 'inputmode="tel" placeholder="(00) 00000-0000"' })}
      ${field('E-mail', 'email', p.email, { type: 'email', cls: 'c6' })}
      <p class="form-sec">Endereço</p>
      ${field('CEP', 'cep', p.cep, { cls: 'c3', attrs: 'inputmode="numeric" data-cep' })}
      ${field('Logradouro', 'endereco', p.endereco, { cls: 'c6' })}
      ${field('Número', 'numero', p.numero, { cls: 'c3' })}
      ${field('Complemento', 'complemento', p.complemento, { cls: 'c3' })}
      ${field('Bairro', 'bairro', p.bairro, { cls: 'c3' })}
      ${field('Cidade', 'cidade', p.cidade, { cls: 'c3' })}
      ${selectField('UF', 'uf', UFS, p.uf, { cls: 'c3' })}
      ${areaField('Observações', 'observacoes', p.observacoes, { rows: 2 })}
    </div>`,
    onOpen: (d) => {
      // busca CEP (ViaCEP)
      d.querySelector('[data-cep]').addEventListener('change', async (e) => {
        const cep = e.target.value.replace(/\D/g, '');
        if (cep.length !== 8) return;
        try {
          const r = await (await fetch(`https://viacep.com.br/ws/${cep}/json/`)).json();
          if (r.erro) return;
          const set = (n, v) => { const el = d.querySelector(`[name=${n}]`); if (el && !el.value) el.value = v || ''; };
          set('endereco', r.logradouro); set('bairro', r.bairro); set('cidade', r.localidade); set('uf', r.uf);
        } catch (err) { /* sem internet: preenchimento manual */ }
      });
    },
    onSubmit: async (d) => {
      let id = p.id;
      if (id) await put('/pessoas/' + id, d); else id = (await post('/pessoas', d)).id;
      toast('Cadastro salvo.');
      if (onSaved) onSaved(id);
    },
  });
}

export async function list(view) {
  setCrumbs('Clientes e fornecedores');
  view.innerHTML = `<div class="ph"><div><p class="eyebrow">COMERCIAL</p><h1>Clientes e fornecedores</h1><p>Quem compra e quem vende veículos para a loja.</p></div>
    <div class="acts"><button class="btn" id="novo">${icon('plus')}Novo cadastro</button></div></div>
    <div class="filters"><input type="search" id="q" placeholder="Buscar por nome, CPF/CNPJ ou telefone" aria-label="Buscar"></div><div id="lst"></div>`;
  const load = async (q = '') => {
    const rows = await get('/pessoas?q=' + encodeURIComponent(q));
    view.querySelector('#lst').innerHTML = table([
      { label: 'Nome', html: (p) => `<div class="t1">${esc(p.nome)}</div><div class="t2">${p.tipo_pessoa === 'PJ' ? 'Pessoa jurídica' : 'Pessoa física'}</div>` },
      { label: 'CPF / CNPJ', key: 'cpf_cnpj' }, { label: 'Telefone', key: 'telefone' }, { label: 'E-mail', key: 'email' },
      { label: 'Cidade', html: (p) => esc([p.cidade, p.uf].filter(Boolean).join('/')) },
      { label: 'Compras', num: true, key: 'compras' }, { label: 'Vendeu à loja', num: true, key: 'fornecimentos' },
    ], rows, { onRow: true, empty: 'Nenhum cadastro encontrado.' });
    bindRows(view.querySelector('#lst'), rows, (p) => (location.hash = `#/pessoa/${p.id}`));
  };
  let t;
  view.querySelector('#q').oninput = (e) => { clearTimeout(t); t = setTimeout(() => load(e.target.value).catch(fail), 250); };
  view.querySelector('#novo').onclick = () => pessoaForm(null, (id) => (location.hash = `#/pessoa/${id}`));
  await load();
}

export async function detail(view, { id }) {
  const p = await get('/pessoas/' + id);
  setCrumbs('Clientes e fornecedores', p.nome);
  const wa = p.telefone ? `https://wa.me/${(p.telefone.replace(/\D/g, '').length <= 11 ? '55' : '') + p.telefone.replace(/\D/g, '')}` : null;
  view.innerHTML = `<div class="ph"><div><p class="eyebrow">${p.tipo_pessoa === 'PJ' ? 'PESSOA JURÍDICA' : 'PESSOA FÍSICA'}</p><h1>${esc(p.nome)}</h1><p>${esc(p.cpf_cnpj || 'CPF/CNPJ não informado')}</p></div>
    <div class="acts">${wa ? `<a class="btn wa" href="${wa}" target="_blank" rel="noopener">${icon('wa')}WhatsApp</a>` : ''}<button class="btn ghost" id="ed">Editar</button><button class="btn danger" id="rm">Excluir</button></div></div>
    <div class="grid g-main"><section class="card"><h2>Dados</h2><dl class="dl">${[['Telefone', p.telefone], ['E-mail', p.email], ['RG / IE', p.rg], ['Nascimento', p.nascimento && dt(p.nascimento)], ['Estado civil', p.estado_civil], ['Profissão', p.profissao],
      ['Endereço', [p.endereco, p.numero, p.complemento].filter(Boolean).join(', ')], ['Bairro', p.bairro], ['Cidade', [p.cidade, p.uf].filter(Boolean).join('/')], ['CEP', p.cep]].map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v || '–')}</dd></div>`).join('')}</dl>
      ${p.observacoes ? `<p class="muted" style="margin:14px 0 0">${esc(p.observacoes)}</p>` : ''}</section>
    <section class="stack"><div class="card"><h2>Compras na loja</h2>${table([{ label: 'Data', html: (s) => dt(s.data_venda) }, { label: 'Veículo', key: 'veiculo' }, { label: 'Valor', num: true, html: (s) => brl(s.valor_venda) }], p.compras, { onRow: true, empty: 'Nenhuma compra.' })}</div>
      <div class="card" id="forn"><h2>Veículos vendidos à loja</h2>${table([{ label: 'Entrada', html: (v) => dt(v.data_entrada) }, { label: 'Veículo', html: (v) => esc(`${v.marca} ${v.modelo} ${v.placa || ''}`) }, { label: 'Situação', html: (v) => statusVeic(v.status) }], p.fornecimentos, { onRow: true, empty: 'Nenhum veículo.' })}</div></section></div>`;
  bindRows(view.querySelectorAll('.card')[1], p.compras, (s) => (location.hash = `#/venda/${s.id}`));
  bindRows(view.querySelector('#forn'), p.fornecimentos, (v) => (location.hash = `#/veiculo/${v.id}`));
  view.querySelector('#ed').onclick = () => pessoaForm(p, () => detail(view, { id }));
  view.querySelector('#rm').onclick = async () => {
    if (!(await confirmDlg('Excluir este cadastro?', 'Excluir'))) return;
    try { await del('/pessoas/' + id); toast('Cadastro excluído.'); location.hash = '#/pessoas'; } catch (e) { fail(e); }
  };
}
