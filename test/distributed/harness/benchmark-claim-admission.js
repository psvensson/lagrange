// Claim-specific admission (design note
// solve/quests/comparative-benchmark-evidence-repair/evidence/chain-design.md).
//
// Input: one advertised claim + the v2 run records + the campaign headers + the
// retained forensic (v1) records + the invalidation ledger. Output: one cell whose
// status is one of CLAIM_CELL_STATUS, with typed reasons, evidence pointers and
// metrics only for valid-observed and product-failure. Forensic records are never
// admitted; they only explain why a previously published value is withdrawn.
import {COMPARATIVE_PARITY_STATUS} from './comparative-efficiency-evidence-contract.js';
import {OLTP_OPERATION_KIND} from './oltp-baseline-workload.js';
import {OLTP_OPEN_LOOP_PROFILE} from './oltp-open-loop-step-owner.js';
import {OLTP_PAIRED_RETRY_POLICY} from './oltp-paired-retry-owner.js';
import {OLTP_SCENARIO_A_SEMANTIC_GATE_STATUS as GATE_STATUS} from
  './oltp-scenario-a-semantic-gate.js';
import {
  OLTP_SCENARIO_A_SEMANTIC_PROFILE,
  hashScenarioASemanticProfile,
} from './oltp-scenario-a-semantic-profile.js';
import {
  OLTP_DATASET_VERIFICATION_STATUS,
  OLTP_RECONCILIATION_STATUS,
} from './benchmark-oltp-state-reconciliation.js';
import {
  FAILURE_CLASS,
  OPERATION_OUTCOME,
  computeExecutedOperationsDigest,
} from './benchmark-operation-outcome.js';
import {
  BENCHMARK_RUN_STATUS,
  describeBenchmarkWorkloadIdentity,
} from './benchmark-scenario-a-run.js';
import {
  BENCHMARK_PROFILE_CLASS,
  isBenchmarkDispatchRefusal,
  resolveBenchmarkWorkloadProfile,
} from './benchmark-workload-dispatch.js';
import {
  BENCHMARK_SCENARIO,
  CLOSURE_STATUS,
  DEPLOYMENT_EVENT_KIND,
  FINAL_STATE_TABLE,
  READINESS_STATE,
  computeRunObservationsDigest,
  validateCampaignHeader,
  validateRunRecord,
} from './raw-observation-record.js';
import {deriveRunMetrics} from './raw-observation-metrics.js';
import {serializeJsonData} from '../../../src/utils/canonical-json-data.js';
import {SCENARIO_OUTCOME} from './scenario-outcome.js';

const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayFind = Function.call.bind(Array.prototype.find);
const arrayEvery = Function.call.bind(Array.prototype.every);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayMap = Function.call.bind(Array.prototype.map);
const arraySome = Function.call.bind(Array.prototype.some);
const jsonStringify = JSON.stringify;

const CLAIM_CELL_STATUS = Object.freeze({
  VALID_OBSERVED: 'valid-observed',
  PRODUCT_FAILURE: 'product-failure',
  INVALID_MEASUREMENT: 'invalid-measurement',
  BLOCKED: 'blocked',
  UNSUPPORTED: 'unsupported',
  NOT_MEASURED: 'not-measured',
});

const METRIC_BEARING_STATUSES = Object.freeze([
  CLAIM_CELL_STATUS.VALID_OBSERVED,
  CLAIM_CELL_STATUS.PRODUCT_FAILURE,
]);

// Each claim kind needs its own observed record kind; throughput admission does
// not admit recovery, placement, freshness or survivability.
const CLAIM_KIND = Object.freeze({
  THROUGHPUT: 'throughput',
  DECISION_THROUGHPUT: 'decision-throughput',
  FRESHNESS: 'freshness',
  BACKFILL: 'backfill',
  RECOVERY: 'recovery',
  SCALEOUT: 'scaleout',
  PLACEMENT: 'placement',
  PARTITION_SWEEP: 'partition-sweep',
  RTT_SWEEP: 'rtt-sweep',
  WORKING_SET: 'working-set',
  MOVEMENT: 'movement',
  PHASE_BREAKDOWN: 'phase-breakdown',
});

// Claim kinds whose observation and admission path exist today.
const ADMISSIBLE_CLAIM_KINDS = Object.freeze([CLAIM_KIND.THROUGHPUT]);

