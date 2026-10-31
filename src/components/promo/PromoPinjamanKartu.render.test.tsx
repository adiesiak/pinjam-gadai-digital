/**
 * Uji render kartu promo pinjaman. Tanpa Convex: kartu ini murni tampilan.
 * Yang dijaga:
 *  - isi kampanye dan masa berlaku benar-benar tercetak;
 *  - CTA hanya muncul di tempat yang punya tindakan (beranda, /promo, dashboard),
 *    dan tidak ada tautan ke /promo yang dijaga `RequireAdmin`;
 *  - label kecil yang kosong tidak meninggalkan baris kosong.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";

import { PromoPinjamanKartu } from "./PromoPinjamanKartu";
import { formatPeriodePromo, type DataPromoPinjaman } from "@/lib/promoPinjaman";

let passed = 0;
let failed = 0;
function ok(syarat: boolean, label: string): void {
  if (syarat) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${label}`);
  }
}
function ada(html: string, teks: string, label: string): void {
  ok(html.includes(teks), `${label} (memuat "${teks}")`);
}
function tidakAda(html: string, teks: string, label: string): void {
  ok(!html.includes(teks), `${label} (tanpa "${teks}")`);
}

const promo: DataPromoPinjaman = {
  badge: "Promo Oktober",
  judul: "Tenor pilihan lebih panjang",
  deskripsi: "Ajukan pinjaman tenor 28 hari lewat formulir pengajuan.",
  mulai: Date.UTC(2026, 9, 1) - 7 * 3_600_000,
  selesai: Date.UTC(2026, 9, 31, 16, 59, 59, 999) - 7 * 3_600_000,
};

function gambar(
  penempatan: "beranda" | "dashboard" | "promo" | "pengajuan",
  data: DataPromoPinjaman = promo,
): string {
  return renderToStaticMarkup(
    <MemoryRouter>
      <PromoPinjamanKartu
        promo={data}
        penempatan={penempatan}
        onAjukan={() => {}}
      />
    </MemoryRouter>,
  );
}

const beranda = gambar("beranda");
ada(beranda, "Tenor pilihan lebih panjang", "judul kampanye");
ada(beranda, "Ajukan pinjaman tenor 28 hari", "deskripsi kampanye");
ada(beranda, "Promo Oktober", "label kecil");
ada(beranda, formatPeriodePromo(promo.mulai, promo.selesai), "masa berlaku");
ada(beranda, 'id="promo-pinjaman-beranda"', "id judul unik per penempatan");
ada(
  beranda,
  'href="/auth?returnTo=%2Fdashboard%3Ftab%3Dform"',
  "CTA beranda menuju formulir setelah pendaftaran",
);
tidakAda(beranda, 'href="/promo"', "CTA publik tidak menuju /promo yang khusus admin");

const dashboard = gambar("dashboard");
ada(dashboard, "Ajukan pinjaman", "CTA dashboard membuka formulir");
tidakAda(dashboard, "<a ", "dashboard memakai tombol, bukan tautan");
tidakAda(dashboard, 'href="/auth', "dashboard tidak memindahkan halaman");

const halamanPromo = gambar("promo");
ada(halamanPromo, "?tab=promo", "CTA halaman promo menuju pengatur kampanye");
ada(halamanPromo, "Atur promo", "label CTA halaman promo");
ada(halamanPromo, "Berlaku", "awalan masa berlaku");

const form = gambar("pengajuan");
ada(form, "Tenor pilihan lebih panjang", "kampanye tetap terbaca di form");
tidakAda(form, "<button", "form tidak menambah CTA di dalam formulir");
tidakAda(form, "Belum ada", "tidak ada teks status kosong");

const pratinjau = renderToStaticMarkup(
  <MemoryRouter>
    <PromoPinjamanKartu promo={promo} penempatan="beranda" nonaktifkanAksi />
  </MemoryRouter>,
);
ada(pratinjau, "disabled", "pratinjau menonaktifkan CTA");
tidakAda(pratinjau, "<a ", "pratinjau tidak meninggalkan tautan aktif");

const tanpaLabel = gambar("pengajuan", { ...promo, badge: "   " });
tidakAda(tanpaLabel, "Promo Oktober", "label kosong tidak dicetak");
tidakAda(tanpaLabel, "undefined", "tanpa undefined");
tidakAda(tanpaLabel, "NaN", "tanpa NaN");

console.log(`PromoPinjamanKartu.render: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
