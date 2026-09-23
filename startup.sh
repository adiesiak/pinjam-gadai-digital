#!/usr/bin/env bash
# =============================================================================
# STOP-UP! — Kiosk Mode Lockdown (Linux / ChromeOS / Raspberry Pi OS)
#
# Menjalankan Chrome/Chromium dalam mode kiosk penuh untuk terminal sentuh:
#   * tanpa address bar, tab, maupun dialog
#   * tanpa pinch-to-zoom & swipe navigasi
#   * cetak struk tanpa dialog (--kiosk-printing)
#
# Pakai:
#   ./startup.sh                       # http://localhost:8080/
#   STOPUP_URL=https://app.example/ ./startup.sh
#   CHROME_BIN=/usr/bin/chromium ./startup.sh
#
# Agar terminal tidak bisa keluar dari aplikasi, jalankan skrip ini dari
# autostart sesi desktop dan matikan shortcut keluar (lihat catatan di bawah).
# =============================================================================
set -euo pipefail

URL="${STOPUP_URL:-http://localhost:8080/}"
CHROME_BIN="${CHROME_BIN:-}"

if [[ -z "$CHROME_BIN" ]]; then
  for kandidat in google-chrome google-chrome-stable chromium chromium-browser; do
    if command -v "$kandidat" >/dev/null 2>&1; then
      CHROME_BIN="$(command -v "$kandidat")"
      break
    fi
  done
fi

if [[ -z "$CHROME_BIN" ]]; then
  echo "Chrome/Chromium tidak ditemukan. Set CHROME_BIN=/path/ke/chrome" >&2
  exit 1
fi

# Profil persisten: izin Web Serial (printer thermal) & kamera cukup diberikan
# sekali, lalu tersimpan untuk boot berikutnya.
PROFIL="${STOPUP_PROFILE:-$HOME/.stopup-kiosk-profile}"
mkdir -p "$PROFIL"

echo "STOP-UP! kiosk → $URL (browser: $CHROME_BIN)"

exec "$CHROME_BIN" \
  --kiosk "$URL" \
  --user-data-dir="$PROFIL" \
  --start-fullscreen \
  --kiosk-printing \
  --no-first-run \
  --no-default-browser-check \
  --noerrdialogs \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --disable-pinch \
  --overscroll-history-navigation=0 \
  --disable-features=Translate,TranslateUI,BackForwardCache,MediaRouter \
  --autoplay-policy=no-user-gesture-required \
  --check-for-update-interval=31536000 \
  --disable-component-update \
  --disable-background-networking \
  --password-store=basic \
  --use-mock-keychain

# ---------------------------------------------------------------------------
# Pengerasan tambahan (jalankan sekali sebagai root di perangkat terminal):
#
#   * Nonaktifkan pintasan keluar Chrome:
#       - Mode kiosk tidak menyediakan tombol keluar, tetapi Alt+F4 masih aktif.
#   * Blokir Alt+F4 / Ctrl+Alt+F* lewat window manager, mis. dengan
#     keyd/gsettings atau xbindkeys pada sistem X11.
#   * Autostart saat login (GNOME):
#       mkdir -p ~/.config/autostart
#       cp startup.desktop ~/.config/autostart/
#   * Kunci orientasi & matikan screensaver:
#       xset s off -dpms
#
# Pintasan F12 / Ctrl+W / Ctrl+R / Ctrl+P / Alt+Tab dan klik-kanan sudah
# diblokir dari dalam aplikasi (lihat mode kiosk lockdown di src/pages/Terminal.tsx).
# ---------------------------------------------------------------------------
