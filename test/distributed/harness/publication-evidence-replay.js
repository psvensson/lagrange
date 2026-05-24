import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {deriveMembershipPublicationCandidate} from
  '../../../src/control-plane/membership-publication-coordinator.js';
import {
  buildPriorityRecoveryClosureWitness,
  PRIORITY_RECOVERY_CLOSURE_WITNESS_STATE,
} from
  '../../../src/control-plane/priority-recovery-snapshot.js';
import {NUM, TYPEOF} from '../../../src/constants/index.js';
import {
  PUBLICATION_EVIDENCE_REPLAY_AVAILABILITY,
  PUBLICATION_EVIDENCE_REPLAY_CLOSURE_WITNESS_CLASSIFICATION,
  PUBLICATION_EVIDENCE_REPLAY_CLOSURE_WITNESS_FIELD,
  PUBLICATION_EVIDENCE_REPLAY_COMPARISON_FIELD,
  PUBLICATION_EVIDENCE_REPLAY_DRIFT_CLASSIFICATION,
  PUBLICATION_EVIDENCE_REPLAY_DURABLE_FIELD,
  PUBLICATION_EVIDENCE_REPLAY_EMPTY_TEXT,
  PUBLICATION_EVIDENCE_REPLAY_ENCODING,
  PUBLICATION_EVIDENCE_REPLAY_ERROR_MESSAGE,
  PUBLICATION_EVIDENCE_REPLAY_EXIT_CODE,
  PUBLICATION_EVIDENCE_REPLAY_FIELD,
  PUBLICATION_EVIDENCE_REPLAY_FILE,
  PUBLICATION_EVIDENCE_REPLAY_JSON_INDENT,
  PUBLICATION_EVIDENCE_REPLAY_JSON_REPLACER,
  PUBLICATION_EVIDENCE_REPLAY_LINE,
  PUBLICATION_EVIDENCE_REPLAY_NEWLINE,
  PUBLICATION_EVIDENCE_REPLAY_OBSERVATION_FIELD,
  PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD,
  PUBLICATION_EVIDENCE_REPLAY_REBALANCER_EXECUTION_GAP_STATE,
  PUBLICATION_EVIDENCE_REPLAY_REBALANCER_FOLLOW_UP_EXECUTION_STATE,
  PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_FIELD,
  PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_STATE,
  PUBLICATION_EVIDENCE_REPLAY_REBALANCER_LOG,
  PUBLICATION_EVIDENCE_REPLAY_REBALANCER_LOG_FIELD,
  PUBLICATION_EVIDENCE_REPLAY_REBALANCER_MOVE_BLOCKED_MESSAGES,
  PUBLICATION_EVIDENCE_REPLAY_REBALANCER_MOVE_LIMIT_STATE,
  PUBLICATION_EVIDENCE_REPLAY_REBALANCER_SUPPRESSION_MESSAGES,
  PUBLICATION_EVIDENCE_REPLAY_REPAIR_DEFERRAL_RULES,
  PUBLICATION_EVIDENCE_REPLAY_REPAIR_DEFERRAL_STATE,
  PUBLICATION_EVIDENCE_REPLAY_REPAIR_EVIDENCE_FIELD,
  PUBLICATION_EVIDENCE_REPLAY_REPAIR_EVIDENCE_RECOVERY_RULES,
  PUBLICATION_EVIDENCE_REPLAY_REPAIR_EVIDENCE_RECOVERY_STATE,
  PUBLICATION_EVIDENCE_REPLAY_REPAIR_FIELD,
  PUBLICATION_EVIDENCE_REPLAY_REPAIR_LOG,
  PUBLICATION_EVIDENCE_REPLAY_REPAIR_LOG_FIELD,
  PUBLICATION_EVIDENCE_REPLAY_REPLAYED_FIELD,
  PUBLICATION_EVIDENCE_REPLAY_REPLICA_OPERATION_ROW_FIELD,
  PUBLICATION_EVIDENCE_REPLAY_SOURCE,
} from './publication-evidence-replay-constants.js';
import {
  isRecord,
  normalizeInteger,
  normalizeList,
  normalizeRecordKeyList,
  normalizeScalarText,
  normalizeText,
  normalizeTimestampMs,
  parseRepairLogRecordFromLine,
  readArrayField,
  readFailureBundleLogExcerptLines,
  readFirstAvailableRecord,
  readFirstRecord,
  readRecordField,
} from './publication-evidence-replay-shared.js';
import {
  buildMissingPriorityRecoveryWitness,
  readPriorityRecoveryWitnessCandidates,
  selectSupportingPriorityRecoveryWitness,
  summarizePriorityRecoveryWitness,
  summarizePriorityRecoveryWitnesses,
  summarizeRebalancerFollowUpHandoff,
} from './publication-evidence-replay-priority-rebalancer.js';

