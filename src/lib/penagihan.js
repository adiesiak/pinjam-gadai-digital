"use strict";
/**
 * Aturan penagihan & pengelolaan keterlambatan PINDAI — SATU sumber kebenaran,
 * MURNI (tanpa React, tanpa Convex, tanpa DOM) sehingga bisa diuji sebagai
 * skrip biasa (`bun src/lib/penagihan.test.ts`) dan dipakai bersama oleh server
 * (`convex/penagihan.ts`) maupun panel admin.
 *
 * Kenapa berkas ini ada: sebelumnya keterlambatan hanya muncul sebagai satu
 * daftar "DPD" di panel admin — tidak ada klasifikasi tunggakan, penugasan
 * petugas, riwayat komunikasi, janji pembayaran, pengaduan, maupun aturan
 * kapan dan kepada siapa petugas boleh menghubungi nasabah. Semua aturan itu
 * sekarang ditulis di sini supaya server dan UI tidak bisa berbeda tafsir.
 *
 * Batas yang dijaga berkas ini (dan diuji):
 *  - Penagihan PINDAI adalah PENAGIHAN PENCATATAN: tidak ada uang yang
 *    dipindahkan, tidak ada ancaman, intimidasi, penyebaran data pribadi,
 *    kontak ke pihak yang tidak berwenang, atau pesan yang menyesatkan.
 *    `periksaPesanPenagihan` menolak pesan seperti itu, dan
 *    `bolehHubungiPihak` hanya mengizinkan PEMINJAM itu sendiri.
 *  - Kontak (nomor WhatsApp) dan informasi finansial (nomor rekening) nasabah
 *    tidak pernah ditampilkan utuh di daftar kerja: `maskNomorTelepon` dan
 *    `maskRekening` dipakai di server, bukan hanya di tampilan.
 *  - Ambang tunggakan, jam kontak, dan status kasus dapat diatur admin dan
 *    ditinjau ulang (lihat `validasiAmbang`/`validasiJamKontak` dan panel
 *    Penagihan) — bukan konstanta yang tersembunyi di dalam komponen.
 */
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PANJANG_MAKS_PENGADUAN = exports.PANJANG_MIN_PENGADUAN = exports.LABEL_KATEGORI_PENGADUAN = exports.KATEGORI_PENGADUAN = exports.LABEL_STATUS_PENGADUAN = exports.STATUS_PENGADUAN = exports.LABEL_STATUS_PEMBAYARAN = exports.STATUS_PEMBAYARAN = exports.LABEL_JENIS_PENYELESAIAN = exports.JENIS_PENYELESAIAN = exports.JANJI_MAKS_MUNDUR_HARI = exports.JANJI_MAKS_HARI = exports.LABEL_STATUS_JANJI = exports.STATUS_JANJI = exports.URUTAN_ESKALASI = exports.LABEL_HASIL_TINDAKAN = exports.HASIL_TINDAKAN = exports.SALURAN_KONTAK_LANGSUNG = exports.LABEL_SALURAN_TINDAKAN = exports.SALURAN_TINDAKAN = exports.LABEL_JENIS_TINDAKAN = exports.JENIS_TINDAKAN = exports.STATUS_KASUS_TERTUTUP = exports.LABEL_STATUS_KASUS = exports.STATUS_KASUS = exports.CATATAN_PESAN_NETRAL = exports.PANJANG_MAKS_PESAN = exports.PIHAK_DIHUBUNGI = exports.TAHAP_TUNGGAKAN = exports.OFFSET_WIB_JAM = exports.JAM_KONTAK_DEFAULT = exports.AMBANG_TUNGGAKAN_BATAS = exports.AMBANG_TUNGGAKAN_DEFAULT = void 0;
exports.tahapDariKode = tahapDariKode;
exports.klasifikasiTunggakan = klasifikasiTunggakan;
exports.validasiAmbang = validasiAmbang;
exports.validasiJamKontak = validasiJamKontak;
exports.jamWIB = jamWIB;
exports.dalamJamKontak = dalamJamKontak;
exports.bolehKontakSekarang = bolehKontakSekarang;
exports.bolehHubungiPihak = bolehHubungiPihak;
exports.periksaPesanPenagihan = periksaPesanPenagihan;
exports.pesanPengingatNetral = pesanPengingatNetral;
exports.maskNomorTelepon = maskNomorTelepon;
exports.maskRekening = maskRekening;
exports.validasiTransisiKasus = validasiTransisiKasus;
exports.eskalasiDisarankan = eskalasiDisarankan;
exports.eskalasiBerikutnya = eskalasiBerikutnya;
exports.tingkatEskalasi = tingkatEskalasi;
exports.validasiJanjiBayar = validasiJanjiBayar;
exports.validasiPenyelesaian = validasiPenyelesaian;
exports.validasiPembayaran = validasiPembayaran;
exports.validasiPengaduan = validasiPengaduan;
exports.validasiTransisiPengaduan = validasiTransisiPengaduan;
exports.ringkasLaporanPenagihan = ringkasLaporanPenagihan;
/**
 * Ambang bawaan. Dipilih konservatif: keterlambatan 1–7 hari masih bisa
 * diselesaikan lewat pengingat, 31–90 hari butuh penanganan terarah, dan di atas
 * 90 hari sudah masuk penanganan khusus (bukan otomatis tindakan hukum).
 */
