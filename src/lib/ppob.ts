/**
 * Aturan murni PPOB publik — harga jual, nomor tujuan, kode pesanan, dan
 * terjemahan status provider.
 *
 * Berkas ini sengaja tidak menyentuh Convex, React, atau jaringan supaya angka
 * yang dipakai server sama persis dengan yang dibaca pengunjung dan bisa diuji
 * sebagai skrip biasa (`bun src/lib/ppob.test.ts`).
 *
 * Kenapa PPOB publik TERPISAH dari katalog digital syariah: katalog syariah
 * menjual pulsa/token sebagai akad murabahah dengan margin 20%. Etalase publik
 * adalah penjualan tunai biasa — pembeli membayar harga jual, platform mengambil
 * selisih harga modal mitra. Mencampur keduanya akan membuat satu produk punya
 * dua dasar harga dan dua jenis bukti transaksi.
 */

/** Lima kelompok yang benar-benar bisa diproses provider prabayar. */
export const KATEGORI_PPOB = [
  "pulsa",
  "data",
  "token-listrik",
  "game",
  "ewallet",
] as const;

export type KategoriPpob = (typeof KATEGORI_PPOB)[number];

export const LABEL_KATEGORI_PPOB: Record<KategoriPpob, string> = {
  pulsa: "Pulsa",
  data: "Paket data",
  "token-listrik": "Token listrik",
  game: "Voucher game",
  ewallet: "Saldo e-wallet",
};

/** Status pesanan yang dikenal UI dan server. */
export const STATUS_PESANAN_PPOB = [
  "menunggu_bayar",
  "dibayar",
  "diproses",
  "sukses",
  "gagal",
  "refund",
] as const;

export type StatusPesananPpob = (typeof STATUS_PESANAN_PPOB)[number];

export const LABEL_STATUS_PPOB: Record<StatusPesananPpob, string> = {
  menunggu_bayar: "Menunggu pembayaran",
  dibayar: "Sudah dibayar",
  diproses: "Diproses provider",
  sukses: "Selesai",
  gagal: "Gagal",
  refund: "Dana dikembalikan",
};

/**
 * Nada visual status. Dipisah dari label supaya badge di admin dan halaman
 * publik tidak pernah memilih warna yang berbeda untuk status yang sama.
 */
export type NadaStatusPpob = "menunggu" | "proses" | "sukses" | "gagal";

export const NADA_STATUS_PPOB: Record<StatusPesananPpob, NadaStatusPpob> = {
  menunggu_bayar: "menunggu",
  dibayar: "proses",
  diproses: "proses",
  sukses: "sukses",
  gagal: "gagal",
  refund: "gagal",
};

/** Normalisasi nilai kategori dari database/provider; asing menjadi `null`. */
export function kategoriPpobAman(nilai: unknown): KategoriPpob | null {
  return typeof nilai === "string" &&
    (KATEGORI_PPOB as readonly string[]).includes(nilai)
    ? (nilai as KategoriPpob)
    : null;
}

/**
 * Kategori Digiflazz (dan server pulsa yang meniru penamaannya) ke lima
 * kelompok PINDAI.
 *
 * Produk yang tidak terpetakan sengaja DIBUANG, bukan dimasukkan ke "lainnya":
 * etalase publik hanya boleh menampilkan jenis yang nomor tujuannya sudah
 * divalidasi. Produk pascabayar (PDAM, BPJS) tidak termasuk karena butuh
 * pemeriksaan tagihan sebelum pembayaran — alur tersendiri, bukan satu kolom
 * nomor.
 */
export function kategoriDariProvider(nilai: unknown): KategoriPpob | null {
  if (typeof nilai !== "string") return null;
  const kunci = nilai.trim().toLowerCase().replace(/[\s_-]+/g, "");
  const peta: Record<string, KategoriPpob> = {
    pulsa: "pulsa",
    data: "data",
    paketdata: "data",
    emoney: "ewallet",
    saldoemoney: "ewallet",
    games: "game",
    game: "game",
    vouchergame: "game",
    pln: "token-listrik",
    tokenlistrik: "token-listrik",
    listrik: "token-listrik",
  };
  return peta[kunci] ?? null;
}

