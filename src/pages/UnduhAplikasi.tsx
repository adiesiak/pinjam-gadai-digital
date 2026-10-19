/**
 * Halaman unduh aplikasi Android (`/aplikasi`).
 *
 * Halaman ini menjawab satu pertanyaan: berkas mana yang dipasang, dan apa yang
 * terjadi setelahnya. Versi dan ukuran dibaca dari berkas yang sama dengan yang
 * diperiksa APK (`public/version.json`), jadi angka di halaman tidak bisa
 * berbeda dari pembaruan yang ditawarkan aplikasi.
 *
 * Tiga keadaan yang disengaja:
 *  - memuat: kartu menyebut bahwa versi sedang dibaca, tanpa tombol palsu;
 *  - siap: versi, ukuran, dan tautan unduhan;
 *  - gagal: alasan yang bisa dibaca, tombol coba lagi, dan tautan APK cadangan.
 */
import { ChevronDown, Download, Menu, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";

import { Button } from "@/components/ui/button";
import { VaultLogo } from "@/components/VaultLogo";
import { versiAplikasiDariUA } from "@/lib/pembaruanAplikasi";
import {
  NAMA_BERKAS_UNDUHAN,
  TAUTAN_UNDUH_CADANGAN,
  muatInfoUnduhan,
  statusVersi,
  ukuranTerbaca,
  type HasilMuatUnduhan,
  type InfoUnduhan,
  type StatusVersi,
} from "@/lib/unduhAplikasi";

const tautanInformasi = [
  { href: "/layanan/pinjaman-tunai", label: "Layanan" },
  { href: "/biaya", label: "Biaya" },
  { href: "/cara-kerja", label: "Cara kerja" },
  { href: "/keamanan", label: "Keamanan" },
  { href: "/faq", label: "FAQ" },
] as const;

const langkahPasang = [
  {
    judul: "Unduh berkasnya",
    isi: "Ketuk tombol unduh. Berkas PINDAI.apk masuk ke folder Downloads perangkat.",
  },
  {
    judul: "Izinkan pemasangan",
    isi: "Android menanyakan izin “instal dari sumber ini” karena berkas tidak berasal dari Play Store. Izinkan untuk PINDAI saja.",
  },
  {
    judul: "Buka dan masuk",
    isi: "Setelah terpasang, buka PINDAI dan masuk dengan akun Anda. Data akun tersimpan di server, bukan di berkas APK.",
  },
];

const tanyaJawab = [
  {
    tanya: "Apakah berkas ini bisa dipasang di iPhone?",
    jawab:
      "Tidak. Berkas .apk hanya untuk Android. Di iPhone dan iPad, PINDAI dipakai lewat peramban dan bisa ditambahkan ke Layar Utama.",
  },
  {
    tanya: "Mengapa Android meminta izin “instal dari sumber ini”?",
    jawab:
      "Karena APK dipasang di luar Play Store. Android meminta izin tersebut sekali per aplikasi pemasang, lalu pemasangan berikutnya biasanya tidak menanyakannya lagi.",
  },
  {
    tanya: "Apakah data hilang bila saya memasang versi baru?",
    jawab:
      "Tidak, selama aplikasi dipasang menimpa versi lama dan tidak dicopot lebih dulu. Versi baru memakai kunci tanda tangan yang sama, sedangkan data akun tersimpan di server PINDAI.",
  },
  {
    tanya: "Bagaimana aplikasi tahu ada versi baru?",
    jawab:
      "Setiap kali dibuka, aplikasi membaca version.json dari situs ini. Bila kode versi di server lebih tinggi, bilah pembaruan muncul di atas layar. Pemasangan tetap dilakukan oleh Anda.",
  },
  {
    tanya: "Apakah PINDAI ada di Play Store?",
    jawab:
      "Belum. Berkas resmi disajikan dari halaman ini, dan aplikasi tidak menautkan ke toko aplikasi mana pun.",
  },
];

function JudulBagian({
  id,
  label,
  judul,
}: {
  id: string;
  label: string;
  judul: string;
}) {
  return (
    <>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#065f46]">
        {label}
      </p>
      <h2 id={id} className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
        {judul}
      </h2>
    </>
  );
}

/** Gelombang berlapis: motif kartu PINDAI, dipakai sekali sebagai penanda bidang fokus. */
function MotifOmbak() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 420 120"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-x-0 bottom-0 h-24 w-full"
    >
      <path
        d="M0 88 C 58 62, 108 104, 166 80 S 268 48, 326 76 S 386 96, 420 72"
        fill="none"
        stroke="#326eb1"
        strokeOpacity="0.16"
        strokeWidth="7"
        strokeLinecap="round"
      />
      <path
        d="M0 100 C 58 74, 108 116, 166 92 S 268 60, 326 88 S 386 108, 420 84"
        fill="none"
        stroke="#326eb1"
        strokeOpacity="0.12"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <path
        d="M0 76 C 58 50, 108 92, 166 68 S 268 36, 326 64 S 386 84, 420 60"
        fill="none"
        stroke="#9bcdf0"
        strokeOpacity="0.5"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="166" cy="80" r="3" fill="#c9a86a" fillOpacity="0.75" />
      <circle cx="326" cy="76" r="3" fill="#c9a86a" fillOpacity="0.75" />
    </svg>
  );
}

