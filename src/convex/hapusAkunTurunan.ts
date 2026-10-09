/**
 * Pembersihan baris turunan AKUN nasabah — satu sumber untuk jalur hapus akun
 * (`admin.hapusNasabah`) maupun penggabungan nasabah kembar
 * (`duplikatNasabah.gabungNasabah`).
 *
 * Yang dibersihkan hanyalah baris yang tak lagi bermakna tanpa pemiliknya:
 * kredensial auth, sesi auth, MFA, consent & status lokasi, perangkat
 * terdaftar, sesi internal, jejak lokasi, data diri (beserta foto KTP di
 * storage), DAN seluruh baris KYC mandiri (progres + riwayat status) beserta
 * berkas KTP/selfie/bukti penghasilan dan penanda pemeriksaannya. Riwayat
 * KEUANGAN (pinjaman, gadai, kredit barang, pembayaran, jurnal) sengaja TIDAK
 * disentuh di sini — pemanggil yang memutuskan apakah baris itu dipindahkan ke
 * akun utama atau dibiarkan utuh sebagai jejak.
 *
 * Kenapa berkas KYC ikut dihapus: setelah akunnya hilang, tak ada lagi dasar
 * untuk menyimpan foto identitasnya — membiarkannya berarti menyimpan data
 * pribadi lebih lama dari yang diperlukan.
 *
 * Kontraknya sengaja mengembalikan angka per tabel, bukan hanya total, supaya
 * audit trail bisa menyebutkan apa yang benar-benar terjadi (Zero Fake Data).
 */
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

export type RincianTurunanAkun = {
  /** Baris authAccounts (email/OTP) milik akun. */
  akunAuth: number;
  /** Baris authSessions milik akun. */
  sesiAuth: number;
  mfa: number;
  consent: number;
  statusLokasi: number;
  perangkat: number;
  sesiInternal: number;
  jejak: number;
  /** Baris nasabahProfil yang ikut dihapus. */
  profil: number;
  /** Baris kycProfil (progres + putusan KYC) yang ikut dihapus. */
  kycProfil: number;
  /** Baris kycRiwayat (riwayat status KYC) yang ikut dihapus. */
  kycRiwayat: number;
  /** Baris berkasTerverifikasi milik berkas KYC pengguna ini. */
  berkasKyc: number;
  /** Berkas KYC (KTP/selfie/bukti) yang benar-benar dihapus dari storage. */
  berkasKycStorage: number;
};

/** Jumlah seluruh baris turunan (di luar akun & sesi auth). */
export function totalTurunanAkun(r: RincianTurunanAkun): number {
  return (
    r.mfa +
    r.consent +
    r.statusLokasi +
    r.perangkat +
    r.sesiInternal +
    r.jejak +
    r.profil +
    r.kycProfil +
    r.kycRiwayat +
    r.berkasKyc
  );
}

/**
 * Hapus kredensial/sesi auth, baris turunan akun, dan seluruh data KYC mandiri
 * (termasuk berkas KTP/selfie/bukti penghasilan di storage). `nasabahProfil`
 * yang ditemukan di sini ikut dihapus beserta foto KTP-nya — pemanggil yang
 * ingin MEMINDAHKAN data diri harus memindahkannya lebih dulu, sebelum memanggil
 * ini. Pemanggil yang menggabungkan nasabah kembar karena itu harus memastikan
 * baris KYC akun utama sudah benar sebelum sumbernya dibersihkan di sini.
 */
export async function hapusTurunanAkun(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<RincianTurunanAkun> {
  // Akun auth + sesi turunannya.
  const akunAuth = await ctx.db
    .query("authAccounts")
    .withIndex("userIdAndProvider", (q) => q.eq("userId", userId))
    .collect();
  for (const row of akunAuth) await ctx.db.delete(row._id);
  const sesiAuth = await ctx.db
    .query("authSessions")
    .withIndex("userId", (q) => q.eq("userId", userId))
    .collect();
  for (const row of sesiAuth) await ctx.db.delete(row._id);

  const [mfa, consent, statusLokasi, perangkat, sesiInternal, jejak, profil, kyc, kycRiwayat] =
    await Promise.all([
      ctx.db.query("mfaSettings").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("trackingConsents").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("lokasiStatus").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("perangkat").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("sessions").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("lokasiJejak").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("nasabahProfil").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("kycProfil").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("kycRiwayat").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
    ]);

  // Berkas identitas KYC: hapus PENANDA pemeriksaannya dan berkas di storage.
  // Blob-nya ditelusuri dari id di baris KYC (indeks `by_storageId`) — bukan
  // menyalin seluruh tabel `berkasTerverifikasi` yang berisi milik pengguna lain.
  const idBerkasKyc = kyc
    .flatMap((r) => [r.ktpId, r.selfieKtpId, r.buktiPenghasilanId])
    .filter((id): id is Id<"_storage"> => id !== undefined);
  let berkasKyc = 0;
  let berkasKycStorage = 0;
  for (const storageId of idBerkasKyc) {
    const penanda = await ctx.db
      .query("berkasTerverifikasi")
      .withIndex("by_storageId", (q) => q.eq("storageId", storageId))
      .collect();
    for (const row of penanda) {
      await ctx.db.delete(row._id);
      berkasKyc += 1;
    }
    if ((await ctx.storage.getMetadata(storageId)) !== null) {
      await ctx.storage.delete(storageId);
      berkasKycStorage += 1;
    }
  }

  // Foto KTP ikut dihapus — tanpa baris pemiliknya, berkas itu menjadi yatim.
  for (const p of profil) {
    if (p.fotoKtpId !== undefined && (await ctx.storage.getMetadata(p.fotoKtpId)) !== null) {
      await ctx.storage.delete(p.fotoKtpId);
    }
  }
  for (const row of [
    ...mfa,
    ...consent,
    ...statusLokasi,
    ...perangkat,
    ...sesiInternal,
    ...jejak,
    ...profil,
    ...kyc,
    ...kycRiwayat,
  ]) {
    await ctx.db.delete(row._id);
  }

  return {
    akunAuth: akunAuth.length,
    sesiAuth: sesiAuth.length,
    mfa: mfa.length,
    consent: consent.length,
    statusLokasi: statusLokasi.length,
    perangkat: perangkat.length,
    sesiInternal: sesiInternal.length,
    jejak: jejak.length,
    profil: profil.length,
    kycProfil: kyc.length,
    kycRiwayat: kycRiwayat.length,
    berkasKyc,
    berkasKycStorage,
  };
}
