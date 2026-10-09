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

/** Ambang hari (DPD) yang memisahkan tahap tunggakan. Dapat diubah admin. */
export type AmbangTunggakan = {
  /** Batas atas tahap "ringan" (hari). */
  ringan: number;
  /** Batas atas tahap "sedang" (hari). */
  sedang: number;
  /** Batas atas tahap "berat" (hari). Di atas ini masuk "macet". */
  berat: number;
};

/**
 * Ambang bawaan. Dipilih konservatif: keterlambatan 1–7 hari masih bisa
 * diselesaikan lewat pengingat, 31–90 hari butuh penanganan terarah, dan di atas
 * 90 hari sudah masuk penanganan khusus (bukan otomatis tindakan hukum).
 */
export const AMBANG_TUNGGAKAN_DEFAULT: AmbangTunggakan = {
  ringan: 7,
  sedang: 30,
  berat: 90,
};

/** Batas nilai ambang yang boleh disimpan admin. */
export const AMBANG_TUNGGAKAN_BATAS = { min: 1, maks: 365 } as const;

/** Jam kontak yang diizinkan (waktu setempat WIB, 0–23). */
export type JamKontak = {
  mulai: number;
  selesai: number;
};

/**
 * Jendela kontak bawaan 08:00–20:00. Di luar jam ini petugas tidak menghubungi
 * nasabah; tindakan yang dicoba di luar jendela ditolak server, bukan sekadar
 * diingatkan di UI.
 */
export const JAM_KONTAK_DEFAULT: JamKontak = { mulai: 8, selesai: 20 };

/** Offset WIB terhadap UTC (jam) — server menyimpan waktu epoch UTC. */
export const OFFSET_WIB_JAM = 7;

// =====================================================================
// Klasifikasi tunggakan
// =====================================================================

export type KodeTahapTunggakan =
  | "lancar"
  | "ringan"
  | "sedang"
  | "berat"
  | "macet";

export type TahapTunggakan = {
  kode: KodeTahapTunggakan;
  label: string;
  /** 0 = tidak terlambat; makin besar makin mendesak. */
  tingkat: number;
  /** Penjelasan satu kalimat untuk petugas. */
  keterangan: string;
  /** Petugas perlu menindak hari ini. */
  perluTindakan: boolean;
};

