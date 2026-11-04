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

function getSettings() {
  const o = {};
  for (const r of db.prepare('SELECT key,value FROM settings').all()) o[r.key] = r.value;
  return o;
}

module.exports = { db, DATA_DIR, getSettings };
