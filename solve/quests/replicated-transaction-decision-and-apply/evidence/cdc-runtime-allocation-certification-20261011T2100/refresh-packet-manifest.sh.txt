#!/bin/sh
set -eu

HERE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$HERE"
find . -type f ! -name packet-sha256.txt -print0 |
  sort -z |
  xargs -0 sha256sum > packet-sha256.txt
