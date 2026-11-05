import { get, put, post, esc, toast, fail, field, selectField, areaField, modal, confirmDlg, can, pill, dth, icon } from '../core.js';

const tam = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const quando = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '–');

// cartão de backup (só administradores)
async function backupCard(view) {
  const box = view.querySelector('#bkp-body'); if (!box) return;
  const b = await get('/backup');
  const u = b.ultimo;
  const okRemoto = u && u.remoto === 'ok', erro = u && (u.local !== 'ok' || u.remoto === 'erro');
  view.querySelector('#bkp-pill').innerHTML = !u ? pill('Nenhum backup ainda', 'warn') : erro ? pill('Último backup com erro', 'bad') : pill(okRemoto ? `Ok · enviado ao ${b.config.remoto}` : 'Ok · só no servidor', okRemoto ? 'ok' : 'warn');
  box.innerHTML = `<p class="muted" style="margin:-6px 0 10px">Cópia do banco e das fotos ${b.config.automatico ? `feita sozinha todo dia às <strong>${esc(b.config.hora)}</strong>` : '(automático desligado)'}.
      ${b.config.remoto ? `Enviada para <strong>${esc(b.config.remoto)}</strong>, pasta <strong>${esc(b.config.pasta)}</strong>, que guarda os últimos ${b.config.dias_remoto} dias.` : 'Nenhum destino externo configurado: as cópias ficam só no servidor. Veja em docs/BACKUP-GOOGLE-DRIVE.md como enviar ao Google Drive.'}
      O servidor guarda as últimas ${b.config.copias_locais} cópias.</p>
    ${u ? `<div class="kv"><span>Último backup</span><strong>${quando(u.data)} · ${esc(u.origem)}${u.tamanho ? ' · ' + tam(u.tamanho) : ''}</strong></div>
      <div class="kv"><span>${esc(b.config.remoto || 'Destino externo')}</span><strong>${u.remoto === 'ok' ? '✓ enviado' : u.remoto === 'erro' ? '✗ falhou' : 'não configurado'}</strong></div>` : ''}
    ${u && u.mensagem ? `<div class="alert" style="margin-top:10px">${esc(u.mensagem)}</div>` : ''}
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin:14px 0 6px"><button type="button" class="btn" id="bkp-now">${icon('refresh')}Fazer backup agora</button></div>
    ${b.arquivos.length ? `<div class="tbl-wrap" style="margin-top:10px"><table class="tbl"><thead><tr><th>Cópias no servidor</th><th class="num">Tamanho</th><th></th></tr></thead><tbody>
      ${b.arquivos.map((a) => `<tr><td>${quando(a.criado_em)}<div class="t2">${esc(a.arquivo)}</div></td><td class="num">${tam(a.tamanho)}</td><td class="right"><a class="btn sm ghost" href="/api/backup/baixar/${encodeURIComponent(a.arquivo)}">${icon('pdf')}Baixar</a></td></tr>`).join('')}
      </tbody></table></div>` : ''}`;
  const bt = box.querySelector('#bkp-now');
  bt.onclick = async () => {
    bt.disabled = true; bt.textContent = 'Fazendo backup…';
    try {
      const r = await post('/backup/agora');
      if (r.local !== 'ok' || r.remoto === 'erro') toast(r.mensagem || 'O backup teve um problema.', true);
      else toast(r.remoto === 'ok' ? 'Backup feito e enviado.' : 'Backup feito no servidor.');
    } catch (e) { fail(e); }
    backupCard(view).catch(fail);
  };
}
import { setCrumbs } from '../main.js';

const OLX_MSG = {
  ok: ['Conta da OLX conectada com sucesso.', false], negado: ['A conexão foi cancelada na OLX.', true], invalido: ['A conexão com a OLX expirou. Clique em "Conectar com a OLX" de novo.', true],
  falhou: ['A OLX não confirmou a conexão. Confira o Client ID e o Client Secret e tente de novo.', true], sem_chaves: ['Preencha e salve o Client ID e o Client Secret antes de conectar.', true],
};

