/**
 * Uji render peringatan risiko + kesehatan portofolio ruang pendana.
 * Run: bun src/components/penyediaDana/RisikoPendanaan.render.test.tsx
 *
 * Yang dijaga di sini tidak bisa ditangkap galat tipe:
 * - kalimat banner harus SAMA PERSIS dengan teks yang disetujui pendana di
 *   `RISK_TEXT_VERSION = 1` (kalau berbeda, persetujuan yang tersimpan jadi
 *   tidak bermakna);
 * - dua belas poin risiko harus benar-benar ada di markup, bukan hanya di
 *   konfigurasi;
 * - kata "jaminan" hanya boleh muncul dalam bentuk penyangkalan;
 * - kartu kesehatan hanya berwarna peringatan saat angkanya lebih dari nol.
 *
 * Dirender lewat react-dom/server (tanpa DOM, tanpa browser).
 */
import { renderToStaticMarkup } from "react-dom/server";

import { KesehatanPortofolio } from "./KesehatanPortofolio";
import { BannerRisikoPendanaan, PanelRisikoPendanaan } from "./RisikoPendanaan";
import { POIN_RISIKO_PENDANAAN, RISK_TEXT_VERSION, TEKS_BANNER_RISIKO } from "@/lib/teksRisikoPendanaan";

let lulus = 0;
let gagal = 0;
function cek(nama: string, syarat: boolean, info?: string): void {
  if (syarat) lulus += 1;
  else {
    gagal += 1;
    console.error(`FAIL ${nama}${info === undefined ? "" : ` — ${info}`}`);
  }
}
/** Teks sebagaimana React menuliskannya di HTML. */
const teksHtml = (teks: string) => teks.replace(/&/g, "&amp;");
const cacah = (teks: string, jarum: string) => teks.split(jarum).length - 1;

const banner = renderToStaticMarkup(<BannerRisikoPendanaan />);
// Panel dirender dengan SEMUA poin terbuka: isi accordion yang tertutup tidak
// ikut dirender saat render statis, jadi tanpa ini isi ke-12 poin tidak dapat
// diperiksa lewat markup. Props ini ada khusus untuk keperluan uji tersebut.
const panel = renderToStaticMarkup(
  <PanelRisikoPendanaan bukaAwal={POIN_RISIKO_PENDANAAN.map((poin) => poin.nomor)} />,
);

// ===== 1. Banner =====
// Versi 2: istilah biaya 5% berubah dari "potongan admin" menjadi "biaya
// platform (layanan)", jadi persetujuan versi lama tidak lagi mewakili teksnya.
cek("1a versi teks risiko naik ke 3 setelah istilah porsi platform berubah", RISK_TEXT_VERSION === 3);
cek(
  "1b banner memuat kalimat lengkap yang disetujui pendana",
  banner.includes(teksHtml(TEKS_BANNER_RISIKO)),
);
cek("1c banner punya ikon peringatan", banner.includes("lucide-triangle-alert") || banner.includes("svg"));
cek("1d banner berlatar hangat krem", banner.includes("bg-amber-50"));
cek("1e tautan menggulir ke panel risiko", banner.includes('href="#risiko-pendanaan"'));
cek(
  "1f banner tidak bisa ditutup permanen (tanpa tombol tutup)",
  !banner.includes("<button") && !banner.includes("Tutup"),
);

// ===== 2. Panel dua belas poin =====
cek("2a panel punya jangkar risiko-pendanaan", panel.includes('id="risiko-pendanaan"'));
cek(
  "2b dua belas poin risiko benar-benar dirender",
  POIN_RISIKO_PENDANAAN.length === 12 &&
    POIN_RISIKO_PENDANAAN.every(
      (poin) => panel.includes(`${poin.nomor}.`) && panel.includes(teksHtml(poin.judul)),
    ),
  `poin: ${POIN_RISIKO_PENDANAAN.length}`,
);
cek(
  "2c setiap poin punya penjelasan 1-2 kalimat",
  POIN_RISIKO_PENDANAAN.every((poin) => poin.isi.length > 40 && panel.includes(teksHtml(poin.isi))),
);
cek(
  "2d status penjaminan ditulis apa adanya",
  panel.includes("tidak dijamin oleh LPS atau pihak lain"),
);
cek(
  "2e catatan internal dinyatakan bukan bukti transaksi",
  panel.includes("bukan bukti transaksi"),
);
cek(
  "2f kata jaminan hanya dalam bentuk penyangkalan (diperiksa pada teksnya, bukan pada markup)",
  [TEKS_BANNER_RISIKO, ...POIN_RISIKO_PENDANAAN.map((poin) => `${poin.judul} ${poin.isi}`)].every(
    (teks) => !/\bjaminan\b/.test(teks.replace(/bukan jaminan/g, "")),
  ),
);
cek("2g tanpa NaN", !panel.includes("NaN") && !banner.includes("NaN"));
cek("2h tanpa undefined", !panel.includes("undefined") && !banner.includes("undefined"));

