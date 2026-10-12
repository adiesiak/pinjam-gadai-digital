/**
 * Pembantu klien untuk halaman publik `/cek-status/<token>`.
 *
 * Berkas ini memegang bagian yang berhubungan dengan PERANGKAT — kamera,
 * geolokasi, unggah berkas, dan pemanggilan HTTP action Convex. Bagian yang bisa
 * diuji tanpa browser (penurunan asal domain situs) dipisah dan diuji di
 * `cekStatus.test.ts`.
 *
 * Yang penting untuk privasi: seluruh permintaan ke server lewat HTTP action
 * `…/api/cek-status/*`, sehingga server membaca IP dari header permintaan —
 * klien tidak pernah mengirim (dan tidak bisa memalsukan) IP.
 */
import { dataUrlKeFile, kompresKanvasKeJpeg } from "./kompresiFoto";
import { dasarSitusConvex } from "./native";

/** Asal domain HTTP action Convex dari env Vite (undefined bila tidak diisi). */
function urlConvexDariEnv(): string | undefined {
  const nilai = (import.meta as { env?: Record<string, string | undefined> }).env;
  return nilai?.VITE_CONVEX_URL;
}

function urlSitusDariEnv(): string | undefined {
  const nilai = (import.meta as { env?: Record<string, string | undefined> }).env;
  return nilai?.VITE_CONVEX_SITE_URL;
}

/** Asal domain situs Convex yang dipakai halaman ini; null bila env belum diisi. */
export function asalSitusCekStatus(): string | null {
  return dasarSitusConvex(urlConvexDariEnv(), urlSitusDariEnv());
}

/** URL lengkap satu endpoint cek-status. */
export function urlEndpointCekStatus(jalur: string, asal: string | null = asalSitusCekStatus()): string | null {
  if (asal === null) return null;
  return `${asal}/api/cek-status/${jalur}`;
}

export type HasilJson<T> = {
  ok: boolean;
  status: number;
  data: T | null;
  error: string | null;
};

/**
 * Kirim JSON ke HTTP action dan baca balasannya.
 *
 * Tidak pernah melempar: jaringan seluler sering putus di tengah proses, dan
 * halaman verifikasi harus bisa menampilkan pesan yang bisa dibaca peminjam —
 * bukan layar putih karena promise yang ditolak.
 */
export async function kirimJson<T>(url: string, body: unknown): Promise<HasilJson<T>> {
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    let data: (T & { error?: unknown; ok?: unknown }) | null = null;
    try {
      data = (await resp.json()) as T & { error?: unknown; ok?: unknown };
    } catch {
      data = null;
    }
    const pesanGalat = typeof data?.error === "string" && data.error !== "" ? data.error : null;
    return {
      ok: resp.ok && (data?.ok !== false),
      status: resp.status,
      data: data === null ? null : (data as T),
      error: pesanGalat ?? (resp.ok ? null : `Permintaan gagal (HTTP ${resp.status}).`),
    };
  } catch {
    return {
      ok: false,
      status: 0,
      data: null,
      error: "Koneksi ke server PINDAI terputus. Periksa jaringan lalu coba lagi.",
    };
  }
}

/** Titik lokasi dari perangkat. */
export type TitikPerangkat = { lat: number; lng: number; akurasi: number };

/**
 * Minta satu bacaan lokasi dari perangkat.
 *
 * Sengaja satu bacaan (bukan `watchPosition`): halaman ini memang mengirim
 * titik berkala tiap 10 detik, dan bacaan tunggal jauh lebih hemat baterai
 * pada HP kelas bawah. Waktu tunggu dibatasi supaya halaman tidak menggantung
 * di area tanpa sinyal.
 */
export function mintaLokasi(
  timeoutMs = 15_000,
): Promise<{ ok: true; titik: TitikPerangkat } | { ok: false; pesan: string }> {
  if (typeof navigator === "undefined" || navigator.geolocation === undefined) {
    return Promise.resolve({
      ok: false,
      pesan: "Perangkat ini tidak menyediakan layanan lokasi (GPS).",
    });
  }
  return new Promise((selesai) => {
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        selesai({
          ok: true,
          titik: {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            akurasi: Math.max(0, Math.round(pos.coords.accuracy)),
          },
        }),
      (err) =>
        selesai({
          ok: false,
          pesan:
            err.code === err.PERMISSION_DENIED
              ? "Akses lokasi ditolak. Izinkan lokasi untuk halaman ini, lalu coba lagi."
              : "Lokasi belum bisa dibaca. Pindah ke area terbuka lalu coba lagi.",
        }),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30_000 },
    );
  });
}

