import { ArrowRight, Calculator, Lock, ShieldCheck } from "lucide-react";
import { Component, type ReactNode } from "react";
import { Link } from "react-router";

import { IkonWhatsapp } from "@/components/IkonWhatsapp";
import { Button } from "@/components/ui/button";
import { urlChatCs } from "@/lib/kontak";
import { GelombangPattern, PindaiCard3D } from "./KartuHeroPindai";

export interface LandingHeroProps {
  eyebrow: string;
  judul1: string;
  judul2: string;
  deskripsi: string;
  ctaUtama: { label: string; href: string; disabled?: boolean };
  /** Event funnel opsional; tidak mengubah tujuan CTA. */
  onCtaUtamaClick?: () => void;
  /**
   * Tautan rute bila tujuannya halaman lain; `onClick` hanya untuk halaman yang
   * memang menggulir ke bagian di layar yang sama (mis. landing lama).
   */
  ctaSekunder:
    | { label: string; href: string }
    | { label: string; onClick: () => void };
  mikro: string;
  sudahMasuk: boolean;
}

export function LandingHero(props: LandingHeroProps) {
  const kelasSekunder =
    "h-12 rounded-tombol border-border bg-card px-6 text-foreground hover:bg-muted";

  return (
    // Warna dan bentuk datang dari token tema/gaya: `bg-hero` memasang warna
    // dasar + pola permukaan, `font-display` memilih tipografi judul. Tidak ada
    // heksadesimal di sini, supaya template benar-benar mengubah landing.
    <section
      aria-labelledby="hero-judul"
      className="bg-hero relative w-full overflow-hidden"
    >
      {/* Motif ombak dipakai sebagai watermark tenang, bukan bidang penuh:
          dua swell tanpa titik kuningan, opasitas rendah, dan mask yang habis
          sebelum kolom kartu. Latar tidak boleh bersaing dengan judul. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
      >
        <GelombangPattern
          ragam="latar"
          opacity={0.11}
          preserveAspectRatio="xMidYMid slice"
          style={{
            // Ombak berhenti sebelum kolom kartu, jadi sisi kanan tetap kertas
            // bersih dan mata berhenti pada judul lebih dulu.
            maskImage:
              "radial-gradient(100% 85% at 10% 0%, rgba(0,0,0,0.9), transparent 58%)",
            WebkitMaskImage:
              "radial-gradient(100% 85% at 10% 0%, rgba(0,0,0,0.9), transparent 58%)",
          }}
        />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-6xl px-4 pb-8 pt-8 sm:px-6 sm:pb-10 sm:pt-12 lg:pb-12 lg:pt-16">
        <div className="grid items-stretch gap-8 lg:grid-cols-[1.08fr_0.92fr] lg:gap-12">
          <div className="max-w-2xl">
            {/* Tiga kelompok gerak saja: teks pembuka, aksi, lalu kartu. */}
            <div className="motion-slide-up">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-gold-foreground">
                  <Calculator className="size-4" aria-hidden="true" />
                  {props.eyebrow}
                </p>
                <span
                  aria-hidden="true"
                  className="h-px min-w-6 flex-1 bg-gold/40"
                />
                <span className="hidden font-mono text-xs tracking-[0.12em] text-muted-foreground sm:inline">
                  PINDAI / 2026
                </span>
              </div>

              <h1
                id="hero-judul"
                className="mt-7 text-balance text-[2.25rem] font-semibold leading-[1.1] tracking-[-0.04em] text-foreground min-[480px]:text-[2.8rem] sm:text-5xl lg:text-[3.8rem]"
              >
                <span className="block">{props.judul1}</span>{" "}
                <span className="mt-1 block font-display text-primary">
                  {props.judul2}
                </span>
              </h1>

              <p className="mt-6 max-w-xl text-base leading-7 text-slate-700 sm:text-lg sm:leading-8">
                {props.deskripsi}
              </p>
            </div>

            <div
              className="motion-slide-up mt-8"
              style={{ animationDelay: "0.08s" }}
            >
              <div className="flex flex-wrap items-center gap-3">
                {/* `disabled` tidak berlaku pada elemen <a>, jadi selama sesi
                    masih dimuat CTA dirender sebagai tombol mati. Kalau tetap
                    memakai Link, tautan "Memuat…" masih bisa membawa
                    pengunjung ke /auth sebelum keadaannya diketahui. */}
                {props.ctaUtama.disabled ? (
                  <Button
                    disabled
                    aria-busy="true"
                    className="h-12 rounded-tombol bg-primary px-6 text-primary-foreground"
                  >
                    {props.ctaUtama.label}
                  </Button>
                ) : (
                  <Button
                    asChild
                    className="h-12 rounded-tombol bg-primary px-6 text-primary-foreground hover:bg-primary/90"
                  >
                    {props.ctaUtama.href.startsWith("#") ? (
                      <a
                        href={props.ctaUtama.href}
                        onClick={props.onCtaUtamaClick}
                      >
                        {props.ctaUtama.label}
                        <ArrowRight
                          className="ml-2 size-4"
                          aria-hidden="true"
                        />
                      </a>
                    ) : (
                      <Link
                        to={props.ctaUtama.href}
                        onClick={props.onCtaUtamaClick}
                      >
                        {props.ctaUtama.label}
                        <ArrowRight
                          className="ml-2 size-4"
                          aria-hidden="true"
                        />
                      </Link>
                    )}
                  </Button>
                )}
                {/* CTA sekunder ke halaman lain adalah tautan sungguhan: bisa
                    dibuka di tab baru dan perpindahan rute tidak memuat ulang
                    halaman. */}
                {"href" in props.ctaSekunder ? (
                  <Button asChild variant="outline" className={kelasSekunder}>
                    <Link to={props.ctaSekunder.href}>
                      {props.ctaSekunder.label}
                    </Link>
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={props.ctaSekunder.onClick}
                    className={kelasSekunder}
                  >
                    {props.ctaSekunder.label}
                  </Button>
                )}
              </div>

              <p className="mt-5 max-w-lg text-sm leading-6 text-slate-700">
                {props.mikro}
              </p>
            </div>
          </div>

          <div
            className="motion-fade relative flex flex-col justify-center rounded-2xl border border-sky-200 bg-sky-100 p-4 sm:p-6 lg:p-7"
            style={{ animationDelay: "0.12s" }}
          >
            <div
              aria-hidden="true"
              className="absolute inset-x-4 top-0 h-0.5 bg-gold/70 sm:inset-x-6"
            />
            <div
              aria-hidden="true"
              className="flex items-center justify-between gap-3 px-1 pt-1"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold-foreground">
                Kartu PINDAI
              </p>
              <span className="font-mono text-xs tracking-[0.12em] text-slate-700">
                2026
              </span>
            </div>
            <div className="mt-4 flex flex-1 items-center justify-center">
              <PindaiCard3D />
            </div>
            {props.sudahMasuk ? (
              <p className="mt-4 text-center text-xs font-medium text-slate-700">
                Sesi aktif
              </p>
            ) : null}
          </div>
        </div>

        <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-gold/25 pt-5 text-sm font-medium text-slate-700">
          <span className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-primary" aria-hidden="true" />
            Rincian biaya terbuka
          </span>
          <span className="flex items-center gap-2">
            <Lock className="size-4 text-primary" aria-hidden="true" />
            Verifikasi OTP WhatsApp
          </span>
          <a
            href={urlChatCs("Halo PINDAI, saya ingin bertanya tentang layanan.")}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center gap-2 text-primary underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <IkonWhatsapp className="size-4" aria-hidden="true" />
            Bantuan WhatsApp
          </a>
        </div>
      </div>
    </section>
  );
}

export class HeroBoundary extends Component<{
  children: ReactNode;
  fallback: ReactNode;
}> {
  state = { rusak: false };

  static getDerivedStateFromError() {
    return { rusak: true };
  }

  componentDidCatch(error: unknown) {
    console.error("Hero landing gagal dirender:", error);
  }

  render() {
    return this.state.rusak ? this.props.fallback : this.props.children;
  }
}
