/**
 * Satu jalur pencatatan persetujuan kontrak untuk admin DAN peminjam.
 *
 * Sebelumnya aturan ini hanya hidup di `admin.ts`. Peminjam sekarang boleh
 * memilih dua jalur dari dashboard — tanda tangan elektronik atau persetujuan
 * untuk TTD manual — sehingga aturan yang sama harus dipakai di kedua tempat.
 * Kalau aturannya disalin, satu jalur bisa lupa menerbitkan sidik jari kontrak
 * atau lupa menolak persetujuan ganda.
 */
import type { MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { CONTRACT_TERMS_VERSION } from "../lib/contract";
import {
  terbitkanKontrakGadai,
  terbitkanKontrakPinjaman,
} from "./kontrakDigital";

export type HasilPersetujuan = {
  waktu: number;
  mode: "elektronik" | "manual";
  digital: { kode: string; hash: string } | null;
};

/** Validasi bentuk gambar tanda tangan dari kanvas. */
export function validasiDataTandaTangan(dataUrl: string): void {
  const prefix = "data:image/png;base64,";
  if (!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(dataUrl)) {
    throw new Error("Format tanda tangan tidak valid.");
  }
  if (dataUrl.length > 200_000) {
    throw new Error("Data tanda tangan terlalu besar.");
  }
  if (dataUrl.length <= prefix.length + 16) {
    throw new Error("Tanda tangan masih kosong.");
  }
}

type OpsiPersetujuan = {
  /**
   * `false` dipakai jalur "setujui untuk TTD manual": gambar tanda tangan lama
   * (mis. dari KYC) tidak boleh diam-diam dianggap sebagai tanda tangan akad.
   */
  pakaiTandaTanganTersimpan?: boolean;
  /** Pilihan eksplisit peminjam; kosong = turunkan dari ada/tidaknya gambar. */
  mode?: "elektronik" | "manual";
};

function periksaPersetujuanGanda(args: {
  sudahSetuju: boolean;
  sudahTandaTangan: boolean;
  dataUrl: string | undefined;
  label: string;
}): void {
  if (args.sudahSetuju && args.sudahTandaTangan) {
    throw new Error(`${args.label} ini sudah disetujui dan ditandatangani.`);
  }
  if (args.sudahSetuju && args.dataUrl === undefined) {
    throw new Error(
      `Persetujuan ${args.label.toLowerCase()} ini sudah dicatat. Bubuhkan tanda tangan untuk melengkapinya.`,
    );
  }
}

async function catatPersetujuanPinjaman(
  ctx: MutationCtx,
  loan: Doc<"loans">,
  dataUrl: string | undefined,
  opsi: OpsiPersetujuan = {},
): Promise<HasilPersetujuan> {
  if (dataUrl !== undefined) validasiDataTandaTangan(dataUrl);
  const sudahSetuju =
    loan.persetujuanSyaratPada !== undefined &&
    loan.persetujuanSyaratVersi === CONTRACT_TERMS_VERSION;
  // Gambar KYC lama pada jalur manual bukan tanda tangan akad, jadi tidak boleh
  // menghalangi peminjam melengkapi tanda tangan elektronik di kemudian hari.
  const sudahTandaTangan =
    loan.persetujuanMode !== "manual" && loan.tandaTanganPeminjam !== undefined;
  periksaPersetujuanGanda({
    sudahSetuju,
    sudahTandaTangan,
    dataUrl,
    label: "Kontrak pinjaman",
  });

  const now = Date.now();
  const bolehPakaiTersimpan = opsi.pakaiTandaTanganTersimpan !== false;
  const mode =
    opsi.mode ??
    (dataUrl !== undefined || (bolehPakaiTersimpan && loan.tandaTanganPeminjam !== undefined)
      ? "elektronik"
      : "manual");
  await ctx.db.patch(loan._id, {
    ...(dataUrl !== undefined
      ? { tandaTanganPeminjam: dataUrl, tandaTanganPada: now }
      : {}),
    persetujuanSyaratPada: now,
    persetujuanSyaratVersi: CONTRACT_TERMS_VERSION,
    persetujuanMode: mode,
  });

  const tandaTangan =
    dataUrl ?? (bolehPakaiTersimpan ? loan.tandaTanganPeminjam : undefined);
  const waktuTandaTangan =
    dataUrl !== undefined ? now : (loan.tandaTanganPada ?? now);
  const digital =
    tandaTangan !== undefined
      ? await terbitkanKontrakPinjaman(
          ctx,
          {
            ...loan,
            tandaTanganPeminjam: tandaTangan,
            tandaTanganPada: waktuTandaTangan,
          },
          waktuTandaTangan,
        )
      : null;
  return { waktu: now, mode, digital };
}

async function catatPersetujuanGadai(
  ctx: MutationCtx,
  pawn: Doc<"pawns">,
  dataUrl: string | undefined,
  opsi: OpsiPersetujuan = {},
): Promise<HasilPersetujuan> {
  if (dataUrl !== undefined) validasiDataTandaTangan(dataUrl);
  const sudahSetuju =
    pawn.persetujuanSyaratPada !== undefined &&
    pawn.persetujuanSyaratVersi === CONTRACT_TERMS_VERSION;
  const sudahTandaTangan =
    pawn.persetujuanMode !== "manual" && pawn.tandaTanganPeminjam !== undefined;
  periksaPersetujuanGanda({
    sudahSetuju,
    sudahTandaTangan,
    dataUrl,
    label: "Akad gadai",
  });

  const now = Date.now();
  const bolehPakaiTersimpan = opsi.pakaiTandaTanganTersimpan !== false;
  const mode =
    opsi.mode ??
    (dataUrl !== undefined || (bolehPakaiTersimpan && pawn.tandaTanganPeminjam !== undefined)
      ? "elektronik"
      : "manual");
  await ctx.db.patch(pawn._id, {
    ...(dataUrl !== undefined
      ? { tandaTanganPeminjam: dataUrl, tandaTanganPada: now }
      : {}),
    persetujuanSyaratPada: now,
    persetujuanSyaratVersi: CONTRACT_TERMS_VERSION,
    persetujuanMode: mode,
  });

  const tandaTangan =
    dataUrl ?? (bolehPakaiTersimpan ? pawn.tandaTanganPeminjam : undefined);
  const waktuTandaTangan =
    dataUrl !== undefined ? now : (pawn.tandaTanganPada ?? now);
  const digital =
    tandaTangan !== undefined
      ? await terbitkanKontrakGadai(
          ctx,
          {
            ...pawn,
            tandaTanganPeminjam: tandaTangan,
            tandaTanganPada: waktuTandaTangan,
          },
          waktuTandaTangan,
        )
      : null;
  return { waktu: now, mode, digital };
}

export async function simpanPersetujuanPinjaman(
  ctx: MutationCtx,
  loan: Doc<"loans">,
  dataUrl: string | undefined,
  opsi: OpsiPersetujuan = {},
): Promise<HasilPersetujuan> {
  return catatPersetujuanPinjaman(ctx, loan, dataUrl, opsi);
}

export async function simpanPersetujuanGadai(
  ctx: MutationCtx,
  pawn: Doc<"pawns">,
  dataUrl: string | undefined,
  opsi: OpsiPersetujuan = {},
): Promise<HasilPersetujuan> {
  return catatPersetujuanGadai(ctx, pawn, dataUrl, opsi);
}
