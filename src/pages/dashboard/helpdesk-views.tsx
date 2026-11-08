/**
 * Tab "Tiket" — kotak bantuan nasabah.
 *
 * Pengaduan yang sudah ada di `pengaduanNasabah` dipakai sebagai tiket: satu
 * baris adalah satu percakapan, bukan satu formulir yang hilang setelah dikirim.
 * Nasabah dapat melihat nomor tiket, status, balasan baru, dan seluruh utas di
 * satu tempat. Status, penugasan, dan penyelesaian tetap milik petugas.
 *
 * Ketahanan mobile yang dijaga:
 *  - Draf formulir disimpan di `sessionStorage` lewat `lib/drafPengaduan.ts`.
 *  - Sinyal kembali dari aplikasi lain memberi tahu bahwa draf masih tersimpan.
 *  - Peringatan meninggalkan halaman muncul selama draf belum terkirim.
 */
import { useMutation, useQuery } from "convex/react";
import {
  ArrowLeft,
  CheckCircle2,
  Inbox,
  Loader2,
  MessageSquare,
  Plus,
  Send,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { IkonWhatsapp } from "@/components/IkonWhatsapp";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useCegahTinggalkan } from "@/hooks/use-cegah-tinggalkan";
import { useMobileLifecycle } from "@/hooks/useMobileLifecycle";
import { urlChatCs } from "@/lib/kontak";
import {
  bacaDrafPengaduan,
  drafBerisi,
  hapusDrafPengaduan,
  simpanDrafPengaduan,
} from "@/lib/drafPengaduan";
import { nadaPrioritasPengaduan, nadaStatusPengaduan } from "@/lib/pengaduanStatus";
import {
  KATEGORI_PENGADUAN,
  LABEL_KATEGORI_PENGADUAN,
  PANJANG_MAKS_PESAN_PENGADUAN,
  PANJANG_MIN_PENGADUAN,
} from "@/lib/penagihan";
import { cn } from "@/lib/utils";

import { EmptyState } from "./empty-state";
import { formatDate } from "./shared";

export type PengaduanSaya = {
  _id: Id<"pengaduanNasabah">;
  nomorTiket: string;
  nomorReferensi: string | null;
  kanal: string;
  kategori: string;
  kategoriLabel: string;
  isi: string;
  status: string;
  statusLabel: string;
  prioritas: string;
  prioritasLabel: string;
  petugasLabel: string | null;
  penyelesaian: string | null;
  dibuatPada: number;
  diperbaruiPada: number;
  ditutupPada: number | null;
  jumlahPesan: number;
  pesanTerakhir: string | null;
  pesanTerakhirArah: string | null;
  pesanTerakhirPada: number | null;
  jumlahBelumDibaca: number;
  bolehBalas: boolean;
};

export type PesanUtasSaya = {
  _id: Id<"pengaduanPesan">;
  arah: string;
  isi: string;
  penulisLabel: string;
  dibuatPada: number;
};

/**
 * Daftar pesan satu utas — komponen MURNI (tanpa server) supaya dapat diuji
 * dengan render statis.
 */
export function DaftarPesanPengaduan({ pesan }: { pesan: PesanUtasSaya[] }) {
  if (pesan.length === 0) {
    return (
      <p className="rounded-xl bg-slate-50 px-3 py-4 text-xs leading-5 text-muted-foreground">
        Belum ada pesan pada tiket ini.
      </p>
    );
  }
  return (
    <ul className="space-y-3">
      {pesan.map((m) => (
        <li
          key={m._id}
          className={cn(
            "max-w-[92%] rounded-2xl border px-3.5 py-2.5",
            m.arah === "nasabah"
              ? "ml-auto border-primary/20 bg-primary/5"
              : "mr-auto border-slate-200 bg-white",
          )}
        >
          <p className="text-[11px] font-medium leading-5 text-muted-foreground">
            {m.arah === "nasabah" ? "Anda" : "Petugas PINDAI"}
            {m.penulisLabel.trim() !== "" ? ` · ${m.penulisLabel}` : ""}{" "}
            · {formatDate(m.dibuatPada)}
          </p>
          <p className="mt-1 whitespace-pre-line break-words text-sm leading-6 text-slate-700">
            {m.isi}
          </p>
        </li>
      ))}
    </ul>
  );
}

