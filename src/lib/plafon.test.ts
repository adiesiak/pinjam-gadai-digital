/** Uji kebijakan plafon tunai dan kredit barang (tanpa server). */
import { LOAN_LIMITS } from "./loan";
import {
  batasDiajukan,
  clampPlafon,
  kalimatBatasPlafon,
  pesanPlafonTerlampaui,
  pesanPlafonTersediaTerlampaui,
  apakahPelunasanTepatWaktu,
  PLAFON_BATAS,
  PLAFON_DEFAULT,
  PLAFON_KENAIKAN_PER_PELUNASAN,
  PLAFON_NAIK_SETELAH_LUNAS,
  PLAFON_POKOK_MINIMUM_LUNAS,
  perilakuDariRiwayat,
  plafonDariPerilaku,
  plafonDasarDariRiwayat,
  plafonEfektif,
  plafonEfektifDariPerilaku,
  skorPerilaku,
  pokokDalamPlafon,
  ringkasPlafon,
  sumberPlafon,
  tanggalJatuhTempoPinjaman,
} from "./plafon";
import {
  KREDIT_BARANG_POKOK_MAKS,
  KREDIT_TENOR_MAKS_BULAN,
  KREDIT_TENOR_PENGAJUAN_OPTIONS,
} from "./kredit";

let passed = 0;
let failed = 0;

function eq(label: string, actual: unknown, expected: unknown): void {
  if (actual === expected) {
    passed += 1;
  } else {
    failed += 1;
    console.error(`✗ ${label}: diharapkan ${String(expected)}, dapat ${String(actual)}`);
  }
}

function ok(label: string, kondisi: boolean): void {
  eq(label, kondisi, true);
}

eq("default tunai nasabah baru = Rp500 ribu", PLAFON_DEFAULT, 500_000);
eq("trigger kenaikan = pokok minimum produk", PLAFON_POKOK_MINIMUM_LUNAS, 100_000);
eq("batas maksimum plafon otomatis = Rp1 juta", PLAFON_NAIK_SETELAH_LUNAS, 1_000_000);
eq("batas maksimum admin = Rp10 juta", PLAFON_BATAS.maks, 10_000_000);
eq("batas minimum admin = Rp100 ribu", PLAFON_BATAS.min, 100_000);
eq("clamp nol ke minimum", clampPlafon(0), PLAFON_BATAS.min);
eq("clamp di atas maksimum", clampPlafon(99_000_000), PLAFON_BATAS.maks);
eq("clamp NaN ke default", clampPlafon(Number.NaN), PLAFON_DEFAULT);
eq("clamp nilai dalam rentang", clampPlafon(5_000_000), 5_000_000);

// Plafon baru Rp500 ribu; satu pelunasan tepat waktu membukanya ke Rp1 juta.
eq("kenaikan satu tahap = Rp500 ribu", PLAFON_KENAIKAN_PER_PELUNASAN, 500_000);
eq("tanpa riwayat dibatasi Rp500 ribu", plafonEfektif(undefined, 1_000_000), 500_000);
eq("satu pelunasan membuka Rp1 juta", plafonEfektif(undefined, 500_000, 1), 1_000_000);
eq("empat pelunasan tetap di Rp1 juta", plafonEfektif(undefined, 500_000, 4), 1_000_000);
eq("plafon otomatis berhenti di Rp1 juta", plafonEfektif(undefined, 500_000, 20), 1_000_000);
eq("dasar dengan riwayat langsung Rp1 juta", plafonDasarDariRiwayat(500_000, 3), 1_000_000);
eq("jumlah negatif dianggap nol", plafonDasarDariRiwayat(500_000, -3), 500_000);
eq("override admin menang sebelum pelunasan", plafonEfektif(3_000_000, 500_000), 3_000_000);
eq("override admin tetap menang sesudah pelunasan", plafonEfektif(4_000_000, 500_000, 5), 4_000_000);
eq("reset override kembali ke progres sesuai riwayat", plafonEfektif(null, 500_000, 2), 1_000_000);
eq("reset override tanpa riwayat kembali ke Rp500 ribu", plafonEfektif(null, 2_000_000), 500_000);

