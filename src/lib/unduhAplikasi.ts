/**
 * Data halaman unduh aplikasi Android.
 *
 * Halaman `/aplikasi` membaca `public/version.json`, berkas yang juga dibaca
 * APK saat dibuka. Satu sumber berarti halaman tidak bisa menjanjikan versi
 * yang berbeda dari yang ditawarkan aplikasi.
 *
 * Modul ini murni: tidak menyentuh DOM dan tidak memanggil `Date.now()`, supaya
 * isi berkas versi bisa diperiksa dan status versi bisa diuji tanpa peramban.
 */

/** Jalur APK bawaan bila `version.json` tidak bisa dibaca. */
export const TAUTAN_UNDUH_CADANGAN = "/pindai.apk";

/** Nama berkas yang disimpan peramban saat tautan diklik. */
export const NAMA_BERKAS_UNDUHAN = "PINDAI.apk";

export type InfoUnduhan = {
  versiKode: number;
  versiNama: string;
  /** Alamat http(s) utuh atau jalur `/...` di situs ini. */
  tautan: string;
  /** Ukuran berkas dalam byte; null bila server tidak menyebutkannya. */
  ukuranByte: number | null;
};

export type HasilMuatUnduhan =
  | { ok: true; info: InfoUnduhan }
  | { ok: false; alasan: string };

export type NadaStatus = "netral" | "sukses" | "perhatian";

export type StatusVersi = {
  nada: NadaStatus;
  teks: string;
};

/**
 * Periksa isi `version.json` sebelum dipakai halaman.
 *
 * Aturannya sama dengan pengumuman pembaruan: kode versi bilangan bulat positif,
 * nama berbentuk 1.2 atau 1.2.0, dan tautan yang benar-benar bisa dibuka.
 * `//host` ditolak karena bisa mengarahkan pengunjung ke domain lain.
 */
export function bacaInfoUnduhan(nilai: unknown): InfoUnduhan | null {
  if (typeof nilai !== "object" || nilai === null) return null;
  const data = nilai as Record<string, unknown>;

  const kode = data.versionCode;
  if (!Number.isInteger(kode) || (kode as number) < 1 || (kode as number) > 1_000_000) {
    return null;
  }

  const nama = data.versionName;
  if (typeof nama !== "string" || !/^\d+\.\d+(\.\d+)?$/.test(nama) || nama.length > 20) {
    return null;
  }

  const tautan = data.apkUrl;
  if (typeof tautan !== "string" || tautan.length === 0 || tautan.length > 200) {
    return null;
  }
  if (/\s/.test(tautan) || tautan.startsWith("//")) return null;
  const absolut = /^https?:\/\/[^\s/]+\.[^\s]+$/i.test(tautan);
  const jalur = tautan.startsWith("/");
  if (!absolut && !jalur) return null;

  return {
    versiKode: kode as number,
    versiNama: nama,
    tautan,
    ukuranByte: null,
  };
}

/** Ukuran berkas untuk dibaca manusia, atau null bila angkanya tidak masuk akal. */
export function ukuranTerbaca(byte: number | null): string | null {
  if (byte === null || !Number.isFinite(byte) || byte <= 0) return null;
  if (byte < 1024) return `${Math.round(byte)} B`;
  if (byte < 1024 * 1024) return `${Math.round(byte / 1024)} KB`;
  return `${(byte / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Keadaan versi yang sedang dipakai pengunjung.
 *
 * Hanya penanda User-Agent yang bisa dibaca lapisan web, jadi peramban biasa
 * selalu "netral". Aplikasi yang lebih baru dari berkas di server tidak
 * dianggap usang: bisa saja pengunjung memakai build uji internal.
 */
export function statusVersi(
  terpasang: number | null,
  info: Pick<InfoUnduhan, "versiKode" | "versiNama">,
): StatusVersi {
  if (terpasang === null) {
    return {
      nada: "netral",
      teks: "Halaman ini dibuka di peramban. Versi aplikasi yang terpasang tidak bisa dibaca dari sini.",
    };
  }
  if (terpasang === 0) {
    return {
      nada: "perhatian",
      teks: "Aplikasi yang Anda pakai dibuat sebelum penomoran versi. Pasang berkas di halaman ini untuk mendapat penanda versi.",
    };
  }
  if (terpasang === info.versiKode) {
    return {
      nada: "sukses",
      teks: `Aplikasi yang Anda pakai sudah versi ${info.versiNama} (kode ${info.versiKode}).`,
    };
  }
  if (terpasang < info.versiKode) {
    return {
      nada: "perhatian",
      teks: `Pembaruan tersedia: aplikasi Anda kode ${terpasang}, berkas di halaman ini kode ${info.versiKode}.`,
    };
  }
  return {
    nada: "netral",
    teks: `Aplikasi Anda (kode ${terpasang}) lebih baru dari berkas di halaman ini.`,
  };
}

/**
 * Ambil versi dan ukuran berkas.
 *
 * `version.json` wajib berhasil; ukuran hanya pelengkap, jadi kegagalan HEAD
 * tidak membuat halaman gagal. Tidak melempar: pemanggil menerima alasan yang
 * bisa ditampilkan apa adanya.
 */
export async function muatInfoUnduhan(
  ambil: typeof fetch = fetch,
): Promise<HasilMuatUnduhan> {
  try {
    const jawaban = await ambil("/version.json", { cache: "no-store" });
    if (!jawaban.ok) {
      return { ok: false, alasan: `Berkas versi menjawab HTTP ${jawaban.status}.` };
    }

    const info = bacaInfoUnduhan(await jawaban.json());
    if (info === null) {
      return { ok: false, alasan: "Isi version.json tidak dikenali." };
    }

    let ukuranByte: number | null = null;
    try {
      const kepala = await ambil(info.tautan, { method: "HEAD", cache: "no-store" });
      const panjang = kepala.ok ? Number(kepala.headers.get("content-length")) : NaN;
      if (Number.isFinite(panjang) && panjang > 0) ukuranByte = panjang;
    } catch {
      // Ukuran hanya pelengkap; tautan unduhan tetap dipakai.
    }

    return { ok: true, info: { ...info, ukuranByte } };
  } catch {
    return { ok: false, alasan: "Halaman tidak bisa menghubungi server." };
  }
}
