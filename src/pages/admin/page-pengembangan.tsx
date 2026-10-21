"use client";

import type { ReactNode } from "react";

/**
 * Peta sistem PINDAI — dokumentasi internal untuk admin.
 *
 * Halaman ini hanya membaca: tidak ada query, mutation, atau state. Isinya
 * sengaja datar (array di atas) supaya menambah modul atau aturan baru cukup
 * menambah satu baris, bukan menyunting JSX berulang.
 */

/** Satu baris dokumentasi: judul pendek + penjelasan. */
type Baris = { judul: string; isi: string };

/** Satu kelompok modul admin beserta isinya. */
type Kelompok = { judul: string; modul: readonly string[] };

const RINGKASAN = [
  { angka: "16", label: "halaman publik" },
  { angka: "6", label: "tab peminjam" },
  { angka: "26", label: "modul admin" },
  { angka: "3", label: "produk pembiayaan" },
] as const;

const HALAMAN_PUBLIK: readonly { rute: string; isi: string }[] = [
  { rute: "/", isi: "Beranda: hero, layanan, dan pintu masuk pengajuan." },
  { rute: "/biaya", isi: "Rincian bunga, potongan, dan biaya." },
  { rute: "/cara-kerja", isi: "Alur layanan dari pengajuan sampai pelunasan." },
  { rute: "/layanan/pinjaman-tunai", isi: "Penjelasan pinjaman tunai harian." },
  { rute: "/layanan/gadai", isi: "Penjelasan gadai barang jaminan." },
  { rute: "/layanan/kredit-barang", isi: "Penjelasan kredit barang bulanan." },
  { rute: "/keamanan", isi: "Cara data dan verifikasi identitas dijaga." },
  { rute: "/faq", isi: "Pertanyaan yang paling sering masuk." },
  { rute: "/aplikasi", isi: "Unduh APK, versi, dan langkah pemasangan." },
  { rute: "/auth", isi: "Masuk dan daftar lewat OTP WhatsApp atau Google." },
  { rute: "/akses-bersama", isi: "Pintu lihat-saja dengan kode akses bersama." },
  { rute: "/syarat-ketentuan", isi: "Syarat dan ketentuan layanan." },
  { rute: "/verifikasi-kontrak/:kode", isi: "Periksa keaslian kontrak lewat hash." },
  { rute: "/cek-status/:token", isi: "Kwitansi digital dari tautan WhatsApp." },
  { rute: "/penyedia-dana", isi: "Ruang penyedia dana, perlu akun." },
  { rute: "/promo", isi: "Poster dan aset Android, khusus admin." },
];

const TAB_PEMINJAM: readonly Baris[] = [
  { judul: "Ringkasan", isi: "Tagihan terdekat, sisa kewajiban, dan pintasan aksi." },
  { judul: "Cicilan", isi: "Jadwal angsuran, sisa hari, denda berjalan, unggah bukti transfer." },
  { judul: "Ajukan Pinjaman", isi: "Formulir harian atau bulanan, gadai, kredit barang, dan klaim pinjaman lama." },
  { judul: "Catatan Pinjaman", isi: "Riwayat pinjaman beserta status dan kontrak digitalnya." },
  { judul: "Profil & Rekening", isi: "Data diri, rekening pencairan, dan preferensi notifikasi." },
  { judul: "Status KYC", isi: "Tahapan verifikasi identitas dan perbaikan yang diminta admin." },
];

