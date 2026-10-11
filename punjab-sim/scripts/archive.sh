#!/usr/bin/env bash
# Copies files into archive/ with a date and version stamp before they are edited.
# Usage: scripts/archive.sh src/sim/model.ts [more files...]
set -euo pipefail
cd "$(dirname "$0")/.."
today=$(date +%F)
for f in "$@"; do
  [ -f "$f" ] || { echo "skip (missing): $f"; continue; }
  base=$(basename "$f"); name="${base%.*}"; ext="${base##*.}"
  dir="archive/$(dirname "$f")"; mkdir -p "$dir"
  v=1; while [ -e "$dir/${name}_${today}_v${v}.${ext}" ]; do v=$((v+1)); done
  cp "$f" "$dir/${name}_${today}_v${v}.${ext}"
  echo "archived $f -> $dir/${name}_${today}_v${v}.${ext}"
done
