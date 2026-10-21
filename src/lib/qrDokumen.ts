/**
 * Membuat QR verifikasi yang belum sempat jadi sebelum dokumen dicetak.
 *
 * `useQrDataUrl` membuat QR secara asinkron (impor `qrcode` ditunda). Kalau
 * tombol cetak ditekan sebelum proses itu selesai, HTML kontrak masih memuat
 * kotak kosong `verif-qr-kosong`; itulah yang dulu ikut tersimpan di PDF.
 * Kotak itu sekarang membawa `data-qr-url`, dan fungsi ini mengisinya dengan
 * gambar QR asli tepat sebelum dialog cetak dibuka.
 *
 * Kegagalan pembuatan QR tidak membatalkan pencetakan: kode verifikasi, hash,
 * dan alamat halaman tetap tercetak, jadi dokumen masih bisa diverifikasi
 * manual.
 */

const KOTAK_QR = /<div class="verif-qr verif-qr-kosong" data-qr-url="([^"]*)">QR<\/div>/g;

const ENTITAS: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
};

function bukaEntitas(teks: string): string {
  return teks.replace(/&(amp|lt|gt|quot|#39);/g, (utuh) => ENTITAS[utuh] ?? utuh);
}

export async function lengkapiQrCetak(html: string): Promise<string> {
  const kotak = [...html.matchAll(KOTAK_QR)];
  if (kotak.length === 0) return html;

  // Impor ditunda seperti di `useQrDataUrl`: `qrcode` hanya ikut dimuat saat
  // dokumen kontrak benar-benar dicetak, bukan saat aplikasi dibuka. Bentuk
  // modulnya CJS (`export =`), jadi `default` dibaca tanpa mengandalkan tipe.
  type PustakaQr = { toDataURL: (teks: string, opsi?: object) => Promise<string> };
  let pustaka: PustakaQr;
  try {
    const mod = (await import("qrcode")) as unknown as { default?: PustakaQr } & PustakaQr;
    pustaka = mod.default ?? mod;
  } catch {
    return html;
  }

  let hasil = html;
  for (const cocok of kotak) {
    const url = bukaEntitas(cocok[1] ?? "");
    if (url === "") continue;
    try {
      const dataUrl = await pustaka.toDataURL(url, {
        margin: 1,
        width: 184,
        errorCorrectionLevel: "M",
        color: { dark: "#064E3B", light: "#ffffff" },
      });
      hasil = hasil.replace(
        cocok[0],
        `<img class="verif-qr" src="${dataUrl}" alt="QR halaman verifikasi dokumen"/>`,
      );
    } catch {
      // Biarkan kotak kosong; teks verifikasi di sebelahnya tetap lengkap.
    }
  }
  return hasil;
}
