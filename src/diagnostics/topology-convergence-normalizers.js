import {
  ABSENT_VALUE,
  UNKNOWN_VALUE,
  SOURCE_ORDER_BASE,
  FIRST_FRONTIER_INDEX,
  TYPE_OBJECT,
  TYPE_STRING,
  BOOLEAN_TRUE_TEXT,
  BOOLEAN_FALSE_TEXT,
  TOPOLOGY_CONVERGENCE_EMPTY_REASON_LIST,
  PUBLICATION_STATUS_PUBLISHED,
  PUBLICATION_RECOVERY_PROTOCOL_UNPUBLISHED_OBSERVATION,
  PUBLICATION_OWNER_ACK_STATE_ACKNOWLEDGED,
  PUBLICATION_OWNER_ACK_STATE_NOT_REQUIRED,
  PUBLICATION_OWNER_FRESHNESS_FENCE_CONSUMER_LAG,
  PUBLICATION_OWNER_RECOVERY_OUTCOME_WAITING_FOR_CONSUMER,
  PUBLICATION_OWNER_REVISION_STATE_CURRENT,
  PUBLICATION_OWNER_STREAM_OUTCOME_STALE,
  PUBLICATION_PENDING_STATUS_SET,
  OWNER,
  BOUNDARY,
  SOURCE_PATH,
  SOURCE_FIELD,
  PRIORITY_RECOVERY_EVIDENCE_SOURCE_SUMMARY,
  PRIORITY_RECOVERY_EVIDENCE_SOURCE_PROGRESS,
  PRIORITY_RECOVERY_EVIDENCE_SOURCE_PARTITION_WITNESSES,
  PRIORITY_RECOVERY_EVIDENCE_SOURCE_TOPOLOGY_OPERATOR_WITNESS,
  PRIORITY_RECOVERY_NON_BLOCKING_WITNESS_SEMANTIC_STATE_SET,
  PRIORITY_RECOVERY_RETRYABLE_WITNESS_SEMANTIC_STATE_SET,
  PRIORITY_RECOVERY_WAIT_MODE_EVENT_DRIVEN,
  PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION_WAIT_FOR_OPERATION_PROGRESS,
  READINESS_SUPPORT_PATH,
  READINESS_RECOVERABILITY_RULES,
  READINESS_INHERITED_ACTIVE_GATE_SUPPORT_RULES,
  LIST_SEPARATOR,
} from './topology-convergence-constants.js';

import {
  buildPublicationActiveGateHandoffContract,
} from '../control-plane/publication-active-gate-handoff-contract.js';

// Base Normalizers & Utilities
export function asRecord(value) {
  if (value && typeof value === TYPE_OBJECT && !Array.isArray(value)) {
    return value;
  }
  return {};
}

export function arrayOrEmpty(value) {
  if (Array.isArray(value)) {
    return value;
  }
  return [];
}

export function firstText(...values) {
  for (const value of values) {
    if (typeof value === TYPE_STRING && value.length > SOURCE_ORDER_BASE) {
      return value;
    }
  }
  return UNKNOWN_VALUE;
}

export function textOrUnknown(value) {
  if (typeof value === TYPE_STRING && value.length > SOURCE_ORDER_BASE) {
    return value;
  }
  return UNKNOWN_VALUE;
}

export function numberOrZero(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return SOURCE_ORDER_BASE;
  }
  return parsed;
}

export function numberOrUnknown(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return UNKNOWN_VALUE;
  }
  return parsed;
}

export function booleanVariant(value) {
  if (value === true) {
    return BOOLEAN_TRUE_TEXT;
  }
  if (value === false) {
    return BOOLEAN_FALSE_TEXT;
  }
  return UNKNOWN_VALUE;
}

export function parseBooleanVariant(value) {
  if (value === true || value === BOOLEAN_TRUE_TEXT) {
    return true;
  }
  if (value === false || value === BOOLEAN_FALSE_TEXT) {
    return false;
  }
  return UNKNOWN_VALUE;
}

export function compareNumber(left, right) {
  return left - right;
}

export function firstFiniteNumber(...values) {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return SOURCE_ORDER_BASE;
}

