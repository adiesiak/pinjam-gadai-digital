import { useMutation, useQuery } from "convex/react";
import {
  ChevronLeft,
  ChevronRight,
  IdCard,
  Loader2,
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
import { AturPlafonDialog, type NasabahPlafon } from "@/components/admin/AturPlafonDialog";
import { DataDiriDialog } from "@/components/admin/DataDiriDialog";
import { DuplikatNasabahPanel } from "@/components/admin/DuplikatNasabahPanel";
import { TombolMasukSebagai } from "@/components/admin/MasukSebagaiDialog";
import { NasabahDetailDialog } from "@/components/admin/NasabahDetailDialog";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { formatRupiah } from "@/lib/money";
import { BARIS_PER_HALAMAN, labelRentang, potongHalaman } from "@/lib/paginasi";
import { clampPlafon, PLAFON_BATAS } from "@/lib/plafon";
import { BUNGA_BATAS, clampPersenBunga } from "@/lib/bunga";

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
 * TATA LETAK: daftar nasabah kini berbentuk TABEL PADAT (satu baris satu orang)
 * dengan kolom [Identitas & Risk Score] · [Progress Plafon] · [Skema Bunga] ·
 * [Aksi Cepat], lalu kartu ringkas di layar kecil. Dua blok isian yang dulu
 * tertanam di setiap kartu dipindahkan ke satu modal "Atur Plafon & Bunga",
 * sehingga menyimpan plafon DAN bunga cukup satu tindakan — dan halaman tidak
 * lagi memanjang karena puluhan kolom isian.
 *
 * Semua aksi lama tetap ada: Profil nasabah, Data diri (termasuk unggah KTP),
 * dan Hapus akun. Yang berubah hanya tempatnya.
 */

/** Ambang aman pemakaian plafon sebelum bar progress berubah peringatan. */
const AMBANG_HAMPIR_PENUH = 0.85;

/** "alfian rifki" → "A" untuk lencana bulat di kolom identitas. */
function inisial(nama: string): string {
  return nama.trim().charAt(0).toUpperCase();
}

/** Nada warna lencana grade risiko — A/B aman, C sedang, D/E/tinggi merah. */
function nadaGrade(grade: string, dinilai: boolean): string {
  if (!dinilai) return "border-slate-200 bg-slate-100 text-slate-600";
  if (grade === "A" || grade === "B") return "border-emerald-200 bg-emerald-100 text-emerald-800";
  if (grade === "C") return "border-amber-200 bg-amber-100 text-amber-800";
  return "border-red-200 bg-red-100 text-red-700";
}

/** Bar progress pemakaian plafon: terpakai / plafon efektif. */
function BarPlafon({ terpakai, efektif }: { terpakai: number; efektif: number }) {
  const rasio = efektif > 0 ? Math.min(1, terpakai / efektif) : 0;
  const persen = Math.round(rasio * 100);
  const nada =
    rasio >= AMBANG_HAMPIR_PENUH ? "bg-red-500" : rasio >= 0.5 ? "bg-amber-500" : "bg-emerald-600";
  return (
    <div className="min-w-0">
      <div
        role="progressbar"
        aria-valuenow={persen}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Pemakaian plafon"
        className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100"
      >
        <div className={`h-full rounded-full ${nada}`} style={{ width: `${persen}%` }} />
      </div>
      <p className="mt-1.5 text-[11px] tabular-nums text-muted-foreground">
        Terpakai <span className="font-medium text-amber-700">{formatRupiah(terpakai)}</span> dari{" "}
        {formatRupiah(efektif)} · {persen}%
      </p>
      <p className="text-[11px] tabular-nums text-emerald-700">
        Sisa limit {formatRupiah(Math.max(0, efektif - terpakai))}
      </p>
    </div>
  );
}

/** Baris ini punya override plafon/bunga sendiri? Dipakai untuk lencana. */
function LencanaOverride({ pribadi, label, nilai }: { pribadi: boolean; label: string; nilai: string }) {
  return pribadi ? (
    <Badge className="border-emerald-200 bg-emerald-100 text-emerald-800">
      {label} khusus: {nilai}
    </Badge>
  ) : (
    <Badge className="border-slate-200 bg-slate-100 text-slate-600">{label} ikut global</Badge>
  );
}

export function PlafonPanel() {
  const [cari, setCari] = useState("");
  const [busyAturId, setBusyAturId] = useState<string | null>(null);
  const [busyHapusId, setBusyHapusId] = useState<string | null>(null);
  /** Nasabah yang plafon & bunganya sedang diatur lewat modal. */
  const [aturTarget, setAturTarget] = useState<NasabahPlafon | null>(null);
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

  /**
   * Satu tindakan untuk dua mutation: hanya sisi yang BENAR-BENAR berubah yang
   * dikirim, sehingga menekan "Simpan Perubahan" tanpa mengubah apa pun tidak
   * menulis jejak audit palsu. Catatan audit dipakai sebagai `alasan` keduanya.
   */
  const simpanAtur = async (nasabah: NasabahPlafon, nilai: { pakaiGlobal: boolean; plafon: number; persenBunga: number; catatan: string }) => {
    const targetPlafon = nilai.pakaiGlobal ? null : clampPlafon(nilai.plafon);
    const targetBunga = nilai.pakaiGlobal ? null : clampPersenBunga(nilai.persenBunga);
    const alasan = nilai.catatan === "" ? undefined : nilai.catatan;
    setBusyAturId(nasabah.userId);
    try {
      if (targetPlafon !== nasabah.plafonPribadi) {
        await setPlafon({ userId: nasabah.userId, plafon: targetPlafon, alasan });
      }
      if (targetBunga !== nasabah.persenBungaPribadi) {
        await setBunga({ userId: nasabah.userId, persenBunga: targetBunga, alasan });
      }
      toast.success(
        nilai.pakaiGlobal
          ? `Plafon & bunga ${nasabah.nama.toUpperCase()} kembali mengikuti Parameter Global System.`
          : `Plafon & bunga ${nasabah.nama.toUpperCase()} diperbarui.`,
      );
      setAturTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menyimpan plafon & bunga.");
    } finally {
      setBusyAturId(null);
    }
  };

  /**
   * Bentuk data dialog dari satu baris tabel. Satu-satunya tempat id baris
   * di-cast ke `Id<"users">` (query mengembalikan id sebagai string) — dan
   * setiap nama kolom tetap diperiksa tipe, bukan disamarkan oleh objek bebas.
   */
  const dataAtur = (r: (typeof data.rows)[number]): NasabahPlafon => ({
    userId: r.userId as Id<"users">,
    nama: r.nama,
    plafonEfektif: r.plafonEfektif,
    plafonTerpakai: r.plafonTerpakai,
    plafonPribadi: r.plafonPribadi,
    persenBungaEfektif: r.persenBungaEfektif,
    persenBungaPribadi: r.persenBungaPribadi,
  });

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
              <MetrikKartu label="Default bunga" nilai={`${String(data.defaultBunga).replace(".", ",")}%`} />
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
                  ditimpa per nasabah lewat tombol <strong className="text-slate-600">Atur</strong>{" "}
                  di kolom aksi cepat.
                </li>
                <li>
                  Setiap pinjaman tunai dengan pokok minimal Rp1 juta yang lunas tepat waktu
                  menambah plafon Rp1 juta, hingga maksimum Rp10 juta.
                </li>
                <li>Status lunas dan tanggal pelunasan mengikuti entri ledger internal PINDAI.</li>
                <li>
                  Pilihan &quot;Ikut Parameter Global System&quot; mengembalikan nasabah ke plafon
                  progresif dan bunga global; kredit barang memakai batas tersendiri.
                </li>
                <li>
                  Bunga khusus hanya mengubah pengajuan yang belum cair — pinjaman yang sudah cair
                  tetap memakai bunganya.
                </li>
                <li>
                  Grade risiko pada kolom identitas dihitung dari model yang sama dengan detail
                  nasabah, jadi angkanya tidak mungkin berbeda antar layar.
                </li>
              </ul>
            </details>
          </div>
        </div>
      </section>

      {/* Alat data lama: temukan & gabungkan nasabah kembar. Hanya muncul saat
          memang ada duplikat, jadi tidak menambah kebisingan layar kerja. */}
      <DuplikatNasabahPanel />

      {/* Pencarian + counter, sejajar agar lebar daftar tidak bergeser. */}
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
        <p className="shrink-0 text-xs tabular-nums text-muted-foreground" aria-live="polite">
          Menampilkan {halamanAktif.baris.length} dari {data.rows.length}
          {data.rows.length >= 100 ? "+" : ""} data
          {cari.trim() !== "" ? " · filter aktif" : ""}
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
        <>
          {/* ── TABEL PADAT (≥ md): satu baris satu nasabah ── */}
          <div className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm md:block">
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">
                Daftar nasabah beserta grade risiko, pemakaian plafon, skema bunga, dan aksi cepatnya
              </caption>
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-left text-[10px] uppercase tracking-[0.12em] text-slate-500">
                  <th scope="col" className="px-4 py-2.5 font-semibold">
                    Identitas &amp; Risk Score
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">
                    Progress bar plafon
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">
                    Skema bunga
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-right font-semibold">
                    Aksi cepat
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {halamanAktif.baris.map((r) => {
                  const sedangHapus = busyHapusId === r.userId;
                  return (
                    <tr key={r.userId} className="align-top transition-colors hover:bg-slate-50/70">
                      {/* Identitas & Risk Score */}
                      <td className="px-4 py-3">
                        <div className="flex min-w-0 items-start gap-2.5">
                          <span
                            aria-hidden="true"
                            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-500"
                          >
                            {inisial(r.nama)}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-navy">
                              {r.nama.toUpperCase()}
                            </p>
                            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                              {r.email ?? "tanpa email"}
                            </p>
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              <Badge className={nadaGrade(r.risikoGrade, r.risikoDinilai)}>
                                {r.risikoDinilai
                                  ? `Risk ${r.risikoGrade} · ${r.risikoSkor}/100`
                                  : "Belum ada riwayat"}
                              </Badge>
                              <Badge
                                className="border-emerald-200 bg-emerald-50 text-emerald-800"
                                title="Skor perilaku bayar internal, dipakai menaikkan plafon otomatis. Bukan skor kredit pihak ketiga."
                              >
                                Perilaku {r.skorPerilaku}/100
                              </Badge>
                              <Badge className="border-slate-200 bg-slate-100 text-slate-600">
                                {r.jumlahPengajuan} pengajuan · {r.pinjamanAktif} aktif
                              </Badge>
                              {!r.adaDataDiri ? (
                                <Badge className="border-amber-200 bg-amber-100 text-amber-800">
                                  data diri kosong
                                </Badge>
                              ) : !r.adaFotoKtp ? (
                                <Badge className="border-amber-200 bg-amber-100 text-amber-800">
                                  tanpa foto KTP
                                </Badge>
                              ) : (
                                <Badge className="border-emerald-200 bg-emerald-100 text-emerald-800">
                                  KTP lengkap
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Progress plafon */}
                      <td className="px-4 py-3">
                        <BarPlafon terpakai={r.plafonTerpakai} efektif={r.plafonEfektif} />
                      </td>

                      {/* Skema bunga */}
                      <td className="px-4 py-3">
                        <p className="text-sm font-semibold tabular-nums text-navy">
                          {String(r.persenBungaEfektif).replace(".", ",")}%
                        </p>
                        <div className="mt-1.5 flex flex-col items-start gap-1">
                          <LencanaOverride
                            pribadi={r.persenBungaPribadi !== null}
                            label="Bunga"
                            nilai={`${String(r.persenBungaPribadi ?? 0).replace(".", ",")}%`}
                          />
                          <LencanaOverride
                            pribadi={r.plafonPribadi !== null}
                            label="Plafon"
                            nilai={formatRupiah(r.plafonPribadi ?? 0)}
                          />
                        </div>
                      </td>

                      {/* Aksi cepat */}
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap justify-end gap-1.5">
                          <Button
                            type="button"
                            size="sm"
                            className="h-8 rounded-lg bg-emerald-700 px-2.5 text-xs text-white hover:bg-emerald-800"
                            onClick={() => setAturTarget(dataAtur(r))}
                          >
                            Atur
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-8 px-2.5 text-xs"
                            title="Profil, KYC, risiko, dan riwayat nasabah"
                            onClick={() => setDetailTarget({ userId: r.userId as Id<"users"> })}
                          >
                            <Users className="mr-1 size-3.5" /> Profil
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-8 px-2.5 text-xs"
                            title={r.adaDataDiri ? "Sunting data diri nasabah" : "Isi data diri nasabah"}
                            onClick={() => setDataDiriTarget({ userId: r.userId as Id<"users">, nama: r.nama })}
                          >
                            <IdCard className="mr-1 size-3.5" />
                            {r.adaDataDiri ? "Data diri" : "Isi data"}
                          </Button>
                          <TombolMasukSebagai
                            targetId={r.userId}
                            nama={r.nama}
                            tujuan="dashboard nasabah"
                          />
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-8 border-destructive/30 px-2.5 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                            disabled={sedangHapus}
                            title="Hapus akun (riwayat keuangan tetap tersimpan)"
                            onClick={() => setHapusTarget({ userId: r.userId as Id<"users">, nama: r.nama })}
                          >
                            {sedangHapus ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="size-3.5" />
                            )}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ── KARTU PADAT (< md): susunan sama, ditumpuk ── */}
          <ul className="space-y-3 md:hidden">
            {halamanAktif.baris.map((r) => {
              const sedangHapus = busyHapusId === r.userId;
              return (
                <li key={r.userId} className="rounded-2xl border border-slate-200 bg-white p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-2.5">
                      <span
                        aria-hidden="true"
                        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-500"
                      >
                        {inisial(r.nama)}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-navy">
                          {r.nama.toUpperCase()}
                        </p>
                        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                          {r.email ?? "tanpa email"}
                        </p>
                      </div>
                    </div>
                    <Badge className={nadaGrade(r.risikoGrade, r.risikoDinilai)}>                                {r.risikoDinilai ? `Risk ${r.risikoGrade} · ${r.risikoSkor}/100` : "Baru"}
                                {" · "}Perilaku {r.skorPerilaku}/100
                    </Badge>
                  </div>

                  <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50/60 p-2.5">
                    <BarPlafon terpakai={r.plafonTerpakai} efektif={r.plafonEfektif} />
                  </div>

                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                    <Badge className="border-sky-200 bg-sky-100 text-sky-700">
                      Bunga efektif {String(r.persenBungaEfektif).replace(".", ",")}%
                    </Badge>
                    <LencanaOverride
                      pribadi={r.persenBungaPribadi !== null}
                      label="Bunga"
                      nilai={`${String(r.persenBungaPribadi ?? 0).replace(".", ",")}%`}
                    />
                    <LencanaOverride
                      pribadi={r.plafonPribadi !== null}
                      label="Plafon"
                      nilai={formatRupiah(r.plafonPribadi ?? 0)}
                    />
                    {!r.adaDataDiri && (
                      <Badge className="border-amber-200 bg-amber-100 text-amber-800">
                        data diri kosong
                      </Badge>
                    )}
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      className="rounded-lg bg-emerald-700 text-white hover:bg-emerald-800"
                      onClick={() => setAturTarget(dataAtur(r))}
                    >
                      Atur plafon &amp; bunga
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setDetailTarget({ userId: r.userId as Id<"users"> })}
                    >
                      <Users className="mr-1 size-3.5" /> Profil
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setDataDiriTarget({ userId: r.userId as Id<"users">, nama: r.nama })}
                    >
                      <IdCard className="mr-1 size-3.5" />
                      {r.adaDataDiri ? "Data diri" : "Isi data"}
                    </Button>
                    <TombolMasukSebagai
                      targetId={r.userId}
                      nama={r.nama}
                      tujuan="dashboard nasabah"
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      disabled={sedangHapus}
                      onClick={() => setHapusTarget({ userId: r.userId as Id<"users">, nama: r.nama })}
                    >
                      {sedangHapus ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="mr-1 size-3.5" />
                      )}
                      Hapus
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
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

      {/* Modal single-action: plafon DAN bunga dalam satu penyimpanan. */}
      {aturTarget !== null && (
        <AturPlafonDialog
          nasabah={aturTarget}
          global={{ plafon: data.default, bunga: data.defaultBunga }}
          busy={busyAturId === aturTarget.userId}
          onClose={() => setAturTarget(null)}
          onSimpan={(nilai) => void simpanAtur(aturTarget, nilai)}
        />
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
