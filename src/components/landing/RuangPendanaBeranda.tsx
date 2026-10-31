/**
 * Pintu masuk ruang pendana di beranda.
 *
 * Skema imbal hasil dan angka penempatan TIDAK diumumkan di halaman publik:
 * ruang pendana dibuka dengan kode akses bersama yang dibagikan admin, dan
 * halaman `/jadi-pendana` tetap di balik gerbang itu. Di beranda ia cukup
 * menjadi satu strip, bukan panel gelap yang bersaing dengan ajakan peminjam.
 */
import { ArrowRight, LockKeyhole } from "lucide-react";
import { Link } from "react-router";

import { IkonWhatsapp } from "@/components/IkonWhatsapp";
import { urlChatCs } from "@/lib/kontak";

export function RuangPendanaBeranda() {
  return (
    <section
      aria-labelledby="pendana-judul"
      className="border-t border-border bg-background"
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
            <LockKeyhole className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gold-foreground">
              Untuk calon pendana
            </p>
            <h2
              id="pendana-judul"
              className="mt-1 text-base font-semibold text-foreground"
            >
              Ruang pendana dibuka dengan kode akses.
            </h2>
            <p className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground">
              Penempatan dana, catatan transfer, dan proposal pendanaan tidak
              terbuka untuk umum. Kode dari admin membuka ruang baca-saja.
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2 pl-12 sm:pl-0">
          <Link
            to="/akses-bersama"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border bg-card px-4 text-sm font-semibold text-primary hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Buka ruang pendana
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
          <a
            href={urlChatCs(
              "Halo, saya pendana PINDAI dan ingin menanyakan kode akses ruang pendana.",
            )}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <IkonWhatsapp className="size-4" aria-hidden="true" />
            Chat admin
          </a>
        </div>
      </div>
    </section>
  );
}
