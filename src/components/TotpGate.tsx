import { api } from "@/convex/_generated/api";
import { getSessionId, getClientIp, getUserAgent, deviceLabelFromUa } from "@/lib/session";
import { otpauthUri, totpNow } from "@/lib/totp";
import { Badge } from "@/components/ui/badge";
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
import { Input } from "@/components/ui/input";
import { useMutation, useQuery } from "convex/react";
import { Loader2, ShieldCheck, QrCode, Copy, Check } from "lucide-react";
import { useMemo, useState } from "react";

/**
 * TotpGate — 2FA TOTP untuk Super Admin.
 *
 * Dua mode:
 *  1. Setup (dialog): admin memindai QR di Google Authenticator/Authy lalu
 *     memasukkan kode pertama untuk aktivasi.
 *  2. Gate (fullscreen per sesi): tiap sesi browser baru wajib satu kali kode
 *     TOTP sebelum panel admin terbuka (anti replay per kode 30 detik).
 */
export function TotpSetupDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const status = useQuery(api.security.myTotpStatus, {});
  const startSetup = useMutation(api.security.startTotpSetup);
  const confirm = useMutation(api.security.confirmTotpSetup);
  const disable = useMutation(api.security.disableTotp);
  const [secret, setSecret] = useState<string | null>(null);
  const [kode, setKode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const uri = useMemo(
    () => (secret ? otpauthUri(secret, "admin@pindai.id") : null),
    [secret],
  );

  const handleStart = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await startSetup({});
      setSecret(res.secret);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memulai setup.");
    } finally {
      setBusy(false);
    }
  };

  const handleConfirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await confirm({ kode });
      setSecret(null);
      setKode("");
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kode salah.");
    } finally {
      setBusy(false);
    }
  };

  const handleDisable = async () => {
    setBusy(true);
    setError(null);
    try {
      await disable({ kode });
      setKode("");
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menonaktifkan.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-sky-600" />
            Two-Factor Authentication (TOTP)
          </DialogTitle>
          <DialogDescription>
            Wajib untuk Super Admin. Gunakan Google Authenticator atau Authy.
          </DialogDescription>
        </DialogHeader>

        {status?.aktif ? (
          <div className="space-y-4">
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-800">
              2FA aktif. Panel admin meminta kode TOTP setiap sesi browser baru.
            </div>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Masukkan kode 6 digit saat ini untuk menonaktifkan:
              </p>
              <InputOTP value={kode} onChange={setKode} maxLength={6}>
                <InputOTPGroup>
                  {Array.from({ length: 6 }).map((_, i) => (
                    <InputOTPSlot key={i} index={i} />
                  ))}
                </InputOTPGroup>
              </InputOTP>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Tutup
              </Button>
              <Button
                variant="destructive"
                onClick={handleDisable}
                disabled={busy || kode.length !== 6}
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                Nonaktifkan 2FA
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            {secret === null ? (
              <>
                <p className="text-sm text-muted-foreground">
                  Aktifkan lapisan keamanan kedua: selain masuk, panel admin akan
                  meminta kode dari aplikasi authenticator Anda.
                </p>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button onClick={handleStart} disabled={busy} className="w-full">
                  {busy ? <Loader2 className="size-4 animate-spin" /> : <QrCode className="size-4" />}
                  Mulai Setup QR
                </Button>
              </>
            ) : (
              <>
                <div className="flex flex-col items-center gap-3 rounded-xl border border-sky-100 bg-sky-50/60 p-4">
                  {/* QR ringan tanpa dependensi: gambar QR dari otpauth URI
                      di-render via API publik gratis (ok, sandbox-friendly).
                      Alternatif: scan manual secret di bawah. */}
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(uri ?? "")}`}
                    alt="QR TOTP"
                    className="size-40 rounded-lg bg-white p-1"
                  />
                  <div className="flex w-full items-center gap-2">
                    <Input readOnly value={secret} className="font-mono text-xs" />
                    <Button
                      size="icon"
                      variant="outline"
                      onClick={() => {
                        void navigator.clipboard.writeText(secret ?? "");
                        setCopied(true);
                        window.setTimeout(() => setCopied(false), 1500);
                      }}
                    >
                      {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground text-center">
                    Atau masukkan secret manual ke aplikasi authenticator.
                  </p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Masukkan kode 6 digit dari aplikasi untuk konfirmasi:
                  </p>
                  <InputOTP value={kode} onChange={setKode} maxLength={6}>
                    <InputOTPGroup>
                      {Array.from({ length: 6 }).map((_, i) => (
                        <InputOTPSlot key={i} index={i} />
                      ))}
                    </InputOTPGroup>
                  </InputOTP>
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <DialogFooter>
                  <Button variant="outline" onClick={() => setSecret(null)}>
                    Ulangi
                  </Button>
                  <Button onClick={handleConfirm} disabled={busy || kode.length !== 6}>
                    {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                    Aktifkan 2FA
                  </Button>
                </DialogFooter>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Fullscreen gate — tampil tiap sesi browser baru sebelum panel admin. */
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
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-sky-50 to-white p-6">
      <div className="w-full max-w-sm rounded-2xl border border-sky-100 bg-white p-6 shadow-md shadow-sky-100">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-2xl bg-sky-100 text-2xl">
            🔒
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
