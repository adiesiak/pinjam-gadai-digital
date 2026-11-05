/**
 * Empat pertanyaan yang paling sering muncul sebelum orang membuat akun.
 *
 * Jawaban yang menyebut angka memakai tarif dari Pengaturan Parameter Bisnis
 * (`rincianPotonganDiMuka`), bukan persentase yang disalin ke JSX. Jawaban
 * lengkap tetap di `/faq`; bagian ini hanya pintu masuknya.
 */
import { ArrowRight } from "lucide-react";
import { Link } from "react-router";

import { IkonWhatsapp } from "@/components/IkonWhatsapp";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { urlChatCs } from "@/lib/kontak";
import type { TarifBiaya } from "@/lib/loan";
import { rincianPotonganDiMuka } from "@/lib/tarifBiayaTeks";

import { JudulBagian } from "./JudulBagian";

function daftarTanya(tarif: TarifBiaya) {
  return [
    {
      q: "Apakah PINDAI mengirim uang ke rekening saya?",
      a: "Pencairan dilakukan tim PINDAI di luar aplikasi setelah pengajuan disetujui. Aplikasi mencatat pengajuan, perhitungan, dan statusnya; tidak ada transfer otomatis dari dalam aplikasi.",
    },
    {
      q: "Kapan biaya dipotong?",
      a: `Potongan di muka dihitung dari pokok: ${rincianPotonganDiMuka(tarif)}. Sisanya adalah dana bersih yang diterima.`,
    },
    {
      q: "Bagaimana kalau saya terlambat atau tidak bisa membayar?",
      a: "Keterlambatan dihitung per hari dari pokok angsuran dan dibatasi pagu denda yang tertulis di rincian pinjaman dan perjanjian. Bila Anda tidak mampu membayar, hubungi CS sebelum jatuh tempo; penanganannya mengikuti perjanjian, bukan denda tambahan di luar itu.",
    },
    {
      q: "Siapa yang bisa melihat data saya?",
      a: "Data akun dan pengajuan hanya dibuka untuk akun terkait dan tim PINDAI. Akses pihak lain dibatasi pada data yang diperlukan untuk penempatan dana.",
    },
  ] as const;
}

export function FaqBeranda({
  judul,
  deskripsi,
  tarif,
}: {
  judul: string;
  deskripsi: string;
  tarif: TarifBiaya;
}) {
  const daftar = daftarTanya(tarif);

  return (
    <section
      aria-labelledby="faq-beranda-judul"
      className="border-t border-border bg-background"
    >
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-10 sm:px-6 sm:py-18 sm:gap-8 lg:grid-cols-[0.7fr_1.3fr] lg:gap-14">
        <div>
          <JudulBagian
            id="faq-beranda-judul"
            nomor="05"
            label="Pertanyaan umum"
            judul={judul}
            deskripsi={deskripsi}
            className="border-t-0 pt-0"
            deskripsiClassName="max-w-sm"
          />
          <Link
            to="/faq"
            className="mt-4 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-primary underline underline-offset-4"
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
              <AccordionItem key={item.q} value={`faq-${i}`}>
                <AccordionTrigger className="min-h-14 text-sm font-semibold text-foreground">
                  {item.q}
                </AccordionTrigger>
                <AccordionContent className="text-sm leading-6 text-muted-foreground">
                  {item.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
          <a
            href={urlChatCs(
              "Halo PINDAI, saya belum menemukan jawaban di pertanyaan umum.",
            )}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-semibold text-primary hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <IkonWhatsapp className="size-4" aria-hidden="true" />
            Belum terjawab? Chat CS
          </a>
        </div>
      </div>
    </section>
  );
}
