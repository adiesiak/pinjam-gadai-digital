/**
 * Uji aturan pengingat pembaruan aplikasi (murni).
 * Run: bun src/lib/pembaruanAplikasi.test.ts
 *
 * Yang dijaga:
 *  1. Satu versi dikenali dari `versionCode`, bukan teks bebas.
 *  2. Tautan berbahaya (`//host`, spasi, tanpa skema) ditolak sebelum sempat
 *     dikirim ke siapa pun.
 *  3. Pesan WhatsApp menyebut versi, satu tautan, dan tidak meninggalkan
 *     placeholder.
 *  4. Satu nomor hanya menerima satu pesan walau ada dua akun.
 */
import {
  MAKS_CATATAN_PEMBARUAN,
  TAUTAN_UNDUH_BAWAAN,
  kunciNotifikasiPembaruan,
  nomorPenerimaUnik,
  pesanPembaruanWhatsapp,
  urlUnduhAplikasi,
  validasiPembaruan,
  versiAplikasiDariUA,
  versiMinimumWajib,
  wajibPerbarui,
} from "@/lib/pembaruanAplikasi";

let passed = 0;
let failed = 0;
function ok(syarat: boolean, label: string): void {
  if (syarat) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${label}`);
  }
}

// ===== Validasi =====
{
  const hasil = validasiPembaruan({
    versiKode: 3,
    versiNama: "1.2.0",
    tautan: "/pindai.apk",
  });
  ok(hasil.ok, "versi sah diterima");
  if (hasil.ok) {
    ok(hasil.nilai.versiKode === 3, "kode versi dipertahankan");
    ok(hasil.nilai.tautan === TAUTAN_UNDUH_BAWAAN, "tautan bawaan dipakai apa adanya");
    ok(hasil.nilai.catatan === undefined, "catatan kosong tidak disimpan sebagai string kosong");
  }
}

{
  const hasil = validasiPembaruan({
    versiKode: 4,
    versiNama: " 1.3 ",
    tautan: "https://pindai.example/pindai.apk",
    catatan: "  Perbaikan layar KYC.  ",
  });
  ok(hasil.ok, "versi dengan tautan absolut diterima");
  if (hasil.ok) {
    ok(hasil.nilai.versiNama === "1.3", "spasi nama versi dirapikan");
    ok(
      hasil.nilai.catatan === "Perbaikan layar KYC.",
      "spasi catatan dirapikan dan isinya dipertahankan",
    );
  }
}

for (const [kode, label] of [
  [0, "nol"],
  [-1, "negatif"],
  [2.5, "pecahan"],
  [Number.NaN, "NaN"],
  [1_000_001, "terlalu besar"],
] as const) {
  const hasil = validasiPembaruan({ versiKode: kode, versiNama: "1.2.0", tautan: "/pindai.apk" });
  ok(!hasil.ok, `kode versi ${label} ditolak`);
}

for (const [nama, label] of [
  ["", "kosong"],
  ["1", "satu angka"],
  ["v1.2", "berawalan v"],
  ["1.2.3.4", "empat bagian"],
  ["1,2", "koma"],
] as const) {
  const hasil = validasiPembaruan({ versiKode: 3, versiNama: nama, tautan: "/pindai.apk" });
  ok(!hasil.ok, `nama versi ${label} ditolak`);
}

for (const [tautan, label] of [
  ["", "kosong"],
  ["//pindai.example/pindai.apk", "protokol-relatif"],
  ["javascript:alert(1)", "skema javascript"],
  ["/pindai apk", "berisi spasi"],
  ["pindai.apk", "tanpa awalan"],
] as const) {
  const hasil = validasiPembaruan({ versiKode: 3, versiNama: "1.2.0", tautan });
  ok(!hasil.ok, `tautan ${label} ditolak`);
}

{
  const panjang = "x".repeat(MAKS_CATATAN_PEMBARUAN + 50);
  const hasil = validasiPembaruan({
    versiKode: 3,
    versiNama: "1.2.0",
    tautan: "/pindai.apk",
    catatan: panjang,
  });
  ok(hasil.ok && hasil.nilai.catatan?.length === MAKS_CATATAN_PEMBARUAN, "catatan dipotong di batas");
}

// ===== Tautan absolut =====
ok(
  urlUnduhAplikasi("https://pindai.example/", "/pindai.apk") ===
    "https://pindai.example/pindai.apk",
  "jalur digabung dengan asal tanpa garis miring ganda",
);
ok(
  urlUnduhAplikasi("https://pindai.example", "https://cdn.example/pindai.apk") ===
    "https://cdn.example/pindai.apk",
  "tautan absolut tidak ditimpa asal",
);
ok(urlUnduhAplikasi("bukan-url", "/pindai.apk") === null, "asal tidak sah ditolak");
ok(urlUnduhAplikasi("https://pindai.example", "//jahat.example/apk") === null, "jalur // ditolak");

// ===== Pesan WhatsApp =====
{
  const pesan = pesanPembaruanWhatsapp({
    nama: "Budi Santoso",
    versiNama: "1.2.0",
    tautan: "https://pindai.example/pindai.apk",
  });
  ok(pesan.includes("Budi"), "pesan menyapa dengan nama panggilan");
  ok(pesan.includes("PINDAI 1.2.0"), "pesan menyebut versi");
  ok(pesan.includes("https://pindai.example/pindai.apk"), "pesan memuat satu tautan unduhan");
  ok(!pesan.includes("{"), "tidak ada placeholder tersisa");
  ok(!/klik sekarang|segera|terbatas/i.test(pesan), "tidak memakai desakan pemasaran");
}

{
  const pesan = pesanPembaruanWhatsapp({
    nama: "",
    versiNama: "1.2.0",
    tautan: "/pindai.apk",
    catatan: "Perbaikan login.",
  });
  ok(pesan.includes("Catatan: Perbaikan login."), "catatan admin ikut terkirim");
  ok(!pesan.includes("Halo ,"), "nama kosong tidak menghasilkan sapaan menggantung");
}

// ===== Penerima =====
{
  const hasil = nomorPenerimaUnik([
    { userId: "u1", nama: "Budi", nomor: "0812-3456-7890" },
    { userId: "u2", nama: "Budi (akun kedua)", nomor: "+6281234567890" },
    { userId: "u3", nama: "Sari", nomor: "0813 4567 8901" },
    { userId: "u4", nama: "Tanpa nomor", nomor: "" },
    { userId: "u5", nama: "Nomor rusak", nomor: "123" },
  ]);
  ok(hasil.penerima.length === 2, "dua nomor unik menjadi dua penerima");
  ok(hasil.duplikat === 1, "nomor ganda dihitung sebagai duplikat");
  ok(hasil.tanpaNomor === 2, "nomor kosong dan rusak dihitung tanpa nomor");
  ok(
    hasil.penerima.every((p) => p.nomor.startsWith("62")),
    "semua nomor dinormalkan ke 62…",
  );
}

ok(kunciNotifikasiPembaruan(3) === "pembaruan:3", "kunci notifikasi stabil per versi");
ok(
  kunciNotifikasiPembaruan(3) !== kunciNotifikasiPembaruan(4),
  "versi berbeda menghasilkan kunci berbeda",
);

// ===== Penanda versi di User-Agent =====
ok(
  versiAplikasiDariUA("Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 PINDAIApp/4") === 4,
  "kode versi dibaca dari penanda aplikasi",
);
ok(versiAplikasiDariUA("Mozilla/5.0 (Linux; Android 13)") === null, "peramban biasa tidak dianggap aplikasi");
ok(
  versiAplikasiDariUA("Mozilla/5.0 (Linux; Android 13) PINDAIApp/1.0") === 0,
  "APK lama tanpa kode angka dianggap versi 0",
);
ok(
  versiAplikasiDariUA("Mozilla/5.0 PINDAIApp/") === 0,
  "penanda tanpa angka dianggap versi 0",
);
ok(
  versiAplikasiDariUA("Mozilla/5.0 PINDAIApp/12 Safari/537.36") === 12,
  "angka diikuti penanda lain tetap terbaca",
);

// ===== Versi minimum wajib =====
ok(versiMinimumWajib([]) === null, "tanpa pengumuman wajib, tidak ada batas");
ok(
  versiMinimumWajib([
    { versiKode: 4 },
    { versiKode: 6, wajibDiperbarui: true },
    { versiKode: 5, wajibDiperbarui: true },
    { versiKode: 7, wajibDiperbarui: false },
  ]) === 6,
  "batas memakai versi wajib tertinggi",
);

ok(wajibPerbarui(3, 6) === true, "versi di bawah batas harus diperbarui");
ok(wajibPerbarui(6, 6) === false, "versi tepat di batas masih boleh");
ok(wajibPerbarui(7, 6) === false, "versi di atas batas tidak diblokir");
ok(wajibPerbarui(0, 6) === true, "APK tanpa kode dianggap paling tua");
ok(wajibPerbarui(null, 6) === false, "peramban tidak pernah diblokir");
ok(wajibPerbarui(3, null) === false, "tanpa batas tidak ada yang diblokir");

console.log(`pembaruanAplikasi: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
