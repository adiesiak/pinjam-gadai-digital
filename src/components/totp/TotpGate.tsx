import { api } from "@/convex/_generated/api";
import { getClientIp, getUserAgent, deviceLabelFromUa } from "@/lib/session";
import { ambilTokenPerangkat, lupakanTokenPerangkat, simpanTokenPerangkat } from "@/lib/perangkatPercaya";
import { Button } from "@/components/ui/button";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { useMutation } from "convex/react";
import { Loader2, Lock, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/**
 * Fullscreen gate — tampil tiap sesi browser baru sebelum panel admin.
 * Anti replay per kode 30 detik, diverifikasi di server.
 *
 * Bila perangkat ini sudah pernah mencentang "Ingat perangkat ini", token
 * tersimpan dipakai otomatis untuk melewati gate tanpa mengetik kode lagi.
 */
export function TotpGate() {
  const verify = useMutation(api.security.verifyTotp);
  const cobaPerangkat = useMutation(api.security.cobaPerangkatPercaya);
  const [kode, setKode] = useState("");
  const [ingat, setIngat] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [memeriksa, setMemeriksa] = useState(() => ambilTokenPerangkat() !== null);
  const sudahCoba = useRef(false);

  // Coba pakai token perangkat tersimpan lebih dulu — supaya tidak selalu
  // mengetik kode di perangkat yang sama. Dijalankan sekali per mount.
  useEffect(() => {
    if (sudahCoba.current) return;
    sudahCoba.current = true;
    const token = ambilTokenPerangkat();
    // Tanpa token, `memeriksa` sudah bernilai false sejak state awal — tidak
    // perlu (dan tidak boleh) di-set ulang di dalam effect.
    if (token === null) return;
    let batal = false;
    void (async () => {
      try {
        const ip = await getClientIp();
        const ua = getUserAgent();
        const hasil = await cobaPerangkat({
          token,
          perangkat: deviceLabelFromUa(ua),
          ip,
        });
        if (!hasil.ok && !batal) {
          // Token kedaluwarsa/dicabut — bersihkan agar tidak dicoba ulang.
          lupakanTokenPerangkat();
        }
        // Sukses: gate status reaktif berubah dan komponen ini unmount.
      } catch {
        // Gagal memeriksa — biarkan form kode tampil sebagai fallback.
      } finally {
        if (!batal) setMemeriksa(false);
      }
    })();
    return () => {
      batal = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Terima nilai eksplisit agar auto-submit memakai kode yang baru diketik
  // (bukan state lama yang belum ter-render).
  const handleSubmit = async (nilai: string = kode) => {
    if (busy || nilai.length !== 6) return;
    setBusy(true);
    setError(null);
    try {
      const ip = await getClientIp();
      const ua = getUserAgent();
      const hasil = await verify({
        kode: nilai,
        perangkat: deviceLabelFromUa(ua),
        ip,
        ingatPerangkat: ingat,
      });
      if (!hasil.ok) {
        setError(hasil.pesan ?? "Kode TOTP salah.");
        setKode("");
        return;
      }
      if (hasil.tokenPerangkat) simpanTokenPerangkat(hasil.tokenPerangkat);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kode salah.");
      setKode("");
    } finally {
      setBusy(false);
    }
  };

  // Begitu 6 digit terisi, verifikasi langsung tanpa menekan tombol/Enter.
  const ubahKode = (nilai: string) => {
    setKode(nilai);
    if (nilai.length === 6) void handleSubmit(nilai);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-2xl bg-sky-100 text-sky-700">
            <Lock className="size-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-slate-900">Verifikasi 2FA</h1>
            <p className="text-xs text-slate-500">
              Masukkan kode dari aplikasi authenticator Anda
            </p>
          </div>
        </div>

        {memeriksa ? (
          <p className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Memeriksa perangkat ini…
          </p>
        ) : (
          <>
            <div className="flex justify-center py-2">
              <InputOTP value={kode} onChange={ubahKode} maxLength={6}>
                <InputOTPGroup>
                  {Array.from({ length: 6 }).map((_, i) => (
                    <InputOTPSlot key={i} index={i} />
                  ))}
                </InputOTPGroup>
              </InputOTP>
            </div>
            <label className="mt-3 flex cursor-pointer items-center justify-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                className="size-4 accent-sky-600"
                checked={ingat}
                onChange={(event) => setIngat(event.target.checked)}
                disabled={busy}
              />
              Ingat perangkat ini (30 hari)
            </label>
            {error && <p className="mt-2 text-center text-sm text-destructive">{error}</p>}
            <Button
              className="mt-4 w-full rounded-full"
              onClick={() => void handleSubmit()}
              disabled={busy || kode.length !== 6}
            >
              {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <ShieldCheck className="mr-2 size-4" />}
              Verifikasi & Masuk Panel
            </Button>
          </>
        )}

        <p className="mt-3 text-center text-[11px] text-slate-400">
          Kode berlaku 30 detik. Ganti kode otomatis — jangan bagikan ke siapa pun.
        </p>
      </div>
    </div>
  );
}
