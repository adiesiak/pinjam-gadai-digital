/**
 * Buat QR halaman unduh (`public/qr-aplikasi.svg`).
 * Run: bun scripts/buat-qr-aplikasi.ts
 *
 * QR dibuat dari `URL_HALAMAN_UNDUH`, bukan diketik ulang di skrip, supaya
 * alamat di QR selalu sama dengan alamat yang dibagikan tombol WhatsApp.
 */
import QRCode from "qrcode";

import { URL_HALAMAN_UNDUH } from "../src/lib/tautanAplikasi";

const svg = await QRCode.toString(URL_HALAMAN_UNDUH, {
  type: "svg",
  width: 240,
  margin: 2,
  errorCorrectionLevel: "M",
  color: { dark: "#0f3d3a", light: "#ffffff" },
});

await Bun.write("public/qr-aplikasi.svg", svg);
console.log(`QR ${URL_HALAMAN_UNDUH} → public/qr-aplikasi.svg`);
