// Capital de giro para reposição de estoque (somente leitura: não cria nem altera lançamentos)
// - Capital recuperado: recebimentos confirmados de cada venda (entradas pagas, sem a parte da troca),
//   na ordem em que foram recebidos, até o limite do custo do carro vendido (compra + preparação).
//   Veículo consignado não tem capital próprio a recuperar.
// - Total pago: compras e custos de preparação pagos de veículos do estoque próprio (não consignados).
// - O mês é o da data do recebimento ou do pagamento. Pendentes e veículo recebido na troca ficam fora.
// - Aportes dos sócios: entradas pagas na categoria "Aporte de sócios" (dinheiro que os sócios colocaram).
//   Quando o sócio paga uma compra direto, o sistema já lança a compra e o aporte; os dois se anulam.
// Visão por estoque, no fim do mês escolhido:
//   Saldo = aportes − parado no estoque (pago dos carros ainda no pátio) − custo dos vendidos que ainda não voltou − pagos sem veículo
//   O "parado no estoque" nunca passa do custo dos carros do pátio. A soma fecha com a conta de caixa
//   (recuperado + aportes − tudo o que foi pago), só que separada por carro.
const { db } = require('./db');
const { descVeiculo } = require('./util');

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const MES = /^\d{4}-\d{2}$/;

function calcular() {
  // custo de cada veículo vendido (compra + custos lançados)
  const vendas = db.prepare(`SELECT s.id venda_id, s.data_venda, s.veiculo_id, v.marca, v.modelo, v.versao, v.placa, v.origem,
      COALESCE(v.valor_compra,0) compra, (SELECT COALESCE(SUM(valor),0) FROM veiculo_custos c WHERE c.veiculo_id=v.id) custos
    FROM vendas s JOIN veiculos v ON v.id=s.veiculo_id WHERE s.status='concluida'`).all()
    .map((s) => ({ ...s, veiculo: descVeiculo(s), custo: s.origem === 'consignado' ? 0 : r2(s.compra + s.custos), recuperado: 0 }));
  const porVenda = new Map(vendas.map((s) => [s.venda_id, s]));
  // recebimentos confirmados das vendas, em ordem de recebimento
  const receb = db.prepare(`SELECT id, venda_id, valor, data_pagamento FROM lancamentos
    WHERE tipo='entrada' AND status='pago' AND venda_id IS NOT NULL AND data_pagamento IS NOT NULL AND IFNULL(forma,'')!='troca'
    ORDER BY data_pagamento, id`).all();
  const rec = []; // { mes, venda_id, recebido, recuperado }
  for (const r of receb) {
    const s = porVenda.get(r.venda_id);
    if (!s) continue; // venda cancelada
    const parte = r2(Math.max(0, Math.min(r.valor, s.custo - s.recuperado)));
    s.recuperado = r2(s.recuperado + parte);
    rec.push({ mes: r.data_pagamento.slice(0, 7), data: r.data_pagamento, venda_id: r.venda_id, recebido: r.valor, recuperado: parte, acumulado: s.recuperado });
  }
  // pagamentos de compra e preparação do estoque próprio
  const pag = db.prepare(`SELECT l.id, l.data_pagamento data, l.descricao, l.categoria, l.valor, l.veiculo_id, v.marca, v.modelo, v.versao, v.placa, v.status veiculo_status
    FROM lancamentos l LEFT JOIN veiculos v ON v.id=l.veiculo_id
    WHERE l.tipo='saida' AND l.status='pago' AND l.data_pagamento IS NOT NULL AND l.categoria IN ('Compra de veículos','Custos de veículos')
      AND IFNULL(v.origem,'compra')!='consignado' ORDER BY l.data_pagamento, l.id`).all()
    .map((p) => ({ ...p, mes: p.data.slice(0, 7), veiculo: p.marca ? descVeiculo(p) : '', grupo: !p.marca ? 'sem_veiculo' : p.veiculo_status === 'vendido' ? 'vendidos' : 'estoque' }));
  // aportes dos sócios (dinheiro novo que entrou para o giro)
  const apo = db.prepare(`SELECT l.id, l.data_pagamento data, l.descricao, l.valor, s.nome socio FROM lancamentos l LEFT JOIN socios s ON s.id=l.socio_id
    WHERE l.tipo='entrada' AND l.status='pago' AND l.data_pagamento IS NOT NULL AND l.categoria='Aporte de sócios' ORDER BY l.data_pagamento, l.id`).all()
    .map((a) => ({ ...a, mes: a.data.slice(0, 7) }));
  return { vendas, porVenda, rec, pag, apo };
}