export type PropsUnduhAplikasiView = {
  status: "memuat" | "siap" | "gagal";
  info?: InfoUnduhan | null;
  alasan?: string | null;
  terpasang?: number | null;
  onMuatUlang?: () => void;
};

const nadaKelas: Record<StatusVersi["nada"], string> = {
  netral: "text-slate-600",
  sukses: "text-[#065f46]",
  perhatian: "text-[#8a4b12]",
};

export function UnduhAplikasiView({
  status,
  info = null,
  alasan = null,
  terpasang = null,
  onMuatUlang,
}: PropsUnduhAplikasiView) {
  const ukuran = ukuranTerbaca(info?.ukuranByte ?? null);
  const keadaanVersi =
    info === null ? null : statusVersi(terpasang, info);

  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-[#fbfcfa] text-slate-900">
      <a className="skip-link" href="#konten">
        Lewati ke konten utama
      </a>

      <header className="border-b border-[#dce7df] bg-[#fbfcfa]">
        <div className="mx-auto flex min-h-16 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link
            to="/"
            aria-label="PINDAI, beranda"
            className="flex shrink-0 items-center gap-2.5"
          >
            <VaultLogo size={34} />
            <span className="text-sm font-semibold tracking-[0.16em]">PINDAI</span>
          </Link>

          <nav
            aria-label="Navigasi utama"
            className="hidden items-center gap-5 text-sm text-slate-600 lg:flex"
          >
            {tautanInformasi.map((item) => (
              <Link
                key={item.href}
                to={item.href}
                className="hover:text-[#065f46] focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#065f46]"
              >
                {item.label}
              </Link>
            ))}
            <Link
              to="/aplikasi"
              aria-current="page"
              className="font-semibold text-[#065f46] focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#065f46]"
            >
              Aplikasi
            </Link>
          </nav>

          <div className="flex items-center gap-2">
            <details className="group relative lg:hidden">
              <summary
                className="flex size-11 cursor-pointer list-none items-center justify-center rounded-lg border border-[#d5e1d8] text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#065f46]"
                aria-label="Buka menu informasi"
              >
                <Menu className="size-5" aria-hidden="true" />
              </summary>
              <nav
                aria-label="Menu informasi"
                className="absolute right-0 top-full z-50 mt-2 grid w-56 gap-1 rounded-xl border border-[#d5e1d8] bg-[#fbfcfa] p-2 text-sm shadow-lg"
              >
                {tautanInformasi.map((item) => (
                  <Link
                    key={item.href}
                    to={item.href}
                    className="rounded-lg px-3 py-3 hover:bg-[#edf4ef] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#065f46]"
                  >
                    {item.label}
                  </Link>
                ))}
                <Link
                  to="/aplikasi"
                  aria-current="page"
                  className="rounded-lg px-3 py-3 font-semibold text-[#065f46] hover:bg-[#edf4ef] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#065f46]"
                >
                  Aplikasi Android
                </Link>
              </nav>
            </details>

            <Button asChild variant="outline" className="min-h-11">
              <Link to="/auth">Masuk</Link>
            </Button>
          </div>
        </div>
      </header>

      <main id="konten" tabIndex={-1}>
        <section aria-labelledby="unduh-judul" className="border-b border-[#dce7df]">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#065f46]">
                Aplikasi Android
              </p>
              <h1
                id="unduh-judul"
                className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl"
              >
                Unduh PINDAI untuk Android
              </h1>
              <p className="mt-4 max-w-xl text-sm leading-6 text-slate-600">
                Satu berkas APK, dipasang langsung dari situs PINDAI. Tidak perlu
                akun toko aplikasi. Setelah terpasang, aplikasi memeriksa versi
                baru setiap kali dibuka.
              </p>

              <dl className="mt-7 max-w-xl divide-y divide-[#e8eee9] border-y border-[#dce7df] text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2 py-3">
                  <dt className="text-slate-600">Pemasangan</dt>
                  <dd className="font-semibold">Manual, tanpa Play Store</dd>
                </div>
                <div className="flex flex-wrap items-baseline justify-between gap-2 py-3">
                  <dt className="text-slate-600">Pembaruan</dt>
                  <dd className="font-semibold">Ditawarkan saat aplikasi dibuka</dd>
                </div>
              </dl>

              <a
                href="#langkah-pasang"
                className="mt-5 inline-flex min-h-11 items-center text-sm font-semibold text-[#064e3b] underline underline-offset-4 hover:text-[#047857] focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#065f46]"
              >
                Lihat langkah pemasangan
              </a>
            </div>

            <div className="rounded-2xl border border-[#c9a86a]/55 bg-[#fbfcfa] p-1.5 shadow-[0_20px_45px_-26px_rgba(28,26,21,0.45)]">
              <div className="relative min-h-[19rem] overflow-hidden rounded-xl border border-[#c9a86a]/30 bg-white px-5 py-5">
                <MotifOmbak />

                <div className="relative">
                  <div className="flex items-center gap-3">
                    <img
                      src="/icon-192.png"
                      alt=""
                      width={48}
                      height={48}
                      className="size-12 rounded-xl border border-[#c9a86a]/45 bg-[#f4f7f5]"
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">PINDAI</p>
                      <p className="text-xs text-slate-600">Aplikasi Android</p>
                    </div>
                    <div className="ml-auto text-right">
                      {status === "siap" && info !== null ? (
                        <>
                          <p className="text-2xl font-semibold tabular-nums tracking-tight">
                            {info.versiNama}
                          </p>
                          <p className="text-[11px] tabular-nums text-slate-600">
                            kode {info.versiKode}
                          </p>
                        </>
                      ) : (
                        <p className="text-xs text-slate-600">
                          {status === "memuat" ? "Membaca versi…" : "Tidak tersedia"}
                        </p>
                      )}
                    </div>
                  </div>

                  {status === "memuat" && (
                    <div aria-busy="true" aria-live="polite" className="mt-6">
                      <p className="text-sm leading-6 text-slate-600">
                        Sebentar, halaman sedang mengambil berkas versi.
                      </p>
                      <div className="mt-4 space-y-2" aria-hidden="true">
                        <div className="h-3 w-2/3 animate-pulse rounded bg-[#e8eee9]" />
                        <div className="h-3 w-1/2 animate-pulse rounded bg-[#e8eee9]" />
                        <div className="h-12 w-full animate-pulse rounded-lg bg-[#e8eee9]" />
                      </div>
                    </div>
                  )}

                  {status === "gagal" && (
                    <div role="alert" className="mt-6 rounded-xl border border-[#c9a86a]/60 bg-[#fdf8ec] p-4">
                      <p className="text-sm font-semibold text-slate-900">
                        Versi terbaru belum bisa dibaca.
                      </p>
                      <p className="mt-1 text-xs leading-5 text-slate-600">
                        {alasan ?? "Halaman tidak bisa mengambil data versi."} Berkas
                        APK tetap bisa diunduh.
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={onMuatUlang}
                          className="min-h-11 gap-2"
                        >
                          <RefreshCw className="size-4" aria-hidden="true" />
                          Coba lagi
                        </Button>
                        <a
                          href={TAUTAN_UNDUH_CADANGAN}
                          download={NAMA_BERKAS_UNDUHAN}
                          className="inline-flex min-h-11 items-center gap-2 rounded-md bg-[#065f46] px-4 text-sm font-medium text-white hover:bg-[#064e3b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#065f46] focus-visible:ring-offset-2"
                        >
                          <Download className="size-4" aria-hidden="true" />
                          Unduh APK terakhir
                        </a>
                      </div>
                    </div>
                  )}

                  {status === "siap" && info !== null && (
                    <>
                      <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-[#e8e2d3] pt-4 text-xs">
                        <div>
                          <dt className="text-slate-600">Berkas</dt>
                          <dd className="mt-0.5 font-mono text-[11px] text-slate-900">
                            {NAMA_BERKAS_UNDUHAN}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-slate-600">Ukuran</dt>
                          <dd className="mt-0.5 font-semibold tabular-nums">
                            {ukuran ?? "Tidak disebutkan"}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-slate-600">Versi minimum</dt>
                          <dd className="mt-0.5 font-semibold">Android 6.0 ke atas</dd>
                        </div>
                        <div>
                          <dt className="text-slate-600">Sumber</dt>
                          <dd className="mt-0.5 font-semibold">pindai.biz.id</dd>
                        </div>
                      </dl>

                      <Button
                        asChild
                        className="mt-5 min-h-12 w-full gap-2 rounded-lg bg-[#065f46] px-5 text-base text-white hover:bg-[#064e3b]"
                      >
                        <a href={info.tautan} download={NAMA_BERKAS_UNDUHAN}>
                          <Download className="size-5" aria-hidden="true" />
                          Unduh APK {info.versiNama}
                        </a>
                      </Button>

                      <p
                        aria-live="polite"
                        className="mt-3 text-[11px] leading-5 text-slate-600"
                      >
                        Berkas ini dipakai aplikasi untuk menawarkan pembaruan.
                        Versi lebih baru bisa muncul setelah rilis berikutnya.
                      </p>
                    </>
                  )}
                </div>
              </div>

              {keadaanVersi !== null && (
                <p
                  className={`px-4 pb-3 pt-3 text-xs leading-5 ${nadaKelas[keadaanVersi.nada]}`}
                >
                  {keadaanVersi.teks}
                </p>
              )}
            </div>
          </div>
        </section>

        <section
          id="langkah-pasang"
          aria-labelledby="langkah-pasang-judul"
          className="border-b border-[#dce7df] bg-[#f4f7f5]"
        >
          <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <JudulBagian
                id="langkah-pasang-judul"
                label="Pemasangan"
                judul="Tiga langkah, satu berkas"
              />
              <p className="mt-3 max-w-md text-sm leading-6 text-slate-600">
                APK dipasang seperti aplikasi Android lain di luar toko. Tidak ada
                kode aktivasi atau berkas tambahan.
              </p>
            </div>

            <ol className="space-y-0 border-t border-[#d5e1d8]">
              {langkahPasang.map((langkah, i) => (
                <li
                  key={langkah.judul}
                  className="flex gap-4 border-b border-[#d5e1d8] py-5"
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-[#c9a86a]/60 text-xs font-semibold tabular-nums text-[#6e5523]">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold">{langkah.judul}</h3>
                    <p className="mt-1 text-sm leading-6 text-slate-600">
                      {langkah.isi}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section aria-labelledby="catatan-aplikasi-judul" className="border-b border-[#dce7df]">
          <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
            <JudulBagian
              id="catatan-aplikasi-judul"
              label="Setelah terpasang"
              judul="Yang dilakukan aplikasi saat dibuka"
            />
            <div className="mt-7 grid gap-6 sm:grid-cols-2">
              <div className="border-l-2 border-[#c9a86a]/70 pl-4">
                <h3 className="text-sm font-semibold">Memeriksa berkas versi</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Aplikasi membaca version.json dari situs ini. Bila kode versi
                  lebih tinggi dari yang terpasang, bilah pembaruan muncul di atas
                  layar. Pemasangan tetap menunggu ketukan Anda.
                </p>
              </div>
              <div className="border-l-2 border-[#c9a86a]/70 pl-4">
                <h3 className="text-sm font-semibold">Berhenti di layar perbarui bila diwajibkan</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Untuk versi yang ditandai wajib, APK lama tidak bisa melewati
                  layar perbarui. Data akun tetap tersimpan di server selama
                  pemasangan menimpa versi lama.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section aria-labelledby="tanya-unduh-judul">
          <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
            <JudulBagian
              id="tanya-unduh-judul"
              label="Pertanyaan pemasangan"
              judul="Hal yang sering ditanyakan sebelum memasang"
            />
            <div className="mt-6 max-w-3xl border-t border-[#dce7df]">
              {tanyaJawab.map((item) => (
                <details key={item.tanya} className="group border-b border-[#dce7df]">
                  <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#065f46]">
                    <span>{item.tanya}</span>
                    <ChevronDown
                      className="size-4 shrink-0 text-slate-500 transition-transform group-open:rotate-180"
                      aria-hidden="true"
                    />
                  </summary>
                  <p className="pb-4 pr-8 text-sm leading-6 text-slate-600">
                    {item.jawab}
                  </p>
                </details>
              ))}
            </div>
            <p className="mt-6 text-sm text-slate-600">
              Sudah punya akun?{" "}
              <Link
                to="/auth"
                className="font-semibold text-[#064e3b] underline underline-offset-4 focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#065f46]"
              >
                Masuk ke PINDAI
              </Link>
              .
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t border-[#dce7df] bg-[#fbfcfa]">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-7 text-xs text-slate-600 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span>PINDAI · Berkas aplikasi disajikan dari situs ini.</span>
          <nav aria-label="Tautan tambahan" className="flex flex-wrap gap-x-4 gap-y-2">
            <Link to="/">Beranda</Link>
            <Link to="/biaya">Biaya</Link>
            <Link to="/cara-kerja">Cara kerja</Link>
            <Link to="/keamanan">Keamanan</Link>
            <Link to="/faq">FAQ</Link>
            <Link to="/aplikasi" aria-current="page">
              Aplikasi
            </Link>
            <Link to="/syarat-ketentuan">Syarat &amp; Ketentuan</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

export default function UnduhAplikasi() {
  const [hasil, setHasil] = useState<HasilMuatUnduhan | null>(null);
  const [percobaan, setPercobaan] = useState(0);

  const terpasang = useMemo(
    () =>
      typeof navigator === "undefined"
        ? null
        : versiAplikasiDariUA(navigator.userAgent),
    [],
  );

  useEffect(() => {
    const judulSemula = document.title;
    document.title = "Unduh Aplikasi Android | PINDAI";
    return () => {
      document.title = judulSemula;
    };
  }, []);

  useEffect(() => {
    let dibatalkan = false;
    setHasil(null);
    void muatInfoUnduhan().then((jawaban) => {
      if (!dibatalkan) setHasil(jawaban);
    });
    return () => {
      dibatalkan = true;
    };
  }, [percobaan]);

  const status: PropsUnduhAplikasiView["status"] =
    hasil === null ? "memuat" : hasil.ok ? "siap" : "gagal";

  return (
    <UnduhAplikasiView
      status={status}
      info={hasil?.ok === true ? hasil.info : null}
      alasan={hasil?.ok === false ? hasil.alasan : null}
      terpasang={terpasang}
      onMuatUlang={() => setPercobaan((n) => n + 1)}
    />
  );
}
