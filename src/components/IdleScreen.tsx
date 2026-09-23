/**
 * STOP-UP! — Idle / Standby Screen (Floating Cards Aesthetic)
 *
 * Tampilan saat terminal tidak dipakai: kartu-kartu layanan mengapung perlahan
 * dan satu ajakan "SENTUH DI MANA SAJA UNTUK MEMULAI". Sentuhan di titik mana
 * pun pada layar memulai alur (Page 1: input nomor HP).
 *
 * Layar ini juga titik auto-reload harian (03.00 WIB) untuk membersihkan
 * memory leak browser — lihat useAutoReload di halaman terminal.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router";
import {
  Gift,
  Percent,
  QrCode,
  Smartphone,
  Sparkles,
  Wallet,
  Wifi,
  Zap,
} from "lucide-react";

import { LogoStopUp } from "@/components/LogoStopUp";
import { labelJamWib } from "@/lib/stopup/waktu";

type KartuMengapung = {
  judul: string;
  keterangan: string;
  icon: React.ReactNode;
  posisi: string;
  animasi: string;
  delay: string;
  aksen: string;
};

const KARTU: KartuMengapung[] = [
  {
    judul: "PULSA",
    keterangan: "Semua operator",
    icon: <Smartphone className="size-7" />,
    posisi: "left-[4%] top-[14%]",
    animasi: "animate-float-card",
    delay: "0s",
    aksen: "text-rose-300",
  },
  {
    judul: "PAKET DATA",
    keterangan: "Kuota harian & bulanan",
    icon: <Wifi className="size-7" />,
    posisi: "right-[5%] top-[10%]",
    animasi: "animate-float-card-slow",
    delay: "1.1s",
    aksen: "text-sky-300",
  },
  {
    judul: "E-WALLET",
    keterangan: "DANA · OVO · GoPay",
    icon: <Wallet className="size-7" />,
    posisi: "left-[8%] bottom-[22%]",
    animasi: "animate-float-card-slow",
    delay: "0.6s",
    aksen: "text-emerald-300",
  },
  {
    judul: "PPOB & PLN",
    keterangan: "Token & tagihan",
    icon: <Zap className="size-7" />,
    posisi: "right-[7%] bottom-[26%]",
    animasi: "animate-float-card",
    delay: "1.7s",
    aksen: "text-amber-300",
  },
  {
    judul: "APPS PREMIUM",
    keterangan: "Voucher & injeksi email",
    icon: <Sparkles className="size-7" />,
    posisi: "left-[20%] top-[46%]",
    animasi: "animate-float-card-slow",
    delay: "2.3s",
    aksen: "text-fuchsia-300",
  },
  {
    judul: "QRIS",
    keterangan: "Semua bank & e-wallet",
    icon: <QrCode className="size-7" />,
    posisi: "right-[19%] top-[42%]",
    animasi: "animate-float-card",
    delay: "0.9s",
    aksen: "text-cyan-300",
  },
];

type IdleScreenProps = {
  onMulai: () => void;
  namaTerminal?: string;
  /** Pesan promo yang berputar di bawah logo (opsional). */
  promo?: string[];
};

export function IdleScreen({ onMulai, namaTerminal, promo }: IdleScreenProps) {
  const [jam, setJam] = useState(() => labelJamWib(Date.now()));
  const [idxPromo, setIdxPromo] = useState(0);

  useEffect(() => {
    const t = window.setInterval(() => setJam(labelJamWib(Date.now())), 15_000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    if (!promo || promo.length <= 1) return;
    const t = window.setInterval(
      () => setIdxPromo((i) => (i + 1) % promo.length),
      6_000,
    );
    return () => window.clearInterval(t);
  }, [promo]);

  return (
    <div
      className="kiosk-viewport kiosk-night kiosk-skyline relative flex items-center justify-center"
      onPointerDown={() => onMulai()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onMulai();
      }}
      aria-label="Sentuh di mana saja untuk memulai"
    >
      {/* Kartu layanan mengapung */}
      {KARTU.map((k) => (
        <div
          key={k.judul}
          className={`kiosk-surface pointer-events-none absolute ${k.posisi} ${k.animasi} hidden w-44 rounded-3xl px-4 py-3.5 lg:block`}
          style={{ animationDelay: k.delay }}
        >
          <span className={`${k.aksen} flex items-center gap-2`}>
            {k.icon}
            <span className="text-sm font-black tracking-wide text-slate-50">
              {k.judul}
            </span>
          </span>
          <span className="mt-1 block text-[11px] leading-4 text-slate-400">
            {k.keterangan}
          </span>
        </div>
      ))}

      {/* Blok tengah */}
      <div className="relative z-10 flex max-w-2xl flex-col items-center px-6 text-center">
        <LogoStopUp size={64} />

        <p className="mt-7 text-xs font-semibold uppercase tracking-[0.42em] text-slate-400">
          Layanan Digital Mandiri
        </p>

        {promo && promo.length > 0 ? (
          <div className="mt-6 flex items-center gap-2 rounded-full border border-amber-300/25 bg-amber-300/10 px-4 py-2">
            <Percent className="size-4 text-amber-300" />
            <span className="text-sm font-semibold text-amber-100 transition-opacity duration-500">
              {promo[idxPromo]}
            </span>
          </div>
        ) : null}

        <div className="animate-touch-hint mt-10 rounded-3xl border border-rose-400/40 bg-rose-500/10 px-6 py-5">
          <p className="text-lg font-black tracking-wide text-slate-50 sm:text-xl">
            SENTUH DI MANA SAJA UNTUK MEMULAI
          </p>
          <p className="mt-1.5 text-xs text-slate-400">
            Pulsa · Paket Data · E-Wallet · PPOB & PLN · Apps Premium
          </p>
        </div>

        <div className="mt-8 flex items-center gap-3 text-[11px] uppercase tracking-widest text-slate-500">
          <Gift className="size-3.5" />
          <span>Pembayaran QRIS — cetak struk otomatis</span>
        </div>
      </div>

      {/* Status bar bawah */}
      <div className="absolute inset-x-0 bottom-4 z-10 flex items-center justify-between px-6 text-[11px] text-slate-500">
        <span>{namaTerminal ? `Terminal ${namaTerminal}` : "Terminal belum terdaftar"}</span>
        <span className="flex items-center gap-4">
          <span className="font-mono text-slate-400">{jam} WIB</span>
          {/* Pintu masuk operator — sengaja kecil & redup agar tidak menarik
              perhatian pelanggan, tapi tetap bisa disentuh petugas. */}
          <Link
            to="/admin"
            onPointerDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            className="rounded-full border border-slate-700/60 px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-slate-500 hover:border-sky-400/60 hover:text-sky-300"
          >
            Admin
          </Link>
        </span>
      </div>
    </div>
  );
}

export default IdleScreen;
