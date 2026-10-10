/**
 * Uji render bagian tampilan ANTREAN KYC di panel petugas.
 * Run: bun src/components/admin/KycPanel.render.test.tsx
 *
 * Yang dijaga:
 *  - baris antrean menampilkan nama, email, waktu pengajuan, status (label dari
 *    `lib/kycStatus.ts`), dan PERINGATAN jumlah isian/berkas yang kurang —
 *    supaya petugas tidak membuka pengajuan yang memang belum lengkap;
 *  - rincian menampilkan isian yang sudah dinormalkan (uang diformat rupiah) dan
 *    ketiga slot berkas: gambar ber-watermark bila ada, atau kabar "belum
 *    diunggah" bila tidak — tanpa slot kosong yang menyamar sebagai terisi;
 *  - riwayat menampilkan aktor dan alasan yang dibaca manusia;
 *  - tidak ada "undefined"/"NaN"/"[object Object]" di markup.
 */
import { renderToStaticMarkup } from "react-dom/server";

import { BarisKyc, KycDetailRingkas, KycRiwayatRingkas, type DetailKycTampil, type ItemKycTampil } from "./KycPanel";
import { StatusKycBadge } from "@/components/StatusKycBadge";
import { keteranganAturanUsang, VERSI_ATURAN_KYC } from "@/lib/kycAturan";
import { KYC_STATUS, LABEL_STATUS_KYC } from "@/lib/kycStatus";

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

const item = (overrides: Partial<ItemKycTampil> = {}): ItemKycTampil => ({
  userId: "users_1" as ItemKycTampil["userId"],
  nama: "Rani Puspita",
  email: "rani@pindai.test",
  status: "PENDING_REVIEW",
  kekurangan: [],
  aturanUsang: false,
  diajukanPada: 1_700_000_000_000,
  diperbaruiPada: 1_700_000_000_000,
  diputuskanPada: null,
  ...overrides,
});

const detail = (overrides: Partial<DetailKycTampil> = {}): DetailKycTampil => ({
  userId: "users_1" as DetailKycTampil["userId"],
  status: "PENDING_REVIEW",
  namaLengkap: "RANI PUSPITA",
  nik: "3271012345678901",
  nomorWhatsApp: "6281234567890",
  alamat: "Jalan Merdeka No. 10, Bandung",
  pekerjaan: "Karyawan swasta",
  penghasilanBulanan: 5_000_000,
  sumberPenghasilan: "Gaji bulanan",
  catatanPeminjam: null,
  kekurangan: [],
  diajukanPada: 1_700_000_000_000,
  diputuskanPada: null,
  diputuskanOlehLabel: null,
  keputusanCatatan: null,
  verifikasiUlangTertunda: false,
  nomorWhatsAppTerverifikasi: {
    nomor: "6281234567890",
    pada: 1_700_000_000_000,
    metode: "wa_otp",
    cocok: true,
  },
  nomorWhatsAppTerbukti: true,
  persetujuan: { versi: "pdp-2026-10", pada: 1_700_000_000_000, olehLabel: "rani@pindai.test" },
  persetujuanAktif: true,
  versiAturan: VERSI_ATURAN_KYC,
  aturanTerverifikasi: { versi: VERSI_ATURAN_KYC, pada: 1_700_000_000_000 },
  aturanUsang: false,
  keteranganAturanUsang: null,
  berkas: [
    {
      slot: "ktp",
      label: "Foto KTP",
      ada: true,
      jenis: "png",
      ukuranByte: 1_200_000,
      contentType: "image/png",
      sidikJari: "8f3a1c2b4d5e6f708192a3b4c5d6e7f8",
      lebar: 1600,
      tinggi: 900,
      versiAturan: VERSI_ATURAN_KYC,
      diperiksaPada: 1_700_000_000_000,
      aturanUsang: false,
      dipakaiAkunLain: 0,
    },
    {
      slot: "selfie",
      label: "Selfie dengan KTP",
      ada: true,
      jenis: "jpeg",
      ukuranByte: 900_000,
      contentType: "image/jpeg",
      sidikJari: "11223344556677889900112233445566",
      lebar: 1200,
      tinggi: 1600,
      versiAturan: VERSI_ATURAN_KYC,
      diperiksaPada: 1_700_000_000_000,
      aturanUsang: false,
      dipakaiAkunLain: 0,
    },
    {
      slot: "bukti",
      label: "Bukti penghasilan",
      ada: true,
      jenis: "png",
      ukuranByte: 640_000,
      contentType: "image/png",
      sidikJari: "aabbccddeeff00112233445566778899",
      lebar: 1080,
      tinggi: 720,
      versiAturan: VERSI_ATURAN_KYC,
      diperiksaPada: 1_700_000_000_000,
      aturanUsang: false,
      dipakaiAkunLain: 0,
    },
  ],
  url: {
    ktp: "https://example.test/ktp.png",
    selfie: "https://example.test/selfie.png",
    buktiPenghasilan: "https://example.test/slip.png",
  },
  riwayat: [],
  ...overrides,
});

