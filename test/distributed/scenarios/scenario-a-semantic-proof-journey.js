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
  PGWIRE_OLTP_EXECUTION_PATH,
  PGWIRE_OLTP_NATIVE_LOCKING_READ_MODE,
  PGWIRE_OLTP_PROTOCOL,
  PGWIRE_OLTP_SNAPSHOT_LOCKING_READ_MODE,
  createLagrangeOltpAdapter,
} from '../reference-client/lagrange-oltp-adapter.js';
import {
  createPostgreSqlOltpAdapter,
} from '../reference-client/postgresql-oltp-adapter.js';
import {
  OLTP_SCENARIO_A_DURABILITY_FAULT_EVIDENCE_CODES,
} from '../harness/oltp-scenario-a-durability-case.js';
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

const arrayEvery = Function.call.bind(Array.prototype.every);
const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayMap = Function.call.bind(Array.prototype.map);
const arraySome = Function.call.bind(Array.prototype.some);

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
  // The case ran against a deployment other than its binding names; its
  // proof record is withheld from the gate.
  REFUSED: 'refused',
});

// What a failed or unobtained case says (coordinator decision 4, 2026-11-02):
// the product violated the contract, the evidence the proof needs could not
// be obtained, or the probe does not apply to this deployment. Only a product
// anomaly fails the gate; the other two leave its proofs missing.
const FAILURE_KIND = Object.freeze({
  PRODUCT_ANOMALY: 'product_anomaly',
  EVIDENCE_INSUFFICIENT: 'evidence_insufficient',
  PROBE_INAPPLICABLE: 'probe_inapplicable',
});
const FAILURE_REASON = Object.freeze({
  CASE_ERRORED: 'case_errored',
  DURABILITY_REQUIRES_PERSISTENT_STORAGE: 'durability_requires_persistent_storage',
});
// Per case, the evaluator codes that speak about evidence, not the product.
const EVIDENCE_FAILURE_CODES = Object.freeze({
  [DURABILITY_CASE_ID]: OLTP_SCENARIO_A_DURABILITY_FAULT_EVIDENCE_CODES,
});

/**
 * Classify a case's evaluator failure codes: evidence-only codes say the
 * proof was not obtained; any other code is a product anomaly.
 * @param {string} caseId
 * @param {Array<string>} failures the evaluator's reason codes
 * @return {string} a FAILURE_KIND
 */
function classifyProofCaseFailure(caseId, failures) {
  const evidenceCodes = EVIDENCE_FAILURE_CODES[caseId] || [];
  const codes = Array.isArray(failures) ? failures : [];
  return codes.length > 0 && arrayEvery(codes, (code) => arrayIncludes(evidenceCodes, code)) ?
    FAILURE_KIND.EVIDENCE_INSUFFICIENT : FAILURE_KIND.PRODUCT_ANOMALY;
}

const REFUSAL_REASON = Object.freeze({
  BINDING_CHANGED_WITHOUT_REBIND: 'binding_changed_without_rebind',
});

const DEPLOYMENT_OBSERVATION = Object.freeze({NOT_OBSERVED: 'not-observed'});

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

const LOCKING_READ_MODE_BY_SYSTEM = Object.freeze({
  [OLTP_SCENARIO_A_SYSTEM.LAGRANGE]: PGWIRE_OLTP_SNAPSHOT_LOCKING_READ_MODE,
  [OLTP_SCENARIO_A_SYSTEM.POSTGRESQL]: PGWIRE_OLTP_NATIVE_LOCKING_READ_MODE,
});

const ADAPTER_BY_SYSTEM = Object.freeze({
  [OLTP_SCENARIO_A_SYSTEM.LAGRANGE]: createLagrangeOltpAdapter,
  [OLTP_SCENARIO_A_SYSTEM.POSTGRESQL]: createPostgreSqlOltpAdapter,
});

// The system's PG-wire adapter. A request that names its PG client factory
// (the native client the adapter opens every connection with) hands it to the
// adapter; without one the adapter opens the native pg client.
function adapterFactoryOf(request) {
  const createSystemAdapter = ADAPTER_BY_SYSTEM[request.system];
  if (!Object.hasOwn(request, 'createClient')) return createSystemAdapter;
  if (typeof request.createClient !== 'function') {
    throw new Error('Scenario A proof journey createClient must be a function');
  }
  return (adapterOptions) => createSystemAdapter({...adapterOptions,
    createClient: request.createClient});
}

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

