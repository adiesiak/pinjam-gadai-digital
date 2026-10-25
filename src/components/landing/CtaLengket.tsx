/**
 * Bilah aksi lengket untuk layar sempit.
 *
 * Di ponsel tombol hero cepat hilang setelah pengunjung menggulir. Bilah ini
 * menjaga dua aksi yang sama tetap terjangkau tanpa menutupi isi: halaman
 * menambahkan ruang bawah sendiri (`pb-24 sm:pb-0`). Hanya tampil di bawah
 * breakpoint `sm`, dan tidak ikut tercetak.
 */
import { Link } from "react-router";

import { Button } from "@/components/ui/button";

export function CtaLengket({ href, label }: { href: string; label: string }) {
  return (
    <nav
      aria-label="Aksi cepat"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 px-3 pb-[calc(env(safe-area-inset-bottom)+0.6rem)] pt-2.5 backdrop-blur sm:hidden print:hidden"
    >
      <div className="mx-auto flex max-w-md items-center gap-2">
        <Button
          asChild
          className="min-h-11 flex-1 bg-primary px-4 text-primary-foreground hover:bg-primary/90"
        >
          <Link to={href}>{label}</Link>
        </Button>
        <Button asChild variant="outline" className="min-h-11 px-4">
          <Link to="/biaya">Hitung</Link>
        </Button>
      </div>
    </nav>
  );
}
