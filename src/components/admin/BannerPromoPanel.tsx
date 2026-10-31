import type { FunctionReturnType } from "convex/server";
import { useAction, useMutation, useQuery } from "convex/react";
import {
  CalendarClock,
  ImagePlus,
  Images,
  Loader2,
  Pencil,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { PemotongGambarBanner } from "@/components/admin/PemotongGambarBanner";
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
import {
  BATAS_BANNER,
  MAKS_BANNER_BYTE,
  PENEMPATAN_BANNER,
  RASIO_BANNER,
  UKURAN_BANNER,
  labelPenempatanBanner,
  statusBannerPromo,
  type PenempatanBanner,
  type StatusBannerPromo,
  type VarianGambarBanner,
} from "@/lib/bannerPromo";
import { msKeTanggalInput, tanggalKeMsWIB } from "@/lib/promoPinjaman";
import { unggahDokumen } from "@/lib/unggahDokumen";
import { formatTanggalWIB } from "@/lib/waktu";

type Baris = FunctionReturnType<typeof api.bannerPromo.daftar>[number];

type Draf = {
  nama: string;
  judul: string;
  tautan: string;
  penempatan: PenempatanBanner[];
  mulai: string;
  selesai: string;
  aktif: boolean;
  promoBungaId: string;
  prioritas: string;
};

const STATUS: Record<StatusBannerPromo, { label: string; kelas: string }> = {
  berjalan: {
    label: "Berjalan",
    kelas: "border-success-border bg-success-soft text-success-foreground",
  },
  dijadwalkan: {
    label: "Dijadwalkan",
    kelas: "border-sky-700/30 bg-sky-700/10 text-sky-800",
  },
  menunggu_promo: {
    label: "Di luar promo",
    kelas: "border-sky-700/30 bg-sky-700/10 text-sky-800",
  },
  menunggu_gambar: {
    label: "Belum ada gambar",
    kelas: "border-amber-700/30 bg-amber-700/10 text-amber-800",
  },
  berakhir: {
    label: "Berakhir",
    kelas: "border-slate-300 bg-slate-100 text-slate-600",
  },
  nonaktif: {
    label: "Nonaktif",
    kelas: "border-amber-700/30 bg-amber-700/10 text-amber-800",
  },
};

function drafBaru(): Draf {
  const sekarang = Date.now();
  return {
    nama: "",
    judul: "Promo PINDAI",
    tautan: "",
    penempatan: ["beranda"],
    mulai: msKeTanggalInput(sekarang),
    selesai: msKeTanggalInput(sekarang + 13 * 86_400_000),
    aktif: true,
    promoBungaId: "",
    prioritas: "10",
  };
}

function drafDari(row: Baris): Draf {
  return {
    nama: row.nama,
    judul: row.judul,
    tautan: row.tautan,
    penempatan: row.penempatan.filter((item): item is PenempatanBanner =>
      PENEMPATAN_BANNER.some((pilihan) => pilihan.id === item),
    ),
    mulai: msKeTanggalInput(row.mulai),
    selesai: msKeTanggalInput(row.selesai),
    aktif: row.aktif,
    promoBungaId: row.promoBungaId ?? "",
    prioritas: String(row.prioritas),
  };
}

/**
 * Pengatur banner promo bergambar.
 *
 * Daftar lebih dulu karena pertanyaan admin di sini adalah "apa yang tampil
 * dan kapan", bukan "isi formulir". Formulir baru membuka unggahan setelah
 * kampanye tersimpan: gambar perlu id baris untuk ditautkan, dan action server
 * memeriksa isi berkas sebelum menyimpannya.
 */
export function BannerPromoPanel() {
  const daftar = useQuery(api.bannerPromo.daftar);
  const promo = useQuery(api.promoBunga.daftar);
  const simpan = useMutation(api.bannerPromo.simpan);
  const setAktif = useMutation(api.bannerPromo.setAktif);
  const hapus = useMutation(api.bannerPromo.hapus);
  const mintaUrl = useMutation(api.bannerPromo.generateUploadUrl);
  const pasangGambar = useAction(api.bannerPromo.pasangGambar);

  const [terbuka, setTerbuka] = useState(false);
  const [draf, setDraf] = useState<Draf>(drafBaru);
  const [id, setId] = useState<Id<"bannerPromo"> | null>(null);
  const [busy, setBusy] = useState<
    "simpan" | "hapus" | VarianGambarBanner | null
  >(null);
  const [pemotong, setPemotong] = useState<{
    berkas: File;
    varian: VarianGambarBanner;
  } | null>(null);
  const [konfirmasiHapus, setKonfirmasiHapus] = useState<Baris | null>(null);
  const inputDesktop = useRef<HTMLInputElement>(null);
  const inputMobile = useRef<HTMLInputElement>(null);

  if (daftar === undefined) {
    return (
      <p className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Memuat banner promo…
      </p>
    );
  }

  const baris = id === null ? null : (daftar.find((row) => row._id === id) ?? null);
  const promoDipilih =
    draf.promoBungaId === ""
      ? null
      : (promo?.find((row) => row._id === draf.promoBungaId) ?? null);

  const bukaBaru = () => {
    setDraf(drafBaru());
    setId(null);
    setTerbuka(true);
  };

  const bukaSunting = (row: Baris) => {
    setDraf(drafDari(row));
    setId(row._id);
    setTerbuka(true);
  };

  const simpanIsi = async () => {
    const mulai = tanggalKeMsWIB(draf.mulai);
    const selesai = tanggalKeMsWIB(draf.selesai, true);
    if (mulai === null || selesai === null) {
      toast.error("Tanggal mulai dan selesai wajib diisi dengan benar.");
      return;
    }
    const prioritas = Number(draf.prioritas);
    if (!Number.isFinite(prioritas) || prioritas < 1 || prioritas > 999) {
      toast.error("Prioritas harus antara 1 dan 999.");
      return;
    }
    setBusy("simpan");
    try {
      const hasil = await simpan({
        id: id ?? undefined,
        nama: draf.nama,
        judul: draf.judul,
        tautan: draf.tautan,
        penempatan: draf.penempatan,
        mulai,
        selesai,
        aktif: draf.aktif,
        promoBungaId:
          draf.promoBungaId === ""
            ? null
            : (draf.promoBungaId as Id<"promoBunga">),
        prioritas,
      });
      setId(hasil.id);
      toast.success(
        id === null
          ? "Kampanye tersimpan. Sekarang unggah gambarnya."
          : "Kampanye tersimpan.",
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Gagal menyimpan banner.",
      );
    } finally {
      setBusy(null);
    }
  };

  const unggah = async (file: File) => {
    if (id === null || pemotong === null) return;
    const varian = pemotong.varian;
    setBusy(varian);
    try {
      const berkasId = await unggahDokumen(
        file,
        () => mintaUrl(),
        `Banner ${varian}`,
      );
      await pasangGambar({ id, varian, berkasId });
      toast.success(
        varian === "desktop"
          ? "Gambar desktop tersimpan."
          : "Gambar ponsel tersimpan.",
      );
      setPemotong(null);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Gagal mengunggah gambar.",
      );
    } finally {
      setBusy(null);
    }
  };

  const hapusBanner = async (row: Baris) => {
    setBusy("hapus");
    try {
      await hapus({ id: row._id });
      if (id === row._id) {
        setTerbuka(false);
        setId(null);
      }
      toast.success("Banner dihapus.");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Gagal menghapus banner.",
      );
    } finally {
      setBusy(null);
      setKonfirmasiHapus(null);
    }
  };

  const ubahPenempatan = (penempatan: PenempatanBanner) => {
    setDraf({
      ...draf,
      penempatan: draf.penempatan.includes(penempatan)
        ? draf.penempatan.filter((item) => item !== penempatan)
        : [...draf.penempatan, penempatan],
    });
  };

  const pilihBerkas = (varian: VarianGambarBanner, file: File | undefined) => {
    if (file === undefined) return;
    if (file.size > 12 * 1024 * 1024) {
      toast.error("Gambar asli maksimal 12 MB sebelum dipotong.");
      return;
    }
    setPemotong({ berkas: file, varian });
  };

  const adaGambar =
    baris !== null && (baris.desktopUrl !== null || baris.mobileUrl !== null);

  return (
    <div className="animate-masuk space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-navy">
            Banner Promo
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Materi gambar untuk beranda, dashboard nasabah, dan halaman{" "}
            <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">/promo</code>.
            Beberapa kampanye bisa dijadwalkan sekaligus; prioritas kecil tampil
            lebih dulu, dan promo bunga yang diikat menghentikan banner otomatis.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          className="min-h-11 bg-primary text-primary-foreground hover:bg-primary/90"
          onClick={bukaBaru}
        >
          <Plus className="mr-1.5 size-4" /> Banner baru
        </Button>
      </div>

      {daftar.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
          <Images className="mx-auto size-8 text-slate-400" aria-hidden="true" />
          <p className="mt-3 text-sm font-medium text-slate-700">
            Belum ada banner promo.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Unggah materi kampanye pertama; bisa dijadwalkan untuk tanggal
            mendatang.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {daftar.map((row) => {
            const promoRow =
              row.promoBungaId === null
                ? null
                : (promo?.find((p) => p._id === row.promoBungaId) ?? null);
            const status = statusBannerPromo(row, Date.now(), {
              adaGambar: row.desktopUrl !== null || row.mobileUrl !== null,
              promoBerjalan:
                row.promoBungaId === null ? undefined : promoRow?.berjalan === true,
            });
            const tampil = row.desktopUrl ?? row.mobileUrl;
            return (
              <article
                key={row._id}
                className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
              >
                <div className="h-32 bg-slate-100">
                  {tampil === null ? (
                    <div className="flex h-full items-center justify-center text-xs text-slate-500">
                      Belum ada gambar
                    </div>
                  ) : (
                    <img
                      src={tampil}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  )}
                </div>
                <div className="space-y-2 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-semibold text-navy">
                        {row.nama}
                      </h3>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        Prioritas {row.prioritas}
                      </p>
                    </div>
                    <span
                      className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${STATUS[status].kelas}`}
                    >
                      {STATUS[status].label}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-1">
                    {row.penempatan.map((item) => (
                      <span
                        key={item}
                        className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600"
                      >
                        {labelPenempatanBanner(item)}
                      </span>
                    ))}
                  </div>

                  <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <CalendarClock className="size-3.5" aria-hidden="true" />
                    {formatTanggalWIB(row.mulai)} – {formatTanggalWIB(row.selesai)}
                    {promoRow !== null ? ` · ${promoRow.nama}` : ""}
                  </p>

                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2">
                    <div className="flex min-h-11 items-center gap-2 text-xs text-slate-600">
                      <Switch
                        checked={row.aktif}
                        aria-label={`Tampilkan ${row.nama}`}
                        onCheckedChange={(aktif) => {
                          void setAktif({ id: row._id, aktif }).catch((err) =>
                            toast.error(
                              err instanceof Error
                                ? err.message
                                : "Gagal mengubah status.",
                            ),
                          );
                        }}
                      />
                      {row.aktif ? "Aktif" : "Nonaktif"}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="min-h-11"
                        onClick={() => bukaSunting(row)}
                      >
                        <Pencil className="mr-1.5 size-3.5" /> Ubah
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="min-h-11 text-rose-700 hover:bg-rose-50 hover:text-rose-800"
                        aria-label={`Hapus ${row.nama}`}
                        onClick={() => setKonfirmasiHapus(row)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <Sheet
        open={terbuka}
        onOpenChange={(buka) => {
          if (!buka && busy === null) setTerbuka(false);
        }}
      >
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>{id === null ? "Banner baru" : "Sunting banner"}</SheetTitle>
            <SheetDescription>
              Jadwal memakai tanggal WIB. Gambar bisa diunggah setelah kampanye
              tersimpan.
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-4 px-4 pb-4">
            <div>
              <Label htmlFor="banner-nama" className="text-xs">
                Nama kampanye (internal)
              </Label>
              <Input
                id="banner-nama"
                className="mt-1 bg-white"
                maxLength={BATAS_BANNER.nama}
                value={draf.nama}
                onChange={(event) =>
                  setDraf({ ...draf, nama: event.target.value })
                }
              />
            </div>

            <div>
              <Label htmlFor="banner-judul" className="text-xs">
                Teks alternatif gambar
              </Label>
              <Input
                id="banner-judul"
                className="mt-1 bg-white"
                maxLength={BATAS_BANNER.judul}
                value={draf.judul}
                onChange={(event) =>
                  setDraf({ ...draf, judul: event.target.value })
                }
              />
            </div>

            <div>
              <Label htmlFor="banner-tautan" className="text-xs">
                Tautan saat banner diklik (opsional)
              </Label>
              <Input
                id="banner-tautan"
                className="mt-1 bg-white"
                maxLength={BATAS_BANNER.tautan}
                value={draf.tautan}
                placeholder="/promo"
                onChange={(event) =>
                  setDraf({ ...draf, tautan: event.target.value })
                }
              />
            </div>

            <fieldset>
              <legend className="text-xs font-medium">Tempat tampil</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {PENEMPATAN_BANNER.map((pilihan) => {
                  const dipilih = draf.penempatan.includes(pilihan.id);
                  return (
                    <button
                      key={pilihan.id}
                      type="button"
                      aria-pressed={dipilih}
                      onClick={() => ubahPenempatan(pilihan.id)}
                      className={`min-h-11 rounded-lg border px-3 text-left text-xs transition-colors ${
                        dipilih
                          ? "border-emerald-700 bg-emerald-50 text-emerald-900"
                          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                      }`}
                    >
                      <span className="block font-semibold">{pilihan.label}</span>
                      <span className="block text-[10px] opacity-70">
                        {pilihan.catatan}
                      </span>
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="banner-mulai" className="text-xs">
                  Mulai
                </Label>
                <Input
                  id="banner-mulai"
                  type="date"
                  className="mt-1 bg-white"
                  value={draf.mulai}
                  onChange={(event) =>
                    setDraf({ ...draf, mulai: event.target.value })
                  }
                />
              </div>
              <div>
                <Label htmlFor="banner-selesai" className="text-xs">
                  Selesai
                </Label>
                <Input
                  id="banner-selesai"
                  type="date"
                  className="mt-1 bg-white"
                  value={draf.selesai}
                  onChange={(event) =>
                    setDraf({ ...draf, selesai: event.target.value })
                  }
                />
              </div>
            </div>

            <div>
              <Label htmlFor="banner-promo" className="text-xs">
                Ikuti promo bunga
              </Label>
              <Select
                value={draf.promoBungaId === "" ? "tanpa-promo" : draf.promoBungaId}
                onValueChange={(value) =>
                  setDraf({
                    ...draf,
                    promoBungaId: value === "tanpa-promo" ? "" : value,
                  })
                }
              >
                <SelectTrigger id="banner-promo" className="mt-1 w-full bg-white">
                  <SelectValue placeholder="Pilih promo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tanpa-promo">
                    Tanpa ikatan, ikut jadwal banner
                  </SelectItem>
                  {draf.promoBungaId !== "" &&
                    promo !== undefined &&
                    !promo.some((row) => row._id === draf.promoBungaId) && (
                      <SelectItem value={draf.promoBungaId}>
                        Promo tidak ditemukan, pilih ulang
                      </SelectItem>
                    )}
                  {(promo ?? []).map((row) => (
                    <SelectItem key={row._id} value={row._id}>
                      {row.nama} · {row.persenBunga}% · s.d.{" "}
                      {formatTanggalWIB(row.selesai)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                {promoDipilih === null
                  ? "Banner tampil sesuai tanggal di atas."
                  : promoDipilih.berjalan
                    ? `Promo berjalan; banner berhenti paling lambat ${formatTanggalWIB(promoDipilih.selesai)}.`
                    : "Promo belum berjalan atau sudah berakhir; banner menunggu jadwal promo."}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="banner-prioritas" className="text-xs">
                  Prioritas
                </Label>
                <Input
                  id="banner-prioritas"
                  type="number"
                  min={1}
                  max={999}
                  className="mt-1 bg-white"
                  value={draf.prioritas}
                  onChange={(event) =>
                    setDraf({ ...draf, prioritas: event.target.value })
                  }
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Angka kecil tampil lebih dulu bila beberapa banner berjalan.
                </p>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2.5">
                <div>
                  <Label htmlFor="banner-aktif" className="text-xs">
                    Aktif
                  </Label>
                  <p className="text-[11px] text-muted-foreground">
                    Sakelar utama kampanye.
                  </p>
                </div>
                <Switch
                  id="banner-aktif"
                  checked={draf.aktif}
                  onCheckedChange={(aktif) => setDraf({ ...draf, aktif })}
                />
              </div>
            </div>

            <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
              <div>
                <p className="text-xs font-semibold text-slate-700">
                  Gambar kampanye
                </p>
                <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
                  Dua rasio dipotong terpisah. Bila hanya satu diunggah, gambar
                  itu dipakai untuk keduanya.
                </p>
              </div>

              {id === null && (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
                  Simpan kampanye dulu; tombol unggah aktif setelah id tersimpan.
                </p>
              )}

              <div className="grid gap-3 sm:grid-cols-[1.4fr_1fr]">
                <div>
                  <p className="text-[11px] font-medium text-slate-600">
                    Desktop · {UKURAN_BANNER.desktop.lebar} ×{" "}
                    {UKURAN_BANNER.desktop.tinggi}
                  </p>
                  <div
                    className="mt-1 overflow-hidden rounded-lg border border-slate-200 bg-white"
                    style={{ aspectRatio: String(RASIO_BANNER.desktop) }}
                  >
                    {baris?.desktopUrl != null ? (
                      <img
                        src={baris.desktopUrl}
                        alt="Pratinjau banner desktop"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <ImagePlus className="size-6 text-slate-300" />
                      </div>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-2 min-h-11 w-full"
                    disabled={id === null || busy !== null}
                    onClick={() => inputDesktop.current?.click()}
                  >
                    {busy === "desktop" ? (
                      <Loader2 className="mr-1.5 size-4 animate-spin" />
                    ) : (
                      <ImagePlus className="mr-1.5 size-4" />
                    )}
                    {baris?.desktopUrl != null ? "Ganti desktop" : "Pilih desktop"}
                  </Button>
                  <input
                    ref={inputDesktop}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="sr-only"
                    aria-label="Pilih gambar banner desktop"
                    onChange={(event) => {
                      pilihBerkas("desktop", event.target.files?.[0]);
                      event.target.value = "";
                    }}
                  />
                </div>

                <div>
                  <p className="text-[11px] font-medium text-slate-600">
                    Ponsel · {UKURAN_BANNER.mobile.lebar} ×{" "}
                    {UKURAN_BANNER.mobile.tinggi}
                  </p>
                  <div
                    className="mt-1 overflow-hidden rounded-lg border border-slate-200 bg-white"
                    style={{ aspectRatio: String(RASIO_BANNER.mobile) }}
                  >
                    {baris?.mobileUrl != null ? (
                      <img
                        src={baris.mobileUrl}
                        alt="Pratinjau banner ponsel"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <ImagePlus className="size-6 text-slate-300" />
                      </div>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-2 min-h-11 w-full"
                    disabled={id === null || busy !== null}
                    onClick={() => inputMobile.current?.click()}
                  >
                    {busy === "mobile" ? (
                      <Loader2 className="mr-1.5 size-4 animate-spin" />
                    ) : (
                      <ImagePlus className="mr-1.5 size-4" />
                    )}
                    {baris?.mobileUrl != null ? "Ganti ponsel" : "Pilih ponsel"}
                  </Button>
                  <input
                    ref={inputMobile}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="sr-only"
                    aria-label="Pilih gambar banner ponsel"
                    onChange={(event) => {
                      pilihBerkas("mobile", event.target.files?.[0]);
                      event.target.value = "";
                    }}
                  />
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                JPG, PNG, atau WebP · maksimal {MAKS_BANNER_BYTE / (1024 * 1024)}{" "}
                MB setelah dipotong.
                {adaGambar ? "" : " Belum ada gambar; banner tidak akan tampil."}
              </p>
            </div>
          </div>

          <SheetFooter>
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={busy !== null}
              onClick={() => setTerbuka(false)}
            >
              Batal
            </Button>
            <Button
              type="button"
              className="min-h-11 bg-primary text-primary-foreground hover:bg-primary/90"
              disabled={busy !== null}
              onClick={() => void simpanIsi()}
            >
              {busy === "simpan" ? (
                <Loader2 className="mr-1.5 size-4 animate-spin" />
              ) : (
                <Save className="mr-1.5 size-4" />
              )}
              Simpan kampanye
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <PemotongGambarBanner
        terbuka={pemotong !== null}
        berkas={pemotong?.berkas ?? null}
        varian={pemotong?.varian ?? "desktop"}
        busy={busy === "desktop" || busy === "mobile"}
        onTutup={() => setPemotong(null)}
        onSelesai={unggah}
      />

      <AlertDialog
        open={konfirmasiHapus !== null}
        onOpenChange={(buka) => !buka && setKonfirmasiHapus(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus banner ini?</AlertDialogTitle>
            <AlertDialogDescription>
              “{konfirmasiHapus?.nama}” beserta kedua gambarnya dihapus dari
              penyimpanan. Tindakan ini tidak bisa dibatalkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy === "hapus"}>
              Batal
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 text-white hover:bg-rose-700"
              disabled={busy === "hapus"}
              onClick={(event) => {
                event.preventDefault();
                if (konfirmasiHapus !== null) {
                  void hapusBanner(konfirmasiHapus);
                }
              }}
            >
              {busy === "hapus" ? "Menghapus…" : "Ya, hapus"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
