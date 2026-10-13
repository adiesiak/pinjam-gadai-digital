/**
 * TAHAPAN pengisian KYC nasabah — logika MURNI (tanpa React, Convex, DOM) supaya
 * bisa diuji sebagai skrip biasa (`bun src/lib/kycTahapan.test.ts`).
 *
 * Kenapa berkas ini ada: antarmuka KYC memecah pengumpulan data menjadi tahap
 * (identitas, KTP, selfie, WhatsApp, alamat, informasi pendukung) dan harus
 * memberi tahu di tahap mana pengguna berada, tahap mana yang sudah siap, dan
 * apa yang masih menghalangi pengajuan. Kalau tiap tahap menghitung sendiri, UI
 * cepat berbeda dari aturan server: form bilang "siap" padahal server masih
 * menolak, atau sebaliknya.
 *
 * Karena itu di sini TIDAK ada aturan baru:
 * - "apa yang masih kurang" selalu berasal dari `kekuranganKyc()` di
 *   `lib/kycStatus.ts` — daftar yang sama yang dipakai server saat mengajukan;
 * - "isian ini salah" selalu berasal dari `galatDataDiri()` di `lib/dataDiri.ts`
 *   — aturan yang sama dengan form Data Diri dan validasi server;
 * - pemetaan label kekurangan → tahap diuji kelengkapannya
 *   (`kycTahapan.test.ts`) sehingga label baru tidak bisa lolos tanpa tahap.
 *
 * Berkas ini juga memegang dua hal yang berkaitan dengan privasi:
 * - `maskDigit()`/`maskNik()`/`maskRekening()` untuk menampilkan NIK/rekening
 *   dalam bentuk bertopeng di ringkasan maupun pesan — NIK lengkap tidak perlu
 *   muncul lagi setelah diketik.
 * - petunjuk foto (`PETUNJUK_KTP`, `PETUNJUK_SELFIE`) — pencahayaan, fokus, dan
 *   seluruh sisi dokumen, supaya berkas yang dikirim tidak ditolak petugas.
 */
import {
  galatDataDiri,
  penghasilanDariTeks,
  type DataDiriForm,
  type GalatDataDiri,
} from "./dataDiri";
import { kekuranganKyc, type IsianKycRingkas } from "./kycStatus";

/* ==========================================================================
 * Definisi tahap
 * ========================================================================== */

/**
 * Seluruh id tahap. Dipisah dari daftar tahapnya supaya `IdTahapKyc` tidak
 * merujuk ke tipe yang sedang didefinisikan (cincin tipe yang membuat semuanya
 * menjadi `any`).
 */
export const ID_TAHAP_KYC = [
  "persetujuan",
  "identitas",
  "ktp",
  "selfie",
  "whatsapp",
  "alamat",
  "darurat",
  "pendukung",
] as const;

export type IdTahapKyc = (typeof ID_TAHAP_KYC)[number];

/**
 * Satu tahap pengisian KYC.
 *
 * `isian` menyebut kunci isian milik tahap ini (dipakai untuk menampilkan galat
 * DI DEKAT isiannya), `berkas` menyebut slot dokumennya, dan `wajib` menyatakan
 * apakah tahap ini menghalangi pengajuan. Tahap opsional tetap punya status
 * sendiri supaya pengguna tahu apa yang boleh dilewati — bukan disembunyikan.
 */
export type TahapKyc = {
  readonly id: IdTahapKyc;
  readonly judul: string;
  readonly ringkas: string;
  readonly isian: readonly KunciIsianKyc[];
  readonly berkas: readonly SlotBerkasKyc[];
  readonly wajib: boolean;
};

