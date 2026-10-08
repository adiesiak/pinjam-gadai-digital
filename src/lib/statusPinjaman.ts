/**
 * Status pinjaman — SATU sumber kebenaran. Modul MURNI (tanpa React/Convex).
 *
 * Aplikasi mengenal TEPAT EMPAT status pinjaman:
 *
 *   Ditinjau → Disalurkan → Lunas        (Ditolak dapat dicapai dari tahap mana pun)
 *
 * PINDAI adalah produk pencatatan. Memindahkan status pinjaman hanya mengubah
 * catatan internal: tidak ada uang yang berpindah, tidak ada jurnal yang
 * ditulis, dan tidak ada saldo yang berubah. Pencairan serta transfer tetap
 * ditangani di luar aplikasi.
 *
 * Catatan perubahan bersifat OPSIONAL (kebijakan pemilik produk: admin tidak
 * boleh tertahan oleh kolom alasan saat mencatat perubahan). Bila diisi, text
 * itu ikut dikirim ke Peminjam lewat WhatsApp dan terbaca di Audit Trail; bila
 * dikosongkan, perpindahan tetap sah dan jejaknya tetap ada (siapa mengubah
 * apa, kapan) — pesan WhatsApp memakai tanda "—" sebagai ganti catatan.
 *
 * ------------------------------------------------------------------
 * Riwayat & penggabungan (penting)
 * ------------------------------------------------------------------
 * Sebelumnya produk menampilkan ENAM status, tiga di antaranya sesungguhnya
 * satu tahap yang sama:
 *
 *   `diajukan` → `sedang_direview` → `disetujui` → `didanai` → `lunas`
 *                                     (ditolak dari tahap mana pun)
 *
 * Penggabungan menjadi empat status dilakukan di lapisan **tampilan dan
 * penulisan**, bukan dengan menulis ulang basis data — sehingga tidak ada satu
 * pun baris lama yang berubah arti atau menjadi tidak sah:
 *
 *  - `diajukan`       — hanya mungkin pada baris lama. Pengajuan baru langsung
 *                       ditulis sebagai `sedang_direview`.
 *  - `sedang_direview`— NAMA TERSIMPAN untuk "Ditinjau"; inilah yang ditulis
 *                       aplikasi saat status berpindah ke tahap tinjauan.
 *  - `disetujui`      — sub-tahap internal: nominal sudah diputuskan, dana
 *                       belum ditandai tersalurkan. Tampilnya tetap "Ditinjau";
 *                       alur dana lama yang membaca `by_status: "disetujui"`
 *                       (marketplace pendanaan) tetap bekerja apa adanya.
 *  - `didanai`        — NAMA TERSIMPAN untuk "Disalurkan".
 *
 * Jadi ejaan lama tidak pernah ditulis lagi, tetapi tetap terbaca sebagai
 * padanan kanoniknya.
 */

/**
 * Empat status pinjaman yang dipakai aplikasi (kanonik).
 *
 * `didanai` sengaja tetap menjadi ejaan tersimpannya — belum ada migrasi
 * basis data — sedangkan "ditinjau" tersimpan sebagai `sedang_direview`.
 * Gunakan `keStatusTersimpan()` bila perlu nilai yang ditulis ke tabel.
 */
export const STATUS_PINJAMAN = [
  "ditinjau",
  "didanai",
  "ditolak",
  "lunas",
] as const;

export type StatusPinjaman = (typeof STATUS_PINJAMAN)[number];

/**
 * Ejaan warisan yang menandai TAHAP TINJAUAN yang sama ("Ditinjau").
 * Diterima saat dibaca dan divalidasi, tidak pernah ditulis lagi oleh
 * perpindahan status yang dipilih admin.
 */
export const STATUS_TINJAUAN_TERSIMPAN = [
  "diajukan",
  "sedang_direview",
  "disetujui",
] as const;

/** Nama tersimpan untuk status kanonik "Ditinjau". */
const STATUS_TERSIMPAN_TINJAUAN = "sedang_direview";

/** Semua ejaan status pinjaman yang sah dibaca — kanonik + warisan. */
export const STATUS_PINJAMAN_DIKENAL: readonly string[] = [
  ...STATUS_PINJAMAN,
  ...STATUS_TINJAUAN_TERSIMPAN,
];

/** Label Indonesia untuk tiap status kanonik — dipakai UI dan pesan WhatsApp. */
export const LABEL_STATUS_PINJAMAN: Record<StatusPinjaman, string> = {
  ditinjau: "Ditinjau",
  didanai: "Disalurkan",
  ditolak: "Ditolak",
  lunas: "Lunas",
};

/** Status yang menutup posisi: tidak boleh dipindahkan lagi oleh admin. */
export const STATUS_TERKUNCI: readonly string[] = ["lunas"];

