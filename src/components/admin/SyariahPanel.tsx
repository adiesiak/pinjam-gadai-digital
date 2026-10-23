/**
 * Antrean pengajuan akad syariah di panel admin.
 *
 * Keputusan di sini mencatat ANGKA akad: pokok, tenor, margin Murabahah, dan
 * taksiran Rahn. Tidak ada akad, jurnal, atau saldo dompet yang dibuat; jalur
 * pencairan tetap ditutup `rejectUnverifiedMoneyMovement` sampai integrasi
 * pembayaran dibuka. Karena itu tombolnya disebut "Setujui", bukan "Cairkan".
 */
import { useMutation, useQuery } from "convex/react";
import { Check, HandCoins, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { formatDate } from "@/components/admin/admin-format";
import { KatalogSyariahPanel } from "@/components/admin/KatalogSyariahPanel";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { BarisPengajuanSyariahAdmin } from "@/convex/syariahPengajuan";
import { formatRupiah } from "@/lib/money";
import { MIN_AKAD_SYARIAH, type RencanaAkadSyariah } from "@/lib/syariah/akad";
import { LABEL_JENIS_BARANG } from "@/lib/syariah/katalog";
import {
  MARGIN_MURABAHAH_MAX_PERSEN,
  MARGIN_MURABAHAH_MIN_PERSEN,
} from "@/lib/syariah/murabahah";
import {
  LABEL_JENIS_AKAD,
  LABEL_STATUS_PENGAJUAN_SYARIAH,
  MARGIN_MURABAHAH_BAWAAN,
  rencanaPengajuanSyariah,
  TENOR_AKAD_OPTIONS,
  type StatusPengajuanSyariah,
  type TenorAkad,
} from "@/lib/syariah/pengajuan";
import { cn } from "@/lib/utils";

type Saringan = "menunggu" | "semua" | "disetujui" | "ditolak";

const SARINGAN: readonly { id: Saringan; label: string }[] = [
  { id: "menunggu", label: "Menunggu" },
  { id: "semua", label: "Semua" },
  { id: "disetujui", label: "Disetujui" },
  { id: "ditolak", label: "Ditolak" },
] as const;

function cocok(row: BarisPengajuanSyariahAdmin, saringan: Saringan): boolean {
  if (saringan === "semua") return true;
  if (saringan === "menunggu") return row.status === "diajukan";
  if (saringan === "disetujui") return row.status === "disetujui";
  return row.status === "ditolak";
}

function LencanaStatus({ status }: { status: StatusPengajuanSyariah }) {
  const kelas =
    status === "disetujui"
      ? "border-emerald-300 bg-emerald-50 text-emerald-800"
      : status === "ditolak"
        ? "border-red-200 bg-red-50 text-red-800"
        : status === "dibatalkan"
          ? "border-slate-300 bg-slate-50 text-slate-600"
          : "border-amber-300 bg-amber-50 text-amber-900";
  return (
    <span
      className={cn(
        "inline-flex rounded-md border px-2 py-0.5 text-[10px] font-semibold",
        kelas,
      )}
    >
      {LABEL_STATUS_PENGAJUAN_SYARIAH[status]}
    </span>
  );
}

export function SyariahPanel() {
  const data = useQuery(api.syariahPengajuan.daftarAdmin);
  const kandidat = useQuery(api.penyediaDana.kandidatPendana);
  const ketentuan = useQuery(api.system.getKetentuanBiaya);
  const nisbahPendana = ketentuan?.persenNisbahPendanaSyariah;
  const putuskan = useMutation(api.syariahPengajuan.putuskan);
  const tandaiPenyerahan = useMutation(api.syariahPengajuan.tandaiPenyerahan);
  const catatAkad = useMutation(api.syariahAkad.catatAkadSyariah);

  const [saringan, setSaringan] = useState<Saringan>("menunggu");
  const [cari, setCari] = useState("");
  const [dipilih, setDipilih] = useState<BarisPengajuanSyariahAdmin | null>(null);
  const [pokok, setPokok] = useState("0");
  const [tenor, setTenor] = useState<TenorAkad>(30);
  const [margin, setMargin] = useState("15");
  const [taksiran, setTaksiran] = useState("0");
  const [alasan, setAlasan] = useState("");
  const [catatan, setCatatan] = useState("");
  const [referensiSerah, setReferensiSerah] = useState("");
  const [pendanaId, setPendanaId] = useState("");
  const [busy, setBusy] = useState(false);
  const [busySerah, setBusySerah] = useState(false);
  const [busyAkad, setBusyAkad] = useState(false);

  const baris = useMemo(() => {
    if (data === undefined) return [];
    const needle = cari.trim().toLowerCase();
    return data.filter((row) => {
      if (!cocok(row, saringan)) return false;
      if (needle === "") return true;
      return [
        row.namaPeminjam,
        row.emailPeminjam ?? "",
        row.nomorReferensi,
        row.tujuan,
        row.namaBarang ?? "",
        LABEL_JENIS_AKAD[row.jenis],
      ].some((nilai) => nilai.toLowerCase().includes(needle));
    });
  }, [data, saringan, cari]);

  const jumlah = useMemo(() => {
    const rows = data ?? [];
    return {
      menunggu: rows.filter((row) => row.status === "diajukan").length,
      semua: rows.length,
      disetujui: rows.filter((row) => row.status === "disetujui").length,
      ditolak: rows.filter((row) => row.status === "ditolak").length,
    } satisfies Record<Saringan, number>;
  }, [data]);

  function buka(row: BarisPengajuanSyariahAdmin) {
    setDipilih(row);
    setPokok(String(row.pokok));
    setTenor(row.tenorHari as TenorAkad);
    setMargin(String(row.marginPersen ?? MARGIN_MURABAHAH_BAWAAN));
    setTaksiran(String(row.nilaiTaksiran ?? 0));
    setAlasan("");
    setCatatan("");
    setReferensiSerah("");
    setPendanaId("");
  }

  function tutup() {
    if (busy) return;
    setDipilih(null);
  }

  let rencana: RencanaAkadSyariah | null = null;
  let pesanRencana: string | null = null;
  if (dipilih !== null) {
    try {
      rencana = rencanaPengajuanSyariah(
        {
          jenis: dipilih.jenis,
          pokok: Number(pokok),
          tenorHari: tenor,
          ...(dipilih.jenis === "murabahah"
            ? { marginPersen: Number(margin) }
            : {}),
          ...(dipilih.jenis === "rahn"
            ? { nilaiTaksiran: Number(taksiran) }
            : {}),
        },
        { persenNisbahPendana: nisbahPendana },
      );
    } catch (err) {
      pesanRencana =
        err instanceof Error ? err.message : "Angka akad belum bisa dihitung.";
    }
  }

  async function tandaiBarangTerkirim() {
    if (dipilih === null) return;
    setBusySerah(true);
    try {
      await tandaiPenyerahan({
        id: dipilih._id,
        referensi: referensiSerah.trim(),
      });
      toast.success(`Penyerahan ${dipilih.nomorReferensi} dicatat.`);
      setReferensiSerah("");
      setDipilih(null);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Penyerahan gagal dicatat.",
      );
    } finally {
      setBusySerah(false);
    }
  }

  async function catatAkadPengajuan() {
    if (dipilih === null || pendanaId === "") return;
    setBusyAkad(true);
    try {
      await catatAkad({
        jenis: dipilih.jenis,
        pendanaId: pendanaId as Id<"users">,
        peminjamNama: dipilih.namaPeminjam,
        pokok: dipilih.pokok,
        pengajuanId: dipilih._id,
      });
      toast.success(`Akad untuk ${dipilih.nomorReferensi} dicatat.`);
      setDipilih(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Akad gagal dicatat.");
    } finally {
      setBusyAkad(false);
    }
  }

  async function putuskanPengajuan(keputusan: "setujui" | "tolak") {
    if (dipilih === null) return;
    setBusy(true);
    try {
      await putuskan({
        id: dipilih._id,
        keputusan,
        ...(keputusan === "setujui"
          ? {
              pokok: Number(pokok),
              tenorHari: tenor,
              ...(dipilih.jenis === "murabahah"
                ? { marginPersen: Number(margin) }
                : {}),
              ...(dipilih.jenis === "rahn"
                ? { nilaiTaksiran: Number(taksiran) }
                : {}),
            }
          : { alasanTolak: alasan.trim() }),
        ...(catatan.trim() === "" ? {} : { catatan: catatan.trim() }),
      });
      toast.success(
        keputusan === "setujui"
          ? `Pengajuan ${dipilih.nomorReferensi} disetujui.`
          : `Pengajuan ${dipilih.nomorReferensi} ditolak.`,
      );
      setDipilih(null);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Keputusan gagal disimpan.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (data === undefined) {
    return (
      <div className="space-y-2" role="status" aria-live="polite">
        <span className="sr-only">Memuat pengajuan syariah…</span>
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-950">
        Setujui di sini mencatat keputusan dan angka akad. Pencatatan akad serta
        pencairan dana tetap mengikuti gerbang pembayaran yang sama dengan
        pinjaman konvensional.
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div
          role="group"
          aria-label="Saring pengajuan syariah"
          className="flex flex-wrap gap-1.5"
        >
          {SARINGAN.map((opsi) => (
            <button
              key={opsi.id}
              type="button"
              aria-pressed={saringan === opsi.id}
              onClick={() => setSaringan(opsi.id)}
              className={cn(
                "min-h-9 rounded-lg border px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                saringan === opsi.id
                  ? "border-amber-700 bg-amber-700 text-white"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
              )}
            >
              {opsi.label}
              <span className="ml-1.5 tabular-nums opacity-80">
                {jumlah[opsi.id]}
              </span>
            </button>
          ))}
        </div>
        <div className="relative ml-auto w-full sm:w-72">
          <Search
            className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            aria-label="Cari pengajuan syariah"
            value={cari}
            onChange={(event) => setCari(event.target.value)}
            placeholder="Cari nama, referensi, atau barang…"
            className="pl-9"
          />
        </div>
      </div>

      {baris.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-5 py-8 text-center">
          <HandCoins className="mx-auto size-5 text-amber-700" aria-hidden />
          <p className="mt-2 text-sm font-semibold text-slate-900">
            {cari.trim() === ""
              ? `Tidak ada pengajuan pada saringan ${SARINGAN.find((s) => s.id === saringan)?.label}.`
              : "Tidak ada pengajuan yang cocok dengan pencarian."}
          </p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Pengajuan Murabahah dan Rahn dari peminjam muncul di sini setelah
            formulir dashboard dikirim.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
          {baris.map((row) => (
            <li
              key={row._id}
              className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-slate-900">
                    {row.namaPeminjam}
                  </p>
                  <LencanaStatus status={row.status} />
                  {row.status === "disetujui" && row.namaBarang !== null && (
                    <span
                      className={
                        row.statusPenyerahan === "terkirim"
                          ? "inline-flex rounded-md border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-900"
                          : "inline-flex rounded-md border border-slate-300 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-600"
                      }
                    >
                      {row.statusPenyerahan === "terkirim"
                        ? "Barang terkirim"
                        : "Belum diserahkan"}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-[11px] leading-5 text-slate-600">
                  {LABEL_JENIS_AKAD[row.jenis]} · {row.nomorReferensi} ·{" "}
                  {formatRupiah(row.pokok)} · {row.tenorHari} hari ·{" "}
                  {formatDate(row.dibuatPada)}
                  {row.namaBarang === null ? "" : ` · ${row.namaBarang}`}
                </p>
                <p className="mt-0.5 text-[11px] leading-5 text-muted-foreground">
                  {row.emailPeminjam ?? "tanpa email"} · {row.tujuan}
                </p>
              </div>
              <Button
                type="button"
                variant={row.status === "diajukan" ? "default" : "outline"}
                size="sm"
                className="min-h-11 shrink-0"
                onClick={() => buka(row)}
              >
                {row.status === "diajukan" ? "Tinjau" : "Lihat"}
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={dipilih !== null} onOpenChange={(open) => !open && tutup()}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          {dipilih !== null && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {LABEL_JENIS_AKAD[dipilih.jenis]} · {dipilih.nomorReferensi}
                </DialogTitle>
                <DialogDescription>
                  {dipilih.namaPeminjam} · {dipilih.emailPeminjam ?? "tanpa email"} ·{" "}
                  diajukan {formatDate(dipilih.dibuatPada)}
                </DialogDescription>
              </DialogHeader>

              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-700">
                <p>
                  <span className="font-semibold text-slate-900">Tujuan:</span>{" "}
                  {dipilih.tujuan}
                </p>
                {dipilih.namaBarang !== null && (
                  <p className="mt-0.5">
                    <span className="font-semibold text-slate-900">
                      {dipilih.jenis === "rahn" ? "Jaminan:" : "Barang:"}
                    </span>{" "}
                    {dipilih.namaBarang}
                    {dipilih.katalogId !== null
                      ? " · katalog"
                      : dipilih.jenisBarang !== null
                        ? " · ditulis peminjam"
                        : ""}
                  </p>
                )}
                {dipilih.jenisBarang !== null && (
                  <p className="mt-0.5">
                    <span className="font-semibold text-slate-900">
                      Jenis barang:
                    </span>{" "}
                    {LABEL_JENIS_BARANG[dipilih.jenisBarang]}
                  </p>
                )}
                {dipilih.nomorTujuan !== null && (
                  <p className="mt-0.5">
                    <span className="font-semibold text-slate-900">
                      Nomor tujuan:
                    </span>{" "}
                    <span className="tabular-nums">{dipilih.nomorTujuan}</span>
                  </p>
                )}
                <p className="mt-0.5">
                  <span className="font-semibold text-slate-900">Diajukan:</span>{" "}
                  {formatRupiah(dipilih.pokok)} · {dipilih.tenorHari} hari
                  {dipilih.nilaiTaksiran !== null
                    ? ` · perkiraan taksiran ${formatRupiah(dipilih.nilaiTaksiran)}`
                    : ""}
                </p>
                {dipilih.status === "ditolak" && dipilih.alasanTolak !== null && (
                  <p className="mt-1 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-red-900">
                    Ditolak: {dipilih.alasanTolak}
                  </p>
                )}
              </div>

              {dipilih.status === "diajukan" ? (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="admin-syariah-pokok">Pokok disetujui</Label>
                      <Input
                        id="admin-syariah-pokok"
                        type="number"
                        inputMode="numeric"
                        min={MIN_AKAD_SYARIAH}
                        step={50_000}
                        value={pokok}
                        disabled={busy || dipilih.katalogId !== null}
                        onChange={(event) => setPokok(event.target.value)}
                        className="mt-1"
                      />
                      {dipilih.katalogId !== null && (
                        <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                          Harga barang katalog; pokok mengikuti harga ini.
                        </p>
                      )}
                    </div>
                    <div>
                      <Label className="text-xs">Tenor</Label>
                      <div
                        role="group"
                        aria-label="Tenor akad yang disetujui"
                        className="mt-1 flex flex-wrap gap-1.5"
                      >
                        {TENOR_AKAD_OPTIONS.map((hari) => (
                          <button
                            key={hari}
                            type="button"
                            aria-pressed={tenor === hari}
                            disabled={busy}
                            onClick={() => setTenor(hari)}
                            className={cn(
                              "min-h-9 rounded-lg border px-2.5 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                              tenor === hari
                                ? "border-amber-700 bg-amber-700 text-white"
                                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
                            )}
                          >
                            {hari} hari
                          </button>
                        ))}
                      </div>
                    </div>

                    {dipilih.jenis === "murabahah" && (
                      <div>
                        <Label htmlFor="admin-syariah-margin">
                          Margin Murabahah (%)
                        </Label>
                        <Input
                          id="admin-syariah-margin"
                          type="number"
                          inputMode="decimal"
                          min={MARGIN_MURABAHAH_MIN_PERSEN}
                          max={MARGIN_MURABAHAH_MAX_PERSEN}
                          step={1}
                          value={margin}
                          disabled={busy}
                          onChange={(event) => setMargin(event.target.value)}
                          className="mt-1"
                        />
                        <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                          {`${MARGIN_MURABAHAH_MIN_PERSEN}-${MARGIN_MURABAHAH_MAX_PERSEN}% dari harga pokok untuk seluruh tenor, bukan per bulan.`}
                        </p>
                      </div>
                    )}
                    {dipilih.jenis === "rahn" && (
                      <div>
                        <Label htmlFor="admin-syariah-taksiran">
                          Taksiran final
                        </Label>
                        <Input
                          id="admin-syariah-taksiran"
                          type="number"
                          inputMode="numeric"
                          min={0}
                          step={50_000}
                          value={taksiran}
                          disabled={busy}
                          onChange={(event) => setTaksiran(event.target.value)}
                          className="mt-1"
                        />
                      </div>
                    )}
                  </div>

                  {rencana !== null ? (
                    <dl className="divide-y divide-slate-200 rounded-xl border border-slate-200 px-3 text-xs">
                      <div className="flex items-baseline justify-between gap-3 py-1.5">
                        <dt className="text-slate-600">Total kewajiban</dt>
                        <dd className="font-semibold tabular-nums text-slate-900">
                          {formatRupiah(rencana.totalKewajiban)}
                        </dd>
                      </div>
                      <div className="flex items-baseline justify-between gap-3 py-1.5">
                        <dt className="text-slate-600">
                          {dipilih.jenis === "rahn" ? "Ujrah" : "Margin"} total
                        </dt>
                        <dd className="tabular-nums text-slate-900">
                          {formatRupiah(rencana.marginTotal)}
                        </dd>
                      </div>
                      <div className="flex items-baseline justify-between gap-3 py-1.5">
                        <dt className="text-slate-600">
                          {`Nisbah pendana (${rencana.persenPendana}%)`}
                        </dt>
                        <dd className="tabular-nums text-slate-900">
                          {formatRupiah(rencana.pendanaTerima)}
                        </dd>
                      </div>
                      <div className="flex items-baseline justify-between gap-3 py-1.5">
                        <dt className="text-slate-600">
                          {`Ujrah pengelola (${rencana.persenPlatform}%)`}
                        </dt>
                        <dd className="tabular-nums text-slate-900">
                          {formatRupiah(rencana.nisbahPlatform)}
                        </dd>
                      </div>
                    </dl>
                  ) : (
                    <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-900">
                      {pesanRencana}
                    </p>
                  )}

                  <div>
                    <Label htmlFor="admin-syariah-catatan">
                      Catatan keputusan (opsional)
                    </Label>
                    <Textarea
                      id="admin-syariah-catatan"
                      value={catatan}
                      maxLength={500}
                      disabled={busy}
                      onChange={(event) => setCatatan(event.target.value)}
                      className="mt-1"
                    />
                  </div>

                  <div className="rounded-xl border border-red-200 bg-red-50/60 px-3 py-2.5">
                    <Label htmlFor="admin-syariah-alasan">
                      Alasan penolakan (wajib bila menolak)
                    </Label>
                    <Textarea
                      id="admin-syariah-alasan"
                      value={alasan}
                      maxLength={500}
                      disabled={busy}
                      onChange={(event) => setAlasan(event.target.value)}
                      className="mt-1 bg-white"
                    />
                  </div>
                </>
              ) : (
                <div className="space-y-3">
                  <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs leading-5 text-slate-600">
                    Pengajuan ini sudah diputuskan. Angka akad tersimpan sebagai
                    snapshot dan tidak berubah walau tarif produk diubah nanti.
                  </div>

                  {dipilih.status === "disetujui" &&
                    dipilih.namaBarang !== null &&
                    (dipilih.statusPenyerahan === "terkirim" ? (
                      <div className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2.5 text-xs leading-5 text-sky-900">
                        <p className="font-semibold">Barang sudah diserahkan</p>
                        <p className="mt-0.5 tabular-nums">
                          {dipilih.diserahkanPada === null
                            ? "Waktu tidak tercatat"
                            : formatDate(dipilih.diserahkanPada)}
                          {dipilih.referensiPenyerahan === null
                            ? ""
                            : ` · ${dipilih.referensiPenyerahan}`}
                        </p>
                      </div>
                    ) : (
                      <div className="rounded-xl border border-slate-200 px-3 py-2.5">
                        <Label htmlFor="admin-syariah-serah">
                          Referensi penyerahan
                        </Label>
                        <Input
                          id="admin-syariah-serah"
                          value={referensiSerah}
                          maxLength={120}
                          disabled={busySerah}
                          placeholder="No. resi, ID transaksi, atau nomor token"
                          onChange={(event) =>
                            setReferensiSerah(event.target.value)
                          }
                          className="mt-1"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          className="mt-2 min-h-11 gap-1.5"
                          disabled={
                            busySerah || referensiSerah.trim().length < 3
                          }
                          onClick={tandaiBarangTerkirim}
                        >
                          <Check className="size-4" aria-hidden />
                          {busySerah ? "Menyimpan…" : "Tandai barang terkirim"}
                        </Button>
                        <p className="mt-1.5 text-[11px] leading-5 text-muted-foreground">
                          Catat setelah mitra benar-benar mengirim. Tanda ini
                          muncul di dashboard peminjam dan tidak bisa ditimpa.
                        </p>
                      </div>
                    ))}

                  {dipilih.status === "disetujui" && (
                    <div className="rounded-xl border border-slate-200 px-3 py-2.5">
                      {dipilih.akadNomor !== null ? (
                        <>
                          <p className="text-xs font-semibold text-slate-900">
                            Akad tercatat · {dipilih.akadNomor}
                          </p>
                          <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                            Angka akad mengunci pokok, margin, dan tenor
                            pengajuan ini. Pelunasan mengikuti gerbang
                            pembayaran yang sama dengan transaksi dana lain.
                          </p>
                        </>
                      ) : dipilih.jenis === "murabahah" &&
                        dipilih.katalogId !== null &&
                        dipilih.statusPenyerahan !== "terkirim" ? (
                        <p className="text-[11px] leading-5 text-slate-600">
                          Akad Murabahah menunggu barang katalog ditandai
                          terkirim. Jual beli baru sah setelah barangnya
                          berpindah; catat resi atau token lebih dulu.
                        </p>
                      ) : (
                        <>
                          <Label htmlFor="admin-syariah-pendana">
                            Pencatatan akad
                          </Label>
                          <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                            Pilih penyedia dana yang menempatkan dananya. Angka
                            akad diambil dari pengajuan yang disetujui, bukan
                            dari isian baru.
                          </p>
                          <Select
                            value={pendanaId}
                            onValueChange={setPendanaId}
                          >
                            <SelectTrigger
                              id="admin-syariah-pendana"
                              className="mt-2"
                            >
                              <SelectValue placeholder="Pilih penyedia dana" />
                            </SelectTrigger>
                            <SelectContent>
                              {(kandidat?.rows ?? []).map((row) => (
                                <SelectItem key={row.userId} value={row.userId}>
                                  {row.nama}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button
                            type="button"
                            variant="outline"
                            className="mt-2 min-h-11 gap-1.5"
                            disabled={pendanaId === "" || busyAkad}
                            onClick={catatAkadPengajuan}
                          >
                            <Check className="size-4" aria-hidden />
                            {busyAkad ? "Mencatat…" : "Catat akad"}
                          </Button>
                          <p className="mt-1.5 text-[11px] leading-5 text-muted-foreground">
                            Pencatatan akad memindahkan dana, jadi masih ditutup
                            sampai penyedia pembayaran terintegrasi.
                          </p>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}

              <DialogFooter className="gap-2 sm:justify-between">
                {dipilih.status === "diajukan" ? (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-11 gap-1.5 border-red-300 text-red-800 hover:bg-red-50"
                      disabled={busy || alasan.trim().length < 5}
                      onClick={() => putuskanPengajuan("tolak")}
                    >
                      <X className="size-4" aria-hidden /> Tolak
                    </Button>
                    <Button
                      type="button"
                      className="min-h-11 gap-1.5"
                      disabled={busy || rencana === null}
                      onClick={() => putuskanPengajuan("setujui")}
                    >
                      <Check className="size-4" aria-hidden />
                      {busy ? "Menyimpan…" : "Setujui angka ini"}
                    </Button>
                  </>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11"
                    onClick={tutup}
                  >
                    Tutup
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <div className="border-t border-slate-200 pt-4">
        <KatalogSyariahPanel />
      </div>
    </div>
  );
}
