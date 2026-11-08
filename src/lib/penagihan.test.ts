/** Run: bun src/lib/penagihan.test.ts */
import {
  AMBANG_TUNGGAKAN_BATAS,
  AMBANG_TUNGGAKAN_DEFAULT,
  BOBOT_PRIORITAS_PENGADUAN,
  JAM_KONTAK_DEFAULT,
  PANJANG_MAKS_PESAN,
  PANJANG_MAKS_PESAN_PENGADUAN,
  PRIORITAS_PENGADUAN,
  STATUS_KASUS_TERTUTUP,
  bolehHubungiPihak,
  bolehKontakSekarang,
  dalamJamKontak,
  eskalasiBerikutnya,
  eskalasiDisarankan,
  jamWIB,
  klasifikasiTunggakan,
  maskNomorTelepon,
  maskRekening,
  nomorTiketPengaduan,
  periksaPesanPenagihan,
  pesanPengingatNetral,
  prioritasBawaan,
  prioritasEfektif,
  ringkasLaporanPenagihan,
  validasiAmbang,
  validasiJanjiBayar,
  validasiJamKontak,
  validasiPembayaran,
  validasiPesanPengaduan,
  validasiPrioritasPengaduan,
  validasiPengaduan,
  validasiPenyelesaian,
  validasiTransisiKasus,
  validasiTransisiPengaduan,
  type KasusUntukLaporan,
} from "./penagihan";

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
function ok(cond: boolean, label: string) {
  if (cond) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${label}`);
  }
}
function eqJson(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a === b) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${label}: expected ${b}, got ${a}`);
  }
}

/** Kategori temuan satu pesan (kosong bila pesan diterima). */
function kategori(teks: string): string[] {
  const hasil = periksaPesanPenagihan(teks);
  return hasil.ok ? [] : [...new Set(hasil.temuan.map((t) => t.kategori))];
}
/** Alasan penolakan satu pesan ("" bila diterima). */
function alasanPesan(teks: string): string {
  const hasil = periksaPesanPenagihan(teks);
  return hasil.ok ? "" : hasil.alasan;
}
/** Alasan penolakan satu hasil validasi ("" bila diterima). */
function alasanValidasi(hasil: { ok: true } | { ok: false; alasan: string }): string {
  return hasil.ok ? "" : hasil.alasan;
}

const HARI_MS = 86_400_000;

// ===== klasifikasiTunggakan: batas tiap tahap (ambang bawaan) =====
eq(klasifikasiTunggakan(0).kode, "lancar", "0 hari = lancar");
eq(klasifikasiTunggakan(-5).kode, "lancar", "hari negatif dianggap lancar");
eq(klasifikasiTunggakan(Number.NaN).kode, "lancar", "NaN dianggap lancar");
eq(klasifikasiTunggakan(0.9).kode, "lancar", "pecahan di bawah 1 hari = lancar");
eq(klasifikasiTunggakan(1).kode, "ringan", "1 hari = ringan");
eq(
  klasifikasiTunggakan(AMBANG_TUNGGAKAN_DEFAULT.ringan).kode,
  "ringan",
  "batas atas ringan termasuk ringan",
);
eq(klasifikasiTunggakan(8).kode, "sedang", "8 hari = sedang");
eq(klasifikasiTunggakan(30).kode, "sedang", "30 hari = sedang (batas atas)");
eq(klasifikasiTunggakan(31).kode, "berat", "31 hari = berat");
eq(klasifikasiTunggakan(90).kode, "berat", "90 hari = berat (batas atas)");
eq(klasifikasiTunggakan(91).kode, "macet", "91 hari = macet");
eq(klasifikasiTunggakan(1e6).kode, "macet", "keterlambatan ekstrem = macet");
eq(klasifikasiTunggakan(1.9).kode, "ringan", "pecahan dibulatkan ke bawah");

