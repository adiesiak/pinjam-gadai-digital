/**
 * Uji render pengingat jatuh tempo beranimasi (Payment Due Alert).
 * Run: bun src/components/PaymentDueAlert.render.test.tsx
 *
 * Yang dijaga:
 * - Empat tingkat tampil dengan kalimat yang benar (aman / segera / hari ini /
 *   terlambat) — pembaca tidak boleh menyimpulkan "terlambat" saat belum.
 * - Nominal, tanggal, dan hitung mundur muncul utuh, tanpa `undefined`/`NaN`.
 * - Animasi dekoratif HANYA menyala pada tingkat mendesak; tingkat aman & sudah
 *   terlambat tampil tenang (tidak berdenyut-terus).
 * - Penanda penyedia dana mengurutkan yang paling mendesak lebih dulu dan tidak
 *   merender apa pun saat tidak ada pinjaman.
 */
import { renderToStaticMarkup } from "react-dom/server";

import {
  PaymentDueAlert,
  PengingatJatuhTempoPendana,
  type BarisPengingatPendana,
} from "./PaymentDueAlert";

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
  ok(!html.includes("undefined"), `${label} tanpa "undefined"`);
  ok(!html.includes("[object Object]"), `${label} tanpa "[object Object]"`);
  ok(!html.includes("NaN"), `${label} tanpa "NaN"`);
}

const MENIT = 60_000;
const JAM = 3_600_000;
const HARI = 86_400_000;

