import type { ReactNode } from "react";

import { KepalaFolio } from "@/components/penyediaDana/bagian-folio";
import { FOLIO } from "@/components/penyediaDana/folio";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { DEFAULT_TENOR_HARI } from "@/lib/loan";
import { formatRupiah, percentOf } from "@/lib/money";

/**
 * Satu aturan: judul singkat + penjelasan yang boleh memuat beberapa paragraf.
 * Nomornya dipakai sebagai penanda urutan baca, bukan sebagai bagian judul.
 */
type Aturan = { nomor: number; judul: string; isi: ReactNode };

/**
 * Daftar dibagi dua kolom untuk layar lebar: tujuh aturan yang sebelumnya
 * menumpuk satu per satu kini terbaca dalam empat baris. Pembagiannya menurut
 * urutan indeks, jadi urutan bacanya tetap 1 sampai 7 di layar sempit maupun lebar.
 */
function bagiDua<T>(daftar: readonly T[]): readonly (readonly T[])[] {
  const tengah = Math.ceil(daftar.length / 2);
  return [daftar.slice(0, tengah), daftar.slice(tengah)];
}

/**
 * Panel "Aturan perhitungan" — satu tempat untuk semua cara angka di ruang ini
 * dihitung.
 *
 * Kenapa bentuknya begini: dulu penjelasan istilah ("dibukukan", "perkiraan",
 * "potongan admin") ditempel satu per satu sebagai ikon `?` di kartu-kartu
 * angka, dan callout "untuk apa potongan admin dipakai" berdiri sebagai
 * kotak sendiri di tengah halaman. Akibatnya istilah yang sama dijelaskan dari
 * beberapa tempat dengan kalimat yang berbeda-beda, dan penjelasan kebijakan
 * mendesak angka ke bawah lipatan. Sekarang aturannya dikumpulkan sekali di
 * sini, terbuka satu per satu saat pembaca benar-benar ingin tahu, dan kartu
 * angkanya kembali ringkas tanpa ikon bantuan berulang.
 *
 * Isinya sengaja memakai persentase yang berlaku sekarang (dari Pengaturan
 * Sistem), bukan angka tetap yang ditulis di kode — jadi kalau pemilik produk
 * mengubah tarifnya, penjelasannya ikut berubah.
 *
 * Bentuk accordion (dan bukan dinding teks): semua judul tetap terlihat
 * sekaligus, sehingga pembaca bisa langsung menemukan aturan yang dicarinya.
 * Di layar lebar daftarnya dipasang dua kolom supaya tujuh judulnya tidak
 * menghabiskan satu layar sebelum bagian berikutnya terbaca.
 *
 * Murni presentasional, tanpa Convex, supaya bisa dirender langsung oleh uji
 * markup (`AturanPerhitungan.render.test.tsx`).
 */