/**
 * Status kanonik dari ejaan tersimpan apa pun.
 * Ejaan warisan `diajukan`/`sedang_direview`/`disetujui` semuanya "ditinjau".
 */
export function statusKanonik(status: string): StatusPinjaman | null {
  if (status === "didanai") return "didanai";
  if (status === "ditolak") return "ditolak";
  if (status === "lunas") return "lunas";
  if (
    status === "ditinjau" ||
    (STATUS_TINJAUAN_TERSIMPAN as readonly string[]).includes(status)
  ) {
    return "ditinjau";
  }
  return null;
}

/** Apakah baris (ejaan tersimpan apa pun) sedang berada di tahap tinjauan. */
export function diTahapTinjauan(status: string): boolean {
  return statusKanonik(status) === "ditinjau";
}

/** Label tampil untuk status tersimpan apa pun — "Ditinjau" bila tak dikenali. */
export function labelStatusPinjaman(status: string): string {
  const kanonik = statusKanonik(status);
  return kanonik === null ? "Ditinjau" : LABEL_STATUS_PINJAMAN[kanonik];
}

/**
 * Nilai yang ditulis ke tabel `loans.status` untuk sebuah status kanonik.
 * "ditinjau" tersimpan sebagai `sedang_direview` (nama lama yang sama artinya),
 * sisanya ditulis apa adanya.
 */
export function keStatusTersimpan(status: string): string {
  return status === "ditinjau" ? STATUS_TERSIMPAN_TINJAUAN : status;
}

export type HasilValidasiStatus =
  | { ok: true; berubah: true }
  | { ok: false; alasan: string };

/**
 * Periksa apakah admin boleh memindahkan `dari` → `ke`.
 * Murni: tidak membaca basis data, tidak menulis apa pun.
 *
 * `ke` boleh memakai ejaan kanonik ("ditinjau") maupun ejaan tersimpannya
 * (`sedang_direview`/`disetujui`) supaya alur internal seperti persetujuan
 * nominal tetap bisa dicatat. Yang ditolak hanya tiga hal:
 *
 *  1. status tujuan yang tidak dikenali;
 *  2. posisi yang sudah ditutup (`lunas`);
 *  3. perpindahan yang tidak mengubah apa pun (ejaan tersimpan yang sama).
 *
 * Catatan/alasan TIDAK diperiksa di sini: perpindahan status boleh dicatat
 * tanpa catatan sama sekali (lihat catatan kebijakan di atas).
 *
 * Mengembalikan pinjaman ke tahap tinjauan DIPERBOLEHKAN sekarang: "Ditinjau"
 * adalah tahap kerja biasa, bukan status awal yang dikunci.
 */
export function validasiUbahStatus(
  dari: string,
  ke: string,
): HasilValidasiStatus {
  const kanonik = statusKanonik(ke);
  if (kanonik === null) {
    return { ok: false, alasan: `Status "${ke}" tidak dikenali.` };
  }
  if (STATUS_TERKUNCI.includes(dari)) {
    return {
      ok: false,
      alasan:
        "Pinjaman yang sudah lunas tidak dapat diubah lagi — posisinya sudah ditutup.",
    };
  }
  if (keStatusTersimpan(ke) === dari) {
    return {
      ok: false,
      alasan: `Pinjaman sudah berstatus ${LABEL_STATUS_PINJAMAN[kanonik]}.`,
    };
  }
  return { ok: true, berubah: true };
}

/**
 * Nominal yang dipakai bila admin menyetujui pinjaman.
 *
 * Aturan: admin boleh menyetujui LEBIH KECIL daripada yang diajukan, tidak
 * pernah lebih besar. Menyetujui lebih besar dari pengajuan berarti memberi
 * uang yang tidak diminta — itu bukan penilaian kredit, itu kesalahan input.
 *
 * `null` berarti "pakai nominal pengajuan apa adanya" (admin tidak mengubah).
 */
export function nominalDisetujui(
  pokokDiajukan: number,
  usulanAdmin: number | null | undefined,
): { ok: true; nilai: number } | { ok: false; alasan: string } {
  if (
    !Number.isSafeInteger(pokokDiajukan) ||
    pokokDiajukan <= 0
  ) {
    return { ok: false, alasan: "Nominal pengajuan tidak valid." };
  }
  if (usulanAdmin === null || usulanAdmin === undefined) {
    return { ok: true, nilai: pokokDiajukan };
  }
  if (!Number.isSafeInteger(usulanAdmin) || usulanAdmin <= 0) {
    return { ok: false, alasan: "Nominal yang disetujui harus rupiah bulat positif." };
  }
  if (usulanAdmin > pokokDiajukan) {
    return {
      ok: false,
      alasan: "Nominal yang disetujui tidak boleh melebihi nominal yang diajukan.",
    };
  }
  return { ok: true, nilai: usulanAdmin };
}

/** Pinjaman yang pendanaannya sudah tersalurkan — nominal tidak boleh diubah. */
export function nominalTerkunci(status: string): boolean {
  return status === "didanai" || status === "lunas";
}

