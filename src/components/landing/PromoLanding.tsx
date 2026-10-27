/**
 * Seksi promo di landing: tiga contoh poster kampanye yang diambil dari data
 * `lib/promoPosters` — jadi tampilannya tidak pernah menyimpang dari isi halaman
 * /promo.
 *
 * Dipindah dari `pages/Landing.tsx` tanpa perubahan tampilan maupun perilaku.
 */
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, BadgeCheck, Download, Shapes } from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router";

import { Reveal } from "@/components/Reveal";
import { SectionHeading } from "@/components/landing/bagian-landing";
import { Button } from "@/components/ui/button";
import { EASE_OUT } from "@/lib/motion";
import { promoPostersAktif } from "@/lib/promoPosters";

/** Tiga poster pertama dari data kampanye — diringkas dari `lib/promoPosters`. */
const JUMLAH_POSTER_LANDING = 3;

/** Rotasi awal tiap poster di tumpukan (derajat) dan geser vertikalnya (px). */
const GAYA_TUMPUKAN_POSTER = [
  { rotate: -4, geser: 7 },
  { rotate: 1.5, geser: -5 },
  { rotate: 4.5, geser: 5 },
] as const;

/** Warna pita lencana per aksen poster — identitas navy/kuningan tetap. */
const PITA_LENCANA: Record<string, string> = {
  emas: "border-[#d8c28c]/45 text-[#e6d3a5]",
  jingga: "border-[#e0a05a]/45 text-[#f0c48a]",
  toska: "border-[#7fc0b4]/45 text-[#a8dcd2]",
};

/** Tiga poin tetap seksi promo — semuanya bisa diperiksa di halaman /promo. */
const PROMO_POIN: Array<{ judul: string; isi: string; Icon: typeof Download }> = [
  {
    judul: "PNG 1080 × 1350",
    isi: "Rasio 4:5, siap diunggah ke Instagram, WhatsApp, dan Facebook.",
    Icon: Download,
  },
  {
    judul: "Identitas PINDAI",
    isi: "Navy, kuningan, dan krem yang sama di seluruh materi.",
    Icon: Shapes,
  },
  {
    judul: "Tanpa klaim berlebihan",
    isi: "Tidak memuat janji persetujuan maupun keamanan absolut.",
    Icon: BadgeCheck,
  },
];

/**
 * Tumpukan poster menegak saat tampil lalu merapat dan menegak-kan diri saat
 * disorot, dan setiap kartu mengarahkan pengunjung ke /promo.
 *
 * Rute /promo ada di balik `RequireAuth`, sehingga pengunjung yang belum masuk
 * diminta masuk dulu dengan `returnTo=/promo`. CTA-nya mengatakan itu jujur
 * alih-alih menampilkan tautan yang tampak mati.
 */
