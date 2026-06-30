import {
  ABSENT_VALUE,
  UNKNOWN_VALUE,
  SOURCE_ORDER_BASE,
  FIRST_FRONTIER_INDEX,
  TOPOLOGY_CONVERGENCE_EMPTY_REASON_LIST,
  SOURCE_PATH,
  SOURCE_FIELD,
  LIST_SEPARATOR,
} from './topology-convergence-constants.js';

import {
  asRecord,
  arrayOrEmpty,
  firstText,
  textOrUnknown,
  numberOrZero,
  flattenEvidencePath,
  firstRecord,
  firstArray,
  recordCandidate,
  arrayCandidate,
  firstRecordWithSource,
  firstArrayWithSource,
} from './topology-convergence-core-normalizers.js';

import {
  normalizeActiveGateSnapshotCoverageProgress,
} from './topology-convergence-active-gate-normalizers.js';

import {
  buildReplayablePublicationActiveGateHandoffFromOwnerEvidence,
  hasPublicationActiveGateHandoffContract,
} from './topology-convergence-publication-normalizers.js';

import {
  deriveProjectionReadinessFailure,
  normalizeExplicitReadinessSupportEvidence,
} from './topology-convergence-readiness-normalizers.js';

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
  normalizeProgressContract,
} from './topology-convergence-core-normalizers.js';

export {
  normalizeActiveGateSnapshotCoverageProgress,
} from './topology-convergence-active-gate-normalizers.js';

export {
  isClosedPublicationOwnerAckState,
  normalizePublicationOwnerStreamEvidence,
  isNonTerminalTopologyOperatorWitness,
  normalizePublicationEvidence,
  buildTopologyOperatorWitnessDiagnosticSource,
  isPublicationPendingEvidence,
  isPublicationConsumerLagEvidence,
  hasPublicationMissingPublishedEvidence,
  isPublicationMissingPublishedEvidence,
  hasPublicationActiveGateHandoffContract,
  hasReplayableNoDebtPublicationPendingOwnerEvidence,
  buildReplayablePublicationActiveGateHandoffFromOwnerEvidence,
} from './topology-convergence-publication-normalizers.js';

export {
  resolveReadinessSupportPath,
  resolveReadinessRecoverability,
  normalizeReadinessSupportEvidence,
  normalizeExplicitReadinessSupportEvidence,
  deriveProjectionReadinessFailure,
} from './topology-convergence-readiness-normalizers.js';

export {
  READINESS_PROJECTION_EXCLUDED_SOURCE,
} from './topology-convergence-constants.js';

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

