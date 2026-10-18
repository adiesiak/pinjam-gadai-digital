/**
 * Aturan pengingat pembaruan aplikasi Android — murni, satu sumber untuk
 * panel admin, server, dan uji. Tidak ada Convex, DOM, atau `Date.now()`.
 *
 * Yang dijaga:
 *  - **Satu pesan per versi.** Versi dikenali dari `versionCode` bilangan bulat
 *    dan tidak pernah dari teks bebas, sehingga pengumuman yang sama tidak bisa
 *    dikirim dua kali dengan ejaan berbeda.
 *  - **Tautan tidak dikarang.** Tautan unduhan harus alamat http(s) utuh atau
 *    jalur dalam aplikasi yang dimulai `/`; `//host` (protokol-relatif) ditolak
 *    karena bisa dipakai mengarahkan penerima ke domain lain.
 *  - **Pesan menyebut satu tindakan.** Pemasangan APK, bukan janji fitur.
 */
import { normalkanNomorWa } from "./pengingatWhatsapp";
import { namaPanggilan } from "./tautanStatus";

/** Jalur APK bawaan di `public/`. */
export const TAUTAN_UNDUH_BAWAAN = "/pindai.apk";

/** Batas catatan admin di pesan dan notifikasi. */
export const MAKS_CATATAN_PEMBARUAN = 200;

/** Batas jumlah pesan WhatsApp per satu klik "Kirim". */
export const MAKS_KIRIM_SEKALI = 25;

export type DataPembaruan = {
  versiKode: number;
  versiNama: string;
  /** Alamat http(s) utuh atau jalur `/…` di aplikasi ini. */
  tautan: string;
  catatan?: string;
  /**
   * Versi di bawah ini tidak boleh dipakai lagi. Bila true, APK dengan
   * `versionCode` lebih kecil menampilkan layar wajib perbarui.
   */
  wajibDiperbarui?: boolean;
};

export type HasilValidasiPembaruan =
  | { ok: true; nilai: DataPembaruan }
  | { ok: false; alasan: string };

/**
 * Rapikan dan periksa satu pengumuman versi.
 *
 * `versiNama` boleh `1.2` atau `1.2.0`: yang dibandingkan Android adalah
 * `versiKode`, sedangkan nama hanya untuk dibaca manusia. Yang ditolak adalah
 * kode bukan bilangan bulat positif dan tautan yang tidak bisa dibuka penerima.
 */
export function validasiPembaruan(input: {
  versiKode: number;
  versiNama: string;
  tautan: string;
  catatan?: string | null;
  wajibDiperbarui?: boolean;
}): HasilValidasiPembaruan {
  const kode = input.versiKode;
  if (!Number.isInteger(kode) || kode < 1 || kode > 1_000_000) {
    return { ok: false, alasan: "Kode versi harus bilangan bulat 1–1.000.000." };
  }

  const nama = input.versiNama.trim();
  if (!/^\d+\.\d+(\.\d+)?$/.test(nama) || nama.length > 20) {
    return { ok: false, alasan: "Nama versi harus berbentuk 1.2 atau 1.2.0." };
  }

  const tautan = input.tautan.trim();
  if (tautan.length === 0 || tautan.length > 160) {
    return { ok: false, alasan: "Tautan unduhan belum diisi." };
  }
  if (/\s/.test(tautan) || tautan.startsWith("//")) {
    return { ok: false, alasan: "Tautan unduhan tidak boleh memuat spasi atau diawali //." };
  }
  const absolut = /^https?:\/\/[^\s/]+\.[^\s]+$/i.test(tautan);
  const jalur = tautan.startsWith("/");
  if (!absolut && !jalur) {
    return { ok: false, alasan: "Tautan harus alamat http(s) utuh atau jalur yang diawali /." };
  }

  const catatan = (input.catatan ?? "").trim().slice(0, MAKS_CATATAN_PEMBARUAN);
  return {
    ok: true,
    nilai: {
      versiKode: kode,
      versiNama: nama,
      tautan,
      ...(catatan === "" ? {} : { catatan }),
      ...(input.wajibDiperbarui === true ? { wajibDiperbarui: true } : {}),
    },
  };
}

/**
 * Alamat unduhan utuh dari jalur relatif, memakai asal halaman admin.
 * Mengembalikan null bila asal bukan http(s) — lebih baik panel menolak
 * daripada mengirim tautan yang tidak bisa dibuka penerima.
 */
