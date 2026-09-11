#!/usr/bin/env node

import assert from 'node:assert/strict';
import {
  TIDB_REFERENCE_DEFAULTS,
  normalizeTiDbReferenceLifecycleOptions,
  startTiDbReferenceCluster,
} from '../../test/distributed/harness/tidb-reference-lifecycle.js';

const PASS_LINE = 'tidb-reference-lifecycle-guard: PASS\n';

function createProviderDouble() {
  const calls = [];
  let nextId = 0;
  return {
    calls,
    async createContainer(options) {
      nextId += 1;
      const containerId = `c${nextId}`;
      calls.push(['create', options]);
      return {containerId, name: options.name};
    },
    async startContainer(containerId) {
      calls.push(['start', containerId]);
    },
    async inspectContainer(containerId) {
      calls.push(['inspect', containerId]);
      return {State: {Running: true}};
    },
    async stopContainer(containerId) {
      calls.push(['stop', containerId]);
    },
    async removeContainer(containerId) {
      calls.push(['remove', containerId]);
    },
  };
}

function assertPinnedImages() {
  assert.equal(TIDB_REFERENCE_DEFAULTS.pdImage, 'pingcap/pd:v8.5.8');
  assert.equal(TIDB_REFERENCE_DEFAULTS.tikvImage, 'pingcap/tikv:v8.5.8');
  assert.equal(TIDB_REFERENCE_DEFAULTS.tidbImage, 'pingcap/tidb:v8.5.8');
}

function assertRequiredOwners() {
  assert.throws(
    () => normalizeTiDbReferenceLifecycleOptions({network: 'n'}),
    /requires provider/u,
  );
  assert.throws(
    () => normalizeTiDbReferenceLifecycleOptions({provider: {}}),
    /requires network/u,
  );
}

async function assertDependencyOrderAndCleanup() {
  const provider = createProviderDouble();
  const cluster = await startTiDbReferenceCluster({
    provider,
    network: 'benchmark-net',
    readinessPollIntervalMs: 1,
    readinessTimeoutMs: 10,
    namePrefix: 'pair-a',
  });

  const creates = provider.calls.filter(([kind]) => kind === 'create');
  assert.deepEqual(
    creates.map(([, options]) => options.name),
    ['pair-a-pd', 'pair-a-tikv', 'pair-a-tidb'],
  );
  assert.deepEqual(
    creates.map(([, options]) => options.image),
    [
      'pingcap/pd:v8.5.8',
      'pingcap/tikv:v8.5.8',
      'pingcap/tidb:v8.5.8',
    ],
  );

  const pd = creates[0][1];
  const tikv = creates[1][1];
  const tidb = creates[2][1];
  assert.ok(pd.command.includes(
    '--advertise-client-urls=http://pair-a-pd:2379',
  ));
  assert.ok(tikv.command.includes('--pd=pair-a-pd:2379'));
  assert.ok(tidb.command.includes('--path=pair-a-pd:2379'));
  assert.ok(tidb.command.includes('--store=tikv'));
  assert.equal(cluster.endpoints.mysql.host, 'pair-a-tidb');
  assert.equal(cluster.endpoints.mysql.port, 4000);

  await cluster.stop();
  const stops = provider.calls.filter(([kind]) => kind === 'stop');
  const removes = provider.calls.filter(([kind]) => kind === 'remove');
  assert.deepEqual(stops.map(([, id]) => id), ['c3', 'c2', 'c1']);
  assert.deepEqual(removes.map(([, id]) => id), ['c3', 'c2', 'c1']);
}

async function assertPartialStartupCleanup() {
  const provider = createProviderDouble();
  provider.startContainer = async (containerId) => {
    provider.calls.push(['start', containerId]);
    if (containerId === 'c2') throw new Error('tikv failed');
  };

  await assert.rejects(
    startTiDbReferenceCluster({provider, network: 'benchmark-net'}),
    /tikv failed/u,
  );

  const removes = provider.calls.filter(([kind]) => kind === 'remove');
  assert.deepEqual(removes.map(([, id]) => id), ['c2', 'c1']);
}

async function main() {
  assertPinnedImages();
  assertRequiredOwners();
  await assertDependencyOrderAndCleanup();
  await assertPartialStartupCleanup();
  process.stdout.write(PASS_LINE);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message || error}\n`);
  process.exitCode = 1;
});
