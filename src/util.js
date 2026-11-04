const { db, getSettings } = require('./db');

const brl = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const dataBR = (iso) => {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
};
const dataExtenso = (iso) => {
  const [y, m, d] = String(iso || today()).slice(0, 10).split('-').map(Number);
  return `${d} de ${MESES[m - 1]} de ${y}`;
};
const diasEntre = (a, b) => {
  if (!a) return 0;
  const d1 = new Date(String(a).slice(0, 10) + 'T00:00:00');
  const d2 = new Date(String(b || today()).slice(0, 10) + 'T00:00:00');
  return Math.max(0, Math.round((d2 - d1) / 86400000));
};

// ---- valor por extenso (pt-BR) ----
const UN = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const DZ = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const CT = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];
function ate999(n) {
  if (n === 0) return '';
  if (n === 100) return 'cem';
  const c = Math.floor(n / 100), r = n % 100, parts = [];
  if (c) parts.push(CT[c]);
  if (r) {
    if (r < 20) parts.push(UN[r]);
    else { const d = Math.floor(r / 10), u = r % 10; parts.push(u ? `${DZ[d]} e ${UN[u]}` : DZ[d]); }
  }
  return parts.join(' e ');
}
function inteiroExtenso(n) {
  if (n === 0) return 'zero';
  const grupos = [];
  while (n > 0) { grupos.push(n % 1000); n = Math.floor(n / 1000); }
  const nomes = [['', ''], ['mil', 'mil'], ['milhão', 'milhões'], ['bilhão', 'bilhões']];
  const partes = [];
  for (let i = grupos.length - 1; i >= 0; i--) {
    const g = grupos[i];
    if (!g) continue;
    let txt = i === 1 && g === 1 ? 'mil' : `${ate999(g)}${nomes[i][0] ? ' ' + (g === 1 ? nomes[i][0] : nomes[i][1]) : ''}`;
    partes.push({ txt, g, i });
  }
  return partes.map((p, idx) => {
    if (idx === 0) return p.txt;
    const last = idx === partes.length - 1;
    return (last && (p.g < 100 || p.g % 100 === 0) ? ' e ' : ', ') + p.txt;
  }).join('');
}
function valorExtenso(v) {
  v = Math.round((Number(v) || 0) * 100);
  const reais = Math.floor(v / 100), cent = v % 100;
  const parts = [];
  if (reais) {
    const grande = reais >= 1000000 && reais % 1000000 === 0;
    parts.push(`${inteiroExtenso(reais)}${grande ? ' de' : ''} ${reais === 1 ? 'real' : 'reais'}`);
  }
  if (cent) parts.push(`${inteiroExtenso(cent)} ${cent === 1 ? 'centavo' : 'centavos'}`);
  return parts.join(' e ') || 'zero reais';
}

const CATEGORIAS = { carro: 'Carro', moto: 'Moto', bike: 'Bike elétrica' };
const FORMAS = {
  dinheiro: 'Dinheiro', pix: 'PIX', transferencia: 'Transferência bancária', cartao_debito: 'Cartão de débito',
  cartao_credito: 'Cartão de crédito', boleto: 'Boleto', financiamento: 'Financiamento', cheque: 'Cheque', troca: 'Veículo na troca', outro: 'Outro',
};

function enderecoCompleto(p) {
  if (!p) return '';
  return [
    [p.endereco, p.numero].filter(Boolean).join(', '),
    p.complemento, p.bairro, [p.cidade, p.uf].filter(Boolean).join('/'), p.cep ? `CEP ${p.cep}` : '',
  ].filter(Boolean).join(' – ');
}
function descVeiculo(v) {
  if (!v) return '';
  return [v.marca, v.modelo, v.versao].filter(Boolean).join(' ');
}