export function flattenEvidencePath(parentPath, childPath) {
  if (!parentPath || parentPath === ABSENT_VALUE) {
    return childPath;
  }
  return `${parentPath}.${childPath}`;
}

export function firstRecord(...values) {
  for (const value of values) {
    const record = asRecord(value);
    if (Object.keys(record).length > SOURCE_ORDER_BASE) {
      return record;
    }
  }
  return {};
}

export function firstArray(...values) {
  for (const value of values) {
    if (Array.isArray(value) && value.length > SOURCE_ORDER_BASE) {
      return value;
    }
  }
  return [];
}

export function recordCandidate(record, sourcePath) {
  return {record, sourcePath};
}

export function arrayCandidate(items, sourcePath) {
  return {items, sourcePath};
}

export function firstRecordWithSource(...candidates) {
  for (const candidate of candidates) {
    const record = asRecord(candidate.record);
    if (Object.keys(record).length > SOURCE_ORDER_BASE) {
      return {
        record,
        sourcePath: candidate.sourcePath || ABSENT_VALUE,
      };
    }
  }
  return {
    record: {},
    sourcePath: ABSENT_VALUE,
  };
}

export function firstArrayWithSource(...candidates) {
  for (const candidate of candidates) {
    const items = arrayOrEmpty(candidate.items);
    if (items.length > SOURCE_ORDER_BASE) {
      return {
        items,
        sourcePath: candidate.sourcePath || ABSENT_VALUE,
      };
    }
  }
  return {
    items: [],
    sourcePath: ABSENT_VALUE,
  };
}

// Scenarios & Reports
export function firstScenario(report) {
  const scenarios = arrayOrEmpty(report.scenarios);
  return asRecord(scenarios[FIRST_FRONTIER_INDEX]);
}

export function selectReportRecord(input) {
  const explicitReport = asRecord(input.report);
  if (hasReportScenarioEvidence(explicitReport)) {
    return explicitReport;
  }
  if (hasReportScenarioEvidence(input)) {
    return input;
  }
  return {};
}

export function hasReportScenarioEvidence(record) {
  return Object.keys(firstScenario(asRecord(record))).length > SOURCE_ORDER_BASE;
}

export function selectDirectFailureBundleRecord(input, report) {
  if (Object.keys(asRecord(report)).length > SOURCE_ORDER_BASE) {
    return {};
  }
  if (Object.keys(asRecord(input.failureBundle)).length > SOURCE_ORDER_BASE) {
    return {};
  }
  if (hasDirectFailureBundleEvidence(input)) {
    return input;
  }
  return {};
}

export function hasDirectFailureBundleEvidence(record) {
  const directEvidenceRecords = [
    asRecord(record.publicationConvergence),
    asRecord(record.readiness),
    asRecord(record.topFailures),
  ];
  return directEvidenceRecords.some((evidenceRecord) => (
    Object.keys(evidenceRecord).length > SOURCE_ORDER_BASE
  ));
}

export function hasFailureBundleEvidence(record) {
  const evidenceRecords = [
    asRecord(record.summary),
    asRecord(record.publicationConvergence),
    asRecord(record.readiness),
    asRecord(record.topFailures),
  ];
  return evidenceRecords.some((evidenceRecord) => (
    Object.keys(evidenceRecord).length > SOURCE_ORDER_BASE
  ));
}

export function firstFailureBundleEvidenceRecordWithSource(...candidates) {
  for (const candidate of candidates) {
    const record = asRecord(candidate.record);
    if (hasFailureBundleEvidence(record)) {
      return {
        record,
        sourcePath: candidate.sourcePath || ABSENT_VALUE,
      };
    }
  }
  return {
    record: {},
    sourcePath: ABSENT_VALUE,
  };
}

// Publication normalizers
export function isClosedPublicationOwnerAckState(ackState) {
  return ackState === PUBLICATION_OWNER_ACK_STATE_ACKNOWLEDGED ||
    ackState === PUBLICATION_OWNER_ACK_STATE_NOT_REQUIRED;
}

