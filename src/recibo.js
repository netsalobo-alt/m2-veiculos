// Leitura de recibo/nota por foto com IA (OpenAI). Só lê e devolve os dados: quem salva o custo é o usuário,
// depois de conferir no formulário. Nada é lançado automaticamente.
const multer = require('multer');
const { getSettings } = require('./db');
const { today } = require('./util');

const MODELO_PADRAO = 'gpt-5.4-mini'; // pode trocar em Configurações (precisa ler imagem)
const CATEGORIAS = ['Mecânica', 'Funilaria e pintura', 'Pneus', 'Elétrica', 'Estética / higienização', 'Documentação / despachante', 'Vistoria / laudo', 'IPVA / licenciamento', 'Multas', 'Transporte / guincho', 'Comissão de compra', 'Anúncios', 'Peças', 'Bateria (bike)', 'Outros'];
// a API aceita estas imagens; HEIC (padrão do iPhone) não — no celular, o navegador já converte ao tirar a foto
const TIPOS = { 'image/jpeg': 'image', 'image/png': 'image', 'image/webp': 'image', 'image/gif': 'image', 'application/pdf': 'document' };
const LIMITE = { image: 10 * 1024 * 1024, document: 15 * 1024 * 1024 };

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024, files: 1 } });

// categorias de despesa da loja (as de veículo, comissão e sócios têm fluxo próprio)
const CATS_DESPESA = ['Aluguel', 'Salários e encargos', 'Pró-labore', 'Impostos e taxas', 'Marketing e anúncios', 'Água, luz e internet', 'Despachante / documentação', 'Tarifas bancárias', 'Manutenção da loja', 'Outras despesas'];

const SCHEMA = {
  type: 'object',
  properties: {
    e_recibo: { type: 'boolean', description: 'true se é recibo, nota fiscal, cupom, boleto, fatura ou comprovante de pagamento legível' },
    tipo: { type: 'string', enum: ['custo_veiculo', 'despesa_loja'], description: 'custo_veiculo: gasto com um carro/moto/bike específico (oficina, peças, funilaria, documento do veículo, guincho). despesa_loja: conta da empresa (luz, água, internet, aluguel, salário, imposto, marketing, material da loja)' },
    placa: { type: ['string', 'null'], description: 'placa do veículo como aparece no documento (ex.: QEX2B41 ou ABC-1234), ou null' },
    veiculo_id: { type: ['integer', 'null'], description: 'id do veículo da lista do estoque que corresponde ao documento (pela placa ou, se não houver placa, por marca/modelo claramente descritos). null se não houver certeza' },
    data: { type: ['string', 'null'], description: 'data da compra/serviço/emissão no formato AAAA-MM-DD, ou null' },
    vencimento: { type: ['string', 'null'], description: 'data de vencimento (boletos, faturas de luz/água/internet) no formato AAAA-MM-DD, ou null' },
    ja_pago: { type: 'boolean', description: 'true se o documento comprova pagamento já feito (recibo, cupom, comprovante PIX). false se é uma conta/boleto/fatura ainda a pagar' },
    valor_total: { type: ['number', 'null'], description: 'valor total (pago ou a pagar), em reais, como número (ex.: 1250.5). null se não estiver legível' },
    fornecedor: { type: ['string', 'null'], description: 'nome da oficina, loja, concessionária de energia, posto ou prestador' },
    descricao: { type: 'string', description: 'resumo curto do que foi comprado, feito ou cobrado, em português (máx. 120 caracteres)' },
    categoria: { type: 'string', enum: CATEGORIAS, description: 'categoria do custo, quando tipo = custo_veiculo' },
    categoria_despesa: { type: 'string', enum: CATS_DESPESA, description: 'categoria da despesa, quando tipo = despesa_loja' },
    forma_pagamento: { type: ['string', 'null'], description: 'pix, dinheiro, cartão, boleto etc., se aparecer' },
    confianca: { type: 'string', enum: ['alta', 'media', 'baixa'], description: 'quão seguro está dos valores lidos' },
    observacao: { type: ['string', 'null'], description: 'aviso curto ao usuário se algo estiver ilegível, ambíguo ou se o veículo não foi identificado' },
  },
  required: ['e_recibo', 'tipo', 'placa', 'veiculo_id', 'data', 'vencimento', 'ja_pago', 'valor_total', 'fornecedor', 'descricao', 'categoria', 'categoria_despesa', 'forma_pagamento', 'confianca', 'observacao'],
  additionalProperties: false,
};

