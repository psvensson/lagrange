import {
  COLUMN,
  NUM,
  TABLES,
  TYPEOF,
  WORKFLOW_STEP,
} from '../constants/index.js';
import {normalizeControlPlanePublicationRow} from './system-row-normalizers.js';
import {CONTROL_PLANE_PUBLICATION_STATUS} from './control-plane-publication-merge.js';
import {isTerminalPublicationRecoveryStatus} from './publication-recovery-state-machine.js';
import {OperationType} from '../rebalancer/replica-status.js';
import {
  isSystemTablePartition,
} from '../bootstrap/system-partition-classification.js';

const MEMBERSHIP_PUBLICATION_COORDINATOR_LITERAL = Object.freeze({
  EMPTY: '',
  MEMBERSHIP_PUBLICATION: 'membership-publication:',
  EMPTY_2: ':',
  MEMBERSHIP_PUBLICATION_RECONCILE: 'membership-publication-reconcile',
  MEMBERSHIP_PUBLICATION_ACKNOWLEDGEMENT: 'membership-publication-acknowledgement',
  MANUAL: 'manual',
});

const MEMBERSHIP_PUBLICATION_KIND = 'cluster_membership';

const MEMBERSHIP_PUBLICATION_OWNER_KEY = `membership-publication:${MEMBERSHIP_PUBLICATION_KIND}`;

const MEMBERSHIP_PUBLICATION_STATUS = CONTROL_PLANE_PUBLICATION_STATUS;

const MEMBERSHIP_PUBLICATION_READ_PROFILE = Object.freeze({
  ACKNOWLEDGEMENT: 'acknowledgement',
  DIAGNOSTICS: 'diagnostics',
  PLANNING: 'planning',
});

const MEMBERSHIP_PUBLICATION_WORKFLOW_STEP = Object.freeze({
  IDLE: 'IDLE',
  DERIVING: 'DERIVING',
  OPEN: 'OPEN',
});

const MEMBERSHIP_PUBLICATION_PLANNING_EVIDENCE_FIELD = Object.freeze({
  CREATED_AT: 'createdAt',
  ENDPOINT_ID: 'endpointId',
  LAST_HEARTBEAT: 'lastHeartbeat',
  NODE_ID: 'nodeId',
  PARTITION_ID: 'partitionId',
  READY_LEASE_EXPIRES_AT: 'readyLeaseExpiresAt',
  SERVICE_ID: 'serviceId',
  STORAGE_BUDGET_UPDATED_AT: 'storageBudgetUpdatedAt',
  UPDATED_AT: 'updatedAt',
});

const MEMBERSHIP_PUBLICATION_PLANNING_EVIDENCE_KEY_FIELDS_BY_TABLE = Object.freeze({
  [TABLES.NODES]: Object.freeze([
    COLUMN.NODE_ID,
    MEMBERSHIP_PUBLICATION_PLANNING_EVIDENCE_FIELD.NODE_ID,
  ]),
  [TABLES.NODE_ENDPOINTS]: Object.freeze([
    COLUMN.ENDPOINT_ID,
    MEMBERSHIP_PUBLICATION_PLANNING_EVIDENCE_FIELD.ENDPOINT_ID,
  ]),
  [TABLES.PARTITIONS]: Object.freeze([
    COLUMN.PARTITION_ID,
    MEMBERSHIP_PUBLICATION_PLANNING_EVIDENCE_FIELD.PARTITION_ID,
  ]),
  [TABLES.SERVICES]: Object.freeze([
    COLUMN.SERVICE_ID,
    MEMBERSHIP_PUBLICATION_PLANNING_EVIDENCE_FIELD.SERVICE_ID,
  ]),
});

const MEMBERSHIP_PUBLICATION_PLANNING_EVIDENCE_VERSION_FIELDS = Object.freeze([
  COLUMN.UPDATED_AT,
  MEMBERSHIP_PUBLICATION_PLANNING_EVIDENCE_FIELD.UPDATED_AT,
  COLUMN.LAST_HEARTBEAT,
  MEMBERSHIP_PUBLICATION_PLANNING_EVIDENCE_FIELD.LAST_HEARTBEAT,
  COLUMN.STORAGE_BUDGET_UPDATED_AT,
  MEMBERSHIP_PUBLICATION_PLANNING_EVIDENCE_FIELD.STORAGE_BUDGET_UPDATED_AT,
  COLUMN.READY_LEASE_EXPIRES_AT,
  MEMBERSHIP_PUBLICATION_PLANNING_EVIDENCE_FIELD.READY_LEASE_EXPIRES_AT,
  COLUMN.CREATED_AT,
  MEMBERSHIP_PUBLICATION_PLANNING_EVIDENCE_FIELD.CREATED_AT,
]);

