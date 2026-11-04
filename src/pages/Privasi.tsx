/**
 * Halaman Kebijakan Privasi (publik, `/privasi`).
 *
 * Ditulis dari perilaku kode yang benar-benar berlaku, bukan dari templat
 * kebijakan: setiap angka retensi di sini punya job cron-nya, dan setiap
 * penerima data disebut sesuai yang benar-benar dipanggil aplikasi. Kalau salah
 * satu berubah, halaman ini ikut berubah — karena itu angkanya dibaca dari
 * konstanta yang sama dengan mesinnya, bukan ditulis ulang.
 */
import { ArrowLeft, ChevronDown, ShieldCheck } from "lucide-react";
import { type ReactNode, useEffect } from "react";
import { Link } from "react-router";

import { IkonWhatsapp } from "@/components/IkonWhatsapp";
import { InfoFooter, InfoHeader } from "@/components/informasi/InfoShell";
import { JudulBagian } from "@/components/landing/JudulBagian";
import { Button } from "@/components/ui/button";
import { PENAFIAN_PINDAI } from "@/lib/branding";
import { urlChatCs } from "@/lib/kontak";
import { LOKASI_RETENSI } from "@/lib/lokasi";
import {
  DEFAULT_CONFIG,
  RETENSI_AUDIT_BATAS,
  RETENSI_LOG_WA_BATAS,
} from "@/lib/system-config";

/** Tanggal berlaku versi ini; ikut berubah setiap isinya diperbarui. */
const BERLAKU_SEJAK = "27 Oktober 2026";

const DESKRIPSI_HALAMAN =
  "Halaman ini menjelaskan data pribadi apa yang disimpan aplikasi PINDAI, untuk apa dipakai, siapa yang bisa melihatnya, dan berapa lama disimpan. Isinya mengikuti perilaku aplikasi yang berlaku, bukan contoh kebijakan umum.";

/** Retensi bawaan yang benar-benar dipakai job cron (bukan angka hiasan). */
const RETENSI_BAWAAN = {
  lokasiHari: LOKASI_RETENSI.jejakHari,
  lokasiBuktiHari: LOKASI_RETENSI.buktiPinjamanHari,
  logWaHari: DEFAULT_CONFIG.retensiLogWaHari,
  auditHari: DEFAULT_CONFIG.retensiAuditHari,
} as const;

type Bagian = {
  id: string;
  label: string;
  judul: string;
  isi: ReactNode;
};

const DAFTAR_ISI = [
  { id: "data", nomor: "01", label: "Data yang disimpan" },
  { id: "tujuan", nomor: "02", label: "Tujuan pemakaian" },
  { id: "dasar", nomor: "03", label: "Dasar pemrosesan" },
  { id: "penerima", nomor: "04", label: "Penerima data" },
  { id: "retensi", nomor: "05", label: "Retensi data" },
  { id: "lokasi-penyimpanan", nomor: "06", label: "Penyimpanan" },
  { id: "hak", nomor: "07", label: "Hak Anda" },
  { id: "keamanan", nomor: "08", label: "Keamanan" },
  { id: "riwayat", nomor: "09", label: "Riwayat versi" },
  { id: "kontak", nomor: "10", label: "Kontak" },
] as const;

function Paragraf({ children }: { children: ReactNode }) {
  return (
    <p className="mt-3 text-base leading-7 text-muted-foreground">{children}</p>
  );
}

function Daftar({ children }: { children: ReactNode }) {
  return (
    <ul className="mt-3 space-y-2 text-base leading-7 text-muted-foreground">
      {children}
    </ul>
  );
}

function Butir({ children }: { children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span
        aria-hidden="true"
        className="mt-3.5 h-px w-3 shrink-0 bg-gold/70"
      />
      <span className="min-w-0">{children}</span>
    </li>
  );
}

