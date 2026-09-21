import { Megaphone, X } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { useQuery } from "convex/react";

import { api } from "@/convex/_generated/api";

const DISMISS_KEY = "pindai-ann-dismissed";

/**
 * Bar pengumuman berjalan di paling atas semua halaman.
 * Konten dikelola tim lewat CMS di panel admin (tabel pengumuman);
 * bisa ditutup sesi ini dan tetap tersembunyi sampai sesi berikutnya.
 */
export function AnnouncementBar() {
  const ann = useQuery(api.announcements.getPublic);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return window.sessionStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  });

  if (dismissed || ann === undefined || !ann.barAktif) return null;

  const dismiss = () => {
    try {
      window.sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* private mode — biarkan hilang untuk render ini saja */
    }
    setDismissed(true);
  };

  /** Satu "setengah" track: teks digandakan 3× agar loop marquee mulus. */
  const half = (
    <div className="flex shrink-0 items-center" aria-hidden={false}>
      {[0, 1, 2].map((i) => (
        <span key={i} className="flex items-center">
          <span className="mx-6 flex items-center gap-2 text-xs font-medium text-sky-900">
            <Megaphone className="size-3.5 text-sky-600" />
            {ann.barTeks}
            {ann.barTautan && (
              <Link
                to={ann.barTautan}
                className="font-semibold text-emerald-700 underline decoration-emerald-400/60 underline-offset-2 transition hover:text-emerald-800"
              >
                Mulai sekarang
              </Link>
            )}
          </span>
          <span className="text-[8px] text-sky-300">✦</span>
        </span>
      ))}
    </div>
  );

  return (
    <div className="marquee-paused relative z-50 overflow-hidden border-b border-sky-100 bg-gradient-to-r from-sky-50 via-white to-emerald-50/70">
      <div className="animate-marquee flex w-max py-2">
        {half}
        {half}
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Tutup pengumuman"
        className="absolute right-2.5 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 transition hover:bg-white/80 hover:text-slate-700"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
