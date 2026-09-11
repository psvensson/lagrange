#!/usr/bin/env node

import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

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

function uniqueRunId() {
  return `lagrange-tidb-live-${process.pid}-${randomUUID().slice(0, 8)}`;
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
  const images = [
    TIDB_REFERENCE_DEFAULTS.pdImage,
    TIDB_REFERENCE_DEFAULTS.tikvImage,
    TIDB_REFERENCE_DEFAULTS.tidbImage,
    TIDB_REFERENCE_DEFAULTS.mysqlClientImage,
  ];
  const missing = [];
  for (const image of images) {
    if (!(await provider.imageExists(image))) missing.push(image);
  }
  if (missing.length > ZERO) {
    throw new Error(
      'TiDB reference live smoke requires pinned images to be present locally: ' +
      missing.join(', ') + '. Pull the missing images before running the smoke.',
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

async function run() {
  const provider = new DockerProvider();
  const runId = uniqueRunId();
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
    await assertImagesAvailable(provider);

    const network = await provider.createNetwork(state.networkName, LABELS);
    state.networkId = network.id;

    state.cluster = await startTiDbReferenceCluster({
      provider,
      network: state.networkName,
      namePrefix: runId,
      resourceLimits: DATABASE_RESOURCE_LIMITS,
      readinessResourceLimits: CLIENT_RESOURCE_LIMITS,
    });

    state.containerNames.push(
      state.cluster.names.pd,
      state.cluster.names.tikv,
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
      entrypoint: ['sleep'],
      command: [CLIENT_KEEPALIVE_SECONDS],
      labels: LABELS,
    });

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

  process.stdout.write(PASS_PREFIX + JSON.stringify(result) + '\n');
}

run().catch((error) => {
  process.stderr.write(`${error.stack || error.message || error}\n`);
  process.exitCode = 1;
});
