/** Run: bun src/lib/saringanPengajuan.test.ts */
import {
  adaFilter,
  bagiAntreanPinjaman,
  cocokCari,
  daftarPendana,
  FILTER_PENGAJUAN_KOSONG,
  ringkasJumlah,
  saringNama,
  saringPengajuan,
} from "./saringanPengajuan";

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
function nama(baris: Array<{ namaLengkap: string }>): string[] {
  return baris.map((b) => b.namaLengkap);
}

type Baris = {
  namaLengkap: string;
  kodePeminjam: string | null;
  nomorReferensi: string;
  pendana?: string | null;
};

const BARIS: Baris[] = [
  {
    namaLengkap: "CHATUR SURYA CAREL RAMADHAN",
    kodePeminjam: "PGD-20261004-NF27",
    nomorReferensi: "PWN-A515EA1B52C7",
    pendana: "CHARELSOERYA@GMAIL.COM",
  },
  {
    namaLengkap: "SYAHRIL FIRMANSYAH",
    kodePeminjam: "PGD-20260917-5B20",
    nomorReferensi: "PWN-7A28FFA39F43",
    pendana: "ASEP FIRMAN HANAFI",
  },
  {
    namaLengkap: "FATHUR ROZI",
    kodePeminjam: "PGD-20260917-5919",
    nomorReferensi: "PWN-853F8B34C7C4",
    pendana: "ASEP FIRMAN HANAFI",
  },
  {
    namaLengkap: "HASBI SUKMANDA",
    kodePeminjam: null,
    nomorReferensi: "PWN-4896F6FF61B8",
    pendana: null,
  },
];

// ===== cocokCari =====

eq(cocokCari("", ["Nama apa saja"]), true, "kata kunci kosong selalu cocok");
eq(cocokCari("   ", ["Nama apa saja"]), true, "kata kunci spasi dianggap kosong");
eq(cocokCari("surya", ["CHATUR SURYA CAREL RAMADHAN"]), true, "cocok tanpa peduli huruf besar");
eq(cocokCari("SURYA", ["CHATUR SURYA CAREL RAMADHAN"]), true, "kata kunci huruf besar");
eq(cocokCari("chatur surya", ["CHATUR SURYA CAREL RAMADHAN"]), true, "dua kata berurutan");
eq(cocokCari("chatur   surya", ["CHATUR SURYA CAREL RAMADHAN"]), true, "spasi berlebih disamakan");
eq(cocokCari("  chatur surya  ", ["CHATUR SURYA CAREL RAMADHAN"]), true, "spasi tepi diabaikan");
eq(cocokCari("firman", ["HASBI SUKMANDA"]), false, "tidak cocok bila tidak ada");
eq(cocokCari("surya", [null, undefined, "SYAHRIL"]), false, "nilai null/undefined diabaikan");

// ===== daftarPendana =====

eq(
  daftarPendana(BARIS).join("|"),
  "ASEP FIRMAN HANAFI|CHARELSOERYA@GMAIL.COM",
  "pendana unik, urut abjad, tanpa nilai kosong",
);
eq(
  daftarPendana([
    { pendana: "ROBERT" },
    { pendana: "robert" },
    { pendana: "Robert " },
    { pendana: null },
  ]).join("|"),
  "ROBERT",
  "duplikat beda huruf besar/kecil & spasi digabung",
);
eq(daftarPendana([]).length, 0, "tanpa baris = tanpa pilihan");
eq(daftarPendana([{ pendana: null }, { pendana: "   " }]).length, 0, "null/spasi bukan pilihan");

// ===== saringPengajuan =====

// Tanpa filter: semua baris kembali apa adanya.
eq(saringPengajuan(BARIS, FILTER_PENGAJUAN_KOSONG).length, 4, "tanpa filter = semua baris");

// Filter nama.
eq(
  nama(saringPengajuan(BARIS, { cari: "sukmanda", pendana: "" })).join("|"),
  "HASBI SUKMANDA",
  "saring nama peminjam",
);
// Nomor referensi & kode pseudonim ikut dicari.
eq(
  nama(saringPengajuan(BARIS, { cari: "PWN-853F", pendana: "" })).join("|"),
  "FATHUR ROZI",
  "saring lewat nomor referensi",
);
eq(
  nama(saringPengajuan(BARIS, { cari: "20260917-5919", pendana: "" })).join("|"),
  "FATHUR ROZI",
  "saring lewat kode peminjam",
);

