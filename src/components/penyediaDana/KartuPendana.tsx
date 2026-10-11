import { BadgeCheck, TriangleAlert, Wallet } from "lucide-react";
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";

import { IstilahBantuan } from "./IstilahBantuan";

import { Badge } from "@/components/ui/badge";
import type { RekapPendana } from "@/convex/penyediaDana";
import { formatRupiahAman } from "@/lib/money";
import { namaHurufBesar } from "@/lib/nama";

/**
 * Satu pinjaman yang membentuk angka perkiraan pada kartu ini.
 *
 * Sengaja bukan `BarisPinjaman` (tipe server) supaya kartu tetap murni
 * presentasional dan bisa diuji tanpa membawa seluruh bentuk data server:
 * pemanggil cukup memetakan nomor referensi, nama, dan keuntungannya.
 */
export type RincianPerkiraan = {
  id: string;
  nomorReferensi: string;
  namaLengkap: string;
  keuntunganPendana: number;
};

function rupiah(nilai: number): string {
  return formatRupiahAman(nilai);
}

/**
 * Satu baris nilai pada kartu rekap: label di kiri, angka rupiah di kanan.
 * `garis` dipakai untuk baris total yang menutup sekelompok pecahan.
 */
function BarisNilai({
  label,
  nilai,
  kelas,
  garis,
}: {
  /** Boleh berupa teks atau teks + ikon bantuan (tooltip istilah). */
  label: ReactNode;
  nilai: string;
  kelas: string;
  garis?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-2${
        garis === true ? " border-t border-slate-100 pt-1.5" : ""
      }`}
    >
      <dt className="flex items-center gap-1 text-muted-foreground">{label}</dt>
      <dd className={`tabular-nums ${kelas}`}>{nilai}</dd>
    </div>
  );
}

/**
 * Kartu rekap satu pendana (model 1 pinjaman = 1 pendana).
 *
 * Disusun tiga blok supaya tidak perlu diurai sebagai satu daftar angka panjang,
 * dan supaya pertanyaan utamanya — "keuntungan saya yang mana yang sudah benar-
 * benar jadi uang, dan yang mana yang masih perkiraan?" — dijawab di tempat
 * pertama yang dilihat mata:
 *
 *  1. modal: **total pinjaman** (berapa catatan: aktif & lunas), **dana
 *     tersalurkan**, dan **saldo berjalan** — tetap berlabel, karena pemilik
 *     produk memerlukannya untuk mencocokkan catatan sendiri;
 *  2. **keuntungan pendana**: sudah lunas (dibukukan saat pelunasan) dipisah
 *     tegas dari belum lunas (perkiraan atas pinjaman berjalan), ditutup baris
 *     total;
 *  3. potongan admin & status transfer keuntungan, masing-masing satu baris.
 *
 * Murni presentasional — tanpa Convex — supaya bisa dirender langsung oleh uji
 * markup (`KartuPendana.render.test.tsx`).
 */
export function KartuPendana({
  r,
  rincianPerkiraan,
  namaTampil,
  onPilih,
}: {
  r: RekapPendana;
  /**
   * Klik kartu → saring tabel transaksi ke pendana ini (opsional).
   *
   * Kartu ini tidak memakai `<button>`: di dalamnya ada `<details>` yang bisa
   * dibuka-tutup, dan tombol bersarang tidak sah. Karena itu peran tombol
   * dipasang pada elemen kartu (`role="button"` + Enter/Space), lengkap dengan
   * fokus keyboard. Klik pada lipatan rincian dihentikan agar membuka rincian
   * tidak ikut menyaring tabel.
   */
  onPilih?: (nama: string) => void;
  /**
   * Pinjaman berjalan milik penyedia ini yang membentuk baris "Belum lunas
   * (perkiraan)". Diringkas dalam `<details>` (tertutup secara bawaan) supaya
   * laporan tetap ringkas, tetapi bisa dibuka saat pendana ingin tahu
   * angka perkiraan itu datang dari mana. Jumlah barisnya = angka perkiraan.
   */
  rincianPerkiraan?: readonly RincianPerkiraan[];
  /**
   * Penyamaran nama untuk tampilan (ruang pendana menyamarkan identitas).
   * Bawaan: nama apa adanya, sehingga pratinjau admin dan uji markup lama tetap
   * menampilkan nama penuh.
   */
  namaTampil?: (nama: string) => string;
}) {
  const rincian = rincianPerkiraan ?? [];
  const tampil = namaTampil ?? ((nama: string) => nama);
  const bisaDiklik = onPilih !== undefined;
  return (
    <div
      className={`rounded-2xl border border-slate-200/80 border-t-2 border-t-emerald-500/60 bg-white p-4 shadow-sm transition-all hover:shadow-md ${
        bisaDiklik
          ? "cursor-pointer hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          : ""
      }`}
      {...(bisaDiklik
        ? {
            role: "button" as const,
            tabIndex: 0,
            "aria-label": `Saring tabel transaksi untuk pendana ${tampil(r.nama)}`,
            onClick: () => onPilih(r.nama),
            onKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onPilih(r.nama);
              }
            },
          }
        : {})}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="inline-flex items-center gap-1.5 font-semibold uppercase text-navy">
          <Wallet className="size-3.5 text-primary" aria-hidden /> {tampil(r.nama)}
        </p>
      </div>

      {/* Modal: angka pokok yang harus tetap ada di rekap — berapa pinjaman yang
          tercatat, berapa dana yang sudah tersalurkan, dan berapa pokok yang
          masih berjalan. Sengaja berlabel, bukan kalimat kecil: pendana
          memakai ketiganya untuk mencocokkan catatannya sendiri. */}
      <dl className="mt-3 space-y-1.5 text-xs">
        <BarisNilai
          label="Total pinjaman"
          nilai={`${r.jumlahPinjaman} pinjaman · ${r.jumlahAktif} aktif · ${r.jumlahLunas} lunas`}
          kelas="font-medium text-slate-900"
        />
        <BarisNilai
          label="Dana tersalurkan"
          nilai={rupiah(r.totalDisalurkan)}
          kelas="font-medium text-slate-900"
        />
        <BarisNilai
          label="Saldo berjalan"
          nilai={rupiah(r.saldoBerjalan)}
          kelas="font-medium text-slate-900"
        />
      </dl>

      {/* Blok keuntungan: uang yang sudah cair dipisah dari yang masih perkiraan.
          Menggabung keduanya membuat pendana membaca uang yang belum cair
          sebagai haknya. */}
      <div className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50/50 px-3 py-2.5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-800">
          Keuntungan pendana
        </p>
        <dl className="mt-2 space-y-1.5 text-xs">
          <BarisNilai
            label={
              <>
                Sudah lunas (dibukukan)
                <IstilahBantuan
                  istilah="dibukukan"
                  penjelasan="Angka ini sudah final: pinjamannya lunas, sehingga keuntungannya sudah menjadi hak pendana."
                />
              </>
            }
            nilai={rupiah(r.keuntunganPendanaLunas)}
            kelas="font-semibold text-emerald-700"
          />
          <BarisNilai
            label={
              <>
                {r.jumlahAktif > 0
                  ? `Belum lunas (perkiraan) · ${r.jumlahAktif} pinjaman berjalan`
                  : "Belum lunas (perkiraan)"}
                <IstilahBantuan
                  istilah="perkiraan"
                  penjelasan="Hitungan atas pinjaman yang masih berjalan. Angka ini baru menjadi uang pendana setelah pinjamannya lunas."
                />
              </>
            }
            nilai={rupiah(r.keuntunganPendanaBelumLunas)}
            kelas="font-medium text-amber-700"
          />
          <BarisNilai
            label={
              <>
                Total keuntungan
                <IstilahBantuan
                  istilah="total keuntungan"
                  penjelasan="Gabungan keuntungan yang sudah dibukukan dan yang masih perkiraan (belum cair)."
                />
              </>
            }
            nilai={rupiah(r.keuntunganPendana)}
            kelas="font-semibold text-emerald-800"
            garis
          />
        </dl>

        {rincian.length > 0 && (
          <details
            className="mt-2 border-t border-emerald-100 pt-1.5"
            // Membuka rincian tidak boleh ikut menyaring tabel di bawah.
            onClick={(event) => event.stopPropagation()}
          >
            <summary className="cursor-pointer text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-800">
              Rincian {rincian.length} pinjaman berjalan
            </summary>
            <ul className="mt-1.5 space-y-1 text-[11px]">
              {rincian.map((p) => (
                <li key={p.id} className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 truncate text-muted-foreground">
                    {p.nomorReferensi} · {namaHurufBesar(p.namaLengkap)}
                  </span>
                  <span className="shrink-0 tabular-nums font-medium text-amber-700">
                    {rupiah(p.keuntunganPendana)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
              Jumlah baris di atas sama dengan baris “Belum lunas (perkiraan)”.
            </p>
          </details>
        )}
      </div>
      <p className="mt-1.5 text-[10px] leading-4 text-muted-foreground">
        Angka perkiraan baru menjadi uang Anda setelah pinjamannya lunas.
      </p>

      {/* Potongan admin: satu baris total; pemisahan sudah/belum dibukukan cukup
          sebagai catatan kecil karena ini bukan bagian uang pendana. */}
      <dl className="mt-3 border-t border-slate-100 pt-2 text-xs">
        <div>
          <div className="flex items-baseline justify-between gap-2">
            <dt className="flex items-center gap-1 text-muted-foreground">
              Potongan admin (total)
              <IstilahBantuan
                istilah="potongan admin"
                penjelasan="Diambil dari uang yang kembali (pokok + Imbal Hasil), bukan dari Imbal Hasil saja — pokok tetap kembali utuh."
              />
            </dt>
            <dd className="tabular-nums font-semibold text-amber-700">
              {rupiah(r.keuntunganAdmin)}
            </dd>
          </div>
          <p className="mt-0.5 text-right text-[10px] tabular-nums text-muted-foreground">
            sudah dibukukan {rupiah(r.keuntunganAdminLunas)} · perkiraan{" "}
            {rupiah(r.keuntunganAdminBelumLunas)}
          </p>
        </div>
      </dl>

      <dl className="mt-2 border-t border-slate-100 pt-2 text-xs">
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-muted-foreground">Transfer keuntungan</dt>
          <dd className="text-right">
            {r.jumlahLunas === 0 ? (
              <span className="text-[11px] text-muted-foreground">belum ada pinjaman lunas</span>
            ) : r.transferBelumDicatat === 0 ? (
              <Badge className="border-0 bg-emerald-100 text-[10px] text-emerald-700 hover:bg-emerald-100">
                <BadgeCheck className="mr-1 size-3" /> semua sudah dicatat
              </Badge>
            ) : (
              <span className="inline-flex flex-col items-end gap-0.5">
                <Badge className="border-0 bg-amber-100 text-[10px] text-amber-800 hover:bg-amber-100">
                  <TriangleAlert className="mr-1 size-3" /> {r.transferBelumDicatat} belum dicatat
                </Badge>
                <span className="text-[10px] tabular-nums text-muted-foreground">
                  {rupiah(r.keuntunganBelumDicatat)}
                </span>
              </span>
            )}
          </dd>
        </div>
      </dl>
    </div>
  );
}
