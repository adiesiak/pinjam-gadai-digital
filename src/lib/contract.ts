/**
 * Pembuat teks e-contract (surat perjanjian) untuk pinjaman & gadai.
 * Teks render ke HTML untuk preview + cetak PDF via window.print().
 * Terminologi resmi: Peminjam, Pendana, Bunga/Imbal Hasil (tanpa kata
 * investor/investasi/ROI/return).
 */

import { formatRupiah } from "./money";
import type { LoanQuote } from "./loan";

export type ContractParty = {
  namaLengkap: string;
  nomorRekening: string;
  nik?: string | null;
  email?: string | null;
};

export type ContractMeta = {
  nomorReferensi: string;
  /** Titik koordinat & waktu tanda tangan/pengajuan. */
  lokasi?: { lat: number; lng: number } | null;
  timestampPada: number;
  /** Blok klausul khusus gadai. */
  gadai?: {
    deskripsiBarang: string;
    kategori: string;
    nilaiTaksiran: number;
    hargaPasar: number;
    ltvPersen: number;
    kodeRakVault: string;
    kondisiFisik: string;
  };
};

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

/** Rangkai teks HTML perjanjian pinjaman. */
export function buildPinjamanContract(
  peminjam: ContractParty,
  quote: LoanQuote,
  meta: ContractMeta,
  tenorHari: number,
): string {
  const tgl = fmtTanggal(meta.timestampPada);
  return `
  <div class="contract">
    <h1>${judulContract("pinjaman")}</h1>
    <p class="nomor">Nomor: ${nomorContract("pinjaman", meta.nomorReferensi)}</p>

    <p>Perjanjian ini dibuat pada tanggal <strong>${tgl}</strong> antara:</p>
    <p><strong>PINJAM GADAI DIGITAL ("Platform")</strong> — penyelenggara layanan pinjam-gadai digital, selaku pengelola pendanaan dari para <strong>Pendana</strong> terverifikasi;</p>
    <p>dan</p>
    <p><strong>${peminjam.namaLengkap.toUpperCase()} ("Peminjam")</strong>${peminjam.nik ? `, NIK ${peminjam.nik}` : ""}${peminjam.email ? `, email ${peminjam.email}` : ""}, rekening tujuan pencairan ${peminjam.nomorRekening}.</p>

    <h2> Pasal 1 — Objek Pendanaan</h2>
    <ol>
      <li>Pokok pinjaman: <strong>${formatRupiah(quote.pokok)}</strong>.</li>
      <li>Tenor: <strong>${tenorHari} hari</strong> sejak dana dicairkan.</li>
      <li>Dana berasal dari Pendana terverifikasi melalui mekanisme pendanaan Platform.</li>
    </ol>

    <h2>Pasal 2 — Rincian Financial</h2>
    <ol>
      <li>Biaya admin: ${formatRupiah(quote.biayaAdmin)}.</li>
      <li>Biaya platform: ${formatRupiah(quote.biayaPlatform)}.</li>
      <li>Total potongan di muka: ${formatRupiah(quote.totalPotonganDiMuka)}.</li>
      <li><strong>Dana bersih diterima Peminjam: ${formatRupiah(quote.danaBersihDitransfer)} (95% dari pokok)</strong>.</li>
      <li>Bunga: ${formatRupiah(quote.bunga)}.</li>
      <li><strong>Total kewajiban pelunasan: ${formatRupiah(quote.totalKewajibanPelunasan)} (130% dari pokok)</strong>.</li>
    </ol>

    <h2>Pasal 3 — Kewajiban Peminjam</h2>
    <p>Peminjam wajib melunasi total kewajiban paling lambat pada hari ke-${tenorHari}. Keterlambatan dikenakan denda sesuai ketentuan Platform yang tercantum pada aplikasi.</p>

    <h2>Pasal 4 — Keabsahan Digital</h2>
    <p>Perjanjian ini ditandatangani secara elektronik melalui kanvas tanda tangan digital di aplikasi, tercatat pada koordinat GPS <strong>${fmtKoordinat(meta.lokasi)}</strong>, dengan timestamp sistem <strong>${new Date(meta.timestampPada).toLocaleString("id-ID")}</strong>. Kedua belah pihak mengakui keabsahan tanda tangan elektronik ini.</p>

    <div class="ttd">
      <div>
        <p class="garis">${peminjam.namaLengkap}</p>
        <p>Peminjam</p>
      </div>
      <div>
        <p class="garis">Pinjam Gadai Digital</p>
        <p>Platform</p>
      </div>
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
  return `
  <div class="contract">
    <h1>${judulContract("gadai")}</h1>
    <p class="nomor">Nomor: ${nomorContract("gadai", meta.nomorReferensi)}</p>

    <p>Akad gadai ini dibuat pada tanggal <strong>${tgl}</strong> antara:</p>
    <p><strong>PINJAM GADAI DIGITAL ("Platform")</strong> — pengelola gudang brankas dan layanan gadai digital;</p>
    <p>dan</p>
    <p><strong>${peminjam.namaLengkap.toUpperCase()} ("Penggadai/Peminjam")</strong>${peminjam.nik ? `, NIK ${peminjam.nik}` : ""}, rekening tujuan pencairan ${peminjam.nomorRekening}.</p>

    <h2>Pasal 1 — Objek Gadai</h2>
    <ol>
      <li>Deskripsi barang: <strong>${gadai.deskripsiBarang}</strong>.</li>
      <li>Kategori: ${gadai.kategori}.</li>
      <li>Kondisi fisik: ${gadai.kondisiFisik || "dinilai petugas"}.</li>
      <li>Disimpan di gudang brankas, kode rak <strong>${gadai.kodeRakVault}</strong>.</li>
    </ol>

    <h2>Pasal 2 — Penilaian & LTV</h2>
    <ol>
      <li>Harga pasar: ${formatRupiah(gadai.hargaPasar)}.</li>
      <li>Nilai taksiran: <strong>${formatRupiah(gadai.nilaiTaksiran)}</strong> (LTV ${ltv}%, maksimum ${gadai.ltvPersen}%).</li>
    </ol>

    <h2>Pasal 3 — Hak & Kewajiban</h2>
    <ol>
      <li>Barang disimpan aman di brankas Platform dan diasuransikan selama masa gadai.</li>
      <li>Barang dikembalikan setelah seluruh kewajiban (pokok + imbal hasil Pendana) dilunasi.</li>
      <li>Bila kewajiban tidak diselesaikan, barang dapat dilelang sesuai ketentuan dan sisa hasil lelang setelah pemenuhan kewajiban dikembalikan kepada Penggadai.</li>
    </ol>

    <h2>Pasal 4 — Keabsahan Digital</h2>
    <p>Akad ini ditandatangani secara elektronik, tercatat pada koordinat GPS <strong>${fmtKoordinat(meta.lokasi)}</strong>, timestamp <strong>${new Date(meta.timestampPada).toLocaleString("id-ID")}</strong>.</p>

    <div class="ttd">
      <div>
        <p class="garis">${peminjam.namaLengkap}</p>
        <p>Penggadai</p>
      </div>
      <div>
        <p class="garis">Pinjam Gadai Digital</p>
        <p>Platform</p>
      </div>
    </div>
  </div>`;
}
