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
import { ArrowRight, Loader2, Mail, ShieldAlert, UserX } from "lucide-react";
import { Suspense, useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { useNavigate, useSearchParams } from "react-router";

interface AuthProps {
  redirectAfterAuth?: string;
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
  const { isLoading: authLoading, isAuthenticated, signIn } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = resolveRedirectAfterAuth(
    searchParams.get("returnTo"),
    redirectAfterAuth,
  );
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
          : "Failed to send verification code. Please try again.",
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
      navigate(redirect);
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
      setError("The verification code you entered is incorrect.");
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
      navigate(redirect);
    } catch (error) {
      console.error("Guest login error:", error);
      setKegagalan((k) => k + 1);
      setError(
        `Failed to sign in as guest: ${
          error instanceof Error ? error.message : "Unknown error"
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
          <a
            href="/"
            className="flex items-center gap-2.5 text-sm font-semibold tracking-[0.18em] text-foreground"
          >
            <span className="gradient-primary shadow-glow flex size-8 items-center justify-center rounded-lg font-bold text-primary-foreground">
              P
            </span>
            PINJAM GADAI DIGITAL
          </a>
          <p className="mt-2 text-xs text-muted-foreground">
            Pinjaman &amp; Penggadaian Barang
          </p>

          <Card className="mt-8 w-full gap-6 rounded-xl border-border/60 pb-0 shadow-none">
            {step === "signIn" ? (
              <>
                <CardHeader className="text-center">
                  <CardTitle className="text-xl">Masuk atau buat akun</CardTitle>
                  <CardDescription>
                    Ruang nasabah — ajukan pinjaman tunai atau gadaikan barang
                    dari satu akun
                  </CardDescription>
                </CardHeader>
                <form onSubmit={handleEmailSubmit}>
                  <CardContent>
                    <div className="relative flex items-center gap-2">
                      <div className="relative flex-1">
                        <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input
                          name="email"
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
                        disabled={isLoading}
                      >
                        {isLoading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <ArrowRight className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    {error && (
                      <p className="mt-2 text-sm text-destructive">{error}</p>
                    )}

                    {captchaWajib && (
                      <div className="mt-4 rounded-lg border border-sky-200 bg-sky-50/60 p-3">
                        <p className="flex items-center gap-1.5 text-xs font-medium text-sky-900">
                          <ShieldAlert className="size-3.5" />
                          Verifikasi anti-bot — {captcha.a} + {captcha.b} = ?
                        </p>
                        <Input
                          className="mt-2"
                          inputMode="numeric"
                          placeholder="Jawaban"
                          value={captchaJawab}
                          onChange={(e) => setCaptchaJawab(e.target.value)}
                          disabled={isLoading}
                        />
                        <p className="mt-1.5 text-[11px] leading-4 text-sky-700">
                          Proteksi aktif setelah 2x kegagalan login berturut-turut.
                          Maksimal 5x percobaan salah per 15 menit per IP.
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
                        <UserX className="mr-2 h-4 w-4" />
                        Lanjut sebagai tamu
                      </Button>
                    </div>
                  </CardContent>
                </form>
              </>
            ) : (
              <>
                <CardHeader className="mt-4 text-center">
                  <CardTitle>Cek email Anda</CardTitle>
                  <CardDescription>
                    Kami mengirim kode verifikasi ke {step.email}
                  </CardDescription>
                </CardHeader>
                <form onSubmit={handleOtpSubmit}>
                  <CardContent className="pb-4">
                    <input type="hidden" name="email" value={step.email} />
                    <input type="hidden" name="code" value={otp} />

                    <div className="flex justify-center">
                      <InputOTP
                        value={otp}
                        onChange={setOtp}
                        maxLength={6}
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
                      <p className="mt-2 text-center text-sm text-destructive">
                        {error}
                      </p>
                    )}
                    <p className="mt-4 text-center text-sm text-muted-foreground">
                      Tidak menerima kode?{" "}
                      <Button
                        variant="link"
                        className="h-auto p-0"
                        onClick={() => setStep("signIn")}
                      >
                        Coba lagi
                      </Button>
                    </p>
                  </CardContent>
                  <CardFooter className="flex-col gap-2">
                    <Button
                      type="submit"
                      className="gradient-primary shadow-glow w-full rounded-full border-0 font-medium"
                      disabled={isLoading || otp.length !== 6}
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Memverifikasi…
                        </>
                      ) : (
                        <>
                          Verifikasi kode
                          <ArrowRight className="ml-2 h-4 w-4" />
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

            <div className="rounded-b-xl border-t bg-muted px-6 py-4 text-center text-xs leading-5 text-muted-foreground">
              Pemeriksaan barang gadai dilakukan di lokasi dengan live location
              wajib. Struktur biaya tetap: potongan di muka 5%, bunga 30%,
              total kewajiban 130%.
            </div>
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
