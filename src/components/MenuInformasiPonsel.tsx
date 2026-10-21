import { Menu } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router";

import { cn } from "@/lib/utils";

export type TautanMenuPonsel = {
  href: string;
  label: string;
  /** Halaman yang sedang dibuka: ditandai `aria-current="page"`. */
  aktif?: boolean;
};

export interface MenuInformasiPonselProps {
  tautan: ReadonlyArray<TautanMenuPonsel>;
  /** Kelas tombol pemicu; tiap halaman punya warna tepi dan cincin sendiri. */
  kelasTombol: string;
  /** Kelas panel; sudah termasuk posisi absolut di bawah tombol. */
  kelasPanel: string;
  kelasTautan: string;
  /** Tambahan untuk tautan halaman aktif, bila halaman itu membutuhkannya. */
  kelasTautanAktif?: string;
}

/**
 * Menu informasi untuk layar kecil.
 *
 * Sebelumnya tiap halaman memakai `<details>`: menu tetap terbuka setelah satu
 * tautan dipilih, dan Escape tidak menutupnya, sehingga satu tujuan butuh dua
 * ketukan di ponsel. Perilaku tutupnya kini satu tempat; tiap halaman hanya
 * memasok kelas warna dan daftar tautannya.
 */
export function MenuInformasiPonsel({
  tautan,
  kelasTombol,
  kelasPanel,
  kelasTautan,
  kelasTautanAktif,
}: MenuInformasiPonselProps) {
  const [terbuka, setTerbuka] = useState(false);
  const wadah = useRef<HTMLDivElement>(null);
  const idPanel = useId();
  const tutup = () => setTerbuka(false);

  useEffect(() => {
    if (!terbuka) return;
    const saatTombol = (event: KeyboardEvent) => {
      if (event.key === "Escape") setTerbuka(false);
    };
    const saatKlikLuar = (event: PointerEvent) => {
      const sasaran = event.target as Node | null;
      if (sasaran !== null && wadah.current?.contains(sasaran) !== true) {
        setTerbuka(false);
      }
    };
    window.addEventListener("keydown", saatTombol);
    window.addEventListener("pointerdown", saatKlikLuar);
    return () => {
      window.removeEventListener("keydown", saatTombol);
      window.removeEventListener("pointerdown", saatKlikLuar);
    };
  }, [terbuka]);

  return (
    <div ref={wadah} className="relative lg:hidden">
      <button
        type="button"
        onClick={() => setTerbuka((sebelumnya) => !sebelumnya)}
        aria-expanded={terbuka}
        aria-controls={idPanel}
        aria-label={terbuka ? "Tutup menu informasi" : "Buka menu informasi"}
        className={kelasTombol}
      >
        <Menu className="size-5" aria-hidden="true" />
      </button>
      {terbuka && (
        <nav
          id={idPanel}
          aria-label="Menu informasi"
          className={kelasPanel}
        >
          {tautan.map((item) => (
            <Link
              key={item.href}
              to={item.href}
              onClick={tutup}
              aria-current={item.aktif ? "page" : undefined}
              className={cn(
                kelasTautan,
                item.aktif === true ? kelasTautanAktif : undefined,
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}
