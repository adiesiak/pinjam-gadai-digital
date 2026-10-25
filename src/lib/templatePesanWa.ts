/**
 * Katalog template pesan WhatsApp PINDAI. MURNI, satu sumber untuk panel admin,
 * pengirim otomatis, dan uji. Tanpa Convex, React, DOM, atau `Date.now()`.
 *
 * Kenapa satu berkas: jenis pesan, placeholder wajibnya, teks bawaannya, dan
 * aturan penjadwalannya harus SAMA di tiga tempat yang berbeda:
 *  1. editor admin (chip placeholder, tombol "Lihat bawaan"/"Reset", preview),
 *  2. penegakan server saat menyimpan (`convex/whatsapp.ts`),
 *  3. pengirim otomatis (jenis pesan mana yang berhak dikirim hari ini).
 * Kalau salah satunya menulis ulang daftarnya sendiri, cepat atau lambat
 * template yang tersimpan tidak cocok dengan yang divalidasi.
 *
 * Batas yang dijaga:
 * - **Placeholder wajib per jenis.** Pesan pengingat tanpa `{jumlah}` bukan
 *   pengingat; pesan OTP tanpa `{kode_otp}` tidak berguna. Validasi ini yang
 *   membuat template tersimpan tidak bisa kehilangan bagian pentingnya.
 * - **Tidak ada placeholder tak dikenal.** Yang tidak dikenal akan terkirim apa
 *   adanya (`{foo}`) ke nasabah, jadi ia ditolak lebih dulu.
 * - **Penjadwalan hanya soal waktu, bukan uang.** Fungsi di sini memutuskan
 *   "boleh kirim sekarang?" dari jam WIB dan riwayat kirim; nominal dan denda
 *   tetap milik ledger (`lib/loan`) dan tidak pernah dihitung di sini.
 * - **Berhenti setelah pembayaran.** Pengingat hanya untuk pinjaman yang masih
 *   berjalan (`didanai`); begitu status berubah, tidak ada lagi yang dikirim.
 */

/** Jenis template yang bisa diatur admin. Kunci inilah yang disimpan server. */
export const JENIS_TEMPLATE_WA = [
  "pengingat_h3",
  "pengingat_h1",
  "pengingat_hari_h",
  "terlambat_1",
  "terlambat_2",
  "konfirmasi_pembayaran",
  "pelunasan",
  "pencairan",
  "otp",
  "info_tagihan",
  "lokasi",
  "status",
] as const;

export type JenisTemplateWa = (typeof JENIS_TEMPLATE_WA)[number];

/** Semua placeholder yang dikenal sistem. */
export const PLACEHOLDER_WA = [
  "nama",
  "ref",
  "jumlah",
  "tanggal",
  "sisa",
  "denda",
  "hari",
  "jatuh_tempo",
  "metode_bayar",
  "kontak",
  "kode_otp",
  "menit",
  "status",
  "alasan",
  "diajukan",
  "disetujui",
  "kewajiban",
  "tautan",
] as const;

export type PlaceholderWa = (typeof PLACEHOLDER_WA)[number];

/** Keterangan satu placeholder; ditampilkan sebagai tooltip chip di editor. */
export const KETERANGAN_PLACEHOLDER_WA: Record<PlaceholderWa, string> = {
  nama: "Nama peminjam (huruf besar, seperti di ledger).",
  ref: "Nomor referensi pinjaman, mis. PGD-2026-0012.",
  jumlah: "Total kewajiban tercatat (pokok + bunga + denda) dalam rupiah.",
  tanggal: "Tanggal jatuh tempo dalam tulisan panjang, mis. 12 September 2026.",
  sisa: "Tenor pinjaman, mis. 28 hari atau 6 bulan.",
  denda: "Keterangan denda bila sudah ada, mis. “ (sudah termasuk denda Rp 20.000)”.",
  hari: "Jumlah hari menuju jatuh tempo (3, 1, atau 0).",
  jatuh_tempo: "Tanggal jatuh tempo; sama dengan {tanggal}.",
  metode_bayar: "Cara pembayaran yang tercatat di pengaturan sistem (rekening atau QRIS).",
  kontak: "Nomor kontak bantuan; bila belum diatur, pesan menyebut “balas pesan ini”.",
  kode_otp: "Kode OTP sekali pakai, khusus untuk template OTP.",
  menit: "Masa berlaku kode OTP dalam menit, khusus untuk template OTP.",
  status: "Status pinjaman yang baru.",
  alasan: "Alasan yang ditulis admin saat mengubah status.",
  diajukan: "Nominal yang diajukan nasabah.",
  disetujui: "Nominal yang disetujui admin.",
  kewajiban: "Total kewajiban setelah status baru berlaku.",
  tautan: "Tautan halaman status pinjaman yang dibuat aplikasi; jangan diganti tautan lain.",
};

