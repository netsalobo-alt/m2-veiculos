const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const { db, DATA_DIR, getSettings } = require('./db');
const { today, diasEntre, descVeiculo } = require('./util');
const { bad, pick } = require('./routes-cadastros');

const VEIC_FIELDS = ['categoria', 'marca', 'modelo', 'versao', 'ano_fab', 'ano_mod', 'placa', 'renavam', 'chassi', 'cor', 'km', 'combustivel', 'cambio', 'portas', 'motor', 'autonomia', 'bateria', 'opcionais', 'descricao', 'data_entrada', 'fornecedor_id', 'origem', 'valor_compra', 'compra_pago', 'forma_pagamento_compra', 'preco_venda', 'preco_minimo', 'status', 'publicado', 'destaque'];
const COST_SENSITIVE = ['valor_compra', 'compra_pago', 'forma_pagamento_compra', 'preco_minimo', 'custos_total', 'custo_total', 'margem', 'margem_pct', 'fornecedor_id', 'fornecedor_nome', 'custos', 'lucro'];

const upload = multer({
  storage: multer.diskStorage({
    destination: path.join(DATA_DIR, 'uploads'),
    filename: (req, file, cb) => cb(null, `v${req.params.id}-${crypto.randomBytes(6).toString('hex')}${path.extname(file.originalname).toLowerCase() || '.jpg'}`),
  }),
  limits: { fileSize: 8 * 1024 * 1024, files: 20 },
  fileFilter: (req, file, cb) => cb(null, /^image\/(jpeg|png|webp)$/.test(file.mimetype)),
});

// enriquece com custos, dias no pátio e margens
function enrich(v) {
  const custos = db.prepare('SELECT COALESCE(SUM(valor),0) t FROM veiculo_custos WHERE veiculo_id=?').get(v.id).t;
  const custo_total = (v.valor_compra || 0) + custos;
  const preco = v.preco_venda || 0;
  return {
    ...v,
    custos_total: custos,
    custo_total,
    dias_patio: diasEntre(v.data_entrada, v.status === 'vendido' ? v.data_venda : today()),
    margem: preco ? preco - custo_total : null,
    margem_pct: preco && custo_total ? ((preco - custo_total) / custo_total) * 100 : null,
    fipe_pct: v.fipe_valor && preco ? (preco / v.fipe_valor) * 100 : null,
    compra_fipe_pct: v.fipe_valor && v.valor_compra ? (v.valor_compra / v.fipe_valor) * 100 : null,
  };
}
const strip = (req, o) => {
  if (req.user.perms.includes('custos')) return o;
  const c = { ...o };
  COST_SENSITIVE.forEach((k) => delete c[k]);
  return c;
};

// lançamento financeiro da compra
function syncCompraLancamento(v, userId) {
  const ex = db.prepare("SELECT id,status FROM lancamentos WHERE veiculo_id=? AND categoria='Compra de veículos' AND venda_id IS NULL").get(v.id);
  if (v.origem !== 'compra' || !(v.valor_compra > 0)) {
    if (ex) db.prepare('DELETE FROM lancamentos WHERE id=?').run(ex.id);
    return;
  }
  const desc = `Compra do veículo ${descVeiculo(v)}${v.placa ? ' (' + v.placa + ')' : ''}`;
  const status = v.compra_pago ? 'pago' : 'pendente';
  const dt = v.data_entrada || today();
  if (ex) {
    db.prepare('UPDATE lancamentos SET descricao=?, valor=?, vencimento=?, status=?, data_pagamento=?, pessoa_id=?, forma=? WHERE id=?')
      .run(desc, v.valor_compra, dt, status, status === 'pago' ? dt : null, v.fornecedor_id || null, v.forma_pagamento_compra || null, ex.id);
  } else {
    db.prepare(`INSERT INTO lancamentos(tipo,descricao,categoria,valor,vencimento,data_pagamento,status,veiculo_id,pessoa_id,forma,conta_id,criado_por)
      VALUES ('saida',?,'Compra de veículos',?,?,?,?,?,?,?,(SELECT id FROM contas WHERE tipo='banco' AND ativo=1 ORDER BY id LIMIT 1),?)`)
      .run(desc, v.valor_compra, dt, status === 'pago' ? dt : null, status, v.id, v.fornecedor_id || null, v.forma_pagamento_compra || null, userId);
  }
}

