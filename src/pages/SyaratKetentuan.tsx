import { useQuery } from "convex/react";
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
import { createContext, useContext, type ReactNode } from "react";
import { Link } from "react-router";

import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import { CONTRACT_TERMS_VERSION } from "@/lib/contract";
import { HAK_CIPTA_PINDAI, NAMA_ENTITAS_PINDAI, PENAFIAN_PINDAI } from "@/lib/branding";
import { formatRupiah } from "@/lib/money";
import {
  LOAN_LIMITS,
  LATE_FEE_POLICY,
  persenBungaHarian,
  PINDAI_PRICING,
  TARIF_BIAYA_DEFAULT,
  tarifBiayaAman,
  TENOR_OPTIONS,
  type TarifBiaya,
} from "@/lib/loan";
import {
  adaBiayaEkspres,
  persenTeks,
  rentangEkspres,
} from "@/lib/tarifBiayaTeks";
import {
  BULANAN_LIMITS,
  BULANAN_PRICING,
  TENOR_BULANAN_OPTIONS,
  persenBungaPerBulan,
} from "@/lib/bulanan";
import { GADAI_PRICING } from "@/lib/gadai";
import { KREDIT_BARANG_POKOK_MAKS } from "@/lib/kredit";
import { MAX_FILE_BYTES, GAMBAR_DITERIMA } from "@/lib/kyc";
import { LOKASI_KEBIJAKAN } from "@/lib/lokasi";
import { DEFAULT_CONFIG } from "@/lib/system-config";
import {
  bagiHasilPinjaman,
  POTONGAN_ADMIN_DEFAULT_PERSEN,
} from "@/lib/bagiHasil";

/**
 * Halaman Syarat & Ketentuan (publik).
 *
 * Ringkasan ketentuan pemakaian aplikasi PINDAI: lingkup layanan (pencatatan
 * ledger internal, bukan pemindahan dana), akun & keamanan, data pribadi,
 * skema biaya pinjaman, pelunasan & denda, gadai, kredit barang, hak penyedia
 * dana, serta batasan tanggung jawab. Angka diturunkan dari ketentuan produk
 * yang berlaku di kode, bukan dikarang bebas.
 */

const TERAKHIR_DIPERBARUI = "19 Oktober 2026";
/** Tarif harian Rp1 juta/28 hari dari matriks produk. */
const BUNGA_CONTOH_HARIAN = persenBungaHarian(1_000_000, 28) ?? PINDAI_PRICING.bungaPercent;
const CONTOH_BAGI_HASIL = bagiHasilPinjaman(
  1_000_000,
  BUNGA_CONTOH_HARIAN,
  POTONGAN_ADMIN_DEFAULT_PERSEN,
);

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
    <div
      className={`mt-4 rounded-xl border px-4 py-3 text-xs leading-6 ${gaya}`}
    >
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

type TarifDenda = {
  perHari: number;
  maks: number;
  /** Potongan di muka dari Pengaturan Parameter Bisnis (admin, asuransi, ekspres). */
  tarif: TarifBiaya;
};

/** Nilai bawaan dipakai saat halaman dirender tanpa Convex (mis. test statis). */
const TarifDendaContext = createContext<TarifDenda>({
  perHari: LATE_FEE_POLICY.percentPerDay,
  maks: LATE_FEE_POLICY.maxPercent,
  tarif: TARIF_BIAYA_DEFAULT,
});

/**
 * Ayat denda mengikuti tarif yang benar-benar dipakai mesin pinjaman. Sebelum
 * ini angkanya ditulis tetap di sini, sehingga mengubah pengaturan admin tidak
 * pernah mengubah halaman syarat. Selama query belum termuat, yang tampil
 * adalah kebijakan bawaan, bukan angka kosong.
 */
function AyatDendaKeterlambatan() {
  const { perHari, maks } = useContext(TarifDendaContext);
  return (
    <Ayat>
      Denda keterlambatan sebesar <strong>{perHari}% per hari dari pokok</strong>
      , dibatasi maksimum <strong>{maks}% dari pokok</strong>. Tidak ada masa
      tenggang: melewati satu hari penuh jatuh tempo terhitung satu hari denda.
    </Ayat>
  );
}

/**
 * Ayat potongan di muka mengikuti tarif admin, bukan angka yang ditulis di
 * halaman ini. Asuransi dan ekspres hanya disebut bila benar-benar dipungut,
 * supaya syarat tidak menjanjikan biaya yang tidak ada di formulir.
 */
