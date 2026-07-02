import {
  PRIORITY_RECOVERY_ACTUATION_STATE,
  PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION,
} from '../../../src/control-plane/priority-recovery-diagnostics-constants.js';
import {
  REBALANCE_COORDINATOR_LOG_MSG,
  REBALANCER_LOG_MSG,
  REBALANCER_SKIP_REASON,
} from '../../../src/rebalancer/rebalancer-constants.js';
import {
  STORAGE_CAPACITY_LOG_MSG,
} from '../../../src/rebalancer/storage-capacity-constants.js';
import {
  PUBLICATION_EVIDENCE_REPLAY_AVAILABILITY,
  PUBLICATION_EVIDENCE_REPLAY_EMPTY_TEXT,
  PUBLICATION_EVIDENCE_REPLAY_FIELD,
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
  PUBLICATION_EVIDENCE_REPLAY_REPLICA_OPERATION_ROW_FIELD,
} from './publication-evidence-replay-constants.js';
import {
  isRecord,
  normalizeInteger,
  normalizeList,
  normalizeRecordKeyList,
  normalizeText,
  normalizeTimestampMs,
  parseRepairLogRecordFromLine,
  readArrayField,
  readFailureBundleLogExcerptLines,
  readRecordField,
} from './publication-evidence-replay-shared.js';

function readPriorityRecoveryWitnessCandidates(failureBundle = {}) {
  const controlPlaneState = readRecordField(
    failureBundle,
    PUBLICATION_EVIDENCE_REPLAY_FIELD.CONTROL_PLANE,
  );
  const observationState = readRecordField(
    controlPlaneState.value,
    PUBLICATION_EVIDENCE_REPLAY_FIELD.PRIORITY_RECOVERY_OBSERVATION,
  );
  return readArrayField(
    observationState.value,
    PUBLICATION_EVIDENCE_REPLAY_FIELD.PRIORITY_RECOVERY_PARTITION_WITNESSES,
    PUBLICATION_EVIDENCE_REPLAY_FIELD.PARTITION_WITNESSES,
  ).filter(isRecord);
}

function appendPriorityWitnessIntegerField(target, fieldName, value) {
  const normalizedValue = Number(value);
  if (Number.isFinite(normalizedValue)) {
    target[fieldName] = Math.trunc(normalizedValue);
  }
  return target;
}

function buildMissingPriorityRecoveryWitness() {
  return {
    [PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD.AVAILABILITY]:
      PUBLICATION_EVIDENCE_REPLAY_AVAILABILITY.MISSING,
    [PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD.PARTITION_ID]:
      PUBLICATION_EVIDENCE_REPLAY_EMPTY_TEXT,
    [PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD.SEMANTIC_STATE_ID]:
      PUBLICATION_EVIDENCE_REPLAY_EMPTY_TEXT,
    [PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD.OPERATION_ID]:
      PUBLICATION_EVIDENCE_REPLAY_EMPTY_TEXT,
    [PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD.CORRELATION_KEY]:
      PUBLICATION_EVIDENCE_REPLAY_EMPTY_TEXT,
    [PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD.CURRENT_OWNER]:
      PUBLICATION_EVIDENCE_REPLAY_EMPTY_TEXT,
    [PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD.BLOCKING_BOUNDARY]:
      PUBLICATION_EVIDENCE_REPLAY_EMPTY_TEXT,
    [PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD.WAIT_MODE]:
      PUBLICATION_EVIDENCE_REPLAY_EMPTY_TEXT,
    [PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD.NEXT_REQUIRED_ACTION]:
      PUBLICATION_EVIDENCE_REPLAY_EMPTY_TEXT,
    [PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD.ACTUATION_STATE]:
      PUBLICATION_EVIDENCE_REPLAY_EMPTY_TEXT,
    [PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD.WORKFLOW_PROGRESS_PHASE_ID]:
      PUBLICATION_EVIDENCE_REPLAY_EMPTY_TEXT,
    [PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD
      .LATEST_OPERATION_WORKFLOW_STEP]:
      PUBLICATION_EVIDENCE_REPLAY_EMPTY_TEXT,
    [PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD.LATEST_OPERATION_STATUS]:
      PUBLICATION_EVIDENCE_REPLAY_EMPTY_TEXT,
    [PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD.PROGRESS_CLASS_IDS]:
      [],
    [PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD.SERIAL_WAIT_OPERATION_IDS]:
      [],
    [PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD.SERIAL_WAIT_PARTITION_IDS]:
      [],
  };
}

function summarizePriorityRecoveryWitness(witnessCandidate) {
  const witness = isRecord(witnessCandidate) ? witnessCandidate : {};
  const operationId = normalizeList(witness.operationIds)[0] ||
    PUBLICATION_EVIDENCE_REPLAY_EMPTY_TEXT;
  const summary = {
    [PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD.AVAILABILITY]:
      isRecord(witnessCandidate) ?
        PUBLICATION_EVIDENCE_REPLAY_AVAILABILITY.AVAILABLE :
        PUBLICATION_EVIDENCE_REPLAY_AVAILABILITY.MISSING,
    [PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD.PARTITION_ID]:
      normalizeText(witness.partitionId),
    [PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD.SEMANTIC_STATE_ID]:
      normalizeText(witness.semanticStateId),
    [PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD.OPERATION_ID]:
      operationId,
    [PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD.CORRELATION_KEY]:
      normalizeText(witness.correlationKey),
    [PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD.CURRENT_OWNER]:
      normalizeText(witness.currentOwner),
    [PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD.BLOCKING_BOUNDARY]:
      normalizeText(witness.blockingBoundary),
    [PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD.WAIT_MODE]:
      normalizeText(witness.waitMode),
    [PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD.NEXT_REQUIRED_ACTION]:
      normalizeText(witness.nextRequiredAction),
    [PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD.ACTUATION_STATE]:
      normalizeText(witness.actuationState),
    [PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD.WORKFLOW_PROGRESS_PHASE_ID]:
      normalizeText(witness.workflowProgressPhaseId),
    [PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD
      .LATEST_OPERATION_WORKFLOW_STEP]:
      normalizeText(witness.latestOperationWorkflowStep),
    [PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD.LATEST_OPERATION_STATUS]:
      normalizeText(witness.latestOperationStatus),
    [PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD.PROGRESS_CLASS_IDS]:
      normalizeList(
        readArrayField(
          witness,
          PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD.PROGRESS_CLASS_IDS,
        ),
      ),
    [PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD.SERIAL_WAIT_OPERATION_IDS]:
      normalizeList(
        readArrayField(
          witness,
          PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD
            .SERIAL_WAIT_OPERATION_IDS,
        ),
      ),
    [PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD.SERIAL_WAIT_PARTITION_IDS]:
      normalizeList(
        readArrayField(
          witness,
          PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD
            .SERIAL_WAIT_PARTITION_IDS,
        ),
      ),
  };
  appendPriorityWitnessIntegerField(
    summary,
    PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD.STEP_AGE_MS,
    witness.stepAgeMs,
  );
  appendPriorityWitnessIntegerField(
    summary,
    PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD.STEP_TIMEOUT_MS,
    witness.stepTimeoutMs,
  );
  return summary;
}

