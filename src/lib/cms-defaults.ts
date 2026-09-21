/**
 * Teks default CMS landing — satu sumber untuk client (nilai awal editor
 * & fallback render) selaras dengan fallback server di announcements.ts.
 */
export const CMS_DEFAULTS = {
  bar: {
    teks: "Pengajuan pinjaman tunai & gadai digital kini lebih cepat — dilayani dari rumah, ditinjau tim sesegera mungkin. Daftar gratis dan ajukan hari ini.",
    tautan: "/auth",
  },
  popup: {
    judul: "Ajukan Sekarang, Cair Tanpa Antre",
    isi: "Buat pengajuan pinjaman tunai atau gadai digital langsung dari rumah — cukup beberapa menit. Tim kami menindak cepat, barang gadai tersimpan aman di brankas custody, dan pengingat jatuh tempo berjalan otomatis supaya Anda tidak pernah terlambat.",
    cta: "Mengerti, coba simulasi pinjaman saya",
  },
  float: {
    judul: "Promo pembukaan",
    isi: "Pengajuan dinilai lebih cepat minggu ini — kirim pengajuan Anda dan tim kami segera menindaklanjuti.",
    cta: "Mulai pengajuan",
  },
  hero: {
    badge: "Platform Pendanaan & Penggadaian Terpercaya",
    judul1: "Pinjam & Gadai Digital",
    judul2: "Transparan",
    sub: "Ajukan pinjaman tunai atau gadaikan barang dengan potongan di muka yang dinyatakan terbuka: 5% — sisanya 95% dana bersih langsung ke rekening Anda. Didanai oleh Pendana terverifikasi, dicatat dalam jurnal yang dapat diaudit.",
    cta1: "Ajukan Pinjaman",
    cta2: "Mulai Gadai Digital",
  },
  chips: {
    chip1: { label: "Dana bersih", nilai: "95% selalu" },
    chip2: { label: "Potongan di muka", nilai: "5% terbuka" },
  },
  layanan: {
    judul: "Dua layanan, satu standar transparansi",
    sub: "Pilih jalur yang paling sesuai — keduanya memakai mesin perhitungan dan jurnal audit yang sama.",
    pinjamanJudul: "Pinjaman Tunai Digital",
    pinjamanIsi:
      "Ajukan tanpa agunan dengan tenor 30/60/90 hari. Setelah disetujui tim, dana bersih 95% dari pokok langsung ke rekening Anda. Lunasi 130% (pokok + Bunga 30% — Imbal Hasil Pendana).",
    pinjamanCta: "Ajukan sekarang",
    gadaiJudul: "Gadai Digital",
    gadaiIsi:
      "Elektronik, kendaraan, perhiasan, hingga properti. Taksiran resmi oleh petugas berwenang dengan live location wajib, barang tersimpan di Brankas Custody sampai Anda lunasi.",
    gadaiCta: "Gadaikan barang",
  },
} as const;
