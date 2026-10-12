/**
 * Uji logika murni halaman masuk/aktivasi Super Admin.
 * Run: bun src/lib/authAdmin.test.ts
 *
 * Yang dijaga:
 * 1. Ambang kekuatan kata sandi TIDAK bisa dinaikkan oleh panjang semata:
 *    "Sangat Kuat" hanya bila 8+ karakter, ada huruf besar, dan ada angka/simbol.
 * 2. `memadai` hanya benar bila KEDUA syarat checklist terpenuhi — bukan aturan
 *    ketiga yang tak terlihat oleh admin.
 * 3. Token dari email dirapikan seragam: spasi/baris baru/pemisah dibuang,
 *    hanya alfanumerik, dan dipotong 32 karakter.
 * 4. Hitung mundur tampil sebagai mm:ss, termasuk 0:00 saat habis.
 * 5. Pesan galat server tetap terpetakan persis seperti alur lama, dan hanya
 *    balasan "terlalu banyak percobaan masuk" yang membuka pemulihan TOTP.
 */
import {
  PANJANG_TOKEN_ADMIN,
  bersihkanToken,
  formatSisaToken,
  nilaiKekuatanSandi,
  pesanGalatAdmin,
} from "./authAdmin";

let passed = 0;
let failed = 0;
function ok(syarat: boolean, label: string): void {
  if (syarat) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${label}`);
  }
}
function sama<T>(dapat: T, harap: T, label: string): void {
  ok(
    dapat === harap,
    `${label} (dapat ${JSON.stringify(dapat)}, harap ${JSON.stringify(harap)})`,
  );
}

// ===== 1. Kekuatan kata sandi =====
{
  const kosong = nilaiKekuatanSandi("");
  sama(kosong.tingkat, "kosong", "sandi kosong = netral");
  sama(kosong.skor, 0, "sandi kosong tanpa skor");
  sama(kosong.label, "Belum diisi", "label sandi kosong jujur");
  ok(!kosong.memadai, "sandi kosong tidak memadai");

  const pendek = nilaiKekuatanSandi("abc");
  sama(pendek.tingkat, "lemah", "3 huruf kecil = Lemah");
  ok(!pendek.panjangCukup, "panjang belum cukup");

  const delapanHurufKecil = nilaiKekuatanSandi("aaaaaaaa");
  sama(delapanHurufKecil.tingkat, "lemah", "8 huruf kecil saja tetap Lemah");
  ok(delapanHurufKecil.panjangCukup, "panjang sudah cukup");
  ok(!delapanHurufKecil.memadai, "huruf kecil saja tidak memadai");

  const panjangSaja = nilaiKekuatanSandi("KataSandiPanjang");
  sama(panjangSaja.tingkat, "sedang", "huruf besar + panjang = Sedang");
  ok(!panjangSaja.memadai, "tanpa angka/simbol belum memadai");

  const angkaSaja = nilaiKekuatanSandi("12345678");
  sama(angkaSaja.tingkat, "sedang", "angka + panjang = Sedang");
  ok(!angkaSaja.memadai, "tanpa huruf besar belum memadai");

  const kuat = nilaiKekuatanSandi("Rahasia#2026");
  sama(
    kuat.tingkat,
    "sangat-kuat",
    "8+ karakter + huruf besar + simbol = Sangat Kuat",
  );
  sama(kuat.skor, 3, "skor penuh");
  ok(kuat.memadai, "sandi kuat memenuhi kedua syarat checklist");
  ok(
    kuat.adaHurufBesar && kuat.adaAngkaAtauSimbol,
    "kedua syarat checklist terbaca",
  );

  const spasiSaja = nilaiKekuatanSandi("        ");
  sama(
    spasiSaja.tingkat,
    "lemah",
    "8 spasi tetap Lemah, bukan diperhitungkan kuat",
  );
  ok(!spasiSaja.memadai, "spasi tidak memenuhi syarat campuran");
}

// ===== 2. Pembersihan token =====
{
  sama(
    bersihkanToken("  abc DEF 123  "),
    "abcDEF123",
    "spasi di tepi & tengah dibuang",
  );
  sama(
    bersihkanToken("abcd\nefgh\t1234"),
    "abcdefgh1234",
    "baris baru & tab dibuang",
  );
  sama(bersihkanToken("AAAA-BBBB-CCCC"), "AAAABBBBCCCC", "tanda pisah dibuang");
  sama(
    bersihkanToken("token=abc"),
    "tokenabc",
    "tanda sama dengan dari email dibuang",
  );
  sama(bersihkanToken(""), "", "teks kosong tetap kosong");
  const token32 = "A1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6";
  sama(token32.length, PANJANG_TOKEN_ADMIN, "contoh token tepat 32 karakter");
  sama(bersihkanToken(token32), token32, "token 32 karakter lolos apa adanya");
  sama(
    bersihkanToken(`${token32}ZZZ`).length,
    PANJANG_TOKEN_ADMIN,
    "kelebihan karakter dipotong di 32",
  );
  sama(
    bersihkanToken("é™日本語"),
    "",
    "karakter non-alfanumerik dibuang seluruhnya",
  );
}

// ===== 3. Format hitung mundur =====
{
  sama(formatSisaToken(899), "14:59", "899 detik = 14:59");
  sama(formatSisaToken(900), "15:00", "masa berlaku penuh 15:00");
  sama(formatSisaToken(60), "01:00", "satu menit penuh");
  sama(formatSisaToken(59), "00:59", "detik terakhir tetap dua digit");
  sama(formatSisaToken(0), "00:00", "habis = 00:00");
  sama(
    formatSisaToken(-5),
    "00:00",
    "angka negatif tidak pernah tampil negatif",
  );
  sama(formatSisaToken(9.8), "00:09", "detik dibulatkan ke bawah");
}

// ===== 4. Terjemahan galat server =====
{
  const salah = pesanGalatAdmin(new Error("Invalid credentials"));
  ok(
    salah.pesan.includes("Email atau kata sandi Super Admin"),
    "kredensial salah diterjemahkan",
  );
  ok(
    salah.pulihDenganTotp === undefined,
    "kredensial salah tidak membuka TOTP",
  );

  const sudahAda = pesanGalatAdmin(new Error("Account already exists"));
  ok(
    sudahAda.pesan.includes("Password sudah aktif"),
    "akun sudah ada diarahkan ke masuk",
  );
  ok(
    pesanGalatAdmin(new Error("Account abc123 already exists")).pesan ===
      sudahAda.pesan,
    "pola 'account ... exists' dikenali",
  );

  const batasToken = pesanGalatAdmin(
    new Error("Terlalu banyak permintaan token."),
  );
  ok(
    batasToken.pesan.includes("15 menit"),
    "batas permintaan token dijelaskan",
  );
  ok(
    batasToken.pesan.includes("tetap berlaku sampai kedaluwarsa"),
    "token lama tetap berlaku disebutkan",
  );
  ok(
    batasToken.pulihDenganTotp === undefined,
    "batas token tidak membuka TOTP",
  );

  const batasMasuk = pesanGalatAdmin(
    new Error("Terlalu banyak percobaan masuk."),
  );
  ok(batasMasuk.pesan.includes("kode TOTP"), "batas masuk menawarkan TOTP");
  sama(batasMasuk.pulihDenganTotp, true, "batas masuk membuka pemulihan TOTP");

  const takAda = pesanGalatAdmin(new Error("Could not find account"));
  ok(
    takAda.pesan.includes("Aktivasi password"),
    "akun tanpa sandi diarahkan ke aktivasi",
  );

  const lain = pesanGalatAdmin(new Error("koneksi putus"));
  sama(
    lain.pesan,
    "Permintaan gagal. Periksa kembali email dan coba lagi.",
    "galat tak dikenal",
  );
  const bukanError = pesanGalatAdmin("bukan error");
  sama(
    bukanError.pesan,
    "Permintaan gagal. Periksa kembali email dan coba lagi.",
    "nilai bukan Error tidak melempar",
  );
}

console.log(`authAdmin: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
