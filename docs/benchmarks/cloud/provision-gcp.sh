#!/usr/bin/env bash
# Provision (or tear down) a 6-VM (5 cluster nodes + 1 dedicated client driver)
# Ubuntu + Docker benchmark cluster on Google Cloud (GCP).
#
# Usage:
#   ./docs/benchmarks/cloud/provision-gcp.sh              # creates the 6 VMs and prints HOSTS / SSH_HOSTS
#   ./docs/benchmarks/cloud/provision-gcp.sh --teardown   # deletes the 6 VMs and the firewall rule
#   ./docs/benchmarks/cloud/provision-gcp.sh --place --client-checkout <abs path> [campaign options]
#       # places what the campaign checks for and never obtains itself: every image each role
#       # runs, the harness commit (this checkout's HEAD) in the load generator's checkout with
#       # its dependencies, and the reference client's npm cache; docker, git and Node are checked
#       # first, each placement is verified with the campaign's own check, and a failure is typed
#       # (a provisioning_* code, or that check's code). Needs HOSTS, SSH_HOSTS, SSH_USER,
#       # IMAGE_FAMILY, IMAGE_PROJECT, BOOT_DISK_SIZE, BOOT_DISK_TYPE and FIREWALL_ALLOW as
#       # printed by the create step (recorded for every host), Docker access for SSH_USER on
#       # every VM, and Node at the engines floor on the load generator (--client-node). Pass
#       # the same --targets/--lagrange-image* options the campaign will use.
#
# Every value is named by the operator or is one of the documented defaults below, printed
# before anything is created. The script never probes for a value and adapts, and never
# tolerates a failed step: a missing value is refused with usage (exit 2) before any gcloud
# call, and a failed step exits non-zero naming what failed. The run never reuses a firewall
# rule it did not create: an existing rule of its name is refused (run --teardown first).
#
# Credentials: gcloud runs as the account of the operator's gcloud configuration; the script
# prints that account and the project before creating or deleting anything.
#
# Required:
#   PROJECT_ID           GCP project ID (create, teardown)
#   SSH_USER             SSH username for the benchmark runner (create, --place)
#   SSH_PUBLIC_KEY_FILE  public key installed for SSH_USER on every VM (create); it must exist
#                        and be readable; VMs are never created without it
# Optional creation lifetime:
#   VM_TERMINATION_TIME  absolute UTC expiry, YYYY-MM-DDTHH:MM:SSZ; requests DELETE and
#                        boot-disk auto-deletion for every VM. Empty/omitted means no
#                        provider lifetime bound. Ignored by --place and --teardown.
# Documented defaults (environment overrides):
#   ZONE            GCP zone (default: us-central1-a)
#   MACHINE_TYPE    Compute Engine machine type (default: e2-standard-4)
#   CLUSTER_PREFIX  Instance name prefix (default: lagrange-bench)
#   NETWORK         VPC network for the VMs and the firewall rule (default: default)
#   BOOT_DISK_SIZE  boot disk size of every VM (default: 50GB)
#   BOOT_DISK_TYPE  boot disk type of every VM (default: pd-ssd; it bears on results)
#   FIREWALL_ALLOW  protocols and ports the intra-cluster rule allows between the VMs
#                   (default: tcp:1-65535,udp:1-65535,icmp)
# Fixed by design: 6 VMs named ${CLUSTER_PREFIX}-1..6 (5 cluster VMs + 1 dedicated client),
# tagged ${CLUSTER_PREFIX}-node; the firewall rule is ${CLUSTER_PREFIX}-internal.
#   IMAGE_FAMILY    VM image family, named together with IMAGE_PROJECT (default, when
#   IMAGE_PROJECT   neither is set: ubuntu-2404-lts-amd64 in ubuntu-os-cloud). The VMs are
#                   created from exactly the named image; the script never looks for
#                   another image (such as a project's pre-baked family) and switches to
#                   it. Naming one without the other is refused before any gcloud call.
# Not pinned (recorded instead): the startup script installs docker.io and git from the
# image's Ubuntu archive; --place records the versions and image ids it observes.

set -euo pipefail