// One reason vocabulary for admission cells and invalidation-ledger entries. A
// missing witness is named by its own reason code.
const ADMISSION_REASON = Object.freeze({
  NO_OBSERVATION: 'no-observation',
  FORENSIC_RECORD: 'forensic-record-not-admissible',
  CLAIM_KIND_NOT_OBSERVED: 'claim-kind-observation-missing',
  RAW_DIGEST_MISMATCH: 'raw-digest-mismatch',
  CAMPAIGN_HEADER_MISSING: 'campaign-header-missing',
  IDENTITY_MISSING: 'identity-missing',
  IDENTITY_MISMATCH: 'identity-mismatch',
  HARNESS_MISMATCH: 'harness-mismatch',
  CHECKOUT_DIRTY: 'checkout-dirty',
  IDENTITY_NOT_RUNNING: 'identity-not-running',
  IDENTITY_CHANGED_DURING_WINDOW: 'identity-changed-during-window',
  PRODUCT_IDENTITY_MISMATCH: 'product-identity-mismatch',
  CANDIDATE_IMAGE_IS_COMPARATOR_IMAGE: 'candidate-image-is-comparator-image',
  RESTART_DURING_WINDOW: 'restart-during-window',
  ENDPOINT_NOT_BOUND: 'endpoint-not-bound',
  LOAD_GENERATOR_ON_PRODUCT_HOST: 'load-generator-on-product-host',
  CLOSURE_INCOMPLETE: 'closure-incomplete',
  WRONG_DISPATCH_FAMILY: 'wrong-dispatch-family',
  NON_CANONICAL_WORKLOAD: 'non-canonical-workload',
  WORKLOAD_PROFILE_MISMATCH: 'workload-profile-mismatch',
  WORKLOAD_IDENTITY_MISMATCH: 'workload-identity-mismatch',
  EXECUTED_OPERATIONS_MISMATCH: 'executed-operations-mismatch',
  PLANNED_COUNTS_MISMATCH: 'planned-counts-mismatch',
  SEMANTIC_PROFILE_MISMATCH: 'semantic-profile-mismatch',
  READINESS_UNVERIFIED: 'readiness-unverified',
  READINESS_EXHAUSTED: 'readiness-exhausted',
  DATASET_UNVERIFIED: 'dataset-unverified',
  FINAL_STATE_MISSING: 'final-state-missing',
  FINAL_STATE_UNRECONCILED: 'final-state-unreconciled',
  UNRESOLVED_EFFECTS_OBSERVED: 'unresolved-effects-observed',
  CORRECTNESS_FAILURES_OBSERVED: 'correctness-failures-observed',
  SEMANTIC_GATE_MISSING: 'semantic-gate-missing',
  SEMANTIC_GATE_NOT_PASSED: 'semantic-gate-not-passed',
  SEMANTIC_GATE_UNBOUND: 'semantic-gate-unbound',
  SEMANTIC_GATE_FAILED: 'semantic-gate-failed',
  SEMANTIC_GATE_INCOMPLETE: 'semantic-gate-incomplete',
  SWEEP_PLAN_MISSING: 'sweep-plan-missing',
  WARMUP_PLAN_MISMATCH: 'warmup-plan-mismatch',
  DATASET_PREPARATION_FAILED: 'dataset-preparation-failed',
  SETUP_HARNESS_FAULT: 'setup-harness-fault',
  WARMUP_FAILED: 'warmup-failed',
  WATCHDOG_STOPPED: 'watchdog-stopped',
  TOPOLOGY_MISMATCH: 'topology-mismatch',
  DELAY_OR_BYTE_FORMULA: 'delay-or-byte-formula',
  MIXED_CAMPAIGN: 'mixed-campaign',
  MIXED_PROFILE: 'mixed-profile',
  DUPLICATE_CLAIM: 'duplicate-claim',
  NO_ISSUED_OPERATIONS: 'no-issued-operations',
  NO_COMMITTED_OPERATIONS: 'no-committed-operations',
  INSUFFICIENT_SAMPLES: 'insufficient-samples',
  SMOKE_PROFILE: 'smoke-profile-no-capacity-claim',
  LABEL_NOT_OBSERVED: 'label-not-observed',
  COMPILED_RISK_SERVICE_MISSING: 'compiled-risk-service-missing',
  ASYNC_STREAM_CANNOT_SERVE_FRESH_READ: 'async-stream-cannot-serve-0ms-freshness',
  TIMEOUT_COUNTED_AS_SUCCESS: 'timeout-counted-as-success',
  HEALTH_SUBSTITUTE: 'health-substitute',
  UNVERIFIED_RESPONSE_ENVELOPE: 'unverified-response-envelope',
  CONSTANT_PHASE_OR_BYTE: 'constant-phase-or-byte',
  LABEL_HASH_IDENTITY: 'label-hash-identity',
  CLOSED_LOOP_THROUGHPUT: 'closed-loop-throughput',
  FRESHNESS_NOT_OBSERVED: 'freshness-not-observed',
  EMULATED_PRODUCT: 'emulated-product',
  LOCAL_ORACLE_NOT_COMPARISON_TARGET: 'local-oracle-not-comparison-target',
  FABRICATED_HISTORY_METRICS: 'fabricated-history-metrics',
});

// Reasons that explain a valid or product-failure cell without blocking admission.
const NON_BLOCKING_REASONS = Object.freeze([
  ADMISSION_REASON.SEMANTIC_GATE_FAILED,
  ADMISSION_REASON.SEMANTIC_GATE_INCOMPLETE,
  ADMISSION_REASON.UNRESOLVED_EFFECTS_OBSERVED,
]);

// A run that stopped before or during its window is a visible product failure,
// never a measurement and never hidden.
const STOPPED_RUN_REASON = Object.freeze({
  [BENCHMARK_RUN_STATUS.SETUP_FAILED]: ADMISSION_REASON.DATASET_PREPARATION_FAILED,
  [BENCHMARK_RUN_STATUS.WARMUP_FAILED]: ADMISSION_REASON.WARMUP_FAILED,
  [BENCHMARK_RUN_STATUS.WATCHDOG_STOPPED]: ADMISSION_REASON.WATCHDOG_STOPPED,
});

const REASON_PREFIX = Object.freeze({
  RECORD_REJECTED: 'record-rejected:',
  INVALIDATED: 'invalidated:',
});

// Preregistered statistical sufficiency for capacity metrics (committedPerSec and
// latency quantiles). The paired sweep plan already requires an even repetition
// count >= 2 (oltp-paired-sweep-plan.js normalizeRepetitions); no existing owner
// fixed a minimum committed count, so this rule states it: nearest-rank p99 over
// fewer than 100 samples is the sample maximum, not a p99.
const SUFFICIENCY_RULE = Object.freeze({
  id: 'comparative-capacity-sufficiency-v1',
  minCommittedPerRun: 100,
  minRepetitionsPerRate: 2,
});

