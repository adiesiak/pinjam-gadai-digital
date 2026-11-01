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
ok(periksaIsiPromoBunga({ ...sah, tenor: [6] }).length > 0, "tenor di bawah 7 ditolak");
ok(periksaIsiPromoBunga({ ...sah, tenor: [51] }).length > 0, "tenor di atas 50 ditolak");
ok(
  periksaIsiPromoBunga({ ...sah, tenor: [10, 30] }).length === 0,
  "tenor dari tanggal (10 dan 30 hari) diterima",
);
ok(periksaIsiPromoBunga({ ...sah, tenor: [7, 7] }).length > 0, "tenor ganda ditolak");
ok(
  periksaIsiPromoBunga({ ...sah, jenis: "potongan_bunga", persenBunga: 0, potonganPersen: 5 })
    .length === 0,
  "potongan 5 poin sah",
);
ok(
  periksaIsiPromoBunga({ ...sah, jenis: "potongan_bunga", persenBunga: 0, potonganPersen: 0 })
    .length > 0,
  "potongan 0 ditolak",
);
ok(
  periksaIsiPromoBunga({ ...sah, jenis: "bebas_admin", persenBunga: 0 }).length === 0,
  "bebas admin sah tanpa bunga",
);
ok(
  periksaIsiPromoBunga({ ...sah, selesai: SEKARANG - HARI }).length > 0,
  "selesai sebelum mulai ditolak",
);
ok(tenorPromoValid([7, 14, 21, 28]), "seluruh tenor standar diterima");
ok(tenorPromoValid([7, 10, 30, 50]), "tenor dari tanggal diterima");
ok(!tenorPromoValid([7, 51]), "tenor di atas batas harian ditolak");

// ===== Pratinjau tier =====
const pratinjau = pratinjauPromoBunga([14, 7], 15, (tenor) => ({
  tier1: tenor === 7 ? 30 : 35,
  tier2: tenor === 7 ? 28 : 32,
  tier3: tenor === 7 ? 26 : 28,
}));
eq(pratinjau.length, 2, "dua tenor dipratinjau");
eq(pratinjau[0].tenor, 7, "pratinjau diurut naik");
eq(pratinjau[0].promo.tier1, 15, "bunga promo dibawa apa adanya");
eq(pratinjau[0].potonganTerbesar, 15, "potongan terbesar dari tier 1");
eq(pratinjau[1].potonganTerbesar, 20, "tenor 14 memotong lebih besar");
eq(pratinjau[0].promo.tier2, 15, "tier 2 memakai bunga promo yang sama");

const pratinjauTanggal = pratinjauPromoBunga([10, 30], 20, (tenor) => ({
  tier1: tenor === 10 ? 32.14 : 41.5,
  tier2: tenor === 10 ? 30.57 : 38.3,
  tier3: tenor === 10 ? 28.86 : 32.14,
}));
eq(pratinjauTanggal.length, 2, "pratinjau tenor tanggal tetap tampil");
eq(pratinjauTanggal[0].tenor, 10, "tenor 10 ikut dipratinjau");
eq(pratinjauTanggal[0].potonganTerbesar, 12.14, "potongan tenor 10 dihitung dari normal");

// ===== Jenis potongan dan bebas admin =====
const potongan = {
  jenis: "potongan_bunga" as const,
  persenBunga: 0,
  potonganPersen: 5,
};
eq(bungaSetelahPromo(30, potongan), 25, "potongan 5 poin dari bunga 30% menjadi 25%");
eq(bungaSetelahPromo(26, potongan), 21, "potongan bekerja pada tier terendah");
eq(bungaSetelahPromo(3, { ...potongan, potonganPersen: 5 }), 0, "bunga tidak pernah negatif");

const bebasAdmin = { jenis: "bebas_admin" as const, persenBunga: 0 };
eq(bungaSetelahPromo(30, bebasAdmin), 30, "bebas admin tidak mengubah bunga");
eq(potonganPoinPersen(30, bebasAdmin), 0, "bebas admin bukan potongan bunga");

const pilihAdmin = pilihPromoBunga(
  [
    promo({ _id: "admin", jenis: "bebas_admin", persenBunga: 0 }),
    promo({ _id: "normal", jenis: "bunga_pengganti", persenBunga: 30 }),
  ],
  { tenor: 7, sekarang: SEKARANG, persenNormal: 30 },
);
eq(pilihAdmin?._id, "admin", "bebas admin menang bila bunga final sama");

const pilihBunga = pilihPromoBunga(
  [
    promo({ _id: "admin", jenis: "bebas_admin", persenBunga: 0 }),
    promo({ _id: "murah", jenis: "potongan_bunga", persenBunga: 0, potonganPersen: 8 }),
  ],
  { tenor: 7, sekarang: SEKARANG, persenNormal: 30 },
);
eq(pilihBunga?._id, "murah", "potongan 8 poin menang atas bebas admin");

const jumlah = lulus + gagal;
console.log(`promoBunga.test: ${lulus}/${jumlah} lulus`);
if (gagal > 0) process.exit(1);
