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

import { JudulBagian } from "./JudulBagian";

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
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-10 sm:px-6 sm:py-18 sm:gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:gap-14">
        <div>
          <JudulBagian
            id="biaya-title"
            label="Biaya"
            judul="Yang dipotong, disebut sebelum Anda mengajukan."
            deskripsi="Angka di bawah dibaca dari pengaturan yang sama dengan kalkulator dan formulir pengajuan. Begitu admin mengubah tarif, halaman ini ikut berubah."
            className="border-t-0 pt-0"
            deskripsiClassName="max-w-md"
          />
          <Button asChild variant="outline" className="mt-5 min-h-11">
            <Link to="/biaya">Hitung dengan nominal Anda</Link>
          </Button>
        </div>
        {/* Plakat tarif: label di kiri, nilai di kanan, keterangan di bawah
            nilai. Bentuknya seperti kartu tarif resmi, bukan daftar polos, dan
            tetap satu kolom saat layar sempit. */}
        <div className="rounded-kartu border border-border bg-card">
          <p className="border-b border-border px-5 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-gold-foreground">
            Tarif yang berlaku
          </p>
          <dl className="divide-y divide-border px-5">
            {baris.map((item) => (
              <div
                key={item.label}
                className="grid gap-1.5 py-4 sm:grid-cols-[1fr_auto] sm:items-baseline sm:gap-x-6"
              >
                <dt className="text-sm font-medium text-foreground">
                  {item.label}
                </dt>
                <dd className="sm:text-right">
                  <span className="block font-judul text-xl leading-none tabular-nums text-primary">
                    {item.nilai}
                  </span>
                  <span className="mt-1.5 block text-xs leading-5 text-slate-500 sm:max-w-[16rem]">
                    {item.keterangan}
                  </span>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}
