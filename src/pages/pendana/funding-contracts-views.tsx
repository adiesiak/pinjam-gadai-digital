import { useQuery } from "convex/react";
import { FileText } from "lucide-react";
import { toast } from "sonner";

import { ContractPrintButton } from "@/components/EContract";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import { judulContract, nomorContract } from "@/lib/contract";
import { loanPurposeLabel } from "@/lib/loan";
import { formatRupiah } from "@/lib/money";

import { EmptyState, Loading } from "./feedback";
import { formatDate } from "./shared";

/** Tab 3 — catatan alokasi Pendana. */
export function FundingContractsSection() {
  const contracts = useQuery(api.pendana.myFundingContracts);

  if (contracts === undefined) {
    return <Loading />;
  }
  if (contracts.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="Belum ada catatan alokasi"
        body="Catatan alokasi ledger internal tampil di sini setelah Anda melakukan alokasi pada pinjaman."
      />
    );
  }

  return (
    <ul className="space-y-3">
      {contracts.map((c) => {
        const html = buildFundingContractHtml(c);
        return (
          <li key={c._id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold">{judulContract("pendanaan")}</p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  <span className="font-mono">Kode peminjam tercatat {c.kodePeminjam}</span> ·{" "}
                  <span className="font-mono">{nomorContract("pendanaan", c.nomorReferensi)}</span> ·{" "}
                  {loanPurposeLabel(c.tujuan)} · alokasi ledger {formatRupiah(c.jumlahAlokasi)} · imbal hasil{" "}
                  {formatRupiah(c.imbalHasil)}
                  {c.tenorBulan !== null ? " (skema bulanan)" : " (30%)"}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Referensi pinjaman {c.loanRef} · pokok {formatRupiah(c.pokokPinjaman)} · tenor{" "}
                  {c.tenorBulan !== null ? `${c.tenorBulan} bulan` : `${c.tenorHari} hari`} ·{" "}
                  {formatDate(c.createdAt)}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <ContractPreviewButton html={html} />
                <ContractPrintButton html={html} label="Cetak catatan" />
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Rangkai HTML catatan alokasi internal dari data Pendana sendiri. */
function buildFundingContractHtml(c: {
  nomorReferensi: string;
  loanRef: string;
  kodePeminjam: string;
  tujuan: string;
  jumlahAlokasi: number;
  imbalHasil: number;
  statusPinjaman: string;
  tenorHari: number | null;
  tenorBulan: number | null;
  pokokPinjaman: number;
  createdAt: number;
}): string {
  const tenorLabel =
    c.tenorBulan !== null ? `${c.tenorBulan} bulan` : `${c.tenorHari} hari`;
  const tgl = formatDate(c.createdAt);
  return `
  <div class="contract">
    <h1>${judulContract("pendanaan")}</h1>
    <p class="nomor">Nomor: ${nomorContract("pendanaan", c.nomorReferensi)}</p>

    <p><strong>Catatan penggunaan:</strong> Dokumen ini hanya menampilkan data dan perhitungan ledger internal PINDAI. Bukan penawaran, perjanjian pendanaan, atau instrumen hukum.</p>
    <p>Catatan alokasi internal dibuat pada <strong>${tgl}</strong>. Nama peran, kode peminjam, dan referensi di bawah adalah metadata aplikasi.</p>
    <p><strong>PINJAM GADAI DIGITAL</strong> — nama aplikasi pencatatan internal.</p>
    <p>Pengguna berlabel Pendana · nomor referensi alokasi <strong>${c.nomorReferensi}</strong> · kode peminjam yang dicatat <strong>${c.kodePeminjam}</strong>.</p>

    <h2>Bagian 1 — Parameter Ledger</h2>
    <ol>
      <li>Nilai alokasi yang tercatat pada ledger internal: <strong>${formatRupiah(c.jumlahAlokasi)}</strong> untuk referensi ${c.loanRef} (tujuan yang dicantumkan: ${loanPurposeLabel(c.tujuan)}). Alokasi ini tercatat pada ledger internal PINDAI.</li>
      <li>Pokok dan tenor yang tercatat: ${formatRupiah(c.pokokPinjaman)} · ${tenorLabel}.</li>
      <li>${
        c.tenorBulan !== null
          ? "Perhitungan pokok menggunakan DP 0% dan biaya layanan 3%; tidak ada pembayaran ke Peminjam atau merchant."
          : "Perhitungan nilai bersih menggunakan 95% dari pokok; pencairan ke Peminjam ditangani di luar aplikasi."
      }</li>
    </ol>

    <h2>Bagian 2 — Ilustrasi Imbal Hasil</h2>
    <ol>
      <li>Perhitungan imbal hasil ${
        c.tenorBulan !== null
          ? "menggunakan bunga menurun (tenor 1 bulan 10%/bulan, 3–5 bulan 8%/bulan, ≥ 6 bulan 7,5%/bulan) atas porsi pokok pada ledger"
          : "menggunakan bunga 30% atas porsi pokok pada ledger"
      }: <strong>${formatRupiah(c.imbalHasil)}</strong>.</li>
      <li>Angka tersebut adalah ilustrasi internal; tidak menjamin atau membuktikan adanya pembayaran imbal hasil maupun pengembalian pokok.</li>
      <li>Jumlah pokok + imbal hasil: <strong>${formatRupiah(c.jumlahAlokasi + c.imbalHasil)}</strong>; bukan jumlah yang telah diterima atau dapat ditarik.</li>
    </ol>

    <h2>Bagian 3 — Status Catatan</h2>
    <p>Baris ledger dan status pinjaman mengikuti pencatatan aplikasi internal PINDAI. Status terkait yang tercatat: <strong>${c.statusPinjaman}</strong>.</p>

    <h2>Bagian 4 — Metadata Dokumen</h2>
    <p>HTML ini dihasilkan otomatis dengan timestamp sistem <strong>${new Date(c.createdAt).toLocaleString("id-ID")}</strong>. Timestamp, nama, nomor referensi, dan tampilan dokumen tidak menjadikannya perjanjian yang mengikat atau tanda tangan terverifikasi.</p>
  </div>`;
}

function ContractPreviewButton({ html }: { html: string }) {
  return (
    <Button
      size="sm"
      variant="outline"
      className="rounded-full"
      onClick={() => {
        const w = window.open("", "_blank");
        if (!w) {
          toast.error("Popup diblokir browser — izinkan popup untuk melihat dokumen.");
          return;
        }
        w.document.write(
          `<!doctype html><html lang="id"><head><meta charset="utf-8"/><title>Catatan PINDAI</title></head><body>${html}</body></html>`,
        );
        w.document.close();
      }}
    >
      <FileText className="mr-1.5 size-4" /> Lihat catatan
    </Button>
  );
}