/** Placeholder yang boleh dipakai satu jenis template. */
export const PLACEHOLDER_DIIZINKAN: Record<JenisTemplateWa, readonly PlaceholderWa[]> = {
  pengingat_h3: ["nama", "ref", "jumlah", "tanggal", "jatuh_tempo", "hari", "sisa", "denda", "metode_bayar", "kontak"],
  pengingat_h1: ["nama", "ref", "jumlah", "tanggal", "jatuh_tempo", "hari", "sisa", "denda", "metode_bayar", "kontak"],
  pengingat_hari_h: ["nama", "ref", "jumlah", "tanggal", "jatuh_tempo", "sisa", "denda", "metode_bayar", "kontak"],
  terlambat_1: ["nama", "ref", "jumlah", "tanggal", "jatuh_tempo", "denda", "metode_bayar", "kontak"],
  terlambat_2: ["nama", "ref", "jumlah", "tanggal", "jatuh_tempo", "denda", "metode_bayar", "kontak"],
  konfirmasi_pembayaran: ["nama", "ref", "jumlah", "tanggal", "metode_bayar", "kontak"],
  pelunasan: ["nama", "ref", "jumlah", "tanggal", "kontak"],
  pencairan: ["nama", "ref", "jumlah", "jatuh_tempo", "tanggal", "sisa", "metode_bayar", "kontak"],
  otp: ["kode_otp", "menit"],
  info_tagihan: ["nama", "ref", "jumlah", "tanggal", "jatuh_tempo", "sisa", "denda", "metode_bayar", "kontak", "tautan"],
  lokasi: ["nama", "ref", "kontak"],
  status: ["nama", "ref", "status", "alasan", "diajukan", "disetujui", "kewajiban", "kontak"],
};

/**
 * Placeholder WAJIB satu jenis: tanpa salah satunya, pesannya kehilangan inti
 * maksudnya. Diperiksa editor (chip merah + tombol simpan mati) DAN server.
 */
export const PLACEHOLDER_WAJIB: Record<JenisTemplateWa, readonly PlaceholderWa[]> = {
  pengingat_h3: ["nama", "jatuh_tempo", "jumlah"],
  pengingat_h1: ["nama", "jatuh_tempo", "jumlah"],
  pengingat_hari_h: ["nama", "jatuh_tempo", "jumlah"],
  terlambat_1: ["nama", "jumlah"],
  terlambat_2: ["nama", "jumlah"],
  konfirmasi_pembayaran: ["nama", "jumlah"],
  pelunasan: ["nama"],
  pencairan: ["nama", "jumlah"],
  otp: ["kode_otp", "menit"],
  info_tagihan: ["nama", "jumlah", "tautan"],
  lokasi: ["nama"],
  status: ["status"],
};

/** Label ramah satu jenis, dipakai log pengiriman dan daftar di panel. */
export const LABEL_JENIS_WA: Record<JenisTemplateWa, string> = {
  pengingat_h3: "Pengingat H-3",
  pengingat_h1: "Pengingat H-1",
  pengingat_hari_h: "Pengingat hari H",
  terlambat_1: "Keterlambatan tahap 1",
  terlambat_2: "Keterlambatan tahap 2",
  konfirmasi_pembayaran: "Konfirmasi pembayaran",
  pelunasan: "Pelunasan",
  pencairan: "Pencairan",
  otp: "Kode OTP",
  info_tagihan: "Info tagihan & cek status",
  lokasi: "Peringatan lokasi perangkat",
  status: "Perubahan status pinjaman",
};

