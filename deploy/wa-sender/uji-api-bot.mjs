#!/usr/bin/env node
/**
 * Uji koneksi bot WhatsApp ke PINDAI.
 *
 * Jalankan di VPS:
 *   PINDAI_BOT_API_KEY=<kunci> node uji-api-bot.mjs
 *
 * Skrip ini TIDAK membuat pengajuan atau mengubah data apa pun. Yang diuji
 * hanya: kunci sah, route hidup, dan kontrak respons sesuai.
 *
 * Keluaran: daftar periksa dengan tanda OK/GAGAL, dan kode keluar 1 bila ada
 * yang gagal.
 */

import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { buatKlien, GalatPindai } = require("./pindai-api.cjs");

const KUNCI = process.env.PINDAI_BOT_API_KEY ?? "";
const NOMOR_UJI = "089999999999"; // sengaja tidak terdaftar

const hasil = [];
function catat(nama, lulus, keterangan = "") {
  hasil.push({ nama, lulus, keterangan });
  const tanda = lulus ? "OK  " : "GAGAL";
  console.log(`  [${tanda}] ${nama}${keterangan ? " — " + keterangan : ""}`);
}

console.log("=== Uji koneksi bot WhatsApp ke PINDAI ===\n");

if (KUNCI.trim() === "") {
  console.log("  [GAGAL] PINDAI_BOT_API_KEY belum diset.");
  console.log("\nSet dulu:");
  console.log("  export PINDAI_BOT_API_KEY=<kunci dari admin PINDAI>");
  console.log("\nAtau untuk systemd, simpan di /etc/pindai/bot.env:");
  console.log("  PINDAI_BOT_API_KEY=<kunci>");
  process.exit(1);
}
console.log(`  Kunci terbaca: ${KUNCI.slice(0, 6)}…${KUNCI.slice(-4)} (${KUNCI.length} karakter)\n`);

const klien = buatKlien({ apiKey: KUNCI });

// 1. Kunci sah: status nomor tak terdaftar harus menjawab "belum terdaftar",
//    BUKAN melempar galat 401. Kalau 401, kuncinya salah.
try {
  const s = await klien.status(NOMOR_UJI);
  catat(
    "Kunci API diterima",
    true,
    s.terdaftar ? "nomor uji ternyata terdaftar" : "nomor uji belum terdaftar, sesuai harapan",
  );
  catat("Kontrak /bot/status sesuai", s.terdaftar === false && Array.isArray(s.pengajuan));
} catch (e) {
  if (e instanceof GalatPindai && e.kode === 401) {
    catat("Kunci API diterima", false, "401 — kunci ditolak PINDAI");
  } else if (e instanceof GalatPindai && e.kode === 503) {
    catat("Kunci API diterima", false, "503 — BOT_API_KEY belum diset di Convex");
  } else {
    catat("Kunci API diterima", false, e.message);
  }
}

// 2. Route unggah hidup: bot butuh ini untuk mengirim foto KTP.
try {
  const url = await klien.urlUnggah();
  const sah = typeof url === "string" && url.startsWith("https://");
  catat("Route /bot/unggah-url hidup", sah, sah ? "URL diterima" : "URL tidak sah");
} catch (e) {
  catat("Route /bot/unggah-url hidup", false, e.message);
}

// 3. Route tagihan hidup: bot butuh ini untuk menjawab "berapa yang harus saya
//    bayar". Nomor uji tidak terdaftar, jadi yang diperiksa hanya bahwa
//    kontraknya sesuai (bukan galat jaringan atau 404).
try {
  const t = await klien.tagihan(NOMOR_UJI);
  catat(
    "Route /bot/tagihan hidup",
    t.terdaftar === false && Array.isArray(t.pinjaman),
    t.terdaftar ? "nomor uji ternyata terdaftar" : "nomor uji belum terdaftar, sesuai harapan",
  );
} catch (e) {
  catat("Route /bot/tagihan hidup", false, e.pesan ?? e.message);
}

// 4. Pengajuan untuk nomor tak terdaftar harus ditolak dengan pesan jelas,
//    BUKAN diterima (kalau diterima, ada yang salah dengan pemetaan nomor).
try {
  await klien.ajukan(NOMOR_UJI, {
    pokokPinjaman: 1,
    tujuan: "uji",
    namaLengkap: "uji",
    namaBank: "uji",
    nomorRekening: "0",
    tenorHari: 1,
    nik: "0",
    nomorWhatsApp: NOMOR_UJI,
    penghasilanBulanan: 1,
    sumberPenghasilan: "uji",
    dokKtpId: "x",
    dokSelfieKtpId: "x",
    dokSlipGajiId: "x",
    persetujuanSyarat: true,
  });
  catat("Pengajuan nomor tak terdaftar ditolak", false, "DITERIMA — seharusnya ditolak");
} catch (e) {
  const pesan = e instanceof GalatPindai ? e.pesan : e.message;
  const benar = /belum terdaftar/i.test(pesan);
  catat("Pengajuan nomor tak terdaftar ditolak", benar, pesan);
}

console.log("\n=== Ringkasan ===");
const lulus = hasil.filter((h) => h.lulus).length;
console.log(`  ${lulus}/${hasil.length} periksa lulus`);

if (lulus !== hasil.length) {
  console.log("\nYang perlu diperbaiki:");
  for (const h of hasil.filter((x) => !x.lulus)) {
    console.log(`  - ${h.nama}: ${h.keterangan}`);
  }
  process.exit(1);
}

console.log("\nKoneksi siap. Bot sudah bisa memanggil API PINDAI.");
console.log("Langkah berikutnya:");
console.log("  - docs/api-bot-whatsapp.md    (daftar, unggah, pengajuan, status)");
console.log("  - docs/api-bot-kyc-dan-uang.md (KYC, tagihan, pencairan, pembayaran)");
