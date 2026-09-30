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
export const CONTRACT_TERMS_VERSION = "v1.2";

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
  if (jenis === "pendanaan") return "CATATAN ALOKASI SIMULASI INTERNAL";
  return jenis === "pinjaman"
    ? "CATATAN SIMULASI PINJAMAN INTERNAL"
    : "CATATAN SIMULASI GADAI INTERNAL";
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
  const persetujuanVersiKini =
    bukti?.persetujuanSyaratPada != null &&
    bukti.persetujuanSyaratVersi === CONTRACT_TERMS_VERSION;
  const waktuTandaTangan =
    bukti?.tandaTanganPada != null
      ? ` · gambar dicatat ${new Date(bukti.tandaTanganPada).toLocaleString("id-ID")}`
      : "";
  const tampilanTandaTangan = bukti
    ? `<img class="signature" src="${escapeHtml(bukti.dataUrl)}" alt="Gambar tanda tangan yang dicatat aplikasi"/>`
    : `<div class="signature-placeholder">Belum ada gambar tanda tangan yang dicatat</div>`;
  const statusPersetujuan = !bukti
    ? "Belum ada gambar tanda tangan atau tindakan persetujuan aplikasi yang dicatat."
    : persetujuanVersiKini
      ? `Tindakan checkbox aplikasi dicatat ${new Date(bukti.persetujuanSyaratPada!).toLocaleString("id-ID")} · ${CONTRACT_TERMS_VERSION}${waktuTandaTangan}. Ini bukan verifikasi identitas, tanda tangan digital terverifikasi, atau konfirmasi kontrak mengikat.`
      : `Gambar tanda tangan tercatat${waktuTandaTangan}. Catatan checkbox versi ${CONTRACT_TERMS_VERSION} tidak tersedia; gambar ini bukan verifikasi identitas, tanda tangan digital terverifikasi, atau konfirmasi kontrak mengikat.`;

  return `<div>
    ${tampilanTandaTangan}
    <p class="garis">${escapeHtml(nama)}</p>
    <p>${escapeHtml(peran)}</p>
    <p class="persetujuan">${escapeHtml(statusPersetujuan)}</p>
  </div>`;
}

