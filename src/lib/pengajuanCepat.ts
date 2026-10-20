/**
 * PENGAJUAN CEPAT (pasca-KYC) — aturan MURNI tanpa React, Convex, atau DOM.
 *
 * Kenapa berkas ini ada: begitu identitas nasabah TERVERIFIKASI, wizard KYC
 * tujuh tahap tidak lagi relevan — data identitas, dokumen, dan rekening sudah
 * tersimpan di server. Yang tersisa hanyalah keputusan pengajuan: berapa, berapa
 * lama, untuk apa, dan ke rekening mana dana dikirim.
 *
 * Batas yang dijaga di sini:
 * - Nominal tidak pernah melewati batas produk (Rp 100.000–Rp 1 juta) MAUPUN
 *   SISA batas pinjaman nasabah (plafon master dipotong pokok pinjaman berjalan).
 *   Server memakai sisa yang sama (`ringkasPlafon`), jadi UI tidak menawarkan
 *   angka yang pasti ditolak.
 * - Data identitas TIDAK diketik ulang: syarat yang diperiksa server diambil
 *   dari baris KYC yang sudah terverifikasi. Kalau salah satu bagiannya kosong
 *   (mis. rekening belum diisi), pengajuan ditolak di klien dengan kalimat yang
 *   menyebut apa yang harus dilengkapi — bukan diteruskan lalu gagal di server.
 * - Rekening tersimpan wajib DIKONFIRMASI nasabah di halaman ini, karena dana
 *   dikirim ke rekening itu.
 *
 * Fungsi-fungsi ini diuji di `pengajuanCepat.test.ts`; komponennya
 * (`pages/dashboard/pengajuan-cepat-views.tsx`) hanya merender hasilnya.
 */
import { validateKycInput } from "./kyc";
import {
  LOAN_LIMITS,
  TENOR_OPTIONS,
  tenorHarianTersedia,
  validasiTenorHarian,
  type Tenor,
} from "./loan";
import { formatRupiah } from "./money";
import { PLAFON_DEFAULT } from "./plafon";

/** Batas nominal pengajuan cepat: batas produk ∧ SISA batas pinjaman nasabah. */
export type BatasNominalCepat = {
  min: number;
  /** Batas atas yang boleh diketik atau dipilih. `0` saat tidak ada sisa. */
  maks: number;
  /** `false` = sisa batas nasabah sudah terpakai habis, jadi tak ada nominal sah. */
  adaSisa: boolean;
};

/**
 * Batas nominal yang boleh diajukan, dihitung dari SISA batas pinjaman nasabah
 * (`nasabah.plafonRingkasSaya.tersedia` — plafon master dipotong pokok pinjaman
 * berjalan; perhitungan server yang sama dengan validasi pengajuan).
 *
 * Sisa yang belum termuat jatuh ke `PLAFON_DEFAULT` supaya rentangnya tidak
 * pernah kosong, dan angka itu hanya bisa lebih kecil dari yang berlaku — bukan
 * lebih besar. Sisa nol dikembalikan apa adanya supaya layar menampilkan
 * "belum ada sisa", bukan tawaran yang pasti ditolak server.
 */
export function batasNominalCepat(sisaBatas?: number | null): BatasNominalCepat {
  const min = LOAN_LIMITS.minPokok;
  const angka =
    typeof sisaBatas === "number" && Number.isFinite(sisaBatas)
      ? Math.max(0, Math.floor(sisaBatas))
      : PLAFON_DEFAULT;
  const maks = Math.min(LOAN_LIMITS.maxPokok, angka);
  const adaSisa = maks >= min;
  return { min, maks: adaSisa ? maks : 0, adaSisa };
}

/**
 * Nominal awal yang ditawarkan: setengah dari batas, dibulatkan ke bawah ke
 * kelipatan Rp 50.000. Nasabah yang batasnya kecil (Rp 1 juta) tetap mendapat
 * angka yang wajar, bukan batas maksimum yang membuatnya kaget. Tanpa sisa
 * (atau saat batasnya belum termuat) pengajuan cepat tidak menawarkan nominal.
 */
