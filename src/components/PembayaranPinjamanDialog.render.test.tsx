/** Run: bun src/components/PembayaranPinjamanDialog.render.test.tsx */
import { renderToStaticMarkup } from "react-dom/server";

import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Dialog } from "@/components/ui/dialog";
import { quoteLoan } from "@/lib/loan";
import { IsiPembayaranPinjaman } from "./PembayaranPinjamanDialog";

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

type PinjamanSaya = NonNullable<FunctionReturnType<typeof api.loans.getMyLoan>>;

const SEKARANG = Date.UTC(2026, 9, 19);
const JATUH_TEMPO = SEKARANG + 86_400_000;
const quote = quoteLoan(1_000_000);
const loan: PinjamanSaya = {
  _id: "loan-uji" as Id<"loans">,
  _creationTime: SEKARANG - 27 * 86_400_000,
  nomorReferensi: "PGD-UJI-TAMPILAN",
  pokokPinjaman: 1_000_000,
  pokokDiajukan: 1_000_000,
  tujuan: "modal_usaha",
  status: "didanai",
  catatanReview: undefined,
  tenorHari: 28,
  tenorBulan: null,
  persenBunga: 30,
  simulasiBulanan: null,
  quote,
  imbalHasilTotal: quote.bunga,
  totalKewajiban: quote.totalKewajibanPelunasan,
  pelunasan: {
    jatuhTempoPada: JATUH_TEMPO,
    sisaHari: 1,
    hariTerlambat: 0,
    dendaTerlambat: 0,
    totalKewajibanDenganPenalti: 1_300_000,
    totalKewajibanPelunasan: 1_300_000,
  },
  sisaPokok: 1_000_000,
  currentTierRate: null,
  nextInterestAmount: null,
  nextDueDate: null,
  pembayaranMenunggu: false,
};

const html = renderToStaticMarkup(
  <Dialog open>
    <IsiPembayaranPinjaman loan={loan} onClose={() => {}} />
  </Dialog>,
);

// ===== Kepala & tiga pilihan =====
ada(html, "Atur pembayaran pinjaman", "judul dialog");
ada(html, "Pelunasan total", "tab pelunasan total");
ada(html, "Bayar bunga saja", "tab bayar bunga saja");
ada(html, "Cicil pokok", "tab cicil pokok");
ada(html, "sisa pokok Rp 1.000.000", "sisa pokok di keterangan");

// ===== Pratinjau live mode bawaan (bunga saja) =====
ada(html, "Total wajib bayar hari ini", "ringkasan total");
ada(html, "Rp 300.000", "bunga periode berjalan");
ada(html, "Rp 350.000", "bunga periode berikut dari tier 35%");
ada(html, "+28 hari", "tenor tersedia untuk pokok Rp1 juta");
ada(html, "tier 35%", "tier baru ditampilkan");
ada(html, "Lanjut kirim bukti pembayaran", "tombol lanjut");
tidakAda(html, "NaN", "tanpa NaN");
tidakAda(html, "undefined", "tanpa undefined");
tidakAda(html, "[object Object]", "tanpa objek mentah");

// ===== Nasabah dengan bukti menunggu tidak bisa menambah bukti =====
const menunggu = renderToStaticMarkup(
  <Dialog open>
    <IsiPembayaranPinjaman
      loan={{ ...loan, pembayaranMenunggu: true }}
      onClose={() => {}}
    />
  </Dialog>,
);
ada(menunggu, "sedang dicocokkan admin", "status menunggu terlihat");
tidakAda(menunggu, "Lanjut kirim bukti pembayaran", "tombol kirim disembunyikan saat menunggu");

if (failed > 0) {
  console.error(`\n${failed} gagal, ${passed} lulus`);
  throw new Error(`${failed} tes render dialog pembayaran gagal`);
}
console.log(`PembayaranPinjamanDialog.render: ${passed} lulus`);