const MODUL_ADMIN: readonly Kelompok[] = [
  {
    judul: "Operasional",
    modul: [
      "Ringkasan (meja kerja hari ini)",
      "Pengajuan Pinjaman",
      "Pengajuan Gadai",
      "Pengajuan Kredit Barang",
      "Verifikasi KYC",
      "Pinjaman siap disalurkan",
      "Doorprize & Antrean Dana",
      "Rekonsiliasi Angsuran",
      "Plafon Nasabah",
      "Nasabah & Pendana",
    ],
  },
  {
    judul: "Pemantauan",
    modul: [
      "Peta lokasi nasabah",
      "Jatuh Tempo & restrukturisasi",
      "Kalkulator Lelang Jaminan",
      "Catatan Internal & Kesehatan Sistem",
    ],
  },
  {
    judul: "Konten",
    modul: [
      "Template Website",
      "Konten Beranda",
      "Banner & Pengumuman",
      "Promo Pinjaman",
      "WhatsApp",
      "Aplikasi Android",
    ],
  },
  {
    judul: "Sistem",
    modul: [
      "Pengaturan Parameter Bisnis",
      "Backup & Snapshot Database",
      "Peta Sistem & Logika Bisnis",
    ],
  },
  {
    judul: "Keamanan & audit",
    modul: [
      "Audit Trail",
      "Session & Keamanan Login",
      "Kill Switch Darurat",
    ],
  },
];

const LOGIKA: readonly { judul: string; isi: string; rujukan: string }[] = [
  {
    judul: "Batas pinjaman tunai",
    isi: "Pokok Rp100.000 sampai Rp1.000.000. Tenor resmi 7, 14, atau 28 hari. Kombinasi di luar matriks ditolak server, bukan sekadar disembunyikan di layar.",
    rujukan: "src/lib/loan.ts",
  },
  {
    judul: "Bunga harian per tier pokok",
    isi: "Bunga flat dari pokok: di bawah Rp500.000 tarifnya 30/35/40%, Rp500.000–999.999 tarifnya 28/32/35%, dan tepat Rp1.000.000 tarifnya 26/28/30% untuk tenor 7/14/28 hari.",
    rujukan: "src/lib/loan.ts",
  },
  {
    judul: "Bunga khusus per nasabah",
    isi: "Bawaan 30% dari Pengaturan Parameter Bisnis. Override admin (0–100%) menang atas default dan disimpan sebagai snapshot di pinjaman, jadi pinjaman lama tidak ikut berubah saat tarif global diubah.",
    rujukan: "src/lib/bunga.ts",
  },
  {
    judul: "Potongan di muka",
    isi: "Biaya admin 2% dan platform 0% dipotong dari pokok, sehingga dana diterima peminjam 98%. Bunga tidak ikut dipotong di muka, melainkan masuk total kewajiban.",
    rujukan: "src/lib/loan.ts",
  },
  {
    judul: "Skema bulanan & kredit barang",
    isi: "Tenor 1, 3, atau 6 bulan. Margin flat 30%, 25%, dan 20% per bulan dari pokok penuh. Biaya 2% dipotong di muka, ditambah biaya layanan 2% dari nominal cicilan setiap bulan. Angsuran pokok dibagi rata dan bulan terakhir menyerap sisa pembulatan.",
    rujukan: "src/lib/bulanan.ts",
  },
  {
    judul: "Plafon per nasabah",
    isi: "Nasabah baru dibatasi Rp500.000. Satu pelunasan tepat waktu membuka Rp1.000.000. Keterlambatan tidak menaikkan plafon, dan override admin selalu menang atas hasil perilaku.",
    rujukan: "src/lib/plafon.ts",
  },
  {
    judul: "Denda keterlambatan",
    isi: "2% per hari dari pokok angsuran yang telat, dibatasi 100% atau setara 50 hari. Dasarnya angsuran yang terlambat, bukan pokok pinjaman penuh, supaya denda tidak menumpuk di akhir tenor.",
    rujukan: "src/lib/angsuran.ts",
  },
  {
    judul: "Status pinjaman",
    isi: "Lima status kanonik: ditinjau, didanai, ditolak, dibatalkan, lunas. Lunas dan dibatalkan terkunci. Ejaan lama diajukan, sedang_direview, dan disetujui dibaca sebagai ditinjau.",
    rujukan: "src/lib/statusPinjaman.ts",
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
    judul: "Dana penyedia",
    isi: "Setiap pinjaman yang cair dialokasikan ke rekening penyedia dana dan dicatat per pinjaman. Imbal hasil dihitung dari porsi dana, sedangkan transfer pendana direkonsiliasi terpisah.",
    rujukan: "src/convex/alokasiDana.ts, laporanTransferPendana.ts",
  },
  {
    judul: "Kill switch",
    isi: "Memblokir seluruh pengajuan baru. Eksekusi wajib mengetik NONAKTIFKAN dan mengisi alasan, dan jejaknya masuk audit trail.",
    rujukan: "src/convex/system.ts",
  },
];