function readPublicationConvergenceFromFailureBundle(failureBundle = {}) {
  const directSummaryState = readRecordField(
    failureBundle,
    PUBLICATION_EVIDENCE_REPLAY_FIELD.PUBLICATION_CONVERGENCE,
  );
  const summaryState = readRecordField(
    failureBundle,
    PUBLICATION_EVIDENCE_REPLAY_FIELD.SUMMARY,
  );
  const standardSummaryState = readRecordField(
    failureBundle,
    PUBLICATION_EVIDENCE_REPLAY_FIELD.STANDARD_SUMMARY,
  );
  const controlPlaneState = readRecordField(
    failureBundle,
    PUBLICATION_EVIDENCE_REPLAY_FIELD.CONTROL_PLANE,
  );
  return readFirstAvailableRecord(
    directSummaryState,
    readFirstRecord(
      summaryState.value[PUBLICATION_EVIDENCE_REPLAY_FIELD.PUBLICATION_CONVERGENCE],
    ),
    readFirstRecord(
      standardSummaryState.value[PUBLICATION_EVIDENCE_REPLAY_FIELD.PUBLICATION_CONVERGENCE],
    ),
    readFirstRecord(
      controlPlaneState.value[PUBLICATION_EVIDENCE_REPLAY_FIELD.PUBLICATION_CONVERGENCE],
    ),
  );
}

function readPriorityRecoveryDecisionSnapshotsFromFailureBundle(
  failureBundle = {},
) {
  const controlPlaneState = readRecordField(
    failureBundle,
    PUBLICATION_EVIDENCE_REPLAY_FIELD.CONTROL_PLANE,
  );
  const summaryState = readRecordField(
    failureBundle,
    PUBLICATION_EVIDENCE_REPLAY_FIELD.SUMMARY,
  );
  const standardSummaryState = readRecordField(
    failureBundle,
    PUBLICATION_EVIDENCE_REPLAY_FIELD.STANDARD_SUMMARY,
  );
  return readFirstAvailableRecord(
    readFirstRecord(controlPlaneState.value.priorityRecoveryDecisionSnapshots),
    readFirstRecord(
      summaryState.value.controlPlane?.priorityRecoveryDecisionSnapshots,
    ),
    readFirstRecord(
      standardSummaryState.value.controlPlane?.priorityRecoveryDecisionSnapshots,
    ),
  );
}

function buildPublicationRowStateFromConvergence(publicationConvergenceState) {
  if (publicationConvergenceState.availability !==
    PUBLICATION_EVIDENCE_REPLAY_AVAILABILITY.AVAILABLE) {
    return {
      availability: PUBLICATION_EVIDENCE_REPLAY_AVAILABILITY.MISSING,
      value: {},
    };
  }
  const convergence = publicationConvergenceState.value;
  const publishedActiveNodeIds = normalizeList(
    readArrayField(
      convergence,
      PUBLICATION_EVIDENCE_REPLAY_FIELD.PUBLISHED_ACTIVE_NODE_IDS,
    ),
  );
  const pendingAckNodeIds = new Set(
    normalizeList(
      readArrayField(
        convergence,
        PUBLICATION_EVIDENCE_REPLAY_FIELD.PENDING_ACK_NODE_IDS,
      ),
    ),
  );
  const requiredAckNodeIds = normalizeList(
    readArrayField(
      convergence,
      PUBLICATION_EVIDENCE_REPLAY_FIELD.REQUIRED_ACK_NODE_IDS,
    ),
  );
  const acknowledgedNodeIds = normalizeList(
    readArrayField(
      convergence,
      PUBLICATION_EVIDENCE_REPLAY_FIELD.ACKNOWLEDGED_NODE_IDS,
    ),
  );
  return {
    availability: PUBLICATION_EVIDENCE_REPLAY_AVAILABILITY.AVAILABLE,
    value: {
      publicationEpoch:
        normalizeInteger(convergence[PUBLICATION_EVIDENCE_REPLAY_FIELD.PUBLICATION_EPOCH]),
      status:
        normalizeText(
          convergence[PUBLICATION_EVIDENCE_REPLAY_FIELD.PUBLICATION_STATUS],
        ) ||
        normalizeText(convergence[PUBLICATION_EVIDENCE_REPLAY_FIELD.STATUS]),
      publishedActiveNodeIds,
      requiredAckNodeIds:
        requiredAckNodeIds.length > NUM.ZERO ? requiredAckNodeIds : publishedActiveNodeIds,
      acknowledgedNodeIds:
        acknowledgedNodeIds.length > NUM.ZERO ?
          acknowledgedNodeIds :
          publishedActiveNodeIds.filter((nodeId) => !pendingAckNodeIds.has(nodeId)),
      priorityPartitionSummary:
        readRecordField(
          convergence,
          PUBLICATION_EVIDENCE_REPLAY_FIELD.PRIORITY_PARTITION_SUMMARY,
        ).value,
    },
  };
}