exports.AMBANG_TUNGGAKAN_DEFAULT = {
    ringan: 7,
    sedang: 30,
    berat: 90,
};
/** Batas nilai ambang yang boleh disimpan admin. */
exports.AMBANG_TUNGGAKAN_BATAS = { min: 1, maks: 365 };
/**
 * Jendela kontak bawaan 08:00–20:00. Di luar jam ini petugas tidak menghubungi
 * nasabah; tindakan yang dicoba di luar jendela ditolak server, bukan sekadar
 * diingatkan di UI.
 */
exports.JAM_KONTAK_DEFAULT = { mulai: 8, selesai: 20 };
/** Offset WIB terhadap UTC (jam) — server menyimpan waktu epoch UTC. */
exports.OFFSET_WIB_JAM = 7;
/** Urutan tahap dari paling ringan ke paling berat — dipakai UI & laporan. */
exports.TAHAP_TUNGGAKAN = [
    {
        kode: "lancar",
        label: "Lancar",
        tingkat: 0,
        keterangan: "Belum melewati tanggal acuan aplikasi.",
        perluTindakan: false,
    },
    {
        kode: "ringan",
        label: "Terlambat ringan",
        tingkat: 1,
        keterangan: "Baru melewati tanggal acuan — cukup pengingat ramah.",
        perluTindakan: true,
    },
    {
        kode: "sedang",
        label: "Terlambat sedang",
        tingkat: 2,
        keterangan: "Perlu kontak terarah dan penawaran waktu pembayaran.",
        perluTindakan: true,
    },
    {
        kode: "berat",
        label: "Terlambat berat",
        tingkat: 3,
        keterangan: "Perlu penanganan terarah dan penawaran restrukturisasi.",
        perluTindakan: true,
    },
    {
        kode: "macet",
        label: "Macet",
        tingkat: 4,
        keterangan: "Perlu penanganan khusus oleh petugas yang ditunjuk.",
        perluTindakan: true,
    },
];
/** Tahap berdasarkan kode; `null` bila kode tidak dikenal. */
function tahapDariKode(kode) {
    var _a;
    return (_a = exports.TAHAP_TUNGGAKAN.find(function (t) { return t.kode === kode; })) !== null && _a !== void 0 ? _a : null;
}
/**
 * Klasifikasi satu tunggakan dari jumlah hari terlambat. Negatif/NaN dianggap
 * lancar — data warisan tidak boleh menghasilkan tahap yang mengada-ada.
 */
function klasifikasiTunggakan(hariTerlambat, ambang) {
    if (ambang === void 0) { ambang = exports.AMBANG_TUNGGAKAN_DEFAULT; }
    var hari = Number.isFinite(hariTerlambat) ? Math.floor(hariTerlambat) : 0;
    if (hari <= 0)
        return tahapDariKode("lancar");
    if (hari <= ambang.ringan)
        return tahapDariKode("ringan");
    if (hari <= ambang.sedang)
        return tahapDariKode("sedang");
    if (hari <= ambang.berat)
        return tahapDariKode("berat");
    return tahapDariKode("macet");
}
/**
 * Ambang harus bilangan bulat positif dan MENAIK dari ringan → sedang → berat.
 * Tanpa urutan yang naik, satu nilai tidak akan pernah tercapai dan tahapnya
 * hilang diam-diam.
 */
