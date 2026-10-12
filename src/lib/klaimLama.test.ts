/**
 * Uji logika murni klaim peminjam lama (tanpa server).
 * Run: bun src/lib/klaimLama.test.ts
 *
 * Yang dijaga: nomor selalu ditopeng (layar tidak pernah membuka nomor penuh),
 * pesan OTP tidak memuat data pribadi, klasifikasi "aktif vs lunas" konsisten,
 * dan kalimat ringkas berkas memakai angka yang sama dengan yang dihitung untuk
 * audit trail.
 */
import {
  adaDataLama,
  BERKAS_LAMA_KOSONG,
  gadaiMasihBerjalan,
  kalimatBerkasLama,
  kreditMasihBerjalan,
  pesanDataGanda,
  pesanOtpKlaim,
  pinjamanMasihBerjalan,
  topengNomor,
  totalBerkas,
} from "./klaimLama";

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
function ok(syarat: boolean, label: string) {
  if (syarat) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${label}`);
  }
}

// ===== Topeng nomor =====
eq(topengNomor("6281234567890"), "62812•••••890", "nomor 62 ditopeng di tengah");
// Panjang topeng mengikuti panjang nomor: yang dibuka tetap 5 digit depan dan
// 3 digit belakang, sisanya bintang.
eq(topengNomor("081234567890"), "08123••••890", "nomor 0 juga ditopeng");
eq(topengNomor(""), "", "nomor kosong tetap kosong");
eq(topengNomor(null), "", "nomor null tetap kosong");
ok(!topengNomor("6281234567890").includes("3456789"), "digit tengah tidak pernah tampil");

// ===== Pesan OTP =====
const pesan = pesanOtpKlaim("123456");
ok(pesan.includes("123456"), "pesan memuat kode yang memang harus sampai");
ok(!/Rp|NIK|pinjaman|nama/i.test(pesan), "pesan tidak memuat data pribadi atau nominal");
ok(pesan.includes("5 menit"), "pesan menyebut masa berlaku");

// ===== Klasifikasi status =====
eq(pinjamanMasihBerjalan("didanai"), true, "didanai masih berjalan");
eq(pinjamanMasihBerjalan("ditinjau"), true, "ditinjau masih berjalan");
eq(pinjamanMasihBerjalan("lunas"), false, "lunas tidak berjalan");
eq(pinjamanMasihBerjalan("ditolak"), false, "ditolak tidak berjalan");
eq(pinjamanMasihBerjalan("dibatalkan"), false, "dibatalkan tidak berjalan");
eq(gadaiMasihBerjalan("aktif"), true, "gadai aktif berjalan");
eq(gadaiMasihBerjalan("lunas_dilepas"), false, "gadai yang dilepas tidak berjalan");
eq(kreditMasihBerjalan("didanai"), true, "kredit didanai berjalan");
eq(kreditMasihBerjalan("lunas"), false, "kredit lunas tidak berjalan");

// ===== Ada data lama / total berkas =====
eq(totalBerkas({ ...BERKAS_LAMA_KOSONG, pinjaman: 2, gadai: 1 }), 3, "total berkas menjumlah produk");
eq(adaDataLama({ ...BERKAS_LAMA_KOSONG }), false, "tanpa berkas = tidak ada data lama");
eq(
  adaDataLama({ ...BERKAS_LAMA_KOSONG, masterNasabah: 1 }),
  true,
  "master identitas saja sudah dianggap ada data lama",
);

// ===== Kalimat ringkas =====
const rupiah = (nilai: number) => `Rp${nilai.toLocaleString("id-ID")}`;
eq(
  kalimatBerkasLama({ ...BERKAS_LAMA_KOSONG, pinjaman: 2, pokokPinjaman: 3_500_000 }, rupiah),
  "2 pinjaman dengan total pokok Rp3.500.000",
  "satu jenis berkas",
);
eq(
  kalimatBerkasLama(
    { ...BERKAS_LAMA_KOSONG, pinjaman: 1, gadai: 1, kredit: 1, pokokPinjaman: 1_000_000 },
    rupiah,
  ),
  "1 pinjaman, 1 gadai dan 1 kredit barang dengan total pokok Rp1.000.000",
  "tiga jenis berkas",
);
eq(
  kalimatBerkasLama({ ...BERKAS_LAMA_KOSONG, masterNasabah: 1 }, rupiah),
  "data identitas nasabah",
  "hanya master identitas",
);
eq(
  kalimatBerkasLama({ ...BERKAS_LAMA_KOSONG }, rupiah),
  "belum ada berkas yang bisa dipulihkan",
  "tanpa berkas",
);

// ===== Pesan data ganda =====
ok(pesanDataGanda(2).includes("2 akun"), "pesan ganda menyebut jumlah akun");
ok(pesanDataGanda(2).includes("admin"), "pesan ganda mengarahkan ke admin");

console.log(`klaimLama.test: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
