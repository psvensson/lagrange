#!/usr/bin/env bash
set -euo pipefail

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required env var: ${name}" >&2
    exit 1
  fi
}

require_cmd() {
  local name="$1"
  if ! command -v "${name}" >/dev/null 2>&1; then
    echo "Missing required command: ${name}" >&2
    exit 1
  fi
}

require_cmd gcloud
require_env GCP_PROJECT

GCP_ZONE="${GCP_ZONE:-us-central1-a}"
GCP_MACHINE_TYPE="${GCP_MACHINE_TYPE:-e2-standard-8}"
GCP_DISK_GB="${GCP_DISK_GB:-50}"
GCP_PREEMPTIBLE="${GCP_PREEMPTIBLE:-true}"
GCP_INSTANCE_NAME="${GCP_INSTANCE_NAME:-ddb-distributed-$(date +%s)}"
GCP_REPO_URL="${GCP_REPO_URL:-}"
GCP_REPO_REF="${GCP_REPO_REF:-main}"
GCP_TEST_CONFIG="${GCP_TEST_CONFIG:-test/distributed/config/local.json}"
GCP_TEST_OUTPUT="${GCP_TEST_OUTPUT:-test-output/report.json}"
GCP_COST_PER_HOUR="${GCP_COST_PER_HOUR:-}"
GCP_COST_CURRENCY="${GCP_COST_CURRENCY:-USD}"
GCP_KEEP_INSTANCE="${GCP_KEEP_INSTANCE:-false}"
GCP_FETCH_RESULTS="${GCP_FETCH_RESULTS:-true}"
GCP_RESULTS_DIR="${GCP_RESULTS_DIR:-test-output}"
GCP_WORKDIR="${GCP_WORKDIR:-repo}"

INSTANCE_FLAGS=(
  --project "${GCP_PROJECT}"
  --zone "${GCP_ZONE}"
  --machine-type "${GCP_MACHINE_TYPE}"
  --boot-disk-size "${GCP_DISK_GB}GB"
  --image-family ubuntu-2204-lts
  --image-project ubuntu-os-cloud
)

if [[ "${GCP_PREEMPTIBLE}" == "true" ]]; then
  INSTANCE_FLAGS+=(--preemptible)
fi

cleanup() {
  if [[ "${GCP_KEEP_INSTANCE}" == "true" ]]; then
    echo "Keeping instance ${GCP_INSTANCE_NAME}"
    return
  fi
  gcloud compute instances delete "${GCP_INSTANCE_NAME}" \
    --project "${GCP_PROJECT}" \
    --zone "${GCP_ZONE}" \
    --quiet || true
}

trap cleanup EXIT

RUN_START_TS="$(date +%s)"

echo "Creating GCP instance ${GCP_INSTANCE_NAME} in ${GCP_ZONE}"
gcloud compute instances create "${GCP_INSTANCE_NAME}" "${INSTANCE_FLAGS[@]}"

REMOTE_SETUP=$(cat <<'EOF'
set -euo pipefail
sudo apt-get update -y
sudo apt-get install -y docker.io git curl
sudo systemctl enable --now docker
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
EOF
)

gcloud compute ssh "${GCP_INSTANCE_NAME}" \
  --project "${GCP_PROJECT}" \
  --zone "${GCP_ZONE}" \
  --command "${REMOTE_SETUP}"

if [[ -n "${GCP_REPO_URL}" ]]; then
  REMOTE_CLONE=$(cat <<EOF
set -euo pipefail
rm -rf ~/${GCP_WORKDIR}
git clone --depth 1 --branch "${GCP_REPO_REF}" "${GCP_REPO_URL}" ~/${GCP_WORKDIR}
EOF
)
  gcloud compute ssh "${GCP_INSTANCE_NAME}" \
    --project "${GCP_PROJECT}" \
    --zone "${GCP_ZONE}" \
    --command "${REMOTE_CLONE}"
else
  ARCHIVE_PATH="$(mktemp /tmp/ddb-src-XXXX.tar.gz)"
  tar \
    --exclude .git \
    --exclude node_modules \
    --exclude test-output \
    --exclude data \
    -czf "${ARCHIVE_PATH}" \
    -C "$(pwd)" .

  gcloud compute scp "${ARCHIVE_PATH}" \
    "${GCP_INSTANCE_NAME}:~/repo.tar.gz" \
    --project "${GCP_PROJECT}" \
    --zone "${GCP_ZONE}"

  rm -f "${ARCHIVE_PATH}"

  REMOTE_UNPACK=$(cat <<EOF
set -euo pipefail
rm -rf ~/${GCP_WORKDIR}
mkdir -p ~/${GCP_WORKDIR}
tar -xzf ~/repo.tar.gz -C ~/${GCP_WORKDIR}
rm -f ~/repo.tar.gz
EOF
)
  gcloud compute ssh "${GCP_INSTANCE_NAME}" \
    --project "${GCP_PROJECT}" \
    --zone "${GCP_ZONE}" \
    --command "${REMOTE_UNPACK}"
fi

REMOTE_TEST=$(cat <<EOF
set -euo pipefail
cd ~/${GCP_WORKDIR}
sudo npm install
sudo node test/distributed/run.js \\
  --config "${GCP_TEST_CONFIG}" \\
  --output "${GCP_TEST_OUTPUT}" \\
  --verbose
sudo chown -R "\${USER}:\${USER}" ~/${GCP_WORKDIR}
EOF
)

gcloud compute ssh "${GCP_INSTANCE_NAME}" \
  --project "${GCP_PROJECT}" \
  --zone "${GCP_ZONE}" \
  --command "${REMOTE_TEST}"

if [[ "${GCP_FETCH_RESULTS}" == "true" ]]; then
  mkdir -p "${GCP_RESULTS_DIR}"
  gcloud compute scp --recurse \
    "${GCP_INSTANCE_NAME}:~/${GCP_WORKDIR}/test-output" \
    "${GCP_RESULTS_DIR}/" \
    --project "${GCP_PROJECT}" \
    --zone "${GCP_ZONE}"
fi

RUN_END_TS="$(date +%s)"
RUN_DURATION_SEC="$((RUN_END_TS - RUN_START_TS))"

if [[ -n "${GCP_COST_PER_HOUR}" ]]; then
  COST_ESTIMATE="$(
    awk -v seconds="${RUN_DURATION_SEC}" -v rate="${GCP_COST_PER_HOUR}" \
      'BEGIN { printf "%.6f", (seconds / 3600) * rate }'
  )"
  echo "Estimated cost: ${COST_ESTIMATE} ${GCP_COST_CURRENCY}"
  mkdir -p "${GCP_RESULTS_DIR}"
  cat > "${GCP_RESULTS_DIR}/cost.json" <<EOF
{
  "instanceName": "${GCP_INSTANCE_NAME}",
  "machineType": "${GCP_MACHINE_TYPE}",
  "durationSeconds": ${RUN_DURATION_SEC},
  "costPerHour": ${GCP_COST_PER_HOUR},
  "estimatedCost": ${COST_ESTIMATE},
  "currency": "${GCP_COST_CURRENCY}"
}
EOF
else
  echo "Cost estimate skipped (set GCP_COST_PER_HOUR to enable)."
fi

echo "Distributed tests completed on ${GCP_INSTANCE_NAME}"
