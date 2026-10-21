/**
 * Pita biaya di beranda: satu ringkasan potongan di muka yang benar-benar
 * berlaku, dibaca dari Pengaturan Parameter Bisnis.
 *
 * Dipisah dari `pages/LandingHome` supaya bisa dirender statis di uji dan
 * supaya halaman tidak menumbuhkan blok presentasi lain. Komponen ini tidak
 * mengambil data sendiri: tarifnya datang dari pemanggil, jadi tidak ada angka
 * bawaan kedua yang bisa berbeda dengan formulir pengajuan.
 */
import { Link } from "react-router";

import { Button } from "@/components/ui/button";
import type { TarifBiaya } from "@/lib/loan";
import {
  adaBiayaEkspres,
  persenTeks,
  rentangEkspres,
} from "@/lib/tarifBiayaTeks";

export function BiayaBerlaku({ tarif }: { tarif: TarifBiaya }) {
  const baris = [
    {
      label: "Biaya admin",
      nilai: `${persenTeks(tarif.adminPersen)} dari pokok`,
      keterangan: "Dipotong dari dana yang dicairkan, bukan ditagih belakangan.",
    },
    {
      label: "Asuransi",
      nilai:
        tarif.asuransiPersen > 0
          ? `${persenTeks(tarif.asuransiPersen)} dari pokok`
          : "Tidak dipungut",
      keterangan:
        tarif.asuransiPersen > 0
          ? "Dipotong bersama biaya admin saat pencairan."
          : "Tidak ada potongan asuransi pada pencairan.",
    },
    {
      label: "Pencairan ekspres",
      nilai: adaBiayaEkspres(tarif) ? rentangEkspres(tarif) : "Tidak dipungut",
      keterangan:
        "Sekali per pinjaman harian, hanya bila Anda memilih cair ekspres.",
    },
  ];

  return (
    <section
      aria-labelledby="biaya-title"
      className="border-t border-border bg-background"
    >
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-14 sm:px-6 sm:py-18 lg:grid-cols-[0.9fr_1.1fr] lg:gap-14">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
            Biaya
          </p>
          <h2
            id="biaya-title"
            className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl"
          >
            Yang dipotong, disebut sebelum Anda mengajukan.
          </h2>
          <p className="mt-3 max-w-md text-sm leading-6 text-slate-600">
            Angka di bawah dibaca dari pengaturan yang sama dengan kalkulator
            dan formulir pengajuan. Begitu admin mengubah tarif, halaman ini ikut
            berubah.
          </p>
          <Button asChild variant="outline" className="mt-5 min-h-11">
            <Link to="/biaya">Hitung dengan nominal Anda</Link>
          </Button>
        </div>
        <dl className="divide-y divide-border border-y border-border">
          {baris.map((item) => (
            <div key={item.label} className="grid gap-1 py-4">
              <dt className="text-sm font-medium text-slate-900">
                {item.label}
              </dt>
              <dd>
                <span className="block text-base font-semibold tabular-nums text-primary">
                  {item.nilai}
                </span>
                <span className="mt-0.5 block text-xs leading-5 text-slate-500">
                  {item.keterangan}
                </span>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