export function normalizePublicationOwnerStreamEvidence(publication) {
  const publicationOwnerStream = asRecord(publication.publicationOwnerStream);
  const revision = asRecord(publicationOwnerStream.revision);
  return {
    ackState: textOrUnknown(
      publication.ackState || publicationOwnerStream.ackState,
    ),
    freshnessFence: textOrUnknown(
      publication.freshnessFence || publicationOwnerStream.freshnessFence,
    ),
    recoveryOutcome: textOrUnknown(
      publication.recoveryOutcome || publicationOwnerStream.recoveryOutcome,
    ),
    revisionState: textOrUnknown(revision.state),
    streamOutcome: textOrUnknown(
      publication.streamOutcome || publicationOwnerStream.streamOutcome,
    ),
  };
}

export function isNonTerminalTopologyOperatorWitness(witness) {
  const record = asRecord(witness);
  if (!isTopologyOperatorWitnessPresent(record)) {
    return false;
  }
  return textOrUnknown(record[SOURCE_FIELD.CURRENT_STEP_STATE]) !==
    'terminal'; // TOPOLOGY_OPERATOR_CURRENT_STEP_STATE_TERMINAL
}

export function normalizePublicationEvidence(publication) {
  const ownerStreamEvidence =
    normalizePublicationOwnerStreamEvidence(publication);
  const topologyOperatorWitness = asRecord(
    publication[SOURCE_FIELD.TOPOLOGY_OPERATOR_WITNESS],
  );
  return {
    publicationStatus: textOrUnknown(publication.publicationStatus),
    publicationPending: publication.publicationPending === true,
    recoveryProtocolState: textOrUnknown(publication.recoveryProtocolState),
    pendingAckCount: numberOrZero(publication.pendingAckCount),
    blockedNodeCount: numberOrZero(publication.blockedNodeCount),
    missingPublishedCount: numberOrZero(publication.missingPublishedCount),
    missingPublishedNodeIds: arrayOrEmpty(publication.missingPublishedNodeIds),
    prioritySpreadPending: publication.prioritySpreadPending === true,
    topologyOperatorWitness,
    ...ownerStreamEvidence,
    source: {
      publicationEpoch: numberOrUnknown(publication.publicationEpoch),
      publicationStatus: textOrUnknown(publication.publicationStatus),
      pendingAckNodeIds: arrayOrEmpty(publication.pendingAckNodeIds),
      pendingAckCount: numberOrUnknown(publication.pendingAckCount),
      blockedNodeCount: numberOrUnknown(publication.blockedNodeCount),
      publishedActiveNodeIds: arrayOrEmpty(publication.publishedActiveNodeIds),
      missingPublishedNodeIds: arrayOrEmpty(publication.missingPublishedNodeIds),
      missingPublishedCount: numberOrUnknown(publication.missingPublishedCount),
      publicationPending: booleanVariant(publication.publicationPending),
      recoveryProtocolState: textOrUnknown(publication.recoveryProtocolState),
      prioritySpreadPending: booleanVariant(publication.prioritySpreadPending),
      publicationOwnerAckState: ownerStreamEvidence.ackState,
      publicationOwnerFreshnessFence: ownerStreamEvidence.freshnessFence,
      publicationOwnerRecoveryOutcome: ownerStreamEvidence.recoveryOutcome,
      publicationOwnerRevisionState: ownerStreamEvidence.revisionState,
      publicationOwnerStreamOutcome: ownerStreamEvidence.streamOutcome,
      ...buildTopologyOperatorWitnessDiagnosticSource(
        topologyOperatorWitness,
      ),
    },
  };
}

export function isTopologyOperatorWitnessPresent(witness) {
  return (
    Object.keys(asRecord(witness)).length > SOURCE_ORDER_BASE &&
    textOrUnknown(witness[SOURCE_FIELD.CURRENT_STEP_ID]) !== UNKNOWN_VALUE &&
    textOrUnknown(witness[SOURCE_FIELD.NEXT_ACTION]) !== UNKNOWN_VALUE
  );
}

