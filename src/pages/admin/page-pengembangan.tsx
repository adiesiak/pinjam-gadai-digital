"use client";

import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

import {
  TENOR_BULANAN_OPTIONS,
  TARIF_BULANAN_DEFAULT,
} from "@/lib/bulanan";
import { BIAYA_EKSPRES_TIER, BIAYA_ROLLOVER } from "@/lib/ekonomiPlatform";
import { GADAI_PRICING } from "@/lib/gadai";
import {
  KREDIT_BARANG_POKOK_MAKS,
  KREDIT_PRICING,
  KREDIT_TENOR_PENGAJUAN_OPTIONS,
} from "@/lib/kredit";
import {
  LATE_FEE_POLICY,
  LOAN_LIMITS,
  PINDAI_PRICING,
  TENOR_OPTIONS,
  persenBungaHarian,
} from "@/lib/loan";
import { formatRupiah } from "@/lib/money";
import { PLAFON_BARU, PLAFON_BATAS, PLAFON_TERUJI } from "@/lib/plafon";
import { BATAS_RESTRUKTURISASI } from "@/lib/restrukturisasi";
import { LABEL_STATUS_PINJAMAN, STATUS_PINJAMAN } from "@/lib/statusPinjaman";
import { DEFAULT_CONFIG } from "@/lib/system-config";

/**
 * Peta sistem PINDAI — dokumentasi internal untuk admin.
 *
 * Halaman ini hanya membaca: tidak ada query, mutation, atau state. Isinya
 * sengaja datar (array di atas) supaya menambah modul atau aturan baru cukup
 * menambah satu baris, bukan menyunting JSX berulang.
 */

/** Satu baris dokumentasi: judul pendek + penjelasan. */
type Baris = { judul: string; isi: string };

/** Rupiah dengan pemisah ribuan, sama dengan yang dicetak aplikasi. */
const rp = formatRupiah;

/** "7, 14, atau 28" — bentuk daftar yang dipakai kalimat halaman ini. */
function daftarAtau(nilai: readonly number[]): string {
  return `${nilai.slice(0, -1).join(", ")}, atau ${nilai[nilai.length - 1]}`;
}

/** "32%, 37%, 40%, dan 42%" untuk satu tier pokok pada tenor resmi. */
function tarifHarian(pokok: number): string {
  const tarif = TENOR_OPTIONS.flatMap((hari) => {
    const persen = persenBungaHarian(pokok, hari);
    return persen === null ? [] : [`${persen}%`];
  });
  return `${tarif.slice(0, -1).join(", ")}, dan ${tarif[tarif.length - 1]}`;
}

/**
 * Biaya pencairan ekspres per tier, dirangkai dari tabel yang sama dengan
 * mesin harga supaya halaman ini tidak menyimpan salinan angkanya.
 */
const BIAYA_EKSPRES_NARASI = BIAYA_EKSPRES_TIER.map((tier, i) => {
  const berikut = BIAYA_EKSPRES_TIER[i + 1];
  return berikut === undefined
    ? `${rp(tier.biaya)} mulai ${rp(tier.batasBawah)}`
    : `${rp(tier.biaya)} untuk pokok di bawah ${rp(berikut.batasBawah)}`;
}).join(", ");

/** Label status kanonik, urut seperti yang ditampilkan aplikasi. */
const DAFTAR_STATUS = STATUS_PINJAMAN.map(
  (status) => LABEL_STATUS_PINJAMAN[status],
).join(", ");

/** Satu kelompok modul admin beserta isinya. */
type Kelompok = { judul: string; modul: readonly string[] };

/** Gerbang satu rute: terbuka tanpa akun, butuh sesi, atau khusus admin. */
type GerbangRute = "publik" | "akun" | "admin";

