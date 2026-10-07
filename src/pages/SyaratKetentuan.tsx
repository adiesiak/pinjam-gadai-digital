import { motion } from "framer-motion";
import {
  ArrowLeft,
  BadgeCheck,
  BookOpen,
  FileText,
  Gavel,
  KeyRound,
  Landmark,
  Lock,
  MapPin,
  Percent,
  Scale,
  ScrollText,
  ShieldCheck,
  Vault,
  Wallet,
} from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";

import { Button } from "@/components/ui/button";
import { CONTRACT_TERMS_VERSION } from "@/lib/contract";

/**
 * Halaman Syarat & Ketentuan (publik).
 *
 * Ringkasan ketentuan pemakaian aplikasi PINDAI: lingkup layanan (pencatatan
 * ledger internal, bukan pemindahan dana), akun & keamanan, data pribadi,
 * skema biaya pinjaman, pelunasan & denda, gadai, kredit barang, hak penyedia
 * dana, serta batasan tanggung jawab. Angka diturunkan dari ketentuan produk
 * yang berlaku di kode, bukan dikarang bebas.
 */

const TERAKHIR_DIPERBARUI = "3 Oktober 2026";

type Pasal = {
  id: string;
  judul: string;
  ikon: ReactNode;
  isi: ReactNode;
};

