import {
  ABSENT_VALUE,
  UNKNOWN_VALUE,
  SOURCE_ORDER_BASE,
  FIRST_FRONTIER_INDEX,
  TYPE_STRING,
  OWNER,
  BOUNDARY,
  SOURCE_FIELD,
  PRIORITY_RECOVERY_EVIDENCE_SOURCE_SUMMARY,
  PRIORITY_RECOVERY_EVIDENCE_SOURCE_PROGRESS,
  PRIORITY_RECOVERY_EVIDENCE_SOURCE_PARTITION_WITNESSES,
  PRIORITY_RECOVERY_EVIDENCE_SOURCE_TOPOLOGY_OPERATOR_WITNESS,
  PRIORITY_RECOVERY_NON_BLOCKING_WITNESS_SEMANTIC_STATE_SET,
  PRIORITY_RECOVERY_RETRYABLE_WITNESS_SEMANTIC_STATE_SET,
  PRIORITY_RECOVERY_WAIT_MODE_EVENT_DRIVEN,
  PRIORITY_RECOVERY_WAIT_MODE_RETRY_SCHEDULED,
  PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION_ADVANCE_EXISTING_OPERATION,
  PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION_WAIT_FOR_OPERATION_PROGRESS,
} from './topology-convergence-constants.js';

const PRIORITY_RECOVERY_WITNESS_PROGRESS_CONTRACT_FIELD =
  Object.freeze({
    STATE: 'progressContractState',
    NEXT_ACTION: 'progressNextAction',
    RETRY_AFTER_MS: 'retryAfterMs',
  });
const PRIORITY_RECOVERY_WITNESS_PROGRESS_CONTRACT_WAKE_SOURCE =
  Object.freeze({
    EVENT_DRIVEN: 'operation_lifecycle_event',
    RETRY_SCHEDULED: 'rebalancer_timer',
  });
const PRIORITY_RECOVERY_WITNESS_PROGRESS_CONTRACT_TERMINAL_STATE = 'satisfied';

import {
  asRecord,
  firstRecord,
  firstText,
  textOrUnknown,
  arrayOrEmpty,
  firstFiniteNumber,
  isTopologyOperatorWitnessPresent,
} from './topology-convergence-core-normalizers.js';

// Priority Recovery Normalizers
export function selectTopologyOperatorWitness(normalized) {
  const directWitness = asRecord(normalized.topologyOperatorWitness);
  const progressSummaryDominantWitness = asRecord(
    asRecord(normalized.progressSummary)[SOURCE_FIELD.DOMINANT_WITNESS],
  );
  if (
    isTopologyOperatorWitnessPresent(directWitness) &&
    isPriorityRecoveryNonBlockingPartitionWitness(
      progressSummaryDominantWitness,
    ) !== true
  ) {
    return directWitness;
  }
  const partitionWitness = normalizePriorityRecoveryPartitionWitnesses(
    normalized.priorityRecoveryPartitionWitnesses,
  )
    .filter((witness) =>
      isPriorityRecoveryNonBlockingPartitionWitness(witness) !== true,
    )
    .map((witness) =>
      asRecord(witness[SOURCE_FIELD.TOPOLOGY_OPERATOR_WITNESS]),
    )
    .find(isTopologyOperatorWitnessPresent);
  return partitionWitness || {};
}

export function normalizePriorityRecoveryPartitionWitnesses(witnesses) {
  return arrayOrEmpty(witnesses)
    .map(asRecord)
    .filter((witness) =>
      Object.keys(witness).length > SOURCE_ORDER_BASE,
    );
}

export function isPriorityRecoveryNonBlockingPartitionWitness(witness) {
  return (
    PRIORITY_RECOVERY_NON_BLOCKING_WITNESS_SEMANTIC_STATE_SET.has(
      textOrUnknown(witness[SOURCE_FIELD.SEMANTIC_STATE_ID]),
    ) &&
    arrayOrEmpty(witness[SOURCE_FIELD.PROGRESS_CLASS_IDS]).length ===
      SOURCE_ORDER_BASE &&
    arrayOrEmpty(witness[SOURCE_FIELD.BLOCKER_REASON_CODES]).length ===
      SOURCE_ORDER_BASE
  );
}

