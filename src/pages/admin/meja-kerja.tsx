import { motion } from "framer-motion";
import {
  BellRing,
  ChevronRight,
  ClipboardList,
  Landmark,
  MapPin,
  ShieldCheck,
} from "lucide-react";
import type { ComponentType } from "react";

import type {
  AdminOverviewData,
  LedgerSummary,
} from "@/components/admin/admin-shared";
import { Button } from "@/components/ui/button";
import {
  jumlahPerhatianLokasi,
  jumlahPerluKeputusan,
  type NilaiModulAdmin,
} from "@/lib/admin-queue";
import { fadeUpItem, staggerContainer } from "@/lib/motion";
import { formatRupiah } from "@/lib/money";

import type { AdminStatsData } from "./admin-shell";

/**
 * Panel "Hari Ini" — meja kerja admin.
 *
 * Menjawab satu pertanyaan: "apa yang perlu saya tindak sekarang?", dari data
 * yang tab-tab lain sudah muat sendiri. Panel ini tidak meminta query baru,
 * tidak mengubah apa pun, dan tiap kartu hanya menautkan ke modul yang
 * menanganinya.
 *
 * Aturan angka (wajib): data yang belum siap **bukan** nol. `undefined` berarti
 * Convex belum mengirim datanya — tampilkan "—" dengan `aria-busy`, karena 0
 * akan membuat admin menyimpulkan "aman" dari data yang belum ada.
 */

/** Keadaan angka satu kartu. */
type Angka = {
  /** Sumber belum siap → tampilkan tanda pisah, bukan angka. */
  memuat: boolean;
  teks: string;
  catatan: string | null;
};

/** Ubah nilai opsional menjadi keadaan tampilan yang jujur. */
function angkaRingkas(nilai: number | undefined): Angka {
  if (nilai === undefined) return { memuat: true, teks: "—", catatan: null };
  if (nilai === 0) {
    return { memuat: false, teks: "0", catatan: "Tidak ada yang perlu ditindak." };
  }
  return { memuat: false, teks: `${nilai}`, catatan: null };
}

const TONE = {
  amber: "border-amber-100 bg-amber-50 text-amber-700",
  red: "border-red-100 bg-red-50 text-red-700",
  sky: "border-sky-100 bg-sky-50 text-sky-700",
  mint: "border-emerald-100 bg-emerald-50 text-emerald-700",
} as const;

type Tone = keyof typeof TONE;

/** Satu kartu ringkasan: label, angka besar, catatan, dan pintu ke modul asalnya. */
function Kartu({
  Icon,
  label,
  angka,
  tone,
  cta,
  onBuka,
}: {
  Icon: ComponentType<{ className?: string }>;
  label: string;
  angka: Angka;
  tone: Tone;
  /** Label tombol — harus jelas ke mana ia menuju. */
  cta: string;
  onBuka: () => void;
}) {
  return (
    <motion.div
      variants={fadeUpItem}
      className="flex flex-col rounded-xl border border-slate-200 bg-white p-3 transition-colors hover:border-slate-300 min-[380px]:rounded-2xl min-[380px]:p-4 sm:p-5"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium leading-5 text-muted-foreground">{label}</p>
        <span
          className={`flex size-8 shrink-0 items-center justify-center rounded-xl border ${TONE[tone]}`}
        >
          <Icon className="size-4" />
        </span>
      </div>

      <p
        aria-busy={angka.memuat || undefined}
        className={`mt-2 break-words text-lg font-bold tracking-tight tabular-nums min-[380px]:mt-3 min-[380px]:text-xl sm:text-2xl ${
          angka.memuat ? "text-slate-400" : "text-navy"
        }`}
      >
        {angka.teks}
      </p>

      {angka.catatan !== null && (
        <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{angka.catatan}</p>
      )}

      <Button
        variant="outline"
        size="sm"
        className="mt-4 w-full justify-between rounded-xl"
        onClick={onBuka}
      >
        {cta}
        <ChevronRight className="size-4" />
      </Button>
    </motion.div>
  );
}

/** Panel ringkasan "Hari Ini". */
export function MejaKerja({
  overview,
  stats,
  ledger,
  onBukaModul,
}: {
  overview: AdminOverviewData;
  stats: AdminStatsData | undefined;
  ledger: LedgerSummary | undefined;
  /** Pindah ke modul yang menangani kartu ini. */
  onBukaModul: (modul: NilaiModulAdmin) => void;
}) {
  const perluKeputusan = angkaRingkas(jumlahPerluKeputusan(overview));
  const terlambat = angkaRingkas(stats?.pinjamanTerlambat);
  const lokasi = angkaRingkas(
    stats === undefined ? undefined : jumlahPerhatianLokasi(stats),
  );

  // Kartu ledger bukan angka: pertanyaannya "seimbang atau tidak", dan nominal
  // biaya yang sudah dijurnal hanya menjadi catatan pendukung.
  const ledgerAngka: Angka =
    ledger === undefined
      ? { memuat: true, teks: "—", catatan: null }
      : {
          memuat: false,
          teks: ledger.seimbang ? "Seimbang" : "Tidak seimbang",
          catatan:
            ledger.pendapatanPlatform > 0
              ? `Pendapatan tercatat ${formatRupiah(ledger.pendapatanPlatform)}`
              : `${ledger.entryCount} entri jurnal tercatat`,
        };

  return (
    <motion.section
      aria-label="Ringkasan hari ini"
      variants={staggerContainer}
      initial="hidden"
      animate="show"
      className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3 xl:grid-cols-4"
    >
      <Kartu
        Icon={ClipboardList}
        label="Perlu keputusan"
        angka={perluKeputusan}
        tone="amber"
        cta="Tinjau antrean"
        onBuka={() => onBukaModul("pinjaman")}
      />
      <Kartu
        Icon={BellRing}
        label="Lewat tanggal acuan"
        angka={terlambat}
        tone={terlambat.memuat || terlambat.teks === "0" ? "mint" : "red"}
        cta="Buka tanggal acuan"
        onBuka={() => onBukaModul("dpd")}
      />
      <Kartu
        Icon={MapPin}
        label="Perhatian lokasi"
        angka={lokasi}
        tone="sky"
        cta="Buka peta lokasi"
        onBuka={() => onBukaModul("lokasi")}
      />
      <Kartu
        Icon={ledger?.seimbang === false ? ShieldCheck : Landmark}
        label="Ledger internal"
        angka={ledgerAngka}
        tone={ledger?.seimbang === false ? "red" : "mint"}
        cta="Buka ledger"
        onBuka={() => onBukaModul("ledger")}
      />
    </motion.section>
  );
}
