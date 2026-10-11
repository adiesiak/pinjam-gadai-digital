/**
 * Uji render blok analitik & risiko admin (bagian MURNI, tanpa Convex).
 * Run: bun src/components/admin/RingkasanAnalitik.render.test.tsx
 *
 * Kenapa bagian murni yang diuji: grafik sendiri digambar di peramban
 * (`ResponsiveContainer` butuh ukuran elemen), jadi yang BISA diverifikasi di
 * luar peramban adalah angka & teksnya — judul kartu, total pada lencana,
 * legenda donut beserta persennya, baris peringatan risiko, dan keadaan kosong.
 * Itu justru bagian yang paling mudah salah: persen dari total yang keliru,
 * "0%" saat belum ada data, atau baris risiko untuk keadaan yang tidak terjadi.
 */
import { renderToStaticMarkup } from "react-dom/server";

import { RingkasanAnalitikView } from "./RingkasanAnalitik";
import { formatRupiah } from "@/lib/money";
import {
  daftarPeringatanRisiko,
  komposisiStatusPinjaman,
  METRIK_RISIKO_KOSONG,
  seriTren30Hari,
} from "@/lib/analitikAdmin";

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

const SEKARANG = new Date(2026, 9, 15, 10, 0, 0).getTime();

/* ===== 1. Isi lengkap: dua grafik + widget risiko ===== */
{
  const tren = seriTren30Hari(
    [
      // Hari ini: pencairan 2 jt (dua peristiwa) + pelunasan 1 jt.
      { tipe: "pencairan", waktu: SEKARANG, jumlah: 1_250_000 },
      { tipe: "pencairan", waktu: SEKARANG - 3_600_000, jumlah: 750_000 },
      { tipe: "pelunasan", waktu: SEKARANG, jumlah: 1_000_000 },
    ],
    SEKARANG,
  );
  const risiko = daftarPeringatanRisiko({
    ...METRIK_RISIKO_KOSONG,
    gpsMismatch: 3,
    pinjamanTerlambat: 2,
    pendapatanDiBawahAmbang: 4,
    // Satu sinyal tingkat "sedang" supaya pemisahan tingkat benar-benar teruji
    // (bukan sekadar semua-tinggi yang kebetulan lolos).
    pinjamanTanpaLokasi: 5,
  });
  const html = renderToStaticMarkup(
    <RingkasanAnalitikView
      tren={tren}
      komposisi={komposisiStatusPinjaman({ lancar: 12, ditinjau: 5, jatuhTempo: 3 })}
      risiko={risiko}
      onBukaModul={() => {}}
    />,
  );

  ada(html, "Tren Pencairan &amp; Pelunasan (30 Hari)", "kartu tren tampil dengan judulnya");
  ada(html, "Komposisi Status Pinjaman", "kartu komposisi tampil dengan judulnya");
  ada(html, "Potensi risiko tinggi", "widget risiko tampil");

  // Total pada lencana harus angka nyata dari seri, bukan hard-code di JSX.
  ada(html, "Pencairan Rp2 jt", "total pencairan menjumlahkan peristiwa dalam satu hari");
  ada(html, "Pelunasan Rp1 jt", "total pelunasan dihitung dari seri");
  ada(html, "30 hari terakhir", "rentang seri dinyatakan");

  // Legenda donut: label + angka + persen dari total 20.
  ada(html, "Lancar", "segmen lancar tampil");
  ada(html, "Ditinjau", "segmen ditinjau tampil");
  ada(html, "Jatuh Tempo", "segmen jatuh tempo tampil");
  ada(html, "60%", "persen lancar dihitung dari total (12/20)");
  ada(html, "25%", "persen ditinjau dihitung dari total (5/20)");
  ada(html, "15%", "persen jatuh tempo dihitung dari total (3/20)");
  ada(html, "Total 20 pinjaman berjalan &amp; ditinjau.", "total pinjaman dinyatakan tegas");

  // Peringatan risiko: tingkat, angka kasus, dan jalur tindak lanjutnya.
  ada(html, "3 tinggi", "jumlah peringatan tinggi dirangkum");
  ada(html, "1 sedang", "jumlah peringatan sedang dirangkum");
  ada(html, "Lokasi di luar radius", "peringatan lokasi tampil");
  ada(html, "Melewati jatuh tempo", "peringatan jatuh tempo tampil");
  ada(html, "Pendapatan di bawah ambang batas", "peringatan kemampuan bayar tampil");
  ada(html, "3 kasus", "angka kasus ditampilkan apa adanya");
  ada(html, "Tinjau", "setiap peringatan punya tombol tindak lanjut");
  ada(html, "Salin ringkasan", "ringkasan risiko bisa disalin");

  bersih(html, "blok analitik lengkap");
}

/* ===== 2. Keadaan kosong tidak boleh mengarang data ===== */
{
  const html = renderToStaticMarkup(
    <RingkasanAnalitikView
      tren={seriTren30Hari([], SEKARANG)}
      komposisi={komposisiStatusPinjaman({ lancar: 0, ditinjau: 0, jatuhTempo: 0 })}
      risiko={daftarPeringatanRisiko(METRIK_RISIKO_KOSONG)}
      onBukaModul={() => {}}
    />,
  );
  ada(
    html,
    "Belum ada pinjaman berjalan maupun ditinjau",
    "donut tanpa data menjelaskan keadaannya",
  );
  ok(!html.includes("0%"), "tidak ada “0%” menyesatkan saat total nol");
  // Total nol HARUS tetap tampil (bukan kartu kosong): angka "belum ada transaksi"
  // adalah informasi, dan formatnya mengikuti satu formatter yang sama dengan
  // bagian lain aplikasi.
  ada(html, formatRupiah(0), "total nol tetap dilaporkan, bukan disembunyikan");
  ada(
    html,
    "Tidak ada sinyal risiko yang aktif saat ini",
    "risiko kosong dinyatakan sebagai aman, bukan daftar kosong",
  );
  ok(!html.includes("Tinjau"), "tanpa peringatan tidak ada tombol tindak lanjut");
  ok(!html.includes("Salin ringkasan"), "tombol salin disembunyikan saat tidak ada temuan");
  bersih(html, "blok analitik kosong");
}

/* ===== 3. Satu peringatan saja tetap tampil dengan tingkatnya ===== */
{
  const html = renderToStaticMarkup(
    <RingkasanAnalitikView
      tren={seriTren30Hari([], SEKARANG)}
      komposisi={komposisiStatusPinjaman({ lancar: 1, ditinjau: 0, jatuhTempo: 0 })}
      risiko={daftarPeringatanRisiko({ ...METRIK_RISIKO_KOSONG, titikDicurigai: 1 })}
      onBukaModul={() => {}}
    />,
  );
  ada(html, "Titik lokasi dicurigai", "peringatan tunggal tampil");
  ada(html, "1 tinggi", "peringkat tinggi dihitung");
  ada(html, "0 sedang", "peringkat sedang tetap dilaporkan sebagai 0 (bukan disembunyikan)");
  ada(html, "100%", "satu-satunya segmen = 100% dari total");
  bersih(html, "blok analitik satu peringatan");
}

if (failed > 0) {
  console.error(`\n${failed} gagal, ${passed} lulus`);
  process.exit(1);
}
console.log(`RingkasanAnalitik.render: ${passed} lulus`);