function selectLatestPublicationRowState(snapshot = {}, publicationConvergenceState = {}) {
  const snapshotPublicationRows = [
    ...readArrayField(
      snapshot,
      PUBLICATION_EVIDENCE_REPLAY_FIELD.CONTROL_PLANE_PUBLICATIONS,
    ),
    ...readArrayField(
      snapshot,
      PUBLICATION_EVIDENCE_REPLAY_FIELD.CONTROL_PLANE_PUBLICATIONS_SNAKE,
    ),
  ].filter(isRecord);
  if (snapshotPublicationRows.length > NUM.ZERO) {
    const sortedPublicationRows = snapshotPublicationRows.slice().sort((left, right) => {
      const epochDelta =
        normalizeInteger(right.publication_epoch ?? right.publicationEpoch) -
        normalizeInteger(left.publication_epoch ?? left.publicationEpoch);
      if (epochDelta !== NUM.ZERO) {
        return epochDelta;
      }
      return normalizeInteger(right.updated_at ?? right.updatedAt) -
        normalizeInteger(left.updated_at ?? left.updatedAt);
    });
    return {
      availability: PUBLICATION_EVIDENCE_REPLAY_AVAILABILITY.AVAILABLE,
      value: sortedPublicationRows[NUM.ZERO],
    };
  }
  return buildPublicationRowStateFromConvergence(publicationConvergenceState);
}

function summarizePriorityPartitionSummary(summary = {}) {
  const blockedPartitions = readArrayField(
    summary,
    PUBLICATION_EVIDENCE_REPLAY_FIELD.BLOCKED_PARTITIONS,
  );
  return {
    satisfied: summary.satisfied === true,
    missingPartitionIds: normalizeList(
      readArrayField(
        summary,
        PUBLICATION_EVIDENCE_REPLAY_FIELD.MISSING_PARTITION_IDS,
      ),
    ),
    blockedPartitionIds: normalizeList(
      blockedPartitions
        .map((entry) => entry?.partitionId ?? entry?.partition_id)
        .filter((partitionId) => normalizeScalarText(partitionId).length > NUM.ZERO),
    ),
  };
}

function buildPrioritySummaryComparison(durableSummary = {}, replayedSummary = {}) {
  const durable = summarizePriorityPartitionSummary(durableSummary);
  const replayed = summarizePriorityPartitionSummary(replayedSummary);
  const durableBlockedPartitionIds = normalizeList([
    ...durable.missingPartitionIds,
    ...durable.blockedPartitionIds,
  ]);
  const replayedBlockedPartitionIds = normalizeList([
    ...replayed.missingPartitionIds,
    ...replayed.blockedPartitionIds,
  ]);
  const summaryChanged =
    JSON.stringify(durableSummary) !== JSON.stringify(replayedSummary);
  const blockedPartitionIdsMatch =
    JSON.stringify(durableBlockedPartitionIds) === JSON.stringify(replayedBlockedPartitionIds);
  const driftClassification = classifyPublicationEvidenceDrift({
    durable,
    replayed,
    summaryChanged,
    blockedPartitionIdsMatch,
  });
  return {
    [PUBLICATION_EVIDENCE_REPLAY_COMPARISON_FIELD.DURABLE_SATISFIED]: durable.satisfied,
    [PUBLICATION_EVIDENCE_REPLAY_COMPARISON_FIELD.REPLAYED_SATISFIED]: replayed.satisfied,
    [PUBLICATION_EVIDENCE_REPLAY_COMPARISON_FIELD.SUMMARY_CHANGED]: summaryChanged,
    [PUBLICATION_EVIDENCE_REPLAY_COMPARISON_FIELD.BLOCKED_PARTITION_IDS_MATCH]:
      blockedPartitionIdsMatch,
    [PUBLICATION_EVIDENCE_REPLAY_COMPARISON_FIELD.DRIFT_CLASSIFICATION]:
      driftClassification,
    [PUBLICATION_EVIDENCE_REPLAY_COMPARISON_FIELD.DURABLE_BLOCKED_PARTITION_IDS]:
      durableBlockedPartitionIds,
    [PUBLICATION_EVIDENCE_REPLAY_COMPARISON_FIELD.REPLAYED_BLOCKED_PARTITION_IDS]:
      replayedBlockedPartitionIds,
  };
}

