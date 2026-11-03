import { ArrowRight, ArrowUpRight } from "lucide-react";
import { Link } from "react-router";

import { IkonWhatsapp } from "@/components/IkonWhatsapp";
import { JudulBagian } from "@/components/landing/JudulBagian";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { urlChatCs } from "@/lib/kontak";

export type ItemFaqLayanan = {
  q: string;
  a: string;
};

export interface FaqLayananProps {
  /** Awalan id agar beberapa blok FAQ tidak bertabrakan bila dipasang bersama. */
  id: string;
  label?: string;
  judul: string;
  deskripsi: string;
  daftar: readonly ItemFaqLayanan[];
  /** Konteks yang sudah terisi di WhatsApp; jangan masukkan data pribadi. */
  pesanChat: string;
}

/**
 * FAQ kontekstual untuk halaman layanan.
 *
 * Pertanyaan lengkap tetap tinggal di `/faq`; blok ini hanya menjawab hal yang
 * paling dekat dengan keputusan di halaman ini. Bantuan chat ditempatkan
 * setelah jawaban, bukan sebagai gelembung yang menutupi konten.
 */
export function FaqLayanan({
  id,
  label = "Pertanyaan umum",
  judul,
  deskripsi,
  daftar,
  pesanChat,
}: FaqLayananProps) {
  const idJudul = `${id}-judul`;

  return (
    <section
      aria-labelledby={idJudul}
      className="border-t border-border bg-muted/35"
    >
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[0.78fr_1.22fr] lg:gap-12">
        <div>
          <JudulBagian
            id={idJudul}
            label={label}
            judul={judul}
            deskripsi={deskripsi}
            className="border-t-0 pt-0"
          />
          <Link
            to="/faq"
            className="mt-4 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-primary underline underline-offset-4 focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Semua pertanyaan
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>

        <div>
          <Accordion
            type="single"
            collapsible
            className="rounded-2xl border border-border bg-card px-5"
          >
            {daftar.map((item, i) => (
              <AccordionItem key={item.q} value={`${id}-${i}`}>
                <AccordionTrigger className="min-h-12 text-left text-sm font-semibold text-foreground">
                  {item.q}
                </AccordionTrigger>
                <AccordionContent className="text-sm leading-6 text-muted-foreground">
                  {item.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>

          <div className="mt-3 flex flex-col gap-3 rounded-2xl border border-gold/40 bg-card p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-primary">
                <IkonWhatsapp className="size-5" />
              </span>
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Belum menemukan jawaban?
                </p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Chat CS di WhatsApp. Jangan kirim kata sandi atau kode OTP
                  melalui chat.
                </p>
              </div>
            </div>
            <a
              href={urlChatCs(pesanChat)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              Chat CS di WhatsApp
              <ArrowUpRight className="size-4" aria-hidden="true" />
            </a>
          </div>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            Tautan membuka WhatsApp di tab baru.
          </p>
        </div>
      </div>
    </section>
  );
}
