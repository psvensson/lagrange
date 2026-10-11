#!/bin/sh
set -eu

IMAGE='docker.io/psvensson/lagrange@sha256:b58d44906ac09ffbb7959f717ce5f1a50b087dbd74431e506620a581a894da17'
HERE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

docker run --rm \
  --entrypoint /nodejs/bin/node \
  --volume "$HERE/ws-fragment-root-probe.cjs:/probe/ws-fragment-root-probe.cjs:ro" \
  "$IMAGE" --expose-gc /probe/ws-fragment-root-probe.cjs \
  > "$HERE/ws-fragment-root-probe.json"
