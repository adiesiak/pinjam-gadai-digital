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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { formatRupiah } from "@/lib/money";
import { LABEL_METODE_TRANSFER } from "@/lib/transferPendana";

/**
 * Pencatatan transfer keuntungan pendana — satu-satunya panel admin tempat
 * peringatan "belum dicatat" di ruang /penyedia-dana bisa diselesaikan.
 *
 * PINDAI tidak memindahkan uang: admin mentransfer keuntungan di luar sistem,
 * lalu mencatatnya di sini (metode, referensi mutasi, catatan). Nominal TIDAK
 * diambil dari kolom isian — server menghitungnya dari pokok pinjaman dengan
 * kebijakan yang berlaku, jadi angka yang tercatat selalu sama dengan yang
 * benar-benar menjadi hak pendana.
 *
 * Catatan yang salah dibatalkan (dengan alasan wajib), bukan diubah: riwayatnya
 * tetap terbaca di Audit Trail. Membatalkan tidak mengembalikan uang apa pun.
 *
 * Kewajiban transfer hanya jatuh tempo setelah pinjaman lunas; karena itu daftar
 * ini hanya memuat pinjaman berstatus lunas.
 */

type Metode = "transfer_bank" | "e_wallet" | "tunai";

type StatusTransfer = "belum_dicatat" | "dicatat" | "dibatalkan";

type BarisTransfer = {
  loanId: Id<"loans">;
  referensi: string;
  pendanaNama: string;
  keuntunganPendana: number;
  lunasPada: number;
  transfer: {
    status: StatusTransfer;
    jumlah: number;
    referensi: string | null;
    metode: string | null;
    catatan: string | null;
    dicatatOlehLabel: string | null;
    dicatatPada: number | null;
    alasanBatal: string | null;
    adaPembatalan: boolean;
  };
};

const META_STATUS: Record<
  StatusTransfer,
  { label: string; className: string }
> = {
  belum_dicatat: {
    label: "Belum Dicatat",
    className: "border-0 bg-amber-100 text-amber-800 hover:bg-amber-100",
  },
  dicatat: {
    label: "Sudah Dicatat",
    className: "border-success-border bg-success-soft text-success-foreground hover:bg-success-soft",
  },
  dibatalkan: {
    label: "Catatan Dibatalkan",
    className: "border-0 bg-slate-200 text-slate-700 hover:bg-slate-200",
  },
};