const BAGIAN: Bagian[] = [
  {
    id: "data",
    label: "Data",
    judul: "Data yang kami simpan",
    isi: (
      <>
        <Paragraf>
          Data yang tersimpan berasal dari isian Anda sendiri, dari peninjauan
          tim PINDAI, dan dari perangkat yang Anda pakai. Daftar ini menyebut
          yang benar-benar ada di basis data aplikasi.
        </Paragraf>
        <Daftar>
          <Butir>
            <strong className="font-semibold text-foreground">
              Identitas:
            </strong>{" "}
            nama lengkap, NIK 16 digit, nomor WhatsApp, alamat, pekerjaan,
            penghasilan bulanan, dan kontak darurat bila Anda mengisinya.
          </Butir>
          <Butir>
            <strong className="font-semibold text-foreground">Dokumen:</strong>{" "}
            foto KTP, selfie dengan KTP, bukti penghasilan, foto barang jaminan
            gadai, dan gambar tanda tangan persetujuan.
          </Butir>
          <Butir>
            <strong className="font-semibold text-foreground">Keuangan:</strong>{" "}
            nama bank dan nomor rekening, nominal pengajuan, jadwal angsuran,
            pembayaran, serta catatan jurnal internal atas pinjaman Anda.
          </Butir>
          <Butir>
            <strong className="font-semibold text-foreground">Lokasi:</strong>{" "}
            titik GPS perangkat beserta waktu dan akurasinya, dikirim berkala
            selama gerbang lokasi aktif. Gerbang lokasi adalah syarat produk
            sebelum transaksi, jadi baris persetujuannya dicatat otomatis saat
            titik pertama masuk, bukan lewat pilihan terpisah.
          </Butir>
          <Butir>
            <strong className="font-semibold text-foreground">
              Perangkat &amp; sesi:
            </strong>{" "}
            jenis perangkat, versi aplikasi, penanda sesi, alamat IP, dan waktu
            akses, dipakai untuk mengenali percobaan masuk yang tidak wajar.
          </Butir>
          <Butir>
            <strong className="font-semibold text-foreground">
              Komunikasi:
            </strong>{" "}
            isi pesan yang kami kirim ke nomor Anda, status pengirimannya, serta
            pengaduan yang Anda kirim lewat helpdesk.
          </Butir>
        </Daftar>
        <Paragraf>
          Aplikasi ini tidak memakai analitik pihak ketiga, cookie iklan, maupun
          pelacakan pemasaran.
        </Paragraf>
      </>
    ),
  },
  {
    id: "tujuan",
    label: "Tujuan",
    judul: "Untuk apa data dipakai",
    isi: (
      <Daftar>
        <Butir>
          Menilai kelayakan dan mencatat pengajuan pinjaman, gadai, atau kredit
          barang.
        </Butir>
        <Butir>
          Memverifikasi identitas sebelum akad dan sebelum perubahan data
          penting.
        </Butir>
        <Butir>
          Menagih angsuran, mengirim pengingat jatuh tempo, dan mencatat
          pembayaran.
        </Butir>
        <Butir>
          Menjaga keamanan akun: gerbang lokasi, deteksi sesi ganda, dan log
          percobaan masuk.
        </Butir>
        <Butir>
          Memenuhi kewajiban pencatatan: jurnal keuangan dan jejak audit
          tindakan admin.
        </Butir>
        <Butir>
          Menjawab pengaduan dan pertanyaan Anda lewat helpdesk atau WhatsApp
          layanan.
        </Butir>
      </Daftar>
    ),
  },
  {
    id: "dasar",
    label: "Dasar",
    judul: "Dasar pemrosesan",
    isi: (
      <Daftar>
        <Butir>
          <strong className="font-semibold text-foreground">
            Pelaksanaan perjanjian:
          </strong>{" "}
          data yang diperlukan untuk menilai, mencatat, dan menagih pinjaman
          Anda.
        </Butir>
        <Butir>
          <strong className="font-semibold text-foreground">
            Kewajiban hukum:
          </strong>{" "}
          pencatatan transaksi dan penyimpanan bukti yang harus tersedia bila
          dipertanyakan.
        </Butir>
        <Butir>
          <strong className="font-semibold text-foreground">Persetujuan:</strong>{" "}
          unggahan dokumen identitas, tanda tangan persetujuan, dan data yang
          Anda isi sendiri.
        </Butir>
        <Butir>
          <strong className="font-semibold text-foreground">
            Gerbang produk:
          </strong>{" "}
          titik GPS presisi, karena aksi finansial mensyaratkan titik lokasi
          yang masih segar. Retensi titiknya dibatasi, dan ruang penyedia dana
          hanya melihatnya pada tingkat wilayah.
        </Butir>
        <Butir>
          <strong className="font-semibold text-foreground">
            Kepentingan sah:
          </strong>{" "}
          keamanan akun, pencegahan penyalahgunaan, dan penegakan aturan
          pemakaian.
        </Butir>
      </Daftar>
    ),
  },
  {
    id: "penerima",
    label: "Penerima",
    judul: "Siapa yang bisa melihat data",
    isi: (
      <>
        <Daftar>
          <Butir>
            <strong className="font-semibold text-foreground">
              Tim PINDAI
            </strong>{" "}
            lewat panel admin, termasuk pembukaan dokumen identitas yang diberi
            tanda air. Setiap tindakan tulis tercatat di jejak audit beserta
            pelakunya.
          </Butir>
          <Butir>
            <strong className="font-semibold text-foreground">
              Penyedia dana
            </strong>{" "}
            beremail hanya menerima pengajuan yang berkaitan dengan pinjamannya;
            sesi pemantau kode akses bersama yang diotorisasi admin dapat melihat
            seluruh pengajuan untuk rekonsiliasi. Pada kedua ruang, NIK, nomor
            rekening, alamat, dan dokumen identitas tidak pernah masuk; nama
            peminjam ditampilkan tersamar; titik lokasi ditampilkan pada tingkat
            wilayah.
          </Butir>
          <Butir>
            <strong className="font-semibold text-foreground">
              Gateway WhatsApp
            </strong>{" "}
            yang mengirim pesan ke nomor Anda: nomor tujuan dan isi pesan.
          </Butir>
          <Butir>
            <strong className="font-semibold text-foreground">
              Penyedia surel
            </strong>{" "}
            saat rincian pinjaman atau surat dikirim lewat email: alamat tujuan
            dan isi kiriman.
          </Butir>
          <Butir>
            <strong className="font-semibold text-foreground">
              Layanan keamanan peramban
            </strong>{" "}
            (Turnstile) untuk memeriksa apakah pengiriman formulir berasal dari
            manusia.
          </Butir>
          <Butir>
            <strong className="font-semibold text-foreground">
              Server peta
            </strong>{" "}
            saat peta dibuka: permintaan ubin peta dikirim peramban Anda
            langsung ke penyedianya.
          </Butir>
        </Daftar>
        <Paragraf>
          Kami tidak menjual data pribadi Anda, dan tidak membagikannya untuk
          iklan.
        </Paragraf>
      </>
    ),
  },
  {
    id: "retensi",
    label: "Retensi",
    judul: "Berapa lama data disimpan",
    isi: (
      <>
        <Paragraf>
          Pembersihan berjalan otomatis lewat penjadwal harian. Angka di bawah
          adalah bawaan yang berlaku sekarang.
        </Paragraf>
        <Daftar>
          <Butir>
            Titik lokasi: {RETENSI_BAWAAN.lokasiHari} hari. Titik yang terikat
            pinjaman belum lunas ditahan sampai {RETENSI_BAWAAN.lokasiBuktiHari}{" "}
            hari sebagai bukti.
          </Butir>
          <Butir>
            Isi pesan WhatsApp dan status pengirimannya:{" "}
            {RETENSI_BAWAAN.logWaHari} hari.
          </Butir>
          <Butir>
            Jejak audit tindakan admin: {RETENSI_BAWAAN.auditHari} hari.
          </Butir>
          <Butir>
            Kunci teknis sekali pakai dan jejak gerbang pengiriman: 7 hari.
          </Butir>
          <Butir>
            Data diri, data KYC, dan dokumen identitas: selama akun Anda aktif.
            Semuanya dihapus ketika akun dihapus, termasuk berkas di
            penyimpanan.
          </Butir>
          <Butir>
            Catatan keuangan (pinjaman, gadai, kredit barang, angsuran, jurnal):
            tetap disimpan sebagai catatan usaha meski akun dihapus, karena itu
            bukti transaksi.
          </Butir>
        </Daftar>
        <Paragraf>
          Rentang retensi lokasi, log pesan, dan jejak audit dapat diatur tim
          PINDAI di Pengaturan Sistem; batas terendah dan tertingginya sudah
          ditetapkan agar bukti yang masih baru tidak terhapus terlalu cepat.
        </Paragraf>
      </>
    ),
  },
  {
    id: "lokasi-penyimpanan",
    label: "Penyimpanan",
    judul: "Di mana data disimpan",
    isi: (
      <>
        <Paragraf>
          Basis data dan berkas aplikasi disimpan pada layanan Convex, dengan
          berkas gambar di penyimpanan layanan yang sama. Infrastruktur
          penyedianya berada di luar Indonesia, sehingga data Anda diproses
          lintas negara untuk keperluan hosting, pengiriman pesan, dan
          pengiriman surel.
        </Paragraf>
        <Paragraf>
          Data disimpan dalam bentuk terenkripsi saat tidak dipakai (enkripsi
          bawaan penyedia), dan dikirim lewat sambungan terenkripsi. Kami tidak
          memakai enkripsi tingkat kolom untuk NIK dan nomor rekening;
          karenanya akses ke basis data dibatasi pada tim PINDAI.
        </Paragraf>
      </>
    ),
  },
  {
    id: "hak",
    label: "Kendali",
    judul: "Hak Anda",
    isi: (
      <>
        <Daftar>
          <Butir>
            <strong className="font-semibold text-foreground">
              Melihat dan mengunduh salinan.
            </strong>{" "}
            Dashboard bagian Data &amp; privasi menyediakan tombol unduh salinan
            data Anda dalam bentuk JSON, berisi data diri, status KYC,
            pengajuan, jadwal angsuran, catatan lokasi terakhir, dan perangkat
            terdaftar.
          </Butir>
          <Butir>
            <strong className="font-semibold text-foreground">
              Memperbaiki data.
            </strong>{" "}
            Data diri dapat Anda perbarui sendiri dari dashboard; perubahannya
            tercatat.
          </Butir>
          <Butir>
            <strong className="font-semibold text-foreground">
              Menghentikan pemantauan lokasi.
            </strong>{" "}
            Matikan izin lokasi di pengaturan perangkat; aplikasi berhenti
            mengirim titik baru, dan transaksi yang mensyaratkan lokasi segar
            tidak bisa dilanjutkan sampai izinnya dinyalakan lagi.
          </Butir>
          <Butir>
            <strong className="font-semibold text-foreground">
              Menghapus akun.
            </strong>{" "}
            Penghapusan mandiri tersedia di dashboard. Permintaan ditolak
            selama masih ada pinjaman, gadai, atau kredit barang yang berjalan,
            karena catatan itu masih harus punya pemilik yang bisa dihubungi.
            Akun penyedia dana dan akun tim dihapus lewat tim PINDAI agar
            posisinya ditutup lebih dulu.
          </Butir>
          <Butir>
            <strong className="font-semibold text-foreground">
              Mengajukan keberatan atau keluhan.
            </strong>{" "}
            Kirim lewat helpdesk di dashboard atau WhatsApp layanan; setiap
            pengaduan dicatat dan dijawab.
          </Butir>
        </Daftar>
        <Paragraf>
          Permintaan yang memerlukan pemeriksaan manual (misalnya salinan
          catatan peninjauan internal) diproses tim PINDAI setelah identitas
          pemohon dipastikan.
        </Paragraf>
      </>
    ),
  },
  {
    id: "keamanan",
    label: "Keamanan",
    judul: "Cara data dijaga",
    isi: (
      <Daftar>
        <Butir>
          Izin diperiksa di server, bukan hanya disembunyikan di tampilan.
        </Butir>
        <Butir>
          Dokumen identitas hanya bisa dibuka admin, dan tampil dengan tanda air
          berisi identitas pembukanya.
        </Butir>
        <Butir>
          Tautan berkas sensitif ditandatangani dan kedaluwarsa dalam sepuluh
          menit, bukan URL permanen.
        </Butir>
        <Butir>
          Keluar otomatis saat sesi tidak dipakai, dan satu sesi aktif per akun.
        </Butir>
        <Butir>
          Setiap tindakan admin yang mengubah data tercatat di jejak audit.
        </Butir>
      </Daftar>
    ),
  },
];

