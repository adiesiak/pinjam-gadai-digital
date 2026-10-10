/**
 * Status & transisi modul KYC PINDAI — logika MURNI (tanpa React, Convex, DOM)
 * supaya bisa diuji sebagai skrip biasa (`bun src/lib/kycStatus.test.ts`).
 *
 * Kenapa berkas ini ada: status KYC menentukan apakah identitas seseorang sudah
 * diperiksa petugas, dan siapa yang boleh mengubahnya. Kalau aturan transisi
 * ditulis ulang di mutation, di dialog admin, dan di tombol UI, cepat atau
 * lambat akan ada satu tempat yang lupa memeriksa — dan status berubah tanpa
 * hak. Server tetap memutuskan (`convex/kyc.ts` memanggil fungsi di sini), UI
 * hanya memakainya untuk menyembunyikan tindakan yang memang tidak sah.
 *
 * Batas penting yang dijaga di sini dan di seluruh modul:
 * - Status KYC TIDAK berarti pinjaman disetujui dan TIDAK berarti dana cair.
 * - Hanya PETUGAS yang boleh memutuskan (VERIFIED/REJECTED/NEEDS_CORRECTION);
 *   perubahan data oleh nasabah tidak pernah bisa menaikkan status sendiri.
 * - Setiap transisi wajib punya aktor dan (untuk keputusan) alasan.
 *
 * Catatan istilah: nilai status memakai huruf besar tanpa spasi sesuai
 * ketentuan produk (NOT_STARTED, IN_PROGRESS, …). Label yang dilihat pengguna
 * ada di `LABEL_STATUS_KYC` — satu tempat untuk seluruh halaman.
 */

/** Status KYC yang sah — urutan sesuai daftar produk. */
export const KYC_STATUS = [
  "NOT_STARTED",
  "IN_PROGRESS",
  "PENDING_REVIEW",
  "NEEDS_CORRECTION",
  "VERIFIED",
  "REJECTED",
  "REVERIFICATION_REQUIRED",
] as const;

export type StatusKyc = (typeof KYC_STATUS)[number];

/** Siapa yang mengubah status — selalu dicatat bersama waktu & alasan. */
export type AktorKyc = "nasabah" | "admin" | "sistem";

/**
 * Transisi yang SAH beserta aktor yang boleh melakukannya.
 *
 * Daftar ini sengaja tertutup: apa pun yang tidak ada di sini ditolak server.
 * Aturan yang paling penting:
 * - `VERIFIED` hanya bisa datang dari `PENDING_REVIEW` oleh petugas — tidak ada
 *   jalan dari data yang diisi sendiri langsung menjadi terverifikasi.
 * - `REJECTED`/`NEEDS_CORRECTION` juga keputusan petugas, dan keduanya wajib
 *   beralasan (dipaksa di server) supaya nasabah tahu apa yang harus diperbaiki.
 * - `VERIFIED` → `REVERIFICATION_REQUIRED` dipicu SISTEM saat data identitas
 *   penting berubah; petugas juga boleh memicunya (mis. dokumen dicurigai).
 * - `PENDING_REVIEW` → `IN_PROGRESS` hanya oleh nasabah: menyunting pengajuan
 *   menariknya kembali (lihat `statusSetelahSunting`), bukan keputusan petugas.
 */
export const TRANSISI_SAH: Record<StatusKyc, ReadonlyArray<{ ke: StatusKyc; oleh: AktorKyc[] }>> = {
  NOT_STARTED: [{ ke: "IN_PROGRESS", oleh: ["nasabah"] }],
  IN_PROGRESS: [{ ke: "PENDING_REVIEW", oleh: ["nasabah"] }],
  PENDING_REVIEW: [
    { ke: "VERIFIED", oleh: ["admin"] },
    { ke: "NEEDS_CORRECTION", oleh: ["admin"] },
    { ke: "REJECTED", oleh: ["admin"] },
    // Nasabah boleh MENARIK pengajuan yang sedang ditinjau dengan menyunting
    // datanya; petugas tidak boleh meninjau data yang berubah di belakangnya.
    { ke: "IN_PROGRESS", oleh: ["nasabah"] },
  ],
  NEEDS_CORRECTION: [
    { ke: "PENDING_REVIEW", oleh: ["nasabah"] },
    { ke: "REJECTED", oleh: ["admin"] },
  ],
  REJECTED: [{ ke: "IN_PROGRESS", oleh: ["nasabah"] }],
  REVERIFICATION_REQUIRED: [
    { ke: "IN_PROGRESS", oleh: ["nasabah"] },
    { ke: "PENDING_REVIEW", oleh: ["nasabah"] },
  ],
  VERIFIED: [{ ke: "REVERIFICATION_REQUIRED", oleh: ["sistem", "admin"] }],
};

