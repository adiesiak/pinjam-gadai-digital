/**
 * Run: bun src/components/admin/SuratSomasi.render.test.tsx
 *
 * Uji render panel surat somasi lewat react-dom/server. Yang dijaga: surat yang
 * belum layak tidak menampilkan tombol, snapshot terbit membekukan nomor, kanal
 * kirim mati saat kontak tidak ada, dan tanda penyerahan bisa dibatalkan.
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

const SURAT = {
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
  hariTerlambat: 10,
  totalKewajiban: 750_000,
  identitas: {
    namaBadan: "PINDAI",
    alamat: "Jl. Contoh No. 1",
    email: "tagihan@pindai.test",
    telepon: "021-555-0100",
  },
};

const TERSEDIA: HasilSomasi = {
  tersedia: true,
  surat: SURAT,
  terbit: null,
  berubah: false,
  bolehKirim: true,
  alasanKirim: null,
  namaBerkas: "somasi-pnj-2026-0042.pdf",
  kontak: { email: true, whatsapp: true },
  riwayatKirim: [],
};

const TERBIT: HasilSomasi = {
  ...TERSEDIA,
  terbit: {
    nomorSurat: SURAT.nomorSurat,
    pada: Date.UTC(2026, 9, 19, 3, 0),
    olehLabel: "admin@pindai.test",
    totalKewajiban: 750_000,
    hariTerlambat: 10,
    diserahkanPada: null,
    diserahkanMelalui: null,
    diserahkanOlehLabel: null,
    tindakLanjut: null,
    tindakLanjutPada: null,
    tindakLanjutOlehLabel: null,
    tindakLanjutCatatan: null,
  },
};

const DISERAHKAN: HasilSomasi = {
  ...TERSEDIA,
  terbit: {
    nomorSurat: SURAT.nomorSurat,
    pada: Date.UTC(2026, 9, 19, 3, 0),
    olehLabel: "admin@pindai.test",
    totalKewajiban: 750_000,
    hariTerlambat: 10,
    diserahkanPada: Date.UTC(2026, 9, 20, 3, 0),
    diserahkanMelalui: "whatsapp",
    diserahkanOlehLabel: "admin@pindai.test",
    tindakLanjut: "janji_baru",
    tindakLanjutPada: Date.UTC(2026, 9, 21, 3, 0),
    tindakLanjutOlehLabel: "admin@pindai.test",
    tindakLanjutCatatan: "Janji 24 Oktober 2026.",
  },
};

const tanpaAksi = () => {};

function gambar(props: Partial<Parameters<typeof BagianSuratSomasi>[0]> = {}): string {
  return renderToStaticMarkup(
    <BagianSuratSomasi
      hasil={TERSEDIA}
      terbuka={false}
      sibuk={null}
      kabar={null}
      galat={null}
      onToggle={tanpaAksi}
      onUnduh={tanpaAksi}
      onSalin={tanpaAksi}
      onKirim={tanpaAksi}
      onSerahkan={tanpaAksi}
      onBatalSerahkan={tanpaAksi}
      onTindakLanjut={tanpaAksi}
      {...props}
    />,
  );
}

const memuat = gambar({ hasil: undefined });
ada(memuat, "Menyusun surat somasi", "keadaan memuat");
tidakAda(memuat, "Unduh PDF", "keadaan memuat tanpa tombol");

const belum = gambar({
  hasil: { tersedia: false, alasan: "Somasi baru dapat dibuat setelah keterlambatan 3 hari." },
});
ada(belum, "setelah keterlambatan 3 hari", "alasan belum tersedia");
tidakAda(belum, "Kirim WA", "tanpa kanal saat belum tersedia");

const calon = gambar();
ada(calon, "SOMASI/PNJ-2026-0042/20261019", "nomor calon surat");
ada(calon, "dibekukan saat PDF pertama diunduh", "penjelasan snapshot");
ada(calon, "Unduh PDF", "tombol unduh pertama");
ada(calon, "Salin teks", "tombol salin");
ada(calon, "Kirim WA", "tombol WhatsApp");
ada(calon, "Kirim email", "tombol email");
tidakAda(calon, "Tandai diserahkan", "belum bisa ditandai sebelum terbit");

const terbit = gambar({ hasil: TERBIT });
ada(terbit, "Unduh ulang PDF", "unduhan berikutnya");
ada(terbit, "diterbitkan 19 Oktober 2026 oleh admin@pindai.test", "metadat penerbitan");
ada(terbit, "Tandai diserahkan", "tombol tanda penyerahan");

const diserahkan = gambar({ hasil: DISERAHKAN });
ada(diserahkan, "Diserahkan 20 Oktober 2026 melalui WhatsApp", "status penyerahan");
ada(diserahkan, "Batalkan tanda", "koreksi penyerahan");
tidakAda(diserahkan, "Tandai diserahkan", "tidak menawarkan tanda ulang");
ada(diserahkan, "Catat hasil setelah surat diserahkan", "bagian tindak lanjut");
ada(diserahkan, "Ada janji pembayaran baru", "pilihan tindak lanjut");
ada(diserahkan, "Tindak lanjut:", "status tindak lanjut");
ada(diserahkan, "Janji 24 Oktober 2026.", "catatan tindak lanjut");
tidakAda(calon, "Catat hasil setelah surat diserahkan", "tindak lanjut setelah diserahkan");

const ditahan = gambar({
  hasil: {
    ...TERSEDIA,
    bolehKirim: false,
    alasanKirim: "Ada janji pembayaran aktif sampai 24 Oktober 2026.",
    kontak: { email: false, whatsapp: false },
  },
});
ada(ditahan, "Ada janji pembayaran aktif", "alasan surat ditahan");
ok(
  (ditahan.match(/disabled=""/g) ?? []).length >= 2,
  "kanal kirim terkunci saat ditahan",
);

const berubah = gambar({ hasil: { ...TERSEDIA, berubah: true } });
ada(berubah, "Kewajiban tercatat sudah berubah", "peringatan surat kedaluwarsa");

const denganRiwayat = gambar({
  hasil: {
    ...TERSEDIA,
    riwayatKirim: [
      {
        kanal: "whatsapp",
        tujuan: "628123...6789",
        status: "terkirim",
        respon: null,
        pada: Date.UTC(2026, 9, 19, 3, 0),
      },
      {
        kanal: "email",
        tujuan: "r***@pindai.test",
        status: "gagal",
        respon: "Gateway email menolak kiriman.",
        pada: Date.UTC(2026, 9, 18, 3, 0),
      },
    ],
  },
});
ada(denganRiwayat, "terkirim", "status kirim");
ada(denganRiwayat, "Gateway email menolak kiriman.", "alasan gagal");
ada(denganRiwayat, "628123...6789", "tujuan tersamar");

const terbuka = gambar({ terbuka: true });
ada(terbuka, "Surat Somasi", "judul pratinjau");
ada(terbuka, "Jl. Contoh No. 1", "alamat badan");
ada(terbuka, "Kepada", "blok penerima");
ada(terbuka, "Rp750.000", "total kewajiban");
ada(terbuka, "Tim Penagihan PINDAI", "pembuat surat");

const sedangKirim = gambar({ sibuk: "whatsapp" });
ada(sedangKirim, 'aria-busy="true"', "kanal menandai bekerja");
ada(sedangKirim, 'disabled=""', "tombol terkunci saat bekerja");

const denganGalat = gambar({ galat: "Di luar jam kontak 8:00-20:00 WIB." });
ada(denganGalat, 'role="alert"', "galat memakai alert");
const denganKabar = gambar({ kabar: "Somasi dikirim ke email rani@pindai.test." });
ada(denganKabar, 'role="status"', "kabar memakai status");

for (const [nama, html] of Object.entries({
  memuat,
  belum,
  calon,
  terbit,
  diserahkan,
  ditahan,
  berubah,
  denganRiwayat,
  terbuka,
  denganGalat,
})) {
  tidakAda(html, "\u2014", `${nama} tanpa em dash`);
}

console.log(`SuratSomasi: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
