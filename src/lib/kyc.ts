/**
 * Batasan & tipe KYC pengajuan pinjaman — dipakai bersama oleh form nasabah
 * dan validasi server. Struktur data selaras dengan field opsional di
 * schema loans (nik, nomorWhatsApp, penghasilan, dokumen, lokasi).
 *
 * Berkas ini MURNI (tanpa React/DOM/Convex) dan memegang dua lapis aturan:
 *  1. bentuk ISIAN — validateKycInput (NIK, WhatsApp, penghasilan), dipakai
 *     form dan server;
 *  2. bentuk BERKAS — GAMBAR_DITERIMA, jenisGambarDariByte, dan
 *     periksaBerkasIdentitas. Pemeriksaan berkas dijalankan SERVER setelah
 *     membaca berkas dari Convex storage (lihat convex/berkasIdentitas.ts),
 *     sebab batas ukuran dan jenis berkas yang hanya diperiksa di peramban
 *     bisa dilewati siapa pun yang mengirim langsung ke URL unggah;
 *  3. PEMAKAIAN ULANG — identitasPengajuanDariKyc: isian & berkas KYC yang
 *     sudah diverifikasi dipakai lagi di formulir pengajuan, sehingga bagian
 *     data diri tidak ditanyakan dua kali (dan tidak pernah disembunyikan
 *     ketika datanya ternyata belum lengkap).
 *
 * Batas yang jujur: tipe MIME ditentukan klien saat mengunggah, jadi tipe itu
 * bukan bukti. Karena itu isi berkas tetap diperiksa dari magic bytes-nya.
 */

/** Batas ukuran file dokumen: 5 MB. */
export const MAX_FILE_BYTES = 5 * 1024 * 1024;

/**
 * Atribut `accept` untuk pemilih berkas — jenis gambar yang benar-benar
 * diterima server, bukan `image/*` yang juga menawarkan format yang akan
 * ditolak (GIF/HEIC/SVG). Menyeragamkan pilihan di layar dengan aturan server
 * mencegah nasabah memilih berkas yang pasti ditolak.
 */
export const ACCEPT_GAMBAR_KYC = "image/jpeg,image/png,image/webp";

/** Jenis gambar kamera yang diterima untuk setiap dokumen KYC. */
export const KYC_FILES = [
  { key: "ktp", label: "Foto KTP", accept: ACCEPT_GAMBAR_KYC, max: MAX_FILE_BYTES },
  { key: "selfie", label: "Selfie dengan KTP", accept: ACCEPT_GAMBAR_KYC, max: MAX_FILE_BYTES },
  {
    key: "slip",
    label: "Bukti penghasilan (contoh: slip gaji)",
    accept: ACCEPT_GAMBAR_KYC,
    max: MAX_FILE_BYTES,
  },
] as const;

export type KycFileKey = (typeof KYC_FILES)[number]["key"];

/** Validasi sisi form: NIK 16 digit, format WhatsApp 62…, penghasilan > 0. */
export function validateKycInput(input: {
  nik: string;
  nomorWhatsApp: string;
  penghasilanBulanan: number;
  sumberPenghasilan: string;
}): string | null {
  if (!/^\d{16}$/.test(input.nik.replace(/\s+/g, ""))) {
    return "Nomor KTP harus terdiri dari 16 angka.";
  }
  const wa = input.nomorWhatsApp.replace(/[\s-]/g, "");
  if (!/^62\d{8,13}$/.test(wa)) {
    return "Masukkan nomor WhatsApp yang diawali 62, tanpa tanda +. Contoh: 6281234567890.";
  }
  if (!Number.isInteger(input.penghasilanBulanan) || input.penghasilanBulanan <= 0) {
    return "Masukkan jumlah penghasilan per bulan dalam angka rupiah yang benar.";
  }
  if (input.sumberPenghasilan.trim().length < 3) {
    return "Ceritakan sumber penghasilan Anda (minimal 3 karakter), misalnya gaji atau usaha.";
  }
  return null;
}

