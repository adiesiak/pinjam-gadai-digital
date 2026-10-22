import { ArrowRight, Calculator, Lock, ShieldCheck } from "lucide-react";
import { Component, type ReactNode } from "react";
import { Link } from "react-router";

import { Button } from "@/components/ui/button";
import { GelombangPattern, PindaiCard3D } from "./KartuHeroPindai";

export interface LandingHeroProps {
  eyebrow: string;
  judul1: string;
  judul2: string;
  deskripsi: string;
  ctaUtama: { label: string; href: string; disabled?: boolean };
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

      <div className="relative z-10 mx-auto grid w-full max-w-7xl items-center gap-10 px-4 pb-12 pt-12 sm:gap-12 sm:px-6 sm:pb-16 sm:pt-16 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14 lg:pb-20 lg:pt-20">
        <div className="max-w-xl">
          <p className="motion-slide-up inline-flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
            <Calculator className="size-3.5" aria-hidden="true" />
            {props.eyebrow}
          </p>

          <h1
            id="hero-judul"
            className="motion-slide-up mt-6 text-[2.15rem] font-semibold leading-[1.08] tracking-[-0.035em] text-foreground min-[480px]:text-[2.7rem] sm:text-5xl lg:text-[3.4rem]"
            style={{ animationDelay: "0.06s" }}
          >
            {props.judul1}
            <br />
            <span className="font-display text-primary">{props.judul2}</span>
          </h1>

          <p
            className="motion-slide-up mt-6 max-w-lg text-base leading-7 text-slate-700 sm:text-lg sm:leading-8"
            style={{ animationDelay: "0.12s" }}
          >
            {props.deskripsi}
          </p>

          <div
            className="motion-slide-up mt-8 flex flex-wrap items-center gap-3"
            style={{ animationDelay: "0.18s" }}
          >
            {/* `disabled` tidak berlaku pada elemen <a>, jadi selama sesi masih
                dimuat CTA dirender sebagai tombol mati. Kalau tetap memakai
                Link, tautan "Memuat…" masih bisa membawa pengunjung ke /auth
                sebelum keadaannya diketahui. */}
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
                <Link to={props.ctaUtama.href}>
                  {props.ctaUtama.label}
                  <ArrowRight className="ml-2 size-4" aria-hidden="true" />
                </Link>
              </Button>
            )}
            {/* CTA sekunder ke halaman lain adalah tautan sungguhan: bisa dibuka
                di tab baru dan perpindahan rute tidak memuat ulang halaman. */}
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

          <p
            className="motion-slide-up mt-6 max-w-lg text-xs leading-5 text-slate-700"
            style={{ animationDelay: "0.24s" }}
          >
            {props.mikro}
          </p>

          <div
            className="motion-slide-up mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-border pt-5 text-xs font-medium text-slate-700 sm:text-sm"
            style={{ animationDelay: "0.3s" }}
          >
            <span className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-primary" aria-hidden="true" />
              Rincian biaya terbuka
            </span>
            <span className="flex items-center gap-2">
              <Lock className="size-4 text-primary" aria-hidden="true" />
              Verifikasi OTP WhatsApp
            </span>
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-[340px] lg:max-w-[420px]">
          <PindaiCard3D />
          <p className="mt-2 text-center text-[11px] font-medium text-slate-700">
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
