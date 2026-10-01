import type { Id } from "@/convex/_generated/dataModel";

/** Baris gadai yang dirender pada panel hitungan internal Skema B. */
export type GadaiPendanaanRow = {
  _id: Id<"pawns">;
  nomorReferensi: string;
  deskripsiBarang: string;
  namaLengkap: string;
  status: string;
  hargaPasar: number | null;
  nilaiTaksiran?: number;
  pokokGadai?: number;
  persenSewaModal?: number;
  dicairkanPada?: number;
};
