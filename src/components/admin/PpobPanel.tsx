/**
 * Panel admin PPOB publik.
 *
 * Tiga pekerjaan, satu layar:
 *  1. Pesanan — verifikasi transfer lalu kirim topup ke server pulsa. Tombol
 *     "Verifikasi & proses" menjalankan keduanya berurutan supaya admin tidak
 *     bolak-balik membuka detail.
 *  2. Produk — harga modal dari provider, harga jual, dan sakelar tampil.
 *     Sinkron harian tidak menimpa harga manual; tombol "Terapkan markup"
 *     yang menyeragamkan.
 *  3. Pengaturan — provider, alamat server, markup, dan status kredensial.
 *
 * Yang TIDAK ditampilkan di sini: API key. Panel hanya melaporkan apakah
 * `PPOB_H2H_API_KEY` sudah diisi; nilainya tetap di environment.
 */
import { useAction, useMutation, useQuery } from "convex/react";
import {
  BarChart3,
  Check,
  Clock,
  Copy,
  Download,
  ExternalLink,
  Info,
  Loader2,
  Package,
  RefreshCw,
  Search,
  Send,
  Settings2,
  ShieldAlert,
  Wallet,
} from "lucide-react";
import { useState } from "react";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { FunctionReturnType } from "convex/server";

import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import {
  KATEGORI_PPOB,
  LABEL_KATEGORI_PPOB,
  LABEL_STATUS_PPOB,
  NADA_STATUS_PPOB,
  STATUS_PESANAN_PPOB,
  type StatusPesananPpob,
} from "@/lib/ppob";
import { kelompokkanDigit, formatRupiahAman } from "@/lib/money";
import { formatDate } from "./admin-format";
import { cn } from "@/lib/utils";

type TabPpob = "pesanan" | "produk" | "laporan" | "pengaturan";

/** Kunci kolom markup per kategori; `tokenListrik` mengikuti nama di skema. */
const KUNCI_MARKUP = ["pulsa", "data", "tokenListrik", "game", "ewallet"] as const;
type KunciMarkup = (typeof KUNCI_MARKUP)[number];

const LABEL_MARKUP: Record<KunciMarkup, string> = {
  pulsa: "Pulsa",
  data: "Paket data",
  tokenListrik: "Token listrik",
  game: "Voucher game",
  ewallet: "E-wallet",
};

const FILTER_STATUS: Array<{ nilai: "semua" | StatusPesananPpob; label: string }> = [
  { nilai: "semua", label: "Semua" },
  ...STATUS_PESANAN_PPOB.map((status) => ({
    nilai: status,
    label: LABEL_STATUS_PPOB[status],
  })),
];

const KELAS_NADA: Record<string, string> = {
  menunggu: "border-amber-200 bg-amber-50 text-amber-800",
  proses: "border-sky-200 bg-sky-50 text-sky-800",
  sukses: "border-emerald-200 bg-emerald-50 text-emerald-800",
  gagal: "border-red-200 bg-red-50 text-red-700",
};

function waktu(ts: number): string {
  return new Date(ts).toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function BadgeStatus({ status }: { status: StatusPesananPpob }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold",
        KELAS_NADA[NADA_STATUS_PPOB[status]],
      )}
    >
      {LABEL_STATUS_PPOB[status]}
    </span>
  );
}

function KartuAngka({
  label,
  nilai,
  nada = "netral",
}: {
  label: string;
  nilai: string;
  nada?: "netral" | "emas" | "hijau";
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-2 text-xl font-semibold tabular-nums",
          nada === "emas" ? "text-amber-700" : nada === "hijau" ? "text-emerald-700" : "text-navy",
        )}
      >
        {nilai}
      </p>
    </div>
  );
}