/** Urutan tahap sesuai ketentuan produk: persetujuan → identitas → dokumen → kontak → pendukung. */
export const TAHAPAN_KYC: readonly TahapKyc[] = [
  {
    id: "persetujuan",
    judul: "Persetujuan pemrosesan data",
    ringkas: "Penjelasan & izin sebelum data sensitif dikumpulkan",
    isian: [],
    berkas: [],
    wajib: true,
  },
  {
    id: "identitas",
    judul: "Data identitas",
    ringkas: "Nama sesuai KTP dan nomor NIK",
    isian: ["namaLengkap", "nik"],
    berkas: [],
    wajib: true,
  },
  {
    id: "ktp",
    judul: "Foto KTP",
    ringkas: "Seluruh sisi KTP, cahaya cukup, fokus tajam",
    isian: [],
    berkas: ["ktp"],
    wajib: true,
  },
  {
    id: "selfie",
    judul: "Selfie dengan KTP",
    ringkas: "Wajah dan KTP terlihat dalam satu foto",
    isian: [],
    berkas: ["selfie"],
    wajib: true,
  },
  {
    id: "whatsapp",
    judul: "Nomor WhatsApp",
    ringkas: "Nomor aktif berformat 62…",
    isian: ["nomorWhatsApp"],
    berkas: [],
    wajib: true,
  },
  {
    id: "alamat",
    judul: "Alamat",
    ringkas: "Alamat tempat tinggal saat ini",
    isian: ["alamat", "pekerjaan"],
    berkas: [],
    wajib: false,
  },
  {
    id: "darurat",
    judul: "Kontak darurat",
    ringkas: "Nama, nomor, dan hubungan orang yang bisa dihubungi",
    isian: ["namaKontakDarurat", "nomorKontakDarurat", "hubunganKontakDarurat"],
    berkas: [],
    // OPSIONAL, dan itu keputusan sadar: menambah langkah WAJIB akan menahan
    // pengajuan nasabah yang sudah terverifikasi dan sudah mengirim data lebih
    // dulu, padahal kolom ini hanya penghubung saat nasabah tidak bisa dihubungi
    // — bukan bukti identitas. Karena opsional, tahap ini tidak pernah muncul di
    // `kekuranganKyc()` dan pihak yang belum mengisinya tetap bisa mengajukan.
    wajib: false,
  },
  {
    id: "pendukung",
    judul: "Informasi pendukung",
    ringkas: "Penghasilan, rekening, dan bukti pendukung",
    isian: ["penghasilan", "sumberPenghasilan", "namaBank", "nomorRekening", "catatanPeminjam"],
    berkas: ["bukti"],
    wajib: true,
  },
];

export type SlotBerkasKyc = "ktp" | "selfie" | "bukti";
export type KunciIsianKyc =
  | keyof DataDiriForm
  | "sumberPenghasilan"
  | "catatanPeminjam"
  | "namaKontakDarurat"
  | "nomorKontakDarurat"
  | "hubunganKontakDarurat";

/** Isian KYC seperti yang dikirim/diterima UI (semua string, seperti form). */
export type IsianKycLengkap = {
  namaLengkap: string;
  nik: string;
  nomorWhatsApp: string;
  alamat: string;
  pekerjaan: string;
  penghasilan: string;
  sumberPenghasilan: string;
  namaBank: string;
  nomorRekening: string;
  catatanPeminjam: string;
  namaKontakDarurat: string;
  nomorKontakDarurat: string;
  hubunganKontakDarurat: string;
};

/** Berkas yang sudah tertaut pada tiap slot (null = belum ada). */
export type BerkasKyc = {
  ktp: string | null;
  selfie: string | null;
  bukti: string | null;
};

export function tahapKyc(id: IdTahapKyc): TahapKyc {
  return TAHAPAN_KYC.find((tahap) => tahap.id === id) ?? TAHAPAN_KYC[0];
}

/* ==========================================================================
 * Pemetaan kekurangan server → tahap
 * ========================================================================== */

/**
 * Label dari `kekuranganKyc()` → tahap yang harus dibuka untuk memperbaikinya.
 *
 * Sengaja memakai label PERSIS dari `lib/kycStatus.ts` (satu sumber), dan
 * kelengkapannya diuji: `kycTahapan.test.ts` memastikan SETIAP label yang bisa
 * dihasilkan `kekuranganKyc({})` punya tahap. Menambah kekurangan baru tanpa
 * memetakannya akan menggagalkan uji itu — bukan diam-diam muncul sebagai
 * "tidak ada tahap yang perlu diperbaiki".
 */
export const TAHAP_DARI_KEKURANGAN: Readonly<Record<string, IdTahapKyc>> = {
  "Nama lengkap sesuai KTP": "identitas",
  "NIK 16 angka": "identitas",
  "Nomor WhatsApp format 62…": "whatsapp",
  "Penghasilan per bulan (rupiah bulat)": "pendukung",
  "Sumber penghasilan": "pendukung",
  "Foto KTP": "ktp",
  "Selfie dengan KTP": "selfie",
  "Bukti penghasilan": "pendukung",
};

