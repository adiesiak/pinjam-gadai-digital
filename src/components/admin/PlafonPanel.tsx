import { useMutation, useQuery } from "convex/react";
import {
  ChevronLeft,
  ChevronRight,
  IdCard,
  Loader2,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { EmptyQueue, MetrikKartu } from "@/components/admin/admin-shared";
import { DataDiriDialog } from "@/components/admin/DataDiriDialog";
import { DuplikatNasabahPanel } from "@/components/admin/DuplikatNasabahPanel";
import { NasabahDetailDialog } from "@/components/admin/NasabahDetailDialog";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { formatRupiah } from "@/lib/money";
import { BARIS_PER_HALAMAN, labelRentang, potongHalaman } from "@/lib/paginasi";
import { clampPlafon, PLAFON_BATAS, PLAFON_LANGKAH } from "@/lib/plafon";
import { BUNGA_BATAS, BUNGA_LANGKAH, clampPersenBunga } from "@/lib/bunga";

/**
 * Panel Plafon Nasabah — naikkan/turunkan batas pinjaman satu orang dan atur
 * bunga khususnya.
 *
 * Panel ini mengatur pinjaman tunai. Setiap pinjaman pokok ≥Rp1 juta yang
 * lunas tepat waktu menaikkan plafon dasar Rp1 juta hingga maksimum Rp10 juta;
 * override admin tetap menang. Kredit barang punya batas tersendiri.
 *
 * Bunga per nasabah mengalahkan default Pengaturan Sistem dan disimpan sebagai
 * snapshot pada tiap pengajuan; pengajuan yang belum cair ikut diperbarui,
 * pinjaman yang sudah cair tidak berubah. Menghapus nasabah hanya menghapus
 * akunnya — pengajuan dan riwayat keuangannya tetap utuh.
 *
 * Susunan kartu per nasabah: identitas + lencana di kepala, dua blok isian
 * (plafon & bunga) yang terpisah, lalu hapus akun di kaki kartu agar keputusan
 * destruktif tidak menempel pada tombol simpan sehari-hari.
 */

/** Ukuran kelas label kecil di dalam blok isian. */
const KELAS_LABEL_BLOK = "text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400";
/** Ukuran kelas catatan bantuan di bawah isian. */
const KELAS_HINT = "text-[10px] leading-4 text-muted-foreground";

export function PlafonPanel() {
  const [cari, setCari] = useState("");
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [draftBunga, setDraftBunga] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [busyBungaId, setBusyBungaId] = useState<string | null>(null);
  const [busyHapusId, setBusyHapusId] = useState<string | null>(null);
  /** Nasabah yang sedang dikonfirmasi penghapusannya lewat dialog. */
  const [hapusTarget, setHapusTarget] = useState<{ userId: Id<"users">; nama: string } | null>(null);
  /** Nasabah yang data dirinya sedang diisi/disunting lewat dialog. */
  const [dataDiriTarget, setDataDiriTarget] = useState<{ userId: Id<"users">; nama: string } | null>(null);
  /** Nasabah yang profil lengkapnya (KYC, plafon, riwayat) sedang dibuka. */
  const [detailTarget, setDetailTarget] = useState<{ userId: Id<"users"> } | null>(null);
  /** Halaman daftar nasabah yang sedang dilihat (10 baris per halaman). */
  const [halaman, setHalaman] = useState(0);
  const data = useQuery(api.admin.daftarPlafonPeminjam, { cari: cari || undefined });
  const setPlafon = useMutation(api.admin.setPlafonPeminjam);
  const setBunga = useMutation(api.admin.setBungaPeminjam);
  const hapusNasabah = useMutation(api.admin.hapusNasabah);

  if (data === undefined) {
    return (
      <p className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-10 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Memuat plafon nasabah…
      </p>
    );
  }

  const simpan = async (userId: Id<"users">, nilai: string, resetKeDefault: boolean) => {
    setBusyId(userId);
    try {
      const hasil = await setPlafon({
        userId,
        plafon: resetKeDefault ? null : clampPlafon(Number(nilai.replace(/\D/g, "")) || 0),
        alasan: undefined,
      });
      toast.success(`Plafon internal diperbarui: ${formatRupiah(hasil.plafonEfektif)}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menyimpan plafon.");
    } finally {
      setBusyId(null);
    }
  };

  const simpanBunga = async (
    userId: Id<"users">,
    nilai: string,
    resetKeDefault: boolean,
  ) => {
    setBusyBungaId(userId);
    try {
      const hasil = await setBunga({
        userId,
        persenBunga: resetKeDefault ? null : clampPersenBunga(parsePersen(nilai)),
        alasan: undefined,
      });
      toast.success(
        `Bunga nasabah diperbarui: ${formatPersen(hasil.persenBunga)}` +
          (hasil.pengajuanDiperbarui > 0
            ? ` · ${hasil.pengajuanDiperbarui} pengajuan berjalan ikut disesuaikan`
            : ""),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menyimpan bunga.");
    } finally {
      setBusyBungaId(null);
    }
  };

  // Paginasi 10 baris/halaman. Halaman dijepit di dalam `potongHalaman` (bukan
  // di-reset lewat useEffect) supaya pencarian yang mempersingkat daftar tidak
  // pernah menampilkan halaman kosong — sekaligus menghindari aturan
  // `react-hooks` yang melarang setState di dalam effect.
  const halamanAktif = potongHalaman(data.rows, halaman, BARIS_PER_HALAMAN);

  const hapus = async () => {
    if (hapusTarget === null) return;
    // Catatan alasan pengahapusan tidak diminta lagi — penghapusan tetap
    // tercatat di Audit Trail (siapa, kapan, akun mana).
    setBusyHapusId(hapusTarget.userId);
    try {
      await hapusNasabah({ userId: hapusTarget.userId });
      toast.success(`Akun ${hapusTarget.nama.toUpperCase()} dihapus.`);
      setHapusTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menghapus akun.");
    } finally {
      setBusyHapusId(null);
    }
  };

  return (
    <div className="animate-masuk space-y-4 sm:space-y-5">
      {/* Kebijakan sekilas: empat angka kunci jadi kartu metrik, aturan
          lengkapnya dilipat agar tidak menutupi daftar nasabah. */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <SlidersHorizontal className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-navy">Plafon &amp; bunga nasabah</h2>
            <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
              Override admin menang atas default global. Bunga khusus disimpan sebagai snapshot pada
              tiap pengajuan.
            </p>
            <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <MetrikKartu label="Default plafon" nilai={formatRupiah(data.default)} />
              <MetrikKartu label="Default bunga" nilai={formatPersen(data.defaultBunga)} />
              <MetrikKartu
                label="Rentang plafon"
                nilai={`${formatRupiah(PLAFON_BATAS.min)} – ${formatRupiah(PLAFON_BATAS.maks)}`}
              />
              <MetrikKartu label="Rentang bunga" nilai={`${BUNGA_BATAS.min}–${BUNGA_BATAS.maks}%`} />
            </dl>
            <details className="mt-3 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2">
              <summary className="cursor-pointer text-xs font-medium text-slate-600 hover:text-navy">
                Aturan plafon &amp; bunga
              </summary>
              <ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-5 text-muted-foreground">
                <li>
                  Default plafon awal dan bunga dasar diambil dari Pengaturan Sistem; keduanya bisa
                  ditimpa per nasabah di kolom bawah.
                </li>
                <li>
                  Setiap pinjaman tunai dengan pokok minimal Rp1 juta yang lunas tepat waktu
                  menambah plafon Rp1 juta, hingga maksimum Rp10 juta.
                </li>
                <li>Status lunas dan tanggal pelunasan mengikuti entri ledger internal PINDAI.</li>
                <li>
                  Tombol reset mengembalikan nasabah ke plafon progresif atau bunga global; kredit
                  barang memakai batas tersendiri.
                </li>
                <li>
                  Bunga khusus hanya mengubah pengajuan yang belum cair — pinjaman yang sudah cair
                  tetap memakai bunganya.
                </li>
              </ul>
            </details>
          </div>
        </div>
      </section>

      {/* Alat data lama: temukan & gabungkan nasabah kembar. Hanya muncul saat
          memang ada duplikat, jadi tidak menambah kebisingan layar kerja. */}
      <DuplikatNasabahPanel />

      {/* Pencarian + jumlah hasil, sejajar agar lebar daftar tidak bergeser. */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9 pr-10"
            aria-label="Cari nasabah berdasarkan nama atau email"
            placeholder="Cari nama atau email…"
            value={cari}
            onChange={(e) => {
              setCari(e.target.value);
              // Kembali ke halaman pertama tiap kali kata kunci berubah.
              setHalaman(0);
            }}
          />
          {cari !== "" && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Bersihkan pencarian"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground"
              onClick={() => {
                setCari("");
                setHalaman(0);
              }}
            >
              <X className="size-4" />
            </Button>
          )}
        </div>
        <p className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {data.rows.length}
          {data.rows.length >= 100 ? "+" : ""} nasabah
        </p>
      </div>

      {data.rows.length === 0 ? (
        cari.trim() === "" ? (
          <EmptyQueue
            icon={Users}
            title="Belum ada Peminjam"
            deskripsi="Nasabah muncul di sini setelah mengirim pengajuan pinjaman atau kredit barang."
            poin={[
              "Atur plafon khusus agar batas pinjaman tidak mengikuti default global.",
              "Tetapkan bunga khusus per nasabah dan pantau riwayat pelunasannya.",
            ]}
          />
        ) : (
          <EmptyQueue
            icon={Search}
            title="Tidak ada nasabah yang cocok"
            deskripsi={`Tidak ada nama atau email yang mengandung “${cari.trim()}”. Coba kata kunci lain.`}
          />
        )
      ) : (
        <ul className="space-y-3">
          {halamanAktif.baris.map((r) => {
            const nilai = draft[r.userId] ?? formatAngka(r.plafonEfektif);
            const berubah = Number(nilai.replace(/\D/g, "")) !== r.plafonEfektif;
            const nilaiBunga = draftBunga[r.userId] ?? formatPersenAngka(r.persenBungaEfektif);
            const bungaBerubah = parsePersen(nilaiBunga) !== r.persenBungaEfektif;
            const sedangSimpanPlafon = busyId === r.userId;
            const sedangSimpanBunga = busyBungaId === r.userId;
            const sedangHapus = busyHapusId === r.userId;
            return (
              <li
                key={r.userId}
                className="overflow-hidden rounded-2xl border border-slate-200 bg-white"
              >
                {/* Kepala kartu: siapa, seberapa aktif, dan status override-nya. */}
                <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-4 py-3.5 sm:px-5">
                  <div className="flex min-w-0 items-start gap-3">
                    <span
                      aria-hidden="true"
                      className="flex size-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-500"
                    >
                      {inisial(r.nama)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-navy">
                        {r.nama.toUpperCase()}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {r.email ?? "tanpa email"}
                      </p>
                      <p className="mt-1 text-[11px] tabular-nums text-muted-foreground">
                        {r.jumlahPengajuan} pengajuan aplikasi · {r.pinjamanAktif} status aktif di
                        ledger
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {r.plafonPribadi === null ? (
                      r.jumlahPelunasanTepatWaktu === 0 ? (
                        <Badge className="border-slate-200 bg-slate-100 text-slate-600">
                          plafon ikut default global
                        </Badge>
                      ) : (
                        <Badge className="border-emerald-200 bg-emerald-100 text-emerald-700">
                          plafon progresif · {r.jumlahPelunasanTepatWaktu} lunas tepat waktu
                        </Badge>
                      )
                    ) : (
                      <Badge className="border-emerald-200 bg-emerald-100 text-emerald-700">
                        plafon khusus: {formatRupiah(r.plafonPribadi)}
                      </Badge>
                    )}
                    {r.persenBungaPribadi === null ? (
                      <Badge className="border-slate-200 bg-slate-100 text-slate-600">
                        bunga ikut default global
                      </Badge>
                    ) : (
                      <Badge className="border-amber-200 bg-amber-100 text-amber-700">
                        bunga khusus: {formatPersen(r.persenBungaPribadi)}
                      </Badge>
                    )}
                    <Badge className="border-sky-200 bg-sky-100 text-sky-700">
                      tersedia {formatRupiah(r.plafonTersedia)}
                      {r.plafonTerpakai > 0 ? ` · terpakai ${formatRupiah(r.plafonTerpakai)}` : ""}
                    </Badge>
                    {!r.adaDataDiri ? (
                      <Badge className="border-slate-200 bg-slate-100 text-slate-600">
                        data diri belum diisi
                      </Badge>
                    ) : r.adaFotoKtp ? (
                      <Badge className="border-emerald-200 bg-emerald-100 text-emerald-700">
                        data diri &amp; KTP lengkap
                      </Badge>
                    ) : (
                      <Badge className="border-amber-200 bg-amber-100 text-amber-800">
                        data diri tanpa foto KTP
                      </Badge>
                    )}
                  </div>
                </header>

                {/* Badan kartu: dua blok isian sejajar, masing-masing punya
                    tombol simpan dan resetnya sendiri. */}
                <div className="grid gap-3 px-4 py-4 sm:grid-cols-2 sm:px-5">
                  <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <Label htmlFor={`plafon-${r.userId}`} className={KELAS_LABEL_BLOK}>
                        Plafon efektif
                      </Label>
                      {berubah && (
                        <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                          belum disimpan
                        </span>
                      )}
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <div className="relative min-w-0 flex-1">
                        <span
                          aria-hidden="true"
                          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400"
                        >
                          Rp
                        </span>
                        <Input
                          id={`plafon-${r.userId}`}
                          inputMode="numeric"
                          className="pl-8 tabular-nums"
                          value={nilai}
                          onChange={(e) =>
                            setDraft((p) => ({
                              ...p,
                              [r.userId]: e.target.value.replace(/\D/g, ""),
                            }))
                          }
                          onBlur={() => {
                            const angka = Number(nilai.replace(/\D/g, "")) || 0;
                            setDraft((p) => ({
                              ...p,
                              [r.userId]: formatAngka(clampPlafon(angka)),
                            }));
                          }}
                          disabled={sedangSimpanPlafon}
                        />
                      </div>
                      <Button
                        size="sm"
                        className="h-10 px-3"
                        disabled={!berubah || sedangSimpanPlafon}
                        onClick={() => void simpan(r.userId as Id<"users">, nilai, false)}
                      >
                        {sedangSimpanPlafon ? <Loader2 className="size-4 animate-spin" /> : "Simpan"}
                      </Button>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <p className={KELAS_HINT}>Kelipatan {formatRupiah(PLAFON_LANGKAH)}</p>
                      {r.plafonPribadi !== null && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-[11px] font-medium text-primary hover:bg-primary/10 hover:text-primary"
                          disabled={sedangSimpanPlafon}
                          onClick={() => void simpan(r.userId as Id<"users">, "", true)}
                        >
                          <RotateCcw className="size-3.5" />
                          {r.jumlahPelunasanTepatWaktu === 0
                            ? "Ke default global"
                            : "Ke plafon progresif"}
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <Label htmlFor={`bunga-${r.userId}`} className={KELAS_LABEL_BLOK}>
                        Bunga efektif
                      </Label>
                      {bungaBerubah && (
                        <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                          belum disimpan
                        </span>
                      )}
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <div className="relative min-w-0 flex-1">
                        <Input
                          id={`bunga-${r.userId}`}
                          inputMode="decimal"
                          className="pr-8 tabular-nums"
                          value={nilaiBunga}
                          onChange={(e) =>
                            setDraftBunga((p) => ({
                              ...p,
                              [r.userId]: e.target.value.replace(/[^\d.,]/g, ""),
                            }))
                          }
                          onBlur={() =>
                            setDraftBunga((p) => ({
                              ...p,
                              [r.userId]: formatPersenAngka(clampPersenBunga(parsePersen(nilaiBunga))),
                            }))
                          }
                          disabled={sedangSimpanBunga}
                        />
                        <span
                          aria-hidden="true"
                          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400"
                        >
                          %
                        </span>
                      </div>
                      <Button
                        size="sm"
                        className="h-10 px-3"
                        disabled={!bungaBerubah || sedangSimpanBunga}
                        onClick={() => void simpanBunga(r.userId as Id<"users">, nilaiBunga, false)}
                      >
                        {sedangSimpanBunga ? <Loader2 className="size-4 animate-spin" /> : "Simpan"}
                      </Button>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <p className={KELAS_HINT}>Langkah {formatPersen(BUNGA_LANGKAH)}</p>
                      {r.persenBungaPribadi !== null && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-[11px] font-medium text-primary hover:bg-primary/10 hover:text-primary"
                          disabled={sedangSimpanBunga}
                          onClick={() => void simpanBunga(r.userId as Id<"users">, "", true)}
                        >
                          <RotateCcw className="size-3.5" />
                          Ke bunga global
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Kaki kartu: satu-satunya aksi destruktif, dijauhkan dari
                    tombol simpan dan dijelaskan dampaknya. */}
                <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/60 px-4 py-2.5 sm:px-5">
                  <p className={KELAS_HINT}>
                    Menghapus hanya menghapus akun — pengajuan dan riwayat keuangannya tetap
                    tersimpan. Data diri diisi admin dan dapat disunting kapan saja.
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setDetailTarget({ userId: r.userId as Id<"users"> })}
                    >
                      <Users className="mr-1 size-4" />
                      <span className="ml-1">Profil nasabah</span>
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setDataDiriTarget({ userId: r.userId as Id<"users">, nama: r.nama })
                      }
                    >
                      <IdCard className="size-4" />
                      <span className="ml-1">
                        {r.adaDataDiri ? "Sunting data diri" : "Isi data diri"}
                      </span>
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      disabled={sedangHapus}
                      onClick={() => {
                        setHapusTarget({ userId: r.userId as Id<"users">, nama: r.nama });
                      }}
                    >
                      {sedangHapus ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Trash2 className="size-4" />
                      )}
                      <span className="ml-1">Hapus akun</span>
                    </Button>
                  </div>
                </footer>
              </li>
            );
          })}
        </ul>
      )}

      {/* Navigasi halaman: 10 nasabah per halaman. Label rentang membuat
          "18 nasabah" di atas terbaca jelas sebagai total, bukan jumlah baris. */}
      {data.rows.length > 0 && (
        <nav
          aria-label="Navigasi halaman daftar nasabah"
          className="flex flex-wrap items-center justify-between gap-3"
        >
          <p className="text-xs tabular-nums text-muted-foreground">
            {labelRentang(halamanAktif, data.rows.length)} nasabah
          </p>
          {halamanAktif.totalHalaman > 1 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 gap-1 px-2.5"
                disabled={halamanAktif.halaman === 0}
                onClick={() => setHalaman(halamanAktif.halaman - 1)}
              >
                <ChevronLeft className="size-3.5" />
                Sebelumnya
              </Button>
              {Array.from({ length: halamanAktif.totalHalaman }, (_, i) => i).map((i) => (
                <button
                  key={i}
                  type="button"
                  aria-label={`Halaman ${i + 1}`}
                  aria-current={i === halamanAktif.halaman ? "page" : undefined}
                  onClick={() => setHalaman(i)}
                  className={`flex size-8 items-center justify-center rounded-lg border text-xs font-semibold tabular-nums transition-colors ${
                    i === halamanAktif.halaman
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-slate-200 bg-white text-slate-600 hover:border-primary hover:text-primary"
                  }`}
                >
                  {i + 1}
                </button>
              ))}
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 gap-1 px-2.5"
                disabled={halamanAktif.halaman >= halamanAktif.totalHalaman - 1}
                onClick={() => setHalaman(halamanAktif.halaman + 1)}
              >
                Berikutnya
                <ChevronRight className="size-3.5" />
              </Button>
            </div>
          )}
        </nav>
      )}

      {/* Editor data diri per nasabah (termasuk unggah KTP). */}
      {dataDiriTarget !== null && (
        <DataDiriDialog
          userId={dataDiriTarget.userId}
          onClose={() => setDataDiriTarget(null)}
        />
      )}

      {/* Detail master nasabah: KYC, plafon, profil risiko, dan riwayat. */}
      {detailTarget !== null && (
        <NasabahDetailDialog
          userId={detailTarget.userId}
          onClose={() => setDetailTarget(null)}
        />
      )}

      {/* Konfirmasi hapus diketik di dialog, bukan di `window.prompt` yang
          memblokir layar. Kolom alasan tidak lagi diminta. */}
      <AlertDialog
        open={hapusTarget !== null}
        onOpenChange={(terbuka) => {
          if (!terbuka) setHapusTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus akun nasabah?</AlertDialogTitle>
            <AlertDialogDescription>
              Akun <strong className="text-navy">{hapusTarget?.nama.toUpperCase()}</strong> akan
              dihapus. Pengajuan dan riwayat keuangannya TETAP tersimpan di ledger internal — hanya
              akunnya yang hilang.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busyHapusId !== null}>Batal</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={busyHapusId !== null}
              onClick={() => void hapus()}
            >
              {busyHapusId !== null ? <Loader2 className="size-4 animate-spin" /> : null}
              Hapus akun
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** "12,5" / "12.5" → 12.5; kosong / tidak valid → 0. */
function parsePersen(nilai: string): number {
  const bersih = nilai.replace(",", ".").replace(/[^\d.]/g, "");
  const angka = Number(bersih);
  return Number.isFinite(angka) ? angka : 0;
}

/** 30 → "30%", 12.5 → "12,5%". */
function formatPersen(nilai: number): string {
  return `${String(nilai).replace(".", ",")}%`;
}

/** 12.5 → "12,5" (tanpa tanda persen) untuk nilai di dalam kolom isian. */
function formatPersenAngka(nilai: number): string {
  return String(nilai).replace(".", ",");
}

/** 1000000 → "1.000.000" — pemisah ribuan saat kolom isian tidak difokuskan. */
function formatAngka(nilai: number): string {
  return new Intl.NumberFormat("id-ID").format(nilai);
}

/** "alfian rifki" → "A" untuk lencana bulat di kepala kartu. */
function inisial(nama: string): string {
  return nama.trim().charAt(0).toUpperCase();
}