const RUTE_HALAMAN: readonly {
  rute: string;
  isi: string;
  gerbang: GerbangRute;
}[] = [
  { rute: "/", isi: "Beranda: hero, layanan, dan pintu masuk pengajuan.", gerbang: "publik" },
  { rute: "/biaya", isi: "Rincian bunga, potongan, dan biaya.", gerbang: "publik" },
  {
    rute: "/pinjaman/konvensional",
    isi: "Produk pinjaman tunai: tarif, tenor, dan kalkulator.",
    gerbang: "publik",
  },
  {
    rute: "/pinjaman/syariah",
    isi: "Produk akad syariah: tiga akad beserta simulasinya.",
    gerbang: "publik",
  },
  { rute: "/cara-kerja", isi: "Alur layanan dari pengajuan sampai pelunasan.", gerbang: "publik" },
  { rute: "/layanan/pinjaman-tunai", isi: "Penjelasan pinjaman tunai harian.", gerbang: "publik" },
  { rute: "/layanan/gadai", isi: "Penjelasan gadai barang jaminan.", gerbang: "publik" },
  { rute: "/layanan/kredit-barang", isi: "Penjelasan kredit barang bulanan.", gerbang: "publik" },
  {
    rute: "/ppob",
    isi: "Etalase PPOB publik: pulsa, data, token listrik, game, dan e-wallet.",
    gerbang: "publik",
  },
  {
    rute: "/ppob/pesanan/:kode",
    isi: "Status dan pembayaran satu pesanan PPOB lewat kode pesanan.",
    gerbang: "publik",
  },
  { rute: "/keamanan", isi: "Cara data dan verifikasi identitas dijaga.", gerbang: "publik" },
  { rute: "/faq", isi: "Pertanyaan yang paling sering masuk.", gerbang: "publik" },
  { rute: "/aplikasi", isi: "Unduh APK, versi, dan langkah pemasangan.", gerbang: "publik" },
  {
    rute: "/auth",
    isi: "Masuk dan daftar lewat OTP WhatsApp, NIK, atau akun Google.",
    gerbang: "publik",
  },
  { rute: "/akses-bersama", isi: "Pintu lihat-saja dengan kode akses bersama.", gerbang: "publik" },
  { rute: "/syarat-ketentuan", isi: "Syarat dan ketentuan layanan.", gerbang: "publik" },
  {
    rute: "/privasi",
    isi: "Kebijakan privasi: data yang disimpan, penerima, retensi, dan hak subjek data.",
    gerbang: "publik",
  },
  { rute: "/verifikasi-kontrak/:kode", isi: "Periksa keaslian kontrak lewat hash.", gerbang: "publik" },
  { rute: "/cek-status/:token", isi: "Kwitansi digital dari tautan WhatsApp.", gerbang: "publik" },
  {
    rute: "/jadi-pendana",
    isi: "Proposal pendanaan; dibuka dari ruang pendana setelah sesi lihat-saja.",
    gerbang: "akun",
  },
  { rute: "/dashboard", isi: "Ruang peminjam lima menu, hanya untuk akun yang masuk.", gerbang: "akun" },
  {
    rute: "/penyedia-dana",
    isi: "Portofolio penyedia dana; perlu akun atau kode akses bersama.",
    gerbang: "akun",
  },
  { rute: "/promo", isi: "Poster dan aset Android, khusus admin.", gerbang: "admin" },
];

const TAB_PEMINJAM: readonly Baris[] = [
  { judul: "Ringkasan", isi: "Tagihan terdekat, sisa kewajiban, dan pintasan aksi." },
  { judul: "Cicilan", isi: "Jadwal angsuran, sisa hari, denda berjalan, unggah bukti transfer." },
  { judul: "Ajukan Pinjaman", isi: "Formulir harian atau bulanan, gadai, kredit barang, dan klaim pinjaman lama." },
  { judul: "Catatan Pinjaman", isi: "Riwayat pinjaman beserta status dan kontrak digitalnya." },
  { judul: "Akun", isi: "Data diri, rekening pencairan, dan tahapan verifikasi identitas dalam satu halaman." },
];

const MODUL_ADMIN: readonly Kelompok[] = [
  {
    judul: "Operasional",
    modul: [
      "Ringkasan (meja kerja hari ini)",
      "Pengajuan Konvensional (pinjaman, gadai, kredit)",
      "Pengajuan Syariah",
      "PPOB Publik",
      "Verifikasi KYC",
      "Siap disalurkan",
      "Doorprize & Antrean",
      "Rekonsiliasi Angsuran",
      "Kalender Kas",
      "Plafon Nasabah",
      "Pendana",
    ],
  },
  {
    judul: "Pemantauan",
    modul: ["Peta lokasi", "Jatuh Tempo", "Kalkulator Lelang"],
  },
  {
    judul: "Konten",
    modul: [
      "Template Website",
      "Konten Beranda",
      "Banner Promo",
      "Halaman Pendana",
      "Banner & Pengumuman",
      "Promo Pinjaman",
      "Editor Promo",
      "Voucher Nasabah",
      "WhatsApp",
      "Aplikasi Android",
    ],
  },
  {
    judul: "Sistem",
    modul: [
      "Parameter Bisnis",
      "Kesehatan Sistem",
      "Backup Database",
      "Peta Sistem",
      "Audit Trail",
      "Keamanan Login",
      "Kill Switch",
    ],
  },
];

