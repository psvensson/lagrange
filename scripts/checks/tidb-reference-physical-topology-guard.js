#!/usr/bin/env node

import assert from 'node:assert/strict';

import {
  createTiDbReferencePhysicalRoutingProvider,
  startTiDbReferencePhysicalCluster,
} from '../../test/distributed/harness/tidb-reference-physical-topology.js';

const PASS_LINE = 'tidb-reference-physical-topology-guard: PASS\n';
const SHARED_LIMITS = Object.freeze({memory: '2g', cpus: '2.0'});
const TIKV_LIMITS = Object.freeze({memory: '3g', cpus: '2.0'});
const READINESS_LIMITS = Object.freeze({memory: '256m', cpus: '0.5'});

function createProviderDouble(label) {
  const calls = [];
  let nextId = 0;
  return {
    label,
    calls,
    async createContainer(options) {
      nextId += 1;
      const containerId = `${label}-c${nextId}`;
      calls.push(['create', options, containerId]);
      return {containerId, name: options.name};
    },
    async inspectContainer(containerId) {
      calls.push(['inspect', containerId]);
      return {State: {Running: true}};
    },
    async inspectContainerIfExists(containerId) {
      calls.push(['inspect-if-exists', containerId]);
      return {State: {Running: true}};
    },
    async execInContainer(containerId, command) {
      calls.push(['exec', containerId, command]);
      return {exitCode: 0, stdout: '1\n', stderr: ''};
    },
    async stopContainer(containerId) {
      calls.push(['stop', containerId]);
    },
    async removeContainer(containerId) {
      calls.push(['remove', containerId]);
    },
    async getContainerLogs(containerId) {
      calls.push(['logs', containerId]);
      return '';
    },
  };
}

function createTopology() {
  const control = createProviderDouble('control');
  const storage1 = createProviderDouble('storage1');
  const storage2 = createProviderDouble('storage2');
  const storage3 = createProviderDouble('storage3');
  return {
    providers: {control, storage1, storage2, storage3},
    options: {
      control: {provider: control, host: '10.0.0.10'},
      storage: [
        {provider: storage1, host: '10.0.0.11'},
        {provider: storage2, host: '10.0.0.12'},
        {provider: storage3, host: '10.0.0.13'},
      ],
      namePrefix: 'physical-a',
    },
  };
}

function creates(provider) {
  return provider.calls
    .filter(([kind]) => kind === 'create')
    .map(([, options, containerId]) => ({...options, containerId}));
}

function calls(provider, kind) {
  return provider.calls.filter(([candidate]) => candidate === kind);
}

function assertHostNetwork(container) {
  assert.equal(container.hostNetwork, true);
  assert.equal(container.network, 'host');
  assert.equal(container.hostConfigExtras?.NetworkMode, undefined);
}

