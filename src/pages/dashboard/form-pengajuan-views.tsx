/**
 * Halaman pengajuan Peminjam — SATU halaman untuk tiga produk.
 *
 * Sebelumnya formulir pinjaman dan gadai tampil berdampingan di tab "Form
 * Pengajuan", sedangkan pengajuan kredit barang hanya ada di dalam tab "Kredit
 * Barang". Sekarang ketiganya hidup di sini: Peminjam memilih jenisnya lewat
 * menu dropdown, lalu hanya formulir jenis itu yang dirender — jadi tidak ada
 * dua formulir besar yang berebut perhatian di satu layar.
 *
 * Tab "Kredit Barang" sudah dihapus, jadi daftar catatan kredit menempel pada
 * formulirnya di tampilan kredit: formulir dan catatan satu produk berada di
 * satu tempat, tanpa menambah satu tab lagi di navigasi.
 *
 * Formulirnya sendiri tidak disalin: `LoanForm`, `PawnForm`, dan
 * `KreditBarangForm` tetap komponen aslinya, sehingga seluruh validasi,
 * perhitungan, dan mutasi Convex tidak berubah. Daftar jenis dan fungsi
 * pemilihnya ada di `@/lib/jenisPengajuan` (tanpa hook), sehingga
 * `PemilihJenisPengajuan` bisa dirender di uji tanpa klien Convex.
 */
import { Package, Send, ShoppingBag, Wallet } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { PromoPinjamanAktif } from "@/components/promo/PromoPinjamanAktif";
import { PilihanProduk } from "@/components/landing/PilihanProduk";
import {
  JENIS_PENGAJUAN,
  jenisPengajuanAktif,
  jenisPengajuanDari,
  type JenisPengajuan,
} from "@/lib/jenisPengajuan";

import { LoanForm, PawnForm } from "./forms-views";
import { KreditBarangForm, KreditBarangSection } from "./kredit-views";
import { SyariahSection } from "./syariah-views";

/** Ikon tiap jenis — dipetakan di sini supaya `lib/jenisPengajuan` tetap bebas React. */
const IKON_JENIS: Record<JenisPengajuan, typeof Wallet> = {
  pinjaman: Wallet,
  gadai: Package,
  kredit: ShoppingBag,
};

/**
 * Menu dropdown pemilih jenis pengajuan + ringkasan pilihan.
 *
 * Murni tampilan dan tanpa hook Convex supaya bisa dirender di luar aplikasi
 * (uji render). Nilai yang tidak dikenal jatuh ke jenis pertama, jadi menu ini
 * tidak pernah menampilkan keadaan kosong.
 */
