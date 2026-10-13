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
 *  - bagian hasil pemeriksaan tampil apa adanya: OCR menyebut yang tidak
 *    terbaca, ketidaksesuaian dipisah material/lunak, mesin diaudit lewat
 *    aturannya, dan jejak audit nasabah ditampilkan;
 *  - dialog konfirmasi menyebut AKIBAT tiap keputusan bagi nasabah (termasuk
 *    penegasan bahwa VERIFIED bukan persetujuan pinjaman);
 *  - riwayat menampilkan aktor dan alasan yang dibaca manusia;
 *  - tidak ada "undefined"/"NaN"/"[object Object]" di markup.
 */
import { renderToStaticMarkup } from "react-dom/server";

import {
  BarisKyc,
  IsiKonfirmasiKeputusan,
  KetidaksesuaianKtp,
  KycAuditRingkas,
  KycDetailRingkas,
  KycRiwayatRingkas,
  OcrKtpKyc,
  type DetailKycTampil,
  type ItemKycTampil,
} from "./KycPanel";
import { akibatKeputusanKyc, judulKonfirmasiKeputusan } from "@/lib/kycAdmin";
import { StatusKycBadge } from "@/components/StatusKycBadge";
import { keteranganAturanUsang, VERSI_ATURAN_KYC } from "@/lib/kycAturan";
import { VERSI_ATURAN_AUTO_KYC } from "@/lib/kycAutoApproval";
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
  kodePeminjam: "PGD-20261001-AB12",
  status: "PENDING_REVIEW",
  kekurangan: [],
  aturanUsang: false,
  nomorWhatsAppTerbukti: true,
  verifikasiUlangTertunda: false,
  keputusanOtomatis: null,
  diajukanPada: 1_700_000_000_000,
  diperbaruiPada: 1_700_000_000_000,
  diputuskanPada: null,
  ...overrides,
});

const detail = (overrides: Partial<DetailKycTampil> = {}): DetailKycTampil => ({
  userId: "users_1" as DetailKycTampil["userId"],
  status: "PENDING_REVIEW",
  kodePeminjam: "PGD-20261001-AB12",
  email: "rani@pindai.test",
  ocrKtp: null,
  ketidaksesuaian: { material: [], lunak: [] },
  audit: [],
  namaLengkap: "RANI PUSPITA",
  nik: "3271012345678901",
  nomorWhatsApp: "6281234567890",
  alamat: "Jalan Merdeka No. 10, Bandung",
  pekerjaan: "Karyawan swasta",
  penghasilanBulanan: 5_000_000,
  sumberPenghasilan: "Gaji bulanan",
  // Kontak darurat ikut diisi di contoh ini supaya barisnya benar-benar diuji;
  // nasabah lama bisa `null` di ketiga kolom, dan itu juga ditangani panel.
  namaKontakDarurat: "Siti Rahayu",
  nomorKontakDarurat: "6281299887766",
  hubunganKontakDarurat: "Keluarga",
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
  keputusanOtomatis: null,
  berkas: [
    {
      slot: "ktp",
      label: "Foto KTP",
      tertaut: true,
      ada: true,
      statusDokumen: "siap",
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
      tertaut: true,
      ada: true,
      statusDokumen: "siap",
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
      tertaut: true,
      ada: true,
      statusDokumen: "siap",
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

// ===== 2b. Tanda pemeriksaan lain pada baris antrean =====
{
  // Petugas harus bisa menyaring kasus yang BELUM dibuktikan (nomor belum OTP,
  // verifikasi ulang tertunda) langsung dari daftar, dan tahu hasil mesin
  // terakhir — termasuk apakah hasil itu sampai mengubah status.
  const html = renderToStaticMarkup(
    <BarisKyc
      item={item({
        nomorWhatsAppTerbukti: false,
        verifikasiUlangTertunda: true,
        keputusanOtomatis: { keputusan: "PENDING_REVIEW", diterapkan: false, waktu: 1_700_000_000_000 },
      })}
      aktif={false}
      onPilih={() => {}}
    />,
  );
  ada(html, "WhatsApp belum OTP", "nomor tanpa bukti OTP ditandai");
  ada(html, "perlu verifikasi ulang", "verifikasi ulang tertunda ditandai");
  ada(html, "mesin:", "hasil mesin terakhir tampil di baris");
  ada(html, LABEL_STATUS_KYC.PENDING_REVIEW, "hasil mesin menyebut status tujuannya");
  ada(html, "(tidak diterapkan)", "hasil mesin yang tidak mengubah status tidak diklaim diterapkan");
  ada(html, "PGD-20261001-AB12", "kode nasabah tampil agar kasus bisa disebut tanpa NIK");
  bersih(html, "baris dengan tanda pemeriksaan");

  const diterapkan = renderToStaticMarkup(
    <BarisKyc
      item={item({
        status: "VERIFIED",
        keputusanOtomatis: { keputusan: "VERIFIED", diterapkan: true, waktu: 1_700_000_000_000 },
      })}
      aktif={false}
      onPilih={() => {}}
    />,
  );
  ok(!diterapkan.includes("(tidak diterapkan)"), "hasil yang benar-benar diterapkan tidak diberi keterangan salah");
  bersih(diterapkan, "baris dengan hasil mesin diterapkan");
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
    tertaut: false,
    ada: false,
    statusDokumen: "belum_diunggah" as const,
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
  ada(html, "Belum ada berkas tersimpan untuk slot ini.", "slot tanpa berkas dinyatakan apa adanya");
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
        berkas: detail().berkas.map((b) => ({
          ...b,
          versiAturan: versiLama,
          aturanUsang: true,
          statusDokumen: "perlu_diperiksa_ulang" as const,
        })),
      })}
    />,
  );
  ada(html, versiLama, "versi aturan putusan tampil");
  ada(html, VERSI_ATURAN_KYC, "versi aturan berlaku ikut disebut sebagai pembanding");
  ada(html, "verifikasi ulang", "petugas diusulkan memverifikasi ulang");
  ada(html, "Diperiksa dengan aturan lama", "berkas ber-aturan lama ditandai");
  ada(html, "pertimbangkan memeriksa ulang", "petugas diingatkan memeriksa berkasnya lagi");
  bersih(html, "rincian aturan lama");
}