// One mapping table between the neighbouring vocabularies and the cell status.
// `null` means "not a cell status by itself: admission decides from the record".
const CELL_STATUS_MAPPING = Object.freeze({
  scenarioOutcome: Object.freeze({
    [SCENARIO_OUTCOME.PASSED]: null,
    [SCENARIO_OUTCOME.FAILED]: CLAIM_CELL_STATUS.INVALID_MEASUREMENT,
    [SCENARIO_OUTCOME.REFUSED]: CLAIM_CELL_STATUS.BLOCKED,
  }),
  comparativeParityStatus: Object.freeze({
    [COMPARATIVE_PARITY_STATUS.PASS]: null,
    [COMPARATIVE_PARITY_STATUS.FAIL]: CLAIM_CELL_STATUS.PRODUCT_FAILURE,
    [COMPARATIVE_PARITY_STATUS.NOT_MEASURED]: CLAIM_CELL_STATUS.NOT_MEASURED,
  }),
  // incomplete is admissible only for a smoke run (with a stated reason).
  semanticGateStatus: Object.freeze({
    [GATE_STATUS.PASSED]: null,
    [GATE_STATUS.FAILED]: CLAIM_CELL_STATUS.PRODUCT_FAILURE,
    [GATE_STATUS.INCOMPLETE]: CLAIM_CELL_STATUS.INVALID_MEASUREMENT,
  }),
  // Operation outcomes are accounting counts inside a cell, never a cell status.
  operationOutcome: Object.freeze(Object.fromEntries(
    arrayMap(Object.values(OPERATION_OUTCOME), (o) => [o, null]))),
});

const IMAGE_ID_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const REPO_DIGEST_PATTERN = /^[^\s@]+@sha256:[0-9a-f]{64}$/u;
const FORMULA_PATTERNS = Object.freeze([
  /stages\s*\*\s*oneWayMs/iu,
  /execMs\s*\+\s*stages/iu,
  /stages\s*\*\s*\d+/iu,
  /\d+\s*\*\s*stages/iu,
  /delayFormula|bytesFormula|hasDelayFormula/u,
]);
const WINDOW_BREAKING_EVENTS = Object.freeze([
  DEPLOYMENT_EVENT_KIND.RESTART,
  DEPLOYMENT_EVENT_KIND.IMAGE_CHANGE,
]);

function unique(values) {
  return [...new Set(values)].sort();
}

// ---- forensic records and the invalidation ledger ----

function invalidationsCovering(entry, invalidations) {
  return arrayFilter(invalidations, (inv) => {
    const scope = inv.scope;
    if (scope.file !== entry.file) return false;
    if (scope.campaignGitCommit !== null && scope.campaignGitCommit !== entry.campaignGitCommit) {
      return false;
    }
    return scope.receiptIds === 'all' || arrayIncludes(scope.receiptIds, entry.recordId);
  });
}

function invalidationReasons(covering) {
  const reasons = [];
  const defectIds = [];
  for (const inv of covering) {
    reasons.push(`${REASON_PREFIX.INVALIDATED}${inv.id}`, ...inv.reasons);
    defectIds.push(...inv.defectIds);
  }
  return {reasons, defectIds};
}

function forensicEvidence(claim, retainedReferences, invalidations) {
  const wanted = claim.forensicReceiptIds || [];
  const matched = arrayFilter(retainedReferences, (f) => arrayIncludes(wanted, f.recordId));
  const reasons = [];
  const defectIds = [];
  const pointers = arrayMap(matched, (f) => {
    const covering = invalidationsCovering({
      file: f.file, campaignGitCommit: f.campaignGitCommit, recordId: f.recordId,
    }, invalidations);
    const explained = invalidationReasons(covering);
    reasons.push(...explained.reasons);
    defectIds.push(...explained.defectIds);
    return {
      file: f.file,
      receiptId: f.recordId,
      rawObservationsDigest: f.rawObservationsDigest,
      invalidationIds: arrayMap(covering, (inv) => inv.id),
    };
  });
  return {pointers, reasons, defectIds};
}

// ---- v2 run checks ----

// Image ids the header pins for more than one product family: a comparator arm
// that runs the candidate's image (or the reverse) is not a comparison.
function sharedImageIds(pins) {
  const families = new Map();
  for (const pin of pins) {
    families.set(pin.imageId, new Set([...(families.get(pin.imageId) || []), pin.product]));
  }
  return new Set(arrayMap(arrayFilter([...families.entries()], ([, f]) => f.size > 1),
    ([imageId]) => imageId));
}

// Every product the run inspected must be the one the campaign pinned for its
// target and role, identically (image id, repo digest, reported version).
function checkPinnedProducts(run, pins) {
  const reasons = [];
  const shared = sharedImageIds(pins);
  for (const product of run.identity.products) {
    const pin = arrayFind(pins, (p) => p.targetId === run.targetId && p.role === product.role);
    if (!pin || pin.imageId !== product.imageId || pin.repoDigest !== product.repoDigest ||
        pin.reportedVersion !== product.reportedVersion) {
      reasons.push(ADMISSION_REASON.PRODUCT_IDENTITY_MISMATCH);
    }
    if (shared.has(product.imageId) || (pin && shared.has(pin.imageId))) {
      reasons.push(ADMISSION_REASON.CANDIDATE_IMAGE_IS_COMPARATOR_IMAGE);
    }
  }
  return reasons;
}

// Same harness: same commit and executed-driver digest as the campaign header,
// the run's adapters within the header's union over all arms, and neither
// checkout dirty (a dirty checkout is its own typed fact). The campaign itself
// (manifest, execution target) must match as well.
function checkIdentityAgainstHeader(run, header) {
  if (!header) return [ADMISSION_REASON.CAMPAIGN_HEADER_MISSING];
  try {
    validateCampaignHeader(header);
  } catch (err) {
    return [`${REASON_PREFIX.RECORD_REJECTED}${err.code}`];
  }
  const harness = run.identity.harness;
  const reasons = [];
  if (harness.checkoutDirty !== false || header.harness.checkoutDirty !== false) {
    reasons.push(ADMISSION_REASON.CHECKOUT_DIRTY);
  }
  const sameHarness = harness.gitCommit === header.harness.gitCommit &&
    harness.driverSourceSha256 === header.harness.driverSourceSha256 &&
    harness.adapterIds.length > 0 &&
    !arraySome(harness.adapterIds, (id) => !arrayIncludes(header.harness.adapterIds, id));
  if (!sameHarness) reasons.push(ADMISSION_REASON.HARNESS_MISMATCH);
  if (run.plan.manifestDigest !== header.manifestDigest ||
      run.executionTarget !== header.executionTarget) {
    reasons.push(ADMISSION_REASON.IDENTITY_MISMATCH);
  }
  return [...reasons, ...checkPinnedProducts(run, header.products)];
}

