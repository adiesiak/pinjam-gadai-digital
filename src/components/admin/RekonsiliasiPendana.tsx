import { useQuery } from "convex/react";
import { CheckCircle2, GitCompareArrows, TriangleAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { MemuatBaris } from "@/components/ui/loading";
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
 * Rekonsiliasi posisi pendana — kecil, baca-saja.
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
  keuntunganAdmin: "potongan admin atas uang kembali",
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

/** Satu baris pendana pada tabel rekonsiliasi. */
function Baris({ r }: { r: BarisRekonsiliasi }) {
  const meta = META_STATUS[r.status];
  return (
    <TableRow>
      <TableCell className="align-top">
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
      <TableCell className="align-top">
        <NilaiBanding panel={r.panel?.jumlahPinjaman ?? null} rekap={r.rekap?.jumlahPinjaman ?? null} rupiah={false} />
      </TableCell>
      <TableCell className="align-top">
        <NilaiBanding panel={r.panel?.saldoBerjalan ?? null} rekap={r.rekap?.saldoBerjalan ?? null} />
      </TableCell>
      <TableCell className="align-top">
        <NilaiBanding panel={r.panel?.totalBunga ?? null} rekap={r.rekap?.totalBunga ?? null} />
      </TableCell>
      <TableCell className="align-top">
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

/**
 * Satu pendana sebagai kartu untuk layar sempit — empat metrik dibaca tanpa
 * digeser mendatar, mengikuti pola kartu pada /penyedia-dana.
 */
function KartuRekonsiliasi({ r }: { r: BarisRekonsiliasi }) {
  const meta = META_STATUS[r.status];
  const metrik = [
    ["Jumlah pinjaman", <NilaiBanding panel={r.panel?.jumlahPinjaman ?? null} rekap={r.rekap?.jumlahPinjaman ?? null} rupiah={false} key="jp" />],
    ["Saldo berjalan", <NilaiBanding panel={r.panel?.saldoBerjalan ?? null} rekap={r.rekap?.saldoBerjalan ?? null} key="sb" />],
    ["Bunga", <NilaiBanding panel={r.panel?.totalBunga ?? null} rekap={r.rekap?.totalBunga ?? null} key="bg" />],
    ["Keuntungan pendana", <NilaiBanding panel={r.panel?.keuntunganPendana ?? null} rekap={r.rekap?.keuntunganPendana ?? null} key="kp" />],
  ] as const;
  return (
    <li className="rounded-2xl border border-slate-200 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="break-words font-medium text-slate-900">{r.nama}</p>
          {r.email !== null && (
            <p className="mt-0.5 break-words text-xs text-muted-foreground">{r.email}</p>
          )}
        </div>
        <Badge className={meta.className}>{meta.label}</Badge>
      </div>
      {r.selisih.length > 0 && (
        <p className="mt-1 text-[11px] text-amber-800">
          Beda: {r.selisih.map((k) => LABEL_METRIK[k]).join(", ")}
        </p>
      )}
      <dl className="mt-3 grid grid-cols-2 gap-2">
        {metrik.map(([label, nilai]) => (
          <div key={label} className="min-w-0 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2">
            <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
              {label}
            </dt>
            <dd className="mt-0.5 break-words text-xs font-medium text-slate-900">{nilai}</dd>
          </div>
        ))}
      </dl>
    </li>
  );
}

export function RekonsiliasiPendana() {
  const panel = useQuery(api.penyediaDana.daftarInvestor, {});
  const ruang = useQuery(api.penyediaDana.daftarPengajuan, {});

  if (panel === undefined || ruang === undefined) {
    return <MemuatBaris teks="Menghitung rekonsiliasi…" className="py-6" />;
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
        <>
          {/* Layar sempit: kartu per pendana — tanpa geser mendatar. */}
          <ul className="mt-3 space-y-3 md:hidden">
            {rows.map((r) => (
              <KartuRekonsiliasi key={`${r.nama}-${r.email ?? ""}`} r={r} />
            ))}
          </ul>

          {/* Layar lebar: tabel yang membungkus teks — tanpa geser mendatar. */}
          <div className="mt-3 hidden overflow-hidden rounded-2xl border border-slate-200 [&>[data-slot=table-container]]:overflow-x-clip md:block">
            <Table className="w-full [&_th]:whitespace-normal [&_td]:whitespace-normal [&_td]:break-words">
              <TableHeader>
                <TableRow className="bg-slate-50/80">
                  {[
                    "Pendana",
                    "Jumlah pinjaman",
                    "Saldo berjalan",
                    "Bunga",
                    "Keuntungan pendana",
                    "Status",
                  ].map((kolom) => (
                    <TableHead
                      key={kolom}
                      className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500"
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
        </>
      )}

      <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
        Angka bersifat baca-saja dan tidak mengubah catatan. Perbedaan biasanya berasal dari nama
        pendana ganda atau pinjaman yang pendananya belum punya akun.
      </p>
    </section>
  );
}
