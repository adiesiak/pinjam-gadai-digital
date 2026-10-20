/**
 * Pembuat catatan pengajuan pinjaman & gadai pada aplikasi.
 * HTML memuat para pihak, ketentuan pokok, dan blok tanda tangan kedua pihak.
 */

import type { SimulasiBulanan } from "./bulanan";
import { quoteGadai } from "./gadai";
import { formatRupiah } from "./money";
import { namaHurufBesar } from "./nama";
import { LATE_FEE_POLICY, type LoanQuote } from "./loan";

/** Naikkan versi setiap kali syarat akad berubah secara material. */
export const CONTRACT_TERMS_VERSION = "v1.4";

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
  /** Catatan checkbox dan gambar tanda tangan yang tersimpan di aplikasi. */
  tandaTanganPeminjam?: {
    dataUrl: string;
    tandaTanganPada?: number | null;
    persetujuanSyaratPada?: number | null;
    persetujuanSyaratVersi?: string | null;
  };
  /**
   * Sidik jari dokumen dari server (tabel `kontrakDigital`). Kosong berarti
   * kontrak belum/tidak memiliki kode verifikasi — mis. data lama yang
   * ditandatangani sebelum fitur ini ada.
   */
  verifikasi?: {
    kode: string;
    hash: string;
    diterbitkanPada: number;
    url: string;
    /** QR data URL; kosong = QR belum selesai dibuat di klien. */
    qrDataUrl?: string | null;
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
  if (jenis === "pendanaan") return "SURAT KESEPAKATAN ALOKASI PENDANAAN";
  return jenis === "pinjaman"
    ? "SURAT PERJANJIAN PINJAMAN"
    : "SURAT PERJANJIAN GADAI";
}

/** Nomor referensi catatan aplikasi: PGC/PGA/PGD/<ref>/<yyyymmdd>. */
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
    ? `<img class="signature" src="${escapeHtml(bukti.dataUrl)}" alt="Gambar tanda tangan yang dicatat aplikasi"/>`
    : `<div class="signature-placeholder">Belum ada gambar tanda tangan yang dicatat</div>`;

  return `<div>
    <div class="ttd-slot">${tampilanTandaTangan}</div>
    <p class="garis">${escapeHtml(nama)}</p>
    <p>${escapeHtml(peran)}</p>
  </div>`;
}

/**
 * Logo perisai (shield) dengan gembok — ikon resmi PINDAI pada KOP dokumen.
 * SVG inline (bukan berkas eksternal) supaya tetap muncul di pratinjau iframe
 * yang di-sandbox maupun saat dokumen dicetak/diunduh PDF.
 */
const LOGO_SHIELD_SVG = `<svg class="kop-logo" viewBox="0 0 32 32" role="img" aria-label="Logo PINDAI" xmlns="http://www.w3.org/2000/svg">
  <path d="M16 2.6 4.6 6.9v8c0 7 4.7 12.6 11.4 14.5 6.7-1.9 11.4-7.5 11.4-14.5v-8L16 2.6Z" fill="none" stroke="currentColor" stroke-width="2"/>
  <rect x="11.4" y="14.2" width="9.2" height="8" rx="1.6" fill="none" stroke="currentColor" stroke-width="2"/>
  <path d="M13.4 14.2v-2.3a2.6 2.6 0 0 1 5.2 0v2.3" fill="none" stroke="currentColor" stroke-width="2"/>
</svg>`;

/**
 * Stempel digital PINDAI berbentuk bulat dengan teks melingkar. Warna diambil
 * dari `currentColor` (`.stamp-bulat` → merah bata) supaya stempel terasa
 * seperti cap fisik namun tetap bersih saat dicetak.
 */
