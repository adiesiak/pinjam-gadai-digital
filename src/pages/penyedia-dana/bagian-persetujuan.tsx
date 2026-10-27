import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";

import { PersetujuanRisikoPendana } from "@/components/penyediaDana/PersetujuanRisikoPendana";
import { MemuatBaris } from "@/components/ui/loading";
import { api } from "@/convex/_generated/api";

/**
 * Persetujuan risiko milik AKUN, bukan peramban.
 *
 * Query, mutation, dan status formulirnya tinggal di komponen ini supaya
 * kegagalan membaca status persetujuan tidak mengosongkan seluruh ruang
 * pendana. Pemanggil membungkusnya dengan `BatasBagian`.
 */
export function BagianPersetujuan({ aktif }: { aktif: boolean }) {
  const persetujuan = useQuery(
    api.persetujuanRisiko.statusPersetujuanRisiko,
    aktif ? {} : ("skip" as const),
  );
  const catatPersetujuan = useMutation(
    api.persetujuanRisiko.catatPersetujuanRisiko,
  );
  const [menyimpan, setMenyimpan] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  /**
   * Kirim persetujuan atas VERSI teks yang sedang tampil.
   *
   * Versi ikut dikirim supaya server dapat menolak halaman yang sudah usang:
   * yang disetujui harus kalimat yang benar-benar dibaca pendana.
   */
  async function setujui(versiTeks: number) {
    setMenyimpan(true);
    setGalat(null);
    try {
      await catatPersetujuan({ versiTeks });
      toast.success("Persetujuan risiko tercatat atas nama akun Anda.");
    } catch (err) {
      setGalat(
        err instanceof Error
          ? err.message
          : "Persetujuan gagal dicatat. Coba lagi.",
      );
    } finally {
      setMenyimpan(false);
    }
  }

  return (
    <div id="persetujuan" className="scroll-mt-20">
      {persetujuan === undefined && aktif && (
        <MemuatBaris
          teks="Memuat status persetujuan risiko…"
          className="mt-4"
        />
      )}
      {persetujuan !== undefined && (
        <PersetujuanRisikoPendana
          status={persetujuan}
          peran={persetujuan.peran}
          bolehSetuju={persetujuan.bolehSetuju}
          menyimpan={menyimpan}
          galat={galat}
          onSetuju={setujui}
        />
      )}
    </div>
  );
}