/** Tahap yang menangani sebuah label kekurangan, atau null bila tidak dikenali. */
export function tahapDariKekurangan(label: string): IdTahapKyc | null {
  return TAHAP_DARI_KEKURANGAN[label] ?? null;
}

/** Kekurangan (label server) yang jatuh ke satu tahap. */
export function kekuranganTahap(id: IdTahapKyc, kekurangan: readonly string[]): string[] {
  return kekurangan.filter((label) => tahapDariKekurangan(label) === id);
}

/* ==========================================================================
 * Status & progres tahap
 * ========================================================================== */

/**
 * Keadaan satu tahap:
 * - `belum`            — belum ada isian/berkas apa pun.
 * - `sebagian`         — sudah diisi sebagian, masih kurang.
 * - `perlu-diperbaiki` — ada nilai yang SALAH, atau petugas meminta perbaikan.
 * - `lengkap`          — tidak lagi menghalangi pengajuan.
 */
export type StatusTahapKyc = "belum" | "sebagian" | "lengkap" | "perlu-diperbaiki";

export const LABEL_STATUS_TAHAP: Record<StatusTahapKyc, string> = {
  belum: "Belum diisi",
  sebagian: "Sedang diisi",
  "perlu-diperbaiki": "Perlu diperbaiki",
  lengkap: "Siap",
};

/** Ringkasan untuk memutuskan status satu tahap. */
export type OpsiStatusTahap = {
  /**
   * Label kekurangan versi SERVER (`kycSaya.kekurangan`). Dipakai sebagai
   * TAMBAHAN atas perhitungan lokal: isian yang sudah diketik pengguna belum
   * tentu tersimpan, jadi status tahap tidak boleh hanya percaya data tersimpan
   * — dan sebaliknya, kekurangan yang dilaporkan server (mis. berkas yang gagal
   * tersimpan) tidak boleh hilang hanya karena isian lokal tampak lengkap.
   */
  kekurangan: readonly string[];
  /** true bila petugas sedang meminta perbaikan (status NEEDS_CORRECTION). */
  perluPerbaikan: boolean;
  /** true bila persetujuan pemrosesan data sudah tercatat di server. */
  persetujuanAktif: boolean;
};

/** true bila tahap ini punya isian/berkas yang sudah terisi. */
function adaIsi(tahap: TahapKyc, isian: IsianKycLengkap, berkas: BerkasKyc): boolean {
  for (const kunci of tahap.isian) {
    if (tahap.id === "pendukung") {
      // Catatan/pekerjaan saja bukan tanda "sedang diisi" untuk tahap pendukung;
      // yang menentukan adalah angka penghasilan/sumber atau rekening.
      if (kunci === "catatanPeminjam") continue;
      if (kunci === "pekerjaan") continue;
    }
    const nilai = isian[kunci as keyof IsianKycLengkap] ?? "";
    if (nilai.trim() !== "") return true;
  }
  for (const slot of tahap.berkas) {
    if (berkas[slot] !== null) return true;
  }
  return false;
}

/**
 * Status satu tahap.
 *
 * Urutan pemeriksaan penting: nilai yang SALAH lebih dulu (`perlu-diperbaiki`),
 * lalu kekurangan dari server, baru "belum/sebagian". Dengan begitu tahap yang
 * diisi asal-asalan tidak pernah tampak "sedang diisi" seolah hanya belum
 * selesai.
 */
