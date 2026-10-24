import { Coins, Wallet } from "lucide-react";

import { BilahDana } from "@/components/penyediaDana/bagian-folio";
import { FOLIO } from "@/components/penyediaDana/folio";
import { KOLOM_ANGKA, labelKolom } from "@/components/penyediaDana/kolom-pendana";
import type { RekapPendana } from "@/convex/penyediaDana";
import { formatRupiahAman } from "@/lib/money";
import { nilaiAngka, type KunciAngka } from "@/lib/tabelPendana";

function rupiah(nilai: number): string {
  return formatRupiahAman(nilai);
}

/** Satu baris label-angka di kaki panel. */
function Baris({ kunci, r }: { kunci: KunciAngka; r: RekapPendana }) {
  const kolom = KOLOM_ANGKA.find((k) => k.kunci === kunci);
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-slate-200 py-1.5 text-xs last:border-b-0">
      <dt className="text-slate-600">{labelKolom(kunci)}</dt>
      <dd className={`tabular-nums ${kolom?.kelas ?? ""}`}>{rupiah(nilaiAngka(r, kunci))}</dd>
    </div>
  );
}

/**
 * Portofolio pribadi satu pendana: satu-satunya bentuk rekap dana yang dibuka
 * untuk peran `dana`.
 *
 * Akun pendana tidak menerima baris pendana lain dari server, jadi tabel
 * perbandingan tidak punya apa-apa untuk dibandingkan di sini. Yang ditampilkan
 * adalah posisinya sendiri, dipisah menurut pertanyaan yang dibawanya: berapa
 * dana yang sedang bekerja, berapa hasilnya, dan berapa biaya layanan yang
 * dipotong serta transfer yang masih tertunda.
 *
 * Murni presentasional: angkanya datang dari baris rekap yang sudah dihitung
 * server (`daftarPengajuan`), bukan dari hitungan ulang di klien.
 */
export function PortofolioPendana({
  r,
  namaTampil,
  persenLayanan,
}: {
  /** Baris rekap milik akun ini. Server hanya mengirim baris ini untuk peran `dana`. */
  r: RekapPendana;
  /** Penyamaran nama pemilik alokasi, sama seperti tabel lain di ruang ini. */
  namaTampil: (nama: string) => string;
  /** Tarif biaya layanan platform yang berlaku, dari Pengaturan Sistem. */
  persenLayanan: number;
}) {
  return (
    <div className={FOLIO.kertas}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200 px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">
          Alokasi atas nama <span className="text-navy">{namaTampil(r.nama)}</span>
        </p>
        <p className="text-xs tabular-nums text-muted-foreground">
          {r.jumlahPinjaman} pinjaman · {r.jumlahAktif} berjalan ·{" "}
          {r.jumlahLunas} lunas
        </p>
      </div>

      {/* Dua angka yang menentukan: berapa dana yang bekerja, dan berapa hasilnya. */}
      <div className="grid gap-3 px-4 py-3 sm:grid-cols-2">
        <div className={`${FOLIO.jalur} p-3`}>
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.1em] text-slate-600">
            <Wallet className="size-3.5 shrink-0 text-emerald-700" aria-hidden />
            {labelKolom("tersalurkan")}
          </p>
          <p className="mt-1.5 text-lg font-bold tabular-nums leading-tight text-navy">
            {rupiah(r.totalDisalurkan)}
          </p>
          {/* Susunan angkanya, bukan angka kedua di sebelahnya: yang masih
              berjalan adalah bagian dari dana tersalurkan. */}
          <BilahDana tersalurkan={r.totalDisalurkan} berjalan={r.saldoBerjalan} />
        </div>

        <div className={`${FOLIO.jalur} p-3`}>
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.1em] text-slate-600">
            <Coins className="size-3.5 shrink-0 text-emerald-700" aria-hidden />
            {labelKolom("total")}
          </p>
          <p className="mt-1.5 text-lg font-bold tabular-nums leading-tight text-emerald-800">
            {rupiah(r.keuntunganPendana)}
          </p>
          <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
            {labelKolom("dibukukan")} {rupiah(r.keuntunganPendanaLunas)} ·{" "}
            {labelKolom("perkiraan")} {rupiah(r.keuntunganPendanaBelumLunas)}
          </p>
        </div>
      </div>

      <dl className="border-t border-slate-200 px-4 py-2">
        <Baris kunci="dibukukan" r={r} />
        <Baris kunci="perkiraan" r={r} />
        <Baris kunci="admin" r={r} />
        <div className="flex items-baseline justify-between gap-3 pt-2 text-xs">
          <dt className="text-slate-600">Transfer keuntungan</dt>
          <dd className="text-right">
            {r.jumlahLunas === 0 ? (
              <span className="text-muted-foreground">belum ada pinjaman lunas</span>
            ) : r.transferBelumDicatat === 0 ? (
              <span className="font-medium text-emerald-800">
                semua tercatat ({r.transferTercatat} pinjaman lunas)
              </span>
            ) : (
              <span className="font-medium text-amber-900">
                {r.transferBelumDicatat} belum dicatat ({rupiah(r.keuntunganBelumDicatat)})
              </span>
            )}
          </dd>
        </div>
      </dl>

      <p className="border-t border-slate-200 px-4 py-3 text-xs leading-5 text-muted-foreground">
        Semua angka di ruang ini dihitung dari pinjaman yang alokasinya atas nama Anda; angka
        pendana lain tidak ditampilkan. {labelKolom("admin")} adalah potongan{" "}
        {persenLayanan}% dari total pengembalian (pokok + Imbal Hasil), dipotong dari
        Imbal Hasil,
        dan cara hitungnya diuraikan di bagian aturan perhitungan.
      </p>
    </div>
  );
}
