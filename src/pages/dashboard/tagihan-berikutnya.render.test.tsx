/**
 * Uji render kartu "Tagihan berikutnya" di tab Ringkasan peminjam.
 * Run: bun src/pages/dashboard/tagihan-berikutnya.render.test.tsx
 *
 * Yang dijaga:
 *  - kartu memilih angsuran PALING AWAL dari data server, bukan grup pertama;
 *  - nominal = total angsuran + denda berjalan, dan denda disebut terpisah;
 *  - pinjaman dengan satu angsuran tidak dirender dua kali (kartu pinjaman
 *    sudah menampilkan kewajiban yang sama);
 *  - bukti yang sedang dicocokkan tidak menawarkan pembayaran ulang.
 */
import { renderToStaticMarkup } from "react-dom/server";

import { TagihanBerikutnyaRingkas } from "./angsuran-views";

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

type Props = Parameters<typeof TagihanBerikutnyaRingkas>[0];

function baris(over: Record<string, unknown>) {
  return {
    _id: "angsuran-1",
    nomor: 2,
    jatuhTempoPada: Date.UTC(2026, 10, 20),
    pokok: 1_000_000,
    bunga: 200_000,
    biayaAdmin: 24_000,
    total: 1_224_000,
    status: "belum_dibayar",
    dibayarPada: null,
    dendaDibayar: null,
    dendaBerjalan: 0,
    totalDibayar: 0,
    tampilan: "belum",
    hariTerlambat: 0,
    sisaHari: 10,
    ...over,
  };
}

function dataUji(grup: Array<Record<string, unknown>>): Props["data"] {
  return { grup, ringkasan: {} } as unknown as Props["data"];
}

function grupUji(over: Record<string, unknown>) {
  return {
    loanId: "loan-1",
    nomorReferensi: "PGD-UJI-1",
    tenorBulan: 6,
    tenorHari: 180,
    ringkasan: { jumlah: 6, berikutnya: baris({}) },
    angsuran: [],
    ...over,
  };
}

const tampil = renderToStaticMarkup(
  <TagihanBerikutnyaRingkas data={dataUji([grupUji({})])} onBukaCicilan={() => {}} />,
);
ada(tampil, "Tagihan berikutnya", "kartu diberi judul");
ada(tampil, "PGD-UJI-1", "nomor referensi tampil");
ada(tampil, "Rp 1.224.000", "nominal dari total angsuran");
ada(tampil, "Angsuran 2 dari 6", "nomor angsuran dan jumlahnya jelas");
ada(tampil, "Buka halaman Cicilan", "ada jalan ke halaman pembayaran");
ok(!tampil.includes("denda"), "tanpa denda bila denda nol");

// Tagihan telat: denda tampil terpisah dan nominalnya ikut bertambah.
const telat = renderToStaticMarkup(
  <TagihanBerikutnyaRingkas
    data={dataUji([
      grupUji({
        ringkasan: {
          jumlah: 6,
          berikutnya: baris({ tampilan: "terlambat", hariTerlambat: 2, dendaBerjalan: 40_000 }),
        },
      }),
    ])}
    onBukaCicilan={() => {}}
  />,
);
ada(telat, "Rp 1.264.000", "nominal denda ikut dijumlahkan");
ada(telat, "Sudah termasuk denda Rp 40.000", "denda disebut terpisah");
ada(telat, "terlambat 2 hari", "keterangan keterlambatan memakai angka server");

// Dua pinjaman: yang dipilih adalah jatuh tempo paling awal, bukan urutan grup.
const dua = renderToStaticMarkup(
  <TagihanBerikutnyaRingkas
    data={dataUji([
      grupUji({
        loanId: "loan-b",
        nomorReferensi: "PGD-B",
        ringkasan: {
          jumlah: 3,
          berikutnya: baris({ _id: "b", nomor: 1, jatuhTempoPada: Date.UTC(2026, 11, 1) }),
        },
      }),
      grupUji({
        loanId: "loan-a",
        nomorReferensi: "PGD-A",
        ringkasan: {
          jumlah: 6,
          berikutnya: baris({ _id: "a", nomor: 2, jatuhTempoPada: Date.UTC(2026, 10, 20) }),
        },
      }),
    ])}
    onBukaCicilan={() => {}}
  />,
);
ada(dua, "PGD-A", "tagihan paling awal yang dipilih");
ok(!dua.includes("PGD-B"), "tagihan yang lebih jauh tidak ditampilkan");

// Satu angsuran (skema harian) tidak diulang di Ringkasan.
const tunggal = renderToStaticMarkup(
  <TagihanBerikutnyaRingkas
    data={dataUji([
      grupUji({ ringkasan: { jumlah: 1, berikutnya: baris({ nomor: 1 }) } }),
    ])}
    onBukaCicilan={() => {}}
  />,
);
ok(tunggal === "", "pinjaman satu angsuran tidak dirender dua kali");

// Bukti sudah dikirim: jangan menawarkan bayar lagi.
const menunggu = renderToStaticMarkup(
  <TagihanBerikutnyaRingkas
    data={dataUji([
      grupUji({
        ringkasan: {
          jumlah: 6,
          berikutnya: baris({ status: "menunggu_verifikasi", tampilan: "menunggu_verifikasi" }),
        },
      }),
    ])}
    onBukaCicilan={() => {}}
  />,
);
ada(menunggu, "Lihat status verifikasi", "status verifikasi punya label sendiri");
ada(menunggu, "Tidak perlu mengirim ulang", "peminjam tidak diminta mengirim bukti lagi");

console.log(`tagihan-berikutnya.render.test: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
