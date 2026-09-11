#!/usr/bin/env node

import assert from 'node:assert/strict';
import {
  TIDB_REFERENCE_DEFAULTS,
  TIDB_REFERENCE_READINESS_SQL,
  buildTiDbReferenceReadinessSql,
  normalizeTiDbReferenceLifecycleOptions,
  startTiDbReferenceCluster,
} from '../../test/distributed/harness/tidb-reference-lifecycle.js';

const PASS_LINE = 'tidb-reference-lifecycle-guard: PASS\n';

function createProviderDouble(options = {}) {
  const calls = [];
  let nextId = 0;
  const configuredSqlResults = options.sqlResults || [
    {exitCode: 0, stdout: '1\n', stderr: ''},
  ];
  const sqlResults = [...configuredSqlResults];
  const fallbackSqlResult = configuredSqlResults.at(-1);
  return {
    calls,
    async createContainer(containerOptions) {
      nextId += 1;
      const containerId = `c${nextId}`;
      calls.push(['create', containerOptions]);
      if (containerOptions.name === options.failCreateName) {
        throw new Error(options.failCreateMessage || 'container create failed');
      }
      return {containerId, name: containerOptions.name};
    },
    async inspectContainer(containerId) {
      calls.push(['inspect', containerId]);
      return {State: {Running: true}};
    },
    async execInContainer(containerId, command) {
      calls.push(['exec', containerId, command]);
      return sqlResults.length > 0 ? sqlResults.shift() : fallbackSqlResult;
    },
    async stopContainer(containerId) {
      calls.push(['stop', containerId]);
    },
    async removeContainer(containerId) {
      calls.push(['remove', containerId]);
    },
  };
}

function expectedTiKvUlimit() {
  return [{
    Name: 'nofile',
    Soft: 262144,
    Hard: 262144,
  }];
}

function assertPinnedImages() {
  assert.equal(TIDB_REFERENCE_DEFAULTS.pdImage, 'pingcap/pd:v8.5.8');
  assert.equal(TIDB_REFERENCE_DEFAULTS.tikvImage, 'pingcap/tikv:v8.5.8');
  assert.equal(TIDB_REFERENCE_DEFAULTS.tidbImage, 'pingcap/tidb:v8.5.8');
  assert.equal(TIDB_REFERENCE_DEFAULTS.mysqlClientImage, 'mysql:8.4.11');
  assert.equal(TIDB_REFERENCE_DEFAULTS.tikvNofileLimit, 262144);
  assert.equal(TIDB_REFERENCE_DEFAULTS.tikvStoreCount, 1);
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
  assert.throws(
    () => normalizeTiDbReferenceLifecycleOptions({
      provider: {},
      network: 'n',
    }),
    /requires provider\.execInContainer/u,
  );
  const provider = createProviderDouble();
  assert.throws(
    () => normalizeTiDbReferenceLifecycleOptions({
      provider,
      network: 'n',
      tikvStoreCount: 0,
    }),
    /tikvStoreCount/u,
  );
  assert.throws(
    () => normalizeTiDbReferenceLifecycleOptions({
      provider,
      network: 'n',
      tikvStoreCount: 10,
    }),
    /tikvStoreCount/u,
  );
}

async function assertDependencyOrderAndCleanup() {
  const provider = createProviderDouble();
  const cluster = await startTiDbReferenceCluster({
    provider,
    network: 'benchmark-net',
    readinessPollIntervalMs: 1,
    readinessTimeoutMs: 20,
    namePrefix: 'pair-a',
  });

  const creates = provider.calls.filter(([kind]) => kind === 'create');
  assert.deepEqual(
    creates.map(([, options]) => options.name),
    [
      'pair-a-pd',
      'pair-a-tikv',
      'pair-a-tidb',
      'pair-a-sql-readiness',
    ],
  );
  assert.deepEqual(
    creates.map(([, options]) => options.image),
    [
      'pingcap/pd:v8.5.8',
      'pingcap/tikv:v8.5.8',
      'pingcap/tidb:v8.5.8',
      'mysql:8.4.11',
    ],
  );
  assert.deepEqual(
    creates.map(([, options]) => options.hostConfigExtras?.NetworkMode),
    ['benchmark-net', 'benchmark-net', 'benchmark-net', 'benchmark-net'],
  );

  const pd = creates[0][1];
  const tikv = creates[1][1];
  const tidb = creates[2][1];
  const readinessClient = creates[3][1];
  assert.ok(pd.command.includes(
    '--advertise-client-urls=http://pair-a-pd:2379',
  ));
  assert.ok(tikv.command.includes('--pd=pair-a-pd:2379'));
  assert.deepEqual(tikv.hostConfigExtras.Ulimits, expectedTiKvUlimit());
  assert.ok(tidb.command.includes('--path=pair-a-pd:2379'));
  assert.ok(tidb.command.includes('--store=tikv'));
  assert.ok(tidb.command.includes('-P=4000'));
  assert.equal(tidb.command.some((arg) => arg.startsWith('--port=')), false);
  assert.deepEqual(readinessClient.entrypoint, ['sleep']);
  assert.equal(cluster.endpoints.mysql.host, 'pair-a-tidb');
  assert.equal(cluster.endpoints.mysql.port, 4000);
  assert.deepEqual(cluster.names.tikvStores, ['pair-a-tikv']);
  assert.equal(cluster.containers.tikvStores.length, 1);

  const execs = provider.calls.filter(([kind]) => kind === 'exec');
  assert.equal(execs.length, 1);
  assert.equal(execs[0][1], 'c4');
  assert.ok(execs[0][2].includes('--host=pair-a-tidb'));
  assert.ok(execs[0][2].includes('--port=4000'));
  assert.ok(execs[0][2].includes(TIDB_REFERENCE_READINESS_SQL));
  assert.equal(cluster.readiness.attempts, 1);
  assert.equal(cluster.readiness.sql, TIDB_REFERENCE_READINESS_SQL);
  assert.equal(cluster.readiness.tikvStoreCount, 1);

  // The readiness client is removed before callers receive the measured cluster.
  assert.deepEqual(
    provider.calls.filter(([kind]) => kind === 'stop').map(([, id]) => id),
    ['c4'],
  );
  assert.deepEqual(
    provider.calls.filter(([kind]) => kind === 'remove').map(([, id]) => id),
    ['c4'],
  );

  await cluster.stop();
  const stops = provider.calls.filter(([kind]) => kind === 'stop');
  const removes = provider.calls.filter(([kind]) => kind === 'remove');
  assert.deepEqual(stops.map(([, id]) => id), ['c4', 'c3', 'c2', 'c1']);
  assert.deepEqual(removes.map(([, id]) => id), ['c4', 'c3', 'c2', 'c1']);
}