// ===== klasifikasiTunggakan: ambang khusus =====
const ambangKhusus = { ringan: 2, sedang: 5, berat: 10 };
eq(klasifikasiTunggakan(2, ambangKhusus).kode, "ringan", "ambang khusus: 2 = ringan");
eq(klasifikasiTunggakan(3, ambangKhusus).kode, "sedang", "ambang khusus: 3 = sedang");
eq(klasifikasiTunggakan(6, ambangKhusus).kode, "berat", "ambang khusus: 6 = berat");
eq(klasifikasiTunggakan(11, ambangKhusus).kode, "macet", "ambang khusus: 11 = macet");
ok(
  klasifikasiTunggakan(1).perluTindakan && !klasifikasiTunggakan(0).perluTindakan,
  "tahap keterlambatan selalu perlu tindakan, lancar tidak",
);

// ===== validasiAmbang =====
ok(validasiAmbang(AMBANG_TUNGGAKAN_DEFAULT).ok, "ambang bawaan sah");
ok(validasiAmbang({ ringan: 1, sedang: 2, berat: 3 }).ok, "ambang menaik minimum sah");
ok(!validasiAmbang({ ringan: 0, sedang: 30, berat: 90 }).ok, "ambang 0 ditolak");
ok(
  !validasiAmbang({
    ringan: 30,
    sedang: 7,
    berat: 90,
  }).ok,
  "ambang tidak menaik ditolak",
);
ok(!validasiAmbang({ ringan: 7, sedang: 7, berat: 90 }).ok, "ambang kembar ditolak");
ok(
  !validasiAmbang({ ringan: 7, sedang: 30, berat: AMBANG_TUNGGAKAN_BATAS.maks + 1 }).ok,
  "ambang di atas batas ditolak",
);
ok(!validasiAmbang({ ringan: 7.5, sedang: 30, berat: 90 }).ok, "ambang pecahan ditolak");
ok(!validasiAmbang({ ringan: Number.NaN, sedang: 30, berat: 90 }).ok, "ambang NaN ditolak");

// ===== jam kontak =====
ok(validasiJamKontak(JAM_KONTAK_DEFAULT).ok, "jam kontak bawaan sah");
ok(validasiJamKontak({ mulai: 0, selesai: 23 }).ok, "jam kontak terlebar sah");
ok(!validasiJamKontak({ mulai: 20, selesai: 8 }).ok, "jam terbalik ditolak");
ok(!validasiJamKontak({ mulai: 8, selesai: 8 }).ok, "jam kembar ditolak");
ok(!validasiJamKontak({ mulai: -1, selesai: 20 }).ok, "jam negatif ditolak");
ok(!validasiJamKontak({ mulai: 8, selesai: 24 }).ok, "jam 24 ditolak");

// ===== jamWIB & jendela kontak =====
eq(jamWIB(0), 7, "epoch UTC 00:00 = 07:00 WIB");
eq(jamWIB(Date.UTC(2026, 0, 1, 16, 0, 0)), 23, "UTC 16:00 = 23:00 WIB");
eq(jamWIB(Date.UTC(2026, 0, 1, 3, 0, 0)), 10, "UTC 03:00 = 10:00 WIB");
ok(dalamJamKontak(8), "08:00 di dalam jendela bawaan");
ok(dalamJamKontak(19), "19:00 di dalam jendela bawaan");
ok(!dalamJamKontak(20), "20:00 sudah di luar jendela (batas eksklusif)");
ok(!dalamJamKontak(7), "07:00 masih di luar jendela");
ok(!dalamJamKontak(Number.NaN), "jam NaN ditolak");
ok(
  bolehKontakSekarang(Date.UTC(2026, 0, 1, 3, 0, 0)),
  "UTC 03:00 (WIB 10:00) boleh kontak",
);
ok(
  !bolehKontakSekarang(Date.UTC(2026, 0, 1, 15, 0, 0)),
  "UTC 15:00 (WIB 22:00) tidak boleh kontak",
);

// ===== pihak yang boleh dihubungi =====
ok(bolehHubungiPihak("peminjam").ok, "peminjam boleh dihubungi");
ok(bolehHubungiPihak("  PEMINJAM ").ok, "huruf besar & spasi dinormalkan");
for (const pihak of ["kontak_darurat", "keluarga", "atasan", "tetangga", "pihak_lain"]) {
  const hasil = bolehHubungiPihak(pihak);
  ok(!hasil.ok, `pihak ${pihak} ditolak`);
  ok(!hasil.ok && hasil.alasan.length > 20, `alasan penolakan ${pihak} jelas`);
}
const pihakAsing = bolehHubungiPihak("teman_sekolah");
ok(!pihakAsing.ok, "pihak tak dikenal ditolak");
ok(
  !pihakAsing.ok && pihakAsing.alasan.includes("tidak dikenali"),
  "alasan pihak tak dikenal menyebut sebabnya",
);