function summarizePriorityRecoveryClosureWitness(closureWitness = null) {
  const closureWitnessRecord = isRecord(closureWitness) ? closureWitness : {};
  const closureRecordId = normalizeText(
    closureWitnessRecord[
      PUBLICATION_EVIDENCE_REPLAY_CLOSURE_WITNESS_FIELD.CLOSURE_RECORD_ID
    ],
  );
  const closureWitnessClass = normalizeText(
    closureWitnessRecord[
      PUBLICATION_EVIDENCE_REPLAY_CLOSURE_WITNESS_FIELD.CLOSURE_WITNESS_CLASS
    ],
  );
  return {
    [PUBLICATION_EVIDENCE_REPLAY_CLOSURE_WITNESS_FIELD.STATE]:
      normalizeText(
        closureWitnessRecord[
          PUBLICATION_EVIDENCE_REPLAY_CLOSURE_WITNESS_FIELD.STATE
        ],
      ) || null,
    [PUBLICATION_EVIDENCE_REPLAY_CLOSURE_WITNESS_FIELD.PRIORITY_SPREAD_PENDING]:
      closureWitnessRecord[
        PUBLICATION_EVIDENCE_REPLAY_CLOSURE_WITNESS_FIELD.PRIORITY_SPREAD_PENDING
      ] === true,
    [PUBLICATION_EVIDENCE_REPLAY_CLOSURE_WITNESS_FIELD.PUBLICATION_REFRESH_REQUIRED]:
      closureWitnessRecord[
        PUBLICATION_EVIDENCE_REPLAY_CLOSURE_WITNESS_FIELD.PUBLICATION_REFRESH_REQUIRED
      ] === true,
    [PUBLICATION_EVIDENCE_REPLAY_CLOSURE_WITNESS_FIELD.CLOSURE_RECORD_ID]:
      closureRecordId.length > NUM.ZERO ? closureRecordId : null,
    [PUBLICATION_EVIDENCE_REPLAY_CLOSURE_WITNESS_FIELD.CLOSURE_WITNESS_CLASS]:
      closureWitnessClass.length > NUM.ZERO ? closureWitnessClass : null,
    [PUBLICATION_EVIDENCE_REPLAY_CLOSURE_WITNESS_FIELD.BLOCKED_PARTITION_IDS]:
      normalizeList(
        readArrayField(
          closureWitnessRecord,
          PUBLICATION_EVIDENCE_REPLAY_CLOSURE_WITNESS_FIELD.BLOCKED_PARTITION_IDS,
        ),
      ),
  };
}

function classifyPublicationEvidenceClosureWitness(closureWitness = {}) {
  const closureWitnessState = normalizeText(
    closureWitness[PUBLICATION_EVIDENCE_REPLAY_CLOSURE_WITNESS_FIELD.STATE],
  );
  if (closureWitnessState.length === NUM.ZERO) {
    return PUBLICATION_EVIDENCE_REPLAY_CLOSURE_WITNESS_CLASSIFICATION.ABSENT;
  }
  if (
    closureWitnessState === PRIORITY_RECOVERY_CLOSURE_WITNESS_STATE.PENDING
  ) {
    return PUBLICATION_EVIDENCE_REPLAY_CLOSURE_WITNESS_CLASSIFICATION.PENDING;
  }
  if (
    closureWitnessState ===
      PRIORITY_RECOVERY_CLOSURE_WITNESS_STATE.SATISFIED_STALE_PUBLICATION ||
    closureWitness[
      PUBLICATION_EVIDENCE_REPLAY_CLOSURE_WITNESS_FIELD.PUBLICATION_REFRESH_REQUIRED
    ] === true
  ) {
    return PUBLICATION_EVIDENCE_REPLAY_CLOSURE_WITNESS_CLASSIFICATION
      .REFRESH_REQUIRED;
  }
  if (
    closureWitnessState ===
    PRIORITY_RECOVERY_CLOSURE_WITNESS_STATE.SATISFIED_FRESH
  ) {
    return PUBLICATION_EVIDENCE_REPLAY_CLOSURE_WITNESS_CLASSIFICATION
      .SATISFIED_FRESH;
  }
  return PUBLICATION_EVIDENCE_REPLAY_CLOSURE_WITNESS_CLASSIFICATION.OTHER;
}

function buildPriorityClosureWitnessComparison(closureWitness = {}) {
  return {
    [PUBLICATION_EVIDENCE_REPLAY_COMPARISON_FIELD.CLOSURE_WITNESS_STATE]:
      closureWitness[PUBLICATION_EVIDENCE_REPLAY_CLOSURE_WITNESS_FIELD.STATE],
    [PUBLICATION_EVIDENCE_REPLAY_COMPARISON_FIELD.CLOSURE_RECORD_ID]:
      closureWitness[
        PUBLICATION_EVIDENCE_REPLAY_CLOSURE_WITNESS_FIELD.CLOSURE_RECORD_ID
      ],
    [PUBLICATION_EVIDENCE_REPLAY_COMPARISON_FIELD.CLOSURE_WITNESS_CLASS]:
      closureWitness[
        PUBLICATION_EVIDENCE_REPLAY_CLOSURE_WITNESS_FIELD.CLOSURE_WITNESS_CLASS
      ],
    [PUBLICATION_EVIDENCE_REPLAY_COMPARISON_FIELD.CLOSURE_WITNESS_PUBLICATION_REFRESH_REQUIRED]:
      closureWitness[
        PUBLICATION_EVIDENCE_REPLAY_CLOSURE_WITNESS_FIELD.PUBLICATION_REFRESH_REQUIRED
      ] === true,
    [PUBLICATION_EVIDENCE_REPLAY_COMPARISON_FIELD.CLOSURE_WITNESS_CLASSIFICATION]:
      classifyPublicationEvidenceClosureWitness(closureWitness),
  };
}

