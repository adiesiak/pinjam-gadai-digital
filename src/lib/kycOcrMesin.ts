/**
 * MESIN OCR KTP — dijalankan LOKAL di peramban.
 *
 * Kenapa di peramban, bukan di Convex:
 * - Gambar KTP tetap di perangkat pengguna; tidak dikirim ke server mana pun,
 *   apalagi ke API OCR pihak ketiga. Ini juga memenuhi syarat "jangan simpan
 *   hasil OCR atau gambar di log biasa": tidak ada yang menyeberang jaringan.
 * - Worker WASM + data bahasa (`ind.traineddata.gz`) sulit dibundel andal di
 *   dalam action Convex "use node" (worker thread + berkas biner). Peramban
 *   adalah "lingkungan lokal yang sesuai" untuk mesin ini.
 *
 * Semua aset disajikan dari origin aplikasi sendiri (tanpa CDN):
 * - worker & core di-bundle Vite lewat `?url`,
 * - model bahasa Indonesia ada di `public/ocr/ind.traineddata.gz` (`langPath`).
 *
 * Pustaka: `tesseract.js` (Apache-2.0) + model `ind`. Tidak ada API OCR pihak
 * ketiga. Modul ini TIDAK mencatat teks KTP ke log — status kemajuan saja yang
 * diteruskan ke pemanggil.
 */
import coreUrl from "tesseract.js-core/tesseract-core-lstm.wasm.js?url";
import workerUrl from "tesseract.js/dist/worker.min.js?url";

/** Kode bahasa model yang dipakai (Indonesia). */
export const MODEL_OCR_KTP = "ind";

/** Hasil mentah mesin: teks + keyakinan rata-rata (0–100). */
export type HasilMesinOcr = { teks: string; konfidensi: number };

/** Kemajuan yang bisa ditampilkan (tanpa teks KTP). */
export type KemajuanOcr = { status: string; persen: number };

export type OpsiOcr = {
  onProgres?: (kemajuan: KemajuanOcr) => void;
};

/** Pesan galat yang siap ditampilkan bila mesin gagal dimuat/dijalankan. */
const GALAT_UMUM = "Mesin OCR gagal dijalankan. Coba muat ulang halaman, lalu pindai lagi.";

/**
 * Jalankan OCR pada satu gambar (memakai berkas yang sedang dipilih pengguna).
 *
 * Worker dibuat sekali per pemanggilan lalu dihentikan lagi — supaya memori
 * (ratusan MB saat model dimuat) tidak tertahan setelah selesai. Pemanggil tidak
 * menerima log apa pun; hanya `{ teks, konfidensi }`.
 */
export async function jalankanOcrKtp(gambar: Blob, opsi: OpsiOcr = {}): Promise<HasilMesinOcr> {
  let createWorker: typeof import("tesseract.js").createWorker;
  try {
    ({ createWorker } = await import("tesseract.js"));
  } catch {
    throw new Error(GALAT_UMUM);
  }

  const worker = await createWorker(MODEL_OCR_KTP, 1, {
    workerPath: workerUrl,
    corePath: coreUrl,
    langPath: "/ocr",
    // `logger` menerima status/progres — TIDAK PERNAH memuat teks hasil OCR.
    logger: (m) => {
      if (opsi.onProgres === undefined) return;
      const status = typeof m.status === "string" ? m.status : "";
      const progres = typeof m.progress === "number" ? m.progress : 0;
      opsi.onProgres({ status, persen: Math.round(Math.max(0, Math.min(1, progres)) * 100) });
    },
  });

  try {
    const { data } = await worker.recognize(gambar, {}, { text: true, blocks: true });
    return {
      teks: typeof data.text === "string" ? data.text : "",
      konfidensi: typeof data.confidence === "number" ? data.confidence : 0,
    };
  } catch {
    throw new Error(GALAT_UMUM);
  } finally {
    // Bebaskan memori worker apa pun hasilnya.
    await worker.terminate().catch(() => undefined);
  }
}
