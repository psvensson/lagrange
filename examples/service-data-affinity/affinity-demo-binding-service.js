/**
 * Public WASI call-Binding deployment and invocation helpers for the MovieLens
 * service↔data affinity demo.
 *
 * Uses the canonical code-first service pipeline (`runGenerate` -> `runBuild`
 * -> `runDeploy` in `src/cli/service-pipeline-command.js`) over an
 * authenticated PostgreSQL-wire session on `sys-postgres-wire` (scaled through
 * the authoritative `/api/admin/services/sys-postgres-wire/scale` route).
 */

import {copyFile, mkdir, rm, symlink} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Client} from 'pg';
import {
  ADMIN_OWNER_OPERATION_OUTCOME,
  ADMIN_OWNER_OPERATION_PATH,
} from '../../src/admin/admin-owner-operations.js';
import {
  runBuild,
  runDeploy,
  runGenerate,
} from '../../src/cli/service-pipeline-command.js';
import {META_SERVICE_ID} from '../../src/constants/wasm-meta.js';
import {
  deriveBindingId,
  deriveBindingVersionId,
} from '../../src/control-plane/owners/deployment-binding-contract.js';
import {
  POSTGRES_WIRE_SCALE_STATE,
} from '../../src/control-plane/owners/postgres-wire-scale-contract.js';
import {
  deriveRequestServiceDefinitionId,
} from '../../src/control-plane/owners/request-binding-service-definition-contract.js';
import {
  SERVICE_INSTALL_CATALOG_MESSAGE,
} from '../../src/control-plane/owners/service-install-catalog-contract.js';
import {
  PGWIRE_AUTH_MODE,
  PGWIRE_CONFIG_FIELD,
  PGWIRE_TLS_MODE,
} from '../../src/runtime/pgwire-descriptor.js';
import {
  ServiceLocalOciLayoutBuilder,
} from '../../src/service/service-local-oci-layout-builder.js';
import {EP_COL} from '../../src/wasm-service/service-endpoint-builder.js';
import {
  WASM_SERVICE_HEALTH_STATUS,
  WASM_SERVICE_PROTOCOL,
} from '../../src/wasm-service/wasm-service-constants.js';

const DEMO_PGWIRE_AUTH = Object.freeze({
  DATABASE: 'lagrange_harness',
  PASSWORD: 'lagrange-harness-password',
  USER: 'lagrange-harness-user',
});
const DEFAULT_ARTIFACTS_RELATIVE_PATH = 'test-output/scenario-artifacts';
const EXAMPLE_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(EXAMPLE_DIR, '..', '..');
const SERVICE_MODULE_FILE = 'lagrange.service.js';
const SOURCE_SYMLINK_NAME = 'src';
const PROJECT_SUBDIR = 'project';
const SCENARIO_SUBDIR = 'movielens-affinity-demo';
const MOVIELENS_CALL_BINDING_NAME = 'movielens--call--topn';
const CALL_BINDING_SQL = 'CALL BINDING $1';
const CALL_BINDING_SCHEMA_VERSION = 2;
const IDEMPOTENCY_KEY = 'movielens-affinity-demo-deploy-v1';
const IDEMPOTENT_INSTALL_STATEMENT = /^\s*INSTALL\b/iu;
const HTTP_TIMEOUT_MS = 15_000;
const LISTENER_READY_TIMEOUT_MS = 120_000;
const LISTENER_POLL_MS = 1_000;
const PG_CONNECT_TIMEOUT_MS = 5_000;
const INSTALL_RETRY_DELAY_MS = 2_000;
const INSTALL_MAX_ATTEMPTS = 30;
const LOOPBACK_HOST = '127.0.0.1';
const BIND_ALL_HOST = '0.0.0.0';
const WILDCARD_IPV6_HOST = '::';