function productKey(product) {
  return `${product.host}|${product.containerId}|${product.imageId}|${product.startedAt}`;
}

function checkProducts(run) {
  const reasons = [];
  const running = new Set(arrayMap(run.deployment.roles, (r) => `${r.host}|${r.containerId}`));
  const after = new Set(arrayMap(run.identity.productsAfterWindow, productKey));
  for (const product of run.identity.products) {
    if (!IMAGE_ID_PATTERN.test(product.imageId) ||
        !REPO_DIGEST_PATTERN.test(product.repoDigest)) {
      reasons.push(ADMISSION_REASON.IDENTITY_MISSING);
    }
    if (!running.has(`${product.host}|${product.containerId}`)) {
      reasons.push(ADMISSION_REASON.IDENTITY_NOT_RUNNING);
    }
    if (!after.has(productKey(product))) {
      reasons.push(ADMISSION_REASON.IDENTITY_CHANGED_DURING_WINDOW);
    }
  }
  if (run.identity.productsAfterWindow.length !== run.identity.products.length) {
    reasons.push(ADMISSION_REASON.IDENTITY_CHANGED_DURING_WINDOW);
  }
  return reasons;
}

function hasWindow(run) {
  return run.observations.runStatus === BENCHMARK_RUN_STATUS.COMPLETED ||
    run.observations.runStatus === BENCHMARK_RUN_STATUS.WATCHDOG_STOPPED;
}

// Counts keyed by operation kind, keys sorted, zero counts omitted, so a planned
// and an executed slice compare as one canonical value.
function sortedCounts(counts) {
  return Object.fromEntries(arrayFilter(Object.entries(counts).sort(),
    ([, n]) => n !== 0));
}

function kindCounts(requests) {
  const counts = Object.fromEntries(arrayMap([...new Set(arrayMap(requests,
    (r) => r.operationKind))], (kind) => [kind, 0]));
  for (const r of requests) counts[r.operationKind] += 1;
  return sortedCounts(counts);
}

function checkPlannedSlice(run) {
  const requests = run.observations.requests;
  const reasons = [];
  if (run.plan.operationSliceDigest !== run.observations.executedOperationsDigest) {
    reasons.push(ADMISSION_REASON.EXECUTED_OPERATIONS_MISMATCH);
  }
  if (jsonStringify(kindCounts(arrayFilter(requests,
    (r) => r.outcome !== OPERATION_OUTCOME.UNISSUED))) !==
      jsonStringify(sortedCounts(run.plan.plannedOperationCounts))) {
    reasons.push(ADMISSION_REASON.PLANNED_COUNTS_MISMATCH);
  }
  return reasons;
}

// Every attempt that reached a connection names the deployment's endpoint. An
// attempt the run watchdog closed has no answer and records no endpoint.
function attemptsBoundTo(request, endpointText) {
  return arrayEvery(request.attempts, (a) => (a.closedByWatchdog === true ?
    a.endpoint === null : a.endpoint === endpointText));
}

function checkExecution(run) {
  const reasons = [];
  const deployment = run.deployment;
  const endpoint = deployment.endpoint;
  const endpointText = `${endpoint.host}:${endpoint.port}`;
  if (!arraySome(deployment.roles, (r) =>
    r.containerId === endpoint.containerId && r.host === endpoint.host) ||
      arraySome(run.observations.requests, (r) => !attemptsBoundTo(r, endpointText))) {
    reasons.push(ADMISSION_REASON.ENDPOINT_NOT_BOUND);
  }
  if (arraySome(deployment.roles, (r) => r.host === deployment.loadGenerator.host)) {
    reasons.push(ADMISSION_REASON.LOAD_GENERATOR_ON_PRODUCT_HOST);
  }
  if (arraySome(deployment.events, (e) => arrayIncludes(WINDOW_BREAKING_EVENTS, e.kind))) {
    reasons.push(ADMISSION_REASON.RESTART_DURING_WINDOW);
  }
  if (deployment.closure.status !== CLOSURE_STATUS.COMPLETE) {
    reasons.push(ADMISSION_REASON.CLOSURE_INCOMPLETE);
  }
  if (run.observations.runStatus === BENCHMARK_RUN_STATUS.SETUP_FAILED &&
      run.observations.setup.failureClass === FAILURE_CLASS.HARNESS_FAULT) {
    reasons.push(ADMISSION_REASON.SETUP_HARNESS_FAULT);
  }
  if (!hasWindow(run)) return reasons;
  if (computeExecutedOperationsDigest(run.observations.requests) !==
      run.observations.executedOperationsDigest) {
    reasons.push(ADMISSION_REASON.EXECUTED_OPERATIONS_MISMATCH);
  }
  if (run.observations.runStatus === BENCHMARK_RUN_STATUS.COMPLETED) {
    reasons.push(...checkPlannedSlice(run));
  }
  return reasons;
}

function committedOf(requests, kind) {
  return arrayFilter(requests, (r) =>
    r.outcome === OPERATION_OUTCOME.COMMITTED && r.operationKind === kind);
}

function unresolvedOf(requests, kind) {
  return arrayFilter(requests, (r) =>
    r.outcome === OPERATION_OUTCOME.UNRESOLVED && r.operationKind === kind).length;
}

