import { useQuery } from "convex/react";
import { FileText, Loader2, ScrollText } from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";

import { ContractPrintButton } from "@/components/EContract";
import { wrapContractHtml } from "@/components/contract/contract-doc";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  buildGadaiContract,
  buildPinjamanContract,
  judulContract,
  nomorContract,
} from "@/lib/contract";
import { hitungSimulasiBulanan } from "@/lib/bulanan";
import { quoteLoan } from "@/lib/loan";
import { formatRupiah } from "@/lib/money";
import { EmptyState } from "./empty-state";

/** Tab 4 — catatan simulasi dan lampiran aplikasi. */
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
          tenorBulan: number | null;
          status: string;
          tandaTanganAda: boolean;
          tandaTanganDataUrl: string | null;
          tandaTanganPada: number | null;
          persetujuanSyaratPada: number | null;
          persetujuanSyaratVersi: string | null;
          createdAt: number;
          nik: string | null;
          namaLengkap: string;
          namaBank: string | null;
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
        <Loader2 className="mr-2 size-4 animate-spin" /> Memuat catatan…
      </div>
    );
  }
  const total = contracts.pinjaman.length + contracts.gadai.length;
  if (total === 0) {
    return (
      <EmptyState
        icon={ScrollText}
        title="Belum ada catatan simulasi"
        body="Ringkasan data dan hitungan internal akan tampil di sini jika tersedia. Catatan ini bukan kontrak, bukti transaksi, atau tanda tangan terverifikasi."
      />
    );
  }
  return (
    <div className="space-y-6">
      {contracts.pinjaman.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold">Catatan simulasi pinjaman</h3>
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
          <h3 className="text-sm font-semibold">Catatan simulasi gadai</h3>
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
                      Catatan {c.nomorReferensi} · taksiran pada ledger{" "}
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
    /** Diisi (1/3/6 bln) bila pinjaman memakai skema bulanan. */
    tenorBulan: number | null;
    status: string;
    tandaTanganAda: boolean;
    tandaTanganDataUrl: string | null;
    tandaTanganPada: number | null;
    persetujuanSyaratPada: number | null;
    persetujuanSyaratVersi: string | null;
    createdAt: number;
    nik: string | null;
    namaLengkap: string;
    namaBank: string | null;
    nomorRekening: string;
    lokasiAjukan: { lat: number; lng: number } | null;
  };
}) {
  const q = quoteLoan(c.pokokPinjaman);
  // Simulasi bulanan: data warisan di luar rentang skema dilewati dengan aman.
  const bulanan = useMemo(() => {
    if (c.tenorBulan === null) return null;
    try {
      return hitungSimulasiBulanan(c.pokokPinjaman, c.tenorBulan);
    } catch {
      return null;
    }
  }, [c.pokokPinjaman, c.tenorBulan]);
  const html = useMemo(
    () =>
      buildPinjamanContract(
        { namaLengkap: c.namaLengkap, namaBank: c.namaBank, nomorRekening: c.nomorRekening, nik: c.nik, email: null },
        q,
        {
          nomorReferensi: c.nomorReferensi,
          lokasi: c.lokasiAjukan,
          timestampPada: c.tandaTanganPada ?? c.createdAt,
          ...(c.tandaTanganDataUrl
            ? {
                tandaTanganPeminjam: {
                  dataUrl: c.tandaTanganDataUrl,
                  tandaTanganPada: c.tandaTanganPada,
                  persetujuanSyaratPada: c.persetujuanSyaratPada,
                  persetujuanSyaratVersi: c.persetujuanSyaratVersi,
                },
              }
            : {}),
        },
        c.tenorHari,
        bulanan,
      ),
    [c, q, bulanan],
  );

  return (
    <div className="card-lift rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">{judulContract("pinjaman")}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            <span className="font-mono">{nomorContract("pinjaman", c.nomorReferensi)}</span> ·
            pokok acuan simulasi {formatRupiah(c.pokokPinjaman)} ·{" "}
            {bulanan !== null ? (
              <>
                simulasi tenor {bulanan.tenorBulan} bulan · cicilan simulasi{" "}
                {formatRupiah(bulanan.cicilanPerBulan)}/bulan · total simulasi{" "}
                {formatRupiah(bulanan.totalPengembalian)}
              </>
            ) : (
              <>
                nilai bersih simulasi {formatRupiah(q.danaBersihDitransfer)} (tidak ditransfer) · total kewajiban simulasi{" "}
                {formatRupiah(q.totalKewajibanPelunasan)} (tidak ditagihkan)
              </>
            )}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {c.lokasiAjukan
              ? `Koordinat perangkat yang dikirim ${c.lokasiAjukan.lat.toFixed(4)}, ${c.lokasiAjukan.lng.toFixed(4)} (tidak diverifikasi)`
              : "Koordinat perangkat —"}{" "}
            · {c.tandaTanganAda ? "gambar tanda tangan tercatat (tidak terverifikasi)" : "belum ada gambar yang tercatat"}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <ContractPrintButton html={html} label="Cetak catatan" />
          <ContractPreviewButton html={html} />
        </div>
      </div>
    </div>
  );
}

/** Buka pratinjau catatan HTML di tab baru — tanpa renderer PDF eksternal. */
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
        w.document.write(wrapContractHtml(html));
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
    return <span className="text-xs text-muted-foreground">Menunggu catatan taksiran</span>;
  }
  const html = buildGadaiContractMilikSendiri(detail);
  return (
    <div className="flex shrink-0 gap-2">
      <ContractPrintButton html={html} label="Cetak catatan" />
      <ContractPreviewButton html={html} />
      <span className="sr-only">{pawnRef}</span>
    </div>
  );
}

/** Rangkai catatan simulasi gadai dari data yang tersimpan untuk peminjam. */
function buildGadaiContractMilikSendiri(detail: {
  nomorReferensi: string;
  tandaTanganPeminjam?: string;
  tandaTanganPada?: number;
  persetujuanSyaratPada?: number;
  persetujuanSyaratVersi?: string;
  namaLengkap: string;
  namaBank?: string | null;
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
      namaBank: detail.namaBank ?? null,
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
      timestampPada: detail.tandaTanganPada ?? detail._creationTime,
      ...(detail.tandaTanganPeminjam
        ? {
            tandaTanganPeminjam: {
              dataUrl: detail.tandaTanganPeminjam,
              tandaTanganPada: detail.tandaTanganPada,
              persetujuanSyaratPada: detail.persetujuanSyaratPada,
              persetujuanSyaratVersi: detail.persetujuanSyaratVersi,
            },
          }
        : {}),
    },
  );
}
