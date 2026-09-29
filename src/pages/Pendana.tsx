import { Loader2 } from "lucide-react";
import { useNavigate } from "react-router";

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
  const { user, isLoading, signOut } = useAuth();
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

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
      {/* Bar pengumuman global dirender di main.tsx (AnnouncementBar). */}
      <PendanaHeader />

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-5 sm:px-6 sm:py-8">
        {role === "pendana" ? (
          <PendanaWorkspace greetingName={greetingName} onSignOut={handleSignOut} />
        ) : role === "admin" ? (
          <Notice
            title="Akun tim tidak dapat menjadi Pendana"
            body="Panel admin dan peran Pendana dipisahkan demi kepatuhan. Gunakan akun terpisah untuk mendanai."
          />
        ) : (
          <Onboarding />
        )}
      </main>

      <PendanaFooter />
    </div>
  );
}
