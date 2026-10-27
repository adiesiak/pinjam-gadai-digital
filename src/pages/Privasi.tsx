/**
 * Halaman Kebijakan Privasi (publik, `/privasi`).
 *
 * Ditulis dari perilaku kode yang benar-benar berlaku, bukan dari templat
 * kebijakan: setiap angka retensi di sini punya job cron-nya, dan setiap
 * penerima data disebut sesuai yang benar-benar dipanggil aplikasi. Kalau salah
 * satu berubah, halaman ini ikut berubah — karena itu angkanya dibaca dari
 * konstanta yang sama dengan mesinnya, bukan ditulis ulang.
 */
import { motion } from "framer-motion";
import { ArrowLeft, FileJson, LockKeyhole, MapPin, ShieldCheck, UserCheck } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";

import { Button } from "@/components/ui/button";
import { HAK_CIPTA_PINDAI, PENAFIAN_PINDAI } from "@/lib/branding";
import {
  DEFAULT_CONFIG,
  RETENSI_AUDIT_BATAS,
  RETENSI_LOG_WA_BATAS,
} from "@/lib/system-config";
import { urlChatCs } from "@/lib/kontak";
import { LOKASI_RETENSI } from "@/lib/lokasi";

/** Tanggal berlaku versi ini; ikut berubah setiap isinya diperbarui. */
const BERLAKU_SEJAK = "27 Oktober 2026";

/** Retensi bawaan yang benar-benar dipakai job cron (bukan angka hiasan). */
const RETENSI_BAWAAN = {
  lokasiHari: LOKASI_RETENSI.jejakHari,
  lokasiBuktiHari: LOKASI_RETENSI.buktiPinjamanHari,
  logWaHari: DEFAULT_CONFIG.retensiLogWaHari,
  auditHari: DEFAULT_CONFIG.retensiAuditHari,
} as const;

type Bagian = {
  id: string;
  judul: string;
  ikon: ReactNode;
  isi: ReactNode;
};

function Paragraf({ children }: { children: ReactNode }) {
  return <p className="mt-3 text-sm leading-7 text-slate-600">{children}</p>;
}

function Daftar({ children }: { children: ReactNode }) {
  return <ul className="mt-3 space-y-2 text-sm leading-7 text-slate-600">{children}</ul>;
}

function Butir({ children }: { children: ReactNode }) {
  return (
    <li className="flex gap-2">
      <span className="mt-2.5 size-1.5 shrink-0 rounded-full bg-emerald-800/60" aria-hidden />
      <span>{children}</span>
    </li>
  );
}

