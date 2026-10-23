import { useMutation, useQuery } from "convex/react";
import {
  Bell,
  BellOff,
  ChevronLeft,
  ChevronRight,
  IdCard,
  Loader2,
  MoreHorizontal,
  Search,
  SlidersHorizontal,
  Trash2,
  UserRoundCog,
  Users,
  X,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { useNilaiTertunda } from "@/hooks/use-validasi-tertunda";
import { AturPlafonDialog, type NasabahPlafon } from "@/components/admin/AturPlafonDialog";
import { DataDiriDialog } from "@/components/admin/DataDiriDialog";
import { DuplikatNasabahPanel } from "@/components/admin/DuplikatNasabahPanel";
import { TombolMasukSebagai } from "@/components/admin/MasukSebagaiDialog";
import { NasabahDetailDialog } from "@/components/admin/NasabahDetailDialog";
import { DialogMatikanTagihan } from "@/components/admin/PengaturanNotifikasiNasabah";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { formatRupiah } from "@/lib/money";
import { sakelarTagihan } from "@/lib/preferensiNotifikasi";
import { BARIS_PER_HALAMAN, labelRentang, potongHalaman } from "@/lib/paginasi";
import {
  clampPlafon,
  LABEL_SUMBER_PLAFON,
  PLAFON_BATAS,
  sumberPlafon,
} from "@/lib/plafon";
import { cn } from "@/lib/utils";

/**
 * Panel Plafon Nasabah — naikkan/turunkan batas pinjaman satu orang.
 *
 * Panel ini mengatur pinjaman tunai. Nasabah baru dibatasi Rp500.000; satu
 * pinjaman yang lunas tepat waktu membuka plafon Rp1.000.000. Override admin
 * dapat menetapkan angka lain, dan kredit barang punya batas tersendiri.
 *
 * Bunga tidak diatur di panel ini: tarif pinjaman mengikuti tabel tenor website
 * (harian 7/14/28 hari sesuai nominal, bulanan mengikuti tenor), dan disimpan
 * sebagai snapshot pada tiap pengajuan. Menghapus nasabah hanya menghapus
 * akunnya — pengajuan dan riwayat keuangannya tetap utuh.
 *
 * TATA LETAK: daftar nasabah berbentuk TABEL PADAT (satu baris satu orang)
 * dengan kolom [Identitas & Risk Score] · [Progress Plafon] · [Aksi Cepat],
 * lalu kartu ringkas di layar kecil. Isian plafon dipindahkan ke satu modal
 * "Atur Plafon" supaya halaman tidak memanjang karena puluhan kolom.
 *
 * Semua aksi lama tetap ada: Profil nasabah, Data diri (termasuk unggah KTP),
 * dan Hapus akun. Yang berubah hanya tempatnya.
 *
 * AKSI: seluruh aksi satu baris hidup di menu "Kelola" (`MenuKelolaNasabah`):
 * atur plafon, profil, data diri, masuk sebagai, sakelar tagihan, dan hapus.
 * Di layar 1366 deret tombol lama mendorong kolom plafon sampai terpotong.
 *
 * NOTIFIKASI TAGIHAN: menu itu memuat "Matikan/Nyalakan tagihan" yang
 * menggerakkan kedua kanal (WhatsApp & email) sekaligus. Aksinya memakai
 * mutation yang sama dengan kartu profil (`simpanPreferensiNasabah`), sehingga
 * audit trail dan aturan `global && nasabah` tidak punya jalur kedua.
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

/** Baris ini punya override plafon sendiri? Dipakai untuk lencana. */
function LencanaOverride({ pribadi, label, nilai }: { pribadi: boolean; label: string; nilai: string }) {
  return pribadi ? (
    <Badge className="border-emerald-200 bg-emerald-100 text-emerald-800">
      {label} khusus: {nilai}
    </Badge>
  ) : (
    <Badge className="border-slate-200 bg-slate-100 text-slate-600">{label} ikut global</Badge>
  );
}

/**
 * Lencana sumber angka plafon: override admin menang, lalu progresif, lalu
 * default global. Angkanya datang dari server — panel ini tidak menghitung
 * ulang plafon, hanya menamai asalnya supaya admin tahu kenapa batasnya segitu.
 */
function LencanaSumber({ pribadi, efektif, global }: { pribadi: number | null; efektif: number; global: number }) {
  const sumber = sumberPlafon(pribadi, efektif, global);
  const kelas =
    sumber === "override"
      ? "border-amber-300 bg-amber-50 text-amber-800"
      : sumber === "progresif"
        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
        : "border-slate-200 bg-slate-50 text-slate-600";
  return (
    <Badge className={kelas} title="Urutan: override admin › plafon progresif › default global">
      {LABEL_SUMBER_PLAFON[sumber]}
    </Badge>
  );
}

/**
 * Satu menu aksi per nasabah.
 *
 * Sebelumnya tiap baris menampilkan lima tombol berdampingan (Atur, Profil,
 * Data diri, tagihan, Masuk sebagai, hapus). Di layar 1366 deret itu berdesakan
 * dan mendorong kolom plafon sampai terpotong. Isinya tidak dikurangi, hanya
 * dipindahkan ke satu pemicu dengan urutan kerja yang sama.
 */
function MenuKelolaNasabah({
  nama,
  adaDataDiri,
  notifAktif,
  sibukNotif,
  sibukHapus,
  onAtur,
  onProfil,
  onDataDiri,
  onMasukSebagai,
  onTagihan,
  onHapus,
  className,
}: {
  nama: string;
  adaDataDiri: boolean;
  notifAktif: boolean;
  sibukNotif: boolean;
  sibukHapus: boolean;
  onAtur: () => void;
  onProfil: () => void;
  onDataDiri: () => void;
  onMasukSebagai: () => void;
  onTagihan: () => void;
  onHapus: () => void;
  className?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="sm"
          className={cn(
            "h-9 gap-1.5 rounded-lg bg-emerald-700 px-2.5 text-xs text-white hover:bg-emerald-800",
            className,
          )}
          aria-label={`Kelola ${nama}`}
        >
          <MoreHorizontal className="size-4" aria-hidden="true" />
          Kelola
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuItem onSelect={onAtur} className="gap-2 py-2">
          <SlidersHorizontal className="size-4 text-muted-foreground" aria-hidden="true" />
          Atur plafon dan bunga
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onProfil} className="gap-2 py-2">
          <Users className="size-4 text-muted-foreground" aria-hidden="true" />
          Profil nasabah
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onDataDiri} className="gap-2 py-2">
          <IdCard className="size-4 text-muted-foreground" aria-hidden="true" />
          {adaDataDiri ? "Sunting data diri" : "Isi data diri"}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onMasukSebagai} className="gap-2 py-2">
          <UserRoundCog className="size-4 text-muted-foreground" aria-hidden="true" />
          Masuk sebagai
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={onTagihan}
          disabled={sibukNotif}
          className="gap-2 py-2"
        >
          {sibukNotif ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : notifAktif ? (
            <BellOff className="size-4 text-muted-foreground" aria-hidden="true" />
          ) : (
            <Bell className="size-4 text-muted-foreground" aria-hidden="true" />
          )}
          {notifAktif ? "Matikan tagihan" : "Nyalakan tagihan"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onSelect={onHapus}
          disabled={sibukHapus}
          className="gap-2 py-2"
        >
          {sibukHapus ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Trash2 className="size-4" aria-hidden="true" />
          )}
          Hapus akun
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function PlafonPanel() {
  const [cari, setCari] = useState("");
  const [busyAturId, setBusyAturId] = useState<string | null>(null);
  const [busyHapusId, setBusyHapusId] = useState<string | null>(null);
  /** Nasabah yang pengingat tagihannya sedang dimatikan/dinyalakan. */
  const [busyNotifId, setBusyNotifId] = useState<string | null>(null);
  /** Nasabah yang plafon & bunganya sedang diatur lewat modal. */
  const [aturTarget, setAturTarget] = useState<NasabahPlafon | null>(null);
  /** Nasabah yang pengingat tagihannya sedang dikonfirmasi untuk dimatikan. */
  const [matikanNotifTarget, setMatikanNotifTarget] = useState<{
    userId: Id<"users">;
    nama: string;
  } | null>(null);
  /** Nasabah yang sedang dikonfirmasi penghapusannya lewat dialog. */
  const [hapusTarget, setHapusTarget] = useState<{ userId: Id<"users">; nama: string } | null>(null);
  /** Nasabah yang data dirinya sedang diisi/disunting lewat dialog. */
  const [dataDiriTarget, setDataDiriTarget] = useState<{ userId: Id<"users">; nama: string } | null>(null);
  /** Nasabah yang profil lengkapnya (KYC, plafon, riwayat) sedang dibuka. */
  const [detailTarget, setDetailTarget] = useState<{ userId: Id<"users"> } | null>(null);
  /** Nasabah yang dialog "Masuk sebagai"-nya dibuka dari menu Kelola. */
  const [masukTarget, setMasukTarget] = useState<{ userId: Id<"users">; nama: string } | null>(null);
  /** Halaman daftar nasabah yang sedang dilihat (10 baris per halaman). */
  const [halaman, setHalaman] = useState(0);
  // Kata kunci dikirim setelah pengguna berhenti mengetik. Tanpa jeda ini setiap
  // huruf membuat langganan query baru untuk daftar nasabah yang berat, dan
  // daftar sempat kosong sebelum hasilnya tiba.
  const cariTertunda = useNilaiTertunda(cari, 250);
  const data = useQuery(api.admin.daftarPlafonPeminjam, {
    cari: cariTertunda.trim() === "" ? undefined : cariTertunda.trim(),
  });
  const setPlafon = useMutation(api.admin.setPlafonPeminjam);
  const hapusNasabah = useMutation(api.admin.hapusNasabah);
  const simpanNotif = useMutation(api.notifikasiNasabah.simpanPreferensiNasabah);

  /** Satu baris daftar — bentuknya milik query, bukan tipe salinan di UI. */
  type BarisPlafon = NonNullable<typeof data>["rows"][number];
  // Saat kata kunci berubah, `useQuery` sempat mengembalikan `undefined`. Baris
  // kosong membuat pencarian dan kartu di atas TETAP terpasang, jadi kolom
  // pencarian tidak kehilangan fokus dan halaman tidak terlihat dimuat ulang.
  const rows = data?.rows ?? [];
  /**
   * Satu tindakan untuk dua mutation: hanya sisi yang BENAR-BENAR berubah yang
   * dikirim, sehingga menekan "Simpan Perubahan" tanpa mengubah apa pun tidak
   * menulis jejak audit palsu. Catatan audit dipakai sebagai `alasan` keduanya.
   */
  const simpanAtur = async (nasabah: NasabahPlafon, nilai: { pakaiGlobal: boolean; plafon: number; catatan: string }) => {
    const targetPlafon = nilai.pakaiGlobal ? null : clampPlafon(nilai.plafon);
    const alasan = nilai.catatan === "" ? undefined : nilai.catatan;
    setBusyAturId(nasabah.userId);
    try {
      if (targetPlafon !== nasabah.plafonPribadi) {
        await setPlafon({ userId: nasabah.userId, plafon: targetPlafon, alasan });
      }
      toast.success(
        nilai.pakaiGlobal
          ? `Plafon ${nasabah.nama.toUpperCase()} kembali mengikuti Parameter Global System.`
          : `Plafon ${nasabah.nama.toUpperCase()} diperbarui.`,
      );
      setAturTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menyimpan plafon.");
    } finally {
      setBusyAturId(null);
    }
  };

  /**
   * Bentuk data dialog dari satu baris tabel. Satu-satunya tempat id baris
   * di-cast ke `Id<"users">` (query mengembalikan id sebagai string) — dan
   * setiap nama kolom tetap diperiksa tipe, bukan disamarkan oleh objek bebas.
   */
  const dataAtur = (r: BarisPlafon): NasabahPlafon => ({
    userId: r.userId as Id<"users">,
    nama: r.nama,
    plafonEfektif: r.plafonEfektif,
    plafonTerpakai: r.plafonTerpakai,
    plafonPribadi: r.plafonPribadi,
  });

  // Paginasi 10 baris/halaman. Halaman dijepit di dalam `potongHalaman` (bukan
  // di-reset lewat useEffect) supaya pencarian yang mempersingkat daftar tidak
  // pernah menampilkan halaman kosong — sekaligus menghindari aturan
  // `react-hooks` yang melarang setState di dalam effect.
  const halamanAktif = potongHalaman(rows, halaman, BARIS_PER_HALAMAN);

  /**
   * Menyalakan pengingat berlaku langsung (aman & reversibel). Mematikannya
   * lewat dialog konfirmasi dulu: satu salah klik berarti nasabah berhenti
   * diingatkan dan tunggakan baru ketahuan belakangan.
   */
  const mintaUbahNotifikasi = (r: BarisPlafon) => {
    if (r.notifTagihanAktif) {
      setMatikanNotifTarget({ userId: r.userId as Id<"users">, nama: r.nama });
      return;
    }
    void ubahNotifikasi({ userId: r.userId as Id<"users">, nama: r.nama }, true);
  };

  /**
   * Satu tindakan untuk KEDUA kanal. Ditangani mutation yang sama dengan kartu
   * profil, jadi jejak audit dan aturan "global && nasabah" tidak punya jalur
   * kedua. Target dipisah dari baris tabel supaya dialog konfirmasi tetap bisa
   * menyelesaikan aksinya walau daftar sudah berubah di belakang layar.
   */
  const ubahNotifikasi = async (
    target: { userId: Id<"users">; nama: string },
    aktifBaru: boolean,
  ) => {
    setBusyNotifId(target.userId);
    try {
      await simpanNotif({
        userId: target.userId,
        ...sakelarTagihan(aktifBaru),
      });
      toast.success(
        aktifBaru
          ? `Pengingat tagihan ${target.nama.toUpperCase()} dinyalakan (WhatsApp & email).`
          : `Pengingat tagihan ${target.nama.toUpperCase()} dimatikan (WhatsApp & email).`,
      );
      setMatikanNotifTarget(null);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Gagal mengubah pengingat tagihan.",
      );
    } finally {
      setBusyNotifId(null);
    }
  };

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
            <h2 className="text-sm font-semibold text-navy">Plafon nasabah</h2>
            <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
              Plafon efektif dibaca berurutan: <strong className="text-slate-600">override admin</strong> ›{" "}
              <strong className="text-slate-600">plafon progresif</strong> hasil pelunasan tepat waktu ›{" "}
              <strong className="text-slate-600">default global</strong>. Bunga pinjaman mengikuti tabel tenor website
              dan tidak bisa ditimpa dari sini. Pengingat tagihan bisa dimatikan per nasabah lewat
              menu <strong className="text-slate-600">Kelola</strong> di kolom aksi cepat.
            </p>
            <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              <MetrikKartu
                label="Default plafon"
                nilai={data === undefined ? "…" : formatRupiah(data.default)}
              />
              <MetrikKartu
                label="Rentang plafon"
                nilai={`${formatRupiah(PLAFON_BATAS.min)} – ${formatRupiah(PLAFON_BATAS.maks)}`}
              />
              <MetrikKartu label="Bunga tenor" nilai="26–40% harian" />
            </dl>
            <details className="mt-3 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2">
              <summary className="cursor-pointer text-xs font-medium text-slate-600 hover:text-navy">
                Aturan plafon &amp; bunga
              </summary>
              <ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-5 text-muted-foreground">
                <li>
                  Default plafon awal diambil dari Pengaturan Sistem dan bisa ditimpa per nasabah
                  lewat menu <strong className="text-slate-600">Kelola</strong> di kolom aksi cepat.
                </li>
                <li>
                  Nasabah baru dibatasi Rp500.000. Satu pinjaman tunai yang lunas tepat waktu
                  membuka plafon Rp1.000.000.
                </li>
                <li>Status lunas dan tanggal pelunasan mengikuti entri ledger internal PINDAI.</li>
                <li>
                  Pilihan &quot;Ikut Parameter Global System&quot; mengembalikan nasabah ke plafon
                  progresif; kredit barang memakai batas tersendiri.
                </li>
                <li>
                  Bunga pinjaman selalu mengikuti tenor: harian 7/14/28 hari (26–40% sesuai nominal)
                  dan bulanan 30/33/35% per bulan untuk tenor 1/3/6 bulan. Pinjaman yang sudah cair
                  tetap memakai snapshot bunganya.
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
            className="h-11 pl-9 pr-11"
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
              size="icon"
              aria-label="Bersihkan pencarian"
              className="absolute right-0 top-1/2 size-11 -translate-y-1/2 text-muted-foreground"
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
          {data === undefined
            ? "Memuat daftar nasabah…"
            : `Menampilkan ${halamanAktif.baris.length} dari ${rows.length}${rows.length >= 100 ? "+" : ""} data${cari.trim() !== "" ? " · filter aktif" : ""}`}
        </p>
      </div>

      {data === undefined ? (
        <p
          role="status"
          aria-live="polite"
          className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-8 text-sm text-muted-foreground"
        >
          <Loader2 className="size-4 animate-spin" /> Memuat nasabah…
        </p>
      ) : rows.length === 0 ? (
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
                              {!r.notifTagihanAktif && (
                                <Badge
                                  className="border-amber-200 bg-amber-100 text-amber-800"
                                  title="Pengingat tagihan WhatsApp & email dimatikan untuk nasabah ini"
                                >
                                  tagihan nonaktif
                                </Badge>
                              )}
                            </div>
                            <p className="mt-1 text-[11px] leading-4 text-slate-600">
                              {r.jumlahPengajuan} pengajuan · {r.pinjamanAktif} aktif ·{" "}
                              {r.adaFotoKtp
                                ? "KTP lengkap"
                                : r.adaDataDiri
                                  ? "tanpa foto KTP"
                                  : "data diri kosong"}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Progress plafon */}
                      <td className="px-4 py-3">
                        <BarPlafon terpakai={r.plafonTerpakai} efektif={r.plafonEfektif} />
                        <div className="mt-1.5">
                          <LencanaSumber
                            pribadi={r.plafonPribadi}
                            efektif={r.plafonEfektif}
                            global={data.default}
                          />
                        </div>
                      </td>

                      {/* Aksi: satu menu, isi tetap lengkap. */}
                      <td className="px-4 py-3">
                        <div className="flex justify-end">
                          <MenuKelolaNasabah
                            nama={r.nama}
                            adaDataDiri={r.adaDataDiri}
                            notifAktif={r.notifTagihanAktif}
                            sibukNotif={busyNotifId === r.userId}
                            sibukHapus={sedangHapus}
                            onAtur={() => setAturTarget(dataAtur(r))}
                            onProfil={() => setDetailTarget({ userId: r.userId as Id<"users"> })}
                            onDataDiri={() =>
                              setDataDiriTarget({ userId: r.userId as Id<"users">, nama: r.nama })
                            }
                            onMasukSebagai={() =>
                              setMasukTarget({ userId: r.userId as Id<"users">, nama: r.nama })
                            }
                            onTagihan={() => mintaUbahNotifikasi(r)}
                            onHapus={() =>
                              setHapusTarget({ userId: r.userId as Id<"users">, nama: r.nama })
                            }
                          />
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
                        <p className="mt-0.5 truncate text-[11px] text-slate-600">
                          {r.jumlahPengajuan} pengajuan · {r.pinjamanAktif} aktif ·{" "}
                          {r.adaFotoKtp
                            ? "KTP lengkap"
                            : r.adaDataDiri
                              ? "tanpa foto KTP"
                              : "data diri kosong"}
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
                    <LencanaOverride
                      pribadi={r.plafonPribadi !== null}
                      label="Plafon"
                      nilai={formatRupiah(r.plafonPribadi ?? 0)}
                    />
                    <LencanaSumber
                      pribadi={r.plafonPribadi}
                      efektif={r.plafonEfektif}
                      global={data.default}
                    />
                    {!r.notifTagihanAktif && (
                      <Badge
                        className="border-amber-200 bg-amber-100 text-amber-800"
                        title="Pengingat tagihan WhatsApp & email dimatikan untuk nasabah ini"
                      >
                        tagihan nonaktif
                      </Badge>
                    )}
                    {!r.adaDataDiri && (
                      <Badge className="border-amber-200 bg-amber-100 text-amber-800">
                        data diri kosong
                      </Badge>
                    )}
                  </div>

                  <div className="mt-3">
                    <MenuKelolaNasabah
                      nama={r.nama}
                      adaDataDiri={r.adaDataDiri}
                      notifAktif={r.notifTagihanAktif}
                      sibukNotif={busyNotifId === r.userId}
                      sibukHapus={sedangHapus}
                      onAtur={() => setAturTarget(dataAtur(r))}
                      onProfil={() => setDetailTarget({ userId: r.userId as Id<"users"> })}
                      onDataDiri={() =>
                        setDataDiriTarget({ userId: r.userId as Id<"users">, nama: r.nama })
                      }
                      onMasukSebagai={() =>
                        setMasukTarget({ userId: r.userId as Id<"users">, nama: r.nama })
                      }
                      onTagihan={() => mintaUbahNotifikasi(r)}
                      onHapus={() =>
                        setHapusTarget({ userId: r.userId as Id<"users">, nama: r.nama })
                      }
                      className="h-11 w-full justify-center"
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {/* Navigasi halaman: 10 nasabah per halaman. Label rentang membuat
          "18 nasabah" di atas terbaca jelas sebagai total, bukan jumlah baris. */}
      {rows.length > 0 && (
        <nav
          aria-label="Navigasi halaman daftar nasabah"
          className="flex flex-wrap items-center justify-between gap-3"
        >
          <p className="text-xs tabular-nums text-muted-foreground">
            {labelRentang(halamanAktif, rows.length)} nasabah
          </p>
          {halamanAktif.totalHalaman > 1 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="min-h-11 gap-1 px-3"
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
                  className={`flex size-11 items-center justify-center rounded-lg border text-xs font-semibold tabular-nums transition-colors ${
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
                className="min-h-11 gap-1 px-3"
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

      {/* Modal single-action: plafon DAN bunga dalam satu penyimpanan. Dialog
          hanya dibuka dari baris yang sudah termuat, jadi `data` ada saat ini. */}
      {aturTarget !== null && (
        <AturPlafonDialog
          nasabah={aturTarget}
          global={{ plafon: data?.default ?? 0 }}
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

      {/* Dialog "Masuk sebagai" dibuka dari menu Kelola. Komponennya tetap
          memegang seluruh konfirmasi dan pemulihan sesi; hanya pemicunya yang
          dipindahkan ke menu. */}
      {masukTarget !== null && (
        <TombolMasukSebagai
          targetId={masukTarget.userId}
          nama={masukTarget.nama}
          tujuan="dashboard nasabah"
          terbuka
          tampilkanTombol={false}
          onTerbukaChange={(buka) => {
            if (!buka) setMasukTarget(null);
          }}
        />
      )}

      {/* Konfirmasi sebelum menghentikan pengingat tagihan — komponen yang
          sama dipakai layar Verifikasi KYC agar kalimatnya tidak bercabang. */}
      <DialogMatikanTagihan
        nama={matikanNotifTarget?.nama ?? null}
        terbuka={matikanNotifTarget !== null}
        sibuk={busyNotifId !== null}
        onBatal={() => setMatikanNotifTarget(null)}
        onKonfirmasi={() => {
          if (matikanNotifTarget === null) return;
          void ubahNotifikasi(matikanNotifTarget, false);
        }}
      />

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
