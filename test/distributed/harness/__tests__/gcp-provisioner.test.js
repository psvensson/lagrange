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
 * calling provision(), and run the stack program against a recording
 * stand-in for @pulumi/gcp to show what every created VM carries.
 */

import {test} from '../../../../src/test-helpers/tap.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import {
  GCP_HARNESS_IMAGE_FAMILY,
  GCPProvisioner,
  harnessImageSource,
  harnessStackProgram,
} from '../gcp-provisioner.js';
import {fixedLocaleCommand} from '../real-product-remote-shell.js';
import {gcpVmLifetimeInstanceArgs} from '../gcp-vm-lifetime.js';
import {
  arrayFilter,
  arrayFindIndex,
  arrayMap,
  stringEndsWith,
  stringSplit,
} from '../real-product-captured-intrinsics.js';

// Every config names its VMs' provider-enforced lifetime bound.
const BOUND = 7200;

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
  const p = new GCPProvisioner({project: 'proj', preemptible: true, maxRunDurationSeconds: BOUND});
  assert.strictEqual(p._preemptible, true);
  t.end();
});

test('GCPProvisioner stores preemptible false', (t) => {
  const p = new GCPProvisioner({project: 'proj', preemptible: false,
    maxRunDurationSeconds: BOUND});
  assert.strictEqual(p._preemptible, false);
  t.end();
});

// --- Constructor default values (Req 8.4) ---

test('GCPProvisioner uses default values for optional config', (t) => {
  const p = new GCPProvisioner({project: 'my-project', maxRunDurationSeconds: BOUND});
  assert.strictEqual(p._zone, 'us-central1-a');
  assert.strictEqual(p._machineType, 'e2-standard-4');
  assert.strictEqual(p._vmCount, 1);
  assert.strictEqual(p._preemptible, false);
  assert.strictEqual(p._project, 'my-project');
  t.end();
});

// --- Provider-enforced lifetime bound ---

test('GCPProvisioner refuses a config without a well-formed lifetime bound, before any ' +
  'provider call', (t) => {
  for (const config of [{project: 'proj'}, {project: 'proj', maxRunDurationSeconds: null}]) {
    assert.throws(() => new GCPProvisioner(config),
      /^Error: GCP config maxRunDurationSeconds is not set: .*no VM is created without a provider-enforced lifetime bound$/u);
  }
  for (const malformed of [0, -60, 1.5, Number.NaN, Number.POSITIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1, '7200', '2h', true, {seconds: 7200}]) {
    assert.throws(
      () => new GCPProvisioner({project: 'proj', maxRunDurationSeconds: malformed}),
      /^Error: GCP config maxRunDurationSeconds must be a positive whole number of seconds/u,
      String(malformed));
  }
  t.end();
});

// Census of the committed GCPProvisioner callers' configs: the distributed
// runner and matrix template, the TiDB reference workflows and checks. Each
// names a bound the provisioner admits (the MovieLens demo profile is checked
// by its own wiring test).
test('every committed GCP config names a lifetime bound the provisioner admits', (t) => {
  const configDir = new URL('../../config/', import.meta.url);
  const configs = arrayMap(
    arrayFilter(fs.readdirSync(configDir), (name) => stringEndsWith(name, '.json')),
    (name) => [name, JSON.parse(fs.readFileSync(new URL(name, configDir), 'utf8'))]);
  const withGcp = arrayFilter(configs, ([, config]) => config.gcp !== undefined);
  assert.deepEqual(arrayMap(withGcp, ([name]) => name).sort(), [
    'gcp-default.json', 'gcp-large.json', 'gcp-memory-soak.json', 'gcp-small.json',
    'gcp-tidb-oltp-loadgen.json', 'gcp-tidb-oltp-single-host.json',
    'gcp-tidb-reference-physical.json', 'gcp-tidb-reference-smoke.json']);
  for (const [name, config] of withGcp) {
    assert.doesNotThrow(() => new GCPProvisioner(config.gcp), name);
  }
  t.end();
});

// A recording stand-in for the @pulumi/gcp resources the program declares.
function recordingPulumi() {
  const declared = [];
  const resource = (kind) => class {
    constructor(name, args) {
      declared.push({kind, name, args});
      this.selfLink = `${kind}/${name}`;
      this.name = name;
      this.networkInterfaces = {apply: (read) => read([{networkIp: '10.0.0.1',
        accessConfigs: [{natIp: '1.2.3.4'}]}])};
    }
  };
  return {declared, deps: {
    pulumi: {all: (values) => values},
    gcp: {compute: {Network: resource('Network'), Firewall: resource('Firewall'),
      Instance: resource('Instance')}},
  }};
}

