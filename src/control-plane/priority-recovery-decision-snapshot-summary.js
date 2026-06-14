import {
  NUM,
  TYPEOF,
} from '../constants/index.js';
import {normalizePriorityRecoveryInteger} from './priority-recovery-helpers.js';
import {
  LOCAL_STR_EMPTY,
  PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD,
} from './priority-recovery-snapshot-contract.js';
import {
  hasPriorityRecoveryDecisionSnapshotOperationEvidence,
  isPriorityRecoverySpreadProgressDecisionSnapshot,
  resolvePriorityRecoveryDecisionSnapshotFreshnessMs,
  resolvePriorityRecoveryDecisionSnapshotProgressFreshnessMs,
} from './priority-recovery-snapshot-eligibility.js';
import {isPriorityRecoveryOperationContextTerminal} from './priority-recovery-snapshot-rebalancer.js';

function resolvePriorityRecoveryDecisionSnapshotSummarySortTimestamp(snapshot) {
  const progressFreshnessMs =
    resolvePriorityRecoveryDecisionSnapshotProgressFreshnessMs(snapshot);
  return progressFreshnessMs > NUM.ZERO ?
    progressFreshnessMs :
    resolvePriorityRecoveryDecisionSnapshotFreshnessMs(snapshot);
}

function resolvePriorityRecoveryDecisionSnapshotSummaryEvidenceRank(snapshot) {
  if (
    isPriorityRecoverySpreadProgressDecisionSnapshot(snapshot) === true &&
    hasPriorityRecoveryDecisionSnapshotOperationEvidence(snapshot) === true
  ) {
    return NUM.TWO;
  }
  const coordinatorOperation =
    snapshot?.[PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.COORDINATOR]?.[
      PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.OPERATION
    ];
  const terminalOperationEvidence =
    coordinatorOperation &&
    typeof coordinatorOperation === TYPEOF.OBJECT &&
    isPriorityRecoveryOperationContextTerminal(coordinatorOperation) === true;
  return (
    hasPriorityRecoveryDecisionSnapshotOperationEvidence(snapshot) === true &&
    terminalOperationEvidence !== true
  ) ?
    NUM.ONE :
    NUM.ZERO;
}

function comparePriorityRecoveryDecisionSnapshotSummarySnapshots(
  left,
  right,
  options = {},
) {
  const leftEpoch = normalizePriorityRecoveryInteger(left?.epoch) ??
    NUM.NEGATIVE_ONE;
  const rightEpoch = normalizePriorityRecoveryInteger(right?.epoch) ??
    NUM.NEGATIVE_ONE;
  if (leftEpoch !== rightEpoch) {
    return leftEpoch - rightEpoch;
  }
  if (options.prioritizeOperationSpreadProgress === true) {
    const leftEvidenceRank =
      resolvePriorityRecoveryDecisionSnapshotSummaryEvidenceRank(left);
    const rightEvidenceRank =
      resolvePriorityRecoveryDecisionSnapshotSummaryEvidenceRank(right);
    if (leftEvidenceRank !== rightEvidenceRank) {
      return leftEvidenceRank - rightEvidenceRank;
    }
  }
  const leftTimestamp =
    resolvePriorityRecoveryDecisionSnapshotSummarySortTimestamp(left);
  const rightTimestamp =
    resolvePriorityRecoveryDecisionSnapshotSummarySortTimestamp(right);
  if (leftTimestamp !== rightTimestamp) {
    return leftTimestamp - rightTimestamp;
  }
  return String(left?.correlationKey || LOCAL_STR_EMPTY).localeCompare(
    String(right?.correlationKey || LOCAL_STR_EMPTY),
  );
}

function selectPriorityRecoveryDecisionSnapshotSummarySnapshots(
  snapshots = [],
  options = {},
) {
  const latestSnapshotByPartitionId = new Map();
  for (const snapshot of Array.isArray(snapshots) ? snapshots : []) {
    const partitionId = String(
      snapshot?.[PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.PARTITION_ID] ||
        LOCAL_STR_EMPTY,
    ).trim();
    if (partitionId.length === NUM.ZERO) {
      continue;
    }
    const currentSnapshot = latestSnapshotByPartitionId.get(partitionId);
    if (
      !currentSnapshot ||
      comparePriorityRecoveryDecisionSnapshotSummarySnapshots(
        currentSnapshot,
        snapshot,
        options,
      ) < NUM.ZERO
    ) {
      latestSnapshotByPartitionId.set(partitionId, snapshot);
    }
  }
  return [...latestSnapshotByPartitionId.values()].sort((left, right) =>
    String(
      left?.[PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.PARTITION_ID] ||
        LOCAL_STR_EMPTY,
    ).localeCompare(
      String(
        right?.[PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.PARTITION_ID] ||
          LOCAL_STR_EMPTY,
      ),
    ),
  );
}

function buildPriorityRecoveryDecisionSnapshotOperationSnapshotsByPartitionId(
  snapshots = [],
) {
  const latestSnapshotByPartitionId = new Map();
  for (const snapshot of Array.isArray(snapshots) ? snapshots : []) {
    const partitionId = String(
      snapshot?.[PRIORITY_RECOVERY_DECISION_SNAPSHOT_FIELD.PARTITION_ID] ||
        LOCAL_STR_EMPTY,
    ).trim();
    const operationId = String(
      snapshot?.operationId || LOCAL_STR_EMPTY,
    ).trim();
    if (
      partitionId.length === NUM.ZERO ||
      operationId.length === NUM.ZERO
    ) {
      continue;
    }
    const snapshotByOperationId =
      latestSnapshotByPartitionId.get(partitionId) || new Map();
    const currentSnapshot = snapshotByOperationId.get(operationId);
    if (
      !currentSnapshot ||
      comparePriorityRecoveryDecisionSnapshotSummarySnapshots(
        currentSnapshot,
        snapshot,
      ) < NUM.ZERO
    ) {
      snapshotByOperationId.set(operationId, snapshot);
    }
    if (!latestSnapshotByPartitionId.has(partitionId)) {
      latestSnapshotByPartitionId.set(partitionId, snapshotByOperationId);
    }
  }
  return latestSnapshotByPartitionId;
}

export {
  buildPriorityRecoveryDecisionSnapshotOperationSnapshotsByPartitionId,
  comparePriorityRecoveryDecisionSnapshotSummarySnapshots,
  resolvePriorityRecoveryDecisionSnapshotSummarySortTimestamp,
  selectPriorityRecoveryDecisionSnapshotSummarySnapshots,
};
