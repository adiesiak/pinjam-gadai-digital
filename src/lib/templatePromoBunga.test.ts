/**
 * Uji template bunga promo siap pakai.
 * Run: bun src/lib/templatePromoBunga.test.ts
 *
 * Yang dijaga: setiap template menghasilkan isian yang lolos validasi promo,
 * batas harinya mengikuti WIB (bukan UTC), dan rentang tanggalnya memang
 * seperti yang dijanjikan label — termasuk Sabtu–Minggu dan akhir bulan.
 */
import { periksaIsiPromoBunga } from "./promoBunga";
import {
  isiTemplatePromoBunga,
  TEMPLATE_PROMO_BUNGA,
  type TemplatePromoBunga,
} from "./templatePromoBunga";
import { OFFSET_WIB_MS, tanggalWIB } from "./waktu";

let lulus = 0;
let gagal = 0;

function ok(syarat: boolean, label: string): void {
  if (syarat) lulus += 1;
  else {
    gagal += 1;
    console.error(`FAIL ${label}`);
  }
}

function eq(hasil: unknown, acuan: unknown, label: string): void {
  ok(hasil === acuan, `${label} (dapat ${String(hasil)}, harus ${String(acuan)})`);
}

const HARI_MS = 86_400_000;

/** Satu titik waktu menurut kalender WIB. */
function wib(tahun: number, bulan: number, hari: number, jam = 0): number {
  return Date.UTC(tahun, bulan - 1, hari, jam) - OFFSET_WIB_MS;
}

function jamWIB(ms: number): string {
  return new Date(ms + OFFSET_WIB_MS).toISOString().slice(11, 23);
}

function hariPekanWIB(ms: number): number {
  return new Date(ms + OFFSET_WIB_MS).getUTCDay();
}

function cari(id: string): TemplatePromoBunga {
  const template = TEMPLATE_PROMO_BUNGA.find((t) => t.id === id);
  if (template === undefined) throw new Error(`Template ${id} tidak ada.`);
  return template;
}

// ===== Semua template harus bisa disimpan =====
const contohWaktu = [
  wib(2026, 10, 25, 0), // Minggu, awal hari
  wib(2026, 10, 25, 23), // Minggu, akhir hari
  wib(2026, 10, 21, 9), // tengah pekan
  wib(2026, 2, 28, 12), // akhir Februari
  wib(2027, 1, 31, 20), // akhir bulan 31 hari
  wib(2026, 12, 1, 6), // awal bulan
];

for (const template of TEMPLATE_PROMO_BUNGA) {
  for (const waktu of contohWaktu) {
    const isi = isiTemplatePromoBunga(template, waktu);
    eq(
      periksaIsiPromoBunga(isi).length,
      0,
      `${template.id} lolos validasi pada ${tanggalWIB(waktu)}`,
    );
    ok(isi.selesai >= isi.mulai, `${template.id} selesai tidak sebelum mulai`);
  }
}

// ===== "Hanya hari ini" berakhir pukul 23.59 WIB =====
const hariIni = isiTemplatePromoBunga(cari("hari-ini"), wib(2026, 10, 25, 15));
eq(tanggalWIB(hariIni.mulai), "2026-10-25", "hari ini mulai tanggal WIB yang sama");
eq(hariIni.selesai - hariIni.mulai, HARI_MS - 1, "hari ini tepat satu hari penuh");
eq(jamWIB(hariIni.selesai), "23:59:59.999", "hari ini berakhir 23.59.59.999 WIB");
eq(
  tanggalWIB(isiTemplatePromoBunga(cari("hari-ini"), wib(2026, 10, 25, 0)).selesai),
  "2026-10-25",
  "dini hari masih tanggal yang sama",
);

// ===== "Tiga hari" mencakup hari ini dan dua hari berikutnya =====
const tigaHari = isiTemplatePromoBunga(cari("tiga-hari"), wib(2026, 10, 21, 8));
eq(tanggalWIB(tigaHari.mulai), "2026-10-21", "tiga hari mulai hari ini");
eq(tanggalWIB(tigaHari.selesai), "2026-10-23", "tiga hari berakhir hari ketiga");
eq(tigaHari.selesai - tigaHari.mulai, 3 * HARI_MS - 1, "tiga hari = 3 x 24 jam");

