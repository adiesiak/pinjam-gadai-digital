import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useMutation, useQuery } from "convex/react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  GADAI_PRICING,
  bagiSewaModalGadai,
  quoteGadai,
  rencanaBayarGadai,
  sewaModalBerikutnya,
} from "@/lib/gadai";
import { formatRupiah, parseRupiah } from "@/lib/money";
import { namaHurufBesar } from "@/lib/nama";

import type { GadaiDanaRow, PilihanPendanaGadai } from "./types";

/** Kartu penetapan hitungan gadai internal; tidak mencatat pencairan atau penitipan. */
export function GadaiDanaCard({
  pawn,
  kandidatPendana,
}: {
  pawn: GadaiDanaRow;
  kandidatPendana: PilihanPendanaGadai[];
}) {
  const setDana = useMutation(api.gadai.setDanaGadai);
  const aktifkan = useMutation(api.loans.aktifkanGadai);
  const tetapkanPendana = useMutation(api.gadai.tetapkanPendanaGadai);
  const catatPembayaran = useMutation(api.gadai.catatPembayaranGadai);
  const rincian = useQuery(api.gadai.rincianPembayaranGadai, { pawnId: pawn._id });

  const [pokok, setPokok] = useState("");
  const [persen, setPersen] = useState(String(GADAI_PRICING.sewaModalMinPercent));
  const [busy, setBusy] = useState(false);
  const [mengaktifkan, setMengaktifkan] = useState(false);
  const [danaTerpilih, setDanaTerpilih] = useState("");
  const [menyimpanPendana, setMenyimpanPendana] = useState(false);
  const [cicil, setCicil] = useState("");
  const [hanyaSewa, setHanyaSewa] = useState(false);
  const [referensi, setReferensi] = useState("");
  const [mencatat, setMencatat] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsedPokok = (() => {
    if (pokok.trim() === "") return null;
    try {
      return parseRupiah(pokok);
    } catch {
      return null;
    }
  })();
  const persenNum = Number(persen.replace(",", "."));
  const persenValid =
    Number.isFinite(persenNum) &&
    persenNum >= GADAI_PRICING.sewaModalMinPercent &&
    persenNum <= GADAI_PRICING.sewaModalMaxPercent;
  const quote =
    parsedPokok !== null && persenValid ? quoteGadai(parsedPokok, persenNum) : null;
  const batasLtv =
    pawn.hargaPasar !== null && pawn.hargaPasar > 0
      ? Math.round((pawn.hargaPasar * GADAI_PRICING.ltvMaxPercent) / 100)
      : null;
  const pokokMelebihiLtv =
    parsedPokok !== null && batasLtv !== null && parsedPokok > batasLtv;

  const belumDana = pawn.pokokGadai === undefined;
  const sisa = rincian?.sisaPokok ?? pawn.sisaPokok ?? pawn.pokokGadai ?? 0;
  const persenBerlaku =
    rincian?.persenSewaModal ?? pawn.persenSewaModal ?? GADAI_PRICING.sewaModalMinPercent;
  const pendanaNama = rincian?.pendanaNama ?? pawn.pendanaNama ?? null;
  const adaPendana = rincian
    ? rincian.pendanaId !== null
    : pawn.pendanaId != null;
  const pendanaTerkunci = (rincian?.riwayat.length ?? 0) > 0;
  const nilaiPendana =
    danaTerpilih || rincian?.pendanaId || pawn.pendanaId || "";
  const sewaBerikut =
    rincian != null
      ? rincian.sewaBerikut
      : sisa > 0
        ? sewaModalBerikutnya(sisa, persenBerlaku)
        : 0;
  const bagiSewa = bagiSewaModalGadai(sewaBerikut);
  const porsiPendanaBerikut =
    rincian?.porsiPendanaBerikut ?? (adaPendana ? bagiSewa.pendana : 0);
  const porsiPlatformBerikut =
    rincian?.porsiPlatformBerikut ?? (adaPendana ? bagiSewa.platform : sewaBerikut);

  const parsedCicil = (() => {
    if (hanyaSewa || cicil.trim() === "") return 0;
    try {
      return parseRupiah(cicil);
    } catch {
      return null;
    }
  })();
  const cicilMelebihi =
    !hanyaSewa && parsedCicil !== null && sisa > 0 && parsedCicil > sisa;
  const rencana =
    parsedCicil === null || sisa <= 0 || cicilMelebihi
      ? null
      : (() => {
          try {
            return rencanaBayarGadai(sisa, persenBerlaku, {
              cicilPokok: parsedCicil,
              bayarHanyaSewa: hanyaSewa,
            });
          } catch {
            return null;
          }
        })();
  const bagiBayar = rencana !== null ? bagiSewaModalGadai(rencana.sewaDibayar) : null;
  const porsiPendanaBayar =
    bagiBayar === null ? 0 : adaPendana ? bagiBayar.pendana : 0;
  const porsiPlatformBayar =
    bagiBayar === null ? 0 : rencana!.sewaDibayar - porsiPendanaBayar;

  const jalankanAktif = async () => {
    setMengaktifkan(true);
    setError(null);
    try {
      await aktifkan({ pawnId: pawn._id });
      toast.success(
        "Gadai ditandai berjalan pada ledger internal; dana tetap di luar aplikasi.",
      );
    } catch (e) {
      setError(
        e instanceof Error
          ? `Penandaan gadai gagal: ${e.message}.`
          : "Penandaan gadai gagal.",
      );
    } finally {
      setMengaktifkan(false);
    }
  };

  const jalankan = async () => {
    setBusy(true);
    setError(null);
    try {
      if (parsedPokok === null || !persenValid) {
        throw new Error("Isi pokok acuan dan sewa modal 5–10% yang valid.");
      }
      if (pokokMelebihiLtv && batasLtv !== null) {
        throw new Error(
          `Pokok melebihi batas hitung aplikasi 70% (${formatRupiah(batasLtv)}) dari harga yang dicantumkan ${formatRupiah(pawn.hargaPasar ?? 0)}.`,
        );
      }
      await setDana({
        pawnId: pawn._id,
        pokokGadai: parsedPokok,
        persenSewaModal: persenNum,
      });
      toast.success("Hitungan internal gadai tersimpan pada ledger internal.");
    } catch (e) {
      setError(
        e instanceof Error
          ? `Penyimpanan hitungan internal gagal: ${e.message}.`
          : "Penyimpanan hitungan internal gagal.",
      );
    } finally {
      setBusy(false);
    }
  };

  const simpanPendana = async () => {
    setMenyimpanPendana(true);
    setError(null);
    try {
      if (nilaiPendana === "") {
        throw new Error("Pilih penyedia dana terlebih dahulu.");
      }
      const hasil = await tetapkanPendana({
        pawnId: pawn._id,
        danaId: nilaiPendana as Id<"users">,
      });
      setDanaTerpilih("");
      toast.success(
        `Pendana ${hasil.pendanaNama} tercatat. Porsi 47/60 berlaku untuk sewa modal periode berikutnya.`,
      );
    } catch (e) {
      setError(
        e instanceof Error
          ? `Penetapan pendana gagal: ${e.message}.`
          : "Penetapan pendana gagal.",
      );
    } finally {
      setMenyimpanPendana(false);
    }
  };

  const simpanPembayaran = async () => {
    setMencatat(true);
    setError(null);
    try {
      if (rencana === null) {
        throw new Error("Isi cicilan pokok yang valid atau pilih bayar sewa saja.");
      }
      const hasil = await catatPembayaran({
        pawnId: pawn._id,
        cicilPokok: rencana.pokokDicicil,
        bayarHanyaSewa: hanyaSewa,
        referensi: referensi.trim() === "" ? undefined : referensi.trim(),
      });
      setCicil("");
      setReferensi("");
      setHanyaSewa(false);
      toast.success(
        `Pembayaran dicatat. Pendana ${formatRupiah(hasil.porsiPendana)}, platform ${formatRupiah(hasil.porsiPlatform)}; sisa pokok ${formatRupiah(hasil.sisaPokokSetelah)}.`,
      );
    } catch (e) {
      setError(
        e instanceof Error
          ? `Pencatatan pembayaran gagal: ${e.message}.`
          : "Pencatatan pembayaran gagal.",
      );
    } finally {
      setMencatat(false);
    }
  };

  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{pawn.deskripsiBarang}</p>
          <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
            {pawn.nomorReferensi} · {namaHurufBesar(pawn.namaLengkap)}
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          Taksiran internal{" "}
          <span className="tabular-nums">
            {pawn.nilaiTaksiran !== undefined
              ? formatRupiah(pawn.nilaiTaksiran)
              : "belum diisi"}
          </span>
          {batasLtv !== null ? (
            <>
              {" "}
              · batas hitung 70%{" "}
              <span className="tabular-nums">{formatRupiah(batasLtv)}</span>
            </>
          ) : null}
        </p>
      </div>

      {belumDana ? (
        <div className="mt-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={`pokok-${pawn._id}`}>Pokok gadai (rupiah bulat)</Label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  Rp
                </span>
                <Input
                  id={`pokok-${pawn._id}`}
                  inputMode="numeric"
                  className="pl-9 tabular-nums"
                  value={pokok}
                  onChange={(e) => setPokok(e.target.value)}
                  onBlur={() => {
                    if (parsedPokok !== null) {
                      setPokok(formatRupiah(parsedPokok).replace("Rp ", ""));
                    }
                  }}
                  placeholder={
                    batasLtv !== null
                      ? formatRupiah(batasLtv).replace("Rp ", "")
                      : "5.000.000"
                  }
                  disabled={busy}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`persen-${pawn._id}`}>Sewa modal (% per 30 hari)</Label>
              <Input
                id={`persen-${pawn._id}`}
                inputMode="decimal"
                className="tabular-nums"
                value={persen}
                onChange={(e) => setPersen(e.target.value)}
                placeholder="5"
                disabled={busy}
              />
            </div>
          </div>

          {quote !== null && (
            <p className="text-xs leading-5 text-emerald-800">
              Nilai bersih{" "}
              <b className="tabular-nums">
                {formatRupiah(quote.danaBersihDitransfer)}
              </b>{" "}
              (99%), potongan muka{" "}
              <span className="tabular-nums">{formatRupiah(quote.potonganDiMuka)}</span>{" "}
              (1%), sewa modal periode pertama{" "}
              <span className="tabular-nums">{formatRupiah(quote.sewaModalPeriode)}</span>.
            </p>
          )}

          {pokokMelebihiLtv && batasLtv !== null && (
            <p className="text-xs font-medium text-destructive">
              Pokok melebihi batas hitung aplikasi 70% ({formatRupiah(batasLtv)}) dari
              harga yang dicantumkan {formatRupiah(pawn.hargaPasar ?? 0)}.
            </p>
          )}
        </div>
      ) : (
        <>
          <p className="mt-4 text-xs leading-5 text-emerald-800">
            Pokok acuan internal{" "}
            <b className="tabular-nums">{formatRupiah(pawn.pokokGadai ?? 0)}</b> · sewa
            modal <b>{pawn.persenSewaModal ?? GADAI_PRICING.sewaModalMinPercent}%</b>/30
            hari. Data ini mengikuti pencatatan ledger internal.
          </p>

          {(pawn.status === "disetujui" || pawn.status === "aktif") && (
            <div className="mt-4 rounded-xl border border-emerald-200/80 bg-white/70 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">Penyedia dana gadai</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Satu gadai ditanggung satu pendana. Penetapan hanya mencatat
                    kepemilikan, bukan bukti pencairan.
                  </p>
                </div>
                <p className="text-xs font-medium">
                  {pendanaNama ?? "Modal platform"}
                </p>
              </div>

              {pendanaTerkunci ? (
                <p className="mt-3 rounded-lg border border-emerald-200/70 bg-emerald-50/60 px-3 py-2 text-xs leading-5 text-emerald-800">
                  Pendana terkunci karena sudah ada pembayaran tercatat.
                  Pembayaran lama tidak menyimpan id pemilik, jadi penggantian
                  akan membuat hak lama terbaca sebagai milik pendana baru.
                </p>
              ) : kandidatPendana.length === 0 ? (
                <p className="mt-3 text-xs leading-5 text-muted-foreground">
                  Belum ada akun penyedia dana. Beri akses lewat panel Kelola
                  Investor terlebih dahulu.
                </p>
              ) : (
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <Select
                    value={nilaiPendana}
                    onValueChange={setDanaTerpilih}
                    disabled={menyimpanPendana}
                  >
                    <SelectTrigger
                      className="w-full sm:max-w-xs"
                      aria-label={`Penyedia dana untuk ${pawn.nomorReferensi}`}
                    >
                      <SelectValue placeholder="Pilih penyedia dana" />
                    </SelectTrigger>
                    <SelectContent>
                      {kandidatPendana.map((p) => (
                        <SelectItem key={p.userId} value={p.userId}>
                          {p.nama}
                          {p.aksesAktif ? "" : " (peran lama)"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    className="rounded-md"
                    disabled={
                      menyimpanPendana ||
                      nilaiPendana === "" ||
                      nilaiPendana === (rincian?.pendanaId ?? pawn.pendanaId ?? "")
                    }
                    onClick={() => void simpanPendana()}
                  >
                    {menyimpanPendana ? (
                      <Loader2 className="mr-2 size-4 animate-spin" />
                    ) : null}
                    Simpan pendana
                  </Button>
                </div>
              )}

              {rincian === undefined ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  Memuat rincian pembayaran...
                </p>
              ) : rincian === null ? (
                <p className="mt-3 text-xs text-destructive">
                  Rincian gadai tidak ditemukan. Muat ulang panel.
                </p>
              ) : sisa > 0 ? (
                <p className="mt-3 text-xs leading-5 text-emerald-800">
                  Sewa modal periode berikutnya{" "}
                  <b className="tabular-nums">{formatRupiah(sewaBerikut)}</b>. Pendana{" "}
                  <b className="tabular-nums">{formatRupiah(porsiPendanaBerikut)}</b>{" "}
                  (78,33%), platform{" "}
                  <span className="tabular-nums">{formatRupiah(porsiPlatformBerikut)}</span>{" "}
                  (21,67%), di luar biaya layanan.
                </p>
              ) : (
                <p className="mt-3 text-xs leading-5 text-emerald-800">
                  Sisa pokok Rp0. Gadai siap dilepas setelah barang benar-benar
                  dikembalikan.
                </p>
              )}

              {adaPendana && rincian !== null && rincian !== undefined && (
                <p className="mt-2 text-xs text-muted-foreground tabular-nums">
                  Tercatat untuk pendana: {formatRupiah(rincian.totalPorsiPendana)} ·
                  platform: {formatRupiah(rincian.totalPorsiPlatform)}
                </p>
              )}
            </div>
          )}

          {pawn.status === "aktif" && sisa > 0 && (
            <div className="mt-3 rounded-xl border border-emerald-200/80 bg-white/70 p-4">
              <p className="text-sm font-semibold">Catat pembayaran diterima</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Angka dihitung dari sisa pokok {formatRupiah(sisa)} dengan sewa{" "}
                {persenBerlaku}%. Isi cicilan pokok, atau centang bayar sewa saja.
              </p>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor={`cicil-${pawn._id}`}>Cicilan pokok (opsional)</Label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                      Rp
                    </span>
                    <Input
                      id={`cicil-${pawn._id}`}
                      inputMode="numeric"
                      className="pl-9 tabular-nums"
                      value={hanyaSewa ? "" : cicil}
                      onChange={(e) => setCicil(e.target.value)}
                      onBlur={() => {
                        if (parsedCicil !== null && parsedCicil > 0) {
                          setCicil(formatRupiah(parsedCicil).replace("Rp ", ""));
                        }
                      }}
                      placeholder="0"
                      disabled={hanyaSewa || mencatat}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`referensi-${pawn._id}`}>Referensi mutasi (opsional)</Label>
                  <Input
                    id={`referensi-${pawn._id}`}
                    value={referensi}
                    onChange={(e) => setReferensi(e.target.value)}
                    placeholder="Mis. TRF-20261026-001"
                    maxLength={200}
                    disabled={mencatat}
                  />
                </div>
              </div>

              <label className="mt-3 flex min-h-11 items-start gap-2 text-xs leading-5">
                <Checkbox
                  checked={hanyaSewa}
                  onCheckedChange={(v) => setHanyaSewa(v === true)}
                  disabled={mencatat}
                  className="mt-0.5"
                />
                <span>
                  Bayar sewa modal saja, pokok tidak berkurang. Tenor diperpanjang
                  30 hari.
                </span>
              </label>

              {cicilMelebihi && (
                <p className="mt-3 text-xs font-medium text-destructive">
                  Cicilan melebihi sisa pokok {formatRupiah(sisa)}. Kurangi nominal
                  atau centang bayar sewa saja.
                </p>
              )}
              {!hanyaSewa && parsedCicil === null && (
                <p className="mt-3 text-xs font-medium text-destructive">
                  Nominal cicilan tidak valid. Isi angka rupiah bulat atau kosongkan.
                </p>
              )}

              {rencana !== null && (
                <div className="mt-3 space-y-1 rounded-lg border border-emerald-200/70 bg-emerald-50/60 px-3 py-2 text-xs leading-5">
                  <p>
                    Total diterima{" "}
                    <b className="tabular-nums">{formatRupiah(rencana.totalBayar)}</b>: pokok{" "}
                    <span className="tabular-nums">{formatRupiah(rencana.pokokDicicil)}</span>,
                    sewa{" "}
                    <span className="tabular-nums">{formatRupiah(rencana.sewaDibayar)}</span>.
                  </p>
                  <p>
                    Pendana{" "}
                    <b className="tabular-nums">{formatRupiah(porsiPendanaBayar)}</b>,
                    platform{" "}
                    <span className="tabular-nums">{formatRupiah(porsiPlatformBayar)}</span>.
                    Sisa pokok menjadi{" "}
                    <span className="tabular-nums">{formatRupiah(rencana.sisaPokokSetelah)}</span>.
                  </p>
                </div>
              )}

              <Button
                className="mt-3 rounded-md"
                disabled={mencatat || rencana === null}
                onClick={() => void simpanPembayaran()}
              >
                {mencatat ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                Catat pembayaran
              </Button>
            </div>
          )}

          {pawn.status === "disetujui" && (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button
                className="gradient-primary rounded-md border-0"
                disabled={mengaktifkan}
                onClick={() => void jalankanAktif()}
              >
                {mengaktifkan ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                Tandai gadai berjalan (ledger internal)
              </Button>
              <p className="text-xs leading-5 text-emerald-800">
                Pencairan dan penyerahan dana tetap ditangani di luar aplikasi.
              </p>
            </div>
          )}

          {rincian !== undefined &&
            rincian !== null &&
            rincian.riwayat.length > 0 && (
              <details className="mt-3 rounded-xl border border-emerald-200/80 bg-white/60 px-4 py-3">
                <summary className="cursor-pointer text-xs font-medium">
                  Riwayat pembayaran ({rincian.riwayat.length})
                </summary>
                <ul className="mt-3 space-y-2">
                  {rincian.riwayat.map((p) => (
                    <li
                      key={p._id}
                      className="border-t border-emerald-200/60 pt-2 text-xs leading-5 first:border-t-0 first:pt-0"
                    >
                      <p className="font-medium tabular-nums">
                        {new Date(p.waktu).toLocaleString("id-ID", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                        {p.referensi !== null ? ` · ${p.referensi}` : ""}
                      </p>
                      <p className="tabular-nums text-muted-foreground">
                        Pokok {formatRupiah(p.pokokDicicil)} · sewa{" "}
                        {formatRupiah(p.sewaDibayar)} · sisa{" "}
                        {formatRupiah(p.sisaPokokSetelah)}
                      </p>
                      <p className="tabular-nums text-muted-foreground">
                        Pendana{" "}
                        {p.porsiPendana === null ? "belum dipisah" : formatRupiah(p.porsiPendana)}{" "}
                        · platform{" "}
                        {p.porsiPlatform === null
                          ? "belum dipisah"
                          : formatRupiah(p.porsiPlatform)}
                      </p>
                    </li>
                  ))}
                </ul>
              </details>
            )}
        </>
      )}

      {error && (
        <p className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {belumDana && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button
            className="gradient-primary rounded-md border-0"
            disabled={busy || parsedPokok === null || !persenValid || pokokMelebihiLtv}
            onClick={() => void jalankan()}
          >
            {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            Simpan hitungan internal
          </Button>
        </div>
      )}
    </div>
  );
}