function classifyPublicationEvidenceDrift(options = {}) {
  if (
    options.summaryChanged !== true &&
    options.blockedPartitionIdsMatch === true &&
    options.durable?.satisfied === options.replayed?.satisfied
  ) {
    return PUBLICATION_EVIDENCE_REPLAY_DRIFT_CLASSIFICATION.ALIGNED;
  }
  if (
    options.durable?.satisfied !== true &&
    options.replayed?.satisfied === true
  ) {
    return PUBLICATION_EVIDENCE_REPLAY_DRIFT_CLASSIFICATION
      .DURABLE_STALE_REPLAYED_SATISFIED;
  }
  if (options.replayed?.satisfied !== true) {
    return PUBLICATION_EVIDENCE_REPLAY_DRIFT_CLASSIFICATION.REPLAYED_BLOCKED;
  }
  return PUBLICATION_EVIDENCE_REPLAY_DRIFT_CLASSIFICATION.CHANGED;
}

function buildReplayDerivationOptions(options = {}) {
  const latestPublicationRowState =
    options.latestPublicationRowState &&
      typeof options.latestPublicationRowState === TYPEOF.OBJECT ?
      options.latestPublicationRowState :
      {
        availability: PUBLICATION_EVIDENCE_REPLAY_AVAILABILITY.MISSING,
        value: {},
      };
  return {
    ...(latestPublicationRowState.availability ===
      PUBLICATION_EVIDENCE_REPLAY_AVAILABILITY.AVAILABLE ?
      {
        [PUBLICATION_EVIDENCE_REPLAY_FIELD.LATEST_PUBLICATION_ROW]:
          latestPublicationRowState.value,
      } :
      {}),
    nodeRows: Array.isArray(options.nodeRows) ? options.nodeRows : [],
    nodeEndpointRows: Array.isArray(options.nodeEndpointRows) ? options.nodeEndpointRows : [],
    serviceRows: Array.isArray(options.serviceRows) ? options.serviceRows : [],
    partitionRows: Array.isArray(options.partitionRows) ? options.partitionRows : [],
    readinessEntries: Array.isArray(options.readinessEntries) ? options.readinessEntries : [],
    nowMs: normalizeInteger(options.nowMs, Date.now()),
  };
}

