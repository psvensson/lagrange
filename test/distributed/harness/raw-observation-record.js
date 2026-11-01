// Owner of the raw observation record (design note
// solve/quests/comparative-benchmark-evidence-repair/evidence/chain-design.md).
//
// v2 is the only record publication may consume: one record per run, NDJSON,
// append-only. The validator throws on anything malformed and never coerces a
// missing or invalid value to zero. Lines of earlier schemas are kept only as
// retention envelopes; the forensic reader (raw-observation-forensic-reader.js)
// verifies them on the recomputation path and is never imported by publication.
//
// Decisions recorded with the coordinator (2026-11-01):
// - deployment.dataset is the product-content snapshot verification of
//   benchmark-oltp-state-reconciliation.js: the digest of the snapshot read back
//   from the product compared with the generator's expected digest, with the
//   per-table rows observed. It supersedes the design note's
//   {tables, keyCoverage, logicalChecksum}; there is no second accepted shape.
// - plan.warmup is the preregistered warm-up specification written before any
//   run ({operations, digest}: the planned warm-up operation count and the digest
//   of that slice; digest is null exactly when no warm-up is planned).
//   observations.warmup is what the driver executed. Admission refuses a capacity
//   cell whose executed warm-up differs from the planned one.
// - The campaign header pins, before any run, the product identity every target
//   role must run ({targetId, product, role, imageId, repoDigest,
//   reportedVersion}) and lists every adapter the campaign's arms may use;
//   admission compares each run's inspected products with the pin and refuses an
//   image pinned for two product families (stream C, 2026-11-01).
// - plan.workloadProfileId and plan.workload name the executed workload profile
//   and configuration; admission recomputes the dataset, plan and slice digests
//   from the workload through the run owner's derivation.
import {digest, serializeJsonData} from '../../../src/utils/canonical-json-data.js';
import {
  FAILURE_CLASS,
  OPERATION_OUTCOME,
  validateBenchmarkAccounting,
} from './benchmark-operation-outcome.js';
import {OLTP_DATASET_VERIFICATION_STATUS} from './benchmark-oltp-state-reconciliation.js';
import {BENCHMARK_RUN_STATUS} from './benchmark-scenario-a-run.js';
import {BENCHMARK_PROFILE_CLASS} from './benchmark-workload-dispatch.js';

const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayMap = Function.call.bind(Array.prototype.map);
const stringSplit = Function.call.bind(String.prototype.split);
const stringTrim = Function.call.bind(String.prototype.trim);
const numberIsFinite = Number.isFinite;
const numberIsSafeInteger = Number.isSafeInteger;
const objectValues = Object.values;
const jsonParse = JSON.parse;
const jsonStringify = JSON.stringify;
const dateParse = Date.parse;

const RAW_OBSERVATION_SCHEMA = Object.freeze({
  V2: 'lagrange-raw-observation-v2',
});

const RAW_RECORD_TYPE = Object.freeze({
  CAMPAIGN_HEADER: 'campaign-header',
  RUN: 'run',
});

const EXECUTION_TARGET = Object.freeze({LAB: 'lab', GCP: 'gcp'});

const READINESS_STATE = Object.freeze({READY: 'ready', EXHAUSTED: 'exhausted'});

const STORAGE_KIND = Object.freeze({
  HOST_VOLUME: 'host-volume',
  CONTAINER_LAYER: 'container-layer',
});

const NETWORK_SCOPE = Object.freeze({HOST_NIC_TOTAL: 'host-nic-total'});

// The enumerated business-operation families a run may claim (D11): a run whose
// scenario is not one of these is refused, never routed to a default family.
const BENCHMARK_SCENARIO = Object.freeze({
  A: 'scenarioA',
  B: 'scenarioB',
  C: 'scenarioC',
});

// Outcome words and failure classes are owned by benchmark-operation-outcome.js.
// An unresolved request names why it is unresolved; null is refused.
const UNRESOLVED_FAILURE_CLASSES = Object.freeze([
  FAILURE_CLASS.AMBIGUOUS_COMMIT,
  FAILURE_CLASS.WATCHDOG_STOPPED,
]);

// Runs that ended before a measurement window: their requests are all unissued
// and they carry no window or executed-operations digest.
const RUNS_WITHOUT_WINDOW = Object.freeze([
  BENCHMARK_RUN_STATUS.SETUP_FAILED,
  BENCHMARK_RUN_STATUS.WARMUP_FAILED,
]);

const CLOSURE_STATUS = Object.freeze({COMPLETE: 'complete', INCOMPLETE: 'incomplete'});

// Deployment events that break a measurement window when they fall inside it.
const DEPLOYMENT_EVENT_KIND = Object.freeze({
  RESTART: 'restart',
  IMAGE_CHANGE: 'image-change',
  NETWORK_IMPAIRMENT_APPLIED: 'network-impairment-applied',
  LOCK_LOST: 'lock-lost',
});

