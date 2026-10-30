import { useAuth } from "@/hooks/use-auth";
import { LoadingScreen } from "@/components/LoadingScreen";
import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";

/**
 * Gerbang halaman INTERNAL (mis. `/promo`): hanya akun berperan `admin`.
 *
 * Pengunjung yang belum masuk tetap diarahkan ke halaman masuk dengan
 * `returnTo`, jadi admin yang membuka bookmark langsung tetap mendarat di
 * halaman itu setelah masuk. Akun yang sudah masuk tetapi bukan admin tidak
 * diberi halaman galat khusus — cukup dialihkan ke dashboard-nya sendiri,
 * supaya keberadaan halaman internal tidak diumumkan lewat pesan penolakan.
 */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated, user } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <LoadingScreen label="Memeriksa sesi…" />;
  }

  if (!isAuthenticated) {
    const returnTo = `${location.pathname}${location.search}`;
    return (
      <Navigate to={`/auth?returnTo=${encodeURIComponent(returnTo)}`} replace />
    );
  }

  if (user?.role !== "admin") {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}

/**
 * Gerbang halaman proposal pendanaan (`/jadi-pendana`): hanya untuk sesi yang
 * sudah membuka ruang pendana — kode akses bersama (`pengamat`), akun pendana
 * beremail (`dana`), atau Super Admin.
 *
 * Pengunjung tanpa sesi dikirim ke pintu kode akses bersama, bukan halaman
 * masuk email: halaman ini tidak dibuka dengan akun peminjam. Peran lain
 * diarahkan ke ruang pendana, tempat penjelasan akses terbatas berada.
 */
export function RequirePendana({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated, user } = useAuth();

  if (isLoading) {
    return <LoadingScreen label="Memeriksa sesi…" />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/akses-bersama" replace />;
  }

  const role = user?.role;
  if (role !== "pengamat" && role !== "dana" && role !== "admin") {
    return <Navigate to="/penyedia-dana" replace />;
  }

  return children;
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <LoadingScreen label="Memeriksa sesi…" />;
  }

  if (!isAuthenticated) {
    const returnTo = `${location.pathname}${location.search}`;
    return (
      <Navigate to={`/auth?returnTo=${encodeURIComponent(returnTo)}`} replace />
    );
  }

  return children;
}