/** Kotak penekanan untuk hal yang mudah disalahpahami. */
function Catatan({
  tone = "info",
  judul,
  children,
}: {
  tone?: "info" | "penting";
  judul: string;
  children: ReactNode;
}) {
  const gaya =
    tone === "penting"
      ? "border-amber-200 bg-amber-50/70 text-amber-950"
      : "border-slate-200 bg-slate-50/70 text-slate-700";
  const Ikon = tone === "penting" ? Scale : BookOpen;
  return (
    <div className={`mt-4 rounded-xl border px-4 py-3 text-xs leading-6 ${gaya}`}>
      <p className="flex items-center gap-2 font-semibold">
        <Ikon className="size-3.5 shrink-0" aria-hidden />
        {judul}
      </p>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function Ayat({ children }: { children: ReactNode }) {
  return <li className="text-sm leading-7 text-slate-600">{children}</li>;
}

const PASAL: Pasal[] = [
  {
    id: "penerimaan",
    judul: "Penerimaan Syarat",
    ikon: <BadgeCheck className="size-4" />,
    isi: (
      <>
        <p className="text-sm leading-7 text-slate-600">
          Dengan mengakses atau memakai aplikasi PINDAI — termasuk membuat akun, mengajukan
          pinjaman, gadai, atau kredit barang — Anda dianggap telah membaca, memahami, dan
          menyetujui seluruh ketentuan pada halaman ini. Bila tidak setuju, mohon berhenti
          menggunakan layanan.
        </p>
        <Catatan judul="Ringkas">
          Syarat ini adalah ringkasan umum. Untuk setiap pengajuan yang disetujui, berlaku pula
          perjanjian (akad) khusus yang ditandatangani pada halaman kontrak aplikasi.
        </Catatan>
      </>
    ),
  },
  {
    id: "layanan",
    judul: "Lingkup Layanan",
    ikon: <ScrollText className="size-4" />,
    isi: (
      <>
        <p className="text-sm leading-7 text-slate-600">
          PINDAI adalah <strong>aplikasi pencatatan</strong> pengajuan pinjaman, gadai, dan
          pembukuan (ledger) internal. Aplikasi membantu menyusun angka, jadwal, dan status
          kewajiban secara transparan.
        </p>
        <ul className="mt-3 list-disc space-y-1.5 pl-5">
          <Ayat>
            PINDAI <strong>tidak</strong> memindahkan uang secara otomatis dan tidak menjadi
            penyelenggara transfer dana.
          </Ayat>
          <Ayat>
            Pencairan dana, pembayaran ke merchant, inspeksi, penyerahan, dan penitipan barang
            jaminan ditangani di luar aplikasi.
          </Ayat>
          <Ayat>
            Setiap perubahan status (mis. &ldquo;lunas&rdquo;) adalah pencatatan pada ledger
            internal aplikasi, bukan bukti mutasi rekening bank.
          </Ayat>
        </ul>
        <Catatan tone="penting" judul="Bukan bukti mutasi bank">
          Angka pada aplikasi adalah catatan internal. Selalu verifikasi pengiriman/penerimaan
          dana melalui kanal resmi dan rekening yang benar sebelum bertransaksi.
        </Catatan>
      </>
    ),
  },
  {
    id: "akun",
    judul: "Akun & Keamanan",
    ikon: <KeyRound className="size-4" />,
    isi: (
      <ul className="list-disc space-y-1.5 pl-5">
        <Ayat>
          Anda wajib memberikan data yang benar, terbaru, dan milik Anda sendiri.
        </Ayat>
        <Ayat>
          Akun peminjam masuk dengan verifikasi email (kode OTP). Jangan bagikan kode masuk kepada
          siapa pun; aktivitas yang memakai akun Anda dianggap sebagai tindakan Anda.
        </Ayat>
        <Ayat>
          Tim admin memakai verifikasi dua faktor (TOTP). Akses panel operasional terbatas untuk
          akun tim yang berwenang.
        </Ayat>
        <Ayat>
          Akses &ldquo;lihat saja&rdquo; untuk ruang penyedia dana diberikan dan dapat dicabut oleh
          admin, baik per akun email maupun lewat kode akses bersama. Setiap perubahan akses
          tercatat pada audit trail.
        </Ayat>
        <Ayat>
          Segera hubungi pengurus bila mencurigai penyalahgunaan akun.
        </Ayat>
      </ul>
    ),
  },
  {
    id: "data",
    judul: "Data Pribadi & Lokasi",
    ikon: <MapPin className="size-4" />,
    isi: (
      <>
        <ul className="list-disc space-y-1.5 pl-5">
          <Ayat>
            Untuk menilai pengajuan, Anda dapat diminta mengunggah data identitas (mis. KTP),
            foto/slip terkait, serta informasi bank/e-wallet dan rekening.
          </Ayat>
          <Ayat>
            Saat mengajukan, aplikasi mencatat <strong>lokasi perangkat (GPS)</strong> beserta
            waktu sebagai metadata pengajuan. Titik lokasi hanya tampil untuk keperluan peninjauan
            internal.
          </Ayat>
          <Ayat>
            Identitas sensitif (seperti NIK, nomor rekening, dan nomor WhatsApp) tidak ditampilkan
            sebagai kolom terbuka pada ruang pemantau umum; sebagian hanya tersedia bagi peran yang
            berwenang.
          </Ayat>
          <Ayat>
            Anda bertanggung jawab memastikan data yang Anda berikan benar dan boleh dibagikan.
          </Ayat>
        </ul>
        <Catatan judul="Pseudonim peminjam">
          Di beberapa tampilan, peminjam ditandai dengan kode pseudonim acak (mis.{" "}
          <span className="font-mono">PMN-…</span>) sebagai penanda stabil antar-ruang, bukan
          identitas asli.
        </Catatan>
      </>
    ),
  },
  {
    id: "pinjaman",
    judul: "Pinjaman: Pokok, Tenor, Biaya & Bunga",
    ikon: <Percent className="size-4" />,
    isi: (
      <>
        <ul className="list-disc space-y-1.5 pl-5">
          <Ayat>
            Pokok pinjaman tunai mengikuti batas yang berlaku pada aplikasi (saat ini mulai
            Rp100.000 hingga Rp1.000.000), dengan pilihan tenor 7, 14, atau 30 hari.
          </Ayat>
          <Ayat>
            <strong>Biaya admin 2%</strong> dari pokok — biaya platform dihapus (0%), sehingga total
            potongan di muka <strong>2%</strong>. Dana bersih yang diterima dihitung 98% dari pokok
            dan diteruskan sesuai proses pencairan.
          </Ayat>
          <Ayat>
            <strong>Bunga pinjaman 30%</strong> dari pokok, sehingga total kewajiban pelunasan
            menjadi 130% dari pokok (contoh: pokok Rp1.000.000 → total kewajiban Rp1.300.000).
          </Ayat>
          <Ayat>
            Persentase dapat berubah lewat Pengaturan Sistem; angka yang berlaku tercantum pada
            setiap pengajuan dan perjanjian.
          </Ayat>
        </ul>
      </>
    ),
  },
  {
    id: "pelunasan",
    judul: "Pelunasan & Denda Keterlambatan",
    ikon: <Wallet className="size-4" />,
    isi: (
      <>
        <ul className="list-disc space-y-1.5 pl-5">
          <Ayat>
            Kewajiban dilunasi dalam tenor yang dipilih sejak tanggal pendanaan dicatat di
            aplikasi.
          </Ayat>
          <Ayat>
            Denda keterlambatan sebesar <strong>1% per hari dari pokok</strong>, dibatasi
            maksimum <strong>15% dari pokok</strong>. Tidak ada masa tenggang: melewati satu hari
            penuh jatuh tempo terhitung satu hari denda.
          </Ayat>
          <Ayat>
            Pelunasan ditangani di luar aplikasi; statusnya dicatat tim PINDAI pada ledger internal.
          </Ayat>
        </ul>
      </>
    ),
  },
  {
    id: "gadai",
    judul: "Gadai Digital",
    ikon: <Vault className="size-4" />,
    isi: (
      <>
        <ul className="list-disc space-y-1.5 pl-5">
          <Ayat>
            Nilai taksiran dan harga pasar ditetapkan tim PINDAI. Rasio pinjaman terhadap taksiran
            (LTV) mengikuti batas aplikasi (default hingga 60%).
          </Ayat>
          <Ayat>
            Pokok gadai dikenakan potongan 1% di muka; nilai bersih dihitung 99% dari pokok dan
            diteruskan sesuai proses pencairan.
          </Ayat>
          <Ayat>
            Sewa modal dihitung per 30 hari dari sisa pokok sesuai persentase yang tercantum pada
            akad.
          </Ayat>
          <Ayat>
            Barang disimpan sesuai kode lokasi penyimpanan. Pengembalian barang dilakukan setelah
            kewajiban dilunasi dan dikonfirmasi langsung dengan petugas PINDAI.
          </Ayat>
          <Ayat>
            Penyelesaian atau lelang jaminan dilaksanakan sesuai ketentuan yang berlaku; angka pada
            aplikasi menjadi acuan perhitungan.
          </Ayat>
        </ul>
      </>
    ),
  },
  {
    id: "kredit",
    judul: "Kredit Barang",
    ikon: <Landmark className="size-4" />,
    isi: (
      <ul className="list-disc space-y-1.5 pl-5">
        <Ayat>
          Kredit barang memakai skema bulanan dengan uang muka (DP) dan tenor yang dipilih (mis. 1,
          3, atau 6 bulan).
        </Ayat>
        <Ayat>
          Biaya layanan dipotong di muka; bunga/margin dihitung flat dari pokok acuan untuk setiap
          bulan sesuai persentase yang tercantum pada pengajuan.
        </Ayat>
        <Ayat>
          Rincian cicilan per bulan bersifat ilustrasi; setiap perubahan status dicatat pada ledger
          internal.
        </Ayat>
      </ul>
    ),
  },
  {
    id: "penyedia-dana",
    judul: "Penyedia Dana (Imbal Hasil)",
    ikon: <Wallet className="size-4" />,
    isi: (
      <>
        <ul className="list-disc space-y-1.5 pl-5">
          <Ayat>
            Model pendanaan pada PINDAI adalah <strong>1 pinjaman = 1 penyedia dana</strong> (tanpa
            alokasi bertingkat).
          </Ayat>
          <Ayat>
            Imbal hasil penyedia dana berasal dari bunga pinjaman. Admin mengambil potongan sebesar
            persentase yang berlaku (default <strong>5%</strong>) dari <strong>Imbal Hasil</strong>
            (bunga pinjaman), bukan dari pokok: dari bunga itulah sisanya menjadi hak penyedia dana,
            sementara pokok selalu kembali utuh.
          </Ayat>
          <Ayat>
            Ruang penyedia dana bersifat <strong>baca saja</strong>; angka yang tampil diturunkan
            dari catatan pinjaman yang sama dan bukan nilai cache.
          </Ayat>
        </ul>
        <Catatan tone="penting" judul="Penyelesaian dana">
          Pencairan dana kepada penyedia, setoran, dan penarikan tetap mengikuti proses operasional
          yang ada dan verifikasi admin.
        </Catatan>
      </>
    ),
  },
  {
    id: "larangan",
    judul: "Larangan Penggunaan",
    ikon: <Lock className="size-4" />,
    isi: (
      <ul className="list-disc space-y-1.5 pl-5">
        <Ayat>
          Dilarang memberikan data palsu, memakai identitas orang lain, atau memalsukan dokumen.
        </Ayat>
        <Ayat>
          Dilarang menyalahgunakan akses, memanipulasi lokasi/perangkat, atau menyerang, memindai,
          atau mengganggu sistem.
        </Ayat>
        <Ayat>
          Pelanggaran dapat berakibat penolakan pengajuan, pemblokiran akun, dan/atau tindakan
          sesuai ketentuan yang berlaku.
        </Ayat>
      </ul>
    ),
  },
  {
    id: "tanggung-jawab",
    judul: "Batasan Tanggung Jawab",
    ikon: <Scale className="size-4" />,
    isi: (
      <ul className="list-disc space-y-1.5 pl-5">
        <Ayat>
          PINDAI menyediakan alat pencatatan dan penilaian; keputusan apakah suatu pengajuan
          disetujui berada pada tim PINDAI.
        </Ayat>
        <Ayat>
          Aplikasi disediakan &ldquo;sebagaimana adanya&rdquo;. Kami berupaya menjaga ketersediaan
          dan ketepatan, namun tidak menjamin layanan bebas gangguan.
        </Ayat>
        <Ayat>
          Verifikasi rekening dan kanal pembayaran resmi tetap menjadi tanggung jawab pengguna
          sebelum melakukan transaksi di luar aplikasi.
        </Ayat>
      </ul>
    ),
  },
  {
    id: "perubahan",
    judul: "Perubahan Syarat",
    ikon: <FileText className="size-4" />,
    isi: (
      <p className="text-sm leading-7 text-slate-600">
        Ketentuan ini dapat diperbarui sewaktu-waktu. Setiap kali syarat akad berubah secara
        material, versinya dinaikkan (saat ini{" "}
        <span className="font-mono text-xs">{CONTRACT_TERMS_VERSION}</span>) dan dicatat pada
        perjanjian terkait. Versi terbaru selalu tersedia pada halaman ini.
      </p>
    ),
  },
  {
    id: "hukum",
    judul: "Hukum yang Berlaku & Kontak",
    ikon: <Gavel className="size-4" />,
    isi: (
      <p className="text-sm leading-7 text-slate-600">
        Ketentuan ini tunduk pada hukum yang berlaku di Indonesia. Untuk pertanyaan mengenai syarat
        dan ketentuan, hubungi pengurus PINDAI melalui kanal resmi yang tercantum pada aplikasi.
      </p>
    ),
  },
];

function Wordmark() {
  return (
    <Link to="/" className="flex items-center gap-2.5">
      <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
        P
      </span>
      <span className="flex flex-col leading-none">
        <span className="text-sm font-black uppercase tracking-[0.16em] text-primary">PINDAI</span>
        <span className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.13em] text-slate-400">
          Pinjam · Gadai Digital
        </span>
      </span>
    </Link>
  );
}

export default function SyaratKetentuan() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Wordmark />
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm" className="gap-1.5">
              <Link to="/">
                <ArrowLeft className="size-4" />
                <span className="hidden sm:inline">Beranda</span>
              </Link>
            </Button>
            <Button asChild size="sm" className="rounded-full">
              <Link to="/auth">Masuk</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 sm:rounded-3xl sm:p-10"
        >
          <div
            className="absolute right-0 top-0 h-full w-1/3 bg-gradient-to-l from-emerald-50/80 to-transparent"
            aria-hidden="true"
          />
          <div className="relative max-w-2xl">
            <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
              <ShieldCheck className="size-4" /> Ketentuan Layanan
            </p>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-navy sm:text-4xl">
              Syarat &amp; Ketentuan
            </h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Ketentuan pemakaian aplikasi PINDAI — pinjaman, gadai, kredit barang, dan ruang
              penyedia dana. Harap dibaca sebelum mengajukan.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 font-medium">
                Versi {CONTRACT_TERMS_VERSION}
              </span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 font-medium">
                Diperbarui {TERAKHIR_DIPERBARUI}
              </span>
            </div>
          </div>
        </motion.section>

        <div className="mt-6 grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
          {/* Daftar isi */}
          <nav
            aria-label="Daftar isi"
            className="animate-masuk h-max rounded-2xl border border-slate-200 bg-white p-4 lg:sticky lg:top-24"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              Daftar isi
            </p>
            <ol className="mt-3 space-y-1.5 text-sm">
              {PASAL.map((pasal, i) => (
                <li key={pasal.id}>
                  <a
                    href={`#${pasal.id}`}
                    className="flex gap-2 rounded-lg px-2 py-1 text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
                  >
                    <span className="tabular-nums text-slate-400">{i + 1}.</span>
                    <span className="min-w-0">{pasal.judul}</span>
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          {/* Isi pasal */}
          <div className="min-w-0 space-y-4">
            {PASAL.map((pasal, i) => (
              <motion.section
                key={pasal.id}
                id={pasal.id}
                initial={{ opacity: 0, y: 6 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.3 }}
                className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6"
              >
                <h2 className="flex items-center gap-2.5 text-base font-semibold text-navy sm:text-lg">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    {pasal.ikon}
                  </span>
                  <span className="min-w-0">
                    <span className="tabular-nums text-slate-400">Pasal {i + 1}.</span>{" "}
                    {pasal.judul}
                  </span>
                </h2>
                <div className="mt-3">{pasal.isi}</div>
              </motion.section>
            ))}
          </div>
        </div>

        <div className="mt-8 flex flex-col items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-4 text-xs text-slate-500 sm:flex-row">
          <span className="flex items-center gap-1.5">
            <Lock className="size-3.5" /> Versi syarat {CONTRACT_TERMS_VERSION} · {TERAKHIR_DIPERBARUI}
          </span>
          <Link to="/" className="link-underline font-medium text-primary hover:text-primary/80">
            Kembali ke beranda
          </Link>
        </div>
      </main>
    </div>
  );
}