// ===== penjaga pesan: penerimaan =====
const pesanNetral = pesanPengingatNetral({
  nama: "SITI PEMINJAM",
  nomorReferensi: "PGD-UJI-1",
  hariTerlambat: 20,
  totalKewajiban: 1_300_000,
  tenggatTawaran: "31 Oktober 2026",
});
ok(periksaPesanPenagihan(pesanNetral).ok, "pesan pengingat netral diterima");
ok(
  pesanNetral.includes("pembukuan internal"),
  "pesan netral menyebut catatan internal, bukan tagihan resmi",
);
ok(periksaPesanPenagihan("a".repeat(PANJANG_MAKS_PESAN)).ok, "pesan tepat batas panjang diterima");

// ===== penjaga pesan: setiap kategori pelanggaran =====
eqJson(kategori("Kami akan kerahkan preman ke rumah Anda"), ["ancaman kekerasan"], "ancaman kekerasan terdeteksi");
eqJson(kategori("Kami akan permalukan Anda di depan orang banyak"), ["intimidasi"], "intimidasi terdeteksi");
eqJson(kategori("Kami akan sebar data Anda kalau tidak bayar"), ["penyebaran data pribadi"], "penyebaran data terdeteksi");
eqJson(kategori("Kami akan hubungi atasan Anda hari ini"), ["kontak pihak tidak berwenang"], "kontak pihak ketiga terdeteksi");
eqJson(kategori("Kami bawa polisi ke rumah Anda besok"), ["klaim hukum palsu"], "klaim hukum palsu terdeteksi");
eqJson(kategori("Pengajuan Anda pasti akan disetujui asal bayar"), ["janji menyesatkan"], "janji menyesatkan terdeteksi");
ok(
  kategori("Kami akan sebar foto KTP anda ke tetangga").length >= 2,
  "satu pesan bisa melanggar beberapa kategori sekaligus",
);
ok(
  alasanPesan("Kami akan sebar data Anda").includes("Pesan ditolak"),
  "alasan penolakan menyebut pesan ditolak",
);
ok(
  alasanPesan("Kami akan sebar data Anda").includes("ancaman"),
  "alasan penolakan mengingatkan daftar larangan",
);

// ===== penjaga pesan: kosong & kepanjangan =====
ok(!periksaPesanPenagihan("").ok, "pesan kosong ditolak");
ok(alasanPesan("   ").includes("tidak boleh kosong"), "pesan hanya spasi ditolak");
ok(
  alasanPesan("a".repeat(PANJANG_MAKS_PESAN + 1)).includes("maksimal"),
  "pesan melebihi batas ditolak",
);
ok(kategori("a".repeat(PANJANG_MAKS_PESAN + 1)).length === 0, "pesan kepanjangan tidak menghasilkan temuan frasa");

// ===== penyamaran kontak & rekening =====
const nomorAsli = "628123456789";
const nomorSamar = maskNomorTelepon(nomorAsli);
ok(nomorSamar !== null && nomorSamar !== nomorAsli, "nomor telepon disamarkan");
ok(nomorSamar !== null && !nomorSamar.includes(nomorAsli), "nomor utuh tidak muncul utuh");
ok(nomorSamar !== null && nomorSamar.startsWith("62812"), "awalan nomor dipertahankan");
ok(nomorSamar !== null && nomorSamar.endsWith("6789"), "4 digit terakhir dipertahankan");
ok(nomorSamar !== null && nomorSamar.includes("•"), "bagian tengah ditutup");
eq(maskNomorTelepon(null), null, "nomor null tetap null");
eq(maskNomorTelepon(""), null, "nomor kosong menjadi null");
eq(maskNomorTelepon("0812"), "08••", "nomor pendek hanya menyisakan 2 digit awal");
const nomorBerpemisah = maskNomorTelepon("0812-345-678") ?? "";
eq(nomorBerpemisah.length, "0812345678".length, "pemisah non-digit diabaikan");
eq(nomorBerpemisah, maskNomorTelepon("0812345678"), "pemisah tidak mengubah hasil penyamaran");

