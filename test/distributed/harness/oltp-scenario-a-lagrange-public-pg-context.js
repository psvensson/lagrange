import {
  CONVERGENCE_DEFAULTS,
  REQUEST_CELL_AUTH,
  SCENARIO_TIMING_DEFAULTS,
  TIMEOUTS,
} from './constants.js';
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

function requireOptions(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Lagrange Scenario A public PG context requires options');
  }
  const unknown = Object.keys(value).filter(
    (key) => !ALLOWED_OPTION_KEYS.includes(key),
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
  const escaped = String(value).replace(/'/gu, String.fromCharCode(39, 39));
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

function waitForBenchmarkDataConvergence(cluster, targetVoterCount) {
  return cluster.waitForConvergence({
    targetVoterCount,
    settleTimeoutMs: TIMEOUTS.SCENARIO_DEFAULT,
    quietWindowMs: CONVERGENCE_DEFAULTS.quietWindowMs,
  });
}

async function configurePublicPgWire(seedNode, executionContract) {
  if (!seedNode || typeof seedNode.query !== 'function') {
    throw new Error('Lagrange Scenario A public PG context requires queryable seed node');
  }
  const runtimeConfig = JSON.stringify(PG_RUNTIME_CONFIG);
  await seedNode.query(
    'UPDATE service_definitions SET runtime_config = ' +
      sqlLiteral(runtimeConfig) +
      ' WHERE service_id = ' + sqlLiteral(executionContract.serviceId),
  );
  await seedNode.query(
    'UPDATE service_definitions SET replica_count = ' +
      POSTGRES_SERVICE_REPLICA_COUNT +
      ' WHERE service_id = ' + sqlLiteral(executionContract.serviceId),
  );
}

function resolveHealthyPublicPgEndpoint(rows, nodes, executionContract) {
  const row = rows.find((candidate) => {
    const port = Number(candidate?.port);
    return candidate?.service_id === executionContract.serviceId &&
      candidate?.protocol === executionContract.protocol &&
      candidate?.health_status === HEALTHY &&
      Number.isInteger(port) &&
      port > ZERO;
  });
  if (!row) return null;
  const nodeId = String(row.node_id || '');
  const node = nodes.find((candidate) => candidate.id === nodeId);
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
  const targetVoterCount = nodes.length;
  const seedNode = nodes.find((node) => node.role === 'seed') || nodes[ZERO];

  await waitForBenchmarkDataConvergence(cluster, targetVoterCount);
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
    waitForDataConvergence: () =>
      waitForBenchmarkDataConvergence(cluster, targetVoterCount),
  });
}

export {
  prepareLagrangeScenarioAPublicPgContext,
  resolveHealthyPublicPgEndpoint,
};
