/**
 * PINDAI WhatsApp Sender — jembatan Baileys untuk gateway generik PINDAI.
 *
 * Kontrak yang dipenuhi (lihat src/lib/waUrl.ts + kirimViaGateway di PINDAI):
 *   POST <apiUrl>   Authorization: Bearer <token>   JSON { target, message }
 *   2xx JSON tanpa status:false / success:false  = terkirim
 *
 * WAJIB di belakang HTTPS port 443 dengan nama domain publik; PINDAI menolak
 * http://, alamat IP literal, dan port selain 443.
 */
import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} from "@whiskeysockets/baileys";
import P from "pino";

const AKAR = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.WA_SENDER_PORT ?? 8787);
const HOST = process.env.WA_SENDER_HOST ?? "127.0.0.1";
const TOKEN = (process.env.WA_SENDER_TOKEN ?? "").trim();
const FOLDER_AUTH = process.env.WA_SENDER_AUTH ?? join(AKAR, "auth");
/** Nomor untuk "Tautkan dengan nomor telepon". Kosong = pakai QR. */
const PAIRING = (process.env.WA_SENDER_PAIRING ?? "").replace(/[^\d]/g, "");
const FIELD_NOMOR = process.env.WA_SENDER_FIELD_NOMOR ?? "target";
const FIELD_PESAN = process.env.WA_SENDER_FIELD_PESAN ?? "message";

if (TOKEN.length < 24) {
  console.error("WA_SENDER_TOKEN wajib minimal 24 karakter.");
  process.exit(1);
}

const log = P({ level: process.env.WA_SENDER_LOG ?? "warn" });
if (!existsSync(FOLDER_AUTH)) mkdirSync(FOLDER_AUTH, { recursive: true });

let sock = null;
let siap = false;
let alasan = "belum terhubung";
let pairingDiminta = false;

async function sambungkan() {
  const { state, saveCreds } = await useMultiFileAuthState(FOLDER_AUTH);
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: state,
    logger: log,
    syncFullHistory: false,
    markOnlineOnConnect: false,
    browser: ["PINDAI Sender", "Chrome", "1.0.0"],
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (u) => {
    const { connection, lastDisconnect, qr } = u;

    // Kode pautan lebih andal daripada QR di web console.
    if (qr && PAIRING && !pairingDiminta) {
      pairingDiminta = true;
      try {
        const kode = await sock.requestPairingCode(PAIRING);
        console.log("");
        console.log("=================================================");
        console.log(" KODE PAUTAN WHATSAPP: " + kode);
        console.log("=================================================");
        console.log(" WhatsApp > Perangkat Tertaut > Tautkan perangkat");
        console.log(" > Tautkan dengan nomor telepon > masukkan kode di atas.");
        console.log("");
      } catch (e) {
        console.error("gagal meminta kode pautan:", e?.message ?? e);
        pairingDiminta = false;
      }
    }

    if (connection === "open") {
      siap = true;
      alasan = "";
      console.log("[wa-sender] tersambung ke WhatsApp.");
    }

    if (connection === "close") {
      siap = false;
      const kode = lastDisconnect?.error?.output?.statusCode;
      const keluar = kode === DisconnectReason.loggedOut;
      alasan = keluar ? "sesi logout - pautkan ulang" : "terputus (" + (kode ?? "?") + ")";
      console.warn("[wa-sender]", alasan);
      if (keluar) {
        console.error("[wa-sender] Hapus folder auth/ lalu jalankan ulang untuk pautkan baru.");
        return;
      }
      setTimeout(() => {
        sambungkan().catch(() => setTimeout(sambungkan, 5000));
      }, 2000);
    }
  });
}

function tokenCocok(diberikan) {
  const a = Buffer.from(diberikan ?? "", "utf8");
  const b = Buffer.from(TOKEN, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function keJid(nomor) {
  const bersih = String(nomor).replace(/[^\d]/g, "");
  if (bersih === "") return null;
  const kanonik = bersih.startsWith("0") ? "62" + bersih.slice(1) : bersih;
  return kanonik + "@s.whatsapp.net";
}

function balas(res, status, objek) {
  const isi = JSON.stringify(objek);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(isi),
    "Cache-Control": "no-store",
  });
  res.end(isi);
}

