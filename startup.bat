@echo off
REM ============================================================================
REM STOP-UP! - Kiosk Mode Lockdown (Windows)
REM
REM Menjalankan Chrome dalam mode kiosk penuh untuk terminal sentuh:
REM   * tanpa address bar, tab, maupun dialog
REM   * cetak struk tanpa dialog (--kiosk-printing)
REM
REM Pakai:
REM   startup.bat
REM   set STOPUP_URL=https://app.example/  && startup.bat
REM ============================================================================
setlocal enableextensions

if "%STOPUP_URL%"=="" set "STOPUP_URL=http://localhost:8080/"

set "CHROME="
if not "%CHROME_BIN%"=="" set "CHROME=%CHROME_BIN%"
if "%CHROME%"=="" if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if "%CHROME%"=="" if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if "%CHROME%"=="" if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" set "CHROME=%LocalAppData%\Google\Chrome\Application\chrome.exe"
if "%CHROME%"=="" if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" set "CHROME=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"

if "%CHROME%"=="" (
  echo Chrome/Edge tidak ditemukan. Set CHROME_BIN ke path chrome.exe
  pause
  exit /b 1
)

REM Profil persisten: izin Web Serial (printer thermal) & kamera cukup sekali.
set "PROFIL=%USERPROFILE%\.stopup-kiosk-profile"
if not exist "%PROFIL%" mkdir "%PROFIL%"

echo STOP-UP! kiosk -^> %STOPUP_URL%
start "" "%CHROME%" ^
  --kiosk "%STOPUP_URL%" ^
  --user-data-dir="%PROFIL%" ^
  --start-fullscreen ^
  --kiosk-printing ^
  --no-first-run ^
  --no-default-browser-check ^
  --noerrdialogs ^
  --disable-infobars ^
  --disable-session-crashed-bubble ^
  --disable-pinch ^
  --overscroll-history-navigation=0 ^
  --disable-features=Translate,TranslateUI,BackForwardCache,MediaRouter ^
  --autoplay-policy=no-user-gesture-required ^
  --check-for-update-interval=31536000 ^
  --disable-component-update ^
  --password-store=basic

endlocal
exit /b 0

REM ---------------------------------------------------------------------------
REM Pengerasan tambahan di perangkat terminal Windows:
REM
REM   * Jalankan sebagai shell pengganti akun kiosk (Ganti shell via
REM     regedit: HKCU\Software\Microsoft\Windows NT\CurrentVersion\Winlogon
REM     -> Shell = C:\stopup\startup.bat).
REM   * Blokir Alt+F4 & Ctrl+Alt+Del lewat Group Policy (Ctrl+Alt+Del tidak
REM     bisa dinonaktifkan sepenuhnya pada Windows Pro/Home).
REM   * Matikan screensaver & sleep:
REM       powercfg /change monitor-timeout-ac 0
REM       powercfg /change standby-timeout-ac 0
REM
REM Pintasan F12 / Ctrl+W / Ctrl+R / Ctrl+P / Alt+Tab dan klik-kanan sudah
REM diblokir dari dalam aplikasi (lihat mode kiosk lockdown di
REM src/pages/Terminal.tsx).
REM ---------------------------------------------------------------------------
