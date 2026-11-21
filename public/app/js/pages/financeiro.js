import { api, get, post, put, del, esc, brl, dt, today, monthStart, monthEnd, modal, confirmDlg, toast, fail, field, moneyField, selectField, areaField, table, pill, icon, FORMAS, MESES, can, moneyInput } from '../core.js';
import { setCrumbs } from '../main.js';

let mesOff = 0;
const mesLabel = (off) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + off); return `${MESES[d.getMonth()]}/${d.getFullYear()}`; };

// ------------------------------------------------------------------ fluxo de caixa
export async function fluxo(view) {
  setCrumbs('Financeiro', 'Fluxo de caixa');
  const de = monthStart(mesOff), ate = monthEnd(mesOff);
  const [r, fx] = await Promise.all([get(`/financeiro/resumo?de=${de}&ate=${ate}`), get(`/financeiro/fluxo?de=${de}&ate=${ate}`)]);
  view.innerHTML = `<div class="ph"><div><p class="eyebrow">FINANCEIRO</p><h1>Fluxo de caixa</h1><p>Entradas e saídas realizadas e previstas, com saldo dia a dia.</p></div>
    <div class="acts"><button class="btn ghost" id="contas">Contas e caixas</button><button class="btn ghost" id="nsai">${icon('plus')}Nova saída</button><button class="btn" id="nent">${icon('plus')}Nova entrada</button></div></div>
    <div class="filters" style="align-items:center"><div class="seg" role="group" aria-label="Mês">
      <button type="button" id="prev" aria-label="Mês anterior">←</button><button type="button" aria-pressed="true" style="min-width:110px">${mesLabel(mesOff)}</button><button type="button" id="next" aria-label="Próximo mês">→</button></div>
      ${mesOff ? '<button class="btn sm ghost" id="hoje">Mês atual</button>' : ''}</div>
    <div class="grid g4">
      <div class="kpi dark"><div class="k">Saldo atual (todas as contas)</div><div class="v">${brl(r.saldo_atual)}</div><div class="s">${r.contas.map((c) => `${esc(c.nome)}: ${brl(c.saldo)}`).join(' · ')}</div></div>
      <div class="kpi"><div class="k">Entradas realizadas no mês</div><div class="v pos">${brl(r.entradas)}</div></div>
      <div class="kpi"><div class="k">Saídas realizadas no mês</div><div class="v neg">${brl(r.saidas)}</div></div>
      <div class="kpi"><div class="k">Resultado de caixa no mês</div><div class="v ${r.entradas - r.saidas < 0 ? 'neg' : ''}">${brl(r.entradas - r.saidas)}</div></div>
      <div class="kpi"><div class="k">Total a receber</div><div class="v">${brl(r.a_receber)}</div><div class="s">${r.receber_vencido ? `<span class="neg">${brl(r.receber_vencido)} vencido</span>` : 'Nada vencido'}</div></div>
      <div class="kpi"><div class="k">Total a pagar</div><div class="v">${brl(r.a_pagar)}</div><div class="s">${r.pagar_vencido ? `<span class="neg">${brl(r.pagar_vencido)} vencido</span>` : 'Nada vencido'}</div></div>
      <div class="kpi"><div class="k">Saldo no fim do mês (realizado)</div><div class="v">${brl(fx.saldo_final)}</div></div>
      <div class="kpi"><div class="k">Saldo previsto no fim do mês</div><div class="v ${fx.saldo_final_previsto < 0 ? 'neg' : ''}">${brl(fx.saldo_final_previsto)}</div><div class="s">Inclui pendentes do mês</div></div>
    </div>
    <section class="card" style="margin-top:18px"><div class="card-h"><h2>Movimento diário · ${mesLabel(mesOff)}</h2><span class="muted">Saldo inicial: <strong>${brl(fx.saldo_inicial)}</strong>${fx.atrasados ? ` · pendentes atrasados de meses anteriores: <strong>${brl(fx.atrasados)}</strong>` : ''}</span></div>
      ${table([
        { label: 'Dia', html: (d) => `${dt(d.dia)}${d.dia === today() ? ' ' + pill('Hoje', 'info') : ''}` },
        { label: 'Entradas', num: true, html: (d) => (d.entradas ? `<span class="pos">${brl(d.entradas)}</span>` : '–') },
        { label: 'Saídas', num: true, html: (d) => (d.saidas ? `<span class="neg">${brl(d.saidas)}</span>` : '–') },
        { label: 'A receber', num: true, html: (d) => (d.entradas_prev ? brl(d.entradas_prev) : '–') },
        { label: 'A pagar', num: true, html: (d) => (d.saidas_prev ? brl(d.saidas_prev) : '–') },
        { label: 'Saldo realizado', num: true, html: (d) => `<strong class="${d.saldo < 0 ? 'neg' : ''}">${brl(d.saldo)}</strong>` },
        { label: 'Saldo previsto', num: true, html: (d) => `<span class="${d.saldo_previsto < 0 ? 'neg' : ''}">${brl(d.saldo_previsto)}</span>` },
      ], fx.dias, { empty: 'Nenhuma movimentação neste mês.', foot: fx.dias.length ? ['Total', brl(fx.dias.reduce((a, d) => a + d.entradas, 0)), brl(fx.dias.reduce((a, d) => a + d.saidas, 0)), brl(fx.dias.reduce((a, d) => a + d.entradas_prev, 0)), brl(fx.dias.reduce((a, d) => a + d.saidas_prev, 0)), brl(fx.saldo_final), brl(fx.saldo_final_previsto)] : null })}
      <p class="small" style="margin:14px 0 0">Realizado = lançamentos pagos/recebidos na data do pagamento. Previsto = pendentes na data de vencimento.</p></section>`;
  const re = () => fluxo(view).catch(fail);
  view.querySelector('#prev').onclick = () => { mesOff--; re(); };
  view.querySelector('#next').onclick = () => { mesOff++; re(); };
  const h = view.querySelector('#hoje'); if (h) h.onclick = () => { mesOff = 0; re(); };
  view.querySelector('#nent').onclick = () => lancForm({ tipo: 'entrada' }, re);
  view.querySelector('#nsai').onclick = () => lancForm({ tipo: 'saida' }, re);
  view.querySelector('#contas').onclick = () => contasDlg(re);
}