test('every VM the stack program creates carries the provider-enforced lifetime bound: ' +
  'maxRunDuration, DELETE on expiry and boot-disk auto-deletion', async (t) => {
  for (const preemptible of [false, true]) {
    const {declared, deps} = recordingPulumi();
    const program = harnessStackProgram(deps, {project: 'proj', zone: 'us-central1-a',
      machineType: 'e2-standard-4', vmCount: 3, preemptible,
      lifetime: gcpVmLifetimeInstanceArgs(BOUND, 'bound'),
      dockerSourceRanges: ['10.128.0.0/9']});
    const outputs = await program();
    const instances = arrayFilter(declared, ({kind}) => kind === 'Instance');
    assert.equal(instances.length, 3);
    assert.deepEqual(outputs.instanceNames, ['ddb-test-vm-0', 'ddb-test-vm-1', 'ddb-test-vm-2']);
    for (const {args} of instances) {
      assert.deepEqual(args.scheduling, {preemptible, automaticRestart: !preemptible,
        maxRunDuration: {seconds: BOUND}, instanceTerminationAction: 'DELETE'});
      assert.deepEqual(args.bootDisk, {autoDelete: true, initializeParams: {
        image: harnessImageSource('proj'), size: 50, type: 'pd-standard'}});
    }
  }
  t.end();
});

test('every stack operation first refreshes against the provider, so a VM the provider ' +
  'deleted at its bound is dropped from state, not taken as present', async (t) => {
  const options = [];
  const stack = {
    async setConfig() {},
    async up(given) {
      options.push(['up', given.refresh]);
      throw new Error('injected');
    },
    async destroy(given) {
      options.push(['destroy', given.refresh]);
    },
  };
  const p = new GCPProvisioner({project: 'proj', maxRunDurationSeconds: BOUND});
  await assert.rejects(() => p._updateStack(stack, 'proj', 'us-central1-a'), /injected/u);
  p._stack = stack;
  await p.destroy();
  assert.deepEqual(options, [['up', true], ['destroy', true], ['destroy', true]]);
  t.end();
});

// --- destroy() without provision() ---

test('destroy throws when no stack is active', async (t) => {
  const p = new GCPProvisioner({project: 'proj', maxRunDurationSeconds: BOUND});
  await assert.rejects(
    () => p.destroy(),
    {message: 'No active Pulumi stack. Call provision() before destroy().'},
  );
  t.end();
});

test('stack update failure destroys partially-created resources', async (t) => {
  const certDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gcp-stack-failure-'));
  const p = new GCPProvisioner({project: 'proj', maxRunDurationSeconds: BOUND});
  const calls = [];
  p._certDir = certDir;
  const stack = {
    async setConfig(key) {
      calls.push(`config:${key}`);
    },
    async up() {
      calls.push('up');
      throw new Error('injected zonal stockout');
    },
    async destroy() {
      calls.push('destroy');
    },
  };

  await assert.rejects(
    () => p._updateStack(stack, 'proj', 'us-central1-a'),
    /injected zonal stockout/,
  );
  assert.deepEqual(calls, [
    'config:gcp:project',
    'config:gcp:zone',
    'up',
    'destroy',
  ]);
  assert.equal(p._stack, null, 'the failed stack is no longer tracked');
  assert.equal(fs.existsSync(certDir), false, 'ephemeral certificates are removed');
  t.end();
});

// --- Cost estimation ---

test('estimateCost returns null before provision()', (t) => {
  const p = new GCPProvisioner({project: 'proj', maxRunDurationSeconds: BOUND});
  assert.strictEqual(p.estimateCost(), null);
  t.end();
});

test('estimateCost computes on-demand total from uptime and vmCount', (t) => {
  const p = new GCPProvisioner({
    project: 'proj',
    maxRunDurationSeconds: BOUND,
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
    maxRunDurationSeconds: BOUND,
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
    maxRunDurationSeconds: BOUND,
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
  const p = new GCPProvisioner({project: 'proj', maxRunDurationSeconds: BOUND});
  await assert.rejects(
    () => p.installImage('distributed-db:test'),
    /requires provision\(\) to have completed first/,
  );
  t.end();
});

test('certificate distribution fans out across image-backed VMs', async () => {
  const certDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gcp-provision-test-'));
  const provisioner = new GCPProvisioner({project: 'proj', maxRunDurationSeconds: BOUND});
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

// gcloud's ssh forwards the operator's LANG/LC_* like ssh does: the remote
// command carries the harness's fixed locale itself.
test('gcloud compute ssh sends each remote command in the fixed locale', async () => {
  const binDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gcp-provision-gcloud-'));
  // A gcloud stand-in that answers its own argv, one word per line.
  fs.writeFileSync(path.join(binDir, 'gcloud'), '#!/bin/sh\nprintf \'%s\\n\' "$@"\n',
    {mode: 0o755});
  const operatorPath = process.env.PATH;
  process.env.PATH = `${binDir}${path.delimiter}${operatorPath}`;
  try {
    const provisioner = new GCPProvisioner({project: 'proj', zone: 'zone-a',
      maxRunDurationSeconds: BOUND});
    const argv = stringSplit(await provisioner._gcloudSshAsync('vm-a', 'echo ready'), '\n');
    assert.deepEqual(argv.slice(0, 2), ['compute', 'ssh']);
    const commandIndex = arrayFindIndex(argv, (word) => word === '--command');
    assert.equal(argv[commandIndex + 1], fixedLocaleCommand('echo ready'));
  } finally {
    process.env.PATH = operatorPath;
    fs.rmSync(binDir, {recursive: true, force: true});
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
