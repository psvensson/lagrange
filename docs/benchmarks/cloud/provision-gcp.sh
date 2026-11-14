#!/usr/bin/env bash
# Provision (or tear down) a 6-VM (5 cluster nodes + 1 dedicated client driver)
# Ubuntu + Docker benchmark cluster on Google Cloud (GCP).
#
# Usage:
#   ./docs/benchmarks/cloud/provision-gcp.sh              # provisions 6 VMs and prints HOSTS / SSH_HOSTS
#   ./docs/benchmarks/cloud/provision-gcp.sh --teardown   # deletes the 6 VMs and firewall rule
#   ./docs/benchmarks/cloud/provision-gcp.sh --place --client-checkout <abs path> [campaign options]
#       # places what the campaign checks for and never obtains itself: every image each role
#       # runs, the harness commit (this checkout's HEAD) in the load generator's checkout with
#       # its dependencies, and the reference client's npm cache; docker is checked on every
#       # VM first, each placement is verified with the campaign's own check, and a failure
#       # is typed (a provisioning_* code, or that check's code). Needs HOSTS, SSH_HOSTS and SSH_USER as
#       # printed by the create step, Docker access for SSH_USER on every VM, and Node >= 22
#       # on the load generator (--client-node). Pass the same --targets/--lagrange-image*
#       # options the campaign will use.
#
# Environment overrides:
#   PROJECT_ID      GCP project ID (defaults to `gcloud config get-value project`)
#   ZONE            GCP zone (default: us-central1-a)
#   MACHINE_TYPE    Compute Engine machine type (default: e2-standard-4)
#   CLUSTER_PREFIX  Instance name prefix (default: lagrange-bench)
#   SSH_USER        SSH username for benchmark runner (default: $USER)

set -euo pipefail

PROJECT_ID="${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null || true)}"
ZONE="${ZONE:-us-central1-a}"
MACHINE_TYPE="${MACHINE_TYPE:-e2-standard-4}"
CLUSTER_PREFIX="${CLUSTER_PREFIX:-lagrange-bench}"
NETWORK_TAG="${CLUSTER_PREFIX}-node"
FIREWALL_RULE="${CLUSTER_PREFIX}-internal"
SSH_USER="${SSH_USER:-${USER:-ubuntu}}"

if [ "${1:-}" = "--place" ]; then
  shift
  : "${HOSTS:?HOSTS is not set (export it as the create step printed)}"
  : "${SSH_HOSTS:?SSH_HOSTS is not set (export it as the create step printed)}"
  REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
  echo "[gcp] Placing images, the harness commit and the reference-client cache..."
  exec node "${REPO_ROOT}/docs/benchmarks/cloud/run-comparative-benchmarks.mjs" --execution-target gcp --provision \
    --hosts "${HOSTS}" --ssh-hosts "${SSH_HOSTS}" --ssh-user "${SSH_USER}" "$@"
fi

if [ -z "${PROJECT_ID}" ]; then
  echo "Error: PROJECT_ID is not set and could not be read from gcloud config." >&2
  echo "Run: export PROJECT_ID=<your-gcp-project-id>" >&2
  exit 1
fi

NODES=(
  "${CLUSTER_PREFIX}-1"
  "${CLUSTER_PREFIX}-2"
  "${CLUSTER_PREFIX}-3"
  "${CLUSTER_PREFIX}-4"
  "${CLUSTER_PREFIX}-5"
  "${CLUSTER_PREFIX}-6"
)

if [ "${1:-}" = "--teardown" ]; then
  echo "[gcp] Tearing down benchmark VMs (${NODES[*]}) in ${PROJECT_ID}/${ZONE}..."
  gcloud compute instances delete "${NODES[@]}" \
    --project="${PROJECT_ID}" \
    --zone="${ZONE}" \
    --quiet || true
  echo "[gcp] Deleting firewall rule ${FIREWALL_RULE}..."
  gcloud compute firewall-rules delete "${FIREWALL_RULE}" \
    --project="${PROJECT_ID}" \
    --quiet || true
  echo "[gcp] Teardown complete."
  exit 0
fi

echo "[gcp] Creating internal benchmark firewall rule ${FIREWALL_RULE} in ${PROJECT_ID}..."
if ! gcloud compute firewall-rules describe "${FIREWALL_RULE}" --project="${PROJECT_ID}" >/dev/null 2>&1; then
  gcloud compute firewall-rules create "${FIREWALL_RULE}" \
    --project="${PROJECT_ID}" \
    --allow=tcp:1-65535,udp:1-65535,icmp \
    --source-tags="${NETWORK_TAG}" \
    --target-tags="${NETWORK_TAG}" \
    --description="Intra-cluster traffic for Lagrange 5-node + 1-client comparative benchmarks"