export function statusTahapKyc(
  id: IdTahapKyc,
  isian: IsianKycLengkap,
  berkas: BerkasKyc,
  opsi: OpsiStatusTahap,
): StatusTahapKyc {
  if (id === "persetujuan") {
    return opsi.persetujuanAktif ? "lengkap" : "belum";
  }

  const tahap = tahapKyc(id);
  const ada = adaIsi(tahap, isian, berkas);

  // Belum disentuh sama sekali: jujur sebagai "belum", bukan "lengkap" hanya
  // karena tidak ada pelanggaran pada isian kosong (semua isian opsional bila
  // kosong). Ini juga yang membuat tahap opsional tampil sebagai "belum diisi".
  if (!ada) return "belum";

  // Isian yang SALAH lebih dulu: tahap berisi nilai keliru tidak boleh tampak
  // "sedang diisi" seolah hanya belum selesai.
  if (galatIsianTahap(id, isian).length > 0) return "perlu-diperbaiki";

  if (kekuranganLokalTahap(id, isian, berkas).length > 0) return "sebagian";
  if (kekuranganTahap(id, opsi.kekurangan).length > 0) return "sebagian";

  // Petugas meminta perbaikan: tahap DOKUMEN IDENTITAS ditandai supaya pengguna
  // tahu berkas lamanya harus difoto ulang — bukan tersembunyi di balik "siap".
  if (opsi.perluPerbaikan && (id === "ktp" || id === "selfie")) return "perlu-diperbaiki";
  return "lengkap";
}

/**
 * Kekurangan SATU tahap menurut isian LOKAL (belum tentu tersimpan), memakai
 * `kekuranganKyc()` yang sama dengan server. Dipakai UI untuk menyebut apa yang
 * masih kurang di tahap itu tanpa menunggu simpan.
 */
export function kekuranganLokalTahap(
  id: IdTahapKyc,
  isian: IsianKycLengkap,
  berkas: BerkasKyc,
): string[] {
  const semua = kekuranganKlien(isian, berkas, penghasilanDariTeks(isian.penghasilan));
  return kekuranganTahap(id, semua);
}

/**
 * true bila tahap ini tidak lagi menghalangi pengajuan: tahap wajib harus
 * `lengkap`, sedangkan tahap opsional boleh sekadar `belum` (kosong) — asal
 * tidak berisi nilai yang salah.
 */
export function tahapSiap(tahap: TahapKyc, status: StatusTahapKyc): boolean {
  if (status === "lengkap") return true;
  return !tahap.wajib && status === "belum";
}

/** Progres pengisian: berapa tahap yang sudah tidak menghalangi pengajuan. */
export type ProgresKyc = {
  selesai: number;
  total: number;
  /** 0–100; persen tahap yang siap. */
  persen: number;
  /** Tahap pertama yang belum siap — titik "lanjutkan proses". */
  tahapBerikutnya: IdTahapKyc;
};

export function progresKyc(
  isian: IsianKycLengkap,
  berkas: BerkasKyc,
  opsi: OpsiStatusTahap,
): ProgresKyc {
  let selesai = 0;
  let berikutnya: IdTahapKyc | null = null;
  for (const tahap of TAHAPAN_KYC) {
    const status = statusTahapKyc(tahap.id, isian, berkas, opsi);
    if (tahapSiap(tahap, status)) selesai += 1;
    else if (berikutnya === null) berikutnya = tahap.id;
  }
  const total = TAHAPAN_KYC.length;
  return {
    selesai,
    total,
    persen: Math.round((selesai / total) * 100),
    tahapBerikutnya: berikutnya ?? "pendukung",
  };
}

/**
 * Tahap yang paling masuk akal dibuka lebih dulu.
 *
 * Saat petugas meminta perbaikan atau menolak, pengguna diantar ke tahap yang
 * memang perlu diubah — bukan ke tahap pertama yang membuatnya mengulang semua
 * dari awal. Sesudah itu: tahap pertama yang masih menghalangi pengajuan.
 */
export function tahapDisarankan(
  status: string,
  isian: IsianKycLengkap,
  berkas: BerkasKyc,
  opsi: OpsiStatusTahap,
): IdTahapKyc {
  const perluPerbaikan = status === "NEEDS_CORRECTION" || status === "REJECTED";
  const opsiEfektif: OpsiStatusTahap = { ...opsi, perluPerbaikan };

  // 1) Tahap yang benar-benar bermasalah (nilai salah atau diminta petugas).
  for (const tahap of TAHAPAN_KYC) {
    if (tahap.id === "persetujuan") continue;
    if (statusTahapKyc(tahap.id, isian, berkas, opsiEfektif) === "perlu-diperbaiki") {
      return tahap.id;
    }
  }
  // 2) Tahap pertama yang masih menghalangi pengajuan.
  return progresKyc(isian, berkas, opsiEfektif).tahapBerikutnya;
}

