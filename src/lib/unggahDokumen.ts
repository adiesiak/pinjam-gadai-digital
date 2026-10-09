import type { Id } from "../convex/_generated/dataModel";
import { MAX_FILE_BYTES } from "./kyc";

/** Laporan progres unggahan dari lapisan pengiriman (byte, bukan karangan). */
export type ProgresUnggah = {
  /** Byte yang sudah terkirim menurut lapisan pengiriman. */
  dimuat: number;
  /** Total byte bila diketahui; 0 berarti TIDAK diketahui (jangan dikira-kira). */
  total: number;
};

/**
 * Bagian `XMLHttpRequest` yang benar-benar dipakai — bentuk minimum ini yang
 * membuat jalur progres bisa diuji tanpa DOM (mis. dengan tiruan di
 * `unggahDokumen.test.ts`), bukan hanya diandalkan pada peramban.
 */
export type XhrMirip = {
  open(method: string, url: string): void;
  setRequestHeader(nama: string, nilai: string): void;
  send(body: unknown): void;
  status: number;
  responseText: string;
  upload: {
    onprogress:
      | ((event: { loaded: number; lengthComputable: boolean; total: number }) => void)
      | null;
  };
  onload: (() => void) | null;
  onerror: (() => void) | null;
  onabort: (() => void) | null;
};

/**
 * Kirim berkas lewat `XMLHttpRequest` supaya progres byte BENAR-BENAR diketahui.
 *
 * `fetch` tidak melaporkan berapa byte yang sudah terkirim; dengan XHR, event
 * `upload.onprogress` melaporkannya dari lapisan jaringan. Karena itu jalur ini
 * dipakai saat pemanggil meminta progres, sedangkan jalur `fetch` tetap jadi
 * cadangan (lingkungan tanpa XHR, mis. saat pengujian) dengan perilaku yang sama
 * persis soal status HTTP, badan JSON, dan pesan galat.
 */
export function kirimBerkasViaXhr(
  url: string,
  file: Blob,
  label: string,
  onProgres?: (progres: ProgresUnggah) => void,
  buatXhr: () => XhrMirip = () => new XMLHttpRequest() as unknown as XhrMirip,
): Promise<{ storageId?: Id<"_storage"> }> {
  const pesanGagal = `${label} gagal diunggah. Coba lagi.`;
  return new Promise((resolve, reject) => {
    const xhr = buatXhr();
    xhr.open("POST", url);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    if (onProgres !== undefined) {
      xhr.upload.onprogress = (event) => {
        onProgres({
          dimuat: event.loaded,
          // Total yang tidak komputabel dilaporkan sebagai 0 — pemanggil akan
          // memakai bilah tak tentu, bukan persen yang dikarang.
          total: event.lengthComputable ? event.total : 0,
        });
      };
    }
    xhr.onerror = () => reject(new Error(pesanGagal));
    xhr.onabort = () => reject(new Error(pesanGagal));
    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(pesanGagal));
        return;
      }
      try {
        resolve(JSON.parse(xhr.responseText) as { storageId?: Id<"_storage"> });
      } catch {
        reject(new Error(pesanGagal));
      }
    };
    xhr.send(file);
  });
}

/**
 * Unggah SATU berkas dokumen ke Convex storage lewat URL unggah dari server.
 *
 * Dipakai bersama oleh panel admin (foto KTP data diri, selfie KTP, bukti
 * penghasilan pengajuan manual) supaya batas ukuran, cara POST, dan pesan
 * galatnya sama — bukan tiga salinan yang bisa berbeda diam-diam. Izin unggah
 * tetap ditentukan server: `mintaUrl` adalah mutation admin yang digerbang.
 *
 * `periksa` opsional dipanggil dengan storage id SETELAH unggah berhasil.
 * Situs pemanggil mengisinya dengan action pemeriksa ISI berkas (magic bytes,
 * `berkasIdentitas.periksaIsiBerkasKyc`); berkas yang mengaku gambar tetapi
 * isinya bukan gambar tertolak sebelum ditautkan ke pengajuan. Helper ini
 * sendiri tetap murni (tanpa Convex) lewat callback tersebut.
 *
 * `onProgres` opsional menerima byte yang sedang terkirim dari lapisan jaringan.
 * Bila diisi dan peramban punya `XMLHttpRequest`, pengiriman memakai jalur itu
 * (satu-satunya cara mendapat angka byte yang nyata); tanpa itu, pengiriman
 * memakai `fetch` dan pemanggil cukup menampilkan bilah tak tentu — bukan
 * persen yang dikarang.
 */
export async function unggahDokumen(
  file: File,
  mintaUrl: () => Promise<string>,
  label = "Berkas",
  periksa?: (id: Id<"_storage">) => Promise<void>,
  onProgres?: (progres: ProgresUnggah) => void,
): Promise<Id<"_storage">> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`${label} maksimal ${Math.round(MAX_FILE_BYTES / (1024 * 1024))} MB.`);
  }
  const url = await mintaUrl();
  const json =
    onProgres !== undefined && typeof XMLHttpRequest !== "undefined"
      ? await kirimBerkasViaXhr(url, file, label, onProgres)
      : await kirimBerkasViaFetch(url, file, label);
  if (!json.storageId) {
    throw new Error(`${label} gagal diunggah. Coba lagi.`);
  }
  if (periksa !== undefined) await periksa(json.storageId);
  return json.storageId;
}

/**
 * Jalur cadangan: `fetch`, tanpa laporan progres byte.
 *
 * Status HTTP diperiksa lebih dulu: badan galat dari server/storage sering
 * kosong atau bukan JSON, dan `res.json()` akan melempar SyntaxError yang
 * membingungkan sebelum pesan galat yang benar sempat dipakai. Badan sukses yang
 * bukan JSON (proxy/redirect) tetap dianggap gagal bersih, dan berhasil hanya
 * bila server mengembalikan `storageId`.
 */
async function kirimBerkasViaFetch(
  url: string,
  file: File,
  label: string,
): Promise<{ storageId?: Id<"_storage"> }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: file,
  });
  if (!res.ok) {
    throw new Error(`${label} gagal diunggah. Coba lagi.`);
  }
  try {
    return (await res.json()) as { storageId?: Id<"_storage"> };
  } catch {
    return {};
  }
}
