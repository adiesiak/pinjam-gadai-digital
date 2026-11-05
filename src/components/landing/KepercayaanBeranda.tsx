/**
 * Strip kepercayaan di bawah hero.
 *
 * Versi sebelumnya menumpuk tiga kolom penjelasan panjang sebelum produk,
 * sehingga pengunjung harus melewati materi legal sebelum melihat layanan.
 * Strip ini menyimpan fakta yang sama dalam satu baris ringkas; penafian
 * lengkap tetap ada di footer dan halaman syarat.
 */
import { ArrowRight, Building2, Mail, MapPin, Scale } from "lucide-react";
import { Link } from "react-router";

import { IkonWhatsapp } from "@/components/IkonWhatsapp";
import {
  ALAMAT_KANTOR_PINDAI,
  EMAIL_RESMI_PINDAI,
  NAMA_ENTITAS_PINDAI,
} from "@/lib/branding";
import { urlChatCs } from "@/lib/kontak";

const KELAS_TAUTAN =
  "inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-foreground underline-offset-4 hover:text-primary hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function KepercayaanBeranda() {
  return (
    <section
      aria-labelledby="kepercayaan-judul"
      className="border-t border-border bg-background"
    >
      <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <h2
              id="kepercayaan-judul"
              className="text-sm font-semibold text-foreground"
            >
              Kepercayaan &amp; batas layanan
            </h2>
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Building2
                className="size-4 shrink-0 text-primary"
                aria-hidden="true"
              />
              {NAMA_ENTITAS_PINDAI}
            </p>
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Scale
                className="size-4 shrink-0 text-primary"
                aria-hidden="true"
              />
              Pencatatan, bukan bukti transfer.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <Link to="/syarat-ketentuan" className={KELAS_TAUTAN}>
              Syarat &amp; ketentuan
              <ArrowRight className="size-4 text-primary" aria-hidden="true" />
            </Link>
            <Link to="/privasi" className={KELAS_TAUTAN}>
              Privasi
            </Link>
            <a
              href={urlChatCs(
                "Halo PINDAI, saya ingin menanyakan batas layanan aplikasi.",
              )}
              target="_blank"
              rel="noreferrer"
              className={KELAS_TAUTAN}
            >
              <IkonWhatsapp className="size-4 text-primary" aria-hidden="true" />
              Chat CS
            </a>
          </div>
        </div>

        <div className="mt-2 flex flex-col gap-x-6 gap-y-1 border-t border-border pt-2.5 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-start gap-2">
            <MapPin
              className="mt-0.5 size-4 shrink-0 text-primary"
              aria-hidden="true"
            />
            <span>
              <span className="font-semibold text-foreground">Kantor</span> ·{" "}
              {ALAMAT_KANTOR_PINDAI}
            </span>
          </p>
          <a
            href={`mailto:${EMAIL_RESMI_PINDAI}`}
            className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-muted-foreground underline-offset-4 hover:text-primary hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Mail className="size-4 shrink-0 text-primary" aria-hidden="true" />
            {EMAIL_RESMI_PINDAI}
          </a>
        </div>
      </div>
    </section>
  );
}
