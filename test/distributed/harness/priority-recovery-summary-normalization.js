import {
  PRIORITY_RECOVERY_ACTUATION_STATE,
  PRIORITY_RECOVERY_OBSERVATION_STATE_VALUE,
  PRIORITY_RECOVERY_SEMANTIC_STATE,
} from '../../../src/control-plane/priority-recovery-diagnostics-constants.js';

const ZERO = 0;
const PRIORITY_RECOVERY_PROGRESS_NONE = 'none';
const PRIORITY_RECOVERY_WAIT_MODE_PRECEDENCE = Object.freeze([
  'stalled',
  'timeout_reconcile_due',
  'deferred_visibility',
  'retry_scheduled',
  'event_driven',
  PRIORITY_RECOVERY_PROGRESS_NONE,
]);
const PRIORITY_RECOVERY_CONTRACT_STATE_PRECEDENCE = Object.freeze([
  'failed',
  'blocked',
  'deferred',
  'pending',
  'ready',
]);
const PRIORITY_RECOVERY_ACTUATION_STATE_PRECEDENCE = Object.freeze([
  PRIORITY_RECOVERY_ACTUATION_STATE.TRANSITION_DEFERRED,
  PRIORITY_RECOVERY_ACTUATION_STATE.ACTION_REQUIRED,
  PRIORITY_RECOVERY_ACTUATION_STATE.PERSISTED_NOT_DISPATCHED,
  PRIORITY_RECOVERY_ACTUATION_STATE.DISPATCHED_WAITING_PROGRESS,
  PRIORITY_RECOVERY_ACTUATION_STATE.TERMINAL_FAILED,
  PRIORITY_RECOVERY_ACTUATION_STATE.TERMINAL_COMPLETED,
  PRIORITY_RECOVERY_ACTUATION_STATE.NO_ACTION_NEEDED,
  PRIORITY_RECOVERY_PROGRESS_NONE,
]);
const PRIORITY_RECOVERY_NON_BLOCKING_PROGRESS_SEMANTIC_STATES = new Set([
  PRIORITY_RECOVERY_SEMANTIC_STATE.CONVERGED,
  PRIORITY_RECOVERY_SEMANTIC_STATE.SPREAD_SATISFIED_IN_FLIGHT,
]);

function normalizeNonNegativeInteger(value) {
  if (!Number.isFinite(value)) {
    return null;
  }
  return Math.max(ZERO, Math.floor(value));
}

function normalizeStringField(value) {
  const normalizedValue = String(value || '').trim();
  return normalizedValue.length > ZERO ? normalizedValue : null;
}

function normalizeDistinctStringArray(values) {
  if (!Array.isArray(values)) {
    return [];
  }
  return [...new Set(
    values
      .map((value) => String(value || '').trim())
      .filter((value) => value.length > ZERO),
  )];
}

function normalizePriorityRecoveryBlockedPartitions(blockedPartitions) {
  if (!Array.isArray(blockedPartitions)) {
    return [];
  }
  return blockedPartitions
    .map((blockedPartition) => {
      const partitionId = String(
        blockedPartition?.partitionId ||
          blockedPartition?.partition_id ||
          '',
      ).trim();
      if (partitionId.length === ZERO) {
        return null;
      }
      const spreadGap = normalizeNonNegativeInteger(
        Number.isFinite(blockedPartition?.spreadGap) ?
          blockedPartition.spreadGap :
          blockedPartition?.spread_gap,
      );
      const requiredDistinctNodeCount = normalizeNonNegativeInteger(
        Number.isFinite(blockedPartition?.requiredDistinctNodeCount) ?
          blockedPartition.requiredDistinctNodeCount :
          blockedPartition?.required_distinct_node_count,
      );
      const readyDistinctNodeCount = normalizeNonNegativeInteger(
        Number.isFinite(blockedPartition?.readyDistinctNodeCount) ?
          blockedPartition.readyDistinctNodeCount :
          blockedPartition?.ready_distinct_node_count,
      );
      return {
        partitionId,
        ...(spreadGap !== null ? {spreadGap} : {}),
        ...(requiredDistinctNodeCount !== null ?
          {requiredDistinctNodeCount} :
          {}),
        ...(readyDistinctNodeCount !== null ? {readyDistinctNodeCount} : {}),
        reasons: normalizeDistinctStringArray(
          blockedPartition?.reasons || blockedPartition?.reason_codes,
        ),
      };
    })
    .filter(Boolean);
}

