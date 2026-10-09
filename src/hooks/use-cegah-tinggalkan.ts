import { useCallback, useEffect, useRef, useState } from "react";
import { useBeforeUnload } from "react-router";

import { perluPeringatanTinggalkan } from "@/lib/formInteraksi";

/**
 * Peringatkan pengguna sebelum ia meninggalkan halaman dengan perubahan yang
 * belum disimpan (menutup tab, memuat ulang, atau mengikuti tautan keluar).
 *
 * Kenapa ada: formulir panjang PINDAI (pengajuan pinjaman dengan KYC + tanda
 * tangan + tiga berkas, pengajuan gadai, data diri) menampung pekerjaan yang
 * tidak bisa diulang dengan satu klik. Sebelumnya menutup tab menghapus semua
 * isian tanpa sepatah kata pun.
 *
 * Aturan yang dipakai bersama formulir lain hidup di
 * `lib/formInteraksi.ts` (`perluPeringatanTinggalkan`): peringatan hanya muncul
 * bila ADA perubahan dan formulirnya belum berakhir sukses — supaya formulir
 * yang sudah selesai tidak lagi berteriak saat ditutup.
 *
 * Mengembalikan `perlu` supaya komponen bisa menampilkan penanda kecil
 * "belum disimpan" di layar — peringatan browser hanya datang saat pintunya
 * sudah mau dilewati, sedangkan penanda ini terlihat lebih awal.
 */
export function useCegahTinggalkan(kotor: boolean, selesai = false): boolean {
  const perlu = perluPeringatanTinggalkan(kotor, selesai);

  // `beforeunload` tidak bisa memakai teks pilihan kita (peramban yang
  // menentukan), jadi yang dikerjakan di sini hanya menandai "ada yang perlu
  // ditanyakan" — persis seperti yang diminta spesifikasi HTML.
  const jaga = useCallback(
    (event: BeforeUnloadEvent) => {
      if (!perlu) return;
      event.preventDefault();
      event.returnValue = "";
    },
    [perlu],
  );
  useBeforeUnload(jaga);

  return perlu;
}

/**
 * Penanda perubahan yang bisa dibaca di layar tanpa memicu peringatan keluar.
 * Dipisah dari `useCegahTinggalkan` karena sebagian formulir hanya ingin
 * menampilkan statusnya (mis. dialog yang ditutup lewat tombol Batal sendiri).
 */
export function usePenandaKotor(kotor: boolean): string | null {
  return kotor ? "Ada perubahan yang belum disimpan." : null;
}

/**
 * Kunci pengiriman sekali-pakai untuk mencegah kiriman ganda.
 *
 * `disabled` pada tombol saja belum cukup: penekanan Enter di dalam isian dan
 * klik ganda sama-sama bisa menjalankan handler dua kali sebelum React
 * merender ulang tombolnya. Kunci ini menutup celah itu, dan mengembalikan
 * `true` hanya pada pemanggilan yang benar-benar boleh lanjut.
 */
export function useKirimSekali(): {
  kunci: () => boolean;
  buka: () => void;
} {
  const terkunci = useRef(false);
  return {
    kunci: () => {
      if (terkunci.current) return false;
      terkunci.current = true;
      return true;
    },
    buka: () => {
      terkunci.current = false;
    },
  };
}

/**
 * Detik mundur kecil untuk tindakan yang bisa diulang (mis. "kirim ulang kode").
 *
 * Mencegah penembakan berulang ke provider email, dan memberi tahu pengguna
 * dengan jujur berapa lama lagi ia boleh mencoba — bukan tombol mati tanpa
 * penjelasan. `mulai` dipanggil dari handler, bukan saat render.
 */
export function useJedaKirimUlang(detik = 30): {
  sisa: number;
  mulai: (detik?: number) => void;
} {
  const [sisa, setSisa] = useState(0);

  useEffect(() => {
    if (sisa <= 0) return;
    const id = setTimeout(() => setSisa((n) => Math.max(0, n - 1)), 1000);
    return () => clearTimeout(id);
  }, [sisa]);

  const mulai = useCallback((durasi?: number) => setSisa(durasi ?? detik), [detik]);
  return { sisa, mulai };
}
