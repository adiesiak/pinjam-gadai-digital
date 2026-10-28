/**
 * Pintu masuk ruang pendana di beranda.
 *
 * Skema imbal hasil dan angka penempatan TIDAK diumumkan di halaman publik:
 * ruang pendana dibuka dengan kode akses bersama yang dibagikan admin, dan
 * halaman `/jadi-pendana` tetap di balik gerbang itu. Yang ditampilkan di sini
 * hanya jalan masuknya, supaya pendana lama tidak perlu menghafal URL.
 */
import { IkonWhatsapp } from "@/components/IkonWhatsapp";
import { ArrowRight, LockKeyhole } from "lucide-react";
import { Link } from "react-router";

import { Button } from "@/components/ui/button";
import { urlChatCs } from "@/lib/kontak";

const ISI = [
  "Penempatan dana beserta status tiap pinjaman.",
  "Catatan transfer yang sudah dicairkan admin.",
  "Proposal pendanaan dalam bentuk PDF.",
] as const;

export function RuangPendanaBeranda() {
  return (
    <section
      aria-labelledby="pendana-judul"
      className="border-t border-border bg-background"
    >
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-18">
        <div className="rounded-kartu bg-navy px-5 py-8 text-white sm:px-8 sm:py-10">
          <div className="grid gap-7 lg:grid-cols-[1.15fr_0.85fr] lg:items-center lg:gap-12">
            <div>
              <p className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/70">
                <LockKeyhole className="size-3.5" aria-hidden="true" />
                Khusus pendana
              </p>
              <h2
                id="pendana-judul"
                className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl"
              >
                Ruang pendana dibuka dengan kode akses.
              </h2>
              <p className="mt-3 max-w-lg text-sm leading-6 text-white/75">
                Penempatan dana, catatan transfer, dan proposal pendanaan tidak
                terbuka untuk umum. Admin membagikan kode akses bersama kepada
                pendana yang sudah dikenal; kode itu membuka ruang baca-saja.
              </p>
              <ul className="mt-4 space-y-1.5">
                {ISI.map((baris) => (
                  <li
                    key={baris}
                    className="flex items-start gap-2 text-sm leading-6 text-white/80"
                  >
                    <span
                      aria-hidden="true"
                      className="mt-2 size-1.5 shrink-0 rounded-full bg-gold"
                    />
                    {baris}
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-xl border border-white/15 bg-white/5 p-4 sm:p-5">
              <p className="text-sm font-semibold text-white">
                Sudah punya kode akses?
              </p>
              <p className="mt-1 text-xs leading-5 text-white/70">
                Masukkan kode dari admin untuk membuka ruang pendana. Kode tidak
                berlaku untuk pengajuan pinjaman.
              </p>
              <Button
                asChild
                className="mt-4 min-h-11 w-full bg-white text-navy hover:bg-white/90"
              >
                <Link to="/akses-bersama">
                  Buka ruang pendana
                  <ArrowRight className="ml-1.5 size-4" aria-hidden="true" />
                </Link>
              </Button>
              <a
                href={urlChatCs(
                  "Halo, saya pendana PINDAI dan ingin menanyakan kode akses ruang pendana.",
                )}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-white/25 px-4 text-sm font-semibold text-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
              >
                <IkonWhatsapp className="mr-1.5 size-4" />
                Belum punya kode? Chat admin
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
