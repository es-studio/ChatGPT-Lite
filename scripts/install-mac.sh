#!/usr/bin/env bash
# dist:mac 빌드 후 /Applications에 앱 설치

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
RELEASE_DIR="$PROJECT_ROOT/release"
APP_NAME="ChatGPT-Lite.app"

# release 폴더에서 .app 찾기 (mac-arm64, mac 등)
APP_PATH=$(find "$RELEASE_DIR" -maxdepth 2 -name "$APP_NAME" -type d 2>/dev/null | head -1)

if [ -z "$APP_PATH" ]; then
  echo "Error: $APP_NAME not found in release/"
  exit 1
fi

echo "Installing $APP_NAME to /Applications..."
cp -Rf "$APP_PATH" /Applications/

echo "Done. ChatGPT-Lite is now in /Applications."