function endpointLabel(endpoint) {
  return `${endpoint.host}:${endpoint.port}`;
}

function bindingMatches(binding, observed) {
  return observed.endpoint === binding.endpoint && observed.containerId === binding.containerId;
}

// The deployment a case runs against: the request's, until a beforeCase
// answers a rebind {connection, binding}; null keeps the current one.
async function rebindForCase(current, proofCase, journey) {
  if (!journey.beforeCase) return current;
  const answer = await journey.beforeCase({caseId: proofCase.id, context: current});
  if (answer === null) return current;
  if (!answer || typeof answer !== 'object' || !answer.connection || !answer.binding) {
    throw new Error('beforeCase must answer {connection, binding} or null');
  }
  return buildContext(current.system, answer.connection, answer.binding);
}

async function observedDeployment(journey, proofCase, context) {
  if (!journey.observeDeployment) return DEPLOYMENT_OBSERVATION.NOT_OBSERVED;
  const observed = await journey.observeDeployment({caseId: proofCase.id, context});
  return Object.freeze({containerId: observed.containerId, endpoint: observed.endpoint});
}

function refusal(result, extra) {
  return Object.freeze({...result, status: CASE_STATUS.REFUSED,
    reason: REFUSAL_REASON.BINDING_CHANGED_WITHOUT_REBIND, ...extra});
}

// A durability case that cannot run here: on container-layer storage it does
// not apply (by the contract: recorded as such, never run, never passed);
// without a restart capability it is not executed.
function durabilityPrecondition(proofCase, options, result) {
  if (proofCase.id !== DURABILITY_CASE_ID) return null;
  if (options.persistentStorage === false) {
    return {...result, status: CASE_STATUS.FAILED,
      failureKind: FAILURE_KIND.PROBE_INAPPLICABLE,
      failureReasons: [FAILURE_REASON.DURABILITY_REQUIRES_PERSISTENT_STORAGE]};
  }
  return options.restartCluster ? null : {...result, status: CASE_STATUS.NOT_EXECUTED,
    reason: NOT_EXECUTED_REASON.NO_RESTART_CAPABILITY};
}

function recordEvaluation(result, proofCase, evaluation) {
  result.status = evaluation.passed ? CASE_STATUS.PASSED : CASE_STATUS.FAILED;
  if (evaluation.passed) return;
  result.failureReasons = [...(evaluation.failures || [])];
  result.failureKind = classifyProofCaseFailure(proofCase.id, result.failureReasons);
}

