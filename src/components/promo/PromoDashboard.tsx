/**
 * Satu banner promo untuk Ringkasan dashboard.
 *
 * Dulu dua banner tampil berurutan: kampanye teks dan promo bunga. Dua-duanya
 * mendorong tombol "Ajukan", sehingga perhatian terbelah dan tagihan aktif
 * terdorong ke bawah. Di sini promo bunga didahulukan karena angkanya yang
 * benar-benar dipakai mesin harga; kampanye teks hanya muncul bila tidak ada
 * promo bunga aktif.
 */
import { useQuery } from "convex/react";

import { PromoBungaAktif } from "@/components/promo/PromoBungaAktif";
import { PromoPinjamanAktif } from "@/components/promo/PromoPinjamanAktif";
import { api } from "@/convex/_generated/api";

export function PromoDashboard({
  onAjukan,
  className,
}: {
  onAjukan: () => void;
  className?: string;
}) {
  const bunga = useQuery(api.promoBunga.berjalan, {});

  // Data promo bunga belum termuat: jangan menampilkan kampanye teks lalu
  // menukarnya dengan banner bunga sedetik kemudian.
  if (bunga === undefined) return null;
  if (bunga.length > 0) {
    return <PromoBungaAktif onAjukan={onAjukan} className={className} />;
  }
  return <PromoPinjamanAktif penempatan="dashboard" onAjukan={onAjukan} className={className} />;
}
