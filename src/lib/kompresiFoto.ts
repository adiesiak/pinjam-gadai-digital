/**
 * KOMPRESI FOTO KYC — dijalankan seluruhnya DI PERANGKAT (tanpa Convex, tanpa
 * jaringan) supaya berkas yang diunggah tidak membengkakkan kuota dan tidak
 * memakan waktu lama di HP ber-RAM kecil.
 *
 * Kenapa berkas ini ada: kamera HP masa kini menghasilkan foto beberapa
 * megabyte. Foto sebesar itu diunggah lewat data seluler, dan di ponsel kelas
 * bawah unggahan besar itulah yang paling sering membuat tab di-refresh
 * sistem operasi — justru masalah yang mau dihindari kamera dalam aplikasi.
 *
 * Aturan yang berlaku (dan diuji di `kompresiFoto.test.ts`):
 * - Semua foto dikodekan ulang sebagai JPEG berkualitas 0,7 (ketentuan produk).
 * - Sisi terpanjang dibatasi 1600 px; ukuran itu masih lebih dari cukup untuk
 *   membaca NIK pada KTP.
 * - Bila hasilnya masih di atas 500 KB, kualitas diturunkan bertahap (minimal
 *   0,4) lalu ukurannya diperkecil — BUKAN dibiarkan lewat begitu saja. Batas
 *   itu keras: `sesuaiTarget` menyatakan apakah target benar-benar tercapai.
 *
 * Fungsi murni (`perkiraanByteDataUrl`, `skalaUntukMaksSisi`, `kualitasBerikut`)
 * dipisah dari bagian yang menyentuh `<canvas>` supaya bisa diuji tanpa DOM.
 */

/** Takaran kompresi foto KYC — satu sumber untuk komponen kamera dan uji. */
export const TAKARAN_FOTO_KYC = {
  /** Kualitas JPEG sesuai ketentuan produk. */
  kualitas: 0.7,
  /** Target ukuran berkas yang dikirim ke server. */
  maksByte: 500 * 1024,
  /** Sisi terpanjang gambar (px). Cukup untuk membaca teks pada KTP. */
  maksSisi: 1600,
  /** Batas bawah kualitas — di bawah ini gambar jadi tidak layak dibaca. */
  kualitasMinimum: 0.4,
  /** Berapa kali ukuran boleh diperkecil sebelum menyerah. */
  maksPenurunan: 3,
} as const;

export type TakaranFoto = {
  kualitas: number;
  maksByte: number;
  maksSisi: number;
  kualitasMinimum: number;
  maksPenurunan: number;
};

export type HasilKompresi = {
  /** Data URL JPEG siap dipakai sebagai berkas maupun pratinjau. */
  dataUrl: string;
  /** Perkiraan ukuran berkas setelah didekode (byte). */
  byte: number;
  /** Kualitas JPEG akhir yang benar-benar dipakai. */
  kualitas: number;
  lebar: number;
  tinggi: number;
  /** true bila `byte` sudah di bawah `maksByte`. */
  sesuaiTarget: boolean;
};

/**
 * Ukuran byte dari sebuah data URL base64 — tanpa DOM maupun `atob`.
 *
 * Setiap 4 karakter base64 mewakili 3 byte, dikurangi padding `=`. Hasilnya
 * PERSIS ukuran isi yang akan didekode (bukan perkiraan kasar), sehingga batas
 * 500 KB bisa dipercaya tanpa harus membuat `Blob` lebih dulu.
 */
export function perkiraanByteDataUrl(dataUrl: string): number {
  const koma = dataUrl.indexOf(",");
  if (koma < 0) return 0;
  const isi = dataUrl.slice(koma + 1);
  if (isi === "") return 0;
  const pad = isi.endsWith("==") ? 2 : isi.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((isi.length * 3) / 4) - pad);
}

/**
 * Faktor skala agar sisi terpanjang tidak melebihi `maksSisi`.
 * Gambar yang sudah cukup kecil TIDAK diperbesar (mengembalikan 1).
 */
export function skalaUntukMaksSisi(lebar: number, tinggi: number, maksSisi: number): number {
  const sisi = Math.max(lebar, tinggi);
  if (!Number.isFinite(sisi) || sisi <= 0 || !Number.isFinite(maksSisi) || maksSisi <= 0) return 1;
  if (sisi <= maksSisi) return 1;
  return maksSisi / sisi;
}

/** Kualitas JPEG berikutnya saat hasilnya masih terlalu besar; null = habis. */
export function kualitasBerikut(kualitas: number, minimum: number): number | null {
  const berikut = Math.round((kualitas - 0.1) * 10) / 10;
  return berikut >= minimum ? berikut : null;
}

