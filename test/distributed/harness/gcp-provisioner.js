/**
 * GCP Provisioner — provisions Compute Engine VMs with Docker daemons
 * using Pulumi. Returns Docker daemon connection targets as tcp://ip:port
 * strings for use with the distributed testing harness.
 *
 * Requires optional dependencies: @pulumi/pulumi, @pulumi/gcp
 * These are loaded dynamically so the module can be imported without them.
 */

import {DOCKER_DEFAULTS} from './constants.js';

// --- GCP Provisioner Constants ---
const DEFAULT_ZONE = 'us-central1-a';
const DEFAULT_MACHINE_TYPE = 'e2-standard-4';
const DEFAULT_VM_COUNT = 1;
const DEFAULT_PREEMPTIBLE = false;
const STACK_NAME = 'ddb-distributed-test';
const NETWORK_NAME = 'ddb-test-vpc';
const FIREWALL_INTERNAL_NAME = 'ddb-allow-internal';
const FIREWALL_DOCKER_NAME = 'ddb-allow-docker';
const FIREWALL_SSH_NAME = 'ddb-allow-ssh';
const VM_NAME_PREFIX = 'ddb-test-vm';
const DOCKER_PORT = DOCKER_DEFAULTS.remotePort;
const DOCKER_PORT_PROTOCOL = 'tcp';
const SSH_PORT = 22;
const NODE_COMM_PORT_START = 8080;
const NODE_COMM_PORT_END = 9090;
const STARTUP_SCRIPT_DOCKER_INSTALL = [
  '#!/bin/bash',
  'set -e',
  'apt-get update -y',
  'apt-get install -y docker.io',
  'mkdir -p /etc/systemd/system/docker.service.d',
  'cat > /etc/systemd/system/docker.service.d/override.conf << EOF',
  '[Service]',
  'ExecStart=',
  `ExecStart=/usr/bin/dockerd -H fd:// -H tcp://0.0.0.0:${DOCKER_DEFAULTS.remotePort}`,
  'EOF',
  'systemctl daemon-reload',
  'systemctl restart docker',
  'systemctl enable docker',
].join('\n');
const UBUNTU_IMAGE_FAMILY = 'ubuntu-2204-lts';
const UBUNTU_IMAGE_PROJECT = 'ubuntu-os-cloud';
const DISK_SIZE_GB = 50;
const DISK_TYPE = 'pd-standard';
const NETWORK_TAG = 'ddb-test-node';

/**
 * Dynamically imports Pulumi packages.
 * Throws a descriptive error if they are not installed.
 * @returns {Promise<{pulumi: Object, gcp: Object}>}
 */
async function loadPulumiDeps() {
  try {
    const [pulumi, gcp] = await Promise.all([
      import('@pulumi/pulumi'),
      import('@pulumi/gcp'),
    ]);
    return {pulumi, gcp};
  } catch (err) {
    throw new Error(
      'Pulumi dependencies not installed. ' +
      'Run: npm install @pulumi/pulumi @pulumi/gcp\n' +
      `Original error: ${err.message}`,
    );
  }
}

class GCPProvisioner {
  /**
   * @param {Object} config
   * @param {string} config.project - GCP project ID
   * @param {string} [config.zone] - GCP zone (default: us-central1-a)
   * @param {string} [config.machineType] - VM machine type
   * @param {number} [config.vmCount] - Number of VMs to provision
   * @param {boolean} [config.preemptible] - Use preemptible VMs
   */
  constructor(config) {
    this._project = config.project;
    this._zone = config.zone || DEFAULT_ZONE;
    this._machineType = config.machineType || DEFAULT_MACHINE_TYPE;
    this._vmCount = config.vmCount || DEFAULT_VM_COUNT;
    this._preemptible = config.preemptible || DEFAULT_PREEMPTIBLE;
    this._stack = null;
    this._pulumiDeps = null;
  }

  /**
   * Provision GCP VMs with Docker daemons listening on TCP.
   * @returns {Promise<Array<string>>} Docker host addresses (tcp://ip:2376)
   */
  async provision() {
    this._pulumiDeps = await loadPulumiDeps();
    const {pulumi, gcp} = this._pulumiDeps;

    const project = this._project;
    const zone = this._zone;
    const machineType = this._machineType;
    const vmCount = this._vmCount;
    const preemptible = this._preemptible;

    const program = async () => {
      const network = new gcp.compute.Network(NETWORK_NAME, {
        project,
        autoCreateSubnetworks: true,
      });

      new gcp.compute.Firewall(FIREWALL_INTERNAL_NAME, {
        project,
        network: network.selfLink,
        allows: [{
          protocol: DOCKER_PORT_PROTOCOL,
          ports: [`${NODE_COMM_PORT_START}-${NODE_COMM_PORT_END}`],
        }],
        sourceRanges: ['10.128.0.0/9'],
        targetTags: [NETWORK_TAG],
      });

      new gcp.compute.Firewall(FIREWALL_DOCKER_NAME, {
        project,
        network: network.selfLink,
        allows: [{
          protocol: DOCKER_PORT_PROTOCOL,
          ports: [`${DOCKER_PORT}`],
        }],
        sourceRanges: ['0.0.0.0/0'],
        targetTags: [NETWORK_TAG],
      });

      new gcp.compute.Firewall(FIREWALL_SSH_NAME, {
        project,
        network: network.selfLink,
        allows: [{
          protocol: DOCKER_PORT_PROTOCOL,
          ports: [`${SSH_PORT}`],
        }],
        sourceRanges: ['0.0.0.0/0'],
        targetTags: [NETWORK_TAG],
      });

      const externalIps = [];

      for (let i = 0; i < vmCount; i++) {
        const vmName = `${VM_NAME_PREFIX}-${i}`;

        const instance = new gcp.compute.Instance(vmName, {
          project,
          zone,
          machineType,
          tags: [NETWORK_TAG],
          bootDisk: {
            initializeParams: {
              image: `projects/${UBUNTU_IMAGE_PROJECT}/global/images/family/${UBUNTU_IMAGE_FAMILY}`,
              size: DISK_SIZE_GB,
              type: DISK_TYPE,
            },
          },
          networkInterfaces: [{
            network: network.selfLink,
            accessConfigs: [{}],
          }],
          metadataStartupScript: STARTUP_SCRIPT_DOCKER_INSTALL,
          scheduling: {
            preemptible,
            automaticRestart: !preemptible,
          },
        });

        const natIp = instance.networkInterfaces.apply(
          (ifaces) => ifaces[0].accessConfigs[0].natIp,
        );
        externalIps.push(natIp);
      }

      return {
        externalIps: pulumi.all(externalIps),
      };
    };

    const stack = await pulumi.automation.LocalWorkspace.createOrSelectStack({
      stackName: STACK_NAME,
      projectName: STACK_NAME,
      program,
    });

    await stack.setConfig('gcp:project', {value: project});
    await stack.setConfig('gcp:zone', {value: zone});

    const result = await stack.up({onOutput: () => {}});
    this._stack = stack;

    const ips = result.outputs.externalIps.value;
    return ips.map(
      (ip) => `${DOCKER_PORT_PROTOCOL}://${ip}:${DOCKER_PORT}`,
    );
  }

  /**
   * Tear down all provisioned GCP infrastructure.
   */
  async destroy() {
    if (!this._stack) {
      throw new Error(
        'No active Pulumi stack. Call provision() before destroy().',
      );
    }
    await this._stack.destroy({onOutput: () => {}});
    this._stack = null;
  }
}

export {GCPProvisioner};
