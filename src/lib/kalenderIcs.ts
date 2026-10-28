/**
 * Berkas kalender (.ics) untuk jadwal tagihan PINDAI.
 *
 * Satu-satunya kegunaan berkas ini: nasabah menekan "Simpan ke kalender", lalu
 * tanggal jatuh tempo muncul di kalender ponselnya — bukan hanya di chat
 * WhatsApp yang bisa terlewat. Karena itu setiap acara adalah acara
 * SEPANJANG HARI: jatuh tempo adalah tanggal kalender WIB, bukan jam tertentu.
 *
 * Aturan format yang dipatuhi (RFC 5545) seperlunya:
 *  - akhir baris CRLF, bukan LF;
 *  - teks di-escape (`\\`, `;`, `,`, baris baru);
 *  - baris dilipat pada 75 oktet, lanjutan diawali satu spasi;
 *  - `DTEND` acara sepanjang hari bersifat EKSKLUSIF, jadi tanggalnya +1 hari.
 *
 * Fungsi di sini murni (tanpa DOM): pembuatan blob dan unduhan dilakukan
 * pemanggil, sehingga formatnya bisa diuji sebagai skrip biasa.
 */
import { awalHariWIB, tanggalWIB } from "./waktu";

const MS_HARI = 86_400_000;

/** Satu tanggal yang ditulis ke kalender. */
export type AcaraKalender = {
  /** Identitas stabil; dua acara dengan uid sama hanya ditulis sekali. */
  uid: string;
  judul: string;
  deskripsi?: string;
  /** Waktu acara (epoch ms); hanya tanggal WIB-nya yang dipakai. */
  mulai: number;
  /**
   * Pengingat beberapa hari sebelumnya. Bawaannya 1 hari; `0` menghapus
   * pengingat sama sekali.
   */
  pengingatHari?: number;
};

/** Tanggal kalender WIB sebagai `YYYYMMDD`, format nilai DATE di iCalendar. */
function tanggalIcs(ms: number): string {
  return tanggalWIB(ms).replace(/-/g, "");
}

/** Cap waktu UTC `YYYYMMDDTHHMMSSZ` untuk `DTSTAMP`. */
function capWaktuUtc(ms: number): string {
  return new Date(ms)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

/**
 * Escape teks iCalendar. Backslash lebih dulu supaya escape yang ditambahkan
 * di bawah tidak ikut di-escape ulang.
 */
function escapeTeks(nilai: string): string {
  return nilai
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/**
 * Lipat satu baris pada 75 oktet. Pemotongan dilakukan per karakter, bukan per
 * byte, supaya huruf beraksen atau emoji tidak terbelah dan berkasnya tetap
 * bisa dibaca aplikasi kalender.
 */
function lipatBaris(baris: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(baris).length <= 75) return baris;
  const potong: string[] = [];
  let sekarang = "";
  let oktet = 0;
  for (const karakter of baris) {
    const lebar = encoder.encode(karakter).length;
    // Baris lanjutan diawali satu spasi, jadi isinya hanya boleh 74 oktet.
    const batas = potong.length === 0 ? 75 : 74;
    if (oktet + lebar > batas) {
      potong.push(sekarang);
      sekarang = "";
      oktet = 0;
    }
    sekarang += karakter;
    oktet += lebar;
  }
  if (sekarang !== "") potong.push(sekarang);
  return potong.join("\r\n ");
}

/**
 * Nama berkas unduhan, mis. `pindai-jadwal-2026-10-28.ics`.
 *
 * `dasar` dibersihkan dari karakter yang tidak aman di nama berkas; tanggalnya
 * memakai kalender WIB supaya sama dengan tanggal yang dilihat nasabah.
 */
export function namaBerkasIcs(dasar = "pindai-jadwal", sekarang = Date.now()): string {
  const bersih = dasar
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${bersih === "" ? "pindai-jadwal" : bersih}-${tanggalWIB(sekarang)}.ics`;
}

/**
 * Susun isi berkas `.ics` dari daftar acara.
 *
 * Acara dengan `uid` ganda dilewati yang kedua: satu tagihan cukup satu acara,
 * dan pengimporan ganda adalah cara termudah membuat kalender penuh duplikat.
 */
export function buatIcs(
  acara: readonly AcaraKalender[],
  opsi: { sekarang?: number; namaKalender?: string } = {},
): string {
  const sekarang = opsi.sekarang ?? Date.now();
  if (!Number.isFinite(sekarang)) {
    throw new Error("Waktu pembuatan kalender tidak valid.");
  }
  const namaKalender = (opsi.namaKalender ?? "Jadwal tagihan PINDAI").trim();
  const baris: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//PINDAI//Jadwal Tagihan//ID",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeTeks(namaKalender === "" ? "Jadwal tagihan PINDAI" : namaKalender)}`,
  ];
  const sudahDitulis = new Set<string>();
  const cap = capWaktuUtc(sekarang);

  for (const item of acara) {
    if (!Number.isFinite(item.mulai)) {
      throw new Error(`Tanggal acara "${item.judul}" tidak valid.`);
    }
    const uid = item.uid.trim();
    const judul = item.judul.trim();
    if (uid === "" || judul === "") {
      throw new Error("Setiap acara kalender wajib punya uid dan judul.");
    }
    if (sudahDitulis.has(uid)) continue;
    sudahDitulis.add(uid);

    const mulai = tanggalIcs(item.mulai);
    // DTEND eksklusif: hari berikutnya, supaya acara tetap satu hari penuh.
    const selesai = tanggalIcs(awalHariWIB(item.mulai) + MS_HARI);

    baris.push(
      "BEGIN:VEVENT",
      `UID:${escapeTeks(uid)}@pindai`,
      `DTSTAMP:${cap}`,
      `DTSTART;VALUE=DATE:${mulai}`,
      `DTEND;VALUE=DATE:${selesai}`,
      `SUMMARY:${escapeTeks(judul)}`,
      "TRANSP:TRANSPARENT",
    );
    if (item.deskripsi !== undefined && item.deskripsi.trim() !== "") {
      baris.push(`DESCRIPTION:${escapeTeks(item.deskripsi.trim())}`);
    }
    const pengingat = item.pengingatHari ?? 1;
    if (pengingat > 0) {
      baris.push(
        "BEGIN:VALARM",
        "ACTION:DISPLAY",
        `DESCRIPTION:${escapeTeks(judul)}`,
        `TRIGGER:-P${Math.round(pengingat)}D`,
        "END:VALARM",
      );
    }
    baris.push("END:VEVENT");
  }

  baris.push("END:VCALENDAR");
  // RFC 5545 meminta CRLF di akhir SETIAP baris, termasuk baris terakhir.
  return `${baris.map(lipatBaris).join("\r\n")}\r\n`;
}