const PROMPT = `Você lê recibos, notas fiscais, boletos e faturas de uma revenda de veículos seminovos no Brasil (M2 Seminovos) para lançar no financeiro.
Extraia os dados do documento anexo. Regras:
- Decida se é custo de um veículo do estoque (custo_veiculo) ou despesa da loja (despesa_loja). Conta de luz, água, internet, aluguel, salário e impostos da empresa são despesa_loja.
- valor_total é o total (depois de descontos). Não some itens se o total estiver impresso.
- Datas brasileiras vêm como DD/MM/AAAA: converta para AAAA-MM-DD. Hoje é {{HOJE}}.
- Preencha categoria (custo) e categoria_despesa (despesa) sempre; o sistema usa a que corresponder ao tipo.
- Não invente: se um campo não estiver legível, use null e explique em observacao.
- Se não for um recibo/comprovante/conta, marque e_recibo como false.`;

// placa só com letras e números, maiúscula; aceita o formato antigo e o Mercosul (ABC1234 = ABC1C34)
const normPlaca = (p) => String(p || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const mercosul = (p) => (/^[A-Z]{3}\d{4}$/.test(p) ? p.slice(0, 4) + 'ABCDEFGHIJ'[Number(p[4])] + p.slice(5) : p);
const mesmaPlaca = (a, b) => { a = normPlaca(a); b = normPlaca(b); return !!a && !!b && (a === b || mercosul(a) === mercosul(b)); };

// veículos que podem receber custo: os do estoque e os vendidos nos últimos 90 dias (contas que chegam depois)
function veiculosCandidatos() {
  const { db } = require('./db');
  return db.prepare(`SELECT id, marca, modelo, versao, placa, cor, ano_mod, status FROM veiculos
    WHERE status!='vendido' OR data_venda >= date('now','localtime','-90 days') ORDER BY status='vendido', id DESC LIMIT 200`).all();
}
const descV = (v) => [v.marca, v.modelo, v.versao].filter(Boolean).join(' ');

function cliente() {
  const mod = require('openai');
  const OpenAI = mod.default || mod.OpenAI || mod;
  const st = getSettings();
  const chave = st.openai_api_key || process.env.OPENAI_API_KEY;
  if (!chave) {
    const e = new Error('A leitura de recibo não está configurada. Peça ao administrador para colar a chave da OpenAI em Configurações → Leitura de recibo (IA).');
    e.status = 400; e.publicMessage = e.message; throw e;
  }
  return { client: new OpenAI({ apiKey: chave }), OpenAI, modelo: (st.openai_modelo || '').trim() || MODELO_PADRAO };
}

async function lerRecibo(file, { comEstoque = false } = {}) {
  const tipo = TIPOS[file.mimetype];
  const erro = (msg) => { const e = new Error(msg); e.status = 400; e.publicMessage = msg; return e; };
  if (!tipo) throw erro(/heic|heif/i.test(file.mimetype) ? 'Foto em HEIC (iPhone) não é aceita. Tire a foto pelo botão do sistema ou salve como JPG.' : 'Envie uma foto (JPG, PNG ou WEBP) ou um PDF do recibo.');
  if (file.size > LIMITE[tipo]) throw erro(tipo === 'image' ? 'Foto grande demais (máximo 10 MB). Tire a foto com resolução menor.' : 'PDF grande demais (máximo 15 MB).');
  const { client, OpenAI, modelo } = cliente();
  const dataUrl = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
  const veiculos = comEstoque ? veiculosCandidatos() : [];
  const lista = veiculos.length ? `\n\nVeículos do estoque (use o id em veiculo_id só se tiver certeza):\n${veiculos.map((v) => `id ${v.id} | placa ${v.placa || 'sem placa'} | ${descV(v)}${v.cor ? ' ' + v.cor : ''}${v.ano_mod ? ' ' + v.ano_mod : ''}${v.status === 'vendido' ? ' (já vendido)' : ''}`).join('\n')}` : '';
  try {
    const r = await client.chat.completions.create({
      model: modelo,
      max_completion_tokens: 8000,
      response_format: { type: 'json_schema', json_schema: { name: 'recibo', strict: true, schema: SCHEMA } },
      messages: [{ role: 'user', content: [
        { type: 'text', text: PROMPT.replace('{{HOJE}}', today()) + lista },
        tipo === 'image' ? { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } } : { type: 'file', file: { filename: file.originalname || 'recibo.pdf', file_data: dataUrl } },
      ] }],
    });
    const ch = r.choices && r.choices[0];
    if (!ch) throw erro('A IA não respondeu. Tente de novo.');
    if (ch.message.refusal) throw erro('A IA não conseguiu ler este documento. Lance o custo manualmente.');
    if (ch.finish_reason === 'length') throw erro('A leitura foi interrompida. Tente de novo com uma foto mais nítida.');
    let d;
    try { d = JSON.parse(ch.message.content || ''); } catch (e) { throw erro('Não foi possível entender a leitura. Tente de novo ou lance manualmente.'); }
    if (d.data && !/^\d{4}-\d{2}-\d{2}$/.test(d.data)) d.data = null;
    if (!CATEGORIAS.includes(d.categoria)) d.categoria = 'Outros';
    d.valor_total = Number(d.valor_total) > 0 ? Math.round(Number(d.valor_total) * 100) / 100 : null;
    if (d.vencimento && !/^\d{4}-\d{2}-\d{2}$/.test(d.vencimento)) d.vencimento = null;
    if (!CATS_DESPESA.includes(d.categoria_despesa)) d.categoria_despesa = 'Outras despesas';
    // confere o veículo no sistema: a placa lida manda; a sugestão da IA só vale se o id existir na lista
    d.veiculo = null; d.veiculo_motivo = null;
    if (comEstoque) {
      const porPlaca = d.placa ? veiculos.find((v) => mesmaPlaca(v.placa, d.placa)) : null;
      const porIa = veiculos.find((v) => v.id === d.veiculo_id);
      const v = porPlaca || porIa;
      if (v) { d.veiculo = { id: v.id, descricao: descV(v), placa: v.placa, vendido: v.status === 'vendido' }; d.veiculo_motivo = porPlaca ? 'placa' : 'descricao'; }
      if (d.placa && !porPlaca) d.placa_nao_encontrada = true;
    }
    delete d.veiculo_id;
    d.listas = { custo: CATEGORIAS, despesa: CATS_DESPESA };
    return d;
  } catch (e) {
    if (e.publicMessage) throw e;
    if (e instanceof OpenAI.AuthenticationError || e instanceof OpenAI.PermissionDeniedError) throw erro('A chave da OpenAI é inválida, foi revogada ou não tem acesso a este modelo. Confira em Configurações → Leitura de recibo (IA).');
    if (e instanceof OpenAI.RateLimitError) throw erro('Limite da OpenAI atingido (muitas leituras ou sem créditos na conta). Aguarde ou confira o saldo em platform.openai.com.');
    if (e instanceof OpenAI.NotFoundError) throw erro(`O modelo "${modelo}" não existe ou não está liberado na sua conta da OpenAI. Troque o modelo em Configurações.`);
    if (e instanceof OpenAI.BadRequestError) throw erro('A OpenAI não aceitou este arquivo ou o modelo escolhido não lê imagens. Tente outra foto ou troque o modelo em Configurações.');
    if (e instanceof OpenAI.APIConnectionError) throw erro('Sem conexão com a OpenAI agora. Tente de novo em instantes.');
    if (e instanceof OpenAI.APIError) throw erro('O serviço da OpenAI está indisponível no momento. Tente de novo ou lance manualmente.');
    throw e;
  }
}

function rotas(api, can) {
  api.post('/recibo/ler', can('custos'), (req, res, next) => {
    upload.single('arquivo')(req, res, async (err) => {
      if (err) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Arquivo grande demais (máximo 15 MB).' : 'Não foi possível receber o arquivo.' });
      if (!req.file) return res.status(400).json({ error: 'Envie a foto ou o PDF do recibo.' });
      try { res.json(await lerRecibo(req.file, { comEstoque: req.query.estoque === '1' })); } catch (e) { next(e); }
    });
  });
  api.get('/recibo/status', can('custos'), (req, res) => res.json({ configurado: !!(getSettings().openai_api_key || process.env.OPENAI_API_KEY) }));
}

module.exports = { rotas, lerRecibo, CATEGORIAS, CATS_DESPESA, mesmaPlaca };