function tanggalRingkas(ms: number | null): string {
  if (ms === null) return "—";
  return new Date(ms).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Label metode yang dikirim admin; cadangan bila nilainya tak dikenal. */
function labelMetode(metode: string | null): string {
  if (metode === null) return "—";
  return LABEL_METODE_TRANSFER[metode] ?? metode;
}

export function PencatatanTransferPendana() {
  const data = useQuery(api.penyediaDana.daftarTransferPendana, {});
  const catat = useMutation(api.penyediaDana.catatTransferPendana);
  const batalkan = useMutation(api.penyediaDana.batalkanTransferPendana);

  const [targetCatat, setTargetCatat] = useState<BarisTransfer | null>(null);
  const [targetBatal, setTargetBatal] = useState<BarisTransfer | null>(null);
  const [metode, setMetode] = useState<Metode>("transfer_bank");
  const [referensi, setReferensi] = useState("");
  const [catatan, setCatatan] = useState("");
  const [alasan, setAlasan] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const bukaCatat = (r: BarisTransfer) => {
    setMetode("transfer_bank");
    setReferensi("");
    setCatatan("");
    setTargetCatat(r);
  };

  const bukaBatal = (r: BarisTransfer) => {
    setAlasan("");
    setTargetBatal(r);
  };

  const simpanCatat = async (event: React.FormEvent) => {
    event.preventDefault();
    if (targetCatat === null) return;
    setBusy("catat");
    try {
      const hasil = await catat({
        loanId: targetCatat.loanId,
        metode,
        referensi: referensi.trim() === "" ? undefined : referensi.trim(),
        catatan: catatan.trim() === "" ? undefined : catatan.trim(),
      });
      toast.success(
        `Transfer keuntungan ${targetCatat.pendanaNama} dicatat: ${formatRupiah(hasil.jumlah)}.`,
      );
      setTargetCatat(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal mencatat transfer.");
    } finally {
      setBusy(null);
    }
  };

  const simpanBatal = async (event: React.FormEvent) => {
    event.preventDefault();
    if (targetBatal === null) return;
    if (alasan.trim().length < 3) {
      toast.error("Isi alasan pembatalan (minimal 3 karakter).");
      return;
    }
    setBusy("batal");
    try {
      await batalkan({ loanId: targetBatal.loanId, alasan: alasan.trim() });
      toast.success("Catatan transfer dibatalkan; riwayatnya tetap di Audit Trail.");
      setTargetBatal(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal membatalkan catatan.");
    } finally {
      setBusy(null);
    }
  };

  if (data === undefined) {
    return (
      <p className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-10 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Memuat catatan transfer keuntungan…
      </p>
    );
  }

  const { rows, ringkasan, terpotong } = data;
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
              Pencatatan Transfer Keuntungan
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label="Penjelasan pencatatan transfer"
                    className="text-muted-foreground transition-colors hover:text-slate-700"
                  >
                    <Info className="size-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  PINDAI tidak memindahkan uang. Nominal dihitung server dari pokok pinjaman, jadi
                  angka yang tercatat selalu sama dengan hak pendana. Catatan yang salah dibatalkan
                  (dengan alasan), bukan diubah — keduanya masuk Audit Trail. Kewajiban transfer
                  hanya muncul setelah pinjaman lunas.
                </TooltipContent>
              </Tooltip>
            </h3>
            <p className="text-xs text-muted-foreground">
              Catat transfer setelah uang benar-benar dikirim — nominal dihitung server.
            </p>
          </div>
        </div>
        {adaBelum ? (
          <Badge className="border-0 bg-amber-100 text-amber-800 hover:bg-amber-100">
            <TriangleAlert className="mr-1 size-3" /> {ringkasan.jumlahBelumDicatat} belum dicatat
          </Badge>
        ) : (
          <Badge className="border-success-border bg-success-soft text-success-foreground hover:bg-success-soft">
            <CheckCircle2 className="mr-1 size-3" /> semua tercatat
          </Badge>
        )}
      </header>

      {adaBelum && (
        <p className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-800">
          <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
          {ringkasan.jumlahBelumDicatat} transfer keuntungan belum dicatat (
          {formatRupiah(ringkasan.nilaiBelumDicatat)})
        </p>
      )}

      {terpotong && (
        <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
          Daftar memuat pinjaman yang paling baru lunas. Kewajiban yang lebih lama dari itu
          tidak ditampilkan — periksa pinjaman lama satu per satu lewat pencarian pinjaman.
        </p>
      )}

      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetrikKartu
          label="Belum Dicatat"
          nilai={<span className="text-lg font-bold text-amber-700">{ringkasan.jumlahBelumDicatat}</span>}
        />
        <MetrikKartu
          label="Nilai Belum Dicatat"
          nilai={<span className="font-bold text-amber-700">{formatRupiah(ringkasan.nilaiBelumDicatat)}</span>}
        />
        <MetrikKartu
          label="Sudah Dicatat"
          nilai={<span className="text-lg font-bold text-emerald-800">{ringkasan.jumlahTercatat}</span>}
        />
        <MetrikKartu
          label="Nilai Sudah Dicatat"
          nilai={<span className="font-bold text-emerald-800">{formatRupiah(ringkasan.nilaiTercatat)}</span>}
        />
      </dl>

      {rows.length === 0 ? (
        <div className="mt-3">
          <EmptyQueue
            icon={Coins}
            title="Belum ada pinjaman lunas berpendana"
            deskripsi="Kewajiban transfer keuntungan muncul di sini begitu sebuah pinjaman berpendana berstatus lunas."
            poin={[
              "Nominal tiap baris dihitung server dari pokok pinjaman dan kebijakan yang berlaku.",
              "Catat metode serta referensi mutasi bank/e-wallet sebagai jejak pencocokan.",
            ]}
          />
        </div>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {rows.map((r) => {
            const meta = META_STATUS[r.transfer.status];
            const tercatat = r.transfer.status === "dicatat";
            return (
              <li
                key={r.loanId}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-navy">{r.pendanaNama}</p>
                    <p className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">
                      {r.referensi} · lunas {tanggalRingkas(r.lunasPada)}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="text-sm font-bold tabular-nums text-emerald-800">
                      {formatRupiah(r.keuntunganPendana)}
                    </span>
                    <Badge className={meta.className}>{meta.label}</Badge>
                  </div>
                </div>

                {tercatat && (
                  <p className="mt-2 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2 text-[11px] leading-5 text-muted-foreground">
                    {labelMetode(r.transfer.metode)}
                    {r.transfer.referensi ? ` · ${r.transfer.referensi}` : ""} ·{" "}
                    {tanggalRingkas(r.transfer.dicatatPada)} oleh{" "}
                    {r.transfer.dicatatOlehLabel ?? "admin"}
                    {r.transfer.catatan ? ` — ${r.transfer.catatan}` : ""}
                  </p>
                )}

                {r.transfer.status === "dibatalkan" && (
                  <p className="mt-2 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2 text-[11px] leading-5 text-slate-600">
                    Catatan dibatalkan{r.transfer.alasanBatal ? `: ${r.transfer.alasanBatal}` : ""}.
                    Tercatat {formatRupiah(r.keuntunganPendana)} masih menunggu transfer.
                  </p>
                )}

                <div className="mt-2 flex flex-wrap gap-2">
                  {!tercatat && (
                    <Button size="sm" className="gap-1.5" onClick={() => bukaCatat(r)}>
                      <Coins className="size-3.5" />
                      {r.transfer.status === "dibatalkan" ? "Catat ulang" : "Catat transfer"}
                    </Button>
                  )}
                  {(tercatat || r.transfer.status === "dibatalkan") && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="gap-1.5 text-red-600 hover:bg-red-50 hover:text-red-700"
                      disabled={r.transfer.status === "dibatalkan"}
                      onClick={() => bukaBatal(r)}
                    >
                      {tercatat ? <Ban className="size-3.5" /> : <RotateCcw className="size-3.5" />}
                      Batalkan Catatan
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Dialog catat transfer: metode + referensi mutasi + catatan opsional. */}
      <Dialog
        open={targetCatat !== null}
        onOpenChange={(terbuka) => {
          if (!terbuka && busy !== "catat") setTargetCatat(null);
        }}
      >
        <DialogContent>
          <form onSubmit={simpanCatat} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Catat transfer keuntungan</DialogTitle>
              <DialogDescription>
                {targetCatat !== null && (
                  <>
                    {targetCatat.pendanaNama} · {targetCatat.referensi} ·{" "}
                    <strong className="text-navy">
                      {formatRupiah(targetCatat.keuntunganPendana)}
                    </strong>
                    . Catat hanya setelah uang benar-benar Anda kirim — PINDAI tidak memindahkan
                    dana.
                  </>
                )}
              </DialogDescription>
            </DialogHeader>

            <div>
              <Label htmlFor="transfer-metode" className="text-[11px] text-muted-foreground">
                Metode pengiriman
              </Label>
              <Select value={metode} onValueChange={(v) => setMetode(v as Metode)}>
                <SelectTrigger id="transfer-metode" className="mt-1 w-full">
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
              <Label htmlFor="transfer-referensi" className="text-[11px] text-muted-foreground">
                Referensi mutasi (opsional)
              </Label>
              <Input
                id="transfer-referensi"
                autoComplete="off"
                placeholder="mis. nomor jurnal bank / ID transaksi e-wallet"
                value={referensi}
                onChange={(e) => setReferensi(e.target.value)}
                disabled={busy === "catat"}
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="transfer-catatan" className="text-[11px] text-muted-foreground">
                Catatan (opsional)
              </Label>
              <Textarea
                id="transfer-catatan"
                placeholder="mis. ditransfer bersama pelunasan lain"
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
              <Button type="submit" className="gap-2" disabled={busy === "catat"}>
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

      {/* Dialog batalkan: alasan wajib, tercatat di Audit Trail. */}
      <Dialog
        open={targetBatal !== null}
        onOpenChange={(terbuka) => {
          if (!terbuka && busy !== "batal") setTargetBatal(null);
        }}
      >
        <DialogContent>
          <form onSubmit={simpanBatal} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Batalkan catatan transfer?</DialogTitle>
              <DialogDescription>
                {targetBatal !== null && (
                  <>
                    Catatan transfer {targetBatal.pendanaNama} ({targetBatal.referensi}) akan
                    ditandai salah. Uang TIDAK dikembalikan dan saldo tidak berubah — catatan lama
                    tetap terbaca di Audit Trail. Alasan wajib diisi.
                  </>
                )}
              </DialogDescription>
            </DialogHeader>

            <div>
              <Label htmlFor="transfer-alasan" className="text-[11px] text-muted-foreground">
                Alasan pembatalan
              </Label>
              <Textarea
                id="transfer-alasan"
                placeholder="mis. salah nominal / ditransfer ke pendana lain"
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
                  <Ban className="size-4" />
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
