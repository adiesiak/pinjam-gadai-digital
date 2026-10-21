import type { FunctionReturnType } from "convex/server";
import { useMutation, useQuery } from "convex/react";
import { CalendarClock, Loader2, Megaphone, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { PromoPinjamanKartu } from "@/components/promo/PromoPinjamanKartu";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  BATAS_PROMO,
  msKeTanggalInput,
  PENEMPATAN_PROMO,
  formatPeriodePromo,
  labelPenempatan,
  periksaIsiPromo,
  tanggalKeMsWIB,
  type PenempatanPromo,
  type StatusPromo,
} from "@/lib/promoPinjaman";
import { formatTanggalWIB } from "@/lib/waktu";

type BarisPromo = FunctionReturnType<typeof api.promoPinjaman.daftar>[number];

type Draf = {
  id?: Id<"promoPinjaman">;
  badge: string;
  judul: string;
  deskripsi: string;
  mulai: string;
  selesai: string;
  penempatan: PenempatanPromo[];
  aktif: boolean;
};

const STATUS: Record<StatusPromo, { label: string; kelas: string }> = {
  berjalan: {
    label: "Berjalan",
    kelas: "border-emerald-700/30 bg-emerald-700/10 text-emerald-800",
  },
  dijadwalkan: {
    label: "Dijadwalkan",
    kelas: "border-sky-700/30 bg-sky-700/10 text-sky-800",
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
    badge: "",
    judul: "",
    deskripsi: "",
    mulai: msKeTanggalInput(sekarang),
    selesai: msKeTanggalInput(sekarang + 14 * 86_400_000),
    penempatan: ["dashboard", "pengajuan"],
    aktif: true,
  };
}

function drafDari(row: BarisPromo): Draf {
  return {
    id: row._id,
    badge: row.badge,
    judul: row.judul,
    deskripsi: row.deskripsi,
    mulai: msKeTanggalInput(row.mulai),
    selesai: msKeTanggalInput(row.selesai),
    penempatan: [...row.penempatan],
    aktif: row.aktif,
  };
}

/**
 * Pengatur promo pinjaman.
 *
 * Daftar lebih dulu karena pertanyaan admin di sini adalah "apa yang sedang
 * tampil dan sampai kapan", bukan "isi formulir". Formulir dan pratinjau
 * muncul saat membuat atau menyunting satu kampanye.
 */
