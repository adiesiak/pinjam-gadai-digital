/**
 * Pembuat teks e-contract (surat perjanjian) untuk pinjaman & gadai.
 * Teks dirender ke HTML untuk pratinjau dan cetak PDF via window.print().
 * Terminologi resmi: Peminjam, Pendana, Bunga/Imbal Hasil (tanpa kata
 * investor/investasi/ROI/return).
 */

import type { SimulasiBulanan } from "./bulanan";
import { quoteGadai } from "./gadai";
import { formatRupiah } from "./money";
import type { LoanQuote } from "./loan";

/** Naikkan versi setiap kali syarat akad berubah secara material. */
export const CONTRACT_TERMS_VERSION = "v1.1";

export type ContractParty = {
  namaLengkap: string;
  namaBank?: string | null;
  nomorRekening: string;
  nik?: string | null;
  email?: string | null;
};

export type ContractMeta = {
  nomorReferensi: string;
  /** Titik koordinat & waktu tanda tangan/pengajuan. */
  lokasi?: { lat: number; lng: number } | null;
  timestampPada: number;
  /** Bukti persetujuan dan tanda tangan Peminjam yang sudah tersimpan. */
  tandaTanganPeminjam?: {
    dataUrl: string;
    tandaTanganPada: number;
    persetujuanSyaratPada: number;
  };
  /** Blok klausul khusus gadai. */
  gadai?: {
    deskripsiBarang: string;
    kategori: string;
    nilaiTaksiran: number;
    hargaPasar: number;
    ltvPersen: number;
    kodeRakVault: string;
    kondisiFisik: string;
    pokokGadai?: number;
    persenSewaModal?: number;
  };
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character] ?? character;
  });
}

export function judulContract(jenis: "pinjaman" | "gadai" | "pendanaan"): string {
  if (jenis === "pendanaan") return "SURAT PERJANJIAN PENDANAAN DIGITAL";
  return jenis === "pinjaman"
    ? "SURAT PERJANJIAN PINJAMAN DIGITAL"
    : "SURAT AKAD GADAI DIGITAL";
}

