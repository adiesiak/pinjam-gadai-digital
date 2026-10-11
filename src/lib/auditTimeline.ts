/**
 * Nada visual + ekspor CSV untuk Audit Trail Admin — logika murni, tanpa React,
 * tanpa Convex, tanpa DOM, supaya bisa diuji sebagai skrip biasa
 * (`bun src/lib/auditTimeline.test.ts`).
 *
 * Kenapa berkas ini ada: timeline audit harus membedakan tiga jenis kejadian
 * dengan warna — HIJAU (berhasil), KUNING (menunggu/dalam proses), MERAH
 * (kritis, termasuk penghapusan data) — dan perbedaan itu harus bisa diuji,
 * bukan sekadar `if` bertebaran di dalam komponen. Nama aksi audit berasal dari
 * database dan TIDAK dikunci tipe, jadi aturannya di sini berupa pola nama aksi
 * yang berlaku juga untuk aksi baru.
 *
 * Urutan pemeriksaan sengaja KRITIS lebih dulu: aksi seperti `loan_delete`
 * adalah peristiwa paling perlu dilihat, dan tidak boleh tertutup oleh pola
 * "menunggu" apa pun.
 */

/** Tiga nada timeline: kritis (merah) menang atas pending (kuning) menang atas sukses. */
export type NadaTimeline = "kritis" | "pending" | "sukses";

/**
 * Pola nama aksi KRITIS (merah): penghapusan data, pemblokiran sistem darurat,
 * penolakan, dan pembatalan. Semuanya mengubah keadaan secara permanen atau
 * menutup pintu bagi pengguna.
 */
const POLA_KRITIS: readonly string[] = [
  "_delete",
  "hapus",
  "kill_switch",
  "bekukan",
  "blokir",
  "tolak",
  "dibatalkan",
  "dibekukan",
];

/**
 * Pola nama aksi PENDING (kuning): pekerjaan yang masih menunggu keputusan,
 * percobaan yang gagal, dan pengiriman yang belum selesai.
 */
const POLA_PENDING: readonly string[] = [
  "ajukan",
  "diajukan",
  "menunggu",
  "review",
  "tinjau",
  "nilai",
  "otp",
  "percobaan",
  "gagal",
  "kirim",
  "request",
  "minta",
];

/** Nada satu aksi audit dari namanya (`ubah_plafon`, `loan_delete`, …). */
export function nadaAksi(aksi: string): NadaTimeline {
  const nama = aksi.toLowerCase();
  if (POLA_KRITIS.some((pola) => nama.includes(pola))) return "kritis";
  if (POLA_PENDING.some((pola) => nama.includes(pola))) return "pending";
  return "sukses";
}

/**
 * Label manusiawi dari nama aksi: `ubah_plafon` → "Ubah plafon".
 * Tidak mengubah arti, hanya menyiapkan huruf besar & spasi — aksi yang tidak
 * dikenal tetap tampil apa adanya (tanpa nama karangan).
 */
export function labelAksi(aksi: string): string {
  const teks = aksi.replace(/[_-]+/g, " ").trim();
  if (teks === "") return aksi;
  return teks.charAt(0).toUpperCase() + teks.slice(1);
}

/** Kolom CSV Audit Trail, urut tampil di berkas. */
export const KOLOM_CSV_AUDIT = ["Waktu", "Aktor", "Aksi", "Nada", "Target", "Detail"] as const;

/** Pesan jejak yang dinilai timeline — struktur, bukan tipe Convex. */
export type BarisAuditTimeline = {
  waktu: number;
  aktorLabel: string;
  aksi: string;
  target?: string | null;
  detail?: string | null;
};

/**
 * Satu nilai CSV. Nilai yang memuat koma, kutip, atau baris baru dibungkus
 * tanda kutip dan kutipnya digandakan — aturan RFC 4180, sehingga Excel/Sheets
 * tidak memecah kolom.
 */
export function kutipCsv(nilai: unknown): string {
  const teks = nilai === null || nilai === undefined ? "" : String(nilai);
  return /[",\r\n]/.test(teks) ? `"${teks.replace(/"/g, '""')}"` : teks;
}

/**
 * Susun isi berkas CSV Audit Trail (dengan baris kepala). Waktu ditulis sebagai
 * ISO 8601 agar bisa diurutkan mesin, sedangkan aktor/aksi/target/detail apa
 * adanya — ekspor tidak boleh menyamarkan siapa melakukan apa.
 */
export function keCsvAudit(baris: readonly BarisAuditTimeline[]): string {
  const kepala = KOLOM_CSV_AUDIT.join(",");
  const isi = baris.map((b) =>
    [
      new Date(b.waktu).toISOString(),
      b.aktorLabel,
      b.aksi,
      nadaAksi(b.aksi),
      b.target ?? "",
      b.detail ?? "",
    ]
      .map(kutipCsv)
      .join(","),
  );
  // CRLF: format yang paling diterima Excel di Windows maupun macOS.
  return [kepala, ...isi].join("\r\n");
}

/** Nama berkas ekspor, mis. `audit-trail-pindai-2026-10-11.csv`. */
export function namaBerkasAudit(waktu: number): string {
  const tanggal = new Date(waktu).toISOString().slice(0, 10);
  return `audit-trail-pindai-${tanggal}.csv`;
}
