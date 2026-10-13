/**
 * PERSETUJUAN pemrosesan data untuk modul KYC — logika & teks MURNI (tanpa
 * React, Convex, DOM) supaya versinya bisa diuji dan teksnya tidak tersebar di
 * beberapa komponen.
 *
 * Kenapa berkas ini ada: modul KYC mengumpulkan data pribadi yang paling
 * sensitif di aplikasi (NIK, foto KTP, selfie, bukti penghasilan, nomor
 * rekening). UU PDP No. 27/2022 menuntut persetujuan yang eksplisit SEBELUM
 * pengumpulan, dengan penjelasan tujuan dan hak pemilik data. Karena itu:
 *
 * - Penjelasan dan kotak centang persetujuan muncul sebagai TAHAP PERTAMA, dan
 *   server MENOLAK menyimpan isian pribadi apa pun sebelum persetujuan tercatat
 *   (lihat `simpanProgresKyc` di `convex/kyc.ts`) — bukan sekadar tampilan.
 * - Persetujuan disimpan bersama VERSINYA. Bila teks penjelasan berubah
 *   (mis. tujuan baru atau masa simpan berubah), versinya dinaikkan dan
 *   pengguna diminta menyetujui ulang — bukan dianggap sudah setuju selamanya
 *   atas teks yang tidak pernah ia baca.
 * - Teksnya sengaja tidak memuat klaim yang tidak bisa dijaga sistem (mis.
 *   \"data tidak pernah keluar dari Indonesia\"): server Convex berada di luar
 *   Indonesia, jadi hal itu dinyatakan apa adanya.
 */

/** Versi teks persetujuan yang berlaku sekarang. Naikkan bila teks berubah. */
export const VERSI_PERSETUJUAN_KYC = "pdp-2026-10";

export type PoinPersetujuan = {
  readonly judul: string;
  readonly isi: string;
};

/**
 * Penjelasan pemrosesan data — dibaca sebelum kotak centang.
 *
 * Urutannya sengaja mengikuti pertanyaan yang wajar muncul di kepala pengguna:
 * data apa → untuk apa → siapa yang melihat → berapa lama → ke mana → apa hak
 * saya → apa arti status ini.
 */
export const POIN_PERSETUJUAN_KYC: readonly PoinPersetujuan[] = [
  {
    judul: "Data yang dikumpulkan",
    isi: "Nama sesuai KTP, NIK, nomor WhatsApp, alamat, pekerjaan, penghasilan per bulan, nama bank dan nomor rekening, serta berkas foto KTP, selfie dengan KTP, dan bukti penghasilan.",
  },
  {
    judul: "Tujuan pemrosesan",
    isi: "Memastikan identitas Anda benar sebelum layanan pinjaman/gadai diberikan, menilai kelayakan, mencegah penyalahgunaan identitas dan pencucian uang. Data KYC tidak dipakai untuk iklan atau dijual.",
  },
  {
    judul: "Siapa yang dapat melihat",
    isi: "Hanya petugas PINDAI yang membuka panel admin (wajib TOTP) dan hanya untuk meninjau pengajuan Anda. Setiap keputusan yang diambil atas data ini tercatat di jejak audit — siapa, kapan, dan atas dasar apa.",
  },
  {
    judul: "Dokumen dilindungi",
    isi: "Foto KTP dan selfie ditampilkan dengan tanda air \"VERIFIKASI PINDAI\" saat ditinjau, sehingga salinan layar selalu membawa jejak pemeriksaannya.",
  },
  {
    judul: "Masa simpan",
    isi: "Data disimpan selama akun Anda aktif dan selama kewajiban pencatatan yang berlaku. Anda dapat meminta penghapusan data; permintaan itu dicatat dan diproses tim PINDAI.",
  },
  {
    judul: "Tempat penyimpanan",
    isi: "Data tersimpan terenkripsi pada layanan basis data dan penyimpanan berkas kami, yang servernya berada di luar Indonesia, dengan dasar transfer yang sah dan akses terbatas.",
  },
  {
    judul: "Hak Anda",
    isi: "Anda berhak mengakses, memperbaiki, dan meminta penghapusan data pribadi, serta menarik persetujuan ini. Menarik persetujuan berarti pengajuan KYC tidak dapat dilanjutkan.",
  },
  {
    judul: "Arti status terverifikasi",
    isi: "Status \"Terverifikasi\" hanya berarti identitas Anda sudah diperiksa petugas. Itu bukan persetujuan pinjaman dan bukan bukti dana cair.",
  },
];

/** Kalimat di samping kotak centang — yang benar-benar disetujui pengguna. */
export const RINGKASAN_PERSETUJUAN_KYC =
  "Saya sudah membaca penjelasan di atas dan menyetujui pemrosesan data pribadi saya untuk verifikasi identitas sesuai tujuannya.";

/** Persetujuan yang tercatat di server (bentuk minimal yang dibutuhkan UI). */
export type PersetujuanTercatat = { versi: string; pada: number } | null | undefined;

/**
 * true bila persetujuan yang tercatat masih berlaku: ada, dan versinya sama
 * dengan teks yang sekarang ditampilkan. Persetujuan versi lama TIDAK dianggap
 * sah — pengguna diminta menyetujui teks yang benar-benar ia baca.
 */
export function persetujuanAktif(tercatat: PersetujuanTercatat): boolean {
  return tercatat !== null && tercatat !== undefined && tercatat.versi === VERSI_PERSETUJUAN_KYC;
}

/**
 * Apakah pesan galat server berarti "persetujuan belum tercatat".
 *
 * Dipakai antarmuka untuk MENGANTAR pengguna kembali ke tahap persetujuan — bukan
 * menebak-nebak jenis galat lain. Kalimatnya milik server
 * (`convex/kyc.ts` → `pastikanPersetujuan`); pemetaan ini diuji agar perubahan
 * kalimat di server tidak diam-diam membuat pengguna tersangkut di tahap lain.
 */
export function pesanButuhPersetujuan(pesan: string | null | undefined): boolean {
  if (pesan === null || pesan === undefined) return false;
  return /persetujuan pemrosesan data belum tercatat/i.test(pesan);
}

/** Apakah pesan galat server berarti versi penjelasan sudah berubah. */
export function pesanVersiPersetujuanBerubah(pesan: string | null | undefined): boolean {
  if (pesan === null || pesan === undefined) return false;
  return /versi penjelasan pemrosesan data sudah berubah/i.test(pesan);
}