function summarizePriorityRecoveryWitnesses(failureBundle = {}) {
  return readPriorityRecoveryWitnessCandidates(failureBundle)
    .map((witnessCandidate) =>
      summarizePriorityRecoveryWitness(witnessCandidate),
    );
}

function selectSupportingPriorityRecoveryWitness(priorityRecoveryWitnesses = []) {
  return priorityRecoveryWitnesses.length > 0 ?
    priorityRecoveryWitnesses[0] :
    buildMissingPriorityRecoveryWitness();
}

function selectRebalancerFollowUpWitness(priorityRecoveryWitnesses = []) {
  return priorityRecoveryWitnesses.find((witness) =>
    witness[
      PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD.NEXT_REQUIRED_ACTION
    ] === PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.SCHEDULE_FOLLOWUP_REBALANCE &&
    witness[
      PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD.ACTUATION_STATE
    ] === PRIORITY_RECOVERY_ACTUATION_STATE.TERMINAL_FAILED &&
    witness[
      PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD.OPERATION_ID
    ].length > 0,
  ) || buildMissingPriorityRecoveryWitness();
}

function normalizeRebalancerReadinessGroup(record = {}) {
  return {
    nodeId: normalizeText(
      record[PUBLICATION_EVIDENCE_REPLAY_REBALANCER_LOG_FIELD.NODE_ID],
    ),
    moveCount: normalizeInteger(
      record[PUBLICATION_EVIDENCE_REPLAY_REBALANCER_LOG_FIELD.MOVE_COUNT],
    ),
    addLikeMoveCount: normalizeInteger(
      record[
        PUBLICATION_EVIDENCE_REPLAY_REBALANCER_LOG_FIELD.ADD_LIKE_MOVE_COUNT
      ],
    ),
    removeMoveCount: normalizeInteger(
      record[PUBLICATION_EVIDENCE_REPLAY_REBALANCER_LOG_FIELD.REMOVE_MOVE_COUNT],
    ),
    otherMoveCount: normalizeInteger(
      record[PUBLICATION_EVIDENCE_REPLAY_REBALANCER_LOG_FIELD.OTHER_MOVE_COUNT],
    ),
    readinessState: normalizeText(
      record[PUBLICATION_EVIDENCE_REPLAY_REBALANCER_LOG_FIELD.READINESS_STATE],
    ),
    skipDetail: normalizeText(
      record[PUBLICATION_EVIDENCE_REPLAY_REBALANCER_LOG_FIELD.SKIP_DETAIL],
    ),
  };
}

function normalizeRebalancerReadinessGroups(records = []) {
  return (Array.isArray(records) ? records : [])
    .filter(isRecord)
    .map((record) => normalizeRebalancerReadinessGroup(record));
}

