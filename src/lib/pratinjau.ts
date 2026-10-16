/**
 * UTILITAS PRATINJAU (sisi klien) — menyimpan & memulihkan sesi admin.
 *
 * Saat Super Admin "masuk sebagai" seorang pendana/peminjam, peramban benar-benar
 * berpindah ke sesi akun itu (lihat `convex/auth/pratinjau.ts`). Supaya admin
 * tidak perlu mengetik kata sandi + TOTP lagi setelah selesai, token sesi
 * adminnya disalin lebih dulu ke kunci khusus di `localStorage`, lalu ditulis
 * kembali saat pratinjau ditutup.
 *
 * Yang disalin adalah kunci milik Convex Auth sendiri (`__convexAuthJWT`,
 * `__convexAuthRefreshToken`, …). Awalan `__convexAuth` dipakai sebagai pola,
 * bukan nama kunci lengkap, karena Convex Auth menambahkan akhiran namespace
 * (alamat deployment) pada setiap kunci — menulis nama kunci secara hardcode
 * akan gagal pada deployment lain.
 *
 * Kalau penyimpanan lokal diblokir, pratinjau TIDAK dijalankan: tanpanya sesi
 * admin tidak bisa dikembalikan, dan itu membuat pemilik akun kehilangan jalan
 * pulang. `simpanSesiAsli` karena itu mengembalikan `false` alih-alih diam.
 */

/** Kunci salinan token sesi admin yang sedang dipakai. */
export const KUNCI_SESI_ASLI = "pindai.pratinjau.sesiAsli";

/** Kunci nonce peramban ini — pencocok baris pratinjau di server. */
export const KUNCI_NONCE = "pindai.pratinjau.nonce";

/** Awalan kunci milik Convex Auth (JWT, refresh token, cap waktu). */
const AWALAN_TOKEN = "__convexAuth";

/** Panjang nonce (heksadesimal) — di dalam rentang yang diterima server. */
const PANJANG_BYTE_NONCE = 24;

function adaStorage(): boolean {
  try {
    return typeof window !== "undefined" && window.localStorage !== null;
  } catch {
    return false;
  }
}

/**
 * Nonce acak per permintaan pratinjau. Dikirim ke server saat minta tiket dan
 * disimpan di peramban; pasangan itulah yang membedakan pratinjau di peramban
 * ini dari pratinjau lain atas akun yang sama.
 */
export function buatNonce(): string {
  const bytes = new Uint8Array(PANJANG_BYTE_NONCE);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Kumpulkan seluruh kunci sesi Convex Auth yang sedang ada. */
function kumpulkanToken(): Record<string, string> {
  const hasil: Record<string, string> = {};
  const { localStorage } = window;
  for (let i = 0; i < localStorage.length; i += 1) {
    const kunci = localStorage.key(i);
    if (kunci === null || !kunci.startsWith(AWALAN_TOKEN)) continue;
    const nilai = localStorage.getItem(kunci);
    if (nilai !== null) hasil[kunci] = nilai;
  }
  return hasil;
}

/**
 * Simpan sesi admin yang sedang aktif. `false` berarti pratinjau tidak boleh
 * dilanjutkan: penyimpanan lokal tidak tersedia, atau tidak ada token yang bisa
 * disalin (mis. sesi belum siap).
 */
export function simpanSesiAsli(): boolean {
  if (!adaStorage()) return false;
  try {
    const token = kumpulkanToken();
    const jwt = Object.keys(token).find((k) => k.startsWith(`${AWALAN_TOKEN}JWT`));
    if (jwt === undefined) return false;
    window.localStorage.setItem(
      KUNCI_SESI_ASLI,
      JSON.stringify({ pada: Date.now(), token }),
    );
    return true;
  } catch {
    return false;
  }
}

/** Ada salinan sesi admin yang menunggu dipulihkan? */
export function adaSesiAsli(): boolean {
  if (!adaStorage()) return false;
  try {
    const mentah = window.localStorage.getItem(KUNCI_SESI_ASLI);
    if (mentah === null) return false;
    const isi = JSON.parse(mentah) as { token?: Record<string, string> };
    return isi.token !== undefined && Object.keys(isi.token).length > 0;
  } catch {
    return false;
  }
}

/** Nonce pratinjau peramban ini (null = tidak sedang dalam pratinjau). */
export function bacaNonce(): string | null {
  if (!adaStorage()) return null;
  try {
    const nilai = window.localStorage.getItem(KUNCI_NONCE);
    return nilai === null || nilai === "" ? null : nilai;
  } catch {
    return null;
  }
}

/** Simpan nonce pratinjau yang sedang berjalan. */
export function simpanNonce(nonce: string): void {
  if (!adaStorage()) return;
  try {
    window.localStorage.setItem(KUNCI_NONCE, nonce);
  } catch {
    // Penyimpanan gagal: pratinjau tetap berjalan, hanya bilahnya yang tidak
    // menemukan nonce — pemulihan sesi admin tetap tersedia lewat salinannya.
  }
}

/** Buang penanda pratinjau (dipakai saat pratinjau batal atau sudah ditutup). */
export function bersihkanPenandaPratinjau(): void {
  if (!adaStorage()) return;
  try {
    window.localStorage.removeItem(KUNCI_NONCE);
    window.localStorage.removeItem(KUNCI_SESI_ASLI);
  } catch {
    // Tidak ada yang bisa dilakukan bila penyimpanan diblokir.
  }
}

/**
 * Tulis kembali sesi admin: kunci Convex Auth yang sekarang (milik akun target)
 * dibuang lebih dulu, lalu salinan sesi admin diisi ulang. `true` berarti token
 * admin sudah terpasang dan halaman hanya perlu dimuat ulang.
 */
export function pulihkanSesiAsli(): boolean {
  if (!adaStorage()) return false;
  try {
    const { localStorage } = window;
    const mentah = localStorage.getItem(KUNCI_SESI_ASLI);
    if (mentah === null) return false;
    const isi = JSON.parse(mentah) as { token?: Record<string, string> };
    const token = isi.token ?? {};
    if (Object.keys(token).length === 0) return false;

    for (const kunci of Object.keys(kumpulkanToken())) {
      localStorage.removeItem(kunci);
    }
    for (const [kunci, nilai] of Object.entries(token)) {
      localStorage.setItem(kunci, nilai);
    }
    bersihkanPenandaPratinjau();
    return true;
  } catch {
    return false;
  }
}
