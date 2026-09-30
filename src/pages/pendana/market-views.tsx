import { useMutation, useQuery } from "convex/react";
import { BadgeCheck, Coins, Loader2, Store } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { WaOtpDialog } from "@/components/WaOtpDialog";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { loanPurposeLabel } from "@/lib/loan";
import { formatRupiah, parseRupiah, type Rupiah } from "@/lib/money";

import { EmptyState, Loading } from "./feedback";

/** Wilayah umum tidak dibagikan; alamat dan lokasi rinci tetap privat. */
function KeteranganWilayah() {
  return (
    <p className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-muted-foreground">
      Wilayah umum tidak dibagikan; alamat dan lokasi rinci hanya dapat diakses tim berwenang.
    </p>
  );
}

/** Tab 1 — daftar catatan simulasi pinjaman & gadai. */
export function MarketplaceSection() {
  const marketplace = useQuery(api.pendana.marketplace);

  return (
    <div>
      {marketplace === undefined ? (
        <Loading />
      ) : marketplace.length === 0 ? (
        <EmptyState
          icon={Store}
          title="Belum ada catatan peluang simulasi"
          body="Catatan berstatus disetujui pada aplikasi tampil dengan kode referensi, rincian perhitungan, jadwal simulasi, dan target ledger yang tersisa."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {marketplace.map((m) => (
            <MarketCard key={m._id} row={m} />
          ))}
        </div>
      )}
    </div>
  );
}

