import { Loader2Icon, RotateCcwIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Kosakata pemuatan PINDAI — satu tempat untuk semua bentuk "sedang memuat".
 *
 * Empat keadaan dibedakan sadar, karena masing-masing butuh umpan balik yang
 * berbeda dan mencampurnya membuat aplikasi terasa lebih lambat dari kenyataan:
 *
 * | Keadaan              | Bentuk                     | Komponen            |
 * | -------------------- | -------------------------- | ------------------- |
 * | Muat awal            | rangka seukuran isi        | `Skeleton*`         |
 * | Menyegarkan (refresh)| pil kecil di dekat judul   | `IndikatorSibuk`    |
 * | Kirim (submit)       | tombol sibuk + `aria-busy` | `Button loading`    |
 * | Proses latar/unggah  | bilah TAK TENTU tanpa angka| `BilahTakTentu`     |
 *
 * Aturan yang dipegang semua komponen di berkas ini:
 * - **Tanpa persentase palsu.** Progres hanya ditampilkan sebagai persen bila
 *   angkanya benar-benar diukur; di sini tidak ada satu pun `aria-valuenow`.
 * - **Tanpa lompatan tata letak.** Tinggi baris/kolom rangka disamakan dengan
 *   isi sungguhannya (baris daftar 56–64 px, kartu statistik = `p-4 sm:p-5`),
 *   jadi konten yang datang tidak mendorong halaman.
 * - **Tanpa gerakan yang mengganggu.** Yang berdenyut hanya `Skeleton` (opasitas)
 *   dan bilah tak tentu (`.motion-bilah`, dimatikan saat `prefers-reduced-motion`).
 * - **Selalu terbaca pembaca layar.** Rangka bersifat dekoratif; teks statusnya
 *   disediakan sekali lewat `role="status"` + `sr-only`.
 *
 * Semua ikon pemintal di sini sengaja DEKORATIF (`aria-hidden`): pengumuman
 * statusnya sudah dipegang wadah `role="status"` + teks `sr-only`, sehingga
 * pembaca layar tidak mendengar "Memuat" dua kali dari satu tempat.
 */
function SpinnerDekoratif({ className }: { className?: string }) {
  return <Loader2Icon aria-hidden="true" className={cn("animate-spin", className)} />;
}

/** Baris daftar (ikon + dua baris teks + lencana) — bentuk `QueueRow`. */
export function SkeletonBarisDaftar({
  baris = 3,
  className,
}: {
  baris?: number;
  className?: string;
}) {
  return (
    <div role="status" aria-live="polite" className={cn("animate-masuk py-2", className)}>
      <span className="sr-only">Memuat daftar…</span>
      <div className="space-y-2.5" aria-hidden="true">
        {Array.from({ length: baris }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 rounded-xl border border-slate-100 bg-white px-4 py-3"
          >
            <Skeleton className="size-9 shrink-0 rounded-lg" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-3.5 w-1/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
            <Skeleton className="h-6 w-16 shrink-0 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Satu kartu statistik — ukurannya mengikuti kartu angka dashboard. */
export function SkeletonKartu({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-3 h-6 w-32" />
        </div>
        <Skeleton className="size-10 shrink-0 rounded-xl" />
      </div>
    </div>
  );
}

/**
 * Tabel sedang dimuat: baris kepala + baris isi dengan tinggi TETAP (`h-14`),
 * sehingga tabel sungguhan menggantikannya tanpa menggeser halaman.
 */
export function SkeletonTabel({
  kolom = 4,
  baris = 5,
  keterangan = "Memuat tabel…",
  className,
}: {
  kolom?: number;
  baris?: number;
  keterangan?: string;
  className?: string;
}) {
  const jumlahKolom = Math.max(2, kolom);
  return (
    <div role="status" aria-live="polite" className={cn("animate-masuk", className)}>
      <span className="sr-only">{keterangan}</span>
      <div
        aria-hidden="true"
        className="overflow-hidden rounded-2xl border border-slate-200 bg-white"
      >
        <div
          className="flex items-center gap-4 border-b border-slate-200 bg-slate-50/80 px-4 py-3"
          style={{ display: "grid", gridTemplateColumns: `repeat(${jumlahKolom}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: jumlahKolom }).map((_, i) => (
            <Skeleton key={i} className={i === 0 ? "h-3 w-24" : "h-3 w-14"} />
          ))}
        </div>
        {Array.from({ length: baris }).map((_, i) => (
          <div
            key={i}
            className="flex h-14 items-center gap-4 border-b border-slate-100 px-4 last:border-b-0"
            style={{ display: "grid", gridTemplateColumns: `repeat(${jumlahKolom}, minmax(0, 1fr))` }}
          >
            <div className="min-w-0 space-y-2">
              <Skeleton className="h-3.5 w-4/5" />
              <Skeleton className="h-2.5 w-2/5" />
            </div>
            {Array.from({ length: jumlahKolom - 1 }).map((_, j) => (
              <Skeleton
                key={j}
                className={j === jumlahKolom - 2 ? "h-6 w-20 rounded-full" : "h-3 w-16"}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Rangka isi dialog rincian — bentuknya mengikuti `dl` pada dialog detail. */
export function SkeletonDetail({
  baris = 5,
  keterangan = "Memuat rincian…",
  className,
}: {
  baris?: number;
  keterangan?: string;
  className?: string;
}) {
  return (
    <div role="status" aria-live="polite" className={cn("flex flex-col gap-4", className)}>
      <span className="sr-only">{keterangan}</span>
      <div aria-hidden="true" className="flex flex-col gap-4">
        <div className="space-y-2">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-3 w-2/5" />
        </div>
        <Skeleton className="h-3 w-full" />
        <dl className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {Array.from({ length: baris }).map((_, i) => (
            <div key={i} className="flex items-center justify-between gap-4 px-4 py-3">
              <Skeleton className="h-3 w-1/3" />
              <Skeleton className="h-3 w-1/4" />
            </div>
          ))}
        </dl>
        <Skeleton className="h-16 w-full rounded-2xl" />
      </div>
    </div>
  );
}

/**
 * Satu baris "sedang memuat" berukuran teks — pengganti seragam untuk
 * `Loader2 + "Memuat …"` yang tersebar. Bentuknya ringkas karena dipakai di
 * dalam panel yang sudah punya judulnya sendiri.
 */
export function MemuatBaris({
  teks = "Memuat…",
  className,
}: {
  teks?: string;
  className?: string;
}) {
  return (
    <p
      role="status"
      aria-live="polite"
      className={cn("flex items-center gap-2 text-sm text-muted-foreground", className)}
    >
      <SpinnerDekoratif className="size-4 shrink-0" />
      {teks}
    </p>
  );
}

/**
 * Pil sibuk yang TENANG untuk menyegarkan data sambil **data lama tetap
 * tampil**. Sengaja kecil dan tanpa teks terlihat: yang berubah hanya satu
 * ikon berputar di dekat judul bagian, sehingga pengguna tidak kehilangan
 * konteks dan tidak ada halaman yang berkedip menjadi kosong.
 *
 * Pembaca layar tetap diberi tahu — tapi tidak lewat `aria-live`, supaya
 * penyegaran yang wajar tidak mengumumkan apa pun di tengah pekerjaan.
 */
export function IndikatorSibuk({
  label = "Menyegarkan…",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex shrink-0 items-center", className)}>
      <SpinnerDekoratif className="size-3.5 text-muted-foreground" />
      <span className="sr-only">{label}</span>
    </span>
  );
}

/**
 * Bilah proses **tak tentu** untuk pekerjaan yang durasinya tidak diketahui
 * (unggahan berkas, pemeriksaan isi berkas di server).
 *
 * Menurut WAI-ARIA, bilah tanpa nilai HARUS berupa `progressbar` tanpa
 * `aria-valuenow` — itulah yang membuat pembaca layar mengumumkannya sebagai
 * "sedang berjalan", bukan sebagai angka yang bergerak. Karena itu tidak ada
 * `aria-valuenow`, tidak ada `aria-valuenow` palsu, dan tidak ada teks persen.
 */
export function BilahTakTentu({
  label,
  className,
}: {
  /** Diumumkan pembaca layar; juga ditampilkan kecil di bawah bilah. */
  label: string;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <div
        role="progressbar"
        aria-label={label}
        className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200"
      >
        <span
          aria-hidden="true"
          className="motion-bilah block h-full w-1/3 rounded-full bg-primary"
        />
      </div>
      <p role="status" aria-live="polite" className="mt-1.5 text-[11px] leading-4 text-muted-foreground">
        {label}
      </p>
    </div>
  );
}

/**
 * Bilah proses dengan angka NYATA — dipakai hanya bila lapisan pengiriman
 * melaporkan berapa byte yang sudah terkirim (mis. `XMLHttpRequest.upload
 * .onprogress`, lihat `lib/unggahDokumen.ts`).
 *
 * `nilai` berupa persen 0–100 dari `progresPersen()`, atau `null` bila total
 * byte tidak diketahui — dan saat `null` komponen ini jatuh ke `BilahTakTentu`
 * yang memang tidak punya `aria-valuenow`. Jadi tidak pernah ada bilah yang
 * mengaku tahu progres padahal angkanya tidak ada.
 */
export function BilahProgres({
  nilai,
  label,
  className,
}: {
  /** Persen 0–100, atau `null` bila tidak diketahui. */
  nilai: number | null;
  /** Nama pekerjaan (mis. "Mengunggah Foto KTP") — diumumkan pembaca layar. */
  label: string;
  className?: string;
}) {
  if (nilai === null) return <BilahTakTentu label={label} className={className} />;
  return (
    <div className={cn("min-w-0", className)}>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={nilai}
        className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200"
      >
        <span
          aria-hidden="true"
          style={{ width: `${nilai}%` }}
          className="block h-full rounded-full bg-primary transition-[width] duration-[var(--motion-fast)] ease-[var(--motion-ease-out)]"
        />
      </div>
      <p
        role="status"
        aria-live="polite"
        className="mt-1.5 text-[11px] leading-4 tabular-nums text-muted-foreground"
      >
        {label} {nilai}%
      </p>
    </div>
  );
}

/**
 * Keadaan gagal yang bisa dicoba lagi.
 *
 * Dipakai bila satu permintaan mengambil data GAGAL (bukan sekadar lambat):
 * tanpa ini, pengguna hanya melihat rangka abu-abu selamanya dan tidak punya
 * jalan keluar. Tombol coba-lagi memanggil `onCoba` yang disediakan pemanggil —
 * jadi pengulangannya tetap lewat mutasi/aksi yang sama, bukan jalur baru.
 */
export function GalatMuat({
  pesan,
  onCoba,
  labelCoba = "Coba lagi",
  className,
}: {
  pesan: string;
  onCoba?: () => void;
  labelCoba?: string;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800",
        className,
      )}
    >
      <span className="leading-6">{pesan}</span>
      {onCoba && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="shrink-0 gap-1.5 border-red-300 bg-white text-red-700 hover:bg-red-50 hover:text-red-800"
          onClick={onCoba}
        >
          <RotateCcwIcon className="size-3.5" aria-hidden="true" /> {labelCoba}
        </Button>
      )}
    </div>
  );
}

/**
 * Rangka panel admin: bilah atas + judul bidang + tiga kartu statistik + dua
 * daftar. Dipakai saat pembacaan pertama panel admin belum selesai, mengganti
 * layar penuh bermerek yang sebelumnya menutupi seluruh halaman untuk satu
 * permintaan data — bentuknya sudah mengikuti halaman sungguhannya, jadi tidak
 * ada lompatan saat panel benar-benar tampil.
 */
export function KerangkaAdmin() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-foreground">
      <div
        aria-hidden="true"
        className="sticky top-0 z-40 h-14 w-full border-b border-slate-200 bg-white/95 backdrop-blur sm:h-16"
      />
      <div role="status" aria-live="polite" className="mx-auto w-full max-w-7xl flex-1 px-3 py-4 sm:px-6 sm:py-8">
        <span className="sr-only">Memuat panel operasional…</span>
        <div aria-hidden="true" className="space-y-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:rounded-3xl sm:p-8">
            <Skeleton className="h-3 w-40" />
            <Skeleton className="mt-4 h-7 w-72 max-w-full" />
            <Skeleton className="mt-3 h-4 w-full max-w-xl" />
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-28 rounded-2xl sm:h-32" />
            ))}
          </div>
          <SkeletonTabel kolom={4} baris={4} />
        </div>
      </div>
    </div>
  );
}

/**
 * Rangka ruang penyedia dana: panel judul navy + baris angka + tabel pengajuan.
 * Tinggi panel judul dan baris angka disamakan dengan aslinya supaya tabel
 * tidak melompat dari bawah lipatan ke atas layar saat data tiba.
 */
export function KerangkaRuangPendana() {
  return (
    <div role="status" aria-live="polite" className="py-6 sm:py-9">
      <span className="sr-only">Memuat catatan pengajuan…</span>
      <div aria-hidden="true" className="space-y-6">
        <div className="overflow-hidden rounded-3xl bg-navy px-5 py-6 sm:px-8 sm:py-8">
          <Skeleton className="h-3 w-36 bg-white/20" />
          <Skeleton className="mt-4 h-7 w-64 max-w-full bg-white/20" />
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="rounded-2xl bg-white/10 p-3">
                <Skeleton className="h-3 w-16 bg-white/25" />
                <Skeleton className="mt-2.5 h-5 w-24 bg-white/25" />
              </div>
            ))}
          </div>
        </div>
        <Skeleton className="h-11 w-full rounded-2xl" />
        <SkeletonTabel kolom={6} baris={6} />
      </div>
    </div>
  );
}
