/**
 * GCP Provisioner — provisions Compute Engine VMs running Docker daemons
 * secured with TLS (mutual authentication), using Pulumi. Returns Docker
 * daemon connection targets (tcp://ip:port) plus the client TLS material the
 * harness needs to reach them.
 *
 * Security model: the daemon NEVER listens unauthenticated. An ephemeral CA
 * is generated per provision() call; each VM gets a server certificate
 * (SAN = its external IP) signed by that CA, and the harness gets a client
 * certificate. dockerd runs with --tlsverify. The Docker firewall rule is
 * restricted to the VPC-internal range and the runner's own public IP — never
 * 0.0.0.0/0. Certificates are written to a 0700 temp dir and pushed to VMs
 * over `gcloud compute scp` (SSH), never embedded in instance metadata.
 *
 * Requires optional dependencies: @pulumi/pulumi, @pulumi/gcp (loaded
 * dynamically so the module imports without them), the `pulumi` CLI, the
 * `gcloud` CLI (for scp/ssh), and `openssl` (for certificates).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

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
const FIREWALL_IAP_SSH_NAME = 'ddb-allow-iap-ssh';
const SSH_PORT = 22;
// Google's IAP TCP-forwarding egress range. SSH/scp reach the VMs through IAP
// (--tunnel-through-iap), so port 22 only ever needs to be open to this range
// plus the VPC-internal range — never to 0.0.0.0/0.
const IAP_TCP_FORWARDING_RANGE = '35.235.240.0/20';
const VM_NAME_PREFIX = 'ddb-test-vm';
const DOCKER_PORT = DOCKER_DEFAULTS.remotePort;
const DOCKER_PORT_PROTOCOL = 'tcp';
const NODE_COMM_PORT_START = 8080;
const NODE_COMM_PORT_END = 9090;
const VPC_INTERNAL_RANGE = '10.128.0.0/9';
const UBUNTU_IMAGE_FAMILY = 'ubuntu-2204-lts';
const UBUNTU_IMAGE_PROJECT = 'ubuntu-os-cloud';
const DISK_SIZE_GB = 50;
const DISK_TYPE = 'pd-standard';
const NETWORK_TAG = 'ddb-test-node';
const CERT_VALIDITY_DAYS = 2;
const CERT_RSA_BITS = '2048';
const CA_SUBJECT = '/CN=lagrange-distributed-test-ca';
const SERVER_SUBJECT = '/CN=docker-server';
const CLIENT_SUBJECT = '/CN=docker-client';
const VM_CERT_DIR = '/etc/docker/tls';
const RUNNER_IP_LOOKUP_URL = 'https://checkip.amazonaws.com';
const GCLOUD_TIMEOUT_MS = 180000;

// --- Cost estimation (curated, offline) ---
// On-demand Linux $/hr per machine type, us-central1, as of 2026. Curated
// from https://cloud.google.com/compute/vm-instance-pricing — refresh manually
// when adding a machine type. Used only to give the operator a rough cost
// attribution; it is an ESTIMATE, never billed truth.
const MACHINE_TYPE_ON_DEMAND_USD_PER_HOUR = Object.freeze({
  'e2-standard-2': 0.067,
  'e2-standard-4': 0.134,
  'e2-standard-8': 0.268,
  'e2-standard-16': 0.536,
  'e2-highmem-4': 0.180,
  'e2-highcpu-4': 0.098,
  'n2-standard-4': 0.194,
});
const FALLBACK_ON_DEMAND_USD_PER_HOUR = 0.134;
// Spot/preemptible VMs are billed at a steep discount; ~31% of on-demand is a
// conservative midpoint of the published 60-91% discount range.
const PREEMPTIBLE_PRICE_FRACTION = 0.31;
const MS_PER_HOUR = 3600000;
// How long to wait for a fresh VM's guest agent + Docker install before
// pushing certs. Fresh-project first boots (image pull, apt mirrors) can be
// slow, so this is generous.
const VM_READY_TIMEOUT_MS = 600000;
const VM_READY_POLL_MS = 15000;

// dockerd installs with TLS enforced; certs land in VM_CERT_DIR via scp after
// boot, then docker is restarted to pick them up.
const STARTUP_SCRIPT_DOCKER_INSTALL = [
  '#!/bin/bash',
  'set -e',
  'apt-get update -y',
  'apt-get install -y docker.io',
  `mkdir -p ${VM_CERT_DIR}`,
  'mkdir -p /etc/systemd/system/docker.service.d',
  'cat > /etc/systemd/system/docker.service.d/override.conf << EOF',
  '[Service]',
  'ExecStart=',
  'ExecStart=/usr/bin/dockerd -H fd:// ' +
  `-H tcp://0.0.0.0:${DOCKER_DEFAULTS.remotePort} ` +
  '--tlsverify ' +
  `--tlscacert=${VM_CERT_DIR}/ca.pem ` +
  `--tlscert=${VM_CERT_DIR}/server-cert.pem ` +
  `--tlskey=${VM_CERT_DIR}/server-key.pem`,
  'EOF',
  'systemctl daemon-reload',
  'systemctl enable docker',
  // Do NOT start docker yet: it has no certs. The provisioner restarts it
  // after pushing certificates.
].join('\n');

function run(cmd, args, options = {}) {
  return execFileSync(cmd, args, {
    encoding: 'utf8',
    timeout: GCLOUD_TIMEOUT_MS,
    ...options,
  });
}

function openssl(args) {
  return run('openssl', args);
}

/**
 * Dynamically imports Pulumi packages.
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
    this._certDir = null;
    this._vmNames = [];
    this._provisionedAtMs = null;
    this._destroyedAtMs = null;
  }

  _generateCa() {
    const dir = this._certDir;
    openssl(['genrsa', '-out', path.join(dir, 'ca-key.pem'), CERT_RSA_BITS]);
    openssl([
      'req', '-new', '-x509', '-days', String(CERT_VALIDITY_DAYS),
      '-key', path.join(dir, 'ca-key.pem'), '-sha256',
      '-subj', CA_SUBJECT, '-out', path.join(dir, 'ca.pem'),
    ]);
  }

  _generateSignedCert(namePrefix, subject, sanIps) {
    const dir = this._certDir;
    const keyPath = path.join(dir, `${namePrefix}-key.pem`);
    const csrPath = path.join(dir, `${namePrefix}.csr`);
    const certPath = path.join(dir, `${namePrefix}-cert.pem`);
    openssl(['genrsa', '-out', keyPath, CERT_RSA_BITS]);
    openssl(['req', '-new', '-key', keyPath, '-sha256',
      '-subj', subject, '-out', csrPath]);
    const signArgs = [
      'x509', '-req', '-days', String(CERT_VALIDITY_DAYS),
      '-in', csrPath, '-CA', path.join(dir, 'ca.pem'),
      '-CAkey', path.join(dir, 'ca-key.pem'), '-CAcreateserial', '-sha256',
    ];
    if (sanIps && sanIps.length > 0) {
      const extPath = path.join(dir, `${namePrefix}-ext.cnf`);
      fs.writeFileSync(extPath,
        `subjectAltName=${sanIps.map((ip) => `IP:${ip}`).join(',')}\n`);
      signArgs.push('-extfile', extPath);
    }
    signArgs.push('-out', certPath);
    openssl(signArgs);
    return {keyPath, certPath};
  }

  // The Docker firewall rule must not be world-open. Restrict it to the VPC
  // plus the runner's current public IP (the only place that must reach the
  // daemons). Best-effort lookup; on failure we still exclude 0.0.0.0/0 by
  // using only the internal range and warn loudly.
  _runnerSourceRanges() {
    try {
      const ip = run('curl', ['-fsS', '-m', '10', RUNNER_IP_LOOKUP_URL])
        .trim();
      if (/^\d+\.\d+\.\d+\.\d+$/.test(ip)) {
        return [VPC_INTERNAL_RANGE, `${ip}/32`];
      }
    } catch (_err) {
      // fall through to internal-only
    }
    process.stderr.write(
      'GCP provisioner: could not determine runner public IP; restricting ' +
      'Docker firewall to the VPC-internal range only. Remote docker from ' +
      'this machine may be unreachable.\n');
    return [VPC_INTERNAL_RANGE];
  }

  /**
   * Provision GCP VMs with TLS-secured Docker daemons.
   * @returns {Promise<{hosts: Array<string>, tls: {ca: string, cert: string, key: string}}>}
   *   hosts are tcp://ip:2376; tls holds client PEM bytes for the harness.
   */
  async provision() {
    this._pulumiDeps = await loadPulumiDeps();
    const {pulumi, gcp} = this._pulumiDeps;

    // Ephemeral PKI for this provisioning run, in a 0700 temp dir.
    this._certDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'lagrange-gcp-docker-tls-'));
    fs.chmodSync(this._certDir, 0o700);
    this._generateCa();

    const project = this._project;
    const zone = this._zone;
    const machineType = this._machineType;
    const vmCount = this._vmCount;
    const preemptible = this._preemptible;
    const dockerSourceRanges = this._runnerSourceRanges();

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
        sourceRanges: [VPC_INTERNAL_RANGE],
        targetTags: [NETWORK_TAG],
      });

      new gcp.compute.Firewall(FIREWALL_DOCKER_NAME, {
        project,
        network: network.selfLink,
        allows: [{
          protocol: DOCKER_PORT_PROTOCOL,
          ports: [`${DOCKER_PORT}`],
        }],
        sourceRanges: dockerSourceRanges,
        targetTags: [NETWORK_TAG],
      });

      // SSH only via IAP TCP forwarding + intra-VPC; never world-open.
      new gcp.compute.Firewall(FIREWALL_IAP_SSH_NAME, {
        project,
        network: network.selfLink,
        allows: [{
          protocol: DOCKER_PORT_PROTOCOL,
          ports: [`${SSH_PORT}`],
        }],
        sourceRanges: [IAP_TCP_FORWARDING_RANGE, VPC_INTERNAL_RANGE],
        targetTags: [NETWORK_TAG],
      });

      const externalIps = [];
      const instanceNames = [];

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
          // SSH via gcloud requires an OS Login or metadata key; gcloud
          // compute scp/ssh handles key injection for the caller's account.
        });

        const natIp = instance.networkInterfaces.apply(
          (ifaces) => ifaces[0].accessConfigs[0].natIp,
        );
        externalIps.push(natIp);
        // Pulumi auto-names the GCP resource with a random suffix
        // (ddb-test-vm-0-1a2b3c); the ONLY correct name to SSH/scp to is the
        // one GCP actually assigned, read back from the instance itself.
        instanceNames.push(instance.name);
      }

      return {
        externalIps: pulumi.all(externalIps),
        instanceNames: pulumi.all(instanceNames),
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
    this._vmNames = result.outputs.instanceNames.value;
    this._provisionedAtMs = Date.now();
    try {
      const clientTls = this._distributeCertificates(ips);
      return {
        hosts: ips.map(
          (ip) => `${DOCKER_PORT_PROTOCOL}://${ip}:${DOCKER_PORT}`,
        ),
        tls: clientTls,
      };
    } catch (err) {
      // Cert distribution / readiness failed AFTER the VMs were created. Tear
      // the stack down here so a failed provision never leaks billable VMs,
      // then rethrow so the caller sees the original error.
      await this._destroyQuietly();
      throw err;
    }
  }

  // Best-effort teardown used when provision() fails partway: destroys the
  // stack and wipes certs, swallowing secondary errors so the original
  // provisioning error is what propagates.
  async _destroyQuietly() {
    try {
      if (this._stack) {
        await this._stack.destroy({onOutput: () => {}});
        this._destroyedAtMs = Date.now();
        this._stack = null;
      }
    } catch (_err) {
      // Swallow: the original provisioning error takes precedence.
    }
    if (this._certDir) {
      try {
        fs.rmSync(this._certDir, {recursive: true, force: true});
      } catch (_err) {
        // Best-effort.
      }
      this._certDir = null;
    }
  }

  _gcloudScp(vmName, local, remote) {
    return run('gcloud', [
      'compute', 'scp',
      '--project', this._project,
      '--zone', this._zone,
      '--tunnel-through-iap',
      '--quiet',
      local, `${vmName}:${remote}`,
    ]);
  }

  _gcloudSsh(vmName, remoteCmd) {
    return run('gcloud', [
      'compute', 'ssh',
      '--project', this._project,
      '--zone', this._zone,
      '--tunnel-through-iap',
      '--quiet',
      vmName, '--command', remoteCmd,
    ]);
  }

  // Wait until the VM's guest agent answers SSH AND the startup script has
  // actually installed the docker.service unit. stack.up() returns as soon as
  // the instance exists — well before apt finishes — so without this the cert
  // push races the package install (docker.service not found) and aborts the
  // run. A single SSH attempt does both: it loops on the VM until the unit
  // exists (bounded), and the gcloud call itself fails until SSH keys/agent
  // are ready, which the retry loop absorbs.
  _waitForVmReady(vmName) {
    const deadline = Date.now() + VM_READY_TIMEOUT_MS;
    // Wait for the dpkg lock to clear AND the docker unit to be installed,
    // bounded per-attempt so a stuck apt mirror can't hang the gcloud call.
    const probe =
      'ok=0; ' +
      'for i in $(seq 1 25); do ' +
      '  if ! sudo fuser /var/lib/dpkg/lock-frontend >/dev/null 2>&1 && ' +
      '     systemctl list-unit-files docker.service >/dev/null 2>&1 && ' +
      '     systemctl cat docker.service >/dev/null 2>&1; then ok=1; break; ' +
      '  fi; sleep 5; done; ' +
      '[ "$ok" = 1 ] && echo ready';
    let lastErr = null;
    while (Date.now() < deadline) {
      try {
        this._gcloudSsh(vmName, probe);
        return;
      } catch (err) {
        lastErr = err;
        const end = Date.now() + VM_READY_POLL_MS;
        while (Date.now() < end) {
          // busy-wait keeps this method synchronous like the rest of the
          // provisioning path (execFileSync-based).
        }
      }
    }
    throw new Error(
      `VM ${vmName} did not become ready within ` +
      `${VM_READY_TIMEOUT_MS}ms: ${lastErr ? lastErr.message : 'unknown'}`,
    );
  }

  // Push the CA + a per-VM server cert (SAN = that VM's external IP) to each
  // VM, then start docker and verify it is serving. Returns the client TLS
  // material for the harness. Any per-VM failure throws so provisioning fails
  // loudly at the point of cause rather than as an opaque TLS error later.
  _distributeCertificates(externalIps) {
    const dir = this._certDir;
    const client = this._generateSignedCert('client', CLIENT_SUBJECT, null);
    externalIps.forEach((ip, i) => {
      const vmName = this._vmNames[i];
      const server = this._generateSignedCert(
        `server-${i}`, SERVER_SUBJECT, [ip, '127.0.0.1']);
      this._waitForVmReady(vmName);
      this._gcloudSsh(
        vmName, `sudo mkdir -p ${VM_CERT_DIR} && sudo chmod 755 ${VM_CERT_DIR}`,
      );
      this._gcloudScp(vmName, path.join(dir, 'ca.pem'), '/tmp/ca.pem');
      this._gcloudScp(vmName, server.certPath, '/tmp/server-cert.pem');
      this._gcloudScp(vmName, server.keyPath, '/tmp/server-key.pem');
      this._gcloudSsh(
        vmName,
        'sudo mv /tmp/ca.pem /tmp/server-cert.pem /tmp/server-key.pem ' +
        `${VM_CERT_DIR}/ && ` +
        `sudo chmod 600 ${VM_CERT_DIR}/server-key.pem && ` +
        `sudo chmod 644 ${VM_CERT_DIR}/ca.pem ` +
        `${VM_CERT_DIR}/server-cert.pem && ` +
        `sudo test -s ${VM_CERT_DIR}/server-key.pem && ` +
        `sudo test -s ${VM_CERT_DIR}/ca.pem && ` +
        'sudo systemctl restart docker && ' +
        // Verify the daemon is actually serving before we hand its address
        // back; surfaces a broken cert/config here instead of downstream.
        'sudo systemctl is-active --quiet docker',
      );
    });
    return {
      ca: fs.readFileSync(path.join(dir, 'ca.pem'), 'utf8'),
      cert: fs.readFileSync(client.certPath, 'utf8'),
      key: fs.readFileSync(client.keyPath, 'utf8'),
    };
  }

  /**
   * Install a locally-built Docker image onto every provisioned VM.
   * Exports the image from the runner's local daemon (`docker save`), pushes
   * the tarball to each VM over scp, and loads it into the VM's daemon
   * (`docker load`). This avoids a registry and avoids rebuilding per host.
   * Must be called after provision().
   * @param {string} image - Image tag as it exists in the local daemon
   */
  installImage(image) {
    if (this._vmNames.length === 0) {
      throw new Error(
        'installImage requires provision() to have completed first',
      );
    }
    const tarball = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), 'lagrange-image-')),
      'image.tar',
    );
    try {
      // docker save streams the tarball to stdout; redirect to a file.
      const fd = fs.openSync(tarball, 'w');
      try {
        run('docker', ['save', image], {stdio: ['ignore', fd, 'inherit']});
      } finally {
        fs.closeSync(fd);
      }
      for (const vmName of this._vmNames) {
        this._gcloudScp(vmName, tarball, '/tmp/lagrange-image.tar');
        // Always remove the remote tarball, even if docker load fails, so a
        // multi-GB artifact is never orphaned on the VM's disk.
        this._gcloudSsh(
          vmName,
          'sudo docker load -i /tmp/lagrange-image.tar; ' +
          'rc=$?; rm -f /tmp/lagrange-image.tar; exit $rc',
        );
      }
    } finally {
      try {
        fs.rmSync(path.dirname(tarball), {recursive: true, force: true});
      } catch (_err) {
        // Best-effort tarball cleanup.
      }
    }
  }

  /**
   * Tear down all provisioned GCP infrastructure and wipe local certificates.
   */
  async destroy() {
    if (!this._stack) {
      throw new Error(
        'No active Pulumi stack. Call provision() before destroy().',
      );
    }
    let stackError = null;
    try {
      await this._stack.destroy({onOutput: () => {}});
      this._destroyedAtMs = Date.now();
    } catch (err) {
      stackError = err;
    }
    this._stack = null;
    if (this._certDir) {
      try {
        fs.rmSync(this._certDir, {recursive: true, force: true});
      } catch (_err) {
        // Best-effort cert cleanup.
      }
      this._certDir = null;
    }
    if (stackError) {
      throw stackError;
    }
  }

  /**
   * Estimate the total compute cost of the provisioned VMs for their uptime.
   * This is a coarse ESTIMATE from the curated price table — it covers VM
   * compute only (not disk, egress, or image storage) and is never billed
   * truth. Returns null when nothing was provisioned.
   * @returns {{totalUsd: number, uptimeMs: number, vmCount: number,
   *   machineType: string, usdPerHourPerVm: number, preemptible: boolean,
   *   estimated: true} | null}
   */
  estimateCost() {
    if (this._provisionedAtMs === null) {
      return null;
    }
    const endMs = this._destroyedAtMs !== null ?
      this._destroyedAtMs :
      Date.now();
    const uptimeMs = Math.max(0, endMs - this._provisionedAtMs);
    const onDemand = Object.prototype.hasOwnProperty.call(
      MACHINE_TYPE_ON_DEMAND_USD_PER_HOUR, this._machineType,
    ) ?
      MACHINE_TYPE_ON_DEMAND_USD_PER_HOUR[this._machineType] :
      FALLBACK_ON_DEMAND_USD_PER_HOUR;
    const usdPerHourPerVm = this._preemptible ?
      onDemand * PREEMPTIBLE_PRICE_FRACTION :
      onDemand;
    const totalUsd =
      (uptimeMs / MS_PER_HOUR) * usdPerHourPerVm * this._vmCount;
    return {
      totalUsd,
      uptimeMs,
      vmCount: this._vmCount,
      machineType: this._machineType,
      usdPerHourPerVm,
      preemptible: this._preemptible,
      estimated: true,
    };
  }
}

export {GCPProvisioner};