/** Nomor dokumen kontrak: PGC/PGA/PGD/<ref>/<yyyymmdd>. */
export function nomorContract(
  jenis: "pinjaman" | "gadai" | "pendanaan",
  nomorReferensi: string,
): string {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(
    d.getDate(),
  ).padStart(2, "0")}`;
  const prefix = jenis === "pinjaman" ? "PGC" : jenis === "gadai" ? "PGA" : "PGD";
  return `${prefix}/${nomorReferensi}/${ymd}`;
}

function fmtTanggal(ts: number): string {
  return new Date(ts).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function fmtKoordinat(lokasi?: { lat: number; lng: number } | null): string {
  if (!lokasi) return "tidak tersedia";
  return `${lokasi.lat.toFixed(5)}, ${lokasi.lng.toFixed(5)}`;
}

function blokTandaTanganPeminjam(
  nama: string,
  peran: string,
  meta: ContractMeta,
): string {
  const bukti = meta.tandaTanganPeminjam;
  const tampilanTandaTangan = bukti
    ? `<img class="signature" src="${escapeHtml(bukti.dataUrl)}" alt="Tanda tangan Peminjam"/>`
    : `<div class="signature-placeholder">Menunggu tanda tangan Peminjam</div>`;
  const statusPersetujuan = bukti
    ? `Persetujuan syarat dan tanda tangan dicatat ${new Date(bukti.persetujuanSyaratPada).toLocaleString("id-ID")} · ${CONTRACT_TERMS_VERSION}.`
    : "Dokumen ini belum disetujui atau ditandatangani Peminjam.";

  return `<div>
    ${tampilanTandaTangan}
    <p class="garis">${escapeHtml(nama)}</p>
    <p>${escapeHtml(peran)}</p>
    <p class="persetujuan">${escapeHtml(statusPersetujuan)}</p>
  </div>`;
}

function blokPlatform(): string {
  return `<div>
    <div class="signature-placeholder">Ruang tanda tangan Platform</div>
    <p class="garis">Pinjam Gadai Digital</p>
    <p>Platform</p>
  </div>`;
}

/** Catatan yang berlaku untuk kontrak pinjaman dan gadai. */
function blokBatasTransaksi(): string {
  return `<p><strong>Catatan penggunaan:</strong> Dokumen ini merekam data dan persetujuan yang dimasukkan ke aplikasi PINDAI serta perhitungan pada ledger internal. Dokumen/status aplikasi ini bukan bukti transfer atau penerimaan dana, pembayaran ke merchant, penyerahan/penitipan/pengembalian barang, verifikasi Pendana atau pihak lain, maupun bukti izin dan kepatuhan hukum. Transfer, penyerahan barang, status perizinan, dan keabsahan perjanjian perlu diverifikasi secara terpisah.</p>`;
}

/**
 * Rangkai teks HTML perjanjian pinjaman.
 *
 * Dua skema didukung: harian (130%, potongan 5% di muka) dan bulanan
 * (DP 0%, biaya layanan 3% diamortisasi, bunga menurun). Bila `bulanan`
 * diisi, rincian Pasal 1–3 mengikuti skema bulanan sehingga angka pada
 * akad selalu sama dengan engine lib/bulanan.ts.
 */
export function buildPinjamanContract(
  peminjam: ContractParty,
  quote: LoanQuote,
  meta: ContractMeta,
  tenorHari: number,
  /** Simulasi skema bulanan — kosong berarti skema harian. */
  bulanan: SimulasiBulanan | null = null,
): string {
  const tgl = fmtTanggal(meta.timestampPada);
  const pasalTenor =
    bulanan === null
      ? `<li>Tenor perhitungan simulasi: <strong>${tenorHari} hari</strong> sejak tanggal status pendanaan dicatat di aplikasi.</li>`
      : `<li>Tenor perhitungan simulasi: <strong>${bulanan.tenorBulan} bulan</strong> (1 bulan = 30 hari) sejak tanggal status pendanaan dicatat di aplikasi.</li>`;
  const pasalFinansial =
    bulanan === null
      ? `
      <li>Biaya admin: ${formatRupiah(quote.biayaAdmin)}.</li>
      <li>Biaya platform: ${formatRupiah(quote.biayaPlatform)}.</li>
      <li>Total potongan di muka: ${formatRupiah(quote.totalPotonganDiMuka)}.</li>
      <li><strong>Perhitungan dana bersih pada simulasi: ${formatRupiah(quote.danaBersihDitransfer)} (95% dari pokok)</strong>; bukan bukti dana ditransfer atau diterima.</li>
      <li>Bunga: ${formatRupiah(quote.bunga)}.</li>
      <li><strong>Total kewajiban pelunasan: ${formatRupiah(quote.totalKewajibanPelunasan)} (130% dari pokok)</strong>.</li>`
      : `
      <li>Uang muka (DP): ${formatRupiah(bulanan.dp)} — 0% sehingga seluruh pokok dibiayai.</li>
      <li>Biaya layanan platform 3% dari pokok: ${formatRupiah(bulanan.biayaLayananTotal)}, diamortisasi rata ${formatRupiah(bulanan.biayaLayananPerBulan)} per bulan.</li>
      <li><strong>Perhitungan dana bersih pada simulasi: ${formatRupiah(bulanan.pokokDibiayai)} (100% pokok, tanpa potongan di muka)</strong>; bukan bukti dana ditransfer atau diterima.</li>
      <li>Bunga/margin menurun: ${bulanan.persenBungaPerBulan}% per bulan dari pokok; total bunga ${formatRupiah(bulanan.bungaTotal)}.</li>
      <li><strong>Ilustrasi cicilan ${formatRupiah(bulanan.cicilanPerBulan)} per bulan selama ${bulanan.tenorBulan} bulan; total simulasi: ${formatRupiah(bulanan.totalPengembalian)}</strong>. Jadwal bulanan hanya ilustrasi; aplikasi saat ini mencatat pelunasan penuh sekaligus pada akhir tenor, bukan cicilan bulanan atau pembayaran sebagian.</li>`;
  const pasalKewajiban =
    bulanan === null
      ? `Dalam simulasi ini, pelunasan penuh dicatat sekaligus paling lambat pada hari ke-${tenorHari} dari tanggal status pendanaan dicatat. Aplikasi tidak memproses atau memverifikasi transfer uang. Denda keterlambatan yang ditampilkan merupakan perhitungan ledger internal sesuai ketentuan yang terlihat di aplikasi.`
      : `Jadwal cicilan bulanan merupakan ilustrasi perhitungan, bukan jadwal pembayaran yang dapat diproses aplikasi. Sistem saat ini hanya mencatat pelunasan penuh sekaligus pada akhir tenor ${bulanan.tenorBulan} bulan; tidak ada pencatatan cicilan sebagian. Denda keterlambatan yang ditampilkan merupakan perhitungan ledger internal sesuai ketentuan yang terlihat di aplikasi.`;
  return `
  <div class="contract">
    <h1>${judulContract("pinjaman")}</h1>
    <p class="nomor">Nomor: ${escapeHtml(nomorContract("pinjaman", meta.nomorReferensi))} · Syarat ${CONTRACT_TERMS_VERSION}</p>
    ${blokBatasTransaksi()}

    <p>Dokumen catatan pinjaman ini dibuat pada tanggal <strong>${tgl}</strong> antara:</p>
    <p><strong>PINJAM GADAI DIGITAL ("Platform")</strong> — aplikasi untuk pengajuan dan pencatatan internal;</p>
    <p>dan</p>
    <p><strong>${escapeHtml(peminjam.namaLengkap.toUpperCase())} ("Peminjam")</strong>${peminjam.nik ? `, NIK ${escapeHtml(peminjam.nik)}` : ""}${peminjam.email ? `, email ${escapeHtml(peminjam.email)}` : ""}, bank/e-wallet dan rekening/akun tujuan yang dicatat: <strong>${peminjam.namaBank ? `${escapeHtml(peminjam.namaBank)} · ` : ""}${escapeHtml(peminjam.nomorRekening)}</strong>. Data tujuan bukan bukti transfer.</p>

    <h2>Pasal 1 — Objek Pendanaan</h2>
    <ol>
      <li>Pokok pinjaman: <strong>${formatRupiah(quote.pokok)}</strong>.</li>
      ${pasalTenor}
      <li>Status pendanaan yang tampil di aplikasi merupakan pencatatan internal dan tidak memverifikasi identitas atau sumber dana Pendana maupun terjadinya transfer.</li>
    </ol>

    <h2>Pasal 2 — Rincian Keuangan</h2>
    <ol>${pasalFinansial}
    </ol>

    <h2>Pasal 3 — Catatan Pelunasan</h2>
    <p>${pasalKewajiban}</p>

    <h2>Pasal 4 — Persetujuan Syarat dan Ketentuan</h2>
    <p>Peminjam menyatakan telah membaca dan memeriksa rincian pinjaman, biaya, tenor, serta kewajiban pada dokumen ini, dan menyetujui syarat dan ketentuan yang tercantum. Persetujuan dicatat dengan versi <strong>${CONTRACT_TERMS_VERSION}</strong>.</p>

    <h2>Pasal 5 — Catatan Persetujuan Digital</h2>
    <p>Persetujuan dan tanda tangan Peminjam direkam melalui kanvas digital dengan timestamp sistem <strong>${new Date(meta.timestampPada).toLocaleString("id-ID")}</strong>${meta.lokasi ? ` dan koordinat pengajuan <strong>${fmtKoordinat(meta.lokasi)}</strong>` : ""}. Catatan ini merekam tindakan pada aplikasi dan tidak dengan sendirinya memverifikasi identitas penanda tangan.</p>

    <div class="ttd">
      ${blokTandaTanganPeminjam(peminjam.namaLengkap, "Peminjam", meta)}
      ${blokPlatform()}
    </div>
  </div>`;
}

/** Rangkai teks HTML akad gadai. */
export function buildGadaiContract(
  peminjam: ContractParty,
  gadai: NonNullable<ContractMeta["gadai"]>,
  meta: ContractMeta,
): string {
  const tgl = fmtTanggal(meta.timestampPada);
  const ltv = gadai.hargaPasar > 0 ? Math.round((gadai.nilaiTaksiran / gadai.hargaPasar) * 100) : 0;
  const quote =
    gadai.pokokGadai !== undefined && gadai.persenSewaModal !== undefined
      ? quoteGadai(gadai.pokokGadai, gadai.persenSewaModal)
      : null;
  const rincianPokok =
    quote === null
      ? `<li>Pokok gadai dan sewa modal belum ditetapkan pada saat dokumen ini dibuat; angka final perlu diperiksa pada tahap pendanaan.</li>`
      : `<li>Pokok gadai: <strong>${formatRupiah(quote.pokok)}</strong>.</li>
      <li>Potongan muka 1%: ${formatRupiah(quote.potonganDiMuka)}; dana bersih 99%: <strong>${formatRupiah(quote.danaBersihDitransfer)}</strong>.</li>
      <li>Sewa modal ${gadai.persenSewaModal}% per 30 hari dari sisa pokok; perkiraan periode pertama ${formatRupiah(quote.sewaModalPeriode)}. Pembayaran berikutnya mengikuti sisa pokok.</li>`;

  return `
  <div class="contract">
    <h1>${judulContract("gadai")}</h1>
    <p class="nomor">Nomor: ${escapeHtml(nomorContract("gadai", meta.nomorReferensi))} · Syarat ${CONTRACT_TERMS_VERSION}</p>

    ${blokBatasTransaksi()}
    <p>Dokumen catatan gadai ini dibuat pada tanggal <strong>${tgl}</strong> antara:</p>
    <p><strong>PINJAM GADAI DIGITAL ("Platform")</strong> — aplikasi untuk pengajuan dan pencatatan internal gadai;</p>
    <p>dan</p>
    <p><strong>${escapeHtml(peminjam.namaLengkap.toUpperCase())} ("Penggadai/Peminjam")</strong>${peminjam.nik ? `, NIK ${escapeHtml(peminjam.nik)}` : ""}, bank/e-wallet dan rekening/akun tujuan yang dicatat: <strong>${peminjam.namaBank ? `${escapeHtml(peminjam.namaBank)} · ` : ""}${escapeHtml(peminjam.nomorRekening)}</strong>. Data tujuan bukan bukti transfer.</p>

    <h2>Pasal 1 — Objek Gadai</h2>
    <ol>
      <li>Deskripsi barang: <strong>${escapeHtml(gadai.deskripsiBarang)}</strong>.</li>
      <li>Kategori: ${escapeHtml(gadai.kategori)}.</li>
      <li>Kondisi fisik: ${escapeHtml(gadai.kondisiFisik || "dinilai petugas")}.</li>
      <li>Kode/referensi lokasi yang dicatat aplikasi: <strong>${escapeHtml(gadai.kodeRakVault)}</strong>. Kode ini bukan tanda terima atau bukti bahwa barang telah diterima maupun dititipkan secara fisik.</li>
    </ol>

    <h2>Pasal 2 — Penilaian, LTV, dan Rincian Pendanaan</h2>
    <ol>
      <li>Harga pasar: ${formatRupiah(gadai.hargaPasar)}.</li>
      <li>Nilai taksiran: <strong>${formatRupiah(gadai.nilaiTaksiran)}</strong> (LTV ${ltv}%, maksimum ${gadai.ltvPersen}%).</li>
      ${rincianPokok}
    </ol>

    <h2>Pasal 3 — Hak dan Kewajiban</h2>
    <ol>
      <li>Status, kondisi, dan kode lokasi dalam aplikasi adalah catatan internal; aplikasi tidak memverifikasi penerimaan, lokasi fisik, atau keamanan penyimpanan barang.</li>
      <li>Penyerahan, penitipan, dan pengembalian perlu dikonfirmasi langsung dengan pihak yang bertanggung jawab serta didukung tanda terima terpisah. Status lunas/siap diambil di aplikasi bukan bukti barang telah dikembalikan.</li>
      <li>Simulasi penyelesaian atau lelang di aplikasi bukan pelaksanaan lelang, keputusan hukum, maupun jaminan hasil/ pengembalian barang.</li>
    </ol>

    <h2>Pasal 4 — Persetujuan Syarat dan Ketentuan</h2>
    <p>Peminjam menyatakan telah membaca dan memeriksa data barang, nilai taksiran, serta rincian pokok dan sewa modal yang tersedia pada dokumen ini, dan menyetujui syarat dan ketentuan yang tercantum. Persetujuan dicatat dengan versi <strong>${CONTRACT_TERMS_VERSION}</strong>.</p>

    <h2>Pasal 5 — Catatan Persetujuan Digital</h2>
    <p>Persetujuan dan tanda tangan Peminjam direkam melalui kanvas digital dengan timestamp sistem <strong>${new Date(meta.timestampPada).toLocaleString("id-ID")}</strong>. Catatan ini merekam tindakan pada aplikasi dan tidak dengan sendirinya memverifikasi identitas penanda tangan.</p>

    <div class="ttd">
      ${blokTandaTanganPeminjam(peminjam.namaLengkap, "Penggadai / Peminjam", meta)}
      ${blokPlatform()}
    </div>
  </div>`;
}
