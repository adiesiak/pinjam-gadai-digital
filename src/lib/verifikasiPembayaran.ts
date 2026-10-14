export type JenisMediaVerifikasi =
  | "wajahSnapshot"
  | "wajahVideo"
  | "lingkunganSnapshot"
  | "lingkunganVideo";

export type MediaVerifikasiPembayaran = Record<JenisMediaVerifikasi, File>;

export type TitikVerifikasiPembayaran = {
  latitude: number;
  longitude: number;
  accuracy: number;
};

export type TahapVerifikasiKamera = "kamera_depan" | "kamera_belakang";

export type RingkasanMediaVerifikasi = {
  wajahFotoByte: number;
  wajahVideoByte: number;
  lingkunganFotoByte: number;
  lingkunganVideoByte: number;
  totalByte: number;
};

const BATAS_FOTO_BYTE = 8_000_000;
const BATAS_VIDEO_BYTE = 22_000_000;
const BATAS_TOTAL_BYTE = 60_000_000;
const DURASI_REKAMAN_MS = 10_000;

function pastikanBelumDibatalkan(signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException("Verifikasi dibatalkan.", "AbortError");
}

function tungguVideoSiap(video: HTMLVideoElement, signal: AbortSignal): Promise<void> {
  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const bersih = () => {
      video.removeEventListener("loadeddata", siap);
      video.removeEventListener("error", gagal);
      signal.removeEventListener("abort", batal);
    };
    const siap = () => {
      bersih();
      resolve();
    };
    const gagal = () => {
      bersih();
      reject(new Error("Kamera tidak dapat menampilkan gambar."));
    };
    const batal = () => {
      bersih();
      reject(new DOMException("Verifikasi dibatalkan.", "AbortError"));
    };
    video.addEventListener("loadeddata", siap, { once: true });
    video.addEventListener("error", gagal, { once: true });
    signal.addEventListener("abort", batal, { once: true });
  });
}

function snapshot(video: HTMLVideoElement, nama: string): Promise<File> {
  if (video.videoWidth < 1 || video.videoHeight < 1) {
    return Promise.reject(new Error("Kamera belum siap mengambil snapshot."));
  }
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const context = canvas.getContext("2d");
  if (context === null) return Promise.reject(new Error("Snapshot tidak dapat diproses."));
  context.drawImage(video, 0, 0);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob === null) {
        reject(new Error("Snapshot tidak dapat disimpan."));
        return;
      }
      resolve(new File([blob], nama, { type: "image/jpeg" }));
    }, "image/jpeg", 0.86);
  });
}

function jenisRekaman(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return ["video/webm;codecs=vp8", "video/webm", "video/mp4"].find((jenis) =>
    MediaRecorder.isTypeSupported(jenis),
  );
}

function rekamSingkat(stream: MediaStream, signal: AbortSignal): Promise<Blob> {
  if (typeof MediaRecorder === "undefined") {
    return Promise.reject(new Error("Perekaman video tidak didukung peramban ini."));
  }
  const mimeType = jenisRekaman();
  const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
  return new Promise((resolve, reject) => {
    const bagian: Blob[] = [];
    const selesai = () => {
      window.clearTimeout(timer);
      signal.removeEventListener("abort", batal);
    };
    const timer = window.setTimeout(() => {
      if (recorder.state !== "inactive") recorder.stop();
    }, DURASI_REKAMAN_MS);
    const batal = () => {
      if (recorder.state !== "inactive") recorder.stop();
    };
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) bagian.push(event.data);
    };
    recorder.onerror = () => {
      selesai();
      reject(new Error("Video tidak dapat direkam."));
    };
    recorder.onstop = () => {
      selesai();
      if (signal.aborted) {
        reject(new DOMException("Verifikasi dibatalkan.", "AbortError"));
      } else {
        const blob = new Blob(bagian, { type: recorder.mimeType || mimeType || "video/webm" });
        if (blob.size === 0) reject(new Error("Video tidak berisi rekaman."));
        else resolve(blob);
      }
    };
    signal.addEventListener("abort", batal, { once: true });
    recorder.start(250);
  });
}

