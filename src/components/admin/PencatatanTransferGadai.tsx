import { useMutation, useQuery } from "convex/react";
import {
  Ban,
  CheckCircle2,
  Coins,
  Info,
  Loader2,
  RotateCcw,
  TriangleAlert,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { EmptyQueue, MetrikKartu } from "@/components/admin/admin-shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { formatRupiah } from "@/lib/money";

type Metode = "transfer_bank" | "e_wallet" | "tunai";
type StatusTransfer = "belum_dicatat" | "dicatat" | "dibatalkan";

type BarisTransferGadai = {
  paymentId: Id<"pawnPayments">;
  pawnId: Id<"pawns">;
  nomorReferensi: string;
  namaPeminjam: string;
  pendanaNama: string;
  jumlah: number;
  pokokDicicil: number;
  sewaDibayar: number;
  waktuPembayaran: number;
  referensiPembayaran: string | null;
  transfer: {
    id: Id<"gadaiTransfers"> | null;
    status: StatusTransfer;
    jumlah: number;
    metode: Metode | null;
    referensi: string | null;
    catatan: string | null;
    dicatatOlehLabel: string | null;
    dicatatPada: number | null;
    alasanBatal: string | null;
    dibatalkanPada: number | null;
  };
};

const META_STATUS: Record<
  StatusTransfer,
  { label: string; className: string }
> = {
  belum_dicatat: {
    label: "Belum Dicatat",
    className: "border-0 bg-amber-100 text-amber-900 hover:bg-amber-100",
  },
  dicatat: {
    label: "Sudah Dicatat",
    className: "border-success-border bg-success-soft text-success-foreground hover:bg-success-soft",
  },
  dibatalkan: {
    label: "Dibatalkan",
    className: "border-0 bg-slate-200 text-slate-700 hover:bg-slate-200",
  },
};

const LABEL_METODE: Record<Metode, string> = {
  transfer_bank: "Transfer bank",
  e_wallet: "E-wallet",
  tunai: "Tunai",
};

function tanggalRingkas(ms: number | null): string {
  if (ms === null) return "belum";
  return new Date(ms).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Pencatatan transfer hak pendana gadai.
 *
 * Satu baris berasal dari satu pembayaran gadai yang porsi pendananya lebih dari
 * nol. Nominal tidak diketik admin: server memakai snapshot porsi pada
 * pembayaran itu. Catatan yang salah dibatalkan dengan alasan, bukan diubah.
 */
export function PencatatanTransferGadai() {
  // Jendela baca: 100 pembayaran gadai terbaru, bisa ditambah sampai 500.
  // Server tidak lagi memindai seluruh riwayat untuk panel ini.
  const [batas, setBatas] = useState(100);
  const data = useQuery(api.gadai.daftarTransferGadai, { batas });
  const catat = useMutation(api.gadai.catatTransferGadai);
  const batalkan = useMutation(api.gadai.batalkanTransferGadai);

  const [targetCatat, setTargetCatat] = useState<BarisTransferGadai | null>(
    null,
  );
  const [targetBatal, setTargetBatal] = useState<BarisTransferGadai | null>(
    null,
  );
  const [metode, setMetode] = useState<Metode>("transfer_bank");
  const [referensi, setReferensi] = useState("");
  const [catatan, setCatatan] = useState("");
  const [alasan, setAlasan] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const bukaCatat = (row: BarisTransferGadai) => {
    setMetode("transfer_bank");
    setReferensi("");
    setCatatan("");
    setTargetCatat(row);
  };

  const bukaBatal = (row: BarisTransferGadai) => {
    setAlasan("");
    setTargetBatal(row);
  };

  const simpanCatat = async (event: React.FormEvent) => {
    event.preventDefault();
    if (targetCatat === null) return;
    setBusy("catat");
    try {
      const hasil = await catat({
        paymentId: targetCatat.paymentId,
        metode,
        referensi: referensi.trim() === "" ? undefined : referensi.trim(),
        catatan: catatan.trim() === "" ? undefined : catatan.trim(),
      });
      toast.success(
        `Transfer ${targetCatat.pendanaNama} dicatat: ${formatRupiah(hasil.jumlah)}.`,
      );
      setTargetCatat(null);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Gagal mencatat transfer gadai.",
      );
    } finally {
      setBusy(null);
    }
  };

  const simpanBatal = async (event: React.FormEvent) => {
    event.preventDefault();
    if (targetBatal === null || targetBatal.transfer.id === null) return;
    if (alasan.trim().length < 3) {
      toast.error("Isi alasan pembatalan (minimal 3 karakter).");
      return;
    }
    setBusy("batal");
    try {
      await batalkan({
        transferId: targetBatal.transfer.id,
        alasan: alasan.trim(),
      });
      toast.success(
        "Catatan transfer dibatalkan. Riwayatnya tetap tersimpan di audit.",
      );
      setTargetBatal(null);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Gagal membatalkan catatan.",
      );
    } finally {
      setBusy(null);
    }
  };

  if (data === undefined) {
    return (
      <p className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-10 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Memuat transfer hak pendana
        gadai...
      </p>
    );
  }

  const { rows, ringkasan, pembayaranDibaca, adaLebihBanyak } = data;
  const adaBelum = ringkasan.jumlahBelumDicatat > 0;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary/5 text-primary">
            <Coins className="size-4" />
          </span>
          <div>
            <h3 className="flex items-center gap-1.5 font-bold text-slate-900">
              Transfer Hak Pendana Gadai
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label="Penjelasan transfer hak pendana gadai"
                    className="text-muted-foreground transition-colors hover:text-slate-700"
                  >
                    <Info className="size-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  PINDAI tidak memindahkan uang. Nominal diambil dari porsi
                  pendana yang tersimpan pada setiap pembayaran gadai. Catat
                  hanya setelah uang benar-benar dikirim. Catatan yang salah
                  dibatalkan dengan alasan, bukan diubah.
                </TooltipContent>
              </Tooltip>
            </h3>
            <p className="text-xs text-muted-foreground">
              Satu baris untuk satu pembayaran gadai berpendana.
            </p>
          </div>
        </div>
        {adaBelum ? (
          <Badge className="border-0 bg-amber-100 text-amber-900 hover:bg-amber-100">
            <TriangleAlert className="mr-1 size-3" />{" "}
            {ringkasan.jumlahBelumDicatat} belum dicatat
          </Badge>
        ) : (
          <Badge className="border-success-border bg-success-soft text-success-foreground hover:bg-success-soft">
            <CheckCircle2 className="mr-1 size-3" /> semua tercatat
          </Badge>
        )}
      </header>

      {adaBelum && (
        <p className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-900">
          <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
          {ringkasan.jumlahBelumDicatat} transfer belum dicatat (
          {formatRupiah(ringkasan.nilaiBelumDicatat)})
        </p>
      )}

      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetrikKartu
          label="Belum Dicatat"
          nilai={
            <span className="text-lg font-bold text-amber-700">
              {ringkasan.jumlahBelumDicatat}
            </span>
          }
        />
        <MetrikKartu
          label="Nilai Belum Dicatat"
          nilai={
            <span className="font-bold text-amber-700">
              {formatRupiah(ringkasan.nilaiBelumDicatat)}
            </span>
          }
        />
        <MetrikKartu
          label="Sudah Dicatat"
          nilai={
            <span className="text-lg font-bold text-emerald-800">
              {ringkasan.jumlahTercatat}
            </span>
          }
        />
        <MetrikKartu
          label="Nilai Sudah Dicatat"
          nilai={
            <span className="font-bold text-emerald-800">
              {formatRupiah(ringkasan.nilaiTercatat)}
            </span>
          }
        />
      </dl>

      {rows.length === 0 ? (
        <div className="mt-3">
          <EmptyQueue
            icon={Coins}
            title="Belum ada pembayaran gadai berpendana"
            deskripsi="Kewajiban transfer muncul di sini setelah admin mencatat pembayaran gadai yang punya porsi pendana lebih dari nol."
            poin={[
              "Nominal diambil dari snapshot 47/60 pada pembayaran, bukan diketik ulang.",
              "Satu pembayaran hanya boleh punya satu transfer aktif.",
            ]}
          />
        </div>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {rows.map((row) => {
            const meta = META_STATUS[row.transfer.status];
            const tercatat = row.transfer.status === "dicatat";
            return (
              <li
                key={row.paymentId}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-navy">
                      {row.pendanaNama}
                    </p>
                    <p className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">
                      {row.nomorReferensi} · dibayar{" "}
                      {tanggalRingkas(row.waktuPembayaran)}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="text-sm font-bold tabular-nums text-emerald-800">
                      {formatRupiah(row.jumlah)}
                    </span>
                    <Badge className={meta.className}>{meta.label}</Badge>
                  </div>
                </div>

                <p className="mt-2 text-[11px] tabular-nums text-muted-foreground">
                  Pokok {formatRupiah(row.pokokDicicil)} · sewa{" "}
                  {formatRupiah(row.sewaDibayar)} · porsi pendana 47/60
                  {row.referensiPembayaran
                    ? ` · ${row.referensiPembayaran}`
                    : ""}
                </p>

                {tercatat && (
                  <p className="mt-2 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2 text-[11px] leading-5 text-muted-foreground">
                    {row.transfer.metode === null
                      ? "Metode tidak tercatat"
                      : LABEL_METODE[row.transfer.metode]}
                    {row.transfer.referensi
                      ? ` · ${row.transfer.referensi}`
                      : ""}{" "}
                    · {tanggalRingkas(row.transfer.dicatatPada)} oleh{" "}
                    {row.transfer.dicatatOlehLabel ?? "admin"}
                    {row.transfer.catatan
                      ? `. Catatan: ${row.transfer.catatan}`
                      : ""}
                  </p>
                )}

                {row.transfer.status === "dibatalkan" && (
                  <p className="mt-2 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2 text-[11px] leading-5 text-slate-600">
                    Catatan dibatalkan
                    {row.transfer.alasanBatal
                      ? `: ${row.transfer.alasanBatal}`
                      : ""}
                    . Hak {formatRupiah(row.jumlah)} masih menunggu transfer.
                  </p>
                )}

                <div className="mt-2 flex flex-wrap gap-2">
                  {!tercatat && (
                    <Button
                      size="sm"
                      className="gap-1.5"
                      onClick={() => bukaCatat(row)}
                    >
                      <Coins className="size-3.5" />
                      {row.transfer.status === "dibatalkan"
                        ? "Catat ulang"
                        : "Catat transfer"}
                    </Button>
                  )}
                  {tercatat && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="gap-1.5 text-red-600 hover:bg-red-50 hover:text-red-700"
                      onClick={() => bukaBatal(row)}
                    >
                      <Ban className="size-3.5" />
                      Batalkan catatan
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
        <p className="text-xs text-muted-foreground">
          Angka di atas mengikuti {pembayaranDibaca} pembayaran gadai terbaru
          {adaLebihBanyak ? " Masih ada pembayaran yang lebih lama." : "."}
        </p>
        {adaLebihBanyak && (
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            disabled={batas >= 500}
            onClick={() => setBatas((n) => Math.min(500, n + 100))}
          >
            Muat lebih banyak
          </Button>
        )}
      </div>

      <Dialog
        open={targetCatat !== null}
        onOpenChange={(terbuka) => {
          if (!terbuka && busy !== "catat") setTargetCatat(null);
        }}
      >
        <DialogContent>
          <form onSubmit={simpanCatat} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Catat transfer hak pendana gadai</DialogTitle>
              <DialogDescription>
                {targetCatat !== null && (
                  <>
                    {targetCatat.pendanaNama} · {targetCatat.nomorReferensi} ·{" "}
                    <strong className="text-navy">
                      {formatRupiah(targetCatat.jumlah)}
                    </strong>
                    . Catat hanya setelah uang benar-benar dikirim.
                  </>
                )}
              </DialogDescription>
            </DialogHeader>

            <div>
              <Label
                htmlFor="gadai-transfer-metode"
                className="text-[11px] text-muted-foreground"
              >
                Metode pengiriman
              </Label>
              <Select
                value={metode}
                onValueChange={(v) => setMetode(v as Metode)}
              >
                <SelectTrigger
                  id="gadai-transfer-metode"
                  className="mt-1 w-full"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="transfer_bank">Transfer bank</SelectItem>
                  <SelectItem value="e_wallet">E-wallet</SelectItem>
                  <SelectItem value="tunai">Tunai</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label
                htmlFor="gadai-transfer-referensi"
                className="text-[11px] text-muted-foreground"
              >
                Referensi mutasi (opsional)
              </Label>
              <Input
                id="gadai-transfer-referensi"
                autoComplete="off"
                placeholder="mis. nomor jurnal bank / ID transaksi e-wallet"
                value={referensi}
                onChange={(e) => setReferensi(e.target.value)}
                disabled={busy === "catat"}
                className="mt-1"
              />
            </div>

            <div>
              <Label
                htmlFor="gadai-transfer-catatan"
                className="text-[11px] text-muted-foreground"
              >
                Catatan (opsional)
              </Label>
              <Textarea
                id="gadai-transfer-catatan"
                placeholder="mis. digabung dengan transfer gadai lain"
                value={catatan}
                onChange={(e) => setCatatan(e.target.value)}
                disabled={busy === "catat"}
                className="mt-1"
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={busy === "catat"}
                onClick={() => setTargetCatat(null)}
              >
                Batal
              </Button>
              <Button
                type="submit"
                className="gap-2"
                disabled={busy === "catat"}
              >
                {busy === "catat" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Coins className="size-4" />
                )}
                Catat transfer
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={targetBatal !== null}
        onOpenChange={(terbuka) => {
          if (!terbuka && busy !== "batal") setTargetBatal(null);
        }}
      >
        <DialogContent>
          <form onSubmit={simpanBatal} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Batalkan catatan transfer gadai?</DialogTitle>
              <DialogDescription>
                {targetBatal !== null && (
                  <>
                    Catatan transfer {targetBatal.pendanaNama} (
                    {targetBatal.nomorReferensi}) akan ditandai salah. Uang
                    tidak dikembalikan dan saldo tidak berubah. Catatan lama
                    tetap terbaca di audit trail. Alasan wajib diisi.
                  </>
                )}
              </DialogDescription>
            </DialogHeader>

            <div>
              <Label
                htmlFor="gadai-transfer-alasan"
                className="text-[11px] text-muted-foreground"
              >
                Alasan pembatalan
              </Label>
              <Textarea
                id="gadai-transfer-alasan"
                placeholder="mis. salah nominal atau salah pendana"
                value={alasan}
                onChange={(e) => setAlasan(e.target.value)}
                disabled={busy === "batal"}
                className="mt-1"
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={busy === "batal"}
                onClick={() => setTargetBatal(null)}
              >
                Tahan dulu
              </Button>
              <Button
                type="submit"
                variant="destructive"
                className="gap-2"
                disabled={busy === "batal"}
              >
                {busy === "batal" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <RotateCcw className="size-4" />
                )}
                Batalkan catatan
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
