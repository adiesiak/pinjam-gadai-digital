/**
 * Banner kampanye promo pinjaman. Tanpa hook Convex supaya bisa dirender di uji
 * dan dipakai di keempat permukaan dengan data yang sudah diambil pemanggil.
 *
 * Permukaannya sengaja tidak memakai kaca atau pendaran: satu-satunya aksen di
 * sini adalah garis kuningan yang sama dengan tepi kartu hero, dan warna teks
 * tetap tinta di atas kertas hangat.
 */
import { Link } from "react-router";

import { Button } from "@/components/ui/button";
import {
  formatPeriodePromo,
  type DataPromoPinjaman,
  type PenempatanPromo,
} from "@/lib/promoPinjaman";
import { ADMIN_ROUTE } from "@/lib/routes";
import { cn } from "@/lib/utils";

// /promo dijaga `RequireAdmin`, jadi CTA publik tidak boleh mengarah ke sana.
const TAUTAN: Record<PenempatanPromo, string | null> = {
  beranda: `/auth?returnTo=${encodeURIComponent("/dashboard?tab=form")}`,
  // Pembaca halaman /promo adalah admin, jadi aksinya menuju pengatur kampanye.
  promo: `${ADMIN_ROUTE}?tab=promo`,
  dashboard: null,
  pengajuan: null,
};

const LABEL_CTA: Partial<Record<PenempatanPromo, string>> = {
  beranda: "Ajukan pinjaman",
  promo: "Atur promo",
};

export function PromoPinjamanKartu({
  promo,
  penempatan,
  onAjukan,
  nonaktifkanAksi = false,
  className,
}: {
  promo: DataPromoPinjaman;
  penempatan: PenempatanPromo;
  /** Hanya dipakai di dashboard: membuka formulir tanpa pindah halaman. */
  onAjukan?: () => void;
  /** Pratinjau panel admin: CTA tampil, tetapi tidak bisa diklik. */
  nonaktifkanAksi?: boolean;
  className?: string;
}) {
  const id = `promo-pinjaman-${penempatan}`;
  const tautan = TAUTAN[penempatan];
  const labelCta = LABEL_CTA[penempatan];

  return (
    <section
      aria-labelledby={id}
      className={cn(
        "min-w-0 rounded-2xl border border-gold/45 bg-secondary/45 text-slate-900",
        penempatan === "pengajuan" ? "px-4 py-3" : "p-4 sm:p-5",
        className,
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <div className="min-w-0">
          {promo.badge.trim() === "" ? null : (
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gold-foreground">
              {promo.badge}
            </p>
          )}
          <h2
            id={id}
            className="mt-1 text-base font-semibold leading-6 text-navy sm:text-lg"
          >
            {promo.judul}
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
            {promo.deskripsi}
          </p>
          <p className="mt-2 text-xs text-slate-500">
            Berlaku{" "}
            <span className="font-medium text-slate-700">
              {formatPeriodePromo(promo.mulai, promo.selesai)}
            </span>
          </p>
        </div>

        {tautan !== null && labelCta !== undefined ? (
          nonaktifkanAksi ? (
            <Button type="button" size="sm" className="min-h-11 shrink-0" disabled>
              {labelCta}
            </Button>
          ) : (
            <Button asChild size="sm" className="min-h-11 shrink-0">
              <Link to={tautan}>{labelCta}</Link>
            </Button>
          )
        ) : null}

        {penempatan === "dashboard" && onAjukan !== undefined ? (
          <Button
            type="button"
            size="sm"
            className="min-h-11 shrink-0"
            onClick={onAjukan}
            disabled={nonaktifkanAksi}
          >
            Ajukan pinjaman
          </Button>
        ) : null}
      </div>
    </section>
  );
}