// The excess of an observed delta over what the committed requests explain must
// lie within what the unresolved requests could have applied, each at most once.
// A delivery that may have committed only lowers new_order, so new_order has no
// lower bound while an unresolved delivery exists.
function withinUnresolvedBounds(excess, requests) {
  const newOrders = unresolvedOf(requests, OLTP_OPERATION_KIND.NEW_ORDER);
  const payments = unresolvedOf(requests, OLTP_OPERATION_KIND.PAYMENT);
  const deliveries = unresolvedOf(requests, OLTP_OPERATION_KIND.DELIVERY);
  const within = (value, max) => value >= 0 && value <= max;
  return within(excess.orders, newOrders) && within(excess.history, payments) &&
    excess.newOrder <= newOrders && (deliveries > 0 || excess.newOrder >= 0);
}

// Orders the committed deliveries delivered, or null when a delivery's effect
// summary is not a count.
function deliveredOrdersOf(requests) {
  let delivered = 0;
  for (const r of committedOf(requests, OLTP_OPERATION_KIND.DELIVERY)) {
    const n = r.effectSummary.deliveredOrders;
    if (typeof n !== 'number' || !Number.isSafeInteger(n) || n < 0) return null;
    delivered += n;
  }
  return delivered;
}

// What the observed table deltas hold beyond the committed requests' effects.
function stateExcess(finalState, requests) {
  const before = finalState.before.tableRows;
  const after = finalState.after.tableRows;
  const delta = (table) => (typeof before[table] === 'number' &&
    typeof after[table] === 'number' ? after[table] - before[table] : null);
  const delivered = deliveredOrdersOf(requests);
  const newOrders = committedOf(requests, OLTP_OPERATION_KIND.NEW_ORDER).length;
  const excess = {
    orders: delta(FINAL_STATE_TABLE.ORDERS) - newOrders,
    history: delta(FINAL_STATE_TABLE.HISTORY) -
      committedOf(requests, OLTP_OPERATION_KIND.PAYMENT).length,
    newOrder: delta(FINAL_STATE_TABLE.NEW_ORDER) - (newOrders - delivered),
  };
  return delivered === null || arraySome(Object.values(excess), (v) => !Number.isFinite(v)) ?
    null : excess;
}

// Final-state reconciliation (model challenge amendment 1): the committed set must
// explain the observed state change exactly, or, when the reconciliation owner
// observed unresolved effects, up to what the unresolved requests can explain.
function checkFinalState(run) {
  const finalState = run.correctness.finalState;
  if (!finalState) return [ADMISSION_REASON.FINAL_STATE_MISSING];
  const ambiguous = finalState.status === OLTP_RECONCILIATION_STATUS.UNRESOLVED_EFFECTS_OBSERVED;
  const excess = ambiguous || finalState.status === OLTP_RECONCILIATION_STATUS.RECONCILED ?
    stateExcess(finalState, run.observations.requests) : null;
  if (!excess) return [ADMISSION_REASON.FINAL_STATE_UNRECONCILED];
  if (!ambiguous) {
    return excess.orders === 0 && excess.history === 0 && excess.newOrder === 0 ? [] :
      [ADMISSION_REASON.FINAL_STATE_UNRECONCILED];
  }
  return withinUnresolvedBounds(excess, run.observations.requests) ?
    [ADMISSION_REASON.UNRESOLVED_EFFECTS_OBSERVED] :
    [ADMISSION_REASON.FINAL_STATE_UNRECONCILED];
}

function gateBindingHolds(run, binding) {
  if (!binding) return false;
  const endpoint = run.deployment.endpoint;
  const product = arrayFind(run.identity.products,
    (p) => p.containerId === endpoint.containerId);
  return binding.campaignId === run.campaignId &&
    binding.containerId === endpoint.containerId &&
    binding.imageId === product?.imageId &&
    binding.endpoint === `${endpoint.host}:${endpoint.port}`;
}

// Capacity runs need a passed gate; a smoke run may carry an incomplete gate,
// which the cell then states. A gate whose proofs are not bound to this run's
// deployment is refused.
function checkSemanticGate(run) {
  const gate = run.correctness.semanticGate;
  if (!gate) return [ADMISSION_REASON.SEMANTIC_GATE_MISSING];
  if (!gateBindingHolds(run, gate.binding)) return [ADMISSION_REASON.SEMANTIC_GATE_UNBOUND];
  if (gate.status === GATE_STATUS.PASSED) return [];
  if (gate.status === GATE_STATUS.FAILED) return [ADMISSION_REASON.SEMANTIC_GATE_FAILED];
  return [gate.status === GATE_STATUS.INCOMPLETE &&
    run.plan.profileClass === BENCHMARK_PROFILE_CLASS.SMOKE ?
    ADMISSION_REASON.SEMANTIC_GATE_INCOMPLETE :
    ADMISSION_REASON.SEMANTIC_GATE_NOT_PASSED];
}

// The executed warm-up (observations.warmup) must be the preregistered one
// (plan.warmup): same operation count and the same executed slice digest.
function warmupMatchesPlan(planned, executed) {
  if (planned.operations === 0) return executed === null || executed === undefined;
  return Boolean(executed) && executed.accounting.offered === planned.operations &&
    executed.executedOperationsDigest === planned.digest;
}

const workloadIdentities = new Map();

// The canonical identity of the recorded workload, derived once per distinct
// workload by the run owner's own derivation.
function workloadIdentityOf(workload) {
  const key = serializeJsonData(workload, {sortKeys: true});
  if (!workloadIdentities.has(key)) {
    workloadIdentities.set(key, describeBenchmarkWorkloadIdentity(workload));
  }
  return workloadIdentities.get(key);
}

function isCanonical(value, expected) {
  return serializeJsonData(value, {sortKeys: true}) ===
    serializeJsonData(expected, {sortKeys: true});
}

// The named profile of the run's (scenario, subkind) from the dispatch owner, or
// null when the family executes no profile.
function workloadProfileOf(run) {
  try {
    return resolveBenchmarkWorkloadProfile(run);
  } catch (err) {
    if (!isBenchmarkDispatchRefusal(err)) throw err;
    return null;
  }
}

