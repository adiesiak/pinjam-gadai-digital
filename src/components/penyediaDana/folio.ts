/**
 * Kosakata visual ruang pendana: satu lembar folio bergaris, bukan tumpukan
 * kartu bersudut bulat dengan bayangan di mana-mana.
 *
 * Kenapa begini (alasan satu baris per keputusan, R-31):
 *  - `kertas` memakai kertas padat tanpa bayangan, karena bayangan hanya menandai
 *    ketinggian; kalau semua bagian sama-sama melayang, tidak ada yang menonjol.
 *  - `fokus` adalah satu-satunya permukaan bertepi kuningan ganda + bayangan
 *    bertinta, karena satu layar hanya boleh punya satu titik fokus (DESIGN.md §4).
 *  - `garis` dan `kepalaTabel` memakai garis rambut, karena ruang ini adalah
 *    buku besar: yang memisahkan catatan adalah garis, bukan kotak.
 *  - `kode` memakai monospace, karena DESIGN.md §B meminta angka kartu, nomor
 *    referensi, dan nomor bagian dicetak monospace agar sejajar antar baris.
 *  - `jalur` (bidang masuk) dipakai angka yang bukan titik fokus, supaya angka
 *    utama dan angka pendukung tidak terbaca setara.
 *
 * Berkas ini hanya berisi nilai, tanpa komponen: React Fast Refresh hanya bekerja
 * bila satu modul mengekspor komponen saja (pola yang sama dipakai
 * `components/ui/button-variants.ts`).
 */
export const FOLIO = {
  /** Lembar bagian: kertas padat, garis rambut, tanpa bayangan. */
  kertas: "rounded-lg border border-slate-200 bg-white",
  /** Bidang masuk untuk angka atau daftar pendukung. */
  jalur: "rounded-lg border border-slate-200 bg-slate-50/70",
  /** Satu-satunya permukaan bermewah: tepi kuningan ganda + bayangan bertinta. */
  fokus:
    "rounded-xl border border-gold/55 bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(241,237,227,0.92))] shadow-[0_20px_45px_-26px_rgba(28,26,21,0.45)] ring-1 ring-gold/35 ring-offset-2 ring-offset-white/60",
  /** Garis rambut pemisah antar catatan di dalam satu lembar. */
  garis: "h-px w-full bg-slate-200",
  /** Angka uang: lebar tetap supaya kolom angka tidak bergoyang saat nilainya berubah. */
  angka: "tabular-nums",
  /** Nomor bagian, kode referensi, dan koordinat: monospace. */
  kode: "font-mono tabular-nums",
  /** Label kecil di atas judul bagian. */
  label: "text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700",
  /** Judul bagian. */
  judul: "text-base font-semibold tracking-tight text-navy",
  /** Catatan pendamping judul. */
  catatan: "text-xs leading-5 text-muted-foreground",
  /** Kepala tabel: garis kuningan tipis memisahkan judul kolom dari isinya. */
  kepalaTabel: "border-b border-gold/40 bg-slate-50",
} as const;

/** Nomor bagian dicetak dua digit supaya indeksnya sejajar saat dibaca menurun. */
export function nomorFolio(nomor: number): string {
  return String(nomor).padStart(2, "0");
}

/**
 * Bagi daftar jadi beberapa kolom yang seimbang, urutannya tetap.
 *
 * Dipakai daftar poin dan aturan: dua belas poin yang ditumpuk satu kolom lebih
 * tinggi dari satu layar, dan urutan bacanya harus tetap 1 sampai 12. Sisanya
 * diletakkan di kolom depan (12 → 4/4/4, 7 → 3/2/2), jadi tidak ada kolom yang
 * menggantung satu baris sendirian di ujung.
 */
export function bagiKolom<T>(daftar: readonly T[], kolom: number): readonly (readonly T[])[] {
  const dasar = Math.floor(daftar.length / kolom);
  const sisa = daftar.length % kolom;
  const hasil: T[][] = [];
  let mulai = 0;
  for (let i = 0; i < kolom; i += 1) {
    const ukuran = dasar + (i < sisa ? 1 : 0);
    hasil.push(daftar.slice(mulai, mulai + ukuran));
    mulai += ukuran;
  }
  return hasil;
}

/**
 * Apakah halaman sedang dibuka pada jangkar bagian tertentu (`#id`).
 *
 * Dipakai bagian yang terlipat: tautan jangkar (navigasi bagian dan tombol
 * "Baca selengkapnya" di banner risiko) harus membuka bagiannya, bukan
 * meninggalkan pembaca di depan judul yang tertutup. Dijaga `typeof window`
 * supaya render statis di uji markup tetap aman.
 */
export function dibukaLewatJangkar(id: string): boolean {
  return typeof window !== "undefined" && window.location.hash === `#${id}`;
}
