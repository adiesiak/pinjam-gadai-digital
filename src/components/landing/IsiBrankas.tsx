/**
 * Seksi "Isi brankas" di landing: contoh catatan tiap skema, ditampilkan sebagai
 * lembar bergaris seperti buku besar.
 *
 * Dipindah dari `pages/Landing.tsx` tanpa perubahan tampilan; berkas halaman
 * hanya menyusun seksinya supaya tidak lagi menampung seluruh JSX landing.
 */
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, BadgeCheck, Banknote, Landmark, Package } from "lucide-react";
import { useState } from "react";

import { Reveal } from "@/components/Reveal";
import { SectionHeading } from "@/components/landing/bagian-landing";
import { EASE_OUT } from "@/lib/motion";

/** Isi brankas: contoh catatan tiap skema, ditampilkan sebagai lembar bergaris
 *  seperti buku besar. Semua baris adalah ilustrasi tampilan, bukan tagihan. */
const ISI_BRANKAS: ReadonlyArray<{
  id: string;
  label: string;
  rak: string;
  Icon: typeof Banknote;
  judul: string;
  isi: string;
  baris: ReadonlyArray<readonly [string, string]>;
}> = [
  {
    id: "harian",
    label: "Pinjaman harian",
    rak: "Laci 01",
    Icon: Banknote,
    judul: "Skema harian (7 sampai 28 hari)",
    isi: "Kewajiban dihitung sekali di akhir tenor: bunga flat 26–40% sesuai nominal dan tenor, potongan 2% di muka.",
    baris: [
      ["Nomor referensi", "PDI-••••-••"],
      ["Pokok perhitungan", "Rp 100 rb – Rp 1 jt"],
      ["Potongan di muka", "2% (biaya admin; platform 0%)"],
      ["Potongan di muka", "Admin 2% + ekspres"],
      ["Bunga flat", "26–40% dari pokok (sesuai nominal & tenor)"],
      ["Total kewajiban pelunasan", "126–140% dari pokok"],
    ],
  },
  {
    id: "bulanan",
    label: "Pinjaman bulanan",
    rak: "Laci 02",
    Icon: Landmark,
    judul: "Skema bulanan (tenor 1 / 3 / 6 / 9 / 12 bulan)",
    isi: "Cicilan rata dari pokok penuh: angsuran berisi pokok dan bunga; biaya tenor dipotong di muka.",
    baris: [
      ["Nomor referensi", "PDI-••••-••"],
      ["Nominal", "Rp 500 rb – Rp 10 jt"],
      ["Potongan di muka", "2% (semua tenor)"],
      ["Bunga flat per bulan", "tarif akun · bawaan 30/8/12/10/8%"],
      ["Biaya admin cicilan", "2% per bayar (setiap pembayaran)"],
      ["Pencatatan pelunasan", "Sekali saat jatuh tempo"],
    ],
  },
  {
    id: "kredit",
    label: "Kredit barang",
    rak: "Laci 03",
    Icon: Package,
    judul: "Kredit barang (elektronik & mitra)",
    isi: "Nominal, tenor, dan cicilan dihitung dari harga barang yang diajukan.",
    baris: [
      ["Nomor referensi", "PDI-••••-••"],
      ["Nilai pembiayaan", "Hingga Rp 10 jt"],
      ["Uang muka", "Wajib 10–50%"],
      ["Potongan di muka", "2% (biaya admin; platform 0%)"],
      ["Tenor", "1 / 3 / 6 bulan"],
      ["Cicilan", "Rata dari pokok setelah DP"],
    ],
  },
];

