import { Link } from "react-router";

import {
  KELIPATAN_TIKET_PENDANA,
  judulDoorprizeKuartal,
  kuartalDariWaktu,
  labelTanggalUndianKuartal,
} from "@/lib/doorprize";
import { TENOR_OPTIONS } from "@/lib/loan";
import { formatRupiah } from "@/lib/money";

export interface DoorprizeRingkasProps {
  /** Tujuan tombol: dashboard bila sudah masuk, halaman masuk bila belum. */
  accountHref: string;
  sudahMasuk: boolean;
  /** Waktu acuan. Hanya diisi uji supaya kuartal yang dibaca tidak bergeser. */
  waktu?: number;
}

/**
 * Waktu saat bundel dimuat.
 *
 * Dibaca di luar komponen supaya render tetap murni (aturan `react-hooks`
 * menolak `Date.now()` di badan render). Selama halaman terbuka, kuartal tidak
 * berganti; kalau pengunjung melewati pergantian kuartal, muat ulang halaman
 * akan membaca periode baru.
 */
const WAKTU_MUAT = Date.now();

/** Tenor peminjam yang berhak atas tiket, dibaca dari daftar tenor mesin. */
const TENOR_TIKET = `${TENOR_OPTIONS.slice(0, -1).join(", ")}, atau ${
  TENOR_OPTIONS[TENOR_OPTIONS.length - 1]
}`;

/**
 * Ringkasan doorprize triwulanan.
 *
 * Periode, tanggal undian, dan kelipatan tiket semuanya dihitung dari
 * `lib/doorprize`; tidak ada tanggal atau nominal yang ditulis di sini. Batas
 * anggaran hadiah sengaja tidak disebut: itu urusan admin, bukan alasan orang
 * meminjam atau menempatkan dana.
 */
export function DoorprizeRingkas({
  accountHref,
  sudahMasuk,
  waktu,
}: DoorprizeRingkasProps) {
  const kuartal = kuartalDariWaktu(waktu ?? WAKTU_MUAT);
  const tanggalUndian = labelTanggalUndianKuartal(kuartal);

  return (
    <section
      aria-labelledby="doorprize-ringkas-judul"
      className="border-t border-border"
    >
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-14 sm:px-6 sm:py-18 lg:grid-cols-[1.25fr_0.75fr] lg:items-start">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
            Doorprize triwulanan
          </p>
          <h2
            id="doorprize-ringkas-judul"
            className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl"
          >
            {judulDoorprizeKuartal(kuartal)}
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
            Tiket terkumpul otomatis selama kuartal berjalan, lalu diundi pada
            akhir kuartal. Tiket kuartal berikutnya mulai dari nol.
          </p>

          <ul className="mt-6 grid gap-5 sm:grid-cols-2">
            <li className="border-t border-border pt-4">
              <p className="font-display text-2xl leading-none tabular-nums text-slate-900">
                +1 tiket
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Tiap pinjaman yang dilunasi penuh tepat waktu, tenor{" "}
                {TENOR_TIKET} hari.
              </p>
            </li>
            <li className="border-t border-border pt-4">
              <p className="font-display text-2xl leading-none tabular-nums text-slate-900">
                +1 tiket
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Tiap kelipatan {formatRupiah(KELIPATAN_TIKET_PENDANA)}{" "}
                penempatan dana pendana yang aktif.
              </p>
            </li>
          </ul>
        </div>

        <div className="min-w-0 border-t border-border pt-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">
            Undian kuartal ini
          </p>
          <p className="mt-2 font-display text-xl leading-7 text-slate-900">
            {tanggalUndian}
          </p>
          <Link
            to={accountHref}
            className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-primary underline underline-offset-4 focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {sudahMasuk ? "Buka tiket di dashboard" : "Masuk untuk melihat tiket"}
          </Link>
        </div>
      </div>
    </section>
  );
}
