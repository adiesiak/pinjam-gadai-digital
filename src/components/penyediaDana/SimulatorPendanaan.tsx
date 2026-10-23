/**
 * Simulator pendanaan untuk ruang pendana.
 *
 * Satu tempat untuk empat jalur: konvensional (skema tetap 30% per siklus 30
 * hari), Murabahah, Rahn, dan Qardh. Angka konvensional memakai
 * `lib/imbalPendana`, angka syariah memakai `lib/syariah/*`, jadi simulator
 * tidak punya rumus sendiri yang bisa menyimpang dari catatan portofolio.
 *
 * Yang ditampilkan adalah estimasi keuntungan bersih, bukan janji. Untuk
 * konvensional, penempatan diulang setiap siklus 30 hari dengan pokok yang
 * sama; itu asumsi yang ditulis di layar, bukan aturan kontrak.
 */
import { Calculator } from "lucide-react";
import { useState } from "react";

import { formatRupiahAman } from "@/lib/money";
import {
  PERSEN_IMBAL_PENDANA,
  TENOR_PENDANA_HARI,
  bagiHasilPendana,
} from "@/lib/imbalPendana";
import { bagiHasilMurabahah, hargaJualMurabahah } from "@/lib/syariah/murabahah";
import { MARGIN_MURABAHAH_BAWAAN } from "@/lib/syariah/pengajuan";
import { bagiHasilQardh } from "@/lib/syariah/qardh";
import { bagiHasilRahn } from "@/lib/syariah/rahn";

type Akad = "konvensional" | "murabahah" | "rahn" | "qardh";

const AKAD: readonly { id: Akad; label: string }[] = [
  { id: "konvensional", label: "Konvensional" },
  { id: "murabahah", label: "Murabahah" },
  { id: "rahn", label: "Rahn" },
  { id: "qardh", label: "Qardh" },
];

const SIKLUS = [1, 3, 6] as const;
const TENOR_RAHN = [30, 60, 90] as const;
const NOMINAL_AWAL = 1_000_000;

function rupiah(nilai: number): string {
  return formatRupiahAman(nilai);
}

function bacaNominal(teks: string): number {
  const digit = teks.replace(/\D/g, "");
  if (digit === "") return 0;
  const angka = Number(digit);
  return Number.isSafeInteger(angka) ? angka : 0;
}

function Baris({ label, nilai }: { label: string; nilai: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-slate-200 py-1.5 text-xs last:border-b-0">
      <dt className="text-slate-600">{label}</dt>
      <dd className="text-right font-medium tabular-nums text-slate-900">
        {nilai}
      </dd>
    </div>
  );
}

