import { api } from "@/convex/_generated/api";
import { getSessionId, getClientIp, getUserAgent, deviceLabelFromUa } from "@/lib/session";
import { Button } from "@/components/ui/button";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { useMutation } from "convex/react";
import { Loader2, Lock, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";

/**
 * Fullscreen gate — tampil tiap sesi browser baru sebelum panel admin.
 * Anti replay per kode 30 detik, diverifikasi di server.
 */
export function TotpGate({ onVerified }: { onVerified: () => void }) {
  const verify = useMutation(api.security.verifyTotp);
  const [kode, setKode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const sessionId = useMemo(() => getSessionId(), []);

  const handleSubmit = async () => {
    setBusy(true);
    setError(null);
    try {
      const ip = await getClientIp();
      const ua = getUserAgent();
      await verify({
        kode,
        sessionId,
        perangkat: deviceLabelFromUa(ua),
        ip,
      });
      onVerified();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kode salah.");
      setKode("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-2xl bg-sky-100 text-sky-700">
            <Lock className="size-5" strokeWidth={2} />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-slate-900">Verifikasi 2FA</h1>
            <p className="text-xs text-slate-500">
              Masukkan kode dari aplikasi authenticator Anda
            </p>
          </div>
        </div>
        <div className="flex justify-center py-2">
          <InputOTP value={kode} onChange={setKode} maxLength={6}>
            <InputOTPGroup>
              {Array.from({ length: 6 }).map((_, i) => (
                <InputOTPSlot key={i} index={i} />
              ))}
            </InputOTPGroup>
          </InputOTP>
        </div>
        {error && <p className="mt-2 text-center text-sm text-destructive">{error}</p>}
        <Button
          className="mt-4 w-full rounded-full"
          onClick={handleSubmit}
          disabled={busy || kode.length !== 6}
        >
          {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <ShieldCheck className="mr-2 size-4" />}
          Verifikasi & Masuk Panel
        </Button>
        <p className="mt-3 text-center text-[11px] text-slate-400">
          Kode berlaku 30 detik. Ganti kode otomatis — jangan bagikan ke siapa pun.
        </p>
      </div>
    </div>
  );
}
