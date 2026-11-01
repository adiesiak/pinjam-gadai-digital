import { useQuery } from "convex/react";
import { Lock, MessageCircle, Wallet } from "lucide-react";

import { FOLIO } from "@/components/penyediaDana/folio";
import { api } from "@/convex/_generated/api";
import { urlChatCs } from "@/lib/kontak";
import { formatRupiah } from "@/lib/money";
import { BIAYA_PENCAIRAN_PERSEN } from "@/lib/withdrawal";
import { cn } from "@/lib/utils";

const LABEL_STATUS: Record<string, string> = {
  menunggu_proses: "Menunggu diproses",
  diproses: "Sudah diproses",
  ditolak: "Ditolak",
};

const KELAS_STATUS: Record<string, string> = {
  menunggu_proses: "border-amber-200 bg-amber-50 text-amber-900",
  diproses: "border-emerald-200 bg-emerald-50 text-emerald-900",
  ditolak: "border-rose-200 bg-rose-50 text-rose-900",
};

function tanggal(ms: number): string {
  return new Date(ms).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Ringkasan dompet pendana.
 *
 * Menjawab pertanyaan yang sebelumnya tidak terlihat di layar: berapa saldo
 * yang benar-benar ada di dompet, berapa yang masih terkunci siklus berjalan,
 * dan berapa yang bisa ditarik. Penarikan sendiri belum bisa dieksekusi karena
 * jalur pembayaran belum dibuka; karena itu kartu ini mengarahkan ke CS, bukan
 * menampilkan tombol yang tidak bisa menyelesaikan uangnya.
 */
export function DompetPendana({ className }: { className?: string }) {
  const dompet = useQuery(api.alokasiDana.myWallet, {});
  const penarikan = useQuery(api.alokasiDana.myWithdrawals, {});

  if (dompet === undefined) {
    return (
      <div
        role="status"
        className={cn(
          "mt-4 h-32 animate-pulse rounded-lg border border-slate-200 bg-slate-50",
          className,
        )}
      >
        <span className="sr-only">Memuat dompet pendana…</span>
      </div>
    );
  }

  const daftar = penarikan ?? [];
  const bisaDitarik = dompet.bisaDitarik;
  const pesanCs = `Halo PINDAI, saya ingin menanyakan penarikan saldo dompet pendana sebesar ${formatRupiah(
    bisaDitarik,
  )}. Mohon informasi kapan pencairan bisa diproses.`;

  return (
    <section
      aria-labelledby="judul-dompet-pendana"
      className={cn("animate-masuk mt-4 px-4 py-3 sm:px-5", FOLIO.kertas, className)}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-slate-200 pb-2">
        <h2 id="judul-dompet-pendana" className={cn(FOLIO.judul, "flex items-center gap-2")}>
          <Wallet className="size-4 text-emerald-700" aria-hidden />
          Dompet pendana
        </h2>
        <p className="max-w-md text-xs leading-5 text-muted-foreground">
          Saldo yang sudah masuk, dana yang masih terkunci siklus, dan saldo yang
          bisa ditarik. Angka ini catatan internal PINDAI, bukan rekening bank.
        </p>
      </div>

      <dl className="mt-3 grid gap-2 sm:grid-cols-3">
        <div className={cn("px-3 py-2.5", FOLIO.jalur)}>
          <dt className={FOLIO.label}>Saldo dompet</dt>
          <dd className="mt-0.5 text-lg font-bold text-navy tabular-nums">
            {formatRupiah(dompet.saldo)}
          </dd>
        </div>
        <div className={cn("px-3 py-2.5", FOLIO.jalur)}>
          <dt className={FOLIO.label}>Terkunci siklus</dt>
          <dd className="mt-0.5 text-lg font-bold text-amber-800 tabular-nums">
            {formatRupiah(dompet.terkunci)}
          </dd>
        </div>
        <div className={cn("px-3 py-2.5", FOLIO.jalur)}>
          <dt className={FOLIO.label}>Bisa ditarik</dt>
          <dd className="mt-0.5 text-lg font-bold text-emerald-800 tabular-nums">
            {formatRupiah(bisaDitarik)}
          </dd>
        </div>
      </dl>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2.5">
        <p className="max-w-2xl text-xs leading-5 text-slate-600">
          <Lock className="mr-1 inline size-3.5 align-[-2px] text-slate-500" aria-hidden />
          Dana yang terkunci belum bisa ditarik sampai siklus 30 hari jatuh tempo.
          Penarikan saldo belum bisa diproses sampai jalur pembayaran aktif.
          Catat kebutuhan lewat CS; biaya pencairan nanti {
            BIAYA_PENCAIRAN_PERSEN
          }% dari nominal.
        </p>
        {bisaDitarik > 0 && (
          <a
            href={urlChatCs(pesanCs)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-emerald-200 bg-white px-3 text-xs font-semibold text-emerald-800 hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2"
          >
            <MessageCircle className="size-3.5" aria-hidden />
            Tanya CS soal penarikan
          </a>
        )}
      </div>

      {daftar.length > 0 && (
        <div className="mt-3 border-t border-slate-200 pt-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            Riwayat penarikan
          </p>
          <ul className="mt-1 divide-y divide-slate-100">
            {daftar.slice(0, 5).map((w) => (
              <li
                key={w._id}
                className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2 text-xs"
              >
                <span className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="font-mono text-[11px] text-slate-500">
                    {w.nomorReferensi}
                  </span>
                  <span className="font-semibold tabular-nums text-navy">
                    {formatRupiah(w.jumlah)}
                  </span>
                  <span className="text-muted-foreground">
                    bersih {formatRupiah(w.jumlahBersih)}
                  </span>
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] text-muted-foreground">
                    {tanggal(w._creationTime)}
                  </span>
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
                      KELAS_STATUS[w.status] ?? "border-slate-200 bg-slate-50 text-slate-700",
                    )}
                  >
                    {LABEL_STATUS[w.status] ?? w.status}
                  </span>
                </span>
                {w.catatanAdmin !== null && w.catatanAdmin.trim() !== "" && (
                  <p className="basis-full text-[11px] leading-5 text-slate-600">
                    Catatan admin: {w.catatanAdmin}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
