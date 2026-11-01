// The Scenario A semantic proof journey for a deployed PG-wire arm (Lagrange
// public PG wire, PostgreSQL): every canonical proof case of
// oltp-scenario-a-proof-cases.js runs through the one shared proof body per
// case, against the endpoint the campaign runner deployed, and the result is
// one semantic-gate record per system bound to that deployment
// (campaignId, containerId, imageId, endpoint). A case that fails is recorded
// as failed, a case that cannot run leaves its proof ids missing, and a
// system without proof records is `incomplete`, never null. TiDB keeps its
// own proof scripts.
import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';

import {
  OLTP_SCENARIO_A_PROOF_CASES,
} from '../harness/oltp-scenario-a-proof-cases.js';
import {
  OLTP_SCENARIO_A_SYSTEM,
} from '../harness/oltp-scenario-a-comparison-systems.js';
import {
  buildScenarioASemanticGateEvidence,
} from '../harness/oltp-scenario-a-semantic-gate.js';
import {
  createLagrangeOltpAdapter,
} from '../reference-client/lagrange-oltp-adapter.js';
import {
  createPostgreSqlOltpAdapter,
} from '../reference-client/postgresql-oltp-adapter.js';
import {executeProof as executeDeliveryProof} from './scenario-a-delivery-lagrange.js';
import {executeProof as executeDurabilityProof} from './scenario-a-durability-lagrange.js';
import {
  executeProof as executeFailureAtomicityProof,
} from './scenario-a-failure-atomicity-lagrange.js';
import {
  PGWIRE_PROOF_SYSTEMS,
  buildProofEvidence,
} from './scenario-a-lagrange-shared.js';
import {
  executeProof as executeNewOrderContentionProof,
} from './scenario-a-new-order-contention-lagrange.js';
import {executeProof as executeOrderStatusProof} from './scenario-a-order-status-lagrange.js';
import {executeProof as executePaymentProof} from './scenario-a-payment-lagrange.js';
import {
  executeProof as executeRetryableConflictProof,
} from './scenario-a-retryable-conflict-lagrange.js';
import {executeProof as executeStockLevelProof} from './scenario-a-stock-level-lagrange.js';
import {executeProof as executeVisibilityProof} from './scenario-a-visibility-lagrange.js';

const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayMap = Function.call.bind(Array.prototype.map);

const DURABILITY_CASE_ID = 'durability';
const BINDING_FIELDS = Object.freeze(['campaignId', 'containerId', 'imageId', 'endpoint']);
const ENDPOINT_PATTERN = /^[^\s:]+:\d+$/u;

const GATE_STATUS = Object.freeze({
  PASSED: 'passed',
  FAILED: 'failed',
  INCOMPLETE: 'incomplete',
});

const CASE_STATUS = Object.freeze({
  PASSED: 'passed',
  FAILED: 'failed',
  ERRORED: 'errored',
  NOT_EXECUTED: 'not-executed',
});

const NOT_EXECUTED_REASON = Object.freeze({
  NO_RESTART_CAPABILITY: 'caller-supplied-no-restart-capability',
});

const CASE_EXECUTORS = Object.freeze({
  'new-order-contention': executeNewOrderContentionProof,
  'visibility': executeVisibilityProof,
  'payment': executePaymentProof,
  'order-status': executeOrderStatusProof,
  'delivery': executeDeliveryProof,
  'stock-level': executeStockLevelProof,
  'failure-atomicity': executeFailureAtomicityProof,
  'retryable-conflict': executeRetryableConflictProof,
  [DURABILITY_CASE_ID]: executeDurabilityProof,
});

for (const proofCase of OLTP_SCENARIO_A_PROOF_CASES) {
  if (typeof CASE_EXECUTORS[proofCase.id] !== 'function') {
    throw new Error(`Scenario A proof journey has no executor for case ${proofCase.id}`);
  }
}

const ADAPTER_BY_SYSTEM = Object.freeze({
  [OLTP_SCENARIO_A_SYSTEM.LAGRANGE]: createLagrangeOltpAdapter,
  [OLTP_SCENARIO_A_SYSTEM.POSTGRESQL]: createPostgreSqlOltpAdapter,
});

function requireBinding(binding) {
  if (!binding || typeof binding !== 'object') {
    throw new Error('Scenario A proof journey requires the deployment binding');
  }
  for (const field of BINDING_FIELDS) {
    if (typeof binding[field] !== 'string' || binding[field] === '') {
      throw new Error(`Scenario A proof journey binding requires ${field}`);
    }
  }
  if (!ENDPOINT_PATTERN.test(binding.endpoint)) {
    throw new Error('Scenario A proof journey binding.endpoint must be host:port');
  }
  return Object.freeze(Object.fromEntries(arrayMap(BINDING_FIELDS,
    (field) => [field, binding[field]])));
}

