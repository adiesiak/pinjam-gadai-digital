/**
 * KLAIM / LOGIN PEMINJAM LAMA — nomor WhatsApp → kode OTP → masuk.
 *
 * Satu komponen dipakai di DUA tempat dan perilakunya menyesuaikan:
 *  - Di halaman `/auth` (belum ada sesi): kode yang benar membuat sesi baru
 *    lewat provider `whatsapp-otp`. Akun yang dipakai adalah AKUN PEMILIK data
 *    lama (lihat `convex/klaimPeminjam.ts`), jadi peminjam langsung mendarat di
 *    dashboard berisi riwayatnya — bukan dashboard kosong.
 *  - Di dashboard (sudah ada sesi, mis. masuk lewat email atau sesi tamu):
 *    kode yang benar menautkan berkas lama ke akun sesi AKTIF lewat
 *    `claimOrLoginBorrower`, tanpa kehilangan akun yang sedang dipakai.
 *
 * Yang dijaga di UI: nomor selalu ditampilkan bertopeng, tidak ada kode yang
 * pernah dicatat/di-log, dan tombol kirim ulang tidak bisa ditekan berulang
 * (server sudah punya cooldown; di sini hanya supaya pemakai tidak menunggu
 * tanpa penjelasan).
 */
import { useAction, useMutation } from "convex/react";
import {
  ArrowLeft,
  BadgeCheck,
  Loader2,
  MessageCircle,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { useState, type FormEvent } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import { getClientIp, getUserAgent } from "@/lib/session";
import { cn } from "@/lib/utils";

/** Pesan galat yang tidak pernah memuat detail internal server. */
function pesanGalat(error: unknown): string {
  const teks = error instanceof Error ? error.message : "";
  if (teks.includes("NOT_FOUND") || teks.includes("Could not find")) {
    return "Layanan klaim belum siap di deployment ini. Hubungi admin PINDAI.";
  }
  return teks === "" ? "Terjadi kesalahan. Coba lagi." : teks;
}

type Langkah = "nomor" | "kode";

export function KlaimPeminjamLama({
  onKembali,
  onSelesai,
  className,
}: {
  /** Tombol kembali di langkah pertama (opsional). */
  onKembali?: () => void;
  /** Dipanggil setelah sesi/penautan berhasil — dipakai halaman Auth. */
  onSelesai?: (pesan: string) => void;
  className?: string;
}) {
  const { isAuthenticated, signIn } = useAuth();
  const mintaKode = useAction(api.klaimPeminjam.mintaKodeKlaim);
  const tautkan = useMutation(api.klaimPeminjam.claimOrLoginBorrower);

  const [langkah, setLangkah] = useState<Langkah>("nomor");
  const [nomor, setNomor] = useState("");
  const [kode, setKode] = useState("");
  const [nomorTampil, setNomorTampil] = useState("");
  const [jmlBerkas, setJmlBerkas] = useState(0);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState(false);

  const kirimKode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setInfo(null);
    if (nomor.trim() === "") {
      setError("Isi nomor WhatsApp Anda dulu.");
      return;
    }
    setSibuk(true);
    try {
      const ip = await getClientIp();
      const hasil = await mintaKode({ nomor, ip, userAgent: getUserAgent() });
      if (!hasil.ok) {
        setError(hasil.pesan);
        return;
      }
      setNomorTampil(hasil.nomorTampil);
      setJmlBerkas(hasil.berkasLama);
      setKode("");
      setLangkah("kode");
      setInfo(hasil.pesan);
    } catch (err) {
      setError(pesanGalat(err));
    } finally {
      setSibuk(false);
    }
  };

  const kirimUlang = async () => {
    setError(null);
    setInfo(null);
    setSibuk(true);
    try {
      const ip = await getClientIp();
      const hasil = await mintaKode({ nomor, ip, userAgent: getUserAgent() });
      if (!hasil.ok) {
        setError(hasil.pesan);
        return;
      }
      setInfo(hasil.pesan);
    } catch (err) {
      setError(pesanGalat(err));
    } finally {
      setSibuk(false);
    }
  };

  const verifikasi = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (kode.length !== 6) {
      setError("Kode OTP harus 6 angka.");
      return;
    }
    setSibuk(true);
    try {
      const ip = await getClientIp();
      const userAgent = getUserAgent();

      // Sudah ada sesi (email/tamu): tautkan berkas lama ke akun sesi aktif.
      if (isAuthenticated) {
        const hasil = await tautkan({
          phoneNumber: nomor,
          otpCode: kode,
          ip,
          userAgent,
        });
        if (!hasil.ok) {
          setError(hasil.pesan);
          return;
        }
        setInfo(hasil.pesan);
        onSelesai?.(hasil.pesan);
        return;
      }

      // Belum ada sesi: kode yang benar MENGHASILKAN sesi akun pemilik data lama.
      await signIn("whatsapp-otp", {
        phoneNumber: nomor,
        otpCode: kode,
        ip,
        userAgent,
      });
      setInfo("Berhasil! Membuka dashboard berisi riwayat Anda…");
      onSelesai?.("Berhasil masuk dengan nomor WhatsApp.");
    } catch (err) {
      setError(pesanGalat(err));
      setKode("");
    } finally {
      setSibuk(false);
    }
  };

  return (
    <div
      className={cn(
        "glass-note focus-within:border-emerald-600/30 p-5 shadow-sm sm:p-6",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-emerald-700/20 bg-emerald-50 text-emerald-800">
          <MessageCircle className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900">
            Masuk sebagai peminjam lama
            <Badge className="badge-pop border-emerald-700/20 bg-emerald-50 text-emerald-800 hover:bg-emerald-50">
              <BadgeCheck className="mr-1 size-3.5" aria-hidden="true" />
              Web lama
            </Badge>
          </p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Punya pinjaman/gadai dari web PINDAI sebelumnya? Masukkan nomor WhatsApp
            lamamu — kode dikirim ke nomor itu, dan seluruh riwayat (status, nominal
            pokok, skema, cicilan) langsung tampil tanpa mengisi form dari nol.
          </p>
        </div>
      </div>

      {langkah === "nomor" ? (
        <form onSubmit={kirimKode} className="mt-4">
          <label htmlFor="klaim-nomor" className="text-sm font-medium text-slate-800">
            Nomor WhatsApp lama
          </label>
          <Input
            id="klaim-nomor"
            className="focus-glow mt-2"
            inputMode="tel"
            autoComplete="tel"
            placeholder="08123456789"
            value={nomor}
            onChange={(event) => setNomor(event.target.value)}
            disabled={sibuk}
            required
          />
          {error && (
            <p role="alert" className="mt-2 text-sm text-destructive">
              {error}
            </p>
          )}
          {info && (
            <p role="status" className="mt-2 text-sm text-emerald-800">
              {info}
            </p>
          )}
          <Button
            type="submit"
            className="mt-3 w-full bg-[#064E3B] text-white transition-all duration-200 hover:bg-[#065f46] hover:shadow-lg hover:shadow-emerald-900/20 hover:brightness-110 active:scale-95"
            disabled={sibuk}
          >
            {sibuk ? (
              <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
            ) : (
              <MessageCircle className="mr-2 size-4" aria-hidden="true" />
            )}
            Kirim kode ke WhatsApp
          </Button>
          {onKembali && (
            <Button
              type="button"
              variant="ghost"
              className="mt-2 w-full text-xs text-muted-foreground transition-all duration-200 hover:bg-emerald-50 hover:text-emerald-900 active:scale-95"
              onClick={onKembali}
              disabled={sibuk}
            >
              <ArrowLeft className="mr-2 size-3.5" aria-hidden="true" />
              Kembali ke login email
            </Button>
          )}
        </form>
      ) : (
        <form onSubmit={verifikasi} className="mt-4">
          <p className="text-sm text-slate-800">
            Kode dikirim ke{" "}
            <span className="font-semibold tabular-nums">{nomorTampil}</span>
            {jmlBerkas > 0 && (
              <>
                {" "}
                · {jmlBerkas} berkas lama menunggu diverifikasi
              </>
            )}
          </p>
          <div className="mt-3 flex justify-center">
            <InputOTP
              value={kode}
              onChange={(nilai) => setKode(nilai.replace(/\D/g, "").slice(0, 6))}
              maxLength={6}
              aria-label="Kode OTP WhatsApp 6 digit"
              disabled={sibuk}
            >
              <InputOTPGroup>
                {Array.from({ length: 6 }).map((_, index) => (
                  <InputOTPSlot key={index} index={index} />
                ))}
              </InputOTPGroup>
            </InputOTP>
          </div>
          {error && (
            <p role="alert" className="mt-2 text-center text-sm text-destructive">
              {error}
            </p>
          )}
          {info && !error && (
            <p
              role="status"
              className="mt-2 flex items-center justify-center gap-1.5 text-center text-sm text-emerald-800"
            >
              <span className="badge-dot badge-dot--hidup" aria-hidden="true" />
              {info}
            </p>
          )}
          <Button
            type="submit"
            className="mt-3 w-full bg-[#064E3B] text-white transition-all duration-200 hover:bg-[#065f46] hover:shadow-lg hover:shadow-emerald-900/20 hover:brightness-110 active:scale-95"
            disabled={sibuk || kode.length !== 6}
          >
            {sibuk ? (
              <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
            ) : (
              <ShieldCheck className="mr-2 size-4" aria-hidden="true" />
            )}
            {isAuthenticated ? "Tautkan data lama ke akun ini" : "Masuk & pulihkan data"}
          </Button>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <Button
              type="button"
              variant="ghost"
              className="h-auto px-0 text-xs text-muted-foreground transition-all duration-200 hover:bg-emerald-50 hover:text-emerald-900"
              onClick={() => void kirimUlang()}
              disabled={sibuk}
            >
              <RefreshCw className="mr-2 size-3.5" aria-hidden="true" />
              Kirim ulang kode
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="h-auto px-0 text-xs text-muted-foreground transition-all duration-200 hover:bg-emerald-50 hover:text-emerald-900"
              onClick={() => {
                setLangkah("nomor");
                setKode("");
                setError(null);
                setInfo(null);
              }}
              disabled={sibuk}
            >
              Ganti nomor
            </Button>
          </div>
        </form>
      )}

      <p className="mt-4 flex items-start gap-2 text-[11px] leading-5 text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-emerald-700" aria-hidden="true" />
        Kode berlaku 5 menit dan hanya bisa dipakai sekali. Petugas PINDAI tidak pernah
        meminta kode ini. Klaim hanya menyambungkan kepemilikan berkas — nominal, status,
        dan catatan lama tidak diubah.
      </p>
    </div>
  );
}
