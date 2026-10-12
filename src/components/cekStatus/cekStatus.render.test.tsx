/**
 * Uji render bagian publik halaman `/cek-status/<token>`.
 * Run: bun src/components/cekStatus/cekStatus.render.test.tsx
 *
 * Halaman utuhnya memanggil Convex (useQuery/useMutation), kamera, dan GPS,
 * sehingga tidak bisa dirender di luar aplikasi. Dua bagian murni — kartu
 * verifikasi dan ringkasan tagihan — dirender di sini, dan yang dijaga adalah
 * hal-hal yang tidak boleh salah pada halaman yang dibuka peminjam:
 *  - nominal diformat rupiah (bukan angka mentah/NaN),
 *  - nomor referensi & status tampil apa adanya,
 *  - status verifikasi TIDAK pernah diklaim "sudah" bila belum,
 *  - pengambilan foto & lokasi DINYATAKAN terbuka sebelum peminjam menekan tombol.
 */
import { renderToStaticMarkup } from "react-dom/server";

import {
  KartuVerifikasi,
  PENJELASAN_VERIFIKASI,
} from "@/components/cekStatus/KartuVerifikasi";
import { RingkasanTagihan } from "@/components/cekStatus/RingkasanTagihan";

let passed = 0;
let failed = 0;
function ok(syarat: boolean, label: string): void {
  if (syarat) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${label}`);
  }
}
function ada(html: string, teks: string, label: string): void {
  ok(html.includes(teks), `${label} (memuat "${teks}")`);
}
function tidakAda(html: string, teks: string, label: string): void {
  ok(!html.includes(teks), `${label} (tidak memuat "${teks}")`);
}
function bersih(html: string, label: string): void {
  tidakAda(html, "undefined", `${label} tanpa "undefined"`);
  tidakAda(html, "[object Object]", `${label} tanpa "[object Object]"`);
  tidakAda(html, "NaN", `${label} tanpa "NaN"`);
}

// ===== Kartu verifikasi: keadaan siap =====
const SIAP = renderToStaticMarkup(
  <KartuVerifikasi status="siap" pesan={null} onMulai={() => {}} sudahVerifikasi={false} />,
);
ada(SIAP, "Verifikasi identitas &amp; lokasi", "judul verifikasi tampil");
ada(SIAP, "Izinkan &amp; mulai verifikasi", "tombol mulai verifikasi tampil");
ada(SIAP, "kamera", "kartu menyebut kamera");
ada(SIAP, "10 detik", "kartu menyebut pembaruan lokasi tiap 10 detik");

// Ketiga kalimat penjelasan wajib tampil utuh — inilah wujud keterbukaan
// pengambilan foto & lokasi sebelum izin diminta.
for (const [i, baris] of PENJELASAN_VERIFIKASI.entries()) {
  ok(SIAP.includes(baris.replace(/&/g, "&amp;")), `penjelasan verifikasi #${i + 1} tampil`);
}
tidakAda(SIAP, "tidak disimpan", "kartu tidak menjanjikan foto tidak disimpan");
ada(SIAP, "Lokasi perangkat ikut dicatat", "lokasi dinyatakan dicatat secara terbuka");
bersih(SIAP, "kartu siap");

// ===== Kartu verifikasi: proses, gagal, selesai =====
const PROSES = renderToStaticMarkup(
  <KartuVerifikasi status="memproses" pesan={null} onMulai={() => {}} sudahVerifikasi={false} />,
);
ok(PROSES.includes("disabled"), "tombol dinonaktifkan selama proses berjalan");

const GAGAL = renderToStaticMarkup(
  <KartuVerifikasi
    status="gagal"
    pesan="Akses kamera ditolak. Izinkan kamera untuk halaman ini, lalu coba lagi."
    onMulai={() => {}}
    sudahVerifikasi={false}
  />,
);
ada(GAGAL, "Akses kamera ditolak", "pesan galat tampil apa adanya");
ada(GAGAL, "alert", "pesan galat diumumkan ke pembaca layar");

const SELESAI = renderToStaticMarkup(
  <KartuVerifikasi status="selesai" pesan="Verifikasi diterima." onMulai={() => {}} sudahVerifikasi />,
);
ada(SELESAI, "Verifikasi sudah diterima", "kartu menandai verifikasi diterima");
ada(SELESAI, "Verifikasi ulang", "tombol berubah menjadi verifikasi ulang");

