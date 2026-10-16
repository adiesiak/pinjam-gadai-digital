import {
  ArrowDown,
  ArrowUp,
  BadgeCheck,
  Check,
  ChevronDown,
  ChevronRight,
  Plus,
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
import { FOLIO } from "@/components/penyediaDana/folio";
import {
  GUGUS,
  KOLOM_ANGKA,
  RINGKAS,
  labelKolom,
  labelSingkat,
  mulaiGugus,
  type Gugus,
} from "@/components/penyediaDana/kolom-pendana";
import type { RekapPendana } from "@/convex/penyediaDana";
import { formatRupiahAman } from "@/lib/money";
import { namaHurufBesar } from "@/lib/nama";
import {
  KOLOM_PENDANA,
  URUTAN_AWAL,
  nilaiAngka,
  nilaiTotal,
  totalPendana,
  urutkanPendana,
  type KunciUrut,
  type RincianPerkiraan,
  type TotalPendana,
  type UrutanPendana,
} from "@/lib/tabelPendana";

/**
 * Lebar kolom angka dipatok 10rem, bukan dipersentase.
 *
 * Kolom angka yang ikut melebar mengikuti halaman membuat angka sejenis
 * berjauhan, dan jarak itulah yang membuat dua baris tidak bisa dibandingkan
 * sekali pandang. Dengan lebar tetap, blok angkanya tetap rapat di kanan;
 * kolom nama yang menyerap sisa lebarnya.
 */
const LEBAR_ANGKA = "w-[10rem]";

/** Kepala kolom nama: rata kiri, selebar sisa tabel. */
const KEPALA_NAMA =
  "px-2 pb-1.5 pt-2 align-bottom text-xs font-semibold uppercase leading-tight tracking-[0.04em] text-slate-600";

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

/** Arah urutan dibaca sebagai kalimat; nama dibaca sebagai huruf, bukan besar. */
function teksArah(urutan: UrutanPendana): string {
  if (urutan.kunci === "nama")
    return urutan.arah === "naik" ? "A ke Z" : "Z ke A";
  return urutan.arah === "turun" ? "Terbesar dulu" : "Terkecil dulu";
}

/**
 * Sel angka: satu nilai di kolom yang angkanya rata kanan dan lebar tetap.
 *
 * `kaki` menandai sel baris total. Selnya sendiri yang menempel (`sticky`),
 * bukan barisnya: pada tabel ber-`border-separate` inilah bentuk yang dipakai
 * mesin peramban untuk menggulir badan tabel, dan latarnya harus solid supaya
 * baris di belakangnya tidak tembus pandang.
 */
function SelAngka({
  nilai,
  kelas = "",
  pemisah = false,
  kaki = false,
}: {
  nilai: string;
  kelas?: string;
  pemisah?: boolean;
  kaki?: boolean;
}) {
  const dasar = kaki
    ? "sticky bottom-0 z-10 border-t-2 border-slate-300 bg-slate-100 px-2 py-2 align-top"
    : "border-b border-slate-200 px-2 py-1.5 align-middle";
  return (
    <TableCell
      className={`text-right tabular-nums ${pemisah ? "border-l border-slate-200" : ""} ${dasar} ${kelas}`}
    >
      {nilai}
    </TableCell>
  );
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
        <BadgeCheck className="size-3.5 shrink-0" aria-hidden /> semua tercatat
      </span>
    );
  }
  return (
    <span
      className={`inline-flex flex-col gap-0.5 ${ringkas ? "items-start" : "items-end"}`}
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

/**
 * Penanda di sel nama: transfer yang belum dicatat.
 *
 * Di baris yang harus tetap setipis mungkin, keadaannya dibawa ikon + jumlahnya,
 * bukan kalimat penuh; kalimatnya ada di rincian baris, di baris total, dan di
 * tombol saring di atas tabel, jadi tidak ada keadaan yang hanya bisa dibaca
 * dari warnanya.
 */
function TandaTransfer({ jumlah }: { jumlah: number }) {
  if (jumlah === 0) return null;
  return (
    <span
      className="inline-flex shrink-0 items-center gap-0.5 text-amber-700"
      title={`${jumlah} transfer keuntungan belum dicatat`}
    >
      <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
      <span className="text-xs font-semibold tabular-nums">{jumlah}</span>
      <span className="sr-only"> transfer keuntungan belum dicatat</span>
    </span>
  );
}

/**
 * Isi lipatan satu baris: pinjaman pembentuk angka perkiraan dan pembagian
 * biaya platform, dua angka pendamping yang tidak muat sebagai kolom.
 */
function IsiRincian({
  r,
  rincian,
}: {
  r: RekapPendana;
  rincian: readonly RincianPerkiraan[];
}) {
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
            <ul className="divide-y divide-slate-200">
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
          </>
        )}
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          Jumlah baris di atas sama dengan kolom “Perkiraan (belum lunas)”.
        </p>
      </div>

      <div className={`${FOLIO.jalur} p-3`}>
        <p className="text-xs font-semibold text-navy">
          Angka lain di baris ini
        </p>
        <dl className="mt-2">
          {[
            {
              label: "Pinjaman (total · aktif · lunas)",
              nilai: `${r.jumlahPinjaman} · ${r.jumlahAktif} · ${r.jumlahLunas}`,
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
    </div>
  );
}

/** Satu baris label-angka di kartu layar sempit. */
function BarisAngka({
  label,
  nilai,
  kelas = "",
}: {
  label: string;
  nilai: string;
  kelas?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`tabular-nums ${kelas}`}>{nilai}</dd>
    </div>
  );
}

