/**
 * Uji logika pengaturan aplikasi Android — murni, tanpa React/Convex.
 * Run: bun src/lib/asetAndroidApp.test.ts
 *
 * Yang dijaga: validasi berkas unggahan, normalisasi nama & warna, bentuk JSON
 * yang dibaca aplikasi (termasuk keadaan "belum diatur"), dan kejujuran cakupan
 * — panel tidak boleh menjanjikan ikon launcher bisa diganti tanpa APK baru.
 */
import {
  BAWAAN_ASET,
  CAKUPAN_PENGATURAN,
  DEFAULT_APLIKASI_ANDROID,
  KUNCI_ASET_APLIKASI,
  LANGKAH_KONSUMSI,
  MAKS_NAMA_APLIKASI,
  MIME_GAMBAR_APLIKASI,
  UKURAN_MAKS_GAMBAR_APLIKASI,
  URUTAN_ASET_APLIKASI,
  asetBawaan,
  fieldAset,
  normalisasiNamaAplikasi,
  normalisasiWarna,
  ringkasAsetAplikasi,
  susunAsetAplikasi,
  validasiGambarAplikasi,
  type BarisAplikasiAndroid,
} from "./asetAndroidApp";

let passed = 0;
let failed = 0;

function eq(actual: unknown, expected: unknown, label: string): void {
  if (actual === expected) passed += 1;
  else {
    failed += 1;
    console.error(`✗ ${label}\n   harap: ${String(expected)}\n   dapat: ${String(actual)}`);
  }
}

function ok(label: string, syarat: boolean): void {
  if (syarat) passed += 1;
  else {
    failed += 1;
    console.error(`✗ ${label}`);
  }
}

