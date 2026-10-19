/** Run: bun src/components/admin/RestrukturisasiPinjaman.render.test.tsx */
import { renderToStaticMarkup } from "react-dom/server";

import {
  BagianRestrukturisasi,
  type RingkasanRestrukturisasi,
} from "./RestrukturisasiPinjaman";

let passed = 0;
let failed = 0;
function ok(syarat: boolean, label: string): void {
  if (syarat) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${label}`);
  }
}
function ada(html: string, teks: string, label: string): void {
  ok(html.includes(teks), `${label} (memuat "${teks}")`);
}
function tidakAda(html: string, teks: string, label: string): void {
  ok(!html.includes(teks), `${label} (tidak memuat "${teks}")`);
}

const DASAR: RingkasanRestrukturisasi = {
  boleh: true,
  alasan: null,
  bolehCicilan: true,
  alasanCicilan: null,
  tenorHari: 30,
  tenorBulan: null,
  totalKewajiban: 1_300_000,
  didanaiPada: Date.UTC(2026, 9, 1),
  jatuhTempoPada: Date.UTC(2026, 9, 31),
  hariTerlambat: 4,
  menunggu: null,
  riwayat: [],
};

const tanpaAksi = () => {};

function gambar(
  props: Partial<Parameters<typeof BagianRestrukturisasi>[0]> = {},
): string {
  return renderToStaticMarkup(
    <BagianRestrukturisasi
      hasil={DASAR}
      tambahan={14}
      alasan=""
      catatan=""
      sibuk={false}
      kabar={null}
      galat={null}
      onUbahTambahan={tanpaAksi}
      onUbahAlasan={tanpaAksi}
      onUbahCatatan={tanpaAksi}
      onAjukan={tanpaAksi}
      onPutuskan={tanpaAksi}
      {...props}
    />,
  );
}

const memuat = gambar({ hasil: undefined });
ada(memuat, "Memuat data perpanjangan", "keadaan memuat");

const boleh = gambar();
ada(boleh, "Tenor saat ini 30 hari", "tenor sekarang");
ada(boleh, "terlambat 4 hari", "keterlambatan");
ada(boleh, "Tenor baru menjadi", "simulasi tenor baru");
ada(boleh, "44 hari", "tenor baru dari 30 + 14");
ada(boleh, "Pokok, bunga, dan total kewajiban tidak berubah", "batas perubahan");
ada(boleh, "Ajukan perpanjangan", "tombol ajukan");
ada(boleh, 'disabled=""', "tombol terkunci saat alasan kosong");

const denganAlasan = gambar({ alasan: "Nasabah kehilangan penghasilan bulan ini." });
tidakAda(denganAlasan, 'disabled=""', "tombol aktif saat alasan cukup");

const ditolak = gambar({
  hasil: {
    ...DASAR,
    boleh: false,
    alasan: "Perpanjangan baru tersedia untuk pinjaman skema harian.",
  },
});
ada(ditolak, "pinjaman skema harian", "alasan tidak bisa diperpanjang");
tidakAda(ditolak, "Ajukan perpanjangan", "tanpa tombol saat tidak boleh");

const bulanan = gambar({ hasil: { ...DASAR, boleh: false, tenorBulan: 3, alasan: null } });
ada(bulanan, "skema bulanan", "penanda skema bulanan");

const menunggu = gambar({
  hasil: {
    ...DASAR,
    menunggu: {
      _id: "r1" as never,
      jenis: "perpanjangan_tenor",
      tambahanHari: 30,
      tenorBaruHari: 60,
      usulanCicilan: null,
      alasan: "Penghasilan turun sementara.",
      diajukanOlehLabel: "admin@pindai.test",
      diajukanOlehNasabah: false,
      dibuatPada: Date.UTC(2026, 9, 19),
    },
  },
});
ada(menunggu, "Usulan perpanjangan: 60 hari (+30)", "usulan menggantung");
ada(menunggu, "Setujui", "tombol setujui");
ada(menunggu, "Tolak", "tombol tolak");
tidakAda(menunggu, "Ajukan perpanjangan", "tanpa form saat ada usulan");

const riwayat = gambar({
  hasil: {
    ...DASAR,
    riwayat: [
      {
        _id: "r2" as never,
        jenis: "perpanjangan_tenor",
        status: "disetujui",
        tenorLamaHari: 30,
        tenorBaruHari: 44,
        tambahanHari: 14,
        usulanCicilan: null,
        alasan: "Alasan yang cukup panjang.",
        diajukanOlehLabel: "admin@pindai.test",
        diajukanOlehNasabah: false,
        dibuatPada: Date.UTC(2026, 9, 10),
        diputuskanOlehLabel: "admin@pindai.test",
        diputuskanPada: Date.UTC(2026, 9, 11),
        catatanKeputusan: "Disetujui penyelia.",
      },
    ],
  },
});
ada(riwayat, "Disetujui", "status riwayat");
ada(riwayat, "30 → 44 hari", "perubahan tenor di riwayat");
ada(riwayat, "Disetujui penyelia.", "catatan keputusan");

console.log(`RestrukturisasiPinjaman: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
