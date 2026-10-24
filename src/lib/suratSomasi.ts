/**
 * SURAT SOMASI — isi surat penagihan untuk pinjaman yang sudah melewati
 * jatuh tempo.
 *
 * Satu sumber untuk pratinjau, PDF, email, dan WhatsApp. Semua nominal datang
 * dari `pelunasanPinjaman` (mesin yang sama dengan dashboard penagihan), bukan
 * dihitung ulang di sini.
 *
 * Batas isi surat: menyebut kewajiban, tenggat, dan langkah penyelesaian sesuai
 * perjanjian. Tidak ada ancaman, penyebaran data ke pihak lain, atau janji yang
 * tidak bisa ditepati, karena surat ini bisa dibaca siapa pun yang menerimanya.
 */
import { formatRupiah } from "./money";
import { formatTanggalWIB, kodeTanggalWIB } from "./waktu";

const HARI_MS = 86_400_000;

/** Batas bayar bawaan: 7 hari kalender sejak tanggal surat. */
export const BATAS_BAYAR_HARI = 7;

/**
 * Hasil yang dicatat setelah surat diserahkan. Ini CATATAN tindak lanjut,
 * bukan eksekusi pembayaran atau perubahan tenor: jalur uang tetap lewat
 * pencatatan pembayaran, dan perubahan tenor lewat modul restrukturisasi.
 */
export const TINDAK_LANJUT_SOMASI = [
  "dibayar",
  "janji_baru",
  "restrukturisasi",
  "penanganan_khusus",
] as const;

export type TindakLanjutSomasi = (typeof TINDAK_LANJUT_SOMASI)[number];

export const LABEL_TINDAK_LANJUT_SOMASI: Record<TindakLanjutSomasi, string> = {
  dibayar: "Kewajiban sudah dibayar",
  janji_baru: "Ada janji pembayaran baru",
  restrukturisasi: "Diajukan restrukturisasi",
  penanganan_khusus: "Masuk penanganan khusus",
};

/** Validasi nilai tindak lanjut dari klien; alasan siap ditampilkan. */
export function validasiTindakLanjutSomasi(
  nilai: string,
): { ok: true; nilai: TindakLanjutSomasi } | { ok: false; alasan: string } {
  if ((TINDAK_LANJUT_SOMASI as readonly string[]).includes(nilai)) {
    return { ok: true, nilai: nilai as TindakLanjutSomasi };
  }
  return {
    ok: false,
    alasan: `Tindak lanjut "${nilai}" tidak dikenal. Pilih salah satu dari ${TINDAK_LANJUT_SOMASI.length} pilihan yang tersedia.`,
  };
}

/**
 * Keterlambatan minimum sebelum somasi boleh dibuat. Hari pertama terlambat
 * masih tahap pengingat; somasi di hari itu memperkeruh hubungan tanpa memberi
 * peminjam kesempatan memperbaiki.
 */
export const MIN_HARI_SOMASI = 3;

export type IdentitasBadan = {
  namaBadan: string;
  alamat: string;
  email: string;
  telepon: string;
};

export type RekeningPembayaran = {
  nama: string;
  bank: string;
  nomor: string;
};

export type DataSuratSomasi = {
  nomorReferensi: string;
  namaPeminjam: string;
  /**
   * Pokok yang masih berjalan — sisa pokok untuk pinjaman yang sudah
   * diperpanjang, bukan pokok awal. Baris "Pokok pinjaman" pada surat memakai
   * angka ini supaya pokok + bunga/biaya + denda benar-benar sama dengan total
   * yang ditagih.
   */
  pokokBerjalan: number;
  jatuhTempoPada: number;
  hariTerlambat: number;
  dendaTerlambat: number;
  /** Pokok + bunga + denda pada saat surat dibuat. */
  totalKewajiban: number;
  /** Tarif denda berlaku (% pokok per hari) untuk label rincian. */
  persenDendaPerHari: number;
  /** Rekening usaha admin; null berarti instruksi pembayaran lewat petugas. */
  rekening: RekeningPembayaran | null;
  identitas: IdentitasBadan;
};

export type OpsiSuratSomasi = {
  /** Waktu surat dibuat. */
  sekarang: number;
  /** Hari kalender sampai batas bayar. */
  batasHari?: number;
};

export type BarisRincianSomasi = { label: string; nilai: string };

export type SuratSomasi = {
  nomorSurat: string;
  perihal: string;
  tanggalTeks: string;
  batasBayarPada: number;
  batasBayarTeks: string;
  kepada: string;
  paragraf: string[];
  rincian: BarisRincianSomasi[];
  instruksiBayar: string[];
  penutup: string[];
  pembuat: string;
  dibuatPada: number;
  hariTerlambat: number;
  totalKewajiban: number;
  identitas: IdentitasBadan;
};

