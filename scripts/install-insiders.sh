#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PACKAGE="$ROOT/package.json"

if [[ ! -f "$PACKAGE" ]]; then
  echo "package.json not found at $PACKAGE" >&2
  exit 1
fi

NAME=$(node -p "require('./package.json').name")
VERSION=$(node -p "require('./package.json').version")
VSIX="$ROOT/${NAME}-${VERSION}.vsix"

VSCE_BIN="$ROOT/node_modules/.bin/vsce"
VSCE_MAIN="$ROOT/node_modules/@vscode/vsce/out/main.js"
if [[ ! -f "$VSCE_BIN" && ! -f "$VSCE_MAIN" ]]; then
  echo "VSCE not found in node_modules. Run npm install." >&2
  exit 1
fi

echo "Building ForgeFlow VSIX..."
npm install --include=dev
npm run compile
if [[ -f "$VSCE_BIN" ]]; then
  "$VSCE_BIN" package --allow-missing-repository
else
  node "$VSCE_MAIN" package --allow-missing-repository
fi

if [[ ! -f "$VSIX" ]]; then
  echo "VSIX not found at $VSIX" >&2
  exit 1
fi

if ! command -v wslpath >/dev/null 2>&1; then
  echo "wslpath not available. Install from within Windows PowerShell instead." >&2
  exit 1
fi

WIN_VSIX="$(wslpath -w "$VSIX")"

echo "Installing into VS Code Insiders (Windows)..."
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "code-insiders --install-extension \"$WIN_VSIX\" --force"

echo "Installed. Reload VS Code Insiders to activate the update."