const STAMP_BULAT_SVG = `<svg class="stamp-bulat" viewBox="0 0 120 120" role="img" aria-label="Stempel verifikasi ledger PINDAI" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  <defs><path id="pindai-stamp-ring" d="M60,60 m-45,0 a45,45 0 1,1 90,0 a45,45 0 1,1 -90,0"/></defs>
  <circle cx="60" cy="60" r="57" fill="none" stroke="currentColor" stroke-width="2"/>
  <circle cx="60" cy="60" r="40" fill="none" stroke="currentColor" stroke-width="1"/>
  <text><textPath href="#pindai-stamp-ring" xlink:href="#pindai-stamp-ring" startOffset="50%" text-anchor="middle">VERIFIED LEDGER · PINDAI DIGITAL STAMP</textPath></text>
  <text class="kecil" x="60" y="57" text-anchor="middle">PINDAI</text>
  <text class="kecil" x="60" y="69" text-anchor="middle">E-SIGN</text>
</svg>`;

/** Blok tanda tangan Platform (Pihak Pertama) memakai stempel bulat PINDAI. */
function blokPlatform(): string {
  return `<div>
    <div class="ttd-slot">${STAMP_BULAT_SVG}</div>
    <p class="garis">Pinjam Gadai Digital</p>
    <p>PINDAI — Pihak Pertama</p>
  </div>`;
}

/**
 * KOP surat: logo + identitas PINDAI di kiri, badge versi syarat + nomor
 * referensi dokumen di kanan. Dipakai oleh surat perjanjian pinjaman & gadai.
 */
function kopSurat(jenis: "pinjaman" | "gadai" | "pendanaan", meta: ContractMeta): string {
  return `<header class="kop">
    <div class="kop-kiri">
      ${LOGO_SHIELD_SVG}
      <div>
        <p class="kop-judul">PINJAM GADAI DIGITAL (PINDAI)</p>
        <p class="kop-sub">Platform Layanan Keuangan &amp; Ledger Digital</p>
      </div>
    </div>
    <div class="kop-kanan">
      <span class="kop-badge">Syarat ${CONTRACT_TERMS_VERSION}</span>
      <span class="kop-ref">Ref: ${escapeHtml(nomorContract(jenis, meta.nomorReferensi))}</span>
    </div>
  </header>`;
}

/**
 * Blok verifikasi: kode, hash, waktu terbit, dan QR ke halaman publik.
 *
 * Kode dan hash berasal dari server; yang dicetak di sini hanyalah salinannya.
 * Halaman verifikasi menampilkan hash yang tersimpan, sehingga pembaca bisa
 * membandingkan keduanya tanpa mempercayai berkas PDF itu sendiri.
 */
function blokVerifikasi(meta: ContractMeta): string {
  const v = meta.verifikasi;
  if (!v) return "";
  const waktu = new Date(v.diterbitkanPada).toLocaleString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const qr = v.qrDataUrl
    ? `<img class="verif-qr" src="${escapeHtml(v.qrDataUrl)}" alt="QR halaman verifikasi dokumen"/>`
    : `<div class="verif-qr verif-qr-kosong">QR</div>`;
  return `<section class="verif">
    ${qr}
    <div class="verif-teks">
      <p class="verif-judul">Verifikasi keaslian dokumen</p>
      <p>Kode <span class="verif-kode">${escapeHtml(v.kode)}</span> · diterbitkan ${escapeHtml(waktu)} (WIB)</p>
      <p class="verif-hash">SHA-256 ${escapeHtml(v.hash)}</p>
      <p>Pindai QR atau buka ${escapeHtml(v.url)}. Cocokkan hash di halaman itu dengan hash pada dokumen ini.</p>
    </div>
  </section>`;
}

/** Footer legal dokumen — tampil di dasar setiap surat perjanjian. */
function footerDokumen(): string {
  return `<footer class="footer-dok">
    <span>Dokumen ini sah dan diterbitkan secara elektronik melalui sistem pencatatan internal PT Pinjam Gadai Digital (PINDAI).</span>
    <span>Legalitas &amp; Verifikasi: support@pindai.biz.id | pindai.biz.id</span>
  </footer>`;
}

