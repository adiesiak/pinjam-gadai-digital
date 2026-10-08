import { Loader2, Siren } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { LABEL_SUBJEK, type KelompokYatim } from "@/lib/ledgerYatim";
import { formatRupiah } from "@/lib/money";

/**
 * Jurnal yang subjeknya sudah tidak ada — mis. pinjaman/gadai/kredit yang
 * dihapus admin lewat jalur "hapus menyeluruh".
 *
 * Kenapa sengaja bukan galat: jurnal ledger append-only, jadi menghapus
 * subjeknya TIDAK menghapus catatan keuangannya. Panel ini yang membuat
 * akibatnya terlihat — sisa saldo akun, jumlah entri, dan grup jurnal untuk
 * ditelusuri — bukan menghilangkannya diam-diam.
 *
 * Komponen ini murni presentasional (`data` sebagai prop) supaya bisa diuji
 * lewat renderToStaticMarkup tanpa Convex maupun DOM.
 */
export function LedgerYatimPanel({
  data,
}: {
  data:
    | {
        akun: number;
        entri: number;
        nilai: number;
        kelompok: KelompokYatim[];
      }
    | undefined;
}) {
  if (data === undefined) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Memeriksa jurnal tanpa subjek…
      </div>
    );
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-navy">
            <Siren className="size-4" aria-hidden /> Jurnal tanpa subjek
          </p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Penghapusan menyeluruh tidak menyentuh jurnal ledger (append-only). Entri di bawah ini
            menunjuk data yang sudah tidak ada — sisanya adalah jejak keuangan yang sengaja
            dipertahankan.
          </p>
        </div>
        <Badge
          className={
            data.akun === 0
              ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100"
              : "bg-amber-100 text-amber-800 hover:bg-amber-100"
          }
        >
          {data.akun === 0 ? "Bersih" : `${data.akun} akun`}
        </Badge>
      </div>

      {data.akun === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-6 text-center text-xs text-muted-foreground">
          Semua entri jurnal menunjuk data yang masih ada.
        </p>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-3 gap-3">
            {([
              ["Akun yatim", `${data.akun}`],
              ["Entri jurnal", `${data.entri}`],
              ["Nilai entri", formatRupiah(data.nilai)],
            ] as const).map(([label, nilai]) => (
              <div key={label} className="rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-3">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="mt-1 text-sm font-semibold tabular-nums text-navy">{nilai}</p>
              </div>
            ))}
          </div>

          <ul className="mt-4 divide-y divide-slate-100">
            {data.kelompok.map((k) => (
              <li key={k.akun} className="py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <Badge variant="outline" className="text-[10px] uppercase">
                      {LABEL_SUBJEK[k.jenis]}
                    </Badge>
                    <span className="truncate font-mono text-xs text-navy">{k.akun}</span>
                  </div>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {k.jumlahEntri} entri · saldo {formatRupiah(k.saldo)}
                  </span>
                </div>
                <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                  Terakhir {new Date(k.waktuTerakhir).toLocaleString("id-ID")} · debit{" "}
                  {formatRupiah(k.totalDebit)} · kredit {formatRupiah(k.totalKredit)}
                  {k.keteranganTerakhir !== "" && ` · ${k.keteranganTerakhir}`}
                </p>
                {k.grup.length > 0 && (
                  <p className="mt-1 flex flex-wrap gap-1.5">
                    {k.grup.map((grup) => (
                      <span
                        key={grup}
                        className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600"
                      >
                        {grup}
                      </span>
                    ))}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
