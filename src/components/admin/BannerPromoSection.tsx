import { useAction, useMutation, useQuery } from "convex/react";
import { ImagePlus, Loader2, Save, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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
import { Switch } from "@/components/ui/switch";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  ACCEPT_BANNER,
  BATAS_BANNER,
  MAKS_BANNER_BYTE,
  tautanBannerValid,
} from "@/lib/bannerPromo";
import { formatTanggalWIB } from "@/lib/waktu";
import { unggahDokumen } from "@/lib/unggahDokumen";

type Draf = {
  judul: string;
  tautan: string;
  aktif: boolean;
  /** String kosong = tidak diikat ke promo mana pun. */
  promoBungaId: string;
};

/**
 * Banner promo beranda di panel Konten Beranda.
 *
 * Gambar diunggah langsung (tanpa tombol Simpan) karena berkasnya memang harus
 * berada di storage lebih dulu; teks, tautan, dan ikatan promo ditahan di
 * `draf` sampai admin menekan Simpan. Pemisahan ini membuat unggahan yang gagal
 * tidak meninggalkan setelan setengah jadi.
 *
 * Ikatan promo bukan hiasan: server menyembunyikan banner begitu promo yang
 * dipilih berakhir, sehingga gambar kampanye tidak tertinggal di beranda.
 */
