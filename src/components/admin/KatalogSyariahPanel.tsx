/**
 * Pengelola katalog Murabahah di panel admin.
 *
 * Admin bisa memuat daftar awal, menambah barang, mengubah harga, dan
 * menonaktifkan barang. Nonaktif adalah tombol yang paling penting: bila
 * tinjauan dewan pengawas syariah memutuskan produk pulsa/PPOB dihentikan,
 * barangnya disembunyikan dari formulir tanpa rilis kode.
 *
 * Setiap perubahan harga dicatat di riwayat. Pengajuan yang sudah dikirim
 * menyimpan harga saat itu, jadi mengubah harga di sini tidak menggeser
 * pengajuan lama.
 */
import { useMutation, useQuery } from "convex/react";
import { Banknote, Package, Search, ShieldAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { formatDate } from "@/components/admin/admin-format";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { BarisKatalogAdmin } from "@/convex/katalog";
import { formatRupiah } from "@/lib/money";
import { cn } from "@/lib/utils";
import { MIN_AKAD_SYARIAH } from "@/lib/syariah/akad";
import {
  KATEGORI_KATALOG,
  LABEL_JENIS_BARANG,
  type JenisBarangKatalog,
  type KategoriKatalog,
} from "@/lib/syariah/katalog";

type Isian = {
  kode: string | null;
  nama: string;
  kategori: KategoriKatalog;
  jenisBarang: JenisBarangKatalog;
  /** Disimpan sebagai teks agar kolom bisa dikosongkan saat mengetik. */
  harga: string;
  aktif: boolean;
};

export function KatalogSyariahPanel() {
  const data = useQuery(api.katalog.daftarKatalogAdmin);
  const muatAwal = useMutation(api.katalog.muatKatalogAwal);
  const simpan = useMutation(api.katalog.simpanBarang);

  const [cari, setCari] = useState("");
  const [isian, setIsian] = useState<Isian | null>(null);
  const [catatan, setCatatan] = useState("");
  const [busy, setBusy] = useState(false);
  const [memuatAwal, setMemuatAwal] = useState(false);

  const kodeRiwayat = isian?.kode ?? null;
  const riwayat = useQuery(
    api.katalog.riwayatHarga,
    kodeRiwayat === null ? "skip" : { kode: kodeRiwayat },
  );

  const semua = useMemo(() => data?.baris ?? [], [data]);
  const baris = useMemo(() => {
    const needle = cari.trim().toLowerCase();
    if (needle === "") return semua;
    return semua.filter((item) =>
      `${item.nama} ${item.kategori} ${item.kode}`.toLowerCase().includes(needle),
    );
  }, [semua, cari]);

  /** Barang dikelompokkan per kategori dan diurutkan dari termurah, supaya
   *  daftar 50+ baris terbaca sebagai daftar harga, bukan tumpukan acak. */
  const grup = useMemo(
    () =>
      KATEGORI_KATALOG.map((kategori) => ({
        kategori,
        items: baris
          .filter((item) => item.kategori === kategori)
          .sort((a, b) => a.harga - b.harga),
      })).filter((satu) => satu.items.length > 0),
    [baris],
  );
  const jumlahAktif = semua.filter((item) => item.aktif).length;

  const hargaAngka = Number((isian?.harga ?? "").replace(/[^0-9]/g, ""));
  const bisaSimpan =
    isian !== null &&
    isian.nama.trim().length >= 3 &&
    Number.isSafeInteger(hargaAngka) &&
    hargaAngka >= MIN_AKAD_SYARIAH &&
    !busy;

  function buka(item: BarisKatalogAdmin) {
    setIsian({
      kode: item.kode,
      nama: item.nama,
      kategori: item.kategori,
      jenisBarang: item.jenisBarang,
      harga: String(item.harga),
      aktif: item.aktif,
    });
    setCatatan("");
  }

  function barangBaru() {
    setIsian({
      kode: null,
      nama: "",
      kategori: "Elektronik",
      jenisBarang: "fisik",
      harga: "",
      aktif: true,
    });
    setCatatan("");
  }

  async function muat() {
    setMemuatAwal(true);
    try {
      const hasil = await muatAwal({});
      toast.success(
        hasil.ditambahkan === 0
          ? "Semua barang awal sudah dimuat."
          : `${hasil.ditambahkan} barang awal dimuat.`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal memuat katalog.");
    } finally {
      setMemuatAwal(false);
    }
  }

  async function simpanBarang() {
    if (isian === null) return;
    setBusy(true);
    try {
      await simpan({
        ...(isian.kode === null ? {} : { kode: isian.kode }),
        nama: isian.nama,
        kategori: isian.kategori,
        jenisBarang: isian.jenisBarang,
        harga: hargaAngka,
        aktif: isian.aktif,
        ...(catatan.trim() === "" ? {} : { catatan: catatan.trim() }),
      });
      toast.success(
        isian.kode === null
          ? "Barang katalog ditambahkan."
          : "Barang katalog disimpan.",
      );
      setIsian(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menyimpan barang.");
    } finally {
      setBusy(false);
    }
  }

  if (data === undefined) {
    return (
      <div className="space-y-2" role="status" aria-live="polite">
        <span className="sr-only">Memuat katalog Murabahah…</span>
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  return (
    <section aria-labelledby="judul-katalog-syariah" className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          <h3
            id="judul-katalog-syariah"
            className="flex items-center gap-2 text-base font-semibold text-navy"
          >
            <Package className="size-4 text-amber-700" aria-hidden />
            Katalog Murabahah
          </h3>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
            Harga pokok dari mitra; margin ditambahkan mesin akad. Pengajuan
            yang sudah dikirim menyimpan harganya sendiri, jadi perubahan harga
            hanya berlaku untuk pengajuan berikutnya.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-11"
          onClick={barangBaru}
        >
          Tambah barang
        </Button>
      </div>

      <p className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-950">
        <ShieldAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        <span>
          Pulsa/PPOB bisa dinonaktifkan kapan saja — langsung hilang dari
          formulir, riwayat tetap tersimpan. Aktifkan hanya setelah lolos
          tinjauan dewan pengawas syariah.
        </span>
      </p>

      {data.belumDimuat > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
          <p className="text-[11px] leading-5 text-slate-700">
            <span className="font-semibold tabular-nums">
              {data.belumDimuat} barang
            </span>{" "}
            masih memakai daftar awal dan belum tercatat di tabel. Muat katalog
            awal agar semuanya bisa disunting dan riwayat harganya tercatat.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-11"
            disabled={memuatAwal}
            onClick={muat}
          >
            <Banknote className="size-4" aria-hidden />
            {memuatAwal ? "Memuat…" : "Muat katalog awal"}
          </Button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search
            className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            aria-label="Cari barang katalog"
            value={cari}
            onChange={(event) => setCari(event.target.value)}
            placeholder="Cari nama, kategori, atau kode barang…"
            className="pl-9"
          />
        </div>
        <p className="text-[11px] tabular-nums text-slate-500">
          {cari.trim() === ""
            ? `${semua.length} barang · ${jumlahAktif} aktif`
            : `${baris.length} dari ${semua.length} cocok`}
        </p>
      </div>

      {grup.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-200 bg-white px-5 py-8 text-center text-sm text-muted-foreground">
          {cari.trim() === ""
            ? "Katalog masih kosong. Tambah barang atau muat katalog awal."
            : "Tidak ada barang yang cocok dengan pencarian."}
        </p>
      ) : (
        <div className="space-y-3">
          {grup.map(({ kategori, items }) => {
            const idJudul = `katalog-grup-${kategori
              .replace(/[^a-z]+/gi, "-")
              .toLowerCase()}`;
            return (
              <section
                key={kategori}
                aria-labelledby={idJudul}
                className="overflow-hidden rounded-2xl border border-slate-200 bg-white"
              >
                <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2">
                  <h4
                    id={idJudul}
                    className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-600"
                  >
                    {kategori}
                  </h4>
                  <span className="text-[11px] tabular-nums text-slate-500">
                    {items.length} barang
                  </span>
                </div>
                <ul className="divide-y divide-slate-100">
                  {items.map((item) => (
                    <li
                      key={item.kode}
                      className={cn(
                        "flex items-center gap-3 px-4 py-2.5",
                        !item.aktif && "bg-slate-50/70",
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-slate-900">
                            {item.nama}
                          </p>
                          {!item.aktif && (
                            <span className="rounded-md border border-slate-300 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                              Nonaktif
                            </span>
                          )}
                          {!item.dimuat && (
                            <span className="rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-900">
                              Daftar awal
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-[11px] leading-4 text-slate-500">
                          {LABEL_JENIS_BARANG[item.jenisBarang]} · {item.kode}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-3">
                        <p className="text-sm font-semibold tabular-nums text-slate-900">
                          {formatRupiah(item.harga)}
                        </p>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="min-h-11 shrink-0 px-2.5 text-primary hover:bg-primary/5"
                          onClick={() => buka(item)}
                        >
                          Ubah
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      <Dialog open={isian !== null} onOpenChange={(open) => !open && setIsian(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          {isian !== null && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {isian.kode === null ? "Tambah barang katalog" : isian.nama}
                </DialogTitle>
                <DialogDescription>
                  Harga pokok dari mitra. Nominal akad peminjam mengikuti harga
                  ini ditambah margin yang disepakati.
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Label htmlFor="katalog-nama">Nama barang</Label>
                  <Input
                    id="katalog-nama"
                    value={isian.nama}
                    maxLength={80}
                    disabled={busy}
                    onChange={(event) =>
                      setIsian({ ...isian, nama: event.target.value })
                    }
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label htmlFor="katalog-kategori">Kategori</Label>
                  <Select
                    value={isian.kategori}
                    onValueChange={(nilai) =>
                      setIsian({ ...isian, kategori: nilai as KategoriKatalog })
                    }
                  >
                    <SelectTrigger id="katalog-kategori" className="mt-1 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {KATEGORI_KATALOG.map((kategori) => (
                        <SelectItem key={kategori} value={kategori}>
                          {kategori}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="katalog-jenis">Jenis barang</Label>
                  {isian.kode === null ? (
                    <Select
                      value={isian.jenisBarang}
                      onValueChange={(nilai) =>
                        setIsian({
                          ...isian,
                          jenisBarang: nilai as JenisBarangKatalog,
                        })
                      }
                    >
                      <SelectTrigger id="katalog-jenis" className="mt-1 w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fisik">Barang fisik</SelectItem>
                        <SelectItem value="digital">Pulsa / PPOB</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-700">
                      {LABEL_JENIS_BARANG[isian.jenisBarang]} — jenis tidak
                      diubah untuk barang yang sudah ada, agar akad lama tetap
                      terbaca.
                    </p>
                  )}
                </div>

                <div>
                  <Label htmlFor="katalog-harga">Harga pokok</Label>
                  <Input
                    id="katalog-harga"
                    inputMode="numeric"
                    value={isian.harga}
                    disabled={busy}
                    onChange={(event) =>
                      setIsian({ ...isian, harga: event.target.value })
                    }
                    className="mt-1 tabular-nums"
                  />
                  <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                    Minimal {formatRupiah(MIN_AKAD_SYARIAH)} (batas akad).
                  </p>
                </div>

                <div className="flex items-end">
                  <label className="flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700">
                    <Checkbox
                      checked={isian.aktif}
                      onCheckedChange={(nilai) =>
                        setIsian({ ...isian, aktif: nilai === true })
                      }
                      disabled={busy}
                    />
                    Tampilkan di formulir
                  </label>
                </div>
              </div>

              <div>
                <Label htmlFor="katalog-catatan">
                  Catatan perubahan harga (opsional)
                </Label>
                <Textarea
                  id="katalog-catatan"
                  value={catatan}
                  maxLength={200}
                  disabled={busy}
                  placeholder="mis. harga mitra naik per Oktober"
                  onChange={(event) => setCatatan(event.target.value)}
                  className="mt-1"
                />
              </div>

              {isian.kode !== null && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                  <p className="text-xs font-semibold text-slate-900">
                    Riwayat harga
                  </p>
                  {riwayat === undefined ? (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Memuat riwayat…
                    </p>
                  ) : riwayat.length === 0 ? (
                    <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                      Belum ada perubahan harga sejak barang ini dimuat.
                    </p>
                  ) : (
                    <ul className="mt-1 divide-y divide-slate-200">
                      {riwayat.map((barisRiwayat) => (
                        <li
                          key={`${barisRiwayat.diubahPada}-${barisRiwayat.hargaLama}`}
                          className="py-1.5 text-[11px] leading-5 text-slate-700"
                        >
                          <span className="tabular-nums">
                            {formatRupiah(barisRiwayat.hargaLama)} →{" "}
                            {formatRupiah(barisRiwayat.hargaBaru)}
                          </span>
                          {" · "}
                          {formatDate(barisRiwayat.diubahPada)} ·{" "}
                          {barisRiwayat.diubahOlehLabel}
                          {barisRiwayat.catatan === null
                            ? ""
                            : ` · ${barisRiwayat.catatan}`}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              <DialogFooter className="gap-2 sm:justify-between">
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  disabled={busy}
                  onClick={() => setIsian(null)}
                >
                  Batal
                </Button>
                <Button
                  type="button"
                  className="min-h-11"
                  disabled={!bisaSimpan}
                  onClick={simpanBarang}
                >
                  {busy ? "Menyimpan…" : "Simpan barang"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
