// Backup do M2 Seminovos: cópia consistente do banco (API de backup do SQLite) + fotos, em um .tar.gz.
// - Guarda as últimas cópias em DATA_DIR/backups (BACKUP_LOCAL, padrão 7)
// - Envia ao Google Drive (ou outro destino do rclone) quando configurado, apagando lá os de mais de BACKUP_DIAS (padrão 30)
// - Roda todo dia em BACKUP_HORA (padrão 03:00, fuso do container) e também sob demanda pelo sistema
//
// Google Drive: BACKUP_GDRIVE_CLIENT_ID / BACKUP_GDRIVE_CLIENT_SECRET (chave própria do Google Cloud) e
// BACKUP_GDRIVE_TOKEN com o JSON gerado por `rclone authorize "drive" <base64 de {client_id,client_secret,scope:"drive.file"}>`
// (escopo drive.file: o sistema só enxerga os arquivos que ele mesmo criou). Passo a passo: docs/BACKUP-GOOGLE-DRIVE.md
// Outros destinos: defina RCLONE_CONFIG_<NOME>_TYPE etc. e BACKUP_RCLONE_REMOTE=<nome em minúsculas>.
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { db, DATA_DIR } = require('./db');

const DIR = path.join(DATA_DIR, 'backups');
const PASTA = process.env.BACKUP_PASTA || 'M2-Backups';
const DIAS = Math.max(1, Number(process.env.BACKUP_DIAS) || 30);
const LOCAL = Math.max(1, Number(process.env.BACKUP_LOCAL) || 7);
const HORA = /^\d{2}:\d{2}$/.test(process.env.BACKUP_HORA || '') ? process.env.BACKUP_HORA : '03:00';
const NOME = /^m2-backup-\d{4}-\d{2}-\d{2}_\d{4}\.tar\.gz$/;

