/**
 * OtpResume — persistensi session OTP yang aman.
 *
 * Yang disimpan di browser HANYA:
 *  - jenis sesi (mis. "wa_otp")
 *  - tujuannya (mis. "verifikasi_nomor")
 *  - ID sesi yang dikembalikan server (jika server memberi cara resume)
 *  - waktu kedaluwarsa dari server (bila tersedia)
 *
 * Yang TIDAK PERNAH disimpan di browser:
 *  - kode OTP
 *  - nomor WhatsApp utuh
 *  - token sensitif
 *
 * Frontend TIDAK boleh menjadi sumber kebenaran expiry. Timer frontend hanya
 * perkiraan; keputusan valid/invalid harus datang dari server.
 */

const KEY_PREFIX = "pinjai.otp.resume.";

export type OtpResumeData = {
  /** Mis. "wa_otp". */
  kind: string;
  /** Mis. "verifikasi_nomor". */
  purpose: string;
  /** Opsional; ID session yang dikembalikan server untuk resume (bukan kode). */
  sessionId?: string;
  /** Opsional; waktu kedaluwarsa milidetik dari server (bila tersedia). */
  serverExpiresAt?: number;
  /** Kapan frontend terakhir kali menyimpan/memperbarui stempel ini. */
  lastUpdatedAt: number;
};

function keyFor(purpose: string): string {
  return `${KEY_PREFIX}${purpose}`;
}

function bacaDariStorage(purpose: string): OtpResumeData | null {
  try {
    const raw = sessionStorage.getItem(keyFor(purpose));
    if (!raw) return null;
    const data = JSON.parse(raw) as OtpResumeData;
    if (!data || typeof data.kind !== "string" || typeof data.purpose !== "string") {
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function tulisKeStorage(purpose: string, data: OtpResumeData): void {
  try {
    sessionStorage.setItem(keyFor(purpose), JSON.stringify(data));
  } catch {
    // sessionStorage bisa tidak tersedia / ditolak di lingkungan tertentu.
  }
}

/**
 * Simpan stempel session OTP non-sensitif.
 *
 * `serverExpiresAt` opsional; bila tidak ada, frontend tidak boleh berasumsi
 * expiry yang akurat.
 */
export function simpanStempelOtp(data: OtpResumeData): void {
  tulisKeStorage(data.purpose, {
    ...data,
    lastUpdatedAt: Date.now(),
  });
}

/**
 * Baca stempel session OTP non-sensitif untuk tujuan tertentu.
 */
export function bacaStempelOtp(purpose: string): OtpResumeData | null {
  return bacaDariStorage(purpose);
}

/**
 * Hapus stempel session OTP (mis. sesudah verifikasi berhasil/kadaluarsa).
 */
export function hapusStempelOtp(purpose: string): void {
  try {
    sessionStorage.removeItem(keyFor(purpose));
  } catch {
    // ignore
  }
}

/**
 * Sediakan estimasi sisa waktu (detik) dari server expiry, kalau ada.
 *
 * Hasil bisa negatif bila server sudah mengatakan expired.
 * Bila server tidak memberi expiry, kembalikan null (tidak boleh dikira-kira).
 */
export function sisaDetikDariServer(data: OtpResumeData | null): number | null {
  if (!data || !data.serverExpiresAt) return null;
  return Math.max(0, Math.floor((data.serverExpiresAt - Date.now()) / 1000));
}

/**
 * Sinyal UX: berdasarkan stempel + server expiry (jika ada), apakah layak
 * menampilkan "kode masih berlaku"?
 *
 * Aturan:
 *  - Jika serverExpiresAt ada DAN masih > 0 detik → masih berlaku (estimasi).
 *  - Jika serverExpiresAt ada DAN sudah <= 0 → sudah kedaluwarsa.
 *  - Jika serverExpiresAt TIDAK ada → tidak boleh menyatakan "masih berlaku";
 *    frontend cuma tahu "ada sesi yang perlu diverifikasi statusnya".
 */
export function keputusanTampilanOtp(data: OtpResumeData | null): {
  adaStempel: boolean;
  serverKetahuiExpired: boolean;
  serverKetahuiMasihBerlaku: boolean;
  tidakTahuExpiry: boolean;
} {
  if (!data) {
    return { adaStempel: false, serverKetahuiExpired: false, serverKetahuiMasihBerlaku: false, tidakTahuExpiry: false };
  }
  const sisa = data.serverExpiresAt ? Math.floor((data.serverExpiresAt - Date.now()) / 1000) : null;
  const serverKetahuiExpired = sisa !== null && sisa <= 0;
  const serverKetahuiMasihBerlaku = sisa !== null && sisa > 0;
  const tidakTahuExpiry = sisa === null;
  return {
    adaStempel: true,
    serverKetahuiExpired,
    serverKetahuiMasihBerlaku,
    tidakTahuExpiry,
  };
}

/**
 * Audit log teknis untuk OTP session lifecycle.
 *
 * Boleh mencatat: OTP_SESSION_RESUMED, OTP_SESSION_EXPIRED,
 * OTP_SESSION_RESUME_UNAVAILABLE.
 *
 * Tidak boleh mencatat kode OTP, nomor lengkap, atau token.
 */
export function auditOtpEvent(event: string, meta?: Record<string, string | number | boolean | undefined>): void {
  if (typeof console === "undefined") return;
  try {
    console.info(`[otp-resume] ${event}`, meta ?? "");
  } catch {
    // ignore
  }
}
