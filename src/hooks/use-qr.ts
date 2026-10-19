import { useEffect, useState } from "react";

type HasilQr = { teks: string; dataUrl: string | null };

/**
 * QR sebagai data URL, dibuat di klien.
 *
 * `qrcode` diimpor dinamis supaya pustaka itu tidak masuk bundel utama: QR
 * hanya dibutuhkan saat dokumen kontrak dibuka, bukan saat aplikasi dimuat.
 * Kegagalan pembuatan QR tidak menggagalkan dokumen — blok verifikasi tetap
 * tampil dengan kode dan hash, hanya tanpa gambar QR.
 *
 * Hasil disimpan bersama teks sumbernya. Saat `teks` berganti, hasil lama tidak
 * ditampilkan (bukan dikosongkan lewat effect), sehingga tidak ada setState
 * sinkron di dalam effect yang memicu render berantai.
 */
export function useQrDataUrl(teks: string | null): string | null {
  const [hasil, setHasil] = useState<HasilQr | null>(null);

  useEffect(() => {
    if (teks === null || teks.trim() === "") return;
    let aktif = true;
    void import("qrcode")
      .then((mod) =>
        mod.default.toDataURL(teks, {
          margin: 1,
          width: 184,
          errorCorrectionLevel: "M",
          color: { dark: "#064E3B", light: "#ffffff" },
        }),
      )
      .then((dataUrl) => {
        if (aktif) setHasil({ teks, dataUrl });
      })
      .catch(() => {
        if (aktif) setHasil({ teks, dataUrl: null });
      });
    return () => {
      aktif = false;
    };
  }, [teks]);

  if (teks === null || teks.trim() === "") return null;
  return hasil !== null && hasil.teks === teks ? hasil.dataUrl : null;
}