const waktuDanaPada = 1_700_000_000_000;
const jatuhTempo = waktuDanaPada + 30 * 86_400_000;
const lunasTepatWaktu = {
  status: "lunas",
  pokokPinjaman: 1_000_000,
  didanaiPada: waktuDanaPada,
  lunasPada: jatuhTempo,
  tenorHari: 30,
};
eq("tanggal jatuh tempo 30 hari dihitung dari pendanaan", tanggalJatuhTempoPinjaman(lunasTepatWaktu), jatuhTempo);
ok("lunas persis saat jatuh tempo memenuhi syarat", apakahPelunasanTepatWaktu(lunasTepatWaktu));
ok("lunas satu milidetik terlambat tidak memenuhi syarat", !apakahPelunasanTepatWaktu({ ...lunasTepatWaktu, lunasPada: jatuhTempo + 1 }));
ok("pelunasan pokok di bawah minimum tidak memenuhi syarat", !apakahPelunasanTepatWaktu({ ...lunasTepatWaktu, pokokPinjaman: 99_999 }));
ok("pelunasan Rp500 ribu memenuhi syarat kenaikan", apakahPelunasanTepatWaktu({ ...lunasTepatWaktu, pokokPinjaman: 500_000 }));
ok("status selain lunas tidak memenuhi syarat", !apakahPelunasanTepatWaktu({ ...lunasTepatWaktu, status: "didanai" }));
ok("data tanpa waktu pendanaan tidak memenuhi syarat", !apakahPelunasanTepatWaktu({ ...lunasTepatWaktu, didanaiPada: undefined }));
ok("tenor bulanan dihitung sebagai 30 hari per bulan", apakahPelunasanTepatWaktu({ ...lunasTepatWaktu, tenorHari: undefined, tenorBulan: 3, lunasPada: waktuDanaPada + 90 * 86_400_000 }));
const jatuhTempoDiperpanjang = jatuhTempo + 14 * 86_400_000;
eq(
  "jatuh tempo periode berjalan mengalahkan tenor awal",
  tanggalJatuhTempoPinjaman({ ...lunasTepatWaktu, nextDueDate: jatuhTempoDiperpanjang }),
  jatuhTempoDiperpanjang,
);
ok(
  "pelunasan dalam masa perpanjangan tetap tepat waktu",
  apakahPelunasanTepatWaktu({
    ...lunasTepatWaktu,
    nextDueDate: jatuhTempoDiperpanjang,
    lunasPada: jatuhTempo + 10 * 86_400_000,
  }),
);

ok("pokok tunai dalam plafon diterima", pokokDalamPlafon(900_000, 1_000_000));
ok("pokok tunai tepat plafon diterima", pokokDalamPlafon(1_000_000, 1_000_000));
ok("pokok tunai di atas plafon ditolak", !pokokDalamPlafon(1_000_001, 1_000_000));
ok("pokok tunai di bawah minimum ditolak", !pokokDalamPlafon(50_000, 1_000_000));
ok("default adalah plafon nasabah baru, bukan batas produk", PLAFON_DEFAULT === 500_000 && LOAN_LIMITS.maxPokok === 1_000_000);
ok("pesan menyebut plafon", pesanPlafonTerlampaui(2_000_000).includes("2.000.000"));

// ===== Plafon MASTER: maksimal / terpakai / tersedia =====
// Nasabah plafon Rp1 juta tanpa utang: seluruh plafon tersedia.
const rKosong = ringkasPlafon(1_000_000, []);
eq("plafon kosong → maksimal", rKosong.maksimal, 1_000_000);
eq("plafon kosong → terpakai nol", rKosong.terpakai, 0);
eq("plafon kosong → tersedia penuh", rKosong.tersedia, 1_000_000);
eq("plafon kosong → tidak ada pinjaman aktif", rKosong.jumlahAktif, 0);

