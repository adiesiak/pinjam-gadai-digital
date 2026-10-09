/**
 * Aturan interaksi formulir PINDAI — logika MURNI, tanpa React, tanpa Convex,
 * tanpa DOM, supaya bisa diuji sebagai skrip biasa
 * (`bun src/lib/formInteraksi.test.ts`).
 *
 * Kenapa berkas ini ada: setiap formulir (registrasi/OTP, KYC, pengajuan
 * pinjaman & gadai, unggah dokumen, pembayaran, pengaturan admin) menghadapi
 * pertanyaan yang sama — pekerjaan ini sedang di tahap apa, berapa persen yang
 * benar-benar terkirim, apakah isian sudah berubah, dan kapan peringatan
 * "belum disimpan" pantas muncul. Kalau tiap formulir menjawabnya sendiri,
 * jawabannya akan berbeda-beda dan cepat atau lambat ada yang berbohong ke
 * pengguna. Di sini jawabannya satu untuk semua.
 *
 * Yang TIDAK ada di berkas ini: validasi aturan bisnis. Batas nilai, format
 * NIK/WhatsApp, dan kuotasi pinjaman tetap milik `lib/dataDiri.ts`,
 * `lib/pengajuanManual.ts`, dan `lib/loan.ts` — server memakai aturan yang sama,
 * jadi tidak boleh ada dua versi aturan yang bisa berbeda diam-diam.
 */

/**
 * Tahap pekerjaan satu formulir.
 *
 * Dibedakan supaya pengguna tahu SEDANG APA dan `disabled` hanya dipasang saat
 * benar-benar perlu:
 *
 * - `diam`         — belum ada apa-apa yang berjalan.
 * - `memvalidasi`  — memeriksa isian, termasuk pemeriksaan asinkron ke server
 *                    (mis. mencari nasabah kembar). Belum mengirim data.
 * - `mengunggah`   — berkas sedang dikirim; belum ada catatan yang ditulis.
 * - `mengirim`     — data dikirim; menunggu server menjawab.
 * - `sukses`       — SERVER sudah mengonfirmasi dan mengembalikan hasilnya.
 * - `galat`        — gagal; isian tetap ada supaya bisa dicoba lagi.
 */
export type TahapForm =
  | "diam"
  | "memvalidasi"
  | "mengunggah"
  | "mengirim"
  | "sukses"
  | "galat";

/** Tahap yang berarti pekerjaan sedang berjalan (dasar `disabled`/`aria-busy`). */
const TAHAP_SIBUK: Record<TahapForm, boolean> = {
  diam: false,
  memvalidasi: true,
  mengunggah: true,
  mengirim: true,
  sukses: false,
  galat: false,
};

/** true bila tahap ini berarti ada pekerjaan yang belum selesai. */
export function sibuk(tahap: TahapForm): boolean {
  return TAHAP_SIBUK[tahap];
}

/** Label tombol/status per tahap — satu kata untuk satu keadaan nyata. */
export const LABEL_TAHAP: Record<TahapForm, string> = {
  diam: "Kirim",
  memvalidasi: "Memeriksa isian…",
  mengunggah: "Mengunggah berkas…",
  mengirim: "Mengirim…",
  sukses: "Terkirim",
  galat: "Coba lagi",
};

/**
 * Persentase unggahan dari data progres NYATA, atau `null` bila persen tidak
 * dapat diketahui dengan jujur.
 *
 * Dipakai hanya dengan angka yang dilaporkan lapisan pengiriman
 * (`XMLHttpRequest.upload.onprogress` → `loaded`/`total`). Bila `total` tidak
 * diketahui (0, NaN, negatif) hasilnya `null`, dan pemanggil WAJIB memakai bilah
 * tak tentu — bukan menampilkan 0% atau angka karangan. Nilai yang melebihi
 * total dijepit di 100 supaya bilah tidak pernah keluar dari jalurnya.
 */
export function progresPersen(dimuat: number, total: number): number | null {
  if (!Number.isFinite(dimuat) || !Number.isFinite(total) || total <= 0) return null;
  if (dimuat <= 0) return 0;
  if (dimuat >= total) return 100;
  return Math.round((dimuat / total) * 100);
}

/** Nilai isian yang bisa dibandingkan untuk mendeteksi perubahan. */
export type IsianDibanding = Record<string, string | number | boolean | null | undefined>;