export function buildPriorityRecoveryWitnessSelection(witnesses) {
  const normalizedWitnesses = normalizePriorityRecoveryPartitionWitnesses(
    witnesses,
  );
  const blockingWitnesses = normalizedWitnesses.filter(
    (witness) =>
      isPriorityRecoveryNonBlockingPartitionWitness(witness) !== true,
  );
  const semanticStateIds = collectDistinctRecordText(
    blockingWitnesses,
    SOURCE_FIELD.SEMANTIC_STATE_ID,
  );
  const blockedPartitionIds = collectDistinctRecordText(
    blockingWitnesses,
    SOURCE_FIELD.PARTITION_ID,
  );
  const waitModes = collectDistinctRecordText(
    blockingWitnesses,
    SOURCE_FIELD.WAIT_MODE,
  );
  const nextRequiredActions = collectDistinctRecordText(
    blockingWitnesses,
    SOURCE_FIELD.NEXT_REQUIRED_ACTION,
  );
  const actuationStates = collectDistinctRecordText(
    blockingWitnesses,
    SOURCE_FIELD.ACTUATION_STATE,
  );
  const operationOwnerEffectExecutions = collectDistinctRecordNestedText(
    blockingWitnesses,
    SOURCE_FIELD.OPERATION_OWNER_OBSERVATION,
    SOURCE_FIELD.OPERATION_OWNER_EFFECT_EXECUTION,
  );
  const operationOwnerEffectCommands = collectDistinctRecordNestedText(
    blockingWitnesses,
    SOURCE_FIELD.OPERATION_OWNER_OBSERVATION,
    SOURCE_FIELD.OPERATION_OWNER_EFFECT_COMMAND,
  );
  const operationOwnerRequestedActions = collectDistinctRecordNestedText(
    blockingWitnesses,
    SOURCE_FIELD.OPERATION_OWNER_OBSERVATION,
    SOURCE_FIELD.OPERATION_OWNER_REQUESTED_ACTION,
  );
  const eventDrivenWitnesses = blockingWitnesses.filter(
    isPriorityRecoveryEventDrivenWaitWitness,
  );
  const eventDrivenSemanticStateIds = collectDistinctRecordText(
    eventDrivenWitnesses,
    SOURCE_FIELD.SEMANTIC_STATE_ID,
  );

  return {
    witnesses: blockingWitnesses,
    dominantWitness:
      eventDrivenWitnesses[FIRST_FRONTIER_INDEX] ||
      blockingWitnesses[FIRST_FRONTIER_INDEX] ||
      {},
    classes: {
      unresolvedSemanticStateIds: semanticStateIds,
      blockedPartitionIds,
    },
    waitModes,
    nextRequiredActions,
    actuationStates,
    operationOwnerEffectExecutions,
    operationOwnerEffectCommands,
    operationOwnerRequestedActions,
    eventDrivenWait: isPriorityRecoveryEventDrivenWaitWitnessSelection({
      witnesses: eventDrivenWitnesses,
      semanticStateIds: eventDrivenSemanticStateIds,
    }),
  };
}

export function collectDistinctRecordText(records, fieldName) {
  const values = new Set();
  for (const record of records) {
    const value = record[fieldName];
    if (typeof value === TYPE_STRING && value.length > SOURCE_ORDER_BASE) {
      values.add(value);
    }
  }
  return [...values];
}

export function collectDistinctRecordNestedText(
  records,
  parentFieldName,
  fieldName,
) {
  const values = new Set();
  for (const record of records) {
    const parent = asRecord(record[parentFieldName]);
    const value = parent[fieldName];
    if (typeof value === TYPE_STRING && value.length > SOURCE_ORDER_BASE) {
      values.add(value);
    }
  }
  return [...values];
}

export function isPriorityRecoveryEventDrivenWaitWitnessSelection(selection) {
  if (selection.witnesses.length === SOURCE_ORDER_BASE) {
    return false;
  }
  if (selection.semanticStateIds.length === SOURCE_ORDER_BASE) {
    return false;
  }
  if (selection.semanticStateIds.every((semanticStateId) =>
    PRIORITY_RECOVERY_RETRYABLE_WITNESS_SEMANTIC_STATE_SET.has(
      semanticStateId,
    ),
  ) !== true) {
    return false;
  }
  return selection.witnesses.every(isPriorityRecoveryEventDrivenWaitWitness);
}