/** Pesan galat dari fungsi yang seharusnya melempar; null bila tidak melempar. */
function pesanGalat(fn: () => void): string | null {
  try {
    fn();
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

// ---------------------------------------------------------------------------
// Validasi berkas unggahan.
// ---------------------------------------------------------------------------

for (const mime of MIME_GAMBAR_APLIKASI) {
  const pesan = pesanGalat(() =>
    validasiGambarAplikasi({ contentType: mime, size: 1024 }, "Splash screen"),
  );
  eq(pesan, null, `menerima gambar ${mime}`);
}
{
  const pdf = pesanGalat(() =>
    validasiGambarAplikasi({ contentType: "application/pdf", size: 1024 }, "Logo aplikasi"),
  );
  ok(`menolak PDF (${pdf ?? "tidak melempar"})`, pdf !== null && pdf.includes("PNG"));
  ok("pesan galat menyebut label slot", (pdf ?? "").includes("Logo aplikasi"));

  ok(
    "menolak berkas tanpa content-type",
    pesanGalat(() => validasiGambarAplikasi({ contentType: null, size: 1024 }, "Splash screen")) !==
      null,
  );
  ok(
    "menolak ukuran nol/kosong",
    pesanGalat(() => validasiGambarAplikasi({ contentType: "image/png", size: 0 }, "Splash screen")) !==
      null,
  );
  const besar = pesanGalat(() =>
    validasiGambarAplikasi(
      { contentType: "image/png", size: UKURAN_MAKS_GAMBAR_APLIKASI + 1 },
      "Splash screen",
    ),
  );
  ok(`menolak berkas melebihi batas (${besar ?? "tidak melempar"})`, besar !== null && besar.includes("MB"));
  eq(
    pesanGalat(() =>
      validasiGambarAplikasi(
        { contentType: "image/png", size: UKURAN_MAKS_GAMBAR_APLIKASI },
        "Splash screen",
      ),
    ),
    null,
    "menerima berkas tepat pada batas ukuran",
  );
}

// ---------------------------------------------------------------------------
// Normalisasi nama & warna.
// ---------------------------------------------------------------------------

eq(normalisasiWarna("#0a2624", "#FFFFFF"), "#0A2624", "warna hex jadi huruf besar");
eq(normalisasiWarna("  #AbCdEf ", "#FFFFFF"), "#ABCDEF", "warna diberi spasi tetap sah");
eq(normalisasiWarna("biru", "#0A2624"), "#0A2624", "warna tidak sah jatuh ke bawaan");
eq(normalisasiWarna("", "#0A2624"), "#0A2624", "warna kosong jatuh ke bawaan");
eq(normalisasiWarna(undefined, "#0A2624"), "#0A2624", "warna undefined jatuh ke bawaan");
eq(normalisasiWarna("#12345", "#0A2624"), "#0A2624", "hex 5 digit ditolak");

eq(normalisasiNamaAplikasi("  pindai  app "), "PINDAI APP", "nama dirapikan & dibesarkan");
eq(normalisasiNamaAplikasi(""), DEFAULT_APLIKASI_ANDROID.namaAplikasi, "nama kosong = bawaan");
eq(normalisasiNamaAplikasi("   "), DEFAULT_APLIKASI_ANDROID.namaAplikasi, "nama spasi = bawaan");
eq(
  normalisasiNamaAplikasi("a".repeat(60)).length,
  MAKS_NAMA_APLIKASI,
  "nama dipotong pada batas panjang",
);

// ---------------------------------------------------------------------------
// Slot & aset bawaan.
// ---------------------------------------------------------------------------

eq(URUTAN_ASET_APLIKASI.length, KUNCI_ASET_APLIKASI.length, "setiap slot punya urutan tampil");
eq(
  new Set(URUTAN_ASET_APLIKASI).size,
  KUNCI_ASET_APLIKASI.length,
  "urutan tampil tanpa duplikat",
);
for (const kunci of KUNCI_ASET_APLIKASI) {
  const aset = asetBawaan(kunci);
  ok(`slot "${kunci}" bawaan menunjuk aset /promo yang ada (${aset.berkas})`, aset.berkas.endsWith(".png"));
  ok(`slot "${kunci}" punya penjelasan berlaku`, BAWAAN_ASET[kunci].berlaku.length >= 30);
  const f = fieldAset(kunci);
  eq(f.id, `${kunci}Id`, `field id slot ${kunci}`);
  eq(f.nama, `${kunci}Nama`, `field nama slot ${kunci}`);
  eq(f.pada, `${kunci}Pada`, `field waktu slot ${kunci}`);
}

// ---------------------------------------------------------------------------
// Kontrak JSON yang dibaca aplikasi.
// ---------------------------------------------------------------------------

const kosong = susunAsetAplikasi(null, {});
eq(kosong.aplikasi, "PINDAI", "nama aplikasi bawaan");
eq(kosong.versi, 0, "versi 0 saat belum diatur");
eq(kosong.diperbaruiPada, null, "belum ada waktu pembaruan");
eq(kosong.diubahAdmin, false, "belum diubah admin");
eq(kosong.warna.latarSplash, DEFAULT_APLIKASI_ANDROID.warnaSplash, "warna latar bawaan");
eq(kosong.warna.teksSplash, DEFAULT_APLIKASI_ANDROID.warnaTeksSplash, "warna teks bawaan");
for (const kunci of KUNCI_ASET_APLIKASI) {
  const aset = kosong.aset[kunci];
  eq(aset.jenis, "bawaan", `slot ${kunci} bawaan saat belum diatur`);
  eq(aset.url, null, `slot ${kunci} tanpa URL saat belum diatur`);
  eq(aset.versi, 0, `slot ${kunci} versi 0`);
  eq(
    aset.asetBawaanId,
    BAWAAN_ASET[kunci].id,
    `slot ${kunci} menyebut id aset bawaan yang harus dipakai APK`,
  );
}
eq(ringkasAsetAplikasi(kosong).teks, "0 aset dari admin · 3 masih bawaan", "ringkasan bawaan");
eq(ringkasAsetAplikasi(kosong).unggahan, 0, "ringkasan menghitung unggahan");
eq(ringkasAsetAplikasi(kosong).bawaan, 3, "ringkasan menghitung bawaan");

const baris: BarisAplikasiAndroid = {
  namaAplikasi: "pindai app",
  warnaSplash: "#123456",
  warnaTeksSplash: "tidak sah",
  ikonId: "st_ikon",
  ikonNama: "logo-baru.png",
  ikonPada: 1_700_000_000_000,
  splashId: "st_splash",
  splashNama: "splash-baru.png",
  splashPada: 1_700_000_500_000,
  diperbaruiPada: 1_700_000_500_000,
  diperbaruiOleh: "admin@pindai.test",
};
const terpasang = susunAsetAplikasi(baris, {
  ikon: "https://cdn.pindai.test/ikon.png",
  splash: "https://cdn.pindai.test/splash.png",
});

eq(terpasang.aplikasi, "PINDAI APP", "nama tersimpan dinormalkan saat dibaca");
eq(terpasang.diubahAdmin, true, "ditandai sudah diubah admin");
eq(terpasang.warna.latarSplash, "#123456", "warna tersimpan dipakai");
eq(terpasang.warna.teksSplash, DEFAULT_APLIKASI_ANDROID.warnaTeksSplash, "warna teks tidak sah = bawaan");
eq(terpasang.diperbaruiOleh, "admin@pindai.test", "label admin ikut dikirim");
eq(terpasang.aset.ikon.jenis, "unggahan", "ikon dari admin ditandai unggahan");
eq(terpasang.aset.ikon.url, "https://cdn.pindai.test/ikon.png", "URL ikon dikirim ke aplikasi");
eq(terpasang.aset.ikon.namaBerkas, "logo-baru.png", "nama berkas ditampilkan");
eq(terpasang.aset.ikon.versi, baris.ikonPada, "versi ikon = waktu unggah (untuk cache)");
eq(terpasang.aset.splash.versi, baris.splashPada, "versi splash = waktu unggah");
eq(terpasang.aset.ikonSplash.jenis, "bawaan", "slot yang tidak diisi tetap bawaan");
eq(ringkasAsetAplikasi(terpasang).teks, "2 aset dari admin · 1 masih bawaan", "ringkasan campuran");

// Berkas yang sudah hilang dari storage (URL null) tidak boleh dilaporkan
// terpasang — aplikasi harus jatuh ke berkas bawaan, bukan memuat URL kosong.
const hilang = susunAsetAplikasi(baris, { ikon: null, splash: null });
for (const kunci of KUNCI_ASET_APLIKASI) {
  eq(hilang.aset[kunci].jenis, "bawaan", `slot ${kunci} kembali bawaan bila URL tidak ada`);
  eq(hilang.aset[kunci].url, null, `slot ${kunci} tanpa URL bila berkas hilang`);
}

// ---------------------------------------------------------------------------
// Cakupan & langkah konsumsi: harus jujur soal ikon launcher.
// ---------------------------------------------------------------------------

ok(`ada ${LANGKAH_KONSUMSI.length} langkah konsumsi`, LANGKAH_KONSUMSI.length >= 4);
ok(
  "langkah menyebut endpoint /api/aplikasi-android",
  LANGKAH_KONSUMSI.some((l) => l.includes("/api/aplikasi-android")),
);
ok(
  "langkah menyebut query Convex sebagai alternatif",
  LANGKAH_KONSUMSI.some((l) => l.includes("androidApp.asetAktif")),
);
ok("ada daftar yang berlaku tanpa build ulang", CAKUPAN_PENGATURAN.tanpaBuildUlang.length >= 3);
ok("ada daftar yang tetap butuh APK baru", CAKUPAN_PENGATURAN.butuhApkBaru.length >= 1);
ok(
  "cakupan menyebut ikon launcher butuh APK baru (tidak menjanjikan berlebihan)",
  CAKUPAN_PENGATURAN.butuhApkBaru.some((b) => b.toLowerCase().includes("launcher")),
);
ok(
  "cakupan menyebut splash berlaku tanpa build ulang",
  CAKUPAN_PENGATURAN.tanpaBuildUlang.some((b) => b.toLowerCase().includes("splash")),
);

console.log(`asetAndroidApp.test: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