function ringkasStatusTiket(tiket: PengaduanSaya): string {
  if (tiket.jumlahBelumDibaca > 0) {
    return `${tiket.jumlahBelumDibaca} balasan baru`;
  }
  if (!tiket.bolehBalas) return "Tiket sudah ditutup";
  if (tiket.pesanTerakhirArah === "petugas") return "Balasan petugas";
  if (tiket.status === "baru") return "Menunggu petugas";
  return "Sedang ditinjau petugas";
}

/**
 * Satu kartu tiket di daftar — MURNI, tanpa query, supaya bisa diuji tanpa
 * server dan tanpa memasang provider Convex.
 */
export function KartuTiket({
  tiket,
  aktif,
  onPilih,
}: {
  tiket: PengaduanSaya;
  aktif: boolean;
  onPilih: () => void;
}) {
  const cuplikan = tiket.pesanTerakhir ?? tiket.isi;
  const belumDibaca = tiket.jumlahBelumDibaca > 0;

  return (
    <li>
      <button
        type="button"
        aria-pressed={aktif}
        onClick={onPilih}
        className={cn(
          "group flex min-h-11 w-full flex-col gap-2 rounded-xl border px-3.5 py-3 text-left transition-colors",
          "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          aktif
            ? "border-primary/40 bg-primary/5"
            : "border-transparent hover:border-slate-200 hover:bg-slate-50/80",
        )}
      >
        <span className="flex items-start justify-between gap-2">
          <span className="truncate font-mono text-xs text-slate-500">{tiket.nomorTiket}</span>
          <Badge className={cn("shrink-0", nadaStatusPengaduan(tiket.status))}>
            {tiket.statusLabel}
          </Badge>
        </span>

        <span className="block min-w-0">
          <span className="block truncate text-sm font-semibold text-navy">
            {tiket.kategoriLabel}
          </span>
          <span className="mt-1 line-clamp-2 block text-xs leading-5 text-slate-600">
            {cuplikan}
          </span>
        </span>

        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span>Diperbarui {formatDate(tiket.diperbaruiPada)}</span>
          <span aria-hidden>·</span>
          <span
            className={cn(
              "inline-flex items-center gap-1.5",
              belumDibaca && "font-semibold text-primary",
            )}
          >
            {belumDibaca && (
              <span className="size-2 shrink-0 rounded-full bg-primary" aria-hidden />
            )}
            {ringkasStatusTiket(tiket)}
          </span>
        </span>
      </button>
    </li>
  );
}

function SkeletonDaftarTiket() {
  return (
    <div className="space-y-2" role="status">
      <span className="sr-only">Memuat tiket…</span>
      {[0, 1, 2].map((n) => (
        <div key={n} className="rounded-xl border border-slate-100 p-3.5">
          <div className="flex items-center justify-between gap-3">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
          <Skeleton className="mt-3 h-4 w-40" />
          <Skeleton className="mt-2 h-3 w-full" />
          <Skeleton className="mt-2 h-3 w-2/3" />
        </div>
      ))}
    </div>
  );
}

