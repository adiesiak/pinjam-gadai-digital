/**
 * Helper QA: bangun argumen KYC lengkap untuk createLoanApplication.
 * Tiga dokumen dummy diunggah asli ke Convex storage agar validasi
 * server (metadata storage) lolos, plus koordinat lokasi segar.
 */
import type { ConvexHttpClient } from "convex/browser";

import { api } from "../src/convex/_generated/api";

const DOKUMEN_DUMMY = Buffer.from("Dokumen QA dummy untuk pengujian KYC PINDAI.\n");

async function uploadDokumen(client: ConvexHttpClient): Promise<string> {
  const url: string = await client.mutation(api.loans.generateKycUploadUrl, {});
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: DOKUMEN_DUMMY,
  });
  if (!res.ok) throw new Error(`Upload dokumen QA gagal: HTTP ${res.status}`);
  const body = (await res.json()) as { storageId: string };
  return body.storageId;
}

/** eslint-disable-next-line @typescript-eslint/no-explicit-any */
export async function kycArgs(client: ConvexHttpClient): Promise<any> {
  const [dokKtpId, dokSelfieKtpId, dokSlipGajiId] = await Promise.all([
    uploadDokumen(client),
    uploadDokumen(client),
    uploadDokumen(client),
  ]);
  return {
    nik: "3204010101900001",
    nomorWhatsApp: "628123456789",
    penghasilanBulanan: 5_000_000,
    sumberPenghasilan: "Gaji QA",
    dokKtpId,
    dokSelfieKtpId,
    dokSlipGajiId,
    lokasiAjukan: {
      lat: -6.2,
      lng: 106.816666,
      akurasi: 20,
      waktu: Date.now(),
    },
  };
}