const HEADER_FIELD = Object.freeze({
  RECORD_TYPE: 'recordType',
  SCHEMA_VERSION: 'schemaVersion',
  CAMPAIGN_ID: 'campaignId',
  STARTED_AT: 'startedAt',
  MANIFEST_DIGEST: 'manifestDigest',
  HARNESS: 'harness',
  EXECUTION_TARGET: 'executionTarget',
  PHYSICAL_HOSTS: 'physicalHosts',
  PRODUCTS: 'products',
});

// One pinned product identity of the campaign header: what a target's role must
// run, fixed before any run (the tag is informational; D18).
const PINNED_PRODUCT_FIELD = Object.freeze({
  TARGET_ID: 'targetId',
  PRODUCT: 'product',
  ROLE: 'role',
  IMAGE_ID: 'imageId',
  REPO_DIGEST: 'repoDigest',
  REPORTED_VERSION: 'reportedVersion',
});

const RUN_FIELD = Object.freeze({
  RECORD_TYPE: 'recordType',
  SCHEMA_VERSION: 'schemaVersion',
  CAMPAIGN_ID: 'campaignId',
  RUN_ID: 'runId',
  CLAIM_KEY: 'claimKey',
  TARGET_ID: 'targetId',
  SCENARIO: 'scenario',
  SUBKIND: 'subkind',
  EXECUTION_TARGET: 'executionTarget',
  IDENTITY: 'identity',
  PLAN: 'plan',
  DEPLOYMENT: 'deployment',
  OBSERVATIONS: 'observations',
  CORRECTNESS: 'correctness',
  RAW_OBSERVATIONS_DIGEST: 'rawObservationsDigest',
});

const IDENTITY_FIELD = Object.freeze({
  HARNESS: 'harness',
  PRODUCTS: 'products',
  PRODUCTS_AFTER_WINDOW: 'productsAfterWindow',
  PUBLICATION: 'publication',
  GIT_COMMIT: 'gitCommit',
  CHECKOUT_DIRTY: 'checkoutDirty',
  DRIVER_SOURCE_SHA256: 'driverSourceSha256',
  ADAPTER_IDS: 'adapterIds',
});

const PRODUCT_FIELD = Object.freeze({
  ROLE: 'role',
  HOST: 'host',
  CONTAINER_ID: 'containerId',
  IMAGE_REF: 'imageRef',
  IMAGE_ID: 'imageId',
  REPO_DIGEST: 'repoDigest',
  STARTED_AT: 'startedAt',
  ENTRYPOINT: 'entrypoint',
  CMD: 'cmd',
  REPORTED_VERSION: 'reportedVersion',
});

const PLAN_FIELD = Object.freeze({
  MANIFEST_DIGEST: 'manifestDigest',
  DATASET_DIGEST: 'datasetDigest',
  WORKLOAD_PLAN_DIGEST: 'workloadPlanDigest',
  MEASUREMENT_PLAN_DIGEST: 'measurementPlanDigest',
  SEMANTIC_PROFILE_ID: 'semanticProfileId',
  SEMANTIC_PROFILE_DIGEST: 'semanticProfileDigest',
  RETRY_POLICY_ID: 'retryPolicyId',
  OPEN_LOOP_PROFILE_ID: 'openLoopProfileId',
  SWEEP_PLAN_DIGEST: 'sweepPlanDigest',
  OFFERED_RATE_PER_SEC: 'offeredRatePerSec',
  PROFILE_CLASS: 'profileClass',
  WORKLOAD_PROFILE_ID: 'workloadProfileId',
  WORKLOAD: 'workload',
  OPERATION_SLICE_DIGEST: 'operationSliceDigest',
  PLANNED_OPERATION_COUNTS: 'plannedOperationCounts',
  REPETITION: 'repetition',
  ORDER_INDEX: 'orderIndex',
  WARMUP: 'warmup',
});

const DEPLOYMENT_FIELD = Object.freeze({
  HOSTS: 'hosts',
  ROLES: 'roles',
  STORAGE: 'storage',
  READINESS: 'readiness',
  DATASET: 'dataset',
  PLACEMENT: 'placement',
  ENDPOINT: 'endpoint',
  LOAD_GENERATOR: 'loadGenerator',
  EVENTS: 'events',
  CLOSURE: 'closure',
});

const OBSERVATIONS_FIELD = Object.freeze({
  REQUESTS: 'requests',
  ACCOUNTING: 'accounting',
  WINDOW: 'window',
  RESOURCES: 'resources',
  NETWORK: 'network',
  EXECUTED_OPERATIONS_DIGEST: 'executedOperationsDigest',
  RUN_STATUS: 'runStatus',
  SETUP: 'setup',
});

const ACCOUNTING_FIELD = Object.freeze({
  OFFERED: 'offered',
  ISSUED: 'issued',
  UNISSUED: 'unissued',
  ATTEMPTS: 'attempts',
  COMMITTED: 'committed',
  CONFLICTS: 'conflicts',
  CONFLICT_EXHAUSTED: 'conflictExhausted',
  TERMINAL_FAILURES: 'terminalFailures',
  UNRESOLVED: 'unresolved',
});

