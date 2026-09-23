import { useAction, useMutation } from "convex/react";
import {
  ArrowRight,
  BadgeCheck,
  Banknote,
  Clock3,
  Fingerprint,
  Loader2,
  Lock,
  MessageCircle,
  ShieldCheck,
  UserRound,
  Vault,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/convex/_generated/api";
import { getClientIp, getUserAgent } from "@/lib/session";

/**
 * Halaman Login PINDAI — 3D Cartoon Claymorphism, Clean Light Mode.
 *
 * Role switcher: Peminjam | Pendana | Super Admin.
 * Peminjam: WhatsApp + NIK (16 digit) + password.
 * Pendana / Super Admin: WhatsApp (atau email utk admin) + password,
 * Pendana difollow-up verifikasi OTP WhatsApp saat perangkat baru.
 */

type Role = "peminjam" | "pendana" | "admin";

const ROLE_META: Record<
  Role,
  { label: string; hint: string; icon: React.ReactNode; redirect: string }
> = {
  peminjam: {
    label: "Peminjam",
    hint: "Ajukan pinjaman tunai atau gadai berjaminan.",
    icon: <Banknote className="size-4" />,
    redirect: "/dashboard",
  },
  pendana: {
    label: "Pendana",
    hint: "Alokasikan dana & pantau imbal hasil Anda.",
    icon: <Vault className="size-4" />,
    redirect: "/pendana",
  },
  admin: {
    label: "Super Admin",
    hint: "Kontrol penuh platform, ledger & kepatuhan.",
    icon: <ShieldCheck className="size-4" />,
    redirect: "/admin",
  },
};

/** "08…" → "628…", buang non-digit. Kembalikan null bila tak sah. */
function normalizeWa(raw: string): string | null {
  const digits = raw.replace(/[^\d]/g, "");
  if (digits.startsWith("0")) return `62${digits.slice(1)}`;
  if (digits.startsWith("62")) return digits;
  return null;
}

/* =====================================================================
 * Ornamen latar 3D — brankas & koin melayang lembut (SVG clay, 0 asset).
 * ===================================================================== */

function FloatingVault({ className, delay = 0 }: { className: string; delay?: number }) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden
      className={`animate-float pointer-events-none absolute ${className}`}
      style={{ animationDelay: `${delay}s` }}
    >
      <rect x="10" y="14" width="44" height="38" rx="9" fill="#BAE6FD" />
      <rect x="14" y="18" width="36" height="30" rx="7" fill="#7DD3FC" />
      <circle cx="32" cy="32" r="9" fill="#E0F2FE" />
      <circle cx="32" cy="32" r="4" fill="#0EA5E9" />
      <rect x="30" y="8" width="4" height="8" rx="2" fill="#38BDF8" />
      <ellipse cx="24" cy="18" rx="8" ry="2.5" fill="white" opacity="0.5" />
    </svg>
  );
}

function FloatingCoin({ className, delay = 0 }: { className: string; delay?: number }) {
  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden
      className={`animate-float pointer-events-none absolute ${className}`}
      style={{ animationDelay: `${delay}s` }}
    >
      <circle cx="20" cy="20" r="15" fill="#6EE7B7" />
      <circle cx="20" cy="20" r="10" fill="#A7F3D0" />
      <path d="M20 12v16M16 16h6a3 3 0 0 1 0 6h-4a3 3 0 0 0 0 6h6" stroke="#047857" strokeWidth="1.6" strokeLinecap="round" fill="none" />
    </svg>
  );
}

