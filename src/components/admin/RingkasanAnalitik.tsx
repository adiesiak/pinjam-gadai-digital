import { useQuery } from "convex/react";
import { AlertTriangle, ArrowRight, ChartLine, ClipboardCopy, Loader2, PieChart } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import type {
  AdminAnalitikData,
  AdminOverviewData,
} from "@/components/admin/admin-shared";
import type { AdminStatsData } from "@/pages/admin/admin-shell";
import {
  atributPoints,
  busurDonut,
  daftarPeringatanRisiko,
  hitungTingkat,
  komposisiStatusPinjaman,
  koordinatGaris,
  maksimumSeri,
  METRIK_RISIKO_KOSONG,
  persenBagian,
  seriTren30Hari,
  totalKomposisi,
  totalTren,
  type BagianKomposisi,
  type MetrikRisiko,
  type PeringatanRisiko,
  type TitikTren,
} from "@/lib/analitikAdmin";
import { hitungMenunggu } from "@/lib/admin-queue";
import { formatRupiah } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * ANALITIK & RISIKO PADA "RINGKASAN HARI INI".
 *
 * Dua kartu grafik (tren 30 hari + komposisi status) dan satu widget peringatan
 * risiko. Semuanya MEMBACA keadaan yang sudah ada: peristiwa `didanaiPada` /
 * `lunasPada` lewat query `admin.adminAnalitik`, dan agregat `stats` +
 * pengajuan yang menunggu keputusan. Tidak ada mutation baru dan tidak ada
 * status yang dihitung ulang di klien.
 *
 * Kenapa grafiknya SVG biasa, bukan pustaka grafik: satu-satunya modul grafik di
 * repo (`ui/chart.tsx`) menarik `recharts`, dan halaman ini tidak pernah
 * memuatnya. Menambahkannya berarti menambah pohon dependensi baru — dan di
 * lingkungan ini `recharts` bahkan gagal dimuat (`object-assign` tidak
 * ter-resolve dari `prop-types`). SVG biasa berarti: nol dependensi baru,
 * geometrinya bisa dihitung di `lib/analitikAdmin.ts`, dan hasilnya bisa
 * diverifikasi di uji render (posisi titik & panjang busur benar-benar terbaca).
 *
 * Dua kartu itu dipisah menjadi komponen yang diekspor (`GrafikTren`,
 * `DonutStatus`) supaya bisa diuji sendiri, dan `RingkasanAnalitikView` tetap
 * murni tanpa hook Convex.
 */

/* ===== Grafik tren: garis, dua seri, sumbu sederhana ===== */

const LEBAR_GRAFIK = 560;
const TINGGI_GRAFIK = 180;
/** Ruang kiri untuk label sumbu Y; sisanya milik garis. */
const PADAT_KIRI = 46;
const LEBAR_PLOT = LEBAR_GRAFIK - PADAT_KIRI;

/** Tick sumbu Y dalam juta/ribu rupiah — sumbu tidak muat angka penuh. */
function tickRupiah(nilai: number): string {
  if (Math.abs(nilai) >= 1_000_000) return `${Math.round(nilai / 1_000_000)}jt`;
  if (Math.abs(nilai) >= 1_000) return `${Math.round(nilai / 1_000)}rb`;
  return `${Math.round(nilai)}`;
}

/** Label pendek nilai rupiah untuk lencana total (mis. "Rp2 jt"). */
function rupiahRingkas(nilai: number): string {
  if (nilai >= 1_000_000) {
    const juta = nilai / 1_000_000;
    return `Rp${juta.toLocaleString("id-ID", { maximumFractionDigits: 1 })} jt`;
  }
  return formatRupiah(nilai);
}

/**
 * Grafik garis: pencairan (hijau penuh) vs pelunasan (garis putus-putus).
 * Keduanya memakai skala YANG SAMA — kalau tidak, dua garis dengan tinggi serupa
 * bisa mewakili angka yang jauh berbeda dan grafiknya jadi menyesatkan.
 */
