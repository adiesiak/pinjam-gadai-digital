/**
 * OTP WhatsApp (Fonnte) — logika MURNI (tanpa Convex, React, DOM) supaya bisa
 * diuji sebagai skrip biasa: `bun src/lib/otpWa.test.ts`.
 *
 * Kenapa berkas ini ada: kode OTP adalah kredensial berumur pendek yang
 * melindungi nomor WhatsApp terverifikasi dan transaksi penyedia dana. Aturan
 * yang menentukan apakah sebuah kode masih SAH (panjang, masa berlaku, batas
 * percobaan, cooldown kirim ulang, pengikatan ke tujuan & nomor) harus berada
 * di SATU tempat yang sama untuk server dan uji — bukan tersebar di action
 * pengiriman dan di mutation verifikasi.
 *
 * Batas yang dijaga di sini (dan ditegakkan lagi di `convex/otpWhatsapp.ts`):
 * - Kode selalu 6 digit dari sumber acak kriptografis (`crypto.getRandomValues`
 *   dengan rejection sampling — bukan `Math.random`).
 * - Yang disimpan hanya HASH `SHA-256(salt + ":" + kode)`; kode aslinya tidak
 *   pernah ditulis ke database, log, maupun balasan API.
 * - Kode berlaku maksimal 5 menit, sekali pakai, dan terikat pada SATU pengguna
 *   + SATU nomor + SATU tujuan verifikasi.
 * - Pengiriman yang berhasil dari Fonnte TIDAK berarti kode sudah diverifikasi;
 *   status verifikasi hanya berubah lewat `verifikasiOtpWa`.
 *
 * Catatan kejujuran: enam digit hanya punya 1.000.000 kemungkinan, jadi hash
 * ber-salt bukan perlindungan terhadap penyerang yang sudah memegang isi
 * database. Yang melindunginya adalah masa berlaku pendek, sekali pakai, batas
 * 5 percobaan per kode, dan pembatas laju permintaan/permintaan ulang.
 */

/** Panjang kode OTP. */
export const OTP_PANJANG_KODE = 6;

/** Masa berlaku kode — 5 menit (ketentuan produk). */
export const OTP_MASA_BERLAKU_MS = 5 * 60 * 1000;

/** Batas percobaan verifikasi PER KODE sebelum kode dianggap hangus. */
export const OTP_MAKS_PERCOBAAN = 5;

/** Cooldown kirim ulang untuk pengguna + tujuan yang sama. */
export const OTP_COOLDOWN_MS = 60 * 1000;

/** Jendela pembatas laju permintaan kode. */
export const OTP_JENDELA_MS = 60 * 60 * 1000;

/** Batas permintaan kode per pengguna per jendela. */
export const OTP_MAKS_PER_USER = 5;

/** Batas permintaan kode per nomor tujuan per jendela. */
export const OTP_MAKS_PER_NOMOR = 5;

/** Batas permintaan kode per IP per jendela (IP dikirim klien — lihat catatan server). */
export const OTP_MAKS_PER_IP = 10;

/** Batas TOTAL percobaan verifikasi gagal per pengguna per jendela. */
export const OTP_MAKS_GAGAL_PER_USER = 10;

/**
 * Tujuan verifikasi — kode untuk satu tujuan TIDAK bisa dipakai untuk tujuan
 * lain, karena verifikasi mencari tantangan terakhir untuk tujuan itu saja.
 */
export const TUJUAN_OTP = ["verifikasi_nomor", "transaksi"] as const;
export type TujuanOtp = (typeof TUJUAN_OTP)[number];

export function tujuanOtpValid(mentah: string): mentah is TujuanOtp {
  return (TUJUAN_OTP as readonly string[]).includes(mentah);
}

/** Kalimat tujuan untuk pesan WhatsApp. */
export function labelTujuanOtp(tujuan: TujuanOtp): string {
  return tujuan === "verifikasi_nomor"
    ? "verifikasi nomor WhatsApp"
    : "persetujuan transaksi";
}