const WINDOW_FIELD = Object.freeze({
  SCHEDULED_MS: 'scheduledMs',
  DRAIN_MS: 'drainMs',
  DRAIN_OVERRUN_MS: 'drainOverrunMs',
  STARTED_AT: 'startedAt',
  ENDED_AT: 'endedAt',
});

const REQUEST_FIELD = Object.freeze({
  OP_ID: 'opId',
  OPERATION_KIND: 'operationKind',
  INTENDED_START_MS: 'intendedStartMs',
  EFFECT_SUMMARY: 'effectSummary',
  OUTCOME: 'outcome',
  FAILURE_CLASS: 'failureClass',
  ATTEMPTS: 'attempts',
  RESPONSE_EVIDENCE: 'responseEvidence',
});

const ATTEMPT_FIELD = Object.freeze({
  ATTEMPT_NO: 'attemptNo',
  STARTED_MS: 'startedMs',
  ENDED_MS: 'endedMs',
  OUTCOME: 'outcome',
  SQLSTATE: 'sqlstate',
  ERROR_CODE: 'errorCode',
  RESPONSE_DIGEST: 'responseDigest',
});

const CORRECTNESS_FIELD = Object.freeze({
  SEMANTIC_GATE: 'semanticGate',
  FINAL_STATE: 'finalState',
  STATUS: 'status',
  PASSED: 'passed',
  FAILED: 'failed',
  MISSING: 'missing',
  BINDING: 'binding',
  BEFORE: 'before',
  AFTER: 'after',
  TABLE_ROWS: 'tableRows',
});

// Typed rejection codes; admission reports them as `record-rejected:<code>`.
const RECORD_REJECTION = Object.freeze({
  NOT_AN_OBJECT: 'not-an-object',
  MISSING_FIELD: 'missing-field',
  INVALID_TEXT: 'invalid-text',
  INVALID_COUNT: 'invalid-count',
  INVALID_TIMING: 'invalid-timing',
  INVALID_ENUM: 'invalid-enum',
  DUPLICATE_OP_ID: 'duplicate-op-id',
  ACCOUNTING_MISMATCH: 'accounting-mismatch',
  ACCOUNTING_INVARIANT: 'accounting-invariant',
  CORRUPT_LINE: 'corrupt-line',
  DIGEST_MISMATCH: 'digest-mismatch',
  UNKNOWN_SCHEMA: 'unknown-schema',
});

class RawObservationRecordError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.name = 'RawObservationRecordError';
    this.code = code;
  }
}

function reject(code, message) {
  throw new RawObservationRecordError(code, message);
}

function requireObject(value, at) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    reject(RECORD_REJECTION.MISSING_FIELD, `${at} must be an object`);
  }
  return value;
}

function requireArray(value, at) {
  if (!Array.isArray(value)) reject(RECORD_REJECTION.MISSING_FIELD, `${at} must be an array`);
  return value;
}

function requireText(value, at) {
  if (typeof value !== 'string' || stringTrim(value) === '') {
    reject(RECORD_REJECTION.INVALID_TEXT, `${at} must be a non-empty string`);
  }
  return value;
}

function requireCount(value, at) {
  if (typeof value !== 'number' || !numberIsSafeInteger(value) || value < 0) {
    reject(RECORD_REJECTION.INVALID_COUNT, `${at} must be a non-negative safe integer`);
  }
  return value;
}

function requireTiming(value, at) {
  if (typeof value !== 'number' || !numberIsFinite(value) || value < 0) {
    reject(RECORD_REJECTION.INVALID_TIMING, `${at} must be a finite non-negative number`);
  }
  return value;
}

function requireIsoTime(value, at) {
  requireText(value, at);
  if (!numberIsFinite(dateParse(value))) {
    reject(RECORD_REJECTION.INVALID_TIMING, `${at} must be an ISO timestamp`);
  }
  return value;
}

function requireEnum(value, allowed, at) {
  if (!arrayIncludes(allowed, value)) {
    reject(RECORD_REJECTION.INVALID_ENUM, `${at} must be one of ${allowed.join('|')}`);
  }
  return value;
}

function requireNullableObject(value, at) {
  if (value === null) return null;
  return requireObject(value, at);
}

