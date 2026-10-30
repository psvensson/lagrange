#!/usr/bin/env node

import assert from 'node:assert/strict';

import {
  GCP_DATA_DISK_DEFAULT_MOUNT_PATH,
  GCP_DATA_DISK_DEFAULT_SIZE_GB,
  GCP_DATA_DISK_DEFAULT_TYPE,
  GcpDataDiskOwner,
  buildGcpDataDiskMountCommand,
  normalizeGcpDataDiskPolicy,
} from '../../test/distributed/harness/gcp-data-disk-owner.js';

const PASS_LINE = 'gcp-data-disk-owner-guard: PASS\n';
const HOST_INFO = Object.freeze([
  {internalIp: '10.0.0.10'},
  {internalIp: '10.0.0.11'},
  {internalIp: '10.0.0.12'},
  {internalIp: '10.0.0.13'},
  {internalIp: '10.0.0.14'},
]);

function vmNameForIp(ip) {
  const suffix = ip.split('.').at(-1);
  return `ddb-test-vm-${suffix}`;
}

function createCommandDouble() {
  const calls = [];
  const runCommand = (args) => {
    calls.push([...args]);
    if (args[0] === 'compute' &&
        args[1] === 'instances' &&
        args[2] === 'list') {
      const filter = args.find((arg) => arg.startsWith('--filter='));
      const ip = filter.split('=').at(-1);
      return `${vmNameForIp(ip)}\n`;
    }
    return '';
  };
  return {calls, runCommand};
}

function commands(calls, prefix) {
  return calls.filter((args) =>
    prefix.every((value, index) => args[index] === value));
}

function assertPolicy() {
  const policy = normalizeGcpDataDiskPolicy({
    hostInfo: HOST_INFO,
    hostIndexes: [1, 2, 3],
    namePrefix: 'tidb-data-ab12cd34',
  });
  assert.equal(policy.sizeGb, GCP_DATA_DISK_DEFAULT_SIZE_GB);
  assert.equal(policy.type, GCP_DATA_DISK_DEFAULT_TYPE);
  assert.equal(policy.mountPath, GCP_DATA_DISK_DEFAULT_MOUNT_PATH);
  assert.deepEqual(policy.hostIndexes, [1, 2, 3]);

  assert.throws(
    () => normalizeGcpDataDiskPolicy({
      hostInfo: HOST_INFO,
      hostIndexes: [1, 1, 3],
      namePrefix: 'duplicate-host',
    }),
    /hostIndexes must be distinct/u,
  );
  assert.throws(
    () => normalizeGcpDataDiskPolicy({
      hostInfo: HOST_INFO,
      hostIndexes: [1, 2, 5],
      namePrefix: 'bad-host',
    }),
    /identify provisioned hosts/u,
  );
  assert.throws(
    () => normalizeGcpDataDiskPolicy({
      hostInfo: HOST_INFO,
      hostIndexes: [1, 2, 3],
      namePrefix: 'bad-path',
      mountPath: 'relative/path',
    }),
    /mountPath must be absolute/u,
  );

  const mount = buildGcpDataDiskMountCommand(
    'lagrange-benchmark-data',
    '/mnt/lagrange-benchmark-data',
  );
  assert.match(mount, /google-lagrange-benchmark-data/u);
  assert.match(mount, /mkfs\.ext4/u);
  assert.match(mount, /mountpoint -q/u);
}

async function assertLifecycle() {
  const commandDouble = createCommandDouble();
  const owner = new GcpDataDiskOwner({
    project: 'project-a',
    zone: 'europe-central2-a',
    runCommand: commandDouble.runCommand,
  });
  const records = await owner.attachDataDisks({
    hostInfo: HOST_INFO,
    hostIndexes: [1, 2, 3],
    namePrefix: 'tidb-data-ab12cd34',
    sizeGb: 100,
    type: 'pd-balanced',
    mountPath: '/mnt/lagrange-benchmark-data',
    deviceName: 'lagrange-benchmark-data',
  });

  assert.deepEqual(records.map(({hostIndex}) => hostIndex), [1, 2, 3]);
  assert.deepEqual(
    records.map(({vmName}) => vmName),
    ['ddb-test-vm-11', 'ddb-test-vm-12', 'ddb-test-vm-13'],
  );
  assert.equal(
    commands(commandDouble.calls, ['compute', 'disks', 'create']).length,
    3,
  );
  assert.equal(
    commands(commandDouble.calls, ['compute', 'instances', 'attach-disk']).length,
    3,
  );
  assert.equal(
    commands(
      commandDouble.calls,
      ['compute', 'instances', 'set-disk-auto-delete'],
    ).length,
    3,
  );
  const sshCreates = commands(commandDouble.calls, ['compute', 'ssh']);
  assert.equal(sshCreates.length, 3);
  for (const args of sshCreates) {
    assert.ok(args.includes('--tunnel-through-iap'));
    assert.match(args.at(-1), /lagrange-benchmark-data/u);
  }

  await owner.destroy();
  assert.equal(
    commands(commandDouble.calls, ['compute', 'instances', 'detach-disk']).length,
    3,
  );
  assert.equal(
    commands(commandDouble.calls, ['compute', 'disks', 'delete']).length,
    3,
  );
  assert.equal(commands(commandDouble.calls, ['compute', 'ssh']).length, 6);
}

async function main() {
  assertPolicy();
  await assertLifecycle();
  process.stdout.write(PASS_LINE);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message || error}\n`);
  process.exitCode = 1;
});