/** Status yang berarti menunggu tindakan ORANG LAIN (petugas). */
export const STATUS_MENUNGGU_PETUGAS: StatusKyc[] = ["PENDING_REVIEW"];

/** Status yang butuh tindakan NASABAH sendiri. */
export const STATUS_BUTUH_TINDAKAN_NASABAH: StatusKyc[] = [
  "NOT_STARTED",
  "IN_PROGRESS",
  "NEEDS_CORRECTION",
  "REJECTED",
  "REVERIFICATION_REQUIRED",
];

/** Status yang sudah final (tidak ada pekerjaan tersisa bagi nasabah). */
export function statusFinal(status: StatusKyc): boolean {
  return status === "VERIFIED";
}

/** true bila transisi `dari → ke` sah untuk aktor tersebut. */
export function bolehTransisi(dari: StatusKyc, ke: StatusKyc, oleh: AktorKyc): boolean {
  if (dari === ke) return false;
  return (TRANSISI_SAH[dari] ?? []).some((t) => t.ke === ke && t.oleh.includes(oleh));
}

/** Daftar tujuan yang sah dari sebuah status untuk satu aktor (untuk UI). */
export function tujuanSah(dari: StatusKyc, oleh: AktorKyc): StatusKyc[] {
  return (TRANSISI_SAH[dari] ?? []).filter((t) => t.oleh.includes(oleh)).map((t) => t.ke);
}

/**
 * Keputusan petugas yang MENUNTUT alasan tertulis. Server memaksa ini; tanpa
 * alasan, nasabah hanya tahu "ditolak" tanpa tahu apa yang harus diperbaiki.
 */
export function keputusanWajibAlasan(ke: StatusKyc): boolean {
  return ke === "REJECTED" || ke === "NEEDS_CORRECTION";
}

/* ==========================================================================
 * Kelengkapan isian
 * ========================================================================== */

/** Isian KYC yang disimpan modul ini (semua opsional saat masih progres). */
export type IsianKycRingkas = {
  namaLengkap?: string | null;
  nik?: string | null;
  nomorWhatsApp?: string | null;
  /** Rupiah bulat; null bila belum diisi. */
  penghasilanBulanan?: number | null;
  sumberPenghasilan?: string | null;
  /** Id berkas di Convex storage; null bila belum diunggah. */
  ktpId?: string | null;
  selfieKtpId?: string | null;
  buktiPenghasilanId?: string | null;
};

/** Daftar isian yang belum lengkap, dengan label siap tampil. */
export function kekuranganKyc(isian: IsianKycRingkas): string[] {
  const kurang: string[] = [];
  if ((isian.namaLengkap ?? "").trim().length < 3) kurang.push("Nama lengkap sesuai KTP");
  if (!/^\d{16}$/.test((isian.nik ?? "").replace(/\s+/g, ""))) kurang.push("NIK 16 angka");
  if (!/^62\d{8,13}$/.test((isian.nomorWhatsApp ?? "").replace(/[\s+-]/g, ""))) {
    kurang.push("Nomor WhatsApp format 62…");
  }
  if (
    isian.penghasilanBulanan === null ||
    isian.penghasilanBulanan === undefined ||
    !Number.isSafeInteger(isian.penghasilanBulanan) ||
    isian.penghasilanBulanan <= 0
  ) {
    kurang.push("Penghasilan per bulan (rupiah bulat)");
  }
  if ((isian.sumberPenghasilan ?? "").trim().length < 3) kurang.push("Sumber penghasilan");
  if (!isian.ktpId) kurang.push("Foto KTP");
  if (!isian.selfieKtpId) kurang.push("Selfie dengan KTP");
  if (!isian.buktiPenghasilanId) kurang.push("Bukti penghasilan");
  return kurang;
}

