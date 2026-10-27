import type { Id } from "@/convex/_generated/dataModel";

/** Baris gadai yang dirender pada panel hitungan internal Skema B. */
export type GadaiDanaRow = {
  _id: Id<"pawns">;
  nomorReferensi: string;
  deskripsiBarang: string;
  namaLengkap: string;
  status: string;
  hargaPasar: number | null;
  nilaiTaksiran?: number;
  pokokGadai?: number;
  persenSewaModal?: number;
  sisaPokok?: number;
  pendanaId?: Id<"users"> | null;
  pendanaNama?: string | null;
  dicairkanPada?: number;
};

/** Pilihan penyedia dana untuk menetapkan pemilik posisi gadai. */
export type PilihanPendanaGadai = {
  userId: Id<"users">;
  nama: string;
  email: string | null;
  aksesAktif: boolean;
};
