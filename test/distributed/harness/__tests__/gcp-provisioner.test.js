/**
 * Unit tests for GCP Provisioner.
 *
 * Feature: distributed-testing-framework
 *
 * Tests preemptible VM configuration (Req 8.4)
 * Tests returned address format matches tcp://{ip}:{port} (Req 8.6)
 *
 * Since Pulumi dependencies are not installed, these tests verify
 * constructor configuration and address format expectations without
 * calling provision().
 */

import {test} from '../../../../src/test-helpers/tap.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  GCP_HARNESS_IMAGE_FAMILY,
  GCPProvisioner,
  harnessImageSource,
} from '../gcp-provisioner.js';

test('GCP provisioner selects the project-local reusable image family', (t) => {
  assert.equal(GCP_HARNESS_IMAGE_FAMILY, 'lagrange-distributed-harness');
  assert.equal(
    harnessImageSource('project-a'),
    'projects/project-a/global/images/family/lagrange-distributed-harness',
  );
  t.end();
});

// --- Constructor / preemptible configuration (Req 8.4) ---

test('GCPProvisioner stores preemptible true', (t) => {
  const p = new GCPProvisioner({project: 'proj', preemptible: true});
  assert.strictEqual(p._preemptible, true);
  t.end();
});

test('GCPProvisioner stores preemptible false', (t) => {
  const p = new GCPProvisioner({project: 'proj', preemptible: false});
  assert.strictEqual(p._preemptible, false);
  t.end();
});

// --- Constructor default values (Req 8.4) ---

test('GCPProvisioner uses default values for optional config', (t) => {
  const p = new GCPProvisioner({project: 'my-project'});
  assert.strictEqual(p._zone, 'us-central1-a');
  assert.strictEqual(p._machineType, 'e2-standard-4');
  assert.strictEqual(p._vmCount, 1);
  assert.strictEqual(p._preemptible, false);
  assert.strictEqual(p._project, 'my-project');
  t.end();
});

// --- destroy() without provision() ---

test('destroy throws when no stack is active', async (t) => {
  const p = new GCPProvisioner({project: 'proj'});
  await assert.rejects(
    () => p.destroy(),
    {message: 'No active Pulumi stack. Call provision() before destroy().'},
  );
  t.end();
});

// --- Cost estimation ---

test('estimateCost returns null before provision()', (t) => {
  const p = new GCPProvisioner({project: 'proj'});
  assert.strictEqual(p.estimateCost(), null);
  t.end();
});

test('estimateCost computes on-demand total from uptime and vmCount', (t) => {
  const p = new GCPProvisioner({
    project: 'proj',
    machineType: 'e2-standard-4',
    vmCount: 2,
    preemptible: false,
  });
  // Simulate a 1-hour uptime window without touching real infra.
  p._provisionedAtMs = 1000000;
  p._destroyedAtMs = 1000000 + 3600000;
  const cost = p.estimateCost();
  assert.strictEqual(cost.vmCount, 2);
  assert.strictEqual(cost.machineType, 'e2-standard-4');
  assert.strictEqual(cost.preemptible, false);
  assert.strictEqual(cost.estimated, true);
  // 1h * $0.134/hr * 2 VMs
  assert.ok(Math.abs(cost.totalUsd - 0.268) < 1e-9);
  t.end();
});

test('estimateCost applies preemptible discount', (t) => {
  const p = new GCPProvisioner({
    project: 'proj',
    machineType: 'e2-standard-4',
    vmCount: 1,
    preemptible: true,
  });
  p._provisionedAtMs = 0;
  p._destroyedAtMs = 3600000;
  const cost = p.estimateCost();
  assert.strictEqual(cost.preemptible, true);
  // 1h * $0.134 * 0.31 * 1 VM
  assert.ok(Math.abs(cost.totalUsd - 0.134 * 0.31) < 1e-9);
  t.end();
});

test('estimateCost falls back for unknown machine type', (t) => {
  const p = new GCPProvisioner({
    project: 'proj',
    machineType: 'custom-unlisted-99',
    vmCount: 1,
  });
  p._provisionedAtMs = 0;
  p._destroyedAtMs = 3600000;
  const cost = p.estimateCost();
  assert.ok(cost.totalUsd > 0);
  t.end();
});

// --- installImage precondition ---

test('installImage throws when provision() has not run', async (t) => {
  const p = new GCPProvisioner({project: 'proj'});
  await assert.rejects(
    () => p.installImage('distributed-db:test'),
    /requires provision\(\) to have completed first/,
  );
  t.end();
});

test('certificate distribution fans out across image-backed VMs', async () => {
  const certDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gcp-provision-test-'));
  const provisioner = new GCPProvisioner({project: 'proj'});
  provisioner._certDir = certDir;
  provisioner._vmNames = ['vm-a', 'vm-b'];
  let activeReadinessChecks = 0;
  let maximumReadinessChecks = 0;
  provisioner._generateSignedCert = (prefix) => {
    const keyPath = path.join(certDir, `${prefix}-key.pem`);
    const certPath = path.join(certDir, `${prefix}-cert.pem`);
    fs.writeFileSync(keyPath, `${prefix}-key`);
    fs.writeFileSync(certPath, `${prefix}-cert`);
    if (prefix === 'client') {
      fs.writeFileSync(path.join(certDir, 'ca.pem'), 'test-ca');
    }
    return {keyPath, certPath};
  };
  provisioner._waitForVmReady = async () => {
    activeReadinessChecks += 1;
    maximumReadinessChecks = Math.max(
      maximumReadinessChecks,
      activeReadinessChecks,
    );
    await Promise.resolve();
    activeReadinessChecks -= 1;
  };
  const sshCommands = [];
  provisioner._gcloudSshAsync = async (_vmName, command) => {
    sshCommands.push(command);
    return '';
  };
  provisioner._gcloudScpAsync = async () => '';

  try {
    const tls = await provisioner._distributeCertificates(['1.2.3.4', '5.6.7.8']);
    assert.equal(maximumReadinessChecks, 2);
    assert.equal(tls.ca, 'test-ca');
    assert.equal(tls.cert, 'client-cert');
    assert.equal(tls.key, 'client-key');
    let tlsVerifyCommandCount = 0;
    for (const command of sshCommands) {
      if (/--tlsverify/u.test(command)) {
        tlsVerifyCommandCount += 1;
      }
    }
    assert.equal(tlsVerifyCommandCount, 2);
  } finally {
    fs.rmSync(certDir, {recursive: true, force: true});
  }
});

// --- Address format validation (Req 8.6) ---

test('expected address format matches tcp://{ip}:{port} pattern', (t) => {
  const pattern = /^tcp:\/\/\d+\.\d+\.\d+\.\d+:\d+$/;

  // Verify the format that provision() produces
  assert.ok(pattern.test('tcp://1.2.3.4:2376'));
  assert.ok(pattern.test('tcp://10.128.0.5:2376'));
  assert.ok(pattern.test('tcp://192.168.1.100:2376'));

  // Verify non-matching formats are rejected
  assert.ok(!pattern.test('http://1.2.3.4:2376'));
  assert.ok(!pattern.test('tcp://hostname:2376'));
  assert.ok(!pattern.test('1.2.3.4:2376'));
  t.end();
});