/** Satu baris keterangan untuk tiap jenis (kapan ia terkirim). */
export const KETERANGAN_JENIS_WA: Record<JenisTemplateWa, string> = {
  pengingat_h3: "Dikirim otomatis tiga hari sebelum jatuh tempo, pada jam kirim yang diizinkan.",
  pengingat_h1: "Dikirim otomatis sehari sebelum jatuh tempo.",
  pengingat_hari_h: "Dikirim otomatis pada hari jatuh tempo.",
  terlambat_1: "Dikirim otomatis mulai hari pertama keterlambatan (maksimal satu pesan per hari).",
  terlambat_2: "Dikirim otomatis setelah keterlambatan berjalan satu minggu.",
  konfirmasi_pembayaran: "Dikirim saat petugas mencatat pembayaran nasabah diterima di aplikasi.",
  pelunasan: "Dikirim saat pinjaman tercatat lunas.",
  pencairan: "Dikirim saat pinjaman ditandai tersalurkan.",
  otp: "Dipakai untuk semua kode OTP (login WhatsApp, verifikasi nomor, persetujuan transaksi).",
  info_tagihan: "Dikirim manual petugas dari daftar pinjaman.",
  lokasi: "Dikirim otomatis maksimal sekali per 24 jam saat pola koordinat perangkat ditandai.",
  status:
    "Dikirim otomatis setiap status pinjaman berubah, kecuali saat Lunas (memakai template Pelunasan) " +
    "dan saat dana disalurkan (memakai template Pencairan).",
};

/**
 * Teks bawaan tiap jenis.
 *
 * Nadanya sopan, netral, dan menyebut sumbernya sebagai catatan aplikasi:
 * bukan surat tagihan, bukan ancaman, dan tidak pernah menjanjikan perpindahan
 * dana. Nominal selalu lewat placeholder supaya angkanya datang dari ledger.
 */
export const TEMPLATE_BAWAAN_WA: Record<JenisTemplateWa, string> = {
  pengingat_h3:
    "Halo {nama}, ini pengingat dari PINDAI. Pinjaman {ref} akan jatuh tempo dalam {hari} hari, " +
    "pada {jatuh_tempo}. Total kewajiban tercatat {jumlah}. Mohon siapkan pembayaran agar tidak " +
    "ada denda keterlambatan. Terima kasih.",
  pengingat_h1:
    "Halo {nama}, pengingat dari PINDAI: pinjaman {ref} jatuh tempo BESOK ({jatuh_tempo}). " +
    "Total kewajiban tercatat {jumlah}. Mohon lakukan pembayaran melalui {metode_bayar}. Terima kasih.",
  pengingat_hari_h:
    "Halo {nama}, hari ini tanggal jatuh tempo pinjaman {ref} ({jatuh_tempo}). Total kewajiban " +
    "tercatat {jumlah}. Mohon lakukan pembayaran melalui {metode_bayar}. Terima kasih.",
  terlambat_1:
    "Halo {nama}, pinjaman {ref} tercatat melewati jatuh tempo {jatuh_tempo}. Total kewajiban saat " +
    "ini {jumlah}{denda}. Mohon segera lakukan pembayaran melalui {metode_bayar}, atau balas pesan " +
    "ini agar kami bantu prosesnya. Terima kasih.",
  terlambat_2:
    "Halo {nama}, pinjaman {ref} masih tercatat belum diselesaikan sejak {jatuh_tempo}. Total " +
    "kewajiban saat ini {jumlah}{denda}. Mohon segera lakukan pembayaran melalui {metode_bayar}, " +
    "atau hubungi kami di {kontak} untuk membicarakan penyelesaiannya. Terima kasih.",
  konfirmasi_pembayaran:
    "Halo {nama}, pembayaran sebesar {jumlah} untuk pinjaman {ref} sudah kami catat di aplikasi " +
    "PINDAI. Bila masih ada sisa kewajiban, kami kabari kembali. Terima kasih.",
  pelunasan:
    "Halo {nama}, pinjaman {ref} sudah tercatat LUNAS. Terima kasih atas pembayarannya. Bila ada " +
    "pertanyaan, hubungi kami di {kontak}.",
  pencairan:
    "Halo {nama}, dana pinjaman {ref} sudah ditandai tersalurkan sebesar {jumlah}. Jatuh tempo " +
    "{jatuh_tempo}. Mohon simpan pesan ini sebagai catatan Anda. Terima kasih.",
  otp:
    "Kode PINDAI Anda: {kode_otp}. Berlaku {menit} menit dan hanya bisa dipakai sekali. Jangan " +
    "bagikan kode ini kepada siapa pun, termasuk yang mengaku petugas PINDAI.",
  info_tagihan:
    "Halo {nama}, berikut ringkasan status pinjaman aktif Anda di PINDAI {ref}. Total kewajiban " +
    "tercatat {jumlah}. Rincian tagihan dan kwitansi digital dapat diperiksa melalui tautan resmi " +
    "berikut: {tautan}. Terima kasih.",
  lokasi:
    "Halo {nama}, PINDAI mendeteksi lokasi perangkat Anda dikirim oleh aplikasi pihak ketiga " +
    "(lokasi palsu/dibekukan), sehingga transaksi PINDAI bisa ditolak. Mohon hapus atau matikan " +
    "aplikasi pengubah lokasi, lalu buka aplikasi PINDAI agar lokasi asli terkirim. Bila Anda " +
    "memang memakai lokasi khusus atas persetujuan petugas PINDAI, abaikan pesan ini. Terima kasih.",
  status:
    "Halo {nama}, status pinjaman Anda {ref} kini {status}. {alasan} Total kewajiban tercatat " +
    "{kewajiban}. Bila ada pertanyaan, hubungi kami di {kontak}. Terima kasih.",
};