// Harness identity: the checkout commit, whether the checkout was dirty, the
// digest of the executed driver sources (driverSourceIdentity of
// real-product-workload-drivers.js) and the adapters. On a campaign header
// adapterIds is the union over the campaign's arms; on a run it is that arm's.
function validateHarnessIdentity(harness, at) {
  requireObject(harness, at);
  requireText(harness[IDENTITY_FIELD.GIT_COMMIT], `${at}.gitCommit`);
  if (typeof harness[IDENTITY_FIELD.CHECKOUT_DIRTY] !== 'boolean') {
    reject(RECORD_REJECTION.MISSING_FIELD, `${at}.checkoutDirty must be a boolean`);
  }
  requireText(harness[IDENTITY_FIELD.DRIVER_SOURCE_SHA256], `${at}.driverSourceSha256`);
  const adapterIds = requireArray(harness[IDENTITY_FIELD.ADAPTER_IDS], `${at}.adapterIds`);
  adapterIds.forEach((id, idx) => requireText(id, `${at}.adapterIds[${idx}]`));
}

function validateProduct(product, at) {
  requireObject(product, at);
  for (const field of [
    PRODUCT_FIELD.ROLE, PRODUCT_FIELD.HOST, PRODUCT_FIELD.CONTAINER_ID, PRODUCT_FIELD.IMAGE_REF,
    PRODUCT_FIELD.IMAGE_ID, PRODUCT_FIELD.REPO_DIGEST, PRODUCT_FIELD.REPORTED_VERSION,
  ]) {
    requireText(product[field], `${at}.${field}`);
  }
  requireIsoTime(product[PRODUCT_FIELD.STARTED_AT], `${at}.startedAt`);
}

function validateProducts(products, at) {
  requireArray(products, at);
  if (products.length === 0) reject(RECORD_REJECTION.MISSING_FIELD, `${at} must not be empty`);
  products.forEach((p, idx) => validateProduct(p, `${at}[${idx}]`));
}

function validateIdentity(identity) {
  requireObject(identity, RUN_FIELD.IDENTITY);
  validateHarnessIdentity(identity[IDENTITY_FIELD.HARNESS], 'identity.harness');
  validateProducts(identity[IDENTITY_FIELD.PRODUCTS], 'identity.products');
  validateProducts(identity[IDENTITY_FIELD.PRODUCTS_AFTER_WINDOW], 'identity.productsAfterWindow');
  if (!Object.hasOwn(identity, IDENTITY_FIELD.PUBLICATION)) {
    reject(RECORD_REJECTION.MISSING_FIELD, 'identity.publication must be present (null until set)');
  }
  requireNullableObject(identity[IDENTITY_FIELD.PUBLICATION], 'identity.publication');
}

function validatePlan(plan) {
  requireObject(plan, RUN_FIELD.PLAN);
  for (const field of [
    PLAN_FIELD.MANIFEST_DIGEST, PLAN_FIELD.DATASET_DIGEST, PLAN_FIELD.WORKLOAD_PLAN_DIGEST,
    PLAN_FIELD.MEASUREMENT_PLAN_DIGEST, PLAN_FIELD.SEMANTIC_PROFILE_ID,
    PLAN_FIELD.SEMANTIC_PROFILE_DIGEST, PLAN_FIELD.RETRY_POLICY_ID,
    PLAN_FIELD.OPEN_LOOP_PROFILE_ID, PLAN_FIELD.WORKLOAD_PROFILE_ID,
  ]) {
    requireText(plan[field], `plan.${field}`);
  }
  // The executed workload configuration; admission recomputes its identity.
  requireObject(plan[PLAN_FIELD.WORKLOAD], 'plan.workload');
  // A smoke run has no sweep plan; admission requires one for capacity runs.
  if (plan[PLAN_FIELD.SWEEP_PLAN_DIGEST] !== null) {
    requireText(plan[PLAN_FIELD.SWEEP_PLAN_DIGEST], 'plan.sweepPlanDigest');
  }
  requireTiming(plan[PLAN_FIELD.OFFERED_RATE_PER_SEC], 'plan.offeredRatePerSec');
  requireEnum(plan[PLAN_FIELD.PROFILE_CLASS], objectValues(BENCHMARK_PROFILE_CLASS),
    'plan.profileClass');
  requireText(plan[PLAN_FIELD.OPERATION_SLICE_DIGEST], 'plan.operationSliceDigest');
  const planned = requireObject(plan[PLAN_FIELD.PLANNED_OPERATION_COUNTS],
    'plan.plannedOperationCounts');
  for (const [kind, n] of Object.entries(planned)) {
    requireCount(n, `plan.plannedOperationCounts.${kind}`);
  }
  requireCount(plan[PLAN_FIELD.REPETITION], 'plan.repetition');
  requireCount(plan[PLAN_FIELD.ORDER_INDEX], 'plan.orderIndex');
  const warmup = requireObject(plan[PLAN_FIELD.WARMUP], 'plan.warmup');
  requireCount(warmup.operations, 'plan.warmup.operations');
  if (warmup.operations === 0) {
    if (warmup.digest !== null) {
      reject(RECORD_REJECTION.INVALID_TEXT, 'plan.warmup.digest must be null without warm-up');
    }
  } else {
    requireText(warmup.digest, 'plan.warmup.digest');
  }
}