/**
 * Label format gambar yang diterima untuk dokumen identitas.
 *
 * Sengaja HANYA tiga format yang bisa dipratinjau di peramban dan aman
 * didekode: JPEG, PNG, WEBP. GIF tidak diterima (bisa beranimasi dan tidak
 * menunjukkan satu bingkai identitas), dan HEIC/HEIF tidak diterima karena
 * peramban tidak dapat menampilkannya — berkas yang tidak bisa dipratinjau
 * tidak berguna bagi pengguna maupun petugas.
 */
export const GAMBAR_DITERIMA = ["JPG", "PNG", "WEBP"] as const;

/**
 * Tipe MIME yang boleh diklaim klien untuk dokumen identitas.
 *
 * Ini penjaga bentuk pertama (menolak PDF/ZIP/dokumen lain lebih awal);
 * kebenaran isi tetap ditentukan magic bytes + dimensi di `periksaIsiBerkasKyc`.
 */
export const TIPE_MIME_DITERIMA = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
] as const;

/**
 * Ukuran berkas terkecil yang masuk akal untuk sebuah foto. Di bawah ini
 * berkas hampir pasti kosong/rusak, jadi ditolak sebagai "kosong" — bukan
 * dianggap gambar yang sah hanya karena tipe MIME-nya mengaku gambar.
 */
export const MIN_FILE_BYTES = 1024;

/**
 * Dimensi terkecil yang masih berguna untuk dokumen identitas. Foto KTP/selfie
 * yang lebih kecil dari ini tidak mungkin terbaca oleh petugas. Ini pemeriksaan
 * KETERBACAAN, bukan penilaian keaslian.
 */
export const DIMENSI_MIN = { lebar: 300, tinggi: 200 } as const;

/**
 * Rasio sisi terjauh:terdekat yang masih wajar. Di atas ini berkas kemungkinan
 * besar adalah potongan strip/panorama (mis. tangkapan layar terpotong) — sinyal
 * "terpotong" yang bisa diperiksa dari header saja, tanpa mendekode piksel.
 */
export const RASIO_MAKS = 6;

/**
 * Kenali format gambar dari beberapa byte pertama berkas (magic bytes).
 *
 * Tipe MIME saja tidak cukup: nilai itu dikirim klien saat mengunggah, jadi
 * berkas apa pun bisa mengaku `image/png`. Tanda tangan berkas inilah yang
 * menunjukkan isinya benar-benar gambar. Hanya JPEG, PNG, dan WEBP yang
 * dikenali; format lain (GIF, HEIC/HEIF, video MP4, PDF, teks) mengembalikan
 * null.
 *
 * `head` cukup 16 byte pertama.
 */
export function jenisGambarDariByte(head: Uint8Array): string | null {
  const b = Array.from(head);
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (
    b.length >= 12 &&
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  ) {
    return "webp";
  }
  return null;
}

/**
 * Periksa satu berkas identitas: ada, tidak kosong, ≤ 5 MB, bertipe gambar, dan
 * isinya benar-benar gambar.
 *
 * `bolehPdf` dipakai HANYA untuk bukti penghasilan (bank statement/surat
 * keterangan sering dikirim sebagai PDF). KTP dan selfie selalu wajib gambar:
 * berkas identitas berisi wajah/NIK, jadi tidak ada alasan menerima format
 * lain — dan pemanggil tidak perlu mengubah aturan per slot.
 *
 * @param label nama dokumen apa adanya untuk pengguna (mis. "Foto KTP").
 * @param meta  `{ size, contentType }` dari storage; `null` bila tidak ada.
 * @param opsi  `bolehPdf` untuk dokumen non-identitas (bukti penghasilan).
 * @returns `null` bila lolos, atau kalimat galat siap tampil.
 */
