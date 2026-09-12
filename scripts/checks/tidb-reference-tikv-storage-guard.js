#!/usr/bin/env node

import assert from 'node:assert/strict';

import {TIDB_REFERENCE_DEFAULTS} from
  '../../test/distributed/harness/tidb-reference-lifecycle.js';
import {
  TIDB_REFERENCE_TIKV_DATA_DIR,
  createTiKvPersistentStorageProvider,
  tikvPersistentStorageEvidence,
} from '../../test/distributed/harness/tidb-reference-tikv-storage-provider.js';

const PASS_LINE = 'tidb-reference-tikv-storage-guard: PASS\n';

function createProviderDouble() {
  const calls = [];
  return {
    calls,
    async createContainer(options) {
      calls.push(options);
      return {containerId: `c${calls.length}`, name: options.name};
    },
    async inspectContainer() {
      return null;
    },
  };
}

async function assertBinding() {
  const base = createProviderDouble();
  const provider = createTiKvPersistentStorageProvider(base, {
    hostPath: '/mnt/benchmark-data',
  });

  await provider.createContainer({
    name: 'tikv-a',
    image: TIDB_REFERENCE_DEFAULTS.tikvImage,
    command: ['--addr=0.0.0.0:8090'],
    hostConfigExtras: {
      Ulimits: [{Name: 'nofile', Soft: 262144, Hard: 262144}],
    },
  });
  assert.equal(base.calls.length, 1);
  const created = base.calls[0];
  assert.ok(created.command.includes(
    `--data-dir=${TIDB_REFERENCE_TIKV_DATA_DIR}`,
  ));
  assert.ok(created.hostConfigExtras.Binds.includes(
    `/mnt/benchmark-data:${TIDB_REFERENCE_TIKV_DATA_DIR}`,
  ));
  assert.equal(created.hostConfigExtras.Ulimits.length, 1);

  await provider.createContainer({
    name: 'pd-a',
    image: TIDB_REFERENCE_DEFAULTS.pdImage,
    command: ['--name=pd'],
  });
  assert.deepEqual(base.calls[1].command, ['--name=pd']);
  assert.equal(base.calls[1].hostConfigExtras, undefined);

  await assert.rejects(
    () => provider.createContainer({
      name: 'tikv-b',
      image: TIDB_REFERENCE_DEFAULTS.tikvImage,
      command: ['--data-dir=/other'],
    }),
    /refuses an existing --data-dir/u,
  );
}

function assertEvidence() {
  const evidence = tikvPersistentStorageEvidence({
    HostConfig: {
      Binds: [`/mnt/benchmark-data:${TIDB_REFERENCE_TIKV_DATA_DIR}`],
    },
    Config: {
      Cmd: [`--data-dir=${TIDB_REFERENCE_TIKV_DATA_DIR}`],
    },
  }, {hostPath: '/mnt/benchmark-data'});
  assert.equal(evidence.valid, true);
  assert.equal(evidence.bindPresent, true);
  assert.equal(evidence.dataDirPresent, true);

  assert.equal(tikvPersistentStorageEvidence({
    HostConfig: {Binds: []},
    Config: {Cmd: []},
  }, {hostPath: '/mnt/benchmark-data'}).valid, false);

  assert.throws(
    () => createTiKvPersistentStorageProvider(createProviderDouble(), {
      hostPath: 'relative/path',
    }),
    /absolute safe path/u,
  );
}

async function main() {
  await assertBinding();
  assertEvidence();
  process.stdout.write(PASS_LINE);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message || error}\n`);
  process.exitCode = 1;
});
