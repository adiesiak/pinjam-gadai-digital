"use client";

import { ViteLogo } from "@/components/ui/vite-logo";
import { Button } from "@/components/ui/button";

export function PagePengembangan() {
  return (
    <section className="mx-auto max-w-3xl space-y-10 pb-24">
      <header className="space-y-3">
        <div className="flex items-center gap-2">
          <ViteLogo className="size-6" />
          <h1 className="text-2xl font-bold tracking-tight">Halaman Pengembangan</h1>
          <Button variant="outline" size="sm" asChild>
            <a
              href="/"
              className="gap-2"
            >
              Kembali ke depan
              <span aria-hidden="true">→</span>
            </a>
          </Button>
        </div>
        <p className="text-muted-foreground">
          Halaman ini berisi ringkasan halaman, fitur, logic bisnis, alur peminjam, dan alur admin yang sudah tersedia di kode.
        </p>
      </header>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Daftar halaman yang sudah ada</h2>
        <ul className="list-inside divide-y divide-slate-200 rounded-xl border bg-card text-sm">
          <li className="px-3 py-2"><code className="text-navy">/</code> — Halaman publik utama: hero, fitur singkat, dan panggilan ke proses pengajuan.</li>
          <li className="px-3 py-2"><code className="text-navy">/auth</code> — Halaman masuk dan daftar, termasuk alur OTP via WhatsApp dan Google.</li>
          <li className="px-3 py-2"><code className="text-navy">/dashboard</code> — Dasbor peminjam setelah masuk.</li>
          <li className="px-3 py-2"><code className="text-navy">/admin</code> — Dasbor admin dengan menu operasional terpisah.</li>
          <li className="px-3 py-2"><code className="text-navy">/admin/meja-kerja</code> — Halaman admin untuk antrean pengajuan dan pekerjaan harian.</li>
          <li className="px-3 py-2"><code className="text-navy">/admin/queue</code> — Halaman antrean pengajuan dan pekerjaan yang tertunda.</li>
          <li className="px-3 py-2"><code className="text-navy">/PenyediaDana</code> — Halaman publik penyedia dana.</li>
          <li className="px-3 py-2"><code className="text-navy">/SyaratKetentuan</code> — Halaman syarat dan ketentuan.</li>
          <li className="px-3 py-2"><code className="text-navy">/Promo</code> — Halaman promosi.</li>
          <li className="px-3 py-2"><code className="text-navy">/UnduhAplikasi</code> — Halaman unduh aplikasi.</li>
          <li className="px-3 py-2"><code className="text-navy">/AksesBersama</code> — Halaman akses bersama.</li>
          <li className="px-3 py-2"><code className="text-navy">/NotFound</code> — Halaman tidak ditemukan.</li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Fitur yang sudah ada</h2>
        <ul className="list-inside divide-y divide-slate-200 rounded-xl border bg-card text-sm">
          <li className="px-3 py-2">
            <strong>Pengajuan pinjaman digital.</strong> Pengajuan wajib dilengkapi NIK, nomor WhatsApp, penghasilan, sumber penghasilan, KTP, selfie-KTP, slip gaji, dan lokasi GPS. Ada gerbang anti-pengiriman palsu dan kunci idempotensi.
          </li>
          <li className="px-3 py-2">
            <strong>Skema pinjaman dua macam.</strong> Harian dengan 130% flat untuk tenor pendek, dan bulanan dengan tenor 1, 3, atau 6 bulan untuk pinjaman di luar plafon harian.
          </li>
          <li className="px-3 py-2">
            <strong>Plafon nasabah.</strong> Ada plafon global dan plafon per nasabah, serta penyesuaian tersedia dari riwayat pinjaman aktif.
          </li>
          <li className="px-3 py-2">
            <strong>Penilaian KYC dan lokasi.</strong> KYC wajib diverifikasi sebelum pengajuan bisa masuk, dan lokasi pengajuan harus cocok dengan perangkat.
          </li>
          <li className="px-3 py-2">
            <strong>Rekayasa dana dan bagi hasil.</strong> Pinjaman bisa menggunakan rekening payday dari penyedia dana, dan ada mekanisme bagi hasil antara pokok pinjaman dan rekening pendana.
          </li>
          <li className="px-3 py-2">
            <strong>Cicilan dan pembayaran angsuran.</strong> Daftar angsuran, tagihan berikutnya, denda keterlambatan, dan kuitansi pembayaran.
          </li>
          <li className="px-3 py-2">
            <strong>Pembayaran manual dan verifikasi bukti transfer.</strong> Peminjam bisa kirim bukti transfer, dan admin bisa verifikasi serta mencocokkan dengan mutasi.
          </li>
          <li className="px-3 py-2">
            <strong>Pawn/ gadai.</strong> Fitur gadai dengan review barang, status pelepasan, dan dialog detail internal.
          </li>
          <li className="px-3 py-2">
            <strong>Kredit barang.</strong> Queue dan peninjauan kredit barang di sisi admin.
          </li>
          <li className="px-3 py-2">
            <strong>Restrukturisasi pinjaman.</strong> Permohonan restrukturisasi dan penanganan data somasi.
          </li>
          <li className="px-3 py-2">
            <strong>Penyedia dana.</strong> Portofolio, kalkulator imbal hasil, kesehatan portofolio, dan saringan pengajuan.
          </li>
          <li className="px-3 py-2">
            <strong>Pengaturan sistem dan notifikasi.</strong> Panel konfigurasi sistem, pengaturan notifikasi nasabah, dan panel peringatan pembaruan.
          </li>
          <li className="px-3 py-2">
            <strong>CMS dan template publik.</strong> Panel pengelolaan pengumuman, template website, dan pratinjau aktif.
          </li>
          <li className="px-3 py-2">
            <strong>Manajemen aplikasi Android.</strong> Panel versi aplikasi dan pembaruan.
          </li>
          <li className="px-3 py-2">
            <strong>Keamanan dan audit.</strong> Panel kontrol akses, audit trail, log keamanan, dan kill switch.
          </li>
          <li className="px-3 py-2">
            <strong>Rekonsiliasi dan pembayaran.</strong> Panel rekonsiliasi pembayaran pinjaman, rekonsiliasi angsuran, dan pencatatan transfer pendana.
          </li>
          <li className="px-3 py-2">
            <strong>Penagihan dan somasi.</strong> Panel penagihan, surat somasi, dan panel kesehatan BI.
          </li>
          <li className="px-3 py-2">
            <strong>Notifikasi dan WhatsApp.</strong> Panel pengiriman pesan, template pesan, dan pengingat penagasan.
          </li>
          <li className="px-3 py-2">
            <strong>Laporan dan analitik.</strong> Ringkasan analitik, kesehatan portofolio pendana, dan laporan transfer pendana.
          </li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Logic bisnis utama</h2>
        <ul className="list-inside divide-y divide-slate-200 rounded-xl border bg-card text-sm">
          <li className="px-3 py-2">
            <strong>Kalkulasi pinjaman.</strong> Quote harian dan bulanan, termasuk potongan di muka seperti biaya admin dan biaya layanan, dan perhitungan denda keterlambatan.
          </li>
          <li className="px-3 py-2">
            <strong>Batas dan plafon.</strong> Pokok pinjaman harus di dalam plafon nasabah; ada pemeriksaan tersedia per pengajuan berikutnya.
          </li>
          <li className="px-3 py-2">
            <strong>Anti-spam dan anti-pengiriman palsu.</strong> Gerbang formulir, jebakan, dan batas kecepatan pengiriman.
          </li>
          <li className="px-3 py-2">
            <strong>Idempotensi pengajuan.</strong> Kunci idempotensi mencegah pengajuan ganda karena retry jaringan.
          </li>
          <li className="px-3 py-2">
            <strong>Pembagian hasil rekening pendana.</strong> Logika bagi hasil antara pokok pinjaman dan rekening pendana.
          </li>
          <li className="px-3 py-2">
            <strong>Verifikasi bukti transfer.</strong> Logika cocokkan bukti transfer dengan catatan pembayaran dan mutasi.
          </li>
          <li className="px-3 py-2">
            <strong>Penjadwalan dan denda.</strong> Hitung jatuh tempo, sisa hari, hari terlambat, dan denda yang berlaku.
          </li>
          <li className="px-3 py-2">
            <strong>Manajemen status pinjaman.</strong> Status seperti diajukan, verifikasi, didanai, lunas, dan dibatalkan.
          </li>
          <li className="px-3 py-2">
            <strong>Proses restrukturisasi dan somasi.</strong> Alur permohonan restrukturisasi dan penagihan.
          </li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Alur peminjam</h2>
        <ul className="list-inside divide-y divide-slate-200 rounded-xl border bg-card text-sm">
          <li className="px-3 py-2">
            Mendaftar atau masuk dengan WhatsApp OTP atau Google.
          </li>
          <li className="px-3 py-2">
            Melengkapi data diri dan dokumen KYC.
          </li>
          <li className="px-3 py-2">
            Meminta verifikasi KYC.
          </li>
          <li className="px-3 py-2">
            Setelah KYC diverifikasi, mengajukan pinjaman dengan data dan dokumen yang dibutuhkan.
          </li>
          <li className="px-3 py-2">
            Melihat rincian pinjaman dan status pengajuan.
          </li>
          <li className="px-3 py-2">
            Saat pinjaman dicairkan, melihat jadwal angsuran dan tagihan berikutnya.
          </li>
          <li className="px-3 py-2">
            Membayar melalui transfer manual dan mengunggah bukti transfer.
          </li>
          <li className="px-3 py-2">
            Melihat kuitansi pembayaran setelah admin mencocokkan bukti.
          </li>
          <li className="px-3 py-2">
            Bila perlu, mengajukan restrukturisasi atau menanyakan status ke CS.
          </li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Alur admin</h2>
        <ul className="list-inside divide-y divide-slate-200 rounded-xl border bg-card text-sm">
          <li className="px-3 py-2">
            Masuk ke area admin dengan autentikasi khusus admin.
          </li>
          <li className="px-3 py-2">
            Melihat antrean pengajuan di meja kerja atau halaman antrean.
          </li>
          <li className="px-3 py-2">
            Meninjau KYC dan dokumen nasabah.
          </li>
          <li className="px-3 py-2">
            Mencegat pengajuan yang harus diproses manual.
          </li>
          <li className="px-3 py-2">
            Membaca rincian pinjaman, rekening pendana, dan catatan internal.
          </li>
          <li className="px-3 py-2">
            Memverifikasi bukti transfer dan mencatat pembayaran.
          </li>
          <li className="px-3 py-2">
            Menyusun anggaran rekening pendana dan mencatat transfer pendana.
          </li>
          <li className="px-3 py-2">
            Menangani permohonan restrukturisasi dan data somasi.
          </li>
          <li className="px-3 py-2">
            Mengelola penagihan dan surat somasi.
          </li>
          <li className="px-3 py-2">
            Mengelola pengumuman, template, dan pengaturan sistem.
          </li>
          <li className="px-3 py-2">
            Melihat analitik, portofolio pendana, dan laporan transfer.
          </li>
        </ul>
      </section>

      <section className="space-y-3 text-sm text-muted-foreground">
        <p>Halaman ini masih dalam pengerjaan. Content akan diperbarui seiring fitur yang ada di kode.</p>
        <p>Referensi cepat: <code className="text-navy">src/pages/dashboard/</code> untuk halaman peminjam, <code className="text-navy">src/pages/admin/</code> dan <code className="text-navy">src/components/admin/</code> untuk halaman dan komponen admin, serta <code className="text-navy">src/convex/</code> dan <code className="text-navy">src/lib/</code> untuk logic di sisi server dan utilitas.</p>
      </section>
    </section>
  );
}
