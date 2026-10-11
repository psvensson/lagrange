#!/bin/sh
set -eu

REVISION='0d66b0cb67e7778500e33e65dcd9155163070458'
HERE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
OUT="$HERE/production-release-source-$REVISION"
mkdir -p "$OUT"

git show "$REVISION:Dockerfile" > "$OUT/Dockerfile"
git show "$REVISION:.github/workflows/release.yml" > "$OUT/release.yml"
git show "$REVISION:package.json" > "$OUT/package.json"
git show "$REVISION:package-lock.json" > "$OUT/package-lock.json"
sha256sum "$OUT/Dockerfile" "$OUT/release.yml" "$OUT/package.json" "$OUT/package-lock.json" > "$OUT/SHA256SUMS"