/**
 * true bila isian sekarang berbeda dari nilai awalnya.
 *
 * Dipakai untuk memutuskan peringatan "perubahan belum disimpan". Perbandingan
 * memakai teks (`String`) supaya `5` dan `"5"` — bentuk yang sama bagi pengguna
 * — tidak dianggap perubahan, dan memakai gabungan kunci kedua sisi supaya kunci
 * yang hanya ada di salah satu sisi ikut terdeteksi.
 */
export function adaPerubahan(awal: IsianDibanding, sekarang: IsianDibanding): boolean {
  const kunci = new Set([...Object.keys(awal), ...Object.keys(sekarang)]);
  for (const k of kunci) {
    if (String(awal[k] ?? "") !== String(sekarang[k] ?? "")) return true;
  }
  return false;
}

/**
 * Apakah menutup/meninggalkan halaman perlu memperingatkan pengguna.
 *
 * Syaratnya: ada perubahan yang belum disimpan DAN formulirnya tidak berakhir
 * sukses. Formulir yang sudah sukses (server sudah mengonfirmasi dan isiannya
 * memang sudah dibersihkan) tidak boleh lagi memunculkan peringatan palsu.
 * Formulir yang sedang mengirim TETAP diperingatkan: menutup halaman di tengah
 * pengiriman justru yang paling merugikan.
 */
export function perluPeringatanTinggalkan(kotor: boolean, selesai: boolean): boolean {
  return kotor && !selesai;
}

/**
 * Ambil satu pesan galat per isian dari kumpulan galat.
 *
 * Kunci yang tidak dipakai tidak menghasilkan entri, jadi pemanggil bisa
 * memeriksa "apakah isian ini punya galat" tanpa peduli isian lain.
 */
export function pesanUntukIsian<K extends string>(
  galat: Partial<Record<K, string>>,
  isian: K,
): string | null {
  return galat[isian] ?? null;
}

/* ==========================================================================
 * Validasi asinkron tertunda (mis. pencarian nasabah kembar saat mengetik)
 * ========================================================================== */

/**
 * Tahap validasi asinkron — beda dari `TahapForm` karena tidak pernah mengirim
 * data: hasilnya hanya dipakai untuk memberi tahu pengguna lebih awal.
 */
export type TahapValidasi = "diam" | "memvalidasi" | "sah" | "galat";

/**
 * Jeda sebelum pemeriksaan asinkron dijalankan (milidetik).
 *
 * Dipilih di bawah setengah detik: cukup untuk menyerap ketikan cepat (yang
 * tadinya menembakkan satu kueri per huruf) tanpa membuat pengguna merasa
 * validasinya tidak jalan.
 */
export const JEDA_VALIDASI_MS = 400;

/**
 * Apakah nilai ini layak diperiksa ke server.
 *
 * Isian yang terlalu pendek untuk bisa cocok dengan apa pun TIDAK diperiksa:
 * itu hanya membuang satu kueri per huruf pertama dan menghasilkan "tidak ada
 * hasil" yang tidak bermakna. Pemeriksaan tetap dilakukan di server saat
 * menyimpan; ini semata penghematan, bukan pengganti validasi server.
 */
export function bolehValidasiAsinkron(nilai: string, minimalKarakter: number): boolean {
  return nilai.trim().length >= Math.max(1, minimalKarakter);
}

/**
 * true bila hasil pemeriksaan yang selesai (versi `versiSelesai`) masih berlaku
 * untuk isian yang sekarang (versi `versiTerkini`).
 *
 * Tanpa ini, jawaban kueri lama yang datang terlambat bisa menimpa jawaban
 * terbaru — mis. "tidak ada nasabah kembar" muncul kembali padahal NIK sudah
 * ditambah satu digit.
 */
export function hasilMasihBerlaku(versiSelesai: number, versiTerkini: number): boolean {
  return versiSelesai === versiTerkini;
}

/**
 * Kalimat pengantar hasil pemeriksaan asinkron, atau `null` bila belum ada yang
 * bisa dikatakan. Tidak pernah menyimpulkan "aman" saat pemeriksaan belum
 * dijawab server.
 */
export function kalimatValidasi(
  tahap: TahapValidasi,
  opsi: { pesanGalat?: string | null; pesanSah?: string | null } = {},
): string | null {
  if (tahap === "memvalidasi") return "Memeriksa…";
  if (tahap === "galat") return opsi.pesanGalat ?? "Pemeriksaan gagal. Coba lagi.";
  if (tahap === "sah") return opsi.pesanSah ?? null;
  return null;
}
