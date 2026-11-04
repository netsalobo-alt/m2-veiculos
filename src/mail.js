const nodemailer = require('nodemailer');
const { getSettings } = require('./db');

async function sendMail({ to, subject, text, html, attachments }) {
  const s = getSettings();
  if (!s.smtp_host || !s.smtp_user) {
    const e = new Error('E-mail não configurado. Preencha os dados SMTP em Configurações › E-mail.');
    e.status = 400; e.publicMessage = e.message; throw e;
  }
  if (!to) { const e = new Error('Informe o e-mail do destinatário.'); e.status = 400; e.publicMessage = e.message; throw e; }
  const transport = nodemailer.createTransport({
    host: s.smtp_host,
    port: Number(s.smtp_port) || 587,
    secure: s.smtp_secure === '1',
    auth: { user: s.smtp_user, pass: s.smtp_pass },
  });
  try {
    return await transport.sendMail({ from: s.smtp_from || `${s.empresa_nome} <${s.smtp_user}>`, to, subject, text, html, attachments });
  } catch (err) {
    const e = new Error(`Falha ao enviar e-mail: ${err.message}`); e.status = 502; e.publicMessage = e.message; throw e;
  }
}
module.exports = { sendMail };
