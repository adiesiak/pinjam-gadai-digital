/** Run: bun src/lib/laporanTransfer.test.ts */
import {
  adaSaringan,
  keCsvTransfer,
  KOLOM_CSV_TRANSFER,
  labelMetodeTransfer,
  labelStatusTransfer,
  namaBerkasTransfer,
  ringkasDariSaringan,
  SARINGAN_TRANSFER_KOSONG,
  saringTransfer,
  type BarisTransferLaporan,
} from "./laporanTransfer";

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

/** Waktu patokan supaya saringan periode tidak bergantung jam berjalan. */
const SEKARANG = Date.UTC(2026, 9, 15, 12, 0, 0);
const HARI = 86_400_000;

function baris(
  isi: Partial<BarisTransferLaporan> & Pick<BarisTransferLaporan, "id">,
): BarisTransferLaporan {
  return {
    nomorReferensi: "PGD-1",
    pendanaId: "dana-1",
    pendanaNama: "ASEP FIRMAN HANAFI",
    jumlah: 100_000,
    metode: "transfer_bank",
    referensi: null,
    catatan: null,
    status: "dicatat",
    dicatatPada: SEKARANG,
    dicatatOlehLabel: "admin@pindai.id",
    dibatalkanPada: null,
    dibatalkanOlehLabel: null,
    alasanBatal: null,
    ...isi,
  };
}

const BARIS: BarisTransferLaporan[] = [
  baris({
    id: "t1",
    nomorReferensi: "PGD-001",
    pendanaNama: "ASEP FIRMAN HANAFI",
    jumlah: 500_000,
    referensi: "TRF-AAA",
    dicatatPada: SEKARANG - 2 * HARI,
  }),
  baris({
    id: "t2",
    nomorReferensi: "PGD-002",
    pendanaNama: "ROBERT",
    jumlah: 250_000,
    metode: "e_wallet",
    referensi: "EW-111",
    dicatatPada: SEKARANG - 40 * HARI,
  }),
  baris({
    id: "t3",
    nomorReferensi: "PWN-003",
    pendanaNama: "ROBERT",
    jumlah: 75_000,
    status: "dibatalkan",
    alasanBatal: "Salah nominal",
    dibatalkanPada: SEKARANG - HARI,
    dibatalkanOlehLabel: "admin@pindai.id",
    dicatatPada: SEKARANG - 5 * HARI,
  }),
];

// ===== Tanpa saringan =====
const semua = saringTransfer(BARIS, SARINGAN_TRANSFER_KOSONG, SEKARANG);
eq(semua.length, 3, "tanpa saringan = semua baris");
eq(semua.map((b) => b.id).join("|"), "t1|t3|t2", "urut dari yang paling baru dicatat");
eq(BARIS.map((b) => b.id).join("|"), "t1|t2|t3", "array masukan tidak ikut terurut ulang");

// ===== Saringan status =====
eq(
  saringTransfer(BARIS, { ...SARINGAN_TRANSFER_KOSONG, status: "dicatat" }, SEKARANG)
    .map((b) => b.id)
    .join("|"),
  "t1|t2",
  "saringan status dicatat",
);
eq(
  saringTransfer(BARIS, { ...SARINGAN_TRANSFER_KOSONG, status: "dibatalkan" }, SEKARANG)
    .map((b) => b.id)
    .join("|"),
  "t3",
  "saringan status dibatalkan",
);

// ===== Saringan pencarian =====
const cari = (kata: string) =>
  saringTransfer(BARIS, { ...SARINGAN_TRANSFER_KOSONG, cari: kata }, SEKARANG)
    .map((b) => b.id)
    .join("|");
eq(cari("pgd-002"), "t2", "cari nomor referensi tanpa peduli huruf besar");
eq(cari("  ROBERT  "), "t3|t2", "cari nama pendana, spasi tepi diabaikan");
eq(cari("ew-111"), "t2", "cari referensi mutasi");
eq(cari("tidak ada"), "", "kata kunci tanpa hasil = kosong");
eq(cari("   "), "t1|t3|t2", "spasi saja dianggap tanpa kata kunci");

// ===== Saringan periode =====
eq(
  saringTransfer(BARIS, { ...SARINGAN_TRANSFER_KOSONG, hari: 30 }, SEKARANG)
    .map((b) => b.id)
    .join("|"),
  "t1|t3",
  "30 hari terakhir menggugurkan catatan lama",
);
eq(
  saringTransfer(BARIS, { ...SARINGAN_TRANSFER_KOSONG, hari: 365 }, SEKARANG).length,
  3,
  "1 tahun terakhir memuat semua contoh",
);
eq(
  saringTransfer(
    BARIS,
    { status: "dicatat", cari: "ROBERT", hari: 30 },
    SEKARANG,
  ).length,
  0,
  "status, kata kunci, dan periode digabung (AND)",
);
eq(
  saringTransfer(BARIS, { status: "dicatat", cari: "ROBERT", hari: 0 }, SEKARANG)
    .map((b) => b.id)
    .join("|"),
  "t2",
  "tanpa batas periode, kata kunci tetap berlaku",
);

