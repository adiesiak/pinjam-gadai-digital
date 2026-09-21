import { motion } from "framer-motion";
import {
  ArrowRight,
  BadgeCheck,
  Banknote,
  MapPin,
  Package,
  ShieldCheck,
  Users,
} from "lucide-react";
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
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-6">
          <span className="flex items-center gap-2.5">
            <span className="gradient-primary flex size-8 items-center justify-center rounded-lg font-bold text-primary-foreground shadow-glow">
              P
            </span>
            <span className="text-sm font-semibold tracking-[0.18em]">
              PINJAM GADAI DIGITAL
            </span>
          </span>
          <nav className="flex items-center gap-6 text-sm text-muted-foreground">
            <a href="#layanan" className="hidden hover:text-foreground sm:block">
              Layanan
            </a>
            <a href="#biaya" className="hidden hover:text-foreground sm:block">
              Biaya
            </a>
            <a href="#kepatuhan" className="hidden hover:text-foreground sm:block">
              Kepatuhan
            </a>
            <Button asChild variant="outline" size="sm" className="rounded-full">
              <Link to="/auth">Masuk / Daftar</Link>
            </Button>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="dot-texture relative mx-auto w-full max-w-5xl px-6 pb-20 pt-20 sm:pt-28">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.05 }}
            className="max-w-2xl"
          >
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3.5 py-1.5 text-xs font-medium text-accent-foreground">
              <span className="size-1.5 rounded-full bg-primary" />
              Sertifikasi wajib · Live location terverifikasi
            </span>
            <h1 className="mt-5 text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl">
              Pinjam tunai. Gadaikan barang.
              <br />
              <span className="text-gradient-primary">
                Semua angkanya jelas di muka.
              </span>
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-muted-foreground">
              Pinjam Gadai Digital menghubungkan nasabah dengan Pendana
              terverifikasi. Sebagai wadah resmi, kami memungut biaya admin 3%
              dan biaya platform 2% dari pokok — dua komponen biaya itu pula
              seluruh pendapatan kami. Tidak ada biaya tersembunyi.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button
                asChild
                size="lg"
                className="gradient-primary shadow-glow rounded-full border-0 px-7 font-medium transition-transform hover:-translate-y-0.5"
              >
                <Link to="/auth">
                  Buat akun nasabah
                  <ArrowRight className="ml-1 size-4" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="rounded-full px-5 border-primary/30 text-accent-foreground hover:bg-primary/5"
              >
                <a href="#biaya">Hitung biaya Anda</a>
              </Button>
            </div>
          </motion.div>

          <div className="mt-16 grid gap-px overflow-hidden rounded-xl border border-border/60 bg-border/60 sm:grid-cols-3">
            {[
              {
                icon: BadgeCheck,
                tint: "bg-primary/10 text-accent-foreground",
                title: "Sertifikasi wajib",
                body: "Platform beroperasi dengan sertifikasi dan prosedur operasional baku yang diwajibkan sebelum layanan disalurkan.",
              },
              {
                icon: MapPin,
                tint: "bg-gold/15 text-gold-foreground",
                title: "Live location wajib",
                body: "Pemeriksaan barang gadai dilakukan di lokasi Anda dengan pencatatan lokasi langsung yang terekam sebagai bukti kunjungan.",
              },
              {
                icon: ShieldCheck,
                tint: "bg-primary/10 text-accent-foreground",
                title: "Angka pasti",
                body: "Seluruh perhitungan rupiah bulat tanpa pembulatan mengambang — presisi sampai satu rupiah.",
              },
            ].map(({ icon: Icon, tint, title, body }) => (
              <div key={title} className="card-lift bg-background p-6">
                <span className={`inline-flex size-9 items-center justify-center rounded-lg ${tint}`}>
                  <Icon className="size-4" />
                </span>
                <h3 className="mt-4 text-sm font-medium">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Two services */}
        <section id="layanan" className="border-y border-border/60 bg-muted/40">
          <div className="mx-auto w-full max-w-5xl px-6 py-20">
            <Kicker>Dua layanan, satu akun</Kicker>
            <h2 className="mt-4 max-w-xl text-2xl font-semibold tracking-tight">
              Pilih jalur yang sesuai kebutuhan Anda.
            </h2>
            <div className="mt-10 grid gap-px overflow-hidden rounded-xl border border-border/60 bg-border/60 lg:grid-cols-2">
              <div className="card-lift bg-background p-8">
                <span className="gradient-primary shadow-glow inline-flex size-10 items-center justify-center rounded-xl text-primary-foreground">
                  <Banknote className="size-5" />
                </span>
                <h3 className="mt-5 text-lg font-medium">Pinjaman tunai</h3>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  Ajukan pinjaman tunai dengan struktur biaya tetap. Setelah
                  disetujui tim kami, dana bersih 95% dari pokok ditransfer ke
                  rekening Anda.
                </p>
                <dl className="mt-6 space-y-2 border-t border-border/60 pt-5 text-sm">
                  {[
                    ["Potongan di muka (admin + platform)", "5% dari pokok"],
                    ["Bunga", "30% dari pokok"],
                    ["Total kewajiban pelunasan", "130% dari pokok"],
                  ].map(([term, value]) => (
                    <div key={term} className="flex items-baseline justify-between gap-4">
                      <dt className="text-muted-foreground">{term}</dt>
                      <dd className="font-medium tabular-nums">{value}</dd>
                    </div>
                  ))}
                </dl>
                <Button asChild variant="outline" className="mt-8 rounded-full">
                  <Link to="/auth">
                    Ajukan pinjaman
                    <ArrowRight className="ml-1 size-4" />
                  </Link>
                </Button>
              </div>

              <div className="card-lift bg-background p-8">
                <span className="gradient-gold shadow-glow-gold inline-flex size-10 items-center justify-center rounded-xl text-gold-foreground">
                  <Package className="size-5" />
                </span>
                <h3 className="mt-5 text-lg font-medium">Gadai barang</h3>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  Gadaikan elektronik, kendaraan, perhiasan, atau properti.
                  Petugas berwenang melakukan pemeriksaan di lokasi Anda dan
                  menetapkan nilai taksiran secara resmi.
                </p>
                <dl className="mt-6 space-y-2 border-t border-border/60 pt-5 text-sm">
                  {[
                    ["Penilaian", "Oleh petugas berwenang, bukan perkiraan sendiri"],
                    ["Kunjungan", "Di lokasi barang, live location wajib"],
                    ["Penyimpanan", "Aman hingga pelunasan"],
                  ].map(([term, value]) => (
                    <div key={term} className="flex items-baseline justify-between gap-4">
                      <dt className="shrink-0 text-muted-foreground">{term}</dt>
                      <dd className="text-right font-medium">{value}</dd>
                    </div>
                  ))}
                </dl>
                <Button asChild variant="outline" className="mt-8 rounded-full">
                  <Link to="/auth">
                    Gadaikan barang
                    <ArrowRight className="ml-1 size-4" />
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* Pricing + calculator */}
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
                  ["Biaya Layanan Platform", `${PINDAI_PRICING.platformFeePercent}% dari pokok`],
                  ["Total Potongan di Muka", `${PINDAI_PRICING.upfrontDeductionPercent}%`],
                  ["Dana Bersih Ditransfer", `${PINDAI_PRICING.netDisbursementPercent}%`],
                  ["Bunga (Imbal Hasil Pendana)", `${PINDAI_PRICING.bungaPercent}%`],
                  ["Total Kewajiban Pelunasan", `${PINDAI_PRICING.totalRepaymentPercent}%`],
                ].map(([term, value]) => (
                  <div key={term} className="flex items-baseline justify-between py-3.5">
                    <dt className="text-sm text-muted-foreground">{term}</dt>
                    <dd className="text-sm font-medium tabular-nums">{value}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-6 text-xs leading-5 text-muted-foreground">
                Imbal Hasil adalah hak finansial Pendana — pihak yang menyediakan
                dana melalui skema pendanaan kami. Sebagai wadah, pendapatan
                Pinjam Gadai Digital hanya berasal dari biaya admin dan biaya
                platform.
              </p>
            </div>

            <div className="card-lift relative overflow-hidden rounded-xl border border-primary/25 bg-background p-6 sm:p-8">
              <div className="gradient-primary absolute inset-x-0 top-0 h-1.5" />
              <Kicker>Kalkulator pinjaman</Kicker>
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
                      /* biarkan input mentah; panel menjelaskan rentang */
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

        {/* Pendana model */}
        <section className="border-y border-border/60 bg-muted/40">
          <div className="mx-auto grid w-full max-w-5xl gap-10 px-6 py-16 lg:grid-cols-3">
            <div>
              <Kicker>Di balik layar</Kicker>
              <h2 className="mt-4 text-2xl font-semibold tracking-tight">
                Dana dari Pendana terverifikasi.
              </h2>
            </div>
            <div className="lg:col-span-2">
              <div className="flex gap-4">
                <Users className="mt-1 size-5 shrink-0 text-muted-foreground" />
                <p className="text-sm leading-7 text-muted-foreground">
                  Setiap pinjaman yang disetujui didanai oleh Pendana — pihak
                  yang telah melalui verifikasi dan menyediakan dana melalui
                  skema alokasi dana kami. Pendana menerima imbal hasil sebesar
                  30% dari pokok sebagai hak finansialnya, sedangkan seluruh
                  proses verifikasi, penilaian gadai, pencairan, dan penagihan
                  dikelola oleh tim Pinjam Gadai Digital. Bagi nasabah, tidak
                  ada perubahan apa pun: satu kontrak, satu jadwal pelunasan,
                  satu total kewajiban 130% dari pokok.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Compliance */}
        <section id="kepatuhan" className="mx-auto w-full max-w-5xl px-6 py-20">
          <Kicker>Keamanan &amp; kepatuhan</Kicker>
          <h2 className="mt-4 max-w-xl text-2xl font-semibold tracking-tight">
            Layanan yang dijalankan sesuai ketentuan.
          </h2>
          <div className="mt-10 grid gap-10 sm:grid-cols-3">
            {[
              {
                icon: BadgeCheck,
                num: "01",
                title: "Sertifikasi mandatory",
                body: "Platform ini dikelola dengan sertifikasi dan prosedur operasional yang diwajibkan — dari verifikasi identitas nasabah (KYC) hingga pencatatan transaksi yang dapat diaudit.",
              },
              {
                icon: MapPin,
                num: "02",
                title: "Live location wajib saat pemeriksaan",
                body: "Setiap pemeriksaan barang gadai dilakukan oleh petugas berwenang di lokasi Anda dengan pencatatan lokasi langsung. Lokasi kunjungan terekam sebagai bagian wajib dari bukti penilaian.",
              },
              {
                icon: ShieldCheck,
                num: "03",
                title: "Jejak audit menyeluruh",
                body: "Setiap keputusan — review, taksiran, persetujuan, dan penolakan — dicatat beserta alasannya dan hanya dapat dilakukan oleh tim berwenang.",
              },
            ].map(({ icon: Icon, num, title, body }) => (
              <div key={num}>
                <div className="flex items-center justify-between">
                  <Icon className="size-4 text-muted-foreground" />
                  <span className="text-xs font-medium tracking-widest text-muted-foreground">
                    {num}
                  </span>
                </div>
                <h3 className="mt-4 text-base font-medium">{title}</h3>
                <Separator className="my-4 w-8" />
                <p className="text-sm leading-6 text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Closing CTA */}
        <section className="border-t border-border/60">
          <div className="mx-auto w-full max-w-5xl px-6 py-16">
            <div className="gradient-primary shadow-glow relative overflow-hidden rounded-2xl px-8 py-12 text-center">
              <div className="dot-texture absolute inset-0 opacity-40" />
              <div className="relative">
                <h2 className="text-2xl font-semibold tracking-tight text-primary-foreground">
                  Siap memulai?
                </h2>
                <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-primary-foreground/85">
                  Buat akun nasabah untuk mengajukan pinjaman tunai atau
                  gadaikan barang Anda — keduanya dapat dikelola dari satu
                  ruang nasabah.
                </p>
                <Button
                  asChild
                  size="lg"
                  className="mt-8 rounded-full border-0 bg-white px-7 font-medium text-accent-foreground hover:bg-white/90"
                >
                  <Link to="/auth">
                    Daftar sekarang
                    <ArrowRight className="ml-1 size-4" />
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/60">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-2 px-6 py-8 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span className="font-semibold tracking-[0.18em] text-foreground">
            PINJAM GADAI DIGITAL
          </span>
          <span>
            Wadah pinjaman dan penggadaian barang bagi nasabah, didanai oleh
            Pendana terverifikasi.
          </span>
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