/**
 * Angka ringkasan dihitung dari daftar di atas, bukan ditulis tangan: menambah
 * satu rute atau modul langsung mengubah angka, sehingga tidak ada lagi
 * hitungan yang tertinggal saat rute baru ditambahkan.
 */
const RINGKASAN = [
  {
    angka: String(RUTE_HALAMAN.filter((r) => r.gerbang === "publik").length),
    label: "rute publik",
  },
  {
    angka: String(RUTE_HALAMAN.filter((r) => r.gerbang === "akun").length),
    label: "rute wajib akun",
  },
  { angka: String(TAB_PEMINJAM.length), label: "tab peminjam" },
  { angka: String(MODUL_ADMIN.reduce((n, k) => n + k.modul.length, 0)), label: "modul admin" },
] as const;

const LOGIKA: readonly { judul: string; isi: string; rujukan: string }[] = [
  {
    judul: "Batas pinjaman tunai",
    isi: `Pokok ${rp(LOAN_LIMITS.minPokok)} sampai ${rp(LOAN_LIMITS.maxPokok)}. Plafon khusus dari admin membuka pokok sampai ${rp(
      LOAN_LIMITS.maxPokokPlafon,
    )}; angka itu sama dengan batas penyimpanan plafon, bukan pagar kedua yang terpisah. Tenor resmi ${daftarAtau(
      TENOR_OPTIONS,
    )} hari, dan kombinasi di luar matriks ditolak server, bukan sekadar disembunyikan di layar.`,
    rujukan: "src/lib/loan.ts, plafon.ts",
  },
  {
    judul: "Bunga harian per tier pokok",
    isi: `Bunga flat dari pokok, per tenor ${TENOR_OPTIONS.join(", ")} hari. Di bawah ${rp(
      PLAFON_BARU,
    )} tarifnya ${tarifHarian(
      LOAN_LIMITS.minPokok,
    )}. ${rp(PLAFON_BARU)} sampai ${rp(
      LOAN_LIMITS.maxPokok - 1,
    )} tarifnya ${tarifHarian(PLAFON_BARU)}. Mulai ${rp(
      LOAN_LIMITS.maxPokok,
    )} tarifnya ${tarifHarian(
      LOAN_LIMITS.maxPokok,
    )}, berlaku sampai plafon khusus tertinggi.`,
    rujukan: "src/lib/loan.ts",
  },
  {
    judul: "Bunga khusus per nasabah",
    isi: `Bawaan ${DEFAULT_CONFIG.persenBunga}% dari Pengaturan Parameter Bisnis. Override admin (0–100%) menang atas default dan disimpan sebagai snapshot di pinjaman, jadi pinjaman lama tidak ikut berubah saat tarif global diubah.`,
    rujukan: "src/lib/bunga.ts",
  },
  {
    judul: "Potongan di muka",
    isi: `Biaya admin ${PINDAI_PRICING.adminFeePercent}% dan platform ${PINDAI_PRICING.platformFeePercent}% dipotong dari pokok. Skema harian dikenai biaya pencairan ekspres sekali per pinjaman baru bila peminjam mencentang cair ekspres: ${BIAYA_EKSPRES_NARASI}. Tanpa centang, potongan di muka hanya biaya admin. Bunga tidak ikut dipotong di muka, melainkan masuk total kewajiban.`,
    rujukan: "src/lib/loan.ts, ekonomiPlatform.ts",
  },
  {
    judul: "Skema bulanan",
    isi: `Tenor ${daftarAtau(
      TENOR_BULANAN_OPTIONS,
    )} bulan. Bunga flat per bulan dari pokok penuh, biaya layanan di muka, dan biaya admin cicilan diatur di Pengaturan Parameter Bisnis (bawaan ${TARIF_BULANAN_DEFAULT.persenBungaBulanan1}%/${TARIF_BULANAN_DEFAULT.persenBungaBulanan3}%/${TARIF_BULANAN_DEFAULT.persenBungaBulanan6}%/${TARIF_BULANAN_DEFAULT.persenBungaBulanan9}%/${TARIF_BULANAN_DEFAULT.persenBungaBulanan12}% untuk tenor 1/3/6/9/12 bulan, biaya layanan ${TARIF_BULANAN_DEFAULT.persenBiayaLayananBulanan}% di muka, admin cicilan ${TARIF_BULANAN_DEFAULT.persenBiayaAdminCicilanBulanan}% dari nominal cicilan). Tarif yang berlaku DIBEKUKAN pada pinjaman saat pengajuan, jadi pinjaman lama tidak ikut berubah. Angsuran pokok dibagi rata dan bulan terakhir menyerap sisa pembulatan.`,
    rujukan: "src/lib/bulanan.ts, lib/system-config.ts",
  },
  {
    judul: "Kredit barang",
    isi: `Pengajuan baru memakai tenor ${daftarAtau(
      KREDIT_TENOR_PENGAJUAN_OPTIONS,
    )} bulan dengan DP wajib ${KREDIT_PRICING.dpMinPersen}–${
      KREDIT_PRICING.dpMaxPersen
    }% dari harga barang. Harga barang ${rp(
      KREDIT_PRICING.minHargaBarang,
    )} sampai ${rp(KREDIT_PRICING.maxHargaBarang)}, dan pokok yang dibiayai dibatasi ${rp(
      KREDIT_BARANG_POKOK_MAKS,
    )}. Di atas itu pengajuan ditolak server.`,
    rujukan: "src/lib/kredit.ts",
  },
  {
    judul: "Gadai",
    isi: `Plafon gadai ${GADAI_PRICING.ltvMaxPercent}% dari harga pasar barang. Potongan di muka ${GADAI_PRICING.upfrontDeductionPercent}%, jadi dana bersih ${GADAI_PRICING.netDisbursementPercent}%. Sewa modal ${GADAI_PRICING.sewaModalMinPercent}–${GADAI_PRICING.sewaModalMaxPercent}% per ${GADAI_PRICING.periodeHari} hari dihitung dari sisa pokok, sehingga cicilan pokok menurunkan sewa periode berikutnya. Sisa pokok nol menandai barang siap diambil; catatan itu tidak membuktikan barang disimpan.`,
    rujukan: "src/lib/gadai.ts",
  },
  {
    judul: "Plafon per nasabah",
    isi: `Nasabah baru dibatasi ${rp(PLAFON_BARU)}. Satu pelunasan tepat waktu membuka ${rp(
      PLAFON_TERUJI,
    )}; tunggakan aktif menahannya kembali. Keterlambatan tidak menaikkan plafon. Override admin menang atas perilaku dan dapat disetel sampai ${rp(
      PLAFON_BATAS.maks,
    )}, dan angka itulah yang membuka pokok harian di atas ${rp(PLAFON_TERUJI)}. Pinjaman berjalan mengurangi plafon tersedia.`,
    rujukan: "src/lib/plafon.ts",
  },
  {
    judul: "Persetujuan sebagian",
    isi: "Admin boleh menyetujui lebih kecil dari nominal pengajuan, tidak pernah lebih besar. Nominal disetujui disimpan terpisah dari pokok diajukan, dan terkunci setelah dana ditandai tersalurkan.",
    rujukan: "src/lib/statusPinjaman.ts",
  },
  {
    judul: "Denda keterlambatan",
    isi: `Bawaan ${DEFAULT_CONFIG.persenDendaKeterlambatan}% per hari dari pokok angsuran yang telat, dibatasi ${LATE_FEE_POLICY.maxPercent}% dari pokok. Pengaturan Parameter Bisnis dapat mengubah tarifnya; nilai nol mematikan denda tanpa mengubah tenor atau bunga.`,
    rujukan: "src/lib/loan.ts, angsuran.ts",
  },
  {
    judul: "Perpanjangan & roll-over",
    isi: `Pinjaman harian dapat diperpanjang tanpa membuat pinjaman baru: pelunasan total, bayar bunga saja, atau cicil pokok. Bayar bunga saja dikenai biaya roll-over ${rp(
      BIAYA_ROLLOVER,
    )}. Bunga periode baru mengikuti tier nominal setelah cicilan pokok; jatuh tempo baru dihitung dari jatuh tempo berjalan atau tanggal transaksi, mana yang lebih akhir.`,
    rujukan: "src/lib/perpanjanganPinjaman.ts",
  },
  {
    judul: "Restrukturisasi",
    isi: `Nasabah mengajukan perpanjangan tenor (tambahan ${BATAS_RESTRUKTURISASI.minTambahan}–${BATAS_RESTRUKTURISASI.maxTambahan} hari, tenor maksimal ${BATAS_RESTRUKTURISASI.maxTenor} hari) atau usulan cicilan, dengan alasan minimal ${BATAS_RESTRUKTURISASI.minAlasan} karakter. Perpanjangan hanya untuk pinjaman harian dan menggeser jatuh tempo tanpa mengubah pokok, bunga, atau kewajiban tercatat. Keputusan admin ber-TOTP dan setiap langkah masuk audit trail.`,
    rujukan: "src/lib/restrukturisasi.ts",
  },
  {
    judul: "Status pinjaman",
    isi: `Status kanonik yang dipakai aplikasi ada ${STATUS_PINJAMAN.length}: ${DAFTAR_STATUS}. Lunas dan dibatalkan terkunci. Ejaan lama diajukan, sedang_direview, dan disetujui dibaca sebagai Ditinjau.`,
    rujukan: "src/lib/statusPinjaman.ts",
  },
  {
    judul: "Masuk dengan NIK KTP",
    isi: "NIK hanya memilih akun, bukan kata sandi. Setelah 16 angka valid, kode 6 angka dikirim ke WhatsApp yang terdaftar pada profil pemilik NIK, lalu sesi dibuka. NIK tanpa kode tidak membuka apa pun, dan akun tanpa NIK tetap bisa masuk lewat email atau nomor WhatsApp.",
    rujukan: "src/convex/klaimPeminjam.ts, src/lib/nikLogin.ts",
  },
  {
    judul: "Gerbang pengajuan",
    isi: "KYC harus terverifikasi, lokasi perangkat dicocokkan dengan titik pengajuan, formulir dijaga gerbang kirim anti-spam, dan kunci idempotensi menahan pengajuan ganda saat jaringan mengulang kiriman.",
    rujukan: "src/convex/gerbangKirim.ts, idempotensi.ts",
  },
  {
    judul: "Pembayaran manual",
    isi: "Peminjam transfer lalu mengunggah bukti. Angsuran berstatus belum_dibayar, menunggu_verifikasi, atau lunas. Admin mencocokkan bukti dengan mutasi sebelum menandai lunas, dan kuitansi terbit setelah cocok.",
    rujukan: "src/lib/verifikasiPembayaran.ts",
  },
  {
    judul: "Pembagian marjin pendana",
    isi: "Setiap alokasi menyimpan hak pendana sekali: marjin pinjaman dibagi menurut porsi pokok, lalu dibelah 47 : 13 dari 60 (78,33% pendana, 21,67% platform). Siklus 30 hari dibayar penuh pada hari ke-30; kekurangan ditutup jaminan platform. Satu pinjaman hanya boleh didanai satu penyedia dana, dan Pengaturan Potongan Admin hanya berlaku untuk baris lama tanpa snapshot.",
    rujukan: "src/lib/kebijakanPinjaman.ts, imbalPendana.ts, convex/siklusPendana.ts",
  },
  {
    judul: "Dana penyedia",
    isi: "Setiap pinjaman yang cair dialokasikan ke satu rekening penyedia dana dan dicatat per pinjaman. Hak imbal dihitung dari snapshot alokasi, sedangkan transfer pendana direkonsiliasi terpisah.",
    rujukan: "src/convex/alokasiDana.ts, laporanTransferPendana.ts",
  },
  {
    judul: "Kill switch",
    isi: "Memblokir seluruh pengajuan baru. Eksekusi wajib mengetik NONAKTIFKAN dan mengisi alasan, dan jejaknya masuk audit trail.",
    rujukan: "src/convex/system.ts",
  },
];