function normalizeRebalancerHandoffLogEvidence(record = {}) {
  return {
    message: normalizeText(
      record[PUBLICATION_EVIDENCE_REPLAY_REBALANCER_LOG_FIELD.MSG],
    ),
    nodeId: normalizeText(
      record[PUBLICATION_EVIDENCE_REPLAY_REBALANCER_LOG_FIELD.NODE_ID],
    ),
    entityId: normalizeText(
      record[PUBLICATION_EVIDENCE_REPLAY_REBALANCER_LOG_FIELD.ENTITY_ID],
    ),
    partitionId: normalizeText(
      record[PUBLICATION_EVIDENCE_REPLAY_REBALANCER_LOG_FIELD.PARTITION_ID],
    ),
    operationId: normalizeText(
      record[PUBLICATION_EVIDENCE_REPLAY_REBALANCER_LOG_FIELD.OPERATION_ID],
    ),
    replicaId: normalizeText(
      record[PUBLICATION_EVIDENCE_REPLAY_REBALANCER_LOG_FIELD.REPLICA_ID],
    ),
    moveType: normalizeText(
      record[PUBLICATION_EVIDENCE_REPLAY_REBALANCER_LOG_FIELD.MOVE_TYPE],
    ),
    reason: normalizeText(
      record[PUBLICATION_EVIDENCE_REPLAY_REBALANCER_LOG_FIELD.REASON],
    ),
    decision: normalizeText(
      record[PUBLICATION_EVIDENCE_REPLAY_REBALANCER_LOG_FIELD.DECISION],
    ),
    error: normalizeText(
      record[PUBLICATION_EVIDENCE_REPLAY_REBALANCER_LOG_FIELD.ERROR],
    ),
    errorMessage: normalizeText(
      record[PUBLICATION_EVIDENCE_REPLAY_REBALANCER_LOG_FIELD.ERROR_MESSAGE],
    ),
    skipDetail: normalizeText(
      record[PUBLICATION_EVIDENCE_REPLAY_REBALANCER_LOG_FIELD.SKIP_DETAIL],
    ),
    timeMs: normalizeTimestampMs(
      record[PUBLICATION_EVIDENCE_REPLAY_REBALANCER_LOG_FIELD.TIME],
    ),
    moveCount: normalizeInteger(
      record[PUBLICATION_EVIDENCE_REPLAY_REBALANCER_LOG_FIELD.MOVE_COUNT],
    ),
    plannedMoveCount: normalizeInteger(
      record[
        PUBLICATION_EVIDENCE_REPLAY_REBALANCER_LOG_FIELD.PLANNED_MOVE_COUNT
      ],
    ),
    moveLimit: normalizeInteger(
      record[PUBLICATION_EVIDENCE_REPLAY_REBALANCER_LOG_FIELD.MOVE_LIMIT],
    ),
    limitedMoveCount: normalizeInteger(
      record[
        PUBLICATION_EVIDENCE_REPLAY_REBALANCER_LOG_FIELD.LIMITED_MOVE_COUNT
      ],
    ),
    executableMoveCount: normalizeInteger(
      record[
        PUBLICATION_EVIDENCE_REPLAY_REBALANCER_LOG_FIELD.EXECUTABLE_MOVE_COUNT
      ],
    ),
    preExecuteSkippedMoveCount: normalizeInteger(
      record[
        PUBLICATION_EVIDENCE_REPLAY_REBALANCER_LOG_FIELD
          .PRE_EXECUTE_SKIPPED_MOVE_COUNT
      ],
    ),
    readinessGroupCount: normalizeInteger(
      record[
        PUBLICATION_EVIDENCE_REPLAY_REBALANCER_LOG_FIELD.READINESS_GROUP_COUNT
      ],
    ),
    readyReadinessGroupCount: normalizeInteger(
      record[
        PUBLICATION_EVIDENCE_REPLAY_REBALANCER_LOG_FIELD
          .READY_READINESS_GROUP_COUNT
      ],
    ),
    blockedReadinessGroupCount: normalizeInteger(
      record[
        PUBLICATION_EVIDENCE_REPLAY_REBALANCER_LOG_FIELD
          .BLOCKED_READINESS_GROUP_COUNT
      ],
    ),
    readinessGroups: normalizeRebalancerReadinessGroups(
      record[PUBLICATION_EVIDENCE_REPLAY_REBALANCER_LOG_FIELD.READINESS_GROUPS],
    ),
    preExecuteSkipReasons: normalizeList(
      record[
        PUBLICATION_EVIDENCE_REPLAY_REBALANCER_LOG_FIELD
          .PRE_EXECUTE_SKIP_REASONS
      ],
    ),
    preExecutionHandoffState: normalizeText(
      record[
        PUBLICATION_EVIDENCE_REPLAY_REBALANCER_LOG_FIELD
          .PRE_EXECUTION_HANDOFF_STATE
      ],
    ),
    preExecuteReturnState: normalizeText(
      record[
        PUBLICATION_EVIDENCE_REPLAY_REBALANCER_LOG_FIELD
          .PRE_EXECUTE_RETURN_STATE
      ],
    ),
    totalCandidates: normalizeInteger(
      record[
        PUBLICATION_EVIDENCE_REPLAY_REBALANCER_LOG_FIELD.TOTAL_CANDIDATES
      ],
    ),
    feasibleCount: normalizeInteger(
      record[PUBLICATION_EVIDENCE_REPLAY_REBALANCER_LOG_FIELD.FEASIBLE_COUNT],
    ),
    rejectedCount: normalizeInteger(
      record[PUBLICATION_EVIDENCE_REPLAY_REBALANCER_LOG_FIELD.REJECTED_COUNT],
    ),
    rejectionReasonCodes: normalizeRecordKeyList(
      record[
        PUBLICATION_EVIDENCE_REPLAY_REBALANCER_LOG_FIELD.REJECTIONS_BY_REASON
      ],
    ),
    targetNodeId: normalizeText(
      record[PUBLICATION_EVIDENCE_REPLAY_REBALANCER_LOG_FIELD.TARGET_NODE_ID],
    ),
    queryDurationMs: normalizeInteger(
      record[
        PUBLICATION_EVIDENCE_REPLAY_REBALANCER_LOG_FIELD.QUERY_DURATION_MS
      ],
    ),
    rowCount: normalizeInteger(
      record[PUBLICATION_EVIDENCE_REPLAY_REBALANCER_LOG_FIELD.ROW_COUNT],
    ),
    hasCoordinator:
      record[PUBLICATION_EVIDENCE_REPLAY_REBALANCER_LOG_FIELD.HAS_COORDINATOR] ===
      true,
  };
}

function selectLatestRebalancerHandoffLog(records = []) {
  return records.reduce(
    (selected, record) => record.timeMs >= selected.timeMs ? record : selected,
    Object.freeze({
      message: PUBLICATION_EVIDENCE_REPLAY_EMPTY_TEXT,
      nodeId: PUBLICATION_EVIDENCE_REPLAY_EMPTY_TEXT,
      entityId: PUBLICATION_EVIDENCE_REPLAY_EMPTY_TEXT,
      partitionId: PUBLICATION_EVIDENCE_REPLAY_EMPTY_TEXT,
      operationId: PUBLICATION_EVIDENCE_REPLAY_EMPTY_TEXT,
      replicaId: PUBLICATION_EVIDENCE_REPLAY_EMPTY_TEXT,
      moveType: PUBLICATION_EVIDENCE_REPLAY_EMPTY_TEXT,
      reason: PUBLICATION_EVIDENCE_REPLAY_EMPTY_TEXT,
      decision: PUBLICATION_EVIDENCE_REPLAY_EMPTY_TEXT,
      error: PUBLICATION_EVIDENCE_REPLAY_EMPTY_TEXT,
      errorMessage: PUBLICATION_EVIDENCE_REPLAY_EMPTY_TEXT,
      skipDetail: PUBLICATION_EVIDENCE_REPLAY_EMPTY_TEXT,
      timeMs: 0,
      moveCount: 0,
      plannedMoveCount: 0,
      moveLimit: 0,
      limitedMoveCount: 0,
      executableMoveCount: 0,
      preExecuteSkippedMoveCount: 0,
      readinessGroupCount: 0,
      readyReadinessGroupCount: 0,
      blockedReadinessGroupCount: 0,
      readinessGroups: Object.freeze([]),
      preExecuteSkipReasons: Object.freeze([]),
      preExecutionHandoffState: PUBLICATION_EVIDENCE_REPLAY_EMPTY_TEXT,
      preExecuteReturnState: PUBLICATION_EVIDENCE_REPLAY_EMPTY_TEXT,
      totalCandidates: 0,
      feasibleCount: 0,
      rejectedCount: 0,
      rejectionReasonCodes: Object.freeze([]),
      targetNodeId: PUBLICATION_EVIDENCE_REPLAY_EMPTY_TEXT,
      queryDurationMs: 0,
      rowCount: 0,
      hasCoordinator: false,
    }),
  );
}

function readRebalancerHandoffLogEvidence(failureBundle = {}, logLines = []) {
  return [
    ...new Set([
      ...readFailureBundleLogExcerptLines(failureBundle),
      ...(Array.isArray(logLines) ? logLines : []),
    ]),
  ]
    .map(parseRepairLogRecordFromLine)
    .filter(isRecord)
    .map(normalizeRebalancerHandoffLogEvidence);
}

