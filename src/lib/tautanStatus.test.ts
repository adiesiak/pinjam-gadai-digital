/** Run: bun src/lib/tautanStatus.test.ts */
import {
  AKURASI_MAKS_TAUTAN_METER,
  bolehPing,
  bolehUnggahSelfie,
  berkasSelfieWajar,
  hitungKedaluwarsa,
  namaPanggilan,
  normalkanToken,
  pesanTautanTidakBerlaku,
  SUMBER_TAUTAN,
  TAUTAN_KEBIJAKAN,
  tautanKedaluwarsa,
  tokenTautanValid,
} from "./tautanStatus";

let passed = 0;
let failed = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  if (actual === expected) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
function ok(syarat: boolean, label: string) {
  eq(syarat, true, label);
}

// ===== Token =====
ok(tokenTautanValid("a".repeat(32)), "token 32 heksadesimal diterima");
ok(tokenTautanValid("0123456789abcdef0123456789abcdef"), "token heksadesimal campuran diterima");
ok(tokenTautanValid("0123456789ABCDEF0123456789ABCDEF"), "huruf besar dimaafkan");
ok(tokenTautanValid("  0123456789abcdef0123456789abcdef  "), "spasi tepi dimaafkan");
eq(tokenTautanValid("a".repeat(31)), false, "token 31 karakter ditolak");
eq(tokenTautanValid("a".repeat(33)), false, "token 33 karakter ditolak");
eq(tokenTautanValid("g".repeat(32)), false, "karakter non-heksadesimal ditolak");
eq(tokenTautanValid(""), false, "token kosong ditolak");
eq(tokenTautanValid("PNJ-2026-0012"), false, "nomor referensi BUKAN token yang sah");
eq(normalkanToken(" 0123456789ABCDEF0123456789ABCDEF "), "0123456789abcdef0123456789abcdef", "token dinormalkan ke huruf kecil");

// ===== Kedaluwarsa =====
const DIBUAT = 1_700_000_000_000;
eq(hitungKedaluwarsa(DIBUAT), DIBUAT + 30 * 86_400_000, "kedaluwarsa bawaan 30 hari");
eq(hitungKedaluwarsa(DIBUAT, 7), DIBUAT + 7 * 86_400_000, "kedaluwarsa bisa dikustomisasi");
eq(hitungKedaluwarsa(DIBUAT, 0), DIBUAT + 30 * 86_400_000, "hari tidak wajar kembali ke kebijakan");
const BATAS = hitungKedaluwarsa(DIBUAT);
eq(tautanKedaluwarsa(BATAS, BATAS), false, "tepat di batas masih berlaku");
eq(tautanKedaluwarsa(BATAS, BATAS + 1), true, "satu ms melewati batas sudah kedaluwarsa");
eq(tautanKedaluwarsa(BATAS, DIBUAT), false, "tautan baru belum kedaluwarsa");

// ===== Pembatas ping =====
const T0 = 1_700_000_000_000;
eq(bolehPing(null, 0, T0).boleh, true, "ping pertama selalu diterima");
eq(bolehPing(undefined, 0, T0).boleh, true, "ping pertama (undefined) diterima");
eq(bolehPing(T0, 0, T0).boleh, false, "ping pada ms yang sama ditolak");
eq(
  bolehPing(T0, 0, T0 + (TAUTAN_KEBIJAKAN.jedaPingDetik - 1) * 1_000).boleh,
  false,
  "ping di bawah jeda minimum ditolak",
);
eq(
  bolehPing(T0, 0, T0 + TAUTAN_KEBIJAKAN.jedaPingDetik * 1_000).boleh,
  true,
  "ping tepat di ujung jeda diterima",
);
eq(bolehPing(null, TAUTAN_KEBIJAKAN.maksPingPerHari, T0).boleh, false, "batas harian menolak ping baru");
eq(
  bolehPing(T0, TAUTAN_KEBIJAKAN.maksPingPerHari - 1, T0 + 60_000).boleh,
  true,
  "satu ping sebelum batas harian masih diterima",
);
ok(
  (bolehPing(null, TAUTAN_KEBIJAKAN.maksPingPerHari, T0).alasan ?? "").length > 0,
  "penolakan selalu membawa alasan untuk pengguna",
);

// ===== Unggah selfie =====
eq(bolehUnggahSelfie(0), true, "unggahan pertama boleh");
eq(bolehUnggahSelfie(undefined), true, "unggahan pertama (belum ada hitungan) boleh");
eq(bolehUnggahSelfie(TAUTAN_KEBIJAKAN.maksUnggahSelfie - 1), true, "unggahan terakhir yang diizinkan boleh");
eq(bolehUnggahSelfie(TAUTAN_KEBIJAKAN.maksUnggahSelfie), false, "melewati batas unggah ditolak");
eq(bolehUnggahSelfie(TAUTAN_KEBIJAKAN.maksUnggahSelfie + 5), false, "jauh melewati batas tetap ditolak");

// ===== Kewajaran berkas selfie =====
eq(berkasSelfieWajar(0).ok, false, "berkas kosong ditolak");
eq(berkasSelfieWajar(Number.NaN).ok, false, "ukuran NaN ditolak");
eq(berkasSelfieWajar(100).ok, false, "berkas di bawah minimum ditolak");
eq(berkasSelfieWajar(TAUTAN_KEBIJAKAN.minByteSelfie).ok, true, "berkas tepat di minimum diterima");
eq(berkasSelfieWajar(120 * 1024).ok, true, "berkas wajar diterima");
eq(berkasSelfieWajar(TAUTAN_KEBIJAKAN.maksByteSelfie).ok, true, "berkas tepat di maksimum diterima");
eq(berkasSelfieWajar(TAUTAN_KEBIJAKAN.maksByteSelfie + 1).ok, false, "berkas di atas maksimum ditolak");
ok((berkasSelfieWajar(10).alasan ?? "").length > 0, "penolakan berkas membawa alasan");

// ===== Pesan & nama =====
eq(pesanTautanTidakBerlaku("format").includes("Salin ulang"), true, "pesan format menjelaskan tindakan");
eq(pesanTautanTidakBerlaku("kedaluwarsa").includes("kedaluwarsa"), true, "pesan kedaluwarsa menyebut sebabnya");
eq(pesanTautanTidakBerlaku("tidak_dikenal").includes("tidak dikenali"), true, "pesan tak dikenal jujur");
eq(namaPanggilan("Asep Firman Hanafi"), "Asep", "sapaan memakai nama pertama");
eq(namaPanggilan("   "), "Peminjam", "nama kosong diganti sapaan netral");
eq(namaPanggilan("  Siti   Aminah  "), "Siti", "spasi berlebih dirapikan");

// ===== Konstanta yang dipakai server =====
eq(SUMBER_TAUTAN.klikTautan, "whatsapp_link_click", "sumber klik tautan sesuai permintaan produk");
ok(AKURASI_MAKS_TAUTAN_METER > 0, "batas akurasi masuk akal");

if (failed > 0) {
  console.error(`\n${failed} gagal, ${passed} lulus`);
  throw new Error(`${failed} tes tautan status gagal`);
}
console.log(`tautanStatus: ${passed} lulus`);
