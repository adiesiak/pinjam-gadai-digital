/**
 * Pembuat catatan pengajuan pinjaman & gadai pada aplikasi.
 * HTML memuat para pihak, ketentuan pokok, dan blok tanda tangan kedua pihak.
 */

import type { SimulasiBulanan } from "./bulanan";
import { quoteGadai } from "./gadai";
import { formatRupiah } from "./money";
import type { LoanQuote } from "./loan";

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

/** Ikon brankas (vault) untuk cap PINDAI — SVG inline agar ikut tercetak. */
const BRANKAS_SVG = `<svg class="cap-brankas" viewBox="0 0 48 48" role="img" aria-label="Logo brankas PINDAI" xmlns="http://www.w3.org/2000/svg">
  <rect x="5" y="9" width="38" height="30" rx="4" fill="none" stroke="currentColor" stroke-width="2.5"/>
  <circle cx="22" cy="24" r="8" fill="none" stroke="currentColor" stroke-width="2.5"/>
  <circle cx="22" cy="24" r="1.8" fill="currentColor"/>
  <path d="M22 13.5v3M22 31.5v3M11.5 24h3M29.5 24h3" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
  <path d="M35 19h4M35 24h4M35 29h4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
</svg>`;

/** Cap PINDAI dengan logo brankas pada bagian tanda tangan Platform. */
function blokStempelPindai(): string {
  return `<div class="pindai-stamp" aria-label="Cap PINDAI dengan logo brankas">
      ${BRANKAS_SVG}
      <strong>CAP PINDAI</strong>
      <small>PINJAM GADAI DIGITAL</small>
    </div>`;
}

function blokPlatform(): string {
  return `<div>
    <div class="ttd-slot">${blokStempelPindai()}</div>
    <p class="garis">Pinjam Gadai Digital</p>
    <p>PINDAI — Pihak Pertama</p>
  </div>`;
}

/** Blok para pihak yang dipakai perjanjian pinjaman dan gadai. */
function blokParaPihak(): string {
  return `<p><strong>Para Pihak:</strong> Perjanjian ini dibuat dan disetujui oleh <strong>Pinjam Gadai Digital (PINDAI)</strong> sebagai Pihak Pertama dan pihak yang datanya tercantum di bawah sebagai Pihak Kedua. Nilai, jadwal, dan setiap perubahan status mengikuti pencatatan pada ledger internal aplikasi. Pencairan dana, pembayaran ke merchant, serta inspeksi, penyerahan, dan penitipan barang ditangani di luar aplikasi.</p>`;
}