function validateHosts(hosts, at) {
  requireArray(hosts, at).forEach((host, idx) => {
    requireObject(host, `${at}[${idx}]`);
    requireText(host.hostId, `${at}[${idx}].hostId`);
    requireText(host.ip, `${at}[${idx}].ip`);
    requireText(host.hostname, `${at}[${idx}].hostname`);
    requireText(host.bootId, `${at}[${idx}].bootId`);
    requireCount(host.cpus, `${at}[${idx}].cpus`);
    requireTiming(host.memGb, `${at}[${idx}].memGb`);
  });
}

function validateTableRows(rows, at) {
  requireObject(rows, at);
  for (const [table, n] of Object.entries(rows)) requireCount(n, `${at}.${table}`);
}

// Dataset evidence is the product-content snapshot verification of
// benchmark-oltp-state-reconciliation.js (verifyOltpLoadedDataset).
function validateDataset(dataset) {
  requireObject(dataset, 'deployment.dataset');
  requireText(dataset.resetMethod, 'deployment.dataset.resetMethod');
  const v = requireObject(dataset.verification, 'deployment.dataset.verification');
  requireEnum(v.status, objectValues(OLTP_DATASET_VERIFICATION_STATUS),
    'deployment.dataset.verification.status');
  requireText(v.method, 'deployment.dataset.verification.method');
  requireText(v.expectedLogicalChecksum, 'deployment.dataset.verification.expectedLogicalChecksum');
  // Observed (and expected) table rows exist only when the loaded state was observed.
  if (v.status === OLTP_DATASET_VERIFICATION_STATUS.VERIFIED ||
      v.status === OLTP_DATASET_VERIFICATION_STATUS.MISMATCH) {
    validateTableRows(v.expectedTableRows, 'deployment.dataset.verification.expectedTableRows');
    requireText(v.observedLogicalChecksum,
      'deployment.dataset.verification.observedLogicalChecksum');
    validateTableRows(v.observedTableRows, 'deployment.dataset.verification.observedTableRows');
  }
}

function validateEndpointAndLoadGenerator(deployment) {
  const endpoint = requireObject(deployment[DEPLOYMENT_FIELD.ENDPOINT], 'deployment.endpoint');
  requireText(endpoint.host, 'deployment.endpoint.host');
  requireCount(endpoint.port, 'deployment.endpoint.port');
  requireText(endpoint.containerId, 'deployment.endpoint.containerId');
  requireText(endpoint.protocol, 'deployment.endpoint.protocol');
  const generator = requireObject(deployment[DEPLOYMENT_FIELD.LOAD_GENERATOR],
    'deployment.loadGenerator');
  requireText(generator.host, 'deployment.loadGenerator.host');
  requireText(generator.nodeVersion, 'deployment.loadGenerator.nodeVersion');
  requireObject(generator.driverVersions, 'deployment.loadGenerator.driverVersions');
}

function validateEventsAndClosure(deployment) {
  requireArray(deployment[DEPLOYMENT_FIELD.EVENTS], 'deployment.events').forEach((e, idx) => {
    requireEnum(e.kind, objectValues(DEPLOYMENT_EVENT_KIND), `deployment.events[${idx}].kind`);
    requireIsoTime(e.at, `deployment.events[${idx}].at`);
  });
  const closure = requireObject(deployment[DEPLOYMENT_FIELD.CLOSURE], 'deployment.closure');
  requireEnum(closure.status, objectValues(CLOSURE_STATUS), 'deployment.closure.status');
  requireArray(closure.unclosed, 'deployment.closure.unclosed');
}

function validateDeployment(deployment) {
  requireObject(deployment, RUN_FIELD.DEPLOYMENT);
  validateHosts(deployment[DEPLOYMENT_FIELD.HOSTS], 'deployment.hosts');
  requireArray(deployment[DEPLOYMENT_FIELD.ROLES], 'deployment.roles').forEach((r, idx) => {
    requireText(r.role, `deployment.roles[${idx}].role`);
    requireText(r.host, `deployment.roles[${idx}].host`);
    requireText(r.containerId, `deployment.roles[${idx}].containerId`);
  });
  requireArray(deployment[DEPLOYMENT_FIELD.STORAGE], 'deployment.storage').forEach((s, idx) => {
    requireText(s.containerId, `deployment.storage[${idx}].containerId`);
    requireText(s.mount, `deployment.storage[${idx}].mount`);
    requireEnum(s.kind, objectValues(STORAGE_KIND), `deployment.storage[${idx}].kind`);
  });
  const readiness = requireObject(deployment[DEPLOYMENT_FIELD.READINESS], 'deployment.readiness');
  requireEnum(readiness.state, objectValues(READINESS_STATE), 'deployment.readiness.state');
  requireIsoTime(readiness.observedAt, 'deployment.readiness.observedAt');
  validateDataset(deployment[DEPLOYMENT_FIELD.DATASET]);
  validateEndpointAndLoadGenerator(deployment);
  validateEventsAndClosure(deployment);
  requireNullableObject(deployment[DEPLOYMENT_FIELD.PLACEMENT] ?? null, 'deployment.placement');
}