export function buildTopologyOperatorWitnessDiagnosticSource(witness) {
  const record = asRecord(witness);
  if (!isTopologyOperatorWitnessPresent(record)) {
    return {};
  }
  return {
    topologyOperatorId: textOrUnknown(record[SOURCE_FIELD.OPERATOR_ID]),
    topologyOperatorKind: textOrUnknown(record[SOURCE_FIELD.KIND]),
    topologyOperatorCurrentStepId: textOrUnknown(
      record[SOURCE_FIELD.CURRENT_STEP_ID],
    ),
    topologyOperatorCurrentStepState: textOrUnknown(
      record[SOURCE_FIELD.CURRENT_STEP_STATE],
    ),
    topologyOperatorNextAction: textOrUnknown(
      record[SOURCE_FIELD.NEXT_ACTION],
    ),
  };
}

export function isPublicationPendingEvidence(evidence) {
  return (
    (evidence.publicationPending === true &&
      evidence.missingPublishedCount === SOURCE_ORDER_BASE) ||
    PUBLICATION_PENDING_STATUS_SET.has(evidence.publicationStatus) ||
    evidence.recoveryProtocolState === 'publication_pending'
  );
}

export function isPublicationConsumerLagEvidence(evidence) {
  return evidence.publicationStatus === PUBLICATION_STATUS_PUBLISHED &&
    evidence.pendingAckCount === SOURCE_ORDER_BASE &&
    isClosedPublicationOwnerAckState(evidence.ackState) &&
    evidence.revisionState === PUBLICATION_OWNER_REVISION_STATE_CURRENT &&
    evidence.streamOutcome === PUBLICATION_OWNER_STREAM_OUTCOME_STALE &&
    evidence.freshnessFence ===
      PUBLICATION_OWNER_FRESHNESS_FENCE_CONSUMER_LAG &&
    evidence.recoveryOutcome ===
      PUBLICATION_OWNER_RECOVERY_OUTCOME_WAITING_FOR_CONSUMER;
}

export function hasPublicationMissingPublishedEvidence(evidence) {
  return evidence.missingPublishedCount > SOURCE_ORDER_BASE ||
    evidence.missingPublishedNodeIds.length > SOURCE_ORDER_BASE;
}

