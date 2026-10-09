import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { bacaDataDiri, type DataDiriForm, type DataDiriTersimpan } from "../lib/dataDiri";
import { periksaBerkasIdentitasStorage } from "./berkasIdentitas";

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
 * - Foto KTP BARU diperiksa server (harus gambar, ≤ 5 MB) sebelum disimpan —
 *   batas yang hanya hidup di form bisa dilewati dengan mengirim langsung ke
 *   URL unggah.
 * - Foto KTP lama dihapus dari storage saat diganti atau dikosongkan, agar
 *   tidak menumpuk berkas yatim.
 *
 * - PUTUSAN VERIFIKASI IDENTITAS DIRESET saat data identitas berubah (nama,
 *   NIK, atau foto KTP). Putusan lama diambil atas data lama, jadi membiarkannya
 *   berarti menyatakan data BARU sudah terverifikasi padahal belum diperiksa.
 *
 * - Menyamakan `users.name` dengan nama KTP yang tersimpan, sehingga SELURUH
 *   layar yang membaca nama akun (pemilih nasabah, panel plafon, dashboard)
 *   menampilkan nama yang sama dengan ruang penyedia dana. Ini juga jalur
 *   perbaikan salah tulis nama: admin cukup memperbaiki di Data Diri.
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
  /** true bila putusan verifikasi identitas ikut dihapus karena data berubah. */
  verifikasiDireset: boolean;
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
  // Foto BARU diperiksa server dulu (bentuk + ukuran) sebelum apa pun ditulis.
  if (fotoKtpId !== undefined && fotoKtpId !== fotoLama) {
    await periksaBerkasIdentitasStorage(ctx, "Foto KTP", fotoKtpId);
  }
  if (fotoLama !== undefined && fotoLama !== fotoKtpId) {
    if ((await ctx.db.system.get("_storage", fotoLama)) !== null) {
      await ctx.storage.delete(fotoLama);
    }
  }

  // Putusan verifikasi identitas hanya berlaku untuk data yang diperiksa.
  const identitasBerubah =
    existing !== null &&
    (existing.namaLengkap !== tersimpan.namaLengkap ||
      existing.nik !== tersimpan.nik ||
      fotoLama !== fotoKtpId);
  const verifikasiDireset = identitasBerubah && existing?.verifikasiIdentitas !== undefined;

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
    // `undefined` menghapus kolomnya (Convex patch) — itulah jalur reset.
    verifikasiIdentitas: identitasBerubah ? undefined : existing?.verifikasiIdentitas,
  };
  if (existing === null) {
    await ctx.db.insert("nasabahProfil", { userId: args.userId, ...isi });
  } else {
    await ctx.db.patch(existing._id, isi);
  }

  // Nama akun mengikuti nama KTP (HURUF BESAR, lihat lib/nama.ts): semua layar
  // yang membaca `users.name` jadi seragam dengan data pinjaman di ruang
  // penyedia dana, dan memperbaiki salah tulis nama cukup dilakukan sekali.
  const pemilik = await ctx.db.get(args.userId);
  if (pemilik !== null && pemilik.name !== tersimpan.namaLengkap) {
    await ctx.db.patch(args.userId, { name: tersimpan.namaLengkap });
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
    verifikasiDireset,
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
