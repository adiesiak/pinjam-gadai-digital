import {
  ArrowRight,
  Banknote,
  Calculator,
  Check,
  HandCoins,
  Package,
  ShieldCheck,
} from "lucide-react";
import { useEffect } from "react";
import { Link } from "react-router";

import { FaqLayanan } from "@/components/informasi/FaqLayanan";
import {
  FORM_HREF,
  InfoFooter,
  InfoHeader,
} from "@/components/informasi/InfoShell";
import { JudulBagian } from "@/components/landing/JudulBagian";
import { Button } from "@/components/ui/button";
import { TENOR_BULANAN_OPTIONS } from "@/lib/bulanan";
import { GADAI_PRICING } from "@/lib/gadai";
import {
  KREDIT_BARANG_POKOK_MAKS,
  KREDIT_PRICING,
  KREDIT_TENOR_PENGAJUAN_OPTIONS,
} from "@/lib/kredit";
import { LOAN_LIMITS, TENOR_OPTIONS } from "@/lib/loan";
import { formatRupiah } from "@/lib/money";

const TENOR_HARIAN = `${TENOR_OPTIONS[0]}–${TENOR_OPTIONS[TENOR_OPTIONS.length - 1]}`;
const TENOR_BULANAN = TENOR_BULANAN_OPTIONS.join("/");
const TENOR_KREDIT = KREDIT_TENOR_PENGAJUAN_OPTIONS.join("/");

const LAYANAN = [
  {
    href: "/layanan/pinjaman-tunai",
    judul: "Pinjaman tunai",
    ringkas: "Dana tunai untuk kebutuhan yang sudah terukur.",
    ikon: Banknote,
    fakta: [
      { label: "Tenor harian", nilai: `${TENOR_HARIAN} hari` },
      { label: "Cicilan", nilai: `${TENOR_BULANAN} bulan` },
    ],
    detail:
      "Bunga flat, potongan di muka, dan kewajiban pelunasan terlihat sebelum mengajukan.",
  },
  {
    href: "/layanan/gadai",
    judul: "Gadai",
    ringkas: "Nilai barang jaminan dicatat sebagai dasar pinjaman.",
    ikon: HandCoins,
    fakta: [
      { label: "Batas hitung", nilai: `${GADAI_PRICING.ltvMaxPercent}% harga pasar` },
      {
        label: "Sewa modal",
        nilai: `${GADAI_PRICING.sewaModalMinPercent}–${GADAI_PRICING.sewaModalMaxPercent}% / ${GADAI_PRICING.periodeHari} hari`,
      },
    ],
    detail:
      "Taksiran aplikasi bukan pemeriksaan fisik. Penitipan dan pelelongan berlangsung di luar aplikasi.",
  },
  {
    href: "/layanan/kredit-barang",
    judul: "Kredit barang",
    ringkas: "Pembiayaan barang dengan uang muka dan tenor tetap.",
    ikon: Package,
    fakta: [
      {
        label: "Uang muka",
        nilai: `${KREDIT_PRICING.dpMinPersen}–${KREDIT_PRICING.dpMaxPersen}%`,
      },
      { label: "Tenor", nilai: `${TENOR_KREDIT} bulan` },
    ],
    detail:
      "Pembelian barang ditangani di luar aplikasi; PINDAI mencatat pilihan pembiayaan dan jadwalnya.",
  },
] as const;

const PANDUAN = [
  {
    kebutuhan: "Butuh uang tunai",
    pilihan: "Pinjaman tunai",
    alasan:
      "Cocok bila kebutuhan dan kemampuan bayar sudah jelas. Pilih tenor harian atau cicilan bulanan.",
    href: "/layanan/pinjaman-tunai",
  },
  {
    kebutuhan: "Punya barang bernilai",
    pilihan: "Gadai",
    alasan:
      "Nilai pinjaman mengikuti taksiran barang. Periksa batas LTV dan sewa modal sebelum memutuskan.",
    href: "/layanan/gadai",
  },
  {
    kebutuhan: "Butuh barang, bukan uang",
    pilihan: "Kredit barang",
    alasan:
      "Barang dibiayai dengan DP dan tenor tertentu. Pastikan harga barang serta total cicilan sudah dibaca.",
    href: "/layanan/kredit-barang",
  },
] as const;

