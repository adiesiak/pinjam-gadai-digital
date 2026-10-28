import { useMutation, useQuery } from "convex/react";
import { FlaskConical, Loader2, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";

/**
 * DATA UJI — angka dan pembersihan untuk AKUN UJI PINJAMAN.
 *
 * Ringkasan admin sudah tidak menghitung baris akun uji, tetapi tim tetap perlu
 * melihat berapa banyak percobaan yang tersimpan. Tindakan hapus dibatasi pada
 * pengajuan yang ditolak/dibatalkan: baris yang sudah cair punya jurnal dan
 * jadwal angsuran, jadi menghapusnya akan meninggalkan dokumen yatim.
 */
export function DataUjiPanel() {
  const ringkas = useQuery(api.dataUji.ringkasanDataUji, {});
  const bersihkan = useMutation(api.dataUji.bersihkanDataUji);
  const [buka, setBuka] = useState(false);
  const [busy, setBusy] = useState(false);

  const jalankan = async () => {
    setBusy(true);
    try {
      const hasil = await bersihkan({ konfirmasi: "BERSIHKAN_DATA_UJI" });
      toast.success(
        hasil.dihapus === 0
          ? "Tidak ada pengajuan uji yang perlu dihapus."
          : `${hasil.dihapus} pengajuan uji dihapus; ${hasil.tersimpan} baris yang sudah cair tetap disimpan.`,
      );
      setBuka(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Gagal membersihkan data uji.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-800">
            <FlaskConical className="size-4" aria-hidden="true" />
          </span>
          <div>
            <h3 className="font-bold text-slate-900">Data Akun Uji</h3>
            <p className="text-xs leading-5 text-muted-foreground">
              Percobaan AKUN UJI PINJAMAN tidak dihitung di ringkasan dan
              analitik. Pengajuan yang ditolak atau dibatalkan bisa dibersihkan;
              yang sudah cair tetap disimpan sebagai jejak.
            </p>
          </div>
        </div>
      </header>

      {ringkas === undefined ? (
        <p className="mt-4 text-xs text-muted-foreground">Membaca data uji…</p>
      ) : !ringkas.akunUjiAda ? (
        <p className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-4 py-5 text-xs text-muted-foreground">
          Akun uji belum dibuat di lingkungan ini.
        </p>
      ) : (
        <>
          <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-xl border border-slate-200 px-3 py-2">
              <dt className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                Total
              </dt>
              <dd className="text-lg font-bold tabular-nums text-slate-900">
                {ringkas.total}
              </dd>
            </div>
            <div className="rounded-xl border border-slate-200 px-3 py-2">
              <dt className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                Bisa dihapus
              </dt>
              <dd className="text-lg font-bold tabular-nums text-amber-800">
                {ringkas.bisaDibersihkan}
              </dd>
            </div>
            <div className="rounded-xl border border-slate-200 px-3 py-2">
              <dt className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                Sudah cair
              </dt>
              <dd className="text-lg font-bold tabular-nums text-emerald-800">
                {ringkas.tersimpan}
              </dd>
            </div>
            <div className="rounded-xl border border-slate-200 px-3 py-2">
              <dt className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                Rincian
              </dt>
              <dd className="text-xs leading-5 tabular-nums text-slate-700">
                {ringkas.pinjaman} pinjaman · {ringkas.gadai} gadai ·{" "}
                {ringkas.kredit} kredit
              </dd>
            </div>
          </dl>

          <AlertDialog open={buka} onOpenChange={setBuka}>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className="mt-3 gap-2 rounded-xl border-amber-300 text-amber-900 hover:bg-amber-50"
                disabled={busy || ringkas.bisaDibersihkan === 0}
              >
                {busy ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Trash2 className="size-3.5" aria-hidden="true" />
                )}
                Bersihkan pengajuan uji
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Hapus pengajuan uji?</AlertDialogTitle>
                <AlertDialogDescription>
                  {ringkas.bisaDibersihkan} pengajuan yang ditolak atau dibatalkan
                  akan dihapus. Pinjaman, gadai, dan kredit uji yang sudah cair
                  tidak disentuh.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={busy}>Batal</AlertDialogCancel>
                <AlertDialogAction
                  disabled={busy}
                  onClick={(event) => {
                    event.preventDefault();
                    void jalankan();
                  }}
                >
                  {busy ? "Menghapus…" : "Hapus pengajuan uji"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </section>
  );
}
