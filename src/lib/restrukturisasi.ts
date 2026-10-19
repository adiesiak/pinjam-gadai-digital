/**
 * Aturan restrukturisasi pinjaman — perpanjangan tenor dan usulan cicilan.
 *
 * Batas yang dipegang berkas ini:
 *  - perpanjangan tenor hanya untuk pinjaman harian; usulan cicilan boleh
 *    diajukan untuk pinjaman harian maupun bulanan yang sedang berjalan;
 *  - perpanjangan MENGGESER jatuh tempo, tidak mengubah pokok, bunga, atau
 *    total kewajiban yang sudah tercatat;
 *  - usulan cicilan hanya usulan nominal — jadwal dan pencatatan pembayaran
 *    tetap ditangani tim di luar aplikasi, jadi tidak ada angka yang diubah
 *    otomatis saat disetujui;
 *  - pengajuan wajib beralasan minimal 10 karakter, keputusan tetap di tangan
 *    admin ber-TOTP, setiap langkah diaudit, dan hanya satu pengajuan boleh
 *    menggantung per pinjaman.
 *
 * Angka total kewajiban tidak dihitung ulang di sini: itu wilayah
 * `lib/loan.ts` supaya tidak ada dua mesin uang.
 */

export const JENIS_RESTRUKTURISASI = ["perpanjangan_tenor", "cicilan"] as const;
export type JenisRestrukturisasi = (typeof JENIS_RESTRUKTURISASI)[number];

export const LABEL_JENIS_RESTRUKTURISASI: Record<JenisRestrukturisasi, string> = {
  perpanjangan_tenor: "Perpanjangan tenor",
  cicilan: "Usulan cicilan",
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
  /** Cicilan di bawah ini tidak masuk akal untuk pinjaman PINDAI. */
  minUsulanCicilan: 50_000,
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

/**
 * Usulan awal cicilan: bagi total menjadi tiga kali, dibulatkan ke atas 10
 * ribu. Dipakai formulir nasabah supaya angka awalnya tidak nol.
 */
export function saranUsulanCicilan(totalKewajiban: number): number {
  if (totalKewajiban <= 0) return BATAS_RESTRUKTURISASI.minUsulanCicilan;
  const kasar = Math.ceil(totalKewajiban / 3 / 10_000) * 10_000;
  return Math.max(BATAS_RESTRUKTURISASI.minUsulanCicilan, kasar);
}

/**
 * Periksa usulan nominal cicilan dari nasabah.
 *
 * Batas atas memakai total kewajiban yang dihitung mesin pinjaman, bukan angka
 * pilihan klien: usulan di atas kewajiban berarti nasabah salah paham, dan
 * lebih baik ditolak di formulir daripada diteruskan ke admin.
 */
export function validasiUsulanCicilan(data: {
  usulanCicilan: number;
  totalKewajiban: number;
}):
  | { ok: true; perkiraanJumlahCicilan: number }
  | { ok: false; alasan: string } {
  const { usulanCicilan, totalKewajiban } = data;
  if (!Number.isSafeInteger(usulanCicilan) || usulanCicilan <= 0) {
    return { ok: false, alasan: "Usulan cicilan harus rupiah bulat positif." };
  }
  if (usulanCicilan < BATAS_RESTRUKTURISASI.minUsulanCicilan) {
    return {
      ok: false,
      alasan: `Usulan cicilan minimal ${BATAS_RESTRUKTURISASI.minUsulanCicilan.toLocaleString("id-ID")} rupiah per pembayaran.`,
    };
  }
  if (!Number.isSafeInteger(totalKewajiban) || totalKewajiban <= 0) {
    return { ok: false, alasan: "Total kewajiban pinjaman belum bisa dihitung, jadi usulan cicilan belum dapat diperiksa." };
  }
  if (usulanCicilan > totalKewajiban) {
    return {
      ok: false,
      alasan: "Usulan cicilan melebihi total kewajiban pinjaman. Periksa kembali nominalnya.",
    };
  }
  return { ok: true, perkiraanJumlahCicilan: Math.ceil(totalKewajiban / usulanCicilan) };
}
