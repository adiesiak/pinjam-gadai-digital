/**
 * Run: bun src/components/admin/SuratSomasi.render.test.tsx
 *
 * Uji render panel surat somasi lewat react-dom/server. Yang dijaga: keadaan
 * belum tersedia menyebut alasannya, pratinjau menampilkan isi yang sama dengan
 * berkas, dan tombol unduh punya keadaan bekerja serta kabar hasil.
 */
import { renderToStaticMarkup } from "react-dom/server";

import { BagianSuratSomasi, type HasilSomasi } from "./SuratSomasi";

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

const TERSEDIA: HasilSomasi = {
  tersedia: true,
  namaBerkas: "somasi-pnj-2026-0042.pdf",
  surat: {
    nomorSurat: "SOMASI/PNJ-2026-0042/20261019",
    perihal: "Somasi keterlambatan pembayaran pinjaman",
    tanggalTeks: "19 Oktober 2026",
    batasBayarPada: Date.UTC(2026, 9, 26),
    batasBayarTeks: "26 Oktober 2026",
    kepada: "Rani Peminjam",
    paragraf: [
      "Dengan hormat, kami menyampaikan pemberitahuan keterlambatan pembayaran pinjaman PNJ-2026-0042.",
      "Keterlambatan tercatat 10 hari.",
    ],
    rincian: [
      { label: "Pokok pinjaman", nilai: "Rp500.000" },
      { label: "Denda keterlambatan (10 hari)", nilai: "Rp100.000" },
      { label: "Total yang harus dibayar", nilai: "Rp750.000" },
    ],
    instruksiBayar: [
      "Transfer ke rekening usaha BCA 1234567890 atas nama PT PINDAI.",
      "Cantumkan nomor referensi PNJ-2026-0042 pada berita transfer.",
    ],
    penutup: [
      "Kami meminta Anda menyelesaikan total kewajiban paling lambat 26 Oktober 2026.",
      "Surat ini bukan putusan pengadilan.",
    ],
    pembuat: "Tim Penagihan PINDAI",
    dibuatPada: Date.UTC(2026, 9, 19, 3, 0),
  },
};

const tanpaAksi = () => {};

function gambar(props: Partial<Parameters<typeof BagianSuratSomasi>[0]> = {}): string {
  return renderToStaticMarkup(
    <BagianSuratSomasi
      hasil={TERSEDIA}
      terbuka={false}
      sibuk={false}
      kabar={null}
      galat={null}
      onToggle={tanpaAksi}
      onUnduh={tanpaAksi}
      {...props}
    />,
  );
}

const memuat = gambar({ hasil: undefined });
ada(memuat, "Menyusun surat somasi", "keadaan memuat");
tidakAda(memuat, "Unduh PDF", "keadaan memuat tanpa tombol");

const belum = gambar({
  hasil: { tersedia: false, alasan: "Pinjaman belum melewati jatuh tempo." },
});
ada(belum, "Pinjaman belum melewati jatuh tempo.", "alasan belum tersedia");
tidakAda(belum, "Unduh PDF", "tanpa tombol saat belum tersedia");

const tertutup = gambar();
ada(tertutup, "SOMASI/PNJ-2026-0042/20261019", "nomor surat tampil");
ada(tertutup, "batas bayar 26 Oktober 2026", "batas bayar tampil");
ada(tertutup, "Unduh PDF", "tombol unduh");
ada(tertutup, "Pratinjau surat", "tombol pratinjau");
tidakAda(tertutup, "Kepada", "pratinjau tertutup");

const terbuka = gambar({ terbuka: true });
ada(terbuka, "Surat Somasi", "judul surat di pratinjau");
ada(terbuka, "Kepada", "blok penerima");
ada(terbuka, "Rani Peminjam", "nama penerima");
ada(terbuka, "Rp750.000", "total kewajiban");
ada(terbuka, "Transfer ke rekening usaha", "instruksi pembayaran");
ada(terbuka, "Tim Penagihan PINDAI", "pembuat surat");

const sedang = gambar({ sibuk: true });
ada(sedang, 'aria-busy="true"', "tombol unduh menandai sedang bekerja");
ada(sedang, 'disabled=""', "tombol unduh terkunci saat bekerja");

const denganGalat = gambar({ galat: "Pinjaman tidak ditemukan." });
ada(denganGalat, 'role="alert"', "galat memakai alert");
const denganKabar = gambar({ kabar: "Surat disimpan sebagai somasi-pnj-2026-0042.pdf." });
ada(denganKabar, 'role="status"', "kabar memakai status");

for (const [nama, html] of Object.entries({ memuat, belum, tertutup, terbuka, denganGalat })) {
  tidakAda(html, "\u2014", `${nama} tanpa em dash`);
}

console.log(`SuratSomasi: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
