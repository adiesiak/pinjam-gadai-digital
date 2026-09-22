import { api } from "@/convex/_generated/api";
import { getClientIp, getUserAgent } from "@/lib/session";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { useAction, useMutation } from "convex/react";
import { Loader2, MessageCircle, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

/**
 * WaOtpDialog — verifikasi OTP WhatsApp untuk transaksi finansial Pendana
 * (alokasi dana di marketplace & penarikan dana ke rekening).
 *
 * Alur: minta kode → kode 6 digit dikirim via gateway WA → verifikasi sekali
 * pakai (5 menit) → callback onVerified melanjutkan transaksi.
 */
export function WaOtpDialog({
  open,
  onOpenChange,
  tujuan,
  alasan,
  onVerified,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Nomor WhatsApp tujuan (format 62…). */
  tujuan: string;
  /** Label alasan verifikasi, mis. "Alokasi Dana" / "Penarikan Dana". */
  alasan: string;
  /** Dipanggil setelah kode terverifikasi — lanjutkan transaksi di sini. */
  onVerified: () => void;
}) {
  const requestOtp = useAction(api.security.requestWaOtp);
  const verifyOtp = useMutation(api.security.verifyWaOtp);
  const [kode, setKode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modeUji, setModeUji] = useState(false);

  const handleRequest = async () => {
    setBusy(true);
    setError(null);
    try {
      const ip = await getClientIp();
      const res = await requestOtp({
        tujuan,
        ip,
        userAgent: getUserAgent(),
        alasan,
      });
      if (res.ok) {
        toast.success(`Kode OTP dikirim ke WhatsApp ${tujuan.slice(-4).padStart(tujuan.length, "•")}`);
      } else {
        setModeUji(true);
        toast.warning(
          "Gateway WhatsApp belum aktif — kode tercatat di log admin (mode uji).",
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mengirim kode.");
    } finally {
      setBusy(false);
    }
  };

  const handleVerify = async () => {
    setBusy(true);
    setError(null);
    try {
      const ip = await getClientIp();
      await verifyOtp({ kode, ip, userAgent: getUserAgent() });
      toast.success("Verifikasi berhasil.");
      setKode("");
      onVerified();
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kode salah.");
      setKode("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="size-5 text-sky-600" />
            Verifikasi WhatsApp — {alasan}
          </DialogTitle>
          <DialogDescription>
            Kode 6 digit dikirim ke WhatsApp Anda. Berlaku 5 menit, sekali pakai.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Button
            variant="outline"
            className="w-full"
            onClick={handleRequest}
            disabled={busy || tujuan.length < 8}
          >
            {busy ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <MessageCircle className="mr-2 size-4" />
            )}
            Minta Kode OTP
          </Button>

          <div className="flex justify-center">
            <InputOTP value={kode} onChange={setKode} maxLength={6}>
              <InputOTPGroup>
                {Array.from({ length: 6 }).map((_, i) => (
                  <InputOTPSlot key={i} index={i} />
                ))}
              </InputOTPGroup>
            </InputOTP>
          </div>

          {error && <p className="text-center text-sm text-destructive">{error}</p>}
          {modeUji && (
            <p className="rounded-lg bg-amber-50 border border-amber-200 p-2 text-center text-xs text-amber-700">
              Mode uji: kode tercatat di log WhatsApp admin (tab Pengaturan/WhatsApp).
            </p>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Batal
            </Button>
            <Button
              onClick={handleVerify}
              disabled={busy || kode.length !== 6}
              className="flex-1"
            >
              {busy ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <ShieldCheck className="mr-2 size-4" />
              )}
              Verifikasi
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