// Filter pendana — dua pinjaman milik pendana yang sama.
eq(
  nama(saringPengajuan(BARIS, { cari: "", pendana: "ASEP FIRMAN HANAFI" })).join("|"),
  "SYAHRIL FIRMANSYAH|FATHUR ROZI",
  "saring pendana",
);
// Nama pendana tidak peduli huruf besar/kecil.
eq(
  saringPengajuan(BARIS, { cari: "", pendana: "asep firman hanafi" }).length,
  2,
  "saring pendana tanpa peduli huruf besar",
);
// Baris tanpa pendana gugur saat pendana dipilih.
eq(
  nama(saringPengajuan(BARIS, { cari: "", pendana: "ASEP FIRMAN HANAFI" })).includes(
    "HASBI SUKMANDA",
  ),
  false,
  "pinjaman tanpa pendana tidak ikut muncul",
);
// Nama + pendana digabung (AND), bukan salah satu.
eq(
  nama(saringPengajuan(BARIS, { cari: "fathur", pendana: "ASEP FIRMAN HANAFI" })).join("|"),
  "FATHUR ROZI",
  "nama + pendana digabung",
);
eq(
  saringPengajuan(BARIS, { cari: "fathur", pendana: "ROBERT" }).length,
  0,
  "nama cocok tapi pendana tidak = kosong",
);
// Pendana yang tidak terdaftar: tidak ada yang lolos, bukan semua baris.
eq(saringPengajuan(BARIS, { cari: "", pendana: "TIDAK ADA" }).length, 0, "pendana tak dikenal");

// Baris "belum didanai" (pendana null) tetap tampil tanpa filter pendana.
eq(
  saringPengajuan(BARIS, { cari: "", pendana: "" }).filter((b) => b.pendana === null).length,
  1,
  "baris belum didanai tetap tampil tanpa saringan pendana",
);

// ===== saringNama =====

eq(saringNama(BARIS, "fathur").length, 1, "saringNama menyaring nama");
eq(saringNama(BARIS, "").length, 4, "saringNama tanpa kata kunci = semua");
eq(saringNama(BARIS, "PWN-4896").length, 1, "saringNama lewat referensi");

// ===== adaFilter =====

eq(adaFilter(FILTER_PENGAJUAN_KOSONG), false, "tanpa filter = tidak aktif");
eq(adaFilter({ cari: "  ", pendana: "" }), false, "spasi saja = tidak aktif");
eq(adaFilter({ cari: "rani", pendana: "" }), true, "kata kunci = aktif");
eq(adaFilter({ cari: "", pendana: "ROBERT" }), true, "pendana terpilih = aktif");

// ===== ringkasJumlah =====

eq(
  ringkasJumlah(2, 13),
  "Menampilkan 2 dari 13 pengajuan",
  "ringkasan jumlah tampil vs total",
);

// ===== bagiAntreanPinjaman =====
const ANTREAN = [
  { id: "ditolak", status: "ditolak", didanaiPada: null },
  { id: "baru", status: "diajukan", didanaiPada: null },
  { id: "disetujui", status: "disetujui", didanaiPada: null },
  { id: "legacy-didanai", status: "didanai", didanaiPada: null },
  { id: "legacy-tanggal", status: "disetujui", didanaiPada: 1_700_000_000_000 },
  { id: "lunas", status: "lunas", didanaiPada: 1_700_000_000_000 },
  { id: "ditolak-tanggal", status: "ditolak", didanaiPada: 1_700_000_000_000 },
];
const keranjang = bagiAntreanPinjaman(ANTREAN);
const idKeranjang = (baris: Array<{ id: string }>) => baris.map((b) => b.id).join("|");

eq(idKeranjang(keranjang.baru), "baru|disetujui", "antrean baru = belum didanai");
eq(
  idKeranjang(keranjang.didanai),
  "legacy-didanai|legacy-tanggal",
  "status didanai atau tanggal disalurkan masuk Disalurkan",
);
eq(idKeranjang(keranjang.lunas), "lunas", "lunas di tabnya sendiri");
eq(
  idKeranjang(keranjang.ditolak),
  "ditolak|ditolak-tanggal",
  "ditolak menang atas tanggal disalurkan",
);
const gabungan = [
  ...keranjang.baru,
  ...keranjang.didanai,
  ...keranjang.lunas,
  ...keranjang.ditolak,
]
  .map((b) => b.id)
  .sort()
  .join("|");
eq(
  gabungan,
  ANTREAN.map((b) => b.id)
    .sort()
    .join("|"),
  "tidak ada baris yang hilang atau tertinggal",
);
eq(bagiAntreanPinjaman([]).baru.length, 0, "daftar kosong = empat keranjang kosong");

console.log(`saringanPengajuan.test: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
