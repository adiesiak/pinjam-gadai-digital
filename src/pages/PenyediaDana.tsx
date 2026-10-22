import { useAction, useMutation, useQuery } from "convex/react";
import {
  ArrowLeftRight,
  BadgeCheck,
  Coins,
  Eye,
  ExternalLink,
  FileText,
  KeyRound,
  Loader2,
  Lock,
  HandCoins,
  MapPin,
  MoreHorizontal,
  Package,
  Pencil,
  ShoppingBag,
  RotateCcw,
  Tag,
  UserRound,
  Timer,
  TriangleAlert,
  Wallet,
  XCircle,
} from "lucide-react";
import { Component, useState, type ReactNode } from "react";
import { Link } from "react-router";

import { NotificationBell } from "@/components/notifications/NotificationBell";
import { HAK_CIPTA_PINDAI, PENAFIAN_PINDAI } from "@/lib/branding";
import { RoleDashboardMenu } from "@/components/RoleDashboardMenu";
import { kunciNama, namaHurufBesar, namaRuangan } from "@/lib/nama";
import { VaultLogo } from "@/components/VaultLogo";
import {
  BadgeKepercayaan,
  TampilanJatuhTempo,
  TampilanJatuhTempoRingkas,
} from "@/components/penyediaDana/BadgeKepercayaan";
import {
  PengingatJatuhTempoPendana,
  type BarisPengingatPendana,
} from "@/components/PaymentDueAlert";
import { AturanPerhitungan } from "@/components/penyediaDana/AturanPerhitungan";
import { ChipSkorRisiko } from "@/components/penyediaDana/ChipSkorRisiko";
import { IstilahBantuan } from "@/components/penyediaDana/IstilahBantuan";
import {
  KesehatanPortofolio,
  type AngkaKesehatanPortofolio,
} from "@/components/penyediaDana/KesehatanPortofolio";
import {
  BannerRisikoPendanaan,
  PanelRisikoPendanaan,
} from "@/components/penyediaDana/RisikoPendanaan";
import {
  ANCHOR_RISIKO_PENDANAAN,
  CATATAN_INTERNAL_SINGKAT,
} from "@/lib/teksRisikoPendanaan";
import { PetaLokasiPeminjam } from "@/components/penyediaDana/PetaLokasiPeminjam";
import { KontakLaporanWhatsapp } from "@/components/penyediaDana/KontakLaporanWhatsapp";
import { RekapPendanaUnduhan } from "@/components/penyediaDana/RekapPendanaUnduhan";
import { RingkasanKeuntungan } from "@/components/penyediaDana/RingkasanKeuntungan";
import { DoorprizeWidget } from "@/components/DoorprizeWidget";
import {
  KalkulatorImbalPendana,
  PortofolioPendanaanSection,
} from "@/components/penyediaDana/KalkulatorImbalPendana";
import { SaringanPengajuan } from "@/components/penyediaDana/SaringanPengajuan";
import { PortofolioPendana } from "@/components/penyediaDana/PortofolioPendana";
import { TabelPendana } from "@/components/penyediaDana/TabelPendana";
import { LaporanTransferPendana } from "@/components/penyediaDana/LaporanTransferPendana";
import {
  DialogBatalkanKeuntungan,
  DialogCatatKeuntungan,
  type TargetKeuntungan,
} from "@/components/penyediaDana/DialogKeuntunganPendana";
import { KepalaFolio } from "@/components/penyediaDana/bagian-folio";
import { FOLIO, nomorFolio } from "@/components/penyediaDana/folio";
import { PersetujuanRisikoPendana } from "@/components/penyediaDana/PersetujuanRisikoPendana";
import { StatusBadge } from "@/components/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { KerangkaRuangPendana, MemuatBaris } from "@/components/ui/loading";
import { TableCell, TableRow } from "@/components/ui/table";
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
import {
  keStatusTersimpan,
  labelStatusPinjaman,
  LABEL_STATUS_PINJAMAN,
  STATUS_PINJAMAN,
  type StatusPinjaman,
} from "@/lib/statusPinjaman";
import type { RincianPerkiraan } from "@/lib/tabelPendana";
import { aksiKeuntunganPinjaman } from "@/lib/transferPendana";
import type {
  BarisGadai,
  BarisKredit,
  BarisPinjaman,
  LokasiTitik,
} from "@/convex/penyediaDana";
import { useAuth } from "@/hooks/use-auth";
import { quoteKreditBarang } from "@/lib/kredit";
import {
  BULAN_MS,
  PINDAI_PRICING,
  quotePinjaman,
  simulasiBulananPinjaman,
} from "@/lib/loan";
import { batasPelunasan, ringkasJatuhTempo } from "@/lib/jatuhTempo";
import { laporanPortofolio, namaBerkasPortofolio } from "@/lib/laporanPendana";
import { susunPdf } from "@/lib/pdfSederhana";
import { unduhLewatAplikasi } from "@/lib/jembatanAndroid";
import {
  adaFilter,
  daftarPendana,
  FILTER_PENGAJUAN_KOSONG,
  saringNama,
  saringPengajuan,
  type FilterPengajuan,
} from "@/lib/saringanPengajuan";
import {
  BadgeKredit,
  BadgePseudonim,
  BadgeTransferPendana,
  BarisAngka,
  CatatanTab,
  CatatanTerpotong,
  InfoKartu,
  KartuRingkasan,
  KeadaanKosong,
  KeadaanKosongDaftar,
  SelLokasi,
  SelPeminjam,
  SelPendana,
  Tabel,
} from "@/pages/penyedia-dana/bagian-umum";
import {
  coba,
  labelUmur,
  rupiah,
  tanggalRingkas,
  tautanPeta,
  useJamBerjalan,
} from "@/pages/penyedia-dana/format";

/**
 * Ruang Pendana — HANYA BACA.
 *
 * Menampilkan catatan pengajuan Peminjam (pinjaman tunai, gadai, kredit barang)
 * sebagai tabel per kategori kepada akun yang diberi akses lihat saja oleh
 * admin, termasuk pemantau yang masuk dengan kode akses bersama. Peran `dana`
 * dan `pengamat` tetap lihat saja; Super Admin punya dua aksi di sini —
 * mengoreksi data pinjaman, serta mencatat atau membatalkan keuntungan pendana
 * pada pinjaman lunas.
 *
 * Ruang ini juga menampilkan (1) foto BARANG jaminan pada gadai — foto benda,
 * bukan identitas orang — yang diambil hanya saat dialog Detail dibuka, dan
 * (2) titik lokasi terakhir peminjam beserta peta live. NIK, nomor rekening,
 * nomor WhatsApp, dan alamat tetap tidak dikirim sebagai kolom terpisah.
 *
 * Dokumen identitas (KTP, selfie dengan KTP, bukti penghasilan, tanda tangan)
 * TIDAK PERNAH dikirim ke ruang ini: aksesnya hanya untuk tim PINDAI yang
 * berwenang lewat panel admin.
 *
 * Batas yang harus jujur disampaikan: titik lokasi hanya diperbarui selama
 * dashboard peminjam terbuka (±60 detik). Pelacakan saat aplikasi ditutup butuh
 * aplikasi native, jadi yang tampil di sini selalu "terakhir dikirim kapan".
 */

/**
 * Aksi satu baris pinjaman dalam SATU pemicu.
 *
 * Sebelumnya kolom Aksi menumpuk dua sampai empat tombol (Detail, Ubah, Catat
 * untung, Batalkan catatan), sehingga kolom lain terdesak. Isinya dipindahkan
 * ke satu menu "Kelola" dengan pola yang sama seperti Plafon Nasabah. Baris
 * yang hanya punya satu pekerjaan (pendana tanpa hak koreksi, gadai, kredit)
 * tetap memakai tombol Detail tunggal: menu berisi satu item hanya menambah
 * satu klik tanpa menghemat ruang.
 */