const ALUR_PEMINJAM: readonly string[] = [
  "Daftar atau masuk dengan OTP WhatsApp, jalur NIK KTP, atau akun Google. Kode NIK tetap dikirim ke WhatsApp yang terdaftar, jadi NIK saja tidak membuka akun.",
  "Lengkapi data diri, rekening pencairan, dan dokumen KYC: KTP, selfie-KTP, serta bukti penghasilan.",
  "Tunggu verifikasi KYC. Bila diminta perbaikan, unggah ulang dari subbagian Verifikasi KYC di menu Akun.",
  "Ajukan pinjaman: pilih skema harian, bulanan, gadai, atau kredit barang, lalu isi nominal dan tenor.",
  "Ikuti gerbang lokasi dan pengiriman; pengajuan ganda dari kiriman ulang ditahan kunci idempotensi.",
  "Pantau keputusan di Ringkasan dan Catatan Pinjaman. Setelah dicairkan, jadwal angsuran muncul di tab Cicilan.",
  "Bayar lewat transfer manual, lalu unggah bukti pada angsuran yang dituju.",
  "Setelah admin mencocokkan bukti, angsuran menjadi lunas dan kuitansinya bisa dibuka.",
  "Bila tagihan tidak terbayar, ajukan restrukturisasi atau hubungi CS lewat kanal bantuan.",
];