const PUBLICATION_WRITE_MAX_ATTEMPTS = 3;

const PUBLICATION_REASON_ACK_TIMEOUT_EXCEEDED = 'ack_timeout_exceeded';

const NO_MEMBERSHIP_PUBLICATION_TARGET_NODE_ID =
  MEMBERSHIP_PUBLICATION_COORDINATOR_LITERAL.EMPTY;

const MEMBERSHIP_PUBLICATION_TARGET_NODE_STATE = Object.freeze({
  AVAILABLE: 'available',
  UNAVAILABLE: 'unavailable',
});

const DISPATCH_RETRY_READY_NODE_PHASE = Object.freeze({
  INITIAL_TARGET_DISPATCH: 'initial_target_dispatch',
  CREATE_TARGET_REARM: 'create_target_rearm',
  ACTIVE_REPLACE_SOURCE_REMOVAL: 'active_replace_source_removal',
  NOT_RETRYABLE: 'not_retryable',
});

const MEMBERSHIP_PUBLICATION_ACK_REFRESH_STATE = Object.freeze({
  CACHE_SUFFICIENT: 'cache_sufficient',
  DURABLE_REQUIRED: 'durable_required',
});

const MEMBERSHIP_PUBLICATION_ACK_REFRESH_REASON = Object.freeze({
  CACHE_PENDING_TARGET_ACK: 'cache_pending_target_ack',
  NODE_ALREADY_ACKNOWLEDGED: 'node_already_acknowledged',
  NODE_NOT_REQUIRED: 'node_not_required',
  TERMINAL_CACHE_ROW: 'terminal_cache_row',
});

const MEMBERSHIP_PUBLICATION_ACK_REFRESH_DECISION_RULES = Object.freeze([
  Object.freeze({
    state: MEMBERSHIP_PUBLICATION_ACK_REFRESH_STATE.DURABLE_REQUIRED,
    reason: MEMBERSHIP_PUBLICATION_ACK_REFRESH_REASON.TERMINAL_CACHE_ROW,
    matches: (evidence) => evidence.terminalPublication === true,
  }),
  Object.freeze({
    state: MEMBERSHIP_PUBLICATION_ACK_REFRESH_STATE.DURABLE_REQUIRED,
    reason: MEMBERSHIP_PUBLICATION_ACK_REFRESH_REASON.NODE_NOT_REQUIRED,
    matches: (evidence) => evidence.nodeRequired !== true,
  }),
  Object.freeze({
    state: MEMBERSHIP_PUBLICATION_ACK_REFRESH_STATE.DURABLE_REQUIRED,
    reason: MEMBERSHIP_PUBLICATION_ACK_REFRESH_REASON.NODE_ALREADY_ACKNOWLEDGED,
    matches: (evidence) => evidence.nodeAlreadyAcknowledged === true,
  }),
  Object.freeze({
    state: MEMBERSHIP_PUBLICATION_ACK_REFRESH_STATE.DURABLE_REQUIRED,
    reason: MEMBERSHIP_PUBLICATION_ACK_REFRESH_REASON.CACHE_PENDING_TARGET_ACK,
    matches: () => true,
  }),
]);

const PUBLICATION_WORKFLOW_REASON = Object.freeze({
  DERIVE_MEMBERSHIP_PUBLICATION: 'derive-membership-publication',
  PERSIST_OPEN_PUBLICATION: 'persist-open-publication',
});

function normalizeNodeIdList(values = []) {
  return [
    ...new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => String(value || MEMBERSHIP_PUBLICATION_COORDINATOR_LITERAL.EMPTY).trim())
        .filter((value) => value.length > NUM.ZERO),
    ),
  ].sort();
}

function normalizeStringList(values = []) {
  return [
    ...new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => String(value || MEMBERSHIP_PUBLICATION_COORDINATOR_LITERAL.EMPTY).trim())
        .filter((value) => value.length > NUM.ZERO),
    ),
  ].sort();
}

function listEquals(left = [], right = []) {
  const normalizedLeft = normalizeNodeIdList(left);
  const normalizedRight = normalizeNodeIdList(right);
  if (normalizedLeft.length !== normalizedRight.length) {
    return false;
  }
  return normalizedLeft.every((value, index) => value === normalizedRight[index]);
}