function isPriorityRecoveryEventDrivenWaitAction(nextRequiredAction) {
  return (
    nextRequiredAction ===
      PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION_WAIT_FOR_OPERATION_PROGRESS ||
    nextRequiredAction ===
      PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION_ADVANCE_EXISTING_OPERATION
  );
}

export function isPriorityRecoveryEventDrivenWaitWitness(witness) {
  return (
    textOrUnknown(witness[SOURCE_FIELD.CURRENT_OWNER]) ===
      OWNER.PRIORITY_RECOVERY &&
    textOrUnknown(witness[SOURCE_FIELD.BLOCKING_BOUNDARY]) ===
      BOUNDARY.WORKFLOW_PROGRESS &&
    textOrUnknown(witness[SOURCE_FIELD.WAIT_MODE]) ===
      PRIORITY_RECOVERY_WAIT_MODE_EVENT_DRIVEN &&
    isPriorityRecoveryEventDrivenWaitAction(
      textOrUnknown(witness[SOURCE_FIELD.NEXT_REQUIRED_ACTION]),
    )
  );
}

function isPriorityRecoveryRetryScheduledWaitWitness(witness) {
  return (
    textOrUnknown(witness[SOURCE_FIELD.CURRENT_OWNER]) ===
      OWNER.PRIORITY_RECOVERY &&
    PRIORITY_RECOVERY_RETRYABLE_WITNESS_SEMANTIC_STATE_SET.has(
      textOrUnknown(witness[SOURCE_FIELD.SEMANTIC_STATE_ID]),
    ) &&
    textOrUnknown(witness[SOURCE_FIELD.WAIT_MODE]) ===
      PRIORITY_RECOVERY_WAIT_MODE_RETRY_SCHEDULED &&
    isPriorityRecoveryEventDrivenWaitAction(
      textOrUnknown(witness[SOURCE_FIELD.NEXT_REQUIRED_ACTION]),
    )
  );
}

function isPriorityRecoveryProgressWaitWitness(witness) {
  return isPriorityRecoveryEventDrivenWaitWitness(witness) ||
    isPriorityRecoveryRetryScheduledWaitWitness(witness);
}

export function resolvePriorityRecoveryOwnerBoundary(
  progressSummary,
  topologyOperatorWitness = {},
  fallbackDominantWitness = {},
) {
  const progressSummaryDominantWitness = asRecord(
    asRecord(progressSummary)[SOURCE_FIELD.DOMINANT_WITNESS],
  );
  const dominantWitness = asRecord(
    firstRecord(
      topologyOperatorWitness,
      isPriorityRecoveryNonBlockingPartitionWitness(
        progressSummaryDominantWitness,
      ) ?
        {} :
        progressSummaryDominantWitness,
      fallbackDominantWitness,
    ),
  );
  const usesDominantWitness =
    firstText(dominantWitness[SOURCE_FIELD.OWNER], ABSENT_VALUE) !==
      ABSENT_VALUE ||
    firstText(dominantWitness[SOURCE_FIELD.BOUNDARY], ABSENT_VALUE) !==
      ABSENT_VALUE ||
    firstText(dominantWitness[SOURCE_FIELD.CURRENT_OWNER], ABSENT_VALUE) !==
      ABSENT_VALUE ||
    firstText(dominantWitness[SOURCE_FIELD.BLOCKING_BOUNDARY], ABSENT_VALUE) !==
      ABSENT_VALUE;
  return {
    owner: firstText(
      dominantWitness[SOURCE_FIELD.OWNER],
      dominantWitness[SOURCE_FIELD.CURRENT_OWNER],
      OWNER.PRIORITY_RECOVERY,
    ),
    boundary: firstText(
      dominantWitness[SOURCE_FIELD.BOUNDARY],
      dominantWitness[SOURCE_FIELD.BLOCKING_BOUNDARY],
      BOUNDARY.WORKFLOW_PROGRESS,
    ),
    usesDominantWitness,
  };
}