/** Nilai contoh untuk preview live di panel admin. */
export const CONTOH_NILAI_WA: Record<string, string> = {
  nama: "RANI PUSPITA",
  ref: "PGD-20261001-AB12",
  jumlah: "Rp 1.500.000",
  tanggal: "12 September 2026",
  jatuh_tempo: "12 September 2026",
  sisa: "28 hari",
  denda: " (sudah termasuk denda Rp 20.000)",
  hari: "3",
  metode_bayar: "transfer ke BCA 1234567890 a.n. PINDAI",
  kontak: "balas pesan ini",
  kode_otp: "123456",
  menit: "5",
  status: "Terverifikasi",
  alasan: "Data sudah lengkap.",
  diajukan: "Rp 2.000.000",
  disetujui: "Rp 1.500.000",
  kewajiban: "Rp 1.950.000",
  tautan: "https://pindai.example.com/cek-status/0123456789abcdef0123456789abcdef",
};

/** Semua nama placeholder yang muncul di sebuah teks, urut kemunculan. */
export function placeholderDipakai(teks: string): string[] {
  const hasil: string[] = [];
  for (const cocok of teks.matchAll(/\{([a-zA-Z0-9_]+)\}/g)) {
    if (!hasil.includes(cocok[1])) hasil.push(cocok[1]);
  }
  return hasil;
}

/** Placeholder di teks yang tidak dikenal sistem (mis. salah tulis). */
export function placeholderTakDikenal(teks: string): string[] {
  return placeholderDipakai(teks).filter(
    (nama) => !(PLACEHOLDER_WA as readonly string[]).includes(nama),
  );
}

/** Placeholder wajib yang belum ada di teks. */
export function placeholderWajibHilang(jenis: JenisTemplateWa, teks: string): PlaceholderWa[] {
  const dipakai = placeholderDipakai(teks);
  return PLACEHOLDER_WAJIB[jenis].filter((wajib) => !dipakai.includes(wajib));
}

/** Placeholder yang dikenal tetapi tidak diizinkan untuk jenis ini. */
export function placeholderTidakDiizinkan(jenis: JenisTemplateWa, teks: string): string[] {
  const diizinkan = PLACEHOLDER_DIIZINKAN[jenis] as readonly string[];
  return placeholderDipakai(teks).filter(
    (nama) =>
      (PLACEHOLDER_WA as readonly string[]).includes(nama) && !diizinkan.includes(nama),
  );
}

/** Hasil pemeriksaan satu template. */
export type HasilValidasiTemplate =
  | { ok: true; alasan: null }
  | { ok: false; alasan: string };

