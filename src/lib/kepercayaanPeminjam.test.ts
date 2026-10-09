/** Run: bun src/lib/kepercayaanPeminjam.test.ts */
import {
  BOBOT_KEPERCAYAAN,
  SKOR_KUAT,
  SKOR_PERLU_PERHATIAN,
  TEPAT_WAKTU_MINIMUM_KUAT,
  alasanKepercayaan,
  hitungKepercayaan,
  jatuhTempoPinjaman,
  riwayatDariPinjaman,
  ringkasKepercayaan,
  skorKepercayaan,
  tingkatKepercayaan,
  type PinjamanRiwayat,
  type RiwayatPeminjam,
} from "./kepercayaanPeminjam";

let passed = 0;
let failed = 0;
function eq(actual: unknown, expected: unknown, label: string): void {
  if (actual === expected) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
function ok(syarat: boolean, label: string): void {
  eq(syarat, true, label);
}

const HARI = 86_400_000;
const DIDANAI = Date.UTC(2026, 1, 1); // 1 Feb 2026
const NOW = DIDANAI + 60 * HARI;

const dasar = { dataDiriLengkap: false, punyaKodePeminjam: false, sekarang: NOW };

function riwayat(daftar: PinjamanRiwayat[], opsi: Partial<typeof dasar> = {}) {
  return riwayatDariPinjaman(daftar, { ...dasar, ...opsi });
}

const kosong = { sekarang: NOW, dataDiriLengkap: false, punyaKodePeminjam: false };

// ===== 1. Pengelompokan status =====
eq(riwayat([]).jumlahPinjaman, 0, "tanpa pinjaman → riwayat kosong");
eq(riwayat([]).jumlahLunas, 0, "tanpa pinjaman → tanpa lunas");

const ditinjau = riwayat([{ status: "diajukan" }]);
eq(ditinjau.jumlahPinjaman, 1, "pengajuan tercatat dihitung");
eq(ditinjau.jumlahLunas, 0, "ditinjau bukan lunas");
eq(ditinjau.jumlahBerjalan, 0, "ditinjau bukan berjalan");
for (const status of ["diajukan", "sedang_direview", "disetujui", "ditinjau"]) {
  eq(riwayat([{ status }]).jumlahDitolak, 0, `status warisan "${status}" bukan ditolak`);
}
eq(riwayat([{ status: "entah_apa" }]).jumlahLunas, 0, "status tak dikenal tidak dihitung lunas");

const tepat = riwayat([{ status: "lunas", didanaiPada: DIDANAI, tenorHari: 30, lunasPada: DIDANAI + 30 * HARI }]);
eq(tepat.jumlahLunas, 1, "lunas dihitung satu");
eq(tepat.jumlahTepatWaktu, 1, "lunas persis saat jatuh tempo = tepat waktu");
eq(tepat.jumlahTerlambat, 0, "tidak dihitung terlambat");

const telat = riwayat([{ status: "lunas", didanaiPada: DIDANAI, tenorHari: 30, lunasPada: DIDANAI + 31 * HARI }]);
eq(telat.jumlahTepatWaktu, 0, "lewat satu hari bukan tepat waktu");
eq(telat.jumlahTerlambat, 1, "dihitung terlambat");

const tanpaTanggal = riwayat([{ status: "lunas", lunasPada: DIDANAI }]);
eq(tanpaTanggal.jumlahLunas, 1, "lunas tanpa data pendanaan tetap dihitung lunas");
eq(tanpaTanggal.jumlahTepatWaktu, 0, "tanpa bukti tanggal, tidak diklaim tepat waktu");
eq(tanpaTanggal.jumlahTerlambat, 0, "tanpa bukti tanggal, tidak diklaim terlambat");
eq(riwayat([{ status: "lunas", didanaiPada: DIDANAI, tenorHari: 30, lunasPada: null }]).jumlahTepatWaktu, 0, "lunas tanpa waktu pelunasan tidak diklaim tepat waktu");

const berjalan = riwayat([{ status: "didanai", didanaiPada: DIDANAI, tenorHari: 30 }], {
  sekarang: DIDANAI + 5 * HARI,
});
eq(berjalan.jumlahBerjalan, 1, "pinjaman berjalan dihitung");
eq(berjalan.jumlahMenunggak, 0, "belum lewat jatuh tempo → tidak menunggak");

const menunggak = riwayat(
  [{ status: "didanai", didanaiPada: DIDANAI, tenorHari: 30 }],
  { sekarang: DIDANAI + 40 * HARI },
);
eq(menunggak.jumlahMenunggak, 1, "berjalan & lewat jatuh tempo → menunggak");

eq(riwayat([{ status: "ditolak" }]).jumlahDitolak, 1, "pengajuan ditolak dihitung");

const campuran = riwayat([
  { status: "lunas", didanaiPada: DIDANAI, tenorHari: 30, lunasPada: DIDANAI + 20 * HARI },
  { status: "lunas", didanaiPada: DIDANAI, tenorHari: 30, lunasPada: DIDANAI + 35 * HARI },
  { status: "didanai", didanaiPada: DIDANAI, tenorHari: 30 },
  { status: "ditolak" },
  { status: "sedang_direview" },
]);
eq(campuran.jumlahPinjaman, 5, "lima pinjaman tercatat");
eq(campuran.jumlahLunas, 2, "dua lunas");
eq(campuran.jumlahTepatWaktu, 1, "satu tepat waktu");
eq(campuran.jumlahTerlambat, 1, "satu terlambat");
eq(campuran.jumlahBerjalan, 1, "satu berjalan");
eq(campuran.jumlahDitolak, 1, "satu ditolak");

// ===== 2. jatuhTempoPinjaman =====
eq(jatuhTempoPinjaman({ status: "didanai", didanaiPada: DIDANAI, tenorHari: 30 }), DIDANAI + 30 * HARI, "tenor harian");
eq(jatuhTempoPinjaman({ status: "didanai", didanaiPada: DIDANAI, tenorBulan: 3 }), DIDANAI + 90 * HARI, "tenor bulanan 30 hari/bulan");
eq(jatuhTempoPinjaman({ status: "didanai" }), null, "tanpa pendanaan → null");
eq(jatuhTempoPinjaman({ status: "didanai", didanaiPada: DIDANAI, tenorHari: 0 }), null, "tenor nol → null");

// ===== 3. Skor =====
const dasarSkor = BOBOT_KEPERCAYAAN.dasar;
eq(skorKepercayaan(riwayat([])), dasarSkor, "tanpa riwayat & tanpa data diri = skor dasar");
eq(
  skorKepercayaan(riwayat([], { dataDiriLengkap: true, punyaKodePeminjam: true })),
  dasarSkor + BOBOT_KEPERCAYAAN.dataDiri + BOBOT_KEPERCAYAAN.kodePeminjam,
  "data diri & kode menambah skor",
);
const tigaTepatWaktu = riwayat(
  [1, 2, 3].map(() => ({ status: "lunas", didanaiPada: DIDANAI, tenorHari: 30, lunasPada: DIDANAI + 10 * HARI })),
);
eq(skorKepercayaan(tigaTepatWaktu), dasarSkor + BOBOT_KEPERCAYAAN.maksTepatWaktu, "tiga pelunasan tepat waktu menaikkan skor sampai batas bonus");
eq(
  skorKepercayaan(
    riwayat(
      [1, 2, 3, 4, 5].map(() => ({ status: "lunas", didanaiPada: DIDANAI, tenorHari: 30, lunasPada: DIDANAI + 10 * HARI })),
    ),
  ),
  Math.min(100, dasarSkor + BOBOT_KEPERCAYAAN.maksTepatWaktu),
  "bonus tepat waktu dibatasi maksimum",
);
ok(
  skorKepercayaan(riwayat([{ status: "lunas", didanaiPada: DIDANAI, tenorHari: 30, lunasPada: DIDANAI + 60 * HARI }])) < dasarSkor,
  "satu keterlambatan menurunkan skor di bawah dasar",
);
const satuTepatWaktu = riwayat([{ status: "lunas", didanaiPada: DIDANAI, tenorHari: 30, lunasPada: DIDANAI + 10 * HARI }]);
ok(skorKepercayaan(menunggak) < skorKepercayaan(berjalan), "pinjaman menunggak menekan skor dibanding tanpa tunggakan");
eq(
  skorKepercayaan(satuTepatWaktu) - skorKepercayaan({ ...satuTepatWaktu, jumlahMenunggak: 1 }),
  -BOBOT_KEPERCAYAAN.menunggak,
  "satu tunggakan memotong skor sebesar bobotnya",
);
eq(skorKepercayaan({ ...riwayat([]), jumlahDitolak: 9 }), dasarSkor + BOBOT_KEPERCAYAAN.maksDitolak, "penalti ditolak dibatasi maksimum");
ok(skorKepercayaan({ ...riwayat([]), jumlahTerlambat: 99 }) >= 0, "skor tidak pernah negatif");
eq(
  skorKepercayaan({ ...riwayat([]), jumlahTerlambat: 99, jumlahDitolak: 99, jumlahMenunggak: 9 }),
  0,
  "penalti berlapis dijepit ke 0, bukan negatif",
);

// ===== 4. Tingkat & label =====
const baru = hitungKepercayaan(riwayat([]));
eq(baru.tingkat, "baru", "belum ada riwayat → tingkat baru");
eq(baru.label, "Nasabah baru", "label tingkat baru");

const baik = hitungKepercayaan(tepat);
eq(baik.tingkat, "berkembang", "satu pelunasan tepat waktu → riwayat baik");
eq(baik.label, "Riwayat baik", "label riwayat baik");

const kuat = hitungKepercayaan(
  riwayat(
    [1, 2, 3].map(() => ({ status: "lunas", didanaiPada: DIDANAI, tenorHari: 30, lunasPada: DIDANAI + 15 * HARI })),
    { dataDiriLengkap: true, punyaKodePeminjam: true },
  ),
);
eq(kuat.tingkat, "kuat", "tiga pelunasan tepat waktu + data lengkap → terpercaya");
eq(kuat.label, "Terpercaya", "label tingkat kuat");
ok(kuat.skor >= SKOR_KUAT, "tingkat kuat hanya pada skor tinggi");

const perhatian = hitungKepercayaan(menunggak);
eq(perhatian.tingkat, "perlu_perhatian", "menunggak → perlu perhatian");
eq(perhatian.label, "Perlu perhatian", "label perlu perhatian");
eq(
  tingkatKepercayaan(riwayat([]), SKOR_PERLU_PERHATIAN - 1),
  "perlu_perhatian",
  "skor di bawah ambang → perlu perhatian",
);
eq(
  tingkatKepercayaan({ ...tepat, jumlahTepatWaktu: TEPAT_WAKTU_MINIMUM_KUAT - 1 }, 100),
  "berkembang",
  "skor tinggi tanpa cukup riwayat tetap \"riwayat baik\"",
);

// ===== 5. Alasan & ringkasan =====
const alasanKuat = alasanKepercayaan(riwayat([], { dataDiriLengkap: true, punyaKodePeminjam: true }));
ok(alasanKuat.includes("Data diri tersimpan lengkap"), "alasan menyebut data diri lengkap");
ok(alasanKuat.includes("Belum ada pinjaman yang berjalan atau lunas"), "alasan menyebut belum ada riwayat");
ok(!alasanKuat.includes("Kode peminjam belum terbit"), "kode yang sudah terbit tidak disebut belum");

const alasanMancanegara = alasanKepercayaan(campuran);
ok(alasanMancanegara.some((a) => a.includes("lunas tepat waktu")), "alasan menyebut jumlah tepat waktu");
ok(alasanMancanegara.some((a) => a.includes("melewati jatuh tempo")), "alasan menyebut keterlambatan");
ok(alasanMancanegara.some((a) => a.includes("pengajuan ditolak")), "alasan menyebut penolakan");
ok(alasanKepercayaan(menunggak).some((a) => a.includes("lewat jatuh tempo")), "alasan menyebut tunggakan berjalan");
for (const a of [...alasanMancanegara, ...alasanKepercayaan(berjalan)]) {
  ok(a.trim() === a && a.length > 0, `alasan rapi: "${a}"`);
  ok(!/\bundefined\b|\bNaN\b/.test(a), `alasan tanpa nilai rusak: "${a}"`);
}

eq(ringkasKepercayaan(ditinjau), "0 tepat waktu · 0 terlambat", "ringkasan tanpa pinjaman berjalan");
eq(ringkasKepercayaan(campuran), "1 tepat waktu · 1 terlambat · 1 berjalan", "ringkasan lengkap");
eq(ringkasKepercayaan(riwayat([])), "belum ada riwayat pinjaman", "ringkasan peminjam tanpa riwayat");

// ===== 6. Bentuk keluaran =====
const keluaran = hitungKepercayaan(campuran);
ok(Number.isInteger(keluaran.skor) && keluaran.skor >= 0 && keluaran.skor <= 100, "skor bilangan bulat 0–100");
ok(keluaran.label.length > 0 && keluaran.ringkas.length > 0, "label & ringkasan terisi");
ok(!JSON.stringify(keluaran).includes("undefined"), "keluaran tanpa undefined");
const tingkatSah = ["baru", "berkembang", "kuat", "perlu_perhatian"];
ok(tingkatSah.includes(keluaran.tingkat), "tingkat termasuk daftar yang dikenal");

// Riwayat tidak pernah mengubah objek masukan.
const daftar: PinjamanRiwayat[] = [{ status: "didanai", didanaiPada: DIDANAI, tenorHari: 30 }];
const salinan = JSON.stringify(daftar);
riwayatDariPinjaman(daftar, kosong);
eq(JSON.stringify(daftar), salinan, "fungsi tidak mengubah data masukan");

// Riwayat kosong → tipe lengkap (tidak ada field hilang).
const kunciRiwayat: Array<keyof RiwayatPeminjam> = [
  "jumlahPinjaman",
  "jumlahLunas",
  "jumlahTepatWaktu",
  "jumlahTerlambat",
  "jumlahBerjalan",
  "jumlahMenunggak",
  "jumlahDitolak",
  "dataDiriLengkap",
  "punyaKodePeminjam",
];
for (const kunci of kunciRiwayat) {
  ok(riwayat([])[kunci] !== undefined, `riwayat punya field ${kunci}`);
}

console.log(`\nkepercayaanPeminjam: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
