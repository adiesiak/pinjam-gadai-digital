/**
 * Sidik jari dokumen kontrak (e-contract) dan tautan verifikasinya.
 *
 * Masalah yang diselesaikan: PDF kontrak dicetak dari peramban, sehingga
 * berkasnya sendiri tidak membawa tanda apa pun bahwa isinya berasal dari
 * catatan PINDAI. Modul ini menyusun PAYLOAD KANONIK dari data kontrak yang
 * tersimpan, menghitung SHA-256-nya, lalu menerbitkan kode pendek yang bisa
 * dibuka publik. Halaman verifikasi menampilkan hash yang tersimpan; bila hash
 * di dokumen sama dengan hash di halaman itu, isi kontrak tidak berubah sejak
 * ditandatangani.
 *
 * Batas yang harus dibaca sebelum menganggap ini "tanda tangan digital":
 * hash membuktikan INTEGRITAS DATA yang tercatat di PINDAI, bukan identitas
 * fisik penanda tangan. Verifikasi identitas tetap urusan KYC dan admin yang
 * memfasilitasi tanda tangan.
 *
 * Payload tidak pernah disimpan — hanya hash-nya — sehingga NIK dan nama tidak
 * ikut tersalin ke tabel verifikasi yang bisa dibaca publik.
 */
import { CONTRACT_TERMS_VERSION } from "./contract";
import { sha256Hex } from "./sha256";
import { SITUS_RESMI } from "./tautanAplikasi";

/** Versi skema payload. Naikkan bila susunan field berubah. */
export const VERSI_DOKUMEN_DIGITAL = "kd-v1";

export type JenisKontrakDigital = "pinjaman" | "gadai";

export type DataKontrakPinjaman = {
  nomorReferensi: string;
  namaLengkap: string;
  nik?: string | null;
  pokokPinjaman: number;
  tenorHari: number;
  tenorBulan?: number | null;
  persenBunga?: number | null;
  tandaTanganPada: number;
};

export type DataKontrakGadai = {
  nomorReferensi: string;
  namaLengkap: string;
  nilaiTaksiran: number;
  hargaPasar?: number | null;
  pokokGadai?: number | null;
  persenSewaModal?: number | null;
  tandaTanganPada: number;
};

/** Teks kanonik pinjaman — urutan field adalah bagian dari versi. */
export function payloadKontrakPinjaman(data: DataKontrakPinjaman): string {
  return [
    "PINDAI-KONTRAK",
    VERSI_DOKUMEN_DIGITAL,
    CONTRACT_TERMS_VERSION,
    "pinjaman",
    data.nomorReferensi,
    data.namaLengkap.trim().toUpperCase(),
    data.nik ?? "-",
    String(data.pokokPinjaman),
    String(data.tenorHari),
    String(data.tenorBulan ?? 0),
    String(data.persenBunga ?? 0),
    String(data.tandaTanganPada),
  ].join("|");
}

/** Teks kanonik gadai — urutan field adalah bagian dari versi. */
export function payloadKontrakGadai(data: DataKontrakGadai): string {
  return [
    "PINDAI-KONTRAK",
    VERSI_DOKUMEN_DIGITAL,
    CONTRACT_TERMS_VERSION,
    "gadai",
    data.nomorReferensi,
    data.namaLengkap.trim().toUpperCase(),
    String(data.nilaiTaksiran),
    String(data.hargaPasar ?? 0),
    String(data.pokokGadai ?? 0),
    String(data.persenSewaModal ?? 0),
    String(data.tandaTanganPada),
  ].join("|");
}

/** Hash 64 heksadesimal dari payload kanonik. */
export function hashDokumen(payload: string): string {
  return sha256Hex(payload);
}

/** Kode verifikasi pendek yang dicetak di dokumen dan dibaca QR. */
export function kodeDariHash(hash: string): string {
  return hash.slice(0, 10).toUpperCase();
}

/** Alamat halaman verifikasi untuk satu kode. */
export function urlVerifikasi(kode: string, asal: string = SITUS_RESMI): string {
  return `${asal.replace(/\/+$/, "")}/verifikasi-kontrak/${kode}`;
}

/** Format waktu terbit dalam WIB, untuk teks dokumen & halaman verifikasi. */
export function waktuTerbitWib(waktu: number): string {
  return new Date(waktu).toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
