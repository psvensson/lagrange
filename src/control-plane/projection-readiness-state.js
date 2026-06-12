import {
  PROJECTION_READINESS_SEMANTIC_OWNER,
} from './projection-readiness-constants.js';
import {
  buildProjectionReadinessDecision,
} from './projection-readiness-decision.js';
import {
  buildProjectionReadinessEvidence,
} from './projection-readiness-evidence.js';

function buildProjectionReadinessState(source = {}) {
  const evidence = buildProjectionReadinessEvidence(source);
  const decision = buildProjectionReadinessDecision(evidence);
  return Object.freeze({
    semanticOwner: PROJECTION_READINESS_SEMANTIC_OWNER,
    state: decision.state,
    ready: decision.ready,
    recoveryOpen: decision.recoveryOpen,
    activeGate: decision.activeGate,
    lanes: decision.lanes,
    publication: Object.freeze({
      ready: evidence.publicationReady,
      ownerStream: evidence.publicationOwnerStream,
      streamOutcome: evidence.publicationStreamOutcome,
      recoveryOutcome: evidence.publicationRecoveryOutcome,
      freshnessFence: evidence.publicationFreshnessFence,
      revisionState: evidence.publicationRevisionState,
      boundaryOutcome: evidence.publicationBoundaryOutcome,
    }),
    readiness: Object.freeze({
      internalReady: decision.lanes.internal.ready === true,
      repairEligible: evidence.repairEligible,
      recoveryEligible: evidence.recoveryEligible,
      serveEligible: decision.lanes.serve.ready === true,
      runtimeServeEligible: evidence.runtimeServeEligible,
      operatorReady: decision.lanes.operator.ready === true,
    }),
    priorityRecovery: Object.freeze({
      active: evidence.priorityRecoveryActive,
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

function normalizeSummaryReasonCodes(reasonCodes) {
  return Object.freeze(
    Array.isArray(reasonCodes) ?
      reasonCodes.map((code) => String(code)).filter(Boolean) :
      [],
  );
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
  return Object.freeze({
    semanticOwner: contract.semanticOwner ?? null,
    state: contract.state ?? null,
    ready: contract.ready === true,
    recoveryOpen: contract.recoveryOpen === true,
    activeGate: Object.freeze({
      state: contract.activeGate?.state ?? null,
    }),
    publication: Object.freeze({
      ready: contract.publication?.ready === true,
      revisionState: contract.publication?.revisionState ?? null,
    }),
    readiness: Object.freeze({
      serveEligible: contract.readiness?.serveEligible === true,
      repairEligible: contract.readiness?.repairEligible === true,
      recoveryEligible: contract.readiness?.recoveryEligible === true,
    }),
    priorityRecovery: Object.freeze({
      active: contract.priorityRecovery?.active === true,
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
  summarizeProjectionReadinessContractForHistory,
};