export function urlUnduhAplikasi(asal: string, tautan: string): string | null {
  const dasar = asal.trim().replace(/\/+$/, "");
  if (!/^https?:\/\/[^\s]+$/i.test(dasar)) return null;
  const jalur = tautan.trim();
  if (/^https?:\/\//i.test(jalur)) return jalur;
  if (!jalur.startsWith("/") || jalur.startsWith("//")) return null;
  return `${dasar}${jalur}`;
}

/** Kunci notifikasi stabil per versi — dasar keadaan "sudah dibaca". */
export function kunciNotifikasiPembaruan(versiKode: number): string {
  return `pembaruan:${versiKode}`;
}

/**
 * Penanda aplikasi Android di User-Agent WebView (`PINDAIApp/<versionCode>`).
 *
 * Inilah satu-satunya cara lapisan web tahu APK mana yang sedang dipakai:
 * berkas web dimuat dari server, sedangkan shell APK yang menyebut dirinya
 * sendiri lewat UA. Tanpa penanda ini, halaman tidak bisa membedakan aplikasi
 * lama dari peramban biasa.
 */
export const PENANDA_UA_APLIKASI = "PINDAIApp";

/**
 * `versionCode` APK dari User-Agent, atau null bila bukan aplikasi PINDAI.
 *
 * - peramban biasa → `null` (tidak ada yang perlu diblokir);
 * - aplikasi → angkanya;
 * - APK lama yang menulis `PINDAIApp/1.0` (tanpa kode angka) → `0`, yaitu
 *   "versi tak dikenal" dan diperlakukan sebagai yang paling tua. Itu memang
 *   build sebelum penomoran ini ada.
 */
export function versiAplikasiDariUA(ua: string): number | null {
  if (!ua.includes(`${PENANDA_UA_APLIKASI}/`)) return null;
  const cocok = /PINDAIApp\/(\d+)(?![.\d])/.exec(ua);
  return cocok === null ? 0 : Number(cocok[1]);
}

/**
 * Versi tertinggi yang ditandai wajib — batas bawah yang masih boleh dipakai.
 *
 * null berarti tidak ada pengumuman wajib, jadi tidak ada yang diblokir.
 */
export function versiMinimumWajib(
  baris: ReadonlyArray<{ versiKode: number; wajibDiperbarui?: boolean | null }>,
): number | null {
  let minimum: number | null = null;
  for (const b of baris) {
    if (b.wajibDiperbarui !== true) continue;
    if (minimum === null || b.versiKode > minimum) minimum = b.versiKode;
  }
  return minimum;
}

/**
 * Apakah APK ini harus berhenti dipakai.
 *
 * Peramban (`terpasang === null`) tidak pernah diblokir: mengunci halaman
 * publik karena versi APK akan menghalangi orang yang justru ingin mengunduh.
 */
export function wajibPerbarui(
  terpasang: number | null,
  minimum: number | null,
): boolean {
  if (terpasang === null || minimum === null) return false;
  return terpasang < minimum;
}

/**
 * Isi pesan WhatsApp pengingat pembaruan.
 *
 * Nada pesan mengikuti pengingat PINDAI lain: menyapa dengan nama panggilan,
 * menyebut versi, memberi satu tautan, lalu menjelaskan apa yang terjadi
 * setelah dipasang. Tidak ada klaim keamanan atau janji fitur.
 */
export function pesanPembaruanWhatsapp(data: {
  nama: string;
  versiNama: string;
  tautan: string;
  catatan?: string | null;
}): string {
  const catatan = (data.catatan ?? "").trim();
  return (
    `Halo ${namaPanggilan(data.nama)}, PINDAI ${data.versiNama} sudah bisa dipasang. ` +
    `Unduh dan pasang dari alamat resmi ini: ${data.tautan}. ` +
    `Setelah pembaruan ini terpasang, aplikasi akan menawarkan versi berikutnya sendiri.` +
    (catatan === "" ? "" : ` Catatan: ${catatan}`)
  );
}

/**
 * Nomor penerima yang unik dan sudah dinormalkan.
 *
 * Dua akun dengan nomor yang sama hanya menerima satu pesan; nomor yang tidak
 * bisa dibaca tidak masuk daftar dan dihitung terpisah oleh pemanggil.
 */
export function nomorPenerimaUnik(
  kandidat: ReadonlyArray<{ userId: string; nama: string; nomor: string | null | undefined }>,
): { penerima: Array<{ userId: string; nama: string; nomor: string }>; tanpaNomor: number; duplikat: number } {
  const terpakai = new Set<string>();
  const penerima: Array<{ userId: string; nama: string; nomor: string }> = [];
  let tanpaNomor = 0;
  let duplikat = 0;
  for (const k of kandidat) {
    const nomor = normalkanNomorWa(k.nomor ?? "");
    if (nomor === null) {
      tanpaNomor += 1;
      continue;
    }
    if (terpakai.has(nomor)) {
      duplikat += 1;
      continue;
    }
    terpakai.add(nomor);
    penerima.push({ userId: k.userId, nama: k.nama, nomor });
  }
  return { penerima, tanpaNomor, duplikat };
}