const BAGIAN: Bagian[] = [
  {
    id: "data",
    judul: "Data yang kami simpan",
    ikon: <UserCheck className="size-4" aria-hidden />,
    isi: (
      <>
        <Paragraf>
          Data yang tersimpan berasal dari isian Anda sendiri, dari peninjauan tim PINDAI, dan dari
          perangkat yang Anda pakai. Daftar ini menyebut yang benar-benar ada di basis data
          aplikasi.
        </Paragraf>
        <Daftar>
          <Butir>
            <strong className="font-semibold text-slate-800">Identitas:</strong> nama lengkap, NIK
            16 digit, nomor WhatsApp, alamat, pekerjaan, penghasilan bulanan, dan kontak darurat
            bila Anda mengisinya.
          </Butir>
          <Butir>
            <strong className="font-semibold text-slate-800">Dokumen:</strong> foto KTP, selfie
            dengan KTP, bukti penghasilan, foto barang jaminan gadai, dan gambar tanda tangan
            persetujuan.
          </Butir>
          <Butir>
            <strong className="font-semibold text-slate-800">Keuangan:</strong> nama bank dan nomor
            rekening, nominal pengajuan, jadwal angsuran, pembayaran, serta catatan jurnal internal
            atas pinjaman Anda.
          </Butir>
          <Butir>
            <strong className="font-semibold text-slate-800">Lokasi:</strong> titik GPS perangkat
            beserta waktu dan akurasinya, dikirim berkala selama gerbang lokasi aktif. Gerbang
            lokasi adalah syarat produk sebelum transaksi, jadi baris persetujuannya dicatat
            otomatis saat titik pertama masuk, bukan lewat pilihan terpisah.
          </Butir>
          <Butir>
            <strong className="font-semibold text-slate-800">Perangkat &amp; sesi:</strong> jenis
            perangkat, versi aplikasi, penanda sesi, alamat IP, dan waktu akses, dipakai untuk
            mengenali percobaan masuk yang tidak wajar.
          </Butir>
          <Butir>
            <strong className="font-semibold text-slate-800">Komunikasi:</strong> isi pesan yang
            kami kirim ke nomor Anda, status pengirimannya, serta pengaduan yang Anda kirim lewat
            helpdesk.
          </Butir>
        </Daftar>
        <Paragraf>
          Aplikasi ini tidak memakai analitik pihak ketiga, cookie iklan, maupun pelacakan
          pemasaran.
        </Paragraf>
      </>
    ),
  },
  {
    id: "tujuan",
    judul: "Untuk apa data dipakai",
    ikon: <ShieldCheck className="size-4" aria-hidden />,
    isi: (
      <Daftar>
        <Butir>Menilai kelayakan dan mencatat pengajuan pinjaman, gadai, atau kredit barang.</Butir>
        <Butir>Memverifikasi identitas sebelum akad dan sebelum perubahan data penting.</Butir>
        <Butir>Menagih angsuran, mengirim pengingat jatuh tempo, dan mencatat pembayaran.</Butir>
        <Butir>Menjaga keamanan akun: gerbang lokasi, deteksi sesi ganda, dan log percobaan masuk.</Butir>
        <Butir>Memenuhi kewajiban pencatatan: jurnal keuangan dan jejak audit tindakan admin.</Butir>
        <Butir>Menjawab pengaduan dan pertanyaan Anda lewat helpdesk atau WhatsApp layanan.</Butir>
      </Daftar>
    ),
  },
  {
    id: "dasar",
    judul: "Dasar pemrosesan",
    ikon: <FileJson className="size-4" aria-hidden />,
    isi: (
      <Daftar>
        <Butir>
          <strong className="font-semibold text-slate-800">Pelaksanaan perjanjian:</strong> data
          yang diperlukan untuk menilai, mencatat, dan menagih pinjaman Anda.
        </Butir>
        <Butir>
          <strong className="font-semibold text-slate-800">Kewajiban hukum:</strong> pencatatan
          transaksi dan penyimpanan bukti yang harus tersedia bila dipertanyakan.
        </Butir>
        <Butir>
          <strong className="font-semibold text-slate-800">Persetujuan:</strong> unggahan dokumen
          identitas, tanda tangan persetujuan, dan data yang Anda isi sendiri.
        </Butir>
        <Butir>
          <strong className="font-semibold text-slate-800">Gerbang produk:</strong> titik GPS
          presisi, karena aksi finansial mensyaratkan titik lokasi yang masih segar. Retensi
          titiknya dibatasi, dan ruang penyedia dana hanya melihatnya pada tingkat wilayah.
        </Butir>
        <Butir>
          <strong className="font-semibold text-slate-800">Kepentingan sah:</strong> keamanan akun,
          pencegahan penyalahgunaan, dan penegakan aturan pemakaian.
        </Butir>
      </Daftar>
    ),
  },
  {
    id: "penerima",
    judul: "Siapa yang bisa melihat data",
    ikon: <LockKeyhole className="size-4" aria-hidden />,
    isi: (
      <>
        <Daftar>
          <Butir>
            <strong className="font-semibold text-slate-800">Tim PINDAI</strong> lewat panel admin,
            termasuk pembukaan dokumen identitas yang diberi tanda air. Setiap tindakan tulis
            tercatat di jejak audit beserta pelakunya.
          </Butir>
          <Butir>
            <strong className="font-semibold text-slate-800">Penyedia dana</strong> yang membiayai
            pinjaman tertentu, dan hanya untuk pengajuan yang berkaitan dengan pinjaman itu. NIK,
            nomor rekening, alamat, dan dokumen identitas tidak pernah masuk ke ruang penyedia dana;
            nama peminjam ditampilkan tersamar; titik lokasi ditampilkan pada tingkat wilayah.
          </Butir>
          <Butir>
            <strong className="font-semibold text-slate-800">Gateway WhatsApp</strong> yang mengirim
            pesan ke nomor Anda: nomor tujuan dan isi pesan.
          </Butir>
          <Butir>
            <strong className="font-semibold text-slate-800">Penyedia surel</strong> saat rincian
            pinjaman atau surat dikirim lewat email: alamat tujuan dan isi kiriman.
          </Butir>
          <Butir>
            <strong className="font-semibold text-slate-800">Layanan keamanan peramban</strong>{" "}
            (Turnstile) untuk memeriksa apakah pengiriman formulir berasal dari manusia.
          </Butir>
          <Butir>
            <strong className="font-semibold text-slate-800">Server peta</strong> saat peta dibuka:
            permintaan ubin peta dikirim peramban Anda langsung ke penyedianya.
          </Butir>
        </Daftar>
        <Paragraf>
          Kami tidak menjual data pribadi Anda, dan tidak membagikannya untuk iklan.
        </Paragraf>
      </>
    ),
  },
  {
    id: "retensi",
    judul: "Berapa lama data disimpan",
    ikon: <MapPin className="size-4" aria-hidden />,
    isi: (
      <>
        <Paragraf>
          Pembersihan berjalan otomatis lewat penjadwal harian. Angka di bawah adalah bawaan yang
          berlaku sekarang.
        </Paragraf>
        <Daftar>
          <Butir>
            Titik lokasi: {RETENSI_BAWAAN.lokasiHari} hari. Titik yang terikat pinjaman belum lunas
            ditahan sampai {RETENSI_BAWAAN.lokasiBuktiHari} hari sebagai bukti.
          </Butir>
          <Butir>
            Isi pesan WhatsApp dan status pengirimannya: {RETENSI_BAWAAN.logWaHari} hari.
          </Butir>
          <Butir>Jejak audit tindakan admin: {RETENSI_BAWAAN.auditHari} hari.</Butir>
          <Butir>
            Kunci teknis sekali pakai dan jejak gerbang pengiriman: 7 hari.
          </Butir>
          <Butir>
            Data diri, data KYC, dan dokumen identitas: selama akun Anda aktif. Semuanya dihapus
            ketika akun dihapus, termasuk berkas di penyimpanan.
          </Butir>
          <Butir>
            Catatan keuangan (pinjaman, gadai, kredit barang, angsuran, jurnal): tetap disimpan
            sebagai catatan usaha meski akun dihapus, karena itu bukti transaksi.
          </Butir>
        </Daftar>
        <Paragraf>
          Rentang retensi lokasi, log pesan, dan jejak audit dapat diatur tim PINDAI di Pengaturan
          Sistem; batas terendah dan tertingginya sudah ditetapkan agar bukti yang masih baru tidak
          terhapus terlalu cepat.
        </Paragraf>
      </>
    ),
  },
  {
    id: "lokasi-penyimpanan",
    judul: "Di mana data disimpan",
    ikon: <MapPin className="size-4" aria-hidden />,
    isi: (
      <>
        <Paragraf>
          Basis data dan berkas aplikasi disimpan pada layanan Convex, dengan berkas gambar di
          penyimpanan layanan yang sama. Infrastruktur penyedianya berada di luar Indonesia,
          sehingga data Anda diproses lintas negara untuk keperluan hosting, pengiriman pesan, dan
          pengiriman surel.
        </Paragraf>
        <Paragraf>
          Data disimpan dalam bentuk terenkripsi saat tidak dipakai (enkripsi bawaan penyedia), dan
          dikirim lewat sambungan terenkripsi. Kami tidak memakai enkripsi tingkat kolom untuk NIK
          dan nomor rekening; karenanya akses ke basis data dibatasi pada tim PINDAI.
        </Paragraf>
      </>
    ),
  },
  {
    id: "hak",
    judul: "Hak Anda",
    ikon: <FileJson className="size-4" aria-hidden />,
    isi: (
      <>
        <Daftar>
          <Butir>
            <strong className="font-semibold text-slate-800">Melihat dan mengunduh salinan.</strong>{" "}
            Dashboard bagian Data &amp; privasi menyediakan tombol unduh salinan data Anda dalam
            bentuk JSON, berisi data diri, status KYC, pengajuan, jadwal angsuran, catatan lokasi
            terakhir, dan perangkat terdaftar.
          </Butir>
          <Butir>
            <strong className="font-semibold text-slate-800">Memperbaiki data.</strong> Data diri
            dapat Anda perbarui sendiri dari dashboard; perubahannya tercatat.
          </Butir>
          <Butir>
            <strong className="font-semibold text-slate-800">Menghentikan pemantauan lokasi.</strong>{" "}
            Matikan izin lokasi di pengaturan perangkat; aplikasi berhenti mengirim titik baru,
            dan transaksi yang mensyaratkan lokasi segar tidak bisa dilanjutkan sampai izinnya
            dinyalakan lagi.
          </Butir>
          <Butir>
            <strong className="font-semibold text-slate-800">Menghapus akun.</strong> Penghapusan
            mandiri tersedia di dashboard. Permintaan ditolak selama masih ada pinjaman, gadai,
            atau kredit barang yang berjalan, karena catatan itu masih harus punya pemilik yang
            bisa dihubungi. Akun penyedia dana dan akun tim dihapus lewat tim PINDAI agar posisinya
            ditutup lebih dulu.
          </Butir>
          <Butir>
            <strong className="font-semibold text-slate-800">Mengajukan keberatan atau keluhan.</strong>{" "}
            Kirim lewat helpdesk di dashboard atau WhatsApp layanan; setiap pengaduan dicatat dan
            dijawab.
          </Butir>
        </Daftar>
        <Paragraf>
          Permintaan yang memerlukan pemeriksaan manual (misalnya salinan catatan peninjauan
          internal) diproses tim PINDAI setelah identitas pemohon dipastikan.
        </Paragraf>
      </>
    ),
  },
  {
    id: "keamanan",
    judul: "Cara data dijaga",
    ikon: <LockKeyhole className="size-4" aria-hidden />,
    isi: (
      <Daftar>
        <Butir>Izin diperiksa di server, bukan hanya disembunyikan di tampilan.</Butir>
        <Butir>
          Dokumen identitas hanya bisa dibuka admin, dan tampil dengan tanda air berisi identitas
          pembukanya.
        </Butir>
        <Butir>
          Tautan berkas sensitif ditandatangani dan kedaluwarsa dalam sepuluh menit, bukan URL permanen.
        </Butir>
        <Butir>Keluar otomatis saat sesi tidak dipakai, dan satu sesi aktif per akun.</Butir>
        <Butir>Setiap tindakan admin yang mengubah data tercatat di jejak audit.</Butir>
      </Daftar>
    ),
  },
];

