import { useMutation, useQuery } from "convex/react";
import {
  CalendarClock,
  Cpu,
  Gem,
  Gift,
  Loader2,
  RefreshCw,
  Settings2,
  Ticket,
  Trophy,
  Wallet,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

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
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  BATAS_NILAI_HADIAH_DOORPRIZE,
  LABEL_KATEGORI_HADIAH,
  NILAI_HADIAH_MINIMUM,
  PRESET_HADIAH_DOORPRIZE,
  nilaiHadiahValid,
  type KategoriHadiah,
} from "@/lib/doorprize";
import { formatRupiah } from "@/lib/money";

function tanggal(ms: number): string {
  return new Date(ms).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Sisa waktu sampai pengundian; sama dengan hitungan di dashboard. */
function sisaWaktu(target: number, sekarang: number): string {
  const sisa = Math.max(0, target - sekarang);
  const hari = Math.floor(sisa / 86_400_000);
  const jam = Math.floor((sisa % 86_400_000) / 3_600_000);
  if (sisa === 0) return "Pengundian dibuka hari ini";
  if (hari > 0) return `${hari} hari ${jam} jam lagi`;
  const menit = Math.max(1, Math.floor((sisa % 3_600_000) / 60_000));
  return jam > 0 ? `${jam} jam ${menit} menit lagi` : `${menit} menit lagi`;
}

/** Ikon kategori hadiah — relevan dengan bendanya, bukan dekorasi. */
const IKON_HADIAH: Record<KategoriHadiah, typeof Gem> = {
  GOLD: Gem,
  ELECTRONICS: Cpu,
  VOUCHER: Wallet,
  OTHER: Gift,
};

/**
 * Panel admin Doorprize triwulanan + antrean auto-matching.
 *
 * Hierarki mengikuti pekerjaan admin: periode dan tanggal pengundian lebih dulu,
 * lalu hadiah kuartal (yang bisa diubah lewat dialog preset), rekap tiket, dan
 * tindakan mengundi. Undian hanya dibuka pada hari pengundian resmi; sebelum
 * itu tombolnya menjelaskan kapan dibuka alih-alih diam-diam gagal di server.
 */
export function UndianPanel() {
  const ringkasan = useQuery(api.doorprize.ringkasanAdmin, {});
  const antrean = useQuery(api.matchingQueue.ringkasanAntrean, {});
  const acak = useMutation(api.doorprize.acakPemenang);
  const catatSerah = useMutation(api.doorprize.catatPenyerahanHadiah);
  const simpanHadiah = useMutation(api.doorprize.simpanHadiahKuartal);
  const tandai = useMutation(api.matchingQueue.tandaiTersalurkan);

  const [mengundi, setMengundi] = useState(false);
  const [konfirmasi, setKonfirmasi] = useState(false);
  const [sekarang, setSekarang] = useState(() => Date.now());
  const [dialogHadiah, setDialogHadiah] = useState(false);
  const [kategori, setKategori] = useState<KategoriHadiah>("GOLD");
  const [namaHadiah, setNamaHadiah] = useState("");
  const [nilaiHadiah, setNilaiHadiah] = useState("");
  const [menyimpanHadiah, setMenyimpanHadiah] = useState(false);
  const [galatHadiah, setGalatHadiah] = useState<string | null>(null);
  const [catatanSerah, setCatatanSerah] = useState("");
  const [menyimpanSerah, setMenyimpanSerah] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setSekarang(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const nilaiAngka = Number(nilaiHadiah);
  const hadiahValid =
    namaHadiah.trim().length >= 3 && nilaiHadiah.trim() !== "" && nilaiHadiahValid(nilaiAngka);

  function bukaDialogHadiah() {
    const hadiah = ringkasan?.hadiah;
    setKategori(hadiah?.kategori ?? "GOLD");
    setNamaHadiah(hadiah?.nama ?? "");
    setNilaiHadiah(hadiah === undefined ? "" : String(hadiah.nilaiPerkiraan));
    setGalatHadiah(null);
    setDialogHadiah(true);
  }

  async function simpan() {
    if (!hadiahValid) return;
    setMenyimpanHadiah(true);
    setGalatHadiah(null);
    try {
      const hasil = await simpanHadiah({
        kategori,
        nama: namaHadiah.trim(),
        nilai: nilaiAngka,
      });
      toast.success(`Hadiah ${hasil.kode} disimpan: ${hasil.nama}.`);
      setDialogHadiah(false);
    } catch (error) {
      setGalatHadiah(error instanceof Error ? error.message : "Hadiah gagal disimpan.");
    } finally {
      setMenyimpanHadiah(false);
    }
  }

  async function undi() {
    setMengundi(true);
    try {
      const hasil = await acak({});
      toast.success(
        `Pemenang ${hasil.kode}: ${hasil.nama} (${hasil.peran}) — ${hasil.hadiah}.`,
      );
      setKonfirmasi(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Pengundian gagal.");
    } finally {
      setMengundi(false);
    }
  }

  async function salurkan(id: Id<"matchingQueue">) {
    try {
      await tandai({ id });
      toast.success("Dana ditandai sudah tersalurkan.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal menandai dana.");
    }
  }

  async function simpanPenyerahan() {
    const pemenang = ringkasan?.pemenang;
    if (!pemenang) return;
    setMenyimpanSerah(true);
    try {
      await catatSerah({
        undianId: pemenang.id as Id<"doorprizeUndian">,
        ...(catatanSerah.trim() === "" ? {} : { catatan: catatanSerah.trim() }),
      });
      toast.success("Penyerahan hadiah dicatat.");
      setCatatanSerah("");
    } catch (galat) {
      toast.error(
        galat instanceof Error ? galat.message : "Penyerahan hadiah gagal dicatat.",
      );
    } finally {
      setMenyimpanSerah(false);
    }
  }

  const hadiah = ringkasan?.hadiah;
  const IkonHadiah = IKON_HADIAH[hadiah?.kategori ?? "GOLD"];
  const sudahDiundi = ringkasan?.pemenang != null;
  const terkunciWaktu = ringkasan !== undefined && !ringkasan.bisaDiundi;
  const bisaTekanUndi =
    ringkasan !== undefined && ringkasan.bisaDiundi && !sudahDiundi && !mengundi;

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* ===== Kepala periode: label kuartal, tanggal pengundian, tindakan ===== */}
      <section className="rounded-2xl border border-amber-200/80 bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-800">
              <Trophy className="size-3.5" aria-hidden /> Periode triwulan (
              {ringkasan === undefined ? "…" : ringkasan.labelPeriode})
            </p>
            <h2 className="mt-1 font-display text-lg leading-6 text-slate-900">
              Doorprize {ringkasan === undefined ? "…" : ringkasan.labelPeriode}
            </h2>
            <p className="mt-0.5 text-xs leading-5 text-slate-600">
              {ringkasan === undefined
                ? "Memuat periode…"
                : `${ringkasan.labelRentang} · Undian Kuartal ${ringkasan.quarter}: ${ringkasan.labelTanggalUndian}`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span
              className={
                bisaTekanUndi
                  ? "inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-800"
                  : "inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600"
              }
            >
              <CalendarClock className="size-3.5" aria-hidden />
              {ringkasan === undefined
                ? "Memuat…"
                : sudahDiundi
                  ? "Sudah diundi"
                  : ringkasan.bisaDiundi
                    ? "Pengundian dibuka"
                    : sisaWaktu(ringkasan.tanggalUndian, sekarang)}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={bukaDialogHadiah}
              disabled={ringkasan === undefined}
            >
              <Settings2 className="size-3.5" aria-hidden /> Atur hadiah kuartal
            </Button>
            {!konfirmasi ? (
              <Button
                type="button"
                size="sm"
                onClick={() => setKonfirmasi(true)}
                disabled={!bisaTekanUndi}
                title={
                  sudahDiundi
                    ? `Pemenang ${ringkasan?.labelPeriode} sudah tercatat.`
                    : terkunciWaktu
                      ? `Pengundian dibuka pada ${ringkasan?.labelTanggalUndian}.`
                      : "Pilih satu pemenang acak dari tiket aktif kuartal ini."
                }
                className="gap-1.5 bg-emerald-800 text-white hover:bg-emerald-900 disabled:bg-slate-200 disabled:text-slate-500"
              >
                <Trophy className="size-3.5" aria-hidden /> Acak pemenang
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setKonfirmasi(false)}
                  disabled={mengundi}
                >
                  Batal
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void undi()}
                  disabled={mengundi}
                  className="gap-1.5 bg-amber-700 text-white hover:bg-amber-800"
                >
                  {mengundi ? (
                    <Loader2 className="size-3.5 animate-spin" aria-hidden />
                  ) : (
                    <Ticket className="size-3.5" aria-hidden />
                  )}
                  Undi sekarang
                </Button>
              </>
            )}
          </div>
        </div>

        {terkunciWaktu && !sudahDiundi && (
          <p className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] leading-5 text-slate-600">
            Pengundian {ringkasan?.labelPeriode} baru dibuka pada{" "}
            {ringkasan?.labelTanggalUndian}. Selama kuartal berjalan, tiket terus
            bertambah dari pelunasan tepat waktu dan penempatan dana.
          </p>
        )}

        {konfirmasi && !sudahDiundi && (
          <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-900">
            Pemenang dipilih acak dari {ringkasan?.tiketAktif ?? 0} tiket aktif{" "}
            {ringkasan?.labelPeriode} dan tercatat permanen. Tindakan ini tidak bisa
            dibatalkan; kuartal berikutnya mulai dari 0 tiket.
          </p>
        )}
      </section>

      {/* ===== Hadiah kuartal + rekap tiket ===== */}
      <section className="grid gap-3 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-800">
              <IkonHadiah className="size-4" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                Hadiah utama · {ringkasan?.hadiah.labelKategori ?? "…"}
              </p>
              <p className="mt-0.5 text-sm font-semibold leading-5 text-slate-900">
                {hadiah?.nama ?? "Memuat hadiah…"}
              </p>
              <p className="mt-0.5 text-xs text-slate-600">
                Nilai perkiraan{" "}
                <span className="font-semibold tabular-nums text-slate-900">
                  {hadiah === undefined ? "—" : formatRupiah(hadiah.nilaiPerkiraan)}
                </span>
                {hadiah !== undefined && (
                  <span className="ml-1.5 text-[11px] text-emerald-800">
                    di bawah {formatRupiah(BATAS_NILAI_HADIAH_DOORPRIZE)}
                  </span>
                )}
              </p>
              <p className="mt-1 text-[11px] leading-5 text-slate-500">
                {hadiah?.diatur
                  ? "Dipilih admin untuk kuartal ini."
                  : "Masih preset bawaan; atur hadiah sebelum pengundian."}
              </p>
            </div>
          </div>

          <p className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] leading-5 text-slate-600">
            {ringkasan?.catatanAnggaran ??
              "Pengundian dilakukan 3 bulan sekali. Alokasikan hadiah hemat anggaran (< Rp1.000.000) untuk menjaga margin operasional platform."}
          </p>
          <p className="mt-2 text-[11px] leading-5 text-slate-500">
            {ringkasan?.teksKetentuan ?? ""}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-slate-200 bg-white px-3 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
              Tiket aktif
            </p>
            <p className="mt-0.5 text-xl font-semibold tabular-nums text-slate-900">
              {ringkasan === undefined ? "—" : ringkasan.tiketAktif}
            </p>
            <p className="text-[11px] leading-4 text-slate-500">
              {ringkasan === undefined
                ? "Memuat…"
                : `${ringkasan.tiketPeminjam} peminjam · ${ringkasan.tiketPendana} pendana`}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-3 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
              Peserta
            </p>
            <p className="mt-0.5 text-xl font-semibold tabular-nums text-slate-900">
              {ringkasan === undefined ? "—" : ringkasan.jumlahPeserta}
            </p>
            <p className="text-[11px] leading-4 text-slate-500">akun dengan tiket sah</p>
          </div>
          <div className="col-span-2 rounded-2xl border border-slate-200 bg-white px-3 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
              Jendela pengundian
            </p>
            <p className="mt-0.5 text-sm font-semibold text-slate-900">
              {ringkasan === undefined
                ? "…"
                : `${ringkasan.labelTanggalUndian} · ${ringkasan.labelPeriode}`}
            </p>
            <p className="text-[11px] leading-4 text-slate-500">
              {ringkasan === undefined
                ? ""
                : sudahDiundi
                  ? `Diundi ${tanggal(ringkasan.pemenang!.diundiPada)} — ${ringkasan.pemenang!.jumlahTiket} tiket, ${ringkasan.pemenang!.jumlahPeserta} peserta.`
                  : ringkasan.bisaDiundi
                    ? "Hari pengundian sudah tiba. Tiket berhenti bertambah setelah undian dijalankan."
                    : `Tiket dihitung sampai ${ringkasan.labelTanggalUndian}.`}
            </p>
          </div>
        </div>
      </section>

      {ringkasan?.pemenang && (
        <section className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-xs leading-5 text-emerald-900">
          <p>
            Pemenang {ringkasan.labelPeriode}: <strong>{ringkasan.pemenang.nama}</strong> (
            {ringkasan.pemenang.peran}) — {ringkasan.pemenang.hadiah}, diundi{" "}
            {tanggal(ringkasan.pemenang.diundiPada)} dari {ringkasan.pemenang.jumlahTiket}{" "}
            tiket.
          </p>

          {ringkasan.pemenang.hadiahDiserahkanPada !== null ? (
            <p className="mt-2 border-t border-emerald-200 pt-2 text-emerald-800">
              Hadiah dicatat diserahkan{" "}
              {tanggal(ringkasan.pemenang.hadiahDiserahkanPada)}
              {ringkasan.pemenang.catatanPenyerahan === null
                ? "."
                : ` — ${ringkasan.pemenang.catatanPenyerahan}.`}
            </p>
          ) : (
            <div className="mt-2 border-t border-emerald-200 pt-2">
              <Label htmlFor="catatan-serah" className="text-[11px] text-emerald-900">
                Catatan penyerahan (opsional)
              </Label>
              <div className="mt-1 flex flex-wrap gap-2">
                <Input
                  id="catatan-serah"
                  className="h-8 min-w-48 flex-1 bg-white text-xs"
                  maxLength={200}
                  placeholder="Kurir, nomor resi, atau lokasi serah terima"
                  value={catatanSerah}
                  onChange={(e) => setCatatanSerah(e.target.value)}
                />
                <Button
                  type="button"
                  size="sm"
                  className="gap-1.5 bg-emerald-800 text-white hover:bg-emerald-900"
                  disabled={menyimpanSerah}
                  onClick={() => void simpanPenyerahan()}
                >
                  {menyimpanSerah ? (
                    <Loader2 className="size-3.5 animate-spin" aria-hidden />
                  ) : (
                    <Gift className="size-3.5" aria-hidden />
                  )}
                  Catat diserahkan
                </Button>
              </div>
              <p className="mt-1 text-[10px] leading-4 text-emerald-800">
                Tanggal dicatat sekali dan tidak bisa ditimpa — bukti kapan hadiah benar-benar
                sampai. Hadiah undian tetap objek pajak penerima; simpan bukti penyerahan untuk
                pelaporan.
              </p>
            </div>
          )}
        </section>
      )}

      {/* ===== Antrean auto-matching ===== */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Antrean auto-matching</h2>
            <p className="mt-1 text-xs leading-5 text-slate-600">
              Pokok pinjaman 7/14 hari yang sudah lunas kembali ke pool dan siap
              disalurkan ke peminjam berikutnya.
            </p>
          </div>
          <div className="text-right">
            <p className="text-lg font-semibold tabular-nums text-emerald-800">
              {antrean === undefined ? "—" : formatRupiah(antrean.totalTersedia)}
            </p>
            <p className="text-[11px] text-slate-500">
              {antrean === undefined
                ? "Memuat…"
                : `${antrean.jumlahTersedia} entri menunggu · ${antrean.sudahTersalurkan} sudah tersalurkan`}
            </p>
          </div>
        </div>

        {antrean === undefined ? (
          <p className="mt-4 text-xs text-muted-foreground">Memuat antrean dana…</p>
        ) : antrean.tersedia.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-center text-xs text-slate-500">
            Belum ada dana yang kembali ke pool. Antrean terisi otomatis saat pinjaman
            7 atau 14 hari dilunasi.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
            {antrean.tersedia.map((baris) => (
              <li
                key={baris.id}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-xs"
              >
                <span className="min-w-0">
                  <span className="block font-medium text-slate-800">
                    {baris.nomorReferensi}
                  </span>
                  <span className="block text-[11px] text-slate-500">
                    {formatRupiah(baris.pokok)} · tenor {baris.tenorHari} hari · kembali{" "}
                    {tanggal(baris.tersediaPada)}
                  </span>
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void salurkan(baris.id)}
                  className="gap-1.5"
                >
                  <RefreshCw className="size-3.5" aria-hidden /> Tandai tersalurkan
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ===== Dialog hadiah kuartal ===== */}
      <Dialog open={dialogHadiah} onOpenChange={setDialogHadiah}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Atur hadiah {ringkasan?.labelPeriode ?? "kuartal ini"}
            </DialogTitle>
            <DialogDescription>
              Satu hadiah utama per kuartal. Nilai wajib di bawah{" "}
              {formatRupiah(BATAS_NILAI_HADIAH_DOORPRIZE)} agar anggaran operasional
              tetap sehat.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                Preset terkurasi
              </p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {PRESET_HADIAH_DOORPRIZE.map((preset) => {
                  const dipilih =
                    namaHadiah.trim() === preset.nama && nilaiAngka === preset.nilai;
                  const Ikon = IKON_HADIAH[preset.kategori];
                  return (
                    <button
                      key={preset.nama}
                      type="button"
                      aria-pressed={dipilih}
                      onClick={() => {
                        setKategori(preset.kategori);
                        setNamaHadiah(preset.nama);
                        setNilaiHadiah(String(preset.nilai));
                        setGalatHadiah(null);
                      }}
                      className={
                        dipilih
                          ? "rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-left"
                          : "rounded-xl border border-slate-200 bg-white px-3 py-2 text-left transition-colors hover:border-amber-300 hover:bg-amber-50/40"
                      }
                    >
                      <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">
                        <Ikon className="size-3" aria-hidden />
                        {LABEL_KATEGORI_HADIAH[preset.kategori]}
                      </span>
                      <span className="mt-0.5 block text-xs font-semibold leading-4 text-slate-900">
                        {preset.nama}
                      </span>
                      <span className="mt-0.5 block text-[11px] leading-4 text-slate-500">
                        {formatRupiah(preset.nilai)} · {preset.ringkas}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_9rem]">
              <div className="min-w-0">
                <label
                  htmlFor="nama-hadiah-doorprize"
                  className="text-[11px] font-semibold text-slate-800"
                >
                  Nama hadiah
                </label>
                <Input
                  id="nama-hadiah-doorprize"
                  className="mt-1 h-9 bg-white text-xs"
                  value={namaHadiah}
                  maxLength={80}
                  placeholder="Mis. Emas Antam 0,5 gram"
                  onChange={(e) => {
                    setNamaHadiah(e.target.value);
                    setGalatHadiah(null);
                  }}
                />
              </div>
              <div>
                <label
                  htmlFor="nilai-hadiah-doorprize"
                  className="text-[11px] font-semibold text-slate-800"
                >
                  Nilai perkiraan
                </label>
                <Input
                  id="nilai-hadiah-doorprize"
                  type="number"
                  inputMode="numeric"
                  min={NILAI_HADIAH_MINIMUM}
                  max={BATAS_NILAI_HADIAH_DOORPRIZE - 1}
                  step={10_000}
                  className="mt-1 h-9 bg-white text-xs tabular-nums"
                  value={nilaiHadiah}
                  onChange={(e) => {
                    setNilaiHadiah(e.target.value);
                    setGalatHadiah(null);
                  }}
                />
              </div>
            </div>

            <div className="max-w-xs">
              <label
                htmlFor="kategori-hadiah-doorprize"
                className="text-[11px] font-semibold text-slate-800"
              >
                Kategori
              </label>
              <Select
                value={kategori}
                onValueChange={(value) => setKategori(value as KategoriHadiah)}
              >
                <SelectTrigger
                  id="kategori-hadiah-doorprize"
                  className="mt-1 h-9 bg-white text-xs"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(LABEL_KATEGORI_HADIAH) as KategoriHadiah[]).map((nilai) => (
                    <SelectItem key={nilai} value={nilai} className="text-xs">
                      {LABEL_KATEGORI_HADIAH[nilai]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <p
              className={
                hadiahValid
                  ? "text-[11px] leading-5 text-emerald-800"
                  : "text-[11px] leading-5 text-amber-800"
              }
            >
              {nilaiHadiah.trim() === ""
                ? `Isi nilai antara ${formatRupiah(NILAI_HADIAH_MINIMUM)} dan di bawah ${formatRupiah(BATAS_NILAI_HADIAH_DOORPRIZE)}.`
                : hadiahValid
                  ? `Nilai ${formatRupiah(nilaiAngka)} memenuhi batas anggaran kuartal.`
                  : `Nilai harus ${formatRupiah(NILAI_HADIAH_MINIMUM)} sampai di bawah ${formatRupiah(BATAS_NILAI_HADIAH_DOORPRIZE)}.`}
            </p>

            <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] leading-5 text-slate-600">
              {ringkasan?.catatanAnggaran ??
                "Pengundian dilakukan 3 bulan sekali. Alokasikan hadiah hemat anggaran (< Rp1.000.000) untuk menjaga margin operasional platform."}
            </p>

            {galatHadiah !== null && (
              <p role="alert" className="text-[11px] font-medium leading-5 text-red-700">
                {galatHadiah}
              </p>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDialogHadiah(false)}
              disabled={menyimpanHadiah}
            >
              Batal
            </Button>
            <Button
              type="button"
              onClick={() => void simpan()}
              disabled={menyimpanHadiah || !hadiahValid}
              className="gap-1.5 bg-emerald-800 text-white hover:bg-emerald-900 disabled:bg-slate-200 disabled:text-slate-500"
            >
              {menyimpanHadiah ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
              ) : (
                <Gift className="size-3.5" aria-hidden />
              )}
              Simpan hadiah
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