export function AturanPerhitungan({
  persenBunga,
  persenPotonganAdmin,
  bukaAwal = [],
}: {
  /** Bunga pinjaman per tenor, dari Pengaturan Sistem (persen dari pokok). */
  persenBunga: number;
  /** Potongan admin dari uang yang kembali, dari Pengaturan Sistem. */
  persenPotonganAdmin: number;
  /**
   * Nomor aturan yang dibuka sejak awal. Dipakai uji markup: isi accordion yang
   * tertutup tidak dirender saat render statis, jadi tanpa pintu ini isi
   * aturannya tidak bisa diverifikasi lewat HTML.
   */
  bukaAwal?: readonly number[];
}) {
  // Contoh angka memakai `percentOf` — jalur aritmetika uang yang sama dengan
  // perhitungan sebenarnya (Rule 3: uang tidak dibangun dari perkalian
  // pecahan), sehingga contohnya bulat dan tidak merobohkan pemformat rupiah.
  const contohPokok = 1_000_000;
  const contohImbal = percentOf(contohPokok, persenBunga);

  const aturan: readonly Aturan[] = [
    {
      nomor: 1,
      judul: "Bunga pinjaman dan Imbal Hasil",
      isi: (
        <>
          <p>
            Bunga pinjaman dihitung sebagai <strong>{persenBunga}%</strong> dari pokok, bukan
            per bulan. Pinjaman {formatRupiah(contohPokok)} dengan bunga {persenBunga}% berarti
            total kewajiban peminjam {formatRupiah(contohPokok + contohImbal)}, dan selisihnya{" "}
            {formatRupiah(contohImbal)} adalah Imbal Hasil yang menjadi dasar keuntungan pendana.
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
      judul: "Potongan admin",
      isi: (
        <>
          <p>
            Potongan admin adalah <strong>{persenPotonganAdmin}%</strong> dari{" "}
            <strong>uang yang kembali</strong> (pokok + Imbal Hasil), bukan{" "}
            {persenPotonganAdmin}% dari Imbal Hasil saja. Konsekuensinya: pokok kembali utuh,
            sementara keuntungan bersih pendana lebih kecil daripada bunga yang tercatat pada
            pinjaman.
          </p>
          <p className="mt-2">Potongan itu dipakai untuk:</p>
          <ul className="mt-1.5 space-y-1.5">
            <li className="flex gap-2">
              <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-primary" />
              <span>Server &amp; operasional PINDAI — biaya sistem, penyimpanan berkas, dan pemantauan lokasi.</span>
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
                Penanganan pinjaman bermasalah — pendampingan dan penyelesaian pinjaman yang tidak
                lancar, termasuk biaya hukum bila diperlukan.
              </span>
            </li>
          </ul>
          <p className="mt-2">
            Potongan admin <strong>bukan jaminan</strong>. Dana pendanaan tidak dijamin oleh LPS
            maupun pihak lain, kecuali ada perjanjian tertulis yang menyatakannya — rinciannya ada
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
            <strong>Dana tersalurkan</strong> adalah pokok yang sudah cair ke peminjam — pinjaman
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
            Tenor ditulis dalam <strong>hari</strong> — satuannya sama di seluruh halaman ini.
            Jatuh tempo dihitung dari tanggal pendanaan ditambah tenor pinjaman.
          </p>
          <p className="mt-2">
            Untuk catatan lama yang tenornya belum tercatat, perkiraan jatuh temponya memakai
            bawaan <strong>{DEFAULT_TENOR_HARI} hari</strong> supaya tetap ada tanggal yang bisa
            dipakai menagih. Perkiraan bawaan itu ikut ditandai apa adanya, tidak disamarkan sebagai
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
            Kewajiban transfer keuntungan baru muncul saat pinjamannya <strong>lunas</strong> —
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
            Semua kolom tabel rekap pendana dihitung dari pinjaman yang tercatat pada masing-masing
            pendana, dan baris total menjumlahkan kolomnya. Karena itu penjumlahannya bisa Anda
            periksa sendiri dari baris di atasnya.
          </p>
          <p className="mt-2">
            Tabel dibatasi jumlah baris terbaru yang dimuat halaman ini, jadi angka di sini adalah
            ringkasan atas catatan yang benar-benar tersedia — bukan klaim total sepanjang masa.
          </p>
        </>
      ),
    },
  ];

  return (
    <section
      aria-label="Aturan perhitungan"
      className={`animate-masuk mt-3 scroll-mt-24 px-4 py-3 sm:px-5 ${FOLIO.kertas}`}
      id="aturan-perhitungan"
    >
      <KepalaFolio
        nomor={5}
        judul="Aturan perhitungan"
        aksi={
          <p className="text-xs font-medium text-muted-foreground">
            bunga {persenBunga}% · potongan admin {persenPotonganAdmin}%
          </p>
        }
      />
      <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
        Cara semua angka di halaman ini dihitung — dari bunga pinjaman sampai baris total tabel
        pendana. Buka aturan yang ingin Anda periksa.
      </p>

      <div className="mt-1 grid items-start gap-x-6 lg:grid-cols-2">
        {bagiDua(aturan).map((bagian) => (
          <Accordion
            key={bagian[0]?.nomor ?? 0}
            type="multiple"
            /* Hanya aturan yang memang berada di kolom ini yang dibuka, supaya
               pintu uji `bukaAwal` tetap membuka aturan yang benar. */
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
                {/* `min-h-11` menjaga tinggi sasaran sentuh 44px walau bantalannya
                    (py-2) dikecilkan supaya daftarnya tidak setinggi satu layar. */}
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
    </section>
  );
}
