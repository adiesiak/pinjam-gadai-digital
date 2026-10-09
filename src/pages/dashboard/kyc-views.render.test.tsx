/**
 * Uji render bagian tampilan modul KYC di dashboard nasabah.
 * Run: bun src/pages/dashboard/kyc-views.render.test.tsx
 *
 * Bagian yang tersambung Convex tidak bisa dirender di luar aplikasi, jadi yang
 * diuji di sini adalah bagian MURNI-nya: judul status, kotak keputusan petugas,
 * dan daftar riwayat. Yang dijaga:
 *
 *  - SETIAP dari tujuh status tampil dengan label & kalimat penjelasnya dari
 *    `lib/kycStatus.ts` — bukan label yang ditulis ulang di komponen;
 *  - VERIFIED secara eksplisit menyebut bukan persetujuan pinjaman/pencairan;
 *  - kekurangan isian terlihat sebagai daftar sebelum pengajuan bisa dikirim;
 *  - keputusan yang merugikan selalu menampilkan catatan petugas dan siapa yang
 *    memutuskan;
 *  - riwayat menampilkan waktu, aktor, alasan yang sudah diterjemahkan, dan
 *    tidak pernah memunculkan "undefined"/"NaN"/"[object Object]".
 */
import { renderToStaticMarkup } from "react-dom/server";

import {
  KycKeputusanAlert,
  KycRiwayatList,
  KycStatusHeader,
  KycStatusStrip,
  type RiwayatKycTampil,
} from "./kyc-views";
import { KETERANGAN_STATUS_KYC, KYC_STATUS, LABEL_STATUS_KYC, ringkasStatusKyc } from "@/lib/kycStatus";

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
function bersih(html: string, label: string): void {
  ok(!html.includes("undefined"), `${label} tanpa "undefined"`);
  ok(!html.includes("[object Object]"), `${label} tanpa "[object Object]"`);
  ok(!html.includes("NaN"), `${label} tanpa "NaN"`);
}

// ===== 1. Tujuh status, label & penjelasan dari satu sumber =====
for (const status of KYC_STATUS) {
  const html = renderToStaticMarkup(
    <KycStatusHeader
      status={status}
      kekurangan={["Foto KTP", "Bukti penghasilan"]}
      lengkap={false}
      diperbaruiPada={1_700_000_000_000}
    />,
  );
  ada(html, LABEL_STATUS_KYC[status], `label status ${status} mengikuti lib/kycStatus`);
  ada(html, KETERANGAN_STATUS_KYC[status], `penjelasan status ${status} mengikuti lib/kycStatus`);
  bersih(html, `judul status ${status}`);
}

// ===== 2. Kelengkapan: daftar kekurangan tampil, dan hilang saat lengkap =====
{
  const kurang = renderToStaticMarkup(
    <KycStatusHeader
      status="IN_PROGRESS"
      kekurangan={["NIK 16 angka", "Selfie dengan KTP"]}
      lengkap={false}
      diperbaruiPada={null}
    />,
  );
  ada(kurang, "NIK 16 angka", "kekurangan NIK tampil");
  ada(kurang, "Selfie dengan KTP", "kekurangan selfie tampil");
  ada(kurang, "Masih kurang 2 hal", "jumlah kekurangan dilaporkan");
  ada(kurang, "Belum ada isian", "tanpa isian menjelaskan keadaannya");

  const lengkap = renderToStaticMarkup(
    <KycStatusHeader
      status="IN_PROGRESS"
      kekurangan={[]}
      lengkap
      diperbaruiPada={1_700_000_000_000}
    />,
  );
  ada(lengkap, "Lengkap — siap diajukan.", "keadaan lengkap tampil");
  ok(!lengkap.includes("masih kurang"), "tidak mengeluh kekurangan saat lengkap");
  bersih(lengkap, "judul status lengkap");
}

// ===== 3. Kelengkapan harus jadi SYARAT, bukan sekadar informasi =====
{
  // VERIFIED tidak pernah menyatakan persetujuan pinjaman.
  const terverifikasi = renderToStaticMarkup(
    <KycStatusHeader
      status="VERIFIED"
      kekurangan={[]}
      lengkap
      diperbaruiPada={1_700_000_000_000}
    />,
  );
  const penjelasan = KETERANGAN_STATUS_KYC.VERIFIED;
  ok(/bukan persetujuan pinjaman/.test(penjelasan), "penjelasan VERIFIED menegaskan bukan persetujuan");
  ada(terverifikasi, penjelasan, "peringatan bukan persetujuan tampil di dashboard");
}

