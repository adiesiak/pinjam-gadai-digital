import { useMemo } from "react";
import { Link, useLocation } from "react-router";
import { ArrowLeft, ArrowRight, Calculator, FileText, LockKeyhole, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { VaultLogo } from "@/components/VaultLogo";
import { formatRupiah } from "@/lib/money";
import { quoteLoan } from "@/lib/loan";
import { hitungSimulasiBulanan } from "@/lib/bulanan";
import { GADAI_PRICING } from "@/lib/gadai";
import { KREDIT_BARANG_POKOK_MAKS } from "@/lib/kredit";
import { PLAFON_BATAS } from "@/lib/plafon";

const FAQ = [
  { q: "Apakah PINDAI mengirim uang ke rekening saya?", a: "Tidak. PINDAI mencatat pengajuan, perhitungan, dan status di aplikasi. Perpindahan dana ditangani di luar aplikasi; belum ada penyedia pembayaran yang terhubung." },
  { q: "Dari mana angka pada kalkulator berasal?", a: "Kalkulator memakai nominal dan tenor yang dipilih serta aturan biaya yang digunakan aplikasi. Hasilnya adalah ilustrasi pencatatan, bukan persetujuan atau janji pencairan." },
  { q: "Kapan biaya pinjaman dipotong?", a: "Biaya awal 2% dihitung dari pokok dan ditampilkan sebagai potongan di muka. Pada tenor 3 dan 6 bulan, ada pula biaya admin cicilan 2% dari cicilan setiap bulan." },
  { q: "Apa yang dicatat untuk gadai?", a: "Aplikasi mencatat deskripsi barang, nilai taksiran, pokok, sewa modal, dan status. Pemeriksaan fisik, penitipan, dan pelelangan barang ditangani di luar aplikasi." },
  { q: "Bagaimana status pengajuan ditentukan?", a: "Tim PINDAI meninjau pengajuan dan mencatat perubahan status. Status di dashboard adalah catatan aplikasi; persetujuan bukan jaminan pencairan dana." },
  { q: "Siapa yang dapat melihat data pengajuan?", a: "Informasi akun dan pengajuan tidak ditampilkan ke publik. Data dapat diakses akun terkait dan tim PINDAI; akses pendana, bila diberikan, dibatasi. Rincian lengkap ada di Syarat & Ketentuan." },
] as const;

const ROUTES = [
  "/biaya",
  "/cara-kerja",
  "/layanan/pinjaman-tunai",
  "/layanan/gadai",
  "/layanan/kredit-barang",
  "/keamanan",
  "/faq",
] as const;

function Header() {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link to="/" className="inline-flex items-center gap-2.5" aria-label="Kembali ke beranda PINDAI">
          <VaultLogo size={32} /><span className="text-sm font-semibold tracking-[0.16em]">PINDAI</span>
        </Link>
        <nav aria-label="Navigasi informasi" className="hidden flex-wrap items-center gap-4 text-sm text-slate-600 sm:flex">
          <Link to="/layanan/pinjaman-tunai">Layanan</Link><Link to="/biaya">Biaya</Link><Link to="/cara-kerja">Cara kerja</Link><Link to="/keamanan">Keamanan</Link><Link to="/faq">FAQ</Link>
        </nav>
        <Button asChild variant="outline" className="min-h-11"><Link to="/">Beranda</Link></Button>
      </div>
    </header>
  );
}

function KalkulatorRingkas() {
  const simulasiHarian = useMemo(() => quoteLoan(500_000), []);
  const simulasiBulanan = useMemo(() => hitungSimulasiBulanan(1_000_000, 3), []);
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <article className="rounded-2xl border border-slate-200 bg-white p-5">
        <h3 className="font-semibold">Ilustrasi harian · pokok Rp500.000 · 30 hari</h3>
        <dl className="mt-4 divide-y divide-slate-100 text-sm">
          <Baris label="Potongan di muka 2%" nilai={formatRupiah(simulasiHarian.totalPotonganDiMuka)} />
          <Baris label="Nilai bersih pada perhitungan" nilai={formatRupiah(simulasiHarian.danaBersihDitransfer)} />
          <Baris label="Bunga flat 30%" nilai={formatRupiah(simulasiHarian.bunga)} />
          <Baris label="Total kewajiban ilustratif" nilai={formatRupiah(simulasiHarian.totalKewajibanPelunasan)} />
        </dl>
      </article>
      <article className="rounded-2xl border border-slate-200 bg-white p-5">
        <h3 className="font-semibold">Ilustrasi bulanan · pokok Rp1.000.000 · 3 bulan</h3>
        <dl className="mt-4 divide-y divide-slate-100 text-sm">
          <Baris label="DP" nilai="0%" />
          <Baris label="Potongan admin awal 2%" nilai={formatRupiah(simulasiBulanan.potonganDiMuka)} />
          <Baris label="Angsuran pertama termasuk admin cicilan" nilai={formatRupiah(simulasiBulanan.cicilanPerBulan)} />
          <Baris label="Jumlah ilustratif seluruh cicilan" nilai={formatRupiah(simulasiBulanan.totalPengembalian)} />
        </dl>
      </article>
    </div>
  );
}