const SAMA = [
  {
    judul: "Hitungan dari mesin yang sama",
    isi: "Kalkulator, formulir, dan kontrak membaca aturan biaya yang sama. Tidak ada tarif terpisah untuk halaman ini.",
  },
  {
    judul: "Batas aplikasi ditulis terbuka",
    isi: "PINDAI mencatat pengajuan, hitungan, dan status. Perpindahan dana serta pemeriksaan fisik berlangsung di luar aplikasi.",
  },
  {
    judul: "Tidak ada janji hasil",
    isi: "Persetujuan dan pencairan tidak otomatis. Angka di halaman ini adalah ilustrasi, bukan jaminan.",
  },
] as const;

const FAQ_LAYANAN = [
  {
    q: "Apa bedanya pinjaman tunai, gadai, dan kredit barang?",
    a: "Pinjaman tunai memberi dana tunai; gadai memakai barang jaminan sebagai dasar pinjaman; kredit barang membiayai pembelian barang. Ketiganya punya batas, tenor, dan biaya yang berbeda.",
  },
  {
    q: "Apakah saya perlu akun untuk melihat biaya?",
    a: "Tidak. Kalkulator di halaman Biaya bisa dipakai tanpa akun. Akun diperlukan saat Anda mengirim pengajuan.",
  },
  {
    q: "Apakah PINDAI mengirim dana ke rekening saya?",
    a: "Tidak otomatis. PINDAI mencatat pengajuan, perhitungan, dan status. Perpindahan dana ditangani di luar aplikasi setelah pengajuan disetujui.",
  },
  {
    q: "Di mana saya bisa membaca syarat dan biaya lengkap?",
    a: "Rincian biaya ada di halaman Biaya; syarat lengkap ada di Syarat & Ketentuan. Angka final tetap mengikuti rincian pengajuan Anda.",
  },
] as const;

