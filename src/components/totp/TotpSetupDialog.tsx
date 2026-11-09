import { api } from "@/convex/_generated/api";
import { otpauthUri } from "@/lib/totp";
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
import { useQrDataUrl } from "@/hooks/use-qr";
import { useMutation, useQuery } from "convex/react";
import { Loader2, ShieldCheck, QrCode, Copy, Check } from "lucide-react";
import { useMemo, useState } from "react";

/**
 * Dialog setup/uninstall 2FA TOTP: admin memindai QR di Google
 * Authenticator/Authy lalu memasukkan kode pertama untuk aktivasi.
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
    () => (secret ? otpauthUri(secret, "admin@pindai.biz.id") : null),
    [secret],
  );
  // QR dibuat di perangkat. Secret TOTP tidak boleh dikirim ke layanan gambar
  // pihak ketiga, bahkan lewat URL query yang mungkin tercatat di log mereka.
  const qr = useQrDataUrl(uri);

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

  const handleConfirm = async (nilai: string = kode) => {
    if (busy || nilai.length !== 6) return;
    setBusy(true);
    setError(null);
    try {
      await confirm({ kode: nilai });
      setSecret(null);
      setKode("");
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kode salah.");
    } finally {
      setBusy(false);
    }
  };

  const handleDisable = async (nilai: string = kode) => {
    if (busy || nilai.length !== 6) return;
    setBusy(true);
    setError(null);
    try {
      await disable({ kode: nilai });
      setKode("");
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menonaktifkan.");
    } finally {
      setBusy(false);
    }
  };

  // Begitu 6 digit terisi, jalankan aksi yang sesuai (nonaktifkan atau
  // konfirmasi aktivasi) tanpa perlu menekan tombol.
  const ubahKode = (nilai: string) => {
    setKode(nilai);
    if (nilai.length !== 6 || busy) return;
    if (status?.aktif) void handleDisable(nilai);
    else if (secret !== null) void handleConfirm(nilai);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto p-4 rounded-2xl sm:max-w-md sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-sky-600" />
            Autentikasi dua faktor (TOTP)
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
              <InputOTP value={kode} onChange={ubahKode} maxLength={6}>
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
                onClick={() => void handleDisable()}
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
                  {/* QR dibuat lokal dari otpauth URI; secret tidak keluar dari
                      peramban. Bila pembuatan QR gagal, secret manual di bawah
                      tetap bisa dipakai. */}
                  {qr ? (
                    <img
                      src={qr}
                      alt="QR TOTP"
                      className="size-40 rounded-lg bg-white p-1"
                    />
                  ) : (
                    <div
                      role="status"
                      className="flex size-40 flex-col items-center justify-center gap-2 rounded-lg bg-white p-2 text-center text-xs text-muted-foreground"
                    >
                      <QrCode className="size-6" aria-hidden />
                      Menyiapkan QR… gunakan secret manual bila tidak muncul.
                    </div>
                  )}
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
                  <InputOTP value={kode} onChange={ubahKode} maxLength={6}>
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
                  <Button onClick={() => void handleConfirm()} disabled={busy || kode.length !== 6}>
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