/* ==========================================================================
 * Validasi per tahap — memakai aturan server
 * ========================================================================== */

/** Empat isian data diri dari isian KYC (bentuk yang diterima `galatDataDiri`). */
export function isianKeFormDataDiri(isian: IsianKycLengkap): DataDiriForm {
  return {
    namaLengkap: isian.namaLengkap,
    nik: isian.nik,
    nomorWhatsApp: isian.nomorWhatsApp,
    alamat: isian.alamat,
    pekerjaan: isian.pekerjaan,
    penghasilan: isian.penghasilan,
    namaBank: isian.namaBank,
    nomorRekening: isian.nomorRekening,
  };
}

/**
 * Semua galat isian KYC, memakai aturan yang sama dengan form Data Diri dan
 * validasi server, ditambah satu aturan yang hanya ada di modul KYC: sumber
 * penghasilan minimal 3 karakter (server memaksanya di `simpanProgresKyc` /
 * `ajukanKyc`).
 */
export function galatKyc(isian: IsianKycLengkap): GalatKyc {
  const galat: GalatKyc = galatDataDiri(isianKeFormDataDiri(isian));
  if (isian.sumberPenghasilan.trim() !== "" && isian.sumberPenghasilan.trim().length < 3) {
    galat.sumberPenghasilan = "Sumber penghasilan minimal 3 karakter bila diisi.";
  } else if (isian.sumberPenghasilan.trim().length === 0) {
    // Wajib untuk mengajukan (lihat `kekuranganKyc`), jadi pesannya tetap muncul
    // di tahap pendukung — bukan diam-diam lolos di klien.
    galat.sumberPenghasilan = "Sumber penghasilan wajib diisi, mis. gaji atau usaha.";
  }

  // Aturan kontak darurat hidup di `galatKontakDarurat` supaya server memakai
  // aturan yang SAMA saat menyimpan & mengajukan (lihat `convex/kyc.ts`).
  return { ...galat, ...galatKontakDarurat(isian) };
}

/** Galat tiap kolom kontak darurat; kolom yang tidak bermasalah tidak muncul. */
export type GalatKontakDarurat = {
  namaKontakDarurat?: string;
  nomorKontakDarurat?: string;
  hubunganKontakDarurat?: string;
};

/**
 * Aturan tahap KONTAK DARURAT, satu tempat untuk aplikasi dan server.
 *
 * Tahap ini opsional: kosong selalu boleh. Yang tidak boleh adalah nilai yang
 * DIISI tetapi tidak masuk akal — nomor yang salah ketik lebih buruk daripada
 * kosong, karena saat dibutuhkan orang yang dihubungi tidak pernah tersambung.
 *
 * `?? ""` bukan hiasan: baris KYC lama (dan draft yang tersimpan sebelum tahap
 * ini ada) tidak punya kolom ini sama sekali, sementara fungsi ini juga dipanggil
 * atas data tersimpan, bukan hanya atas form yang sedang diisi.
 */
export function galatKontakDarurat(isian: {
  namaKontakDarurat?: string;
  nomorKontakDarurat?: string;
  hubunganKontakDarurat?: string;
}): GalatKontakDarurat {
  const galat: GalatKontakDarurat = {};
  const nama = (isian.namaKontakDarurat ?? "").trim();
  if (nama !== "" && nama.length < 3) {
    galat.namaKontakDarurat = "Nama kontak darurat minimal 3 karakter bila diisi.";
  }
  const nomor = (isian.nomorKontakDarurat ?? "").replace(/[\s+-]/g, "");
  if (nomor !== "" && !/^62\d{8,13}$/.test(nomor)) {
    galat.nomorKontakDarurat = "Nomor kontak darurat harus format 62… dan hanya angka.";
  }
  const hubungan = (isian.hubunganKontakDarurat ?? "").trim();
  if (hubungan !== "" && hubungan.length < 3) {
    galat.hubunganKontakDarurat = "Hubungan minimal 3 karakter bila diisi, mis. keluarga.";
  }
  return galat;
}

export type GalatTahapKyc = {
  kunci: KunciIsianKyc | SlotBerkasKyc;
  pesan: string;
};

