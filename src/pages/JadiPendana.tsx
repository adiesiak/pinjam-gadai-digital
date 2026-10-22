import { useQuery } from "convex/react";
import { FileDown, Loader2, MessageCircle } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";

import { MenuInformasiPonsel } from "@/components/MenuInformasiPonsel";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { VaultLogo } from "@/components/VaultLogo";
import { api } from "@/convex/_generated/api";
import { HAK_CIPTA_PINDAI, PENAFIAN_PINDAI } from "@/lib/branding";
import { urlChatCs } from "@/lib/kontak";
import {
  PERSEN_IMBAL_PENDANA,
  TENOR_PENDANA_HARI,
  bagiHasilPendana,
} from "@/lib/imbalPendana";
import { unduhLewatAplikasi } from "@/lib/jembatanAndroid";
import { formatRupiahAman, kelompokkanDigit } from "@/lib/money";
import { susunPdf } from "@/lib/pdfSederhana";
import {
  NOMINAL_CONTOH_PROPOSAL,
  formatPersen,
  namaBerkasProposalPendana,
  nomorLayananProposal,
  proposalPendanaanPindai,
} from "@/lib/proposalPendana";
import { DEFAULT_CONFIG } from "@/lib/system-config";

/**
 * Halaman proposal pendanaan di dalam ruang pendana.
 *
 * Tujuan halamannya satu: membuat pendana dan tim pemantau bisa memutuskan
 * tanpa bertanya dulu ke admin, yaitu melihat pembagian hasil yang berlaku,
 * mencoba nominalnya sendiri, membaca risikonya, lalu mengunduh proposal
 * sebagai berkas. Halaman ini bukan rute publik: `RequirePendana` hanya
 * membukanya untuk sesi yang sudah masuk lewat kode akses bersama (atau akun
 * pendana/admin), dan tautannya ada di `/penyedia-dana`. Karena
 * itu angka di sini tidak ditulis di JSX: semuanya dihitung oleh
 * `lib/imbalPendana` dan biaya platform dibaca dari Pengaturan Sistem, jalur
 * yang sama dengan pencatatan hak pendana di server.
 *
 * Halaman ini sengaja tidak menampilkan testimoni, jumlah pendana, atau tingkat
 * keberhasilan pembayaran: tidak ada angka nyata yang bisa dipertanggung-
 * jawabkan untuk itu, dan klaim tanpa sumber merusak kepercayaan justru di
 * halaman yang tugasnya membangun kepercayaan.
 */

function rupiah(nilai: number): string {
  return formatRupiahAman(nilai);
}

