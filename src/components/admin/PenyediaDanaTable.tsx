import { useMutation, useQuery } from "convex/react";
import {
  BadgeCheck,
  BanknoteArrowUp,
  Eye,
  FileText,
  KeyRound,
  Loader2,
  ShieldOff,
  TriangleAlert,
  Undo2,
  UserPlus,
  Wallet,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { formatRupiah } from "@/lib/money";
import {
  LABEL_METODE_TRANSFER,
  LABEL_TRANSFER,
  type RekapTransferPendana,
  type RingkasTransfer,
  type StatusTransfer,
} from "@/lib/transferPendana";

import { MetrikKartu } from "./admin-shared";

/** Format rupiah defensif: satu angka warisan non-bulat tidak boleh melumpuhkan panel. */
function rupiah(nilai: number): string {
  try {
    return formatRupiah(nilai);
  } catch {
    return `Rp ${Number(nilai).toLocaleString("id-ID")}`;
  }
}

function tanggalRingkas(ms: number | null): string {
  if (ms === null) return "—";
  return new Date(ms).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const LABEL_STATUS: Record<string, string> = {
  didanai: "berjalan",
  lunas: "lunas",
  menunggu_verifikasi: "menunggu verifikasi",
  terverifikasi: "terverifikasi",
  ditolak: "ditolak",
  menunggu_proses: "menunggu diproses",
  diproses: "diproses",
};

/** Gaya badge status catatan transfer keuntungan penyedia dana. */
const META_TRANSFER: Record<StatusTransfer, string> = {
  belum_dicatat: "border-0 bg-slate-100".replace("100", "100") + "",
  dicatat: "border-0 bg-emerald-100 text-emerald-700 hover:bg-emerald-100",
  dibatalkan: "border-0 bg-amber-100 text-amber-800 hover:bg-amber-100",
};

// @@PART2@@