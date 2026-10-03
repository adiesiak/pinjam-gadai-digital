import { useMutation, useQuery } from "convex/react";
import {
  BadgeCheck,
  BanknoteArrowUp,
  Eye,
  FileText,
  KeyRound,
  Loader2,
  ShieldOff,
  TriangleAlert,
  Undo2,
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { formatRupiah } from "@/lib/money";
import {
  LABEL_METODE_TRANSFER,
  LABEL_TRANSFER,
  type RekapTransferPendana,
  type RingkasTransfer,
  type StatusTransfer,
} from "@/lib/transferPendana";

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
 *
 * PENGECUALIAN pencatatan transfer: `catatTransferPendana` dan
 * `batalkanTransferPendana` hanya MENCATAT bahwa admin sudah mentransfer
 * keuntungan penyedia dana di luar sistem, beserta referensi mutasinya —
 * PINDAI tidak memindahkan uang, dan saldo/ledger/status pinjaman tidak
 * tersentuh. Gunanya mencegah keuntungan yang sama ditransfer dua kali.
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
  didanai: "berjalan",
  lunas: "lunas",
  menunggu_verifikasi: "menunggu verifikasi",
  terverifikasi: "terverifikasi",
  ditolak: "ditolak",
  menunggu_proses: "menunggu diproses",
  diproses: "diproses",
};

/** Gaya badge status catatan transfer keuntungan penyedia dana. */
const META_TRANSFER: Record<StatusTransfer, string> = {
  belum_dicatat: "border-0 bg-slate-100 text-slate-600 hover:bg-slate-100",
  dicatat: "border-0 bg-emerald-100 text-emerald-700 hover:bg-emerald-100",
  dibatalkan: "border-0 bg-amber-100 text-amber-800 hover:bg-amber-100",
};

/** Badge kecil status catatan transfer. */
function BadgeTransfer({ ringkas }: { ringkas: RingkasTransfer }) {
  return (
    <Badge className={`${META_TRANSFER[ringkas.status]} text-[10px]`}>
      {ringkas.status === "dicatat" && <BadgeCheck className="mr-1 size-3" />}
      {LABEL_TRANSFER[ringkas.status]}
    </Badge>
  );
}

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

type Pinjaman = {
  loanId: Id<"loans">;
  referensi: string;
  status: string;
  pokokPinjaman: number;
  bunga: number;
  totalLunas: number;
  potonganAdmin: number;
  keuntunganPendana: number;
  keuntunganAdmin: number;
  waktu: number;
  transfer: RingkasTransfer;
};

