/**
 * Nada warna & label pengaduan nasabah — logika MURNI (tanpa React, Convex,
 * DOM) supaya bisa diuji sebagai skrip biasa.
 *
 * Kenapa terpisah dari `lib/penagihan.ts`: yang di sana adalah ATURAN (status
 * sah, transisi yang diizinkan, kanal, prioritas). Berkas ini hanya soal cara
 * MENAMPILKANNYA. Memisahkannya menjaga komponen tetap bisa diperiksa cepat dan
 * mencegah kelas Tailwind menyerbu berkas aturan — pola yang sama dipakai
 * `lib/kycStatus.ts` untuk status KYC.
 *
 * Aturan tampilan yang dipegang: warna SELALU berpasangan dengan label teks,
 * jadi status tetap terbaca tanpa penglihatan warna.
 */

/** Kelas lencana status pengaduan. */
export function nadaStatusPengaduan(status: string): string {
  if (status === "selesai") return "border-success-border bg-success-soft text-success-foreground";
  if (status === "ditolak") return "border-red-300 bg-red-50 text-red-700";
  if (status === "ditinjau") return "border-sky-200 bg-sky-50 text-sky-700";
  return "border-slate-200 bg-slate-100 text-slate-600";
}

/**
 * Kelas lencana prioritas pengaduan.
 *
 * "Kritis" diberi nada paling keras supaya antrean terbaca dalam sekali lihat —
 * bukan karena penilaiannya lebih penting, melainkan karena itulah satu-satunya
 * alasan prioritas ada.
 */
export function nadaPrioritasPengaduan(prioritas: string): string {
  if (prioritas === "kritis") return "border-red-300 bg-red-50 text-red-700";
  if (prioritas === "tinggi") return "border-amber-200 bg-amber-50 text-amber-700";
  if (prioritas === "rendah") return "border-slate-200 bg-slate-100 text-slate-600";
  return "border-primary/20 bg-primary/5 text-primary";
}

/** Ringkasan asal pesan terakhir — kalimat siap tampil di daftar. */
export function ringkasAsalPesanTerakhir(arah: string | null): string {
  if (arah === "petugas") return "ada balasan petugas";
  if (arah === "nasabah") return "pesan terakhir dari Anda";
  return "";
}