function normalizeReplicaOperationRow(row = {}) {
  return {
    operationId: normalizeText(
      row[
        PUBLICATION_EVIDENCE_REPLAY_REPLICA_OPERATION_ROW_FIELD.OPERATION_ID
      ] ||
        row[
          PUBLICATION_EVIDENCE_REPLAY_REPLICA_OPERATION_ROW_FIELD
            .OPERATION_ID_SNAKE
        ],
    ),
    partitionId: normalizeText(
      row[
        PUBLICATION_EVIDENCE_REPLAY_REPLICA_OPERATION_ROW_FIELD.PARTITION_ID
      ] ||
        row[
          PUBLICATION_EVIDENCE_REPLAY_REPLICA_OPERATION_ROW_FIELD
            .PARTITION_ID_SNAKE
        ],
    ),
    status: normalizeText(
      row[PUBLICATION_EVIDENCE_REPLAY_REPLICA_OPERATION_ROW_FIELD.STATUS],
    ),
    workflowStep: normalizeText(
      row[
        PUBLICATION_EVIDENCE_REPLAY_REPLICA_OPERATION_ROW_FIELD.WORKFLOW_STEP
      ] ||
        row[
          PUBLICATION_EVIDENCE_REPLAY_REPLICA_OPERATION_ROW_FIELD
            .WORKFLOW_STEP_SNAKE
        ],
    ),
    createdAtMs: normalizeInteger(
      row[PUBLICATION_EVIDENCE_REPLAY_REPLICA_OPERATION_ROW_FIELD.CREATED_AT] ||
        row[
          PUBLICATION_EVIDENCE_REPLAY_REPLICA_OPERATION_ROW_FIELD
            .CREATED_AT_SNAKE
        ],
    ),
    updatedAtMs: normalizeInteger(
      row[PUBLICATION_EVIDENCE_REPLAY_REPLICA_OPERATION_ROW_FIELD.UPDATED_AT] ||
        row[
          PUBLICATION_EVIDENCE_REPLAY_REPLICA_OPERATION_ROW_FIELD
            .UPDATED_AT_SNAKE
        ],
    ),
  };
}

function readReplicaOperationRowsFromSnapshotStates(snapshotStates = []) {
  return snapshotStates
    .filter((snapshotState) =>
      snapshotState?.availability ===
        PUBLICATION_EVIDENCE_REPLAY_AVAILABILITY.AVAILABLE,
    )
    .map((snapshotState) => snapshotState.value)
    .filter(isRecord)
    .flatMap((snapshot) => [
      ...readArrayField(
        snapshot,
        PUBLICATION_EVIDENCE_REPLAY_FIELD.REPLICA_OPERATIONS,
      ),
      ...readArrayField(
        snapshot,
        PUBLICATION_EVIDENCE_REPLAY_FIELD.REPLICA_OPERATIONS_SNAKE,
      ),
    ])
    .map((row) => normalizeReplicaOperationRow(row))
    .filter((row) => row.operationId.length > 0);
}

function selectLatestReplicaOperationRow(rows = []) {
  return rows.reduce(
    (selected, row) => {
      const rowTime = Math.max(row.createdAtMs, row.updatedAtMs);
      const selectedTime = Math.max(selected.createdAtMs, selected.updatedAtMs);
      return rowTime >= selectedTime ? row : selected;
    },
    Object.freeze({
      operationId: PUBLICATION_EVIDENCE_REPLAY_EMPTY_TEXT,
      partitionId: PUBLICATION_EVIDENCE_REPLAY_EMPTY_TEXT,
      status: PUBLICATION_EVIDENCE_REPLAY_EMPTY_TEXT,
      workflowStep: PUBLICATION_EVIDENCE_REPLAY_EMPTY_TEXT,
      createdAtMs: 0,
      updatedAtMs: 0,
    }),
  );
}

function isTerminalOperationFailureLog(evidence, witness) {
  return (
    evidence.message === REBALANCE_COORDINATOR_LOG_MSG.OPERATION_FAILED &&
    evidence.operationId ===
      witness[PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD.OPERATION_ID] &&
    evidence.partitionId ===
      witness[PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD.PARTITION_ID]
  );
}

function isPostTerminalRebalanceStartLog(evidence, witness, terminalFailure) {
  return (
    evidence.message === REBALANCER_LOG_MSG.START_REBALANCE &&
    evidence.entityId ===
      witness[PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD.PARTITION_ID] &&
    evidence.timeMs > terminalFailure.timeMs &&
    evidence.moveCount > 0
  );
}

function isPostTerminalPreExecutionHandoffLog(
  evidence,
  witness,
  postTerminalRebalance,
) {
  return (
    evidence.message === REBALANCER_LOG_MSG.PRE_EXECUTION_HANDOFF &&
    evidence.entityId ===
      witness[PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD.PARTITION_ID] &&
    evidence.timeMs > postTerminalRebalance.timeMs
  );
}

function isPostTerminalMoveExecutionLog(evidence, witness, postTerminalRebalance) {
  return (
    evidence.message === REBALANCER_LOG_MSG.EXECUTE_MOVE &&
    evidence.entityId ===
      witness[PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD.PARTITION_ID] &&
    evidence.timeMs > postTerminalRebalance.timeMs
  );
}

function isPostTerminalMoveBlockedLog(evidence, witness, postTerminalRebalance) {
  const partitionId =
    witness[PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD.PARTITION_ID];
  return (
    PUBLICATION_EVIDENCE_REPLAY_REBALANCER_MOVE_BLOCKED_MESSAGES.includes(
      evidence.message,
    ) &&
    (evidence.entityId === partitionId || evidence.partitionId === partitionId) &&
    evidence.timeMs > postTerminalRebalance.timeMs
  );
}

function isPostTerminalFeasibilityFilterLog(
  evidence,
  witness,
  terminalFailure,
  postTerminalRebalance,
) {
  return (
    evidence.message === STORAGE_CAPACITY_LOG_MSG.CAPACITY_FILTER_APPLIED &&
    evidence.entityId ===
      witness[PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD.PARTITION_ID] &&
    evidence.timeMs > terminalFailure.timeMs &&
    evidence.timeMs <= postTerminalRebalance.timeMs
  );
}

function isPrecedingCapacityFeasibilityFilterLog(
  evidence,
  postTerminalFeasibilityFilter,
) {
  return (
    evidence.message === STORAGE_CAPACITY_LOG_MSG.CAPACITY_FILTER_APPLIED &&
    evidence.nodeId === postTerminalFeasibilityFilter.nodeId &&
    evidence.timeMs < postTerminalFeasibilityFilter.timeMs
  );
}

function selectRebalancerAdmissionBatchStartTimeMs(
  logEvidence = [],
  postTerminalFeasibilityFilter = {},
) {
  return selectLatestRebalancerHandoffLog(
    logEvidence.filter((evidence) =>
      isPrecedingCapacityFeasibilityFilterLog(
        evidence,
        postTerminalFeasibilityFilter,
      ),
    ),
  ).timeMs;
}

