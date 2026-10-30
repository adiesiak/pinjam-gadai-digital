/**
 * Uji setoran penempatan di ruang pendana.
 * Run: bun src/components/penyediaDana/AjukanPenempatan.test.ts
 *
 * Komponennya memakai hook Convex, jadi tidak bisa dirender tanpa server.
 * Yang diperiksa di sini: aturan isian yang menahan kiriman sebelum menyentuh
 * jaringan, dan sambungannya ke jalur server yang SUDAH ADA (`requestDeposit`,
 * `myDeposits`, dan antrean pencocokan admin). Perilaku servernya sendiri
 * ditahan `alokasiDana.convex.test.ts`.
 */
import { readFileSync } from "node:fs";

import { validasiSetoran } from "./AjukanPenempatan";

let lulus = 0;
let gagal = 0;
function cek(syarat: boolean, label: string): void {
  if (syarat) lulus += 1;
  else {
    gagal += 1;
    console.error(`FAIL ${label}`);
  }
}

const DASAR = {
  jumlah: 1_000_000,
  referensi: "TRF-882301",
  tanggal: Date.UTC(2026, 9, 23),
  ukuranBukti: 400_000,
  adaBukti: true,
  sekarang: Date.UTC(2026, 9, 25),
};

// ===== Aturan isian =====
cek(validasiSetoran(DASAR) === null, "isian lengkap diterima");
cek(
  validasiSetoran({ ...DASAR, jumlah: 0 }) !== null,
  "nominal nol ditolak",
);
cek(
  validasiSetoran({ ...DASAR, jumlah: 1_500_000.5 }) !== null,
  "nominal berdesimal ditolak",
);
cek(
  validasiSetoran({ ...DASAR, referensi: "  ab  " }) !== null,
  "referensi terlalu pendek ditolak",
);
cek(
  validasiSetoran({ ...DASAR, referensi: "x".repeat(121) }) !== null,
  "referensi terlalu panjang ditolak",
);
cek(
  validasiSetoran({ ...DASAR, tanggal: DASAR.sekarang + 10 * 60_000 }) !== null,
  "tanggal transfer di masa depan ditolak",
);
cek(
  validasiSetoran({ ...DASAR, tanggal: DASAR.sekarang - 60_000 }) === null,
  "tanggal transfer kemarin tetap diterima",
);
cek(
  validasiSetoran({ ...DASAR, adaBukti: false }) !== null,
  "tanpa bukti transfer ditolak",
);
cek(
  validasiSetoran({ ...DASAR, ukuranBukti: 5_000_001 }) !== null,
  "bukti lebih dari 5 MB ditolak",
);

// ===== Sambungan ke server dan halaman =====
const komponen = readFileSync(
  "src/components/penyediaDana/AjukanPenempatan.tsx",
  "utf8",
);
const halaman = readFileSync("src/pages/PenyediaDana.tsx", "utf8");
const pengaturan = readFileSync(
  "src/components/admin/SystemConfigPanel.tsx",
  "utf8",
);

cek(
  komponen.includes("api.alokasiDana.requestDeposit"),
  "setoran dikirim lewat mutation yang sudah teruji",
);
cek(
  komponen.includes("api.alokasiDana.myDeposits"),
  "riwayat setoran dibaca dari akun, bukan disimpan di peramban",
);
cek(
  komponen.includes("api.system.getPaymentInstructions"),
  "rekening tujuan dibaca dari pengaturan admin",
);
cek(
  komponen.includes("unggahDokumen"),
  "bukti transfer diunggah lewat helper unggah bersama",
);
cek(
  komponen.includes("instruksi === undefined || !aktif"),
  "tombol setoran terkunci saat setoran manual belum dibuka admin",
);
cek(
  komponen.includes("menunggu_verifikasi") &&
    komponen.includes("Terverifikasi") &&
    komponen.includes("Ditolak"),
  "tiga status setoran diterjemahkan ke bahasa layar",
);
cek(
  /isPendana\s*&&\s*\(\s*<BatasBagian[\s\S]{0,160}<AjukanPenempatan/.test(halaman),
  "kartu setoran hanya tampil untuk akun pemilik portofolio",
);
cek(
  !komponen.includes("—"),
  "copy kartu bebas tanda pisah panjang",
);
cek(
  pengaturan.includes('upd("manualDepositEnabled"') &&
    pengaturan.includes("cfg-deposit-manual"),
  "admin punya sakelar penerimaan setoran manual",
);

const jumlah = lulus + gagal;
console.log(`AjukanPenempatan.test: ${lulus}/${jumlah} lulus`);
if (gagal > 0) process.exit(1);
