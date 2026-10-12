import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { Tabs, TabsContent } from "@/components/ui/tabs";

import {
  BadgeAksesAdmin,
  HitungMundurToken,
  KELAS_INPUT_ADMIN,
  KELAS_TAUTAN_ADMIN,
  KepalaMerekAuth,
  KepalaPane,
  KartuAuth,
  LatarAuth,
  LencanaKeamanan,
  MedanAdmin,
  MedanEmailMasuk,
  MedanTokenAdmin,
  MeterKekuatanSandi,
  PesanInfo,
  PesanKesalahan,
  TAB_CEPAT,
  TAB_MASUK,
  TabPintuMasuk,
  TautanBeranda,
  TombolAdmin,
  TombolKembaliAdmin,
  TombolLanjutEmail,
  TombolWhatsappPeminjamLama,
  type TabPintuMasuk as TabAuth,
} from "@/components/auth/auth-shared";
import { KlaimPeminjamLama } from "@/components/klaim/KlaimPeminjamLama";
import { FadeIn } from "@/components/Reveal";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/convex/_generated/api";
import { getClientIp, getUserAgent } from "@/lib/session";
import { ADMIN_ROUTE } from "@/lib/routes";
import { nilaiKekuatanSandi, pesanGalatAdmin } from "@/lib/authAdmin";
import { cn } from "@/lib/utils";
import {
  ArrowRight,
  KeyRound,
  Loader2,
  LockKeyhole,
  Mail,
  ShieldAlert,
  ShieldCheck,
  UserX,
  Zap,
} from "lucide-react";
import { Suspense, useEffect, useRef, useState, type FormEvent } from "react";
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
    user?.role === "admin" ? ADMIN_ROUTE : redirectAfterAuth;
  const redirect = resolveRedirectAfterAuth(
    searchParams.get("returnTo"),
    defaultDestination,
  );
  /**
   * Pintu admin hanya ditampilkan bila pengunjung SUDAH berada di jalur admin
   * — yaitu datang lewat klik 5x logo di landing (`returnTo` = ADMIN_ROUTE).
   * Halaman auth publik karena itu tidak menawarkan tautan admin sama sekali.
   */
  const jalurAdmin =
    authMode === "admin" || searchParams.get("returnTo") === ADMIN_ROUTE;
  // Langkah jalur nasabah: nomor email → kode email, atau jalur "klaim" untuk
  // PEMINJAM LAMA (nomor WhatsApp lama → kode WhatsApp, lihat
  // `components/klaim/KlaimPeminjamLama`).
  const [clientStep, setClientStep] = useState<
    "signIn" | "klaim" | { email: string }
  >("signIn");
  /**
   * Tab kartu masuk. "Masuk Akun" adalah DEFAULT (email → kode verifikasi);
   * "Akses Cepat" mengumpulkan pintu yang jarang dipakai (tamu & kode akses
   * bersama) supaya satu layar tidak menawarkan semua aksi sekaligus.
   */
  const [tab, setTab] = useState<TabAuth>(TAB_MASUK);
  const [adminStep, setAdminStep] = useState<AdminStep>("signIn");
  const [otp, setOtp] = useState("");
  const [adminOtp, setAdminOtp] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  /** Pemulihan batas percobaan kata sandi: kode TOTP aplikasi autentikator. */
  const [adminTotp, setAdminTotp] = useState("");
  const [butuhTotp, setButuhTotp] = useState(false);
  /** Catatan informasi (bukan galat): mis. konfirmasi token baru terkirim. */
  const [info, setInfo] = useState<string | null>(null);
  /**
   * Epoch ms saat token 32 karakter terakhir dikirim. `null` = belum ada token
   * pada langkah ini, sehingga hitung mundur tidak ditampilkan sama sekali.
   */
  const [tokenMulaiPada, setTokenMulaiPada] = useState<number | null>(null);
  const adminFormRef = useRef<HTMLFormElement | null>(null);
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

  // Jalur pemulihan TOTP: begitu 6 digit terisi (dan captcha lolos), kirim form
  // otomatis — admin tidak perlu menekan Enter atau tombol.
  useEffect(() => {
    if (butuhTotp && adminTotp.length === 6 && captchaBenar && !isLoading) {
      adminFormRef.current?.requestSubmit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminTotp, captchaBenar]);

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      navigate(redirect);
    }
  }, [authLoading, isAuthenticated, navigate, redirect]);

  /**
   * Timer token 32 karakter berjalan begitu langkah verifikasi terbuka. Server
   * tetap pemegang aturan sesungguhnya (`adminPasswordOtp.maxAge` = 15 menit);
   * yang ditampilkan di sini adalah sisa masa berlaku untuk token yang baru
   * diminta pada sesi ini, supaya admin tahu kapan boleh minta token baru —
   * bukan menunggu tanpa penjelasan. Kirim ulang token memakai `Date.now()`
   * yang baru sehingga hitungannya mulai dari nol lagi.
   */
  useEffect(() => {
    if (typeof adminStep !== "object") return;
    setTokenMulaiPada((sebelumnya) => sebelumnya ?? Date.now());
  }, [adminStep]);

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
    setAdminTotp("");
    setButuhTotp(false);
    setError(null);
    setInfo(null);
    setTokenMulaiPada(null);
  };

  /**
   * Pindah tab login. Selama pengunjung berada di jalur admin, tujuan
   * `returnTo` admin dipertahankan: itulah yang membuat calon Super Admin
   * pertama bisa membuat akun lewat OTP email lalu tetap mendarat di panel
   * admin untuk bootstrap, bukan terlempar ke /dashboard.
   */
  const switchAuthMode = (nextMode: "client" | "admin") => {
    setAuthMode(nextMode);
    setError(null);
    if (nextMode !== "admin") return;
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
      // Pesan seragam untuk semua alamat: jangan pernah mengonfirmasi bahwa
      // sebuah email adalah akun Super Admin (permintaan OTP admin dibalas
      // sama seperti email biasa).
      setError("Gagal mengirim kode verifikasi. Coba lagi sebentar lagi.");
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
    // Hanya langkah kode email yang dilanjutkan di sini; "klaim" memakai
    // formulirnya sendiri (`KlaimPeminjamLama`) dan tidak pernah sampai ke sini.
    if (typeof clientStep !== "object") return;
    setIsLoading(true);
    try {
      const formData = new FormData(event.currentTarget);
      await signIn("email-otp", formData);
      await recordSuccessfulLogin("email_otp");
    } catch (error) {
      console.error("OTP verification error:", error);
      setKegagalan((k) => k + 1);
      await recordFailedAttempt(clientStep.email.toLowerCase());
      setError("Kode verifikasi salah atau kedaluwarsa.");
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
    setInfo(null);
    try {
      if (adminStep === "signIn") {
        const result = await signIn("password", {
          flow: "signIn",
          email: adminEmail,
          password: adminPassword,
          // Kode TOTP hanya dipakai saat batas percobaan aktif (pemulihan).
          ...(adminTotp.trim() !== "" ? { kodeTotp: adminTotp.trim() } : {}),
        });
        if (result.signingIn) {
          await recordSuccessfulLogin("password");
        } else {
          setAdminOtp("");
          setAdminStep({
            kind: "code",
            email: adminEmail,
            purpose: "activation",
          });
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
        setAdminStep({
          kind: "code",
          email: adminEmail,
          purpose: "activation",
        });
      } else if (adminStep === "reset") {
        await signIn("password", { flow: "reset", email: adminEmail });
        setAdminOtp("");
        setAdminStep({ kind: "code", email: adminEmail, purpose: "reset" });
      }
    } catch (error) {
      console.error("Admin password flow error:", error);
      setKegagalan((k) => k + 1);
      await recordFailedAttempt(adminEmail.toLowerCase() || "admin");
      const { pesan, pulihDenganTotp } = pesanGalatAdmin(error);
      if (pulihDenganTotp === true) {
        // Jalur pemulihan: admin yang memegang kode TOTP tidak perlu menunggu
        // 15 menit — kata sandi tetap wajib benar.
        setButuhTotp(true);
        setAdminTotp("");
      }
      setError(pesan);
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
    setInfo(null);
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
        flow:
          adminStep.purpose === "reset"
            ? "reset-verification"
            : "email-verification",
        email: adminStep.email,
        code: adminOtp,
        ...(adminStep.purpose === "reset" ? { newPassword } : {}),
      });
      if (!result.signingIn) {
        throw new Error("Token verifikasi tidak valid.");
      }
      await recordSuccessfulLogin(
        adminStep.purpose === "reset"
          ? "password_reset"
          : "password_activation",
      );
      setNewPassword("");
      setConfirmPassword("");
    } catch (error) {
      console.error("Admin OTP verification error:", error);
      setKegagalan((k) => k + 1);
      await recordFailedAttempt(adminStep.email.toLowerCase());
      setError(
        "Token verifikasi salah atau kedaluwarsa. Periksa email dan coba lagi.",
      );
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
        `Gagal masuk sebagai tamu: ${error instanceof Error ? error.message : "kesalahan tidak diketahui"}`,
      );
      setIsLoading(false);
    }
  };

  /**
   * Kirim ulang token SETELAH masa berlakunya habis. Sumber token sama dengan
   * langkah asalnya — tidak ada jalur server baru: reset memakai flow `reset`
   * (cukup email), sedangkan aktivasi memakai flow `signUp` yang WAJIB membawa
   * kata sandi. Karena kata sandi sengaja tidak disimpan setelah token pertama
   * terkirim, aktivasi dikembalikan ke langkahnya agar admin mengisi ulang —
   * tetap tanpa memuat ulang halaman.
   */
  const kirimUlangToken = async () => {
    setError(null);
    setInfo(null);
    if (typeof adminStep !== "object") return;
    const email = adminStep.email;
    if (adminStep.purpose === "activation") {
      setAdminFlow("activate");
      setInfo(
        "Demi keamanan, kata sandi tidak disimpan. Isi email & kata sandi baru sekali lagi, lalu kirim token aktivasi baru.",
      );
      return;
    }
    setIsLoading(true);
    try {
      await signIn("password", { flow: "reset", email });
      setTokenMulaiPada(Date.now());
      setInfo(`Token baru sudah dikirim ke ${email}.`);
    } catch (error) {
      console.error("Admin token resend error:", error);
      setError(pesanGalatAdmin(error).pesan);
    } finally {
      setIsLoading(false);
    }
  };

  /** Buka kolom verifikasi tanpa memuat ulang halaman (timer diarm oleh efek). */
  const bukaLangkahKode = (purpose: "activation" | "reset") => {
    setAdminFlow({ kind: "code", email: adminEmail.trim(), purpose });
  };

  /**
   * Syarat tombol kirim langkah kata sandi: 8+ karakter (batas server) dan
   * konfirmasi cocok. Meter kekuatan sandi sengaja TIDAK jadi penjaga di sini —
   * ia hanya menyarankan, supaya kata sandi sah tidak terkunci karena meternya
   * belum hijau.
   */
  const sandiBaruSiap =
    nilaiKekuatanSandi(newPassword).panjangCukup &&
    newPassword === confirmPassword;

  const isAdminCodeStep = typeof adminStep !== "string";

  /* Kunci animasi masuk kartu: satu transisi halus setiap langkah berganti. */
  const langkahKey =
    authMode === "client"
      ? `client-${typeof clientStep === "string" ? clientStep : "kode"}`
      : `admin-${typeof adminStep === "string" ? adminStep : `kode-${adminStep.purpose}`}`;

  return (
    <LatarAuth>
      <FadeIn className="w-full">
        <div className="flex w-full flex-col items-center">
          <KepalaMerekAuth />

          {/* Satu langkah = satu kartu; kunci animasi masuk tetap per langkah. */}
          <div key={langkahKey} className="animate-masuk mt-8 w-full">
            <KartuAuth varian={authMode === "admin" ? "admin" : "nasabah"}>
              {authMode === "client" ? (
                clientStep === "signIn" ? (
                  <>
                    <Tabs
                      value={tab}
                      onValueChange={(value) => {
                        setTab(value as TabAuth);
                        setError(null);
                      }}
                      className="block"
                    >
                      <TabPintuMasuk />

                      {/* Tab 1 — MASUK AKUN (default): email → kode verifikasi. */}
                      <TabsContent value={TAB_MASUK} className="mt-6">
                        <KepalaPane
                          judul="Masuk atau buat akun"
                          keterangan="Masuk untuk mencatat pengajuan pinjaman atau gadai."
                          ikon={<ShieldCheck className="size-5" />}
                        />
                        <form
                          onSubmit={handleEmailSubmit}
                          className="space-y-3"
                        >
                          <MedanEmailMasuk isLoading={isLoading} />
                          {error && <PesanKesalahan pesan={error} />}
                          <CaptchaChallenge
                            visible={captchaWajib}
                            a={captcha.a}
                            b={captcha.b}
                            value={captchaJawab}
                            onChange={setCaptchaJawab}
                            disabled={isLoading}
                          />
                          <TombolLanjutEmail isLoading={isLoading} />
                          {/* Pintu PEMINJAM LAMA (data impor web lama): nomor
                              WhatsApp → kode OTP → sesi akun PEMILIK data
                              impor, jadi dashboard langsung berisi riwayat. */}
                          <TombolWhatsappPeminjamLama
                            disabled={isLoading}
                            onClick={() => {
                              setError(null);
                              setClientStep("klaim");
                            }}
                          />
                        </form>
                      </TabsContent>

                      {/* Tab 2 — AKSES CEPAT: tamu & kode akses bersama. */}
                      <TabsContent value={TAB_CEPAT} className="mt-6">
                        <KepalaPane
                          judul="Akses cepat"
                          keterangan="Coba aplikasi sebagai tamu, atau masuk sebagai pemantau dengan kode akses bersama."
                          ikon={<Zap className="size-5" />}
                        />
                        <div className="space-y-3">
                          <button
                            type="button"
                            onClick={handleGuestLogin}
                            disabled={isLoading}
                            className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 shadow-xs transition-all hover:bg-slate-50 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <UserX className="size-4" aria-hidden="true" />
                            Lanjut sebagai tamu
                          </button>
                          <p className="text-xs leading-5 text-slate-500">
                            Sesi tamu hanya bisa melihat. Data yang sudah diisi
                            tetap tersimpan di akun tamu dan bisa dilanjutkan
                            setelah Anda masuk dengan email.
                          </p>

                          {/* Pintu khusus pemantau penyedia dana — satu kode
                              bersama, akses lihat saja. */}
                          <Link
                            to="/akses-bersama"
                            className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 px-4 py-3 text-sm font-medium text-slate-600 transition-all hover:border-emerald-600/40 hover:bg-emerald-50/60 hover:text-emerald-900"
                          >
                            <KeyRound className="size-4" aria-hidden="true" />
                            Punya kode akses bersama? Masuk di sini
                          </Link>

                          {error && <PesanKesalahan pesan={error} />}
                          {/* Verifikasi anti-bot yang sama juga menjaga aksi
                              tamu, jadi harus terlihat di tab ini. */}
                          <CaptchaChallenge
                            visible={captchaWajib}
                            a={captcha.a}
                            b={captcha.b}
                            value={captchaJawab}
                            onChange={setCaptchaJawab}
                            disabled={isLoading}
                          />
                        </div>
                      </TabsContent>
                    </Tabs>
                  </>
                ) : clientStep === "klaim" ? (
                  <>
                    <KepalaPane
                      judul="Pemulihan akun web lama"
                      keterangan="Masuk dengan nomor WhatsApp yang Anda pakai pada PINDAI sebelumnya."
                      ikon={<KeyRound className="size-5" />}
                    />
                    <KlaimPeminjamLama
                      onKembali={() => {
                        setError(null);
                        setClientStep("signIn");
                      }}
                    />
                    <p className="mt-3 text-center text-[11px] leading-5 text-slate-500">
                      Belum pernah mengajukan dari web lama? Kembali dan daftar
                      dengan email.
                    </p>
                  </>
                ) : (
                  <>
                    <KepalaPane
                      judul="Cek email Anda"
                      keterangan={`Kami mengirim kode verifikasi ke ${clientStep.email}`}
                      ikon={<Mail className="size-5" />}
                    />
                    <form onSubmit={handleOtpSubmit} className="space-y-3">
                      <input
                        type="hidden"
                        name="email"
                        value={clientStep.email}
                      />
                      <input type="hidden" name="code" value={otp} />

                      <VerificationCodeField
                        value={otp}
                        onChange={setOtp}
                        disabled={isLoading}
                      />
                      {error && (
                        <PesanKesalahan pesan={error} className="text-center" />
                      )}
                      <CaptchaChallenge
                        visible={captchaWajib}
                        a={captcha.a}
                        b={captcha.b}
                        value={captchaJawab}
                        onChange={setCaptchaJawab}
                        disabled={isLoading}
                      />
                      <Button
                        type="submit"
                        className="h-12 w-full rounded-xl gradient-primary font-semibold text-primary-foreground"
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
                    </form>
                  </>
                )
              ) : (
                <>
                  {/* Badge keamanan tampil di semua langkah jalur admin. */}
                  <div className="flex justify-center">
                    <BadgeAksesAdmin />
                  </div>

                  {adminStep === "signIn" && (
                    <>
                      <KepalaPane
                        judul="Akses Super Admin"
                        keterangan="Masuk dengan kata sandi. Verifikasi TOTP tetap berlaku sesuai pengaturan akun."
                        ikon={<ShieldCheck className="size-5" />}
                      />
                      <form
                        ref={adminFormRef}
                        onSubmit={handleAdminSubmit}
                        className="space-y-4"
                      >
                        <MedanAdmin
                          id="admin-email"
                          label="Email Super Admin"
                          tipe="email"
                          nilai={adminEmail}
                          onUbah={setAdminEmail}
                          autoComplete="username"
                          placeholder="admin@contoh.com"
                          nonaktif={isLoading}
                        />
                        <MedanAdmin
                          id="admin-password"
                          label="Kata sandi"
                          tipe="password"
                          nilai={adminPassword}
                          onUbah={setAdminPassword}
                          autoComplete="current-password"
                          placeholder="Kata sandi admin"
                          nonaktif={isLoading}
                        />
                        {butuhTotp && (
                          <div className="space-y-2">
                            <label
                              htmlFor="admin-totp"
                              className="text-sm font-medium text-slate-700"
                            >
                              Kode TOTP (pemulihan)
                            </label>
                            <input
                              id="admin-totp"
                              inputMode="numeric"
                              autoComplete="one-time-code"
                              maxLength={6}
                              placeholder="123456"
                              value={adminTotp}
                              onChange={(event) =>
                                setAdminTotp(
                                  event.target.value
                                    .replace(/\D/g, "")
                                    .slice(0, 6),
                                )
                              }
                              disabled={isLoading}
                              className={cn(
                                KELAS_INPUT_ADMIN,
                                "font-mono tracking-wider",
                              )}
                            />
                            <p className="text-xs leading-5 text-slate-500">
                              Batas percobaan sedang aktif. Isi kode dari
                              aplikasi autentikator untuk masuk sekarang — kata
                              sandi tetap wajib benar.
                            </p>
                          </div>
                        )}
                        {error && <PesanKesalahan pesan={error} />}
                        {info && <PesanInfo pesan={info} />}
                        <CaptchaChallenge
                          visible={captchaWajib}
                          a={captcha.a}
                          b={captcha.b}
                          value={captchaJawab}
                          onChange={setCaptchaJawab}
                          disabled={isLoading}
                        />
                        <TombolAdmin
                          memuat={isLoading}
                          nonaktif={
                            adminEmail.trim() === "" || adminPassword === ""
                          }
                          ikon={
                            <LockKeyhole
                              className="size-4"
                              aria-hidden="true"
                            />
                          }
                        >
                          Masuk sebagai Super Admin
                        </TombolAdmin>
                        <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
                          <button
                            type="button"
                            className={KELAS_TAUTAN_ADMIN}
                            onClick={() => setAdminFlow("activate")}
                            disabled={isLoading}
                          >
                            Aktivasi password
                          </button>
                          <span aria-hidden="true" className="text-slate-300">
                            •
                          </span>
                          <button
                            type="button"
                            className={KELAS_TAUTAN_ADMIN}
                            onClick={() => setAdminFlow("reset")}
                            disabled={isLoading}
                          >
                            Lupa kata sandi?
                          </button>
                        </div>
                      </form>
                    </>
                  )}

                  {adminStep === "activate" && (
                    <>
                      <KepalaPane
                        judul="Aktivasi password admin"
                        keterangan="Aktivasi hanya berlaku untuk akun yang belum punya kata sandi. Token 32 karakter dikirim ke email terverifikasi; kalau kata sandi sudah pernah aktif, tidak ada token yang dikirim — kembali dan gunakan Masuk atau Lupa kata sandi."
                        ikon={<KeyRound className="size-5" />}
                      />
                      <form onSubmit={handleAdminSubmit} className="space-y-4">
                        <MedanAdmin
                          id="activate-admin-email"
                          label="Email Super Admin terverifikasi"
                          tipe="email"
                          nilai={adminEmail}
                          onUbah={setAdminEmail}
                          autoComplete="username"
                          placeholder="admin@contoh.com"
                          nonaktif={isLoading}
                        />
                        <div>
                          <MedanAdmin
                            id="activate-admin-password"
                            label="Buat kata sandi (minimal 8 karakter)"
                            tipe="password"
                            nilai={newPassword}
                            onUbah={setNewPassword}
                            autoComplete="new-password"
                            minPanjang={8}
                            nonaktif={isLoading}
                          />
                          <MeterKekuatanSandi sandi={newPassword} />
                        </div>
                        <div>
                          <MedanAdmin
                            id="activate-admin-confirm"
                            label="Ulangi kata sandi"
                            tipe="password"
                            nilai={confirmPassword}
                            onUbah={setConfirmPassword}
                            autoComplete="new-password"
                            minPanjang={8}
                            petunjuk={
                              confirmPassword === ""
                                ? undefined
                                : newPassword === confirmPassword
                                  ? "Kedua kata sandi sudah sama."
                                  : "Ulangi kata sandi belum sama dengan yang di atas."
                            }
                            nonaktif={isLoading}
                          />
                        </div>
                        {error && <PesanKesalahan pesan={error} />}
                        {info && <PesanInfo pesan={info} />}
                        <CaptchaChallenge
                          visible={captchaWajib}
                          a={captcha.a}
                          b={captcha.b}
                          value={captchaJawab}
                          onChange={setCaptchaJawab}
                          disabled={isLoading}
                        />
                        <TombolAdmin
                          memuat={isLoading}
                          nonaktif={adminEmail.trim() === "" || !sandiBaruSiap}
                          ikon={<Mail className="size-4" aria-hidden="true" />}
                        >
                          Kirim token aktivasi
                        </TombolAdmin>
                        <p className="text-center text-xs leading-5 text-slate-500">
                          Setelah token dikirim, kolom verifikasi terbuka dan
                          hitung mundur 15 menit mulai berjalan. Kalau token
                          sudah ada di email tetapi layar belum berpindah:
                        </p>
                        <button
                          type="button"
                          className={cn(
                            KELAS_TAUTAN_ADMIN,
                            "w-full text-center",
                          )}
                          onClick={() => bukaLangkahKode("activation")}
                          disabled={isLoading || adminEmail.trim() === ""}
                        >
                          Saya sudah menerima token — buka kolom verifikasi
                        </button>
                        <TombolKembaliAdmin
                          onClick={() => setAdminFlow("signIn")}
                          nonaktif={isLoading}
                        />
                      </form>
                    </>
                  )}

                  {adminStep === "reset" && (
                    <>
                      <KepalaPane
                        judul="Reset kata sandi admin"
                        keterangan="Token 32 karakter dikirim ke email terdaftar kalau kata sandi sudah pernah diaktifkan. Kalau belum, kembali dan gunakan Aktivasi password lebih dulu."
                        ikon={<Mail className="size-5" />}
                      />
                      <form onSubmit={handleAdminSubmit} className="space-y-4">
                        <MedanAdmin
                          id="reset-admin-email"
                          label="Email Super Admin"
                          tipe="email"
                          nilai={adminEmail}
                          onUbah={setAdminEmail}
                          autoComplete="username"
                          placeholder="admin@contoh.com"
                          nonaktif={isLoading}
                        />
                        {error && <PesanKesalahan pesan={error} />}
                        {info && <PesanInfo pesan={info} />}
                        <CaptchaChallenge
                          visible={captchaWajib}
                          a={captcha.a}
                          b={captcha.b}
                          value={captchaJawab}
                          onChange={setCaptchaJawab}
                          disabled={isLoading}
                        />
                        <TombolAdmin
                          memuat={isLoading}
                          nonaktif={adminEmail.trim() === ""}
                          ikon={<Mail className="size-4" aria-hidden="true" />}
                        >
                          Kirim token reset
                        </TombolAdmin>
                        <TombolKembaliAdmin
                          onClick={() => setAdminFlow("signIn")}
                          nonaktif={isLoading}
                        />
                      </form>
                    </>
                  )}

                  {isAdminCodeStep && (
                    <>
                      <KepalaPane
                        judul={
                          adminStep.purpose === "reset"
                            ? "Verifikasi reset password"
                            : "Verifikasi aktivasi password"
                        }
                        keterangan={
                          adminStep.purpose === "reset"
                            ? `Tempel token 32 karakter alfanumerik yang dikirim ke ${adminStep.email} apabila kata sandi sudah pernah diaktifkan. Berlaku 15 menit; perhatikan huruf besar/kecil.`
                            : `Kalau kata sandi belum pernah aktif, token 32 karakter dikirim ke ${adminStep.email} dan berlaku 15 menit. Kalau sudah aktif, tidak ada token yang dikirim — kembali dan gunakan Masuk atau Lupa kata sandi.`
                        }
                        ikon={
                          adminStep.purpose === "reset" ? (
                            <LockKeyhole className="size-5" />
                          ) : (
                            <Mail className="size-5" />
                          )
                        }
                      />
                      <form
                        onSubmit={handleAdminCodeSubmit}
                        className="space-y-4"
                      >
                        <MedanTokenAdmin
                          nilai={adminOtp}
                          onUbah={setAdminOtp}
                          nonaktif={isLoading}
                        />
                        <HitungMundurToken
                          mulaiPada={tokenMulaiPada}
                          onKirimUlang={() => void kirimUlangToken()}
                          sibuk={isLoading}
                        />
                        {adminStep.purpose === "reset" && (
                          <>
                            <div>
                              <MedanAdmin
                                id="reset-new-password"
                                label="Kata sandi baru (minimal 8 karakter)"
                                tipe="password"
                                nilai={newPassword}
                                onUbah={setNewPassword}
                                autoComplete="new-password"
                                minPanjang={8}
                                nonaktif={isLoading}
                              />
                              <MeterKekuatanSandi sandi={newPassword} />
                            </div>
                            <MedanAdmin
                              id="reset-confirm-password"
                              label="Ulangi kata sandi baru"
                              tipe="password"
                              nilai={confirmPassword}
                              onUbah={setConfirmPassword}
                              autoComplete="new-password"
                              minPanjang={8}
                              petunjuk={
                                confirmPassword === ""
                                  ? undefined
                                  : newPassword === confirmPassword
                                    ? "Kedua kata sandi sudah sama."
                                    : "Ulangi kata sandi belum sama dengan yang di atas."
                              }
                              nonaktif={isLoading}
                            />
                          </>
                        )}
                        {error && (
                          <PesanKesalahan
                            pesan={error}
                            className="text-center"
                          />
                        )}
                        {info && <PesanInfo pesan={info} />}
                        <CaptchaChallenge
                          visible={captchaWajib}
                          a={captcha.a}
                          b={captcha.b}
                          value={captchaJawab}
                          onChange={setCaptchaJawab}
                          disabled={isLoading}
                        />
                        <TombolAdmin
                          memuat={isLoading}
                          nonaktif={
                            adminOtp.length !== 32 ||
                            (adminStep.purpose === "reset" && !sandiBaruSiap)
                          }
                          ikon={
                            <ShieldCheck
                              className="size-4"
                              aria-hidden="true"
                            />
                          }
                        >
                          {adminStep.purpose === "reset"
                            ? "Verifikasi & ganti password"
                            : "Verifikasi & aktifkan password"}
                        </TombolAdmin>
                        <TombolKembaliAdmin
                          onClick={() => setAdminFlow("signIn")}
                          nonaktif={isLoading}
                        />
                      </form>
                    </>
                  )}
                </>
              )}

              {/* Jalur admin tidak pernah ditawarkan di halaman auth publik —
                  hanya tampil bila pengunjung datang lewat pintu tersembunyi. */}
              {jalurAdmin &&
                ((authMode === "client" && clientStep === "signIn") ||
                  (authMode === "admin" && adminStep === "signIn")) && (
                  <div className="mt-6 border-t border-slate-200/80 pt-4">
                    <Button
                      type="button"
                      variant="link"
                      className="w-full text-xs whitespace-normal text-slate-500 hover:text-emerald-800"
                      onClick={() =>
                        switchAuthMode(
                          authMode === "client" ? "admin" : "client",
                        )
                      }
                      disabled={isLoading}
                    >
                      {authMode === "client"
                        ? "Masuk sebagai Super Admin"
                        : "Belum punya kata sandi? Masuk / buat akun dengan OTP email"}
                    </Button>
                  </div>
                )}

              {/* Indikator keamanan: bagian terakhir kartu, sebelum navigasi. */}
              <LencanaKeamanan />
            </KartuAuth>
          </div>

          {/* Navigasi bawah kartu + persetujuan, satu blok yang rapi. */}
          <div className="mt-6 flex w-full flex-col items-center gap-3 text-center">
            <TautanBeranda />
            <p className="text-[11px] leading-5 text-slate-500">
              Dengan masuk, Anda menyetujui{" "}
              <Link
                to="/syarat-ketentuan"
                className="font-medium text-emerald-800 underline underline-offset-2 hover:text-emerald-700"
              >
                Syarat &amp; Ketentuan
              </Link>
              .
            </p>
          </div>
        </div>
      </FadeIn>
    </LatarAuth>
  );
}

export default function AuthPage(props: AuthProps) {
  return (
    <Suspense>
      <Auth {...props} />
    </Suspense>
  );
}
