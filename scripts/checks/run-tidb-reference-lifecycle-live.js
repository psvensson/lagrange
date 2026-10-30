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

const stringTrim = Function.call.bind(String.prototype.trim);
const stringSplit = Function.call.bind(String.prototype.split);
const arrayMap = Function.call.bind(Array.prototype.map);
const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayEvery = Function.call.bind(Array.prototype.every);

const ZERO = 0;
const ONE = 1;
const DEFAULT_REPLICA_TARGET = 3;
const SMOKE_VALUE = '424242';
const SMOKE_DATABASE = 'lagrange_tidb_smoke';
const SMOKE_TABLE = 'probe';
const CLIENT_KEEPALIVE_SECONDS = '300';
const REPLICATION_TIMEOUT_MS = 90000;
const REPLICATION_POLL_INTERVAL_MS = 1000;
const RUN_ID_SUFFIX_LENGTH = 8;
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

const ERROR_POSITIVE_STORE_COUNT =
  'TiDB reference live smoke requires a positive integer store count';
const ERROR_REQUIRED_IMAGES_PREFIX =
  'TiDB reference live smoke requires pinned images to be present: ';
const ERROR_REQUIRED_IMAGES_SUFFIX =
  '. Install the missing images before running the smoke.';
const ERROR_CLEANUP_FAILED = 'TiDB reference live smoke cleanup failed';
const ERROR_SQL_ROUNDTRIP_VALUE =
  'TiDB smoke SQL did not round-trip the expected TiKV-backed value';
const ERROR_SMOKE_AND_CLEANUP_FAILED =
  'TiDB reference live smoke and cleanup both failed';

const SQL_COLUMNS_DEFINITION = 'id BIGINT PRIMARY KEY, value BIGINT NOT NULL';
const SQL_CLOSE_PAREN = ')';
const SQL_STATEMENT_SEPARATOR = '; ';
const SQL_TRAILING_SEMICOLON = ';';

const REPLICATION_SQL =
  'SELECT r.REGION_ID, ' +
  'COUNT(p.PEER_ID) AS peer_count, ' +
  'COUNT(DISTINCT p.STORE_ID) AS store_count, ' +
  'COALESCE(SUM(CASE WHEN p.IS_LEARNER = 1 THEN 1 ELSE 0 END), 0) ' +
  'AS learner_count, ' +
  'COALESCE(SUM(CASE WHEN p.IS_LEADER = 1 THEN 1 ELSE 0 END), 0) ' +
  'AS leader_count ' +
  'FROM ( ' +
  'SELECT DISTINCT REGION_ID ' +
  'FROM INFORMATION_SCHEMA.TIKV_REGION_STATUS ' +
  `WHERE DB_NAME = '${SMOKE_DATABASE}' ` +
  `AND TABLE_NAME = '${SMOKE_TABLE}' ` +
  'AND IS_INDEX = 0 ' +
  ') AS r ' +
  'LEFT JOIN INFORMATION_SCHEMA.TIKV_REGION_PEERS AS p ' +
  'ON p.REGION_ID = r.REGION_ID ' +
  'GROUP BY r.REGION_ID ' +
  'ORDER BY r.REGION_ID;';

const MYSQL_BIN = 'mysql';
const MYSQL_ARG_PROTOCOL_TCP = '--protocol=TCP';
const MYSQL_ARG_USER_ROOT = '--user=root';
const MYSQL_ARG_CONNECT_TIMEOUT = '--connect-timeout=5';
const MYSQL_ARG_BATCH = '--batch';
const MYSQL_ARG_SKIP_COLUMN_NAMES = '--skip-column-names';
const MYSQL_ARG_EXECUTE = '--execute';

const UNKNOWN_VALUE = 'unknown';
const COMMA_SPACE = ', ';
const STATUS_RUNNING = 'running';
const STATUS_PASSED = 'passed';
const COMMAND_SLEEP = 'sleep';
const NEWLINE = '\n';

