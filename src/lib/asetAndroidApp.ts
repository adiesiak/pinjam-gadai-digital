/**
 * Pengaturan aplikasi Android — logika murni (tanpa React, tanpa Convex).
 *
 * Tujuan berkas ini: satu tempat yang memutuskan apa yang boleh disimpan admin,
 * apa yang dipakai sebagai bawaan, dan bentuk JSON yang dibaca aplikasi Android
 * saat mulai. Dengan begitu query Convex hanya membaca/menulis data, dan seluruh
 * aturannya bisa diuji sebagai skrip biasa (`bun src/lib/asetAndroidApp.test.ts`).
 *
 * Batas yang jujur soal "tanpa build ulang":
 *  - **Bisa diganti saat berjalan** — splash screen (gambar + warna), logo di
 *    dalam aplikasi, dan nama aplikasi di dalam aplikasi. Ketiganya dimuat
 *    aplikasi dari endpoint ini setiap kali dibuka.
 *  - **Tetap butuh APK baru** — ikon di layar utama (launcher). Android menyimpan
 *    ikon launcher di dalam APK dan tidak menyediakan cara menggantinya saat
 *    aplikasi berjalan; berkasnya tetap disediakan di /promo supaya sekali unduh
 *    langsung bisa dipakai saat build berikutnya.
 */
import { ambilAsetAndroid, type AsetAndroid, type AsetAndroidId } from "./asetAndroid";
import { MAX_FILE_BYTES } from "./kyc";

/** Slot aset yang dapat diganti admin. */
export const KUNCI_ASET_APLIKASI = ["ikon", "ikonSplash", "splash"] as const;
export type KunciAsetAplikasi = (typeof KUNCI_ASET_APLIKASI)[number];

/**
 * Aset bawaan tiap slot: berkas yang sudah dihasilkan `/promo`. Dipakai aplikasi
 * selama admin belum mengunggah apa pun, sehingga tampilan aplikasi tidak pernah
 * kosong.
 */
export const BAWAAN_ASET: Record<KunciAsetAplikasi, { id: AsetAndroidId; label: string; berlaku: string }> = {
  ikon: {
    id: "logo-kotak",
    label: "Ikon peluncur (bawaan)",
    berlaku:
      "Tampil sebagai logo di dalam aplikasi (header, halaman Tentang). Ikon di layar utama tetap dari APK.",
  },
  ikonSplash: {
    id: "splash-android12",
    label: "Ikon splash Android 12+ (bawaan)",
    berlaku: "Dipotong bulat oleh sistem saat layar pembuka Android 12+ dibuka.",
  },
  splash: {
    id: "splash-potret",
    label: "Splash screen potret (bawaan)",
    berlaku: "Gambar layar pembuka yang dimuat aplikasi saat mulai dibuka.",
  },
};

/** Urutan tampil panel admin. */
export const URUTAN_ASET_APLIKASI: readonly KunciAsetAplikasi[] = ["splash", "ikon", "ikonSplash"];

/** Aset bawaan satu slot (untuk pratinjau di panel admin). */
export function asetBawaan(kunci: KunciAsetAplikasi): AsetAndroid {
  return ambilAsetAndroid(BAWAAN_ASET[kunci].id);
}

/** Nilai bawaan saat admin belum pernah menyimpan pengaturan. */
export const DEFAULT_APLIKASI_ANDROID = {
  namaAplikasi: "PINDAI",
  warnaSplash: "#0A2624",
  warnaTeksSplash: "#FBF8F1",
} as const;

/**
 * Jenis berkas yang diterima + batas ukurannya. Batas ukuran memakai konstanta
 * unggahan bersama (`lib/kyc.MAX_FILE_BYTES`) supaya pemeriksaan di peramban dan
 * di server tidak pernah berbeda angka.
 */
export const MIME_GAMBAR_APLIKASI = ["image/png", "image/jpeg", "image/webp"] as const;
export const UKURAN_MAKS_GAMBAR_APLIKASI = MAX_FILE_BYTES;

/** Panjang maksimum nama aplikasi yang boleh disimpan. */
export const MAKS_NAMA_APLIKASI = 24;

/** Ukuran ideal tiap slot — dipakai panel admin sebagai pengingat, bukan syarat. */
export const UKURAN_SARAN: Record<KunciAsetAplikasi, string> = {
  ikon: "512 × 512 px, PNG latar penuh",
  ikonSplash: "1152 × 1152 px, PNG transparan",
  splash: "1080 × 1920 px (atau 1920 × 1080), PNG latar penuh",
};