function isPostTerminalAdmissionLog(
  evidence,
  terminalFailure,
  postTerminalFeasibilityFilter,
  admissionBatchStartTimeMs,
  message,
) {
  const admissionWindowStartTimeMs = Math.max(
    terminalFailure.timeMs,
    admissionBatchStartTimeMs,
  );
  return (
    postTerminalFeasibilityFilter.timeMs > 0 &&
    evidence.message === message &&
    evidence.nodeId === postTerminalFeasibilityFilter.nodeId &&
    evidence.timeMs > admissionWindowStartTimeMs &&
    evidence.timeMs <= postTerminalFeasibilityFilter.timeMs
  );
}

function isPostTerminalBudgetPressureLog(evidence, postTerminalRebalance) {
  return (
    evidence.message ===
      PUBLICATION_EVIDENCE_REPLAY_REBALANCER_LOG
        .CONTROL_PLANE_PRESSURE_QUERY &&
    evidence.timeMs > postTerminalRebalance.timeMs
  );
}

function isPostTerminalBudgetBlockLog(evidence, witness, postTerminalRebalance) {
  const partitionId =
    witness[PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD.PARTITION_ID];
  return (
    evidence.timeMs > postTerminalRebalance.timeMs &&
    (evidence.entityId === partitionId || evidence.partitionId === partitionId) &&
    (
      evidence.reason === REBALANCER_SKIP_REASON.BUDGET_EXCEEDED ||
      evidence.skipDetail === REBALANCER_SKIP_REASON.BUDGET_EXCEEDED
    )
  );
}

function isPostTerminalLeadershipLossLog(
  evidence,
  witness,
  postTerminalRebalance,
) {
  return (
    evidence.message === REBALANCER_LOG_MSG.LEADER_STOP &&
    evidence.entityId ===
      witness[PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD.PARTITION_ID] &&
    evidence.timeMs > postTerminalRebalance.timeMs
  );
}

function isPostTerminalSiblingLeadershipLossLog(
  evidence,
  witness,
  postTerminalRebalance,
) {
  return (
    evidence.message === REBALANCER_LOG_MSG.LEADER_STOP &&
    evidence.entityId !==
      witness[PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD.PARTITION_ID] &&
    evidence.timeMs > postTerminalRebalance.timeMs
  );
}

function isPostTerminalSchedulerHandoffLog(
  evidence,
  witness,
  postTerminalRebalance,
) {
  return (
    (
      evidence.message === REBALANCER_LOG_MSG.COORDINATOR_SET ||
      evidence.message === REBALANCER_LOG_MSG.LEADER_START
    ) &&
    evidence.entityId ===
      witness[PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD.PARTITION_ID] &&
    evidence.timeMs > postTerminalRebalance.timeMs
  );
}

function isPostTerminalPersistedReplicaOperation(
  operation,
  witness,
  postTerminalRebalance,
) {
  return (
    operation.partitionId ===
      witness[PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD.PARTITION_ID] &&
    operation.operationId !==
      witness[PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD.OPERATION_ID] &&
    operation.createdAtMs >= postTerminalRebalance.timeMs &&
    postTerminalRebalance.timeMs > 0
  );
}

function isPostTerminalSuppressionLog(evidence, witness, terminalFailure) {
  return (
    PUBLICATION_EVIDENCE_REPLAY_REBALANCER_SUPPRESSION_MESSAGES.includes(
      evidence.message,
    ) &&
    evidence.entityId ===
      witness[PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD.PARTITION_ID] &&
    evidence.timeMs > terminalFailure.timeMs
  );
}

function selectRebalancerMoveBlockedReason(evidence = {}) {
  return [
    evidence.reason,
    evidence.errorMessage,
    evidence.error,
    evidence.skipDetail,
    evidence.message,
  ].find((value) => normalizeText(value).length > 0) ||
    PUBLICATION_EVIDENCE_REPLAY_EMPTY_TEXT;
}

function resolveRebalancerHandoffFollowUpState(evidence = {}) {
  const state = [
    Object.freeze({
      state: PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_STATE.ENQUEUED,
      matches: (handoffEvidence) =>
        handoffEvidence.retainedByWitness === true &&
        handoffEvidence.terminalFailureObserved === true &&
        handoffEvidence.postTerminalRebalanceObserved === true,
    }),
    Object.freeze({
      state: PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_STATE.SUPPRESSED,
      matches: (handoffEvidence) =>
        handoffEvidence.retainedByWitness === true &&
        handoffEvidence.terminalFailureObserved === true &&
        handoffEvidence.postTerminalSuppressionObserved === true,
    }),
    Object.freeze({
      state: PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_STATE.RETAINED,
      matches: (handoffEvidence) =>
        handoffEvidence.retainedByWitness === true,
    }),
    Object.freeze({
      state: PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_STATE.MISSING,
      matches: () => true,
    }),
  ].find((entry) => entry.matches(evidence))?.state;
  return state || PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_STATE.MISSING;
}

function resolveRebalancerFollowUpExecutionState(evidence = {}) {
  const state = [
    Object.freeze({
      state: PUBLICATION_EVIDENCE_REPLAY_REBALANCER_FOLLOW_UP_EXECUTION_STATE
        .PERSISTED_NEW_OPERATION,
      matches: (executionEvidence) =>
        executionEvidence.persistedOperationObserved === true,
    }),
    Object.freeze({
      state: PUBLICATION_EVIDENCE_REPLAY_REBALANCER_FOLLOW_UP_EXECUTION_STATE
        .BLOCKED_DURING_MOVE_EXECUTION,
      matches: (executionEvidence) =>
        executionEvidence.moveExecutionObserved === true &&
        executionEvidence.moveBlockedObserved === true,
    }),
    Object.freeze({
      state: PUBLICATION_EVIDENCE_REPLAY_REBALANCER_FOLLOW_UP_EXECUTION_STATE
        .EXECUTED_WITHOUT_PERSISTED_OPERATION,
      matches: (executionEvidence) =>
        executionEvidence.moveExecutionObserved === true,
    }),
    Object.freeze({
      state: PUBLICATION_EVIDENCE_REPLAY_REBALANCER_FOLLOW_UP_EXECUTION_STATE
        .NOT_EXECUTED_AFTER_ENQUEUE,
      matches: (executionEvidence) =>
        executionEvidence.followUpState ===
          PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_STATE.ENQUEUED,
    }),
    Object.freeze({
      state: PUBLICATION_EVIDENCE_REPLAY_REBALANCER_FOLLOW_UP_EXECUTION_STATE
        .MISSING,
      matches: () => true,
    }),
  ].find((entry) => entry.matches(evidence))?.state;
  return state ||
    PUBLICATION_EVIDENCE_REPLAY_REBALANCER_FOLLOW_UP_EXECUTION_STATE.MISSING;
}

