import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { FileDown, PenLine, ScrollText, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";

import { ContractSigningDialog } from "@/components/contract/ContractSigningDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MemuatBaris } from "@/components/ui/loading";
import { api } from "@/convex/_generated/api";
import { useQrDataUrl } from "@/hooks/use-qr";
import {
  buildGadaiContract,
  buildPinjamanContract,
  judulContract,
  nomorContract,
} from "@/lib/contract";
import {
  labelStatusKontrak,
  namaBerkasKontrak,
  statusKontrak,
} from "@/lib/kontrakStatus";
import { urlVerifikasi } from "@/lib/kontrakDigital";
import { quotePinjaman, simulasiBulananPinjaman } from "@/lib/loan";
import { formatRupiah } from "@/lib/money";
import { EmptyState } from "./empty-state";

type Contracts = FunctionReturnType<typeof api.loans.myContracts>;
type Pinjaman = Contracts["pinjaman"][number];
type Gadai = Contracts["gadai"][number];

function kelasLencana(nada: "selesai" | "info" | "peringatan" | "netral"): string {
  if (nada === "selesai") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (nada === "info") return "border-sky-200 bg-sky-50 text-sky-800";
  if (nada === "peringatan") return "border-amber-200 bg-amber-50 text-amber-800";
  return "text-muted-foreground";
}

/**
 * Perjanjian milik peminjam, lengkap dengan dua jalur persetujuan.
 *
 * Jalur manual hanya mencatat persetujuan; gambar KYC lama tidak dipakai sebagai
 * tanda tangan akad. Setelah admin menerima berkas basah, status berubah menjadi
 * “TTD manual diterima” dan unduhan tetap tersedia.
 */
export function MyContractsSection() {
  const contracts = useQuery(api.loans.myContracts);
  if (contracts === undefined) {
    return <MemuatBaris teks="Memuat perjanjian…" className="justify-center py-10" />;
  }
  const total = contracts.pinjaman.length + contracts.gadai.length;
  if (total === 0) {
    return (
      <EmptyState
        icon={ScrollText}
        title="Belum ada perjanjian"
        body="Perjanjian pinjaman dan gadai yang sudah disetujui internal tampil di sini bersama status tanda tangannya."
      />
    );
  }
  return (
    <div className="space-y-6">
      {contracts.pinjaman.length > 0 && (
        <section aria-labelledby="perjanjian-pinjaman">
          <h3 id="perjanjian-pinjaman" className="text-sm font-semibold">
            Perjanjian pinjaman
          </h3>
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
        <section aria-labelledby="perjanjian-gadai">
          <h3 id="perjanjian-gadai" className="text-sm font-semibold">
            Perjanjian gadai
          </h3>
          <ul className="mt-3 space-y-3">
            {contracts.gadai.map((c) => (
              <li key={c._id}>
                <PawnContractCard c={c} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function LoanContractCard({ c }: { c: Pinjaman }) {
  const [open, setOpen] = useState(false);
  const [alur, setAlur] = useState<"elektronik" | "manual">("elektronik");
  const simpan = useMutation(api.loans.setujuiPerjanjianPinjaman);
  const ketentuan = useQuery(api.system.getKetentuanBiaya);
  const digital = useQuery(api.kontrakDigital.infoPinjaman, { loanId: c._id });
  const qr = useQrDataUrl(digital ? urlVerifikasi(digital.kode) : null);

  const q = quotePinjaman({
    pokokPinjaman: c.pokokPinjaman,
    persenBunga: c.persenBunga ?? undefined,
    cairEkspres: c.cairEkspres ?? undefined,
    tarifBiaya: c.tarifBiaya ?? undefined,
  });
  const bulanan = useMemo(() => {
    if (c.tenorBulan === null) return null;
    try {
      return simulasiBulananPinjaman({
        pokokPinjaman: c.pokokPinjaman,
        tenorBulan: c.tenorBulan,
        persenBunga: c.persenBunga ?? undefined,
      });
    } catch {
      return null;
    }
  }, [c.pokokPinjaman, c.tenorBulan, c.persenBunga]);

  const html = useMemo(
    () =>
      buildPinjamanContract(
        {
          namaLengkap: c.namaLengkap,
          namaBank: c.namaBank,
          nomorRekening: c.nomorRekening,
          nik: c.nik,
          email: null,
        },
        q,
        {
          nomorReferensi: c.nomorReferensi,
          lokasi: c.lokasiAjukan,
          timestampPada: c.tandaTanganPada ?? c.createdAt,
          ...(c.persetujuanMode !== "manual" && c.tandaTanganDataUrl
            ? {
                tandaTanganPeminjam: {
                  dataUrl: c.tandaTanganDataUrl,
                  tandaTanganPada: c.tandaTanganPada,
                  persetujuanSyaratPada: c.persetujuanSyaratPada,
                  persetujuanSyaratVersi: c.persetujuanSyaratVersi,
                },
              }
            : {}),
          persetujuanSyarat: {
            pada: c.persetujuanSyaratPada,
            versi: c.persetujuanSyaratVersi,
          },
          ...(digital
            ? {
                verifikasi: {
                  kode: digital.kode,
                  hash: digital.hash,
                  diterbitkanPada: digital.diterbitkanPada,
                  url: urlVerifikasi(digital.kode),
                  qrDataUrl: qr,
                },
              }
            : {}),
        },
        c.tenorHari,
        bulanan,
        ketentuan?.persenDendaKeterlambatan,
      ),
    [c, q, bulanan, ketentuan?.persenDendaKeterlambatan, digital, qr],
  );

  const status = statusKontrak({
    persetujuanPada: c.persetujuanSyaratPada,
    persetujuanVersi: c.persetujuanSyaratVersi,
    persetujuanMode: c.persetujuanMode,
    ttdDataUrl: c.tandaTanganDataUrl,
    ttdPada: c.tandaTanganPada,
    ttdManualPada: c.ttdManualPada,
  });
  const label = labelStatusKontrak(status);
  const sudah = status !== "belum" && status !== "versi_lama";
  const dibatalkan = c.status === "dibatalkan";

  const buka = (jalur: "elektronik" | "manual") => {
    setAlur(jalur);
    setOpen(true);
  };

  return (
    <article className="card-lift rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold">{judulContract("pinjaman")}</p>
            <Badge variant="outline" className={kelasLencana(label.nada)}>
              {label.label}
            </Badge>
          </div>
          <p className="mt-1 break-words text-xs text-muted-foreground">
            <span className="font-mono">{nomorContract("pinjaman", c.nomorReferensi)}</span> · pokok{" "}
            {formatRupiah(c.pokokPinjaman)}
          </p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {status === "manual"
              ? "Persetujuan tercatat. Unduh perjanjian, tanda tangani basah, lalu admin mengunggah buktinya."
              : status === "manual_diterima"
                ? `Bukti TTD manual diterima${c.ttdManualPada === null ? "" : ` ${new Date(c.ttdManualPada).toLocaleString("id-ID")}`}${c.ttdManualOleh === null ? "" : ` oleh ${c.ttdManualOleh}`}.`
                : status === "elektronik"
                  ? "Perjanjian sudah ditandatangani secara elektronik dan tersimpan di ledger internal."
                  : "Setujui syarat, lalu pilih tanda tangan elektronik atau TTD manual."}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {sudah ? (
            status === "manual" ? (
              <>
                <Button
                  size="sm"
                  className="min-h-11 rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
                  onClick={() => buka("elektronik")}
                >
                  <PenLine className="mr-1.5 size-4" aria-hidden="true" />
                  Tanda tangan elektronik
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="min-h-11 rounded-full"
                  onClick={() => buka("manual")}
                >
                  <FileDown className="mr-1.5 size-4" aria-hidden="true" />
                  Unduh untuk TTD manual
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="min-h-11 rounded-full"
                onClick={() => buka(status === "manual_diterima" ? "manual" : "elektronik")}
              >
                <ShieldCheck className="mr-1.5 size-4" aria-hidden="true" />
                Lihat perjanjian
              </Button>
            )
          ) : (
            <>
              <Button
                size="sm"
                className="min-h-11 rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
                disabled={dibatalkan}
                onClick={() => buka("elektronik")}
              >
                <PenLine className="mr-1.5 size-4" aria-hidden="true" />
                Tanda tangan elektronik
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="min-h-11 rounded-full"
                disabled={dibatalkan}
                onClick={() => buka("manual")}
              >
                <FileDown className="mr-1.5 size-4" aria-hidden="true" />
                Setujui & TTD manual
              </Button>
            </>
          )}
        </div>
      </div>

      <ContractSigningDialog
        open={open}
        onOpenChange={setOpen}
        title={judulContract("pinjaman")}
        reference={nomorContract("pinjaman", c.nomorReferensi)}
        borrowerName={c.namaLengkap}
        html={html}
        signature={c.tandaTanganDataUrl}
        signedAt={c.tandaTanganPada}
        consentAt={c.persetujuanSyaratPada}
        consentVersion={c.persetujuanSyaratVersi}
        consentMode={c.persetujuanMode}
        manualAt={c.ttdManualPada}
        fileName={namaBerkasKontrak("pinjaman", c.nomorReferensi)}
        mode="peminjam"
        alurAwal={alur}
        signingDisabledReason={
          dibatalkan ? "Pengajuan dibatalkan. Perjanjian ini tidak dapat disetujui." : null
        }
        onSign={async ({ dataUrl, mode }) => {
          await simpan({
            loanId: c._id,
            mode,
            ...(dataUrl !== null ? { dataUrl } : {}),
          });
        }}
      />
    </article>
  );
}

function PawnContractCard({ c }: { c: Gadai }) {
  const [open, setOpen] = useState(false);
  const [alur, setAlur] = useState<"elektronik" | "manual">("elektronik");
  const simpan = useMutation(api.loans.setujuiPerjanjianGadai);
  const digital = useQuery(api.kontrakDigital.infoGadai, { pawnId: c._id });
  const qr = useQrDataUrl(digital ? urlVerifikasi(digital.kode) : null);

  const html = useMemo(
    () =>
      buildGadaiContract(
        {
          namaLengkap: c.namaLengkap,
          namaBank: c.namaBank,
          nomorRekening: c.nomorRekening,
          nik: null,
          email: null,
        },
        {
          deskripsiBarang: c.deskripsiBarang,
          kategori: c.kategori,
          nilaiTaksiran: c.nilaiTaksiran ?? 0,
          hargaPasar: c.hargaPasar ?? 0,
          ltvPersen: 70,
          kodeRakVault: c.kodeRakVault ?? "—",
          kondisiFisik: c.kondisiFisik ?? "dinilai petugas",
        },
        {
          nomorReferensi: c.nomorReferensi,
          lokasi: null,
          timestampPada: c.tandaTanganPada ?? c.createdAt,
          ...(c.persetujuanMode !== "manual" && c.tandaTanganDataUrl
            ? {
                tandaTanganPeminjam: {
                  dataUrl: c.tandaTanganDataUrl,
                  tandaTanganPada: c.tandaTanganPada,
                  persetujuanSyaratPada: c.persetujuanSyaratPada,
                  persetujuanSyaratVersi: c.persetujuanSyaratVersi,
                },
              }
            : {}),
          persetujuanSyarat: {
            pada: c.persetujuanSyaratPada,
            versi: c.persetujuanSyaratVersi,
          },
          ...(digital
            ? {
                verifikasi: {
                  kode: digital.kode,
                  hash: digital.hash,
                  diterbitkanPada: digital.diterbitkanPada,
                  url: urlVerifikasi(digital.kode),
                  qrDataUrl: qr,
                },
              }
            : {}),
        },
      ),
    [c, digital, qr],
  );

  const status = statusKontrak({
    persetujuanPada: c.persetujuanSyaratPada,
    persetujuanVersi: c.persetujuanSyaratVersi,
    persetujuanMode: c.persetujuanMode,
    ttdDataUrl: c.tandaTanganDataUrl,
    ttdPada: c.tandaTanganPada,
    ttdManualPada: c.ttdManualPada,
  });
  const label = labelStatusKontrak(status);
  const sudah = status !== "belum" && status !== "versi_lama";

  const buka = (jalur: "elektronik" | "manual") => {
    setAlur(jalur);
    setOpen(true);
  };

  return (
    <article className="card-lift rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold">{c.deskripsiBarang}</p>
            <Badge variant="outline" className={kelasLencana(label.nada)}>
              {label.label}
            </Badge>
          </div>
          <p className="mt-1 break-words text-xs text-muted-foreground">
            <span className="font-mono">{nomorContract("gadai", c.nomorReferensi)}</span> · taksiran{" "}
            {formatRupiah(c.nilaiTaksiran ?? 0)}
            {c.pokokGadai !== null ? ` · pokok ${formatRupiah(c.pokokGadai)}` : ""}
          </p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {status === "manual"
              ? "Persetujuan tercatat. Unduh akad, tanda tangani basah, lalu admin mengunggah buktinya."
              : status === "manual_diterima"
                ? `Bukti TTD manual diterima${c.ttdManualPada === null ? "" : ` ${new Date(c.ttdManualPada).toLocaleString("id-ID")}`}${c.ttdManualOleh === null ? "" : ` oleh ${c.ttdManualOleh}`}.`
                : status === "elektronik"
                  ? "Akad sudah ditandatangani secara elektronik dan tersimpan di ledger internal."
                  : "Setujui syarat, lalu pilih tanda tangan elektronik atau TTD manual."}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {sudah ? (
            status === "manual" ? (
              <>
                <Button
                  size="sm"
                  className="min-h-11 rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
                  onClick={() => buka("elektronik")}
                >
                  <PenLine className="mr-1.5 size-4" aria-hidden="true" />
                  Tanda tangan elektronik
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="min-h-11 rounded-full"
                  onClick={() => buka("manual")}
                >
                  <FileDown className="mr-1.5 size-4" aria-hidden="true" />
                  Unduh untuk TTD manual
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="min-h-11 rounded-full"
                onClick={() => buka(status === "manual_diterima" ? "manual" : "elektronik")}
              >
                <ShieldCheck className="mr-1.5 size-4" aria-hidden="true" />
                Lihat akad
              </Button>
            )
          ) : (
            <>
              <Button
                size="sm"
                className="min-h-11 rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={() => buka("elektronik")}
              >
                <PenLine className="mr-1.5 size-4" aria-hidden="true" />
                Tanda tangan elektronik
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="min-h-11 rounded-full"
                onClick={() => buka("manual")}
              >
                <FileDown className="mr-1.5 size-4" aria-hidden="true" />
                Setujui & TTD manual
              </Button>
            </>
          )}
        </div>
      </div>

      <ContractSigningDialog
        open={open}
        onOpenChange={setOpen}
        title={judulContract("gadai")}
        reference={nomorContract("gadai", c.nomorReferensi)}
        borrowerName={c.namaLengkap}
        html={html}
        signature={c.tandaTanganDataUrl}
        signedAt={c.tandaTanganPada}
        consentAt={c.persetujuanSyaratPada}
        consentVersion={c.persetujuanSyaratVersi}
        consentMode={c.persetujuanMode}
        manualAt={c.ttdManualPada}
        fileName={namaBerkasKontrak("gadai", c.nomorReferensi)}
        mode="peminjam"
        alurAwal={alur}
        onSign={async ({ dataUrl, mode }) => {
          await simpan({
            pawnId: c._id,
            mode,
            ...(dataUrl !== null ? { dataUrl } : {}),
          });
        }}
      />
    </article>
  );
}