export function BannerPromoSection() {
  const data = useQuery(api.announcements.bannerPromoAdmin);
  const promo = useQuery(api.promoBunga.daftar);
  const mintaUrl = useMutation(api.announcements.generateUploadBannerUrl);
  const pasang = useAction(api.announcements.pasangBannerPromo);
  const simpan = useMutation(api.announcements.simpanBannerPromo);
  const hapus = useMutation(api.announcements.hapusBannerPromo);

  const [draf, setDraf] = useState<Draf | null>(null);
  const [busy, setBusy] = useState<"unggah" | "simpan" | "hapus" | null>(null);
  const [konfirmasiHapus, setKonfirmasiHapus] = useState(false);
  const inputBerkas = useRef<HTMLInputElement>(null);

  // Isi formulir hanya sekali saat data pertama tiba. Menyalin ulang setiap
  // query berubah akan menghapus ketikan admin yang belum disimpan.
  useEffect(() => {
    if (data === undefined || data === null || draf !== null) return;
    setDraf({
      judul: data.judul,
      tautan: data.tautan,
      aktif: data.aktif,
      promoBungaId: data.promoBungaId ?? "",
    });
  }, [data, draf]);

  if (data === null) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-muted-foreground">
        Banner promo hanya bisa diatur dari sesi admin.
      </section>
    );
  }
  if (data === undefined || draf === null) {
    return (
      <section className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-5 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Memuat banner promo…
      </section>
    );
  }

  const terpilih =
    draf.promoBungaId === ""
      ? null
      : (promo?.find((row) => row._id === draf.promoBungaId) ?? null);
  const tampil =
    data.url !== null &&
    draf.aktif &&
    (draf.promoBungaId === "" || terpilih?.berjalan === true);
  const status = data.url === null
    ? "Belum ada gambar"
    : !draf.aktif
      ? "Nonaktif"
      : draf.promoBungaId !== "" && terpilih?.berjalan !== true
        ? "Menunggu promo"
        : "Tampil di beranda";

  const unggah = async (file: File) => {
    if (file.size > MAKS_BANNER_BYTE) {
      toast.error(
        `Gambar maksimal ${MAKS_BANNER_BYTE / (1024 * 1024)} MB.`,
      );
      return;
    }
    setBusy("unggah");
    try {
      const berkasId = await unggahDokumen(
        file,
        () => mintaUrl(),
        "Banner promo",
      );
      await pasang({ berkasId, namaBerkas: file.name });
      toast.success("Banner promo terpasang.");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Gagal mengunggah banner.",
      );
    } finally {
      setBusy(null);
      if (inputBerkas.current !== null) inputBerkas.current.value = "";
    }
  };

  const simpanSetelan = async () => {
    const tautan = draf.tautan.trim();
    if (!tautanBannerValid(tautan)) {
      toast.error(
        "Tautan harus path internal, mis. /promo. Alamat lengkap tidak diterima.",
      );
      return;
    }
    setBusy("simpan");
    try {
      await simpan({
        judul: draf.judul,
        tautan,
        aktif: draf.aktif,
        promoBungaId:
          draf.promoBungaId === ""
            ? null
            : (draf.promoBungaId as Id<"promoBunga">),
      });
      toast.success("Pengaturan banner tersimpan.");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Gagal menyimpan banner.",
      );
    } finally {
      setBusy(null);
    }
  };

  const lepasGambar = async () => {
    setBusy("hapus");
    try {
      await hapus();
      toast.success("Gambar banner dilepas.");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Gagal menghapus banner.",
      );
    } finally {
      setBusy(null);
      setKonfirmasiHapus(false);
    }
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-navy">Banner promo beranda</h3>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
            Gambar kampanye di bawah hero halaman{" "}
            <code className="rounded bg-slate-100 px-1 py-0.5">/</code>. Tampil
            hanya bila sakelar menyala dan — kalau diikat ke promo bunga — promo
            itu masih berjalan.
          </p>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
            tampil
              ? "border-emerald-700/30 bg-emerald-700/10 text-emerald-800"
              : "border-slate-300 bg-slate-100 text-slate-600"
          }`}
        >
          <span
            aria-hidden="true"
            className={`size-1.5 rounded-full ${tampil ? "bg-emerald-600" : "bg-slate-400"}`}
          />
          {status}
        </span>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
        <div>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
            {data.url !== null ? (
              <img
                src={data.url}
                alt={data.judul !== "" ? data.judul : "Pratinjau banner promo"}
                className="h-52 w-full object-cover sm:h-56"
              />
            ) : (
              <div className="flex h-52 flex-col items-center justify-center gap-2 px-4 text-center sm:h-56">
                <ImagePlus className="size-8 text-slate-400" aria-hidden="true" />
                <p className="text-sm font-medium text-slate-600">
                  Belum ada gambar banner
                </p>
                <p className="text-xs text-slate-500">
                  Unggah materi kampanye berukuran lebar, mis. 1600 × 600 px.
                </p>
              </div>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-11"
              disabled={busy !== null}
              onClick={() => inputBerkas.current?.click()}
            >
              {busy === "unggah" ? (
                <Loader2 className="mr-1.5 size-4 animate-spin" />
              ) : (
                <ImagePlus className="mr-1.5 size-4" />
              )}
              {data.url !== null ? "Ganti gambar" : "Unggah gambar"}
            </Button>
            {data.url !== null && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="min-h-11 text-rose-700 hover:bg-rose-50 hover:text-rose-800"
                disabled={busy !== null}
                onClick={() => setKonfirmasiHapus(true)}
              >
                <Trash2 className="mr-1.5 size-4" />
                Lepas gambar
              </Button>
            )}
            <input
              ref={inputBerkas}
              type="file"
              accept={ACCEPT_BANNER}
              className="sr-only"
              aria-label="Pilih gambar banner promo"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file !== undefined) void unggah(file);
              }}
            />
          </div>
          <p className="mt-2 text-[11px] leading-4 text-muted-foreground">
            JPG, PNG, atau WebP · maksimal {MAKS_BANNER_BYTE / (1024 * 1024)} MB.
            Gambar dipotong tengah pada layar lebar, jadi letakkan teks penting
            di bagian tengah.
          </p>
        </div>

        <div className="space-y-3">
          <div>
            <Label htmlFor="banner-promo-judul" className="text-xs">
              Teks alternatif gambar
            </Label>
            <Input
              id="banner-promo-judul"
              className="mt-1 bg-white"
              maxLength={BATAS_BANNER.judul}
              value={draf.judul}
              placeholder="Promo PINDAI"
              onChange={(event) =>
                setDraf({ ...draf, judul: event.target.value })
              }
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Dibaca pembaca layar dan tampil bila gambar gagal dimuat.
            </p>
          </div>

          <div>
            <Label htmlFor="banner-promo-tautan" className="text-xs">
              Tautan saat banner diklik (opsional)
            </Label>
            <Input
              id="banner-promo-tautan"
              className="mt-1 bg-white"
              maxLength={BATAS_BANNER.tautan}
              value={draf.tautan}
              placeholder="/promo"
              onChange={(event) =>
                setDraf({ ...draf, tautan: event.target.value })
              }
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Path internal saja, mis. <code>/promo</code>,{" "}
              <code>/biaya</code>, atau <code>/dashboard?tab=form</code>. Kosongkan
              bila banner tidak perlu diklik.
            </p>
          </div>

          <div>
            <Label htmlFor="banner-promo-ikatan" className="text-xs">
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
              <SelectTrigger id="banner-promo-ikatan" className="mt-1 w-full bg-white">
                <SelectValue placeholder="Pilih promo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tanpa-promo">
                  Tanpa ikatan — tampil selama sakelar aktif
                </SelectItem>
                {(promo ?? []).map((row) => (
                  <SelectItem key={row._id} value={row._id}>
                    {row.nama} · {row.persenBunga}% tenor{" "}
                    {[...row.tenor].sort((a, b) => a - b).join("/")} hari · s.d.{" "}
                    {formatTanggalWIB(row.selesai)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
              {draf.promoBungaId === ""
                ? "Banner tidak mengikuti tanggal promo apa pun."
                : terpilih === null
                  ? "Promo yang dipilih tidak ditemukan; banner tidak akan tampil."
                  : terpilih.berjalan
                    ? `Promo berjalan sampai ${formatTanggalWIB(terpilih.selesai)}. Banner ikut berhenti setelah tanggal itu.`
                    : "Promo belum berjalan atau sudah berakhir; banner menunggu jadwal promo."}
            </p>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2.5">
            <div>
              <Label htmlFor="banner-promo-aktif" className="text-xs">
                Tampilkan banner
              </Label>
              <p className="text-[11px] text-muted-foreground">
                Sakelar utama; gambar tetap tersimpan saat dimatikan.
              </p>
            </div>
            <Switch
              id="banner-promo-aktif"
              checked={draf.aktif}
              onCheckedChange={(aktif) => setDraf({ ...draf, aktif })}
            />
          </div>

          <Button
            type="button"
            size="sm"
            className="min-h-11 w-full bg-[#064E3B] text-white hover:bg-[#021E17]"
            disabled={busy !== null}
            onClick={() => void simpanSetelan()}
          >
            {busy === "simpan" ? (
              <Loader2 className="mr-1.5 size-4 animate-spin" />
            ) : (
              <Save className="mr-1.5 size-4" />
            )}
            Simpan pengaturan banner
          </Button>
        </div>
      </div>

      <AlertDialog open={konfirmasiHapus} onOpenChange={setKonfirmasiHapus}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Lepas gambar banner?</AlertDialogTitle>
            <AlertDialogDescription>
              Gambar dihapus dari penyimpanan dan beranda langsung kosong lagi.
              Pengaturan tautan dan ikatan promo tetap disimpan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy === "hapus"}>Batal</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 text-white hover:bg-rose-700"
              disabled={busy === "hapus"}
              onClick={(event) => {
                event.preventDefault();
                void lepasGambar();
              }}
            >
              {busy === "hapus" ? "Menghapus…" : "Ya, lepas gambar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