export function PemilihJenisPengajuan({
  nilai,
  onUbah,
}: {
  nilai: string;
  onUbah: (jenis: JenisPengajuan) => void;
}) {
  const aktif = jenisPengajuanAktif(nilai);
  const IkonAktif = IKON_JENIS[aktif.id];

  return (
    <div className="min-w-0">
      <p id="label-jenis-pengajuan" className="text-sm font-medium text-slate-900">
        Jenis pengajuan
      </p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        Pilih satu jenis di menu dropdown — formulirnya berganti sesuai pilihan.
      </p>

      <Select
        value={aktif.id}
        onValueChange={(nilaiBaru) => {
          const jenis = jenisPengajuanDari(nilaiBaru);
          if (jenis !== null) onUbah(jenis);
        }}
      >
        <SelectTrigger
          aria-label="Jenis pengajuan"
          aria-labelledby="label-jenis-pengajuan"
          className="mt-3 h-12 w-full rounded-xl text-sm font-medium sm:max-w-md"
        >
          {/* Label dipasang manual, bukan dibiarkan Radix mengisinya: wajah
              trigger hanya terisi dari `<SelectItem>` yang sudah pernah
              dirender, sehingga tanpa children dropdown tampak kosong sampai
              menu dibuka sekali. */}
          <SelectValue placeholder="Pilih jenis pengajuan">
            <span className="flex items-center gap-2">
              <IkonAktif className="size-4" aria-hidden="true" />
              {aktif.label}
            </span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {JENIS_PENGAJUAN.map(({ id, label }) => {
            const Ikon = IKON_JENIS[id];
            return (
              <SelectItem key={id} value={id}>
                <span className="flex items-center gap-2">
                  <Ikon className="size-4" aria-hidden="true" />
                  {label}
                </span>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>

      <div className="mt-3 flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 sm:max-w-2xl">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white text-primary shadow-sm">
          <IkonAktif className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">{aktif.judul}</p>
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{aktif.hint}</p>
        </div>
      </div>
    </div>
  );
}

/**
 * CTA untuk tab lain: mengingatkan bahwa tab itu hanya catatan, lalu membuka
 * halaman Form Pengajuan dengan jenis ini sudah terpilih.
 *
 * Tanpa hook Convex, sehingga bisa dirender di uji.
 */
export function TombolBuatPengajuan({
  jenis,
  onClick,
}: {
  jenis: JenisPengajuan;
  onClick: () => void;
}) {
  const aktif = jenisPengajuanAktif(jenis);

  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/20 bg-primary/[0.04] px-4 py-3">
      <p className="text-xs leading-5 text-slate-600">
        Daftar di bawah adalah catatan dan tagihan. Pengajuan baru dibuat di halaman
        Form Pengajuan.
      </p>
      <Button type="button" size="sm" className="gap-1.5" onClick={onClick}>
        <Send className="size-3.5" aria-hidden="true" /> {aktif.cta}
      </Button>
    </div>
  );
}

/**
 * Seksi pengajuan: judul, pemilih jenis, lalu formulir jenis terpilih.
 *
 * Jenis yang aktif dimiliki pemanggil (dashboard), bukan seksi ini: CTA di tab
 * lain harus bisa membuka halaman ini dengan jenisnya sudah terpilih, dan
 * pilihan pemakai tetap tersimpan saat berpindah tab bolak-balik.
 */
export function FormPengajuanSection({
  jenis,
  onUbahJenis,
  onBukaKyc,
  jalurAwal = "konvensional",
}: {
  jenis: JenisPengajuan;
  onUbahJenis: (jenis: JenisPengajuan) => void;
  /** Pindah ke tab Verifikasi KYC — dipakai gerbang KYC di tiap formulir. */
  onBukaKyc?: () => void;
  /** Dipakai tautan "Ajukan akad syariah" agar jalur langsung terbuka. */
  jalurAwal?: "konvensional" | "syariah";
}) {
  const aktif = jenisPengajuanAktif(jenis);
  // Jalur dipilih SEBELUM jenis pengajuan: konvensional memakai dropdown tiga
  // produk yang sudah ada, syariah memakai formulir akad sendiri. Sakelar ini
  // lokal karena hanya menyusun tampilan; server tetap memvalidasi semuanya.
  const [jalur, setJalur] = useState<"konvensional" | "syariah">(jalurAwal);

  return (
    <section className="min-w-0">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Send className="size-4 text-primary" aria-hidden="true" />
            Buat pengajuan baru
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            {jalur === "syariah"
              ? "Murabahah untuk barang, Rahn untuk gadai, dan Qardh untuk pinjaman kebajikan. Petugas menetapkan angka akad sebelum pencairan."
              : "Pinjaman, gadai, dan kredit barang diajukan dari satu halaman ini. Pilih jenisnya di menu dropdown, lalu isi formulir yang muncul. Semua angka dihitung aplikasi dan tercatat di PINDAI."}
          </p>
        </div>
        <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
          {jalur === "syariah"
            ? "3 akad syariah"
            : `${JENIS_PENGAJUAN.length} jenis pengajuan`}
        </span>
      </div>

      {/* Jalur produk dipilih sebelum jenis pengajuan: konvensional memakai
          formulir yang sudah aktif, syariah membuka halaman akadnya lebih dulu. */}
      <div className="mt-5">
        <p className="text-sm font-medium text-slate-900">Jalur pembiayaan</p>
        <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
          Konvensional memakai bunga flat. Syariah memakai akad dan nisbah.
          Keduanya dihitung terpisah oleh sistem.
        </p>
        <PilihanProduk
          ringkas
          className="mt-3"
          aktif={jalur}
          onPilih={setJalur}
        />
      </div>

      {jalur === "konvensional" && (
        <PromoPinjamanAktif penempatan="pengajuan" className="mt-4" />
      )}

      <Separator className="my-4" />

      {jalur === "syariah" ? (
        <div className="min-w-0 animate-masuk">
          <SyariahSection onBukaKyc={onBukaKyc} />
        </div>
      ) : (
        <>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <PemilihJenisPengajuan nilai={jenis} onUbah={onUbahJenis} />
          </div>

          {/* `key` memaksa formulir lama dilepas saat jenis berganti: isian tidak
              berpindah ke formulir lain, dan animasi masuknya diputar ulang. */}
          <div key={aktif.id} className="mt-6 min-w-0 animate-masuk">
            {aktif.id === "pinjaman" && (
              <LoanForm
                onBukaKyc={onBukaKyc}
                onCreated={(ref) =>
                  toast.success(`Catatan pengajuan tersimpan: referensi ${ref}.`)
                }
              />
            )}
            {aktif.id === "gadai" && (
              <PawnForm
                onBukaKyc={onBukaKyc}
                onCreated={() =>
                  toast.success("Catatan pengajuan gadai tersimpan.")
                }
              />
            )}
            {aktif.id === "kredit" && (
              <div className="space-y-8">
                <KreditBarangForm
                  onBukaKyc={onBukaKyc}
                  onCreated={(ref) =>
                    toast.success(
                      `Catatan pengajuan kredit barang tersimpan: referensi ${ref}.`,
                    )
                  }
                />
                {/* Daftar catatan menemani formulirnya: dulu pasangan ini tinggal
                    di tab "Kredit Barang" yang kini dihapus. */}
                <KreditBarangSection />
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
