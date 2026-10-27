import type { FunctionReturnType } from "convex/server";
import { useMutation, useQuery } from "convex/react";
import {
  BadgeCheck,
  CalendarClock,
  Loader2,
  Pencil,
  Plus,
  Search,
  TicketPercent,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ReferralPanel } from "@/components/admin/ReferralPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useNilaiTertunda } from "@/hooks/use-validasi-tertunda";
import { LOAN_LIMITS } from "@/lib/loan";
import { kelompokkanDigit, formatRupiahAman } from "@/lib/money";
import { pesanHasilTerpotong } from "@/lib/pencarianNasabah";
import { isiTemplateVoucher, TEMPLATE_VOUCHER, type TemplateVoucher } from "@/lib/templateVoucher";
import {
  akhirHariVoucher,
  BATAS_PEMAKAIAN_MAKS,
  JENIS_VOUCHER,
  KELAS_STATUS_VOUCHER,
  LABEL_JENIS_VOUCHER,
  LABEL_STATUS_VOUCHER,
  labelNilaiVoucher,
  periksaNilaiVoucher,
  periksaUbahVoucher,
  satuanVoucher,
  sisaHariVoucher,
  tanggalInputVoucher,
  type JenisVoucher,
  type StatusVoucherTampil,
} from "@/lib/voucher";
import { formatTanggalWIB } from "@/lib/waktu";

type DataVoucher = NonNullable<
  FunctionReturnType<typeof api.voucher.daftarVoucherAdmin>
>;
type BarisVoucher = DataVoucher["item"][number];
type Nasabah = FunctionReturnType<typeof api.adminPengajuan.cariNasabah>["hasil"][number];

const SARINGAN_STATUS: { value: StatusVoucherTampil | "semua"; label: string }[] = [
  { value: "semua", label: "Semua status" },
  { value: "aktif", label: "Aktif" },
  { value: "kedaluwarsa", label: "Kedaluwarsa" },
  { value: "terpakai", label: "Habis terpakai" },
  { value: "dicabut", label: "Dicabut" },
];

const HARI_DEFAULT = 30;

type DrafTerbit = {
  penerima: Nasabah[];
  jenis: JenisVoucher;
  judul: string;
  nilai: string;
  minPokok: string;
  batasPemakaian: string;
  berlakuSampai: string;
};

function drafTerbit(): DrafTerbit {
  return {
    penerima: [],
    jenis: "diskon_admin",
    judul: "",
    nilai: "",
    minPokok: String(LOAN_LIMITS.minPokok),
    batasPemakaian: "1",
    berlakuSampai: tanggalInputVoucher(Date.now() + HARI_DEFAULT * 86_400_000),
  };
}

type DrafUbah = {
  voucher: BarisVoucher;
  judul: string;
  batasPemakaian: string;
  berlakuSampai: string;
};

/** Angka dari kolom teks; NaN bila kosong, supaya pemeriksaan bisa menolak. */
function angkaDari(teks: string): number {
  const digit = teks.replace(/\D/g, "");
  return digit === "" ? Number.NaN : Number(digit);
}

/**
 * Pengaturan voucher nasabah.
 *
 * Urutannya mengikuti pekerjaan yang sebenarnya: yang AKTIF dan berakhir dekat
 * dulu, baru formulir penerbitan. Voucher sendiri tetap dimiliki satu akun —
 * panel ini hanya mengatur kapan dan untuk siapa voucher terbit, bukan
 * menyalinnya ke nasabah lain.
 */
