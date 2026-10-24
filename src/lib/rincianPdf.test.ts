/**
 * Uji dokumen PDF rincian pinjaman.
 * Run: bun src/lib/rincianPdf.test.ts
 *
 * Yang dijaga: berkas yang dilampirkan ke email dan WhatsApp benar-benar PDF
 * yang bisa dibuka, memuat nomor referensi dan nominal yang sama dengan dokumen
 * sumber, dan tidak menjadi kosong saat nama peminjam memuat karakter di luar
 * Latin-1 (font standar PDF tidak mengenal emoji).
 */
import { susunRincianPinjaman, type PinjamanUntukRincian } from "./rincianPinjaman";
import { buatPdfRincian } from "./rincianPdf";
import { teksPdf } from "./pdfSederhana";

let passed = 0;
let failed = 0;
function ok(syarat: boolean, label: string): void {
  if (syarat) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${label}`);
  }
}

const SEKARANG = Date.UTC(2026, 9, 19, 4, 0, 0);

const pinjaman: PinjamanUntukRincian = {
  nomorReferensi: "PNJ-2026-0042",
  namaLengkap: "Rani Peminjam",
  status: "didanai",
  pokokPinjaman: 1_000_000,
  tenorHari: 90,
  tenorBulan: 3,
  didanaiPada: SEKARANG - 5 * 86_400_000,
  diajukanPada: SEKARANG - 8 * 86_400_000,
  nomorRekening: "1234567890",
};

const dokumen = susunRincianPinjaman(pinjaman, { sekarang: SEKARANG, dendaPerHari: 2 });
const byte = buatPdfRincian(dokumen);
const teks = teksPdf(byte);

ok(teks.startsWith("%PDF-1.4"), "berkas dimulai dengan penanda PDF");
ok(teks.trimEnd().endsWith("%%EOF"), "berkas ditutup dengan penanda akhir");
ok(teks.includes("/Count 1") || /\/Count \d/.test(teks), "jumlah halaman tercatat di katalog");
ok(teks.includes("PNJ-2026-0042"), "nomor referensi ada di dokumen");
ok(teks.includes("Rani Peminjam"), "nama peminjam ada di dokumen");
ok(teks.includes("Rp 1.000.000"), "pokok pinjaman ada di dokumen");
ok(teks.includes("Jadwal cicilan"), "skema bulanan memuat jadwal cicilan");
ok(teks.includes("Bulan 1"), "baris cicilan pertama ada");
ok(teks.includes("bukan bukti pembayaran"), "catatan penutup ikut tercetak");
ok(teks.includes("RINCIAN PINJAMAN DIGITAL"), "banner dokumen tercetak");
ok(teks.includes("Rincian Dana Yang Diterima"), "bagian dana diterima ada");
ok(teks.includes("Rincian Kewajiban Pengembalian"), "bagian kewajiban ada");
ok(teks.includes("Himbauan Keamanan Transaksi"), "peringatan keamanan ada");
ok(
  teks.includes("PINDAI tidak pernah meminta kode OTP, PIN, atau kata sandi"),
  "pesan keamanan memakai kalimat lengkap",
);
ok(teks.includes("Dana bersih ke rekening"), "baris dana bersih ada");
ok(teks.includes("-Rp "), "potongan biaya diberi tanda minus");
ok(teks.includes("Halaman 1 dari"), "kaki halaman menyebut nomor halaman");
ok(teks.includes("**** 7890"), "rekening tujuan tampil dalam bentuk tersamarkan");

// Nama warisan bisa memuat emoji atau tanda kutip miring. Font standar PDF
// memakai Latin-1, jadi karakter di luarnya harus dinormalkan, bukan
// menggagalkan seluruh berkas.
const aneh = teksPdf(
  buatPdfRincian({ ...dokumen, namaPeminjam: "Rani “Emoji” 😀 <Test>" }),
);
ok(aneh.startsWith("%PDF-1.4"), "nama dengan karakter asing tetap menghasilkan PDF");
ok(aneh.includes('Rani "Emoji" ? <Test>'), "karakter asing dinormalkan ke Latin-1");

// Skema harian tanpa tabel cicilan tetap menghasilkan dokumen satu halaman.
const harian = teksPdf(
  buatPdfRincian(
    susunRincianPinjaman(
      { ...pinjaman, tenorBulan: null, tenorHari: 30, pokokPinjaman: 500_000 },
      { sekarang: SEKARANG, dendaPerHari: 2 },
    ),
  ),
);
ok(harian.startsWith("%PDF-1.4"), "skema harian menghasilkan PDF");
ok(harian.includes("Rp 650.000"), "total kewajiban harian tercetak");
ok(!harian.includes("Jadwal cicilan"), "skema harian tanpa tabel cicilan");

/* ===== Tata letak tabel =====
 * Huruf yang menyentuh garis tabel membuat dokumen keuangan sulit dibaca dan
 * terlihat tidak resmi. Teks harus duduk di dalam barisnya dengan jarak yang
 * cukup ke garis atas maupun bawah, dan nominal harus sebaris dengan labelnya.
 */

type TeksBerposisi = { ukuran: number; x: number; y: number; teks: string };
type HalamanBerposisi = { garis: number[]; teks: TeksBerposisi[] };

function posisiHalaman(pdf: string): HalamanBerposisi[] {
  const aliran = [...pdf.matchAll(/stream\n([\s\S]*?)endstream/g)].map(
    (m) => m[1],
  );
  return aliran.map((isi) => ({
    garis: [
      ...isi.matchAll(
        /([\d.]+ [\d.]+ [\d.]+) RG [\d.]+ w ([\d.]+) ([\d.]+) m ([\d.]+) ([\d.]+) l S/g,
      ),
    ]
      .filter((m) => Math.abs(Number(m[3]) - Number(m[5])) < 0.01)
      .map((m) => Number(m[3])),
    teks: [
      ...isi.matchAll(
        /\/(F1|F2) ([\d.]+) Tf 1 0 0 1 ([\d.]+) ([\d.]+) Tm \(((?:[^()\\]|\\.)*)\) Tj/g,
      ),
    ].map((m) => ({
      ukuran: Number(m[2]),
      x: Number(m[3]),
      y: Number(m[4]),
      teks: (m[5] ?? "").replace(/\\([()\\])/g, "$1"),
    })),
  }));
}

const posisi = posisiHalaman(teks);
const menembusGaris = posisi.flatMap((halaman, i) =>
  halaman.teks
    // Kaki halaman memang berada di bawah garis kaki.
    .filter((t) => t.y >= 58)
    .filter((t) =>
      halaman.garis.some(
        (garis) =>
          garis > t.y - t.ukuran * 0.21 && garis < t.y + t.ukuran * 0.72,
      ),
    )
    .map((t) => `H${i + 1} "${t.teks}" y=${t.y}`),
);
ok(
  menembusGaris.length === 0,
  `tidak ada huruf yang menembus garis tabel${menembusGaris.length > 0 ? `: ${menembusGaris.join(", ")}` : ""}`,
);

// Satu halaman, supaya koordinat teks dan garis berasal dari lembar yang sama.
const halamanTabel = posisi.find((halaman) =>
  halaman.teks.some((t) => t.teks === "1. Rincian Dana Yang Diterima"),
);
const judulDana = halamanTabel?.teks.find(
  (t) => t.teks === "1. Rincian Dana Yang Diterima",
);
const peringatan = halamanTabel?.teks.find((t) => t.teks.startsWith("! Himbauan"));
ok(
  judulDana !== undefined && peringatan !== undefined,
  "tabel dana, tabel kewajiban, dan peringatan tercetak di satu halaman",
);
const barisTabel = (halamanTabel?.teks ?? []).filter(
  (t) =>
    t.ukuran === 8.2 &&
    judulDana !== undefined &&
    peringatan !== undefined &&
    t.y < judulDana.y &&
    t.y > peringatan.y,
);
const nominal = barisTabel.filter(
  (t) => t.teks.startsWith("Rp ") || t.teks.startsWith("-Rp "),
);
const nominalTanpaLabel = nominal.filter(
  (t) =>
    !barisTabel.some(
      (label) => Math.abs(label.y - t.y) < 0.01 && label.x < t.x - 20,
    ),
);
ok(nominal.length >= 4, "tabel dana dan kewajiban memuat nominal");
ok(
  nominalTanpaLabel.length === 0,
  `nominal sebaris dengan labelnya${nominalTanpaLabel.length > 0 ? `: ${nominalTanpaLabel.map((t) => t.teks).join(", ")}` : ""}`,
);

// Jarak napas ke garis atas dan bawah: baris tabel yang teksnya menempel di
// garis terbaca seperti coretan, bukan dokumen resmi.
const garisTabel = (halamanTabel?.garis ?? []).filter(
  (y) =>
    judulDana !== undefined &&
    peringatan !== undefined &&
    y < judulDana.y &&
    y > peringatan.y,
);
const terlaluRapat = barisTabel.filter((t) => {
  const naik = t.y + t.ukuran * 0.72;
  const turun = t.y - t.ukuran * 0.21;
  const garisAtas = garisTabel.filter((y) => y > t.y).sort((a, b) => a - b)[0];
  const garisBawah = garisTabel.filter((y) => y < t.y).sort((a, b) => b - a)[0];
  return (
    (garisAtas !== undefined && garisAtas - naik < 5) ||
    (garisBawah !== undefined && turun - garisBawah < 4)
  );
});
ok(
  terlaluRapat.length === 0,
  `teks tabel punya jarak ke garis${terlaluRapat.length > 0 ? `: ${terlaluRapat.map((t) => `"${t.teks}" y=${t.y}`).join(", ")}` : ""}`,
);

console.log(`rincianPdf: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
