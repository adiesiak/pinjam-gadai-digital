/**
 * Aturan tampilan pusat notifikasi PINDAI (murni, tanpa React maupun Convex).
 *
 * Semuanya di sini adalah fungsi yang bisa diuji tanpa server:
 * - penerjemahan waktu server menjadi kalimat relatif,
 * - pengurutan menurut waktu server,
 * - perhitungan jumlah belum dibaca,
 * - deteksi notifikasi yang BENAR-BENAR baru (untuk animasi masuk & pengumuman
 *   pembaca layar), dan
 * - pembacaan tab tujuan dari tautan notifikasi.
 *
 * Tidak ada satu pun fungsi di sini yang boleh mengarang notifikasi, mengubah
 * isinya, atau menandai apa pun sebagai terkirim: isi dan status selalu datang
 * apa adanya dari `convex/notifikasi.ts`.
 */

export type NotifikasiJenis = "info" | "sukses" | "peringatan" | "error";

export type NotifikasiItem = {
  kunci: string;
  jenis: NotifikasiJenis;
  judul: string;
  ringkasan: string;
  /** Waktu menurut server (epoch ms). */
  waktu: number;
  /** Rute dalam aplikasi untuk membuka detail terkait. */
  tautan: string;
  dibaca: boolean;
};

/**
 * Label dan nada per jenis.
 *
 * Nada warna SELALU berpasangan dengan label teks dan ikon yang berbeda, jadi
 * jenis notifikasi tetap terbaca oleh pengguna yang tidak bisa membedakan
 * warna — warna hanya mempercepat, bukan satu-satunya penanda.
 */
export const JENIS_NOTIFIKASI: Record<NotifikasiJenis, { label: string; kelas: string }> = {
  info: { label: "Informasi", kelas: "border-sky-200 bg-sky-50 text-sky-700" },
  sukses: { label: "Keberhasilan", kelas: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  peringatan: { label: "Peringatan", kelas: "border-amber-300 bg-amber-50 text-amber-800" },
  error: { label: "Masalah", kelas: "border-red-300 bg-red-50 text-red-700" },
};

/**
 * Tab dashboard yang boleh dituju tautan notifikasi.
 *
 * Sengaja dicantumkan di sini sebagai daftar tertutup: tautan yang menunjuk tab
 * tidak dikenal akan ditolak (bukan diteruskan apa adanya), supaya salah ketik
 * di server tidak pernah mengirim pengguna ke tab yang tidak ada.
 */
export const TAB_DASHBOARD = [
  "ringkasan",
  "cicilan",
  "form",
  "pinjaman",
  "diri",
  "kyc",
] as const;

/** Tab dashboard dari parameter URL, atau null bila tidak berlaku. */
/**
 * Tab lama yang masih tersimpan di tautan notifikasi di database.
 *
 * Halaman nasabah sekarang lima; nama lama dipetakan ke halaman TERDEKATNYA
 * supaya tautan yang sudah tersimpan tidak mendarat di halaman default tanpa
 * penjelasan. Pemetaan ini dihapus bersama tautan lama terakhir.
 */
const TAB_LAMA: Record<string, string> = {
  jadwal: "cicilan",
  riwayat: "pinjaman",
  gadai: "pinjaman",
  kontrak: "pinjaman",
  bantuan: "ringkasan",
};

export function tabDariParams(params: URLSearchParams): string | null {
  const tab = params.get("tab");
  if (tab === null) return null;
  if ((TAB_DASHBOARD as readonly string[]).includes(tab)) return tab;
  return TAB_LAMA[tab] ?? null;
}

/** Tab dashboard dari tautan notifikasi, atau null bila tidak berlaku. */
export function tabDariTautan(tautan: string): string | null {
  const i = tautan.indexOf("?");
  if (i === -1) return null;
  return tabDariParams(new URLSearchParams(tautan.slice(i + 1)));
}

/**
 * Waktu relatif bahasa Indonesia.
 *
 * Dipakai sebagai pengantar ("2 jam lalu"), bukan sebagai status: keadaan
 * notifikasi tetap ditentukan `dibaca`, bukan oleh usianya. Jam di masa depan
 * (selisih jam antara perangkat dan server) diperlakukan sebagai "baru saja",
 * bukan angka negatif yang membingungkan.
 */
export function waktuRelatif(waktu: number, sekarang: number = Date.now()): string {
  const detik = Math.floor((sekarang - waktu) / 1000);
  if (detik < 60) return "baru saja";
  const menit = Math.floor(detik / 60);
  if (menit < 60) return `${menit} menit lalu`;
  const jam = Math.floor(menit / 60);
  if (jam < 24) return `${jam} jam lalu`;
  const hari = Math.floor(jam / 24);
  if (hari < 7) return `${hari} hari lalu`;
  return new Date(waktu).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Urutkan menurut waktu server, terbaru lebih dulu (server juga sudah urut). */
export function urutkanNotifikasi(items: readonly NotifikasiItem[]): NotifikasiItem[] {
  return [...items].sort((a, b) => b.waktu - a.waktu);
}

/** Jumlah notifikasi yang belum dibaca. */
export function hitungBelumDibaca(items: readonly NotifikasiItem[]): number {
  return items.filter((it) => !it.dibaca).length;
}

/**
 * Kunci notifikasi yang benar-benar baru dibanding kumpulan kunci sebelumnya.
 *
 * Dipakai untuk dua hal yang harus tepat: animasi masuk (hanya item baru yang
 * bergerak) dan pengumuman pembaca layar (hanya saat ada yang benar-benar
 * baru). Notifikasi lama yang muncul lagi karena penyegaran query BUKAN
 * notifikasi baru, jadi tidak diumumkan dan tidak beranimasi ulang.
 */
export function kunciBaru(
  sebelumnya: ReadonlySet<string>,
  items: readonly NotifikasiItem[],
): Set<string> {
  return new Set(items.filter((it) => !sebelumnya.has(it.kunci)).map((it) => it.kunci));
}

/** Kalimat pengumuman untuk pembaca layar, atau null bila tidak ada yang baru. */
export function pengumumanBaru(jumlahBaru: number, totalBelumDibaca: number): string | null {
  if (jumlahBaru <= 0) return null;
  const satuan = jumlahBaru === 1 ? "notifikasi baru" : "notifikasi baru";
  return `${jumlahBaru} ${satuan}. Total ${totalBelumDibaca} belum dibaca.`;
}
