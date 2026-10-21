/**
 * Helper dan primitif tampilan Ruang Pendana.
 *
 * Semuanya dulu tinggal di `pages/PenyediaDana.tsx` (3.400 baris). Yang dipindah
 * ke sini adalah bagian yang tidak memegang state halaman: format tanggal/rupiah,
 * umur titik lokasi, badge status, kerangka tabel, dan beberapa sel tabel.
 * Halaman tinggal menyusun kartu, dialog, dan isi tabnya.
 *
 * Tidak ada perubahan perilaku: isinya dipindah apa adanya, hanya `export`
 * ditambahkan supaya bisa dipakai dari halaman.
 */
import { BadgeCheck, Inbox, MapPin, TriangleAlert, Wallet } from "lucide-react";
import type { ReactNode } from "react";

import { BadgeKepercayaan } from "@/components/penyediaDana/BadgeKepercayaan";
import { CatatanKebijakan } from "@/components/penyediaDana/bagian-folio";
import { ChipSkorRisiko } from "@/components/penyediaDana/ChipSkorRisiko";
import { FOLIO } from "@/components/penyediaDana/folio";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { LokasiTitik } from "@/convex/penyediaDana";
import type { RingkasKepercayaan } from "@/lib/kepercayaanPeminjam";
import type { RingkasTransfer } from "@/lib/transferPendana";
import {
  AKSEN_RINGKASAN,
  KELAS_PIL_STATUS,
  LABEL_KREDIT,
  labelUmur,
  tanggalRingkas,
} from "@/pages/penyedia-dana/format";

/** Sel lokasi: umur titik terakhir atau tanda belum ada titik. */
export function SelLokasi({
  lokasi,
  sekarang,
}: {
  lokasi: LokasiTitik | null;
  sekarang: number;
}) {
  if (lokasi === null) {
    return (
      <TableCell className="whitespace-nowrap align-top text-xs text-slate-600">
        belum ada titik
      </TableCell>
    );
  }
  return (
    <TableCell className="whitespace-nowrap align-top text-xs text-slate-600">
      <span className="inline-flex items-center gap-1.5">
        <MapPin className="size-3.5 text-primary" aria-hidden />
        {labelUmur(lokasi.waktu, sekarang)}
      </span>
      {lokasi.tanda.length > 0 && (
        <span className="mt-1 block text-xs font-medium text-amber-700">
          pola koordinat ditandai
        </span>
      )}
    </TableCell>
  );
}

export function BadgeKredit({ status }: { status: string }) {
  const meta = LABEL_KREDIT[status] ?? {
    label: status,
    kelas: "border-slate-300 bg-slate-100 text-slate-700",
  };
  return <span className={`${KELAS_PIL_STATUS} ${meta.kelas}`}>{meta.label}</span>;
}

/**
 * Badge status catatan transfer keuntungan pendana.
 *
 * Super Admin dapat mencatat atau membatalkan catatan ini dari tab Lunas. Istilah
 * sengaja berbunyi "dicatat", bukan "terbayar": PINDAI tidak memindahkan uang,
 * jadi yang bisa dibaca di sini adalah catatan admin, bukan bukti mutasi bank.
 */
export function BadgeTransferPendana({ ringkas }: { ringkas: RingkasTransfer }) {
  const meta =
    ringkas.status === "dicatat"
      ? { label: "sudah dicatat", kelas: "border-emerald-200 bg-emerald-50 text-emerald-800" }
      : ringkas.status === "dibatalkan"
        ? { label: "catatan dibatalkan", kelas: "border-amber-200 bg-amber-50 text-amber-900" }
        : { label: "belum dicatat", kelas: "border-slate-200 bg-slate-100 text-slate-800" };
  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <span className={`${KELAS_PIL_STATUS} gap-1 text-xs ${meta.kelas}`}>
        {ringkas.status === "dicatat" && <BadgeCheck className="mr-1 size-2.5" />}
        {meta.label}
      </span>
      {ringkas.status === "dicatat" && ringkas.dicatatPada !== null && (
        <span className="text-xs text-muted-foreground">
          {tanggalRingkas(ringkas.dicatatPada)}
        </span>
      )}
    </span>
  );
}

export function BadgePseudonim({ kode }: { kode: string | null }) {
  return (
    <Badge
      variant="outline"
      className="border-slate-200 bg-slate-50 font-mono text-xs font-medium tracking-tight text-slate-600"
    >
      {kode ?? "kode belum terbit"}
    </Badge>
  );
}