// ------------------------------------------------------------------ lançamento
export async function lancForm(l, onSaved) {
  const tipo = l.tipo || 'saida';
  const comSocio = podeSocio({ ...l, tipo });
  const [cats, contas, socios, funcs] = await Promise.all([get('/financeiro/categorias'), get('/contas'), comSocio ? get('/socios?simples=1') : [], tipo === 'saida' ? get('/funcionarios?simples=1').catch(() => []) : []]);
  const funcOpts = (lista) => [['', 'Escolha o funcionário…'], ...lista.filter((f) => f.ativo || f.id === l.funcionario_id).map((f) => [f.id, f.nome + (f.cargo ? ` (${f.cargo})` : '')])];
  const ativos = socios.filter((s) => !s.loja && (s.ativo || s.id === l.pago_socio_id));
  const novo = !l.id;
  const auto = l.custo_id || l.venda_id || (l.categoria === 'Compra de veículos' && l.veiculo_id);
  modal({
    title: novo ? (tipo === 'entrada' ? 'Nova entrada' : 'Nova saída') : 'Editar lançamento', size: 'wide',
    body: `${auto ? '<div class="alert info">Lançamento gerado automaticamente por um veículo, custo ou venda. Você pode dar baixa e ajustar datas e conta.</div>' : ''}
      <div class="form-grid">
      ${field('Descrição', 'descricao', l.descricao, { cls: 'c8', attrs: 'required' })}
      <label class="c4">Categoria<input name="categoria" list="cats" value="${esc(l.categoria || '')}"><datalist id="cats">${cats[tipo].map((c) => `<option value="${esc(c)}">`).join('')}</datalist></label>
      ${moneyField('Valor', 'valor', l.valor, { cls: 'c4', attrs: 'required' })}
      ${field('Vencimento', 'vencimento', l.vencimento || today(), { type: 'date', cls: 'c4' })}
      ${selectField('Conta', 'conta_id', contas.map((c) => [c.id, c.nome]), l.conta_id || ((contas.find((c) => c.tipo === 'banco') || contas[0] || {}).id), { cls: 'c4' })}
      ${selectField('Forma', 'forma', { '': '—', ...FORMAS }, l.forma, { cls: 'c4' })}
      ${selectField('Situação', 'status', { pendente: tipo === 'entrada' ? 'A receber' : 'A pagar', pago: tipo === 'entrada' ? 'Recebido' : 'Pago' }, l.status || 'pendente', { cls: 'c4' })}
      ${field('Data do pagamento', 'data_pagamento', l.data_pagamento || today(), { type: 'date', cls: 'c4' })}
      ${tipo === 'saida' ? `<div class="c12" id="func-box" hidden><div style="display:flex;gap:10px;align-items:end">
        ${selectField('Funcionário', 'funcionario_id', funcOpts(funcs), l.funcionario_id || '', { cls: 'grow' }).replace('<label class="grow"', '<label style="flex:1"')}
        <button type="button" class="btn ghost" id="func-novo" style="margin-bottom:14px">${icon('plus')}Novo funcionário</button></div>
        ${funcs.length ? '' : '<p class="hint" style="margin-top:-8px">Nenhum funcionário cadastrado ainda. Clique em Novo funcionário.</p>'}</div>` : ''}
      ${comSocio ? socioBloco(ativos, l) : ''}
      ${novo ? field('Repetir mensalmente (parcelas)', 'parcelas', 1, { type: 'number', cls: 'c4', attrs: 'min="1" max="60"', hint: 'Ex.: aluguel 12x, empréstimo 24x.' }) : ''}
      ${areaField('Observações', 'observacoes', l.observacoes, { rows: 2 })}</div>`,
    onOpen: (d) => {
      wireSocio(d);
      // "Quem pagou" só faz sentido para conta já paga; a categoria de sócio não leva o campo
      const st = d.querySelector('[name=status]'), box = d.querySelector('#socio-box'), cat = d.querySelector('[name=categoria]');
      const sync = () => { if (box) box.hidden = st.value !== 'pago' || CATS_SOCIO.includes(cat.value.trim()); };
      st.addEventListener('change', sync); cat.addEventListener('input', sync); sync();
      // categoria de salário: abre a escolha do funcionário e sugere descrição e valor
      const fbox = d.querySelector('#func-box');
      if (fbox) {
        const fsel = fbox.querySelector('[name=funcionario_id]');
        const syncF = () => { fbox.hidden = !ehSalario(cat.value); };
        cat.addEventListener('input', syncF); cat.addEventListener('change', syncF); syncF();
        fsel.addEventListener('change', () => {
          const f = funcs.find((x) => String(x.id) === fsel.value);
          if (!f) return;
          const desc = d.querySelector('[name=descricao]'), val = d.querySelector('[name=valor]');
          const venc = d.querySelector('[name=vencimento]').value || today();
          if (!desc.value.trim() || /^Salário – /.test(desc.value)) desc.value = `Salário – ${f.nome} (${venc.slice(5, 7)}/${venc.slice(0, 4)})`;
          if (!val.value.trim() && f.salario > 0) val.value = moneyInput(f.salario);
        });
        fbox.querySelector('#func-novo').onclick = async () => {
          const { funcForm } = await import('./funcionarios.js');
          funcForm(null, async () => {
            const lista = await get('/funcionarios?simples=1');
            funcs.splice(0, funcs.length, ...lista);
            const novoF = lista.reduce((a, x) => (x.id > (a ? a.id : 0) ? x : a), null);
            fsel.innerHTML = funcOpts(lista).map(([k, v]) => `<option value="${esc(k)}">${esc(v)}</option>`).join('');
            if (novoF) { fsel.value = novoF.id; fsel.dispatchEvent(new Event('change')); }
          });
        };
      }
    },
    onSubmit: async (d) => {
      d.tipo = tipo;
      if (CATS_SOCIO.includes(String(d.categoria || '').trim())) { if (d.pago_socio_id !== undefined) d.pago_socio_id = null; }
      limpaSocio(d);
      if (d.funcionario_id !== undefined) {
        if (!ehSalario(d.categoria)) d.funcionario_id = null;
        else if (!d.funcionario_id) throw new Error('Escolha o funcionário deste salário.');
      }
      if (novo) await post('/lancamentos', d); else await put('/lancamentos/' + l.id, d);
      toast('Lançamento salvo.'); onSaved && onSaved();
    },
  });
}