function syncCustoLancamento(c, pago, userId) {
  const v = db.prepare('SELECT * FROM veiculos WHERE id=?').get(c.veiculo_id);
  const desc = `${c.categoria || 'Custo'}: ${c.descricao || ''} – ${descVeiculo(v)}${v.placa ? ' (' + v.placa + ')' : ''}`.replace(':  –', ' –');
  const ex = db.prepare('SELECT id FROM lancamentos WHERE custo_id=?').get(c.id);
  const dt = c.data || today();
  if (ex) {
    db.prepare('UPDATE lancamentos SET descricao=?, valor=?, vencimento=?' + (pago == null ? '' : ', status=?, data_pagamento=?') + ' WHERE id=?')
      .run(...[desc, c.valor, dt, ...(pago == null ? [] : [pago ? 'pago' : 'pendente', pago ? dt : null]), ex.id]);
  } else {
    db.prepare(`INSERT INTO lancamentos(tipo,descricao,categoria,valor,vencimento,data_pagamento,status,veiculo_id,custo_id,conta_id,criado_por)
      VALUES ('saida',?,'Custos de veículos',?,?,?,?,?,?,(SELECT id FROM contas WHERE ativo=1 ORDER BY id LIMIT 1),?)`)
      .run(desc, c.valor, dt, pago ? dt : null, pago ? 'pago' : 'pendente', c.veiculo_id, c.id, userId);
  }
}

