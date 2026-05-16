import {NUM, TYPEOF} from '../constants/index.js';
import {CONTROL_PLANE_PUBLICATION_STATUS} from './control-plane-publication-merge.js';
import {RECOVERY_PROTOCOL_STATE} from './membership-lifecycle-constants.js';
import {buildPriorityRecoveryPressureConditions} from './priority-recovery-helpers.js';
import {buildTrackedPriorityRecoveryDecisionSnapshots} from
  './priority-recovery-snapshot.js';
import {LOCAL_EMPTY_LIST, PRIORITY_RECOVERY_CURRENT_SUMMARY_SCOPE, isRecord, normalizeDistinctStringArray, normalizeNonNegativeInteger, normalizePriorityRecoveryInvariantSummary, resolvePendingRequiredAckNodeIds} from './priority-recovery-observation-snapshot-stage-1.js';
import {buildPriorityRecoveryPartitionWitnesses} from './priority-recovery-observation-snapshot-stage-2.js';
import {hasSelectedMissingPublishedEvidence, resolveObservationActiveGateContext, resolveObservationClosureField, resolveObservationPriorityPartitionSummary, resolveObservationPriorityRecoveryBlockedPartitionIds, resolveObservationPriorityRecoveryClosureWitness, resolveObservationPriorityRecoveryReasonCodes, resolveObservationPublicationConvergenceGate, resolveProjectionDiagnostics, resolveSelectedMissingPublishedEvidence, shouldApplyObservationClosureWitness} from './priority-recovery-observation-snapshot-stage-3.js';

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

function buildPriorityRecoveryObservationSnapshot(options = {}) {
  const publicationConvergence = isRecord(options.publicationConvergence) ?
    options.publicationConvergence :
    null;
  const publicationConvergenceGate = resolveObservationPublicationConvergenceGate(
    options,
    publicationConvergence,
    options.publicationConvergenceGate,
  );
  const trackedPriorityRecoveryDecisionSnapshots =
    buildTrackedPriorityRecoveryDecisionSnapshots(
      options.priorityRecoveryDecisionSnapshots,
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
  const priorityRecoveryClosureWitness =
    resolveObservationPriorityRecoveryClosureWitness(
      options,
      publicationConvergence,
      publicationConvergenceGate,
    );
  const applyClosureWitness =
    shouldApplyObservationClosureWitness(priorityRecoveryClosureWitness);
  const priorityPartitionSummary = resolveObservationPriorityPartitionSummary(
    publicationConvergence,
    publicationConvergenceGate,
    priorityRecoveryClosureWitness,
  );
  const priorityRecoveryReasonCodes =
    resolveObservationPriorityRecoveryReasonCodes(
      publicationConvergence,
      publicationConvergenceGate,
      priorityRecoveryClosureWitness,
    );
  const activeGateContext = resolveObservationActiveGateContext(options);
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
      NUM.ZERO
    ) === NUM.ZERO &&
    pendingRequiredAckNodeIds.length === NUM.ZERO;
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
      NUM.ZERO,
    normalizeNonNegativeInteger(publicationConvergence?.pendingAckCount) ??
      NUM.ZERO,
    normalizeNonNegativeInteger(
      activeGateContext.activeGateProgress?.pendingAckCount,
    ) ?? NUM.ZERO,
  );
  const observationFallbackPendingAckCount =
    normalizeNonNegativeInteger(
      activeGateContext.activeGateBestProgress?.pendingAckCount,
    ) ?? NUM.ZERO;
  const hasClosedPendingAckGate =
    observationPendingAckNodeIds.length === NUM.ZERO &&
    hasClosedRequiredAckGate;
  const observationPendingAckCount =
    observationPendingAckNodeIds.length > NUM.ZERO ?
      observationPendingAckNodeIds.length :
      hasClosedPendingAckGate ?
        NUM.ZERO :
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
        ) ?? NUM.ZERO,
        normalizeNonNegativeInteger(
          publicationConvergence?.missingPublishedCount,
        ) ?? NUM.ZERO,
        normalizeNonNegativeInteger(
          activeGateContext.activeGateProgress?.missingPublishedCount,
        ) ?? NUM.ZERO,
        normalizeNonNegativeInteger(
          activeGateContext.activeGateBestProgress?.missingPublishedCount,
        ) ?? NUM.ZERO,
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
      options,
      PRIORITY_RECOVERY_OBSERVATION_CLOSURE_FIELD.RECORD_ID,
      priorityRecoveryClosureWitness,
      activeGateContext,
    ),
    closureWitnessClass: resolveObservationClosureField(
      options,
      PRIORITY_RECOVERY_OBSERVATION_CLOSURE_FIELD.WITNESS_CLASS,
      priorityRecoveryClosureWitness,
      activeGateContext,
    ),
    priorityRecoveryClosureState:
      typeof priorityRecoveryClosureWitness?.state === TYPEOF.STRING ?
        priorityRecoveryClosureWitness.state :
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
        NUM.ZERO,
  });
}

const PRIORITY_RECOVERY_OBSERVATION_CLOSURE_FIELD = Object.freeze({
  RECORD_ID: 'closureRecordId',
  WITNESS_CLASS: 'closureWitnessClass',
});

export {
  PRIORITY_RECOVERY_OBSERVATION_CLOSURE_FIELD,
  buildPriorityRecoveryObservationSnapshot,
  resolveObservationRecoveryProtocolState,
};