export function PrivasiView() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
              P
            </span>
            <span className="text-sm font-black uppercase tracking-[0.16em] text-primary">
              PINDAI
            </span>
          </Link>
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

      <main id="konten" tabIndex={-1} className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="rounded-2xl border border-slate-200 bg-white p-6 sm:rounded-3xl sm:p-10"
        >
          <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
            <ShieldCheck className="size-4" /> Perlindungan Data
          </p>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-navy sm:text-4xl">
            Kebijakan Privasi
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
            Halaman ini menjelaskan data pribadi apa yang disimpan aplikasi PINDAI, untuk apa
            dipakai, siapa yang bisa melihatnya, dan berapa lama disimpan. Isinya mengikuti
            perilaku aplikasi yang berlaku, bukan contoh kebijakan umum.
          </p>
          <p className="mt-2 max-w-2xl text-xs leading-5 text-slate-500">{PENAFIAN_PINDAI}</p>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 font-medium">
              Berlaku {BERLAKU_SEJAK}
            </span>
            <Link
              to="/syarat-ketentuan"
              className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 font-medium hover:border-primary/40"
            >
              Syarat &amp; Ketentuan
            </Link>
          </div>
        </motion.section>

        <div className="mt-6 space-y-4">
          {BAGIAN.map((bagian, urutan) => (
            <section
              key={bagian.id}
              id={bagian.id}
              className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6"
            >
              <h2 className="flex items-center gap-2 text-sm font-semibold text-navy">
                <span className="text-slate-400" aria-hidden>
                  {String(urutan + 1).padStart(2, "0")}
                </span>
                {bagian.ikon}
                {bagian.judul}
              </h2>
              <div className="mt-2">{bagian.isi}</div>
            </section>
          ))}

          <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-navy">
              <span className="text-slate-400" aria-hidden>
                {String(BAGIAN.length + 1).padStart(2, "0")}
              </span>
              <FileJson className="size-4" aria-hidden />
              Riwayat perubahan
            </h2>
            <ul className="mt-3 space-y-3 text-sm leading-7 text-slate-600">
              <li>
                <strong className="font-semibold text-slate-800">{BERLAKU_SEJAK}</strong>: retensi
                otomatis untuk isi pesan WhatsApp ({RETENSI_LOG_WA_BATAS.min} sampai{" "}
                {RETENSI_LOG_WA_BATAS.maks} hari, bawaan {RETENSI_BAWAAN.logWaHari}) dan jejak audit
                ({RETENSI_AUDIT_BATAS.min} sampai {RETENSI_AUDIT_BATAS.maks} hari, bawaan{" "}
                {RETENSI_BAWAAN.auditHari}); salinan data dan penghapusan akun mandiri di dashboard.
              </li>
              <li>
                <strong className="font-semibold text-slate-800">19 Oktober 2026</strong>: halaman
                ini pertama diterbitkan bersama bagian data pribadi pada Syarat &amp; Ketentuan.
              </li>
            </ul>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-navy">
              <span className="text-slate-400" aria-hidden>
                {String(BAGIAN.length + 2).padStart(2, "0")}
              </span>
              <ShieldCheck className="size-4" aria-hidden />
              Hubungi kami
            </h2>
            <Paragraf>
              Pertanyaan tentang data pribadi, permintaan salinan manual, atau keberatan dapat
              dikirim lewat helpdesk di dashboard atau WhatsApp layanan.
            </Paragraf>
            <div className="mt-4">
              <Button asChild variant="outline">
                <a href={urlChatCs("Halo PINDAI, saya ingin bertanya soal data pribadi saya.")}>
                  Chat WhatsApp layanan
                </a>
              </Button>
            </div>
          </section>
        </div>

        <p className="mt-8 text-center text-[11px] leading-5 text-slate-500">{HAK_CIPTA_PINDAI}</p>
      </main>
    </div>
  );
}

export default function Privasi() {
  return <PrivasiView />;
}
