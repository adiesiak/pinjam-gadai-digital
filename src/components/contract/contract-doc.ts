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
.cap-slot{display:grid;place-items:center;min-height:68px;margin:8px auto 0}
.pindai-stamp{display:grid;justify-items:center;align-content:center;gap:1px;width:104px;height:104px;padding:8px;border:3px double #8b493d;border-radius:50%;color:#8b493d;text-align:center;font:9px/1.25 ui-sans-serif,system-ui,sans-serif;transform:rotate(-6deg)}
.cap-brankas{width:30px;height:30px;margin-bottom:2px}
.pindai-stamp strong{font-size:11px;letter-spacing:.1em}.pindai-stamp small{font-size:8px;letter-spacing:.06em;font-weight:700}
@media print{.no-print{display:none}}`;

export function wrapContractHtml(inner: string): string {
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"/><title>Dokumen PINDAI</title><style>${CONTRACT_CSS}</style></head><body>${inner}</body></html>`;
}