export function isPublicationMissingPublishedEvidence(evidence) {
  return hasPublicationMissingPublishedEvidence(evidence) &&
    evidence.prioritySpreadPending !== true &&
    isPublicationConsumerLagEvidence(evidence) !== true;
}

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

  return {
    witnesses: blockingWitnesses,
    dominantWitness: blockingWitnesses[FIRST_FRONTIER_INDEX] || {},
    classes: {
      unresolvedSemanticStateIds: semanticStateIds,
      blockedPartitionIds,
    },
    waitModes,
    nextRequiredActions,
    actuationStates,
    eventDrivenWait: isPriorityRecoveryEventDrivenWaitWitnessSelection({
      witnesses: normalizedWitnesses,
      semanticStateIds,
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

export function isPriorityRecoveryEventDrivenWaitWitness(witness) {
  return (
    textOrUnknown(witness[SOURCE_FIELD.CURRENT_OWNER]) ===
      OWNER.PRIORITY_RECOVERY &&
    textOrUnknown(witness[SOURCE_FIELD.BLOCKING_BOUNDARY]) ===
      BOUNDARY.WORKFLOW_PROGRESS &&
    textOrUnknown(witness[SOURCE_FIELD.WAIT_MODE]) ===
      PRIORITY_RECOVERY_WAIT_MODE_EVENT_DRIVEN &&
    textOrUnknown(witness[SOURCE_FIELD.NEXT_REQUIRED_ACTION]) ===
      PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION_WAIT_FOR_OPERATION_PROGRESS
  );
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
) {
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
  );

  return {
    owner: ownerBoundary.owner,
    boundary: ownerBoundary.boundary,
    evidencePath: selectPriorityRecoveryEvidencePath(
      normalized,
      classSelection.source,
      ownerBoundary,
    ),
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
  };
}

// Readiness Normalizers
export function resolveReadinessSupportPath(readiness, activeGate) {
  const snapshot = {
    activeGateState: textOrUnknown(asRecord(activeGate).state),
    classCode: textOrUnknown(readiness.classCode),
    terminalReason: textOrUnknown(readiness.terminalReason),
    source: textOrUnknown(readiness.source),
    cause: textOrUnknown(readiness.cause),
  };
  if (READINESS_INHERITED_ACTIVE_GATE_SUPPORT_RULES.some((rule) =>
    rule.matches(snapshot),
  )) {
    return READINESS_SUPPORT_PATH.INHERITED_ACTIVE_GATE_NO_PROGRESS;
  }
  return READINESS_SUPPORT_PATH.READINESS_FAILURE;
}

export function resolveReadinessRecoverability(readiness) {
  const snapshot = {
    recoverability: textOrUnknown(readiness.recoverability),
    classCode: textOrUnknown(readiness.classCode),
    terminalReason: textOrUnknown(readiness.terminalReason),
  };
  const decision = READINESS_RECOVERABILITY_RULES.find((rule) =>
    rule.matches(snapshot),
  );
  return decision.recoverability;
}

export function normalizeReadinessSupportEvidence(readinessFailure, activeGate) {
  const readiness = asRecord(readinessFailure);
  const recoverability = resolveReadinessRecoverability(readiness);
  const supportPath = resolveReadinessSupportPath(readiness, activeGate);
  return {
    ...readiness,
    recoverability,
    supportPath,
  };
}

// Top Reasons Normalizer
export function normalizeTopReasons(topReasons) {
  return arrayOrEmpty(topReasons).map((entry) => ({
    reason: textOrUnknown(entry?.reason),
    count: numberOrZero(entry?.count),
  }));
}

// Replayable Contract
export function hasPublicationActiveGateHandoffContract(handoff) {
  const record = asRecord(handoff);
  return textOrUnknown(record.state) !== UNKNOWN_VALUE ||
    textOrUnknown(record.reasonCode) !== UNKNOWN_VALUE ||
    textOrUnknown(record.nextAction) !== UNKNOWN_VALUE;
}

export function hasReplayableNoDebtPublicationPendingOwnerEvidence(publication) {
  return parseBooleanVariant(publication.publicationPending) === true &&
    textOrUnknown(publication.recoveryProtocolState) ===
      PUBLICATION_RECOVERY_PROTOCOL_UNPUBLISHED_OBSERVATION &&
    numberOrZero(publication.pendingAckCount) === SOURCE_ORDER_BASE &&
    arrayOrEmpty(publication.pendingAckNodeIds).length === SOURCE_ORDER_BASE &&
    numberOrZero(publication.missingPublishedCount) === SOURCE_ORDER_BASE &&
    arrayOrEmpty(publication.missingPublishedNodeIds).length ===
      SOURCE_ORDER_BASE &&
    parseBooleanVariant(publication.prioritySpreadPending) !== true;
}

export function buildReplayablePublicationActiveGateHandoffFromOwnerEvidence({
  publicationActiveGateHandoff,
  publication,
  progress,
}) {
  if (hasPublicationActiveGateHandoffContract(publicationActiveGateHandoff)) {
    return publicationActiveGateHandoff;
  }
  if (!hasReplayableNoDebtPublicationPendingOwnerEvidence(publication)) {
    return publicationActiveGateHandoff;
  }
  return buildPublicationActiveGateHandoffContract({
    publicationConvergence: {
      publicationEpoch: numberOrUnknown(publication.publicationEpoch),
      publicationStatus: textOrUnknown(publication.publicationStatus),
      recoveryProtocolState: textOrUnknown(publication.recoveryProtocolState),
      publicationPending: parseBooleanVariant(publication.publicationPending),
      pendingAckNodeIds: arrayOrEmpty(publication.pendingAckNodeIds),
      pendingAckCount: numberOrZero(publication.pendingAckCount),
      missingPublishedNodeIds: arrayOrEmpty(publication.missingPublishedNodeIds),
      missingPublishedCount: numberOrZero(publication.missingPublishedCount),
      publishedActiveNodeIds: arrayOrEmpty(publication.publishedActiveNodeIds),
      prioritySpreadPending:
        parseBooleanVariant(publication.prioritySpreadPending),
    },
    activeGateProgress: progress,
  });
}

// Master input normalizer
export function normalizeTopologyConvergenceInput(input = {}) {
  const report = selectReportRecord(input);
  const scenario = firstScenario(report);
  const directFailureBundle = selectDirectFailureBundleRecord(input, report);
  const failureBundleEvidence = firstFailureBundleEvidenceRecordWithSource(
    recordCandidate(input.failureBundle, SOURCE_PATH.FAILURE_BUNDLE),
    recordCandidate(directFailureBundle, SOURCE_PATH.FAILURE_BUNDLE),
    recordCandidate(report.failureBundle, SOURCE_PATH.REPORT_FAILURE_BUNDLE),
    recordCandidate(
      scenario.failureBundle,
      SOURCE_PATH.REPORT_SCENARIO_FAILURE_BUNDLE,
    ),
  );
  const failureBundle = failureBundleEvidence.record;
  const triageSummary = asRecord(input.triageSummary || input.triage);
  const priorityRecoveryObservation = asRecord(scenario.priorityRecoveryObservation);
  const summary = firstRecord(
    failureBundle.summary,
    triageSummary.summary,
    scenario.summary,
    scenario,
    report.summary,
  );
  const topFailures = firstRecord(failureBundle.topFailures, triageSummary.topFailures);
  const publicationEvidence = firstRecordWithSource(
    recordCandidate(failureBundle.publicationConvergence, SOURCE_PATH.FAILURE_BUNDLE_PUBLICATION),
    recordCandidate(triageSummary.publicationConvergence, SOURCE_PATH.TRIAGE_PUBLICATION),
    recordCandidate(scenario.publicationConvergence, SOURCE_PATH.REPORT_SCENARIO_PUBLICATION),
    recordCandidate(
      priorityRecoveryObservation,
      SOURCE_PATH.REPORT_SCENARIO_PRIORITY_RECOVERY_OBSERVATION,
    ),
    recordCandidate(summary.publicationConvergence, SOURCE_PATH.FAILURE_BUNDLE_SUMMARY),
  );
  const publication = publicationEvidence.record;
  const activeGateEvidence = firstRecordWithSource(
    recordCandidate(
      publication.activeGate,
      flattenEvidencePath(publicationEvidence.sourcePath, SOURCE_FIELD.ACTIVE_GATE),
    ),
    recordCandidate(
      priorityRecoveryObservation.activeGate,
      flattenEvidencePath(
        SOURCE_PATH.REPORT_SCENARIO_PRIORITY_RECOVERY_OBSERVATION,
        SOURCE_FIELD.ACTIVE_GATE,
      ),
    ),
    recordCandidate(
      summary.publicationConvergence?.activeGate,
      flattenEvidencePath(SOURCE_PATH.FAILURE_BUNDLE_SUMMARY, SOURCE_FIELD.ACTIVE_GATE),
    ),
  );
  const activeGate = activeGateEvidence.record;
  const progressEvidence = firstRecordWithSource(
    recordCandidate(
      activeGate.progress,
      flattenEvidencePath(activeGateEvidence.sourcePath, SOURCE_FIELD.PROGRESS),
    ),
    recordCandidate(
      activeGate.bestProgress,
      flattenEvidencePath(activeGateEvidence.sourcePath, SOURCE_FIELD.BEST_PROGRESS),
    ),
    recordCandidate(
      priorityRecoveryObservation.activeGateProgress,
      flattenEvidencePath(
        SOURCE_PATH.REPORT_SCENARIO_PRIORITY_RECOVERY_OBSERVATION,
        SOURCE_FIELD.ACTIVE_GATE_PROGRESS,
      ),
    ),
    recordCandidate(scenario.priorityRecoveryProgress, SOURCE_PATH.REPORT_SCENARIO),
    recordCandidate(scenario.priorityRecoveryProgressSummary, SOURCE_PATH.REPORT_SCENARIO),
  );
  const progress = progressEvidence.record;
  const publicationActiveGateHandoffEvidence = firstRecordWithSource(
    recordCandidate(
      publication[SOURCE_FIELD.PUBLICATION_ACTIVE_GATE_HANDOFF],
      flattenEvidencePath(
        publicationEvidence.sourcePath,
        SOURCE_FIELD.PUBLICATION_ACTIVE_GATE_HANDOFF,
      ),
    ),
    recordCandidate(
      progress[SOURCE_FIELD.PUBLICATION_ACTIVE_GATE_HANDOFF],
      flattenEvidencePath(
        progressEvidence.sourcePath,
        SOURCE_FIELD.PUBLICATION_ACTIVE_GATE_HANDOFF,
      ),
    ),
  );
  const explicitPublicationActiveGateHandoff =
    publicationActiveGateHandoffEvidence.record;
  const synthesizedPublicationActiveGateHandoff =
    buildReplayablePublicationActiveGateHandoffFromOwnerEvidence({
      publicationActiveGateHandoff: explicitPublicationActiveGateHandoff,
      publication,
      progress,
    });
  const publicationActiveGateHandoff =
    hasPublicationActiveGateHandoffContract(
      explicitPublicationActiveGateHandoff,
    ) ?
      explicitPublicationActiveGateHandoff :
      synthesizedPublicationActiveGateHandoff;
  const publicationActiveGateHandoffSourcePath =
    hasPublicationActiveGateHandoffContract(
      explicitPublicationActiveGateHandoff,
    ) ?
      publicationActiveGateHandoffEvidence.sourcePath :
      (
        hasPublicationActiveGateHandoffContract(
          synthesizedPublicationActiveGateHandoff,
        ) ?
          publicationEvidence.sourcePath :
          publicationActiveGateHandoffEvidence.sourcePath
      );
  const progressSummaryEvidence = firstRecordWithSource(
    recordCandidate(
      publication.priorityRecoveryProgressSummary,
      flattenEvidencePath(
        publicationEvidence.sourcePath,
        SOURCE_FIELD.PRIORITY_RECOVERY_PROGRESS_SUMMARY,
      ),
    ),
    recordCandidate(
      scenario.priorityRecoveryProgressSummary,
      flattenEvidencePath(
        SOURCE_PATH.REPORT_SCENARIO,
        SOURCE_FIELD.PRIORITY_RECOVERY_PROGRESS_SUMMARY,
      ),
    ),
  );
  const progressSummary = progressSummaryEvidence.record;
  const topologyOperatorWitnessEvidence = firstRecordWithSource(
    recordCandidate(
      progressSummary[SOURCE_FIELD.TOPOLOGY_OPERATOR_WITNESS],
      flattenEvidencePath(
        progressSummaryEvidence.sourcePath,
        SOURCE_FIELD.TOPOLOGY_OPERATOR_WITNESS,
      ),
    ),
    recordCandidate(
      progress[SOURCE_FIELD.TOPOLOGY_OPERATOR_WITNESS],
      flattenEvidencePath(
        progressEvidence.sourcePath,
        SOURCE_FIELD.TOPOLOGY_OPERATOR_WITNESS,
      ),
    ),
    recordCandidate(
      publication[SOURCE_FIELD.TOPOLOGY_OPERATOR_WITNESS],
      flattenEvidencePath(
        publicationEvidence.sourcePath,
        SOURCE_FIELD.TOPOLOGY_OPERATOR_WITNESS,
      ),
    ),
  );
  const priorityRecoveryPartitionWitnessesEvidence = firstArrayWithSource(
    arrayCandidate(
      publication[SOURCE_FIELD.PRIORITY_RECOVERY_PARTITION_WITNESSES],
      flattenEvidencePath(
        publicationEvidence.sourcePath,
        SOURCE_FIELD.PRIORITY_RECOVERY_PARTITION_WITNESSES,
      ),
    ),
    arrayCandidate(
      priorityRecoveryObservation[
        SOURCE_FIELD.PRIORITY_RECOVERY_PARTITION_WITNESSES
      ],
      flattenEvidencePath(
        SOURCE_PATH.REPORT_SCENARIO_PRIORITY_RECOVERY_OBSERVATION,
        SOURCE_FIELD.PRIORITY_RECOVERY_PARTITION_WITNESSES,
      ),
    ),
    arrayCandidate(
      progressSummary[SOURCE_FIELD.PRIORITY_RECOVERY_PARTITION_WITNESSES],
      flattenEvidencePath(
        progressSummaryEvidence.sourcePath,
        SOURCE_FIELD.PRIORITY_RECOVERY_PARTITION_WITNESSES,
      ),
    ),
  );
  const readinessFailureEvidence = firstRecordWithSource(
    recordCandidate(scenario.readinessFailure, SOURCE_PATH.REPORT_SCENARIO_READINESS_FAILURE),
    recordCandidate(summary.readinessFailure, SOURCE_PATH.READINESS_FAILURE),
    recordCandidate(
      activeGate.readinessFailure,
      flattenEvidencePath(activeGateEvidence.sourcePath, SOURCE_FIELD.READINESS_FAILURE),
    ),
    recordCandidate(failureBundle.readiness?.failure, SOURCE_PATH.READINESS_FAILURE),
    recordCandidate(triageSummary.readiness?.failure, SOURCE_PATH.READINESS_FAILURE),
  );
  const readinessFailure = readinessFailureEvidence.record;

  return {
    scenario: firstText(
      failureBundle.scenario,
      triageSummary.scenario,
      scenario.scenario,
      UNKNOWN_VALUE,
    ),
    generatedFrom: {
      failureBundle: failureBundleEvidence.sourcePath,
      triageSummary: Object.keys(triageSummary).length > SOURCE_ORDER_BASE ?
        SOURCE_PATH.TRIAGE_SUMMARY :
        ABSENT_VALUE,
      report: Object.keys(report).length > SOURCE_ORDER_BASE ?
        SOURCE_PATH.REPORT_SCENARIO :
        ABSENT_VALUE,
    },
    summary,
    publication,
    activeGate,
    progress,
    publicationActiveGateHandoff,
    progressSummary,
    topologyOperatorWitness: topologyOperatorWitnessEvidence.record,
    priorityRecoveryPartitionWitnesses:
      priorityRecoveryPartitionWitnessesEvidence.items,
    readinessFailure,
    evidencePath: {
      publication: publicationEvidence.sourcePath,
      priorityRecoveryProgressClasses: progressEvidence.sourcePath === ABSENT_VALUE ?
        SOURCE_PATH.PRIORITY_RECOVERY_PROGRESS_CLASSES :
        flattenEvidencePath(
          progressEvidence.sourcePath,
          SOURCE_FIELD.PRIORITY_RECOVERY_PROGRESS_CLASSES,
        ),
      priorityRecoveryProgressSummary: progressSummaryEvidence.sourcePath,
      priorityRecoveryDominantWitness: progressSummaryEvidence.sourcePath ===
        ABSENT_VALUE ?
        ABSENT_VALUE :
        flattenEvidencePath(
          progressSummaryEvidence.sourcePath,
          SOURCE_FIELD.DOMINANT_WITNESS,
        ),
      topologyOperatorWitness: topologyOperatorWitnessEvidence.sourcePath,
      priorityRecoveryPartitionWitnesses:
        priorityRecoveryPartitionWitnessesEvidence.sourcePath,
      activeGateProgress: progressEvidence.sourcePath,
      publicationActiveGateHandoff:
        publicationActiveGateHandoffSourcePath,
      readinessFailure: readinessFailureEvidence.sourcePath,
    },
    topReasons: normalizeTopReasons(firstArray(summary.topReasons, topFailures.topReasons)),
  };
}

export function splitJoinedValues(value) {
  if (Array.isArray(value)) {
    return value;
  }
  const text = textOrUnknown(value);
  if (text === ABSENT_VALUE || text === UNKNOWN_VALUE) {
    return [];
  }
  return text
    .split(LIST_SEPARATOR)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > SOURCE_ORDER_BASE);
}

export function createTopologyConvergenceReasonList() {
  return Array.from(TOPOLOGY_CONVERGENCE_EMPTY_REASON_LIST);
}

export function joinValues(values) {
  if (values.length === SOURCE_ORDER_BASE) {
    return ABSENT_VALUE;
  }
  return values.map((value) => String(value)).join(LIST_SEPARATOR);
}


