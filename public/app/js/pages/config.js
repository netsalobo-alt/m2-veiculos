import { get, put, post, esc, toast, fail, field, selectField, areaField, modal } from '../core.js';
import { setCrumbs } from '../main.js';

export async function render(view) {
  setCrumbs('Configurações');
  const s = await get('/config');
  view.innerHTML = `<div class="ph"><div><p class="eyebrow">ADMINISTRAÇÃO</p><h1>Configurações</h1><p>Dados da loja (usados no site, contratos e recibos) e envio de e-mails.</p></div></div>
  <form id="f" novalidate class="stack">
    <section class="card"><h2>Dados da empresa</h2><div class="form-grid">
      ${field('Nome fantasia', 'empresa_nome', s.empresa_nome, { cls: 'c4' })}${field('Razão social', 'razao_social', s.razao_social, { cls: 'c5', attrs: 'style=""' })}${field('CNPJ', 'cnpj', s.cnpj, { cls: 'c3' })}
      ${field('Inscrição estadual', 'ie', s.ie, { cls: 'c3' })}${field('Endereço completo', 'endereco', s.endereco, { cls: 'c6', attrs: 'placeholder="Rua, número, bairro"' })}${field('CEP', 'cep', s.cep, { cls: 'c3' })}
      ${field('Cidade', 'cidade', s.cidade, { cls: 'c4' })}${field('UF', 'uf', s.uf, { cls: 'c2', attrs: 'maxlength="2"' })}${field('Foro (comarca) dos contratos', 'foro', s.foro, { cls: 'c6', attrs: 'placeholder="Ex.: São Paulo/SP"' })}
      ${field('Telefone', 'telefone', s.telefone, { cls: 'c4' })}${field('WhatsApp da loja', 'whatsapp', s.whatsapp, { cls: 'c4', hint: 'Usado nos botões do site.' })}${field('E-mail', 'email', s.email, { type: 'email', cls: 'c4' })}
      ${field('Horário de atendimento', 'horario', s.horario, { cls: 'c6' })}${field('Garantia padrão (dias)', 'garantia_padrao_dias', s.garantia_padrao_dias, { type: 'number', cls: 'c3' })}
      ${field('Endereço público do sistema', 'site_url', s.site_url, { cls: 'c12', attrs: 'placeholder="https://www.m2seminovos.com.br"', hint: 'Base dos links de assinatura enviados por WhatsApp e e-mail. Deixe em branco para usar o endereço atual.' })}
      ${areaField('Sobre a loja (site)', 'sobre', s.sobre, { rows: 3 })}</div></section>
    <section class="card"><h2>E-mail (SMTP)</h2><p class="muted" style="margin:-6px 0 4px">Necessário para enviar contratos e recibos por e-mail. Ex.: Gmail (smtp.gmail.com, porta 465, senha de app), Outlook, Zoho ou o SMTP da sua hospedagem.</p><div class="form-grid">
      ${field('Servidor SMTP', 'smtp_host', s.smtp_host, { cls: 'c4' })}${field('Porta', 'smtp_port', s.smtp_port, { cls: 'c2' })}${selectField('Conexão segura (SSL)', 'smtp_secure', { 0: 'Não (STARTTLS / 587)', 1: 'Sim (SSL / 465)' }, s.smtp_secure, { cls: 'c3' })}
      ${field('Usuário', 'smtp_user', s.smtp_user, { cls: 'c3', attrs: 'autocomplete="off"' })}${field('Senha', 'smtp_pass', s.smtp_pass, { type: 'password', cls: 'c4', attrs: 'autocomplete="new-password"' })}${field('Remetente', 'smtp_from', s.smtp_from, { cls: 'c5', attrs: 'placeholder="M2 Seminovos <contato@m2seminovos.com.br>"' })}
      <div class="c3" style="display:flex;align-items:end"><button type="button" class="btn ghost full" id="teste">Enviar e-mail de teste</button></div></div></section>
    <div class="form-actions"><button class="btn" type="submit">Salvar configurações</button></div>
  </form>`;
  const f = view.querySelector('#f');
  const data = () => Object.fromEntries([...f.querySelectorAll('[name]')].map((e) => [e.name, e.value]));
  f.onsubmit = async (e) => { e.preventDefault(); try { await put('/config', data()); toast('Configurações salvas.'); } catch (err) { fail(err); } };
  view.querySelector('#teste').onclick = () => modal({
    title: 'Testar e-mail', body: field('Enviar para', 'to', s.email, { type: 'email' }), submitLabel: 'Enviar teste',
    onSubmit: async (d) => { await put('/config', data()); await post('/config/testar-email', d); toast('E-mail de teste enviado.'); },
  });
}
