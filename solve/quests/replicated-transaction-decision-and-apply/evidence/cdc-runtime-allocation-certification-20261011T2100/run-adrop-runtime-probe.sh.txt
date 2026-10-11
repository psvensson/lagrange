#!/bin/sh
set -eu

IMAGE='docker.io/psvensson/lagrange@sha256:b58d44906ac09ffbb7959f717ce5f1a50b087dbd74431e506620a581a894da17'
HERE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

docker run --rm \
  --entrypoint /nodejs/bin/node \
  --volume "$HERE/adrop-runtime-probe.cjs:/probe/adrop-runtime-probe.cjs:ro" \
  "$IMAGE" /probe/adrop-runtime-probe.cjs \
  > "$HERE/adrop-runtime-probe.json"
