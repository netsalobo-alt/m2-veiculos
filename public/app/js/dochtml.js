// Renderizador de documentos (sem dependências: usado também na página pública de assinatura)
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function docHtml(texto, d = {}) {
  const inline = (s) => esc(s).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  const sigImg = d.assinatura_img ? `<img src="${d.assinatura_img}" alt="Assinatura de ${esc(d.assinatura_nome || '')}">` : '';
  return String(texto || '').replace(/\r/g, '').split(/\n\s*\n/).map((b) => {
    b = b.trim();
    if (!b) return '';
    if (b === '{{assinaturas}}') return `<div class="sig"><div>LOJA (VENDEDORA)</div><div>${sigImg}${esc(d.assinatura_nome || 'COMPRADOR(A)')}</div></div>`;
    if (b === '{{assinatura_empresa}}') return '<div class="sig" style="grid-template-columns:1fr;max-width:320px;margin-inline:auto"><div>LOJA (RECEBEDORA)</div></div>';
    if (b === '{{assinatura_fornecedor}}' || b === '{{assinatura_cliente}}') return `<div class="sig" style="grid-template-columns:1fr;max-width:320px;margin-inline:auto"><div>${sigImg}${esc(d.assinatura_nome || (b.includes('fornecedor') ? 'VENDEDOR(A) DO VEÍCULO' : 'CLIENTE'))}</div></div>`;
    if (b.startsWith('# ')) return `<h1>${inline(b.slice(2))}</h1>`;
    if (b.startsWith('## ')) return `<h2>${inline(b.slice(3))}</h2>`;
    return `<p>${b.split('\n').map(inline).join('<br>')}</p>`;
  }).join('');
}

