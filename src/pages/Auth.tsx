import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";

import { FadeIn } from "@/components/Reveal";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/convex/_generated/api";
import { getClientIp, getUserAgent } from "@/lib/session";
import { ADMIN_ROUTE } from "@/lib/routes";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  KeyRound,
  LayoutDashboard,
  Loader2,
  LockKeyhole,
  Mail,
  ShieldAlert,
  ShieldCheck,
  UserX,
  Vault,
  Wallet,
} from "lucide-react";
import { Suspense, useEffect, useState, type FormEvent } from "react";
import { useMutation } from "convex/react";
import { Link, useNavigate, useSearchParams } from "react-router";

interface AuthProps {
  redirectAfterAuth?: string;
}

type AdminStep =
  | "signIn"
  | "activate"
  | "reset"
  | { kind: "code"; email: string; purpose: "activation" | "reset" };

/**
 * Terjemahkan kegagalan auth menjadi pesan ramah.
 *
 * Convex membungkus error server dengan detail teknis ("Server Error",
 * "Uncaught Error", stack, "Called by client"). Detail itu tidak pernah
 * ditampilkan apa adanya ke pengguna — pemanggil cukup memakai pesan yang
 * dikembalikan di sini, atau pesan cadangan miliknya sendiri bila kosong.
 */
function bacaErrorAuth(error: unknown): { pesan: string; adminPakaiKataSandi: boolean } {
  const mentah = error instanceof Error ? error.message : String(error ?? "");
  if (/Super Admin masuk dengan kata sandi/i.test(mentah)) {
    return {
      pesan:
        "OTP email tidak dipakai untuk masuk sebagai Super Admin. Masuk dengan kata sandi di tab Admin; bila kata sandi belum aktif, gunakan Aktivasi password di tab tersebut.",
      adminPakaiKataSandi: true,
    };
  }
  if (/Password hanya tersedia untuk akun Super Admin terverifikasi/i.test(mentah)) {
    return {
      pesan: "Aktivasi kata sandi hanya untuk akun Super Admin dengan email terverifikasi.",
      adminPakaiKataSandi: false,
    };
  }
  return { pesan: "", adminPakaiKataSandi: false };
}

const PORTAL_OPTIONS = [
  {
    href: "/dashboard",
    label: "Peminjam",
    detail: "Catat pengajuan pinjaman atau gadai.",
    icon: LayoutDashboard,
  },
  {
    href: "/pendana",
    label: "Pendana",
    detail: "Lihat saldo dan alokasi ledger.",
    icon: Wallet,
  },
] as const;

