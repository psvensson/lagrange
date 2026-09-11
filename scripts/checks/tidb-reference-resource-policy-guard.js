#!/usr/bin/env node

import assert from 'node:assert/strict';

import {
  startTiDbReferenceCluster,
} from '../../test/distributed/harness/tidb-reference-lifecycle.js';
import {
  createTiDbReferenceLifecycleResourceProvider,
} from '../../test/distributed/harness/tidb-reference-lifecycle-resource-policy.js';

const PASS_LINE = 'tidb-reference-resource-policy-guard: PASS\n';
const SHARED_LIMITS = Object.freeze({memory: '2g', cpus: '2.0'});
const TIKV_LIMITS = Object.freeze({memory: '3g', cpus: '2.0'});

function createProviderDouble() {
  const calls = [];
  let nextId = 0;
  return {
    calls,
    marker: 'provider-marker',
    async createContainer(options) {
      nextId += 1;
      calls.push(['create', options]);
      return {containerId: `c${nextId}`, name: options.name};
    },
    async inspectContainer(containerId) {
      calls.push(['inspect', containerId]);
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
  };
}

async function assertRoleSpecificOverride() {
  const provider = createProviderDouble();
  const policyProvider = createTiDbReferenceLifecycleResourceProvider(provider, {
    tikvResourceLimits: TIKV_LIMITS,
  });
  assert.equal(policyProvider.marker, 'provider-marker');

  const cluster = await startTiDbReferenceCluster({
    provider: policyProvider,
    network: 'resource-policy-net',
    namePrefix: 'resource-policy',
    tikvStoreCount: 3,
    resourceLimits: SHARED_LIMITS,
    readinessResourceLimits: {memory: '256m', cpus: '0.5'},
    readinessPollIntervalMs: 1,
    readinessTimeoutMs: 20,
  });

  const creates = provider.calls
    .filter(([kind]) => kind === 'create')
    .map(([, options]) => options);
  assert.equal(creates.length, 6);

  const pd = creates.find(({name}) => name === 'resource-policy-pd');
  const tidb = creates.find(({name}) => name === 'resource-policy-tidb');
  const tikv = creates.filter(({name}) => name.includes('-tikv-'));
  const readiness = creates.find(({name}) => name === 'resource-policy-sql-readiness');

  assert.deepEqual(pd.resourceLimits, SHARED_LIMITS);
  assert.deepEqual(tidb.resourceLimits, SHARED_LIMITS);
  assert.equal(tikv.length, 3);
  for (const store of tikv) {
    assert.deepEqual(store.resourceLimits, TIKV_LIMITS);
  }
  assert.deepEqual(readiness.resourceLimits, {memory: '256m', cpus: '0.5'});

  // The policy is copy-on-write: callers' shared limits are never mutated.
  assert.deepEqual(SHARED_LIMITS, {memory: '2g', cpus: '2.0'});
  assert.deepEqual(TIKV_LIMITS, {memory: '3g', cpus: '2.0'});

  await cluster.stop();
}

function assertFailClosedContract() {
  assert.throws(
    () => createTiDbReferenceLifecycleResourceProvider(null, {
      tikvResourceLimits: TIKV_LIMITS,
    }),
    /requires provider/u,
  );
  assert.throws(
    () => createTiDbReferenceLifecycleResourceProvider({}, {
      tikvResourceLimits: TIKV_LIMITS,
    }),
    /requires provider\.createContainer/u,
  );
  assert.throws(
    () => createTiDbReferenceLifecycleResourceProvider(
      createProviderDouble(),
      {tikvResourceLimits: '3g'},
    ),
    /tikvResourceLimits must be an object/u,
  );
}

async function main() {
  assertFailClosedContract();
  await assertRoleSpecificOverride();
  process.stdout.write(PASS_LINE);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message || error}\n`);
  process.exitCode = 1;
});