export function selectPriorityRecoveryClassSelection(
  progressSummaryClasses,
  progressClasses,
  witnessClasses,
  topologyOperatorWitness,
  witnessSelection,
) {
  if (hasPriorityRecoveryEventDrivenWitnessEvidence(witnessSelection)) {
    return {
      source: PRIORITY_RECOVERY_EVIDENCE_SOURCE_PARTITION_WITNESSES,
      classes: witnessClasses,
    };
  }
  if (isTopologyOperatorWitnessPresent(topologyOperatorWitness)) {
    return {
      source: PRIORITY_RECOVERY_EVIDENCE_SOURCE_TOPOLOGY_OPERATOR_WITNESS,
      classes: buildPriorityRecoveryClassesFromTopologyOperatorWitness(
        topologyOperatorWitness,
      ),
    };
  }
  if (hasPriorityRecoveryClassEvidence(progressSummaryClasses)) {
    return {
      source: PRIORITY_RECOVERY_EVIDENCE_SOURCE_SUMMARY,
      classes: progressSummaryClasses,
    };
  }
  if (hasPriorityRecoveryClassEvidence(progressClasses)) {
    return {
      source: PRIORITY_RECOVERY_EVIDENCE_SOURCE_PROGRESS,
      classes: progressClasses,
    };
  }
  if (hasPriorityRecoveryClassContract(progressClasses)) {
    return {
      source: PRIORITY_RECOVERY_EVIDENCE_SOURCE_PROGRESS,
      classes: progressClasses,
    };
  }
  if (hasPriorityRecoveryClassContract(progressSummaryClasses)) {
    return {
      source: PRIORITY_RECOVERY_EVIDENCE_SOURCE_SUMMARY,
      classes: progressSummaryClasses,
    };
  }
  if (hasPriorityRecoveryClassEvidence(witnessClasses)) {
    return {
      source: PRIORITY_RECOVERY_EVIDENCE_SOURCE_PARTITION_WITNESSES,
      classes: witnessClasses,
    };
  }
  if (Object.keys(progressSummaryClasses).length > SOURCE_ORDER_BASE) {
    return {
      source: PRIORITY_RECOVERY_EVIDENCE_SOURCE_SUMMARY,
      classes: progressSummaryClasses,
    };
  }
  return {
    source: PRIORITY_RECOVERY_EVIDENCE_SOURCE_PROGRESS,
    classes: progressClasses,
  };
}

function hasPriorityRecoveryEventDrivenWitnessEvidence(witnessSelection = {}) {
  return (
    witnessSelection.eventDrivenWait === true &&
    hasPriorityRecoveryClassEvidence(witnessSelection.classes)
  );
}

function buildPriorityRecoveryWitnessProgressContract(
  witness,
  evidencePath,
) {
  if (!isPriorityRecoveryProgressWaitWitness(witness)) {
    return null;
  }
  return {
    owner: firstText(
      witness[SOURCE_FIELD.OWNER],
      witness[SOURCE_FIELD.CURRENT_OWNER],
      OWNER.PRIORITY_RECOVERY,
    ),
    boundary: firstText(
      witness[SOURCE_FIELD.BOUNDARY],
      witness[SOURCE_FIELD.BLOCKING_BOUNDARY],
      BOUNDARY.WORKFLOW_PROGRESS,
    ),
    state: firstText(
      witness[PRIORITY_RECOVERY_WITNESS_PROGRESS_CONTRACT_FIELD.STATE],
      witness[SOURCE_FIELD.NEXT_REQUIRED_ACTION],
    ),
    reason: firstText(
      witness[SOURCE_FIELD.NEXT_REQUIRED_ACTION],
      PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION_WAIT_FOR_OPERATION_PROGRESS,
    ),
    nextAction: firstText(
      witness[PRIORITY_RECOVERY_WITNESS_PROGRESS_CONTRACT_FIELD.NEXT_ACTION],
      witness[SOURCE_FIELD.NEXT_ACTION],
      witness[SOURCE_FIELD.NEXT_REQUIRED_ACTION],
    ),
    wakeSource:
      textOrUnknown(witness[SOURCE_FIELD.WAIT_MODE]) ===
        PRIORITY_RECOVERY_WAIT_MODE_EVENT_DRIVEN ?
        PRIORITY_RECOVERY_WITNESS_PROGRESS_CONTRACT_WAKE_SOURCE.EVENT_DRIVEN :
        PRIORITY_RECOVERY_WITNESS_PROGRESS_CONTRACT_WAKE_SOURCE
          .RETRY_SCHEDULED,
    retryAfterMs:
      Number.isFinite(
        witness[PRIORITY_RECOVERY_WITNESS_PROGRESS_CONTRACT_FIELD
          .RETRY_AFTER_MS],
      ) ?
        Math.max(
          SOURCE_ORDER_BASE,
          Math.floor(
            witness[PRIORITY_RECOVERY_WITNESS_PROGRESS_CONTRACT_FIELD
              .RETRY_AFTER_MS],
          ),
        ) :
        SOURCE_ORDER_BASE,
    terminalState: PRIORITY_RECOVERY_WITNESS_PROGRESS_CONTRACT_TERMINAL_STATE,
    evidencePath,
    blockingDependency: firstText(
      witness[SOURCE_FIELD.BLOCKING_BOUNDARY],
      BOUNDARY.WORKFLOW_PROGRESS,
    ),
  };
}