// ===== Ringkasan tagihan =====
const RINGKASAN = {
  namaLengkap: "Asep Firman Hanafi",
  nomorReferensi: "PNJ-2026-0012",
  statusLabel: "Didanai",
  pokokPinjaman: 2_000_000,
  tenorTeks: "1 bulan",
  diajukanPada: Date.UTC(2026, 7, 12),
  totalKewajiban: 2_240_000,
  totalTanpaDenda: 2_240_000,
  dendaTerlambat: 0,
  jatuhTempoPada: Date.UTC(2026, 8, 12),
  tanggalJatuhTempo: "12 Sep 2026",
  sisaHari: 3,
  hariTerlambat: 0,
};

const KWITANSI = renderToStaticMarkup(
  <RingkasanTagihan ringkasan={RINGKASAN} terverifikasi />,
);
ada(KWITANSI, "Asep Firman Hanafi", "nama peminjam tampil");
ada(KWITANSI, "PNJ-2026-0012", "nomor referensi tampil");
ada(KWITANSI, "Didanai", "status tampil");
ada(KWITANSI, "Rp 2.240.000", "total kewajiban diformat rupiah");
ada(KWITANSI, "Rp 2.000.000", "pokok pinjaman diformat rupiah");
ada(KWITANSI, "12 Sep 2026", "tanggal jatuh tempo tampil");
ada(KWITANSI, "Sisa 3 hari menuju jatuh tempo.", "kalimat hitung hari tampil");
ada(KWITANSI, "Verifikasi diterima", "status verifikasi tampil");
tidakAda(KWITANSI, "Belum terverifikasi", "kwitansi terverifikasi tidak menyatakan sebaliknya");
bersih(KWITANSI, "kwitansi");

// Tanpa verifikasi: tetap terbuka, tetapi statusnya jujur.
const TANPA_VERIFIKASI = renderToStaticMarkup(
  <RingkasanTagihan ringkasan={RINGKASAN} terverifikasi={false} />,
);
ada(TANPA_VERIFIKASI, "Belum terverifikasi", "kwitansi menyatakan belum terverifikasi");
ada(TANPA_VERIFIKASI, "petugas PINDAI", "menjelaskan bahwa petugas dapat melihat statusnya");

// Pinjaman terlambat: denda disebut dan nadanya tetap informatif.
const TERLAMBAT = renderToStaticMarkup(
  <RingkasanTagihan
    ringkasan={{
      ...RINGKASAN,
      hariTerlambat: 4,
      sisaHari: 0,
      dendaTerlambat: 80_000,
      totalKewajiban: 2_320_000,
    }}
    terverifikasi
  />,
);
ada(TERLAMBAT, "Terlambat 4 hari dari tanggal jatuh tempo.", "keterlambatan dihitung apa adanya");
ada(TERLAMBAT, "Termasuk denda keterlambatan Rp 80.000", "denda keterlambatan disebut");
ada(TERLAMBAT, "Rp 2.320.000", "total kewajiban termasuk denda diformat rupiah");
bersih(TERLAMBAT, "kwitansi terlambat");

// Pinjaman yang belum didanai: angka tidak dikarang.
const BELUM_DIDANAI = renderToStaticMarkup(
  <RingkasanTagihan
    ringkasan={{
      ...RINGKASAN,
      statusLabel: "Diajukan",
      totalKewajiban: null,
      totalTanpaDenda: null,
      dendaTerlambat: null,
      jatuhTempoPada: null,
      tanggalJatuhTempo: null,
      sisaHari: null,
      tenorTeks: null,
    }}
    terverifikasi
  />,
);
ada(
  BELUM_DIDANAI,
  "Pinjaman ini belum memiliki kewajiban berjalan.",
  "kewajiban kosong dijelaskan, bukan diisi angka karangan",
);
ada(BELUM_DIDANAI, "—", "nilai kosong tampil sebagai tanda pisah");
bersih(BELUM_DIDANAI, "kwitansi belum didanai");

if (failed > 0) {
  console.error(`\n${failed} gagal, ${passed} lulus`);
  throw new Error(`${failed} tes render cek status gagal`);
}
console.log(`cek status (render): ${passed} lulus`);
