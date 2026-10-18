/**
 * Demo alur pengajuan pinjaman di beranda: lima layar yang berganti sendiri
 * seperti video, tetapi seluruhnya kode — tidak ada berkas video, gambar, atau
 * iframe yang perlu dimuat.
 *
 * Keputusan yang menjaga demo ini jujur dan ringan:
 *  - Angka pada layar datang dari `quoteDemo()` (`lib/demoPengajuan`), yang
 *    memakai `quotePinjaman()` — mesin yang sama dengan kalkulator `/biaya`.
 *    Demo tidak pernah menampilkan rincian yang berbeda dari formulir asli.
 *  - Tiap layar meniru potongan UI yang benar-benar ada: masuk WhatsApp,
 *    verifikasi KYC, formulir pinjaman, status peninjauan, catatan dashboard.
 *    Pencairan dana disebut di luar aplikasi, sesuai batas sistem.
 *  - Gerak memakai token `lib/motion` dan hanya menyentuh opacity/transform.
 *    Saat `prefers-reduced-motion` aktif, demo tidak berjalan sendiri dan tidak
 *    bergerak sama sekali: pengunjung memilih langkah dengan tombol.
 */
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, Pause, Play, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  DEMO_JEDA_MS,
  DEMO_POKOK,
  DEMO_TENOR_HARI,
  LANGKAH_DEMO,
  quoteDemo,
  type LangkahDemo,
} from "@/lib/demoPengajuan";
import { formatRupiah } from "@/lib/money";
import { fadeIn, transition, transitionReduced } from "@/lib/motion";
import { LABEL_STATUS_PINJAMAN } from "@/lib/statusPinjaman";

/** Satu baris label–nilai di dalam layar contoh. */
function Baris({ label, nilai }: { label: string; nilai: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-[#eef2ee] py-2 last:border-0">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="text-sm font-medium tabular-nums text-slate-900">
        {nilai}
      </span>
    </div>
  );
}

function JudulLayar({ children }: { children: string }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#065f46]">
      {children}
    </p>
  );
}

/** 01 — masuk memakai kode WhatsApp, tanpa kata sandi. */
function LayarAkun() {
  return (
    <div className="mx-auto max-w-sm">
      <JudulLayar>Masuk · PINDAI</JudulLayar>
      <p className="mt-2 text-sm font-semibold text-slate-900">
        Nomor WhatsApp
      </p>
      <div className="mt-2 flex items-center gap-2 rounded-xl border border-[#dce7df] bg-white px-3 py-2.5">
        <span className="text-sm tabular-nums text-slate-900">62812 3456 7890</span>
        <span className="ml-auto h-4 w-px bg-[#065f46]" aria-hidden="true" />
      </div>
      <div className="mt-4">
        <p className="text-xs text-slate-500">Kode 6 angka dari WhatsApp</p>
        <div className="mt-2 flex gap-1.5">
          {["4", "2", "9", "7", "1", "5"].map((angka, i) => (
            <span
              key={i}
              className="flex size-9 items-center justify-center rounded-lg border border-[#dce7df] bg-white text-sm font-semibold tabular-nums text-slate-900"
            >
              {angka}
            </span>
          ))}
        </div>
      </div>
      <p className="mt-4 rounded-lg bg-[#f4f7f5] px-3 py-2 text-[11px] leading-5 text-slate-600">
        Kode berlaku 5 menit. Tidak ada kata sandi yang perlu diingat.
      </p>
    </div>
  );
}

