import {
  ArrowDown,
  ArrowUp,
  BadgeCheck,
  ChevronDown,
  ChevronRight,
  TriangleAlert,
} from "lucide-react";
import { Fragment, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BilahDana } from "@/components/penyediaDana/bagian-folio";
import { FOLIO } from "@/components/penyediaDana/folio";
import {
  KOLOM_ANGKA,
  KOLOM_TABEL,
  PITA,
  RINGKAS,
  labelKolom,
  labelSingkat,
  type KunciTabel,
} from "@/components/penyediaDana/kolom-pendana";
import type { RekapPendana } from "@/convex/penyediaDana";
import {
  PERSEN_PORSI_PENDANA,
  PERSEN_PORSI_PLATFORM,
} from "@/lib/kebijakanPinjaman";
import { formatRupiahAman } from "@/lib/money";
import { namaHurufBesar } from "@/lib/nama";
import {
  KOLOM_URUT,
  URUTAN_AWAL,
  nilaiAngka,
  nilaiTotal,
  totalPendana,
  urutkanPendana,
  type KunciAngka,
  type KunciUrut,
  type RincianPerkiraan,
  type TotalPendana,
  type UrutanPendana,
} from "@/lib/tabelPendana";

/**
 * Lebar kolom angka dipatok, bukan dipersentase.
 *
 * Kolom angka yang ikut melebar mengikuti halaman membuat angka sejenis
 * berjauhan, dan jarak itulah yang membuat dua baris tidak bisa dibandingkan
 * sekali pandang. Kolom dana tersalurkan lebih lebar satu tingkat karena isinya
 * bukan cuma satu angka: ada bilah dan keterangan "masih berjalan" di bawahnya.
 */
function lebarKolom(kunci: KunciTabel): string {
  return kunci === "tersalurkan" ? "w-40" : "w-36";
}

/** Kepala kolom nama: rata kiri, selebar sisa tabel, melintang dua baris kepala. */
const KEPALA_NAMA =
  "px-2 pb-1.5 align-bottom text-xs font-semibold uppercase leading-tight tracking-[0.04em] text-slate-600";

/** Nama pita kolom di baris atas kepala tabel. */
const KEPALA_PITA =
  "border-b border-slate-200 bg-slate-50 px-2 pb-0.5 pt-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500";

/**
 * Saringan baris: pertanyaan yang biasanya dibawa pembaca ke tabel ini, bukan
 * kategori data. "Masih berjalan" menyaring pendana yang dananya belum kembali,
 * "Transfer tertunda" menyaring yang keuntungannya belum dicatat.
 */
type SaringBaris = "semua" | "berjalan" | "tertunda";

const SARING: readonly { kunci: SaringBaris; label: string }[] = [
  { kunci: "semua", label: "Semua" },
  { kunci: "berjalan", label: "Masih berjalan" },
  { kunci: "tertunda", label: "Transfer tertunda" },
];

function rupiah(nilai: number): string {
  return formatRupiahAman(nilai);
}

/** Persen porsi dibaca dengan koma desimal, tanpa nol yang tidak perlu. */
function persenPorsi(nilai: number): string {
  return nilai.toLocaleString("id-ID", { maximumFractionDigits: 2 });
}

/** Arah urutan dibaca sebagai kalimat; nama dibaca sebagai huruf, bukan besar. */
function teksArah(urutan: UrutanPendana): string {
  if (urutan.kunci === "nama")
    return urutan.arah === "naik" ? "A ke Z" : "Z ke A";
  return urutan.arah === "turun" ? "Terbesar dulu" : "Terkecil dulu";
}

/**
 * Sel tabel: lebar tetap, rata kanan, dan garis pemisah pita di kolom pertama
 * setiap pita.
 *
 * `kaki` menandai sel baris total. Selnya sendiri yang menempel (`sticky`),
 * bukan barisnya: pada tabel ber-`border-separate` inilah bentuk yang dipakai
 * mesin peramban untuk menggulir badan tabel, dan latarnya harus solid supaya
 * baris di belakangnya tidak tembus pandang.
 */
function Sel({
  kunci,
  mulai,
  kaki = false,
  children,
}: {
  kunci: KunciTabel;
  mulai: boolean;
  kaki?: boolean;
  children: React.ReactNode;
}) {
  const dasar = kaki
    ? "sticky bottom-0 z-10 border-t-2 border-slate-300 bg-slate-100 px-2 py-2 align-top"
    : "border-b border-slate-200 px-2 py-1.5 align-middle";
  return (
    <TableCell
      className={`text-right tabular-nums ${lebarKolom(kunci)} ${
        mulai ? "border-l border-slate-200" : ""
      } ${dasar}`}
    >
      {children}
    </TableCell>
  );
}

/** Kolom pertama setiap pita membuka pitanya, jadi dia yang diberi garis pemisah. */
function mulaiPita(i: number): boolean {
  return i === 0 || KOLOM_TABEL[i - 1]?.pita !== KOLOM_TABEL[i]?.pita;
}

/**
 * Status pencatatan transfer keuntungan milik satu pendana.
 *
 * Ditulis sebagai kalimat, bukan hanya warna: hijau/ambernya tetap ada, tetapi
 * keadaannya bisa dibaca tanpa membedakan warna.
 */
