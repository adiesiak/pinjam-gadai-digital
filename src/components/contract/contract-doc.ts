/**
 * Dokumen e-contract: CSS cetak + pembungkus HTML.
 * Dipakai oleh blok kontrak pinjaman & gadai untuk preview dan unduh PDF.
 */
export const CONTRACT_CSS = `@page{size:A4;margin:0}
*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{font-family:Arial,Helvetica,sans-serif;color:#0f172a;background:#fff;padding:11mm 12mm 13mm;max-width:210mm;margin:0 auto;font-size:10.5px;line-height:1.6}
h1{font-size:20px;line-height:1.25;text-align:left;margin:0 0 10px;color:#0f172a;letter-spacing:-.01em}
h2{font-size:11px;text-transform:uppercase;letter-spacing:.06em;margin:18px 0 6px;padding-left:8px;border-left:3px solid #3b82f6;break-after:avoid}
p,li{font-size:10.5px;line-height:1.65;margin:4px 0}
ol{padding-left:18px}
.kop{display:flex;align-items:center;justify-content:space-between;gap:20px;background:#0f172a;color:#fff;padding:18px 22px;border-radius:5px;margin:0 0 18px;break-inside:avoid}
.kop-kiri{display:flex;align-items:center;gap:12px;min-width:0}
.kop-logo{width:36px;height:36px;flex:none;color:#38bdf8}
.kop-judul{font:700 20px/1.1 Arial,Helvetica,sans-serif;letter-spacing:.05em;color:#38bdf8;margin:0}
.kop-sub{font:7.5px/1.4 Arial,Helvetica,sans-serif;letter-spacing:.16em;text-transform:uppercase;color:#cbd5e1;margin:5px 0 0}
.kop-kanan{display:flex;flex-direction:column;align-items:flex-end;gap:4px;text-align:right;flex:none}
.kop-badge{border:1px solid #38bdf8;color:#bae6fd;border-radius:999px;padding:1px 8px;font:600 8px/1.5 Arial,Helvetica,sans-serif;letter-spacing:.06em;text-transform:uppercase}
.kop-ref{font:600 9.5px/1.4 Arial,Helvetica,sans-serif;color:#e2e8f0;font-variant-numeric:tabular-nums;white-space:nowrap}
.info-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:0 0 16px;break-inside:avoid}
.info-card{border:1px solid #e2e8f0;background:#f8fafc;border-radius:5px;padding:12px 14px 10px}
.info-card h3{font:700 7.5px/1.4 Arial,Helvetica,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#475569;margin:0 0 8px;padding-bottom:7px;border-bottom:1px solid #e2e8f0}
.info-card dl{display:grid;grid-template-columns:auto 1fr;gap:4px 10px;margin:0}
.info-card dt{font:400 8.5px/1.5 Arial,Helvetica,sans-serif;color:#64748b}
.info-card dd{font:600 8.5px/1.5 Arial,Helvetica,sans-serif;color:#0f172a;text-align:right;margin:0;overflow-wrap:anywhere}
.muted{color:#64748b;font-size:9px;line-height:1.5;margin:2px 0 0}
.rincian{width:100%;border-collapse:collapse;margin:8px 0 8px;font-size:10px;break-inside:avoid}
.rincian th,.rincian td{border:0;border-bottom:1px solid #e2e8f0;padding:7px 9px;text-align:left}
.rincian th{background:#f1f5f9;border-bottom:1px solid #e2e8f0;font:700 8px/1.4 Arial,Helvetica,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#334155}
.rincian td.angka{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.rincian td.potongan,.rincian td.potongan.angka{color:#dc2626}
.rincian tr.bersih td{background:#f0fdf4;color:#166534;font-weight:700}
.rincian tr.total td{background:#eff6ff;color:#1e3a8a;font-weight:700;font-size:12px;border-top:2px solid #bfdbfe;border-bottom:1px solid #bfdbfe}
.tagihan{display:flex;justify-content:space-between;align-items:center;gap:16px;background:#eff6ff;border:1px solid #bfdbfe;border-left:3px solid #3b82f6;border-radius:5px;padding:12px 16px;margin:8px 0 14px;break-inside:avoid}
.tagihan span{display:block;font:700 9px/1.4 Arial,Helvetica,sans-serif;letter-spacing:.04em;text-transform:uppercase;color:#1d4ed8}
.tagihan p{font:8px/1.5 Arial,Helvetica,sans-serif;color:#475569;margin:3px 0 0}
.tagihan strong{font:700 18px/1.2 Arial,Helvetica,sans-serif;color:#1e3a8a;white-space:nowrap}
.warning{background:#fffbeb;border:1px solid #fde68a;border-left:3px solid #f59e0b;border-radius:5px;padding:12px 14px;margin:18px 0 0;break-inside:avoid}
.warning strong{display:block;font:700 9px/1.4 Arial,Helvetica,sans-serif;letter-spacing:.04em;text-transform:uppercase;color:#92400e;margin-bottom:4px}
.warning p{font-size:8.5px;line-height:1.6;color:#78350f;margin:0}
.ttd{display:flex;justify-content:space-between;align-items:flex-start;margin-top:36px;gap:24px;break-inside:avoid}
.ttd>div{flex:1;text-align:center;font-size:12px}
.garis{border-top:1px solid #1c1a15;margin-top:14px;padding-top:4px;font-weight:600}
.ttd-slot{display:grid;place-items:center;height:118px}
.signature{display:block;object-fit:contain;max-width:100%;height:68px}
.signature-placeholder{display:grid;place-items:center;width:100%;height:68px;border:1px dashed #a8b2bd;color:#64748b;font:11px ui-sans-serif,system-ui,sans-serif}
.stamp-bulat{width:108px;height:108px;color:#1d4ed8}
.stamp-bulat text{font:900 25px Arial,Helvetica,sans-serif;fill:currentColor;letter-spacing:.02em}
.footer-dok{display:flex;flex-direction:column;gap:6px;border-top:1px solid #e2e8f0;padding-top:14px;margin-top:28px;font:8px/1.6 Arial,Helvetica,sans-serif;color:#94a3b8}
.verif{display:flex;gap:14px;align-items:flex-start;border:1px solid #bfdbfe;background:#eff6ff;border-radius:6px;padding:12px 14px;margin-top:26px;break-inside:avoid}
.verif-qr{width:88px;height:88px;flex:none;border:1px solid #cbd5e1;border-radius:4px;background:#fff;object-fit:contain}
.verif-qr-kosong{display:grid;place-items:center;font:700 10px Arial,Helvetica,sans-serif;color:#94a3b8;letter-spacing:.14em}
.verif-teks{min-width:0}
.verif-judul{font:700 9px/1.3 Arial,Helvetica,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#1e40af;margin:0 0 3px}
.verif p{font:8.5px/1.65 Arial,Helvetica,sans-serif;margin:2px 0;color:#334155}
.verif-kode{font-weight:700;letter-spacing:.08em;color:#1e40af}
.verif-hash{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:8px;word-break:break-all;color:#475569}
@media (min-width:768px){.footer-dok{flex-direction:row;justify-content:space-between;align-items:center;gap:8px}}
@media print{.no-print{display:none}body{padding:11mm 12mm 13mm} .info-grid,.rincian,.warning,.verif,.ttd{break-inside:avoid}}
@media (max-width:640px){.info-grid{grid-template-columns:1fr}body{padding:16px}.kop{padding:16px}}`;

export function wrapContractHtml(inner: string): string {
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"/><title>Dokumen PINDAI</title><style>${CONTRACT_CSS}</style></head><body>${inner}</body></html>`;
}