function FormTiketBaru({
  loans,
  onSelesai,
}: {
  loans: ReadonlyArray<{ _id: Id<"loans">; nomorReferensi: string }>;
  onSelesai: (id: Id<"pengaduanNasabah">) => void;
}) {
  const buka = useMutation(api.penagihan.bukaPengaduanSaya);
  const { state: lifecycle, markRestored } = useMobileLifecycle();

  // Draf dibaca SEKALI lewat penginisialisasi state, bukan di dalam efek:
  // nilainya sudah benar pada render pertama dan tidak menimpa ketikan.
  const [drafAwal] = useState(() => {
    const draf = bacaDrafPengaduan();
    return draf !== null && drafBerisi(draf.isi) ? draf : null;
  });
  const [kategori, setKategori] = useState<string>(() => {
    const dariDraf = drafAwal?.kategori;
    if (dariDraf !== undefined && (KATEGORI_PENGADUAN as readonly string[]).includes(dariDraf)) {
      return dariDraf;
    }
    return "permintaan_penjelasan";
  });
  const [isi, setIsi] = useState(drafAwal?.isi ?? "");
  const [loanId, setLoanId] = useState<string>(drafAwal?.loanId ?? "__umum__");
  const [busy, setBusy] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  const kotor = drafBerisi(isi);
  useCegahTinggalkan(kotor);

  useEffect(() => {
    if (drafAwal === null) return;
    const id = setTimeout(() => {
      toast.info("Draf tiket Anda dipulihkan.");
    }, 0);
    return () => clearTimeout(id);
  }, [drafAwal]);

  useEffect(() => {
    if (!lifecycle.isPageRestored) return;
    const id = setTimeout(() => {
      const draf = bacaDrafPengaduan();
      if (draf !== null && drafBerisi(draf.isi)) {
        toast.info("Draf tiket Anda masih tersimpan.");
      }
      markRestored();
    }, 0);
    return () => clearTimeout(id);
  }, [lifecycle.isPageRestored, markRestored]);

  useEffect(() => {
    if (!kotor) return;
    const id = setTimeout(() => {
      simpanDrafPengaduan({
        kategori,
        isi,
        loanId: loanId === "__umum__" ? null : loanId,
      });
    }, 500);
    return () => clearTimeout(id);
  }, [kategori, isi, loanId, kotor]);

  async function kirim() {
    if (busy || isi.trim().length < PANJANG_MIN_PENGADUAN) return;
    setBusy(true);
    setGalat(null);
    try {
      const hasil = await buka({
        kategori,
        isi,
        ...(loanId === "__umum__" ? {} : { loanId: loanId as Id<"loans"> }),
      });
      hapusDrafPengaduan();
      toast.success(`Tiket ${hasil.nomorTiket} dibuat. Petugas akan meninjaunya.`);
      onSelesai(hasil.pengaduanId);
    } catch (err) {
      setGalat(
        err instanceof Error
          ? err.message
          : "Tiket gagal dibuat. Periksa sambungan lalu coba lagi.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        void kirim();
      }}
    >
      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="tiket-kategori">Jenis masalah</Label>
            <Select value={kategori} onValueChange={setKategori}>
              <SelectTrigger id="tiket-kategori" className="mt-1.5 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {KATEGORI_PENGADUAN.map((k) => (
                  <SelectItem key={k} value={k}>
                    {LABEL_KATEGORI_PENGADUAN[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="sm:col-span-2">
            <Label htmlFor="tiket-loan">Catatan pinjaman (opsional)</Label>
            <Select value={loanId} onValueChange={setLoanId}>
              <SelectTrigger id="tiket-loan" className="mt-1.5 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__umum__">Tidak untuk pinjaman tertentu</SelectItem>
                {loans.map((l) => (
                  <SelectItem key={l._id} value={l._id}>
                    {l.nomorReferensi}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <Label htmlFor="tiket-isi">
            Ceritakan kendala Anda (min. {PANJANG_MIN_PENGADUAN} karakter)
          </Label>
          <Textarea
            id="tiket-isi"
            value={isi}
            onChange={(event) => setIsi(event.target.value)}
            rows={5}
            maxLength={PANJANG_MAKS_PESAN_PENGADUAN}
            placeholder="Tuliskan yang terjadi apa adanya, beserta tanggalnya bila ingat."
            className="mt-1.5 min-h-28 resize-y"
          />
          <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
            Jangan sertakan kata sandi atau kode OTP. Draf tersimpan otomatis di perangkat ini.
          </p>
        </div>

        {kotor && (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
            Draf ini tersimpan otomatis. Pindah aplikasi atau memuat ulang halaman tidak
            menghilangkannya; draf hilang bila tab ditutup.
          </p>
        )}

        {galat !== null && (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          >
            {galat}
          </p>
        )}
      </div>

      <div className="flex flex-col-reverse gap-2 border-t border-slate-100 px-5 py-4 sm:flex-row sm:justify-end">
        <SheetClose asChild>
          <Button type="button" variant="outline" className="min-h-11">
            Batal
          </Button>
        </SheetClose>
        <Button
          type="submit"
          className="min-h-11"
          disabled={busy || isi.trim().length < PANJANG_MIN_PENGADUAN}
        >
          {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Send className="mr-2 size-4" />}
          Kirim tiket
        </Button>
      </div>
    </form>
  );
}

function PercakapanTiket({
  pengaduan,
  onBuatBaru,
}: {
  pengaduan: PengaduanSaya;
  onBuatBaru: () => void;
}) {
  const data = useQuery(api.penagihan.pesanPengaduanSaya, { pengaduanId: pengaduan._id });
  const balas = useMutation(api.penagihan.balasPengaduanSaya);
  const [pesan, setPesan] = useState("");
  const [busy, setBusy] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  const idBalas = `balas-${pengaduan._id}`;
  const idBantuan = `bantuan-${pengaduan._id}`;

  async function kirimBalasan() {
    if (busy || !drafBerisi(pesan)) return;
    setBusy(true);
    setGalat(null);
    try {
      await balas({ pengaduanId: pengaduan._id, isi: pesan });
      setPesan("");
      toast.success(`Balasan terkirim ke tiket ${pengaduan.nomorTiket}.`);
    } catch (err) {
      setGalat(
        err instanceof Error
          ? err.message
          : "Balasan gagal dikirim. Coba lagi sebentar lagi.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 px-4 py-4">
        {data === undefined ? (
          <div className="space-y-3" role="status">
            <span className="sr-only">Memuat percakapan…</span>
            <Skeleton className="h-16 w-4/5" />
            <Skeleton className="ml-auto h-16 w-3/4" />
          </div>
        ) : (
          <DaftarPesanPengaduan pesan={data as unknown as PesanUtasSaya[]} />
        )}
      </div>

      {pengaduan.bolehBalas ? (
        <form
          className="border-t border-slate-100 bg-slate-50/60 px-4 py-4"
          onSubmit={(event) => {
            event.preventDefault();
            void kirimBalasan();
          }}
        >
          <Label htmlFor={idBalas}>Tambah keterangan</Label>
          <Textarea
            id={idBalas}
            value={pesan}
            onChange={(event) => setPesan(event.target.value)}
            rows={3}
            maxLength={PANJANG_MAKS_PESAN_PENGADUAN}
            enterKeyHint="send"
            aria-describedby={idBantuan}
            placeholder="Tambahkan informasi yang membantu petugas menindaklanjuti."
            className="mt-1.5 min-h-20 resize-y bg-white"
          />
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p id={idBantuan} className="text-[11px] leading-5 text-muted-foreground">
              Balasan masuk ke tiket ini. Jangan kirim kata sandi atau kode OTP.
            </p>
            <Button
              type="submit"
              size="sm"
              className="min-h-11 shrink-0"
              disabled={busy || !drafBerisi(pesan)}
            >
              {busy ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Send className="mr-2 size-4" />
              )}
              Kirim balasan
            </Button>
          </div>
          {galat !== null && (
            <p role="alert" className="mt-2 text-xs text-destructive">
              {galat}
            </p>
          )}
        </form>
      ) : (
        <div className="border-t border-slate-100 px-4 py-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
            <p className="flex items-center gap-2 text-sm font-semibold text-navy">
              <CheckCircle2 className="size-4 text-primary" aria-hidden />
              Tiket sudah ditutup
            </p>
            <p className="mt-1.5 text-xs leading-5 text-slate-600">
              {pengaduan.penyelesaian ??
                "Petugas telah menutup tiket ini. Bila masih ada yang perlu ditangani, buat tiket baru dan sebutkan nomor tiket sebelumnya."}
            </p>
            <Button
              type="button"
              variant="outline"
              className="mt-3 min-h-11"
              onClick={onBuatBaru}
            >
              <Plus className="mr-2 size-4" aria-hidden />
              Buat tiket baru
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function PanelTiket({
  tiket,
  onKembali,
  onBuatBaru,
}: {
  tiket: PengaduanSaya;
  onKembali: () => void;
  onBuatBaru: () => void;
}) {
  const panelRef = useRef<HTMLElement>(null);

  // Di ponsel daftar disembunyikan saat tiket dipilih. Fokuskan panel baru
  // supaya fokus keyboard tidak tertinggal di tombol yang sudah tidak tampil,
  // dan pembaca layar langsung tahu percakapan mana yang terbuka.
  useEffect(() => {
    panelRef.current?.focus();
  }, [tiket._id]);

  return (
    <section
      ref={panelRef}
      tabIndex={-1}
      aria-label={`Tiket ${tiket.nomorTiket}`}
      className="flex min-w-0 flex-col rounded-2xl border border-slate-200 bg-white focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <div className="border-b border-slate-100 px-4 py-4">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-ml-2 mb-2 min-h-11 lg:hidden"
          onClick={onKembali}
        >
          <ArrowLeft className="mr-2 size-4" aria-hidden />
          Semua tiket
        </Button>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-mono text-xs text-slate-500">{tiket.nomorTiket}</p>
            <h3 className="mt-1 text-base font-semibold leading-6 text-navy sm:text-lg">
              {tiket.kategoriLabel}
            </h3>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {tiket.nomorReferensi ?? "Tanpa catatan pinjaman"} · Dibuka{" "}
              {formatDate(tiket.dibuatPada)}
            </p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              <span className={cn("inline-flex rounded-full border px-2 py-0.5", nadaPrioritasPengaduan(tiket.prioritas))}>
                Prioritas {tiket.prioritasLabel}
              </span>
              {tiket.petugasLabel !== null && tiket.petugasLabel.trim() !== "" && (
                <> · Ditangani {tiket.petugasLabel}</>
              )}
            </p>
          </div>
          <Badge className={cn("shrink-0", nadaStatusPengaduan(tiket.status))}>
            {tiket.statusLabel}
          </Badge>
        </div>
      </div>

      <PercakapanTiket pengaduan={tiket} onBuatBaru={onBuatBaru} />
    </section>
  );
}

type FilterTiket = "semua" | "aktif" | "selesai";

/** Kotak tiket nasabah: daftar di kiri, percakapan di kanan. */
export function HelpdeskSayaView({
  loans,
}: {
  loans: ReadonlyArray<{ _id: Id<"loans">; nomorReferensi: string }>;
}) {
  const data = useQuery(api.penagihan.pengaduanSaya);
  const tandaiDibaca = useMutation(api.penagihan.tandaiPengaduanDibacaSaya);

  const [filter, setFilter] = useState<FilterTiket>("semua");
  const [dipilih, setDipilih] = useState<Id<"pengaduanNasabah"> | null>(null);
  const [buatTerbuka, setBuatTerbuka] = useState(false);

  const daftar = useMemo(
    () =>
      [...((data ?? []) as unknown as PengaduanSaya[])].sort(
        (a, b) => b.diperbaruiPada - a.diperbaruiPada,
      ),
    [data],
  );

  const jumlahAktif = daftar.filter((t) => t.bolehBalas).length;
  const jumlahSelesai = daftar.length - jumlahAktif;
  const jumlahBelumDibaca = daftar.reduce((total, t) => total + t.jumlahBelumDibaca, 0);

  const terfilter = useMemo(
    () =>
      daftar.filter((t) => {
        if (filter === "aktif") return t.bolehBalas;
        if (filter === "selesai") return !t.bolehBalas;
        return true;
      }),
    [daftar, filter],
  );

  const detail = useMemo(
    () => daftar.find((t) => t._id === dipilih) ?? null,
    [daftar, dipilih],
  );

  const detailId = detail?._id;
  const detailBelumDibaca = detail?.jumlahBelumDibaca ?? 0;

  // Tandai dibaca hanya saat tiket benar-benar dibuka, bukan saat daftar
  // dimuat. Dengan begitu membuka tab Bantuan tidak menghapus semua lencana.
  useEffect(() => {
    if (detailId === undefined || detailBelumDibaca <= 0) return;
    void tandaiDibaca({ pengaduanId: detailId }).catch(() => {
      // Penanda baca bersifat tambahan; kegagalan jaringan tidak boleh
      // menghalangi nasabah membaca percakapan yang sudah tampil.
    });
  }, [detailId, detailBelumDibaca, tandaiDibaca]);

  const pilihanFilter: Array<{ value: FilterTiket; label: string; jumlah: number }> = [
    { value: "semua", label: "Semua", jumlah: daftar.length },
    { value: "aktif", label: "Aktif", jumlah: jumlahAktif },
    { value: "selesai", label: "Selesai", jumlah: jumlahSelesai },
  ];

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Bantuan</p>
          <h2 className="mt-1 font-judul text-2xl leading-tight tracking-tight text-navy sm:text-[1.75rem]">
            Kotak tiket
          </h2>
          <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
            Satu tiket untuk satu masalah. Ikuti balasan petugas, tambahkan keterangan, dan lihat
            penyelesaiannya di sini.
          </p>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <Button asChild variant="outline" className="min-h-11 flex-1 sm:flex-none">
            <a
              href={urlChatCs("Halo PINDAI, saya butuh bantuan terkait akun saya.")}
              target="_blank"
              rel="noreferrer"
            >
              <IkonWhatsapp className="mr-2 size-4 text-emerald-700" />
              WhatsApp CS
            </a>
          </Button>
          <Button
            type="button"
            className="min-h-11 flex-1 sm:flex-none"
            onClick={() => setBuatTerbuka(true)}
          >
            <Plus className="mr-2 size-4" aria-hidden />
            Buat tiket
          </Button>
        </div>
      </header>

      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,21rem)_minmax(0,1fr)]">
        <section
          aria-label="Daftar tiket"
          className={cn(
            "min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white",
            detail !== null && "hidden lg:block",
          )}
        >
          <div className="flex items-start justify-between gap-2 border-b border-slate-100 px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-navy">Daftar tiket</p>
              <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                {data === undefined
                  ? "Memuat tiket…"
                  : daftar.length === 0
                    ? "Belum ada tiket"
                    : `${daftar.length} tiket${
                        jumlahBelumDibaca > 0 ? ` · ${jumlahBelumDibaca} balasan baru` : ""
                      }`}
              </p>
            </div>
            <Inbox className="mt-0.5 size-4 shrink-0 text-slate-400" aria-hidden />
          </div>

          <div className="border-b border-slate-100 px-3 py-2.5">
            <div role="group" aria-label="Saring tiket" className="flex flex-wrap gap-1.5">
              {pilihanFilter.map((item) => {
                const aktif = filter === item.value;
                return (
                  <button
                    key={item.value}
                    type="button"
                    aria-pressed={aktif}
                    onClick={() => {
                      setFilter(item.value);
                      setDipilih(null);
                    }}
                    className={cn(
                      "min-h-11 rounded-full border px-3 text-xs font-medium transition-colors",
                      "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                      aktif
                        ? "border-primary/30 bg-primary/10 text-primary"
                        : "border-transparent text-slate-600 hover:bg-slate-100",
                    )}
                  >
                    {item.label} ({item.jumlah})
                  </button>
                );
              })}
            </div>
          </div>

          <div className="p-2 sm:p-3">
            {data === undefined ? (
              <SkeletonDaftarTiket />
            ) : daftar.length === 0 ? (
              <EmptyState
                icon={Inbox}
                title="Belum ada tiket"
                body="Tiket yang Anda buat tampil di sini beserta status, balasan petugas, dan penyelesaiannya."
                action={{
                  label: "Buat tiket pertama",
                  onClick: () => setBuatTerbuka(true),
                }}
              />
            ) : terfilter.length === 0 ? (
              <EmptyState
                icon={Inbox}
                title="Tidak ada tiket di filter ini"
                body="Coba lihat semua tiket untuk menemukan percakapan yang masih aktif atau sudah selesai."
                action={{
                  label: "Lihat semua tiket",
                  onClick: () => setFilter("semua"),
                  variant: "outline",
                }}
              />
            ) : (
              <ul className="space-y-1.5">
                {terfilter.map((tiket) => (
                  <KartuTiket
                    key={tiket._id}
                    tiket={tiket}
                    aktif={dipilih === tiket._id}
                    onPilih={() => setDipilih(tiket._id)}
                  />
                ))}
              </ul>
            )}
          </div>
        </section>

        {detail !== null ? (
          <PanelTiket
            tiket={detail}
            onKembali={() => setDipilih(null)}
            onBuatBaru={() => setBuatTerbuka(true)}
          />
        ) : (
          <aside className="hidden min-w-0 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center lg:flex">
            <span className="flex size-12 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-500">
              <MessageSquare className="size-5" aria-hidden />
            </span>
            <p className="mt-4 text-sm font-semibold text-navy">Pilih satu tiket</p>
            <p className="mt-1.5 max-w-xs text-sm leading-6 text-muted-foreground">
              Percakapan, balasan petugas, dan penyelesaian tiket tampil di sini.
            </p>
            {daftar.length === 0 && (
              <Button
                type="button"
                variant="outline"
                className="mt-5 min-h-11"
                onClick={() => setBuatTerbuka(true)}
              >
                <Plus className="mr-2 size-4" aria-hidden />
                Buat tiket
              </Button>
            )}
          </aside>
        )}
      </div>

      <Sheet open={buatTerbuka} onOpenChange={setBuatTerbuka}>
        <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
          <SheetHeader className="border-b border-slate-100 px-5 pb-4 pt-5 pr-14">
            <SheetTitle className="font-judul text-xl text-navy">Buat tiket bantuan</SheetTitle>
            <SheetDescription className="text-xs leading-5 text-muted-foreground">
              Ceritakan satu masalah per tiket agar petugas dapat menindaklanjutinya dengan jelas.
            </SheetDescription>
          </SheetHeader>
          <FormTiketBaru
            loans={loans}
            onSelesai={(id) => {
              setBuatTerbuka(false);
              setFilter("semua");
              setDipilih(id);
            }}
          />
        </SheetContent>
      </Sheet>
    </div>
  );
}