/**
 * Harga jual dari harga modal mitra.
 *
 * Markup memakai persentase global, tetapi tidak pernah di bawah `markupMin`
 * (biaya transfer bank dan waktu admin tetap harus tertutup). Hasilnya
 * dibulatkan KE ATAS ke ratusan rupiah supaya harga yang tampil enak dibaca dan
 * tidak ada sen yang hilang.
 *
 * Semua masukan wajib rupiah bulat; nilai non-bulat ditolak, bukan dibulatkan
 * diam-diam.
 */
export function hargaJualDariModal(
  hargaModal: number,
  markupPersen: number,
  markupMin: number,
): number {
  if (!Number.isInteger(hargaModal) || hargaModal < 0) {
    throw new Error("Harga modal harus rupiah bulat yang tidak negatif.");
  }
  const persen = Number.isFinite(markupPersen) ? Math.max(0, markupPersen) : 0;
  const minimum = Number.isFinite(markupMin) ? Math.max(0, Math.round(markupMin)) : 0;
  // Integer math: persen disimpan hingga dua desimal, jadi 5,5% tetap presisi.
  const dariPersen = Math.ceil((hargaModal * Math.round(persen * 100)) / 10_000);
  const markup = Math.max(minimum, dariPersen);
  return Math.ceil((hargaModal + markup) / 100) * 100;
}

/**
 * Markup per kategori yang disimpan admin.
 *
 * `tokenListrik` (tanpa tanda hubung) adalah nama kolom di database; kunci
 * kategori publiknya tetap `token-listrik`. Pemetaan ada di
 * `persenMarkupKategori` supaya perbedaan penamaan tidak merembes ke UI.
 */
export type MarkupPerKategori = {
  pulsa?: number;
  data?: number;
  tokenListrik?: number;
  game?: number;
  ewallet?: number;
};

/**
 * Tarif markup yang berlaku untuk satu kategori.
 *
 * Nilai per kategori MENGGANTIKAN tarif global, bukan menambah di atasnya —
 * admin yang menulis 3% untuk pulsa tidak perlu menghitung selisih dari 5%.
 * Nilai tidak sah diabaikan supaya etalase tidak menjual di bawah modal hanya
 * karena satu kolom salah ketik.
 */
export function persenMarkupKategori(
  global: number,
  perKategori: MarkupPerKategori | undefined,
  kategori: KategoriPpob,
): number {
  const khusus =
    kategori === "token-listrik"
      ? perKategori?.tokenListrik
      : perKategori?.[kategori];
  if (typeof khusus === "number" && Number.isFinite(khusus) && khusus >= 0) {
    return khusus;
  }
  return Number.isFinite(global) && global >= 0 ? global : 0;
}

/** Laba kotor satu pesanan; tidak pernah negatif bila harga jual diubah manual. */
export function labaPesanan(hargaJual: number, hargaModal: number): number {
  if (!Number.isInteger(hargaJual) || !Number.isInteger(hargaModal)) {
    throw new Error("Nominal pesanan harus rupiah bulat.");
  }
  return Math.max(0, hargaJual - hargaModal);
}

/**
 * Bersihkan nomor tujuan sesuai jenis produk.
 *
 * Nomor HP Indonesia sering dikirim sebagai +62/62; keduanya dinormalkan ke 0
 * supaya provider menerima format yang sama dan duplikat tidak lolos. Nomor
 * meter PLN tidak berawalan 0, jadi aturannya terpisah.
 *
 * Melempar pesan yang bisa langsung ditampilkan ke pembeli — bukan kode error.
 */
export function nomorTujuanBersih(kategori: KategoriPpob, teks: string): string {
  const mentah = teks.trim();
  if (mentah === "") throw new Error("Nomor tujuan wajib diisi.");

  if (kategori === "game") {
    // ID game boleh membawa server/zone dalam tanda kurung: 12345678(1234).
    const bersih = mentah.replace(/\s+/g, "");
    if (!/^\d{5,20}(\(\d{1,6}\))?$/.test(bersih)) {
      throw new Error("ID game harus 5–20 angka, dengan server dalam kurung bila perlu.");
    }
    return bersih;
  }

  let digit = mentah.replace(/\D/g, "");
  if (kategori === "token-listrik") {
    if (!/^\d{11,12}$/.test(digit)) {
      throw new Error("Nomor meter/token listrik harus 11–12 angka.");
    }
    return digit;
  }

  if (digit.startsWith("62") && digit.length > 10) digit = `0${digit.slice(2)}`;
  if (digit.startsWith("8") && digit.length >= 9) digit = `0${digit}`;

  if (kategori === "pulsa" || kategori === "data" || kategori === "ewallet") {
    if (!/^08\d{8,11}$/.test(digit)) {
      throw new Error("Nomor HP harus diawali 08 dan berisi 10–13 angka.");
    }
    return digit;
  }

  if (!/^\d{6,20}$/.test(digit)) {
    throw new Error("Nomor tujuan harus 6–20 angka.");
  }
  return digit;
}

