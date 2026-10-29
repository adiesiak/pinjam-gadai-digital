/**
 * Etalase PPOB publik — pulsa, paket data, token listrik, voucher game, dan
 * saldo e-wallet.
 *
 * Halaman ini SENGAJA tidak meminta akun: pembeli cukup mengisi nomor tujuan
 * dan WhatsApp. Yang menjaga transaksi tetap aman adalah verifikasi pembayaran
 * oleh admin sebelum topup dikirim, bukan sesi pengguna.
 *
 * Harga yang tampil berasal dari server (`ppobProduk.hargaJual`) dan dibekukan
 * saat pesanan dibuat. Tidak ada perhitungan harga di peramban.
 */
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  Clock,
  Copy,
  Droplets,
  Gamepad2,
  HeartPulse,
  Info,
  Loader2,
  ReceiptText,
  Search,
  ShieldCheck,
  Smartphone,
  Wallet,
  Wifi,
  Zap,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useAction, useMutation, useQuery } from "convex/react";
import { toast } from "sonner";

import { GerbangTurnstile, turnstileDipasang } from "@/components/GerbangTurnstile";
import { VaultLogo } from "@/components/VaultLogo";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/convex/_generated/api";
import {
  HAK_CIPTA_PINDAI,
  NAMA_ENTITAS_PINDAI,
  PENAFIAN_PINDAI,
} from "@/lib/branding";
import { urlChatCs } from "@/lib/kontak";
import { formatRupiahAman } from "@/lib/money";
import {
  KATEGORI_PPOB,
  LABEL_KATEGORI_PPOB,
  LABEL_STATUS_PPOB,
  NADA_STATUS_PPOB,
  idPerangkatPpob,
  kategoriPascabayar,
  nomorTujuanBersih,
  nomorTujuanValid,
  type KategoriPpob,
  type StatusPesananPpob,
} from "@/lib/ppob";
import { formatTanggalWIB, formatWaktuWIB } from "@/lib/waktu";
import { cn } from "@/lib/utils";

const IKON_KATEGORI: Record<KategoriPpob, typeof Smartphone> = {
  pulsa: Smartphone,
  data: Wifi,
  "token-listrik": Zap,
  game: Gamepad2,
  ewallet: Wallet,
  bpjs: HeartPulse,
  pdam: Droplets,
  "pln-pascabayar": ReceiptText,
};

const CONTOH_BELI: Record<KategoriPpob, string> = {
  pulsa: "0812 3456 7890",
  data: "0812 3456 7890",
  "token-listrik": "12 digit nomor meter",
  game: "ID game (server)",
  ewallet: "0812 3456 7890",
  bpjs: "Nomor kartu BPJS",
  pdam: "Nomor pelanggan PDAM",
  "pln-pascabayar": "Nomor meter / ID pelanggan PLN",
};

const LABEL_TUJUAN: Record<KategoriPpob, string> = {
  pulsa: "Nomor HP tujuan",
  data: "Nomor HP tujuan",
  "token-listrik": "Nomor meter / ID pelanggan",
  game: "ID game",
  ewallet: "Nomor akun e-wallet",
  bpjs: "Nomor kartu BPJS",
  pdam: "Nomor pelanggan PDAM",
  "pln-pascabayar": "Nomor meter / ID pelanggan PLN",
};

const KELAS_NADA: Record<string, string> = {
  menunggu: "border-amber-200 bg-amber-50 text-amber-800",
  proses: "border-sky-200 bg-sky-50 text-sky-800",
  sukses: "border-emerald-200 bg-emerald-50 text-emerald-800",
  gagal: "border-red-200 bg-red-50 text-red-700",
};

function BadgeStatus({ status }: { status: StatusPesananPpob }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold",
        KELAS_NADA[NADA_STATUS_PPOB[status]],
      )}
    >
      {LABEL_STATUS_PPOB[status]}
    </span>
  );
}

function salin(teks: string, label: string) {
  void navigator.clipboard
    .writeText(teks)
    .then(() => toast.success(`${label} disalin.`))
    .catch(() => toast.error("Peramban menolak akses papan klip."));
}

function HeaderPpob() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Link to="/" className="flex min-w-0 items-center gap-2.5" aria-label="PINDAI, beranda">
          <VaultLogo size={30} />
          <span className="text-sm font-semibold tracking-[0.16em]">PINDAI</span>
          <span className="hidden rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500 sm:inline">
            PPOB
          </span>
        </Link>
        <nav aria-label="Navigasi PPOB" className="flex items-center gap-2">
          <Link
            to="/"
            className="hidden min-h-10 items-center rounded-lg px-3 text-xs font-medium text-slate-600 hover:bg-muted sm:inline-flex"
          >
            Beranda
          </Link>
          <Button asChild variant="outline" className="min-h-10">
            <Link to="/ppob">Etalase</Link>
          </Button>
        </nav>
      </div>
    </header>
  );
}

