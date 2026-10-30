import {
  CONVERGENCE_DEFAULTS,
  PORTS,
  REQUEST_CELL_AUTH,
  SCENARIO_TIMING_DEFAULTS,
  TIMEOUTS,
} from './constants.js';
import {
  requestPostgresWireScale,
} from './cluster-node-owner-operations.js';
import {
  verifyLagrangeScenarioALiveAdmission,
} from './oltp-scenario-a-lagrange-live-admission.js';
import {
  buildLagrangeScenarioARuntimePreflight,
} from './oltp-scenario-a-lagrange-runtime-preflight.js';

const ZERO = 0;
const ONE = 1;
const HEALTHY = 'healthy';
const POSTGRES_SERVICE_REPLICA_COUNT = 1;
const PG_RUNTIME_CONFIG = Object.freeze({
  host: '0.0.0.0',
  authMode: 'password',
  tlsMode: 'disable',
});
const ALLOWED_OPTION_KEYS = Object.freeze(['admission', 'cluster']);

const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayFind = Function.call.bind(Array.prototype.find);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const stringReplace = Function.call.bind(String.prototype.replace);

function requireOptions(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Lagrange Scenario A public PG context requires options');
  }
  const unknown = arrayFilter(
    Object.keys(value),
    (key) => !arrayIncludes(ALLOWED_OPTION_KEYS, key),
  );
  if (unknown.length > ZERO) {
    throw new Error(
      `unsupported Lagrange Scenario A public PG context option ${unknown.sort()[ZERO]}`,
    );
  }
  return value;
}

function requireCluster(value) {
  if (!value || typeof value !== 'object') {
    throw new Error('Lagrange Scenario A public PG context requires cluster');
  }
  if (typeof value.getNodes !== 'function' ||
      typeof value.waitForConvergence !== 'function') {
    throw new Error('Lagrange Scenario A public PG context requires cluster lifecycle');
  }
  return value;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sqlLiteral(value) {
  const escaped = stringReplace(String(value), /'/gu, String.fromCharCode(39, 39));
  return `'${escaped}'`;
}

function rowsOf(result) {
  return Array.isArray(result?.rows) ? result.rows : [];
}

function buildConnectionConfig() {
  return Object.freeze({
    user: REQUEST_CELL_AUTH.USER,
    password: REQUEST_CELL_AUTH.PASSWORD,
    database: REQUEST_CELL_AUTH.DATABASE,
    ssl: false,
  });
}

async function dispatchPostgresWireScale(seedNode, desiredState) {
  if (typeof seedNode.scalePostgresWireListener === 'function') {
    return seedNode.scalePostgresWireListener(desiredState);
  }
  const adminApiPort = seedNode.adminApiPort ?? seedNode._adminApiPort ?? PORTS.ADMIN_API;
  return requestPostgresWireScale({
    ip: seedNode.ip,
    adminApiPort,
  }, desiredState);
}

function isPostgresWireScaleValid(result) {
  if (result?.success !== true || result?.outcome !== 'applied') {
    return false;
  }
  return result?.scaleState === undefined || result?.scaleState === 'desired_state_persisted';
}

function formatPostgresWireScaleFailure(result) {
  if (result?.error) return result.error;
  if (result?.errorCode) return result.errorCode;
  if (result?.outcome) return result.outcome;
  if (result?.scaleState) return `unexpected scaleState ${result.scaleState}`;
  return 'unconfirmed';
}

async function configurePublicPgWire(seedNode, _executionContract) {
  if (!seedNode) {
    throw new Error('Lagrange Scenario A public PG context requires seed node');
  }
  const desiredState = {
    replicaCount: POSTGRES_SERVICE_REPLICA_COUNT,
    runtimeConfig: PG_RUNTIME_CONFIG,
  };
  const result = await dispatchPostgresWireScale(seedNode, desiredState);
  if (!isPostgresWireScaleValid(result)) {
    const reason = formatPostgresWireScaleFailure(result);
    throw new Error(`Lagrange Scenario A public PG wire scale failed: ${reason}`);
  }
}

function resolveHealthyPublicPgEndpoint(rows, nodes, executionContract) {
  const row = arrayFind(rows, (candidate) => {
    const port = Number(candidate?.port);
    return candidate?.service_id === executionContract.serviceId &&
      candidate?.protocol === executionContract.protocol &&
      candidate?.health_status === HEALTHY &&
      Number.isInteger(port) &&
      port > ZERO;
  });
  if (!row) return null;
  const nodeId = String(row.node_id || '');
  const node = arrayFind(nodes, (candidate) => candidate.id === nodeId);
  if (!node?.ip) return null;
  return Object.freeze({
    endpoint: Object.freeze({host: node.ip, port: Number(row.port)}),
    serviceEndpoint: Object.freeze({
      serviceId: row.service_id,
      nodeId,
      protocol: row.protocol,
      advertisedAddress: row.address || null,
      port: Number(row.port),
      healthStatus: row.health_status,
    }),
  });
}

async function discoverPublicPgWireEndpoint(cluster, seedNode, executionContract) {
  const deadline = Date.now() + TIMEOUTS.SCENARIO_DEFAULT;
  const sql =
    'SELECT service_id, node_id, protocol, address, port, health_status ' +
    'FROM service_endpoints WHERE service_id = ' +
    sqlLiteral(executionContract.serviceId);
  while (Date.now() < deadline) {
    const resolved = resolveHealthyPublicPgEndpoint(
      rowsOf(await seedNode.query(sql)),
      cluster.getNodes(),
      executionContract,
    );
    if (resolved) return resolved;
    await sleep(SCENARIO_TIMING_DEFAULTS.pollIntervalMs);
  }
  throw new Error('Timed out waiting for healthy public PostgreSQL wire endpoint');
}

async function prepareLagrangeScenarioAPublicPgContext(value) {
  const options = requireOptions(value);
  const cluster = requireCluster(options.cluster);
  const admission = verifyLagrangeScenarioALiveAdmission(options.admission);
  const runtimePreflight = await buildLagrangeScenarioARuntimePreflight(admission);
  const executionContract = admission.publicExecutionContract;
  const nodes = cluster.getNodes();
  if (!Array.isArray(nodes) || nodes.length < ONE) {
    throw new Error('Lagrange Scenario A public PG context requires cluster nodes');
  }
  const seedNode = arrayFind(nodes, (node) => node.role === 'seed') || nodes[ZERO];

  await cluster.waitForConvergence({
    targetVoterCount: nodes.length,
    settleTimeoutMs: TIMEOUTS.SCENARIO_DEFAULT,
    quietWindowMs: CONVERGENCE_DEFAULTS.quietWindowMs,
  });
  await configurePublicPgWire(seedNode, executionContract);
  const discovered = await discoverPublicPgWireEndpoint(
    cluster,
    seedNode,
    executionContract,
  );
  return Object.freeze({
    admission,
    runtimePreflight,
    publicExecutionContract: executionContract,
    connection: buildConnectionConfig(),
    endpoint: discovered.endpoint,
    serviceEndpoint: discovered.serviceEndpoint,
  });
}

export {
  prepareLagrangeScenarioAPublicPgContext,
  resolveHealthyPublicPgEndpoint,
};