function resolveRebalancerMoveLimitEvidenceState(evidence = {}) {
  const state = [
    Object.freeze({
      state:
        PUBLICATION_EVIDENCE_REPLAY_REBALANCER_MOVE_LIMIT_STATE.BUDGET_BLOCKED,
      matches: (moveLimitEvidence) =>
        moveLimitEvidence.budgetBlockObserved === true,
    }),
    Object.freeze({
      state:
        PUBLICATION_EVIDENCE_REPLAY_REBALANCER_MOVE_LIMIT_STATE
          .LIMITED_MOVES_AVAILABLE,
      matches: (moveLimitEvidence) =>
        moveLimitEvidence.limitedMoveCount > 0,
    }),
    Object.freeze({
      state:
        PUBLICATION_EVIDENCE_REPLAY_REBALANCER_MOVE_LIMIT_STATE
          .PLANNED_MOVE_COUNT_AVAILABLE,
      matches: (moveLimitEvidence) =>
        moveLimitEvidence.postTerminalRebalanceMoveCount > 0,
    }),
    Object.freeze({
      state: PUBLICATION_EVIDENCE_REPLAY_REBALANCER_MOVE_LIMIT_STATE.MISSING,
      matches: () => true,
    }),
  ].find((entry) => entry.matches(evidence))?.state;
  return state ||
    PUBLICATION_EVIDENCE_REPLAY_REBALANCER_MOVE_LIMIT_STATE.MISSING;
}

function resolveRebalancerExecutionGapState(evidence = {}) {
  const state = [
    Object.freeze({
      state:
        PUBLICATION_EVIDENCE_REPLAY_REBALANCER_EXECUTION_GAP_STATE
          .NEW_OPERATION_PERSISTED,
      matches: (executionEvidence) =>
        executionEvidence.persistedOperationObserved === true,
    }),
    Object.freeze({
      state:
        PUBLICATION_EVIDENCE_REPLAY_REBALANCER_EXECUTION_GAP_STATE
          .MOVE_BLOCKED,
      matches: (executionEvidence) =>
        executionEvidence.moveBlockedObserved === true,
    }),
    Object.freeze({
      state:
        PUBLICATION_EVIDENCE_REPLAY_REBALANCER_EXECUTION_GAP_STATE
          .MOVE_EXECUTED,
      matches: (executionEvidence) =>
        executionEvidence.moveExecutionObserved === true,
    }),
    Object.freeze({
      state:
        PUBLICATION_EVIDENCE_REPLAY_REBALANCER_EXECUTION_GAP_STATE
          .BUDGET_BLOCKED,
      matches: (executionEvidence) =>
        executionEvidence.budgetBlockObserved === true,
    }),
    Object.freeze({
      state:
        PUBLICATION_EVIDENCE_REPLAY_REBALANCER_EXECUTION_GAP_STATE
          .ADMISSION_DENIED,
      matches: (executionEvidence) =>
        executionEvidence.admissionDeniedObserved === true,
    }),
    Object.freeze({
      state:
        PUBLICATION_EVIDENCE_REPLAY_REBALANCER_EXECUTION_GAP_STATE
          .SAME_PARTITION_LEADERSHIP_LOST,
      matches: (executionEvidence) =>
        executionEvidence.leadershipLossObserved === true,
    }),
    Object.freeze({
      state:
        PUBLICATION_EVIDENCE_REPLAY_REBALANCER_EXECUTION_GAP_STATE
          .STARTED_WITH_PRE_EXECUTION_GAP,
      matches: (executionEvidence) =>
        executionEvidence.postTerminalRebalanceObserved === true,
    }),
  ].find((entry) => entry.matches(evidence))?.state;
  return state ||
    PUBLICATION_EVIDENCE_REPLAY_REBALANCER_EXECUTION_GAP_STATE
      .STARTED_WITH_PRE_EXECUTION_GAP;
}