const ALUR_ADMIN: readonly string[] = [
  "Masuk lewat rute panel yang tidak ditautkan di halaman publik, dengan kata sandi admin dan TOTP.",
  "Mulai dari Ringkasan: kartu Perlu tindakan mengurutkan pengajuan, KYC, bukti transfer, dan peringatan lokasi.",
  "Tinjau pengajuan pinjaman, gadai, atau kredit barang beserta dokumen dan riwayat nasabah, lalu putuskan.",
  "Verifikasi KYC. Keputusan dan alasannya masuk audit trail.",
  "Catat pencairan dan alokasi dana ke rekening penyedia dana.",
  "Cocokkan bukti transfer di Rekonsiliasi Angsuran, isi referensi mutasi, lalu tandai lunas.",
  "Tangani jatuh tempo: kirim pengingat, catat perpanjangan, susun somasi, atau setujui restrukturisasi.",
  "Atur plafon, bunga khusus, dan catatan risiko per nasabah bila perilakunya berbeda dari default.",
  "Rekonsiliasi transfer penyedia dana dan pantau kesehatan portofolio di Catatan Internal.",
  "Kelola konten publik, template WhatsApp, versi aplikasi Android, serta backup dan kill switch.",
  "Setelah rute, modul, atau tarif berubah, perbarui daftar di Peta Sistem; angka ringkasan mengikuti daftar, bukan ditulis terpisah.",
];

