#!/usr/bin/env node

import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';

import {DockerProvider} from
  '../../test/distributed/harness/docker-provider.js';
import {
  TIDB_REFERENCE_DEFAULTS,
  startTiDbReferenceCluster,
} from '../../test/distributed/harness/tidb-reference-lifecycle.js';

const ZERO = 0;
const SMOKE_VALUE = '424242';
const SMOKE_DATABASE = 'lagrange_tidb_smoke';
const CLIENT_KEEPALIVE_SECONDS = '300';
const CLIENT_RESOURCE_LIMITS = Object.freeze({
  memory: '256m',
  cpus: '0.5',
});
const DATABASE_RESOURCE_LIMITS = Object.freeze({
  memory: '2g',
  cpus: '2.0',
});
const LABELS = Object.freeze({
  'lagrange.benchmark': 'tidb-reference-lifecycle-live',
});
const PASS_PREFIX = 'tidb-reference-lifecycle-live: PASS ';
const REQUIRED_IMAGES = Object.freeze([
  TIDB_REFERENCE_DEFAULTS.pdImage,
  TIDB_REFERENCE_DEFAULTS.tikvImage,
  TIDB_REFERENCE_DEFAULTS.tidbImage,
  TIDB_REFERENCE_DEFAULTS.mysqlClientImage,
]);

function uniqueRunId() {
  return `lagrange-tidb-live-${process.pid}-${randomUUID().slice(0, 8)}`;
}

function normalizeStoreCount(value) {
  const count = value ?? TIDB_REFERENCE_DEFAULTS.tikvStoreCount;
  if (!Number.isInteger(count) || count < 1) {
    throw new Error('TiDB reference live smoke requires a positive integer store count');
  }
  return count;
}

function smokeSql() {
  return [
    `DROP DATABASE IF EXISTS ${SMOKE_DATABASE}`,
    `CREATE DATABASE ${SMOKE_DATABASE}`,
    `USE ${SMOKE_DATABASE}`,
    'CREATE TABLE probe (' +
      'id BIGINT PRIMARY KEY, value BIGINT NOT NULL' +
      ')',
    `INSERT INTO probe (id, value) VALUES (1, ${SMOKE_VALUE})`,
    'SELECT value FROM probe WHERE id = 1',
    `DROP DATABASE ${SMOKE_DATABASE}`,
  ].join('; ') + ';';
}

function mysqlCommand(endpoint, sql) {
  return [
    'mysql',
    '--protocol=TCP',
    `--host=${endpoint.host}`,
    `--port=${endpoint.port}`,
    '--user=root',
    '--connect-timeout=5',
    '--batch',
    '--skip-column-names',
    '--execute',
    sql,
  ];
}

async function assertImagesAvailable(provider) {
  const missing = [];
  for (const image of REQUIRED_IMAGES) {
    if (!(await provider.imageExists(image))) missing.push(image);
  }
  if (missing.length > ZERO) {
    throw new Error(
      'TiDB reference live smoke requires pinned images to be present: ' +
      missing.join(', ') + '. Install the missing images before running the smoke.',
    );
  }
}

async function removeContainerIfPresent(provider, containerRef) {
  if (!containerRef) return;
  const inspect = await provider.inspectContainerIfExists(containerRef);
  if (!inspect) return;
  if (inspect.State?.Running === true || inspect.State?.Status === 'running') {
    await provider.stopContainer(inspect.Id || containerRef);
  }
  await provider.removeContainer(inspect.Id || containerRef);
}

async function cleanup(provider, state) {
  const failures = [];

  if (state.client?.containerId) {
    try {
      await removeContainerIfPresent(provider, state.client.containerId);
    } catch (error) {
      failures.push(error);
    }
  }

  if (state.cluster) {
    try {
      await state.cluster.stop();
    } catch (error) {
      failures.push(error);
    }
  }

  if (state.networkId) {
    try {
      await provider.removeNetwork(state.networkId);
    } catch (error) {
      failures.push(error);
    }
  }

  if (failures.length > ZERO) {
    throw new AggregateError(
      failures,
      'TiDB reference live smoke cleanup failed',
    );
  }
}

async function assertCleanup(provider, state) {
  const remainingNetwork = await provider.getNetworkByName(state.networkName);
  assert.equal(
    remainingNetwork,
    null,
    `Expected Docker network ${state.networkName} to be removed`,
  );

  for (const name of state.containerNames) {
    const remaining = await provider.inspectContainerIfExists(name);
    assert.equal(
      remaining,
      null,
      `Expected Docker container ${name} to be removed`,
    );
  }
}

