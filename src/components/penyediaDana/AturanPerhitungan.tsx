import type { ReactNode } from "react";

import { BagianLipat } from "@/components/penyediaDana/bagian-folio";
import { bagiKolom } from "@/components/penyediaDana/folio";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { DEFAULT_TENOR_HARI, persenBungaHarian } from "@/lib/loan";
import { formatRupiah, percentOf } from "@/lib/money";

/**
 * Satu aturan: judul singkat + penjelasan yang boleh memuat beberapa paragraf.
 * Nomornya dipakai sebagai penanda urutan baca, bukan sebagai bagian judul.
 */
type Aturan = { nomor: number; judul: string; isi: ReactNode };

/**
 * Panel "Aturan perhitungan": satu tempat untuk semua cara angka di ruang ini
 * dihitung.
 *
 * Kenapa bentuknya begini: dulu penjelasan istilah ("dibukukan", "perkiraan",
 * "biaya platform (layanan)") ditempel satu per satu sebagai ikon `?` di
 * kartu-kartu angka, dan callout "untuk apa biaya platform dipakai" berdiri sebagai
 * kotak sendiri di tengah halaman. Akibatnya istilah yang sama dijelaskan dari
 * beberapa tempat dengan kalimat yang berbeda-beda, dan penjelasan kebijakan
 * mendesak angka ke bawah lipatan. Sekarang aturannya dikumpulkan sekali di
 * sini, terbuka satu per satu saat pembaca benar-benar ingin tahu, dan kartu
 * angkanya kembali ringkas tanpa ikon bantuan berulang.
 *
 * Tarif harian dari matriks tenor di `lib/loan`; tarif bulanan dari Pengaturan
 * Sistem, jadi penjelasan ini tidak menjanjikan satu angka untuk semua pinjaman.
 *
 * Bentuk lipatan bertingkat (dan bukan dinding teks): bagiannya sendiri tertutup
 * secara bawaan dengan tarif yang berlaku tetap tercetak di kepalanya, dan di
 * dalamnya semua judul aturan tampil sekaligus sehingga pembaca bisa langsung
 * menemukan aturan yang dicarinya. Di layar lebar daftar itu dipasang tiga kolom
 * supaya tujuh judulnya tidak menghabiskan satu layar sebelum bagian berikutnya
 * terbaca.
 *
 * Murni presentasional, tanpa Convex, supaya bisa dirender langsung oleh uji
 * markup (`AturanPerhitungan.render.test.tsx`).
 */
