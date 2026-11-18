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

const objectFreeze = Object.freeze;
const stringSplit = Function.call.bind(String.prototype.split);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);
const arrayFind = Function.call.bind(Array.prototype.find);
const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayEvery = Function.call.bind(Array.prototype.every);
const arrayMap = Function.call.bind(Array.prototype.map);
const arrayIncludes = Function.call.bind(Array.prototype.includes);

const ONE = 1;
const PASS_LINE = 'gcp-data-disk-owner-guard: PASS\n';
const NEWLINE = '\n';
const EMPTY_STRING = '';
const DOT_DELIMITER = '.';
const EQUALS_DELIMITER = '=';
const VM_NAME_PREFIX = 'ddb-test-vm-';
const FILTER_PREFIX = '--filter=';

const CMD_COMPUTE = 'compute';
const CMD_INSTANCES = 'instances';
const CMD_LIST = 'list';
const CMD_DISKS = 'disks';
const CMD_CREATE = 'create';
const CMD_ATTACH_DISK = 'attach-disk';
const CMD_SET_DISK_AUTO_DELETE = 'set-disk-auto-delete';
const CMD_SSH = 'ssh';
const CMD_DETACH_DISK = 'detach-disk';
const CMD_DELETE = 'delete';
const FLAG_TUNNEL_THROUGH_IAP = '--tunnel-through-iap';

const DEFAULT_NAME_PREFIX = 'tidb-data-ab12cd34';
const DUPLICATE_HOST_PREFIX = 'duplicate-host';
const BAD_HOST_PREFIX = 'bad-host';
const BAD_PATH_PREFIX = 'bad-path';
const RELATIVE_MOUNT_PATH = 'relative/path';
const TEST_DEVICE_NAME = 'lagrange-benchmark-data';
const TEST_MOUNT_PATH = '/mnt/lagrange-benchmark-data';
const TEST_PROJECT = 'project-a';
const TEST_ZONE = 'europe-central2-a';
const TEST_DISK_SIZE_GB = 100;
const TEST_DISK_TYPE = 'pd-balanced';

const EXPECTED_OPERATION_COUNT = 3;
const EXPECTED_TOTAL_SSH_COUNT = 6;

const VALID_HOST_INDEXES = objectFreeze([1, 2, 3]);
const DUPLICATE_HOST_INDEXES = objectFreeze([1, 1, 3]);
const OUT_OF_BOUNDS_HOST_INDEXES = objectFreeze([1, 2, 5]);

const EXPECTED_VM_NAMES = objectFreeze([
  'ddb-test-vm-11',
  'ddb-test-vm-12',
  'ddb-test-vm-13',
]);

const CMD_COMPUTE_DISKS_CREATE = objectFreeze([CMD_COMPUTE, CMD_DISKS, CMD_CREATE]);
const CMD_COMPUTE_INSTANCES_ATTACH = objectFreeze([CMD_COMPUTE, CMD_INSTANCES, CMD_ATTACH_DISK]);
const CMD_COMPUTE_INSTANCES_AUTO_DELETE = objectFreeze([
  CMD_COMPUTE,
  CMD_INSTANCES,
  CMD_SET_DISK_AUTO_DELETE,
]);
const CMD_COMPUTE_SSH_ARRAY = objectFreeze([CMD_COMPUTE, CMD_SSH]);
const CMD_COMPUTE_INSTANCES_DETACH = objectFreeze([CMD_COMPUTE, CMD_INSTANCES, CMD_DETACH_DISK]);
const CMD_COMPUTE_DISKS_DELETE = objectFreeze([CMD_COMPUTE, CMD_DISKS, CMD_DELETE]);

const HOST_INFO = objectFreeze([
  objectFreeze({internalIp: '10.0.0.10'}),
  objectFreeze({internalIp: '10.0.0.11'}),
  objectFreeze({internalIp: '10.0.0.12'}),
  objectFreeze({internalIp: '10.0.0.13'}),
  objectFreeze({internalIp: '10.0.0.14'}),
]);

function vmNameForIp(ip) {
  const parts = stringSplit(ip, DOT_DELIMITER);
  const suffix = parts.at(-1);
  return `${VM_NAME_PREFIX}${suffix}`;
}

function createCommandDouble() {
  const calls = [];
  const runCommand = (args) => {
    calls.push([...args]);
    if (args[0] === CMD_COMPUTE &&
        args[1] === CMD_INSTANCES &&
        args[2] === CMD_LIST) {
      const filter = arrayFind(args, (arg) => stringStartsWith(arg, FILTER_PREFIX));
      const ip = stringSplit(filter, EQUALS_DELIMITER).at(-1);
      return `${vmNameForIp(ip)}${NEWLINE}`;
    }
    return EMPTY_STRING;
  };
  return {calls, runCommand};
}

