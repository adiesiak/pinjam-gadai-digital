/**
 * Uji render bagian MURNI kontrol Perangkat & Sesi.
 * Run: bun src/components/PerangkatSesiSaya.render.test.tsx
 *
 * Yang dijaga (batas privasi yang mudah rusak tanpa terasa):
 *  - ID perangkat dipotong, bukan ditampilkan utuh;
 *  - status token dinyatakan sebagai kalimat, bukan nilai tokennya;
 *  - baris sesi menampilkan IP yang sudah disamarkan pemanggil;
 *  - perangkat aktif/tidak aktif dibedakan dengan teks, bukan warna saja.
 */
import { renderToStaticMarkup } from "react-dom/server";

import { samarkanIp } from "@/lib/session";
import type { Id } from "@/convex/_generated/dataModel";
import { BarisPerangkat, BarisSesi } from "./PerangkatSesiSaya";

let passed = 0;
let failed = 0;
function ok(syarat: boolean, label: string): void {
  if (syarat) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${label}`);
  }
}
function ada(html: string, teks: string, label: string): void {
  ok(html.includes(teks), `${label} (memuat "${teks}")`);
}
function tidakAda(html: string, teks: string, label: string): void {
  ok(!html.includes(teks), `${label} (tidak memuat "${teks}")`);
}
function bersih(html: string, label: string): void {
  ok(!html.includes("undefined"), `${label} tanpa "undefined"`);
  ok(!html.includes("[object Object]"), `${label} tanpa "[object Object]"`);
  ok(!html.includes("NaN"), `${label} tanpa "NaN"`);
}

const SEKARANG = 1_700_000_000_000;

// ===== 1. Perangkat aktif =====
{
  const html = renderToStaticMarkup(
    <BarisPerangkat
      perangkat={{
        _id: "p1" as Id<"perangkat">,
        deviceId: "abcdef1234567890",
        platform: "android",
        versiApp: "1.4.0",
        terdaftarPada: SEKARANG - 100_000,
        terakhirDilihat: SEKARANG - 1000,
        aktif: true,
        punyaToken: true,
      }}
      sibuk={false}
      onCabut={() => {}}
    />,
  );
  ada(html, "android", "platform tampil");
  ada(html, "1.4.0", "versi aplikasi tampil");
  ada(html, "Aktif", "status aktif sebagai teks");
  ada(html, "abcdef12", "ID perangkat dipotong");
  tidakAda(html, "abcdef1234567890", "ID perangkat utuh tidak ditampilkan");
  ada(html, "boleh mengirim lokasi dari layanan latar", "status token dijelaskan");
  ada(html, "Cabut", "tombol cabut tersedia");
  bersih(html, "baris perangkat");
}

// ===== 2. Perangkat tidak aktif tanpa token =====
{
  const html = renderToStaticMarkup(
    <BarisPerangkat
      perangkat={{
        _id: "p2" as Id<"perangkat">,
        deviceId: "zzzzzz999999",
        platform: "ios",
        versiApp: "1.0.1",
        terdaftarPada: SEKARANG - 900_000_000,
        terakhirDilihat: SEKARANG - 800_000_000,
        aktif: false,
        punyaToken: false,
      }}
      sibuk
      onCabut={() => {}}
    />,
  );
  ada(html, "Tidak aktif", "status tidak aktif sebagai teks");
  ada(html, "tanpa token lokasi", "perangkat tanpa token dinyatakan");
  tidakAda(html, "boleh mengirim lokasi", "klaim token tidak muncul saat tidak ada");
  bersih(html, "baris perangkat nonaktif");
}

// ===== 3. Sesi: IP disamarkan sebelum dirender =====
{
  const html = renderToStaticMarkup(
    <BarisSesi
      sesi={{
        _id: "s1" as Id<"sessions">,
        perangkat: "Android",
        ip: samarkanIp("36.85.123.9"),
        waktuMulai: SEKARANG - 60_000,
        sessionId: "sesi-ini",
      }}
      iniPerangkatIni
    />,
  );
  ada(html, "36.85.*.*", "IP tampil tersamar");
  tidakAda(html, "36.85.123.9", "IP utuh tidak pernah dirender");
  ada(html, "perangkat ini", "sesi yang sedang dipakai ditandai");
  ada(html, "Sedang dipakai", "lencana sesi aktif");
  bersih(html, "baris sesi");
}

if (failed > 0) {
  console.error(`\n${failed} gagal, ${passed} lulus`);
  throw new Error(`${failed} tes render perangkat & sesi gagal`);
}
console.log(`PerangkatSesiSaya: ${passed} lulus`);
