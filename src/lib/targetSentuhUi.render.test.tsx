/**
 * Penjaga target sentuh pada permukaan yang paling sering dipakai.
 *
 * Run: bun src/lib/targetSentuhUi.render.test.tsx
 *
 * `registerPonsel.test.ts` membaca seluruh sumber dan melaporkan ruang ketuk
 * kecil sebagai utang. Uji ini mengambil sampel yang dirender (landing, bilah
 * navigasi peminjam, kalkulator publik) dan menuntut setiap tautan/tombol di
 * sampel itu punya tinggi 44px di ponsel. Sampelnya sengaja kecil supaya
 * kegagalan menunjuk elemen yang benar, bukan daftar panjang tanpa pemilik.
 *
 * Batas: uji ini membaca kelas, bukan piksel. Elemen yang tingginya berasal dari
 * pembungkus atau CSS lain tetap perlu dilihat di peramban.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";

import { LandingHero } from "@/components/landing/LandingHero";
import { LiveCalculator } from "@/components/landing/LiveCalculator";
import {
  DashboardBottomNav,
  DashboardTabNav,
} from "@/pages/dashboard/dashboard-tab-nav";

function render(node: React.ReactNode): string {
  return renderToStaticMarkup(<MemoryRouter>{node}</MemoryRouter>);
}

function kelasDari(tag: string): string {
  return /class="([^"]*)"/.exec(tag)?.[1] ?? "";
}

function cukupBesar(kelas: string): boolean {
  return /(?:^|\s)(?:min-h-(?:11|12|24)|h-(?:11|12|24)|size-11)(?:\s|$)/.test(
    kelas,
  );
}

let diperiksa = 0;
let gagal = 0;

function periksaTarget(html: string, nama: string): void {
  const target = [...html.matchAll(/<(a|button)\b[^>]*>/g)].map(
    (cocok) => cocok[0],
  );
  for (const tag of target) {
    diperiksa += 1;
    if (!cukupBesar(kelasDari(tag))) {
      gagal += 1;
      console.error(`GAGAL ${nama}: target tanpa tinggi 44px\n  ${tag}`);
    }
  }
}

const hero = render(
  <LandingHero
    eyebrow="PINDAI · Pinjaman dan Gadai Digital"
    judul1="Solusi Finansial, Lebih Jelas"
    judul2="dalam Genggaman."
    deskripsi="Deskripsi hero."
    ctaUtama={{ label: "Ajukan Sekarang", href: "/auth" }}
    ctaSekunder={{ label: "Pelajari Cara Kerja", href: "/biaya" }}
    mikro="Informasi biaya mengikuti produk yang berlaku."
    sudahMasuk={false}
  />,
);
periksaTarget(hero, "LandingHero");

const kalkulator = render(<LiveCalculator />);
periksaTarget(kalkulator, "LiveCalculator");

const navSamping = render(
  <DashboardTabNav activeTab="ringkasan" onTabChange={() => {}} />,
);
periksaTarget(navSamping, "DashboardTabNav");

const navBawah = render(
  <DashboardBottomNav activeTab="ringkasan" onTabChange={() => {}} />,
);
periksaTarget(navBawah, "DashboardBottomNav");

console.log(
  `\ntargetSentuhUi: ${diperiksa} target diperiksa, ${gagal} gagal`,
);
if (gagal > 0) process.exit(1);