function summarizeRebalancerFollowUpHandoff({
  failureBundle = {},
  logLines = [],
  priorityRecoveryWitnesses = [],
  snapshotStates = [],
} = {}) {
  const witness = selectRebalancerFollowUpWitness(priorityRecoveryWitnesses);
  const retainedByWitness =
    witness[
      PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD.AVAILABILITY
    ] === PUBLICATION_EVIDENCE_REPLAY_AVAILABILITY.AVAILABLE;
  const logEvidence = readRebalancerHandoffLogEvidence(failureBundle, logLines);
  const terminalFailure = selectLatestRebalancerHandoffLog(
    logEvidence.filter((evidence) =>
      isTerminalOperationFailureLog(evidence, witness),
    ),
  );
  const terminalFailureObserved = terminalFailure.timeMs > 0;
  const postTerminalRebalance = selectLatestRebalancerHandoffLog(
    logEvidence.filter((evidence) =>
      isPostTerminalRebalanceStartLog(evidence, witness, terminalFailure),
    ),
  );
  const postTerminalPreExecutionHandoff = selectLatestRebalancerHandoffLog(
    logEvidence.filter((evidence) =>
      isPostTerminalPreExecutionHandoffLog(
        evidence,
        witness,
        postTerminalRebalance,
      ),
    ),
  );
  const postTerminalSuppression = selectLatestRebalancerHandoffLog(
    logEvidence.filter((evidence) =>
      isPostTerminalSuppressionLog(evidence, witness, terminalFailure),
    ),
  );
  const postTerminalMoveExecution = selectLatestRebalancerHandoffLog(
    logEvidence.filter((evidence) =>
      isPostTerminalMoveExecutionLog(evidence, witness, postTerminalRebalance),
    ),
  );
  const postTerminalMoveBlocked = selectLatestRebalancerHandoffLog(
    logEvidence.filter((evidence) =>
      isPostTerminalMoveBlockedLog(evidence, witness, postTerminalRebalance),
    ),
  );
  const postTerminalFeasibilityFilter = selectLatestRebalancerHandoffLog(
    logEvidence.filter((evidence) =>
      isPostTerminalFeasibilityFilterLog(
        evidence,
        witness,
        terminalFailure,
        postTerminalRebalance,
      ),
    ),
  );
  const postTerminalAdmissionBatchStartTimeMs =
    selectRebalancerAdmissionBatchStartTimeMs(
      logEvidence,
      postTerminalFeasibilityFilter,
    );
  const postTerminalAdmissionAllowed = logEvidence.filter((evidence) =>
    isPostTerminalAdmissionLog(
      evidence,
      terminalFailure,
      postTerminalFeasibilityFilter,
      postTerminalAdmissionBatchStartTimeMs,
      STORAGE_CAPACITY_LOG_MSG.ADMISSION_ALLOWED,
    ),
  );
  const postTerminalAdmissionDenied = selectLatestRebalancerHandoffLog(
    logEvidence.filter((evidence) =>
      isPostTerminalAdmissionLog(
        evidence,
        terminalFailure,
        postTerminalFeasibilityFilter,
        postTerminalAdmissionBatchStartTimeMs,
        STORAGE_CAPACITY_LOG_MSG.ADMISSION_DENIED,
      ),
    ),
  );
  const postTerminalBudgetBlock = selectLatestRebalancerHandoffLog(
    logEvidence.filter((evidence) =>
      isPostTerminalBudgetBlockLog(evidence, witness, postTerminalRebalance),
    ),
  );
  const postTerminalBudgetPressure = selectLatestRebalancerHandoffLog(
    logEvidence.filter((evidence) =>
      isPostTerminalBudgetPressureLog(evidence, postTerminalRebalance),
    ),
  );
  const postTerminalLeadershipLoss = selectLatestRebalancerHandoffLog(
    logEvidence.filter((evidence) =>
      isPostTerminalLeadershipLossLog(
        evidence,
        witness,
        postTerminalRebalance,
      ),
    ),
  );
  const postTerminalSiblingLeadershipLoss = selectLatestRebalancerHandoffLog(
    logEvidence.filter((evidence) =>
      isPostTerminalSiblingLeadershipLossLog(
        evidence,
        witness,
        postTerminalRebalance,
      ),
    ),
  );
  const postTerminalSchedulerHandoff = selectLatestRebalancerHandoffLog(
    logEvidence.filter((evidence) =>
      isPostTerminalSchedulerHandoffLog(
        evidence,
        witness,
        postTerminalRebalance,
      ),
    ),
  );
  const postTerminalPersistedOperation = selectLatestReplicaOperationRow(
    readReplicaOperationRowsFromSnapshotStates(snapshotStates)
      .filter((operation) =>
        isPostTerminalPersistedReplicaOperation(
          operation,
          witness,
          postTerminalRebalance,
        ),
      ),
  );
  const handoffEvidence = Object.freeze({
    retainedByWitness,
    terminalFailureObserved,
    postTerminalRebalanceObserved: postTerminalRebalance.timeMs > 0,
    postTerminalSuppressionObserved: postTerminalSuppression.timeMs > 0,
  });
  const followUpState = resolveRebalancerHandoffFollowUpState(handoffEvidence);
  const executionEvidence = Object.freeze({
    followUpState,
    postTerminalRebalanceObserved: postTerminalRebalance.timeMs > 0,
    postTerminalRebalanceMoveCount: postTerminalRebalance.moveCount,
    limitedMoveCount: postTerminalPreExecutionHandoff.limitedMoveCount,
    moveExecutionObserved: postTerminalMoveExecution.timeMs > 0,
    moveBlockedObserved: postTerminalMoveBlocked.timeMs > 0,
    budgetBlockObserved: postTerminalBudgetBlock.timeMs > 0,
    admissionDeniedObserved: postTerminalAdmissionDenied.timeMs > 0,
    leadershipLossObserved: postTerminalLeadershipLoss.timeMs > 0,
    persistedOperationObserved:
      postTerminalPersistedOperation.operationId.length > 0,
  });
  const followUpExecutionState =
    resolveRebalancerFollowUpExecutionState(executionEvidence);
  const moveLimitEvidenceState =
    resolveRebalancerMoveLimitEvidenceState(executionEvidence);
  const executionGapState =
    resolveRebalancerExecutionGapState(executionEvidence);
  return {
    [PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_FIELD.AVAILABILITY]:
      followUpState === PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_STATE
        .MISSING ?
        PUBLICATION_EVIDENCE_REPLAY_AVAILABILITY.MISSING :
        PUBLICATION_EVIDENCE_REPLAY_AVAILABILITY.AVAILABLE,
    [PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_FIELD.FOLLOW_UP_STATE]:
      followUpState,
    [PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_FIELD.PARTITION_ID]:
      witness[PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD.PARTITION_ID],
    [PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_FIELD.OPERATION_ID]:
      witness[PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD.OPERATION_ID],
    [PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_FIELD.RETAINED_BY_WITNESS]:
      retainedByWitness,
    [PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_FIELD
      .RETAINED_NEXT_REQUIRED_ACTION]:
      witness[
        PUBLICATION_EVIDENCE_REPLAY_PRIORITY_WITNESS_FIELD.NEXT_REQUIRED_ACTION
      ],
    [PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_FIELD
      .TERMINAL_FAILURE_OBSERVED]:
      terminalFailureObserved,
    [PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_FIELD
      .TERMINAL_FAILURE_TIME_MS]:
      terminalFailure.timeMs,
    [PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_FIELD
      .POST_TERMINAL_REBALANCE_OBSERVED]:
      postTerminalRebalance.timeMs > 0,
    [PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_FIELD
      .POST_TERMINAL_REBALANCE_TIME_MS]:
      postTerminalRebalance.timeMs,
    [PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_FIELD
      .POST_TERMINAL_REBALANCE_MOVE_COUNT]:
      postTerminalRebalance.moveCount,
    [PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_FIELD
      .POST_TERMINAL_PRE_EXECUTION_HANDOFF_OBSERVED]:
      postTerminalPreExecutionHandoff.timeMs > 0,
    [PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_FIELD
      .POST_TERMINAL_PRE_EXECUTION_HANDOFF_TIME_MS]:
      postTerminalPreExecutionHandoff.timeMs,
    [PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_FIELD
      .POST_TERMINAL_MOVE_LIMIT]:
      postTerminalPreExecutionHandoff.moveLimit,
    [PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_FIELD
      .POST_TERMINAL_LIMITED_MOVE_COUNT]:
      postTerminalPreExecutionHandoff.limitedMoveCount,
    [PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_FIELD
      .POST_TERMINAL_EXECUTABLE_MOVE_COUNT]:
      postTerminalPreExecutionHandoff.executableMoveCount,
    [PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_FIELD
      .POST_TERMINAL_PRE_EXECUTE_SKIPPED_MOVE_COUNT]:
      postTerminalPreExecutionHandoff.preExecuteSkippedMoveCount,
    [PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_FIELD
      .POST_TERMINAL_READINESS_GROUP_COUNT]:
      postTerminalPreExecutionHandoff.readinessGroupCount,
    [PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_FIELD
      .POST_TERMINAL_READY_READINESS_GROUP_COUNT]:
      postTerminalPreExecutionHandoff.readyReadinessGroupCount,
    [PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_FIELD
      .POST_TERMINAL_BLOCKED_READINESS_GROUP_COUNT]:
      postTerminalPreExecutionHandoff.blockedReadinessGroupCount,
    [PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_FIELD
      .POST_TERMINAL_READINESS_GROUPS]:
      postTerminalPreExecutionHandoff.readinessGroups,
    [PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_FIELD
      .POST_TERMINAL_PRE_EXECUTE_SKIP_REASONS]:
      postTerminalPreExecutionHandoff.preExecuteSkipReasons,
    [PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_FIELD
      .POST_TERMINAL_PRE_EXECUTION_HANDOFF_STATE]:
      postTerminalPreExecutionHandoff.preExecutionHandoffState,
    [PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_FIELD
      .POST_TERMINAL_PRE_EXECUTE_RETURN_STATE]:
      postTerminalPreExecutionHandoff.preExecuteReturnState,
    [PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_FIELD
      .POST_TERMINAL_MOVE_LIMIT_EVIDENCE_STATE]:
      moveLimitEvidenceState,
    [PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_FIELD
      .POST_TERMINAL_FOLLOW_UP_EXECUTION_STATE]:
      followUpExecutionState,
    [PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_FIELD
      .POST_TERMINAL_EXECUTION_GAP_STATE]:
      executionGapState,
    [PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_FIELD
      .POST_TERMINAL_FEASIBILITY_FILTER_OBSERVED]:
      postTerminalFeasibilityFilter.timeMs > 0,
    [PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_FIELD
      .POST_TERMINAL_FEASIBLE_CANDIDATE_COUNT]:
      postTerminalFeasibilityFilter.feasibleCount,
    [PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_FIELD
      .POST_TERMINAL_REJECTED_CANDIDATE_COUNT]:
      postTerminalFeasibilityFilter.rejectedCount,
    [PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_FIELD
      .POST_TERMINAL_FEASIBILITY_REJECTED_REASON_CODES]:
      postTerminalFeasibilityFilter.rejectionReasonCodes,
    [PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_FIELD
      .POST_TERMINAL_ADMISSION_ALLOWED_OBSERVED]:
      postTerminalAdmissionAllowed.length > 0,
    [PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_FIELD
      .POST_TERMINAL_ADMISSION_ALLOWED_COUNT]:
      postTerminalAdmissionAllowed.length,
    [PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_FIELD
      .POST_TERMINAL_ADMISSION_DENIED_OBSERVED]:
      postTerminalAdmissionDenied.timeMs > 0,
    [PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_FIELD
      .POST_TERMINAL_BUDGET_BLOCK_OBSERVED]:
      postTerminalBudgetBlock.timeMs > 0,
    [PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_FIELD
      .POST_TERMINAL_BUDGET_PRESSURE_OBSERVED]:
      postTerminalBudgetPressure.timeMs > 0,
    [PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_FIELD
      .POST_TERMINAL_BUDGET_PRESSURE_TIME_MS]:
      postTerminalBudgetPressure.timeMs,
    [PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_FIELD
      .POST_TERMINAL_BUDGET_PRESSURE_QUERY_DURATION_MS]:
      postTerminalBudgetPressure.queryDurationMs,
    [PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_FIELD
      .POST_TERMINAL_BUDGET_PRESSURE_ROW_COUNT]:
      postTerminalBudgetPressure.rowCount,
    [PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_FIELD
      .POST_TERMINAL_LEADERSHIP_LOSS_OBSERVED]:
      postTerminalLeadershipLoss.timeMs > 0,
    [PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_FIELD
      .POST_TERMINAL_LEADERSHIP_LOSS_TIME_MS]:
      postTerminalLeadershipLoss.timeMs,
    [PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_FIELD
      .POST_TERMINAL_SIBLING_LEADERSHIP_LOSS_OBSERVED]:
      postTerminalSiblingLeadershipLoss.timeMs > 0,
    [PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_FIELD
      .POST_TERMINAL_SIBLING_LEADERSHIP_LOSS_TIME_MS]:
      postTerminalSiblingLeadershipLoss.timeMs,
    [PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_FIELD
      .POST_TERMINAL_SCHEDULER_HANDOFF_OBSERVED]:
      postTerminalSchedulerHandoff.timeMs > 0,
    [PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_FIELD
      .POST_TERMINAL_SCHEDULER_HANDOFF_TIME_MS]:
      postTerminalSchedulerHandoff.timeMs,
    [PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_FIELD
      .POST_TERMINAL_MOVE_EXECUTION_OBSERVED]:
      postTerminalMoveExecution.timeMs > 0,
    [PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_FIELD
      .POST_TERMINAL_MOVE_EXECUTION_TIME_MS]:
      postTerminalMoveExecution.timeMs,
    [PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_FIELD
      .POST_TERMINAL_MOVE_BLOCKED_OBSERVED]:
      postTerminalMoveBlocked.timeMs > 0,
    [PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_FIELD
      .POST_TERMINAL_MOVE_BLOCKED_REASON]:
      selectRebalancerMoveBlockedReason(postTerminalMoveBlocked),
    [PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_FIELD
      .POST_TERMINAL_PERSISTED_OPERATION_OBSERVED]:
      postTerminalPersistedOperation.operationId.length > 0,
    [PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_FIELD
      .POST_TERMINAL_PERSISTED_OPERATION_ID]:
      postTerminalPersistedOperation.operationId,
    [PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_FIELD
      .POST_TERMINAL_PERSISTED_OPERATION_CREATED_AT_MS]:
      postTerminalPersistedOperation.createdAtMs,
    [PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_FIELD
      .POST_TERMINAL_SUPPRESSION_OBSERVED]:
      postTerminalSuppression.timeMs > 0,
    [PUBLICATION_EVIDENCE_REPLAY_REBALANCER_HANDOFF_FIELD
      .POST_TERMINAL_SUPPRESSION_REASON]:
      postTerminalSuppression.message,
  };
}

export {
  buildMissingPriorityRecoveryWitness,
  readPriorityRecoveryWitnessCandidates,
  selectSupportingPriorityRecoveryWitness,
  summarizePriorityRecoveryWitness,
  summarizePriorityRecoveryWitnesses,
  summarizeRebalancerFollowUpHandoff,
};
