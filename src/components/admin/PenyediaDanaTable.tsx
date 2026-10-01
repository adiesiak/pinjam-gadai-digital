import { useMutation, useQuery } from "convex/react";
import {
  Eye,
  FileText,
  KeyRound,
  Loader2,
  ShieldOff,
  TriangleAlert,
  UserPlus,
  Wallet,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { formatRupiah } from "@/lib/money";

/**
 * Kelola penyedia dana — daftar akun berakses ruang /penyedia-dana beserta
 * posisi dananya.
 *
 * Istilah mengikuti aturan bahasa PINDAI: pihak pemberi dana disebut
 * **Penyedia Dana** (bukan "investor"), dan hak finansialnya **Imbal Hasil**
 * (bukan ROI/return). Seluruh angka diturunkan dari catatan asli — alokasi,
 * setoran, penarikan, dan saldo ledger — bukan nilai cache.
 *
 * Komponen ini tetap baca-saja atas catatan: satu-satunya mutation yang
 * dipanggil adalah `ubahAkses` (pencabutan akses, tercatat di Audit Trail).
 */

/** Format rupiah defensif: satu angka warisan non-bulat tidak boleh melumpuhkan panel. */
function rupiah(nilai: number): string {
  try {
    return formatRupiah(nilai);
  } catch {
    return `Rp ${Number(nilai).toLocaleString("id-ID")}`;
  }
}

function tanggalRingkas(ms: number | null): string {
  if (ms === null) return "—";
  return new Date(ms).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const LABEL_STATUS: Record<string, string> = {
  dialokasikan: "sedang bekerja",
  selesai: "selesai",
  dibatalkan: "dibatalkan",
  menunggu_verifikasi: "menunggu verifikasi",
  terverifikasi: "terverifikasi",
  ditolak: "ditolak",
  menunggu_proses: "menunggu diproses",
  diproses: "diproses",
};

function Kartu({
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

function BarisRincian({ label, nilai }: { label: string; nilai: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 py-2.5 last:border-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-right text-sm font-medium text-slate-900">{nilai}</dd>
    </div>
  );
}

type Alokasi = {
  referensi: string;
  statusPengajuan: string | null;
  pokokPorsi: number;
  imbalHasil: number;
  potonganAdmin: number;
  imbalBersih: number;
  /** true = angka masih perkiraan (alokasi berjalan), false = sudah dibayarkan. */
  perkiraan: boolean;
  status: string;
  waktu: number;
};

/** Tabel alokasi pada dialog rincian (pinjaman atau kredit barang). */
function TabelAlokasi({ judul, rows }: { judul: string; rows: Alokasi[] }) {
  if (rows.length === 0) {
    return (
      <p className="mt-2 text-xs text-muted-foreground">Belum ada alokasi {judul.toLowerCase()}.</p>
    );
  }
  return (
    <div className="mt-2 overflow-x-auto rounded-2xl border border-slate-200">
      <Table>
        <TableHeader>
          <TableRow className="bg-slate-50/80">
            {[
              "Referensi",
              "Pokok porsi",
              "Imbal bruto",
              "Potongan admin",
              "Bersih untuk penyedia",
              "Status",
              "Waktu",
            ].map((kolom) => (
              <TableHead
                key={kolom}
                className="whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500"
              >
                {kolom}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={`${r.referensi}-${r.waktu}`}>
              <TableCell className="whitespace-nowrap font-mono text-xs text-slate-600">
                {r.referensi}
              </TableCell>
              <TableCell className="whitespace-nowrap tabular-nums">{rupiah(r.pokokPorsi)}</TableCell>
              <TableCell className="whitespace-nowrap tabular-nums">{rupiah(r.imbalHasil)}</TableCell>
              <TableCell className="whitespace-nowrap tabular-nums text-amber-700">
                {r.potonganAdmin === 0 ? "—" : `− ${rupiah(r.potonganAdmin)}`}
              </TableCell>
              <TableCell className="whitespace-nowrap font-medium tabular-nums">
                {rupiah(r.imbalBersih)}
                {r.perkiraan && (
                  <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                    (perkiraan)
                  </span>
                )}
              </TableCell>
              <TableCell className="whitespace-nowrap text-xs text-slate-600">
                {LABEL_STATUS[r.status] ?? r.status}
              </TableCell>
              <TableCell className="whitespace-nowrap text-xs text-slate-500">
                {tanggalRingkas(r.waktu)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/** Daftar ringkas setoran/penarikan pada dialog rincian. */
function DaftarRiwayat({
  judul,
  rows,
  kosong,
}: {
  judul: string;
  rows: { referensi: string; jumlah: number; status: string }[];
  kosong: string;
}) {
  return (
    <div>
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
        <FileText className="size-3.5" aria-hidden /> {judul}
      </p>
      {rows.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">{kosong}</p>
      ) : (
        <ul className="mt-2 divide-y divide-slate-100 rounded-2xl border border-slate-200">
          {rows.map((r) => (
            <li
              key={r.referensi}
              className="flex items-center justify-between gap-3 px-3 py-2 text-xs"
            >
              <span className="min-w-0 font-mono text-slate-500">{r.referensi}</span>
              <span className="shrink-0 text-right">
                <span className="block tabular-nums">{rupiah(r.jumlah)}</span>
                <span className="block text-muted-foreground">
                  {LABEL_STATUS[r.status] ?? r.status}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Dialog rincian satu penyedia dana: portofolio, setoran, penarikan. */
function RincianPenyedia({ userId }: { userId: Id<"users"> }) {
  const data = useQuery(api.penyediaDana.rincianInvestor, { userId });

  if (data === undefined) {
    return (
      <p className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Memuat rincian…
      </p>
    );
  }
  if (data === null) {
    return <p className="py-8 text-sm text-muted-foreground">Akun ini tidak ditemukan.</p>;
  }

  return (
    <>
      <section className="mt-2 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
          Pembagian keuntungan · potongan admin {data.ringkasKeuntungan.persenPotonganAdmin}%
        </p>
        <dl className="mt-2 grid gap-x-6 sm:grid-cols-2">
          <BarisRincian label="Total pokok dialokasikan" nilai={rupiah(data.ringkasKeuntungan.pokok)} />
          <BarisRincian
            label="Saldo berjalan (belum kembali)"
            nilai={rupiah(data.ringkasKeuntungan.saldoBerjalan)}
          />
          <BarisRincian
            label="Keuntungan bruto sudah dibayar"
            nilai={rupiah(data.ringkasKeuntungan.brutoTerealisasi)}
          />
          <BarisRincian
            label="Potongan admin (sudah diambil)"
            nilai={<span className="tabular-nums">− {rupiah(data.ringkasKeuntungan.potonganTerealisasi)}</span>}
          />
          <BarisRincian
            label="Keuntungan bersih dibayarkan"
            nilai={<strong>{rupiah(data.ringkasKeuntungan.bersihTerealisasi)}</strong>}
          />
          <BarisRincian
            label="Keuntungan masih berjalan (perkiraan)"
            nilai={rupiah(data.ringkasKeuntungan.bersihDiharapkan)}
          />
        </dl>
        <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
          Angka "sudah dibayar" dibaca dari cap settlement saat pelunasan; angka "berjalan" adalah
          perkiraan dengan kebijakan potongan yang berlaku sekarang, dibulatkan ke bawah sehingga
          sisa rupiah tetap milik penyedia dana.
        </p>
      </section>

      <dl className="mt-4">
        <BarisRincian label="Nama akun" nilai={data.nama} />
        <BarisRincian label="Email" nilai={data.email ?? "tanpa email (sesi kode bersama)"} />
        <BarisRincian
          label="Status akun"
          nilai={
            data.akunBersama
              ? "Pemantau kode akses bersama"
              : data.peranLegacy
                ? `Peran lama: ${data.peran} — belum berakses ruang`
                : data.emailTerverifikasi
                  ? "Penyedia dana · email terverifikasi"
                  : "Penyedia dana · email belum terverifikasi"
          }
        />
        <BarisRincian label="Terdaftar" nilai={tanggalRingkas(data.terdaftarPada)} />
        <BarisRincian
          label="Saldo dompet (ledger)"
          nilai={<span className="tabular-nums">{rupiah(data.saldoDompet)}</span>}
        />
      </dl>

      <section className="mt-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
          Alokasi pinjaman
        </p>
        <TabelAlokasi judul="Pinjaman" rows={data.alokasiPinjaman} />
      </section>

      <section className="mt-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
          Alokasi kredit barang
        </p>
        <TabelAlokasi judul="Kredit barang" rows={data.alokasiKredit} />
      </section>

      <section className="mt-4 grid gap-4 sm:grid-cols-2">
        <DaftarRiwayat judul="Setoran" rows={data.setoran} kosong="Belum ada setoran tercatat." />
        <DaftarRiwayat
          judul="Penarikan"
          rows={data.penarikan}
          kosong="Belum ada penarikan tercatat."
        />
      </section>

      <p className="mt-3 text-[11px] text-muted-foreground">
        Riwayat ditampilkan maksimal {data.batasRiwayat} baris terbaru per bagian.
      </p>
    </>
  );
}

export function PenyediaDanaTable() {
  const [busy, setBusy] = useState<string | null>(null);
  const [rincian, setRincian] = useState<{ userId: Id<"users">; nama: string } | null>(null);
  const data = useQuery(api.penyediaDana.daftarInvestor, {});
  const ubahAkses = useMutation(api.penyediaDana.ubahAkses);

  const cabut = async (email: string | null, nama: string) => {
    if (email === null) {
      toast.error("Akun ini tanpa email; putuskan aksesnya dengan menonaktifkan kode bersama.");
      return;
    }
    setBusy(email);
    try {
      await ubahAkses({ email, aktif: false, alasan: "Dicabut dari panel kelola penyedia dana" });
      toast.success(`Akses ${nama} dicabut.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal mencabut akses.");
    } finally {
      setBusy(null);
    }
  };

  const beri = async (email: string, nama: string) => {
    setBusy(email);
    try {
      await ubahAkses({
        email,
        aktif: true,
        alasan: "Diberi akses dari panel kelola penyedia dana",
      });
      toast.success(`Akses lihat saja diberikan ke ${nama}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal memberi akses.");
    } finally {
      setBusy(null);
    }
  };

  if (data === undefined) {
    return (
      <p className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Memuat posisi penyedia dana…
      </p>
    );
  }

  const { ringkasan, rows } = data;

  return (
    <div className="space-y-5">
      <div className="animate-masuk grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kartu
          label="Penyedia dana"
          nilai={`${ringkasan.jumlahAkses}/${ringkasan.jumlahAkun}`}
          detail="punya akses ruang / akun tercatat"
          icon={<Wallet className="size-4" />}
        />
        <Kartu
          label="Saldo berjalan"
          nilai={rupiah(ringkasan.saldoBerjalan)}
          detail="pokok yang belum kembali"
          icon={<Wallet className="size-4" />}
        />
        <Kartu
          label={`Keuntungan bersih (${ringkasan.persenPotonganAdmin}% ke admin)`}
          nilai={rupiah(ringkasan.imbalBersihDiharapkan)}
          detail={`bruto ${rupiah(ringkasan.imbalBrutoDiharapkan)} − potongan ${rupiah(ringkasan.potonganAdminDiharapkan)}`}
          icon={<Wallet className="size-4" />}
        />
        <Kartu
          label="Saldo dompet"
          nilai={rupiah(ringkasan.saldoDompet)}
          detail="saldo ledger internal, bukan uang tersimpan"
          icon={<Wallet className="size-4" />}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge variant="outline" className="border-slate-200 text-muted-foreground">
          {ringkasan.jumlahPemantau} pemantau kode bersama · {ringkasan.pemantauAktif} aktif
        </Badge>
        <Badge
          variant="outline"
          className={
            ringkasan.setoranMenunggu > 0
              ? "border-amber-200 bg-amber-50 text-amber-800"
              : "border-slate-200 text-muted-foreground"
          }
        >
          {ringkasan.setoranMenunggu} setoran menunggu verifikasi
        </Badge>
        <Badge
          variant="outline"
          className={
            ringkasan.penarikanMenunggu > 0
              ? "border-amber-200 bg-amber-50 text-amber-800"
              : "border-slate-200 text-muted-foreground"
          }
        >
          {ringkasan.penarikanMenunggu} penarikan menunggu diproses
        </Badge>
        <Badge variant="outline" className="border-slate-200 text-muted-foreground">
          total setoran terverifikasi {rupiah(ringkasan.totalSetoran)}
        </Badge>
        <Badge
          variant="outline"
          className="border-emerald-200 bg-emerald-50 text-emerald-800"
        >
          keuntungan bersih sudah dibayar {rupiah(ringkasan.imbalBersihTerealisasi)}
        </Badge>
        <Badge variant="outline" className="border-slate-200 text-muted-foreground">
          total disalurkan {rupiah(ringkasan.totalDisalurkan)}
        </Badge>
        {ringkasan.jumlahPeranLegacy > 0 && (
          <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">
            {ringkasan.jumlahPeranLegacy} akun berperan lama (belum berakses)
          </Badge>
        )}
      </div>

      {ringkasan.jumlahPeranLegacy > 0 && (
        <p className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50/60 px-4 py-3 text-[11px] leading-5 text-amber-900">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Ada akun yang tersimpan dengan peran lama <code>pendana</code>: alokasi, setoran, dan
          saldo ledger mereka tetap tercatat, tetapi peran itu tidak dikenali gerbang ruang — jadi
          mereka belum dapat membuka /penyedia-dana dan tidak melihat berkas pemohon. Tekan{" "}
          <strong>Beri akses</strong> pada barisnya untuk menormalkan peran menjadi penyedia dana
          aktif.
          {ringkasan.jumlahWarisanTanpaJejak > 0
            ? ` ${ringkasan.jumlahWarisanTanpaJejak} akun peran lama tanpa jejak dana dan tanpa email disembunyikan dari tabel.`
            : ""}
        </p>
      )}

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-slate-200 bg-white px-5 py-8 text-center text-sm text-muted-foreground">
          Belum ada akun dengan akses ruang penyedia dana. Beri akses lewat formulir di atas, atau
          terbitkan kode akses bersama.
        </p>
      ) : (
        <div className="animate-masuk overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/80">
                {[
                  "Penyedia dana",
                  "Status",
                  "Alokasi",
                  "Total disalurkan",
                  "Saldo berjalan",
                  `Keuntungan bruto`,
                  `Potongan admin (${ringkasan.persenPotonganAdmin}%)`,
                  "Keuntungan bersih",
                  "Saldo dompet",
                  "Aktivitas terakhir",
                  "Aksi",
                ].map((judul) => (
                  <TableHead
                    key={judul}
                    className="whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500"
                  >
                    {judul}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.userId}>
                  <TableCell className="min-w-[200px] align-top">
                    <p className="font-medium text-slate-900">{r.nama}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {r.email ?? "tanpa email · sesi kode bersama"}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {r.jumlahAlokasi} alokasi · {r.jumlahPeminjam} peminjam · terdaftar{" "}
                      {tanggalRingkas(r.terdaftarPada)}
                    </p>
                  </TableCell>
                  <TableCell className="align-top">
                    <div className="flex flex-wrap gap-1.5">
                      {r.akunBersama ? (
                        <>
                          <Badge className="border-0 bg-violet-100 text-[10px] text-violet-700 hover:bg-violet-100">
                            <KeyRound className="mr-1 size-3" /> kode bersama
                          </Badge>
                          <Badge
                            className={
                              r.aksesAktif
                                ? "border-0 bg-emerald-100 text-[10px] text-emerald-700 hover:bg-emerald-100"
                                : "border-0 bg-slate-100 text-[10px] text-slate-600 hover:bg-slate-100"
                            }
                          >
                            {r.aksesAktif ? "sesi aktif" : "sudah diputus"}
                          </Badge>
                        </>
                      ) : (
                        <>
                          <Badge className="border-0 bg-primary/10 text-[10px] text-accent-foreground hover:bg-primary/10">
                            akses lihat saja
                          </Badge>
                          <Badge
                            className={
                              r.emailTerverifikasi
                                ? "border-0 bg-emerald-100 text-[10px] text-emerald-700 hover:bg-emerald-100"
                                : "border-0 bg-amber-100 text-[10px] text-amber-700 hover:bg-amber-100"
                            }
                          >
                            {r.emailTerverifikasi
                              ? "email terverifikasi"
                              : "email belum terverifikasi"}
                          </Badge>
                          {r.peranLegacy && (
                            <Badge className="border-0 bg-slate-200 text-[10px] text-slate-700 hover:bg-slate-200">
                              peran lama: {r.peran} · belum berakses
                            </Badge>
                          )}
                          {r.peranLegacy && r.email === null && (
                            <Badge
                              variant="outline"
                              className="border-slate-200 text-[10px] text-muted-foreground"
                            >
                              tanpa email — tidak dapat diberi akses
                            </Badge>
                          )}
                        </>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap align-top tabular-nums">
                    {r.jumlahAlokasi}
                  </TableCell>
                  <TableCell className="whitespace-nowrap align-top tabular-nums">
                    {rupiah(r.totalDisalurkan)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap align-top font-medium tabular-nums">
                    {rupiah(r.saldoBerjalan)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap align-top tabular-nums">
                    {rupiah(r.imbalBrutoTerealisasi + r.imbalBrutoDiharapkan)}
                    <span className="mt-0.5 block text-[10px] font-normal text-muted-foreground">
                      {r.jumlahLunas} lunas · {r.jumlahAktif} berjalan
                    </span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap align-top tabular-nums text-amber-700">
                    − {rupiah(r.potonganAdminTerealisasi + r.potonganAdminDiharapkan)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap align-top font-semibold tabular-nums text-emerald-700">
                    {rupiah(r.imbalBersihTerealisasi + r.imbalBersihDiharapkan)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap align-top tabular-nums">
                    {rupiah(r.saldoDompet)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap align-top text-xs text-slate-600">
                    {tanggalRingkas(r.aktivitasTerakhir)}
                  </TableCell>
                  <TableCell className="align-top">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        onClick={() => setRincian({ userId: r.userId, nama: r.nama })}
                      >
                        <Eye className="size-3.5" /> Rincian
                      </Button>
                      {!r.akunBersama && r.email !== null && !r.aksesAktif && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5"
                          disabled={busy === r.email}
                          onClick={() => void beri(r.email as string, r.nama)}
                        >
                          {busy === r.email ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <UserPlus className="size-3.5" />
                          )}
                          Beri akses
                        </Button>
                      )}
                      {!r.akunBersama && r.aksesAktif && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="gap-1.5 text-destructive hover:text-destructive"
                          disabled={busy === r.email}
                          onClick={() => void cabut(r.email, r.nama)}
                        >
                          {busy === r.email ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <ShieldOff className="size-3.5" />
                          )}
                          Cabut
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {data.terpotong && (
        <p className="text-[11px] text-muted-foreground">
          Menampilkan {data.batas} akun pertama saja.
        </p>
      )}

      <p className="flex items-start gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-[11px] leading-5 text-muted-foreground">
        <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-amber-600" aria-hidden />
        Angka di kolom ini adalah catatan internal PINDAI (alokasi, setoran, penarikan, ledger) dan
        bukan bukti mutasi bank. Saldo dompet hanya berlaku di ledger internal.
      </p>

      <Dialog open={rincian !== null} onOpenChange={(open) => (open ? undefined : setRincian(null))}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Rincian {rincian?.nama ?? "penyedia dana"}</DialogTitle>
            <DialogDescription>
              Portofolio alokasi, setoran, dan penarikan akun ini — baca saja. Pencairan dan
              pencatatan dana tetap lewat alur operasional yang ada.
            </DialogDescription>
          </DialogHeader>
          {rincian !== null && <RincianPenyedia userId={rincian.userId} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