export function GrafikTren({ tren }: { tren: readonly TitikTren[] }) {
  const pencairan = tren.map((t) => t.pencairan);
  const pelunasan = tren.map((t) => t.pelunasan);
  const maks = maksimumSeri(pencairan, pelunasan);
  const garisPencairan = koordinatGaris(pencairan, { lebar: LEBAR_PLOT, tinggi: TINGGI_GRAFIK, maks });
  const garisPelunasan = koordinatGaris(pelunasan, { lebar: LEBAR_PLOT, tinggi: TINGGI_GRAFIK, maks });
  const tick = [maks, maks / 2, 0];
  const pertama = tren[0];
  const terakhir = tren[tren.length - 1];

  return (
    <svg
      viewBox={`0 0 ${LEBAR_GRAFIK} ${TINGGI_GRAFIK + 22}`}
      className="h-56 w-full"
      role="img"
      aria-label={`Grafik tren ${tren.length} hari: total pencairan ${formatRupiah(
        totalTren(tren).pencairan,
      )} dan total pelunasan ${formatRupiah(totalTren(tren).pelunasan)}`}
    >
      <title>Tren pencairan dan pelunasan 30 hari terakhir</title>
      {/* Garis bantu + label sumbu Y (rupiah ringkas). */}
      {tick.map((nilai, i) => {
        const y = (i / (tick.length - 1)) * TINGGI_GRAFIK;
        return (
          <g key={nilai}>
            <line
              x1={PADAT_KIRI}
              x2={LEBAR_GRAFIK}
              y1={y}
              y2={y}
              stroke="#e2e8f0"
              strokeWidth={1}
              strokeDasharray={i === tick.length - 1 ? undefined : "3 3"}
            />
            <text x={PADAT_KIRI - 6} y={y + 3} textAnchor="end" fontSize={9} fill="#64748b">
              {tickRupiah(nilai)}
            </text>
          </g>
        );
      })}

      <g transform={`translate(${PADAT_KIRI}, 0)`}>
        {garisPencairan.length > 0 && (
          <polyline
            points={atributPoints(garisPencairan)}
            fill="none"
            stroke="#047857"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}
        {garisPelunasan.length > 0 && (
          <polyline
            points={atributPoints(garisPelunasan)}
            fill="none"
            stroke="#64748b"
            strokeWidth={2}
            strokeDasharray="4 3"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}
      </g>

      {/* Label sumbu X: hanya ujung-ujungnya, supaya 30 label tidak bertumpuk. */}
      {pertama !== undefined && (
        <text x={PADAT_KIRI} y={TINGGI_GRAFIK + 16} fontSize={9} fill="#64748b">
          {pertama.label}
        </text>
      )}
      {terakhir !== undefined && terakhir.label !== pertama?.label && (
        <text x={LEBAR_GRAFIK} y={TINGGI_GRAFIK + 16} textAnchor="end" fontSize={9} fill="#64748b">
          {terakhir.label}
        </text>
      )}
    </svg>
  );
}

/* ===== Donut komposisi status ===== */

const RADIUS_DONUT = 54;
const PUSAT_DONUT = 64;

/** Donut berbasis `stroke-dasharray` pada satu lingkaran — tanpa dependensi. */
export function DonutStatus({ bagian }: { bagian: readonly BagianKomposisi[] }) {
  const total = totalKomposisi(bagian);
  const busur = busurDonut(bagian, RADIUS_DONUT);
  if (busur.length === 0) return null;
  return (
    <svg
      viewBox={`0 0 ${PUSAT_DONUT * 2} ${PUSAT_DONUT * 2}`}
      className="mx-auto size-40"
      role="img"
      aria-label={`Donut komposisi status: ${bagian
        .map((b) => `${b.label} ${b.nilai}`)
        .join(", ")}`}
    >
      <title>Komposisi status pinjaman</title>
      <g transform={`rotate(-90 ${PUSAT_DONUT} ${PUSAT_DONUT})`}>
        {busur.map((b) => (
          <circle
            key={b.kunci}
            cx={PUSAT_DONUT}
            cy={PUSAT_DONUT}
            r={RADIUS_DONUT}
            fill="none"
            stroke={b.warna}
            strokeWidth={16}
            strokeDasharray={b.dashArray}
            strokeDashoffset={b.dashOffset}
            strokeLinecap="butt"
          />
        ))}
      </g>
      <text
        x={PUSAT_DONUT}
        y={PUSAT_DONUT - 2}
        textAnchor="middle"
        fontSize={22}
        fontWeight={700}
        fill="#0f172a"
      >
        {total}
      </text>
      <text x={PUSAT_DONUT} y={PUSAT_DONUT + 14} textAnchor="middle" fontSize={9} fill="#64748b">
        pinjaman
      </text>
    </svg>
  );
}

/** Baris legenda donut — dibuat sendiri supaya angkanya terbaca & teruji. */
function LegendaKomposisi({ bagian, total }: { bagian: BagianKomposisi[]; total: number }) {
  return (
    <ul className="mt-3 space-y-1.5">
      {bagian.map((b) => {
        const persen = persenBagian(b, total);
        return (
          <li key={b.kunci} className="flex items-center gap-2 text-xs">
            <span
              aria-hidden="true"
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: b.warna }}
            />
            <span className="min-w-0 flex-1 text-slate-700">{b.label}</span>
            <span className="tabular-nums font-semibold text-navy">{b.nilai}</span>
            <span className="w-10 text-right tabular-nums text-muted-foreground">
              {persen === null ? "—" : `${persen}%`}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Kartu dasar kedua grafik — satu bentuk, jadi tidak ada dua gaya kartu. */
function KartuGrafik({
  judul,
  keterangan,
  Icon,
  children,
}: {
  judul: string;
  keterangan: string;
  Icon: typeof ChartLine;
  children: React.ReactNode;
}) {
  return (
    <section className="animate-masuk flex min-w-0 flex-col rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <div className="flex items-start gap-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-900">
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-navy">{judul}</p>
          <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{keterangan}</p>
        </div>
      </div>
      <div className="mt-3 min-w-0 flex-1">{children}</div>
    </section>
  );
}

/**
 * Bagian tampilan MURNI: semua angka datang dari props, tanpa hook Convex.
 * Dipakai `RingkasanAnalitik` maupun uji render.
 */
export function RingkasanAnalitikView({
  tren,
  komposisi,
  risiko,
  onBukaModul,
}: {
  tren: TitikTren[];
  komposisi: BagianKomposisi[];
  risiko: PeringatanRisiko[];
  /** Dipanggil dengan nilai modul admin (mis. "lokasi", "dpd"). */
  onBukaModul: (modul: string) => void;
}) {
  const [menyalin, setMenyalin] = useState(false);
  const total = totalTren(tren);
  const totalStatus = totalKomposisi(komposisi);
  const perTingkat = hitungTingkat(risiko);

  /**
   * Salin ringkasan risiko ke papan klip sebagai teks polos — supaya admin bisa
   * meneruskan temuan ke rekan tanpa memotret layar. Umpan baliknya lewat toast
   * (sukses DAN gagal), karena papan klip bisa diblokir peramban.
   */
  const salinRingkasan = async () => {
    setMenyalin(true);
    try {
      const baris = [
        `Ringkasan risiko PINDAI — ${risiko.length} temuan (${perTingkat.tinggi} tinggi, ${perTingkat.sedang} sedang)`,
        ...risiko.map(
          (p) => `- [${p.tingkat.toUpperCase()}] ${p.judul}: ${p.detail} (nilai: ${p.nilai})`,
        ),
      ];
      if (typeof navigator === "undefined" || navigator.clipboard === undefined) {
        throw new Error("Peramban ini tidak mengizinkan penyalinan otomatis.");
      }
      await navigator.clipboard.writeText(baris.join("\n"));
      toast.success(`${risiko.length} temuan risiko disalin ke papan klip.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menyalin ringkasan risiko.");
    } finally {
      setMenyalin(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <KartuGrafik
          judul="Tren Pencairan & Pelunasan (30 Hari)"
          keterangan="Nominal POKOK pinjaman yang dicairkan dan dilunasi per hari kalender. Hari tanpa transaksi dihitung nol, bukan dilewati."
          Icon={ChartLine}
        >
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
            <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
              Pencairan {rupiahRingkas(total.pencairan)}
            </Badge>
            <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-100">
              Pelunasan {rupiahRingkas(total.pelunasan)}
            </Badge>
            <span className="text-[11px] text-muted-foreground">{tren.length} hari terakhir</span>
          </div>
          <p className="mb-1 text-[10px] text-muted-foreground">
            — pencairan (hijau) · – – pelunasan (abu) · skala Y sama untuk keduanya
          </p>
          <GrafikTren tren={tren} />
        </KartuGrafik>

        <KartuGrafik
          judul="Komposisi Status Pinjaman"
          keterangan="Pinjaman berjalan (Lancar), yang masih ditinjau, dan yang sudah melewati jatuh tempo."
          Icon={PieChart}
        >
          {totalStatus === 0 ? (
            <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-center text-xs text-muted-foreground">
              Belum ada pinjaman berjalan maupun ditinjau, jadi komposisinya belum bisa dihitung.
            </p>
          ) : (
            <>
              <DonutStatus bagian={komposisi} />
              <LegendaKomposisi bagian={komposisi} total={totalStatus} />
              <p className="mt-2 text-[11px] text-muted-foreground">
                Total {totalStatus} pinjaman berjalan & ditinjau.
              </p>
            </>
          )}
        </KartuGrafik>
      </div>

      {/* ── Widget peringatan risiko: nada amber sesuai ketentuan ── */}
      <section className="animate-masuk rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
              <AlertTriangle className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-amber-900">Potensi risiko tinggi</p>
              <p className="mt-0.5 text-[11px] leading-4 text-amber-800">
                Diambil dari lokasi pinjaman aktif, keterlambatan jatuh tempo, dan pengajuan yang
                pendapatannya di bawah ambang kewajaran.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="bg-red-100 text-red-800 hover:bg-red-100">
              {perTingkat.tinggi} tinggi
            </Badge>
            <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
              {perTingkat.sedang} sedang
            </Badge>
            {risiko.length > 0 && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={menyalin}
                onClick={() => void salinRingkasan()}
                className="bg-white"
              >
                {menyalin ? (
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                ) : (
                  <ClipboardCopy className="mr-1.5 size-3.5" />
                )}
                Salin ringkasan
              </Button>
            )}
          </div>
        </div>

        {risiko.length === 0 ? (
          <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-900">
            Tidak ada sinyal risiko yang aktif saat ini — lokasi, jatuh tempo, dan kemampuan bayar
            pengajuan baru semuanya dalam batas.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {risiko.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-amber-200 bg-white px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-amber-900">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                        p.tingkat === "tinggi"
                          ? "bg-red-100 text-red-800"
                          : "bg-amber-100 text-amber-800",
                      )}
                    >
                      {p.tingkat}
                    </span>
                    {p.judul}
                    <span className="tabular-nums text-[11px] font-medium text-amber-700">
                      {p.nilai} kasus
                    </span>
                  </p>
                  <p className="mt-1 text-[11px] leading-4 text-slate-600">{p.detail}</p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="shrink-0 gap-1.5 bg-white"
                  onClick={() => onBukaModul(p.modul)}
                >
                  Tinjau <ArrowRight className="size-3.5" aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/**
 * Versi tersambung: ambil peristiwa tren dari server, hitung peringatan risiko
 * dari agregat yang sudah dimiliki panel admin, lalu serahkan ke `View`.
 *
 * Peringatan hanya dibangun dari angka yang MEMANG ada (`stats` + hitungan
 * pengajuan menunggu + jumlah pendapatan di bawah ambang dari server). Bila
 * salah satu sumber belum dimuat, metriknya dianggap 0 — peringatan tidak
 * dikarang dari data yang belum tiba.
 */
export function RingkasanAnalitik({
  stats,
  overview,
  onBukaModul,
  analitik: analitikProp,
}: {
  stats: AdminStatsData | undefined;
  overview: AdminOverviewData;
  onBukaModul: (modul: string) => void;
  /**
   * Hasil `adminAnalitik` yang sudah ikut `adminOverview`. Bila dioper, langganan
   * sendiri dilewati (`"skip"`) supaya tabel pinjaman tidak dipindai dua kali
   * untuk satu layar. Tanpa prop ini komponen tetap memuat sendiri, jadi ia bisa
   * dipakai terpisah (mis. di harness render).
   */
  analitik?: AdminAnalitikData;
}) {
  const dariServer = useQuery(
    api.admin.adminAnalitik,
    analitikProp === undefined ? {} : "skip",
  );
  const analitik = analitikProp ?? dariServer;
  // Jam klien dipakai untuk membulatkan hari; server sudah menyaring rentangnya,
  // jadi selisih beberapa detik tidak mengubah titik mana pun.
  const sekarang = Date.now();

  const metrik: MetrikRisiko =
    stats === undefined
      ? METRIK_RISIKO_KOSONG
      : {
          gpsMismatch: stats.gpsMismatch,
          pinjamanTanpaLokasi: stats.pinjamanTanpaLokasi,
          titikDicurigai: stats.titikDicurigai,
          peringatanLokasiAktif: stats.peringatanLokasiAktif,
          pinjamanTerlambat: stats.pinjamanTerlambat,
          pengajuanMenunggu:
            hitungMenunggu(overview.loans, "pinjaman") +
            hitungMenunggu(overview.pawns, "gadai") +
            hitungMenunggu(overview.kredit, "kredit"),
          pendapatanDiBawahAmbang: analitik?.pendapatanDiBawahAmbang ?? 0,
        };

  if (analitik === undefined) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-8 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Memuat analitik 30 hari…
      </div>
    );
  }

  return (
    <RingkasanAnalitikView
      tren={seriTren30Hari(analitik.peristiwa, sekarang)}
      komposisi={komposisiStatusPinjaman(analitik.komposisi)}
      risiko={daftarPeringatanRisiko(metrik)}
      onBukaModul={onBukaModul}
    />
  );
}