function contasDlg(onSaved) {
  get('/contas').then((contas) => {
    const m = modal({
      title: 'Contas e caixas', size: 'wide',
      body: `${table([{ label: 'Conta', key: 'nome' }, { label: 'Tipo', html: (c) => ({ caixa: 'Caixa', banco: 'Banco', aplicacao: 'Aplicação' }[c.tipo] || c.tipo) }, { label: 'Saldo inicial', num: true, html: (c) => brl(c.saldo_inicial) }, { label: 'Saldo atual', num: true, html: (c) => `<strong>${brl(c.saldo)}</strong>` }, { label: '', html: () => '<button class="btn sm ghost" data-ed>Editar</button>' }], contas)}
        <form id="nc" class="form-grid" style="margin-top:16px"><p class="form-sec">Nova conta</p>${field('Nome', 'nome', '', { cls: 'c4' })}${selectField('Tipo', 'tipo', { banco: 'Banco', caixa: 'Caixa', aplicacao: 'Aplicação' }, 'banco', { cls: 'c3' })}${moneyField('Saldo inicial', 'saldo_inicial', '', { cls: 'c3' })}<div class="c2" style="display:flex;align-items:end"><button class="btn full" type="submit">Adicionar</button></div></form>`,
    });
    m.el.querySelectorAll('tbody tr').forEach((tr, i) => (tr.querySelector('[data-ed]').onclick = () => {
      const c = contas[i];
      modal({ title: 'Editar conta', body: field('Nome', 'nome', c.nome) + moneyField('Saldo inicial', 'saldo_inicial', c.saldo_inicial, { hint: 'Saldo da conta antes do primeiro lançamento no sistema.' }) + `<label class="check"><input type="checkbox" name="ativo" ${c.ativo ? 'checked' : ''}> Ativa</label>`,
        onSubmit: async (d) => { await put('/contas/' + c.id, d); m.close(); toast('Conta salva.'); onSaved(); } });
    }));
    m.el.querySelector('#nc').onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target;
      try { await post('/contas', { nome: f.nome.value, tipo: f.tipo.value, saldo_inicial: f.saldo_inicial.value.replace(/\./g, '').replace(',', '.') }); m.close(); toast('Conta criada.'); onSaved(); } catch (err) { fail(err); }
    };
  }).catch(fail);
}

