import { motion } from "framer-motion";
import { BellRing, ChevronRight, ClipboardList, Coins, MapPin } from "lucide-react";
import { useState, type ComponentType } from "react";

import { MetrikKartu, type AdminOverviewData } from "@/components/admin/admin-shared";
import { Button } from "@/components/ui/button";
import {
  jumlahPerhatianLokasi,
  jumlahPerluKeputusan,
  type NilaiModulAdmin,
} from "@/lib/admin-queue";
import { fadeUpItem, staggerContainer } from "@/lib/motion";
import { formatRupiah } from "@/lib/money";
import {
  PILIHAN_POKOK_RINCIAN,
  barisRincianAliran,
  kalimatContohAliran,
  labelPotonganRincian,
  rincianAliranDana,
} from "@/lib/rincianAliranDana";

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
  onBukaModul,
  pokokContohAwal,
}: {
  overview: AdminOverviewData;
  stats: AdminStatsData | undefined;
  /** Pindah ke modul yang menangani kartu ini. */
  onBukaModul: (modul: NilaiModulAdmin) => void;
  /**
   * Pokok contoh yang terpilih saat panel dibuka. Bawaannya pinjaman terbesar
   * yang bisa diajukan; hanya dipakai uji render untuk memastikan angka kartu
   * benar-benar mengikuti pilihan admin.
   */
  pokokContohAwal?: number;
}) {
  // Rincian aliran uang itu kebijakan, bukan data server: tidak punya keadaan
  // "memuat", dan karena murni dari `lib/rincianAliranDana` ia tidak bisa
  // berbeda dari akad/tagihan maupun dari yang dijurnal ledger saat pelunasan.
  //
  // Pokoknya bisa dipilih admin supaya perjalanan uang bisa diperiksa pada
  // nominal kecil sampai maksimum — bukan hanya pada satu contoh.
  const [pokokContoh, setPokokContoh] = useState<number>(
    pokokContohAwal ?? PILIHAN_POKOK_RINCIAN[PILIHAN_POKOK_RINCIAN.length - 1],
  );
  const rincian = rincianAliranDana(pokokContoh);
  const barisAliran = barisRincianAliran(rincian);

  const perluKeputusan = angkaRingkas(jumlahPerluKeputusan(overview));
  const terlambat = angkaRingkas(stats?.pinjamanTerlambat);
  const lokasi = angkaRingkas(
    stats === undefined ? undefined : jumlahPerhatianLokasi(stats),
  );

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

      {/* Rincian aliran uang satu pinjaman — melintang satu baris penuh di
          bawah keempat kartu, supaya admin bisa memeriksa seluruh perjalanan
          uang tanpa membuka modul lain. */}
      <motion.div
        variants={fadeUpItem}
        className="rounded-xl border border-slate-200 bg-white p-3 min-[380px]:rounded-2xl min-[380px]:p-4 sm:col-span-2 sm:p-5 xl:col-span-4"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-navy">Aliran uang satu pinjaman</p>
            <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
              {kalimatContohAliran(rincian)}
            </p>
          </div>
          <span className="flex size-8 shrink-0 items-center justify-center rounded-xl border border-emerald-100 bg-emerald-50 text-emerald-700">
            <Coins className="size-4" />
          </span>
        </div>

        {/* Pilihan pokok: rincian di bawah ikut berubah, jadi admin bisa
            memeriksa nominal kecil maupun maksimum tanpa membuka modul lain. */}
        <div
          role="group"
          aria-label="Pilih pokok pinjaman contoh"
          className="mt-3 flex flex-wrap gap-1.5"
        >
          {PILIHAN_POKOK_RINCIAN.map((pokok) => {
            const aktif = pokok === rincian.pokok;
            return (
              <button
                key={pokok}
                type="button"
                aria-pressed={aktif}
                onClick={() => setPokokContoh(pokok)}
                className={`rounded-full border px-3 py-1 text-[11px] font-medium tabular-nums transition-colors ${
                  aktif
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-navy"
                }`}
              >
                {formatRupiah(pokok)}
              </button>
            );
          })}
        </div>

        <dl className="mt-3 grid grid-cols-1 gap-2 min-[380px]:grid-cols-2 lg:grid-cols-4">
          {barisAliran.map((baris) => (
            <MetrikKartu
              key={baris.label}
              label={baris.label}
              nilai={
                baris.arah === "potongan" ? (
                  <span className="text-amber-700">{labelPotonganRincian(baris.nilai)}</span>
                ) : baris.arah === "total" ? (
                  <span className="text-navy">{formatRupiah(baris.nilai)}</span>
                ) : (
                  formatRupiah(baris.nilai)
                )
              }
            />
          ))}
        </dl>

        {/* Sengaja tanpa tanda pisah "—": di panel ini karakter itu berarti
            "data server belum termuat" (lihat D1/E4 di scripts/qa-meja-kerja.ts),
            jadi teks biasa tidak boleh memakainya atau admin salah membacanya. */}
        <p className="mt-2 text-[11px] leading-4 text-muted-foreground">
          Contoh kebijakan perhitungan satu pinjaman, bukan angka ledger hari ini.
          Rincian pinjaman yang sedang berjalan ada di detail pinjaman masing-masing.
        </p>
      </motion.div>
    </motion.section>
  );
}
