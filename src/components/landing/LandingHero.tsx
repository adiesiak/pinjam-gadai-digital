import { ArrowRight, Lock, ShieldCheck, Sparkles } from "lucide-react";
import { Component, type ReactNode } from "react";
import { Link } from "react-router";

import { Button } from "@/components/ui/button";
import { KartuHeroPindai } from "./KartuHeroPindai";

/**
 * Hero landing PINDAI — panggung terang, tanpa kanvas dan tanpa mesin 3D.
 *
 * Latar belakang keputusan ini: hero sebelumnya menggambar ENAM adegan WebGL
 * (preset di `templateScene.ts`) di atas panggung gelap, dengan kartu yang bisa
 * dimiringkan dan diputar 360°. Mesin itu dicabut seluruhnya karena
 * (a) biayanya nyata di perangkat pengguna — satu konteks WebGL, shader, dan
 * loop rAF per kunjungan — sementara (b) seluruh halaman lain sudah memakai
 * satu wajah terang (`DESIGN.md` §1). Hero gelap ber-shader justru satu-satunya
 * bagian halaman yang tidak sejalan dengan sisa produk.
 *
 * Yang tersisa sekarang:
 *  - Satu kolom teks: eyebrow, judul dua baris, deskripsi, dua CTA, catatan
 *    mikro, dan dua poin kepercayaan.
 *  - Satu objek merek: `KartuHeroPindai` (kartu contoh berpermukaan gelap yang
 *    memang dipertahankan `DESIGN.md` §1/§3A). Interaksi di kartu itu milik
 *    komponennya sendiri — hover tilt halus pada perangkat berpenunjuk presisi,
 *    mati di layar sentuh dan saat `prefers-reduced-motion`.
 *
 * Tidak ada `canvas`, tidak ada listener pointer/gulir, tidak ada `setState`
 * per frame, dan tidak ada lapisan dekoratif yang bisa gagal dimuat: yang
 * dirender di server sama persis dengan yang dilihat pengunjung.
 */
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
    // Garis pemisah ke bagian berikutnya disediakan `FactRibbon` (`border-t`),
    // jadi hero tidak menambahkan garis kedua tepat di bawahnya.
    <section
      aria-labelledby="hero-judul"
      className="relative overflow-hidden bg-slate-50"
    >
      {/* Garis rambut kuningan di tepi atas: penanda merek setipis mungkin,
          bukan wash warna. Satu elemen, satu tujuan. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#c9a86a]/50 to-transparent"
      />

      {/* Cahaya hangat di separuh kanan: memisahkan sisi kartu dari sisi teks
          pada layar lebar tanpa menambah elemen baru di kolom kecil. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-0 hidden w-1/2 bg-[radial-gradient(58%_66%_at_78%_22%,rgba(16,185,129,0.10),transparent_72%),radial-gradient(52%_58%_at_72%_84%,rgba(201,168,106,0.12),transparent_74%)] lg:block"
      />

      <div className="relative mx-auto grid w-full max-w-7xl items-center gap-12 px-4 pb-14 pt-12 sm:px-6 sm:pb-16 sm:pt-16 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14 lg:pb-20 lg:pt-20">
        <div className="max-w-xl">
          <p className="motion-slide-up inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
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
            <span className="font-serif font-medium italic text-primary">
              {props.judul2}
            </span>
          </h1>

          <p
            className="motion-slide-up mt-6 max-w-lg text-base leading-7 text-slate-600 sm:text-lg sm:leading-8"
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
              className="h-12 rounded-full bg-primary px-6 text-white hover:bg-primary/90"
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
              className="group h-12 rounded-full border-slate-300 bg-white px-6 text-slate-700 hover:bg-slate-100"
            >
              {props.ctaSekunder.label}
              <ArrowRight
                className="ml-2 size-4 transition-transform group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </Button>
          </div>

          <p
            className="motion-slide-up mt-6 max-w-lg text-xs leading-5 text-slate-500"
            style={{ animationDelay: "0.24s" }}
          >
            {props.mikro}
          </p>

          <div
            className="motion-slide-up mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-slate-200 pt-5 text-xs font-medium text-slate-600 sm:text-sm"
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

        {/* Objek merek: kartu contoh. Rasio, permukaan, dan tipografinya milik
            `KartuHeroPindai` — di sini hanya ditempatkan. */}
        <div className="relative mx-auto w-full max-w-md">
          <KartuHeroPindai nama="Budi Setiawan" terverifikasi />
          <p className="mt-6 text-center text-[11px] uppercase tracking-[0.26em] text-slate-500">
            {props.sudahMasuk ? "Sesi aktif" : "Akun PINDAI"} · Pinjam &amp; gadai
            digital
          </p>
        </div>
      </div>
    </section>
  );
}

/**
 * Batas kesalahan hero.
 *
 * Hero tidak lagi punya mode gagal sendiri (tidak ada WebGL yang bisa ditolak
 * perangkat), jadi yang tersisa hanyalah jaring pengaman untuk kegagalan render
 * tak terduga — misalnya dari komponen kartu. Halaman depan tidak pernah
 * menjadi layar putih: yang tampil adalah fallback statis berisi judul dan
 * jalan masuk ke produk.
 */
export class HeroBoundary extends Component<{
  children: ReactNode;
  fallback: ReactNode;
}> {
  state = { rusak: false };

  static getDerivedStateFromError() {
    return { rusak: true };
  }

  componentDidCatch(error: unknown) {
    // Dicatat untuk debugging; tidak ada layanan logging yang dipanggil diam-diam.
    console.error("Hero landing gagal dirender:", error);
  }

  render() {
    return this.state.rusak ? this.props.fallback : this.props.children;
  }
}
