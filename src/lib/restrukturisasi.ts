/**
 * Aturan restrukturisasi pinjaman — perpanjangan tenor skema harian.
 *
 * Batas yang dipegang berkas ini:
 *  - hanya pinjaman harian (bukan skema bulanan) yang bisa diperpanjang;
 *  - perpanjangan MENGGESER jatuh tempo, tidak mengubah pokok, bunga, atau
 *    total kewajiban yang sudah tercatat;
 *  - pengajuan wajib beralasan minimal 10 karakter, keputusan tetap di tangan
 *    admin ber-TOTP, setiap langkah diaudit, dan hanya satu pengajuan boleh
 *    menggantung per pinjaman.
 *
 * Angka total kewajiban tidak dihitung ulang di sini: itu wilayah
 * `lib/loan.ts` supaya tidak ada dua mesin uang.
 */

export const JENIS_RESTRUKTURISASI = ["perpanjangan_tenor"] as const;
export type JenisRestrukturisasi = (typeof JENIS_RESTRUKTURISASI)[number];

export const LABEL_JENIS_RESTRUKTURISASI: Record<JenisRestrukturisasi, string> = {
  perpanjangan_tenor: "Perpanjangan tenor",
};

export const STATUS_RESTRUKTURISASI = ["diajukan", "disetujui", "ditolak"] as const;
export type StatusRestrukturisasi = (typeof STATUS_RESTRUKTURISASI)[number];

export const LABEL_STATUS_RESTRUKTURISASI: Record<StatusRestrukturisasi, string> = {
  diajukan: "Menunggu keputusan",
  disetujui: "Disetujui",
  ditolak: "Ditolak",
};

/** Pilihan tambahan hari yang ditawarkan di panel; angka lain tetap divalidasi. */
export const TAMBAHAN_HARI_PILIHAN = [7, 14, 30] as const;

export const BATAS_RESTRUKTURISASI = {
  minTambahan: 1,
  maxTambahan: 90,
  maxTenor: 365,
  minAlasan: 10,
  maxAlasan: 500,
} as const;

export type HasilValidasi = { ok: true } | { ok: false; alasan: string };

export function validasiAlasanRestrukturisasi(alasan: string): HasilValidasi {
  const isi = alasan.trim();
  if (isi.length < BATAS_RESTRUKTURISASI.minAlasan) {
    return {
      ok: false,
      alasan: `Alasan restrukturisasi minimal ${BATAS_RESTRUKTURISASI.minAlasan} karakter supaya keputusannya bisa ditinjau.`,
    };
  }
  if (isi.length > BATAS_RESTRUKTURISASI.maxAlasan) {
    return {
      ok: false,
      alasan: `Alasan restrukturisasi maksimal ${BATAS_RESTRUKTURISASI.maxAlasan} karakter.`,
    };
  }
  return { ok: true };
}

/**
 * Periksa satu usulan perpanjangan dan hitung tenor barunya.
 * Dipakai form maupun server; keduanya memakai angka yang sama.
 */
export function validasiPerpanjanganTenor(data: {
  tenorLamaHari: number;
  tambahanHari: number;
}):
  | { ok: true; tenorBaruHari: number }
  | { ok: false; alasan: string } {
  const { tenorLamaHari, tambahanHari } = data;
  if (!Number.isSafeInteger(tenorLamaHari) || tenorLamaHari <= 0) {
    return { ok: false, alasan: "Tenor lama pinjaman tidak valid, jadi perpanjangan tidak dapat dihitung." };
  }
  if (
    !Number.isSafeInteger(tambahanHari) ||
    tambahanHari < BATAS_RESTRUKTURISASI.minTambahan ||
    tambahanHari > BATAS_RESTRUKTURISASI.maxTambahan
  ) {
    return {
      ok: false,
      alasan: `Tambahan hari harus bilangan bulat ${BATAS_RESTRUKTURISASI.minTambahan}–${BATAS_RESTRUKTURISASI.maxTambahan}.`,
    };
  }
  const tenorBaruHari = tenorLamaHari + tambahanHari;
  if (tenorBaruHari > BATAS_RESTRUKTURISASI.maxTenor) {
    return {
      ok: false,
      alasan: `Tenor baru ${tenorBaruHari} hari melewati batas ${BATAS_RESTRUKTURISASI.maxTenor} hari. Ajukan tambahan yang lebih kecil.`,
    };
  }
  return { ok: true, tenorBaruHari };
}

/** Jatuh tempo setelah perpanjangan, memakai aturan yang sama dengan lib/loan. */
export function jatuhTempoSetelahPerpanjangan(didanaiPada: number, tenorBaruHari: number): number {
  return didanaiPada + tenorBaruHari * 86_400_000;
}
