/** Run: bun src/lib/prioritasPenagihan.test.ts */
import { hitungPrioritasPenagihan, type DataPrioritasPenagihan } from "./prioritasPenagihan";

let passed = 0;
let failed = 0;
function ok(syarat: boolean, label: string): void {
  if (syarat) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${label}`);
  }
}
const HARI = 86_400_000;
const SEKARANG = Date.UTC(2026, 9, 19, 3, 0);
const DASAR: DataPrioritasPenagihan = {
  hariTerlambat: 45,
  tahapTingkat: 3,
  jumlahKewajiban: 3_500_000,
  janjiAktif: null,
  pengaduanTerbuka: 0,
  somasi: null,
  jumlahTindakan: 0,
  tindakanTerakhirPada: null,
  statusKasus: "baru",
  statusPembayaran: "belum_bayar",
  sekarang: SEKARANG,
};

const berat = hitungPrioritasPenagihan(DASAR);
ok(berat.skor >= 60, "kasus berat tanpa tindakan mendapat skor tinggi");
ok(berat.disarankanHariIni, "kasus berat masuk antrean hari ini");
ok(berat.alasan.some((a) => a.includes("Terlambat 45 hari")), "alasan keterlambatan");
ok(berat.alasan.some((a) => a.includes("Belum ada tindakan")), "alasan belum ditindak");

const janjiDepan = hitungPrioritasPenagihan({
  ...DASAR,
  janjiAktif: { tanggalJanji: SEKARANG + 3 * HARI, nominal: 1_000_000 },
});
ok(janjiDepan.skor < berat.skor, "janji aktif menurunkan prioritas");
ok(!janjiDepan.disarankanHariIni, "janji aktif menahan antrean hari ini");
ok(janjiDepan.alasan.some((a) => a.includes("masih berlaku")), "alasan janji aktif");

const janjiLewat = hitungPrioritasPenagihan({
  ...DASAR,
  janjiAktif: { tanggalJanji: SEKARANG - 4 * HARI, nominal: 1_000_000 },
});
ok(janjiLewat.skor >= berat.skor, "janji lewat menaikkan prioritas");
ok(janjiLewat.alasan.some((a) => a.includes("lewat 4 hari")), "alasan janji lewat");

const denganPengaduan = hitungPrioritasPenagihan({
  ...DASAR,
  janjiAktif: { tanggalJanji: SEKARANG + 3 * HARI, nominal: 1_000_000 },
  pengaduanTerbuka: 2,
});
ok(denganPengaduan.skor > janjiDepan.skor, "pengaduan menaikkan prioritas");
ok(denganPengaduan.disarankanHariIni, "pengaduan tetap masuk antrean meski ada janji");
ok(
  denganPengaduan.alasan.some((a) => a.includes("2 pengaduan")),
  "alasan pengaduan terbuka",
);

const disomasi = hitungPrioritasPenagihan({
  ...DASAR,
  somasi: { diserahkanPada: SEKARANG - 2 * HARI },
});
ok(disomasi.skor > berat.skor, "somasi diserahkan menaikkan prioritas");
ok(disomasi.alasan.some((a) => a.includes("sudah diserahkan")), "alasan somasi");

const tertutup = hitungPrioritasPenagihan({
  ...DASAR,
  jumlahTindakan: 3,
  tindakanTerakhirPada: SEKARANG - HARI,
  statusKasus: "selesai",
});
ok(tertutup.skor <= 20, "kasus selesai dibatasi rendah");
ok(!tertutup.disarankanHariIni, "kasus selesai tidak masuk antrean");
ok(tertutup.alasan[0]?.includes("selesai/ditutup") === true, "alasan kasus selesai");

const belumTerlambat = hitungPrioritasPenagihan({
  ...DASAR,
  hariTerlambat: 0,
  tahapTingkat: 0,
});
ok(!belumTerlambat.disarankanHariIni, "pinjaman lancar tidak masuk antrean");

const nilaiRusak = hitungPrioritasPenagihan({
  ...DASAR,
  hariTerlambat: Number.NaN,
  tahapTingkat: -4,
  jumlahKewajiban: Number.NaN,
});
ok(nilaiRusak.skor >= 0 && nilaiRusak.skor <= 100, "nilai rusak tetap dalam rentang");

// Satu tindakan baru menurunkan tambahan "tidak ada tindakan".
const baruDitindak = hitungPrioritasPenagihan({
  ...DASAR,
  jumlahTindakan: 1,
  tindakanTerakhirPada: SEKARANG - HARI,
});
ok(baruDitindak.skor < berat.skor, "tindakan baru menurunkan skor");
ok(!baruDitindak.alasan.some((a) => a.includes("Tidak ada tindakan")), "tanpa alasan jeda");

console.log(`prioritasPenagihan: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
