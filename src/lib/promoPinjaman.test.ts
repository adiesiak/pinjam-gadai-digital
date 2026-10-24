/**
 * Uji preset kampanye teks promo pinjaman.
 * Run: bun src/lib/promoPinjaman.test.ts
 *
 * Preset dipakai admin sebagai titik awal, jadi isinya harus lolos aturan yang
 * sama dengan isian manual — bukan teks contoh yang langsung ditolak server.
 */
import {
  BATAS_PROMO,
  penempatanSah,
  periksaIsiPromo,
  TEMPLATE_PROMO_PINJAMAN,
} from "./promoPinjaman";

let lulus = 0;
let gagal = 0;

function ok(syarat: boolean, label: string): void {
  if (syarat) lulus += 1;
  else {
    gagal += 1;
    console.error(`FAIL ${label}`);
  }
}

ok(TEMPLATE_PROMO_PINJAMAN.length >= 5, "tersedia beberapa template, bukan satu saja");
ok(
  new Set(TEMPLATE_PROMO_PINJAMAN.map((t) => t.id)).size === TEMPLATE_PROMO_PINJAMAN.length,
  "id template unik",
);

const mulai = Date.UTC(2026, 9, 1) - 7 * 3_600_000;
const selesai = Date.UTC(2026, 9, 31) - 7 * 3_600_000 + 86_399_999;

for (const template of TEMPLATE_PROMO_PINJAMAN) {
  ok(template.label.trim().length > 0, `${template.id}: punya label tombol`);
  ok(
    template.penempatan.length > 0 && template.penempatan.every(penempatanSah),
    `${template.id}: semua tempat tampil dikenal`,
  );
  const kesalahan = periksaIsiPromo({
    badge: template.badge,
    judul: template.judul,
    deskripsi: template.deskripsi,
    mulai,
    selesai,
    penempatan: template.penempatan,
    aktif: true,
  });
  ok(kesalahan.length === 0, `${template.id}: lolos periksaIsiPromo (${kesalahan[0] ?? ""})`);
  ok(
    template.judul.length <= BATAS_PROMO.judul && template.deskripsi.length <= BATAS_PROMO.deskripsi,
    `${template.id}: panjang teks di bawah batas`,
  );
}

// Template tidak boleh menjanjikan angka yang tidak diatur di tempat lain.
const bunga = TEMPLATE_PROMO_PINJAMAN.find((t) => t.id === "bunga-promo");
ok(bunga !== undefined, "ada template untuk kampanye bunga");
ok(
  bunga !== undefined && !/\b\d+%/.test(bunga.judul),
  "template bunga tidak menulis persentase yang bisa salah",
);

const jumlah = lulus + gagal;
console.log(`promoPinjaman.test: ${lulus}/${jumlah} lulus`);
if (gagal > 0) process.exit(1);
