/**
 * Owner contract:
 * Owner: PriorityRecoveryObservation owns observed priority-recovery diagnostics.
 * Inputs: decision snapshots, publication evidence, active gates, partition witnesses.
 * Canonical output: observation snapshots and partition witness summaries.
 * Prohibited fallbacks: do not invent semantic state when canonical evidence is absent.
 * Primary tests: test/control-plane/priority-recovery-snapshot.test.js.
 */
import {CONTROL_PLANE_PUBLICATION_STATUS} from './control-plane-publication-merge.js';
import {RECOVERY_PROTOCOL_STATE} from './membership-lifecycle-constants.js';
import {buildPriorityRecoveryPressureConditions} from './priority-recovery-helpers.js';
import {
  buildPriorityRecoveryClosureWitness,
  buildTrackedPriorityRecoveryDecisionSnapshots,
} from './priority-recovery-snapshot.js';
import {LOCAL_EMPTY_LIST, PRIORITY_RECOVERY_CURRENT_SUMMARY_SCOPE, isRecord, normalizeDistinctStringArray, normalizeNonNegativeInteger, normalizePriorityRecoveryInvariantSummary, resolvePendingRequiredAckNodeIds} from './priority-recovery-observation-normalization.js';
import {buildPriorityRecoveryPartitionWitnesses} from './priority-recovery-observation-partition-witness.js';
import {hasSelectedMissingPublishedEvidence, resolveObservationActiveGateContext, resolveObservationClosureField, resolveObservationPriorityPartitionSummary, resolveObservationPriorityRecoveryBlockedPartitionIds, resolveObservationPriorityRecoveryClosureWitness, resolveObservationPriorityRecoveryReasonCodes, resolveObservationPublicationConvergenceGate, resolveProjectionDiagnostics, resolveSelectedMissingPublishedEvidence, shouldApplyObservationClosureWitness} from './priority-recovery-observation-gate-resolution.js';

const PRIORITY_RECOVERY_OBSERVATION_CLOSURE_FIELD = Object.freeze({
  RECORD_ID: 'closureRecordId',
  WITNESS_CLASS: 'closureWitnessClass',
});

function resolveObservationRecoveryProtocolState(
  publicationConvergence = null,
  publicationConvergenceGate = null,
  prioritySpreadPending = false,
) {
  const publicationStatus = String(
    publicationConvergence?.publicationStatus ||
      publicationConvergence?.status ||
      publicationConvergenceGate?.publicationStatus ||
      '',
  ).toUpperCase();
  if (
    publicationStatus === CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED &&
    prioritySpreadPending === true
  ) {
    return RECOVERY_PROTOCOL_STATE.PRIORITY_SPREAD_PENDING;
  }
  return publicationConvergence?.recoveryProtocolState ||
    publicationConvergence?.membershipLifecycleSummary?.recoveryProtocolState ||
    publicationConvergenceGate?.recoveryProtocolState ||
    null;
}

function resolveObservationInputClosureWitness(
  options,
  publicationConvergence,
  trackedDecisionSnapshots,
) {
  if (isRecord(options.priorityRecoveryClosureWitness)) {
    return options.priorityRecoveryClosureWitness;
  }
  if (isRecord(trackedDecisionSnapshots?.closureWitness)) {
    return trackedDecisionSnapshots.closureWitness;
  }
  if (isRecord(options.publicationConvergenceGate?.priorityRecoveryClosureWitness)) {
    return options.publicationConvergenceGate.priorityRecoveryClosureWitness;
  }
  if (isRecord(publicationConvergence?.priorityRecoveryClosureWitness)) {
    return publicationConvergence.priorityRecoveryClosureWitness;
  }
  return buildPriorityRecoveryClosureWitness({
    decisionSnapshots: trackedDecisionSnapshots,
    priorityPartitionSummary:
      options.publicationConvergenceGate?.priorityPartitionSummary ||
      publicationConvergence?.priorityPartitionSummary,
  });
}

