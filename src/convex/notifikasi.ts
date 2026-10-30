import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { formatRupiahAman } from "../lib/money";
import { formatTanggalWIB } from "../lib/waktu";
import { kunciNotifikasiPembaruan } from "../lib/pembaruanAplikasi";
import { LABEL_STATUS_KYC, type StatusKyc } from "../lib/kycStatus";
import { LABEL_STATUS_PENGADUAN } from "../lib/penagihan";
import { pinjamanLunasMilikPendana } from "./penyediaDana";

/**
 * Pusat notifikasi in-app PINDAI.
 *
 * RANCANGAN YANG SENGAJA DIPILIH
 *
 * Modul ini **tidak memiliki tabel notifikasi**. Daftarnya selalu DIHITUNG
 * ULANG dari data yang sudah ada di aplikasi:
 *
 * | Sumber                 | Jenis notifikasi        | Keadaan baca              |
 * | ---------------------- | ----------------------- | ------------------------- |
 * | `pengingat`            | info / peringatan / error | `notifikasiBaca`        |
 * | `lokasiPeringatan`     | peringatan              | `dibacaPada` (bawaan tabel)|
 * | `manualPaymentReceipts`| info / sukses / error   | `notifikasiBaca`          |
 * | `pengumuman` (CMS)     | info                    | `notifikasiBaca`          |
 * | `pengaduanNasabah` + `pengaduanPesan` | info / sukses / peringatan | `notifikasiBaca` |
 * | `kycRiwayat`           | info / sukses / peringatan | `notifikasiBaca`        |
 * | `loans` (status berubah) | info / sukses / peringatan | `notifikasiBaca`      |
 * | `pembaruanAplikasi`    | info                    | `notifikasiBaca`          |
 * | `voucher` (H-3)        | peringatan              | `notifikasiBaca`          |
 * | `doorprizeUndian`      | sukses                  | `notifikasiBaca`          |
 *
 * Konsekuensinya penting dan disengaja:
 *
 * 1. **Tidak ada notifikasi palsu.** Kalau sumbernya tidak ada, notifikasinya
 *    tidak ada. Tidak ada baris "selamat datang" atau pesan contoh yang dibuat
 *    hanya supaya panelnya terlihat penuh.
 * 2. **Tidak ada klaim pengiriman.** Modul ini tidak mengirim WhatsApp, email,
 *    atau push. Status pengiriman WA yang pernah terjadi tetap dibaca dari
 *    `lokasiPeringatan.waStatus` dan dilaporkan apa adanya — bukan diasumsikan.
 * 3. **Tidak ada scheduler baru.** Notifikasi dibuat oleh proses yang sudah ada
 *    (cron pengingat, heuristik lokasi, pencocokan admin), bukan oleh modul ini.
 *
 * `notifikasiBaca` hanya menyimpan keadaan milik pengguna (kunci mana yang sudah
 * dibaca dan kapan). Untuk peringatan lokasi, keadaan baca tetap `dibacaPada`
 * pada tabelnya sendiri supaya banner dashboard dan pusat notifikasi tidak
 * pernah berbeda pendapat.
 */

export type NotifikasiJenis = "info" | "sukses" | "peringatan" | "error";

export type NotifikasiItem = {
  /** Identitas stabil sumber (mis. "pengingat:<id>") — dasar keadaan baca. */
  kunci: string;
  jenis: NotifikasiJenis;
  judul: string;
  ringkasan: string;
  /** Waktu menurut server (epoch ms) — dasar urutan. */
  waktu: number;
  /** Rute dalam aplikasi untuk membuka detail terkait. */
  tautan: string;
  dibaca: boolean;
};

/** Batas per sumber, supaya satu sumber tidak menelan seluruh daftar. */
const BATAS_PER_SUMBER = 6;
/** Batas total item yang dikirim ke klien. */
const BATAS_TOTAL = 18;
/** Batas pinjaman yang diperiksa pengingatnya (paling baru lebih dulu). */
const BATAS_PINJAMAN = 25;
/** Batas keputusan KYC terakhir yang diperiksa (paling baru lebih dulu). */
const BATAS_RIWAYAT_KYC = 5;
/** Batas pengaduan yang diperiksa kabar terbarunya (paling baru lebih dulu). */
const BATAS_PENGADUAN = 8;
/** Batas pesan petugas yang diperiksa per pengaduan. */
const BATAS_PESAN_PENGADUAN = 4;
/** Batas voucher yang diperiksa umur berlakunya. */
const BATAS_VOUCHER = 12;
/** Voucher diingatkan mulai H-3 sebelum masa berlakunya habis. */
const VOUCHER_INGAT_HARI = 3;
/** Batas undian terakhir yang diperiksa untuk kabar kemenangan. */
const BATAS_UNDIAN = 12;