// The run executed the named profile of its (scenario, subkind) with that
// profile's class, and its plan digests are the ones its workload derives to.
function checkWorkload(run) {
  const plan = run.plan;
  const profile = workloadProfileOf(run);
  if (!profile || profile.id !== plan.workloadProfileId ||
      profile.profileClass !== plan.profileClass ||
      (profile.ownsWorkload && !isCanonical(plan.workload, profile.workload))) {
    return [ADMISSION_REASON.WORKLOAD_PROFILE_MISMATCH];
  }
  let identity;
  try {
    identity = workloadIdentityOf(plan.workload);
  } catch {
    // A recorded workload the owner cannot derive is not the canonical workload.
    return [ADMISSION_REASON.WORKLOAD_IDENTITY_MISMATCH];
  }
  const same = identity.datasetDigest === plan.datasetDigest &&
    identity.workloadPlanDigest === plan.workloadPlanDigest &&
    identity.measurementPlanDigest === plan.measurementPlanDigest &&
    identity.operationSliceDigest === plan.operationSliceDigest &&
    isCanonical(sortedCounts(identity.plannedOperationCounts),
      sortedCounts(plan.plannedOperationCounts));
  return same ? [] : [ADMISSION_REASON.WORKLOAD_IDENTITY_MISMATCH];
}

function checkScenarioA(run) {
  const plan = run.plan;
  const reasons = [...checkWorkload(run)];
  if (plan.semanticProfileId !== OLTP_SCENARIO_A_SEMANTIC_PROFILE.id ||
      plan.semanticProfileDigest !== hashScenarioASemanticProfile()) {
    reasons.push(ADMISSION_REASON.SEMANTIC_PROFILE_MISMATCH);
  }
  if (plan.retryPolicyId !== OLTP_PAIRED_RETRY_POLICY.id ||
      plan.openLoopProfileId !== OLTP_OPEN_LOOP_PROFILE.id) {
    reasons.push(ADMISSION_REASON.NON_CANONICAL_WORKLOAD);
  }
  if (plan.profileClass === BENCHMARK_PROFILE_CLASS.CAPACITY) {
    if (plan.sweepPlanDigest === null) reasons.push(ADMISSION_REASON.SWEEP_PLAN_MISSING);
    if (!warmupMatchesPlan(plan.warmup, run.observations.warmup)) {
      reasons.push(ADMISSION_REASON.WARMUP_PLAN_MISMATCH);
    }
  }
  // A run stopped before its window has no gate verdict or final state to check;
  // it is published as the product failure it is.
  if (run.observations.runStatus === BENCHMARK_RUN_STATUS.COMPLETED) {
    reasons.push(...checkSemanticGate(run), ...checkFinalState(run));
  }
  return reasons;
}

function checkDeployment(run, claim) {
  const deployment = run.deployment;
  const reasons = [];
  // An exhausted readiness is the product failure of a run that never measured;
  // a run that measured on an unready deployment is not a measurement.
  if (deployment.readiness.state !== READINESS_STATE.READY &&
      !isReadinessExhaustedRun(run)) {
    reasons.push(ADMISSION_REASON.READINESS_UNVERIFIED);
  }
  const v = deployment.dataset.verification;
  if (run.observations.runStatus !== BENCHMARK_RUN_STATUS.SETUP_FAILED &&
      (v.status !== OLTP_DATASET_VERIFICATION_STATUS.VERIFIED ||
      v.observedLogicalChecksum !== v.expectedLogicalChecksum ||
      jsonStringify(v.observedTableRows) !== jsonStringify(v.expectedTableRows))) {
    reasons.push(ADMISSION_REASON.DATASET_UNVERIFIED);
  }
  const hostsById = new Map(arrayMap(deployment.hosts, (h) => [h.hostId, h]));
  const roleHosts = arrayMap(deployment.roles, (r) => hostsById.get(r.host));
  const distinctMachines = new Set(arrayMap(arrayFilter(roleHosts, Boolean), (h) => h.bootId));
  if (arraySome(roleHosts, (h) => !h) || distinctMachines.size < claim.minDistinctHosts) {
    reasons.push(ADMISSION_REASON.TOPOLOGY_MISMATCH);
  }
  const declared = jsonStringify({plan: run.plan, deployment});
  if (arraySome(FORMULA_PATTERNS, (p) => p.test(declared))) {
    reasons.push(ADMISSION_REASON.DELAY_OR_BYTE_FORMULA);
  }
  return reasons;
}

function isReadinessExhaustedRun(run) {
  return run.deployment.readiness.state === READINESS_STATE.EXHAUSTED &&
    run.observations.runStatus === BENCHMARK_RUN_STATUS.SETUP_FAILED;
}

function checkRun(entry, claim, context) {
  const run = entry.run;
  try {
    validateRunRecord(run);
  } catch (err) {
    return [`${REASON_PREFIX.RECORD_REJECTED}${err.code || 'invalid'}`];
  }
  const reasons = [];
  if (computeRunObservationsDigest(run) !== run.rawObservationsDigest) {
    reasons.push(ADMISSION_REASON.RAW_DIGEST_MISMATCH);
  }
  const header = context.campaignHeaders.get(run.campaignId) || null;
  reasons.push(...checkIdentityAgainstHeader(run, header), ...checkProducts(run),
    ...checkExecution(run));
  if (hasWindow(run) && run.observations.accounting.issued === 0) {
    reasons.push(ADMISSION_REASON.NO_ISSUED_OPERATIONS);
  }
  if (run.scenario !== claim.scenario) reasons.push(ADMISSION_REASON.WRONG_DISPATCH_FAMILY);
  if (claim.scenario === BENCHMARK_SCENARIO.A) reasons.push(...checkScenarioA(run));
  reasons.push(...checkDeployment(run, claim));
  return reasons;
}

