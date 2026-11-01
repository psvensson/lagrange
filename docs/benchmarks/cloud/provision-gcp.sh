#!/usr/bin/env bash
# Provision (or tear down) a 5-node Ubuntu 24.04 + Docker benchmark cluster on Google Cloud (GCP).
#
# Usage:
#   ./docs/benchmarks/cloud/provision-gcp.sh              # provisions 5 VMs and prints HOSTS=...
#   ./docs/benchmarks/cloud/provision-gcp.sh --teardown   # deletes the 5 VMs and firewall rule
#
# Environment overrides:
#   PROJECT_ID      GCP project ID (defaults to `gcloud config get-value project`)
#   ZONE            GCP zone (default: us-central1-a)
#   MACHINE_TYPE    Compute Engine machine type (default: n2-standard-4)
#   CLUSTER_PREFIX  Instance name prefix (default: lagrange-bench)
#   SSH_USER        SSH username for benchmark runner (default: $USER)

set -euo pipefail

PROJECT_ID="${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null || true)}"
ZONE="${ZONE:-us-central1-a}"
MACHINE_TYPE="${MACHINE_TYPE:-n2-standard-4}"
CLUSTER_PREFIX="${CLUSTER_PREFIX:-lagrange-bench}"
NETWORK_TAG="${CLUSTER_PREFIX}-node"
FIREWALL_RULE="${CLUSTER_PREFIX}-internal"
SSH_USER="${SSH_USER:-${USER:-ubuntu}}"

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
    --description="Intra-cluster traffic for Lagrange 5-node comparative benchmarks"
fi

STARTUP_SCRIPT='#!/usr/bin/env bash
set -euxo pipefail
if ! command -v docker >/dev/null 2>&1; then
  apt-get update -y
  apt-get install -y docker.io
  systemctl enable --now docker
fi
for u in $(ls /home 2>/dev/null || true); do
  usermod -aG docker "$u" || true
done
'

echo "[gcp] Creating 5 benchmark VMs (${MACHINE_TYPE}) in ${ZONE}..."
gcloud compute instances create "${NODES[@]}" \
  --project="${PROJECT_ID}" \
  --zone="${ZONE}" \
  --machine-type="${MACHINE_TYPE}" \
  --image-family="ubuntu-2404-lts-amd64" \
  --image-project="ubuntu-os-cloud" \
  --boot-disk-size="50GB" \
  --boot-disk-type="pd-ssd" \
  --tags="${NETWORK_TAG}" \
  --metadata="startup-script=${STARTUP_SCRIPT}"

echo "[gcp] Resolving internal IP addresses..."
IPS=()
for node in "${NODES[@]}"; do
  ip="$(gcloud compute instances describe "${node}" \
    --project="${PROJECT_ID}" \
    --zone="${ZONE}" \
    --format='get(networkInterfaces[0].networkIP)')"
  IPS+=("${ip}")
done

HOSTS_CSV="$(IFS=,; echo "${IPS[*]}")"
echo ""
echo "[gcp] 5-node GCP cluster provisioned."
echo "export HOSTS=\"${HOSTS_CSV}\""
echo "export SSH_USER=\"${SSH_USER}\""
echo ""
echo "Run the full comparative suite from a VM in the same VPC (e.g. ${NODES[0]}):"
echo "  node docs/benchmarks/cloud/run-comparative-benchmarks.mjs --hosts \"\${HOSTS}\" --ssh-user \"\${SSH_USER}\" --regenerate-docs"
echo ""
echo "When finished, tear down all resources with:"
echo "  ./docs/benchmarks/cloud/provision-gcp.sh --teardown"
