import { TriangleAlert } from "lucide-react";
import { Component, type ReactNode } from "react";

import { Button } from "@/components/ui/button";

/**
 * Batas galat untuk bagian landing yang opsional.
 *
 * Promo dan demo punya query/chunk sendiri. Kalau salah satunya gagal, hero,
 * kalkulator, dan formulir tetap harus bisa dibaca — jangan menyeret seluruh
 * halaman ke layar galat karena satu bagian tambahan.
 */
export class BatasLanding extends Component<
  { nama: string; children: ReactNode; cadangan?: ReactNode },
  { gagal: boolean }
> {
  state = { gagal: false };

  static getDerivedStateFromError() {
    return { gagal: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(
      `[PINDAI] Bagian landing "${this.props.nama}" gagal dimuat:`,
      error,
      info.componentStack,
    );
  }

  render() {
    if (!this.state.gagal) return this.props.children;
    if (this.props.cadangan !== undefined) return this.props.cadangan;
    return (
      <div
        role="status"
        className="mx-auto mt-4 flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-amber-300/70 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-950"
      >
        <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          Bagian {this.props.nama} tidak bisa dimuat sekarang. Bagian lain tetap
          bisa dibaca.
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="min-h-11 border-amber-300 bg-card text-xs text-amber-950"
          onClick={() => window.location.reload()}
        >
          Muat ulang
        </Button>
      </div>
    );
  }
}
