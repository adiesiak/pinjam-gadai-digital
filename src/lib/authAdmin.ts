/**
 * Logika MURNI untuk halaman masuk/aktivasi Super Admin — tanpa React, tanpa
 * Convex, jadi bisa diuji langsung (lihat `authAdmin.test.ts`).
 *
 * Tiga hal yang sengaja dikumpulkan di sini supaya tidak terduplikasi antara
 * halaman (`pages/Auth.tsx`) dan komponen UI (`components/auth/auth-shared.tsx`):
 *
 *  1. KEKUATAN KATA SANDI. Ambang "memadai" harus sama dengan yang dipakai
 *     tombol kirim; kalau kekuatan dihitung di dua tempat, cepat atau lambat
 *     tombol aktif untuk sandi yang meter-nya masih merah.
 *  2. TOKEN 32 KARAKTER. Sekali aturan pembersihan ditulis, semua jalur
 *     (mengetik, menempel, tombol Tempel Token) memakai aturan yang sama:
 *     spasi/baris baru dari email dibuang, hanya alfanumerik, maksimal 32.
 *  3. PESAN GALAT. Balasan server diterjemahkan ke kalimat Indonesia yang sama
 *     untuk semua langkah (masuk, aktivasi, reset, kirim ulang token) — termasuk
 *     penanda bahwa jalur pemulihan TOTP harus dibuka.
 */

/** Masa berlaku token aktivasi/reset, selaras `adminPasswordOtp.maxAge` (15 menit). */
export const MASA_BERLAKU_TOKEN_DETIK = 60 * 15;

/** Panjang token verifikasi admin (alfanumerik). */
export const PANJANG_TOKEN_ADMIN = 32;

/** Panjang minimal kata sandi baru — juga penjaga di server. */
export const PANJANG_SANDI_MINIMAL = 8;

export type TingkatKekuatanSandi =
  | "kosong"
  | "lemah"
  | "sedang"
  | "sangat-kuat";

export interface NilaiKekuatanSandi {
  /** Tingkat untuk warna bar: kosong (netral), lemah (merah), sedang (kuning), sangat-kuat (emerald). */
  tingkat: TingkatKekuatanSandi;
  /** Label yang dibaca pengguna. */
  label: string;
  /** 0–3, dipakai untuk panjang bar. */
  skor: 0 | 1 | 2 | 3;
  /** Sudah 8 karakter atau lebih. */
  panjangCukup: boolean;
  /** Ada huruf besar. */
  adaHurufBesar: boolean;
  /** Ada angka atau simbol. */
  adaAngkaAtauSimbol: boolean;
  /**
   * Kedua syarat checklist terpenuhi.
   *
   * Ini penanda REKOMENDASI, bukan penjaga tombol: syarat yang mengikat tetap
   * milik server (8+ karakter) supaya kata sandi sah — mis. frasa panjang tanpa
   * huruf besar — tidak ikut terkunci hanya karena meter belum hijau.
   */
  memadai: boolean;
}

/**
 * Hitung kekuatan kata sandi. Aturannya sengaja sederhana dan bisa dijelaskan
 * ke admin: tiap syarat yang terpenuhi menambah satu tingkat, dan "Sangat Kuat"
 * hanya dicapai bila KETIGA syarat terpenuhi (8+ karakter, huruf besar, serta
 * angka/simbol) — bukan karena panjang semata.
 */
export function nilaiKekuatanSandi(sandi: string): NilaiKekuatanSandi {
  const panjangCukup = sandi.length >= PANJANG_SANDI_MINIMAL;
  const adaHurufBesar = /[A-Z]/.test(sandi);
  // Spasi TIDAK dihitung sebagai simbol: delapan spasi bukan kata sandi kuat.
  const adaAngkaAtauSimbol = /[0-9]|[^A-Za-z0-9\s]/.test(sandi);
  const syaratTerpenuhi =
    (panjangCukup ? 1 : 0) +
    (adaHurufBesar ? 1 : 0) +
    (adaAngkaAtauSimbol ? 1 : 0);
  const skor = (sandi === "" ? 0 : syaratTerpenuhi) as 0 | 1 | 2 | 3;
  // Skor 0 dan 1 sama-sama "Lemah": sandi yang belum memenuhi satu syarat pun
  // tetap berwarna merah — bukan melompat ke "Sangat Kuat" karena skornya nol.
  const tingkat: TingkatKekuatanSandi =
    sandi === ""
      ? "kosong"
      : skor <= 1
        ? "lemah"
        : skor === 2
          ? "sedang"
          : "sangat-kuat";
  const label =
    tingkat === "kosong"
      ? "Belum diisi"
      : tingkat === "lemah"
        ? "Lemah"
        : tingkat === "sedang"
          ? "Sedang"
          : "Sangat Kuat";
  return {
    tingkat,
    label,
    skor,
    panjangCukup,
    adaHurufBesar,
    adaAngkaAtauSimbol,
    memadai: panjangCukup && adaHurufBesar && adaAngkaAtauSimbol,
  };
}

/**
 * Rapikan token yang diketik/ditempel: buang spasi, baris baru, dan pemisah
 * yang biasa ikut tersalin dari email; sisakan alfanumerik maksimal 32.
 */
export function bersihkanToken(teks: string): string {
  return teks.replace(/[^a-zA-Z0-9]/g, "").slice(0, PANJANG_TOKEN_ADMIN);
}

/** "14:59" — format hitung mundur token (mm:ss, tanpa jam karena maksimum 15 menit). */
export function formatSisaToken(detik: number): string {
  const aman = Math.max(0, Math.floor(detik));
  const menit = Math.floor(aman / 60);
  const sisa = aman % 60;
  return `${String(menit).padStart(2, "0")}:${String(sisa).padStart(2, "0")}`;
}

export interface PesanGalatAdmin {
  /** Kalimat siap tampil. */
  pesan: string;
  /** Balasan ini berarti jalur pemulihan TOTP boleh dibuka. */
  pulihDenganTotp?: true;
}

/**
 * Terjemahkan galat server alur kata sandi admin. Urutan pemeriksaan mengikuti
 * pesan asli Convex Auth; kata kuncinya sengaja sama dengan versi sebelumnya
 * supaya perilaku (termasuk membuka pemulihan TOTP) tidak berubah.
 */
export function pesanGalatAdmin(error: unknown): PesanGalatAdmin {
  const message = error instanceof Error ? error.message : "";
  if (/invalid credentials/i.test(message)) {
    return { pesan: "Email atau kata sandi Super Admin tidak sesuai." };
  }
  if (/account.*exist|already exists/i.test(message)) {
    return {
      pesan:
        "Password sudah aktif. Silakan masuk atau gunakan Lupa kata sandi.",
    };
  }
  if (/terlalu banyak permintaan token/i.test(message)) {
    return {
      pesan:
        "Terlalu banyak permintaan token dalam 15 menit. Coba lagi nanti — token yang sudah dikirim sebelumnya tetap berlaku sampai kedaluwarsa.",
    };
  }
  if (/terlalu banyak percobaan masuk/i.test(message)) {
    return {
      pesan:
        "Terlalu banyak percobaan masuk. Tunggu beberapa menit, atau isi kode TOTP aplikasi autentikator untuk masuk sekarang.",
      pulihDenganTotp: true,
    };
  }
  if (/account.*not found|could not find/i.test(message)) {
    return {
      pesan:
        "Password belum diaktifkan atau akun tidak ditemukan. Gunakan Aktivasi password.",
    };
  }
  return { pesan: "Permintaan gagal. Periksa kembali email dan coba lagi." };
}
