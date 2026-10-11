#!/bin/sh
set -eu

HERE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
node "$HERE/compute-approved-ledger.mjs" > "$HERE/approved-allocation-ledger.json"
