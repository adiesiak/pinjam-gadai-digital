/**
 * Bilah aksi lengket untuk layar sempit.
 *
 * Di ponsel tombol hero cepat hilang setelah pengunjung menggulir. Bilah ini
 * menjaga dua aksi yang sama tetap terjangkau tanpa menutupi isi: halaman
 * menambahkan ruang bawah sendiri (`pb-24 sm:pb-0`). Bilah berhenti saat
 * penutup atau footer masuk, jadi tautan footer tidak tertutup. Hanya tampil
 * di bawah breakpoint `sm`, dan tidak ikut tercetak.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router";

import { Button } from "@/components/ui/button";

export function CtaLengket({
  href,
  label,
  onClick,
}: {
  href: string;
  label: string;
  onClick?: () => void;
}) {
  // Mulai tersembunyi agar bilah tidak berkedip di atas hero pada paint
  // pertama. Setelah hidrasi, observer menampilkannya hanya setelah hero lewat
  // dan menyembunyikannya lagi saat penutup atau footer masuk. Browser tanpa
  // IntersectionObserver langsung mendapat aksinya.
  const [tampil, setTampil] = useState(
    () => typeof IntersectionObserver === "undefined",
  );

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const hero = document.getElementById("hero-judul");
    const penutup = document.getElementById("penutup-judul");
    const footer = document.getElementById("footer-beranda");
    if (hero === null && penutup === null && footer === null) return;

    let heroTerlihat = false;
    let penutupTerlihat = false;
    let footerTerlihat = false;
    const perbarui = () =>
      setTampil(!heroTerlihat && !penutupTerlihat && !footerTerlihat);
    const pengamat = new IntersectionObserver(
      (entri) => {
        for (const satu of entri) {
          if (satu.target === hero) heroTerlihat = satu.isIntersecting;
          if (satu.target === penutup) penutupTerlihat = satu.isIntersecting;
          if (satu.target === footer) footerTerlihat = satu.isIntersecting;
        }
        perbarui();
      },
      { threshold: 0.01 },
    );
    if (hero !== null) pengamat.observe(hero);
    if (penutup !== null) pengamat.observe(penutup);
    if (footer !== null) pengamat.observe(footer);
    return () => pengamat.disconnect();
  }, []);

  if (!tampil) return null;

  return (
    <nav
      aria-label="Aksi cepat"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background pb-[calc(env(safe-area-inset-bottom)+0.6rem)] pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] pt-2.5 sm:hidden print:hidden"
    >
      <div className="mx-auto flex max-w-md items-center gap-2">
        <Button
          asChild
          className="min-h-11 flex-1 bg-primary px-4 text-primary-foreground hover:bg-primary/90"
        >
          <Link to={href} onClick={onClick}>
            {label}
          </Link>
        </Button>
        <Button asChild variant="outline" className="min-h-11 px-4">
          <Link to="/biaya">Lihat biaya</Link>
        </Button>
      </div>
    </nav>
  );
}