/** Urutan tahap dari paling ringan ke paling berat — dipakai UI & laporan. */
export const TAHAP_TUNGGAKAN: readonly TahapTunggakan[] = [
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
export function tahapDariKode(kode: string): TahapTunggakan | null {
  return TAHAP_TUNGGAKAN.find((t) => t.kode === kode) ?? null;
}

/**
 * Klasifikasi satu tunggakan dari jumlah hari terlambat. Negatif/NaN dianggap
 * lancar — data warisan tidak boleh menghasilkan tahap yang mengada-ada.
 */
export function klasifikasiTunggakan(
  hariTerlambat: number,
  ambang: AmbangTunggakan = AMBANG_TUNGGAKAN_DEFAULT,
): TahapTunggakan {
  const hari = Number.isFinite(hariTerlambat) ? Math.floor(hariTerlambat) : 0;
  if (hari <= 0) return tahapDariKode("lancar") as TahapTunggakan;
  if (hari <= ambang.ringan) return tahapDariKode("ringan") as TahapTunggakan;
  if (hari <= ambang.sedang) return tahapDariKode("sedang") as TahapTunggakan;
  if (hari <= ambang.berat) return tahapDariKode("berat") as TahapTunggakan;
  return tahapDariKode("macet") as TahapTunggakan;
}

export type HasilValidasi = { ok: true } | { ok: false; alasan: string };

/**
 * Ambang harus bilangan bulat positif dan MENAIK dari ringan → sedang → berat.
 * Tanpa urutan yang naik, satu nilai tidak akan pernah tercapai dan tahapnya
 * hilang diam-diam.
 */
export function validasiAmbang(ambang: AmbangTunggakan): HasilValidasi {
  const nilai = [ambang.ringan, ambang.sedang, ambang.berat];
  if (
    nilai.some(
      (n) =>
        !Number.isSafeInteger(n) ||
        n < AMBANG_TUNGGAKAN_BATAS.min ||
        n > AMBANG_TUNGGAKAN_BATAS.maks,
    )
  ) {
    return {
      ok: false,
      alasan: `Setiap ambang tunggakan harus bilangan bulat ${AMBANG_TUNGGAKAN_BATAS.min}–${AMBANG_TUNGGAKAN_BATAS.maks} hari.`,
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

export function validasiJamKontak(jam: JamKontak): HasilValidasi {
  const sah = (n: number) => Number.isSafeInteger(n) && n >= 0 && n <= 23;
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
export function jamWIB(waktuMs: number): number {
  return new Date(waktuMs + OFFSET_WIB_JAM * 3_600_000).getUTCHours();
}

/** Apakah `jam` berada di dalam jendela kontak (mulai ≤ jam < selesai). */
export function dalamJamKontak(
  jam: number,
  jamKontak: JamKontak = JAM_KONTAK_DEFAULT,
): boolean {
  if (!Number.isSafeInteger(jam)) return false;
  return jam >= jamKontak.mulai && jam < jamKontak.selesai;
}

/** Apakah satu tindakan outreach boleh dilakukan pada waktu ini (waktu WIB). */
export function bolehKontakSekarang(
  waktuMs: number,
  jamKontak: JamKontak = JAM_KONTAK_DEFAULT,
): boolean {
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
export const PIHAK_DIHUBUNGI = ["peminjam"] as const;
export type PihakDihubungi = (typeof PIHAK_DIHUBUNGI)[number];

/** Kategori pihak yang selalu ditolak, beserta alasan siap tampil. */
const PIHAK_DITOLAK: Record<string, string> = {
  kontak_darurat:
    "Kontak darurat tidak boleh dihubungi untuk penagihan — data itu hanya untuk keadaan darurat.",
  keluarga:
    "Keluarga peminjam tidak boleh dihubungi; penagihan hanya kepada peminjam sendiri.",
  atasan:
    "Atasan atau tempat kerja peminjam tidak boleh dihubungi untuk penagihan.",
  tetangga:
    "Tetangga atau pihak lain di sekitar peminjam tidak boleh dihubungi.",
  pihak_lain:
    "Hanya peminjam sendiri yang boleh dihubungi. Menghubungi pihak lain berarti menyebarkan data pribadi.",
};

export function bolehHubungiPihak(pihak: string): HasilValidasi {
  const kunci = pihak.trim().toLowerCase();
  if ((PIHAK_DIHUBUNGI as readonly string[]).includes(kunci)) return { ok: true };
  const alasan = PIHAK_DITOLAK[kunci];
  if (alasan !== undefined) return { ok: false, alasan };
  return {
    ok: false,
    alasan: `Pihak "${pihak}" tidak dikenali dan tidak boleh dihubungi untuk penagihan.`,
  };
}

// =====================================================================
// Penjaga isi pesan
// =====================================================================

/** Kategori pelanggaran pesan, untuk ditampilkan ke petugas. */
export type TemuanPesan = {
  kategori: string;
  /** Frasa yang memicunya (dipotong apa adanya). */
  frasa: string;
};

/**
 * Daftar frasa yang membuat sebuah pesan TIDAK boleh dikirim. Sengaja berupa
 * frasa konkret (bukan analisis semantik) supaya perilakunya dapat diprediksi,
 * diuji, dan dijelaskan ke petugas — bukan kotak hitam.
 *
 * Yang ditolak: ancaman kekerasan, intimidasi/perendahan, penyebaran data
 * pribadi, kontak ke pihak ketiga, klaim hukum palsu, dan janji menyesatkan.
 */
const FRASA_TERLARANG: readonly { kategori: string; frasa: readonly string[] }[] = [
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
export const PANJANG_MAKS_PESAN = 700;

/**
 * Periksa satu pesan penagihan sebelum dicatat/dikirim.
 *
 * Kosong dan kepanjangan juga ditolak: pesan kosong bukan komunikasi, dan pesan
 * sangat panjang sulit ditinjau petugas lain.
 */
export function periksaPesanPenagihan(
  teks: string,
): { ok: true } | { ok: false; temuan: TemuanPesan[]; alasan: string } {
  const bersih = teks.trim();
  if (bersih === "") {
    return { ok: false, temuan: [], alasan: "Isi pesan tidak boleh kosong." };
  }
  if (bersih.length > PANJANG_MAKS_PESAN) {
    return {
      ok: false,
      temuan: [],
      alasan: `Isi pesan maksimal ${PANJANG_MAKS_PESAN} karakter.`,
    };
  }
  const kecil = bersih.toLowerCase();
  const temuan: TemuanPesan[] = [];
  for (const kelompok of FRASA_TERLARANG) {
    for (const frasa of kelompok.frasa) {
      if (kecil.includes(frasa)) temuan.push({ kategori: kelompok.kategori, frasa });
    }
  }
  if (temuan.length === 0) return { ok: true };
  const kategori = [...new Set(temuan.map((t) => t.kategori))].join(", ");
  return {
    ok: false,
    temuan,
    alasan: `Pesan ditolak — terdeteksi ${kategori}. Penagihan PINDAI tidak boleh memuat ancaman, intimidasi, penyebaran data pribadi, kontak pihak lain, klaim hukum, atau janji yang menyesatkan.`,
  };
}

/** Nada pesan yang disarankan, dipakai template netral di bawah. */
export const CATATAN_PESAN_NETRAL =
  "Catatan aplikasi PINDAI adalah pembukuan internal, bukan tagihan resmi atau bukti mutasi.";

/**
 * Susun pesan pengingat NETRAL yang pasti lolos `periksaPesanPenagihan`:
 * menyebut posisi catatan apa adanya, menyebut nominal dari ledger internal,
 * menawarkan waktu pembayaran, tanpa ancaman maupun janji.
 */
export function pesanPengingatNetral(data: {
  nama: string;
  nomorReferensi: string;
  hariTerlambat: number;
  /** Total kewajiban menurut ledger internal (rupiah). */
  totalKewajiban: number;
  /** Batas waktu yang ditawarkan petugas, teks siap tampil. */
  tenggatTawaran?: string;
}): string {
  const tenggat =
    data.tenggatTawaran === undefined || data.tenggatTawaran.trim() === ""
      ? ""
      : ` Kami dapat mencatat kesepakatan pembayaran sampai ${data.tenggatTawaran}.`;
  return (
    `Halo ${data.nama}, ini tim PINDAI mengenai catatan aplikasi ${data.nomorReferensi}. ` +
    `Catatan internal menampilkan tanggal acuan terlewati ${data.hariTerlambat} hari dengan kewajiban ` +
    `${rupiahAman(data.totalKewajiban)}. ${CATATAN_PESAN_NETRAL}` +
    `${tenggat} Bila Anda butuh penyesuaian waktu, silakan hubungi kami lewat kanal resmi PINDAI. Terima kasih.`
  );
}

function rupiahAman(nilai: number): string {
  if (!Number.isSafeInteger(nilai)) return "—";
  return `Rp ${nilai.toLocaleString("id-ID")}`;
}

// =====================================================================
// Penyamaran kontak & informasi finansial
// =====================================================================

const BULAT = "•";

/**
 * Samarkan nomor telepon untuk daftar kerja: sisakan awalan (kode negara/
 * operator) dan 4 digit terakhir agar petugas masih bisa mencocokkan nomor yang
 * dihubungi, tanpa menampilkan nomor utuh di layar bersama.
 */
export function maskNomorTelepon(nomor: string | null | undefined): string | null {
  const bersih = (nomor ?? "").replace(/\D/g, "");
  if (bersih === "") return null;
  if (bersih.length <= 8) {
    const kepala = bersih.slice(0, 2);
    return kepala + BULAT.repeat(Math.max(bersih.length - kepala.length, 0));
  }
  const kepala = bersih.slice(0, 5);
  const ekor = bersih.slice(-4);
  return `${kepala}${BULAT.repeat(bersih.length - kepala.length - ekor.length)}${ekor}`;
}

/** Samarkan nomor rekening: hanya 4 digit terakhir yang terlihat. */
export function maskRekening(nomor: string | null | undefined): string | null {
  const bersih = (nomor ?? "").replace(/\D/g, "");
  if (bersih === "") return null;
  if (bersih.length <= 4) return BULAT.repeat(bersih.length);
  return BULAT.repeat(bersih.length - 4) + bersih.slice(-4);
}

// =====================================================================
// Status kasus, eskalasi, tindakan
// =====================================================================

export const STATUS_KASUS = [
  "baru",
  "ditugaskan",
  "ditangani",
  "janji_aktif",
  "selesai",
  "ditutup",
] as const;
export type StatusKasus = (typeof STATUS_KASUS)[number];

export const LABEL_STATUS_KASUS: Record<StatusKasus, string> = {
  baru: "Baru",
  ditugaskan: "Ditugaskan",
  ditangani: "Ditangani",
  janji_aktif: "Janji aktif",
  selesai: "Selesai",
  ditutup: "Ditutup",
};

/** Status yang menghentikan penanganan aktif. */
export const STATUS_KASUS_TERTUTUP: readonly StatusKasus[] = ["selesai", "ditutup"];

/**
 * Perpindahan status kasus yang diizinkan. Aturan ditulis eksplisit supaya
 * dapat ditinjau (dan diuji), bukan tersebar sebagai `if` di dalam komponen.
 * Kasus yang sudah selesai/ditutup boleh dibuka kembali ke `ditangani` bila
 * keadaannya berubah (mis. janji dibatalkan) — tercatat di audit.
 */
const TRANSISI_KASUS: Record<StatusKasus, readonly StatusKasus[]> = {
  baru: ["ditugaskan", "ditangani", "ditutup"],
  ditugaskan: ["ditangani", "janji_aktif", "ditutup"],
  ditangani: ["janji_aktif", "selesai", "ditutup", "ditugaskan"],
  janji_aktif: ["ditangani", "selesai", "ditutup"],
  selesai: ["ditangani"],
  ditutup: ["ditangani"],
};

export function validasiTransisiKasus(dari: string, ke: string): HasilValidasi {
  const asal = (STATUS_KASUS as readonly string[]).includes(dari) ? (dari as StatusKasus) : null;
  const tujuan = (STATUS_KASUS as readonly string[]).includes(ke) ? (ke as StatusKasus) : null;
  if (asal === null || tujuan === null) {
    return { ok: false, alasan: `Status kasus "${dari} → ${ke}" tidak dikenali.` };
  }
  if (asal === tujuan) {
    return { ok: false, alasan: `Kasus sudah berstatus ${LABEL_STATUS_KASUS[tujuan]}.` };
  }
  if (!TRANSISI_KASUS[asal].includes(tujuan)) {
    return {
      ok: false,
      alasan: `Perpindahan ${LABEL_STATUS_KASUS[asal]} → ${LABEL_STATUS_KASUS[tujuan]} tidak diizinkan.`,
    };
  }
  return { ok: true };
}

export const JENIS_TINDAKAN = [
  "pengingat",
  "panggilan",
  "pesan_tertulis",
  "kunjungan",
  "kesepakatan",
  "lainnya",
] as const;
export type JenisTindakan = (typeof JENIS_TINDAKAN)[number];

export const LABEL_JENIS_TINDAKAN: Record<JenisTindakan, string> = {
  pengingat: "Pengingat",
  panggilan: "Panggilan",
  pesan_tertulis: "Pesan tertulis",
  kunjungan: "Kunjungan tercatat",
  kesepakatan: "Kesepakatan",
  lainnya: "Lainnya",
};

export const SALURAN_TINDAKAN = [
  "whatsapp",
  "telepon",
  "sms",
  "tatap_muka",
  "surat",
  "sistem",
] as const;
export type SaluranTindakan = (typeof SALURAN_TINDAKAN)[number];

export const LABEL_SALURAN_TINDAKAN: Record<SaluranTindakan, string> = {
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
export const SALURAN_KONTAK_LANGSUNG: readonly SaluranTindakan[] = [
  "whatsapp",
  "telepon",
  "sms",
  "tatap_muka",
];

export const HASIL_TINDAKAN = [
  "terhubung",
  "tidak_terhubung",
  "nomor_salah",
  "bersedia_bayar",
  "minta_waktu",
  "menolak",
  "janji_dibuat",
  "tidak_relevan",
] as const;
export type HasilTindakan = (typeof HASIL_TINDAKAN)[number];

export const LABEL_HASIL_TINDAKAN: Record<HasilTindakan, string> = {
  terhubung: "Terhubung",
  tidak_terhubung: "Tidak terhubung",
  nomor_salah: "Nomor salah",
  bersedia_bayar: "Bersedia membayar",
  minta_waktu: "Minta waktu",
  menolak: "Menolak",
  janji_dibuat: "Janji dibuat",
  tidak_relevan: "Tidak relevan",
};

/**
 * Tingkat eskalasi 1–4. Eskalasi bukan tindakan hukum: tiga tingkat pertama
 * masih berupa peningkatan perhatian internal, dan tingkat 4 memindahkan kasus
 * ke penanganan khusus (petugas yang ditunjuk, dengan persetujuan penyelia).
 */
export type TingkatEskalasi = {
  tingkat: number;
  label: string;
  keterangan: string;
  /** Perlu persetujuan penyelia sebelum dijalankan. */
  butuhPersetujuan: boolean;
};

export const URUTAN_ESKALASI: readonly TingkatEskalasi[] = [
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
    keterangan:
      "Kasus ditangani petugas khusus dengan persetujuan penyelia; tetap tanpa tekanan maupun tindakan di luar prosedur.",
    butuhPersetujuan: true,
  },
];

/** Tingkat eskalasi minimal yang disarankan untuk sebuah tahap tunggakan. */
export function eskalasiDisarankan(kode: KodeTahapTunggakan): number {
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
export function eskalasiBerikutnya(tingkatSekarang: number): TingkatEskalasi | null {
  const berikut = Math.floor(tingkatSekarang) + 1;
  return URUTAN_ESKALASI.find((e) => e.tingkat === berikut) ?? null;
}

export function tingkatEskalasi(tingkat: number): TingkatEskalasi | null {
  return URUTAN_ESKALASI.find((e) => e.tingkat === Math.floor(tingkat)) ?? null;
}

// =====================================================================
// Janji pembayaran, penyelesaian, pengaduan
// =====================================================================

export const STATUS_JANJI = ["aktif", "dipenuhi", "dilanggar", "dibatalkan"] as const;
export type StatusJanji = (typeof STATUS_JANJI)[number];

export const LABEL_STATUS_JANJI: Record<StatusJanji, string> = {
  aktif: "Aktif",
  dipenuhi: "Dipenuhi",
  dilanggar: "Dilanggar",
  dibatalkan: "Dibatalkan",
};

/** Jarak maksimum janji ke depan (hari). Janji setahun ke depan tidak bermakna. */
export const JANJI_MAKS_HARI = 120;

/** Janji pembayaran tidak boleh mundur lebih dari ini dari hari ini. */
export const JANJI_MAKS_MUNDUR_HARI = 7;

export function validasiJanjiBayar(
  janji: { nominal: number; tanggalJanji: number },
  sekarang: number,
): HasilValidasi {
  if (!Number.isSafeInteger(janji.nominal) || janji.nominal <= 0) {
    return { ok: false, alasan: "Nominal janji harus rupiah bulat positif." };
  }
  if (!Number.isSafeInteger(janji.tanggalJanji) || janji.tanggalJanji <= 0) {
    return { ok: false, alasan: "Tanggal janji tidak valid." };
  }
  const HARI_MS = 86_400_000;
  if (janji.tanggalJanji < sekarang - JANJI_MAKS_MUNDUR_HARI * HARI_MS) {
    return {
      ok: false,
      alasan: `Tanggal janji tidak boleh lebih dari ${JANJI_MAKS_MUNDUR_HARI} hari ke belakang.`,
    };
  }
  if (janji.tanggalJanji > sekarang + JANJI_MAKS_HARI * HARI_MS) {
    return {
      ok: false,
      alasan: `Tanggal janji tidak boleh lebih dari ${JANJI_MAKS_HARI} hari ke depan.`,
    };
  }
  return { ok: true };
}

export const JENIS_PENYELESAIAN = [
  "pelunasan_penuh",
  "pelunasan_sebagian",
  "restrukturisasi",
  "keringanan_denda",
  "penyelesaian_sengketa",
] as const;
export type JenisPenyelesaian = (typeof JENIS_PENYELESAIAN)[number];

export const LABEL_JENIS_PENYELESAIAN: Record<JenisPenyelesaian, string> = {
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
export function validasiPenyelesaian(
  data: { jenis: JenisPenyelesaian; nominal: number },
  totalKewajiban: number,
): HasilValidasi {
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
      alasan:
        "Pelunasan penuh tidak boleh kurang dari total kewajiban pada ledger internal.",
    };
  }
  return { ok: true };
}

export const STATUS_PEMBAYARAN = ["belum_bayar", "bayar_sebagian", "lunas_dicatat"] as const;
export type StatusPembayaran = (typeof STATUS_PEMBAYARAN)[number];

export const LABEL_STATUS_PEMBAYARAN: Record<StatusPembayaran, string> = {
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
export function validasiPembayaran(
  data: { status: StatusPembayaran; nominal: number },
  totalKewajiban: number,
): HasilValidasi {
  if (!Number.isSafeInteger(data.nominal) || data.nominal < 0) {
    return { ok: false, alasan: "Nominal pembayaran harus rupiah bulat, tidak negatif." };
  }
  if (data.status === "belum_bayar" && data.nominal !== 0) {
    return { ok: false, alasan: "Status Belum bayar tidak boleh disertai nominal." };
  }
  if (data.status !== "belum_bayar" && data.nominal <= 0) {
    return { ok: false, alasan: "Nominal pembayaran wajib diisi lebih dari nol." };
  }
  if (
    data.status === "lunas_dicatat" &&
    Number.isSafeInteger(totalKewajiban) &&
    data.nominal < totalKewajiban
  ) {
    return {
      ok: false,
      alasan:
        "Nominal kurang dari total kewajiban ledger — catat sebagai bayar sebagian, bukan lunas.",
    };
  }
  return { ok: true };
}

export const STATUS_PENGADUAN = ["baru", "ditinjau", "selesai", "ditolak"] as const;
export type StatusPengaduan = (typeof STATUS_PENGADUAN)[number];

export const LABEL_STATUS_PENGADUAN: Record<StatusPengaduan, string> = {
  baru: "Baru",
  ditinjau: "Ditinjau",
  selesai: "Selesai",
  ditolak: "Ditolak",
};

export const KATEGORI_PENGADUAN = [
  "salah_tagih",
  "salah_nominal",
  "petugas_tidak_sesuai_prosedur",
  "permintaan_penjelasan",
  "kesulitan_bayar",
  "lainnya",
] as const;
export type KategoriPengaduan = (typeof KATEGORI_PENGADUAN)[number];

export const LABEL_KATEGORI_PENGADUAN: Record<KategoriPengaduan, string> = {
  salah_tagih: "Salah tagih",
  salah_nominal: "Salah nominal",
  petugas_tidak_sesuai_prosedur: "Petugas tidak sesuai prosedur",
  permintaan_penjelasan: "Permintaan penjelasan",
  kesulitan_bayar: "Kesulitan bayar",
  lainnya: "Lainnya",
};

export const PANJANG_MIN_PENGADUAN = 10;
export const PANJANG_MAKS_PENGADUAN = 1200;

export function validasiPengaduan(isi: string): HasilValidasi {
  const bersih = isi.trim();
  if (bersih.length < PANJANG_MIN_PENGADUAN) {
    return {
      ok: false,
      alasan: `Uraian pengaduan minimal ${PANJANG_MIN_PENGADUAN} karakter agar dapat ditindaklanjuti.`,
    };
  }
  if (bersih.length > PANJANG_MAKS_PENGADUAN) {
    return {
      ok: false,
      alasan: `Uraian pengaduan maksimal ${PANJANG_MAKS_PENGADUAN} karakter.`,
    };
  }
  return { ok: true };
}

/** Perpindahan status pengaduan yang diizinkan. */
const TRANSISI_PENGADUAN: Record<StatusPengaduan, readonly StatusPengaduan[]> = {
  baru: ["ditinjau", "ditolak"],
  ditinjau: ["selesai", "ditolak"],
  selesai: ["ditinjau"],
  ditolak: ["ditinjau"],
};

export function validasiTransisiPengaduan(dari: string, ke: string): HasilValidasi {
  const asal = (STATUS_PENGADUAN as readonly string[]).includes(dari)
    ? (dari as StatusPengaduan)
    : null;
  const tujuan = (STATUS_PENGADUAN as readonly string[]).includes(ke)
    ? (ke as StatusPengaduan)
    : null;
  if (asal === null || tujuan === null) {
    return { ok: false, alasan: `Status pengaduan "${dari} → ${ke}" tidak dikenali.` };
  }
  if (asal === tujuan) {
    return { ok: false, alasan: `Pengaduan sudah berstatus ${LABEL_STATUS_PENGADUAN[tujuan]}.` };
  }
  if (!TRANSISI_PENGADUAN[asal].includes(tujuan)) {
    return {
      ok: false,
      alasan: `Perpindahan ${LABEL_STATUS_PENGADUAN[asal]} → ${LABEL_STATUS_PENGADUAN[tujuan]} tidak diizinkan.`,
    };
  }
  return { ok: true };
}

// =====================================================================
// Laporan
// =====================================================================

/** Bentuk minimal satu kasus untuk laporan — longgar agar dapat diuji murni. */
export type KasusUntukLaporan = {
  tahap: KodeTahapTunggakan;
  petugasLabel: string | null;
  statusKasus: string;
  statusPembayaran: string;
  /** Sisa kewajiban menurut ledger internal (rupiah). */
  sisaKewajiban: number;
  jumlahTindakan: number;
  janji: { status: string } | null;
};

export type RingkasanLaporanPenagihan = {
  totalKasus: number;
  perTahap: Record<KodeTahapTunggakan, number>;
  perPetugas: Array<{ petugas: string; jumlah: number }>;
  belumDitugaskan: number;
  kasusAktif: number;
  janjiAktif: number;
  janjiDipenuhi: number;
  janjiDilanggar: number;
  totalSisaKewajiban: number;
  tanpaTindakan: number;
};

/**
 * Ringkas laporan dari daftar kasus. Semua angka berasal dari data yang
 * diberikan pemanggil — tidak ada angka yang dikarang, dan kasus tanpa petugas
 * dihitung terpisah supaya "belum ditugaskan" tidak menyamar sebagai beban
 * seorang petugas.
 */
export function ringkasLaporanPenagihan(
  kasus: readonly KasusUntukLaporan[],
): RingkasanLaporanPenagihan {
  const perTahap: Record<KodeTahapTunggakan, number> = {
    lancar: 0,
    ringan: 0,
    sedang: 0,
    berat: 0,
    macet: 0,
  };
  const petaPetugas = new Map<string, number>();
  let belumDitugaskan = 0;
  let kasusAktif = 0;
  let janjiAktif = 0;
  let janjiDipenuhi = 0;
  let janjiDilanggar = 0;
  let totalSisaKewajiban = 0;
  let tanpaTindakan = 0;

  for (const k of kasus) {
    perTahap[k.tahap] += 1;
    if (k.petugasLabel === null || k.petugasLabel.trim() === "") belumDitugaskan += 1;
    else petaPetugas.set(k.petugasLabel, (petaPetugas.get(k.petugasLabel) ?? 0) + 1);

    if (!STATUS_KASUS_TERTUTUP.includes(k.statusKasus as StatusKasus)) kasusAktif += 1;
    if (Number.isSafeInteger(k.sisaKewajiban) && k.sisaKewajiban > 0) {
      totalSisaKewajiban += k.sisaKewajiban;
    }
    if (k.jumlahTindakan === 0) tanpaTindakan += 1;
    if (k.janji !== null) {
      if (k.janji.status === "aktif") janjiAktif += 1;
      if (k.janji.status === "dipenuhi") janjiDipenuhi += 1;
      if (k.janji.status === "dilanggar") janjiDilanggar += 1;
    }
  }

  return {
    totalKasus: kasus.length,
    perTahap,
    perPetugas: [...petaPetugas.entries()]
      .map(([petugas, jumlah]) => ({ petugas, jumlah }))
      .sort((a, b) => b.jumlah - a.jumlah || a.petugas.localeCompare(b.petugas)),
    belumDitugaskan,
    kasusAktif,
    janjiAktif,
    janjiDipenuhi,
    janjiDilanggar,
    totalSisaKewajiban,
    tanpaTindakan,
  };
}