// Contoh dari ketentuan produk: plafon 1jt, pinjaman #001 500rb aktif.
const rAktif = ringkasPlafon(1_000_000, [{ status: "didanai", pokokPinjaman: 500_000 }]);
eq("pinjaman aktif mengurangi tersedia", rAktif.terpakai, 500_000);
eq("tersedia = maksimal − terpakai", rAktif.tersedia, 500_000);
eq("pinjaman aktif dihitung", rAktif.jumlahAktif, 1);

// Pengajuan yang belum cair dan pinjaman lunas TIDAK menahan plafon.
const rCampuran = ringkasPlafon(1_000_000, [
  { status: "didanai", pokokPinjaman: 400_000 },
  { status: "diajukan", pokokPinjaman: 300_000 },
  { status: "ditinjau", pokokPinjaman: 300_000 },
  { status: "ditolak", pokokPinjaman: 300_000 },
  { status: "lunas", pokokPinjaman: 300_000 },
]);
eq("hanya pinjaman didanai yang menahan", rCampuran.terpakai, 400_000);
eq("lunas melepas kembali plafon", rCampuran.tersedia, 600_000);

// Terpakai tidak pernah membuat tersedia negatif.
const rLebih = ringkasPlafon(1_000_000, [
  { status: "didanai", pokokPinjaman: 700_000 },
  { status: "didanai", pokokPinjaman: 700_000 },
]);
eq("tersedia dijepit di nol bila utang melebihi plafon", rLebih.tersedia, 0);
eq("dua pinjaman aktif dihitung", rLebih.jumlahAktif, 2);

// Plafon maksimal tetap dijepit ke rentang sah.
eq("ringkas menjepit maksimal", ringkasPlafon(99_000_000, []).maksimal, PLAFON_BATAS.maks);

const pesanTersedia = pesanPlafonTersediaTerlampaui(rAktif);
ok("pesan tersedia menyebut plafon maksimal", pesanTersedia.includes("1.000.000"));
ok("pesan tersedia menyebut nominal terpakai", pesanTersedia.includes("500.000"));
ok("pesan tersedia menyebut sisa tersedia", pesanTersedia.includes("500.000"));

// ===== Batas yang boleh DITAWARKAN: sisa tersedia dipotong batas produk =====
// Angka ini yang dipakai penggeser formulir: tidak pernah di atas sisa, dan
// tidak pernah di atas batas produk (mis. Rp1 juta harian).
eq("batas diajukan = tersedia bila di bawah batas produk", batasDiajukan(1_000_000, 10_000_000), 1_000_000);
eq("batas diajukan dipotong batas produk", batasDiajukan(5_000_000, 1_000_000), 1_000_000);
eq("batas diajukan nol saat sisa habis", batasDiajukan(0, 1_000_000), 0);
eq("batas diajukan mengabaikan angka negatif", batasDiajukan(-500_000, 1_000_000), 0);
eq("batas diajukan tidak pernah melebihi sisa", batasDiajukan(400_000, 10_000_000), 400_000);

// ===== Kalimat batas: satu angka tanpa utang, tiga angka saat sisa berkurang =====
eq(
  "tanpa utang hanya menyebut satu angka",
  kalimatBatasPlafon(rKosong),
  "Batas pinjaman Anda Rp 1.000.000.",
);
ok(
  "dengan utang menyebut plafon maksimal",
  kalimatBatasPlafon(rAktif).includes("Batas pinjaman Anda Rp 1.000.000"),
);
ok(
  "dengan utang menyebut nominal terpakai",
  kalimatBatasPlafon(rAktif).includes("Rp 500.000 sedang dipakai pinjaman atau akad berjalan"),
);
ok(
  "dengan utang menyebut sisa yang bisa diajukan",
  kalimatBatasPlafon(rAktif).includes("yang bisa diajukan sekarang Rp 500.000"),
);
ok(
  "sisa habis disebut apa adanya sebagai Rp 0",
  kalimatBatasPlafon(rLebih).includes("yang bisa diajukan sekarang Rp 0"),
);