async function runCase(proofCase, context, options, journey) {
  const result = {caseId: proofCase.id, proofIds: proofCase.proofIds,
    binding: context.binding};
  const precondition = durabilityPrecondition(proofCase, options, result);
  if (precondition) return precondition;
  if (endpointLabel(context.endpoint) !== context.binding.endpoint) {
    return refusal(result, {observedEndpoint: endpointLabel(context.endpoint)});
  }
  let adapter = null;
  try {
    const outcome = await CASE_EXECUTORS[proofCase.id]({context, options, cluster: null});
    adapter = outcome.adapter;
    const evidence = buildProofEvidence(outcome);
    const deployment = await observedDeployment(journey, proofCase, context);
    result.deploymentObservation = deployment;
    if (deployment !== DEPLOYMENT_OBSERVATION.NOT_OBSERVED &&
        !bindingMatches(context.binding, deployment)) {
      await closeQuietly(adapter, result);
      return refusal(result, {});
    }
    recordEvaluation(result, proofCase, outcome.evaluation);
    result.proofRecord = evidence.proofRecord;
    result.evidencePath = await persistEvidence(journey.evidenceDir, context.system,
      proofCase.id, evidence);
  } catch (error) {
    result.status = CASE_STATUS.ERRORED;
    result.error = String(error?.message || error);
    result.failureKind = FAILURE_KIND.EVIDENCE_INSUFFICIENT;
    result.failureReasons = [FAILURE_REASON.CASE_ERRORED];
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
 * @param {Function} [request.beforeCase] ({caseId, context}) => {connection,
 *   binding} | null: re-forms the arm before a case (Lagrange cannot DROP
 *   TABLE in place); a rebind is the context of that and every later case
 * @param {Function} [request.createClient] (clientOptions) => pg client: the
 *   PG client factory every adapter connection is opened with (the native pg
 *   Client when absent)
 * @param {Function} [request.observeDeployment] ({caseId, context}) =>
 *   {containerId, endpoint} observed after the case; a mismatch with the
 *   case binding refuses the case (binding_changed_without_rebind)
 * @return {Promise<object>} the semantic-gate record of the system
 */
function buildContext(system, rawConnection, rawBinding) {
  const binding = requireBinding(rawBinding);
  const connection = requireConnection(rawConnection);
  return Object.freeze({
    system,
    endpoint: connection.endpoint,
    connection: connection.credentials,
    binding,
    serviceEndpoint: null,
    admission: null,
    runtimePreflight: null,
    publicExecutionContract: Object.freeze({
      protocol: PGWIRE_OLTP_PROTOCOL,
      executionPath: PGWIRE_OLTP_EXECUTION_PATH,
      lockingReadMode: LOCKING_READ_MODE_BY_SYSTEM[system],
    }),
  });
}

async function runScenarioASemanticProofJourney(request = {}) {
  if (!PGWIRE_PROOF_SYSTEMS.has(request.system)) {
    throw new Error(`Scenario A PG-wire proof journey does not run ${request.system}`);
  }
  let context = buildContext(request.system, request.connection, request.binding);
  const createAdapter = adapterFactoryOf(request);
  const cases = [];
  for (const proofCase of OLTP_SCENARIO_A_PROOF_CASES) {
    try {
      context = await rebindForCase(context, proofCase, request);
    } catch (error) {
      cases.push(Object.freeze({caseId: proofCase.id, proofIds: proofCase.proofIds,
        binding: context.binding, status: CASE_STATUS.ERRORED,
        error: String(error?.message || error),
        failureKind: FAILURE_KIND.EVIDENCE_INSUFFICIENT,
        failureReasons: [FAILURE_REASON.CASE_ERRORED]}));
      continue;
    }
    const current = context;
    const options = Object.freeze({
      createAdapter,
      prepareContext: async () => current,
      persistentStorage: request.persistentStorage,
      ...(request.restartProduct ?
        {restartCluster: ({context: active}) => request.restartProduct({context: active})} :
        {}),
    });
    cases.push(await runCase(proofCase, current, options, request));
  }
  const bindings = [];
  for (const entry of cases) {
    if (!arraySome(bindings, (seen) => JSON.stringify(seen) === JSON.stringify(entry.binding))) {
      bindings.push(entry.binding);
    }
  }
  // Only a passed case or a product anomaly reaches the gate; a proof that was
  // not obtained (or does not apply) leaves its ids missing.
  const proofs = arrayMap(arrayFilter(cases, (entry) => entry.proofRecord &&
    (entry.status === CASE_STATUS.PASSED ||
      entry.failureKind === FAILURE_KIND.PRODUCT_ANOMALY)), (entry) => entry.proofRecord);
  const failureKinds = arrayMap(arrayFilter(cases, (entry) => entry.failureKind),
    (entry) => ({caseId: entry.caseId, kind: entry.failureKind,
      reasons: [...entry.failureReasons]}));
  const gate = buildScenarioASemanticGateEvidence({systems: [request.system], proofs});
  const summary = gate.systems[request.system];
  return Object.freeze({
    system: request.system,
    status: gateStatusOf(summary),
    passed: summary.passedProofIds,
    failed: summary.failedProofIds,
    missing: summary.missingProofIds,
    // One deployment: its binding; several (rebinds): null, see bindings.
    binding: bindings.length === 1 ? bindings[0] : null,
    bindings: Object.freeze(bindings),
    semanticProfileId: gate.semanticProfileId,
    semanticProfileSha256: gate.semanticProfileSha256,
    semanticGateEvidenceSha256: gate.semanticGateEvidenceSha256,
    failureKinds: Object.freeze(failureKinds),
    cases: Object.freeze(cases),
  });
}

export {
  CASE_STATUS as SCENARIO_A_PROOF_CASE_STATUS,
  FAILURE_KIND as SCENARIO_A_PROOF_FAILURE_KIND,
  classifyProofCaseFailure,
  REFUSAL_REASON as SCENARIO_A_PROOF_REFUSAL_REASON,
  GATE_STATUS as SCENARIO_A_SEMANTIC_GATE_STATUS,
  runScenarioASemanticProofJourney,
};