/**
 * Apakah pinjaman ini boleh dibuatkan somasi, beserta alasannya bila tidak.
 * Janji bayar aktif dan pengaduan terbuka diperiksa pemanggil server karena
 * keduanya butuh data kasus, bukan angka pinjaman saja.
 */
export function cekSomasi(
  data: { hariTerlambat: number; totalKewajiban: number | null },
  opsi: { minHari?: number } = {},
): { ok: true } | { ok: false; alasan: string } {
  const minHari = opsi.minHari ?? MIN_HARI_SOMASI;
  if (!(data.hariTerlambat > 0)) {
    return {
      ok: false,
      alasan: "Pinjaman belum melewati jatuh tempo, jadi surat somasi belum dapat dibuat.",
    };
  }
  if (data.hariTerlambat < minHari) {
    return {
      ok: false,
      alasan: `Somasi baru dapat dibuat setelah keterlambatan ${minHari} hari. Saat ini ${data.hariTerlambat} hari.`,
    };
  }
  if (data.totalKewajiban === null || data.totalKewajiban <= 0) {
    return {
      ok: false,
      alasan: "Kewajiban pinjaman ini belum bisa dihitung, jadi surat somasi belum dapat dibuat.",
    };
  }
  return { ok: true };
}

/** Nomor surat: SOMASI/<referensi>/<YYYYMMDD> menurut kalender WIB. */
export function nomorSuratSomasi(nomorReferensi: string, sekarang: number): string {
  const referensi = nomorReferensi.trim().replace(/[^A-Za-z0-9-]/g, "-") || "PINDAI";
  return `SOMASI/${referensi}/${kodeTanggalWIB(sekarang)}`;
}

/** Nama berkas PDF; nomor referensi dipertahankan supaya mudah dicari. */
export function namaBerkasSomasi(surat: SuratSomasi): string {
  const referensi = surat.nomorSurat.split("/")[1] ?? "PINDAI";
  return `PINDAI-Somasi-${referensi}.pdf`;
}

/**
 * Susun isi surat. Pemanggil WAJIB melewati `cekSomasi` lebih dulu; fungsi ini
 * tidak mengulang pemeriksaan bisnis, hanya menyusun kalimat dari angka yang
 * sudah dihitung server.
 */