// posição no fim de um mês, vista pelo estoque (a soma fecha com a conta de caixa: recuperado + aportes − pago)
function posicao(dados, fim) {
  const { porVenda, rec, pag, apo } = dados;
  const vendidoAte = new Set([...porVenda.values()].filter((s) => s.data_venda <= fim).map((s) => s.veiculo_id));
  const pagAte = pag.filter((x) => x.data <= fim);
  const aportes = r2(apo.filter((x) => x.data <= fim).reduce((a, x) => a + x.valor, 0));
  const recuperado = r2(rec.filter((x) => x.data <= fim).reduce((a, x) => a + x.recuperado, 0));
  let estoque = 0, vendidos = 0, semVeiculo = 0;
  const carros = new Map(); // estoque no fim do mês: pago por carro
  pagAte.forEach((x) => {
    if (!x.veiculo_id || !x.marca) { semVeiculo += x.valor; return; }
    if (vendidoAte.has(x.veiculo_id)) { vendidos += x.valor; return; }
    estoque += x.valor;
    const c = carros.get(x.veiculo_id) || { veiculo_id: x.veiculo_id, veiculo: x.veiculo, placa: x.placa, pago: 0 };
    c.pago = r2(c.pago + x.valor); carros.set(x.veiculo_id, c);
  });
  estoque = r2(estoque); vendidos = r2(vendidos); semVeiculo = r2(semVeiculo);
  const faltaVendas = r2(vendidos - recuperado); // custo pago dos vendidos que ainda não voltou
  return { aportes, recuperado, estoque, vendidos, sem_veiculo: semVeiculo, falta_vendas: faltaVendas,
    saldo: r2(aportes - estoque - faltaVendas - semVeiculo), carros: [...carros.values()], vendidos_qtd: vendidoAte.size };
}
const fimDoMes = (mes) => { const [y, m] = mes.split('-').map(Number); const d = new Date(y, m, 0); return `${mes}-${String(d.getDate()).padStart(2, '0')}`; };
const mesAnterior = (mes) => { const [y, m] = mes.split('-').map(Number); const d = new Date(y, m - 2, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };

function capitalGiro(mes) {
  if (!MES.test(mes || '')) throw new Error('Mês inválido.');
  const dados = calcular();
  const { porVenda, rec, pag, apo } = dados;
  const fim = fimDoMes(mes);
  const p = posicao(dados, fim);
  const ant = posicao(dados, fimDoMes(mesAnterior(mes)));
  // custo cadastrado (compra + custos) dos carros no estoque no fim do mês, para comparação
  const custoCad = Object.fromEntries(db.prepare(`SELECT v.id, COALESCE(v.valor_compra,0) + (SELECT COALESCE(SUM(valor),0) FROM veiculo_custos c WHERE c.veiculo_id=v.id) t FROM veiculos v`).all().map((r) => [r.id, r2(r.t)]));
  const carros = p.carros.map((c) => ({ ...c, custo: custoCad[c.veiculo_id] || 0 })).sort((a, b) => b.pago - a.pago);
  // movimento do mês (para os detalhes)
  const vend = new Map();
  rec.filter((x) => x.mes === mes).forEach((x) => {
    const s = porVenda.get(x.venda_id);
    const o = vend.get(x.venda_id) || { venda_id: x.venda_id, veiculo_id: s.veiculo_id, veiculo: s.veiculo, placa: s.placa, data_venda: s.data_venda, custo: s.custo, recebido_mes: 0, recuperado_mes: 0, recuperado_ate: 0 };
    o.recebido_mes = r2(o.recebido_mes + x.recebido); o.recuperado_mes = r2(o.recuperado_mes + x.recuperado); o.recuperado_ate = x.acumulado;
    vend.set(x.venda_id, o);
  });
  const porSocio = {};
  apo.filter((x) => x.mes === mes).forEach((x) => { const k = x.socio || 'Sem sócio identificado'; porSocio[k] = r2((porSocio[k] || 0) + x.valor); });
  const meses = [...new Set([...rec.map((x) => x.mes), ...pag.map((x) => x.mes), ...apo.map((x) => x.mes)])].sort();
  return {
    mes, fim,
    // posição no fim do mês
    aportes: p.aportes, estoque: p.estoque, estoque_custo: r2(carros.reduce((a, c) => a + c.custo, 0)), estoque_qtd: carros.length,
    vendidos_pago: p.vendidos, vendidos_recuperado: p.recuperado, vendidos_qtd: p.vendidos_qtd, falta_vendas: p.falta_vendas,
    sem_veiculo: p.sem_veiculo, saldo: p.saldo, saldo_anterior: ant.saldo,
    // movimento no mês
    mes_aportes: r2(apo.filter((x) => x.mes === mes).reduce((a, x) => a + x.valor, 0)),
    mes_recuperado: r2(rec.filter((x) => x.mes === mes).reduce((a, x) => a + x.recuperado, 0)),
    mes_pago: r2(pag.filter((x) => x.mes === mes).reduce((a, x) => a + x.valor, 0)),
    aportes_socios: Object.entries(porSocio).map(([socio, valor]) => ({ socio, valor })).sort((a, b) => b.valor - a.valor),
    primeiro_mes: meses[0] || null,
    carros,
    vendas: [...vend.values()].map((o) => ({ ...o, falta: r2(Math.max(0, o.custo - o.recuperado_ate)) })),
    pagamentos: pag.filter((x) => x.mes === mes).map(({ id, data, descricao, categoria, valor, veiculo_id, veiculo, placa, marca }) => ({ id, data, descricao, categoria, valor, veiculo_id, veiculo, placa,
      grupo: !marca ? 'sem_veiculo' : [...porVenda.values()].some((s) => s.veiculo_id === veiculo_id && s.data_venda <= fim) ? 'vendidos' : 'estoque' })),
  };
}

module.exports = { capitalGiro };