function AksiPinjaman({
  nama,
  onDetail,
  onUbah,
  onCatatUntung,
  onBatalkanCatatan,
  penuh = false,
}: {
  nama: string;
  onDetail: () => void;
  onUbah?: () => void;
  onCatatUntung?: () => void;
  onBatalkanCatatan?: () => void;
  /** Kartu layar sempit: pemicu memenuhi lebar kartu. */
  penuh?: boolean;
}) {
  const jumlahAksi =
    1 +
    (onUbah === undefined ? 0 : 1) +
    (onCatatUntung === undefined ? 0 : 1) +
    (onBatalkanCatatan === undefined ? 0 : 1);

  if (jumlahAksi === 1) {
    return (
      <Button
        variant="outline"
        size="sm"
        className={penuh ? "h-11 w-full justify-center" : undefined}
        onClick={onDetail}
      >
        <Eye className="mr-1.5 size-3.5" aria-hidden /> Detail
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="sm"
          className={`gap-1.5 rounded-lg bg-emerald-700 px-2.5 text-xs text-white hover:bg-emerald-800 ${
            penuh ? "h-11 w-full justify-center" : "h-9"
          }`}
          aria-label={`Kelola ${nama}`}
        >
          <MoreHorizontal className="size-4" aria-hidden="true" />
          Kelola
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onSelect={onDetail} className="gap-2 py-2">
          <Eye className="size-4 text-muted-foreground" aria-hidden="true" />
          Detail
        </DropdownMenuItem>
        {onUbah !== undefined && (
          <DropdownMenuItem onSelect={onUbah} className="gap-2 py-2">
            <Pencil
              className="size-4 text-muted-foreground"
              aria-hidden="true"
            />
            Ubah data pinjaman
          </DropdownMenuItem>
        )}
        {(onCatatUntung !== undefined || onBatalkanCatatan !== undefined) && (
          <DropdownMenuSeparator />
        )}
        {onCatatUntung !== undefined && (
          <DropdownMenuItem onSelect={onCatatUntung} className="gap-2 py-2">
            <Coins
              className="size-4 text-muted-foreground"
              aria-hidden="true"
            />
            Catat untung
          </DropdownMenuItem>
        )}
        {onBatalkanCatatan !== undefined && (
          <DropdownMenuItem
            onSelect={onBatalkanCatatan}
            className="gap-2 py-2 text-red-700 focus:bg-red-50 focus:text-red-800"
          >
            <XCircle className="size-4" aria-hidden="true" />
            Batalkan catatan
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Kartu pengajuan untuk layar sempit.
 *
 * Di HP tabel 13 kolom tidak mungkin muat tanpa geser mendatar, jadi setiap
 * baris ditampilkan sebagai kartu berisi semua kolom penting, plus satu tombol
 * aksi untuk rincian lengkap. Di layar lebar tabel aslinya tetap dipakai.
 */
function KartuPengajuan({
  nama,
  kode,
  nomorReferensi,
  status,
  onDetail,
  onUbah,
  onCatatKeuntungan,
  onBatalkanKeuntungan,
  children,
}: {
  nama: string;
  kode: string | null;
  nomorReferensi: string;
  status: React.ReactNode;
  onDetail: () => void;
  /** Hanya diberikan untuk Super Admin — mengoreksi data pinjaman. */
  onUbah?: () => void;
  /** Hanya diberikan untuk Super Admin saat keuntungan belum dicatat. */
  onCatatKeuntungan?: () => void;
  /** Hanya diberikan untuk Super Admin saat catatan keuntungan masih berlaku. */
  onBatalkanKeuntungan?: () => void;
  children: React.ReactNode;
}) {
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4 transition-colors hover:border-gold/50">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold uppercase text-slate-900">
            {nama}
          </p>
          <p className="mt-0.5 font-mono text-xs text-slate-600">
            {nomorReferensi}
          </p>
        </div>
        <div className="shrink-0">{status}</div>
      </div>
      <div className="mt-2">
        <BadgePseudonim kode={kode} />
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-3">{children}</dl>
      <div className="mt-4">
        <AksiPinjaman
          nama={nama}
          onDetail={onDetail}
          onUbah={onUbah}
          onCatatUntung={onCatatKeuntungan}
          onBatalkanCatatan={onBatalkanKeuntungan}
          penuh
        />
      </div>
    </article>
  );
}

function BarisDetail({
  label,
  nilai,
  tebal = false,
}: {
  label: React.ReactNode;
  nilai: React.ReactNode;
  /**
   * Baris finansial: angka dicetak tebal pekat (navy) di atas garis hijau
   * tipis, supaya nominal di boks kanan langsung terbaca sebagai angka uang —
   * bukan tercampur dengan baris identitas di sebelahnya.
   */
  tebal?: boolean;
}) {
  return (
    <div
      className={`flex items-start justify-between gap-4 border-b py-2.5 last:border-0 ${
        tebal ? "border-emerald-100" : "border-slate-100"
      }`}
    >
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd
        className={
          tebal
            ? "text-right text-sm font-bold tabular-nums text-navy"
            : "text-right text-sm font-medium text-slate-900"
        }
      >
        {nilai}
      </dd>
    </div>
  );
}

/**
 * Satu kartu metrik pada baris "arus kas" di modal Detail.
 *
 * Dipakai untuk angka yang menyentuh peminjam secara langsung (dana bersih yang
 * ia terima, total pelunasannya), dipisah dari boks finansial supaya alur uang
 * terbaca sebagai langkah, bukan satu daftar. Istilah teknisnya bisa diberi ikon
 * bantuan (`IstilahBantuan`).
 */
function MetricKartu({
  label,
  nilai,
  ikon,
  bantuan,
  nada,
}: {
  label: string;
  nilai: string;
  ikon: React.ReactNode;
  bantuan?: { istilah: string; penjelasan: string };
  nada: "emerald" | "amber" | "slate";
}) {
  const gaya = {
    emerald: "border-emerald-300/70 bg-emerald-50/50 text-emerald-800",
    amber: "border-amber-300/70 bg-amber-50/50 text-amber-900",
    slate: "border-slate-200 bg-white text-navy",
  }[nada];
  return (
    <div className={`rounded-lg border p-3 ${gaya}`}>
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.1em]">
        {ikon}
        {label}
        {bantuan !== undefined && (
          <IstilahBantuan
            istilah={bantuan.istilah}
            penjelasan={bantuan.penjelasan}
          />
        )}
      </p>
      <p className="mt-1.5 text-lg font-bold tabular-nums leading-tight">
        {nilai}
      </p>
    </div>
  );
}

function labelPokok(status: string): string {
  return ["disetujui", "didanai", "lunas"].includes(status)
    ? "Pokok disetujui"
    : "Pokok tercatat";
}

function DetailPinjaman({
  row,
  namaTampil,
  sekarang,
  persenBungaDefault,
}: {
  row: BarisPinjaman;
  /** Penyamaran nama untuk ruang bersama (nama orang disamarkan). */
  namaTampil: (nama: string) => string;
  /** Jam berjalan halaman — dipakai untuk hitung hari jatuh tempo. */
  sekarang: number;
  /** Tarif cadangan untuk pinjaman lama yang belum menyimpan snapshot bunga. */
  persenBungaDefault: number;
}) {
  const tenorBulan = row.tenorBulan;
  const persenBungaPinjaman = row.persenBunga ?? persenBungaDefault;
  const harian =
    tenorBulan === null
      ? coba(() =>
          quotePinjaman({
            pokokPinjaman: row.pokokPinjaman,
            persenBunga: persenBungaPinjaman,
            cairEkspres: row.cairEkspres ?? undefined,
            tarifBiaya: row.tarifBiaya ?? undefined,
          }),
        )
      : null;
  const bulanan =
    tenorBulan === null
      ? null
      : coba(() =>
          simulasiBulananPinjaman({
            pokokPinjaman: row.pokokPinjaman,
            tenorBulan,
            persenBunga: persenBungaPinjaman,
          }),
        );
  const danaBersih =
    harian?.danaBersihDitransfer ?? bulanan?.danaDiterima ?? null;
  /**
   * Jatuh tempo memakai `lib/jatuhTempo` — modul yang sama dengan tabel dan
   * kartu, jadi tanggal serta hitung harinya tidak pernah berbeda antar tempat.
   * Jam "sekarang" datang dari halaman (jam berjalan), bukan dibaca di sini,
   * supaya render tetap bisa diuji.
   */
  const tampilanJatuhTempo = ringkasJatuhTempo(row, sekarang);

  return (
    <>
      {/* Dua kolom: identitas peminjam di kiri (netral), angka finansial di
          kanan (hijau muda) — supaya mata tahu di mana membaca "siapa" dan di
          mana membaca "berapa" tanpa menelusuri satu daftar panjang. */}
      <div className="grid gap-3 sm:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">
            <UserRound className="size-3.5" aria-hidden /> Identitas
          </p>
          <dl className="mt-1.5">
            <BarisDetail
              label="Nama lengkap"
              nilai={
                <span className="uppercase">{namaTampil(row.namaLengkap)}</span>
              }
            />
            <BarisDetail
              label="Kode peminjam"
              nilai={row.kodePeminjam ?? "belum terbit"}
            />
            <BarisDetail label="No. referensi" nilai={row.nomorReferensi} />
            <BarisDetail
              label="Skema"
              nilai={
                row.tenorBulan === null
                  ? "Harian"
                  : `Bulanan ${row.tenorBulan} bulan`
              }
            />
            <BarisDetail
              label="Tanggal pengajuan"
              nilai={tanggalRingkas(row.diajukanPada)}
            />
            <BarisDetail
              label="Status"
              nilai={<StatusBadge status={row.status} kind="loan" />}
            />
          </dl>
        </section>

        <section className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-800">
            <Coins className="size-3.5" aria-hidden /> Finansial
          </p>
          <dl className="mt-1.5">
            <BarisDetail
              tebal
              label="Nominal diajukan"
              nilai={rupiah(row.pokokDiajukan ?? row.pokokPinjaman)}
            />
            <BarisDetail
              tebal
              label={labelPokok(row.status)}
              nilai={rupiah(row.pokokPinjaman)}
            />
            <BarisDetail
              tebal
              label="Skema pendana"
              nilai={`${row.tenorPendanaHari} hari · ${row.persenImbalPendana}% p.p.`}
            />
            <BarisDetail
              tebal
              label={`Imbal Hasil pendana (${row.persenImbalPendana}%)`}
              nilai={rupiah(row.bunga)}
            />
            <BarisDetail
              tebal
              label="Total pengembalian pendana (pokok + Imbal Hasil)"
              nilai={rupiah(row.totalLunas)}
            />
            <BarisDetail
              tebal
              label="Biaya platform (layanan), dari uang yang kembali"
              nilai={rupiah(row.potonganAdmin)}
            />
            <BarisDetail
              tebal
              label="Keuntungan pendana (bersih)"
              nilai={row.pendana === null ? "—" : rupiah(row.keuntunganPendana)}
            />
          </dl>
          {row.pokokDiajukan > row.pokokPinjaman && (
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              Pokok tercatat lebih kecil dari pengajuan awal. Perhitungan
              menggunakan pokok tercatat; status persetujuan tidak berarti dana
              sudah ditransfer.
            </p>
          )}
        </section>
      </div>

      {/*
       * Arus kas: uang yang diterima peminjam dan kewajiban yang harus ia bayar.
       * Potongan di muka sengaja TIDAK ditampilkan di ruang pendana: biaya awal
       * pencairan adalah urusan peminjam dengan platform, bukan angka yang
       * dibandingkan pendana saat menilai alokasinya.
       */}
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <MetricKartu
          label="Dana Bersih Diterima"
          nilai={danaBersih === null ? "—" : rupiah(danaBersih)}
          ikon={<HandCoins className="size-3.5" aria-hidden />}
          nada="emerald"
        />
        <MetricKartu
          label="Total Pengembalian Pendana"
          nilai={rupiah(row.totalLunas)}
          ikon={<Wallet className="size-3.5" aria-hidden />}
          nada="slate"
          bantuan={{
            istilah: "total pengembalian pendana",
            penjelasan:
              "Pokok pendanaan ditambah Imbal Hasil tetap 30% untuk siklus 30 hari, sebelum biaya platform.",
          }}
        />
      </div>

      <dl className="mt-3 rounded-xl border border-slate-200 bg-white p-4">
        {/* `row.keuntunganAdmin` sengaja tidak ditampilkan lagi: pada model bagi
          hasil PINDAI ia selalu sama dengan `row.potonganAdmin` di atas
          (pendapatan platform = biaya platform (layanan) atas uang yang
          kembali, yaitu pokok + Imbal Hasil), jadi menampilkan keduanya berarti
          satu angka muncul dua kali dengan label sama. */}
        <BarisDetail
          label="Tenor pendana"
          nilai={`${row.tenorPendanaHari} hari`}
        />
        <BarisDetail
          label="Jatuh tempo"
          nilai={
            <TampilanJatuhTempo tampilan={tampilanJatuhTempo} align="right" />
          }
        />
        <BarisDetail
          label="Indeks kepercayaan"
          nilai={
            <span className="inline-flex flex-wrap items-center justify-end gap-1.5">
              <BadgeKepercayaan kepercayaan={row.kepercayaan} tanpaSkor />
              <ChipSkorRisiko skor={row.kepercayaan.skor} />
            </span>
          }
        />
        <p className="border-b border-slate-100 pb-3 text-xs leading-6 text-muted-foreground">
          Dasar penilaian: {row.kepercayaan.alasan.join(" · ")}. Indeks ini
          dihitung PINDAI dari riwayat pinjaman dan kelengkapan data pada
          catatan internal — bukan skor kredit lembaga penilai dan bukan jaminan
          persetujuan.
        </p>
        <BarisDetail label="Keperluan" nilai={row.tujuan} />
        <BarisDetail
          label="Pendana"
          nilai={
            row.pendana === null ? (
              "belum tercatat"
            ) : (
              <span className="uppercase">{namaTampil(row.pendana)}</span>
            )
          }
        />
      </dl>
    </>
  );
}

function DetailGadai({
  row,
  namaTampil,
}: {
  row: BarisGadai;
  namaTampil: (nama: string) => string;
}) {
  return (
    <>
      <BarisDetail
        label="Nama lengkap"
        nilai={<span className="uppercase">{namaTampil(row.namaLengkap)}</span>}
      />
      <BarisDetail
        label="Kode peminjam"
        nilai={row.kodePeminjam ?? "belum terbit"}
      />
      <BarisDetail label="No. referensi" nilai={row.nomorReferensi} />
      <BarisDetail label="Kategori" nilai={row.kategori} />
      <BarisDetail label="Barang" nilai={row.deskripsiBarang} />
      <BarisDetail
        label="Nilai taksiran"
        nilai={
          row.nilaiTaksiran === null
            ? "belum ditaksir"
            : rupiah(row.nilaiTaksiran)
        }
      />
      <BarisDetail
        label="Pokok gadai disetujui"
        nilai={row.pokokGadai === null ? "—" : rupiah(row.pokokGadai)}
      />
      <BarisDetail
        label="Sewa modal"
        nilai={
          row.persenSewaModal === null
            ? "—"
            : `${row.persenSewaModal}% / 30 hari`
        }
      />
      <BarisDetail
        label="Sisa pokok berjalan"
        nilai={row.sisaPokok === null ? "—" : rupiah(row.sisaPokok)}
      />
      <BarisDetail
        label="Tanggal pengajuan"
        nilai={tanggalRingkas(row.diajukanPada)}
      />
      <BarisDetail
        label="Status"
        nilai={<StatusBadge status={row.status} kind="pawn" />}
      />
    </>
  );
}

function DetailKredit({
  row,
  namaTampil,
}: {
  row: BarisKredit;
  namaTampil: (nama: string) => string;
}) {
  const quote = coba(() =>
    quoteKreditBarang({
      hargaBarang: row.hargaBarang,
      dpPersen: row.dpPersen,
      tenorBulan: row.tenorBulan,
      marginPersenPerBulan: row.marginPersenPerBulan,
    }),
  );
  const jatuhTempo =
    row.didanaiPada === null
      ? null
      : row.didanaiPada + row.tenorBulan * BULAN_MS;

  return (
    <>
      <BarisDetail
        label="Nama lengkap"
        nilai={<span className="uppercase">{namaTampil(row.namaLengkap)}</span>}
      />
      <BarisDetail
        label="Kode peminjam"
        nilai={row.kodePeminjam ?? "belum terbit"}
      />
      <BarisDetail label="No. referensi" nilai={row.nomorReferensi} />
      <BarisDetail
        label="Barang"
        nilai={`${row.namaBarang} · ${row.kategori}`}
      />
      <BarisDetail label="Merchant" nilai={row.merchant} />
      <BarisDetail label="Harga barang" nilai={rupiah(row.hargaBarang)} />
      <BarisDetail
        label="Uang muka"
        nilai={
          quote === null
            ? `${row.dpPersen}%`
            : `${row.dpPersen}% · ${rupiah(quote.dp)}`
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
        nilai={
          jatuhTempo === null ? "belum didanai" : tanggalRingkas(jatuhTempo)
        }
      />
      <BarisDetail
        label="Pendana"
        nilai={
          row.pendana === null ? (
            "belum tercatat"
          ) : (
            <span className="uppercase">{namaTampil(row.pendana)}</span>
          )
        }
      />
      <BarisDetail
        label="Tanggal pengajuan"
        nilai={tanggalRingkas(row.diajukanPada)}
      />
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
function BagianLokasi({
  lokasi,
  nama,
}: {
  lokasi: LokasiTitik | null;
  nama: string;
}) {
  const sekarang = useJamBerjalan();

  if (lokasi === null) {
    return (
      <section className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-4">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">
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
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">
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
          <dd className="mt-0.5 tabular-nums">
            ± {Math.round(lokasi.akurasi)} m
          </dd>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
          <dt className="text-muted-foreground">Sumber</dt>
          <dd className="mt-0.5">
            {LABEL_SUMBER[lokasi.sumber] ?? lokasi.sumber}
          </dd>
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
          Sistem menandai pola koordinat ini secara otomatis — indikator, bukan
          bukti manipulasi. Buka peta untuk menilai sendiri.
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
 * Berkas NON-IDENTITAS pada dialog Detail: foto barang jaminan gadai. Diminta
 * hanya saat dialog dibuka.
 *
 * Dokumen identitas peminjam sengaja tidak dirender di sini meski server kelak
 * mengirimkannya: ruang pendana bukan pihak yang berwenang atas KTP,
 * selfie, NIK, atau tanda tangan.
 */
function BagianBerkas({
  jenis,
  id,
  boleh,
}: {
  jenis: IsiDetail["jenis"];
  id: string;
  /** Hanya akun pendana beremail/admin — sesi kode bersama tidak. */
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
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">
        <FileText className="size-3.5" aria-hidden /> Berkas pengajuan
      </p>
      {!boleh ? (
        <p className="mt-2 flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2 text-xs leading-5 text-slate-600">
          <Lock
            className="mt-0.5 size-3.5 shrink-0 text-slate-600"
            aria-hidden
          />
          Berkas non-identitas (mis. foto barang jaminan) hanya dibuka untuk
          akun pendana beremail yang ditunjuk admin. Sesi kode akses bersama
          dapat melihat angka pengajuan dan lokasi, tetapi tidak berkas apa pun.
        </p>
      ) : data === undefined ? (
        <MemuatBaris teks="Memuat berkas…" className="mt-2" />
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
                    loading="lazy"
                    decoding="async"
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
          <p className="mt-3 flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2 text-xs leading-5 text-slate-600">
            <Lock
              className="mt-0.5 size-3.5 shrink-0 text-slate-600"
              aria-hidden
            />
            Dokumen identitas peminjam (KTP, selfie dengan KTP, bukti
            penghasilan, tanda tangan) tidak dibagikan ke ruang pendana.
            Peninjauannya dilakukan tim PINDAI yang berwenang, dengan penanda
            air, di panel admin.
          </p>
        </>
      )}
    </section>
  );
}

/** Nama kategori produk untuk badge kepala modal Detail. */
const LABEL_KATEGORI: Record<IsiDetail["jenis"], string> = {
  pinjaman: "Pinjaman tunai",
  gadai: "Gadai barang",
  kredit: "Kredit barang",
};

type IsiDetail =
  | { jenis: "pinjaman"; row: BarisPinjaman }
  | { jenis: "gadai"; row: BarisGadai }
  | { jenis: "kredit"; row: BarisKredit };

/**
 * Isi dialog Detail: angka pengajuan, titik lokasi terakhir, lalu berkas.
 * Dipisah sebagai komponen sendiri supaya query berkas hanya dibuat saat
 * dialog benar-benar terbuka (aturan hooks melarang pemanggilan bersyarat).
 */
function IsiDialog({
  detail,
  bolehBerkas,
  namaTampil,
  sekarang,
  persenBungaDefault,
}: {
  detail: IsiDetail;
  bolehBerkas: boolean;
  namaTampil: (nama: string) => string;
  /** Jam berjalan halaman — diteruskan ke tampilan jatuh tempo. */
  sekarang: number;
  persenBungaDefault: number;
}) {
  return (
    <>
      <div>
        {detail.jenis === "pinjaman" && (
          <DetailPinjaman
            row={detail.row}
            namaTampil={namaTampil}
            sekarang={sekarang}
            persenBungaDefault={persenBungaDefault}
          />
        )}
        {detail.jenis === "gadai" && (
          <DetailGadai row={detail.row} namaTampil={namaTampil} />
        )}
        {detail.jenis === "kredit" && (
          <DetailKredit row={detail.row} namaTampil={namaTampil} />
        )}
      </div>
      <BagianLokasi
        lokasi={detail.row.lokasi}
        nama={namaTampil(detail.row.namaLengkap)}
      />
      <BagianBerkas
        jenis={detail.jenis}
        id={detail.row._id}
        boleh={bolehBerkas}
      />
    </>
  );
}

/** Layar untuk akun yang belum diberi akses lihat saja. */
function AksesTerbatas() {
  return (
    <section className="animate-masuk mx-auto max-w-2xl rounded-lg border border-slate-200 bg-white p-6 text-center sm:p-10">
      <span className="mx-auto flex size-12 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-600">
        <Lock className="size-5" />
      </span>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">
        Ruang pendana bersifat terbatas
      </h1>
      <p className="mt-3 text-sm leading-7 text-muted-foreground">
        Akses lihat saja hanya diberikan admin PINDAI kepada akun tertentu. Akun
        Anda belum terdaftar; hubungi tim operasional bila Anda membutuhkan
        akses ini.
      </p>
      <p className="mx-auto mt-4 max-w-md rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-600">
        <KeyRound className="mr-1.5 inline size-3.5 align-[-2px] text-primary" />
        Tim pemantau memakai <strong>kode akses bersama</strong> dari admin —
        masuk lewat halaman kode akses, bukan lewat akun email.
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
class BatasRuang extends Component<
  { children: ReactNode },
  { pesan: string | null }
> {
  state: { pesan: string | null } = { pesan: null };

  static getDerivedStateFromError(error: Error) {
    return { pesan: error.message };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(
      "[PINDAI] Ruang pendana gagal dibuka:",
      error,
      info.componentStack,
    );
  }

  render() {
    if (this.state.pesan === null) return this.props.children;
    return <RuangGagal pesan={this.state.pesan} />;
  }
}

function RuangGagal({ pesan }: { pesan: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10 text-slate-900 sm:px-6">
      <section className="animate-masuk w-full max-w-lg rounded-lg border border-slate-200 bg-white p-8 text-center">
        <span className="mx-auto flex size-12 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-600">
          <Lock className="size-5" />
        </span>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">
          Ruang pendana belum bisa dibuka
        </h1>
        <p className="mt-3 text-sm leading-7 text-muted-foreground">
          Sesi akses lihat-saja Anda mungkin sudah diputus admin atau kode akses
          bersama sudah diganti. Tidak ada data yang berubah — ruang ini hanya
          membaca. Minta kode terbaru dari admin lalu masuk lagi.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button onClick={() => window.location.reload()}>
            <RotateCcw className="mr-1.5 size-4" aria-hidden /> Muat ulang
            halaman
          </Button>
          <Button asChild variant="outline">
            <Link to="/akses-bersama">Masuk dengan kode akses bersama</Link>
          </Button>
          <Button asChild variant="ghost">
            <Link to="/">Kembali ke beranda</Link>
          </Button>
        </div>
        {import.meta.env.DEV && (
          <p className="mt-5 break-words rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-left font-mono text-xs text-slate-600">
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
  sekarang,
  onDetail,
  onUbah,
  onCatatKeuntungan,
  onBatalkanKeuntungan,
  namaTampil,
}: {
  rows: BarisPinjaman[];
  sekarang: number;
  onDetail: (row: BarisPinjaman) => void;
  /** Hanya diisi untuk Super Admin (koreksi data pinjaman). */
  onUbah?: (row: BarisPinjaman) => void;
  /** Hanya diisi untuk Super Admin: catat keuntungan yang belum tercatat. */
  onCatatKeuntungan?: (row: BarisPinjaman) => void;
  /** Hanya diisi untuk Super Admin: batalkan catatan yang masih berlaku. */
  onBatalkanKeuntungan?: (row: BarisPinjaman) => void;
  /** Penyamaran nama orang (peminjam & pendana) untuk ruang bersama. */
  namaTampil: (nama: string) => string;
}) {
  /**
   * Jatuh tempo satu baris — dihitung sekali per baris dan dihitung ulang
   * ketika jam halaman berjalan (60 detik), sehingga lencana "Terlambat n hari"
   * ikut menua tanpa perlu muat ulang.
   */
  const jatuhTempo = (row: BarisPinjaman) => ringkasJatuhTempo(row, sekarang);

  /**
   * Aksi keuntungan mengikuti aturan murni `aksiKeuntunganPinjaman`: hanya
   * pinjaman lunas berpendana, dan catatan yang masih berlaku ditawari
   * pembatalan. Handler-nya sendiri hanya diberikan kepada Super Admin.
   */
  const aksiKeuntungan = (row: BarisPinjaman) => {
    const aksi = aksiKeuntunganPinjaman({
      status: row.status,
      adaPendana: row.pendana !== null,
      transfer: row.transfer,
    });
    return {
      catat:
        aksi === "catat" && onCatatKeuntungan !== undefined
          ? () => onCatatKeuntungan(row)
          : undefined,
      batal:
        aksi === "batalkan" && onBatalkanKeuntungan !== undefined
          ? () => onBatalkanKeuntungan(row)
          : undefined,
    };
  };

  return (
    <>
      {/* Layar sempit: kartu per peminjam — semua rincian tanpa geser mendatar. */}
      <div className="space-y-3 lg:hidden">
        {rows.map((row) => (
          <KartuPengajuan
            key={row._id}
            nama={namaTampil(row.namaLengkap)}
            kode={row.kodePeminjam}
            nomorReferensi={row.nomorReferensi}
            status={<StatusBadge status={row.status} kind="loan" />}
            onDetail={() => onDetail(row)}
            onUbah={onUbah === undefined ? undefined : () => onUbah(row)}
            onCatatKeuntungan={aksiKeuntungan(row).catat}
            onBatalkanKeuntungan={aksiKeuntungan(row).batal}
          >
            <InfoKartu label="Nominal diajukan">
              {rupiah(row.pokokDiajukan ?? row.pokokPinjaman)}
            </InfoKartu>
            <InfoKartu label={labelPokok(row.status)}>
              {rupiah(row.pokokPinjaman)}
            </InfoKartu>
            <InfoKartu label={`Imbal Hasil ${row.persenImbalPendana}%`}>
              {rupiah(row.bunga)}
            </InfoKartu>
            <InfoKartu label="Total pengembalian">
              {rupiah(row.totalLunas)}
            </InfoKartu>
            <InfoKartu label="Tenor pendana">
              {row.tenorPendanaHari} hari
            </InfoKartu>
            <InfoKartu label="Jatuh tempo">
              <TampilanJatuhTempoRingkas tampilan={jatuhTempo(row)} />
            </InfoKartu>
            <InfoKartu label="Kepercayaan peminjam">
              <span className="inline-flex flex-wrap items-center gap-1.5">
                <BadgeKepercayaan
                  kepercayaan={row.kepercayaan}
                  tampilkanRingkas
                  tanpaSkor
                />
                <ChipSkorRisiko skor={row.kepercayaan.skor} />
              </span>
            </InfoKartu>
            <InfoKartu label="Tanggal">
              {tanggalRingkas(row.diajukanPada)}
            </InfoKartu>
            <InfoKartu label="Pendana">
              {row.pendana === null ? "—" : namaTampil(row.pendana)}
            </InfoKartu>
            <InfoKartu label="Keuntungan pendana">
              {row.pendana === null ? "—" : rupiah(row.keuntunganPendana)}
            </InfoKartu>
            <InfoKartu label="Biaya platform (layanan)">
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
            "Pengajuan & tenor",
            "Kewajiban & biaya",
            "Jatuh tempo",
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
                nama={namaTampil(row.namaLengkap)}
                kode={row.kodePeminjam}
                referensi={row.nomorReferensi}
                kepercayaan={row.kepercayaan}
              />
              <TableCell className="align-top tabular-nums">
                <p className="font-semibold text-slate-900">
                  {rupiah(row.pokokPinjaman)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Diajukan {rupiah(row.pokokDiajukan ?? row.pokokPinjaman)} ·{" "}
                  {labelPokok(row.status)}
                </p>
                <p className="mt-1 text-xs text-slate-600">
                  Tenor pendana {row.tenorPendanaHari} hari
                </p>
                {row.pokokDiajukan > row.pokokPinjaman && (
                  <Badge variant="outline" className="mt-2 text-xs">
                    Nominal dikurangi
                  </Badge>
                )}
              </TableCell>
              <TableCell className="align-top tabular-nums">
                <p className="font-medium text-slate-800">
                  {rupiah(row.totalLunas)}
                </p>
                <p className="mt-1 text-xs text-emerald-700">
                  Yield {row.persenImbalPendana}% p.p. {rupiah(row.bunga)}
                </p>
                <p className="mt-1 text-xs text-amber-700">
                  Biaya platform (layanan) dari uang kembali{" "}
                  {row.pendana === null ? "—" : rupiah(row.potonganAdmin)}
                </p>
              </TableCell>
              <TableCell className="align-top">
                <TampilanJatuhTempo tampilan={jatuhTempo(row)} />
              </TableCell>
              <TableCell className="align-top text-slate-600">
                {tanggalRingkas(row.diajukanPada)}
              </TableCell>
              <TableCell className="align-top">
                <StatusBadge status={row.status} kind="loan" />
              </TableCell>
              <TableCell className="align-top">
                {row.pendana === null ? (
                  <span className="text-slate-600">—</span>
                ) : (
                  <>
                    <span className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-medium uppercase text-slate-800">
                      <Wallet className="size-3 shrink-0" aria-hidden />
                      <span className="truncate">
                        {namaTampil(row.pendana)}
                      </span>
                    </span>
                    <p className="mt-1 text-xs font-semibold text-emerald-700">
                      Untung {rupiah(row.keuntunganPendana)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
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
                <AksiPinjaman
                  nama={namaTampil(row.namaLengkap)}
                  onDetail={() => onDetail(row)}
                  onUbah={onUbah === undefined ? undefined : () => onUbah(row)}
                  onCatatUntung={aksiKeuntungan(row).catat}
                  onBatalkanCatatan={aksiKeuntungan(row).batal}
                />
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
 * Ruang pendana tetap "lihat saja" untuk peran `dana` dan `pengamat`:
 * tombol Ubah tidak pernah muncul untuk mereka. Server tetap penjaga utama —
 * `ubahDataPinjaman` mewajibkan Super Admin dengan sesi TOTP terverifikasi,
 * mencatat setiap perubahan ke Audit Trail (catatan koreksi opsional), dan
 * menolak pinjaman yang sudah lunas.
 */
function DialogUbahPinjaman({
  row,
  onClose,
}: {
  row: BarisPinjaman | null;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={row !== null}
      onOpenChange={(open) => (open ? undefined : onClose())}
    >
      <DialogContent className="w-full gap-0 overflow-hidden rounded-lg border border-gold/40 bg-white p-0 sm:max-w-2xl">
        {/* Kepala modal hijau tipis + badge kategori produk di pojok kiri atas. */}
        <div className="border-b border-gold/40 bg-slate-50/70 px-5 py-4 sm:px-6">
          <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-white px-2 py-0.5 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-800">
            <Tag className="size-3" aria-hidden /> {LABEL_KATEGORI.pinjaman}
          </span>
          <DialogHeader className="mt-2 gap-1.5">
            <DialogTitle className="text-lg text-navy">
              Ubah data pinjaman
            </DialogTitle>
            <DialogDescription className="text-xs leading-5">
              Koreksi catatan internal PINDAI — termasuk menetapkan siapa
              pendananya. Tidak ada uang yang berpindah dan pencairan tetap di
              luar aplikasi; setiap perubahan masuk audit trail (catatan koreksi
              boleh dikosongkan).
            </DialogDescription>
          </DialogHeader>
        </div>
        {row !== null && (
          <FormUbahPinjaman key={row._id} row={row} onClose={onClose} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function FormUbahPinjaman({
  row,
  onClose,
}: {
  row: BarisPinjaman;
  onClose: () => void;
}) {
  // Kandidat pendana = SEMUA akun yang pernah menjadi pendana (termasuk
  // pendana lama tanpa peran aktif), bukan hanya akun berperan `dana`.
  const kandidatQ = useQuery(api.penyediaDana.kandidatPendana, {});
  const simpan = useMutation(api.penyediaDana.ubahDataPinjaman);
  // Status dipindahkan lewat mutation yang SAMA dengan panel admin
  // (`loans.ubahStatusPinjaman`) supaya kedua tempat selalu menampilkan status
  // yang sama, satu audit, dan satu pesan WhatsApp.
  const ubahStatus = useMutation(api.loans.ubahStatusPinjaman);
  // Sentinel NON-kosong: Radix Select menolak `<SelectItem value="">`
  // (melempar saat dropdown dibuka), jadi "tidak diubah" memakai penanda sendiri.
  const TETAP = "__tetap";
  const LEPAS = "__lepas";
  const TETAP_STATUS = "__tetap_status";
  const [pendana, setPendana] = useState(TETAP);
  const [statusBaru, setStatusBaru] = useState<string>(TETAP_STATUS);
  const [namaPeminjam, setNamaPeminjam] = useState(
    namaHurufBesar(row.namaLengkap),
  );
  const [tujuan, setTujuan] = useState(row.tujuan);
  const [tenorHari, setTenorHari] = useState(String(row.tenorHari));
  const [tenorBulan, setTenorBulan] = useState(
    row.tenorBulan === null ? "harian" : String(row.tenorBulan),
  );
  const [pokok, setPokok] = useState(String(row.pokokPinjaman));
  const [busy, setBusy] = useState(false);

  /** Gaya seragam medan form: sudut lembut, tepi slate, cincin fokus hijau. */
  const KELAS_MEDAN =
    "rounded-xl border-slate-300 focus-visible:border-emerald-500 focus-visible:ring-2 focus-visible:ring-emerald-500/30";

  const kandidat = kandidatQ?.rows ?? [];
  const nominalTerkunci = row.status === "didanai" || row.status === "lunas";
  const bolehLepas = !nominalTerkunci && row.didanaiPada === null;

  const kirim = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const tenorAwal =
      row.tenorBulan === null ? "harian" : String(row.tenorBulan);
    // Angka yang tidak valid tidak pernah dikirim: biarkan server menolak hanya
    // bila admin memang mengisi nilai, bukan saat kolomnya kosong.
    const hariBaru = Number(tenorHari);
    const pokokBaru = Number(pokok);
    const nominalBaru =
      !nominalTerkunci &&
      Number.isFinite(pokokBaru) &&
      pokokBaru !== row.pokokPinjaman
        ? pokokBaru
        : null;
    const gantiStatus = statusBaru !== TETAP_STATUS;
    setBusy(true);
    const perubahan: string[] = [];
    try {
      // 1) Status pinjaman lebih dulu (bila dipilih) — inilah pintu yang sama
      //    dengan panel admin. Nominal ikut dikirim di sini karena server
      //    menolaknya setelah dana ditandai tersalurkan.
      if (gantiStatus) {
        const kanonik = statusBaru as StatusPinjaman;
        await ubahStatus({
          loanId: row._id,
          status: kanonik,
          ...(nominalBaru === null ? {} : { pokokDisetujui: nominalBaru }),
        });
        perubahan.push(`status → ${LABEL_STATUS_PINJAMAN[kanonik]}`);
      }
      // 2) Koreksi catatan lain: pendana, tujuan, tenor — dan nominal bila
      //    statusnya tidak ikut berpindah (agar tidak dikirim dua kali).
      const hasil = await simpan({
        loanId: row._id,
        ...(pendana === TETAP
          ? {}
          : pendana === LEPAS
            ? { pendanaEmail: null }
            : { pendanaUserId: pendana as Id<"users"> }),
        // Nama peminjam hanya dikirim bila benar-benar diubah (perbaikan typo).
        ...(namaPeminjam.trim() !== namaHurufBesar(row.namaLengkap).trim()
          ? { namaPeminjam: namaPeminjam.trim() }
          : {}),
        ...(tujuan.trim() !== row.tujuan ? { tujuan: tujuan.trim() } : {}),
        ...(tenorBulan === "harian" &&
        Number.isFinite(hariBaru) &&
        hariBaru !== row.tenorHari
          ? { tenorHari: hariBaru }
          : {}),
        ...(tenorBulan !== tenorAwal
          ? { tenorBulan: tenorBulan === "harian" ? null : Number(tenorBulan) }
          : {}),
        ...(nominalBaru !== null && !gantiStatus
          ? { pokokDisetujui: nominalBaru }
          : {}),
      });
      perubahan.push(...hasil.perubahan);
      toast.success(
        perubahan.length === 0
          ? "Tidak ada perubahan yang disimpan."
          : `Tersimpan: ${perubahan.join(", ")}`,
      );
      onClose();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Gagal menyimpan perubahan.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="flex max-h-[75dvh] flex-col" onSubmit={kirim}>
      <div className="flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6">
        <div className="rounded-lg border border-slate-200 bg-slate-50/70 px-4 py-3 text-xs leading-6 text-slate-700">
          <span className="font-medium uppercase text-slate-700">
            {namaHurufBesar(row.namaLengkap)}
          </span>{" "}
          · <span className="font-mono">{row.nomorReferensi}</span>
          <br />
          Pokok tercatat {rupiah(row.pokokPinjaman)} · diajukan{" "}
          {rupiah(row.pokokDiajukan ?? row.pokokPinjaman)} · pendana sekarang{" "}
          {row.pendana ?? "belum ada"}
        </div>

        <div className="space-y-2">
          <Label htmlFor="ubah-status">Status pinjaman</Label>
          <Select
            value={statusBaru}
            onValueChange={setStatusBaru}
            disabled={row.status === "lunas"}
          >
            <SelectTrigger id="ubah-status" className={`w-full ${KELAS_MEDAN}`}>
              <SelectValue placeholder="Tidak diubah" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TETAP_STATUS}>Tidak diubah</SelectItem>
              {STATUS_PINJAMAN.filter(
                (s) => keStatusTersimpan(s) !== row.status,
              ).map((s) => (
                <SelectItem key={s} value={s}>
                  {LABEL_STATUS_PINJAMAN[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs leading-5 text-muted-foreground">
            {row.status === "lunas"
              ? "Pinjaman sudah lunas — posisinya ditutup dan statusnya tidak dapat diubah lagi."
              : `Status sekarang: ${labelStatusPinjaman(row.status)}. Perubahan status memakai pintu yang sama dengan panel admin: peminjam menerima kabar WhatsApp berisi status dan catatan di atas (boleh dikosongkan).`}
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="ubah-pendana">Pendana</Label>
          <Select value={pendana} onValueChange={setPendana}>
            <SelectTrigger
              id="ubah-pendana"
              className={`w-full ${KELAS_MEDAN}`}
            >
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
          <p className="text-xs leading-5 text-muted-foreground">
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
          <Label htmlFor="ubah-nama-peminjam">Nama peminjam</Label>
          <Input
            id="ubah-nama-peminjam"
            value={namaPeminjam}
            onChange={(e) => setNamaPeminjam(e.target.value)}
            maxLength={120}
            className={`uppercase ${KELAS_MEDAN}`}
          />
          <p className="text-xs leading-5 text-muted-foreground">
            Nama pada catatan pinjaman ini. Perbaiki bila ada salah tulis —
            disimpan HURUF BESAR dan langsung dipakai di seluruh layar.
            Identitas lain (NIK, WhatsApp, foto KTP) disunting lewat menu Data
            Diri nasabah.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="ubah-tujuan">Tujuan pinjaman</Label>
          <Input
            id="ubah-tujuan"
            value={tujuan}
            onChange={(e) => setTujuan(e.target.value)}
            maxLength={500}
            className={KELAS_MEDAN}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="ubah-tenor-bulan">Skema tenor</Label>
            <Select value={tenorBulan} onValueChange={setTenorBulan}>
              <SelectTrigger
                id="ubah-tenor-bulan"
                className={`w-full ${KELAS_MEDAN}`}
              >
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
              className={KELAS_MEDAN}
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
            className={KELAS_MEDAN}
          />
          <p className="text-xs leading-5 text-muted-foreground">
            {nominalTerkunci
              ? "Nominal tidak dapat diubah: dana pinjaman ini sudah ditandai tersalurkan."
              : `Tidak boleh melebihi pengajuan ${rupiah(row.pokokDiajukan ?? row.pokokPinjaman)}.`}
          </p>
        </div>
      </div>

      {/* Kaki tetap: selalu terlihat di dasar modal, apa pun panjang formnya. */}
      <div className="glass-dock sticky bottom-0 z-20 flex shrink-0 justify-end gap-2 px-6 py-4">
        <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
          Batal
        </Button>
        <Button
          type="submit"
          disabled={busy}
          className="rounded-xl bg-emerald-700 text-white hover:bg-emerald-800"
        >
          {busy ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : null}
          Simpan Perubahan
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
  // Pencatatan keuntungan pendana: target disimpan sebagai data ringkas supaya
  // dialog tetap memegang nominal yang dibaca saat tombolnya ditekan.
  const [catatKeuntungan, setCatatKeuntungan] =
    useState<TargetKeuntungan | null>(null);
  const [batalKeuntungan, setBatalKeuntungan] =
    useState<TargetKeuntungan | null>(null);
  // Saringan di atas tabel: nama peminjam + pendana.
  const [filter, setFilter] = useState<FilterPengajuan>(
    FILTER_PENGAJUAN_KOSONG,
  );
  const sekarang = useJamBerjalan();

  const role = user?.role;
  // `pengamat` = sesi tamu yang diaktifkan kode akses bersama (lihat saja).
  const bolehLihat = role === "dana" || role === "admin" || role === "pengamat";
  // Berkas identitas pemohon lebih ketat: hanya akun beremail yang ditunjuk
  // admin (peran `dana`) atau admin sendiri. Sesi kode akses bersama tidak.
  const bolehBerkas = role === "dana" || role === "admin";
  /**
   * Penyamaran nama di ruang bersama.
   *
   * Ruang ini dibaca banyak pihak (pendana dan tim pemantau berkode
   * akses bersama), sehingga nama orang — peminjam maupun pendana —
   * disamarkan di layar. Super Admin tidak disamarkan: ia memang perlu nama
   * penuh untuk mengoreksi catatan lewat tombol Ubah. Nama SENDIRI juga
   * dibiarkan terbaca supaya setiap pendana tetap menemukan kartunya —
   * identitas kita sendiri tidak kita rahasiakan dari kita sendiri.
   */
  const samar = role !== "admin";
  /**
   * Ruang ini portofolio pribadi peran `dana`: server hanya mengirim alokasi
   * atas namanya, jadi tabel perbandingan antarpendana tidak punya apa-apa
   * untuk dibandingkan dan tidak pernah dibuka untuknya.
   */
  const isPendana = role === "dana";
  const kunciSendiri = kunciNama(user?.name);
  const tampilNama = (nama: string): string =>
    namaRuangan(
      nama,
      samar && (kunciSendiri === "" || kunciNama(nama) !== kunciSendiri),
    );

  /** Data ringkas yang dibutuhkan dialog pencatatan keuntungan pendana. */
  const targetKeuntungan = (row: BarisPinjaman): TargetKeuntungan | null =>
    row.pendana === null
      ? null
      : {
          loanId: row._id,
          pendanaNama: tampilNama(row.pendana),
          nomorReferensi: row.nomorReferensi,
          jumlah: row.keuntunganPendana,
        };
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
    user === undefined || !bolehLihat || tab !== "lokasi"
      ? ("skip" as const)
      : {},
  );
  // Riwayat catatan transfer hanya dibaca saat tabnya dibuka — sama alasannya
  // dengan titik lokasi: pembacaan tabel besar tidak ikut berjalan untuk
  // pengunjung yang hanya melihat daftar pengajuan.
  const laporanTransfer = useQuery(
    api.penyediaDana.laporanTransferPendana,
    user === undefined || !bolehLihat || tab !== "transfer"
      ? ("skip" as const)
      : {},
  );
  // Persetujuan risiko milik AKUN, bukan peramban: statusnya dibaca dari server
  // supaya tetap terbaca saat pendana berganti perangkat.
  const persetujuan = useQuery(
    api.persetujuanRisiko.statusPersetujuanRisiko,
    user === undefined || !bolehLihat ? ("skip" as const) : {},
  );
  const catatPersetujuan = useMutation(
    api.persetujuanRisiko.catatPersetujuanRisiko,
  );
  const [menyimpanSetuju, setMenyimpanSetuju] = useState(false);
  const [galatSetuju, setGalatSetuju] = useState<string | null>(null);

  // Kontak laporan WhatsApp dibaca sebagai query terpisah: kartu kontak hanya
  // butuh satu nilai, dan nomornya milik akun (bukan milik peramban), jadi ia
  // tetap terisi saat pendana berganti perangkat.
  const kontakLaporan = useQuery(
    api.penyediaDana.kontakLaporanSaya,
    user === undefined ? ("skip" as const) : {},
  );
  const simpanKontak = useMutation(api.penyediaDana.simpanKontakLaporan);
  const kirimLaporan = useAction(api.laporanPendana.kirimLaporanPortofolio);
  // Angka PDF unduhan dibaca dari query yang sama dengan laporan WhatsApp,
  // sehingga salinan manual dan salinan terkirim tidak pernah berbeda.
  const dataLaporan = useQuery(
    api.laporanPendana.dataLaporanPortofolio,
    user === undefined ? ("skip" as const) : {},
  );
  const [menyimpanKontak, setMenyimpanKontak] = useState(false);
  const [mengirimLaporan, setMengirimLaporan] = useState(false);
  const [mengunduhLaporan, setMengunduhLaporan] = useState(false);
  const [galatLaporan, setGalatLaporan] = useState<string | null>(null);

  /** Simpan nomor laporan milik akun yang sedang masuk. */
  async function simpanNomorLaporan(nomor: string) {
    setMenyimpanKontak(true);
    setGalatLaporan(null);
    try {
      await simpanKontak({ nomor });
      toast.success("Nomor laporan tersimpan pada akun Anda.");
    } catch (err) {
      setGalatLaporan(
        err instanceof Error ? err.message : "Nomor gagal disimpan. Coba lagi.",
      );
    } finally {
      setMenyimpanKontak(false);
    }
  }

  /**
   * Minta laporan kinerja dikirim ke WhatsApp akun ini.
   *
   * Kegagalan gateway ditampilkan apa adanya di kartunya, bukan diringkas jadi
   * "berhasil": pendana harus tahu kalau laporannya tidak jadi terkirim. Tiga
   * sebab yang paling sering: nomor belum diisi, integrasi WhatsApp belum aktif,
   * atau gateway yang dipasang admin tidak mendukung lampiran berkas.
   */
  async function kirimLaporanWhatsapp() {
    setMengirimLaporan(true);
    setGalatLaporan(null);
    try {
      await kirimLaporan({});
      toast.success(
        "Laporan dikirim ke WhatsApp Anda. Berkasnya menyusul di percakapan.",
      );
    } catch (err) {
      setGalatLaporan(
        err instanceof Error
          ? err.message
          : "Laporan gagal dikirim. Coba lagi.",
      );
    } finally {
      setMengirimLaporan(false);
    }
  }

  /**
   * Susun laporan portofolio yang sama sebagai PDF di perangkat pendana.
   *
   * Berbeda dari jalur WhatsApp, berkas ini tidak pernah disimpan di server:
   * angkanya diambil dari query laporan, lalu byte PDF disusun di peramban dan
   * langsung diunduh. Tidak perlu nomor WhatsApp, dan tidak ada tautan laporan
   * yang tertinggal di penyimpanan.
   */
  async function unduhLaporanPdf() {
    if (dataLaporan === undefined || dataLaporan === null) return;
    setMengunduhLaporan(true);
    setGalatLaporan(null);
    try {
      const byte = susunPdf(laporanPortofolio(dataLaporan));
      const blob = new Blob([new Uint8Array(byte)], {
        type: "application/pdf",
      });
      const nama = namaBerkasPortofolio(dataLaporan.dicetakPada);
      // Di aplikasi Android, unduhan blob: tidak ditangani WebView.
      if (await unduhLewatAplikasi(nama, "application/pdf", blob)) return;
      const url = URL.createObjectURL(blob);
      const tautan = document.createElement("a");
      tautan.href = url;
      tautan.download = nama;
      tautan.rel = "noopener";
      document.body.appendChild(tautan);
      tautan.click();
      tautan.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (err) {
      setGalatLaporan(
        err instanceof Error
          ? err.message
          : "Laporan PDF gagal disiapkan. Coba lagi.",
      );
    } finally {
      setMengunduhLaporan(false);
    }
  }

  /**
   * Kirim persetujuan risiko atas VERSI teks yang sedang tampil.
   *
   * Versi ikut dikirim supaya server dapat menolak halaman yang sudah usang:
   * yang disetujui harus kalimat yang benar-benar dibaca pendana, bukan kalimat
   * lain yang kebetulan versinya lebih baru.
   */
  async function setujuiRisiko(versiTeks: number) {
    setMenyimpanSetuju(true);
    setGalatSetuju(null);
    try {
      await catatPersetujuan({ versiTeks });
      toast.success("Persetujuan risiko tercatat atas nama akun Anda.");
    } catch (err) {
      setGalatSetuju(
        err instanceof Error
          ? err.message
          : "Persetujuan gagal dicatat. Coba lagi.",
      );
    } finally {
      setMenyimpanSetuju(false);
    }
  }

  // Pinjaman dipisah supaya ruang kerja pendana jelas: pengajuan baru yang
  // BELUM didanai, posisi yang SUDAH didanai (berjalan), riwayat lunas, dan
  // pengajuan yang DITOLAK (tidak dilanjutkan) ke tab sendiri agar tidak
  // tercampur dengan antrean yang masih berjalan.
  //
  // Pemisahan utama memakai `status` (otoritatif) dan `didanaiPada` hanya
  // sebagai pelengkap data warisan. Ini penting karena sebagian baris lama
  // berstatus "didanai" (berlabel Disalurkan) tapi `didanaiPada`-nya kosong —
  // kalau hanya mengandalkan `didanaiPada`, baris itu salah nyelip ke "Ditinjau".
  const pinjamanDitolak =
    data?.pinjaman.filter((r) => r.status === "ditolak") ?? [];
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
  const pinjamanLunas =
    data?.pinjaman.filter((r) => r.status === "lunas") ?? [];

  // Saringan dihitung SEKALI di sini lalu dipakai daftar kartu (layar sempit)
  // maupun tabel (desktop), supaya kedua tata letak selalu menampilkan baris
  // yang sama. Pilihan pendana diambil dari data yang sudah ada — bukan
  // daftar akun terpisah — supaya isinya pasti punya pinjaman.
  const gadai = data?.gadai ?? [];
  const kredit = data?.kredit ?? [];
  const pendanaTerdaftar = daftarPendana([
    ...pinjamanDitolak,
    ...pinjamanDidanai,
    ...pinjamanLunas,
    ...pinjamanBaru,
    ...kredit,
  ]);
  const tampilBaru = saringPengajuan(pinjamanBaru, filter);
  const tampilDidanai = saringPengajuan(pinjamanDidanai, filter);
  const tampilLunas = saringPengajuan(pinjamanLunas, filter);
  const tampilDitolak = saringPengajuan(pinjamanDitolak, filter);
  const tampilGadai = saringNama(gadai, filter.cari);
  const tampilKredit = saringPengajuan(kredit, filter);
  const saringanAktif = adaFilter(filter);

  /**
   * Klik kartu profil pendana → saring tabel ke pendana itu lalu gulir lembut ke
   * daftar. Tab gadai/peta tidak punya kolom pendana, jadi dipindahkan dulu ke
   * tab Disalurkan supaya hasil klik benar-benar terlihat (bukan filter yang
   * aktif tapi tak tampak di layar).
   */
  const pilihPendana = (nama: string) => {
    setFilter((lama) => ({ ...lama, pendana: nama }));
    if (tab === "gadai" || tab === "lokasi") setTab("didanai");
    document
      .getElementById("daftar-pengajuan")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  // Jumlah per tab dibuat dari tab yang sedang dibuka, bukan dari seluruh data,
  // agar "Menampilkan X dari Y" selalu cocok dengan tabel di bawahnya.
  const jumlahPerTab: Record<string, { tampil: number; total: number }> = {
    belum: { tampil: tampilBaru.length, total: pinjamanBaru.length },
    didanai: { tampil: tampilDidanai.length, total: pinjamanDidanai.length },
    lunas: { tampil: tampilLunas.length, total: pinjamanLunas.length },
    ditolak: { tampil: tampilDitolak.length, total: pinjamanDitolak.length },
    gadai: { tampil: tampilGadai.length, total: gadai.length },
    kredit: { tampil: tampilKredit.length, total: kredit.length },
  };
  const jumlahTab = jumlahPerTab[tab] ?? { tampil: 0, total: 0 };

  /**
   * Pinjaman berjalan milik satu pendana — pembentuk baris "Belum lunas
   * (perkiraan)" pada kartunya.
   *
   * Sengaja memakai saringan yang SAMA dengan perhitungan rekap di server
   * (`pendana` terisi dan statusnya `didanai`), bukan daftar `pinjamanDidanai`
   * di atas yang juga memuat baris warisan ber-`didanaiPada` — supaya jumlah
   * baris rincian selalu sama dengan angka perkiraan di kartu, bukan sekadar
   * mirip.
   */
  function rincianPerkiraan(nama: string): RincianPerkiraan[] {
    return (data?.pinjaman ?? [])
      .filter((b) => b.pendana === nama && b.status === "didanai")
      .map((b) => ({
        id: b._id,
        nomorReferensi: b.nomorReferensi,
        namaLengkap: tampilNama(b.namaLengkap),
        keuntunganPendana: b.keuntunganPendana,
      }));
  }

  /**
   * Pinjaman BERJALAN milik pendana yang sedang membuka ruang ini — dasar
   * indikator jatuh tempo pribadi.
   *
   * Hanya peran `dana` yang punya "pinjaman sendiri": sesi kode akses bersama
   * (`pengamat`) memang bukan pemilik alokasi, dan Super Admin memantau semua
   * pinjaman lewat tabel — bukan lewat pengingat pribadi. Saringan statusnya
   * SAMA dengan kartu pendana (`status === "didanai"`), jadi jumlahnya tidak
   * pernah berbeda dari bagian "Belum lunas (perkiraan)" di kartu.
   *
   * Angka jatuh tempo memakai `ringkasJatuhTempo` — modul yang sama dengan
   * tabel ruang ini, sehingga lencana di sini tidak mungkin berbeda dari kolom
   * "Jatuh tempo" di bawahnya.
   */
  const jatuhTempoSaya: BarisPengingatPendana[] =
    role === "dana" && kunciSendiri !== ""
      ? (data?.pinjaman ?? [])
          .filter(
            (b) =>
              b.status === "didanai" && kunciNama(b.pendana) === kunciSendiri,
          )
          .map((b) => {
            const tampilan = ringkasJatuhTempo(b, sekarang);
            return {
              id: b._id,
              nomorReferensi: b.nomorReferensi,
              pokokPinjaman: b.pokokPinjaman,
              status: b.status,
              jatuhTempoPada: tampilan.tanggal,
              hitung: tampilan.hitung,
              nada: tampilan.nada,
            };
          })
      : [];

  /**
   * Angka kesehatan portofolio, dihitung dari baris yang SAMA dengan tabel di
   * bawah (bukan dari angka tersimpan): batas jatuh tempo memakai
   * `batasPelunasan` — modul yang juga mengisi kolom "Jatuh tempo" — sehingga
   * cacahan di sini tidak mungkin berbeda dari tabelnya.
   *
   * Tujuh hari ditulis sebagai konstanta hari, bukan angka ajaib: satuannya
   * "hari" dan itu satuannya di seluruh halaman.
   */
  const barisBerjalan = (data?.pinjaman ?? []).filter(
    (b) => b.status === "didanai",
  );
  const tujuhHariMs = 7 * 24 * 60 * 60 * 1000;
  const kesehatan: AngkaKesehatanPortofolio = {
    jatuhTempoSegera: {
      jumlah: barisBerjalan.filter((b) => {
        const batas = batasPelunasan(b);
        return (
          batas !== null && batas >= sekarang && batas <= sekarang + tujuhHariMs
        );
      }).length,
      nominal: barisBerjalan
        .filter((b) => {
          const batas = batasPelunasan(b);
          return (
            batas !== null &&
            batas >= sekarang &&
            batas <= sekarang + tujuhHariMs
          );
        })
        .reduce((total, b) => total + b.pokokPinjaman, 0),
    },
    terlambat: {
      jumlah: barisBerjalan.filter((b) => {
        const batas = batasPelunasan(b);
        return batas !== null && batas < sekarang;
      }).length,
      nominal: barisBerjalan
        .filter((b) => {
          const batas = batasPelunasan(b);
          return batas !== null && batas < sekarang;
        })
        .reduce((total, b) => total + b.pokokPinjaman, 0),
    },
    persenTerlambat: 0,
    belumTerhubung: {
      jumlah: barisBerjalan.filter((b) => b.pendana === null).length,
      nominal: barisBerjalan
        .filter((b) => b.pendana === null)
        .reduce((total, b) => total + b.pokokPinjaman, 0),
    },
  };
  // Rasio dihitung dari pokok yang berjalan, bukan jumlah baris: satu pinjaman
  // besar yang terlambat tidak boleh terbaca seperti masalah kecil.
  const pokokBerjalan = barisBerjalan.reduce(
    (total, b) => total + b.pokokPinjaman,
    0,
  );
  kesehatan.persenTerlambat =
    pokokBerjalan > 0 ? (kesehatan.terlambat.nominal / pokokBerjalan) * 100 : 0;

  /** Total posisi dana dari rekap pendana — angka yang sudah dihitung server. */
  const rekapPendana = data?.rekapPendana ?? [];
  const angkaPortofolio = {
    danaTersalurkan: rekapPendana.reduce(
      (total, r) => total + r.totalDisalurkan,
      0,
    ),
    saldoBerjalan: rekapPendana.reduce(
      (total, r) => total + r.saldoBerjalan,
      0,
    ),
  };

  return (
    <div className="bg-ambient-glass flex min-h-screen flex-col overflow-x-clip text-slate-900">
      {/*
       * Bilah atas: tetap menempel saat menggulir karena ruang ini panjang, dan
       * diberi garis kuningan tipis di puncaknya sebagai penanda identitas
       * PINDAI — bahasa warna "tinta & kuningan" yang sudah dipakai aplikasi.
       */}
      <header className="animate-masuk glass-nav sticky top-0 z-40 border-t-2 border-gold pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link to="/dashboard" className="flex shrink-0 items-center gap-2.5">
            <VaultLogo size={32} className="size-8 shrink-0" />
            <span className="hidden text-sm font-semibold tracking-[0.18em] text-navy sm:block">
              PINDAI
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-1.5 text-xs font-medium uppercase tracking-[0.16em] text-emerald-800 sm:inline-flex">
              <Eye className="size-3" aria-hidden />
              {role === "pengamat"
                ? "Pemantau akun bersama · lihat saja"
                : role === "admin"
                  ? "Super Admin · dapat mengoreksi data"
                  : "Portofolio Anda · lihat saja"}
            </span>
            {/* Satu-satunya pintu ke proposal pendanaan: halaman itu bukan rute
                publik, jadi pembaca yang sudah membuka ruang ini melanjutkan ke
                sana dari sini. Akun tanpa akses tidak diberi tautan yang akan
                memantul kembali ke halaman ini. */}
            {bolehLihat && (
              <Button
                asChild
                variant="outline"
                size="sm"
                className="h-9 gap-1.5 border-slate-300 px-2.5 text-xs font-semibold text-navy"
              >
                <Link to="/jadi-pendana">
                  <FileText className="size-3.5" aria-hidden />
                  <span className="hidden sm:inline">Proposal pendanaan</span>
                  <span className="sm:hidden">Proposal</span>
                </Link>
              </Button>
            )}
            <NotificationBell />
            <RoleDashboardMenu />
          </div>
        </div>
      </header>

      <main
        id="konten"
        tabIndex={-1}
        className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-9"
      >
        {user !== undefined && !bolehLihat ? (
          <AksesTerbatas />
        ) : data === undefined ? (
          /* Rangka ruang pendana: panel judul, baris angka, dan tabel
             pengajuan sekaligus — bukan spinner di tengah halaman kosong, supaya
             tabel tidak melompat dari bawah lipatan saat data tiba. */
          <KerangkaRuangPendana />
        ) : (
          <>
            {/*
             * Panel judul "tinta": satu bidang navy berisi identitas ruang,
             * empat angka pokok, dan keterangan cara membacanya. Sebelumnya
             * semua itu berupa kartu putih terpisah di atas latar putih, sehingga
             * tidak ada tempat pertama yang benar-benar menangkap mata dan
             * keterangan panjang mendorong tabel jauh ke bawah layar.
             */}
            <section
              id="ringkasan"
              className="animate-masuk scroll-mt-20 border-t-2 border-gold pt-5 sm:pt-6"
            >
              {/* Garis kuningan di puncak lembar: penanda identitas PINDAI
                  sekaligus kepala lembar folio, bukan gradasi pelangi. */}
              <p className="flex items-baseline gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">
                <span aria-hidden className={`tracking-normal ${FOLIO.kode}`}>
                  {nomorFolio(1)}
                </span>
                Ruang pendana
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {/* Badge peran hanya sekali, di bilah atas: mengulanginya di sini
                    membuat dua label yang sama bersaing di layar sempit. */}
                <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium uppercase tracking-[0.14em] text-slate-600">
                  {bolehBerkas
                    ? "Berkas & lokasi terakhir ditampilkan"
                    : "Angka pengajuan & lokasi · berkas khusus akun email"}
                </span>
                {samar && (
                  <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium uppercase tracking-[0.14em] text-emerald-800">
                    <Lock className="size-3" aria-hidden /> Nama orang
                    disamarkan
                  </span>
                )}
              </div>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight text-navy sm:text-4xl">
                Ringkasan Pendanaan
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600">
                Halaman ini memantau posisi dana pendana: berapa yang sudah
                tersalurkan, berapa yang masih berjalan, dan berapa keuntungan
                yang sudah dibukukan maupun yang masih perkiraan.
              </p>

              {/* Peringatan risiko duduk tepat di bawah judul: pembaca harus tahu
                  risikonya sebelum membaca angka keuntungan di bawahnya. */}
              <BannerRisikoPendanaan />

              {/* Navigasi jangkar: halaman ini panjang, dan empat bagian besarnya
                  sekarang punya nama yang bisa dituju langsung. */}
              <nav
                aria-label="Bagian halaman"
                className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5"
              >
                {[
                  { id: "ringkasan", nomor: 1, teks: "Ringkasan" },
                  { id: ANCHOR_RISIKO_PENDANAAN, nomor: 3, teks: "Risiko" },
                  { id: "aturan-perhitungan", nomor: 5, teks: "Aturan hitung" },
                  { id: "pendana", nomor: 7, teks: "Pendana" },
                  { id: "daftar-pengajuan", nomor: 8, teks: "Daftar pinjaman" },
                ].map((bagian) => (
                  /*
                   * Indeks mengikuti nomor bagiannya, jadi lompatan jangkar dan
                   * nomor yang tercetak di kepala bagian selalu sama.
                   */
                  <a
                    key={bagian.id}
                    href={`#${bagian.id}`}
                    className="group inline-flex items-baseline gap-1.5 text-xs font-medium text-slate-600 transition-colors hover:text-navy"
                  >
                    <span
                      aria-hidden
                      className={`text-xs text-emerald-700 ${FOLIO.kode}`}
                    >
                      {nomorFolio(bagian.nomor)}
                    </span>
                    <span className="underline decoration-gold/50 underline-offset-4 group-hover:decoration-emerald-700">
                      {bagian.teks}
                    </span>
                  </a>
                ))}
              </nav>

              {/* Keterangan panjang dipindah ke lipatan: tetap bisa dibaca siapa
                  pun yang membutuhkannya, tetapi tidak lagi menjadi dinding teks
                  yang harus dilewati setiap kali membuka halaman. */}
              <details
                className={`${FOLIO.jalur} mt-4 max-w-3xl px-4 py-3 text-xs leading-6 text-slate-700`}
              >
                <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
                  Cara membaca ruang ini
                </summary>
                <p className="mt-2">
                  Catatan internal PINDAI untuk pinjaman tunai, gadai, dan
                  kredit barang. Tidak ada tindakan alokasi maupun pencairan
                  dari ruang ini
                  {role === "admin"
                    ? "; sebagai Super Admin Anda dapat mengoreksi data pinjaman (termasuk menetapkan pendananya) lewat tombol Ubah — setiap perubahan tercatat di audit trail, dan catatan koreksinya boleh dikosongkan."
                    : ": Anda hanya dapat membaca catatan ini."}{" "}
                  Tombol <strong>Detail</strong> membuka titik lokasi terakhir
                  peminjam
                  {bolehBerkas
                    ? ", berkas pengajuan (KTP, selfie, slip, foto barang, tanda tangan),"
                    : " — berkas identitas pemohon hanya dibuka untuk akun pendana beremail, bukan untuk sesi kode akses bersama."}{" "}
                  NIK, nomor rekening, nomor WhatsApp, dan alamat tidak dikirim
                  sebagai kolom terpisah
                  {bolehBerkas
                    ? " — NIK tetap terbaca pada gambar KTP yang Anda buka."
                    : "."}{" "}
                  {samar &&
                    "Nama orang — peminjam maupun pendana — disamarkan di layar ini; kode pseudonim peminjam dan nomor referensi tetap utuh sebagai penanda. Nama Anda sendiri tetap terbaca."}
                </p>
              </details>

              {/* Angka pokok ruang ini diletakkan di dalam panel judul supaya
                  tidak perlu digulir, dan dipisah garis rambut tipis agar tetap
                  terbaca sebagai empat angka yang setara. */}
              {/* Empat angka pokok pendana. Dua yang pertama adalah posisi dana,
                  dua berikutnya adalah hasil: satu sudah dibukukan, satu masih
                  perkiraan. Warnanya memisahkan dua makna terakhir itu. */}
              {/*
               * Satu angka pokok berdiri sebagai lembar bertepi kuningan, tiga
               * angka pendukungnya duduk di daftar bergaris di sebelahnya.
               * Sebelumnya keempatnya kartu yang sama besar, sehingga angka yang
               * paling menentukan terbaca setara dengan perkiraan.
               */}
              <div className="mt-5 grid items-start gap-5 lg:grid-cols-[22rem_minmax(0,1fr)]">
                <KartuRingkasan
                  label="Dana tersalurkan"
                  nilai={rupiah(angkaPortofolio.danaTersalurkan)}
                  detail="pokok pinjaman berjalan + lunas, semua pendana"
                  icon={<HandCoins className="size-4" />}
                  aksen="tersalurkan"
                />
                <dl className={`${FOLIO.jalur} px-4 py-1.5`}>
                  <BarisAngka
                    label="Masih berjalan"
                    nilai={rupiah(angkaPortofolio.saldoBerjalan)}
                    detail="pokok yang belum kembali dari peminjam"
                    tanda="berjalan"
                    catatanRisiko="Dana ini belum kembali dan dapat terlambat atau tidak kembali."
                  />
                  <BarisAngka
                    label="Keuntungan dibukukan"
                    nilai={rupiah(data.ringkasan.totalKeuntunganPendanaLunas)}
                    detail="dari pinjaman lunas, sudah final"
                    tanda="dibukukan"
                  />
                  <BarisAngka
                    label="Estimasi keuntungan (perkiraan)"
                    nilai={rupiah(
                      data.ringkasan.totalKeuntunganPendanaBelumLunas,
                    )}
                    detail="hitungan atas pinjaman yang masih berjalan"
                    tanda="perkiraan"
                    catatanRisiko="Estimasi, bukan jaminan. Hanya terwujud jika pinjaman lunas."
                  />
                </dl>
              </div>

              {/* Baris kecil: angka semua status dan dua produk tanpa pengajuan.
                  Nominalnya digabung dari semua status (ditinjau, ditolak, lunas),
                  jadi labelnya menyebut itu apa adanya, bukan "pinjaman tunai". */}
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs leading-5 text-muted-foreground">
                <span>
                  Total nominal semua pengajuan:{" "}
                  <strong className="font-semibold tabular-nums text-navy">
                    {rupiah(data.ringkasan.nilaiPinjaman)}
                  </strong>{" "}
                  ({data.ringkasan.jumlahPinjaman} pengajuan, semua status
                  termasuk ditolak)
                </span>
                <span>
                  {isPendana
                    ? `Produk lain di portofolio Anda: kredit barang ${data.ringkasan.jumlahKredit}`
                    : data.ringkasan.jumlahGadai === 0 &&
                        data.ringkasan.jumlahKredit === 0
                      ? "Produk lain: belum ada pengajuan"
                      : `Produk lain: gadai ${data.ringkasan.jumlahGadai} · kredit barang ${data.ringkasan.jumlahKredit}`}
                </span>
                <span>
                  {data.ringkasan.menungguReview} pengajuan menunggu review
                </span>
              </div>

              {/* Catatan mikro dekat angka: dipindahkan dari kaki halaman supaya
                  terbaca bersama angkanya, bukan setelah menggulir jauh. */}
              <p className="mt-2 max-w-3xl text-xs leading-5 text-muted-foreground">
                {CATATAN_INTERNAL_SINGKAT}
              </p>
            </section>

            {/* Kesehatan portofolio dulu, lalu penjelasan risikonya: keadaan dana
                sebelum aturan mainnya. */}
            <KesehatanPortofolio angka={kesehatan} />

            <PanelRisikoPendanaan />

            {/*
             * Persetujuan risiko tepat sesudah panel risikonya, dan sebelum
             * angka keuntungan mana pun: pertanyaan "sudahkah saya menyetujui
             * ini?" dijawab setelah risikonya terbaca, bukan setelah angkanya
             * ditafsirkan. Selama statusnya belum tiba, yang tampil baris memuat
             * setinggi kartunya — supaya tidak ada lompatan tata letak saat
             * kartunya masuk.
             */}
            {persetujuan === undefined && bolehLihat && (
              <MemuatBaris
                teks="Memuat status persetujuan risiko…"
                className="mt-4"
              />
            )}
            {persetujuan !== undefined && (
              <PersetujuanRisikoPendana
                status={persetujuan}
                peran={persetujuan.peran}
                bolehSetuju={persetujuan.bolehSetuju}
                menyimpan={menyimpanSetuju}
                galat={galatSetuju}
                onSetuju={setujuiRisiko}
              />
            )}

            {/* Pengingat jatuh tempo pribadi pendana — sesudah keadaan dana dan
                risikonya, tetapi sebelum aturan hitung dan angka keuntungan,
                karena waktu yang mendesak harus terbaca lebih dahulu. Tidak
                tampil saat tidak ada pinjaman berjalan atas nama pembaca. */}
            <PengingatJatuhTempoPendana
              rows={jatuhTempoSaya}
              sekarang={sekarang}
            />

            {/*
             * Aturan perhitungan menggantikan kotak "untuk apa biaya platform
             * (layanan) dipakai" yang dulu berdiri sendiri, sekaligus menggantikan ikon
             * `?` yang dulu ditempel berulang di kartu angka: satu tempat untuk
             * semua cara angka di halaman ini dihitung, terbuka sesuai kebutuhan.
             */}
            <AturanPerhitungan
              persenPotonganAdmin={data.ringkasan.persenPotonganAdmin}
            />

            {/* Ringkasan keuntungan selalu tampil: pertanyaan pendana
                ("berapa yang sudah jadi uang, berapa yang masih perkiraan")
                dijawab di puncak halaman, bukan di tengah daftar angka. */}
            <RingkasanKeuntungan
              ringkasan={data.ringkasan}
              pribadi={isPendana}
            />

            {/* Tiket doorprize pendana: satu per kelipatan Rp1 juta penempatan dana,
                diakumulasi selama kuartal berjalan. */}
            {isPendana && <DoorprizeWidget peran="pendana" />}

            {/* Skema pendana TETAP: kalkulator dan portofolio per alokasi.
                Hanya untuk akun pendana; admin memakai tabel rekap di bawah. */}
            {isPendana && (
              <>
                <KalkulatorImbalPendana
                  persenPotonganAdmin={data.ringkasan.persenPotonganAdmin}
                />
                <PortofolioPendanaanSection />
              </>
            )}

            {rekapPendana.length > 0 && (
              <section className="animate-masuk mt-6">
                <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-slate-200 pb-2">
                  <h2
                    id="pendana"
                    className="flex scroll-mt-24 items-baseline gap-2.5 text-base font-semibold tracking-tight text-navy"
                  >
                    <span
                      aria-hidden
                      className={`text-xs text-emerald-700 ${FOLIO.kode}`}
                    >
                      {nomorFolio(7)}
                    </span>
                    <Coins className="size-4 text-emerald-700" aria-hidden />{" "}
                    {isPendana ? "Portofolio Anda" : "Rekap Dana Pendana"}
                  </h2>
                  <p className="max-w-md text-xs leading-5 text-muted-foreground">
                    {isPendana ? (
                      <>
                        Seluruh angka di halaman ini hanya dihitung dari
                        pinjaman yang alokasinya atas nama Anda.
                      </>
                    ) : (
                      <>
                        Model <strong>1 pinjaman = 1 pendana</strong>. Setiap
                        angka dihitung dari pinjaman yang tercatat atas nama
                        pendana itu.
                      </>
                    )}
                  </p>
                </div>
                {/*
                 * Dua pembaca, dua bentuk. Admin dan pemantau membandingkan
                 * semua pendana, jadi mereka menerima satu tabel dengan kepala
                 * kolom yang melekat saat digulir dan baris total di dasarnya.
                 * Akun pendana menerima portofolionya sendiri: server tidak
                 * pernah mengirimkan baris pendana lain kepadanya, jadi yang
                 * ditampilkan hanya posisinya sendiri, tanpa tabel kosong satu
                 * baris.
                 */}
                {/* Rekap seluruh pendana sebagai berkas: hanya Super Admin,
                    karena isinya posisi keuangan semua pendana. Pendana dan
                    sesi akses bersama tidak punya akses ke angka ini. */}
                {role === "admin" && <RekapPendanaUnduhan className="mt-3" />}
                <div className="mt-3">
                  {isPendana && rekapPendana[0] !== undefined ? (
                    <PortofolioPendana
                      r={rekapPendana[0]}
                      namaTampil={tampilNama}
                      persenLayanan={data.ringkasan.persenPotonganAdmin}
                    />
                  ) : (
                    <TabelPendana
                      rekap={rekapPendana}
                      rincianPerkiraan={rincianPerkiraan}
                      namaTampil={tampilNama}
                      aktif={filter.pendana === "" ? null : filter.pendana}
                      onPilih={pilihPendana}
                    />
                  )}
                </div>
              </section>
            )}

            {/* Pengaturan kontak laporan + tombol minta laporan, hanya untuk akun
                pemilik portofolio: laporan ini salinan angka di atasnya, dan
                admin/pemantau tidak punya laporan untuk dikirim ke dirinya
                sendiri. Diletakkan persis sesudah angka portofolionya supaya
                yang diminta jelas: berkas berisi angka yang baru dibaca. */}
            {isPendana &&
              kontakLaporan !== undefined &&
              kontakLaporan !== null && (
                <KontakLaporanWhatsapp
                  className="mt-4"
                  nomor={kontakLaporan.nomorWhatsApp}
                  menyimpan={menyimpanKontak}
                  mengirim={mengirimLaporan}
                  mengunduh={mengunduhLaporan}
                  bolehUnduh={dataLaporan !== undefined && dataLaporan !== null}
                  galat={galatLaporan}
                  onSimpan={simpanNomorLaporan}
                  onKirim={kirimLaporanWhatsapp}
                  onUnduh={() => void unduhLaporanPdf()}
                />
              )}

            {/* Kepala bagian daftar: nomor indeksnya sama dengan nomor yang
                dipakai di indeks jangkar di puncak halaman. */}
            <KepalaFolio
              nomor={8}
              judul="Daftar pengajuan"
              catatan="Satu pengajuan satu baris, terbagi menurut status dan produk"
              className="mt-6 scroll-mt-24"
            />

            <Tabs
              value={tab}
              onValueChange={setTab}
              id="daftar-pengajuan"
              className="animate-masuk scroll-mt-20"
            >
              <TabsList
                aria-label="Kategori pengajuan"
                className="sticky top-14 z-30 h-auto w-full flex-wrap justify-start gap-x-1 rounded-none border-b border-gold/40 bg-white p-0"
              >
                <TabsTrigger
                  value="belum"
                  className="group h-11 flex-none items-center gap-2 rounded-none border-b-2 border-transparent px-3.5 text-xs font-medium text-slate-600 transition-colors hover:text-navy data-[state=active]:border-emerald-700 data-[state=active]:text-navy"
                >
                  <Timer className="size-3.5" /> Ditinjau
                  <span className="ml-0.5 text-xs font-semibold tabular-nums text-slate-600 group-data-[state=active]:text-emerald-800">
                    {pinjamanBaru.length}
                  </span>
                </TabsTrigger>
                <TabsTrigger
                  value="didanai"
                  className="group h-11 flex-none items-center gap-2 rounded-none border-b-2 border-transparent px-3.5 text-xs font-medium text-slate-600 transition-colors hover:text-navy data-[state=active]:border-emerald-700 data-[state=active]:text-navy"
                >
                  <HandCoins className="size-3.5" /> Disalurkan
                  <span className="ml-0.5 text-xs font-semibold tabular-nums text-slate-600 group-data-[state=active]:text-emerald-800">
                    {pinjamanDidanai.length}
                  </span>
                </TabsTrigger>
                <TabsTrigger
                  value="lunas"
                  className="group h-11 flex-none items-center gap-2 rounded-none border-b-2 border-transparent px-3.5 text-xs font-medium text-slate-600 transition-colors hover:text-navy data-[state=active]:border-emerald-700 data-[state=active]:text-navy"
                >
                  <BadgeCheck className="size-3.5" /> Lunas
                  <span className="ml-0.5 text-xs font-semibold tabular-nums text-slate-600 group-data-[state=active]:text-emerald-800">
                    {pinjamanLunas.length}
                  </span>
                </TabsTrigger>
                <TabsTrigger
                  value="ditolak"
                  className="group h-11 flex-none items-center gap-2 rounded-none border-b-2 border-transparent px-3.5 text-xs font-medium text-slate-600 transition-colors hover:text-navy data-[state=active]:border-emerald-700 data-[state=active]:text-navy"
                >
                  <XCircle className="size-3.5" /> Ditolak
                  <span className="ml-0.5 text-xs font-semibold tabular-nums text-slate-600 group-data-[state=active]:text-emerald-800">
                    {pinjamanDitolak.length}
                  </span>
                </TabsTrigger>
                <TabsTrigger
                  value="gadai"
                  className="group h-11 flex-none items-center gap-2 rounded-none border-b-2 border-transparent px-3.5 text-xs font-medium text-slate-600 transition-colors hover:text-navy data-[state=active]:border-emerald-700 data-[state=active]:text-navy"
                >
                  <Package className="size-3.5" /> Gadai
                  <span className="ml-0.5 text-xs font-semibold tabular-nums text-slate-600 group-data-[state=active]:text-emerald-800">
                    {data.ringkasan.jumlahGadai}
                  </span>
                </TabsTrigger>
                <TabsTrigger
                  value="kredit"
                  className="group h-11 flex-none items-center gap-2 rounded-none border-b-2 border-transparent px-3.5 text-xs font-medium text-slate-600 transition-colors hover:text-navy data-[state=active]:border-emerald-700 data-[state=active]:text-navy"
                >
                  <ShoppingBag className="size-3.5" /> Kredit Barang
                  <span className="ml-0.5 text-xs font-semibold tabular-nums text-slate-600 group-data-[state=active]:text-emerald-800">
                    {data.ringkasan.jumlahKredit}
                  </span>
                </TabsTrigger>
                <TabsTrigger
                  value="lokasi"
                  className="group h-11 flex-none items-center gap-2 rounded-none border-b-2 border-transparent px-3.5 text-xs font-medium text-slate-600 transition-colors hover:text-navy data-[state=active]:border-emerald-700 data-[state=active]:text-navy"
                >
                  <MapPin className="size-3.5" /> Lokasi live
                  {titik !== undefined && (
                    <span className="ml-0.5 text-xs font-semibold tabular-nums text-slate-600 group-data-[state=active]:text-emerald-800">
                      {titik.jumlahTitik}
                    </span>
                  )}
                </TabsTrigger>
                {/* Lencana tab ini menghitung catatan yang MASIH MENUNGGU
                    dicatat admin — satu angka yang benar-benar perlu dilihat
                    pendana, bukan jumlah seluruh riwayat. */}
                <TabsTrigger
                  value="transfer"
                  className="group h-11 flex-none items-center gap-2 rounded-none border-b-2 border-transparent px-3.5 text-xs font-medium text-slate-600 transition-colors hover:text-navy data-[state=active]:border-emerald-700 data-[state=active]:text-navy"
                >
                  <ArrowLeftRight className="size-3.5" /> Transfer
                  {laporanTransfer !== undefined && (
                    <span className="ml-0.5 text-xs font-semibold tabular-nums text-slate-600 group-data-[state=active]:text-emerald-800">
                      {laporanTransfer.ringkasan.jumlahBelumDicatat}
                    </span>
                  )}
                </TabsTrigger>
              </TabsList>

              {/* Saringan di atas tabel data pinjaman — nama peminjam dan
                  pendana. Disembunyikan di tab peta: daftarnya bukan
                  pengajuan, dan tab gadai tidak punya kolom pendana. */}
              {tab !== "lokasi" && tab !== "transfer" && (
                <SaringanPengajuan
                  cari={filter.cari}
                  onCari={(nilai) =>
                    setFilter((lama) => ({ ...lama, cari: nilai }))
                  }
                  pendana={filter.pendana}
                  onPendana={(nama) =>
                    setFilter((lama) => ({ ...lama, pendana: nama }))
                  }
                  pilihanPendana={pendanaTerdaftar}
                  tampilkanPendana={tab !== "gadai"}
                  tampil={jumlahTab.tampil}
                  total={jumlahTab.total}
                  onReset={() => setFilter(FILTER_PENGAJUAN_KOSONG)}
                  namaTampil={tampilNama}
                />
              )}

              {/* ===== Pinjaman baru: belum didanai ===== */}
              <TabsContent value="belum" className="mt-4">
                {tampilBaru.length === 0 ? (
                  <KeadaanKosongDaftar
                    aktif={saringanAktif}
                    pesan="Belum ada pengajuan pinjaman baru yang menunggu didanai."
                  />
                ) : (
                  <>
                    <CatatanTab nada="amber" label="Belum didanai">
                      Pinjaman pada tab ini <strong>belum didanai</strong> —
                      dana belum dialokasikan. Alokasi pendanaan dilakukan dari
                      panel admin.
                    </CatatanTab>
                    <DaftarPinjaman
                      namaTampil={tampilNama}
                      rows={tampilBaru}
                      sekarang={sekarang}
                      onDetail={(row) => setDetail({ jenis: "pinjaman", row })}
                      onUbah={
                        role === "admin" ? (row) => setUbah(row) : undefined
                      }
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
                {tampilDidanai.length === 0 ? (
                  <KeadaanKosongDaftar
                    aktif={saringanAktif}
                    pesan="Belum ada pinjaman yang sudah didanai dan masih berjalan."
                  />
                ) : (
                  <>
                    <CatatanTab nada="emerald" label="Sudah didanai">
                      Pinjaman pada tab ini <strong>sudah didanai</strong> dan
                      masih berjalan. Angka keuntungan di bawah adalah
                      perhitungan atas kewajiban berjalan, bukan bukti mutasi.
                    </CatatanTab>
                    <DaftarPinjaman
                      namaTampil={tampilNama}
                      rows={tampilDidanai}
                      sekarang={sekarang}
                      onDetail={(row) => setDetail({ jenis: "pinjaman", row })}
                      onUbah={
                        role === "admin" ? (row) => setUbah(row) : undefined
                      }
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
                {tampilLunas.length === 0 ? (
                  <KeadaanKosongDaftar
                    aktif={saringanAktif}
                    pesan="Belum ada pinjaman tunai yang berstatus lunas."
                  />
                ) : (
                  <>
                    <CatatanTab nada="emerald" label="Lunas">
                      Pinjaman pada tab ini sudah berstatus{" "}
                      <strong>lunas</strong> pada ledger internal. Angka
                      keuntungan pendana dan biaya platform (layanan) di bawah
                      adalah hasil perhitungan atas kewajiban yang sudah
                      terbayar penuh: biayanya diambil dari uang yang kembali
                      (pokok + Imbal Hasil), bukan dari Imbal Hasil saja, dan
                      bukan bukti mutasi.
                    </CatatanTab>
                    <DaftarPinjaman
                      namaTampil={tampilNama}
                      rows={tampilLunas}
                      sekarang={sekarang}
                      onDetail={(row) => setDetail({ jenis: "pinjaman", row })}
                      onUbah={
                        role === "admin" ? (row) => setUbah(row) : undefined
                      }
                      onCatatKeuntungan={
                        role === "admin"
                          ? (row) => setCatatKeuntungan(targetKeuntungan(row))
                          : undefined
                      }
                      onBatalkanKeuntungan={
                        role === "admin"
                          ? (row) => setBatalKeuntungan(targetKeuntungan(row))
                          : undefined
                      }
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
                {tampilDitolak.length === 0 ? (
                  <KeadaanKosongDaftar
                    aktif={saringanAktif}
                    pesan="Tidak ada pengajuan pinjaman yang ditolak."
                  />
                ) : (
                  <>
                    <CatatanTab nada="red" label="Ditolak internal">
                      Pinjaman pada tab ini berstatus{" "}
                      <strong>ditolak internal</strong> — tidak dilanjutkan
                      dalam alur aplikasi dan tidak memerlukan alokasi dana.
                      Tetap ditampilkan sebagai catatan riwayat.
                    </CatatanTab>
                    <DaftarPinjaman
                      namaTampil={tampilNama}
                      rows={tampilDitolak}
                      sekarang={sekarang}
                      onDetail={(row) => setDetail({ jenis: "pinjaman", row })}
                      onUbah={
                        role === "admin" ? (row) => setUbah(row) : undefined
                      }
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
                {tampilGadai.length === 0 ? (
                  <KeadaanKosongDaftar
                    aktif={saringanAktif}
                    pesan={
                      isPendana
                        ? "Gadai tidak masuk portofolio pendana: barang jaminan tidak punya alokasi dana, jadi tidak ada barisnya di sini."
                        : "Belum ada pengajuan gadai yang tercatat."
                    }
                  />
                ) : (
                  <>
                    <div className="space-y-3 lg:hidden">
                      {tampilGadai.map((row) => (
                        <KartuPengajuan
                          key={row._id}
                          nama={tampilNama(row.namaLengkap)}
                          kode={row.kodePeminjam}
                          nomorReferensi={row.nomorReferensi}
                          status={
                            <StatusBadge status={row.status} kind="pawn" />
                          }
                          onDetail={() => setDetail({ jenis: "gadai", row })}
                        >
                          <InfoKartu label="Barang">
                            <span className="block">{row.deskripsiBarang}</span>
                            <span className="mt-0.5 block text-xs font-normal text-slate-600">
                              {row.kategori}
                            </span>
                          </InfoKartu>
                          <InfoKartu label="Taksiran">
                            {row.nilaiTaksiran === null
                              ? "belum ditaksir"
                              : rupiah(row.nilaiTaksiran)}
                          </InfoKartu>
                          <InfoKartu label="Tanggal">
                            {tanggalRingkas(row.diajukanPada)}
                          </InfoKartu>
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
                        {tampilGadai.map((row) => (
                          <TableRow key={row._id}>
                            <SelPeminjam
                              nama={tampilNama(row.namaLengkap)}
                              kode={row.kodePeminjam}
                              referensi={row.nomorReferensi}
                            />
                            <TableCell className="align-top">
                              <p className="text-slate-900">
                                {row.deskripsiBarang}
                              </p>
                              <p className="mt-0.5 text-xs text-muted-foreground">
                                {row.kategori}
                              </p>
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
                            <SelLokasi
                              lokasi={row.lokasi}
                              sekarang={sekarang}
                            />
                            <TableCell className="align-top">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  setDetail({ jenis: "gadai", row })
                                }
                              >
                                <Eye className="mr-1.5 size-3.5" aria-hidden />{" "}
                                Detail
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </Tabel>
                    </div>
                    <CatatanTerpotong
                      terpotong={data.terpotong.gadai}
                      batas={data.batas}
                    />
                  </>
                )}
              </TabsContent>

              {/* ===== Kredit barang ===== */}
              <TabsContent value="kredit" className="mt-4">
                {tampilKredit.length === 0 ? (
                  <KeadaanKosongDaftar
                    aktif={saringanAktif}
                    pesan="Belum ada pengajuan kredit barang yang tercatat."
                  />
                ) : (
                  <>
                    <div className="space-y-3 lg:hidden">
                      {tampilKredit.map((row) => (
                        <KartuPengajuan
                          key={row._id}
                          nama={tampilNama(row.namaLengkap)}
                          kode={row.kodePeminjam}
                          nomorReferensi={row.nomorReferensi}
                          status={<BadgeKredit status={row.status} />}
                          onDetail={() => setDetail({ jenis: "kredit", row })}
                        >
                          <InfoKartu label="Barang">
                            <span className="block">{row.namaBarang}</span>
                            <span className="mt-0.5 block text-xs font-normal text-slate-600">
                              {row.kategori} · {row.merchant}
                            </span>
                          </InfoKartu>
                          <InfoKartu label="Harga">
                            {rupiah(row.hargaBarang)}
                          </InfoKartu>
                          <InfoKartu label="Tenor">
                            {row.tenorBulan} bulan
                          </InfoKartu>
                          <InfoKartu label="Tanggal">
                            {tanggalRingkas(row.diajukanPada)}
                          </InfoKartu>
                          <InfoKartu label="Pendana">
                            {row.pendana === null
                              ? "—"
                              : tampilNama(row.pendana)}
                          </InfoKartu>
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
                        {tampilKredit.map((row) => (
                          <TableRow key={row._id}>
                            <SelPeminjam
                              nama={tampilNama(row.namaLengkap)}
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
                              <p className="font-semibold text-slate-900">
                                {rupiah(row.hargaBarang)}
                              </p>
                              <p className="mt-1 text-xs text-slate-600">
                                {row.tenorBulan} bulan · DP {row.dpPersen}%
                              </p>
                            </TableCell>
                            <TableCell className="align-top text-slate-600">
                              {tanggalRingkas(row.diajukanPada)}
                            </TableCell>
                            <TableCell className="align-top">
                              <BadgeKredit status={row.status} />
                            </TableCell>
                            <SelPendana
                              pendana={
                                row.pendana === null
                                  ? null
                                  : tampilNama(row.pendana)
                              }
                            />
                            <SelLokasi
                              lokasi={row.lokasi}
                              sekarang={sekarang}
                            />
                            <TableCell className="align-top">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  setDetail({ jenis: "kredit", row })
                                }
                              >
                                <Eye className="mr-1.5 size-3.5" aria-hidden />{" "}
                                Detail
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </Tabel>
                    </div>
                    <CatatanTerpotong
                      terpotong={data.terpotong.kredit}
                      batas={data.batas}
                    />
                  </>
                )}
              </TabsContent>

              {/* ===== Transfer keuntungan: riwayat catatan + rekonsiliasi ===== */}
              <TabsContent value="transfer" className="mt-4">
                {laporanTransfer === undefined ? (
                  <p className="flex items-center justify-center gap-2 py-24 text-sm text-muted-foreground">
                    <MemuatBaris teks="Memuat catatan transfer…" />
                  </p>
                ) : (
                  <LaporanTransferPendana
                    rows={laporanTransfer.rows}
                    belum={laporanTransfer.belum}
                    ringkasan={laporanTransfer.ringkasan}
                    idSaya={laporanTransfer.idSaya}
                    namaTampil={tampilNama}
                    terpotong={laporanTransfer.terpotong}
                  />
                )}
              </TabsContent>

              {/* ===== Lokasi live ===== */}
              <TabsContent value="lokasi" className="mt-4 space-y-4">
                {titik === undefined ? (
                  <p className="flex items-center justify-center gap-2 py-24 text-sm text-muted-foreground">
                    <MemuatBaris teks="Memuat titik lokasi…" />
                  </p>
                ) : (
                  <>
                    <div className="animate-masuk rounded-lg border border-slate-200 bg-white p-4 sm:p-5">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className="border-0 bg-primary/10 text-accent-foreground">
                          <MapPin className="mr-1 size-3" /> {titik.jumlahTitik}{" "}
                          titik terakhir
                        </Badge>
                        <Badge
                          variant="outline"
                          className="border-slate-200 text-muted-foreground"
                        >
                          {titik.tanpaTitik} peminjam belum pernah mengirim
                          titik
                        </Badge>
                        {titik.terpotong && (
                          <Badge
                            variant="outline"
                            className="border-slate-200 text-muted-foreground"
                          >
                            menampilkan {titik.batas} pengajuan terbaru per
                            kategori
                          </Badge>
                        )}
                      </div>
                      <p className="mt-3 max-w-3xl text-xs leading-6 text-muted-foreground">
                        Peta ini memakai koordinat yang{" "}
                        <strong>dilaporkan perangkat peminjam</strong>. Titik
                        diperbarui otomatis selama dashboard peminjam terbuka
                        (±60 detik); pelacakan saat aplikasi ditutup memerlukan
                        aplikasi native, sehingga label umur di bawah selalu
                        menunjukkan kapan titik terakhir benar-benar diterima.
                      </p>
                    </div>

                    <PetaLokasiPeminjam
                      rows={titik.rows}
                      vault={titik.vault}
                      namaTampil={tampilNama}
                    />

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
                                    {tampilNama(r.namaLengkap)}
                                  </span>
                                  <BadgePseudonim kode={r.kodePeminjam} />
                                  {r.posisi.tanda.length > 0 && (
                                    <Badge className="border-0 bg-amber-100 text-amber-800 hover:bg-amber-100">
                                      pola koordinat ditandai
                                    </Badge>
                                  )}
                                </span>
                                <span className="mt-1 flex flex-wrap items-center gap-2">
                                  <span className="font-mono text-xs text-slate-600">
                                    {r.nomorReferensi}
                                  </span>
                                  {r.kategori === "pinjaman" ? (
                                    <StatusBadge
                                      status={r.status}
                                      kind="loan"
                                    />
                                  ) : r.kategori === "gadai" ? (
                                    <StatusBadge
                                      status={r.status}
                                      kind="pawn"
                                    />
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
                                  {r.posisi.lat.toFixed(5)},{" "}
                                  {r.posisi.lng.toFixed(5)}
                                </span>
                                <span className="block">
                                  ± {Math.round(r.posisi.akurasi)} m ·{" "}
                                  {LABEL_SUMBER[r.posisi.sumber] ??
                                    r.posisi.sumber}
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
          </>
        )}
      </main>

      <Dialog
        open={detail !== null}
        onOpenChange={(open) => (open ? undefined : setDetail(null))}
      >
        <DialogContent className="w-full gap-0 overflow-hidden rounded-lg border border-gold/40 bg-white p-0 sm:max-w-2xl">
          {/* Kepala modal: hijau tipis sejuk + badge kategori produk di pojok
              kiri atas, supaya jenis pengajuan terbaca sebelum isinya. */}
          <div className="border-b border-gold/40 bg-slate-50/70 px-5 py-4 sm:px-6">
            <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-white px-2 py-0.5 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-800">
              <Tag className="size-3" aria-hidden />
              {LABEL_KATEGORI[detail?.jenis ?? "pinjaman"]}
            </span>
            <DialogHeader className="mt-2 gap-1.5">
              <DialogTitle className="text-lg text-navy">
                {detail?.jenis === "pinjaman"
                  ? "Detail pinjaman tunai"
                  : detail?.jenis === "gadai"
                    ? "Detail gadai"
                    : "Detail kredit barang"}
              </DialogTitle>
              <DialogDescription className="text-xs leading-5">
                Catatan internal PINDAI — ruang lihat saja. Titik lokasi
                terakhir peminjam selalu ditampilkan
                {bolehBerkas
                  ? "; berkas pengajuan ditampilkan untuk akun pendana beremail."
                  : "; berkas pengajuan hanya dibuka untuk akun pendana beremail, bukan sesi kode akses bersama."}{" "}
                NIK, nomor rekening, nomor WhatsApp, dan alamat tidak dikirim
                sebagai kolom terpisah.
              </DialogDescription>
            </DialogHeader>
          </div>
          <div className="max-h-[65dvh] overflow-y-auto overscroll-contain px-5 py-4 sm:px-6">
            {detail !== null && (
              <IsiDialog
                detail={detail}
                bolehBerkas={bolehBerkas}
                namaTampil={tampilNama}
                sekarang={sekarang}
                persenBungaDefault={
                  data?.ringkasan.persenBunga ?? PINDAI_PRICING.bungaPercent
                }
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Koreksi data pinjaman — hanya Super Admin yang dapat membukanya. */}
      {role === "admin" && (
        <DialogUbahPinjaman row={ubah} onClose={() => setUbah(null)} />
      )}

      {/*
       * Pencatatan keuntungan pendana — dibuka dari tab Lunas. Server tetap
       * penjaga utama: hanya pinjaman lunas yang bisa dicatat, nominal dihitung
       * ulang di sana, dan setiap catatan masuk Audit Trail.
       */}
      {role === "admin" && (
        <>
          <DialogCatatKeuntungan
            target={catatKeuntungan}
            onClose={() => setCatatKeuntungan(null)}
          />
          <DialogBatalkanKeuntungan
            target={batalKeuntungan}
            onClose={() => setBatalKeuntungan(null)}
          />
        </>
      )}

      {/*
       * Kaki bergaya "tinta": peringatan bahwa angka di ruang ini adalah catatan
       * internal ikut di sini, bukan lagi sebagai kotak putih yang menyela daftar.
       * Dengan begitu bagian paling bawah halaman menjadi penutup yang jelas:
       * apa ruang ini, dan apa batasnya.
       */}
      <footer className="mt-8 bg-navy text-white/70">
        <div className="mx-auto w-full max-w-6xl px-4 py-7 sm:px-6">
          <p className="max-w-3xl text-xs leading-6">
            Angka di ruang ini adalah catatan internal PINDAI dan bukan bukti
            transaksi, jaminan pencairan, maupun penawaran. Status mengikuti
            pencatatan ledger internal. Pokok dana maupun Imbal Hasil pendana
            tidak dijamin oleh LPS atau pihak lain, kecuali ada perjanjian
            tertulis yang menyatakannya.
          </p>
          <p className="mt-3 max-w-3xl text-[11px] leading-5 text-white/60">
            {PENAFIAN_PINDAI}
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
            {/*
             * Warna label di atas latar navy: `gold` (#9c7b3a) hanya 3,03:1 di
             * atas tinta, sedangkan ini teks 12px — jadi dipakai tingkat
             * amber-200 yang terukur 9,6:1. Nilai kuningan gelap tetap dipakai
             * di tempat berlatar terang.
             */}
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-200">
              PINDAI · ruang pendana (lihat saja)
            </span>
            <Link
              to="/dashboard"
              className="text-xs font-medium text-white/80 transition-colors hover:text-white"
            >
              Dashboard Peminjam
            </Link>
            <span className="text-[11px] text-white/55">
              {HAK_CIPTA_PINDAI}
            </span>
          </div>
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