module.exports = function (api, can) {
  api.get('/veiculos', can('estoque'), (req, res) => {
    const where = [], params = [];
    if (req.query.status === 'estoque') where.push("v.status!='vendido'");
    else if (req.query.status) { where.push('v.status=?'); params.push(req.query.status); }
    if (req.query.categoria) { where.push('v.categoria=?'); params.push(req.query.categoria); }
    if (req.query.q) {
      where.push("(v.marca||' '||v.modelo||' '||IFNULL(v.versao,'')||' '||IFNULL(v.placa,'')||' '||IFNULL(v.chassi,'')) LIKE ?");
      params.push(`%${req.query.q}%`);
    }
    const rows = db.prepare(`SELECT v.*, p.nome fornecedor_nome,
        (SELECT arquivo FROM veiculo_fotos f WHERE f.veiculo_id=v.id ORDER BY ordem,id LIMIT 1) foto
      FROM veiculos v LEFT JOIN pessoas p ON p.id=v.fornecedor_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY v.status='vendido', v.data_entrada DESC, v.id DESC`).all(...params);
    res.json(rows.map((r) => strip(req, enrich(r))));
  });

  api.get('/veiculos/:id', can('estoque'), (req, res) => {
    const v = db.prepare('SELECT v.*, p.nome fornecedor_nome FROM veiculos v LEFT JOIN pessoas p ON p.id=v.fornecedor_id WHERE v.id=?').get(req.params.id);
    if (!v) return res.status(404).json({ error: 'Veículo não encontrado.' });
    const out = enrich(v);
    out.fotos = db.prepare('SELECT id,arquivo,ordem FROM veiculo_fotos WHERE veiculo_id=? ORDER BY ordem,id').all(v.id);
    out.custos = db.prepare(`SELECT c.*, l.status lanc_status FROM veiculo_custos c LEFT JOIN lancamentos l ON l.custo_id=c.id WHERE c.veiculo_id=? ORDER BY c.data DESC, c.id DESC`).all(v.id);
    out.fipe_historico = db.prepare('SELECT * FROM fipe_historico WHERE veiculo_id=? ORDER BY data DESC').all(v.id);
    out.venda = db.prepare(`SELECT s.*, p.nome cliente_nome FROM vendas s JOIN pessoas p ON p.id=s.cliente_id WHERE s.veiculo_id=? AND s.status='concluida'`).get(v.id) || null;
    out.documentos = db.prepare('SELECT id,titulo,tipo,status,criado_em,assinado_em FROM documentos WHERE veiculo_id=? ORDER BY id DESC').all(v.id);
    if (out.venda) out.lucro = out.venda.valor_venda - out.custo_total - (out.venda.comissao_valor || 0);
    res.json(strip(req, out));
  });

  api.post('/veiculos', can('estoque'), (req, res) => {
    const d = pick(req.body, VEIC_FIELDS);
    if (!d.marca || !d.modelo) throw bad('Informe marca e modelo.');
    d.data_entrada = d.data_entrada || today();
    if (!req.user.perms.includes('custos')) { delete d.valor_compra; delete d.preco_minimo; }
    const keys = Object.keys(d);
    const tx = db.transaction(() => {
      const r = db.prepare(`INSERT INTO veiculos(${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(...keys.map((k) => d[k]));
      const v = db.prepare('SELECT * FROM veiculos WHERE id=?').get(r.lastInsertRowid);
      syncCompraLancamento(v, req.user.id);
      return v.id;
    });
    res.json({ id: tx() });
  });

  api.put('/veiculos/:id', can('estoque'), (req, res) => {
    const d = pick(req.body, VEIC_FIELDS);
    if (!req.user.perms.includes('custos')) COST_SENSITIVE.forEach((k) => delete d[k]);
    const cur = db.prepare('SELECT * FROM veiculos WHERE id=?').get(req.params.id);
    if (!cur) return res.status(404).json({ error: 'Veículo não encontrado.' });
    if (d.status && d.status !== cur.status && (d.status === 'vendido' || cur.status === 'vendido')) {
      throw bad('Para marcar como vendido registre uma venda; para desfazer, cancele a venda.');
    }
    const keys = Object.keys(d);
    const tx = db.transaction(() => {
      if (keys.length) db.prepare(`UPDATE veiculos SET ${keys.map((k) => k + '=?').join(',')} WHERE id=?`).run(...keys.map((k) => d[k]), req.params.id);
      const v = db.prepare('SELECT * FROM veiculos WHERE id=?').get(req.params.id);
      if (req.user.perms.includes('custos')) syncCompraLancamento(v, req.user.id);
    });
    tx();
    res.json({ ok: true });
  });

  api.delete('/veiculos/:id', can('custos'), (req, res) => {
    if (db.prepare('SELECT 1 FROM vendas WHERE veiculo_id=? OR veiculo_troca_id=?').get(req.params.id, req.params.id)) throw bad('Veículo com venda registrada não pode ser excluído.');
    const fotos = db.prepare('SELECT arquivo FROM veiculo_fotos WHERE veiculo_id=?').all(req.params.id);
    db.transaction(() => {
      db.prepare('DELETE FROM lancamentos WHERE veiculo_id=? AND venda_id IS NULL').run(req.params.id);
      db.prepare('DELETE FROM veiculos WHERE id=?').run(req.params.id);
    })();
    fotos.forEach((f) => fs.rm(path.join(DATA_DIR, 'uploads', f.arquivo), () => {}));
    res.json({ ok: true });
  });

  // fotos
  api.post('/veiculos/:id/fotos', can('estoque'), upload.array('fotos', 20), (req, res) => {
    const max = db.prepare('SELECT COALESCE(MAX(ordem),0) m FROM veiculo_fotos WHERE veiculo_id=?').get(req.params.id).m;
    const ins = db.prepare('INSERT INTO veiculo_fotos(veiculo_id,arquivo,ordem) VALUES (?,?,?)');
    (req.files || []).forEach((f, i) => ins.run(req.params.id, f.filename, max + i + 1));
    res.json({ ok: true, enviadas: (req.files || []).length });
  });
  api.put('/fotos/:fid/capa', can('estoque'), (req, res) => {
    const f = db.prepare('SELECT * FROM veiculo_fotos WHERE id=?').get(req.params.fid);
    if (!f) return res.status(404).end();
    db.prepare('UPDATE veiculo_fotos SET ordem=ordem+1 WHERE veiculo_id=?').run(f.veiculo_id);
    db.prepare('UPDATE veiculo_fotos SET ordem=0 WHERE id=?').run(f.id);
    res.json({ ok: true });
  });
  api.delete('/fotos/:fid', can('estoque'), (req, res) => {
    const f = db.prepare('SELECT * FROM veiculo_fotos WHERE id=?').get(req.params.fid);
    if (f) { db.prepare('DELETE FROM veiculo_fotos WHERE id=?').run(f.id); fs.rm(path.join(DATA_DIR, 'uploads', f.arquivo), () => {}); }
    res.json({ ok: true });
  });

  // custos
  api.post('/veiculos/:id/custos', can('custos'), (req, res) => {
    const { data, categoria, descricao, fornecedor, valor, pago } = req.body || {};
    if (!(Number(valor) > 0)) throw bad('Informe o valor do custo.');
    const id = db.transaction(() => {
      const r = db.prepare('INSERT INTO veiculo_custos(veiculo_id,data,categoria,descricao,fornecedor,valor) VALUES (?,?,?,?,?,?)')
        .run(req.params.id, data || today(), categoria || 'Outros', descricao || '', fornecedor || '', Number(valor));
      const c = db.prepare('SELECT * FROM veiculo_custos WHERE id=?').get(r.lastInsertRowid);
      syncCustoLancamento(c, pago !== false && pago !== 0, req.user.id);
      return c.id;
    })();
    res.json({ id });
  });
  api.put('/custos/:cid', can('custos'), (req, res) => {
    const { data, categoria, descricao, fornecedor, valor, pago } = req.body || {};
    db.transaction(() => {
      db.prepare('UPDATE veiculo_custos SET data=?,categoria=?,descricao=?,fornecedor=?,valor=? WHERE id=?')
        .run(data || today(), categoria, descricao, fornecedor, Number(valor) || 0, req.params.cid);
      const c = db.prepare('SELECT * FROM veiculo_custos WHERE id=?').get(req.params.cid);
      if (c) syncCustoLancamento(c, pago == null ? null : !!pago, req.user.id);
    })();
    res.json({ ok: true });
  });
  api.delete('/custos/:cid', can('custos'), (req, res) => {
    db.prepare('DELETE FROM veiculo_custos WHERE id=?').run(req.params.cid);
    res.json({ ok: true });
  });

  // ---------- FIPE (API pública Parallelum) ----------
  const FIPE = process.env.FIPE_API || 'https://parallelum.com.br/fipe/api/v1';
  const tipoOk = (t) => (['carros', 'motos', 'caminhoes'].includes(t) ? t : 'carros');
  async function fipeGet(p) {
    let r;
    try { r = await fetch(`${FIPE}/${p}`, { signal: AbortSignal.timeout(15000) }); } catch (e) {
      throw bad('Não foi possível consultar a tabela FIPE agora. Verifique a conexão com a internet ou informe o valor manualmente.', 502);
    }
    if (r.status === 429) throw bad('Limite de consultas FIPE atingido. Tente novamente em alguns minutos.', 429);
    if (!r.ok) throw bad('Consulta FIPE não encontrada.', 502);
    return r.json();
  }
  const parseValor = (s) => Number(String(s || '').replace(/[^\d,]/g, '').replace(',', '.')) || 0;

  api.get('/fipe/:tipo/marcas', can('estoque'), async (req, res) => res.json(await fipeGet(`${tipoOk(req.params.tipo)}/marcas`)));
  api.get('/fipe/:tipo/marcas/:m/modelos', can('estoque'), async (req, res) => res.json((await fipeGet(`${tipoOk(req.params.tipo)}/marcas/${encodeURIComponent(req.params.m)}/modelos`)).modelos || []));
  api.get('/fipe/:tipo/marcas/:m/modelos/:mo/anos', can('estoque'), async (req, res) => res.json(await fipeGet(`${tipoOk(req.params.tipo)}/marcas/${encodeURIComponent(req.params.m)}/modelos/${encodeURIComponent(req.params.mo)}/anos`)));
  api.get('/fipe/:tipo/marcas/:m/modelos/:mo/anos/:a', can('estoque'), async (req, res) => {
    const r = await fipeGet(`${tipoOk(req.params.tipo)}/marcas/${encodeURIComponent(req.params.m)}/modelos/${encodeURIComponent(req.params.mo)}/anos/${encodeURIComponent(req.params.a)}`);
    res.json({ ...r, valor_num: parseValor(r.Valor) });
  });

  // ---------- Consulta por placa (FIPE API v2 Parallelum, exige token) ----------
  const FIPE_V2 = process.env.FIPE_API_V2 || 'https://fipe.parallelum.com.br/api/v2';
  const titulo = (s) => String(s || '').toLowerCase().replace(/(^|[\s\-/(])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
  function combustivelDe(s) {
    const t = String(s || '').toLowerCase();
    if (/h[ií]brid/.test(t)) return 'Híbrido';
    if (/el[eé]tric/.test(t)) return 'Elétrico';
    if (/diesel/.test(t)) return 'Diesel';
    if (/gnv|g[aá]s natural/.test(t)) return 'GNV';
    if (/(álcool|alcool|etanol)/.test(t) && /gasolina/.test(t)) return 'Flex';
    if (/flex/.test(t)) return 'Flex';
    if (/(álcool|alcool|etanol)/.test(t)) return 'Etanol';
    if (/gasolina/.test(t)) return 'Gasolina';
    return '';
  }
  function mapPlaca(r) {
    // "GM - CHEVROLET" -> "Chevrolet"; "SPIN 1.8L MT LTZ" -> modelo "Spin", versão "1.8L MT LTZ"
    const marca = titulo(String(r.brand || '').split(' - ').pop().trim());
    const partes = String(r.model || '').trim().split(/\s+/);
    const ano = Number(r.year) || null;
    return {
      placa: r.plate,
      categoria: /moto/i.test(r.segment || '') ? 'moto' : 'carro',
      marca, modelo: titulo(partes[0] || ''), versao: partes.slice(1).join(' '),
      ano_fab: ano, ano_mod: ano, cor: r.color || '', combustivel: combustivelDe(r.fuel),
      chassi_final: r.chassis || '', municipio: [r.city, r.state].filter(Boolean).join('/'), importado: !!r.imported,
      fipe: (r.fipePrices || []).map((p) => ({ codigo: p.codeFipe, modelo: p.model, valor: parseValor(p.price), preco: p.price })),
    };
  }
  api.get('/fipe/placa/:placa', can('estoque'), async (req, res) => {
    const placa = String(req.params.placa || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!/^[A-Z]{3}\d[A-Z0-9]\d{2}$/.test(placa)) throw bad('Placa inválida. Use o formato ABC1234 ou ABC1D23.');
    const cache = db.prepare('SELECT resposta, consultado_em FROM placa_consultas WHERE placa=?').get(placa);
    if (cache && req.query.atualizar !== '1') return res.json({ ...mapPlaca(JSON.parse(cache.resposta)), cache: true, consultado_em: cache.consultado_em });
    const token = getSettings().fipe_token || process.env.FIPE_TOKEN;
    if (!token) throw bad('Configure o token da FIPE API em Configurações para consultar por placa.');
    let r;
    try {
      r = await fetch(`${FIPE_V2}/plates/${placa}`, { headers: { 'X-Subscription-Token': token, accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
    } catch (e) {
      throw bad('Não foi possível consultar a placa agora. Verifique a conexão com a internet.', 502);
    }
    if (r.status === 401 || r.status === 403) throw bad('Token da FIPE API inválido ou sem permissão para consulta de placa. Confira em Configurações.', 502);
    if (r.status === 429) throw bad('Limite diário de consultas de placa da FIPE API atingido. Tente amanhã ou preencha manualmente.', 429);
    if (r.status === 404) throw bad('Placa não encontrada na base da FIPE API.', 404);
    if (!r.ok) throw bad(`A FIPE API respondeu com erro (${r.status}). Tente novamente mais tarde.`, 502);
    const j = await r.json();
    if (!j || !j.brand) throw bad('Placa não encontrada na base da FIPE API.', 404);
    db.prepare(`INSERT INTO placa_consultas(placa,resposta) VALUES (?,?) ON CONFLICT(placa) DO UPDATE SET resposta=excluded.resposta, consultado_em=datetime('now','localtime')`).run(placa, JSON.stringify(j));
    const restante = r.headers.get('x-plate-quota-remaining');
    res.json({ ...mapPlaca(j), cache: false, cota_restante: restante != null ? Number(restante) : null });
  });

  function salvarFipe(id, f) {
    db.prepare(`UPDATE veiculos SET fipe_valor=?, fipe_referencia=?, fipe_codigo=COALESCE(?,fipe_codigo), fipe_tipo=COALESCE(?,fipe_tipo),
      fipe_marca=COALESCE(?,fipe_marca), fipe_modelo=COALESCE(?,fipe_modelo), fipe_ano=COALESCE(?,fipe_ano), fipe_atualizado_em=datetime('now','localtime') WHERE id=?`)
      .run(f.valor, f.referencia || null, f.codigo || null, f.tipo || null, f.marca || null, f.modelo || null, f.ano || null, id);
    db.prepare('INSERT INTO fipe_historico(veiculo_id,valor,referencia,origem) VALUES (?,?,?,?)').run(id, f.valor, f.referencia || null, f.origem || 'manual');
  }
  api.post('/veiculos/:id/fipe', can('estoque'), (req, res) => {
    const f = req.body || {};
    if (!(Number(f.valor) > 0)) throw bad('Informe o valor FIPE.');
    salvarFipe(req.params.id, { ...f, valor: Number(f.valor) });
    res.json({ ok: true });
  });
  async function atualizarUm(v) {
    if (!v.fipe_marca || !v.fipe_modelo || !v.fipe_ano) throw bad('Este veículo não tem a consulta FIPE vinculada. Faça a consulta pela primeira vez.');
    const r = await fipeGet(`${tipoOk(v.fipe_tipo)}/marcas/${v.fipe_marca}/modelos/${v.fipe_modelo}/anos/${v.fipe_ano}`);
    salvarFipe(v.id, { valor: parseValor(r.Valor), referencia: r.MesReferencia, codigo: r.CodigoFipe, origem: 'api' });
    return parseValor(r.Valor);
  }
  api.post('/veiculos/:id/fipe/atualizar', can('estoque'), async (req, res) => {
    const v = db.prepare('SELECT * FROM veiculos WHERE id=?').get(req.params.id);
    res.json({ valor: await atualizarUm(v) });
  });
  api.post('/fipe/atualizar-todos', can('estoque'), async (req, res) => {
    const list = db.prepare("SELECT * FROM veiculos WHERE status!='vendido' AND fipe_marca IS NOT NULL AND fipe_modelo IS NOT NULL AND fipe_ano IS NOT NULL").all();
    let ok = 0; const erros = [];
    for (const v of list) {
      try { await atualizarUm(v); ok++; } catch (e) { erros.push(`${descVeiculo(v)}: ${e.message}`); }
      await new Promise((r) => setTimeout(r, 400));
    }
    res.json({ atualizados: ok, total: list.length, erros });
  });
};
module.exports.enrich = enrich;