/** Kalimat hasil kompresi untuk ditampilkan ke pengguna (KB, bukan byte). */
export function ringkasKompresi(hasil: HasilKompresi): string {
  const kb = Math.max(1, Math.round(hasil.byte / 1024));
  return hasil.sesuaiTarget
    ? `Foto siap: ${kb} KB (JPEG ${Math.round(hasil.kualitas * 100)}%).`
    : `Foto masih ${kb} KB setelah dikecilkan — coba ambil ulang dengan pencahayaan lebih terang.`;
}

/**
 * Bagian `<canvas>` yang dipakai kompresor ini. Dipersempit (bukan
 * `HTMLCanvasElement` penuh) supaya perilakunya bisa diuji dengan kanvas tiruan
 * tanpa DOM — sekaligus jelas bahwa tidak ada API lain yang dibutuhkan.
 */
export type KanvasKompresi = Pick<
  HTMLCanvasElement,
  "width" | "height" | "toDataURL" | "getContext"
>;

function skalaUlang(sumber: KanvasKompresi, faktor: number): KanvasKompresi | null {
  if (typeof document === "undefined") return null;
  const kanvas = document.createElement("canvas");
  kanvas.width = Math.max(1, Math.round(sumber.width * faktor));
  kanvas.height = Math.max(1, Math.round(sumber.height * faktor));
  const ctx = kanvas.getContext("2d");
  if (ctx === null) return null;
  ctx.drawImage(sumber as unknown as CanvasImageSource, 0, 0, kanvas.width, kanvas.height);
  return kanvas;
}

function kodekan(kanvas: KanvasKompresi, kualitas: number): HasilKompresi {
  const dataUrl = kanvas.toDataURL("image/jpeg", kualitas);
  const byte = perkiraanByteDataUrl(dataUrl);
  return { dataUrl, byte, kualitas, lebar: kanvas.width, tinggi: kanvas.height, sesuaiTarget: false };
}

/**
 * Kodekan ulang isi kanvas menjadi JPEG ≤ 500 KB.
 *
 * Urutannya sengaja: batasi dimensi dulu, baru turunkan kualitas, terakhir
 * perkecil ukuran — menurunkan kualitas lebih dulu mempertahankan ketajaman
 * gambar dibanding langsung mengecilkan ukuran.
 */
export function kompresKanvasKeJpeg(
  sumber: KanvasKompresi,
  opsi: Partial<TakaranFoto> = {},
): HasilKompresi {
  const takaran: TakaranFoto = { ...TAKARAN_FOTO_KYC, ...opsi };
  let kanvas: KanvasKompresi = sumber;

  const skalaAwal = skalaUntukMaksSisi(sumber.width, sumber.height, takaran.maksSisi);
  if (skalaAwal < 1) {
    const kecil = skalaUlang(sumber, skalaAwal);
    if (kecil !== null) kanvas = kecil;
  }

  let hasil = kodekan(kanvas, takaran.kualitas);
  for (let penurunan = 0; penurunan <= takaran.maksPenurunan; penurunan += 1) {
    // Kualitas diturunkan sampai batas bawah sebelum ukurannya diperkecil.
    let kualitas = hasil.kualitas;
    for (;;) {
      if (hasil.byte <= takaran.maksByte) break;
      const berikut = kualitasBerikut(kualitas, takaran.kualitasMinimum);
      if (berikut === null) break;
      kualitas = berikut;
      hasil = kodekan(kanvas, kualitas);
    }
    if (hasil.byte <= takaran.maksByte) break;
    if (penurunan === takaran.maksPenurunan) break;
    const kecil = skalaUlang(kanvas, 0.75);
    if (kecil === null) break;
    kanvas = kecil;
    hasil = kodekan(kanvas, takaran.kualitas);
  }

  return { ...hasil, sesuaiTarget: hasil.byte <= takaran.maksByte };
}

/** Ubah data URL menjadi `File` agar jalur unggah yang ada tidak perlu diubah. */
export function dataUrlKeFile(dataUrl: string, nama: string): File {
  const koma = dataUrl.indexOf(",");
  const isi = koma < 0 ? "" : dataUrl.slice(koma + 1);
  const biner = typeof atob === "function" ? atob(isi) : "";
  const byte = new Uint8Array(biner.length);
  for (let i = 0; i < biner.length; i += 1) byte[i] = biner.charCodeAt(i);
  return new File([byte], nama, { type: "image/jpeg" });
}