export function nominalAwalCepat(sisaBatas?: number | null): number {
  const { min, maks, adaSisa } = batasNominalCepat(sisaBatas);
  if (!adaSisa) return 0;
  const setengah = Math.floor(maks / 2 / 50_000) * 50_000;
  return Math.min(maks, Math.max(min, setengah));
}

/** Seluruh tenor yang dikenal produk (hari) — dipakai untuk label & fallback. */
export const TENOR_CEPAT = TENOR_OPTIONS;

/**
 * Tenor yang benar-benar boleh dipilih untuk satu nominal pengajuan cepat.
 * Produk menawarkan 7/14/28 hari; fungsi ini tetap membaca matriks agar
 * perubahan aturan tenor hanya ditulis di `lib/loan.ts`.
 */
export function tenorCepat(pokok: number): readonly Tenor[] {
  return tenorHarianTersedia(pokok);
}

/** Apakah rekening tersimpan cukup lengkap untuk dikonfirmasi & dipakai. */
export function rekeningTersimpanSiap(
  namaBank: string | null | undefined,
  nomorRekening: string | null | undefined,
): boolean {
  const bank = (namaBank ?? "").trim();
  const rekening = (nomorRekening ?? "").replace(/\s+/g, "");
  return bank.length >= 2 && bank.length <= 60 && /^\d{6,20}$/.test(rekening);
}

/**
 * Bagian data KYC terverifikasi yang dibutuhkan `createLoanApplication`.
 * Semuanya sudah di server — tidak ada yang diketik ulang di halaman ini.
 */
export type KtpTerverifikasi = {
  namaLengkap: string;
  nik: string;
  nomorWhatsApp: string;
  penghasilanBulanan: number | null;
  sumberPenghasilan: string;
  namaBank: string;
  nomorRekening: string;
  dokKtpId: string | null;
  dokSelfieKtpId: string | null;
  dokSlipGajiId: string | null;
};

/** Isian pengajuan cepat yang benar-benar diisi nasabah di halaman ini. */
export type IsianPengajuanCepat = {
  pokokPinjaman: number;
  tenorHari: number;
  /** Nilai opsi `LOAN_PURPOSE_OPTIONS` (mis. `modal_usaha`). */
  tujuan: string;
  /** Nasabah menegaskan rekening tersimpan memang miliknya. */
  rekeningBenar: boolean;
  /** Nasabah menyetujui Syarat & Ketentuan. */
  persetujuanSyarat: boolean;
  /** Titik GPS perangkat sudah tercatat pada formulir ini. */
  lokasiTercatat: boolean;
  /** Kanvas tanda tangan sudah berisi goresan. */
  ttdTersedia: boolean;
};

/**
 * Bagian data KYC TERVERIFIKASI yang tidak bisa dipakai mengajukan, dengan
 * kalimat yang bisa ditindaklanjuti.
 *
 * Isian identitas diperiksa memakai `validateKycInput` — kalimat yang sama
 * dengan formulir panjang dan server — sedangkan dokumen & rekening diperiksa
 * langsung di sini karena hanya modul ini yang tahu keduanya ikut dikirim.
 */
export function kekuranganKtpTerverifikasi(ktp: KtpTerverifikasi): string[] {
  const kurang: string[] = [];
  const galatIsian = validateKycInput({
    nik: ktp.nik,
    nomorWhatsApp: ktp.nomorWhatsApp,
    penghasilanBulanan: ktp.penghasilanBulanan ?? 0,
    sumberPenghasilan: ktp.sumberPenghasilan,
  });
  if (galatIsian !== null) kurang.push(galatIsian);
  if (ktp.namaLengkap.trim().length < 3) kurang.push("Nama lengkap sesuai KTP");
  if (ktp.dokKtpId === null) kurang.push("Foto KTP");
  if (ktp.dokSelfieKtpId === null) kurang.push("Selfie dengan KTP");
  if (ktp.dokSlipGajiId === null) kurang.push("Bukti penghasilan");
  if (!rekeningTersimpanSiap(ktp.namaBank, ktp.nomorRekening)) {
    kurang.push("Nama bank dan nomor rekening");
  }
  return kurang;
}