export function PromoPinjamanPanel() {
  const daftar = useQuery(api.promoPinjaman.daftar);
  const simpan = useMutation(api.promoPinjaman.simpan);
  const hapus = useMutation(api.promoPinjaman.hapus);

  const [terbuka, setTerbuka] = useState(false);
  const [draf, setDraf] = useState<Draf>(drafBaru);
  const [pesan, setPesan] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const [dihapus, setDihapus] = useState<{ id: Id<"promoPinjaman">; judul: string } | null>(
    null,
  );

  const bukaBaru = () => {
    setDraf(drafBaru());
    setPesan(null);
    setTerbuka(true);
  };

  const bukaSunting = (row: BarisPromo) => {
    setDraf(drafDari(row));
    setPesan(null);
    setTerbuka(true);
  };

  const ubahPenempatan = (id: PenempatanPromo, dicentang: boolean) => {
    setDraf((sebelumnya) => ({
      ...sebelumnya,
      penempatan: dicentang
        ? [...sebelumnya.penempatan, id]
        : sebelumnya.penempatan.filter((p) => p !== id),
    }));
  };

  const kirim = async () => {
    const mulai = tanggalKeMsWIB(draf.mulai);
    const selesai = tanggalKeMsWIB(draf.selesai, true);
    if (mulai === null || selesai === null) {
      setPesan("Lengkapi tanggal mulai dan tanggal selesai.");
      return;
    }

    const isi = {
      badge: draf.badge,
      judul: draf.judul,
      deskripsi: draf.deskripsi,
      mulai,
      selesai,
      penempatan: draf.penempatan,
      aktif: draf.aktif,
    };
    const kesalahan = periksaIsiPromo(isi);
    if (kesalahan.length > 0) {
      setPesan(kesalahan[0]);
      return;
    }

    setSibuk(true);
    setPesan(null);
    try {
      await simpan({ ...isi, id: draf.id });
      toast.success(draf.id === undefined ? "Promo dibuat." : "Promo diperbarui.");
      setTerbuka(false);
    } catch (galat) {
      setPesan(galat instanceof Error ? galat.message : "Promo gagal disimpan.");
    } finally {
      setSibuk(false);
    }
  };

  const konfirmasiHapus = async () => {
    if (dihapus === null) return;
    setSibuk(true);
    try {
      await hapus({ id: dihapus.id });
      toast.success("Promo dihapus.");
      setDihapus(null);
    } catch (galat) {
      toast.error(galat instanceof Error ? galat.message : "Promo gagal dihapus.");
    } finally {
      setSibuk(false);
    }
  };

  const pratinjauMulai = tanggalKeMsWIB(draf.mulai);
  const pratinjauSelesai = tanggalKeMsWIB(draf.selesai, true);
  const pratinjau =
    pratinjauMulai === null || pratinjauSelesai === null
      ? null
      : {
          badge: draf.badge,
          judul: draf.judul.trim() === "" ? "Judul promo tampil di sini" : draf.judul,
          deskripsi:
            draf.deskripsi.trim() === ""
              ? "Deskripsi singkat kampanye tampil di sini."
              : draf.deskripsi,
          mulai: pratinjauMulai,
          selesai: pratinjauSelesai,
        };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-navy">
            <Megaphone className="size-4 text-primary" aria-hidden="true" />
            Promo pinjaman
          </h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Promo hanya mengganti teks kampanye di tempat yang dipilih. Bunga, biaya,
            dan plafon tetap dibaca dari pengaturan yang berlaku untuk tiap nasabah.
          </p>
        </div>
        <Button type="button" onClick={bukaBaru} className="gap-1.5">
          <Plus className="size-4" aria-hidden="true" />
          Buat promo
        </Button>
      </div>

      {daftar === undefined ? (
        <div role="status" className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
          Memuat promo…
        </div>
      ) : daftar.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="text-sm font-medium text-slate-800">Belum ada promo.</p>
          <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-slate-500">
            Promo yang aktif akan tampil di beranda publik, dashboard nasabah, halaman
            /promo, atau form pengajuan sesuai tempat yang dipilih.
          </p>
          <Button type="button" variant="outline" onClick={bukaBaru} className="mt-4 gap-1.5">
            <Plus className="size-4" aria-hidden="true" />
            Buat promo pertama
          </Button>
        </div>
      ) : (
        <ul className="space-y-3">
          {daftar.map((row) => {
            const status = STATUS[row.status];
            return (
              <li
                key={row._id}
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${status.kelas}`}
                      >
                        {status.label}
                      </span>
                      <p className="text-sm font-semibold text-slate-900">{row.judul}</p>
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-600">
                      {row.deskripsi}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                      <span className="inline-flex items-center gap-1">
                        <CalendarClock className="size-3.5" aria-hidden="true" />
                        {formatPeriodePromo(row.mulai, row.selesai)}
                      </span>
                      <span>
                        {row.penempatan.length === 0
                          ? "Belum ada tempat"
                          : row.penempatan.map(labelPenempatan).join(" · ")}
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
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
                      onClick={() => setDihapus({ id: row._id, judul: row.judul })}
                    >
                      <Trash2 className="size-3.5" aria-hidden="true" />
                      Hapus
                    </Button>
                  </div>
                </div>
                <p className="mt-3 border-t border-slate-100 pt-2 text-[11px] text-slate-400">
                  Diperbarui {formatTanggalWIB(row.diperbaruiPada)} oleh {row.diperbaruiOleh}
                </p>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={terbuka} onOpenChange={setTerbuka}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{draf.id === undefined ? "Buat promo" : "Sunting promo"}</DialogTitle>
            <DialogDescription>
              Teks ini tampil sebagai pengumuman kampanye, bukan penawaran suku bunga.
              Sebutkan syarat yang benar-benar berlaku di deskripsi.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="promo-badge">
                Label kecil <span className="text-slate-400">(opsional)</span>
              </Label>
              <Input
                id="promo-badge"
                className="mt-1"
                maxLength={BATAS_PROMO.badge}
                value={draf.badge}
                placeholder="Contoh: Promo Oktober"
                onChange={(e) => setDraf({ ...draf, badge: e.target.value })}
              />
              <p className="mt-1 text-xs text-slate-500">
                Tampil di atas judul. Kosongkan bila tidak perlu.
              </p>
            </div>

            <div>
              <div className="flex items-baseline justify-between gap-2">
                <Label htmlFor="promo-judul">Judul</Label>
                <span className="text-xs tabular-nums text-slate-400">
                  {draf.judul.length}/{BATAS_PROMO.judul}
                </span>
              </div>
              <Input
                id="promo-judul"
                className="mt-1"
                maxLength={BATAS_PROMO.judul}
                value={draf.judul}
                placeholder="Contoh: Tenor pilihan lebih panjang"
                onChange={(e) => setDraf({ ...draf, judul: e.target.value })}
              />
            </div>

            <div>
              <div className="flex items-baseline justify-between gap-2">
                <Label htmlFor="promo-deskripsi">Deskripsi</Label>
                <span className="text-xs tabular-nums text-slate-400">
                  {draf.deskripsi.length}/{BATAS_PROMO.deskripsi}
                </span>
              </div>
              <Textarea
                id="promo-deskripsi"
                rows={3}
                className="mt-1"
                maxLength={BATAS_PROMO.deskripsi}
                value={draf.deskripsi}
                placeholder="Tulis satu atau dua kalimat: apa yang ditawarkan dan untuk siapa."
                onChange={(e) => setDraf({ ...draf, deskripsi: e.target.value })}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="promo-mulai">Mulai berlaku</Label>
                <Input
                  id="promo-mulai"
                  type="date"
                  className="mt-1"
                  value={draf.mulai}
                  onChange={(e) => setDraf({ ...draf, mulai: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="promo-selesai">Selesai berlaku</Label>
                <Input
                  id="promo-selesai"
                  type="date"
                  className="mt-1"
                  value={draf.selesai}
                  onChange={(e) => setDraf({ ...draf, selesai: e.target.value })}
                />
              </div>
            </div>

            <fieldset>
              <legend className="text-sm font-medium">Tempat tampil</legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {PENEMPATAN_PROMO.map((p) => {
                  const dicentang = draf.penempatan.includes(p.id);
                  return (
                    <label
                      key={p.id}
                      className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700"
                    >
                      <input
                        type="checkbox"
                        className="size-4 accent-emerald-800"
                        checked={dicentang}
                        onChange={(e) => ubahPenempatan(p.id, e.target.checked)}
                      />
                      {p.label}
                      {"catatan" in p ? (
                        <span className="text-xs text-slate-400">({p.catatan})</span>
                      ) : null}
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2.5">
              <div>
                <Label htmlFor="promo-aktif">Aktif</Label>
                <p className="mt-0.5 text-xs text-slate-500">
                  Nonaktif menyimpan teks tanpa menampilkannya di halaman mana pun.
                </p>
              </div>
              <Switch
                id="promo-aktif"
                checked={draf.aktif}
                onCheckedChange={(aktif) => setDraf({ ...draf, aktif })}
              />
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                Pratinjau
              </p>
              {pratinjau === null ? (
                <p className="mt-2 rounded-lg border border-dashed border-slate-300 px-3 py-4 text-sm text-slate-500">
                  Lengkapi tanggal mulai dan selesai untuk melihat pratinjau.
                </p>
              ) : (
                <PromoPinjamanKartu
                  promo={pratinjau}
                  penempatan={draf.penempatan[0] ?? "dashboard"}
                  onAjukan={() => {}}
                  nonaktifkanAksi
                  className="mt-2"
                />
              )}
            </div>

            {pesan === null ? null : (
              <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {pesan}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setTerbuka(false)}>
              Batal
            </Button>
            <Button type="button" onClick={kirim} disabled={sibuk} className="gap-1.5">
              {sibuk ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
              {draf.id === undefined ? "Simpan promo" : "Simpan perubahan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={dihapus !== null} onOpenChange={(buka) => !buka && setDihapus(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus promo ini?</AlertDialogTitle>
            <AlertDialogDescription>
              {dihapus === null
                ? ""
                : `"${dihapus.judul}" akan hilang dari semua tempat tampilnya. Tindakan ini tidak bisa dibatalkan.`}
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
    </div>
  );
}