function uniqueRunId() {
  return `lagrange-tidb-live-${process.pid}-${randomUUID().slice(0, RUN_ID_SUFFIX_LENGTH)}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeStoreCount(value) {
  const count = value ?? TIDB_REFERENCE_DEFAULTS.tikvStoreCount;
  if (!Number.isInteger(count) || count < ONE) {
    throw new Error(ERROR_POSITIVE_STORE_COUNT);
  }
  return count;
}

function smokeSetupSql() {
  return [
    `DROP DATABASE IF EXISTS ${SMOKE_DATABASE}`,
    `CREATE DATABASE ${SMOKE_DATABASE}`,
    `USE ${SMOKE_DATABASE}`,
    `CREATE TABLE ${SMOKE_TABLE} (` +
      SQL_COLUMNS_DEFINITION +
      SQL_CLOSE_PAREN,
    `INSERT INTO ${SMOKE_TABLE} (id, value) VALUES (1, ${SMOKE_VALUE})`,
    `SELECT value FROM ${SMOKE_TABLE} WHERE id = 1`,
  ].join(SQL_STATEMENT_SEPARATOR) + SQL_TRAILING_SEMICOLON;
}

function smokeCleanupSql() {
  return `DROP DATABASE IF EXISTS ${SMOKE_DATABASE};`;
}

function replicationSql() {
  return REPLICATION_SQL;
}

function mysqlCommand(endpoint, sql) {
  return [
    MYSQL_BIN,
    MYSQL_ARG_PROTOCOL_TCP,
    `--host=${endpoint.host}`,
    `--port=${endpoint.port}`,
    MYSQL_ARG_USER_ROOT,
    MYSQL_ARG_CONNECT_TIMEOUT,
    MYSQL_ARG_BATCH,
    MYSQL_ARG_SKIP_COLUMN_NAMES,
    MYSQL_ARG_EXECUTE,
    sql,
  ];
}

function parseReplicationRows(stdout) {
  const text = stringTrim(String(stdout || ''));
  if (!text) return [];
  const lines = arrayFilter(stringSplit(text, NEWLINE), Boolean);
  return arrayMap(lines, (line) => {
    const [regionId, peerCount, storeCount, learnerCount, leaderCount] =
      stringSplit(stringTrim(line), /\s+/u);
    return {
      regionId,
      peerCount: Number.parseInt(peerCount, 10),
      storeCount: Number.parseInt(storeCount, 10),
      learnerCount: Number.parseInt(learnerCount, 10),
      leaderCount: Number.parseInt(leaderCount, 10),
    };
  });
}

function regionHasReplicaContract(region, replicaTarget) {
  return region.peerCount === replicaTarget &&
    region.storeCount === replicaTarget &&
    region.learnerCount === ZERO &&
    region.leaderCount === ONE;
}

async function waitForTableReplication(
  provider,
  clientContainerId,
  endpoint,
  replicaTarget,
) {
  const started = Date.now();
  let attempts = ZERO;
  let lastRows = [];
  let lastResult = null;

  while (Date.now() - started < REPLICATION_TIMEOUT_MS) {
    attempts += ONE;
    lastResult = await provider.execInContainer(
      clientContainerId,
      mysqlCommand(endpoint, replicationSql()),
    );
    if (lastResult?.exitCode === ZERO) {
      lastRows = parseReplicationRows(lastResult.stdout);
      if (lastRows.length > ZERO &&
          arrayEvery(lastRows, (region) =>
            regionHasReplicaContract(region, replicaTarget))) {
        return {
          attempts,
          replicaTarget,
          regionCount: lastRows.length,
          regions: lastRows,
        };
      }
    }
    await sleep(REPLICATION_POLL_INTERVAL_MS);
  }

  throw new Error(
    `TiDB table replication did not converge to RF=${replicaTarget} within ` +
    `${REPLICATION_TIMEOUT_MS}ms; exit=${lastResult?.exitCode ?? UNKNOWN_VALUE} ` +
    `stderr=${JSON.stringify(lastResult?.stderr || '')} ` +
    `regions=${JSON.stringify(lastRows)}`,
  );
}

async function assertImagesAvailable(provider) {
  const missing = [];
  for (const image of REQUIRED_IMAGES) {
    if (!(await provider.imageExists(image))) missing.push(image);
  }
  if (missing.length > ZERO) {
    throw new Error(
      ERROR_REQUIRED_IMAGES_PREFIX +
      missing.join(COMMA_SPACE) + ERROR_REQUIRED_IMAGES_SUFFIX,
    );
  }
}

async function removeContainerIfPresent(provider, containerRef) {
  if (!containerRef) return;
  const inspect = await provider.inspectContainerIfExists(containerRef);
  if (!inspect) return;
  if (inspect.State?.Running === true || inspect.State?.Status === STATUS_RUNNING) {
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

  if (failures.length > 0) {
    throw new AggregateError(
      failures,
      ERROR_CLEANUP_FAILED,
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
  const replicaTarget = Math.min(DEFAULT_REPLICA_TARGET, tikvStoreCount);
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
      entrypoint: [COMMAND_SLEEP],
      command: [CLIENT_KEEPALIVE_SECONDS],
      labels: LABELS,
    });

    const storeQuery = await provider.execInContainer(
      state.client.containerId,
      mysqlCommand(
        state.cluster.endpoints.mysql,
        'SELECT COUNT(*) FROM INFORMATION_SCHEMA.TIKV_STORE_STATUS ' +
          'WHERE STORE_STATE_NAME = \'Up\';',
      ),
    );
    assert.equal(
      storeQuery.exitCode,
      ZERO,
      `TiDB store-status SQL failed: ${storeQuery.stderr || storeQuery.stdout}`,
    );
    const upTiKvStores = Number.parseInt(
      stringTrim(String(storeQuery.stdout || '')),
      10,
    );
    assert.equal(
      upTiKvStores,
      tikvStoreCount,
      `Expected exactly ${tikvStoreCount} Up TiKV stores before SQL round-trip`,
    );

    const query = await provider.execInContainer(
      state.client.containerId,
      mysqlCommand(state.cluster.endpoints.mysql, smokeSetupSql()),
    );
    assert.equal(
      query.exitCode,
      ZERO,
      `TiDB smoke SQL failed: ${query.stderr || query.stdout}`,
    );
    assert.equal(
      stringTrim(String(query.stdout || '')),
      SMOKE_VALUE,
      ERROR_SQL_ROUNDTRIP_VALUE,
    );

    const replication = await waitForTableReplication(
      provider,
      state.client.containerId,
      state.cluster.endpoints.mysql,
      replicaTarget,
    );

    const dropResult = await provider.execInContainer(
      state.client.containerId,
      mysqlCommand(state.cluster.endpoints.mysql, smokeCleanupSql()),
    );
    assert.equal(
      dropResult.exitCode,
      ZERO,
      `TiDB smoke cleanup SQL failed: ${dropResult.stderr || dropResult.stdout}`,
    );

    result = {
      status: STATUS_PASSED,
      queryValue: SMOKE_VALUE,
      tikvStoreCount,
      upTiKvStores,
      readinessAttempts: state.cluster.readiness.attempts,
      replicaTarget: replication.replicaTarget,
      replicatedRegionCount: replication.regionCount,
      replicationAttempts: replication.attempts,
      regions: replication.regions,
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
      ERROR_SMOKE_AND_CLEANUP_FAILED,
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
  process.stdout.write(PASS_PREFIX + JSON.stringify(result) + NEWLINE);
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message || error}${NEWLINE}`);
    process.exitCode = 1;
  });
}

export {
  REQUIRED_IMAGES as TIDB_REFERENCE_REQUIRED_IMAGES,
  assertImagesAvailable as assertTiDbReferenceImagesAvailable,
  runTiDbReferenceLifecycleSmoke,
};