const rekeningAsli = "1234567890";
const rekeningSamar = maskRekening(rekeningAsli);
ok(rekeningSamar !== null && rekeningSamar !== rekeningAsli, "rekening disamarkan");
ok(rekeningSamar !== null && !rekeningSamar.includes(rekeningAsli), "rekening utuh tidak muncul utuh");
ok(rekeningSamar !== null && rekeningSamar.endsWith("7890"), "4 digit akhir rekening dipertahankan");
ok(rekeningSamar !== null && rekeningSamar.replace(/•/g, "") === "7890", "hanya 4 digit akhir rekening terlihat");
eq(maskRekening(null), null, "rekening null tetap null");
eq(maskRekening("1234"), "••••", "rekening 4 digit disamarkan seluruhnya");

// ===== transisi status kasus =====
ok(validasiTransisiKasus("baru", "ditangani").ok, "baru → ditangani sah");
ok(validasiTransisiKasus("ditangani", "janji_aktif").ok, "ditangani → janji aktif sah");
ok(validasiTransisiKasus("janji_aktif", "selesai").ok, "janji aktif → selesai sah");
ok(validasiTransisiKasus("selesai", "ditangani").ok, "kasus selesai boleh dibuka kembali");
ok(validasiTransisiKasus("ditutup", "ditangani").ok, "kasus ditutup boleh dibuka kembali");
ok(!validasiTransisiKasus("baru", "selesai").ok, "baru → selesai ditolak");
ok(!validasiTransisiKasus("baru", "janji_aktif").ok, "baru → janji aktif ditolak");
ok(!validasiTransisiKasus("ditangani", "ditangani").ok, "status sama ditolak");
ok(!validasiTransisiKasus("ditanganj", "ditangani").ok, "status asal tak dikenal ditolak");
ok(!validasiTransisiKasus("ditangani", "entah").ok, "status tujuan tak dikenal ditolak");
ok(STATUS_KASUS_TERTUTUP.includes("selesai") && STATUS_KASUS_TERTUTUP.includes("ditutup"), "status tertutup sesuai");

// ===== eskalasi =====
eq(eskalasiDisarankan("lancar"), 0, "lancar: tingkat 0");
eq(eskalasiDisarankan("ringan"), 1, "ringan: tingkat 1");
eq(eskalasiDisarankan("sedang"), 2, "sedang: tingkat 2");
eq(eskalasiDisarankan("berat"), 3, "berat: tingkat 3");
eq(eskalasiDisarankan("macet"), 4, "macet: tingkat 4");
eq(eskalasiBerikutnya(0)?.tingkat, 1, "dari 0 ke tingkat 1");
eq(eskalasiBerikutnya(1)?.tingkat, 2, "dari 1 ke tingkat 2");
eq(eskalasiBerikutnya(2)?.tingkat, 3, "dari 2 ke tingkat 3");
eq(eskalasiBerikutnya(3)?.tingkat, 4, "dari 3 ke tingkat 4");
eq(eskalasiBerikutnya(4), null, "tingkat tertinggi tidak punya lanjutan");
eq(eskalasiBerikutnya(9), null, "tingkat di luar rentang tidak punya lanjutan");
ok(eskalasiBerikutnya(2)?.butuhPersetujuan === true, "tingkat 3 butuh persetujuan penyelia");
ok(eskalasiBerikutnya(1)?.butuhPersetujuan === false, "tingkat 2 tidak butuh persetujuan");