export function periksaBerkasIdentitas(
  label: string,
  meta: { size: number; contentType: string } | null,
  opsi: { bolehPdf?: boolean } = {},
): string | null {
  if (meta === null) {
    return `${label} tidak ditemukan di penyimpanan. Unggah ulang berkasnya.`;
  }
  if (meta.size < MIN_FILE_BYTES) {
    return `${label} kosong atau terlalu kecil untuk dibaca. Unggah ulang berkasnya.`;
  }
  if (meta.size > MAX_FILE_BYTES) {
    return `${label} maksimal ${Math.round(MAX_FILE_BYTES / (1024 * 1024))} MB.`;
  }
  const tipe = meta.contentType.toLowerCase().trim();
  // Hanya tipe gambar yang eksplisit diizinkan — bukan seluruh `image/*`,
  // supaya tipe aneh/format berbahaya tidak lolos hanya karena berawalan image/.
  const gambar = (TIPE_MIME_DITERIMA as readonly string[]).includes(tipe);
  const pdf = opsi.bolehPdf === true && tipe === "application/pdf";
  if (!gambar && !pdf) {
    return `${label} harus berupa gambar (${GAMBAR_DITERIMA.join(", ")})${
      opsi.bolehPdf === true ? " atau PDF" : ""
    }.`;
  }
  return null;
}

/**
 * Pesan galat bila ISI berkas (16 byte pertama) bukan gambar yang diterima;
 * `null` bila lolos.
 *
 * Dipakai action pemeriksaan isi berkas (`berkasIdentitas.periksaIsiBerkasKyc`),
 * yang membaca isi berkas dari storage — hanya action yang boleh membaca isi
 * berkas di Convex, sedangkan mutation hanya dapat membaca metadata.
 */
export function periksaIsiGambar(label: string, head: Uint8Array | null): string | null {
  if (head === null || jenisGambarDariByte(head) === null) {
    return `${label} tidak dikenali sebagai gambar (${GAMBAR_DITERIMA.join(", ")}). Unggah ulang berkasnya.`;
  }
  return null;
}

/** Dimensi sebuah gambar, dalam piksel. */
export type DimensiGambar = { lebar: number; tinggi: number };

function u16be(b: number[], i: number): number {
  return (b[i] << 8) | b[i + 1];
}

function u32be(b: number[], i: number): number {
  return ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
}

/** PNG: lebar/tinggi big-endian pada chunk `IHDR` (offset 16 & 20). */
function dimensiPng(b: number[]): DimensiGambar | null {
  if (b.length < 24) return null;
  if (!(b[12] === 0x49 && b[13] === 0x48 && b[14] === 0x44 && b[15] === 0x52)) return null; // "IHDR"
  const lebar = u32be(b, 16);
  const tinggi = u32be(b, 20);
  return lebar > 0 && tinggi > 0 ? { lebar, tinggi } : null;
}

/** JPEG: telusuri segmen sampai penanda SOF (start of frame). */
function dimensiJpeg(b: number[]): DimensiGambar | null {
  let i = 2; // lewati SOI (FF D8)
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) {
      i += 1;
      continue;
    }
    let marker = b[i + 1];
    // Padding FF di antara segmen diperbolehkan.
    while (marker === 0xff && i + 2 < b.length) {
      i += 1;
      marker = b[i + 1];
    }
    // Segmen tanpa panjang: SOI/SOI/EOI/RSTn/TEM.
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    const panjang = u16be(b, i + 2);
    if (panjang < 2) return null;
    const sof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (sof) {
      if (i + 9 >= b.length) return null;
      const tinggi = u16be(b, i + 5);
      const lebar = u16be(b, i + 7);
      return lebar > 0 && tinggi > 0 ? { lebar, tinggi } : null;
    }
    if (marker === 0xda) return null; // mulai scan: SOF tidak ditemukan
    i += 2 + panjang;
  }
  return null;
}

/** WEBP: VP8X (extended), VP8 (lossy), atau VP8L (lossless). */
function dimensiWebp(b: number[]): DimensiGambar | null {
  if (b.length < 30) return null;
  const empat = String.fromCharCode(b[12], b[13], b[14], b[15]);
  if (empat === "VP8X") {
    const lebar = 1 + (b[24] | (b[25] << 8) | (b[26] << 16));
    const tinggi = 1 + (b[27] | (b[28] << 8) | (b[29] << 16));
    return lebar > 0 && tinggi > 0 ? { lebar, tinggi } : null;
  }
  if (empat === "VP8 ") {
    if (!(b[23] === 0x9d && b[24] === 0x01 && b[25] === 0x2a)) return null; // kode awal frame
    const lebar = (b[26] | (b[27] << 8)) & 0x3fff;
    const tinggi = (b[28] | (b[29] << 8)) & 0x3fff;
    return lebar > 0 && tinggi > 0 ? { lebar, tinggi } : null;
  }
  if (empat === "VP8L") {
    if (b[20] !== 0x2f) return null; // tanda tangan lossless
    const lebar = 1 + ((b[21] | (b[22] << 8)) & 0x3fff);
    const tinggi = 1 + (((b[22] >> 6) | (b[23] << 2) | (b[24] << 10)) & 0x3fff);
    return lebar > 0 && tinggi > 0 ? { lebar, tinggi } : null;
  }
  return null;
}

