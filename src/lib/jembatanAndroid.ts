/**
 * Jembatan ke aplikasi Android (`PindaiAndroid`).
 *
 * WebView tidak punya dua hal yang dimiliki peramban: jendela baru untuk
 * mencetak (`window.open` diblokir) dan pengelola unduhan untuk `blob:`.
 * Aplikasi Android menyuntikkan objek `PindaiAndroid` berisi tiga metode, dan
 * berkas ini yang memakainya — dengan fallback ke perilaku web biasa.
 *
 * Semua fungsi menerima `jembatan` sebagai parameter supaya bisa diuji tanpa
 * WebView: uji memberi objek palsu, bukan menambal `window` global.
 */

export type JembatanPindai = {
  /** Cetak/simpan PDF dari HTML — memakai dialog cetak Android. */
  cetak?: (html: string) => void;
  /** Simpan berkas ke folder Downloads perangkat. */
  unduh?: (nama: string, mime: string, base64: string) => void;
  /** Buka tautan di aplikasi lain (WhatsApp, peramban, surel). */
  bukaLuar?: (url: string) => void;
};

declare global {
  interface Window {
    PindaiAndroid?: JembatanPindai;
  }
}

/** Objek jembatan bila halaman berjalan di dalam aplikasi Android. */
export function jembatanPindai(): JembatanPindai | null {
  if (typeof window === "undefined") return null;
  const jembatan = window.PindaiAndroid;
  return typeof jembatan === "object" && jembatan !== null ? jembatan : null;
}

/** Cetak lewat aplikasi; `false` berarti halaman harus memakai jalur web. */
export function cetakLewatAplikasi(
  html: string,
  jembatan: JembatanPindai | null = jembatanPindai(),
): boolean {
  if (typeof jembatan?.cetak !== "function") return false;
  try {
    jembatan.cetak(html);
    return true;
  } catch {
    return false;
  }
}

/** Buka tautan di luar WebView; `false` bila aplikasi tidak menyediakannya. */
export function bukaLuarJendela(
  url: string,
  jembatan: JembatanPindai | null = jembatanPindai(),
): boolean {
  if (typeof jembatan?.bukaLuar !== "function") return false;
  try {
    jembatan.bukaLuar(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Simpan blob lewat aplikasi. Base64 dipakai karena jembatan JavaScript Android
 * hanya menerima string; ukuran berkas di aplikasi ini (CSV, poster) kecil,
 * jadi tidak perlu streaming.
 */
export async function unduhLewatAplikasi(
  nama: string,
  mime: string,
  blob: Blob,
  jembatan: JembatanPindai | null = jembatanPindai(),
): Promise<boolean> {
  if (typeof jembatan?.unduh !== "function") return false;
  try {
    const base64 = await blobKeBase64(blob);
    jembatan.unduh(nama, mime, base64);
    return true;
  } catch {
    return false;
  }
}

/**
 * Blob → base64. Dipotong 8 KB per bagian supaya `String.fromCharCode` tidak
 * kehabisan argumen pada berkas besar.
 */
export async function blobKeBase64(blob: Blob): Promise<string> {
  if (typeof btoa !== "function") {
    throw new Error("btoa tidak tersedia di lingkungan ini");
  }
  const byte = new Uint8Array(await blob.arrayBuffer());
  let biner = "";
  const potong = 0x2000;
  for (let i = 0; i < byte.length; i += potong) {
    biner += String.fromCharCode(...byte.subarray(i, i + potong));
  }
  return btoa(biner);
}