function validasiAmbang(ambang) {
    var nilai = [ambang.ringan, ambang.sedang, ambang.berat];
    if (nilai.some(function (n) {
        return !Number.isSafeInteger(n) ||
            n < exports.AMBANG_TUNGGAKAN_BATAS.min ||
            n > exports.AMBANG_TUNGGAKAN_BATAS.maks;
    })) {
        return {
            ok: false,
            alasan: "Setiap ambang tunggakan harus bilangan bulat ".concat(exports.AMBANG_TUNGGAKAN_BATAS.min, "\u2013").concat(exports.AMBANG_TUNGGAKAN_BATAS.maks, " hari."),
        };
    }
    if (!(ambang.ringan < ambang.sedang && ambang.sedang < ambang.berat)) {
        return {
            ok: false,
            alasan: "Ambang harus menaik: ringan < sedang < berat.",
        };
    }
    return { ok: true };
}
// =====================================================================
// Jam kontak
// =====================================================================
function validasiJamKontak(jam) {
    var sah = function (n) { return Number.isSafeInteger(n) && n >= 0 && n <= 23; };
    if (!sah(jam.mulai) || !sah(jam.selesai)) {
        return { ok: false, alasan: "Jam kontak harus bilangan bulat 0–23." };
    }
    if (jam.selesai <= jam.mulai) {
        return {
            ok: false,
            alasan: "Jam selesai harus lebih besar daripada jam mulai.",
        };
    }
    return { ok: true };
}
/** Jam setempat (WIB) dari satu waktu epoch ms. */
function jamWIB(waktuMs) {
    return new Date(waktuMs + exports.OFFSET_WIB_JAM * 3600000).getUTCHours();
}
/** Apakah `jam` berada di dalam jendela kontak (mulai ≤ jam < selesai). */
function dalamJamKontak(jam, jamKontak) {
    if (jamKontak === void 0) { jamKontak = exports.JAM_KONTAK_DEFAULT; }
    if (!Number.isSafeInteger(jam))
        return false;
    return jam >= jamKontak.mulai && jam < jamKontak.selesai;
}
/** Apakah satu tindakan outreach boleh dilakukan pada waktu ini (waktu WIB). */
function bolehKontakSekarang(waktuMs, jamKontak) {
    if (jamKontak === void 0) { jamKontak = exports.JAM_KONTAK_DEFAULT; }
    return dalamJamKontak(jamWIB(waktuMs), jamKontak);
}
// =====================================================================
// Batas pihak yang boleh dihubungi
// =====================================================================
/**
 * Pihak yang boleh dihubungi: HANYA peminjam sendiri.
 *
 * Kategori lain sengaja tidak diimplementasikan sebagai "belum tersedia",
 * melainkan DITOLAK dengan alasan yang terbaca — kontak darurat, keluarga,
 * atasan, atau tetangga tidak boleh dihubungi untuk kepentingan penagihan
 * (larangan menyebarkan data pribadi & menghubungi pihak tidak berwenang).
 */
exports.PIHAK_DIHUBUNGI = ["peminjam"];
/** Kategori pihak yang selalu ditolak, beserta alasan siap tampil. */
var PIHAK_DITOLAK = {
    kontak_darurat: "Kontak darurat tidak boleh dihubungi untuk penagihan — data itu hanya untuk keadaan darurat.",
    keluarga: "Keluarga peminjam tidak boleh dihubungi; penagihan hanya kepada peminjam sendiri.",
    atasan: "Atasan atau tempat kerja peminjam tidak boleh dihubungi untuk penagihan.",
    tetangga: "Tetangga atau pihak lain di sekitar peminjam tidak boleh dihubungi.",
    pihak_lain: "Hanya peminjam sendiri yang boleh dihubungi. Menghubungi pihak lain berarti menyebarkan data pribadi.",
};
function bolehHubungiPihak(pihak) {
    var kunci = pihak.trim().toLowerCase();
    if (exports.PIHAK_DIHUBUNGI.includes(kunci))
        return { ok: true };
    var alasan = PIHAK_DITOLAK[kunci];
    if (alasan !== undefined)
        return { ok: false, alasan: alasan };
    return {
        ok: false,
        alasan: "Pihak \"".concat(pihak, "\" tidak dikenali dan tidak boleh dihubungi untuk penagihan."),
    };
}
/**
 * Daftar frasa yang membuat sebuah pesan TIDAK boleh dikirim. Sengaja berupa
 * frasa konkret (bukan analisis semantik) supaya perilakunya dapat diprediksi,
 * diuji, dan dijelaskan ke petugas — bukan kotak hitam.
 *
 * Yang ditolak: ancaman kekerasan, intimidasi/perendahan, penyebaran data
 * pribadi, kontak ke pihak ketiga, klaim hukum palsu, dan janji menyesatkan.
 */