/** Notifikasi beserta rujukan internalnya — dipakai untuk menandai dibaca. */
type ItemInternal = NotifikasiItem & {
  sumber:
    | "pengingat"
    | "pengingatAngsuran"
    | "lokasi"
    | "bukti"
    | "pengumuman"
    | "pengaduan"
    | "kyc"
    | "pinjaman"
    | "pendana"
    | "pembaruan"
    | "voucher"
    | "undian";
  /** Id baris sumber, bila sumbernya berbaris (pengingat/lokasi/bukti). */
  ref: string | null;
};

/** Sesi wajib: hanya pengguna masuk non-tamu yang punya notifikasi. */
async function requirePengguna(ctx: QueryCtx) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("Harus masuk terlebih dahulu.");
  const user = await ctx.db.get(userId);
  if (user === null) throw new Error("Pengguna tidak ditemukan.");
  if (user.isAnonymous === true) {
    throw new Error(
      "Akun tamu hanya dapat melihat informasi. Masuk dengan akun terverifikasi untuk membuka notifikasi.",
    );
  }
  return { userId, user };
}

/** Label waktu relatif sebagai kalimat pengantar — bukan status, bukan janji. */
function kalimatWaktu(waktu: number, sekarang: number): string {
  const menit = Math.floor((sekarang - waktu) / 60_000);
  if (menit < 1) return "baru saja";
  if (menit < 60) return `${menit} menit lalu`;
  const jam = Math.floor(menit / 60);
  if (jam < 24) return `${jam} jam lalu`;
  const hari = Math.floor(jam / 24);
  return `${hari} hari lalu`;
}

/**
 * Bangun daftar notifikasi dari sumber aslinya.
 *
 * Dipakai baik oleh `daftar` (query) maupun oleh penanda dibaca (mutation),
 * sehingga kunci yang boleh ditandai SELALU sama dengan yang sedang terlihat
 * pengguna — tidak ada cara menandai notifikasi yang tidak pernah ada.
 */