// ===== 1. Setiap status memakai label yang sama dengan modul nasabah =====
for (const status of KYC_STATUS) {
  const html = renderToStaticMarkup(<StatusKycBadge status={status} />);
  ada(html, LABEL_STATUS_KYC[status], `lencana status ${status} memakai label bersama`);
  bersih(html, `lencana ${status}`);
}

// ===== 2. Baris antrean =====
{
  const html = renderToStaticMarkup(
    <BarisKyc item={item({ kekurangan: ["Foto KTP", "Selfie dengan KTP"] })} aktif={false} onPilih={() => {}} />,
  );
  ada(html, "Rani Puspita", "nama nasabah tampil");
  ada(html, "rani@pindai.test", "email tampil");
  ada(html, LABEL_STATUS_KYC.PENDING_REVIEW, "status tampil");
  ada(html, "2 berkas/isi kurang", "jumlah kekurangan tampil sebagai peringatan");
  ada(html, 'aria-pressed="false"', "keadaan terpilih dilaporkan ke pembaca layar");
  bersih(html, "baris antrean");

  const tanpaEmail = renderToStaticMarkup(
    <BarisKyc item={item({ email: null })} aktif onPilih={() => {}} />,
  );
  ada(tanpaEmail, "tanpa email", "nasabah tanpa email tidak tampil kosong");
  ada(tanpaEmail, 'aria-pressed="true"', "baris aktif ditandai");
  ok(!tanpaEmail.includes("berkas/isi kurang"), "tanpa kekurangan tidak ada peringatan palsu");
  ok(!tanpaEmail.includes("aturan lama"), "aturan berlaku tidak ditandai usang");
  bersih(tanpaEmail, "baris tanpa email");

  // Putusan yang diambil dengan aturan lama harus kelihatan dari DAFTAR — bukan
  // hanya setelah membuka satu per satu.
  const aturanLama = renderToStaticMarkup(<BarisKyc item={item({ aturanUsang: true })} aktif={false} onPilih={() => {}} />);
  ada(aturanLama, "aturan lama", "baris dengan aturan lama ditandai");
  bersih(aturanLama, "baris aturan lama");
}

