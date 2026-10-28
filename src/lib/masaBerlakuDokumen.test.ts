/**
 * Uji masa berlaku dokumen underwriting (`src/lib/masaBerlakuDokumen.ts`).
 * Run: bun src/lib/masaBerlakuDokumen.test.ts
 *
 * Yang dijaga:
 *  - jendela tiap dokumen sesuai kebijakan (KTP 10 tahun, KK/selfie 1 tahun,
 *    domisili dan slip gaji 90 hari);
 *  - batas berlaku memakai hari kalender, bukan jam;
 *  - dokumen tanpa waktu unggah tidak dianggap kedaluwarsa;
 *  - pesan galat menyebut dokumen dan tanggal berlakunya.
 */
import {
  ATURAN_MASA_BERLAKU,
  dokumenKedaluwarsa,
  kedaluwarsaPada,
  labelDokumen,
  pesanMasaBerlaku,
  statusMasaBerlaku,
} from "@/lib/masaBerlakuDokumen";

let lulus = 0;
let gagal = 0;
function cek(nama: string, syarat: boolean) {
  if (syarat) lulus += 1;
  else {
    gagal += 1;
    console.error(`FAIL ${nama}`);
  }
}
const sama = (nama: string, nyata: unknown, harap: unknown) =>
  cek(`${nama} (${String(nyata)} = ${String(harap)})`, nyata === harap);

const MS_HARI = 86_400_000;
const SEKARANG = Date.UTC(2026, 9, 28, 3, 0); // 28 Okt 2026

// ---- Jendela kebijakan ----
sama("KTP 10 tahun", ATURAN_MASA_BERLAKU.ktp.hari, 3_650);
sama("KK 1 tahun", ATURAN_MASA_BERLAKU.kartuKeluarga.hari, 365);
sama("selfie 1 tahun", ATURAN_MASA_BERLAKU.selfie.hari, 365);
sama("domisili 90 hari", ATURAN_MASA_BERLAKU.buktiDomisili.hari, 90);
sama("slip gaji 90 hari", ATURAN_MASA_BERLAKU.buktiPenghasilan.hari, 90);
sama("label KTP", labelDokumen("ktp"), "Foto KTP");

// ---- Batas berlaku ----
const unggah = SEKARANG - 30 * MS_HARI;
sama(
  "berlaku sampai 10 tahun kemudian",
  kedaluwarsaPada("ktp", unggah),
  unggah + 3_650 * MS_HARI,
);
cek(
  "KTP lama masih berlaku",
  !statusMasaBerlaku("ktp", unggah, SEKARANG).kedaluwarsa,
);

// ---- Slip gaji 90 hari ----
const slipLama = SEKARANG - 100 * MS_HARI;
const statusSlip = statusMasaBerlaku("buktiPenghasilan", slipLama, SEKARANG);
sama("slip 100 hari sudah lewat", statusSlip.kedaluwarsa, true);
sama("sisa hari negatif", statusSlip.sisaHari, -10);
cek(
  "slip 89 hari masih berlaku",
  !statusMasaBerlaku("buktiPenghasilan", SEKARANG - 89 * MS_HARI, SEKARANG)
    .kedaluwarsa,
);
cek(
  "tepat di batas 90 hari sudah lewat",
  statusMasaBerlaku("buktiPenghasilan", SEKARANG - 90 * MS_HARI, SEKARANG)
    .kedaluwarsa,
);
cek(
  "sehari sebelum batas masih berlaku",
  !statusMasaBerlaku("buktiPenghasilan", SEKARANG - 89 * MS_HARI, SEKARANG)
    .kedaluwarsa,
);

// ---- Penyaringan ----
const daftar = dokumenKedaluwarsa(
  [
    { jenis: "ktp", diunggahPada: SEKARANG - 365 * MS_HARI },
    { jenis: "buktiPenghasilan", diunggahPada: SEKARANG - 120 * MS_HARI },
    { jenis: "kartuKeluarga", diunggahPada: null },
    { jenis: "buktiDomisili", diunggahPada: SEKARANG - 10 * MS_HARI },
  ],
  SEKARANG,
);
sama("hanya yang lewat masa berlaku", daftar.length, 1);
sama("jenis yang tersaring", daftar[0]?.jenis, "buktiPenghasilan");
sama("lewat 30 hari", daftar[0]?.lewatHari, 30);

// ---- Pesan ----
const pesan = pesanMasaBerlaku(daftar);
cek("pesan tidak null", pesan !== null);
cek("pesan menyebut dokumen", pesan?.includes("Slip gaji") ?? false);
cek("pesan menyebut KYC", pesan?.includes("Verifikasi KYC") ?? false);
cek("pesan menyebut tanggal berlaku", pesan?.includes("berlaku sampai") ?? false);
sama("tanpa dokumen lewat: tanpa pesan", pesanMasaBerlaku([]), null);

// ---- Waktu tidak masuk akal ----
function melempar(nama: string, fn: () => unknown) {
  try {
    fn();
    gagal += 1;
    console.error(`FAIL ${nama}: seharusnya melempar`);
  } catch {
    lulus += 1;
  }
}
melempar("waktu unggah 0 ditolak", () => kedaluwarsaPada("ktp", 0));
melempar("waktu unggah NaN ditolak", () => kedaluwarsaPada("selfie", Number.NaN));

console.log(`\n${lulus} lulus, ${gagal} gagal`);
if (gagal > 0) process.exit(1);