/**
 * Satu angka pokok di lembar folio halaman.
 *
 * Angka ini berdiri sendiri sebagai lembar bertepi kuningan ganda: satu-satunya
 * angka di halaman yang perlu menangkap mata lebih dulu. Angka pendukungnya tidak
 * ikut ke sini; ia duduk di daftar bergaris (`BarisAngka`) di sebelahnya.
 */
export function KartuRingkasan({
  label,
  nilai,
  detail,
  icon,
  aksen = "dibukukan",
  catatanRisiko,
}: {
  label: string;
  nilai: string;
  detail: string;
  icon: ReactNode;
  /** Warna tanda makna: satu warna untuk satu makna. */
  aksen?: keyof typeof AKSEN_RINGKASAN;
  /** Catatan mikro risiko tepat di bawah angkanya. */
  catatanRisiko?: string;
}) {
  const gaya = AKSEN_RINGKASAN[aksen];
  return (
    /*
     * Satu-satunya permukaan bermewah di halaman ini: tepi kuningan ganda dan
     * bayangan bertinta (DESIGN.md §2). Angka pokok memang satu-satunya yang
     * perlu menangkap mata sebelum yang lain.
     */
    <div className={`${FOLIO.fokus} min-w-0 p-5`}>
      <div className="flex items-center gap-2">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md border border-gold/40 bg-white/70 text-emerald-800">
          {icon}
        </span>
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
          <span aria-hidden className={`size-2 shrink-0 rounded-[2px] ${gaya.garis}`} />
          {label}
        </p>
      </div>
      <p className={`mt-3 text-3xl font-semibold leading-none text-navy ${FOLIO.kode}`}>
        {nilai}
      </p>
      <p className="mt-2 text-xs leading-5 text-slate-600">{detail}</p>
      {catatanRisiko !== undefined && (
        <p className="mt-2 flex items-start gap-1.5 border-t border-slate-200 pt-2 text-xs leading-5 text-amber-900">
          <TriangleAlert className="mt-0.5 size-3 shrink-0" aria-hidden />
          <span>{catatanRisiko}</span>
        </p>
      )}
    </div>
  );
}

/**
 * Satu baris angka pendukung di lembar folio: tanda makna dan label di kiri,
 * angkanya di kanan pada garis rambut.
 *
 * Dipakai untuk angka yang bukan titik fokus: angkanya tetap terbaca jelas
 * tanpa ikut bersaing dengan angka pokok di sebelahnya.
 */
export function BarisAngka({
  label,
  nilai,
  detail,
  tanda,
  catatanRisiko,
}: {
  label: string;
  nilai: string;
  detail: string;
  tanda: keyof typeof AKSEN_RINGKASAN;
  catatanRisiko?: string;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-slate-200 py-3 last:border-b-0">
      <dt className="min-w-0">
        <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">
          <span
            aria-hidden
            className={`size-2 shrink-0 rounded-[2px] ${AKSEN_RINGKASAN[tanda].garis}`}
          />
          {label}
        </span>
        <span className="mt-1 block text-xs leading-5 text-slate-600">{detail}</span>
        {catatanRisiko !== undefined && (
          <span className="mt-1 flex items-start gap-1.5 text-xs leading-5 text-amber-900">
            <TriangleAlert className="mt-0.5 size-3 shrink-0" aria-hidden />
            <span>{catatanRisiko}</span>
          </span>
        )}
      </dt>
      <dd className={`text-right text-lg font-semibold leading-tight text-navy ${FOLIO.kode}`}>
        {nilai}
      </dd>
    </div>
  );
}

/**
 * Keadaan kosong satu daftar.
 *
 * Diberi penanda visual (kotak ikon) dan bidang putus-putus yang lebih terang
 * daripada kotak data, supaya "tidak ada baris" tidak pernah terbaca seperti
 * tabel yang gagal termuat. Kalimatnya tetap datang dari pemanggil.
 */
export function KeadaanKosong({ pesan }: { pesan: string }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50/70 px-6 py-12 text-center">
      <span className="mx-auto flex size-11 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600">
        <Inbox className="size-5" aria-hidden />
      </span>
      <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted-foreground">{pesan}</p>
    </div>
  );
}

/**
 * Catatan kebijakan satu tab.
 *
 * Sebelumnya kotak penuh berwarna muda; sekarang hanya garis warna di tepi kiri
 * supaya peringatan tetap menonjol tanpa bersaing dengan angka di tabel.
 */
