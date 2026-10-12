/**
 * Aturan TAUTAN STATUS PINDAI — tautan yang dikirim admin lewat WhatsApp dan
 * membuka halaman `/cek-status/<token>`.
 *
 * Semua fungsi di berkas ini MURNI (tanpa Convex, tanpa DOM, tanpa `Date.now()`
 * di dalam): waktu "sekarang" selalu datang dari pemanggil, jadi aturannya bisa
 * diuji sebagai skrip biasa (`bun src/lib/tautanStatus.test.ts`).
 *
 * Kenapa tautan memakai token, bukan nomor referensi langsung: nomor referensi
 * mudah ditebak berurutan (`PNJ-2026-0001`, `…-0002`). Bila halaman status bisa
 * dibuka hanya dengan nomor referensi, siapa pun pemegang satu referensi bisa
 * membaca nama, nominal, dan tanggal jatuh tempo nasabah lain. Token acak 128 bit
 * menutup pencacahan itu; nomor referensi tetap ditampilkan SETELAH token sah.
 */

/** Kebijakan tautan & pembatas ping — satu sumber untuk server dan uji. */
export const TAUTAN_KEBIJAKAN = {
  /** Umur satu tautan (hari). Setelah ini token dianggap mati. */
  masaBerlakuHari: 30,
  /** Panjang token heksadesimal (32 karakter = 128 bit). */
  panjangToken: 32,
  /**
   * Ping lokasi lebih rapat dari ini diabaikan. Halaman klien memang mengirim
   * tiap 10 detik, tetapi jaringan seluler sering mengulang permintaan yang
   * sama; tanpa jeda ini satu pembukaan halaman bisa menulis puluhan baris
   * identik dan membanjiri peta live admin.
   */
  jedaPingDetik: 8,
  /** Batas titik per tautan per hari — halaman yang dibiarkan terbuka semalaman. */
  maksPingPerHari: 2_880,
  /** Batas jumlah berkas selfie yang boleh diunggah dari satu tautan. */
  maksUnggahSelfie: 6,
  /** Ukuran minimum berkas selfie yang diterima (byte) — menolak berkas kosong. */
  minByteSelfie: 2 * 1024,
  /** Ukuran maksimum berkas selfie yang diterima (byte). */
  maksByteSelfie: 500 * 1024,
} as const;

/**
 * Sumber titik lokasi & verifikasi — nilai yang tersimpan di
 * `live_locations.source` dan `verifikasiLokasi.sumber`.
 *
 * Sengaja memakai nama teknis yang bisa ditelusuri tim audit; teks yang dilihat
 * peminjam ada di halaman verifikasi, bukan di sini.
 */
export const SUMBER_TAUTAN = {
  /** Titik dari halaman status yang dibuka lewat tautan WhatsApp. */
  klikTautan: "whatsapp_link_click",
  /** Titik yang dikirim bersamaan dengan verifikasi selfie. */
  verifikasi: "verifikasi_tautan",
} as const;

/** Batas akurasi GPS yang masih dipakai untuk titik dari tautan (meter). */
export const AKURASI_MAKS_TAUTAN_METER = 1_500;

/** True bila token berbentuk 32 huruf heksadesimal (huruf besar dimaafkan). */
export function tokenTautanValid(token: string): boolean {
  return new RegExp(`^[0-9a-f]{${TAUTAN_KEBIJAKAN.panjangToken}}$`).test(token.trim().toLowerCase());
}

/** Token yang disimpan/dikirim selalu huruf kecil dan tanpa spasi tepi. */
export function normalkanToken(token: string): string {
  return token.trim().toLowerCase();
}

/** Epoch ms kedaluwarsa dari waktu pembuatan (default kebijakan). */
export function hitungKedaluwarsa(
  dibuatPada: number,
  hari: number = TAUTAN_KEBIJAKAN.masaBerlakuHari,
): number {
  const batasHari = Number.isFinite(hari) && hari > 0 ? hari : TAUTAN_KEBIJAKAN.masaBerlakuHari;
  return dibuatPada + batasHari * 86_400_000;
}

