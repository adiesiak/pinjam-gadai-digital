/**
 * Uji render & perkabelan PENGAJUAN CEPAT pasca-KYC.
 * Run: bun src/pages/dashboard/pengajuan-cepat.render.test.tsx
 *
 * Kenapa uji ini ada: begitu identitas TERVERIFIKASI, wizard tujuh tahap tidak
 * boleh lagi muncul, yang tampil harus formulir satu halaman dengan empat isian
 * (nominal, tenor, keperluan, konfirmasi rekening tersimpan) dan SATU tombol
 * kirim. Karena formulirnya membaca Convex (dan tidak bisa dirender di luar
 * aplikasi), yang diperiksa di sini:
 *
 *  1. **Kartu rekening tersimpan** dirender langsung (murni, tanpa hook),
 *     membuktikan nomor rekening hanya tampil BERTopeng.
 *  2. **Sumber komponen** dibaca sebagai teks: keempat isian ada, mutasi server
 *     yang dipakai tetap `loans.createLoanApplication` (tidak ada mutasi baru),
 *     dan wizard tujuh tahap benar-benar dilewati saat status VERIFIED.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";

import { KartuRekeningTersimpan } from "@/pages/dashboard/pengajuan-cepat-views";
import { maskRekening } from "@/lib/kycTahapan";

let passed = 0;
let failed = 0;
function ok(syarat: boolean, label: string): void {
  if (syarat) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${label}`);
  }
}
function ada(teks: string, cari: string, label: string): void {
  ok(teks.includes(cari), `${label} (memuat "${cari}")`);
}
function tidakAda(teks: string, cari: string, label: string): void {
  ok(!teks.includes(cari), `${label} (tidak memuat "${cari}")`);
}

const baca = (relatif: string) =>
  readFileSync(fileURLToPath(new URL(relatif, import.meta.url)), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

// ===== 1. Kartu rekening tersimpan (render murni) =====
const NOMOR = "1234567890";
const kartu = renderToStaticMarkup(
  <KartuRekeningTersimpan namaBank="BCA" nomorRekening={NOMOR} />,
);
ada(kartu, "BCA", "nama bank tersimpan tampil");
ada(kartu, "Tersimpan di KYC", "asal rekening disebut: dari data KYC");
ada(kartu, maskRekening(NOMOR), "nomor rekening tampil bertopeng");
tidakAda(kartu, NOMOR, "nomor rekening UTUH tidak pernah ditampilkan");
ok(maskRekening(NOMOR) !== NOMOR, "topeng benar-benar menyembunyikan sebagian digit");

// ===== 2. Sumber komponen pengajuan cepat =====
const cepat = baca("./pengajuan-cepat-views.tsx");
ada(cepat, "export function PengajuanCepatSection", "komponen pengajuan cepat ada");

// Empat isian yang diminta produk.
ada(cepat, "Nominal pinjaman", "isian nominal ada");
ada(cepat, "Lama pinjaman", "isian tenor ada");
ada(cepat, "Keperluan pinjaman", "isian keperluan ada");
ada(cepat, "Rekening penerima dana", "konfirmasi rekening tersimpan ada");
ada(cepat, "Setujui & kirim pengajuan", "tombol kirim satu halaman ada");

// Mutasi server TIDAK berubah, dan argumen wajibnya tetap dikirim.
ada(cepat, "api.loans.createLoanApplication", "memakai mutasi pengajuan pinjaman yang sudah ada");
tidakAda(cepat, "useMutation(api.loans.createPawnApplication", "tidak menambah mutasi gadai");
ada(cepat, "persetujuanSyarat: true", "persetujuan S&K tetap dicatat server");
ada(cepat, "tandaTangan:", "tanda tangan tetap dikirim (syarat server)");
ada(cepat, "lokasiAjukan: lokasi", "titik GPS tetap dikirim (syarat server)");
ada(cepat, "dokKtpId,", "id dokumen KYC dipakai ulang, tidak diunggah lagi");

// Aturan validasi berasal dari modul murni, bukan ditulis ulang di JSX.
ada(cepat, 'validasiPengajuanCepat(isianCepat, ktp, plafon)', "validasi memakai aturan bersama");
ada(cepat, 'from "@/lib/pengajuanCepat"', "komponen memakai modul aturan pengajuan cepat");

// Nominal mengikuti batas plafon, bukan angka bebas.
ada(cepat, "batasNominalCepat(plafon)", "batas nominal mengikuti plafon");
ada(cepat, "disabled={submitting || kurangKtp.length > 0}", "tombol terkunci saat data KYC kurang");

// ===== 3. Perkabelan di modul KYC: wizard dilewati saat TERVERIFIKASI =====
const kyc = baca("./kyc-views.tsx");
ada(kyc, "isKycVerified(dataPasti.status) && !bukaDataKyc", "jalur cepat dibuka hanya saat VERIFIED");
ada(kyc, "<PengajuanCepatSection", "jalur cepat merender formulir satu halaman");
ada(kyc, 'dokKtpId: dokumenTersimpan.ktpId', "id dokumen diambil dari data KYC tersimpan");
ada(kyc, "onLihatDataKyc={() => setBukaDataKyc(true)}", "nasabah masih bisa membuka data KYC");

// Pencarian dibatasi pada `KycSection`: sejak tahap KYC juga tampil di menu
// sidebar, `<KycStepperTigaTahap` dipakai di luar wizard, jadi urutan di berkas
// bukan lagi bukti yang benar. Yang diperiksa: urutan KEDUA jalur di dalam
// komponen yang memuatnya.
const mulaiSection = kyc.indexOf("export function KycSection(");
const posisiCepat = kyc.indexOf("isKycVerified(dataPasti.status) && !bukaDataKyc", mulaiSection);
const posisiWizard = kyc.indexOf("<KycStepperTigaTahap", mulaiSection);
ok(
  mulaiSection > 0 && posisiCepat > mulaiSection && posisiWizard > 0,
  "kedua jalur (cepat & wizard) ada di KycSection",
);
ok(
  posisiCepat < posisiWizard,
  "jalur cepat diperiksa SEBELUM wizard dirender, jadi wizard benar-benar dilewati",
);
ok(
  kyc.indexOf("<PengajuanCepatSection", mulaiSection) < posisiWizard,
  "formulir cepat berada di cabang sebelum render wizard",
);

if (failed > 0) {
  console.error(`\n${failed} gagal, ${passed} lulus`);
  process.exit(1);
}
console.log(`pengajuan-cepat.render: ${passed} lulus`);