/** Periksa satu template terhadap aturan jenisnya; kalimat siap tampil. */
export function validasiTemplateWa(jenis: JenisTemplateWa, teks: string): HasilValidasiTemplate {
  const isi = teks.trim();
  if (isi.length === 0) {
    return { ok: false, alasan: "Template tidak boleh kosong." };
  }
  if (isi.length > 900) {
    return { ok: false, alasan: "Template terlalu panjang (maksimal 900 karakter)." };
  }
  const takDikenal = placeholderTakDikenal(isi);
  if (takDikenal.length > 0) {
    return {
      ok: false,
      alasan: `Placeholder tidak dikenal: ${takDikenal.map((p) => `{${p}}`).join(", ")}.`,
    };
  }
  const tidakDiizinkan = placeholderTidakDiizinkan(jenis, isi);
  if (tidakDiizinkan.length > 0) {
    return {
      ok: false,
      alasan: `${LABEL_JENIS_WA[jenis]} tidak memakai ${tidakDiizinkan
        .map((p) => `{${p}}`)
        .join(", ")}.`,
    };
  }
  const hilang = placeholderWajibHilang(jenis, isi);
  if (hilang.length > 0) {
    return {
      ok: false,
      alasan: `Wajib memuat ${hilang.map((p) => `{${p}}`).join(", ")}.`,
    };
  }
  return { ok: true, alasan: null };
}

/**
 * Rangkai isi pesan dari template + nilai.
 *
 * Placeholder yang tidak punya nilai diganti kata jujur ("belum tercatat"),
 * BUKAN dibiarkan sebagai `{jumlah}` di tangan nasabah. Fungsi ini juga
 * mengembalikan daftar placeholder yang masih tersisa setelah penggantian
 * supaya pengirim bisa memilih teks bawaan alih-alih mengirim pesan cacat.
 */
export function rangkaiPesanWa(
  teks: string,
  nilai: Readonly<Record<string, string | null | undefined>>,
): { isi: string; tersisa: string[] } {
  const isi = teks.replace(/\{([a-zA-Z0-9_]+)\}/g, (_cocok, nama: string) => {
    const v = nilai[nama];
    if (v === null || v === undefined || v === "") {
      return (PLACEHOLDER_WA as readonly string[]).includes(nama) ? "belum tercatat" : `{${nama}}`;
    }
    return v;
  });
  return { isi, tersisa: placeholderTakDikenal(isi) };
}

/** Template yang benar-benar dipakai: versi tersimpan bila sah, selain itu bawaan. */
export function templateBerlaku(
  jenis: JenisTemplateWa,
  tersimpan: string | null | undefined,
): { teks: string; dipakaiBawaan: boolean; alasanBawaan: string | null } {
  const teks = (tersimpan ?? "").trim();
  if (teks === "") {
    return { teks: TEMPLATE_BAWAAN_WA[jenis], dipakaiBawaan: true, alasanBawaan: null };
  }
  const sah = validasiTemplateWa(jenis, teks);
  if (!sah.ok) {
    return {
      teks: TEMPLATE_BAWAAN_WA[jenis],
      dipakaiBawaan: true,
      alasanBawaan: `Template tersimpan untuk ${LABEL_JENIS_WA[jenis]} tidak sah (${sah.alasan}); pesan memakai teks bawaan.`,
    };
  }
  return { teks, dipakaiBawaan: false, alasanBawaan: null };
}

/* ==========================================================================
 * Penjadwalan pengiriman otomatis
 * ========================================================================== */

/** Waktu Indonesia Barat tidak memakai daylight saving, jadi offsetnya tetap. */
export const WIB_OFFSET_MENIT = 7 * 60;

/** Jendela kirim: hanya 08.00-20.00 WIB (batas 20.00 tidak termasuk). */
export const JAM_KIRIM_MULAI = 8;
export const JAM_KIRIM_SELESAI = 20;

/** Jam (0 sampai 23) menurut WIB untuk satu waktu epoch ms. */
export function jamWib(waktuMs: number): number {
  return new Date(waktuMs + WIB_OFFSET_MENIT * 60_000).getUTCHours();
}

/** Apakah sebuah jam WIB ada di dalam jendela kirim. */
export function dalamJamKirim(jam: number): boolean {
  return jam >= JAM_KIRIM_MULAI && jam < JAM_KIRIM_SELESAI;
}

/**
 * Jenis pengingat jatuh tempo dari sisa hari: H-3, H-1, atau hari H.
 * Sisa hari lain (mis. 2) tidak punya pengingat sendiri: mengirim pengingat
 * setiap hari akan terasa menagih, dan itu bukan tujuan fitur ini.
 */
