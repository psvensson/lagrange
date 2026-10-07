/**
 * Harness and deploy-time tooling for the public Binding-invocation seam
 * proof. Nothing here is consumer code: it is the operator/CLI side of the
 * deployment (build the WASI component and its local OCI layout, derive
 * the manifest digest the CLI would pin) plus bounded, labelled SHAPING of
 * a single embedded runtime that has no product surface for it:
 *
 *  - PG-wire enablement. The built-in sys-postgres-wire definition ships
 *    `replica_count = 0` in trust mode (src/wasm-service/meta-service-
 *    factory.js) and no configuration key, environment variable, or
 *    lifecycle statement raises it, so an embedded runtime never binds a
 *    PostgreSQL listener on its own. The harness performs the one operator
 *    step that exists - a direct desired-state write of that definition -
 *    and the REAL rebalancer then places the REAL listener, which
 *    publishes its `service_endpoints` row. Recorded as a finding.
 *  - Table split. Policy splits run on a >= 60 s evaluation cadence, so
 *    the harness drives the engine's managed split once (as the
 *    call-binding demo does) to give the table two partitions.
 *
 * The runtime is created by `createEmbeddedLagrangeHandle` with exactly the
 * inputs `createEmbeddedLagrange` passes (the snapshotted configuration
 * and environment plus the real `startLagrangeRuntime`); the only
 * difference is that the harness keeps the returned internal runtime so it
 * can reach the engine for the shaping above. Consumer code never sees it.
 */