async function assertPhysicalPlacementAndLifecycle() {
  const {providers, options} = createTopology();
  const cluster = await startTiDbReferencePhysicalCluster({
    ...options,
    resourceLimits: SHARED_LIMITS,
    tikvResourceLimits: TIKV_LIMITS,
    readinessResourceLimits: READINESS_LIMITS,
    readinessPollIntervalMs: 1,
    readinessTimeoutMs: 20,
  });

  const controlCreates = creates(providers.control);
  assert.deepEqual(
    controlCreates.map(({name}) => name),
    ['physical-a-pd', 'physical-a-tidb', 'physical-a-sql-readiness'],
  );
  const [pd, tidb, readiness] = controlCreates;
  for (const container of controlCreates) assertHostNetwork(container);
  assert.deepEqual(pd.resourceLimits, SHARED_LIMITS);
  assert.deepEqual(tidb.resourceLimits, SHARED_LIMITS);
  assert.deepEqual(readiness.resourceLimits, READINESS_LIMITS);
  assert.ok(pd.command.includes(
    '--advertise-client-urls=http://10.0.0.10:2379',
  ));
  assert.ok(pd.command.includes(
    '--advertise-peer-urls=http://10.0.0.10:2380',
  ));
  assert.ok(pd.command.includes(
    '--initial-cluster=pd=http://10.0.0.10:2380',
  ));
  assert.ok(tidb.command.includes('--path=10.0.0.10:2379'));

  const storageProviders = [
    providers.storage1,
    providers.storage2,
    providers.storage3,
  ];
  const storageHosts = ['10.0.0.11', '10.0.0.12', '10.0.0.13'];
  for (let index = 0; index < storageProviders.length; index += 1) {
    const storeCreates = creates(storageProviders[index]);
    assert.equal(storeCreates.length, 1);
    const store = storeCreates[0];
    assert.equal(store.name, `physical-a-tikv-${index + 1}`);
    assertHostNetwork(store);
    assert.deepEqual(store.resourceLimits, TIKV_LIMITS);
    assert.ok(store.command.includes('--pd=10.0.0.10:2379'));
    assert.ok(store.command.includes(
      `--advertise-addr=${storageHosts[index]}:20160`,
    ));
  }

  const readinessExec = calls(providers.control, 'exec');
  assert.equal(readinessExec.length, 1);
  assert.equal(readinessExec[0][1], 'control-c3');
  assert.ok(readinessExec[0][2].includes('--host=127.0.0.1'));
  assert.equal(
    readinessExec[0][2].some((argument) =>
      String(argument).includes('physical-a-tidb')),
    false,
  );

  assert.deepEqual(cluster.physicalTopology, {
    controlHost: '10.0.0.10',
    storageHosts,
    distinctSystemHosts: 4,
  });
  assert.deepEqual(cluster.endpoints.mysql, {host: '10.0.0.10', port: 4000});
  assert.deepEqual(cluster.endpoints.pd, {host: '10.0.0.10', port: 2379});
  assert.equal(cluster.readiness.tikvStoreCount, 3);

  assert.deepEqual(
    cluster.containers.tikvStores.map(({containerId}) =>
      cluster.provider.getPhysicalPlacement(containerId)),
    [
      {kind: 'tikv', storeIndex: 0, host: '10.0.0.11'},
      {kind: 'tikv', storeIndex: 1, host: '10.0.0.12'},
      {kind: 'tikv', storeIndex: 2, host: '10.0.0.13'},
    ],
  );

  // The readiness client is removed before the measured topology is returned.
  assert.deepEqual(
    calls(providers.control, 'remove').map(([, id]) => id),
    ['control-c3'],
  );

  await cluster.stop();

  assert.deepEqual(
    calls(providers.control, 'remove').map(([, id]) => id),
    ['control-c3', 'control-c2', 'control-c1'],
  );
  assert.deepEqual(
    calls(providers.storage1, 'remove').map(([, id]) => id),
    ['storage1-c1'],
  );
  assert.deepEqual(
    calls(providers.storage2, 'remove').map(([, id]) => id),
    ['storage2-c1'],
  );
  assert.deepEqual(
    calls(providers.storage3, 'remove').map(([, id]) => id),
    ['storage3-c1'],
  );
}

function assertFailClosedTopology() {
  const control = createProviderDouble('control');
  const storage1 = createProviderDouble('storage1');
  const storage2 = createProviderDouble('storage2');
  const storage3 = createProviderDouble('storage3');

  assert.throws(
    () => createTiDbReferencePhysicalRoutingProvider({
      control: {provider: control, host: '10.0.0.10'},
      storage: [
        {provider: storage1, host: '10.0.0.11'},
        {provider: storage2, host: '10.0.0.12'},
      ],
      namePrefix: 'bad-count',
    }),
    /exactly 3 storage hosts/u,
  );

  assert.throws(
    () => createTiDbReferencePhysicalRoutingProvider({
      control: {provider: control, host: '10.0.0.10'},
      storage: [
        {provider: storage1, host: '10.0.0.11'},
        {provider: storage2, host: '10.0.0.11'},
        {provider: storage3, host: '10.0.0.13'},
      ],
      namePrefix: 'duplicate-host',
    }),
    /distinct physical hosts/u,
  );

  assert.throws(
    () => createTiDbReferencePhysicalRoutingProvider({
      control: {provider: control, host: '10.0.0.10'},
      storage: [
        {provider: storage1, host: '10.0.0.11'},
        {provider: storage1, host: '10.0.0.12'},
        {provider: storage3, host: '10.0.0.13'},
      ],
      namePrefix: 'duplicate-provider',
    }),
    /distinct Docker providers/u,
  );
}

async function main() {
  assertFailClosedTopology();
  await assertPhysicalPlacementAndLifecycle();
  process.stdout.write(PASS_LINE);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message || error}\n`);
  process.exitCode = 1;
});
