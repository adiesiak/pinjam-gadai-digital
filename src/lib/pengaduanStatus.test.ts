/** Run: bun src/lib/pengaduanStatus.test.ts — nada & ringkasan pengaduan (pure). */
import {
  nadaPrioritasPengaduan,
  nadaStatusPengaduan,
  ringkasAsalPesanTerakhir,
} from "./pengaduanStatus";
import { KANAL_PENGADUAN_MANDIRI, bolehBalasPengaduan, labelKanalPengaduan } from "./penagihan";

let passed = 0;
let failed = 0;
function eq(label: string, actual: unknown, expected: unknown): void {
  if (actual === expected) passed += 1;
  else {
    failed += 1;
    console.error(`✗ ${label}: diharapkan ${JSON.stringify(expected)}, dapat ${JSON.stringify(actual)}`);
  }
}
function ok(label: string, kondisi: boolean): void {
  eq(label, kondisi, true);
}

// --- Setiap status punya nada + berbeda dari yang lain --------------------
const nadaBaru = nadaStatusPengaduan("baru");
const nadaTinjau = nadaStatusPengaduan("ditinjau");
const nadaSelesai = nadaStatusPengaduan("selesai");
const nadaDitolak = nadaStatusPengaduan("ditolak");
ok("status berbeda → nada berbeda", new Set([nadaBaru, nadaTinjau, nadaSelesai, nadaDitolak]).size === 4);
ok("selesai bernada hijau", nadaSelesai.includes("emerald"));
ok("ditolak bernada merah", nadaDitolak.includes("red"));
eq("status tak dikenal jatuh ke netral", nadaStatusPengaduan("entah"), nadaBaru);

// --- Prioritas: kritis paling menonjol ------------------------------------
const nadaKritis = nadaPrioritasPengaduan("kritis");
const nadaTinggi = nadaPrioritasPengaduan("tinggi");
ok("kritis merah", nadaKritis.includes("red"));
ok("tinggi kuning", nadaTinggi.includes("amber"));
ok("kritis ≠ tinggi", nadaKritis !== nadaTinggi);
eq("prioritas tak dikenal → normal", nadaPrioritasPengaduan("entah"), nadaPrioritasPengaduan("normal"));

// --- Ringkasan asal pesan terakhir ---------------------------------------
eq("pesan petugas terbaca", ringkasAsalPesanTerakhir("petugas"), "ada balasan petugas");
eq("pesan nasabah terbaca", ringkasAsalPesanTerakhir("nasabah"), "pesan terakhir dari Anda");
eq("tanpa pesan → tanpa keterangan", ringkasAsalPesanTerakhir(null), "");
eq("arah tak dikenal → tanpa keterangan", ringkasAsalPesanTerakhir("sistem"), "");

// --- Aturan balas & kanal mandiri ----------------------------------------
ok("pengaduan baru boleh dibalas", bolehBalasPengaduan("baru").ok);
ok("pengaduan ditinjau boleh dibalas", bolehBalasPengaduan("ditinjau").ok);
eq("pengaduan selesai tidak boleh dibalas", bolehBalasPengaduan("selesai").ok, false);
eq("pengaduan ditolak tidak boleh dibalas", bolehBalasPengaduan("ditolak").ok, false);
eq("status tak dikenal ditolak", bolehBalasPengaduan("entah").ok, false);
const pesanTutup = bolehBalasPengaduan("selesai");
ok(
  "alasan penutupan menyebut kirim pengaduan baru",
  pesanTutup.ok === false && /pengaduan baru/i.test(pesanTutup.alasan),
);

eq("kanal mandiri = aplikasi", KANAL_PENGADUAN_MANDIRI, "aplikasi");
eq("label kanal mandiri", labelKanalPengaduan("aplikasi"), "Aplikasi PINDAI");
eq("kanal petugas tetap apa adanya", labelKanalPengaduan("whatsapp"), "whatsapp");

console.log(`pengaduanStatus tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
