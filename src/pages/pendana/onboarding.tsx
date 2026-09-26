import { useMutation } from "convex/react";
import { ArrowLeft, ArrowRight, Coins, Landmark, Loader2 } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";

/** Kartu informasi untuk peran yang tidak dapat menjadi Pendana. */
export function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
      <Coins className="mx-auto size-5 text-slate-400" />
      <h1 className="mt-4 text-lg font-semibold">{title}</h1>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{body}</p>
      <Button asChild variant="outline" className="mt-6">
        <Link to="/dashboard">
          <ArrowLeft className="mr-2 size-4" />
          Kembali
        </Link>
      </Button>
    </div>
  );
}

/** Onboarding: ajakan menjadi Pendana. */
export function Onboarding() {
  const becomePendana = useMutation(api.pendana.becomePendana);
  const [busy, setBusy] = useState(false);

  return (
    <div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
      <span className="flex size-11 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
        <Landmark className="size-5" strokeWidth={2} />
      </span>
      <p className="mt-4 text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
        Peran Pendana
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Sediakan dana, terima Imbal Hasil.</h1>
      <p className="mt-3 text-sm leading-7 text-muted-foreground">
        Salurkan dana ke pinjaman yang sudah disetujui tim. Anda menerima Imbal
        Hasil 30% dari porsi pokok yang didanai, dibayarkan saat Peminjam melunasi.
      </p>
      <ul className="mt-6 space-y-3 text-sm">
        {[
          ["Setoran terverifikasi", "Dana Anda masuk dompet setelah tim memverifikasi transfer."],
          ["Alokasi transparan", "Anda melihat sisa kebutuhan tiap pinjaman — tidak ada alokasi ganda."],
          ["Pencatatan ganda", "Setiap pergerakan dana tercatat berpasangan di jurnal append-only."],
        ].map(([t, b]) => (
          <li key={t} className="flex gap-3">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
            <span>
              <span className="font-medium">{t}</span>
              <span className="text-muted-foreground"> — {b}</span>
            </span>
          </li>
        ))}
      </ul>

      <Button
        className="mt-8 px-6"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await becomePendana({});
            toast.success("Selamat — Anda kini Pendana. Mulai dengan menyetor dana.");
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Gagal mengubah peran.");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
        Jadi Pendana
        <ArrowRight className="ml-1 size-4" />
      </Button>
    </div>
  );
}
