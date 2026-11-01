import type { FunctionReturnType } from "convex/server";
import { useMutation, useQuery } from "convex/react";
import {
  CalendarClock,
  Info,
  Loader2,
  Pencil,
  Percent,
  Plus,
  Trash2,
  X,
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
import { EfektivitasPromoBunga } from "@/components/admin/EfektivitasPromoBunga";
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
import { Switch } from "@/components/ui/switch";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { persenBungaHarian, TENOR_HARIAN_MAKS, TENOR_OPTIONS } from "@/lib/loan";
import { formatRupiahAman } from "@/lib/money";
import {
  BATAS_PROMO_BUNGA,
  JENIS_PROMO_BUNGA,
  KELAS_STATUS_PROMO_BUNGA,
  LABEL_STATUS_PROMO_BUNGA,
  LANTAI_BUNGA_PROMO_PERSEN,
  periksaIsiPromoBunga,
  pratinjauPromoBunga,
  type JenisPromoBunga,
  type StatusPromoBunga,
} from "@/lib/promoBunga";
import {
  formatPeriodePromo,
  msKeTanggalInput,
  tanggalKeMsWIB,
} from "@/lib/promoPinjaman";
import {
  isiTemplatePromoBunga,
  TEMPLATE_PROMO_BUNGA,
  type TemplatePromoBunga,
} from "@/lib/templatePromoBunga";
import { cn } from "@/lib/utils";

type BarisPromo = FunctionReturnType<typeof api.promoBunga.daftar>[number];

type Draf = {
  id?: Id<"promoBunga">;
  jenis: JenisPromoBunga;
  nama: string;
  persenBunga: string;
  potonganPersen: string;
  tenor: number[];
  mulai: string;
  selesai: string;
  aktif: boolean;
  /** Boleh ditumpuk voucher potongan bunga. */
  bolehVoucher: boolean;
  /** Pagu subsidi dalam rupiah sebagai teks; kosong = tanpa pagu. */
  paguSubsidi: string;
};

function drafBaru(): Draf {
  const sekarang = Date.now();
  return {
    jenis: "bunga_pengganti",
    nama: "",
    persenBunga: "15",
    potonganPersen: "5",
    tenor: [7],
    mulai: msKeTanggalInput(sekarang),
    selesai: msKeTanggalInput(sekarang + 14 * 86_400_000),
    aktif: true,
    bolehVoucher: true,
    paguSubsidi: "",
  };
}

function drafDari(row: BarisPromo): Draf {
  return {
    id: row._id,
    jenis: row.jenis,
    nama: row.nama,
    persenBunga: row.persenBunga === 0 ? "" : String(row.persenBunga),
    potonganPersen:
      row.potonganPersen === undefined ? "5" : String(row.potonganPersen),
    tenor: [...row.tenor],
    mulai: msKeTanggalInput(row.mulai),
    selesai: msKeTanggalInput(row.selesai),
    aktif: row.aktif,
    bolehVoucher: row.bolehVoucher,
    paguSubsidi: row.paguSubsidi === null ? "" : String(row.paguSubsidi),
  };
}

/** Tarif matriks tiap tier untuk satu tenor — dipakai pratinjau, bukan tebakan. */
function normalPerTenor(tenor: number): { tier1: number; tier2: number; tier3: number } {
  return {
    tier1: persenBungaHarian(100_000, tenor) ?? 0,
    tier2: persenBungaHarian(500_000, tenor) ?? 0,
    tier3: persenBungaHarian(1_000_000, tenor) ?? 0,
  };
}

const STATUS_URUT: Record<StatusPromoBunga, number> = {
  berjalan: 0,
  dijadwalkan: 1,
  nonaktif: 2,
  berakhir: 3,
};

/**
 * Promo BUNGA pinjaman harian.
 *
 * Dipisah dari kampanye teks di atasnya karena akibatnya berbeda: yang ini
 * mengubah angka kontrak, bukan sekadar kalimat di banner. Karena itu daftar
 * menampilkan bunga normal tiap tier sebagai pembanding, dan formulir
 * mempratinjau potongan nyata sebelum disimpan.
 */
export function PromoBungaPanel() {
  const daftar = useQuery(api.promoBunga.daftar);
  const simpan = useMutation(api.promoBunga.simpan);
  const setAktif = useMutation(api.promoBunga.setAktif);
  const hapus = useMutation(api.promoBunga.hapus);

  const [terbuka, setTerbuka] = useState(false);
  const [draf, setDraf] = useState<Draf>(drafBaru);
  const [tenorLain, setTenorLain] = useState("");
  const [pesan, setPesan] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const [dihapus, setDihapus] = useState<{ id: Id<"promoBunga">; nama: string } | null>(
    null,
  );
  // Satu acuan waktu untuk seluruh kartu template: tanpa ini tanggal kartu
  // bisa berbeda satu sama lain bila render terjadi tepat lewat tengah malam.
  const [waktuTemplate] = useState(() => Date.now());

  const bukaBaru = () => {
    setDraf(drafBaru());
    setTenorLain("");
    setPesan(null);
    setTerbuka(true);
  };

  /**
   * Isi formulir dari template, lalu buka laci supaya angka dan tanggalnya
   * terlihat sebelum disimpan. Template berlaku sebagai draf, bukan promo
   * yang langsung menyala.
   */
  const pakaiTemplate = (template: TemplatePromoBunga) => {
    const isi = isiTemplatePromoBunga(template, waktuTemplate);
    setDraf({
      jenis: isi.jenis,
      nama: isi.nama,
      persenBunga: String(isi.persenBunga),
      potonganPersen: String(isi.potonganPersen ?? 5),
      tenor: [...isi.tenor],
      mulai: msKeTanggalInput(isi.mulai),
      selesai: msKeTanggalInput(isi.selesai),
      aktif: true,
      // Template hanya mengisi angka kampanye; pagar uang dibiarkan kosong
      // supaya admin memilih sendiri, bukan mewarisi nilai dari template.
      bolehVoucher: true,
      paguSubsidi: "",
    });
    setTenorLain("");
    setPesan(null);
    setTerbuka(true);
  };

  const bukaSunting = (row: BarisPromo) => {
    setDraf(drafDari(row));
    setTenorLain("");
    setPesan(null);
    setTerbuka(true);
  };

  const ubahTenor = (tenor: number, dicentang: boolean) => {
    setDraf((sebelumnya) => ({
      ...sebelumnya,
      tenor: dicentang
        ? [...sebelumnya.tenor, tenor].sort((a, b) => a - b)
        : sebelumnya.tenor.filter((nilai) => nilai !== tenor),
    }));
  };

  /**
   * Tenor di luar 7/14/21/28 dipilih lewat tanggal jatuh tempo nasabah.
   * Panel menyimpan angka harinya, bukan tanggal, supaya promo tetap berlaku
   * untuk setiap pengajuan yang jatuh pada tenor tersebut.
   */
  const tambahTenorLain = () => {
    const nilai = Number(tenorLain);
    if (
      !Number.isInteger(nilai) ||
      nilai < TENOR_OPTIONS[0] ||
      nilai > TENOR_HARIAN_MAKS
    ) {
      setPesan(
        `Tenor harus angka bulat ${TENOR_OPTIONS[0]}–${TENOR_HARIAN_MAKS} hari.`,
      );
      return;
    }
    if (draf.tenor.includes(nilai)) {
      setPesan(`${nilai} hari sudah dipilih.`);
      return;
    }
    setDraf((sebelumnya) => ({
      ...sebelumnya,
      tenor: [...sebelumnya.tenor, nilai].sort((a, b) => a - b),
    }));
    setTenorLain("");
    setPesan(null);
  };

  const hapusTenor = (tenor: number) => {
    setDraf((sebelumnya) => ({
      ...sebelumnya,
      tenor: sebelumnya.tenor.filter((nilai) => nilai !== tenor),
    }));
  };

  const kirim = async () => {
    const mulai = tanggalKeMsWIB(draf.mulai);
    const selesai = tanggalKeMsWIB(draf.selesai, true);
    if (mulai === null || selesai === null) {
      setPesan("Lengkapi tanggal mulai dan tanggal selesai.");
      return;
    }
    const persenBunga = Number(draf.persenBunga);
    const potonganPersen = Number(draf.potonganPersen);
    const paguTeks = draf.paguSubsidi.trim();
    const paguSubsidi =
      paguTeks === ""
        ? undefined
        : Number(paguTeks.replace(/[^\d]/g, ""));
    if (paguSubsidi !== undefined && !Number.isFinite(paguSubsidi)) {
      setPesan("Pagu subsidi harus angka rupiah, atau kosongkan bila tanpa pagu.");
      return;
    }
    const isi = {
      jenis: draf.jenis,
      nama: draf.nama,
      // Bunga final hanya dipakai jenis pengganti; jenis lain menyimpan 0 agar
      // laporan dan pemilihan tidak salah membaca angka yang tidak berlaku.
      persenBunga:
        draf.jenis === "bunga_pengganti" ? persenBunga : 0,
      potonganPersen:
        draf.jenis === "potongan_bunga" ? potonganPersen : undefined,
      tenor: draf.tenor,
      mulai,
      selesai,
      aktif: draf.aktif,
      bolehVoucher: draf.bolehVoucher,
      paguSubsidi,
    };
    const kesalahan = periksaIsiPromoBunga(isi);
    if (kesalahan.length > 0) {
      setPesan(kesalahan[0]);
      return;
    }

    setSibuk(true);
    setPesan(null);
    try {
      await simpan({ ...isi, id: draf.id });
      toast.success(draf.id === undefined ? "Promo bunga dibuat." : "Promo bunga diperbarui.");
      setTerbuka(false);
    } catch (galat) {
      setPesan(galat instanceof Error ? galat.message : "Promo bunga gagal disimpan.");
    } finally {
      setSibuk(false);
    }
  };

  const ubahStatus = async (row: BarisPromo, aktif: boolean) => {
    try {
      await setAktif({ id: row._id, aktif });
      toast.success(aktif ? `"${row.nama}" dinyalakan.` : `"${row.nama}" dimatikan.`);
    } catch (galat) {
      toast.error(galat instanceof Error ? galat.message : "Status promo gagal diubah.");
    }
  };

  const konfirmasiHapus = async () => {
    if (dihapus === null) return;
    setSibuk(true);
    try {
      await hapus({ id: dihapus.id });
      toast.success("Promo bunga dihapus.");
      setDihapus(null);
    } catch (galat) {
      toast.error(galat instanceof Error ? galat.message : "Promo bunga gagal dihapus.");
    } finally {
      setSibuk(false);
    }
  };

  const persenPratinjau = Number(draf.persenBunga);
  const potonganPratinjau = Number(draf.potonganPersen);
  const pratinjau = pratinjauPromoBunga(
    draf.tenor,
    {
      jenis: draf.jenis,
      persenBunga: Number.isFinite(persenPratinjau) ? persenPratinjau : 0,
      potonganPersen: Number.isFinite(potonganPratinjau)
        ? potonganPratinjau
        : 0,
    },
    normalPerTenor,
  );
  const urut = daftar === undefined ? [] : [...daftar].sort(
    (a, b) =>
      STATUS_URUT[a.status] - STATUS_URUT[b.status] ||
      b.diperbaruiPada - a.diperbaruiPada,
  );

  return (
    <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900">
            <Percent className="size-4 text-primary" aria-hidden="true" />
            Promo pinjaman
          </h3>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Tiga jenis kampanye: <strong>bunga pengganti</strong>,{" "}
            <strong>potongan bunga</strong>, dan <strong>bebas biaya admin</strong>. Satu
            pengajuan memakai satu kampanye terbaik yang aktif pada tenor dan tanggalnya.
            Pinjaman yang sudah terbit tidak berubah saat promo dimatikan. Hak pendana tetap dihitung dari tarif normal, bukan dipotong dari imbal hasil pendana.
          </p>
        </div>
        <Button type="button" onClick={bukaBaru} className="gap-1.5">
          <Plus className="size-4" aria-hidden="true" />
          Buat promo
        </Button>
      </div>

      <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-900">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        <span>
          Selisih bunga dan biaya admin yang dibebaskan ditanggung platform dari margin
          pengelola. Imbal hasil penyedia dana tetap dihitung dari tarif normal, tidak
          ikut turun saat promo dipakai. Pastikan totalnya masih menutup biaya sebelum
          dinyalakan.
        </span>
      </p>

      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
          Template siap pakai
        </p>
        <ul className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {TEMPLATE_PROMO_BUNGA.map((template) => {
            const isi = isiTemplatePromoBunga(template, waktuTemplate);
            return (
              <li
                key={template.id}
                className="flex flex-col justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3 transition-colors hover:border-primary/30 hover:bg-white"
              >
                <div>
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900">{template.label}</p>
                    <span className="text-sm font-semibold tabular-nums text-emerald-800">
                      {isi.jenis === "bebas_admin"
                        ? "Rp0 admin"
                        : isi.jenis === "potongan_bunga"
                          ? `−${isi.potonganPersen ?? 0} poin`
                          : `${isi.persenBunga}%`}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] leading-4 text-slate-600">
                    {template.keterangan}
                  </p>
                  <p className="mt-1.5 text-[11px] text-slate-500">
                    tenor {isi.tenor.join(" / ")} hari ·{" "}
                    {formatPeriodePromo(isi.mulai, isi.selesai)}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => pakaiTemplate(template)}
                >
                  Pakai template
                </Button>
              </li>
            );
          })}
        </ul>
        <p className="mt-1 text-[11px] leading-4 text-slate-500">
          Template mengisi jenis manfaat, nama, tenor, dan tanggal. Periksa angkanya lalu
          simpan; semua kolom masih bisa disunting.
        </p>
      </div>

      {daftar === undefined ? (
        <div role="status" className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
          Memuat promo bunga…
        </div>
      ) : urut.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/60 p-6 text-center">
          <p className="text-sm font-medium text-slate-800">Belum ada promo bunga.</p>
          <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-slate-500">
            Buat satu kampanye, mis. bunga 15% untuk tenor 7 hari pada rentang tanggal
            tertentu. Selama aktif, formulir pengajuan memakai angka promo itu.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {urut.map((row) => (
            <li
              key={row._id}
              className="rounded-xl border border-slate-200 px-3 py-3 transition-colors hover:bg-slate-50 sm:px-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                        KELAS_STATUS_PROMO_BUNGA[row.status],
                      )}
                    >
                      {LABEL_STATUS_PROMO_BUNGA[row.status]}
                    </span>
                    <p className="truncate text-sm font-semibold text-slate-900">{row.nama}</p>
                  </div>
                  <p className="mt-1 text-sm text-slate-700">
                    <span className="text-base font-semibold tabular-nums text-emerald-800">
                      {row.jenis === "bebas_admin"
                        ? "Bebas biaya admin"
                        : row.jenis === "potongan_bunga"
                          ? `Potongan ${row.potonganPersen ?? 0} poin`
                          : `${row.persenBunga}%`}
                    </span>{" "}
                    untuk tenor {row.tenor.join(" / ")} hari{" "}
                    <span className="text-slate-400">·</span>{" "}
                    <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                      <CalendarClock className="size-3.5" aria-hidden="true" />
                      {formatPeriodePromo(row.mulai, row.selesai)}
                    </span>
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500">
                    <span>
                      {row.paguSubsidi === null
                        ? "Tanpa pagu subsidi"
                        : `Pagu subsidi ${formatRupiahAman(row.paguSubsidi)}`}
                    </span>
                    <span className="text-slate-300">·</span>
                    <span>
                      {row.bolehVoucher
                        ? "boleh digabung voucher bunga"
                        : "tanpa voucher bunga"}
                    </span>
                    {row.paguPeringatan === "80" && (
                      <span className="rounded-full border border-amber-700/30 bg-amber-700/10 px-1.5 py-0.5 font-semibold text-amber-800">
                        pagu 80% terpakai
                      </span>
                    )}
                    {row.paguPeringatan === "100" && (
                      <span className="rounded-full border border-destructive/30 bg-destructive/10 px-1.5 py-0.5 font-semibold text-destructive">
                        pagu habis — dimatikan otomatis
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <div className="mr-1 flex items-center gap-2">
                    <Switch
                      checked={row.aktif}
                      onCheckedChange={(aktif) => void ubahStatus(row, aktif)}
                      aria-label={`${aktifLabel(row.aktif)} promo ${row.nama}`}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => bukaSunting(row)}
                  >
                    <Pencil className="size-3.5" aria-hidden="true" />
                    Sunting
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 text-destructive hover:text-destructive"
                    onClick={() => setDihapus({ id: row._id, nama: row.nama })}
                  >
                    <Trash2 className="size-3.5" aria-hidden="true" />
                    Hapus
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <EfektivitasPromoBunga className="border-t border-slate-100 pt-3" />

      <Sheet open={terbuka} onOpenChange={setTerbuka}>
        <SheetContent
          side="right"
          className="w-full gap-0 overflow-y-auto border-l border-slate-200 bg-white px-4 pb-8 sm:w-[46vw] sm:max-w-none sm:px-6"
        >
          <SheetHeader className="px-0 pt-4 pb-2 pr-10">
            <SheetTitle>{draf.id === undefined ? "Buat promo pinjaman" : "Sunting promo pinjaman"}</SheetTitle>
            <SheetDescription>
              Pilih jenis manfaat, tenor yang mendapatkannya, dan rentang tanggal. Formulir
              pengajuan membaca promo ini saat nasabah membuka halaman.
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="promo-bunga-jenis">Jenis promo</Label>
              <Select
                value={draf.jenis}
                onValueChange={(nilai) =>
                  setDraf((sebelumnya) => ({
                    ...sebelumnya,
                    jenis: nilai as JenisPromoBunga,
                  }))
                }
              >
                <SelectTrigger id="promo-bunga-jenis" className="mt-1 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {JENIS_PROMO_BUNGA.map((jenis) => (
                    <SelectItem key={jenis.value} value={jenis.value}>
                      {jenis.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-[11px] leading-4 text-slate-500">
                {JENIS_PROMO_BUNGA.find((jenis) => jenis.value === draf.jenis)?.keterangan}
              </p>
            </div>

            <div>
              <div className="flex items-baseline justify-between gap-2">
                <Label htmlFor="promo-bunga-nama">Nama promo</Label>
                <span className="text-xs tabular-nums text-slate-400">
                  {draf.nama.length}/{BATAS_PROMO_BUNGA.nama}
                </span>
              </div>
              <Input
                id="promo-bunga-nama"
                className="mt-1"
                maxLength={BATAS_PROMO_BUNGA.nama}
                value={draf.nama}
                placeholder="Contoh: Bunga 15% tenor 7 hari"
                onChange={(e) => setDraf((sebelumnya) => ({ ...sebelumnya, nama: e.target.value }))}
              />
              <p className="mt-1 text-[11px] leading-4 text-slate-500">
                Nama ini dibaca admin dan tercatat pada pinjaman yang memakai promo.
              </p>
            </div>

            {draf.jenis === "bunga_pengganti" && (
              <div>
                <Label htmlFor="promo-bunga-persen">Bunga promo (%)</Label>
                <div className="mt-1 flex items-center gap-2">
                  <Input
                    id="promo-bunga-persen"
                    inputMode="numeric"
                    className="max-w-28 tabular-nums"
                    value={draf.persenBunga}
                    onChange={(e) =>
                      setDraf((sebelumnya) => ({
                        ...sebelumnya,
                        persenBunga: e.target.value.replace(/\D/g, "").slice(0, 2),
                      }))
                    }
                  />
                  <span className="text-sm text-slate-500">% dari pokok (bukan potongan)</span>
                </div>
                <p className="mt-1 text-[11px] leading-4 text-slate-500">
                  Maksimal {BATAS_PROMO_BUNGA.persenMaks}% agar selalu di bawah bunga normal
                  terendah (26%). Angka 15 berarti bunga pinjaman 15%, seperti tertulis di
                  rincian dan kontrak.
                </p>
              </div>
            )}

            {draf.jenis === "potongan_bunga" && (
              <div>
                <Label htmlFor="promo-bunga-potongan">Potongan bunga (poin)</Label>
                <div className="mt-1 flex items-center gap-2">
                  <Input
                    id="promo-bunga-potongan"
                    inputMode="numeric"
                    className="max-w-28 tabular-nums"
                    value={draf.potonganPersen}
                    onChange={(e) =>
                      setDraf((sebelumnya) => ({
                        ...sebelumnya,
                        potonganPersen: e.target.value.replace(/\D/g, "").slice(0, 2),
                      }))
                    }
                  />
                  <span className="text-sm text-slate-500">poin dari bunga normal</span>
                </div>
                <p className="mt-1 text-[11px] leading-4 text-slate-500">
                  Contoh: bunga normal 30% dengan potongan 5 poin menjadi 25%. Maksimal{" "}
                  {BATAS_PROMO_BUNGA.persenMaks} poin; hasilnya tidak pernah negatif.
                </p>
              </div>
            )}

            {draf.jenis === "bebas_admin" && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-2.5">
                <p className="text-sm font-medium text-emerald-900">
                  Biaya admin menjadi Rp0
                </p>
                <p className="mt-1 text-[11px] leading-5 text-emerald-900/80">
                  Bunga tetap mengikuti tarif normal tenor. Yang dibebaskan hanya biaya
                  admin di muka; biaya asuransi dan ekspres tidak ikut dihapus.
                </p>
              </div>
            )}

            <fieldset>
              <legend className="text-sm font-medium">Tenor yang mendapat promo</legend>
              <p className="mt-1 text-[11px] leading-4 text-slate-500">
                Tenor harian berlaku {TENOR_OPTIONS[0]}–{TENOR_HARIAN_MAKS} hari. Selain
                empat tenor standar, nasabah memilih hari lain lewat tanggal jatuh tempo;
                promo dicocokkan persis dengan tenor itu.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {TENOR_OPTIONS.map((tenor) => {
                  const dicentang = draf.tenor.includes(tenor);
                  return (
                    <label
                      key={tenor}
                      className={cn(
                        "flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm",
                        dicentang
                          ? "border-primary/40 bg-primary/5 text-primary"
                          : "border-slate-200 text-slate-700",
                      )}
                    >
                      <input
                        type="checkbox"
                        className="size-4 accent-primary"
                        checked={dicentang}
                        onChange={(e) => ubahTenor(tenor, e.target.checked)}
                      />
                      {tenor} hari
                    </label>
                  );
                })}
              </div>

              <div className="mt-3 flex items-end gap-2">
                <div className="min-w-0 flex-1">
                  <Label htmlFor="promo-bunga-tenor-lain" className="text-xs">
                    Tenor lain ({TENOR_OPTIONS[0]}–{TENOR_HARIAN_MAKS} hari)
                  </Label>
                  <Input
                    id="promo-bunga-tenor-lain"
                    type="number"
                    inputMode="numeric"
                    min={TENOR_OPTIONS[0]}
                    max={TENOR_HARIAN_MAKS}
                    className="mt-1"
                    placeholder="Contoh: 10"
                    value={tenorLain}
                    onChange={(e) => setTenorLain(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        tambahTenorLain();
                      }
                    }}
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={tambahTenorLain}
                  className="gap-1.5"
                >
                  <Plus className="size-4" aria-hidden="true" />
                  Tambah
                </Button>
              </div>

              {draf.tenor.some(
                (tenor) => !(TENOR_OPTIONS as readonly number[]).includes(tenor),
              ) && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {draf.tenor
                    .filter(
                      (tenor) => !(TENOR_OPTIONS as readonly number[]).includes(tenor),
                    )
                    .map((tenor) => (
                      <button
                        key={tenor}
                        type="button"
                        onClick={() => hapusTenor(tenor)}
                        aria-label={`Hapus tenor ${tenor} hari`}
                        className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-3 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
                      >
                        {tenor} hari
                        <X className="size-3.5" aria-hidden="true" />
                      </button>
                    ))}
                </div>
              )}

              <p className="mt-2 text-[11px] leading-4 text-slate-500">
                Dipilih:{" "}
                {draf.tenor.length === 0 ? "belum ada" : `${draf.tenor.join(", ")} hari`}.
              </p>
            </fieldset>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="promo-bunga-mulai">Mulai berlaku</Label>
                <Input
                  id="promo-bunga-mulai"
                  type="date"
                  className="mt-1"
                  value={draf.mulai}
                  onChange={(e) =>
                    setDraf((sebelumnya) => ({ ...sebelumnya, mulai: e.target.value }))
                  }
                />
              </div>
              <div>
                <Label htmlFor="promo-bunga-selesai">Selesai berlaku</Label>
                <Input
                  id="promo-bunga-selesai"
                  type="date"
                  className="mt-1"
                  value={draf.selesai}
                  onChange={(e) =>
                    setDraf((sebelumnya) => ({ ...sebelumnya, selesai: e.target.value }))
                  }
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2.5">
              <div>
                <Label htmlFor="promo-bunga-aktif">Aktif</Label>
                <p className="mt-0.5 text-xs text-slate-500">
                  Nonaktif menyimpan promo tanpa memakainya pada pengajuan baru.
                </p>
              </div>
              <Switch
                id="promo-bunga-aktif"
                checked={draf.aktif}
                onCheckedChange={(aktif) =>
                  setDraf((sebelumnya) => ({ ...sebelumnya, aktif }))
                }
              />
            </div>

            <div>
              <Label htmlFor="promo-bunga-pagu">Pagu subsidi (rupiah)</Label>
              <Input
                id="promo-bunga-pagu"
                inputMode="numeric"
                className="mt-1 max-w-48 tabular-nums"
                placeholder="Kosongkan bila tanpa pagu"
                value={draf.paguSubsidi}
                onChange={(e) =>
                  setDraf((sebelumnya) => ({ ...sebelumnya, paguSubsidi: e.target.value }))
                }
              />
              <p className="mt-1 text-[11px] leading-4 text-slate-500">
                Batas total bunga yang disubsidi platform untuk kampanye ini. Saat
                terpakai, promo dimatikan otomatis dan tercatat di jejak audit. Kosong
                berarti tanpa batas — pemakaian tetap terlihat di laporan efektivitas.
              </p>
            </div>

            <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2.5">
              <div>
                <Label htmlFor="promo-bunga-voucher">Boleh digabung voucher bunga</Label>
                <p className="mt-0.5 text-xs text-slate-500">
                  Dimatikan: nasabah memilih promo atau voucher potongan bunga, tidak
                  keduanya. Bila dinyalakan, bunga hasil tumpukan tetap tidak boleh di
                  bawah {LANTAI_BUNGA_PROMO_PERSEN}%.
                </p>
              </div>
              <Switch
                id="promo-bunga-voucher"
                checked={draf.bolehVoucher}
                onCheckedChange={(bolehVoucher) =>
                  setDraf((sebelumnya) => ({ ...sebelumnya, bolehVoucher }))
                }
              />
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                Pratinjau bunga
              </p>
              {pratinjau.length === 0 ? (
                <p className="mt-2 rounded-lg border border-dashed border-slate-300 px-3 py-4 text-sm text-slate-500">
                  Pilih minimal satu tenor untuk melihat perbandingan.
                </p>
              ) : (
                <div className="mt-2 overflow-hidden rounded-lg border border-slate-200">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 text-left text-[10px] uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-2.5 py-2 font-semibold">Tenor</th>
                        <th className="px-2.5 py-2 font-semibold">Normal</th>
                        <th className="px-2.5 py-2 font-semibold">Setelah promo</th>
                        <th className="px-2.5 py-2 font-semibold">Hemat</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {pratinjau.map((baris) => (
                        <tr key={baris.tenor}>
                          <td className="px-2.5 py-2 font-medium text-slate-800">
                            {baris.tenor} hari
                          </td>
                          <td className="px-2.5 py-2 tabular-nums text-slate-600">
                            {baris.normal.tier1}/{baris.normal.tier2}/{baris.normal.tier3}%
                          </td>
                          <td className="px-2.5 py-2 font-semibold tabular-nums text-emerald-800">
                            {baris.promo.tier1}/{baris.promo.tier2}/{baris.promo.tier3}%
                          </td>
                          <td className="px-2.5 py-2 tabular-nums text-slate-700">
                            {draf.jenis === "bebas_admin"
                              ? "biaya admin Rp0"
                              : baris.potonganTerbesar > 0
                                ? `s.d. ${baris.potonganTerbesar} poin`
                                : "tidak memotong"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="border-t border-slate-100 px-2.5 py-2 text-[10px] leading-4 text-slate-500">
                    Normal = tarif matriks untuk pokok &lt;{formatRupiahAman(500_000)} /{" "}
                    {formatRupiahAman(500_000)}–&lt;{formatRupiahAman(1_000_000)} / ≥
                    {formatRupiahAman(1_000_000)}. Hemat dihitung dari tier yang paling
                    terpotong. Bebas admin tidak mengubah kolom bunga; manfaatnya ada di
                    potongan biaya admin.
                  </p>
                </div>
              )}
            </div>

            {pesan !== null && (
              <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {pesan}
              </p>
            )}
          </div>

          <SheetFooter className="px-0">
            <Button type="button" variant="outline" onClick={() => setTerbuka(false)}>
              Batal
            </Button>
            <Button type="button" onClick={() => void kirim()} disabled={sibuk} className="gap-1.5">
              {sibuk && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              {draf.id === undefined ? "Simpan promo bunga" : "Simpan perubahan"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <AlertDialog open={dihapus !== null} onOpenChange={(buka) => !buka && setDihapus(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus promo bunga ini?</AlertDialogTitle>
            <AlertDialogDescription>
              {dihapus === null
                ? ""
                : `"${dihapus.nama}" hilang dari daftar dan tidak dipakai pengajuan baru. Pinjaman yang sudah memakainya tetap menyimpan angka promo.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={sibuk}>Batal</AlertDialogCancel>
            <AlertDialogAction
              disabled={sibuk}
              onClick={(e) => {
                e.preventDefault();
                void konfirmasiHapus();
              }}
            >
              Hapus promo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function aktifLabel(aktif: boolean): string {
  return aktif ? "Matikan" : "Nyalakan";
}