/**
 * Galat isian KYC: aturan data diri + `sumberPenghasilan` yang hanya ada di
 * modul KYC (server memaksanya minimal 3 karakter saat mengajukan), + kontak
 * darurat yang aturannya hanya berlaku BILA kolomnya diisi.
 */
export type GalatKyc = GalatDataDiri &
  GalatKontakDarurat & {
    sumberPenghasilan?: string;
  };

/** Label tiap slot berkas — satu tempat, dipakai UI dan pesan galat. */
export const LABEL_SLOT_BERKAS: Record<SlotBerkasKyc, string> = {
  ktp: "Foto KTP",
  selfie: "Selfie dengan KTP",
  bukti: "Bukti penghasilan",
};

/** Galat ISIAN pada satu tahap — aturan server, hanya untuk isian tahap itu. */
export function galatIsianTahap(id: IdTahapKyc, isian: IsianKycLengkap): GalatTahapKyc[] {
  const tahap = tahapKyc(id);
  const galat = galatKyc(isian);
  const hasil: GalatTahapKyc[] = [];
  for (const kunci of tahap.isian) {
    // Dibaca dari `GalatKyc` (bukan `GalatDataDiri`): kontak darurat bukan bagian
    // `DataDiriForm`, jadi galatnya hanya ada di tipe yang lebih luas ini.
    const pesan = galat[kunci as keyof GalatKyc];
    if (pesan !== undefined) hasil.push({ kunci, pesan });
  }
  return hasil;
}

/**
 * Yang masih menghalangi satu tahap: galat isian + berkas yang belum diunggah.
 * Dipakai UI untuk menampilkan daftar "yang perlu dilengkapi" di tahap itu.
 */
export function galatTahapKyc(
  id: IdTahapKyc,
  isian: IsianKycLengkap,
  berkas?: BerkasKyc,
): GalatTahapKyc[] {
  const hasil = galatIsianTahap(id, isian);
  if (berkas === undefined) return hasil;
  for (const slot of tahapKyc(id).berkas) {
    if (berkas[slot] === null) {
      hasil.push({ kunci: slot, pesan: `${LABEL_SLOT_BERKAS[slot]} belum diunggah.` });
    }
  }
  return hasil;
}

/* ==========================================================================
 * Isian ringkas untuk aturan murni KYC (kekurangan/status di server)
 * ========================================================================== */

/** Ubah isian UI menjadi `IsianKycRingkas` (bentuk `kekuranganKyc`). */
export function isianRingkasKyc(
  isian: IsianKycLengkap,
  berkas: BerkasKyc,
  penghasilanBulanan: number | null,
  persetujuanAktif: boolean,
): IsianKycRingkas & { persetujuanAktif: boolean } {
  return {
    namaLengkap: isian.namaLengkap,
    nik: isian.nik,
    nomorWhatsApp: isian.nomorWhatsApp,
    penghasilanBulanan,
    sumberPenghasilan: isian.sumberPenghasilan,
    ktpId: berkas.ktp,
    selfieKtpId: berkas.selfie,
    buktiPenghasilanId: berkas.bukti,
    persetujuanAktif,
  };
}

/**
 * Kekurangan versi KLIEN — memakai `kekuranganKyc()` yang sama dengan server,
 * sehingga daftar "yang masih kurang" di UI tidak bisa berbeda dari alasan
 * penolakan server. Dipakai hanya untuk memberi tahu lebih awal.
 */
export function kekuranganKlien(
  isian: IsianKycLengkap,
  berkas: BerkasKyc,
  penghasilanBulanan: number | null,
): string[] {
  return kekuranganKyc(isianRingkasKyc(isian, berkas, penghasilanBulanan, true));
}

/* ==========================================================================
 * Topeng untuk nilai sensitif
 * ========================================================================== */

/**
 * Tampilkan HANYA beberapa digit terakhir; sisanya diganti titik.
 *
 * Dipakai untuk NIK dan nomor rekening di ringkasan/status: nilai yang sudah
 * dimasukkan pengguna tidak perlu ditampilkan utuh lagi di tempat yang bisa
 * terlihat orang lain, tersimpan di riwayat peramban, atau ikut tercetak.
 */