var FRASA_TERLARANG = [
    {
        kategori: "ancaman kekerasan",
        frasa: [
            "preman",
            "orang lapangan",
            "kami kerahkan",
            "kerahkan massa",
            "habisi",
            "datang paksa",
            "paksa ambil",
            "sita paksa",
            "rusak",
            "bakar",
        ],
    },
    {
        kategori: "intimidasi",
        frasa: [
            "ancam",
            "ancaman",
            "teror",
            "bikin takut",
            "akan kau sesali",
            "kau akan menyesal",
            "memalukan",
            "permalukan",
            "kucilkan",
            "sebar aib",
            "viralkan",
            "papan nama",
            "tulis di depan rumah",
        ],
    },
    {
        kategori: "penyebaran data pribadi",
        frasa: [
            "sebar",
            "sebarkan",
            "bagikan data",
            "bagikan foto",
            "foto ktp",
            "ktp anda saya",
            "unggah ke media",
            "grup keluarga",
            "grup whatsapp warga",
        ],
    },
    {
        kategori: "kontak pihak tidak berwenang",
        frasa: [
            "kontak darurat",
            "keluarga anda",
            "orang tua anda",
            "hubungi atasan",
            "kantor anda",
            "teman kerja",
            "tetangga",
        ],
    },
    {
        kategori: "klaim hukum palsu",
        frasa: [
            "polisi",
            "penjara",
            "pidana",
            "dipenjara",
            "disita negara",
            "blacklist bi",
            "blacklist slik",
            "sita rumah",
            "sandera",
        ],
    },
    {
        kategori: "janji menyesatkan",
        frasa: [
            "pasti akan disetujui",
            "dijamin cair",
            "bebas denda selamanya",
            "tidak akan ditagih",
            "tidak ada konsekuensi",
            "denda berhenti sendiri",
        ],
    },
];
/** Panjang maksimum satu pesan penagihan (karakter). */
exports.PANJANG_MAKS_PESAN = 700;
/**
 * Periksa satu pesan penagihan sebelum dicatat/dikirim.
 *
 * Kosong dan kepanjangan juga ditolak: pesan kosong bukan komunikasi, dan pesan
 * sangat panjang sulit ditinjau petugas lain.
 */
function periksaPesanPenagihan(teks) {
    var bersih = teks.trim();
    if (bersih === "") {
        return { ok: false, temuan: [], alasan: "Isi pesan tidak boleh kosong." };
    }
    if (bersih.length > exports.PANJANG_MAKS_PESAN) {
        return {
            ok: false,
            temuan: [],
            alasan: "Isi pesan maksimal ".concat(exports.PANJANG_MAKS_PESAN, " karakter."),
        };
    }
    var kecil = bersih.toLowerCase();
    var temuan = [];
    for (var _i = 0, FRASA_TERLARANG_1 = FRASA_TERLARANG; _i < FRASA_TERLARANG_1.length; _i++) {
        var kelompok = FRASA_TERLARANG_1[_i];
        for (var _a = 0, _b = kelompok.frasa; _a < _b.length; _a++) {
            var frasa = _b[_a];
            if (kecil.includes(frasa))
                temuan.push({ kategori: kelompok.kategori, frasa: frasa });
        }
    }
    if (temuan.length === 0)
        return { ok: true };
    var kategori = __spreadArray([], new Set(temuan.map(function (t) { return t.kategori; })), true).join(", ");
    return {
        ok: false,
        temuan: temuan,
        alasan: "Pesan ditolak \u2014 terdeteksi ".concat(kategori, ". Penagihan PINDAI tidak boleh memuat ancaman, intimidasi, penyebaran data pribadi, kontak pihak lain, klaim hukum, atau janji yang menyesatkan."),
    };
}
/** Nada pesan yang disarankan, dipakai template netral di bawah. */
exports.CATATAN_PESAN_NETRAL = "Catatan aplikasi PINDAI adalah pembukuan internal, bukan tagihan resmi atau bukti mutasi.";
/**
 * Susun pesan pengingat NETRAL yang pasti lolos `periksaPesanPenagihan`:
 * menyebut posisi catatan apa adanya, menyebut nominal dari ledger internal,
 * menawarkan waktu pembayaran, tanpa ancaman maupun janji.
 */
function pesanPengingatNetral(data) {
    var tenggat = data.tenggatTawaran === undefined || data.tenggatTawaran.trim() === ""
        ? ""
        : " Kami dapat mencatat kesepakatan pembayaran sampai ".concat(data.tenggatTawaran, ".");
    return ("Halo ".concat(data.nama, ", ini tim PINDAI mengenai catatan aplikasi ").concat(data.nomorReferensi, ". ") +
        "Catatan internal menampilkan tanggal acuan terlewati ".concat(data.hariTerlambat, " hari dengan kewajiban ") +
        "".concat(rupiahAman(data.totalKewajiban), ". ").concat(exports.CATATAN_PESAN_NETRAL) +
        "".concat(tenggat, " Bila Anda butuh penyesuaian waktu, silakan hubungi kami lewat kanal resmi PINDAI. Terima kasih."));
}
function rupiahAman(nilai) {
    if (!Number.isSafeInteger(nilai))
        return "—";
    return "Rp ".concat(nilai.toLocaleString("id-ID"));
}
// =====================================================================
// Penyamaran kontak & informasi finansial
// =====================================================================
var BULAT = "•";
/**
 * Samarkan nomor telepon untuk daftar kerja: sisakan awalan (kode negara/
 * operator) dan 4 digit terakhir agar petugas masih bisa mencocokkan nomor yang
 * dihubungi, tanpa menampilkan nomor utuh di layar bersama.
 */
