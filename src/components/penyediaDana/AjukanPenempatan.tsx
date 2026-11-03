/**
 * Setoran penempatan dana dari ruang pendana.
 *
 * Server sudah punya jalurnya sejak lama (`alokasiDana.requestDeposit`,
 * `myDeposits`, antrean pencocokan di panel admin), tetapi tidak pernah ada
 * layar yang memanggilnya: pendana hanya bisa menunggu admin mencatat
 * penempatan. Kartu ini menutup jalur itu tanpa membuat tabel baru.
 *
 * Uang TIDAK masuk saldo pendana saat formulir dikirim. Setoran berstatus
 * `menunggu_verifikasi` sampai admin mencocokkan mutasi bank; siklus 30 hari
 * baru lahir dari alokasi, bukan dari pengajuan ini. Karena itu kartu menulis
 * urutannya apa adanya, bukan menjanjikan saldo langsung bertambah.
 *
 * Nominal, referensi, dan bukti divalidasi lagi di server; validasi di sini
 * hanya untuk menahan kiriman yang jelas belum lengkap.
 */
import { useMutation, useQuery } from "convex/react";
import {
  CheckCircle2,
  Clock,
  Coins,
  Loader2,
  Receipt,
  ShieldCheck,
  Upload,
  XCircle,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/convex/_generated/api";
import { formatRupiah, kelompokkanDigit } from "@/lib/money";
import { unggahDokumen } from "@/lib/unggahDokumen";
import { cn } from "@/lib/utils";

type MetodeSetoran = "transfer" | "qris";
type StatusSetoran = "menunggu_verifikasi" | "terverifikasi" | "ditolak";
type StatusTampil = StatusSetoran | "dicocokkan";

/** Batas ukuran bukti mengikuti yang diterima server. */
const MAKS_BUKTI_BYTE = 5_000_000;

const LABEL_STATUS: Record<StatusTampil, string> = {
  menunggu_verifikasi: "Menunggu pencocokan",
  terverifikasi: "Terverifikasi",
  ditolak: "Ditolak",
  dicocokkan: "Bukti dicocokkan",
};

const KELAS_STATUS: Record<StatusTampil, string> = {
  menunggu_verifikasi: "border-amber-200 bg-amber-50 text-amber-900",
  terverifikasi: "border-emerald-200 bg-emerald-50 text-emerald-900",
  ditolak: "border-rose-200 bg-rose-50 text-rose-900",
  dicocokkan: "border-sky-200 bg-sky-50 text-sky-900",
};

function ikonStatus(status: StatusTampil) {
  if (status === "terverifikasi" || status === "dicocokkan") {
    return <CheckCircle2 className="size-3.5" aria-hidden />;
  }
  if (status === "ditolak") return <XCircle className="size-3.5" aria-hidden />;
  return <Clock className="size-3.5" aria-hidden />;
}

/**
 * Periksa isian sebelum dikirim. Mengembalikan pesan pertama yang gagal, atau
 * `null` bila formulir siap dikirim. Diekspor supaya bisa diuji tanpa DOM.
 */
export function validasiSetoran(isian: {
  jumlah: number;
  referensi: string;
  tanggal: number;
  ukuranBukti: number;
  adaBukti: boolean;
  sekarang: number;
}): string | null {
  if (!Number.isSafeInteger(isian.jumlah) || isian.jumlah <= 0) {
    return "Nominal setoran harus rupiah bulat.";
  }
  const referensi = isian.referensi.trim();
  if (referensi.length < 4 || referensi.length > 120) {
    return "Nomor referensi atau berita transfer wajib diisi (4 sampai 120 karakter).";
  }
  if (!Number.isSafeInteger(isian.tanggal) || isian.tanggal > isian.sekarang + 5 * 60_000) {
    return "Tanggal transfer tidak boleh melewati hari ini.";
  }
  if (!isian.adaBukti) return "Bukti transfer wajib diunggah.";
  if (isian.ukuranBukti > MAKS_BUKTI_BYTE) {
    return "Bukti transfer maksimal 5 MB.";
  }
  return null;
}

/** Tanggal `YYYY-MM-DD` dari input tanggal, dibaca sebagai tengah malam lokal. */
function tanggalKeMs(nilai: string): number {
  const [tahun, bulan, hari] = nilai.split("-").map(Number);
  if (!tahun || !bulan || !hari) return Number.NaN;
  return new Date(tahun, bulan - 1, hari).getTime();
}

function hariIni(): string {
  const kini = new Date();
  const bulan = String(kini.getMonth() + 1).padStart(2, "0");
  const hari = String(kini.getDate()).padStart(2, "0");
  return `${kini.getFullYear()}-${bulan}-${hari}`;
}

export function AjukanPenempatan({ className }: { className?: string }) {
  const instruksi = useQuery(api.system.getPaymentInstructions, {});
  const setoran = useQuery(api.alokasiDana.myDeposits, {});
  const persetujuan = useQuery(
    api.persetujuanRisiko.statusPersetujuanRisiko,
    {},
  );
  const mintaUrl = useMutation(api.alokasiDana.generateDepositUploadUrl);
  const kirimSetoran = useMutation(api.alokasiDana.requestDeposit);

  const [buka, setBuka] = useState(false);
  const [jumlah, setJumlah] = useState("");
  const [metode, setMetode] = useState<MetodeSetoran>("transfer");
  const [tanggal, setTanggal] = useState(hariIni);
  const [referensi, setReferensi] = useState("");
  const [bukti, setBukti] = useState<File | null>(null);
  const [mengirim, setMengirim] = useState(false);

  const aktif = instruksi?.setoranManualAktif === true;
  const bolehSetor = persetujuan !== undefined && !persetujuan.perluSetuju;
  const nominal = Number(jumlah.replace(/\D/g, "")) || 0;
  const daftar = setoran ?? [];
  const menunggu = daftar.filter(
    (d) =>
      d.status === "menunggu_verifikasi" &&
      d.statusPencocokan !== "ditolak" &&
      d.statusPencocokan !== "dicocokkan",
  ).length;

  const reset = () => {
    setJumlah("");
    setMetode("transfer");
    setTanggal(hariIni());
    setReferensi("");
    setBukti(null);
  };

  async function kirim(acara: FormEvent<HTMLFormElement>) {
    acara.preventDefault();
    if (!bolehSetor) {
      toast.error("Setujui pernyataan risiko pendanaan dulu sebelum mengirim setoran.");
      return;
    }
    const galat = validasiSetoran({
      jumlah: nominal,
      referensi,
      tanggal: tanggalKeMs(tanggal),
      ukuranBukti: bukti?.size ?? 0,
      adaBukti: bukti !== null,
      sekarang: Date.now(),
    });
    if (galat !== null) {
      toast.error(galat);
      return;
    }
    if (bukti === null) return;
    setMengirim(true);
    try {
      const buktiPembayaranId = await unggahDokumen(
        bukti,
        () => mintaUrl({}),
        "Bukti transfer",
      );
      await kirimSetoran({
        jumlah: nominal,
        referensiTransfer: referensi.trim(),
        metodePembayaran: metode,
        tanggalTransfer: tanggalKeMs(tanggal),
        buktiPembayaranId,
      });
      toast.success("Setoran dikirim. Admin mencocokkan mutasi lalu mengkreditkan saldo pendana.");
      setBuka(false);
      reset();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Setoran gagal dikirim.");
    } finally {
      setMengirim(false);
    }
  }

  return (
    <section
      aria-labelledby="judul-ajukan-penempatan"
      className={cn(
        "animate-masuk mt-5 rounded-lg border border-slate-200 bg-white p-4 sm:p-5",
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 max-w-2xl">
          <h2
            id="judul-ajukan-penempatan"
            className="flex items-center gap-2 text-sm font-semibold text-navy"
          >
            <Coins className="size-4 text-emerald-700" aria-hidden="true" />
            Tambah penempatan
          </h2>
          <p className="mt-1 text-xs leading-6 text-slate-600">
            Setor dana, unggah bukti transfer, lalu admin mencocokkan mutasinya.
            Setelah mutasi cocok, saldo pendana dikreditkan. Alokasi ke pinjaman
            mengikuti alur terpisah; siklus 30 hari baru lahir dari alokasi, bukan
            dari pengajuan setoran ini.
          </p>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] leading-5 text-slate-500">
            <span className="font-medium text-success-foreground">
              Jalur manual aktif
            </span>
            <span aria-hidden="true">·</span>
            <span>Jalur otomatis dimatikan sementara</span>
          </p>
          {menunggu > 0 && (
            <p className="mt-1.5 text-xs font-medium text-amber-800">
              {menunggu} setoran sedang menunggu pencocokan admin.
            </p>
          )}
          {persetujuan !== undefined && persetujuan.perluSetuju && (
            <p className="mt-1.5 flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs leading-5 text-amber-900">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              <span>
                Setujui pernyataan risiko dulu sebelum mengirim setoran.{" "}
                <a
                  href="#persetujuan"
                  className="font-semibold underline decoration-amber-400 underline-offset-2"
                >
                  Buka persetujuan risiko
                </a>
                .
              </span>
            </p>
          )}
        </div>
        <Button
          type="button"
          onClick={() => setBuka(true)}
          disabled={instruksi === undefined || !aktif || !bolehSetor}
          className="h-9 shrink-0 gap-1.5 text-xs font-semibold"
        >
          <Upload className="size-3.5" aria-hidden="true" />
          Ajukan setoran
        </Button>
      </div>

      {instruksi !== undefined && !aktif && (
        <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
          Penerimaan setoran manual belum dibuka admin. Sementara ini,
          penempatan dicatat lewat tim operasional.
        </p>
      )}

      {instruksi !== undefined && aktif && instruksi.tersedia && (
        <dl className="mt-3 grid gap-x-6 gap-y-1 rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2 text-xs sm:grid-cols-3">
          <div>
            <dt className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
              Atas nama
            </dt>
            <dd className="font-medium text-navy">{instruksi.namaRekening}</dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
              Bank
            </dt>
            <dd className="font-medium text-navy">{instruksi.namaBank}</dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
              Nomor rekening
            </dt>
            <dd className="font-medium tabular-nums text-navy">
              {instruksi.nomorRekening}
            </dd>
          </div>
        </dl>
      )}

      {daftar.length > 0 && (
        <ul className="mt-4 divide-y divide-slate-200 border-t border-slate-200">
          {daftar.slice(0, 5).map((d) => {
            const status: StatusTampil =
              d.status === "terverifikasi"
                ? "terverifikasi"
                : d.statusPencocokan === "ditolak"
                  ? "ditolak"
                  : d.statusPencocokan === "dicocokkan"
                    ? "dicocokkan"
                    : (d.status as StatusSetoran);
            return (
              <li
                key={d._id}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5 text-xs"
              >
                <span className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="font-mono text-[11px] text-slate-500">
                    {d.nomorReferensi}
                  </span>
                  <span className="font-semibold tabular-nums text-navy">
                    {formatRupiah(d.jumlah)}
                  </span>
                  {d.metodePembayaran !== null && (
                    <span className="text-muted-foreground">
                      {d.metodePembayaran === "qris" ? "QRIS" : "Transfer"}
                    </span>
                  )}
                </span>
                <span className="flex items-center gap-2">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
                      KELAS_STATUS[status],
                    )}
                  >
                    {ikonStatus(status)}
                    {LABEL_STATUS[status]}
                  </span>
                </span>
                {d.dikreditkanPada !== null ? (
                  <p className="basis-full text-[11px] leading-5 text-slate-600">
                    Saldo sudah dikreditkan setelah mutasi cocok.
                  </p>
                ) : d.statusPencocokan === "dicocokkan" ? (
                  <p className="basis-full text-[11px] leading-5 text-slate-600">
                    Bukti sudah dicocokkan dan menunggu kredit saldo.
                  </p>
                ) : null}
                {d.catatanAdmin !== null && d.catatanAdmin.trim() !== "" && (
                  <p className="basis-full text-[11px] leading-5 text-slate-600">
                    Catatan admin: {d.catatanAdmin}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {daftar.length > 5 && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Menampilkan 5 setoran terbaru dari {daftar.length}.
        </p>
      )}

      <Dialog open={buka} onOpenChange={setBuka}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Ajukan setoran penempatan</DialogTitle>
            <DialogDescription>
              Kirim bukti transfer. Admin mencocokkan mutasi bank dan mengkreditkan
              saldo pendana setelah nominal serta referensinya cocok. Jalur
              otomatis dimatikan sementara. Simpan bukti transfer Anda.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={kirim} className="space-y-3">
            <div>
              <Label htmlFor="setoran-jumlah">Nominal setoran</Label>
              <Input
                id="setoran-jumlah"
                inputMode="numeric"
                className="mt-1 tabular-nums"
                placeholder="1.000.000"
                value={jumlah}
                onChange={(e) => setJumlah(kelompokkanDigit(e.target.value))}
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Minimal Rp100.000, maksimal Rp500.000.000 per setoran.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="setoran-metode">Metode</Label>
                <Select
                  value={metode}
                  onValueChange={(nilai) => setMetode(nilai as MetodeSetoran)}
                >
                  <SelectTrigger id="setoran-metode" className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="transfer">Transfer bank</SelectItem>
                    <SelectItem
                      value="qris"
                      disabled={instruksi?.qrisUrl == null}
                    >
                      QRIS
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="setoran-tanggal">Tanggal transfer</Label>
                <Input
                  id="setoran-tanggal"
                  type="date"
                  className="mt-1"
                  value={tanggal}
                  max={hariIni()}
                  onChange={(e) => setTanggal(e.target.value)}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="setoran-referensi">Nomor referensi / berita transfer</Label>
              <Input
                id="setoran-referensi"
                className="mt-1"
                placeholder="mis. TRF-882301"
                value={referensi}
                onChange={(e) => setReferensi(e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="setoran-bukti">Bukti transfer</Label>
              <Input
                id="setoran-bukti"
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                className="mt-1"
                onChange={(e) => setBukti(e.target.files?.[0] ?? null)}
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                JPG, PNG, WebP, atau PDF maksimal 5 MB.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                className="h-9"
                onClick={() => setBuka(false)}
                disabled={mengirim}
              >
                Batal
              </Button>
              <Button type="submit" className="h-9 gap-1.5" disabled={mengirim}>
                {mengirim ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Receipt className="size-3.5" aria-hidden="true" />
                )}
                {mengirim ? "Mengirim" : "Kirim setoran"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