// ===== 4f. Berkas ADA tetapi belum lolos pemeriksaan isi di server =====
{
  // Berkas yang belum diperiksa TIDAK boleh tampak seperti berkas yang sudah
  // dinilai — keadaannya dinyatakan sendiri, bukan disembunyikan.
  const belumDiperiksaServer = {
    ...detail().berkas[1],
    ada: false,
    statusDokumen: "belum_diperiksa" as const,
    jenis: null,
    ukuranByte: null,
    contentType: null,
    sidikJari: null,
    lebar: null,
    tinggi: null,
    versiAturan: null,
    diperiksaPada: null,
  };
  const html = renderToStaticMarkup(
    <KycDetailRingkas
      detail={detail({ berkas: [detail().berkas[0], belumDiperiksaServer, detail().berkas[2]] })}
    />,
  );
  ada(html, "Belum diperiksa server", "berkas berisi tetapi belum diperiksa disebut jujur");
  ada(html, "belum lolos pemeriksaan server", "alasan berkas belum bisa dinilai dijelaskan");
  ok(!html.includes("Diperiksa server: jpeg"), "tidak mengarang metadata pemeriksaan yang belum ada");
  bersih(html, "rincian berkas belum diperiksa");
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

// ===== 4e. Hasil pemeriksaan OTOMATIS: apa yang gagal & apakah status berubah =====
{
  // Mesin menemukan yang gagal tetapi TIDAK mengubah status: petugas harus bisa
  // membedakan "sudah diputuskan mesin" dari "dicatat untuk ditinjau".
  const html = renderToStaticMarkup(
    <KycDetailRingkas
      detail={detail({
        keputusanOtomatis: {
          waktu: 1_700_000_000_000,
          statusSebelum: "PENDING_REVIEW",
          keputusan: "NEEDS_CORRECTION",
          alasan: "otomatis_perlu_perbaikan",
          ringkasan: "Pemeriksaan otomatis menemukan 1 hal yang perlu diperbaiki.",
          versiAturan: VERSI_ATURAN_AUTO_KYC,
          sumber: "otomatis",
          aktor: "sistem",
          diterapkan: false,
          aturan: [
            {
              id: "nomor_wa_terverifikasi",
              judul: "Nomor WhatsApp sudah terverifikasi",
              status: "gagal",
              sumber: "server",
              pesan: "Nomor WhatsApp belum diverifikasi lewat kode OTP.",
              detail: [],
            },
            {
              id: "ocr_tersedia_threshold",
              judul: "Hasil OCR tersedia & memenuhi ambang keyakinan",
              status: "tidak_pasti",
              sumber: "klien",
              pesan: "Hasil OCR KTP belum tersedia.",
              detail: [],
            },
          ],
        },
      })}
    />,
  );
  ada(html, "Pemeriksaan otomatis terakhir", "blok pemeriksaan otomatis tampil");
  ada(html, "status TIDAK diubah", "hasil yang tidak diterapkan ditandai jelas");
  ok(!html.includes("sudah mengubah status"), "tidak mengaku status berubah sendiri");
  ada(html, VERSI_ATURAN_AUTO_KYC, "versi aturan mesin tampil");
  ada(html, "Gagal", "pemeriksaan yang gagal ditandai");
  ada(html, "Belum pasti", "pemeriksaan yang belum pasti ditandai");
  ada(html, "belum diverifikasi lewat kode OTP", "pesan mesin ditampilkan apa adanya");
  ada(html, "Dukcapil", "batas yang tidak diklaim tetap disebut");
  bersih(html, "rincian dengan keputusan otomatis");
}
{
  // Hasil mesin yang DITERAPKAN: status memang berubah karena mesin.
  const html = renderToStaticMarkup(
    <KycDetailRingkas
      detail={detail({
        status: "VERIFIED",
        keputusanOtomatis: {
          waktu: 1_700_000_000_000,
          statusSebelum: "PENDING_REVIEW",
          keputusan: "VERIFIED",
          alasan: "otomatis_semua_pemeriksaan_lulus",
          ringkasan: "Seluruh persyaratan yang dapat diverifikasi sistem sudah terpenuhi.",
          versiAturan: VERSI_ATURAN_AUTO_KYC,
          sumber: "otomatis",
          aktor: "sistem",
          diterapkan: true,
          aturan: [
            {
              id: "format_nik_valid",
              judul: "Format NIK valid (bentuk 16 angka)",
              status: "lulus",
              sumber: "server",
              pesan: "NIK berbentuk 16 angka dengan komponen tanggal yang wajar.",
              detail: [],
            },
          ],
        },
      })}
    />,
  );
  ada(html, "sudah mengubah status", "hasil yang diterapkan ditandai");
  ada(html, "Lulus", "pemeriksaan yang lulus ditandai");
  bersih(html, "rincian dengan keputusan otomatis diterapkan");
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

// ===== 6. Hasil OCR KTP: dibaca sebagai PEMBACAAN, bukan bukti =====
{
  const html = renderToStaticMarkup(
    <OcrKtpKyc
      ocr={{
        konfidensi: 91.4,
        nik: "3271012345678901",
        nama: "RANI PUSPITA",
        alamat: null,
        pada: 1_700_000_000_000,
        sumber: "klien",
      }}
    />,
  );
  ada(html, "91", "keyakinan OCR ditampilkan sebagai angka terbaca");
  ada(html, "tinggi", "tingkat keyakinan disebut berpasangan dengan angkanya");
  ada(html, "3271012345678901", "NIK hasil bacaan tampil");
  ada(html, "tidak terbaca", "field yang gagal dibaca dinyatakan, bukan dikosongkan");
  ada(html, "bukan bukti keaslian KTP", "batas OCR dijelaskan");
  ada(html, "Dukcapil", "batas yang tidak diklaim tetap disebut");
  bersih(html, "blok OCR");

  const kosong = renderToStaticMarkup(<OcrKtpKyc ocr={null} />);
  ada(kosong, "Belum ada hasil OCR KTP", "OCR yang belum pernah jalan dinyatakan apa adanya");
  ada(kosong, "nilai tidak dikarang", "tidak ada nilai tebakan saat OCR kosong");
  bersih(kosong, "blok OCR kosong");
}

// ===== 7. Ketidaksesuaian data: material vs lunak =====
{
  const html = renderToStaticMarkup(
    <KetidaksesuaianKtp
      adaOcr
      ketidaksesuaian={{
        material: [{ field: "nik", label: "NIK", ocr: "3271012345678901", form: "3271012345678902" }],
        lunak: [{ field: "alamat", label: "Alamat", ocr: "JALAN MERDEKA 10", form: "Jalan Merdeka No 10" }],
      }}
    />,
  );
  ada(html, "NIK tidak cocok (material).", "perbedaan material dinyatakan sebagai material");
  ada(html, "berbeda (bukan material)", "perbedaan lunak dibedakan dari yang material");
  ada(html, "3271012345678901", "nilai dari KTP ditampilkan sebagai pembanding");
  bersih(html, "blok ketidaksesuaian");

  // Daftar kosong TIDAK boleh dibaca sebagai "data pasti cocok".
  const sama = renderToStaticMarkup(
    <KetidaksesuaianKtp adaOcr ketidaksesuaian={{ material: [], lunak: [] }} />,
  );
  ada(sama, "bukan bukti bahwa data pasti cocok", "daftar kosong tidak diklaim cocok");
  bersih(sama, "blok ketidaksesuaian kosong");

  const tanpaOcr = renderToStaticMarkup(
    <KetidaksesuaianKtp adaOcr={false} ketidaksesuaian={{ material: [], lunak: [] }} />,
  );
  ada(tanpaOcr, "Belum bisa dibandingkan", "tanpa OCR pembandingan dinyatakan belum bisa");
  bersih(tanpaOcr, "blok ketidaksesuaian tanpa OCR");
}

// ===== 8. Jejak audit nasabah =====
{
  const html = renderToStaticMarkup(
    <KycAuditRingkas
      audit={[
        {
          aksi: "kyc_tinjau",
          aktorLabel: "petugas@pindai.test",
          detail: "Keputusan: NEEDS_CORRECTION",
          target: "users_1",
          waktu: 1_700_000_000_000,
        },
      ]}
    />,
  );
  ada(html, "kyc_tinjau", "nama aksi audit tampil");
  ada(html, "petugas@pindai.test", "aktor audit tampil");
  ada(html, "Keputusan: NEEDS_CORRECTION", "detail audit tampil");
  bersih(html, "jejak audit");

  const kosong = renderToStaticMarkup(<KycAuditRingkas audit={[]} />);
  ada(kosong, "Belum ada entri audit", "audit kosong dijelaskan, bukan dibiarkan kosong");
}

// ===== 9. Dialog konfirmasi keputusan =====
{
  // Judul + akibat MURNI (tanpa portal Radix): bisa diuji langsung.
  ada(
    judulKonfirmasiKeputusan("REJECTED", "RANI PUSPITA"),
    "RANI PUSPITA",
    "judul konfirmasi menyebut nasabahnya",
  );
  ada(
    judulKonfirmasiKeputusan("REJECTED", "RANI"),
    "Tolak KYC",
    "judul konfirmasi memakai nama keputusan",
  );
  ada(
    akibatKeputusanKyc("REJECTED"),
    "Status nasabah menjadi Ditolak",
    "akibat penolakan menyebut status tujuan dengan label bersama",
  );
  ada(
    akibatKeputusanKyc("REJECTED"),
    "Nasabah harus memperbarui datanya",
    "akibat penolakan menjelaskan langkah berikutnya bagi nasabah",
  );
  ada(
    akibatKeputusanKyc("NEEDS_CORRECTION"),
    "Status nasabah menjadi Perlu perbaikan",
    "akibat minta perbaikan memakai label status bersama",
  );
  ada(
    akibatKeputusanKyc("VERIFIED"),
    "BUKAN persetujuan pinjaman",
    "akibat verifikasi menegaskan bukan persetujuan pinjaman",
  );
  ada(
    akibatKeputusanKyc("REVERIFICATION_REQUIRED"),
    "tidak berlaku lagi sampai pengajuan diperiksa ulang",
    "akibat verifikasi ulang menjelaskan putusan lama gugur",
  );

  // Isi dialog yang bisa dirender statis: catatan, kekurangan, dan override manual.
  const html = renderToStaticMarkup(
    <IsiKonfirmasiKeputusan
      keputusan="VERIFIED"
      catatan="Dokumen cocok, saya periksa manual."
      kekurangan={["Bukti penghasilan"]}
      ditandaiMesin={["Nomor WhatsApp sudah terverifikasi"]}
    />,
  );
  ada(html, "Dokumen cocok, saya periksa manual.", "catatan yang akan dibaca nasabah tampil di konfirmasi");
  ada(html, "Bukti penghasilan", "kekurangan isian diingatkan sebelum memutuskan");
  ada(html, "Nomor WhatsApp sudah terverifikasi", "yang masih ditandai mesin diingatkan");
  ada(html, "mengambil alih", "sifat override manual dinyatakan");
  ada(html, "Keputusan dicatat server-side", "dasar pencatatan audit disebutkan");
  bersih(html, "dialog konfirmasi verifikasi");

  const tanpaCatatan = renderToStaticMarkup(
    <IsiKonfirmasiKeputusan keputusan="REJECTED" catatan="   " kekurangan={[]} ditandaiMesin={[]} />,
  );
  ada(tanpaCatatan, "Tanpa catatan.", "catatan kosong dinyatakan, bukan dikosongkan");
  ok(
    !tanpaCatatan.includes("diambil alih"),
    "peringatan override hanya muncul untuk verifikasi manual",
  );
  bersih(tanpaCatatan, "dialog konfirmasi tanpa catatan");
}

if (failed > 0) {
  console.error(`\n${failed} gagal, ${passed} lulus`);
  process.exit(1);
}
console.log(`KycPanel.render: ${passed} lulus`);