const ALUR_PEMINJAM: readonly string[] = [
  "Daftar atau masuk dengan OTP WhatsApp maupun akun Google.",
  "Lengkapi data diri, rekening pencairan, dan dokumen KYC: KTP, selfie-KTP, serta bukti penghasilan.",
  "Tunggu verifikasi KYC. Bila diminta perbaikan, unggah ulang dari tab Status KYC.",
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
  "Tangani jatuh tempo: kirim pengingat, susun somasi, atau setujui restrukturisasi.",
  "Atur plafon, bunga khusus, dan catatan risiko per nasabah bila perilakunya berbeda dari default.",
  "Rekonsiliasi transfer penyedia dana dan pantau kesehatan portofolio di Catatan Internal.",
  "Kelola konten publik, template WhatsApp, versi aplikasi Android, serta backup dan kill switch.",
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
        <p className="font-mono text-[11px] tracking-[0.18em] text-emerald-700">
          {nomor}
        </p>
        <h2 className="text-lg font-semibold tracking-tight text-slate-900">{judul}</h2>
        <p className="max-w-2xl text-sm leading-6 text-slate-600">{keterangan}</p>
      </div>
      {children}
    </section>
  );
}

/** Baris rute: kode rute di kiri, kegunaannya di kanan. */
function BarisRute({ rute, isi }: { rute: string; isi: string }) {
  return (
    <div className="flex flex-col gap-1 border-b border-slate-200 py-2.5 last:border-b-0 sm:flex-row sm:items-baseline sm:gap-4">
      <code className="w-fit shrink-0 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[12px] text-slate-800">
        {rute}
      </code>
      <p className="text-sm leading-6 text-slate-600">{isi}</p>
    </div>
  );
}

export function PagePengembangan() {
  return (
    <div className="mx-auto max-w-5xl space-y-10 pb-24">
      <header className="space-y-5 border-b border-slate-200 pb-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-emerald-700/25 bg-emerald-700/[0.06] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-800">
            Khusus admin
          </span>
          <span className="text-xs text-slate-500">
            Dokumentasi internal, tidak tampil di halaman publik
          </span>
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            Peta sistem &amp; logika bisnis PINDAI
          </h1>
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
        judul="Halaman publik"
        keterangan="Bisa dibuka tanpa akun. Dua di antaranya memakai token: verifikasi kontrak dan kwitansi dari tautan WhatsApp."
      >
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-1">
          {HALAMAN_PUBLIK.map((halaman) => (
            <BarisRute key={halaman.rute} rute={halaman.rute} isi={halaman.isi} />
          ))}
        </div>
      </Bagian>

      <Bagian
        nomor="02"
        judul="Ruang peminjam"
        keterangan="Enam tab di dasbor peminjam setelah masuk dengan akun terverifikasi."
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
                <span className="font-mono text-[11px] text-emerald-700">
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
        keterangan="Dua puluh enam modul, dikelompokkan seperti sidebar. Beberapa di antaranya membawa lencana angka untuk pekerjaan yang benar-benar menunggu."
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
        keterangan="Angka di bawah adalah nilai yang berlaku sekarang, bukan contoh. Mengubahnya berarti mengubah Pengaturan Parameter Bisnis, bukan halaman ini."
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
                <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border border-emerald-700/30 font-mono text-[11px] text-emerald-800">
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
                <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border border-emerald-700/30 font-mono text-[11px] text-emerald-800">
                  {i + 1}
                </span>
                <p className="text-sm leading-6 text-slate-600">{langkah}</p>
              </li>
            ))}
          </ol>
        </Bagian>
      </div>

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
          Kalau sebuah aturan berubah di kode, perbarui halaman ini pada commit yang
          sama supaya admin tidak membaca angka lama.
        </p>
      </section>
    </div>
  );
}
