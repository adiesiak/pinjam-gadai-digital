/**
 * Unduh kontrak sebagai PDF langsung dari HTML cetak yang sudah ada.
 *
 * Alurnya: dokumen ditempatkan di iframe tersembunyi pada lebar A4, ditangkap
 * `snapdom` (sudah menjadi dependensi proyek), dipotong pada awal blok yang
 * aman, diberi nomor halaman, lalu dibungkus dengan `pdfGambar`. Tidak ada
 * dialog cetak dan tidak ada pustaka PDF baru.
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

type HasilTangkap = {
  kanvas: HTMLCanvasElement;
  /** Titik awal blok yang aman dipakai sebagai batas halaman. */
  batasAman: number[];
};

async function tangkapDokumen(dokumenHtml: string): Promise<HasilTangkap> {
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
    iframe.onerror = () => reject(new Error("Dokumen gagal dimuat."));
  });
  iframe.srcdoc = dokumenHtml;
  document.body.appendChild(iframe);

  try {
    await selesaiDimuat;
    const isi = iframe.contentDocument;
    const body = isi?.body;
    if (body === null || body === undefined) {
      throw new Error("Isi dokumen tidak dapat dibaca.");
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
      throw new Error("Dokumen tidak menghasilkan halaman yang bisa diunduh.");
    }
    // Kumpulkan titik awal blok teks/tabel. Pemotongan halaman memakai titik
    // ini agar satu paragraf atau satu baris tanda tangan tidak terbelah dua.
    const skala = kanvas.width / Math.max(1, body.clientWidth);
    const atasBody = body.getBoundingClientRect().top;
    const batasAman = [
      ...body.querySelectorAll(
        "p,h1,h2,h3,h4,table,li,.info-grid,.ttd,.warning,.verif,.kop,.signature-grid,.signature",
      ),
    ]
      .map((elemen) => (elemen.getBoundingClientRect().top - atasBody) * skala)
      .filter((y) => y > 0 && y < kanvas.height)
      .sort((a, b) => a - b);
    return { kanvas, batasAman };
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
  const { kanvas, batasAman } = await tangkapDokumen(dokumenHtml);
  const tinggiHalaman = Math.round(
    (kanvas.width * 841.89) / 595.28,
  );
  // Sisakan pita putih di bawah isi untuk nomor halaman, lalu pilih batas
  // halaman pada awal blok terdekat. Blok yang tidak muat tetap dipotong tepat
  // di batas halaman, tetapi paragraf biasa tidak lagi terbelah sia-sia.
  const cadanganKaki = 28;
  const tinggiTarget = tinggiHalaman - cadanganKaki;
  const tinggiMinimum = Math.round(tinggiHalaman * 0.55);
  const potonganHalaman: { mulai: number; tinggi: number }[] = [];
  let mulai = 0;
  const perluHalamanLanjutan = kanvas.height > tinggiHalaman;
  while (mulai < kanvas.height) {
    let akhir = Math.min(kanvas.height, mulai + tinggiTarget);
    // Dokumen satu halaman tidak boleh dipendekkan hanya karena ada blok yang
    // kebetulan mulai di dekat dasar halaman; itu justru menciptakan halaman
    // kedua yang hampir kosong.
    if (perluHalamanLanjutan && akhir < kanvas.height) {
      const kandidat = batasAman.filter(
        (y) => y > mulai + tinggiMinimum && y <= akhir,
      );
      if (kandidat.length > 0) akhir = kandidat[kandidat.length - 1];
    }
    if (akhir <= mulai) akhir = Math.min(kanvas.height, mulai + tinggiTarget);
    potonganHalaman.push({ mulai, tinggi: akhir - mulai });
    mulai = akhir;
  }

  const halaman: Uint8Array[] = [];
  potonganHalaman.forEach((potonganHalamanIni, i) => {
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
      potonganHalamanIni.mulai,
      kanvas.width,
      potonganHalamanIni.tinggi,
      0,
      0,
      kanvas.width,
      potonganHalamanIni.tinggi,
    );
    konteks.fillStyle = "#64748b";
    konteks.font = "11px Arial, Helvetica, sans-serif";
    konteks.textAlign = "center";
    konteks.fillText(
      `Halaman ${i + 1} dari ${potonganHalaman.length}`,
      kanvas.width / 2,
      tinggiHalaman - 10,
    );
    halaman.push(
      jpegDariDataUrl(potongan.toDataURL("image/jpeg", 0.92)),
    );
  });

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