export function susunSuratSomasi(
  data: DataSuratSomasi,
  opsi: OpsiSuratSomasi,
): SuratSomasi {
  const batasHari = opsi.batasHari ?? BATAS_BAYAR_HARI;
  const batasBayarPada = opsi.sekarang + batasHari * HARI_MS;
  const tanggalTeks = formatTanggalWIB(opsi.sekarang);
  const jatuhTempoTeks = formatTanggalWIB(data.jatuhTempoPada);
  const batasBayarTeks = formatTanggalWIB(batasBayarPada);
  const ref = data.nomorReferensi;
  const namaBadan = data.identitas.namaBadan.trim() || "PINDAI";

  // Baris bunga/biaya adalah selisih yang tersisa setelah pokok berjalan dan
  // denda. Dengan begitu jumlah baris di surat selalu sama dengan total yang
  // ditagih, termasuk untuk pinjaman yang sudah diperpanjang.
  const bungaBiaya = data.totalKewajiban - data.pokokBerjalan - data.dendaTerlambat;
  const tarifDenda = data.persenDendaPerHari;
  const hariBatasDenda = tarifDenda > 0 ? Math.floor(100 / tarifDenda) : 0;
  const dendaKenaBatas = tarifDenda > 0 && data.hariTerlambat > hariBatasDenda;
  const labelDenda = `Denda keterlambatan (${data.hariTerlambat} hari${
    tarifDenda > 0
      ? dendaKenaBatas
        ? ", dibatasi 100% dari pokok"
        : `, ${tarifDenda}% dari pokok per hari`
      : ""
  })`;

  const rincian: BarisRincianSomasi[] = [
    { label: "Pokok pinjaman", nilai: formatRupiah(data.pokokBerjalan) },
  ];
  if (bungaBiaya > 0) {
    rincian.push({ label: "Bunga dan biaya tercatat", nilai: formatRupiah(bungaBiaya) });
  } else if (bungaBiaya < 0) {
    // Data lama yang tidak konsisten tidak disembunyikan: baris negatif membuat
    // selisihnya terlihat, dan jumlah baris tetap sama dengan total.
    rincian.push({ label: "Penyesuaian tercatat", nilai: formatRupiah(bungaBiaya) });
  }
  rincian.push(
    { label: labelDenda, nilai: formatRupiah(data.dendaTerlambat) },
    { label: "Total yang harus dibayar", nilai: formatRupiah(data.totalKewajiban) },
  );

  const instruksiBayar: string[] = [];
  if (data.rekening !== null) {
    const tujuan =
      data.rekening.bank.trim() === ""
        ? data.rekening.nomor
        : `${data.rekening.bank} ${data.rekening.nomor}`;
    instruksiBayar.push(
      `Transfer ke rekening usaha ${tujuan} atas nama ${data.rekening.nama}.`,
    );
    instruksiBayar.push(
      `Cantumkan nomor referensi ${ref} pada berita transfer agar pembayaran mudah dicocokkan.`,
    );
    instruksiBayar.push(
      "Simpan bukti transfer dan unggah melalui menu Bantuan di aplikasi agar pembayaran dicatat petugas.",
    );
  } else {
    instruksiBayar.push(
      "Hubungi petugas melalui menu Bantuan di aplikasi untuk memperoleh instruksi pembayaran yang berlaku.",
    );
    instruksiBayar.push(
      `Sebutkan nomor referensi ${ref} saat menghubungi petugas agar catatan pinjaman Anda ditemukan.`,
    );
  }

  const kontakResmi: string[] = [];
  if (data.identitas.email.trim() !== "") {
    kontakResmi.push(`Email resmi: ${data.identitas.email.trim()}.`);
  }
  if (data.identitas.telepon.trim() !== "") {
    kontakResmi.push(`Telepon resmi: ${data.identitas.telepon.trim()}.`);
  }

  return {
    nomorSurat: nomorSuratSomasi(ref, opsi.sekarang),
    perihal: "Somasi keterlambatan pembayaran pinjaman",
    tanggalTeks,
    batasBayarPada,
    batasBayarTeks,
    kepada: data.namaPeminjam,
    paragraf: [
      `Dengan hormat, kami menyampaikan pemberitahuan keterlambatan pembayaran pinjaman ${ref} atas nama ${data.namaPeminjam}.`,
      `Berdasarkan catatan internal ${namaBadan}, pinjaman ini telah melewati jatuh tempo pada ${jatuhTempoTeks} dan belum tercatat lunas sampai surat ini dibuat pada ${tanggalTeks}. Keterlambatan tercatat ${data.hariTerlambat} hari.`,
      "Rincian kewajiban pada saat surat ini dibuat adalah sebagai berikut.",
    ],
    rincian,
    instruksiBayar,
    penutup: [
      `Kami meminta Anda menyelesaikan total kewajiban tersebut paling lambat ${batasBayarTeks} (${batasHari} hari kalender sejak tanggal surat).`,
      "Bila batas waktu tersebut terlewati tanpa pembayaran atau kesepakatan tertulis, keterlambatan tetap tercatat dan kami akan menempuh langkah penyelesaian sesuai perjanjian pinjaman dan ketentuan yang berlaku. Kami tetap membuka ruang pembicaraan untuk penjadwalan ulang pembayaran.",
      `Tanggapan, sanggahan, atau pengaduan dapat disampaikan melalui menu Bantuan di aplikasi ${namaBadan}.${
        kontakResmi.length > 0 ? ` ${kontakResmi.join(" ")}` : ""
      }`,
      "Surat ini dibuat berdasarkan catatan internal dan bukan putusan pengadilan. Surat ini tidak mengurangi hak Anda untuk menyampaikan sanggahan atau pengaduan.",
      `${namaBadan} tidak pernah meminta kode OTP, PIN, atau kata sandi melalui WhatsApp maupun email.`,
    ],
    pembuat: `Tim Penagihan ${namaBadan}`,
    dibuatPada: opsi.sekarang,
    hariTerlambat: data.hariTerlambat,
    totalKewajiban: data.totalKewajiban,
    identitas: data.identitas,
  };
}

/** Surat versi teks biasa: untuk disalin petugas atau dibaca tanpa PDF. */
export function teksSomasi(surat: SuratSomasi): string {
  const baris: string[] = [
    surat.identitas.namaBadan || "PINDAI",
    "SURAT SOMASI",
    `Nomor: ${surat.nomorSurat}`,
    `Tanggal: ${surat.tanggalTeks}`,
    "",
    `Kepada: ${surat.kepada}`,
    `Perihal: ${surat.perihal}`,
    "",
    ...surat.paragraf.flatMap((p) => [p, ""]),
    "Rincian kewajiban",
    ...surat.rincian.map((r) => `${r.label}: ${r.nilai}`),
    "",
    "Cara pembayaran",
    ...surat.instruksiBayar.map((i, n) => `${n + 1}. ${i}`),
    "",
    ...surat.penutup.flatMap((p) => [p, ""]),
    surat.pembuat,
  ];
  return baris.join("\n").trim();
}

