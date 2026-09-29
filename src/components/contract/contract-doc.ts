/**
 * Dokumen e-contract: CSS cetak + pembungkus HTML.
 * Dipakai oleh blok kontrak pinjaman & gadai untuk preview dan unduh PDF.
 */
export const CONTRACT_CSS = `body{font-family:ui-serif,Georgia,serif;color:#1c1a15;padding:28px;max-width:720px;margin:0 auto}
h1{font-size:17px;text-align:center;margin:0 0 4px}
h2{font-size:13px;margin:16px 0 6px}
p,li{font-size:12px;line-height:1.65;margin:4px 0}
ol{padding-left:18px}
.nomor{text-align:center;font-size:11px;color:#655e4d;margin-bottom:14px}
.ttd{display:flex;justify-content:space-between;margin-top:36px;gap:24px}
.ttd>div{flex:1;text-align:center;font-size:12px} .garis{border-top:1px solid #1c1a15;margin-top:14px;padding-top:4px;font-weight:600}
.signature{display:block;object-fit:contain;width:100%;height:68px;margin:8px auto 0}
.signature-placeholder{display:grid;place-items:center;width:100%;height:68px;margin:8px auto 0;border:1px dashed #a8b2bd;color:#64748b;font:11px ui-sans-serif,system-ui,sans-serif}
.persetujuan{font:10px/1.5 ui-sans-serif,system-ui,sans-serif;color:#475569;margin-top:8px}
@media print{.no-print{display:none}}`;

export function wrapContractHtml(inner: string): string {
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"/><title>Dokumen PINDAI</title><style>${CONTRACT_CSS}</style></head><body>${inner}</body></html>`;
}