// Monta todas as variáveis disponíveis para os modelos
function buildContext({ venda_id, veiculo_id, pessoa_id } = {}) {
  const s = getSettings();
  let venda = null, veiculo = null, cliente = null, fornecedor = null, pagamentos = [], vendedor = null;
  if (venda_id) {
    venda = db.prepare('SELECT * FROM vendas WHERE id=?').get(venda_id);
    if (venda) {
      veiculo_id = veiculo_id || venda.veiculo_id;
      pessoa_id = pessoa_id || venda.cliente_id;
      pagamentos = db.prepare('SELECT * FROM venda_pagamentos WHERE venda_id=? ORDER BY id').all(venda_id);
      vendedor = venda.vendedor_id ? db.prepare('SELECT nome FROM users WHERE id=?').get(venda.vendedor_id) : null;
    }
  }
  if (veiculo_id) veiculo = db.prepare('SELECT * FROM veiculos WHERE id=?').get(veiculo_id);
  if (pessoa_id) cliente = db.prepare('SELECT * FROM pessoas WHERE id=?').get(pessoa_id);
  if (veiculo && veiculo.fornecedor_id) fornecedor = db.prepare('SELECT * FROM pessoas WHERE id=?').get(veiculo.fornecedor_id);

  const ctx = {
    data_hoje: dataBR(today()),
    data_extenso: dataExtenso(venda ? venda.data_venda : today()),
    empresa: {
      nome: s.empresa_nome, razao_social: s.razao_social || s.empresa_nome, cnpj: s.cnpj, ie: s.ie,
      endereco_completo: [s.endereco, [s.cidade, s.uf].filter(Boolean).join('/'), s.cep ? `CEP ${s.cep}` : ''].filter(Boolean).join(' – '),
      cidade: s.cidade, uf: s.uf, telefone: s.telefone, whatsapp: s.whatsapp, email: s.email, foro: s.foro || s.cidade,
    },
  };
  const pessoaCtx = (p) => p ? {
    ...p, endereco_completo: enderecoCompleto(p),
    qualificacao: [p.tipo_pessoa === 'PJ' ? 'pessoa jurídica' : 'pessoa física', p.estado_civil, p.profissao, p.rg ? `RG ${p.rg}` : ''].filter(Boolean).join(', '),
  } : {};
  ctx.cliente = pessoaCtx(cliente);
  ctx.fornecedor = pessoaCtx(fornecedor);
  if (veiculo) {
    ctx.veiculo = {
      ...veiculo, descricao: descVeiculo(veiculo), categoria: CATEGORIAS[veiculo.categoria] || veiculo.categoria,
      km: veiculo.km != null ? Number(veiculo.km).toLocaleString('pt-BR') : '',
      preco_venda: brl(veiculo.preco_venda), fipe_valor: veiculo.fipe_valor ? brl(veiculo.fipe_valor) : '',
    };
    ctx.compra = { valor: brl(veiculo.valor_compra), valor_extenso: valorExtenso(veiculo.valor_compra), data: dataBR(veiculo.data_entrada) };
  } else ctx.veiculo = {};
  if (venda) {
    const linhas = pagamentos.map((p, i) => `${String.fromCharCode(97 + i)}) ${FORMAS[p.forma] || p.forma}${p.descricao ? ' – ' + p.descricao : ''}: ${brl(p.valor)} (${valorExtenso(p.valor)})${p.vencimento ? `, vencimento em ${dataBR(p.vencimento)}` : ''}${p.pago ? ' – quitado' : ''};`);
    ctx.venda = {
      ...venda, valor: brl(venda.valor_venda), valor_extenso: valorExtenso(venda.valor_venda), data: dataBR(venda.data_venda),
      pagamentos: linhas.join('\n') || 'À vista.', vendedor: vendedor ? vendedor.nome : '', garantia_dias: venda.garantia_dias ?? s.garantia_padrao_dias,
    };
  } else ctx.venda = { garantia_dias: s.garantia_padrao_dias };
  return ctx;
}

function renderTemplate(tpl, ctx) {
  return String(tpl).replace(/\{\{\s*([\w.]+)\s*\}\}/g, (m, key) => {
    if (['assinaturas', 'assinatura_empresa', 'assinatura_fornecedor', 'assinatura_cliente'].includes(key)) return m; // tratado no PDF
    const val = key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), ctx);
    return val == null || val === '' ? '________________' : String(val);
  });
}

const VARIAVEIS = [
  ['empresa.nome', 'Nome fantasia'], ['empresa.razao_social', 'Razão social'], ['empresa.cnpj', 'CNPJ'], ['empresa.endereco_completo', 'Endereço da loja'],
  ['empresa.cidade', 'Cidade da loja'], ['empresa.telefone', 'Telefone'], ['empresa.foro', 'Foro'],
  ['cliente.nome', 'Nome do cliente'], ['cliente.cpf_cnpj', 'CPF/CNPJ'], ['cliente.rg', 'RG'], ['cliente.qualificacao', 'Qualificação'],
  ['cliente.endereco_completo', 'Endereço do cliente'], ['cliente.telefone', 'Telefone'], ['cliente.email', 'E-mail'],
  ['fornecedor.nome', 'Vendedor do veículo (compra)'], ['fornecedor.cpf_cnpj', 'CPF/CNPJ do fornecedor'], ['fornecedor.rg', 'RG do fornecedor'], ['fornecedor.endereco_completo', 'Endereço do fornecedor'],
  ['veiculo.descricao', 'Marca, modelo e versão'], ['veiculo.categoria', 'Categoria'], ['veiculo.ano_fab', 'Ano fabricação'], ['veiculo.ano_mod', 'Ano modelo'],
  ['veiculo.placa', 'Placa'], ['veiculo.renavam', 'RENAVAM'], ['veiculo.chassi', 'Chassi'], ['veiculo.cor', 'Cor'], ['veiculo.km', 'Quilometragem'],
  ['veiculo.combustivel', 'Combustível'], ['veiculo.preco_venda', 'Preço anunciado'], ['veiculo.fipe_valor', 'Valor FIPE'],
  ['compra.valor', 'Valor de compra'], ['compra.valor_extenso', 'Valor de compra por extenso'], ['compra.data', 'Data de entrada'],
  ['venda.valor', 'Valor da venda'], ['venda.valor_extenso', 'Valor por extenso'], ['venda.data', 'Data da venda'], ['venda.pagamentos', 'Formas de pagamento (lista)'],
  ['venda.garantia_dias', 'Dias de garantia'], ['venda.vendedor', 'Vendedor responsável'],
  ['data_hoje', 'Data de hoje'], ['data_extenso', 'Data por extenso'],
  ['assinaturas', 'Bloco de assinaturas (loja + cliente)'], ['assinatura_empresa', 'Assinatura só da loja'], ['assinatura_fornecedor', 'Assinatura do fornecedor'], ['assinatura_cliente', 'Assinatura só do cliente'],
];

module.exports = { brl, today, dataBR, dataExtenso, diasEntre, valorExtenso, CATEGORIAS, FORMAS, buildContext, renderTemplate, VARIAVEIS, descVeiculo, enderecoCompleto };
