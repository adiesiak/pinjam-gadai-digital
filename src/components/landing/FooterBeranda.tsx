/**
 * Footer beranda.
 *
 * Tautan dikelompokkan menurut tujuan, bukan ditempatkan di satu baris
 * tambahan yang membuat footer terlalu tinggi. WhatsApp CS tetap tampil sebagai
 * kartu karena di bagian paling bawah halaman itulah pengunjung memutuskan
 * apakah situs ini bisa dipercaya.
 *
 * Semua tujuan di bawah adalah rute yang benar-benar terdaftar di `main.tsx`.
 * Teks deskripsi tetap datang dari CMS supaya admin bisa menggantinya.
 */

import { Mail, MapPin } from "lucide-react";
import { Link } from "react-router";

import { IkonWhatsapp } from "@/components/IkonWhatsapp";
import { VaultLogo } from "@/components/VaultLogo";
import {
  ALAMAT_KANTOR_PINDAI,
  EMAIL_RESMI_PINDAI,
  HAK_CIPTA_PINDAI,
  PENAFIAN_PINDAI,
} from "@/lib/branding";
import { CONTRACT_TERMS_VERSION } from "@/lib/contract";
import { urlChatCs } from "@/lib/kontak";

type Tautan = { href: string; label: string };

const PRODUK: readonly Tautan[] = [
  { href: "/layanan", label: "Semua layanan" },
  { href: "/layanan/pinjaman-tunai", label: "Pinjaman tunai" },
  { href: "/layanan/gadai", label: "Gadai" },
  { href: "/layanan/kredit-barang", label: "Kredit barang" },
  { href: "/pinjaman/konvensional", label: "Pinjaman konvensional" },
  { href: "/pinjaman/syariah", label: "Akad syariah" },
];

const PANDUAN: readonly Tautan[] = [
  { href: "/biaya", label: "Rincian biaya" },
  { href: "/cara-kerja", label: "Cara kerja" },
  { href: "/keamanan", label: "Keamanan" },
  { href: "/faq", label: "Pertanyaan umum" },
];

const BANTUAN: readonly Tautan[] = [
  { href: "/aplikasi", label: "Aplikasi Android" },
  { href: "/akses-bersama", label: "Ruang pendana" },
  { href: "/pemenang", label: "Program apresiasi" },
  { href: "/syarat-ketentuan", label: "Syarat & ketentuan" },
  { href: "/privasi", label: "Kebijakan privasi" },
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
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold-foreground">
        {judul}
      </p>
      <ul className="mt-2">
        {tautan.map((item) => (
          <li key={item.href}>
            <Link
              to={item.href}
              className="flex min-h-11 items-center text-sm text-muted-foreground hover:text-primary focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
    <footer
      id="footer-beranda"
      className="border-t border-border bg-background"
    >
      <div className="mx-auto max-w-6xl px-4 pb-10 pt-12 sm:px-6 sm:pb-12 sm:pt-14">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_0.9fr_0.9fr_1.1fr] lg:gap-10">
          <div className="sm:col-span-2 lg:col-span-1">
            <Link
              to="/"
              aria-label="PINDAI, beranda"
              className="inline-flex min-h-11 items-center gap-2.5"
            >
              <VaultLogo size={32} />
              <span className="text-sm font-semibold tracking-[0.16em]">
                PINDAI
              </span>
            </Link>
            <p className="mt-3 max-w-sm text-sm leading-6 text-muted-foreground">
              {deskripsi}
            </p>
            <address className="mt-4 not-italic">
              <p className="flex items-start gap-1.5 text-xs leading-5 text-muted-foreground">
                <MapPin
                  className="mt-0.5 size-3.5 shrink-0 text-primary"
                  aria-hidden="true"
                />
                {ALAMAT_KANTOR_PINDAI}
              </p>
              <a
                href={`mailto:${EMAIL_RESMI_PINDAI}`}
                className="inline-flex min-h-11 items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-primary focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Mail className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
                {EMAIL_RESMI_PINDAI}
              </a>
            </address>
            <a
              href={urlChatCs(
                "Halo PINDAI, saya ingin bertanya tentang layanan.",
              )}
              target="_blank"
              rel="noreferrer"
              className="mt-5 flex max-w-sm items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-primary">
                <IkonWhatsapp className="size-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-foreground">
                  Chat CS di WhatsApp
                </span>
                <span className="block text-xs leading-5 text-muted-foreground">
                  Kanal bantuan resmi PINDAI
                </span>
              </span>
            </a>
          </div>

          <KolomTautan judul="Produk" tautan={PRODUK} />
          <KolomTautan judul="Panduan" tautan={PANDUAN} />
          <KolomTautan judul="Bantuan & legal" tautan={BANTUAN} />
        </div>

        <div className="mt-8 flex flex-col gap-3 border-t border-border pt-6 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            {PENAFIAN_PINDAI}
          </p>
          <p className="shrink-0 text-xs leading-5 text-muted-foreground sm:text-right">
            {HAK_CIPTA_PINDAI}
            <br />
            Ketentuan {CONTRACT_TERMS_VERSION}
          </p>
        </div>
      </div>
    </footer>
  );
}
