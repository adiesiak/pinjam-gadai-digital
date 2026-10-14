/**
 * Gerbang anti-pengiriman palsu untuk formulir PINDAI.
 *
 * Masalah yang diselesaikan: pengajuan pinjaman dan gadai adalah aksi finansial
 * yang gampang diisi robot. Script bisa mengirim payload langsung ke mutasi
 * Convex tanpa pernah membuka formulir, dan pengiriman ganda dari satu niat
 * pengguna bisa melahirkan dua baris pengajuan.
 *
 * Tiga sinyal di berkas ini yang tidak bisa dijawab robot tanpa mengerjakan
 * pekerjaan manusia:
 *  1. jebakan (honeypot) - kolom tersembunyi yang hanya diisi pengisi otomatis;
 *  2. jeda waktu - formulir yang dikirim kurang dari JEDA_MINIMAL_KIRIM_MS
 *     setelah dibuka tidak mungkin diisi manusia;
 *  3. sidik permintaan (hashPermintaan) - pengiriman ulang dengan isi identik
 *     bisa dikenali, bukan diperlakukan sebagai pengajuan baru.
 *
 * Semua fungsi di sini MURNI (tanpa React, Convex, maupun DOM) supaya bisa
 * diuji sebagai skrip biasa (`bun src/lib/gerbangKirim.test.ts`), dan supaya
 * aturan yang sama dipakai klien (mencegah lebih awal) dan server (menegakkan).
 * Yang menegakkan tetap SERVER: nilai dari klien hanya sinyal, bukan izin.
 * Robot boleh saja tidak mengirim `formDibukaPada`; yang menahannya di server
 * adalah pembatas laju dan pencatatan pelanggaran di `convex/gerbangKirim.ts`.
 *
 * Yang TIDAK ada di sini: aturan bisnis (format NIK, batas plafon, tenor sah).
 * Aturan itu tetap milik `lib/dataDiri.ts`, `lib/plafon.ts`, dan `lib/loan.ts`
 * supaya tidak ada dua versi aturan yang bisa berbeda diam-diam. Batas panjang
 * kunci idempotensi juga tetap milik `convex/idempotensi.ts`.
 */
import { z } from "zod";

/**
 * Nama kolom jebakan di dalam formulir.
 *
 * Dipilih supaya terdengar seperti isian sungguhan ("surel cadangan") sehingga
 * pengisi otomatis mau mengisinya, tetapi tidak pernah ditampilkan ke pengguna
 * dan tidak pernah punya arti lain di aplikasi ini.
 */
export const KOLOM_JEBAKAN = "surelCadangan";

/**
 * Jeda minimal antara formulir dibuka dan dikirim.
 *
 * Dua detik: cukup untuk menutup pengiriman otomatis yang mengisi dan mengirim
 * dalam satu tarikan napas, tetapi jauh di bawah waktu yang dibutuhkan manusia
 * sungguhan untuk membaca nominal, tenor, dan menandatangani.
 */
export const JEDA_MINIMAL_KIRIM_MS = 2_000;

/** Batas panjang kolom jebakan yang diterima; lebih panjang dari itu ditolak. */
export const PANJANG_MAKS_JEBAKAN = 200;

const PESAN_JEBAKAN =
  "Pengajuan tidak dapat diproses otomatis. Buka formulir di aplikasi dan kirim ulang.";
const PESAN_TERLALU_CEPAT =
  "Pengajuan terkirim terlalu cepat untuk diisi manusia. Muat ulang formulir, lalu kirim ulang.";
const PESAN_JEJAK_WAKTU =
  "Jejak waktu formulir tidak dapat dipercaya. Muat ulang halaman, lalu kirim ulang.";

/** Hasil pemeriksaan gerbang: `lolos` true, atau `lolos` false + kalimat siap tampil. */
export type HasilGerbang =
  | { lolos: true; alasan: null }
  | { lolos: false; alasan: string };

/**
 * Periksa kolom jebakan. `undefined` berarti formulir tidak mengirim kolom itu
 * sama sekali, dan itu justru keadaan normal pengguna sungguhan.
 */
export function periksaJebakan(nilai: string | undefined): string | null {
  if (nilai === undefined) return null;
  if (nilai.length > PANJANG_MAKS_JEBAKAN) return PESAN_JEBAKAN;
  return nilai.trim() === "" ? null : PESAN_JEBAKAN;
}

/**
 * Periksa jeda waktu antara formulir dibuka dan dikirim.
 *
 * `undefined` berarti klien tidak mengirim jejak waktu. Itu bukan bukti robot,
 * jadi fungsi ini TIDAK menuduh; penggantinya adalah pembatas laju di server.
 * Yang tetap ditolak: jejak waktu yang tidak masuk akal (bukan angka positif)
 * dan cap waktu di masa depan, karena keduanya hanya muncul dari payload buatan.
 */
export function periksaJedaKirim(
  formDibukaPada: number | undefined,
  dikirimPada: number,
  jedaMinimalMs = JEDA_MINIMAL_KIRIM_MS,
): string | null {
  if (formDibukaPada === undefined) return null;
  if (!Number.isFinite(formDibukaPada) || formDibukaPada <= 0) return PESAN_JEJAK_WAKTU;
  if (formDibukaPada > dikirimPada) return PESAN_JEJAK_WAKTU;
  if (dikirimPada - formDibukaPada < jedaMinimalMs) return PESAN_TERLALU_CEPAT;
  return null;
}

/**
 * Gabungan kedua sinyal di atas, dengan urutan tetap: jebakan lebih dulu
 * (paling murah dan paling pasti), lalu jeda waktu.
 */