function checkRunSet(entries) {
  const reasons = [];
  const runs = arrayMap(entries, (e) => e.run || {});
  if (new Set(arrayMap(runs, (r) => r.campaignId)).size > 1) {
    reasons.push(ADMISSION_REASON.MIXED_CAMPAIGN);
  }
  const profileKey = (r) => jsonStringify([r.plan?.semanticProfileId, r.plan?.profileClass,
    r.plan?.datasetDigest, r.plan?.workloadPlanDigest, r.plan?.measurementPlanDigest,
    r.plan?.sweepPlanDigest]);
  if (new Set(arrayMap(runs, profileKey)).size > 1) reasons.push(ADMISSION_REASON.MIXED_PROFILE);
  if (new Set(arrayMap(runs, (r) => r.claimKey)).size < runs.length) {
    reasons.push(ADMISSION_REASON.DUPLICATE_CLAIM);
  }
  return reasons;
}

// ---- metrics and sufficiency ----

// Sums run accountings field by field; every run carries the same fields
// (validated by the outcome owner), so the first run fixes the shape.
function sumAccounting(runMetrics) {
  const first = runMetrics[0].accounting;
  const total = {...first, terminalFailures: {...first.terminalFailures}};
  for (const m of runMetrics.slice(1)) {
    for (const [key, value] of Object.entries(m.accounting)) {
      if (typeof value === 'number') total[key] += value;
    }
    for (const [cls, n] of Object.entries(m.accounting.terminalFailures)) {
      total.terminalFailures[cls] += n;
    }
  }
  return total;
}

// Counts-only view of a run: what a smoke or insufficient run may publish.
function countsOnly(m) {
  return {
    runId: m.runId, runStatus: m.runStatus, offeredRatePerSec: m.offeredRatePerSec,
    repetition: m.repetition,
    accounting: m.accounting, drainOverrunMs: m.drainOverrunMs, maxLatencyMs: m.maxLatencyMs,
  };
}

function isSufficient(runMetrics) {
  if (arraySome(runMetrics, (m) => m.accounting.committed < SUFFICIENCY_RULE.minCommittedPerRun)) {
    return false;
  }
  const repsByRate = new Map();
  for (const m of runMetrics) {
    const reps = repsByRate.get(m.offeredRatePerSec) || new Set();
    reps.add(m.repetition);
    repsByRate.set(m.offeredRatePerSec, reps);
  }
  return !arraySome([...repsByRate.values()],
    (reps) => reps.size < SUFFICIENCY_RULE.minRepetitionsPerRate);
}

function dispersionByRate(runMetrics) {
  const byRate = new Map();
  for (const m of runMetrics) {
    byRate.set(m.offeredRatePerSec, [...(byRate.get(m.offeredRatePerSec) || []),
      m.committedPerSec]);
  }
  return arrayMap([...byRate.entries()].sort((a, b) => a[0] - b[0]), ([rate, values]) => ({
    offeredRatePerSec: rate,
    repetitions: values.length,
    committedPerSec: {
      min: Math.min(...values),
      max: Math.max(...values),
      mean: Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(3)),
    },
  }));
}

function buildCell(claim, status, {reasons = [], defectIds = [], evidence, metrics = null}) {
  return {
    claimKey: claim.claimKey,
    claimKind: claim.claimKind,
    status,
    reasons: unique(reasons),
    defectIds: unique(defectIds),
    evidence,
    metrics: arrayIncludes(METRIC_BEARING_STATUSES, status) ? metrics : null,
  };
}

function failureReasons(entries, accounting) {
  const reasons = [];
  for (const e of entries) {
    const stopped = isReadinessExhaustedRun(e.run) ? ADMISSION_REASON.READINESS_EXHAUSTED :
      STOPPED_RUN_REASON[e.run.observations.runStatus];
    if (stopped) reasons.push(stopped);
    if (e.run.correctness.semanticGate?.status === GATE_STATUS.FAILED) {
      reasons.push(ADMISSION_REASON.SEMANTIC_GATE_FAILED);
    }
  }
  if (accounting.committed === 0) reasons.push(ADMISSION_REASON.NO_COMMITTED_OPERATIONS);
  // A well-formed answer with the wrong content violates the workload contract:
  // the run is the product failure it observed, never a valid measurement.
  if (accounting.terminalFailures[FAILURE_CLASS.CORRECTNESS_FAILURE] > 0) {
    reasons.push(ADMISSION_REASON.CORRECTNESS_FAILURES_OBSERVED);
  }
  return reasons;
}

function admittedCell(claim, entries, evidence, defectIds, notes) {
  const runMetrics = arrayMap(entries, (e) => deriveRunMetrics(e.run));
  const accounting = sumAccounting(runMetrics);
  const profileClass = entries[0].run.plan.profileClass;
  const setupFailures = arrayMap(arrayFilter(entries, (e) => e.run.observations.setup),
    (e) => ({runId: e.run.runId, ...e.run.observations.setup}));
  const counts = {profileClass, sufficiencyRuleId: SUFFICIENCY_RULE.id, accounting,
    runs: arrayMap(runMetrics, countsOnly), setupFailures, capacity: null};
  const failed = failureReasons(entries, accounting);
  if (failed.length > 0) {
    return buildCell(claim, CLAIM_CELL_STATUS.PRODUCT_FAILURE,
      {reasons: [...failed, ...notes], defectIds, evidence, metrics: counts});
  }
  if (profileClass === BENCHMARK_PROFILE_CLASS.SMOKE) {
    return buildCell(claim, CLAIM_CELL_STATUS.VALID_OBSERVED, {
      reasons: [ADMISSION_REASON.SMOKE_PROFILE, ...notes], defectIds, evidence, metrics: counts,
    });
  }
  if (!isSufficient(runMetrics)) {
    return buildCell(claim, CLAIM_CELL_STATUS.VALID_OBSERVED, {
      reasons: [ADMISSION_REASON.INSUFFICIENT_SAMPLES, ...notes], defectIds, evidence,
      metrics: counts,
    });
  }
  return buildCell(claim, CLAIM_CELL_STATUS.VALID_OBSERVED, {reasons: notes, defectIds, evidence,
    metrics: {...counts, runs: runMetrics, capacity: {byRate: dispersionByRate(runMetrics)}}});
}

