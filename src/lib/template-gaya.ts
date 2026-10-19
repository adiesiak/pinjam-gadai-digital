/**
 * Gaya tampilan situs — sumbu kedua template, terpisah dari palet warna.
 *
 * Palet (`tema`) menentukan warna; gaya menentukan tipografi judul, radius,
 * ketebalan garis, bayangan kartu, dan tekstur permukaan hero. Keduanya
 * disimpan terpisah supaya admin bisa memasangkan "Pesisir" dengan "Tenang"
 * tanpa perlu enam belas kartu template gabungan.
 *
 * Nilai gaya diterjemahkan menjadi CSS custom property di `src/index.css`
 * (`[data-gaya="..."]`), bukan menjadi kelas per komponen. Dengan begitu
 * komponen cukup memakai token, dan gaya baru tidak menyentuh markup landing.
 */

export const GAYA_PRESETS = ["lembaga", "tenang", "komunitas"] as const;
export type GayaPreset = (typeof GAYA_PRESETS)[number];

/**
 * Normalkan gaya dari penyimpanan. Nilai asing (data lama, preset yang
 * dicabut) kembali ke bawaan, sama seperti `temaAman`: konfigurasi yang gagal
 * dibaca akan mematikan seluruh panel admin.
 */
export function gayaAman(nilai: unknown): GayaPreset {
  return typeof nilai === "string" &&
    (GAYA_PRESETS as readonly string[]).includes(nilai)
    ? (nilai as GayaPreset)
    : "lembaga";
}

export type InfoGaya = {
  id: GayaPreset;
  nama: string;
  ringkasan: string;
  /** Ciri yang terlihat — dipakai kartu pilihan di panel admin. */
  ciri: readonly string[];
};

export const INFO_GAYA: readonly InfoGaya[] = [
  {
    id: "lembaga",
    nama: "Lembaga",
    ringkasan:
      "Kesan resmi: judul serif, sudut kecil, garis tegas, dan bayangan tipis.",
    ciri: ["Judul serif", "Sudut kecil", "Garis tegas"],
  },
  {
    id: "tenang",
    nama: "Tenang",
    ringkasan:
      "Kesan ringan: judul sans besar, sudut membulat, dan bayangan lembut.",
    ciri: ["Judul sans", "Sudut besar", "Bayangan lembut"],
  },
  {
    id: "komunitas",
    nama: "Komunitas",
    ringkasan:
      "Kesan hangat dan terbuka: judul tebal, sudut penuh, dan permukaan berpola.",
    ciri: ["Judul tebal", "Sudut penuh", "Permukaan berpola"],
  },
];
