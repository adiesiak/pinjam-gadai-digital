/**
 * Satu langganan `admin.adminOverview` untuk seluruh panel admin.
 *
 * Kenapa ada: `adminOverview` membaca tabel pinjaman, gadai, dan kredit sekaligus
 * — query termahal di panel ini. Sebelumnya tiga komponen antrean
 * (`LoanAllocationQueueTab`, `DpdTab`, `LelangTab`) masing-masing memanggil
 * `useQuery(api.admin.adminOverview)` sendiri. Convex menggabungkan langganan
 * dengan argumen yang sama, tetapi begitu satu tab dilepas (petugas pindah
 * modul), langganannya ikut berhenti dan tab berikutnya memulai lagi dari
 * `undefined` — jadi berpindah-pindah modul berarti mengulang query berat itu.
 *
 * Dengan penyedia ini, `AdminTabs` memegang satu langganan selama panel terbuka
 * dan seluruh modul membacanya dari konteks. Komponen tetap bisa dipakai di
 * luar penyedia (mis. harness yang merender satu panel saja): hook jatuh kembali
 * ke `useQuery` sendiri, dan `"skip"` dipakai saat konteks sudah tersedia supaya
 * tidak ada langganan ganda.
 */
import { useQuery } from "convex/react";
import { createContext, useContext, type ReactNode } from "react";

import { api } from "@/convex/_generated/api";

import type { AdminOverviewData } from "./admin-shared";

const KonteksOverview = createContext<AdminOverviewData | undefined>(undefined);

export function PenyediaOverviewAdmin({
  overview,
  children,
}: {
  overview: AdminOverviewData;
  children: ReactNode;
}) {
  return <KonteksOverview.Provider value={overview}>{children}</KonteksOverview.Provider>;
}

/**
 * Data ringkasan admin: dari penyedia bila ada, selain itu berlangganan sendiri.
 * Mengembalikan `undefined` selama data belum tiba — sama seperti `useQuery`.
 */
export function useOverviewAdmin(): AdminOverviewData | undefined {
  const dariKonteks = useContext(KonteksOverview);
  const dariServer = useQuery(
    api.admin.adminOverview,
    dariKonteks === undefined ? {} : "skip",
  );
  return dariKonteks ?? dariServer;
}