/** true bila semua isian wajib sudah ada (syarat mengajukan peninjauan). */
export function lengkapKyc(isian: IsianKycRingkas): boolean {
  return kekuranganKyc(isian).length === 0;
}

/* ==========================================================================
 * Verifikasi ulang setelah data penting berubah
 * ========================================================================== */

/**
 * Data yang dianggap IDENTITAS PENTING. Putusan verifikasi diambil atas data
 * ini, jadi perubahannya membatalkan putusan lama.
 *
 * Alamat/pekerjaan/rekening sengaja TIDAK termasuk: itu data kontak & pencairan
 * yang bisa berubah tanpa membuat foto KTP/nama/NIK yang sudah diperiksa menjadi
 * salah. Kebijakan ini disimpan di sini supaya alasan "verifikasi ulang"
 * seragam di semua jalur.
 */
export type StempelIdentitas = {
  namaLengkap: string;
  nik: string;
  ktpId: string | null;
  selfieKtpId: string | null;
  buktiPenghasilanId: string | null;
};

/** Ambil stempel dari isian sekarang (dipakai saat VERIFIED dicatat). */
export function stempelIdentitas(isian: IsianKycRingkas): StempelIdentitas {
  return {
    namaLengkap: (isian.namaLengkap ?? "").trim().toUpperCase(),
    nik: (isian.nik ?? "").replace(/\s+/g, ""),
    ktpId: isian.ktpId ?? null,
    selfieKtpId: isian.selfieKtpId ?? null,
    buktiPenghasilanId: isian.buktiPenghasilanId ?? null,
  };
}

/** true bila ada data identitas penting yang berbeda dari yang diverifikasi. */
export function perluVerifikasiUlang(
  stempel: StempelIdentitas | null,
  isian: IsianKycRingkas,
): boolean {
  if (stempel === null) return false;
  const sekarang = stempelIdentitas(isian);
  return (
    stempel.namaLengkap !== sekarang.namaLengkap ||
    stempel.nik !== sekarang.nik ||
    stempel.ktpId !== sekarang.ktpId ||
    stempel.selfieKtpId !== sekarang.selfieKtpId ||
    stempel.buktiPenghasilanId !== sekarang.buktiPenghasilanId
  );
}

/**
 * Status setelah isian disunting nasabah (bukan keputusan petugas).
 *
 * - `PENDING_REVIEW` ditarik kembali ke `IN_PROGRESS`: pengajuan yang sedang
 *   ditinjau tidak boleh berubah di belakang petugas.
 * - `REJECTED` kembali ke `IN_PROGRESS`: peninjauan ulang dimulai dari perbaikan
 *   data, bukan langsung dikirim ulang tanpa perubahan.
 * - `VERIFIED` hanya turun bila identitas penting berubah (lihat
 *   `perluVerifikasiUlang`); selebihnya tetap `VERIFIED`.
 */
export function statusSetelahSunting(
  status: StatusKyc,
  stempel: StempelIdentitas | null,
  isian: IsianKycRingkas,
): StatusKyc {
  if (status === "VERIFIED") {
    return perluVerifikasiUlang(stempel, isian) ? "REVERIFICATION_REQUIRED" : "VERIFIED";
  }
  // Simpanan pertama = memulai modul KYC (NOT_STARTED → IN_PROGRESS).
  if (status === "NOT_STARTED") return "IN_PROGRESS";
  if (status === "PENDING_REVIEW") return "IN_PROGRESS";
  if (status === "REJECTED") return "IN_PROGRESS";
  return status;
}

/* ==========================================================================
 * Label & nada tampilan — dipakai SEMUA halaman agar status tidak berbeda arti
 * ========================================================================== */

export const LABEL_STATUS_KYC: Record<StatusKyc, string> = {
  NOT_STARTED: "Belum dimulai",
  IN_PROGRESS: "Sedang diisi",
  PENDING_REVIEW: "Menunggu peninjauan",
  NEEDS_CORRECTION: "Perlu perbaikan",
  VERIFIED: "Terverifikasi",
  REJECTED: "Ditolak",
  REVERIFICATION_REQUIRED: "Perlu verifikasi ulang",
};

