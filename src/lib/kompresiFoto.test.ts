/**
 * Uji kompresi foto KYC (`src/lib/kompresiFoto.ts`) + perkabelannya di kamera
 * live (`src/components/kyc/KameraLive.tsx`).
 * Run: bun src/lib/kompresiFoto.test.ts
 *
 * Yang dijaga: foto kamera TIDAK dikirim apa adanya. Ia dikodekan ulang sebagai
 * JPEG kualitas 0,7, sisi terpanjangnya dibatasi, dan bila masih di atas 500 KB
 * kualitas lalu ukurannya diturunkan sampai batas itu benar-benar tercapai
 * (`sesuaiTarget`). Tanpa uji ini, "kompresi" bisa diam-diam berhenti bekerja
 * saat kualitas dinaikkan seseorang — dan unggahan besar kembali muncul justru
 * di HP yang paling mudah kehabisan memori.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  dataUrlKeFile,
  kompresKanvasKeJpeg,
  kualitasBerikut,
  perkiraanByteDataUrl,
  ringkasKompresi,
  skalaUntukMaksSisi,
  TAKARAN_FOTO_KYC,
  type KanvasKompresi,
} from "@/lib/kompresiFoto";

let passed = 0;
let failed = 0;
function ok(syarat: boolean, label: string): void {
  if (syarat) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${label}`);
  }
}
function ada(teks: string, cari: string, label: string): void {
  ok(teks.includes(cari), `${label} (memuat "${cari}")`);
}
function tidakAda(teks: string, cari: string, label: string): void {
  ok(!teks.includes(cari), `${label} (tidak memuat "${cari}")`);
}

/** Data URL base64 yang panjang isinya mewakili tepat `n` byte. */
function dataUrlDariByte(n: number): string {
  const grup = Math.ceil(n / 3);
  let isi = "A".repeat(grup * 4);
  const sisa = n % 3;
  if (sisa === 1) isi = `${isi.slice(0, -2)}==`;
  else if (sisa === 2) isi = `${isi.slice(0, -1)}=`;
  return `data:image/jpeg;base64,${isi}`;
}

// ===== 1. Takaran produk =====
ok(TAKARAN_FOTO_KYC.kualitas === 0.7, "kualitas JPEG sesuai ketentuan produk (0,7)");
ok(TAKARAN_FOTO_KYC.maksByte === 500 * 1024, "target ukuran berkas 500 KB");
ok(TAKARAN_FOTO_KYC.maksSisi === 1600, "sisi terpanjang dibatasi 1600 px");

// ===== 2. Pengukuran byte tanpa DOM =====
for (const n of [0, 1, 2, 3, 4, 999, 1024, 500 * 1024]) {
  ok(perkiraanByteDataUrl(dataUrlDariByte(n)) === n, `ukuran ${n} byte terukur tepat`);
}
ok(perkiraanByteDataUrl("bukan-data-url") === 0, "teks tanpa koma dianggap 0 byte");

// ===== 3. Skala & kualitas =====
ok(skalaUntukMaksSisi(3200, 2400, 1600) === 0.5, "sisi 3200 px diperkecil setengah");
ok(skalaUntukMaksSisi(800, 600, 1600) === 1, "gambar kecil TIDAK diperbesar");
ok(skalaUntukMaksSisi(0, 0, 1600) === 1, "dimensi kosong tidak menghasilkan skala aneh");
ok(kualitasBerikut(0.7, 0.4) === 0.6, "kualitas turun bertahap dari 0,7");
ok(kualitasBerikut(0.4, 0.4) === null, "kualitas berhenti di batas bawah");

// ===== 4. Loop kompresi (kanvas palsu) =====
/**
 * Kanvas tiruan: `toDataURL` menghasilkan ukuran byte yang ikut dimensi dan
 * kualitas, sehingga loop bisa diuji tanpa peramban. `document.createElement`
 * dipalsukan HANYA untuk jalur pengecilan ukuran.
 */
function buatKanvas(lebar: number, tinggi: number, bytePerPiksel: number): KanvasKompresi {
  const el = {
    width: lebar,
    height: tinggi,
    getContext: () => ({ drawImage: () => undefined }),
    toDataURL: (_jenis?: string, kualitas = 0.7) =>
      dataUrlDariByte(Math.round(el.width * el.height * bytePerPiksel * kualitas)),
  };
  // Kanvas tiruan: hanya empat anggota yang dipakai kompresor yang diisi.
  return el as unknown as KanvasKompresi;
}

const dokumenAsli = (globalThis as { document?: unknown }).document;
type KanvasTiruan = ReturnType<typeof buatKanvas>;
const kanvasDibuat: KanvasTiruan[] = [];
/**
 * Kerapatan byte kanvas hasil pengecilan. Kanvas yang dibuat `document` harus
 * mengodekan dengan kerapatan yang SAMA seperti kanvas sumbernya — kalau tidak,
 * uji "kasus mustahil" akan lolos palsu karena pengecilan diam-diam dianggap
 * menghasilkan gambar yang jauh lebih ringan.
 */
