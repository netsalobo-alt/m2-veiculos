const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const { DEFAULT_TEMPLATES } = require('./templates-default');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(path.join(DATA_DIR, 'uploads'), { recursive: true });

const db = new Database(path.join(DATA_DIR, 'm2.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  nome TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  senha_hash TEXT NOT NULL,
  perfil TEXT NOT NULL DEFAULT 'vendedor',
  telefone TEXT,
  comissao_pct REAL DEFAULT 0,
  ativo INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expira_em TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);

CREATE TABLE IF NOT EXISTS pessoas (
  id INTEGER PRIMARY KEY,
  tipo_pessoa TEXT DEFAULT 'PF',
  nome TEXT NOT NULL,
  cpf_cnpj TEXT, rg TEXT, nascimento TEXT, profissao TEXT, estado_civil TEXT,
  telefone TEXT, email TEXT,
  cep TEXT, endereco TEXT, numero TEXT, complemento TEXT, bairro TEXT, cidade TEXT, uf TEXT,
  observacoes TEXT,
  criado_em TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS veiculos (
  id INTEGER PRIMARY KEY,
  categoria TEXT NOT NULL DEFAULT 'carro',
  marca TEXT, modelo TEXT, versao TEXT,
  ano_fab INTEGER, ano_mod INTEGER,
  placa TEXT, renavam TEXT, chassi TEXT, cor TEXT,
  km INTEGER, combustivel TEXT, cambio TEXT, portas INTEGER, motor TEXT,
  autonomia TEXT, bateria TEXT,
  opcionais TEXT, descricao TEXT,
  data_entrada TEXT, fornecedor_id INTEGER REFERENCES pessoas(id),
  origem TEXT DEFAULT 'compra',
  valor_compra REAL DEFAULT 0, compra_pago INTEGER DEFAULT 1, forma_pagamento_compra TEXT,
  preco_venda REAL DEFAULT 0, preco_minimo REAL DEFAULT 0,
  fipe_tipo TEXT, fipe_marca TEXT, fipe_modelo TEXT, fipe_ano TEXT,
  fipe_codigo TEXT, fipe_valor REAL, fipe_referencia TEXT, fipe_atualizado_em TEXT,
  status TEXT NOT NULL DEFAULT 'preparacao',
  publicado INTEGER DEFAULT 0, destaque INTEGER DEFAULT 0,
  data_venda TEXT,
  criado_em TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS veiculo_fotos (
  id INTEGER PRIMARY KEY,
  veiculo_id INTEGER NOT NULL REFERENCES veiculos(id) ON DELETE CASCADE,
  arquivo TEXT NOT NULL, ordem INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS veiculo_custos (
  id INTEGER PRIMARY KEY,
  veiculo_id INTEGER NOT NULL REFERENCES veiculos(id) ON DELETE CASCADE,
  data TEXT, categoria TEXT, descricao TEXT, fornecedor TEXT,
  valor REAL NOT NULL DEFAULT 0,
  criado_em TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS fipe_historico (
  id INTEGER PRIMARY KEY,
  veiculo_id INTEGER NOT NULL REFERENCES veiculos(id) ON DELETE CASCADE,
  data TEXT DEFAULT (datetime('now','localtime')), valor REAL, referencia TEXT, origem TEXT
);
CREATE TABLE IF NOT EXISTS placa_consultas (
  placa TEXT PRIMARY KEY, resposta TEXT NOT NULL,
  consultado_em TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS vendas (
  id INTEGER PRIMARY KEY,
  veiculo_id INTEGER NOT NULL REFERENCES veiculos(id),
  cliente_id INTEGER NOT NULL REFERENCES pessoas(id),
  vendedor_id INTEGER REFERENCES users(id),
  data_venda TEXT NOT NULL,
  valor_venda REAL NOT NULL,
  valor_troca REAL DEFAULT 0, veiculo_troca_id INTEGER REFERENCES veiculos(id),
  financeira TEXT,
  comissao_valor REAL DEFAULT 0,
  garantia_dias INTEGER DEFAULT 90,
  observacoes TEXT,
  status TEXT NOT NULL DEFAULT 'concluida',
  criado_em TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS venda_pagamentos (
  id INTEGER PRIMARY KEY,
  venda_id INTEGER NOT NULL REFERENCES vendas(id) ON DELETE CASCADE,
  forma TEXT NOT NULL, valor REAL NOT NULL, vencimento TEXT, pago INTEGER DEFAULT 0,
  descricao TEXT
);

CREATE TABLE IF NOT EXISTS contas (
  id INTEGER PRIMARY KEY, nome TEXT NOT NULL, tipo TEXT DEFAULT 'banco',
  saldo_inicial REAL DEFAULT 0, ativo INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS lancamentos (
  id INTEGER PRIMARY KEY,
  tipo TEXT NOT NULL CHECK (tipo IN ('entrada','saida')),
  descricao TEXT NOT NULL, categoria TEXT,
  valor REAL NOT NULL,
  vencimento TEXT NOT NULL, data_pagamento TEXT,
  status TEXT NOT NULL DEFAULT 'pendente',
  conta_id INTEGER REFERENCES contas(id),
  forma TEXT,
  veiculo_id INTEGER REFERENCES veiculos(id) ON DELETE SET NULL,
  venda_id INTEGER REFERENCES vendas(id) ON DELETE SET NULL,
  pessoa_id INTEGER REFERENCES pessoas(id) ON DELETE SET NULL,
  custo_id INTEGER REFERENCES veiculo_custos(id) ON DELETE CASCADE,
  observacoes TEXT,
  criado_por INTEGER REFERENCES users(id),
  criado_em TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS modelos (
  id INTEGER PRIMARY KEY, nome TEXT NOT NULL, tipo TEXT NOT NULL,
  conteudo TEXT NOT NULL, ativo INTEGER DEFAULT 1,
  atualizado_em TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS documentos (
  id INTEGER PRIMARY KEY,
  modelo_id INTEGER REFERENCES modelos(id) ON DELETE SET NULL,
  tipo TEXT, titulo TEXT NOT NULL,
  venda_id INTEGER REFERENCES vendas(id) ON DELETE SET NULL,
  veiculo_id INTEGER REFERENCES veiculos(id) ON DELETE SET NULL,
  pessoa_id INTEGER REFERENCES pessoas(id) ON DELETE SET NULL,
  conteudo TEXT NOT NULL,
  token TEXT UNIQUE,
  status TEXT DEFAULT 'gerado',
  enviado_email_em TEXT, enviado_whatsapp_em TEXT,
  assinado_em TEXT, assinatura_nome TEXT, assinatura_doc TEXT, assinatura_img TEXT,
  assinatura_ip TEXT, assinatura_hash TEXT,
  criado_por INTEGER REFERENCES users(id),
  criado_em TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY, tipo TEXT DEFAULT 'interesse',
  nome TEXT, telefone TEXT, email TEXT, mensagem TEXT,
  veiculo_id INTEGER REFERENCES veiculos(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'novo',
  criado_em TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS ix_lanc_venc ON lancamentos(vencimento);
CREATE INDEX IF NOT EXISTS ix_veic_status ON veiculos(status);
`);

// ---------- sócios e capital por veículo ----------
db.exec(`
CREATE TABLE IF NOT EXISTS socios (
  id INTEGER PRIMARY KEY,
  nome TEXT NOT NULL, cpf_cnpj TEXT, telefone TEXT, email TEXT, pix TEXT, observacoes TEXT,
  loja INTEGER NOT NULL DEFAULT 0,          -- 1 = "Caixa da loja" (capital da própria empresa)
  ativo INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS veiculo_aportes (
  id INTEGER PRIMARY KEY,
  veiculo_id INTEGER NOT NULL REFERENCES veiculos(id) ON DELETE CASCADE,
  socio_id INTEGER NOT NULL REFERENCES socios(id),
  referente TEXT NOT NULL DEFAULT 'compra',  -- compra | custo | outro
  custo_id INTEGER REFERENCES veiculo_custos(id) ON DELETE CASCADE,
  valor REAL NOT NULL, data TEXT, descricao TEXT,
  criado_por INTEGER REFERENCES users(id),
  criado_em TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS ix_aportes_veic ON veiculo_aportes(veiculo_id);
CREATE INDEX IF NOT EXISTS ix_aportes_socio ON veiculo_aportes(socio_id);
`);
// colunas novas no caixa: de qual sócio é o lançamento e de qual aporte ele nasceu
const colsLanc = db.prepare('PRAGMA table_info(lancamentos)').all().map((c) => c.name);
if (!colsLanc.includes('socio_id')) db.exec('ALTER TABLE lancamentos ADD COLUMN socio_id INTEGER REFERENCES socios(id)');
if (!colsLanc.includes('aporte_id')) db.exec('ALTER TABLE lancamentos ADD COLUMN aporte_id INTEGER REFERENCES veiculo_aportes(id) ON DELETE CASCADE');
// conta paga com dinheiro de um sócio: quem pagou, como trata (aporte | restituir) e o vínculo dos lançamentos gerados
if (!colsLanc.includes('pago_socio_id')) db.exec('ALTER TABLE lancamentos ADD COLUMN pago_socio_id INTEGER REFERENCES socios(id)');
if (!colsLanc.includes('pago_socio_modo')) db.exec('ALTER TABLE lancamentos ADD COLUMN pago_socio_modo TEXT');
if (!colsLanc.includes('origem_id')) db.exec('ALTER TABLE lancamentos ADD COLUMN origem_id INTEGER REFERENCES lancamentos(id) ON DELETE CASCADE');
const colsAp = db.prepare('PRAGMA table_info(veiculo_aportes)').all().map((c) => c.name);
if (!colsAp.includes('lancamento_id')) db.exec('ALTER TABLE veiculo_aportes ADD COLUMN lancamento_id INTEGER REFERENCES lancamentos(id) ON DELETE CASCADE');
if (!db.prepare('SELECT 1 FROM socios WHERE loja=1').get()) db.prepare("INSERT INTO socios(nome,loja) VALUES ('Caixa da loja',1)").run();

// ---------- seed básico ----------
const DEFAULT_SETTINGS = {
  empresa_nome: 'M2 Seminovos',
  razao_social: '',
  cnpj: '',
  ie: '',
  endereco: '',
  cidade: '',
  uf: '',
  cep: '',
  telefone: '',
  whatsapp: '',
  email: '',
  horario: 'Seg a Sex 8h às 18h · Sáb 8h às 13h',
  sobre: 'A M2 Seminovos vende carros, motos e bikes elétricas seminovos com atendimento próximo, claro e confiável.',
  site_url: '',
  smtp_host: '', smtp_port: '587', smtp_secure: '0', smtp_user: '', smtp_pass: '', smtp_from: '',
  garantia_padrao_dias: '90',
  foro: '',
  fipe_token: '',
};
const insSetting = db.prepare('INSERT OR IGNORE INTO settings(key,value) VALUES (?,?)');
for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) insSetting.run(k, v);

if (!db.prepare('SELECT 1 FROM users LIMIT 1').get()) {
  const email = process.env.ADMIN_EMAIL || 'admin@m2seminovos.com.br';
  const senha = process.env.ADMIN_PASSWORD || 'm2admin123';
  db.prepare('INSERT INTO users(nome,email,senha_hash,perfil) VALUES (?,?,?,?)')
    .run('Administrador', email, bcrypt.hashSync(senha, 10), 'admin');
  console.log(`[M2] Usuário admin criado: ${email} / ${senha} (troque a senha após o primeiro acesso)`);
}
if (!db.prepare('SELECT 1 FROM contas LIMIT 1').get()) {
  db.prepare("INSERT INTO contas(nome,tipo,saldo_inicial) VALUES ('Caixa da loja','caixa',0),('Conta bancária','banco',0)").run();
}
if (!db.prepare('SELECT 1 FROM modelos LIMIT 1').get()) {
  const ins = db.prepare('INSERT INTO modelos(nome,tipo,conteudo) VALUES (?,?,?)');
  for (const t of DEFAULT_TEMPLATES) ins.run(t.nome, t.tipo, t.conteudo);
}

// conta padrão de todos os lançamentos automáticos e dos formulários: a primeira conta bancária ativa (ou a primeira ativa)
function contaPadrao() {
  const r = db.prepare("SELECT id FROM contas WHERE ativo=1 AND tipo='banco' ORDER BY id LIMIT 1").get() || db.prepare('SELECT id FROM contas WHERE ativo=1 ORDER BY id LIMIT 1').get();
  return r ? r.id : null;
}

function getSettings() {
  const o = {};
  for (const r of db.prepare('SELECT key,value FROM settings').all()) o[r.key] = r.value;
  return o;
}

// ajuste único (v1): entradas de aporte de sócio que caíram numa conta diferente da saída que cobrem
// (antes, custos iam para a primeira conta e aportes para a conta bancária). Move cada uma para a conta da
// sua saída; o saldo total não muda. Guarda uma cópia do banco antes, em backups/.
(function ajusteContasAportes() {
  if (db.prepare("SELECT 1 FROM settings WHERE key='ajuste_contas_aportes_v1'").get()) return;
  const alvo = db.prepare(`SELECT l.id, l.conta_id atual, COALESCE(
      (SELECT x.conta_id FROM lancamentos x WHERE a.custo_id IS NOT NULL AND x.custo_id=a.custo_id),
      (SELECT x.conta_id FROM lancamentos x WHERE a.lancamento_id IS NOT NULL AND x.id=a.lancamento_id),
      (SELECT x.conta_id FROM lancamentos x WHERE a.referente='compra' AND x.veiculo_id=a.veiculo_id AND x.categoria='Compra de veículos' AND x.venda_id IS NULL LIMIT 1)
    ) nova
    FROM lancamentos l JOIN veiculo_aportes a ON a.id=l.aporte_id`).all().filter((r) => r.nova && r.nova !== r.atual);
  if (alvo.length) {
    try {
      const dir = require('path').join(DATA_DIR, 'backups');
      require('fs').mkdirSync(dir, { recursive: true });
      const arq = require('path').join(dir, `antes-ajuste-contas-${new Date().toISOString().slice(0, 10)}.db`);
      if (!require('fs').existsSync(arq)) db.exec(`VACUUM INTO '${arq.replace(/'/g, "''")}'`);
    } catch (e) { console.error('[M2] Não foi possível copiar o banco antes do ajuste de contas:', e.message); return; }
    const up = db.prepare('UPDATE lancamentos SET conta_id=? WHERE id=?');
    db.transaction(() => alvo.forEach((r) => up.run(r.nova, r.id)))();
  }
  db.prepare("INSERT INTO settings(key,value) VALUES ('ajuste_contas_aportes_v1',?)").run(`${new Date().toISOString()} · ${alvo.length} lançamento(s) movido(s)`);
  if (alvo.length) console.log(`[M2] Ajuste de contas: ${alvo.length} entrada(s) de aporte movida(s) para a conta da saída correspondente.`);
})();

module.exports = { db, DATA_DIR, getSettings, contaPadrao };