function cellWithoutLiveRuns(claim, forensic, extra) {
  const evidence = {
    runIds: extra.runIds, rawObservationsDigests: extra.digests, forensic: forensic.pointers,
  };
  const reasons = [...forensic.reasons, ...extra.reasons];
  const defectIds = [...forensic.defectIds, ...extra.defectIds];
  if (claim.declared) {
    return buildCell(claim, claim.declared.status,
      {reasons: [claim.declared.reason, ...reasons], defectIds, evidence});
  }
  if (forensic.pointers.length > 0 || extra.runIds.length > 0) {
    const forensicReason = forensic.pointers.length > 0 ? [ADMISSION_REASON.FORENSIC_RECORD] : [];
    return buildCell(claim, CLAIM_CELL_STATUS.INVALID_MEASUREMENT,
      {reasons: [...forensicReason, ...reasons], defectIds, evidence});
  }
  return buildCell(claim, CLAIM_CELL_STATUS.NOT_MEASURED,
    {reasons: [ADMISSION_REASON.NO_OBSERVATION], evidence});
}

function partitionByLedger(entries, campaignHeaders, invalidations) {
  const live = [];
  const invalidated = {runIds: [], digests: [], reasons: [], defectIds: []};
  for (const entry of entries) {
    const header = campaignHeaders.get(entry.run?.campaignId);
    const covering = invalidationsCovering({
      file: entry.file, campaignGitCommit: header?.harness?.gitCommit ?? null,
      recordId: entry.run?.runId,
    }, invalidations);
    if (covering.length === 0) {
      live.push(entry);
      continue;
    }
    const explained = invalidationReasons(covering);
    invalidated.runIds.push(entry.run.runId);
    invalidated.digests.push(entry.run.rawObservationsDigest);
    invalidated.reasons.push(...explained.reasons);
    invalidated.defectIds.push(...explained.defectIds);
  }
  return {live, invalidated};
}

/**
 * Admit one claim.
 * @param {{claim: Object, runs: Array<{file: string, run: Object}>,
 *   campaignHeaders: Map<string, Object>, retainedReferences: Array<Object>,
 *   invalidations: Array<Object>}} input
 * @return {Object} The admission cell.
 */
function admitClaim({claim, runs, campaignHeaders, retainedReferences, invalidations}) {
  const forensic = forensicEvidence(claim, retainedReferences, invalidations);
  const entries = arrayFilter(runs, (e) =>
    e.run?.targetId === claim.targetId && e.run?.subkind === claim.subkind);
  const {live, invalidated} = partitionByLedger(entries, campaignHeaders, invalidations);
  if (live.length === 0) return cellWithoutLiveRuns(claim, forensic, invalidated);
  const evidence = {
    runIds: arrayMap(live, (e) => e.run.runId),
    rawObservationsDigests: arrayMap(live, (e) => e.run.rawObservationsDigest),
    invalidatedRunIds: invalidated.runIds,
    forensic: forensic.pointers,
  };
  const defectIds = [...forensic.defectIds, ...invalidated.defectIds];
  if (!arrayIncludes(ADMISSIBLE_CLAIM_KINDS, claim.claimKind)) {
    return buildCell(claim, CLAIM_CELL_STATUS.NOT_MEASURED, {
      reasons: [ADMISSION_REASON.CLAIM_KIND_NOT_OBSERVED], defectIds, evidence,
    });
  }
  const reasons = [...checkRunSet(live)];
  for (const entry of live) reasons.push(...checkRun(entry, claim, {campaignHeaders}));
  if (arraySome(reasons, (r) => !arrayIncludes(NON_BLOCKING_REASONS, r))) {
    return buildCell(claim, CLAIM_CELL_STATUS.INVALID_MEASUREMENT,
      {reasons, defectIds, evidence});
  }
  const notes = arrayFilter(unique(reasons), (r) => r !== ADMISSION_REASON.SEMANTIC_GATE_FAILED);
  return admittedCell(claim, live, evidence, defectIds, notes);
}

/**
 * The outcome of a campaign from its cells: PASSED only when at least one cell is
 * valid-observed and every other cell is a declared blocked/unsupported entry; a
 * campaign of only non-valid cells never reads as passed.
 * @param {Array<Object>} cells
 * @return {string} One of SCENARIO_OUTCOME.
 */
function campaignOutcomeOfCells(cells) {
  const statuses = arrayMap(cells, (c) => c.status);
  if (arraySome(statuses, (s) => s === CLAIM_CELL_STATUS.INVALID_MEASUREMENT ||
    s === CLAIM_CELL_STATUS.PRODUCT_FAILURE)) {
    return SCENARIO_OUTCOME.FAILED;
  }
  const valid = arraySome(statuses, (s) => s === CLAIM_CELL_STATUS.VALID_OBSERVED);
  const onlyDeclaredOthers = !arraySome(statuses, (s) => s === CLAIM_CELL_STATUS.NOT_MEASURED);
  return valid && onlyDeclaredOthers ? SCENARIO_OUTCOME.PASSED : SCENARIO_OUTCOME.REFUSED;
}

export {
  ADMISSIBLE_CLAIM_KINDS,
  ADMISSION_REASON,
  CELL_STATUS_MAPPING,
  CLAIM_CELL_STATUS,
  CLAIM_KIND,
  METRIC_BEARING_STATUSES,
  REASON_PREFIX,
  SUFFICIENCY_RULE,
  admitClaim,
  campaignOutcomeOfCells,
};