/** 20 Oktober 2026, 03:00 UTC — tetap supaya tanggalnya bisa ditebak. */
const JATUH_TEMPO = Date.UTC(2026, 9, 20, 3, 0, 0);
const TANGGAL = new Date(JATUH_TEMPO).toLocaleDateString("id-ID", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

// ===== Tingkat AMAN: animasi minimal =====
const aman = renderToStaticMarkup(
  <PaymentDueAlert
    nomorReferensi="PD-AMAN-1"
    nominal={1_300_000}
    jatuhTempoPada={JATUH_TEMPO}
    sisaHari={7}
    hariTerlambat={0}
    sekarang={JATUH_TEMPO - (7 * HARI + 12 * JAM + 25 * MENIT)}
  />,
);
ada(aman, "Pembayaran Jatuh Tempo 7 Hari Lagi", "judul aman");
ada(aman, "7 hari 12 jam 25 menit", "hitung mundur hari/jam/menit");
ada(aman, "Rp 1.300.000", "nominal kewajiban");
ada(aman, TANGGAL, "tanggal jatuh tempo panjang");
ada(aman, "PD-AMAN-1", "nomor referensi");
ada(aman, 'aria-live="polite"', "semantik status untuk pembaca layar");
ada(aman, 'role="status"', "peran status (alert lunak)");
ada(aman, "pengingat-jatuh-tempo-judul", "kartu diberi nama oleh judulnya");
tidakAda(aman, "dark:", "tanpa kelas mode gelap yang tidak pernah aktif");
ada(aman, "bukan tagihan", "jujur: bukan tagihan");
tidakAda(aman, "animate-due-breathe", "tingkat aman tidak bernapas");
tidakAda(aman, "animate-due-ring", "tingkat aman tanpa denyut");
tidakAda(aman, "Terlambat", "tingkat aman tidak menyebut terlambat");
bersih(aman, "kartu aman");

// ===== Tingkat SEGERA: denyut/glow ringan + CTA =====
const segera = renderToStaticMarkup(
  <PaymentDueAlert
    nomorReferensi="PD-SEGERA-2"
    nominal={470_000}
    jatuhTempoPada={JATUH_TEMPO}
    sisaHari={2}
    hariTerlambat={0}
    onLihatDetail={() => undefined}
    sekarang={JATUH_TEMPO - 2 * HARI}
  />,
);
ada(segera, "Pembayaran Jatuh Tempo 2 Hari Lagi", "judul segera");
ada(segera, "segera jatuh tempo", "lencana tingkat segera");
ada(segera, "animate-due-breathe", "tingkat segera bernapas pelan");
ada(segera, "animate-due-ring", "tingkat segera berdenyut");
ada(segera, "animate-due-pop", "lencana segera beranimasi");
ada(segera, "Lihat Detail Pembayaran", "CTA detail pembayaran");
tidakAda(segera, "Terlambat 0 hari", "tidak menyebut terlambat nol hari");
bersih(segera, "kartu segera");

// ===== Tingkat HARI INI: alert lebih menonjol =====
const hariIni = renderToStaticMarkup(
  <PaymentDueAlert
    nomorReferensi="PD-HARI-INI-3"
    nominal={1_000_000}
    jatuhTempoPada={JATUH_TEMPO}
    sisaHari={0}
    hariTerlambat={0}
    sekarang={JATUH_TEMPO - 5 * MENIT}
  />,
);
ada(hariIni, "Pembayaran Jatuh Tempo Hari Ini", "judul hari ini");
ada(hariIni, "jatuh tempo hari ini", "lencana tingkat hari ini");
ada(hariIni, "5 menit", "hitung mundur menit");
ada(hariIni, "animate-due-breathe", "hari ini menonjol");
bersih(hariIni, "kartu hari ini");

// ===== Tingkat TERLAMBAT: jelas tapi tidak agresif =====
const terlambat = renderToStaticMarkup(
  <PaymentDueAlert
    nomorReferensi="PD-TELAT-4"
    nominal={2_300_000}
    jatuhTempoPada={JATUH_TEMPO}
    sisaHari={0}
    hariTerlambat={3}
    dendaTerlambat={35_000}
    onLihatDetail={() => undefined}
    sekarang={JATUH_TEMPO + 3 * HARI}
  />,
);
ada(terlambat, "Pembayaran Terlambat 3 Hari", "judul terlambat");
ada(terlambat, "Terlambat 3 hari", "kalimat keterlambatan");
ada(terlambat, "Rp 35.000", "denda tercatat");
ada(terlambat, "Lihat Detail Pembayaran", "CTA tetap tersedia saat terlambat");
tidakAda(terlambat, "Sisa waktu", "tanpa hitung mundur saat terlambat");
tidakAda(terlambat, "animate-due-ring", "terlambat tidak berdenyut-terus");
ada(terlambat, "animate-due-breathe", "terlambat tetap bernapas tenang");
bersih(terlambat, "kartu terlambat");

// CTA hilang bila tidak ada handler.
const tanpaCta = renderToStaticMarkup(
  <PaymentDueAlert
    nomorReferensi="PD-NO-CTA"
    nominal={500_000}
    jatuhTempoPada={JATUH_TEMPO}
    sisaHari={9}
    hariTerlambat={0}
    sekarang={JATUH_TEMPO - 9 * HARI}
  />,
);
tidakAda(tanpaCta, "Lihat Detail Pembayaran", "CTA disembunyikan tanpa handler");

// ===== Indikator penyedia dana: urut paling mendesak, privasi tetap =====
const barisPendana: BarisPengingatPendana[] = [
  {
    id: "l1",
    nomorReferensi: "PGD-JAUH",
    pokokPinjaman: 2_000_000,
    status: "didanai",
    jatuhTempoPada: JATUH_TEMPO,
    hitung: "Sisa 12 hari",
    nada: "netral",
  },
  {
    id: "l2",
    nomorReferensi: "PGD-SEGERA",
    pokokPinjaman: 1_000_000,
    status: "didanai",
    jatuhTempoPada: JATUH_TEMPO,
    hitung: "Sisa 2 hari",
    nada: "segera",
  },
  {
    id: "l3",
    nomorReferensi: "PGD-TELAT",
    pokokPinjaman: 1_500_000,
    status: "didanai",
    jatuhTempoPada: JATUH_TEMPO,
    hitung: "Terlambat 3 hari",
    nada: "terlambat",
  },
];

const pendana = renderToStaticMarkup(
  <PengingatJatuhTempoPendana rows={barisPendana} sekarang={JATUH_TEMPO + 3 * HARI} />,
);
ada(pendana, "Jatuh tempo siklus Anda", "judul penanda penyedia dana");
ada(pendana, "2 perlu perhatian", "hanya yang mendesak dihitung");
ada(pendana, "#PGD-TELAT", "nomor referensi tampil");
ada(pendana, "Rp 1.500.000", "nominal alokasi tampil");
ada(pendana, "PGD-JAUH", "baris jauh tetap tampil");
// Terlambat < segera < jauh di dalam markup = urutan paling mendesak dulu.
const posisiTelat = pendana.indexOf("PGD-TELAT");
const posisiSegera = pendana.indexOf("PGD-SEGERA");
const posisiJauh = pendana.indexOf("PGD-JAUH");
ok(
  posisiTelat !== -1 && posisiTelat < posisiSegera && posisiSegera < posisiJauh,
  "baris diurutkan dari yang paling mendesak",
);
bersih(pendana, "penanda penyedia dana");

// Tidak ada pinjaman → tidak ada bagian sama sekali.
const kosong = renderToStaticMarkup(
  <PengingatJatuhTempoPendana rows={[]} sekarang={JATUH_TEMPO} />,
);
ok(kosong === "", "tanpa baris, penanda penyedia dana tidak dirender");

if (failed > 0) {
  console.error(`\n${failed} gagal, ${passed} lulus`);
  process.exit(1);
}
console.log(`PaymentDueAlert: ${passed} lulus`);