export function periksaGerbangKirim(opsi: {
  jebakan?: string;
  formDibukaPada?: number;
  dikirimPada: number;
  jedaMinimalMs?: number;
}): HasilGerbang {
  const jebakan = periksaJebakan(opsi.jebakan);
  if (jebakan !== null) return { lolos: false, alasan: jebakan };
  const jeda = periksaJedaKirim(opsi.formDibukaPada, opsi.dikirimPada, opsi.jedaMinimalMs);
  if (jeda !== null) return { lolos: false, alasan: jeda };
  return { lolos: true, alasan: null };
}

/**
 * Bentuk teks yang stabil dari sebuah nilai JSON: kunci objek diurutkan, tipe
 * dibedakan, dan `undefined` tidak pernah ikut.
 *
 * Dua objek yang isinya sama selalu menghasilkan teks yang sama, apa pun urutan
 * penulisan kuncinya. Itulah yang membuat sidik permintaan bisa dipakai untuk
 * mengenali kiriman identik.
 */
export function bentukKanonik(nilai: unknown): string {
  if (nilai === null) return "null";
  if (typeof nilai === "number") return Number.isFinite(nilai) ? String(nilai) : "null";
  if (typeof nilai === "boolean") return nilai ? "true" : "false";
  if (typeof nilai === "string") return JSON.stringify(nilai);
  if (Array.isArray(nilai)) return `[${nilai.map(bentukKanonik).join(",")}]`;
  if (typeof nilai === "object") {
    const objek = nilai as Record<string, unknown>;
    const bagian = Object.keys(objek)
      .filter((kunci) => objek[kunci] !== undefined)
      .sort()
      .map((kunci) => `${JSON.stringify(kunci)}:${bentukKanonik(objek[kunci])}`);
    return `{${bagian.join(",")}}`;
  }
  return "null";
}

/**
 * Sidik permintaan 16 heksadesimal dari isi kiriman yang sudah dikanonikan.
 *
 * Dipakai untuk mengenali pengiriman ulang dengan isi identik (mis. dua kali
 * klik yang lolos sebelum tombol sempat mati). Ini BUKAN pengganti kunci
 * idempotensi milik klien: sidik hanya menandai "isi ini sama", sedangkan
 * kunci idempotensi menyatakan "niat ini sama". Kunci tetap yang utama.
 *
 * Bukan fungsi kriptografis dan tidak pernah dipakai untuk otorisasi; FNV-1a
 * sudah cukup untuk membandingkan isi, dan stabil di seluruh runtime.
 */
export function hashPermintaan(nilai: unknown, panjang = 16): string {
  const teks = bentukKanonik(nilai);
  let hash = 0x811c9dc5;
  for (let i = 0; i < teks.length; i += 1) {
    hash ^= teks.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  let kedua = 0x9e3779b9;
  for (let i = teks.length - 1; i >= 0; i -= 1) {
    kedua ^= teks.charCodeAt(i);
    kedua = Math.imul(kedua, 0x85ebca6b) >>> 0;
  }
  const gabung = (hash.toString(16).padStart(8, "0") + kedua.toString(16).padStart(8, "0"));
  return gabung.slice(0, Math.max(1, Math.min(panjang, gabung.length)));
}

/**
 * Kunci idempotensi acak untuk satu niat pengiriman.
 *
 * Dipanggil PERCAKAPAN FORMULIR, bukan per percobaan: kunci yang sama pada
 * percobaan ulang membuat server mengembalikan pengajuan yang sama, sedangkan
 * formulir baru selalu memakai kunci baru. Memakai `crypto` bila tersedia dan
 * jatuh ke sumber acak waktu hanya di lingkungan yang tidak punya `crypto`.
 */
export function kunciIdempotensiBaru(): string {
  const kripto = globalThis.crypto;
  if (kripto !== undefined && typeof kripto.randomUUID === "function") {
    return kripto.randomUUID();
  }
  const byte = new Uint8Array(16);
  if (kripto !== undefined && typeof kripto.getRandomValues === "function") {
    kripto.getRandomValues(byte);
  } else {
    for (let i = 0; i < byte.length; i += 1) byte[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(byte, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Bentuk jejak kirim yang dikirim klien ke server, divalidasi ketat.
 *
 * `.strict()` dipilih sengaja: kunci TAK DIKENAL ditolak, bukan diabaikan.
 * Payload yang menyelipkan kolom tambahan adalah persis yang mau ditangkap
 * validator, dan mengabaikannya berarti menerima payload yang tidak kita pahami.
 */
export const skemaJejakKirim = z
  .object({
    jebakan: z.string().max(PANJANG_MAKS_JEBAKAN).optional(),
    formDibukaPada: z.number().int().positive().optional(),
  })
  .strict();

export type JejakKirim = z.infer<typeof skemaJejakKirim>;

/** Hasil penguraian jejak kirim: nilai yang sah, atau alasan penolakan. */
export type HasilUraiJejak =
  | { sah: true; jejak: JejakKirim }
  | { sah: false; alasan: string };

/**
 * Urai jejak kirim dari klien dengan skema ketat.
 *
 * Dipakai di sisi server: payload tanpa kolom wajib, dengan tipe salah, atau
 * dengan kolom tak dikenal ditolak sebelum menyentuh logika pengajuan. Pesannya
 * sengaja umum, tidak menyebut pemeriksaan mana yang gagal, supaya robot tidak
 * dapat memakainya untuk menyetel ulang payloadnya sampai lolos.
 */
export function uraiJejakKirim(mentah: unknown): HasilUraiJejak {
  const hasil = skemaJejakKirim.safeParse(mentah);
  if (!hasil.success) {
    return { sah: false, alasan: "Jejak pengiriman formulir tidak sah. Muat ulang halaman, lalu kirim ulang." };
  }
  return { sah: true, jejak: hasil.data };
}
