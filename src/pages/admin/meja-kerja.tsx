import { motion } from "framer-motion";
import {
  BellRing,
  ChevronRight,
  CircleAlert,
  ClipboardList,
  Coins,
  MapPin,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { useState, type ComponentType } from "react";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

import { MetrikKartu, type AdminOverviewData } from "@/components/admin/admin-shared";
import { Button } from "@/components/ui/button";
import {
  hitungCairEkspresMenunggu,
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
  kycMenunggu = null,
  pokokContohAwal,
  aliranTerbukaAwal = false,
}: {
  overview: AdminOverviewData;
  stats: AdminStatsData | undefined;
  /** Pindah ke modul yang menangani kartu ini. */
  onBukaModul: (modul: NilaiModulAdmin) => void;
  /** Pengajuan KYC yang menunggu peninjauan; `null` = belum diketahui. */
  kycMenunggu?: number | null;
  /**
   * Pokok contoh yang terpilih saat panel dibuka. Bawaannya pinjaman terbesar
   * yang bisa diajukan; hanya dipakai uji render untuk memastikan angka kartu
   * benar-benar mengikuti pilihan admin.
   */
  pokokContohAwal?: number;
  /**
   * Buka panel "Aliran uang satu pinjaman" sejak awal. Bawaannya TERTUTUP:
   * ini simulasi kebijakan, bukan pekerjaan hari ini, jadi ia tidak boleh menjadi
   * hal pertama yang dibaca di halaman Ringkasan. Uji render memakainya untuk
   * memeriksa angka di dalamnya.
   */
  aliranTerbukaAwal?: boolean;
}) {
  // Rincian aliran uang itu kebijakan, bukan data server: tidak punya keadaan
  // "memuat", dan karena murni dari `lib/rincianAliranDana` ia tidak bisa
  // berbeda dari akad/tagihan maupun dari yang dicatat internal saat pelunasan.
  //
  // Pokoknya bisa dipilih admin supaya perjalanan uang bisa diperiksa pada
  // nominal kecil sampai maksimum — bukan hanya pada satu contoh.
  const [pokokContoh, setPokokContoh] = useState<number>(
    pokokContohAwal ?? PILIHAN_POKOK_RINCIAN[PILIHAN_POKOK_RINCIAN.length - 1],
  );
  const rincian = rincianAliranDana(pokokContoh);
  const barisAliran = barisRincianAliran(rincian);

  const perluKeputusan = angkaRingkas(jumlahPerluKeputusan(overview));
  const ekspresMenunggu = hitungCairEkspresMenunggu(overview.loans);
  const kycPending = angkaRingkas(kycMenunggu ?? undefined);
  const terlambat = angkaRingkas(stats?.pinjamanTerlambat);
  const lokasi = angkaRingkas(
    stats === undefined ? undefined : jumlahPerhatianLokasi(stats),
  );
  // Denda 0% adalah pilihan sah, tetapi berbahaya bila ada pinjaman terlambat:
  // tagihan tidak bertambah dan pesan penagihan menyebut angka yang tetap.
  // Peringatan ini hanya muncul saat keduanya benar-benar terjadi.
  const dendaNol =
    stats !== undefined &&
    stats.persenDendaKeterlambatan === 0 &&
    stats.pinjamanTerlambat > 0;

  return (
    <motion.section
      aria-label="Perlu tindakan"
      variants={staggerContainer}
      initial="hidden"
      animate="show"
      className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3 xl:grid-cols-4"
    >
      {dendaNol && (
        <motion.div
          variants={fadeUpItem}
          role="status"
          className="rounded-xl border border-red-300 bg-red-50 p-3 sm:col-span-2 min-[380px]:rounded-2xl min-[380px]:p-4 sm:p-5 xl:col-span-4"
        >
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-red-200 bg-white text-red-700">
              <CircleAlert className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-red-900">
                Tarif denda keterlambatan 0%
              </p>
              <p className="mt-0.5 text-xs leading-5 text-red-800">
                {stats?.pinjamanTerlambat} pinjaman sudah lewat jatuh tempo, tetapi
                tagihannya tidak bertambah karena denda dimatikan. Atur tarifnya di
                Pengaturan Parameter Bisnis bila denda memang perlu berjalan.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl"
              onClick={() => onBukaModul("config")}
            >
              Buka pengaturan
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </motion.div>
      )}

      {/* Notifikasi khusus cair ekspres: hanya muncul bila ada pengajuan yang
          benar-benar menunggu. Angkanya dibaca dari antrean yang sama dengan
          tab Pinjaman, jadi lencana ini tidak bisa berbeda dari daftar. */}
      {ekspresMenunggu > 0 && (
        <motion.div
          variants={fadeUpItem}
          role="status"
          className="rounded-xl border border-amber-300 bg-amber-50 p-3 sm:col-span-2 min-[380px]:rounded-2xl min-[380px]:p-4 sm:p-5 xl:col-span-4"
        >
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-amber-200 bg-white text-amber-700">
              <Zap className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-amber-900">
                {ekspresMenunggu} pengajuan cair ekspres menunggu keputusan
              </p>
              <p className="mt-0.5 text-xs leading-5 text-amber-800">
                Peminjam memilih cair ekspres dan biaya ekspres dipotong di muka.
                Pengajuan ini dinaikkan ke paling atas antrean Pinjaman.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl"
              onClick={() => onBukaModul("konvensional")}
            >
              Tinjau antrean
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </motion.div>
      )}
      <Kartu
        Icon={ClipboardList}
        label="Pengajuan menunggu keputusan"
        angka={perluKeputusan}
        tone="amber"
        cta="Tinjau antrean"
        onBuka={() => onBukaModul("konvensional")}
      />
      <Kartu
        Icon={ShieldCheck}
        label="KYC menunggu verifikasi"
        angka={kycPending}
        tone="sky"
        cta="Buka verifikasi KYC"
        onBuka={() => onBukaModul("kyc")}
      />
      <Kartu
        Icon={BellRing}
        label="Lewat jatuh tempo"
        angka={terlambat}
        tone={terlambat.memuat || terlambat.teks === "0" ? "mint" : "red"}
        cta="Buka jatuh tempo"
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

      {/* Simulasi kebijakan "Aliran uang satu pinjaman" — TERTUTUP secara bawaan.
          Ia bukan pekerjaan hari ini, jadi tidak boleh menjadi hal pertama yang
          dibaca; angkanya memakai fungsi hitung yang sudah ada, tanpa rumus baru. */}
      <motion.div
        variants={fadeUpItem}
        className="rounded-xl border border-slate-200 bg-white p-3 min-[380px]:rounded-2xl min-[380px]:p-4 sm:col-span-2 sm:p-5 xl:col-span-4"
      >
        <Accordion
          type="single"
          collapsible
          defaultValue={aliranTerbukaAwal ? "aliran" : ""}
          className="flex flex-col"
        >
          <AccordionItem value="aliran" className="border-b-0">
            <AccordionTrigger className="items-start gap-3 py-0 hover:no-underline">
              <span className="flex min-w-0 flex-1 items-start gap-2 text-left">
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-navy">
                    Aliran uang satu pinjaman
                  </span>
                  <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                    {kalimatContohAliran(rincian)}
                  </span>
                </span>
                <span className="flex size-8 shrink-0 items-center justify-center rounded-xl border border-emerald-100 bg-emerald-50 text-emerald-700">
                  <Coins className="size-4" />
                </span>
              </span>
            </AccordionTrigger>
            <AccordionContent className="pt-3">
              {/* Pilihan pokok: rincian di bawah ikut berubah, jadi admin bisa
                  memeriksa nominal kecil maupun maksimum tanpa membuka modul lain. */}
              <div
                role="group"
                aria-label="Pilih pokok pinjaman contoh"
                className="flex flex-wrap gap-1.5"
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
                  "data server belum termuat" (lihat D1/D1b dan E3 di
                  scripts/qa-meja-kerja.ts),
                  jadi teks biasa tidak boleh memakainya atau admin salah membacanya. */}
              <p className="mt-2 text-[11px] leading-4 text-muted-foreground">
                Contoh kebijakan perhitungan satu pinjaman, bukan angka catatan
                internal hari ini. Rincian pinjaman yang sedang berjalan ada di detail
                pinjaman masing-masing.
              </p>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </motion.div>
    </motion.section>
  );
}
