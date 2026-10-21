/**
 * Uji pengisian QR verifikasi sebelum cetak. Run: bun src/lib/qrDokumen.test.ts
 *
 * Yang dijaga: kotak "QR" kosong pada dokumen kontrak diganti gambar QR asli,
 * dan dokumen tanpa kotak kosong tidak diubah sama sekali.
 */

import { buildPinjamanContract } from "./contract";
import { quotePinjaman } from "./loan";
import { lengkapiQrCetak } from "./qrDokumen";

let passed = 0;
let failed = 0;
function ok(syarat: boolean, label: string) {
  if (syarat) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${label}`);
  }
}

// Dokumen sungguhan dari pembangun kontrak, bukan contoh tulis tangan: kalau
// markup blok verifikasi berubah, uji ini ikut gagal.
const DOKUMEN = buildPinjamanContract(
  { namaLengkap: "RANI PUSPITA", namaBank: "BCA", nomorRekening: "1234567890", nik: null, email: null },
  quotePinjaman({ pokokPinjaman: 1_000_000, cairEkspres: false }),
  {
    nomorReferensi: "PGD-UJI-1",
    lokasi: null,
    timestampPada: Date.now(),
    verifikasi: {
      kode: "ABC123",
      hash: "a".repeat(64),
      diterbitkanPada: Date.now(),
      url: "https://pindai.biz.id/verifikasi/ABC123?x=1&y=2",
      qrDataUrl: null,
    },
  },
  30,
);

const hasil = await lengkapiQrCetak(DOKUMEN);
ok(hasil.includes('<img class="verif-qr" src="data:image/png;base64,'), "QR kosong diganti gambar");
ok(!hasil.includes("verif-qr-kosong"), "kotak kosong tidak tersisa");
ok(
  hasil.includes("Pindai QR atau buka https://pindai.biz.id/verifikasi/ABC123"),
  "alamat verifikasi tetap tercetak",
);

const tanpaKotak = '<p>Tidak ada blok verifikasi</p>';
ok((await lengkapiQrCetak(tanpaKotak)) === tanpaKotak, "dokumen tanpa QR dibiarkan utuh");

console.log(`qrDokumen.test: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
