/**
 * Strip kepercayaan di bawah hero.
 *
 * Isinya sengaja hanya fakta yang sudah dipakai di dokumen resmi: nama badan,
 * penafian layanan, dan kanal bantuan. Tidak ada nomor izin, alamat, atau mitra
 * yang dikarang di sini; bila data itu belum tersedia, jangan menampilkannya.
 */
import { ArrowRight, Building2, FileCheck2, Scale } from "lucide-react";
import { Link } from "react-router";

import { IkonWhatsapp } from "@/components/IkonWhatsapp";
import { NAMA_ENTITAS_PINDAI, PENAFIAN_PINDAI } from "@/lib/branding";
import { CONTRACT_TERMS_VERSION } from "@/lib/contract";
import { urlChatCs } from "@/lib/kontak";

export function KepercayaanBeranda() {
  return (
    <section
      aria-labelledby="kepercayaan-judul"
      className="border-y border-border bg-muted/40"
    >
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <h2
            id="kepercayaan-judul"
            className="text-sm font-semibold text-foreground"
          >
            Kepercayaan &amp; batas layanan
          </h2>
          <p className="text-xs leading-5 text-muted-foreground">
            Ringkasan; ketentuan lengkap ada di halaman syarat.
          </p>
        </div>

        <ul className="mt-4 grid gap-3 md:grid-cols-3">
          <li className="rounded-xl border border-border bg-card p-4">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-gold-foreground">
              <Building2 className="size-4 text-primary" aria-hidden="true" />
              Entitas
            </p>
            <p className="mt-3 text-sm font-semibold text-foreground">
              {NAMA_ENTITAS_PINDAI}
            </p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {PENAFIAN_PINDAI} Pinjaman didanai pendana yang tercatat.
            </p>
          </li>

          <li className="rounded-xl border border-border bg-card p-4">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-gold-foreground">
              <Scale className="size-4 text-primary" aria-hidden="true" />
              Batas layanan
            </p>
            <p className="mt-3 text-sm font-semibold text-foreground">
              Pencatatan, bukan bukti transfer.
            </p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              PINDAI tidak memindahkan dana secara otomatis. Pencairan dan serah
              terima barang ditangani di luar aplikasi.
            </p>
          </li>

          <li className="rounded-xl border border-border bg-card p-4">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-gold-foreground">
              <FileCheck2 className="size-4 text-primary" aria-hidden="true" />
              Dokumen &amp; bantuan
            </p>
            <div className="mt-1 divide-y divide-border">
              <Link
                to="/syarat-ketentuan"
                className="flex min-h-11 items-center justify-between gap-2 text-sm font-semibold text-foreground hover:text-primary focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Syarat &amp; ketentuan
                <ArrowRight className="size-4 text-primary" aria-hidden="true" />
              </Link>
              <Link
                to="/privasi"
                className="flex min-h-11 items-center justify-between gap-2 text-sm font-semibold text-foreground hover:text-primary focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Kebijakan privasi
                <ArrowRight className="size-4 text-primary" aria-hidden="true" />
              </Link>
              <a
                href={urlChatCs(
                  "Halo PINDAI, saya ingin menanyakan batas layanan aplikasi.",
                )}
                target="_blank"
                rel="noreferrer"
                className="flex min-h-11 items-center justify-between gap-2 text-sm font-semibold text-foreground hover:text-primary focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="inline-flex items-center gap-1.5">
                  <IkonWhatsapp className="size-4 text-primary" aria-hidden="true" />
                  Chat CS
                </span>
                <ArrowRight className="size-4 text-primary" aria-hidden="true" />
              </a>
            </div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              Ketentuan versi {CONTRACT_TERMS_VERSION}.
            </p>
          </li>
        </ul>
      </div>
    </section>
  );
}
