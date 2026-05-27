import {
  ABSENT_VALUE,
  UNKNOWN_VALUE,
  SOURCE_ORDER_BASE,
  FIRST_FRONTIER_INDEX,
  TOPOLOGY_CONVERGENCE_EMPTY_REASON_LIST,
  PUBLICATION_STATUS_PUBLISHED,
  PUBLICATION_RECOVERY_PROTOCOL_PUBLICATION_PENDING,
  PUBLICATION_RECOVERY_PROTOCOL_UNPUBLISHED_OBSERVATION,
  PUBLICATION_OWNER_ACK_STATE_ACKNOWLEDGED,
  PUBLICATION_OWNER_ACK_STATE_NOT_REQUIRED,
  PUBLICATION_OWNER_FRESHNESS_FENCE_CONSUMER_LAG,
  PUBLICATION_OWNER_RECOVERY_OUTCOME_WAITING_FOR_CONSUMER,
  PUBLICATION_OWNER_REVISION_STATE_CURRENT,
  PUBLICATION_OWNER_STREAM_OUTCOME_STALE,
  PUBLICATION_PENDING_STATUS_SET,
  TOPOLOGY_OPERATOR_CURRENT_STEP_STATE_TERMINAL,
  SOURCE_PATH,
  SOURCE_FIELD,
  READINESS_SUPPORT_PATH,
  READINESS_RECOVERABILITY_RULES,
  READINESS_INHERITED_ACTIVE_GATE_SUPPORT_RULES,
  LIST_SEPARATOR,
} from './topology-convergence-constants.js';

import {
  asRecord,
  arrayOrEmpty,
  firstText,
  textOrUnknown,
  numberOrZero,
  numberOrUnknown,
  booleanVariant,
  parseBooleanVariant,
  firstFiniteNumber,
  flattenEvidencePath,
  firstRecord,
  firstArray,
  recordCandidate,
  arrayCandidate,
  firstRecordWithSource,
  firstArrayWithSource,
  isTopologyOperatorWitnessPresent,
} from './topology-convergence-core-normalizers.js';

export {
  asRecord,
  arrayOrEmpty,
  firstText,
  textOrUnknown,
  numberOrZero,
  numberOrUnknown,
  booleanVariant,
  parseBooleanVariant,
  compareNumber,
  firstFiniteNumber,
  flattenEvidencePath,
  firstRecord,
  firstArray,
  recordCandidate,
  arrayCandidate,
  firstRecordWithSource,
  firstArrayWithSource,
  isTopologyOperatorWitnessPresent,
} from './topology-convergence-core-normalizers.js';

export {
  selectTopologyOperatorWitness,
  normalizePriorityRecoveryPartitionWitnesses,
  isPriorityRecoveryNonBlockingPartitionWitness,
  buildPriorityRecoveryWitnessSelection,
  collectDistinctRecordText,
  isPriorityRecoveryEventDrivenWaitWitnessSelection,
  isPriorityRecoveryEventDrivenWaitWitness,
  resolvePriorityRecoveryOwnerBoundary,
  selectPriorityRecoveryClassSelection,
  buildPriorityRecoveryClassesFromTopologyOperatorWitness,
  hasPriorityRecoveryClassEvidence,
  hasPriorityRecoveryClassContract,
  selectPriorityRecoveryEvidencePath,
  normalizePriorityRecoveryEvidence,
} from './topology-convergence-priority-recovery-normalizers.js';


import {
  buildPublicationActiveGateHandoffContract,
} from '../control-plane/publication-active-gate-handoff-contract.js';

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
    TOPOLOGY_OPERATOR_CURRENT_STEP_STATE_TERMINAL;
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
    evidence.recoveryProtocolState ===
      PUBLICATION_RECOVERY_PROTOCOL_PUBLICATION_PENDING
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