export function buildPriorityRecoveryClassesFromTopologyOperatorWitness(witness) {
  const currentState = textOrUnknown(witness[SOURCE_FIELD.CURRENT_STEP_STATE]);
  const semanticStateIds =
    currentState === 'terminal' ?
      [] :
      ['recovering_in_flight']; // PRIORITY_RECOVERY_SEMANTIC_RECOVERING_IN_FLIGHT
  const blockedPartitionIds =
    currentState === 'blocked' ?
      [textOrUnknown(witness[SOURCE_FIELD.PARTITION_ID])] :
      [];
  return {
    unresolvedSemanticStateIds: semanticStateIds,
    blockedPartitionIds: blockedPartitionIds.filter((partitionId) =>
      partitionId !== UNKNOWN_VALUE,
    ),
  };
}

export function hasPriorityRecoveryClassEvidence(classes) {
  const progressClasses = asRecord(classes);
  return arrayOrEmpty(
    progressClasses.unresolvedSemanticStateIds,
  ).length > SOURCE_ORDER_BASE ||
    arrayOrEmpty(progressClasses.blockedPartitionIds).length >
      SOURCE_ORDER_BASE;
}

export function hasPriorityRecoveryClassContract(classes) {
  return Object.keys(asRecord(classes)).length > SOURCE_ORDER_BASE;
}

export function selectPriorityRecoveryEvidencePath(normalized, evidenceSource, ownerBoundary) {
  if (
    evidenceSource ===
      PRIORITY_RECOVERY_EVIDENCE_SOURCE_TOPOLOGY_OPERATOR_WITNESS &&
    normalized.evidencePath.topologyOperatorWitness !== ABSENT_VALUE
  ) {
    return normalized.evidencePath.topologyOperatorWitness;
  }
  if (
    evidenceSource === PRIORITY_RECOVERY_EVIDENCE_SOURCE_PARTITION_WITNESSES &&
    normalized.evidencePath.priorityRecoveryPartitionWitnesses !== ABSENT_VALUE
  ) {
    return normalized.evidencePath.priorityRecoveryPartitionWitnesses;
  }
  if (evidenceSource === PRIORITY_RECOVERY_EVIDENCE_SOURCE_PROGRESS) {
    return normalized.evidencePath.priorityRecoveryProgressClasses;
  }
  if (evidenceSource === PRIORITY_RECOVERY_EVIDENCE_SOURCE_SUMMARY &&
      normalized.evidencePath.priorityRecoveryProgressSummary !== ABSENT_VALUE) {
    return normalized.evidencePath.priorityRecoveryProgressSummary;
  }
  if (ownerBoundary.usesDominantWitness &&
      normalized.evidencePath.priorityRecoveryDominantWitness !== ABSENT_VALUE) {
    return normalized.evidencePath.priorityRecoveryDominantWitness;
  }
  return normalized.evidencePath.priorityRecoveryProgressClasses;
}