// ===== ringkasDariSaringan =====
const ringkasSemua = ringkasDariSaringan(semua);
eq(ringkasSemua.jumlah, 3, "ringkasan menghitung semua baris tampil");
eq(ringkasSemua.nilai, 825_000, "ringkasan menjumlahkan semua nilai");
eq(ringkasSemua.jumlahTercatat, 2, "ringkasan memisahkan yang tercatat");
eq(ringkasSemua.nilaiTercatat, 750_000, "nilai yang tercatat saja");
eq(ringkasSemua.jumlahDibatalkan, 1, "ringkasan memisahkan yang dibatalkan");
eq(ringkasSemua.nilaiDibatalkan, 75_000, "nilai yang dibatalkan saja");
eq(
  ringkasDariSaringan(
    saringTransfer(BARIS, { ...SARINGAN_TRANSFER_KOSONG, hari: 30 }, SEKARANG),
  ).nilai,
  575_000,
  "ringkasan mengikuti saringan yang sedang berlaku",
);
eq(ringkasDariSaringan([]).nilai, 0, "tanpa baris, nilai nol");
eq(ringkasDariSaringan([]).jumlah, 0, "tanpa baris, jumlah nol");

// ===== adaSaringan =====
eq(adaSaringan(SARINGAN_TRANSFER_KOSONG), false, "saringan kosong = tidak aktif");
eq(adaSaringan({ status: "semua", cari: "   ", hari: 0 }), false, "spasi saja = tidak aktif");
eq(adaSaringan({ status: "dicatat", cari: "", hari: 0 }), true, "status = aktif");
eq(adaSaringan({ status: "semua", cari: "robert", hari: 0 }), true, "kata kunci = aktif");
eq(adaSaringan({ status: "semua", cari: "", hari: 30 }), true, "periode = aktif");

// ===== Label =====
eq(labelStatusTransfer("dicatat"), "sudah dicatat", "label status tercatat");
eq(labelStatusTransfer("dibatalkan"), "dibatalkan", "label status dibatalkan");
eq(labelStatusTransfer("lain"), "lain", "status asing apa adanya");
eq(labelMetodeTransfer("transfer_bank"), "transfer bank", "label metode transfer bank");
eq(labelMetodeTransfer("e_wallet"), "e-wallet", "label metode e-wallet");
eq(labelMetodeTransfer("tunai"), "tunai", "label metode tunai");
eq(labelMetodeTransfer("crypto"), "crypto", "metode tak dikenal apa adanya");

// ===== keCsvTransfer =====
const csv = keCsvTransfer([
  baris({
    id: "t1",
    nomorReferensi: "PGD,001",
    pendanaNama: 'ASEP "FIRMAN" HANAFI',
    jumlah: 500_000,
    referensi: "TRF-AAA",
    catatan: null,
    dicatatPada: Date.UTC(2026, 9, 13, 4, 30, 0),
  }),
  baris({
    id: "t3",
    nomorReferensi: "PWN-003",
    pendanaNama: "ROBERT",
    jumlah: 75_000,
    status: "dibatalkan",
    alasanBatal: "Salah nominal",
    dibatalkanPada: Date.UTC(2026, 9, 14, 4, 30, 0),
  }),
]);
const csvBaris = csv.split("\r\n");
eq(csvBaris[0], KOLOM_CSV_TRANSFER.join(","), "baris kepala memakai kolom tetap");
eq(csvBaris.length, 3, "satu baris kepala + satu baris per catatan");
eq(
  csvBaris[1],
  `2026-10-13T04:30:00.000Z,"PGD,001","ASEP ""FIRMAN"" HANAFI",500000,transfer bank,TRF-AAA,,sudah dicatat,admin@pindai.id,,`,
  "nomor referensi berkoma & nama berkutip tetap satu kolom (RFC 4180)",
);
eq(
  csvBaris[2],
  "2026-10-15T12:00:00.000Z,PWN-003,ROBERT,75000,transfer bank,,,dibatalkan,admin@pindai.id,2026-10-14T04:30:00.000Z,Salah nominal",
  "kolom kosong tetap punya pemisah",
);
eq(keCsvTransfer([]), KOLOM_CSV_TRANSFER.join(","), "tanpa data hanya kepala");

// ===== namaBerkasTransfer =====
eq(
  namaBerkasTransfer(SEKARANG),
  "transfer-keuntungan-pindai-2026-10-15.csv",
  "nama berkas memuat tanggal dan tidak menyamar sebagai bukti mutasi",
);

console.log(`laporanTransfer.test: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