async function runTiDbReferenceLifecycleSmoke(options = {}) {
  const provider = options.provider || new DockerProvider();
  const runId = options.runId || uniqueRunId();
  const tikvStoreCount = normalizeStoreCount(options.tikvStoreCount);
  const state = {
    networkName: `${runId}-net`,
    networkId: null,
    cluster: null,
    client: null,
    containerNames: [],
  };
  let primaryError = null;
  let result = null;

  try {
    if (options.requireImages !== false) {
      await assertImagesAvailable(provider);
    }

    const network = await provider.createNetwork(state.networkName, LABELS);
    state.networkId = network.id;

    state.cluster = await startTiDbReferenceCluster({
      provider,
      network: state.networkName,
      namePrefix: runId,
      tikvStoreCount,
      resourceLimits: DATABASE_RESOURCE_LIMITS,
      readinessResourceLimits: CLIENT_RESOURCE_LIMITS,
    });

    state.containerNames.push(
      state.cluster.names.pd,
      ...state.cluster.names.tikvStores,
      state.cluster.names.tidb,
      state.cluster.names.readiness,
    );

    const clientName = `${runId}-smoke-client`;
    state.containerNames.push(clientName);
    state.client = await provider.createContainer({
      name: clientName,
      image: TIDB_REFERENCE_DEFAULTS.mysqlClientImage,
      network: state.networkName,
      resourceLimits: CLIENT_RESOURCE_LIMITS,
      hostConfigExtras: {NetworkMode: state.networkName},
      entrypoint: ['sleep'],
      command: [CLIENT_KEEPALIVE_SECONDS],
      labels: LABELS,
    });

    const storeQuery = await provider.execInContainer(
      state.client.containerId,
      mysqlCommand(
        state.cluster.endpoints.mysql,
        "SELECT COUNT(*) FROM INFORMATION_SCHEMA.TIKV_STORE_STATUS WHERE STORE_STATE_NAME = 'Up';",
      ),
    );
    assert.equal(
      storeQuery.exitCode,
      ZERO,
      `TiDB store-status SQL failed: ${storeQuery.stderr || storeQuery.stdout}`,
    );
    const upTiKvStores = Number.parseInt(String(storeQuery.stdout || '').trim(), 10);
    assert.equal(
      upTiKvStores,
      tikvStoreCount,
      `Expected exactly ${tikvStoreCount} Up TiKV stores before SQL round-trip`,
    );

    const query = await provider.execInContainer(
      state.client.containerId,
      mysqlCommand(state.cluster.endpoints.mysql, smokeSql()),
    );
    assert.equal(
      query.exitCode,
      ZERO,
      `TiDB smoke SQL failed: ${query.stderr || query.stdout}`,
    );
    assert.equal(
      String(query.stdout || '').trim(),
      SMOKE_VALUE,
      'TiDB smoke SQL did not round-trip the expected TiKV-backed value',
    );

    result = {
      status: 'passed',
      queryValue: SMOKE_VALUE,
      tikvStoreCount,
      upTiKvStores,
      readinessAttempts: state.cluster.readiness.attempts,
      images: state.cluster.images,
    };
  } catch (error) {
    primaryError = error;
  }

  let cleanupError = null;
  try {
    await cleanup(provider, state);
    await assertCleanup(provider, state);
  } catch (error) {
    cleanupError = error;
  }

  if (primaryError && cleanupError) {
    throw new AggregateError(
      [primaryError, cleanupError],
      'TiDB reference live smoke and cleanup both failed',
    );
  }
  if (primaryError) throw primaryError;
  if (cleanupError) throw cleanupError;
  return result;
}

async function main() {
  const requestedStoreCount = process.env.TIDB_REFERENCE_TIKV_STORE_COUNT ?
    Number(process.env.TIDB_REFERENCE_TIKV_STORE_COUNT) :
    TIDB_REFERENCE_DEFAULTS.tikvStoreCount;
  const result = await runTiDbReferenceLifecycleSmoke({
    tikvStoreCount: requestedStoreCount,
  });
  process.stdout.write(PASS_PREFIX + JSON.stringify(result) + '\n');
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message || error}\n`);
    process.exitCode = 1;
  });
}

export {
  REQUIRED_IMAGES as TIDB_REFERENCE_REQUIRED_IMAGES,
  assertImagesAvailable as assertTiDbReferenceImagesAvailable,
  runTiDbReferenceLifecycleSmoke,
};