// ===== "Akhir pekan" = Sabtu sampai Minggu =====
const sabtu = isiTemplatePromoBunga(cari("akhir-pekan"), wib(2026, 10, 21, 10));
eq(hariPekanWIB(sabtu.mulai), 6, "akhir pekan mulai Sabtu");
eq(hariPekanWIB(sabtu.selesai), 0, "akhir pekan berakhir Minggu");
eq(tanggalWIB(sabtu.mulai), "2026-10-24", "tengah pekan memakai Sabtu terdekat");
eq(
  tanggalWIB(isiTemplatePromoBunga(cari("akhir-pekan"), wib(2026, 10, 25, 9)).mulai),
  "2026-10-24",
  "hari Minggu tetap memakai akhir pekan berjalan",
);
eq(
  tanggalWIB(isiTemplatePromoBunga(cari("akhir-pekan"), wib(2026, 10, 24, 9)).mulai),
  "2026-10-24",
  "hari Sabtu memakai akhir pekan berjalan",
);

// ===== "Semua tenor" memakai seluruh tenor harian =====
eq(cari("semua-tenor").tenor.join(","), "7,14,21,28", "semua tenor tercakup");
eq(
  tanggalWIB(isiTemplatePromoBunga(cari("semua-tenor"), wib(2026, 10, 25, 9)).selesai),
  "2026-10-31",
  "semua tenor berlaku sepekan",
);

// ===== "Tanggal gajian" = 25 sampai akhir bulan =====
const gajian = isiTemplatePromoBunga(cari("gajian"), wib(2026, 10, 21, 10));
eq(tanggalWIB(gajian.mulai), "2026-10-25", "gajian mulai tanggal 25");
eq(tanggalWIB(gajian.selesai), "2026-10-31", "gajian berakhir akhir bulan");
const gajianFebruari = isiTemplatePromoBunga(cari("gajian"), wib(2026, 2, 10, 10));
eq(tanggalWIB(gajianFebruari.selesai), "2026-02-28", "Februari 2026 berakhir tanggal 28");
eq(jamWIB(gajianFebruari.selesai), "23:59:59.999", "gajian berakhir 23.59.59.999 WIB");
const gajianAwalBulan = isiTemplatePromoBunga(cari("gajian"), wib(2026, 11, 2, 10));
eq(tanggalWIB(gajianAwalBulan.mulai), "2026-11-25", "awal bulan menjadwalkan tanggal 25");

// ===== Jenis template dan batas angkanya =====
for (const template of TEMPLATE_PROMO_BUNGA) {
  if (template.jenis === "bebas_admin") {
    eq(template.persenBunga, 0, `${template.id} bebas admin tanpa bunga`);
  } else if (template.jenis === "potongan_bunga") {
    ok(
      template.potonganPersen !== undefined &&
        template.potonganPersen > 0 &&
        template.potonganPersen <= 25,
      `${template.id} potongan 1–25 poin`,
    );
  } else {
    ok(template.persenBunga > 0 && template.persenBunga <= 25, `${template.id} bunga 1–25%`);
  }
  ok(template.tenor.length > 0, `${template.id} punya tenor`);
}

// Template penawaran baru benar-benar mencakup tenor yang dijanjikan.
eq(cari("tenor-10").tenor.join(","), "10", "template tenor 10 hanya tenor 10");
eq(cari("potongan-5").tenor.length, 24, "potongan 5 mencakup tenor 7–30");
eq(cari("potongan-5").tenor[0], 7, "potongan 5 mulai tenor 7");
eq(cari("potongan-5").tenor[cari("potongan-5").tenor.length - 1], 30, "potongan 5 berakhir tenor 30");
eq(cari("bebas-admin").jenis, "bebas_admin", "template bebas admin memakai jenis yang benar");

const jumlah = lulus + gagal;
console.log(`templatePromoBunga.test: ${lulus}/${jumlah} lulus`);
if (gagal > 0) process.exit(1);
