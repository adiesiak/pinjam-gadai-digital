/**
 * Uji render bagian MURNI tab Bantuan (pengaduan nasabah).
 * Run: bun src/pages/dashboard/helpdesk-views.render.test.tsx
 *
 * Komponen yang tersambung Convex tidak bisa dirender di luar aplikasi, jadi
 * dua bagian presentasionalnya diuji langsung: baris pengaduan dan daftar pesan
 * utas. Yang dijaga:
 *  - status & prioritas selalu terbaca sebagai TEKS (warna hanya pendamping);
 *  - penyelesaian petugas tampil bila ada, dan tidak muncul saat kosong;
 *  - arah pesan ("Anda" vs "Petugas PINDAI") tidak pernah disimpulkan dari warna;
 *  - utas kosong menjelaskan keadaannya;
 *  - tidak ada "undefined"/"NaN"/"[object Object]" pada keluaran.
 */
import { renderToStaticMarkup } from "react-dom/server";

import type { Id } from "@/convex/_generated/dataModel";
import {
  BarisPengaduanSaya,
  DaftarPesanPengaduan,
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
    nomorReferensi: "PGD-BANTUAN-1",
    kanal: "aplikasi",
    kategori: "salah_tagih",
    kategoriLabel: "Salah tagih",
    isi: "Nominal tagihan berbeda dari yang saya bayar kemarin.",
    status: "ditinjau",
    statusLabel: "Ditinjau",
    prioritas: "tinggi",
    prioritasLabel: "Tinggi",
    penyelesaian: null,
    dibuatPada: 1_700_000_000_000,
    diperbaruiPada: 1_700_000_100_000,
    ditutupPada: null,
    jumlahPesan: 2,
    pesanTerakhir: "Kami sedang mencocokkan bukti transfer Anda.",
    pesanTerakhirArah: "petugas",
    pesanTerakhirPada: 1_700_000_100_000,
    bolehBalas: true,
    ...overrides,
  };
}

// ===== 1. Baris pengaduan: status, prioritas, referensi, ringkasan utas =====
{
  const html = renderToStaticMarkup(
    <BarisPengaduanSaya pengaduan={pengaduan()} terbuka={false} onToggle={() => {}} />,
  );
  ada(html, "Salah tagih", "kategori berlabel manusia");
  ada(html, "Ditinjau", "status tampil sebagai teks");
  ada(html, "Prioritas Tinggi", "prioritas tampil sebagai teks");
  ada(html, "PGD-BANTUAN-1", "nomor referensi pinjaman tampil");
  ada(html, "Nominal tagihan berbeda", "isi pengaduan tampil");
  ada(html, "2 pesan", "jumlah pesan tampil");
  ada(html, "ada balasan petugas", "asal pesan terakhir dijelaskan");
  ada(html, "Lihat percakapan", "tombol membuka percakapan");
  tidakAda(html, "Penyelesaian dari petugas", "penyelesaian tidak dikarang saat kosong");
  bersih(html, "baris pengaduan");
}

// ===== 2. Penyelesaian tampil saat ada, dan tombol berubah saat terbuka =====
{
  const html = renderToStaticMarkup(
    <BarisPengaduanSaya
      pengaduan={pengaduan({
        status: "selesai",
        statusLabel: "Selesai",
        prioritas: "kritis",
        prioritasLabel: "Kritis",
        penyelesaian: "Tagihan dikoreksi dan nasabah sudah diberi tahu.",
        ditutupPada: 1_700_000_200_000,
        bolehBalas: false,
        pesanTerakhirArah: "nasabah",
      })}
      terbuka
      onToggle={() => {}}
    />,
  );
  ada(html, "Penyelesaian dari petugas", "penyelesaian tampil saat ada");
  ada(html, "Tagihan dikoreksi", "isi penyelesaian tampil");
  ada(html, "Prioritas Kritis", "prioritas kritis tampil");
  ada(html, "pesan terakhir dari Anda", "arah pesan terakhir nasabah terbaca");
  ada(html, "Tutup percakapan", "tombol menutup saat utas terbuka");
  bersih(html, "baris pengaduan selesai");
}

// ===== 3. Utas pesan: arah sebagai kata, bukan warna saja ===================
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
  ada(html, "Anda", "pesan nasabah diberi label \"Anda\"");
  ada(html, "Petugas PINDAI", "pesan petugas diberi label \"Petugas PINDAI\"");
  ada(html, "Rani", "nama penulis nasabah tampil");
  ada(html, "petugas@pindai.test", "nama penulis petugas tampil");
  ada(html, "bukti transfer Anda", "isi pesan petugas tampil");
  bersih(html, "utas pesan");
}

// ===== 4. Utas kosong =====
{
  const html = renderToStaticMarkup(<DaftarPesanPengaduan pesan={[]} />);
  ada(html, "Belum ada pesan", "utas kosong menjelaskan keadaan");
  bersih(html, "utas kosong");
}

if (failed > 0) {
  console.error(`\n${failed} gagal, ${passed} lulus`);
  throw new Error(`${failed} tes render tab Bantuan gagal`);
}
console.log(`helpdesk-views: ${passed} lulus`);
