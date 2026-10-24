/**
 * Uji susunan sumber panel Voucher Nasabah.
 *
 * Panel ini membaca Convex, jadi tidak bisa dirender di luar aplikasi. Yang
 * diperiksa di sini adalah hal yang dulu pernah salah di panel lain:
 *  - kolom cari mengoper nilai TERTUNDA, bukan nilai mentah — satu huruf tidak
 *    boleh membuat langganan query baru (keluhan yang sama pada pencarian
 *    plafon nasabah);
 *  - pencabutan selalu membawa alasan dan tombolnya menunggu alasan diisi;
 *  - nilai voucher tidak bisa disunting setelah terbit, karena angkanya sudah
 *    terbaca nasabah dan mungkin sudah tercatat di pengajuan.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

let passed = 0;
let failed = 0;
function ok(syarat: boolean, label: string): void {
  if (syarat) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${label}`);
  }
}

const sumber = readFileSync(fileURLToPath(new URL("./VoucherPanel.tsx", import.meta.url)), "utf8");

/** Teks tanpa komentar, supaya penjelasan di docblock tidak dihitung sebagai kode. */
const kode = sumber
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

// ===== 1. Pencarian tertunda =====
ok(kode.includes("useNilaiTertunda"), "kolom cari memakai nilai tertunda");
ok(
  /const data = useQuery\(api\.voucher\.daftarVoucherAdmin, \{\s*cari: kueri,/.test(kode),
  "query daftar memakai nilai tertunda, bukan ketikan mentah",
);
ok(!/cari: cari,/.test(kode), "tidak ada query yang memakai ketikan mentah");

// ===== 2. Pencabutan wajib beralasan =====
ok(
  /cabut\(\{ voucherId: dibatalkan\.id, alasan \}\)/.test(kode),
  "mutation cabut mengirim alasan",
);
ok(
  /disabled=\{sibuk \|\| alasan\.trim\(\)\.length < 3\}/.test(kode),
  "tombol cabut menunggu alasan >= 3 karakter",
);

// ===== 3. Nilai dan pemilik terkunci saat menyunting =====
ok(!kode.includes('id="ubah-nilai"'), "form sunting tidak punya kolom nilai");
ok(!kode.includes('id="ubah-pemilik"'), "form sunting tidak punya kolom pemilik");
ok(
  /periksaUbahVoucher\(\{/.test(kode),
  "aturan sunting memakai pemeriksaan yang sama dengan server",
);

// ===== 4. Status dibaca dari server, bukan disimpulkan UI =====
ok(kode.includes("baris.statusTampil"), "lencana status memakai statusTampil dari server");
ok(kode.includes("LABEL_STATUS_VOUCHER"), "label status memakai kamus bersama");
ok(
  kode.includes("LABEL_JENIS_VOUCHER"),
  "label jenis memakai kamus bersama, bukan teks bebas",
);

// ===== 5. Arsip terbatas disebutkan =====
ok(kode.includes("data.dibatasi"), "panel menyebut bila arsip lebih lama tidak dihitung");
ok(kode.includes("data.total"), "jumlah yang cocok ditampilkan terpisah dari yang dikirim");

const jumlah = passed + failed;
console.log(`VoucherPanel.render.test: ${passed}/${jumlah} pemeriksaan lulus`);
if (failed > 0) process.exit(1);