function FooterPpob() {
  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto grid max-w-6xl gap-5 px-4 py-10 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Link to="/" className="inline-flex items-center gap-2.5">
            <VaultLogo size={28} />
            <span className="text-sm font-semibold tracking-[0.16em]">PINDAI</span>
          </Link>
          <nav aria-label="Tautan PPOB" className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-600">
            <Link to="/" className="hover:text-primary">
              Beranda
            </Link>
            <Link to="/biaya" className="hover:text-primary">
              Biaya pinjaman
            </Link>
            <Link to="/syarat-ketentuan" className="hover:text-primary">
              Syarat & ketentuan
            </Link>
            <Link to="/privasi" className="hover:text-primary">
              Privasi
            </Link>
          </nav>
        </div>
        <p className="max-w-3xl text-[11px] leading-5 text-slate-500">
          {PENAFIAN_PINDAI} Produk PPOB diterbitkan oleh {NAMA_ENTITAS_PINDAI}. Pembelian
          pulsa/PPOB adalah penjualan tunai, bukan pinjaman dan bukan akad murabahah.
        </p>
        <p className="text-[11px] text-slate-500">{HAK_CIPTA_PINDAI}</p>
      </div>
    </footer>
  );
}

/** Cek status tanpa akun: kode pesanan adalah kuncinya. */
function CekPesanan() {
  const navigate = useNavigate();
  const [kode, setKode] = useState("");
  return (
    <section id="cek-pesanan" className="border-t border-border bg-muted/60">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="grid gap-4 rounded-2xl border border-border bg-background p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] sm:items-end sm:p-5">
          <div>
            <p className="text-sm font-semibold text-navy">Sudah pesan? Lacak di sini.</p>
            <p className="mt-1 text-xs leading-5 text-slate-600">
              Masukkan kode pesanan dari halaman pembayaran, mis. PPOB-261028-7K3M9QXW2N4P.
              Statusnya diperbarui otomatis saat admin memverifikasi dan provider mengirim.
            </p>
          </div>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const bersih = kode.trim().toUpperCase();
              if (bersih === "") {
                toast.error("Isi kode pesanan terlebih dahulu.");
                return;
              }
              navigate(`/ppob/pesanan/${encodeURIComponent(bersih)}`);
            }}
          >
            <Input
              value={kode}
              onChange={(e) => setKode(e.target.value.toUpperCase())}
              placeholder="PPOB-…"
              aria-label="Kode pesanan"
              className="min-h-11 font-mono text-xs"
            />
            <Button type="submit" className="min-h-11 shrink-0 bg-[#064E3B] text-white hover:bg-[#021E17]">
              Lacak
            </Button>
          </form>
        </div>
      </div>
    </section>
  );
}