function normalizePositiveInteger(value, fallback = null) {
  const normalized = Number(value);
  if (Number.isFinite(normalized) && normalized >= NUM.ZERO) {
    return Math.trunc(normalized);
  }
  return fallback;
}

function normalizeMembershipPublicationNodeId(value) {
  return typeof value === TYPEOF.STRING && value.length > NUM.ZERO ?
    value :
    MEMBERSHIP_PUBLICATION_COORDINATOR_LITERAL.EMPTY;
}

function collectMembershipPublicationEvidenceNodeIds(options = {}) {
  return normalizeNodeIdList([
    ...(Array.isArray(options.nodeRows) ?
      options.nodeRows.map((row) => row?.node_id || row?.nodeId) :
      []),
    ...(Array.isArray(options.readinessEntries) ?
      options.readinessEntries.map((entry) => entry?.nodeId || entry?.node_id) :
      []),
    ...(Array.isArray(options.connectedNodeIds) ? options.connectedNodeIds : []),
    ...(Array.isArray(options.latestPublicationRow?.publishedActiveNodeIds) ?
      options.latestPublicationRow.publishedActiveNodeIds :
      []),
    ...(Array.isArray(options.latestPublicationRow?.published_active_node_ids) ?
      options.latestPublicationRow.published_active_node_ids :
      []),
    ...(Array.isArray(
      options.latestPublishedPublicationRow?.publishedActiveNodeIds,
    ) ?
      options.latestPublishedPublicationRow.publishedActiveNodeIds :
      []),
    ...(Array.isArray(
      options.latestPublishedPublicationRow?.published_active_node_ids,
    ) ?
      options.latestPublishedPublicationRow.published_active_node_ids :
      []),
  ]);
}

function buildMembershipPublicationTargetNodeDecision(options = {}) {
  const priorityRecoveryPlanningSnapshot =
    options.priorityRecoveryPlanningSnapshot &&
      typeof options.priorityRecoveryPlanningSnapshot === TYPEOF.OBJECT ?
      options.priorityRecoveryPlanningSnapshot :
      null;
  const explicitTargetNodeId = normalizeMembershipPublicationNodeId(
    options.targetNodeId,
  );
  const planningTargetNodeId = normalizeMembershipPublicationNodeId(
    priorityRecoveryPlanningSnapshot?.targetNodeId,
  );
  const publisherNodeId = normalizeMembershipPublicationNodeId(
    options.publisherNodeId,
  );
  const publisherInEvidence =
    publisherNodeId.length > NUM.ZERO &&
    collectMembershipPublicationEvidenceNodeIds(options).includes(publisherNodeId);
  const targetDecision = [
    {
      matches: explicitTargetNodeId.length > NUM.ZERO,
      nodeId: explicitTargetNodeId,
      state: MEMBERSHIP_PUBLICATION_TARGET_NODE_STATE.AVAILABLE,
    },
    {
      matches: planningTargetNodeId.length > NUM.ZERO,
      nodeId: planningTargetNodeId,
      state: MEMBERSHIP_PUBLICATION_TARGET_NODE_STATE.AVAILABLE,
    },
    {
      matches: publisherInEvidence,
      nodeId: publisherNodeId,
      state: MEMBERSHIP_PUBLICATION_TARGET_NODE_STATE.AVAILABLE,
    },
    {
      matches: true,
      nodeId: NO_MEMBERSHIP_PUBLICATION_TARGET_NODE_ID,
      state: MEMBERSHIP_PUBLICATION_TARGET_NODE_STATE.UNAVAILABLE,
    },
  ].find((entry) => entry.matches === true);
  return Object.freeze({
    nodeId: targetDecision.nodeId,
    state: targetDecision.state,
  });
}

function resolveDispatchRetryNodeIds(operation) {
  const evidence = buildDispatchRetryReadyNodeEvidence(operation);
  const nodeIds = [
    ...evidence.sourceNodeIds,
    ...evidence.ownerNodeIds,
    ...evidence.targetNodeIds,
  ];
  return [...new Set(nodeIds)].filter((nodeId) => {
    return typeof nodeId === TYPEOF.STRING && nodeId.length > NUM.ZERO;
  });
}

