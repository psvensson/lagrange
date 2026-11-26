#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../../../.."
stride=${1:?usage: run.sh 1-or-4 pair-id [--plan]}
pair=${2:?missing pair-id}
[[ $stride =~ ^(1|4)$ && $pair =~ ^[a-z0-9-]+$ ]]
product_sha=0da07b1da92744096da419635b5184465781488d
harness_sha=041f00ca2ab4bdbb658d051ce5c49692999a2284
[[ $(git rev-parse HEAD) == "$harness_sha" ]]
controller_patch() { git diff --binary --full-index --no-ext-diff --no-textconv HEAD; }
expected_patch=$(cat docs/benchmarks/cloud/observer-cadence/controller-patch.sha256)
[[ $(controller_patch | sha256sum | cut -d' ' -f1) == "$expected_patch" ]] || {
  echo 'Cadence harness differs from the sealed controller patch' >&2
  exit 1
}
image=lagrange@sha256:9fb196ec087cab3919091f3ceda628f3f68709b223f16a964dfaff92c99ad787
campaign="bench-041f-three-${pair}-facts${stride}"
out="$PWD/test-output/$campaign"
args=(--execution-target lab --targets lagrange --profile smoke --load-generator controller
  --lab-data-order 192.168.86.34,192.168.86.41,192.168.86.32
  --lagrange-image "$image" --lagrange-version 0.4.2 --lagrange-revision "$product_sha"
  --lagrange-src-fingerprint c722e613419d95e7
  --lagrange-facts-stride "$stride" --storage-root /var/tmp/lagrange-bench-data
  --campaign-id "$campaign" --raw-observations "$out/raw.ndjson" --output "$out/summary.json")
if [[ ${3:-} == --plan ]]; then
  args+=(--dry-run --from-recorded-facts)
else
  [[ $# == 2 ]]
  mkdir -p "$PWD/test-output"
  mkdir "$out"
  controller_patch > "$out/controller.patch"
  sha256sum "$out/controller.patch" > "$out/controller.sha256"
fi
export LAGRANGE_LAB_AGENT=codex-formation
exec node docs/benchmarks/cloud/run-comparative-benchmarks.mjs "${args[@]}"