async function susunNotifikasi(
  ctx: QueryCtx,
  userId: Id<"users">,
): Promise<{ item: ItemInternal[]; belumDibaca: number }> {
  const sekarang = Date.now();
  const item: ItemInternal[] = [];

  // ===== Sumber 1: pengingat jatuh tempo (ditulis cron, bukan oleh modul ini)
  const loans = await ctx.db
    .query("loans")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  const pinjamanTerbaru = loans
    .sort((a, b) => b._creationTime - a._creationTime)
    .slice(0, BATAS_PINJAMAN);
  const referensiPinjaman = new Map<string, string>(
    pinjamanTerbaru.map((loan) => [loan._id, loan.nomorReferensi]),
  );

  const pengingatPerPinjaman = await Promise.all(
    pinjamanTerbaru.map((loan) =>
      ctx.db
        .query("pengingat")
        .withIndex("by_loan", (q) => q.eq("loanId", loan._id))
        .collect(),
    ),
  );
  const pengingat = pengingatPerPinjaman
    .flat()
    .sort((a, b) => b.waktu - a.waktu)
    .slice(0, BATAS_PER_SUMBER);

  for (const p of pengingat) {
    const referensi = referensiPinjaman.get(p.loanId) ?? "catatan pinjaman";
    const nominal = formatRupiahAman(p.jumlahKewajiban);
    const jenis: NotifikasiJenis =
      p.jenis === "terlambat" ? "error" : p.jenis === "jatuh_tempo" ? "peringatan" : "info";
    const judul =
      p.jenis === "terlambat"
        ? `Catatan pinjaman terlambat ${Math.abs(p.sisaHari)} hari`
        : p.jenis === "jatuh_tempo"
          ? "Jatuh tempo hari ini"
          : `Jatuh tempo ${p.sisaHari} hari lagi`;
    item.push({
      kunci: `pengingat:${p._id}`,
      sumber: "pengingat",
      ref: p._id,
      jenis,
      judul,
      ringkasan: `Pengingat internal untuk ${referensi} · kewajiban tercatat ${nominal} · ${kalimatWaktu(p.waktu, sekarang)}.`,
      waktu: p.waktu,
      tautan: "/dashboard?tab=jadwal",
      dibaca: false, // ditentukan di bawah dari tabel baca
    });
  }

  // ===== Sumber 2: peringatan pola koordinat (keadaan baca: `dibacaPada`)
  const peringatanLokasi = await ctx.db
    .query("lokasiPeringatan")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  for (const w of peringatanLokasi.sort((a, b) => b.waktu - a.waktu).slice(0, BATAS_PER_SUMBER)) {
    const wa =
      w.waStatus === "terkirim"
        ? "Peringatan WhatsApp tercatat terkirim."
        : w.waStatus === "gagal"
          ? "Percobaan kirim WhatsApp tercatat gagal."
          : w.waStatus === "tanpa_nomor"
            ? "Belum ada nomor WhatsApp lengkap untuk diberi tahu."
            : "Belum ada catatan pengiriman WhatsApp.";
    item.push({
      kunci: `lokasi:${w._id}`,
      sumber: "lokasi",
      ref: w._id,
      jenis: "peringatan",
      judul: "Koordinat perangkat tercatat berulang",
      ringkasan: `Penanda otomatis pada ${w.tanda.join(", ") || "pola koordinat"} · ${wa} · ${kalimatWaktu(w.waktu, sekarang)}.`,
      waktu: w.waktu,
      tautan: "/dashboard",
      dibaca: w.dibacaPada !== undefined,
    });
  }

  // ===== Sumber 3: bukti pembayaran manual yang sudah dikirim nasabah
  const bukti = await ctx.db
    .query("manualPaymentReceipts")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  for (const r of bukti.sort((a, b) => b._creationTime - a._creationTime).slice(0, BATAS_PER_SUMBER)) {
    const jenis: NotifikasiJenis =
      r.status === "dicocokkan" ? "sukses" : r.status === "ditolak" ? "error" : "info";
    const judul =
      r.status === "dicocokkan"
        ? "Bukti pembayaran dicocokkan"
        : r.status === "ditolak"
          ? "Bukti pembayaran ditolak admin"
          : "Bukti pembayaran menunggu pencocokan";
    const catatan = r.catatanAdmin ? ` Catatan admin: ${r.catatanAdmin}` : "";
    item.push({
      kunci: `bukti:${r._id}`,
      sumber: "bukti",
      ref: r._id,
      jenis,
      judul,
      ringkasan: `Bukti ${formatRupiahAman(r.jumlah)} untuk ${r.nomorReferensi} · status ${r.status.replace(/_/g, " ")} · ${kalimatWaktu(r._creationTime, sekarang)}.${catatan}`,
      waktu: r.dicocokkanPada ?? r._creationTime,
      tautan: "/dashboard?tab=riwayat",
      dibaca: false,
    });
  }

  // ===== Sumber 3b: pengingat angsuran H-3 / hari-H / H+1
  const pengingatAngsuran = await ctx.db
    .query("pengingatAngsuran")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .order("desc")
    .take(BATAS_PER_SUMBER);
  for (const p of pengingatAngsuran) {
    const angsuran = await ctx.db.get(p.angsuranId);
    if (angsuran === null) continue;
    const loan = await ctx.db.get(p.loanId);
    const jenis: NotifikasiJenis =
      p.sisaHari < 0 ? "error" : p.sisaHari === 0 ? "peringatan" : "info";
    const judul =
      p.sisaHari < 0
        ? "Angsuran sudah lewat jatuh tempo"
        : p.sisaHari === 0
          ? "Angsuran jatuh tempo hari ini"
          : `Angsuran jatuh tempo ${p.sisaHari} hari lagi`;
    item.push({
      kunci: `pengingatAngsuran:${p._id}`,
      sumber: "pengingatAngsuran",
      ref: p._id,
      jenis,
      judul,
      ringkasan: `Angsuran ${angsuran.nomor} · ${loan?.nomorReferensi ?? "pinjaman"} · ${formatRupiahAman(p.jumlahKewajiban)} · jatuh tempo ${formatTanggalWIB(angsuran.jatuhTempoPada)} · ${kalimatWaktu(p.waktu, sekarang)}.`,
      waktu: p.waktu,
      tautan: "/dashboard?tab=cicilan",
      dibaca: false,
    });
  }

  // ===== Sumber 4: pengumuman CMS (satu baris global)
  const pengumuman = await ctx.db
    .query("pengumuman")
    .withIndex("by_slot", (q) => q.eq("slot", "global"))
    .first();
  if (pengumuman !== null && pengumuman.aktif !== false && (pengumuman.teks ?? "").trim() !== "") {
    item.push({
      kunci: `pengumuman:${pengumuman.diperbaruiPada}`,
      sumber: "pengumuman",
      ref: null,
      jenis: "info",
      judul: "Pengumuman PINDAI",
      ringkasan: pengumuman.teks?.trim() ?? "",
      waktu: pengumuman.diperbaruiPada,
      // Tautan CMS dipakai hanya bila menunjuk rute internal aplikasi.
      tautan:
        pengumuman.tautan && pengumuman.tautan.startsWith("/")
          ? pengumuman.tautan
          : "/dashboard",
      dibaca: false,
    });
  }

  // ===== Sumber 5: pengaduan nasabah (helpdesk dua arah)
  //
  // Yang menjadi notifikasi HANYA perbuatan PETUGAS pada pengaduan nasabah:
  // perpindahan status dan balasan. Pesan yang nasabah tulis sendiri tidak
  // pernah muncul sebagai notifikasi untuk dirinya — memberitahukan orang atas
  // tulisannya sendiri adalah kebisingan, bukan informasi.
  const pengaduan = await ctx.db
    .query("pengaduanNasabah")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  const pengaduanTerbaru = [...pengaduan]
    .sort((a, b) => b.diperbaruiPada - a.diperbaruiPada)
    .slice(0, BATAS_PENGADUAN);

  const itemPengaduan: ItemInternal[] = [];
  for (const p of pengaduanTerbaru) {
    const statusLabel =
      LABEL_STATUS_PENGADUAN[p.status as keyof typeof LABEL_STATUS_PENGADUAN] ?? p.status;
    // Status "baru" berarti belum ada petugas yang menyentuhnya — itu keadaan
    // pengaduan yang baru dikirim sendiri.
    if (p.status !== "baru" && p.petugasLabel !== undefined) {
      const jenis: NotifikasiJenis =
        p.status === "selesai" ? "sukses" : p.status === "ditolak" ? "peringatan" : "info";
      const penyelesaian = (p.penyelesaian ?? "").trim();
      itemPengaduan.push({
        kunci: `pengaduan-status:${p._id}:${p.status}`,
        sumber: "pengaduan",
        ref: p._id,
        jenis,
        judul: `Pengaduan Anda berstatus ${statusLabel}`,
        ringkasan: `${p.nomorReferensi ?? "pengaduan umum"} · ditangani ${p.petugasLabel} · ${kalimatWaktu(p.ditutupPada ?? p.diperbaruiPada, sekarang)}.${
          penyelesaian === "" ? "" : ` Penyelesaian: ${penyelesaian}`
        }`,
        waktu: p.ditutupPada ?? p.diperbaruiPada,
        tautan: "/dashboard?tab=bantuan",
        dibaca: false,
      });
    }

    const pesan = await ctx.db
      .query("pengaduanPesan")
      .withIndex("by_pengaduan_dibuatPada", (q) => q.eq("pengaduanId", p._id))
      .order("desc")
      .take(BATAS_PESAN_PENGADUAN);
    for (const m of pesan) {
      if (m.arah !== "petugas") continue;
      itemPengaduan.push({
        kunci: `pengaduan-pesan:${m._id}`,
        sumber: "pengaduan",
        ref: m._id,
        jenis: "info",
        judul: "Ada balasan pada pengaduan Anda",
        ringkasan: `${p.nomorReferensi ?? "pengaduan umum"} · ${m.penulisLabel} · ${kalimatWaktu(m.dibuatPada, sekarang)}. ${m.isi}`,
        waktu: m.dibuatPada,
        tautan: "/dashboard?tab=bantuan",
        dibaca: false,
      });
    }
  }
  item.push(...itemPengaduan.slice(0, BATAS_PER_SUMBER));

  // ===== Sumber 6: keputusan KYC (verifikasi identitas)
  //
  // Sumbernya `kycRiwayat` — catatan transisi yang sudah ada dan append-only.
  // Yang menjadi notifikasi hanya KEPUTUSAN yang mengubah nasib pengajuan:
  // VERIFIED (lolos), REJECTED (ditolak), NEEDS_CORRECTION (perlu diperbaiki),
  // dan REVERIFICATION_REQUIRED (perlu diulang). Transisi ke IN_PROGRESS/
  // NOT_STARTED dilewati karena itu langkah nasabah sendiri, bukan kabar.
  const riwayatKyc = await ctx.db
    .query("kycRiwayat")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .order("desc")
    .take(BATAS_RIWAYAT_KYC);
  const itemKyc: ItemInternal[] = [];
  for (const r of riwayatKyc) {
    const keputusan: NotifikasiJenis | null =
      r.ke === "VERIFIED"
        ? "sukses"
        : r.ke === "REJECTED"
          ? "peringatan"
          : r.ke === "NEEDS_CORRECTION" || r.ke === "REVERIFICATION_REQUIRED"
            ? "peringatan"
            : null;
    if (keputusan === null) continue;
    const judulKyc =
      r.ke === "VERIFIED"
        ? "Verifikasi identitas Anda selesai"
        : r.ke === "REJECTED"
          ? "Verifikasi identitas Anda ditolak"
          : r.ke === "NEEDS_CORRECTION"
            ? "Verifikasi identitas perlu diperbaiki"
            : "Verifikasi identitas perlu diulang";
    itemKyc.push({
      kunci: `kyc:${r._id}`,
      sumber: "kyc",
      ref: r._id,
      jenis: keputusan,
      judul: judulKyc,
      ringkasan: `${LABEL_STATUS_KYC[r.ke as StatusKyc] ?? r.ke} · diputuskan oleh ${r.aktorLabel} · ${kalimatWaktu(r.waktu, sekarang)}.${
        r.catatan === undefined || r.catatan.trim() === "" ? "" : ` Catatan: ${r.catatan.trim()}`
      }`,
      waktu: r.waktu,
      tautan: "/dashboard?tab=kyc",
      dibaca: false,
    });
  }
  item.push(...itemKyc);

  // ===== Sumber 7: status pinjaman berubah
  //
  // Waktunya diambil dari tanggal yang MEMANG menandai perpindahan itu
  // (didanaiPada/lunasPada/dibatalkanPada) atau `diputuskanPada` untuk keputusan
  // admin (ditolak/ditinjau). Baris lama tanpa penanda dilewati — lebih baik
  // tidak ada notifikasi daripada notifikasi bertanggal karangan.
  const itemPinjaman: ItemInternal[] = [];
  for (const loan of pinjamanTerbaru) {
    if (loan.status === "dibatalkan") {
      const waktu = loan.dibatalkanPada ?? loan.diputuskanPada;
      if (waktu === undefined) continue;
      itemPinjaman.push({
        kunci: `pinjaman:${loan._id}:dibatalkan`,
        sumber: "pinjaman",
        ref: loan._id,
        jenis: "info",
        judul: "Pengajuan Anda dibatalkan",
        ringkasan: `${loan.nomorReferensi} · ${kalimatWaktu(waktu, sekarang)}. Catatan ini bukan utang; hubungi tim PINDAI bila perlu pengajuan baru.`,
        waktu,
        tautan: "/dashboard?tab=pinjaman",
        dibaca: false,
      });
      continue;
    }
    if (loan.status === "ditolak") {
      const waktu = loan.diputuskanPada ?? loan.lunasPada;
      if (waktu === undefined) continue;
      const catatan = (loan.catatanReview ?? "").trim();
      itemPinjaman.push({
        kunci: `pinjaman:${loan._id}:ditolak`,
        sumber: "pinjaman",
        ref: loan._id,
        jenis: "peringatan",
        judul: "Pengajuan pinjaman ditolak",
        ringkasan: `${loan.nomorReferensi} · diputuskan ${kalimatWaktu(waktu, sekarang)}.${
          catatan === "" ? "" : ` Catatan petugas: ${catatan}`
        }`,
        waktu,
        tautan: "/dashboard?tab=pinjaman",
        dibaca: false,
      });
      continue;
    }
    if (loan.status === "lunas") {
      const waktu = loan.lunasPada;
      if (waktu === undefined) continue;
      itemPinjaman.push({
        kunci: `pinjaman:${loan._id}:lunas`,
        sumber: "pinjaman",
        ref: loan._id,
        jenis: "sukses",
        judul: "Pinjaman tercatat lunas",
        ringkasan: `${loan.nomorReferensi} · ${kalimatWaktu(waktu, sekarang)}. Kewajiban pada catatan PINDAI sudah terpenuhi; perpindahan dana ditangani di luar aplikasi.`,
        waktu,
        tautan: "/dashboard?tab=pinjaman",
        dibaca: false,
      });
      continue;
    }
    if (loan.status === "didanai" && loan.didanaiPada !== undefined) {
      const label = referensiPinjaman.get(loan._id) ?? loan.nomorReferensi;
      itemPinjaman.push({
        kunci: `pinjaman:${loan._id}:didanai`,
        sumber: "pinjaman",
        ref: loan._id,
        jenis: "sukses",
        judul: "Pinjaman Anda mulai berjalan",
        ringkasan: `${label} · dicatat berjalan ${kalimatWaktu(loan.didanaiPada, sekarang)}. Jadwal angsuran dan total kewajiban dapat dilihat pada tab Jadwal.`,
        waktu: loan.didanaiPada,
        tautan: "/dashboard?tab=jadwal",
        dibaca: false,
      });
      continue;
    }
    if (loan.status === "sedang_direview" && loan.diputuskanPada !== undefined) {
      itemPinjaman.push({
        kunci: `pinjaman:${loan._id}:ditinjau`,
        sumber: "pinjaman",
        ref: loan._id,
        jenis: "info",
        judul: "Pengajuan pinjaman sedang ditinjau",
        ringkasan: `${loan.nomorReferensi} · masuk peninjauan ${kalimatWaktu(loan.diputuskanPada, sekarang)}. Tidak ada yang perlu Anda lakukan sekarang.`,
        waktu: loan.diputuskanPada,
        tautan: "/dashboard?tab=pinjaman",
        dibaca: false,
      });
    }
  }
  item.push(...itemPinjaman.slice(0, BATAS_PER_SUMBER));

  // ===== Sumber 8: pinjaman yang DIDANAI akun ini tercatat lunas
  //
  // Khusus akun penyedia dana. Kepemilikannya dibaca lewat aturan yang sama
  // dengan ruang pendana (`pinjamanLunasMilikPendana`), jadi kabar ini tidak
  // pernah menyebut pinjaman yang tidak tampil di portofolionya. Yang bisa
  // ditulis hanya angka yang memang tersimpan di pinjamannya.
  const pengguna = await ctx.db.get(userId);
  if (pengguna !== null) {
    const lunasPendana = (await pinjamanLunasMilikPendana(ctx, pengguna, userId)).sort(
      (a, b) => (b.lunasPada ?? 0) - (a.lunasPada ?? 0),
    );
    for (const loan of lunasPendana.slice(0, BATAS_PER_SUMBER)) {
      const waktu = loan.lunasPada;
      if (waktu === undefined) continue;
      item.push({
        kunci: `pendana:${loan._id}:lunas`,
        sumber: "pendana",
        ref: loan._id,
        jenis: "sukses",
        judul: "Pinjaman yang Anda danai tercatat lunas",
        ringkasan: `${loan.nomorReferensi} · pokok ${formatRupiahAman(loan.pokokPinjaman)} · ${kalimatWaktu(waktu, sekarang)}. Hasil dananya tercatat di ruang pendana.`,
        waktu,
        tautan: "/penyedia-dana",
        dibaca: false,
      });
    }
  }

  // ===== Sumber 8b: cicilan kredit barang yang didanai akun ini tercatat
  //
  // Sumbernya alokasi (`kreditFundings`), bukan pengajuan: pendana hanya boleh
  // menerima kabar dari kredit yang porsinya memang miliknya. Yang dilaporkan
  // cicilan TERAKHIR per alokasi — bukan setiap baris lama — supaya pusat
  // notifikasi tidak dibanjiri riwayat cicilan yang sudah lewat.
  if (pengguna !== null) {
    const alokasiKredit = await ctx.db
      .query("kreditFundings")
      .withIndex("by_dana", (q) => q.eq("danaId", userId))
      .collect();
    for (const f of alokasiKredit.filter((a) => a.status !== "dibatalkan").slice(0, 8)) {
      const kredit = await ctx.db.get(f.kreditId);
      if (kredit === null) continue;
      const terakhir = await ctx.db
        .query("kreditPayments")
        .withIndex("by_kredit", (q) => q.eq("kreditId", f.kreditId))
        .order("desc")
        .first();
      if (terakhir === null || terakhir.waktu <= f._creationTime) continue;
      item.push({
        kunci: `pendana:kredit:${f.kreditId}:${terakhir.bulanKe}`,
        sumber: "pendana",
        ref: f.kreditId,
        jenis: terakhir.bulanKe >= kredit.tenorBulan ? "sukses" : "info",
        judul:
          terakhir.bulanKe >= kredit.tenorBulan
            ? "Kredit yang Anda danai tercatat lunas"
            : "Cicilan kredit yang Anda danai sudah dibayar",
        ringkasan: `${kredit.nomorReferensi} · ${kredit.namaBarang} · cicilan ${terakhir.bulanKe}/${kredit.tenorBulan} sebesar ${formatRupiahAman(terakhir.totalDibayar)} · ${kalimatWaktu(terakhir.waktu, sekarang)}. Progres dan hak Imbal Hasil terlihat di ruang pendana.`,
        waktu: terakhir.waktu,
        tautan: "/penyedia-dana",
        dibaca: false,
      });
    }
  }

  // ===== Sumber 9: versi aplikasi Android yang baru diumumkan
  //
  // Sumbernya `pembaruanAplikasi` — baris yang HANYA ditulis admin saat benar-
  // benar mengumumkan versi. Tidak ada pengecekan versi di sini: server tidak
  // tahu APK mana yang sedang dipasang penerima, dan menebaknya akan membuat
  // notifikasi muncul untuk orang yang sudah memakai versi itu. Kuncinya
  // `pembaruan:<versionCode>` sehingga satu versi hanya satu kabar per akun.
  const versiTerbaru = await ctx.db
    .query("pembaruanAplikasi")
    .withIndex("by_versiKode")
    .order("desc")
    .first();
  if (versiTerbaru !== null) {
    const catatan = (versiTerbaru.catatan ?? "").trim();
    item.push({
      kunci: kunciNotifikasiPembaruan(versiTerbaru.versiKode),
      sumber: "pembaruan",
      ref: versiTerbaru._id,
      jenis: "info",
      judul: `PINDAI ${versiTerbaru.versiNama} sudah bisa dipasang`,
      ringkasan: `Versi baru diumumkan ${kalimatWaktu(versiTerbaru.diumumkanPada, sekarang)}.${
        catatan === "" ? "" : ` ${catatan}`
      } Buka bagian pemasangan untuk mengunduh dan memasang.`,
      waktu: versiTerbaru.diumumkanPada,
      tautan: "/#pasang-aplikasi",
      dibaca: false,
    });
  }

  // ===== Sumber: voucher yang hampir kedaluwarsa (H-3) =====
  // Dihitung dari masa berlaku voucher itu sendiri, bukan dari baris pengingat:
  // tidak ada scheduler baru, dan memperpanjang voucher otomatis memindahkan
  // pengingatnya. Voucher yang sudah habis kuotanya tidak diingatkan — tidak ada
  // yang bisa diselamatkan dari kedaluwarsa.
  const voucherSaya = await ctx.db
    .query("voucher")
    .withIndex("by_pemilik", (q) => q.eq("pemilikId", userId))
    .collect();
  const batasIngat = sekarang + VOUCHER_INGAT_HARI * 86_400_000;
  const voucherHampir = voucherSaya
    .filter(
      (row) =>
        row.status === "aktif" &&
        row.terpakai < row.batasPemakaian &&
        row.berlakuSampai >= sekarang &&
        row.berlakuSampai <= batasIngat,
    )
    .sort((a, b) => a.berlakuSampai - b.berlakuSampai)
    .slice(0, BATAS_VOUCHER);
  for (const row of voucherHampir) {
    const sisaHari = Math.max(
      1,
      Math.ceil((row.berlakuSampai - sekarang) / 86_400_000),
    );
    item.push({
      kunci: `voucher:${row._id}:h3`,
      sumber: "voucher",
      ref: row._id,
      jenis: "peringatan",
      judul: "Voucher hampir kedaluwarsa",
      ringkasan: `${row.judul} (${row.kode}) berlaku sampai ${formatTanggalWIB(
        row.berlakuSampai,
      )} — ${sisaHari} hari lagi. Pakai pada pengajuan berikutnya sebelum hangus.`,
      // Waktu notifikasi adalah saat pengingat mulai berlaku, bukan sekarang:
      // tanpa ini item berpindah ke puncak daftar setiap kali halaman dibuka.
      waktu: Math.min(sekarang, row.berlakuSampai - VOUCHER_INGAT_HARI * 86_400_000),
      tautan: "/dashboard?tab=form",
      dibaca: false,
    });
  }

  // ===== Sumber: undian yang dimenangkan akun ini =====
  // Undian lama tetap muncul (bukan hanya kuartal berjalan): pemenang yang baru
  // membuka aplikasi setelah sebulan tetap harus tahu, dan status penyerahan
  // hadiahnya adalah bagian dari kabar itu. Tidak ada pemenang karangan —
  // sumbernya baris `doorprizeUndian` yang benar-benar ditulis saat pengundian.
  const undianTerakhir = await ctx.db
    .query("doorprizeUndian")
    .withIndex("by_diundiPada")
    .order("desc")
    .take(BATAS_UNDIAN);
  for (const row of undianTerakhir) {
    if (row.pemilikId !== userId) continue;
    const diserahkanPada = row.hadiahDiserahkanPada;
    item.push({
      kunci: `undian:${row._id}`,
      sumber: "undian",
      ref: row._id,
      jenis: "sukses",
      judul: `Anda menang undian ${row.periode}`,
      ringkasan:
        diserahkanPada === undefined
          ? `Hadiah ${row.hadiah} tercatat atas nama Anda. Petugas menghubungi nomor terdaftar untuk penyerahannya; tidak ada biaya apa pun untuk menerima hadiah.`
          : `Hadiah ${row.hadiah} sudah dicatat diserahkan pada ${formatTanggalWIB(diserahkanPada)}.`,
      waktu: row.diundiPada,
      tautan: "/dashboard?tab=ringkasan",
      dibaca: false,
    });
  }

  // ===== Keadaan baca untuk sumber yang memakai tabel `notifikasiBaca`
  const baca = await ctx.db
    .query("notifikasiBaca")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  const sudahDibaca = new Set(baca.map((b) => b.kunci));

  const lengkap = item.map((it) =>
    it.sumber === "lokasi" ? it : { ...it, dibaca: sudahDibaca.has(it.kunci) },
  );

  // Urutan SELALU menurut waktu server, terbaru lebih dulu.
  const terurut = lengkap
    .sort((a, b) => b.waktu - a.waktu)
    .slice(0, BATAS_TOTAL);

  return {
    item: terurut,
    belumDibaca: terurut.filter((it) => !it.dibaca).length,
  };
}