/** Bagian "isi brankas": pilih satu laci, lalu lihat contoh catatannya. */
export function IsiBrankas() {
  const reduce = useReducedMotion();
  const [aktif, setAktif] = useState(ISI_BRANKAS[0].id);
  const skema = ISI_BRANKAS.find((s) => s.id === aktif) ?? ISI_BRANKAS[0];

  return (
    <section
      id="catatan"
      className="relative scroll-mt-24 overflow-hidden border-t border-slate-200 bg-[#0f3d3a] py-12 sm:py-20"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: "radial-gradient(rgba(216,194,140,0.22) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
          maskImage: "radial-gradient(ellipse 80% 70% at 18% 20%, #000 8%, transparent 72%)",
          WebkitMaskImage: "radial-gradient(ellipse 80% 70% at 18% 20%, #000 8%, transparent 72%)",
        }}
      />
      <div aria-hidden="true" className="animate-drift pointer-events-none absolute -left-28 top-6 size-72 rounded-full bg-[#cbb47e]/15 blur-3xl" />
      <div aria-hidden="true" className="animate-drift-reverse pointer-events-none absolute -bottom-24 -right-16 size-80 rounded-full bg-white/[0.07] blur-3xl" />

      <div className="relative mx-auto w-full max-w-6xl px-4 sm:px-6">
        <Reveal>
          <SectionHeading
            folio="02"
            eyebrow="Isi brankas"
            gelap
            title="Catatan yang bisa Anda periksa"
            description="Setiap pengajuan menyimpan nominal, tenor, biaya, dan statusnya. Pilih satu laci untuk melihat contoh catatannya."
          />
        </Reveal>

        <div className="mt-8 grid gap-6 sm:mt-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-10">
          <Reveal className="h-full">
            <div className="flex h-full flex-col gap-2 rounded-2xl border border-white/10 bg-white/[0.05] p-2.5 backdrop-blur-sm">
              {ISI_BRANKAS.map(({ id, label, rak, Icon }) => {
                const dipilih = id === aktif;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setAktif(id)}
                    aria-pressed={dipilih}
                    className={`group flex items-center gap-3.5 rounded-xl border px-3.5 py-3 text-left transition-colors ${
                      dipilih
                        ? "border-[#d8c28c]/45 bg-[#d8c28c]/10 text-white"
                        : "border-white/10 bg-black/10 text-white/70 hover:border-white/20 hover:bg-white/[0.07] hover:text-white"
                    }`}
                  >
                    <span
                      className={`flex size-9 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                        dipilih
                          ? "border-[#d8c28c]/45 bg-[#d8c28c]/15 text-[#e6d3a5]"
                          : "border-white/10 text-white/55 group-hover:text-white/85"
                      }`}
                    >
                      <Icon className="size-4" strokeWidth={2} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">
                        {rak}
                      </span>
                      <span className="mt-0.5 block truncate text-sm font-semibold">{label}</span>
                    </span>
                    <ArrowRight
                      aria-hidden="true"
                      className={`size-4 shrink-0 transition-transform ${
                        dipilih ? "text-[#e6d3a5]" : "text-white/30 group-hover:translate-x-0.5"
                      }`}
                    />
                  </button>
                );
              })}
              <p className="mt-auto px-3.5 pb-1 pt-3 text-xs leading-5 text-white/45">
                Contoh ilustrasi tampilan. Angka sebenarnya dihitung aplikasi dari data pengajuan Anda
                dan bukan tagihan atau bukti pembayaran.
              </p>
            </div>
          </Reveal>

          <Reveal delay={0.1} className="h-full">
            <div className="relative">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={skema.id}
                  initial={reduce ? { opacity: 0 } : { opacity: 0, y: 14 }}
                  animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
                  exit={reduce ? { opacity: 0 } : { opacity: 0, y: -10 }}
                  transition={{ duration: 0.28, ease: EASE_OUT }}
                  className="relative overflow-hidden rounded-2xl bg-[#fbf8f1] shadow-[0_28px_60px_-38px_rgba(0,0,0,0.75)]"
                >
                  <div aria-hidden="true" className="absolute inset-y-0 left-9 w-px bg-[#b99b62]/35" />
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0"
                    style={{
                      backgroundImage:
                        "repeating-linear-gradient(to bottom, rgba(15,61,58,0.055) 0px, rgba(15,61,58,0.055) 1px, transparent 1px, transparent 30px)",
                      maskImage: "linear-gradient(to bottom, #000 0%, #000 55%, transparent 92%)",
                      WebkitMaskImage: "linear-gradient(to bottom, #000 0%, #000 55%, transparent 92%)",
                    }}
                  />
                  <div className="relative">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e4dccb] py-3.5 pl-12 pr-4 sm:pl-14 sm:pr-6">
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#9c7b3a]">
                          Contoh catatan · {skema.rak}
                        </p>
                        <p className="mt-1 text-sm font-semibold text-[#0f3d3a]">{skema.judul}</p>
                      </div>
                    </div>
                    <p className="border-b border-[#e4dccb] py-3 pl-12 pr-4 text-xs leading-5 text-[#5f6f6a] sm:pl-14 sm:pr-6">
                      {skema.isi}
                    </p>
                    <dl>
                      {skema.baris.map(([label, nilai]) => (
                        <div
                          key={label}
                          className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3 border-b border-[#eee7d6] py-3 pl-12 pr-4 last:border-b-0 sm:pl-14 sm:pr-6"
                        >
                          <dt className="text-xs text-[#5f6f6a]">{label}</dt>
                          <dd className="text-right text-xs font-semibold tabular-nums text-[#0f3d3a]">
                            {nilai}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                </motion.div>
              </AnimatePresence>
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -bottom-4 -right-2 rotate-[-8deg] rounded-lg border-2 border-[#0f3d3a]/25 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.22em] text-[#0f3d3a]/45 sm:-right-4"
              >
                Dicatat
              </div>
            </div>
          </Reveal>
        </div>

        <motion.ul
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.3 }}
          variants={{
            hidden: {},
            show: { transition: { staggerChildren: 0.08, delayChildren: 0.06 } },
          }}
          className="mt-8 grid gap-3 sm:grid-cols-3"
        >
          {[
            "Parameter perhitungan berasal dari data pengajuan yang tersimpan",
            "Riwayat pengajuan hanya dapat dibuka oleh akun terkait",
            "Perubahan status oleh tim PINDAI tercatat pada audit log",
          ].map((item) => (
            <motion.li
              key={item}
              variants={{
                hidden: reduce ? { opacity: 0 } : { opacity: 0, y: 14 },
                show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE_OUT } },
              }}
              className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3.5 text-xs leading-5 text-white/70"
            >
              <BadgeCheck className="mt-0.5 size-4 shrink-0 text-[#e6d3a5]" aria-hidden="true" />
              {item}
            </motion.li>
          ))}
        </motion.ul>
      </div>
    </section>
  );
}