export function VoucherPanel() {
  const [bagian, setBagian] = useState<"voucher" | "referral">("voucher");
  const [cari, setCari] = useState("");
  const kueri = useNilaiTertunda(cari, 350);
  const [saringanStatus, setSaringanStatus] = useState<StatusVoucherTampil | "semua">(
    "semua",
  );
  const [saringanJenis, setSaringanJenis] = useState<JenisVoucher | "semua">("semua");

  const data = useQuery(api.voucher.daftarVoucherAdmin, {
    cari: kueri,
    status: saringanStatus,
    jenis: saringanJenis === "semua" ? undefined : saringanJenis,
  });

  const terbitkan = useMutation(api.voucher.terbitkanVoucher);
  const terbitkanMassal = useMutation(api.voucher.terbitkanVoucherMassal);
  const ubah = useMutation(api.voucher.ubahVoucher);
  const cabut = useMutation(api.voucher.cabutVoucher);

  const [terbitTerbuka, setTerbitTerbuka] = useState(false);
  const [draf, setDraf] = useState<DrafTerbit>(drafTerbit);
  const [cariPemilik, setCariPemilik] = useState("");
  const kueriPemilik = useNilaiTertunda(cariPemilik, 350);
  const hasilNasabah = useQuery(api.adminPengajuan.cariNasabah, {
    kueri: kueriPemilik,
  });

  const [drafUbah, setDrafUbah] = useState<DrafUbah | null>(null);
  const [dibatalkan, setDibatalkan] = useState<BarisVoucher | null>(null);
  const [alasan, setAlasan] = useState("");
  const [pesan, setPesan] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const [waktuTemplate] = useState(() => Date.now());

  const bukaTerbit = () => {
    setDraf(drafTerbit());
    setCariPemilik("");
    setPesan(null);
    setTerbitTerbuka(true);
  };

  /** Tambah satu penerima; klik ulang pada nama yang sama tidak menggandakan. */
  const tambahPenerima = (nasabah: Nasabah) => {
    setDraf((sebelumnya) =>
      sebelumnya.penerima.some((baris) => baris.userId === nasabah.userId)
        ? sebelumnya
        : { ...sebelumnya, penerima: [...sebelumnya.penerima, nasabah] },
    );
    setCariPemilik("");
  };

  const buangPenerima = (userId: Nasabah["userId"]) => {
    setDraf((sebelumnya) => ({
      ...sebelumnya,
      penerima: sebelumnya.penerima.filter((baris) => baris.userId !== userId),
    }));
  };

  /**
   * Template mengisi angka dan masa berlaku, tetapi tidak memilih penerima:
   * voucher selalu milik akun yang dipilih admin, bukan dibagikan ke semua.
   */
  const pakaiTemplateVoucher = (template: TemplateVoucher) => {
    const isi = isiTemplateVoucher(template, waktuTemplate);
    setDraf((sebelumnya) => ({
      ...sebelumnya,
      jenis: isi.jenis,
      judul: isi.judul,
      nilai:
        satuanVoucher(isi.jenis) === "rupiah"
          ? kelompokkanDigit(String(isi.nilai))
          : String(isi.nilai),
      minPokok: kelompokkanDigit(String(isi.minPokok)),
      batasPemakaian: String(isi.batasPemakaian),
      berlakuSampai: tanggalInputVoucher(isi.berlakuSampai),
    }));
    setPesan(null);
  };

  const kirimTerbit = async () => {
    if (draf.penerima.length === 0) {
      setPesan("Pilih minimal satu nasabah penerima voucher.");
      return;
    }
    const judul = draf.judul.trim();
    if (judul.length < 3 || judul.length > 80) {
      setPesan("Judul voucher harus 3–80 karakter.");
      return;
    }
    const nilai = angkaDari(draf.nilai);
    const nilaiGalat = periksaNilaiVoucher(draf.jenis, nilai);
    if (nilaiGalat !== null) {
      setPesan(nilaiGalat);
      return;
    }
    const minPokok = angkaDari(draf.minPokok);
    if (!Number.isSafeInteger(minPokok) || minPokok < LOAN_LIMITS.minPokok) {
      setPesan(
        `Minimal pengajuan tidak boleh di bawah ${formatRupiahAman(LOAN_LIMITS.minPokok)}.`,
      );
      return;
    }
    const batasPemakaian = angkaDari(draf.batasPemakaian);
    if (
      !Number.isSafeInteger(batasPemakaian) ||
      batasPemakaian < 1 ||
      batasPemakaian > BATAS_PEMAKAIAN_MAKS
    ) {
      setPesan(`Batas pemakaian harus 1 sampai ${BATAS_PEMAKAIAN_MAKS} kali.`);
      return;
    }
    const berlakuSampai = akhirHariVoucher(draf.berlakuSampai);
    if (berlakuSampai === null || berlakuSampai <= Date.now()) {
      setPesan("Masa berlaku harus tanggal yang valid dan belum lewat.");
      return;
    }

    setSibuk(true);
    setPesan(null);
    try {
      const dasar = {
        jenis: draf.jenis,
        judul,
        nilai,
        minPokok,
        batasPemakaian,
        berlakuSampai,
      };
      if (draf.penerima.length === 1) {
        const hasil = await terbitkan({
          ...dasar,
          pemilikId: draf.penerima[0].userId,
        });
        toast.success(`Voucher ${hasil.kode} terbit untuk ${draf.penerima[0].nama}.`);
      } else {
        const hasil = await terbitkanMassal({
          ...dasar,
          pemilikIds: draf.penerima.map((baris) => baris.userId),
        });
        toast.success(`Voucher terbit untuk ${hasil.jumlah} nasabah sekaligus.`);
      }
      setTerbitTerbuka(false);
    } catch (galat) {
      setPesan(galat instanceof Error ? galat.message : "Voucher gagal diterbitkan.");
    } finally {
      setSibuk(false);
    }
  };

  const bukaUbah = (baris: BarisVoucher) => {
    setDrafUbah({
      voucher: baris,
      judul: baris.judul,
      batasPemakaian: String(baris.batasPemakaian),
      berlakuSampai: tanggalInputVoucher(baris.berlakuSampai),
    });
    setPesan(null);
  };

  const kirimUbah = async () => {
    if (drafUbah === null) return;
    const batasPemakaian = angkaDari(drafUbah.batasPemakaian);
    const berlakuSampai = akhirHariVoucher(drafUbah.berlakuSampai);
    const galat = periksaUbahVoucher({
      judul: drafUbah.judul,
      batasPemakaian,
      berlakuSampai: berlakuSampai ?? undefined,
      terpakai: drafUbah.voucher.terpakai,
      sekarang: Date.now(),
    });
    if (galat !== null) {
      setPesan(galat);
      return;
    }
    if (berlakuSampai === null) {
      setPesan("Masa berlaku harus tanggal yang valid.");
      return;
    }

    setSibuk(true);
    setPesan(null);
    try {
      const hasil = await ubah({
        voucherId: drafUbah.voucher.id,
        judul: drafUbah.judul,
        batasPemakaian,
        berlakuSampai,
      });
      toast.success(
        hasil.perubahan === 0 ? "Tidak ada perubahan." : "Voucher diperbarui.",
      );
      setDrafUbah(null);
    } catch (galatServer) {
      setPesan(
        galatServer instanceof Error ? galatServer.message : "Voucher gagal diperbarui.",
      );
    } finally {
      setSibuk(false);
    }
  };

  const konfirmasiCabut = async () => {
    if (dibatalkan === null) return;
    setSibuk(true);
    try {
      await cabut({ voucherId: dibatalkan.id, alasan });
      toast.success(`Voucher ${dibatalkan.kode} dicabut.`);
      setDibatalkan(null);
      setAlasan("");
    } catch (galat) {
      toast.error(galat instanceof Error ? galat.message : "Voucher gagal dicabut.");
    } finally {
      setSibuk(false);
    }
  };

  const ringkas = data?.ringkas;

  return (
    <div className="space-y-4">
      {/* Dua bagian yang memang berbeda pekerjaan: menerbitkan voucher dan
          meninjau klaim referral. Sebelumnya keduanya bertumpuk dalam satu
          gulungan, sehingga klaim baru terkubur di bawah daftar voucher. */}
      <div
        role="tablist"
        aria-label="Bagian voucher"
        className="flex w-fit gap-1 rounded-xl border border-slate-200 bg-white p-1"
      >
        {(
          [
            { nilai: "voucher" as const, label: "Voucher" },
            { nilai: "referral" as const, label: "Referral" },
          ]
        ).map((pilihan) => (
          <button
            key={pilihan.nilai}
            type="button"
            role="tab"
            aria-selected={bagian === pilihan.nilai}
            onClick={() => setBagian(pilihan.nilai)}
            className={
              bagian === pilihan.nilai
                ? "rounded-lg bg-emerald-800 px-3 py-1.5 text-xs font-semibold text-white"
                : "rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
            }
          >
            {pilihan.label}
          </button>
        ))}
      </div>

      {bagian === "voucher" && (
        <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-navy">
            <TicketPercent className="size-4 text-primary" aria-hidden="true" />
            Voucher nasabah
          </h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Voucher hanya berlaku untuk pemiliknya. Potongan biaya admin membuat dana
            diterima lebih besar, potongan bunga menurunkan tagihan pinjaman harian, tambah
            tenor memundurkan jatuh tempo tanpa menaikkan bunga, dan tambah limit menaikkan
            batas pengajuan sekali pakai.
          </p>
        </div>
        <Button type="button" onClick={bukaTerbit} className="gap-1.5">
          <Plus className="size-4" aria-hidden="true" />
          Terbitkan voucher
        </Button>
      </div>

      {ringkas !== undefined && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KotakRingkas
            label="Aktif"
            nilai={`${ringkas.aktif}`}
            keterangan={`${formatRupiahAman(ringkas.nilaiAktif)} siap dipakai`}
          />
          <KotakRingkas
            label="Berakhir ≤ 7 hari"
            nilai={`${ringkas.hampirBerakhir}`}
            keterangan="Perpanjang atau biarkan habis"
          />
          <KotakRingkas
            label="Kedaluwarsa"
            nilai={`${ringkas.kedaluwarsa}`}
            keterangan="Masih bisa diperpanjang"
          />
          <KotakRingkas
            label="Habis / dicabut"
            nilai={`${ringkas.terpakai + ringkas.dicabut}`}
            keterangan={`${ringkas.terpakai} habis · ${ringkas.dicabut} dicabut`}
          />
        </div>
      )}

      <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <Input
            value={cari}
            onChange={(e) => setCari(e.target.value)}
            placeholder="Cari kode, judul, nama, atau email nasabah"
            aria-label="Cari voucher"
            className="pl-9"
          />
        </div>
        <Select
          value={saringanStatus}
          onValueChange={(nilai) =>
            setSaringanStatus(nilai as StatusVoucherTampil | "semua")
          }
        >
          <SelectTrigger className="sm:w-44" aria-label="Saring status voucher">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SARINGAN_STATUS.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={saringanJenis}
          onValueChange={(nilai) => setSaringanJenis(nilai as JenisVoucher | "semua")}
        >
          <SelectTrigger className="sm:w-48" aria-label="Saring jenis voucher">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="semua">Semua jenis</SelectItem>
            {JENIS_VOUCHER.map((jenis) => (
              <SelectItem key={jenis} value={jenis}>
                {LABEL_JENIS_VOUCHER[jenis]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {data === undefined ? (
        <div
          role="status"
          className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500"
        >
          Memuat voucher…
        </div>
      ) : data.item.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center sm:p-8">
          <p className="text-sm font-medium text-slate-800">
            {cari.trim() === "" && saringanStatus === "semua" && saringanJenis === "semua"
              ? "Belum ada voucher terbit."
              : "Tidak ada voucher yang cocok dengan saringan ini."}
          </p>
          <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-slate-500">
            Voucher apresiasi terbit otomatis saat pinjaman lunas. Voucher lain diterbitkan
            manual untuk satu nasabah, misalnya sebagai pengganti keluhan layanan.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="hidden border-b border-slate-200 bg-slate-50 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 md:grid md:grid-cols-[minmax(0,2fr)_minmax(0,1.6fr)_7rem_7rem_8rem_7rem] md:items-center md:gap-3">
            <span>Voucher</span>
            <span>Pemilik</span>
            <span>Nilai</span>
            <span>Kuota</span>
            <span>Berlaku</span>
            <span className="text-right">Aksi</span>
          </div>
          <ul className="divide-y divide-slate-100">
            {data.item.map((baris) => {
              const sisa = sisaHariVoucher(baris.berlakuSampai, data.sekarang);
              const bisaDiubah = baris.statusTampil === "aktif" || baris.statusTampil === "kedaluwarsa";
              return (
                <li
                  key={baris.id}
                  className="grid gap-2 px-4 py-3 transition-colors hover:bg-slate-50 md:grid-cols-[minmax(0,2fr)_minmax(0,1.6fr)_7rem_7rem_8rem_7rem] md:items-center md:gap-3"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[11px] text-slate-500">{baris.kode}</span>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${KELAS_STATUS_VOUCHER[baris.statusTampil]}`}
                      >
                        {LABEL_STATUS_VOUCHER[baris.statusTampil]}
                      </span>
                      {baris.sumber === "apresiasi" && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-sky-700/30 bg-sky-700/10 px-2 py-0.5 text-[10px] font-semibold text-sky-800">
                          <BadgeCheck className="size-3" aria-hidden="true" />
                          Apresiasi
                        </span>
                      )}
                      {baris.sumber === "referral" && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-700/30 bg-emerald-700/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                          <BadgeCheck className="size-3" aria-hidden="true" />
                          Referral
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-sm font-medium text-slate-900">
                      {baris.judul}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {LABEL_JENIS_VOUCHER[baris.jenis]}
                      {baris.minPokok > LOAN_LIMITS.minPokok
                        ? ` · min. ${formatRupiahAman(baris.minPokok)}`
                        : ""}
                    </p>
                  </div>

                  <div className="min-w-0 text-xs">
                    <p className="truncate font-medium text-slate-800">{baris.pemilik.nama}</p>
                    <p className="truncate text-[11px] text-slate-500">
                      {baris.pemilik.email ?? baris.pemilik.kodePeminjam ?? "Tanpa kontak"}
                    </p>
                  </div>

                  <div className="text-sm font-semibold text-emerald-800">
                    {labelNilaiVoucher(baris.jenis, baris.nilai)}
                  </div>

                  <div className="text-xs text-slate-600">
                    <span className="tabular-nums">
                      {baris.terpakai}/{baris.batasPemakaian}
                    </span>
                    <span className="text-slate-400"> terpakai</span>
                  </div>

                  <div className="text-xs text-slate-600">
                    <p className="inline-flex items-center gap-1">
                      <CalendarClock className="size-3.5 text-slate-400" aria-hidden="true" />
                      {formatTanggalWIB(baris.berlakuSampai)}
                    </p>
                    {baris.statusTampil === "aktif" && (
                      <p
                        className={
                          sisa <= 7
                            ? "text-[11px] font-medium text-amber-800"
                            : "text-[11px] text-slate-500"
                        }
                      >
                        sisa {sisa} hari
                      </p>
                    )}
                  </div>

                  <div className="flex items-center justify-end gap-1 md:justify-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="gap-1.5"
                      disabled={!bisaDiubah}
                      onClick={() => bukaUbah(baris)}
                    >
                      <Pencil className="size-3.5" aria-hidden="true" />
                      Ubah
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="gap-1.5 text-destructive hover:text-destructive"
                      disabled={baris.statusTampil !== "aktif"}
                      onClick={() => {
                        setDibatalkan(baris);
                        setAlasan("");
                      }}
                    >
                      <XCircle className="size-3.5" aria-hidden="true" />
                      Cabut
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
          {(data.dibatasi || data.total > data.item.length) && (
            <p className="border-t border-slate-100 px-4 py-2 text-[11px] text-slate-500">
              Menampilkan {data.item.length} dari {data.total} voucher yang cocok.
              {data.dibatasi
                ? " Hitungan di atas dibaca dari 500 voucher terbaru; arsip lebih lama tidak ikut dihitung."
                : " Persempit saringan atau pakai kolom cari untuk menemukan yang lain."}
            </p>
          )}
        </div>
      )}

      {/* ===== Terbitkan ===== */}
      <Sheet open={terbitTerbuka} onOpenChange={setTerbitTerbuka}>
        <SheetContent
          side="right"
          className="w-full gap-0 overflow-y-auto border-l border-slate-200 bg-white px-4 pb-8 sm:w-[46vw] sm:max-w-none sm:px-6"
        >
          <SheetHeader className="px-0 pt-4 pb-2 pr-10">
            <SheetTitle>Terbitkan voucher</SheetTitle>
            <SheetDescription>
              Pilih satu atau beberapa nasabah, lalu tentukan nilainya. Tiap nasabah menerima
              voucher sendiri dan voucher tidak bisa dipindahkan ke akun lain setelah terbit.
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-4">
            <div>
              <div className="flex items-baseline justify-between gap-2">
                <Label htmlFor="voucher-cari-nasabah">Nasabah penerima</Label>
                <span className="text-xs tabular-nums text-slate-400">
                  {draf.penerima.length} dipilih
                </span>
              </div>
              <Input
                id="voucher-cari-nasabah"
                className="mt-1"
                value={cariPemilik}
                onChange={(e) => setCariPemilik(e.target.value)}
                placeholder="Nama, email, NIK, atau kode nasabah"
              />
              <div className="mt-2 max-h-44 overflow-y-auto rounded-lg border border-slate-200">
                {hasilNasabah === undefined ? (
                  <p className="px-3 py-2 text-xs text-slate-500">Mencari nasabah…</p>
                ) : hasilNasabah.hasil.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-slate-500">
                    Tidak ada nasabah yang cocok.
                  </p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {hasilNasabah.hasil.map((nasabah) => {
                      const sudah = draf.penerima.some(
                        (baris) => baris.userId === nasabah.userId,
                      );
                      return (
                        <li key={nasabah.userId}>
                          <button
                            type="button"
                            disabled={sudah}
                            className="w-full px-3 py-2 text-left transition-colors hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none disabled:cursor-default disabled:bg-emerald-50/60"
                            onClick={() => tambahPenerima(nasabah)}
                          >
                            <span className="flex items-center justify-between gap-2">
                              <span className="block truncate text-sm font-medium text-slate-900">
                                {nasabah.nama}
                              </span>
                              {sudah && (
                                <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
                                  Terpilih
                                </span>
                              )}
                            </span>
                            <span className="block truncate text-[11px] text-slate-500">
                              {nasabah.email ?? "tanpa email"}
                              {nasabah.kodePeminjam === null
                                ? ""
                                : ` · ${nasabah.kodePeminjam}`}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {hasilNasabah?.dibatasi === true && (
                  <p className="border-t border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-800">
                    {pesanHasilTerpotong(hasilNasabah.jenis)}
                  </p>
                )}
              </div>
              {draf.penerima.length > 0 && (
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {draf.penerima.map((nasabah) => (
                    <li
                      key={nasabah.userId}
                      className="inline-flex items-center gap-1 rounded-full border border-emerald-700/30 bg-emerald-700/5 py-0.5 pl-2.5 pr-1 text-xs text-emerald-900"
                    >
                      <span className="max-w-40 truncate">{nasabah.nama}</span>
                      <button
                        type="button"
                        className="rounded-full p-0.5 hover:bg-emerald-700/10"
                        aria-label={`Keluarkan ${nasabah.nama} dari penerima`}
                        onClick={() => buangPenerima(nasabah.userId)}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-1 text-[11px] leading-4 text-slate-500">
                Satu voucher per nasabah. Pilih lebih dari satu untuk menerbitkan voucher yang
                sama sekaligus (maksimal 50 penerima).
              </p>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                Template siap pakai
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {TEMPLATE_VOUCHER.map((template) => (
                  <Button
                    key={template.id}
                    type="button"
                    variant="outline"
                    size="sm"
                    title={template.keterangan}
                    onClick={() => pakaiTemplateVoucher(template)}
                  >
                    {template.label}
                  </Button>
                ))}
              </div>
              <p className="mt-1 text-[11px] leading-4 text-slate-500">
                Template mengisi jenis, nilai, kuota, dan masa berlaku. Penerima tetap dipilih
                sendiri dan semua kolom masih bisa disunting.
              </p>
            </div>

            <div>
              <Label htmlFor="voucher-jenis">Jenis</Label>
              <Select
                value={draf.jenis}
                onValueChange={(nilai) =>
                  setDraf((sebelumnya) => ({ ...sebelumnya, jenis: nilai as JenisVoucher }))
                }
              >
                <SelectTrigger id="voucher-jenis" className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {JENIS_VOUCHER.map((jenis) => (
                    <SelectItem key={jenis} value={jenis}>
                      {LABEL_JENIS_VOUCHER[jenis]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-[11px] leading-4 text-slate-500">
                {draf.jenis === "boost_plafon"
                  ? "Nilai di bawah dibaca sebagai tambahan limit sekali pakai."
                  : draf.jenis === "diskon_bunga"
                    ? "Nilai di bawah adalah poin persen: 5 berarti bunga turun lima poin, bukan Rp5."
                    : draf.jenis === "tambah_tenor"
                      ? "Nilai di bawah adalah jumlah hari tambahan pada jatuh tempo."
                      : draf.jenis === "diskon_ujrah" || draf.jenis === "diskon_margin"
                        ? "Voucher akad syariah: potongan ini dibebankan ke porsi pengelola, hak pendana tetap utuh."
                        : "Nilai di bawah dibaca sebagai potongan biaya, tidak menambah limit."}
              </p>
            </div>

            <div>
              <Label htmlFor="voucher-judul">Judul yang dibaca nasabah</Label>
              <Input
                id="voucher-judul"
                className="mt-1"
                maxLength={80}
                value={draf.judul}
                placeholder="Contoh: Bebas biaya admin ulang tahun"
                onChange={(e) =>
                  setDraf((sebelumnya) => ({ ...sebelumnya, judul: e.target.value }))
                }
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="voucher-nilai">
                  {satuanVoucher(draf.jenis) === "rupiah"
                    ? "Nilai (Rp)"
                    : satuanVoucher(draf.jenis) === "persen"
                      ? "Potongan bunga (poin %)"
                      : "Tambahan tenor (hari)"}
                </Label>
                <Input
                  id="voucher-nilai"
                  className="mt-1 tabular-nums"
                  inputMode="numeric"
                  value={draf.nilai}
                  placeholder={
                    satuanVoucher(draf.jenis) === "rupiah"
                      ? "25.000"
                      : satuanVoucher(draf.jenis) === "persen"
                        ? "5"
                        : "7"
                  }
                  onChange={(e) =>
                    setDraf((sebelumnya) => ({
                      ...sebelumnya,
                      nilai:
                        satuanVoucher(sebelumnya.jenis) === "rupiah"
                          ? kelompokkanDigit(e.target.value)
                          : e.target.value.replace(/\D/g, "").slice(0, 2),
                    }))
                  }
                />
              </div>
              <div>
                <Label htmlFor="voucher-min">Minimal pengajuan (Rp)</Label>
                <Input
                  id="voucher-min"
                  className="mt-1 tabular-nums"
                  inputMode="numeric"
                  value={draf.minPokok}
                  onChange={(e) =>
                    setDraf((sebelumnya) => ({
                      ...sebelumnya,
                      minPokok: kelompokkanDigit(e.target.value),
                    }))
                  }
                />
              </div>
              <div>
                <Label htmlFor="voucher-batas">Batas pemakaian</Label>
                <Input
                  id="voucher-batas"
                  className="mt-1 tabular-nums"
                  inputMode="numeric"
                  value={draf.batasPemakaian}
                  onChange={(e) =>
                    setDraf((sebelumnya) => ({
                      ...sebelumnya,
                      batasPemakaian: e.target.value.replace(/\D/g, "").slice(0, 2),
                    }))
                  }
                />
              </div>
              <div>
                <Label htmlFor="voucher-berlaku">Berlaku sampai</Label>
                <Input
                  id="voucher-berlaku"
                  type="date"
                  className="mt-1"
                  value={draf.berlakuSampai}
                  onChange={(e) =>
                    setDraf((sebelumnya) => ({
                      ...sebelumnya,
                      berlakuSampai: e.target.value,
                    }))
                  }
                />
              </div>
            </div>

            {pesan !== null && (
              <p role="alert" className="text-sm text-destructive">
                {pesan}
              </p>
            )}
          </div>

          <SheetFooter className="mt-4 px-0">
            <Button
              type="button"
              className="w-full gap-1.5"
              disabled={sibuk}
              onClick={() => void kirimTerbit()}
            >
              {sibuk && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              {draf.penerima.length > 1
                ? `Terbitkan untuk ${draf.penerima.length} nasabah`
                : "Terbitkan untuk nasabah"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* ===== Ubah ===== */}
      <Sheet
        open={drafUbah !== null}
        onOpenChange={(terbuka) => {
          if (!terbuka) setDrafUbah(null);
        }}
      >
        <SheetContent
          side="right"
          className="w-full gap-0 overflow-y-auto border-l border-slate-200 bg-white px-4 pb-8 sm:w-[42vw] sm:max-w-none sm:px-6"
        >
          <SheetHeader className="px-0 pt-4 pb-2 pr-10">
            <SheetTitle>Ubah voucher</SheetTitle>
            <SheetDescription>
              Yang bisa diubah hanya judul, kuota, dan masa berlaku. Nilai dan pemilik
              dikunci karena sudah terbaca nasabah.
            </SheetDescription>
          </SheetHeader>

          {drafUbah !== null && (
            <div className="space-y-4">
              <dl className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                <div className="flex justify-between gap-2">
                  <dt>Kode</dt>
                  <dd className="font-mono text-slate-800">{drafUbah.voucher.kode}</dd>
                </div>
                <div className="mt-1 flex justify-between gap-2">
                  <dt>Pemilik</dt>
                  <dd className="truncate text-slate-800">{drafUbah.voucher.pemilik.nama}</dd>
                </div>
                <div className="mt-1 flex justify-between gap-2">
                  <dt>Nilai</dt>
                  <dd className="text-slate-800">
                    {labelNilaiVoucher(drafUbah.voucher.jenis, drafUbah.voucher.nilai)}
                  </dd>
                </div>
                <div className="mt-1 flex justify-between gap-2">
                  <dt>Sudah terpakai</dt>
                  <dd className="tabular-nums text-slate-800">
                    {drafUbah.voucher.terpakai} kali
                  </dd>
                </div>
              </dl>

              <div>
                <Label htmlFor="ubah-judul">Judul</Label>
                <Input
                  id="ubah-judul"
                  className="mt-1"
                  maxLength={80}
                  value={drafUbah.judul}
                  onChange={(e) =>
                    setDrafUbah((sebelumnya) =>
                      sebelumnya === null ? sebelumnya : { ...sebelumnya, judul: e.target.value },
                    )
                  }
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="ubah-batas">Batas pemakaian</Label>
                  <Input
                    id="ubah-batas"
                    className="mt-1 tabular-nums"
                    inputMode="numeric"
                    value={drafUbah.batasPemakaian}
                    onChange={(e) =>
                      setDrafUbah((sebelumnya) =>
                        sebelumnya === null
                          ? sebelumnya
                          : {
                              ...sebelumnya,
                              batasPemakaian: e.target.value.replace(/\D/g, "").slice(0, 2),
                            },
                      )
                    }
                  />
                  <p className="mt-1 text-[11px] text-slate-500">
                    Tidak bisa di bawah pemakaian yang sudah terjadi.
                  </p>
                </div>
                <div>
                  <Label htmlFor="ubah-berlaku">Berlaku sampai</Label>
                  <Input
                    id="ubah-berlaku"
                    type="date"
                    className="mt-1"
                    value={drafUbah.berlakuSampai}
                    onChange={(e) =>
                      setDrafUbah((sebelumnya) =>
                        sebelumnya === null
                          ? sebelumnya
                          : { ...sebelumnya, berlakuSampai: e.target.value },
                      )
                    }
                  />
                </div>
              </div>

              {pesan !== null && (
                <p role="alert" className="text-sm text-destructive">
                  {pesan}
                </p>
              )}

              <SheetFooter className="px-0">
                <Button
                  type="button"
                  className="w-full"
                  disabled={sibuk}
                  onClick={() => void kirimUbah()}
                >
                  {sibuk && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
                  Simpan perubahan
                </Button>
              </SheetFooter>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* ===== Cabut ===== */}
      <AlertDialog
        open={dibatalkan !== null}
        onOpenChange={(terbuka) => {
          if (!terbuka) setDibatalkan(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cabut voucher {dibatalkan?.kode}?</AlertDialogTitle>
            <AlertDialogDescription>
              Voucher langsung tidak bisa dipakai lagi. Barisnya tetap tersimpan agar kode
              yang sudah beredar masih bisa ditelusuri, dan alasannya masuk audit trail.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div>
            <Label htmlFor="alasan-cabut">Alasan pencabutan</Label>
            <Textarea
              id="alasan-cabut"
              className="mt-1"
              rows={3}
              maxLength={200}
              value={alasan}
              placeholder="Contoh: salah input nilai, voucher pengganti sudah diterbitkan."
              onChange={(e) => setAlasan(e.target.value)}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={sibuk}>Batal</AlertDialogCancel>
            <AlertDialogAction
              disabled={sibuk || alasan.trim().length < 3}
              onClick={(e) => {
                e.preventDefault();
                void konfirmasiCabut();
              }}
            >
              {sibuk && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              Cabut voucher
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
        </>
      )}
      {bagian === "referral" && <ReferralPanel />}
    </div>
  );
}

/** Satu kotak angka di kepala panel; tidak dipakai di luar berkas ini. */
function KotakRingkas({
  label,
  nilai,
  keterangan,
}: {
  label: string;
  nilai: string;
  keterangan: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{nilai}</p>
      <p className="mt-0.5 text-[11px] leading-4 text-slate-500">{keterangan}</p>
    </div>
  );
}