function validateAttemptTimings(attempts, at) {
  attempts.forEach((attempt, idx) => {
    requireObject(attempt, `${at}[${idx}]`);
    const started = requireTiming(attempt[ATTEMPT_FIELD.STARTED_MS], `${at}[${idx}].startedMs`);
    const ended = requireTiming(attempt[ATTEMPT_FIELD.ENDED_MS], `${at}[${idx}].endedMs`);
    if (ended < started) reject(RECORD_REJECTION.INVALID_TIMING, `${at}[${idx}] ends early`);
    requireText(attempt[ATTEMPT_FIELD.RESPONSE_DIGEST], `${at}[${idx}].responseDigest`);
  });
}

// Typed record-level checks; every other request invariant is owned by
// validateBenchmarkAccounting (benchmark-operation-outcome.js).
function validateRequests(requests) {
  const seen = new Set();
  requests.forEach((request, idx) => {
    const at = `observations.requests[${idx}]`;
    requireObject(request, at);
    const opId = requireText(request[REQUEST_FIELD.OP_ID], `${at}.opId`);
    if (seen.has(opId)) reject(RECORD_REJECTION.DUPLICATE_OP_ID, `${at}.opId ${opId}`);
    seen.add(opId);
    requireTiming(request[REQUEST_FIELD.INTENDED_START_MS], `${at}.intendedStartMs`);
    validateAttemptTimings(requireArray(request[REQUEST_FIELD.ATTEMPTS], `${at}.attempts`),
      `${at}.attempts`);
    if (request[REQUEST_FIELD.OUTCOME] === OPERATION_OUTCOME.UNRESOLVED) {
      requireEnum(request[REQUEST_FIELD.FAILURE_CLASS], UNRESOLVED_FAILURE_CLASSES,
        `${at}.failureClass`);
    }
  });
}

function recountAccounting(requests) {
  try {
    return validateBenchmarkAccounting(requests);
  } catch (err) {
    return reject(RECORD_REJECTION.ACCOUNTING_INVARIANT, err.message);
  }
}

function validateAccountingMatchesRequests(accounting, requests) {
  requireObject(accounting, 'observations.accounting');
  const recount = recountAccounting(requests);
  if (serializeJsonData(recount, {sortKeys: true}) !==
      serializeJsonData(accounting, {sortKeys: true})) {
    reject(RECORD_REJECTION.ACCOUNTING_MISMATCH,
      `observations.accounting ${jsonStringify(accounting)} != recount ${jsonStringify(recount)}`);
  }
}

function validateWindow(window) {
  requireObject(window, 'observations.window');
  requireTiming(window[WINDOW_FIELD.SCHEDULED_MS], 'observations.window.scheduledMs');
  requireTiming(window[WINDOW_FIELD.DRAIN_MS], 'observations.window.drainMs');
  requireTiming(window[WINDOW_FIELD.DRAIN_OVERRUN_MS], 'observations.window.drainOverrunMs');
  requireIsoTime(window[WINDOW_FIELD.STARTED_AT], 'observations.window.startedAt');
  requireIsoTime(window[WINDOW_FIELD.ENDED_AT], 'observations.window.endedAt');
}

function validateObservations(observations) {
  requireObject(observations, RUN_FIELD.OBSERVATIONS);
  const runStatus = requireEnum(observations[OBSERVATIONS_FIELD.RUN_STATUS],
    objectValues(BENCHMARK_RUN_STATUS), 'observations.runStatus');
  const requests = requireArray(observations[OBSERVATIONS_FIELD.REQUESTS],
    'observations.requests');
  validateRequests(requests);
  validateAccountingMatchesRequests(observations[OBSERVATIONS_FIELD.ACCOUNTING], requests);
  if (arrayIncludes(RUNS_WITHOUT_WINDOW, runStatus)) {
    if (observations.accounting.issued !== 0) {
      reject(RECORD_REJECTION.ACCOUNTING_INVARIANT, `${runStatus} run issued requests`);
    }
    if (runStatus === BENCHMARK_RUN_STATUS.SETUP_FAILED) {
      const setup = requireObject(observations[OBSERVATIONS_FIELD.SETUP], 'observations.setup');
      requireText(setup.failureClass, 'observations.setup.failureClass');
    }
    return;
  }
  validateWindow(observations[OBSERVATIONS_FIELD.WINDOW]);
  requireText(observations[OBSERVATIONS_FIELD.EXECUTED_OPERATIONS_DIGEST],
    'observations.executedOperationsDigest');
  requireNullableObject(observations[OBSERVATIONS_FIELD.RESOURCES] ?? null,
    'observations.resources');
  const network = requireNullableObject(observations[OBSERVATIONS_FIELD.NETWORK] ?? null,
    'observations.network');
  if (network) requireEnum(network.scope, objectValues(NETWORK_SCOPE), 'observations.network.scope');
}