const setS = db.prepare('INSERT INTO settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
const getS = (k) => (db.prepare('SELECT value FROM settings WHERE key=?').get(k) || {}).value;
const pad = (n) => String(n).padStart(2, '0');
const carimbo = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
const run = (cmd, args, env) => new Promise((resolve, reject) => {
  execFile(cmd, args, { env: { ...process.env, ...env }, timeout: 30 * 60e3, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
    if (err) { err.message = (stderr || err.message || '').toString().trim().split('\n').filter((l) => !/NOTICE:/.test(l)).slice(-2).join(' '); return reject(err); }
    resolve(stdout.toString());
  });
});
// erros comuns do rclone em português
function explica(msg) {
  const m = String(msg || '');
  if (/invalid_grant|token expired|couldn't fetch token/i.test(m)) return 'a autorização do Google está inválida ou expirou. Gere o BACKUP_GDRIVE_TOKEN de novo (docs/BACKUP-GOOGLE-DRIVE.md).';
  if (/invalid_client|unauthorized_client/i.test(m)) return 'o Client ID ou o Client Secret do Google não conferem com o token. Gere o token com a mesma chave.';
  if (/storageQuotaExceeded|quota/i.test(m)) return 'o Google Drive está sem espaço.';
  if (/dial tcp|no such host|timeout/i.test(m)) return 'sem conexão com o Google Drive no momento. Vai tentar de novo no próximo backup.';
  return m.replace(/^\S+ \S+ (ERROR|CRITICAL) *: */, '').slice(0, 400);
}
const RCLONE_FLAGS = ['--log-level', 'ERROR'];

// destino remoto (rclone)
function remoto() {
  if (process.env.BACKUP_GDRIVE_TOKEN) {
    const env = { RCLONE_CONFIG_GDRIVE_TYPE: 'drive', RCLONE_CONFIG_GDRIVE_SCOPE: 'drive.file', RCLONE_CONFIG_GDRIVE_TOKEN: process.env.BACKUP_GDRIVE_TOKEN };
    // chave própria do Google Cloud (a chave compartilhada do rclone está sendo desativada pelo Google)
    if (process.env.BACKUP_GDRIVE_CLIENT_ID) env.RCLONE_CONFIG_GDRIVE_CLIENT_ID = process.env.BACKUP_GDRIVE_CLIENT_ID;
    if (process.env.BACKUP_GDRIVE_CLIENT_SECRET) env.RCLONE_CONFIG_GDRIVE_CLIENT_SECRET = process.env.BACKUP_GDRIVE_CLIENT_SECRET;
    return { nome: 'gdrive', rotulo: 'Google Drive', env };
  }
  const n = String(process.env.BACKUP_RCLONE_REMOTE || '').toLowerCase();
  if (n && process.env[`RCLONE_CONFIG_${n.toUpperCase()}_TYPE`]) return { nome: n, rotulo: process.env.BACKUP_RCLONE_ROTULO || n, env: {} };
  return null;
}

function listar() {
  if (!fs.existsSync(DIR)) return [];
  return fs.readdirSync(DIR).filter((f) => NOME.test(f)).sort().reverse()
    .map((f) => { const st = fs.statSync(path.join(DIR, f)); return { arquivo: f, tamanho: st.size, criado_em: st.mtime.toISOString() }; });
}

let rodando = null;
async function fazerBackup(origem = 'manual') {
  if (rodando) return rodando; // evita dois backups ao mesmo tempo
  rodando = (async () => {
    const inicio = Date.now();
    const nome = `m2-backup-${carimbo()}.tar.gz`;
    const tmp = fs.mkdtempSync(path.join(DATA_DIR, '.bkp-'));
    const status = { data: new Date().toISOString(), origem, arquivo: nome, tamanho: 0, local: 'erro', remoto: 'desligado', mensagem: '' };
    try {
      fs.mkdirSync(DIR, { recursive: true });
      await db.backup(path.join(tmp, 'm2.db')); // cópia consistente mesmo com o sistema em uso
      fs.writeFileSync(path.join(tmp, 'LEIA-ME.txt'), `Backup do M2 Seminovos – ${new Date().toLocaleString('pt-BR')}\n\nConteúdo: m2.db (banco) e uploads/ (fotos).\nPara restaurar: pare o sistema, copie m2.db e a pasta uploads/ para o volume de dados (apague m2.db-wal e m2.db-shm se existirem) e inicie de novo.\n`);
      const args = ['-czf', path.join(DIR, nome), '-C', tmp, 'm2.db', 'LEIA-ME.txt'];
      if (fs.existsSync(path.join(DATA_DIR, 'uploads'))) args.push('-C', DATA_DIR, 'uploads');
      await run('tar', args);
      status.tamanho = fs.statSync(path.join(DIR, nome)).size;
      status.local = 'ok';
      // mantém só as últimas cópias locais
      listar().slice(LOCAL).forEach((b) => fs.rmSync(path.join(DIR, b.arquivo), { force: true }));
      const r = remoto();
      if (r) {
        try {
          await run('rclone', ['copy', path.join(DIR, nome), `${r.nome}:${PASTA}`, '--retries', '3', ...RCLONE_FLAGS], r.env);
          status.remoto = 'ok';
          // limpeza no destino: só os arquivos de backup do próprio sistema, mais antigos que BACKUP_DIAS
          await run('rclone', ['delete', `${r.nome}:${PASTA}`, '--min-age', `${DIAS}d`, '--include', 'm2-backup-*.tar.gz', ...RCLONE_FLAGS], r.env).catch(() => {});
        } catch (e) {
          status.remoto = 'erro';
          status.mensagem = `Não foi possível enviar para ${r.rotulo}: ${e.code === 'ENOENT' ? 'rclone não está instalado neste servidor.' : explica(e.message)}`;
        }
      }
    } catch (e) {
      status.mensagem = `Falha ao gerar o backup: ${e.message}`;
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
      status.duracao_s = Math.round((Date.now() - inicio) / 100) / 10;
      setS.run('backup_ultimo', JSON.stringify(status));
      if (status.local === 'ok' && (status.remoto !== 'erro')) setS.run('backup_ultimo_ok', status.data);
      console.log(`[M2] Backup ${status.local === 'ok' ? 'gerado' : 'FALHOU'}: ${nome}${status.remoto !== 'desligado' ? ' · remoto: ' + status.remoto : ''}${status.mensagem ? ' · ' + status.mensagem : ''}`);
      rodando = null;
    }
    return status;
  })();
  return rodando;
}

// agenda: confere a cada minuto se chegou a hora e se ainda não rodou hoje
function agendar() {
  if (process.env.BACKUP_AUTOMATICO === '0') return;
  setInterval(() => {
    const d = new Date();
    const hoje = carimbo(d).slice(0, 10);
    if (`${pad(d.getHours())}:${pad(d.getMinutes())}` === HORA && getS('backup_dia') !== hoje) {
      setS.run('backup_dia', hoje);
      fazerBackup('automático').catch(() => {});
    }
  }, 60e3).unref();
}

function rotas(api, can) {
  // só administradores: o backup contém todos os dados, inclusive senhas criptografadas e tokens
  api.get('/backup', can('usuarios'), (req, res) => {
    const r = remoto();
    let ultimo = null; try { ultimo = JSON.parse(getS('backup_ultimo') || 'null'); } catch (e) { /* */ }
    res.json({ arquivos: listar(), ultimo, ultimo_ok: getS('backup_ultimo_ok') || null, rodando: !!rodando,
      config: { hora: HORA, dias_remoto: DIAS, copias_locais: LOCAL, pasta: PASTA, remoto: r ? r.rotulo : null, automatico: process.env.BACKUP_AUTOMATICO !== '0' } });
  });
  api.post('/backup/agora', can('usuarios'), async (req, res) => res.json(await fazerBackup('manual')));
  api.get('/backup/baixar/:arquivo', can('usuarios'), (req, res) => {
    const f = String(req.params.arquivo);
    if (!NOME.test(f) || !fs.existsSync(path.join(DIR, f))) return res.status(404).json({ error: 'Backup não encontrado.' });
    res.download(path.join(DIR, f), f);
  });
}

module.exports = { fazerBackup, agendar, rotas, listar };
