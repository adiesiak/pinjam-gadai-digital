/**
 * Teks default CMS landing — satu sumber untuk client (nilai awal editor
 * & fallback render) selaras dengan fallback server di announcements.ts.
 */
export const CMS_DEFAULTS = {
  bar: {
    teks: "Ajukan pinjaman tunai atau gadai digital dari rumah. Daftar gratis dan mulai hari ini.",
    tautan: "/auth",
  },
  popup: {
    judul: "Ajukan dari Rumah",
    isi: "Buat pengajuan pinjaman atau gadai dalam beberapa menit. Barang gadai tersimpan di brankas custody, pengingat jatuh tempo berjalan otomatis.",
    cta: "Coba simulasi",
  },
  float: {
    judul: "Pengajuan cepat",
    isi: "Tim menindaklanjuti pengajuan Anda secepat mungkin.",
    cta: "Mulai pengajuan",
  },
  hero: {
    badge: "Pinjaman & gadai digital — didanai Pendana terverifikasi",
    judul1: "Pinjam & Gadai Digital",
    judul2: "Transparan",
    sub: "Pinjaman tanpa agunan atau gadai barang dengan angka terbuka sejak awal: potongan 5%, dana bersih 95%.",
    cta1: "Ajukan Pinjaman",
    cta2: "Gadaikan Barang",
  },
  chips: {
    chip1: { label: "Dana bersih", nilai: "95% selalu" },
    chip2: { label: "Potongan di muka", nilai: "5% terbuka" },
  },
  layanan: {
    judul: "Dua layanan, satu standar",
    sub: "Keduanya memakai mesin perhitungan dan jurnal audit yang sama.",
    pinjamanJudul: "Pinjaman Tunai Digital",
    pinjamanIsi:
      "Tanpa agunan, tenor 30/60/90 hari. Dana bersih 95% dari pokok langsung ke rekening. Pelunasan 130% (pokok + Bunga 30% — hak Pendana).",
    pinjamanCta: "Ajukan sekarang",
    gadaiJudul: "Gadai Digital",
    gadaiIsi:
      "Elektronik, kendaraan, perhiasan, hingga properti. Taksiran resmi petugas, potongan muka 1%, dana bersih 99%. Sewa modal 5–10% per 30 hari dari sisa pokok terbaru. Sisa pokok Rp0 → barang siap diambil dari Brankas Custody.",
    gadaiCta: "Gadaikan barang",
  },
} as const;
