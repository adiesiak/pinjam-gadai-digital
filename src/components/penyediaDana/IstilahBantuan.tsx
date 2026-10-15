import { HelpCircle } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * Ikon `?` kecil di samping istilah teknis, dengan tooltip penjelasan singkat.
 *
 * Kenapa ada: istilah seperti "dibukukan", "perkiraan", dan "potongan di muka"
 * menentukan arti angka di kartu rekap pendana. Tanpa keterangan, pembaca harus
 * menebak mana uang yang sudah benar-benar menjadi haknya dan mana yang masih
 * hitungan. Penjelasan ditaruh di tooltip supaya kalimat kartu tetap pendek.
 *
 * Aksesibilitas: `TooltipTrigger` bawaan Radix membuka pada HOVER **dan** FOKUS
 * keyboard, dan tombolnya diberi `aria-label` — jadi keterangan ini tidak pernah
 * hanya bisa dicapai dengan tetikus. Isi penting tetap tertulis di kartu; tooltip
 * hanya menambah, bukan menggantikan.
 *
 * Murni presentasional (tanpa Convex) supaya bisa dipakai di panel mana pun.
 */
export function IstilahBantuan({
  istilah,
  penjelasan,
}: {
  /** Nama istilah yang dijelaskan — dipakai untuk `aria-label`. */
  istilah: string;
  /** Kalimat penjelasan singkat (satu-dua baris). */
  penjelasan: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={`Penjelasan ${istilah}`}
          className="inline-flex size-4 shrink-0 items-center justify-center rounded-full text-slate-500 transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1"
        >
          <HelpCircle className="size-3.5" aria-hidden />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{penjelasan}</TooltipContent>
    </Tooltip>
  );
}
