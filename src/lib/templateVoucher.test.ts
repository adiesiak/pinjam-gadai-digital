/**
 * Uji template voucher siap pakai.
 * Run: bun src/lib/templateVoucher.test.ts
 *
 * Yang dijaga: setiap template lolos validasi nilai dan tanggal yang sama
 * dengan formulir admin, serta masa berlakunya berakhir tepat pukul 23.59 WIB.
 */
import { LOAN_LIMITS } from "./loan";
import {
  berlakuSampaiTemplate,
  isiTemplateVoucher,
  TEMPLATE_VOUCHER,
} from "./templateVoucher";
import { tanggalWIB } from "./waktu";
import { periksaNilaiVoucher } from "./voucher";

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
const SEKARANG = Date.UTC(2026, 9, 25, 3) - 7 * 3_600_000; // 25 Okt 2026, 03.00 WIB

function jamWIB(ms: number): string {
  return new Date(ms + 7 * 3_600_000).toISOString().slice(11, 23);
}

for (const template of TEMPLATE_VOUCHER) {
  const isi = isiTemplateVoucher(template, SEKARANG);
  eq(
    periksaNilaiVoucher(isi.jenis, isi.nilai),
    null,
    `${template.id} lolos validasi nilai`,
  );
  ok(
    Number.isSafeInteger(isi.minPokok) && isi.minPokok >= LOAN_LIMITS.minPokok,
    `${template.id} minimal pengajuan sah`,
  );
  ok(isi.judul.length >= 3 && isi.judul.length <= 80, `${template.id} judul 3–80 karakter`);
  ok(isi.berlakuSampai > SEKARANG, `${template.id} masa berlaku di masa depan`);
  eq(jamWIB(isi.berlakuSampai), "23:59:59.999", `${template.id} berakhir 23.59 WIB`);
}

// ===== Masa berlaku dihitung per hari WIB, bukan per 24 jam bergeser =====
eq(
  tanggalWIB(berlakuSampaiTemplate(SEKARANG, 0)),
  "2026-10-25",
  "nol hari = hari ini",
);
eq(
  tanggalWIB(berlakuSampaiTemplate(SEKARANG, 14)),
  "2026-11-08",
  "empat belas hari dari 25 Oktober",
);
eq(
  berlakuSampaiTemplate(SEKARANG, 14) - berlakuSampaiTemplate(SEKARANG, 0),
  14 * HARI_MS,
  "selisih tepat empat belas hari",
);

// Dini hari WIB tetap dihitung hari yang sama, bukan hari sebelumnya (UTC).
const diniHari = Date.UTC(2026, 9, 24, 17, 30) - 0; // 25 Okt 00.30 WIB
eq(tanggalWIB(diniHari), "2026-10-25", "acuan uji memang dini hari WIB");
eq(
  tanggalWIB(berlakuSampaiTemplate(diniHari, 0)),
  "2026-10-25",
  "dini hari tidak memakai tanggal UTC kemarin",
);

// ===== Template yang diminta produk benar-benar ada =====
ok(
  TEMPLATE_VOUCHER.some((t) => t.jenis === "diskon_bunga" && t.nilai === 5),
  "ada template bunga −5 poin",
);
ok(
  TEMPLATE_VOUCHER.some((t) => t.jenis === "tambah_tenor" && t.nilai === 7),
  "ada template tenor +7 hari",
);

const jumlah = lulus + gagal;
console.log(`templateVoucher.test: ${lulus}/${jumlah} lulus`);
if (gagal > 0) process.exit(1);