function blokStempelPindai(): string {
  return `<div class="pindai-stamp" aria-label="Stempel visual PINDAI, bukan e-meterai">
    <strong>PINDAI · DIGITAL</strong>
    <span>CATATAN APLIKASI</span>
    <small>Bukan e-meterai atau sertifikasi</small>
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
 * Rangkai HTML ringkasan simulasi pinjaman pada ledger internal.
 *
 * Dua skema didukung: harian (130%, potongan 5% di muka) dan bulanan
 * (DP 0%, biaya layanan 3% diamortisasi, bunga menurun). Bila `bulanan`
 * diisi, rincian simulasi mengikuti skema bulanan dan angka dari engine lib/bulanan.ts.
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
      ? `<li>Periode acuan simulasi: <strong>${tenorHari} hari</strong> sejak tanggal status alokasi dicatat di aplikasi; bukan bukti pencairan.</li>`
      : `<li>Periode acuan simulasi: <strong>${bulanan.tenorBulan} bulan</strong> (1 bulan = 30 hari) sejak tanggal status alokasi dicatat di aplikasi; bukan bukti pencairan.</li>`;
  const pasalFinansial =
    bulanan === null
      ? `
      <li>Biaya admin: ${formatRupiah(quote.biayaAdmin)}.</li>
      <li>Biaya platform: ${formatRupiah(quote.biayaPlatform)}.</li>
      <li>Total potongan di muka: ${formatRupiah(quote.totalPotonganDiMuka)}.</li>
      <li><strong>Perhitungan dana bersih pada simulasi: ${formatRupiah(quote.danaBersihDitransfer)} (95% dari pokok)</strong>; bukan bukti dana ditransfer atau diterima.</li>
      <li>Bunga: ${formatRupiah(quote.bunga)}.</li>
      <li><strong>Total kewajiban simulasi: ${formatRupiah(quote.totalKewajibanPelunasan)} (130% dari pokok)</strong>; bukan tagihan.</li>`
      : `
      <li>Uang muka pada simulasi: ${formatRupiah(bulanan.dp)} — 0% dari pokok acuan.</li>
      <li>Biaya layanan simulasi 3% dari pokok acuan: ${formatRupiah(bulanan.biayaLayananTotal)}, dibagi rata ${formatRupiah(bulanan.biayaLayananPerBulan)} per bulan pada model.</li>
      <li><strong>Nilai bersih pada simulasi: ${formatRupiah(bulanan.pokokDibiayai)} (100% pokok, tanpa potongan di muka)</strong>; tidak ditransfer dan bukan bukti dana diterima.</li>
      <li>Bunga/margin pada simulasi sebesar ${bulanan.persenBungaPerBulan}% per bulan dari sisa pokok pada awal setiap bulan; total simulasi ${formatRupiah(bulanan.bungaTotal)}.</li>
      <li><strong>Ilustrasi cicilan menurun: bulan pertama ${formatRupiah(bulanan.cicilanPerBulan)}, bulan terakhir ${formatRupiah(bulanan.cicilanTerakhir)}; total simulasi ${formatRupiah(bulanan.totalPengembalian)} untuk ${bulanan.tenorBulan} bulan.</strong> Rincian per bulan: ${bulanan.jadwal.map((angsuran) => `bulan ${angsuran.bulan} ${formatRupiah(angsuran.total)}`).join("; ")}. Jadwal hanya ilustrasi; perubahan status lunas di aplikasi adalah entri ledger, bukan bukti cicilan atau pembayaran sebagian.</li>`;
  const pasalKewajiban =
    bulanan === null
      ? `Model aplikasi dapat mencatat perubahan status pada hari ke-${tenorHari} dari tanggal acuan status alokasi. Ini bukan bukti pelunasan. Aplikasi tidak memproses atau memverifikasi transfer uang. Denda simulasi adalah hitungan ledger internal, bukan tunggakan atau tagihan terverifikasi.`
      : `Jadwal cicilan bulanan merupakan ilustrasi perhitungan, bukan jadwal pembayaran yang dapat diproses aplikasi. Sistem hanya mencatat perubahan status ledger; status lunas dan denda simulasi bukan bukti cicilan dibayar, tunggakan, atau tagihan terverifikasi.`;
  return `
  <div class="contract">
    <h1>${judulContract("pinjaman")}</h1>
    <p class="nomor">Nomor: ${escapeHtml(nomorContract("pinjaman", meta.nomorReferensi))} · Syarat ${CONTRACT_TERMS_VERSION}</p>
    ${blokStempelPindai()}
    ${blokBatasTransaksi()}

    <p>Ringkasan ini menampilkan masukan yang tersimpan pada <strong>${tgl}</strong>; bukan dokumen kesepakatan para pihak.</p>
    <p><strong>Nama aplikasi:</strong> Pinjam Gadai Digital (PINDAI) — pencatatan internal saja, bukan pihak kontrak.</p>
    <p><strong>Nama dan data pada pengajuan:</strong> ${escapeHtml(peminjam.namaLengkap.toUpperCase())}${peminjam.nik ? `, NIK ${escapeHtml(peminjam.nik)}` : ""}${peminjam.email ? `, email ${escapeHtml(peminjam.email)}` : ""}; informasi bank/e-wallet dan rekening/akun yang dimasukkan: <strong>${peminjam.namaBank ? `${escapeHtml(peminjam.namaBank)} · ` : ""}${escapeHtml(peminjam.nomorRekening)}</strong>. Data ini tidak diverifikasi dan bukan bukti transfer.</p>

    <h2>Bagian 1 — Parameter Simulasi</h2>
    <ol>
      <li>Pokok acuan simulasi: <strong>${formatRupiah(quote.pokok)}</strong>; bukan dana yang ditransfer.</li>
      ${pasalTenor}
      <li>Status alokasi yang tampil di aplikasi adalah pencatatan internal; tidak memverifikasi identitas/sumber dana Pendana atau terjadinya transfer.</li>
    </ol>

    <h2>Bagian 2 — Rincian Perhitungan Simulasi</h2>
    <ol>${pasalFinansial}
    </ol>

    <h2>Bagian 3 — Ilustrasi Status Ledger</h2>
    <p>${pasalKewajiban}</p>

    <h2>Bagian 4 — Catatan Interaksi Aplikasi</h2>
    <p>Checkbox dan gambar pada kanvas, bila diisi, hanya merekam tindakan/input di aplikasi pada syarat versi <strong>${CONTRACT_TERMS_VERSION}</strong>. Tindakan itu bukan persetujuan kontrak yang terverifikasi atau konfirmasi kewajiban hukum.</p>

    <h2>Bagian 5 — Metadata Aplikasi</h2>
    <p>Timestamp sistem <strong>${new Date(meta.timestampPada).toLocaleString("id-ID")}</strong>${meta.lokasi ? ` dan koordinat perangkat yang dikirim <strong>${fmtKoordinat(meta.lokasi)}</strong>` : ""} ditampilkan sebagai metadata masukan. Sistem tidak memverifikasi identitas orang, keaslian tanda tangan, atau kebenaran lokasi.</p>

    <div class="ttd">
      ${blokTandaTanganPeminjam(peminjam.namaLengkap, "Nama pada pengajuan", meta)}
      ${blokPlatform()}
    </div>
  </div>`;
}

/** Rangkai HTML ringkasan simulasi gadai pada ledger internal. */
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
      ? `<li>Pokok gadai dan sewa modal belum ditetapkan pada saat ringkasan dibuat; belum ada hitungan yang dapat ditampilkan.</li>`
      : `<li>Pokok acuan pada simulasi gadai: <strong>${formatRupiah(quote.pokok)}</strong>; bukan pencairan.</li>
      <li>Potongan simulasi 1%: ${formatRupiah(quote.potonganDiMuka)}; nilai bersih pada simulasi (99%): <strong>${formatRupiah(quote.danaBersihDitransfer)}</strong>; tidak ditransfer dan bukan bukti dana diterima.</li>
      <li>Perhitungan sewa modal simulasi ${gadai.persenSewaModal}% per 30 hari dari sisa pokok; ilustrasi periode pertama ${formatRupiah(quote.sewaModalPeriode)}. Ini bukan tagihan atau pembayaran aktual.</li>`;

  return `
  <div class="contract">
    <h1>${judulContract("gadai")}</h1>
    <p class="nomor">Nomor: ${escapeHtml(nomorContract("gadai", meta.nomorReferensi))} · Syarat ${CONTRACT_TERMS_VERSION}</p>
    ${blokStempelPindai()}

    ${blokBatasTransaksi()}
    <p>Ringkasan ini menampilkan masukan dan hitungan yang tersimpan pada <strong>${tgl}</strong>; bukan akad atau kesepakatan para pihak.</p>
    <p><strong>Nama dan data pada pengajuan:</strong> ${escapeHtml(peminjam.namaLengkap.toUpperCase())}${peminjam.nik ? `, NIK ${escapeHtml(peminjam.nik)}` : ""}; informasi rekening yang dimasukkan: <strong>${peminjam.namaBank ? `${escapeHtml(peminjam.namaBank)} · ` : ""}${escapeHtml(peminjam.nomorRekening)}</strong>. Data ini tidak diverifikasi dan bukan bukti transfer.</p>

    <h2>Bagian 1 — Data Barang yang Dicatat</h2>
    <ol>
      <li>Deskripsi barang yang dimasukkan: <strong>${escapeHtml(gadai.deskripsiBarang)}</strong>.</li>
      <li>Kategori yang dipilih: ${escapeHtml(gadai.kategori)}.</li>
      <li>Catatan kondisi fisik: ${escapeHtml(gadai.kondisiFisik || "belum dicatat")}; bukan hasil inspeksi yang diverifikasi aplikasi.</li>
      <li>Kode/referensi lokasi yang dicatat aplikasi: <strong>${escapeHtml(gadai.kodeRakVault)}</strong>. Kode ini bukan tanda terima atau bukti bahwa barang telah diterima maupun dititipkan secara fisik.</li>
    </ol>

    <h2>Bagian 2 — Nilai Masukan dan Simulasi LTV</h2>
    <ol>
      <li>Harga pasar yang dimasukkan/dicatat: ${formatRupiah(gadai.hargaPasar)}; tidak diverifikasi.</li>
      <li>Nilai taksiran pada ledger: <strong>${formatRupiah(gadai.nilaiTaksiran)}</strong> (perhitungan simulasi LTV ${ltv}%, batas aplikasi ${gadai.ltvPersen}%); bukan verifikasi harga pasar atau nilai fisik.</li>
      ${rincianPokok}
    </ol>

    <h2>Bagian 3 — Batas Catatan Gadai</h2>
    <ol>
      <li>Status, kondisi, dan kode lokasi dalam aplikasi adalah catatan internal; aplikasi tidak memverifikasi penerimaan, lokasi fisik, atau keamanan penyimpanan barang.</li>
      <li>Penyerahan, penitipan, dan pengembalian perlu dikonfirmasi langsung dengan pihak yang bertanggung jawab serta didukung tanda terima terpisah. Status lunas/siap diambil di aplikasi bukan bukti barang telah dikembalikan.</li>
      <li>Perhitungan penyelesaian atau lelang di aplikasi hanya simulasi; bukan pelaksanaan lelang, keputusan hukum, maupun jaminan hasil atau pengembalian barang.</li>
    </ol>

    <h2>Bagian 4 — Catatan Interaksi Aplikasi</h2>
    <p>Checkbox dan gambar pada kanvas, bila diisi, hanya merekam tindakan/input di aplikasi pada syarat versi <strong>${CONTRACT_TERMS_VERSION}</strong>. Tindakan itu bukan persetujuan kontrak yang terverifikasi atau konfirmasi kewajiban hukum.</p>

    <h2>Bagian 5 — Metadata Aplikasi</h2>
    <p>Timestamp sistem <strong>${new Date(meta.timestampPada).toLocaleString("id-ID")}</strong> dan koordinat yang ditampilkan pada aplikasi adalah metadata yang dikirim, bukan bukti identitas atau lokasi yang telah diverifikasi.</p>

    <div class="ttd">
      ${blokTandaTanganPeminjam(peminjam.namaLengkap, "Nama pada pengajuan", meta)}
      ${blokPlatform()}
    </div>
  </div>`;
}