function PortalPicker({
  selectedPath,
  onSelect,
}: {
  selectedPath: string;
  onSelect: (path: string) => void;
}) {
  const selectedPortal = PORTAL_OPTIONS.find(({ href }) =>
    selectedPath.startsWith(href),
  );
  if (!selectedPortal) return null;

  return (
    <section className="px-6" aria-label="Pilih dashboard">
      <p className="text-xs font-medium text-foreground">Pilih ruang yang ingin dibuka</p>
      <div className="mt-2 grid grid-cols-2 gap-2" role="group" aria-label="Pilihan dashboard">
        {PORTAL_OPTIONS.map(({ href, label, icon: Icon }) => {
          const active = selectedPortal.href === href;
          return (
            <button
              key={href}
              type="button"
              aria-pressed={active}
              onClick={() => onSelect(href)}
              className={`flex min-h-[68px] min-w-0 flex-col items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                active
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <Icon className="size-4" aria-hidden="true" />
              <span>{label}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] leading-4 text-muted-foreground">
        {selectedPortal.detail} Pilihan ini menentukan tujuan setelah masuk, bukan mengubah peran atau hak akses akun.
      </p>
    </section>
  );
}

function VerificationCodeField({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex justify-center">
      <InputOTP
        value={value}
        onChange={onChange}
        maxLength={6}
        aria-label="Kode verifikasi 6 digit"
        disabled={disabled}
      >
        <InputOTPGroup>
          {Array.from({ length: 6 }).map((_, index) => (
            <InputOTPSlot key={index} index={index} />
          ))}
        </InputOTPGroup>
      </InputOTP>
    </div>
  );
}

function CaptchaChallenge({
  visible,
  a,
  b,
  value,
  onChange,
  disabled,
}: {
  visible: boolean;
  a: number;
  b: number;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  if (!visible) return null;
  return (
    <div className="mt-4 rounded-lg border border-sky-200 bg-sky-50/60 p-3">
      <p className="flex items-center gap-1.5 text-xs font-medium text-sky-900">
        <ShieldAlert className="size-3.5" />
        Verifikasi anti-bot — {a} + {b} = ?
      </p>
      <Input
        className="mt-2"
        aria-label="Jawaban verifikasi anti-bot"
        inputMode="numeric"
        placeholder="Jawaban"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
      />
      <p className="mt-1.5 text-xs leading-5 text-sky-700">
        Aktif setelah 2x gagal. Maksimal 5 percobaan per 15 menit.
      </p>
    </div>
  );
}

function resolveRedirectAfterAuth(
  returnTo: string | null,
  fallback = "/dashboard",
) {
  if (returnTo?.startsWith("/") && !returnTo.startsWith("//")) {
    return returnTo;
  }
  return fallback;
}

function Auth({ redirectAfterAuth }: AuthProps = {}) {
  const { isLoading: authLoading, isAuthenticated, signIn, user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [authMode, setAuthMode] = useState<"client" | "admin">(() =>
    searchParams.get("returnTo") === ADMIN_ROUTE ? "admin" : "client",
  );
  const defaultDestination =
    user?.role === "admin"
      ? ADMIN_ROUTE
      : user?.role === "pendana"
        ? "/pendana"
        : redirectAfterAuth;
  const redirect = resolveRedirectAfterAuth(
    searchParams.get("returnTo"),
    defaultDestination,
  );
  const selectPortal = (path: string) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set("returnTo", path);
      return next;
    });
  };
  const [clientStep, setClientStep] = useState<"signIn" | { email: string }>("signIn");
  const [adminStep, setAdminStep] = useState<AdminStep>("signIn");
  const [otp, setOtp] = useState("");
  const [adminOtp, setAdminOtp] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kegagalan, setKegagalan] = useState(0);
  const [captchaJawab, setCaptchaJawab] = useState("");
  const [captcha] = useState(() => ({
    a: Math.floor(Math.random() * 9) + 1,
    b: Math.floor(Math.random() * 9) + 1,
  }));
  const recordLogin = useMutation(api.security.recordLogin);
  const tandaiGagal = useMutation(api.security.recordFailedAttempt);

  const captchaWajib = kegagalan >= 2;
  const captchaBenar =
    !captchaWajib || captchaJawab.trim() === String(captcha.a + captcha.b);

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      navigate(redirect);
    }
  }, [authLoading, isAuthenticated, navigate, redirect]);

  const recordFailedAttempt = async (identifier: string) => {
    try {
      const ip = await getClientIp();
      await tandaiGagal({ ip, identifier });
    } catch {
      /* logging gagal tidak boleh blokir UX */
    }
  };

  const recordSuccessfulLogin = async (metode: string) => {
    try {
      const ip = await getClientIp();
      await recordLogin({ ip, userAgent: getUserAgent(), metode });
    } catch {
      /* logging gagal tidak boleh blokir UX */
    }
  };

  const setAdminFlow = (next: AdminStep) => {
    setAdminStep(next);
    setAdminOtp("");
    setError(null);
  };

  const switchAuthMode = (nextMode: "client" | "admin") => {
    setAuthMode(nextMode);
    setError(null);
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (nextMode === "admin") {
        next.set("returnTo", ADMIN_ROUTE);
      } else if (next.get("returnTo") === ADMIN_ROUTE) {
        next.set("returnTo", "/dashboard");
      }
      return next;
    });
  };

  const beginFirstAdminSetup = () => {
    setAuthMode("client");
    setClientStep("signIn");
    setError(null);
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set("returnTo", ADMIN_ROUTE);
      return next;
    });
  };

  const handleEmailSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (!captchaBenar) {
      setError("Jawaban verifikasi anti-bot salah.");
      return;
    }
    setIsLoading(true);
    // Dibaca sebelum await: `event.currentTarget` tidak lagi valid setelahnya.
    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "");
    try {
      await signIn("email-otp", formData);
      setClientStep({ email });
      setIsLoading(false);
    } catch (error) {
      console.error("Email sign-in error:", error);
      setKegagalan((k) => k + 1);
      await recordFailedAttempt("auth-step1");
      const { pesan, adminPakaiKataSandi } = bacaErrorAuth(error);
      if (adminPakaiKataSandi) {
        // Akun Super Admin memang tidak boleh lewat OTP email: alihkan ke tab
        // Admin dengan email terisi agar pengguna tinggal mengisi kata sandi.
        switchAuthMode("admin");
        setAdminFlow("signIn");
        setAdminEmail(email);
        setError(pesan);
      } else {
        setError(pesan || "Gagal mengirim kode verifikasi. Coba lagi sebentar lagi.");
      }
      setIsLoading(false);
    }
  };

  const handleOtpSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (!captchaBenar) {
      setError("Jawaban verifikasi anti-bot salah.");
      return;
    }
    if (clientStep === "signIn") return;
    setIsLoading(true);
    try {
      const formData = new FormData(event.currentTarget);
      await signIn("email-otp", formData);
      await recordSuccessfulLogin("email_otp");
    } catch (error) {
      console.error("OTP verification error:", error);
      setKegagalan((k) => k + 1);
      await recordFailedAttempt(clientStep.email.toLowerCase());
      setError(bacaErrorAuth(error).pesan || "Kode verifikasi salah atau kedaluwarsa.");
      setIsLoading(false);
      setOtp("");
    }
  };

  const handleAdminSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (!captchaBenar) {
      setError("Jawaban verifikasi anti-bot salah.");
      return;
    }
    setIsLoading(true);
    try {
      if (adminStep === "signIn") {
        const result = await signIn("password", {
          flow: "signIn",
          email: adminEmail,
          password: adminPassword,
        });
        if (result.signingIn) {
          await recordSuccessfulLogin("password");
        } else {
          setAdminOtp("");
          setAdminStep({ kind: "code", email: adminEmail, purpose: "activation" });
        }
      } else if (adminStep === "activate") {
        if (newPassword.length < 8) {
          setError("Kata sandi minimal 8 karakter.");
          setIsLoading(false);
          return;
        }
        if (newPassword !== confirmPassword) {
          setError("Konfirmasi kata sandi belum cocok.");
          setIsLoading(false);
          return;
        }
        const result = await signIn("password", {
          flow: "signUp",
          email: adminEmail,
          password: newPassword,
        });
        if (result.signingIn) {
          await recordSuccessfulLogin("password");
          return;
        }
        setNewPassword("");
        setConfirmPassword("");
        setAdminOtp("");
        setAdminStep({ kind: "code", email: adminEmail, purpose: "activation" });
      } else if (adminStep === "reset") {
        await signIn("password", { flow: "reset", email: adminEmail });
        setAdminOtp("");
        setAdminStep({ kind: "code", email: adminEmail, purpose: "reset" });
      }
    } catch (error) {
      console.error("Admin password flow error:", error);
      setKegagalan((k) => k + 1);
      await recordFailedAttempt(adminEmail.toLowerCase() || "admin");
      const message = error instanceof Error ? error.message : "";
      if (/akun admin terverifikasi tidak ditemukan/i.test(message)) {
        setError("Email ini tidak cocok dengan akun Super Admin terverifikasi.");
      } else if (/invalid credentials/i.test(message)) {
        setError("Email atau kata sandi Super Admin tidak sesuai.");
      } else if (/account.*exist|already exists/i.test(message)) {
        setError("Password sudah aktif. Silakan masuk atau gunakan Lupa kata sandi.");
      } else if (/account.*not found|could not find/i.test(message)) {
        setError("Password belum diaktifkan atau akun tidak ditemukan. Gunakan Aktivasi password.");
      } else {
        setError("Permintaan gagal. Periksa kembali email dan coba lagi.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleAdminCodeSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (!captchaBenar) {
      setError("Jawaban verifikasi anti-bot salah.");
      return;
    }
    if (typeof adminStep === "string") return;
    if (adminStep.purpose === "reset") {
      if (newPassword.length < 8) {
        setError("Kata sandi baru minimal 8 karakter.");
        return;
      }
      if (newPassword !== confirmPassword) {
        setError("Konfirmasi kata sandi belum cocok.");
        return;
      }
    }
    setIsLoading(true);
    try {
      const result = await signIn("password", {
        flow: adminStep.purpose === "reset" ? "reset-verification" : "email-verification",
        email: adminStep.email,
        code: adminOtp,
        ...(adminStep.purpose === "reset" ? { newPassword } : {}),
      });
      if (!result.signingIn) {
        throw new Error("Token verifikasi tidak valid.");
      }
      await recordSuccessfulLogin(
        adminStep.purpose === "reset" ? "password_reset" : "password_activation",
      );
      setNewPassword("");
      setConfirmPassword("");
    } catch (error) {
      console.error("Admin OTP verification error:", error);
      setKegagalan((k) => k + 1);
      await recordFailedAttempt(adminStep.email.toLowerCase());
      setError("Token verifikasi salah atau kedaluwarsa. Periksa email dan coba lagi.");
      setAdminOtp("");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGuestLogin = async () => {
    setError(null);
    if (!captchaBenar) {
      setError("Jawaban verifikasi anti-bot salah.");
      return;
    }
    setIsLoading(true);
    try {
      await signIn("anonymous");
      await recordSuccessfulLogin("tamu");
    } catch (error) {
      console.error("Guest login error:", error);
      setKegagalan((k) => k + 1);
      setError(
        `Gagal masuk sebagai tamu: ${
          error instanceof Error ? error.message : "kesalahan tidak diketahui"
        }`,
      );
      setIsLoading(false);
    }
  };

  const isAdminCodeStep = typeof adminStep !== "string";

  /* Kunci animasi masuk kartu: satu transisi halus setiap langkah berganti. */
  const langkahKey =
    authMode === "client"
      ? `client-${typeof clientStep === "string" ? clientStep : "kode"}`
      : `admin-${typeof adminStep === "string" ? adminStep : `kode-${adminStep.purpose}`}`;

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <div className="flex-1" />
      <FadeIn className="flex items-center justify-center px-4 py-8 sm:px-6">
        <div className="flex w-full max-w-sm flex-col items-center">
          <Link
            to="/"
            className="flex items-center gap-2.5 text-sm font-semibold tracking-[0.18em] text-foreground"
          >
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary font-bold text-primary-foreground">
              P
            </span>
            PINDAI
          </Link>
          <p className="mt-2 text-xs text-muted-foreground">
            Pinjam &amp; Gadai Digital
          </p>
          <ul className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
            <li className="flex items-center gap-1.5">
              <BadgeCheck className="size-3.5 text-primary" />
              Pencatatan ledger
            </li>
            <li className="flex items-center gap-1.5">
              <Vault className="size-3.5 text-primary" />
              Pencatatan gadai
            </li>
            <li className="flex items-center gap-1.5">
              <CalendarClock className="size-3.5 text-primary" />
              Jadwal angsuran
            </li>
          </ul>

          <Card
            key={langkahKey}
            className="animate-masuk mt-8 w-full gap-6 rounded-xl border-border/60 shadow-none"
          >
            {authMode === "client" ? (
              clientStep === "signIn" ? (
                <>
                  <CardHeader className="text-center">
                    <CardTitle className="text-xl">Masuk atau buat akun</CardTitle>
                    <CardDescription>
                      Masuk sesuai ruang Peminjam atau Pendana
                    </CardDescription>
                  </CardHeader>
                  <PortalPicker selectedPath={redirect} onSelect={selectPortal} />
                  <form onSubmit={handleEmailSubmit}>
                    <CardContent>
                      <div className="relative flex items-center gap-2">
                        <div className="relative flex-1">
                          <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            name="email"
                            aria-label="Alamat email"
                            placeholder="nama@contoh.com"
                            type="email"
                            className="pl-9"
                            disabled={isLoading}
                            required
                          />
                        </div>
                        <Button
                          type="submit"
                          variant="outline"
                          size="icon"
                          aria-label="Kirim kode verifikasi"
                          disabled={isLoading}
                        >
                          {isLoading ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <ArrowRight className="size-4" />
                          )}
                        </Button>
                      </div>
                      {error && (
                        <p role="alert" className="mt-2 text-sm text-destructive">
                          {error}
                        </p>
                      )}

                      <CaptchaChallenge
                        visible={captchaWajib}
                        a={captcha.a}
                        b={captcha.b}
                        value={captchaJawab}
                        onChange={setCaptchaJawab}
                        disabled={isLoading}
                      />

                      <div className="mt-4">
                        <div className="relative">
                          <div className="absolute inset-0 flex items-center">
                            <span className="w-full border-t" />
                          </div>
                          <div className="relative flex justify-center text-xs uppercase">
                            <span className="bg-card px-2 text-muted-foreground">
                              atau
                            </span>
                          </div>
                        </div>

                        <Button
                          type="button"
                          variant="outline"
                          className="mt-4 w-full"
                          onClick={handleGuestLogin}
                          disabled={isLoading}
                        >
                          <UserX className="mr-2 size-4" />
                          Lanjut sebagai tamu
                        </Button>
                      </div>
                    </CardContent>
                  </form>
                </>
              ) : (
                <>
                  <CardHeader className="text-center">
                    <CardTitle>Cek email Anda</CardTitle>
                    <CardDescription>
                      Kami mengirim kode verifikasi ke {clientStep.email}
                    </CardDescription>
                  </CardHeader>
                  <PortalPicker selectedPath={redirect} onSelect={selectPortal} />
                  <form onSubmit={handleOtpSubmit}>
                    <CardContent className="pb-4">
                      <input type="hidden" name="email" value={clientStep.email} />
                      <input type="hidden" name="code" value={otp} />

                      <VerificationCodeField
                        value={otp}
                        onChange={setOtp}
                        disabled={isLoading}
                      />
                      {error && (
                        <p role="alert" className="mt-2 text-center text-sm text-destructive">
                          {error}
                        </p>
                      )}
                      <CaptchaChallenge
                        visible={captchaWajib}
                        a={captcha.a}
                        b={captcha.b}
                        value={captchaJawab}
                        onChange={setCaptchaJawab}
                        disabled={isLoading}
                      />
                    </CardContent>
                    <CardFooter className="flex-col gap-2">
                      <Button
                        type="submit"
                        className="w-full bg-primary font-medium text-primary-foreground hover:bg-primary/90"
                        disabled={isLoading || otp.length !== 6}
                      >
                        {isLoading ? (
                          <>
                            <Loader2 className="mr-2 size-4 animate-spin" />
                            Memverifikasi…
                          </>
                        ) : (
                          <>
                            Verifikasi kode
                            <ArrowRight className="ml-2 size-4" />
                          </>
                        )}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => {
                          setClientStep("signIn");
                          setOtp("");
                          setError(null);
                        }}
                        disabled={isLoading}
                        className="w-full"
                      >
                        Gunakan email lain
                      </Button>
                    </CardFooter>
                  </form>
                </>
              )
            ) : (
              <>
                {adminStep === "signIn" && (
                  <>
                    <CardHeader className="text-center">
                      <div className="mx-auto flex size-10 items-center justify-center rounded-xl border border-primary/20 bg-primary/5 text-primary">
                        <ShieldCheck className="size-5" />
                      </div>
                      <CardTitle className="text-xl">Akses Super Admin</CardTitle>
                      <CardDescription>
                        Masuk dengan kata sandi. Verifikasi TOTP tetap berlaku sesuai pengaturan akun.
                      </CardDescription>
                    </CardHeader>
                    <form onSubmit={handleAdminSubmit}>
                      <CardContent className="space-y-4">
                        <div className="space-y-2">
                          <label htmlFor="admin-email" className="text-sm font-medium">
                            Email Super Admin
                          </label>
                          <Input
                            id="admin-email"
                            type="email"
                            autoComplete="username"
                            placeholder="admin@contoh.com"
                            value={adminEmail}
                            onChange={(event) => setAdminEmail(event.target.value)}
                            disabled={isLoading}
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <label htmlFor="admin-password" className="text-sm font-medium">
                            Kata sandi
                          </label>
                          <Input
                            id="admin-password"
                            type="password"
                            autoComplete="current-password"
                            placeholder="Kata sandi admin"
                            value={adminPassword}
                            onChange={(event) => setAdminPassword(event.target.value)}
                            disabled={isLoading}
                            required
                          />
                        </div>
                        {error && (
                          <p role="alert" className="text-sm text-destructive">
                            {error}
                          </p>
                        )}
                        <CaptchaChallenge
                          visible={captchaWajib}
                          a={captcha.a}
                          b={captcha.b}
                          value={captchaJawab}
                          onChange={setCaptchaJawab}
                          disabled={isLoading}
                        />
                        <Button type="submit" className="w-full" disabled={isLoading}>
                          {isLoading ? (
                            <Loader2 className="mr-2 size-4 animate-spin" />
                          ) : (
                            <LockKeyhole className="mr-2 size-4" />
                          )}
                          Masuk sebagai Super Admin
                        </Button>
                        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                          <Button
                            type="button"
                            variant="link"
                            className="h-auto px-0 text-xs"
                            onClick={() => setAdminFlow("activate")}
                            disabled={isLoading}
                          >
                            Aktivasi password
                          </Button>
                          <Button
                            type="button"
                            variant="link"
                            className="h-auto px-0 text-xs"
                            onClick={() => setAdminFlow("reset")}
                            disabled={isLoading}
                          >
                            Lupa kata sandi?
                          </Button>
                        </div>
                      </CardContent>
                    </form>
                  </>
                )}

                {adminStep === "activate" && (
                  <>
                    <CardHeader className="text-center">
                      <div className="mx-auto flex size-10 items-center justify-center rounded-xl border border-primary/20 bg-primary/5 text-primary">
                        <KeyRound className="size-5" />
                      </div>
                      <CardTitle className="text-xl">Aktivasi password admin</CardTitle>
                      <CardDescription>
                        Token alfanumerik 32 karakter dikirim ke email terverifikasi untuk mengaktifkan password Super Admin.
                      </CardDescription>
                    </CardHeader>
                    <form onSubmit={handleAdminSubmit}>
                      <CardContent className="space-y-4">
                        <div className="space-y-2">
                          <label htmlFor="activate-admin-email" className="text-sm font-medium">
                            Email Super Admin terverifikasi
                          </label>
                          <Input
                            id="activate-admin-email"
                            type="email"
                            autoComplete="username"
                            placeholder="admin@contoh.com"
                            value={adminEmail}
                            onChange={(event) => setAdminEmail(event.target.value)}
                            disabled={isLoading}
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <label htmlFor="activate-admin-password" className="text-sm font-medium">
                            Buat kata sandi (minimal 8 karakter)
                          </label>
                          <Input
                            id="activate-admin-password"
                            type="password"
                            autoComplete="new-password"
                            value={newPassword}
                            onChange={(event) => setNewPassword(event.target.value)}
                            disabled={isLoading}
                            required
                            minLength={8}
                          />
                        </div>
                        <div className="space-y-2">
                          <label htmlFor="activate-admin-confirm" className="text-sm font-medium">
                            Ulangi kata sandi
                          </label>
                          <Input
                            id="activate-admin-confirm"
                            type="password"
                            autoComplete="new-password"
                            value={confirmPassword}
                            onChange={(event) => setConfirmPassword(event.target.value)}
                            disabled={isLoading}
                            required
                            minLength={8}
                          />
                        </div>
                        {error && (
                          <p role="alert" className="text-sm text-destructive">
                            {error}
                          </p>
                        )}
                        <CaptchaChallenge
                          visible={captchaWajib}
                          a={captcha.a}
                          b={captcha.b}
                          value={captchaJawab}
                          onChange={setCaptchaJawab}
                          disabled={isLoading}
                        />
                        <Button type="submit" className="w-full" disabled={isLoading}>
                          {isLoading ? (
                            <Loader2 className="mr-2 size-4 animate-spin" />
                          ) : (
                            <Mail className="mr-2 size-4" />
                          )}
                          Kirim token aktivasi
                        </Button>
                        <p className="text-center text-xs text-muted-foreground">
                          Setelah token dikirim, kolom verifikasi akan terbuka. Jika token sudah ada di email tetapi layar belum berpindah:
                        </p>
                        <Button
                          type="button"
                          variant="link"
                          className="w-full whitespace-normal text-center text-xs"
                          onClick={() =>
                            setAdminFlow({
                              kind: "code",
                              email: adminEmail.trim(),
                              purpose: "activation",
                            })
                          }
                          disabled={isLoading || !adminEmail.trim()}
                        >
                          Saya sudah menerima token — buka kolom verifikasi
                        </Button>
                      </CardContent>
                      <CardFooter>
                        <Button
                          type="button"
                          variant="ghost"
                          className="w-full"
                          onClick={() => setAdminFlow("signIn")}
                          disabled={isLoading}
                        >
                          <ArrowLeft className="mr-2 size-4" /> Kembali ke masuk admin
                        </Button>
                      </CardFooter>
                    </form>
                  </>
                )}

                {adminStep === "reset" && (
                  <>
                    <CardHeader className="text-center">
                      <div className="mx-auto flex size-10 items-center justify-center rounded-xl border border-primary/20 bg-primary/5 text-primary">
                        <Mail className="size-5" />
                      </div>
                      <CardTitle className="text-xl">Reset kata sandi admin</CardTitle>
                      <CardDescription>
                        Token alfanumerik 32 karakter dikirim ke email terdaftar untuk mengganti kata sandi Super Admin.
                      </CardDescription>
                    </CardHeader>
                    <form onSubmit={handleAdminSubmit}>
                      <CardContent className="space-y-4">
                        <div className="space-y-2">
                          <label htmlFor="reset-admin-email" className="text-sm font-medium">
                            Email Super Admin
                          </label>
                          <Input
                            id="reset-admin-email"
                            type="email"
                            autoComplete="username"
                            placeholder="admin@contoh.com"
                            value={adminEmail}
                            onChange={(event) => setAdminEmail(event.target.value)}
                            disabled={isLoading}
                            required
                          />
                        </div>
                        {error && (
                          <p role="alert" className="text-sm text-destructive">
                            {error}
                          </p>
                        )}
                        <CaptchaChallenge
                          visible={captchaWajib}
                          a={captcha.a}
                          b={captcha.b}
                          value={captchaJawab}
                          onChange={setCaptchaJawab}
                          disabled={isLoading}
                        />
                        <Button type="submit" className="w-full" disabled={isLoading}>
                          {isLoading ? (
                            <Loader2 className="mr-2 size-4 animate-spin" />
                          ) : (
                            <Mail className="mr-2 size-4" />
                          )}
                          Kirim token reset
                        </Button>
                      </CardContent>
                      <CardFooter>
                        <Button
                          type="button"
                          variant="ghost"
                          className="w-full"
                          onClick={() => setAdminFlow("signIn")}
                          disabled={isLoading}
                        >
                          <ArrowLeft className="mr-2 size-4" /> Kembali ke masuk admin
                        </Button>
                      </CardFooter>
                    </form>
                  </>
                )}

                {isAdminCodeStep && (
                  <>
                    <CardHeader className="text-center">
                      <div className="mx-auto flex size-10 items-center justify-center rounded-xl border border-primary/20 bg-primary/5 text-primary">
                        {adminStep.purpose === "reset" ? (
                          <LockKeyhole className="size-5" />
                        ) : (
                          <Mail className="size-5" />
                        )}
                      </div>
                      <CardTitle className="text-xl">
                        {adminStep.purpose === "reset" ? "Verifikasi reset password" : "Verifikasi aktivasi password"}
                      </CardTitle>
                      <CardDescription>
                        Tempel token 32 karakter alfanumerik yang dikirim ke {adminStep.email}. Berlaku 15 menit; perhatikan huruf besar/kecil.
                      </CardDescription>
                    </CardHeader>
                    <form onSubmit={handleAdminCodeSubmit}>
                      <CardContent className="space-y-4">
                        <div className="space-y-2">
                          <label htmlFor="admin-verification-token" className="text-sm font-medium">
                            Token verifikasi (32 karakter)
                          </label>
                          <Input
                            id="admin-verification-token"
                            aria-label="Token verifikasi admin 32 karakter"
                            autoComplete="one-time-code"
                            className="h-12 font-mono text-center text-base tracking-wider"
                            maxLength={32}
                            placeholder="Tempel token dari email di sini"
                            value={adminOtp}
                            onChange={(event) =>
                              setAdminOtp(event.target.value.replace(/[^a-zA-Z0-9]/g, "").slice(0, 32))
                            }
                            disabled={isLoading}
                            required
                          />
                          <p className="text-xs text-muted-foreground">
                            {adminOtp.length}/32 karakter · huruf besar dan kecil harus sama seperti di email.
                          </p>
                        </div>
                        {adminStep.purpose === "reset" && (
                          <>
                            <div className="space-y-2">
                              <label htmlFor="reset-new-password" className="text-sm font-medium">
                                Kata sandi baru (minimal 8 karakter)
                              </label>
                              <Input
                                id="reset-new-password"
                                type="password"
                                autoComplete="new-password"
                                value={newPassword}
                                onChange={(event) => setNewPassword(event.target.value)}
                                disabled={isLoading}
                                required
                                minLength={8}
                              />
                            </div>
                            <div className="space-y-2">
                              <label htmlFor="reset-confirm-password" className="text-sm font-medium">
                                Ulangi kata sandi baru
                              </label>
                              <Input
                                id="reset-confirm-password"
                                type="password"
                                autoComplete="new-password"
                                value={confirmPassword}
                                onChange={(event) => setConfirmPassword(event.target.value)}
                                disabled={isLoading}
                                required
                                minLength={8}
                              />
                            </div>
                          </>
                        )}
                        {error && (
                          <p role="alert" className="text-center text-sm text-destructive">
                            {error}
                          </p>
                        )}
                        <CaptchaChallenge
                          visible={captchaWajib}
                          a={captcha.a}
                          b={captcha.b}
                          value={captchaJawab}
                          onChange={setCaptchaJawab}
                          disabled={isLoading}
                        />
                      </CardContent>
                      <CardFooter className="flex-col gap-2">
                        <Button
                          type="submit"
                          className="w-full"
                          disabled={isLoading || adminOtp.length !== 32}
                        >
                          {isLoading ? (
                            <Loader2 className="mr-2 size-4 animate-spin" />
                          ) : (
                            <ShieldCheck className="mr-2 size-4" />
                          )}
                          {adminStep.purpose === "reset" ? "Verifikasi & ganti password" : "Verifikasi & aktifkan password"}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          className="w-full"
                          onClick={() => setAdminFlow("signIn")}
                          disabled={isLoading}
                        >
                          <ArrowLeft className="mr-2 size-4" /> Batalkan
                        </Button>
                      </CardFooter>
                    </form>
                  </>
                )}
              </>
            )}

            {((authMode === "client" && clientStep === "signIn") ||
              (authMode === "admin" && adminStep === "signIn")) && (
              <div className="px-6 pb-6">
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card px-2 text-muted-foreground">akses lainnya</span>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="link"
                  className="mt-2 w-full text-xs"
                  onClick={() => switchAuthMode(authMode === "client" ? "admin" : "client")}
                  disabled={isLoading}
                >
                  {authMode === "client" ? "Masuk sebagai Super Admin" : "Masuk sebagai Peminjam atau Pendana"}
                </Button>
                {authMode === "admin" && (
                  <Button
                    type="button"
                    variant="ghost"
                    className="mt-1 w-full text-xs text-muted-foreground"
                    onClick={beginFirstAdminSetup}
                    disabled={isLoading}
                  >
                    Setup admin pertama dengan OTP email
                  </Button>
                )}
              </div>
            )}
          </Card>
        </div>
      </FadeIn>
      <div className="flex-1" />
    </div>
  );
}

export default function AuthPage(props: AuthProps) {
  return (
    <Suspense>
      <Auth {...props} />
    </Suspense>
  );
}
