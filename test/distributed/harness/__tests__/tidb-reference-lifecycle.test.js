import assert from 'node:assert/strict';
import {test} from '../../../src/test-helpers/tap.js';
import {
  TIDB_REFERENCE_DEFAULTS,
  normalizeTiDbReferenceLifecycleOptions,
  startTiDbReferenceCluster,
} from '../tidb-reference-lifecycle.js';

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

test('tidb lifecycle pins current LTS patch across components', async () => {
  assert.equal(TIDB_REFERENCE_DEFAULTS.pdImage, 'pingcap/pd:v8.5.8');
  assert.equal(TIDB_REFERENCE_DEFAULTS.tikvImage, 'pingcap/tikv:v8.5.8');
  assert.equal(TIDB_REFERENCE_DEFAULTS.tidbImage, 'pingcap/tidb:v8.5.8');
});

test('tidb lifecycle requires provider and network owners', async () => {
  assert.throws(
    () => normalizeTiDbReferenceLifecycleOptions({network: 'n'}),
    /requires provider/u,
  );
  assert.throws(
    () => normalizeTiDbReferenceLifecycleOptions({provider: {}}),
    /requires network/u,
  );
});

test('tidb lifecycle creates dependency order and tears down reverse order', async () => {
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
  assert.equal(cluster.endpoints.mysql.host, 'pair-a-tidb');
  assert.equal(cluster.endpoints.mysql.port, 4000);

  await cluster.stop();
  const stops = provider.calls.filter(([kind]) => kind === 'stop');
  const removes = provider.calls.filter(([kind]) => kind === 'remove');
  assert.deepEqual(stops.map(([, id]) => id), ['c3', 'c2', 'c1']);
  assert.deepEqual(removes.map(([, id]) => id), ['c3', 'c2', 'c1']);
});

test('tidb lifecycle wires pd -> tikv -> tidb without hidden discovery', async () => {
  const provider = createProviderDouble();
  await startTiDbReferenceCluster({
    provider,
    network: 'benchmark-net',
    namePrefix: 'pair-b',
  });

  const creates = provider.calls.filter(([kind]) => kind === 'create');
  const pd = creates[0][1];
  const tikv = creates[1][1];
  const tidb = creates[2][1];

  assert.ok(pd.command.includes(
    '--advertise-client-urls=http://pair-b-pd:2379',
  ));
  assert.ok(tikv.command.includes('--pd=pair-b-pd:2379'));
  assert.ok(tidb.command.includes('--path=pair-b-pd:2379'));
  assert.ok(tidb.command.includes('--store=tikv'));
});

test('tidb lifecycle cleans partial startup on failure', async () => {
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
});
