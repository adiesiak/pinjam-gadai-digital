import { ShieldCheck } from "lucide-react";

/**
 * Untuk apa bagian admin dipakai — bukan hanya berapa besarnya.
 *
 * Pendana melihat "Potongan admin (dari uang kembali)" di banyak tempat;
 * kotak ini menjelaskan tujuannya: menopang server & operasional, penagihan
 * lapangan (collect), dan asuransi yang menjamin pokok pinjaman beserta Imbal
 * Hasilnya cair ke pendana dalam 14 hari kerja. Selalu tampil (tidak
 * bergantung pada ada tidaknya rekap pendana) karena ini keterangan kebijakan,
 * bukan angka.
 *
 * Murni presentasional — tanpa Convex — supaya bisa dirender langsung oleh uji
 * markup (`CatatanPotonganAdmin.render.test.tsx`).
 *
 * Permukaannya `glass-note` — kaca yang opasitasnya lebih tinggi daripada
 * kartu biasa (blur 6 px) supaya kalimat panjang tetap nyaman dibaca. Garis
 * emas di tepi kiri dipindah menjadi elemen di dalam kotak, karena tepi
 * `glass-note` sendiri sudah memakai warna tepi bawaan kelas itu.
 */
export function CatatanPotonganAdmin({ persen }: { persen: number }) {
  const baris = [
    "Server & operasional PINDAI — biaya sistem, penyimpanan berkas, dan pemantauan lokasi.",
    "Collect / penagihan lapangan untuk pinjaman yang lewat jatuh tempo, supaya Imbal Hasil tetap terkejar.",
    "Asuransi — jaminan pokok pinjaman maupun Imbal Hasilnya cair ke pendana dalam 14 hari kerja.",
  ];
  return (
    <section className="animate-masuk glass-note relative mt-3 max-w-3xl overflow-hidden rounded-2xl border px-5 py-4 shadow-sm">
      <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-gold" />
      <p className="inline-flex items-center gap-2 text-xs font-semibold text-navy">
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
