import { motion } from "framer-motion";
import { ArrowRight, LineChart, ShieldCheck, Timer } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { PINDAI_PRICING, quoteLoan, type LoanQuote } from "@/lib/loan";
import { formatRupiah, parseRupiah, type Rupiah } from "@/lib/money";

function Kicker({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
      {children}
    </p>
  );
}

export default function Landing() {
  const [amountInput, setAmountInput] = useState("10.000.000");

  const parsed = useMemo<{ ok: true; pokok: Rupiah } | { ok: false }>(() => {
    try {
      return { ok: true, pokok: parseRupiah(amountInput) };
    } catch {
      return { ok: false };
    }
  }, [amountInput]);

  const quote = parsed.ok ? quoteLoan(parsed.pokok) : null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="flex min-h-screen flex-col bg-background text-foreground"
    >
      {/* Nav */}
      <header className="border-b border-border/60">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-6">
          <span className="text-sm font-semibold tracking-[0.18em]">PINDAI</span>
          <nav className="flex items-center gap-6 text-sm text-muted-foreground">
            <a href="#cara" className="hidden hover:text-foreground sm:block">
              Cara Kerja
            </a>
            <a href="#biaya" className="hidden hover:text-foreground sm:block">
              Biaya
            </a>
            <Button asChild variant="outline" size="sm" className="rounded-full">
              <Link to="/auth">Masuk</Link>
            </Button>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1">
        <section className="mx-auto w-full max-w-5xl px-6 pb-20 pt-24 sm:pt-32">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.05 }}
            className="max-w-2xl"
          >
            <Kicker>Pinjam &amp; Gadai Digital</Kicker>
            <h1 className="mt-4 text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl">
              Ajukan pinjaman.
              <br />
              Tahu semua angkanya,
              <span className="text-muted-foreground"> di muka.</span>
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-muted-foreground">
              PINDAI melayani Peminjam dengan struktur biaya yang tetap:
              potongan di muka 5%, bunga 30%, dan total kewajiban 130% dari
              pokok. Tidak ada biaya tersembunyi, tidak ada angka yang berubah
              di tengah jalan.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button asChild size="lg" className="rounded-full px-6">
                <Link to="/auth">
                  Ajukan Pinjaman
                  <ArrowRight className="ml-1 size-4" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="ghost"
                className="rounded-full px-4 text-muted-foreground"
              >
                <a href="#biaya">Lihat rincian biaya</a>
              </Button>
            </div>
          </motion.div>

          <div className="mt-16 grid gap-px overflow-hidden rounded-lg border border-border/60 bg-border/60 sm:grid-cols-3">
            {[
              {
                icon: LineChart,
                title: "Angka pasti",
                body: "Perhitungan rupiah bulat tanpa pembulatan mengambang — presisi sampai satu rupiah.",
              },
              {
                icon: ShieldCheck,
                title: "Transparan",
                body: "Potongan di muka 5% dijelaskan di layar sebelum Anda mengirim aplikasi.",
              },
              {
                icon: Timer,
                title: "Antrean jelas",
                body: "Setiap aplikasi mendapat nomor referensi dan status yang bisa Anda pantau.",
              },
            ].map(({ icon: Icon, title, body }) => (
              <div key={title} className="bg-background p-6">
                <Icon className="size-4 text-muted-foreground" />
                <h3 className="mt-4 text-sm font-medium">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section id="cara" className="border-y border-border/60 bg-muted/40">
          <div className="mx-auto w-full max-w-5xl px-6 py-20">
            <Kicker>Cara kerja</Kicker>
            <div className="mt-8 grid gap-10 sm:grid-cols-3">
              {[
                [
                  "01",
                  "Isi aplikasi",
                  "Pokok pinjaman, keperluan, nama sesuai KTP, dan rekening tujuan.",
                ],
                [
                  "02",
                  "Review PINDAI",
                  "Aplikasi Anda masuk antrean review dengan nomor referensi.",
                ],
                [
                  "03",
                  "Keputusan",
                  "Disetujui — dana bersih 95% masuk rekening; total kewajiban 130%.",
                ],
              ].map(([num, title, body]) => (
                <div key={num}>
                  <span className="text-xs font-medium tracking-widest text-muted-foreground">
                    {num}
                  </span>
                  <h3 className="mt-3 text-lg font-medium">{title}</h3>
                  <Separator className="my-4 w-8" />
                  <p className="text-sm leading-6 text-muted-foreground">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Transparent pricing + live calculator */}
        <section id="biaya" className="mx-auto w-full max-w-5xl px-6 py-20">
          <div className="grid gap-12 lg:grid-cols-2">
            <div>
              <Kicker>Struktur biaya tetap</Kicker>
              <h2 className="mt-4 text-2xl font-semibold tracking-tight">
                Persentase dari pokok, selalu.
              </h2>
              <dl className="mt-8 divide-y divide-border/60 border-y border-border/60">
                {[
                  ["Biaya Admin", `${PINDAI_PRICING.adminFeePercent}% dari pokok`],
                  [
                    "Biaya Layanan Platform",
                    `${PINDAI_PRICING.platformFeePercent}% dari pokok`,
                  ],
                  ["Total Potongan di Muka", `${PINDAI_PRICING.upfrontDeductionPercent}%`],
                  [
                    "Dana Bersih Ditransfer",
                    `${PINDAI_PRICING.netDisbursementPercent}%`,
                  ],
                  ["Bunga (Imbal Hasil Pendana)", `${PINDAI_PRICING.bungaPercent}%`],
                  [
                    "Total Kewajiban Pelunasan",
                    `${PINDAI_PRICING.totalRepaymentPercent}%`,
                  ],
                ].map(([term, value]) => (
                  <div key={term} className="flex items-baseline justify-between py-3.5">
                    <dt className="text-sm text-muted-foreground">{term}</dt>
                    <dd className="text-sm font-medium tabular-nums">{value}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-6 text-xs leading-5 text-muted-foreground">
                Imbal Hasil adalah hak finansial Pendana — pihak yang menyediakan
                dana dalam skema Alokasi Dana PINDAI.
              </p>
            </div>

            {/* Live quote */}
            <div className="rounded-lg border border-border/60 p-6 sm:p-8">
              <Kicker>Kalkulator</Kicker>
              <label htmlFor="sim-pokok" className="mt-4 block text-sm font-medium">
                Pokok pinjaman
              </label>
              <div className="relative mt-2">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  Rp
                </span>
                <Input
                  id="sim-pokok"
                  inputMode="numeric"
                  className="pl-9 tabular-nums"
                  value={amountInput}
                  onChange={(e) => setAmountInput(e.target.value)}
                  onBlur={() => {
                    try {
                      setAmountInput(
                        formatRupiah(parseRupiah(amountInput)).replace("Rp ", ""),
                      );
                    } catch {
                      /* keep raw input; the quote panel explains the range */
                    }
                  }}
                />
              </div>

              {quote ? (
                <QuoteRows q={quote} />
              ) : (
                <p className="mt-6 text-sm text-muted-foreground">
                  Masukkan jumlah antara Rp 100.000 dan Rp 500.000.000.
                </p>
              )}
              <Button asChild className="mt-8 w-full rounded-full">
                <Link to="/auth">
                  Lanjut mengajukan
                  <ArrowRight className="ml-1 size-4" />
                </Link>
              </Button>
            </div>
          </div>
        </section>

        {/* Closing CTA */}
        <section className="border-t border-border/60">
          <div className="mx-auto flex w-full max-w-5xl flex-col items-start gap-6 px-6 py-16 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">Siap mengajukan?</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Versi 1 PINDAI melayani Peminjam. Satu alur, dari aplikasi
                sampai keputusan.
              </p>
            </div>
            <Button asChild size="lg" className="rounded-full px-6">
              <Link to="/auth">
                Mulai sekarang
                <ArrowRight className="ml-1 size-4" />
              </Link>
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/60">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-2 px-6 py-8 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span className="font-semibold tracking-[0.18em] text-foreground">
            PINDAI
          </span>
          <span>Pinjam &amp; Gadai Digital — versi 1: pengajuan pinjaman Peminjam.</span>
        </div>
      </footer>
    </motion.div>
  );
}

function QuoteRows({ q }: { q: LoanQuote }) {
  const rows: Array<[string, string, boolean?]> = [
    ["Biaya Admin (3%)", formatRupiah(q.biayaAdmin)],
    ["Biaya Platform (2%)", formatRupiah(q.biayaPlatform)],
    ["Dana bersih diterima", formatRupiah(q.danaBersihDitransfer), true],
    ["Bunga (30%)", formatRupiah(q.bunga)],
    ["Total kewajiban pelunasan", formatRupiah(q.totalKewajibanPelunasan), true],
  ];
  return (
    <dl className="mt-6 divide-y divide-border/60 border-t border-border/60">
      {rows.map(([term, value, strong]) => (
        <div key={term} className="flex items-baseline justify-between py-3">
          <dt className={`text-sm ${strong ? "font-medium" : "text-muted-foreground"}`}>
            {term}
          </dt>
          <dd className={`text-sm tabular-nums ${strong ? "font-semibold" : ""}`}>
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