// campo "Quem pagou" (loja ou um sócio) e o que fazer com o valor: somar aos aportes ou restituir
const CATS_SOCIO = ['Repasse a sócios', 'Restituição a sócios'];
const ehSalario = (c) => /sal[aá]rio/i.test(String(c || ''));
const podeSocio = (l) => (l.tipo || 'saida') === 'saida' && !CATS_SOCIO.includes(l.categoria) && !l.origem_id && can('custos');
function socioBloco(ativos, l = {}) {
  if (!ativos.length) return '';
  const onde = l.custo_id || l.veiculo_id ? 'no carro deste lançamento (entra na participação do sócio no lucro)' : 'na empresa';
  const modo = l.pago_socio_modo || 'aporte';
  return `<div class="c12" id="socio-box">
    ${selectField('Quem pagou', 'pago_socio_id', [['', 'A loja (sai do caixa)'], ...ativos.map((s) => [s.id, s.nome])], l.pago_socio_id || '')}
    <fieldset id="modo" ${l.pago_socio_id ? '' : 'hidden'} style="border:1px solid var(--line);border-radius:10px;padding:10px 14px;margin:0 0 14px">
      <legend style="padding:0 6px;font-weight:600">O sócio pagou ou aportou. O que fazer com esse valor?</legend>
      <label class="check"><input type="radio" name="pago_socio_modo" value="aporte" ${modo === 'aporte' ? 'checked' : ''}> <span><strong>Somar aos aportes do sócio</strong>: vira capital dele ${onde}.</span></label>
      <label class="check"><input type="radio" name="pago_socio_modo" value="restituir" ${modo === 'restituir' ? 'checked' : ''}> <span><strong>A restituir ao sócio</strong>: a loja devolve depois. Cria uma conta a pagar "Restituição a sócios" em nome dele.</span></label>
      <p class="hint" style="margin:6px 0 0">O saldo da conta não muda: o sistema lança o pagamento e, no mesmo dia, a entrada do dinheiro do sócio.</p>
    </fieldset></div>`;
}
function wireSocio(d) {
  const sel = d.querySelector('[name=pago_socio_id]');
  if (sel) sel.addEventListener('change', () => { d.querySelector('#modo').hidden = !sel.value; });
}
const limpaSocio = (d) => { if (!d.pago_socio_id || d.status !== 'pago') { d.pago_socio_id = d.pago_socio_id === undefined ? undefined : null; delete d.pago_socio_modo; } return d; };

// ------------------------------------------------------------------ baixa (pagar / receber), com opção de conta paga por um sócio
async function baixa(l, onSaved) {
  const pagar = l.tipo === 'saida' && podeSocio(l);
  const [contas, socios] = await Promise.all([get('/contas'), pagar ? get('/socios?simples=1') : []]);
  const ativos = socios.filter((s) => !s.loja && s.ativo);
  modal({
    title: l.tipo === 'entrada' ? 'Registrar recebimento' : 'Registrar pagamento', size: 'wide',
    body: `<p><strong>${esc(l.descricao)}</strong><br>${brl(l.valor)} · vence ${dt(l.vencimento)}</p>
      <div class="form-grid">
      ${field('Data do pagamento', 'data_pagamento', today(), { type: 'date', cls: 'c4' })}${selectField('Conta', 'conta_id', contas.map((c) => [c.id, c.nome]), l.conta_id, { cls: 'c4' })}${moneyField('Valor pago', 'valor', l.valor, { cls: 'c4' })}
      ${pagar ? socioBloco(ativos, l) : ''}
      </div>`,
    onOpen: (d) => wireSocio(d),
    submitLabel: 'Confirmar',
    onSubmit: async (d) => {
      limpaSocio(Object.assign(d, { status: 'pago' }));
      await put('/lancamentos/' + l.id, d);
      toast(d.pago_socio_id ? (d.pago_socio_modo === 'aporte' ? 'Pagamento registrado e somado aos aportes do sócio.' : 'Pagamento registrado. A restituição ao sócio foi para Contas a pagar.') : 'Baixa registrada.');
      onSaved && onSaved();
    },
  });
}

// ------------------------------------------------------------------ contas a pagar / receber
// filtros da lista (ficam guardados enquanto o sistema está aberto)
const lf = { tipo: 'saida', per: 'mes', off: 0, de: '', ate: '', sit: '', q: '', cat: '', conta: '', forma: '', filtros: false };
const MESES_LONGO = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function periodo() {
  const h = new Date(); h.setHours(12, 0, 0, 0);
  if (lf.per === 'hoje') return { de: iso(h), ate: iso(h), label: 'Hoje' };
  if (lf.per === 'semana') { const a = new Date(h); a.setDate(h.getDate() - ((h.getDay() + 6) % 7)); const b = new Date(a); b.setDate(a.getDate() + 6); return { de: iso(a), ate: iso(b), label: 'Esta semana' }; }
  if (lf.per === 'todo') return { de: '', ate: '', label: 'Todo o período' };
  if (lf.per === 'custom') return { de: lf.de, ate: lf.ate, label: lf.de || lf.ate ? `${lf.de ? dt(lf.de) : '…'} a ${lf.ate ? dt(lf.ate) : '…'}` : 'Escolha o período' };
  const a = new Date(h.getFullYear(), h.getMonth() + lf.off, 1, 12), b = new Date(h.getFullYear(), h.getMonth() + lf.off + 1, 0, 12);
  return { de: iso(a), ate: iso(b), label: `${MESES_LONGO[a.getMonth()]} de ${a.getFullYear()}`, mes: true };
}
const situacao = (l, hoje) => (l.status === 'pago' ? 'pago' : l.vencimento < hoje ? 'vencido' : l.vencimento === hoje ? 'hoje' : 'avencer');