function replayPublicationPriorityEvidenceFromRows(options = {}) {
  const publicationConvergenceState =
    options.publicationConvergenceState &&
      typeof options.publicationConvergenceState === TYPEOF.OBJECT ?
      options.publicationConvergenceState :
      {
        availability: PUBLICATION_EVIDENCE_REPLAY_AVAILABILITY.MISSING,
        value: {},
      };
  const latestPublicationRowState =
    options.latestPublicationRowState &&
      typeof options.latestPublicationRowState === TYPEOF.OBJECT ?
      options.latestPublicationRowState :
      buildPublicationRowStateFromConvergence(publicationConvergenceState);
  const candidate = deriveMembershipPublicationCandidate(
    buildReplayDerivationOptions({
      ...options,
      latestPublicationRowState,
    }),
  );
  const durablePriorityPartitionSummary = readRecordField(
    publicationConvergenceState.value,
    PUBLICATION_EVIDENCE_REPLAY_FIELD.PRIORITY_PARTITION_SUMMARY,
  ).value;
  const replayedPriorityPartitionSummary =
    candidate.priorityPartitionSummary &&
      typeof candidate.priorityPartitionSummary === TYPEOF.OBJECT ?
      candidate.priorityPartitionSummary :
      {};
  const replayedClosureWitness = summarizePriorityRecoveryClosureWitness(
    candidate.priorityRecoveryClosureWitness ||
      buildPriorityRecoveryClosureWitness({
        decisionSnapshots: options.priorityRecoveryDecisionSnapshots,
        priorityPartitionSummary: durablePriorityPartitionSummary,
      }),
  );
  return {
    source: PUBLICATION_EVIDENCE_REPLAY_SOURCE.SNAPSHOT,
    rowCounts: {
      nodes: Array.isArray(options.nodeRows) ? options.nodeRows.length : NUM.ZERO,
      nodeEndpoints: Array.isArray(options.nodeEndpointRows) ?
        options.nodeEndpointRows.length :
        NUM.ZERO,
      partitions: Array.isArray(options.partitionRows) ? options.partitionRows.length : NUM.ZERO,
      services: Array.isArray(options.serviceRows) ? options.serviceRows.length : NUM.ZERO,
    },
    durablePublication: {
      [PUBLICATION_EVIDENCE_REPLAY_DURABLE_FIELD.EPOCH]:
        normalizeInteger(
          publicationConvergenceState.value[
            PUBLICATION_EVIDENCE_REPLAY_FIELD.PUBLICATION_EPOCH
          ],
        ),
      [PUBLICATION_EVIDENCE_REPLAY_DURABLE_FIELD.STATUS]:
        normalizeText(
          publicationConvergenceState.value[
            PUBLICATION_EVIDENCE_REPLAY_FIELD.PUBLICATION_STATUS
          ],
        ),
      [PUBLICATION_EVIDENCE_REPLAY_DURABLE_FIELD.CLOSURE_RECORD_ID]:
        normalizeText(
          publicationConvergenceState.value[
            PUBLICATION_EVIDENCE_REPLAY_CLOSURE_WITNESS_FIELD.CLOSURE_RECORD_ID
          ],
        ) || null,
      [PUBLICATION_EVIDENCE_REPLAY_DURABLE_FIELD.CLOSURE_WITNESS_CLASS]:
        normalizeText(
          publicationConvergenceState.value[
            PUBLICATION_EVIDENCE_REPLAY_CLOSURE_WITNESS_FIELD
              .CLOSURE_WITNESS_CLASS
          ],
        ) || null,
      [PUBLICATION_EVIDENCE_REPLAY_DURABLE_FIELD.PRIORITY_SPREAD_PENDING]:
        publicationConvergenceState.value.prioritySpreadPending === true,
      [PUBLICATION_EVIDENCE_REPLAY_DURABLE_FIELD.SUMMARY]:
        durablePriorityPartitionSummary,
    },
    replayedPublication: {
      [PUBLICATION_EVIDENCE_REPLAY_REPLAYED_FIELD.EPOCH]: candidate.publicationEpoch,
      [PUBLICATION_EVIDENCE_REPLAY_REPLAYED_FIELD.STATUS]: candidate.publicationStatus,
      [PUBLICATION_EVIDENCE_REPLAY_REPLAYED_FIELD.CLOSURE_WITNESS]:
        replayedClosureWitness,
      [PUBLICATION_EVIDENCE_REPLAY_REPLAYED_FIELD.RECOVERY_PROTOCOL_STATE]:
        candidate.recoveryProtocolState,
      [PUBLICATION_EVIDENCE_REPLAY_REPLAYED_FIELD.PRIORITY_RECOVERY_REASON_CODES]:
        normalizeList(candidate.priorityRecoveryReasonCodes),
      [PUBLICATION_EVIDENCE_REPLAY_REPLAYED_FIELD.SUMMARY]:
        replayedPriorityPartitionSummary,
    },
    comparison: {
      ...buildPrioritySummaryComparison(
        durablePriorityPartitionSummary,
        replayedPriorityPartitionSummary,
      ),
      ...buildPriorityClosureWitnessComparison(replayedClosureWitness),
    },
  };
}

function parseSnapshotLine(line, index) {
  const normalizedLine = normalizeText(line);
  if (normalizedLine.length === NUM.ZERO) {
    return {
      availability: PUBLICATION_EVIDENCE_REPLAY_AVAILABILITY.MISSING,
      value: {},
    };
  }
  try {
    return {
      availability: PUBLICATION_EVIDENCE_REPLAY_AVAILABILITY.AVAILABLE,
      value: JSON.parse(normalizedLine),
    };
  } catch (error) {
    error.message = `invalid snapshots.ndjson line ${index + NUM.ONE}: ${error.message}`;
    throw error;
  }
}

function selectLatestSnapshot(snapshots = []) {
  const availableSnapshots = snapshots
    .filter((snapshotState) =>
      snapshotState.availability === PUBLICATION_EVIDENCE_REPLAY_AVAILABILITY.AVAILABLE,
    )
    .map((snapshotState) => snapshotState.value)
    .filter(isRecord);
  if (availableSnapshots.length === NUM.ZERO) {
    return {
      availability: PUBLICATION_EVIDENCE_REPLAY_AVAILABILITY.MISSING,
      value: {},
    };
  }
  const sortedSnapshots = availableSnapshots.slice().sort((left, right) =>
    normalizeInteger(right[PUBLICATION_EVIDENCE_REPLAY_FIELD.TIMESTAMP]) -
    normalizeInteger(left[PUBLICATION_EVIDENCE_REPLAY_FIELD.TIMESTAMP]),
  );
  return {
    availability: PUBLICATION_EVIDENCE_REPLAY_AVAILABILITY.AVAILABLE,
    value: sortedSnapshots[NUM.ZERO],
  };
}