export function PromoSection({ sudahMasuk }: { sudahMasuk: boolean }) {
  const reduce = useReducedMotion();
  const semuaPoster = useMemo(() => promoPostersAktif(), []);
  const poster = semuaPoster.slice(0, JUMLAH_POSTER_LANDING);

  return (
    <section
      id="promo"
      className="relative scroll-mt-24 overflow-hidden border-t border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f7f4ec_100%)]"
    >
      <div
        aria-hidden="true"
        className="animate-spin-slow pointer-events-none absolute -left-28 top-6 size-72 rounded-full border border-dashed border-[#b99b62]/25"
      />
      <div
        aria-hidden="true"
        className="animate-drift pointer-events-none absolute -right-24 bottom-0 size-80 rounded-full bg-[#cbb47e]/15 blur-3xl"
      />

      <div className="relative mx-auto grid w-full max-w-6xl gap-8 px-4 py-12 sm:px-6 sm:py-20 lg:grid-cols-[0.92fr_1.08fr] lg:items-center lg:gap-14">
        <div className="min-w-0">
          <Reveal>
            <SectionHeading
              folio="08"
              eyebrow="Materi kampanye"
              title="Poster promo siap dibagikan"
              description={`${semuaPoster.length} poster berukuran 1080 × 1350 px untuk Instagram, WhatsApp, dan Facebook.`}
            />
          </Reveal>

          <motion.ul
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.3 }}
            variants={{
              hidden: {},
              show: { transition: { staggerChildren: 0.08, delayChildren: 0.06 } },
            }}
            className="mt-7 space-y-3"
          >
            {PROMO_POIN.map(({ judul, isi, Icon }) => (
              <motion.li
                key={judul}
                variants={{
                  hidden: reduce ? { opacity: 0 } : { opacity: 0, x: -12 },
                  show: { opacity: 1, x: 0, transition: { duration: 0.45, ease: EASE_OUT } },
                }}
                className="flex items-start gap-3"
              >
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-[#b99b62]/30 bg-white text-[#9c7b3a]">
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-slate-900">{judul}</span>
                  <span className="mt-0.5 block text-xs leading-5 text-slate-600">{isi}</span>
                </span>
              </motion.li>
            ))}
          </motion.ul>

          <Reveal delay={0.12}>
            <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-2">
              <Button
                asChild
                className="animate-sheen group h-11 rounded-full bg-primary px-6 text-white transition-transform hover:-translate-y-0.5 hover:bg-primary/90"
              >
                <Link to="/promo">
                  {sudahMasuk ? "Buka pusat materi promo" : "Masuk untuk membuka poster"}
                  <ArrowRight className="ml-2 size-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </Button>
              <span className="text-xs leading-5 text-slate-500">
                Halaman promo perlu akun PINDAI; Anda akan diminta masuk lebih dulu.
              </span>
            </div>
          </Reveal>
        </div>

        <Reveal delay={0.08} className="min-w-0">
          <motion.div
            animate={reduce ? undefined : { y: [0, -7, 0] }}
            transition={{ duration: 7.5, repeat: Infinity, ease: "easeInOut" }}
          >
            <motion.div
              initial="hidden"
              whileInView="show"
              whileHover={reduce ? undefined : "hover"}
              viewport={{ once: true, amount: 0.25 }}
              variants={{
                hidden: {},
                show: { transition: { staggerChildren: 0.12, delayChildren: 0.1 } },
              }}
              className="grid grid-cols-3 items-end gap-2.5 sm:gap-3.5"
            >
              {poster.map((p, i) => {
                const gaya = GAYA_TUMPUKAN_POSTER[i % GAYA_TUMPUKAN_POSTER.length];
                return (
                  <motion.div
                    key={p.id}
                    variants={{
                      hidden: reduce ? { opacity: 0 } : { opacity: 0, y: 30, rotate: 0 },
                      show: {
                        opacity: 1,
                        y: reduce ? 0 : gaya.geser,
                        rotate: reduce ? 0 : gaya.rotate,
                        transition: { duration: 0.65, ease: EASE_OUT },
                      },
                      hover: {
                        rotate: 0,
                        y: reduce ? 0 : gaya.geser - 12,
                        transition: { duration: 0.4, ease: EASE_OUT },
                      },
                    }}
                    className="min-w-0 origin-bottom"
                  >
                    <Link
                      to="/promo"
                      aria-label={`Buka poster ${p.title} di pusat materi promo`}
                      className="group flex h-full flex-col gap-3 rounded-xl border border-[#d8c28c]/35 bg-[#0f3d3a] p-3 shadow-[0_26px_50px_-34px_rgba(15,61,58,0.9)] transition-shadow duration-300 hover:shadow-[0_34px_60px_-30px_rgba(15,61,58,0.95)] sm:p-4"
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[10px] font-semibold tracking-[0.18em] text-white/45">
                          {p.nomor}
                        </span>
                        <span className="text-[9px] font-semibold uppercase tracking-[0.2em] text-[#e6d3a5]">
                          PINDAI
                        </span>
                      </span>
                      <span
                        className={`hidden w-fit rounded-full border px-2 py-0.5 text-[8px] font-semibold uppercase leading-3 tracking-[0.12em] sm:inline-flex ${
                          PITA_LENCANA[p.aksen] ?? PITA_LENCANA.emas
                        }`}
                      >
                        {p.badge}
                      </span>
                      <span className="whitespace-pre-line text-sm font-semibold leading-5 text-white">
                        {p.headline}
                      </span>
                      <span className="hidden text-[10px] leading-4 text-white/55 sm:block">
                        {p.description}
                      </span>
                      <span className="mt-auto hidden border-t border-white/10 pt-2 text-[8px] font-semibold uppercase tracking-[0.16em] text-[#d8c28c]/70 sm:block">
                        Pinjam · Gadai Digital
                      </span>
                    </Link>
                  </motion.div>
                );
              })}
            </motion.div>
            <p className="mt-4 text-center text-[11px] leading-5 text-slate-500">
              Contoh {poster.length} dari {semuaPoster.length} poster · 1080 × 1350 px
            </p>
          </motion.div>
        </Reveal>
      </div>
    </section>
  );
}
