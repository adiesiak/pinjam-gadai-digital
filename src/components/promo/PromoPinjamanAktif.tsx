import { useQuery } from "convex/react";

import { api } from "@/convex/_generated/api";
import type { PenempatanPromo } from "@/lib/promoPinjaman";

import { PromoPinjamanKartu } from "./PromoPinjamanKartu";

/**
 * Kampanye yang sedang berjalan untuk satu penempatan, atau tidak ada apa pun.
 *
 * `undefined` (query belum termuat) dan `null` (tidak ada kampanye) sama-sama
 * tidak menggambar apa-apa: banner tidak boleh muncul sebagai kerangka kosong
 * yang menggeser isi halaman begitu data tiba.
 */
export function PromoPinjamanAktif({
  penempatan,
  onAjukan,
  className,
}: {
  penempatan: PenempatanPromo;
  onAjukan?: () => void;
  className?: string;
}) {
  const promo = useQuery(api.promoPinjaman.promoAktif, { penempatan });

  if (promo === undefined || promo === null || typeof promo.judul !== "string") {
    return null;
  }

  return (
    <PromoPinjamanKartu
      promo={promo}
      penempatan={penempatan}
      onAjukan={onAjukan}
      className={className}
    />
  );
}
