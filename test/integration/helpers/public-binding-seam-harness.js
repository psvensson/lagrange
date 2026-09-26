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

import {componentize} from '@bytecodealliance/componentize-js';

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
const PGWIRE_DISABLED_REPLICA_COUNT = 0;
const PGWIRE_DISABLE_SQL =
  'UPDATE service_definitions SET replica_count = ? WHERE service_id = ?';
const PGWIRE_ENDPOINT_SQL =
  'SELECT address, port FROM service_endpoints WHERE protocol = ?';
const COORDINATION_SLOTS_SQL =
  'SELECT invocation_id, slot_id FROM call_cell_reduce_slots';
const SPLIT_PARTITION_COUNT = 2;
const SINGLE_NODE_SHAPING_REPLICA_COUNT = 1;
const GUEST_SOURCE_URL = new URL(
  '../../wasm-service/fixtures/call-cell-world/guest.js',
  import.meta.url,
);
const CANONICAL_WIT_DIRECTORY = new URL('../../../wit', import.meta.url);
const CALL_CELL_WORLD = 'call-cell';
const COMPONENTIZE_DISABLED_FEATURES = Object.freeze([
  'random',
  'stdio',
  'clocks',
  'http',
  'fetch-event',
]);
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
  LISTENER_STILL_OPEN: 'sys-postgres-wire listener still accepts connections',
  MANIFEST_INVALID: 'seam manifest rejected by the manifest owner',
  SPLIT_TIMEOUT: 'managed split did not produce two routable partitions',
});

/**
 * Start one embedded runtime with the public factory's exact inputs,
 * keeping the internal runtime for labelled harness shaping only.
 *
 * @param {object} options - {nodeId, dataDir, restPort, credentials,
 *   configuration}.
 * @return {Promise<object>} {handle, engine, restoreEnvironment}.
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
    restoreEnvironment,
  };
}

async function pollUntil(read, wait, failureMessage) {
  for (;;) {
    const value = await read();
    if (value) return value;
    if (Date.now() >= wait.deadlineMs) throw new Error(failureMessage);
    await wait.pause();
  }
}

/**
 * Operator enablement of the built-in PG-wire listener in password mode.
 * Reads the published endpoint back through the application facade.
 *
 * @param {object} db - Application database facade.
 * @param {number} port - Listener port.
 * @param {{deadlineMs: number, pause: Function}} wait - Bounded wait.
 * @return {Promise<{host: string, port: number}>} Published endpoint.
 */
async function enablePasswordPgwire(db, port, wait) {
  await db.query(PGWIRE_ENABLE_SQL, [
    PGWIRE_ENABLED_REPLICA_COUNT,
    JSON.stringify({
      authMode: PGWIRE_PASSWORD_MODE,
      host: PGWIRE_HOST,
      port,
      tlsMode: PGWIRE_TLS_DISABLED,
    }),
    PGWIRE_SERVICE_ID,
  ]);
  const row = await pollUntil(async () => {
    const result = await db.query(PGWIRE_ENDPOINT_SQL, [PGWIRE_PROTOCOL]);
    return result.rows[0] || null;
  }, wait, HARNESS_ERROR.ENDPOINT_TIMEOUT);
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
 * Operator symmetric teardown: scale the listener back to zero and wait
 * until the real module has closed it.
 *
 * @param {object} db - Application database facade.
 * @param {{host: string, port: number}} endpoint - Published endpoint.
 * @param {{deadlineMs: number, pause: Function}} wait - Bounded wait.
 * @return {Promise<boolean>} Whether the listener closed in time.
 */
async function disablePgwire(db, endpoint, wait) {
  await db.query(PGWIRE_DISABLE_SQL, [
    PGWIRE_DISABLED_REPLICA_COUNT,
    PGWIRE_SERVICE_ID,
  ]);
  try {
    await pollUntil(
      async () => !(await acceptsConnections(endpoint.host, endpoint.port)),
      wait,
      HARNESS_ERROR.LISTENER_STILL_OPEN,
    );
    return true;
  } catch {
    return false;
  }
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
 * Durable coordination evidence: the per-invocation slot rows the call
 * coordinator seeds (one per shard plus the reduce-lease slot), read
 * through the application facade.
 *
 * @param {object} db - Application database facade.
 * @return {Promise<Map<string, number>>} invocation id -> slot count.
 */
async function readCoordinationSlotCounts(db) {
  const result = await db.query(COORDINATION_SLOTS_SQL, []);
  const counts = new Map();
  for (const row of result.rows) {
    counts.set(row.invocation_id, (counts.get(row.invocation_id) || 0) + 1);
  }
  return counts;
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
  const {component} = await componentize(guestSource, {
    disableFeatures: [...COMPONENTIZE_DISABLED_FEATURES],
    witPath: CANONICAL_WIT_DIRECTORY.pathname,
    worldName: CALL_CELL_WORLD,
  });
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
  disablePgwire,
  enablePasswordPgwire,
  planShardPartitions,
  readCoordinationSlotCounts,
  splitTableOnce,
  startSeamRuntime,
  useSingleNodeReplicaShape,
};
