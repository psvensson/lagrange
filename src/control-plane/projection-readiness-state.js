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

export {
  buildProjectionReadinessContract,
  buildProjectionReadinessState,
};
