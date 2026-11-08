/**
 * Uji render bagian MURNI kotak tiket nasabah.
 * Run: bun src/pages/dashboard/helpdesk-views.render.test.tsx
 *
 * Komponen yang tersambung Convex tidak bisa dirender di luar aplikasi, jadi
 * dua bagian presentasionalnya diuji langsung: kartu tiket dan daftar pesan
 * utas. Yang dijaga:
 *  - nomor tiket, kategori, status, dan balasan baru selalu terbaca sebagai TEKS;
 *  - tiket yang ditutup tidak menawarkan balasan baru;
 *  - arah pesan ("Anda" vs "Petugas PINDAI") tidak pernah disimpulkan dari warna;
 *  - utas kosong menjelaskan keadaannya;
 *  - tidak ada "undefined"/"NaN"/"[object Object]" pada keluaran.
 */
import { renderToStaticMarkup } from "react-dom/server";

import type { Id } from "@/convex/_generated/dataModel";
import {
  DaftarPesanPengaduan,
  KartuTiket,
  type PengaduanSaya,
  type PesanUtasSaya,
} from "./helpdesk-views";

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

function pengaduan(overrides: Partial<PengaduanSaya> = {}): PengaduanSaya {
  return {
    _id: "pg1" as Id<"pengaduanNasabah">,
    nomorTiket: "TKT-20231114-ABC123",
    nomorReferensi: "PGD-BANTUAN-1",
    kanal: "aplikasi",
    kategori: "salah_tagih",
    kategoriLabel: "Salah tagih",
    isi: "Nominal tagihan berbeda dari yang saya bayar kemarin.",
    status: "ditinjau",
    statusLabel: "Ditinjau",
    prioritas: "tinggi",
    prioritasLabel: "Tinggi",
    petugasLabel: "petugas@pindai.test",
    penyelesaian: null,
    dibuatPada: 1_700_000_000_000,
    diperbaruiPada: 1_700_000_100_000,
    ditutupPada: null,
    jumlahPesan: 2,
    pesanTerakhir: "Kami sedang mencocokkan bukti transfer Anda.",
    pesanTerakhirArah: "petugas",
    pesanTerakhirPada: 1_700_000_100_000,
    jumlahBelumDibaca: 2,
    bolehBalas: true,
    ...overrides,
  };
}

// ===== 1. Kartu tiket: nomor, status, balasan baru, cuplikan ===============
{
  const html = renderToStaticMarkup(
    <KartuTiket tiket={pengaduan()} aktif={false} onPilih={() => {}} />,
  );
  ada(html, "TKT-20231114-ABC123", "nomor tiket tampil");
  ada(html, "Salah tagih", "kategori berlabel manusia");
  ada(html, "Ditinjau", "status tampil sebagai teks");
  ada(html, "2 balasan baru", "jumlah balasan baru tampil sebagai teks");
  ada(html, "Kami sedang mencocokkan", "cuplikan pesan terakhir tampil");
  ada(html, "Diperbarui", "waktu pembaruan tampil");
  tidakAda(html, "Tiket sudah ditutup", "tiket aktif tidak disebut ditutup");
  bersih(html, "kartu tiket");
}

// ===== 2. Tiket ditutup tidak menawarkan balasan baru ======================
{
  const html = renderToStaticMarkup(
    <KartuTiket
      tiket={pengaduan({
        status: "selesai",
        statusLabel: "Selesai",
        penyelesaian: "Tagihan dikoreksi dan nasabah sudah diberi tahu.",
        ditutupPada: 1_700_000_200_000,
        jumlahBelumDibaca: 0,
        bolehBalas: false,
      })}
      aktif
      onPilih={() => {}}
    />,
  );
  ada(html, "Selesai", "status selesai tampil");
  ada(html, "Tiket sudah ditutup", "tiket tertutup dijelaskan");
  ada(html, 'aria-pressed="true"', "kartu aktif ditandai untuk pembaca layar");
  tidakAda(html, "balasan baru", "tiket tertutup tanpa lencana balasan baru");
  bersih(html, "kartu tiket selesai");
}

// ===== 3. Tiket baru: menunggu petugas =====================================
{
  const html = renderToStaticMarkup(
    <KartuTiket
      tiket={pengaduan({
        status: "baru",
        statusLabel: "Baru",
        jumlahBelumDibaca: 0,
        pesanTerakhir: null,
        pesanTerakhirArah: null,
        pesanTerakhirPada: null,
        bolehBalas: true,
      })}
      aktif={false}
      onPilih={() => {}}
    />,
  );
  ada(html, "Menunggu petugas", "tiket baru menjelaskan antreannya");
  ada(html, "Nominal tagihan berbeda", "isi awal menjadi cuplikan bila belum ada balasan");
  tidakAda(html, "undefined", "tiket baru tanpa nilai kosong yang bocor");
  bersih(html, "kartu tiket baru");
}

// ===== 4. Utas pesan: arah sebagai kata, bukan warna saja ==================
{
  const pesan: PesanUtasSaya[] = [
    {
      _id: "m1" as Id<"pengaduanPesan">,
      arah: "nasabah",
      isi: "Nominal tagihan berbeda dari yang saya bayar.",
      penulisLabel: "Rani",
      dibuatPada: 1_700_000_000_000,
    },
    {
      _id: "m2" as Id<"pengaduanPesan">,
      arah: "petugas",
      isi: "Kami sedang mencocokkan bukti transfer Anda.",
      penulisLabel: "petugas@pindai.test",
      dibuatPada: 1_700_000_100_000,
    },
  ];
  const html = renderToStaticMarkup(<DaftarPesanPengaduan pesan={pesan} />);
  ada(html, "Anda", 'pesan nasabah diberi label "Anda"');
  ada(html, "Petugas PINDAI", 'pesan petugas diberi label "Petugas PINDAI"');
  ada(html, "Rani", "nama penulis nasabah tampil");
  ada(html, "petugas@pindai.test", "nama penulis petugas tampil");
  ada(html, "bukti transfer Anda", "isi pesan petugas tampil");
  bersih(html, "utas pesan");
}

// ===== 5. Utas kosong ======================================================
{
  const html = renderToStaticMarkup(<DaftarPesanPengaduan pesan={[]} />);
  ada(html, "Belum ada pesan", "utas kosong menjelaskan keadaan");
  bersih(html, "utas kosong");
}

if (failed > 0) {
  console.error(`\n${failed} gagal, ${passed} lulus`);
  throw new Error(`${failed} tes render kotak tiket gagal`);
}
console.log(`helpdesk-views: ${passed} lulus`);
