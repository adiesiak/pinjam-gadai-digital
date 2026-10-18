#!/usr/bin/env bash
# Bangun APK PINDAI tanpa Gradle: aapt2 → javac → d8 → zipalign → apksigner.
#
# Kenapa tanpa Gradle: proyek ini satu Activity dan tidak butuh AndroidX, jadi
# AGP + Gradle hanya menambah unduhan ratusan MB tanpa manfaat. Alat yang
# dipakai semuanya dari Android SDK build-tools.
#
# Wajib diisi:
#   JAVA_HOME      JDK 17
#   ANDROID_SDK    SDK dengan platforms/android-34 dan build-tools/34.0.0
# Opsional:
#   PINDAI_KEYSTORE  lokasi keystore (default ~/.pindai/pindai-release.jks)
#   PINDAI_KS_PASS   kata sandi keystore (default dibuat acak bila keystore baru)
#   PINDAI_URL       alamat yang dimuat aplikasi (default lihat MainActivity)
#
# Hasil: public/pindai.apk
set -euo pipefail

AKAR="$(cd "$(dirname "$0")" && pwd)"
PROYEK="$(cd "$AKAR/.." && pwd)"
SDK="${ANDROID_SDK:?ANDROID_SDK belum diisi}"
BT="$SDK/build-tools/34.0.0"
ANDROID_JAR="$SDK/platforms/android-34/android.jar"
KELUARAN="$PROYEK/public/pindai.apk"
BANGUN="$AKAR/build"

# Satu-satunya tempat versi ditulis. Nilai ini masuk ke APK dan ke
# public/version.json yang dibaca aplikasi untuk menawarkan pembaruan, jadi
# keduanya tidak bisa berbeda. Naikkan keduanya setiap merilis APK.
VERSI_KODE=4
VERSI_NAMA=1.3.0

: "${JAVA_HOME:?JAVA_HOME belum diisi}"
export PATH="$JAVA_HOME/bin:$PATH"

rm -rf "$BANGUN"
mkdir -p "$BANGUN/gen" "$BANGUN/classes" "$BANGUN/dex"

echo "→ kompilasi resource"
"$BT/aapt2" compile --dir "$AKAR/res" -o "$BANGUN/res.zip"

echo "→ tautkan manifest + resource"
"$BT/aapt2" link \
  -o "$BANGUN/base.apk" \
  -I "$ANDROID_JAR" \
  --manifest "$AKAR/AndroidManifest.xml" \
  -R "$BANGUN/res.zip" \
  --java "$BANGUN/gen" \
  --min-sdk-version 23 \
  --target-sdk-version 34 \
  --version-code "$VERSI_KODE" \
  --version-name "$VERSI_NAMA" \
  --auto-add-overlay

echo "→ kompilasi Java"
javac -source 17 -target 17 -encoding UTF-8 \
  -classpath "$ANDROID_JAR" \
  -d "$BANGUN/classes" \
  $(find "$BANGUN/gen" "$AKAR/src" -name '*.java')

echo "→ dex"
"$BT/d8" --lib "$ANDROID_JAR" --min-api 23 --output "$BANGUN/dex" \
  $(find "$BANGUN/classes" -name '*.class')
( cd "$BANGUN/dex" && zip -q -X "$BANGUN/base.apk" classes.dex )

echo "→ sejajarkan"
"$BT/zipalign" -f 4 "$BANGUN/base.apk" "$BANGUN/aligned.apk"

# Keystore: dibuat sekali bila belum ada. Simpan berkasnya — tanpa keystore yang
# sama, pembaruan APK tidak bisa dipasang menimpa versi lama.
KS="${PINDAI_KEYSTORE:-$HOME/.pindai/pindai-release.jks}"
if [ ! -f "$KS" ]; then
  mkdir -p "$(dirname "$KS")"
  PASS="${PINDAI_KS_PASS:-$(head -c 18 /dev/urandom | base64 | tr -dc 'A-Za-z0-9')}"
  keytool -genkeypair -keystore "$KS" -alias pindai \
    -keyalg RSA -keysize 2048 -validity 10000 \
    -storepass "$PASS" -keypass "$PASS" \
    -dname "CN=PINDAI, O=PINDAI, C=ID" >/dev/null 2>&1
  printf '%s' "$PASS" > "$KS.pass"
  echo "   keystore baru: $KS (kata sandi di $KS.pass)"
else
  PASS="${PINDAI_KS_PASS:-$(cat "$KS.pass")}"
fi

echo "→ tanda tangan"
"$BT/apksigner" sign \
  --ks "$KS" --ks-key-alias pindai \
  --ks-pass "pass:$PASS" --key-pass "pass:$PASS" \
  --out "$KELUARAN" "$BANGUN/aligned.apk"
"$BT/apksigner" verify --print-certs "$KELUARAN" | head -3

# Aplikasi yang sudah terpasang membaca berkas ini untuk tahu ada versi baru.
cat > "$PROYEK/public/version.json" <<JSON
{
  "versionCode": $VERSI_KODE,
  "versionName": "$VERSI_NAMA",
  "apkUrl": "/pindai.apk"
}
JSON

echo "→ selesai: $KELUARAN ($(du -h "$KELUARAN" | cut -f1)) versi $VERSI_NAMA ($VERSI_KODE)"
