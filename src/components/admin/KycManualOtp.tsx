import { useAction, useMutation } from "convex/react";
import { BadgeCheck, Loader2, MessageCircle, ShieldCheck } from "lucide-react";
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
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

/**
 * BUKTI NOMOR WHATSAPP UNTUK KYC MANUAL.
 *
 * Verifikasi manual tidak pernah mengarang bukti OTP: nomor nasabah tetap harus
 * membuktikan dirinya lewat kode. Yang berbeda hanya siapa yang menekan tombol
 * kirim — petugas — karena nasabah sedang dilayani di kantor, bukan di depan
 * layar. Kode dikirim ke nomor nasabah; petugas mengetikkan angka yang
 * disebutkan nasabah, lalu mesin OTP yang sama mencocokkannya.
 *
 * Komponen ini tidak menampilkan kode dan tidak menandai apa pun sendiri: status
 * terverifikasi hanya berubah setelah server mencocokkan hash kode.
 */
export function KycManualOtp({
  userId,
  nomor,
  terverifikasi,
  className,
}: {
  userId: Id<"users">;
  nomor: string | null;
  terverifikasi: boolean;
  className?: string;
}) {
  const [terbuka, setTerbuka] = useState(false);
  const [busy, setBusy] = useState(false);
  const [kode, setKode] = useState("");
  const [pesan, setPesan] = useState<string | null>(null);
  const [galat, setGalat] = useState<string | null>(null);

  const kirim = useAction(api.otpWhatsapp.kirimOtpWaManualAdmin);
  const cocokkan = useMutation(api.otpWhatsapp.verifikasiOtpWaManualAdmin);

  const buka = () => {
    setKode("");
    setPesan(null);
    setGalat(null);
    setTerbuka(true);
  };

  const kirimKode = async () => {
    setBusy(true);
    setGalat(null);
    setPesan(null);
    try {
      const hasil = await kirim({ userId });
      if (hasil.ok) {
        setPesan(`Kode dikirim ke ${hasil.nomor}. Minta nasabah menyebutkan 6 angka itu.`);
      } else {
        setGalat(hasil.pesan);
      }
    } catch (err) {
      setGalat(err instanceof Error ? err.message : "Kode gagal dikirim.");
    } finally {
      setBusy(false);
    }
  };

  const simpan = async () => {
    setBusy(true);
    setGalat(null);
    try {
      const hasil = await cocokkan({ userId, kode: kode.trim() });
      if (hasil.ok) {
        toast.success("Nomor WhatsApp nasabah terbukti lewat OTP. Tercatat di audit trail.");
        setTerbuka(false);
        setKode("");
        setPesan(null);
      } else {
        setGalat(hasil.pesan);
      }
    } catch (err) {
      setGalat(err instanceof Error ? err.message : "Kode gagal dicocokkan.");
    } finally {
      setBusy(false);
    }
  };

  if (terverifikasi) {
    return (
      <span
        className={
          "flex items-center gap-1 rounded-lg bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-800 " +
          (className ?? "")
        }
      >
        <BadgeCheck className="size-3.5 shrink-0" aria-hidden /> WhatsApp terbukti OTP
      </span>
    );
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className={"h-7 gap-1.5 px-2 text-[11px] " + (className ?? "")}
        onClick={buka}
      >
        <MessageCircle className="size-3.5" aria-hidden /> Kirim OTP WhatsApp
      </Button>

      <Dialog open={terbuka} onOpenChange={setTerbuka}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="size-4" aria-hidden /> Buktikan nomor WhatsApp
            </DialogTitle>
            <DialogDescription className="text-xs leading-5">
              Kode 6 angka dikirim ke nomor nasabah, bukan ke perangkat Anda. Nasabah
              menyebutkannya, lalu Anda mengetiknya di sini. Kode berlaku 5 menit dan hanya
              bisa dipakai sekali.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                Nomor tujuan
              </p>
              <p className="mt-0.5 text-sm font-semibold tabular-nums text-navy">
                {nomor ?? "Nomor WhatsApp belum tersimpan"}
              </p>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              disabled={busy || nomor === null}
              onClick={() => void kirimKode()}
            >
              {busy ? (
                <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden />
              ) : (
                <MessageCircle className="mr-1.5 size-3.5" aria-hidden />
              )}
              Kirim kode ke nomor ini
            </Button>

            <div>
              <Label htmlFor="kyc-otp-manual" className="text-[11px] font-semibold text-slate-700">
                Kode dari nasabah
              </Label>
              <Input
                id="kyc-otp-manual"
                value={kode}
                onChange={(e) => setKode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="6 angka"
                className="mt-1 h-10 text-center text-base font-semibold tracking-[0.4em] tabular-nums"
                disabled={busy}
              />
            </div>

            {pesan !== null && (
              <p className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-[11px] leading-5 text-sky-900">
                {pesan}
              </p>
            )}
            {galat !== null && (
              <p
                role="alert"
                className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[11px] leading-5 text-red-800"
              >
                {galat}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setTerbuka(false)} disabled={busy}>
              Batal
            </Button>
            <Button
              type="button"
              disabled={busy || kode.trim().length !== 6}
              onClick={() => void simpan()}
            >
              {busy ? <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden /> : null}
              Simpan bukti
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