/** Dialog pemesanan satu produk. */
function DialogPesan({
  produk,
  awal,
  onClose,
}: {
  produk: {
    kode: string;
    nama: string;
    kategori: KategoriPpob;
    hargaJual: number;
    jenis?: "prabayar" | "pascabayar";
  } | null;
  /** Isian dari tombol "Pesan lagi" di riwayat pembeli. */
  awal: { nomorTujuan: string; nama: string; whatsapp: string } | null;
  onClose: () => void;
}) {
  const pesan = useMutation(api.ppob.buatPesanan);
  const pesanTagihan = useMutation(api.ppob.buatPesananPascabayar);
  const cekTagihan = useAction(api.ppobH2h.cekTagihanPpob);
  const navigate = useNavigate();
  const [nomor, setNomor] = useState("");
  const [nama, setNama] = useState("");
  const [wa, setWa] = useState("");
  const [setuju, setSetuju] = useState(false);
  const [sibuk, setSibuk] = useState(false);
  const [cekSibuk, setCekSibuk] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const [gerbangSiap, setGerbangSiap] = useState(!turnstileDipasang);
  const [gerbangToken, setGerbangToken] = useState<string | null>(null);
  const [tagihan, setTagihan] = useState<{
    token: string;
    namaPelanggan: string;
    periode: string;
    nominalTagihan: number;
    biayaAdmin: number;
    total: number;
  } | null>(null);

  useEffect(() => {
    if (produk === null) return;
    setNomor(awal?.nomorTujuan ?? "");
    setNama(awal?.nama ?? "");
    setWa(awal?.whatsapp ?? "");
    setSetuju(false);
    setGalat(null);
    setTagihan(null);
  }, [produk, awal]);

  const pascabayar = produk !== null && kategoriPascabayar(produk.kategori);
  const nomorSah = produk !== null && nomorTujuanValid(produk.kategori, nomor);
  const bisaCek = pascabayar && nomorSah && gerbangSiap && !cekSibuk && !sibuk;
  const bisaKirim =
    produk !== null &&
    nomorSah &&
    nama.trim().length >= 2 &&
    nomorTujuanValid("pulsa", wa) &&
    setuju &&
    gerbangSiap &&
    (!pascabayar || tagihan !== null) &&
    !sibuk &&
    !cekSibuk;

  const mintaTagihan = async () => {
    if (produk === null) return;
    setGalat(null);
    setCekSibuk(true);
    try {
      const hasil = await cekTagihan({
        produkKode: produk.kode,
        nomorTujuan: nomor,
        perangkatId: idPerangkatPpob(),
        ...(gerbangToken !== null ? { gerbangToken } : {}),
      });
      setTagihan({
        token: hasil.token,
        namaPelanggan: hasil.namaPelanggan,
        periode: hasil.periode,
        nominalTagihan: hasil.nominalTagihan,
        biayaAdmin: hasil.biayaAdmin,
        total: hasil.total,
      });
    } catch (err) {
      setTagihan(null);
      setGalat(err instanceof Error ? err.message : "Tagihan gagal dicek.");
    } finally {
      setCekSibuk(false);
    }
  };

  const kirim = async () => {
    if (produk === null) return;
    if (pascabayar && tagihan === null) {
      setGalat("Cek tagihan lebih dulu sebelum membuat pesanan.");
      return;
    }
    setGalat(null);
    setSibuk(true);
    try {
      const hasil = pascabayar
        ? await pesanTagihan({
            tagihanToken: tagihan!.token,
            nama,
            whatsapp: wa,
            perangkatId: idPerangkatPpob(),
            ...(gerbangToken !== null ? { gerbangToken } : {}),
          })
        : await pesan({
            kodeProduk: produk.kode,
            nomorTujuan: nomor,
            nama,
            whatsapp: wa,
            perangkatId: idPerangkatPpob(),
            ...(gerbangToken !== null ? { gerbangToken } : {}),
          });
      toast.success(
        hasil.ulang
          ? "Pesanan yang sama masih menunggu pembayaran — membuka halaman pembayarannya."
          : "Pesanan dibuat. Selesaikan pembayaran untuk diproses.",
      );
      onClose();
      navigate(`/ppob/pesanan/${encodeURIComponent(hasil.kodePesanan)}`);
    } catch (err) {
      setGalat(err instanceof Error ? err.message : "Pesanan gagal dibuat.");
    } finally {
      setSibuk(false);
    }
  };

  return (
    <Dialog
      open={produk !== null}
      onOpenChange={(terbuka) => {
        if (!terbuka) onClose();
      }}
    >
      <DialogContent className="max-h-[92dvh] overflow-y-auto p-4 sm:max-w-lg sm:p-6">
        <DialogHeader>
          <DialogTitle className="text-base">{produk?.nama}</DialogTitle>
          <DialogDescription className="text-sm">
            {pascabayar ? (
              <span>Tagihan dicek langsung dari provider sebelum pesanan dibuat.</span>
            ) : (
              <span className="flex items-baseline gap-2">
                <span className="text-xl font-semibold tabular-nums text-emerald-800">
                  {produk ? formatRupiahAman(produk.hargaJual) : ""}
                </span>
                <span>sudah termasuk biaya layanan.</span>
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        {produk ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ppob-tujuan">{LABEL_TUJUAN[produk.kategori]}</Label>
              <Input
                id="ppob-tujuan"
                inputMode="numeric"
                autoComplete="off"
                value={nomor}
                onChange={(e) => {
                  setNomor(e.target.value);
                  setTagihan(null);
                }}
                placeholder={CONTOH_BELI[produk.kategori]}
                aria-invalid={nomor !== "" && !nomorSah}
                className="min-h-11 tabular-nums"
              />
              {nomor !== "" && !nomorSah ? (
                <p className="text-[11px] leading-5 text-red-600">
                  {produk.kategori === "token-listrik"
                    ? "Nomor meter harus 11–12 angka."
                    : produk.kategori === "game"
                      ? "ID game 5–20 angka; tambahkan server dalam kurung bila perlu."
                      : kategoriPascabayar(produk.kategori)
                        ? "Nomor pelanggan harus 6–20 angka."
                        : "Nomor HP harus diawali 08 dan berisi 10–13 angka."}
                </p>
              ) : null}
              {pascabayar ? (
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 w-full"
                  disabled={!bisaCek}
                  onClick={() => void mintaTagihan()}
                >
                  {cekSibuk ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : (
                    <ReceiptText className="mr-2 size-4" />
                  )}
                  {tagihan === null ? "Cek tagihan" : "Cek ulang tagihan"}
                </Button>
              ) : null}
            </div>

            {tagihan !== null ? (
              <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs text-sky-950">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{tagihan.namaPelanggan}</p>
                    <p className="mt-0.5 text-[11px] text-sky-800">
                      Periode {tagihan.periode}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full border border-sky-300 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                    Tagihan
                  </span>
                </div>
                <dl className="mt-2 space-y-1 border-t border-sky-200 pt-2">
                  <div className="flex justify-between gap-2">
                    <dt className="text-sky-800">Nominal tagihan</dt>
                    <dd className="tabular-nums">{formatRupiahAman(tagihan.nominalTagihan)}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-sky-800">Biaya admin</dt>
                    <dd className="tabular-nums">{formatRupiahAman(tagihan.biayaAdmin)}</dd>
                  </div>
                  <div className="flex justify-between gap-2 border-t border-sky-200 pt-1 text-sm font-semibold">
                    <dt>Total bayar</dt>
                    <dd className="tabular-nums">{formatRupiahAman(tagihan.total)}</dd>
                  </div>
                </dl>
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="ppob-nama">Nama pemesan</Label>
                <Input
                  id="ppob-nama"
                  value={nama}
                  onChange={(e) => setNama(e.target.value.slice(0, 80))}
                  placeholder="Nama Anda"
                  className="min-h-11"
                  autoComplete="name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ppob-wa">Nomor WhatsApp</Label>
                <Input
                  id="ppob-wa"
                  inputMode="numeric"
                  value={wa}
                  onChange={(e) => setWa(e.target.value)}
                  placeholder="0812 3456 7890"
                  className="min-h-11 tabular-nums"
                  autoComplete="tel"
                />
              </div>
            </div>

            <GerbangTurnstile
              publik
              onSiap={setGerbangSiap}
              onToken={setGerbangToken}
            />

            <label className="flex items-start gap-2.5 rounded-xl border border-border bg-muted/50 p-3 text-xs leading-5 text-slate-700">
              <Checkbox
                checked={setuju}
                onCheckedChange={(nilai) => setSetuju(nilai === true)}
                className="mt-0.5"
                aria-label="Setuju syarat pembelian PPOB"
              />
              <span>
                Saya memastikan nomor tujuan sudah benar. Produk digital yang sudah
                terkirim tidak dapat ditarik kembali. Baca{" "}
                <Link to="/syarat-ketentuan" className="font-medium text-primary underline underline-offset-2">
                  syarat dan ketentuan
                </Link>
                .
              </span>
            </label>

            {galat ? (
              <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-700">
                {galat}
              </p>
            ) : null}

            <Button
              onClick={() => void kirim()}
              disabled={!bisaKirim}
              className="min-h-12 w-full bg-[#064E3B] text-white hover:bg-[#021E17]"
            >
              {sibuk ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <ArrowRight className="mr-2 size-4" />
              )}
              Buat pesanan ·{" "}
              {produk
                ? formatRupiahAman(tagihan?.total ?? produk.hargaJual)
                : ""}
            </Button>
            <p className="text-center text-[11px] text-slate-500">
              Pembayaran diverifikasi admin sebelum produk dikirim. Simpan kode pesanan
              yang muncul setelah ini.
            </p>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/** Rute utama etalase. */
export function Ppob() {
  const ringkas = useQuery(api.ppob.ringkasEtalase, {});
  const kategori = useQuery(api.ppob.kategoriEtalase, {});
  const riwayat = useQuery(api.ppob.pesananSaya, {});
  const [pilih, setPilih] = useState<KategoriPpob | null>(null);
  const [cari, setCari] = useState("");
  const [ulang, setUlang] = useState<{
    nomorTujuan: string;
    nama: string;
    whatsapp: string;
  } | null>(null);
  const [dialog, setDialog] = useState<{
    kode: string;
    nama: string;
    kategori: KategoriPpob;
    hargaJual: number;
    jenis?: "prabayar" | "pascabayar";
  } | null>(null);

  const kategoriAktif: KategoriPpob = pilih ?? kategori?.kategori[0]?.id ?? "pulsa";
  const produk = useQuery(api.ppob.daftarProduk, {
    kategori: kategoriAktif,
    cari: cari.trim() === "" ? undefined : cari.trim(),
  });

  const jumlahKategori = new Map(
    (kategori?.kategori ?? []).map((item) => [item.id, item.jumlah]),
  );
  const etalaseTutup = ringkas !== undefined && !ringkas.aktif;
  const belumAdaProduk = ringkas !== undefined && !ringkas.adaProduk;

  return (
    <div className="min-h-screen bg-background">
      <HeaderPpob />
      <main id="konten" tabIndex={-1}>
        <section className="bg-hero relative overflow-hidden border-b border-border">
          <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 py-10 sm:px-6 sm:py-14 lg:grid-cols-[1.1fr_0.9fr] lg:py-16">
            <div className="max-w-xl">
              <p className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">
                <Zap className="size-3.5" aria-hidden />
                Pulsa · Data · Token · Voucher
              </p>
              <h1 className="mt-5 text-3xl font-semibold leading-tight tracking-[-0.03em] text-foreground sm:text-4xl lg:text-[2.75rem]">
                Beli kebutuhan digital,
                <br />
                <span className="font-display text-primary">harga terlihat sejak awal.</span>
              </h1>
              <p className="mt-4 max-w-lg text-sm leading-7 text-slate-700 sm:text-base">
                Tanpa akun, tanpa akad pinjaman. Isi nomor tujuan, transfer sesuai
                nominal, lalu produk dikirim ke nomor itu setelah pembayaran
                diverifikasi.
              </p>
              <ul className="mt-6 grid gap-2 text-xs text-slate-700 sm:grid-cols-2">
                {[
                  "Harga di layar = nominal transfer",
                  "Nomor tujuan diperiksa server",
                  "Bukti pesanan tersimpan",
                  "Bantuan admin lewat WhatsApp",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-700" aria-hidden />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                Produk tersedia
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {KATEGORI_PPOB.map((item) => {
                  const Ikon = IKON_KATEGORI[item];
                  const jumlah = jumlahKategori.get(item) ?? 0;
                  return (
                    <button
                      key={item}
                      type="button"
                      onClick={() => {
                        setPilih(item);
                        setCari("");
                        document.getElementById("etalase")?.scrollIntoView({ behavior: "smooth" });
                      }}
                      className="flex min-h-16 items-center gap-2.5 rounded-xl border border-border bg-background px-3 py-2 text-left transition-colors hover:border-primary"
                    >
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-800">
                        <Ikon className="size-4" aria-hidden />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[11px] font-semibold text-slate-800">
                          {LABEL_KATEGORI_PPOB[item]}
                        </span>
                        <span className="text-[10px] text-slate-500">
                          {jumlah > 0 ? `${jumlah} produk` : "menunggu sinkron"}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="mt-3 flex items-start gap-1.5 text-[10px] leading-4 text-slate-500">
                <Info className="mt-0.5 size-3 shrink-0" aria-hidden />
                Daftar mengikuti harga server pulsa; etalase disegarkan admin.
              </p>
            </div>
          </div>
        </section>

        {riwayat !== undefined && riwayat.length > 0 ? (
          <section className="mx-auto max-w-6xl px-4 pt-8 sm:px-6" aria-labelledby="riwayat-ppob">
            <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
              <div>
                <h2 id="riwayat-ppob" className="text-base font-semibold text-navy">
                  Pesanan saya
                </h2>
                <p className="mt-1 text-[11px] leading-5 text-slate-500">
                  Pesanan yang dibuat saat Anda masuk ke akun ini. Tekan “Pesan lagi”
                  untuk mengisi ulang nomor tujuan yang sama.
                </p>
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {riwayat.map((item) => (
                  <div
                    key={item.kodePesanan}
                    className="rounded-xl border border-border bg-background p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">
                          {item.namaProduk}
                        </p>
                        <p className="mt-0.5 truncate font-mono text-[10px] text-slate-500">
                          {item.kodePesanan} · {formatTanggalWIB(item.dibuatPada)}
                        </p>
                      </div>
                      <BadgeStatus status={item.status as StatusPesananPpob} />
                    </div>
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-semibold tabular-nums text-emerald-800">
                        {formatRupiahAman(item.hargaJual)}
                      </span>
                      <div className="flex gap-1.5">
                        <Button asChild variant="outline" size="sm" className="h-8 px-2.5 text-[11px]">
                          <Link to={`/ppob/pesanan/${encodeURIComponent(item.kodePesanan)}`}>
                            Lihat
                          </Link>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2 text-[11px]"
                          onClick={() => {
                            setUlang({
                              nomorTujuan: item.nomorTujuan,
                              nama: item.namaPembeli,
                              whatsapp: item.whatsapp,
                            });
                            setPilih(item.kategori as KategoriPpob);
                            document
                              .getElementById("etalase")
                              ?.scrollIntoView({ behavior: "smooth" });
                          }}
                        >
                          Pesan lagi
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        <section id="etalase" className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-navy sm:text-2xl">
                Pilih produk
              </h2>
              <p className="mt-1 text-xs leading-5 text-slate-600">
                Harga sudah termasuk biaya layanan. Produk yang kosong di provider
                otomatis disembunyikan.
              </p>
            </div>
            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={cari}
                onChange={(e) => setCari(e.target.value)}
                placeholder="Cari operator atau nominal"
                aria-label="Cari produk PPOB"
                className="min-h-11 pl-9"
              />
            </div>
          </div>

          <div className="no-scrollbar mt-4 flex gap-1.5 overflow-x-auto pb-1" role="group" aria-label="Kategori produk">
            {KATEGORI_PPOB.map((item) => {
              const aktif = kategoriAktif === item;
              const jumlah = jumlahKategori.get(item) ?? 0;
              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => setPilih(item)}
                  aria-pressed={aktif}
                  disabled={jumlah === 0}
                  className={cn(
                    "inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45",
                    aktif
                      ? "border-[#064E3B] bg-[#064E3B] text-white"
                      : "border-border bg-card text-slate-700 hover:border-primary",
                  )}
                >
                  {LABEL_KATEGORI_PPOB[item]}
                  <span className={cn("text-[10px] font-normal", aktif ? "text-white/70" : "text-slate-500")}>
                    {jumlah}
                  </span>
                </button>
              );
            })}
          </div>

          {etalaseTutup ? (
            <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center">
              <p className="text-sm font-semibold text-amber-900">Etalase sedang ditutup.</p>
              <p className="mt-1 text-xs leading-5 text-amber-800">
                Admin sedang menutup pesanan baru. Anda masih bisa melacak pesanan yang
                sudah dibuat lewat kode pesanan.
              </p>
            </div>
          ) : belumAdaProduk ? (
            <div className="mt-6 rounded-2xl border border-dashed border-border bg-card p-8 text-center">
              <p className="text-sm font-semibold text-navy">Produk belum tersedia.</p>
              <p className="mt-1 text-xs leading-5 text-slate-600">
                Daftar harga belum ditarik dari server pulsa. Hubungi admin bila ini
                berlangsung lama.
              </p>
            </div>
          ) : produk === undefined ? (
            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-24 animate-pulse rounded-2xl border border-border bg-muted" />
              ))}
            </div>
          ) : produk.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-dashed border-border bg-card p-8 text-center">
              <p className="text-sm font-semibold text-navy">Tidak ada yang cocok.</p>
              <p className="mt-1 text-xs text-slate-600">
                Coba kata lain, atau pilih kategori lain di atas.
              </p>
            </div>
          ) : (
            <div className="mt-5 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {produk.map((item) => (
                <button
                  key={item.kode}
                  type="button"
                  onClick={() => setDialog(item)}
                  className="group flex min-h-24 flex-col justify-between rounded-2xl border border-border bg-card p-4 text-left transition-colors hover:border-primary hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="flex items-start justify-between gap-2">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-slate-900">
                        {item.nama}
                      </span>
                      <span className="mt-0.5 block text-[10px] uppercase tracking-wide text-slate-500">
                        {item.operator || LABEL_KATEGORI_PPOB[item.kategori]}
                      </span>
                    </span>
                    <ChevronRight className="mt-0.5 size-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" aria-hidden />
                  </span>
                  <span className="mt-3 flex items-baseline justify-between gap-2">
                    {item.jenis === "pascabayar" || kategoriPascabayar(item.kategori) ? (
                      <span className="text-[11px] font-medium text-slate-600">
                        Cek tagihan · admin {formatRupiahAman(item.biayaAdmin ?? 0)}
                      </span>
                    ) : (
                      <span className="text-lg font-semibold tabular-nums text-emerald-800">
                        {formatRupiahAman(item.hargaJual)}
                      </span>
                    )}
                    <span className="text-[10px] font-medium text-slate-500">Pilih</span>
                  </span>
                </button>
              ))}
            </div>
          )}

          <p className="mt-5 flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50 p-3 text-[11px] leading-5 text-sky-950">
            <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
            PINDAI tidak pernah meminta kode OTP, PIN, atau kata sandi lewat WhatsApp
            maupun email. Pembayaran hanya ke rekening usaha yang tercantum di halaman
            pesanan.
          </p>
        </section>

        <CekPesanan />
      </main>
      <FooterPpob />
      <DialogPesan produk={dialog} awal={ulang} onClose={() => setDialog(null)} />
    </div>
  );
}

/** Halaman status & pembayaran satu pesanan. */
export function PpobPesanan() {
  const { kode = "" } = useParams();
  const status = useQuery(api.ppob.statusPesanan, { kode });
  const bukaSn = useMutation(api.ppob.bukaSn);
  const [sn, setSn] = useState<string | null>(null);
  const [empatDigit, setEmpatDigit] = useState("");
  const [sibukSn, setSibukSn] = useState(false);
  const [galatSn, setGalatSn] = useState<string | null>(null);

  const bukaNomorSeri = async () => {
    setGalatSn(null);
    setSibukSn(true);
    try {
      const hasil = await bukaSn({ kode, empatDigit });
      setSn(hasil.sn);
    } catch (err) {
      setGalatSn(err instanceof Error ? err.message : "Nomor seri gagal dibuka.");
    } finally {
      setSibukSn(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <HeaderPpob />
      <main id="konten" tabIndex={-1} className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <Link
          to="/ppob"
          className="inline-flex min-h-10 items-center gap-1.5 rounded-lg text-xs font-medium text-slate-600 hover:text-primary"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Kembali ke etalase
        </Link>

        {status === undefined ? (
          <div className="mt-4 space-y-3" aria-busy="true">
            <div className="h-32 animate-pulse rounded-2xl border border-border bg-muted" />
            <div className="h-48 animate-pulse rounded-2xl border border-border bg-muted" />
          </div>
        ) : status === null ? (
          <div className="mt-4 rounded-2xl border border-border bg-card p-8 text-center">
            <p className="text-sm font-semibold text-navy">Pesanan tidak ditemukan.</p>
            <p className="mt-1 text-xs leading-5 text-slate-600">
              Periksa kembali kode pesanan. Kode ditulis persis seperti di halaman
              pembayaran, termasuk tanda hubung.
            </p>
            <Button asChild className="mt-4 min-h-11">
              <Link to="/ppob">Kembali ke etalase</Link>
            </Button>
          </div>
        ) : (
          <>
            <div className="mt-4 rounded-2xl border border-border bg-card p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Kode pesanan
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-2 font-mono text-sm font-semibold text-navy">
                    {status.kodePesanan}
                    <button
                      type="button"
                      onClick={() => salin(status.kodePesanan, "Kode pesanan")}
                      className="inline-flex size-8 items-center justify-center rounded-lg border border-border text-slate-500 hover:bg-muted"
                      aria-label="Salin kode pesanan"
                    >
                      <Copy className="size-3.5" />
                    </button>
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    Dibuat {formatWaktuWIB(status.dibuatPada)} WIB
                  </p>
                </div>
                <BadgeStatus status={status.status as StatusPesananPpob} />
              </div>

              <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50/70 p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-900">
                  Total yang harus dibayar
                </p>
                <p className="mt-1 text-3xl font-semibold tabular-nums text-emerald-900">
                  {formatRupiahAman(status.hargaJual)}
                </p>
                <p className="mt-1 text-[11px] leading-5 text-emerald-900/80">
                  {status.namaProduk} · tujuan {status.nomorTujuan}
                </p>
              </div>

              {status.jenis === "pascabayar" ? (
                <dl className="mt-3 space-y-1.5 rounded-xl border border-border bg-background p-4 text-xs text-slate-700">
                  <div className="flex justify-between gap-3">
                    <dt>Nama pelanggan</dt>
                    <dd className="text-right font-medium text-slate-900">
                      {status.namaPelanggan ?? "—"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt>Periode</dt>
                    <dd className="text-right font-medium text-slate-900">
                      {status.periode ?? "—"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt>Nominal tagihan</dt>
                    <dd className="text-right tabular-nums">
                      {formatRupiahAman(status.nominalTagihan ?? 0)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3 border-t border-border pt-1.5">
                    <dt>Biaya admin</dt>
                    <dd className="text-right tabular-nums">
                      {formatRupiahAman(status.biayaPlatform ?? 0)}
                    </dd>
                  </div>
                </dl>
              ) : null}

              {status.status === "menunggu_bayar" ? (
                <div className="mt-5 space-y-3">
                  <p className="text-sm font-semibold text-navy">Cara membayar</p>
                  {status.pembayaran.tersedia ? (
                    <div className="rounded-xl border border-border bg-background p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-[10px] uppercase tracking-wide text-slate-500">
                            {status.pembayaran.namaBank}
                          </p>
                          <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-slate-900">
                            {status.pembayaran.nomorRekening}
                          </p>
                          <p className="text-xs text-slate-600">
                            a.n. {status.pembayaran.namaRekening}
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="min-h-10"
                          onClick={() => salin(status.pembayaran.nomorRekening, "Nomor rekening")}
                        >
                          <Copy className="mr-1.5 size-3.5" />
                          Salin
                        </Button>
                      </div>
                      {status.pembayaran.qrisUrl ? (
                        <div className="mt-4 border-t border-border pt-4">
                          <p className="text-[10px] uppercase tracking-wide text-slate-500">
                            atau pindai QRIS
                          </p>
                          <img
                            src={status.pembayaran.qrisUrl}
                            alt="Kode QRIS pembayaran PINDAI"
                            className="mt-2 size-40 rounded-xl border border-border bg-white p-1"
                          />
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                      Rekening pembayaran belum diatur admin. Hubungi layanan pelanggan
                      lewat tombol di bawah; jangan mentransfer ke rekening lain.
                    </p>
                  )}
                  <ol className="list-decimal space-y-1.5 pl-5 text-xs leading-6 text-slate-700">
                    <li>Transfer tepat <strong>{formatRupiahAman(status.hargaJual)}</strong>.</li>
                    <li>
                      Cantumkan <strong>{status.kodePesanan}</strong> pada berita
                      transfer.
                    </li>
                    <li>Kirim bukti transfer ke admin lewat WhatsApp.</li>
                    <li>Pesanan diproses setelah pembayaran diverifikasi.</li>
                  </ol>
                  {status.instruksi ? (
                    <p className="rounded-xl bg-muted px-3 py-2 text-[11px] leading-5 text-slate-700">
                      {status.instruksi}
                    </p>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    <Button asChild className="min-h-11 bg-[#064E3B] text-white hover:bg-[#021E17]">
                      <a
                        href={urlChatCs(
                          `Halo admin PINDAI, saya sudah transfer untuk pesanan ${status.kodePesanan} (${status.namaProduk}) sebesar ${formatRupiahAman(status.hargaJual)}. Mohon diverifikasi.`,
                        )}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Kirim bukti ke WhatsApp
                      </a>
                    </Button>
                    <Button
                      variant="outline"
                      className="min-h-11"
                      onClick={() => salin(status.kodePesanan, "Kode pesanan")}
                    >
                      <Copy className="mr-1.5 size-4" />
                      Salin kode
                    </Button>
                  </div>
                </div>
              ) : null}

              {status.status === "sukses" ? (
                <div className="mt-5 rounded-xl border border-emerald-200 bg-background p-4">
                  <p className="text-sm font-semibold text-emerald-900">Produk sudah dikirim.</p>
                  {sn !== null ? (
                    <>
                      <p className="mt-1 text-[11px] uppercase tracking-wide text-slate-500">
                        Nomor seri / token
                      </p>
                      <p className="mt-1 break-all font-mono text-lg font-semibold text-slate-900">
                        {sn}
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2 min-h-10"
                        onClick={() => salin(sn, "Nomor seri")}
                      >
                        <Copy className="mr-1.5 size-3.5" />
                        Salin nomor seri
                      </Button>
                    </>
                  ) : status.snTersedia ? (
                    <form
                      className="mt-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void bukaNomorSeri();
                      }}
                    >
                      <p className="text-xs leading-5 text-slate-600">
                        Nomor seri/token tidak ditampilkan terbuka. Masukkan 4 digit terakhir
                        nomor tujuan untuk membukanya — kode pesanan saja tidak cukup.
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Input
                          value={empatDigit}
                          onChange={(e) =>
                            setEmpatDigit(e.target.value.replace(/\D/g, "").slice(0, 4))
                          }
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          maxLength={4}
                          placeholder="4 digit terakhir"
                          aria-label="Empat digit terakhir nomor tujuan"
                          className="h-10 w-40 tabular-nums"
                        />
                        <Button
                          type="submit"
                          variant="outline"
                          className="min-h-10"
                          disabled={sibukSn || empatDigit.length !== 4}
                        >
                          {sibukSn ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null}
                          Buka nomor seri
                        </Button>
                      </div>
                      {galatSn ? (
                        <p className="mt-1.5 text-[11px] leading-5 text-red-700">{galatSn}</p>
                      ) : null}
                      <p className="mt-1.5 text-[10px] leading-4 text-slate-500">
                        Nomor seri juga dikirim ke WhatsApp yang Anda isi saat memesan.
                      </p>
                    </form>
                  ) : (
                    <p className="mt-1 text-xs leading-5 text-slate-600">
                      Provider tidak mengirim nomor seri untuk produk ini. Simpan halaman
                      ini sebagai bukti; hubungi admin bila saldo belum masuk.
                    </p>
                  )}
                </div>
              ) : null}

              {(status.status === "gagal" || status.status === "refund") ? (
                <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-xs leading-6 text-red-800">
                  <p className="font-semibold">Pesanan tidak selesai.</p>
                  <p className="mt-1">
                    {status.pesanProvider ||
                      "Produk gagal dikirim provider. Dana akan dikembalikan sesuai bukti transfer."}
                  </p>
                </div>
              ) : null}

              {status.status === "dibayar" || status.status === "diproses" ? (
                <div className="mt-5 rounded-xl border border-sky-200 bg-sky-50 p-4 text-xs leading-6 text-sky-900">
                  <p className="flex items-center gap-1.5 font-semibold">
                    <Clock className="size-3.5" aria-hidden />
                    Pembayaran diterima. Produk sedang diproses.
                  </p>
                  <p className="mt-1">
                    Biasanya selesai dalam beberapa menit. Halaman ini memperbarui
                    sendiri; tidak perlu memuat ulang.
                  </p>
                </div>
              ) : null}

              <dl className="mt-5 space-y-2 border-t border-border pt-4 text-xs">
                {[
                  ["Produk", status.namaProduk],
                  ["Kategori", LABEL_KATEGORI_PPOB[status.kategori as KategoriPpob]],
                  ["Nomor tujuan", status.nomorTujuan],
                  ["Dibuat", `${formatTanggalWIB(status.dibuatPada)} · ${formatWaktuWIB(status.dibuatPada)} WIB`],
                ].map(([label, nilai]) => (
                  <div key={label} className="flex flex-wrap justify-between gap-2">
                    <dt className="text-slate-500">{label}</dt>
                    <dd className="text-right font-medium text-slate-800">{nilai}</dd>
                  </div>
                ))}
              </dl>

              <div className="mt-5 flex flex-wrap gap-2">
                <Button asChild variant="outline" className="min-h-11">
                  <Link to="/ppob">Pesan lagi</Link>
                </Button>
                <Button asChild variant="ghost" className="min-h-11">
                  <a
                    href={urlChatCs(
                      `Halo admin PINDAI, saya ingin menanyakan pesanan ${status.kodePesanan} (${status.namaProduk}).`,
                    )}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Hubungi admin
                  </a>
                </Button>
              </div>
            </div>
          </>
        )}
      </main>
      <FooterPpob />
    </div>
  );
}

export default Ppob;