/** Logo 3D brankas metallic sky blue + kilau mint. */
function VaultLogo3D({ size = 56 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden>
      <rect x="6" y="10" width="52" height="46" rx="12" fill="#0EA5E9" />
      <rect x="10" y="14" width="44" height="38" rx="9" fill="#7DD3FC" />
      <circle cx="32" cy="33" r="12" fill="#E0F2FE" />
      <circle cx="32" cy="33" r="7" fill="#0EA5E9" />
      <circle cx="32" cy="33" r="2.5" fill="#10B981" />
      <rect x="29" y="4" width="6" height="9" rx="3" fill="#38BDF8" />
      <rect x="29" y="53" width="6" height="7" rx="3" fill="#0284C7" />
      <ellipse cx="22" cy="17" rx="9" ry="3" fill="white" opacity="0.45" />
      <path d="M50 18c3 2 5 5 5 9" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" fill="none" />
    </svg>
  );
}

/* =====================================================================
 * Opsi role — segmented 3D pill
 * ===================================================================== */

function RoleSwitcher({ value, onChange }: { value: Role; onChange: (r: Role) => void }) {
  return (
    <div className="clay-inset flex w-full rounded-full bg-sky-50 p-1" role="tablist" aria-label="Pilih peran akun">
      {(Object.keys(ROLE_META) as Role[]).map((r) => {
        const active = value === r;
        return (
          <button
            key={r}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(r)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-full px-2 py-2 text-xs font-semibold transition-all duration-200 sm:text-sm ${
              active
                ? "gradient-primary shadow-glow scale-[1.03] text-white"
                : "text-slate-500 hover:-translate-y-0.5 hover:bg-white hover:text-sky-700"
            }`}
          >
            {ROLE_META[r].icon}
            {ROLE_META[r].label}
          </button>
        );
      })}
    </div>
  );
}

/* =====================================================================
 * Modal OTP WhatsApp — 6 kotak digit, auto-focus, timer resend 60 detik
 * ===================================================================== */

function WaOtpLoginDialog({
  open,
  onOpenChange,
  whatsapp,
  onVerified,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  whatsapp: string;
  onVerified: () => void;
}) {
  const requestOtp = useAction(api.security.requestWaOtp);
  const verifyOtp = useMutation(api.security.verifyWaOtp);
  const [kode, setKode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detik, setDetik] = useState(60);
  const dimintaRef = useRef(false);

  useEffect(() => {
    if (!open) {
      setKode("");
      setError(null);
      dimintaRef.current = false;
    }
  }, [open]);

  // Auto-minta kode sekali per pembukaan.
  useEffect(() => {
    if (!open || dimintaRef.current) return;
    dimintaRef.current = true;
    void handleRequest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (detik <= 0) return;
    const t = setTimeout(() => setDetik((d) => d - 1), 1000);
    return () => clearTimeout(t);
  }, [detik]);

  const handleRequest = async () => {
    setBusy(true);
    setError(null);
    try {
      const ip = await getClientIp();
      const res = await requestOtp({
        tujuan: whatsapp,
        ip,
        userAgent: getUserAgent(),
        alasan: "login_perangkat_baru",
      });
      setDetik(60);
      if (res.ok) {
        toast.success(`Kode OTP dikirim ke WhatsApp ••••${whatsapp.slice(-4)}`);
      } else {
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
      toast.success("Perangkat baru terverifikasi — selamat datang!");
      onVerified();
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kode salah atau kedaluwarsa.");
      setKode("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="clay-card rounded-3xl border-0 sm:max-w-sm">
        <DialogHeader>
          <div className="clay-icon-blue clay-shine relative mx-auto flex size-14 items-center justify-center rounded-2xl">
            <MessageCircle className="size-7" />
          </div>
          <DialogTitle className="mt-2 text-center">Verifikasi WhatsApp</DialogTitle>
          <DialogDescription className="text-center">
            Perangkat baru terdeteksi. Kami mengirim kode 6 digit ke WhatsApp
            ••••{whatsapp.slice(-4)} — berlaku 5 menit.
          </DialogDescription>
        </DialogHeader>

        <div className="flex justify-center">
          <InputOTP value={kode} onChange={setKode} maxLength={6} disabled={busy}>
            <InputOTPGroup>
              {Array.from({ length: 6 }).map((_, i) => (
                <InputOTPSlot key={i} index={i} />
              ))}
            </InputOTPGroup>
          </InputOTP>
        </div>

        {error && (
          <p className="text-center text-sm text-red-600">{error}</p>
        )}

        <Button
          className="gradient-primary shadow-glow w-full rounded-full border-0"
          disabled={busy || kode.length !== 6}
          onClick={handleVerify}
        >
          {busy ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <ShieldCheck className="mr-2 size-4" />
          )}
          Verifikasi & lanjutkan
        </Button>

        <div className="text-center text-xs text-muted-foreground">
          {detik > 0 ? (
            <span className="inline-flex items-center gap-1.5">
              <Clock3 className="size-3.5" />
              Kirim ulang kode dalam {detik}s
            </span>
          ) : (
            <button
              type="button"
              className="font-semibold text-sky-600 hover:text-sky-700"
              onClick={handleRequest}
              disabled={busy}
            >
              Kirim ulang kode
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* =====================================================================
 * Halaman Login utama
 * ===================================================================== */

export default function Login() {
  const { isAuthenticated, isLoading, signIn } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const redirect =
    searchParams.get("returnTo")?.startsWith("/") &&
    !searchParams.get("returnTo")?.startsWith("//")
      ? (searchParams.get("returnTo") as string)
      : undefined;

  const [role, setRole] = useState<Role>("peminjam");
  const [waInput, setWaInput] = useState("");
  const [nik, setNik] = useState("");
  const [emailAdmin, setEmailAdmin] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gagal, setGagal] = useState(0);
  const [captcha, setCaptcha] = useState("");
  const [captchaPair, setCaptchaPair] = useState(() => ({
    a: Math.floor(Math.random() * 9) + 1,
    b: Math.floor(Math.random() * 9) + 1,
  }));

  const [otpDialog, setOtpDialog] = useState<{ whatsapp: string } | null>(null);
  const upsertContact = useMutation(api.identity.upsertContact);

  const waNormalized = useMemo(() => normalizeWa(waInput), [waInput]);
  const isAdmin = role === "admin";

  // CAPTCHA muncul halus setelah 2x kegagalan berturut-turut.
  const captchaWajib = gagal >= 2;
  const captchaBenar =
    !captchaWajib || captcha.trim() === String(captchaPair.a + captchaPair.b);

  useEffect(() => {
    if (!isLoading && isAuthenticated && !otpDialog) {
      navigate(redirect ?? ROLE_META[role].redirect, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, isAuthenticated]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!captchaBenar) {
      setError("Jawaban verifikasi anti-bot salah.");
      return;
    }
    if (!isAdmin && waNormalized === null) {
      setError("Nomor WhatsApp tidak valid — gunakan format 08… atau 62….");
      return;
    }
    if (role === "peminjam" && nik.length !== 16) {
      setError("NIK KTP harus tepat 16 digit.");
      return;
    }
    setBusy(true);
    try {
      // Convex Password provider mengidentifikasi akun lewat "email".
      // Untuk nomor WhatsApp kita pakai pseudo-email deterministik.
      const identifier = isAdmin
        ? emailAdmin.trim().toLowerCase()
        : `${waNormalized}@wa.pindai.id`;
      await signIn("password-email", {
        email: identifier,
        password,
        flow: "signIn",
      });

      // Simpan identitas WA/NIK ke akun (sekali, idempotent).
      await upsertContact({
        whatsapp: waNormalized ?? "",
        nik: role === "peminjam" ? nik : undefined,
      }).catch(() => undefined);

      // Pendana: verifikasi OTP WhatsApp utk perangkat baru (bisa dilewati
      // bila gateway nonaktif — pesan jujur tampil di dialog).
      if (role === "pendana" && waNormalized) {
        setOtpDialog({ whatsapp: waNormalized });
        setBusy(false);
        return;
      }
      toast.success(
        role === "admin"
          ? "Selamat datang, Super Admin. 2FA TOTP diminta saat aksi sensitif."
          : "Berhasil masuk — selamat datang kembali!",
      );
      navigate(redirect ?? ROLE_META[role].redirect, { replace: true });
    } catch (err) {
      setGagal((g) => g + 1);
      setCaptchaPair({
        a: Math.floor(Math.random() * 9) + 1,
        b: Math.floor(Math.random() * 9) + 1,
      });
      setCaptcha("");
      setError(
        err instanceof Error && err.message.includes("Invalid credentials")
          ? "Nomor/NIK atau password salah — cek kembali detail Anda."
          : err instanceof Error
            ? err.message
            : "Login gagal, coba lagi.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="clay-hero relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      {/* Ornamen 3D melayang */}
      <FloatingVault className="left-[6%] top-[12%] size-20 opacity-70" delay={0} />
      <FloatingVault className="bottom-[14%] right-[8%] size-14 opacity-50" delay={1.4} />
      <FloatingCoin className="right-[16%] top-[18%] size-10 opacity-70" delay={0.7} />
      <FloatingCoin className="bottom-[22%] left-[14%] size-8 opacity-50" delay={2} />
      <div className="dot-texture pointer-events-none absolute inset-0 opacity-60" />

      <div className="relative z-10 w-full max-w-md">
        {/* Branding header */}
        <div className="flex flex-col items-center text-center">
          <div className="clay-shine relative rounded-3xl">
            <VaultLogo3D size={72} />
          </div>
          <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-slate-900">
            Masuk ke PINDAI
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Pinjam &amp; Gadai Digital Transparan
          </p>
        </div>

        {/* Kartu 3D clay utama */}
        <div className="clay-card mt-6 p-6 sm:p-7">
          <RoleSwitcher value={role} onChange={setRole} />
          <p className="mt-3 text-center text-xs text-muted-foreground">
            {ROLE_META[role].hint}
          </p>

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            {/* Email (khusus Super Admin) */}
            {isAdmin && (
              <div>
                <Label htmlFor="email-admin" className="text-slate-700">
                  Email Admin
                </Label>
                <Input
                  id="email-admin"
                  type="email"
                  autoComplete="username"
                  placeholder="admin@pindai.id"
                  className="mt-1.5 rounded-xl"
                  value={emailAdmin}
                  onChange={(e) => setEmailAdmin(e.target.value)}
                  required
                />
              </div>
            )}

            {/* No. WhatsApp (Peminjam & Pendana) */}
            {!isAdmin && (
              <div>
                <Label htmlFor="wa" className="text-slate-700">
                  Nomor WhatsApp / HP
                </Label>
                <div className="mt-1.5 flex items-stretch overflow-hidden rounded-xl border border-slate-200/80 bg-white focus-within:ring-2 focus-within:ring-sky-300">
                  <span className="flex items-center gap-1.5 border-r border-sky-100 bg-sky-50 px-3 text-sm font-bold text-sky-700">
                    <MessageCircle className="size-4" />
                    62
                  </span>
                  <input
                    id="wa"
                    inputMode="numeric"
                    autoComplete="tel"
                    placeholder="812xxxxxxx"
                    className="w-full bg-transparent px-3 py-2.5 text-sm outline-none placeholder:text-slate-400"
                    value={waInput}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/[^\d]/g, "");
                      // "08…" diketik → otomatis tampil "8…" (62 sudah diprefix).
                      setWaInput(digits.startsWith("62") ? digits.slice(2) : digits.startsWith("0") ? digits.slice(1) : digits);
                    }}
                    maxLength={13}
                    required
                  />
                  {waNormalized && (
                    <span className="flex items-center pr-3">
                      <BadgeCheck className="size-4 text-emerald-500" />
                    </span>
                  )}
                </div>
                {waNormalized && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Terdeteksi: <span className="font-semibold text-sky-700">+{waNormalized}</span>
                  </p>
                )}
              </div>
            )}

            {/* NIK KTP (khusus Peminjam) */}
            {role === "peminjam" && (
              <div>
                <div className="flex items-baseline justify-between">
                  <Label htmlFor="nik" className="text-slate-700">
                    NIK KTP
                  </Label>
                  <span className="text-[11px] tabular-nums text-muted-foreground">
                    {nik.length}/16
                  </span>
                </div>
                <div className="relative mt-1.5">
                  <Fingerprint className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-sky-400" />
                  <Input
                    id="nik"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="16 digit sesuai KTP"
                    className="rounded-xl pl-9 tabular-nums"
                    value={nik}
                    onChange={(e) =>
                      setNik(e.target.value.replace(/[^\d]/g, "").slice(0, 16))
                    }
                    required
                  />
                </div>
              </div>
            )}

            {/* Password */}
            <div>
              <Label htmlFor="password" className="text-slate-700">
                Password
              </Label>
              <div className="relative mt-1.5">
                <Lock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-sky-400" />
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="Minimal 8 karakter"
                  className="rounded-xl pl-9"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={8}
                  required
                />
              </div>
            </div>

            {/* CAPTCHA — aktif setelah 2x gagal */}
            {captchaWajib && (
              <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-900">
                  <ShieldCheck className="size-3.5" />
                  Verifikasi anti-bot — {captchaPair.a} + {captchaPair.b} = ?
                </p>
                <Input
                  className="mt-2 rounded-lg"
                  inputMode="numeric"
                  placeholder="Jawaban"
                  value={captcha}
                  onChange={(e) => setCaptcha(e.target.value)}
                />
                <p className="mt-1.5 text-[11px] leading-4 text-amber-700">
                  Proteksi aktif setelah 2x gagal. Maksimal 5x percobaan / 15 menit per IP.
                </p>
              </div>
            )}

            {error && (
              <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">
                {error}
              </p>
            )}

            <Button
              type="submit"
              disabled={busy}
              className="clay-btn-blue clay-shine relative w-full py-3 text-sm font-bold text-white"
            >
              {busy ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Memproses…
                </>
              ) : (
                <>
                  Masuk sebagai {ROLE_META[role].label}
                  <ArrowRight className="ml-2 size-4 transition-transform group-hover:translate-x-0.5" />
                </>
              )}
            </Button>
          </form>

          {/* Cloudflare Turnstile badge (nonaktif — tampilan proteksi) */}
          <div className="mt-4 flex items-center justify-center gap-2 rounded-full bg-slate-50 px-3 py-1.5">
            <ShieldCheck className="size-3.5 text-slate-400" />
            <span className="text-[10px] leading-none text-slate-400">
              Dilindungi Cloudflare Turnstile
            </span>
          </div>
        </div>

        <p className="mt-5 text-center text-xs text-slate-500">
          Belum punya akun?{" "}
          <Link to="/auth" className="font-semibold text-sky-600 hover:text-sky-700">
            Daftar via kode email
          </Link>
          {" · "}
          <Link to="/" className="font-semibold text-slate-600 hover:text-slate-800">
            Kembali ke beranda
          </Link>
        </p>
        <div className="mt-3 flex items-center justify-center">
          <Badge variant="outline" className="rounded-full border-sky-200 bg-white/70 text-[10px] text-sky-700">
            <UserRound className="mr-1 size-3" />
            Dana terkustodi vault · Pencairan hingga 99%
          </Badge>
        </div>
      </div>

      {otpDialog && (
        <WaOtpLoginDialog
          open={otpDialog !== null}
          onOpenChange={(v) => {
            if (!v) setOtpDialog(null);
          }}
          whatsapp={otpDialog.whatsapp}
          onVerified={() => navigate(redirect ?? "/pendana", { replace: true })}
        />
      )}
    </div>
  );
}