/**
 * Daftar isi dipakai dua kali: rail lengket di desktop dan lipatan ringkas di
 * ponsel. Nomor hanyalah penanda urutan; nama tautannya yang dibacakan.
 */
function DaftarIsi({ denganJudul = true }: { denganJudul?: boolean }) {
  return (
    <nav aria-label="Daftar isi">
      {denganJudul ? (
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold-foreground">
            Daftar isi
          </p>
          <p className="text-xs text-muted-foreground">10 bagian</p>
        </div>
      ) : null}
      <ol
        className={
          denganJudul
            ? "mt-3 divide-y divide-border border-y border-border"
            : "divide-y divide-border border-y border-border"
        }
      >
        {DAFTAR_ISI.map((item) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              className="flex min-h-11 items-center gap-3 py-2 text-sm text-muted-foreground transition-colors hover:text-primary focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span
                aria-hidden="true"
                className="font-mono text-xs font-medium tabular-nums text-gold-foreground"
              >
                {item.nomor}
              </span>
              <span>{item.label}</span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/**
 * Kepala dokumen privasi. Bahasa visualnya sama dengan lembar `/cara-kerja`,
 * `/keamanan`, dan `/faq`: label kuningan, judul serif, serta catatan pinggir.
 */
function KepalaPrivasi() {
  return (
    <header className="mt-7 border-y border-border">
      <div className="grid gap-8 py-8 sm:py-10 lg:grid-cols-[1.18fr_0.82fr] lg:gap-14">
        <div>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold uppercase tracking-[0.2em] text-gold-foreground">
            <span className="font-mono tracking-normal">Lembar informasi</span>
            <span aria-hidden="true" className="h-px w-6 bg-gold/50" />
            Privasi
          </p>
          <div className="mt-5 flex items-start gap-4">
            <span className="mt-1 flex size-11 shrink-0 items-center justify-center rounded-lg border border-gold/40 bg-secondary text-primary">
              <ShieldCheck className="size-5" aria-hidden="true" />
            </span>
            <h1 className="font-judul text-[2.35rem] leading-[1.05] tracking-tight text-foreground sm:text-[3rem]">
              Kebijakan Privasi
            </h1>
          </div>
          <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
            {DESKRIPSI_HALAMAN}
          </p>
          <p className="mt-4 max-w-2xl border-t border-border pt-3 text-xs leading-5 text-muted-foreground">
            {PENAFIAN_PINDAI}
          </p>
        </div>

        <aside className="border-t border-border pt-5 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold-foreground">
            Catatan pinggir
          </p>
          <p className="mt-3 font-judul text-xl leading-snug text-foreground">
            Kebijakan ini mengikuti data yang benar-benar dicatat aplikasi,
            bukan templat umum.
          </p>
          <div className="mt-5 border-t border-border pt-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gold-foreground">
              Berlaku
            </p>
            <p className="mt-1 text-sm font-medium text-foreground">
              {BERLAKU_SEJAK}
            </p>
          </div>
          <nav
            aria-label="Tautan dokumen"
            className="mt-3 flex flex-wrap gap-x-4"
          >
            <Link
              to="/syarat-ketentuan"
              className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Syarat &amp; Ketentuan
            </Link>
            <Link
              to="/auth"
              className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Masuk
            </Link>
          </nav>
        </aside>
      </div>
    </header>
  );
}

export function PrivasiView() {
  useEffect(() => {
    const originalTitle = document.title;
    const meta = document.querySelector('meta[name="description"]');
    const originalDescription = meta?.getAttribute("content") ?? null;
    document.title = "Kebijakan Privasi | PINDAI";
    meta?.setAttribute("content", DESKRIPSI_HALAMAN);
    return () => {
      document.title = originalTitle;
      if (meta && originalDescription !== null)
        meta.setAttribute("content", originalDescription);
    };
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <InfoHeader />
      <main
        id="konten"
        tabIndex={-1}
        className="mx-auto min-h-[70vh] w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            to="/"
            className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-muted-foreground hover:text-primary focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Kembali ke beranda
          </Link>
          <p className="text-xs font-medium text-muted-foreground">
            Dokumen publik
          </p>
        </div>

        <KepalaPrivasi />

        <details className="group mt-8 border-y border-border lg:hidden">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-foreground focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
            <span className="flex items-center gap-3">
              <span className="font-mono text-xs text-gold-foreground">Isi</span>
              Daftar isi
            </span>
            <ChevronDown
              className="size-4 text-muted-foreground motion-safe:transition-transform group-open:rotate-180"
              aria-hidden="true"
            />
          </summary>
          <div className="pb-4 pt-2">
            <DaftarIsi denganJudul={false} />
          </div>
        </details>

        <div className="mt-10 grid gap-10 lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-12 xl:gap-16">
          <aside className="hidden lg:block">
            <div className="sticky top-8 lg:max-h-[calc(100dvh_-_4rem)] lg:overflow-y-auto lg:pr-2">
              <DaftarIsi />
            </div>
          </aside>

          <div className="min-w-0">
            <div className="space-y-10 sm:space-y-14">
              {BAGIAN.map((bagian, urutan) => (
                <section
                  key={bagian.id}
                  id={bagian.id}
                  aria-labelledby={`${bagian.id}-judul`}
                  className="scroll-mt-8"
                >
                  <JudulBagian
                    id={`${bagian.id}-judul`}
                    nomor={String(urutan + 1).padStart(2, "0")}
                    label={bagian.label}
                    judul={bagian.judul}
                  />
                  <div className="mt-4 max-w-2xl">{bagian.isi}</div>
                </section>
              ))}

              <section
                id="riwayat"
                aria-labelledby="riwayat-judul"
                className="scroll-mt-8"
              >
                <JudulBagian
                  id="riwayat-judul"
                  nomor={String(BAGIAN.length + 1).padStart(2, "0")}
                  label="Versi"
                  judul="Riwayat perubahan"
                />
                <ol className="mt-5 max-w-2xl divide-y divide-border border-y border-border">
                  <li className="grid gap-2 py-4 sm:grid-cols-[8.5rem_1fr] sm:gap-6">
                    <p className="font-mono text-xs font-medium leading-5 tabular-nums text-gold-foreground">
                      {BERLAKU_SEJAK}
                    </p>
                    <p className="text-sm leading-6 text-muted-foreground">
                      Retensi otomatis untuk isi pesan WhatsApp (
                      {RETENSI_LOG_WA_BATAS.min} sampai{" "}
                      {RETENSI_LOG_WA_BATAS.maks} hari, bawaan{" "}
                      {RETENSI_BAWAAN.logWaHari}) dan jejak audit (
                      {RETENSI_AUDIT_BATAS.min} sampai{" "}
                      {RETENSI_AUDIT_BATAS.maks} hari, bawaan{" "}
                      {RETENSI_BAWAAN.auditHari}); salinan data dan penghapusan
                      akun mandiri di dashboard.
                    </p>
                  </li>
                  <li className="grid gap-2 py-4 sm:grid-cols-[8.5rem_1fr] sm:gap-6">
                    <p className="font-mono text-xs font-medium leading-5 tabular-nums text-gold-foreground">
                      19 Oktober 2026
                    </p>
                    <p className="text-sm leading-6 text-muted-foreground">
                      Halaman ini pertama diterbitkan bersama bagian data
                      pribadi pada Syarat &amp; Ketentuan.
                    </p>
                  </li>
                </ol>
              </section>

              <section
                id="kontak"
                aria-labelledby="kontak-judul"
                className="scroll-mt-8"
              >
                <JudulBagian
                  id="kontak-judul"
                  nomor={String(BAGIAN.length + 2).padStart(2, "0")}
                  label="Kontak"
                  judul="Hubungi kami"
                />
                <div className="mt-5 max-w-2xl border-y border-border bg-secondary px-4 py-5 sm:px-6">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <p className="max-w-xl text-sm leading-6 text-muted-foreground">
                      Pertanyaan tentang data pribadi, permintaan salinan manual,
                      atau keberatan dapat dikirim lewat helpdesk di dashboard
                      atau WhatsApp layanan.
                    </p>
                    <Button
                      asChild
                      variant="outline"
                      className="min-h-11 shrink-0 bg-card"
                    >
                      <a
                        href={urlChatCs(
                          "Halo PINDAI, saya ingin bertanya soal data pribadi saya.",
                        )}
                      >
                        <IkonWhatsapp className="mr-2 size-4" />
                        Chat WhatsApp layanan
                      </a>
                    </Button>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
      </main>
      <InfoFooter />
    </div>
  );
}

export default function Privasi() {
  return <PrivasiView />;
}