// =====================================================================
// Pesan WhatsApp perubahan status
// =====================================================================

/**
 * Data minimum untuk merangkai pesan perubahan status.
 *
 * Status berupa `string` — ejaan tersimpan apa pun diterima dan diterjemahkan
 * lewat `labelStatusPinjaman()`, sehingga baris warisan tetap menghasilkan
 * pesan yang benar.
 *
 * Sengaja TIDAK memuat tanggal jatuh tempo atau denda: pesan status adalah
 * kabar keputusan, bukan penagihan. Penagihan tetap milik template pengingat.
 */
export type DataStatusWa = {
  nama: string;
  nomorReferensi: string;
  statusLama: string;
  statusBaru: string;
  alasan: string;
  /** Nominal pengajuan — untuk menjelaskan persetujuan sebagian. */
  pokokDiajukan: number;
  /** Nominal yang disetujui (sama dengan pengajuan bila tidak diubah). */
  pokokDisetujui: number;
  /** Total kewajiban baru; `null` bila belum bisa dihitung. */
  totalKewajiban: number | null;
};

/**
 * Template bawaan pesan perubahan status.
 *
 * Placeholder yang dikenali: {nama} {ref} {status} {alasan} {diajukan}
 * {disetujui} {kewajiban}. Bila persetujuannya sebagian, satu kalimat
 * tambahan otomatis disisipkan sebelum bagian nominal.
 */
export const TEMPLATE_STATUS_DEFAULT =
  "Halo {nama}, status pengajuan PINDAI {ref} diperbarui menjadi: {status}. " +
  "Catatan dari tim: {alasan}. " +
  "Nominal diajukan {diajukan} · disetujui {disetujui} · total kewajiban {kewajiban}. " +
  "Bila ada pertanyaan, hubungi tim PINDAI. Terima kasih.";

/** Kalimat tambahan saat admin menyetujui lebih kecil daripada pengajuan. */
export const CATATAN_PERSETUJUAN_SEBAGIAN =
  "Pengajuan Anda disetujui sebagian, yaitu {disetujui} dari {diajukan} yang diajukan.";

/** Ganti placeholder pada template status. */
export function renderTemplateStatus(
  template: string,
  data: {
    nama: string;
    ref: string;
    status: string;
    alasan: string;
    diajukan: string;
    disetujui: string;
    kewajiban: string;
    sebagian: string;
  },
): string {
  return template
    .replace(/\{nama\}/g, data.nama)
    .replace(/\{ref\}/g, data.ref)
    .replace(/\{status\}/g, data.status)
    .replace(/\{alasan\}/g, data.alasan)
    .replace(/\{diajukan\}/g, data.diajukan)
    .replace(/\{disetujui\}/g, data.disetujui)
    .replace(/\{kewajiban\}/g, data.kewajiban)
    .replace(/\{sebagian\}/g, data.sebagian);
}

/** Format rupiah aman untuk pesan — satu angka warisan tidak boleh menggagalkan pesan. */
function rupiahAman(nilai: number): string {
  if (!Number.isSafeInteger(nilai)) {
    return `Rp ${Number(nilai).toLocaleString("id-ID")}`;
  }
  return `Rp ${nilai.toLocaleString("id-ID")}`;
}

/**
 * Rangkai isi pesan perubahan status.
 *
 * Bila admin menyetujui lebih kecil daripada pengajuan, kalimat persetujuan
 * sebagian disisipkan langsung setelah status — supaya Peminjam tahu kenapa
 * nominalnya berbeda, bukan hanya melihat angka yang lebih kecil.
 *
 * Pemanggil menentukan pengganti catatan kosong (dialog memakai "—") supaya
 * template yang dapat disunting admin tidak pernah menyisakan kalimat kosong.
 */
export function pesanPerubahanStatus(
  template: string,
  data: DataStatusWa,
): string {
  const sebagian =
    statusKanonik(data.statusBaru) !== "ditolak" &&
    data.pokokDisetujui < data.pokokDiajukan
      ? CATATAN_PERSETUJUAN_SEBAGIAN.replace(
          "{disetujui}",
          rupiahAman(data.pokokDisetujui),
        ).replace("{diajukan}", rupiahAman(data.pokokDiajukan))
      : "";

  const dasar = renderTemplateStatus(template, {
    nama: data.nama,
    ref: data.nomorReferensi,
    status: labelStatusPinjaman(data.statusBaru),
    alasan: data.alasan,
    diajukan: rupiahAman(data.pokokDiajukan),
    disetujui: rupiahAman(data.pokokDisetujui),
    kewajiban:
      data.totalKewajiban === null ? "—" : rupiahAman(data.totalKewajiban),
    sebagian: "",
  });

  return sebagian === "" ? dasar : `${dasar} ${sebagian}`;
}
