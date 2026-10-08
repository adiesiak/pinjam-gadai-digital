import { useMutation, useQuery } from "convex/react";
import {
  BadgeCheck,
  Eye,
  ExternalLink,
  FileText,
  KeyRound,
  Loader2,
  Lock,
  HandCoins,
  MapPin,
  Package,
  Pencil,
  ShoppingBag,
  RotateCcw,
  Timer,
  TriangleAlert,
  Wallet,
  XCircle,
} from "lucide-react";
import { Component, useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router";

import { RoleDashboardMenu } from "@/components/RoleDashboardMenu";
import { VaultLogo } from "@/components/VaultLogo";
import { CatatanPotonganAdmin } from "@/components/penyediaDana/CatatanPotonganAdmin";
import { PetaLokasiPeminjam } from "@/components/penyediaDana/PetaLokasiPeminjam";
import { StatusBadge } from "@/components/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { RingkasTransfer } from "@/lib/transferPendana";
import type {
  BarisGadai,
  BarisKredit,
  BarisPinjaman,
  LokasiTitik,
  RekapPendana,
} from "@/convex/penyediaDana";
import { useAuth } from "@/hooks/use-auth";
import { quoteKreditBarang } from "@/lib/kredit";
import { BULAN_MS, quotePinjaman, simulasiBulananPinjaman } from "@/lib/loan";
import { formatRupiah } from "@/lib/money";

/**
 * Ruang Penyedia Dana — HANYA BACA.
 *
 * Menampilkan catatan pengajuan Peminjam (pinjaman tunai, gadai, kredit barang)
 * sebagai tabel per kategori kepada akun yang diberi akses lihat saja oleh
 * admin, termasuk pemantau yang masuk dengan kode akses bersama. Halaman ini
 * tidak pernah memanggil mutation apa pun; seluruh pengubahan data tetap di
 * panel admin.
 *
 * Atas keputusan admin, ruang ini juga menampilkan (1) berkas pengajuan — KTP,
 * selfie, slip penghasilan, foto barang, tanda tangan — yang diambil hanya saat
 * dialog Detail dibuka, dan (2) titik lokasi terakhir peminjam beserta peta
 * live. NIK, nomor rekening, nomor WhatsApp, dan alamat tetap tidak dikirim
 * sebagai kolom terpisah; NIK hanya terbaca pada gambar KTP bila dibuka.
 *
 * Batas yang harus jujur disampaikan: titik lokasi hanya diperbarui selama
 * dashboard peminjam terbuka (±60 detik). Pelacakan saat aplikasi ditutup butuh
 * aplikasi native, jadi yang tampil di sini selalu "terakhir dikirim kapan".
 */

function tanggalRingkas(ms: number): string {
  return new Date(ms).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Jalankan perhitungan kuotasi tanpa pernah merobohkan halaman (data warisan). */
function coba<T>(fn: () => T): T | null {
  try {
    return fn();
  } catch {
    return null;
  }
}

/**
 * Format rupiah defensif: halaman baca-saja tidak boleh gagal total hanya
 * karena satu baris data warisan bernilai bukan rupiah bulat.
 */
function rupiah(nilai: number): string {
  try {
    return formatRupiah(nilai);
  } catch {
    return `Rp ${Number(nilai).toLocaleString("id-ID")}`;
  }
}

/** Satu bulan = 30 hari, mengikuti lib/loan (BULAN_MS). */
const HARI_MS = BULAN_MS / 30;

/**
 * Umur titik lokasi dalam bahasa manusia. Selalu relatif terhadap waktu
 * sekarang, sehingga klaim "live" tidak pernah menyesatkan: titik yang berhenti
 * dikirim akan terlihat makin tua sendiri.
 */
function labelUmur(waktu: number, sekarang: number): string {
  const detik = Math.max(0, Math.round((sekarang - waktu) / 1000));
  if (detik < 90) return "baru saja";
  const menit = Math.round(detik / 60);
  if (menit < 60) return `${menit} menit lalu`;
  const jam = Math.round(menit / 60);
  if (jam < 24) return `${jam} jam lalu`;
  return `${Math.round(jam / 24)} hari lalu`;
}

/**
 * Jam berjalan untuk label umur lokasi. Tanpa ini, label "3 menit lalu" akan
 * membeku di layar ketika tidak ada data baru yang masuk (Convex hanya
 * merender ulang saat data berubah).
 */
function useJamBerjalan(intervalMs = 60_000): number {
  const [sekarang, setSekarang] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setSekarang(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return sekarang;
}

/** Tautan peta eksternal + embed OpenStreetMap untuk satu koordinat. */
function tautanPeta(lat: number, lng: number): { embed: string; penuh: string } {
  const d = 0.008;
  return {
    embed: `https://www.openstreetmap.org/export/embed.html?bbox=${lng - d}%2C${lat - d}%2C${
      lng + d
    }%2C${lat + d}&layer=mapnik&marker=${lat}%2C${lng}`,
    penuh: `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`,
  };
}

/** Sel lokasi: umur titik terakhir atau tanda belum ada titik. */
function SelLokasi({ lokasi, sekarang }: { lokasi: LokasiTitik | null; sekarang: number }) {
  if (lokasi === null) {
    return (
      <TableCell className="whitespace-nowrap align-top text-xs text-slate-400">
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
        <span className="mt-1 block text-[10px] font-medium text-amber-700">
          pola koordinat ditandai
        </span>
      )}
    </TableCell>
  );
}

const LABEL_KREDIT: Record<string, { label: string; kelas: string }> = {
  diajukan: { label: "Menunggu review", kelas: "bg-slate-100 text-slate-600 hover:bg-slate-100" },
  sedang_ditinjau: {
    label: "Sedang ditinjau",
    kelas: "bg-amber-100 text-amber-700 hover:bg-amber-100",
  },
  disetujui: {
    label: "Disetujui tim PINDAI",
    kelas: "bg-emerald-100 text-emerald-700 hover:bg-emerald-100",
  },
  ditolak: { label: "Tidak disetujui", kelas: "bg-red-100 text-red-700 hover:bg-red-100" },
  didanai: {
    label: "Pendanaan tercatat penuh",
    kelas: "bg-emerald-100 text-emerald-700 hover:bg-emerald-100",
  },
  lunas: { label: "Lunas (ledger)", kelas: "bg-emerald-100 text-emerald-700 hover:bg-emerald-100" },
};

function BadgeKredit({ status }: { status: string }) {
  const meta = LABEL_KREDIT[status] ?? {
    label: status,
    kelas: "bg-slate-100 text-slate-600 hover:bg-slate-100",
  };
  return <Badge className={`border-0 ${meta.kelas}`}>{meta.label}</Badge>;
}

/**
 * Badge status catatan transfer keuntungan pendana.
 *
 * Ruang ini hanya menampilkan; pencatatan transfer dibuat admin di panel. Istilah
 * sengaja berbunyi "dicatat", bukan "terbayar": PINDAI tidak memindahkan uang,
 * jadi yang bisa dibaca di sini adalah catatan admin, bukan bukti mutasi bank.
 */
function BadgeTransferPendana({ ringkas }: { ringkas: RingkasTransfer }) {
  const meta =
    ringkas.status === "dicatat"
      ? { label: "sudah dicatat", kelas: "bg-emerald-100 text-emerald-700 hover:bg-emerald-100" }
      : ringkas.status === "dibatalkan"
        ? { label: "catatan dibatalkan", kelas: "bg-amber-100 text-amber-800 hover:bg-amber-100" }
        : { label: "belum dicatat", kelas: "bg-slate-100 text-slate-600 hover:bg-slate-100" };
  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <Badge className={`border-0 text-[10px] ${meta.kelas}`}>
        {ringkas.status === "dicatat" && <BadgeCheck className="mr-1 size-2.5" />}
        {meta.label}
      </Badge>
      {ringkas.status === "dicatat" && ringkas.dicatatPada !== null && (
        <span className="text-[10px] text-muted-foreground">
          {tanggalRingkas(ringkas.dicatatPada)}
        </span>
      )}
    </span>
  );
}

function BadgePseudonim({ kode }: { kode: string | null }) {
  return (
    <Badge
      variant="outline"
      className="border-slate-200 bg-slate-50 font-mono text-[10px] font-medium tracking-tight text-slate-500"
    >
      {kode ?? "kode belum terbit"}
    </Badge>
  );
}

function KartuRingkasan({
  label,
  nilai,
  detail,
  icon,
}: {
  label: string;
  nilai: string;
  detail: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2 text-muted-foreground">
        <span className="flex size-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
          {icon}
        </span>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em]">{label}</p>
      </div>
      <p className="mt-3 text-lg font-semibold tabular-nums">{nilai}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

/**
 * Kartu rekap satu penyedia dana (model 1 pinjaman = 1 pendana): jumlah
 * pinjaman, pokok yang bekerja, keuntungan bersih pendana, dan biaya platform.
 */
function KartuPendana({ r }: { r: RekapPendana }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="inline-flex items-center gap-1.5 font-semibold uppercase text-slate-900">
          <Wallet className="size-3.5 text-primary" aria-hidden /> {r.nama}
        </p>
        <Badge
          variant="outline"
          className="border-slate-200 text-[10px] font-medium text-slate-500"
        >
          {r.jumlahPinjaman} pinjaman · {r.jumlahAktif} aktif · {r.jumlahLunas} lunas
        </Badge>
      </div>
      <dl className="mt-3 space-y-1.5 text-xs">
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-muted-foreground">Total disalurkan</dt>
          <dd className="font-medium tabular-nums text-slate-900">
            {rupiah(r.totalDisalurkan)}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-muted-foreground">Saldo berjalan</dt>
          <dd className="font-medium tabular-nums text-slate-900">
            {rupiah(r.saldoBerjalan)}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-muted-foreground">Keuntungan pendana</dt>
          <dd className="font-semibold tabular-nums text-emerald-700">
            {rupiah(r.keuntunganPendana)}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-muted-foreground">Potongan admin (dari uang kembali)</dt>
          <dd className="font-semibold tabular-nums text-amber-700">
            {rupiah(r.keuntunganAdmin)}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-2 border-t border-slate-100 pt-1.5">
          <dt className="text-muted-foreground">Transfer keuntungan</dt>
          <dd className="text-right">
            {r.jumlahLunas === 0 ? (
              <span className="text-[11px] text-muted-foreground">belum ada pinjaman lunas</span>
            ) : r.transferBelumDicatat === 0 ? (
              <Badge className="border-0 bg-emerald-100 text-[10px] text-emerald-700 hover:bg-emerald-100">
                <BadgeCheck className="mr-1 size-3" /> semua sudah dicatat
              </Badge>
            ) : (
              <span className="inline-flex flex-col items-end gap-0.5">
                <Badge className="border-0 bg-amber-100 text-[10px] text-amber-800 hover:bg-amber-100">
                  <TriangleAlert className="mr-1 size-3" /> {r.transferBelumDicatat} belum dicatat
                </Badge>
                <span className="text-[10px] tabular-nums text-muted-foreground">
                  {rupiah(r.keuntunganBelumDicatat)}
                </span>
              </span>
            )}
          </dd>
        </div>
      </dl>
    </div>
  );
}

function KeadaanKosong({ pesan }: { pesan: string }) {
  return (
    <p className="rounded-2xl border border-dashed border-slate-200 bg-white px-5 py-10 text-center text-sm text-muted-foreground">
      {pesan}
    </p>
  );
}

function CatatanTerpotong({ terpotong, batas }: { terpotong: boolean; batas: number }) {
  if (!terpotong) return null;
  return (
    <p className="px-5 py-3 text-center text-[11px] text-muted-foreground">
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
function Tabel({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white [&>[data-slot=table-container]]:overflow-x-clip">
      <Table className="w-full [&_th]:whitespace-normal [&_td]:whitespace-normal [&_td]:break-words">
        <TableHeader>
          <TableRow className="bg-slate-50/80">
            {head.map((judul) => (
              <TableHead
                key={judul}
                className="align-bottom text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500"
              >
                {judul}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>{children}</TableBody>
      </Table>
    </div>
  );
}

function capitalize(nama: string): string {
  return nama.trim().toUpperCase();
}

/**
 * Sel peminjam: nama, nomor referensi, dan kode pseudonim dalam satu kolom.
 * Digabung supaya tabel tidak perlu digeser mendatar di layar kerja.
 */
function SelPeminjam({
  nama,
  kode,
  referensi,
}: {
  nama: string;
  kode: string | null;
  referensi: string;
}) {
  return (
    <TableCell className="align-top">
      <p className="font-medium uppercase text-slate-900">{nama}</p>
      <p className="mt-1 break-all font-mono text-[11px] text-slate-500">{referensi}</p>
      <div className="mt-1">
        <BadgePseudonim kode={kode} />
      </div>
    </TableCell>
  );
}

function SelPendana({ pendana }: { pendana: string | null }) {
  if (pendana === null) {
    return <TableCell className="align-top text-slate-400">—</TableCell>;
  }
  return (
    <TableCell className="align-top">
      <span className="inline-flex items-center gap-1.5 rounded-full border border-gold/40 bg-gold/10 px-2.5 py-1 text-xs font-medium uppercase text-gold-foreground">
        <Wallet className="size-3" aria-hidden /> {pendana}
      </span>
    </TableCell>
  );
}

/** Satu baris label/nilai pada kartu pengajuan (tampilan layar sempit). */
function InfoKartu({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-medium uppercase tracking-[0.1em] text-slate-400">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm font-medium text-slate-800">{children}</dd>
    </div>
  );
}

/**
 * Kartu pengajuan untuk layar sempit.
 *
 * Di HP tabel 13 kolom tidak mungkin muat tanpa geser mendatar, jadi setiap
 * baris ditampilkan sebagai kartu berisi semua kolom penting, plus tombol
 * Detail untuk rincian lengkap. Di layar lebar tabel aslinya tetap dipakai.
 */
function KartuPengajuan({
  nama,
  kode,
  nomorReferensi,
  status,
  onDetail,
  onUbah,
  children,
}: {
  nama: string;
  kode: string | null;
  nomorReferensi: string;
  status: React.ReactNode;
  onDetail: () => void;
  /** Hanya diberikan untuk Super Admin — mengoreksi data pinjaman. */
  onUbah?: () => void;
  children: React.ReactNode;
}) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold uppercase text-slate-900">{nama}</p>
          <p className="mt-0.5 font-mono text-[11px] text-slate-500">{nomorReferensi}</p>
        </div>
        <div className="shrink-0">{status}</div>
      </div>
      <div className="mt-2">
        <BadgePseudonim kode={kode} />
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-3">{children}</dl>
      <div className="mt-4 flex gap-2">
        <Button variant="outline" size="sm" className="flex-1" onClick={onDetail}>
          <Eye className="mr-1.5 size-3.5" aria-hidden /> Detail
        </Button>
        {onUbah !== undefined && (
          <Button variant="outline" size="sm" className="flex-1" onClick={onUbah}>
            <Pencil className="mr-1.5 size-3.5" aria-hidden /> Ubah
          </Button>
        )}
      </div>
    </article>
  );
}

function BarisDetail({ label, nilai }: { label: string; nilai: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 py-2.5 last:border-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-right text-sm font-medium text-slate-900">{nilai}</dd>
    </div>
  );
}

function labelPokok(status: string): string {
  return ["disetujui", "didanai", "lunas"].includes(status)
    ? "Pokok disetujui"
    : "Pokok tercatat";
}

function DetailPinjaman({ row }: { row: BarisPinjaman }) {
  const tenorBulan = row.tenorBulan;
  const persenBunga = row.persenBunga ?? undefined;
  const harian =
    tenorBulan === null
      ? coba(() => quotePinjaman({ pokokPinjaman: row.pokokPinjaman, persenBunga }))
      : null;
  const bulanan =
    tenorBulan === null
      ? null
      : coba(() => simulasiBulananPinjaman({ pokokPinjaman: row.pokokPinjaman, tenorBulan, persenBunga }));
  const imbalHasil = harian?.bunga ?? bulanan?.bungaTotal ?? null;
  const totalPelunasan = harian?.totalKewajibanPelunasan ?? bulanan?.totalPengembalian ?? null;
  const potongan = harian?.totalPotonganDiMuka ?? bulanan?.potonganDiMuka ?? null;
  const danaBersih = harian?.danaBersihDitransfer ?? bulanan?.danaDiterima ?? null;
  // Jatuh tempo dihitung dari tanggal pendanaan + tenor (bukan dari waktu
  // sekarang) supaya render tetap murni dan tidak bergantung jam perangkat.
  const jatuhTempo =
    row.didanaiPada === null
      ? null
      : row.didanaiPada +
        (tenorBulan === null ? row.tenorHari * HARI_MS : tenorBulan * BULAN_MS);

  return (
    <>
      <BarisDetail
        label="Nama lengkap"
        nilai={<span className="uppercase">{row.namaLengkap}</span>}
      />
      <BarisDetail label="Kode peminjam" nilai={row.kodePeminjam ?? "belum terbit"} />
      <BarisDetail label="No. referensi" nilai={row.nomorReferensi} />
      <BarisDetail label="Nominal diajukan" nilai={rupiah(row.pokokDiajukan ?? row.pokokPinjaman)} />
      <BarisDetail label={labelPokok(row.status)} nilai={rupiah(row.pokokPinjaman)} />
      {row.pokokDiajukan > row.pokokPinjaman && (
        <p className="text-xs leading-6 text-muted-foreground">
          Pokok tercatat lebih kecil dari pengajuan awal. Perhitungan menggunakan pokok tercatat;
          status persetujuan tidak berarti dana sudah ditransfer.
        </p>
      )}
      <BarisDetail
        label="Skema"
        nilai={row.tenorBulan === null ? "Harian" : `Bulanan ${row.tenorBulan} bulan`}
      />
      <BarisDetail
        label="Imbal Hasil (estimasi)"
        nilai={imbalHasil === null ? "—" : rupiah(imbalHasil)}
      />
      <BarisDetail
        label="Total pelunasan (estimasi)"
        nilai={totalPelunasan === null ? "—" : rupiah(totalPelunasan)}
      />
      <BarisDetail
        label="Potongan di muka"
        nilai={potongan === null ? "—" : rupiah(potongan)}
      />
      <BarisDetail
        label="Dana bersih diterima"
        nilai={danaBersih === null ? "—" : rupiah(danaBersih)}
      />
      <BarisDetail label="Bunga pinjaman" nilai={rupiah(row.bunga)} />
      <BarisDetail
        label={
          row.tenorBulan === null
            ? "Total kewajiban (pokok + bunga)"
            : "Total kewajiban (pokok + bunga + biaya cicilan)"
        }
        nilai={rupiah(row.totalLunas)}
      />
      <BarisDetail
        label="Potongan admin (dari uang yang kembali)"
        nilai={rupiah(row.potonganAdmin)}
      />
      <BarisDetail
        label="Keuntungan pendana (bersih)"
        nilai={row.pendana === null ? "—" : rupiah(row.keuntunganPendana)}
      />
      {/* `row.keuntunganAdmin` sengaja tidak ditampilkan lagi: pada model bagi
          hasil PINDAI ia selalu sama dengan `row.potonganAdmin` di atas
          (keuntungan admin = potongan admin atas uang yang kembali, yaitu
          pokok + Imbal Hasil), jadi menampilkan keduanya berarti satu angka
          muncul dua kali dengan label sama. */}
      <BarisDetail
        label="Tenor"
        nilai={row.tenorBulan === null ? `${row.tenorHari} hari` : `${row.tenorBulan} bulan`}
      />
      <BarisDetail
        label="Jatuh tempo"
        nilai={jatuhTempo === null ? "belum didanai" : tanggalRingkas(jatuhTempo)}
      />
      <BarisDetail label="Keperluan" nilai={row.tujuan} />
      <BarisDetail
        label="Pendana"
        nilai={row.pendana === null ? "belum tercatat" : <span className="uppercase">{row.pendana}</span>}
      />
      <BarisDetail label="Tanggal pengajuan" nilai={tanggalRingkas(row.diajukanPada)} />
      <BarisDetail label="Status" nilai={<StatusBadge status={row.status} kind="loan" />} />
    </>
  );
}

function DetailGadai({ row }: { row: BarisGadai }) {
  return (
    <>
      <BarisDetail
        label="Nama lengkap"
        nilai={<span className="uppercase">{row.namaLengkap}</span>}
      />
      <BarisDetail label="Kode peminjam" nilai={row.kodePeminjam ?? "belum terbit"} />
      <BarisDetail label="No. referensi" nilai={row.nomorReferensi} />
      <BarisDetail label="Kategori" nilai={row.kategori} />
      <BarisDetail label="Barang" nilai={row.deskripsiBarang} />
      <BarisDetail
        label="Nilai taksiran"
        nilai={row.nilaiTaksiran === null ? "belum ditaksir" : rupiah(row.nilaiTaksiran)}
      />
      <BarisDetail
        label="Pokok gadai disetujui"
        nilai={row.pokokGadai === null ? "—" : rupiah(row.pokokGadai)}
      />
      <BarisDetail
        label="Sewa modal"
        nilai={row.persenSewaModal === null ? "—" : `${row.persenSewaModal}% / 30 hari`}
      />
      <BarisDetail
        label="Sisa pokok berjalan"
        nilai={row.sisaPokok === null ? "—" : rupiah(row.sisaPokok)}
      />
      <BarisDetail label="Tanggal pengajuan" nilai={tanggalRingkas(row.diajukanPada)} />
      <BarisDetail label="Status" nilai={<StatusBadge status={row.status} kind="pawn" />} />
    </>
  );
}

function DetailKredit({ row }: { row: BarisKredit }) {
  const quote = coba(() =>
    quoteKreditBarang({
      hargaBarang: row.hargaBarang,
      dpPersen: row.dpPersen,
      tenorBulan: row.tenorBulan,
      marginPersenPerBulan: row.marginPersenPerBulan,
    }),
  );
  const jatuhTempo =
    row.didanaiPada === null ? null : row.didanaiPada + row.tenorBulan * BULAN_MS;

  return (
    <>
      <BarisDetail
        label="Nama lengkap"
        nilai={<span className="uppercase">{row.namaLengkap}</span>}
      />
      <BarisDetail label="Kode peminjam" nilai={row.kodePeminjam ?? "belum terbit"} />
      <BarisDetail label="No. referensi" nilai={row.nomorReferensi} />
      <BarisDetail label="Barang" nilai={`${row.namaBarang} · ${row.kategori}`} />
      <BarisDetail label="Merchant" nilai={row.merchant} />
      <BarisDetail label="Harga barang" nilai={rupiah(row.hargaBarang)} />
      <BarisDetail
        label="Uang muka"
        nilai={
          quote === null ? `${row.dpPersen}%` : `${row.dpPersen}% · ${rupiah(quote.dp)}`
        }
      />
      <BarisDetail
        label="Pokok dibiayai"
        nilai={quote === null ? "—" : rupiah(quote.pokokDibiayai)}
      />
      <BarisDetail
        label="Cicilan per bulan (estimasi)"
        nilai={quote === null ? "—" : rupiah(quote.cicilanPerBulan)}
      />
      <BarisDetail
        label="Total Imbal Hasil (estimasi)"
        nilai={quote === null ? "—" : rupiah(quote.marginTotal)}
      />
      <BarisDetail
        label="Total dibayar konsumen"
        nilai={quote === null ? "—" : rupiah(quote.totalDibayarKonsumen)}
      />
      <BarisDetail label="Tenor" nilai={`${row.tenorBulan} bulan`} />
      <BarisDetail
        label="Jatuh tempo"
        nilai={jatuhTempo === null ? "belum didanai" : tanggalRingkas(jatuhTempo)}
      />
      <BarisDetail
        label="Pendana"
        nilai={row.pendana === null ? "belum tercatat" : <span className="uppercase">{row.pendana}</span>}
      />
      <BarisDetail label="Tanggal pengajuan" nilai={tanggalRingkas(row.diajukanPada)} />
      <BarisDetail label="Status" nilai={<BadgeKredit status={row.status} />} />
    </>
  );
}

const LABEL_SUMBER: Record<string, string> = {
  web: "Perangkat (browser)",
  aplikasi: "Perangkat (aplikasi)",
  jejak: "Jejak terakhir",
  pengajuan: "Saat pengajuan dikirim",
};

/**
 * Titik lokasi terakhir peminjam pada dialog Detail: koordinat apa adanya,
 * umur titik, peta OpenStreetMap, dan penanda pola koordinat otomatis.
 */
function BagianLokasi({ lokasi, nama }: { lokasi: LokasiTitik | null; nama: string }) {
  const sekarang = useJamBerjalan();

  if (lokasi === null) {
    return (
      <section className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-4">
        <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
          <MapPin className="size-3.5" aria-hidden /> Lokasi terakhir
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Belum ada titik lokasi yang pernah dikirim perangkat peminjam ini.
        </p>
      </section>
    );
  }

  const peta = tautanPeta(lokasi.lat, lokasi.lng);
  return (
    <section className="mt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
          <MapPin className="size-3.5" aria-hidden /> Lokasi terakhir
        </p>
        <Badge className="border-0 bg-primary/10 text-accent-foreground">
          {labelUmur(lokasi.waktu, sekarang)}
        </Badge>
      </div>
      <div className="mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
        <iframe
          title={`Peta lokasi terakhir ${nama}`}
          src={peta.embed}
          loading="lazy"
          className="h-52 w-full border-0"
        />
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
          <dt className="text-muted-foreground">Koordinat</dt>
          <dd className="mt-0.5 font-mono tabular-nums">
            {lokasi.lat.toFixed(5)}, {lokasi.lng.toFixed(5)}
          </dd>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
          <dt className="text-muted-foreground">Akurasi dilaporkan</dt>
          <dd className="mt-0.5 tabular-nums">± {Math.round(lokasi.akurasi)} m</dd>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
          <dt className="text-muted-foreground">Sumber</dt>
          <dd className="mt-0.5">{LABEL_SUMBER[lokasi.sumber] ?? lokasi.sumber}</dd>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
          <dt className="text-muted-foreground">Diterima server</dt>
          <dd className="mt-0.5">
            {new Date(lokasi.waktu).toLocaleString("id-ID", {
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </dd>
        </div>
      </dl>
      {lokasi.tanda.length > 0 && (
        <p className="mt-2 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Sistem menandai pola koordinat ini secara otomatis — indikator, bukan bukti
          manipulasi. Buka peta untuk menilai sendiri.
        </p>
      )}
      <a
        href={peta.penuh}
        target="_blank"
        rel="noreferrer"
        className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
      >
        Buka peta lebih besar <ExternalLink className="size-3" aria-hidden />
      </a>
    </section>
  );
}

/**
 * Berkas pengajuan pada dialog Detail: KTP, selfie, slip, foto barang, dan
 * tanda tangan elektronik. Diminta hanya saat dialog dibuka.
 */
function BagianBerkas({
  jenis,
  id,
  boleh,
}: {
  jenis: IsiDetail["jenis"];
  id: string;
  /** Hanya akun penyedia dana beremail/admin — sesi kode bersama tidak. */
  boleh: boolean;
}) {
  // Query di-skip (bukan hanya disembunyikan) untuk sesi kode akses bersama:
  // server juga menolaknya, jadi tidak ada berkas yang pernah terkirim ke sana.
  const data = useQuery(
    api.penyediaDana.berkasPengajuan,
    boleh ? { jenis, id } : ("skip" as const),
  );

  return (
    <section className="mt-5 border-t border-slate-200 pt-4">
      <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
        <FileText className="size-3.5" aria-hidden /> Berkas pengajuan
      </p>
      {!boleh ? (
        <p className="mt-2 flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-muted-foreground">
          <Lock className="mt-0.5 size-3.5 shrink-0 text-slate-400" aria-hidden />
          Berkas identitas pemohon (KTP, selfie, slip) hanya dibuka untuk akun penyedia dana
          beremail yang ditunjuk admin. Sesi kode akses bersama dapat melihat angka pengajuan dan
          lokasi, tetapi tidak berkas pemohon.
        </p>
      ) : data === undefined ? (
        <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Memuat berkas…
        </p>
      ) : data === null ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Berkas pengajuan ini tidak ditemukan.
        </p>
      ) : (
        <>
          {data.catatan !== null && (
            <p className="mt-2 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-muted-foreground">
              {data.catatan}
            </p>
          )}
          {data.berkas.length > 0 && (
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              {data.berkas.map((b) => (
                <a
                  key={b.label}
                  href={b.url}
                  target="_blank"
                  rel="noreferrer"
                  className="group overflow-hidden rounded-2xl border border-slate-200 bg-white transition hover:border-primary/40"
                >
                  <img
                    src={b.url}
                    alt={`Berkas ${b.label}`}
                    className="h-32 w-full bg-slate-50 object-contain"
                  />
                  <span className="flex items-center justify-between gap-2 border-t border-slate-100 px-3 py-2 text-xs font-medium">
                    {b.label}
                    <ExternalLink
                      className="size-3 text-muted-foreground group-hover:text-primary"
                      aria-hidden
                    />
                  </span>
                </a>
              ))}
            </div>
          )}
          {data.tandaTangan !== null && (
            <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-3">
              <p className="text-xs text-muted-foreground">
                Tanda tangan elektronik peminjam
                {data.tandaTanganPada === null
                  ? ""
                  : ` · ${tanggalRingkas(data.tandaTanganPada)}`}
              </p>
              <img
                src={data.tandaTangan}
                alt="Tanda tangan elektronik peminjam"
                className="mt-2 h-24 w-full bg-slate-50 object-contain"
              />
            </div>
          )}
          <p className="mt-3 flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] leading-5 text-muted-foreground">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-amber-600" aria-hidden />
            Berkas memuat data pribadi peminjam (termasuk NIK pada KTP). Gunakan hanya untuk
            penilaian pendanaan dan jangan dibagikan ke luar tim.
          </p>
        </>
      )}
    </section>
  );
}

type IsiDetail =
  | { jenis: "pinjaman"; row: BarisPinjaman }
  | { jenis: "gadai"; row: BarisGadai }
  | { jenis: "kredit"; row: BarisKredit };

/**
 * Isi dialog Detail: angka pengajuan, titik lokasi terakhir, lalu berkas.
 * Dipisah sebagai komponen sendiri supaya query berkas hanya dibuat saat
 * dialog benar-benar terbuka (aturan hooks melarang pemanggilan bersyarat).
 */
function IsiDialog({ detail, bolehBerkas }: { detail: IsiDetail; bolehBerkas: boolean }) {
  return (
    <>
      <dl className="mt-1">
        {detail.jenis === "pinjaman" && <DetailPinjaman row={detail.row} />}
        {detail.jenis === "gadai" && <DetailGadai row={detail.row} />}
        {detail.jenis === "kredit" && <DetailKredit row={detail.row} />}
      </dl>
      <BagianLokasi lokasi={detail.row.lokasi} nama={detail.row.namaLengkap} />
      <BagianBerkas jenis={detail.jenis} id={detail.row._id} boleh={bolehBerkas} />
    </>
  );
}

/** Layar untuk akun yang belum diberi akses lihat saja. */
function AksesTerbatas() {
  return (
    <section className="animate-masuk mx-auto max-w-2xl rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-sm sm:p-10">
      <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
        <Lock className="size-5" />
      </span>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">
        Ruang penyedia dana bersifat terbatas
      </h1>
      <p className="mt-3 text-sm leading-7 text-muted-foreground">
        Akses lihat saja hanya diberikan admin PINDAI kepada akun tertentu. Akun Anda belum
        terdaftar; hubungi tim operasional bila Anda membutuhkan akses ini.
      </p>
      <p className="mx-auto mt-4 max-w-md rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-5 text-muted-foreground">
        <KeyRound className="mr-1.5 inline size-3.5 align-[-2px] text-primary" />
        Tim pemantau memakai <strong>kode akses bersama</strong> dari admin — masuk lewat
        halaman kode akses, bukan lewat akun email.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Button asChild>
          <Link to="/akses-bersama">Masuk dengan kode akses bersama</Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/dashboard">Buka dashboard Peminjam</Link>
        </Button>
        <Button asChild variant="ghost">
          <Link to="/">Kembali ke beranda</Link>
        </Button>
      </div>
    </section>
  );
}

/**
 * Batas error khusus ruang ini: bila salah satu query gagal (mis. sesi akses
 * lihat-saja sudah diputus admin sementara halaman masih terbuka), pengunjung
 * menerima pesan yang jelas beserta jalan keluarnya — bukan halaman kendala
 * sistem aplikasi.
 */
class BatasRuang extends Component<{ children: ReactNode }, { pesan: string | null }> {
  state: { pesan: string | null } = { pesan: null };

  static getDerivedStateFromError(error: Error) {
    return { pesan: error.message };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[PINDAI] Ruang penyedia dana gagal dibuka:", error, info.componentStack);
  }

  render() {
    if (this.state.pesan === null) return this.props.children;
    return <RuangGagal pesan={this.state.pesan} />;
  }
}

function RuangGagal({ pesan }: { pesan: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10 text-slate-900 sm:px-6">
      <section className="animate-masuk w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
          <Lock className="size-5" />
        </span>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">
          Ruang penyedia dana belum bisa dibuka
        </h1>
        <p className="mt-3 text-sm leading-7 text-muted-foreground">
          Sesi akses lihat-saja Anda mungkin sudah diputus admin atau kode akses bersama sudah
          diganti. Tidak ada data yang berubah — ruang ini hanya membaca. Minta kode terbaru dari
          admin lalu masuk lagi.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button onClick={() => window.location.reload()}>
            <RotateCcw className="mr-1.5 size-4" aria-hidden /> Muat ulang halaman
          </Button>
          <Button asChild variant="outline">
            <Link to="/akses-bersama">Masuk dengan kode akses bersama</Link>
          </Button>
          <Button asChild variant="ghost">
            <Link to="/">Kembali ke beranda</Link>
          </Button>
        </div>
        {import.meta.env.DEV && (
          <p className="mt-5 break-words rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-left font-mono text-[11px] text-slate-500">
            Detail teknis (mode pengembangan): {pesan}
          </p>
        )}
      </section>
    </main>
  );
}

/**
 * Isi tab pinjaman: kartu per peminjam di layar sempit, tabel penuh di layar
 * lebar. Dipakai bersama oleh tab "Pinjaman" (belum lunas) dan tab "Lunas"
 * supaya keduanya tampil identik tanpa menggandakan markup.
 */
function DaftarPinjaman({
  rows,
  persenBunga,
  sekarang,
  onDetail,
  onUbah,
}: {
  rows: BarisPinjaman[];
  persenBunga: number;
  sekarang: number;
  onDetail: (row: BarisPinjaman) => void;
  /** Hanya diisi untuk Super Admin (koreksi data pinjaman). */
  onUbah?: (row: BarisPinjaman) => void;
}) {
  return (
    <>
      {/* Layar sempit: kartu per peminjam — semua rincian tanpa geser mendatar. */}
      <div className="space-y-3 lg:hidden">
        {rows.map((row) => (
          <KartuPengajuan
            key={row._id}
            nama={capitalize(row.namaLengkap)}
            kode={row.kodePeminjam}
            nomorReferensi={row.nomorReferensi}
            status={<StatusBadge status={row.status} kind="loan" />}
            onDetail={() => onDetail(row)}
            onUbah={onUbah === undefined ? undefined : () => onUbah(row)}
          >
            <InfoKartu label="Nominal diajukan">
              {rupiah(row.pokokDiajukan ?? row.pokokPinjaman)}
            </InfoKartu>
            <InfoKartu label={labelPokok(row.status)}>{rupiah(row.pokokPinjaman)}</InfoKartu>
            <InfoKartu label={`Bunga ${persenBunga}%`}>{rupiah(row.bunga)}</InfoKartu>
            <InfoKartu label="Total lunas">{rupiah(row.totalLunas)}</InfoKartu>
            <InfoKartu label="Tenor">
              {row.tenorBulan === null ? `${row.tenorHari} hari` : `${row.tenorBulan} bulan`}
            </InfoKartu>
            <InfoKartu label="Tanggal">{tanggalRingkas(row.diajukanPada)}</InfoKartu>
            <InfoKartu label="Pendana">{row.pendana ?? "—"}</InfoKartu>
            <InfoKartu label="Keuntungan pendana">
              {row.pendana === null ? "—" : rupiah(row.keuntunganPendana)}
            </InfoKartu>
            <InfoKartu label="Potongan admin (dari uang kembali)">
              {row.pendana === null ? "—" : rupiah(row.potonganAdmin)}
            </InfoKartu>
            <InfoKartu label="Transfer keuntungan">
              {row.pendana === null ? (
                "—"
              ) : row.status !== "lunas" ? (
                <span className="text-muted-foreground">menunggu lunas</span>
              ) : (
                <BadgeTransferPendana ringkas={row.transfer} />
              )}
            </InfoKartu>
            <InfoKartu label="Lokasi">
              {row.lokasi === null ? "belum ada titik" : labelUmur(row.lokasi.waktu, sekarang)}
            </InfoKartu>
          </KartuPengajuan>
        ))}
      </div>
      <div className="hidden lg:block">
        <Tabel
          head={[
            "Peminjam",
            "Pengajuan & tenor",
            "Kewajiban & biaya",
            "Tanggal",
            "Status",
            "Pendana",
            "Lokasi",
            "Aksi",
          ]}
        >
          {rows.map((row) => (
            <TableRow key={row._id}>
              <SelPeminjam
                nama={capitalize(row.namaLengkap)}
                kode={row.kodePeminjam}
                referensi={row.nomorReferensi}
              />
              <TableCell className="align-top tabular-nums">
                <p className="font-semibold text-slate-900">{rupiah(row.pokokPinjaman)}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Diajukan {rupiah(row.pokokDiajukan ?? row.pokokPinjaman)} · {labelPokok(row.status)}
                </p>
                <p className="mt-1 text-[11px] text-slate-600">
                  {row.tenorBulan === null ? `${row.tenorHari} hari` : `${row.tenorBulan} bulan`}
                </p>
                {row.pokokDiajukan > row.pokokPinjaman && (
                  <Badge variant="outline" className="mt-2 text-[10px]">
                    Nominal dikurangi
                  </Badge>
                )}
              </TableCell>
              <TableCell className="align-top tabular-nums">
                <p className="font-medium text-slate-800">{rupiah(row.totalLunas)}</p>
                <p className="mt-1 text-[11px] text-emerald-700">
                  Bunga {persenBunga}% {rupiah(row.bunga)}
                </p>
                <p className="mt-1 text-[11px] text-amber-700">
                  Potongan admin (dari uang kembali){" "}
                  {row.pendana === null ? "—" : rupiah(row.potonganAdmin)}
                </p>
              </TableCell>
              <TableCell className="align-top text-slate-600">
                {tanggalRingkas(row.diajukanPada)}
              </TableCell>
              <TableCell className="align-top">
                <StatusBadge status={row.status} kind="loan" />
              </TableCell>
              <TableCell className="align-top">
                {row.pendana === null ? (
                  <span className="text-slate-400">—</span>
                ) : (
                  <>
                    <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-gold/40 bg-gold/10 px-2.5 py-1 text-[11px] font-medium uppercase text-gold-foreground">
                      <Wallet className="size-3 shrink-0" aria-hidden />
                      <span className="truncate">{row.pendana}</span>
                    </span>
                    <p className="mt-1 text-[11px] font-semibold text-emerald-700">
                      Untung {rupiah(row.keuntunganPendana)}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {row.status !== "lunas" ? (
                        "transfer menunggu lunas"
                      ) : (
                        <BadgeTransferPendana ringkas={row.transfer} />
                      )}
                    </p>
                  </>
                )}
              </TableCell>
              <SelLokasi lokasi={row.lokasi} sekarang={sekarang} />
              <TableCell className="align-top">
                <div className="flex flex-col gap-2">
                  <Button variant="outline" size="sm" onClick={() => onDetail(row)}>
                    <Eye className="mr-1.5 size-3.5" aria-hidden /> Detail
                  </Button>
                  {onUbah !== undefined && (
                    <Button variant="outline" size="sm" onClick={() => onUbah(row)}>
                      <Pencil className="mr-1.5 size-3.5" aria-hidden /> Ubah
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </Tabel>
      </div>
    </>
  );
}

/**
 * Koreksi data pinjaman — khusus Super Admin.
 *
 * Ruang penyedia dana tetap "lihat saja" untuk peran `dana` dan `pengamat`:
 * tombol Ubah tidak pernah muncul untuk mereka. Server tetap penjaga utama —
 * `ubahDataPinjaman` mewajibkan Super Admin dengan sesi TOTP terverifikasi,
 * alasan perubahan, dan menolak pinjaman yang sudah lunas.
 */
function DialogUbahPinjaman({
  row,
  onClose,
}: {
  row: BarisPinjaman | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={row !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Ubah data pinjaman</DialogTitle>
          <DialogDescription>
            Koreksi catatan internal PINDAI — termasuk menetapkan siapa pendananya. Tidak ada uang
            yang berpindah dan pencairan tetap di luar aplikasi; setiap perubahan wajib beralasan
            dan masuk audit trail.
          </DialogDescription>
        </DialogHeader>
        {row !== null && <FormUbahPinjaman key={row._id} row={row} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function FormUbahPinjaman({ row, onClose }: { row: BarisPinjaman; onClose: () => void }) {
  // Kandidat pendana = SEMUA akun yang pernah menjadi pendana (termasuk
  // pendana lama tanpa peran aktif), bukan hanya akun berperan `dana`.
  const kandidatQ = useQuery(api.penyediaDana.kandidatPendana, {});
  const simpan = useMutation(api.penyediaDana.ubahDataPinjaman);
  // Sentinel NON-kosong: Radix Select menolak `<SelectItem value="">`
  // (melempar saat dropdown dibuka), jadi "tidak diubah" memakai penanda sendiri.
  const TETAP = "__tetap";
  const LEPAS = "__lepas";
  const [pendana, setPendana] = useState(TETAP);
  const [tujuan, setTujuan] = useState(row.tujuan);
  const [tenorHari, setTenorHari] = useState(String(row.tenorHari));
  const [tenorBulan, setTenorBulan] = useState(
    row.tenorBulan === null ? "harian" : String(row.tenorBulan),
  );
  const [pokok, setPokok] = useState(String(row.pokokPinjaman));
  const [alasan, setAlasan] = useState("");
  const [busy, setBusy] = useState(false);

  const kandidat = kandidatQ?.rows ?? [];
  const nominalTerkunci = row.status === "didanai" || row.status === "lunas";
  const bolehLepas = !nominalTerkunci && row.didanaiPada === null;

  const kirim = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const catatan = alasan.trim();
    if (catatan.length < 5) {
      toast.error("Alasan perubahan wajib diisi (minimal 5 karakter).");
      return;
    }
    const tenorAwal = row.tenorBulan === null ? "harian" : String(row.tenorBulan);
    // Angka yang tidak valid tidak pernah dikirim: biarkan server menolak hanya
    // bila admin memang mengisi nilai, bukan saat kolomnya kosong.
    const hariBaru = Number(tenorHari);
    const pokokBaru = Number(pokok);
    setBusy(true);
    try {
      const hasil = await simpan({
        loanId: row._id,
        alasan: catatan,
        ...(pendana === TETAP
          ? {}
          : pendana === LEPAS
            ? { pendanaEmail: null }
            : { pendanaUserId: pendana as Id<"users"> }),
        ...(tujuan.trim() !== row.tujuan ? { tujuan: tujuan.trim() } : {}),
        ...(tenorBulan === "harian" &&
        Number.isFinite(hariBaru) &&
        hariBaru !== row.tenorHari
          ? { tenorHari: hariBaru }
          : {}),
        ...(tenorBulan !== tenorAwal
          ? { tenorBulan: tenorBulan === "harian" ? null : Number(tenorBulan) }
          : {}),
        ...(!nominalTerkunci && Number.isFinite(pokokBaru) && pokokBaru !== row.pokokPinjaman
          ? { pokokDisetujui: pokokBaru }
          : {}),
      });
      toast.success(
        hasil.perubahan.length === 0
          ? "Tidak ada perubahan yang disimpan."
          : `Tersimpan: ${hasil.perubahan.join(", ")}`,
      );
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menyimpan perubahan.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="space-y-4" onSubmit={kirim}>
      <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-xs leading-6 text-muted-foreground">
        <span className="font-medium uppercase text-slate-700">{capitalize(row.namaLengkap)}</span> ·{" "}
        <span className="font-mono">{row.nomorReferensi}</span>
        <br />
        Pokok tercatat {rupiah(row.pokokPinjaman)} · diajukan{" "}
        {rupiah(row.pokokDiajukan ?? row.pokokPinjaman)} · pendana sekarang{" "}
        {row.pendana ?? "belum ada"}
      </div>

      <div className="space-y-2">
        <Label htmlFor="ubah-pendana">Pendana</Label>
        <Select value={pendana} onValueChange={setPendana}>
          <SelectTrigger id="ubah-pendana" className="w-full">
            <SelectValue placeholder="Tidak diubah" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TETAP}>Tidak diubah</SelectItem>
            {kandidat.map((r) => (
              <SelectItem key={r.userId} value={r.userId}>
                {r.nama}
                {r.email ? ` — ${r.email}` : ""}
                {r.aksesAktif ? "" : " (pendana lama)"}
              </SelectItem>
            ))}
            <SelectItem value={LEPAS} disabled={!bolehLepas}>
              Lepas pendana (tanpa pemilik dana)
            </SelectItem>
          </SelectContent>
        </Select>
        <p className="text-[11px] leading-5 text-muted-foreground">
          {kandidatQ === undefined
            ? "Memuat daftar pendana… "
            : kandidat.length === 0
              ? "Belum ada akun yang pernah menjadi pendana. "
              : "Daftar ini berisi semua akun yang pernah menjadi pendana, termasuk pendana lama. "}
          {bolehLepas
            ? "Pinjaman ini belum ditandai tersalurkan, jadi pendananya boleh dilepas."
            : "Pendana tidak dapat dilepas setelah dana ditandai tersalurkan — pilih penggantinya."}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="ubah-tujuan">Tujuan pinjaman</Label>
        <Input
          id="ubah-tujuan"
          value={tujuan}
          onChange={(e) => setTujuan(e.target.value)}
          maxLength={500}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="ubah-tenor-bulan">Skema tenor</Label>
          <Select value={tenorBulan} onValueChange={setTenorBulan}>
            <SelectTrigger id="ubah-tenor-bulan" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="harian">Harian</SelectItem>
              {[1, 3, 6, 12, 24].map((bulan) => (
                <SelectItem key={bulan} value={String(bulan)}>
                  {bulan} bulan
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="ubah-tenor-hari">Tenor harian (hari)</Label>
          <Input
            id="ubah-tenor-hari"
            type="number"
            min={1}
            max={365}
            value={tenorHari}
            disabled={tenorBulan !== "harian"}
            onChange={(e) => setTenorHari(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="ubah-pokok">Pokok disetujui (Rp)</Label>
        <Input
          id="ubah-pokok"
          type="number"
          min={1}
          value={pokok}
          disabled={nominalTerkunci}
          onChange={(e) => setPokok(e.target.value)}
        />
        <p className="text-[11px] leading-5 text-muted-foreground">
          {nominalTerkunci
            ? "Nominal tidak dapat diubah: dana pinjaman ini sudah ditandai tersalurkan."
            : `Tidak boleh melebihi pengajuan ${rupiah(row.pokokDiajukan ?? row.pokokPinjaman)}.`}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="ubah-alasan">Alasan perubahan</Label>
        <Input
          id="ubah-alasan"
          value={alasan}
          onChange={(e) => setAlasan(e.target.value)}
          placeholder="mis. pinjaman didanai Asep, sebelumnya tercatat Robert"
          maxLength={500}
        />
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
          Batal
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : null}
          Simpan perubahan
        </Button>
      </div>
    </form>
  );
}

function IsiRuang() {
  const { user } = useAuth();
  const [tab, setTab] = useState("belum");
  const [detail, setDetail] = useState<IsiDetail | null>(null);
  const [ubah, setUbah] = useState<BarisPinjaman | null>(null);
  const sekarang = useJamBerjalan();

  const role = user?.role;
  // `pengamat` = sesi tamu yang diaktifkan kode akses bersama (lihat saja).
  const bolehLihat = role === "dana" || role === "admin" || role === "pengamat";
  // Berkas identitas pemohon lebih ketat: hanya akun beremail yang ditunjuk
  // admin (peran `dana`) atau admin sendiri. Sesi kode akses bersama tidak.
  const bolehBerkas = role === "dana" || role === "admin";
  // Query tidak dipanggil sebelum peran diketahui atau tanpa akses; server tetap
  // penjaga utama karena gerbangnya juga dijalankan di sisi Convex.
  const data = useQuery(
    api.penyediaDana.daftarPengajuan,
    user === undefined || !bolehLihat ? ("skip" as const) : {},
  );
  // Titik lokasi live hanya diminta saat tab peta benar-benar dibuka, supaya
  // pembacaan lokasi tidak ikut berjalan untuk pengunjung yang hanya melihat
  // tabel pengajuan.
  const titik = useQuery(
    api.penyediaDana.titikPeminjam,
    user === undefined || !bolehLihat || tab !== "lokasi" ? ("skip" as const) : {},
  );

  // Pinjaman dipisah supaya ruang kerja pendana jelas: pengajuan baru yang
  // BELUM didanai, posisi yang SUDAH didanai (berjalan), riwayat lunas, dan
  // pengajuan yang DITOLAK (tidak dilanjutkan) ke tab sendiri agar tidak
  // tercampur dengan antrean yang masih berjalan.
  //
  // Pemisahan utama memakai `status` (otoritatif) dan `didanaiPada` hanya
  // sebagai pelengkap data warisan. Ini penting karena sebagian baris lama
  // berstatus "didanai" (Target tercapai) tapi `didanaiPada`-nya kosong — kalau
  // hanya mengandalkan `didanaiPada`, baris itu salah nyelip ke "Belum didanai".
  const pinjamanDitolak = data?.pinjaman.filter((r) => r.status === "ditolak") ?? [];
  const pinjamanBaru =
    data?.pinjaman.filter(
      (r) =>
        r.didanaiPada === null &&
        r.status !== "lunas" &&
        r.status !== "ditolak" &&
        r.status !== "didanai",
    ) ?? [];
  const pinjamanDidanai =
    data?.pinjaman.filter(
      (r) =>
        r.status !== "lunas" &&
        r.status !== "ditolak" &&
        (r.status === "didanai" || r.didanaiPada !== null),
    ) ?? [];
  const pinjamanLunas = data?.pinjaman.filter((r) => r.status === "lunas") ?? [];

  return (
    <div className="flex min-h-screen flex-col overflow-x-clip bg-slate-50 text-slate-900">
      <header className="animate-masuk border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link to="/dashboard" className="flex shrink-0 items-center gap-2.5">
            <VaultLogo size={32} className="size-8 shrink-0" />
            <span className="hidden text-sm font-semibold tracking-[0.14em] sm:block">PINDAI</span>
          </Link>
          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground sm:inline-flex">
              <Eye className="size-3" />
              {role === "pengamat"
                ? "Pemantau akun bersama · lihat saja"
                : role === "admin"
                  ? "Super Admin · dapat mengoreksi data"
                  : "Ruang penyedia dana · lihat saja"}
            </span>
            <RoleDashboardMenu />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-9">
        {user !== undefined && !bolehLihat ? (
          <AksesTerbatas />
        ) : data === undefined ? (
          <p className="flex items-center justify-center gap-2 py-24 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Memuat catatan pengajuan…
          </p>
        ) : (
          <>
            <section className="animate-masuk rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="border-0 bg-primary/10 text-accent-foreground">
                  <Eye className="mr-1 size-3" />{" "}
                  {role === "admin" ? "Akses Super Admin · dapat mengoreksi" : "Akses lihat saja"}
                </Badge>
                <Badge variant="outline" className="border-slate-200 text-muted-foreground">
                  {bolehBerkas
                    ? "Berkas & lokasi terakhir ditampilkan"
                    : "Angka pengajuan & lokasi · berkas khusus akun email"}
                </Badge>
              </div>
              <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
                Pengajuan Peminjam
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">
                Catatan internal PINDAI untuk pinjaman tunai, gadai, dan kredit barang. Tidak ada
                tindakan alokasi maupun pencairan dari ruang ini
                {role === "admin"
                  ? "; sebagai Super Admin Anda dapat mengoreksi data pinjaman (termasuk menetapkan pendananya) lewat tombol Ubah — setiap perubahan wajib beralasan dan tercatat di audit trail."
                  : ": Anda hanya dapat membaca catatan ini."}{" "}
                Tombol <strong>Detail</strong> membuka titik lokasi terakhir peminjam
                {bolehBerkas
                  ? ", berkas pengajuan (KTP, selfie, slip, foto barang, tanda tangan),"
                  : " — berkas identitas pemohon hanya dibuka untuk akun penyedia dana beremail, bukan untuk sesi kode akses bersama."}{" "}
                NIK, nomor rekening, nomor WhatsApp, dan alamat tidak dikirim sebagai kolom terpisah
                {bolehBerkas ? " — NIK tetap terbaca pada gambar KTP yang Anda buka." : "."}
              </p>
            </section>

            <div className="animate-masuk mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <KartuRingkasan
                label="Pinjaman tunai"
                nilai={rupiah(data.ringkasan.nilaiPinjaman)}
                detail={`${data.ringkasan.jumlahPinjaman} pengajuan · pokok tercatat, semua status`}
                icon={<Wallet className="size-4" />}
              />
              <KartuRingkasan
                label="Gadai barang"
                nilai={rupiah(data.ringkasan.nilaiGadai)}
                detail={`${data.ringkasan.jumlahGadai} pengajuan · nilai taksiran tercatat`}
                icon={<Package className="size-4" />}
              />
              <KartuRingkasan
                label="Kredit barang"
                nilai={rupiah(data.ringkasan.nilaiKredit)}
                detail={`${data.ringkasan.jumlahKredit} pengajuan · harga barang`}
                icon={<ShoppingBag className="size-4" />}
              />
              <KartuRingkasan
                label="Menunggu review"
                nilai={String(data.ringkasan.menungguReview)}
                detail="status diajukan / sedang ditinjau"
                icon={<Timer className="size-4" />}
              />
            </div>

            <CatatanPotonganAdmin persen={data.ringkasan.persenPotonganAdmin} />

            {data.rekapPendana.length > 0 && (
              <section className="animate-masuk mt-6">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-lg font-semibold tracking-tight">
                    Rekap Dana Penyedia
                  </h2>
                  <p className="text-xs font-medium tabular-nums text-muted-foreground">
                    Keuntungan pendana {rupiah(data.ringkasan.totalKeuntunganPendana)} · potongan
                    admin {rupiah(data.ringkasan.totalKeuntunganAdmin)}
                    {data.ringkasan.totalTransferBelumDicatat > 0 && (
                      <>
                        {" · "}
                        <span className="text-amber-700">
                          {data.ringkasan.totalTransferBelumDicatat} transfer keuntungan belum dicatat
                          ({rupiah(data.ringkasan.nilaiTransferBelumDicatat)})
                        </span>
                      </>
                    )}
                  </p>
                </div>
                <p className="mt-1 max-w-3xl text-xs leading-6 text-muted-foreground">
                  Model <strong>1 pinjaman = 1 pendana</strong>. Bunga {data.ringkasan.persenBunga}%
                  dari pokok; admin mengambil {data.ringkasan.persenPotonganAdmin}% dari uang yang
                  kembali (pokok + Imbal Hasil), bukan dari Imbal Hasil saja. Pokok tetap kembali
                  utuh ke penyedia dana — yang terpotong adalah keuntungannya. Angka di bawah
                  dihitung dari pinjaman yang berjalan dan lunas.
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {data.rekapPendana.map((r) => (
                    <KartuPendana key={r.nama} r={r} />
                  ))}
                </div>
              </section>
            )}

            <Tabs value={tab} onValueChange={setTab} className="animate-masuk mt-6">
              <TabsList
                aria-label="Kategori pengajuan"
                className="h-auto w-full flex-wrap justify-start gap-1 rounded-2xl border border-slate-200 bg-white p-1.5"
              >
                <TabsTrigger
                  value="belum"
                  className="group h-9 flex-none gap-2 rounded-xl px-3 text-xs font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  <Timer className="size-3.5" /> Belum didanai
                  <span className="tabular-nums text-muted-foreground group-data-[state=active]:text-primary-foreground">
                    {pinjamanBaru.length}
                  </span>
                </TabsTrigger>
                <TabsTrigger
                  value="didanai"
                  className="group h-9 flex-none gap-2 rounded-xl px-3 text-xs font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  <HandCoins className="size-3.5" /> Sudah didanai
                  <span className="tabular-nums text-muted-foreground group-data-[state=active]:text-primary-foreground">
                    {pinjamanDidanai.length}
                  </span>
                </TabsTrigger>
                <TabsTrigger
                  value="lunas"
                  className="group h-9 flex-none gap-2 rounded-xl px-3 text-xs font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  <BadgeCheck className="size-3.5" /> Lunas
                  <span className="tabular-nums text-muted-foreground group-data-[state=active]:text-primary-foreground">
                    {pinjamanLunas.length}
                  </span>
                </TabsTrigger>
                <TabsTrigger
                  value="ditolak"
                  className="group h-9 flex-none gap-2 rounded-xl px-3 text-xs font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  <XCircle className="size-3.5" /> Ditolak
                  <span className="tabular-nums text-muted-foreground group-data-[state=active]:text-primary-foreground">
                    {pinjamanDitolak.length}
                  </span>
                </TabsTrigger>
                <TabsTrigger
                  value="gadai"
                  className="group h-9 flex-none gap-2 rounded-xl px-3 text-xs font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  <Package className="size-3.5" /> Gadai
                  <span className="tabular-nums text-muted-foreground group-data-[state=active]:text-primary-foreground">
                    {data.ringkasan.jumlahGadai}
                  </span>
                </TabsTrigger>
                <TabsTrigger
                  value="kredit"
                  className="group h-9 flex-none gap-2 rounded-xl px-3 text-xs font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  <ShoppingBag className="size-3.5" /> Kredit Barang
                  <span className="tabular-nums text-muted-foreground group-data-[state=active]:text-primary-foreground">
                    {data.ringkasan.jumlahKredit}
                  </span>
                </TabsTrigger>
                <TabsTrigger
                  value="lokasi"
                  className="group h-9 flex-none gap-2 rounded-xl px-3 text-xs font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  <MapPin className="size-3.5" /> Lokasi live
                  {titik !== undefined && (
                    <span className="tabular-nums text-muted-foreground group-data-[state=active]:text-primary-foreground">
                      {titik.jumlahTitik}
                    </span>
                  )}
                </TabsTrigger>
              </TabsList>

              {/* ===== Pinjaman baru: belum didanai ===== */}
              <TabsContent value="belum" className="mt-4">
                {pinjamanBaru.length === 0 ? (
                  <KeadaanKosong pesan="Belum ada pengajuan pinjaman baru yang menunggu didanai." />
                ) : (
                  <>
                    <p className="mb-3 rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-xs leading-6 text-amber-900">
                      Pinjaman pada tab ini <strong>belum didanai</strong> — dana belum dialokasikan.
                      Alokasi pendanaan dilakukan dari panel admin.
                    </p>
                    <DaftarPinjaman
                      rows={pinjamanBaru}
                      persenBunga={data.ringkasan.persenBunga}
                      sekarang={sekarang}
                      onDetail={(row) => setDetail({ jenis: "pinjaman", row })}
                      onUbah={role === "admin" ? (row) => setUbah(row) : undefined}
                    />
                    <CatatanTerpotong
                      terpotong={data.terpotong.pinjaman}
                      batas={data.batas}
                    />
                  </>
                )}
              </TabsContent>

              {/* ===== Pinjaman sudah didanai (berjalan, belum lunas) ===== */}
              <TabsContent value="didanai" className="mt-4">
                {pinjamanDidanai.length === 0 ? (
                  <KeadaanKosong pesan="Belum ada pinjaman yang sudah didanai dan masih berjalan." />
                ) : (
                  <>
                    <p className="mb-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-xs leading-6 text-emerald-900">
                      Pinjaman pada tab ini <strong>sudah didanai</strong> dan masih berjalan. Angka
                      keuntungan di bawah adalah perhitungan atas kewajiban berjalan, bukan bukti
                      mutasi.
                    </p>
                    <DaftarPinjaman
                      rows={pinjamanDidanai}
                      persenBunga={data.ringkasan.persenBunga}
                      sekarang={sekarang}
                      onDetail={(row) => setDetail({ jenis: "pinjaman", row })}
                      onUbah={role === "admin" ? (row) => setUbah(row) : undefined}
                    />
                    <CatatanTerpotong
                      terpotong={data.terpotong.pinjaman}
                      batas={data.batas}
                    />
                  </>
                )}
              </TabsContent>

              {/* ===== Pinjaman lunas (dipisah ke tab sendiri) ===== */}
              <TabsContent value="lunas" className="mt-4">
                {pinjamanLunas.length === 0 ? (
                  <KeadaanKosong pesan="Belum ada pinjaman tunai yang berstatus lunas." />
                ) : (
                  <>
                    <p className="mb-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-xs leading-6 text-emerald-900">
                      Pinjaman pada tab ini sudah berstatus <strong>lunas</strong> pada ledger
                      internal. Angka keuntungan pendana dan potongan admin di bawah adalah hasil
                      perhitungan atas kewajiban yang sudah terbayar penuh — potongan diambil dari
                      uang yang kembali (pokok + Imbal Hasil), bukan dari Imbal Hasil saja — bukan
                      bukti mutasi.
                    </p>
                    <DaftarPinjaman
                      rows={pinjamanLunas}
                      persenBunga={data.ringkasan.persenBunga}
                      sekarang={sekarang}
                      onDetail={(row) => setDetail({ jenis: "pinjaman", row })}
                      onUbah={role === "admin" ? (row) => setUbah(row) : undefined}
                    />
                    <CatatanTerpotong
                      terpotong={data.terpotong.pinjaman}
                      batas={data.batas}
                    />
                  </>
                )}
              </TabsContent>

              {/* ===== Pinjaman ditolak (dipisah dari antrean berjalan) ===== */}
              <TabsContent value="ditolak" className="mt-4">
                {pinjamanDitolak.length === 0 ? (
                  <KeadaanKosong pesan="Tidak ada pengajuan pinjaman yang ditolak." />
                ) : (
                  <>
                    <p className="mb-3 rounded-2xl border border-red-200 bg-red-50/70 px-4 py-3 text-xs leading-6 text-red-900">
                      Pinjaman pada tab ini berstatus <strong>ditolak internal</strong> — tidak
                      dilanjutkan dalam alur aplikasi dan tidak memerlukan alokasi dana. Tetap
                      ditampilkan sebagai catatan riwayat.
                    </p>
                    <DaftarPinjaman
                      rows={pinjamanDitolak}
                      persenBunga={data.ringkasan.persenBunga}
                      sekarang={sekarang}
                      onDetail={(row) => setDetail({ jenis: "pinjaman", row })}
                      onUbah={role === "admin" ? (row) => setUbah(row) : undefined}
                    />
                    <CatatanTerpotong
                      terpotong={data.terpotong.pinjaman}
                      batas={data.batas}
                    />
                  </>
                )}
              </TabsContent>

              {/* ===== Gadai ===== */}
              <TabsContent value="gadai" className="mt-4">
                {data.gadai.length === 0 ? (
                  <KeadaanKosong pesan="Belum ada pengajuan gadai yang tercatat." />
                ) : (
                  <>
                    <div className="space-y-3 lg:hidden">
                      {data.gadai.map((row) => (
                        <KartuPengajuan
                          key={row._id}
                          nama={capitalize(row.namaLengkap)}
                          kode={row.kodePeminjam}
                          nomorReferensi={row.nomorReferensi}
                          status={<StatusBadge status={row.status} kind="pawn" />}
                          onDetail={() => setDetail({ jenis: "gadai", row })}
                        >
                          <InfoKartu label="Barang">
                            <span className="block">{row.deskripsiBarang}</span>
                            <span className="mt-0.5 block text-xs font-normal text-slate-500">
                              {row.kategori}
                            </span>
                          </InfoKartu>
                          <InfoKartu label="Taksiran">
                            {row.nilaiTaksiran === null
                              ? "belum ditaksir"
                              : rupiah(row.nilaiTaksiran)}
                          </InfoKartu>
                          <InfoKartu label="Tanggal">{tanggalRingkas(row.diajukanPada)}</InfoKartu>
                          <InfoKartu label="Lokasi">
                            {row.lokasi === null
                              ? "belum ada titik"
                              : labelUmur(row.lokasi.waktu, sekarang)}
                          </InfoKartu>
                        </KartuPengajuan>
                      ))}
                    </div>
                    <div className="hidden lg:block">
                      <Tabel
                      head={[
                        "Peminjam",
                        "Barang",
                        "Taksiran",
                        "Tanggal",
                        "Status",
                        "Lokasi",
                        "Aksi",
                      ]}
                    >
                      {data.gadai.map((row) => (
                        <TableRow key={row._id}>
                          <SelPeminjam
                            nama={capitalize(row.namaLengkap)}
                            kode={row.kodePeminjam}
                            referensi={row.nomorReferensi}
                          />
                          <TableCell className="align-top">
                            <p className="text-slate-900">{row.deskripsiBarang}</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">{row.kategori}</p>
                          </TableCell>
                          <TableCell className="align-top font-semibold tabular-nums">
                            {row.nilaiTaksiran === null
                              ? "belum ditaksir"
                              : rupiah(row.nilaiTaksiran)}
                          </TableCell>
                          <TableCell className="align-top text-slate-600">
                            {tanggalRingkas(row.diajukanPada)}
                          </TableCell>
                          <TableCell className="align-top">
                            <StatusBadge status={row.status} kind="pawn" />
                          </TableCell>
                          <SelLokasi lokasi={row.lokasi} sekarang={sekarang} />
                          <TableCell className="align-top">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setDetail({ jenis: "gadai", row })}
                            >
                              <Eye className="mr-1.5 size-3.5" aria-hidden /> Detail
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </Tabel>
                    </div>
                    <CatatanTerpotong terpotong={data.terpotong.gadai} batas={data.batas} />
                  </>
                )}
              </TabsContent>

              {/* ===== Kredit barang ===== */}
              <TabsContent value="kredit" className="mt-4">
                {data.kredit.length === 0 ? (
                  <KeadaanKosong pesan="Belum ada pengajuan kredit barang yang tercatat." />
                ) : (
                  <>
                    <div className="space-y-3 lg:hidden">
                      {data.kredit.map((row) => (
                        <KartuPengajuan
                          key={row._id}
                          nama={capitalize(row.namaLengkap)}
                          kode={row.kodePeminjam}
                          nomorReferensi={row.nomorReferensi}
                          status={<BadgeKredit status={row.status} />}
                          onDetail={() => setDetail({ jenis: "kredit", row })}
                        >
                          <InfoKartu label="Barang">
                            <span className="block">{row.namaBarang}</span>
                            <span className="mt-0.5 block text-xs font-normal text-slate-500">
                              {row.kategori} · {row.merchant}
                            </span>
                          </InfoKartu>
                          <InfoKartu label="Harga">{rupiah(row.hargaBarang)}</InfoKartu>
                          <InfoKartu label="Tenor">{row.tenorBulan} bulan</InfoKartu>
                          <InfoKartu label="Tanggal">{tanggalRingkas(row.diajukanPada)}</InfoKartu>
                          <InfoKartu label="Pendana">{row.pendana ?? "—"}</InfoKartu>
                          <InfoKartu label="Lokasi">
                            {row.lokasi === null
                              ? "belum ada titik"
                              : labelUmur(row.lokasi.waktu, sekarang)}
                          </InfoKartu>
                        </KartuPengajuan>
                      ))}
                    </div>
                    <div className="hidden lg:block">
                      <Tabel
                      head={[
                        "Peminjam",
                        "Barang",
                        "Harga & tenor",
                        "Tanggal",
                        "Status",
                        "Pendana",
                        "Lokasi",
                        "Aksi",
                      ]}
                    >
                      {data.kredit.map((row) => (
                        <TableRow key={row._id}>
                          <SelPeminjam
                            nama={capitalize(row.namaLengkap)}
                            kode={row.kodePeminjam}
                            referensi={row.nomorReferensi}
                          />
                          <TableCell className="align-top">
                            <p className="text-slate-900">{row.namaBarang}</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {row.kategori} · {row.merchant}
                            </p>
                          </TableCell>
                          <TableCell className="align-top tabular-nums">
                            <p className="font-semibold text-slate-900">{rupiah(row.hargaBarang)}</p>
                            <p className="mt-1 text-[11px] text-slate-600">
                              {row.tenorBulan} bulan · DP {row.dpPersen}%
                            </p>
                          </TableCell>
                          <TableCell className="align-top text-slate-600">
                            {tanggalRingkas(row.diajukanPada)}
                          </TableCell>
                          <TableCell className="align-top">
                            <BadgeKredit status={row.status} />
                          </TableCell>
                          <SelPendana pendana={row.pendana} />
                          <SelLokasi lokasi={row.lokasi} sekarang={sekarang} />
                          <TableCell className="align-top">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setDetail({ jenis: "kredit", row })}
                            >
                              <Eye className="mr-1.5 size-3.5" aria-hidden /> Detail
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </Tabel>
                    </div>
                    <CatatanTerpotong terpotong={data.terpotong.kredit} batas={data.batas} />
                  </>
                )}
              </TabsContent>

              {/* ===== Lokasi live ===== */}
              <TabsContent value="lokasi" className="mt-4 space-y-4">
                {titik === undefined ? (
                  <p className="flex items-center justify-center gap-2 py-24 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" /> Memuat titik lokasi…
                  </p>
                ) : (
                  <>
                    <div className="animate-masuk rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className="border-0 bg-primary/10 text-accent-foreground">
                          <MapPin className="mr-1 size-3" /> {titik.jumlahTitik} titik terakhir
                        </Badge>
                        <Badge
                          variant="outline"
                          className="border-slate-200 text-muted-foreground"
                        >
                          {titik.tanpaTitik} peminjam belum pernah mengirim titik
                        </Badge>
                        {titik.terpotong && (
                          <Badge
                            variant="outline"
                            className="border-slate-200 text-muted-foreground"
                          >
                            menampilkan {titik.batas} pengajuan terbaru per kategori
                          </Badge>
                        )}
                      </div>
                      <p className="mt-3 max-w-3xl text-xs leading-6 text-muted-foreground">
                        Peta ini memakai koordinat yang <strong>dilaporkan perangkat peminjam</strong>
                        . Titik diperbarui otomatis selama dashboard peminjam terbuka (±60 detik);
                        pelacakan saat aplikasi ditutup memerlukan aplikasi native, sehingga label
                        umur di bawah selalu menunjukkan kapan titik terakhir benar-benar diterima.
                      </p>
                    </div>

                    <PetaLokasiPeminjam rows={titik.rows} vault={titik.vault} />

                    {titik.rows.length === 0 ? (
                      <KeadaanKosong pesan="Belum ada titik lokasi yang terkirim dari perangkat peminjam. Titik muncul setelah peminjam membuka dashboard dengan GPS aktif." />
                    ) : (
                      <ul className="animate-masuk divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white">
                        {[...titik.rows]
                          .sort((a, b) => b.posisi.waktu - a.posisi.waktu)
                          .map((r) => (
                            <li
                              key={r.userId}
                              className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-5"
                            >
                              <span className="min-w-0">
                                <span className="flex flex-wrap items-center gap-2">
                                  <span className="font-medium uppercase text-slate-900">
                                    {capitalize(r.namaLengkap)}
                                  </span>
                                  <BadgePseudonim kode={r.kodePeminjam} />
                                  {r.posisi.tanda.length > 0 && (
                                    <Badge className="border-0 bg-amber-100 text-amber-800 hover:bg-amber-100">
                                      pola koordinat ditandai
                                    </Badge>
                                  )}
                                </span>
                                <span className="mt-1 flex flex-wrap items-center gap-2">
                                  <span className="font-mono text-[11px] text-slate-500">
                                    {r.nomorReferensi}
                                  </span>
                                  {r.kategori === "pinjaman" ? (
                                    <StatusBadge status={r.status} kind="loan" />
                                  ) : r.kategori === "gadai" ? (
                                    <StatusBadge status={r.status} kind="pawn" />
                                  ) : (
                                    <BadgeKredit status={r.status} />
                                  )}
                                </span>
                              </span>
                              <span className="shrink-0 text-left text-xs text-muted-foreground sm:text-right">
                                <span className="block font-medium text-slate-700">
                                  {labelUmur(r.posisi.waktu, sekarang)}
                                </span>
                                <span className="block font-mono tabular-nums">
                                  {r.posisi.lat.toFixed(5)}, {r.posisi.lng.toFixed(5)}
                                </span>
                                <span className="block">
                                  ± {Math.round(r.posisi.akurasi)} m ·{" "}
                                  {LABEL_SUMBER[r.posisi.sumber] ?? r.posisi.sumber}
                                </span>
                              </span>
                            </li>
                          ))}
                      </ul>
                    )}
                  </>
                )}
              </TabsContent>
            </Tabs>

            <p className="mt-6 rounded-2xl border border-slate-200 bg-white px-5 py-4 text-xs leading-6 text-muted-foreground">
              Angka di ruang ini adalah catatan internal PINDAI dan bukan bukti transaksi, jaminan
              pencairan, maupun penawaran. Status mengikuti pencatatan ledger internal. Jaminan
              asuransi 14 hari kerja pada potongan admin adalah komitmen layanan PINDAI — berlaku
              terpisah dari angka yang ditampilkan di layar ini.
            </p>
          </>
        )}
      </main>

      <Dialog open={detail !== null} onOpenChange={(open) => (open ? undefined : setDetail(null))}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {detail?.jenis === "pinjaman"
                ? "Detail pinjaman tunai"
                : detail?.jenis === "gadai"
                  ? "Detail gadai"
                  : "Detail kredit barang"}
            </DialogTitle>
            <DialogDescription>
              Catatan internal PINDAI — ruang lihat saja. Titik lokasi terakhir peminjam selalu
              ditampilkan
              {bolehBerkas
                ? "; berkas pengajuan ditampilkan untuk akun penyedia dana beremail."
                : "; berkas pengajuan hanya dibuka untuk akun penyedia dana beremail, bukan sesi kode akses bersama."}{" "}
              NIK, nomor rekening, nomor WhatsApp, dan alamat tidak dikirim sebagai kolom terpisah.
            </DialogDescription>
          </DialogHeader>
          {detail !== null && <IsiDialog detail={detail} bolehBerkas={bolehBerkas} />}
        </DialogContent>
      </Dialog>

      {/* Koreksi data pinjaman — hanya Super Admin yang dapat membukanya. */}
      {role === "admin" && (
        <DialogUbahPinjaman row={ubah} onClose={() => setUbah(null)} />
      )}

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-5 text-xs text-muted-foreground sm:px-6">
          <span>PINDAI · ruang penyedia dana (lihat saja)</span>
          <Link to="/dashboard" className="hover:text-slate-900">
            Dashboard Peminjam
          </Link>
        </div>
      </footer>
    </div>
  );
}

export default function PenyediaDana() {
  return (
    <BatasRuang>
      <IsiRuang />
    </BatasRuang>
  );
}