export async function render(view, { params = {} } = {}) {
  setCrumbs('Configurações');
  const [s, olx] = await Promise.all([get('/config'), get('/olx/status').catch(() => ({}))]);
  if (OLX_MSG[params.olx]) { toast(...OLX_MSG[params.olx]); history.replaceState(null, '', '#/config'); }
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
    <section class="card"><h2>FIPE API (consulta por placa)</h2><p class="muted" style="margin:-6px 0 4px">Token da FIPE API (fipe.parallelum.com.br), usado no botão "Buscar placa" do cadastro de veículos. Placas já consultadas ficam guardadas e não gastam cota de novo.</p><div class="form-grid">
      ${field('Token de acesso', 'fipe_token', s.fipe_token, { type: 'password', cls: 'c8', attrs: 'autocomplete="off"', hint: s.fipe_token ? 'Token configurado. Para trocar, apague e cole o novo.' : 'Nenhum token configurado.' })}</div></section>
    <section class="card" id="olx"><div class="card-h"><h2>OLX (anúncios automáticos)</h2>${olx.conectado ? '<span class="pill ok">Conectada</span>' : olx.configurado ? '<span class="pill warn">Não conectada</span>' : '<span class="pill">Não configurada</span>'}</div>
      <p class="muted" style="margin:-6px 0 4px">Publica os veículos do estoque na OLX pela API oficial. Exige plano profissional na OLX e as chaves de integrador, que a OLX envia após o cadastro pelo e-mail <strong>suporteintegrador@olxbr.com</strong>.</p>
      ${olx.conectado ? `<div class="alert" style="margin:10px 0;background:var(--ok-soft);color:var(--ok)">Conta conectada${olx.conta ? `: <strong>${esc(olx.conta)}</strong>` : ''}${olx.conectado_em ? ` · desde ${esc(olx.conectado_em.slice(8, 10) + '/' + olx.conectado_em.slice(5, 7) + '/' + olx.conectado_em.slice(0, 4))}` : ''}.</div>` : ''}
      ${!olx.site_publico ? '<div class="alert" style="margin:10px 0">Para a OLX baixar as fotos, preencha acima o <strong>Endereço público do sistema</strong> (com https) quando o sistema estiver na internet.</div>' : ''}
      <div class="form-grid">
      ${field('Client ID', 'olx_client_id', s.olx_client_id, { cls: 'c6', attrs: 'autocomplete="off"' })}${field('Client Secret (chave de segurança)', 'olx_client_secret', s.olx_client_secret, { type: 'password', cls: 'c6', attrs: 'autocomplete="new-password"' })}
      ${field('CEP dos anúncios', 'olx_cep', s.olx_cep, { cls: 'c3', attrs: 'inputmode="numeric" maxlength="9" placeholder="00000-000"', hint: 'Em branco, usa o CEP da empresa.' })}
      ${field('Telefone dos anúncios', 'olx_telefone', s.olx_telefone, { cls: 'c3', attrs: 'inputmode="tel" placeholder="(11) 90000-0000"', hint: 'Em branco, usa o WhatsApp da loja.' })}
      <div class="c6"><span style="display:block;font-weight:600;font-size:14px;margin:14px 0 6px">Endereço de retorno (informe à OLX no cadastro)</span>
        <code style="display:block;padding:10px 12px;border:1px solid var(--line);border-radius:9px;background:var(--bg);word-break:break-all;font-size:13px">${esc(olx.redirect_uri || '')}</code></div>
      <div class="c12" style="display:flex;gap:10px;flex-wrap:wrap;margin-top:16px">
        <button type="button" class="btn" id="olx-con">${olx.conectado ? 'Reconectar com a OLX' : 'Conectar com a OLX'}</button>
        ${olx.conectado ? '<button type="button" class="btn ghost" id="olx-des">Desconectar</button>' : ''}
      </div></div></section>
    ${can('usuarios') ? '<section class="card" id="bkp"><div class="card-h"><h2>Backup</h2><span id="bkp-pill"></span></div><div id="bkp-body"><div class="empty" style="padding:16px">Carregando…</div></div></section>' : ''}
    <div class="form-actions"><button class="btn" type="submit">Salvar configurações</button></div>
  </form>`;
  const f = view.querySelector('#f');
  const data = () => Object.fromEntries([...f.querySelectorAll('[name]')].map((e) => [e.name, e.value]));
  f.onsubmit = async (e) => { e.preventDefault(); try { await put('/config', data()); toast('Configurações salvas.'); } catch (err) { fail(err); } };
  // salva as chaves e vai para o login oficial da OLX (que volta para /api/olx/retorno)
  view.querySelector('#olx-con').onclick = async () => {
    const d = data();
    if (!d.olx_client_id || !d.olx_client_secret) { toast('Preencha o Client ID e o Client Secret enviados pela OLX.', true); return; }
    try { await put('/config', d); location.href = '/api/olx/conectar'; } catch (err) { fail(err); }
  };
  if (can('usuarios')) backupCard(view).catch(fail);
  const des = view.querySelector('#olx-des');
  if (des) des.onclick = async () => { if (await confirmDlg('Desconectar a conta da OLX? Os anúncios já publicados continuam na OLX.', 'Desconectar')) { await post('/olx/desconectar'); toast('Conta da OLX desconectada.'); render(view, {}); } };
  view.querySelector('#teste').onclick = () => modal({
    title: 'Testar e-mail', body: field('Enviar para', 'to', s.email, { type: 'email' }), submitLabel: 'Enviar teste',
    onSubmit: async (d) => { await put('/config', data()); await post('/config/testar-email', d); toast('E-mail de teste enviado.'); },
  });
}