/** True bila tautan sudah lewat masa berlakunya. */
export function tautanKedaluwarsa(kedaluwarsaPada: number, now: number): boolean {
  return now > kedaluwarsaPada;
}

/**
 * Boleh menulis titik baru dari tautan ini?
 *
 * Dua pembatas: jeda minimum antar titik (`jedaPingDetik`) dan batas jumlah
 * titik per hari (`maksPingPerHari`). Keduanya dijaga TERPISAH supaya ping yang
 * datang terlalu cepat tidak ikut menghabiskan kuota harian.
 */
export function bolehPing(
  terakhirPing: number | null | undefined,
  jumlahHariIni: number,
  now: number,
): { boleh: boolean; alasan: string | null } {
  if (jumlahHariIni >= TAUTAN_KEBIJAKAN.maksPingPerHari) {
    return { boleh: false, alasan: "Batas titik lokasi harian untuk tautan ini tercapai." };
  }
  if (typeof terakhirPing === "number" && now - terakhirPing < TAUTAN_KEBIJAKAN.jedaPingDetik * 1_000) {
    return { boleh: false, alasan: "Titik lokasi terakhir masih terlalu baru." };
  }
  return { boleh: true, alasan: null };
}

/** Boleh meminta URL unggah selfie berikutnya? Menolak setelah batas terlampaui. */
export function bolehUnggahSelfie(jumlahUnggah: number | undefined): boolean {
  return (jumlahUnggah ?? 0) < TAUTAN_KEBIJAKAN.maksUnggahSelfie;
}

/** Validasi ukuran berkas selfie yang sudah diunggah ke penyimpanan Convex. */
export function berkasSelfieWajar(byte: number): { ok: boolean; alasan: string | null } {
  if (!Number.isFinite(byte) || byte <= 0) {
    return { ok: false, alasan: "Berkas foto tidak ditemukan atau kosong. Ambil ulang foto verifikasi." };
  }
  if (byte < TAUTAN_KEBIJAKAN.minByteSelfie) {
    return { ok: false, alasan: "Foto yang diterima terlalu kecil — ambil ulang dengan pencahayaan lebih terang." };
  }
  if (byte > TAUTAN_KEBIJAKAN.maksByteSelfie) {
    return { ok: false, alasan: "Foto melebihi batas ukuran yang diterima. Ambil ulang foto verifikasi." };
  }
  return { ok: true, alasan: null };
}

/**
 * Pesan jujur untuk tautan yang tidak bisa dipakai — satu kalimat yang bisa
 * dibaca langsung peminjam, tanpa membocorkan apakah tokennya pernah ada.
 */
export function pesanTautanTidakBerlaku(kode: "format" | "tidak_dikenal" | "kedaluwarsa"): string {
  switch (kode) {
    case "format":
      return "Tautan tidak lengkap. Salin ulang tautan persis seperti pada pesan WhatsApp, lalu buka lagi.";
    case "kedaluwarsa":
      return "Tautan ini sudah kedaluwarsa. Minta tautan baru kepada petugas PINDAI melalui kanal resmi yang telah Anda konfirmasi.";
    default:
      return "Tautan tidak dikenali. Pastikan tautannya disalin persis dari pesan WhatsApp resmi PINDAI, atau minta tautan baru kepada petugas.";
  }
}

/**
 * Nama pendek untuk pesan/kartu: memakai nama panggilan pertama supaya tetap
 * sopan bila nama nasabah sangat panjang (dokumen impor lama).
 */
export function namaPanggilan(namaLengkap: string): string {
  const bersih = namaLengkap.trim().replace(/\s+/g, " ");
  if (bersih === "") return "Peminjam";
  const pertama = bersih.split(" ")[0] ?? bersih;
  return pertama.length > 0 ? pertama : "Peminjam";
}