function maskNomorTelepon(nomor) {
    var bersih = (nomor !== null && nomor !== void 0 ? nomor : "").replace(/\D/g, "");
    if (bersih === "")
        return null;
    if (bersih.length <= 8) {
        var kepala_1 = bersih.slice(0, 2);
        return kepala_1 + BULAT.repeat(Math.max(bersih.length - kepala_1.length, 0));
    }
    var kepala = bersih.slice(0, 5);
    var ekor = bersih.slice(-4);
    return "".concat(kepala).concat(BULAT.repeat(bersih.length - kepala.length - ekor.length)).concat(ekor);
}
/** Samarkan nomor rekening: hanya 4 digit terakhir yang terlihat. */
function maskRekening(nomor) {
    var bersih = (nomor !== null && nomor !== void 0 ? nomor : "").replace(/\D/g, "");
    if (bersih === "")
        return null;
    if (bersih.length <= 4)
        return BULAT.repeat(bersih.length);
    return BULAT.repeat(bersih.length - 4) + bersih.slice(-4);
}
// =====================================================================
// Status kasus, eskalasi, tindakan
// =====================================================================
exports.STATUS_KASUS = [
    "baru",
    "ditugaskan",
    "ditangani",
    "janji_aktif",
    "selesai",
    "ditutup",
];
exports.LABEL_STATUS_KASUS = {
    baru: "Baru",
    ditugaskan: "Ditugaskan",
    ditangani: "Ditangani",
    janji_aktif: "Janji aktif",
    selesai: "Selesai",
    ditutup: "Ditutup",
};
/** Status yang menghentikan penanganan aktif. */
exports.STATUS_KASUS_TERTUTUP = ["selesai", "ditutup"];
/**
 * Perpindahan status kasus yang diizinkan. Aturan ditulis eksplisit supaya
 * dapat ditinjau (dan diuji), bukan tersebar sebagai `if` di dalam komponen.
 * Kasus yang sudah selesai/ditutup boleh dibuka kembali ke `ditangani` bila
 * keadaannya berubah (mis. janji dibatalkan) — tercatat di audit.
 */
var TRANSISI_KASUS = {
    baru: ["ditugaskan", "ditangani", "ditutup"],
    ditugaskan: ["ditangani", "janji_aktif", "ditutup"],
    ditangani: ["janji_aktif", "selesai", "ditutup", "ditugaskan"],
    janji_aktif: ["ditangani", "selesai", "ditutup"],
    selesai: ["ditangani"],
    ditutup: ["ditangani"],
};
function validasiTransisiKasus(dari, ke) {
    var asal = exports.STATUS_KASUS.includes(dari) ? dari : null;
    var tujuan = exports.STATUS_KASUS.includes(ke) ? ke : null;
    if (asal === null || tujuan === null) {
        return { ok: false, alasan: "Status kasus \"".concat(dari, " \u2192 ").concat(ke, "\" tidak dikenali.") };
    }
    if (asal === tujuan) {
        return { ok: false, alasan: "Kasus sudah berstatus ".concat(exports.LABEL_STATUS_KASUS[tujuan], ".") };
    }
    if (!TRANSISI_KASUS[asal].includes(tujuan)) {
        return {
            ok: false,
            alasan: "Perpindahan ".concat(exports.LABEL_STATUS_KASUS[asal], " \u2192 ").concat(exports.LABEL_STATUS_KASUS[tujuan], " tidak diizinkan."),
        };
    }
    return { ok: true };
}
exports.JENIS_TINDAKAN = [
    "pengingat",
    "panggilan",
    "pesan_tertulis",
    "kunjungan",
    "kesepakatan",
    "lainnya",
];
exports.LABEL_JENIS_TINDAKAN = {
    pengingat: "Pengingat",
    panggilan: "Panggilan",
    pesan_tertulis: "Pesan tertulis",
    kunjungan: "Kunjungan tercatat",
    kesepakatan: "Kesepakatan",
    lainnya: "Lainnya",
};
exports.SALURAN_TINDAKAN = [
    "whatsapp",
    "telepon",
    "sms",
    "tatap_muka",
    "surat",
    "sistem",
];
exports.LABEL_SALURAN_TINDAKAN = {
    whatsapp: "WhatsApp",
    telepon: "Telepon",
    sms: "SMS",
    tatap_muka: "Tatap muka",
    surat: "Surat",
    sistem: "Catatan sistem",
};
/**
 * Saluran yang benar-benar MENGHUBUNGI nasabah. Hanya saluran ini yang tunduk
 * pada jendela jam kontak; "sistem" dan "surat" adalah pencatatan internal.
 */
