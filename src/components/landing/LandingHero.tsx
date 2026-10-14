import { ArrowRight, Lock, ShieldCheck, Sparkles } from "lucide-react";
import { Component, type ReactNode } from "react";
import { Link } from "react-router";

import { Button } from "@/components/ui/button";
import { PindaiCard3D } from "./KartuHeroPindai";

export interface LandingHeroProps {
  eyebrow: string;
  judul1: string;
  judul2: string;
  deskripsi: string;
  ctaUtama: { label: string; href: string; disabled?: boolean };
  ctaSekunder: { label: string; onClick: () => void };
  mikro: string;
  sudahMasuk: boolean;
}

export function LandingHero(props: LandingHeroProps) {
  return (
    <section
      aria-labelledby="hero-judul"
      className="relative w-full overflow-hidden bg-[#f8fafc]"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
      >
        <span className="absolute -right-28 top-[8%] size-[220px] rounded-full bg-[#a7f3d0]/65 blur-2xl sm:right-[4%] sm:top-[8%] sm:size-[480px]" />
        <span className="absolute -left-16 -top-12 size-[150px] rounded-full bg-[#d1fae5]/65 blur-xl sm:-left-20 sm:-top-24 sm:size-[280px]" />
        <span className="absolute -bottom-16 left-[8%] size-[110px] rounded-full bg-[#a7f3d0]/55 blur-2xl sm:bottom-4 sm:left-[34%] sm:size-[160px]" />
      </div>

      <div className="relative z-10 mx-auto grid w-full max-w-7xl items-center gap-10 px-4 pb-12 pt-12 sm:gap-12 sm:px-6 sm:pb-16 sm:pt-16 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14 lg:pb-20 lg:pt-20">
        <div className="max-w-xl">
          <p className="motion-slide-up inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#065f46]">
            <Sparkles className="size-3.5" aria-hidden="true" />
            {props.eyebrow}
          </p>

          <h1
            id="hero-judul"
            className="motion-slide-up mt-6 text-[2.15rem] font-semibold leading-[1.08] tracking-[-0.035em] text-slate-900 min-[480px]:text-[2.7rem] sm:text-5xl lg:text-[3.4rem]"
            style={{ animationDelay: "0.06s" }}
          >
            {props.judul1}
            <br />
            <span className="font-serif font-medium italic text-[#064e3b]">
              {props.judul2}
            </span>
          </h1>

          <p
            className="motion-slide-up mt-6 max-w-lg text-base leading-7 text-[#334155] sm:text-lg sm:leading-8"
            style={{ animationDelay: "0.12s" }}
          >
            {props.deskripsi}
          </p>

          <div
            className="motion-slide-up mt-8 flex flex-wrap items-center gap-3"
            style={{ animationDelay: "0.18s" }}
          >
            <Button
              asChild
              disabled={props.ctaUtama.disabled}
              className="h-12 rounded-full bg-[#065f46] px-6 text-white hover:bg-[#064e3b]"
            >
              <Link to={props.ctaUtama.href}>
                {props.ctaUtama.label}
                <ArrowRight className="ml-2 size-4" aria-hidden="true" />
              </Link>
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={props.ctaSekunder.onClick}
              className="group h-12 rounded-full border-slate-200 bg-white px-6 text-[#1e293b] hover:bg-slate-50"
            >
              {props.ctaSekunder.label}
              <ArrowRight
                className="ml-2 size-4 transition-transform group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </Button>
          </div>

          <p
            className="motion-slide-up mt-6 max-w-lg text-xs leading-5 text-[#334155]"
            style={{ animationDelay: "0.24s" }}
          >
            {props.mikro}
          </p>

          <div
            className="motion-slide-up mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-slate-200 pt-5 text-xs font-medium text-[#334155] sm:text-sm"
            style={{ animationDelay: "0.3s" }}
          >
            <span className="flex items-center gap-2">
              <ShieldCheck
                className="size-4 text-emerald-900"
                aria-hidden="true"
              />
              Rincian biaya terbuka
            </span>
            <span className="flex items-center gap-2">
              <Lock className="size-4 text-[#065f46]" aria-hidden="true" />
              Verifikasi OTP WhatsApp
            </span>
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-[340px] lg:max-w-[420px]">
          <PindaiCard3D />
          <p className="mt-4 text-center text-xs leading-5 text-[#334155]">
            Contoh hitungan ilustratif. PINDAI hanya mencatat, pembayaran dan
            pencairan dilakukan di luar aplikasi.
          </p>
          <p className="mt-2 text-center text-[11px] font-medium text-[#334155]">
            {props.sudahMasuk ? "Sesi aktif" : "Akun PINDAI"} · Pinjam &amp;
            gadai digital
          </p>
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