/**
 * Validasi metadata berkas unggahan. Melempar pesan yang siap ditampilkan —
 * bukan mengembalikan boolean — supaya panel admin dan server memakai kalimat
 * yang sama persis.
 */
export function validasiGambarAplikasi(
  meta: { contentType?: string | null; size?: number | null },
  label: string,
): void {
  const tipe = (meta.contentType ?? "").toLowerCase();
  if (!(MIME_GAMBAR_APLIKASI as readonly string[]).includes(tipe)) {
    throw new Error(`${label} harus berupa gambar PNG, JPG, atau WebP.`);
  }
  const ukuran = meta.size ?? 0;
  if (!Number.isFinite(ukuran) || ukuran <= 0) {
    throw new Error(`${label} kosong atau gagal dibaca. Coba unggah ulang.`);
  }
  if (ukuran > UKURAN_MAKS_GAMBAR_APLIKASI) {
    throw new Error(
      `${label} maksimal ${Math.round(UKURAN_MAKS_GAMBAR_APLIKASI / (1024 * 1024))} MB.`,
    );
  }
}

/**
 * Warna `#RRGGBB` (huruf besar) atau nilai bawaan bila tidak sah. Warna sengaja
 * TIDAK ditolak: admin yang salah ketik tetap mendapat warna bawaan yang aman,
 * bukan panel yang mati.
 */