/** Tabel rincian keuangan (garis tipis) untuk skema harian. */
function rincianKeuanganHarian(quote: LoanQuote): string {
  return `<table class="rincian">
    <thead>
      <tr><th>Komponen</th><th style="text-align:right">Nominal</th></tr>
    </thead>
    <tbody>
      <tr><td>Pokok pinjaman</td><td class="angka">${formatRupiah(quote.pokok)}</td></tr>
      <tr><td>Potongan admin (2%)</td><td class="angka">${formatRupiah(quote.biayaAdmin)}</td></tr>
      <tr><td>Biaya platform</td><td class="angka">${formatRupiah(quote.biayaPlatform)}</td></tr>
      <tr><td>Biaya pencairan ekspres</td><td class="angka">${formatRupiah(quote.biayaExpress)}</td></tr>
      <tr><td>Total potongan di muka</td><td class="angka">${formatRupiah(quote.totalPotonganDiMuka)}</td></tr>
      <tr><td>Dana bersih diterima</td><td class="angka">${formatRupiah(quote.danaBersihDitransfer)}</td></tr>
      <tr><td>Bunga</td><td class="angka">${formatRupiah(quote.bunga)}</td></tr>
      <tr class="total"><td>Total kewajiban (pokok + bunga)</td><td class="angka">${formatRupiah(quote.totalKewajibanPelunasan)}</td></tr>
    </tbody>
  </table>`;
}

/** Tabel rincian keuangan (garis tipis) untuk skema bulanan. */
function rincianKeuanganBulanan(bulanan: SimulasiBulanan): string {
  return `<table class="rincian">
    <thead>
      <tr><th>Komponen</th><th style="text-align:right">Nominal</th></tr>
    </thead>
    <tbody>
      <tr><td>Pokok acuan</td><td class="angka">${formatRupiah(bulanan.pokokDibiayai)}</td></tr>
      <tr><td>Uang muka (0%)</td><td class="angka">${formatRupiah(bulanan.dp)}</td></tr>
      <tr><td>Potongan di muka (2%)</td><td class="angka">${formatRupiah(bulanan.potonganDiMuka)}</td></tr>
      <tr><td>Dana bersih diterima</td><td class="angka">${formatRupiah(bulanan.danaDiterima)}</td></tr>
      <tr><td>Bunga/margin total (${bulanan.persenBungaPerBulan}%/bulan, flat)</td><td class="angka">${formatRupiah(bulanan.bungaTotal)}</td></tr>
      ${bulanan.biayaAdminCicilanTotal > 0 ? `<tr><td>Biaya admin cicilan 2% (${bulanan.tenorBulan} kali bayar)</td><td class="angka">${formatRupiah(bulanan.biayaAdminCicilanTotal)}</td></tr>` : ""}
      <tr class="total"><td>Total pengembalian (${bulanan.tenorBulan} bulan)</td><td class="angka">${formatRupiah(bulanan.totalPengembalian)}</td></tr>
    </tbody>
  </table>`;
}

/** Blok para pihak yang dipakai perjanjian pinjaman dan gadai. */
function blokParaPihak(): string {
  return `<p><strong>Para Pihak:</strong> Perjanjian ini dibuat dan disetujui oleh <strong>Pinjam Gadai Digital (PINDAI)</strong> sebagai Pihak Pertama dan pihak yang datanya tercantum di bawah sebagai Pihak Kedua. Nilai, jadwal, dan setiap perubahan status mengikuti pencatatan pada ledger internal aplikasi. Pencairan dana, pembayaran ke merchant, serta inspeksi, penyerahan, dan penitipan barang ditangani di luar aplikasi.</p>`;
}

/**
 * Rangkai HTML ringkasan pengajuan pinjaman pada ledger internal.
 *
 * Dua skema didukung: harian (pokok + bunga, potongan 2% di muka) dan bulanan
 * (DP 0%, biaya dipotong di muka, bunga flat dari pokok penuh per tenor). Bila
 * `bulanan`
 * diisi, rincian mengikuti skema bulanan dan angka dari engine lib/bulanan.ts.
 */