exports.SALURAN_KONTAK_LANGSUNG = [
    "whatsapp",
    "telepon",
    "sms",
    "tatap_muka",
];
exports.HASIL_TINDAKAN = [
    "terhubung",
    "tidak_terhubung",
    "nomor_salah",
    "bersedia_bayar",
    "minta_waktu",
    "menolak",
    "janji_dibuat",
    "tidak_relevan",
];
exports.LABEL_HASIL_TINDAKAN = {
    terhubung: "Terhubung",
    tidak_terhubung: "Tidak terhubung",
    nomor_salah: "Nomor salah",
    bersedia_bayar: "Bersedia membayar",
    minta_waktu: "Minta waktu",
    menolak: "Menolak",
    janji_dibuat: "Janji dibuat",
    tidak_relevan: "Tidak relevan",
};
exports.URUTAN_ESKALASI = [
    {
        tingkat: 1,
        label: "Pengingat berjadwal",
        keterangan: "Pengingat berkala melalui kanal resmi.",
        butuhPersetujuan: false,
    },
    {
        tingkat: 2,
        label: "Kontak terarah",
        keterangan: "Panggilan/pesan terjadwal oleh petugas yang ditugaskan.",
        butuhPersetujuan: false,
    },
    {
        tingkat: 3,
        label: "Penawaran restrukturisasi",
        keterangan: "Menawarkan penyesuaian waktu/jumlah pembayaran kepada peminjam.",
        butuhPersetujuan: true,
    },
    {
        tingkat: 4,
        label: "Penanganan khusus",
        keterangan: "Kasus ditangani petugas khusus dengan persetujuan penyelia; tetap tanpa tekanan maupun tindakan di luar prosedur.",
        butuhPersetujuan: true,
    },
];
/** Tingkat eskalasi minimal yang disarankan untuk sebuah tahap tunggakan. */
function eskalasiDisarankan(kode) {
    switch (kode) {
        case "lancar":
            return 0;
        case "ringan":
            return 1;
        case "sedang":
            return 2;
        case "berat":
            return 3;
        default:
            return 4;
    }
}
/** Tingkat eskalasi berikutnya; `null` bila sudah di tingkat tertinggi. */
function eskalasiBerikutnya(tingkatSekarang) {
    var _a;
    var berikut = Math.floor(tingkatSekarang) + 1;
    return (_a = exports.URUTAN_ESKALASI.find(function (e) { return e.tingkat === berikut; })) !== null && _a !== void 0 ? _a : null;
}
function tingkatEskalasi(tingkat) {
    var _a;
    return (_a = exports.URUTAN_ESKALASI.find(function (e) { return e.tingkat === Math.floor(tingkat); })) !== null && _a !== void 0 ? _a : null;
}
// =====================================================================
// Janji pembayaran, penyelesaian, pengaduan
// =====================================================================
exports.STATUS_JANJI = ["aktif", "dipenuhi", "dilanggar", "dibatalkan"];
exports.LABEL_STATUS_JANJI = {
    aktif: "Aktif",
    dipenuhi: "Dipenuhi",
    dilanggar: "Dilanggar",
    dibatalkan: "Dibatalkan",
};
/** Jarak maksimum janji ke depan (hari). Janji setahun ke depan tidak bermakna. */
exports.JANJI_MAKS_HARI = 120;
/** Janji pembayaran tidak boleh mundur lebih dari ini dari hari ini. */
exports.JANJI_MAKS_MUNDUR_HARI = 7;
function validasiJanjiBayar(janji, sekarang) {
    if (!Number.isSafeInteger(janji.nominal) || janji.nominal <= 0) {
        return { ok: false, alasan: "Nominal janji harus rupiah bulat positif." };
    }
    if (!Number.isSafeInteger(janji.tanggalJanji) || janji.tanggalJanji <= 0) {
        return { ok: false, alasan: "Tanggal janji tidak valid." };
    }
    var HARI_MS = 86400000;
    if (janji.tanggalJanji < sekarang - exports.JANJI_MAKS_MUNDUR_HARI * HARI_MS) {
        return {
            ok: false,
            alasan: "Tanggal janji tidak boleh lebih dari ".concat(exports.JANJI_MAKS_MUNDUR_HARI, " hari ke belakang."),
        };
    }
    if (janji.tanggalJanji > sekarang + exports.JANJI_MAKS_HARI * HARI_MS) {
        return {
            ok: false,
            alasan: "Tanggal janji tidak boleh lebih dari ".concat(exports.JANJI_MAKS_HARI, " hari ke depan."),
        };
    }
    return { ok: true };
}
exports.JENIS_PENYELESAIAN = [
    "pelunasan_penuh",
    "pelunasan_sebagian",
    "restrukturisasi",
    "keringanan_denda",
    "penyelesaian_sengketa",
];
exports.LABEL_JENIS_PENYELESAIAN = {
    pelunasan_penuh: "Pelunasan penuh",
    pelunasan_sebagian: "Pelunasan sebagian",
    restrukturisasi: "Restrukturisasi",
    keringanan_denda: "Keringanan denda",
    penyelesaian_sengketa: "Penyelesaian sengketa",
};
/**
 * Periksa satu catatan penyelesaian.
 *
 * Catatan ini HANYA mencatat kesepakatan/keputusan — tidak memindahkan uang dan
 * tidak mengubah ledger. Karena itu nominalnya diperiksa terhadap kewajiban yang
 * tercatat: melunasi "lebih dari kewajiban" hampir selalu salah input, dan
 * nominal nol tidak menyelesaikan apa pun (kecuali keringanan denda, yang
 * memang bisa bernilai sebagian dari denda).
 */