function TransferPendana({
  r,
  ringkas = false,
}: {
  r: RekapPendana;
  ringkas?: boolean;
}) {
  if (r.jumlahLunas === 0) {
    return (
      <span className="text-xs text-muted-foreground">
        belum ada pinjaman lunas
      </span>
    );
  }
  if (r.transferBelumDicatat === 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800">
        <BadgeCheck className="size-3.5 shrink-0" aria-hidden />
        semua tercatat
      </span>
    );
  }
  return (
    <span
      className={`inline-flex flex-col gap-0.5 ${
        ringkas ? "items-start" : "items-end"
      }`}
    >
      <span className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900">
        <TriangleAlert className="size-3.5 shrink-0" aria-hidden />{" "}
        {r.transferBelumDicatat} belum dicatat
      </span>
      <span className="text-xs tabular-nums text-muted-foreground">
        {rupiah(r.keuntunganBelumDicatat)}
      </span>
    </span>
  );
}

/** Nama pita dipakai bersama oleh kepala tabel dan kartu layar sempit. */
function LabelPita({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
      {children}
    </p>
  );
}

/**
 * Isi lipatan satu baris: pinjaman pembentuk angka perkiraan dan angka pendamping
 * yang tidak muat sebagai kolom.
 *
 * Yang ditampilkan tinggal yang belum terbaca di barisnya. Daftar pinjamannya
 * digulir sendiri dan ditutup jumlahnya, supaya delapan pinjaman tidak mendorong
 * sisa halaman keluar layar dan jumlahnya bisa dicocokkan dengan kolomnya tanpa
 * menghitung manual.
 */
