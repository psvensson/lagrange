#!/usr/bin/env bash
# Provision (or tear down) a 5-node Ubuntu 24.04 + Docker benchmark cluster on AWS EC2.
#
# Usage:
#   export KEY_NAME=<your-ec2-keypair-name>
#   ./docs/benchmarks/cloud/provision-aws.sh --ssh-cidr <your-ip>/32   # provisions the EC2 instances
#   ./docs/benchmarks/cloud/provision-aws.sh --teardown   # terminates instances and deletes SG
#
# Environment overrides:
#   REGION          AWS region (default: us-east-1)
#   INSTANCE_TYPE   EC2 instance type (default: m6i.xlarge)
#   KEY_NAME        EC2 SSH key-pair name (required for provisioning)
#   VPC_ID          Target VPC ID (defaults to default VPC in REGION)
#   SUBNET_ID       Target Subnet ID (defaults to first subnet in VPC_ID)
#   CLUSTER_TAG     Tag value for Name/LagrangeBenchmarkCluster (default: lagrange-bench)

set -euo pipefail

# Arguments. --ssh-cidr is required to provision and has no default: SSH is
# opened only to the operator's own network, never to the whole internet.
TEARDOWN=0
SSH_CIDR=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --teardown) TEARDOWN=1; shift ;;
    --ssh-cidr)
      if [ "$#" -lt 2 ]; then
        echo "Error: --ssh-cidr needs a value, e.g. --ssh-cidr 203.0.113.7/32" >&2
        exit 2
      fi
      SSH_CIDR="$2"; shift 2 ;;
    *) echo "Error: unknown argument: $1" >&2; exit 2 ;;
  esac
done

REGION="${REGION:-us-east-1}"
INSTANCE_TYPE="${INSTANCE_TYPE:-m6i.xlarge}"
CLUSTER_TAG="${CLUSTER_TAG:-lagrange-bench}"
SG_NAME="${CLUSTER_TAG}-sg"

if [ "${TEARDOWN}" = "1" ]; then
  echo "[aws] Finding instances tagged LagrangeBenchmarkCluster=${CLUSTER_TAG} in ${REGION}..."
  INSTANCE_IDS="$(aws ec2 describe-instances \
    --region "${REGION}" \
    --filters "Name=tag:LagrangeBenchmarkCluster,Values=${CLUSTER_TAG}" \
              "Name=instance-state-name,Values=pending,running,stopping,stopped" \
    --query 'Reservations[].Instances[].InstanceId' \
    --output text)"
  if [ -n "${INSTANCE_IDS}" ]; then
    echo "[aws] Terminating instances: ${INSTANCE_IDS}"
    # shellcheck disable=SC2086
    aws ec2 terminate-instances --region "${REGION}" --instance-ids ${INSTANCE_IDS} >/dev/null
    # shellcheck disable=SC2086
    aws ec2 wait instance-terminated --region "${REGION}" --instance-ids ${INSTANCE_IDS}
  fi
  SG_ID="$(aws ec2 describe-security-groups \
    --region "${REGION}" \
    --filters "Name=group-name,Values=${SG_NAME}" \
    --query 'SecurityGroups[0].GroupId' \
    --output text 2>/dev/null || true)"
  if [ -n "${SG_ID}" ] && [ "${SG_ID}" != "None" ]; then
    echo "[aws] Deleting security group ${SG_ID} (${SG_NAME})..."
    aws ec2 delete-security-group --region "${REGION}" --group-id "${SG_ID}" || true
  fi
  echo "[aws] Teardown complete."
  exit 0
fi

if [ -z "${SSH_CIDR}" ]; then
  echo "Error: --ssh-cidr <cidr> is required: the IPv4 network allowed to reach SSH (22)," >&2
  echo "e.g. your own address as --ssh-cidr 203.0.113.7/32. There is no default." >&2
  exit 2
fi
if ! [[ "${SSH_CIDR}" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}/([0-9]|[12][0-9]|3[0-2])$ ]] ||
    [[ "${SSH_CIDR}" =~ /0$ ]]; then
  echo "Error: --ssh-cidr must be an IPv4 CIDR with a prefix of /1 to /32, not ${SSH_CIDR}." >&2
  exit 2
fi

if [ -z "${KEY_NAME:-}" ]; then
  echo "Error: KEY_NAME is required to provision EC2 instances." >&2
  echo "Run: export KEY_NAME=<your-ec2-keypair-name>" >&2
  exit 1
fi

VPC_ID="${VPC_ID:-$(aws ec2 describe-vpcs \
  --region "${REGION}" \
  --filters "Name=is-default,Values=true" \
  --query 'Vpcs[0].VpcId' \
  --output text)}"
