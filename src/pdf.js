const path = require('path');
const PDFDocument = require('pdfkit');
const { getSettings } = require('./db');
const { dataBR } = require('./util');

const LOGO = path.join(__dirname, 'assets', 'm2-logo-fundo-claro.png');
const INK = '#111111', MUTED = '#626268', GOLD = '#d6a63d', LINE = '#dedee3';

function toBuffer(doc) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}

function header(doc, s) {
  const top = 36;
  doc.image(LOGO, doc.page.margins.left, top, { width: 92 });
  const info = [s.razao_social || s.empresa_nome, s.cnpj ? `CNPJ ${s.cnpj}` : '', [s.endereco, [s.cidade, s.uf].filter(Boolean).join('/')].filter(Boolean).join(' – '), [s.telefone, s.email].filter(Boolean).join(' · ')].filter(Boolean);
  doc.font('Helvetica').fontSize(8).fillColor(MUTED);
  doc.text(info.join('\n'), doc.page.margins.left + 150, top + 4, { width: doc.page.width - doc.page.margins.left - doc.page.margins.right - 150, align: 'right' });
  const y = top + 52;
  doc.moveTo(doc.page.margins.left, y).lineTo(doc.page.width - doc.page.margins.right, y).lineWidth(1.2).strokeColor(GOLD).stroke();
  doc.y = y + 22;
  doc.x = doc.page.margins.left;
  doc.fillColor(INK);
}

function footer(doc, text) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const bottom = doc.page.height - 34;
    const oldMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.font('Helvetica').fontSize(7).fillColor(MUTED);
    if (text) doc.text(text, doc.page.margins.left, bottom - 18, { width: doc.page.width - doc.page.margins.left - doc.page.margins.right - 60, lineBreak: true, height: 26 });
    doc.text(`Página ${i + 1} de ${range.count}`, doc.page.width - doc.page.margins.right - 60, bottom, { width: 60, align: 'right' });
    doc.page.margins.bottom = oldMargin;
  }
}

// texto com **negrito** inline
function richParagraph(doc, text, opts = {}) {
  const parts = String(text).split(/(\*\*[^*]+\*\*)/g).filter((p) => p !== '');
  if (!parts.length) return;
  parts.forEach((p, i) => {
    const bold = /^\*\*[^*]+\*\*$/.test(p);
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').text(bold ? p.slice(2, -2) : p, { ...opts, continued: i < parts.length - 1 });
  });
}

function ensureSpace(doc, h) {
  if (doc.y + h > doc.page.height - doc.page.margins.bottom) doc.addPage();
}

function signatureLine(doc, x, y, w, nome, sub, img) {
  if (img) {
    try {
      const buf = Buffer.from(String(img).split(',')[1] || '', 'base64');
      doc.image(buf, x + w / 2 - 70, y - 50, { fit: [140, 46], align: 'center' });
    } catch (e) { /* imagem inválida */ }
  }
  doc.moveTo(x, y).lineTo(x + w, y).lineWidth(0.7).strokeColor(INK).stroke();
  doc.font('Helvetica-Bold').fontSize(9).fillColor(INK).text(nome || '', x, y + 5, { width: w, align: 'center' });
  doc.font('Helvetica').fontSize(8).fillColor(MUTED).text(sub || '', x, doc.y + 1, { width: w, align: 'center' });
  doc.fillColor(INK);
}

function signatureBlock(doc, kind, d, ctx) {
  ensureSpace(doc, 120);
  doc.moveDown(3.2);
  const left = doc.page.margins.left, width = doc.page.width - left - doc.page.margins.right;
  const y = doc.y;
  const emp = { nome: ctx.empresa.razao_social || ctx.empresa.nome, sub: `VENDEDORA${ctx.empresa.cnpj ? ' · CNPJ ' + ctx.empresa.cnpj : ''}` };
  const signedImg = d.assinatura_img || null;
  const cli = { nome: d.assinatura_nome || ctx.cliente.nome, sub: `COMPRADOR(A)${(d.assinatura_doc || ctx.cliente.cpf_cnpj) ? ' · CPF/CNPJ ' + (d.assinatura_doc || ctx.cliente.cpf_cnpj) : ''}` };
  if (kind === 'assinaturas') {
    const w = (width - 40) / 2;
    signatureLine(doc, left, y, w, emp.nome, emp.sub);
    const yy = doc.y;
    signatureLine(doc, left + w + 40, y, w, cli.nome, cli.sub, signedImg);
    doc.y = Math.max(yy, doc.y);
  } else {
    const w = 260, x = left + (width - w) / 2;
    if (kind === 'assinatura_empresa') signatureLine(doc, x, y, w, emp.nome, emp.sub.replace('VENDEDORA', 'RECEBEDORA'));
    if (kind === 'assinatura_cliente') signatureLine(doc, x, y, w, cli.nome, cli.sub, signedImg);
    if (kind === 'assinatura_fornecedor') {
      const f = ctx.fornecedor || {};
      signatureLine(doc, x, y, w, d.assinatura_nome || f.nome, `VENDEDOR(A) DO VEÍCULO${(d.assinatura_doc || f.cpf_cnpj) ? ' · CPF/CNPJ ' + (d.assinatura_doc || f.cpf_cnpj) : ''}`, signedImg);
    }
  }
  doc.x = left;
  doc.moveDown(1.5);
}