/** true bila seluruh data KYC yang diwajibkan server bisa dipakai mengajukan. */
export function ktpTerverifikasiLengkap(ktp: KtpTerverifikasi): boolean {
  return kekuranganKtpTerverifikasi(ktp).length === 0;
}

/**
 * Periksa isian pengajuan cepat SEBELUM dikirim. Mengembalikan kalimat pertama
 * yang menghalangi, atau `null` bila semuanya siap.
 *
 * Urutannya mengikuti urutan yang dilihat nasabah, dan pemeriksaan data
 * identitas memakai `validateKycInput` — aturan yang sama dengan formulir
 * panjang dan server — sehingga tidak ada jalan pintas yang lolos di sini lalu
 * ditolak di sana.
 */
export function validasiPengajuanCepat(
  isian: IsianPengajuanCepat,
  ktp: KtpTerverifikasi,
  sisaBatas?: number | null,
): string | null {
  // Data KYC diperiksa LEBIH DULU: tanpa itu tidak ada gunanya menilai nominal.
  // Pesannya mengantar nasabah ke halaman verifikasi KYC, karena di situlah
  // bagian yang kurang bisa diperbaiki — bukan di halaman pengajuan cepat.
  const kurang = kekuranganKtpTerverifikasi(ktp);
  if (kurang.length > 0) {
    return `Data KYC terverifikasi belum lengkap: ${kurang.join(" ")} Perbaiki lewat halaman verifikasi KYC, lalu kembali ke sini.`;
  }

  const { min, maks, adaSisa } = batasNominalCepat(sisaBatas);
  // Sisa batas habis karena pinjaman berjalan yang belum lunas: sebutkan alasannya
  // apa adanya, karena mengurangi nominal pun tidak akan menolong.
  if (!adaSisa) {
    return (
      "Sisa batas pinjaman Anda belum cukup untuk pengajuan ini. " +
      "Lunasi pinjaman berjalan lebih dulu, atau hubungi tim PINDAI bila batasnya perlu ditinjau."
    );
  }
  if (!Number.isInteger(isian.pokokPinjaman) || isian.pokokPinjaman < min) {
    return `Jumlah pinjaman minimal ${formatRupiah(min)}.`;
  }
  if (isian.pokokPinjaman > maks) {
    // Sisa batas nasabah yang lebih kecil dari batas produk disebut angkanya, supaya
    // nasabah tahu batas itu miliknya sendiri — bukan batas umum yang dirahasiakan.
    const sebutSisa =
      typeof sisaBatas === "number" &&
      Number.isFinite(sisaBatas) &&
      maks < LOAN_LIMITS.maxPokok;
    return `Jumlah pinjaman maksimal ${formatRupiah(maks)} untuk pengajuan ini.${
      sebutSisa ? ` Sisa batas pinjaman Anda ${formatRupiah(maks)}.` : ""
    }`;
  }
  // Tenor resmi 7/14/28 hari. Matriks tetap menjadi satu-satunya sumber
  // kebenaran bila aturan produk berubah.
  const pesanTenor = validasiTenorHarian(isian.pokokPinjaman, isian.tenorHari);
  if (pesanTenor !== null) {
    return `${pesanTenor} Pilih lama pinjaman: ${tenorHarianTersedia(
      isian.pokokPinjaman,
    ).join(" / ")} hari.`;
  }
  if (isian.tujuan.trim() === "") {
    return "Pilih keperluan pinjaman.";
  }

  if (!isian.rekeningBenar) {
    return "Konfirmasi dulu bahwa rekening bank yang tersimpan memang milik Anda.";
  }
  if (!isian.lokasiTercatat) {
    return "Lokasi Anda belum tercatat. Izinkan akses lokasi, lalu ambil lokasi sekali lagi.";
  }
  if (!isian.ttdTersedia) {
    return "Tanda tangan wajib: bubuhkan tanda tangan Anda sebelum mengirim pengajuan.";
  }
  if (!isian.persetujuanSyarat) {
    return "Centang persetujuan Syarat & Ketentuan sebelum mengirim pengajuan.";
  }
  return null;
}