function validasiPenyelesaian(data, totalKewajiban) {
    if (!Number.isSafeInteger(data.nominal) || data.nominal < 0) {
        return { ok: false, alasan: "Nominal penyelesaian harus rupiah bulat, tidak negatif." };
    }
    if (data.jenis === "penyelesaian_sengketa" || data.jenis === "keringanan_denda") {
        return { ok: true };
    }
    if (data.jenis === "restrukturisasi") {
        return { ok: true };
    }
    if (data.nominal <= 0) {
        return {
            ok: false,
            alasan: "Pelunasan penuh/sebagian memerlukan nominal lebih dari nol.",
        };
    }
    if (data.jenis === "pelunasan_penuh" && Number.isSafeInteger(totalKewajiban) && data.nominal < totalKewajiban) {
        return {
            ok: false,
            alasan: "Pelunasan penuh tidak boleh kurang dari total kewajiban pada ledger internal.",
        };
    }
    return { ok: true };
}
exports.STATUS_PEMBAYARAN = ["belum_bayar", "bayar_sebagian", "lunas_dicatat"];
exports.LABEL_STATUS_PEMBAYARAN = {
    belum_bayar: "Belum bayar",
    bayar_sebagian: "Bayar sebagian",
    lunas_dicatat: "Lunas dicatat",
};
/**
 * Perbarui status pembayaran pada KASUS penagihan (bukan pada pinjaman).
 *
 * Status pinjaman & ledger tetap diubah lewat jalur pinjaman/pembayaran yang
 * sudah ada; modul penagihan hanya mencatat keadaan yang dilaporkan petugas.
 * Karena itu namanya "dicatat" — klaim lunas di sini bukan bukti transfer.
 */