export function SimulatorPendanaan({
  persenPotonganAdmin,
}: {
  /** Biaya platform dari Pengaturan Sistem, dalam persen. */
  persenPotonganAdmin: number;
}) {
  const [akad, setAkad] = useState<Akad>("konvensional");
  const [nominalTeks, setNominalTeks] = useState(
    NOMINAL_AWAL.toLocaleString("id-ID"),
  );
  const [siklus, setSiklus] = useState<(typeof SIKLUS)[number]>(1);
  const [marginTeks, setMarginTeks] = useState(
    String(MARGIN_MURABAHAH_BAWAAN),
  );
  const [taksiranTeks, setTaksiranTeks] = useState("2.000.000");
  const [pokokGadaiTeks, setPokokGadaiTeks] = useState("1.600.000");
  const [tenorRahn, setTenorRahn] = useState<(typeof TENOR_RAHN)[number]>(30);

  const nominal = bacaNominal(nominalTeks);
  const taksiran = bacaNominal(taksiranTeks);
  const pokokGadai = bacaNominal(pokokGadaiTeks);
  const margin = Number(marginTeks.replace(",", ".")) || 0;

  let keuntungan: number | null = null;
  let rincian: React.ReactNode = null;

  try {
    if (akad === "konvensional") {
      if (nominal > 0) {
        const perSiklus = bagiHasilPendana(nominal, persenPotonganAdmin);
        keuntungan = perSiklus.keuntungan * siklus;
        rincian = (
          <>
            <Baris label="Imbal hasil bruto per siklus" nilai={rupiah(perSiklus.imbal)} />
            <Baris
              label={`Biaya platform (${persenPotonganAdmin}%) per siklus`}
              nilai={rupiah(perSiklus.potonganAdmin)}
            />
            <Baris
              label="Diterima bersih per siklus"
              nilai={rupiah(perSiklus.diterima)}
            />
            <Baris
              label={`Keuntungan ${siklus} siklus`}
              nilai={rupiah(perSiklus.keuntungan * siklus)}
            />
          </>
        );
      }
    } else if (akad === "murabahah") {
      if (nominal > 0) {
        const hargaJual = hargaJualMurabahah(nominal, margin);
        const hasil = bagiHasilMurabahah({ hargaPokok: nominal, hargaJual });
        keuntungan = hasil.nisbahPendana;
        rincian = (
          <>
            <Baris label="Harga pokok" nilai={rupiah(hasil.hargaPokok)} />
            <Baris label="Harga jual" nilai={rupiah(hasil.hargaJual)} />
            <Baris label="Margin total" nilai={rupiah(hasil.marginTotal)} />
            <Baris
              label={`Nisbah pendana (${hasil.persenPendana}%)`}
              nilai={rupiah(hasil.nisbahPendana)}
            />
            <Baris
              label={`Ujrah pengelola (${hasil.persenPlatform}%)`}
              nilai={rupiah(hasil.platformTerima)}
            />
          </>
        );
      }
    } else if (akad === "rahn") {
      if (taksiran > 0 && pokokGadai > 0 && pokokGadai <= taksiran) {
        const hasil = bagiHasilRahn({
          nilaiTaksiran: taksiran,
          pokokGadai,
          tenorHari: tenorRahn,
        });
        keuntungan = hasil.nisbahPendana;
        rincian = (
          <>
            <Baris
              label="Ujrah pemeliharaan per 30 hari"
              nilai={rupiah(hasil.ujrahPerSiklus)}
            />
            <Baris label="Total ujrah" nilai={rupiah(hasil.ujrahTotal)} />
            <Baris
              label={`Nisbah pendana (${hasil.persenPendana}%)`}
              nilai={rupiah(hasil.nisbahPendana)}
            />
            <Baris
              label={`Ujrah pengelola (${hasil.persenPlatform}%)`}
              nilai={rupiah(hasil.platformTerima)}
            />
          </>
        );
      }
    } else if (nominal > 0) {
      const hasil = bagiHasilQardh(nominal);
      keuntungan = 0;
      rincian = (
        <>
          <Baris label="Margin" nilai="Rp 0" />
          <Baris label="Pokok kembali" nilai={rupiah(hasil.pendanaTerima)} />
          <Baris label="Tiket doorprize" nilai={String(hasil.tiketDoorprize)} />
        </>
      );
    }
  } catch {
    keuntungan = null;
  }

  const nominalValid =
    akad === "rahn"
      ? taksiran >= 100_000 && pokokGadai > 0 && pokokGadai <= taksiran
      : nominal > 0;

  return (
    <section
      aria-labelledby="judul-simulator-pendanaan"
      className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
    >
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-800">
          <Calculator className="size-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2
            id="judul-simulator-pendanaan"
            className="text-sm font-semibold text-navy"
          >
            Simulasikan return
          </h2>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
            Pilih akad, isi nominal, dan lihat estimasi keuntungan bersih
            sebelum menempatkan dana.
          </p>
        </div>
      </div>

      <div
        className="mt-4 flex flex-wrap gap-2"
        role="group"
        aria-label="Jenis akad"
      >
        {AKAD.map((pilihan) => (
          <button
            key={pilihan.id}
            type="button"
            aria-pressed={akad === pilihan.id}
            onClick={() => setAkad(pilihan.id)}
            className={`min-h-11 rounded-lg border px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              akad === pilihan.id
                ? "border-emerald-700/50 bg-emerald-50 text-emerald-900"
                : "border-border bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            {pilihan.label}
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,16rem)_minmax(0,1fr)] sm:items-start">
        <div>
          {akad === "rahn" ? (
            <>
              <label
                htmlFor="simulator-taksiran"
                className="text-xs font-medium text-slate-700"
              >
                Nilai taksiran
              </label>
              <div className="mt-1 flex items-center rounded-xl border border-slate-300 bg-white focus-within:border-emerald-600 focus-within:ring-2 focus-within:ring-emerald-600/20">
                <span className="pl-3 text-xs font-medium text-slate-500">Rp</span>
                <input
                  id="simulator-taksiran"
                  inputMode="numeric"
                  autoComplete="off"
                  value={taksiranTeks}
                  onChange={(event) =>
                    setTaksiranTeks(event.target.value.replace(/[^0-9.]/g, ""))
                  }
                  className="min-w-0 flex-1 bg-transparent px-2 py-2 text-sm font-semibold tabular-nums text-navy outline-none"
                />
              </div>

              <label
                htmlFor="simulator-pokok-gadai"
                className="mt-3 block text-xs font-medium text-slate-700"
              >
                Pokok gadai
              </label>
              <div className="mt-1 flex items-center rounded-xl border border-slate-300 bg-white focus-within:border-emerald-600 focus-within:ring-2 focus-within:ring-emerald-600/20">
                <span className="pl-3 text-xs font-medium text-slate-500">Rp</span>
                <input
                  id="simulator-pokok-gadai"
                  inputMode="numeric"
                  autoComplete="off"
                  value={pokokGadaiTeks}
                  onChange={(event) =>
                    setPokokGadaiTeks(event.target.value.replace(/[^0-9.]/g, ""))
                  }
                  className="min-w-0 flex-1 bg-transparent px-2 py-2 text-sm font-semibold tabular-nums text-navy outline-none"
                />
              </div>

              <p className="mt-3 text-xs font-medium text-slate-700">Tenor</p>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {TENOR_RAHN.map((tenor) => (
                  <button
                    key={tenor}
                    type="button"
                    aria-pressed={tenorRahn === tenor}
                    onClick={() => setTenorRahn(tenor)}
                    className={`min-h-11 rounded-lg border px-3 text-xs font-semibold tabular-nums ${
                      tenorRahn === tenor
                        ? "border-emerald-700/50 bg-emerald-50 text-emerald-900"
                        : "border-border bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {tenor} hari
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <label
                htmlFor="simulator-nominal"
                className="text-xs font-medium text-slate-700"
              >
                {akad === "konvensional"
                  ? "Dana yang ditempatkan"
                  : akad === "murabahah"
                    ? "Modal harga pokok"
                    : "Dana kebajikan"}
              </label>
              <div className="mt-1 flex items-center rounded-xl border border-slate-300 bg-white focus-within:border-emerald-600 focus-within:ring-2 focus-within:ring-emerald-600/20">
                <span className="pl-3 text-xs font-medium text-slate-500">Rp</span>
                <input
                  id="simulator-nominal"
                  inputMode="numeric"
                  autoComplete="off"
                  value={nominalTeks}
                  onChange={(event) =>
                    setNominalTeks(event.target.value.replace(/[^0-9.]/g, ""))
                  }
                  className="min-w-0 flex-1 bg-transparent px-2 py-2 text-sm font-semibold tabular-nums text-navy outline-none"
                />
              </div>

              {akad === "konvensional" && (
                <>
                  <p className="mt-3 text-xs font-medium text-slate-700">
                    Siklus penempatan
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    {SIKLUS.map((jumlah) => (
                      <button
                        key={jumlah}
                        type="button"
                        aria-pressed={siklus === jumlah}
                        onClick={() => setSiklus(jumlah)}
                        className={`min-h-11 rounded-lg border px-3 text-xs font-semibold tabular-nums ${
                          siklus === jumlah
                            ? "border-emerald-700/50 bg-emerald-50 text-emerald-900"
                            : "border-border bg-white text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        {jumlah * TENOR_PENDANA_HARI} hari
                      </button>
                    ))}
                  </div>
                  <p className="mt-1.5 text-[11px] leading-4 text-slate-500">
                    Angka beberapa siklus mengasumsikan pokok yang sama
                    ditempatkan ulang setiap 30 hari.
                  </p>
                </>
              )}

              {akad === "murabahah" && (
                <>
                  <label
                    htmlFor="simulator-margin"
                    className="mt-3 block text-xs font-medium text-slate-700"
                  >
                    Margin keuntungan (%)
                  </label>
                  <input
                    id="simulator-margin"
                    inputMode="numeric"
                    autoComplete="off"
                    value={marginTeks}
                    onChange={(event) =>
                      setMarginTeks(event.target.value.replace(/[^0-9.,]/g, ""))
                    }
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold tabular-nums text-navy focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
                  />
                </>
              )}
            </>
          )}

          <p className="mt-2 text-[11px] leading-4 text-slate-500">
            {akad === "konvensional"
              ? `Imbal hasil tetap ${PERSEN_IMBAL_PENDANA}% per ${TENOR_PENDANA_HARI} hari, terpisah dari tenor pinjaman nasabah.`
              : akad === "murabahah"
                ? "Margin disepakati di akad; nisbah pendana 85%."
                : akad === "rahn"
                  ? "Ujrah 2% dari taksiran per 30 hari; pokok kembali 100%."
                  : "Tanpa margin. Satu tiket per Rp1.000.000 penempatan."}
          </p>
        </div>

        <div className="min-w-0 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
          {keuntungan === null || !nominalValid ? (
            <p className="text-xs leading-5 text-slate-600">
              {akad === "rahn" && pokokGadai > taksiran
                ? "Pokok gadai tidak boleh melebihi nilai taksiran."
                : "Isi nominal untuk melihat estimasi."}
            </p>
          ) : (
            <>
              <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500">
                Estimasi keuntungan bersih
              </p>
              <p className="mt-0.5 text-2xl font-semibold tabular-nums text-emerald-800">
                {rupiah(keuntungan)}
              </p>
              <dl className="mt-2">{rincian}</dl>
            </>
          )}
          <p className="mt-2 text-[11px] leading-5 text-slate-500">
            Estimasi, bukan jaminan. Imbal hasil baru menjadi uang Anda setelah
            pinjaman lunas.
          </p>
        </div>
      </div>
    </section>
  );
}
