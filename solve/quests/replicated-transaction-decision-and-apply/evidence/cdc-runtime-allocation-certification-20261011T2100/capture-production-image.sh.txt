#!/bin/sh
set -eu

IMAGE='docker.io/psvensson/lagrange@sha256:b58d44906ac09ffbb7959f717ce5f1a50b087dbd74431e506620a581a894da17'
HERE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

docker pull "$IMAGE" > "$HERE/production-image-pull.txt"
docker buildx imagetools inspect "$IMAGE" --raw > "$HERE/production-image-manifest.json"
docker image inspect "$IMAGE" > "$HERE/production-image-inspect.json"
docker run --rm \
  --env "CERT_IMAGE_DIGEST=$IMAGE" \
  --entrypoint /nodejs/bin/node \
  --volume "$HERE/production-image-inventory.mjs:/probe/production-image-inventory.mjs:ro" \
  "$IMAGE" /probe/production-image-inventory.mjs > "$HERE/production-runtime-inventory.json"

sha256sum \
  "$HERE/production-image-inventory.mjs" \
  "$HERE/production-image-manifest.json" \
  "$HERE/production-image-inspect.json" \
  "$HERE/production-runtime-inventory.json" \
  > "$HERE/production-capture-sha256.txt"
