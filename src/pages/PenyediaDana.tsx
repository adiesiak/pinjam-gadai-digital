import { useQuery } from "convex/react";
import {
  Eye,
  Loader2,
  Lock,
  Package,
  ShoppingBag,
  Timer,
  Wallet,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";

import { RoleDashboardMenu } from "@/components/RoleDashboardMenu";
import { StatusBadge } from "@/components/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import { formatRupiah } from "@/lib/money";

/**
 * Ruang Penyedia Dana — HANYA BACA.
 *
 * Menampilkan catatan pengajuan Peminjam (pinjaman tunai, gadai, kredit barang)
 * kepada akun yang diberi akses lihat saja oleh admin. Halaman ini tidak pernah
 * memanggil mutation apa pun; seluruh pengubahan data tetap di panel admin.
 * Identitas pemohon tampil sebagai kode pseudonim — NIK, nomor rekening, dan
 * dokumen tidak pernah dikirim ke klien (lihat convex/penyediaDana.ts).
 */

function tanggalRingkas(ms: number): string {
  return new Date(ms).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
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
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Button asChild>
          <Link to="/dashboard">Buka dashboard Peminjam</Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/">Kembali ke beranda</Link>
        </Button>
      </div>
    </section>
  );
}

export default function PenyediaDana() {
  const { user } = useAuth();
  const [tab, setTab] = useState("pinjaman");

  const role = user?.role;
  const bolehLihat = role === "dana" || role === "admin";
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
              <Eye className="size-3" /> Ruang penyedia dana · lihat saja
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
                  Identitas ditampilkan sebagai kode pseudonim
                </Badge>
              </div>
              <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
                Pengajuan Peminjam
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">
                Catatan internal PINDAI untuk pinjaman tunai, gadai, dan kredit barang. Anda hanya
                dapat membaca: tidak ada tindakan alokasi, pencairan, maupun pengubahan status dari
                ruang ini. Nomor rekening, NIK, nomor WhatsApp, dan dokumen tidak pernah
                ditampilkan.
              </p>
            </section>

            <div className="animate-masuk mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <KartuRingkasan
                label="Pinjaman tunai"
                nilai={formatRupiah(data.ringkasan.nilaiPinjaman)}
                detail={`${data.ringkasan.jumlahPinjaman} pengajuan tercatat`}
                icon={<Wallet className="size-4" />}
              />
              <KartuRingkasan
                label="Gadai barang"
                nilai={formatRupiah(data.ringkasan.nilaiGadai)}
                detail={`${data.ringkasan.jumlahGadai} pengajuan · nilai taksiran tercatat`}
                icon={<Package className="size-4" />}
              />
              <KartuRingkasan
                label="Kredit barang"
                nilai={formatRupiah(data.ringkasan.nilaiKredit)}
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
                  <ul className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
                    {data.pinjaman.map((row) => (
                      <li
                        key={row._id}
                        className="flex flex-wrap items-start justify-between gap-3 px-5 py-4"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold tabular-nums">
                              {row.nomorReferensi}
                            </span>
                            <BadgePseudonim kode={row.kodePeminjam} />
                          </div>
                          <p className="mt-1.5 text-sm">{row.tujuan}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            Tenor{" "}
                            {row.tenorBulan !== null
                              ? `${row.tenorBulan} bulan`
                              : `${row.tenorHari} hari`}{" "}
                            · diajukan {tanggalRingkas(row.diajukanPada)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold tabular-nums">
                            {formatRupiah(row.pokokPinjaman)}
                          </p>
                          <div className="mt-1.5 flex justify-end">
                            <StatusBadge status={row.status} kind="loan" />
                          </div>
                        </div>
                      </li>
                    ))}
                    <CatatanTerpotong
                      terpotong={data.terpotong.pinjaman}
                      batas={data.batas}
                    />
                  </ul>
                )}
              </TabsContent>

              {/* ===== Gadai ===== */}
              <TabsContent value="gadai" className="mt-4">
                {data.gadai.length === 0 ? (
                  <KeadaanKosong pesan="Belum ada pengajuan gadai yang tercatat." />
                ) : (
                  <ul className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
                    {data.gadai.map((row) => (
                      <li
                        key={row._id}
                        className="flex flex-wrap items-start justify-between gap-3 px-5 py-4"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold tabular-nums">
                              {row.nomorReferensi}
                            </span>
                            <BadgePseudonim kode={row.kodePeminjam} />
                          </div>
                          <p className="mt-1.5 text-sm">
                            {row.kategori} · {row.deskripsiBarang}
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            diajukan {tanggalRingkas(row.diajukanPada)} · nilai taksiran mengikuti
                            catatan reviewer
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold tabular-nums">
                            {row.nilaiTaksiran === null
                              ? "belum ditaksir"
                              : formatRupiah(row.nilaiTaksiran)}
                          </p>
                          <div className="mt-1.5 flex justify-end">
                            <StatusBadge status={row.status} kind="pawn" />
                          </div>
                        </div>
                      </li>
                    ))}
                    <CatatanTerpotong terpotong={data.terpotong.gadai} batas={data.batas} />
                  </ul>
                )}
              </TabsContent>

              {/* ===== Kredit barang ===== */}
              <TabsContent value="kredit" className="mt-4">
                {data.kredit.length === 0 ? (
                  <KeadaanKosong pesan="Belum ada pengajuan kredit barang yang tercatat." />
                ) : (
                  <ul className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
                    {data.kredit.map((row) => (
                      <li
                        key={row._id}
                        className="flex flex-wrap items-start justify-between gap-3 px-5 py-4"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold tabular-nums">
                              {row.nomorReferensi}
                            </span>
                            <BadgePseudonim kode={row.kodePeminjam} />
                          </div>
                          <p className="mt-1.5 text-sm">
                            {row.namaBarang} · {row.merchant}
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {row.kategori} · DP {row.dpPersen}% · {row.tenorBulan} bulan ·
                            Imbal Hasil {row.marginPersenPerBulan}%/bulan · diajukan{" "}
                            {tanggalRingkas(row.diajukanPada)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold tabular-nums">
                            {formatRupiah(row.hargaBarang)}
                          </p>
                          <div className="mt-1.5 flex justify-end">
                            <BadgeKredit status={row.status} />
                          </div>
                        </div>
                      </li>
                    ))}
                    <CatatanTerpotong terpotong={data.terpotong.kredit} batas={data.batas} />
                  </ul>
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
