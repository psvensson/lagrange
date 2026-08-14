/**
 * GCP run orchestration for the distributed runner: auto-provisioning of
 * Compute Engine Docker hosts, image distribution onto them, and teardown.
 * Extracted from run.js to keep that file under the test-file size ratchet;
 * behavior is identical, just relocated.
 */

import {GCPProvisioner} from './harness/gcp-provisioner.js';

const GCP_PROVISION_LOG_PREFIX =
  'GCP: provisioning Compute Engine Docker hosts via Pulumi...\n';
const GCP_PROVISIONED_LOG_PREFIX = 'GCP: provisioned Docker hosts: ';
const GCP_TEARDOWN_LOG_PREFIX =
  'GCP: tearing down provisioned infrastructure\n';
const GCP_IMAGE_INSTALL_LOG_PREFIX = 'GCP: installing image ';
const GCP_IMAGE_INSTALL_LOG_SUFFIX = ' on provisioned hosts...\n';
const GCP_TEARDOWN_FAILURE_PREFIX =
  'GCP: teardown failed (infra may leak): ';

// When a config carries a `gcp` block but no explicit docker.hosts, provision
// the VMs now and inject their daemon addresses (plus client TLS material) as
// docker.hosts/docker.tls so the rest of the run treats them like any other
// remote Docker target. Explicit docker.hosts win: an operator who named
// hosts already has infrastructure and must not trigger provisioning.
async function provisionGcpDockerHosts(runConfig, verbose) {
  const gcpConfig = runConfig?.gcp;
  const hasExplicitHosts = Array.isArray(runConfig?.docker?.hosts) &&
    runConfig.docker.hosts.length > 0;
  if (!gcpConfig || hasExplicitHosts) {
    return {runConfig, provisioner: null};
  }
  if (!gcpConfig.project) {
    throw new Error(
      'config.gcp.project is required for GCP auto-provisioning ' +
      '(or set explicit docker.hosts to use existing infrastructure)',
    );
  }
  if (verbose) {
    process.stdout.write(GCP_PROVISION_LOG_PREFIX);
  }
  const provisioner = new GCPProvisioner(gcpConfig);
  const {hosts, hostInfo, tls} = await provisioner.provision();
  if (verbose) {
    process.stdout.write(GCP_PROVISIONED_LOG_PREFIX + hosts.join(', ') + '\n');
  }
  return {
    runConfig: {
      ...runConfig,
      docker: {...runConfig.docker, hosts, hostInfo, tls},
    },
    provisioner,
  };
}

// Distribute the freshly-built image to every provisioned GCP host so the
// per-host daemons can start containers without pulling from a registry.
// No-op when the run did not provision GCP hosts.
async function installGcpImage(provisioner, image, verbose) {
  if (!provisioner) {
    return;
  }
  if (verbose) {
    process.stdout.write(
      GCP_IMAGE_INSTALL_LOG_PREFIX + image + GCP_IMAGE_INSTALL_LOG_SUFFIX,
    );
  }
  await provisioner.installImage(image);
}

// Tear down provisioned GCP infra. Called on both success and failure paths
// so a crashed run never leaks billable VMs; a teardown failure must not mask
// an earlier error, so it is reported to stderr and swallowed.
async function teardownGcpProvisioner(provisioner, verbose) {
  if (!provisioner) {
    return;
  }
  if (verbose) {
    process.stdout.write(GCP_TEARDOWN_LOG_PREFIX);
  }
  try {
    await provisioner.destroy();
  } catch (teardownErr) {
    process.stderr.write(
      GCP_TEARDOWN_FAILURE_PREFIX +
      String(teardownErr?.message || teardownErr) + '\n',
    );
  }
}

export {
  provisionGcpDockerHosts,
  installGcpImage,
  teardownGcpProvisioner,
};
