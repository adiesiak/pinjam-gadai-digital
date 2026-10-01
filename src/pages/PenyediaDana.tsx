import { useQuery } from "convex/react";
import {
  Eye,
  KeyRound,
  Loader2,
  Lock,
  Package,
  ShoppingBag,
  RotateCcw,
  Timer,
  Wallet,
} from "lucide-react";
import { Component, useState, type ReactNode } from "react";
import { Link } from "react-router";

import { RoleDashboardMenu } from "@/components/RoleDashboardMenu";
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
import type {
  BarisGadai,
  BarisKredit,
  BarisPinjaman,
} from "@/convex/penyediaDana";
import { useAuth } from "@/hooks/use-auth";
import { hitungSimulasiBulanan } from "@/lib/bulanan";
import { quoteKreditBarang } from "@/lib/kredit";
import { BULAN_MS, quoteLoan } from "@/lib/loan";
import { formatRupiah } from "@/lib/money";

/**
 * Ruang Penyedia Dana — HANYA BACA.
 *
 * Menampilkan catatan pengajuan Peminjam (pinjaman tunai, gadai, kredit barang)
 * sebagai tabel per kategori kepada akun yang diberi akses lihat saja oleh
 * admin, termasuk pemantau yang masuk dengan kode akses bersama. Halaman ini
 * tidak pernah memanggil mutation apa pun; seluruh pengubahan data tetap di
 * panel admin. Nama lengkap pemohon ditampilkan, tetapi NIK, nomor rekening,
 * nomor WhatsApp, alamat, penghasilan, dan dokumen tidak pernah dikirim ke
 * klien (lihat convex/penyediaDana.ts).
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

/** Kerangka tabel yang bisa digulir mendatar di layar sempit. */
function Tabel({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
      <Table>
        <TableHeader>
          <TableRow className="bg-slate-50/80">
            {head.map((judul) => (
              <TableHead
                key={judul}
                className="whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500"
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

/** Sel nama pemohon + kode pseudonim sebagai kunci stabil. */
function SelNama({ nama, kode }: { nama: string; kode: string | null }) {
  return (
    <TableCell className="min-w-[190px] align-top">
      <p className="font-medium text-slate-900">{nama}</p>
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
      <span className="inline-flex items-center gap-1.5 rounded-full border border-gold/40 bg-gold/10 px-2.5 py-1 text-xs font-medium text-gold-foreground">
        <Wallet className="size-3" aria-hidden /> {pendana}
      </span>
    </TableCell>
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

function DetailPinjaman({ row }: { row: BarisPinjaman }) {
  const tenorBulan = row.tenorBulan;
  const harian = tenorBulan === null ? coba(() => quoteLoan(row.pokokPinjaman)) : null;
  const bulanan =
    tenorBulan === null
      ? null
      : coba(() => hitungSimulasiBulanan(row.pokokPinjaman, tenorBulan));
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
      <BarisDetail label="Nama lengkap" nilai={row.namaLengkap} />
      <BarisDetail label="Kode peminjam" nilai={row.kodePeminjam ?? "belum terbit"} />
      <BarisDetail label="No. referensi" nilai={row.nomorReferensi} />
      <BarisDetail label="Jumlah pinjaman" nilai={rupiah(row.pokokPinjaman)} />
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
      <BarisDetail
        label="Tenor"
        nilai={row.tenorBulan === null ? `${row.tenorHari} hari` : `${row.tenorBulan} bulan`}
      />
      <BarisDetail
        label="Jatuh tempo"
        nilai={jatuhTempo === null ? "belum didanai" : tanggalRingkas(jatuhTempo)}
      />
      <BarisDetail label="Keperluan" nilai={row.tujuan} />
      <BarisDetail label="Pendana" nilai={row.pendana ?? "belum tercatat"} />
      <BarisDetail label="Tanggal pengajuan" nilai={tanggalRingkas(row.diajukanPada)} />
      <BarisDetail label="Status" nilai={<StatusBadge status={row.status} kind="loan" />} />
    </>
  );
}

function DetailGadai({ row }: { row: BarisGadai }) {
  return (
    <>
      <BarisDetail label="Nama lengkap" nilai={row.namaLengkap} />
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
      <BarisDetail label="Nama lengkap" nilai={row.namaLengkap} />
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
      <BarisDetail label="Pendana" nilai={row.pendana ?? "belum tercatat"} />
      <BarisDetail label="Tanggal pengajuan" nilai={tanggalRingkas(row.diajukanPada)} />
      <BarisDetail label="Status" nilai={<BadgeKredit status={row.status} />} />
    </>
  );
}

type IsiDetail =
  | { jenis: "pinjaman"; row: BarisPinjaman }
  | { jenis: "gadai"; row: BarisGadai }
  | { jenis: "kredit"; row: BarisKredit };

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

function IsiRuang() {
  const { user } = useAuth();
  const [tab, setTab] = useState("pinjaman");
  const [detail, setDetail] = useState<IsiDetail | null>(null);

  const role = user?.role;
  // `pengamat` = sesi tamu yang diaktifkan kode akses bersama (lihat saja).
  const bolehLihat = role === "dana" || role === "admin" || role === "pengamat";
  // Query tidak dipanggil sebelum peran diketahui atau tanpa akses; server tetap
  // penjaga utama karena gerbangnya juga dijalankan di sisi Convex.
  const data = useQuery(
    api.penyediaDana.daftarPengajuan,
    user === undefined || !bolehLihat ? ("skip" as const) : {},
  );

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
      <header className="animate-masuk border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link to="/dashboard" className="flex shrink-0 items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
              P
            </span>
            <span className="hidden text-sm font-semibold tracking-[0.14em] sm:block">PINDAI</span>
          </Link>
          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground sm:inline-flex">
              <Eye className="size-3" />
              {role === "pengamat"
                ? "Pemantau akun bersama · lihat saja"
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
                  <Eye className="mr-1 size-3" /> Akses lihat saja
                </Badge>
                <Badge variant="outline" className="border-slate-200 text-muted-foreground">
                  Nama pemohon ditampilkan · NIK &amp; dokumen tetap tertutup
                </Badge>
              </div>
              <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
                Pengajuan Peminjam
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">
                Catatan internal PINDAI untuk pinjaman tunai, gadai, dan kredit barang. Anda hanya
                dapat membaca: tidak ada tindakan alokasi, pencairan, maupun pengubahan status dari
                ruang ini. Nama lengkap pemohon ditampilkan; NIK, nomor rekening, nomor WhatsApp,
                alamat, penghasilan, dan dokumen tidak pernah ditampilkan.
              </p>
            </section>

            <div className="animate-masuk mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <KartuRingkasan
                label="Pinjaman tunai"
                nilai={rupiah(data.ringkasan.nilaiPinjaman)}
                detail={`${data.ringkasan.jumlahPinjaman} pengajuan tercatat`}
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

            <Tabs value={tab} onValueChange={setTab} className="animate-masuk mt-6">
              <TabsList
                aria-label="Kategori pengajuan"
                className="h-auto w-full justify-start gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1.5"
              >
                <TabsTrigger
                  value="pinjaman"
                  className="group h-9 flex-none gap-2 rounded-xl px-3 text-xs font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  <Wallet className="size-3.5" /> Pinjaman
                  <span className="tabular-nums text-muted-foreground group-data-[state=active]:text-primary-foreground">
                    {data.ringkasan.jumlahPinjaman}
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
              </TabsList>

              {/* ===== Pinjaman tunai ===== */}
              <TabsContent value="pinjaman" className="mt-4">
                {data.pinjaman.length === 0 ? (
                  <KeadaanKosong pesan="Belum ada pengajuan pinjaman tunai yang tercatat." />
                ) : (
                  <>
                    <Tabel
                      head={[
                        "No. Ref",
                        "Nama",
                        "Pinjaman",
                        "Tenor",
                        "Tanggal",
                        "Status",
                        "Pendana",
                        "Aksi",
                      ]}
                    >
                      {data.pinjaman.map((row) => (
                        <TableRow key={row._id}>
                          <TableCell className="whitespace-nowrap align-top font-mono text-xs text-slate-500">
                            {row.nomorReferensi}
                          </TableCell>
                          <SelNama nama={row.namaLengkap} kode={row.kodePeminjam} />
                          <TableCell className="whitespace-nowrap align-top font-semibold tabular-nums">
                            {rupiah(row.pokokPinjaman)}
                          </TableCell>
                          <TableCell className="whitespace-nowrap align-top text-slate-600">
                            {row.tenorBulan === null
                              ? `${row.tenorHari} hari`
                              : `${row.tenorBulan} bulan`}
                          </TableCell>
                          <TableCell className="whitespace-nowrap align-top text-slate-600">
                            {tanggalRingkas(row.diajukanPada)}
                          </TableCell>
                          <TableCell className="align-top">
                            <StatusBadge status={row.status} kind="loan" />
                          </TableCell>
                          <SelPendana pendana={row.pendana} />
                          <TableCell className="align-top">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setDetail({ jenis: "pinjaman", row })}
                            >
                              <Eye className="mr-1.5 size-3.5" aria-hidden /> Detail
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </Tabel>
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
                    <Tabel
                      head={["No. Ref", "Nama", "Barang", "Taksiran", "Tanggal", "Status", "Aksi"]}
                    >
                      {data.gadai.map((row) => (
                        <TableRow key={row._id}>
                          <TableCell className="whitespace-nowrap align-top font-mono text-xs text-slate-500">
                            {row.nomorReferensi}
                          </TableCell>
                          <SelNama nama={row.namaLengkap} kode={row.kodePeminjam} />
                          <TableCell className="min-w-[200px] align-top">
                            <p className="text-slate-900">{row.deskripsiBarang}</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">{row.kategori}</p>
                          </TableCell>
                          <TableCell className="whitespace-nowrap align-top font-semibold tabular-nums">
                            {row.nilaiTaksiran === null
                              ? "belum ditaksir"
                              : rupiah(row.nilaiTaksiran)}
                          </TableCell>
                          <TableCell className="whitespace-nowrap align-top text-slate-600">
                            {tanggalRingkas(row.diajukanPada)}
                          </TableCell>
                          <TableCell className="align-top">
                            <StatusBadge status={row.status} kind="pawn" />
                          </TableCell>
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
                    <Tabel
                      head={[
                        "No. Ref",
                        "Nama",
                        "Barang",
                        "Harga",
                        "Tenor",
                        "Tanggal",
                        "Status",
                        "Pendana",
                        "Aksi",
                      ]}
                    >
                      {data.kredit.map((row) => (
                        <TableRow key={row._id}>
                          <TableCell className="whitespace-nowrap align-top font-mono text-xs text-slate-500">
                            {row.nomorReferensi}
                          </TableCell>
                          <SelNama nama={row.namaLengkap} kode={row.kodePeminjam} />
                          <TableCell className="min-w-[190px] align-top">
                            <p className="text-slate-900">{row.namaBarang}</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {row.kategori} · {row.merchant}
                            </p>
                          </TableCell>
                          <TableCell className="whitespace-nowrap align-top font-semibold tabular-nums">
                            {rupiah(row.hargaBarang)}
                          </TableCell>
                          <TableCell className="whitespace-nowrap align-top text-slate-600">
                            {row.tenorBulan} bulan
                          </TableCell>
                          <TableCell className="whitespace-nowrap align-top text-slate-600">
                            {tanggalRingkas(row.diajukanPada)}
                          </TableCell>
                          <TableCell className="align-top">
                            <BadgeKredit status={row.status} />
                          </TableCell>
                          <SelPendana pendana={row.pendana} />
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
                    <CatatanTerpotong terpotong={data.terpotong.kredit} batas={data.batas} />
                  </>
                )}
              </TabsContent>
            </Tabs>

            <p className="mt-6 rounded-2xl border border-slate-200 bg-white px-5 py-4 text-xs leading-6 text-muted-foreground">
              Angka di ruang ini adalah catatan internal PINDAI dan bukan bukti transaksi, jaminan
              pencairan, maupun penawaran. Status mengikuti pencatatan ledger internal.
            </p>
          </>
        )}
      </main>

      <Dialog open={detail !== null} onOpenChange={(open) => (open ? undefined : setDetail(null))}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {detail?.jenis === "pinjaman"
                ? "Detail pinjaman tunai"
                : detail?.jenis === "gadai"
                  ? "Detail gadai"
                  : "Detail kredit barang"}
            </DialogTitle>
            <DialogDescription>
              Catatan internal PINDAI — ruang lihat saja. NIK, nomor rekening, nomor WhatsApp,
              alamat, penghasilan, dan dokumen pemohon tidak ditampilkan di sini.
            </DialogDescription>
          </DialogHeader>
          <dl className="mt-1">
            {detail?.jenis === "pinjaman" && <DetailPinjaman row={detail.row} />}
            {detail?.jenis === "gadai" && <DetailGadai row={detail.row} />}
            {detail?.jenis === "kredit" && <DetailKredit row={detail.row} />}
          </dl>
        </DialogContent>
      </Dialog>

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