export async function lancamentos(view, { params }) {
  setCrumbs('Financeiro', 'Contas a pagar e receber');
  if (params.status === 'vencido') Object.assign(lf, { tipo: 'todos', per: 'todo', sit: 'vencido' });
  const [cats, contas] = await Promise.all([get('/financeiro/categorias'), get('/contas')]);
  const TIPOS = [['saida', 'A pagar'], ['entrada', 'A receber'], ['todos', 'Todos']];
  const PERS = [['hoje', 'Hoje'], ['semana', 'Esta semana'], ['passado', 'Mês passado'], ['mes', 'Este mês'], ['proximo', 'Próximo mês'], ['todo', 'Todo o período'], ['custom', 'Escolha o período']];
  view.innerHTML = `<div class="ph"><div><p class="eyebrow">FINANCEIRO</p><h1>Contas a pagar e receber</h1><p>Baixe pagamentos e recebimentos e acompanhe os vencimentos.</p></div>
    <div class="acts"><a class="btn ghost" href="#/contas-fixas">Contas fixas</a>${can('custos') ? `<label class="btn ghost" style="margin:0;cursor:pointer" title="Foto ou PDF de recibo, nota, boleto ou conta: a IA lê e sugere onde lançar">${icon('doc')}Ler recibo<input type="file" id="lerrec" hidden accept="image/jpeg,image/png,image/webp,application/pdf,image/*"></label>` : ''}<button class="btn ghost" id="nsai">${icon('plus')}Nova saída</button><button class="btn" id="nent">${icon('plus')}Nova entrada</button></div></div>
    <div class="fx-bar">
      <div class="seg" role="group" aria-label="Tipo">${TIPOS.map(([k, l]) => `<button type="button" data-tipo="${k}" aria-pressed="${lf.tipo === k}">${l}</button>`).join('')}</div>
      <div class="fx-right">
        <div class="seg fx-per" role="group" aria-label="Período">
          <button type="button" id="p-prev" aria-label="Mês anterior">←</button>
          <div class="fx-drop"><button type="button" id="p-btn" aria-haspopup="true" aria-expanded="false"><span id="p-lbl"></span> ▾</button>
            <div class="fx-menu" id="p-menu" hidden>${PERS.map(([k, l]) => `<button type="button" data-per="${k}">${l}</button>`).join('')}
              <div class="fx-custom" id="p-custom" hidden><label>De<input type="date" id="p-de"></label><label>Até<input type="date" id="p-ate"></label><button type="button" class="btn sm" id="p-ok">Aplicar</button></div></div></div>
          <button type="button" id="p-next" aria-label="Próximo mês">→</button></div>
        <button type="button" class="btn ghost" id="f-tog" aria-expanded="${lf.filtros}">${icon('list')}Filtros<b class="count" id="f-n" hidden></b></button>
      </div>
    </div>
    <div class="fx-adv" id="f-adv" ${lf.filtros ? '' : 'hidden'}>
      <input type="search" id="q" placeholder="Buscar descrição, cliente, fornecedor, funcionário…" value="${esc(lf.q)}" aria-label="Buscar">
      <label>Plano de contas<select id="f-cat"><option value="">Todas as categorias</option>${[...new Set([...cats.saida, ...cats.entrada])].sort().map((c) => `<option ${lf.cat === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
      <label>Conta<select id="f-conta"><option value="">Todas as contas</option>${contas.map((c) => `<option value="${c.id}" ${String(lf.conta) === String(c.id) ? 'selected' : ''}>${esc(c.nome)}</option>`).join('')}</select></label>
      <label>Pagamento<select id="f-forma"><option value="">Todas as formas</option>${Object.entries(FORMAS).map(([k, v]) => `<option value="${k}" ${lf.forma === k ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></label>
      <button type="button" class="btn ghost sm" id="f-limpa">Limpar filtros</button>
    </div>
    <div id="cards" class="fx-cards"></div><div id="lst"></div>`;
  const menu = view.querySelector('#p-menu'), pbtn = view.querySelector('#p-btn');
  const fecharMenu = () => { menu.hidden = true; pbtn.setAttribute('aria-expanded', 'false'); };
  const load = async () => {
    const per = periodo();
    view.querySelector('#p-lbl').textContent = per.label;
    view.querySelector('#p-prev').hidden = view.querySelector('#p-next').hidden = !per.mes;
    view.querySelectorAll('[data-tipo]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.tipo === lf.tipo));
    const nf = [lf.q, lf.cat, lf.conta, lf.forma].filter(Boolean).length;
    const fn = view.querySelector('#f-n'); fn.textContent = nf; fn.hidden = !nf;
    const qs = new URLSearchParams({ por: 'pagamento', de: per.de, ate: per.ate, q: lf.q, categoria: lf.cat, conta_id: lf.conta, forma: lf.forma });
    if (lf.tipo !== 'todos') qs.set('tipo', lf.tipo);
    const todos = await get('/lancamentos?' + qs);
    const hoje = today();
    const ent = lf.tipo === 'entrada', ambos = lf.tipo === 'todos';
    // cartões: totais por situação no período
    const grupo = (sit) => todos.filter((l) => !sit || situacao(l, hoje) === sit);
    const valor = (rows) => rows.reduce((a, l) => a + (ambos && l.tipo === 'saida' ? -l.valor : l.valor), 0);
    const totAbs = todos.reduce((a, l) => a + l.valor, 0) || 1;
    const CARDS = [
      ['', 'Total do período', icon('cash'), ent ? 'recebimentos do período' : ambos ? 'entradas menos saídas' : 'pagamentos do período', ''],
      ['vencido', 'Vencidos', '!', 'passaram do vencimento', 'bad'],
      ['hoje', 'Vencem hoje', '◷', 'até o fim do dia', 'warn'],
      ['avencer', 'A vencer', '▦', 'ainda no prazo', 'info'],
      ['pago', ent ? 'Recebidos' : ambos ? 'Pagos e recebidos' : 'Pagos', '✓', 'já baixados', 'ok'],
    ];
    view.querySelector('#cards').innerHTML = CARDS.map(([k, label, ico, sub, cls]) => {
      const rows = grupo(k), abs = rows.reduce((a, l) => a + l.valor, 0), pct = k ? Math.round((abs / totAbs) * 100) : 100;
      const v = valor(rows);
      return `<button type="button" class="fx-card ${cls} ${lf.sit === k ? 'on' : ''}" data-sit="${k}" aria-pressed="${lf.sit === k}">
        <span class="fx-ico">${ico}</span><span class="fx-ring" style="--p:${pct}"><span>${pct}%</span></span>
        <span class="fx-k">${label}</span><span class="fx-v ${ambos && v < 0 ? 'neg' : ''}">${brl(v)}</span><span class="fx-s">${rows.length} lançamento(s) · ${sub}</span></button>`;
    }).join('');
    const rows = grupo(lf.sit);
    const quem = (l) => l.funcionario_nome || l.pessoa_nome || l.socio_nome || '';
    view.querySelector('#lst').innerHTML = table([
      { label: 'Descrição', html: (l) => `<div class="t1">${esc(l.descricao)}</div><div class="t2">${l.tipo === 'entrada' ? '<span class="pos">Entrada</span>' : '<span class="neg">Saída</span>'}${l.conta_fixa_id ? ' · <span class="pill info">Conta fixa</span>' : ''}${l.pago_socio_nome ? ` · pago por ${esc(l.pago_socio_nome)} (${l.pago_socio_modo === 'aporte' ? 'aporte' : 'a restituir'})` : ''}</div>` },
      { label: 'Entidade', html: (l) => (quem(l) ? esc(quem(l)) : '<span class="muted">—</span>') },
      { label: 'Plano de contas', html: (l) => esc(l.categoria || '—') },
      { label: 'Pagamento', html: (l) => `${esc(FORMAS[l.forma] || l.forma || '—')}${l.conta_nome ? `<div class="t2">${esc(l.conta_nome)}</div>` : ''}` },
      { label: 'Data', html: (l) => (l.status === 'pago' ? `${dt(l.data_pagamento)}<div class="t2">venc. ${dt(l.vencimento)}</div>` : dt(l.vencimento)) },
      { label: 'Situação', html: (l) => { const s2 = situacao(l, hoje); return s2 === 'pago' ? pill(l.tipo === 'entrada' ? 'Recebido' : 'Pago', 'ok') : s2 === 'vencido' ? pill('Vencido', 'bad') : s2 === 'hoje' ? pill('Vence hoje', 'warn') : pill(l.tipo === 'entrada' ? 'A receber' : 'A pagar', 'info'); } },
      { label: 'Valor', num: true, html: (l) => `<strong class="${l.tipo === 'entrada' ? 'pos' : 'neg'}">${l.tipo === 'saida' ? '– ' : ''}${brl(l.valor)}</strong>` },
      { label: '', cls: 'nowrap right', html: (l) => `${l.status === 'pendente' ? `<button class="btn sm" data-baixa>${l.tipo === 'entrada' ? 'Receber' : 'Pagar'}</button> ` : `<button class="btn sm ghost" data-estorno>Estornar</button> `}<button class="btn sm ghost" data-ed>Editar</button>${l.custo_id || l.venda_id || l.origem_id || (l.categoria === 'Compra de veículos' && l.veiculo_id) ? '' : ' <button class="btn sm danger" data-rm aria-label="Excluir">×</button>'}` },
    ], rows, { empty: 'Nenhum lançamento com estes filtros.', foot: rows.length ? [`${rows.length} lançamento(s)`, '', '', '', '', '', `<strong class="${valor(rows) < 0 ? 'neg' : ''}">${brl(valor(rows))}</strong>`, ''] : null });
    view.querySelectorAll('#cards [data-sit]').forEach((b) => (b.onclick = () => { lf.sit = lf.sit === b.dataset.sit ? '' : b.dataset.sit; load().catch(fail); }));
    view.querySelectorAll('#lst tbody tr').forEach((tr, i) => {
      const l = rows[i];
      const on = (sel, f) => { const b = tr.querySelector(sel); if (b) b.onclick = f; };
      on('[data-baixa]', () => baixa(l, load).catch(fail));
      on('[data-estorno]', async () => { if (await confirmDlg(l.pago_socio_id ? `Voltar este lançamento para pendente? O que foi gerado pelo pagamento de ${l.pago_socio_nome} (${l.pago_socio_modo === 'aporte' ? 'aporte' : 'restituição'}) também é desfeito.` : 'Voltar este lançamento para pendente?', 'Estornar')) { try { await put('/lancamentos/' + l.id, { status: 'pendente' }); load(); } catch (e) { fail(e); } } });
      on('[data-ed]', () => lancForm(l, load));
      on('[data-rm]', async () => { if (await confirmDlg('Excluir este lançamento?', 'Excluir')) { try { await del('/lancamentos/' + l.id); load(); } catch (e) { fail(e); } } });
    });
  };
  const re = () => load().catch(fail);
  view.querySelectorAll('[data-tipo]').forEach((b) => (b.onclick = () => { lf.tipo = b.dataset.tipo; re(); }));
  pbtn.onclick = (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; pbtn.setAttribute('aria-expanded', String(!menu.hidden)); view.querySelector('#p-custom').hidden = lf.per !== 'custom'; };
  menu.onclick = (e) => e.stopPropagation();
  document.addEventListener('click', fecharMenu);
  view.querySelectorAll('[data-per]').forEach((b) => (b.onclick = () => {
    const k = b.dataset.per;
    if (k === 'custom') { const c = view.querySelector('#p-custom'); c.hidden = false; view.querySelector('#p-de').value = lf.de || periodo().de; view.querySelector('#p-ate').value = lf.ate || periodo().ate; return; }
    Object.assign(lf, k === 'passado' ? { per: 'mes', off: -1 } : k === 'proximo' ? { per: 'mes', off: 1 } : k === 'mes' ? { per: 'mes', off: 0 } : { per: k });
    fecharMenu(); re();
  }));
  view.querySelector('#p-ok').onclick = () => { Object.assign(lf, { per: 'custom', de: view.querySelector('#p-de').value, ate: view.querySelector('#p-ate').value }); fecharMenu(); re(); };
  view.querySelector('#p-prev').onclick = () => { lf.off--; re(); };
  view.querySelector('#p-next').onclick = () => { lf.off++; re(); };
  view.querySelector('#f-tog').onclick = (e) => { lf.filtros = !lf.filtros; view.querySelector('#f-adv').hidden = !lf.filtros; e.currentTarget.setAttribute('aria-expanded', String(lf.filtros)); if (lf.filtros) view.querySelector('#q').focus(); };
  let t;
  view.querySelector('#q').oninput = (e) => { clearTimeout(t); t = setTimeout(() => { lf.q = e.target.value.trim(); re(); }, 250); };
  view.querySelector('#f-cat').onchange = (e) => { lf.cat = e.target.value; re(); };
  view.querySelector('#f-conta').onchange = (e) => { lf.conta = e.target.value; re(); };
  view.querySelector('#f-forma').onchange = (e) => { lf.forma = e.target.value; re(); };
  view.querySelector('#f-limpa').onclick = () => { Object.assign(lf, { q: '', cat: '', conta: '', forma: '', sit: '' }); ['#q', '#f-cat', '#f-conta', '#f-forma'].forEach((sel) => { view.querySelector(sel).value = ''; }); re(); };
  view.querySelector('#nent').onclick = () => lancForm({ tipo: 'entrada' }, load);
  view.querySelector('#nsai').onclick = () => lancForm({ tipo: 'saida' }, load);
  const lr = view.querySelector('#lerrec');
  if (lr) lr.onchange = (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) lerReciboFinanceiro(f, contas, load).catch(fail); };
  await load();
}

// ------------------------------------------------------------------ ler recibo/conta e decidir onde lançar
// A IA lê o documento e sugere: custo de um carro (pela placa ou descrição) ou despesa da loja. O usuário confere e salva.
async function lerReciboFinanceiro(file, contas, onSaved) {
  const espera = modal({ title: 'Lendo o documento…', body: `<p style="margin:0">A IA está lendo <strong>${esc(file.name)}</strong> e procurando o veículo. Isso leva alguns segundos.</p><div class="meter" style="margin-top:14px"><i class="lendo" style="width:40%"></i></div>` });
  let r, veiculos;
  try {
    const fd = new FormData(); fd.append('arquivo', file);
    [r, veiculos] = await Promise.all([api('/recibo/ler?estoque=1', { method: 'POST', body: fd }), get('/veiculos')]);
  } finally { espera.close(); }
  const vlist = veiculos.sort((a, b) => (a.status === 'vendido') - (b.status === 'vendido') || b.id - a.id);
  const vdescr = (v) => `${[v.marca, v.modelo, v.versao].filter(Boolean).join(' ')}${v.placa ? ' · ' + v.placa : ''}${v.status === 'vendido' ? ' (vendido)' : ''}`;
  const tipo0 = r.tipo === 'custo_veiculo' ? 'custo' : 'despesa';
  const padraoConta = (contas.find((c) => c.tipo === 'banco') || contas[0] || {}).id;
  const motivo = r.veiculo ? (r.veiculo_motivo === 'placa' ? `Encontrado pela placa <strong>${esc(r.placa)}</strong> lida no documento.` : 'Identificado pela descrição do documento. Confira se é o carro certo.')
    : r.placa_nao_encontrada ? `A placa <strong>${esc(r.placa)}</strong> lida no documento não está no estoque. Escolha o carro.` : 'Não foi possível identificar o carro. Escolha na lista.';
  modal({
    title: 'Conferir lançamento do documento', size: 'wide', submitLabel: 'Lançar',
    body: `<div class="alert ${r.confianca === 'alta' ? 'info' : ''}" style="margin-bottom:14px">Lido pela IA${r.confianca ? ` (confiança ${r.confianca === 'media' ? 'média' : esc(r.confianca)})` : ''}. <strong>Confira antes de lançar.</strong>${r.observacao ? ' ' + esc(r.observacao) : ''}${r.e_recibo === false ? ' O arquivo não parece ser um recibo ou conta.' : ''}</div>
      <fieldset class="seg-tipo" style="border:0;padding:0;margin:0 0 12px;display:flex;gap:18px;flex-wrap:wrap">
        <legend style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">Onde lançar</legend>
        <label class="check"><input type="radio" name="destino" value="custo" ${tipo0 === 'custo' ? 'checked' : ''}> <strong>Custo de um veículo</strong></label>
        <label class="check"><input type="radio" name="destino" value="despesa" ${tipo0 === 'despesa' ? 'checked' : ''}> <strong>Despesa da loja</strong> (luz, aluguel, internet…)</label>
      </fieldset>
      <div class="form-grid">
        <div class="c12" id="rc-custo">
          <div class="form-grid">
            <label class="c8">Veículo<select name="veiculo_id"><option value="">Escolha o veículo…</option>${vlist.map((v) => `<option value="${v.id}" ${r.veiculo && r.veiculo.id === v.id ? 'selected' : ''}>${esc(vdescr(v))}</option>`).join('')}</select></label>
            ${selectField('Categoria do custo', 'categoria_custo', r.listas.custo, r.categoria, { cls: 'c4' })}
            <p class="hint c12" style="margin-top:-6px">${motivo}</p>
          </div></div>
        <div class="c12" id="rc-despesa">
          <div class="form-grid">${selectField('Categoria da despesa', 'categoria_despesa', r.listas.despesa, r.categoria_despesa, { cls: 'c6' })}</div></div>
        ${field('Descrição', 'descricao', r.descricao, { cls: 'c8', attrs: 'required maxlength="200"' })}
        ${field('Fornecedor', 'fornecedor', r.fornecedor, { cls: 'c4' })}
        ${moneyField('Valor', 'valor', r.valor_total, { cls: 'c4', attrs: 'required' })}
        ${field('Data do documento', 'data', r.data || today(), { type: 'date', cls: 'c4' })}
        ${selectField('Situação', 'situacao', { pago: 'Já pago', pendente: 'A pagar' }, r.ja_pago ? 'pago' : 'pendente', { cls: 'c4' })}
        <div class="c12" id="rc-venc">${field('Vencimento', 'vencimento', r.vencimento || r.data || today(), { type: 'date' })}</div>
        <div class="c12" id="rc-conta"><div class="form-grid">${selectField('Conta', 'conta_id', contas.map((c) => [c.id, c.nome]), padraoConta, { cls: 'c6' })}${selectField('Forma', 'forma', { '': '—', ...FORMAS }, /pix/i.test(r.forma_pagamento || '') ? 'pix' : /dinheiro/i.test(r.forma_pagamento || '') ? 'dinheiro' : /boleto/i.test(r.forma_pagamento || '') ? 'boleto' : /cr[eé]dito/i.test(r.forma_pagamento || '') ? 'cartao_credito' : /d[eé]bito/i.test(r.forma_pagamento || '') ? 'cartao_debito' : '', { cls: 'c6' })}</div></div>
        <label class="check c12" id="rc-anexo"><input type="checkbox" name="guardar_recibo" checked> Guardar o documento (${esc(file.name)}) nos documentos anexados do veículo</label>
      </div>`,
    onOpen: (d) => {
      const sync = () => {
        const custo = d.querySelector('[name=destino]:checked').value === 'custo';
        const pendente = d.querySelector('[name=situacao]').value === 'pendente';
        d.querySelector('#rc-custo').hidden = !custo; d.querySelector('#rc-anexo').hidden = !custo;
        d.querySelector('#rc-despesa').hidden = custo;
        d.querySelector('#rc-venc').hidden = !pendente || custo;
        d.querySelector('#rc-conta').hidden = custo;
      };
      d.querySelectorAll('[name=destino],[name=situacao]').forEach((x) => x.addEventListener('change', sync)); sync();
    },
    onSubmit: async (f) => {
      if (!(Number(f.valor) > 0)) throw new Error('Informe o valor.');
      if (f.destino === 'custo') {
        if (!f.veiculo_id) throw new Error('Escolha o veículo que recebe o custo.');
        await post(`/veiculos/${f.veiculo_id}/custos`, { data: f.data, categoria: f.categoria_custo, valor: f.valor, descricao: f.descricao, fornecedor: f.fornecedor, pago: f.situacao === 'pago' ? 1 : 0 });
        if (f.guardar_recibo) {
          const fd = new FormData();
          fd.append('descricoes', `Recibo: ${f.descricao}${f.fornecedor ? ' – ' + f.fornecedor : ''}`.slice(0, 500));
          fd.append('arquivos', file);
          try { await api(`/veiculos/${f.veiculo_id}/anexos`, { method: 'POST', body: fd }); } catch (e) { toast('Custo lançado, mas o documento não foi anexado: ' + e.message, true); onSaved && onSaved(); return; }
        }
        const v = vlist.find((x) => String(x.id) === String(f.veiculo_id));
        toast(`Custo lançado em ${v ? [v.marca, v.modelo].filter(Boolean).join(' ') : 'veículo'}${f.guardar_recibo ? ' e documento anexado' : ''}.`);
      } else {
        const pago = f.situacao === 'pago';
        await post('/lancamentos', { tipo: 'saida', descricao: f.descricao, categoria: f.categoria_despesa, valor: f.valor, vencimento: pago ? f.data : f.vencimento || f.data, status: pago ? 'pago' : 'pendente', data_pagamento: pago ? f.data : null, conta_id: f.conta_id, forma: f.forma || null, observacoes: f.fornecedor ? `Fornecedor: ${f.fornecedor}` : null });
        toast(pago ? 'Despesa lançada como paga.' : 'Despesa lançada em contas a pagar.');
      }
      onSaved && onSaved();
    },
  });
}
