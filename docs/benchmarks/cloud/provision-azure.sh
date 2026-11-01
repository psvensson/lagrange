#!/usr/bin/env bash
# Provision (or tear down) a 5-node Ubuntu 24.04 + Docker benchmark cluster on Microsoft Azure.
#
# Usage:
#   ./docs/benchmarks/cloud/provision-azure.sh              # provisions Resource Group + 5 VMs
#   ./docs/benchmarks/cloud/provision-azure.sh --teardown   # deletes the Resource Group
#
# Environment overrides:
#   RESOURCE_GROUP  Azure resource group name (default: lagrange-bench-rg)
#   LOCATION        Azure region (default: eastus)
#   VM_SIZE         Azure VM size (default: Standard_D4s_v5)
#   CLUSTER_PREFIX  VM name prefix (default: lagrange-bench)
#   ADMIN_USER      SSH username (default: azureuser)

set -euo pipefail

RESOURCE_GROUP="${RESOURCE_GROUP:-lagrange-bench-rg}"
LOCATION="${LOCATION:-eastus}"
VM_SIZE="${VM_SIZE:-Standard_D4s_v5}"
CLUSTER_PREFIX="${CLUSTER_PREFIX:-lagrange-bench}"
ADMIN_USER="${ADMIN_USER:-azureuser}"
VNET_NAME="${CLUSTER_PREFIX}-vnet"
SUBNET_NAME="${CLUSTER_PREFIX}-subnet"
NSG_NAME="${CLUSTER_PREFIX}-nsg"

if [ "${1:-}" = "--teardown" ]; then
  echo "[azure] Deleting resource group ${RESOURCE_GROUP}..."
  az group delete --name "${RESOURCE_GROUP}" --yes --no-wait
  echo "[azure] Resource group deletion initiated in the background."
  exit 0
fi

echo "[azure] Creating resource group ${RESOURCE_GROUP} in ${LOCATION}..."
az group create \
  --name "${RESOURCE_GROUP}" \
  --location "${LOCATION}" \
  --output none

echo "[azure] Creating VNet ${VNET_NAME} and NSG ${NSG_NAME}..."
az network nsg create \
  --resource-group "${RESOURCE_GROUP}" \
  --name "${NSG_NAME}" \
  --output none

az network nsg rule create \
  --resource-group "${RESOURCE_GROUP}" \
  --nsg-name "${NSG_NAME}" \
  --name "AllowSSH" \
  --priority 1000 \
  --access Allow \
  --protocol Tcp \
  --direction Inbound \
  --destination-port-ranges 22 \
  --output none

az network vnet create \
  --resource-group "${RESOURCE_GROUP}" \
  --name "${VNET_NAME}" \
  --address-prefix "10.42.0.0/16" \
  --subnet-name "${SUBNET_NAME}" \
  --subnet-prefix "10.42.1.0/24" \
  --network-security-group "${NSG_NAME}" \
  --output none

CLOUD_INIT_FILE="$(mktemp)"
trap 'rm -f "${CLOUD_INIT_FILE}"' EXIT
cat > "${CLOUD_INIT_FILE}" <<EOF
#cloud-config
package_update: true
packages:
  - docker.io
runcmd:
  - systemctl enable --now docker
  - usermod -aG docker ${ADMIN_USER}
EOF

echo "[azure] Creating 6 Ubuntu 24.04 VMs (${VM_SIZE}) in ${RESOURCE_GROUP} (5 cluster + 1 client)..."
for i in 1 2 3 4 5 6; do
  VM_NAME="${CLUSTER_PREFIX}-${i}"
  echo "[azure] Provisioning ${VM_NAME}..."
  az vm create \
    --resource-group "${RESOURCE_GROUP}" \
    --name "${VM_NAME}" \
    --image "Canonical:ubuntu-24_04-lts:server:latest" \
    --size "${VM_SIZE}" \
    --admin-username "${ADMIN_USER}" \
    --generate-ssh-keys \
    --vnet-name "${VNET_NAME}" \
    --subnet "${SUBNET_NAME}" \
    --nsg "${NSG_NAME}" \
    --os-disk-size-gb 50 \
    --storage-sku StandardSSD_LRS \
    --custom-data "${CLOUD_INIT_FILE}" \
    --no-wait
done

echo "[azure] Waiting for all 6 VMs to finish provisioning..."
VM_IDS=()
for i in 1 2 3 4 5 6; do
  VM_IDS+=("$(az vm show -g "${RESOURCE_GROUP}" -n "${CLUSTER_PREFIX}-${i}" --query id -o tsv)")
done
az vm wait --created --ids "${VM_IDS[@]}"

IPS=()
PUB_IPS=()
for i in 1 2 3 4 5 6; do
  ip="$(az vm list-ip-addresses \
    --resource-group "${RESOURCE_GROUP}" \
    --name "${CLUSTER_PREFIX}-${i}" \
    --query '[0].virtualMachine.network.privateIpAddresses[0]' \
    --output tsv)"
  pub_ip="$(az vm list-ip-addresses \
    --resource-group "${RESOURCE_GROUP}" \
    --name "${CLUSTER_PREFIX}-${i}" \
    --query '[0].virtualMachine.network.publicIpAddresses[0].ipAddress' \
    --output tsv)"
  IPS+=("${ip}")
  PUB_IPS+=("${pub_ip}")
done

HOSTS_CSV="$(IFS=,; echo "${IPS[*]}")"
SSH_HOSTS_CSV="$(IFS=,; echo "${PUB_IPS[*]}")"
echo ""
echo "[azure] 6-VM Azure benchmark cluster provisioned (5 cluster VMs + 1 dedicated client VM)."
echo "export HOSTS=\"${HOSTS_CSV}\""
echo "export SSH_HOSTS=\"${SSH_HOSTS_CSV}\""
echo "export SSH_USER=\"${ADMIN_USER}\""
echo ""
echo "Run the full comparative suite:"
echo "  node docs/benchmarks/cloud/run-comparative-benchmarks.mjs --hosts \"\${HOSTS}\" --ssh-hosts \"\${SSH_HOSTS}\" --ssh-user \"\${SSH_USER}\" --execution-target gcp --regenerate-docs"
echo ""
echo "When finished, tear down all resources with:"
echo "  ./docs/benchmarks/cloud/provision-azure.sh --teardown"