/**
 * Daftar notifikasi pengguna yang sedang masuk, terurut menurut waktu server
 * (terbaru lebih dulu) dan dibatasi jumlahnya.
 */
export const daftar = query({
  args: {},
  handler: async (ctx) => {
    const { userId } = await requirePengguna(ctx);
    const { item, belumDibaca } = await susunNotifikasi(ctx, userId);
    // `sumber`/`ref` adalah urusan internal — klien hanya perlu kuncinya.
    return {
      item: item.map(({ kunci, jenis, judul, ringkasan, waktu, tautan, dibaca }) => ({
        kunci,
        jenis,
        judul,
        ringkasan,
        waktu,
        tautan,
        dibaca,
      })),
      belumDibaca,
    };
  },
});

/** Satu notifikasi yang cocok dengan kunci pada daftar yang sedang berlaku. */
async function cariItem(
  ctx: QueryCtx,
  userId: Id<"users">,
  kunci: string,
): Promise<ItemInternal | null> {
  const { item } = await susunNotifikasi(ctx, userId);
  return item.find((it) => it.kunci === kunci) ?? null;
}

/**
 * Catat bahwa satu notifikasi sudah dibaca.
 *
 * Peringatan lokasi memakai kolom `dibacaPada` pada barisnya sendiri (sumber
 * yang sama dengan banner dashboard); sumber lain menulis satu baris
 * `notifikasiBaca`. Tidak ada pembaruan optimistis di klien: keadaan baca
 * berasal dari server, dan Convex menyiarkan hasilnya kembali.
 */