/**
 * Baris kendali di atas tabel: ringkasan angka kepala, saringan baris, dan
 * pengurut.
 *
 * Pengurutan tidak lagi ditempel di judul kolom: judul yang bisa diklik memaksa
 * setiap kepala kolom memuat tombol, ikon, dan cincin fokus, sehingga kepala
 * tabel lebih tinggi daripada isinya. Di sini urutan punya satu tempat, dan
 * kepala kolom cukup jadi label.
 */
function Kendali({
  total,
  saring,
  onSaring,
  gugus,
  onGugus,
  urutan,
  onKolom,
  onArah,
}: {
  total: TotalPendana;
  saring: SaringBaris;
  onSaring: (s: SaringBaris) => void;
  gugus: readonly Gugus[];
  onGugus: (g: Gugus) => void;
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

        {/* Gugus kolom punya tempatnya sendiri di sini, bukan di judul kolom:
            judul yang bisa diklik memaksa setiap kepala memuat tombol dan ikon,
            sehingga kepala tabel lebih tinggi daripada datanya. */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Kolom</span>
          <div
            role="group"
            aria-label="Gugus kolom angka yang ditampilkan"
            className="flex items-center gap-1.5"
          >
            {GUGUS.map((g) => {
              const nyala = gugus.includes(g.kunci);
              // Gugus terakhir tidak bisa dimatikan, jadi labelnya bukan tombol:
              // tidak ada kontrol yang tidak melakukan apa-apa.
              const tetapTerbuka = nyala && gugus.length === 1;
              const gaya = `inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.06em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 ${
                nyala
                  ? "border-gold/60 bg-slate-50 text-navy"
                  : "border-dashed border-slate-300 text-muted-foreground hover:border-slate-400 hover:text-navy"
              }`;
              return tetapTerbuka ? (
                <span key={g.kunci} className={gaya}>
                  <Check className="size-3 shrink-0" aria-hidden />
                  {g.label}
                </span>
              ) : (
                <button
                  key={g.kunci}
                  type="button"
                  aria-pressed={nyala}
                  title={
                    nyala
                      ? `Sembunyikan kolom ${g.label}`
                      : `Tampilkan kolom ${g.label}`
                  }
                  onClick={() => onGugus(g.kunci)}
                  className={gaya}
                >
                  {nyala ? (
                    <Check className="size-3 shrink-0" aria-hidden />
                  ) : (
                    <Plus className="size-3 shrink-0" aria-hidden />
                  )}
                  {g.label}
                </button>
              );
            })}
          </div>
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
              {KOLOM_PENDANA.map((k) => (
                <SelectItem key={k.kunci} value={k.kunci} className="text-xs">
                  {k.label}
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

      <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs text-slate-600">
        <span className="font-medium text-slate-900">
          {total.jumlahPendana} pendana
        </span>
        {KOLOM_ANGKA.filter((k) => RINGKAS.includes(k.kunci)).map((k) => (
          <span key={k.kunci} className="inline-flex items-baseline gap-1.5">
            <span aria-hidden className="text-slate-300">
              ·
            </span>            <span className={`tabular-nums ${k.kelas}`}>{rupiah(nilaiTotal(total, k.kunci))}</span>
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
 * Menjawab pertanyaan yang sama untuk SETIAP pendana dalam satu tatanan kolom:
 * berapa pokok yang sudah tersalurkan, berapa yang masih berjalan, berapa
 * keuntungan yang sudah dibukukan, berapa yang masih perkiraan, dan berapa
 * biaya platform (layanan)-nya. Kolomnya dipecah dua gugus supaya angkanya tetap lega,
 * kepala kolom melekat di puncak saat isinya digulir, barisnya diurutkan lewat
 * kontrol di atas tabel, dan setiap baris bisa diperluas untuk melihat pinjaman
 * pembentuk angka perkiraan.
 *
 * Di layar sempit tabel seperti ini tidak mungkin muat tanpa geser mendatar, jadi
 * setiap pendana ditampilkan sebagai kartu berisi angka yang sama, bukan tabel
 * yang dipotong.
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
  gugusAwal = ["dana"],
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
  /** Gugus kolom yang terbuka sejak awal; minimal satu harus tetap terbuka. */
  gugusAwal?: readonly Gugus[];
  /** Saringan baris awal. Pintu yang sama dengan `bukaAwal`, untuk uji markup. */
  saringAwal?: SaringBaris;
}) {
  const tampil = namaTampil ?? ((nama: string) => nama);
  const [urutan, setUrutan] = useState<UrutanPendana>(URUTAN_AWAL);
  const [terbuka, setTerbuka] = useState<readonly string[]>(bukaAwal);
  const [gugus, setGugus] = useState<readonly Gugus[]>(gugusAwal);
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
  const kolom = KOLOM_ANGKA.filter((k) => gugus.includes(k.gugus));
  const jumlahSel = kolom.length + 1;
  const banyakGugus = gugus.length > 1;

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

  /** Gugus terakhir tidak bisa dimatikan: tabel tanpa kolom angka bukan tabel. */
  function alihGugus(kunci: Gugus) {
    setGugus((lama) =>
      lama.includes(kunci)
        ? lama.length === 1
          ? lama
          : lama.filter((g) => g !== kunci)
        : [...lama, kunci],
    );
  }

  /** Memilih kolom yang sedang tersembunyi sekaligus menyalakan gugusnya. */
  function pilihKolom(kunci: KunciUrut) {
    setUrutan((lama) => ({
      kunci,
      arah:
        lama.kunci === kunci ? lama.arah : kunci === "nama" ? "naik" : "turun",
    }));
    const gugusKolom = KOLOM_ANGKA.find((k) => k.kunci === kunci)?.gugus;
    if (gugusKolom !== undefined) {
      setGugus((lama) =>
        lama.includes(gugusKolom) ? lama : [...lama, gugusKolom],
      );
    }
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
      gugus={gugus}
      onGugus={alihGugus}
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
            <table
              className={`w-full table-fixed caption-bottom border-separate border-spacing-0 text-sm [&_th]:whitespace-normal ${
                banyakGugus ? "min-w-[74rem]" : "min-w-[34rem]"
              }`}
            >
              <TableCaption className="sr-only">                Perbandingan dana tersalurkan, keuntungan, dan biaya platform per pendana
              </TableCaption>

              <TableHeader className="sticky top-0 z-20">
                {/*
                 * Baris gugus hanya muncul saat kedua gugus terbuka: di situ
                 * enam kolom angka perlu diberi nama gugusnya supaya terbaca
                 * mana modal dan mana hasil. Dengan satu gugus, baris itu cuma
                 * mengulang judul kolom di bawahnya.
                 */}
                {banyakGugus && (
                  <TableRow className="hover:bg-transparent">
                    <TableHead
                      scope="col"
                      rowSpan={2}
                      className={`${KEPALA_NAMA} border-b border-slate-200 bg-slate-50`}
                    >
                      {labelKolom("nama")}
                    </TableHead>
                    {kolom.map((k, i) => (
                      <TableHead
                        key={k.kunci}
                        scope="col"
                        className={`h-auto ${LEBAR_ANGKA} border-b border-slate-200 bg-slate-50 px-2 pb-1 pt-1.5 align-bottom text-xs font-semibold uppercase tracking-[0.06em] text-slate-600 ${
                          mulaiGugus(kolom, i)
                            ? "border-l border-l-slate-200"
                            : ""
                        }`}
                      >
                        {mulaiGugus(kolom, i)
                          ? GUGUS.find((g) => g.kunci === k.gugus)?.label
                          : null}
                      </TableHead>
                    ))}
                  </TableRow>
                )}

                {/* Baris judul kolom: label saja, tanpa tombol. */}
                <TableRow className="hover:bg-transparent">
                  {!banyakGugus && (
                    <TableHead
                      scope="col"
                      className={`${KEPALA_NAMA} border-b border-gold/40 bg-slate-50`}
                    >
                      {labelKolom("nama")}
                    </TableHead>
                  )}
                  {kolom.map((k, i) => (
                    <TableHead
                      key={k.kunci}
                      scope="col"
                      aria-sort={
                        urutan.kunci === k.kunci
                          ? urutan.arah === "naik"
                            ? "ascending"
                            : "descending"
                          : "none"
                      }
                      className={`${banyakGugus ? "" : LEBAR_ANGKA} border-b border-gold/40 bg-slate-50 px-2 pb-1.5 text-right align-bottom text-xs font-semibold uppercase leading-tight tracking-[0.04em] text-slate-600 ${
                        mulaiGugus(kolom, i)
                          ? "border-l border-l-slate-200"
                          : ""
                      }`}
                    >
                      {labelKolom(k.kunci)}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>

              <TableBody>
                {baris.length === 0 ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell
                      colSpan={jumlahSel}
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
                          {/* Satu baris setinggi satu baris teks: nama, penanda
                              keadaan, dan pintu lipatan. Hitungan pinjamannya
                              pindah ke rincian, karena bukan angka uang. */}
                          <TableCell className="border-b border-slate-200 px-2 py-1.5 align-middle">
                            <div className="flex items-center gap-1.5">
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
                              {/* Hitungan pinjaman hanya muat saat satu gugus
                                  terbuka (kolom nama jadi jauh lebih lebar).
                                  Saat enam kolom angka terbuka, tempatnya di
                                  rincian baris. */}
                              {!banyakGugus && (
                                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                                  {r.jumlahPinjaman} pinjaman · {r.jumlahAktif}{" "}
                                  aktif · {r.jumlahLunas} lunas
                                </span>
                              )}
                              <TandaTransfer jumlah={r.transferBelumDicatat} />
                              {sedangAktif && (
                                <span className="shrink-0 text-xs font-medium text-emerald-800">
                                  sedang disaring
                                </span>
                              )}
                            </div>
                          </TableCell>
                          {kolom.map((k, i) => (                            <SelAngka
                              key={k.kunci}
                              nilai={rupiah(nilaiAngka(r, k.kunci))}
                              kelas={k.kelas}
                              pemisah={i === 0 || kolom[i - 1]?.gugus !== k.gugus}
                            />
                          ))}
                        </TableRow>

                        {sedangTerbuka && (
                          <TableRow className="hover:bg-transparent">
                            <TableCell
                              colSpan={jumlahSel}
                              className="border-b border-slate-200 bg-slate-50/70 p-3"
                            >
                              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                                <p className="text-xs text-slate-600">
                                  Rincian{" "}
                                  <span className="font-semibold uppercase text-navy">
                                    {tampil(r.nama)}
                                  </span>{" "}
                                  · {r.jumlahPinjaman} pinjaman ·{" "}
                                  {r.jumlahAktif} aktif · {r.jumlahLunas} lunas
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
                        ? `Total · ${totalBaris.jumlahPendana} pendana`
                        : `Total baris tampil · ${totalBaris.jumlahPendana} dari ${total.jumlahPendana} pendana`}
                    </p>
                    <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                      {totalBaris.jumlahPinjaman} pinjaman ·{" "}
                      {totalBaris.jumlahAktif} aktif · {totalBaris.jumlahLunas}{" "}
                      lunas
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {totalBaris.transferBelumDicatat === 0
                        ? "Semua transfer keuntungan sudah dicatat"
                        : `${totalBaris.transferBelumDicatat} transfer belum dicatat (${rupiah(
                            totalBaris.keuntunganBelumDicatat,
                          )})`}
                    </p>
                  </TableCell>
                  {kolom.map((k, i) => (
                    <SelAngka
                      key={k.kunci}
                      nilai={rupiah(nilaiTotal(totalBaris, k.kunci))}
                      kelas={k.kelas}
                      pemisah={i === 0 || kolom[i - 1]?.gugus !== k.gugus}
                      kaki
                    />
                  ))}
                </TableRow>
              </TableFooter>
            </table>
          </div>
        </div>

        <p className="mt-3 max-w-3xl text-xs leading-5 text-muted-foreground">
          Kepala kolom melekat di puncak tabel saat isinya digulir, dan baris
          total menempel di dasarnya. Tombol{" "}
          <strong className="font-semibold text-slate-800">Dana pendana</strong>{" "}
          dan{" "}
          <strong className="font-semibold text-slate-800">
            Hasil pendana
          </strong>{" "}
          di baris kendali menyalakan atau mematikan gugus kolomnya: satu gugus
          menjaga angka tetap lega, dua gugus dipakai saat hasil perlu
          dibandingkan langsung dengan dananya. Kolom{" "}
          <strong className="font-semibold text-slate-800">
            Perkiraan (belum lunas)
          </strong>{" "}
          adalah hitungan atas pinjaman yang masih berjalan, belum menjadi uang
          pendana sampai pinjamannya lunas.
        </p>
      </div>

      {/* Layar sempit: kartu per pendana, angka yang sama. */}
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
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 text-sm font-semibold uppercase text-navy">
                  {tampil(r.nama)}
                </p>
                <TandaTransfer jumlah={r.transferBelumDicatat} />
              </div>
              <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                {r.jumlahPinjaman} pinjaman · {r.jumlahAktif} aktif ·{" "}
                {r.jumlahLunas} lunas
              </p>

              <dl className="mt-3 space-y-1.5 text-xs">
                {KOLOM_ANGKA.map((k) => (
                  <BarisAngka
                    key={k.kunci}
                    label={labelKolom(k.kunci)}
                    nilai={rupiah(nilaiAngka(r, k.kunci))}
                    kelas={k.kelas}
                  />
                ))}
              </dl>

              <div className="mt-2 flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  Transfer keuntungan
                </span>
                <TransferPendana r={r} ringkas />
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
                : `Total baris tampil · ${totalBaris.jumlahPendana} dari ${total.jumlahPendana} pendana`}
            </p>
            <p className="mt-1 text-xs tabular-nums text-muted-foreground">
              {totalBaris.jumlahPinjaman} pinjaman · {totalBaris.jumlahAktif}{" "}
              aktif · {totalBaris.jumlahLunas} lunas
            </p>
            <dl className="mt-3 space-y-1.5 text-xs">
              {KOLOM_ANGKA.map((k) => (
                <BarisAngka
                  key={k.kunci}
                  label={labelKolom(k.kunci)}
                  nilai={rupiah(nilaiTotal(totalBaris, k.kunci))}
                  kelas={k.kelas}
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