async function rekamKamera(
  video: HTMLVideoElement,
  tahap: TahapVerifikasiKamera,
  signal: AbortSignal,
): Promise<{ snapshot: File; video: File }> {
  pastikanBelumDibatalkan(signal);
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Akses kamera tidak didukung peramban ini.");
  }
  const facingMode = tahap === "kamera_depan" ? "user" : "environment";
  let stream: MediaStream | null = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { exact: facingMode },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    });
    pastikanBelumDibatalkan(signal);
    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;
    await video.play();
    await tungguVideoSiap(video, signal);
    const label = tahap === "kamera_depan" ? "wajah" : "lingkungan";
    const foto = await snapshot(video, `${label}-${Date.now()}.jpg`);
    const blob = await rekamSingkat(stream, signal);
    const ekstensi = blob.type.includes("mp4") ? "mp4" : "webm";
    return {
      snapshot: foto,
      video: new File([blob], `${label}-${Date.now()}.${ekstensi}`, { type: blob.type }),
    };
  } finally {
    if (stream !== null) {
      for (const track of stream.getTracks()) track.stop();
      if (video.srcObject === stream) video.srcObject = null;
    }
  }
}

/** Lokasi hanya diminta setelah pengguna menekan tombol persetujuan. */
export function ambilLokasiUntukVerifikasi(): Promise<TitikVerifikasiPembayaran> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.reject(new Error("Lokasi perangkat tidak tersedia."));
  }
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({
        latitude: coords.latitude,
        longitude: coords.longitude,
        accuracy: coords.accuracy,
      }),
      () => reject(new Error("Lokasi tidak dapat diambil.")),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 25_000 },
    );
  });
}

/** Mengambil depan lalu belakang; setiap stream dihentikan sebelum kamera berikutnya dibuka. */
export function ringkasanMediaVerifikasi(
  media: MediaVerifikasiPembayaran,
): RingkasanMediaVerifikasi {
  const ringkasan: RingkasanMediaVerifikasi = {
    wajahFotoByte: media.wajahSnapshot.size,
    wajahVideoByte: media.wajahVideo.size,
    lingkunganFotoByte: media.lingkunganSnapshot.size,
    lingkunganVideoByte: media.lingkunganVideo.size,
    totalByte: 0,
  };
  if (
    media.wajahSnapshot.type !== "image/jpeg" ||
    media.lingkunganSnapshot.type !== "image/jpeg" ||
    !media.wajahVideo.type.startsWith("video/") ||
    !media.lingkunganVideo.type.startsWith("video/") ||
    Object.values(ringkasan).some((ukuran) => !Number.isSafeInteger(ukuran) || ukuran < 0)
  ) {
    throw new Error("Format media verifikasi tidak dapat diproses.");
  }
  if (ringkasan.wajahFotoByte > BATAS_FOTO_BYTE || ringkasan.lingkunganFotoByte > BATAS_FOTO_BYTE) {
    throw new Error("Foto verifikasi melebihi batas 8 MB per foto.");
  }
  if (ringkasan.wajahVideoByte > BATAS_VIDEO_BYTE || ringkasan.lingkunganVideoByte > BATAS_VIDEO_BYTE) {
    throw new Error("Video verifikasi melebihi batas 22 MB per video.");
  }
  ringkasan.totalByte =
    ringkasan.wajahFotoByte + ringkasan.wajahVideoByte +
    ringkasan.lingkunganFotoByte + ringkasan.lingkunganVideoByte;
  if (ringkasan.totalByte > BATAS_TOTAL_BYTE) {
    throw new Error("Total media verifikasi melebihi batas 60 MB.");
  }
  return ringkasan;
}

export async function rekamVerifikasiPembayaran(
  video: HTMLVideoElement,
  signal: AbortSignal,
  onTahap: (tahap: TahapVerifikasiKamera) => void,
): Promise<MediaVerifikasiPembayaran> {
  onTahap("kamera_depan");
  const depan = await rekamKamera(video, "kamera_depan", signal);
  pastikanBelumDibatalkan(signal);
  onTahap("kamera_belakang");
  const belakang = await rekamKamera(video, "kamera_belakang", signal);
  return {
    wajahSnapshot: depan.snapshot,
    wajahVideo: depan.video,
    lingkunganSnapshot: belakang.snapshot,
    lingkunganVideo: belakang.video,
  };
}
