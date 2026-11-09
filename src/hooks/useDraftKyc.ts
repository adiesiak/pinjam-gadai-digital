import { useCallback, useEffect, useRef } from "react";

import {
  bacaDraftTersimpan,
  bersihkanIsian,
  kunciPenyimpananDraft,
  pulihkanKeIsian,
  serialisasiDraft,
  type IsianDraftKyc,
  type KunciDraftKyc,
} from "@/lib/draftKyc";

/**
 * Simpan isian KYC ke `localStorage` saat diketik (debounce 300 ms) dan
 * pulihkan saat halaman ter-refresh tidak sengaja.
 *
 * Kenapa hook terpisah: `KycSection` sudah sangat besar dan punya banyak efek;
 * menaruh aturan tulis/baca `localStorage` di dalamnya membuat dua hal rawan
 * tercampur — kapan draft boleh dipakai, dan apa yang boleh menimpanya. Semua
 * keputusan itu ada di `lib/draftKyc.ts` (murni, teruji); hook ini hanya
 * menjembatani ke React dan `window`.
 *
 * Yang dijaga di sini:
 * - Menulis hanya saat `aktif` (mis. jangan menyimpan saat pengajuan terkunci
 *   menunggu peninjauan) dan hanya bila `userId` diketahui — kunci penyimpanan
 *   selalu per pengguna, tidak pernah bersama.
 * - Tidak menulis ulang bila isinya tidak berubah, jadi mengetik "a" lalu
 *   menghapusnya tidak membanjiri `localStorage`.
 * - Menulis sekali lagi saat halaman disembunyikan/ditinggalkan (`pagehide`,
 *   `visibilitychange`) supaya perubahan detik-detik terakhir — tepat saat
 *   ponsel mengalihkan aplikasi — ikut tersimpan meski debounce belum jatuh.
 * - `pulihkan()` hanya dijalankan sekali per pemuatan halaman dan TIDAK PERNAH
 *   menimpa isian yang sudah ada di server.
 * - `bersihkan()` dipanggil setelah pengiriman berhasil, bukan sebelumnya.
 */
export function useDraftKyc({
  userId,
  isian,
  aktif,
  tundaMs = 300,
}: {
  /** Pemilik draft. Draft tidak ditulis/dibaca bila kosong. */
  userId: string;
  /** Isian yang sedang ditampilkan di formulir. */
  isian: IsianDraftKyc;
  /** false = jangan menulis draft (mis. tahap terkunci / belum setuju). */
  aktif: boolean;
  /** Jeda tulis dalam milidetik (bawaan 300 ms sesuai ketentuan produk). */
  tundaMs?: number;
}): {
  /** Gabungkan draft tersimpan ke isian server; server selalu menang. */
  pulihkan: (server: IsianDraftKyc) => { isian: IsianDraftKyc; dipulihkan: KunciDraftKyc[] };
  /** Buang draft — hanya setelah pengajuan berhasil dikirim. */
  bersihkan: () => void;
} {
  const kunci = userId.trim() === "" ? null : kunciPenyimpananDraft(userId);
  const terakhirTertulis = useRef<string | null>(null);
  const sudahDipulihkan = useRef(false);
  const siap = typeof window !== "undefined" && typeof window.localStorage !== "undefined";

  /**
   * Ambil isian terkini dari ref supaya pendengar `pagehide` tidak perlu
   * dipasang ulang setiap ketikan (dan tidak menahan nilai lama).
   */
  const isianRef = useRef<IsianDraftKyc>(isian);
  const aktifRef = useRef(aktif);
  useEffect(() => {
    isianRef.current = isian;
    aktifRef.current = aktif;
  }, [isian, aktif]);

  const tulisSekarang = useCallback(
    (nilai: IsianDraftKyc) => {
      if (!siap || kunci === null || !aktifRef.current) return;
      const rapi = bersihkanIsian(nilai);
      const sidik = JSON.stringify(rapi);
      if (terakhirTertulis.current === sidik) return;
      try {
        window.localStorage.setItem(kunci, serialisasiDraft(userId, rapi, Date.now()));
        terakhirTertulis.current = sidik;
      } catch {
        // Penyimpanan penuh/diblokir (mode privat) bukan kegagalan pengajuan:
        // isian tetap hidup di memori dan tetap bisa disimpan ke server.
      }
    },
    [kunci, siap, userId],
  );

  // Tulis tertunda 300 ms setelah ketikan terakhir.
  useEffect(() => {
    if (!siap || kunci === null || !aktif) return;
    const timer = window.setTimeout(() => tulisSekarang(isian), tundaMs);
    return () => window.clearTimeout(timer);
  }, [isian, aktif, kunci, siap, tundaMs, tulisSekarang]);

  // Tulis sekali lagi saat halaman disembunyikan/ditinggalkan — inilah momen
  // ponsel mengalihkan aplikasi tanpa memberi kesempatan debounce jatuh.
  useEffect(() => {
    if (!siap || kunci === null) return;
    const flush = () => tulisSekarang(isianRef.current);
    const padaSembunyi = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", padaSembunyi);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", padaSembunyi);
    };
  }, [kunci, siap, tulisSekarang]);

  const pulihkan = useCallback(
    (server: IsianDraftKyc) => {
      if (!siap || kunci === null || sudahDipulihkan.current) {
        return { isian: server, dipulihkan: [] as KunciDraftKyc[] };
      }
      sudahDipulihkan.current = true;
      let teks: string | null = null;
      try {
        teks = window.localStorage.getItem(kunci);
      } catch {
        return { isian: server, dipulihkan: [] as KunciDraftKyc[] };
      }
      const payload = bacaDraftTersimpan(teks, userId);
      if (payload === null) {
        // Buang draft kedaluwarsa/rusak/milik akun lain saat ketahuan. Kalau
        // dibiarkan, data pribadi lama tetap menetap di localStorage meski
        // tidak pernah dipakai lagi.
        try {
          window.localStorage.removeItem(kunci);
        } catch {
          // Penyimpanan diblokir: tidak ada yang bisa dibersihkan.
        }
        return { isian: server, dipulihkan: [] as KunciDraftKyc[] };
      }
      const hasil = pulihkanKeIsian(server, payload.isian);
      // Isian hasil gabungan dianggap sudah tertulis, supaya efek debounce
      // berikutnya tidak langsung menulis ulang isi yang sama.
      terakhirTertulis.current = JSON.stringify(bersihkanIsian(hasil.isian));
      return hasil;
    },
    [kunci, siap, userId],
  );

  const bersihkan = useCallback(() => {
    sudahDipulihkan.current = true;
    terakhirTertulis.current = null;
    if (!siap || kunci === null) return;
    try {
      window.localStorage.removeItem(kunci);
    } catch {
      // Sama seperti tulis: kegagalan membersihkan draft tidak boleh
      // menggagalkan pengajuan yang sebenarnya sudah tersimpan di server.
    }
  }, [kunci, siap]);

  return { pulihkan, bersihkan };
}