// ===== 3. Rincian lengkap: isian + tiga berkas ber-watermark =====
{
  const html = renderToStaticMarkup(<KycDetailRingkas detail={detail()} />);
  ada(html, "RANI PUSPITA", "nama tersimpan tampil");
  ada(html, "3271012345678901", "NIK tampil");
  ada(html, "6281234567890", "WhatsApp tampil");
  ada(html, "Rp 5.000.000", "penghasilan diformat rupiah");
  ada(html, "Gaji bulanan", "sumber penghasilan tampil");
  ada(html, "https://example.test/ktp.png", "foto KTP terpasang");
  ada(html, "https://example.test/selfie.png", "selfie KTP terpasang");
  ada(html, "https://example.test/slip.png", "bukti penghasilan terpasang");
  ada(html, 'alt="Foto KTP"', "label Foto KTP terpasang pada gambarnya");
  ada(html, "Persetujuan pemrosesan data tercatat", "dasar pemrosesan terlihat oleh petugas");
  ada(html, "pdp-2026-10", "versi persetujuan tercatat");
  // Dasar ATURAN putusan + hasil pemeriksaan berkas (metadata dari server).
  ada(html, "Diverifikasi dengan aturan", "dasar aturan putusan tampil");
  ada(html, VERSI_ATURAN_KYC, "versi aturan berlaku tampil");
  ada(html, "Diperiksa server: png", "hasil pemeriksaan berkas tampil");
  ada(html, "1.1 MB", "ukuran berkas tampil dalam MB, bukan byte mentah");
  ada(html, "8f3a1c2b4d5e", "sidik jari berkas tampil (dipotong)");
  ok(!html.includes("akun lain"), "tanpa indikasi penggunaan ulang tidak ada peringatan");
  ok(!html.includes("belum diunggah"), "tidak ada kabar \"belum diunggah\" saat berkas lengkap");
  bersih(html, "rincian lengkap");
}

// ===== 3b. Tanpa persetujuan: petugas diperingatkan, bukan dibiarkan memutuskan =====
{
  const html = renderToStaticMarkup(
    <KycDetailRingkas detail={detail({ persetujuan: null, persetujuanAktif: false })} />,
  );
  ada(html, "belum memiliki persetujuan pemrosesan data yang berlaku", "peringatan tanpa persetujuan tampil");
  ada(html, 'role="alert"', "peringatan diumumkan sebagai alert");
  ok(!html.includes("Persetujuan pemrosesan data tercatat"), "tidak mengaku persetujuan ada");
  bersih(html, "rincian tanpa persetujuan");
}

// ===== 4. Rincian belum lengkap: kekurangan + slot berkas kosong =====
{
  const belumDiperiksa = (slot: "selfie" | "bukti", label: string) => ({
    slot,
    label,
    ada: false,
    jenis: null,
    ukuranByte: null,
    contentType: null,
    sidikJari: null,
    lebar: null,
    tinggi: null,
    versiAturan: null,
    diperiksaPada: null,
    aturanUsang: false,
    dipakaiAkunLain: 0,
  });
  const html = renderToStaticMarkup(
    <KycDetailRingkas
      detail={detail({
        status: "IN_PROGRESS",
        nik: null,
        penghasilanBulanan: null,
        kekurangan: ["NIK 16 angka", "Bukti penghasilan"],
        aturanTerverifikasi: null,
        berkas: [
          detail().berkas[0],
          belumDiperiksa("selfie", "Selfie dengan KTP"),
          belumDiperiksa("bukti", "Bukti penghasilan"),
        ],
        url: { ktp: "https://example.test/ktp.png", selfie: null, buktiPenghasilan: null },
      })}
    />,
  );
  ada(html, "Isian belum lengkap", "peringatan kelengkapan tampil");
  ada(html, "NIK 16 angka", "kekurangan NIK tampil");
  ada(html, "Selfie dengan KTP: belum diunggah", "slot selfie kosong disebutkan");
  ada(html, "Bukti penghasilan: belum diunggah", "slot bukti kosong disebutkan");
  ada(html, "Belum diperiksa server", "slot tanpa penanda diperiksa disebut jujur");
  ok(!html.includes("Diverifikasi dengan aturan"), "tanpa putusan tidak mengaku ada dasar aturan");
  ada(html, "—", "isian kosong memakai tanda pisah, bukan kata \"undefined\"");
  bersih(html, "rincian belum lengkap");
}

// ===== 4b. Putusan/berkas dari aturan LAMA ditandai, bukan dibiarkan tampak sah =====
{
  const versiLama = "kyc-aturan-2020-01";
  const html = renderToStaticMarkup(
    <KycDetailRingkas
      detail={detail({
        status: "VERIFIED",
        aturanTerverifikasi: { versi: versiLama, pada: 1_600_000_000_000 },
        aturanUsang: true,
        keteranganAturanUsang: keteranganAturanUsang(versiLama),
        berkas: detail().berkas.map((b) => ({ ...b, versiAturan: versiLama, aturanUsang: true })),
      })}
    />,
  );
  ada(html, versiLama, "versi aturan putusan tampil");
  ada(html, VERSI_ATURAN_KYC, "versi aturan berlaku ikut disebut sebagai pembanding");
  ada(html, "verifikasi ulang", "petugas diusulkan memverifikasi ulang");
  ada(html, "Diperiksa dengan aturan lama", "berkas ber-aturan lama ditandai");
  bersih(html, "rincian aturan lama");
}