let bppAktif = 0.5;
(globalThis as { document?: unknown }).document = {
  createElement: () => {
    const el = buatKanvas(0, 0, 0);
    // Ukuran diisi pemanggil setelah elemen dibuat — sama seperti DOM asli.
    Object.defineProperty(el, "toDataURL", {
      value: (_jenis?: string, kualitas = 0.7) =>
        dataUrlDariByte(Math.round(el.width * el.height * bppAktif * kualitas)),
    });
    kanvasDibuat.push(el);
    return el as unknown as HTMLCanvasElement;
  },
} as unknown as Document;

try {
  // Foto 3200×2400: diperkecil ke 1600×1200, lalu kualitasnya diturunkan sampai
  // di bawah 500 KB (0,7 → 0,5 pada takaran ini).
  const sedang = kompresKanvasKeJpeg(buatKanvas(3200, 2400, 0.5));
  ok(sedang.lebar === 1600 && sedang.tinggi === 1200, "foto besar diperkecil ke sisi 1600 px");
  ok(sedang.sesuaiTarget, "hasil akhir berada di bawah 500 KB");
  ok(sedang.byte <= TAKARAN_FOTO_KYC.maksByte, "byte akhir tidak melewati target");
  ok(sedang.kualitas < 0.7, "kualitas diturunkan sebelum menyerah");
  ok(sedang.kualitas >= TAKARAN_FOTO_KYC.kualitasMinimum, "kualitas tidak turun di bawah batas bawah");
  ada(sedang.dataUrl, "data:image/jpeg;base64,", "hasil dikodekan sebagai JPEG");

  // Foto kecil & ringan: sama sekali tidak perlu diturunkan.
  const kecil = kompresKanvasKeJpeg(buatKanvas(640, 480, 0.2));
  ok(kecil.kualitas === 0.7, "foto yang sudah kecil tetap memakai kualitas 0,7");
  ok(kecil.lebar === 640 && kecil.tinggi === 480, "dimensi foto kecil tidak diubah");
  ok(kecil.sesuaiTarget, "foto kecil langsung memenuhi target");

  // Kasus ekstrem: byte per piksel dibuat mustahil, loop harus BERHENTI dan
  // jujur menyatakan targetnya tidak tercapai (bukan mengaku sesuai target).
  bppAktif = 4;
  const sebelumEkstrem = kanvasDibuat.length;
  const ekstrem = kompresKanvasKeJpeg(buatKanvas(3200, 2400, 4));
  ok(!ekstrem.sesuaiTarget, "kasus mustahil: sesuaiTarget jujur bernilai false");
  ok(ekstrem.lebar < 1600, "ukuran tetap diperkecil sebagai upaya terakhir");
  ok(
    kanvasDibuat.length - sebelumEkstrem <= TAKARAN_FOTO_KYC.maksPenurunan + 1,
    "jumlah pengecilan dalam satu kompresi terbatas",
  );
} finally {
  (globalThis as { document?: unknown }).document = dokumenAsli;
}

// ===== 5. Kalimat & berkas =====
const siap = kompresKanvasKeJpeg(buatKanvas(640, 480, 0.2));
ada(ringkasKompresi(siap), "Foto siap:", "kalimat hasil menyatakan foto siap");
ada(ringkasKompresi(siap), "KB", "ukuran disebut dalam KB");
ada(ringkasKompresi(siap), "JPEG 70%", "kualitas yang dipakai disebut");
const berkas = dataUrlKeFile(dataUrlDariByte(10), "ktp-live-1.jpg");
ok(berkas.size === 10, "berkas hasil punya ukuran yang benar");
ok(berkas.type === "image/jpeg", "jenis berkas JPEG");
ok(berkas.name === "ktp-live-1.jpg", "nama berkas dipertahankan");

// ===== 6. Perkabelan kamera =====
const kamera = readFileSync(
  fileURLToPath(new URL("../components/kyc/KameraLive.tsx", import.meta.url)),
  "utf8",
)
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");
ada(kamera, 'from "@/lib/kompresiFoto"', "kamera memakai kompresor bersama");
ada(kamera, "kompresKanvasKeJpeg(", "kamera mengompres hasil tangkapan");
ada(kamera, "dataUrlKeFile(", "kamera mengubah hasil kompresi menjadi berkas");
tidakAda(kamera, "0.92", "kualitas lama 0,92 tidak tersisa");
tidakAda(kamera, "kanvas.toBlob(", "kanvas tidak dikodekan dua kali dengan jalur berbeda");

if (failed > 0) {
  console.error(`\n${failed} gagal, ${passed} lulus`);
  process.exit(1);
}
console.log(`kompresiFoto: ${passed} lulus`);
