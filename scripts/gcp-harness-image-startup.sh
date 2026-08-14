#!/usr/bin/env bash

set -euo pipefail

readonly docker_tls_dir='/etc/docker/tls'
readonly ready_marker='LAGRANGE_GCP_HARNESS_IMAGE_READY'

export DEBIAN_FRONTEND=noninteractive

apt-get update -y
apt-get install -y docker.io

mkdir -p "${docker_tls_dir}"
rm -f "${docker_tls_dir}"/*.pem
systemctl enable docker.service
# The reusable image contains no credentials or remote-listener override. The
# provisioner installs both together for each run before restarting Docker.
systemctl stop docker.service docker.socket || true

apt-get clean
rm -rf /var/lib/apt/lists/*

# Remove instance identity and access artifacts before imaging. Compute
# Engine's guest environment regenerates SSH host keys on each clone's first
# boot and repopulates authorized keys from that clone's metadata.
rm -f /etc/ssh/ssh_host_*_key /etc/ssh/ssh_host_*_key.pub
find /home /root -path '*/.ssh/authorized_keys' -type f -delete
rm -rf /var/lib/google/*
truncate -s 0 /etc/machine-id
rm -f /var/lib/dbus/machine-id
sync

echo "${ready_marker}" | tee /dev/ttyS0