/** Susun berkas lalu serahkan ke perangkat, termasuk jembatan aplikasi Android. */
async function simpanProposal(persenPotonganAdmin: number): Promise<void> {
  const dibuatPada = Date.now();
  const byte = susunPdf(
    proposalPendanaanPindai({ persenPotonganAdmin, dibuatPada }),
  );
  const blob = new Blob([new Uint8Array(byte)], {
    type: "application/pdf",
  });
  const nama = namaBerkasProposalPendana(dibuatPada);
  // Di aplikasi Android, unduhan blob tidak ditangani WebView.
  if (await unduhLewatAplikasi(nama, "application/pdf", blob)) return;
  const url = URL.createObjectURL(blob);
  const tautan = document.createElement("a");
  tautan.href = url;
  tautan.download = nama;
  tautan.rel = "noopener";
  document.body.appendChild(tautan);
  tautan.click();
  tautan.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Satu tombol unduh, dipakai di hero dan di bagian proposal. Keduanya
 * menyusun berkas dari kebijakan yang berlaku saat tombol ditekan, jadi tidak
 * ada berkas lama yang tersimpan dan tidak ada tombol yang menunggu admin.
 */
function TombolUnduhProposal({
  persenPotonganAdmin,
  variant = "default",
  label = "Unduh proposal (PDF)",
}: {
  persenPotonganAdmin: number;
  variant?: "default" | "outline";
  label?: string;
}) {
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  async function unduh() {
    setSibuk(true);
    setGalat(null);
    try {
      await simpanProposal(persenPotonganAdmin);
    } catch (err) {
      setGalat(
        err instanceof Error
          ? err.message
          : "Proposal gagal disiapkan. Coba lagi sebentar.",
      );
    } finally {
      setSibuk(false);
    }
  }

  return (
    <div>
      <Button
        type="button"
        variant={variant}
        onClick={() => void unduh()}
        disabled={sibuk}
        aria-busy={sibuk}
        className="min-h-11 w-full sm:w-auto"
      >
        {sibuk ? (
          <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
        ) : (
          <FileDown className="mr-2 size-4" aria-hidden />
        )}
        {sibuk ? "Menyiapkan PDF" : label}
      </Button>
      {galat !== null && (
        <p
          role="alert"
          className="mt-2 rounded-lg border border-red-300/70 bg-red-50/60 px-3 py-2 text-xs leading-5 text-red-900"
        >
          {galat}
        </p>
      )}
    </div>
  );
}

/** Satu baris angka bergaya buku besar: label di kiri, nilai rata kanan. */
function BarisAngka({
  label,
  nilai,
  tebal = false,
  sorot = false,
}: {
  label: string;
  nilai: string;
  tebal?: boolean;
  sorot?: boolean;
}) {
  return (
    <div
      className={
        sorot
          ? "flex flex-wrap items-baseline justify-between gap-2 rounded-lg bg-emerald-50/70 px-2 py-2"
          : "flex flex-wrap items-baseline justify-between gap-2 py-2"
      }
    >
      <dt className="text-xs leading-5 text-slate-600">{label}</dt>
      <dd
        className={`tabular-nums ${tebal ? "text-base font-semibold text-navy" : "text-sm text-slate-900"}`}
      >
        {nilai}
      </dd>
    </div>
  );
}

/**
 * Kalkulator publik.
 *
 * Hasilnya diumumkan lewat `aria-live` karena angkanya berubah saat pembaca
 * layar mengetik nominal. Nominal kosong tetap menghasilkan Rp 0, bukan tanda
 * pisah: pembaca melihat pembagian yang berlaku, bukan layar kosong.
 */
function KalkulatorPendanaan({
  persenPotonganAdmin,
}: {
  persenPotonganAdmin: number;
}) {
  const [isian, setIsian] = useState(() =>
    kelompokkanDigit(String(NOMINAL_CONTOH_PROPOSAL)),
  );

  const digit = isian.replace(/\D/g, "");
  const angka = digit === "" ? 0 : Number(digit);
  const nominal = Number.isSafeInteger(angka) && angka >= 0 ? angka : 0;
  const terlaluBesar = digit.length > 15 || !Number.isSafeInteger(angka);
  const bagi = bagiHasilPendana(nominal, persenPotonganAdmin);

  const pilihan = [5_000_000, 10_000_000, 25_000_000, 50_000_000] as const;

  return (
    <section
      id="kalkulator"
      aria-labelledby="judul-kalkulator"
      className="mx-auto max-w-6xl scroll-mt-24 px-4 py-14 sm:px-6"
    >
      <div className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
        <div>
          <h2
            id="judul-kalkulator"
            className="font-display text-3xl leading-tight tracking-tight text-navy sm:text-4xl"
          >
            Hitung nominal Anda
          </h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Masukkan nominal yang Anda rencanakan. Pembagian di kanan memakai
            Imbal Hasil {PERSEN_IMBAL_PENDANA}% untuk siklus{" "}
            {TENOR_PENDANA_HARI} hari dan biaya platform{" "}
            {formatPersen(persenPotonganAdmin)} dari uang yang kembali.
          </p>

          <label
            htmlFor="nominal-pendanaan"
            className="mt-6 block text-xs font-semibold text-slate-800"
          >
            Nominal pendanaan
          </label>
          <div className="mt-1.5 flex min-h-11 items-center rounded-xl border border-border bg-white focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
            <span
              className="pl-3 text-sm font-medium text-slate-500"
              aria-hidden
            >
              Rp
            </span>
            <input
              id="nominal-pendanaan"
              inputMode="numeric"
              autoComplete="off"
              value={isian}
              onChange={(event) =>
                setIsian(kelompokkanDigit(event.target.value))
              }
              placeholder="10.000.000"
              aria-describedby="catatan-nominal"
              className="min-w-0 flex-1 bg-transparent px-2 py-2.5 text-base font-semibold tabular-nums text-navy outline-none"
            />
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {pilihan.map((nilai) => (
              <button
                key={nilai}
                type="button"
                onClick={() => setIsian(kelompokkanDigit(String(nilai)))}
                aria-pressed={nominal === nilai}
                className={`min-h-11 rounded-lg border px-3 text-xs font-medium tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  nominal === nilai
                    ? "border-emerald-700/50 bg-emerald-50 text-emerald-900"
                    : "border-border bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {rupiah(nilai)}
              </button>
            ))}
          </div>

          <p
            id="catatan-nominal"
            className="mt-3 text-[11px] leading-5 text-slate-600"
          >
            {terlaluBesar
              ? "Nominal terlalu besar untuk dihitung di sini. Hubungi layanan pelanggan untuk pembicaraan nominal besar."
              : `Angka contoh, bukan jaminan hasil. Imbal Hasil baru menjadi uang Anda setelah pinjaman lunas, dan biaya platform ${formatPersen(persenPotonganAdmin)} sudah dipotong dari uang yang kembali.`}
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 sm:p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold text-navy">
              Pembagian satu siklus
            </h3>
            <p className="text-[11px] font-medium text-slate-600">
              {TENOR_PENDANA_HARI} hari · Imbal Hasil {PERSEN_IMBAL_PENDANA}%
            </p>
          </div>
          <dl
            aria-live="polite"
            className="mt-3 divide-y divide-slate-200 border-y border-slate-200"
          >
            <BarisAngka label="Pokok yang Anda danai" nilai={rupiah(nominal)} />
            <BarisAngka
              label={`Imbal Hasil (${PERSEN_IMBAL_PENDANA}%)`}
              nilai={rupiah(bagi.imbal)}
            />
            <BarisAngka label="Uang yang kembali" nilai={rupiah(bagi.total)} />
            <BarisAngka
              label={`Biaya platform (${formatPersen(persenPotonganAdmin)})`}
              nilai={rupiah(bagi.potonganAdmin)}
            />
            <BarisAngka
              label="Diterima bersih"
              nilai={rupiah(bagi.diterima)}
              tebal
              sorot
            />
            <BarisAngka
              label="Keuntungan bersih"
              nilai={rupiah(bagi.keuntungan)}
              tebal
            />
          </dl>
          <p className="mt-3 text-[11px] leading-5 text-slate-600">
            Keuntungan bersih adalah uang yang diterima dikurangi pokok. Karena
            biaya platform dihitung dari uang yang kembali, pokok Anda kembali
            utuh dan sebagian Imbal Hasil dipakai untuk biaya layanan.
          </p>
        </div>
      </div>
    </section>
  );
}

function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background">
      <div className="mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link
          to="/"
          aria-label="PINDAI, beranda"
          className="inline-flex items-center gap-2.5"
        >
          <VaultLogo size={32} />
          <span className="text-sm font-semibold tracking-[0.16em]">
            PINDAI
          </span>
        </Link>

        <nav
          aria-label="Navigasi pendana"
          className="hidden items-center gap-5 text-sm text-slate-600 lg:flex"
        >
          <Link className="hover:text-primary" to="/layanan/pinjaman-tunai">
            Layanan
          </Link>
          <Link className="hover:text-primary" to="/biaya">
            Biaya
          </Link>
          <Link className="hover:text-primary" to="/cara-kerja">
            Cara kerja
          </Link>
          <Link className="hover:text-primary" to="/keamanan">
            Keamanan
          </Link>
          <Link className="hover:text-primary" to="/faq">
            FAQ
          </Link>
          <Link className="hover:text-primary" to="/aplikasi">
            Aplikasi
          </Link>
        </nav>

        <div className="flex items-center gap-2">
          <MenuInformasiPonsel
            tautan={[
              { href: "/penyedia-dana", label: "Ruang pendana" },
              { href: "/layanan/pinjaman-tunai", label: "Pinjaman tunai" },
              { href: "/biaya", label: "Biaya" },
              { href: "/cara-kerja", label: "Cara kerja" },
              { href: "/keamanan", label: "Keamanan" },
              { href: "/faq", label: "FAQ" },
              { href: "/aplikasi", label: "Aplikasi Android" },
            ]}
            kelasTombol="flex size-11 items-center justify-center rounded-lg border border-border text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            kelasPanel="absolute right-0 top-full z-50 mt-2 grid w-56 gap-1 rounded-xl border border-border bg-background p-2 text-sm shadow-lg"
            kelasTautan="rounded-lg px-3 py-3 hover:bg-muted"
          />
          <Button asChild variant="outline" className="min-h-11">
            <Link to="/penyedia-dana">Kembali ke ruang pendana</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto max-w-6xl px-4 py-7 text-xs text-slate-600 sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <span>
            PINDAI · Pendanaan dicatat di aplikasi, dana berpindah di luar
            aplikasi.
          </span>
          <nav
            aria-label="Tautan tambahan"
            className="flex flex-wrap gap-x-4 gap-y-2"
          >
            <Link to="/">Beranda</Link>
            <Link to="/penyedia-dana">Ruang pendana</Link>
            <Link to="/biaya">Biaya</Link>
            <Link to="/cara-kerja">Cara kerja</Link>
            <Link to="/keamanan">Keamanan</Link>
            <Link to="/faq">FAQ</Link>
            <Link to="/syarat-ketentuan">Syarat &amp; Ketentuan</Link>
          </nav>
        </div>
        <p className="mt-4 border-t border-border pt-3 text-[11px] leading-5 text-slate-500">
          {PENAFIAN_PINDAI}
        </p>
        <p className="mt-1 text-[11px] text-slate-500">{HAK_CIPTA_PINDAI}</p>
      </div>
    </footer>
  );
}

/** Isi halaman tanpa Convex, supaya bisa dirender langsung oleh uji markup. */
export function JadiPendanaView({
  persenPotonganAdmin,
}: {
  persenPotonganAdmin: number;
}) {
  const persen = formatPersen(persenPotonganAdmin);
  const contoh = bagiHasilPendana(NOMINAL_CONTOH_PROPOSAL, persenPotonganAdmin);

  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-background text-foreground">
      <a className="skip-link" href="#konten">
        Lewati ke konten utama
      </a>
      <Header />

      <main id="konten" tabIndex={-1}>
        {/* Hero: satu titik fokus (kartu contoh bergaris kuningan), sisanya
            datar. Tujuannya supaya mata langsung jatuh pada pembagian angka,
            bukan pada dekorasi. */}
        <section className="mx-auto max-w-6xl px-4 pb-10 pt-10 sm:px-6 sm:pt-14">
          <div className="grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                Pendanaan
              </p>
              <h1 className="mt-3 font-display text-4xl leading-[1.08] tracking-tight text-navy sm:text-5xl">
                Imbal Hasil {PERSEN_IMBAL_PENDANA}% per siklus{" "}
                {TENOR_PENDANA_HARI} hari, tertulis sejak awal.
              </h1>
              <p className="mt-5 max-w-xl text-base leading-7 text-slate-700">
                Setiap alokasi PINDAI menempel pada satu pinjaman dan satu
                pendana. Biaya platform {persen} diambil dari uang yang kembali,
                bukan dari keuntungan, dan proposalnya bisa Anda unduh sekarang.
              </p>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <TombolUnduhProposal
                  persenPotonganAdmin={persenPotonganAdmin}
                />
                <Button asChild variant="outline" className="min-h-11">
                  <a href="#kalkulator">Hitung imbal hasil</a>
                </Button>
              </div>
              <p className="mt-3 text-[11px] leading-5 text-slate-600">
                Proposal selalu disusun dari kebijakan yang berlaku saat tombol
                ditekan, dan hanya terbuka dari ruang pendana.
              </p>
            </div>

            <aside
              aria-labelledby="judul-contoh"
              className="rounded-2xl border border-[#c9a86a]/55 bg-white/90 p-5 shadow-[0_20px_45px_-26px_rgba(28,26,21,0.45)] ring-1 ring-[#c9a86a]/35 ring-offset-2 ring-offset-white/60 backdrop-blur-xl sm:p-6"
            >
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-800">
                  Contoh satu siklus
                </p>
                <p className="text-[11px] text-slate-600">
                  {TENOR_PENDANA_HARI} hari
                </p>
              </div>
              <h2
                id="judul-contoh"
                className="mt-1 font-display text-3xl tracking-tight text-navy"
              >
                {rupiah(NOMINAL_CONTOH_PROPOSAL)}
              </h2>
              <dl className="mt-4 divide-y divide-slate-200 border-t border-slate-200">
                <BarisAngka
                  label={`Imbal Hasil (${PERSEN_IMBAL_PENDANA}%)`}
                  nilai={rupiah(contoh.imbal)}
                />
                <BarisAngka
                  label="Uang yang kembali"
                  nilai={rupiah(contoh.total)}
                />
                <BarisAngka
                  label={`Biaya platform (${persen})`}
                  nilai={rupiah(contoh.potonganAdmin)}
                />
                <BarisAngka
                  label="Diterima bersih"
                  nilai={rupiah(contoh.diterima)}
                  tebal
                  sorot
                />
                <BarisAngka
                  label="Keuntungan bersih"
                  nilai={rupiah(contoh.keuntungan)}
                  tebal
                />
              </dl>
              <p className="mt-3 text-[11px] leading-5 text-slate-600">
                Angka contoh, bukan janji. Hasil dibukukan setelah pinjaman
                lunas dan transfer dicatat admin.
              </p>
            </aside>
          </div>
        </section>

        <section
          aria-labelledby="judul-prinsip"
          className="border-y border-border bg-card"
        >
          <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:px-6 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <h2
                id="judul-prinsip"
                className="font-display text-3xl leading-tight tracking-tight text-navy sm:text-4xl"
              >
                Yang membuat angkanya bisa diperiksa
              </h2>
              <p className="mt-3 max-w-md text-sm leading-6 text-slate-600">
                Empat aturan ini tidak berubah di tengah pinjaman. Kalau salah
                satunya diubah, itu berlaku untuk alokasi baru, bukan untuk hak
                yang sudah tercatat.
              </p>
            </div>
            <ol className="divide-y divide-border border-y border-border">
              {[
                {
                  judul: `Imbal Hasil tetap ${PERSEN_IMBAL_PENDANA}%`,
                  isi: `Dihitung dari pokok yang Anda danai. Tenor pinjaman peminjam tidak memotong atau menambah hak Anda: perpanjangan, perubahan bunga, dan cicilan pokok tidak menyentuh angka ini.`,
                },
                {
                  judul: "Satu pinjaman, satu pendana",
                  isi: "Alokasi tidak digabung dalam kolam. Di ruang pendana Anda bisa melihat pinjaman mana yang memakai dana Anda, beserta statusnya.",
                },
                {
                  judul: "Biaya platform diumumkan di depan",
                  isi: `Biaya ${persen} diambil dari uang yang kembali, bukan dari keuntungan. Potongan ini membiayai operasional, penagihan, dan penanganan pinjaman bermasalah.`,
                },
                {
                  judul: "Hasil dibayar setelah lunas",
                  isi: "Selama pinjaman berjalan, angka di portofolio adalah perkiraan. Setelah lunas, hak Anda dibukukan; admin mentransfernya di luar aplikasi lalu mencatatnya.",
                },
              ].map((butir, i) => (
                <li
                  key={butir.judul}
                  className="flex gap-4 py-5 first:pt-0 last:pb-0"
                >
                  <span
                    aria-hidden
                    className="font-display text-lg leading-none tabular-nums text-emerald-800"
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-navy">
                      {butir.judul}
                    </h3>
                    <p className="mt-1 text-sm leading-6 text-slate-600">
                      {butir.isi}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <KalkulatorPendanaan persenPotonganAdmin={persenPotonganAdmin} />

        {/* Perhitungan yang sama, dibuka langkah demi langkah. Fungsinya
            membuktikan bahwa tiap baris di kalkulator berasal dari dua angka
            yang tertulis, bukan dari tabel yang disembunyikan. */}
        <section
          aria-labelledby="judul-perhitungan"
          className="border-y border-border bg-slate-50"
        >
          <div className="mx-auto grid max-w-6xl gap-8 px-4 py-14 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
            <div>
              <h2
                id="judul-perhitungan"
                className="font-display text-3xl leading-tight tracking-tight text-navy sm:text-4xl"
              >
                Lima baris yang menjelaskan semuanya
              </h2>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Tidak ada rumus tersembunyi. Perhitungan dimulai dari pokok,
                memakai Imbal Hasil {PERSEN_IMBAL_PENDANA}%, lalu memotong biaya
                platform {persen} dari uang yang kembali.
              </p>
              <p className="mt-4 text-[11px] leading-5 text-slate-600">
                Contoh memakai {rupiah(NOMINAL_CONTOH_PROPOSAL)}. Angka yang
                sama dipakai proposal PDF yang bisa Anda unduh.
              </p>
            </div>
            <ol className="space-y-3">
              {[
                {
                  rumus: `Pokok = ${rupiah(NOMINAL_CONTOH_PROPOSAL)}`,
                  isi: "Dana yang Anda alokasikan pada satu pinjaman.",
                },
                {
                  rumus: `Imbal Hasil = pokok × ${PERSEN_IMBAL_PENDANA}% = ${rupiah(contoh.imbal)}`,
                  isi: "Hak bruto Anda, terpisah dari bunga pinjaman peminjam.",
                },
                {
                  rumus: `Uang kembali = pokok + Imbal Hasil = ${rupiah(contoh.total)}`,
                  isi: "Jumlah yang seharusnya masuk sebelum biaya layanan.",
                },
                {
                  rumus: `Biaya platform = uang kembali × ${persen} = ${rupiah(contoh.potonganAdmin)}`,
                  isi: "Dipotong dari uang yang kembali, bukan dari Imbal Hasil saja.",
                },
                {
                  rumus: `Diterima = uang kembali - biaya = ${rupiah(contoh.diterima)}`,
                  isi: `Keuntungan bersih Anda ${rupiah(contoh.keuntungan)} setelah pokok dikembalikan.`,
                },
              ].map((langkah, i) => (
                <li
                  key={langkah.rumus}
                  className="rounded-xl border border-border bg-white px-4 py-3"
                >
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-800">
                    Langkah {i + 1}
                  </p>
                  <p className="mt-1 text-sm font-semibold tabular-nums text-navy">
                    {langkah.rumus}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-slate-600">
                    {langkah.isi}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section
          id="proposal"
          aria-labelledby="judul-proposal"
          className="mx-auto max-w-6xl scroll-mt-24 px-4 py-14 sm:px-6"
        >
          <div className="grid gap-8 rounded-2xl border border-border bg-card p-5 sm:p-7 lg:grid-cols-[1.15fr_0.85fr]">
            <div>
              <h2
                id="judul-proposal"
                className="font-display text-3xl leading-tight tracking-tight text-navy"
              >
                Proposal pendanaan & kemitraan strategis
              </h2>
              <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600">
                Berkas PDF yang bisa Anda simpan, cetak, atau kirim ke orang
                yang ikut memutuskan. Isinya ringkasan eksekutif dan target
                2027, analisis pasar TAM, SAM, dan SOM, skema dengan simulasi Rp
                5 juta sampai Rp 50 juta, cakupan biaya platform, langkah
                preventif, risiko, serta alur kemitraan dan kontak.
              </p>

              <div className="mt-5">
                <TombolUnduhProposal
                  persenPotonganAdmin={persenPotonganAdmin}
                  label="Unduh proposal lengkap (PDF)"
                />
              </div>

              <p className="mt-3 text-[11px] leading-5 text-slate-600">
                Dokumen dibuat ulang setiap kali diunduh, jadi angkanya
                mengikuti pengaturan biaya yang berlaku saat itu. Proposal bukan
                perjanjian dan bukan jaminan hasil.
              </p>
            </div>

            <div className="rounded-xl border border-border bg-slate-50 px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">
                Isi dokumen
              </p>
              <ol className="mt-2 space-y-2 text-sm leading-6 text-slate-700">
                <li>Ringkasan eksekutif dan target 300 nasabah aktif 2027.</li>
                <li>Potensi pasar: TAM, SAM, dan SOM koridor industri.</li>
                <li>
                  Skema pendanaan, contoh pembagian{" "}
                  {rupiah(NOMINAL_CONTOH_PROPOSAL)}, dan simulasi Rp 5 juta
                  sampai Rp 50 juta.
                </li>
                <li>
                  Cakupan biaya platform, langkah preventif, dan batas jaminan.
                </li>
                <li>Alur kemitraan dan kontak layanan.</li>
              </ol>
            </div>
          </div>
        </section>

        <section
          aria-labelledby="judul-risiko"
          className="border-y border-border bg-slate-50"
        >
          <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
            <div className="max-w-3xl">
              <h2
                id="judul-risiko"
                className="font-display text-3xl leading-tight tracking-tight text-navy sm:text-4xl"
              >
                Sisi yang tidak menguntungkan
              </h2>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Pendanaan bukan tabungan. Sebelum menyetor, pastikan Anda bisa
                menerima kemungkinan ini.
              </p>
            </div>

            <ul className="mt-7 grid gap-5 sm:grid-cols-2">
              {[
                {
                  judul: "Modal bisa hilang",
                  isi: "Jika peminjam gagal bayar, pokok dan Imbal Hasil tidak kembali. PINDAI menagih, tetapi tidak menjamin pembayaran.",
                },
                {
                  judul: "Dana tertahan pada satu peminjam",
                  isi: "Satu pinjaman didanai satu pendana. Seluruh pokok pada satu alokasi bergantung pada satu peminjam, tanpa penyebaran otomatis.",
                },
                {
                  judul: "Pencairan mengikuti pelunasan",
                  isi: `Siklus ${TENOR_PENDANA_HARI} hari adalah acuan hak, bukan jadwal penagihan. Keterlambatan peminjam ikut menunda pencairan hasil Anda.`,
                },
                {
                  judul: "Tidak ada penjamin pihak ketiga",
                  isi: "Tidak ada jaminan LPS, asuransi, atau lembaga penjamin untuk dana pendanaan, kecuali ada perjanjian tertulis yang menyatakannya.",
                },
              ].map((risiko) => (
                <li key={risiko.judul} className="border-t border-border pt-4">
                  <h3 className="text-sm font-semibold text-navy">
                    {risiko.judul}
                  </h3>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    {risiko.isi}
                  </p>
                </li>
              ))}
            </ul>

            <p className="mt-7 max-w-3xl text-xs leading-5 text-slate-600">
              Baca juga{" "}
              <Link
                className="font-semibold text-primary underline underline-offset-4"
                to="/syarat-ketentuan"
              >
                Syarat &amp; Ketentuan
              </Link>{" "}
              dan bagian aturan perhitungan di ruang pendana setelah akun Anda
              aktif.
            </p>
          </div>
        </section>

        <section
          aria-labelledby="judul-tanya"
          className="mx-auto max-w-6xl px-4 py-14 sm:px-6"
        >
          <div className="grid gap-8 lg:grid-cols-[0.75fr_1.25fr] lg:items-start">
            <div>
              <h2
                id="judul-tanya"
                className="font-display text-3xl leading-tight tracking-tight text-navy sm:text-4xl"
              >
                Yang biasanya ditanyakan lebih dulu
              </h2>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Jawabannya mengikuti cara kerja aplikasi dan kebijakan yang
                berlaku, bukan perkiraan.
              </p>
            </div>
            <Accordion
              type="single"
              collapsible
              className="border-y border-border"
            >
              {[
                {
                  q: "Apakah uang saya dijamin kembali?",
                  a: "Tidak. PINDAI mencatat alokasi dan menagih pinjaman, tetapi pembayaran bergantung pada peminjam. Tidak ada jaminan dari LPS, asuransi, atau pihak ketiga.",
                },
                {
                  q: "Kapan Imbal Hasil dibayarkan?",
                  a: `Setelah pinjaman lunas. Saat itu hak Anda dibukukan, lalu admin mentransfernya di luar aplikasi dan mencatat transfer tersebut. Selama pinjaman berjalan, angka di portofolio baru perkiraan.`,
                },
                {
                  q: "Bisakah dana ditarik kapan saja?",
                  a: "Tidak. Alokasi mengikuti pinjaman yang sedang berjalan, jadi dana kembali setelah pinjaman selesai. Aplikasi tidak menyediakan penarikan otomatis atau pembatalan sepihak.",
                },
                {
                  q: "Bagaimana kalau peminjam terlambat membayar?",
                  a: "Sistem memantau jatuh tempo dan PINDAI melakukan penagihan. Keterlambatan menunda pencairan hasil Anda. Perpanjangan atau cicilan pokok peminjam tidak mengubah nominal hak pendana yang sudah tercatat.",
                },
                {
                  q: "Bagaimana cara menjadi pendana?",
                  a: `Hubungi layanan pelanggan di WhatsApp ${nomorLayananProposal()}. Admin menjelaskan syarat pendaftaran, membuatkan akun, lalu Anda masuk dengan OTP email. Penyetoran dan transfer hasil dilakukan di luar aplikasi.`,
                },
                {
                  q: "Apakah laporan bisa saya unduh sendiri?",
                  a: "Proposal di halaman ini bisa diunduh kapan saja selama akses ruang pendana Anda masih berlaku. Laporan portofolio dan laporan pelunasan tersedia di ruang pendana dan bisa diminta lewat WhatsApp.",
                },
              ].map((item) => (
                <AccordionItem
                  key={item.q}
                  value={item.q}
                  className="border-border"
                >
                  <AccordionTrigger className="min-h-12 text-left text-sm font-semibold text-navy">
                    {item.q}
                  </AccordionTrigger>
                  <AccordionContent className="text-sm leading-6 text-slate-600">
                    {item.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </section>

        <section
          aria-labelledby="judul-mulai"
          className="border-t border-border bg-card"
        >
          <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-12 sm:px-6 md:flex-row md:items-center md:justify-between">
            <div className="max-w-2xl">
              <h2
                id="judul-mulai"
                className="font-display text-3xl leading-tight tracking-tight text-navy"
              >
                Bicarakan nominal dan waktunya
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Layanan pelanggan PINDAI membuka WhatsApp di{" "}
                <span className="font-semibold tabular-nums text-slate-800">
                  {nomorLayananProposal()}
                </span>
                . Sampaikan rencana nominal Anda, lalu admin menjelaskan syarat
                dan langkah sebelum akun dibuat.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button asChild className="min-h-11">
                <a
                  href={urlChatCs(
                    "Saya ingin menjadi pendana PINDAI. Mohon dijelaskan syarat, nominal minimum, dan langkah pendaftarannya.",
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <MessageCircle className="mr-2 size-4" aria-hidden />
                  Chat layanan pelanggan
                </a>
              </Button>
              <Button asChild variant="outline" className="min-h-11">
                <Link to="/auth?returnTo=%2Fpenyedia-dana">
                  Masuk ruang pendana
                </Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}

/**
 * Rute ruang pendana memakai biaya platform dari Pengaturan Parameter Bisnis yang
 * sama dengan pencatatan hak pendana. Bila query belum termuat, angka bawaan
 * yang dirender supaya halaman dan unduhan tetap bisa dipakai.
 */
export default function JadiPendana() {
  const ketentuan = useQuery(api.system.getKetentuanBiaya);
  return (
    <JadiPendanaView
      persenPotonganAdmin={ketentuan?.persenAdmin ?? DEFAULT_CONFIG.persenAdmin}
    />
  );
}