function KartuIndeks() {
  return (
    <div className="relative mx-auto w-full max-w-[420px]">
      <div
        aria-hidden="true"
        className="absolute -left-2 top-7 h-[calc(100%-1.75rem)] w-[calc(100%-0.5rem)] -rotate-2 rounded-2xl border border-gold/30 bg-secondary/70"
      />
      <nav
        aria-label="Indeks layanan PINDAI"
        className="relative rounded-2xl border border-gold/55 bg-card p-4 shadow-[0_20px_45px_-30px_rgba(28,26,21,0.45)] sm:p-5"
      >
        <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold-foreground">
            Indeks layanan
          </p>
          <span className="font-mono text-xs text-muted-foreground">
            01 / 03
          </span>
        </div>
        <ul className="divide-y divide-border">
          {LAYANAN.map((item, i) => {
            const Ikon = item.ikon;
            return (
              <li key={item.href}>
                <Link
                  to={item.href}
                  className="group flex min-h-16 items-center gap-3 py-3 focus-visible:rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="font-mono text-[11px] text-muted-foreground">
                    0{i + 1}
                  </span>
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
                    <Ikon className="size-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-foreground group-hover:text-primary">
                      {item.judul}
                    </span>
                    <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                      {item.ringkas}
                    </span>
                  </span>
                  <ArrowRight
                    className="size-4 shrink-0 text-primary transition-transform group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </Link>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 border-t border-border pt-3 text-xs leading-5 text-muted-foreground">
          Semua rincian biaya mengikuti aturan yang sama dengan formulir
          pengajuan.
        </p>
      </nav>
    </div>
  );
}

export default function Layanan() {
  useEffect(() => {
    const originalTitle = document.title;
    const meta = document.querySelector('meta[name="description"]');
    const originalDescription = meta?.getAttribute("content") ?? null;
    document.title = "Layanan | PINDAI";
    meta?.setAttribute(
      "content",
      "Bandingkan pinjaman tunai, gadai, dan kredit barang PINDAI: tenor, batas, dan langkah sebelum mengajukan.",
    );
    return () => {
      document.title = originalTitle;
      if (meta && originalDescription !== null) {
        meta.setAttribute("content", originalDescription);
      }
    };
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <InfoHeader />
      <main id="konten" tabIndex={-1}>
        <section
          aria-labelledby="layanan-judul"
          className="border-b border-border bg-muted/35"
        >
          <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 py-10 sm:px-6 sm:py-16 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14 lg:py-20">
            <div className="max-w-xl">
              <p className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-gold-foreground">
                <Calculator className="size-3.5" aria-hidden="true" />
                Layanan PINDAI
              </p>
              <h1
                id="layanan-judul"
                className="mt-6 text-balance font-judul text-[2.3rem] leading-[1.05] tracking-[-0.03em] text-foreground min-[480px]:text-[2.8rem] sm:text-5xl lg:text-[3.4rem]"
              >
                <span className="block">Tiga layanan.</span>{" "}
                <span className="block font-display text-primary">
                  Satu keputusan yang jelas.
                </span>
              </h1>
              <p className="mt-5 max-w-lg text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
                Mulai dari kebutuhan Anda: dana tunai, barang jaminan, atau
                barang yang ingin dibiayai. Setiap layanan punya batas dan
                hitungan sendiri yang bisa dibaca sebelum membuat akun.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Button
                  asChild
                  className="min-h-12 bg-primary px-6 text-primary-foreground hover:bg-primary/90"
                >
                  <Link to="/biaya">
                    Hitung biaya
                    <ArrowRight className="ml-2 size-4" aria-hidden="true" />
                  </Link>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  className="min-h-12 border-border bg-card px-6 text-foreground hover:bg-muted"
                >
                  <Link to={FORM_HREF}>Mulai pengajuan</Link>
                </Button>
              </div>
              <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                <ShieldCheck className="size-4 text-primary" aria-hidden="true" />
                Kalkulator biaya bisa dipakai tanpa akun.
              </p>
            </div>
            <KartuIndeks />
          </div>
        </section>

        <section
          aria-labelledby="pilih-layanan-judul"
          className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-18"
        >
          <JudulBagian
            id="pilih-layanan-judul"
            label="Pilih layanan"
            judul="Mulai dari yang benar-benar Anda butuhkan."
            deskripsi="Tiga layanan ini tidak saling menggantikan. Pilih berdasarkan bentuk kebutuhan, bukan sekadar nominal terbesar."
            className="max-w-2xl"
          />
          <div className="mt-8 grid gap-4 md:grid-cols-3 md:gap-5">
            {LAYANAN.map((item, i) => {
              const Ikon = item.ikon;
              return (
                <article
                  key={item.href}
                  className="group flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card transition-colors hover:border-primary/35"
                >
                  <div className="flex-1 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <span className="flex size-11 items-center justify-center rounded-xl bg-secondary text-primary">
                        <Ikon className="size-5" aria-hidden="true" />
                      </span>
                      <span className="font-mono text-[11px] text-muted-foreground">
                        0{i + 1}
                      </span>
                    </div>
                    <h3 className="mt-5 font-judul text-2xl leading-tight text-foreground">
                      {item.judul}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {item.ringkas}
                    </p>
                    <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-border pt-4">
                      {item.fakta.map((fakta) => (
                        <div key={fakta.label}>
                          <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                            {fakta.label}
                          </dt>
                          <dd className="mt-1 text-sm font-semibold tabular-nums text-foreground">
                            {fakta.nilai}
                          </dd>
                        </div>
                      ))}
                    </dl>
                    <p className="mt-4 text-xs leading-5 text-muted-foreground">
                      {item.detail}
                    </p>
                  </div>
                  <Link
                    to={item.href}
                    className="flex min-h-12 items-center justify-between border-t border-border px-5 text-sm font-semibold text-primary transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  >
                    Lihat rincian
                    <ArrowRight
                      className="size-4 transition-transform group-hover:translate-x-0.5"
                      aria-hidden="true"
                    />
                  </Link>
                </article>
              );
            })}
          </div>
        </section>

        <section
          aria-labelledby="panduan-layanan-judul"
          className="border-y border-border bg-muted/45"
        >
          <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
            <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:gap-14">
              <JudulBagian
                id="panduan-layanan-judul"
                label="Panduan singkat"
                judul="Cocokkan kebutuhan dengan layanan."
                deskripsi="Kalau masih ragu, baca tiga situasi berikut. Tautan menuju rincian masing-masing layanan."
                className="border-t-0 pt-0"
              />
              <ol className="divide-y divide-border rounded-2xl border border-border bg-card">
                {PANDUAN.map((item, i) => (
                  <li
                    key={item.kebutuhan}
                    className="grid gap-2 p-4 sm:grid-cols-[2rem_minmax(0,1fr)_auto] sm:items-start sm:gap-4 sm:p-5"
                  >
                    <span className="flex size-7 items-center justify-center rounded-full border border-gold/45 bg-secondary font-mono text-xs text-gold-foreground">
                      {i + 1}
                    </span>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gold-foreground">
                        {item.kebutuhan}
                      </p>
                      <h3 className="mt-1 text-sm font-semibold text-foreground">
                        {item.pilihan}
                      </h3>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">
                        {item.alasan}
                      </p>
                    </div>
                    <Link
                      to={item.href}
                      className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-primary underline underline-offset-4 focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      Buka
                      <ArrowRight className="size-3.5" aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        <section
          aria-labelledby="sama-layanan-judul"
          className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16"
        >
          <JudulBagian
            id="sama-layanan-judul"
            label="Yang sama di semua layanan"
            judul="Batasnya jelas sebelum Anda masuk."
            className="max-w-2xl"
          />
          <div className="mt-7 grid gap-4 md:grid-cols-3">
            {SAMA.map((item) => (
              <article
                key={item.judul}
                className="rounded-2xl border border-border bg-card p-5"
              >
                <Check className="size-5 text-primary" aria-hidden="true" />
                <h3 className="mt-3 text-sm font-semibold text-foreground">
                  {item.judul}
                </h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {item.isi}
                </p>
              </article>
            ))}
          </div>
          <p className="mt-6 max-w-3xl text-sm leading-6 text-muted-foreground">
            Batas hitung internal: pinjaman tunai mulai dari{" "}
            {formatRupiah(LOAN_LIMITS.minPokok)}; kredit barang sampai{" "}
            {formatRupiah(KREDIT_BARANG_POKOK_MAKS)} setelah DP. Plafon per akun
            tetap mengikuti penilaian PINDAI.
          </p>
        </section>

        <section className="border-t border-border bg-card">
          <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div>
              <h2 className="font-judul text-2xl leading-tight text-foreground">
                Belum yakin? Hitung dulu.
              </h2>
              <p className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground">
                Kalkulator publik menampilkan potongan, bunga, dan kewajiban
                secara ilustratif. Tidak perlu akun untuk mencoba.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button
                asChild
                className="min-h-11 bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <Link to="/biaya">
                  Buka kalkulator
                  <ArrowRight className="ml-2 size-4" aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="min-h-11 border-border bg-card">
                <Link to="/cara-kerja">Baca cara kerja</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>
      <FaqLayanan
        id="faq-layanan-indeks"
        judul="Masih ragu memilih layanan?"
        deskripsi="Empat pertanyaan yang paling dekat dengan keputusan di halaman ini. Jawaban panjang tetap ada di halaman pertanyaan umum."
        daftar={FAQ_LAYANAN}
        pesanChat="Halo PINDAI, saya sedang membaca halaman Layanan dan ingin bertanya tentang pilihan pinjaman tunai, gadai, atau kredit barang."
      />
      <InfoFooter />
    </div>
  );
}