/** Nyalakan kamera depan untuk satu pengambilan gambar. */
export async function bukaKamera(): Promise<
  { ok: true; stream: MediaStream } | { ok: false; pesan: string }
> {
  const media = typeof navigator === "undefined" ? undefined : navigator.mediaDevices;
  if (media === undefined || typeof media.getUserMedia !== "function") {
    return { ok: false, pesan: "Perangkat ini tidak menyediakan akses kamera lewat browser." };
  }
  try {
    const stream = await media.getUserMedia({
      video: { facingMode: "user", width: { ideal: 1280 } },
      audio: false,
    });
    return { ok: true, stream };
  } catch {
    return {
      ok: false,
      pesan: "Akses kamera ditolak. Izinkan kamera untuk halaman ini, lalu coba lagi.",
    };
  }
}

/** Tunggu elemen video benar-benar punya gambar (metadata + satu frame). */
export function tungguVideoSiap(video: HTMLVideoElement, timeoutMs = 8_000): Promise<boolean> {
  if (video.videoWidth > 0 && video.videoHeight > 0) return Promise.resolve(true);
  return new Promise((selesai) => {
    let selesaiSudah = false;
    const akhiri = (hasil: boolean) => {
      if (selesaiSudah) return;
      selesaiSudah = true;
      video.removeEventListener("loadedmetadata", saat);
      window.clearTimeout(penjaga);
      selesai(hasil);
    };
    const saat = () => akhiri(video.videoWidth > 0 && video.videoHeight > 0);
    const penjaga = window.setTimeout(() => akhiri(video.videoWidth > 0), timeoutMs);
    video.addEventListener("loadedmetadata", saat);
  });
}

/**
 * Ambil SATU kerangka dari aliran kamera, lalu kodekan ulang menjadi JPEG
 * ≤ 500 KB (`kompresKanvasKeJpeg`, takaran yang sama dengan foto KYC).
 *
 * Tidak ada pratinjau yang ditampilkan: elemen video hanya dipakai sebagai
 * sumber gambar, dan hasilnya langsung dikirim ke server tanpa gambar itu
 * pernah muncul di layar.
 */
export function ambilKerangkaSelfie(video: HTMLVideoElement): string | null {
  const lebar = video.videoWidth;
  const tinggi = video.videoHeight;
  if (lebar <= 0 || tinggi <= 0) return null;
  if (typeof document === "undefined") return null;
  const kanvas = document.createElement("canvas");
  kanvas.width = lebar;
  kanvas.height = tinggi;
  const ctx = kanvas.getContext("2d");
  if (ctx === null) return null;
  ctx.drawImage(video, 0, 0, lebar, tinggi);
  const hasil = kompresKanvasKeJpeg(kanvas);
  return hasil.dataUrl;
}

/** Unggah selfie ke penyimpanan Convex; mengembalikan ID berkas. */
export async function unggahSelfie(dataUrl: string, urlUnggah: string): Promise<
  { ok: true; fileId: string; byte: number } | { ok: false; pesan: string }
> {
  let berkas: File;
  try {
    berkas = dataUrlKeFile(dataUrl, `selfie-${Date.now()}.jpg`);
  } catch {
    return { ok: false, pesan: "Foto yang diambil tidak bisa diproses. Coba ambil ulang." };
  }
  try {
    const resp = await fetch(urlUnggah, {
      method: "POST",
      headers: { "Content-Type": berkas.type === "" ? "image/jpeg" : berkas.type },
      body: berkas,
    });
    if (!resp.ok) {
      return { ok: false, pesan: `Unggahan foto ditolak server (HTTP ${resp.status}).` };
    }
    const data = (await resp.json()) as { storageId?: unknown };
    if (typeof data.storageId !== "string" || data.storageId === "") {
      return { ok: false, pesan: "Server tidak mengembalikan ID berkas foto." };
    }
    return { ok: true, fileId: data.storageId, byte: berkas.size };
  } catch {
    return { ok: false, pesan: "Unggahan foto gagal karena koneksi terputus. Coba lagi." };
  }
}

/** Hentikan seluruh jalur kamera (selalu dipanggil, termasuk saat gagal). */
export function matikanKamera(stream: MediaStream | null): void {
  if (stream === null) return;
  for (const jalur of stream.getTracks()) jalur.stop();
}

/**
 * Kalimat singkat untuk berkas yang gagal diproses — dipakai halaman supaya
 * pengguna tahu langkah berikutnya, bukan hanya "error".
 */
export function pesanGagalVerifikasi(sebab: string): string {
  return `${sebab} Bila terus gagal, kirim pesan ke petugas PINDAI melalui kanal resmi yang telah Anda konfirmasi.`;
}