function requireConnection(connection) {
  const endpoint = connection?.endpoint;
  if (typeof endpoint?.host !== 'string' || !Number.isInteger(endpoint?.port)) {
    throw new Error('Scenario A proof journey requires connection.endpoint {host, port}');
  }
  if (!connection.credentials || typeof connection.credentials !== 'object') {
    throw new Error('Scenario A proof journey requires connection.credentials');
  }
  return connection;
}

async function closeQuietly(adapter, caseResult) {
  if (!adapter) return;
  try {
    await adapter.close({dropTables: false});
  } catch (error) {
    caseResult.cleanupError = String(error?.message || error);
  }
}

async function persistEvidence(evidenceDir, system, caseId, evidence) {
  if (!evidenceDir) return null;
  await mkdir(evidenceDir, {recursive: true});
  const outputPath = path.join(evidenceDir, `scenario-a-${caseId}-${system}.json`);
  await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  return outputPath;
}

async function runCase(proofCase, context, options, journey) {
  const result = {caseId: proofCase.id, proofIds: proofCase.proofIds};
  if (proofCase.id === DURABILITY_CASE_ID && !options.restartCluster) {
    return {...result, status: CASE_STATUS.NOT_EXECUTED,
      reason: NOT_EXECUTED_REASON.NO_RESTART_CAPABILITY};
  }
  let adapter = null;
  try {
    if (journey.beforeCase) await journey.beforeCase({caseId: proofCase.id, context});
    const outcome = await CASE_EXECUTORS[proofCase.id]({context, options, cluster: null});
    adapter = outcome.adapter;
    const evidence = buildProofEvidence(outcome);
    result.status = outcome.evaluation.passed ? CASE_STATUS.PASSED : CASE_STATUS.FAILED;
    result.proofRecord = evidence.proofRecord;
    result.evidencePath = await persistEvidence(journey.evidenceDir, context.system,
      proofCase.id, evidence);
  } catch (error) {
    result.status = CASE_STATUS.ERRORED;
    result.error = String(error?.message || error);
  }
  await closeQuietly(adapter, result);
  return Object.freeze(result);
}

function gateStatusOf(summary) {
  if (summary.failedProofIds.length > 0) return GATE_STATUS.FAILED;
  if (summary.missingProofIds.length > 0) return GATE_STATUS.INCOMPLETE;
  return GATE_STATUS.PASSED;
}

/**
 * Run every Scenario A proof case against one deployed PG-wire arm.
 *
 * @param {object} request
 * @param {string} request.system 'lagrange' | 'postgresql'
 * @param {object} request.connection {endpoint: {host, port}, credentials}
 * @param {object} request.binding {campaignId, containerId, imageId,
 *   endpoint: 'host:port'} of the running container the proofs ran against
 * @param {string} [request.evidenceDir] retains every case's evidence
 * @param {Function} [request.restartProduct] ({context}) => fault evidence;
 *   without it the durability case is not executed (its proofs stay missing)
 * @param {Function} [request.beforeCase] ({caseId, context}) dataset reset
 *   hook (Lagrange cannot DROP TABLE in place)
 * @return {Promise<object>} the semantic-gate record of the system
 */
async function runScenarioASemanticProofJourney(request = {}) {
  if (!PGWIRE_PROOF_SYSTEMS.has(request.system)) {
    throw new Error(`Scenario A PG-wire proof journey does not run ${request.system}`);
  }
  const binding = requireBinding(request.binding);
  const connection = requireConnection(request.connection);
  const context = Object.freeze({
    system: request.system,
    endpoint: connection.endpoint,
    connection: connection.credentials,
    binding,
    serviceEndpoint: null,
    admission: null,
    runtimePreflight: null,
  });
  const options = Object.freeze({
    createAdapter: ADAPTER_BY_SYSTEM[request.system],
    prepareContext: async () => context,
    ...(request.restartProduct ?
      {restartCluster: ({context: current}) => request.restartProduct({context: current})} :
      {}),
  });
  const cases = [];
  for (const proofCase of OLTP_SCENARIO_A_PROOF_CASES) {
    cases.push(await runCase(proofCase, context, options, request));
  }
  const proofs = arrayMap(arrayFilter(cases, (entry) => entry.proofRecord),
    (entry) => entry.proofRecord);
  const gate = buildScenarioASemanticGateEvidence({systems: [request.system], proofs});
  const summary = gate.systems[request.system];
  return Object.freeze({
    system: request.system,
    status: gateStatusOf(summary),
    passed: summary.passedProofIds,
    failed: summary.failedProofIds,
    missing: summary.missingProofIds,
    binding,
    semanticProfileId: gate.semanticProfileId,
    semanticProfileSha256: gate.semanticProfileSha256,
    semanticGateEvidenceSha256: gate.semanticGateEvidenceSha256,
    cases: Object.freeze(cases),
  });
}

export {
  CASE_STATUS as SCENARIO_A_PROOF_CASE_STATUS,
  GATE_STATUS as SCENARIO_A_SEMANTIC_GATE_STATUS,
  runScenarioASemanticProofJourney,
};
