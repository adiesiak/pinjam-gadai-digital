import { ListFilter, RotateCcw, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FOLIO } from "@/components/penyediaDana/folio";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ringkasJumlah } from "@/lib/saringanPengajuan";

/** Nilai sentinel untuk "semua pendana" — Radix tidak menerima `""` sebagai nilai item. */
export const SEMUA_PENDANA = "__semua__";

/**
 * Saringan di atas tabel pengajuan ruang pendana: cari pengajuan (nama, kode
 * pseudonim, atau nomor referensi) dan pilih pendana.
 *
 * Untuk pembaca non-admin, `hanyaReferensi` mengubah label menjadi pencarian
 * nomor referensi saja, sejalan dengan kolom identitas yang tidak lagi
 * menampilkan nama peminjam.
 *
 * Murni presentasional — seluruh penyaringan dikerjakan `@/lib/saringanPengajuan`,
 * jadi komponen ini hanya menampilkan keadaan dan meneruskan perubahan.
 */
export function SaringanPengajuan({
  cari,
  onCari,
  pendana,
  onPendana,
  pilihanPendana,
  tampilkanPendana,
  tampil,
  total,
  onReset,
  namaTampil,
  hanyaReferensi = false,
}: {
  cari: string;
  onCari: (nilai: string) => void;
  /** Nama pendana terpilih; "" berarti semua. */
  pendana: string;
  onPendana: (nama: string) => void;
  pilihanPendana: string[];
  /** Tab gadai tidak punya kolom pendana — pilihan disembunyikan di sana. */
  tampilkanPendana: boolean;
  tampil: number;
  total: number;
  onReset: () => void;
  /**
   * Penyamaran LABEL saja — nilai yang dikirim tetap nama asli, supaya
   * penyaringan data tetap tepat walau namanya tampil tersamar.
   */
  namaTampil?: (nama: string) => string;
  /** Non-admin hanya mencari nomor referensi, tanpa nama/kode peminjam. */
  hanyaReferensi?: boolean;
}) {
  const aktif = cari.trim() !== "" || pendana !== "";
  const tampilNama = namaTampil ?? ((nama: string) => nama);
  return (
    <section
      aria-label="Saring daftar pengajuan"
      className={`animate-masuk mt-4 overflow-hidden ${FOLIO.kertas}`}
    >
      {/* Kepala saringan: memberi nama pada bilah ini supaya saringan tidak
          terbaca sebagai bagian dari tabel di bawahnya. */}
      <p className="flex items-center gap-2 border-b border-slate-200 bg-slate-50/70 px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.16em] text-slate-600 sm:px-5">
        <ListFilter className="size-3.5 text-primary" aria-hidden /> Saring daftar
      </p>
      <div className="grid gap-3 px-4 py-4 sm:grid-cols-2 sm:px-5 lg:grid-cols-3">
        <div className="min-w-0 sm:col-span-2 lg:col-span-2">
          <Label
            htmlFor="saring-nama"
            className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-600"
          >
            {hanyaReferensi ? "Cari no. referensi" : "Cari nama peminjam"}
          </Label>
          <div className="relative mt-1.5">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              id="saring-nama"
              type="search"
              value={cari}
              onChange={(e) => onCari(e.target.value)}
              placeholder={
                hanyaReferensi
                  ? "No. referensi pengajuan"
                  : "Nama, kode peminjam, atau no. referensi"
              }
              className="pl-9"
            />
          </div>
        </div>

        {tampilkanPendana && (
          <div className="min-w-0">
            <p
              id="label-saring-pendana"
              className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-600"
            >
              Pendana
            </p>
            <Select
              value={pendana === "" ? SEMUA_PENDANA : pendana}
              onValueChange={(nilai) => onPendana(nilai === SEMUA_PENDANA ? "" : nilai)}
            >
              <SelectTrigger
                aria-label="Pendana"
                aria-labelledby="label-saring-pendana"
                className="mt-1.5 w-full"
              >
                {/* Label dipasang manual: wajah trigger Radix hanya terisi dari
                    `<SelectItem>` yang sudah pernah dirender, sehingga tanpa
                    children dropdown tampak kosong sampai menu dibuka. */}
                <SelectValue placeholder="Semua pendana">
                  {pendana === "" ? "Semua pendana" : tampilNama(pendana)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SEMUA_PENDANA}>Semua pendana</SelectItem>
                {pilihanPendana.map((nama) => (
                  <SelectItem key={nama} value={nama}>
                    {tampilNama(nama)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-4 py-3 sm:px-5">
        <p className="text-xs tabular-nums text-muted-foreground">
          {ringkasJumlah(tampil, total)}
          {aktif ? " pada tab ini · filter aktif" : " pada tab ini"}
        </p>
        {aktif && (
          <Button variant="ghost" size="sm" onClick={onReset} className="h-8 text-xs">
            <RotateCcw className="mr-1.5 size-3.5" aria-hidden /> Kosongkan filter
          </Button>
        )}
      </div>
    </section>
  );
}