/** Tabel pinjaman yang didanai pada dialog rincian (model 1 pinjaman = 1 pendana). */
function TabelPinjaman({
  rows,
  onCatat,
  onBatal,
}: {
  rows: Pinjaman[];
  onCatat: (row: Pinjaman) => void;
  onBatal: (row: Pinjaman) => void;
}) {
  if (rows.length === 0) {
    return (
      <p className="mt-2 text-xs text-muted-foreground">
        Belum ada pinjaman yang didanai akun ini.
      </p>
    );
  }
  return (
    <div className="mt-2 overflow-x-auto rounded-2xl border border-slate-200">
      <Table>
        <TableHeader>
          <TableRow className="bg-slate-50/80">
            {[
              "Referensi",
              "Pokok",
              "Bunga",
              "Total kewajiban",
              "Potongan admin",
              "Keuntungan penyedia",
              "Status",
              "Waktu",
              "Transfer keuntungan",
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
              <TableCell className="whitespace-nowrap tabular-nums">
                {rupiah(r.pokokPinjaman)}
              </TableCell>
              <TableCell className="whitespace-nowrap tabular-nums">{rupiah(r.bunga)}</TableCell>
              <TableCell className="whitespace-nowrap tabular-nums text-slate-600">
                {rupiah(r.totalLunas)}
              </TableCell>
              <TableCell className="whitespace-nowrap tabular-nums text-amber-700">
                {r.potonganAdmin === 0 ? "—" : `− ${rupiah(r.potonganAdmin)}`}
              </TableCell>
              <TableCell className="whitespace-nowrap font-medium tabular-nums text-emerald-700">
                {rupiah(r.keuntunganPendana)}
              </TableCell>
              <TableCell className="whitespace-nowrap text-xs text-slate-600">
                {LABEL_STATUS[r.status] ?? r.status}
              </TableCell>
              <TableCell className="whitespace-nowrap text-xs text-slate-500">
                {tanggalRingkas(r.waktu)}
              </TableCell>
              <TableCell className="align-top">
                <div className="flex flex-wrap items-center gap-1.5">
                  <BadgeTransfer ringkas={r.transfer} />
                  {r.status === "lunas" && r.transfer.status !== "dicatat" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1 px-2 text-[11px]"
                      onClick={() => onCatat(r)}
                    >
                      <BanknoteArrowUp className="size-3" /> Catat transfer
                    </Button>
                  )}
                  {r.transfer.status === "dicatat" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 gap-1 px-2 text-[11px] text-amber-700 hover:text-amber-800"
                      onClick={() => onBatal(r)}
                    >
                      <Undo2 className="size-3" /> Batalkan
                    </Button>
                  )}
                  {r.status !== "lunas" && (
                    <span className="text-[10px] text-muted-foreground">
                      menunggu lunas
                    </span>
                  )}
                </div>
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

/**
 * Kartu rekap catatan transfer keuntungan untuk satu penyedia dana.
 *
 * Membedakan tegas dua hal yang mudah tertukar: hak keuntungan (angka
 * perhitungan) dan catatan bahwa admin sudah mentransfernya (angka pembukuan).
 * Yang dilacak di sini hanya yang kedua.
 */
function KartuTransfer({ rekap }: { rekap: RekapTransferPendana }) {
  const adaKewajiban = rekap.jumlahLunas > 0;
  return (
    <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
          <BanknoteArrowUp className="size-3.5" aria-hidden /> Transfer keuntungan pendana
        </p>
        {adaKewajiban && rekap.jumlahBelumDicatat === 0 ? (
          <Badge className="border-0 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
            <BadgeCheck className="mr-1 size-3" /> semua sudah dicatat
          </Badge>
        ) : adaKewajiban ? (
          <Badge className="border-0 bg-amber-100 text-amber-800 hover:bg-amber-100">
            <TriangleAlert className="mr-1 size-3" /> {rekap.jumlahBelumDicatat} belum dicatat
          </Badge>
        ) : (
          <Badge className="border-0 bg-slate-100 text-slate-600 hover:bg-slate-100">
            belum ada kewajiban
          </Badge>
        )}
      </div>

      <dl className="mt-2 grid gap-x-6 sm:grid-cols-2">
        <BarisRincian
          label={`Keuntungan dari pinjaman lunas (${rekap.jumlahLunas})`}
          nilai={rupiah(rekap.keuntunganLunas)}
        />
        <BarisRincian
          label={`Sudah dicatat ditransfer (${rekap.jumlahTercatat})`}
          nilai={
            <span className="tabular-nums text-emerald-700">
              {rupiah(rekap.keuntunganTercatat)}
            </span>
          }
        />
        <BarisRincian
          label="Belum dicatat"
          nilai={
            <strong className="tabular-nums">{rupiah(rekap.keuntunganBelumDicatat)}</strong>
          }
        />
        {rekap.adaBerjalan && (
          <BarisRincian
            label="Masih berjalan"
            nilai={<span className="text-xs text-muted-foreground">belum jatuh tempo</span>}
          />
        )}
      </dl>

      <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
        Hanya pinjaman berstatus <strong>lunas</strong> yang keuntungannya menjadi hak penyedia
        dana. Catatan transfer adalah pembukuan internal PINDAI — bukan bukti mutasi bank dan
        bukan perintah transfer. PINDAI tidak memindahkan uang.
      </p>
    </section>
  );
}

/** Dialog rincian satu penyedia dana: portofolio, setoran, penarikan. */
function RincianPenyedia({
  userId,
  onCatat,
  onBatal,
}: {
  userId: Id<"users">;
  onCatat: (row: Pinjaman) => void;
  onBatal: (row: Pinjaman) => void;
}) {
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
          Bagi hasil · bunga pinjaman {data.ringkasKeuntungan.persenBunga}% · potongan admin{" "}
          {data.ringkasKeuntungan.persenPotonganAdmin}%
        </p>
        <dl className="mt-2 grid gap-x-6 sm:grid-cols-2">
          <BarisRincian
            label="Total pokok didanai"
            nilai={rupiah(data.ringkasKeuntungan.pokok)}
          />
          <BarisRincian
            label="Saldo berjalan (belum kembali)"
            nilai={rupiah(data.ringkasKeuntungan.saldoBerjalan)}
          />
          <BarisRincian
            label="Total bunga pinjaman"
            nilai={rupiah(data.ringkasKeuntungan.totalBunga)}
          />
          <BarisRincian
            label="Potongan admin"
            nilai={
              <span className="tabular-nums">
                − {rupiah(data.ringkasKeuntungan.keuntunganAdmin)}
              </span>
            }
          />
          <BarisRincian
            label="Keuntungan bersih penyedia dana"
            nilai={<strong>{rupiah(data.ringkasKeuntungan.keuntunganPendana)}</strong>}
          />
        </dl>
        <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
          Bunga = pokok × {data.ringkasKeuntungan.persenBunga}%, lalu admin mengambil{" "}
          {data.ringkasKeuntungan.persenPotonganAdmin}% dari pokok + bunga. Sisa rupiah pembulatan
          ke bawah selalu menjadi milik penyedia dana.
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

      <KartuTransfer rekap={data.transfer} />

      <section className="mt-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
          Pinjaman didanai (1 pinjaman = 1 pendana)
        </p>
        <TabelPinjaman rows={data.pinjaman} onCatat={onCatat} onBatal={onBatal} />
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

type SasaranTransfer = {
  loanId: Id<"loans">;
  referensi: string;
  nama: string;
  keuntunganPendana: number;
  ringkas: RingkasTransfer;
};

/**
 * Dialog pencatatan transfer keuntungan penyedia dana.
 *
 * Nominal tidak diketik admin: server menghitungnya ulang dari pokok pinjaman
 * dengan kebijakan yang berlaku. Yang diisi admin hanya metode dan referensi
 * mutasinya. Ini pencatatan pembukuan, bukan perintah transfer — PINDAI tidak
 * memindahkan uang.
 */
function DialogCatatTransfer({
  sasaran,
  onTutup,
  onSimpan,
}: {
  sasaran: SasaranTransfer | null;
  onTutup: () => void;
  onSimpan: (args: {
    loanId: Id<"loans">;
    metode: "transfer_bank" | "e_wallet" | "tunai";
    referensi?: string;
    catatan?: string;
  }) => Promise<unknown>;
}) {
  const [metode, setMetode] = useState<"transfer_bank" | "e_wallet" | "tunai">(
    "transfer_bank",
  );
  const [referensi, setReferensi] = useState("");
  const [catatan, setCatatan] = useState("");
  const [busy, setBusy] = useState(false);

  const tutup = () => {
    if (busy) return;
    setReferensi("");
    setCatatan("");
    setMetode("transfer_bank");
    onTutup();
  };

  const simpan = async () => {
    if (sasaran === null) return;
    setBusy(true);
    try {
      await onSimpan({
        loanId: sasaran.loanId,
        metode,
        referensi: referensi.trim() === "" ? undefined : referensi.trim(),
        catatan: catatan.trim() === "" ? undefined : catatan.trim(),
      });
      toast.success(
        `Catatan transfer ${rupiah(sasaran.keuntunganPendana)} untuk ${sasaran.referensi} disimpan.`,
      );
      tutup();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menyimpan catatan transfer.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={sasaran !== null} onOpenChange={(open) => (open ? undefined : tutup())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Catat transfer keuntungan</DialogTitle>
          <DialogDescription>
            Mencatat bahwa Anda <strong>sudah</strong> mentransfer keuntungan penyedia dana di
            luar sistem. Ini pembukuan internal PINDAI — bukan bukti mutasi bank dan tidak
            memindahkan uang.
          </DialogDescription>
        </DialogHeader>

        {sasaran !== null && (
          <div className="space-y-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3 text-xs">
              <p className="font-medium text-slate-900">{sasaran.nama}</p>
              <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                {sasaran.referensi}
              </p>
              <p className="mt-2 text-[11px] text-muted-foreground">Nominal dihitung server</p>
              <p className="text-base font-semibold tabular-nums text-emerald-700">
                {rupiah(sasaran.keuntunganPendana)}
              </p>
            </div>

            <div>
              <Label htmlFor="transfer-metode" className="text-[11px] text-muted-foreground">
                Metode pengiriman
              </Label>
              <Select
                value={metode}
                onValueChange={(v) => setMetode(v as "transfer_bank" | "e_wallet" | "tunai")}
              >
                <SelectTrigger id="transfer-metode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="transfer_bank">Transfer bank</SelectItem>
                  <SelectItem value="e_wallet">E-wallet</SelectItem>
                  <SelectItem value="tunai">Tunai</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="transfer-ref" className="text-[11px] text-muted-foreground">
                Referensi mutasi (opsional)
              </Label>
              <Input
                id="transfer-ref"
                placeholder="mis. nomor transaksi / berita transfer"
                value={referensi}
                onChange={(e) => setReferensi(e.target.value)}
                disabled={busy}
              />
            </div>

            <div>
              <Label htmlFor="transfer-catatan" className="text-[11px] text-muted-foreground">
                Catatan (opsional)
              </Label>
              <Textarea
                id="transfer-catatan"
                rows={2}
                placeholder="mis. ditransfer bersama pelunasan lain"
                value={catatan}
                onChange={(e) => setCatatan(e.target.value)}
                disabled={busy}
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={tutup} disabled={busy}>
            Batal
          </Button>
          <Button className="gap-2" onClick={() => void simpan()} disabled={busy || sasaran === null}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <BanknoteArrowUp className="size-4" />}
            Catat transfer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Dialog pembatalan catatan transfer — alasan wajib, masuk audit trail. */
function DialogBatalTransfer({
  sasaran,
  onTutup,
  onSimpan,
}: {
  sasaran: SasaranTransfer | null;
  onTutup: () => void;
  onSimpan: (args: { loanId: Id<"loans">; alasan: string }) => Promise<unknown>;
}) {
  const [alasan, setAlasan] = useState("");
  const [busy, setBusy] = useState(false);

  const tutup = () => {
    if (busy) return;
    setAlasan("");
    onTutup();
  };

  const simpan = async () => {
    if (sasaran === null) return;
    if (alasan.trim().length < 3) {
      toast.error("Isi alasan pembatalan (minimal 3 karakter).");
      return;
    }
    setBusy(true);
    try {
      await onSimpan({ loanId: sasaran.loanId, alasan: alasan.trim() });
      toast.success(`Catatan transfer ${sasaran.referensi} dibatalkan.`);
      tutup();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal membatalkan catatan transfer.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={sasaran !== null} onOpenChange={(open) => (open ? undefined : tutup())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Batalkan catatan transfer</DialogTitle>
          <DialogDescription>
            Menandai catatan transfer ini <strong>salah</strong>. Riwayatnya tetap tersimpan di
            audit trail; saldo, ledger, dan status pinjaman tidak berubah, dan tidak ada uang yang
            dikembalikan.
          </DialogDescription>
        </DialogHeader>

        {sasaran !== null && (
          <div className="space-y-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3 text-xs">
              <p className="font-medium text-slate-900">{sasaran.nama}</p>
              <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                {sasaran.referensi}
              </p>
              {sasaran.ringkas.dicatatPada !== null && (
                <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                  Dicatat {tanggalRingkas(sasaran.ringkas.dicatatPada)}
                  {sasaran.ringkas.dicatatOlehLabel !== null
                    ? ` oleh ${sasaran.ringkas.dicatatOlehLabel}`
                    : ""}
                  {sasaran.ringkas.metode !== null
                    ? ` · ${LABEL_METODE_TRANSFER[sasaran.ringkas.metode] ?? sasaran.ringkas.metode}`
                    : ""}
                  {sasaran.ringkas.referensi !== null
                    ? ` · ref ${sasaran.ringkas.referensi}`
                    : ""}
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="transfer-alasan" className="text-[11px] text-muted-foreground">
                Alasan pembatalan
              </Label>
              <Textarea
                id="transfer-alasan"
                rows={2}
                placeholder="mis. salah nominal / penerima keliru"
                value={alasan}
                onChange={(e) => setAlasan(e.target.value)}
                disabled={busy}
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={tutup} disabled={busy}>
            Batal
          </Button>
          <Button
            variant="destructive"
            className="gap-2"
            onClick={() => void simpan()}
            disabled={busy || sasaran === null}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Undo2 className="size-4" />}
            Batalkan catatan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PenyediaDanaTable() {
  const [busy, setBusy] = useState<string | null>(null);
  const [rincian, setRincian] = useState<{ userId: Id<"users">; nama: string } | null>(null);
  const [catat, setCatat] = useState<SasaranTransfer | null>(null);
  const [batal, setBatal] = useState<SasaranTransfer | null>(null);
  const data = useQuery(api.penyediaDana.daftarInvestor, {});
  const ubahAkses = useMutation(api.penyediaDana.ubahAkses);
  const catatTransfer = useMutation(api.penyediaDana.catatTransferPendana);
  const batalkanTransfer = useMutation(api.penyediaDana.batalkanTransferPendana);

  /** Buka dialog catat transfer untuk satu pinjaman lunas. */
  const bukaCatat = (row: Pinjaman, nama: string) => {
    setCatat({
      loanId: row.loanId,
      referensi: row.referensi,
      nama,
      keuntunganPendana: row.keuntunganPendana,
      ringkas: row.transfer,
    });
  };

  /** Buka dialog pembatalan catatan transfer. */
  const bukaBatal = (row: Pinjaman, nama: string) => {
    setBatal({
      loanId: row.loanId,
      referensi: row.referensi,
      nama,
      keuntunganPendana: row.keuntunganPendana,
      ringkas: row.transfer,
    });
  };

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
      <div className="animate-masuk grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
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
          label={`Keuntungan bersih (bunga ${ringkasan.persenBunga}% − admin ${ringkasan.persenPotonganAdmin}%)`}
          nilai={rupiah(ringkasan.keuntunganPendana)}
          detail={`bunga ${rupiah(ringkasan.totalBunga)} − potongan ${rupiah(ringkasan.keuntunganAdmin)}`}
          icon={<Wallet className="size-4" />}
        />
        <Kartu
          label="Belum dicatat transfer"
          nilai={rupiah(ringkasan.keuntunganBelumDicatat)}
          detail={`${ringkasan.pinjamanBelumDicatat} pinjaman lunas tanpa catatan transfer`}
          icon={<BanknoteArrowUp className="size-4" />}
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
          keuntungan bersih penyedia dana {rupiah(ringkasan.keuntunganPendana)}
        </Badge>
        <Badge
          variant="outline"
          className={
            ringkasan.keuntunganBelumDicatat > 0
              ? "border-amber-200 bg-amber-50 text-amber-800"
              : "border-emerald-200 bg-emerald-50 text-emerald-800"
          }
        >
          transfer keuntungan: {rupiah(ringkasan.keuntunganTercatat)} tercatat dari{" "}
          {rupiah(ringkasan.keuntunganLunas)} pinjaman lunas
        </Badge>
        <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">
          keuntungan admin {rupiah(ringkasan.keuntunganAdmin)}
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
          Ada akun yang tersimpan dengan peran lama <code>pendana</code>: pinjaman, setoran, dan
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
                  "Pinjaman",
                  "Total disalurkan",
                  "Saldo berjalan",
                  "Bunga",
                  `Potongan admin (${ringkasan.persenPotonganAdmin}%)`,
                  "Keuntungan pendana",
                  "Transfer keuntungan",
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
                      {r.jumlahPinjaman} pinjaman · {r.jumlahPeminjam} peminjam · terdaftar{" "}
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
                    {r.jumlahPinjaman}
                  </TableCell>
                  <TableCell className="whitespace-nowrap align-top tabular-nums">
                    {rupiah(r.totalDisalurkan)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap align-top font-medium tabular-nums">
                    {rupiah(r.saldoBerjalan)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap align-top tabular-nums">
                    {rupiah(r.totalBunga)}
                    <span className="mt-0.5 block text-[10px] font-normal text-muted-foreground">
                      {r.jumlahAktif} berjalan · {r.jumlahLunas} lunas
                    </span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap align-top tabular-nums text-amber-700">
                    − {rupiah(r.keuntunganAdmin)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap align-top font-semibold tabular-nums text-emerald-700">
                    {rupiah(r.keuntunganPendana)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap align-top">
                    {r.transfer.jumlahLunas === 0 ? (
                      <span className="text-[10px] text-muted-foreground">belum ada pinjaman lunas</span>
                    ) : (
                      <div className="space-y-1">
                        <Badge
                          className={`${META_TRANSFER[
                            r.transfer.jumlahBelumDicatat === 0 ? "dicatat" : "belum_dicatat"
                          ]} text-[10px]`}
                        >
                          {r.transfer.jumlahBelumDicatat === 0 ? (
                            <>
                              <BadgeCheck className="mr-1 size-3" /> semua dicatat
                            </>
                          ) : (
                            <>
                              <TriangleAlert className="mr-1 size-3" />{" "}
                              {r.transfer.jumlahBelumDicatat} belum dicatat
                            </>
                          )}
                        </Badge>
                        <p className="text-[10px] tabular-nums text-muted-foreground">
                          {rupiah(r.transfer.keuntunganTercatat)} dari{" "}
                          {rupiah(r.transfer.keuntunganLunas)}
                        </p>
                      </div>
                    )}
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
        Angka di kolom ini adalah catatan internal PINDAI (pinjaman, setoran, penarikan, ledger) dan
        bukan bukti mutasi bank. Saldo dompet hanya berlaku di ledger internal.
      </p>

      <Dialog open={rincian !== null} onOpenChange={(open) => (open ? undefined : setRincian(null))}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Rincian {rincian?.nama ?? "penyedia dana"}</DialogTitle>
            <DialogDescription>
              Portofolio pinjaman, setoran, dan penarikan akun ini — baca saja. Pencairan dan
              pencatatan dana tetap lewat alur operasional yang ada.
            </DialogDescription>
          </DialogHeader>
          {rincian !== null && (
            <RincianPenyedia
              userId={rincian.userId}
              onCatat={(row) => bukaCatat(row, rincian.nama)}
              onBatal={(row) => bukaBatal(row, rincian.nama)}
            />
          )}
        </DialogContent>
      </Dialog>

      <DialogCatatTransfer
        sasaran={catat}
        onTutup={() => setCatat(null)}
        onSimpan={catatTransfer}
      />

      <DialogBatalTransfer
        sasaran={batal}
        onTutup={() => setBatal(null)}
        onSimpan={batalkanTransfer}
      />
    </div>
  );
}