export function buildPinjamanContract(
  peminjam: ContractParty,
  quote: LoanQuote,
  meta: ContractMeta,
  tenorHari: number,
  /** Ringkasan skema bulanan — kosong berarti skema harian. */
  bulanan: SimulasiBulanan | null = null,
  /** Tarif denda harian yang berlaku (% pokok); default kebijakan bawaan. */
  dendaPerHari: number = LATE_FEE_POLICY.percentPerDay,
): string {
  const dendaTeks = `Denda keterlambatan ${dendaPerHari}% per hari dari pokok, maksimum ${LATE_FEE_POLICY.maxPercent}%.`;
  const tgl = fmtTanggal(meta.timestampPada);
  const pasalTenor =
    bulanan === null
      ? `<li>Periode acuan: <strong>${tenorHari} hari</strong> sejak tanggal status alokasi dicatat di aplikasi.</li>`
      : `<li>Periode acuan: <strong>${bulanan.tenorBulan} bulan</strong> (1 bulan = 30 hari) sejak tanggal status alokasi dicatat di aplikasi.</li>`;
  const rincianBiayaBulanan =
    bulanan === null
      ? ""
      : (bulanan.tenorBulan === 3 || bulanan.tenorBulan === 6
          ? `<li>Biaya admin 2%: ${formatRupiah(bulanan.biayaAdminTotal)}.</li>
      <li>Total potongan di muka 2% (${formatRupiah(bulanan.biayaLayananTotal)}) dipotong di muka dari dana yang diterima — biaya platform dihapus (0%).</li>`
          : `<li>Biaya layanan 2% dari pokok acuan: ${formatRupiah(bulanan.biayaLayananTotal)}, dipotong di muka dari dana yang diterima.</li>`) +
        (bulanan.biayaAdminCicilanTotal > 0
          ? `<li>Biaya admin layanan cicilan 2% dari nominal cicilan: ${formatRupiah(bulanan.biayaAdminCicilanTotal)} selama ${bulanan.tenorBulan} bulan (bulan pertama ${formatRupiah(bulanan.biayaAdminCicilanPerBulan)}), dibayar bersama setiap cicilan.</li>`
          : "");
  const pasalFinansial =
    bulanan === null
      ? `
      <li>Biaya admin 2%: ${formatRupiah(quote.biayaAdmin)}.</li>
      <li>Biaya pencairan ekspres: ${formatRupiah(quote.biayaExpress)} (sekali, bukan bunga).</li>
      <li>Total potongan di muka: ${formatRupiah(quote.totalPotonganDiMuka)} (biaya platform dihapus — 0%).</li>
      <li><strong>Perhitungan dana bersih: ${formatRupiah(quote.danaBersihDitransfer)} (pokok setelah seluruh potongan di muka)</strong>; dana diteruskan sesuai proses pencairan.</li>
      <li>Bunga: ${formatRupiah(quote.bunga)}.</li>
      <li><strong>Total kewajiban: ${formatRupiah(quote.totalKewajibanPelunasan)} (pokok + bunga)</strong>; nominal mengikuti perhitungan aplikasi.</li>`
      : `
      <li>Uang muka: ${formatRupiah(bulanan.dp)} — 0% dari pokok acuan.</li>
      ${rincianBiayaBulanan}
      <li><strong>Dana bersih yang diterima: ${formatRupiah(bulanan.danaDiterima)} (pokok ${formatRupiah(bulanan.pokokDibiayai)} setelah potongan di muka ${formatRupiah(bulanan.potonganDiMuka)})</strong>; dana diteruskan sesuai proses pencairan.</li>
      <li>Bunga/margin sebesar ${bulanan.persenBungaPerBulan}% per bulan dari POKOK ACUAN (flat, tidak menurun dari sisa pokok); total ${formatRupiah(bulanan.bungaTotal)}.</li>
      <li><strong>Ilustrasi cicilan rata: bulan pertama ${formatRupiah(bulanan.cicilanPerBulan)}, bulan terakhir ${formatRupiah(bulanan.cicilanTerakhir)}; total ${formatRupiah(bulanan.totalPengembalian)} untuk ${bulanan.tenorBulan} bulan (sudah termasuk pokok, bunga, dan biaya admin cicilan).</strong> Rincian per bulan: ${bulanan.jadwal.map((angsuran) => `bulan ${angsuran.bulan} ${formatRupiah(angsuran.total)}`).join("; ")}. Jadwal bersifat ilustrasi; perubahan status lunas di aplikasi dicatat sebagai entri ledger.</li>`;
  const pasalKewajiban =
    bulanan === null
      ? `Kewajiban dilunasi dalam ${tenorHari} hari sejak tanggal pencairan. Pelunasan ditangani di luar aplikasi dan statusnya dicatat tim PINDAI pada ledger internal. ${dendaTeks}`
      : `Cicilan bulanan dibayar sesuai jadwal pada Pasal 2. Setiap perubahan status dicatat pada ledger internal aplikasi. ${dendaTeks}`;
  return `
  <div class="contract">
    ${kopSurat("pinjaman", meta)}
    <h1>${judulContract("pinjaman")}</h1>
    ${blokParaPihak()}

    <p>Perjanjian ini dibuat dan disetujui pada <strong>${tgl}</strong> atas data pengajuan yang tersimpan di aplikasi PINDAI.</p>
    <p><strong>Pihak Pertama:</strong> Pinjam Gadai Digital (PINDAI).</p>
    <p><strong>Pihak Kedua:</strong> ${escapeHtml(namaHurufBesar(peminjam.namaLengkap))}${peminjam.nik ? `, NIK ${escapeHtml(peminjam.nik)}` : ""}${peminjam.email ? `, email ${escapeHtml(peminjam.email)}` : ""}; informasi bank/e-wallet dan rekening/akun yang dimasukkan: <strong>${peminjam.namaBank ? `${escapeHtml(peminjam.namaBank)} · ` : ""}${escapeHtml(peminjam.nomorRekening)}</strong>. Data ini berasal dari pengisian pada pengajuan.</p>

    <h2>Pasal 1 — Pokok, Tenor, dan Status</h2>
    <ol>
      <li>Pokok pinjaman: <strong>${formatRupiah(quote.pokok)}</strong>.</li>
      ${pasalTenor}
      <li>Status pinjaman mengikuti pencatatan pada ledger internal aplikasi.</li>
    </ol>

    <h2>Pasal 2 — Biaya, Bunga, dan Total Kewajiban</h2>
    <ol>${pasalFinansial}
    </ol>
    <p><strong>Ringkasan rincian keuangan:</strong></p>
    ${bulanan === null ? rincianKeuanganHarian(quote) : rincianKeuanganBulanan(bulanan)}

    <h2>Pasal 3 — Cara dan Waktu Pelunasan</h2>
    <p>${pasalKewajiban}</p>

    <h2>Pasal 4 — Persetujuan dan Tanda Tangan</h2>
    <p>Persetujuan dinyatakan dengan menandai checkbox dan membubuhkan tanda tangan pada kanvas, dan dicatat aplikasi pada syarat versi <strong>${CONTRACT_TERMS_VERSION}</strong>.</p>

    <h2>Pasal 5 — Data, Lokasi, dan Waktu</h2>
    <p>Timestamp sistem <strong>${new Date(meta.timestampPada).toLocaleString("id-ID")}</strong>${meta.lokasi ? ` dan koordinat perangkat yang dikirim <strong>${fmtKoordinat(meta.lokasi)}</strong>` : ""} ditampilkan sebagai metadata masukan pengajuan.</p>

    <div class="ttd">
      ${blokTandaTanganPeminjam(namaHurufBesar(peminjam.namaLengkap), "Peminjam — Pihak Kedua", meta)}
      ${blokPlatform()}
    </div>
    ${blokVerifikasi(meta)}
    ${footerDokumen()}
  </div>`;
}