function buildDispatchRetryReadyNodeEvidence(operation) {
  if (!operation) {
    return Object.freeze({
      phase: DISPATCH_RETRY_READY_NODE_PHASE.NOT_RETRYABLE,
      sourceNodeIds: Object.freeze([]),
      ownerNodeIds: Object.freeze([]),
      targetNodeIds: Object.freeze([]),
    });
  }
  if (
    operation?.type === OperationType.REPLACE &&
    operation?.workflowStep === WORKFLOW_STEP.ACTIVE
  ) {
    return Object.freeze({
      phase: DISPATCH_RETRY_READY_NODE_PHASE.ACTIVE_REPLACE_SOURCE_REMOVAL,
      sourceNodeIds: Object.freeze([operation.sourceNodeId || null]),
      ownerNodeIds: Object.freeze([operation.targetNodeId || null]),
      targetNodeIds: Object.freeze([]),
    });
  }
  if (
    operation.workflowStep === WORKFLOW_STEP.PENDING ||
    operation.workflowStep === WORKFLOW_STEP.SENDING
  ) {
    return Object.freeze({
      phase: DISPATCH_RETRY_READY_NODE_PHASE.INITIAL_TARGET_DISPATCH,
      sourceNodeIds: Object.freeze([]),
      ownerNodeIds: Object.freeze([]),
      targetNodeIds: Object.freeze([operation.targetNodeId || null]),
    });
  }
  if (isDispatchRetryCreateTargetRearmOperation(operation)) {
    return Object.freeze({
      phase: DISPATCH_RETRY_READY_NODE_PHASE.CREATE_TARGET_REARM,
      sourceNodeIds: Object.freeze([]),
      ownerNodeIds: Object.freeze([]),
      targetNodeIds: Object.freeze([operation.targetNodeId || null]),
    });
  }
  return Object.freeze({
    phase: DISPATCH_RETRY_READY_NODE_PHASE.NOT_RETRYABLE,
    sourceNodeIds: Object.freeze([]),
    ownerNodeIds: Object.freeze([]),
    targetNodeIds: Object.freeze([]),
  });
}

function isDispatchRetryCreateTargetRearmOperation(operation) {
  return (
    isSystemTablePartition({partitionId: operation?.partitionId}) &&
    operation.workflowStep === WORKFLOW_STEP.CREATING &&
    (
      operation.type === OperationType.ADD ||
      operation.type === OperationType.REPLACE
    )
  );
}

function matchesDispatchRetryReadyNode(operation, nodeId) {
  if (typeof nodeId !== TYPEOF.STRING || nodeId.length === NUM.ZERO) {
    return false;
  }
  return resolveDispatchRetryNodeIds(operation).includes(nodeId);
}

