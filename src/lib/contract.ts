/**
 * Pembuat catatan simulasi aplikasi untuk pinjaman & gadai.
 * HTML hanya menyajikan data dan hitungan pada ledger internal; bukan kontrak
 * atau bukti persetujuan digital terverifikasi.
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
  /** Catatan checkbox dan gambar tanda tangan yang tersimpan di aplikasi. */
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
  if (jenis === "pendanaan") return "CATATAN ALOKASI SIMULASI INTERNAL";
  return jenis === "pinjaman"
    ? "CATATAN SIMULASI PINJAMAN INTERNAL"
    : "CATATAN SIMULASI GADAI INTERNAL";
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
    ? `<img class="signature" src="${escapeHtml(bukti.dataUrl)}" alt="Gambar tanda tangan yang dicatat aplikasi"/>`
    : `<div class="signature-placeholder">Belum ada gambar tanda tangan yang dicatat</div>`;
  const statusPersetujuan = bukti
    ? `Tindakan persetujuan aplikasi dan gambar dicatat ${new Date(bukti.persetujuanSyaratPada).toLocaleString("id-ID")} · ${CONTRACT_TERMS_VERSION}. Ini bukan verifikasi identitas, tanda tangan digital terverifikasi, atau konfirmasi kontrak mengikat.`
    : "Belum ada tindakan persetujuan aplikasi yang dicatat.";

  return `<div>
    ${tampilanTandaTangan}
    <p class="garis">${escapeHtml(nama)}</p>
    <p>${escapeHtml(peran)}</p>
    <p class="persetujuan">${escapeHtml(statusPersetujuan)}</p>
  </div>`;
}

function blokPlatform(): string {
  return `<div>
    <div class="signature-placeholder">Tidak ada tanda tangan Platform terverifikasi</div>
    <p class="garis">Pinjam Gadai Digital</p>
    <p>Nama aplikasi</p>
  </div>`;
}

/** Catatan yang berlaku untuk kontrak pinjaman dan gadai. */
function blokBatasTransaksi(): string {
  return `<p><strong>Batas dokumen:</strong> Ini adalah catatan simulasi data dan perhitungan pada ledger internal PINDAI, bukan penawaran, perjanjian, atau instrumen hukum. Status, persetujuan checkbox, timestamp, dan gambar pada aplikasi tidak membuktikan transfer/penerimaan dana, pembayaran ke merchant, identitas atau sumber dana, kondisi/lokasi barang, penyerahan/penitipan/pengembalian barang, tanda tangan digital terverifikasi, maupun kepatuhan hukum. Semua hal tersebut memerlukan verifikasi terpisah oleh pihak yang berwenang.</p>`;
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

    <h2>Pasal 1 — Parameter Simulasi</h2>
    <ol>
      <li>Pokok pinjaman: <strong>${formatRupiah(quote.pokok)}</strong>.</li>
      ${pasalTenor}
      <li>Status pendanaan yang tampil di aplikasi merupakan pencatatan internal dan tidak memverifikasi identitas atau sumber dana Pendana maupun terjadinya transfer.</li>
    </ol>

    <h2>Pasal 2 — Rincian Perhitungan</h2>
    <ol>${pasalFinansial}
    </ol>

    <h2>Pasal 3 — Ilustrasi Pelunasan Ledger</h2>
    <p>${pasalKewajiban}</p>

    <h2>Pasal 4 — Catatan Interaksi Aplikasi</h2>
    <p>Checkbox dan gambar pada kanvas, bila diisi, hanya merekam tindakan/input di aplikasi pada syarat versi <strong>${CONTRACT_TERMS_VERSION}</strong>. Tindakan itu bukan persetujuan kontrak yang terverifikasi atau konfirmasi kewajiban hukum.</p>

    <h2>Pasal 5 — Metadata Aplikasi</h2>
    <p>Timestamp sistem <strong>${new Date(meta.timestampPada).toLocaleString("id-ID")}</strong>${meta.lokasi ? ` dan koordinat perangkat yang dikirim <strong>${fmtKoordinat(meta.lokasi)}</strong>` : ""} ditampilkan sebagai metadata masukan. Sistem tidak memverifikasi identitas orang, keaslian tanda tangan, atau kebenaran lokasi.</p>

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
      <li>Potongan muka 1%: ${formatRupiah(quote.potonganDiMuka)}; perhitungan dana bersih pada simulasi (99%): <strong>${formatRupiah(quote.danaBersihDitransfer)}</strong>; bukan bukti transfer atau penerimaan dana.</li>
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

    <h2>Pasal 1 — Data Barang yang Dicatat</h2>
    <ol>
      <li>Deskripsi barang yang dimasukkan: <strong>${escapeHtml(gadai.deskripsiBarang)}</strong>.</li>
      <li>Kategori yang dipilih: ${escapeHtml(gadai.kategori)}.</li>
      <li>Catatan kondisi fisik: ${escapeHtml(gadai.kondisiFisik || "belum dicatat")}; bukan hasil inspeksi yang diverifikasi aplikasi.</li>
      <li>Kode/referensi lokasi yang dicatat aplikasi: <strong>${escapeHtml(gadai.kodeRakVault)}</strong>. Kode ini bukan tanda terima atau bukti bahwa barang telah diterima maupun dititipkan secara fisik.</li>
    </ol>

    <h2>Pasal 2 — Catatan Taksiran dan Simulasi LTV</h2>
    <ol>
      <li>Harga pasar: ${formatRupiah(gadai.hargaPasar)}.</li>
      <li>Nilai taksiran yang dicatat: <strong>${formatRupiah(gadai.nilaiTaksiran)}</strong> (perhitungan LTV ${ltv}%, batas aplikasi ${gadai.ltvPersen}%); bukan verifikasi harga pasar atau nilai fisik.</li>
      ${rincianPokok}
    </ol>

    <h2>Pasal 3 — Batas Catatan Gadai</h2>
    <ol>
      <li>Status, kondisi, dan kode lokasi dalam aplikasi adalah catatan internal; aplikasi tidak memverifikasi penerimaan, lokasi fisik, atau keamanan penyimpanan barang.</li>
      <li>Penyerahan, penitipan, dan pengembalian perlu dikonfirmasi langsung dengan pihak yang bertanggung jawab serta didukung tanda terima terpisah. Status lunas/siap diambil di aplikasi bukan bukti barang telah dikembalikan.</li>
      <li>Perhitungan penyelesaian atau lelang di aplikasi hanya simulasi; bukan pelaksanaan lelang, keputusan hukum, maupun jaminan hasil atau pengembalian barang.</li>
    </ol>

    <h2>Pasal 4 — Catatan Interaksi Aplikasi</h2>
    <p>Checkbox dan gambar pada kanvas, bila diisi, hanya merekam tindakan/input di aplikasi pada syarat versi <strong>${CONTRACT_TERMS_VERSION}</strong>. Tindakan itu bukan persetujuan kontrak yang terverifikasi atau konfirmasi kewajiban hukum.</p>

    <h2>Pasal 5 — Metadata Aplikasi</h2>
    <p>Timestamp sistem <strong>${new Date(meta.timestampPada).toLocaleString("id-ID")}</strong> dan koordinat yang ditampilkan pada aplikasi adalah metadata yang dikirim, bukan bukti identitas atau lokasi yang telah diverifikasi.</p>

    <div class="ttd">
      ${blokTandaTanganPeminjam(peminjam.namaLengkap, "Penggadai / Peminjam", meta)}
      ${blokPlatform()}
    </div>
  </div>`;
}