function AyatBiayaPotongan() {
  const { tarif } = useContext(TarifDendaContext);
  return (
    <Ayat>
      <strong>Biaya admin {persenTeks(tarif.adminPersen)}</strong> dari pokok
      {tarif.asuransiPersen > 0 ? (
        <> ditambah asuransi {persenTeks(tarif.asuransiPersen)}</>
      ) : null}
      {adaBiayaEkspres(tarif) ? (
        <>
          {" "}
          dan biaya pencairan ekspres {rentangEkspres(tarif)} sekali per pinjaman
          harian baru bila Anda mencentang cair ekspres saat mengajukan
        </>
      ) : null}
      . Biaya platform {persenTeks(PINDAI_PRICING.platformFeePercent)}, sehingga
      total potongan di muka bergantung pada nominal dan dana bersih adalah
      pokok setelah seluruh potongan tersebut.
    </Ayat>
  );
}

const PASAL: Pasal[] = [
  {
    id: "penerimaan",
    judul: "Penerimaan Syarat",
    ikon: <BadgeCheck className="size-4" />,
    isi: (
      <>
        <p className="text-sm leading-7 text-slate-600">
          Dengan mengakses atau memakai aplikasi PINDAI, termasuk membuat akun
          atau mengajukan pinjaman, gadai, maupun kredit barang, Anda dianggap
          telah membaca, memahami, dan menyetujui ketentuan pada halaman ini.
          Bila tidak setuju, mohon berhenti menggunakan layanan.
        </p>
        <Catatan judul="Ringkas">
          Syarat ini adalah ringkasan umum. Untuk setiap pengajuan yang
          disetujui, berlaku pula perjanjian (akad) khusus yang ditandatangani
          pada halaman kontrak aplikasi.
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
          PINDAI adalah <strong>aplikasi pencatatan</strong> pengajuan pinjaman,
          gadai, dan pembukuan (ledger) internal. Aplikasi membantu menyusun
          angka, jadwal, dan status kewajiban secara transparan.
        </p>
        <ul className="mt-3 list-disc space-y-1.5 pl-5">
          <Ayat>
            PINDAI <strong>tidak</strong> memindahkan uang secara otomatis dan
            tidak menjadi penyelenggara transfer dana.
          </Ayat>
          <Ayat>
            Pencairan dana, pembayaran ke merchant, inspeksi, penyerahan, dan
            penitipan barang jaminan ditangani di luar aplikasi.
          </Ayat>
          <Ayat>
            Setiap perubahan status (mis. &ldquo;lunas&rdquo;) adalah pencatatan
            pada ledger internal aplikasi, bukan bukti mutasi rekening bank.
          </Ayat>
        </ul>
        <Catatan tone="penting" judul="Bukan bukti mutasi bank">
          Angka pada aplikasi adalah catatan internal. Selalu verifikasi
          pengiriman/penerimaan dana melalui kanal resmi dan rekening yang benar
          sebelum bertransaksi.
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
          Anda wajib memberikan data yang benar, terbaru, dan milik Anda
          sendiri.
        </Ayat>
        <Ayat>
          Akun peminjam masuk dengan verifikasi email (kode OTP). Jangan bagikan
          kode masuk kepada siapa pun; aktivitas yang memakai akun Anda dianggap
          sebagai tindakan Anda.
        </Ayat>
        <Ayat>
          Tim admin memakai verifikasi dua faktor (TOTP). Akses panel
          operasional terbatas untuk akun tim yang berwenang.
        </Ayat>
        <Ayat>
          Akses &ldquo;lihat saja&rdquo; untuk ruang pendana diberikan dan dapat
          dicabut oleh admin, baik per akun email maupun lewat kode akses
          bersama. Setiap perubahan akses tercatat pada audit trail.
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
            Untuk menilai pengajuan, Anda dapat diminta mengunggah data
            identitas (mis. KTP), foto/slip terkait, serta informasi
            bank/e-wallet dan rekening.
          </Ayat>
          <Ayat>
            Alur Peminjam memerlukan izin{" "}
            <strong>lokasi perangkat (GPS)</strong>. Saat aplikasi digunakan,
            titik lokasi dikirim berkala, sekitar setiap{" "}
            {LOKASI_KEBIJAKAN.intervalDetik}
            detik. Aksi transaksi tertentu memerlukan titik terbaru, dengan
            batas umur bawaan {DEFAULT_CONFIG.lokasiMaxUmurMenit} menit. Browser
            tidak mengirim titik lokasi saat halaman atau aplikasi ditutup.
          </Ayat>
          <Ayat>
            Dokumen gambar untuk proses identitas menerima{" "}
            {GAMBAR_DITERIMA.join(", ")} dengan batas ukuran{" "}
            {Math.round(MAX_FILE_BYTES / (1024 * 1024))} MB per berkas. Akses
            data dibatasi menurut akun dan peran. Jika akses ruang pendana
            diberikan, ruang tersebut menampilkan ringkasan pinjaman, bukan
            dokumen identitas.
          </Ayat>
          <Ayat>
            Anda bertanggung jawab memastikan data yang Anda berikan benar dan
            boleh dibagikan.
          </Ayat>
        </ul>
        <Catatan judul="Pseudonim peminjam">
          Di beberapa tampilan, peminjam ditandai dengan kode pseudonim acak
          (mis. <span className="font-mono">PMN-…</span>) sebagai penanda stabil
          antar-ruang, bukan identitas asli.
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
            Pokok pinjaman tunai mengikuti batas aplikasi, saat ini{" "}
            {formatRupiah(LOAN_LIMITS.minPokok)}
            sampai {formatRupiah(LOAN_LIMITS.maxPokok)}. Bila tim PINDAI menetapkan
            plafon khusus untuk akun Anda, pokok hariannya dapat lebih tinggi,
            sampai {formatRupiah(LOAN_LIMITS.maxPokokPlafon)}, dengan pilihan tenor{" "}
            {TENOR_OPTIONS.join(", ")} hari. Pinjaman bulanan menggunakan pokok{" "}
            {formatRupiah(BULANAN_LIMITS.minPokok)} sampai{" "}
            {formatRupiah(BULANAN_LIMITS.maxPokok)}, dengan pilihan tenor{" "}
            {TENOR_BULANAN_OPTIONS.join(", ")} bulan.
          </Ayat>
          <AyatBiayaPotongan />
          <Ayat>
            <strong>Bunga pinjaman harian mengikuti matriks nominal–tenor.</strong>{" "}
            Pokok {formatRupiah(LOAN_LIMITS.minPokok)} sampai{" "}
            {formatRupiah(499_999)}: tenor 7 hari (bunga{" "}
            {persenBungaHarian(100_000, 7)}%, bawaan), 14 hari ({" "}
            {persenBungaHarian(100_000, 14)}%), atau 28 hari ({" "}
            {persenBungaHarian(100_000, 28)}%). Pokok            {formatRupiah(500_000)}{" "}
            sampai {formatRupiah(999_999)}: tenor 14 hari ({" "}
            {persenBungaHarian(500_000, 14)}%) atau 28 hari ({" "}
            {persenBungaHarian(500_000, 28)}%). Pokok{" "}
            {formatRupiah(1_000_000)} ke atas: tenor 7 hari ({" "}
            {persenBungaHarian(2_000_000, 7)}%), 14 hari ({" "}
            {persenBungaHarian(2_000_000, 14)}%), atau 28 hari ({" "}
            {persenBungaHarian(2_000_000, 28)}%). Bunga dihitung flat dari pokok;
            total kewajiban pelunasan = pokok + bunga.
          </Ayat>
          <Ayat>
            Untuk pinjaman bulanan, bunga flat dari pokok penuh mengikuti tarif
            akun (bawaan {PINDAI_PRICING.bungaPercent}% per bulan) untuk semua
            tenor. Potongan awal {BULANAN_PRICING.biayaLayananPersen}% berlaku
            pada skema bulanan; setiap pembayaran bulanan juga memiliki biaya
            admin cicilan {BULANAN_PRICING.biayaAdminCicilanPersen}% dari
            nominal cicilan. Periksa angka khusus pada pengajuan dan perjanjian
            Anda.
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
            Kewajiban dilunasi dalam tenor yang dipilih sejak tanggal pendanaan
            dicatat di aplikasi.
          </Ayat>
          <AyatDendaKeterlambatan />
          <Ayat>
            Pelunasan ditangani di luar aplikasi; statusnya dicatat tim PINDAI
            pada ledger internal.
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
            Batas hitung internal gadai maksimal {GADAI_PRICING.ltvMaxPercent}%
            dari harga pasar yang dicantumkan. Nilai taksiran aplikasi bukan
            pemeriksaan fisik barang.
          </Ayat>
          <Ayat>
            Pokok gadai dikenakan potongan{" "}
            {GADAI_PRICING.upfrontDeductionPercent}% di muka; nilai bersih pada
            hitungan adalah {GADAI_PRICING.netDisbursementPercent}% dari pokok.
          </Ayat>
          <Ayat>
            Sewa modal {GADAI_PRICING.sewaModalMinPercent} sampai{" "}
            {GADAI_PRICING.sewaModalMaxPercent}% per
            {GADAI_PRICING.periodeHari} hari dihitung dari sisa pokok.
          </Ayat>
          <Ayat>
            Pemeriksaan, penitipan, dan pengembalian barang ditangani di luar
            aplikasi. Status ledger tidak membuktikan barang disimpan atau
            dikembalikan.
          </Ayat>
          <Ayat>
            Penyelesaian atau lelang jaminan dilaksanakan sesuai ketentuan yang
            berlaku; angka pada aplikasi menjadi acuan perhitungan.
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
          Pengajuan baru kredit barang memakai skema bulanan dengan DP{" "}
          {BULANAN_PRICING.dpPersen}% dan pilihan tenor{" "}
          {TENOR_BULANAN_OPTIONS.join(", ")} bulan. Batas pokok pembiayaan
          adalah{" "}
          {new Intl.NumberFormat("id-ID", {
            style: "currency",
            currency: "IDR",
            maximumFractionDigits: 0,
          }).format(KREDIT_BARANG_POKOK_MAKS)}
          .
        </Ayat>
        <Ayat>
          Biaya awal {BULANAN_PRICING.biayaLayananPersen}% dipotong di muka.
          Bunga flat per bulan dari pokok penuh adalah {persenBungaPerBulan(1)}
          %, {persenBungaPerBulan(3)}%, atau {persenBungaPerBulan(6)}% sesuai
          tenor. Biaya admin cicilan{" "}
          {BULANAN_PRICING.biayaAdminCicilanPersen}% dari nominal cicilan
          dibayar pada setiap pembayaran bulanan.
        </Ayat>
        <Ayat>
          Jadwal cicilan per bulan adalah ilustrasi, bukan catatan pembayaran
          tiap angsuran. Tim PINDAI memperbarui status pelunasan penuh pada
          ledger setelah kewajiban dinyatakan selesai.
        </Ayat>
      </ul>
    ),
  },
  {
    id: "penyedia-dana",
    judul: "Pendana (Imbal Hasil)",
    ikon: <Wallet className="size-4" />,
    isi: (
      <>
        <ul className="list-disc space-y-1.5 pl-5">
          <Ayat>
            Model pendanaan saat ini adalah{" "}
            <strong>1 pinjaman untuk 1 pendana</strong>.
          </Ayat>
          <Ayat>
            Imbal hasil pendana berasal dari bunga pinjaman. Persentase potongan
            admin mengikuti Pengaturan Sistem; nilai bawaan saat ini{" "}
            {POTONGAN_ADMIN_DEFAULT_PERSEN}%. Untuk pinjaman harian, dasar
            potongan adalah pokok dan bunga yang kembali. Pada pinjaman bulanan,
            biaya admin cicilan, bila berlaku, tidak masuk ke dasar potongan.
            Contoh harian: pokok {formatRupiah(1_000_000)} tenor 28 hari dengan
            bunga {BUNGA_CONTOH_HARIAN}% menghasilkan kewajiban{" "}
            {formatRupiah(CONTOH_BAGI_HASIL.totalLunas)}. Dengan potongan
            bawaan, pendana menerima{" "}
            {formatRupiah(CONTOH_BAGI_HASIL.pendanaTerima)} dan potongan admin
            sebesar {formatRupiah(CONTOH_BAGI_HASIL.potonganAdmin)}. Sisa rupiah
            pembulatan menjadi hak pendana.
          </Ayat>
          <Ayat>
            Ruang pendana bersifat <strong>baca saja</strong>; angka yang tampil
            diturunkan dari catatan pinjaman yang sama dan bukan nilai cache.
          </Ayat>
        </ul>
        <Catatan tone="penting" judul="Penyelesaian dana">
          Pencairan dana kepada penyedia, setoran, dan penarikan tetap mengikuti
          proses operasional yang ada dan verifikasi admin.
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
          Dilarang memberikan data palsu, memakai identitas orang lain, atau
          memalsukan dokumen.
        </Ayat>
        <Ayat>
          Dilarang menyalahgunakan akses, memanipulasi lokasi/perangkat, atau
          menyerang, memindai, atau mengganggu sistem.
        </Ayat>
        <Ayat>
          Pelanggaran dapat berakibat penolakan pengajuan, pemblokiran akun,
          dan/atau tindakan sesuai ketentuan yang berlaku.
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
          PINDAI menyediakan alat pencatatan dan penilaian; keputusan apakah
          suatu pengajuan disetujui berada pada tim PINDAI.
        </Ayat>
        <Ayat>
          Aplikasi disediakan &ldquo;sebagaimana adanya&rdquo;. Kami berupaya
          menjaga ketersediaan dan ketepatan, namun tidak menjamin layanan bebas
          gangguan.
        </Ayat>
        <Ayat>
          Verifikasi rekening dan kanal pembayaran resmi tetap menjadi tanggung
          jawab pengguna sebelum melakukan transaksi di luar aplikasi.
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
        Ketentuan ini dapat diperbarui sewaktu-waktu. Setiap kali syarat akad
        berubah secara material, versinya dinaikkan (saat ini{" "}
        <span className="font-mono text-xs">{CONTRACT_TERMS_VERSION}</span>) dan
        dicatat pada perjanjian terkait. Versi terbaru selalu tersedia pada
        halaman ini.
      </p>
    ),
  },
  {
    id: "hukum",
    judul: "Hukum yang Berlaku & Kontak",
    ikon: <Gavel className="size-4" />,
    isi: (
      <p className="text-sm leading-7 text-slate-600">
        Ketentuan ini tunduk pada hukum yang berlaku di Indonesia. Untuk
        pertanyaan mengenai syarat dan ketentuan, hubungi pengurus PINDAI
        melalui kanal resmi yang tercantum pada aplikasi.
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
        <span className="text-sm font-black uppercase tracking-[0.16em] text-primary">
          PINDAI
        </span>
        <span className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.13em] text-slate-400">
          Pinjam · Gadai Digital
        </span>
      </span>
    </Link>
  );
}