async function assertThreeStoreTopology() {
  const provider = createProviderDouble();
  const cluster = await startTiDbReferenceCluster({
    provider,
    network: 'benchmark-net',
    readinessPollIntervalMs: 1,
    readinessTimeoutMs: 20,
    namePrefix: 'pair-three',
    tikvStoreCount: 3,
  });

  const creates = provider.calls.filter(([kind]) => kind === 'create');
  assert.deepEqual(
    creates.map(([, options]) => options.name),
    [
      'pair-three-pd',
      'pair-three-tikv-1',
      'pair-three-tikv-2',
      'pair-three-tikv-3',
      'pair-three-tidb',
      'pair-three-sql-readiness',
    ],
  );

  const tikvCreates = creates.slice(1, 4).map(([, options]) => options);
  for (let index = 0; index < tikvCreates.length; index += 1) {
    const number = index + 1;
    const tikv = tikvCreates[index];
    assert.ok(tikv.command.includes('--pd=pair-three-pd:2379'));
    assert.ok(tikv.command.includes(
      `--advertise-addr=pair-three-tikv-${number}:20160`,
    ));
    assert.deepEqual(tikv.hostConfigExtras.Ulimits, expectedTiKvUlimit());
  }

  assert.deepEqual(
    cluster.names.tikvStores,
    ['pair-three-tikv-1', 'pair-three-tikv-2', 'pair-three-tikv-3'],
  );
  assert.equal(cluster.names.tikv, 'pair-three-tikv-1');
  assert.deepEqual(
    cluster.containers.tikvStores.map(({containerId}) => containerId),
    ['c2', 'c3', 'c4'],
  );
  assert.equal(cluster.containers.tikv.containerId, 'c2');
  assert.equal(cluster.readiness.tikvStoreCount, 3);
  assert.equal(cluster.readiness.sql, buildTiDbReferenceReadinessSql(3));

  const execs = provider.calls.filter(([kind]) => kind === 'exec');
  assert.equal(execs.length, 1);
  assert.equal(execs[0][1], 'c6');
  assert.ok(execs[0][2].includes(buildTiDbReferenceReadinessSql(3)));

  await cluster.stop();
  assert.deepEqual(
    provider.calls.filter(([kind]) => kind === 'stop').map(([, id]) => id),
    ['c6', 'c5', 'c4', 'c3', 'c2', 'c1'],
  );
  assert.deepEqual(
    provider.calls.filter(([kind]) => kind === 'remove').map(([, id]) => id),
    ['c6', 'c5', 'c4', 'c3', 'c2', 'c1'],
  );
}

async function assertSqlReadinessIsAGate() {
  const provider = createProviderDouble({
    sqlResults: [
      {exitCode: 1, stdout: '', stderr: 'connection refused'},
      {exitCode: 0, stdout: '0\n', stderr: ''},
      {exitCode: 0, stdout: '1\n', stderr: ''},
    ],
  });
  const cluster = await startTiDbReferenceCluster({
    provider,
    network: 'benchmark-net',
    readinessPollIntervalMs: 1,
    readinessTimeoutMs: 30,
    namePrefix: 'pair-readiness',
  });

  const execs = provider.calls.filter(([kind]) => kind === 'exec');
  assert.equal(execs.length, 3);
  assert.equal(cluster.readiness.attempts, 3);
  await cluster.stop();
}

async function assertPartialStartupCleanup() {
  const provider = createProviderDouble({
    failCreateName: 'tidb-reference-tikv',
    failCreateMessage: 'tikv failed',
  });

  await assert.rejects(
    startTiDbReferenceCluster({provider, network: 'benchmark-net'}),
    /tikv failed/u,
  );

  const removes = provider.calls.filter(([kind]) => kind === 'remove');
  assert.deepEqual(removes.map(([, id]) => id), ['c1']);
}

async function main() {
  assertPinnedImages();
  assertRequiredOwners();
  await assertDependencyOrderAndCleanup();
  await assertThreeStoreTopology();
  await assertSqlReadinessIsAGate();
  await assertPartialStartupCleanup();
  process.stdout.write(PASS_LINE);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message || error}\n`);
  process.exitCode = 1;
});