function commands(calls, prefix) {
  return arrayFilter(calls, (args) =>
    arrayEvery(prefix, (value, index) => args[index] === value));
}

function assertPolicy() {
  const policy = normalizeGcpDataDiskPolicy({
    hostInfo: HOST_INFO,
    hostIndexes: VALID_HOST_INDEXES,
    namePrefix: DEFAULT_NAME_PREFIX,
  });
  assert.equal(policy.sizeGb, GCP_DATA_DISK_DEFAULT_SIZE_GB);
  assert.equal(policy.type, GCP_DATA_DISK_DEFAULT_TYPE);
  assert.equal(policy.mountPath, GCP_DATA_DISK_DEFAULT_MOUNT_PATH);
  assert.deepEqual(policy.hostIndexes, VALID_HOST_INDEXES);

  assert.throws(
    () => normalizeGcpDataDiskPolicy({
      hostInfo: HOST_INFO,
      hostIndexes: DUPLICATE_HOST_INDEXES,
      namePrefix: DUPLICATE_HOST_PREFIX,
    }),
    /hostIndexes must be distinct/u,
  );
  assert.throws(
    () => normalizeGcpDataDiskPolicy({
      hostInfo: HOST_INFO,
      hostIndexes: OUT_OF_BOUNDS_HOST_INDEXES,
      namePrefix: BAD_HOST_PREFIX,
    }),
    /identify provisioned hosts/u,
  );
  assert.throws(
    () => normalizeGcpDataDiskPolicy({
      hostInfo: HOST_INFO,
      hostIndexes: VALID_HOST_INDEXES,
      namePrefix: BAD_PATH_PREFIX,
      mountPath: RELATIVE_MOUNT_PATH,
    }),
    /mountPath must be absolute/u,
  );

  const mount = buildGcpDataDiskMountCommand(
    TEST_DEVICE_NAME,
    TEST_MOUNT_PATH,
  );
  assert.match(mount, /google-lagrange-benchmark-data/u);
  assert.match(mount, /mkfs\.ext4/u);
  assert.match(mount, /mountpoint -q/u);
}

async function assertLifecycle() {
  const commandDouble = createCommandDouble();
  const owner = new GcpDataDiskOwner({
    project: TEST_PROJECT,
    zone: TEST_ZONE,
    runCommand: commandDouble.runCommand,
  });
  const records = await owner.attachDataDisks({
    hostInfo: HOST_INFO,
    hostIndexes: VALID_HOST_INDEXES,
    namePrefix: DEFAULT_NAME_PREFIX,
    sizeGb: TEST_DISK_SIZE_GB,
    type: TEST_DISK_TYPE,
    mountPath: TEST_MOUNT_PATH,
    deviceName: TEST_DEVICE_NAME,
  });

  assert.deepEqual(arrayMap(records, ({hostIndex}) => hostIndex), VALID_HOST_INDEXES);
  assert.deepEqual(
    arrayMap(records, ({vmName}) => vmName),
    EXPECTED_VM_NAMES,
  );
  assert.equal(
    commands(commandDouble.calls, CMD_COMPUTE_DISKS_CREATE).length,
    EXPECTED_OPERATION_COUNT,
  );
  assert.equal(
    commands(commandDouble.calls, CMD_COMPUTE_INSTANCES_ATTACH).length,
    EXPECTED_OPERATION_COUNT,
  );
  assert.equal(
    commands(
      commandDouble.calls,
      CMD_COMPUTE_INSTANCES_AUTO_DELETE,
    ).length,
    EXPECTED_OPERATION_COUNT,
  );
  const sshCreates = commands(commandDouble.calls, CMD_COMPUTE_SSH_ARRAY);
  assert.equal(sshCreates.length, EXPECTED_OPERATION_COUNT);
  for (const args of sshCreates) {
    assert.ok(arrayIncludes(args, FLAG_TUNNEL_THROUGH_IAP));
    assert.match(args.at(-1), /lagrange-benchmark-data/u);
  }

  await owner.destroy();
  assert.equal(
    commands(commandDouble.calls, CMD_COMPUTE_INSTANCES_DETACH).length,
    EXPECTED_OPERATION_COUNT,
  );
  assert.equal(
    commands(commandDouble.calls, CMD_COMPUTE_DISKS_DELETE).length,
    EXPECTED_OPERATION_COUNT,
  );
  assert.equal(
    commands(commandDouble.calls, CMD_COMPUTE_SSH_ARRAY).length,
    EXPECTED_TOTAL_SSH_COUNT,
  );
}

async function main() {
  assertPolicy();
  await assertLifecycle();
  process.stdout.write(PASS_LINE);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message || error}\n`);
  process.exitCode = ONE;
});
