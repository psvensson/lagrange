import {
  PROJECTION_READINESS_SEMANTIC_OWNER,
} from './projection-readiness-constants.js';
import {
  buildProjectionReadinessDecision,
} from './projection-readiness-decision.js';
import {
  buildProjectionReadinessEvidence,
} from './projection-readiness-evidence.js';

const ArrayConstructor = Array;
const arrayIsArray = Array.isArray;
const objectDefineProperty = Object.defineProperty;
const objectFreeze = Object.freeze;
const stringConstructor = String;

function appendProjectionReadinessStateValue(values, value) {
  objectDefineProperty(values, values.length, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  });
}

function buildProjectionReadinessState(source = {}) {
  const evidence = buildProjectionReadinessEvidence(source);
  const decision = buildProjectionReadinessDecision(evidence);
  return objectFreeze({
    semanticOwner: PROJECTION_READINESS_SEMANTIC_OWNER,
    state: decision.state,
    ready: decision.ready,
    recoveryOpen: decision.recoveryOpen,
    activeGate: decision.activeGate,
    lanes: decision.lanes,
    publication: objectFreeze({
      ready: evidence.publicationReady,
      ownerStream: evidence.publicationOwnerStream,
      streamOutcome: evidence.publicationStreamOutcome,
      recoveryOutcome: evidence.publicationRecoveryOutcome,
      freshnessFence: evidence.publicationFreshnessFence,
      revisionState: evidence.publicationRevisionState,
      boundaryOutcome: evidence.publicationBoundaryOutcome,
    }),
    readiness: objectFreeze({
      internalReady: decision.lanes.internal.ready === true,
      repairEligible: evidence.repairEligible,
      recoveryEligible: evidence.recoveryEligible,
      serveEligible: decision.lanes.serve.ready === true,
      runtimeServeEligible: evidence.runtimeServeEligible,
      operatorReady: decision.lanes.operator.ready === true,
    }),
    priorityRecovery: objectFreeze({
      active: evidence.priorityRecoveryActive,
      durableSpreadPending: evidence.durablePrioritySpreadPending,
      reasonCodes: evidence.priorityRecoveryReasonCodes,
      outcome: evidence.priorityRecovery,
    }),
    projectionRevision: evidence.projectionRevision,
    evidence,
    reasonCodes: decision.reasonCodes,
  });
}

function buildProjectionReadinessContract(source = {}) {
  return buildProjectionReadinessState(source);
}

// Per-node projection state is rebuilt twice per candidate-derivation pass
// (active-node selection plus the isCanonicallyActiveNode re-check) and once
// more per readiness evaluation — live-profiled at half the residual seed
// freeze cost (archived run run-2026-08-15T16-36-59-912Z-profiled-manual).
// The state is a pure frozen derivation of the readiness entry, so entry
// identity is an exact memo key; readiness entries are frozen snapshots in
// production, and a caller that mints fresh entries per read simply misses.
const PROJECTION_READINESS_STATE_BY_ENTRY = new WeakMap();
const EMPTY_PROJECTION_READINESS_SOURCE = objectFreeze({});

function resolveProjectionReadinessStateForEntry(readinessEntry) {
  const source = readinessEntry && typeof readinessEntry === 'object' ?
    readinessEntry :
    EMPTY_PROJECTION_READINESS_SOURCE;
  const memoized = PROJECTION_READINESS_STATE_BY_ENTRY.get(source);
  if (memoized) {
    return memoized;
  }
  const state = buildProjectionReadinessState(source);
  PROJECTION_READINESS_STATE_BY_ENTRY.set(source, state);
  return state;
}

function normalizeSummaryReasonCodes(reasonCodes) {
  const normalized = new ArrayConstructor();
  const source = arrayIsArray(reasonCodes) ? reasonCodes : normalized;
  for (let index = 0; index < source.length; index++) {
    const code = stringConstructor(source[index]);
    if (code) appendProjectionReadinessStateValue(normalized, code);
  }
  return objectFreeze(normalized);
}

/**
 * Compact contract form for HISTORY entries (CL-031(d)).
 *
 * The full contract embeds its entire evidence chain (publication
 * boundary/stream/recovery outcomes + the raw evidence object) — ~0.5MB and
 * growing with run depth. Readiness histories keep up to 32 entries per node
 * embedding TWO contracts each, served on every admin control snapshot:
 * gate 220403Z measured 34MB per node entry and 100MB+ snapshot frames that
 * OOM-killed nodes cluster-wide. History entries therefore carry this
 * bounded summary — states, eligibility booleans, reason codes — with the
 * omission VISIBLE via contractDetailOmitted (never silent). The LIVE
 * readiness entry keeps the full contract: gates read current state, not
 * history.
 */
function summarizeProjectionReadinessContractForHistory(contract) {
  if (!contract || typeof contract !== 'object') {
    return null;
  }
  return objectFreeze({
    semanticOwner: contract.semanticOwner ?? null,
    state: contract.state ?? null,
    ready: contract.ready === true,
    recoveryOpen: contract.recoveryOpen === true,
    activeGate: objectFreeze({
      state: contract.activeGate?.state ?? null,
    }),
    publication: objectFreeze({
      ready: contract.publication?.ready === true,
      revisionState: contract.publication?.revisionState ?? null,
    }),
    readiness: objectFreeze({
      serveEligible: contract.readiness?.serveEligible === true,
      repairEligible: contract.readiness?.repairEligible === true,
      recoveryEligible: contract.readiness?.recoveryEligible === true,
    }),
    priorityRecovery: objectFreeze({
      active: contract.priorityRecovery?.active === true,
      durableSpreadPending:
        contract.priorityRecovery?.durableSpreadPending === true,
      reasonCodes: normalizeSummaryReasonCodes(
        contract.priorityRecovery?.reasonCodes,
      ),
    }),
    projectionRevision: contract.projectionRevision ?? null,
    reasonCodes: normalizeSummaryReasonCodes(contract.reasonCodes),
    contractDetailOmitted: true,
  });
}

export {
  buildProjectionReadinessContract,
  buildProjectionReadinessState,
  resolveProjectionReadinessStateForEntry,
  summarizeProjectionReadinessContractForHistory,
};
