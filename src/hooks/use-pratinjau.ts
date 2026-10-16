import { useAuthActions } from "@convex-dev/auth/react";
import { useMutation } from "convex/react";
import { useCallback, useState } from "react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  adaSesiAsli,
  bacaNonce,
  bersihkanPenandaPratinjau,
  buatNonce,
  pulihkanSesiAsli,
  simpanNonce,
  simpanSesiAsli,
} from "@/lib/pratinjau";
import { ADMIN_ROUTE } from "@/lib/routes";

/**
 * Alur "masuk sebagai" milik Super Admin, dari sisi peramban.
 *
 * Urutannya sengaja begini: sesi admin disalin DULU, baru tiket diminta. Bila
 * penyimpanan lokal diblokir, seluruh alur dibatalkan sebelum sesi berpindah —
 * pratinjau yang tidak punya jalan pulang akan mengunci admin di akun orang
 * lain, dan itu lebih buruk daripada tidak bisa mempratinjau sama sekali.
 *
 * Selama pratinjau, peramban memegang sesi nyata akun target (lihat
 * `convex/auth/pratinjau.ts`), jadi halaman yang memuat ulang akan menampilkan
 * dashboard peminjam atau ruang pendana seperti yang dialami akun itu.
 */
export function usePratinjau() {
  const { signIn, signOut } = useAuthActions();
  const mintaTiket = useMutation(api.pratinjau.mintaTiket);
  const akhiriPratinjau = useMutation(api.pratinjau.akhiriPratinjau);
  const [busy, setBusy] = useState(false);

  /** Masuk sebagai akun target; peramban dimuat ulang ke ruang akun itu. */
  const mulai = useCallback(
    async ({ targetId, alasan }: { targetId: string; alasan?: string }) => {
      if (adaSesiAsli()) {
        throw new Error(
          'Pratinjau sebelumnya belum ditutup. Tekan "Kembali ke Mode Admin" di bilah atas lebih dulu.',
        );
      }
      if (!simpanSesiAsli()) {
        throw new Error(
          "Peramban ini memblokir penyimpanan lokal, sehingga sesi admin tidak bisa dikembalikan. Pratinjau tidak dijalankan.",
        );
      }

      const nonce = buatNonce();
      setBusy(true);
      let berpindah = false;
      try {
        const tiket = await mintaTiket({
          targetId: targetId as Id<"users">,
          nonce,
          ...(alasan?.trim() ? { alasan: alasan.trim() } : {}),
        });
        simpanNonce(nonce);
        await signIn("pratinjau-admin", { tiketId: tiket.tiketId });
        berpindah = true;
        window.location.assign(tiket.tujuan);
        return tiket.targetNama;
      } catch (error) {
        // Gagal sebelum sesi berpindah: sesi admin masih utuh, jadi penandanya
        // dibersihkan supaya tidak ada bilah pratinjau yang menyesatkan.
        if (!berpindah) bersihkanPenandaPratinjau();
        throw error;
      } finally {
        setBusy(false);
      }
    },
    [mintaTiket, signIn],
  );

  /**
   * Tutup pratinjau: catat akhirnya di server, putuskan sesi akun target, lalu
   * pasang kembali sesi admin dan muat ulang ke panel admin.
   */
  const kembali = useCallback(async () => {
    setBusy(true);
    try {
      const nonce = bacaNonce();
      if (nonce !== null) {
        try {
          await akhiriPratinjau({ nonce });
        } catch {
          // Pencatatan gagal (mis. jaringan): pemulihan sesi admin tetap
          // dijalankan, karena itu yang paling penting bagi penggunanya.
        }
      }

      if (!adaSesiAsli()) {
        bersihkanPenandaPratinjau();
        await signOut().catch(() => undefined);
        window.location.assign(`/auth?returnTo=${encodeURIComponent(ADMIN_ROUTE)}`);
        return;
      }

      await signOut().catch(() => undefined);
      if (!pulihkanSesiAsli()) {
        throw new Error(
          "Sesi admin tidak dapat dipulihkan di peramban ini. Masuk kembali dengan kata sandi + TOTP.",
        );
      }
      window.location.assign(ADMIN_ROUTE);
    } finally {
      setBusy(false);
    }
  }, [akhiriPratinjau, signOut]);

  return { busy, mulai, kembali };
}
