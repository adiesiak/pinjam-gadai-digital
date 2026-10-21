/**
 * Uji render kartu BATAS PINJAMAN dashboard (`summary-cards.tsx`), tanpa DOM.
 * Run: bun src/pages/dashboard/summary-cards.render.test.tsx
 *
 * Yang dijaga: angka batas di dashboard berasal dari ringkasan SERVER
 * (`nasabah.plafonRingkasSaya` = plafon master − pokok pinjaman berjalan), bukan
 * dari batas Rp10 juta yang ditulis di layar. Sebelumnya kartu ini menghitung
 * sendiri terhadap Rp10 juta, sehingga bisa berbunyi "tersedia Rp 9.000.000"
 * untuk nasabah yang batasnya Rp1 juta — berlawanan dengan formulir pengajuan
 * dan validasi `loans.createLoanApplication`.
 *
 * Empat keadaan diuji: tanpa utang, ada pinjaman berjalan, sisa habis, dan
 * batas belum termuat. Terakhir, sumber layar diperiksa supaya tidak ada layar
 * nasabah yang kembali menulis batasnya sendiri.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";

import { formatRupiah } from "@/lib/money";
import {
  kalimatBatasPlafon,
  PLAFON_NAIK_SETELAH_LUNAS,
  type RingkasanPlafon,
} from "@/lib/plafon";

import { KartuBatasPinjaman, KartuProgresPlafon } from "./summary-cards";

let passed = 0;
let failed = 0;

function ok(label: string, syarat: boolean) {
  if (syarat) {
    passed += 1;
  } else {
    failed += 1;
    console.error(`✗ ${label}`);
  }
}

/** Isi berkas sumber relatif terhadap `src/` (mis. "pages/Dashboard.tsx"). */
function bacaSumber(relatif: string): string {
  return readFileSync(fileURLToPath(new URL(`../../${relatif}`, import.meta.url)), "utf8");
}

/** Nama aksesibel angka kepala kartu — satu-satunya tempat angka batas ditulis. */
function labelAngkaBatas(rupiah: number): string {
  return `aria-label="Batas pinjaman yang bisa diajukan ${formatRupiah(rupiah)}"`;
}

// ===== 1. Tanpa pinjaman berjalan: batas = plafon nasabah =====
const htmlLaporan = renderToStaticMarkup(
  <KartuBatasPinjaman
    ringkas={{ maksimal: 1_000_000, terpakai: 0, tersedia: 1_000_000, jumlahAktif: 0 }}
  />,
);
ok("kartu menyebut batas yang bisa diajukan", htmlLaporan.includes("Batas pinjaman yang bisa diajukan"));
ok("angka batas = plafon nasabah dari server", htmlLaporan.includes(labelAngkaBatas(1_000_000)));
ok("label lama \"Limit Plafon Tersedia\" tidak dipakai lagi", !htmlLaporan.includes("Limit Plafon Tersedia"));
ok("tanpa utang tidak ada bar terpakai", !htmlLaporan.includes("Terpakai "));
ok("kartu menyebut kebijakan kenaikan batas", htmlLaporan.includes(formatRupiah(PLAFON_NAIK_SETELAH_LUNAS)));

// ===== 2. Ada pinjaman berjalan: maksimal, terpakai, dan sisa dibedakan =====
const RINGKAS_UTANG: RingkasanPlafon = {
  maksimal: 1_500_000,
  terpakai: 500_000,
  tersedia: 1_000_000,
  jumlahAktif: 1,
};
const htmlUtang = renderToStaticMarkup(<KartuBatasPinjaman ringkas={RINGKAS_UTANG} />);
ok(
  "kalimat batas memakai angka maksimal/terpakai/sisa yang sama dengan server",
  htmlUtang.includes(kalimatBatasPlafon(RINGKAS_UTANG)),
);
ok(
  "bar pemakaian menyebut terpakai dari maksimal",
  htmlUtang.includes(`Terpakai ${formatRupiah(500_000)} dari ${formatRupiah(1_500_000)}`),
);
ok("angka kepala = sisa yang bisa diajukan, bukan maksimal", htmlUtang.includes(labelAngkaBatas(1_000_000)));
ok("angka kepala bukan plafon maksimal", !htmlUtang.includes(labelAngkaBatas(1_500_000)));

// ===== 3. Sisa habis (pinjaman berjalan melebihi plafon) =====
const htmlHabis = renderToStaticMarkup(
  <KartuBatasPinjaman
    ringkas={{ maksimal: 1_000_000, terpakai: 1_400_000, tersedia: 0, jumlahAktif: 2 }}
  />,
);
ok("sisa habis ditampilkan sebagai Rp 0", htmlHabis.includes(labelAngkaBatas(0)));
ok(
  "sisa habis dijelaskan lewat kalimat batas",
  htmlHabis.includes("yang bisa diajukan sekarang Rp 0"),
);