/** Versi boolean dari aturan di atas, untuk menonaktifkan tombol di layar. */
export function nomorTujuanValid(kategori: KategoriPpob, teks: string): boolean {
  try {
    nomorTujuanBersih(kategori, teks);
    return true;
  } catch {
    return false;
  }
}

/**
 * Samarkan nomor untuk halaman status publik.
 *
 * Empat digit awal dan empat digit akhir cukup bagi pembeli untuk mengenali
 * nomornya, tetapi tidak membocorkan nomor lengkap kepada siapa pun yang
 * menebak kode pesanan.
 */
export function maskNomor(nomor: string): string {
  const bersih = nomor.trim();
  if (bersih.length <= 6) return `${bersih.slice(0, 2)}••${bersih.slice(-2)}`;
  return `${bersih.slice(0, 4)}••••${bersih.slice(-4)}`;
}

/**
 * Kode pesanan yang dibaca manusia: `PPOB-261028-7K3M9Q`.
 *
 * Tanggal memakai kalender WIB (fungsi `tanggalWIB`), bukan tanggal perangkat
 * atau UTC, supaya pesanan pukul 01.00 WIB tidak tampak terbuat kemarin.
 */
export function buatKodePesanan(waktu: number, acak: string): string {
  const kode = acak.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
  if (kode.length < 4) throw new Error("Kode acak pesanan terlalu pendek.");
  const tanggal = new Date(waktu + 7 * 60 * 60 * 1000).toISOString().slice(2, 10);
  return `PPOB-${tanggal.replace(/-/g, "")}-${kode}`;
}

/**
 * `ref_id` provider: alfanumerik, unik, dan stabil selama percobaan ulang.
 *
 * Digiflazz memakai `ref_id` sebagai kunci idempotensi: mengirim ulang dengan
 * ref yang sama berarti "periksa transaksi ini", bukan membuat transaksi baru.
 * Karena itu nilainya disimpan pada pesanan dan tidak pernah dibuat ulang
 * ketika admin menekan "proses" dua kali.
 */
export function buatRefId(waktu: number, acak: string): string {
  const kode = acak.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
  if (kode.length < 4) throw new Error("Kode acak referensi terlalu pendek.");
  return `PDB${waktu.toString(36).toUpperCase()}${kode}`;
}

/**
 * Terjemahkan status provider ke status internal.
 *
 * Urutan pemeriksaan penting: `Gagal` menang atas `rc` apa pun. Sebelumnya
 * pemetaan yang mendahulukan `rc = 00` bisa menandai transaksi gagal sebagai
 * sukses hanya karena kode responsnya membingungkan. Status yang tidak dikenal
 * dianggap masih diproses — lebih aman menunggu webhook berikutnya daripada
 * memberi tahu pembeli bahwa pesanan selesai padahal belum.
 */
export function statusDariProvider(
  status: string,
  rc?: string,
): StatusPesananPpob {
  const teks = status.trim().toLowerCase();
  if (teks === "gagal" || teks === "failed" || teks === "error") return "gagal";
  if (teks === "sukses" || teks === "success" || teks === "berhasil") return "sukses";
  if (teks === "pending" || teks === "proses" || teks === "processing") {
    return "diproses";
  }
  if (rc === "00") return "sukses";
  if (rc === "01" || rc === "02") return "gagal";
  return "diproses";
}

/** Status yang boleh diproses ke provider (sudah dibayar, belum final). */
export function bolehDiproses(status: StatusPesananPpob): boolean {
  return status === "dibayar" || status === "diproses";
}

/** Status yang sudah final — webhook susulan tidak boleh mengubahnya lagi. */
export function statusFinal(status: StatusPesananPpob): boolean {
  return status === "sukses" || status === "gagal" || status === "refund";
}