function IsiRincian({
  r,
  rincian,
}: {
  r: RekapPendana;
  rincian: readonly RincianPerkiraan[];
}) {
  const jumlah = rincian.reduce((t, p) => t + p.keuntunganPendana, 0);
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {/*
       * Dua lembar berlabel berdampingan: daftar tanpa bingkai membuat angka
       * kanan terbaca seperti kolom tabel yang lain.
       */}
      <div className={`${FOLIO.jalur} p-3`}>
        <p className="text-xs font-semibold text-navy">
          Pembentuk angka perkiraan · {rincian.length} pinjaman berjalan
        </p>
        {rincian.length === 0 ? (
          <p className="mt-1 text-xs text-muted-foreground">
            Tidak ada pinjaman berjalan atas nama pendana ini, jadi angka
            perkiraannya Rp 0.
          </p>
        ) : (
          <>
            {/* Kepala kecil di atas angkanya, supaya angka rata kanan tetap
                bisa dipasangkan ke barisnya. */}
            <div className="mt-2 flex items-baseline justify-between gap-3 border-b border-slate-300 pb-1 text-xs text-slate-600">
              <span>Pinjaman (referensi · peminjam)</span>
              <span className="shrink-0">Perkiraan</span>
            </div>
            <ul className="max-h-64 divide-y divide-slate-200 overflow-y-auto">
              {rincian.map((p) => (
                <li
                  key={p.id}
                  className="flex items-baseline justify-between gap-3 py-1.5 text-xs"
                >
                  <span
                    className={`min-w-0 truncate text-slate-600 ${FOLIO.kode}`}
                  >
                    {p.nomorReferensi} · {namaHurufBesar(p.namaLengkap)}
                  </span>
                  <span className="shrink-0 tabular-nums font-medium text-amber-700">
                    {rupiah(p.keuntunganPendana)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="flex items-baseline justify-between gap-3 border-t border-slate-300 pt-1.5 text-xs font-semibold text-navy">
              <span>{rincian.length} pinjaman berjalan</span>
              <span className="tabular-nums">{rupiah(jumlah)}</span>
            </div>
          </>
        )}
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          Jumlah baris di atas sama dengan kolom “Perkiraan (belum lunas)”.
        </p>
      </div>

      <div className={`${FOLIO.jalur} p-3`}>
        <p className="text-xs font-semibold text-navy">Angka lain di baris ini</p>
        <dl className="mt-2">
          {[
            {
              label: "Total keuntungan",
              nilai: rupiah(r.keuntunganPendana),
            },
            {
              label: "Biaya platform (layanan) dibukukan",
              nilai: rupiah(r.keuntunganAdminLunas),
            },
            {
              label: "Biaya platform (layanan) perkiraan",
              nilai: rupiah(r.keuntunganAdminBelumLunas),
            },
            {
              label: "Transfer sudah dicatat",
              nilai: `${r.transferTercatat} pinjaman lunas`,
            },
          ].map((baris) => (
            <div
              key={baris.label}
              className="flex items-baseline justify-between gap-3 border-b border-slate-200 py-1.5 text-xs last:border-b-0"
            >
              <dt className="min-w-0 text-slate-600">{baris.label}</dt>
              <dd className="shrink-0 tabular-nums font-medium text-slate-900">
                {baris.nilai}
              </dd>
            </div>
          ))}
          <div className="flex items-baseline justify-between gap-3 pt-1.5 text-xs">
            <dt className="text-slate-600">Transfer keuntungan</dt>
            <dd className="text-right">
              <TransferPendana r={r} />
            </dd>
          </div>
        </dl>
      </div>

      {/*
       * Kredit barang punya model uang sendiri: tenor 3–6 bulan, marjin
       * kontrak menjadi hak pendana seluruhnya, dan platform memperoleh biaya
       * admin. Karena itu bloknya berdiri terpisah di bawah kolom 30 hari —
       * mencampurnya ke kolom tunai akan membuat dua model bagi hasil terbaca
       * seolah satu.
       */}
      {r.kredit !== undefined && r.kredit.jumlahAlokasi > 0 && (
        <div className={`${FOLIO.jalur} p-3 lg:col-span-2`}>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <p className="text-xs font-semibold text-navy">
              Kredit barang · {r.kredit.jumlahAlokasi} alokasi
            </p>
            <p className="text-xs tabular-nums text-muted-foreground">
              {r.kredit.cicilanDibayar} dari {r.kredit.cicilanTotal} cicilan
              tercatat
            </p>
          </div>

          <dl className="mt-2 grid gap-x-4 gap-y-1.5 text-xs sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Pokok dialokasikan", nilai: rupiah(r.kredit.pokok) },
              { label: "Marjin kontrak", nilai: rupiah(r.kredit.marginKontrak) },
              {
                label: "Hak pendana (100% marjin)",
                nilai: rupiah(r.kredit.imbalPendana),
              },
              {
                label: "Biaya platform",
                nilai: rupiah(r.kredit.biayaPlatform),
              },
            ].map((angka) => (
              <div
                key={angka.label}
                className="flex items-baseline justify-between gap-3 border-b border-slate-200 pb-1 last:border-b-0"
              >
                <dt className="text-slate-600">{angka.label}</dt>
                <dd className="shrink-0 tabular-nums font-medium text-slate-900">
                  {angka.nilai}
                </dd>
              </div>
            ))}
          </dl>

          <ul className="mt-2 divide-y divide-slate-200">
            {r.kredit.baris.map((k) => (
              <li
                key={k.kreditId}
                className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-1.5 text-xs"
              >
                <span className="min-w-0">
                  <span
                    className={`block truncate text-slate-600 ${FOLIO.kode}`}
                  >
                    {k.nomorReferensi} · {k.namaBarang}
                  </span>
                  <span className="block text-[11px] text-muted-foreground">
                    {k.tenorBulan} bulan · {k.cicilanDibayar}/{k.tenorBulan}{" "}
                    cicilan
                  </span>
                </span>
                <span className="shrink-0 text-right tabular-nums">
                  <span className="block font-medium text-navy">
                    pokok {rupiah(k.pokok)}
                  </span>
                  <span className="block text-emerald-800">
                    hak pendana {rupiah(k.imbalPendana)}
                  </span>
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
            <p className="rounded-md border border-slate-200 bg-white px-2.5 py-2 leading-5">
              <span className="font-semibold text-navy">
                Pinjaman tunai (30 hari)
              </span>
              <span className="mt-0.5 block text-slate-600">
                Marjin dibagi 47 : 13 — pendana {persenPorsi(PERSEN_PORSI_PENDANA)}
                % · platform {persenPorsi(PERSEN_PORSI_PLATFORM)}%.
              </span>
            </p>
            <p className="rounded-md border border-slate-200 bg-white px-2.5 py-2 leading-5">
              <span className="font-semibold text-navy">
                Kredit barang (3–6 bulan)
              </span>
              <span className="mt-0.5 block text-slate-600">
                Marjin kontrak 100% menjadi hak pendana; platform memperoleh
                biaya admin 2% di muka + 2% tiap cicilan.
              </span>
            </p>
          </div>

          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            Angka kredit tidak dijumlahkan ke kolom 30 hari di atas: pokoknya
            kembali mengikuti cicilan 3–6 bulan, bukan satu siklus pendana.
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Satu baris label-angka di kartu layar sempit.
 *
 * Kolomnya disebut dengan kuncinya, bukan dengan label dan kelas yang ditulis
 * ulang: nama angka dan warnanya datang dari daftar kolom yang sama dengan tabel
 * layar lebar, jadi kedua tata letak tidak bisa menyebut angka yang sama dengan
 * istilah atau warna yang berbeda.
 */
function BarisAngka({
  kunci,
  nilai,
  label = labelKolom(kunci),
}: {
  kunci: KunciAngka;
  nilai: string;
  label?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className={`tabular-nums ${
          KOLOM_ANGKA.find((k) => k.kunci === kunci)?.kelas ?? ""
        }`}
      >
        {nilai}
      </dd>
    </div>
  );
}

/**
 * Baris kendali di atas tabel: ringkasan angka kepala, saringan baris, dan
 * pengurut.
 *
 * Pengurutan tidak ditempel di judul kolom: judul yang bisa diklik memaksa
 * setiap kepala kolom memuat tombol, ikon, dan cincin fokus, sehingga kepala
 * tabel lebih tinggi daripada isinya. Di sini urutan punya satu tempat, dan
 * kepala kolom cukup jadi label.
 *
 * Pilihan pengurutnya sengaja hanya kolom yang benar-benar berdiri di tabel,
 * jadi tidak ada urutan yang dasarnya harus dicari dulu di dalam lipatan.
 */
function Kendali({
  total,
  saring,
  onSaring,
  urutan,
  onKolom,
  onArah,
}: {
  total: TotalPendana;
  saring: SaringBaris;
  onSaring: (s: SaringBaris) => void;
  urutan: UrutanPendana;
  onKolom: (k: KunciUrut) => void;
  onArah: () => void;
}) {
  return (
    <div className="border-b border-slate-200 px-3 py-2">
      {/* Kendali dulu, ringkasan menyusul: baris ini soal mengubah pandangan,
          angkanya menyusul di bawahnya sebagai bacaan. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div
          role="group"
          aria-label="Saring baris pendana"
          className="flex items-center gap-2"
        >
          {SARING.map((s) => (
            <button
              key={s.kunci}
              type="button"
              aria-pressed={saring === s.kunci}
              onClick={() => onSaring(s.kunci)}
              className={`rounded-sm border-b-2 pb-0.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 ${
                saring === s.kunci
                  ? "border-emerald-700 font-semibold text-navy"
                  : "border-transparent text-muted-foreground hover:border-slate-300 hover:text-navy"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          <Select
            value={urutan.kunci}
            onValueChange={(nilai) => onKolom(nilai as KunciUrut)}
          >
            <SelectTrigger size="sm" className="h-8 gap-1.5 text-xs">
              <span className="sr-only">Urutkan tabel menurut kolom</span>
              <SelectValue>{labelKolom(urutan.kunci)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {KOLOM_URUT.map((k) => (
                <SelectItem key={k} value={k} className="text-xs">
                  {labelKolom(k)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1 px-2.5 text-xs"
            title="Balik arah urutan"
            onClick={onArah}
          >
            {urutan.arah === "naik" ? (
              <ArrowUp className="size-3.5 shrink-0" aria-hidden />
            ) : (
              <ArrowDown className="size-3.5 shrink-0" aria-hidden />
            )}
            {teksArah(urutan)}
          </Button>
        </div>
      </div>

      {/* Ringkasan seluruh rekap, bukan baris yang sedang tampil: angka yang
          berubah ikut saringan ada di baris Total di dasar tabel, dan kedua
          tempat itu menyebut cakupannya masing-masing. */}
      <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs text-slate-600">
        <span className="font-medium text-slate-900">
          {total.jumlahPendana} pendana
        </span>
        <span className="text-muted-foreground">seluruh rekap</span>
        {KOLOM_ANGKA.filter((k) => RINGKAS.includes(k.kunci)).map((k) => (
          <span key={k.kunci} className="inline-flex items-baseline gap-1.5">
            <span aria-hidden className="text-slate-300">
              ·
            </span>
            <span
              className={`tabular-nums ${
                k.kunci === "tersalurkan" ? "font-semibold text-navy" : k.kelas
              }`}
            >
              {rupiah(nilaiTotal(total, k.kunci))}
            </span>
            <span>{labelSingkat(k.kunci)}</span>
          </span>
        ))}
      </p>
    </div>
  );
}

/**
 * Tabel perbandingan pendana, satu-satunya permukaan rekap dana di ruang
 * pendana.
 *
 * Menjawab pertanyaan yang sama untuk SETIAP pendana dalam satu tatanan kolom,
 * dan kolomnya dikelompokkan menurut pertanyaan yang dijawabnya: pita "Dana
 * pendana" (uang yang sedang bekerja), "Hasil pendana" (yang sudah jadi uang dan
 * yang masih hitungan), dan "Platform" (biaya layanan yang dipungut serta
 * transfer yang belum dicatat). Seluruh kolomnya selalu terbuka — dulu sebagian
 * disembunyikan di balik tombol penampil kolom, sehingga pembaca yang tidak tahu
 * tombolnya bisa mengambil kesimpulan dari separuh angka.
 *
 * "Masih berjalan" bukan kolom sendiri: ia bagian dari dana tersalurkan, jadi
 * tempatnya di bawah angka itu sebagai bilah dan satu baris keterangan. Yang
 * benar-benar dipisah adalah angka yang tidak bisa diturunkan dari kolom lain,
 * sehingga tidak ada jumlah yang ditempatkan berdampingan dengan pecahannya.
 *
 * Kepala kolom melekat di puncak saat isinya digulir, baris Total menempel di
 * dasarnya, dan setiap baris bisa diperluas untuk menelusuri pinjaman pembentuk
 * angka perkiraannya.
 *
 * Di layar sempit tabel seperti ini tidak mungkin muat tanpa geser mendatar, jadi
 * setiap pendana ditampilkan sebagai kartu berisi kelompok angka yang sama,
 * bukan tabel yang dipotong.
 *
 * Aturan urut dan penjumlahannya tinggal di `@/lib/tabelPendana` supaya bisa
 * diuji sebagai fungsi; komponen ini hanya menggambar.
 *
 * Murni presentasional tanpa Convex, supaya bisa dirender langsung oleh uji
 * markup (`TabelPendana.render.test.tsx`).
 */
export function TabelPendana({
  rekap,
  rincianPerkiraan,
  namaTampil,
  aktif = null,
  onPilih,
  bukaAwal = [],
  saringAwal = "semua",
}: {
  rekap: readonly RekapPendana[];
  /**
   * Pinjaman berjalan milik satu pendana, isi lipatan "Pembentuk angka
   * perkiraan". Opsional: tanpa fungsi ini, rinciannya diterangkan sebagai
   * tidak ada, bukan dikosongkan tanpa keterangan.
   */
  rincianPerkiraan?: (nama: string) => readonly RincianPerkiraan[];
  /** Penyamaran nama pendana untuk tampilan (bawaan: nama apa adanya). */
  namaTampil?: (nama: string) => string;
  /**
   * Pendana yang sedang menyaring tabel pinjaman di bawah ruang ini. Barisnya
   * ditandai supaya keterkaitan antara rekap dan daftar terlihat, bukan hanya
   * terasa sesudah menggulir.
   */
  aktif?: string | null;
  /** Tombol "Saring daftar" → saring tabel pinjaman ke pendana ini. */
  onPilih?: (nama: string) => void;
  /**
   * Nama pendana yang rinciannya dibuka sejak awal. Dipakai uji markup: rincian
   * yang masih terlipat belum ada di DOM saat render statis, jadi tanpa pintu
   * ini isinya tidak bisa diverifikasi lewat HTML.
   */
  bukaAwal?: readonly string[];
  /** Saringan baris awal. Pintu yang sama dengan `bukaAwal`, untuk uji markup. */
  saringAwal?: SaringBaris;
}) {
  const tampil = namaTampil ?? ((nama: string) => nama);
  const [urutan, setUrutan] = useState<UrutanPendana>(URUTAN_AWAL);
  const [terbuka, setTerbuka] = useState<readonly string[]>(bukaAwal);
  const [saring, setSaring] = useState<SaringBaris>(saringAwal);

  const total = totalPendana(rekap);
  const baris = urutkanPendana(rekap, urutan).filter((r) =>
    saring === "berjalan"
      ? r.jumlahAktif > 0
      : saring === "tertunda"
        ? r.transferBelumDicatat > 0
        : true,
  );
  const totalBaris = totalPendana(baris);

  function toggle(nama: string) {
    setTerbuka((lama) =>
      lama.includes(nama) ? lama.filter((n) => n !== nama) : [...lama, nama],
    );
  }

  function balikArah() {
    setUrutan((lama) => ({
      ...lama,
      arah: lama.arah === "naik" ? "turun" : "naik",
    }));
  }

  /** Kolom baru: arahnya masuk akal sejak awal (nama A→Z, angka terbesar dulu). */
  function pilihKolom(kunci: KunciUrut) {
    setUrutan((lama) => ({
      kunci,
      arah:
        lama.kunci === kunci ? lama.arah : kunci === "nama" ? "naik" : "turun",
    }));
  }

  if (rekap.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50/70 px-4 py-6 text-center text-xs text-muted-foreground">
        Belum ada dana tersalurkan pada pendana mana pun. Rekap ini terisi
        setelah ada pinjaman yang cair atas nama pendana.
      </p>
    );
  }

  const kendali = (
    <Kendali
      total={total}
      saring={saring}
      onSaring={setSaring}
      urutan={urutan}
      onKolom={pilihKolom}
      onArah={balikArah}
    />
  );

  return (
    <div className="animate-masuk">
      {/* Layar lebar: satu tabel yang kepala kolomnya melekat saat digulir. */}
      <div className="hidden lg:block">
        {/* Lembar folio: kertas padat bergaris kepala kuningan, tanpa bayangan:
            bayangan hanya dipakai satu lembar fokus di puncak halaman. */}
        <div className={`${FOLIO.kertas} overflow-hidden`}>
          {kendali}

          {/*
            Kotak gulir sendiri, bukan halaman: kepala kolom dan baris total
            hanya bisa melekat kalau ada kotak yang menggulir. Setinggi 68 vh
            supaya tabel panjang tidak mendorong sisa halaman keluar layar.
          */}
          <div className="max-h-[min(68vh,42rem)] overflow-auto overscroll-x-contain">
            {/*
             * `border-separate`: garis rambut tiap sel ikut turun bersama
             * barisnya saat digulir, dan judul kolom boleh turun baris
             * (`[&_th]:whitespace-normal`) tanpa melebarkan kolomnya.
             */}
            <table className="w-full min-w-[60rem] table-fixed caption-bottom border-separate border-spacing-0 text-sm [&_th]:whitespace-normal">
              <TableCaption className="sr-only">
                Perbandingan dana tersalurkan, hasil, dan biaya platform per
                pendana, dikelompokkan menurut pita kolomnya
              </TableCaption>

              <TableHeader className="sticky top-0 z-20">
                {/* Baris pita: nama kelompok di atas kolom-kolomnya, supaya
                    pembaca tahu mana uang yang bekerja, mana hasilnya, dan mana
                    sisi platformnya sebelum membaca angkanya. */}
                <TableRow className="hover:bg-transparent">
                  <TableHead
                    scope="col"
                    rowSpan={2}
                    className={`${KEPALA_NAMA} border-b border-slate-200 bg-slate-50`}
                  >
                    {labelKolom("nama")}
                  </TableHead>
                  {PITA.map((p) => (
                    <TableHead
                      key={p.kunci}
                      scope="col"
                      colSpan={p.kolom.length}
                      className={`${KEPALA_PITA} ${
                        p.kunci === "dana" ? "" : "border-l border-l-slate-200"
                      }`}
                    >
                      {p.label}
                    </TableHead>
                  ))}
                </TableRow>

                {/* Baris judul kolom: label saja, tanpa tombol. */}
                <TableRow className="hover:bg-transparent">
                  {KOLOM_TABEL.map((k, i) => (
                    <TableHead
                      key={k.kunci}
                      scope="col"
                      aria-sort={
                        k.kunci === "transfer"
                          ? undefined
                          : urutan.kunci === k.kunci
                            ? urutan.arah === "naik"
                              ? "ascending"
                              : "descending"
                            : "none"
                      }
                      className={`${lebarKolom(k.kunci)} border-b border-gold/40 bg-slate-50 px-2 pb-1.5 text-right align-bottom text-xs font-semibold uppercase leading-tight tracking-[0.04em] ${
                        k.kunci === "tersalurkan"
                          ? "text-navy"
                          : "text-slate-600"
                      } ${mulaiPita(i) ? "border-l border-l-slate-200" : ""}`}
                    >
                      {k.label}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>

              <TableBody>
                {baris.length === 0 ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell
                      colSpan={KOLOM_TABEL.length + 1}
                      className="border-b border-slate-200 px-3 py-6"
                    >
                      <p className="text-center text-xs text-muted-foreground">
                        Tidak ada pendana yang cocok dengan saringan ini. Angka
                        di atas tetap menghitung seluruh rekap.
                      </p>
                      <div className="mt-2 flex justify-center">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSaring("semua")}
                        >
                          Tampilkan semua pendana
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  baris.map((r) => {
                    const sedangAktif = aktif !== null && aktif === r.nama;
                    const sedangTerbuka = terbuka.includes(r.nama);
                    const rincian = rincianPerkiraan?.(r.nama) ?? [];
                    return (
                      <Fragment key={r.nama}>
                        <TableRow
                          className={`transition-colors ${
                            sedangAktif
                              ? "bg-emerald-50/60"
                              : "hover:bg-slate-50/70"
                          }`}
                        >
                          {/* Sel nama: nama, hitungan pinjamannya, dan pintu
                              lipatan. Tinggi barisnya ditentukan sel dana
                              tersalurkan, jadi di sini cukup yang tidak punya
                              kolom sendiri. Keadaan transfer tidak diulang di
                              sini — tempatnya di kolomnya. */}
                          <TableCell className="border-b border-slate-200 px-2 py-1.5 align-middle">
                            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                              <button
                                type="button"
                                aria-expanded={sedangTerbuka}
                                onClick={() => toggle(r.nama)}
                                className="group inline-flex min-w-0 items-center gap-1 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
                              >
                                {sedangTerbuka ? (
                                  <ChevronDown
                                    className="size-3.5 shrink-0 text-slate-500"
                                    aria-hidden
                                  />
                                ) : (
                                  <ChevronRight
                                    className="size-3.5 shrink-0 text-slate-500"
                                    aria-hidden
                                  />
                                )}
                                <span
                                  title={tampil(r.nama)}
                                  className="truncate text-sm font-semibold uppercase text-navy group-hover:text-emerald-800"
                                >
                                  {tampil(r.nama)}
                                </span>
                              </button>
                              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                                {r.jumlahPinjaman} pinjaman · {r.jumlahAktif}{" "}
                                berjalan · {r.jumlahLunas} lunas
                                {r.kredit !== undefined &&
                                  r.kredit.jumlahAlokasi > 0 &&
                                  ` · ${r.kredit.jumlahAlokasi} kredit`}
                              </span>
                              {sedangAktif && (
                                <span className="shrink-0 text-xs font-medium text-emerald-800">
                                  sedang disaring
                                </span>
                              )}
                            </div>
                          </TableCell>
                          {KOLOM_TABEL.map((k, i) => (
                            <Sel key={k.kunci} kunci={k.kunci} mulai={mulaiPita(i)}>
                              {k.kunci === "transfer" ? (
                                <TransferPendana r={r} />
                              ) : k.kunci === "tersalurkan" ? (
                                <>
                                  <p className="text-base font-semibold leading-tight text-navy">
                                    {rupiah(r.totalDisalurkan)}
                                  </p>
                                  <BilahDana
                                    tersalurkan={r.totalDisalurkan}
                                    berjalan={r.saldoBerjalan}
                                  />
                                </>
                              ) : (
                                <span className={k.kelas}>
                                  {rupiah(nilaiAngka(r, k.kunci))}
                                </span>
                              )}
                            </Sel>
                          ))}
                        </TableRow>

                        {sedangTerbuka && (
                          <TableRow className="hover:bg-transparent">
                            <TableCell
                              colSpan={KOLOM_TABEL.length + 1}
                              className="border-b border-slate-200 bg-slate-50/70 p-3"
                            >
                              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                                <p className="text-xs text-slate-600">
                                  Rincian{" "}
                                  <span className="font-semibold uppercase text-navy">
                                    {tampil(r.nama)}
                                  </span>
                                </p>
                                {onPilih !== undefined && (
                                  <Button
                                    variant={
                                      sedangAktif ? "default" : "outline"
                                    }
                                    size="sm"
                                    aria-pressed={sedangAktif}
                                    onClick={() => onPilih(r.nama)}
                                  >
                                    {sedangAktif
                                      ? "Lepas saringan"
                                      : "Saring daftar"}
                                  </Button>
                                )}
                              </div>
                              <IsiRincian r={r} rincian={rincian} />
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })
                )}
              </TableBody>

              {/* Baris total: menjumlahkan baris yang sedang tampil, jadi
                  pembaca bisa mencocokkannya dengan kolom di atasnya. */}
              <TableFooter>
                <TableRow className="hover:bg-transparent">
                  <TableCell className="sticky bottom-0 z-10 border-t-2 border-slate-300 bg-slate-100 px-2 py-2 align-top">
                    <p className="font-semibold text-navy">
                      {saring === "semua"
                        ? `Total baris di atas · ${totalBaris.jumlahPendana} pendana`
                        : `Total baris di atas · ${totalBaris.jumlahPendana} dari ${total.jumlahPendana} pendana`}
                    </p>
                    <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                      {totalBaris.jumlahPinjaman} pinjaman ·{" "}
                      {totalBaris.jumlahAktif} berjalan · {totalBaris.jumlahLunas}{" "}
                      lunas
                    </p>
                  </TableCell>
                  {KOLOM_TABEL.map((k, i) => (
                    <Sel
                      key={k.kunci}
                      kunci={k.kunci}
                      mulai={mulaiPita(i)}
                      kaki
                    >
                      {k.kunci === "transfer" ? (
                        totalBaris.transferBelumDicatat === 0 ? (
                          <span className="text-xs text-emerald-800">
                            semua tercatat
                          </span>
                        ) : (
                          <span className="inline-flex flex-col items-end gap-0.5">
                            <span className="text-xs font-semibold text-amber-900">
                              {totalBaris.transferBelumDicatat} belum dicatat
                            </span>
                            <span className="text-xs tabular-nums text-muted-foreground">
                              {rupiah(totalBaris.keuntunganBelumDicatat)}
                            </span>
                          </span>
                        )
                      ) : k.kunci === "tersalurkan" ? (
                        <>
                          <p className="text-sm font-semibold leading-tight text-navy">
                            {rupiah(totalBaris.totalDisalurkan)}
                          </p>
                          <BilahDana
                            tersalurkan={totalBaris.totalDisalurkan}
                            berjalan={totalBaris.saldoBerjalan}
                          />
                        </>
                      ) : (
                        <span className={k.kelas}>
                          {rupiah(nilaiTotal(totalBaris, k.kunci))}
                        </span>
                      )}
                    </Sel>
                  ))}
                </TableRow>
              </TableFooter>
            </table>
          </div>
        </div>

        <p className="mt-3 max-w-3xl text-xs leading-5 text-muted-foreground">
          Tiga pita di kepala tabel menamai pertanyaan tiap kolomnya: dana yang
          bekerja, hasilnya, dan sisi platform. Bilah di bawah{" "}
          <strong className="font-semibold text-slate-800">
            Dana tersalurkan
          </strong>{" "}
          adalah bagiannya yang masih berjalan, dan{" "}
          <strong className="font-semibold text-slate-800">
            Perkiraan (belum lunas)
          </strong>{" "}
          adalah hitungan atas pinjaman berjalan — belum menjadi uang pendana
          sampai pinjamannya lunas. Angka di baris kendali menghitung seluruh
          rekap, sedangkan baris Total di dasar tabel menjumlahkan baris yang
          sedang tampil.
        </p>
      </div>

      {/* Layar sempit: kartu per pendana, kelompok angka yang sama. */}
      <ul className="space-y-3 lg:hidden">
        <li className={`overflow-hidden ${FOLIO.kertas}`}>{kendali}</li>

        {baris.length === 0 && (
          <li className="rounded-lg border border-dashed border-slate-300 bg-slate-50/70 p-4">
            <p className="text-xs text-muted-foreground">
              Tidak ada pendana yang cocok dengan saringan ini. Angka di atas
              tetap menghitung seluruh rekap.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2 min-h-11"
              onClick={() => setSaring("semua")}
            >
              Tampilkan semua pendana
            </Button>
          </li>
        )}

        {baris.map((r) => {
          const sedangAktif = aktif !== null && aktif === r.nama;
          const sedangTerbuka = terbuka.includes(r.nama);
          const rincian = rincianPerkiraan?.(r.nama) ?? [];
          return (
            <li
              key={r.nama}
              className={`rounded-lg border bg-white p-4 ${
                sedangAktif
                  ? "border-emerald-600/50 bg-emerald-50/50"
                  : "border-slate-200"
              }`}
            >
              <p className="min-w-0 text-sm font-semibold uppercase text-navy">
                {tampil(r.nama)}
              </p>
              <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                {r.jumlahPinjaman} pinjaman · {r.jumlahAktif} berjalan ·{" "}
                {r.jumlahLunas} lunas
              </p>

              <div className="mt-3 space-y-3 text-xs">
                <div>
                  <LabelPita>Dana pendana</LabelPita>
                  <p className="mt-1 text-lg font-bold tabular-nums leading-tight text-navy">
                    {rupiah(r.totalDisalurkan)}
                  </p>
                  <BilahDana
                    tersalurkan={r.totalDisalurkan}
                    berjalan={r.saldoBerjalan}
                  />
                </div>

                <div>
                  <LabelPita>Hasil pendana</LabelPita>
                  <dl className="mt-1.5 space-y-1.5">
                    <BarisAngka
                      kunci="dibukukan"
                      nilai={rupiah(nilaiAngka(r, "dibukukan"))}
                    />
                    <BarisAngka
                      kunci="perkiraan"
                      nilai={rupiah(nilaiAngka(r, "perkiraan"))}
                    />
                    <BarisAngka
                      kunci="total"
                      nilai={rupiah(nilaiAngka(r, "total"))}
                    />
                  </dl>
                </div>

                <div>
                  <LabelPita>Platform</LabelPita>
                  <dl className="mt-1.5 space-y-1.5">
                    <BarisAngka
                      kunci="admin"
                      nilai={rupiah(nilaiAngka(r, "admin"))}
                    />
                  </dl>
                  <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-muted-foreground">
                      Transfer keuntungan
                    </span>
                    <TransferPendana r={r} ringkas />
                  </div>
                </div>
              </div>

              {/* Kartu ini yang tampil di layar sentuh, jadi tombolnya diberi
                  tinggi sasaran sentuh 44 px. */}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {onPilih !== undefined && (
                  <Button
                    variant={sedangAktif ? "default" : "outline"}
                    size="sm"
                    className="min-h-11"
                    aria-pressed={sedangAktif}
                    onClick={() => onPilih(r.nama)}
                  >
                    {sedangAktif ? "Lepas saringan" : "Saring daftar"}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="min-h-11"
                  aria-expanded={sedangTerbuka}
                  onClick={() => toggle(r.nama)}
                >
                  {sedangTerbuka ? "Tutup rincian" : "Rincian"}
                </Button>
              </div>

              {sedangTerbuka && (
                <div className="mt-3 border-t border-slate-100 pt-3">
                  <IsiRincian r={r} rincian={rincian} />
                </div>
              )}
            </li>
          );
        })}

        {/* Kartu total: di layar sempit, kaki tabel tidak terlihat, jadi
            jumlahnya mendapat kartunya sendiri. */}
        {baris.length > 0 && (
          <li className="rounded-lg border border-slate-300 bg-slate-100/80 p-4">
            <p className="font-semibold text-navy">
              {saring === "semua"
                ? `Total · ${totalBaris.jumlahPendana} pendana`
                : `Total baris di atas · ${totalBaris.jumlahPendana} dari ${total.jumlahPendana} pendana`}
            </p>
            <p className="mt-1 text-xs tabular-nums text-muted-foreground">
              {totalBaris.jumlahPinjaman} pinjaman · {totalBaris.jumlahAktif}{" "}
              berjalan · {totalBaris.jumlahLunas} lunas
            </p>
            <dl className="mt-3 space-y-1.5 text-xs">
              <div>
                <dt className="text-muted-foreground">
                  {labelKolom("tersalurkan")}
                </dt>
                <dd className="text-lg font-bold tabular-nums text-navy">
                  {rupiah(nilaiTotal(totalBaris, "tersalurkan"))}
                </dd>
                <BilahDana
                  tersalurkan={totalBaris.totalDisalurkan}
                  berjalan={totalBaris.saldoBerjalan}
                />
              </div>
              {(
                ["dibukukan", "perkiraan", "total", "admin"] as const
              ).map((kunci) => (
                <BarisAngka
                  key={kunci}
                  kunci={kunci}
                  nilai={rupiah(nilaiTotal(totalBaris, kunci))}
                />
              ))}
            </dl>
            <p className="mt-2 text-xs text-muted-foreground">
              {totalBaris.transferBelumDicatat === 0
                ? "Semua transfer keuntungan sudah dicatat"
                : `${totalBaris.transferBelumDicatat} transfer belum dicatat (${rupiah(
                    totalBaris.keuntunganBelumDicatat,
                  )})`}
            </p>
          </li>
        )}

        <li className={FOLIO.catatan}>
          Satu baris dihitung dari pinjaman yang tercatat pada pendana itu.
          Kolom{" "}
          <strong className="font-semibold text-slate-800">
            Perkiraan (belum lunas)
          </strong>{" "}
          adalah hitungan atas pinjaman yang masih berjalan, belum menjadi uang
          pendana sampai pinjamannya lunas.
        </li>
      </ul>
    </div>
  );
}
