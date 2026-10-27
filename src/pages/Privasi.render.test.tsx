/**
 * Uji render halaman `/privasi`.
 * Run: bun src/pages/Privasi.render.test.tsx
 *
 * Yang dijaga: halaman publik ini menyebut hal yang benar-benar berlaku
 * (angka retensi dari konstanta mesin, penerima data, hak subjek data), dan
 * tidak mengklaim hal yang tidak dilakukan aplikasi.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";

import { LOKASI_RETENSI } from "@/lib/lokasi";
import { DEFAULT_CONFIG } from "@/lib/system-config";

import { PrivasiView } from "./Privasi";

let passed = 0;
let failed = 0;
function ok(syarat: boolean, label: string): void {
  if (syarat) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${label}`);
  }
}
function ada(teks: string, label: string): void {
  ok(html.includes(teks), `${label} (memuat "${teks}")`);
}
function tidakAda(teks: string, label: string): void {
  ok(!html.includes(teks), `${label} (tidak memuat "${teks}")`);
}

const html = renderToStaticMarkup(
  <MemoryRouter initialEntries={["/privasi"]}>
    <PrivasiView />
  </MemoryRouter>,
);

// ===== 1. Kerangka halaman publik =====
ada("Kebijakan Privasi", "judul halaman");
ada('href="/"', "tautan kembali ke beranda");
ada('href="/auth"', "tautan masuk");
ada('href="/syarat-ketentuan"', "tautan ke syarat & ketentuan");
ada("27 Oktober 2026", "tanggal berlaku dicantumkan");

// ===== 2. Angka retensi berasal dari mesin, bukan angka baru =====
ada(`${LOKASI_RETENSI.jejakHari} hari`, "retensi jejak lokasi disebut");
ada(`${LOKASI_RETENSI.buktiPinjamanHari} hari`, "retensi bukti pinjaman disebut");
ada(`${DEFAULT_CONFIG.retensiLogWaHari} hari`, "retensi log pesan WhatsApp disebut");
ada(`${DEFAULT_CONFIG.retensiAuditHari} hari`, "retensi jejak audit disebut");
ada("7 hari", "retensi kunci teknis disebut");

// ===== 3. Penerima data dinyatakan, termasuk yang pihak ketiga =====
ada("Gateway WhatsApp", "gateway WhatsApp disebut sebagai penerima");
ada("Penyedia surel", "penyedia surel disebut");
ada("Turnstile", "layanan keamanan peramban disebut");
ada("Server peta", "server peta disebut");
ada("Penyedia dana", "ruang penyedia dana disebut");
ada("tidak menjual data pribadi", "batas pemakaian data dinyatakan");

// ===== 4. Hak subjek data menunjuk fitur yang benar-benar ada =====
ada("Data &amp; privasi", "lokasi tombol salinan disebut");
ada("JSON", "format salinan disebut");
ada("Menghapus akun", "hak hapus akun disebut");
ada("masih ada pinjaman, gadai,", "syarat penghapusan dinyatakan");
ada("kredit barang yang berjalan", "jenis kewajiban yang menahan disebut");
ada("helpdesk", "kanal keluhan disebut");

// ===== 5. Klaim yang tidak boleh muncul =====
// Persetujuan lokasi dicatat otomatis oleh gerbang produk; halaman ini tidak
// boleh menjanjikan opt-in yang tidak dijalankan kode.
tidakAda("opt-in", "tidak mengklaim opt-in lokasi");
tidakAda("tersertifikasi", "tidak mengklaim sertifikasi apa pun");
tidakAda("100% aman", "tidak menjanjikan keamanan mutlak");

console.log(`Privasi render tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