// ===== 4. Kotak keputusan petugas =====
{
  const perluPerbaikan = renderToStaticMarkup(
    <KycKeputusanAlert
      status="NEEDS_CORRECTION"
      catatan="Foto KTP buram, mohon difoto ulang."
      olehLabel="petugas@pindai.test"
      pada={1_700_000_000_000}
    />,
  );
  ada(perluPerbaikan, "Perlu perbaikan sebelum diajukan ulang", "judul perbaikan tampil");
  ada(perluPerbaikan, "Foto KTP buram, mohon difoto ulang.", "catatan petugas tampil");
  ada(perluPerbaikan, "petugas@pindai.test", "pemutus tampil");
  ada(perluPerbaikan, 'role="alert"', "keputusan diumumkan sebagai alert");
  bersih(perluPerbaikan, "kotak perbaikan");

  const ditolak = renderToStaticMarkup(
    <KycKeputusanAlert
      status="REJECTED"
      catatan="Dokumen tidak sesuai nama."
      olehLabel="petugas@pindai.test"
      pada={null}
    />,
  );
  ada(ditolak, "Pengajuan KYC ditolak", "judul penolakan tampil");
  ada(ditolak, "Dokumen tidak sesuai nama.", "alasan penolakan tampil");
  bersih(ditolak, "kotak penolakan");

  // Status yang bukan keputusan merugikan tidak menampilkan kotak ini.
  const bukanKeputusan = renderToStaticMarkup(
    <KycKeputusanAlert status="IN_PROGRESS" catatan={null} olehLabel={null} pada={null} />,
  );
  ok(bukanKeputusan === "", "status biasa tidak memunculkan kotak keputusan");
}

// ===== 5. Riwayat: waktu, aktor, alasan terjemahan, catatan =====
{
  const riwayat: RiwayatKycTampil[] = [
    {
      dari: "VERIFIED",
      ke: "REVERIFICATION_REQUIRED",
      aktor: "sistem",
      aktorLabel: "sistem",
      alasan: "data_identitas_berubah",
      catatan: "Data identitas penting berubah setelah verifikasi; putusan lama tidak berlaku lagi.",
      waktu: 1_700_000_000_000,
    },
    {
      dari: "-",
      ke: "IN_PROGRESS",
      aktor: "nasabah",
      aktorLabel: "rani@pindai.test",
      alasan: "kyc_dimulai",
      catatan: null,
      waktu: 1_699_000_000_000,
    },
  ];
  const html = renderToStaticMarkup(<KycRiwayatList riwayat={riwayat} />);
  ada(html, "Data identitas penting berubah", "alasan diterjemahkan ke kalimat");
  ok(!html.includes("data_identitas_berubah"), "kode alasan mentah tidak ditampilkan");
  ada(html, "rani@pindai.test", "aktor nasabah tampil");
  ada(html, "Nasabah memulai modul KYC", "alasan memulai diterjemahkan");
  ada(html, LABEL_STATUS_KYC.REVERIFICATION_REQUIRED, "status tujuan tampil sebagai label");
  ada(html, "Baru", "status awal ditandai sebagai baris baru");
  bersih(html, "daftar riwayat");

  const kosong = renderToStaticMarkup(<KycRiwayatList riwayat={[]} />);
  ada(kosong, "Belum ada riwayat", "keadaan tanpa riwayat dijelaskan");
  bersih(kosong, "riwayat kosong");
}

// ===== 6. Pil status yang tampil di semua tab =====
for (const status of KYC_STATUS) {
  const html = renderToStaticMarkup(<KycStatusStrip status={status} onBuka={() => {}} />);
  ada(html, LABEL_STATUS_KYC[status], `pil ${status} memakai label bersama`);
  ada(html, ringkasStatusKyc(status), `pil ${status} memakai ringkasan bersama`);
  bersih(html, `pil status ${status}`);
}
{
  const perlu = renderToStaticMarkup(<KycStatusStrip status="NOT_STARTED" onBuka={() => {}} />);
  ada(perlu, "Lanjutkan verifikasi", "status yang butuh tindakan mengajak melanjutkan");
  const terverifikasi = renderToStaticMarkup(<KycStatusStrip status="VERIFIED" onBuka={() => {}} />);
  ada(terverifikasi, "Lihat Verifikasi KYC", "status final hanya mengajak melihat");
  ok(
    /bukan persetujuan pinjaman/.test(ringkasStatusKyc("VERIFIED")),
    "ringkasan VERIFIED tetap menyebut bukan persetujuan pinjaman",
  );
}

if (failed > 0) {
  console.error(`\n${failed} gagal, ${passed} lulus`);
  process.exit(1);
}
console.log(`kyc-views: ${passed} lulus`);