export function normalisasiWarna(nilai: string | undefined | null, bawaan: string): string {
  const teks = (nilai ?? "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(teks) ? teks.toUpperCase() : bawaan;
}

/** Nama aplikasi: dirapikan, dipotong, kosong = bawaan. */
export function normalisasiNamaAplikasi(nilai: string | undefined | null): string {
  const teks = (nilai ?? "").trim().replace(/\s+/g, " ");
  if (teks === "") return DEFAULT_APLIKASI_ANDROID.namaAplikasi;
  return teks.slice(0, MAKS_NAMA_APLIKASI).toUpperCase();
}

/** Baris `androidAppConfig` yang dibaca (menerima undefined = belum ada baris). */
export type BarisAplikasiAndroid = {
  namaAplikasi?: string;
  warnaSplash?: string;
  warnaTeksSplash?: string;
  ikonId?: string | null;
  ikonNama?: string;
  ikonPada?: number;
  ikonSplashId?: string | null;
  ikonSplashNama?: string;
  ikonSplashPada?: number;
  splashId?: string | null;
  splashNama?: string;
  splashPada?: number;
  diperbaruiPada?: number;
  diperbaruiOleh?: string;
};

/** Satu aset dalam JSON yang dibaca aplikasi. */
export type AsetAplikasiAktif = {
  kunci: KunciAsetAplikasi;
  label: string;
  /** Diunggah admin, atau memakai berkas bawaan yang disertakan aplikasi. */
  jenis: "unggahan" | "bawaan";
  /** URL berkas (absolut) — null berarti aplikasi memakai berkas bawaan di APK. */
  url: string | null;
  /** Id aset /promo untuk keadaan bawaan (peta nama berkas di APK). */
  asetBawaanId: AsetAndroidId;
  /** Versi untuk mengunci cache: berubah hanya saat berkas itu diganti. */
  versi: number;
  /** Nama berkas asli saat admin mengunggah. */
  namaBerkas: string | null;
  /** Kapan aset ini berlaku (epoch ms), null untuk bawaan. */
  berlakuPada: number | null;
};

export type AsetAplikasiAktifData = {
  aplikasi: string;
  /** Versi seluruh konfigurasi — naik setiap admin menyimpan. */
  versi: number;
  diperbaruiPada: number | null;
  diperbaruiOleh: string | null;
  diubahAdmin: boolean;
  warna: { latarSplash: string; teksSplash: string };
  aset: Record<KunciAsetAplikasi, AsetAplikasiAktif>;
  /** Bagian yang berlaku tanpa build ulang vs yang tetap butuh APK baru. */
  berlaku: {
    tanpaBuildUlang: readonly string[];
    butuhApkBaru: readonly string[];
  };
};

/** Bagian tetap yang menjelaskan cakupan pengaturan ini ke aplikasi & admin. */
export const CAKUPAN_PENGATURAN = {
  tanpaBuildUlang: [
    "Splash screen: gambar dan warna latar dimuat ulang setiap aplikasi dibuka.",
    "Logo di dalam aplikasi (header, halaman Tentang) mengikuti ikon yang aktif.",
    "Nama aplikasi di dalam aplikasi dan di judul layar.",
  ],
  butuhApkBaru: [
    "Ikon di layar utama (launcher) — Android menyimpannya di dalam APK, tidak bisa diganti saat berjalan.",
        "Label ikon di layar utama; berubah saat APK berikutnya dibangun dengan berkas dari /promo.",
  ],
} as const;

/**
 * Langkah yang harus dilakukan aplikasi Android (sekali pasang di kode klien).
 * Ditulis di sini supaya panel admin dan dokumentasi menyebut hal yang sama.
 */
export const LANGKAH_KONSUMSI = [
  "Saat aplikasi dibuka, ambil JSON dari GET /api/aplikasi-android (atau query Convex `androidApp.asetAktif`).",
  "Pakai `aset.splash.url` sebagai gambar layar pembuka; bila null, aplikasi memakai berkas bawaan di dalam APK.",
  "Warnai latar splash dari `warna.latarSplash` dan tulisannya dari `warna.teksSplash`.",
  "Simpan nilai `versi`; unduh ulang berkas hanya ketika versinya berubah supaya splash tidak diunduh tiap buka.",
  "Pakai `aplikasi` untuk judul di dalam aplikasi & halaman Tentang.",
] as const;

/** Kunci field per slot, supaya tidak ada nama field yang ditulis ulang di tiga tempat. */
export function fieldAset(kunci: KunciAsetAplikasi): {
  id: keyof BarisAplikasiAndroid;
  nama: keyof BarisAplikasiAndroid;
  pada: keyof BarisAplikasiAndroid;
} {
  return { id: `${kunci}Id`, nama: `${kunci}Nama`, pada: `${kunci}Pada` };
}

/**
 * Susun JSON yang dibaca aplikasi: kombinasi baris tersimpan + URL yang sudah
 * diresolusikan server. `url` boleh kosong untuk slot bawaan.
 */
export function susunAsetAplikasi(
  baris: BarisAplikasiAndroid | null,
  url: Partial<Record<KunciAsetAplikasi, string | null>>,
): AsetAplikasiAktifData {
  const versi = baris?.diperbaruiPada ?? 0;
  const aset = {} as Record<KunciAsetAplikasi, AsetAplikasiAktif>;

  for (const kunci of KUNCI_ASET_APLIKASI) {
    const f = fieldAset(kunci);
    const id = baris?.[f.id];
    const nama = baris?.[f.nama];
    const pada = baris?.[f.pada];
    const tautan = url[kunci] ?? null;
    const terpasang = typeof id === "string" && id !== "" && tautan !== null;
    aset[kunci] = {
      kunci,
      label: BAWAAN_ASET[kunci].label,
      jenis: terpasang ? "unggahan" : "bawaan",
      url: terpasang ? tautan : null,
      asetBawaanId: BAWAAN_ASET[kunci].id,
      versi: terpasang ? (typeof pada === "number" ? pada : versi) : 0,
      namaBerkas: terpasang && typeof nama === "string" ? nama : null,
      berlakuPada: terpasang ? (typeof pada === "number" ? pada : versi) : null,
    };
  }

  return {
    aplikasi: normalisasiNamaAplikasi(baris?.namaAplikasi),
    versi,
    diperbaruiPada: baris?.diperbaruiPada ?? null,
    diperbaruiOleh: baris?.diperbaruiOleh ?? null,
    diubahAdmin: baris !== null,
    warna: {
      latarSplash: normalisasiWarna(baris?.warnaSplash, DEFAULT_APLIKASI_ANDROID.warnaSplash),
      teksSplash: normalisasiWarna(baris?.warnaTeksSplash, DEFAULT_APLIKASI_ANDROID.warnaTeksSplash),
    },
    aset,
    berlaku: CAKUPAN_PENGATURAN,
  };
}

/** Ringkasan satu baris untuk panel admin: "3 unggahan, 2 bawaan". */
export function ringkasAsetAplikasi(data: AsetAplikasiAktifData): {
  unggahan: number;
  bawaan: number;
  teks: string;
} {
  const daftar = KUNCI_ASET_APLIKASI.map((kunci) => data.aset[kunci]);
  const unggahan = daftar.filter((a) => a.jenis === "unggahan").length;
  const bawaan = daftar.length - unggahan;
  return {
    unggahan,
    bawaan,
    teks: `${unggahan} aset dari admin · ${bawaan} masih bawaan`,
  };
}
