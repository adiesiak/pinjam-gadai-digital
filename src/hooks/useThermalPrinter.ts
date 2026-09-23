/**
 * STOP-UP! — Hook printer thermal Web Serial (ESC/POS).
 *
 * Menyambung ke printer USB Serial dari browser Chrome/Edge (Web Serial API),
 * mengirim byte ESC/POS, dan melaporkan status kertas.
 *
 * Deteksi kertas habis:
 * - Printer murah tidak membalas status ESC/POS, jadi kita mengandalkan dua
 *   sinyal: (1) exception saat menulis ke port, dan (2) tidak ada perangkat
 *   yang tersambung. Keduanya dianggap "tidak bisa mencetak" → pemanggil
 *   mengalihkan bukti bayar 100% ke WhatsApp.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export type StatusPrinter = "tidak_didukung" | "terputus" | "menyambung" | "terhubung" | "galat";

export type HasilCetak = {
  sukses: boolean;
  kertasHabis: boolean;
  pesan?: string;
};

type PortSerial = {
  open: (options: { baudRate: number }) => Promise<void>;
  close: () => Promise<void>;
  writable: WritableStream<Uint8Array> | null;
};

type SerialApi = {
  requestPort: () => Promise<PortSerial>;
  getPorts: () => Promise<PortSerial[]>;
};

declare global {
  interface Navigator {
    serial?: SerialApi;
  }
}

/** Pesan error Chrome saat printer tidak mengirim balasan (kertas habis/off). */
function pesanKertas(err: unknown): boolean {
  const teks = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  return (
    teks.includes("device") ||
    teks.includes("read") ||
    teks.includes("timeout") ||
    teks.includes("disconnected") ||
    teks.includes("network")
  );
}

export function useThermalPrinter() {
  const portRef = useRef<PortSerial | null>(null);
  const [status, setStatus] = useState<StatusPrinter>("terputus");
  const [namaPort, setNamaPort] = useState<string | null>(null);

  const didukung =
    typeof navigator !== "undefined" && typeof navigator.serial !== "undefined";

  useEffect(() => {
    if (!didukung) setStatus("tidak_didukung");
  }, [didukung]);

  /** Buka dialog pemilihan port lalu sambungkan. */
  const sambungkan = useCallback(async () => {
    if (!navigator.serial) {
      setStatus("tidak_didukung");
      return false;
    }
    setStatus("menyambung");
    try {
      const port = await navigator.serial.requestPort();
      await port.open({ baudRate: 9600 });
      portRef.current = port;
      setNamaPort("Printer Thermal (USB Serial)");
      setStatus("terhubung");
      return true;
    } catch (err) {
      setStatus("galat");
      console.warn("[STOP-UP!] Gagal menyambung printer:", err);
      return false;
    }
  }, []);

  const putuskan = useCallback(async () => {
    try {
      await portRef.current?.close();
    } catch {
      /* port sudah tertutup */
    }
    portRef.current = null;
    setNamaPort(null);
    setStatus("terputus");
  }, []);

  /** Kirim byte ESC/POS ke printer. */
  const cetak = useCallback(async (bytes: Uint8Array): Promise<HasilCetak> => {
    const port = portRef.current;
    if (!port || !port.writable) {
      return {
        sukses: false,
        kertasHabis: true,
        pesan: "Printer belum tersambung.",
      };
    }
    let writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
    try {
      writer = port.writable.getWriter();
      await writer.write(bytes);
      await writer.releaseLock();
      return { sukses: true, kertasHabis: false };
    } catch (err) {
      try {
        writer?.releaseLock();
      } catch {
        /* abaikan */
      }
      setStatus("galat");
      return {
        sukses: false,
        kertasHabis: pesanKertas(err),
        pesan: err instanceof Error ? err.message : String(err),
      };
    }
  }, []);

  return {
    didukung,
    status,
    namaPort,
    sambungkan,
    putuskan,
    cetak,
    /** true saat printer siap dipakai (dipakai untuk menyembunyikan tombol). */
    siap: status === "terhubung",
  };
}

export default useThermalPrinter;