async function readJsonFile(filePath) {
  const raw = await readFile(filePath, PUBLICATION_EVIDENCE_REPLAY_ENCODING);
  return JSON.parse(raw);
}

async function readSnapshotStates(filePath) {
  const raw = await readFile(filePath, PUBLICATION_EVIDENCE_REPLAY_ENCODING);
  return raw
    .split(PUBLICATION_EVIDENCE_REPLAY_NEWLINE)
    .map((line, index) => parseSnapshotLine(line, index))
    .filter((snapshotState) =>
      snapshotState.availability === PUBLICATION_EVIDENCE_REPLAY_AVAILABILITY.AVAILABLE,
    );
}

async function readOptionalLogLines(filePath) {
  try {
    const raw = await readFile(filePath, PUBLICATION_EVIDENCE_REPLAY_ENCODING);
    return raw
      .split(PUBLICATION_EVIDENCE_REPLAY_NEWLINE)
      .filter((line) => normalizeText(line).length > NUM.ZERO);
  } catch (_error) {
    return [];
  }
}

async function replayPublicationPriorityEvidenceFromReportDir(reportDir) {
  const normalizedReportDir = normalizeText(reportDir);
  if (normalizedReportDir.length === NUM.ZERO) {
    throw new Error(PUBLICATION_EVIDENCE_REPLAY_ERROR_MESSAGE.REPORT_DIR_REQUIRED);
  }
  const failureBundle = await readJsonFile(
    join(normalizedReportDir, PUBLICATION_EVIDENCE_REPLAY_FILE.FAILURE_BUNDLE),
  );
  const snapshotStates = await readSnapshotStates(
    join(normalizedReportDir, PUBLICATION_EVIDENCE_REPLAY_FILE.SNAPSHOTS),
  );
  const logLines = await readOptionalLogLines(
    join(normalizedReportDir, PUBLICATION_EVIDENCE_REPLAY_FILE.TIMELINE_LOG),
  );
  const latestSnapshotState = selectLatestSnapshot(snapshotStates);
  const latestSnapshot = latestSnapshotState.value;
  const publicationConvergenceState =
    readPublicationConvergenceFromFailureBundle(failureBundle);
  const priorityRecoveryDecisionSnapshotsState =
    readPriorityRecoveryDecisionSnapshotsFromFailureBundle(failureBundle);
  const latestPublicationRowState = selectLatestPublicationRowState(
    latestSnapshot,
    publicationConvergenceState,
  );
  const selectedSnapshotObservation =
    readSelectedSnapshotObservationFromFailureBundle(failureBundle);
  const ownerRpcCacheRepair = summarizeOwnerRpcCacheRepairDeferrals({
    failureBundle,
    selectedSnapshotNodeId:
      selectedSnapshotObservation[
        PUBLICATION_EVIDENCE_REPLAY_OBSERVATION_FIELD.SELECTED_SNAPSHOT_NODE_ID
      ],
  });
  const priorityRecoveryWitnesses =
    summarizePriorityRecoveryWitnesses(failureBundle);
  const rebalancerFollowUpHandoff = summarizeRebalancerFollowUpHandoff({
    failureBundle,
    logLines,
    priorityRecoveryWitnesses,
    snapshotStates,
  });
  const nodeEndpointRows = [
    ...readArrayField(
      latestSnapshot,
      PUBLICATION_EVIDENCE_REPLAY_FIELD.NODE_ENDPOINTS,
    ),
    ...readArrayField(
      latestSnapshot,
      PUBLICATION_EVIDENCE_REPLAY_FIELD.NODE_ENDPOINTS_SNAKE,
    ),
  ];
  return {
    reportDir: normalizedReportDir,
    source: PUBLICATION_EVIDENCE_REPLAY_SOURCE.FAILURE_BUNDLE,
    snapshotTimestamp: normalizeInteger(
      latestSnapshot[PUBLICATION_EVIDENCE_REPLAY_FIELD.TIMESTAMP],
    ),
    selectedSnapshotObservation,
    ownerRpcCacheRepair,
    selectedSnapshotRepairEvidenceRecovery:
      summarizeSelectedSnapshotRepairEvidenceRecovery({
        selectedSnapshotObservation,
        ownerRpcCacheRepair,
      }),
    priorityRecoveryWitnesses,
    rebalancerFollowUpHandoff,
    supportingPriorityRecoveryWitness:
      selectSupportingPriorityRecoveryWitness(priorityRecoveryWitnesses),
    ...replayPublicationPriorityEvidenceFromRows({
      publicationConvergenceState,
      latestPublicationRowState,
      nodeRows: readArrayField(latestSnapshot, PUBLICATION_EVIDENCE_REPLAY_FIELD.NODES),
      nodeEndpointRows,
      serviceRows: readArrayField(latestSnapshot, PUBLICATION_EVIDENCE_REPLAY_FIELD.SERVICES),
      partitionRows: readArrayField(latestSnapshot, PUBLICATION_EVIDENCE_REPLAY_FIELD.PARTITIONS),
      priorityRecoveryDecisionSnapshots:
        priorityRecoveryDecisionSnapshotsState.value,
      nowMs: normalizeInteger(
        latestSnapshot[PUBLICATION_EVIDENCE_REPLAY_FIELD.TIMESTAMP],
        Date.now(),
      ),
    }),
  };
}

