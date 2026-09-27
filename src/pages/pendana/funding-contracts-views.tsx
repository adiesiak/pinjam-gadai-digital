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

/** Tab 3 — E-Contract Pendanaan. */
export function FundingContractsSection() {
  const contracts = useQuery(api.pendana.myFundingContracts);

  if (contracts === undefined) {
    return <Loading />;
  }
  if (contracts.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="Belum ada perjanjian pendanaan"
        body="Perjanjian pendanaan digital tampil di sini setelah alokasi Anda tercatat pada pinjaman yang disetujui."
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
                  <span className="font-mono">{nomorContract("pendanaan", c.nomorReferensi)}</span> ·{" "}
                  {loanPurposeLabel(c.tujuan)} · alokasi {formatRupiah(c.jumlahAlokasi)} · hak bunga{" "}
                  {formatRupiah(c.imbalHasil)} (30%)
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Pinjaman {c.loanRef} · pokok {formatRupiah(c.pokokPinjaman)} · tenor {c.tenorHari} hari ·{" "}
                  {formatDate(c.createdAt)}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <ContractPreviewButton html={html} />
                <ContractPrintButton html={html} label="Unduh PDF" />
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Rangkai HTML perjanjian pendanaan dari data milik Pendana sendiri. */
function buildFundingContractHtml(c: {
  nomorReferensi: string;
  loanRef: string;
  tujuan: string;
  jumlahAlokasi: number;
  imbalHasil: number;
  statusPinjaman: string;
  tenorHari: number;
  pokokPinjaman: number;
  createdAt: number;
}): string {
  const tgl = formatDate(c.createdAt);
  return `
  <div class="contract">
    <h1>${judulContract("pendanaan")}</h1>
    <p class="nomor">Nomor: ${nomorContract("pendanaan", c.nomorReferensi)}</p>

    <p>Perjanjian penyediaan dana ini dibuat pada tanggal <strong>${tgl}</strong> antara:</p>
    <p><strong>PINJAM GADAI DIGITAL ("Platform")</strong> — penyelenggara layanan pinjam-gadai digital;</p>
    <p>dan</p>
    <p><strong>PENDANA</strong> pemegang nomor alokasi <strong>${c.nomorReferensi}</strong> ("Pendana").</p>

    <h2>Pasal 1 — Objek Pendanaan</h2>
    <ol>
      <li>Pendana menyediakan dana sebesar <strong>${formatRupiah(c.jumlahAlokasi)}</strong> untuk pinjaman ${c.loanRef} (tujuan: ${loanPurposeLabel(c.tujuan)}).</li>
      <li>Pokok pinjaman: ${formatRupiah(c.pokokPinjaman)} · tenor ${c.tenorHari} hari.</li>
      <li>Dana bersih (95% dari pokok) dicairkan ke Peminjam setelah pendanaan penuh.</li>
    </ol>

    <h2>Pasal 2 — Hak Imbal Hasil</h2>
    <ol>
      <li>Pendana menerima hak Imbal Hasil (Bunga) sebesar 30% dari porsi pokok yang didanai: <strong>${formatRupiah(c.imbalHasil)}</strong>.</li>
      <li>Imbal hasil dibayarkan penuh saat Peminjam melunasi total kewajiban 130% dari pokok.</li>
      <li>Total penerimaan Pendana saat pelunasan: <strong>${formatRupiah(c.jumlahAlokasi + c.imbalHasil)}</strong>.</li>
    </ol>

    <h2>Pasal 3 — Pencatatan</h2>
    <p>Setiap pergerakan dana dicatat berpasangan pada jurnal append-only Platform dan dapat diaudit kapan saja. Status perjanjian ini mengikuti status pinjaman: <strong>${c.statusPinjaman}</strong>.</p>

    <h2>Pasal 4 — Keabsahan Digital</h2>
    <p>Perjanjian ini dihasilkan otomatis oleh sistem dengan timestamp <strong>${new Date(c.createdAt).toLocaleString("id-ID")}</strong> dan dianggap sah oleh kedua belah pihak.</p>

    <div class="ttd">
      <div>
        <p class="garis">Pendana ${c.nomorReferensi}</p>
        <p>Pendana</p>
      </div>
      <div>
        <p class="garis">Pinjam Gadai Digital</p>
        <p>Platform</p>
      </div>
    </div>
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
          `<!doctype html><html lang="id"><head><meta charset="utf-8"/><title>Dokumen PINDAI</title></head><body>${html}</body></html>`,
        );
        w.document.close();
      }}
    >
      <FileText className="mr-1.5 size-4" /> Lihat E-Contract
    </Button>
  );
}