export function jenisPengingatHari(sisaHari: number): JenisTemplateWa | null {
  if (sisaHari === 3) return "pengingat_h3";
  if (sisaHari === 1) return "pengingat_h1";
  if (sisaHari === 0) return "pengingat_hari_h";
  return null;
}

/** Ambang hari keterlambatan yang memindahkan pesan ke tahap 2. */
export const AMBANG_TERLAMBAT_TAHAP_2_HARI = 7;

/** Jenis pesan keterlambatan dari jumlah hari terlambat (0 = tidak terlambat). */
export function jenisKeterlambatan(hariTerlambat: number): JenisTemplateWa | null {
  if (hariTerlambat <= 0) return null;
  return hariTerlambat < AMBANG_TERLAMBAT_TAHAP_2_HARI ? "terlambat_1" : "terlambat_2";
}

/**
 * Jenis pesan jatuh tempo yang berhak dikirim untuk satu pinjaman hari ini.
 *
 * `sisaHari` mengikuti `pelunasanPinjaman` (negatif = sudah lewat), jadi
 * keterlambatan dipilih dari `hariTerlambat` dan bukan dari tanda angka.
 */
export function jenisPesanJatuhTempo(
  sisaHari: number,
  hariTerlambat: number,
): JenisTemplateWa | null {
  return jenisKeterlambatan(hariTerlambat) ?? jenisPengingatHari(sisaHari);
}

/**
 * Aturan "maksimal satu pesan per hari" untuk keterlambatan.
 *
 * Pengingat jatuh tempo (H-3/H-1/hari H) hanya punya satu kesempatan per
 * tanggal, jadi pemeriksaan ini berlaku untuk pesan keterlambatan: begitu satu
 * pesan keterlambatan sudah berangkat hari ini, pesan berikutnya ditahan.
 */
export function bolehKirimHariIni(
  jenis: JenisTemplateWa,
  sudahKirimHariIni: boolean,
): boolean {
  if (!sudahKirimHariIni) return true;
  return !(jenis === "terlambat_1" || jenis === "terlambat_2");
}

/**
 * Apakah pinjaman masih berhak menerima pengingat otomatis.
 *
 * Hanya pinjaman yang masih berjalan (`didanai`): begitu pembayaran tercatat
 * dan status berpindah (lunas/ditolak/ditinjau), pengingat berhenti dengan
 * sendirinya. Ini yang membuat "berhenti otomatis setelah pembayaran tercatat"
 * tidak bergantung pada ingatan siapa pun.
 */
export function masihBerhakDapatPengingat(status: string): boolean {
  return status === "didanai";
}

/**
 * Jenis yang dikirim PENJADWAL otomatis (bukan oleh admin dan bukan oleh
 * peristiwa lain): pengingat jatuh tempo dan pesan keterlambatan.
 */
export const JENIS_PENGINGAT_OTOMATIS = [
  "pengingat_h3",
  "pengingat_h1",
  "pengingat_hari_h",
  "terlambat_1",
  "terlambat_2",
] as const;

/**
 * Satu pinjaman yang sedang dipertimbangkan penjadwal: angkanya sudah dihitung
 * pemanggil (`lib/loan`), termasuk jenis apa saja yang SUDAH berangkat hari ini
 * (dibaca dari log pengiriman, bukan dari ingatan proses).
 */
export type KandidatPengingat = {
  loanId: string;
  status: string;
  /** Hari menuju jatuh tempo; negatif berarti sudah lewat. */
  sisaHari: number;
  /** Hari keterlambatan; 0 berarti belum terlambat. */
  hariTerlambat: number;
  /** Jenis yang tercatat sudah terkirim hari ini untuk pinjaman ini. */
  jenisHariIni: readonly string[];
};

/** Satu keputusan kirim: pinjaman mana, dengan template jenis apa. */
export type RencanaPengingat = { loanId: string; jenis: JenisTemplateWa };

