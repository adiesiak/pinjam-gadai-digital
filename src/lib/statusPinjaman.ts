/**
 * Aturan perubahan status pinjaman oleh admin — fungsi MURNI.
 *
 * PINDAI adalah produk pencatatan. Memindahkan status pinjaman hanya mengubah
 * catatan internal: tidak ada uang yang berpindah, tidak ada jurnal yang
 * ditulis, dan tidak ada saldo yang berubah. Pencairan serta transfer tetap
 * ditangani di luar aplikasi.
 *
 * Karena itu setiap perpindahan status WAJIB beralasan: alasan itulah yang
 * membuat catatan bisa ditelusuri, dan alasan yang sama dikirim ke Peminjam
 * lewat WhatsApp supaya ia tidak mendapati statusnya berubah tanpa kabar.
 *
 * Urutan alaminya:
 *   diajukan → sedang_direview → disetujui → didanai → lunas
 *   (ditolak dapat dicapai dari tahap mana pun sebelum dana tersalurkan)
 *
 * Meski begitu admin tetap boleh melompat — misalnya langsung `disetujui`
 * tanpa `sedang_direview`, atau menarik `didanai` kembali ke `ditolak` bila
 * ternyata pencairan dibatalkan. Yang benar-benar dilarang hanya dua:
 *
 *  1. Mengembalikan status ke `diajukan` — pengajuan tidak bisa "dibuka ulang"
 *     karena jejak tanggalnya sudah terpakai.
 *  2. Mengubah pinjaman yang sudah `lunas` — posisinya sudah ditutup dan
 *     pendanaannya sudah diselesaikan.
 *
 * Perubahan yang tidak mengubah apa pun (status sama persis) juga ditolak
 * supaya tidak memicu pesan WhatsApp palsu dan baris audit kosong.
 */

/** Seluruh status pinjaman — cerminan `loanStatusValidator` di schema. */
export const STATUS_PINJAMAN = [
  "diajukan",
  "sedang_direview",
  "disetujui",
  "ditolak",
  "didanai",
  "lunas",
] as const;

export type StatusPinjaman = (typeof STATUS_PINJAMAN)[number];

/** Status yang menutup posisi: tidak boleh dipindahkan lagi oleh admin. */
export const STATUS_TERKUNCI: readonly StatusPinjaman[] = ["lunas"];

/** Label Indonesia untuk setiap status — dipakai UI dan pesan WhatsApp. */
export const LABEL_STATUS_PINJAMAN: Record<StatusPinjaman, string> = {
  diajukan: "Diajukan",
  sedang_direview: "Sedang ditinjau",
  disetujui: "Disetujui",
  ditolak: "Ditolak",
  didanai: "Dana tersalurkan",
  lunas: "Lunas",
};

/** Alasan penolakan minimal — terlalu pendek tidak bisa ditelusuri. */
export const ALASAN_MIN_PANJANG = 5;

export type HasilValidasiStatus =
  | { ok: true; berubah: true }
  | { ok: false; alasan: string };

/**
 * Periksa apakah admin boleh memindahkan `dari` → `ke`.
 * Murni: tidak membaca basis data, tidak menulis apa pun.
 */
export function validasiUbahStatus(
  dari: string,
  ke: string,
  alasan: string,
): HasilValidasiStatus {
  if (!STATUS_PINJAMAN.includes(ke as StatusPinjaman)) {
    return { ok: false, alasan: `Status "${ke}" tidak dikenali.` };
  }
  if (ke === "diajukan") {
    return {
      ok: false,
      alasan:
        "Status tidak dapat dikembalikan ke Diajukan — pengajuan tidak bisa dibuka ulang.",
    };
  }
  if (STATUS_TERKUNCI.includes(dari as StatusPinjaman)) {
    return {
      ok: false,
      alasan:
        "Pinjaman yang sudah lunas tidak dapat diubah lagi — posisinya sudah ditutup.",
    };
  }
  if (dari === ke) {
    return {
      ok: false,
      alasan: `Pinjaman sudah berstatus ${LABEL_STATUS_PINJAMAN[ke as StatusPinjaman]}.`,
    };
  }
  if (alasan.trim().length < ALASAN_MIN_PANJANG) {
    return {
      ok: false,
      alasan: `Alasan perubahan status wajib diisi (minimal ${ALASAN_MIN_PANJANG} karakter).`,
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
 * Sengaja TIDAK memuat tanggal jatuh tempo atau denda: pesan status adalah
 * kabar keputusan, bukan penagihan. Penagihan tetap milik template pengingat.
 */
export type DataStatusWa = {
  nama: string;
  nomorReferensi: string;
  statusLama: StatusPinjaman;
  statusBaru: StatusPinjaman;
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
 */
export function pesanPerubahanStatus(
  template: string,
  data: DataStatusWa,
): string {
  const sebagian =
    data.statusBaru === "disetujui" && data.pokokDisetujui < data.pokokDiajukan
      ? CATATAN_PERSETUJUAN_SEBAGIAN.replace(
          "{disetujui}",
          rupiahAman(data.pokokDisetujui),
        ).replace("{diajukan}", rupiahAman(data.pokokDiajukan))
      : "";

  const dasar = renderTemplateStatus(template, {
    nama: data.nama,
    ref: data.nomorReferensi,
    status: LABEL_STATUS_PINJAMAN[data.statusBaru],
    alasan: data.alasan,
    diajukan: rupiahAman(data.pokokDiajukan),
    disetujui: rupiahAman(data.pokokDisetujui),
    kewajiban:
      data.totalKewajiban === null ? "—" : rupiahAman(data.totalKewajiban),
    sebagian: "",
  });

  return sebagian === "" ? dasar : `${dasar} ${sebagian}`;
}