/**
 * Rangkai HTML ringkasan pengajuan pinjaman pada ledger internal.
 *
 * Dua skema didukung: harian (130%, potongan 2% di muka) dan bulanan
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
): string {
  const tgl = fmtTanggal(meta.timestampPada);
  const pasalTenor =
    bulanan === null
      ? `<li>Periode acuan: <strong>${tenorHari} hari</strong> sejak tanggal status alokasi dicatat di aplikasi.</li>`
      : `<li>Periode acuan: <strong>${bulanan.tenorBulan} bulan</strong> (1 bulan = 30 hari) sejak tanggal status alokasi dicatat di aplikasi.</li>`;
  const rincianBiayaBulanan =
    bulanan !== null && (bulanan.tenorBulan === 3 || bulanan.tenorBulan === 6)
      ? `<li>Biaya admin 2%: ${formatRupiah(bulanan.biayaAdminTotal)}.</li>
      <li>Total potongan di muka 2% (${formatRupiah(bulanan.biayaLayananTotal)}) dipotong di muka dari dana yang diterima — biaya platform dihapus (0%).</li>
      <li>Biaya admin layanan cicilan 2% dari nominal cicilan: ${formatRupiah(bulanan.biayaAdminCicilanTotal)} selama ${bulanan.tenorBulan} bulan (bulan pertama ${formatRupiah(bulanan.biayaAdminCicilanPerBulan)}), dibayar bersama setiap cicilan.</li>`
      : bulanan !== null
        ? `<li>Biaya layanan 2% dari pokok acuan: ${formatRupiah(bulanan.biayaLayananTotal)}, dipotong di muka dari dana yang diterima.</li>`
        : "";
  const pasalFinansial =
    bulanan === null
      ? `
      <li>Biaya admin 2%: ${formatRupiah(quote.biayaAdmin)}.</li>
      <li>Total potongan di muka 2%: ${formatRupiah(quote.totalPotonganDiMuka)} (biaya platform dihapus — 0%).</li>
      <li><strong>Perhitungan dana bersih: ${formatRupiah(quote.danaBersihDitransfer)} (98% dari pokok)</strong>; dana diteruskan sesuai proses pencairan.</li>
      <li>Bunga: ${formatRupiah(quote.bunga)}.</li>
      <li><strong>Total kewajiban: ${formatRupiah(quote.totalKewajibanPelunasan)} (130% dari pokok)</strong>; nominal mengikuti perhitungan aplikasi.</li>`
      : `
      <li>Uang muka: ${formatRupiah(bulanan.dp)} — 0% dari pokok acuan.</li>
      ${rincianBiayaBulanan}
      <li><strong>Dana bersih yang diterima: ${formatRupiah(bulanan.danaDiterima)} (pokok ${formatRupiah(bulanan.pokokDibiayai)} setelah potongan di muka ${formatRupiah(bulanan.potonganDiMuka)})</strong>; dana diteruskan sesuai proses pencairan.</li>
      <li>Bunga/margin sebesar ${bulanan.persenBungaPerBulan}% per bulan dari POKOK ACUAN (flat, tidak menurun dari sisa pokok); total ${formatRupiah(bulanan.bungaTotal)}.</li>
      <li><strong>Ilustrasi cicilan rata: bulan pertama ${formatRupiah(bulanan.cicilanPerBulan)}, bulan terakhir ${formatRupiah(bulanan.cicilanTerakhir)}; total ${formatRupiah(bulanan.totalPengembalian)} untuk ${bulanan.tenorBulan} bulan (sudah termasuk pokok, bunga, dan biaya admin cicilan).</strong> Rincian per bulan: ${bulanan.jadwal.map((angsuran) => `bulan ${angsuran.bulan} ${formatRupiah(angsuran.total)}`).join("; ")}. Jadwal bersifat ilustrasi; perubahan status lunas di aplikasi dicatat sebagai entri ledger.</li>`;
  const pasalKewajiban =
    bulanan === null
      ? `Kewajiban dilunasi dalam ${tenorHari} hari sejak tanggal pencairan. Pelunasan ditangani di luar aplikasi dan statusnya dicatat tim PINDAI pada ledger internal. Denda keterlambatan 1% per hari dari pokok, maksimum 15%.`
      : `Cicilan bulanan dibayar sesuai jadwal pada Pasal 2. Setiap perubahan status dicatat pada ledger internal aplikasi. Denda keterlambatan 1% per hari dari pokok, maksimum 15%.`;
  return `
  <div class="contract">
    <h1>${judulContract("pinjaman")}</h1>
    <p class="nomor">Nomor: ${escapeHtml(nomorContract("pinjaman", meta.nomorReferensi))} · Syarat ${CONTRACT_TERMS_VERSION}</p>
    ${blokParaPihak()}

    <p>Perjanjian ini dibuat dan disetujui pada <strong>${tgl}</strong> atas data pengajuan yang tersimpan di aplikasi PINDAI.</p>
    <p><strong>Pihak Pertama:</strong> Pinjam Gadai Digital (PINDAI).</p>
    <p><strong>Pihak Kedua:</strong> ${escapeHtml(peminjam.namaLengkap.toUpperCase())}${peminjam.nik ? `, NIK ${escapeHtml(peminjam.nik)}` : ""}${peminjam.email ? `, email ${escapeHtml(peminjam.email)}` : ""}; informasi bank/e-wallet dan rekening/akun yang dimasukkan: <strong>${peminjam.namaBank ? `${escapeHtml(peminjam.namaBank)} · ` : ""}${escapeHtml(peminjam.nomorRekening)}</strong>. Data ini berasal dari pengisian pada pengajuan.</p>

    <h2>Pasal 1 — Pokok, Tenor, dan Status</h2>
    <ol>
      <li>Pokok pinjaman: <strong>${formatRupiah(quote.pokok)}</strong>.</li>
      ${pasalTenor}
      <li>Status pinjaman mengikuti pencatatan pada ledger internal aplikasi.</li>
    </ol>

    <h2>Pasal 2 — Biaya, Bunga, dan Total Kewajiban</h2>
    <ol>${pasalFinansial}
    </ol>

    <h2>Pasal 3 — Cara dan Waktu Pelunasan</h2>
    <p>${pasalKewajiban}</p>

    <h2>Pasal 4 — Persetujuan dan Tanda Tangan</h2>
    <p>Persetujuan dinyatakan dengan menandai checkbox dan membubuhkan tanda tangan pada kanvas, dan dicatat aplikasi pada syarat versi <strong>${CONTRACT_TERMS_VERSION}</strong>.</p>

    <h2>Pasal 5 — Data, Lokasi, dan Waktu</h2>
    <p>Timestamp sistem <strong>${new Date(meta.timestampPada).toLocaleString("id-ID")}</strong>${meta.lokasi ? ` dan koordinat perangkat yang dikirim <strong>${fmtKoordinat(meta.lokasi)}</strong>` : ""} ditampilkan sebagai metadata masukan pengajuan.</p>

    <div class="ttd">
      ${blokTandaTanganPeminjam(peminjam.namaLengkap, "Peminjam — Pihak Kedua", meta)}
      ${blokPlatform()}
    </div>
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
    <h1>${judulContract("gadai")}</h1>
    <p class="nomor">Nomor: ${escapeHtml(nomorContract("gadai", meta.nomorReferensi))} · Syarat ${CONTRACT_TERMS_VERSION}</p>
    ${blokParaPihak()}
    <p>Akad ini dibuat dan disetujui pada <strong>${tgl}</strong> atas data pengajuan yang tersimpan di aplikasi PINDAI.</p>
    <p><strong>Pihak Pertama:</strong> Pinjam Gadai Digital (PINDAI).</p>
    <p><strong>Pihak Kedua:</strong> ${escapeHtml(peminjam.namaLengkap.toUpperCase())}${peminjam.nik ? `, NIK ${escapeHtml(peminjam.nik)}` : ""}; informasi rekening yang dimasukkan: <strong>${peminjam.namaBank ? `${escapeHtml(peminjam.namaBank)} · ` : ""}${escapeHtml(peminjam.nomorRekening)}</strong>. Data ini berasal dari pengisian pada pengajuan.</p>

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
      ${blokTandaTanganPeminjam(peminjam.namaLengkap, "Peminjam — Pihak Kedua", meta)}
      ${blokPlatform()}
    </div>
  </div>`;
}