/**
 * Rencana kirim pengingat untuk SATU kali jalan penjadwal.
 *
 * Aturan yang ditegakkan di sini, berurutan:
 *  1. **Jendela kirim**: di luar 08.00-20.00 WIB tidak ada rencana sama sekali,
 *     jadi tidak ada pesan tengah malam meski cron berjalan tiap jam.
 *  2. **Berhenti setelah pembayaran**: hanya pinjaman yang masih berjalan
 *     (`didanai`); setelah status berpindah, pinjaman itu tidak lagi dipilih.
 *  3. **H-3, H-1, hari H saja**: sisa hari lain tidak punya pengingat sendiri.
 *  4. **Maksimal satu pesan keterlambatan per hari**, dan satu kiriman per jenis
 *     per hari; idempoten walau penjadwal berjalan berkali-kali.
 *
 * Fungsi ini MURNI: waktu dan riwayat masuk sebagai argumen, jadi keputusannya
 * bisa diuji sebagai skrip biasa tanpa jam atau database.
 */
export function rencanaPengingat(
  sekarangMs: number,
  kandidat: readonly KandidatPengingat[],
): RencanaPengingat[] {
  if (!dalamJamKirim(jamWib(sekarangMs))) return [];
  const rencana: RencanaPengingat[] = [];
  for (const k of kandidat) {
    if (!masihBerhakDapatPengingat(k.status)) continue;
    const jenis = jenisPesanJatuhTempo(k.sisaHari, k.hariTerlambat);
    if (jenis === null) continue;
    if (k.jenisHariIni.includes(jenis)) continue;
    const sudahKirimKeterlambatanHariIni =
      k.jenisHariIni.includes("terlambat_1") || k.jenisHariIni.includes("terlambat_2");
    if (!bolehKirimHariIni(jenis, sudahKirimKeterlambatanHariIni)) continue;
    rencana.push({ loanId: k.loanId, jenis });
  }
  return rencana;
}

/**
 * Label ramah untuk jenis apa pun yang tersimpan di log (termasuk yang lama).
 *
 * Katalog template di atas hanya memuat pesan yang teksnya bisa diatur admin.
 * Jenis di bawah ini dikirim sistem dengan teks yang sudah ditentukan kode
 * (termasuk dua laporan PDF pendana), jadi ia tidak masuk katalog — tetapi
 * tetap muncul di riwayat pengiriman dan harus terbaca sebagai pekerjaan, bukan
 * sebagai nama teknis.
 */
export function jenisRamahWa(jenis: string): string {
  if ((JENIS_TEMPLATE_WA as readonly string[]).includes(jenis)) {
    return LABEL_JENIS_WA[jenis as JenisTemplateWa];
  }
  const diLuarKatalog: Record<string, string> = {
    pengingat: "Pengingat tagihan (manual)",
    tes: "Pesan tes",
    status_pinjaman: "Perubahan status pinjaman",
    lokasi_dicurigai: "Peringatan lokasi perangkat",
    otp_verifikasi_nomor: "Kode OTP verifikasi nomor",
    otp_transaksi: "Kode OTP persetujuan transaksi",
    laporan_pelunasan: "Laporan pelunasan ke pendana (PDF)",
    laporan_portofolio: "Laporan kinerja pendanaan (PDF)",
  };
  return diLuarKatalog[jenis] ?? jenis;
}

/**
 * Teks metode pembayaran dari pengaturan sistem.
 *
 * Disusun apa adanya dari yang benar-benar diisi admin: kalau nomor rekening
 * belum ada, teksnya menyebut itu, bukan mengarang nomor. Rekening dan QRIS
 * bisa dipakai bersamaan, jadi keduanya disebut bila keduanya terisi.
 */
export function teksMetodeBayar(cfg: {
  rekeningUsahaBank?: string | null;
  rekeningUsahaNomor?: string | null;
  rekeningUsahaNama?: string | null;
  qrisMerchantNama?: string | null;
}): string {
  const bank = (cfg.rekeningUsahaBank ?? "").trim();
  const nomor = (cfg.rekeningUsahaNomor ?? "").trim();
  const nama = (cfg.rekeningUsahaNama ?? "").trim();
  const qris = (cfg.qrisMerchantNama ?? "").trim();
  const bagian: string[] = [];
  if (nomor !== "") {
    bagian.push(`transfer ke ${bank === "" ? "rekening" : bank} ${nomor}${nama === "" ? "" : ` a.n. ${nama}`}`);
  }
  if (qris !== "") bagian.push(`QRIS ${qris}`);
  if (bagian.length === 0) return "metode pembayaran yang tercatat di aplikasi";
  return bagian.join(" atau ");
}