async function documentoPDF(d, ctx) {
  const s = getSettings();
  const doc = new PDFDocument({ size: 'A4', margins: { top: 40, left: 56, right: 56, bottom: 64 }, bufferPages: true, info: { Title: d.titulo, Author: s.empresa_nome } });
  doc.on('pageAdded', () => header(doc, s));
  header(doc, s);
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const blocks = String(d.conteudo).replace(/\r/g, '').split(/\n\s*\n/);
  for (const raw of blocks) {
    const b = raw.trim();
    if (!b) continue;
    const sig = b.match(/^\{\{\s*(assinaturas|assinatura_empresa|assinatura_fornecedor|assinatura_cliente)\s*\}\}$/);
    if (sig) { signatureBlock(doc, sig[1], d, ctx); continue; }
    if (b.startsWith('# ')) {
      doc.font('Helvetica-Bold').fontSize(14).fillColor(INK).text(b.slice(2).trim(), { align: 'center', width });
      doc.moveDown(1.1);
      continue;
    }
    if (b.startsWith('## ')) {
      ensureSpace(doc, 50);
      doc.moveDown(0.3);
      doc.font('Helvetica-Bold').fontSize(10.5).fillColor(INK).text(b.slice(3).trim(), { width });
      doc.moveDown(0.4);
      continue;
    }
    doc.fontSize(10).fillColor(INK);
    const lines = b.split('\n');
    const isList = lines.length > 1;
    lines.forEach((ln) => {
      richParagraph(doc, ln.trim(), { align: isList ? 'left' : 'justify', width, lineGap: 2.5, indent: isList ? 14 : 0 });
    });
    doc.moveDown(0.8);
  }
  let foot = `${s.empresa_nome} · Documento nº ${d.id} gerado em ${dataBR(d.criado_em)}`;
  if (d.assinado_em) {
    foot = `Assinado eletronicamente por ${d.assinatura_nome} (CPF/CNPJ ${d.assinatura_doc}) em ${d.assinado_em} · IP ${d.assinatura_ip} · Hash SHA-256 do conteúdo: ${d.assinatura_hash}`;
  }
  footer(doc, foot);
  return toBuffer(doc);
}

// Relatório genérico em tabela
async function relatorioPDF({ titulo, subtitulo, secoes }) {
  const s = getSettings();
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margins: { top: 40, left: 40, right: 40, bottom: 56 }, bufferPages: true, info: { Title: titulo } });
  doc.on('pageAdded', () => header(doc, s));
  header(doc, s);
  const left = doc.page.margins.left, width = doc.page.width - left - doc.page.margins.right;
  doc.font('Helvetica-Bold').fontSize(16).fillColor(INK).text(titulo, left, doc.y, { width });
  if (subtitulo) doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(subtitulo, { width });
  doc.moveDown(0.8);

  for (const sec of secoes) {
    ensureSpace(doc, 70);
    if (sec.titulo) { doc.font('Helvetica-Bold').fontSize(11).fillColor(INK).text(sec.titulo, left, doc.y, { width }); doc.moveDown(0.4); }
    if (sec.resumo) {
      // pares rótulo/valor em grade
      const cols = 4, cw = width / cols;
      sec.resumo.forEach(([k, v], i) => {
        if (i % cols === 0) { ensureSpace(doc, 34); if (i) doc.y += 30; }
        const x = left + (i % cols) * cw, y = doc.y;
        doc.font('Helvetica').fontSize(8).fillColor(MUTED).text(k, x, y, { width: cw - 10 });
        doc.font('Helvetica-Bold').fontSize(11).fillColor(INK).text(String(v), x, y + 11, { width: cw - 10 });
        doc.y = y;
      });
      doc.y += 34; doc.x = left;
      doc.moveDown(0.4);
    }
    if (sec.colunas) {
      const totalW = sec.colunas.reduce((a, c) => a + (c.w || 1), 0);
      const widths = sec.colunas.map((c) => ((c.w || 1) / totalW) * width);
      const drawHead = () => {
        const y = doc.y;
        doc.rect(left, y, width, 18).fill('#f5f5f7');
        let x = left;
        doc.font('Helvetica-Bold').fontSize(8).fillColor(INK);
        sec.colunas.forEach((c, i) => { doc.text(c.label, x + 4, y + 5, { width: widths[i] - 8, align: c.align || 'left', lineBreak: false, ellipsis: true }); x += widths[i]; });
        doc.y = y + 20;
      };
      drawHead();
      const rows = [...(sec.linhas || [])];
      if (sec.total) rows.push({ __total: true, cells: sec.total });
      for (const r of rows) {
        const cells = r.__total ? r.cells : r;
        doc.font(r.__total ? 'Helvetica-Bold' : 'Helvetica').fontSize(8);
        const h = Math.max(14, ...cells.map((c, i) => doc.heightOfString(String(c ?? ''), { width: widths[i] - 8 }) + 5));
        if (doc.y + h > doc.page.height - doc.page.margins.bottom) { doc.addPage(); drawHead(); }
        const y = doc.y;
        let x = left;
        doc.fillColor(INK);
        cells.forEach((c, i) => { doc.text(String(c ?? ''), x + 4, y + 3, { width: widths[i] - 8, align: sec.colunas[i].align || 'left' }); x += widths[i]; });
        doc.moveTo(left, y + h).lineTo(left + width, y + h).lineWidth(0.5).strokeColor(r.__total ? INK : LINE).stroke();
        doc.y = y + h + 1;
      }
      if (!rows.length) doc.font('Helvetica').fontSize(9).fillColor(MUTED).text('Nenhum registro no período.', left, doc.y + 4);
      doc.x = left;
      doc.moveDown(1.2);
    }
  }
  footer(doc, `${s.empresa_nome} · Relatório gerado em ${new Date().toLocaleString('pt-BR')}`);
  return toBuffer(doc);
}

module.exports = { documentoPDF, relatorioPDF };
