import {createHash} from 'node:crypto';
import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';

import {CONVERGENCE_DEFAULTS, REQUEST_CELL_AUTH} from '../harness/constants.js';
import {
  executePairedOltpTransactionWithRetry,
} from '../harness/oltp-paired-retry-owner.js';
import {
  OLTP_SCENARIO_A_NEW_ORDER_CONTENTION_OPERATIONS,
  OLTP_SCENARIO_A_NEW_ORDER_CONTENTION_PROOF_IDS,
  OLTP_SCENARIO_A_NEW_ORDER_CONTENTION_WORKLOAD,
  buildScenarioANewOrderContentionCase,
  evaluateScenarioANewOrderContentionObservation,
} from '../harness/oltp-scenario-a-new-order-contention-case.js';
import {
  OLTP_SCENARIO_A_SYSTEM,
} from '../harness/oltp-scenario-a-comparison-systems.js';
import {
  OLTP_SCENARIO_A_SEMANTIC_PROOF_STATUS,
} from '../harness/oltp-scenario-a-semantic-gate.js';
import {
  createLagrangeOltpAdapter,
} from '../reference-client/lagrange-oltp-adapter.js';
import {
  observeLagrangeNewOrderContentionState,
} from '../reference-client/lagrange-new-order-contention-observer.js';

const ZERO = 0;
const ONE = 1;
const POSTGRES_SERVICE_ID = 'sys-postgres-wire';
const POSTGRES_PROTOCOL = 'postgresql';
const HEALTHY = 'healthy';
const ENDPOINT_TIMEOUT_MS = 120000;
const ENDPOINT_POLL_MS = 500;
const OUTPUT_PATH =
  process.env.LAGRANGE_SCENARIO_A_CONTENTION_EVIDENCE_PATH ||
  'test-output/tidb-reference/scenario-a-new-order-contention-lagrange.json';
