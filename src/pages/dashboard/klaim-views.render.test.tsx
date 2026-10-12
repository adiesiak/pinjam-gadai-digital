/**
 * Uji render kartu RIWAYAT PEMINJAM LAMA di dashboard (/dashboard).
 * Run: bun src/pages/dashboard/klaim-views.render.test.tsx
 *
 * Kenapa diuji terpisah: dashboard utuhnya membaca Convex (useQuery/useAuth),
 * sehingga tidak bisa dirender di luar aplikasi. Kartu ini menerima datanya
 * sebagai prop, jadi bisa dirender langsung di sini. Yang dijaga sesuai
 * permintaan produk — peminjam dari web lama TIDAK boleh mendarat di layar
 * kosong:
 *
 *  - saat datanya belum ada / kosong, kartu tidak mencetak apa pun (tanpa
 *    kerangka palsu);
 *  - saat akun sudah pernah mengklaim, yang tampil adalah nomor bertopeng,
 *    kapan & lewat jalur apa klaim terjadi, angka portofolio (pinjaman, pokok,
 *    aktif, lunas), dan DAFTAR RIWAYAT pinjaman beserta skema dan statusnya;
 *  - tidak ada "undefined"/"NaN" di markup.
 *
 * Catatan cakupan: jalur TAWARAN klaim (blok yang menyematkan formulir
 * `KlaimPeminjamLama`) tidak dirender di sini karena formulirnya memakai hook
 * Convex yang butuh provider aplikasi. Syarat tawarannya sendiri (nomor
 * tersimpan + tepat satu pemilik lama lain + ada berkas) diuji di
 * `src/convex/klaimPeminjam.convex.test.ts`.
 */
import { renderToStaticMarkup } from "react-dom/server";
import type { FunctionReturnType } from "convex/server";

import { api } from "@/convex/_generated/api";
import { RingkasanPeminjamLama } from "@/pages/dashboard/klaim-views";

type Ringkasan = FunctionReturnType<typeof api.klaimPeminjam.ringkasanKlaimSaya>;

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
  ok(!html.includes("NaN"), `${label} tanpa "NaN"`);
  ok(!html.includes("[object Object]"), `${label} tanpa "[object Object]"`);
}

/** Kunci yang bertipe `Id<"loans">` di produksi; di uji cukup berbentuk string. */
const DASAR: NonNullable<Ringkasan> = {
  sudahKlaim: false,
  klaimTerbaru: null,
  nomorTersimpanTampil: null,
  tawaranKlaim: null,
  ringkasan: {
    pinjaman: 0,
    pinjamanAktif: 0,
    pinjamanLunas: 0,
    pokokPinjaman: 0,
    gadai: 0,
    gadaiAktif: 0,
    kredit: 0,
    kreditAktif: 0,
  },
  pinjaman: [],
  kalimat: null,
};

// ===== Data belum ada / akun tanpa portofolio =====
ok(renderToStaticMarkup(<RingkasanPeminjamLama klaim={undefined} />) === "", "loading = kosong");
ok(renderToStaticMarkup(<RingkasanPeminjamLama klaim={null} />) === "", "tanpa data = kosong");
ok(
  renderToStaticMarkup(<RingkasanPeminjamLama klaim={DASAR} />) === "",
  "akun baru tanpa berkas & tanpa tawaran = kosong",
);

// ===== Peminjam lama dengan riwayat =====
const AKUN_LAMA: NonNullable<Ringkasan> = {
  sudahKlaim: true,
  klaimTerbaru: {
    nomorTampil: "62812•••••890",
    pada: Date.UTC(2026, 0, 12),
    metode: "otp_whatsapp",
    pinjaman: 1,
    gadai: 1,
    kredit: 1,
    pokokPinjaman: 1_000_000,
    keterangan: "Nomor 62812•••••890 diverifikasi.",
  },
  nomorTersimpanTampil: "62812•••••890",
  tawaranKlaim: null,
  ringkasan: {
    pinjaman: 2,
    pinjamanAktif: 1,
    pinjamanLunas: 1,
    pokokPinjaman: 2_500_000,
    gadai: 1,
    gadaiAktif: 1,
    kredit: 1,
    kreditAktif: 0,
  },
  pinjaman: [
    {
      _id: "loan-1" as never,
      nomorReferensi: "PGD-LAMA-1",
      pokokPinjaman: 1_000_000,
      status: "didanai",
      tenorHari: 30,
      tenorBulan: null,
      diajukanPada: Date.UTC(2025, 11, 1),
      didanaiPada: Date.UTC(2025, 11, 2),
      lunasPada: null,
      skema: "harian",
    },
    {
      _id: "loan-2" as never,
      nomorReferensi: "PGD-LAMA-2",
      pokokPinjaman: 1_500_000,
      status: "lunas",
      // `tenorHari` wajib pada skema (selalu terisi saat pengajuan), sedangkan
      // penanda skema bulanan datang dari `tenorBulan`.
      tenorHari: 30,
      tenorBulan: 3,
      diajukanPada: Date.UTC(2025, 8, 5),
      didanaiPada: Date.UTC(2025, 8, 6),
      lunasPada: Date.UTC(2025, 11, 6),
      skema: "bulanan",
    },
  ],
  kalimat: "1 pinjaman, 1 gadai dan 1 kredit barang dengan total pokok Rp1.000.000",
};

const html = renderToStaticMarkup(<RingkasanPeminjamLama klaim={AKUN_LAMA} />);
ada(html, "Riwayat peminjam lama", "judul riwayat tampil");
ada(html, "Data lama tersambung", "lencana klaim tampil");
ada(html, "62812•••••890", "nomor akun bertopeng");
ada(html, "login nomor lama", "jalur masuk dijelaskan (login nomor lama)");
ada(html, "Rp 2.500.000", "total pokok portofolio");
ada(html, "Proporsi pinjaman lunas", "batang proporsi lunas ada");
ada(html, "50%", "proporsi lunas dihitung dari data (1 dari 2)");
// Daftar riwayat: nomor referensi, skema, dan status per baris.
ada(html, "PGD-LAMA-1", "nomor referensi pinjaman pertama");
ada(html, "PGD-LAMA-2", "nomor referensi pinjaman kedua");
ada(html, "Harian 30 hari", "skema harian tampil");
ada(html, "Bulanan 3 bulan", "skema bulanan tampil");
ada(html, "Disalurkan", "status pinjaman berjalan tampil sebagai lencana");
ada(html, "Lunas", "status lunas tampil sebagai lencana");
ada(html, "Gadai 1 berkas (1 aktif)", "ringkasan gadai ikut tampil");
ada(html, "kredit barang 1 berkas (0 aktif)", "ringkasan kredit ikut tampil");
ada(html, "nominal, status, tanggal", "catatan bahwa klaim tidak mengubah nilai");
ok((html.match(/<li/g) ?? []).length >= 2, "daftar riwayat memakai elemen daftar");
bersih(html, "markup riwayat peminjam lama");

console.log(`klaim-views.render.test: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