export function normalizePriorityRecoveryEvidence(normalized) {
  const progress = normalized.progress;
  const progressSummary = normalized.progressSummary;
  const progressClasses = asRecord(progress.priorityRecoveryProgressClasses);
  const progressSummaryClasses = asRecord(
    progressSummary[SOURCE_FIELD.PRIORITY_RECOVERY_PROGRESS_CLASSES],
  );
  const topologyOperatorWitness =
    selectTopologyOperatorWitness(normalized);
  const witnessSelection = buildPriorityRecoveryWitnessSelection(
    normalized.priorityRecoveryPartitionWitnesses,
  );
  const ownerBoundary = resolvePriorityRecoveryOwnerBoundary(
    progressSummary,
    topologyOperatorWitness,
    witnessSelection.dominantWitness,
  );
  const classSelection = selectPriorityRecoveryClassSelection(
    progressSummaryClasses,
    progressClasses,
    witnessSelection.classes,
    topologyOperatorWitness,
    witnessSelection,
  );
  const evidencePath = selectPriorityRecoveryEvidencePath(
    normalized,
    classSelection.source,
    ownerBoundary,
  );

  return {
    owner: ownerBoundary.owner,
    boundary: ownerBoundary.boundary,
    evidencePath,
    priorityBlockedPartitionCount: firstFiniteNumber(
      progressSummary.priorityBlockedPartitionCount,
      progress.priorityBlockedPartitionCount,
      classSelection.source ===
        PRIORITY_RECOVERY_EVIDENCE_SOURCE_PARTITION_WITNESSES ?
        witnessSelection.classes.blockedPartitionIds.length :
        UNKNOWN_VALUE,
    ),
    semanticStateIds: arrayOrEmpty(classSelection.classes.unresolvedSemanticStateIds),
    blockedPartitionIds: arrayOrEmpty(classSelection.classes.blockedPartitionIds),
    waitModes: classSelection.source ===
      PRIORITY_RECOVERY_EVIDENCE_SOURCE_PARTITION_WITNESSES ?
      witnessSelection.waitModes :
      [],
    nextRequiredActions: classSelection.source ===
      PRIORITY_RECOVERY_EVIDENCE_SOURCE_PARTITION_WITNESSES ?
      witnessSelection.nextRequiredActions :
      [],
    actuationStates: classSelection.source ===
      PRIORITY_RECOVERY_EVIDENCE_SOURCE_PARTITION_WITNESSES ?
      witnessSelection.actuationStates :
      [],
    operationOwnerEffectExecutions: classSelection.source ===
      PRIORITY_RECOVERY_EVIDENCE_SOURCE_PARTITION_WITNESSES ?
      witnessSelection.operationOwnerEffectExecutions :
      [],
    operationOwnerEffectCommands: classSelection.source ===
      PRIORITY_RECOVERY_EVIDENCE_SOURCE_PARTITION_WITNESSES ?
      witnessSelection.operationOwnerEffectCommands :
      [],
    operationOwnerRequestedActions: classSelection.source ===
      PRIORITY_RECOVERY_EVIDENCE_SOURCE_PARTITION_WITNESSES ?
      witnessSelection.operationOwnerRequestedActions :
      [],
    eventDrivenWait: classSelection.source ===
      PRIORITY_RECOVERY_EVIDENCE_SOURCE_PARTITION_WITNESSES &&
      witnessSelection.eventDrivenWait === true,
    topologyOperatorWitness,
    topologyOperatorWitnessState:
      textOrUnknown(
        topologyOperatorWitness[SOURCE_FIELD.CURRENT_STEP_STATE],
      ),
    topologyOperatorWitnessNextAction:
      textOrUnknown(topologyOperatorWitness[SOURCE_FIELD.NEXT_ACTION]),
    progressContract:
      classSelection.source ===
        PRIORITY_RECOVERY_EVIDENCE_SOURCE_PARTITION_WITNESSES ?
        buildPriorityRecoveryWitnessProgressContract(
          witnessSelection.dominantWitness,
          evidencePath,
        ) :
        null,
  };
}
