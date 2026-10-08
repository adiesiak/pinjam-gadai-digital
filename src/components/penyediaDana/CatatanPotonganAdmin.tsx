import { ShieldCheck } from "lucide-react";

/**
 * Untuk apa bagian admin dipakai — bukan hanya berapa besarnya.
 *
 * Penyedia dana melihat "Potongan admin (dari uang kembali)" di banyak tempat;
 * kotak ini menjelaskan tujuannya: menopang server & operasional, penagihan
 * lapangan (collect), dan asuransi yang menjamin pokok pinjaman beserta Imbal
 * Hasilnya cair ke penyedia dana dalam 14 hari kerja. Selalu tampil (tidak
 * bergantung pada ada tidaknya rekap pendana) karena ini keterangan kebijakan,
 * bukan angka.
 *
 * Murni presentasional — tanpa Convex — supaya bisa dirender langsung oleh uji
 * markup (`CatatanPotonganAdmin.render.test.tsx`).
 */
export function CatatanPotonganAdmin({ persen }: { persen: number }) {
  const baris = [
    "Server & operasional PINDAI — biaya sistem, penyimpanan berkas, dan pemantauan lokasi.",
    "Collect / penagihan lapangan untuk pinjaman yang lewat jatuh tempo, supaya Imbal Hasil tetap terkejar.",
    "Asuransi — jaminan pokok pinjaman maupun Imbal Hasilnya cair ke penyedia dana dalam 14 hari kerja.",
  ];
  return (
    <section className="animate-masuk mt-3 max-w-3xl rounded-2xl border border-slate-200 bg-white px-5 py-4">
      <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-900">
        <ShieldCheck className="size-3.5 shrink-0 text-primary" aria-hidden />
        Potongan admin {persen}% bukan sekadar biaya — keperluan inilah yang dibiayai
      </p>
      <ul className="mt-2 space-y-1.5 text-xs leading-6 text-muted-foreground">
        {baris.map((teks) => (
          <li key={teks} className="flex gap-2">
            <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-primary" />
            <span>{teks}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
