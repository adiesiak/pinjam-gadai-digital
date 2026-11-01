import { useQuery } from "convex/react";
import { IkonWhatsapp } from "@/components/IkonWhatsapp";
import { FileDown, Loader2 } from "lucide-react";
import { Fragment, useState } from "react";
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
import { PERSEN_PORSI_PLATFORM } from "@/lib/kebijakanPinjaman";
import {
  PERSEN_IMBAL_PENDANA,
  TENOR_PENDANA_HARI,
  bagiHasilPendana,
} from "@/lib/imbalPendana";
import { unduhLewatAplikasi } from "@/lib/jembatanAndroid";
import { formatRupiahAman, kelompokkanDigit } from "@/lib/money";
import { susunPdf } from "@/lib/pdfSederhana";
import {
  KONTEN_PENDANA_DEFAULT,
  gantiTokenPendana,
  type KontenPendana,
  type NilaiTokenPendana,
} from "@/lib/kontenPendana";
import {
  NOMINAL_CONTOH_PROPOSAL,
  POKOK_CONTOH_BULANAN,
  POKOK_CONTOH_KONVENSIONAL,
  PROPOSAL_DIPERBARUI_PADA,
  TENOR_BULANAN_PROPOSAL,
  formatPersen,
  keuntunganBulananProposal,
  pembagianKonvensionalProposal,
  simulasiKonvensionalProposal,
  namaBerkasProposalPendana,
  nomorLayananProposal,
  POKOK_CONTOH_SYARIAH,
  pembagianSyariahProposal,
  proposalPendanaanPindai,
  simulasiBulananProposal,
  simulasiSyariahProposal,
  tarifBulananProposal,
} from "@/lib/proposalPendana";

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
 * `lib/imbalPendana` dengan porsi 47 : 13, jalur yang sama dengan pencatatan
 * hak pendana di server.
 *
 * Halaman ini sengaja tidak menampilkan testimoni, jumlah pendana, atau tingkat
 * keberhasilan pembayaran: tidak ada angka nyata yang bisa dipertanggung-
 * jawabkan untuk itu, dan klaim tanpa sumber merusak kepercayaan justru di
 * halaman yang tugasnya membangun kepercayaan.
 */

function rupiah(nilai: number): string {
  return formatRupiahAman(nilai);
}

/** Serahkan satu berkas ke perangkat: jembatan aplikasi dulu, lalu unduhan biasa. */
async function serahkanBerkas(nama: string, blob: Blob): Promise<void> {
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

/** Susun berkas lalu serahkan ke perangkat, termasuk jembatan aplikasi Android. */
async function simpanProposal(persenPotonganAdmin: number): Promise<void> {
  const dibuatPada = Date.now();
  const byte = susunPdf(
    proposalPendanaanPindai({ persenPotonganAdmin, dibuatPada }),
  );
  const blob = new Blob([new Uint8Array(byte)], {
    type: "application/pdf",
  });
  await serahkanBerkas(namaBerkasProposalPendana(dibuatPada), blob);
}

/** Unduh proposal yang dipasang admin, memakai nama berkas aslinya. */
async function simpanProposalTersimpan(
  url: string,
  namaBerkas: string,
): Promise<void> {
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error("Berkas proposal gagal diambil. Coba lagi sebentar.");
  }
  await serahkanBerkas(namaBerkas, await resp.blob());
}

/**
 * Satu tombol unduh, dipakai di hero dan di bagian proposal. Bila admin sudah
 * memasang berkas proposal, tombol mengunduh berkas itu; bila belum, berkas
 * disusun dari kebijakan yang berlaku saat tombol ditekan.
 */
type ProposalTersimpan = {
  url: string;
  namaBerkas: string;
  /** Waktu berkas dipasang admin; kosong untuk data lama tanpa cap waktu. */
  pada?: number | null;
} | null;

/**
 * Berkas yang dipasang admin hanya dipakai bila dipasang pada atau setelah
 * pembaruan isi proposal. Berkas lama tidak memuat tabel terbaru, jadi tombol
 * unduh kembali menyusun dokumen dari kebijakan yang berlaku.
 */
function berkasMasihBerlaku(berkas: ProposalTersimpan): boolean {
  if (berkas === null) return false;
  if (berkas.pada === undefined || berkas.pada === null) return true;
  return berkas.pada >= PROPOSAL_DIPERBARUI_PADA;
}