/** 02 — verifikasi yang harus selesai sebelum pengajuan bisa dikirim. */
function LayarVerifikasi() {
  const baris = [
    "Data identitas sesuai KTP",
    "Foto KTP seluruh sisi",
    "Selfie dengan KTP",
    "Nomor WhatsApp terverifikasi",
  ];
  return (
    <div className="mx-auto max-w-sm">
      <JudulLayar>Verifikasi</JudulLayar>
      <p className="mt-2 text-sm font-semibold text-slate-900">
        Empat hal ini selesai dulu
      </p>
      <ul className="mt-3 overflow-hidden rounded-xl border border-[#dce7df] bg-white">
        {baris.map((teks) => (
          <li
            key={teks}
            className="flex items-center gap-2 border-b border-[#eef2ee] px-3 py-2.5 text-xs text-slate-700 last:border-0"
          >
            <span className="flex size-5 items-center justify-center rounded-full bg-[#e5f2e9] text-[#064e3b]">
              <Check className="size-3" aria-hidden="true" />
            </span>
            {teks}
          </li>
        ))}
      </ul>
      <p className="mt-4 flex items-start gap-2 text-[11px] leading-5 text-slate-600">
        <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-[#065f46]" aria-hidden="true" />
        Berkas diperiksa tim PINDAI; pengajuan terkunci sampai verifikasi lengkap.
      </p>
    </div>
  );
}

/** 03 — formulir pinjaman beserta rincian yang muncul sebelum dikirim. */
function LayarAjukan() {
  const q = useMemo(() => quoteDemo(), []);
  return (
    <div className="mx-auto max-w-sm">
      <JudulLayar>Form pengajuan pinjaman</JudulLayar>
      <div className="mt-2 overflow-hidden rounded-xl border border-[#dce7df] bg-white px-3 py-1">
        <Baris label="Nominal" nilai={formatRupiah(DEMO_POKOK)} />
        <Baris label="Tenor" nilai={`${DEMO_TENOR_HARI} hari`} />
        <Baris label="Potongan di muka" nilai={formatRupiah(q.totalPotonganDiMuka)} />
        <Baris label="Dana bersih diterima" nilai={formatRupiah(q.danaBersihDitransfer)} />
        <Baris label="Total kewajiban" nilai={formatRupiah(q.totalKewajibanPelunasan)} />
      </div>
      <p className="mt-3 rounded-lg bg-[#f4f7f5] px-3 py-2 text-[11px] leading-5 text-slate-600">
        Ilustrasi dari mesin hitung, bukan persetujuan pinjaman.
      </p>
    </div>
  );
}

/** 04 — pengajuan tercatat lalu masuk antrean peninjauan. */
function LayarTinjau() {
  return (
    <div className="mx-auto max-w-sm">
      <JudulLayar>Pengajuan tercatat</JudulLayar>
      <p className="mt-2 font-mono text-sm font-semibold text-slate-900">
        PGD-20261018-0142
      </p>
      <ol className="mt-4 space-y-3">
        {[
          { teks: "Diajukan", aktif: false, selesai: true },
          { teks: LABEL_STATUS_PINJAMAN.ditinjau, aktif: true, selesai: false },
          { teks: LABEL_STATUS_PINJAMAN.didanai, aktif: false, selesai: false },
        ].map((tahap) => (
          <li key={tahap.teks} className="flex items-center gap-2.5">
            <span
              className={[
                "flex size-5 items-center justify-center rounded-full border",
                tahap.selesai
                  ? "border-[#065f46] bg-[#065f46] text-white"
                  : tahap.aktif
                    ? "border-[#065f46] bg-white text-[#065f46]"
                    : "border-[#dce7df] bg-white text-transparent",
              ].join(" ")}
            >
              {tahap.selesai ? (
                <Check className="size-3" aria-hidden="true" />
              ) : (
                <span className="size-1.5 rounded-full bg-current" />
              )}
            </span>
            <span
              className={[
                "text-xs",
                tahap.aktif
                  ? "font-semibold text-slate-900"
                  : tahap.selesai
                    ? "text-slate-700"
                    : "text-slate-500",
              ].join(" ")}
            >
              {tahap.teks}
            </span>
            {tahap.aktif ? (
              <span className="ml-auto rounded-full bg-[#e5f2e9] px-2 py-0.5 text-[10px] font-semibold text-[#064e3b]">
                sekarang
              </span>
            ) : null}
          </li>
        ))}
      </ol>
      <p className="mt-4 text-[11px] leading-5 text-slate-600">
        Tim PINDAI meninjau pengajuan. Pencairan dana dilakukan di luar aplikasi.
      </p>
    </div>
  );
}

/** 05 — catatan pinjaman tetap tersimpan setelah lunas. */
function LayarCatatan() {
  const q = useMemo(() => quoteDemo(), []);
  return (
    <div className="mx-auto max-w-sm">
      <JudulLayar>Catatan pinjaman</JudulLayar>
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-900">
          Pinjaman tunai · {formatRupiah(DEMO_POKOK)}
        </p>
        <span className="rounded-full bg-[#e5f2e9] px-2 py-0.5 text-[10px] font-semibold text-[#064e3b]">
          {LABEL_STATUS_PINJAMAN.lunas}
        </span>
      </div>
      <div className="mt-2 overflow-hidden rounded-xl border border-[#dce7df] bg-white px-3 py-1">
        <Baris label="Total kewajiban" nilai={formatRupiah(q.totalKewajibanPelunasan)} />
        <Baris label="Tenor" nilai={`${DEMO_TENOR_HARI} hari`} />
        <Baris label="Riwayat" nilai="Tersimpan di dashboard" />
      </div>
      <p className="mt-3 text-[11px] leading-5 text-slate-600">
        Nomor referensi, jadwal, dan status dapat dibuka lagi kapan saja.
      </p>
    </div>
  );
}

/** Isi satu layar contoh. Diekspor supaya tiap langkah bisa diuji statis. */
export function PratinjauLayar({ langkah }: { langkah: LangkahDemo }) {
  switch (langkah.id) {
    case "akun":
      return <LayarAkun />;
    case "verifikasi":
      return <LayarVerifikasi />;
    case "ajukan":
      return <LayarAjukan />;
    case "tinjau":
      return <LayarTinjau />;
    case "catatan":
      return <LayarCatatan />;
  }
}

export function DemoPengajuan() {
  const kurangiGerak = useReducedMotion() ?? false;
  const [aktif, setAktif] = useState(0);
  const [jalan, setJalan] = useState(!kurangiGerak);
  /** 0–1: seberapa jauh layar sekarang sudah tampil. */
  const [progres, setProgres] = useState(0);
  /** Salinan progres untuk efek: melanjutkan jeda tanpa mengulang dari nol. */
  const progresRef = useRef(0);

  const langkah = LANGKAH_DEMO[aktif];
  const berjalan = jalan && !kurangiGerak;

  // Jam demo: satu layar berganti setelah DEMO_JEDA_MS. Efek diulang setiap
  // langkah berganti, jadi hitungannya selalu mulai dari nol.
  useEffect(() => {
    if (!berjalan) return;
    const mulai = performance.now() - progresRef.current * DEMO_JEDA_MS;
    const jam = window.setInterval(() => {
      const bagian = Math.min(1, (performance.now() - mulai) / DEMO_JEDA_MS);
      progresRef.current = bagian >= 1 ? 0 : bagian;
      if (bagian >= 1) {
        setAktif((n) => (n + 1) % LANGKAH_DEMO.length);
        setProgres(0);
      } else {
        setProgres(bagian);
      }
    }, 120);
    return () => window.clearInterval(jam);
  }, [berjalan, aktif]);

  // Tab yang tidak terlihat tidak perlu terus berganti layar.
  useEffect(() => {
    const saatSembunyi = () => {
      if (document.hidden) setJalan(false);
    };
    document.addEventListener("visibilitychange", saatSembunyi);
    return () => document.removeEventListener("visibilitychange", saatSembunyi);
  }, []);

  const pilih = (i: number) => {
    progresRef.current = 0;
    setAktif(i);
    setProgres(0);
  };

  return (
    <section
      id="demo-pengajuan"
      aria-labelledby="demo-pengajuan-judul"
      className="border-t border-[#dce7df] bg-[#fbfcfa]"
    >
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-18">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#065f46]">
            Demo alur
          </p>
          <h2
            id="demo-pengajuan-judul"
            className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl"
          >
            Cara mengajukan pinjaman
          </h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Lima layar, satu pengajuan: dari masuk dengan WhatsApp sampai catatan
            pinjaman tersimpan. Demo berjalan sendiri — tekan langkah mana pun
            untuk melompat ke sana.
          </p>
        </div>

        <div className="mt-8 grid gap-5 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:items-start">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              Langkah pengajuan
            </p>
            <ol className="mt-3 flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:gap-1.5 lg:overflow-visible lg:pb-0">
              {LANGKAH_DEMO.map((item, i) => {
                const ini = i === aktif;
                const lewat = i < aktif;
                return (
                  <li key={item.id} className="shrink-0 lg:shrink">
                    <button
                      type="button"
                      onClick={() => pilih(i)}
                      aria-current={ini ? "step" : undefined}
                      className={[
                        "flex min-h-11 w-auto items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#065f46] lg:w-full",
                        ini
                          ? "border-[#065f46] bg-[#065f46] text-white"
                          : "border-[#dce7df] bg-white text-slate-700 hover:bg-[#f4f7f5]",
                      ].join(" ")}
                    >
                      <span
                        className={[
                          "flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums",
                          ini
                            ? "bg-white/15 text-white"
                            : lewat
                              ? "bg-[#e5f2e9] text-[#064e3b]"
                              : "bg-[#f4f7f5] text-slate-500",
                        ].join(" ")}
                      >
                        {lewat ? <Check className="size-3.5" aria-hidden="true" /> : item.nomor}
                      </span>
                      <span className="whitespace-nowrap text-xs font-medium lg:whitespace-normal">
                        {item.judul}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
            <p className="mt-3 hidden text-[11px] leading-5 text-slate-500 lg:block">
              Gerak dimatikan otomatis bila perangkat meminta gerak dikurangi.
            </p>
          </div>

          <div className="min-w-0 overflow-hidden rounded-2xl border border-[#dce7df] bg-white">
            <div className="flex items-center gap-2 border-b border-[#e8eee9] bg-[#f4f7f5] px-3 py-2.5">
              <span className="flex gap-1.5" aria-hidden="true">
                <span className="size-2 rounded-full bg-[#dce7df]" />
                <span className="size-2 rounded-full bg-[#dce7df]" />
                <span className="size-2 rounded-full bg-[#dce7df]" />
              </span>
              <span className="ml-1 truncate rounded-full border border-[#dce7df] bg-white px-2.5 py-1 font-mono text-[10px] text-slate-500">
                pindai.app/pengajuan
              </span>
              <span className="ml-auto shrink-0 rounded-full bg-[#e5f2e9] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#064e3b]">
                Contoh layar
              </span>
            </div>

            <div
              role="img"
              aria-label={`Pratinjau layar langkah ${langkah.nomor}: ${langkah.judul}`}
              className="relative min-h-[19rem] overflow-hidden bg-[#fbfcfa] p-4 sm:min-h-[17rem] sm:p-5"
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={langkah.id}
                  variants={fadeIn}
                  initial={kurangiGerak ? false : "hidden"}
                  animate="show"
                  exit={kurangiGerak ? undefined : "hidden"}
                  transition={kurangiGerak ? transitionReduced : transition.slow}
                >
                  <PratinjauLayar langkah={langkah} />
                </motion.div>
              </AnimatePresence>
            </div>

            <div className="border-t border-[#e8eee9] p-4 sm:p-5">
              {kurangiGerak ? null : (
                <span className="block h-1 overflow-hidden rounded-full bg-[#eef2ee]">
                  <span
                    className="block h-full origin-left rounded-full bg-[#065f46]"
                    // Meter progres: linear memang yang benar di sini, dan
                    // tempo tetap memakai token `--motion-fast`.
                    style={{
                      transform: `scaleX(${progres})`,
                      transition: "transform var(--motion-fast) linear",
                    }}
                  />
                </span>
              )}

              <div className="mt-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#065f46]">
                    Langkah {langkah.nomor} dari {LANGKAH_DEMO[LANGKAH_DEMO.length - 1].nomor}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {langkah.judul}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-slate-600">
                    {langkah.ringkas}
                  </p>
                </div>
                {kurangiGerak ? null : (
                  <button
                    type="button"
                    onClick={() => setJalan((n) => !n)}
                    aria-label={berjalan ? "Jeda demo" : "Putar demo"}
                    className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-[#dce7df] bg-white px-3.5 text-xs font-semibold text-[#064e3b] transition-colors hover:bg-[#f4f7f5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#065f46]"
                  >
                    {berjalan ? (
                      <Pause className="size-3.5" aria-hidden="true" />
                    ) : (
                      <Play className="size-3.5" aria-hidden="true" />
                    )}
                    {berjalan ? "Jeda" : "Putar"}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        <p className="mt-4 text-xs leading-5 text-slate-600">
          Demo animasi dari alur sebenarnya, bukan rekaman layar. Angka dihitung
          mesin yang sama dengan kalkulator biaya; pencairan dana dan pembayaran
          tetap berlangsung di luar aplikasi.
        </p>
      </div>
    </section>
  );
}