SUBNET_ID="${SUBNET_ID:-$(aws ec2 describe-subnets \
  --region "${REGION}" \
  --filters "Name=vpc-id,Values=${VPC_ID}" \
  --query 'Subnets[0].SubnetId' \
  --output text)}"

AMI_ID="$(aws ssm get-parameters \
  --region "${REGION}" \
  --names /aws/service/canonical/ubuntu/server/24.04/stable/current/amd64/hvm/ebs-gp3/ami-id \
  --query 'Parameters[0].Value' \
  --output text)"

echo "[aws] Creating or reusing security group ${SG_NAME} in ${VPC_ID}..."
SG_ID="$(aws ec2 describe-security-groups \
  --region "${REGION}" \
  --filters "Name=group-name,Values=${SG_NAME}" "Name=vpc-id,Values=${VPC_ID}" \
  --query 'SecurityGroups[0].GroupId' \
  --output text 2>/dev/null || true)"

if [ -z "${SG_ID}" ] || [ "${SG_ID}" = "None" ]; then
  SG_ID="$(aws ec2 create-security-group \
    --region "${REGION}" \
    --group-name "${SG_NAME}" \
    --description "Intra-cluster traffic for Lagrange 5-node comparative benchmarks" \
    --vpc-id "${VPC_ID}" \
    --query 'GroupId' \
    --output text)"
  aws ec2 authorize-security-group-ingress \
    --region "${REGION}" \
    --group-id "${SG_ID}" \
    --protocol -1 \
    --source-group "${SG_ID}" >/dev/null
  aws ec2 authorize-security-group-ingress \
    --region "${REGION}" \
    --group-id "${SG_ID}" \
    --protocol tcp \
    --port 22 \
    --cidr "${SSH_CIDR}" >/dev/null
fi

USER_DATA='#!/usr/bin/env bash
set -euxo pipefail
apt-get update -y
apt-get install -y docker.io
systemctl enable --now docker
usermod -aG docker ubuntu || true
'

echo "[aws] Launching 6 EC2 instances (${INSTANCE_TYPE}, AMI ${AMI_ID}) in ${REGION} (5 cluster + 1 client)..."
INSTANCE_IDS="$(aws ec2 run-instances \
  --region "${REGION}" \
  --image-id "${AMI_ID}" \
  --instance-type "${INSTANCE_TYPE}" \
  --count 6 \
  --key-name "${KEY_NAME}" \
  --security-group-ids "${SG_ID}" \
  --subnet-id "${SUBNET_ID}" \
  --user-data "${USER_DATA}" \
  --block-device-mappings '[{"DeviceName":"/dev/sda1","Ebs":{"VolumeSize":50,"VolumeType":"gp3"}}]' \
  --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=${CLUSTER_TAG}},{Key=LagrangeBenchmarkCluster,Value=${CLUSTER_TAG}}]" \
  --query 'Instances[].InstanceId' \
  --output text)"

echo "[aws] Waiting for instances (${INSTANCE_IDS}) to enter running state..."
# shellcheck disable=SC2086
aws ec2 wait instance-running --region "${REGION}" --instance-ids ${INSTANCE_IDS}

# shellcheck disable=SC2086
PRIVATE_IPS="$(aws ec2 describe-instances \
  --region "${REGION}" \
  --instance-ids ${INSTANCE_IDS} \
  --query 'Reservations[].Instances[].PrivateIpAddress' \
  --output text)"
# shellcheck disable=SC2086
PUBLIC_IPS="$(aws ec2 describe-instances \
  --region "${REGION}" \
  --instance-ids ${INSTANCE_IDS} \
  --query 'Reservations[].Instances[].PublicIpAddress' \
  --output text)"
HOSTS_CSV="$(echo "${PRIVATE_IPS}" | tr '\t ' ',,')"
SSH_HOSTS_CSV="$(echo "${PUBLIC_IPS}" | tr '\t ' ',,')"

echo ""
echo "[aws] 6-VM AWS EC2 benchmark cluster provisioned (5 cluster VMs + 1 dedicated client VM)."
echo "export HOSTS=\"${HOSTS_CSV}\""
echo "export SSH_HOSTS=\"${SSH_HOSTS_CSV}\""
echo "export SSH_USER=\"ubuntu\""
echo ""
echo "Run the full comparative suite:"
echo "  node docs/benchmarks/cloud/run-comparative-benchmarks.mjs --hosts \"\${HOSTS}\" --ssh-hosts \"\${SSH_HOSTS}\" --ssh-user ubuntu --execution-target gcp --regenerate-docs"
echo ""
echo "When finished, tear down all resources with:"
echo "  ./docs/benchmarks/cloud/provision-aws.sh --teardown"
