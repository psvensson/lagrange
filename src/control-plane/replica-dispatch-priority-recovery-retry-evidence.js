import {REPLICA_DISPATCH_SERVICE_SHARED} from './replica-dispatch-service-shared.js';

const {
  COLUMN,
  NUM,
  TYPEOF,
} = REPLICA_DISPATCH_SERVICE_SHARED;

const PRIORITY_RECOVERY_DISPATCH_RETRY_FIELD = Object.freeze({
  ACTIVE_GATE: 'activeGate',
  BLOCKED_PARTITIONS: 'blockedPartitions',
  MISSING_PARTITION_IDS: 'missingPartitionIds',
  OPERATION_ID: 'operationId',
  OPERATION_IDS: 'operationIds',
  PARTITION_ID: 'partitionId',
  PRIORITY_PARTITION_SUMMARY: 'priorityPartitionSummary',
  PRIORITY_RECOVERY_PARTITION_WITNESSES: 'priorityRecoveryPartitionWitnesses',
  PROGRESS: 'progress',
});

const PRIORITY_RECOVERY_DISPATCH_RETRY_EMPTY_TEXT = '';

function normalizePriorityRecoveryDispatchRetryPartitionId(value) {
  if (typeof value !== TYPEOF.STRING) {
    return PRIORITY_RECOVERY_DISPATCH_RETRY_EMPTY_TEXT;
  }
  return value.trim();
}

function normalizePriorityRecoveryDispatchRetryOperationId(value) {
  if (typeof value !== TYPEOF.STRING) {
    return PRIORITY_RECOVERY_DISPATCH_RETRY_EMPTY_TEXT;
  }
  return value.trim();
}

function addPriorityRecoveryDispatchRetryOperationId(operationIds, value) {
  const operationId = normalizePriorityRecoveryDispatchRetryOperationId(value);
  if (operationId.length > NUM.ZERO) {
    operationIds.add(operationId);
  }
}

function addPriorityRecoveryDispatchRetryOperationIds(operationIds, values) {
  if (!Array.isArray(values)) {
    return;
  }
  for (const value of values) {
    addPriorityRecoveryDispatchRetryOperationId(operationIds, value);
  }
}

function getPriorityRecoveryDispatchRetryWitnesses(publicationConvergence) {
  const witnesses = [];
  const topLevelWitnesses = Array.isArray(
    publicationConvergence?.[
      PRIORITY_RECOVERY_DISPATCH_RETRY_FIELD
        .PRIORITY_RECOVERY_PARTITION_WITNESSES
    ],
  ) ?
    publicationConvergence[
      PRIORITY_RECOVERY_DISPATCH_RETRY_FIELD
        .PRIORITY_RECOVERY_PARTITION_WITNESSES
    ] :
    [];
  const activeGateProgressWitnesses = Array.isArray(
    publicationConvergence?.[
      PRIORITY_RECOVERY_DISPATCH_RETRY_FIELD.ACTIVE_GATE
    ]?.[
      PRIORITY_RECOVERY_DISPATCH_RETRY_FIELD.PROGRESS
    ]?.[
      PRIORITY_RECOVERY_DISPATCH_RETRY_FIELD
        .PRIORITY_RECOVERY_PARTITION_WITNESSES
    ],
  ) ?
    publicationConvergence[
      PRIORITY_RECOVERY_DISPATCH_RETRY_FIELD.ACTIVE_GATE
    ][
      PRIORITY_RECOVERY_DISPATCH_RETRY_FIELD.PROGRESS
    ][
      PRIORITY_RECOVERY_DISPATCH_RETRY_FIELD
        .PRIORITY_RECOVERY_PARTITION_WITNESSES
    ] :
    [];
  witnesses.push(...topLevelWitnesses);
  witnesses.push(...activeGateProgressWitnesses);
  return witnesses;
}