// Kebijakan penerbitan kredit barang tak lagi diwarisi dari plafon tunai.
eq("batas pokok kredit barang tetap Rp10 juta", KREDIT_BARANG_POKOK_MAKS, 10_000_000);
eq("tenor maksimal penerbitan kredit barang 6 bulan", KREDIT_TENOR_MAKS_BULAN, 6);
eq("tenor baru hanya 1/3/6 bulan", KREDIT_TENOR_PENGAJUAN_OPTIONS.join(","), "1,3,6");

// ===== Perilaku bayar → plafon otomatis =====
const HARI_MS = 86_400_000;
const sekarangUji = 1_760_000_000_000;
const riwayat = [
  { status: "lunas", pokokPinjaman: 1_000_000, didanaiPada: sekarangUji - 60 * HARI_MS, lunasPada: sekarangUji - 35 * HARI_MS, tenorHari: 30 },
  { status: "lunas", pokokPinjaman: 1_000_000, didanaiPada: sekarangUji - 90 * HARI_MS, lunasPada: sekarangUji - 65 * HARI_MS, tenorHari: 30 },
  { status: "didanai", pokokPinjaman: 1_000_000, didanaiPada: sekarangUji - 10 * HARI_MS, tenorHari: 30 },
];
const perilaku = perilakuDariRiwayat(riwayat, sekarangUji);
eq("dua pelunasan tepat waktu", perilaku.tepatWaktu, 2);
eq("satu pinjaman berjalan", perilaku.berjalan, 1);
eq("tidak ada tunggakan", perilaku.menunggak, 0);
eq("skor perilaku catatan bersih", skorPerilaku(perilaku), 85);
eq(
  "dua tepat waktu membuka Rp1 juta",
  plafonDariPerilaku(PLAFON_DEFAULT, perilaku),
  PLAFON_NAIK_SETELAH_LUNAS,
);
const perilakuTiga = { tepatWaktu: 3, terlambat: 0, menunggak: 0, berjalan: 0 };
eq(
  "tiga tepat waktu tetap Rp1 juta",
  plafonDariPerilaku(PLAFON_DEFAULT, perilakuTiga),
  PLAFON_NAIK_SETELAH_LUNAS,
);
const perilakuTelat = { tepatWaktu: 3, terlambat: 1, menunggak: 0, berjalan: 0 };
eq(
  "satu keterlambatan tidak menutup plafon yang sudah terbuka",
  plafonDariPerilaku(PLAFON_DEFAULT, perilakuTelat),
  PLAFON_NAIK_SETELAH_LUNAS,
);
const perilakuNunggak = { tepatWaktu: 5, terlambat: 0, menunggak: 1, berjalan: 1 };
eq(
  "tunggakan menahan plafon di default",
  plafonDariPerilaku(PLAFON_DEFAULT, perilakuNunggak),
  PLAFON_DEFAULT,
);
eq(
  "plafon perilaku dibatasi maksimum",
  plafonDariPerilaku(PLAFON_DEFAULT, { tepatWaktu: 20, terlambat: 0, menunggak: 0, berjalan: 0 }),
  PLAFON_NAIK_SETELAH_LUNAS,
);
eq(
  "override admin menang atas perilaku",
  plafonEfektifDariPerilaku(7_500_000, PLAFON_DEFAULT, perilakuTiga),
  7_500_000,
);

// Sumber angka yang ditampilkan panel admin: override > progresif > global.
eq("angka khusus dibaca sebagai override", sumberPlafon(2_000_000, 2_000_000, 500_000), "override");
eq("tanpa override di Rp500 ribu = default global", sumberPlafon(null, 500_000, 500_000), "global");
eq("tanpa override di Rp1 juta = progresif", sumberPlafon(null, 1_000_000, 500_000), "progresif");
eq("undefined juga berarti tanpa override", sumberPlafon(undefined, 500_000, 500_000), "global");

console.log(`plafon tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