const SELECT_PUBLIC_ENDPOINTS_SQL =
  `SELECT ${EP_COL.NODE_ID}, ${EP_COL.ADDRESS}, ${EP_COL.PORT}, ` +
  `${EP_COL.HEALTH_STATUS} FROM service_endpoints ` +
  `WHERE ${EP_COL.PROTOCOL} = '${WASM_SERVICE_PROTOCOL.POSTGRESQL}' ` +
  `AND ${EP_COL.SERVICE_ID} = '${META_SERVICE_ID.POSTGRES_WIRE}'`;
const SELECT_NODES_ADDRESS_SQL = 'SELECT node_id, address FROM nodes';

function defaultSleep(delayMs) {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

function deriveMovielensCallServiceId(
  tenantId = DEMO_PGWIRE_AUTH.DATABASE,
  bindingName = MOVIELENS_CALL_BINDING_NAME,
) {
  const bindingId = deriveBindingId(tenantId, bindingName);
  const bindingVersionId = deriveBindingVersionId(bindingId);
  return deriveRequestServiceDefinitionId(bindingVersionId);
}

const MOVIELENS_CALL_SERVICE_ID = deriveMovielensCallServiceId();

function adminHttpUrlFromTarget(target, routePath) {
  const parsed = new URL(target);
  const protocol = parsed.protocol === 'wss:' ? 'https:' : 'http:';
  return `${protocol}//${parsed.host}${routePath}`;
}

async function scalePostgresWireListener({
  target,
  replicaCount,
  fetchImpl = fetch,
  sleep = defaultSleep,
  timeoutMs = LISTENER_READY_TIMEOUT_MS,
}) {
  const url = adminHttpUrlFromTarget(
    target,
    ADMIN_OWNER_OPERATION_PATH.postgresWireScale,
  );
  const body = JSON.stringify({
    replicaCount,
    runtimeConfig: {
      [PGWIRE_CONFIG_FIELD.HOST]: BIND_ALL_HOST,
      [PGWIRE_CONFIG_FIELD.AUTH_MODE]: PGWIRE_AUTH_MODE.PASSWORD,
      [PGWIRE_CONFIG_FIELD.TLS_MODE]: PGWIRE_TLS_MODE.DISABLE,
    },
  });
  const deadline = Date.now() + timeoutMs;
  let lastError = 'scale endpoint did not respond';
  while (Date.now() < deadline) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
    try {
      const response = await fetchImpl(url, {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body,
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => ({}));
      if (
        response.ok &&
        payload?.outcome === ADMIN_OWNER_OPERATION_OUTCOME.APPLIED &&
        payload?.scaleState ===
          POSTGRES_WIRE_SCALE_STATE.DESIRED_STATE_PERSISTED
      ) {
        return payload;
      }
      if (payload?.outcome === ADMIN_OWNER_OPERATION_OUTCOME.REFUSED) {
        throw new Error(
          payload?.error || 'sys-postgres-wire scale refused by owner',
        );
      }
      lastError = payload?.error || `HTTP ${response.status}`;
    } catch (error) {
      if (String(error?.message || '').includes('refused by owner')) {
        throw error;
      }
      lastError = error?.message || String(error);
    } finally {
      clearTimeout(timer);
    }
    await sleep(LISTENER_POLL_MS);
  }
  throw new Error(
    `Timed out scaling sys-postgres-wire after ${timeoutMs}ms: ${lastError}`,
  );
}

function normalizeConnectHost(rawHost, fallbackHost = LOOPBACK_HOST) {
  const trimmed = String(rawHost || '').trim();
  if (!trimmed || trimmed === BIND_ALL_HOST || trimmed === WILDCARD_IPV6_HOST) {
    return fallbackHost;
  }
  const hostOnly = trimmed.includes(':') ? trimmed.split(':')[0] : trimmed;
  if (!hostOnly || hostOnly === BIND_ALL_HOST) {
    return fallbackHost;
  }
  return hostOnly === 'localhost' ? LOOPBACK_HOST : hostOnly;
}

async function discoverCandidateEndpoints(queryRows, target) {
  const fallbackHost = new URL(target).hostname || LOOPBACK_HOST;
  const [endpointRows, nodeRows] = await Promise.all([
    queryRows(SELECT_PUBLIC_ENDPOINTS_SQL, target),
    queryRows(SELECT_NODES_ADDRESS_SQL, target),
  ]);
  const nodeHostById = new Map();
  for (const row of nodeRows || []) {
    if (row?.node_id) {
      nodeHostById.set(
        row.node_id,
        normalizeConnectHost(row.address, fallbackHost),
      );
    }
  }
  const candidates = [];
  for (const row of endpointRows || []) {
    const port = Number(row?.[EP_COL.PORT]);
    const nodeId = row?.[EP_COL.NODE_ID];
    if (
      typeof nodeId !== 'string' ||
      !Number.isInteger(port) ||
      port <= 0 ||
      row?.[EP_COL.HEALTH_STATUS] !== WASM_SERVICE_HEALTH_STATUS.HEALTHY
    ) {
      continue;
    }
    const host = normalizeConnectHost(
      row?.[EP_COL.ADDRESS],
      nodeHostById.get(nodeId) || fallbackHost,
    );
    candidates.push({nodeId, host, port});
  }
  return candidates;
}

async function openPgClient({host, port}) {
  const client = new Client({
    connectionTimeoutMillis: PG_CONNECT_TIMEOUT_MS,
    database: DEMO_PGWIRE_AUTH.DATABASE,
    host,
    password: DEMO_PGWIRE_AUTH.PASSWORD,
    port,
    user: DEMO_PGWIRE_AUTH.USER,
  });
  await client.connect();
  return client;
}

function isRetryableLifecycleInstallError(error) {
  const message = String(error?.message || '');
  return (
    error?.deferred === true ||
    Number.isFinite(error?.retryAfterMs) ||
    message.includes(
      SERVICE_INSTALL_CATALOG_MESSAGE.GATEWAY_OPERATION_LOOKUP_FAILED,
    )
  );
}

async function executeLifecycleStatement(
  client,
  statement,
  parameters,
  sleep = defaultSleep,
) {
  const retryableInstall = IDEMPOTENT_INSTALL_STATEMENT.test(statement);
  for (let attempt = 1; ; attempt += 1) {
    try {
      const result = await client.query(statement, parameters);
      return {rows: Array.isArray(result?.rows) ? result.rows : []};
    } catch (error) {
      if (
        !retryableInstall ||
        attempt >= INSTALL_MAX_ATTEMPTS ||
        !isRetryableLifecycleInstallError(error)
      ) {
        throw error;
      }
      await sleep(INSTALL_RETRY_DELAY_MS);
    }
  }
}

async function openFirstReachablePgSession({
  queryRows,
  target,
  openClient = openPgClient,
  sleep = defaultSleep,
  timeoutMs = LISTENER_READY_TIMEOUT_MS,
}) {
  const deadline = Date.now() + timeoutMs;
  let lastError = 'no healthy sys-postgres-wire endpoint row';
  while (Date.now() < deadline) {
    let candidates = [];
    try {
      candidates = await discoverCandidateEndpoints(queryRows, target);
    } catch (error) {
      lastError = error?.message || String(error);
    }
    for (const candidate of candidates) {
      try {
        const client = await openClient(candidate);
        return {
          client,
          nodeId: candidate.nodeId,
          host: candidate.host,
          port: candidate.port,
          execute: (statement, parameters) =>
            executeLifecycleStatement(client, statement, parameters, sleep),
          close: () => client.end(),
        };
      } catch (error) {
        lastError = `${candidate.host}:${candidate.port}: ${error?.message}`;
      }
    }
    await sleep(LISTENER_POLL_MS);
  }
  throw new Error(
    'No reachable authenticated sys-postgres-wire listener within ' +
    `${timeoutMs}ms: ${lastError}`,
  );
}

async function prepareMovieLensServiceProject(artifactsBaseDir) {
  const artifactsRoot = path.resolve(
    REPO_ROOT,
    artifactsBaseDir || DEFAULT_ARTIFACTS_RELATIVE_PATH,
  );
  const scenarioDirectory = path.join(artifactsRoot, SCENARIO_SUBDIR);
  const projectDirectory = path.join(scenarioDirectory, PROJECT_SUBDIR);
  await rm(scenarioDirectory, {force: true, recursive: true});
  await mkdir(projectDirectory, {recursive: true});
  const sourceLink = path.join(artifactsRoot, SOURCE_SYMLINK_NAME);
  await rm(sourceLink, {force: true});
  await symlink(
    path.relative(artifactsRoot, path.join(REPO_ROOT, SOURCE_SYMLINK_NAME)),
    sourceLink,
  );
  await copyFile(
    path.join(EXAMPLE_DIR, SERVICE_MODULE_FILE),
    path.join(projectDirectory, SERVICE_MODULE_FILE),
  );
  return {artifactsRoot, projectDirectory};
}

function createMovieLensServicePipeline() {
  return {
    runBuild: (options) =>
      runBuild({
        ...options,
        createLocalOciLayoutBuilder: () => new ServiceLocalOciLayoutBuilder(),
      }),
    runDeploy,
    runGenerate,
  };
}

async function deployMovieLensCallBinding({
  target,
  queryRows,
  replicaCount,
  artifactsBaseDir,
  pipeline = createMovieLensServicePipeline(),
  openSession = openFirstReachablePgSession,
  scaleListener = scalePostgresWireListener,
  sleep = defaultSleep,
}) {
  await scaleListener({target, replicaCount, sleep});
  const {projectDirectory} = await prepareMovieLensServiceProject(
    artifactsBaseDir,
  );
  const writeOutput = async () => {};
  await pipeline.runGenerate({projectDirectory, writeOutput});
  await pipeline.runBuild({projectDirectory, writeOutput});
  const session = await openSession({queryRows, target, sleep});
  try {
    const deployed = await pipeline.runDeploy({
      createSqlClient: () => session,
      idempotencyKey: IDEMPOTENCY_KEY,
      projectDirectory,
      writeOutput,
    });
    return {
      bindingName: MOVIELENS_CALL_BINDING_NAME,
      packageId: deployed.packageId,
      serviceId: MOVIELENS_CALL_SERVICE_ID,
    };
  } finally {
    await session.close();
  }
}

async function invokeMovieLensCallBinding({
  target,
  queryRows,
  bindingName = MOVIELENS_CALL_BINDING_NAME,
  openSession = openFirstReachablePgSession,
  sleep = defaultSleep,
}) {
  const session = await openSession({queryRows, target, sleep});
  try {
    const payload = JSON.stringify({
      arguments: {},
      name: bindingName,
      schema_version: CALL_BINDING_SCHEMA_VERSION,
    });
    const response = await session.client.query(CALL_BINDING_SQL, [payload]);
    const resultText = response?.rows?.[0]?.result;
    const parsed = typeof resultText === 'string' ?
      JSON.parse(resultText) :
      [];
    return Array.isArray(parsed) ? parsed : [];
  } finally {
    await session.close();
  }
}

export {
  CALL_BINDING_SCHEMA_VERSION,
  CALL_BINDING_SQL,
  DEMO_PGWIRE_AUTH,
  MOVIELENS_CALL_BINDING_NAME,
  MOVIELENS_CALL_SERVICE_ID,
  createMovieLensServicePipeline,
  deployMovieLensCallBinding,
  deriveMovielensCallServiceId,
  discoverCandidateEndpoints,
  invokeMovieLensCallBinding,
  openFirstReachablePgSession,
  prepareMovieLensServiceProject,
  scalePostgresWireListener,
};