function buildPriorityRecoveryObservationSnapshot(options = {}) {
  const publicationConvergence = isRecord(options.publicationConvergence) ?
    options.publicationConvergence :
    null;
  const trackedPriorityRecoveryDecisionSnapshots =
    buildTrackedPriorityRecoveryDecisionSnapshots(
      options.priorityRecoveryDecisionSnapshots,
    );
  const priorityRecoveryClosureWitness =
    resolveObservationInputClosureWitness(
      options,
      publicationConvergence,
      trackedPriorityRecoveryDecisionSnapshots,
    );
  const observationOptions = {
    ...options,
    priorityRecoveryDecisionSnapshots:
      trackedPriorityRecoveryDecisionSnapshots,
    priorityRecoveryClosureWitness,
  };
  const publicationConvergenceGate = resolveObservationPublicationConvergenceGate(
    observationOptions,
    publicationConvergence,
    options.publicationConvergenceGate,
  );
  const priorityRecoveryCurrentSummary = Object.freeze({
    scope:
      PRIORITY_RECOVERY_CURRENT_SUMMARY_SCOPE.TRACKED_PRIORITY_PARTITIONS,
    ...buildPriorityRecoveryPartitionWitnesses(
      trackedPriorityRecoveryDecisionSnapshots,
    ),
  });
  const priorityRecoveryInvariants = normalizePriorityRecoveryInvariantSummary(
    options.priorityRecoveryInvariants,
  );
  const resolvedPriorityRecoveryClosureWitness =
    resolveObservationPriorityRecoveryClosureWitness(
      observationOptions,
      publicationConvergence,
      publicationConvergenceGate,
    );
  const applyClosureWitness =
    shouldApplyObservationClosureWitness(resolvedPriorityRecoveryClosureWitness);
  const priorityPartitionSummary = resolveObservationPriorityPartitionSummary(
    publicationConvergence,
    publicationConvergenceGate,
    resolvedPriorityRecoveryClosureWitness,
  );
  const priorityRecoveryReasonCodes =
    resolveObservationPriorityRecoveryReasonCodes(
      publicationConvergence,
      publicationConvergenceGate,
      resolvedPriorityRecoveryClosureWitness,
    );
  const activeGateContext = resolveObservationActiveGateContext(observationOptions);
  const priorityRecoveryUnresolvedPartitionIds =
    priorityRecoveryCurrentSummary.blockedPartitionIds;
  const priorityRecoveryBlockedPartitionIds =
    resolveObservationPriorityRecoveryBlockedPartitionIds(
      priorityPartitionSummary,
      priorityRecoveryCurrentSummary,
    );
  const hasRequiredAckNodeEvidence =
    Array.isArray(publicationConvergenceGate?.requiredAckNodeIds) &&
    Array.isArray(publicationConvergenceGate?.acknowledgedNodeIds);
  const pendingRequiredAckNodeIds =
    hasRequiredAckNodeEvidence ?
      resolvePendingRequiredAckNodeIds(
        publicationConvergenceGate.requiredAckNodeIds,
        publicationConvergenceGate.acknowledgedNodeIds,
      ) :
      LOCAL_EMPTY_LIST;
  const hasClosedRequiredAckGate =
    hasRequiredAckNodeEvidence &&
    (
      normalizeNonNegativeInteger(publicationConvergenceGate?.pendingAckCount) ??
      0
    ) === 0 &&
    pendingRequiredAckNodeIds.length === 0;
  const observationPendingAckNodeIds = Object.freeze(
    hasClosedRequiredAckGate ?
      LOCAL_EMPTY_LIST :
      normalizeDistinctStringArray([
        ...pendingRequiredAckNodeIds,
        ...normalizeDistinctStringArray(
          publicationConvergenceGate?.pendingAckNodeIds,
        ),
        ...normalizeDistinctStringArray(
          publicationConvergence?.pendingAckNodeIds,
        ),
      ]),
  );
  const observationCurrentPendingAckCount = Math.max(
    normalizeNonNegativeInteger(publicationConvergenceGate?.pendingAckCount) ??
      0,
    normalizeNonNegativeInteger(publicationConvergence?.pendingAckCount) ??
      0,
    normalizeNonNegativeInteger(
      activeGateContext.activeGateProgress?.pendingAckCount,
    ) ?? 0,
  );
  const observationFallbackPendingAckCount =
    normalizeNonNegativeInteger(
      activeGateContext.activeGateBestProgress?.pendingAckCount,
    ) ?? 0;
  const hasClosedPendingAckGate =
    observationPendingAckNodeIds.length === 0 &&
    hasClosedRequiredAckGate;
  const observationPendingAckCount =
    observationPendingAckNodeIds.length > 0 ?
      observationPendingAckNodeIds.length :
      hasClosedPendingAckGate ?
        0 :
        Math.max(
          observationCurrentPendingAckCount,
          observationFallbackPendingAckCount,
        );
  const selectedMissingPublishedEvidence =
    resolveSelectedMissingPublishedEvidence(
      activeGateContext.activeGateProgress,
    );
  const selectedMissingPublishedEvidenceAvailable =
    hasSelectedMissingPublishedEvidence(selectedMissingPublishedEvidence);
  const observationMissingPublishedNodeIds =
    selectedMissingPublishedEvidenceAvailable ?
      selectedMissingPublishedEvidence.nodeIds :
      Object.freeze(
        normalizeDistinctStringArray([
          ...normalizeDistinctStringArray(
            publicationConvergenceGate?.missingPublishedNodeIds,
          ),
          ...normalizeDistinctStringArray(
            publicationConvergence?.missingPublishedNodeIds,
          ),
          ...normalizeDistinctStringArray(
            publicationConvergence?.missingPublishedRecoveryActiveNodeIds,
          ),
          ...normalizeDistinctStringArray(
            activeGateContext.activeGateProgress?.missingPublishedNodeIds,
          ),
          ...normalizeDistinctStringArray(
            activeGateContext.activeGateProgress
              ?.selectedMissingPublishedNodeIds,
          ),
          ...normalizeDistinctStringArray(
            activeGateContext.activeGateBestProgress?.missingPublishedNodeIds,
          ),
          ...normalizeDistinctStringArray(
            activeGateContext.activeGateBestProgress
              ?.selectedMissingPublishedNodeIds,
          ),
        ]),
      );
  const observationMissingPublishedCount =
    selectedMissingPublishedEvidenceAvailable ?
      observationMissingPublishedNodeIds.length :
      Math.max(
        observationMissingPublishedNodeIds.length,
        normalizeNonNegativeInteger(
          publicationConvergenceGate?.missingPublishedCount,
        ) ?? 0,
        normalizeNonNegativeInteger(
          publicationConvergence?.missingPublishedCount,
        ) ?? 0,
        normalizeNonNegativeInteger(
          activeGateContext.activeGateProgress?.missingPublishedCount,
        ) ?? 0,
        normalizeNonNegativeInteger(
          activeGateContext.activeGateBestProgress?.missingPublishedCount,
        ) ?? 0,
      );
  const pressureConditions = buildPriorityRecoveryPressureConditions(
    options.logsTable,
  );
  const prioritySpreadPending =
    publicationConvergenceGate?.prioritySpreadPending === true ||
    (
      applyClosureWitness !== true &&
      priorityPartitionSummary?.satisfied === false
    );
  return Object.freeze({
    publicationEpoch:
      normalizeNonNegativeInteger(
        publicationConvergence?.publicationEpoch ??
          publicationConvergenceGate?.publicationEpoch,
      ),
    publicationStatus:
      publicationConvergence?.publicationStatus ||
      publicationConvergenceGate?.publicationStatus ||
      null,
    recoveryProtocolState:
      resolveObservationRecoveryProtocolState(
        publicationConvergence,
        publicationConvergenceGate,
        prioritySpreadPending,
      ),
    priorityRecoveryReasonCodes,
    publicationPending:
      publicationConvergenceGate?.publicationPending === true,
    prioritySpreadPending,
    publishedActiveNodeIds: Object.freeze(
      normalizeDistinctStringArray(
        publicationConvergence?.publishedActiveNodeIds,
      ),
    ),
    pendingAckNodeIds: Object.freeze(
      normalizeDistinctStringArray(
        observationPendingAckNodeIds,
      ),
    ),
    pendingAckCount: observationPendingAckCount,
    missingPublishedNodeIds: observationMissingPublishedNodeIds,
    missingPublishedCount: observationMissingPublishedCount,
    publicationConvergenceGateReasons: Object.freeze(
      normalizeDistinctStringArray(
        publicationConvergenceGate?.reasonCodes ||
          publicationConvergenceGate?.reasons,
      ),
    ),
    closureRecordId: resolveObservationClosureField(
      observationOptions,
      PRIORITY_RECOVERY_OBSERVATION_CLOSURE_FIELD.RECORD_ID,
      resolvedPriorityRecoveryClosureWitness,
      activeGateContext,
    ),
    closureWitnessClass: resolveObservationClosureField(
      observationOptions,
      PRIORITY_RECOVERY_OBSERVATION_CLOSURE_FIELD.WITNESS_CLASS,
      resolvedPriorityRecoveryClosureWitness,
      activeGateContext,
    ),
    priorityRecoveryClosureState:
      typeof resolvedPriorityRecoveryClosureWitness?.state === 'string' ?
        resolvedPriorityRecoveryClosureWitness.state :
        null,
    ...(activeGateContext.activeGateProgress ?
      {activeGateProgress: activeGateContext.activeGateProgress} :
      {}),
    ...(activeGateContext.activeGateBestProgress ?
      {activeGateBestProgress: activeGateContext.activeGateBestProgress} :
      {}),
    ...(activeGateContext.activeGateNoProgress ?
      {activeGateNoProgress: activeGateContext.activeGateNoProgress} :
      {}),
    ...(activeGateContext.activeGateBlockerHistory ?
      {activeGateBlockerHistory: activeGateContext.activeGateBlockerHistory} :
      {}),
    pressureConditions,
    projectionDiagnostics: resolveProjectionDiagnostics(publicationConvergence),
    priorityPartitionSummary,
    priorityRecoveryCurrentSummary,
    priorityRecoveryProgressClassIds:
      priorityRecoveryCurrentSummary.unresolvedClassIds,
    priorityRecoveryProgressClassCount:
      priorityRecoveryCurrentSummary.unresolvedClassCount,
    priorityRecoverySemanticStateIds:
      priorityRecoveryCurrentSummary.unresolvedSemanticStateIds,
    priorityRecoverySemanticStateCount:
      priorityRecoveryCurrentSummary.unresolvedSemanticStateCount,
    priorityRecoveryBlockedPartitionIds: Object.freeze(
      [...priorityRecoveryBlockedPartitionIds],
    ),
    priorityRecoveryBlockedPartitionCount:
      priorityRecoveryBlockedPartitionIds.length,
    priorityRecoveryUnresolvedPartitionIds,
    priorityRecoveryUnresolvedPartitionCount:
      priorityRecoveryCurrentSummary.blockedPartitionCount,
    priorityRecoveryBlockerPartitionIdsByReason:
      priorityRecoveryCurrentSummary.blockerPartitionIdsByReason,
    priorityRecoveryPartitionIdsBySemanticState:
      priorityRecoveryCurrentSummary.partitionIdsBySemanticState,
    priorityRecoveryPartitionBlockerHistory:
      priorityRecoveryCurrentSummary.partitionBlockerHistory,
    priorityRecoveryPartitionSemanticStateHistory:
      priorityRecoveryCurrentSummary.partitionSemanticStateHistory,
    priorityRecoveryPartitionSnapshots:
      priorityRecoveryCurrentSummary.partitionSnapshots,
    priorityRecoveryPartitionWitnesses:
      priorityRecoveryCurrentSummary.partitionWitnesses,
    priorityRecoveryAdmissionDecisionDimensions:
      priorityRecoveryCurrentSummary.admissionDecisionDimensions,
    priorityRecoveryInvariantFailingIds: Object.freeze(
      priorityRecoveryInvariants?.failingInvariantIds || [],
    ),
    priorityRecoveryInvariantFailures: Object.freeze(
      priorityRecoveryInvariants?.invariants?.filter(
        (invariant) => invariant?.passed !== true,
      ) || [],
    ),
    priorityRecoveryInvariantCount:
      Array.isArray(priorityRecoveryInvariants?.invariants) ?
        priorityRecoveryInvariants.invariants.length :
        0,
  });
}

export {
  buildPriorityRecoveryObservationSnapshot,
  buildPriorityRecoveryPartitionWitnesses,
};
