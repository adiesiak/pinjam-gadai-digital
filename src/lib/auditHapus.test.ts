/**
 * Uji ringkasan penghapusan Audit Trail.
 * Run: bun src/lib/auditHapus.test.ts
 *
 * Angka harapan ditulis tangan dari aturan produk: setiap baris yang ikut
 * terhapus dihitung sekali, jurnal ledger dihitung sebagai "dipertahankan",
 * dan baris lama tanpa rincian terstruktur TIDAK dikarang angkanya.
 */
import {
  AKSI_HAPUS,
  AKSI_PER_JENIS,
  JENIS_HAPUS,
  aksiHapus,
  labelBarisHapus,
  rangkumAuditHapus,
  ringkasRincianHapus,
  type BarisAuditHapus,
  type RincianHapus,
} from "./auditHapus";

let passed = 0;
let failed = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  if (actual === expected) passed += 1;
  else {
    failed += 1;
    console.error(
      `FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

function rincian(patch: Partial<RincianHapus> = {}): RincianHapus {
  return {
    menyeluruh: false,
    alokasiDana: 0,
    catatanTransfer: 0,
    buktiBayar: 0,
    pengingat: 0,
    logWhatsapp: 0,
    jejakLokasi: 0,
    jurnalDipertahankan: 0,
    ...patch,
  };
}

// ===== Daftar aksi & filter =====

// Setiap jenis filter harus menunjuk aksi yang benar-benar ada di daftar aksi.
for (const jenis of JENIS_HAPUS) {
  const aksi = AKSI_PER_JENIS[jenis];
  eq(aksi.length > 0, true, `filter "${jenis}" punya aksi`);
  for (const a of aksi) {
    eq((AKSI_HAPUS as readonly string[]).includes(a), true, `aksi "${a}" terdaftar`);
  }
}

eq(aksiHapus("loan_delete"), true, "loan_delete dikenali");
eq(aksiHapus("pawn_delete"), true, "pawn_delete dikenali");
eq(aksiHapus("kredit_delete"), true, "kredit_delete dikenali");
eq(aksiHapus("pinjaman_hapus_lama"), true, "peminjaman_hapus_lama dikenali");
eq(aksiHapus("config_save"), false, "aksi non-hapus tidak dikenali");
eq(aksiHapus("loan_delete_semua"), false, "awalan yang mirip tidak dikenali");

// ===== Penjumlahan rincian =====

const baris: BarisAuditHapus[] = [
  {
    aktorLabel: "admin@pindai.test",
    aksi: "loan_delete",
    target: "PGD-1",
    detail: "Rani — pokok Rp 1.000.000; PENGHAPUSAN MENYELURUH: …",
    waktu: 300,
    rincianHapus: rincian({
      menyeluruh: true,
      alokasiDana: 1,
      catatanTransfer: 1,
      buktiBayar: 1,
      pengingat: 2,
      logWhatsapp: 3,
      jejakLokasi: 5,
      jurnalDipertahankan: 2,
    }),
  },
  {
    aktorLabel: "admin@pindai.test",
    aksi: "kredit_delete",
    target: "KRD-9",
    detail: "Budi — Smartphone, status didanai; alasan: salah input",
    waktu: 200,
    rincianHapus: rincian({ menyeluruh: true, alokasiDana: 2, jurnalDipertahankan: 4 }),
  },
  {
    aktorLabel: "admin@pindai.test",
    aksi: "pawn_delete",
    target: "GD-7",
    detail: "Sari — cincin, status diajukan; alasan: salah input",
    waktu: 100,
    rincianHapus: rincian(),
  },
  // Baris lama: tanpa kolom terstruktur, meski detailnya menyebut menyeluruh.
  {
    aktorLabel: "admin@pindai.test",
    aksi: "loan_delete",
    target: "PGD-0",
    detail: "Lama — PENGHAPUSAN MENYELURUH: 1 alokasi dana.",
    waktu: 50,
  },
  // Bukan aksi hapus: harus diabaikan sepenuhnya.
  { aktorLabel: "admin@pindai.test", aksi: "config_save", target: "global", waktu: 10 },
];

const ringkas = rangkumAuditHapus(baris);
eq(ringkas.jumlah, 4, "empat baris hapus dihitung");
eq(ringkas.perJenis.loan_delete, 2, "dua penghapusan pinjaman");
eq(ringkas.perJenis.pawn_delete, 1, "satu penghapusan gadai");
eq(ringkas.perJenis.kredit_delete, 1, "satu penghapusan kredit");
eq(ringkas.perJenis.pinjaman_hapus_lama, 0, "tanpa pembersihan pinjaman lama");
eq(ringkas.menyeluruh, 2, "dua penghapusan menyeluruh (dari rincian, bukan teks)");
eq(ringkas.alokasiDana, 3, "total alokasi dana dihapus");
eq(ringkas.catatanTransfer, 1, "total catatan transfer dihapus");
eq(ringkas.buktiBayar, 1, "total bukti bayar dihapus");
eq(ringkas.pengingat, 2, "total pengingat dihapus");
eq(ringkas.logWhatsapp, 3, "total log WhatsApp dihapus");
eq(ringkas.jejakLokasi, 5, "total jejak lokasi dihapus");
eq(ringkas.jurnalDipertahankan, 6, "total entri jurnal dipertahankan (2 + 4)");
eq(ringkas.tanpaRincian, 1, "satu baris lama tanpa rincian tidak dikarang angkanya");

// Daftar kosong tidak boleh menghasilkan angka apa pun.
const kosong = rangkumAuditHapus([]);
eq(kosong.jumlah, 0, "daftar kosong: nol baris");
eq(kosong.jurnalDipertahankan, 0, "daftar kosong: nol jurnal");

// ===== Ringkasan teks satu baris =====

eq(
  ringkasRincianHapus(baris[0].rincianHapus as RincianHapus),
  "1 alokasi dana · 1 catatan transfer · 1 bukti bayar · 2 pengingat · 3 log WhatsApp · 5 jejak lokasi · 2 entri jurnal dipertahankan",
  "rincian penuh dibaca urut",
);
eq(
  ringkasRincianHapus(baris[2].rincianHapus as RincianHapus),
  "tanpa baris turunan",
  "rincian nol tidak menampilkan deretan angka nol",
);
eq(
  ringkasRincianHapus(rincian({ menyeluruh: true, jurnalDipertahankan: 3 })),
  "3 entri jurnal dipertahankan",
  "hanya jurnal yang dipertahankan tetap disebut",
);

// ===== Label baris =====

eq(labelBarisHapus(baris[0]), "Pinjaman · menyeluruh", "label menyeluruh dari rincian");
eq(labelBarisHapus(baris[2]), "Gadai", "label biasa tanpa menyeluruh");
eq(
  labelBarisHapus(baris[3]),
  "Pinjaman · menyeluruh",
  "baris lama dibaca dari teks detail, bukan ditebak sebagai biasa",
);
eq(
  labelBarisHapus({ aktorLabel: "a", aksi: "pinjaman_hapus_lama", waktu: 1 }),
  "Pinjaman lama",
  "aksi pembersihan pinjaman lama berlabel sendiri",
);

console.log(`\nauditHapus: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