export function normalizeActiveGateSnapshotCoverageProgress(snapshotCoverage) {
  const coverage = asRecord(snapshotCoverage);
  if (Object.keys(coverage).length === SOURCE_ORDER_BASE) {
    return {};
  }
  const selectedObservedNodeIds = arrayOrEmpty(coverage.selectedObservedNodeIds);
  return {
    snapshotCoverageComplete: coverage.completeCoverage === true,
    snapshotCoverageNodeCount: firstFiniteNumber(
      coverage.bestCoverageNodeCount,
      coverage.snapshotCoverageNodeCount,
      selectedObservedNodeIds.length,
    ),
    expectedNodeCount: firstFiniteNumber(
      coverage.expectedNodeCount,
      coverage.bestCoverageNodeCount,
      selectedObservedNodeIds.length,
    ),
    selectedSnapshotNodeId: firstText(
      coverage.selectedSnapshotNodeId,
      coverage.selectedNodeId,
    ),
    selectedSnapshotAdminReady: coverage.selectedSnapshotAdminReady,
    selectedSnapshotReachableBy: firstText(
      coverage.selectedSnapshotReachableBy,
      coverage.selectedReachableBy,
    ),
    selectedSnapshotError: firstText(
      coverage.selectedSnapshotError,
      coverage.selectedError,
      coverage.selectedSnapshotReachabilityError,
      coverage.selectedReachabilityError,
    ),
    selectedSnapshotTimeoutMs: firstFiniteNumber(
      coverage.selectedSnapshotTimeoutMs,
      coverage.selectedTimeoutMs,
    ),
    selectedSnapshotObservationMode: firstText(
      coverage.selectedSnapshotObservationMode,
    ),
    selectedSnapshotObservationState: firstText(
      coverage.selectedSnapshotObservationState,
      coverage.selectedSnapshotRevisionState,
    ),
    selectedSnapshotObservationContractState: firstText(
      coverage.selectedSnapshotObservationContractState,
    ),
    selectedSnapshotObservationRefreshState: firstText(
      coverage.selectedSnapshotObservationRefreshState,
    ),
    selectedSnapshotObservationNextAction: firstText(
      coverage.selectedSnapshotObservationNextAction,
    ),
    selectedSnapshotObservationReasonCodes: arrayOrEmpty(
      coverage.selectedSnapshotObservationReasonCodes,
    ),
    selectedSnapshotRepairDeferred:
      coverage.selectedSnapshotRepairDeferred === true,
    selectedPublishedActiveNodeIds: arrayOrEmpty(
      coverage.selectedPublishedActiveNodeIds,
    ),
    selectedMissingPublishedNodeIds: arrayOrEmpty(
      coverage.selectedMissingPublishedNodeIds,
    ),
  };
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
  const controlPlane = asRecord(failureBundle.controlPlane);
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
      publication[SOURCE_FIELD.ACTIVE_GATE_PROGRESS],
      flattenEvidencePath(
        publicationEvidence.sourcePath,
        SOURCE_FIELD.ACTIVE_GATE_PROGRESS,
      ),
    ),
    recordCandidate(
      controlPlane[SOURCE_FIELD.ACTIVE_GATE_PROGRESS],
      SOURCE_PATH.FAILURE_BUNDLE_CONTROL_PLANE_ACTIVE_GATE_PROGRESS,
    ),
    recordCandidate(
      normalizeActiveGateSnapshotCoverageProgress(
        controlPlane[SOURCE_FIELD.ACTIVE_GATE_SNAPSHOT_COVERAGE],
      ),
      SOURCE_PATH.FAILURE_BUNDLE_CONTROL_PLANE_ACTIVE_GATE_SNAPSHOT_COVERAGE,
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

export function normalizeProgressContract(rawContract, fallback = {}) {
  const contract = asRecord(rawContract);
  const toText = (val, fallbackVal) => {
    const s = String(val || fallbackVal || '').trim();
    return s.length > 0 ? s : 'absent';
  };
  return {
    owner: toText(contract.owner, fallback.owner),
    boundary: toText(contract.boundary, fallback.boundary),
    state: toText(contract.state || contract.contractState, fallback.state),
    reason: toText(contract.reason, fallback.reason),
    nextAction: toText(contract.nextAction || contract.progressNextAction, fallback.nextAction),
    wakeSource: toText(contract.wakeSource, fallback.wakeSource),
    retryAfterMs: typeof contract.retryAfterMs === 'number' ? contract.retryAfterMs : (typeof fallback.retryAfterMs === 'number' ? fallback.retryAfterMs : 0),
    terminalState: toText(contract.terminalState, fallback.terminalState),
    evidencePath: toText(contract.evidencePath, fallback.evidencePath),
    blockingDependency: toText(contract.blockingDependency, fallback.blockingDependency),
  };
}
