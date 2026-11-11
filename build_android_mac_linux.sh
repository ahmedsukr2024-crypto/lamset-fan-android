#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
command -v node >/dev/null || { echo "Node.js is required."; exit 1; }
command -v npm >/dev/null || { echo "npm is required."; exit 1; }
[ -d node_modules ] || npm install
[ -f android/gradlew ] || npx cap add android
npx cap sync android
cd android
chmod +x gradlew
./gradlew assembleDebug
echo "APK created at: $(pwd)/app/build/outputs/apk/debug/app-debug.apk"
