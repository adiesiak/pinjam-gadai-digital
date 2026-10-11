/**
 * Dokumen e-contract: CSS cetak + pembungkus HTML.
 * Dipakai oleh blok kontrak pinjaman & gadai untuk preview dan unduh PDF.
 */
export const CONTRACT_CSS = `body{font-family:ui-serif,Georgia,serif;color:#1c1a15;padding:28px;max-width:720px;margin:0 auto}
h1{font-size:17px;text-align:center;margin:0 0 4px}
h2{font-size:13px;margin:16px 0 6px}
p,li{font-size:12px;line-height:1.65;margin:4px 0}
ol{padding-left:18px}
.kop{display:flex;align-items:center;justify-content:space-between;gap:16px;border-bottom:2px solid #064E3B;padding-bottom:16px;margin-bottom:24px}
.kop-kiri{display:flex;align-items:center;gap:10px;min-width:0}
.kop-logo{width:38px;height:38px;flex:none;color:#064E3B}
.kop-judul{font:700 13px/1.3 ui-sans-serif,system-ui,sans-serif;letter-spacing:.04em;color:#064E3B;margin:0}
.kop-sub{font:10px/1.45 ui-sans-serif,system-ui,sans-serif;color:#655e4d;margin:2px 0 0}
.kop-kanan{display:flex;flex-direction:column;align-items:flex-end;gap:5px;text-align:right;font:10px/1.4 ui-sans-serif,system-ui,sans-serif;color:#3b3529;flex:none}
.kop-badge{border:1px solid #064E3B;color:#064E3B;border-radius:999px;padding:2px 9px;font-weight:700;letter-spacing:.06em}
.kop-ref{font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap}
.rincian{width:100%;border-collapse:collapse;margin:8px 0 6px;font-size:12px}
.rincian th,.rincian td{border:1px solid #e2e8f0;padding:6px 9px;text-align:left}
.rincian th{background:#f8fafc;font-weight:600;color:#3b3529}
.rincian td.angka{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.rincian tr.total td{font-weight:700;color:#064E3B;background:#f0fdf4}
.ttd{display:flex;justify-content:space-between;align-items:flex-start;margin-top:36px;gap:24px}
.ttd>div{flex:1;text-align:center;font-size:12px}
.garis{border-top:1px solid #1c1a15;margin-top:14px;padding-top:4px;font-weight:600}
.ttd-slot{display:grid;place-items:center;height:118px}
.signature{display:block;object-fit:contain;max-width:100%;height:68px}
.signature-placeholder{display:grid;place-items:center;width:100%;height:68px;border:1px dashed #a8b2bd;color:#64748b;font:11px ui-sans-serif,system-ui,sans-serif}
.stamp-bulat{width:108px;height:108px;color:#8b493d}
.stamp-bulat text{font:700 9px ui-sans-serif,system-ui,sans-serif;fill:currentColor;letter-spacing:.08em}
.stamp-bulat text.kecil{font:700 7.5px ui-sans-serif,system-ui,sans-serif;letter-spacing:.12em}
.footer-dok{display:flex;flex-direction:column;gap:8px;border-top:1px solid #e2e8f0;padding-top:16px;margin-top:32px;font:11px/1.6 ui-sans-serif,system-ui,sans-serif;color:#64748b}
@media (min-width:768px){.footer-dok{flex-direction:row;justify-content:space-between;align-items:center;gap:8px}}
@media print{.no-print{display:none}}`;

export function wrapContractHtml(inner: string): string {
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"/><title>Dokumen PINDAI</title><style>${CONTRACT_CSS}</style></head><body>${inner}</body></html>`;
}