/** Dialog alasan pembatalan/refund — satu formulir untuk dua tindakan. */
function DialogBatal({
  pesanan,
  mode,
  onClose,
}: {
  pesanan: Doc<"ppobPesanan"> | null;
  mode: "batal" | "refund";
  onClose: () => void;
}) {
  const batalkan = useMutation(api.ppob.batalkanPesanan);
  const refund = useMutation(api.ppob.tandaiRefund);
  const [alasan, setAlasan] = useState("");
  const [sibuk, setSibuk] = useState(false);

  const kirim = async () => {
    if (pesanan === null) return;
    setSibuk(true);
    try {
      if (mode === "batal") await batalkan({ id: pesanan._id, alasan });
      else await refund({ id: pesanan._id, catatan: alasan });
      toast.success(mode === "batal" ? "Pesanan dibatalkan." : "Refund tercatat.");
      setAlasan("");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menyimpan.");
    } finally {
      setSibuk(false);
    }
  };

  return (
    <Dialog
      open={pesanan !== null}
      onOpenChange={(terbuka) => {
        if (!terbuka) {
          setAlasan("");
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {mode === "batal" ? "Batalkan pesanan" : "Tandai dana dikembalikan"}
          </DialogTitle>
          <DialogDescription>
            {pesanan?.kodePesanan} · {pesanan?.namaProduk}.{" "}
            {mode === "batal"
              ? "Pesanan yang sudah dibayar akan berstatus refund, bukan gagal."
              : "Pastikan transfer balik benar-benar sudah dilakukan."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="alasan-ppob">
            {mode === "batal" ? "Alasan pembatalan" : "Catatan refund"}
          </Label>
          <Textarea
            id="alasan-ppob"
            rows={3}
            value={alasan}
            onChange={(e) => setAlasan(e.target.value)}
            placeholder={
              mode === "batal"
                ? "mis. nomor tujuan salah; pembeli minta dibatalkan"
                : "mis. ditransfer balik ke rekening pengirim, 28 Okt 14.10"
            }
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={sibuk}>
            Batal
          </Button>
          <Button
            onClick={() => void kirim()}
            disabled={sibuk || alasan.trim().length < 4}
            className="bg-red-600 text-white hover:bg-red-700"
          >
            {sibuk ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null}
            {mode === "batal" ? "Batalkan pesanan" : "Catat refund"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Dialog ubah harga jual satu produk. */
function DialogHarga({
  produk,
  onClose,
}: {
  produk: Doc<"ppobProduk"> | null;
  onClose: () => void;
}) {
  const setHarga = useMutation(api.ppob.setHargaJual);
  const [nilai, setNilai] = useState("");
  const [sibuk, setSibuk] = useState(false);
  const angka = Number(nilai.replace(/\D/g, "")) || 0;

  const kirim = async () => {
    if (produk === null) return;
    setSibuk(true);
    try {
      await setHarga({ id: produk._id, hargaJual: angka });
      toast.success("Harga jual diperbarui.");
      onClose();
      setNilai("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menyimpan harga.");
    } finally {
      setSibuk(false);
    }
  };

  return (
    <Dialog
      open={produk !== null}
      onOpenChange={(terbuka) => {
        if (!terbuka) {
          setNilai("");
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ubah harga jual</DialogTitle>
          <DialogDescription>
            {produk?.nama} · modal {produk ? formatRupiahAman(produk.hargaModal) : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="harga-jual-ppob">Harga jual (Rp)</Label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
              Rp
            </span>
            <Input
              id="harga-jual-ppob"
              inputMode="numeric"
              className="pl-9 tabular-nums"
              value={nilai}
              onChange={(e) => setNilai(kelompokkanDigit(e.target.value))}
              placeholder={produk ? String(produk.hargaJual) : ""}
            />
          </div>
          <p className="text-[11px] leading-5 text-muted-foreground">
            Harga manual dipertahankan saat provider menaikkan modal, kecuali sudah
            tidak lagi menutup modal. Minimal {produk ? formatRupiahAman(produk.hargaModal) : "-"}.
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={sibuk}>
            Batal
          </Button>
          <Button
            onClick={() => void kirim()}
            disabled={sibuk || angka <= 0 || (produk !== null && angka < produk.hargaModal)}
          >
            {sibuk ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null}
            Simpan harga
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PpobPanel() {
  const [tab, setTab] = useState<TabPpob>("pesanan");
  const pengaturan = useQuery(api.ppob.getPengaturan, {});
  const ringkasan = useQuery(api.ppob.ringkasanPpob, {});
  const laporan = useQuery(api.ppob.laporanPpob, {});
  const [statusFilter, setStatusFilter] = useState<"semua" | StatusPesananPpob>("semua");
  const pesanan = useQuery(api.ppob.daftarPesananAdmin, {
    status: statusFilter === "semua" ? undefined : statusFilter,
  });
  const [cari, setCari] = useState("");
  const [kategori, setKategori] = useState("semua");
  const produk = useQuery(api.ppob.daftarProdukAdmin, {
    cari: cari.trim() === "" ? undefined : cari.trim(),
    kategori: kategori === "semua" ? undefined : kategori,
  });

  const tarikHarga = useAction(api.ppobH2h.tarikHarga);
  const cekSaldo = useAction(api.ppobH2h.cekSaldo);
  const proses = useAction(api.ppobH2h.prosesPesanan);
  const cekStatus = useAction(api.ppobH2h.cekStatusPesanan);
  const tandaiDibayar = useMutation(api.ppob.tandaiDibayar);
  const setAktifProduk = useMutation(api.ppob.setProdukAktif);
  const hitungUlang = useMutation(api.ppob.hitungUlangHarga);

  const [sibuk, setSibuk] = useState<string | null>(null);
  const [dialogBatal, setDialogBatal] = useState<{
    pesanan: Doc<"ppobPesanan">;
    mode: "batal" | "refund";
  } | null>(null);
  const [dialogHarga, setDialogHarga] = useState<Doc<"ppobProduk"> | null>(null);

  const jalankan = async (kunci: string, kerja: () => Promise<unknown>, sukses: string) => {
    setSibuk(kunci);
    try {
      await kerja();
      toast.success(sukses);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Tindakan gagal.");
    } finally {
      setSibuk(null);
    }
  };

  const verifikasiDanProses = async (pesananId: Id<"ppobPesanan">) => {
    setSibuk(`proses-${pesananId}`);
    try {
      await tandaiDibayar({ id: pesananId });
      const hasil = await proses({ id: pesananId });
      if (hasil.ok) toast.success("Pembayaran diverifikasi dan pesanan dikirim ke provider.");
      else toast.warning(hasil.pesan ?? "Pesanan dikirim, tetapi provider belum memberi status final.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal memproses pesanan.");
    } finally {
      setSibuk(null);
    }
  };

  const salin = async (teks: string, label: string) => {
    try {
      await navigator.clipboard.writeText(teks);
      toast.success(`${label} disalin.`);
    } catch {
      toast.error("Peramban menolak akses papan klip.");
    }
  };

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-semibold text-navy">
              <Wallet className="size-4 text-emerald-700" aria-hidden />
              PPOB publik
            </p>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
              Etalase tunai di luar akad pinjaman: pembeli memilih produk, transfer, lalu
              admin mengirim topup ke server pulsa. Laba adalah selisih harga jual dan
              harga modal mitra.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                pengaturan?.aktif
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-slate-200 bg-slate-50 text-slate-600",
              )}
            >
              <span className={cn("size-1.5 rounded-full", pengaturan?.aktif ? "bg-emerald-500" : "bg-slate-400")} />
              {pengaturan?.aktif ? "Etalase dibuka" : "Etalase ditutup"}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
              {pengaturan?.provider === "kustom" ? "Server kustom" : "Digiflazz"}
            </span>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KartuAngka label="Menunggu bayar" nilai={ringkasan ? `${ringkasan.menunggu}` : "—"} nada="emas" />
          <KartuAngka label="Siap diproses" nilai={ringkasan ? `${ringkasan.dibayar + ringkasan.diproses}` : "—"} />
          <KartuAngka label="Selesai" nilai={ringkasan ? `${ringkasan.sukses}` : "—"} nada="hijau" />
          <KartuAngka
            label="Laba tercatat"
            nilai={ringkasan ? formatRupiahAman(ringkasan.laba) : "—"}
            nada="hijau"
          />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-10"
            disabled={sibuk === "tarik" || pengaturan === undefined}
            onClick={() =>
              void jalankan("tarik", () => tarikHarga({}), "Daftar harga ditarik dari provider.")
            }
          >
            {sibuk === "tarik" ? (
              <Loader2 className="mr-1.5 size-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-1.5 size-4" />
            )}
            Tarik harga
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-10"
            disabled={sibuk === "saldo" || pengaturan === undefined}
            onClick={() =>
              void jalankan("saldo", () => cekSaldo({}), "Saldo provider diperbarui.")
            }
          >
            {sibuk === "saldo" ? (
              <Loader2 className="mr-1.5 size-4 animate-spin" />
            ) : (
              <Wallet className="mr-1.5 size-4" />
            )}
            Cek saldo
          </Button>
          {pengaturan?.saldoTerakhir !== null && pengaturan?.saldoTerakhir !== undefined ? (
            <span className="inline-flex items-center gap-1.5 self-center text-[11px] text-muted-foreground">
              <Clock className="size-3.5" />
              Saldo {formatRupiahAman(pengaturan.saldoTerakhir)}
              {pengaturan.saldoDiperbaruiPada
                ? ` · ${waktu(pengaturan.saldoDiperbaruiPada)}`
                : ""}
            </span>
          ) : null}
        </div>

        {pengaturan !== undefined && !pengaturan.kredensialSiap ? (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
            <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <p>
              <strong>PPOB_H2H_API_KEY belum diisi.</strong> Etalase boleh tampil, tetapi
              tombol tarik harga dan proses pesanan akan gagal sampai kunci ditambahkan di
              menu Keys. Username dibaca dari panel ini atau dari{" "}
              <code className="rounded bg-white/70 px-1">PPOB_H2H_USERNAME</code>.
            </p>
          </div>
        ) : null}
      </section>

      <div className="flex flex-wrap gap-1.5 rounded-xl border border-slate-200 bg-white p-1.5">
        {(
          [
            ["pesanan", "Pesanan", Send],
            ["produk", "Produk", Package],
            ["laporan", "Laporan", BarChart3],
            ["pengaturan", "Pengaturan", Settings2],
          ] as const
        ).map(([nilai, label, Ikon]) => (
          <button
            key={nilai}
            type="button"
            onClick={() => setTab(nilai)}
            aria-pressed={tab === nilai}
            className={cn(
              "inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors",
              tab === nilai
                ? "bg-[#064E3B] text-white"
                : "text-slate-600 hover:bg-slate-100 hover:text-navy",
            )}
          >
            <Ikon className="size-3.5" aria-hidden />
            {label}
          </button>
        ))}
      </div>

      {tab === "pesanan" ? (
        <section className="space-y-3">
          <div className="no-scrollbar flex gap-1.5 overflow-x-auto pb-1">
            {FILTER_STATUS.map((item) => (
              <button
                key={item.nilai}
                type="button"
                onClick={() => setStatusFilter(item.nilai)}
                aria-pressed={statusFilter === item.nilai}
                className={cn(
                  "shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors",
                  statusFilter === item.nilai
                    ? "border-[#064E3B] bg-[#064E3B] text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>

          {pesanan === undefined ? (
            <p className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-muted-foreground">
              Memuat pesanan…
            </p>
          ) : pesanan.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
              <p className="text-sm font-semibold text-navy">Belum ada pesanan di filter ini.</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Pesanan baru dari halaman /ppob akan muncul di sini begitu pembeli menekan
                pesan.
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <div className="hidden grid-cols-[1.1fr_1.4fr_0.9fr_0.9fr_1.1fr] gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 lg:grid">
                <span>Pesanan</span>
                <span>Produk & tujuan</span>
                <span>Nominal</span>
                <span>Status</span>
                <span className="text-right">Tindakan</span>
              </div>
              <div className="divide-y divide-slate-100">
                {pesanan.map((item) => {
                  const status = item.status as StatusPesananPpob;
                  const kunci = `proses-${item._id}`;
                  const sedangSibuk = sibuk === kunci;
                  return (
                    <div
                      key={item._id}
                      className="grid gap-3 px-4 py-3 transition-colors hover:bg-slate-50 lg:grid-cols-[1.1fr_1.4fr_0.9fr_0.9fr_1.1fr] lg:items-center"
                    >
                      <div className="min-w-0">
                        <p className="font-mono text-xs font-semibold text-slate-800">
                          {item.kodePesanan}
                        </p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {waktu(item.dibuatPada)} · {item.namaPembeli ?? "Tanpa nama"}
                        </p>
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-900">
                          {item.namaProduk}
                        </p>
                        <p className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">
                          {item.nomorTujuan} · WA {item.whatsapp}
                        </p>
                        {item.sn ? (
                          <p className="mt-1 break-all rounded bg-emerald-50 px-1.5 py-0.5 font-mono text-[10px] text-emerald-800">
                            SN {item.sn}
                          </p>
                        ) : null}
                      </div>
                      <div className="text-sm tabular-nums text-slate-900">
                        {formatRupiahAman(item.hargaJual)}
                        <p className="text-[10px] text-emerald-700">
                          laba {formatRupiahAman(item.laba)}
                        </p>
                      </div>
                      <div>
                        <BadgeStatus status={status} />
                        {item.pesanProvider ? (
                          <p className="mt-1 line-clamp-2 text-[10px] leading-4 text-muted-foreground">
                            {item.pesanProvider}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap justify-start gap-1.5 lg:justify-end">
                        {status === "menunggu_bayar" ? (
                          <Button
                            size="sm"
                            className="h-8 bg-[#064E3B] px-2.5 text-[11px] text-white hover:bg-[#021E17]"
                            disabled={sedangSibuk}
                            onClick={() => void verifikasiDanProses(item._id)}
                          >
                            {sedangSibuk ? (
                              <Loader2 className="mr-1 size-3.5 animate-spin" />
                            ) : (
                              <Check className="mr-1 size-3.5" />
                            )}
                            Verifikasi & proses
                          </Button>
                        ) : null}
                        {status === "dibayar" || status === "diproses" ? (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 px-2.5 text-[11px]"
                              disabled={sibuk === kunci}
                              onClick={() =>
                                void jalankan(
                                  kunci,
                                  () => proses({ id: item._id }),
                                  "Permintaan topup dikirim.",
                                )
                              }
                            >
                              {sibuk === kunci ? (
                                <Loader2 className="mr-1 size-3.5 animate-spin" />
                              ) : (
                                <ExternalLink className="mr-1 size-3.5" />
                              )}
                              Proses
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 px-2 text-[11px]"
                              disabled={sibuk === `cek-${item._id}`}
                              onClick={() =>
                                void jalankan(
                                  `cek-${item._id}`,
                                  () => cekStatus({ id: item._id }),
                                  "Status diperiksa.",
                                )
                              }
                            >
                              {sibuk === `cek-${item._id}` ? (
                                <Loader2 className="mr-1 size-3.5 animate-spin" />
                              ) : (
                                <RefreshCw className="mr-1 size-3.5" />
                              )}
                              Cek
                            </Button>
                          </>
                        ) : null}
                        {status !== "sukses" && status !== "refund" && status !== "diproses" ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 px-2 text-[11px] text-red-600 hover:bg-red-50 hover:text-red-700"
                            onClick={() =>
                              setDialogBatal({
                                pesanan: item,
                                mode: status === "gagal" ? "refund" : "batal",
                              })
                            }
                          >
                            {status === "gagal" ? "Refund" : "Batalkan"}
                          </Button>
                        ) : null}
                        <a
                          href={`https://wa.me/${item.whatsapp.replace(/^0/, "62")}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex h-8 items-center rounded-md px-2 text-[11px] font-medium text-slate-600 hover:bg-slate-100"
                          aria-label={`Kirim WhatsApp ke ${item.whatsapp}`}
                        >
                          WA
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      ) : null}

      {tab === "produk" ? (
        <section className="space-y-3">
          <div className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-3 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={cari}
                onChange={(e) => setCari(e.target.value)}
                placeholder="Cari nama produk, mis. Telkomsel 10.000"
                className="min-h-11 pl-9"
                aria-label="Cari produk PPOB"
              />
            </div>
            <Select value={kategori} onValueChange={setKategori}>
              <SelectTrigger className="min-h-11 sm:w-48" aria-label="Filter kategori produk">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="semua">Semua kategori</SelectItem>
                {KATEGORI_PPOB.map((item) => (
                  <SelectItem key={item} value={item}>
                    {LABEL_KATEGORI_PPOB[item]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              className="min-h-11"
              disabled={sibuk === "markup"}
              onClick={() =>
                void jalankan(
                  "markup",
                  () => hitungUlang({}),
                  "Markup diterapkan ke seluruh produk.",
                )
              }
            >
              {sibuk === "markup" ? (
                <Loader2 className="mr-1.5 size-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-1.5 size-4" />
              )}
              Terapkan markup
            </Button>
          </div>

          <p className="text-[11px] leading-5 text-muted-foreground">
            {pengaturan?.jumlahProduk ?? 0} produk tersimpan ·{" "}
            {pengaturan?.jumlahProdukTersedia ?? 0} tersedia di provider (daftar di bawah
            menampilkan maksimal 500 terbaru)
            {pengaturan?.terakhirSinkron
              ? ` · sinkron terakhir ${formatDate(pengaturan.terakhirSinkron)}`
              : " · belum pernah sinkron"}
            . Menarik harga mengganti daftar dari provider; harga manual dipertahankan
            selama masih di atas modal.
          </p>

          {produk === undefined ? (
            <p className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-muted-foreground">
              Memuat produk…
            </p>
          ) : produk.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
              <p className="text-sm font-semibold text-navy">Belum ada produk.</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Tekan “Tarik harga” setelah kredensial H2H tersimpan. Produk yang muncul
                mengikuti daftar provider, lengkap dengan harga modalnya.
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <div className="hidden grid-cols-[1.6fr_1fr_0.8fr_0.8fr_0.6fr] gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 md:grid">
                <span>Produk</span>
                <span>Kategori</span>
                <span>Modal</span>
                <span>Harga jual</span>
                <span className="text-right">Tampil</span>
              </div>
              <div className="divide-y divide-slate-100">
                {produk.map((item) => (
                  <div
                    key={item._id}
                    className="grid gap-2 px-4 py-3 transition-colors hover:bg-slate-50 md:grid-cols-[1.6fr_1fr_0.8fr_0.8fr_0.6fr] md:items-center"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900">{item.nama}</p>
                      <p className="font-mono text-[10px] text-muted-foreground">
                        {item.kode}
                        {item.operator ? ` · ${item.operator}` : ""}
                      </p>
                    </div>
                    <p className="text-xs text-slate-600">
                      {LABEL_KATEGORI_PPOB[item.kategori]}
                    </p>
                    <p className="text-xs tabular-nums text-slate-600">
                      {formatRupiahAman(item.hargaModal)}
                    </p>
                    <button
                      type="button"
                      onClick={() => setDialogHarga(item)}
                      className="w-fit rounded-md text-left text-xs font-semibold tabular-nums text-emerald-800 underline decoration-dotted underline-offset-4 hover:text-emerald-950"
                    >
                      {formatRupiahAman(item.hargaJual)}
                      {item.hargaManual ? (
                        <span className="ml-1 text-[10px] font-normal text-slate-500">manual</span>
                      ) : null}
                    </button>
                    <div className="flex items-center justify-start gap-2 md:justify-end">
                      {!item.tersedia ? (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                          Kosong
                        </span>
                      ) : null}
                      <Switch
                        checked={item.aktif}
                        onCheckedChange={(aktif) =>
                          void jalankan(
                            `aktif-${item._id}`,
                            () => setAktifProduk({ id: item._id, aktif }),
                            aktif ? "Produk ditampilkan." : "Produk disembunyikan.",
                          )
                        }
                        aria-label={`Tampilkan ${item.nama}`}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      ) : null}

      {tab === "laporan" ? <LaporanPpob laporan={laporan} /> : null}

      {tab === "pengaturan" ? (
        <FormPengaturan
          pengaturan={pengaturan}
          onSalin={salin}
        />
      ) : null}

      <DialogBatal
        pesanan={dialogBatal?.pesanan ?? null}
        mode={dialogBatal?.mode ?? "batal"}
        onClose={() => setDialogBatal(null)}
      />
      <DialogHarga produk={dialogHarga} onClose={() => setDialogHarga(null)} />
    </div>
  );
}

type DataLaporan = FunctionReturnType<typeof api.ppob.laporanPpob>;

/** Satu sel CSV; tanda kutip digandakan, pemisah memakai titik koma (Excel ID). */
function selCsv(nilai: string | number): string {
  const teks = String(nilai).replace(/"/g, '""');
  return /[";\n]/.test(teks) ? `"${teks}"` : teks;
}

function csvLaporanPpob(data: DataLaporan): string {
  const baris: string[] = [
    "Bagian;Kategori;Pesanan;Sukses;Gagal;Omzet;Laba",
    ["Hari ini", "Semua", data.hariIni.pesanan, data.hariIni.sukses, data.hariIni.gagal, data.hariIni.omzet, data.hariIni.laba]
      .map(selCsv)
      .join(";"),
    ["Bulan ini", "Semua", data.bulanIni.pesanan, data.bulanIni.sukses, data.bulanIni.gagal, data.bulanIni.omzet, data.bulanIni.laba]
      .map(selCsv)
      .join(";"),
    ...data.perKategori.map((item) =>
      ["Bulan ini", LABEL_KATEGORI_PPOB[item.kategori], item.pesanan, item.sukses, item.gagal, item.omzet, item.laba]
        .map(selCsv)
        .join(";"),
    ),
    "",
    "Pesanan gagal/refund bulan ini",
    "Kode;Produk;Tujuan;Nominal;Status;Tanggal;Pesan provider",
    ...data.daftarGagal.map((item) =>
      [
        item.kodePesanan,
        item.namaProduk,
        item.nomorTujuan,
        item.hargaJual,
        LABEL_STATUS_PPOB[item.status as StatusPesananPpob],
        waktu(item.dibuatPada),
        item.pesanProvider,
      ]
        .map(selCsv)
        .join(";"),
    ),
  ];
  return baris.join("\n");
}

/** Rekap laba PPOB + daftar pesanan yang tidak menghasilkan. */
function LaporanPpob({ laporan }: { laporan: DataLaporan | undefined }) {
  if (laporan === undefined) {
    return (
      <p className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-muted-foreground">
        Memuat laporan…
      </p>
    );
  }

  const unduh = () => {
    const isi = `\uFEFF${csvLaporanPpob(laporan)}`;
    const blob = new Blob([isi], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const tautan = document.createElement("a");
    tautan.href = url;
    tautan.download = `laporan-ppob-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(tautan);
    tautan.click();
    tautan.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-navy">
            <BarChart3 className="size-4 text-emerald-700" aria-hidden />
            Laporan laba PPOB
          </p>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
            Laba diakui hanya dari pesanan selesai; omzet mengikuti pesanan yang sama supaya
            angkanya bisa dicocokkan dengan uang yang benar-benar diterima.
          </p>
        </div>
        <Button variant="outline" size="sm" className="min-h-10" onClick={unduh}>
          <Download className="mr-1.5 size-4" aria-hidden />
          Unduh CSV
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KartuAngka label="Laba hari ini" nilai={formatRupiahAman(laporan.hariIni.laba)} nada="hijau" />
        <KartuAngka label="Omzet hari ini" nilai={formatRupiahAman(laporan.hariIni.omzet)} />
        <KartuAngka label="Laba bulan ini" nilai={formatRupiahAman(laporan.bulanIni.laba)} nada="hijau" />
        <KartuAngka label="Omzet bulan ini" nilai={formatRupiahAman(laporan.bulanIni.omzet)} />
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="hidden grid-cols-[1.2fr_0.7fr_0.7fr_0.7fr_1fr_1fr] gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 sm:grid">
          <span>Kategori</span>
          <span>Pesanan</span>
          <span>Sukses</span>
          <span>Gagal</span>
          <span>Omzet</span>
          <span className="text-right">Laba</span>
        </div>
        <div className="divide-y divide-slate-100">
          {laporan.perKategori.map((item) => (
            <div
              key={item.kategori}
              className="grid gap-1 px-4 py-3 text-xs sm:grid-cols-[1.2fr_0.7fr_0.7fr_0.7fr_1fr_1fr] sm:items-center"
            >
              <span className="text-sm font-medium text-slate-900">
                {LABEL_KATEGORI_PPOB[item.kategori]}
              </span>
              <span className="tabular-nums text-slate-600">{item.pesanan}</span>
              <span className="tabular-nums text-emerald-700">{item.sukses}</span>
              <span className="tabular-nums text-slate-600">{item.gagal}</span>
              <span className="tabular-nums text-slate-700">{formatRupiahAman(item.omzet)}</span>
              <span className="tabular-nums font-semibold text-emerald-800 sm:text-right">
                {formatRupiahAman(item.laba)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {laporan.terbatas ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-900">
          Angka bulan ini dihitung dari 3.000 pesanan terbaru. Untuk bulan yang sangat ramai,
          unduh CSV lalu cocokkan dengan mutasi saldo provider.
        </p>
      ) : null}

      <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <p className="text-sm font-semibold text-navy">Pesanan gagal / refund bulan ini</p>
        {laporan.daftarGagal.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Tidak ada pesanan gagal atau refund bulan ini.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
            {laporan.daftarGagal.map((item) => (
              <li key={item.kodePesanan} className="flex flex-wrap items-start justify-between gap-2 py-2.5">
                <div className="min-w-0">
                  <p className="font-mono text-[11px] font-semibold text-slate-800">
                    {item.kodePesanan}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-slate-600">
                    {item.namaProduk} · {item.nomorTujuan} · {waktu(item.dibuatPada)}
                  </p>
                  {item.pesanProvider ? (
                    <p className="mt-0.5 line-clamp-2 text-[10px] leading-4 text-muted-foreground">
                      {item.pesanProvider}
                    </p>
                  ) : null}
                </div>
                <div className="text-right">
                  <p className="text-xs font-semibold tabular-nums text-slate-800">
                    {formatRupiahAman(item.hargaJual)}
                  </p>
                  <BadgeStatus status={item.status as StatusPesananPpob} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

type DataPengaturan = FunctionReturnType<typeof api.ppob.getPengaturan>;

/**
 * Formulir pengaturan dengan draf lokal.
 *
 * Draf `null` berarti "ikuti data server", sehingga perubahan dari perangkat
 * lain langsung terlihat tanpa menimpa ketikan yang sedang berjalan.
 */
function FormPengaturan({
  pengaturan,
  onSalin,
}: {
  pengaturan: DataPengaturan | undefined;
  onSalin: (teks: string, label: string) => Promise<void>;
}) {
  const simpan = useMutation(api.ppob.simpanPengaturan);
  const [draf, setDraf] = useState<{
    aktif: boolean;
    provider: string;
    baseUrl: string;
    username: string;
    markupPersen: string;
    markupMin: string;
    markupKategori: Record<KunciMarkup, string>;
    nomorAdminWa: string;
    saldoMinimum: string;
    instruksi: string;
  } | null>(null);
  const [sibuk, setSibuk] = useState(false);

  if (pengaturan === undefined) {
    return (
      <p className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-muted-foreground">
        Memuat pengaturan…
      </p>
    );
  }

  const nilai =
    draf ?? {
      aktif: pengaturan.aktif,
      provider: pengaturan.provider,
      baseUrl: pengaturan.baseUrl,
      username: pengaturan.username,
      markupPersen: String(pengaturan.markupPersen),
      markupMin: kelompokkanDigit(String(pengaturan.markupMin)),
      markupKategori: Object.fromEntries(
        KUNCI_MARKUP.map((kunci) => [
          kunci,
          pengaturan.markupKategori?.[kunci] === undefined
            ? ""
            : String(pengaturan.markupKategori[kunci]),
        ]),
      ) as Record<KunciMarkup, string>,
      nomorAdminWa: pengaturan.nomorAdminWa,
      saldoMinimum: kelompokkanDigit(String(pengaturan.saldoMinimum)),
      instruksi: pengaturan.instruksi,
    };
  const ubah = (patch: Partial<typeof nilai>) =>
    setDraf({ ...nilai, ...patch });

  const kirim = async () => {
    const markupKategori: Partial<Record<KunciMarkup, number>> = {};
    for (const kunci of KUNCI_MARKUP) {
      const teks = nilai.markupKategori[kunci].trim();
      if (teks === "") continue;
      const angka = Number(teks.replace(",", "."));
      if (!Number.isFinite(angka)) {
        toast.error(`Markup ${LABEL_MARKUP[kunci]} harus berupa angka.`);
        return;
      }
      markupKategori[kunci] = angka;
    }
    setSibuk(true);
    try {
      await simpan({
        aktif: nilai.aktif,
        provider: nilai.provider,
        baseUrl: nilai.baseUrl,
        username: nilai.username,
        markupPersen: Number(nilai.markupPersen.replace(",", ".")) || 0,
        markupMin: Number(nilai.markupMin.replace(/\D/g, "")) || 0,
        markupKategori,
        nomorAdminWa: nilai.nomorAdminWa.trim(),
        saldoMinimum: Number(nilai.saldoMinimum.replace(/\D/g, "")) || 0,
        instruksi: nilai.instruksi,
      });
      setDraf(null);
      toast.success("Pengaturan PPOB tersimpan.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menyimpan pengaturan.");
    } finally {
      setSibuk(false);
    }
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div>
            <p className="text-sm font-semibold text-navy">Etalase publik</p>
            <p className="text-[11px] leading-5 text-muted-foreground">
              Saat ditutup, halaman /ppob tetap bisa dibaca tetapi pesanan baru ditolak.
            </p>
          </div>
          <Switch
            checked={nilai.aktif}
            onCheckedChange={(aktif) => ubah({ aktif })}
            aria-label="Buka etalase PPOB"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="ppob-provider">Provider H2H</Label>
            <Select
              value={nilai.provider}
              onValueChange={(provider) => ubah({ provider })}
            >
              <SelectTrigger id="ppob-provider">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="digiflazz">Digiflazz</SelectItem>
                <SelectItem value="kustom">Server pulsa sendiri</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ppob-username">Username H2H</Label>
            <Input
              id="ppob-username"
              value={nilai.username}
              onChange={(e) => ubah({ username: e.target.value })}
              placeholder={pengaturan.usernameEnv || "username dari provider"}
              autoComplete="off"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="ppob-base">Alamat server H2H</Label>
          <Input
            id="ppob-base"
            value={nilai.baseUrl}
            onChange={(e) => ubah({ baseUrl: e.target.value })}
            placeholder={
              nilai.provider === "digiflazz"
                ? "kosongkan untuk api.digiflazz.com/v1"
                : "https://h2h.contoh.id"
            }
            inputMode="url"
          />
          <p className="text-[11px] leading-5 text-muted-foreground">
            Wajib HTTPS. Untuk Digiflazz boleh dikosongkan; untuk server sendiri, isi
            alamat yang menyediakan kontrak di docs/ppob-h2h.md.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="ppob-markup">Markup harga jual (%)</Label>
            <Input
              id="ppob-markup"
              inputMode="decimal"
              value={nilai.markupPersen}
              onChange={(e) => ubah({ markupPersen: e.target.value })}
            />
            <p className="text-[11px] leading-5 text-muted-foreground">
              Dihitung dari harga modal, bukan dari harga jual.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ppob-min">Markup minimum (Rp)</Label>
            <Input
              id="ppob-min"
              inputMode="numeric"
              className="tabular-nums"
              value={nilai.markupMin}
              onChange={(e) => ubah({ markupMin: kelompokkanDigit(e.target.value) })}
            />
            <p className="text-[11px] leading-5 text-muted-foreground">
              Menutup biaya transfer; harga jual dibulatkan ke atas ke ratusan rupiah.
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
          <p className="text-sm font-semibold text-navy">Markup per kategori</p>
          <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
            Kosongkan untuk mengikuti markup global. Angka di sini menggantikan tarif
            global untuk kategori itu, bukan menambah di atasnya. Tekan “Terapkan markup”
            di tab Produk setelah mengubahnya.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
            {KUNCI_MARKUP.map((kunci) => (
              <div key={kunci} className="space-y-1.5">
                <Label htmlFor={`ppob-markup-${kunci}`} className="text-[11px]">
                  {LABEL_MARKUP[kunci]} (%)
                </Label>
                <Input
                  id={`ppob-markup-${kunci}`}
                  inputMode="decimal"
                  value={nilai.markupKategori[kunci]}
                  onChange={(e) =>
                    ubah({
                      markupKategori: {
                        ...nilai.markupKategori,
                        [kunci]: e.target.value,
                      },
                    })
                  }
                  placeholder={nilai.markupPersen}
                  className="h-9"
                />
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="ppob-admin-wa">WhatsApp admin</Label>
            <Input
              id="ppob-admin-wa"
              value={nilai.nomorAdminWa}
              onChange={(e) => ubah({ nomorAdminWa: e.target.value })}
              placeholder="6281234567890"
              inputMode="tel"
              autoComplete="off"
            />
            <p className="text-[11px] leading-5 text-muted-foreground">
              Menerima ping pesanan baru dan alarm saldo lewat gateway di menu WhatsApp.
              Format internasional tanpa +.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ppob-saldo-min">Ambang alarm saldo (Rp)</Label>
            <Input
              id="ppob-saldo-min"
              inputMode="numeric"
              className="tabular-nums"
              value={nilai.saldoMinimum}
              onChange={(e) => ubah({ saldoMinimum: kelompokkanDigit(e.target.value) })}
            />
            <p className="text-[11px] leading-5 text-muted-foreground">
              Alarm dikirim paling sering sekali per 12 jam saat saldo provider turun di
              bawah angka ini.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="ppob-instruksi">Instruksi di halaman pembayaran</Label>
          <Textarea
            id="ppob-instruksi"
            rows={3}
            maxLength={500}
            value={nilai.instruksi}
            onChange={(e) => ubah({ instruksi: e.target.value })}
            placeholder="mis. Pesanan diproses 08.00–21.00 WIB. Transfer sesuai nominal, cantumkan kode pesanan."
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
          <p className="text-[11px] text-muted-foreground">
            {draf === null ? "Tidak ada perubahan." : "Ada perubahan yang belum disimpan."}
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setDraf(null)} disabled={sibuk}>
              Urungkan
            </Button>
            <Button
              onClick={() => void kirim()}
              disabled={sibuk}
              className="bg-[#064E3B] text-white hover:bg-[#021E17]"
            >
              {sibuk ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null}
              Simpan pengaturan
            </Button>
          </div>
        </div>
      </section>

      <aside className="space-y-4">
        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-sm font-semibold text-navy">Kredensial</p>
          <dl className="mt-3 space-y-2 text-xs">
            <div className="flex items-center justify-between gap-2">
              <dt className="text-muted-foreground">API key</dt>
              <dd
                className={cn(
                  "font-semibold",
                  pengaturan.kredensialSiap ? "text-emerald-700" : "text-red-600",
                )}
              >
                {pengaturan.kredensialSiap ? "Terpasang" : "Belum diisi"}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-muted-foreground">Username env</dt>
              <dd className="font-mono text-[11px] text-slate-700">
                {pengaturan.usernameEnv || "—"}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-muted-foreground">Webhook</dt>
              <dd
                className={cn(
                  "font-semibold",
                  pengaturan.webhookSiap ? "text-emerald-700" : "text-amber-700",
                )}
              >
                {pengaturan.webhookSiap ? "Siap" : "Rahasia belum diisi"}
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-[11px] leading-5 text-muted-foreground">
            Nama environment: <code className="rounded bg-slate-100 px-1">PPOB_H2H_API_KEY</code>,{" "}
            <code className="rounded bg-slate-100 px-1">PPOB_H2H_USERNAME</code>,{" "}
            <code className="rounded bg-slate-100 px-1">PPOB_H2H_WEBHOOK_SECRET</code>. Nilai
            tidak pernah dikirim ke peramban.
          </p>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-sm font-semibold text-navy">URL webhook</p>
          <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
            Tempelkan di pengaturan webhook provider. Status akhir juga diperiksa ulang
            otomatis tiap 10 menit, jadi pesanan tidak bergantung pada satu callback.
          </p>
          {pengaturan.webhookUrl ? (
            <div className="mt-3 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg bg-slate-100 px-2 py-2 text-[10px] text-slate-700">
                {pengaturan.webhookUrl}
              </code>
              <Button
                size="icon"
                variant="outline"
                className="size-9 shrink-0"
                onClick={() => void onSalin(pengaturan.webhookUrl, "URL webhook")}
                aria-label="Salin URL webhook"
              >
                <Copy className="size-4" />
              </Button>
            </div>
          ) : (
            <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-2 py-2 text-[11px] leading-5 text-amber-900">
              <code>CONVEX_SITE_URL</code> belum terbaca di deployment ini, jadi URL webhook
              belum bisa disusun. Isi manual: <code>https://&lt;deployment&gt;.convex.site/ppob/webhook</code>.
            </p>
          )}
        </section>

        <section className="rounded-2xl border border-sky-200 bg-sky-50/70 p-4 text-[11px] leading-5 text-sky-950">
          <p className="flex items-center gap-1.5 font-semibold">
            <Info className="size-3.5" aria-hidden />
            Setelah kredensial diisi
          </p>
          <ol className="mt-2 list-decimal space-y-1 pl-4">
            <li>Tekan “Tarik harga” untuk mengisi produk.</li>
            <li>Periksa beberapa harga, lalu sesuaikan markup bila perlu.</li>
            <li>Buka etalase, lalu uji satu pesanan nominal kecil.</li>
            <li>Pastikan saldo deposit mencukupi sebelum menerima pesanan ramai.</li>
          </ol>
        </section>
      </aside>
    </div>
  );
}
