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

import { useAuth } from "@/hooks/use-auth";
import { api } from "@/convex/_generated/api";
import { getClientIp, getUserAgent } from "@/lib/session";
import { ADMIN_ROUTE } from "@/lib/routes";
import {
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  LayoutDashboard,
  Loader2,
  Mail,
  ShieldAlert,
  UserX,
  Vault,
  Wallet,
} from "lucide-react";
import { Suspense, useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { Link, useNavigate, useSearchParams } from "react-router";

interface AuthProps {
  redirectAfterAuth?: string;
}

const PORTAL_OPTIONS = [
  {
    href: "/dashboard",
    label: "Peminjam",
    detail: "Ajukan dan pantau pinjaman atau gadai.",
    icon: LayoutDashboard,
  },
  {
    href: "/pendana",
    label: "Pendana",
    detail: "Kelola setoran dan alokasi dana.",
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
  const [step, setStep] = useState<"signIn" | { email: string }>("signIn");
  const [otp, setOtp] = useState("");
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

  const handleEmailSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (!captchaBenar) {
      setError("Jawaban verifikasi anti-bot salah.");
      return;
    }
    setIsLoading(true);
    try {
      const formData = new FormData(event.currentTarget);
      await signIn("email-otp", formData);
      setStep({ email: formData.get("email") as string });
      setIsLoading(false);
    } catch (error) {
      console.error("Email sign-in error:", error);
      setKegagalan((k) => k + 1);
      try {
        const ip = await getClientIp();
        await tandaiGagal({ ip, identifier: "auth-step1" });
      } catch {
        /* logging gagal tidak boleh blokir UX */
      }
      setError(
        error instanceof Error
          ? error.message
          : "Gagal mengirim kode verifikasi. Coba lagi sebentar lagi.",
      );
      setIsLoading(false);
    }
  };

  const handleOtpSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (!captchaBenar) {
      setError("Jawaban verifikasi anti-bot salah.");
      return;
    }
    setIsLoading(true);
    try {
      const formData = new FormData(event.currentTarget);
      await signIn("email-otp", formData);
      try {
        const ip = await getClientIp();
        await recordLogin({ ip, userAgent: getUserAgent(), metode: "email_otp" });
      } catch {
        /* logging gagal tidak boleh blokir UX */
      }
    } catch (error) {
      console.error("OTP verification error:", error);
      setKegagalan((k) => k + 1);
      try {
        const ip = await getClientIp();
        await tandaiGagal({
          ip,
          identifier: step === "signIn" ? "guest" : step.email.toLowerCase(),
        });
      } catch {
        /* ignore */
      }
      setError("Kode verifikasi yang Anda masukkan salah.");
      setIsLoading(false);
      setOtp("");
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
      try {
        const ip = await getClientIp();
        await recordLogin({ ip, userAgent: getUserAgent(), metode: "tamu" });
      } catch {
        /* ignore */
      }
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

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <div className="flex-1" />
      <div className="flex items-center justify-center px-6">
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
              Tanpa agunan
            </li>
            <li className="flex items-center gap-1.5">
              <Vault className="size-3.5 text-primary" />
              Brankas custody
            </li>
            <li className="flex items-center gap-1.5">
              <CalendarClock className="size-3.5 text-primary" />
              Pengingat jatuh tempo
            </li>
          </ul>

          <Card className="mt-8 w-full gap-6 rounded-xl border-border/60 shadow-none">
            {step === "signIn" ? (
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

                    {captchaWajib && (
                      <div className="mt-4 rounded-lg border border-sky-200 bg-sky-50/60 p-3">
                        <p className="flex items-center gap-1.5 text-xs font-medium text-sky-900">
                          <ShieldAlert className="size-3.5" />
                          Verifikasi anti-bot — {captcha.a} + {captcha.b} = ?
                        </p>
                        <Input
                          className="mt-2"
                          aria-label="Jawaban verifikasi anti-bot"
                          inputMode="numeric"
                          placeholder="Jawaban"
                          value={captchaJawab}
                          onChange={(e) => setCaptchaJawab(e.target.value)}
                          disabled={isLoading}
                        />
                        <p className="mt-1.5 text-xs leading-5 text-sky-700">
                          Aktif setelah 2x gagal. Maksimal 5 percobaan per 15 menit.
                        </p>
                      </div>
                    )}

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
                    Kami mengirim kode verifikasi ke {step.email}
                  </CardDescription>
                </CardHeader>
                <PortalPicker selectedPath={redirect} onSelect={selectPortal} />
                <form onSubmit={handleOtpSubmit}>
                  <CardContent className="pb-4">
                    <input type="hidden" name="email" value={step.email} />
                    <input type="hidden" name="code" value={otp} />

                    <div className="flex justify-center">
                      <InputOTP
                        value={otp}
                        onChange={setOtp}
                        maxLength={6}
                        aria-label="Kode verifikasi 6 digit"
                        disabled={isLoading}
                        onKeyDown={(e) => {
                          if (
                            e.key === "Enter" &&
                            otp.length === 6 &&
                            !isLoading
                          ) {
                            const form = (e.target as HTMLElement).closest("form");
                            if (form) {
                              form.requestSubmit();
                            }
                          }
                        }}
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
                      onClick={() => setStep("signIn")}
                      disabled={isLoading}
                      className="w-full"
                    >
                      Gunakan email lain
                    </Button>
                  </CardFooter>
                </form>
              </>
            )}

          </Card>
        </div>
      </div>
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
