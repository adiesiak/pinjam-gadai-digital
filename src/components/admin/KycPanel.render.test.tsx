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
  persetujuan: { versi: "pdp-2026-10", pada: 1_700_000_000_000, olehLabel: "rani@pindai.test" },
  persetujuanAktif: true,
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
  bersih(tanpaEmail, "baris tanpa email");
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
  const html = renderToStaticMarkup(
    <KycDetailRingkas
      detail={detail({
        status: "IN_PROGRESS",
        nik: null,
        penghasilanBulanan: null,
        kekurangan: ["NIK 16 angka", "Bukti penghasilan"],
        url: { ktp: "https://example.test/ktp.png", selfie: null, buktiPenghasilan: null },
      })}
    />,
  );
  ada(html, "Isian belum lengkap", "peringatan kelengkapan tampil");
  ada(html, "NIK 16 angka", "kekurangan NIK tampil");
  ada(html, "Selfie dengan KTP: belum diunggah", "slot selfie kosong disebutkan");
  ada(html, "Bukti penghasilan: belum diunggah", "slot bukti kosong disebutkan");
  ada(html, "—", "isian kosong memakai tanda pisah, bukan kata \"undefined\"");
  bersih(html, "rincian belum lengkap");
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