/**
 * Normalisasi nomor WhatsApp ke bentuk internasional tanpa `+` (mis.
 * `628123456789` atau `491512345678`).
 *
 * Nomor Indonesia tetap menerima tulisan lokal yang lazim (`0812…`, `812…`)
 * dan selalu disimpan sebagai `62…`. Nomor negara lain sudah mengandung kode
 * negaranya, jadi disimpan apa adanya — `+49…` dan `0049…` dibersihkan dulu,
 * sedangkan `49…` diterima karena bentuk itulah yang tersimpan di akun.
 *
 * `null` hanya untuk bentuk yang panjangnya tidak wajar, supaya nomor rusak
 * tidak pernah sampai ke gateway. Nomor luar Indonesia wajib ditulis dengan
 * kode negaranya; `0812…` selalu dibaca sebagai nomor Indonesia.
 */
export function normalisasiNomorWa(mentah: string | null | undefined): string | null {
  const teks = (mentah ?? "").trim();
  if (teks === "") return null;
  const berprefiksInternasional = teks.startsWith("+") || teks.startsWith("00");
  let nomor = teks.replace(/\D/g, "");
  if (nomor === "") return null;
  if (teks.startsWith("00")) nomor = nomor.slice(2);
  if (!berprefiksInternasional) {
    if (nomor.startsWith("0")) nomor = `62${nomor.slice(1)}`;
    else if (nomor.startsWith("8")) nomor = `62${nomor}`;
  }
  return /^[1-9]\d{8,14}$/.test(nomor) ? nomor : null;
}

/**
 * Nilai `countryCode` untuk Fonnte.
 *
 * Fonnte mengganti `0` di depan nomor dengan `countryCode`, ATAU menambahkan
 * kode itu bila belum ada (default `62`). Untuk nomor Indonesia hasilnya tetap
 * `62`; untuk nomor negara lain nilainya `0`, mode yang mematikan penambahan
 * otomatis sehingga nomor Jerman `49…` tidak berubah menjadi `6249…`.
 */
export function kodeNegaraFonnte(nomor: string): "62" | "0" {
  return nomor.startsWith("62") ? "62" : "0";
}

/** Kode OTP 6 digit dari sumber acak kriptografis (rejection sampling). */
export function kodeOtpEnamDigit(): string {
  const batas = 10 ** OTP_PANJANG_KODE;
  const maks = Math.floor(0x1_0000_0000 / batas) * batas;
  const bytes = new Uint32Array(1);
  let nilai = maks;
  while (nilai >= maks) {
    crypto.getRandomValues(bytes);
    nilai = bytes[0];
  }
  return String(nilai % batas).padStart(OTP_PANJANG_KODE, "0");
}

/** Salt acak 16 byte (hex) — satu per kode, supaya dua kode sama berbeda hash. */
export function buatSaltOtp(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return keHex(bytes);
}

function keHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** ASCII → byte tanpa TextEncoder (aman di seluruh runtime Convex). */
function keBytes(teks: string): Uint8Array {
  const bytes = new Uint8Array(teks.length);
  for (let i = 0; i < teks.length; i += 1) bytes[i] = teks.charCodeAt(i) & 0xff;
  return bytes;
}

/**
 * Hash kode OTP — satu-satunya bentuk kode yang boleh disimpan.
 * Sengaja tidak mengembalikan kode asli: pemanggil tidak punya jalan menyimpannya.
 */
export async function hashKodeOtp(salt: string, kode: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    keBytes(`${salt}:${kode}`) as unknown as ArrayBuffer,
  );
  return keHex(new Uint8Array(digest));
}

/**
 * Perbandingan kode konstan-waktu: panjang berbeda langsung ditolak, isi hex
 * dibandingkan dengan XOR yang tidak berhenti di karakter pertama yang berbeda
 * (mencegah kebocoran lewat waktu eksekusi).
 */
export function cocokKodeOtp(hashTersimpan: string, hashDicoba: string): boolean {
  if (hashTersimpan.length === 0 || hashTersimpan.length !== hashDicoba.length) return false;
  let beda = 0;
  for (let i = 0; i < hashTersimpan.length; i += 1) {
    beda |= hashTersimpan.charCodeAt(i) ^ hashDicoba.charCodeAt(i);
  }
  return beda === 0;
}