function mergeDispatchRetryRowsByOperationId(
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

function isDispatchRetryOperation(operation) {
  if (!operation) {
    return false;
  }
  if (
    operation.workflowStep === WORKFLOW_STEP.PENDING ||
    operation.workflowStep === WORKFLOW_STEP.SENDING
  ) {
    return true;
  }
  if (isDispatchRetryCreateTargetRearmOperation(operation)) {
    return true;
  }
  return (
    operation.type === OperationType.REPLACE &&
    operation.workflowStep === WORKFLOW_STEP.ACTIVE
  );
}

function buildTransitionHistoryEntry({state, reasonCode, at, metadata} = {}) {
  const entry = {
    state: String(state || MEMBERSHIP_PUBLICATION_STATUS.OPEN),
    at: normalizePositiveInteger(at, Date.now()),
  };
  if (typeof reasonCode === TYPEOF.STRING && reasonCode.length > NUM.ZERO) {
    entry.reasonCode = reasonCode;
  }
  if (metadata && typeof metadata === TYPEOF.OBJECT) {
    Object.assign(entry, metadata);
  }
  return entry;
}

function isTerminalMembershipPublicationStatus(publicationStatus) {
  return isTerminalPublicationRecoveryStatus(publicationStatus);
}

function didOptionalSourceVersionChange(previousValue, nextValue) {
  if (nextValue === null || nextValue === undefined) {
    return false;
  }
  return previousValue !== nextValue;
}

function hasPublicationTimedOut(publicationRow, options = {}) {
  const normalizedPublication = normalizeControlPlanePublicationRow(publicationRow);
  const timeoutMs = normalizePositiveInteger(options.timeoutMs, null);
  const nowMs = normalizePositiveInteger(options.nowMs, Date.now());
  const createdAt = normalizePositiveInteger(
    publicationRow?.created_at,
    normalizePositiveInteger(publicationRow?.createdAt, null),
  );
  if (!timeoutMs || !createdAt) {
    return false;
  }
  if (isTerminalMembershipPublicationStatus(normalizedPublication.status)) {
    return false;
  }
  return nowMs - createdAt >= timeoutMs;
}

function abandonMembershipPublication(options = {}) {
  const publicationRow = options.publicationRow || {};
  const nowMs = normalizePositiveInteger(options.nowMs, Date.now());
  const reasonCode =
    typeof options.reasonCode === TYPEOF.STRING && options.reasonCode.length > 0 ?
      options.reasonCode :
      PUBLICATION_REASON_ACK_TIMEOUT_EXCEEDED;
  const existingHistory = Array.isArray(publicationRow.transition_history) ?
    publicationRow.transition_history.slice() :
    normalizeControlPlanePublicationRow(publicationRow).transitionHistory;
  return {
    ...publicationRow,
    status: MEMBERSHIP_PUBLICATION_STATUS.ABANDONED,
    reason_code: reasonCode,
    updated_at: nowMs,
    closed_at: nowMs,
    transition_history: [
      ...existingHistory,
      buildTransitionHistoryEntry({
        state: MEMBERSHIP_PUBLICATION_STATUS.ABANDONED,
        reasonCode,
        at: nowMs,
      }),
    ],
  };
}

function normalizeLatestPublicationRow(row) {
  if (!row || typeof row !== TYPEOF.OBJECT) {
    return null;
  }
  return normalizeControlPlanePublicationRow(row);
}

function resolveAcknowledgementBaselinePublicationRow(options = {}) {
  const latestPublicationRow = normalizeLatestPublicationRow(options.latestPublicationRow);
  const latestPublishedPublicationRow = normalizeLatestPublicationRow(
    options.latestPublishedPublicationRow,
  );
  const latestPublicationStatus = String(
    latestPublicationRow?.status || MEMBERSHIP_PUBLICATION_COORDINATOR_LITERAL.EMPTY,
  ).toUpperCase();
  if (
    latestPublicationStatus === MEMBERSHIP_PUBLICATION_STATUS.ABANDONED ||
    latestPublicationStatus === MEMBERSHIP_PUBLICATION_STATUS.SUPERSEDED
  ) {
    return latestPublishedPublicationRow;
  }
  return latestPublicationRow || latestPublishedPublicationRow;
}

function resolveCarriedAcknowledgedNodeIds(options = {}) {
  const requiredAckNodeIds = normalizeNodeIdList(options.requiredAckNodeIds);
  if (requiredAckNodeIds.length === NUM.ZERO) {
    return [];
  }
  const acknowledgementBaselineRow = resolveAcknowledgementBaselinePublicationRow(options);
  const baselineAcknowledgedNodeIds = normalizeNodeIdList(
    acknowledgementBaselineRow?.acknowledgedNodeIds,
  );
  if (baselineAcknowledgedNodeIds.length === NUM.ZERO) {
    return [];
  }
  return baselineAcknowledgedNodeIds.filter((nodeId) => requiredAckNodeIds.includes(nodeId));
}

function buildMembershipPublicationAckRefreshDecision(options = {}) {
  const normalizedPublication = options.normalizedPublication || {};
  const normalizedNodeId = normalizeMembershipPublicationNodeId(options.nodeId);
  const requiredAckNodeIds = normalizeNodeIdList(
    normalizedPublication.requiredAckNodeIds,
  );
  const acknowledgedNodeIds = normalizeNodeIdList(
    normalizedPublication.acknowledgedNodeIds,
  );
  const terminalPublication = isTerminalMembershipPublicationStatus(
    normalizedPublication.status,
  );
  const nodeRequired = requiredAckNodeIds.includes(normalizedNodeId);
  const nodeAlreadyAcknowledged = acknowledgedNodeIds.includes(
    normalizedNodeId,
  );
  const evidence = Object.freeze({
    terminalPublication,
    nodeRequired,
    nodeAlreadyAcknowledged,
  });
  const decisionRule = MEMBERSHIP_PUBLICATION_ACK_REFRESH_DECISION_RULES.find(
    (rule) => rule.matches(evidence),
  );
  const state = decisionRule.state;
  return Object.freeze({
    state,
    reason: decisionRule.reason,
    reasonCodes: Object.freeze([decisionRule.reason]),
    terminalPublication,
    nodeRequired,
    nodeAlreadyAcknowledged,
    shouldRefresh:
      state === MEMBERSHIP_PUBLICATION_ACK_REFRESH_STATE.DURABLE_REQUIRED,
  });
}

async function safelyGetLatestMembershipPublicationRow(coordinator, options = {}) {
  if (!coordinator || typeof coordinator.getLatestPublicationRow !== TYPEOF.FUNCTION) {
    return null;
  }
  try {
    return await coordinator.getLatestPublicationRow(options);
  } catch (_error) {
    return null;
  }
}

async function readMembershipPublicationConvergence(readinessService, nodeId, observedAt) {
  if (!readinessService || typeof readinessService !== TYPEOF.OBJECT) {
    return null;
  }
  if (typeof readinessService.getMembershipPublicationDiagnosticsSync === TYPEOF.FUNCTION) {
    return readinessService.getMembershipPublicationDiagnosticsSync(nodeId, observedAt);
  }
  if (typeof readinessService.getMembershipPublicationDiagnostics === TYPEOF.FUNCTION) {
    return readinessService.getMembershipPublicationDiagnostics(nodeId, observedAt);
  }
  return null;
}

function publicationRowIncludesNode(publicationRow, nodeId) {
  const normalizedPublication = normalizeLatestPublicationRow(publicationRow);
  const normalizedNodeId = String(nodeId || '').trim();
  if (!normalizedPublication) {
    return false;
  }
  if (!normalizedNodeId) {
    return true;
  }
  const publishedActiveNodeIds = normalizeNodeIdList(normalizedPublication.publishedActiveNodeIds);
  const requiredAckNodeIds = normalizeNodeIdList(normalizedPublication.requiredAckNodeIds);
  const acknowledgedNodeIds = normalizeNodeIdList(normalizedPublication.acknowledgedNodeIds);
  return (
    publishedActiveNodeIds.includes(normalizedNodeId) ||
    requiredAckNodeIds.includes(normalizedNodeId) ||
    acknowledgedNodeIds.includes(normalizedNodeId)
  );
}

export {
  DISPATCH_RETRY_READY_NODE_PHASE,
  MEMBERSHIP_PUBLICATION_ACK_REFRESH_DECISION_RULES,
  MEMBERSHIP_PUBLICATION_ACK_REFRESH_REASON,
  MEMBERSHIP_PUBLICATION_ACK_REFRESH_STATE,
  MEMBERSHIP_PUBLICATION_COORDINATOR_LITERAL,
  MEMBERSHIP_PUBLICATION_KIND,
  MEMBERSHIP_PUBLICATION_OWNER_KEY,
  MEMBERSHIP_PUBLICATION_PLANNING_EVIDENCE_FIELD,
  MEMBERSHIP_PUBLICATION_PLANNING_EVIDENCE_KEY_FIELDS_BY_TABLE,
  MEMBERSHIP_PUBLICATION_PLANNING_EVIDENCE_VERSION_FIELDS,
  MEMBERSHIP_PUBLICATION_READ_PROFILE,
  MEMBERSHIP_PUBLICATION_STATUS,
  MEMBERSHIP_PUBLICATION_TARGET_NODE_STATE,
  MEMBERSHIP_PUBLICATION_WORKFLOW_STEP,
  NO_MEMBERSHIP_PUBLICATION_TARGET_NODE_ID,
  PUBLICATION_REASON_ACK_TIMEOUT_EXCEEDED,
  PUBLICATION_WORKFLOW_REASON,
  PUBLICATION_WRITE_MAX_ATTEMPTS,
  abandonMembershipPublication,
  buildDispatchRetryReadyNodeEvidence,
  buildMembershipPublicationAckRefreshDecision,
  buildMembershipPublicationTargetNodeDecision,
  buildTransitionHistoryEntry,
  collectMembershipPublicationEvidenceNodeIds,
  didOptionalSourceVersionChange,
  hasPublicationTimedOut,
  isDispatchRetryCreateTargetRearmOperation,
  isDispatchRetryOperation,
  isTerminalMembershipPublicationStatus,
  listEquals,
  matchesDispatchRetryReadyNode,
  mergeDispatchRetryRowsByOperationId,
  normalizeLatestPublicationRow,
  normalizeMembershipPublicationNodeId,
  normalizeNodeIdList,
  normalizePositiveInteger,
  normalizeStringList,
  publicationRowIncludesNode,
  readMembershipPublicationConvergence,
  resolveAcknowledgementBaselinePublicationRow,
  resolveCarriedAcknowledgedNodeIds,
  resolveDispatchRetryNodeIds,
  safelyGetLatestMembershipPublicationRow,
};