const PG_RUNTIME_CONFIG = Object.freeze({
  host: '0.0.0.0',
  authMode: 'password',
  tlsMode: 'disable',
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sqlLiteral(value) {
  return `'${String(value).replace(/'/gu, "''")}'`;
}

function rowsOf(result) {
  return Array.isArray(result?.rows) ? result.rows : [];
}

async function configurePublicPgWire(seedNode) {
  const runtimeConfig = JSON.stringify(PG_RUNTIME_CONFIG);
  await seedNode.query(
    'UPDATE service_definitions SET runtime_config = ' +
      sqlLiteral(runtimeConfig) +
      ' WHERE service_id = ' + sqlLiteral(POSTGRES_SERVICE_ID),
  );
  await seedNode.query(
    'UPDATE service_definitions SET replica_count = 1 WHERE service_id = ' +
      sqlLiteral(POSTGRES_SERVICE_ID),
  );
}

async function discoverPublicPgWireEndpoint(cluster, seedNode) {
  const deadline = Date.now() + ENDPOINT_TIMEOUT_MS;
  const sql =
    'SELECT service_id, node_id, protocol, address, port, health_status ' +
    'FROM service_endpoints WHERE service_id = ' +
    sqlLiteral(POSTGRES_SERVICE_ID);
  while (Date.now() < deadline) {
    const result = await seedNode.query(sql);
    const row = rowsOf(result).find((candidate) =>
      candidate?.protocol === POSTGRES_PROTOCOL &&
      candidate?.health_status === HEALTHY &&
      Number.isInteger(candidate?.port));
    if (row) {
      const nodeId = String(row.node_id || '');
      const node = cluster.getNodes().find((candidate) => candidate.id === nodeId);
      if (node?.ip) {
        return Object.freeze({
          endpoint: Object.freeze({host: node.ip, port: Number(row.port)}),
          serviceEndpoint: Object.freeze({
            nodeId,
            protocol: row.protocol,
            advertisedAddress: row.address || null,
            port: Number(row.port),
            healthStatus: row.health_status,
          }),
        });
      }
    }
    await sleep(ENDPOINT_POLL_MS);
  }
  throw new Error('Timed out waiting for healthy public PostgreSQL wire endpoint');
}

function connectionConfig() {
  return Object.freeze({
    user: REQUEST_CELL_AUTH.USER,
    password: REQUEST_CELL_AUTH.PASSWORD,
    database: REQUEST_CELL_AUTH.DATABASE,
    ssl: false,
  });
}

async function executeLogicalRequest(adapter, operation) {
  try {
    const outcome = await executePairedOltpTransactionWithRetry({
      executeAttempt: () => adapter.executeTransaction(operation),
    });
    return Object.freeze({
      status: 'committed',
      workerId: operation.workerId,
      result: outcome.result,
      retryEvidence: outcome.evidence,
      error: null,
    });
  } catch (error) {
    return Object.freeze({
      status: 'failed',
      workerId: operation.workerId,
      result: null,
      retryEvidence: error?.oltpRetryEvidence || null,
      error: Object.freeze({
        name: String(error?.name || 'Error'),
        message: String(error?.message || error),
        sqlState: typeof error?.sqlState === 'string' ? error.sqlState : null,
      }),
    });
  }
}

function itemIds() {
  return OLTP_SCENARIO_A_NEW_ORDER_CONTENTION_OPERATIONS
    .flatMap((operation) => operation.lines.map(({itemId}) => itemId));
}

function payloadDigest(payload) {
  return createHash('sha256')
    .update(JSON.stringify(payload))
    .digest('hex');
}

async function run(cluster) {
  const nodes = cluster.getNodes();
  const seedNode = nodes.find((node) => node.role === 'seed') || nodes[ZERO];
  if (!seedNode) throw new Error('Lagrange contention proof requires seed node');

  await cluster.waitForConvergence({
    targetVoterCount: nodes.length,
    settleTimeoutMs: 120000,
    quietWindowMs: CONVERGENCE_DEFAULTS.quietWindowMs,
  });
  await configurePublicPgWire(seedNode);
  const discovered = await discoverPublicPgWireEndpoint(cluster, seedNode);
  const connection = connectionConfig();
  const definition = buildScenarioANewOrderContentionCase();
  let adapter = null;
  let evidence = null;
  try {
    adapter = await createLagrangeOltpAdapter({
      endpoint: discovered.endpoint,
      connection,
      workload: OLTP_SCENARIO_A_NEW_ORDER_CONTENTION_WORKLOAD,
    });
    if (adapter.datasetSha256 !== definition.identity.datasetSha256) {
      throw new Error('Lagrange contention proof dataset identity mismatch');
    }

    await cluster.waitForConvergence({
      targetVoterCount: nodes.length,
      settleTimeoutMs: 120000,
      quietWindowMs: CONVERGENCE_DEFAULTS.quietWindowMs,
    });

    const logicalResults = await Promise.all(
      OLTP_SCENARIO_A_NEW_ORDER_CONTENTION_OPERATIONS.map((operation) =>
        executeLogicalRequest(adapter, operation)),
    );
    const observedState = await observeLagrangeNewOrderContentionState({
      endpoint: discovered.endpoint,
      connection,
      itemIds: itemIds(),
    });
    const logicalCommitted = logicalResults.filter(
      ({status}) => status === 'committed',
    ).length;
    const evaluation = evaluateScenarioANewOrderContentionObservation({
      logicalCommitted,
      ...observedState,
    });
    const payload = Object.freeze({
      schemaVersion: 1,
      evidenceId: 'lagrange-new-order-contention-v1',
      system: OLTP_SCENARIO_A_SYSTEM.LAGRANGE,
      caseId: definition.identity.caseId,
      caseSha256: definition.caseSha256,
      datasetSha256: definition.identity.datasetSha256,
      executionPath: adapter.executionPath,
      protocol: adapter.protocol,
      lockingReadMode: adapter.lockingReadMode,
      serviceEndpoint: discovered.serviceEndpoint,
      logicalResults,
      observation: Object.freeze({logicalCommitted, ...observedState}),
      evaluation,
      comparable: false,
      nonComparableReason:
        'Partial Scenario A semantic proof only; full semantic and paired gates remain incomplete.',
    });
    const artifactSha256 = payloadDigest(payload);
    evidence = Object.freeze({
      ...payload,
      proofRecord: Object.freeze({
        evidenceId: payload.evidenceId,
        system: payload.system,
        status: evaluation.passed ?
          OLTP_SCENARIO_A_SEMANTIC_PROOF_STATUS.PASSED :
          OLTP_SCENARIO_A_SEMANTIC_PROOF_STATUS.FAILED,
        artifactSha256,
        proofIds: OLTP_SCENARIO_A_NEW_ORDER_CONTENTION_PROOF_IDS,
      }),
      artifactSha256,
    });
    await mkdir(path.dirname(OUTPUT_PATH), {recursive: true});
    await writeFile(OUTPUT_PATH, JSON.stringify(evidence, null, 2) + '\n', 'utf8');
    if (!evaluation.passed) {
      throw new Error(
        'Lagrange new-order contention semantic proof failed: ' +
        evaluation.failures.join(','),
      );
    }
    return {
      status: 'passed',
      artifactSha256,
      retries: logicalResults.reduce(
        (sum, result) => sum + Number(result.retryEvidence?.retries || ZERO),
        ZERO,
      ),
      orderIds: observedState.orderIds,
      endpoint: discovered.serviceEndpoint,
      proofIds: evaluation.proofIds,
    };
  } finally {
    if (adapter) await adapter.close({dropTables: false});
  }
}

export {run};
