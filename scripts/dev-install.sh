#!/usr/bin/env bash
set -euo pipefail

INSIDERS=1
FORCE=0

for arg in "$@"; do
  case "$arg" in
    --stable) INSIDERS=0 ;;
    --force) FORCE=1 ;;
  esac
  shift || true
 done

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PACKAGE="$ROOT/package.json"
if [[ ! -f "$PACKAGE" ]]; then
  echo "package.json not found at $PACKAGE" >&2
  exit 1
fi

PUBLISHER=$(python - <<'PY'
import json
print(json.load(open('package.json'))['publisher'])
PY
)
NAME=$(python - <<'PY'
import json
print(json.load(open('package.json'))['name'])
PY
)
VERSION=$(python - <<'PY'
import json
print(json.load(open('package.json'))['version'])
PY
)

EXT_ID="$PUBLISHER.$NAME"
EXT_FOLDER="$EXT_ID-$VERSION"

if [[ $INSIDERS -eq 1 ]]; then
  EXT_ROOT="$HOME/.vscode-insiders/extensions"
else
  EXT_ROOT="$HOME/.vscode/extensions"
fi

mkdir -p "$EXT_ROOT"

if compgen -G "$EXT_ROOT/$EXT_ID*" > /dev/null; then
  if [[ $FORCE -eq 1 ]]; then
    rm -rf "$EXT_ROOT/$EXT_ID"* || true
  else
    echo "Existing extension found. Re-run with --force to replace." >&2
    exit 1
  fi
fi

TARGET="$EXT_ROOT/$EXT_FOLDER"
ln -s "$ROOT" "$TARGET"

echo "Linked $TARGET -> $ROOT"
echo "Run 'npm run compile' after changes, then reload VS Code." 
