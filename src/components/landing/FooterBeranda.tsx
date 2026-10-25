/**
 * Footer beranda.
 *
 * Footer lama hanya satu baris tautan yang mengalir bersama deskripsi singkat,
 * tanpa pengelompokan dan tanpa kanal bantuan yang terlihat sebagai kanal.
 * Di bagian paling bawah halaman itulah pengunjung memutuskan apakah situs ini
 * bisa dipercaya, jadi di sini tautan dikelompokkan menurut tujuan (produk dan
 * panduan), dan WhatsApp CS tampil sebagai kartu, bukan tautan kecil di antara
 * tautan lain.
 *
 * Semua tujuan di bawah adalah rute yang benar-benar terdaftar di `main.tsx`.
 * Teks deskripsi tetap datang dari CMS supaya admin bisa menggantinya.
 */
import { MessageCircle } from "lucide-react";
import { Link } from "react-router";

import { VaultLogo } from "@/components/VaultLogo";
import { HAK_CIPTA_PINDAI, PENAFIAN_PINDAI } from "@/lib/branding";
import { CONTRACT_TERMS_VERSION } from "@/lib/contract";
import { urlChatCs } from "@/lib/kontak";

type Tautan = { href: string; label: string };

const PRODUK: readonly Tautan[] = [
  { href: "/layanan/pinjaman-tunai", label: "Pinjaman tunai" },
  { href: "/layanan/gadai", label: "Gadai" },
  { href: "/layanan/kredit-barang", label: "Kredit barang" },
  { href: "/pinjaman/syariah", label: "Akad syariah" },
];

const PANDUAN: readonly Tautan[] = [
  { href: "/biaya", label: "Rincian biaya" },
  { href: "/cara-kerja", label: "Cara kerja" },
  { href: "/keamanan", label: "Keamanan" },
  { href: "/faq", label: "Pertanyaan umum" },
];

const AKSES: readonly Tautan[] = [
  { href: "/aplikasi", label: "Aplikasi Android" },
  { href: "/akses-bersama", label: "Ruang pendana" },
  { href: "/syarat-ketentuan", label: "Syarat & ketentuan" },
];

function KolomTautan({
  judul,
  tautan,
}: {
  judul: string;
  tautan: readonly Tautan[];
}) {
  return (
    <nav aria-label={judul}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gold-foreground">
        {judul}
      </p>
      <ul className="mt-3">
        {tautan.map((item) => (
          <li key={item.href}>
            <Link
              to={item.href}
              className="flex min-h-11 items-center text-sm text-slate-600 hover:text-primary focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function FooterBeranda({ deskripsi }: { deskripsi: string }) {
  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto max-w-6xl px-4 pb-10 pt-12 sm:px-6 sm:pb-12 sm:pt-14">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr] lg:gap-12">
          <div className="sm:col-span-2 lg:col-span-1">
            <Link
              to="/"
              aria-label="PINDAI, beranda"
              className="inline-flex items-center gap-2.5"
            >
              <VaultLogo size={32} />
              <span className="text-sm font-semibold tracking-[0.16em]">
                PINDAI
              </span>
            </Link>
            <p className="mt-3 max-w-sm text-sm leading-6 text-slate-600">
              {deskripsi}
            </p>
            {/* Nomor CS dibaca dari `lib/kontak`, bukan disalin di sini, supaya
                tidak ada nomor lama yang tertinggal di halaman. */}
            <a
              href={urlChatCs(
                "Halo PINDAI, saya ingin bertanya tentang layanan.",
              )}
              target="_blank"
              rel="noreferrer"
              className="mt-5 flex max-w-sm items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-primary">
                <MessageCircle className="size-4" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-foreground">
                  Chat CS di WhatsApp
                </span>
                <span className="block text-xs leading-5 text-slate-600">
                  Kanal bantuan resmi PINDAI
                </span>
              </span>
            </a>
          </div>

          <KolomTautan judul="Produk" tautan={PRODUK} />
          <KolomTautan judul="Panduan" tautan={PANDUAN} />
        </div>

        <nav
          aria-label="Tautan lain"
          className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-border pt-4"
        >
          {AKSES.map((item) => (
            <Link
              key={item.href}
              to={item.href}
              className="flex min-h-11 items-center text-sm text-slate-600 hover:text-primary focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="mt-6 flex flex-col gap-3 border-t border-border pt-6 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
          <p className="max-w-2xl text-xs leading-5 text-slate-500">
            {PENAFIAN_PINDAI}
          </p>
          <p className="shrink-0 text-xs leading-5 text-slate-500 sm:text-right">
            {HAK_CIPTA_PINDAI}
            <br />
            Ketentuan {CONTRACT_TERMS_VERSION}
          </p>
        </div>
      </div>
    </footer>
  );
}