/** Rangkai HTML ringkasan pengajuan gadai pada ledger internal. */
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
      ? `<li>Pokok gadai dan sewa modal belum ditetapkan; belum ada hitungan yang dapat ditampilkan.</li>`
      : `<li>Pokok gadai: <strong>${formatRupiah(quote.pokok)}</strong>.</li>
      <li>Potongan 1%: ${formatRupiah(quote.potonganDiMuka)}; nilai bersih (99%): <strong>${formatRupiah(quote.danaBersihDitransfer)}</strong>; dana diteruskan sesuai proses pencairan.</li>
      <li>Perhitungan sewa modal ${gadai.persenSewaModal}% per 30 hari dari sisa pokok; ilustrasi periode pertama ${formatRupiah(quote.sewaModalPeriode)}; nominal mengikuti perhitungan aplikasi.</li>`;

  return `
  <div class="contract">
    ${kopSurat("gadai", meta)}
    <h1>${judulContract("gadai")}</h1>
    ${blokParaPihak()}
    <p>Akad ini dibuat dan disetujui pada <strong>${tgl}</strong> atas data pengajuan yang tersimpan di aplikasi PINDAI.</p>
    <p><strong>Pihak Pertama:</strong> Pinjam Gadai Digital (PINDAI).</p>
    <p><strong>Pihak Kedua:</strong> ${escapeHtml(namaHurufBesar(peminjam.namaLengkap))}${peminjam.nik ? `, NIK ${escapeHtml(peminjam.nik)}` : ""}; informasi rekening yang dimasukkan: <strong>${peminjam.namaBank ? `${escapeHtml(peminjam.namaBank)} · ` : ""}${escapeHtml(peminjam.nomorRekening)}</strong>. Data ini berasal dari pengisian pada pengajuan.</p>

    <h2>Pasal 1 — Data Barang dan Lokasi Penyimpanan</h2>
    <ol>
      <li>Deskripsi barang: <strong>${escapeHtml(gadai.deskripsiBarang)}</strong>.</li>
      <li>Kategori barang: ${escapeHtml(gadai.kategori)}.</li>
      <li>Catatan kondisi fisik: ${escapeHtml(gadai.kondisiFisik || "belum dicatat")}.</li>
      <li>Kode/referensi lokasi penyimpanan: <strong>${escapeHtml(gadai.kodeRakVault)}</strong>; dipakai sebagai acuan penyimpanan barang pada akad ini.</li>
    </ol>

    <h2>Pasal 2 — Nilai Taksiran dan Pokok Gadai</h2>
    <ol>
      <li>Harga pasar yang dicantumkan: ${formatRupiah(gadai.hargaPasar)}.</li>
      <li>Nilai taksiran: <strong>${formatRupiah(gadai.nilaiTaksiran)}</strong> (LTV ${ltv}%, batas aplikasi ${gadai.ltvPersen}%); nilai taksiran ditetapkan tim PINDAI.</li>
      ${rincianPokok}
    </ol>

    <h2>Pasal 3 — Penyimpanan dan Penyelesaian</h2>
    <ol>
      <li>Barang disimpan sesuai kode lokasi pada Pasal 1, dan serah terima barang dinyatakan dengan tanda terima terpisah.</li>
      <li>Pengembalian barang dilakukan setelah kewajiban dilunasi dan dikonfirmasi langsung dengan petugas PINDAI. Status siap diambil pada aplikasi menandai selesainya pencatatan pada ledger.</li>
      <li>Penyelesaian atau lelang jaminan dilaksanakan sesuai ketentuan yang berlaku; angka pada aplikasi menjadi acuan perhitungan.</li>
    </ol>

    <h2>Pasal 4 — Persetujuan dan Tanda Tangan</h2>
    <p>Persetujuan dinyatakan dengan menandai checkbox dan membubuhkan tanda tangan pada kanvas, dan dicatat aplikasi pada syarat versi <strong>${CONTRACT_TERMS_VERSION}</strong>.</p>

    <h2>Pasal 5 — Data, Lokasi, dan Waktu</h2>
    <p>Timestamp sistem <strong>${new Date(meta.timestampPada).toLocaleString("id-ID")}</strong> dan koordinat yang tampil pada aplikasi adalah metadata yang dicatat pada pengajuan.</p>

    <div class="ttd">
      ${blokTandaTanganPeminjam(namaHurufBesar(peminjam.namaLengkap), "Peminjam — Pihak Kedua", meta)}
      ${blokPlatform()}
    </div>
    ${blokVerifikasi(meta)}
    ${footerDokumen()}
  </div>`;
}
