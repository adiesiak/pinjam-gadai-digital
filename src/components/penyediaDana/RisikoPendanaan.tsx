import { TriangleAlert } from "lucide-react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { BagianLipat } from "@/components/penyediaDana/bagian-folio";
import { bagiKolom } from "@/components/penyediaDana/folio";
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
      className="animate-masuk mt-4 rounded-lg border border-amber-300/70 bg-amber-50 px-4 py-4 sm:px-5 sm:py-4"
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
 * Panel dua belas poin risiko.
 *
 * Bentuknya dua lipatan yang bertingkat, dan itu disengaja. Bagiannya sendiri
 * tertutup secara bawaan (hanya kepala satu baris yang tampak), karena dua belas
 * judul poin yang selalu terbuka menghabiskan setengah layar sebelum pembaca
 * melihat angka keuntungan sama sekali. Di dalamnya, tiap poin tetap accordion:
 * yang ditampilkan sekaligus hanya judulnya, dan isinya dibuka satu per satu.
 *
 * Judulnya dipasang tiga kolom di layar lebar, jadi ke-12 poin terbaca dalam
 * empat baris tanpa memutus urutan 1 sampai 12.
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
    <BagianLipat
      id={ANCHOR_RISIKO_PENDANAAN}
      nomor={3}
      judul={JUDUL_RISIKO_PENDANAAN}
      ringkas={`${POIN_RISIKO_PENDANAAN.length} hal yang perlu Anda tahu sebelum mendanai`}
      bukaAwal={bukaAwal.length > 0}
      className="mt-4"
    >
      <div className="mt-1 grid items-start gap-x-6 sm:grid-cols-2 lg:grid-cols-3">
        {bagiKolom(POIN_RISIKO_PENDANAAN, 3).map((bagian) => (
          <Accordion
            key={bagian[0]?.nomor ?? 0}
            type="multiple"
            /* Hanya poin di kolom ini yang dibuka, supaya `bukaAwal` tetap
               membuka poin yang benar. */
            defaultValue={bagian
              .filter((poin) => bukaAwal.includes(poin.nomor))
              .map((poin) => `poin-${poin.nomor}`)}
          >
            {bagian.map((poin) => (
              <AccordionItem
                key={poin.nomor}
                value={`poin-${poin.nomor}`}
                className="border-slate-100"
              >
                {/* min-h-11 menjaga sasaran sentuh 44px walau py-2 dikecilkan. */}
                <AccordionTrigger className="min-h-11 items-center gap-3 py-2 text-sm font-medium text-navy hover:no-underline">
                  <span className="flex min-w-0 items-baseline gap-2 text-left">
                    <span className="text-xs font-semibold tabular-nums text-muted-foreground">
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
        ))}
      </div>
    </BagianLipat>
  );
}
