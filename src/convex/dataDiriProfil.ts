import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { bacaDataDiri, type DataDiriForm, type DataDiriTersimpan } from "../lib/dataDiri";

/**
 * Inti penyimpanan satu baris data diri nasabah (`nasabahProfil`) — dipakai
 * BERSAMA oleh jalur admin (`admin.simpanDataDiriNasabah`) dan jalur sunting
 * mandiri nasabah (`profilNasabah.simpanDataDiriSaya`).
 *
 * Kenapa dipisah: aturan validasi, normalisasi, penanganan foto KTP, dan
 * bentuk barisnya harus SAMA di kedua jalur — kalau disalin, cepat berbeda.
 * Berkas ini bukan fungsi Convex (tidak mengekspor query/mutation), jadi ia
 * hanya dipanggil dari dalam mutation lain.
 */

/** Siapa yang terakhir menyunting. */
export type SumberDataDiri = "admin" | "nasabah";

/** Isian yang diterima dari klien (semua string; foto terpisah). */
export type IsianDataDiri = {
  namaLengkap: string;
  nik: string;
  nomorWhatsApp: string;
  alamat: string;
  pekerjaan: string;
  /** Rupiah bulat, atau null bila kosong. */
  penghasilanBulanan: number | null;
  namaBank: string;
  nomorRekening: string;
};

/** Perubahan foto KTP: `undefined` = biarkan, `null` = kosongkan, id = ganti. */
export type PerubahanFotoKtp = Id<"_storage"> | null | undefined;

/**
 * Simpan (buat/perbarui) data diri satu nasabah.
 *
 * - Menolak isian tidak valid dengan pesan dari `bacaDataDiri()` (aturan yang
 *   sama dengan form).
 * - Menolak penghasilan berkoma — tanpa ini, angka seperti 5.5 akan "diperbaiki"
 *   diam-diam menjadi 55 oleh pengekstrakan digit.
 * - Foto KTP lama dihapus dari storage saat diganti atau dikosongkan, agar
 *   tidak menumpuk berkas yatim.
 *
 * Mengembalikan `{ dibuat, tersimpan, fotoKtpId }` (nilai yang BENAR-BENAR
 * tersimpan) supaya pemanggil bisa menyusun kalimat audit tanpa menghitung
 * ulang.
 */
export async function simpanDataDiriProfil(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">;
    isian: IsianDataDiri;
    fotoKtpId: PerubahanFotoKtp;
    sumber: SumberDataDiri;
    olehLabel: string;
  },
): Promise<{
  dibuat: boolean;
  tersimpan: Pick<DataDiriTersimpan, "nik" | "nomorWhatsApp" | "alamat" | "penghasilanBulanan">;
  fotoKtpId: Id<"_storage"> | undefined;
}> {
  if (args.isian.penghasilanBulanan !== null && !Number.isSafeInteger(args.isian.penghasilanBulanan)) {
    throw new Error("Penghasilan per bulan harus rupiah bulat (tanpa koma).");
  }

  const form: DataDiriForm = {
    namaLengkap: args.isian.namaLengkap,
    nik: args.isian.nik,
    nomorWhatsApp: args.isian.nomorWhatsApp,
    alamat: args.isian.alamat,
    pekerjaan: args.isian.pekerjaan,
    penghasilan: args.isian.penghasilanBulanan === null ? "" : String(args.isian.penghasilanBulanan),
    namaBank: args.isian.namaBank,
    nomorRekening: args.isian.nomorRekening,
  };
  const { tersimpan, pesan } = bacaDataDiri(form);
  if (tersimpan === null) throw new Error(pesan ?? "Data diri tidak valid.");

  const existing = await ctx.db
    .query("nasabahProfil")
    .withIndex("by_user", (q) => q.eq("userId", args.userId))
    .first();

  // Foto KTP: hitung nilai akhir + hapus berkas lama bila benar-benar berubah.
  let fotoKtpId = existing?.fotoKtpId;
  if (args.fotoKtpId === null) {
    fotoKtpId = undefined;
  } else if (args.fotoKtpId !== undefined) {
    fotoKtpId = args.fotoKtpId;
  }
  const fotoLama = existing?.fotoKtpId;
  if (fotoLama !== undefined && fotoLama !== fotoKtpId) {
    if ((await ctx.storage.getMetadata(fotoLama)) !== null) {
      await ctx.storage.delete(fotoLama);
    }
  }

  const isi = {
    namaLengkap: tersimpan.namaLengkap,
    nik: tersimpan.nik,
    nomorWhatsApp: tersimpan.nomorWhatsApp,
    alamat: tersimpan.alamat ?? undefined,
    pekerjaan: tersimpan.pekerjaan ?? undefined,
    penghasilanBulanan: tersimpan.penghasilanBulanan ?? undefined,
    namaBank: tersimpan.namaBank ?? undefined,
    nomorRekening: tersimpan.nomorRekening ?? undefined,
    fotoKtpId,
    sumber: args.sumber,
    diperbaruiPada: Date.now(),
    diperbaruiOlehLabel: args.olehLabel,
  };
  if (existing === null) {
    await ctx.db.insert("nasabahProfil", { userId: args.userId, ...isi });
  } else {
    await ctx.db.patch(existing._id, isi);
  }
  return {
    dibuat: existing === null,
    tersimpan: {
      nik: tersimpan.nik,
      nomorWhatsApp: tersimpan.nomorWhatsApp,
      alamat: tersimpan.alamat,
      penghasilanBulanan: tersimpan.penghasilanBulanan,
    },
    fotoKtpId,
  };
}

/**
 * Nilai siap-pakai untuk form dari sebuah baris `nasabahProfil`, atau isian
 * kosong bila belum ada. Dipakai kedua jalur agar bentuk balasannya identik.
 */
export function bacaProfilUntukForm(row: {
  namaLengkap: string;
  nik: string;
  nomorWhatsApp: string;
  alamat?: string;
  pekerjaan?: string;
  penghasilanBulanan?: number;
  namaBank?: string;
  nomorRekening?: string;
} | null): {
  namaLengkap: string;
  nik: string;
  nomorWhatsApp: string;
  alamat: string;
  pekerjaan: string;
  penghasilanBulanan: number | null;
  namaBank: string;
  nomorRekening: string;
} {
  return {
    namaLengkap: row?.namaLengkap ?? "",
    nik: row?.nik ?? "",
    nomorWhatsApp: row?.nomorWhatsApp ?? "",
    alamat: row?.alamat ?? "",
    pekerjaan: row?.pekerjaan ?? "",
    penghasilanBulanan: row?.penghasilanBulanan ?? null,
    namaBank: row?.namaBank ?? "",
    nomorRekening: row?.nomorRekening ?? "",
  };
}