export function maskDigit(nilai: string, tampilAkhir = 4): string {
  const bersih = (nilai ?? "").replace(/\D/g, "");
  if (bersih === "") return "—";
  if (bersih.length <= tampilAkhir) return "•".repeat(bersih.length);
  return `${"•".repeat(Math.max(0, bersih.length - tampilAkhir))}${bersih.slice(-tampilAkhir)}`;
}

/** NIK bertopeng, mis. `••••••••••••8901`. */
export function maskNik(nik: string): string {
  return maskDigit(nik, 4);
}

/** Nomor rekening bertopeng. */
export function maskRekening(rekening: string): string {
  return maskDigit(rekening, 4);
}

/** Nomor WhatsApp bertopeng (hanya 4 angka terakhir yang tampak). */
export function maskWhatsApp(nomor: string): string {
  return maskDigit(nomor, 4);
}

/* ==========================================================================
 * Petunjuk foto — pencahayaan, fokus, dan seluruh sisi dokumen
 * ========================================================================== */

export type PetunjukFoto = {
  readonly judul: string;
  readonly isi: string;
};

/** Petunjuk foto KTP: cahaya, fokus, dan kelengkapan sisi dokumen. */
export const PETUNJUK_KTP: readonly PetunjukFoto[] = [
  {
    judul: "Seluruh sisi KTP terlihat",
    isi: "KTP mengisi penuh bingkai dan keempat sudutnya masuk — tidak terpotong, tidak terhalang jari.",
  },
  {
    judul: "Cahaya merata, tanpa kilau",
    isi: "Foto di tempat terang (cahaya matahari tidak langsung atau lampu ruangan). Hindari kilau lampu dan bayangan tangan di permukaan KTP.",
  },
  {
    judul: "Fokus tajam, teks terbaca",
    isi: "Ketuk layar pada area KTP sebelum memotret. NIK, nama, dan foto harus terbaca jelas, tidak buram atau bergerak.",
  },
  {
    judul: "KTP asli, bukan salinan layar",
    isi: "Letakkan KTP di permukaan datar. Jangan memotret dari layar ponsel, hasil fotokopi, atau dokumen yang sudah dipotret ulang.",
  },
  {
    judul: "Gambar apa pun, maksimal 5 MB",
    isi: "Format JPG, PNG, atau HEIC dari kamera ponsel. Berkas diperiksa server setelah diunggah — yang bukan gambar akan ditolak.",
  },
];

/** Petunjuk selfie dengan KTP. */
export const PETUNJUK_SELFIE: readonly PetunjukFoto[] = [
  {
    judul: "Wajah dan KTP dalam satu foto",
    isi: "Pegang KTP di samping dagu setinggi dada sehingga wajah dan seluruh KTP sama-sama terlihat jelas.",
  },
  {
    judul: "Cahaya menerangi wajah",
    isi: "Hadap sumber cahaya, hindari lampu tepat di belakang Anda. Wajah tidak boleh bayang-bayang atau silau.",
  },
  {
    judul: "Tanpa penutup wajah",
    isi: "Lepas masker, kacamata gelap, atau topi. Tatap kamera tanpa memiringkan kepala.",
  },
  {
    judul: "Tidak buram",
    isi: "Tahan ponsel sejenak sebelum memotret; foto yang bergerak akan diminta ulang oleh petugas.",
  },
];

/** Petunjuk singkat untuk bukti penghasilan. */
export const PETUNJUK_BUKTI_PENGHASILAN: readonly PetunjukFoto[] = [
  {
    judul: "Dokumen sumber penghasilan",
    isi: "Slip gaji, mutasi rekening, atau surat keterangan usaha. Bagian nominal dan nama terlihat utuh.",
  },
  {
    judul: "Terbaca, tanpa bagian terpotong",
    isi: "Foto miring memperjelas seluruh halaman; pastikan angka dan periode penerimaan terbaca petugas.",
  },
];

/** Petunjuk yang sesuai sebuah tahap (kosong untuk tahap non-dokumen). */
export function petunjukTahap(id: IdTahapKyc): readonly PetunjukFoto[] {
  if (id === "ktp") return PETUNJUK_KTP;
  if (id === "selfie") return PETUNJUK_SELFIE;
  if (id === "pendukung") return PETUNJUK_BUKTI_PENGHASILAN;
  return [];
}