// ===== 2b. Panel terlipat secara bawaan =====
// Dua belas judul poin yang selalu terbuka menghabiskan setengah layar sebelum
// pembaca melihat angka keuntungan, jadi bagiannya tertutup dan hanya kepalanya
// yang tampak — dengan ringkasannya, supaya keadaannya tidak disembunyikan.
{
  const tertutup = renderToStaticMarkup(<PanelRisikoPendanaan />);
  cek(
    "2i kepala panel tetap terbaca saat tertutup",
    tertutup.includes("Risiko pendanaan") &&
      tertutup.includes("12 hal yang perlu Anda tahu sebelum mendanai"),
  );
  cek(
    "2j isi dua belas poin tidak ikut dirender saat tertutup",
    !tertutup.includes("Gagal bayar") && !tertutup.includes("Keterlambatan"),
  );
  cek(
    "2k tombolnya menyatakan keadaan tertutup dan mengarah ke isinya",
    tertutup.includes('aria-expanded="false"') && tertutup.includes(">Buka<"),
  );
  cek("2l tanpa NaN/undefined saat tertutup", !/NaN|undefined/.test(tertutup));

  const terbuka = renderToStaticMarkup(<PanelRisikoPendanaan bukaAwal={[1]} />);
  cek(
    "2m tombolnya menyatakan keadaan terbuka",
    terbuka.includes('aria-expanded="true"') && terbuka.includes(">Tutup<"),
  );
  cek(
    "2n judul poinnya dipasang tiga kolom saat dibuka",
    terbuka.includes("lg:grid-cols-3"),
  );
  cek(
    "2o isi terbuka tetap memuat judul poinnya",
    terbuka.includes("Gagal bayar") && terbuka.includes("Keterlambatan"),
  );
}

// ===== 3. Kesehatan portofolio =====
const tenang = renderToStaticMarkup(
  <KesehatanPortofolio
    angka={{
      jatuhTempoSegera: { jumlah: 0, nominal: 0 },
      terlambat: { jumlah: 0, nominal: 0 },
      persenTerlambat: 0,
      belumTerhubung: { jumlah: 0, nominal: 0 },
    }}
  />,
);
const bermasalah = renderToStaticMarkup(
  <KesehatanPortofolio
    angka={{
      jatuhTempoSegera: { jumlah: 2, nominal: 1_500_000 },
      terlambat: { jumlah: 1, nominal: 750_000 },
      persenTerlambat: 25,
      belumTerhubung: { jumlah: 1, nominal: 1_000_000 },
    }}
  />,
);
cek("3a empat kartu kesehatan tampil", cacah(tenang, "rounded-lg border px-4 py-3") === 4);
cek(
  "3b nilai nol tidak diberi warna peringatan",
  !tenang.includes("bg-amber-50/70"),
);
cek(
  "3c nilai lebih dari nol diberi warna peringatan",
  cacah(bermasalah, "bg-amber-50/70") === 4,
);
cek("3d rasio keterlambatan ditampilkan satu desimal", bermasalah.includes("25.0%"));
cek(
  "3e catatan mikro keterlambatan muncul hanya saat ada yang terlambat",
  bermasalah.includes("menurunkan peluang dana kembali tepat waktu") &&
    !tenang.includes("menurunkan peluang dana kembali tepat waktu"),
);
cek(
  "3f peringatan pinjaman tanpa pendana ditampilkan apa adanya",
  bermasalah.includes("1 pinjaman belum terhubung ke pendana") &&
    !tenang.includes("belum terhubung ke pendana"),
);
cek("3g nominal diformat rupiah", bermasalah.includes("Rp 1.500.000") && bermasalah.includes("Rp 750.000"));
cek("3h tanpa NaN", !bermasalah.includes("NaN") && !tenang.includes("NaN"));

console.log(`risiko-pendanaan.render: ${lulus} lulus, ${gagal} gagal`);
if (gagal > 0) process.exit(1);