// ===== janji pembayaran =====
const sekarang = Date.UTC(2026, 0, 10, 8, 0, 0);
ok(
  validasiJanjiBayar({ nominal: 500_000, tanggalJanji: sekarang + 3 * HARI_MS }, sekarang).ok,
  "janji wajar diterima",
);
ok(
  validasiJanjiBayar({ nominal: 500_000, tanggalJanji: sekarang }, sekarang).ok,
  "janji hari ini diterima",
);
ok(
  !validasiJanjiBayar({ nominal: 0, tanggalJanji: sekarang + HARI_MS }, sekarang).ok,
  "nominal nol ditolak",
);
ok(
  !validasiJanjiBayar({ nominal: -1, tanggalJanji: sekarang + HARI_MS }, sekarang).ok,
  "nominal negatif ditolak",
);
ok(
  !validasiJanjiBayar({ nominal: 500_000.5, tanggalJanji: sekarang + HARI_MS }, sekarang).ok,
  "nominal pecahan ditolak",
);
ok(
  !validasiJanjiBayar({ nominal: 500_000, tanggalJanji: sekarang - 30 * HARI_MS }, sekarang).ok,
  "janji jauh ke belakang ditolak",
);
ok(
  !validasiJanjiBayar({ nominal: 500_000, tanggalJanji: sekarang + 200 * HARI_MS }, sekarang).ok,
  "janji terlalu jauh ke depan ditolak",
);
ok(!validasiJanjiBayar({ nominal: 500_000, tanggalJanji: 0 }, sekarang).ok, "tanggal 0 ditolak");
ok(
  alasanValidasi(
    validasiJanjiBayar({ nominal: 500_000, tanggalJanji: sekarang - 30 * HARI_MS }, sekarang),
  ).includes("belakang"),
  "alasan janji mundur menyebut arah",
);
ok(
  alasanValidasi(
    validasiJanjiBayar({ nominal: 500_000, tanggalJanji: sekarang + 200 * HARI_MS }, sekarang),
  ).includes("depan"),
  "alasan janji jauh menyebut arah",
);

// ===== penyelesaian =====
const kewajiban = 1_300_000;
ok(
  validasiPenyelesaian({ jenis: "pelunasan_penuh", nominal: kewajiban }, kewajiban).ok,
  "pelunasan penuh sesuai kewajiban diterima",
);
ok(
  !validasiPenyelesaian({ jenis: "pelunasan_penuh", nominal: kewajiban - 1 }, kewajiban).ok,
  "pelunasan penuh kurang dari kewajiban ditolak",
);
ok(
  validasiPenyelesaian({ jenis: "pelunasan_sebagian", nominal: 500_000 }, kewajiban).ok,
  "pelunasan sebagian diterima",
);
ok(
  !validasiPenyelesaian({ jenis: "pelunasan_sebagian", nominal: 0 }, kewajiban).ok,
  "pelunasan sebagian tanpa nominal ditolak",
);
ok(
  validasiPenyelesaian({ jenis: "keringanan_denda", nominal: 0 }, kewajiban).ok,
  "keringanan denda boleh bernilai nol",
);
ok(
  validasiPenyelesaian({ jenis: "penyelesaian_sengketa", nominal: 0 }, kewajiban).ok,
  "penyelesaian sengketa boleh bernilai nol",
);
ok(
  validasiPenyelesaian({ jenis: "restrukturisasi", nominal: 0 }, kewajiban).ok,
  "restrukturisasi boleh bernilai nol",
);
ok(
  !validasiPenyelesaian({ jenis: "keringanan_denda", nominal: -1 }, kewajiban).ok,
  "nominal negatif ditolak walau jenisnya bebas nominal",
);

// ===== pembayaran =====
ok(validasiPembayaran({ status: "belum_bayar", nominal: 0 }, kewajiban).ok, "belum bayar tanpa nominal");
ok(
  !validasiPembayaran({ status: "belum_bayar", nominal: 100_000 }, kewajiban).ok,
  "belum bayar dengan nominal ditolak",
);
ok(
  validasiPembayaran({ status: "bayar_sebagian", nominal: 100_000 }, kewajiban).ok,
  "bayar sebagian diterima",
);
ok(
  !validasiPembayaran({ status: "bayar_sebagian", nominal: 0 }, kewajiban).ok,
  "bayar sebagian tanpa nominal ditolak",
);
ok(
  !validasiPembayaran({ status: "lunas_dicatat", nominal: kewajiban - 1 }, kewajiban).ok,
  "lunas di bawah kewajiban ditolak",
);
ok(
  validasiPembayaran({ status: "lunas_dicatat", nominal: kewajiban }, kewajiban).ok,
  "lunas tepat kewajiban diterima",
);
ok(
  validasiPembayaran({ status: "lunas_dicatat", nominal: kewajiban + 10_000 }, kewajiban).ok,
  "lunas melebihi kewajiban diterima",
);
ok(
  !validasiPembayaran({ status: "lunas_dicatat", nominal: -1 }, kewajiban).ok,
  "nominal negatif ditolak",
);
ok(
  alasanValidasi(
    validasiPembayaran({ status: "lunas_dicatat", nominal: kewajiban - 1 }, kewajiban),
  ).includes("kurang"),
  "alasan lunas kurang menyebut sebabnya",
);