usage() {
  echo "Error: $1" >&2
  echo "See the header of docs/benchmarks/cloud/provision-gcp.sh for every value it needs." >&2
  exit 2
}

fail() {
  echo "Error: $1" >&2
  exit 1
}

validate_termination_time() {
  local message="VM_TERMINATION_TIME must be a valid UTC date and time in YYYY-MM-DDTHH:MM:SSZ form"
  local utc_pattern='^([0-9]{4})-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])'
  utc_pattern+='T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]Z$'
  [[ "$1" =~ ${utc_pattern} ]] || usage "${message}"
  local year=$((10#${BASH_REMATCH[1]}))
  local month=$((10#${BASH_REMATCH[2]}))
  local day=$((10#${BASH_REMATCH[3]}))
  local max_day=31
  case "${month}" in
    2)
      max_day=28
      if ((year % 4 == 0 && (year % 100 != 0 || year % 400 == 0))); then
        max_day=29
      fi ;;
    4|6|9|11) max_day=30 ;;
  esac
  ((year > 0 && day <= max_day)) || usage "${message}"
}

if [ "${1:-}" = "--place" ]; then
  shift
  for name in HOSTS SSH_HOSTS SSH_USER IMAGE_FAMILY IMAGE_PROJECT BOOT_DISK_SIZE BOOT_DISK_TYPE FIREWALL_ALLOW; do
    [ -n "${!name:-}" ] || usage "${name} is not set: export it as the create step printed"
  done
  REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
  echo "[gcp] Placing images, the harness commit and the reference-client cache..."
  exec node "${REPO_ROOT}/docs/benchmarks/cloud/run-comparative-benchmarks.mjs" --execution-target gcp --provision \
    --hosts "${HOSTS}" --ssh-hosts "${SSH_HOSTS}" --ssh-user "${SSH_USER}" \
    --vm-image-family "${IMAGE_FAMILY}" --vm-image-project "${IMAGE_PROJECT}" \
    --vm-boot-disk-size "${BOOT_DISK_SIZE}" --vm-boot-disk-type "${BOOT_DISK_TYPE}" \
    --vm-firewall-allow "${FIREWALL_ALLOW}" "$@"
fi

DEFAULT_IMAGE_FAMILY="ubuntu-2404-lts-amd64"
DEFAULT_IMAGE_PROJECT="ubuntu-os-cloud"
if [ -n "${IMAGE_FAMILY:-}" ] && [ -n "${IMAGE_PROJECT:-}" ]; then
  :
elif [ -n "${IMAGE_FAMILY:-}" ] || [ -n "${IMAGE_PROJECT:-}" ]; then
  usage "IMAGE_FAMILY and IMAGE_PROJECT name one image together; set both or neither."
fi

[ -n "${PROJECT_ID:-}" ] || usage "PROJECT_ID is not set: export PROJECT_ID=<your-gcp-project-id>"
IMAGE_FAMILY="${IMAGE_FAMILY:-${DEFAULT_IMAGE_FAMILY}}"
IMAGE_PROJECT="${IMAGE_PROJECT:-${DEFAULT_IMAGE_PROJECT}}"
ZONE="${ZONE:-us-central1-a}"
MACHINE_TYPE="${MACHINE_TYPE:-e2-standard-4}"
CLUSTER_PREFIX="${CLUSTER_PREFIX:-lagrange-bench}"
NETWORK="${NETWORK:-default}"
BOOT_DISK_SIZE="${BOOT_DISK_SIZE:-50GB}"
BOOT_DISK_TYPE="${BOOT_DISK_TYPE:-pd-ssd}"
FIREWALL_ALLOW="${FIREWALL_ALLOW:-tcp:1-65535,udp:1-65535,icmp}"
NETWORK_TAG="${CLUSTER_PREFIX}-node"
FIREWALL_RULE="${CLUSTER_PREFIX}-internal"

NODES=(
  "${CLUSTER_PREFIX}-1"
  "${CLUSTER_PREFIX}-2"
  "${CLUSTER_PREFIX}-3"
  "${CLUSTER_PREFIX}-4"
  "${CLUSTER_PREFIX}-5"
  "${CLUSTER_PREFIX}-6"
)

campaign_instances() {
  gcloud compute instances list --project="${PROJECT_ID}" --zones="${ZONE}" \
    --filter="name~^${CLUSTER_PREFIX}-[1-6]\$" --format='value(name)'
}

firewall_rule_names() {
  gcloud compute firewall-rules list --project="${PROJECT_ID}" \
    --filter="name=${FIREWALL_RULE}" --format='value(name)'
}

# The account gcloud acts as (the operator's gcloud configuration), printed with the project.
print_account() {
  local account
  account="$(gcloud config get-value account)" || fail "could not read the active gcloud account"
  [ -n "${account}" ] || fail "no active gcloud account: run gcloud auth login"
  echo "[gcp] gcloud account ${account}, project ${PROJECT_ID}"
}

if [ "${1:-}" = "--teardown" ]; then
  print_account
  echo "[gcp] Teardown: VMs ${NODES[*]} and firewall rule ${FIREWALL_RULE} in ${PROJECT_ID}/${ZONE}"
  present="$(campaign_instances)" ||
    fail "could not ask which VMs of ${CLUSTER_PREFIX} exist in ${PROJECT_ID}/${ZONE}; nothing was deleted; ${NODES[*]} may still be billed"
  failed=()
  for node in "${NODES[@]}"; do
    if printf '%s\n' "${present}" | grep -qx "${node}"; then
      if gcloud compute instances delete "${node}" --project="${PROJECT_ID}" --zone="${ZONE}" --quiet; then
        echo "[gcp] deleted VM ${node}"
      else
        echo "[gcp] FAILED to delete VM ${node}" >&2
        failed+=("VM ${node}")
      fi
    else
      echo "[gcp] VM ${node} already absent"
    fi
  done
  if rules="$(firewall_rule_names)"; then
    if [ -n "${rules}" ]; then
      if gcloud compute firewall-rules delete "${FIREWALL_RULE}" --project="${PROJECT_ID}" --quiet; then
        echo "[gcp] deleted firewall rule ${FIREWALL_RULE}"
      else
        echo "[gcp] FAILED to delete firewall rule ${FIREWALL_RULE}" >&2
        failed+=("firewall rule ${FIREWALL_RULE}")
      fi
    else
      echo "[gcp] firewall rule ${FIREWALL_RULE} already absent"
    fi
  else
    failed+=("firewall rule ${FIREWALL_RULE} (could not ask whether it exists)")
  fi
  if remaining="$(campaign_instances)"; then
    for node in ${remaining}; do failed+=("VM ${node} (still present)"); done
  else
    failed+=("VMs ${NODES[*]} (could not confirm they are gone)")
  fi
  if [ "${#failed[@]}" -gt 0 ]; then
    printf -v listed '%s; ' "${failed[@]}"
    fail "teardown incomplete; may still be billed: ${listed%; }"
  fi
  echo "[gcp] Teardown complete: no VM of ${CLUSTER_PREFIX} remains in ${PROJECT_ID}/${ZONE}."
  exit 0
fi

TERMINATION_ARGS=()
if [ -n "${VM_TERMINATION_TIME:-}" ]; then
  validate_termination_time "${VM_TERMINATION_TIME}"
  TERMINATION_ARGS=(--termination-time="${VM_TERMINATION_TIME}"
    --instance-termination-action=DELETE --boot-disk-auto-delete)
fi

[ -n "${SSH_USER:-}" ] || usage "SSH_USER is not set: export SSH_USER=<the user the runner connects as>"
[ -n "${SSH_PUBLIC_KEY_FILE:-}" ] ||
  usage "SSH_PUBLIC_KEY_FILE is not set: export SSH_PUBLIC_KEY_FILE=<path to the public key for ${SSH_USER}>"
[ -f "${SSH_PUBLIC_KEY_FILE}" ] && [ -r "${SSH_PUBLIC_KEY_FILE}" ] && [ -s "${SSH_PUBLIC_KEY_FILE}" ] ||
  usage "SSH_PUBLIC_KEY_FILE ${SSH_PUBLIC_KEY_FILE} does not exist, is not readable or is empty"
SSH_PUB_KEY="$(cat "${SSH_PUBLIC_KEY_FILE}")"

print_account
echo "[gcp] project ${PROJECT_ID}, zone ${ZONE}, machine type ${MACHINE_TYPE}, prefix ${CLUSTER_PREFIX}, network ${NETWORK}"
echo "[gcp] VM image: family ${IMAGE_FAMILY} in project ${IMAGE_PROJECT}"
echo "[gcp] boot disk ${BOOT_DISK_SIZE} ${BOOT_DISK_TYPE}, firewall allows ${FIREWALL_ALLOW}"
echo "[gcp] ssh user ${SSH_USER}, key ${SSH_PUBLIC_KEY_FILE}"
if [ -n "${VM_TERMINATION_TIME:-}" ]; then
  echo "[gcp] VM termination requested: ${VM_TERMINATION_TIME} (DELETE, boot disk auto-delete)"
else
  echo "[gcp] VM termination time not set; no provider-enforced lifetime bound requested"
fi

# The run creates its firewall rule; a rule of that name that already exists was not created
# by this run and is never reused.
rules="$(firewall_rule_names)" || fail "could not ask whether firewall rule ${FIREWALL_RULE} exists in ${PROJECT_ID}"
[ -z "${rules}" ] ||
  fail "firewall rule ${FIREWALL_RULE} already exists in ${PROJECT_ID}; it is not reused: run ./docs/benchmarks/cloud/provision-gcp.sh --teardown (it deletes it), then create again"
echo "[gcp] Creating internal benchmark firewall rule ${FIREWALL_RULE} in ${PROJECT_ID}..."
gcloud compute firewall-rules create "${FIREWALL_RULE}" \
  --project="${PROJECT_ID}" \
  --network="${NETWORK}" \
  --allow="${FIREWALL_ALLOW}" \
  --source-tags="${NETWORK_TAG}" \
  --target-tags="${NETWORK_TAG}" \
  --description="Intra-cluster traffic for Lagrange 5-node + 1-client comparative benchmarks"

IMAGE_ARGS=(--image-family="${IMAGE_FAMILY}" --image-project="${IMAGE_PROJECT}")

# Installed unconditionally (apt is idempotent); the versions are not pinned and are
# recorded by --place. A failure here surfaces as --place's typed docker or git refusal.
STARTUP_SCRIPT='#!/usr/bin/env bash
set -euxo pipefail
apt-get update -y
apt-get install -y docker.io git
systemctl enable --now docker
# Docker socket access is NOT granted here: no world-writable socket and no
# blanket group grant to every /home user. The operator grants the one SSH
# user the runner connects as, explicitly (see cloud-reproduction-guide.md).
'

TMP_META="$(mktemp)"
trap 'rm -f "${TMP_META}"' EXIT
printf '%s\n' "${STARTUP_SCRIPT}" > "${TMP_META}"

META_ARGS=(--metadata-from-file="startup-script=${TMP_META}"
  --metadata="ssh-keys=${SSH_USER}:${SSH_PUB_KEY}")

echo "[gcp] Creating 6 identical benchmark VMs (${MACHINE_TYPE}) in ${ZONE}..."
gcloud compute instances create "${NODES[@]}" \
  --project="${PROJECT_ID}" \
  --zone="${ZONE}" \
  --machine-type="${MACHINE_TYPE}" \
  --network="${NETWORK}" \
  "${IMAGE_ARGS[@]}" \
  --boot-disk-size="${BOOT_DISK_SIZE}" \
  --boot-disk-type="${BOOT_DISK_TYPE}" \
  --tags="${NETWORK_TAG}" \
  "${TERMINATION_ARGS[@]}" \
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
  [ -n "${in_ip}" ] && [ -n "${ex_ip}" ] ||
    fail "VM ${node} has no internal or external address (internal '${in_ip}', external '${ex_ip}')"
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
echo "export IMAGE_FAMILY=\"${IMAGE_FAMILY}\""
echo "export IMAGE_PROJECT=\"${IMAGE_PROJECT}\""
echo "export BOOT_DISK_SIZE=\"${BOOT_DISK_SIZE}\""
echo "export BOOT_DISK_TYPE=\"${BOOT_DISK_TYPE}\""
echo "export FIREWALL_ALLOW=\"${FIREWALL_ALLOW}\""
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