async function catatDibaca(
  ctx: MutationCtx,
  userId: Id<"users">,
  item: ItemInternal,
  sekarang: number,
): Promise<void> {
  if (item.sumber === "lokasi" && item.ref !== null) {
    const baris = await ctx.db.get(item.ref as Id<"lokasiPeringatan">);
    if (baris !== null && baris.dibacaPada === undefined) {
      await ctx.db.patch(baris._id, { dibacaPada: sekarang });
    }
    return;
  }
  const ada = await ctx.db
    .query("notifikasiBaca")
    .withIndex("by_user_kunci", (q) => q.eq("userId", userId).eq("kunci", item.kunci))
    .first();
  if (ada === null) {
    await ctx.db.insert("notifikasiBaca", {
      userId,
      kunci: item.kunci,
      sumber: item.sumber,
      dibacaPada: sekarang,
    });
  }
}

/** Tandai SATU notifikasi sebagai sudah dibaca. */
export const tandaiDibaca = mutation({
  args: { kunci: v.string() },
  handler: async (ctx, { kunci }) => {
    const { userId } = await requirePengguna(ctx);
    const item = await cariItem(ctx, userId, kunci);
    if (item === null) {
      // Kunci yang tidak (lagi) ada di daftar ditolak: klien yang basi tidak
      // boleh menumpuk baris baca untuk notifikasi yang sudah tidak berlaku.
      throw new Error("Notifikasi tidak ditemukan atau sudah tidak berlaku.");
    }
    if (item.dibaca) return { ok: true as const, sudahDibaca: true };
    await catatDibaca(ctx, userId, item, Date.now());
    return { ok: true as const, sudahDibaca: false };
  },
});

/**
 * Tandai SEMUA notifikasi yang sedang belum dibaca.
 *
 * Daftarnya dihitung server, bukan dikirim klien: klien tidak bisa menandai
 * notifikasi yang bukan miliknya, dan tidak ada notifikasi yang terlewat karena
 * daftar di layar sudah basi.
 */
export const tandaiSemuaDibaca = mutation({
  args: {},
  handler: async (ctx) => {
    const { userId } = await requirePengguna(ctx);
    const { item } = await susunNotifikasi(ctx, userId);
    const sekarang = Date.now();
    let ditandai = 0;
    for (const it of item) {
      if (it.dibaca) continue;
      await catatDibaca(ctx, userId, it, sekarang);
      ditandai += 1;
    }
    return { ok: true as const, ditandai };
  },
});