function validasiPembayaran(data, totalKewajiban) {
    if (!Number.isSafeInteger(data.nominal) || data.nominal < 0) {
        return { ok: false, alasan: "Nominal pembayaran harus rupiah bulat, tidak negatif." };
    }
    if (data.status === "belum_bayar" && data.nominal !== 0) {
        return { ok: false, alasan: "Status Belum bayar tidak boleh disertai nominal." };
    }
    if (data.status !== "belum_bayar" && data.nominal <= 0) {
        return { ok: false, alasan: "Nominal pembayaran wajib diisi lebih dari nol." };
    }
    if (data.status === "lunas_dicatat" &&
        Number.isSafeInteger(totalKewajiban) &&
        data.nominal < totalKewajiban) {
        return {
            ok: false,
            alasan: "Nominal kurang dari total kewajiban ledger — catat sebagai bayar sebagian, bukan lunas.",
        };
    }
    return { ok: true };
}
exports.STATUS_PENGADUAN = ["baru", "ditinjau", "selesai", "ditolak"];
exports.LABEL_STATUS_PENGADUAN = {
    baru: "Baru",
    ditinjau: "Ditinjau",
    selesai: "Selesai",
    ditolak: "Ditolak",
};
exports.KATEGORI_PENGADUAN = [
    "salah_tagih",
    "salah_nominal",
    "petugas_tidak_sesuai_prosedur",
    "permintaan_penjelasan",
    "kesulitan_bayar",
    "lainnya",
];
exports.LABEL_KATEGORI_PENGADUAN = {
    salah_tagih: "Salah tagih",
    salah_nominal: "Salah nominal",
    petugas_tidak_sesuai_prosedur: "Petugas tidak sesuai prosedur",
    permintaan_penjelasan: "Permintaan penjelasan",
    kesulitan_bayar: "Kesulitan bayar",
    lainnya: "Lainnya",
};
exports.PANJANG_MIN_PENGADUAN = 10;
exports.PANJANG_MAKS_PENGADUAN = 1200;
function validasiPengaduan(isi) {
    var bersih = isi.trim();
    if (bersih.length < exports.PANJANG_MIN_PENGADUAN) {
        return {
            ok: false,
            alasan: "Uraian pengaduan minimal ".concat(exports.PANJANG_MIN_PENGADUAN, " karakter agar dapat ditindaklanjuti."),
        };
    }
    if (bersih.length > exports.PANJANG_MAKS_PENGADUAN) {
        return {
            ok: false,
            alasan: "Uraian pengaduan maksimal ".concat(exports.PANJANG_MAKS_PENGADUAN, " karakter."),
        };
    }
    return { ok: true };
}
/** Perpindahan status pengaduan yang diizinkan. */
var TRANSISI_PENGADUAN = {
    baru: ["ditinjau", "ditolak"],
    ditinjau: ["selesai", "ditolak"],
    selesai: ["ditinjau"],
    ditolak: ["ditinjau"],
};
function validasiTransisiPengaduan(dari, ke) {
    var asal = exports.STATUS_PENGADUAN.includes(dari)
        ? dari
        : null;
    var tujuan = exports.STATUS_PENGADUAN.includes(ke)
        ? ke
        : null;
    if (asal === null || tujuan === null) {
        return { ok: false, alasan: "Status pengaduan \"".concat(dari, " \u2192 ").concat(ke, "\" tidak dikenali.") };
    }
    if (asal === tujuan) {
        return { ok: false, alasan: "Pengaduan sudah berstatus ".concat(exports.LABEL_STATUS_PENGADUAN[tujuan], ".") };
    }
    if (!TRANSISI_PENGADUAN[asal].includes(tujuan)) {
        return {
            ok: false,
            alasan: "Perpindahan ".concat(exports.LABEL_STATUS_PENGADUAN[asal], " \u2192 ").concat(exports.LABEL_STATUS_PENGADUAN[tujuan], " tidak diizinkan."),
        };
    }
    return { ok: true };
}
/**
 * Ringkas laporan dari daftar kasus. Semua angka berasal dari data yang
 * diberikan pemanggil — tidak ada angka yang dikarang, dan kasus tanpa petugas
 * dihitung terpisah supaya "belum ditugaskan" tidak menyamar sebagai beban
 * seorang petugas.
 */
function ringkasLaporanPenagihan(kasus) {
    var _a;
    var perTahap = {
        lancar: 0,
        ringan: 0,
        sedang: 0,
        berat: 0,
        macet: 0,
    };
    var petaPetugas = new Map();
    var belumDitugaskan = 0;
    var kasusAktif = 0;
    var janjiAktif = 0;
    var janjiDipenuhi = 0;
    var janjiDilanggar = 0;
    var totalSisaKewajiban = 0;
    var tanpaTindakan = 0;
    for (var _i = 0, kasus_1 = kasus; _i < kasus_1.length; _i++) {
        var k = kasus_1[_i];
        perTahap[k.tahap] += 1;
        if (k.petugasLabel === null || k.petugasLabel.trim() === "")
            belumDitugaskan += 1;
        else
            petaPetugas.set(k.petugasLabel, ((_a = petaPetugas.get(k.petugasLabel)) !== null && _a !== void 0 ? _a : 0) + 1);
        if (!exports.STATUS_KASUS_TERTUTUP.includes(k.statusKasus))
            kasusAktif += 1;
        if (Number.isSafeInteger(k.sisaKewajiban) && k.sisaKewajiban > 0) {
            totalSisaKewajiban += k.sisaKewajiban;
        }
        if (k.jumlahTindakan === 0)
            tanpaTindakan += 1;
        if (k.janji !== null) {
            if (k.janji.status === "aktif")
                janjiAktif += 1;
            if (k.janji.status === "dipenuhi")
                janjiDipenuhi += 1;
            if (k.janji.status === "dilanggar")
                janjiDilanggar += 1;
        }
    }
    return {
        totalKasus: kasus.length,
        perTahap: perTahap,
        perPetugas: __spreadArray([], petaPetugas.entries(), true).map(function (_a) {
            var petugas = _a[0], jumlah = _a[1];
            return ({ petugas: petugas, jumlah: jumlah });
        })
            .sort(function (a, b) { return b.jumlah - a.jumlah || a.petugas.localeCompare(b.petugas); }),
        belumDitugaskan: belumDitugaskan,
        kasusAktif: kasusAktif,
        janjiAktif: janjiAktif,
        janjiDipenuhi: janjiDipenuhi,
        janjiDilanggar: janjiDilanggar,
        totalSisaKewajiban: totalSisaKewajiban,
        tanpaTindakan: tanpaTindakan,
    };
}
