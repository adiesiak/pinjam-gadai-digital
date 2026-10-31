/**
 * Unduh kontrak sebagai PDF langsung dari HTML cetak yang sudah ada.
 *
 * Alurnya: dokumen ditempatkan di iframe tersembunyi pada lebar A4, ditangkap
 * `snapdom` (sudah menjadi dependensi proyek), dipotong menjadi halaman A4,
 * lalu dibungkus dengan `pdfGambar`. Tidak ada dialog cetak dan tidak ada
 * pustaka PDF baru.
 *
 * Bila peramban tidak bisa menangkap dokumen (mis. kanvas diblokir), pemanggil
 * menampilkan tombol Cetak sebagai cadangan — bukan mengklaim PDF berhasil.
 */

import { jpegDariDataUrl, pdfDariHalamanJpeg } from "./pdfGambar";

const LEBAR_A4_PIKSEL = 794;

type PustakaSnapdom = {
  toCanvas: (
    elemen: Element,
    opsi?: { fast?: boolean },
  ) => Promise<HTMLCanvasElement>;
};

async function tangkapDokumen(
  dokumenHtml: string,
): Promise<HTMLCanvasElement> {
  if (typeof document === "undefined") {
    throw new Error("Unduhan PDF hanya tersedia di peramban.");
  }
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.tabIndex = -1;
  iframe.style.cssText = [
    "position:fixed",
    "left:-10000px",
    "top:0",
    `width:${LEBAR_A4_PIKSEL}px`,
    "height:1123px",
    "border:0",
    "background:#ffffff",
    "pointer-events:none",
    "z-index:-1",
  ].join(";");

  const selesaiDimuat = new Promise<void>((resolve, reject) => {
    iframe.onload = () => resolve();
    iframe.onerror = () => reject(new Error("Dokumen kontrak gagal dimuat."));
  });
  iframe.srcdoc = dokumenHtml;
  document.body.appendChild(iframe);

  try {
    await selesaiDimuat;
    const isi = iframe.contentDocument;
    const body = isi?.body;
    if (body === null || body === undefined) {
      throw new Error("Isi dokumen kontrak tidak dapat dibaca.");
    }
    // Biarkan gambar QR, SVG, dan font selesai ditata sebelum ditangkap.
    try {
      await isi?.fonts?.ready;
    } catch {
      // Font sistem tidak selalu punya `ready`; bukan alasan membatalkan PDF.
    }
    const tinggi = Math.max(1123, body.scrollHeight + 8);
    iframe.style.height = `${tinggi}px`;
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    const mod = (await import("@zumer/snapdom")) as unknown as {
      snapdom: PustakaSnapdom;
    };
    const kanvas = await mod.snapdom.toCanvas(body, { fast: true });
    if (kanvas.width < 100 || kanvas.height < 100) {
      throw new Error("Dokumen kontrak tidak menghasilkan halaman yang bisa diunduh.");
    }
    return kanvas;
  } finally {
    iframe.remove();
  }
}

/**
 * Tangkap dokumen HTML lalu unduh hasilnya sebagai PDF A4.
 * `namaFile` sebaiknya sudah diakhiri `.pdf`.
 */
export async function unduhKontrakPdf(
  dokumenHtml: string,
  namaFile: string,
): Promise<void> {
  const kanvas = await tangkapDokumen(dokumenHtml);
  const tinggiHalaman = Math.round(
    (kanvas.width * 841.89) / 595.28,
  );
  const jumlahHalaman = Math.max(1, Math.ceil(kanvas.height / tinggiHalaman));
  const halaman: Uint8Array[] = [];

  for (let i = 0; i < jumlahHalaman; i += 1) {
    const potongan = document.createElement("canvas");
    potongan.width = kanvas.width;
    potongan.height = tinggiHalaman;
    const konteks = potongan.getContext("2d");
    if (konteks === null) {
      throw new Error("Peramban tidak mendukung pembuatan PDF.");
    }
    // Latar putih eksplisit: bagian bawah halaman terakhir sering kosong dan
    // JPEG transparan akan menjadi hitam tanpa ini.
    konteks.fillStyle = "#ffffff";
    konteks.fillRect(0, 0, potongan.width, potongan.height);
    konteks.drawImage(
      kanvas,
      0,
      i * tinggiHalaman,
      kanvas.width,
      tinggiHalaman,
      0,
      0,
      kanvas.width,
      tinggiHalaman,
    );
    halaman.push(
      jpegDariDataUrl(potongan.toDataURL("image/jpeg", 0.92)),
    );
  }

  const pdf = pdfDariHalamanJpeg(halaman, kanvas.width, tinggiHalaman);
  const blob = new Blob([pdf as unknown as BlobPart], {
    type: "application/pdf",
  });
  const url = URL.createObjectURL(blob);
  const tautan = document.createElement("a");
  tautan.href = url;
  tautan.download = namaFile.endsWith(".pdf") ? namaFile : `${namaFile}.pdf`;
  tautan.rel = "noopener";
  document.body.appendChild(tautan);
  tautan.click();
  tautan.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