/**
 * Kalimat penjelas per status. Dua hal sengaja ditegaskan: `VERIFIED` bukan
 * persetujuan pinjaman/pencairan dana, dan setiap status butuh tindakan yang
 * jelas dari pihak tertentu.
 */
export const KETERANGAN_STATUS_KYC: Record<StatusKyc, string> = {
  NOT_STARTED: "KYC belum dimulai. Mulai dari nama, NIK, dan nomor WhatsApp.",
  IN_PROGRESS: "Isian tersimpan sebagai progres. Ajukan bila semua berkas sudah lengkap.",
  PENDING_REVIEW:
    "Sudah dikirim dan sedang menunggu peninjauan petugas. Isian dikunci sampai ada keputusan.",
  NEEDS_CORRECTION: "Petugas meminta perbaikan. Baca alasannya, perbaiki, lalu kirim ulang.",
  VERIFIED:
    "Identitas sudah diperiksa petugas. Status ini bukan persetujuan pinjaman dan bukan bukti dana cair.",
  REJECTED: "Pengajuan KYC ditolak. Baca alasannya, perbarui data, lalu mulai peninjauan ulang.",
  REVERIFICATION_REQUIRED:
    "Data identitas penting berubah setelah verifikasi, jadi perlu diperiksa ulang petugas.",
};

/**
 * Nada warna lencana per status. Nada SELALU berpasangan dengan label teks —
 * warna hanya mempercepat pembacaan, bukan satu-satunya penanda.
 */
export const NADA_STATUS_KYC: Record<StatusKyc, string> = {
  NOT_STARTED: "border-slate-200 bg-slate-100 text-slate-600",
  IN_PROGRESS: "border-sky-200 bg-sky-100 text-sky-700",
  PENDING_REVIEW: "border-amber-200 bg-amber-100 text-amber-800",
  NEEDS_CORRECTION: "border-orange-200 bg-orange-100 text-orange-800",
  VERIFIED: "border-emerald-200 bg-emerald-100 text-emerald-700",
  REJECTED: "border-red-200 bg-red-100 text-red-700",
  REVERIFICATION_REQUIRED: "border-violet-200 bg-violet-100 text-violet-800",
};

/**
 * Kalimat status untuk berkas lain (mis. banner di tab pengajuan) yang hanya
 * butuh satu baris ringkas tanpa membuka modul KYC.
 */
export function ringkasStatusKyc(status: StatusKyc): string {
  if (status === "VERIFIED") return "KYC terverifikasi (bukan persetujuan pinjaman).";
  if (status === "PENDING_REVIEW") return "KYC sedang menunggu peninjauan petugas.";
  if (status === "NOT_STARTED") return "KYC belum dimulai.";
  return `KYC: ${LABEL_STATUS_KYC[status].toLowerCase()}.`;
}

/* ==========================================================================
 * Hasil pemeriksaan nomor WhatsApp (OTP)
 * ========================================================================== */

/**
 * Kalimat hasil pemeriksaan nomor WhatsApp — dipakai halaman nasabah DAN panel
 * petugas, supaya arti "terverifikasi" tidak berbeda di dua tempat.
 *
 * Penghitungan keabsahan bukti OTP (cocok/tidak dengan nomor yang tersimpan)
 * dilakukan SERVER di `convex/kyc.ts` dan dikirim sebagai `cocok`; berkas ini
 * hanya menyediakan kalimatnya. Batas pentingnya tetap sama: verifikasi nomor
 * membuktikan nomor itu AKTIF, bukan bahwa seluruh identitas sudah diperiksa
 * petugas.
 */
export function keteranganNomorWa(terverifikasi: boolean): string {
  return terverifikasi
    ? "Nomor WhatsApp sudah dibuktikan aktif lewat kode OTP yang dikirim ke nomor itu sendiri. Ini satu hasil pemeriksaan — bukan persetujuan pinjaman."
    : "Nomor WhatsApp belum dibuktikan. Kirim kode OTP ke nomor ini, lalu masukkan 6 digit untuk memverifikasi.";
}
