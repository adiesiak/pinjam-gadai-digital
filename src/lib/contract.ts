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
export const CONTRACT_TERMS_VERSION = "v1.0";

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
      ? `<li>Tenor: <strong>${tenorHari} hari</strong> sejak dana dicairkan.</li>`
      : `<li>Tenor: <strong>${bulanan.tenorBulan} bulan</strong> sejak dana dicairkan (skema bulanan).</li>`;
  const pasalFinansial =
    bulanan === null
      ? `
      <li>Biaya admin: ${formatRupiah(quote.biayaAdmin)}.</li>
      <li>Biaya platform: ${formatRupiah(quote.biayaPlatform)}.</li>
      <li>Total potongan di muka: ${formatRupiah(quote.totalPotonganDiMuka)}.</li>
      <li><strong>Dana bersih diterima Peminjam: ${formatRupiah(quote.danaBersihDitransfer)} (95% dari pokok)</strong>.</li>
      <li>Bunga: ${formatRupiah(quote.bunga)}.</li>
      <li><strong>Total kewajiban pelunasan: ${formatRupiah(quote.totalKewajibanPelunasan)} (130% dari pokok)</strong>.</li>`
      : `
      <li>Uang muka (DP): ${formatRupiah(bulanan.dp)} — 0% sehingga seluruh pokok dibiayai.</li>
      <li>Biaya layanan platform 3% dari pokok: ${formatRupiah(bulanan.biayaLayananTotal)}, diamortisasi rata ${formatRupiah(bulanan.biayaLayananPerBulan)} per bulan.</li>
      <li><strong>Dana diterima Peminjam: ${formatRupiah(bulanan.pokokDibiayai)} (100% pokok, tanpa potongan di muka)</strong>.</li>
      <li>Bunga/margin menurun: ${bulanan.persenBungaPerBulan}% per bulan dari pokok; total bunga ${formatRupiah(bulanan.bungaTotal)}.</li>
      <li><strong>Cicilan ${formatRupiah(bulanan.cicilanPerBulan)} per bulan selama ${bulanan.tenorBulan} bulan; total kewajiban pelunasan: ${formatRupiah(bulanan.totalPengembalian)}</strong>.</li>`;
  const pasalKewajiban =
    bulanan === null
      ? `Peminjam wajib melunasi total kewajiban paling lambat pada hari ke-${tenorHari}. Keterlambatan dikenakan denda sesuai ketentuan Platform yang tercantum pada aplikasi.`
      : `Peminjam wajib melunasi setiap cicilan bulanan tepat waktu, paling lambat pada akhir bulan ke-${bulanan.tenorBulan}. Pelunasan dipercepat dihitung dari sisa total kewajiban. Keterlambatan dikenakan denda sesuai ketentuan Platform yang tercantum pada aplikasi.`;
  return `
  <div class="contract">
    <h1>${judulContract("pinjaman")}</h1>
    <p class="nomor">Nomor: ${escapeHtml(nomorContract("pinjaman", meta.nomorReferensi))} · Syarat ${CONTRACT_TERMS_VERSION}</p>

    <p>Perjanjian ini dibuat pada tanggal <strong>${tgl}</strong> antara:</p>
    <p><strong>PINJAM GADAI DIGITAL ("Platform")</strong> — penyelenggara layanan pinjam-gadai digital, selaku pengelola pendanaan dari para <strong>Pendana</strong> terverifikasi;</p>
    <p>dan</p>
    <p><strong>${escapeHtml(peminjam.namaLengkap.toUpperCase())} ("Peminjam")</strong>${peminjam.nik ? `, NIK ${escapeHtml(peminjam.nik)}` : ""}${peminjam.email ? `, email ${escapeHtml(peminjam.email)}` : ""}, rekening tujuan pencairan ${escapeHtml(peminjam.nomorRekening)}.</p>

    <h2>Pasal 1 — Objek Pendanaan</h2>
    <ol>
      <li>Pokok pinjaman: <strong>${formatRupiah(quote.pokok)}</strong>.</li>
      ${pasalTenor}
      <li>Dana berasal dari Pendana terverifikasi melalui mekanisme pendanaan Platform.</li>
    </ol>

    <h2>Pasal 2 — Rincian Keuangan</h2>
    <ol>${pasalFinansial}
    </ol>

    <h2>Pasal 3 — Kewajiban Peminjam</h2>
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

    <p>Akad gadai ini dibuat pada tanggal <strong>${tgl}</strong> antara:</p>
    <p><strong>PINJAM GADAI DIGITAL ("Platform")</strong> — pengelola gudang brankas dan layanan gadai digital;</p>
    <p>dan</p>
    <p><strong>${escapeHtml(peminjam.namaLengkap.toUpperCase())} ("Penggadai/Peminjam")</strong>${peminjam.nik ? `, NIK ${escapeHtml(peminjam.nik)}` : ""}, rekening tujuan pencairan ${escapeHtml(peminjam.nomorRekening)}.</p>

    <h2>Pasal 1 — Objek Gadai</h2>
    <ol>
      <li>Deskripsi barang: <strong>${escapeHtml(gadai.deskripsiBarang)}</strong>.</li>
      <li>Kategori: ${escapeHtml(gadai.kategori)}.</li>
      <li>Kondisi fisik: ${escapeHtml(gadai.kondisiFisik || "dinilai petugas")}.</li>
      <li>Disimpan di gudang brankas, kode rak <strong>${escapeHtml(gadai.kodeRakVault)}</strong>.</li>
    </ol>

    <h2>Pasal 2 — Penilaian, LTV, dan Rincian Pendanaan</h2>
    <ol>
      <li>Harga pasar: ${formatRupiah(gadai.hargaPasar)}.</li>
      <li>Nilai taksiran: <strong>${formatRupiah(gadai.nilaiTaksiran)}</strong> (LTV ${ltv}%, maksimum ${gadai.ltvPersen}%).</li>
      ${rincianPokok}
    </ol>

    <h2>Pasal 3 — Hak dan Kewajiban</h2>
    <ol>
      <li>Barang disimpan di tempat penyimpanan Platform sesuai proses yang berlaku selama masa gadai.</li>
      <li>Barang dikembalikan setelah seluruh kewajiban (pokok dan sewa modal) dilunasi.</li>
      <li>Bila kewajiban tidak diselesaikan, barang dapat diproses sesuai ketentuan yang berlaku; perhitungan hasilnya mengikuti rincian penyelesaian pada aplikasi.</li>
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