function Baris({ label, nilai }: { label: string; nilai: string }) {
  return <div className="flex flex-wrap items-baseline justify-between gap-2 py-2.5"><dt className="text-slate-600">{label}</dt><dd className="font-semibold tabular-nums text-slate-900">{nilai}</dd></div>;
}

function Footer() {
  return <footer className="border-t border-slate-200 bg-white"><div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-7 text-xs text-slate-600 sm:flex-row sm:items-center sm:justify-between sm:px-6"><span>PINDAI · Perhitungan dan status adalah catatan aplikasi.</span><nav aria-label="Tautan tambahan" className="flex flex-wrap gap-x-4 gap-y-2"><Link to="/">Beranda</Link><Link to="/faq">FAQ</Link><Link to="/syarat-ketentuan">Syarat &amp; Ketentuan</Link></nav></div></footer>;
}

export default function PublicInfoPage() {
  const { pathname } = useLocation();
  const biaya = pathname === "/biaya";
  const cara = pathname === "/cara-kerja";
  const gadai = pathname === "/layanan/gadai";
  const kredit = pathname === "/layanan/kredit-barang";
  const pinjaman = pathname === "/layanan/pinjaman-tunai";
  const keamanan = pathname === "/keamanan";
  const faq = pathname === "/faq";
  const title = biaya ? "Rincian biaya & kalkulator" : cara ? "Cara kerja" : gadai ? "Gadai" : kredit ? "Kredit barang" : pinjaman ? "Pinjaman tunai" : keamanan ? "Keamanan dan batas aplikasi" : "Pertanyaan umum";
  const Icon = biaya ? Calculator : cara ? FileText : keamanan ? LockKeyhole : ShieldCheck;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <a className="skip-link" href="#konten">Lewati ke konten utama</a>
      <Header />
      <main id="konten" tabIndex={-1} className="mx-auto min-h-[70vh] w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
        <Link to="/" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-950"><ArrowLeft className="size-4" aria-hidden="true" /> Kembali ke beranda</Link>
        <div className="mt-7 max-w-3xl"><span className="flex size-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-900"><Icon className="size-5" aria-hidden="true" /></span><p className="mt-5 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-900">Informasi PINDAI</p><h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1><p className="mt-4 text-base leading-7 text-slate-600">{biaya ? "Tinjau biaya berdasarkan jenis layanan dan lihat contoh perhitungan. Nominal dan status pada halaman ini merupakan ilustrasi catatan aplikasi." : cara ? "Alur berikut menjelaskan tahapan yang tersedia di aplikasi. Peninjauan pengajuan dan proses di luar aplikasi tetap diperlukan." : gadai ? "Aplikasi mencatat informasi barang dan perhitungan gadai. Penilaian fisik, penitipan, dan perpindahan dana berlangsung di luar aplikasi." : kredit ? "Aplikasi mencatat pilihan pembiayaan barang dan ilustrasi cicilan. Pembelian barang dan perpindahan dana tidak dijalankan otomatis oleh aplikasi." : pinjaman ? "Bandingkan skema harian dan bulanan sebelum membuat akun. Nilai bersih dan kewajiban di sini adalah hasil hitung, bukan dana yang ditransfer." : keamanan ? "Berikut batas akses dan tanggung jawab aplikasi berdasarkan alur yang tersedia. Tidak ada klaim keamanan atau sertifikasi di luar keterangan yang dapat diperiksa." : "Jawaban ringkas tentang pencatatan, perhitungan, dan batas layanan PINDAI."}</p></div>

        {biaya || pinjaman ? (
          <section aria-labelledby="tarif-title" className="mt-9 space-y-6">
            {biaya && <div id="kalkulator" className="scroll-mt-6"><h2 id="tarif-title" className="mb-4 text-xl font-semibold">Contoh perhitungan</h2><KalkulatorRingkas /></div>}
            <div><h2 className="mb-4 text-xl font-semibold">Skema pinjaman</h2><div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white"><table className="w-full min-w-[36rem] text-left text-sm"><thead className="bg-slate-100 text-slate-700"><tr><th className="px-4 py-3">Ketentuan</th><th className="px-4 py-3">Harian</th><th className="px-4 py-3">Bulanan</th></tr></thead><tbody className="divide-y divide-slate-100"><tr><th scope="row" className="px-4 py-3 font-medium">Tenor</th><td className="px-4 py-3">7, 14, atau 30 hari</td><td className="px-4 py-3">1, 3, atau 6 bulan</td></tr><tr><th scope="row" className="px-4 py-3 font-medium">Potongan awal</th><td className="px-4 py-3">2% dari pokok</td><td className="px-4 py-3">2% dari pokok</td></tr><tr><th scope="row" className="px-4 py-3 font-medium">Bunga flat</th><td className="px-4 py-3">30% dari pokok</td><td className="px-4 py-3">30% / 25% / 20% per bulan untuk tenor 1 / 3 / 6 bulan</td></tr><tr><th scope="row" className="px-4 py-3 font-medium">Biaya cicilan</th><td className="px-4 py-3">Tidak ada skema cicilan bulanan</td><td className="px-4 py-3">2% dari cicilan pada tenor 3 dan 6 bulan</td></tr></tbody></table></div><p className="mt-3 text-sm leading-6 text-slate-600">Simulasi bulanan menampilkan cicilan ilustratif. Pencatatan pelunasan dalam sistem dilakukan penuh saat jatuh tempo. Bunga, biaya, dan jadwal yang berlaku harus diperiksa pada rincian pengajuan Anda.</p></div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="font-semibold">Gadai</h2><p className="mt-2 text-sm leading-6 text-slate-600">Potongan awal {GADAI_PRICING.upfrontDeductionPercent}%; sewa modal {GADAI_PRICING.sewaModalMinPercent}–{GADAI_PRICING.sewaModalMaxPercent}% per {GADAI_PRICING.periodeHari} hari dihitung dari sisa pokok. Batas hitung internal maksimal {GADAI_PRICING.ltvMaxPercent}% dari harga pasar yang dicantumkan. Taksiran aplikasi bukan pemeriksaan fisik.</p></div>
            {biaya && <p className="text-sm leading-6 text-slate-600">Kredit barang: pokok pembiayaan sampai {formatRupiah(KREDIT_BARANG_POKOK_MAKS)}. Tenor 1/3/6 bulan, DP 0%, potongan awal 2%, bunga flat 30%/25%/20% per bulan; tenor 3/6 memiliki biaya admin cicilan 2% dari cicilan.</p>}
            <div className="flex flex-wrap gap-3"><Button asChild className="min-h-11 bg-primary text-white hover:bg-primary/90"><Link to="/auth">Buat akun</Link></Button><Button asChild variant="outline" className="min-h-11"><Link to="/syarat-ketentuan">Baca syarat lengkap</Link></Button></div>
          </section>
        ) : null}

        {gadai || kredit ? <section className="mt-9 rounded-2xl border border-slate-200 bg-white p-5 sm:p-7"><h2 className="text-xl font-semibold">Yang dicatat aplikasi</h2>{gadai ? <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-600"><li>Deskripsi barang, nilai taksiran, dan pokok gadai.</li><li>Sewa modal 5–10% per 30 hari dari sisa pokok; batas hitung maksimal 70% dari harga pasar yang dicantumkan.</li><li>Status dan riwayat di ledger internal. Penitipan dan pemeriksaan barang tidak dilakukan aplikasi.</li></ul> : <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-600"><li>Tenor baru 1, 3, atau 6 bulan dengan DP 0%.</li><li>Biaya awal 2% dan bunga flat dari pokok penuh: 30%, 25%, atau 20% per bulan sesuai tenor.</li><li>Biaya admin cicilan 2% dari cicilan berlaku pada tenor 3 dan 6 bulan.</li><li>Pokok pembiayaan maksimal {formatRupiah(KREDIT_BARANG_POKOK_MAKS)}; pembelian barang ditangani di luar aplikasi.</li></ul>}<p className="mt-5 text-sm leading-6 text-slate-600">Semua nilai adalah perhitungan internal dan tidak dengan sendirinya membuktikan penyimpanan barang, pembayaran, atau pencairan.</p><Button asChild className="mt-6 min-h-11 bg-primary text-white hover:bg-primary/90"><Link to="/auth">Buat akun untuk melanjutkan</Link></Button></section> : null}

        {cara ? <section className="mt-9"><ol className="divide-y divide-slate-200 border-y border-slate-200">{[
          ["Pilih jenis pengajuan", "Tentukan pinjaman tunai, gadai, atau kredit barang."],
          ["Baca biaya dan ketentuan", "Gunakan kalkulator dan periksa rincian yang ditampilkan aplikasi."],
          ["Buat akun dan isi data", "Lengkapi informasi yang diminta; proses identitas dapat mencakup dokumen dan verifikasi OTP WhatsApp."],
          ["Kirim untuk ditinjau", "Tim PINDAI memeriksa pengajuan. Status verifikasi identitas tidak sama dengan persetujuan pinjaman."],
          ["Pantau catatan", "Dashboard menampilkan status dan riwayat. Persetujuan bukan jaminan pencairan."],
        ].map(([step, desc], i) => <li key={step} className="flex gap-4 py-5"><span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-emerald-200 bg-white text-sm font-semibold text-emerald-900">{i + 1}</span><div><h2 className="font-semibold">{step}</h2><p className="mt-1 text-sm leading-6 text-slate-600">{desc}</p></div></li>)}</ol><p className="mt-5 rounded-xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-700">Pencairan, pelunasan, pembayaran, pemeriksaan fisik, dan penitipan barang berlangsung di luar aplikasi.</p><Button asChild className="mt-5 min-h-11 bg-primary text-white hover:bg-primary/90"><Link to="/auth">Mulai dengan akun</Link></Button></section> : null}

        {keamanan ? <section className="mt-9 grid gap-4 md:grid-cols-2"><article className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="flex items-center gap-2 font-semibold"><ShieldCheck className="size-4 text-emerald-900" aria-hidden="true" />Akses dan akun</h2><p className="mt-3 text-sm leading-6 text-slate-600">Halaman dashboard memerlukan akun. Riwayat tidak dipublikasikan; data digunakan oleh akun terkait dan tim PINDAI. Akses pendana, bila diberikan, dibatasi dan tidak mencakup dokumen identitas menurut keterangan produk.</p></article><article className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="flex items-center gap-2 font-semibold"><LockKeyhole className="size-4 text-emerald-900" aria-hidden="true" />Batas pencatatan</h2><p className="mt-3 text-sm leading-6 text-slate-600">Aplikasi mencatat pengajuan, hasil hitung, perubahan status, dan riwayat. Aplikasi tidak memindahkan uang atau memeriksa/menyimpan barang. Catatan status bukan bukti transaksi.</p></article><article className="rounded-2xl border border-slate-200 bg-white p-5 md:col-span-2"><h2 className="font-semibold">Kelola informasi akun</h2><p className="mt-2 text-sm leading-6 text-slate-600">Jaga kode akses akun dan jangan bagikan kode OTP. Rincian pemrosesan data dan ketentuan penggunaan tersedia di dokumen syarat.</p><Link className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-emerald-900 underline underline-offset-4" to="/syarat-ketentuan">Baca syarat dan ketentuan <ArrowRight className="size-4" /></Link></article></section> : null}

        {faq ? <section className="mt-9"><Accordion type="single" collapsible className="overflow-hidden rounded-2xl border border-slate-200 bg-white px-4 sm:px-6">{FAQ.map((item) => <AccordionItem key={item.q} value={item.q}><AccordionTrigger className="min-h-12 text-left font-semibold">{item.q}</AccordionTrigger><AccordionContent className="text-sm leading-6 text-slate-600">{item.a}</AccordionContent></AccordionItem>)}</Accordion><p className="mt-6 text-sm text-slate-600">Perlu membaca ketentuan lengkap? <Link className="font-semibold text-emerald-900 underline underline-offset-4" to="/syarat-ketentuan">Buka Syarat &amp; Ketentuan</Link>.</p></section> : null}
      </main>
      <Footer />
    </div>
  );
}

export { ROUTES as PUBLIC_INFO_ROUTES };
