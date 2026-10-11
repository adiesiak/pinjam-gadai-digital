import { Link } from "react-router";
import { ArrowRight, Sparkles } from "lucide-react";

/**
 * Banner aksi utama di atas konten dashboard.
 * CTA buat pengajuan di tempat yang selalu terlihat.
 */
export function HeroActionBanner({ role = "peminjam" }: { role?: string }) {
  if (role !== "peminjam") {
    return null;
  }

  return (
    <section aria-label="Aksi utama dashboard" className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
      <div className="animate-masuk flex items-center gap-4 overflow-hidden rounded-2xl border border-primary/25 bg-primary/5 p-4 shadow-sm sm:p-5">
        <span className="shrink-0 rounded-xl bg-primary text-primary-foreground p-2.5 text-sm font-bold tracking-wide uppercase sm:p-3">
          <Sparkles className="mr-1.5 size-4 sm:size-5" aria-hidden />
          SMSI
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900 sm:text-base">
            Butuh modal cepat? Ajukan sekarang, prosesnya singkat.
          </p>
        </div>

        <div className="shrink-0 flex items-center gap-3">
          <Link to="/dashboard/form" className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary-foreground sm:text-sm">
            Buat pengajuan
            <ArrowRight className="size-3.5 sm:size-4" aria-hidden />
          </Link>
        </div>
      </div>
    </section>
  );
}
