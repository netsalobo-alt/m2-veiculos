// Popula o sistema com dados de DEMONSTRAÇÃO usando a própria API.
// Uso: npm run seed:demo   (rode em um banco vazio; apague data/m2.db para recomeçar)
process.env.SEED = '1';
const app = require('../src/server');
const { db } = require('../src/db');

const dAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };

(async () => {
  if (db.prepare('SELECT COUNT(*) n FROM veiculos').get().n) { console.log('Já existem veículos cadastrados. Seed cancelado.'); process.exit(0); }
  const srv = app.listen(0);
  const base = `http://127.0.0.1:${srv.address().port}/api`;
  let cookie = '';
  const call = async (method, path, body) => {
    const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', cookie }, body: body ? JSON.stringify(body) : undefined });
    if (r.headers.get('set-cookie')) cookie = r.headers.get('set-cookie').split(';')[0];
    const j = await r.json();
    if (!r.ok) throw new Error(`${method} ${path}: ${j.error}`);
    return j;
  };
  await call('POST', '/login', { email: process.env.ADMIN_EMAIL || 'admin@m2seminovos.com.br', senha: process.env.ADMIN_PASSWORD || 'm2admin123' });

  await call('PUT', '/config', {
    razao_social: 'M2 Seminovos Comércio de Veículos Ltda (DEMO)', cnpj: '00.000.000/0001-00', endereco: 'Av. Exemplo, 1000 – Centro', cidade: 'Sua Cidade', uf: 'SP', cep: '00000-000',
    telefone: '(11) 0000-0000', whatsapp: '(11) 90000-0000', email: 'contato@m2seminovos.com.br', foro: 'Sua Cidade/SP',
  });
  const vend = await call('POST', '/usuarios', { nome: 'Vendedor Demonstração', email: 'vendedor@m2seminovos.com.br', senha: 'vendedor123', perfil: 'vendedor', comissao_pct: 1.5 });

  const P = async (nome, extra = {}) => (await call('POST', '/pessoas', { nome, cpf_cnpj: '000.000.000-00', telefone: '(11) 90000-0000', cidade: 'Sua Cidade', uf: 'SP', endereco: 'Rua de Exemplo', numero: '100', bairro: 'Centro', ...extra })).id;
  const c1 = await P('Ana Souza (demo)', { email: 'ana@example.com', estado_civil: 'casado(a)', profissao: 'professora', rg: '00.000.000-0' });
  const c2 = await P('Bruno Lima (demo)');
  const c3 = await P('Carla Mendes (demo)');
  const f1 = await P('Diego Rocha (demo)');
  const f2 = await P('Elisa Martins (demo)');

  const V = async (o) => (await call('POST', '/veiculos', { compra_pago: 1, origem: 'compra', status: 'disponivel', publicado: 1, ...o })).id;
  const cars = [
    { categoria: 'carro', marca: 'Volkswagen', modelo: 'T-Cross', versao: 'Comfortline 1.0 TSI', ano_fab: 2022, ano_mod: 2023, cor: 'Branco', km: 32000, combustivel: 'Flex', cambio: 'Automático', portas: 4, placa: 'ABC1D23', data_entrada: dAgo(12), fornecedor_id: f1, valor_compra: 104000, preco_venda: 124900, preco_minimo: 119000, fipe: 121500, destaque: 1, opcionais: 'Central multimídia, câmera de ré, sensor de estacionamento, ar digital' },
    { categoria: 'carro', marca: 'Fiat', modelo: 'Argo', versao: 'Drive 1.0', ano_fab: 2021, ano_mod: 2021, cor: 'Prata', km: 48000, combustivel: 'Flex', cambio: 'Manual', portas: 4, placa: 'DEF4G56', data_entrada: dAgo(74), fornecedor_id: f2, valor_compra: 58000, preco_venda: 69900, fipe: 66800 },
    { categoria: 'carro', marca: 'Toyota', modelo: 'Corolla', versao: 'XEi 2.0', ano_fab: 2020, ano_mod: 2020, cor: 'Preto', km: 61000, combustivel: 'Flex', cambio: 'CVT', portas: 4, placa: 'GHI7J89', data_entrada: dAgo(103), valor_compra: 98000, preco_venda: 112900, fipe: 109300 },
    { categoria: 'carro', marca: 'Hyundai', modelo: 'HB20', versao: 'Comfort 1.0', ano_fab: 2022, ano_mod: 2022, cor: 'Vermelho', km: 27000, combustivel: 'Flex', cambio: 'Manual', portas: 4, placa: 'JKL0M12', data_entrada: dAgo(5), valor_compra: 61000, preco_venda: 72900, fipe: 70100, status: 'preparacao', publicado: 0 },
    { categoria: 'moto', marca: 'Honda', modelo: 'CG 160', versao: 'Fan', ano_fab: 2023, ano_mod: 2023, cor: 'Preta', km: 9000, combustivel: 'Flex', motor: '160 cc', placa: 'MNO3P45', data_entrada: dAgo(21), valor_compra: 12500, preco_venda: 15900, fipe: 15200 },
    { categoria: 'moto', marca: 'Yamaha', modelo: 'Fazer 250', versao: 'ABS', ano_fab: 2021, ano_mod: 2022, cor: 'Azul', km: 18000, combustivel: 'Flex', motor: '250 cc', placa: 'QRS6T78', data_entrada: dAgo(45), valor_compra: 16000, preco_venda: 19900, fipe: 19400, status: 'reservado' },
    { categoria: 'bike', marca: 'Sense', modelo: 'Impulse', versao: 'E-Trail', ano_fab: 2023, ano_mod: 2023, cor: 'Grafite', autonomia: '70 km', bateria: '36V 14Ah · 250W', data_entrada: dAgo(33), valor_compra: 7200, preco_venda: 9490, fipe: 9900 },
    { categoria: 'bike', marca: 'Caloi', modelo: 'E-Vibe', versao: 'Urban', ano_fab: 2022, ano_mod: 2022, cor: 'Branca', autonomia: '50 km', bateria: '36V 10Ah · 250W', data_entrada: dAgo(66), valor_compra: 5200, preco_venda: 6990 },
  ];
  const ids = [];
  for (const c of cars) {
    const { fipe, ...o } = c;
    const id = await V(o);
    ids.push(id);
    if (fipe) await call('POST', `/veiculos/${id}/fipe`, { valor: fipe, referencia: 'referência de demonstração', origem: 'manual' });
  }
  const custo = (i, categoria, descricao, valor, dias, pago = true) => call('POST', `/veiculos/${ids[i]}/custos`, { categoria, descricao, valor, data: dAgo(dias), pago, fornecedor: 'Oficina Exemplo' });
  await custo(0, 'Estética / higienização', 'Polimento e higienização', 650, 10);
  await custo(0, 'Documentação / despachante', 'Transferência', 480, 9);
  await custo(1, 'Pneus', '4 pneus novos', 1800, 60);
  await custo(1, 'Mecânica', 'Revisão completa', 1200, 58, false);
  await custo(2, 'Funilaria e pintura', 'Para-choque traseiro', 1500, 95);
  await custo(3, 'Mecânica', 'Embreagem', 1350, 3, false);
  await custo(4, 'Mecânica', 'Kit relação', 380, 18);
  await custo(6, 'Bateria (bike)', 'Revisão de bateria', 290, 30);

  // vendas (meses anteriores e mês atual)
  const vendidos = [
    { categoria: 'carro', marca: 'Chevrolet', modelo: 'Onix', versao: 'LT 1.0 Turbo', ano_fab: 2021, ano_mod: 2022, cor: 'Cinza', km: 39000, combustivel: 'Flex', cambio: 'Automático', placa: 'UVW9X01', data_entrada: dAgo(150), valor_compra: 64000, preco_venda: 79900, venda: { dias: 120, valor: 78500, cli: c2, pags: [{ forma: 'pix', valor: 20000, pago: true }, { forma: 'financiamento', valor: 58500, pago: true, descricao: 'Banco Exemplo' }] } },
    { categoria: 'carro', marca: 'Renault', modelo: 'Kwid', versao: 'Zen 1.0', ano_fab: 2022, ano_mod: 2023, cor: 'Branco', km: 21000, combustivel: 'Flex', cambio: 'Manual', placa: 'YZA2B34', data_entrada: dAgo(110), valor_compra: 47000, preco_venda: 56900, venda: { dias: 75, valor: 55900, cli: c3, pags: [{ forma: 'transferencia', valor: 55900, pago: true }] } },
    { categoria: 'moto', marca: 'Honda', modelo: 'Biz 125', ano_fab: 2022, ano_mod: 2022, cor: 'Vermelha', km: 7000, combustivel: 'Flex', motor: '125 cc', placa: 'BCD5E67', data_entrada: dAgo(80), valor_compra: 10500, preco_venda: 13500, venda: { dias: 40, valor: 13200, cli: c2, pags: [{ forma: 'pix', valor: 13200, pago: true }] } },
    { categoria: 'carro', marca: 'Jeep', modelo: 'Renegade', versao: 'Longitude 1.8', ano_fab: 2019, ano_mod: 2020, cor: 'Verde', km: 72000, combustivel: 'Flex', cambio: 'Automático', placa: 'EFG8H90', data_entrada: dAgo(60), valor_compra: 72000, preco_venda: 86900, venda: { dias: 2, valor: 85000, cli: c1, pags: [{ forma: 'pix', valor: 25000, pago: true, descricao: 'entrada' }, { forma: 'financiamento', valor: 60000, pago: false, descricao: 'Financeira Exemplo' }] } },
  ];
  for (const v of vendidos) {
    const { venda, ...o } = v;
    const id = await V(o);
    await call('POST', `/veiculos/${id}/custos`, { categoria: 'Mecânica', descricao: 'Revisão', valor: 900, data: o.data_entrada, pago: true });
    await call('POST', '/vendas', { veiculo_id: id, cliente_id: venda.cli, vendedor_id: vend.id, data_venda: dAgo(venda.dias), valor_venda: venda.valor, comissao_valor: Math.round(venda.valor * 0.015), pagamentos: venda.pags.map((p) => ({ ...p, vencimento: dAgo(venda.dias - (p.pago ? 0 : 10)) })) });
  }
  // despesas fixas
  for (const [desc, cat, val, d] of [['Aluguel do pátio', 'Aluguel', 6500, 5], ['Energia e internet', 'Água, luz e internet', 780, 8], ['Anúncios em portais', 'Marketing e anúncios', 1200, 12], ['Salários', 'Salários e encargos', 9800, 2]]) {
    await call('POST', '/lancamentos', { tipo: 'saida', descricao: desc, categoria: cat, valor: val, vencimento: dAgo(d), status: 'pago', data_pagamento: dAgo(d), conta_id: 2 });
    await call('POST', '/lancamentos', { tipo: 'saida', descricao: desc, categoria: cat, valor: val, vencimento: dAgo(d - 30), parcelas: 1 });
  }
  await call('PUT', '/contas/2', { saldo_inicial: 650000 });
  await call('PUT', '/contas/1', { saldo_inicial: 5000 });
  db.prepare("INSERT INTO leads(tipo,nome,telefone,mensagem,veiculo_id) VALUES ('interesse','Fernanda (demo)','(11) 90000-0001','Olá! Tenho interesse no T-Cross. Aceita troca?',?)").run(ids[0]);
  db.prepare("INSERT INTO leads(tipo,nome,telefone,mensagem) VALUES ('avaliacao','Gustavo (demo)','(11) 90000-0002','Veículo: Gol 2018 1.0, 80 mil km')").run();
  srv.close();
  console.log('Dados de demonstração criados. Vendedor: vendedor@m2seminovos.com.br / vendedor123');
})().catch((e) => { console.error(e); process.exit(1); });
