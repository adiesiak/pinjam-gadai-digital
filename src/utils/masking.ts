/**
 * STOP-UP! — Helper Partial Masking
 *
 * Semua data identitas pelanggan yang tampil di layar publik (terminal
 * touchscreen) WAJIB lewat sini dulu. Layar terminal bisa dilihat siapa saja
 * yang mengantre, jadi nama/ID tidak pernah ditampilkan utuh.
 *
 * Contoh: "ANDI SAPUTRA" -> "A**I S*****A"
 */

/** Masking satu kata: sisakan huruf pertama & terakhir, bintang di tengah. */
function maskKata(kata: string): string {
  if (kata.length <= 1) return kata;
  if (kata.length === 2) return `${kata[0]}*`;
  return `${kata[0]}${"*".repeat(kata.length - 2)}${kata[kata.length - 1]}`;
}

/**
 * Masking nama pemilik akun/pelanggan.
 * "ANDI SAPUTRA" -> "A**I S*****A"
 * Kata satu huruf (mis. gelar) dibiarkan utuh agar tetap terbaca.
 */
export function maskNama(nama: string | null | undefined): string {
  if (!nama) return "";
  return nama
    .trim()
    .split(/\s+/)
    .map((kata) => (kata.length <= 1 ? kata : maskKata(kata)))
    .join(" ");
}

/**
 * Masking nomor HP gaya Indonesia: 4 digit depan + 4 digit belakang.
 * Menerima juga bentuk 62…/+62… (dinormalkan lebih dulu).
 * "081234567890" -> "0812****7890"
 */
export function maskNomorHp(nomor: string | null | undefined): string {
  if (!nomor) return "";
  const digit = normalisasiNomorHp(nomor);
  if (digit.length <= 8) {
    return digit.length <= 4 ? digit : `${digit.slice(0, 2)}${"*".repeat(digit.length - 2)}`;
  }
  const depan = digit.slice(0, 4);
  const belakang = digit.slice(-4);
  return `${depan}${"*".repeat(Math.max(4, digit.length - 8))}${belakang}`;
}

/**
 * Masking email: "andi.saputra@gmail.com" -> "an**********@gm***.com"
 * Domain TLD tetap terlihat agar pelanggan yakin emailnya benar.
 */
export function maskEmail(email: string | null | undefined): string {
  if (!email) return "";
  const [local, domain] = email.split("@");
  if (!domain) return maskKata(email);
  const tldIdx = domain.lastIndexOf(".");
  const tld = tldIdx === -1 ? "" : domain.slice(tldIdx);
  const host = tldIdx === -1 ? domain : domain.slice(0, tldIdx);
  const localMasked = local.length <= 2 ? `${local[0] ?? ""}*` : `${local.slice(0, 2)}${"*".repeat(local.length - 2)}`;
  const hostMasked = host.length <= 2 ? `${host[0] ?? ""}*` : `${host.slice(0, 2)}${"*".repeat(Math.max(1, host.length - 2))}`;
  return `${localMasked}@${hostMasked}${tld}`;
}

/**
 * Masking ID pelanggan (No. Meter PLN, Indihome, BPJS, PDAM).
 * "14012345678" -> "1401****678"
 */
export function maskIdPelanggan(id: string | null | undefined): string {
  if (!id) return "";
  const bersih = id.replace(/\D/g, "");
  if (bersih.length <= 6) return bersih.replace(/\d(?=\d{2})/g, "*");
  return `${bersih.slice(0, 4)}${"*".repeat(Math.max(3, bersih.length - 7))}${bersih.slice(-3)}`;
}

/** Masking NIK 16 digit: "3276********0001". */
export function maskNik(nik: string | null | undefined): string {
  if (!nik) return "";
  const bersih = nik.replace(/\D/g, "");
  if (bersih.length <= 8) return maskIdPelanggan(bersih);
  return `${bersih.slice(0, 4)}${"*".repeat(bersih.length - 8)}${bersih.slice(-4)}`;
}

/**
 * Format nomor HP ke bentuk `08xxxxxxxxxx` (satu-satunya bentuk yang dipakai
 * di layar terminal). Menerima input `+62…`, `62…`, `8…`, atau `08…`.
 */
export function normalisasiNomorHp(input: string): string {
  let digit = (input ?? "").replace(/\D/g, "");
  if (digit.startsWith("620")) digit = `0${digit.slice(3)}`;
  else if (digit.startsWith("62")) digit = `0${digit.slice(2)}`;
  else if (digit.startsWith("8")) digit = `0${digit}`;
  if (!digit.startsWith("0")) digit = `0${digit}`;
  return digit.slice(0, 13);
}

/**
 * Normalisasi satu ketukan tombol numpad.
 *
 * Patokan: JANGAN menambahkan "0" di depan setiap ketukan — kalau dipaksa,
 * ketikan "6" langsung menjadi "06" sehingga urutan "62…" tidak pernah bisa
 * dikenali. Karena itu di sini hanya dua koreksi yang diterapkan:
 *   "62…" → "08…"   (termasuk mengetik 62 sebelum 8)
 *   "8…"  → "08…"
 * Selebihnya dibiarkan apa adanya dan divalidasi saat menekan LANJUT.
 */
export function normalisasiKetikNomorHp(nilaiSaatIni: string, digit: string): string {
  const gabung = `${nilaiSaatIni}${digit}`.replace(/\D/g, "");
  if (gabung.startsWith("62")) return `0${gabung.slice(2)}`.slice(0, 13);
  if (gabung.startsWith("8")) return `0${gabung}`.slice(0, 13);
  return gabung.slice(0, 13);
}

/** Prefix `62` untuk tautan WhatsApp / pengiriman invoice. */
export function keFormatWhatsapp(nomor: string): string {
  const digit = normalisasiNomorHp(nomor).replace(/^0/, "");
  return `62${digit}`;
}

/** Tautan WhatsApp siap pakai (Direct WhatsApp Links — tanpa gateway berbayar). */
export function tautanWhatsApp(nomor: string, pesan: string): string {
  return `https://wa.me/${keFormatWhatsapp(nomor)}?text=${encodeURIComponent(pesan)}`;
}
