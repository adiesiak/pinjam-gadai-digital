import { useAction, useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";

import { KontakLaporanWhatsapp } from "@/components/penyediaDana/KontakLaporanWhatsapp";
import { RekapTransferGadai } from "@/components/penyediaDana/RekapTransferGadai";
import { api } from "@/convex/_generated/api";
import { useBahasaLaporan } from "@/hooks/use-bahasa-laporan";
import { unduhLewatAplikasi } from "@/lib/jembatanAndroid";
import { laporanPortofolio, namaBerkasPortofolio } from "@/lib/laporanPendana";
import { susunPdfResmi } from "@/lib/pdfSederhana";

/**
 * Kartu kontak laporan + unduhan PDF portofolio pendana.
 *
 * Query kontak, query angka laporan, dan seluruh aksinya tinggal di komponen
 * ini supaya kegagalan salah satunya hanya mengganti kartu ini, bukan seluruh
 * ruang pendana. Pemanggil membungkusnya dengan `BatasBagian` dan hanya
 * merendernya untuk akun pemilik portofolio.
 */
export function BagianLaporan() {
  // Nomor laporan milik AKUN, bukan peramban: dibaca dari server supaya tetap
  // terisi saat pendana berganti perangkat.
  const kontakLaporan = useQuery(api.penyediaDana.kontakLaporanSaya, {});
  // Angka PDF dibaca dari query yang sama dengan laporan WhatsApp, sehingga
  // salinan manual dan salinan terkirim tidak pernah berbeda.
  const dataLaporan = useQuery(api.laporanPendana.dataLaporanPortofolio, {});
  const simpanKontak = useMutation(api.penyediaDana.simpanKontakLaporan);
  const kirimLaporan = useAction(api.laporanPendana.kirimLaporanPortofolio);

  const [menyimpanKontak, setMenyimpanKontak] = useState(false);
  const [mengirimLaporan, setMengirimLaporan] = useState(false);
  const [mengunduhLaporan, setMengunduhLaporan] = useState(false);
  const [galatLaporan, setGalatLaporan] = useState<string | null>(null);
  // Pilihan bahasa hanya untuk PDF yang diunduh; kiriman WhatsApp tetap
  // memakai laporan Indonesia yang disusun server.
  const [bahasaLaporan, ubahBahasaLaporan] = useBahasaLaporan();

  /** Simpan nomor laporan milik akun yang sedang masuk. */
  async function simpanNomorLaporan(nomor: string) {
    setMenyimpanKontak(true);
    setGalatLaporan(null);
    try {
      await simpanKontak({ nomor });
      toast.success("Nomor laporan tersimpan pada akun Anda.");
    } catch (err) {
      setGalatLaporan(
        err instanceof Error ? err.message : "Nomor gagal disimpan. Coba lagi.",
      );
    } finally {
      setMenyimpanKontak(false);
    }
  }

  /**
   * Minta laporan kinerja dikirim ke WhatsApp akun ini.
   *
   * Kegagalan gateway ditampilkan apa adanya di kartunya, bukan diringkas jadi
   * "berhasil": pendana harus tahu kalau laporannya tidak jadi terkirim.
   */
  async function kirimLaporanWhatsapp() {
    setMengirimLaporan(true);
    setGalatLaporan(null);
    try {
      await kirimLaporan({});
      toast.success(
        "Laporan dikirim ke WhatsApp Anda. Berkasnya menyusul di percakapan.",
      );
    } catch (err) {
      setGalatLaporan(
        err instanceof Error
          ? err.message
          : "Laporan gagal dikirim. Coba lagi.",
      );
    } finally {
      setMengirimLaporan(false);
    }
  }

  /**
   * Susun laporan portofolio sebagai PDF di perangkat pendana.
   *
   * Berkas ini tidak pernah disimpan di server: angkanya diambil dari query
   * laporan, lalu byte PDF disusun di peramban dan langsung diunduh.
   */
  async function unduhLaporanPdf() {
    if (dataLaporan === undefined || dataLaporan === null) return;
    setMengunduhLaporan(true);
    setGalatLaporan(null);
    try {
      const byte = susunPdfResmi(laporanPortofolio(dataLaporan, bahasaLaporan));
      const blob = new Blob([new Uint8Array(byte)], {
        type: "application/pdf",
      });
      const nama = namaBerkasPortofolio(dataLaporan.dicetakPada, bahasaLaporan);
      // Di aplikasi Android, unduhan blob: tidak ditangani WebView.
      if (await unduhLewatAplikasi(nama, "application/pdf", blob)) return;
      const url = URL.createObjectURL(blob);
      const tautan = document.createElement("a");
      tautan.href = url;
      tautan.download = nama;
      tautan.rel = "noopener";
      document.body.appendChild(tautan);
      tautan.click();
      tautan.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (err) {
      setGalatLaporan(
        err instanceof Error
          ? err.message
          : "Laporan PDF gagal disiapkan. Coba lagi.",
      );
    } finally {
      setMengunduhLaporan(false);
    }
  }

  if (kontakLaporan === undefined || kontakLaporan === null) return null;

  return (
    <>
      <KontakLaporanWhatsapp
        className="mt-4"
        nomor={kontakLaporan.nomorWhatsApp}
        menyimpan={menyimpanKontak}
        mengirim={mengirimLaporan}
        mengunduh={mengunduhLaporan}
        bolehUnduh={dataLaporan !== undefined && dataLaporan !== null}
        galat={galatLaporan}
        onSimpan={simpanNomorLaporan}
        onKirim={kirimLaporanWhatsapp}
        onUnduh={() => void unduhLaporanPdf()}
        bahasa={bahasaLaporan}
        onUbahBahasa={ubahBahasaLaporan}
      />
      <BagianTransferGadai />
    </>
  );
}

/**
 * Rekap transfer hak pendana gadai, memakai query yang sama dengan ruang
 * pendana. Dipisah supaya kegagalan query ini tidak mengganti kartu kontak
 * laporan di atasnya.
 */
function BagianTransferGadai() {
  const data = useQuery(api.penyediaDana.laporanTransferGadaiPendana, {});
  if (data === undefined) {
    return (
      <p className="mt-4 rounded-lg border border-slate-200 bg-white px-4 py-6 text-xs text-muted-foreground">
        Memuat rekap transfer gadai...
      </p>
    );
  }
  return (
    <RekapTransferGadai
      rows={data.rows}
      belum={data.belum}
      ringkasan={data.ringkasan}
      terpotong={data.terpotong}
      belumTerpotong={data.belumTerpotong}
    />
  );
}
