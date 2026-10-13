import { useMutation, useQuery } from "convex/react";
import { Loader2, ShieldAlert, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

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
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";

/**
 * Kill switch & pemeliharaan darurat PINDAI.
 *
 * Tempatnya di sidebar: Keamanan & audit — BUKAN tombol di kepala panel lagi.
 * Tindakan darurat tidak boleh menjadi tombol paling mudah dijangkau saat
 * admin sedang bekerja cepat.
 *
 * Menyalakan kill switch memblokir pengajuan baru. Karena itu eksekusinya
 * mewajibkan admin MENGETIK kata `NONAKTIFKAN` DAN mengisi alasan — bukan
 * sekadar klik dua kali. Mematikannya kembali tidak memerlukan keduanya:
 * tindakan pemulihan harus selalu bisa dilakukan cepat.
 */

/** Kata yang wajib diketik admin sebelum kill switch dinyalakan. */
export const KATA_KONFIRMASI_KILL = "NONAKTIFKAN";

/** Panjang minimum alasan sebelum kill switch boleh dinyalakan. */
export const MIN_ALASAN_KILL = 10;

/**
 * Benar hanya bila teks konfirmasi sama persis dengan `NONAKTIFKAN`
 * (spasi tepi diabaikan, huruf besar/kecil tidak). Dipisah dari komponen
 * supaya bisa diuji tanpa React/DOM — inilah gerbang pengamannya.
 */
export function konfirmasiKillSah(teks: string): boolean {
  return teks.trim().toUpperCase() === KATA_KONFIRMASI_KILL;
}

/** Apakah alasan cukup panjang untuk dicatat admin sebelum memblokir pengajuan. */
export function alasanKillSah(teks: string): boolean {
  return teks.trim().length >= MIN_ALASAN_KILL;
}

/**
 * Dialog konfirmasi ganda. Dipakai bersama oleh tombol header dan panel
 * sidebar supaya aturan pengamannya hanya ada di satu tempat.
 */
export function DialogBekukan({
  open,
  onOpenChange,
  busy,
  onKonfirmasi,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  busy: boolean;
  onKonfirmasi: () => void;
}) {
  const [teks, setTeks] = useState("");
  const [alasan, setAlasan] = useState("");
  const sah = konfirmasiKillSah(teks);
  const alasanSah = alasanKillSah(alasan);

  // Reset saat dialog dibuka ulang: kata kunci dan alasan tidak pernah "terbawa"
  // dari percobaan sebelumnya.
  const ubahTerbuka = (nilai: boolean) => {
    if (!nilai) {
      setTeks("");
      setAlasan("");
    }
    onOpenChange(nilai);
  };

  return (
    <Dialog open={open} onOpenChange={ubahTerbuka}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-700">
            <ShieldAlert className="size-5" aria-hidden="true" />
            Nonaktifkan alur pengajuan baru?
          </DialogTitle>
          <DialogDescription className="leading-6">
            Semua <strong>pengajuan baru diblokir</strong> sampai kill switch dimatikan kembali.
            Transaksi yang sudah berjalan tidak dihapus, dan tindakan ini tercatat di Audit Trail
            beserta akun pelakunya.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="konfirmasi-nonaktifkan">
              Ketik <span className="font-mono font-bold">NONAKTIFKAN</span> untuk melanjutkan
            </Label>
            <Input
              id="konfirmasi-nonaktifkan"
              autoComplete="off"
              autoFocus
              value={teks}
              onChange={(e) => setTeks(e.target.value)}
              placeholder="NONAKTIFKAN"
              aria-invalid={teks !== "" && !sah}
              className="font-mono uppercase"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="alasan-nonaktifkan">
              Alasan pemblokiran (wajib, minimal {MIN_ALASAN_KILL} karakter)
            </Label>
            <Textarea
              id="alasan-nonaktifkan"
              value={alasan}
              onChange={(e) => setAlasan(e.target.value)}
              placeholder="mis. dugaan penyalahgunaan akun; menunggu pemeriksaan tim"
              aria-invalid={alasan !== "" && !alasanSah}
              rows={3}
            />
            <p className="text-[11px] leading-5 text-muted-foreground">
              Pengaman berlapis ini mencegah kill switch aktif karena salah klik. Alasan ini tidak
              ikut terkirim ke server — mutasi <code>system.setKillSwitch</code> hanya menerima
              status aktif/nonaktif — jadi catat juga di tiket atau kanal tim bila perlu ditelusuri.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => ubahTerbuka(false)} disabled={busy}>
            Batal
          </Button>
          <Button
            type="button"
            disabled={!sah || !alasanSah || busy}
            onClick={onKonfirmasi}
            className="bg-red-600 text-white hover:bg-red-700"
          >
            {busy ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null}
            Nonaktifkan alur pengajuan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Panel sidebar: status kill switch, apa yang diblokir, dan tombol eksekusi
 * dengan pengaman ganda. Menggantikan kebutuhan membuka header hanya untuk
 * memeriksa keadaan darurat.
 */
export function KillSwitchPanel() {
  const status = useQuery(api.system.getStatusPublic, {});
  const setKill = useMutation(api.system.setKillSwitch);
  const [dialogTerbuka, setDialogTerbuka] = useState(false);
  const [busy, setBusy] = useState(false);

  const aktif = status?.killSwitch === true;

  const jalankan = async (nilai: boolean) => {
    setBusy(true);
    try {
      await setKill({ aktif: nilai });
      toast.warning(
        nilai
          ? "KILL SWITCH DARURAT DIAKTIFKAN — semua pengajuan diblokir."
          : "Kill switch dinonaktifkan — sistem normal.",
      );
      setDialogTerbuka(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal mengubah kill switch.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <section
        className={`rounded-2xl border p-5 shadow-sm ${
          aktif ? "border-red-200 bg-red-50/60" : "border-slate-200 bg-white"
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-semibold text-navy">
              <ShieldAlert className="size-4 text-red-600" aria-hidden="true" />
              Kill Switch Darurat
            </p>
            <p className="mt-1 max-w-xl text-xs leading-5 text-muted-foreground">
              Mematikan alur pengajuan baru secara menyeluruh. Tidak ada data yang dihapus — status
              pinjaman, ledger, dan audit tetap utuh.
            </p>
          </div>
          <span
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
              aktif
                ? "border-red-200 bg-red-100 text-red-800"
                : "border-emerald-200 bg-emerald-50 text-emerald-700"
            }`}
          >
            {aktif ? (
              <>
                <ShieldAlert className="size-3.5 animate-pulse" aria-hidden="true" /> Aktif —
                pengajuan diblokir
              </>
            ) : (
              <>
                <ShieldCheck className="size-3.5" aria-hidden="true" /> Nonaktif — sistem normal
              </>
            )}
          </span>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {aktif ? (
            <Button
              type="button"
              variant="outline"
              disabled={busy || status === undefined}
              onClick={() => void jalankan(false)}
              className="rounded-full border border-emerald-300 text-emerald-700 hover:bg-emerald-50"
            >
              {busy ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null}
              Matikan kill switch
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              disabled={busy || status === undefined}
              onClick={() => setDialogTerbuka(true)}
              className="rounded-full border border-red-300 text-red-600 hover:bg-red-50"
            >
              <ShieldAlert className="mr-1.5 size-4" aria-hidden="true" />
              Aktifkan kill switch darurat
            </Button>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-sm font-semibold text-navy">Yang diblokir saat kill switch aktif</p>
        <ul className="mt-2 space-y-1.5 text-xs leading-6 text-muted-foreground">
          <li className="flex gap-2">
            <span aria-hidden="true" className="mt-2 size-1 shrink-0 rounded-full bg-red-500" />
            Pengajuan pinjaman, gadai, dan kredit barang baru.
          </li>
          <li className="flex gap-2">
            <span aria-hidden="true" className="mt-2 size-1 shrink-0 rounded-full bg-red-500" />
            Pencatatan pengajuan manual oleh admin.
          </li>
          <li className="flex gap-2">
            <span aria-hidden="true" className="mt-2 size-1 shrink-0 rounded-full bg-emerald-600" />
            Pembacaan data, audit trail, dan backup tetap berjalan seperti biasa.
          </li>
        </ul>
      </section>

      <DialogBekukan
        open={dialogTerbuka}
        onOpenChange={setDialogTerbuka}
        busy={busy}
        onKonfirmasi={() => void jalankan(true)}
      />
    </div>
  );
}
