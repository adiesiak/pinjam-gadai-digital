/**
 * Uji aturan tampilan notifikasi PINDAI (murni, tanpa server).
 * Run: bun src/lib/notifikasi.test.ts
 *
 * Yang dijaga di sini adalah hal-hal yang mudah salah dan mahal akibatnya:
 * urutan menurut waktu server, jumlah belum dibaca, deteksi notifikasi yang
 * BENAR-BENAR baru (dasar animasi dan pengumuman), serta penerimaan tautan
 * hanya ke tab dashboard yang benar-benar ada.
 */
import {
  hitungBelumDibaca,
  JENIS_NOTIFIKASI,
  kunciBaru,
  pengumumanBaru,
  tabDariParams,
  tabDariTautan,
  urutkanNotifikasi,
  waktuRelatif,
  type NotifikasiItem,
} from "./notifikasi";

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

const SEKARANG = Date.UTC(2026, 9, 9, 12, 0, 0); // 9 Okt 2026 12:00 UTC

// ===== waktu relatif =====
const menit = 60_000;
const jam = 60 * menit;
const hari = 24 * jam;
eq(waktuRelatif(SEKARANG - 10_000, SEKARANG), "baru saja", "10 detik lalu: baru saja");
eq(waktuRelatif(SEKARANG - 5 * menit, SEKARANG), "5 menit lalu", "5 menit lalu");
eq(waktuRelatif(SEKARANG - 3 * jam, SEKARANG), "3 jam lalu", "3 jam lalu");
eq(waktuRelatif(SEKARANG - 2 * hari, SEKARANG), "2 hari lalu", "2 hari lalu");
eq(
  waktuRelatif(SEKARANG + 5 * menit, SEKARANG),
  "baru saja",
  "waktu di masa depan (jam perangkat berbeda) tidak menghasilkan angka negatif",
);
ok(
  waktuRelatif(SEKARANG - 30 * hari, SEKARANG).includes("2026"),
  "lebih dari sepekan ditulis sebagai tanggal",
);

// ===== urutan & cacah =====
const item: NotifikasiItem[] = [
  { kunci: "a", jenis: "info", judul: "A", ringkasan: "", waktu: 300, tautan: "/dashboard", dibaca: true },
  { kunci: "b", jenis: "error", judul: "B", ringkasan: "", waktu: 900, tautan: "/dashboard", dibaca: false },
  { kunci: "c", jenis: "sukses", judul: "C", ringkasan: "", waktu: 600, tautan: "/dashboard", dibaca: false },
];
eq(urutkanNotifikasi(item).map((i) => i.kunci).join(","), "b,c,a", "urut waktu server terbaru dulu");
eq(hitungBelumDibaca(item), 2, "dua notifikasi belum dibaca");
eq(hitungBelumDibaca([]), 0, "daftar kosong tidak punya yang belum dibaca");

// ===== notifikasi baru =====
const sebelumnya = new Set(["a", "c"]);
const baru = kunciBaru(sebelumnya, item);
eq(baru.size, 1, "hanya satu kunci yang benar-benar baru");
ok(baru.has("b"), "kunci baru adalah yang belum pernah terlihat");
eq(kunciBaru(new Set(item.map((i) => i.kunci)), item).size, 0, "penyegaran biasa bukan notifikasi baru");
eq(pengumumanBaru(0, 3), null, "tanpa yang baru tidak ada pengumuman");
eq(pengumumanBaru(1, 3), "1 notifikasi baru. Total 3 belum dibaca.", "pengumuman satu notifikasi");
eq(pengumumanBaru(2, 4), "2 notifikasi baru. Total 4 belum dibaca.", "pengumuman beberapa notifikasi");

// ===== jenis: label + nada, tidak pernah warna saja =====
for (const jenis of ["info", "sukses", "peringatan", "error"] as const) {
  ok(JENIS_NOTIFIKASI[jenis].label.length > 0, `jenis ${jenis} punya label teks`);
  ok(JENIS_NOTIFIKASI[jenis].kelas.includes("border"), `jenis ${jenis} punya nada tepi`);
}
ok(
  new Set(Object.values(JENIS_NOTIFIKASI).map((m) => m.kelas)).size === 4,
  "empat jenis tidak pernah berbagi nada yang sama",
);

// ===== tautan hanya ke halaman dashboard yang ada =====
eq(tabDariTautan("/dashboard?tab=ringkasan"), "ringkasan", "halaman ringkasan diterima");
eq(tabDariTautan("/dashboard?tab=pinjaman"), "pinjaman", "halaman catatan pinjaman diterima");
// Nama tab lama masih tersimpan di tautan notifikasi di database, jadi dipetakan
// ke halaman terdekatnya alih-alih ditolak (dan mendarat di halaman default).
eq(tabDariTautan("/dashboard?tab=jadwal"), "ringkasan", "tab lama jadwal diarahkan ke ringkasan");
eq(tabDariTautan("/dashboard?tab=riwayat"), "pinjaman", "tab lama riwayat diarahkan ke catatan pinjaman");
eq(tabDariTautan("/dashboard?tab=bantuan"), "ringkasan", "tab lama bantuan diarahkan ke ringkasan");
eq(tabDariTautan("/dashboard?tab=tidak-ada"), null, "tab tak dikenal ditolak");
eq(tabDariTautan("/dashboard"), null, "tautan tanpa parameter tidak dipaksa");
eq(tabDariTautan("https://contoh.com/dashboard?tab=jadwal"), "ringkasan", "tautan bertanya tetap dibaca");
eq(tabDariParams(new URLSearchParams("?tab=gadai")), "pinjaman", "parameter URL langsung dibaca");
eq(tabDariParams(new URLSearchParams("")), null, "parameter kosong tidak menghasilkan tab");

console.log(`notifikasi.test: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