function MarketCard({
  row,
}: {
  row: {
    _id: Id<"loans">;
    nomorReferensi: string;
    kodePeminjam: string;
    statusVerifikasi: string;
    tujuan: string;
    pokokPinjaman: number;
    skemaBulanan: boolean;
    tenorHari: number;
    tenorBulan: number | null;
    cicilanPerBulan: number | null;
    imbalHasilTotal: number;
    totalKewajiban: number;
    biayaAdmin: number;
    biayaPlatform: number;
    totalPotonganDiMuka: number;
    biayaLayananTotal: number;
    jadwalPelunasan: Array<{
      bulan: number | null;
      hariKe: number | null;
      pokok: number;
      imbalHasil: number;
      biayaLayanan: number;
      total: number;
      sisaPokok: number;
    }>;
    simulasiCicilanBulanan: Array<{
      bulan: number | null;
      hariKe: number | null;
      pokok: number;
      imbalHasil: number;
      biayaLayanan: number;
      total: number;
      sisaPokok: number;
    }>;
    catatanJadwal: string;
    terkumpul: number;
    sisaKebutuhan: number;
    danaBersih: number;
    bunga: number;
  };
}) {
  const allocateFunding = useMutation(api.pendana.allocateFunding);
  const waOtpStatus = useQuery(api.security.myWaOtpStatus, {});
  const [open, setOpen] = useState(false);
  const [otpOpen, setOtpOpen] = useState(false);
  const [waNomorPendana, setWaNomorPendana] = useState("");
  const [jumlah, setJumlah] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = useMemo<Rupiah | null>(() => {
    try {
      return parseRupiah(jumlah);
    } catch {
      return null;
    }
  }, [jumlah]);

  const full = row.sisaKebutuhan <= 0;
  const pct = Math.min(100, Math.round((row.terkumpul / row.pokokPinjaman) * 100));

  const alokasikan = async () => {
    setError(null);
    if (parsed === null) {
      setError("Masukkan jumlah rupiah bulat yang valid.");
      return;
    }
    // OTP WA wajib — buka dialog verifikasi dulu; transaksi lanjut di callback.
    if (waOtpStatus?.aktif) {
      if (waNomorPendana.replace(/\D/g, "").length < 8) {
        setError("Masukkan nomor WhatsApp Anda (format 62…) untuk menerima kode OTP.");
        return;
      }
      setOtpOpen(true);
      return;
    }
    await eksekusiAlokasi();
  };

  const eksekusiAlokasi = async () => {
    setBusy(true);
    try {
      await allocateFunding({ loanId: row._id, jumlah: parsed! });
      toast.success("Catatan alokasi simulasi tersimpan di ledger internal. Tidak ada dana yang ditransfer.");
      setOpen(false);
      setOtpOpen(false);
      setJumlah("");
    } catch (err) {
      setError(
        err instanceof Error
          ? `Pencatatan alokasi simulasi gagal: ${err.message}. Tidak ada dana yang ditransfer.`
          : "Pencatatan alokasi simulasi gagal. Tidak ada dana yang ditransfer.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="card-lift rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="border-0 bg-primary text-[10px] text-primary-foreground">
            Simulasi Pinjaman Tunai
          </Badge>
          <Badge className="border-0 bg-emerald-100 text-[10px] text-emerald-700 hover:bg-emerald-100">
            <BadgeCheck className="mr-1 size-3" /> Status aplikasi: {row.statusVerifikasi}
          </Badge>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">Kode peminjam</p>
        <p className="font-mono text-sm font-semibold tracking-wide">{row.kodePeminjam}</p>
        <p className="mt-2 text-xs text-muted-foreground">Pokok acuan simulasi (tidak ditransfer)</p>
        <p className="text-lg font-semibold tabular-nums">{formatRupiah(row.pokokPinjaman)}</p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {row.nomorReferensi} · Tujuan yang dicatat: {loanPurposeLabel(row.tujuan)}
        </p>
      </div>

      <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
        Data pemohon dan status review berasal dari aplikasi, bukan verifikasi eksternal. Kartu ini hanya menampilkan hitungan simulasi; alokasi tidak mengirim atau menerima dana.
      </p>

      <dl className="mt-4 grid grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-center text-xs sm:grid-cols-3">
        <div>
          <dt className="text-muted-foreground">Tenor simulasi</dt>
          <dd className="mt-0.5 font-semibold tabular-nums">
            {row.tenorBulan !== null ? `${row.tenorBulan} bulan` : `${row.tenorHari} hari`}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Imbal hasil simulasi</dt>
          <dd className="mt-0.5 font-semibold tabular-nums text-emerald-700">
            {formatRupiah(row.imbalHasilTotal)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Total kewajiban simulasi (bukan tagihan)</dt>
          <dd className="mt-0.5 font-semibold tabular-nums">
            {formatRupiah(row.totalKewajiban)}
          </dd>
        </div>
      </dl>

      <section className="mt-3 rounded-xl border border-slate-200 px-3 py-3 text-xs">
        <h3 className="font-semibold">Rincian perhitungan simulasi</h3>
        {row.skemaBulanan ? (
          <dl className="mt-2 space-y-1.5">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Biaya layanan simulasi (total)</dt>
              <dd className="font-medium tabular-nums">{formatRupiah(row.biayaLayananTotal)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Potongan simulasi di muka</dt>
              <dd className="font-medium tabular-nums">{formatRupiah(row.totalPotonganDiMuka)}</dd>
            </div>
          </dl>
        ) : (
          <dl className="mt-2 space-y-1.5">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Biaya admin simulasi</dt>
              <dd className="font-medium tabular-nums">{formatRupiah(row.biayaAdmin)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Biaya platform simulasi</dt>
              <dd className="font-medium tabular-nums">{formatRupiah(row.biayaPlatform)}</dd>
            </div>
            <div className="flex justify-between gap-3 border-t border-slate-100 pt-1.5">
              <dt className="text-muted-foreground">Total potongan simulasi di muka</dt>
              <dd className="font-medium tabular-nums">{formatRupiah(row.totalPotonganDiMuka)}</dd>
            </div>
          </dl>
        )}
        <p className="mt-2 border-t border-slate-100 pt-2 text-muted-foreground">
          Nilai bersih pada simulasi (tidak ditransfer): <span className="font-semibold tabular-nums text-foreground">{formatRupiah(row.danaBersih)}</span>
        </p>
      </section>

      <section className="mt-3 rounded-xl border border-slate-200 px-3 py-3 text-xs">
        <h3 className="font-semibold">Jadwal simulasi kewajiban</h3>
        <p className="mt-1 text-muted-foreground">
          Catatan aplikasi (bukan tagihan atau bukti pembayaran): {row.catatanJadwal} Jadwal ini tidak mencatat atau memverifikasi pembayaran aktual.
        </p>
        <ul className="mt-2 divide-y divide-slate-100">
          {row.jadwalPelunasan.map((cicilan, index) => (
            <li key={`${cicilan.bulan ?? cicilan.hariKe}-${index}`} className="flex flex-wrap justify-between gap-x-3 gap-y-1 py-2">
              <span>{cicilan.bulan !== null ? `Bulan simulasi ke-${cicilan.bulan}` : `Hari simulasi ke-${cicilan.hariKe}`}</span>
              <span className="text-right font-semibold tabular-nums">{formatRupiah(cicilan.total)}</span>
            </li>
          ))}
        </ul>
      </section>

      {row.simulasiCicilanBulanan.length > 0 && (
        <details className="mt-3 rounded-xl border border-amber-200 bg-amber-50/50 px-3 py-2.5 text-xs">
          <summary className="cursor-pointer font-medium">Lihat simulasi cicilan bulanan (bukan tagihan aktual)</summary>
          <p className="mt-2 text-muted-foreground">Rincian ini hanya simulasi; pada akhir tenor status dapat ditandai lunas sekaligus di ledger. Itu bukan konfirmasi pembayaran aktual.</p>
          <ul className="mt-2 divide-y divide-amber-100">
            {row.simulasiCicilanBulanan.map((cicilan, index) => (
              <li key={`${cicilan.bulan}-${index}`} className="flex justify-between gap-3 py-1.5">
                <span>Bulan simulasi {cicilan.bulan}</span>
                <span className="font-medium tabular-nums">{formatRupiah(cicilan.total)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      <KeteranganWilayah />

      {/* Progress pendanaan */}
      <div className="mt-4">
        <div className="flex items-baseline justify-between text-xs">
          <span className="font-medium">Alokasi simulasi tercatat di ledger</span>
          <span className="text-right tabular-nums text-muted-foreground">
            {formatRupiah(row.terkumpul)} / {formatRupiah(row.pokokPinjaman)}
          </span>
        </div>
        <Progress className="mt-1.5 h-2.5" value={pct} />
        <p className="mt-1.5 break-words text-xs leading-5 tabular-nums text-muted-foreground">
          Sisa target ledger {formatRupiah(row.sisaKebutuhan)}
        </p>
      </div>

      {full ? (
        <Badge className="mt-4 border-0 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
          <BadgeCheck className="mr-1 size-3.5" /> Target simulasi tercapai
        </Badge>
      ) : (
        <>
          <Button className="mt-4 w-full" onClick={() => setOpen(true)}>
            <Coins className="mr-1.5 size-4" />
            Catat alokasi simulasi
          </Button>
        </>
      )}

      {/* Dialog alokasi — dilindungi anti-overfunding server-side */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Catat alokasi simulasi</DialogTitle>
            <DialogDescription>
              Ini hanya mengubah ledger internal; tidak ada dana yang dikirim, diterima, atau diverifikasi. {row.nomorReferensi} · sisa target ledger {formatRupiah(row.sisaKebutuhan)}.
            </DialogDescription>
          </DialogHeader>
          <KeteranganWilayah />
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="alo-jumlah">Jumlah alokasi pada ledger simulasi</Label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  Rp
                </span>
                <Input
                  id="alo-jumlah"
                  inputMode="numeric"
                  className="pl-9 tabular-nums"
                  value={jumlah}
                  onChange={(e) => setJumlah(e.target.value)}
                  aria-invalid={jumlah.trim() !== "" && parsed === null}
                  aria-describedby={error ? "alokasi-error" : "alokasi-hint"}
                  onBlur={() => {
                    if (parsed !== null) setJumlah(formatRupiah(parsed).replace("Rp ", ""));
                  }}
                  placeholder={`Maks ${formatRupiah(row.sisaKebutuhan)}`}
                  required
                  aria-required="true"
                  disabled={busy}
                />
              </div>
              <p id="alokasi-hint" className="text-xs text-muted-foreground">
                Estimasi imbal hasil simulasi:{" "}
                <span className="font-semibold tabular-nums text-emerald-700">
                  {formatRupiah(
                    parsed !== null && parsed > 0
                      ? Math.floor((row.bunga * Math.min(parsed, row.sisaKebutuhan)) / row.pokokPinjaman)
                      : 0,
                  )}
                </span>{" "}
                {row.tenorBulan !== null
                  ? "(bunga menurun, proporsional porsi)"
                  : "(30% proporsional)"}
              </p>
            </div>
            {error && (
              <p
                id="alokasi-error"
                role="alert"
                aria-live="assertive"
                className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
              >
                {error}
              </p>
            )}
            {waOtpStatus?.aktif && (
              <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <Label htmlFor="alo-wa">Nomor WhatsApp verifikasi (62…)</Label>
                <Input
                  id="alo-wa"
                  inputMode="tel"
                  value={waNomorPendana}
                  onChange={(e) => setWaNomorPendana(e.target.value)}
                  placeholder="628123456789"
                  required
                  aria-required="true"
                  autoComplete="tel"
                  aria-invalid={waNomorPendana.trim() !== "" && waNomorPendana.replace(/\D/g, "").length < 8}
                  disabled={busy}
                />
                <p className="text-xs text-muted-foreground">
                  Kode OTP melindungi tindakan akun sebelum catatan alokasi simulasi disimpan (5 menit, sekali pakai); kode ini tidak memverifikasi dana atau transfer.
                </p>
              </div>
            )}
            <Button className="w-full" disabled={busy || parsed === null} onClick={alokasikan}>
              {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Simpan catatan alokasi
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {waNomorPendana && (
        <WaOtpDialog
          open={otpOpen}
          onOpenChange={setOtpOpen}
          tujuan={waNomorPendana.replace(/\D/g, "")}
          alasan={`Alokasi Dana ${row.nomorReferensi}`}
          onVerified={() => void eksekusiAlokasi()}
        />
      )}
    </article>
  );
}