function bacaBody(req, maksByte = 65536) {
  return new Promise((resolve, reject) => {
    let total = 0;
    const bagian = [];
    req.on("data", (c) => {
      total += c.length;
      if (total > maksByte) {
        reject(new Error("body terlalu besar"));
        req.destroy();
        return;
      }
      bagian.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(bagian).toString("utf8")));
    req.on("error", reject);
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");

  if (req.method === "GET" && url.pathname === "/health") {
    return balas(res, siap ? 200 : 503, { ok: siap, siap, alasan: siap ? null : alasan });
  }

  if (url.pathname !== "/send") {
    return balas(res, 404, { ok: false, message: "Pakai POST /send." });
  }
  if (req.method !== "POST") {
    return balas(res, 405, { ok: false, message: "Gunakan POST." });
  }

  const header = req.headers["authorization"] ?? "";
  const token = header.toLowerCase().startsWith("bearer ")
    ? header.slice(7).trim()
    : header.trim();
  if (!tokenCocok(token)) {
    return balas(res, 401, { ok: false, message: "Token tidak sah." });
  }

  let isi;
  try {
    isi = JSON.parse(await bacaBody(req));
  } catch {
    return balas(res, 400, { ok: false, message: "Body harus JSON." });
  }
  if (typeof isi !== "object" || isi === null || Array.isArray(isi)) {
    return balas(res, 400, { ok: false, message: "Body harus objek JSON." });
  }

  const nomor = isi[FIELD_NOMOR];
  const pesan = isi[FIELD_PESAN];
  if (typeof nomor !== "string" || nomor.trim() === "") {
    return balas(res, 400, { ok: false, message: "Field " + FIELD_NOMOR + " wajib." });
  }
  if (typeof pesan !== "string" || pesan.trim() === "") {
    return balas(res, 400, { ok: false, message: "Field " + FIELD_PESAN + " wajib." });
  }

  if (!siap || sock === null) {
    return balas(res, 503, { ok: false, message: "WhatsApp belum siap: " + alasan + "." });
  }

  const jid = keJid(nomor);
  if (jid === null) {
    return balas(res, 400, { ok: false, message: "Nomor tidak valid." });
  }

  try {
    const ada = await sock.onWhatsApp(jid);
    if (!Array.isArray(ada) || ada.length === 0 || ada[0]?.exists !== true) {
      return balas(res, 400, { ok: false, message: "Nomor tidak terdaftar di WhatsApp." });
    }
  } catch (e) {
    log.warn({ err: e }, "onWhatsApp gagal; kirim langsung");
  }

  try {
    const hasil = await sock.sendMessage(jid, { text: pesan });
    return balas(res, 200, { ok: true, status: true, id: hasil?.key?.id ?? null, target: jid });
  } catch (e) {
    const pesanGalat = e instanceof Error ? e.message : String(e);
    log.error({ err: e }, "gagal mengirim");
    return balas(res, 502, { ok: false, message: "Gagal kirim: " + pesanGalat });
  }
});

server.listen(PORT, HOST, () => {
  console.log("[wa-sender] http://" + HOST + ":" + PORT);
  console.log("[wa-sender] field nomor=" + FIELD_NOMOR + " pesan=" + FIELD_PESAN);
  console.log("[wa-sender] mode pautan: " + (PAIRING ? "kode telepon (" + PAIRING + ")" : "QR"));
  sambungkan().catch((e) => {
    console.error("[wa-sender] gagal menyambung:", e?.message ?? e);
    process.exit(1);
  });
});

for (const sinyal of ["SIGINT", "SIGTERM"]) {
  process.on(sinyal, () => {
    console.log("\n[wa-sender] " + sinyal + " diterima, menutup...");
    try {
      sock?.end(undefined);
    } catch {}
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000);
  });
}