/**
 * Sisa detik cooldown kirim ulang (0 = boleh minta kode sekarang).
 * `terakhirPada` = waktu permintaan terakhir untuk pengguna + tujuan yang sama.
 */
export function sisaDetikCooldown(
  terakhirPada: number | null,
  sekarang: number,
  cooldownMs: number = OTP_COOLDOWN_MS,
): number {
  if (terakhirPada === null) return 0;
  const sisa = terakhirPada + cooldownMs - sekarang;
  return sisa > 0 ? Math.ceil(sisa / 1000) : 0;
}

/**
 * Isi pesan WhatsApp. Tidak menyebut data pribadi lain dan tidak pernah
 * memuat token apa pun; satu-satunya rahasia di pesan ini adalah kode itu
 * sendiri (yang memang harus sampai ke pemilik nomor).
 */
export function pesanOtp(tujuan: TujuanOtp, kode: string): string {
  return (
    `Kode PINDAI untuk ${labelTujuanOtp(tujuan)}: ${kode}\n\n` +
    "Berlaku 5 menit dan hanya bisa dipakai sekali. " +
    "Jangan bagikan kode ini kepada siapa pun, termasuk yang mengaku petugas PINDAI."
  );
}

/** Terjemahan alasan Fonnte → kalimat yang bisa dibaca pengguna. */
export function terjemahAlasanFonnte(teks: string): string {
  const t = teks.toLowerCase();
  if (t.includes("token")) {
    return "Token gateway ditolak — periksa WHATSAPP_API_KEY (cadangan lama: FONNTE_TOKEN) pada environment deployment.";
  }
  if (t.includes("quota")) return "Kuota pengiriman Fonnte habis.";
  if (t.includes("target invalid")) return "Nomor tujuan tidak valid menurut Fonnte.";
  if (t.includes("device")) return "Perangkat Fonnte tidak terhubung.";
  return teks.slice(0, 160);
}

/**
 * Baca balasan Fonnte (docs.fonnte.com/api-send-message): sukses =
 * `{ "status": true, "detail": "success! message in queue", … }`, gagal =
 * `{ "status": false, "reason": "target invalid" }`. Kode hanya dianggap
 * terkirim bila HTTP 2xx DAN `status` true — balasan 200 yang isinya bukan JSON
 * pun tidak dipercaya.
 */
export function uraiResponFonnte(
  httpStatus: number,
  teks: string,
): { terkirim: boolean; pesan: string } {
  const httpOk = httpStatus >= 200 && httpStatus < 300;
  let data: unknown = null;
  try {
    data = JSON.parse(teks);
  } catch {
    data = null;
  }
  if (data === null || typeof data !== "object") {
    const ringkas = teks.trim().slice(0, 120);
    if (!httpOk) {
      return {
        terkirim: false,
        pesan: `Fonnte menolak permintaan (HTTP ${httpStatus})${ringkas === "" ? "" : `: ${ringkas}`}.`,
      };
    }
    return {
      terkirim: false,
      pesan:
        ringkas === ""
          ? "Fonnte membalas tanpa isi yang bisa dibaca."
          : `Balasan Fonnte tidak dapat dibaca: ${ringkas}`,
    };
  }
  const rec = data as Record<string, unknown>;
  const sukses = rec.status === true || rec.Status === true;
  const alasan =
    typeof rec.reason === "string"
      ? rec.reason
      : typeof rec.detail === "string"
        ? rec.detail
        : "";
  if (!httpOk) {
    return {
      terkirim: false,
      pesan: `Fonnte menolak permintaan (HTTP ${httpStatus})${alasan === "" ? "" : `: ${terjemahAlasanFonnte(alasan)}`}.`,
    };
  }
  if (!sukses) {
    return {
      terkirim: false,
      pesan: `Fonnte gagal mengirim${alasan === "" ? "" : `: ${terjemahAlasanFonnte(alasan)}`}.`,
    };
  }
  return {
    terkirim: true,
    pesan: alasan === "" ? "Diterima Fonnte." : terjemahAlasanFonnte(alasan),
  };
}
