/**
 * Uji aturan promo bunga harian.
 * Run: bun src/lib/promoBunga.test.ts
 *
 * Yang dijaga: promo menggantikan bunga tenor, tidak pernah menaikkannya,
 * pemilihan promo deterministik saat tumpang tindih, dan validasi menolak
 * angka yang tidak akan pernah memotong (di atas 25%).
 */
import {
  BATAS_PROMO_BUNGA,
  bungaSetelahPromo,
  periksaIsiPromoBunga,
  pilihPromoBunga,
  potonganPoinPersen,
  pratinjauPromoBunga,
  promoBerlakuUntuk,
  statusPromoBunga,
  tenorPromoValid,
} from "./promoBunga";

let lulus = 0;
let gagal = 0;

function ok(syarat: boolean, label: string): void {
  if (syarat) lulus += 1;
  else {
    gagal += 1;
    console.error(`FAIL ${label}`);
  }
}

function eq(hasil: unknown, acuan: unknown, label: string): void {
  ok(hasil === acuan, `${label} (dapat ${String(hasil)}, harus ${String(acuan)})`);
}

const HARI = 86_400_000;
const SEKARANG = 1_800_000_000_000;

function promo(ubah: Partial<Parameters<typeof pilihPromoBunga>[0][number]> = {}) {
  return {
    _id: "p1",
    nama: "Bunga 15% tenor 7",
    persenBunga: 15,
    tenor: [7],
    mulai: SEKARANG - HARI,
    selesai: SEKARANG + 10 * HARI,
    aktif: true,
    ...ubah,
  };
}

// ===== Status baca admin =====
eq(statusPromoBunga(promo(), SEKARANG), "berjalan", "di dalam rentang = berjalan");
eq(
  statusPromoBunga(promo({ mulai: SEKARANG + HARI }), SEKARANG),
  "dijadwalkan",
  "belum mulai = dijadwalkan",
);
eq(
  statusPromoBunga(promo({ selesai: SEKARANG - HARI }), SEKARANG),
  "berakhir",
  "sudah lewat = berakhir",
);
eq(
  statusPromoBunga(promo({ aktif: false }), SEKARANG),
  "nonaktif",
  "nonaktif menang atas tanggal",
);

// ===== Kelayakan & inklusivitas tanggal =====
ok(promoBerlakuUntuk(promo(), { tenor: 7, sekarang: SEKARANG }), "tenor 7 berlaku");
ok(!promoBerlakuUntuk(promo(), { tenor: 14, sekarang: SEKARANG }), "tenor lain tidak berlaku");
ok(
  promoBerlakuUntuk(promo({ selesai: SEKARANG }), { tenor: 7, sekarang: SEKARANG }),
  "hari terakhir masih berlaku",
);
ok(
  promoBerlakuUntuk(promo({ mulai: SEKARANG }), { tenor: 7, sekarang: SEKARANG }),
  "hari pertama masih berlaku",
);
ok(
  !promoBerlakuUntuk(promo({ aktif: false }), { tenor: 7, sekarang: SEKARANG }),
  "nonaktif tidak pernah berlaku",
);

// ===== Pemilihan saat tumpang tindih =====
const dipilih = pilihPromoBunga(
  [
    promo({ _id: "a", persenBunga: 20 }),
    promo({ _id: "b", persenBunga: 15 }),
    promo({ _id: "c", persenBunga: 18, tenor: [14] }),
  ],
  { tenor: 7, sekarang: SEKARANG },
);
eq(dipilih?._id, "b", "bunga terendah menang");
eq(
  pilihPromoBunga([promo({ aktif: false })], { tenor: 7, sekarang: SEKARANG }),
  null,
  "tidak ada promo berlaku → null",
);

const sama = pilihPromoBunga(
  [
    promo({ _id: "pendek", persenBunga: 15, selesai: SEKARANG + 2 * HARI }),
    promo({ _id: "panjang", persenBunga: 15, selesai: SEKARANG + 20 * HARI }),
  ],
  { tenor: 7, sekarang: SEKARANG },
);
eq(sama?._id, "panjang", "bunga sama → masa berlaku lebih panjang dipilih");

// ===== Bunga setelah promo tidak pernah naik =====
eq(bungaSetelahPromo(30, promo()), 15, "bunga 30% menjadi 15%");
eq(bungaSetelahPromo(28, promo()), 15, "tier 2 juga memakai bunga promo");
eq(bungaSetelahPromo(12, promo()), 12, "promo di atas tarif normal tidak menaikkan bunga");
eq(bungaSetelahPromo(26, null), 26, "tanpa promo = tarif normal");
eq(potonganPoinPersen(30, promo()), 15, "potongan 15 poin");
eq(potonganPoinPersen(12, promo()), 0, "tidak ada potongan bila promo lebih tinggi");

// ===== Validasi isian =====
const sah = {
  nama: "Bunga 15% tenor 7",
  persenBunga: 15,
  tenor: [7],
  mulai: SEKARANG,
  selesai: SEKARANG + HARI,
};
eq(periksaIsiPromoBunga(sah).length, 0, "isian sah tidak menghasilkan galat");
ok(
  periksaIsiPromoBunga({ ...sah, nama: "ab" }).length > 0,
  "nama terlalu pendek ditolak",
);
ok(
  periksaIsiPromoBunga({ ...sah, nama: "x".repeat(BATAS_PROMO_BUNGA.nama + 1) }).length > 0,
  "nama terlalu panjang ditolak",
);
ok(periksaIsiPromoBunga({ ...sah, persenBunga: 0 }).length > 0, "bunga 0% ditolak");
ok(periksaIsiPromoBunga({ ...sah, persenBunga: 26 }).length > 0, "bunga 26% ditolak");
ok(periksaIsiPromoBunga({ ...sah, persenBunga: 15.5 }).length > 0, "bunga desimal ditolak");
ok(periksaIsiPromoBunga({ ...sah, tenor: [] }).length > 0, "tanpa tenor ditolak");
ok(periksaIsiPromoBunga({ ...sah, tenor: [9] }).length > 0, "tenor asing ditolak");
ok(periksaIsiPromoBunga({ ...sah, tenor: [7, 7] }).length > 0, "tenor ganda ditolak");
ok(
  periksaIsiPromoBunga({ ...sah, selesai: SEKARANG - HARI }).length > 0,
  "selesai sebelum mulai ditolak",
);
ok(tenorPromoValid([7, 14, 21, 28]), "seluruh tenor sah diterima");

// ===== Pratinjau tier =====
const pratinjau = pratinjauPromoBunga([14, 7], 15, (tenor) => ({
  tier1: tenor === 7 ? 30 : 35,
  tier2: tenor === 7 ? 28 : 32,
  tier3: tenor === 7 ? 26 : 28,
}));
eq(pratinjau.length, 2, "dua tenor dipratinjau");
eq(pratinjau[0].tenor, 7, "pratinjau diurut naik");
eq(pratinjau[0].promo, 15, "bunga promo dibawa apa adanya");
eq(pratinjau[0].potonganTerbesar, 15, "potongan terbesar dari tier 1");
eq(pratinjau[1].potonganTerbesar, 20, "tenor 14 memeotong lebih besar");

const jumlah = lulus + gagal;
console.log(`promoBunga.test: ${lulus}/${jumlah} lulus`);
if (gagal > 0) process.exit(1);