function formatJsonLine(label, value) {
  return `${label}: ${JSON.stringify(value)}`;
}

function formatPublicationEvidenceReplaySummary(summary = {}) {
  return [
    formatJsonLine(PUBLICATION_EVIDENCE_REPLAY_LINE.REPORT, summary.reportDir),
    formatJsonLine(
      PUBLICATION_EVIDENCE_REPLAY_LINE.SNAPSHOT_TIMESTAMP,
      summary.snapshotTimestamp,
    ),
    formatJsonLine(PUBLICATION_EVIDENCE_REPLAY_LINE.ROW_COUNTS, summary.rowCounts),
    formatJsonLine(PUBLICATION_EVIDENCE_REPLAY_LINE.DURABLE, summary.durablePublication),
    formatJsonLine(PUBLICATION_EVIDENCE_REPLAY_LINE.REPLAYED, summary.replayedPublication),
    formatJsonLine(
      PUBLICATION_EVIDENCE_REPLAY_LINE.SELECTED_SNAPSHOT_OBSERVATION,
      summary.selectedSnapshotObservation,
    ),
    formatJsonLine(
      PUBLICATION_EVIDENCE_REPLAY_LINE.OWNER_RPC_CACHE_REPAIR,
      summary.ownerRpcCacheRepair,
    ),
    formatJsonLine(
      PUBLICATION_EVIDENCE_REPLAY_LINE.SELECTED_SNAPSHOT_REPAIR_EVIDENCE_RECOVERY,
      summary.selectedSnapshotRepairEvidenceRecovery,
    ),
    formatJsonLine(
      PUBLICATION_EVIDENCE_REPLAY_LINE.PRIORITY_RECOVERY_WITNESSES,
      summary.priorityRecoveryWitnesses,
    ),
    formatJsonLine(
      PUBLICATION_EVIDENCE_REPLAY_LINE.REBALANCER_FOLLOW_UP_HANDOFF,
      summary.rebalancerFollowUpHandoff,
    ),
    formatJsonLine(
      PUBLICATION_EVIDENCE_REPLAY_LINE.SUPPORTING_PRIORITY_RECOVERY_WITNESS,
      summary.supportingPriorityRecoveryWitness,
    ),
    formatJsonLine(PUBLICATION_EVIDENCE_REPLAY_LINE.COMPARISON, summary.comparison),
  ].join(PUBLICATION_EVIDENCE_REPLAY_NEWLINE);
}

async function runPublicationEvidenceReplayCli(argv = process.argv) {
  const reportDir = argv[NUM.TWO];
  const summary = await replayPublicationPriorityEvidenceFromReportDir(reportDir);
  process.stdout.write(
    formatPublicationEvidenceReplaySummary(summary) +
      PUBLICATION_EVIDENCE_REPLAY_NEWLINE,
  );
}

if (process.argv[NUM.ONE] === fileURLToPath(import.meta.url)) {
  runPublicationEvidenceReplayCli().catch((error) => {
    process.stderr.write(
      JSON.stringify(
        {error: error.message},
        PUBLICATION_EVIDENCE_REPLAY_JSON_REPLACER,
        PUBLICATION_EVIDENCE_REPLAY_JSON_INDENT,
      ) + PUBLICATION_EVIDENCE_REPLAY_NEWLINE,
    );
    process.exitCode = PUBLICATION_EVIDENCE_REPLAY_EXIT_CODE.FAILURE;
  });
}

export {
  PUBLICATION_EVIDENCE_REPLAY_AVAILABILITY,
  PUBLICATION_EVIDENCE_REPLAY_CLOSURE_WITNESS_CLASSIFICATION,
  PUBLICATION_EVIDENCE_REPLAY_DRIFT_CLASSIFICATION,
  PUBLICATION_EVIDENCE_REPLAY_REBALANCER_FOLLOW_UP_EXECUTION_STATE,
  PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_STATE,
  formatPublicationEvidenceReplaySummary,
  replayPublicationPriorityEvidenceFromReportDir,
  replayPublicationPriorityEvidenceFromRows,
};
