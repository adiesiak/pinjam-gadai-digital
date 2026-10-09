import { useConvexConnectionState } from "convex/react";
import { useEffect, useState } from "react";

/**
 * Keadaan sinkronisasi latar belakang PINDAI.
 *
 * Sumbernya `useConvexConnectionState()` — bukan karangan UI — sehingga yang
 * dilaporkan selalu keadaan sambungan yang SEBENARNYA:
 *
 * - `terputus`  : WebSocket ke server sudah mati cukup lama. Data di layar
 *                 masih terakhir yang diketahui; pengguna perlu tahu itu.
 * - `menyinkron`: mutasi/aksi milik pengguna berjalan lebih dari ambang. Ini
 *                 bedanya "sedang mengirim sesuatu" (perlu diberi tahu) dari
 *                 pembacaan ulang query rutin karena data lain berubah (tidak
 *                 perlu diberi tahu sama sekali).
 *
 * Keduanya diberi jeda (debounce) di atas, jadi permintaan yang selesai cepat
 * tidak pernah memunculkan indikator apa pun. Getaran kecil pada UI adalah
 * kebisingan, bukan informasi.
 *
 * Catatan penerapan: perubahan state HANYA terjadi di dalam timer, tidak di
 * badan efek. Selain memenuhi aturan `react-hooks/set-state-in-effect`, pola ini
 * juga menghindari render berantai saat keadaan sambungan berubah cepat —
 * keadaan benar-benar berubah sepersekian detik kemudian, persis seperti yang
 * dijanjikan jeda di atas.
 *
 * PENTING: hook ini memakai konteks Convex, jadi hanya boleh dipanggil di dalam
 * `<ConvexProvider>` (aplikasi nyata). Komponen presentasional di
 * `components/ui/loading.tsx` sengaja tidak menyentuh hook ini supaya tetap
 * dapat dirender tanpa provider pada uji.
 */

/** Mutasi/aksi yang berjalan lebih lama dari ini dianggap proses panjang. */
const AMBANG_PROSES_MS = 2_500;
/** Sambungan yang mati lebih lama dari ini baru diberitahukan. */
const AMBANG_TERPUTUS_MS = 1_500;

export type StatusSinkron = {
  /** Proses milik pengguna (mutasi/aksi) sedang berjalan cukup lama. */
  menyinkron: boolean;
  /** Sambungan ke server terputus — data yang tampil mungkin tidak segar lagi. */
  terputus: boolean;
};

export function useStatusSinkron(): StatusSinkron {
  const koneksi = useConvexConnectionState();

  const adaProsesPengguna =
    koneksi.inflightMutations > 0 || koneksi.inflightActions > 0;
  // Selama belum pernah tersambung, keadaan "terputus" tidak berarti apa-apa:
  // itu bagian dari pemuatan awal, dan layar sudah menampilkan rangkanya.
  const offline = !koneksi.isWebSocketConnected && koneksi.hasEverConnected;

  const [menyinkron, setMenyinkron] = useState(false);
  const [terputus, setTerputus] = useState(false);

  useEffect(() => {
    const id = setTimeout(
      () => setMenyinkron(adaProsesPengguna),
      adaProsesPengguna ? AMBANG_PROSES_MS : 0,
    );
    return () => clearTimeout(id);
  }, [adaProsesPengguna]);

  useEffect(() => {
    const id = setTimeout(() => setTerputus(offline), offline ? AMBANG_TERPUTUS_MS : 0);
    return () => clearTimeout(id);
  }, [offline]);

  return { menyinkron, terputus };
}