function TombolUnduhProposal({
  persenPotonganAdmin,
  proposalTersimpan,
  variant = "default",
  label = "Unduh proposal (PDF)",
}: {
  persenPotonganAdmin: number;
  proposalTersimpan: ProposalTersimpan;
  variant?: "default" | "outline";
  label?: string;
}) {
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  async function unduh() {
    setSibuk(true);
    setGalat(null);
    try {
      if (proposalTersimpan !== null && berkasMasihBerlaku(proposalTersimpan)) {
        await simpanProposalTersimpan(
          proposalTersimpan.url,
          proposalTersimpan.namaBerkas,
        );
      } else {
        await simpanProposal(persenPotonganAdmin);
      }
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
  konten,
  t,
}: {
  konten: KontenPendana;
  /** Isi token kebijakan (`{biaya}`, `{imbal}`, ...) pada teks CMS. */
  t: (teks: string) => string;
}) {
  const [isian, setIsian] = useState(() =>
    kelompokkanDigit(String(NOMINAL_CONTOH_PROPOSAL)),
  );

  const digit = isian.replace(/\D/g, "");
  const angka = digit === "" ? 0 : Number(digit);
  const nominal = Number.isSafeInteger(angka) && angka >= 0 ? angka : 0;
  const terlaluBesar = digit.length > 15 || !Number.isSafeInteger(angka);
  const bagi = bagiHasilPendana(nominal);

  const pilihan = [5_000_000, 10_000_000, 25_000_000, 50_000_000] as const;

  return (
    <section
      id="kalkulator"
      aria-labelledby="judul-kalkulator"
      className="mx-auto max-w-6xl scroll-mt-24 px-4 py-10 sm:px-6 sm:py-14"
    >
      <div className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
        <div>
          <h2
            id="judul-kalkulator"
            className="font-display text-3xl leading-tight tracking-tight text-navy sm:text-4xl"
          >
            {t(konten.kalkulatorJudul)}
          </h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            {t(konten.kalkulatorDeskripsi)}
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
              : t(konten.kalkulatorCatatan)}
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
              label={`Porsi platform (${formatPersen(Number(PERSEN_PORSI_PLATFORM.toFixed(2)))})`}
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
            Keuntungan bersih adalah uang yang diterima dikurangi pokok. Marjin
            pinjaman dibagi 47 : 13, jadi pokok Anda kembali utuh dan bagian
            platform diambil dari marjin, bukan dari pokok.
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
          <Button asChild variant="outline" className="min-h-11">
            <Link to="/penyedia-dana">Kembali ke ruang pendana</Link>
          </Button>
          {/* Menu ponsel paling kanan agar panelnya muat di layar 375px. */}
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
            kelasTombol="flex size-11 shrink-0 items-center justify-center rounded-lg border border-border text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            kelasPanel="absolute right-0 top-full z-50 mt-2 grid w-56 max-w-[calc(100vw-2rem)] gap-1 rounded-xl border border-border bg-background p-2 text-sm shadow-lg"
            kelasTautan="rounded-lg px-3 py-3 hover:bg-muted"
          />
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

/**
 * Satu paragraf CMS dengan nomor layanan ditebalkan.
 *
 * Admin hanya menulis `{kontak}` di teks; nomornya tetap dari `lib/kontak`,
 * bukan teks bebas, sehingga nomor resmi tidak bisa tergeser salah ketik.
 */
function ParagrafKontak({ teks }: { teks: string }) {
  const bagian = teks.split("{kontak}");
  return (
    <p className="mt-2 text-sm leading-6 text-slate-600">
      {bagian.map((isi, i) => (
        <Fragment key={i}>
          {i > 0 && (
            <span className="font-semibold tabular-nums text-slate-800">
              {nomorLayananProposal()}
            </span>
          )}
          {isi}
        </Fragment>
      ))}
    </p>
  );
}

/** Isi halaman tanpa Convex, supaya bisa dirender langsung oleh uji markup. */
export function JadiPendanaView({
  persenPotonganAdmin,
  konten = KONTEN_PENDANA_DEFAULT,
  proposalTersimpan = null,
}: {
  persenPotonganAdmin: number;
  konten?: KontenPendana;
  proposalTersimpan?: ProposalTersimpan;
}) {
  // Porsi platform tetap 13/60 dari marjin — pengaturan biaya lama tidak lagi
  // mengubah pembagian, jadi label memakai porsi kebijakan yang berlaku.
  const persen = formatPersen(Number(PERSEN_PORSI_PLATFORM.toFixed(2)));
  const contoh = bagiHasilPendana(NOMINAL_CONTOH_PROPOSAL);
  const token: NilaiTokenPendana = {
    imbal: `${PERSEN_IMBAL_PENDANA}%`,
    biaya: persen,
    siklus: String(TENOR_PENDANA_HARI),
    nominal: rupiah(NOMINAL_CONTOH_PROPOSAL),
    kontak: nomorLayananProposal(),
  };
  const t = (teks: string) => gantiTokenPendana(teks, token);

  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-background text-foreground">
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
                {t(konten.heroJudul)}
              </h1>
              <p className="mt-5 max-w-xl text-base leading-7 text-slate-700">
                {t(konten.heroDeskripsi)}
              </p>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <TombolUnduhProposal
                  persenPotonganAdmin={persenPotonganAdmin}
                  proposalTersimpan={proposalTersimpan}
                />
                <Button asChild variant="outline" className="min-h-11">
                  <a href="#kalkulator">Hitung imbal hasil</a>
                </Button>
              </div>
              <p className="mt-3 text-[11px] leading-5 text-slate-600">
                {t(konten.heroCatatan)}
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
                  label={`Porsi platform (${persen})`}
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
                Angka contoh, bukan janji. Hasil siklus dicairkan pada jatuh
                tempo {TENOR_PENDANA_HARI} hari. Bila pinjaman belum lunas,
                kekurangan ditutup akun cadangan platform, bukan LPS atau pihak
                ketiga, lalu pemulihannya masuk kembali ke akun itu.
              </p>
            </aside>
          </div>
        </section>

        <section
          aria-labelledby="judul-prinsip"
          className="border-y border-border bg-card"
        >
          <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 sm:gap-8 sm:px-6 sm:py-12 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <h2
                id="judul-prinsip"
                className="font-display text-3xl leading-tight tracking-tight text-navy sm:text-4xl"
              >
                {t(konten.prinsipJudul)}
              </h2>
              <p className="mt-3 max-w-md text-sm leading-6 text-slate-600">
                {t(konten.prinsipDeskripsi)}
              </p>
            </div>
            <ol className="divide-y divide-border border-y border-border">
              {konten.prinsip.map((butir, i) => (
                <li
                  key={`${butir.judul}-${i}`}
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
                      {t(butir.judul)}
                    </h3>
                    <p className="mt-1 text-sm leading-6 text-slate-600">
                      {t(butir.isi)}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <KalkulatorPendanaan konten={konten} t={t} />

        {/* Perhitungan yang sama, dibuka langkah demi langkah. Fungsinya
            membuktikan bahwa tiap baris di kalkulator berasal dari dua angka
            yang tertulis, bukan dari tabel yang disembunyikan. */}
        <section
          aria-labelledby="judul-perhitungan"
          className="border-y border-border bg-slate-50"
        >
          <div className="mx-auto grid max-w-6xl gap-6 px-4 py-10 sm:gap-8 sm:px-6 sm:py-14 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
            <div>
              <h2
                id="judul-perhitungan"
                className="font-display text-3xl leading-tight tracking-tight text-navy sm:text-4xl"
              >
                {t(konten.perhitunganJudul)}
              </h2>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                {t(konten.perhitunganDeskripsi)}
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
                  rumus: `Porsi platform = marjin × ${persen} = ${rupiah(contoh.potonganAdmin)}`,
                  isi: "Marjin pinjaman dibagi 47 : 13, yaitu 78,33% untuk pendana dan 21,67% untuk platform.",
                },
                {
                  rumus: `Diterima = uang kembali - porsi platform = ${rupiah(contoh.diterima)}`,
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

        {/* Satu aturan bagi hasil, lima produk. Ditulis sebagai fakta
            kebijakan: tidak ada angka hasil yang dijanjikan di sini, karena
            marjin tiap produk berbeda menurut tenor dan pokoknya. */}
        <section
          aria-labelledby="judul-produk"
          className="border-y border-border bg-card"
        >
          <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
            <div className="max-w-3xl">
              <h2
                id="judul-produk"
                className="font-display text-3xl leading-tight tracking-tight text-navy sm:text-4xl"
              >
                Pembagian mengikuti jenis produk
              </h2>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Pinjaman harian atau tenor di bawah {TENOR_PENDANA_HARI} hari
                memakai acuan marjin {PERSEN_IMBAL_PENDANA}% flat. Pinjaman
                bulanan, gadai, kredit barang, dan syariah memakai 78,33% dari
                marjin aktual produknya. Pada semua produk, {persen} dari marjin
                menjadi porsi platform dan sisanya untuk pendana. Biaya layanan
                dan biaya admin berada di luar pembagian ini.
              </p>
            </div>
            <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {[
                {
                  nama: "Pinjaman harian",
                  isi: "Tenor pendek dengan cicilan per hari.",
                },
                {
                  nama: "Pinjaman bulanan",
                  isi: "Tenor 1–12 bulan, angsuran bulanan.",
                },
                {
                  nama: "Pembiayaan syariah",
                  isi: "Akad murabahah dengan margin tetap.",
                },
                {
                  nama: "Gadai",
                  isi: "Agunan fisik, sewa modal per periode.",
                },
                {
                  nama: "Kredit barang",
                  isi: "Barang merchant mitra, cicilan bulanan.",
                },
              ].map((produk) => (
                <li
                  key={produk.nama}
                  className="rounded-xl border border-border bg-slate-50 px-4 py-3"
                >
                  <p className="text-sm font-semibold text-navy">
                    {produk.nama}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-slate-600">
                    {produk.isi}
                  </p>
                </li>
              ))}
            </ul>

            {/* Tiga produk konvensional yang marjinnya tidak dibahas di tabel
                tenor bulanan: harian, gadai, dan kredit barang. Angkanya
                berasal dari mesin produk masing-masing lalu dibagi 47 : 13. */}
            <div className="mt-8 max-w-3xl">
              <h3 className="font-display text-xl tracking-tight text-navy">
                Pembagian produk konvensional
              </h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Pokok contoh {rupiah(POKOK_CONTOH_KONVENSIONAL)}. Harian memakai
                skema acuan {PERSEN_IMBAL_PENDANA}% flat; gadai dan kredit barang
                memakai 78,33% dari marjin aktualnya; gadai memakai batas atas
                sewa modal 10% per 30 hari, kredit barang memakai tenor 3 bulan
                dengan DP 20%.
                Kolom diterima adalah pokok ditambah hak pendana. Pinjaman
                bulanan tidak diulang di sini karena tarifnya berbeda per tenor
                dan dibahas pada tabel berikutnya.
              </p>
            </div>
            <div className="mt-4 overflow-x-auto rounded-xl border border-border bg-white">
              <table className="w-full min-w-[680px] border-collapse text-sm">
                <caption className="px-4 pt-3 text-left text-xs text-slate-600">
                  Pembagian marjin per produk konvensional, pokok{" "}
                  {rupiah(POKOK_CONTOH_KONVENSIONAL)}
                </caption>
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-[0.08em] text-slate-600">
                    <th scope="col" className="px-4 py-2.5 font-semibold">
                      Produk
                    </th>
                    <th scope="col" className="px-4 py-2.5 font-semibold">
                      Dasar marjin
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-2.5 text-right font-semibold"
                    >
                      Marjin
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-2.5 text-right font-semibold"
                    >
                      Pendana 47/60
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-2.5 text-right font-semibold"
                    >
                      Platform 13/60
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-2.5 text-right font-semibold"
                    >
                      Diterima pendana
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pembagianKonvensionalProposal().map((baris) => (
                    <tr
                      key={baris.produk}
                      className="border-b border-border/70 last:border-b-0"
                    >
                      <th
                        scope="row"
                        className="px-4 py-2.5 text-left font-medium text-slate-900"
                      >
                        {baris.produk}
                      </th>
                      <td className="px-4 py-2.5 text-xs leading-5 text-slate-600">
                        {baris.dasar}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">
                        {rupiah(baris.margin)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-emerald-800">
                        {rupiah(baris.pendana)}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">
                        {rupiah(baris.platform)}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">
                        {rupiah(baris.diterima)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 max-w-3xl text-xs leading-5 text-slate-600">
              Kredit barang memakai pokok yang dibiayai setelah DP, bukan harga
              barang. Biaya admin 2% pada kredit dan biaya layanan pada produk
              lain berada di luar pembagian ini.
            </p>

            <div className="mt-8 max-w-3xl">
              <h3 className="font-display text-xl tracking-tight text-navy">
                Simulasi konvensional Rp 1 juta sampai Rp 10 juta
              </h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Isi sel adalah hak pendana (47/60 marjin), tanpa pokok. Kolom
                harian memakai satu siklus acuan 30 hari; tiket harian yang
                disalurkan Rp 500.000 sampai Rp 1.000.000. Kolom kredit adalah
                pokok yang dibiayai setelah DP 20%.
              </p>
            </div>
            <div className="mt-4 overflow-x-auto rounded-xl border border-border bg-white">
              <table className="w-full min-w-[560px] border-collapse text-sm">
                <caption className="px-4 pt-3 text-left text-xs text-slate-600">
                  Hak pendana produk konvensional per nominal
                </caption>
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-[0.08em] text-slate-600">
                    <th scope="col" className="px-4 py-2.5 font-semibold">
                      Pokok
                    </th>
                    {["Harian", "Gadai 10%", "Kredit 3 bln"].map((label) => (
                      <th
                        key={label}
                        scope="col"
                        className="px-4 py-2.5 text-right font-semibold"
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {simulasiKonvensionalProposal().map((baris) => (
                    <tr
                      key={baris.pokok}
                      className="border-b border-border/70 last:border-b-0"
                    >
                      <th
                        scope="row"
                        className="px-4 py-2.5 text-left font-medium tabular-nums text-slate-700"
                      >
                        {rupiah(baris.pokok)}
                      </th>
                      {[baris.harian, baris.gadai, baris.kredit].map(
                        (nilai, i) => (
                          <td
                            key={i}
                            className="px-4 py-2.5 text-right tabular-nums text-slate-700"
                          >
                            {rupiah(nilai)}
                          </td>
                        ),
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Tenor bulanan dihitung mesin yang sama dengan kontrak; tabelnya
                sengaja menampilkan setara per bulan supaya tenor panjang tidak
                terbaca sebagai hasil yang lebih besar per bulan. */}
            <div className="mt-8 max-w-3xl">
              <h3 className="font-display text-xl tracking-tight text-navy">
                Keuntungan pinjaman bulanan 1/3/6/9/12
              </h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Contoh pokok {rupiah(POKOK_CONTOH_BULANAN)}. Marjin tiap tenor
                dibagi 47 : 13; biaya layanan dan biaya admin berada di luar
                pembagian ini.
              </p>
            </div>
            <div className="mt-4 overflow-x-auto rounded-xl border border-border bg-white">
              <table className="w-full min-w-[560px] border-collapse text-sm">
                <caption className="px-4 pt-3 text-left text-xs text-slate-600">
                  Hak pendana per tenor, pokok {rupiah(POKOK_CONTOH_BULANAN)}
                </caption>
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-[0.08em] text-slate-600">
                    <th scope="col" className="px-4 py-2.5 font-semibold">
                      Tenor
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-2.5 text-right font-semibold"
                    >
                      Bunga / bulan
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-2.5 text-right font-semibold"
                    >
                      Marjin total tenor
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-2.5 text-right font-semibold"
                    >
                      Hak pendana
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-2.5 text-right font-semibold"
                    >
                      Porsi platform
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-2.5 text-right font-semibold"
                    >
                      Setara per bulan
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {keuntunganBulananProposal().map((baris) => (
                    <tr
                      key={baris.tenor}
                      className="border-b border-border/70 last:border-b-0"
                    >
                      <th
                        scope="row"
                        className="px-4 py-2.5 text-left font-medium text-slate-700"
                      >
                        {baris.tenor} bulan
                      </th>
                      <td className="px-4 py-2.5 text-right font-medium tabular-nums text-slate-900">
                        {formatPersen(
                          tarifBulananProposal().find(
                            (t) => t.tenor === baris.tenor,
                          )?.perBulan ?? 0,
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">
                        {rupiah(baris.margin)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-emerald-800">
                        {rupiah(baris.pendana)}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">
                        {rupiah(baris.platform)}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">
                        {rupiah(baris.perBulan)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 max-w-3xl text-xs leading-5 text-slate-600">
              Dana tenor bulanan terikat sampai tenor selesai: hak pendana
              dibayarkan setelah pinjaman lunas, bukan setiap bulan. Kolom
              setara per bulan hanya pembanding, dan tenor lebih panjang tidak
              menaikkan hasil per bulan karena marjin per bulannya menurun.
            </p>

            <div className="mt-8 max-w-3xl">
              <h3 className="font-display text-xl tracking-tight text-navy">
                Simulasi pinjaman bulanan Rp 1 juta sampai Rp 10 juta
              </h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Isi sel adalah hak bersih pendana untuk tenor itu; pokok kembali
                utuh dan tidak termasuk di dalamnya. Bunga yang dipakai:{" "}
                {tarifBulananProposal()
                  .map(
                    (t) =>
                      `${t.tenor} bln ${formatPersen(t.perBulan)}/bln (${formatPersen(t.total)} total)`,
                  )
                  .join(", ")}
                .
              </p>
            </div>
            <div className="mt-4 overflow-x-auto rounded-xl border border-border bg-white">
              <table className="w-full min-w-[560px] border-collapse text-sm">
                <caption className="px-4 pt-3 text-left text-xs text-slate-600">
                  Hak pendana per tenor, pokok Rp 1 juta sampai Rp 10 juta
                </caption>
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-[0.08em] text-slate-600">
                    <th scope="col" className="px-4 py-2.5 font-semibold">
                      Pokok
                    </th>
                    {TENOR_BULANAN_PROPOSAL.map((tenor) => (
                      <th
                        key={tenor}
                        scope="col"
                        className="px-4 py-2.5 text-right font-semibold"
                      >
                        {tenor} bln
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {simulasiBulananProposal().map((baris) => (
                    <tr
                      key={baris.pokok}
                      className="border-b border-border/70 last:border-b-0"
                    >
                      <th
                        scope="row"
                        className="px-4 py-2.5 text-left font-medium tabular-nums text-slate-700"
                      >
                        {rupiah(baris.pokok)}
                      </th>
                      {TENOR_BULANAN_PROPOSAL.map((tenor) => {
                        const nilai = baris.pendana[tenor];
                        return (
                          <td
                            key={tenor}
                            className={`px-4 py-2.5 text-right tabular-nums ${
                              nilai === null
                                ? "text-slate-500"
                                : "text-slate-700"
                            }`}
                          >
                            {nilai === null ? "-" : rupiah(nilai)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 max-w-3xl text-xs leading-5 text-slate-600">
              Tanda hubung berarti tenor itu belum tersedia untuk pokok
              tersebut: tenor 3 bulan ke atas mensyaratkan pokok minimal Rp
              3.000.000.
            </p>

            {/* Akad syariah punya dasar margin/ujrah sendiri, tetapi porsi
                bagi hasilnya sama 47 : 13. Dua tabel ini memakai mesin akad
                yang sama dengan server, bukan salinan rumus. */}
            <div className="mt-8 max-w-3xl">
              <h3 className="font-display text-xl tracking-tight text-navy">
                Pembagian produk syariah
              </h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Murabahah, rahn, dan qardh memakai aturan bagi hasil yang sama:
                margin atau ujrah dibagi 47 : 13. Tabel memakai pokok{" "}
                {rupiah(POKOK_CONTOH_SYARIAH)}; kolom diterima adalah pokok
                ditambah hak pendana.
              </p>
            </div>
            <div className="mt-4 overflow-x-auto rounded-xl border border-border bg-white">
              <table className="w-full min-w-[640px] border-collapse text-sm">
                <caption className="px-4 pt-3 text-left text-xs text-slate-600">
                  Pembagian margin/ujrah per akad, pokok{" "}
                  {rupiah(POKOK_CONTOH_SYARIAH)}
                </caption>
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-[0.08em] text-slate-600">
                    <th scope="col" className="px-4 py-2.5 font-semibold">
                      Akad
                    </th>
                    <th scope="col" className="px-4 py-2.5 font-semibold">
                      Dasar margin/ujrah
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-2.5 text-right font-semibold"
                    >
                      Margin/ujrah
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-2.5 text-right font-semibold"
                    >
                      Pendana 47/60
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-2.5 text-right font-semibold"
                    >
                      Platform 13/60
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-2.5 text-right font-semibold"
                    >
                      Diterima pendana
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pembagianSyariahProposal().map((baris) => (
                    <tr
                      key={baris.akad}
                      className="border-b border-border/70 last:border-b-0"
                    >
                      <th
                        scope="row"
                        className="px-4 py-2.5 text-left font-medium text-slate-900"
                      >
                        {baris.akad}
                      </th>
                      <td className="px-4 py-2.5 text-xs leading-5 text-slate-600">
                        {baris.dasar}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">
                        {rupiah(baris.margin)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-emerald-800">
                        {rupiah(baris.pendana)}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">
                        {rupiah(baris.platform)}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">
                        {rupiah(baris.diterima)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 max-w-3xl text-xs leading-5 text-slate-600">
              Murabahah memakai batas atas margin 20%; rahn memakai satu siklus
              ujrah 30 hari dengan taksiran sama dengan pokok; qardh tidak
              mengambil margin, sehingga pokok kembali 100% tanpa bagian yang
              dibagi.
            </p>

            <div className="mt-8 max-w-3xl">
              <h3 className="font-display text-xl tracking-tight text-navy">
                Simulasi syariah Rp 1 juta sampai Rp 10 juta
              </h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Isi sel adalah hak pendana (47/60 margin atau ujrah), tanpa
                pokok. Murabahah ditampilkan pada margin 15% dan 20%.
              </p>
            </div>
            <div className="mt-4 overflow-x-auto rounded-xl border border-border bg-white">
              <table className="w-full min-w-[560px] border-collapse text-sm">
                <caption className="px-4 pt-3 text-left text-xs text-slate-600">
                  Hak pendana akad syariah per nominal
                </caption>
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-[0.08em] text-slate-600">
                    <th scope="col" className="px-4 py-2.5 font-semibold">
                      Pokok
                    </th>
                    {["Murabahah 15%", "Murabahah 20%", "Rahn 2%", "Qardh"].map(
                      (label) => (
                        <th
                          key={label}
                          scope="col"
                          className="px-4 py-2.5 text-right font-semibold"
                        >
                          {label}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {simulasiSyariahProposal().map((baris) => (
                    <tr
                      key={baris.pokok}
                      className="border-b border-border/70 last:border-b-0"
                    >
                      <th
                        scope="row"
                        className="px-4 py-2.5 text-left font-medium tabular-nums text-slate-700"
                      >
                        {rupiah(baris.pokok)}
                      </th>
                      {[
                        baris.murabahah15,
                        baris.murabahah20,
                        baris.rahn,
                        baris.qardh,
                      ].map((nilai, i) => (
                        <td
                          key={i}
                          className="px-4 py-2.5 text-right tabular-nums text-slate-700"
                        >
                          {rupiah(nilai)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 max-w-3xl text-xs leading-5 text-slate-600">
              Qardh menunjukkan Rp 0 karena tidak ada margin yang dibagi. Biaya
              layanan dan biaya admin berada di luar pembagian ini.
            </p>
          </div>
        </section>

        <section
          id="proposal"
          aria-labelledby="judul-proposal"
          className="mx-auto max-w-6xl scroll-mt-24 px-4 py-10 sm:px-6 sm:py-14"
        >
          <div className="grid gap-8 rounded-2xl border border-border bg-card p-5 sm:p-7 lg:grid-cols-[1.15fr_0.85fr]">
            <div>
              <h2
                id="judul-proposal"
                className="font-display text-3xl leading-tight tracking-tight text-navy"
              >
                {t(konten.proposalJudul)}
              </h2>
              <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600">
                {t(konten.proposalDeskripsi)}
              </p>

              <div className="mt-5">
                <TombolUnduhProposal
                  persenPotonganAdmin={persenPotonganAdmin}
                  proposalTersimpan={proposalTersimpan}
                  label="Unduh proposal lengkap (PDF)"
                />
              </div>

              <p className="mt-3 text-[11px] leading-5 text-slate-600">
                {berkasMasihBerlaku(proposalTersimpan)
                  ? t(konten.proposalCatatanBerkas)
                  : t(konten.proposalCatatan)}
              </p>
              {proposalTersimpan !== null &&
                !berkasMasihBerlaku(proposalTersimpan) && (
                  <p className="mt-2 rounded-lg border border-amber-300/70 bg-amber-50/70 px-3 py-2 text-[11px] leading-5 text-amber-900">
                    Berkas yang dipasang admin lebih lama dari pembaruan
                    proposal, jadi tombol unduh menyusun dokumen terbaru dari
                    kebijakan yang berlaku.
                  </p>
                )}
            </div>

            <div className="rounded-xl border border-border bg-slate-50 px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">
                Isi dokumen
              </p>
              <ol className="mt-2 space-y-2 text-sm leading-6 text-slate-700">
                {konten.proposalIsi.map((butir, i) => (
                  <li key={`${i}-${butir.slice(0, 24)}`}>{t(butir)}</li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        <section
          aria-labelledby="judul-risiko"
          className="border-y border-border bg-slate-50"
        >
          <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
            <div className="max-w-3xl">
              <h2
                id="judul-risiko"
                className="font-display text-3xl leading-tight tracking-tight text-navy sm:text-4xl"
              >
                {t(konten.risikoJudul)}
              </h2>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                {t(konten.risikoDeskripsi)}
              </p>
            </div>

            <ul className="mt-7 grid gap-5 sm:grid-cols-2">
              {konten.risiko.map((risiko, i) => (
                <li
                  key={`${i}-${risiko.judul.slice(0, 24)}`}
                  className="border-t border-border pt-4"
                >
                  <h3 className="text-sm font-semibold text-navy">
                    {t(risiko.judul)}
                  </h3>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    {t(risiko.isi)}
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
          className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14"
        >
          <div className="grid gap-8 lg:grid-cols-[0.75fr_1.25fr] lg:items-start">
            <div>
              <h2
                id="judul-tanya"
                className="font-display text-3xl leading-tight tracking-tight text-navy sm:text-4xl"
              >
                {t(konten.faqJudul)}
              </h2>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                {t(konten.faqDeskripsi)}
              </p>
            </div>
            <Accordion
              type="single"
              collapsible
              className="border-y border-border"
            >
              {konten.faq.map((item, i) => (
                <AccordionItem
                  key={`${i}-${item.tanya.slice(0, 24)}`}
                  value={`faq-${i}`}
                  className="border-border"
                >
                  <AccordionTrigger className="min-h-12 text-left text-sm font-semibold text-navy">
                    {t(item.tanya)}
                  </AccordionTrigger>
                  <AccordionContent className="text-sm leading-6 text-slate-600">
                    {t(item.jawab)}
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
          <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 sm:gap-6 sm:px-6 sm:py-12 md:flex-row md:items-center md:justify-between">
            <div className="max-w-2xl">
              <h2
                id="judul-mulai"
                className="font-display text-3xl leading-tight tracking-tight text-navy"
              >
                {t(konten.ajakanJudul)}
              </h2>
              <ParagrafKontak teks={konten.ajakanDeskripsi} />
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
                  <IkonWhatsapp className="mr-2 size-4" />
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
 * Rute ruang pendana memakai porsi platform tetap 13/60 dari marjin, sama
 * dengan pencatatan hak pendana. Angka itu bukan biaya layanan yang bisa
 * diubah dari Pengaturan Sistem.
 *
 * Teks halaman dibaca dari CMS (`announcements.getPublic`); konten kosong jatuh
 * ke `KONTEN_PENDANA_DEFAULT` di sisi klien. Berkas proposal admin dibaca dari
 * query terpisah yang hanya menjawab untuk sesi masuk.
 */
export default function JadiPendana() {
  const publik = useQuery(api.announcements.getPublic);
  const berkas = useQuery(api.announcements.proposalPendanaAktif);
  return (
    <JadiPendanaView
      persenPotonganAdmin={PERSEN_PORSI_PLATFORM}
      konten={publik?.pendana ?? KONTEN_PENDANA_DEFAULT}
      proposalTersimpan={
        berkas === undefined || berkas === null
          ? null
          : { url: berkas.url, namaBerkas: berkas.namaBerkas, pada: berkas.pada }
      }
    />
  );
}
