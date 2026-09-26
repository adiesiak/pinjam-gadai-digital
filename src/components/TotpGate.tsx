/**
 * TotpGate — 2FA TOTP untuk Super Admin.
 *
 * Dua mode:
 *  1. Setup (dialog): admin memindai QR di Google Authenticator/Authy lalu
 *     memasukkan kode pertama untuk aktivasi.
 *  2. Gate (fullscreen per sesi): tiap sesi browser baru wajib satu kali kode
 *     TOTP sebelum panel admin terbuka (anti replay per kode 30 detik).
 *
 * Implementasi ada di `./totp/*`.
 */
export { TotpSetupDialog } from "./totp/TotpSetupDialog";
export { TotpGate } from "./totp/TotpGate";