fi

IMAGE_ARGS=(--image-family="ubuntu-2404-lts-amd64" --image-project="ubuntu-os-cloud")
if gcloud compute images describe-from-family lagrange-distributed-harness --project="${PROJECT_ID}" >/dev/null 2>&1; then
  echo "[gcp] Using pre-baked image family lagrange-distributed-harness in ${PROJECT_ID}..."
  IMAGE_ARGS=(--image-family="lagrange-distributed-harness" --image-project="${PROJECT_ID}")
fi

SSH_PUB_KEY=""
for candidate in "${HOME}/.ssh/id_ecdsa.pub" "${HOME}/.ssh/id_rsa.pub" "${HOME}/.ssh/google_compute_engine.pub"; do
  if [ -f "${candidate}" ]; then
    SSH_PUB_KEY="$(cat "${candidate}")"
    break
  fi
done

STARTUP_SCRIPT='#!/usr/bin/env bash
set -euxo pipefail
if ! command -v docker >/dev/null 2>&1 || ! command -v git >/dev/null 2>&1; then
  apt-get update -y
  apt-get install -y docker.io git
  systemctl enable --now docker
fi
# Docker socket access is NOT granted here: no world-writable socket and no
# blanket group grant to every /home user. The operator grants the one SSH
# user the runner connects as, explicitly (see cloud-reproduction-guide.md).
'

TMP_META="$(mktemp)"
trap 'rm -f "${TMP_META}"' EXIT
printf '%s\n' "${STARTUP_SCRIPT}" > "${TMP_META}"

META_ARGS=(--metadata-from-file="startup-script=${TMP_META}")
if [ -n "${SSH_PUB_KEY}" ]; then
  META_ARGS+=(--metadata="ssh-keys=${SSH_USER}:${SSH_PUB_KEY}")
fi

echo "[gcp] Creating 6 identical benchmark VMs (${MACHINE_TYPE}) in ${ZONE}..."
gcloud compute instances create "${NODES[@]}" \
  --project="${PROJECT_ID}" \
  --zone="${ZONE}" \
  --machine-type="${MACHINE_TYPE}" \
  "${IMAGE_ARGS[@]}" \
  --boot-disk-size="50GB" \
  --boot-disk-type="pd-ssd" \
  --tags="${NETWORK_TAG}" \
  "${META_ARGS[@]}"

echo "[gcp] Resolving internal and external IP addresses..."
INTERNAL_IPS=()
EXTERNAL_IPS=()
for node in "${NODES[@]}"; do
  in_ip="$(gcloud compute instances describe "${node}" \
    --project="${PROJECT_ID}" \
    --zone="${ZONE}" \
    --format='get(networkInterfaces[0].networkIP)')"
  ex_ip="$(gcloud compute instances describe "${node}" \
    --project="${PROJECT_ID}" \
    --zone="${ZONE}" \
    --format='get(networkInterfaces[0].accessConfigs[0].natIP)')"
  INTERNAL_IPS+=("${in_ip}")
  EXTERNAL_IPS+=("${ex_ip}")
done

HOSTS_CSV="$(IFS=,; echo "${INTERNAL_IPS[*]}")"
SSH_HOSTS_CSV="$(IFS=,; echo "${EXTERNAL_IPS[*]}")"
echo ""
echo "[gcp] 6-VM GCP benchmark cluster provisioned (5 cluster VMs + 1 dedicated client VM)."
echo "export HOSTS=\"${HOSTS_CSV}\""
echo "export SSH_HOSTS=\"${SSH_HOSTS_CSV}\""
echo "export SSH_USER=\"${SSH_USER}\""
echo ""
echo "Grant Docker access to \${SSH_USER} on each VM yourself (the script does not), put Node >= 22"
echo "on the client VM, then place what the campaign needs (the campaign itself never pulls or fetches):"
echo "  ./docs/benchmarks/cloud/provision-gcp.sh --place --client-checkout <abs path on the client VM> --client-node <node path> [--targets ...] [--lagrange-image <repo@sha256:...>]"
echo "Then preview and run with the same options:"
echo "  node docs/benchmarks/cloud/run-comparative-benchmarks.mjs --execution-target gcp --hosts \"\${HOSTS}\" --ssh-hosts \"\${SSH_HOSTS}\" --ssh-user \"\${SSH_USER}\" --dry-run"
echo "  node docs/benchmarks/cloud/run-comparative-benchmarks.mjs --execution-target gcp --hosts \"\${HOSTS}\" --ssh-hosts \"\${SSH_HOSTS}\" --ssh-user \"\${SSH_USER}\""
echo ""
echo "When finished, tear down all resources with:"
echo "  ./docs/benchmarks/cloud/provision-gcp.sh --teardown"