// ===== pengaduan =====
ok(validasiPengaduan("Nominal tagihan tidak sesuai catatan saya").ok, "pengaduan wajar diterima");
ok(!validasiPengaduan("pendek").ok, "pengaduan terlalu pendek ditolak");
ok(!validasiPengaduan("         ").ok, "pengaduan hanya spasi ditolak");
ok(!validasiPengaduan("x".repeat(1201)).ok, "pengaduan kepanjangan ditolak");
ok(validasiTransisiPengaduan("baru", "ditinjau").ok, "pengaduan baru → ditinjau sah");
ok(validasiTransisiPengaduan("ditinjau", "selesai").ok, "pengaduan ditinjau → selesai sah");
ok(!validasiTransisiPengaduan("baru", "selesai").ok, "pengaduan baru → selesai ditolak");
ok(!validasiTransisiPengaduan("selesai", "selesai").ok, "status pengaduan sama ditolak");
ok(!validasiTransisiPengaduan("entah", "baru").ok, "status pengaduan tak dikenal ditolak");

// ===== laporan =====
const kasusUji: KasusUntukLaporan[] = [
  {
    tahap: "sedang",
    petugasLabel: "PETUGAS A",
    statusKasus: "ditangani",
    statusPembayaran: "belum_bayar",
    sisaKewajiban: 1_000_000,
    jumlahTindakan: 2,
    janji: { status: "aktif" },
  },
  {
    tahap: "sedang",
    petugasLabel: null,
    statusKasus: "selesai",
    statusPembayaran: "lunas_dicatat",
    sisaKewajiban: -100,
    jumlahTindakan: 0,
    janji: { status: "dipenuhi" },
  },
  {
    tahap: "macet",
    petugasLabel: "PETUGAS A",
    statusKasus: "ditangani",
    statusPembayaran: "bayar_sebagian",
    sisaKewajiban: 500_000,
    jumlahTindakan: 1,
    janji: { status: "dilanggar" },
  },
];
const laporan = ringkasLaporanPenagihan(kasusUji);
eq(laporan.totalKasus, 3, "laporan: total kasus");
eqJson(laporan.perTahap, { lancar: 0, ringan: 0, sedang: 2, berat: 0, macet: 1 }, "laporan: hitungan per tahap");
eq(laporan.belumDitugaskan, 1, "laporan: kasus tanpa petugas dihitung terpisah");
eq(laporan.kasusAktif, 2, "laporan: kasus selesai tidak dihitung aktif");
eq(laporan.janjiAktif, 1, "laporan: janji aktif");
eq(laporan.janjiDipenuhi, 1, "laporan: janji dipenuhi");
eq(laporan.janjiDilanggar, 1, "laporan: janji dilanggar");
eq(laporan.totalSisaKewajiban, 1_500_000, "laporan: sisa kewajiban hanya dari angka positif");
eq(laporan.tanpaTindakan, 1, "laporan: kasus tanpa tindakan dihitung");
eqJson(laporan.perPetugas, [{ petugas: "PETUGAS A", jumlah: 2 }], "laporan: beban per petugas");

const laporanDuaPetugas = ringkasLaporanPenagihan([
  { tahap: "ringan", petugasLabel: "B", statusKasus: "ditangani", statusPembayaran: "belum_bayar", sisaKewajiban: 10, jumlahTindakan: 1, janji: null },
  { tahap: "ringan", petugasLabel: "C", statusKasus: "ditangani", statusPembayaran: "belum_bayar", sisaKewajiban: 10, jumlahTindakan: 1, janji: null },
  { tahap: "ringan", petugasLabel: "C", statusKasus: "ditangani", statusPembayaran: "belum_bayar", sisaKewajiban: 10, jumlahTindakan: 1, janji: null },
  { tahap: "ringan", petugasLabel: "  ", statusKasus: "ditangani", statusPembayaran: "belum_bayar", sisaKewajiban: 10, jumlahTindakan: 1, janji: null },
]);
eqJson(
  laporanDuaPetugas.perPetugas,
  [{ petugas: "C", jumlah: 2 }, { petugas: "B", jumlah: 1 }],
  "laporan: petugas terbanyak lebih dulu",
);
eq(laporanDuaPetugas.belumDitugaskan, 1, "laporan: label petugas kosong dianggap belum ditugaskan");
eq(laporanDuaPetugas.totalSisaKewajiban, 40, "laporan: sisa kewajiban dijumlahkan");

