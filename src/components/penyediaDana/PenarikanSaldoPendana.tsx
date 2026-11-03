/**
 * Penarikan saldo pendana — jalur manual.
 *
 * Permintaan hanya mengunci saldo; uang baru keluar setelah admin mentransfer
 * dan mengunggah bukti transfer keluar. Jalur otomatis sengaja tidak tersedia.
 * Komponen ini menampilkan saldo secukupnya untuk keputusan penarikan, bukan
 * menghidupkan kembali dompet penuh yang sudah dicabut.
 */
import { useMutation, useQuery } from "convex/react";
import {
  Banknote,
  CheckCircle2,
  Clock,
  Loader2,
  Lock,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { formatRupiah, kelompokkanDigit } from "@/lib/money";
import { hitungBiayaPencairan } from "@/lib/withdrawal";
import { formatTanggalWIB } from "@/lib/waktu";
import { cn } from "@/lib/utils";

const KELAS_STATUS: Record<string, string> = {
  menunggu_proses: "border-amber-200 bg-amber-50 text-amber-900",
  diproses: "border-emerald-200 bg-emerald-50 text-emerald-900",
  ditolak: "border-rose-200 bg-rose-50 text-rose-900",
};

const LABEL_STATUS: Record<string, string> = {
  menunggu_proses: "Menunggu transfer admin",
  diproses: "Sudah ditransfer",
  ditolak: "Ditolak",
};

function ikonStatus(status: string) {
  if (status === "diproses") return <CheckCircle2 className="size-3.5" aria-hidden />;
  if (status === "ditolak") return <XCircle className="size-3.5" aria-hidden />;
  return <Clock className="size-3.5" aria-hidden />;
}

export function PenarikanSaldoPendana({ className }: { className?: string }) {
  const dompet = useQuery(api.alokasiDana.myWallet, {});
  const riwayat = useQuery(api.alokasiDana.myWithdrawals, {});
  const ajukan = useMutation(api.alokasiDana.requestWithdrawal);
  const batalkan = useMutation(api.alokasiDana.cancelWithdrawal);

  const [jumlah, setJumlah] = useState("");
  const [bank, setBank] = useState("");
  const [rekening, setRekening] = useState("");
  const [setuju, setSetuju] = useState(false);
  const [mengirim, setMengirim] = useState(false);
  const [membatalkan, setMembatalkan] = useState<Id<"withdrawals"> | null>(null);
  const [galat, setGalat] = useState<string | null>(null);

  const nominal = Number(jumlah.replace(/\D/g, "")) || 0;
  const biaya =
    Number.isSafeInteger(nominal) && nominal > 0
      ? hitungBiayaPencairan(nominal)
      : null;
  const bisaDitarik = dompet?.bisaDitarik ?? 0;
  const daftar = riwayat ?? [];
  const adaYangDiproses = daftar.some((row) => row.status === "menunggu_proses");

  async function kirim(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setGalat(null);
    if (!Number.isSafeInteger(nominal) || nominal <= 0) {
      setGalat("Nominal penarikan harus rupiah bulat positif.");
      return;
    }
    if (nominal > bisaDitarik) {
      setGalat(`Nominal melebihi saldo yang bisa ditarik (${formatRupiah(bisaDitarik)}).`);
      return;
    }
    if (bank.trim().length < 2) {
      setGalat("Nama bank wajib diisi, misalnya BCA atau Mandiri.");
      return;
    }
    if (!/^\d{6,20}$/.test(rekening.replace(/\s+/g, ""))) {
      setGalat("Nomor rekening harus 6 sampai 20 digit angka.");
      return;
    }
    if (!setuju) {
      setGalat("Centang konfirmasi bahwa penarikan diproses manual oleh admin.");
      return;
    }
    setMengirim(true);
    try {
      const { nomorReferensi } = await ajukan({
        jumlah: nominal,
        namaBank: bank.trim(),
        nomorRekening: rekening.replace(/\s+/g, ""),
      });
      toast.success(
        `Permintaan ${nomorReferensi} dicatat. Admin mentransfer manual dan mengunggah bukti keluar.`,
      );
      setJumlah("");
      setBank("");
      setRekening("");
      setSetuju(false);
    } catch (error) {
      setGalat(error instanceof Error ? error.message : "Penarikan gagal diajukan.");
    } finally {
      setMengirim(false);
    }
  }

  async function batalkanPenarikan(id: Id<"withdrawals">) {
    setMembatalkan(id);
    try {
      await batalkan({ withdrawalId: id });
      toast.success("Permintaan penarikan dibatalkan. Saldo kembali tersedia.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Penarikan gagal dibatalkan.");
    } finally {
      setMembatalkan(null);
    }
  }

  if (dompet === undefined) {
    return (
      <section
        aria-label="Penarikan saldo pendana"
        className={cn("mt-4 rounded-lg border border-slate-200 bg-white p-4", className)}
      >
        <p className="text-xs text-muted-foreground">Memuat saldo penarikan...</p>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="judul-penarikan-saldo"
      className={cn(
        "animate-masuk mt-5 rounded-lg border border-slate-200 bg-white p-4 sm:p-5",
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 max-w-2xl">
          <h2
            id="judul-penarikan-saldo"
            className="flex items-center gap-2 text-sm font-semibold text-navy"
          >
            <Banknote className="size-4 text-emerald-700" aria-hidden="true" />
            Penarikan saldo
          </h2>
          <p className="mt-1 text-xs leading-6 text-slate-600">
            Penarikan diproses manual oleh admin ke rekening Anda. Saldo yang
            diminta langsung direservasi agar tidak bisa dipakai untuk penempatan
            lain. Jalur otomatis dimatikan sementara.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600">
          <ShieldCheck className="size-3.5 text-success-foreground" aria-hidden />
          Manual terverifikasi
        </span>
      </div>

      <dl className="mt-3 grid gap-x-5 gap-y-2 rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2.5 text-xs sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
            Saldo tercatat
          </dt>
          <dd className="mt-0.5 font-semibold tabular-nums text-navy">
            {formatRupiah(dompet.saldo)}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
            Terkunci siklus
          </dt>
          <dd className="mt-0.5 font-semibold tabular-nums text-slate-700">
            {formatRupiah(dompet.terkunci)}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
            Tertahan penarikan
          </dt>
          <dd className="mt-0.5 font-semibold tabular-nums text-slate-700">
            {formatRupiah(dompet.tertahanPenarikan)}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
            Bisa ditarik
          </dt>
          <dd className="mt-0.5 font-semibold tabular-nums text-emerald-800">
            {formatRupiah(dompet.bisaDitarik)}
          </dd>
        </div>
      </dl>

      {bisaDitarik <= 0 ? (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs leading-5 text-slate-600">
          <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <p>
            Belum ada saldo yang bisa ditarik. Saldo siklus berjalan baru terbuka
            setelah jatuh tempo dan dicairkan admin.
          </p>
        </div>
      ) : (
        <form onSubmit={kirim} className="mt-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="tarik-jumlah">Nominal penarikan</Label>
              <Input
                id="tarik-jumlah"
                inputMode="numeric"
                className="mt-1 h-11 tabular-nums"
                placeholder="500.000"
                value={jumlah}
                onChange={(event) => setJumlah(kelompokkanDigit(event.target.value))}
                disabled={mengirim}
              />
            </div>
            <div>
              <Label htmlFor="tarik-bank">Bank tujuan</Label>
              <Input
                id="tarik-bank"
                className="mt-1 h-11"
                placeholder="BCA"
                value={bank}
                onChange={(event) => setBank(event.target.value)}
                disabled={mengirim}
                autoComplete="organization"
              />
            </div>
            <div>
              <Label htmlFor="tarik-rekening">Nomor rekening</Label>
              <Input
                id="tarik-rekening"
                inputMode="numeric"
                className="mt-1 h-11 tabular-nums"
                placeholder="1234567890"
                value={rekening}
                onChange={(event) =>
                  setRekening(event.target.value.replace(/[^\d\s]/g, ""))
                }
                disabled={mengirim}
                autoComplete="off"
              />
            </div>
          </div>

          {biaya !== null && (
            <div className="grid gap-1 rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-xs text-emerald-950 sm:grid-cols-3">
              <p>
                Bruto <span className="font-semibold tabular-nums">{formatRupiah(biaya.jumlahBruto)}</span>
              </p>
              <p>
                Biaya 5%{" "}
                <span className="font-semibold tabular-nums">
                  {formatRupiah(biaya.biayaPencairan)}
                </span>
              </p>
              <p>
                Diterima{" "}
                <span className="font-semibold tabular-nums">
                  {formatRupiah(biaya.jumlahBersih)}
                </span>
              </p>
            </div>
          )}

          <label className="flex min-h-11 items-start gap-2 py-1 text-xs leading-5 text-slate-700">
            <input
              type="checkbox"
              checked={setuju}
              onChange={(event) => setSetuju(event.target.checked)}
              disabled={mengirim}
              className="mt-0.5 size-4 rounded border-slate-300 text-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2"
            />
            <span>
              Saya memahami penarikan diproses manual oleh admin dan saldo baru
              berkurang setelah transfer keluar dicatat.
            </span>
          </label>

          {galat !== null && (
            <p
              role="alert"
              className="rounded-lg bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive"
            >
              {galat}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="submit"
              className="h-11 gap-1.5"
              disabled={mengirim || !setuju}
            >
              {mengirim ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Banknote className="size-4" aria-hidden />
              )}
              {mengirim ? "Mengirim" : "Ajukan penarikan"}
            </Button>
            {adaYangDiproses && (
              <p className="text-[11px] text-muted-foreground">
                Permintaan sebelumnya masih menunggu transfer admin.
              </p>
            )}
          </div>
        </form>
      )}

      {daftar.length > 0 && (
        <div className="mt-4 border-t border-slate-200 pt-3">
          <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Riwayat penarikan
          </h3>
          <ul className="mt-2 divide-y divide-slate-200">
            {daftar.slice(0, 6).map((row) => (
              <li key={row._id} className="py-2.5 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                  <span className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="font-mono text-[11px] text-slate-500">
                      {row.nomorReferensi}
                    </span>
                    <span className="font-semibold tabular-nums text-navy">
                      {formatRupiah(row.jumlah)}
                    </span>
                    <span className="text-muted-foreground">
                      {row.namaBank} · {row.nomorRekening}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
                      KELAS_STATUS[row.status] ?? "border-slate-200 bg-slate-50 text-slate-700",
                    )}
                  >
                    {ikonStatus(row.status)}
                    {LABEL_STATUS[row.status] ?? row.status}
                  </span>
                </div>
                <p className="mt-1 text-[11px] leading-5 text-slate-500">
                  Diterima {formatRupiah(row.jumlahBersih)} setelah biaya{" "}
                  {formatRupiah(row.biayaPencairan)}
                  {row.diprosesPada !== null
                    ? ` · transfer ${formatTanggalWIB(row.diprosesPada)}`
                    : ""}
                  {row.referensiTransfer !== null
                    ? ` · referensi ${row.referensiTransfer}`
                    : ""}
                </p>
                {row.catatanAdmin !== null && row.catatanAdmin.trim() !== "" && (
                  <p className="mt-1 text-[11px] leading-5 text-slate-600">
                    Catatan admin: {row.catatanAdmin}
                  </p>
                )}
                {row.status === "menunggu_proses" && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="mt-1 h-9 gap-1 text-[11px] text-slate-600"
                    disabled={membatalkan !== null}
                    onClick={() => batalkanPenarikan(row._id)}
                  >
                    {membatalkan === row._id ? (
                      <Loader2 className="size-3.5 animate-spin" aria-hidden />
                    ) : (
                      <XCircle className="size-3.5" aria-hidden />
                    )}
                    Batalkan permintaan
                  </Button>
                )}
              </li>
            ))}
          </ul>
          {daftar.length > 6 && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              Menampilkan 6 penarikan terbaru dari {daftar.length}.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