// Top Reasons Normalizer
export function normalizeTopReasons(topReasons) {
  return arrayOrEmpty(topReasons).map((entry) => ({
    reason: textOrUnknown(entry?.reason),
    count: numberOrZero(entry?.count),
  }));
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
  const failureBundleDiagnostics = asRecord(asRecord(failureBundle.details).diagnostics);
  const diagnostics = asRecord(asRecord(scenario.details).diagnostics);
  const controlPlaneDiagnostics = asRecord(diagnostics.controlPlaneDiagnostics);
  const priorityRecoveryObservation = asRecord(scenario.priorityRecoveryObservation);
  const priorityRecoveryDecisionSnapshots =
    collectPriorityRecoveryDecisionSnapshots(
      scenario[SOURCE_FIELD.PRIORITY_RECOVERY_DECISION_SNAPSHOTS],
      diagnostics[SOURCE_FIELD.PRIORITY_RECOVERY_DECISION_SNAPSHOTS],
      controlPlaneDiagnostics[
        SOURCE_FIELD.PRIORITY_RECOVERY_DECISION_SNAPSHOTS
      ],
      controlPlane[SOURCE_FIELD.PRIORITY_RECOVERY_DECISION_SNAPSHOTS],
      priorityRecoveryObservation[
        SOURCE_FIELD.PRIORITY_RECOVERY_DECISION_SNAPSHOTS
      ],
    );
  const summary = firstRecord(
    failureBundle.summary,
    triageSummary.summary,
    scenario.summary,
    scenario,
    report.summary,
  );
  const topFailures = firstRecord(failureBundle.topFailures, triageSummary.topFailures);
  const postRebalanceClosureEvidence = firstRecordWithSource(
    recordCandidate(
      asRecord(failureBundle.failureClassification).postRebalanceClosure,
      flattenEvidencePath(
        SOURCE_PATH.FAILURE_BUNDLE_FAILURE_CLASSIFICATION,
        SOURCE_FIELD.POST_REBALANCE_CLOSURE,
      ),
    ),
    recordCandidate(
      failureBundleDiagnostics.postRebalanceClosure,
      flattenEvidencePath(
        SOURCE_PATH.FAILURE_BUNDLE_DIAGNOSTICS,
        SOURCE_FIELD.POST_REBALANCE_CLOSURE,
      ),
    ),
    recordCandidate(
      asRecord(scenario.failureClassification).postRebalanceClosure,
      flattenEvidencePath(
        SOURCE_PATH.REPORT_SCENARIO_FAILURE_CLASSIFICATION,
        SOURCE_FIELD.POST_REBALANCE_CLOSURE,
      ),
    ),
    recordCandidate(
      diagnostics.postRebalanceClosure,
      flattenEvidencePath(
        SOURCE_PATH.REPORT_SCENARIO_DIAGNOSTICS,
        SOURCE_FIELD.POST_REBALANCE_CLOSURE,
      ),
    ),
  );
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
  const progress = {
    ...progressEvidence.record,
    ...normalizeActiveGateSnapshotCoverageProgress(progressEvidence.record),
  };
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
  const priorityRecoveryPartitionWitnesses =
    enrichPriorityRecoveryPartitionWitnessesWithOwnerObservations(
      priorityRecoveryPartitionWitnessesEvidence.items,
      priorityRecoveryDecisionSnapshots,
    );
  const projectionReadinessFailure =
    deriveProjectionReadinessFailure(publication);
  const readinessFailureEvidence = firstRecordWithSource(
    recordCandidate(scenario.readinessFailure, SOURCE_PATH.REPORT_SCENARIO_READINESS_FAILURE),
    recordCandidate(summary.readinessFailure, SOURCE_PATH.READINESS_FAILURE),
    recordCandidate(
      activeGate.readinessFailure,
      flattenEvidencePath(activeGateEvidence.sourcePath, SOURCE_FIELD.READINESS_FAILURE),
    ),
    recordCandidate(
      projectionReadinessFailure,
      flattenEvidencePath(
        publicationEvidence.sourcePath,
        SOURCE_FIELD.PROJECTION_DIAGNOSTICS,
      ),
    ),
    recordCandidate(failureBundle.readiness?.failure, SOURCE_PATH.READINESS_FAILURE),
    recordCandidate(triageSummary.readiness?.failure, SOURCE_PATH.READINESS_FAILURE),
  );
  const readinessFailure = readinessFailureEvidence.record;
  const readinessEvidence = firstRecordWithSource(
    recordCandidate(
      normalizeExplicitReadinessSupportEvidence(
        failureBundle.readiness,
        SOURCE_PATH.FAILURE_BUNDLE_READINESS,
      ),
      SOURCE_PATH.FAILURE_BUNDLE_READINESS,
    ),
    recordCandidate(
      normalizeExplicitReadinessSupportEvidence(
        triageSummary.readiness,
        SOURCE_PATH.TRIAGE_READINESS,
      ),
      SOURCE_PATH.TRIAGE_READINESS,
    ),
  );
  const readiness = readinessEvidence.record;

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
    priorityRecoveryPartitionWitnesses,
    readiness,
    readinessFailure,
    postRebalanceClosure: postRebalanceClosureEvidence.record,
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
      readiness: readinessEvidence.sourcePath,
      readinessFailure: readinessFailureEvidence.sourcePath,
      postRebalanceClosure: postRebalanceClosureEvidence.sourcePath,
    },
    topReasons: normalizeTopReasons(firstArray(summary.topReasons, topFailures.topReasons)),
  };
}

export function collectPriorityRecoveryDecisionSnapshots(...sources) {
  const snapshots = [];
  for (const source of sources) {
    if (Array.isArray(source)) {
      snapshots.push(...source);
      continue;
    }
    const snapshotRecord = asRecord(source);
    snapshots.push(
      ...arrayOrEmpty(snapshotRecord[SOURCE_FIELD.SNAPSHOTS]),
    );
  }
  return snapshots;
}

export function enrichPriorityRecoveryPartitionWitnessesWithOwnerObservations(
  witnesses,
  decisionSnapshots,
) {
  const operationOwnerObservationByPartitionId = new Map();
  for (const snapshotValue of arrayOrEmpty(decisionSnapshots)) {
    const snapshot = asRecord(snapshotValue);
    const partitionId = textOrUnknown(snapshot[SOURCE_FIELD.PARTITION_ID]);
    const operationOwnerObservation = asRecord(
      snapshot[SOURCE_FIELD.OPERATION_OWNER_OBSERVATION],
    );
    if (
      partitionId !== UNKNOWN_VALUE &&
      Object.keys(operationOwnerObservation).length > SOURCE_ORDER_BASE
    ) {
      operationOwnerObservationByPartitionId.set(
        partitionId,
        operationOwnerObservation,
      );
    }
  }
  if (operationOwnerObservationByPartitionId.size === SOURCE_ORDER_BASE) {
    return arrayOrEmpty(witnesses);
  }
  return arrayOrEmpty(witnesses).map((witnessValue) => {
    const witness = asRecord(witnessValue);
    const partitionId = textOrUnknown(witness[SOURCE_FIELD.PARTITION_ID]);
    const existingObservation = asRecord(
      witness[SOURCE_FIELD.OPERATION_OWNER_OBSERVATION],
    );
    if (
      Object.keys(existingObservation).length > SOURCE_ORDER_BASE ||
      operationOwnerObservationByPartitionId.has(partitionId) !== true
    ) {
      return witness;
    }
    return {
      ...witness,
      [SOURCE_FIELD.OPERATION_OWNER_OBSERVATION]:
        operationOwnerObservationByPartitionId.get(partitionId),
    };
  });
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
