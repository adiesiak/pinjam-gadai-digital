import { useQuery } from "convex/react";
import { CheckCircle2, GitCompareArrows, Loader2, TriangleAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/convex/_generated/api";
import { formatRupiah } from "@/lib/money";
import {
  bandingkanPendana,
  type BarisRekonsiliasi,
  type MetrikPendana,
  type SumberPendana,
  type StatusRekonsiliasi,
} from "@/lib/rekonsiliasi";

/**
 * Rekonsiliasi posisi penyedia dana — kecil, baca-saja.
 *
 * Membandingkan total tiap pendana antara panel admin ini (`daftarInvestor`)
 * dan rekap ruang /penyedia-dana (`daftarPengajuan.rekapPendana`). Keduanya
 * dihitung dari baris pinjaman yang sama, jadi baris "cocok" berarti kedua
 * permukaan menampilkan angka identik; "selisih"/"tanpa akun" menunjuk masalah
 * pemetaan pendana (nama ganda atau pinjaman tanpa akun), bukan beda rumus.
 */

/** Format rupiah defensif: satu angka warisan non-bulat tidak melumpuhkan panel. */
function nilaiRupiah(n: number): string {
  try {
    return formatRupiah(n);
  } catch {
    return `Rp ${Number(n).toLocaleString("id-ID")}`;
  }
}

const LABEL_METRIK: Record<keyof MetrikPendana, string> = {
  jumlahPinjaman: "jumlah pinjaman",
  totalDisalurkan: "total disalurkan",
  saldoBerjalan: "saldo berjalan",
  totalBunga: "bunga",
  keuntunganPendana: "keuntungan pendana",
  keuntunganAdmin: "potongan admin",
};

const META_STATUS: Record<StatusRekonsiliasi, { label: string; className: string }> = {
  cocok: {
    label: "cocok",
    className: "border-0 bg-emerald-100 text-emerald-700 hover:bg-emerald-100",
  },
  selisih: {
    label: "selisih",
    className: "border-0 bg-amber-100 text-amber-800 hover:bg-amber-100",
  },
  tanpa_rekap: {
    label: "tanpa rekap",
    className: "border-0 bg-slate-200 text-slate-700 hover:bg-slate-200",
  },
  tanpa_akun: {
    label: "tanpa akun",
    className: "border-0 bg-red-100 text-red-700 hover:bg-red-100",
  },
};

/** Satu sel angka: `panel / rekap`, disorot bila kedua sisi berbeda. */
function NilaiBanding({
  panel,
  rekap,
  rupiah = true,
}: {
  panel: number | null;
  rekap: number | null;
  rupiah?: boolean;
}) {
  const beda = panel === null || rekap === null || panel !== rekap;
  const tampil = (v: number | null) =>
    v === null ? "—" : rupiah ? nilaiRupiah(v) : String(v);
  return (
    <span className={beda ? "tabular-nums text-amber-700" : "tabular-nums"}>
      {tampil(panel)} <span className="text-muted-foreground">/</span> {tampil(rekap)}
    </span>
  );
}

/** Satu baris penyedia dana pada tabel rekonsiliasi. */
function Baris({ r }: { r: BarisRekonsiliasi }) {
  const meta = META_STATUS[r.status];
  return (
    <TableRow>
      <TableCell className="min-w-[200px] align-top">
        <p className="font-medium text-slate-900">{r.nama}</p>
        {r.email !== null && (
          <p className="mt-0.5 text-xs text-muted-foreground">{r.email}</p>
        )}
        {r.selisih.length > 0 && (
          <p className="mt-0.5 text-[11px] text-amber-800">
            Beda: {r.selisih.map((k) => LABEL_METRIK[k]).join(", ")}
          </p>
        )}
      </TableCell>
      <TableCell className="whitespace-nowrap align-top">
        <NilaiBanding panel={r.panel?.jumlahPinjaman ?? null} rekap={r.rekap?.jumlahPinjaman ?? null} rupiah={false} />
      </TableCell>
      <TableCell className="whitespace-nowrap align-top">
        <NilaiBanding panel={r.panel?.saldoBerjalan ?? null} rekap={r.rekap?.saldoBerjalan ?? null} />
      </TableCell>
      <TableCell className="whitespace-nowrap align-top">
        <NilaiBanding panel={r.panel?.totalBunga ?? null} rekap={r.rekap?.totalBunga ?? null} />
      </TableCell>
      <TableCell className="whitespace-nowrap align-top">
        <NilaiBanding
          panel={r.panel?.keuntunganPendana ?? null}
          rekap={r.rekap?.keuntunganPendana ?? null}
        />
      </TableCell>
      <TableCell className="align-top">
        <Badge className={meta.className}>{meta.label}</Badge>
      </TableCell>
    </TableRow>
  );
}

export function RekonsiliasiPendana() {
  const panel = useQuery(api.penyediaDana.daftarInvestor, {});
  const ruang = useQuery(api.penyediaDana.daftarPengajuan, {});

  if (panel === undefined || ruang === undefined) {
    return (
      <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Menghitung rekonsiliasi…
      </p>
    );
  }

  const sumberPanel: SumberPendana[] = panel.rows.map((r) => ({
    nama: r.nama,
    email: r.email,
    metrik: {
      jumlahPinjaman: r.jumlahPinjaman,
      totalDisalurkan: r.totalDisalurkan,
      saldoBerjalan: r.saldoBerjalan,
      totalBunga: r.totalBunga,
      keuntunganPendana: r.keuntunganPendana,
      keuntunganAdmin: r.keuntunganAdmin,
    },
  }));
  const sumberRekap: SumberPendana[] = ruang.rekapPendana.map((r) => ({
    nama: r.nama,
    metrik: {
      jumlahPinjaman: r.jumlahPinjaman,
      totalDisalurkan: r.totalDisalurkan,
      saldoBerjalan: r.saldoBerjalan,
      totalBunga: r.totalBunga,
      keuntunganPendana: r.keuntunganPendana,
      keuntunganAdmin: r.keuntunganAdmin,
    },
  }));

  const { rows, ringkasan } = bandingkanPendana(sumberPanel, sumberRekap);
  const semuaCocok = ringkasan.jumlahPendana > 0 && ringkasan.cocok === ringkasan.jumlahPendana;
  const adaMasalah = ringkasan.selisih + ringkasan.tanpaRekap + ringkasan.tanpaAkun > 0;

  return (
    <section className="animate-masuk rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <GitCompareArrows className="size-4 text-primary" /> Rekonsiliasi pendana
        </p>
        {semuaCocok ? (
          <Badge className="border-0 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
            <CheckCircle2 className="mr-1 size-3" /> semua cocok
          </Badge>
        ) : (
          adaMasalah && (
            <Badge className="border-0 bg-amber-100 text-amber-800 hover:bg-amber-100">
              <TriangleAlert className="mr-1 size-3" /> perlu ditinjau
            </Badge>
          )
        )}
      </div>

      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        Membandingkan panel ini dengan rekap ruang <strong>/penyedia-dana</strong>. Sel berbentuk{" "}
        <span className="font-medium text-slate-700">panel / rekap</span>. Keduanya dihitung dari
        baris pinjaman yang sama, jadi selisih menandakan pemetaan pendana — bukan perbedaan rumus.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <Badge variant="outline" className="border-slate-200 text-muted-foreground">
          {ringkasan.jumlahPendana} pendana
        </Badge>
        <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-800">
          {ringkasan.cocok} cocok
        </Badge>
        {ringkasan.selisih > 0 && (
          <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">
            {ringkasan.selisih} selisih
          </Badge>
        )}
        {ringkasan.tanpaRekap > 0 && (
          <Badge variant="outline" className="border-slate-200 text-muted-foreground">
            {ringkasan.tanpaRekap} tanpa rekap
          </Badge>
        )}
        {ringkasan.tanpaAkun > 0 && (
          <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">
            {ringkasan.tanpaAkun} tanpa akun
          </Badge>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="mt-3 rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-6 text-center text-xs text-muted-foreground">
          Belum ada posisi pendana pada kedua permukaan untuk dibandingkan.
        </p>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-2xl border border-slate-200">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/80">
                {[
                  "Penyedia dana",
                  "Jumlah pinjaman",
                  "Saldo berjalan",
                  "Bunga",
                  "Keuntungan pendana",
                  "Status",
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
                <Baris key={`${r.nama}-${r.email ?? ""}`} r={r} />
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
        Angka bersifat baca-saja dan tidak mengubah catatan. Perbedaan biasanya berasal dari nama
        pendana ganda atau pinjaman yang pendananya belum punya akun.
      </p>
    </section>
  );
}