// ===== 4c. Dokumen identitas yang sama dipakai akun lain =====
{
  const html = renderToStaticMarkup(
    <KycDetailRingkas
      detail={detail({
        berkas: detail().berkas.map((b) =>
          b.slot === "ktp" ? { ...b, dipakaiAkunLain: 2 } : b,
        ),
      })}
    />,
  );
  ada(html, "dipakai di 2 akun lain", "indikasi penggunaan ulang identitas tampil dengan jumlahnya");
  // Yang dilaporkan HANYA jumlahnya: data pemilik lain tidak ikut ditarik ke sini.
  ok(!html.includes("users_"), "tidak ada id pemilik lain di markup");
  bersih(html, "rincian dengan penggunaan ulang");
}

// ===== 4d. Hasil pemeriksaan nomor WhatsApp (verifikasi OTP) =====
{
  // Terverifikasi untuk nomor yang tersimpan sekarang.
  const html = renderToStaticMarkup(<KycDetailRingkas detail={detail()} />);
  ada(html, "dibuktikan aktif lewat kode OTP", "bukti OTP nomor tampil saat cocok");
  bersih(html, "rincian dengan nomor terverifikasi");
}
{
  // Belum pernah diverifikasi.
  const html = renderToStaticMarkup(
    <KycDetailRingkas
      detail={detail({ nomorWhatsAppTerverifikasi: null, nomorWhatsAppTerbukti: false })}
    />,
  );
  ada(html, "belum diverifikasi", "nomor yang belum dibuktikan ditandai");
  bersih(html, "rincian tanpa bukti OTP");
}
{
  // Pernah diverifikasi, tetapi nomornya sudah diganti — bukti lama tidak sah
  // lagi dan petugas harus tahu, bukan dibiarkan tampak terverifikasi.
  const html = renderToStaticMarkup(
    <KycDetailRingkas
      detail={detail({
        nomorWhatsAppTerverifikasi: {
          nomor: "628000000000",
          pada: 1_700_000_000_000,
          metode: "wa_otp",
          cocok: false,
        },
        nomorWhatsAppTerbukti: false,
      })}
    />,
  );
  ada(html, "tidak lagi cocok", "bukti OTP yang tidak cocok dengan nomor ditandai");
  bersih(html, "rincian dengan bukti OTP kedaluwarsa");
}

// ===== 5. Riwayat petugas =====
{
  const html = renderToStaticMarkup(
    <KycRiwayatRingkas
      riwayat={[
        {
          dari: "PENDING_REVIEW",
          ke: "NEEDS_CORRECTION",
          aktor: "admin",
          aktorLabel: "petugas@pindai.test",
          alasan: "perbaikan_diminta",
          catatan: "Foto KTP buram.",
          versiAturan: VERSI_ATURAN_KYC,
          waktu: 1_700_000_000_000,
        },
      ]}
    />,
  );
  ada(html, "Menunggu peninjauan", "status asal tampil sebagai label");
  ada(html, LABEL_STATUS_KYC.NEEDS_CORRECTION, "status tujuan tampil sebagai label");
  ada(html, "petugas@pindai.test", "aktor tampil");
  ada(html, "Foto KTP buram.", "catatan petugas tampil");
  bersih(html, "riwayat petugas");

  const kosong = renderToStaticMarkup(<KycRiwayatRingkas riwayat={[]} />);
  ada(kosong, "Belum ada perubahan status.", "riwayat kosong dijelaskan");
}

if (failed > 0) {
  console.error(`\n${failed} gagal, ${passed} lulus`);
  process.exit(1);
}
console.log(`KycPanel.render: ${passed} lulus`);