function validateCorrectness(correctness) {
  requireObject(correctness, RUN_FIELD.CORRECTNESS);
  const gate = requireNullableObject(correctness[CORRECTNESS_FIELD.SEMANTIC_GATE] ?? null,
    'correctness.semanticGate');
  if (gate) {
    requireText(gate[CORRECTNESS_FIELD.STATUS], 'correctness.semanticGate.status');
    for (const list of [CORRECTNESS_FIELD.PASSED, CORRECTNESS_FIELD.FAILED,
      CORRECTNESS_FIELD.MISSING]) {
      requireArray(gate[list], `correctness.semanticGate.${list}`);
    }
    requireNullableObject(gate[CORRECTNESS_FIELD.BINDING] ?? null,
      'correctness.semanticGate.binding');
  }
  const finalState = requireNullableObject(correctness[CORRECTNESS_FIELD.FINAL_STATE] ?? null,
    'correctness.finalState');
  if (finalState) {
    for (const side of [CORRECTNESS_FIELD.BEFORE, CORRECTNESS_FIELD.AFTER]) {
      const snapshot = requireObject(finalState[side], `correctness.finalState.${side}`);
      const rows = requireObject(snapshot[CORRECTNESS_FIELD.TABLE_ROWS],
        `correctness.finalState.${side}.tableRows`);
      for (const [table, n] of Object.entries(rows)) {
        requireCount(n, `correctness.finalState.${side}.tableRows.${table}`);
      }
    }
  }
}

function digestedRunContent(run) {
  const {publication: _publication, ...identity} = run[RUN_FIELD.IDENTITY];
  return {
    observations: run[RUN_FIELD.OBSERVATIONS],
    correctness: run[RUN_FIELD.CORRECTNESS],
    deployment: run[RUN_FIELD.DEPLOYMENT],
    identity,
    plan: run[RUN_FIELD.PLAN],
  };
}

// sha256 over canonical JSON of observations + correctness + deployment + identity
// + plan. identity.publication is excluded: the publisher fills it after the run.
function computeRunObservationsDigest(run) {
  return digest(digestedRunContent(run));
}

function buildClaimKey({targetId, scenario, subkind, offeredRatePerSec, repetition}) {
  return `${targetId}/${scenario}/${subkind}/${offeredRatePerSec}/${repetition}`;
}

function validateRunRecord(run) {
  if (!run || typeof run !== 'object') reject(RECORD_REJECTION.NOT_AN_OBJECT, 'run record');
  requireEnum(run[RUN_FIELD.RECORD_TYPE], [RAW_RECORD_TYPE.RUN], 'recordType');
  requireEnum(run[RUN_FIELD.SCHEMA_VERSION], [RAW_OBSERVATION_SCHEMA.V2], 'schemaVersion');
  for (const field of [RUN_FIELD.CAMPAIGN_ID, RUN_FIELD.RUN_ID, RUN_FIELD.CLAIM_KEY,
    RUN_FIELD.TARGET_ID, RUN_FIELD.SUBKIND]) {
    requireText(run[field], field);
  }
  requireEnum(run[RUN_FIELD.SCENARIO], objectValues(BENCHMARK_SCENARIO), 'scenario');
  requireEnum(run[RUN_FIELD.EXECUTION_TARGET], objectValues(EXECUTION_TARGET), 'executionTarget');
  validateIdentity(run[RUN_FIELD.IDENTITY]);
  validatePlan(run[RUN_FIELD.PLAN]);
  validateDeployment(run[RUN_FIELD.DEPLOYMENT]);
  validateObservations(run[RUN_FIELD.OBSERVATIONS]);
  validateCorrectness(run[RUN_FIELD.CORRECTNESS]);
  const expectedKey = buildClaimKey({
    targetId: run.targetId, scenario: run.scenario, subkind: run.subkind,
    offeredRatePerSec: run.plan.offeredRatePerSec, repetition: run.plan.repetition,
  });
  if (run[RUN_FIELD.CLAIM_KEY] !== expectedKey) {
    reject(RECORD_REJECTION.INVALID_TEXT, `claimKey ${run.claimKey} != ${expectedKey}`);
  }
  requireText(run[RUN_FIELD.RAW_OBSERVATIONS_DIGEST], RUN_FIELD.RAW_OBSERVATIONS_DIGEST);
  return run;
}

