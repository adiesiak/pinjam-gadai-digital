/**
 * Pemilih barang katalog Murabahah.
 *
 * Hanya tampilan: pencarian dan kategori disimpan di sini, tetapi barang yang
 * dipilih dikembalikan ke formulir induk — nominal akad, nama barang, dan
 * nomor tujuan tetap milik formulir. Barang yang harganya melewati sisa plafon
 * tetap terlihat namun tidak bisa dipilih, supaya peminjam tahu alasannya
 * alih-alih menemukan daftar yang tampak bolong.
 */
import { Search } from "lucide-react";
import { useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import { formatRupiah } from "@/lib/money";
import { MIN_AKAD_SYARIAH } from "@/lib/syariah/akad";
import {
  KATEGORI_KATALOG,
  LABEL_JENIS_BARANG,
  saringBarangKatalog,
  type BarangKatalog,
  type KategoriKatalog,
} from "@/lib/syariah/katalog";
import { cn } from "@/lib/utils";

type SaringanKategori = KategoriKatalog | "semua";

export function PemilihKatalog({
  daftar,
  nilai,
  batasHarga,
  nonaktif = false,
  onPilih,
}: {
  /** Katalog aktif dari server (tabel `katalogBarang`). */
  daftar: readonly BarangKatalog[];
  /** Kode barang terpilih, atau null bila belum ada. */
  nilai: string | null;
  /** Sisa plafon — barang di atas angka ini tidak bisa dipilih. */
  batasHarga: number;
  nonaktif?: boolean;
  onPilih: (barang: BarangKatalog) => void;
}) {
  const [kategori, setKategori] = useState<SaringanKategori>("semua");
  const [cari, setCari] = useState("");

  const hasil = useMemo(
    () =>
      saringBarangKatalog(daftar, {
        ...(kategori === "semua" ? {} : { kategori }),
        kataKunci: cari,
      }),
    [daftar, kategori, cari],
  );

  const saringan: readonly { id: SaringanKategori; label: string }[] = [
    { id: "semua", label: "Semua" },
    ...KATEGORI_KATALOG.map((nama) => ({ id: nama, label: nama })),
  ];

  return (
    <div className="mt-1.5 rounded-xl border border-slate-200 bg-white p-3">
      <div
        role="group"
        aria-label="Kategori katalog"
        className="flex flex-wrap gap-1.5"
      >
        {saringan.map((opsi) => (
          <button
            key={opsi.id}
            type="button"
            aria-pressed={kategori === opsi.id}
            disabled={nonaktif}
            onClick={() => setKategori(opsi.id)}
            className={cn(
              "min-h-9 rounded-lg border px-2.5 text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60",
              kategori === opsi.id
                ? "border-amber-700 bg-amber-700 text-white"
                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
            )}
          >
            {opsi.label}
          </button>
        ))}
      </div>

      <div className="relative mt-2">
        <Search
          className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          aria-label="Cari barang katalog"
          value={cari}
          disabled={nonaktif}
          onChange={(event) => setCari(event.target.value)}
          placeholder="Cari barang, mis. mesin jahit atau token…"
          className="h-9 pl-9 text-xs"
        />
      </div>

      {daftar.length === 0 ? (
        <p className="mt-2 rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-[11px] leading-5 text-muted-foreground">
          Katalog belum tersedia. Tulis barang Anda sendiri, atau hubungi tim
          PINDAI.
        </p>
      ) : hasil.length === 0 ? (
        <p className="mt-2 rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-[11px] leading-5 text-muted-foreground">
          Tidak ada barang yang cocok. Coba kata kunci lain, atau tulis barang
          Anda sendiri di bawah.
        </p>
      ) : (
        <ul className="mt-2 grid max-h-72 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2">
          {hasil.map((barang) => {
            const dipilih = barang.kode === nilai;
            const terlaluMahal = barang.harga > batasHarga;
            return (
              <li key={barang.kode}>
                <button
                  type="button"
                  aria-pressed={dipilih}
                  disabled={nonaktif || terlaluMahal}
                  onClick={() => onPilih(barang)}
                  className={cn(
                    "flex w-full flex-col items-start gap-1 rounded-lg border px-2.5 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed",
                    dipilih
                      ? "border-amber-700 bg-amber-50"
                      : "border-slate-200 bg-white hover:border-amber-300 hover:bg-amber-50/40",
                    terlaluMahal && "opacity-60",
                  )}
                >
                  <span className="text-xs font-semibold leading-4 text-slate-900">
                    {barang.nama}
                  </span>
                  <span className="text-[11px] tabular-nums leading-4 text-slate-600">
                    {barang.kategori} · {formatRupiah(barang.harga)}
                  </span>
                  {barang.jenisBarang === "digital" && (
                    <span className="rounded border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-900">
                      {LABEL_JENIS_BARANG.digital}
                    </span>
                  )}
                  {terlaluMahal && (
                    <span className="text-[10px] leading-4 text-red-800">
                      Melebihi sisa plafon
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
        Harga di atas adalah harga pokok dari mitra. PINDAI membelinya lebih
        dulu, lalu menjualnya kepada Anda dengan margin yang disepakati. Akad
        syariah minimal {formatRupiah(MIN_AKAD_SYARIAH)}, jadi nominal pulsa di
        bawah angka itu belum bisa dibiayai.
      </p>
    </div>
  );
}
