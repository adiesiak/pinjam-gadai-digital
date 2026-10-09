"use strict";
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
var _a, _b, _c, _d, _e, _f, _g;
Object.defineProperty(exports, "__esModule", { value: true });
/** Run: bun src/lib/penagihan.test.ts */
var penagihan_1 = require("./penagihan");
var passed = 0;
var failed = 0;
function eq(actual, expected, label) {
    if (actual === expected)
        passed += 1;
    else {
        failed += 1;
        console.error("FAIL ".concat(label, ": expected ").concat(JSON.stringify(expected), ", got ").concat(JSON.stringify(actual)));
    }
}
function ok(cond, label) {
    if (cond)
        passed += 1;
    else {
        failed += 1;
        console.error("FAIL ".concat(label));
    }
}
function eqJson(actual, expected, label) {
    var a = JSON.stringify(actual);
    var b = JSON.stringify(expected);
    if (a === b)
        passed += 1;
    else {
        failed += 1;
        console.error("FAIL ".concat(label, ": expected ").concat(b, ", got ").concat(a));
    }
}
/** Kategori temuan satu pesan (kosong bila pesan diterima). */
function kategori(teks) {
    var hasil = (0, penagihan_1.periksaPesanPenagihan)(teks);
    return hasil.ok ? [] : __spreadArray([], new Set(hasil.temuan.map(function (t) { return t.kategori; })), true);
}
/** Alasan penolakan satu pesan ("" bila diterima). */
function alasanPesan(teks) {
    var hasil = (0, penagihan_1.periksaPesanPenagihan)(teks);
    return hasil.ok ? "" : hasil.alasan;
}
/** Alasan penolakan satu hasil validasi ("" bila diterima). */
function alasanValidasi(hasil) {
    return hasil.ok ? "" : hasil.alasan;
}
var HARI_MS = 86400000;
// ===== klasifikasiTunggakan: batas tiap tahap (ambang bawaan) =====
eq((0, penagihan_1.klasifikasiTunggakan)(0).kode, "lancar", "0 hari = lancar");
eq((0, penagihan_1.klasifikasiTunggakan)(-5).kode, "lancar", "hari negatif dianggap lancar");
eq((0, penagihan_1.klasifikasiTunggakan)(Number.NaN).kode, "lancar", "NaN dianggap lancar");
eq((0, penagihan_1.klasifikasiTunggakan)(0.9).kode, "lancar", "pecahan di bawah 1 hari = lancar");
eq((0, penagihan_1.klasifikasiTunggakan)(1).kode, "ringan", "1 hari = ringan");
eq((0, penagihan_1.klasifikasiTunggakan)(penagihan_1.AMBANG_TUNGGAKAN_DEFAULT.ringan).kode, "ringan", "batas atas ringan termasuk ringan");
eq((0, penagihan_1.klasifikasiTunggakan)(8).kode, "sedang", "8 hari = sedang");
eq((0, penagihan_1.klasifikasiTunggakan)(30).kode, "sedang", "30 hari = sedang (batas atas)");
eq((0, penagihan_1.klasifikasiTunggakan)(31).kode, "berat", "31 hari = berat");
eq((0, penagihan_1.klasifikasiTunggakan)(90).kode, "berat", "90 hari = berat (batas atas)");
eq((0, penagihan_1.klasifikasiTunggakan)(91).kode, "macet", "91 hari = macet");
eq((0, penagihan_1.klasifikasiTunggakan)(1e6).kode, "macet", "keterlambatan ekstrem = macet");
eq((0, penagihan_1.klasifikasiTunggakan)(1.9).kode, "ringan", "pecahan dibulatkan ke bawah");
// ===== klasifikasiTunggakan: ambang khusus =====
var ambangKhusus = { ringan: 2, sedang: 5, berat: 10 };
eq((0, penagihan_1.klasifikasiTunggakan)(2, ambangKhusus).kode, "ringan", "ambang khusus: 2 = ringan");
eq((0, penagihan_1.klasifikasiTunggakan)(3, ambangKhusus).kode, "sedang", "ambang khusus: 3 = sedang");
eq((0, penagihan_1.klasifikasiTunggakan)(6, ambangKhusus).kode, "berat", "ambang khusus: 6 = berat");
eq((0, penagihan_1.klasifikasiTunggakan)(11, ambangKhusus).kode, "macet", "ambang khusus: 11 = macet");
ok((0, penagihan_1.klasifikasiTunggakan)(1).perluTindakan && !(0, penagihan_1.klasifikasiTunggakan)(0).perluTindakan, "tahap keterlambatan selalu perlu tindakan, lancar tidak");
// ===== validasiAmbang =====
ok((0, penagihan_1.validasiAmbang)(penagihan_1.AMBANG_TUNGGAKAN_DEFAULT).ok, "ambang bawaan sah");
ok((0, penagihan_1.validasiAmbang)({ ringan: 1, sedang: 2, berat: 3 }).ok, "ambang menaik minimum sah");
ok(!(0, penagihan_1.validasiAmbang)({ ringan: 0, sedang: 30, berat: 90 }).ok, "ambang 0 ditolak");
ok(!(0, penagihan_1.validasiAmbang)({
    ringan: 30,
    sedang: 7,
    berat: 90,
}).ok, "ambang tidak menaik ditolak");
ok(!(0, penagihan_1.validasiAmbang)({ ringan: 7, sedang: 7, berat: 90 }).ok, "ambang kembar ditolak");
ok(!(0, penagihan_1.validasiAmbang)({ ringan: 7, sedang: 30, berat: penagihan_1.AMBANG_TUNGGAKAN_BATAS.maks + 1 }).ok, "ambang di atas batas ditolak");
ok(!(0, penagihan_1.validasiAmbang)({ ringan: 7.5, sedang: 30, berat: 90 }).ok, "ambang pecahan ditolak");
ok(!(0, penagihan_1.validasiAmbang)({ ringan: Number.NaN, sedang: 30, berat: 90 }).ok, "ambang NaN ditolak");
// ===== jam kontak =====
ok((0, penagihan_1.validasiJamKontak)(penagihan_1.JAM_KONTAK_DEFAULT).ok, "jam kontak bawaan sah");
ok((0, penagihan_1.validasiJamKontak)({ mulai: 0, selesai: 23 }).ok, "jam kontak terlebar sah");
ok(!(0, penagihan_1.validasiJamKontak)({ mulai: 20, selesai: 8 }).ok, "jam terbalik ditolak");
ok(!(0, penagihan_1.validasiJamKontak)({ mulai: 8, selesai: 8 }).ok, "jam kembar ditolak");
ok(!(0, penagihan_1.validasiJamKontak)({ mulai: -1, selesai: 20 }).ok, "jam negatif ditolak");
ok(!(0, penagihan_1.validasiJamKontak)({ mulai: 8, selesai: 24 }).ok, "jam 24 ditolak");
// ===== jamWIB & jendela kontak =====
eq((0, penagihan_1.jamWIB)(0), 7, "epoch UTC 00:00 = 07:00 WIB");
eq((0, penagihan_1.jamWIB)(Date.UTC(2026, 0, 1, 16, 0, 0)), 23, "UTC 16:00 = 23:00 WIB");
eq((0, penagihan_1.jamWIB)(Date.UTC(2026, 0, 1, 3, 0, 0)), 10, "UTC 03:00 = 10:00 WIB");
ok((0, penagihan_1.dalamJamKontak)(8), "08:00 di dalam jendela bawaan");
ok((0, penagihan_1.dalamJamKontak)(19), "19:00 di dalam jendela bawaan");
ok(!(0, penagihan_1.dalamJamKontak)(20), "20:00 sudah di luar jendela (batas eksklusif)");
ok(!(0, penagihan_1.dalamJamKontak)(7), "07:00 masih di luar jendela");
ok(!(0, penagihan_1.dalamJamKontak)(Number.NaN), "jam NaN ditolak");
ok((0, penagihan_1.bolehKontakSekarang)(Date.UTC(2026, 0, 1, 3, 0, 0)), "UTC 03:00 (WIB 10:00) boleh kontak");
ok(!(0, penagihan_1.bolehKontakSekarang)(Date.UTC(2026, 0, 1, 15, 0, 0)), "UTC 15:00 (WIB 22:00) tidak boleh kontak");
// ===== pihak yang boleh dihubungi =====
ok((0, penagihan_1.bolehHubungiPihak)("peminjam").ok, "peminjam boleh dihubungi");
ok((0, penagihan_1.bolehHubungiPihak)("  PEMINJAM ").ok, "huruf besar & spasi dinormalkan");
for (var _i = 0, _h = ["kontak_darurat", "keluarga", "atasan", "tetangga", "pihak_lain"]; _i < _h.length; _i++) {
    var pihak = _h[_i];
    var hasil = (0, penagihan_1.bolehHubungiPihak)(pihak);
    ok(!hasil.ok, "pihak ".concat(pihak, " ditolak"));
    ok(!hasil.ok && hasil.alasan.length > 20, "alasan penolakan ".concat(pihak, " jelas"));
}
var pihakAsing = (0, penagihan_1.bolehHubungiPihak)("teman_sekolah");
ok(!pihakAsing.ok, "pihak tak dikenal ditolak");
ok(!pihakAsing.ok && pihakAsing.alasan.includes("tidak dikenali"), "alasan pihak tak dikenal menyebut sebabnya");
// ===== penjaga pesan: penerimaan =====
var pesanNetral = (0, penagihan_1.pesanPengingatNetral)({
    nama: "SITI PEMINJAM",
    nomorReferensi: "PGD-UJI-1",
    hariTerlambat: 20,
    totalKewajiban: 1300000,
    tenggatTawaran: "31 Oktober 2026",
});
ok((0, penagihan_1.periksaPesanPenagihan)(pesanNetral).ok, "pesan pengingat netral diterima");
ok(pesanNetral.includes("pembukuan internal"), "pesan netral menyebut catatan internal, bukan tagihan resmi");
ok((0, penagihan_1.periksaPesanPenagihan)("a".repeat(penagihan_1.PANJANG_MAKS_PESAN)).ok, "pesan tepat batas panjang diterima");
// ===== penjaga pesan: setiap kategori pelanggaran =====
eqJson(kategori("Kami akan kerahkan preman ke rumah Anda"), ["ancaman kekerasan"], "ancaman kekerasan terdeteksi");
eqJson(kategori("Kami akan permalukan Anda di depan orang banyak"), ["intimidasi"], "intimidasi terdeteksi");
eqJson(kategori("Kami akan sebar data Anda kalau tidak bayar"), ["penyebaran data pribadi"], "penyebaran data terdeteksi");
eqJson(kategori("Kami akan hubungi atasan Anda hari ini"), ["kontak pihak tidak berwenang"], "kontak pihak ketiga terdeteksi");
eqJson(kategori("Kami bawa polisi ke rumah Anda besok"), ["klaim hukum palsu"], "klaim hukum palsu terdeteksi");
eqJson(kategori("Pengajuan Anda pasti akan disetujui asal bayar"), ["janji menyesatkan"], "janji menyesatkan terdeteksi");
ok(kategori("Kami akan sebar foto KTP anda ke tetangga").length >= 2, "satu pesan bisa melanggar beberapa kategori sekaligus");
ok(alasanPesan("Kami akan sebar data Anda").includes("Pesan ditolak"), "alasan penolakan menyebut pesan ditolak");
ok(alasanPesan("Kami akan sebar data Anda").includes("ancaman"), "alasan penolakan mengingatkan daftar larangan");
// ===== penjaga pesan: kosong & kepanjangan =====
ok(!(0, penagihan_1.periksaPesanPenagihan)("").ok, "pesan kosong ditolak");
ok(alasanPesan("   ").includes("tidak boleh kosong"), "pesan hanya spasi ditolak");
ok(alasanPesan("a".repeat(penagihan_1.PANJANG_MAKS_PESAN + 1)).includes("maksimal"), "pesan melebihi batas ditolak");
ok(kategori("a".repeat(penagihan_1.PANJANG_MAKS_PESAN + 1)).length === 0, "pesan kepanjangan tidak menghasilkan temuan frasa");
// ===== penyamaran kontak & rekening =====
var nomorAsli = "628123456789";
var nomorSamar = (0, penagihan_1.maskNomorTelepon)(nomorAsli);
ok(nomorSamar !== null && nomorSamar !== nomorAsli, "nomor telepon disamarkan");
ok(nomorSamar !== null && !nomorSamar.includes(nomorAsli), "nomor utuh tidak muncul utuh");
ok(nomorSamar !== null && nomorSamar.startsWith("62812"), "awalan nomor dipertahankan");
ok(nomorSamar !== null && nomorSamar.endsWith("6789"), "4 digit terakhir dipertahankan");
ok(nomorSamar !== null && nomorSamar.includes("•"), "bagian tengah ditutup");
eq((0, penagihan_1.maskNomorTelepon)(null), null, "nomor null tetap null");
eq((0, penagihan_1.maskNomorTelepon)(""), null, "nomor kosong menjadi null");
eq((0, penagihan_1.maskNomorTelepon)("0812"), "08••", "nomor pendek hanya menyisakan 2 digit awal");
var nomorBerpemisah = (_a = (0, penagihan_1.maskNomorTelepon)("0812-345-678")) !== null && _a !== void 0 ? _a : "";
eq(nomorBerpemisah.length, "0812345678".length, "pemisah non-digit diabaikan");
eq(nomorBerpemisah, (0, penagihan_1.maskNomorTelepon)("0812345678"), "pemisah tidak mengubah hasil penyamaran");
var rekeningAsli = "1234567890";
var rekeningSamar = (0, penagihan_1.maskRekening)(rekeningAsli);
ok(rekeningSamar !== null && rekeningSamar !== rekeningAsli, "rekening disamarkan");
ok(rekeningSamar !== null && !rekeningSamar.includes(rekeningAsli), "rekening utuh tidak muncul utuh");
ok(rekeningSamar !== null && rekeningSamar.endsWith("7890"), "4 digit akhir rekening dipertahankan");
ok(rekeningSamar !== null && rekeningSamar.replace(/•/g, "") === "7890", "hanya 4 digit akhir rekening terlihat");
eq((0, penagihan_1.maskRekening)(null), null, "rekening null tetap null");
eq((0, penagihan_1.maskRekening)("1234"), "••••", "rekening 4 digit disamarkan seluruhnya");
// ===== transisi status kasus =====
ok((0, penagihan_1.validasiTransisiKasus)("baru", "ditangani").ok, "baru → ditangani sah");
ok((0, penagihan_1.validasiTransisiKasus)("ditangani", "janji_aktif").ok, "ditangani → janji aktif sah");
ok((0, penagihan_1.validasiTransisiKasus)("janji_aktif", "selesai").ok, "janji aktif → selesai sah");
ok((0, penagihan_1.validasiTransisiKasus)("selesai", "ditangani").ok, "kasus selesai boleh dibuka kembali");
ok((0, penagihan_1.validasiTransisiKasus)("ditutup", "ditangani").ok, "kasus ditutup boleh dibuka kembali");
ok(!(0, penagihan_1.validasiTransisiKasus)("baru", "selesai").ok, "baru → selesai ditolak");
ok(!(0, penagihan_1.validasiTransisiKasus)("baru", "janji_aktif").ok, "baru → janji aktif ditolak");
ok(!(0, penagihan_1.validasiTransisiKasus)("ditangani", "ditangani").ok, "status sama ditolak");
ok(!(0, penagihan_1.validasiTransisiKasus)("ditanganj", "ditangani").ok, "status asal tak dikenal ditolak");
ok(!(0, penagihan_1.validasiTransisiKasus)("ditangani", "entah").ok, "status tujuan tak dikenal ditolak");
ok(penagihan_1.STATUS_KASUS_TERTUTUP.includes("selesai") && penagihan_1.STATUS_KASUS_TERTUTUP.includes("ditutup"), "status tertutup sesuai");
// ===== eskalasi =====
eq((0, penagihan_1.eskalasiDisarankan)("lancar"), 0, "lancar: tingkat 0");
eq((0, penagihan_1.eskalasiDisarankan)("ringan"), 1, "ringan: tingkat 1");
eq((0, penagihan_1.eskalasiDisarankan)("sedang"), 2, "sedang: tingkat 2");
eq((0, penagihan_1.eskalasiDisarankan)("berat"), 3, "berat: tingkat 3");
eq((0, penagihan_1.eskalasiDisarankan)("macet"), 4, "macet: tingkat 4");
eq((_b = (0, penagihan_1.eskalasiBerikutnya)(0)) === null || _b === void 0 ? void 0 : _b.tingkat, 1, "dari 0 ke tingkat 1");
eq((_c = (0, penagihan_1.eskalasiBerikutnya)(1)) === null || _c === void 0 ? void 0 : _c.tingkat, 2, "dari 1 ke tingkat 2");
eq((_d = (0, penagihan_1.eskalasiBerikutnya)(2)) === null || _d === void 0 ? void 0 : _d.tingkat, 3, "dari 2 ke tingkat 3");
eq((_e = (0, penagihan_1.eskalasiBerikutnya)(3)) === null || _e === void 0 ? void 0 : _e.tingkat, 4, "dari 3 ke tingkat 4");
eq((0, penagihan_1.eskalasiBerikutnya)(4), null, "tingkat tertinggi tidak punya lanjutan");
eq((0, penagihan_1.eskalasiBerikutnya)(9), null, "tingkat di luar rentang tidak punya lanjutan");
ok(((_f = (0, penagihan_1.eskalasiBerikutnya)(2)) === null || _f === void 0 ? void 0 : _f.butuhPersetujuan) === true, "tingkat 3 butuh persetujuan penyelia");
ok(((_g = (0, penagihan_1.eskalasiBerikutnya)(1)) === null || _g === void 0 ? void 0 : _g.butuhPersetujuan) === false, "tingkat 2 tidak butuh persetujuan");
// ===== janji pembayaran =====
var sekarang = Date.UTC(2026, 0, 10, 8, 0, 0);
ok((0, penagihan_1.validasiJanjiBayar)({ nominal: 500000, tanggalJanji: sekarang + 3 * HARI_MS }, sekarang).ok, "janji wajar diterima");
ok((0, penagihan_1.validasiJanjiBayar)({ nominal: 500000, tanggalJanji: sekarang }, sekarang).ok, "janji hari ini diterima");
ok(!(0, penagihan_1.validasiJanjiBayar)({ nominal: 0, tanggalJanji: sekarang + HARI_MS }, sekarang).ok, "nominal nol ditolak");
ok(!(0, penagihan_1.validasiJanjiBayar)({ nominal: -1, tanggalJanji: sekarang + HARI_MS }, sekarang).ok, "nominal negatif ditolak");
ok(!(0, penagihan_1.validasiJanjiBayar)({ nominal: 500000.5, tanggalJanji: sekarang + HARI_MS }, sekarang).ok, "nominal pecahan ditolak");
ok(!(0, penagihan_1.validasiJanjiBayar)({ nominal: 500000, tanggalJanji: sekarang - 30 * HARI_MS }, sekarang).ok, "janji jauh ke belakang ditolak");
ok(!(0, penagihan_1.validasiJanjiBayar)({ nominal: 500000, tanggalJanji: sekarang + 200 * HARI_MS }, sekarang).ok, "janji terlalu jauh ke depan ditolak");
ok(!(0, penagihan_1.validasiJanjiBayar)({ nominal: 500000, tanggalJanji: 0 }, sekarang).ok, "tanggal 0 ditolak");
ok(alasanValidasi((0, penagihan_1.validasiJanjiBayar)({ nominal: 500000, tanggalJanji: sekarang - 30 * HARI_MS }, sekarang)).includes("belakang"), "alasan janji mundur menyebut arah");
ok(alasanValidasi((0, penagihan_1.validasiJanjiBayar)({ nominal: 500000, tanggalJanji: sekarang + 200 * HARI_MS }, sekarang)).includes("depan"), "alasan janji jauh menyebut arah");
// ===== penyelesaian =====
var kewajiban = 1300000;
ok((0, penagihan_1.validasiPenyelesaian)({ jenis: "pelunasan_penuh", nominal: kewajiban }, kewajiban).ok, "pelunasan penuh sesuai kewajiban diterima");
ok(!(0, penagihan_1.validasiPenyelesaian)({ jenis: "pelunasan_penuh", nominal: kewajiban - 1 }, kewajiban).ok, "pelunasan penuh kurang dari kewajiban ditolak");
ok((0, penagihan_1.validasiPenyelesaian)({ jenis: "pelunasan_sebagian", nominal: 500000 }, kewajiban).ok, "pelunasan sebagian diterima");
ok(!(0, penagihan_1.validasiPenyelesaian)({ jenis: "pelunasan_sebagian", nominal: 0 }, kewajiban).ok, "pelunasan sebagian tanpa nominal ditolak");
ok((0, penagihan_1.validasiPenyelesaian)({ jenis: "keringanan_denda", nominal: 0 }, kewajiban).ok, "keringanan denda boleh bernilai nol");
ok((0, penagihan_1.validasiPenyelesaian)({ jenis: "penyelesaian_sengketa", nominal: 0 }, kewajiban).ok, "penyelesaian sengketa boleh bernilai nol");
ok((0, penagihan_1.validasiPenyelesaian)({ jenis: "restrukturisasi", nominal: 0 }, kewajiban).ok, "restrukturisasi boleh bernilai nol");
ok(!(0, penagihan_1.validasiPenyelesaian)({ jenis: "keringanan_denda", nominal: -1 }, kewajiban).ok, "nominal negatif ditolak walau jenisnya bebas nominal");
// ===== pembayaran =====
ok((0, penagihan_1.validasiPembayaran)({ status: "belum_bayar", nominal: 0 }, kewajiban).ok, "belum bayar tanpa nominal");
ok(!(0, penagihan_1.validasiPembayaran)({ status: "belum_bayar", nominal: 100000 }, kewajiban).ok, "belum bayar dengan nominal ditolak");
ok((0, penagihan_1.validasiPembayaran)({ status: "bayar_sebagian", nominal: 100000 }, kewajiban).ok, "bayar sebagian diterima");
ok(!(0, penagihan_1.validasiPembayaran)({ status: "bayar_sebagian", nominal: 0 }, kewajiban).ok, "bayar sebagian tanpa nominal ditolak");
ok(!(0, penagihan_1.validasiPembayaran)({ status: "lunas_dicatat", nominal: kewajiban - 1 }, kewajiban).ok, "lunas di bawah kewajiban ditolak");
ok((0, penagihan_1.validasiPembayaran)({ status: "lunas_dicatat", nominal: kewajiban }, kewajiban).ok, "lunas tepat kewajiban diterima");
ok((0, penagihan_1.validasiPembayaran)({ status: "lunas_dicatat", nominal: kewajiban + 10000 }, kewajiban).ok, "lunas melebihi kewajiban diterima");
ok(!(0, penagihan_1.validasiPembayaran)({ status: "lunas_dicatat", nominal: -1 }, kewajiban).ok, "nominal negatif ditolak");
ok(alasanValidasi((0, penagihan_1.validasiPembayaran)({ status: "lunas_dicatat", nominal: kewajiban - 1 }, kewajiban)).includes("kurang"), "alasan lunas kurang menyebut sebabnya");
// ===== pengaduan =====
ok((0, penagihan_1.validasiPengaduan)("Nominal tagihan tidak sesuai catatan saya").ok, "pengaduan wajar diterima");
ok(!(0, penagihan_1.validasiPengaduan)("pendek").ok, "pengaduan terlalu pendek ditolak");
ok(!(0, penagihan_1.validasiPengaduan)("         ").ok, "pengaduan hanya spasi ditolak");
ok(!(0, penagihan_1.validasiPengaduan)("x".repeat(1201)).ok, "pengaduan kepanjangan ditolak");
ok((0, penagihan_1.validasiTransisiPengaduan)("baru", "ditinjau").ok, "pengaduan baru → ditinjau sah");
ok((0, penagihan_1.validasiTransisiPengaduan)("ditinjau", "selesai").ok, "pengaduan ditinjau → selesai sah");
ok(!(0, penagihan_1.validasiTransisiPengaduan)("baru", "selesai").ok, "pengaduan baru → selesai ditolak");
ok(!(0, penagihan_1.validasiTransisiPengaduan)("selesai", "selesai").ok, "status pengaduan sama ditolak");
ok(!(0, penagihan_1.validasiTransisiPengaduan)("entah", "baru").ok, "status pengaduan tak dikenal ditolak");
// ===== laporan =====
var kasusUji = [
    {
        tahap: "sedang",
        petugasLabel: "PETUGAS A",
        statusKasus: "ditangani",
        statusPembayaran: "belum_bayar",
        sisaKewajiban: 1000000,
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
        sisaKewajiban: 500000,
        jumlahTindakan: 1,
        janji: { status: "dilanggar" },
    },
];
var laporan = (0, penagihan_1.ringkasLaporanPenagihan)(kasusUji);
eq(laporan.totalKasus, 3, "laporan: total kasus");
eqJson(laporan.perTahap, { lancar: 0, ringan: 0, sedang: 2, berat: 0, macet: 1 }, "laporan: hitungan per tahap");
eq(laporan.belumDitugaskan, 1, "laporan: kasus tanpa petugas dihitung terpisah");
eq(laporan.kasusAktif, 2, "laporan: kasus selesai tidak dihitung aktif");
eq(laporan.janjiAktif, 1, "laporan: janji aktif");
eq(laporan.janjiDipenuhi, 1, "laporan: janji dipenuhi");
eq(laporan.janjiDilanggar, 1, "laporan: janji dilanggar");
eq(laporan.totalSisaKewajiban, 1500000, "laporan: sisa kewajiban hanya dari angka positif");
eq(laporan.tanpaTindakan, 1, "laporan: kasus tanpa tindakan dihitung");
eqJson(laporan.perPetugas, [{ petugas: "PETUGAS A", jumlah: 2 }], "laporan: beban per petugas");
var laporanDuaPetugas = (0, penagihan_1.ringkasLaporanPenagihan)([
    { tahap: "ringan", petugasLabel: "B", statusKasus: "ditangani", statusPembayaran: "belum_bayar", sisaKewajiban: 10, jumlahTindakan: 1, janji: null },
    { tahap: "ringan", petugasLabel: "C", statusKasus: "ditangani", statusPembayaran: "belum_bayar", sisaKewajiban: 10, jumlahTindakan: 1, janji: null },
    { tahap: "ringan", petugasLabel: "C", statusKasus: "ditangani", statusPembayaran: "belum_bayar", sisaKewajiban: 10, jumlahTindakan: 1, janji: null },
    { tahap: "ringan", petugasLabel: "  ", statusKasus: "ditangani", statusPembayaran: "belum_bayar", sisaKewajiban: 10, jumlahTindakan: 1, janji: null },
]);
eqJson(laporanDuaPetugas.perPetugas, [{ petugas: "C", jumlah: 2 }, { petugas: "B", jumlah: 1 }], "laporan: petugas terbanyak lebih dulu");
eq(laporanDuaPetugas.belumDitugaskan, 1, "laporan: label petugas kosong dianggap belum ditugaskan");
eq(laporanDuaPetugas.totalSisaKewajiban, 40, "laporan: sisa kewajiban dijumlahkan");
var laporanKosong = (0, penagihan_1.ringkasLaporanPenagihan)([]);
eq(laporanKosong.totalKasus, 0, "laporan kosong: total 0");
eq(laporanKosong.totalSisaKewajiban, 0, "laporan kosong: sisa kewajiban 0");
eqJson(laporanKosong.perPetugas, [], "laporan kosong: tanpa petugas");
if (failed > 0) {
    console.error("\n".concat(failed, " gagal, ").concat(passed, " lulus"));
    throw new Error("".concat(failed, " tes penagihan gagal"));
}
console.log("penagihan: ".concat(passed, " lulus"));