function validateCampaignHeader(header) {
  requireObject(header, 'campaign header');
  requireEnum(header[HEADER_FIELD.RECORD_TYPE], [RAW_RECORD_TYPE.CAMPAIGN_HEADER], 'recordType');
  requireEnum(header[HEADER_FIELD.SCHEMA_VERSION], [RAW_OBSERVATION_SCHEMA.V2], 'schemaVersion');
  requireText(header[HEADER_FIELD.CAMPAIGN_ID], 'campaignId');
  requireIsoTime(header[HEADER_FIELD.STARTED_AT], 'startedAt');
  requireText(header[HEADER_FIELD.MANIFEST_DIGEST], 'manifestDigest');
  validateHarnessIdentity(header[HEADER_FIELD.HARNESS], 'harness');
  requireEnum(header[HEADER_FIELD.EXECUTION_TARGET], objectValues(EXECUTION_TARGET),
    'executionTarget');
  validateHosts(header[HEADER_FIELD.PHYSICAL_HOSTS], 'physicalHosts');
  const pinned = requireArray(header[HEADER_FIELD.PRODUCTS], 'products');
  if (pinned.length === 0) reject(RECORD_REJECTION.MISSING_FIELD, 'products must not be empty');
  const keys = new Set();
  pinned.forEach((pin, idx) => {
    requireObject(pin, `products[${idx}]`);
    for (const field of objectValues(PINNED_PRODUCT_FIELD)) {
      requireText(pin[field], `products[${idx}].${field}`);
    }
    const key = `${pin.targetId}|${pin.role}`;
    if (keys.has(key)) reject(RECORD_REJECTION.INVALID_TEXT, `products pins ${key} twice`);
    keys.add(key);
  });
  return header;
}

// ---- retained (non-admissible) lines ----
//
// A raw observation file may hold lines of an earlier schema (the retained
// forensic campaigns). Publication never interprets them: it keeps only the
// retention envelope (record id, stored digest, the campaign commit of the
// preceding retained campaign header) so a withdrawn claim can name the record
// and its invalidation. Reading and verifying those lines is the forensic
// reader's job (raw-observation-forensic-reader.js), reachable only from the
// recomputation path.

function parseLine(line, file, lineNo) {
  try {
    return jsonParse(line);
  } catch (err) {
    return reject(RECORD_REJECTION.CORRUPT_LINE, `${file}:${lineNo} is not JSON: ${err.message}`);
  }
}

function retainLine(parsed, file, lineNo, out) {
  if (parsed?.recordType === RAW_RECORD_TYPE.CAMPAIGN_HEADER) {
    out.retainedCampaignCommit = requireText(parsed.gitCommit, `${file}:${lineNo} gitCommit`);
    return;
  }
  out.retainedReferences.push(Object.freeze({
    file,
    campaignGitCommit: out.retainedCampaignCommit,
    recordId: requireText(parsed?.receiptId, `${file}:${lineNo} receiptId`),
    rawObservationsDigest: requireText(parsed?.rawObservationsDigest,
      `${file}:${lineNo} rawObservationsDigest`),
  }));
}

function classifyLine(parsed, file, lineNo, out) {
  if (parsed?.schemaVersion !== RAW_OBSERVATION_SCHEMA.V2) {
    retainLine(parsed, file, lineNo, out);
  } else if (parsed.recordType === RAW_RECORD_TYPE.CAMPAIGN_HEADER) {
    out.campaignHeaders.push(parsed);
  } else if (parsed.recordType === RAW_RECORD_TYPE.RUN) {
    out.runs.push(parsed);
  } else {
    reject(RECORD_REJECTION.UNKNOWN_SCHEMA, `${file}:${lineNo} recordType ${parsed.recordType}`);
  }
}

// Splits a raw observation file into v2 campaign headers and runs, plus the
// retention envelopes of non-admissible lines. v2 runs are returned unvalidated:
// admission validates each one so a malformed run becomes a typed invalid cell
// instead of hiding its neighbours.
function parseRawObservationText(text, file) {
  const out = {campaignHeaders: [], runs: [], retainedReferences: [],
    retainedCampaignCommit: null};
  const lines = arrayMap(stringSplit(text, '\n'), (l) => stringTrim(l));
  lines.forEach((line, idx) => {
    if (line !== '') classifyLine(parseLine(line, file, idx + 1), file, idx + 1, out);
  });
  return {campaignHeaders: out.campaignHeaders, runs: out.runs,
    retainedReferences: out.retainedReferences};
}

export {
  ACCOUNTING_FIELD,
  ATTEMPT_FIELD,
  BENCHMARK_SCENARIO,
  CLOSURE_STATUS,
  CORRECTNESS_FIELD,
  DEPLOYMENT_EVENT_KIND,
  DEPLOYMENT_FIELD,
  EXECUTION_TARGET,
  HEADER_FIELD,
  IDENTITY_FIELD,
  NETWORK_SCOPE,
  OBSERVATIONS_FIELD,
  PINNED_PRODUCT_FIELD,
  PLAN_FIELD,
  PRODUCT_FIELD,
  RAW_OBSERVATION_SCHEMA,
  RAW_RECORD_TYPE,
  READINESS_STATE,
  RECORD_REJECTION,
  REQUEST_FIELD,
  RUN_FIELD,
  RawObservationRecordError,
  STORAGE_KIND,
  WINDOW_FIELD,
  buildClaimKey,
  computeRunObservationsDigest,
  parseRawObservationText,
  validateCampaignHeader,
  validateRunRecord,
};
