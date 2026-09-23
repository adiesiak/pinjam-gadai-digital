/**
 * STOP-UP! — Pembangkit kode (invoice, voucher, referensi supplier).
 * Murni & deterministik bagi input seed, agar mudah diuji.
 */

const HURUF = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Angka acak kriptografis 0..n-1 (aman di browser & Convex). */
function acak(n: number): number {
  const globalCrypto = globalThis.crypto;
  if (globalCrypto && typeof globalCrypto.getRandomValues === "function") {
    const buf = new Uint32Array(1);
    globalCrypto.getRandomValues(buf);
    return buf[0] % n;
  }
  return Math.floor(Math.random() * n);
}

function kodeAcak(panjang: number): string {
  let out = "";
  for (let i = 0; i < panjang; i += 1) out += HURUF[acak(HURUF.length)];
  return out;
}

/** Tanggal lokal WIB (UTC+7) dalam bentuk YYMMDD. */
export function tanggalWibKode(waktuMs: number): string {
  const wib = new Date(waktuMs + 7 * 60 * 60 * 1000);
  const yy = String(wib.getUTCFullYear()).slice(-2);
  const mm = String(wib.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(wib.getUTCDate()).padStart(2, "0");
  return `${yy}${mm}${dd}`;
}

/** Invoice STOP-UP!: SU-YYMMDD-XXXXXX. */
export function buatInvoiceId(waktuMs = Date.now()): string {
  return `SU-${tanggalWibKode(waktuMs)}-${kodeAcak(6)}`;
}

/** Kode voucher/redeem key: XXXX-XXXX-XXXX (tanpa huruf/angka ambigu). */
export function buatKodeVoucher(): string {
  return [kodeAcak(4), kodeAcak(4), kodeAcak(4)].join("-");
}

/** Ref ID yang dikirim ke supplier H2H. */
export function buatRefId(invoiceId: string): string {
  return `${invoiceId}-${kodeAcak(4)}`;
}

/** Serial number simulasi untuk produk injeksi (pulsa/data/e-wallet). */
export function buatSnSimulasi(invoiceId: string): string {
  return `SN${invoiceId.replace(/[^0-9]/g, "").slice(-8)}${kodeAcak(4)}`;
}

/**
 * "Nama pemilik akun" hasil inquiry dalam Mode Simulasi.
 * Deterministik dari ID pelanggan supaya inquiry ulang memberi hasil sama,
 * dan TIDAK pernah dipakai untuk mengklaim data pelanggan nyata.
 */
const NAMA_DEPAN = [
  "ANDI", "BUDI", "CITRA", "DEWI", "EKO", "FITRI", "GILANG", "HENDRA",
  "INDRA", "JOKO", "KARTIKA", "LUKMAN", "MEGA", "NURUL", "OKTA", "PUTRI",
  "RANGGA", "SITI", "TIRTA", "UMAR", "VINA", "WAHYU", "YUNI", "ZAKI",
];
const NAMA_BELAKANG = [
  "SAPUTRA", "WIJAYA", "PRATAMA", "HIDAYAT", "SUSANTI", "PERMANA", "ANGGRAINI",
  "KURNIAWAN", "MAULANA", "SETIAWAN", "HARTONO", "LESTARI",
];

export function namaSimulasi(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) % 1_000_000_007;
  }
  const depan = NAMA_DEPAN[hash % NAMA_DEPAN.length];
  const belakang = NAMA_BELAKANG[Math.floor(hash / 7) % NAMA_BELAKANG.length];
  return `${depan} ${belakang}`;
}

/** Estimasi tagihan pascabayar (Mode Simulasi) — rupiah bulat. */
export function tagihanSimulasi(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 17 + seed.charCodeAt(i)) % 97;
  return 45_000 + hash * 1_500;
}