export function mergeDispatchRetryRowsByOperationId(
  preferredRows = [],
  fallbackRows = [],
) {
  const rows = [];
  const seenOperationIds = new Set();
  const appendRow = (row) => {
    const operationId = row?.[COLUMN.OPERATION_ID];
    if (
      typeof operationId !== TYPEOF.STRING ||
      operationId.length === NUM.ZERO ||
      seenOperationIds.has(operationId)
    ) {
      return;
    }
    seenOperationIds.add(operationId);
    rows.push(row);
  };
  for (const row of preferredRows) {
    appendRow(row);
  }
  for (const row of fallbackRows) {
    appendRow(row);
  }
  return rows;
}

export function getPriorityRecoveryDispatchRetryBlockedPartitionIds(
  publicationConvergence,
) {
  const priorityPartitionSummary =
    publicationConvergence?.[
      PRIORITY_RECOVERY_DISPATCH_RETRY_FIELD.PRIORITY_PARTITION_SUMMARY
    ];
  if (!priorityPartitionSummary || typeof priorityPartitionSummary !== TYPEOF.OBJECT) {
    return [];
  }
  const partitionIds = new Set();
  const blockedPartitions = Array.isArray(
    priorityPartitionSummary[
      PRIORITY_RECOVERY_DISPATCH_RETRY_FIELD.BLOCKED_PARTITIONS
    ],
  ) ?
    priorityPartitionSummary[
      PRIORITY_RECOVERY_DISPATCH_RETRY_FIELD.BLOCKED_PARTITIONS
    ] :
    [];
  for (const partition of blockedPartitions) {
    const partitionId = normalizePriorityRecoveryDispatchRetryPartitionId(
      partition?.[PRIORITY_RECOVERY_DISPATCH_RETRY_FIELD.PARTITION_ID],
    );
    if (partitionId.length > NUM.ZERO) {
      partitionIds.add(partitionId);
    }
  }
  const missingPartitionIds = Array.isArray(
    priorityPartitionSummary[
      PRIORITY_RECOVERY_DISPATCH_RETRY_FIELD.MISSING_PARTITION_IDS
    ],
  ) ?
    priorityPartitionSummary[
      PRIORITY_RECOVERY_DISPATCH_RETRY_FIELD.MISSING_PARTITION_IDS
    ] :
    [];
  for (const partitionIdValue of missingPartitionIds) {
    const partitionId = normalizePriorityRecoveryDispatchRetryPartitionId(
      partitionIdValue,
    );
    if (partitionId.length > NUM.ZERO) {
      partitionIds.add(partitionId);
    }
  }
  return [...partitionIds];
}

export function getPriorityRecoveryDispatchRetryBlockedOperationIds(
  publicationConvergence,
) {
  const operationIds = new Set();
  for (const witness of getPriorityRecoveryDispatchRetryWitnesses(
    publicationConvergence,
  )) {
    addPriorityRecoveryDispatchRetryOperationId(
      operationIds,
      witness?.[PRIORITY_RECOVERY_DISPATCH_RETRY_FIELD.OPERATION_ID],
    );
    addPriorityRecoveryDispatchRetryOperationIds(
      operationIds,
      witness?.[PRIORITY_RECOVERY_DISPATCH_RETRY_FIELD.OPERATION_IDS],
    );
  }
  return [...operationIds];
}

export function getDispatchRetryRowPartitionIds(dispatchRows = []) {
  const partitionIds = new Set();
  for (const row of dispatchRows) {
    const partitionId = normalizePriorityRecoveryDispatchRetryPartitionId(
      row?.[COLUMN.PARTITION_ID],
    );
    if (partitionId.length > NUM.ZERO) {
      partitionIds.add(partitionId);
    }
  }
  return partitionIds;
}

export function getDispatchRetryRowOperationIds(dispatchRows = []) {
  const operationIds = new Set();
  for (const row of dispatchRows) {
    const operationId = normalizePriorityRecoveryDispatchRetryOperationId(
      row?.[COLUMN.OPERATION_ID] || row?.[PRIORITY_RECOVERY_DISPATCH_RETRY_FIELD.OPERATION_ID],
    );
    if (operationId.length > NUM.ZERO) {
      operationIds.add(operationId);
    }
  }
  return operationIds;
}

export {
  PRIORITY_RECOVERY_DISPATCH_RETRY_FIELD,
  PRIORITY_RECOVERY_DISPATCH_RETRY_EMPTY_TEXT,
};