import {createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';

import {RUNTIME_KIND} from '../../../src/constants/runtime.js';
import {canonicalJson} from
  '../../../src/control-plane/owners/deployment-binding-contract.js';
import {createEmbeddedLagrangeHandle} from
  '../../../src/embedded-lagrange.js';
import {
  snapshotEmbeddedEnvironment,
  snapshotEmbeddedFactoryConfiguration,
} from '../../../src/embedded-lagrange-input.js';
import {startLagrangeRuntime} from '../../../src/lagrange-runtime-startup.js';
import {componentizeCallCellGuest} from './call-cell-guest-componentizer.js';
import {createCallCellBatchExecutor} from
  '../../../src/service/call-cell-batch-executor.js';
import {
  EXTERNAL_SERVICE_EXPORT_INTERFACE,
  EXTERNAL_SERVICE_MANIFEST_SCHEMA_VERSION,
  EXTERNAL_SERVICE_MEDIA_TYPE,
  validateExternalServiceManifest,
} from '../../../src/service/external-service-manifest.js';
import {ServiceLocalOciLayoutBuilder} from
  '../../../src/service/service-local-oci-layout-builder.js';

const SEAM_ENV_KEY = Object.freeze({
  ADMIN_WS_PORT: 'ADMIN_WS_PORT',
  DATA_DIR: 'DATA_DIR',
  NODE_ID: 'NODE_ID',
  PGWIRE_AUTH_DATABASE: 'PGWIRE_AUTH_DATABASE',
  PGWIRE_AUTH_PASSWORD: 'PGWIRE_AUTH_PASSWORD',
  PGWIRE_AUTH_USER: 'PGWIRE_AUTH_USER',
  REST_API_PORT: 'REST_API_PORT',
  TRANSPORT_WS_PORT: 'TRANSPORT_WS_PORT',
});
const ADMIN_PORT_OFFSET = 1;
const TRANSPORT_PORT_OFFSET = 2;
const SEAM_LOG_LEVEL = 'error';
const PGWIRE_SERVICE_ID = 'sys-postgres-wire';
const PGWIRE_PROTOCOL = 'postgresql';
const PGWIRE_HOST = '127.0.0.1';
const PGWIRE_PASSWORD_MODE = 'password';
const PGWIRE_TLS_DISABLED = 'disable';
const PGWIRE_ENABLED_REPLICA_COUNT = 1;
const PGWIRE_ENABLE_SQL =
  'UPDATE service_definitions SET replica_count = ?, runtime_config = ? ' +
  'WHERE service_id = ?';
const READYZ_PATH = '/readyz';
const HTTP_OK = 200;
const PGWIRE_EVIDENCE_SQL = Object.freeze({
  definition: 'SELECT service_id, status, replica_count, runtime_config ' +
    'FROM service_definitions WHERE service_id LIKE ?',
  operations: 'SELECT * FROM replica_operations WHERE entity_id LIKE ?',
  services: 'SELECT service_id, node_id, status FROM services ' +
    'WHERE service_id LIKE ?',
});
const PGWIRE_REPLICAS_SQL =
  'SELECT service_id FROM services WHERE service_id LIKE ?';
const PGWIRE_REPLICA_SUFFIX_PATTERN = '-r%';
const PGWIRE_ENDPOINT_SQL =
  'SELECT address, port FROM service_endpoints WHERE protocol = ?';
const REDUCE_WITNESS_SQL =
  'SELECT result_id, source_snapshot_json FROM call_cell_reduce_results';
const SPLIT_PARTITION_COUNT = 2;
const SINGLE_NODE_SHAPING_REPLICA_COUNT = 1;
const MERGE_DISABLED_THRESHOLD = 1;
const MERGE_DISABLED_TABLE_POLICY = Object.freeze({
  mergeStorageThreshold: MERGE_DISABLED_THRESHOLD,
  mergeTrafficThreshold: MERGE_DISABLED_THRESHOLD,
});
const GUEST_SOURCE_URL = new URL(
  '../../wasm-service/fixtures/call-cell-world/guest.js',
  import.meta.url,
);
const ARTIFACT_BUILD = Object.freeze({
  COMPONENT_FILE: 'component.wasm',
  OCI_DIRECTORY: 'oci-layouts',
  PLATFORM: 'linux/amd64',
  SOURCE_DATE_EPOCH: 1_700_000_000,
});
const CALL_EXPORT = 'run';
const MANIFEST_ARTIFACT_TYPE = 'oci';
const MANIFEST_DIGEST_PREFIX = 'sha256:';
const MANIFEST_HASH_ALGORITHM = 'sha256';
const MANIFEST_HASH_ENCODING = 'hex';
const HARNESS_ERROR = Object.freeze({
  ENDPOINT_TIMEOUT: 'sys-postgres-wire did not publish a postgresql endpoint',
  READY_TIMEOUT: 'the embedded runtime never reported /readyz 200',
  WITNESS_TIMEOUT: 'no new reduce result snapshot became readable',
  MANIFEST_INVALID: 'seam manifest rejected by the manifest owner',
  LIVE_CHILD_METRICS_REQUIRED:
    'both live child leader metrics did not become nonvacuous through the ' +
    'production manager',
  POLICY_OWNER_REQUIRED: 'the embedded runtime has no table policy owner',
  SPLIT_MANAGER_REQUIRED: 'the embedded runtime has no split/merge manager',
  SPLIT_TIMEOUT: 'managed split did not produce two routable partitions',
  TABLE_ID_REQUIRED: 'the shaped table has no canonical table id',
});

/**
 * Start one embedded runtime with the public factory's exact inputs,
 * keeping the internal runtime for labelled harness shaping only.
 *
 * @param {object} options - {nodeId, dataDir, restPort, credentials,
 *   configuration}.
 * @return {Promise<object>} Internal runtime surfaces for harness shaping.
 */
async function startSeamRuntime(options) {
  const previous = new Map();
  const assignments = {
    [SEAM_ENV_KEY.ADMIN_WS_PORT]: String(options.restPort + ADMIN_PORT_OFFSET),
    [SEAM_ENV_KEY.DATA_DIR]: options.dataDir,
    [SEAM_ENV_KEY.NODE_ID]: options.nodeId,
    [SEAM_ENV_KEY.PGWIRE_AUTH_DATABASE]: options.credentials.database,
    [SEAM_ENV_KEY.PGWIRE_AUTH_PASSWORD]: options.credentials.password,
    [SEAM_ENV_KEY.PGWIRE_AUTH_USER]: options.credentials.user,
    [SEAM_ENV_KEY.REST_API_PORT]: String(options.restPort),
    [SEAM_ENV_KEY.TRANSPORT_WS_PORT]:
      String(options.restPort + TRANSPORT_PORT_OFFSET),
  };
  for (const [key, value] of Object.entries(assignments)) {
    previous.set(key, process.env[key]);
    process.env[key] = value;
  }
  const restoreEnvironment = () => {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
  let internalRuntime = null;
  const handle = createEmbeddedLagrangeHandle({
    configurationSnapshot: snapshotEmbeddedFactoryConfiguration({
      configuration: {logging: {level: SEAM_LOG_LEVEL}},
    }),
    environmentSnapshot: snapshotEmbeddedEnvironment(),
    async startRuntime(startOptions) {
      internalRuntime = await startLagrangeRuntime(startOptions);
      return internalRuntime;
    },
  });
  await handle.start();
  return {
    engine: internalRuntime.startupOwner.sqlQueryEngine,
    handle,
    partitionServices: internalRuntime.startupOwner.partitionServices,
    runtimeDriverRegistry: internalRuntime.startupOwner.runtimeDriverRegistry,
    restoreEnvironment,
    tablePolicyService: internalRuntime.startupOwner.tablePolicyService,
  };
}

// The application facade rejects with frozen ApplicationDatabaseError
// values; tap cannot annotate a frozen rejection, so harness reads rethrow
// the typed {code, message} on a plain Error.
async function harnessQuery(db, sql, params) {
  try {
    return await db.query(sql, params);
  } catch (error) {
    throw new Error(`${error?.code}: ${error?.message}`);
  }
}

async function pollUntil(read, wait, failureMessage) {
  for (;;) {
    const value = await read();
    if (value) return value;
    if (Date.now() >= wait.deadlineMs) throw new Error(failureMessage);
    await wait.pause();
  }
}

async function isReady(restPort) {
  try {
    const response = await fetch(`http://${PGWIRE_HOST}:${restPort}${READYZ_PATH}`);
    return response.status === HTTP_OK;
  } catch {
    return false;
  }
}

// Diagnostic evidence when the listener is not placed in time: the desired
// row, any placed actual, and any replica operation for the service.
async function pgwirePlacementEvidence(db) {
  const evidence = {};
  for (const [label, sql] of Object.entries(PGWIRE_EVIDENCE_SQL)) {
    try {
      evidence[label] = (await harnessQuery(
        db, sql, [`${PGWIRE_SERVICE_ID}%`])).rows;
    } catch (error) {
      evidence[label] = error.message;
    }
  }
  return evidence;
}

/**
 * Operator enablement of the built-in PG-wire listener in password mode.
 * Reads the published endpoint back through the application facade.
 *
 * @param {object} db - Application database facade.
 * @param {number} port - Listener port.
 * @param {{deadlineMs: number, pause: Function, restPort: number}} wait -
 *   Bounded wait plus the node's REST port for the readiness probe.
 * @return {Promise<{host: string, port: number}>} Published endpoint.
 */
async function enablePasswordPgwire(db, port, wait) {
  // The documented operator order: wait for traffic readiness first.
  await pollUntil(async () => isReady(wait.restPort), wait,
    HARNESS_ERROR.READY_TIMEOUT);
  await harnessQuery(db, PGWIRE_ENABLE_SQL, [
    PGWIRE_ENABLED_REPLICA_COUNT,
    JSON.stringify({
      authMode: PGWIRE_PASSWORD_MODE,
      host: PGWIRE_HOST,
      port,
      tlsMode: PGWIRE_TLS_DISABLED,
    }),
    PGWIRE_SERVICE_ID,
  ]);
  let row;
  try {
    row = await pollUntil(async () => {
      const result = await harnessQuery(
        db, PGWIRE_ENDPOINT_SQL, [PGWIRE_PROTOCOL]);
      return result.rows[0] || null;
    }, wait, HARNESS_ERROR.ENDPOINT_TIMEOUT);
  } catch (error) {
    throw new Error(`${error.message}: ${
      JSON.stringify(await pgwirePlacementEvidence(db))}`);
  }
  return Object.freeze({host: row.address, port: Number(row.port)});
}

function acceptsConnections(host, port) {
  return new Promise((resolve) => {
    const socket = net.connect({host, port});
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  });
}

/**
 * Harness teardown for a FINDING, not a product path: the embedded
 * `stop()` leaves the placed sys-postgres-wire listener bound, because
 * ServiceRuntimeLifecycle.shutdown() stops only drivers exposing
 * `shutdown()` and NativeJsDriver has none (src/runtime/native-js-driver.js;
 * src/runtime/service-runtime-lifecycle-operation-methods.js). Before the
 * runtime stops, the harness stops each placed PG-wire replica through the
 * driver's own `stop()` so the test process can exit.
 *
 * @param {object} runtime - {engine, runtimeDriverRegistry} from startSeamRuntime.
 * @param {object} db - Application database facade.
 * @return {Promise<string[]>} Stopped replica service ids.
 */
async function stopPlacedPgwireReplicas(runtime, db) {
  const result = await harnessQuery(db, PGWIRE_REPLICAS_SQL, [
    `${PGWIRE_SERVICE_ID}${PGWIRE_REPLICA_SUFFIX_PATTERN}`,
  ]);
  const driver = runtime.runtimeDriverRegistry.getDriver(RUNTIME_KIND.NATIVE_JS);
  const stopped = [];
  for (const row of result.rows) {
    await driver.stop({serviceId: row.service_id});
    stopped.push(row.service_id);
  }
  return stopped;
}

/**
 * Single-node shaping, mirroring the call-binding demo: one replica per
 * new partition so the managed split's admission quorum is satisfiable on
 * one node.
 *
 * @param {object} engine - Internal SQL engine (harness only).
 */
function useSingleNodeReplicaShape(engine) {
  engine.tableCreationService.defaultReplicaCount =
    SINGLE_NODE_SHAPING_REPLICA_COUNT;
}

/**
 * Drive one managed split of the table's only partition (harness shaping)
 * and wait until the router sees two partitions.
 *
 * @param {object} engine - Internal SQL engine (harness only).
 * @param {string} tableName - Table to split.
 * @param {{deadlineMs: number, pause: Function}} wait - Bounded wait.
 * @return {Promise<object[]>} Routable partition rows.
 */
async function splitTableOnce(engine, tableName, wait) {
  const [only] = engine.getTablePartitions(tableName);
  await engine.executeManagedSplit(only.partition_id || only.partitionId);
  return pollUntil(() => {
    const partitions = engine.getTablePartitions(tableName) || [];
    return partitions.length === SPLIT_PARTITION_COUNT ? partitions : null;
  }, wait, HARNESS_ERROR.SPLIT_TIMEOUT);
}

function partitionIdOf(partition) {
  return partition?.partition_id || partition?.partitionId || null;
}

function findLiveLeaderPartitionService(partitionServices, partitionId) {
  for (const service of partitionServices?.values?.() || []) {
    if (service?.partitionId === partitionId &&
        service.isLeader === true &&
        typeof service.getSize === 'function') {
      return service;
    }
  }
  return null;
}

async function waitForLiveChildMetrics(runtime, manager, partitions, wait) {
  return pollUntil(async () => {
    const metrics = [];
    for (const partition of partitions) {
      const partitionId = partitionIdOf(partition);
      const service = findLiveLeaderPartitionService(
        runtime.partitionServices, partitionId);
      if (!service) return null;
      const liveSizeBytes = Number(service.getSize());
      const managerMetrics = await manager.resolvePartitionMetrics(partition);
      if (!Number.isFinite(liveSizeBytes) ||
          Number(managerMetrics.sizeBytes) !== liveSizeBytes) {
        return null;
      }
      metrics.push({liveSizeBytes, managerMetrics});
    }
    const combinedSizeBytes = metrics.reduce(
      (total, metric) => total + metric.liveSizeBytes, 0);
    return combinedSizeBytes > MERGE_DISABLED_THRESHOLD ?
      {combinedSizeBytes, metrics} : null;
  }, wait, HARNESS_ERROR.LIVE_CHILD_METRICS_REQUIRED);
}

/**
 * Persist the repository's canonical merge-disabled table policy, drive one
 * managed split, then report the production manager's policy, live metrics,
 * and merge decision for the test's independent assertions. This is harness
 * shaping only: every decision surface used here is production.
 *
 * @param {object} runtime - Internal runtime retained by startSeamRuntime.
 * @param {string} tableName - Table whose two-partition proof is required.
 * @param {{deadlineMs: number, pause: Function}} wait - Existing split wait.
 * @return {Promise<object>} Frozen partitions and owner-decision evidence.
 */
async function shapeStableTwoPartitionFanout(runtime, tableName, wait) {
  const tablePolicyService = runtime?.tablePolicyService;
  if (!tablePolicyService) {
    throw new Error(HARNESS_ERROR.POLICY_OWNER_REQUIRED);
  }
  const table = runtime.engine.getTableInfo(tableName);
  const tableId = table?.table_id || table?.tableId || null;
  if (!tableId) {
    throw new Error(HARNESS_ERROR.TABLE_ID_REQUIRED);
  }

  await tablePolicyService.updateTablePolicy(
    tableId,
    MERGE_DISABLED_TABLE_POLICY,
  );
  const visiblePolicy = await tablePolicyService.getTablePolicy(tableId);

  const partitions = await splitTableOnce(runtime.engine, tableName, wait);
  const manager = runtime.engine.partitionSplitMergeManager;
  if (!manager) {
    throw new Error(HARNESS_ERROR.SPLIT_MANAGER_REQUIRED);
  }
  const [leftPartition, rightPartition] = partitions;
  const leftPartitionId = partitionIdOf(leftPartition);
  const rightPartitionId = partitionIdOf(rightPartition);
  const liveMetrics = await waitForLiveChildMetrics(
    runtime, manager, partitions, wait);
  const [leftMetrics, rightMetrics] = liveMetrics.metrics.map(
    (metric) => metric.managerMetrics);
  const combinedSizeBytes = liveMetrics.combinedSizeBytes;
  const effectivePolicy = await manager.getTablePolicy(leftPartitionId);
  const mergeEligible = manager.evaluateMergeCriteria(
    leftPartitionId,
    rightPartitionId,
    leftMetrics,
    rightMetrics,
    effectivePolicy,
  );

  return Object.freeze({
    combinedSizeBytes,
    effectivePolicy: Object.freeze({
      mergeStorageThreshold: effectivePolicy.mergeStorageThreshold,
      mergeTrafficThreshold: effectivePolicy.mergeTrafficThreshold,
    }),
    liveSizeBytes: Object.freeze(
      liveMetrics.metrics.map((metric) => metric.liveSizeBytes)),
    managerSizeBytes: Object.freeze(
      liveMetrics.metrics.map((metric) => metric.managerMetrics.sizeBytes)),
    mergeEligible,
    partitions: Object.freeze([...partitions]),
    tableId,
    visiblePolicy: Object.freeze({
      mergeStorageThreshold: visiblePolicy.mergeStorageThreshold,
      mergeTrafficThreshold: visiblePolicy.mergeTrafficThreshold,
    }),
  });
}

/**
 * Harness evidence only: the shard plan the canonical call planner makes
 * for a declared statement, through the same batch-executor factory and
 * engine dependencies the runtime composes (call-cell-invocation-setup).
 *
 * @param {object} engine - Internal SQL engine (harness only).
 * @param {string} statement - Declared Binding statement.
 * @return {string[]} Planned shard partition ids.
 */
function planShardPartitions(engine, statement) {
  const planner = createCallCellBatchExecutor({
    partitionResolver: engine.partitionResolver,
    partitionsProvider: (tableName) => engine.getTablePartitions(tableName),
    queryExecutor: engine.queryExecutor,
    sqlParser: {parse: (sql) => engine.parse(sql)},
  });
  return planner.planShards({statement}).shards
    .map((shard) => shard.partitionId);
}

/**
 * Durable coordination evidence: the witness the reduce coordinator
 * publishes with each final result snapshot names every shard slot that
 * contributed, read back through the application facade.
 *
 * @param {object} db - Application database facade.
 * @return {Promise<Map<string, number>>} result id -> witnessed shard slots.
 */
async function readReducedShardCounts(db) {
  const result = await harnessQuery(db, REDUCE_WITNESS_SQL, []);
  const counts = new Map();
  for (const row of result.rows) {
    const witness = parseWitness(row.source_snapshot_json);
    if (Array.isArray(witness?.slots)) {
      counts.set(row.result_id, witness.slots.length);
    }
  }
  return counts;
}

function parseWitness(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Wait until a result snapshot that was not in `before` is readable and
 * return the witnessed shard counts of every such new result.
 *
 * @param {object} db - Application database facade.
 * @param {Map<string, number>} before - Counts read before the call.
 * @param {{deadlineMs: number, pause: Function}} wait - Bounded wait.
 * @return {Promise<number[]>} Witnessed shard counts of new results.
 */
async function newReducedShardCounts(db, before, wait) {
  return pollUntil(async () => {
    const fresh = [...await readReducedShardCounts(db)]
      .filter(([resultId]) => !before.has(resultId))
      .map(([, count]) => count);
    return fresh.length > 0 ? fresh : null;
  }, wait, HARNESS_ERROR.WITNESS_TIMEOUT);
}

function manifestDigestOf(manifest) {
  return MANIFEST_DIGEST_PREFIX + createHash(MANIFEST_HASH_ALGORITHM)
    .update(canonicalJson(manifest))
    .digest(MANIFEST_HASH_ENCODING);
}

/**
 * Deploy-time tooling (the CLI's job): componentize the call-cell guest,
 * publish it as a verified local OCI layout, and derive the normalized
 * manifest plus its canonical digest.
 *
 * @param {string} root - Temporary build root.
 * @param {{name: string, version: string, ref: string}} identity - Service.
 * @return {Promise<object>} {layoutPath, manifest, manifestDigest,
 *   withVersion(version)}.
 */
async function buildCallArtifact(root, identity) {
  const guestSource = await readFile(GUEST_SOURCE_URL, 'utf8');
  const component = await componentizeCallCellGuest(guestSource);
  const componentPath = path.join(root, ARTIFACT_BUILD.COMPONENT_FILE);
  await writeFile(componentPath, component);
  const receipt = await new ServiceLocalOciLayoutBuilder().build({
    outputRoot: path.join(root, ARTIFACT_BUILD.OCI_DIRECTORY),
    platform: ARTIFACT_BUILD.PLATFORM,
    runtimeKind: RUNTIME_KIND.WASM_COMPONENT,
    sourceDateEpoch: ARTIFACT_BUILD.SOURCE_DATE_EPOCH,
    wasm: {payloadPath: componentPath},
  });
  const manifestFor = (version) => {
    const validated = validateExternalServiceManifest({
      artifact: {
        digest: receipt.topManifestDescriptor.digest,
        media_type: EXTERNAL_SERVICE_MEDIA_TYPE.WASM_COMPONENT,
        ref: identity.ref,
        size_bytes: receipt.topManifestDescriptor.sizeBytes,
        type: MANIFEST_ARTIFACT_TYPE,
      },
      exports: [{
        interface: EXTERNAL_SERVICE_EXPORT_INTERFACE.CALL,
        name: CALL_EXPORT,
      }],
      name: identity.name,
      runtime: {kind: RUNTIME_KIND.WASM_COMPONENT},
      schema_version: EXTERNAL_SERVICE_MANIFEST_SCHEMA_VERSION,
      version,
    });
    if (!validated.valid) throw new Error(HARNESS_ERROR.MANIFEST_INVALID);
    return Object.freeze({
      manifest: validated.manifest,
      manifestDigest: manifestDigestOf(validated.manifest),
    });
  };
  return Object.freeze({
    callExport: CALL_EXPORT,
    layoutPath: receipt.layoutPath,
    ...manifestFor(identity.version),
    withVersion: manifestFor,
  });
}

export {
  acceptsConnections,
  buildCallArtifact,
  enablePasswordPgwire,
  MERGE_DISABLED_TABLE_POLICY,
  planShardPartitions,
  newReducedShardCounts,
  readReducedShardCounts,
  shapeStableTwoPartitionFanout,
  splitTableOnce,
  startSeamRuntime,
  stopPlacedPgwireReplicas,
  useSingleNodeReplicaShape,
};