export function AturanPerhitungan({
  persenBunga,
  persenPotonganAdmin,
  bukaAwal = [],
}: {
  /** Tarif bulanan bawaan dari Pengaturan Sistem; tarif harian mengikuti matriks. */
  persenBunga: number;
  /** Biaya platform (layanan) dari uang yang kembali, dari Pengaturan Sistem. */
  persenPotonganAdmin: number;
  /**
   * Nomor aturan yang dibuka sejak awal. Dipakai uji markup: isi accordion yang
   * tertutup tidak dirender saat render statis, jadi tanpa pintu ini isi
   * aturannya tidak bisa diverifikasi lewat HTML.
   */
  bukaAwal?: readonly number[];
}) {
  // Contoh memakai jalur uang yang sama dengan perhitungan sebenarnya, supaya
  // angka yang dibaca pendana tidak berbeda dari angkanya di tabel.
  const contohPokok = 1_000_000;
  const contohTenor = 28;
  const contohPersen = persenBungaHarian(contohPokok, contohTenor) ?? persenBunga;
  const contohImbal = percentOf(contohPokok, contohPersen);
  const tarifHarian = [
    { batas: "Di bawah Rp500.000", pokok: 300_000, tenor: [7, 14, 28] },
    { batas: "Rp500.000 sampai Rp999.999", pokok: 750_000, tenor: [14, 28] },
    { batas: "Tepat Rp1.000.000", pokok: 1_000_000, tenor: [28] },
  ].map((baris) => {
    const tarif = baris.tenor.map((tenor) => ({
      tenor,
      persen: persenBungaHarian(baris.pokok, tenor),
    }));
    return {
      batas: baris.batas,
      teks: tarif.map(({ tenor, persen }) => `${tenor} hari ${persen}%`).join(" · "),
      nilai: tarif
        .map(({ persen }) => persen)
        .filter((persen): persen is number => persen !== null),
    };
  });
  const semuaTarif = tarifHarian.flatMap((baris) => baris.nilai);
  const tarifTerendah = Math.min(...semuaTarif);
  const tarifTertinggi = Math.max(...semuaTarif);
  const ringkasTarif =
    tarifTerendah === tarifTertinggi
      ? `${tarifTerendah}%`
      : `${tarifTerendah}–${tarifTertinggi}%`;

  const aturan: readonly Aturan[] = [
    {
      nomor: 1,
      judul: "Bunga pinjaman dan Imbal Hasil",
      isi: (
        <>
          <p>
            Bunga pinjaman harian dihitung dari pokok dengan tarif yang mengikuti nominal dan
            tenor, bukan satu tarif untuk semua pinjaman dan bukan bunga per bulan.
          </p>
          <ul className="mt-2 space-y-1.5">
            {tarifHarian.map((baris) => (
              <li key={baris.batas} className="flex flex-wrap gap-x-1.5">
                <span className="font-medium text-slate-800">{baris.batas}:</span>
                <span>{baris.teks}.</span>
              </li>
            ))}
          </ul>
          <p className="mt-2">
            Contoh: pinjaman {formatRupiah(contohPokok)} tenor {contohTenor} hari dikenai bunga{" "}
            <strong>{contohPersen}%</strong>. Total kewajiban peminjam{" "}
            {formatRupiah(contohPokok + contohImbal)}, dan selisihnya {formatRupiah(contohImbal)}{" "}
            adalah Imbal Hasil yang menjadi dasar keuntungan pendana. Skema bulanan memakai tarif
            per bulan yang tercatat pada pinjaman (bawaan Pengaturan Sistem saat ini{" "}
            {persenBunga}%).
          </p>
          <p className="mt-2">
            Karena modelnya <strong>satu pinjaman = satu pendana</strong>, seluruh Imbal Hasil satu
            pinjaman hanya menjadi milik satu pendana. Konsentrasinya juga di situ: seluruh pokok
            pada satu pinjaman tertahan pada satu peminjam.
          </p>
        </>
      ),
    },
    {
      nomor: 2,
      judul: "Biaya platform (layanan)",
      isi: (
        <>
          <p>
            Biaya platform (layanan) adalah <strong>{persenPotonganAdmin}%</strong> dari{" "}
            <strong>uang yang kembali</strong> (pokok + Imbal Hasil), bukan{" "}
            {persenPotonganAdmin}% dari Imbal Hasil saja. Konsekuensinya: pokok kembali utuh,
            sementara keuntungan bersih pendana lebih kecil daripada bunga yang tercatat pada
            pinjaman.
          </p>
          <p className="mt-2">Biaya platform itulah yang dipakai untuk:</p>
          <ul className="mt-1.5 space-y-1.5">
            <li className="flex gap-2">
              <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-primary" />
              <span>Server &amp; operasional PINDAI: biaya sistem, penyimpanan berkas, dan pemantauan lokasi.</span>
            </li>
            <li className="flex gap-2">
              <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-primary" />
              <span>
                Collect / penagihan lapangan untuk pinjaman yang lewat jatuh tempo, supaya Imbal
                Hasil tetap terkejar.
              </span>
            </li>
            <li className="flex gap-2">
              <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-primary" />
              <span>
                Penanganan pinjaman bermasalah: pendampingan dan penyelesaian pinjaman yang tidak
                lancar, termasuk biaya hukum bila diperlukan.
              </span>
            </li>
          </ul>
          <p className="mt-2">
            Biaya platform (layanan) <strong>bukan jaminan</strong>. Dana pendanaan tidak dijamin oleh LPS
            maupun pihak lain, kecuali ada perjanjian tertulis yang menyatakannya, rinciannya ada
            di bagian “Risiko pendanaan”.
          </p>
        </>
      ),
    },
    {
      nomor: 3,
      judul: "Dibukukan (lunas) vs Perkiraan (belum lunas)",
      isi: (
        <>
          <p>
            <strong>Dibukukan (lunas)</strong> berarti pinjamannya sudah lunas di ledger internal,
            sehingga keuntungan pendana atas pinjaman itu sudah final dan menjadi haknya.
          </p>
          <p className="mt-2">
            <strong>Perkiraan (belum lunas)</strong> berarti hitungan atas pinjaman yang masih
            berjalan. Angka itu belum menjadi uang pendana: baru terwujud kalau pinjamannya lunas,
            dan bisa berkurang atau hilang kalau peminjam gagal bayar.
          </p>
          <p className="mt-2">
            <strong>Total keuntungan</strong> adalah jumlah keduanya. Kolom ini ditampilkan apa
            adanya, tetapi jangan dibaca sebagai uang yang sudah masuk sebelum bagian dibukukannya
            terpisah seperti di tabel.
          </p>
        </>
      ),
    },
    {
      nomor: 4,
      judul: "Dana tersalurkan dan masih berjalan",
      isi: (
        <>
          <p>
            <strong>Dana tersalurkan</strong> adalah pokok yang sudah cair ke peminjam: pinjaman
            berjalan ditambah pinjaman yang sudah lunas. Angka ini catatan penyaluran, bukan laba.
          </p>
          <p className="mt-2">
            <strong>Masih berjalan</strong> adalah bagian dari pokok itu yang belum kembali, yaitu
            pokok pada pinjaman yang masih berjalan. Dana ini bisa terlambat kembali atau tidak
            kembali sama sekali.
          </p>
        </>
      ),
    },
    {
      nomor: 5,
      judul: `Tenor dan jatuh tempo (satuan hari)`,
      isi: (
        <>
          <p>
            Pinjaman baru memakai tenor <strong>7, 14, atau 28 hari</strong>, bukan tenor 30 hari
            untuk semua pinjaman. Pilihan tenor mengikuti nominal: di bawah Rp500.000 boleh 7, 14,
            atau 28 hari; Rp500.000 sampai Rp999.999 memakai 14 atau 28 hari; tepat Rp1.000.000
            memakai 28 hari. Jatuh tempo dihitung dari tanggal pendanaan ditambah tenor pinjaman.
          </p>
          <p className="mt-2">
            Angka tenor di tabel adalah tenor pinjaman itu sendiri, jadi pinjaman 7 dan 14 hari
            tidak perlu dibaca sebagai 30 hari. Hanya catatan lama yang tenornya belum tercatat
            yang memakai perkiraan bawaan <strong>{DEFAULT_TENOR_HARI} hari</strong> supaya masih
            ada tanggal untuk menagih. Perkiraan itu ditandai apa adanya, tidak disamarkan sebagai
            tenor yang disepakati.
          </p>
        </>
      ),
    },
    {
      nomor: 6,
      judul: "Transfer keuntungan",
      isi: (
        <>
          <p>
            Kewajiban transfer keuntungan baru muncul saat pinjamannya <strong>lunas</strong>,
            sebelum itu tidak ada uang pendana yang bisa ditransfer. Catatan transfer dibuat oleh
            admin dan menandai bahwa transfernya sudah dikerjakan.
          </p>
          <p className="mt-2">
            Catatan itu <strong>bukan bukti mutasi bank</strong> dan bukan tanda terima. Angka di
            halaman ini seluruhnya catatan internal PINDAI.
          </p>
        </>
      ),
    },
    {
      nomor: 7,
      judul: "Cara membaca kolom dan baris total",
      isi: (
        <>
          <p>
            Semua kolom rekap dihitung dari pinjaman yang tercatat pada alokasi yang barisnya
            ditampilkan, dan baris total menjumlahkan baris yang sedang tampil. Karena itu
            penjumlahannya bisa Anda periksa sendiri dari baris di atasnya.
          </p>
          <p className="mt-2">
            Akun pendana hanya melihat alokasi atas namanya sendiri, dan daftarnya dibatasi jumlah
            baris terbaru yang dimuat halaman ini. Jadi angka di sini adalah ringkasan atas catatan
            yang benar-benar tampil untuk Anda, bukan klaim total sepanjang masa.
          </p>
        </>
      ),
    },
  ];

  return (
    <BagianLipat
      id="aturan-perhitungan"
      nomor={5}
      judul="Aturan perhitungan"
      ringkas={`bunga harian ${ringkasTarif} sesuai tenor · biaya platform (layanan) ${persenPotonganAdmin}%`}
      bukaAwal={bukaAwal.length > 0}
      className="mt-3"
    >
      <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
        Cara semua angka di halaman ini dihitung: dari bunga pinjaman sampai baris total tabel
        pendana. Buka aturan yang ingin Anda periksa.
      </p>

      <div className="mt-1 grid items-start gap-x-6 sm:grid-cols-2 lg:grid-cols-3">
        {bagiKolom(aturan, 3).map((bagian) => (
          <Accordion
            key={bagian[0]?.nomor ?? 0}
            type="multiple"
            /* Hanya aturan di kolom ini yang dibuka, supaya `bukaAwal` tetap
               membuka aturan yang benar. */
            defaultValue={bagian
              .filter((a) => bukaAwal.includes(a.nomor))
              .map((a) => `aturan-${a.nomor}`)}
          >
            {bagian.map((a) => (
              <AccordionItem
                key={a.nomor}
                value={`aturan-${a.nomor}`}
                className="border-slate-100"
              >
                {/* min-h-11 menjaga sasaran sentuh 44px walau py-2 dikecilkan. */}
                <AccordionTrigger className="min-h-11 items-center gap-3 py-2 text-sm font-medium text-navy hover:no-underline">
                  <span className="flex min-w-0 items-baseline gap-2 text-left">
                    <span className="text-xs font-semibold tabular-nums text-muted-foreground">
                      {a.nomor}.
                    </span>
                    <span className="min-w-0">{a.judul}</span>
                  </span>
                </AccordionTrigger>
                <AccordionContent className="text-xs leading-6 text-slate-700">
                  {a.isi}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        ))}
      </div>
    </BagianLipat>
  );
}
