/**
 * Run: bun src/components/PermohonanRestrukturisasi.render.test.tsx
 *
 * Uji render formulir permohonan nasabah tanpa server: keadaan menunggu
 * keputusan, pilihan perpanjangan/cicilan, usulan yang tidak valid, tanpa opsi,
 * dan riwayat keputusan. Semua teks yang diperiksa adalah yang dibaca nasabah.
 */
import { renderToStaticMarkup } from "react-dom/server";

import {
  BagianPermohonanNasabah,
  type RingkasanPermohonanNasabah,
} from "./PermohonanRestrukturisasi";

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

const DASAR: RingkasanPermohonanNasabah = {
  statusPinjaman: "didanai",
  tenorHari: 30,
  tenorBulan: null,
  totalKewajiban: 1_300_000,
  bolehPerpanjangan: true,
  alasanPerpanjangan: null,
  bolehCicilan: true,
  alasanCicilan: null,
  menunggu: null,
  riwayat: [],
};

const tanpaAksi = () => {};

function gambar(
  props: Partial<Parameters<typeof BagianPermohonanNasabah>[0]> = {},
): string {
  return renderToStaticMarkup(
    <BagianPermohonanNasabah
      hasil={DASAR}
      jenisAktif="perpanjangan_tenor"
      tambahan={14}
      nilaiUsulan={440_000}
      alasan=""
      sibuk={false}
      kabar={null}
      galat={null}
      onPilihJenis={tanpaAksi}
      onUbahTambahan={tanpaAksi}
      onUbahUsulan={tanpaAksi}
      onUbahAlasan={tanpaAksi}
      onKirim={tanpaAksi}
      {...props}
    />,
  );
}

// ===== 1. Formulir perpanjangan =====
{
  const html = gambar();
  ada(html, "Ajukan restrukturisasi", "judul bagian");
  ada(html, "Perpanjangan tenor", "pilihan perpanjangan");
  ada(html, "Cicilan bertahap", "pilihan cicilan");
  ada(html, "Tenor menjadi 44 hari", "tenor baru dari 30 + 14");
  ada(html, "Kirim permohonan", "tombol kirim");
  ada(html, 'disabled=""', "tombol terkunci saat alasan kosong");
  bersih(html, "formulir perpanjangan");
}

// ===== 2. Alasan cukup =====
{
  const html = gambar({ alasan: "Penghasilan turun karena usaha sepi." });
  tidakAda(html, 'disabled=""', "tombol aktif saat alasan cukup");
}

// ===== 3. Skema bulanan hanya menawarkan cicilan =====
{
  const html = gambar({
    hasil: {
      ...DASAR,
      tenorBulan: 3,
      tenorHari: 90,
      bolehPerpanjangan: false,
      alasanPerpanjangan: "Perpanjangan hanya untuk pinjaman harian.",
    },
    jenisAktif: "cicilan",
    alasan: "Ingin membayar bertahap.",
  });
  ada(html, "Cicilan bertahap", "pilihan cicilan bulanan");
  tidakAda(html, "Perpanjangan tenor", "tanpa pilihan perpanjangan bulanan");
  ada(html, "Usulan per pembayaran", "kolom nominal cicilan");
  ada(html, "sekitar 3 kali", "perkiraan jumlah pembayaran");
  bersih(html, "formulir cicilan");
}

// ===== 4. Usulan cicilan di atas kewajiban =====
{
  const html = gambar({
    jenisAktif: "cicilan",
    nilaiUsulan: 2_000_000,
    alasan: "Nominal ini melebihi kewajiban.",
  });
  ada(html, "melebihi total kewajiban", "alasan usulan tidak valid");
  ada(html, 'disabled=""', "tombol terkunci saat usulan tidak valid");
}

// ===== 5. Menunggu keputusan =====
{
  const html = gambar({
    hasil: {
      ...DASAR,
      menunggu: {
        _id: "r1" as never,
        jenis: "perpanjangan_tenor",
        tambahanHari: 14,
        tenorBaruHari: 44,
        usulanCicilan: null,
        alasan: "Penghasilan turun sementara.",
        dibuatPada: Date.UTC(2026, 9, 19),
      },
    },
  });
  ada(html, "Permohonan sedang diperiksa", "keadaan menunggu");
  ada(html, "Perpanjangan menjadi 44 hari (+14)", "rincian permohonan");
  ada(html, "belum berubah", "janji tidak mengubah angka sebelum diputuskan");
  tidakAda(html, "Kirim permohonan", "tanpa formulir saat menunggu");
  bersih(html, "kartu menunggu");
}

// ===== 6. Menunggu keputusan cicilan =====
{
  const html = gambar({
    hasil: {
      ...DASAR,
      menunggu: {
        _id: "r2" as never,
        jenis: "cicilan",
        tambahanHari: 0,
        tenorBaruHari: 30,
        usulanCicilan: 400_000,
        alasan: "Ingin membayar bertahap.",
        dibuatPada: Date.UTC(2026, 9, 19),
      },
    },
  });
  ada(html, "Usulan cicilan Rp 400.000 per pembayaran", "rincian cicilan menunggu");
}

// ===== 7. Tidak ada jalur yang tersedia =====
{
  const html = gambar({
    hasil: {
      ...DASAR,
      bolehPerpanjangan: false,
      alasanPerpanjangan: "Pinjaman belum berjalan.",
      bolehCicilan: false,
      alasanCicilan: "Pinjaman belum berjalan.",
    },
    jenisAktif: null,
  });
  ada(html, "Pinjaman belum berjalan", "alasan tanpa opsi");
  tidakAda(html, "Kirim permohonan", "tanpa tombol saat tidak ada opsi");
}

// ===== 8. Riwayat keputusan =====
{
  const html = gambar({
    hasil: {
      ...DASAR,
      riwayat: [
        {
          _id: "r3" as never,
          jenis: "perpanjangan_tenor",
          status: "disetujui",
          tenorLamaHari: 30,
          tenorBaruHari: 44,
          tambahanHari: 14,
          usulanCicilan: null,
          alasan: "Penghasilan turun sementara.",
          dibuatPada: Date.UTC(2026, 9, 10),
          diputuskanPada: Date.UTC(2026, 9, 11),
          catatanKeputusan: "Disetujui penyelia.",
        },
      ],
    },
  });
  ada(html, "Disetujui", "status riwayat");
  ada(html, "Perpanjangan tenor", "jenis riwayat");
  ada(html, "30 → 44 hari", "perubahan tenor di riwayat");
  ada(html, "Disetujui penyelia.", "catatan keputusan");
}

console.log(`PermohonanRestrukturisasi: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