/**
 * Baca dimensi gambar dari HEADER berkas — tanpa pustaka gambar dan tanpa
 * mendekode seluruh piksel.
 *
 * Cukup untuk menjawab "apakah berkas ini gambar yang terbaca, dan seberapa
 * besar" memakai data yang tersedia di server Convex (yang tidak punya canvas).
 * `head` sebaiknya ±64 KB pertama berkas: header PNG/WEBP ada di beberapa byte
 * pertama, sedangkan JPEG memerlukan penelusuran segmen untuk menemukan `SOF`.
 *
 * Mengembalikan null bila formatnya tidak dikenali atau headernya terpotong —
 * pemanggil memperlakukannya sebagai "tidak terbaca", bukan menebak dimensi.
 */
export function dimensiGambar(head: Uint8Array): DimensiGambar | null {
  const b = Array.from(head);
  const jenis = jenisGambarDariByte(head);
  if (jenis === "png") return dimensiPng(b);
  if (jenis === "jpeg") return dimensiJpeg(b);
  if (jenis === "webp") return dimensiWebp(b);
  return null;
}

/**
 * Pesan galat bila gambar TIDAK TERBACA, terlalu kecil, atau tampak terpotong;
 * `null` bila lolos.
 *
 * Batas yang jujur: ini menilai KETERBACAAN dari header (bukan ketajaman atau
 * keaslian). Foto yang tajam tidak bisa dibedakan dari foto buram hanya dari
 * header — penilaian itu diserahkan ke petugas lewat alur NEEDS_CORRECTION.
 * Karena itu pesannya pun tidak pernah menyatakan "gambar asli/buram".
 *
 * `dimensi` null berarti header dimensi tidak terbaca (berkas terpotong, atau
 * bukan gambar yang bisa didekode) — selalu ditolak.
 */
export function periksaUkuranGambar(label: string, dimensi: DimensiGambar | null): string | null {
  if (dimensi === null) {
    return `${label} tidak terbaca sebagai gambar utuh (header rusak atau terpotong). Unggah ulang berkasnya.`;
  }
  if (dimensi.lebar < DIMENSI_MIN.lebar || dimensi.tinggi < DIMENSI_MIN.tinggi) {
    return `${label} terlalu kecil (${dimensi.lebar}×${dimensi.tinggi} piksel; minimal ${DIMENSI_MIN.lebar}×${DIMENSI_MIN.tinggi}). Unggah ulang berkasnya.`;
  }
  const rasio =
    Math.max(dimensi.lebar, dimensi.tinggi) / Math.min(dimensi.lebar, dimensi.tinggi);
  if (rasio > RASIO_MAKS) {
    return `${label} tampak terpotong (rasio sisi ${rasio.toFixed(1)}:1 terlalu jauh). Unggah ulang berkas utuh.`;
  }
  return null;
}

/* ==========================================================================
 * Identitas SIAP PAKAI dari KYC yang sudah terverifikasi
 * ========================================================================== */

/**
 * Isian & berkas KYC yang tersimpan pada satu nasabah — bentuk minimal yang
 * dibutuhkan pengajuan pinjaman. Semua opsional: nilainya datang dari server
 * dan bisa belum termuat. "Belum diketahui" bukan "kosong".
 */
