import { TriangleAlert } from "lucide-react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  ANCHOR_RISIKO_PENDANAAN,
  JUDUL_RISIKO_PENDANAAN,
  POIN_RISIKO_PENDANAAN,
  TEKS_BANNER_RISIKO,
} from "@/lib/teksRisikoPendanaan";

/**
 * Peringatan risiko pendanaan: banner hangat di puncak halaman + panel dua
 * belas poin.
 *
 * Kenapa bentuknya begini: pendana harus membaca risikonya SEBELUM melihat
 * angka keuntungan, jadi bannernya duduk tepat di bawah judul dan memakai latar
 * hangat (krem, bukan merah) yang tidak bisa ditutup permanen. Panjangnya
 * diringkas di banner dan diuraikan di panel, sehingga tidak ada dinding teks
 * yang dilewati setiap kali membuka halaman.
 *
 * Warnanya sengaja krem dengan teks navy: kontrasnya di atas 4,5:1 terhadap
 * latar banner (bukan oranye terang yang justru sulit dibaca), dan oranye hanya
 * dipakai pada ikon peringatan sebagai penanda, bukan sebagai warna teks.
 *
 * Teksnya datang dari `@/lib/teksRisikoPendanaan` supaya kalimat yang disetujui
 * pendana (lihat `RISK_TEXT_VERSION`) selalu sama dengan yang tampil di sini.
 * Murni presentasional, tanpa Convex, supaya bisa diuji lewat markup HTML.
 */
export function BannerRisikoPendanaan() {
  return (
    <section
      aria-label="Peringatan risiko pendanaan"
      className="animate-masuk mt-4 rounded-2xl border border-amber-300/70 bg-amber-50 px-4 py-4 sm:px-5 sm:py-4"
    >
      <div className="flex gap-3">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-700" aria-hidden />
        <div className="min-w-0">
          <p className="text-xs leading-6 text-amber-950">{TEKS_BANNER_RISIKO}</p>
          <a
            href={`#${ANCHOR_RISIKO_PENDANAAN}`}
            className="mt-2 inline-block text-xs font-semibold text-amber-900 underline decoration-amber-400 underline-offset-2 hover:text-amber-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700/60 focus-visible:ring-offset-2 focus-visible:ring-offset-amber-50"
          >
            Baca selengkapnya
          </a>
        </div>
      </div>
    </section>
  );
}

/**
 * Panel dua belas poin risiko — accordion tertutup secara bawaan supaya tidak
 * mendorong angka keuntungan jauh ke bawah, tetapi bisa dibuka satu per satu
 * tanpa kehilangan tempat (dua belas judul tetap terlihat sekaligus).
 */
export function PanelRisikoPendanaan({
  bukaAwal = [],
}: {
  /**
   * Nomor poin yang dibuka sejak awal. Dipakai uji markup: isi accordion yang
   * tertutup tidak dirender saat render statis, jadi tanpa pintu ini isi dua
   * belas poin tidak bisa diverifikasi lewat HTML.
   */
  bukaAwal?: readonly number[];
} = {}) {
  return (
    <section
      id={ANCHOR_RISIKO_PENDANAAN}
      aria-label={JUDUL_RISIKO_PENDANAAN}
      className="animate-masuk mt-4 scroll-mt-24 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm sm:px-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight text-navy">
          <TriangleAlert className="size-4 shrink-0 text-amber-700" aria-hidden />
          {JUDUL_RISIKO_PENDANAAN}
        </h2>
        <p className="text-[11px] font-medium text-muted-foreground">
          {POIN_RISIKO_PENDANAAN.length} hal yang perlu Anda tahu sebelum mendanai
        </p>
      </div>

      <Accordion
        type="multiple"
        className="mt-1"
        defaultValue={bukaAwal.map((nomor) => `poin-${nomor}`)}
      >
        {POIN_RISIKO_PENDANAAN.map((poin) => (
          <AccordionItem key={poin.nomor} value={`poin-${poin.nomor}`} className="border-slate-100">
            <AccordionTrigger className="gap-3 py-3 text-sm font-medium text-navy hover:no-underline">
              <span className="flex min-w-0 items-baseline gap-2 text-left">
                <span className="text-[11px] font-semibold tabular-nums text-muted-foreground">
                  {poin.nomor}.
                </span>
                <span className="min-w-0">{poin.judul}</span>
              </span>
            </AccordionTrigger>
            <AccordionContent className="text-xs leading-6 text-slate-700">
              {poin.isi}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}