const laporanKosong = ringkasLaporanPenagihan([]);
eq(laporanKosong.totalKasus, 0, "laporan kosong: total 0");
eq(laporanKosong.totalSisaKewajiban, 0, "laporan kosong: sisa kewajiban 0");
eqJson(laporanKosong.perPetugas, [], "laporan kosong: tanpa petugas");


// --- Prioritas & utas pengaduan (helpdesk) ---------------------------------
eq(PRIORITAS_PENGADUAN.length, 4, "prioritas: empat tingkat");
eq(BOBOT_PRIORITAS_PENGADUAN.kritis > BOBOT_PRIORITAS_PENGADUAN.tinggi, true, "prioritas: kritis di atas tinggi");
eq(BOBOT_PRIORITAS_PENGADUAN.tinggi > BOBOT_PRIORITAS_PENGADUAN.normal, true, "prioritas: tinggi di atas normal");
eq(BOBOT_PRIORITAS_PENGADUAN.normal > BOBOT_PRIORITAS_PENGADUAN.rendah, true, "prioritas: normal di atas rendah");

eq(prioritasEfektif(undefined), "normal", "prioritas kosong (baris lama) → normal");
eq(prioritasEfektif("entah"), "normal", "prioritas tak dikenal → normal (fail-safe)");
eq(prioritasEfektif("kritis"), "kritis", "prioritas sah diteruskan apa adanya");

eq(prioritasBawaan("salah_tagih"), "tinggi", "tagihan salah → prioritas tinggi");
eq(prioritasBawaan("salah_nominal"), "tinggi", "nominal salah → prioritas tinggi");
eq(prioritasBawaan("petugas_tidak_sesuai_prosedur"), "tinggi", "petugas melanggar prosedur → tinggi");
eq(prioritasBawaan("kesulitan_bayar"), "tinggi", "kesulitan bayar → tinggi");
eq(prioritasBawaan("permintaan_penjelasan"), "normal", "permintaan penjelasan → normal");
eq(prioritasBawaan("lainnya"), "normal", "kategori lain → normal");

eq(validasiPrioritasPengaduan("kritis").ok, true, "prioritas sah diterima");
eq(validasiPrioritasPengaduan("URGENT").ok, false, "prioritas tak dikenal ditolak");

eq(validasiPesanPengaduan("Terima kasih, kami cek dulu.").ok, true, "pesan wajar diterima");
eq(validasiPesanPengaduan("  ").ok, false, "pesan kosong ditolak");
eq(validasiPesanPengaduan("x".repeat(PANJANG_MAKS_PESAN_PENGADUAN + 1)).ok, false, "pesan terlalu panjang ditolak");
eq(validasiPesanPengaduan("x".repeat(PANJANG_MAKS_PESAN_PENGADUAN)).ok, true, "pesan tepat di batas maksimum diterima");

eq(
  nomorTiketPengaduan("pengaduan_abc123", Date.UTC(2026, 10, 8, 12, 0)),
  "TKT-20261108-ABC123",
  "nomor tiket: tanggal WIB dan enam karakter id",
);
eq(
  nomorTiketPengaduan("pengaduan_abc123", Date.UTC(2026, 10, 8, 18, 0)),
  "TKT-20261109-ABC123",
  "nomor tiket: pergantian hari mengikuti WIB",
);
eq(
  nomorTiketPengaduan("pg1", Date.UTC(2026, 10, 8, 12, 0)),
  "TKT-20261108-000PG1",
  "nomor tiket: id pendek tetap enam karakter",
);

if (failed > 0) {
  console.error(`\n${failed} gagal, ${passed} lulus`);
  throw new Error(`${failed} tes penagihan gagal`);
}
console.log(`penagihan: ${passed} lulus`);