export type RingkasIdentitasKyc = {
  namaLengkap?: string | null;
  nik?: string | null;
  nomorWhatsApp?: string | null;
  /**
   * Rupiah bulat MENTAH dari baris KYC. Sengaja dipisah dari teks penghasilan
   * yang diformat untuk tampilan: formulir tidak pernah menghitung uang dari
   * teks berformat.
   */
  penghasilanBulanan?: number | null;
  sumberPenghasilan?: string | null;
  /**
   * Id berkas di Convex storage. Berkas ini tetap MURNI (tanpa Convex), jadi
   * id-nya bertipe `string`; pemanggil memetakannya ke `Id<"_storage">` saat
   * mengirim pengajuan.
   */
  ktpId?: string | null;
  selfieKtpId?: string | null;
  buktiPenghasilanId?: string | null;
};

/** Identitas lengkap yang bisa dipakai ulang tanpa menanyakan ulang nasabah. */
export type IdentitasPengajuan = {
  namaLengkap: string;
  nik: string;
  nomorWhatsApp: string;
  penghasilanBulanan: number;
  sumberPenghasilan: string;
  dokKtpId: string;
  dokSelfieKtpId: string;
  dokSlipGajiId: string;
};

/**
 * Pakai ulang isian & berkas KYC yang SUDAH diverifikasi petugas.
 *
 * Kenapa: pengajuan pinjaman menyimpan NIK/WA/penghasilan + tiga berkas
 * identitas. Bila status KYC nasabah sudah `VERIFIED` (server memeriksa ini
 * sendiri di `requireKycTerverifikasi`), menanyakan hal yang sama lagi hanya
 * menambah pekerjaan dan peluang salah ketik. Formulir menyembunyikan bagian
 * itu dan mengambil nilainya dari sini.
 *
 * Mengembalikan `null` bila datanya belum lengkap/valid — pemanggil WAJIB tetap
 * menampilkan bagian data diri saat itu terjadi, bukan mengirim pengajuan yang
 * pasti ditolak server. Bentuk isiannya diperiksa dengan aturan yang SAMA
 * dengan `validateKycInput` (dipakai form dan server), jadi "null" di sini
 * berarti "jangan sembunyikan apa pun".
 *
 * Nama diambil dari KYC, bukan dari isian baru: server menulis nama itu ke
 * akad & ledger, dan nama itulah yang sudah diperiksa petugas.
 */
export function identitasPengajuanDariKyc(kyc: RingkasIdentitasKyc): IdentitasPengajuan | null {
  const namaLengkap = (kyc.namaLengkap ?? "").trim();
  const nik = (kyc.nik ?? "").replace(/\s+/g, "");
  const nomorWhatsApp = (kyc.nomorWhatsApp ?? "").replace(/[\s+-]/g, "");
  const sumberPenghasilan = (kyc.sumberPenghasilan ?? "").trim();
  const penghasilanBulanan = kyc.penghasilanBulanan ?? 0;
  const dokKtpId = kyc.ktpId ?? null;
  const dokSelfieKtpId = kyc.selfieKtpId ?? null;
  const dokSlipGajiId = kyc.buktiPenghasilanId ?? null;

  if (namaLengkap.length < 3) return null;
  if (validateKycInput({ nik, nomorWhatsApp, penghasilanBulanan, sumberPenghasilan }) !== null) {
    return null;
  }
  // Tanpa ketiga berkas, pengajuan tetap ditolak server: status VERIFIED saja
  // tidak cukup bila berkasnya hilang dari baris KYC.
  if (dokKtpId === null || dokSelfieKtpId === null || dokSlipGajiId === null) return null;

  return {
    namaLengkap,
    nik,
    nomorWhatsApp,
    penghasilanBulanan,
    sumberPenghasilan,
    dokKtpId,
    dokSelfieKtpId,
    dokSlipGajiId,
  };
}

/**
 * NIK untuk DIBACA MANUSIA di layar nasabah: empat angka pertama, lalu sisanya
 * bertopeng. Nomor identitas tetap bisa dipastikan orangnya benar tanpa
 * tercetak utuh di layar yang mungkin dilihat orang lain.
 */
export function sensorNik(nik: string): string {
  const bersih = nik.replace(/\D/g, "");
  if (bersih.length < 8) return bersih;
  return `${bersih.slice(0, 4)}${"•".repeat(bersih.length - 8)}${bersih.slice(-4)}`;
}
