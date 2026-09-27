import { useQuery } from "convex/react";
import { FileText, Loader2, ScrollText } from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";

import { ContractPrintButton } from "@/components/EContract";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  buildGadaiContract,
  buildPinjamanContract,
  judulContract,
  nomorContract,
} from "@/lib/contract";
import { quoteLoan } from "@/lib/loan";
import { formatRupiah } from "@/lib/money";
import { EmptyState } from "./empty-state";

/** Tab 4 — E-Contract Saya. */
export function MyContractsSection({
  contracts,
}: {
  contracts:
    | {
        pinjaman: Array<{
          _id: Id<"loans">;
          nomorReferensi: string;
          pokokPinjaman: number;
          tenorHari: number;
          status: string;
          tandaTanganAda: boolean;
          tandaTanganPada: number | null;
          createdAt: number;
          nik: string | null;
          namaLengkap: string;
          nomorRekening: string;
          lokasiAjukan: { lat: number; lng: number } | null;
        }>;
        gadai: Array<{
          _id: Id<"pawns">;
          nomorReferensi: string;
          deskripsiBarang: string;
          kategori: string;
          status: string;
          nilaiTaksiran?: number;
          createdAt: number;
        }>;
      }
    | undefined;
}) {
  if (contracts === undefined) {
    return (
      <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" /> Memuat dokumen…
      </div>
    );
  }
  const total = contracts.pinjaman.length + contracts.gadai.length;
  if (total === 0) {
    return (
      <EmptyState
        icon={ScrollText}
        title="Belum ada dokumen perjanjian"
        body="Surat perjanjian dan akad gadai tampil di sini setelah pengajuan Anda disetujui tim."
      />
    );
  }
  return (
    <div className="space-y-6">
      {contracts.pinjaman.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold">Surat Perjanjian Pinjaman</h3>
          <ul className="mt-3 space-y-3">
            {contracts.pinjaman.map((c) => (
              <li key={c._id}>
                <LoanContractCard c={c} />
              </li>
            ))}
          </ul>
        </section>
      )}
      {contracts.gadai.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold">Akad Gadai Digital</h3>
          <ul className="mt-3 space-y-3">
            {contracts.gadai.map((c) => (
              <li
                key={c._id}
                className="card-lift rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{c.deskripsiBarang}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Akad {c.nomorReferensi} · taksiran{" "}
                      {c.nilaiTaksiran !== undefined ? formatRupiah(c.nilaiTaksiran) : "—"}
                    </p>
                  </div>
                  <PawnContractActions pawnId={c._id} pawnRef={c.nomorReferensi} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function LoanContractCard({
  c,
}: {
  c: {
    _id: Id<"loans">;
    nomorReferensi: string;
    pokokPinjaman: number;
    tenorHari: number;
    status: string;
    tandaTanganAda: boolean;
    tandaTanganPada: number | null;
    createdAt: number;
    nik: string | null;
    namaLengkap: string;
    nomorRekening: string;
    lokasiAjukan: { lat: number; lng: number } | null;
  };
}) {
  const q = quoteLoan(c.pokokPinjaman);
  const html = useMemo(
    () =>
      buildPinjamanContract(
        { namaLengkap: c.namaLengkap, nomorRekening: c.nomorRekening, nik: c.nik, email: null },
        q,
        {
          nomorReferensi: c.nomorReferensi,
          lokasi: c.lokasiAjukan,
          timestampPada: c.tandaTanganPada ?? c.createdAt,
        },
        c.tenorHari,
      ),
    [c, q],
  );

  return (
    <div className="card-lift rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">{judulContract("pinjaman")}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            <span className="font-mono">{nomorContract("pinjaman", c.nomorReferensi)}</span> ·
            pokok {formatRupiah(c.pokokPinjaman)} · dana bersih {formatRupiah(q.danaBersihDitransfer)}{" "}
            (95%) · total pelunasan {formatRupiah(q.totalKewajibanPelunasan)} (130%)
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {c.lokasiAjukan
              ? `GPS ${c.lokasiAjukan.lat.toFixed(4)}, ${c.lokasiAjukan.lng.toFixed(4)}`
              : "GPS —"}{" "}
            · {c.tandaTanganAda ? "ditandatangani elektronik" : "menunggu tanda tangan"}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <ContractPrintButton html={html} label="Unduh PDF" />
          <ContractPreviewButton html={html} />
        </div>
      </div>
    </div>
  );
}

/** Preview kontrak di tab baru (HTML) — tanpa renderer PDF eksternal. */
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
      <FileText className="mr-1.5 size-4" /> Lihat
    </Button>
  );
}

function PawnContractActions({ pawnId, pawnRef }: { pawnId: Id<"pawns">; pawnRef: string }) {
  const detail = useQuery(api.loans.getMyPawn, { pawnId });
  if (detail === undefined) {
    return <Loader2 className="size-4 animate-spin text-muted-foreground" />;
  }
  if (detail === null || detail.nilaiTaksiran === undefined) {
    return <span className="text-xs text-muted-foreground">Menunggu taksiran resmi</span>;
  }
  const html = buildGadaiContractMilikSendiri(detail);
  return (
    <div className="flex shrink-0 gap-2">
      <ContractPrintButton html={html} label="Unduh Akad" />
      <ContractPreviewButton html={html} />
      <span className="sr-only">{pawnRef}</span>
    </div>
  );
}

/** Rangkai akad gadai dari data milik peminjam sendiri. */
function buildGadaiContractMilikSendiri(detail: {
  nomorReferensi: string;
  namaLengkap: string;
  nomorRekening: string;
  deskripsiBarang: string;
  kategori: string;
  nilaiTaksiran?: number;
  hargaPasar?: number;
  kondisiFisik?: string;
  kodeRakVault?: string;
  _creationTime: number;
}): string {
  return buildGadaiContract(
    {
      namaLengkap: detail.namaLengkap,
      nomorRekening: detail.nomorRekening,
      nik: null,
      email: null,
    },
    {
      deskripsiBarang: detail.deskripsiBarang,
      kategori: detail.kategori,
      nilaiTaksiran: detail.nilaiTaksiran ?? 0,
      hargaPasar: detail.hargaPasar ?? 0,
      ltvPersen: 70,
      kodeRakVault: detail.kodeRakVault ?? "—",
      kondisiFisik: detail.kondisiFisik ?? "dinilai petugas",
    },
    {
      nomorReferensi: detail.nomorReferensi,
      lokasi: null,
      timestampPada: detail._creationTime,
    },
  );
}