// ===== 4. Batas belum termuat: tidak mengarang angka =====
const htmlMuat = renderToStaticMarkup(<KartuBatasPinjaman ringkas={null} />);
ok("belum termuat tidak menyebut nominal apa pun", !/Rp \d/.test(htmlMuat));
ok("belum termuat menjelaskan keadaannya", htmlMuat.includes("sedang dibaca"));

// ===== 4b. Progres plafon: satu langkah untuk membuka Rp1 juta =====
const htmlProgresBaru = renderToStaticMarkup(
  <KartuProgresPlafon
    data={{ plafonEfektif: 500_000, jumlahPelunasanTepatWaktu: 0, riwayat: [] }}
  />,
);
ok("kartu progres berjudul jelas", htmlProgresBaru.includes("Riwayat Progres Plafon"));
ok("level awal disebut Nasabah Baru", htmlProgresBaru.includes("Nasabah Baru"));
ok("limit aktif Rp500.000 tampil", htmlProgresBaru.includes(formatRupiah(500_000)));
ok(
  "langkah menuju Rp1 juta dijelaskan",
  htmlProgresBaru.includes("Selesaikan 1x pinjaman tepat waktu"),
);
ok("level kedua masih terkunci", htmlProgresBaru.includes("terkunci"));

const htmlProgresTeruji = renderToStaticMarkup(
  <KartuProgresPlafon
    data={{
      plafonEfektif: PLAFON_NAIK_SETELAH_LUNAS,
      jumlahPelunasanTepatWaktu: 1,
      riwayat: [
        { nomorReferensi: "PGD-20261020-ABCD", pokokPinjaman: 500_000, lunasPada: 1_792_000_000_000 },
      ],
    }}
  />,
);
ok("level teruji terbuka", htmlProgresTeruji.includes("Nasabah Teruji"));
ok("riwayat pelunasan tampil", htmlProgresTeruji.includes("PGD-20261020-ABCD"));
ok("tidak menyebut level terkunci saat sudah terbuka", !htmlProgresTeruji.includes("terkunci"));

// ===== 4c. Plafon khusus admin tampil sebagai limit yang BERLAKU =====
const htmlProgresKhusus = renderToStaticMarkup(
  <KartuProgresPlafon
    data={{ plafonEfektif: 2_000_000, jumlahPelunasanTepatWaktu: 0, riwayat: [] }}
  />,
);
ok("plafon khusus diberi label sendiri", htmlProgresKhusus.includes("Limit Khusus"));
ok("angka plafon khusus tampil", htmlProgresKhusus.includes(formatRupiah(2_000_000)));
ok(
  "limit khusus tidak digambarkan sebagai tangga Rp1 juta",
  !htmlProgresKhusus.includes("Level 2 · aktif"),
);

// ===== 5. Sumber tunggal: tidak ada layar nasabah yang menulis batas sendiri =====
const sumberKartu = bacaSumber("pages/dashboard/summary-cards.tsx");
ok("kartu membaca ringkasan plafon dari server", sumberKartu.includes("nasabah.plafonRingkasSaya"));
ok("kartu tidak lagi memakai batas 10 juta sebagai plafon", !sumberKartu.includes("10_000_000"));

const sumberForm = bacaSumber("pages/dashboard/forms-views.tsx");
ok("formulir memakai ringkasan plafon server", sumberForm.includes("nasabah.plafonRingkasSaya"));
ok("formulir tidak memakai plafon maksimal sebagai batas", !sumberForm.includes("api.lokasi.plafonSaya"));
ok(
  "formulir memakai aturan & pesan galat server yang sama",
  sumberForm.includes("pokokDalamPlafon") &&
    sumberForm.includes("pesanPlafonTersediaTerlampaui") &&
    sumberForm.includes("batasDiajukan"),
);

const sumberCepat = bacaSumber("pages/dashboard/pengajuan-cepat-views.tsx");
ok("jalur pengajuan cepat memakai ringkasan plafon server", sumberCepat.includes("nasabah.plafonRingkasSaya"));
ok("jalur pengajuan cepat tidak memakai plafon maksimal", !sumberCepat.includes("api.lokasi.plafonSaya"));
ok(
  "jalur pengajuan cepat menampilkan keadaan sisa habis",
  sumberCepat.includes("batas.adaSisa"),
);

console.log(`summary-cards render tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
