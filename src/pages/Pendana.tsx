import { Loader2 } from "lucide-react";
import { Link, useNavigate } from "react-router";
import { Button } from "@/components/ui/button";

import { useAuth } from "@/hooks/use-auth";

import { Notice, Onboarding } from "./pendana/onboarding";
import { PendanaFooter } from "./pendana/pendana-footer";
import { PendanaHeader } from "./pendana/pendana-header";
import { PendanaWorkspace } from "./pendana/workspace";

/**
 * Halaman Pendana — PINDAI.
 * Hanya merangkai modul di ./pendana/*; tiap bagian hidup di file sendiri agar
 * mudah disunting dan dirawat.
 */
export default function Pendana() {
  const { user, isLoading, isAnonymous, signOut } = useAuth();
  const navigate = useNavigate();
  const role = user?.role;

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </main>
    );
  }

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const greetingName = user?.name ?? user?.email?.split("@")[0] ?? "Pendana";
  const handleCreateAccount = async () => {
    await signOut();
    navigate("/auth?returnTo=%2Fpendana");
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
      {/* Bar pengumuman global dirender di main.tsx (AnnouncementBar). */}
      <PendanaHeader />

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-5 sm:px-6 sm:py-8">
        {isAnonymous ? (
          <div className="animate-masuk mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <h1 className="text-xl font-semibold">Ruang Pendana tersedia setelah masuk dengan akun</h1>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">Mode tamu bersifat baca-saja. Untuk mendaftar sebagai Pendana, masuk atau buat akun menggunakan email OTP terlebih dahulu.</p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Button onClick={() => void handleCreateAccount()}>Masuk / buat akun</Button>
              <Button asChild variant="outline"><Link to="/dashboard">Lihat informasi tamu</Link></Button>
            </div>
          </div>
        ) : role === "pendana" ? (
          <PendanaWorkspace greetingName={greetingName} onSignOut={handleSignOut} />
        ) : role === "admin" ? (
          <Notice
            title="Akun tim tidak dapat menjadi Pendana"
            body="Panel admin dan peran Pendana dipisahkan. Gunakan akun terpisah untuk melihat dan mencatat ledger Pendana; perpindahan dana ditangani di luar aplikasi."
          />
        ) : (
          <Onboarding />
        )}
      </main>

      <PendanaFooter />
    </div>
  );
}
