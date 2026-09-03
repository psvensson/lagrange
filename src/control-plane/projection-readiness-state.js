import {
  PROJECTION_READINESS_SEMANTIC_OWNER,
} from './projection-readiness-constants.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from './control-plane-readiness-constants.js';
import {
  buildProjectionReadinessDecision,
} from './projection-readiness-decision.js';
import {
  buildProjectionReadinessEvidence,
  pickProjectionReadinessEvidenceSource,
} from './projection-readiness-evidence.js';
import {trackSyncSection} from '../diagnostics/event-loop-gap-watchdog.js';

// Sync-section attribution (instrumentation-only, projection-readiness
// re-measurement): a miss on the entry-identity memo pays the full
// normalize/freeze; the per-window count vs the owner sections tells whether
// callers mint fresh readiness entries per read.
const PROJECTION_READINESS_ENTRY_MEMO_MISS_BUILD_SECTION =
  'projection_readiness_entry_memo_miss_build';

const ArrayConstructor = Array;
const arrayIsArray = Array.isArray;
const objectDefineProperty = Object.defineProperty;
const objectFreeze = Object.freeze;
const stringConstructor = String;
const WeakSetConstructor = WeakSet;
const weakSetAdd = Function.call.bind(WeakSet.prototype.add);
const weakSetHas = Function.call.bind(WeakSet.prototype.has);

function appendProjectionReadinessStateValue(values, value) {
  objectDefineProperty(values, values.length, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  });
}

// The owner-product registry: every state THIS builder produced. Embedded-core
// consumption admits ONLY these (independent verification finding, review
// 56422fa5: duck-typing on a `lanes` key admitted the hand-rolled DEFERRED
// planning stubs — the null-source stub crashes the projection on its empty
// lanes, and the completed-source live-veto stub disagrees with its entry's
// own evidence and flipped a projection admission. Neither is a builder
// product, so both now take the full-rebuild fallback — the exact pre-repair
// behavior. A semanticOwner string brand would NOT work: the veto stub copies
// that string from the contract it wraps).
const OWNER_BUILT_PROJECTION_STATES = new WeakSetConstructor();

function buildProjectionReadinessState(source = {}) {
  const evidence = buildProjectionReadinessEvidence(source);
  const decision = buildProjectionReadinessDecision(evidence);
  const state = objectFreeze({
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
  weakSetAdd(OWNER_BUILT_PROJECTION_STATES, state);
  return state;
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

// Quest projection-readiness-planning-consumption-owner: a readiness entry
// that embeds the owner-built frozen core is consumed THROUGH that core —
// the single semantic owner's product by reference — never by re-normalizing
// the entry. Entry-LOCAL planning facts (today exactly the
// priority-recovery-pending publication overlay,
// dimensions[CONTROL_PLANE_RECOVERY_ELIGIBLE]=true spliced by
// buildPublicationPlanningReadinessEntry) compose as a cheap frozen envelope
// over the core with visible provenance. The envelope deliberately does NOT
// recompute the decision lanes: the overlay's only lane consumer is the
// repair-lane blocker, and no planning consumer of this resolved state reads
// the repair lane or state classification (B1 receipts pin the consumed
// surface). The full normalization below remains ONLY for genuinely
// contract-less entries — and doubles as the equivalence oracle in receipts.
function composePlanningEntryProjectionState(entry, core) {
  const overlayExtendsRecoveryEligibility =
    entry.dimensions?.[
      CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE
    ] === true &&
    core.evidence?.recoveryEligible !== true;
  if (!overlayExtendsRecoveryEligibility) {
    return core;
  }
  return objectFreeze({
    ...core,
    evidence: objectFreeze({...core.evidence, recoveryEligible: true}),
    readiness: objectFreeze({...core.readiness, recoveryEligible: true}),
    planningRecoveryEligibleOverride: true,
  });
}

function resolveProjectionReadinessStateForEntry(readinessEntry) {
  const source = readinessEntry && typeof readinessEntry === 'object' ?
    readinessEntry :
    EMPTY_PROJECTION_READINESS_SOURCE;
  const memoized = PROJECTION_READINESS_STATE_BY_ENTRY.get(source);
  if (memoized) {
    return memoized;
  }
  const embeddedCore = source.projectionReadinessContract;
  if (weakSetHas(OWNER_BUILT_PROJECTION_STATES, embeddedCore)) {
    const composed = composePlanningEntryProjectionState(source, embeddedCore);
    PROJECTION_READINESS_STATE_BY_ENTRY.set(source, composed);
    return composed;
  }
  const state = trackSyncSection(
    PROJECTION_READINESS_ENTRY_MEMO_MISS_BUILD_SECTION,
    () => buildProjectionReadinessState(source),
  );
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
  pickProjectionReadinessEvidenceSource,
  resolveProjectionReadinessStateForEntry,
  summarizeProjectionReadinessContractForHistory,
};