export function CatatanTab({
  nada,
  label,
  children,
}: {
  nada: "amber" | "emerald" | "red";
  /** Nama keadaan yang dijelaskan catatan ini, ditulis apa adanya. */
  label: string;
  children: ReactNode;
}) {
  return (
    <CatatanKebijakan label={label} nada={nada} className="mb-4">
      {children}
    </CatatanKebijakan>
  );
}

/**
 * Keadaan kosong yang jujur saat saringan aktif: "belum ada pengajuan" akan
 * menyesatkan bila datanya sebenarnya ada, hanya tersaring.
 */
export function KeadaanKosongDaftar({ aktif, pesan }: { aktif: boolean; pesan: string }) {
  if (!aktif) return <KeadaanKosong pesan={pesan} />;
  return (
    <KeadaanKosong pesan="Tidak ada pengajuan yang cocok dengan saringan nama / pendana di atas. Kosongkan saringan untuk menampilkan semuanya." />
  );
}

export function CatatanTerpotong({ terpotong, batas }: { terpotong: boolean; batas: number }) {
  if (!terpotong) return null;
  return (
    <p className="px-5 py-3 text-center text-xs text-muted-foreground">
      Menampilkan {batas} pengajuan terbaru — urutkan dari yang paling baru.
    </p>
  );
}

/**
 * Kerangka tabel — dirancang agar muat TANPA geser mendatar.
 * `TableHead`/`TableCell` bawaan memaksa `whitespace-nowrap` (itulah yang
 * membuat tabel melebar dan harus digeser); di sini penekanan itu dilonggarkan
 * lewat varian `[&_th]`/`[&_td]` supaya judul dan isi boleh turun ke baris
 * kedua, sehingga tabel pas di lebar kontainer. Nomor referensi sudah memakai
 * `break-all` di SelPeminjam. Wadah bawaan `Table` (`data-slot="table-container"`)
 * juga di-set `overflow-x-clip` agar tidak pernah menampilkan geser mendatar.
 */
export function Tabel({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className={`overflow-hidden ${FOLIO.kertas} [&>[data-slot=table-container]]:overflow-x-clip`}>
      <Table className="w-full [&_th]:whitespace-normal [&_td]:whitespace-normal [&_td]:break-words">
        <TableHeader>
          {/* Judul kolom diberi garis kuningan di bawahnya: batas antara kepala
              dan isi tabel jadi terbaca sekali pandang. */}
          <TableRow className={`${FOLIO.kepalaTabel} hover:bg-slate-50`}>
            {head.map((judul) => (
              <TableHead
                key={judul}
                className="h-11 align-bottom text-xs font-semibold uppercase tracking-[0.14em] text-slate-600"
              >
                {judul}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        {/* Baris zebra + sorot saat disorot: tabel berkolom banyak jauh lebih
            mudah diikuti mata ketika barisnya punya irama. */}
        <TableBody className="[&_tr:nth-child(even)]:bg-slate-50/60 [&_tr:hover]:bg-emerald-50/60 [&_tr]:transition-colors">
          {children}
        </TableBody>
      </Table>
    </div>
  );
}

/**
 * Sel peminjam: nama, nomor referensi, dan kode pseudonim dalam satu kolom.
 * Digabung supaya tabel tidak perlu digeser mendatar di layar kerja.
 */
export function SelPeminjam({
  nama,
  kode,
  referensi,
  kepercayaan,
}: {
  nama: string;
  kode: string | null;
  referensi: string;
  /** Hanya diisi untuk pengajuan pinjaman — indeks kepercayaan peminjam. */
  kepercayaan?: RingkasKepercayaan;
}) {
  return (
    <TableCell className="align-top">
      <p className="font-medium uppercase text-slate-900">{nama}</p>
      <p className="mt-1 break-all font-mono text-xs text-slate-600">{referensi}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <BadgePseudonim kode={kode} />
        {kepercayaan !== undefined && (
          <>
            <BadgeKepercayaan kepercayaan={kepercayaan} tanpaSkor />
            <ChipSkorRisiko skor={kepercayaan.skor} />
          </>
        )}
      </div>
    </TableCell>
  );
}

export function SelPendana({ pendana }: { pendana: string | null }) {
  if (pendana === null) {
    return <TableCell className="align-top text-slate-600">—</TableCell>;
  }
  return (
    <TableCell className="align-top">
      <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-medium uppercase text-slate-800">
        <Wallet className="size-3" aria-hidden /> {pendana}
      </span>
    </TableCell>
  );
}

/** Satu baris label/nilai pada kartu pengajuan (tampilan layar sempit). */
export function InfoKartu({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium uppercase tracking-[0.1em] text-slate-600">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm font-medium text-slate-800">{children}</dd>
    </div>
  );
}