function normalizePriorityRecoveryPartitionWitnessesForDiagnostics(witnesses) {
  return (Array.isArray(witnesses) ? witnesses : [])
    .map((witness) => {
      const partitionId = normalizeStringField(
        witness?.partitionId ?? witness?.partition_id,
      );
      if (!partitionId) {
        return null;
      }
      const progressClassIds = normalizeDistinctStringArray(
        witness?.progressClassIds ??
          witness?.progress_class_ids ??
          witness?.blockerReasonCodes ??
          witness?.blocker_reason_codes,
      );
      const blockerReasonCodes = normalizeDistinctStringArray(
        witness?.blockerReasonCodes ??
          witness?.blocker_reason_codes ??
          progressClassIds,
      );
      const progressEvidenceSourceIds = normalizeDistinctStringArray(
        witness?.progressEvidenceSourceIds ??
          witness?.progress_evidence_source_ids,
      );
      const operationIds = normalizeDistinctStringArray(
        witness?.operationIds ?? witness?.operation_ids,
      );
      const witnessIds = normalizeDistinctStringArray(
        witness?.witnessIds ?? witness?.witness_ids,
      );
      const eligibleNodeIds = normalizeDistinctStringArray(
        witness?.eligibleNodeIds ?? witness?.eligible_node_ids,
      );
      const recoveryEligibleExcludedNodeIds = normalizeDistinctStringArray(
        witness?.recoveryEligibleExcludedNodeIds ??
          witness?.recovery_eligible_excluded_node_ids,
      );
      const activeLearnerNodeIds = normalizeDistinctStringArray(
        witness?.activeLearnerNodeIds ?? witness?.active_learner_node_ids,
      );
      const promotableLearnerNodeIds = normalizeDistinctStringArray(
        witness?.promotableLearnerNodeIds ??
          witness?.promotable_learner_node_ids,
      );
      return {
        partitionId,
        ...(normalizeStringField(
          witness?.semanticStateId ?? witness?.semantic_state_id,
        ) ?
          {
            semanticStateId: normalizeStringField(
              witness?.semanticStateId ?? witness?.semantic_state_id,
            ),
          } :
          {}),
        ...(normalizeNonNegativeInteger(
          witness?.spreadGap ?? witness?.spread_gap,
        ) !== null ?
          {
            spreadGap: normalizeNonNegativeInteger(
              witness?.spreadGap ?? witness?.spread_gap,
            ),
          } :
          {}),
        ...(normalizeNonNegativeInteger(
          witness?.readyDistinctNodeCount ?? witness?.ready_distinct_node_count,
        ) !== null ?
          {
            readyDistinctNodeCount: normalizeNonNegativeInteger(
              witness?.readyDistinctNodeCount ??
                  witness?.ready_distinct_node_count,
            ),
          } :
          {}),
        ...(normalizeNonNegativeInteger(
          witness?.requiredDistinctNodeCount ??
            witness?.required_distinct_node_count,
        ) !== null ?
          {
            requiredDistinctNodeCount: normalizeNonNegativeInteger(
              witness?.requiredDistinctNodeCount ??
                  witness?.required_distinct_node_count,
            ),
          } :
          {}),
        ...(progressClassIds.length > ZERO ? {progressClassIds} : {}),
        ...(blockerReasonCodes.length > ZERO ? {blockerReasonCodes} : {}),
        ...(normalizeStringField(
          witness?.authoritativeVisibilityState ??
            witness?.authoritative_visibility_state,
        ) ?
          {
            authoritativeVisibilityState: normalizeStringField(
              witness?.authoritativeVisibilityState ??
                  witness?.authoritative_visibility_state,
            ),
          } :
          {}),
        ...(normalizeStringField(
          witness?.removeSafetyState ?? witness?.remove_safety_state,
        ) ?
          {
            removeSafetyState: normalizeStringField(
              witness?.removeSafetyState ?? witness?.remove_safety_state,
            ),
          } :
          {}),
        ...(normalizeStringField(
          witness?.transportPressureState ??
            witness?.transport_pressure_state,
        ) ?
          {
            transportPressureState: normalizeStringField(
              witness?.transportPressureState ??
                  witness?.transport_pressure_state,
            ),
          } :
          {}),
        ...(normalizeStringField(
          witness?.progressContractState ?? witness?.progress_contract_state,
        ) ?
          {
            progressContractState: normalizeStringField(
              witness?.progressContractState ??
                  witness?.progress_contract_state,
            ),
          } :
          {}),
        ...(normalizeStringField(
          witness?.progressNextAction ?? witness?.progress_next_action,
        ) ?
          {
            progressNextAction: normalizeStringField(
              witness?.progressNextAction ?? witness?.progress_next_action,
            ),
          } :
          {}),
        ...(normalizeStringField(
          witness?.actuationState ?? witness?.actuation_state,
        ) ?
          {
            actuationState: normalizeStringField(
              witness?.actuationState ?? witness?.actuation_state,
            ),
          } :
          {}),
        ...(normalizeStringField(
          witness?.actuationOwner ?? witness?.actuation_owner,
        ) ?
          {
            actuationOwner: normalizeStringField(
              witness?.actuationOwner ?? witness?.actuation_owner,
            ),
          } :
          {}),
        ...(normalizeStringField(witness?.currentOwner ?? witness?.current_owner) ?
          {
            currentOwner: normalizeStringField(
              witness?.currentOwner ?? witness?.current_owner,
            ),
          } :
          {}),
        ...(normalizeStringField(
          witness?.nextRequiredAction ?? witness?.next_required_action,
        ) ?
          {
            nextRequiredAction: normalizeStringField(
              witness?.nextRequiredAction ?? witness?.next_required_action,
            ),
          } :
          {}),
        ...(normalizeStringField(
          witness?.blockingBoundary ?? witness?.blocking_boundary,
        ) ?
          {
            blockingBoundary: normalizeStringField(
              witness?.blockingBoundary ?? witness?.blocking_boundary,
            ),
          } :
          {}),
        ...(normalizeStringField(witness?.waitMode ?? witness?.wait_mode) ?
          {
            waitMode: normalizeStringField(
              witness?.waitMode ?? witness?.wait_mode,
            ),
          } :
          {}),
        ...(normalizeStringField(
          witness?.workflowProgressPhaseId ??
            witness?.workflow_progress_phase_id,
        ) ?
          {
            workflowProgressPhaseId: normalizeStringField(
              witness?.workflowProgressPhaseId ??
                  witness?.workflow_progress_phase_id,
            ),
          } :
          {}),
        ...(normalizeNonNegativeInteger(
          witness?.stepAgeMs ?? witness?.step_age_ms,
        ) !== null ?
          {
            stepAgeMs: normalizeNonNegativeInteger(
              witness?.stepAgeMs ?? witness?.step_age_ms,
            ),
          } :
          {}),
        ...(normalizeNonNegativeInteger(
          witness?.stepTimeoutMs ?? witness?.step_timeout_ms,
        ) !== null ?
          {
            stepTimeoutMs: normalizeNonNegativeInteger(
              witness?.stepTimeoutMs ?? witness?.step_timeout_ms,
            ),
          } :
          {}),
        ...(normalizeStringField(
          witness?.pressureState ?? witness?.pressure_state,
        ) ?
          {
            pressureState: normalizeStringField(
              witness?.pressureState ?? witness?.pressure_state,
            ),
          } :
          {}),
        ...(normalizeNonNegativeInteger(
          witness?.pendingWrites ?? witness?.pending_writes,
        ) !== null ?
          {
            pendingWrites: normalizeNonNegativeInteger(
              witness?.pendingWrites ?? witness?.pending_writes,
            ),
          } :
          {}),
        ...(normalizeNonNegativeInteger(
          witness?.pendingWriteGrowthCount ??
            witness?.pending_write_growth_count,
        ) !== null ?
          {
            pendingWriteGrowthCount: normalizeNonNegativeInteger(
              witness?.pendingWriteGrowthCount ??
                  witness?.pending_write_growth_count,
            ),
          } :
          {}),
        ...(normalizeNonNegativeInteger(
          witness?.retainedBacklogGrowthCount ??
            witness?.retained_backlog_growth_count,
        ) !== null ?
          {
            retainedBacklogGrowthCount: normalizeNonNegativeInteger(
              witness?.retainedBacklogGrowthCount ??
                  witness?.retained_backlog_growth_count,
            ),
          } :
          {}),
        ...(normalizeNonNegativeInteger(
          witness?.retryAfterMs ?? witness?.retry_after_ms,
        ) !== null ?
          {
            retryAfterMs: normalizeNonNegativeInteger(
              witness?.retryAfterMs ?? witness?.retry_after_ms,
            ),
          } :
          {}),
        ...(normalizeNonNegativeInteger(
          witness?.lastProgressAtMs ?? witness?.last_progress_at_ms,
        ) !== null ?
          {
            lastProgressAtMs: normalizeNonNegativeInteger(
              witness?.lastProgressAtMs ?? witness?.last_progress_at_ms,
            ),
          } :
          {}),
        ...(normalizeStringField(
          witness?.correlationKey ?? witness?.correlation_key,
        ) ?
          {
            correlationKey: normalizeStringField(
              witness?.correlationKey ?? witness?.correlation_key,
            ),
          } :
          {}),
        ...(normalizeStringField(
          witness?.decisionDimension ?? witness?.decision_dimension,
        ) ?
          {
            decisionDimension: normalizeStringField(
              witness?.decisionDimension ?? witness?.decision_dimension,
            ),
          } :
          {}),
        ...(progressEvidenceSourceIds.length > ZERO ?
          {progressEvidenceSourceIds} :
          {}),
        witnessIds,
        eligibleNodeIds,
        recoveryEligibleExcludedNodeIds,
        activeLearnerNodeIds,
        promotableLearnerNodeIds,
        operationIds,
        completionState:
          normalizeStringField(
            witness?.completionState ?? witness?.completion_state,
          ) || null,
        workflowState:
          normalizeStringField(
            witness?.workflowState ?? witness?.workflow_state,
          ) || null,
        visibilityState:
          normalizeStringField(
            witness?.visibilityState ?? witness?.visibility_state,
          ) || null,
        convergenceState:
          normalizeStringField(
            witness?.convergenceState ?? witness?.convergence_state,
          ) || null,
        workflowSource:
          normalizeStringField(
            witness?.workflowSource ?? witness?.workflow_source,
          ) || null,
        snapshotCapturedAt:
          normalizeNonNegativeInteger(
            witness?.snapshotCapturedAt ?? witness?.snapshot_captured_at,
          ) ?? null,
        latestOperationWorkflowStep:
          normalizeStringField(
            witness?.latestOperationWorkflowStep ??
              witness?.latest_operation_workflow_step,
          ) || null,
        latestOperationStatus:
          normalizeStringField(
            witness?.latestOperationStatus ??
              witness?.latest_operation_status,
          ) || null,
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.partitionId.localeCompare(right.partitionId));
}

function addCount(map, value) {
  const normalizedValue = normalizeStringField(value);
  if (
    !normalizedValue ||
    normalizedValue === PRIORITY_RECOVERY_PROGRESS_NONE ||
    normalizedValue === PRIORITY_RECOVERY_OBSERVATION_STATE_VALUE.UNAVAILABLE
  ) {
    return;
  }
  map[normalizedValue] = (map[normalizedValue] || ZERO) + 1;
}

function resolvePrecedenceRank(value, precedence) {
  const normalizedValue = normalizeStringField(value);
  const index = normalizedValue ? precedence.indexOf(normalizedValue) : -1;
  return index >= ZERO ? index : precedence.length;
}

function hasMeaningfulPriorityRecoveryProgressWitness(witness) {
  const progressClassIds = normalizeDistinctStringArray(
    witness?.progressClassIds,
  );
  const blockerReasonCodes = normalizeDistinctStringArray(
    witness?.blockerReasonCodes,
  );
  if (
    progressClassIds.length === ZERO &&
    blockerReasonCodes.length === ZERO &&
    PRIORITY_RECOVERY_NON_BLOCKING_PROGRESS_SEMANTIC_STATES.has(
      witness?.semanticStateId,
    )
  ) {
    return false;
  }
  const progressFields = [
    witness?.progressContractState,
    witness?.actuationState,
    witness?.currentOwner,
    witness?.nextRequiredAction,
    witness?.blockingBoundary,
    witness?.waitMode,
    witness?.pressureState,
  ];
  return progressFields.some((value) => {
    const normalizedValue = normalizeStringField(value);
    return (
      normalizedValue &&
      normalizedValue !== PRIORITY_RECOVERY_PROGRESS_NONE &&
      normalizedValue !== PRIORITY_RECOVERY_OBSERVATION_STATE_VALUE.UNAVAILABLE
    );
  });
}

function comparePriorityRecoveryPartitionWitnessPriority(left, right) {
  const waitModeRankDelta =
    resolvePrecedenceRank(left?.waitMode, PRIORITY_RECOVERY_WAIT_MODE_PRECEDENCE) -
    resolvePrecedenceRank(
      right?.waitMode,
      PRIORITY_RECOVERY_WAIT_MODE_PRECEDENCE,
    );
  if (waitModeRankDelta !== ZERO) {
    return waitModeRankDelta;
  }
  const contractStateRankDelta =
    resolvePrecedenceRank(
      left?.progressContractState,
      PRIORITY_RECOVERY_CONTRACT_STATE_PRECEDENCE,
    ) -
    resolvePrecedenceRank(
      right?.progressContractState,
      PRIORITY_RECOVERY_CONTRACT_STATE_PRECEDENCE,
    );
  if (contractStateRankDelta !== ZERO) {
    return contractStateRankDelta;
  }
  const actuationStateRankDelta =
    resolvePrecedenceRank(
      left?.actuationState,
      PRIORITY_RECOVERY_ACTUATION_STATE_PRECEDENCE,
    ) -
    resolvePrecedenceRank(
      right?.actuationState,
      PRIORITY_RECOVERY_ACTUATION_STATE_PRECEDENCE,
    );
  if (actuationStateRankDelta !== ZERO) {
    return actuationStateRankDelta;
  }
  const leftLastProgressAtMs = normalizeNonNegativeInteger(left?.lastProgressAtMs);
  const rightLastProgressAtMs = normalizeNonNegativeInteger(
    right?.lastProgressAtMs,
  );
  if (leftLastProgressAtMs !== null && rightLastProgressAtMs !== null) {
    if (leftLastProgressAtMs !== rightLastProgressAtMs) {
      return leftLastProgressAtMs - rightLastProgressAtMs;
    }
  } else if (leftLastProgressAtMs !== null) {
    return -1;
  } else if (rightLastProgressAtMs !== null) {
    return 1;
  }
  return String(left?.partitionId || '').localeCompare(
    String(right?.partitionId || ''),
  );
}

function selectDominantPriorityRecoveryPartitionWitness(witnesses) {
  const normalizedWitnesses =
    normalizePriorityRecoveryPartitionWitnessesForDiagnostics(witnesses);
  const meaningfulWitnesses = normalizedWitnesses.filter(
    hasMeaningfulPriorityRecoveryProgressWitness,
  );
  const candidateWitnesses =
    meaningfulWitnesses.length > ZERO ? meaningfulWitnesses : normalizedWitnesses;
  if (candidateWitnesses.length === ZERO) {
    return null;
  }
  return [...candidateWitnesses].sort(
    comparePriorityRecoveryPartitionWitnessPriority,
  )[ZERO];
}

function buildPriorityRecoveryProgressSummary(priorityRecoveryObservation) {
  const partitionWitnesses = normalizePriorityRecoveryPartitionWitnessesForDiagnostics(
    priorityRecoveryObservation?.priorityRecoveryPartitionWitnesses,
  );
  if (partitionWitnesses.length === ZERO) {
    return null;
  }
  const currentOwnerCounts = {};
  const actuationStateCounts = {};
  const blockingBoundaryCounts = {};
  const waitModeCounts = {};
  const nextRequiredActionCounts = {};
  const progressContractStateCounts = {};
  const pressureStateCounts = {};
  for (const witness of partitionWitnesses) {
    addCount(actuationStateCounts, witness.actuationState);
    addCount(currentOwnerCounts, witness.currentOwner);
    addCount(blockingBoundaryCounts, witness.blockingBoundary);
    addCount(waitModeCounts, witness.waitMode);
    addCount(nextRequiredActionCounts, witness.nextRequiredAction);
    addCount(progressContractStateCounts, witness.progressContractState);
    addCount(pressureStateCounts, witness.pressureState);
  }
  return {
    partitionCount: partitionWitnesses.length,
    dominantWitness: selectDominantPriorityRecoveryPartitionWitness(
      partitionWitnesses,
    ),
    ...(Object.keys(actuationStateCounts).length > ZERO ?
      {actuationStateCounts} :
      {}),
    ...(Object.keys(currentOwnerCounts).length > ZERO ?
      {currentOwnerCounts} :
      {}),
    ...(Object.keys(blockingBoundaryCounts).length > ZERO ?
      {blockingBoundaryCounts} :
      {}),
    ...(Object.keys(waitModeCounts).length > ZERO ? {waitModeCounts} : {}),
    ...(Object.keys(nextRequiredActionCounts).length > ZERO ?
      {nextRequiredActionCounts} :
      {}),
    ...(Object.keys(progressContractStateCounts).length > ZERO ?
      {progressContractStateCounts} :
      {}),
    ...(Object.keys(pressureStateCounts).length > ZERO ?
      {pressureStateCounts} :
      {}),
  };
}

function normalizePriorityPartitionSummaryForDiagnostics(summary) {
  if (!summary || typeof summary !== 'object' || Array.isArray(summary)) {
    return null;
  }
  const blockedPartitions = normalizePriorityRecoveryBlockedPartitions(
    summary.blockedPartitions ?? summary.blocked_partitions,
  );
  const missingPartitionIds = normalizeDistinctStringArray(
    summary.missingPartitionIds ?? summary.missing_partition_ids,
  );
  const blockedPartitionCount = normalizeNonNegativeInteger(
    Number.isFinite(summary.blockedPartitionCount) ?
      summary.blockedPartitionCount :
      summary?.blocked_partition_count,
  );
  const totalSpreadGap = normalizeNonNegativeInteger(
    Number.isFinite(summary.totalSpreadGap) ?
      summary.totalSpreadGap :
      summary?.total_spread_gap,
  );
  const largestSpreadGap = normalizeNonNegativeInteger(
    Number.isFinite(summary.largestSpreadGap) ?
      summary.largestSpreadGap :
      summary?.largest_spread_gap,
  );
  const computedTotalSpreadGap = blockedPartitions.reduce(
    (sum, blockedPartition) => sum + (blockedPartition?.spreadGap || ZERO),
    ZERO,
  );
  const computedLargestSpreadGap = blockedPartitions.reduce(
    (largest, blockedPartition) =>
      Math.max(largest, blockedPartition?.spreadGap || ZERO),
    ZERO,
  );
  const requiredDistinctNodeCount = normalizeNonNegativeInteger(
    Number.isFinite(summary.requiredDistinctNodeCount) ?
      summary.requiredDistinctNodeCount :
      summary?.required_distinct_node_count,
  );
  const readyEligibleNodeCount = normalizeNonNegativeInteger(
    Number.isFinite(summary.readyEligibleNodeCount) ?
      summary.readyEligibleNodeCount :
      summary?.ready_eligible_node_count,
  );
  const totalPriorityPartitionCount = normalizeNonNegativeInteger(
    Number.isFinite(summary.totalPriorityPartitionCount) ?
      summary.totalPriorityPartitionCount :
      summary?.total_priority_partition_count,
  );
  const normalizedSummary = {
    ...(summary.satisfied === true ? {satisfied: true} : {}),
    ...(summary.satisfied === false ? {satisfied: false} : {}),
    ...(requiredDistinctNodeCount !== null ?
      {requiredDistinctNodeCount} :
      {}),
    ...(readyEligibleNodeCount !== null ? {readyEligibleNodeCount} : {}),
    ...(totalPriorityPartitionCount !== null ?
      {totalPriorityPartitionCount} :
      {}),
    ...(missingPartitionIds.length > ZERO ? {missingPartitionIds} : {}),
    ...(blockedPartitions.length > ZERO ? {blockedPartitions} : {}),
    ...(blockedPartitionCount !== null ?
      {blockedPartitionCount} :
      blockedPartitions.length > ZERO ?
        {blockedPartitionCount: blockedPartitions.length} :
        {}),
    ...(largestSpreadGap !== null ?
      {largestSpreadGap} :
      blockedPartitions.length > ZERO ?
        {largestSpreadGap: computedLargestSpreadGap} :
        {}),
    ...(totalSpreadGap !== null ?
      {totalSpreadGap} :
      blockedPartitions.length > ZERO ?
        {totalSpreadGap: computedTotalSpreadGap} :
        {}),
  };
  return Object.keys(normalizedSummary).length > ZERO ? normalizedSummary : null;
}

export {
  buildPriorityRecoveryProgressSummary,
  hasMeaningfulPriorityRecoveryProgressWitness,
  normalizePriorityPartitionSummaryForDiagnostics,
  normalizePriorityRecoveryPartitionWitnessesForDiagnostics,
  selectDominantPriorityRecoveryPartitionWitness,
};
