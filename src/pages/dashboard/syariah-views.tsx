/**
 * Pengajuan akad syariah di dashboard peminjam.
 *
 * Peminjam memilih satu dari tiga akad, mengisi nominal dan tenor, lalu
 * melihat estimasi yang dihitung `lib/syariah/akad` — mesin yang sama dengan
 * server. Formulir tidak menghitung margin/ujrah sendiri dan tidak pernah
 * mengirim angka final: admin menetapkan margin Murabahah dan taksiran Rahn
 * saat keputusan.
 *
 * Persetujuan BUKAN pencairan. Kartu status memakai kalimat itu apa adanya,
 * supaya "disetujui" tidak dibaca sebagai dana yang sudah masuk.
 */
import { useMutation, useQuery } from "convex/react";
import {
  Check,
  HandCoins,
  Info,
  Package,
  Send,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { PemilihKatalog } from "@/components/syariah/PemilihKatalog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";
import { formatRupiah } from "@/lib/money";
import { isKycVerified } from "@/lib/kycStatus";
import {
  MAX_AKAD_SYARIAH,
  MIN_AKAD_SYARIAH,
  type JenisAkadSyariah,
  type RencanaAkadSyariah,
} from "@/lib/syariah/akad";
import {
  LABEL_JENIS_AKAD,
  LABEL_STATUS_PENGAJUAN_SYARIAH,
  rencanaPengajuanSyariah,
  susunPermintaanAjukanSyariah,
  TENOR_AKAD_OPTIONS,
  type StatusPengajuanSyariah,
  type TenorAkad,
} from "@/lib/syariah/pengajuan";
import {
  CATATAN_PENGIRIMAN,
  LABEL_JENIS_BARANG,
  labelNomorTujuan,
  nomorTujuanValid,
  type BarangKatalog,
} from "@/lib/syariah/katalog";
import { cn } from "@/lib/utils";

type PilihanAkad = {
  id: JenisAkadSyariah;
  label: string;
  ringkas: string;
  isi: string;
  Ikon: LucideIcon;
};

const PILIHAN_AKAD: readonly PilihanAkad[] = [
  {
    id: "murabahah",
    label: "Murabahah",
    ringkas: "Kredit barang",
    isi: "PINDAI membeli barang yang Anda pilih, lalu menjualnya dengan margin yang disepakati.",
    Ikon: Package,
  },
  {
    id: "rahn",
    label: "Rahn",
    ringkas: "Gadai syariah",
    isi: "Barang jaminan ditaksir, dana diserahkan, dan Anda membayar ujrah pemeliharaan.",
    Ikon: HandCoins,
  },
  {
    id: "qardh",
    label: "Qardh",
    ringkas: "Pinjaman kebajikan",
    isi: "Pokok kembali 100% tanpa margin dan tanpa ujrah.",
    Ikon: Wallet,
  },
] as const;

/** Pilihan akad — presentasional agar bisa dirender di uji markup. */
export function KartuPilihanAkad({
  nilai,
  onPilih,
  nonaktif = false,
}: {
  nilai: JenisAkadSyariah;
  onPilih: (jenis: JenisAkadSyariah) => void;
  nonaktif?: boolean;
}) {
  return (
    <div
      role="group"
      aria-label="Jenis akad syariah"
      className="grid gap-2 sm:grid-cols-3"
    >
      {PILIHAN_AKAD.map((akad) => {
        const aktif = akad.id === nilai;
        const Ikon = akad.Ikon;
        return (
          <button
            key={akad.id}
            type="button"
            aria-pressed={aktif}
            disabled={nonaktif}
            onClick={() => onPilih(akad.id)}
            className={cn(
              "flex min-h-24 flex-col items-start gap-1.5 rounded-xl border px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60",
              aktif
                ? "border-amber-600 bg-amber-50 text-amber-950"
                : "border-slate-200 bg-white text-slate-700 hover:border-amber-300 hover:bg-amber-50/40",
            )}
          >
            <span className="flex items-center gap-2 text-sm font-semibold">
              <Ikon className="size-4 shrink-0" aria-hidden />
              {akad.label}
            </span>
            <span className="text-[11px] font-medium leading-4 text-amber-900">
              {akad.ringkas}
            </span>
            <span className="text-[11px] leading-4 text-slate-600">{akad.isi}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Pratinjau angka akad dari mesin syariah — presentasional. */
export function PratinjauAkadSyariah({
  rencana,
}: {
  rencana: RencanaAkadSyariah;
}) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <p className="text-[11px] font-medium text-amber-900">
            Total kewajiban Anda
          </p>
          <p className="mt-0.5 text-lg font-semibold tabular-nums text-amber-950">
            {formatRupiah(rencana.totalKewajiban)}
          </p>
        </div>
        <div>
          <p className="text-[11px] font-medium text-slate-600">
            Nisbah pendana (85%)
          </p>
          <p className="mt-0.5 text-lg font-semibold tabular-nums text-navy">
            {formatRupiah(rencana.pendanaTerima)}
          </p>
        </div>
      </div>

      <dl className="mt-2 divide-y divide-amber-200/70 text-xs">
        {rencana.jenis === "murabahah" && rencana.hargaJual !== null && (
          <>
            <div className="flex items-baseline justify-between gap-3 py-1.5">
              <dt className="text-slate-600">Harga pokok</dt>
              <dd className="tabular-nums text-slate-900">
                {formatRupiah(rencana.pokok)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 py-1.5">
              <dt className="text-slate-600">
                Margin ({rencana.marginTotal > 0 ? "estimasi" : "0%"})
              </dt>
              <dd className="tabular-nums text-slate-900">
                {formatRupiah(rencana.marginTotal)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 py-1.5">
              <dt className="text-slate-600">Harga jual</dt>
              <dd className="tabular-nums font-medium text-slate-900">
                {formatRupiah(rencana.hargaJual)}
              </dd>
            </div>
          </>
        )}
        {rencana.jenis === "rahn" &&
          rencana.ujrahPerSiklus !== null &&
          rencana.jumlahSiklus !== null && (
            <>
              <div className="flex items-baseline justify-between gap-3 py-1.5">
                <dt className="text-slate-600">Nilai taksiran</dt>
                <dd className="tabular-nums text-slate-900">
                  {formatRupiah(rencana.nilaiTaksiran ?? 0)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3 py-1.5">
                <dt className="text-slate-600">
                  Ujrah 2% per 30 hari × {rencana.jumlahSiklus}
                </dt>
                <dd className="tabular-nums text-slate-900">
                  {formatRupiah(rencana.marginTotal)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3 py-1.5">
                <dt className="text-slate-600">Ujrah per 30 hari</dt>
                <dd className="tabular-nums text-slate-900">
                  {formatRupiah(rencana.ujrahPerSiklus)}
                </dd>
              </div>
            </>
          )}
        {rencana.jenis === "qardh" && (
          <div className="flex items-baseline justify-between gap-3 py-1.5">
            <dt className="text-slate-600">Margin</dt>
            <dd className="font-medium text-slate-900">Rp 0</dd>
          </div>
        )}
        <div className="flex items-baseline justify-between gap-3 py-1.5">
          <dt className="text-slate-600">Ujrah pengelola (15%)</dt>
          <dd className="tabular-nums text-slate-900">
            {formatRupiah(rencana.nisbahPlatform)}
          </dd>
        </div>
      </dl>
    </div>
  );
}

/** Lencana status pengajuan — satu warna per keadaan. */
export function LencanaStatusSyariah({
  status,
}: {
  status: StatusPengajuanSyariah;
}) {
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

function tanggal(ms: number): string {
  return new Date(ms).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Daftar pengajuan milik peminjam, dipakai di formulir dan tab Catatan
 * Pinjaman. Angka yang tampil adalah angka tersimpan di server, bukan hitungan
 * ulang klien.
 */
export function DaftarPengajuanSyariah({
  className = "",
  onBukaForm,
}: {
  className?: string;
  onBukaForm?: () => void;
}) {
  const data = useQuery(api.syariahPengajuan.daftarSaya);
  const batalkan = useMutation(api.syariahPengajuan.batalkan);
  const [membatalkan, setMembatalkan] = useState<string | null>(null);

  if (data === undefined) {
    return (
      <div className={`space-y-2 ${className}`} role="status" aria-live="polite">
        <span className="sr-only">Memuat pengajuan syariah…</span>
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className={className}>
        <div className="rounded-xl border border-dashed border-amber-300/70 bg-amber-50/40 px-4 py-5">
          <p className="text-sm font-semibold text-amber-950">
            Belum ada pengajuan akad syariah
          </p>
          <p className="mt-1 text-xs leading-5 text-amber-950/80">
            Pengajuan Murabahah, Rahn, atau Qardh yang Anda kirim akan tercatat
            di sini beserta keputusan petugas.
          </p>
          {onBukaForm !== undefined && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3 min-h-11 border-amber-700/40 text-amber-900 hover:bg-amber-100"
              onClick={onBukaForm}
            >
              Ajukan akad syariah
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <ul className={`space-y-2 ${className}`}>
      {data.map((row) => (
        <li
          key={row._id}
          className="rounded-xl border border-slate-200 bg-white px-3 py-3"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-navy">
                {LABEL_JENIS_AKAD[row.jenis]} · {row.nomorReferensi}
              </p>
              <p className="mt-0.5 text-[11px] leading-5 text-slate-600">
                Pokok {formatRupiah(row.pokok)} · tenor {row.tenorHari} hari ·
                total kewajiban {formatRupiah(row.totalKewajiban)} · diajukan{" "}
                {tanggal(row.dibuatPada)}
              </p>
            </div>
            <LencanaStatusSyariah status={row.status} />
          </div>

          <p className="mt-1.5 text-[11px] leading-5 text-slate-600">{row.tujuan}</p>

          {row.namaBarang !== null && (
            <p className="mt-1 text-[11px] leading-5 text-slate-700">
              <span className="font-semibold">
                {row.jenis === "rahn" ? "Jaminan:" : "Barang:"}
              </span>{" "}
              {row.namaBarang}
              {row.jenisBarang === null
                ? ""
                : ` · ${LABEL_JENIS_BARANG[row.jenisBarang]}`}
              {row.nomorTujuan === null ? "" : ` · tujuan ${row.nomorTujuan}`}
            </p>
          )}

          {row.status === "disetujui" && (
            <div className="mt-1.5 space-y-1.5">
              <p className="flex items-start gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] leading-5 text-emerald-900">
                <Check className="mt-0.5 size-3 shrink-0" aria-hidden />
                Angka akad sudah ditetapkan petugas. Pencairan mengikuti
                pencatatan akad; dana belum masuk sebelum akad dicatat.
              </p>
              {row.namaBarang !== null &&
                (row.statusPenyerahan === "terkirim" ? (
                  <p className="rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-[11px] leading-5 text-sky-900">
                    Barang sudah diserahkan
                    {row.diserahkanPada === null
                      ? ""
                      : ` ${tanggal(row.diserahkanPada)}`}
                    {row.referensiPenyerahan === null
                      ? ""
                      : ` · ${row.referensiPenyerahan}`}. Simpan referensi ini
                    untuk pencocokan bila ada kendala.
                  </p>
                ) : (
                  <p className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] leading-5 text-slate-600">
                    Barang belum ditandai terkirim. Petugas mencatat nomor resi,
                    ID transaksi, atau nomor token setelah mitra mengirim.
                  </p>
                ))}
            </div>
          )}
          {row.status === "ditolak" && row.alasanTolak !== null && (
            <p className="mt-1.5 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11px] leading-5 text-red-900">
              {row.alasanTolak}
            </p>
          )}
          {row.status === "diajukan" && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <p className="text-[11px] leading-5 text-muted-foreground">
                Menunggu keputusan petugas. Satu akun boleh punya satu pengajuan
                yang menunggu.
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="min-h-9 text-[11px] text-red-800 hover:bg-red-50"
                disabled={membatalkan === row._id}
                onClick={async () => {
                  setMembatalkan(row._id);
                  try {
                    await batalkan({ id: row._id });
                    toast.success("Pengajuan syariah dibatalkan.");
                  } catch (err) {
                    toast.error(
                      err instanceof Error
                        ? err.message
                        : "Pengajuan gagal dibatalkan.",
                    );
                  } finally {
                    setMembatalkan(null);
                  }
                }}
              >
                {membatalkan === row._id ? "Membatalkan…" : "Batalkan pengajuan"}
              </Button>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * Formulir pengajuan syariah. Semua query dan mutation berada di komponen ini;
 * bagian tampilan di atas tetap bebas klien Convex supaya bisa diuji.
 */
export function FormPengajuanSyariah({
  onBukaKyc,
}: {
  onBukaKyc?: () => void;
}) {
  const kyc = useQuery(api.kyc.kycSaya);
  const plafon = useQuery(api.nasabah.plafonRingkasSaya);
  const daftar = useQuery(api.syariahPengajuan.daftarSaya);
  const katalog = useQuery(api.katalog.daftarKatalog);
  const ajukan = useMutation(api.syariahPengajuan.ajukan);
  const batalkan = useMutation(api.syariahPengajuan.batalkan);

  const [jenis, setJenis] = useState<JenisAkadSyariah>("murabahah");
  const [pokok, setPokok] = useState(300_000);
  const [tenor, setTenor] = useState<TenorAkad>(30);
  const [tujuan, setTujuan] = useState("");
  const [namaBarang, setNamaBarang] = useState("");
  const [taksiranTeks, setTaksiranTeks] = useState("");
  /** Barang katalog terpilih; null berarti barang ditulis sendiri. */
  const [katalogId, setKatalogId] = useState<string | null>(null);
  const [nomorTujuan, setNomorTujuan] = useState("");
  const [pakaiKatalog, setPakaiKatalog] = useState(true);
  const [mengirim, setMengirim] = useState(false);
  const [membatalkan, setMembatalkan] = useState(false);

  const tersedia = plafon?.tersedia ?? null;
  const adaPlafon = tersedia !== null && tersedia >= MIN_AKAD_SYARIAH;
  const batasPokok =
    tersedia === null
      ? MAX_AKAD_SYARIAH
      : Math.min(MAX_AKAD_SYARIAH, Math.max(MIN_AKAD_SYARIAH, tersedia));

  const taksiran = Number(taksiranTeks.replace(/[^0-9]/g, ""));
  const menunggu = daftar?.find((row) => row.status === "diajukan") ?? null;
  const barangDipilih: BarangKatalog | null =
    jenis === "murabahah" && katalogId !== null
      ? katalog?.find((barang) => barang.kode === katalogId) ?? null
      : null;
  // Barang yang harganya melewati sisa plafon tidak dianggap terpilih, supaya
  // nominal yang dikirim selalu harga barang yang benar-benar bisa dipilih.
  const barangTerpilih =
    barangDipilih !== null && barangDipilih.harga <= batasPokok
      ? barangDipilih
      : null;
  const butuhNomorTujuan = barangTerpilih?.jenisBarang === "digital";

  // Nominal di atas sisa plafon dipotong saat dibaca, bukan dibiarkan lalu
  // ditolak server. Batas bawah tetap diperiksa mesin akad supaya pesannya
  // menyebut aturan yang sebenarnya.
  const pokokDipakai = Math.min(pokok, batasPokok);

  let rencana: RencanaAkadSyariah | null = null;
  let pesanRencana: string | null = null;
  try {
    rencana = rencanaPengajuanSyariah({
      jenis,
      pokok: pokokDipakai,
      tenorHari: tenor,
      ...(jenis === "rahn" ? { nilaiTaksiran: taksiran } : {}),
    });
  } catch (err) {
    pesanRencana =
      err instanceof Error ? err.message : "Angka akad belum bisa dihitung.";
  }

  if (
    kyc === undefined ||
    plafon === undefined ||
    daftar === undefined ||
    katalog === undefined
  ) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-4" role="status">
        <span className="sr-only">Memuat data pengajuan syariah…</span>
        <Skeleton className="h-5 w-40" />
        <Skeleton className="mt-3 h-24 w-full" />
      </div>
    );
  }

  if (!isKycVerified(kyc?.status)) {
    return (
      <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-4">
        <p className="text-sm font-semibold text-amber-950">
          Verifikasi KYC diperlukan sebelum mengajukan akad
        </p>
        <p className="mt-1 text-xs leading-5 text-amber-950/80">
          Pengajuan syariah memakai identitas yang sudah diverifikasi, sama
          seperti pinjaman konvensional. Selesaikan KYC lebih dulu.
        </p>
        {onBukaKyc !== undefined && (
          <Button
            type="button"
            className="mt-3 min-h-11 bg-emerald-800 text-white hover:bg-emerald-900"
            onClick={onBukaKyc}
          >
            Buka verifikasi KYC
          </Button>
        )}
      </div>
    );
  }

  if (menunggu !== null) {
    return (
      <div className="rounded-2xl border border-amber-300 bg-amber-50/60 p-4">
        <p className="text-sm font-semibold text-amber-950">
          Pengajuan {LABEL_JENIS_AKAD[menunggu.jenis]} sedang menunggu keputusan
        </p>
        <p className="mt-1 text-xs leading-5 text-amber-950/80">
          {menunggu.nomorReferensi} · pokok {formatRupiah(menunggu.pokok)} · tenor{" "}
          {menunggu.tenorHari} hari. Hasilnya muncul di tab Catatan Pinjaman.
          Satu akun hanya boleh punya satu pengajuan yang menunggu.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3 min-h-11 border-amber-700/40 text-amber-900 hover:bg-amber-100"
          disabled={membatalkan}
          onClick={async () => {
            setMembatalkan(true);
            try {
              await batalkan({ id: menunggu._id });
              toast.success("Pengajuan syariah dibatalkan.");
            } catch (err) {
              toast.error(
                err instanceof Error ? err.message : "Pengajuan gagal dibatalkan.",
              );
            } finally {
              setMembatalkan(false);
            }
          }}
        >
          {membatalkan ? "Membatalkan…" : "Batalkan dan ajukan ulang"}
        </Button>
      </div>
    );
  }

  if (!adaPlafon) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
        <p className="text-sm font-semibold text-slate-900">
          Belum ada sisa plafon untuk akad syariah
        </p>
        <p className="mt-1 text-xs leading-5 text-slate-600">
          Plafon dipakai bersama oleh pinjaman dan akad. Lunasi kewajiban
          berjalan lebih dulu, atau hubungi tim PINDAI bila batasnya perlu
          ditinjau.
        </p>
      </div>
    );
  }

  const bisaKirim =
    rencana !== null &&
    tujuan.trim().length >= 5 &&
    (jenis === "qardh" || namaBarang.trim().length >= 3) &&
    (jenis !== "murabahah" || !pakaiKatalog || barangTerpilih !== null) &&
    (!butuhNomorTujuan || nomorTujuanValid(nomorTujuan)) &&
    !mengirim;

  return (
    <section aria-labelledby="judul-akad-syariah" className="min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 id="judul-akad-syariah" className="text-base font-semibold text-navy">
            Ajukan akad syariah
          </h3>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
            Pilih akad dan barangnya, lalu kirim. Petugas menetapkan margin
            Murabahah atau taksiran Rahn sebelum akad dicatat.
          </p>
        </div>
        <span className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-[11px] font-medium tabular-nums text-amber-900">
          Sisa plafon {formatRupiah(tersedia ?? 0)}
        </span>
      </div>

      <div className="mt-3">
        <Label className="text-xs">Jenis akad</Label>
        <div className="mt-1.5">
          <KartuPilihanAkad nilai={jenis} onPilih={setJenis} nonaktif={mengirim} />
        </div>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="syariah-pokok">
            {jenis === "murabahah"
              ? "Harga barang"
              : jenis === "rahn"
                ? "Dana yang dibutuhkan"
                : "Pokok pinjaman"}
          </Label>
          <Input
            id="syariah-pokok"
            type="number"
            inputMode="numeric"
            min={MIN_AKAD_SYARIAH}
            max={batasPokok}
            step={50_000}
            value={pokokDipakai}
            disabled={mengirim || barangTerpilih !== null}
            onChange={(event) => {
              const angka = Number(event.target.value);
              if (Number.isFinite(angka)) setPokok(Math.floor(angka));
            }}
            className="mt-1"
          />
          <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
            {barangTerpilih === null
              ? `${formatRupiah(pokokDipakai)} · batas ${formatRupiah(batasPokok)}`
              : `Harga katalog · batas ${formatRupiah(batasPokok)}`}
          </p>
        </div>

        <div>
          <Label className="text-xs">Tenor</Label>
          <div
            role="group"
            aria-label="Tenor akad"
            className="mt-1 flex flex-wrap gap-2"
          >
            {TENOR_AKAD_OPTIONS.map((hari) => (
              <button
                key={hari}
                type="button"
                aria-pressed={tenor === hari}
                disabled={mengirim}
                onClick={() => setTenor(hari)}
                className={cn(
                  "min-h-11 rounded-lg border px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
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
      </div>

      {jenis === "murabahah" && (
        <div className="mt-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <Label>Barang yang dibiayai</Label>
            <button
              type="button"
              disabled={mengirim}
              onClick={() => {
                setPakaiKatalog((sebelumnya) => !sebelumnya);
                setKatalogId(null);
                setNomorTujuan("");
                setNamaBarang("");
              }}
              className="text-[11px] font-semibold text-amber-900 underline underline-offset-2 hover:text-amber-950 disabled:opacity-60"
            >
              {pakaiKatalog ? "Tulis barang sendiri" : "Pilih dari katalog"}
            </button>
          </div>

          {pakaiKatalog ? (
            <PemilihKatalog
              daftar={katalog}
              nilai={barangTerpilih?.kode ?? null}
              batasHarga={batasPokok}
              nonaktif={mengirim}
              onPilih={(barang) => {
                setKatalogId(barang.kode);
                setPokok(barang.harga);
                setNamaBarang(barang.nama);
                setNomorTujuan("");
              }}
            />
          ) : (
            <Input
              id="syariah-barang"
              value={namaBarang}
              maxLength={160}
              disabled={mengirim}
              placeholder="Mesin jahit industri"
              onChange={(event) => setNamaBarang(event.target.value)}
              className="mt-1"
            />
          )}

          {barangTerpilih !== null && (
            <div className="mt-2 rounded-xl border border-amber-300/70 bg-amber-50/60 px-3 py-2.5">
              <p className="text-[11px] font-semibold tabular-nums text-amber-950">
                {barangTerpilih.nama} · {formatRupiah(barangTerpilih.harga)}
              </p>
              <p className="mt-0.5 text-[11px] leading-5 text-amber-950/80">
                {CATATAN_PENGIRIMAN[barangTerpilih.jenisBarang]}
              </p>
              {barangTerpilih.jenisBarang === "digital" && (
                <div className="mt-2">
                  <Label
                    htmlFor="syariah-nomor-tujuan"
                    className="text-[11px]"
                  >
                    {labelNomorTujuan(barangTerpilih)}
                  </Label>
                  <Input
                    id="syariah-nomor-tujuan"
                    inputMode="numeric"
                    value={nomorTujuan}
                    maxLength={24}
                    disabled={mengirim}
                    placeholder={
                      barangTerpilih.kategori === "Token & tagihan"
                        ? "11-12 angka dari meter/struk"
                        : "081234567890"
                    }
                    onChange={(event) => setNomorTujuan(event.target.value)}
                    className="mt-1 bg-white"
                  />
                  <p className="mt-1 text-[11px] leading-5 text-amber-950/80">
                    Produk dikirim ke nomor ini setelah akad dicatat, bukan
                    saldo dompet yang bisa dicairkan.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {jenis === "rahn" && (
        <div className="mt-3">
          <Label htmlFor="syariah-barang">Barang jaminan</Label>
          <Input
            id="syariah-barang"
            value={namaBarang}
            maxLength={160}
            disabled={mengirim}
            placeholder="Motor Honda Vario 2020"
            onChange={(event) => setNamaBarang(event.target.value)}
            className="mt-1"
          />
        </div>
      )}

      {jenis === "rahn" && (
        <div className="mt-3">
          <Label htmlFor="syariah-taksiran">Perkiraan nilai taksiran</Label>
          <Input
            id="syariah-taksiran"
            type="number"
            inputMode="numeric"
            min={0}
            step={50_000}
            value={taksiranTeks}
            disabled={mengirim}
            placeholder="2000000"
            onChange={(event) => setTaksiranTeks(event.target.value)}
            className="mt-1"
          />
          <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
            Angka ini perkiraan Anda. Petugas menetapkan taksiran final saat
            keputusan.
          </p>
        </div>
      )}

      <div className="mt-3">
        <Label htmlFor="syariah-tujuan">Tujuan pembiayaan</Label>
        <Input
          id="syariah-tujuan"
          value={tujuan}
          maxLength={300}
          disabled={mengirim}
          placeholder="Modal usaha, biaya sekolah, atau kebutuhan lain"
          onChange={(event) => setTujuan(event.target.value)}
          className="mt-1"
        />
        <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
          Tulis 5-300 karakter. Tujuan yang jelas mempercepat pemeriksaan.
        </p>
      </div>

      <div className="mt-3">
        {rencana !== null ? (
          <PratinjauAkadSyariah rencana={rencana} />
        ) : (
          <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[11px] leading-5 text-slate-600">
            {pesanRencana ?? "Lengkapi angka untuk melihat pratinjau akad."}
          </p>
        )}
      </div>

      <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-5 text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        {jenis === "murabahah"
          ? "Estimasi memakai margin 15%. Margin final ditetapkan petugas dan disepakati sebelum akad."
          : jenis === "rahn"
            ? "Ujrah 2% dari taksiran per 30 hari. Taksiran final ditetapkan petugas."
            : "Qardh tidak mengambil margin atau ujrah. Pokok kembali 100%."}
      </p>

      <Button
        type="button"
        className="mt-3 min-h-11 w-full gap-2 bg-emerald-800 text-white hover:bg-emerald-900 sm:w-auto"
        disabled={!bisaKirim}
        onClick={async () => {
          if (rencana === null) return;
          setMengirim(true);
          try {
            const hasil = await ajukan(
              susunPermintaanAjukanSyariah({
                jenis,
                pokok: rencana.pokok,
                tenorHari: tenor,
                tujuan,
                namaBarang,
                ...(jenis === "rahn" ? { nilaiTaksiran: taksiran } : {}),
                katalog: barangTerpilih,
                nomorTujuan,
              }),
            );
            toast.success(`Pengajuan ${hasil.nomorReferensi} terkirim.`);
            setTujuan("");
            setNamaBarang("");
            setTaksiranTeks("");
            setKatalogId(null);
            setNomorTujuan("");
          } catch (err) {
            toast.error(
              err instanceof Error ? err.message : "Pengajuan gagal dikirim.",
            );
          } finally {
            setMengirim(false);
          }
        }}
      >
        <Send className="size-4" aria-hidden />
        {mengirim ? "Mengirim…" : "Kirim pengajuan akad"}
      </Button>
      <p className="mt-1.5 text-[11px] leading-5 text-muted-foreground">
        Pengajuan belum menjadi akad. Persetujuan petugas menetapkan angka akad;
        pencairan dana mengikuti pencatatan akad PINDAI.
      </p>
    </section>
  );
}

/** Bagian formulir syariah di tab Ajukan Pinjaman. */
export function SyariahSection({ onBukaKyc }: { onBukaKyc?: () => void }) {
  return (
    <div className="rounded-2xl border border-amber-300/60 bg-[#fbf7ec] p-4 sm:p-5">
      <FormPengajuanSyariah onBukaKyc={onBukaKyc} />
    </div>
  );
}
