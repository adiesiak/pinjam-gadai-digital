/** Uji aturan kampanye promo pinjaman (murni, tanpa Convex). */
import {
  BATAS_PROMO,
  PENEMPATAN_PROMO,
  formatPeriodePromo,
  labelPenempatan,
  msKeTanggalInput,
  periksaIsiPromo,
  promoBerjalan,
  statusPromo,
  tanggalKeMsWIB,
  type IsiPromoPinjaman,
} from "./promoPinjaman";
import { OFFSET_WIB_MS } from "./waktu";

let passed = 0;
let failed = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  if (actual === expected) passed += 1;
  else {
    failed += 1;
    console.error(
      `FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}
function ok(syarat: boolean, label: string) {
  if (syarat) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${label}`);
  }
}

// ===== Tanggal WIB =====
const awalOktober = Date.UTC(2026, 9, 1) - OFFSET_WIB_MS;
eq(tanggalKeMsWIB("2026-10-01"), awalOktober, "awal hari WIB 1 Oktober");
eq(
  tanggalKeMsWIB("2026-10-01", true),
  awalOktober + 86_399_999,
  "akhir hari WIB 1 Oktober",
);
eq(tanggalKeMsWIB("2026-02-31"), null, "31 Februari ditolak, bukan digeser");
eq(tanggalKeMsWIB("01-10-2026"), null, "format selain YYYY-MM-DD ditolak");
eq(tanggalKeMsWIB(""), null, "tanggal kosong ditolak");
eq(msKeTanggalInput(awalOktober), "2026-10-01", "milidetik kembali ke tanggal input");
eq(msKeTanggalInput(awalOktober + 86_399_999), "2026-10-01", "akhir hari tetap tanggal yang sama");

// Tanggal selesai tetap mencakup hari terakhirnya.
const isiSah: IsiPromoPinjaman = {
  badge: "Promo Oktober",
  judul: "Tenor pilihan lebih panjang",
  deskripsi: "Ajukan pinjaman tenor 28 hari lewat formulir pengajuan.",
  mulai: tanggalKeMsWIB("2026-10-01") ?? 0,
  selesai: tanggalKeMsWIB("2026-10-31", true) ?? 0,
  penempatan: ["dashboard", "pengajuan"],
  aktif: true,
};
ok(promoBerjalan(isiSah, isiSah.mulai), "hari pertama termasuk masa berlaku");
ok(promoBerjalan(isiSah, isiSah.selesai), "hari terakhir termasuk masa berlaku");
ok(!promoBerjalan(isiSah, isiSah.selesai + 1), "sehari setelah selesai tidak berlaku");

// ===== Format periode =====
eq(
  formatPeriodePromo(isiSah.mulai, isiSah.selesai),
  "1–31 Oktober 2026",
  "periode satu bulan",
);
eq(
  formatPeriodePromo(
    tanggalKeMsWIB("2026-09-28") ?? 0,
    tanggalKeMsWIB("2026-10-05", true) ?? 0,
  ),
  "28 September – 5 Oktober 2026",
  "periode lintas bulan",
);
eq(
  formatPeriodePromo(
    tanggalKeMsWIB("2026-12-30") ?? 0,
    tanggalKeMsWIB("2027-01-02", true) ?? 0,
  ),
  "30 Desember 2026 – 2 Januari 2027",
  "periode lintas tahun",
);
eq(
  formatPeriodePromo(isiSah.mulai, tanggalKeMsWIB("2026-10-01", true) ?? 0),
  "1 Oktober 2026",
  "periode satu hari",
);

// ===== Validasi isi =====
eq(periksaIsiPromo(isiSah).length, 0, "isi lengkap lolos tanpa pesan");
eq(
  periksaIsiPromo({ ...isiSah, judul: "Ok" })[0],
  "Judul promo minimal 4 karakter.",
  "judul terlalu pendek ditolak",
);
eq(
  periksaIsiPromo({ ...isiSah, judul: "x".repeat(BATAS_PROMO.judul + 1) })[0],
  `Judul promo maksimal ${BATAS_PROMO.judul} karakter.`,
  "judul terlalu panjang ditolak",
);
eq(
  periksaIsiPromo({ ...isiSah, deskripsi: "pendek" })[0],
  "Deskripsi promo minimal 12 karakter.",
  "deskripsi terlalu pendek ditolak",
);
eq(
  periksaIsiPromo({ ...isiSah, badge: "x".repeat(BATAS_PROMO.badge + 1) })[0],
  `Label kecil maksimal ${BATAS_PROMO.badge} karakter.`,
  "label terlalu panjang ditolak",
);
eq(
  periksaIsiPromo({ ...isiSah, mulai: isiSah.selesai, selesai: isiSah.mulai })[0],
  "Tanggal selesai tidak boleh sebelum tanggal mulai.",
  "tanggal terbalik ditolak",
);
eq(
  periksaIsiPromo({ ...isiSah, penempatan: [] })[0],
  "Pilih minimal satu tempat tampil.",
  "tanpa penempatan ditolak",
);
eq(
  periksaIsiPromo({
    ...isiSah,
    penempatan: ["entah" as never],
  })[0],
  "Ada tempat tampil yang tidak dikenal.",
  "penempatan asing ditolak",
);

// ===== Status panel =====
const sebelum = isiSah.mulai - 1;
const sesudah = isiSah.selesai + 1;
eq(statusPromo({ ...isiSah, aktif: false }, isiSah.mulai), "nonaktif", "nonaktif menang");
eq(statusPromo(isiSah, sebelum), "dijadwalkan", "sebelum masa berlaku dijadwalkan");
eq(statusPromo(isiSah, isiSah.mulai), "berjalan", "hari pertama berjalan");
eq(statusPromo(isiSah, sesudah), "berakhir", "setelah masa berlaku berakhir");

// ===== Label penempatan =====
eq(PENEMPATAN_PROMO.length, 4, "empat tempat tampil");
eq(labelPenempatan("dashboard"), "Dashboard nasabah", "label dashboard");
eq(labelPenempatan("pengajuan"), "Form pengajuan", "label form pengajuan");
eq(labelPenempatan("beranda"), "Beranda publik", "label beranda");
eq(labelPenempatan("promo"), "Halaman /promo", "label halaman promo");

console.log(`promoPinjaman.test: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