/** Judul bagian dengan nomor urut kecil di atasnya. */
function Bagian({
  nomor,
  judul,
  keterangan,
  children,
}: {
  nomor: string;
  judul: string;
  keterangan: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <p className="font-mono text-[11px] tracking-[0.18em] text-primary">
          {nomor}
        </p>
        <h2 className="text-lg font-semibold tracking-tight text-slate-900">{judul}</h2>
        <p className="max-w-2xl text-sm leading-6 text-slate-600">{keterangan}</p>
      </div>
      {children}
    </section>
  );
}

/** Label gerbang akses, supaya rute wajib akun tidak terbaca sebagai rute publik. */
const LABEL_GERBANG: Record<GerbangRute, { teks: string; kelas: string }> = {
  publik: {
    teks: "tanpa akun",
    kelas: "border-success-border bg-success-soft text-success-foreground",
  },
  akun: {
    teks: "wajib akun",
    kelas: "border-amber-700/25 bg-amber-700/[0.06] text-amber-900",
  },
  admin: {
    teks: "khusus admin",
    kelas: "border-slate-400/50 bg-slate-100 text-slate-700",
  },
};

/** Baris rute: kode rute dan gerbangnya di kiri, kegunaannya di kanan. */
function BarisRute({
  rute,
  isi,
  gerbang,
}: {
  rute: string;
  isi: string;
  gerbang: GerbangRute;
}) {
  const label = LABEL_GERBANG[gerbang];
  return (
    <div className="flex flex-col gap-1.5 border-b border-slate-200 py-2.5 last:border-b-0 sm:flex-row sm:items-baseline sm:gap-4">
      <div className="flex shrink-0 items-center gap-2">
        <code className="w-fit shrink-0 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[12px] text-slate-800">
          {rute}
        </code>
        <span
          className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${label.kelas}`}
        >
          {label.teks}
        </span>
      </div>
      <p className="text-sm leading-6 text-slate-600">{isi}</p>
    </div>
  );
}

export function PagePengembangan() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-24 sm:space-y-10">
      <header className="space-y-5 border-b border-slate-200 pb-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-success-border bg-success-soft px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-success-foreground">
            Khusus admin
          </span>
          <span className="text-xs text-slate-500">
            Dokumentasi internal, tidak tampil di halaman publik
          </span>
        </div>

        <div className="space-y-2">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            Peta sistem &amp; logika bisnis PINDAI
          </h2>
          <p className="max-w-2xl text-sm leading-6 text-slate-600">
            Semua yang sudah berjalan hari ini: halaman yang bisa dibuka siapa
            saja, modul yang hanya untuk admin, aturan uang yang dipakai server,
            serta alur peminjam dan alur petugas. Halaman ini hanya membaca kode,
            tidak menyentuh data nasabah.
          </p>
        </div>

        <dl className="grid grid-cols-2 divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white sm:grid-cols-4 sm:divide-x sm:divide-y-0">
          {RINGKASAN.map((item) => (
            <div key={item.label} className="px-4 py-3">
              <dt className="text-[11px] uppercase tracking-wide text-slate-500">
                {item.label}
              </dt>
              <dd className="mt-0.5 font-mono text-xl font-semibold text-slate-900">
                {item.angka}
              </dd>
            </div>
          ))}
        </dl>
      </header>

      <Bagian
        nomor="01"
        judul="Rute halaman & gerbang akses"
        keterangan={`${RUTE_HALAMAN.filter((r) => r.gerbang === "publik").length} rute terbuka tanpa akun, ${RUTE_HALAMAN.filter((r) => r.gerbang === "akun").length} rute menuntut sesi, dan satu rute hanya untuk admin. Dua rute publik memakai token: verifikasi kontrak dan kwitansi dari tautan WhatsApp.`}
      >
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-1">
          {RUTE_HALAMAN.map((halaman) => (
            <BarisRute
              key={halaman.rute}
              rute={halaman.rute}
              isi={halaman.isi}
              gerbang={halaman.gerbang}
            />
          ))}
        </div>
      </Bagian>

      <Bagian
        nomor="02"
        judul="Ruang peminjam"
        keterangan={`${TAB_PEMINJAM.length} tab di dasbor peminjam setelah masuk lewat OTP WhatsApp, NIK KTP, atau akun Google.`}
      >
        <p className="text-sm leading-6 text-slate-600">
          Seluruh tab hidup di satu rute, {" "}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[12px] text-slate-800">
            /dashboard
          </code>
          , dan hanya terbuka untuk akun yang sudah masuk.
        </p>
        <div className="grid gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 sm:grid-cols-2 lg:grid-cols-3">
          {TAB_PEMINJAM.map((tab, i) => (
            <div key={tab.judul} className="bg-white p-4">
              <p className="flex items-baseline gap-2">
                <span className="font-mono text-[11px] text-primary">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="text-sm font-semibold text-slate-900">{tab.judul}</span>
              </p>
              <p className="mt-1 text-sm leading-6 text-slate-600">{tab.isi}</p>
            </div>
          ))}
        </div>
      </Bagian>

      <Bagian
        nomor="03"
        judul="Modul panel admin"
        keterangan={`${MODUL_ADMIN.reduce((n, k) => n + k.modul.length, 0)} modul, dikelompokkan seperti sidebar. Beberapa di antaranya membawa lencana angka untuk pekerjaan yang benar-benar menunggu.`}
      >
        <div className="space-y-3">
          {MODUL_ADMIN.map((kelompok) => (
            <div
              key={kelompok.judul}
              className="rounded-xl border border-slate-200 bg-white p-4"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-900">{kelompok.judul}</h3>
                <span className="font-mono text-[11px] text-slate-500">
                  {kelompok.modul.length} modul
                </span>
              </div>
              <ul className="mt-2 flex flex-wrap gap-x-2 gap-y-1.5">
                {kelompok.modul.map((modul) => (
                  <li
                    key={modul}
                    className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[13px] text-slate-700"
                  >
                    {modul}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Bagian>

      <Bagian
        nomor="04"
        judul="Logika bisnis yang dijalankan server"
        keterangan="Angka di bawah dibaca langsung dari konstanta yang sama dengan server, bukan disalin. Sebagian dapat diubah lewat Pengaturan Parameter Bisnis, sisanya hanya lewat kode."
      >
        <div className="grid gap-3 lg:grid-cols-2">
          {LOGIKA.map((aturan) => (
            <article
              key={aturan.judul}
              className="rounded-xl border border-slate-200 bg-white p-4"
            >
              <h3 className="text-sm font-semibold text-slate-900">{aturan.judul}</h3>
              <p className="mt-1 text-sm leading-6 text-slate-600">{aturan.isi}</p>
              <p className="mt-2 font-mono text-[11px] text-slate-500">{aturan.rujukan}</p>
            </article>
          ))}
        </div>
      </Bagian>

      <div className="grid gap-3 lg:grid-cols-2">
        <Bagian
          nomor="05"
          judul="Alur peminjam"
          keterangan="Dari mendaftar sampai kuitansi terbit."
        >
          <ol className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
            {ALUR_PEMINJAM.map((langkah, i) => (
              <li key={langkah} className="flex gap-3">
                <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border border-primary/30 font-mono text-[11px] text-primary">
                  {i + 1}
                </span>
                <p className="text-sm leading-6 text-slate-600">{langkah}</p>
              </li>
            ))}
          </ol>
        </Bagian>

        <Bagian
          nomor="06"
          judul="Alur admin"
          keterangan="Urutan kerja yang sama dengan urutan menu di sidebar."
        >
          <ol className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
            {ALUR_ADMIN.map((langkah, i) => (
              <li key={langkah} className="flex gap-3">
                <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border border-primary/30 font-mono text-[11px] text-primary">
                  {i + 1}
                </span>
                <p className="text-sm leading-6 text-slate-600">{langkah}</p>
              </li>
            ))}
          </ol>
        </Bagian>
      </div>

      <Bagian
        nomor="07"
        judul="Cara halaman ini diperbarui"
        keterangan="Halaman ini ikut berubah bersama kode, jadi tidak perlu ada rilis terpisah untuk dokumentasi."
      >
        <ul className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
          {[
            "Rute baru: tambahkan satu baris di RUTE_HALAMAN beserta gerbangnya. Angka ringkasan menghitung sendiri, tidak disunting.",
            "Tab admin baru: tambahkan di src/pages/admin/admin-tabs.tsx, lalu salin label yang sama ke MODUL_ADMIN supaya sidebar dan halaman ini tidak berbeda.",
            "Aturan uang: ubah konstanta di src/lib/. Halaman membaca angka yang sama, jadi tarif lama tidak tertinggal di teks.",
            "Kalimat alur dan perilaku: sunting ALUR_PEMINJAM atau ALUR_ADMIN. Tes render menolak angka dan label yang tidak lagi cocok.",
          ].map((baris) => (
            <li key={baris} className="flex gap-2.5 text-sm leading-6 text-slate-600">
              <ChevronRight className="mt-1 size-4 shrink-0 text-primary" aria-hidden />
              {baris}
            </li>
          ))}
        </ul>
      </Bagian>

      <section className="space-y-2 border-t border-slate-200 pt-5 text-sm leading-6 text-slate-600">
        <p>
          Rujukan cepat: <code className="font-mono text-[12px] text-slate-800">src/pages/</code>{" "}
          untuk halaman,{" "}
          <code className="font-mono text-[12px] text-slate-800">src/components/admin/</code>{" "}
          untuk panel,{" "}
          <code className="font-mono text-[12px] text-slate-800">src/convex/</code> untuk
          backend dan database, serta{" "}
          <code className="font-mono text-[12px] text-slate-800">src/lib/</code> untuk
          perhitungan uang yang dipakai bersama klien dan server.
        </p>
        <p>
          Angka di halaman ini mengikuti konstanta kode, jadi perubahan tarif tidak
          perlu disalin ulang. Yang perlu disunting saat aturan berubah adalah daftar
          dan kalimatnya. Halaman ini tidak boleh menjanjikan perilaku yang tidak
          dijalankan server.
        </p>
      </section>
    </div>
  );
}
