import { describe, expect, it } from "vitest";

import {
  ringkasanMediaVerifikasi,
  type MediaVerifikasiPembayaran,
} from "./verifikasiPembayaran";

function buatMedia(ukuran = [1_000, 2_000, 3_000, 4_000]): MediaVerifikasiPembayaran {
  return {
    wajahSnapshot: new File([new Uint8Array(ukuran[0])], "wajah.jpg", { type: "image/jpeg" }),
    wajahVideo: new File([new Uint8Array(ukuran[1])], "wajah.webm", { type: "video/webm" }),
    lingkunganSnapshot: new File([new Uint8Array(ukuran[2])], "lingkungan.jpg", { type: "image/jpeg" }),
    lingkunganVideo: new File([new Uint8Array(ukuran[3])], "lingkungan.webm", { type: "video/webm" }),
  };
}

describe("ringkasan media verifikasi pembayaran", () => {
  it("merangkum byte tanpa mengubah objek media", () => {
    const media = buatMedia();

    expect(ringkasanMediaVerifikasi(media)).toEqual({
      wajahFotoByte: 1_000,
      wajahVideoByte: 2_000,
      lingkunganFotoByte: 3_000,
      lingkunganVideoByte: 4_000,
      totalByte: 10_000,
    });
    expect(media.wajahSnapshot.name).toBe("wajah.jpg");
  });

  it("menolak foto atau video yang melebihi batas per berkas", () => {
    expect(() => ringkasanMediaVerifikasi(buatMedia([8_000_001, 1, 1, 1])))
      .toThrow(/Foto verifikasi melebihi batas/);
    expect(() => ringkasanMediaVerifikasi(buatMedia([1, 22_000_001, 1, 1])))
      .toThrow(/Video verifikasi melebihi batas/);
  });

  it("menolak tipe media yang tidak sesuai", () => {
    const media = buatMedia();
    media.lingkunganVideo = new File(["data"], "lingkungan.txt", { type: "text/plain" });

    expect(() => ringkasanMediaVerifikasi(media)).toThrow(/Format media/);
  });
});