/** Pesan WhatsApp ringkas: cukup untuk tahu ada somasi dan batas bayarnya. */
export function teksSomasiWhatsapp(surat: SuratSomasi): string {
  const baris: string[] = [
    `SOMASI ${surat.nomorSurat}`,
    "",
    `Halo ${surat.kepada}, pinjaman Anda tercatat terlambat ${surat.hariTerlambat} hari.`,
    `Total kewajiban saat surat dibuat: ${formatRupiah(surat.totalKewajiban)}.`,
    `Batas pembayaran: ${surat.batasBayarTeks}.`,
    "",
    "Cara pembayaran:",
    ...surat.instruksiBayar.map((i, n) => `${n + 1}. ${i}`),
    "",
    "Surat somasi lengkap kami lampirkan sebagai berkas PDF. Tanggapan dapat disampaikan melalui menu Bantuan di aplikasi.",
    "Kami tidak pernah meminta kode OTP, PIN, atau kata sandi melalui WhatsApp.",
  ];
  return baris.join("\n");
}

export function subjekSomasiEmail(surat: SuratSomasi): string {
  return `Somasi keterlambatan pinjaman ${surat.nomorSurat.split("/")[1] ?? ""} - ${
    surat.identitas.namaBadan || "PINDAI"
  }`;
}

function esc(teks: string): string {
  return teks
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Badan email: isi surat terbaca walau lampiran tidak dibuka. */
export function htmlSomasiEmail(surat: SuratSomasi): string {
  const namaBadan = surat.identitas.namaBadan || "PINDAI";
  const identitas = [surat.identitas.alamat, surat.identitas.email, surat.identitas.telepon]
    .map((baris) => baris.trim())
    .filter((baris) => baris !== "");

  const rincian = surat.rincian
    .map(
      (r, indeks) => `
      <tr>
        <td style="padding:7px 12px;border-bottom:1px solid #eae5da;font:${indeks === surat.rincian.length - 1 ? "700" : "400"} 13px/1.5 Arial,sans-serif;color:#1c1a15">${esc(r.label)}</td>
        <td align="right" style="padding:7px 12px;border-bottom:1px solid #eae5da;font:${indeks === surat.rincian.length - 1 ? "700" : "400"} 13px/1.5 Arial,sans-serif;color:#1c1a15;white-space:nowrap">${esc(r.nilai)}</td>
      </tr>`,
    )
    .join("");

  const paragraf = surat.paragraf
    .map(
      (p) =>
        `<p style="margin:0 0 10px;font:400 14px/1.6 Arial,sans-serif;color:#1c1a15">${esc(p)}</p>`,
    )
    .join("");
  const instruksi = surat.instruksiBayar
    .map((i) => `<li style="margin-bottom:4px">${esc(i)}</li>`)
    .join("");
  const penutup = surat.penutup
    .map(
      (p) =>
        `<p style="margin:0 0 8px;font:400 12px/1.6 Arial,sans-serif;color:#4a453c">${esc(p)}</p>`,
    )
    .join("");

  return `<!doctype html>
<html lang="id">
<body style="margin:0;padding:24px;background:#f6f3ec">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #c9a86a">
    <tr>
      <td style="padding:24px 24px 8px">
        <p style="margin:0;font:700 18px/1.3 Georgia,serif;color:#1c1a15">${esc(namaBadan)}</p>
        <p style="margin:4px 0 0;font:400 13px/1.5 Arial,sans-serif;color:#6b6257">Surat somasi ${esc(surat.nomorSurat)}</p>
      </td>
    </tr>
    <tr>
      <td style="padding:8px 24px 0">
        <p style="margin:0 0 4px;font:400 12px/1.5 Arial,sans-serif;color:#6b6257">Tanggal ${esc(surat.tanggalTeks)}</p>
        <p style="margin:0 0 4px;font:400 12px/1.5 Arial,sans-serif;color:#6b6257">Kepada ${esc(surat.kepada)}</p>
        <p style="margin:0 0 14px;font:400 12px/1.5 Arial,sans-serif;color:#6b6257">Perihal ${esc(surat.perihal)}</p>
        ${paragraf}
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;margin:0 0 14px">${rincian}</table>
        <p style="margin:0 0 6px;font:600 11px/1.4 Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#6b6257">Cara pembayaran</p>
        <ol style="margin:0 0 16px;padding-left:18px;font:400 13px/1.6 Arial,sans-serif;color:#1c1a15">${instruksi}</ol>
        ${penutup}
        <p style="margin:18px 0 0;font:700 13px/1.5 Arial,sans-serif;color:#1c1a15">${esc(surat.pembuat)}</p>
      </td>
    </tr>
    <tr>
      <td style="padding:16px 24px 24px">
        <p style="margin:0;font:400 10px/1.5 Arial,sans-serif;color:#8a8377">${identitas.map(esc).join(" · ")}</p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