export type KetentuanDendaTampil = {
  persenDendaKeterlambatan?: number;
  maksDendaPersen?: number;
  /** Tarif potongan di muka dari Pengaturan Parameter Bisnis. */
  tarifBiaya?: Partial<TarifBiaya> | null;
};

/** Isi halaman tanpa query; tarif denda masuk lewat context di atas. */
export function SyaratKetentuanView({
  ketentuan,
}: {
  ketentuan?: KetentuanDendaTampil | null;
}) {
  return (
    <TarifDendaContext.Provider
      value={{
        perHari:
          ketentuan?.persenDendaKeterlambatan ?? LATE_FEE_POLICY.percentPerDay,
        maks: ketentuan?.maksDendaPersen ?? LATE_FEE_POLICY.maxPercent,
        tarif: tarifBiayaAman(ketentuan?.tarifBiaya),
      }}
    >
      <IsiSyaratKetentuan />
    </TarifDendaContext.Provider>
  );
}

/** Rute publik: angka denda mengikuti pengaturan admin yang berlaku. */
export default function SyaratKetentuan() {
  const ketentuan = useQuery(api.system.getKetentuanBiaya);
  return <SyaratKetentuanView ketentuan={ketentuan} />;
}

function IsiSyaratKetentuan() {
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

      <main
        id="konten"
        tabIndex={-1}
        className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12"
      >
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
              Ketentuan pemakaian aplikasi PINDAI untuk pinjaman, gadai, kredit
              barang, dan ruang pendana. Harap dibaca sebelum mengajukan.
            </p>
            <p className="mt-2 text-xs leading-5 text-slate-500">
              {PENAFIAN_PINDAI}
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
                    <span className="tabular-nums text-slate-400">
                      {i + 1}.
                    </span>
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
                    <span className="tabular-nums text-slate-400">
                      Pasal {i + 1}.
                    </span>{" "}
                    {pasal.judul}
                  </span>
                </h2>
                <div className="mt-3">{pasal.isi}</div>
              </motion.section>
            ))}
          </div>
        </div>

        <p className="mt-6 text-center text-[11px] text-slate-500">
          {HAK_CIPTA_PINDAI} · {NAMA_ENTITAS_PINDAI}
        </p>
        <div className="mt-3 flex flex-col items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-4 text-xs text-slate-500 sm:flex-row">
          <span className="flex items-center gap-1.5">
            <Lock className="size-3.5" /> Versi syarat {CONTRACT_TERMS_VERSION}{" "}
            · {TERAKHIR_DIPERBARUI}
          </span>
          <Link
            to="/"
            className="link-underline font-medium text-primary hover:text-primary/80"
          >
            Kembali ke beranda
          </Link>
        </div>
      </main>
    </div>
  );
}
