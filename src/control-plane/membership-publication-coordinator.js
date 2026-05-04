import {createHash} from 'node:crypto';
import {v4 as uuidv4} from 'uuid';
import {
  COLUMN,
  NUM,
  TABLES,
  TYPEOF,
  WORKFLOW_STEP,
} from '../constants/index.js';
import {AuthoritativeControlPlaneView} from './authoritative-control-plane-view.js';
import {CONTROL_PLANE_AUTHORITATIVE_READ_MODE} from './control-plane-system-table-gateway.js';
import {MEMBERSHIP_PUBLICATION_PLANNING_SOURCE} from './control-plane-readiness-service.js';
import {resolveActiveNodeViews} from './active-node-projection.js';
import {
  buildMembershipLifecycleSummary,
  MEMBERSHIP_MEMBER_STATE,
  MEMBERSHIP_LIFECYCLE_STATE,
} from './membership-lifecycle-constants.js';
import {
  normalizeControlPlanePublicationRow,
  serializeControlPlanePublicationRow,
} from './system-row-normalizers.js';
import {
  CONTROL_PLANE_PUBLICATION_STATUS,
  mergeControlPlanePublicationRows,
  publicationRowSatisfiesDesiredState,
} from './control-plane-publication-merge.js';
import {
  PUBLICATION_RECOVERY_MACHINE_ACTION,
  PUBLICATION_RECOVERY_MACHINE_CONTEXT,
  evaluatePublicationRecoveryMachine,
  isTerminalPublicationRecoveryStatus,
} from './publication-recovery-state-machine.js';
import {shouldUseAuthoritativePriorityRecoveryRediscovery} from './priority-recovery-snapshot.js';
import {
  buildPublicationMetadataRefreshRow as buildPublicationMetadataRefreshRowCore,
  deriveMembershipPublicationCandidate as deriveMembershipPublicationCandidateCore,
  shouldPreferAuthoritativeMembershipState as shouldPreferAuthoritativeMembershipStateCore,
} from './membership-publication-planning.js';
import {DurableWorkflowCoordinator} from '../workflow/durable-workflow-coordinator.js';
import {OwnerKeyReconcileQueue} from '../workflow/owner-key-reconcile-queue.js';
import {OperationLane} from '../workflow/operation-lane.js';
import {
  OperationType,
  isCoordinatorOwnedOperationType,
} from '../rebalancer/replica-status.js';
import {
  REPLICA_OPERATION_VISIBILITY_READ_MODE,
} from '../rebalancer/replica-operation-repository.js';
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
    state: MEMBERSHIP_PUBLICATION_ACK_REFRESH_STATE.CACHE_SUFFICIENT,
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
function normalizeTableRowsResult(result) {
  if (Array.isArray(result)) {
    return result;
  }
  if (Array.isArray(result?.rows)) {
    return result.rows;
  }
  return [];
}
function resolvePlanningEvidenceRowKey(tableName, row = {}) {
  const keyFields =
    MEMBERSHIP_PUBLICATION_PLANNING_EVIDENCE_KEY_FIELDS_BY_TABLE[tableName] || [];
  for (const keyField of keyFields) {
    const key = String(
      row?.[keyField] || MEMBERSHIP_PUBLICATION_COORDINATOR_LITERAL.EMPTY,
    ).trim();
    if (key.length > NUM.ZERO) {
      return key;
    }
  }
  return MEMBERSHIP_PUBLICATION_COORDINATOR_LITERAL.EMPTY;
}
function resolvePlanningEvidenceRowVersion(row = {}) {
  const versions = MEMBERSHIP_PUBLICATION_PLANNING_EVIDENCE_VERSION_FIELDS
    .map((fieldName) => normalizePositiveInteger(row?.[fieldName], NUM.ZERO))
    .filter((value) => value > NUM.ZERO);
  if (versions.length === NUM.ZERO) {
    return NUM.ZERO;
  }
  return Math.max(...versions);
}
function countPlanningEvidenceRowFields(row = {}) {
  if (!row || typeof row !== TYPEOF.OBJECT) {
    return NUM.ZERO;
  }
  return Object.keys(row).length;
}
function comparePlanningEvidenceRows(leftRow = {}, rightRow = {}) {
  const leftRank = {
    version: resolvePlanningEvidenceRowVersion(leftRow),
    fieldCount: countPlanningEvidenceRowFields(leftRow),
  };
  const rightRank = {
    version: resolvePlanningEvidenceRowVersion(rightRow),
    fieldCount: countPlanningEvidenceRowFields(rightRow),
  };
  const decisiveDelta = [
    rightRank.version - leftRank.version,
    rightRank.fieldCount - leftRank.fieldCount,
  ].find((delta) => delta !== NUM.ZERO);
  return typeof decisiveDelta === TYPEOF.NUMBER ? decisiveDelta : NUM.ZERO;
}
function mergePlanningEvidenceRows(tableName, authoritativeRows = [], projectionRows = []) {
  const keyFields =
    MEMBERSHIP_PUBLICATION_PLANNING_EVIDENCE_KEY_FIELDS_BY_TABLE[tableName] || [];
  if (keyFields.length === NUM.ZERO) {
    return authoritativeRows;
  }
  const rowByKey = new Map();
  const unkeyedRows = [];
  for (const row of [
    ...normalizeTableRowsResult(authoritativeRows),
    ...normalizeTableRowsResult(projectionRows),
  ]) {
    const key = resolvePlanningEvidenceRowKey(tableName, row);
    if (key.length === NUM.ZERO) {
      unkeyedRows.push(row);
      continue;
    }
    const existingRow = rowByKey.get(key);
    if (!existingRow || comparePlanningEvidenceRows(existingRow, row) >= NUM.ZERO) {
      rowByKey.set(key, row);
    }
  }
  return [
    ...[...rowByKey.entries()]
      .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
      .map(([, row]) => row),
    ...unkeyedRows,
  ];
}
function shouldMergePlanningEvidenceRows(tableName, options = {}) {
  return (
    resolveMembershipPublicationReadProfile(options.readProfile) ===
      MEMBERSHIP_PUBLICATION_READ_PROFILE.PLANNING &&
    Object.hasOwn(MEMBERSHIP_PUBLICATION_PLANNING_EVIDENCE_KEY_FIELDS_BY_TABLE, tableName)
  );
}
function resolveControlPlanePublicationsOwner(options = {}) {
  if (options.controlPlanePublicationsOwner) {
    return options.controlPlanePublicationsOwner;
  }
  const membershipPublicationRuntimeOwner = options.membershipPublicationRuntimeOwner || null;
  if (
    membershipPublicationRuntimeOwner &&
    typeof membershipPublicationRuntimeOwner.getControlPlanePublicationsOwner === TYPEOF.FUNCTION
  ) {
    return membershipPublicationRuntimeOwner.getControlPlanePublicationsOwner() || null;
  }
  return null;
}
function resolveMembershipPublicationReadProfile(readProfile = null) {
  return readProfile === MEMBERSHIP_PUBLICATION_READ_PROFILE.DIAGNOSTICS ?
    MEMBERSHIP_PUBLICATION_READ_PROFILE.DIAGNOSTICS :
    MEMBERSHIP_PUBLICATION_READ_PROFILE.PLANNING;
}
function normalizeReplicaOperationView(operation) {
  if (!operation || typeof operation !== TYPEOF.OBJECT) {
    return null;
  }
  const stepsHistory = Array.isArray(operation.stepsHistory) ?
    operation.stepsHistory :
    Array.isArray(operation.steps_history) ?
      operation.steps_history :
      [];
  return {
    operationId: operation.operationId || operation.operation_id || null,
    type: operation.type || null,
    partitionId: operation.partitionId || operation.partition_id || null,
    replicaId: operation.replicaId || operation.replica_id || null,
    sourceNodeId: operation.sourceNodeId || operation.source_node_id || null,
    targetNodeId: operation.targetNodeId || operation.target_node_id || null,
    status: operation.status || null,
    workflowStep: operation.workflowStep || operation.workflow_step || null,
    createdAt: operation.createdAt || operation.created_at,
    updatedAt: operation.updatedAt || operation.updated_at,
    completedAt: operation.completedAt || operation.completed_at,
    errorMessage: operation.errorMessage || operation.error_message || null,
    stepsHistory,
    entityType: operation.entityType || operation.entity_type || null,
    entityId: operation.entityId || operation.entity_id || null,
  };
}
const mergePublicationRows = mergeControlPlanePublicationRows;
function buildPublicationReadOptions(options = {}) {
  const readProfile = resolveMembershipPublicationReadProfile(options.readProfile);
  return {
    ...options,
    preferAuthoritativeRead: true,
    authoritativeReadMode:
      readProfile === MEMBERSHIP_PUBLICATION_READ_PROFILE.DIAGNOSTICS ?
        CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED :
        CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_PREFERRED,
    readProfile,
  };
}
function buildPublicationListReadOptions(options = {}) {
  return {
    ...buildPublicationReadOptions(options),
    authoritativeReadMode: CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_LOCAL_ONLY,
  };
}
function resolveMembershipEvidenceAuthoritativeReadMode(options = {}) {
  return options.preferAuthoritativeRead === true ||
    options.requireAuthoritative === true ?
    CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_PREFERRED :
    CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_LOCAL_ONLY;
}
function buildLocalAuthoritativeMembershipReadOptions(options = {}) {
  return {
    ...options,
    authoritativeReadMode:
      resolveMembershipEvidenceAuthoritativeReadMode(options),
  };
}
function buildMembershipPublicationEvidenceSnapshot(options = {}) {
  const priorityRecoveryPlanningSnapshot =
    options.priorityRecoveryPlanningSnapshot &&
      typeof options.priorityRecoveryPlanningSnapshot === TYPEOF.OBJECT ?
      options.priorityRecoveryPlanningSnapshot :
      null;
  const targetNodeDecision = buildMembershipPublicationTargetNodeDecision({
    ...options,
    priorityRecoveryPlanningSnapshot,
  });
  return Object.freeze({
    latestPublicationRow: options.latestPublicationRow || null,
    latestPublishedPublicationRow: options.latestPublishedPublicationRow || null,
    nodeRows: Array.isArray(options.nodeRows) ? options.nodeRows : [],
    nodeEndpointRows: Array.isArray(options.nodeEndpointRows) ? options.nodeEndpointRows : [],
    serviceRows: Array.isArray(options.serviceRows) ? options.serviceRows : [],
    partitionRows: Array.isArray(options.partitionRows) ? options.partitionRows : [],
    replicaOperationRows:
      Array.isArray(options.replicaOperationRows) ? options.replicaOperationRows : [],
    readinessByNodeId:
      options.readinessByNodeId && typeof options.readinessByNodeId === TYPEOF.OBJECT ?
        options.readinessByNodeId :
        null,
    readinessEntries: Array.isArray(options.readinessEntries) ? options.readinessEntries : [],
    recoveryEpochsByNodeId:
      options.recoveryEpochsByNodeId && typeof options.recoveryEpochsByNodeId === TYPEOF.OBJECT ?
        options.recoveryEpochsByNodeId :
        null,
    connectedNodeIds: normalizeNodeIdList(options.connectedNodeIds),
    publishedActiveNodeIds: Array.isArray(options.publishedActiveNodeIds) ?
      options.publishedActiveNodeIds :
      null,
    requiredAckNodeIds: Array.isArray(options.requiredAckNodeIds) ?
      options.requiredAckNodeIds :
      null,
    acknowledgedNodeIds: normalizeNodeIdList(options.acknowledgedNodeIds),
    sourceTopologyEpoch: options.sourceTopologyEpoch,
    sourceSnapshotVersion: options.sourceSnapshotVersion,
    priorityPartitionSummary:
      options.priorityPartitionSummary &&
      typeof options.priorityPartitionSummary === TYPEOF.OBJECT ?
        options.priorityPartitionSummary :
        null,
    priorityRecoveryPlanningSnapshot,
    membershipLifecycleSummary:
      options.membershipLifecycleSummary &&
      typeof options.membershipLifecycleSummary === TYPEOF.OBJECT ?
        options.membershipLifecycleSummary :
        null,
    targetNodeId: targetNodeDecision.nodeId,
    targetNodeState: targetNodeDecision.state,
    admissionState:
      typeof options.admissionState === TYPEOF.STRING &&
        options.admissionState.length > NUM.ZERO ?
        options.admissionState :
        typeof priorityRecoveryPlanningSnapshot?.admissionState === TYPEOF.STRING &&
          priorityRecoveryPlanningSnapshot.admissionState.length > NUM.ZERO ?
          priorityRecoveryPlanningSnapshot.admissionState :
          null,
    admissionReasonCodes: Array.isArray(options.admissionReasonCodes) ?
      options.admissionReasonCodes :
      Array.isArray(priorityRecoveryPlanningSnapshot?.admissionReasonCodes) ?
        priorityRecoveryPlanningSnapshot.admissionReasonCodes :
        [],
    clusterIncarnationFence:
      options.clusterIncarnationFence &&
        typeof options.clusterIncarnationFence === TYPEOF.OBJECT ?
        options.clusterIncarnationFence :
        priorityRecoveryPlanningSnapshot?.clusterIncarnationFence &&
          typeof priorityRecoveryPlanningSnapshot.clusterIncarnationFence === TYPEOF.OBJECT ?
          priorityRecoveryPlanningSnapshot.clusterIncarnationFence :
          null,
    publisherNodeId: String(
      options.publisherNodeId || MEMBERSHIP_PUBLICATION_COORDINATOR_LITERAL.EMPTY,
    ),
    localNodeId: String(options.localNodeId || MEMBERSHIP_PUBLICATION_COORDINATOR_LITERAL.EMPTY),
    localNodeResponsive: options.localNodeResponsive === true,
    reasonCode:
      typeof options.reasonCode === TYPEOF.STRING && options.reasonCode.length > NUM.ZERO ?
        options.reasonCode :
        null,
    nowMs: normalizePositiveInteger(options.nowMs, Date.now()),
  });
}
function resolveObservedActiveNodeIds(options = {}) {
  const publishedBaselineNodeIds = normalizeNodeIdList(options.publishedBaselineNodeIds);
  const latestPublicationRow = normalizeLatestPublicationRow(options.latestPublicationRow);
  const latestPublishedPublicationRow = normalizeLatestPublicationRow(
    options.latestPublishedPublicationRow,
  );
  const observedPublishedMembershipRow =
    publishedBaselineNodeIds.length > NUM.ZERO ?
      {
        publication_epoch:
            latestPublishedPublicationRow?.publicationEpoch ??
            latestPublicationRow?.publicationEpoch ??
            NUM.ONE,
        status: MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED,
        published_active_node_ids: publishedBaselineNodeIds,
      } :
      latestPublishedPublicationRow;
  const activeNodeViews = resolveActiveNodeViews({
    ...options,
    latestPublicationRow: observedPublishedMembershipRow,
    publicationRows: observedPublishedMembershipRow ? [observedPublishedMembershipRow] : [],
    requirePublishedMembership: false,
  });
  return [...activeNodeViews.projectedActiveNodeIds];
}
function buildLatestRecoveryEpochByNodeId(recoveryEpochsByNodeId = {}) {
  const entries = {};
  if (!recoveryEpochsByNodeId || typeof recoveryEpochsByNodeId !== TYPEOF.OBJECT) {
    return entries;
  }
  for (const [nodeId, history] of Object.entries(recoveryEpochsByNodeId)) {
    const epochs = Array.isArray(history) ? history : [];
    const latestEpoch = epochs[epochs.length - 1] || null;
    if (!latestEpoch || typeof latestEpoch !== TYPEOF.OBJECT) {
      continue;
    }
    const epochId = String(latestEpoch.epochId || '').trim();
    if (!epochId) {
      continue;
    }
    entries[nodeId] = {
      epochId,
      open: latestEpoch.open === true,
    };
  }
  return entries;
}
const MEMBERSHIP_PUBLICATION_PLANNING_HELPERS = Object.freeze({
  buildLatestRecoveryEpochByNodeId,
  buildMembershipPublicationEvidenceSnapshot,
  didOptionalSourceVersionChange,
  listEquals,
  normalizeLatestPublicationRow,
  normalizeNodeIdList,
  normalizePositiveInteger,
  normalizeStringList,
  publicationKind: MEMBERSHIP_PUBLICATION_KIND,
  resolveCarriedAcknowledgedNodeIds,
  resolveObservedActiveNodeIds,
});
function buildPublicationMetadataRefreshRow(options = {}) {
  const refreshedRow = buildPublicationMetadataRefreshRowCore(
    options,
    MEMBERSHIP_PUBLICATION_PLANNING_HELPERS,
  );
  return closeAcknowledgedMetadataRefreshRow({
    publicationRow: refreshedRow,
    nowMs: options.nowMs,
  });
}
function deriveMembershipPublicationCandidate(options = {}) {
  return deriveMembershipPublicationCandidateCore(
    options,
    MEMBERSHIP_PUBLICATION_PLANNING_HELPERS,
  );
}
function shouldPreferAuthoritativeMembershipState(options = {}) {
  return shouldPreferAuthoritativeMembershipStateCore(
    options,
    MEMBERSHIP_PUBLICATION_PLANNING_HELPERS,
  );
}
function buildServingMemberStatesByNodeId(existingStates = {}, publishedNodeIds = []) {
  const normalizedPublishedNodeIds = normalizeNodeIdList(publishedNodeIds);
  const normalizedExistingStates =
    existingStates && typeof existingStates === TYPEOF.OBJECT ? existingStates : {};
  const memberStatesByNodeId = Object.keys(normalizedExistingStates).reduce(
    (accumulator, nodeId) => {
      accumulator[nodeId] =
        normalizedPublishedNodeIds.includes(nodeId) ?
          MEMBERSHIP_MEMBER_STATE.SERVING :
          normalizedExistingStates[nodeId];
      return accumulator;
    },
    {},
  );
  normalizedPublishedNodeIds.forEach((nodeId) => {
    if (!memberStatesByNodeId[nodeId]) {
      memberStatesByNodeId[nodeId] = MEMBERSHIP_MEMBER_STATE.SERVING;
    }
  });
  return memberStatesByNodeId;
}
function deriveMembershipPublicationId(candidate = {}) {
  const fingerprint = JSON.stringify({
    publicationKind: String(candidate.publicationKind || MEMBERSHIP_PUBLICATION_KIND),
    publicationEpoch: normalizePositiveInteger(candidate.publicationEpoch, 1),
    sourceTopologyEpoch: normalizePositiveInteger(candidate.sourceTopologyEpoch, null),
    sourceSnapshotVersion: normalizePositiveInteger(candidate.sourceSnapshotVersion, null),
    publishedActiveNodeIds: normalizeNodeIdList(candidate.publishedActiveNodeIds),
    requiredAckNodeIds: normalizeNodeIdList(candidate.requiredAckNodeIds),
  });
  const digest = createHash('sha256').update(fingerprint).digest('hex').slice(0, 24);
  return (
    MEMBERSHIP_PUBLICATION_COORDINATOR_LITERAL.MEMBERSHIP_PUBLICATION +
    normalizePositiveInteger(candidate.publicationEpoch, NUM.ONE) +
    MEMBERSHIP_PUBLICATION_COORDINATOR_LITERAL.EMPTY_2 +
    digest
  );
}
function buildMembershipPublicationRow(options = {}) {
  const candidate = options.candidate || {};
  const nowMs = normalizePositiveInteger(options.nowMs, Date.now());
  const status = String(
    options.status ||
      candidate.publicationStatus ||
      MEMBERSHIP_PUBLICATION_STATUS.OPEN,
  ).toUpperCase();
  const transitionHistory = Array.isArray(options.transitionHistory) ?
    options.transitionHistory.slice() :
    [
      buildTransitionHistoryEntry({
        state: status,
        reasonCode: candidate.reasonCode,
        at: nowMs,
      }),
    ];
  return {
    publication_id: String(
      options.publicationId || deriveMembershipPublicationId(candidate) || uuidv4(),
    ),
    publication_kind: String(candidate.publicationKind || MEMBERSHIP_PUBLICATION_KIND),
    publication_epoch: normalizePositiveInteger(candidate.publicationEpoch, NUM.ONE),
    publisher_node_id: String(
      candidate.publisherNodeId || MEMBERSHIP_PUBLICATION_COORDINATOR_LITERAL.EMPTY,
    ),
    source_topology_epoch: normalizePositiveInteger(candidate.sourceTopologyEpoch, null),
    source_snapshot_version: normalizePositiveInteger(candidate.sourceSnapshotVersion, null),
    published_active_node_ids: normalizeNodeIdList(candidate.publishedActiveNodeIds),
    required_ack_node_ids: normalizeNodeIdList(candidate.requiredAckNodeIds),
    acknowledged_node_ids: normalizeNodeIdList(candidate.acknowledgedNodeIds),
    priority_partition_summary:
      candidate.priorityPartitionSummary &&
      typeof candidate.priorityPartitionSummary === TYPEOF.OBJECT ?
        candidate.priorityPartitionSummary :
        null,
    membership_lifecycle_summary:
      candidate.membershipLifecycleSummary &&
      typeof candidate.membershipLifecycleSummary === TYPEOF.OBJECT ?
        candidate.membershipLifecycleSummary :
        buildMembershipLifecycleSummary({
          lifecycleState:
            status === MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED ?
              MEMBERSHIP_LIFECYCLE_STATE.PUBLISHED_ACTIVE :
              MEMBERSHIP_LIFECYCLE_STATE.PUBLISH_PENDING,
          publishedActiveNodeIds: candidate.publishedActiveNodeIds,
        }),
    status,
    reason_code: String(candidate.reasonCode || MEMBERSHIP_PUBLICATION_COORDINATOR_LITERAL.EMPTY),
    created_at: nowMs,
    updated_at: nowMs,
    published_at: status === MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED ? nowMs : null,
    closed_at: status === MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED ? nowMs : null,
    transition_history: transitionHistory,
  };
}
function serializeMembershipPublicationRow(publicationRow = {}) {
  return serializeControlPlanePublicationRow(publicationRow);
}
function buildMembershipPublicationAcknowledgementDecision(options = {}) {
  const normalizedPublication = options.normalizedPublication || {};
  const acknowledgedNodeIds = normalizeNodeIdList(options.acknowledgedNodeIds);
  const acknowledgementChanged =
    !listEquals(
      acknowledgedNodeIds,
      normalizedPublication.acknowledgedNodeIds,
    );
  const machineDecision = evaluatePublicationRecoveryMachine({
    context: PUBLICATION_RECOVERY_MACHINE_CONTEXT.ACK_WRITE,
    status: normalizedPublication.status,
    requiredAckNodeIds: normalizedPublication.requiredAckNodeIds,
    acknowledgedNodeIds,
    acknowledgementChanged,
  });
  return Object.freeze({
    state: machineDecision.action,
    action: machineDecision.action,
    nextStatus: machineDecision.nextStatus,
    reasonCode: machineDecision.reasonCode,
    acknowledgementChanged,
    allAcknowledged:
      machineDecision.evidence.requiredAckCount > NUM.ZERO &&
      machineDecision.evidence.pendingAckCount === NUM.ZERO,
    machineDecision,
  });
}
function buildPublicationMetadataRefreshDecision(options = {}) {
  const normalizedPublication = normalizeControlPlanePublicationRow(options.publicationRow);
  const machineDecision = evaluatePublicationRecoveryMachine({
    context: PUBLICATION_RECOVERY_MACHINE_CONTEXT.METADATA_REFRESH,
    status: normalizedPublication.status,
    requiredAckNodeIds: normalizedPublication.requiredAckNodeIds,
    acknowledgedNodeIds: normalizedPublication.acknowledgedNodeIds,
  });
  return Object.freeze({
    state: machineDecision.action,
    action: machineDecision.action,
    nextStatus: machineDecision.nextStatus,
    reasonCode: machineDecision.reasonCode,
    allRequiredAcknowledged:
      machineDecision.evidence.requiredAckCount > NUM.ZERO &&
      machineDecision.evidence.pendingAckCount === NUM.ZERO,
    terminalPublication: machineDecision.evidence.terminalPublication,
    shouldClose:
      machineDecision.action ===
        PUBLICATION_RECOVERY_MACHINE_ACTION.CLOSE_ACK_COMPLETE,
    machineDecision,
  });
}
function closeAcknowledgedMetadataRefreshRow(options = {}) {
  const publicationRow = options.publicationRow;
  if (!publicationRow || typeof publicationRow !== TYPEOF.OBJECT) {
    return publicationRow;
  }
  const closureDecision = buildPublicationMetadataRefreshDecision({
    publicationRow,
  });
  if (closureDecision.shouldClose !== true) {
    return publicationRow;
  }
  const normalizedPublication = normalizeControlPlanePublicationRow(publicationRow);
  const nowMs = normalizePositiveInteger(options.nowMs, Date.now());
  const existingHistory = Array.isArray(publicationRow.transition_history) ?
    publicationRow.transition_history :
    normalizedPublication.transitionHistory;
  const publishedNodeIdsForState =
    normalizedPublication.publishedActiveNodeIds.length > NUM.ZERO ?
      normalizedPublication.publishedActiveNodeIds :
      normalizedPublication.requiredAckNodeIds;
  const membershipLifecycleSummary = buildMembershipLifecycleSummary({
    lifecycleState: MEMBERSHIP_LIFECYCLE_STATE.PUBLISHED_ACTIVE,
    publishedActiveNodeIds: normalizedPublication.publishedActiveNodeIds,
    projectedServingNodeIds:
      normalizedPublication.membershipLifecycleSummary?.projectedServingNodeIds,
    locallyEligibleNodeIds:
      normalizedPublication.membershipLifecycleSummary?.locallyEligibleNodeIds,
    suspectedOrTransitioningNodeIds:
      normalizedPublication.membershipLifecycleSummary?.suspectedOrTransitioningNodeIds,
    memberStatesByNodeId: buildServingMemberStatesByNodeId(
      normalizedPublication.membershipLifecycleSummary?.memberStatesByNodeId,
      publishedNodeIdsForState,
    ),
    recoveryEpochByNodeId:
      normalizedPublication.membershipLifecycleSummary?.recoveryEpochByNodeId,
    membershipFreeze: normalizedPublication.membershipLifecycleSummary?.membershipFreeze,
    projectionDiagnostics:
      normalizedPublication.membershipLifecycleSummary?.projectionDiagnostics,
  });
  return {
    ...publicationRow,
    status: closureDecision.nextStatus,
    updated_at: nowMs,
    published_at: publicationRow.published_at || nowMs,
    closed_at: publicationRow.closed_at || nowMs,
    membership_lifecycle_summary: membershipLifecycleSummary,
    membershipLifecycleSummary,
    transition_history: [
      ...existingHistory,
      buildTransitionHistoryEntry({
        state: closureDecision.nextStatus,
        reasonCode: closureDecision.reasonCode,
        at: nowMs,
      }),
    ],
  };
}
function acknowledgeMembershipPublication(options = {}) {
  const publicationRow = options.publicationRow || {};
  const normalizedPublication = normalizeControlPlanePublicationRow(publicationRow);
  const nodeId = String(options.nodeId || '').trim();
  const nowMs = normalizePositiveInteger(options.nowMs, Date.now());
  const requiredAckNodeIds = normalizedPublication.requiredAckNodeIds;
  if (nodeId && !requiredAckNodeIds.includes(nodeId)) {
    return {
      ...publicationRow,
      acknowledged_node_ids: normalizedPublication.acknowledgedNodeIds,
      updated_at: nowMs,
      transition_history: [
        ...(Array.isArray(publicationRow.transition_history) ?
          publicationRow.transition_history :
          normalizedPublication.transitionHistory),
      ],
    };
  }
  if (hasPublicationTimedOut(publicationRow, options)) {
    return abandonMembershipPublication({
      publicationRow,
      nowMs,
      reasonCode: options.timeoutReasonCode,
    });
  }
  const acknowledgedNodeIds = normalizeNodeIdList([
    ...normalizedPublication.acknowledgedNodeIds,
    nodeId,
  ]);
  const acknowledgementDecision =
    buildMembershipPublicationAcknowledgementDecision({
      normalizedPublication,
      acknowledgedNodeIds,
    });
  if (
    acknowledgementDecision.action ===
    PUBLICATION_RECOVERY_MACHINE_ACTION.PRESERVE_STATUS
  ) {
    return {
      ...publicationRow,
      acknowledged_node_ids: acknowledgedNodeIds,
      updated_at: nowMs,
      transition_history: [
        ...(Array.isArray(publicationRow.transition_history) ?
          publicationRow.transition_history :
          normalizedPublication.transitionHistory),
      ],
    };
  }
  const allAcknowledged = acknowledgementDecision.allAcknowledged;
  const nextStatus = acknowledgementDecision.nextStatus;
  const transitionHistory = [
    ...(Array.isArray(publicationRow.transition_history) ?
      publicationRow.transition_history :
      normalizedPublication.transitionHistory),
    buildTransitionHistoryEntry({
      state: nextStatus,
      reasonCode: acknowledgementDecision.reasonCode,
      at: nowMs,
      metadata: {
        nodeId,
      },
    }),
  ];
  const nextLifecycleState = allAcknowledged ?
    MEMBERSHIP_LIFECYCLE_STATE.PUBLISHED_ACTIVE :
    MEMBERSHIP_LIFECYCLE_STATE.PUBLISH_PENDING;
  const publishedNodeIdsForState =
    normalizedPublication.publishedActiveNodeIds.length > 0 ?
      normalizedPublication.publishedActiveNodeIds :
      normalizedPublication.requiredAckNodeIds;
  return {
    ...publicationRow,
    acknowledged_node_ids: acknowledgedNodeIds,
    status: nextStatus,
    updated_at: nowMs,
    published_at: allAcknowledged ? nowMs : publicationRow.published_at || null,
    closed_at: allAcknowledged ? nowMs : publicationRow.closed_at || null,
    membership_lifecycle_summary: buildMembershipLifecycleSummary({
      lifecycleState: nextLifecycleState,
      publishedActiveNodeIds: normalizedPublication.publishedActiveNodeIds,
      projectedServingNodeIds:
        normalizedPublication.membershipLifecycleSummary?.projectedServingNodeIds,
      locallyEligibleNodeIds:
        normalizedPublication.membershipLifecycleSummary?.locallyEligibleNodeIds,
      suspectedOrTransitioningNodeIds:
        normalizedPublication.membershipLifecycleSummary?.suspectedOrTransitioningNodeIds,
      memberStatesByNodeId: allAcknowledged ?
        buildServingMemberStatesByNodeId(
          normalizedPublication.membershipLifecycleSummary?.memberStatesByNodeId,
          publishedNodeIdsForState,
        ) :
        normalizedPublication.membershipLifecycleSummary?.memberStatesByNodeId,
      recoveryEpochByNodeId:
        normalizedPublication.membershipLifecycleSummary?.recoveryEpochByNodeId,
      membershipFreeze: normalizedPublication.membershipLifecycleSummary?.membershipFreeze,
      projectionDiagnostics:
        normalizedPublication.membershipLifecycleSummary?.projectionDiagnostics,
    }),
    transition_history: transitionHistory,
  };
}
class MembershipPublicationCoordinator {
  constructor(options = {}) {
    this.nodeId = options.nodeId || null;
    this.systemTableCache = options.systemTableCache || null;
    this.cdcIntegrationService = options.cdcIntegrationService || null;
    this.authoritativeControlPlaneView = options.authoritativeControlPlaneView || null;
    this.membershipPublicationRuntimeOwner = options.membershipPublicationRuntimeOwner || null;
    this.controlPlanePublicationsOwner = resolveControlPlanePublicationsOwner(options);
    this.controlPlaneReadinessService = options.controlPlaneReadinessService || null;
    this.replicaOperationRepository = options.replicaOperationRepository || null;
    this.logger = options.logger || this.controlPlaneReadinessService?.logger || console;
    this.now = typeof options.now === TYPEOF.FUNCTION ? options.now : () => Date.now();
    this.workflowCoordinator =
      options.workflowCoordinator ||
      new DurableWorkflowCoordinator({
        now: this.now,
      });
    this.publicationReconcileLane =
      options.publicationReconcileLane ||
      new OperationLane({
        name: MEMBERSHIP_PUBLICATION_COORDINATOR_LITERAL.MEMBERSHIP_PUBLICATION_RECONCILE,
        workflowCoordinator: this.workflowCoordinator,
      });
    this.publicationAcknowledgementLane =
      options.publicationAcknowledgementLane ||
      new OperationLane({
        name: MEMBERSHIP_PUBLICATION_COORDINATOR_LITERAL.MEMBERSHIP_PUBLICATION_ACKNOWLEDGEMENT,
        workflowCoordinator: this.workflowCoordinator,
      });
    this.reconcileQueue =
      options.reconcileQueue ||
      new OwnerKeyReconcileQueue({
        name: MEMBERSHIP_PUBLICATION_OWNER_KEY,
        reconcileFn: async (_ownerKey, _reasons, context) =>
          this.reconcileClusterMembership(context || {}),
      });
  }
  buildOwnerKey(publicationKind = MEMBERSHIP_PUBLICATION_KIND) {
    return `membership-publication:${publicationKind}`;
  }
  getAuthoritativeControlPlaneView() {
    if (this.authoritativeControlPlaneView) {
      return this.authoritativeControlPlaneView;
    }
    this.authoritativeControlPlaneView = new AuthoritativeControlPlaneView({
      nodeId: this.nodeId,
      cdcIntegrationService: this.cdcIntegrationService,
      now: this.now,
    });
    return this.authoritativeControlPlaneView;
  }
  async readTableRows(tableName, options = {}) {
    const preloadedRows = options.preloadedRows;
    if (
      Array.isArray(preloadedRows) &&
      (preloadedRows.length > NUM.ZERO || options.allowEmptyPreloadedRows === true)
    ) {
      return preloadedRows;
    }
    const preferAuthoritativeRead =
      options.preferAuthoritativeRead === true || options.requireAuthoritative === true;
    if (
      tableName === TABLES.CONTROL_PLANE_PUBLICATIONS &&
      preferAuthoritativeRead !== true &&
      this.controlPlanePublicationsOwner &&
      typeof this.controlPlanePublicationsOwner.listPublicationsFromCache === TYPEOF.FUNCTION
    ) {
      const cachedPublicationRows = normalizeTableRowsResult(
        await this.controlPlanePublicationsOwner.listPublicationsFromCache(options),
      );
      if (
        cachedPublicationRows.length > NUM.ZERO ||
        typeof this.controlPlanePublicationsOwner.listPublications !== TYPEOF.FUNCTION
      ) {
        return cachedPublicationRows;
      }
    }
    if (
      tableName === TABLES.CONTROL_PLANE_PUBLICATIONS &&
      this.controlPlanePublicationsOwner &&
      typeof this.controlPlanePublicationsOwner.listPublications === TYPEOF.FUNCTION
    ) {
      const publicationReadOptions = buildPublicationListReadOptions(options);
      return normalizeTableRowsResult(
        await this.controlPlanePublicationsOwner.listPublications(publicationReadOptions),
      );
    }
    const view = this.getAuthoritativeControlPlaneView();
    if (view && typeof view.readRows === TYPEOF.FUNCTION && view.canRead()) {
      const result = await view.readRows(
        tableName,
        `SELECT * FROM ${tableName}`,
        [],
        buildLocalAuthoritativeMembershipReadOptions(options),
      );
      if (result?.success === true) {
        const authoritativeRows = normalizeTableRowsResult(result);
        if (
          shouldMergePlanningEvidenceRows(tableName, options) &&
          typeof this.systemTableCache?.getAll === TYPEOF.FUNCTION
        ) {
          return mergePlanningEvidenceRows(
            tableName,
            authoritativeRows,
            this.systemTableCache.getAll(tableName) || [],
          );
        }
        return authoritativeRows;
      }
    }
    if (typeof this.systemTableCache?.getAll === TYPEOF.FUNCTION) {
      return this.systemTableCache.getAll(tableName) || [];
    }
    return [];
  }
  async getLatestPublicationRow(options = {}) {
    const publicationRows = await this.readTableRows(TABLES.CONTROL_PLANE_PUBLICATIONS, {
      ...options,
      preloadedRows: options.publicationRows,
    });
    const normalizedRows = publicationRows
      .map((row) => normalizeControlPlanePublicationRow(row))
      .filter((row) => row.publicationKind === MEMBERSHIP_PUBLICATION_KIND)
      .sort((left, right) => (right.publicationEpoch || 0) - (left.publicationEpoch || 0));
    return normalizedRows[NUM.ZERO] || null;
  }
  getLatestPublicationRowSync(options = {}) {
    const preloadedRows = Array.isArray(options.publicationRows) ? options.publicationRows : null;
    const publicationRows =
      preloadedRows ||
      (typeof this.systemTableCache?.getAll === TYPEOF.FUNCTION ?
        this.systemTableCache.getAll(TABLES.CONTROL_PLANE_PUBLICATIONS) || [] :
        []);
    const normalizedRows = publicationRows
      .map((row) => normalizeControlPlanePublicationRow(row))
      .filter((row) => row.publicationKind === MEMBERSHIP_PUBLICATION_KIND)
      .sort((left, right) => (right.publicationEpoch || 0) - (left.publicationEpoch || 0));
    return normalizedRows[NUM.ZERO] || null;
  }
  async getLatestClusterPublication(options = {}) {
    return this.getLatestPublicationRow(options);
  }
  getLatestClusterPublicationSync(options = {}) {
    return this.getLatestPublicationRowSync(options);
  }
  async getLatestPublishedPublicationRow(options = {}) {
    const publicationRows = await this.readTableRows(TABLES.CONTROL_PLANE_PUBLICATIONS, {
      ...options,
      preloadedRows: options.publicationRows,
    });
    const normalizedRows = publicationRows
      .map((row) => normalizeControlPlanePublicationRow(row))
      .filter(
        (row) =>
          row.publicationKind === MEMBERSHIP_PUBLICATION_KIND &&
          row.status === MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED,
      )
      .sort((left, right) => (right.publicationEpoch || 0) - (left.publicationEpoch || 0));
    return normalizedRows[NUM.ZERO] || null;
  }
  getLatestPublishedPublicationRowSync(options = {}) {
    const preloadedRows = Array.isArray(options.publicationRows) ? options.publicationRows : null;
    const publicationRows =
      preloadedRows ||
      (typeof this.systemTableCache?.getAll === TYPEOF.FUNCTION ?
        this.systemTableCache.getAll(TABLES.CONTROL_PLANE_PUBLICATIONS) || [] :
        []);
    const normalizedRows = publicationRows
      .map((row) => normalizeControlPlanePublicationRow(row))
      .filter(
        (row) =>
          row.publicationKind === MEMBERSHIP_PUBLICATION_KIND &&
          row.status === MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED,
      )
      .sort((left, right) => (right.publicationEpoch || 0) - (left.publicationEpoch || 0));
    return normalizedRows[NUM.ZERO] || null;
  }
  async getLatestPublishedClusterPublication(options = {}) {
    return this.getLatestPublishedPublicationRow(options);
  }
  getLatestPublishedClusterPublicationSync(options = {}) {
    return this.getLatestPublishedPublicationRowSync(options);
  }
  async getLatestPublicationForNode(nodeId, options = {}) {
    const latestPublicationRow = await this.getLatestPublicationRow(options);
    return publicationRowIncludesNode(latestPublicationRow, nodeId) ? latestPublicationRow : null;
  }
  getLatestPublicationForNodeSync(nodeId, options = {}) {
    const latestPublicationRow = this.getLatestPublicationRowSync(options);
    return publicationRowIncludesNode(latestPublicationRow, nodeId) ? latestPublicationRow : null;
  }

  /**
   * Resolve the publication row that should answer one node acknowledgement.
   * Freshness, target-node inclusion, and bounded authoritative refresh remain
   * publication-owner concerns rather than dispatch concerns.
   *
   * @param {string} nodeId
   * @param {Object} [options={}]
   * @return {Promise<Object|null>}
   */
  async getAcknowledgementCandidateForNode(nodeId, options = {}) {
    const normalizedNodeId = String(nodeId || '').trim();
    if (!normalizedNodeId) {
      return null;
    }
    const initialPublicationRow =
      this.getLatestPublicationRowSync({
        ...options,
        preferAuthoritativeRead: false,
      }) ||
      (await safelyGetLatestMembershipPublicationRow(this, {
        ...options,
        preferAuthoritativeRead: false,
      }));
    if (!initialPublicationRow || typeof initialPublicationRow !== TYPEOF.OBJECT) {
      return null;
    }
    const initialPublication = normalizeControlPlanePublicationRow(initialPublicationRow);
    const refreshDecision = buildMembershipPublicationAckRefreshDecision({
      normalizedPublication: initialPublication,
      nodeId: normalizedNodeId,
    });
    const refreshedPublicationRow = refreshDecision.shouldRefresh ?
      await safelyGetLatestMembershipPublicationRow(this, {
        ...options,
        preferAuthoritativeRead: true,
      }) :
      null;
    const candidatePublicationRow =
      refreshedPublicationRow && typeof refreshedPublicationRow === TYPEOF.OBJECT ?
        refreshedPublicationRow :
        initialPublicationRow;
    const normalizedPublication = normalizeControlPlanePublicationRow(candidatePublicationRow);
    const requiredAckNodeIds = normalizeNodeIdList(normalizedPublication.requiredAckNodeIds);
    const acknowledgedNodeIds = normalizeNodeIdList(normalizedPublication.acknowledgedNodeIds);
    return Object.freeze({
      nodeId: normalizedNodeId,
      publicationRow: candidatePublicationRow,
      authoritativeRefreshAttempted: refreshDecision.shouldRefresh,
      terminal: this.isTerminalPublicationStatus(normalizedPublication.status),
      requiresAcknowledgement: requiredAckNodeIds.includes(normalizedNodeId),
      alreadyAcknowledged: acknowledgedNodeIds.includes(normalizedNodeId),
      allRequiredAcknowledged: listEquals(acknowledgedNodeIds, requiredAckNodeIds),
    });
  }

  /**
   * Resolve dispatch-retry rows for one target node from the publication-owner
   * path. Cache-first visibility and priority-recovery authoritative
   * rediscovery stay behind this owner surface.
   *
   * @param {string} nodeId
   * @return {Promise<Object[]>}
   */
  isLocallyOwnedReplicaOperationRow(operation) {
    const normalizedOperation = normalizeReplicaOperationView(operation);
    if (!normalizedOperation) {
      return false;
    }
    if (
      this.replicaOperationRepository &&
      typeof this.replicaOperationRepository.isOperationLocallyOwned === TYPEOF.FUNCTION
    ) {
      return this.replicaOperationRepository.isOperationLocallyOwned(normalizedOperation);
    }
    return normalizedOperation.sourceNodeId === this.nodeId;
  }

  /**
   * Resolve dispatch-retry rows for one target node from the publication-owner
   * path. Cache-first visibility and priority-recovery authoritative
   * rediscovery stay behind this owner surface.
   *
   * @param {string} nodeId
   * @return {Promise<Object[]>}
   */
  async getDispatchRetryRowsForNode(nodeId) {
    const normalizedNodeId = String(nodeId || '').trim();
    if (!normalizedNodeId) {
      return [];
    }
    const cacheRows =
      typeof this.systemTableCache?.getAll === TYPEOF.FUNCTION ?
        this.systemTableCache.getAll(TABLES.REPLICA_OPERATIONS) || [] :
        [];
    const dispatchRows = cacheRows.filter((row) => {
      const operation = normalizeReplicaOperationView(row);
      return (
        operation &&
        isCoordinatorOwnedOperationType(operation.type) &&
        this.isLocallyOwnedReplicaOperationRow(operation) &&
        matchesDispatchRetryReadyNode(operation, normalizedNodeId) &&
        isDispatchRetryOperation(operation)
      );
    });
    const readinessService = this.controlPlaneReadinessService;
    if (!readinessService || typeof readinessService !== TYPEOF.OBJECT) {
      return dispatchRows;
    }
    let publicationConvergence = null;
    try {
      publicationConvergence = await readMembershipPublicationConvergence(
        readinessService,
        normalizedNodeId,
        this.now(),
      );
    } catch (_error) {
      publicationConvergence = null;
    }
    if (
      !shouldUseAuthoritativePriorityRecoveryRediscovery(normalizedNodeId, {
        cacheVisible: false,
        publicationConvergence,
      })
    ) {
      return dispatchRows;
    }
    const repository = this.replicaOperationRepository;
    if (!repository || typeof repository.queryIncompleteOperations !== TYPEOF.FUNCTION) {
      return dispatchRows;
    }
    try {
      const operations = await repository.queryIncompleteOperations({
        visibilityReadMode: REPLICA_OPERATION_VISIBILITY_READ_MODE.OWNER_RPC_REQUIRED,
      });
      if (!Array.isArray(operations) || operations.length === NUM.ZERO) {
        return dispatchRows;
      }
      const authoritativeRows = operations
        .filter((operation) => {
          const normalizedOperation = normalizeReplicaOperationView(operation);
          return (
            normalizedOperation &&
            isCoordinatorOwnedOperationType(normalizedOperation.type) &&
            this.isLocallyOwnedReplicaOperationRow(normalizedOperation) &&
            matchesDispatchRetryReadyNode(
              normalizedOperation,
              normalizedNodeId,
            ) &&
            isDispatchRetryOperation(normalizedOperation)
          );
        })
        .map((operation) => this.buildDispatchRetryRowFromOperation(operation));
      return mergeDispatchRetryRowsByOperationId(
        authoritativeRows,
        dispatchRows,
      );
    } catch (_error) {
      return dispatchRows;
    }
  }

  /**
   * Convert one operation view back into replica_operations row shape for
   * dispatch queue re-entry.
   * @param {Object} operation
   * @return {Object|null}
   * @private
   */
  buildDispatchRetryRowFromOperation(operation) {
    const normalizedOperation = normalizeReplicaOperationView(operation);
    if (!normalizedOperation) {
      return null;
    }
    return {
      operation_id: normalizedOperation.operationId,
      type: normalizedOperation.type,
      partition_id: normalizedOperation.partitionId,
      replica_id: normalizedOperation.replicaId,
      source_node_id: normalizedOperation.sourceNodeId,
      target_node_id: normalizedOperation.targetNodeId,
      status: normalizedOperation.status,
      workflow_step: normalizedOperation.workflowStep,
      created_at: normalizedOperation.createdAt,
      updated_at: normalizedOperation.updatedAt,
      completed_at: normalizedOperation.completedAt,
      error_message: normalizedOperation.errorMessage,
      steps_history: JSON.stringify(normalizedOperation.stepsHistory),
      entity_type: normalizedOperation.entityType,
      entity_id: normalizedOperation.entityId,
    };
  }
  isTerminalPublicationStatus(publicationStatus) {
    const normalizedPublicationStatus =
      typeof publicationStatus === TYPEOF.STRING ? publicationStatus.toUpperCase() : null;
    return (
      normalizedPublicationStatus === MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED ||
      normalizedPublicationStatus === MEMBERSHIP_PUBLICATION_STATUS.ABANDONED ||
      normalizedPublicationStatus === MEMBERSHIP_PUBLICATION_STATUS.SUPERSEDED
    );
  }
  async acknowledgeMembershipPublicationForNode(nodeId, options = {}) {
    const normalizedNodeId = String(nodeId || '').trim();
    if (!normalizedNodeId) {
      return null;
    }
    const acknowledgementCandidate = await this.getAcknowledgementCandidateForNode(
      normalizedNodeId,
      options,
    );
    if (!acknowledgementCandidate || typeof acknowledgementCandidate !== TYPEOF.OBJECT) {
      return null;
    }
    const candidatePublicationRow = acknowledgementCandidate.publicationRow;
    if (!candidatePublicationRow || typeof candidatePublicationRow !== TYPEOF.OBJECT) {
      return null;
    }
    if (
      acknowledgementCandidate.terminal === true ||
      acknowledgementCandidate.requiresAcknowledgement !== true ||
      (
        acknowledgementCandidate.alreadyAcknowledged === true &&
        acknowledgementCandidate.allRequiredAcknowledged !== true
      )
    ) {
      return serializeMembershipPublicationRow(candidatePublicationRow);
    }
    return this.acknowledgePublication(
      candidatePublicationRow.publication_id || candidatePublicationRow.publicationId,
      normalizedNodeId,
      {
        ...options,
        publicationRow: candidatePublicationRow,
        skipPublicationWriteReadback:
          options.skipPublicationWriteReadback === true,
      },
    );
  }
  async deriveClusterMembershipCandidate(options = {}) {
    const planningSnapshot =
      options.planningSnapshot && typeof options.planningSnapshot === TYPEOF.OBJECT ?
        options.planningSnapshot :
        await this.readPublicationPlanningSnapshot(options);
    return deriveMembershipPublicationCandidate({
      ...options,
      planningSnapshot,
    });
  }
  deriveClusterMembershipCandidateSync(options = {}) {
    const planningSnapshot =
      options.planningSnapshot && typeof options.planningSnapshot === TYPEOF.OBJECT ?
        options.planningSnapshot :
        this.readPublicationPlanningSnapshotSync(options);
    return deriveMembershipPublicationCandidate({
      ...options,
      planningSnapshot,
    });
  }
  async readPublicationPlanningSnapshot(options = {}) {
    const planningReadOptions = {
      ...options,
      readProfile: MEMBERSHIP_PUBLICATION_READ_PROFILE.PLANNING,
    };
    const latestPublicationRow =
      options.latestPublicationRow || (await this.getLatestPublicationRow(planningReadOptions));
    const latestPublishedPublicationRow =
      options.latestPublishedPublicationRow ||
      (String(latestPublicationRow?.status || '').toUpperCase() ===
      MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED ?
        latestPublicationRow :
        await this.getLatestPublishedPublicationRow(planningReadOptions));
    const preferAuthoritativeMembershipState = shouldPreferAuthoritativeMembershipState({
      ...options,
      latestPublicationRow,
      latestPublishedPublicationRow,
    });
    const nodeRows = await this.readTableRows(TABLES.NODES, {
      ...planningReadOptions,
      preferAuthoritativeRead: preferAuthoritativeMembershipState,
      preloadedRows: options.nodeRows,
    });
    const nodeEndpointRows = await this.readTableRows(TABLES.NODE_ENDPOINTS, {
      ...planningReadOptions,
      preferAuthoritativeRead: preferAuthoritativeMembershipState,
      preloadedRows: options.nodeEndpointRows,
    });
    const serviceRows = await this.readTableRows(TABLES.SERVICES, {
      ...planningReadOptions,
      preferAuthoritativeRead: preferAuthoritativeMembershipState,
      preloadedRows: options.serviceRows,
    });
    const partitionRows = await this.readTableRows(TABLES.PARTITIONS, {
      ...planningReadOptions,
      preferAuthoritativeRead: preferAuthoritativeMembershipState,
      preloadedRows: options.partitionRows,
    });
    const replicaOperationRows = await this.readTableRows(
      TABLES.REPLICA_OPERATIONS,
      {
        ...planningReadOptions,
        preferAuthoritativeRead: preferAuthoritativeMembershipState,
        preloadedRows: options.replicaOperationRows,
      },
    );
    const readinessEntries = Array.isArray(options.readinessEntries) ?
      options.readinessEntries :
      this.controlPlaneReadinessService &&
          typeof this.controlPlaneReadinessService.getAllNodeReadiness === TYPEOF.FUNCTION ?
        await this.controlPlaneReadinessService.getAllNodeReadiness({
          allowAuthoritativeRefresh: preferAuthoritativeMembershipState,
          membershipPublicationPlanningSource:
              MEMBERSHIP_PUBLICATION_PLANNING_SOURCE.DIRECT_PUBLICATION_ROW,
        }) :
        [];
    const recoveryEpochsByNodeId =
      options.recoveryEpochsByNodeId ||
      (this.controlPlaneReadinessService &&
      typeof this.controlPlaneReadinessService.getRecoveryEpochHistoryByNodeId === TYPEOF.FUNCTION ?
        this.controlPlaneReadinessService.getRecoveryEpochHistoryByNodeId() :
        null);
    const connectedNodeIds =
      this.controlPlaneReadinessService?.messageRouter &&
      typeof this.controlPlaneReadinessService.messageRouter.getConnectedNodes === TYPEOF.FUNCTION ?
        this.controlPlaneReadinessService.messageRouter.getConnectedNodes() :
        [];
    const priorityRecoveryPlanningSnapshot =
      options.disableNestedPriorityRecoveryPlanning === true ?
        null :
        this.controlPlaneReadinessService &&
            typeof this.controlPlaneReadinessService
              .getMembershipPublicationPlanningAnswerBestEffort === TYPEOF.FUNCTION ?
          await this.controlPlaneReadinessService.getMembershipPublicationPlanningAnswerBestEffort(
            options.publisherNodeId || this.nodeId,
            normalizePositiveInteger(options.nowMs, this.now()),
          ) :
          null;
    return buildMembershipPublicationEvidenceSnapshot({
      ...options,
      latestPublicationRow,
      latestPublishedPublicationRow,
      nodeRows,
      nodeEndpointRows,
      serviceRows,
      partitionRows,
      replicaOperationRows,
      readinessEntries,
      recoveryEpochsByNodeId,
      connectedNodeIds,
      priorityRecoveryPlanningSnapshot,
      publisherNodeId: options.publisherNodeId || this.nodeId,
      localNodeId: this.nodeId,
      localNodeResponsive: true,
      nowMs: normalizePositiveInteger(options.nowMs, this.now()),
    });
  }
  readPublicationPlanningSnapshotSync(options = {}) {
    const latestPublicationRow =
      options.latestPublicationRow || this.getLatestPublicationRowSync(options);
    const latestPublishedPublicationRow =
      options.latestPublishedPublicationRow ||
      (String(latestPublicationRow?.status || '').toUpperCase() ===
      MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED ?
        latestPublicationRow :
        this.getLatestPublishedPublicationRowSync(options));
    const nodeRows = Array.isArray(options.nodeRows) ?
      options.nodeRows :
      typeof this.systemTableCache?.getAll === TYPEOF.FUNCTION ?
        this.systemTableCache.getAll(TABLES.NODES) || [] :
        [];
    const nodeEndpointRows = Array.isArray(options.nodeEndpointRows) ?
      options.nodeEndpointRows :
      typeof this.systemTableCache?.getAll === TYPEOF.FUNCTION ?
        this.systemTableCache.getAll(TABLES.NODE_ENDPOINTS) || [] :
        [];
    const serviceRows = Array.isArray(options.serviceRows) ?
      options.serviceRows :
      typeof this.systemTableCache?.getAll === TYPEOF.FUNCTION ?
        this.systemTableCache.getAll(TABLES.SERVICES) || [] :
        [];
    const partitionRows = Array.isArray(options.partitionRows) ?
      options.partitionRows :
      typeof this.systemTableCache?.getAll === TYPEOF.FUNCTION ?
        this.systemTableCache.getAll(TABLES.PARTITIONS) || [] :
        [];
    const replicaOperationRows = Array.isArray(options.replicaOperationRows) ?
      options.replicaOperationRows :
      typeof this.systemTableCache?.getAll === TYPEOF.FUNCTION ?
        this.systemTableCache.getAll(TABLES.REPLICA_OPERATIONS) || [] :
        [];
    const readinessEntries = Array.isArray(options.readinessEntries) ?
      options.readinessEntries :
      this.controlPlaneReadinessService &&
          typeof this.controlPlaneReadinessService.getAllNodeReadinessSync === TYPEOF.FUNCTION ?
        this.controlPlaneReadinessService.getAllNodeReadinessSync({
          allowStaleOnCacheChange: true,
          membershipPublicationPlanningSource:
              MEMBERSHIP_PUBLICATION_PLANNING_SOURCE.DIRECT_PUBLICATION_ROW,
        }) :
        [];
    const recoveryEpochsByNodeId =
      options.recoveryEpochsByNodeId ||
      (this.controlPlaneReadinessService &&
      typeof this.controlPlaneReadinessService.getRecoveryEpochHistoryByNodeId === TYPEOF.FUNCTION ?
        this.controlPlaneReadinessService.getRecoveryEpochHistoryByNodeId() :
        null);
    const connectedNodeIds =
      this.controlPlaneReadinessService?.messageRouter &&
      typeof this.controlPlaneReadinessService.messageRouter.getConnectedNodes === TYPEOF.FUNCTION ?
        this.controlPlaneReadinessService.messageRouter.getConnectedNodes() :
        [];
    return buildMembershipPublicationEvidenceSnapshot({
      ...options,
      latestPublicationRow,
      latestPublishedPublicationRow,
      nodeRows,
      nodeEndpointRows,
      serviceRows,
      partitionRows,
      replicaOperationRows,
      readinessEntries,
      recoveryEpochsByNodeId,
      connectedNodeIds,
      priorityRecoveryPlanningSnapshot: null,
      publisherNodeId: options.publisherNodeId || this.nodeId,
      localNodeId: this.nodeId,
      localNodeResponsive: true,
      nowMs: normalizePositiveInteger(options.nowMs, this.now()),
    });
  }
  async ensureWorkflow(ownerKey, candidate) {
    const existingWorkflow = this.workflowCoordinator.getWorkflowByOwnerKey(ownerKey);
    if (existingWorkflow) {
      return existingWorkflow;
    }
    return this.workflowCoordinator.registerWorkflow({
      workflowId: `membership-publication:${candidate.publicationEpoch}`,
      ownerKey,
      step: MEMBERSHIP_PUBLICATION_WORKFLOW_STEP.IDLE,
      metadata: {
        publicationKind: candidate.publicationKind,
      },
      transitionHistory: [],
    });
  }
  async persistPublicationRow(row, options = {}) {
    let persistedRow = serializeMembershipPublicationRow(row);
    if (
      this.controlPlanePublicationsOwner &&
      typeof this.controlPlanePublicationsOwner.upsertPublication === TYPEOF.FUNCTION
    ) {
      const publicationId = persistedRow.publication_id || null;
      const canVerifyPersistedRow =
        publicationId &&
        options.skipPublicationWriteReadback !== true &&
        typeof this.controlPlanePublicationsOwner.getPublication === TYPEOF.FUNCTION;
      const maxAttempts = normalizePositiveInteger(
        options.publicationWriteMaxAttempts,
        PUBLICATION_WRITE_MAX_ATTEMPTS,
      );
      for (let attempt = NUM.ZERO; attempt < maxAttempts; attempt += NUM.ONE) {
        if (canVerifyPersistedRow) {
          const currentRow = await this.controlPlanePublicationsOwner.getPublication(
            publicationId,
            buildPublicationReadOptions(options),
          );
          persistedRow = serializeMembershipPublicationRow(
            mergePublicationRows(persistedRow, currentRow),
          );
        }
        try {
          await this.controlPlanePublicationsOwner.upsertPublication(persistedRow, options);
        } catch (error) {
          if (!canVerifyPersistedRow || attempt + NUM.ONE >= maxAttempts) {
            throw error;
          }
          const durableRow = await this.controlPlanePublicationsOwner.getPublication(
            publicationId,
            buildPublicationReadOptions(options),
          );
          if (publicationRowSatisfiesDesiredState(durableRow, persistedRow)) {
            return serializeMembershipPublicationRow(
              mergePublicationRows(durableRow, persistedRow),
            );
          }
          persistedRow = serializeMembershipPublicationRow(
            mergePublicationRows(durableRow, persistedRow),
          );
          continue;
        }
        if (!canVerifyPersistedRow) {
          return persistedRow;
        }
        if (options.skipPublicationWriteReadback === true) {
          return persistedRow;
        }
        const durableRow = await this.controlPlanePublicationsOwner.getPublication(
          publicationId,
          buildPublicationReadOptions(options),
        );
        if (publicationRowSatisfiesDesiredState(durableRow, persistedRow)) {
          return serializeMembershipPublicationRow(mergePublicationRows(durableRow, persistedRow));
        }
        persistedRow = serializeMembershipPublicationRow(
          mergePublicationRows(durableRow, persistedRow),
        );
      }
    }
    return persistedRow;
  }
  async acknowledgePublication(publicationId, nodeId, options = {}) {
    return this.publicationAcknowledgementLane.run(
      {
        ownerKey: `${this.buildOwnerKey()}:ack:${publicationId}`,
      },
      async () => {
        let existingRow = null;
        if (
          this.controlPlanePublicationsOwner &&
          typeof this.controlPlanePublicationsOwner.getPublication === TYPEOF.FUNCTION
        ) {
          existingRow = await this.controlPlanePublicationsOwner.getPublication(
            publicationId,
            buildPublicationReadOptions(options),
          );
        }
        const baseRow = mergePublicationRows(existingRow, options.publicationRow || null);
        if (!baseRow) {
          return null;
        }
        const normalizedBaseRow = normalizeControlPlanePublicationRow(baseRow);
        const acknowledgedRow = acknowledgeMembershipPublication({
          publicationRow: baseRow,
          nodeId,
          nowMs: this.now(),
          timeoutMs: options.timeoutMs,
          timeoutReasonCode: options.timeoutReasonCode,
        });
        const normalizedAcknowledgedRow = normalizeControlPlanePublicationRow(acknowledgedRow);
        const acknowledgementChanged =
          normalizedAcknowledgedRow.status !== normalizedBaseRow.status ||
          !listEquals(
            normalizedAcknowledgedRow.acknowledgedNodeIds,
            normalizedBaseRow.acknowledgedNodeIds,
          );
        if (!acknowledgementChanged) {
          return acknowledgedRow;
        }
        return this.persistPublicationRow(acknowledgedRow, options);
      },
    );
  }
  async reconcileClusterMembership(options = {}) {
    const ownerKey = this.buildOwnerKey();
    return this.publicationReconcileLane.run(
      {
        ownerKey,
      },
      async () =>
        this.workflowCoordinator.runExclusive(ownerKey, async () => {
          const latestPublicationRow =
            options.latestPublicationRow || (await this.getLatestPublicationRow(options));
          const latestPublishedPublicationRow =
            options.latestPublishedPublicationRow ||
            (String(latestPublicationRow?.status || '').toUpperCase() ===
            MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED ?
              latestPublicationRow :
              await this.getLatestPublishedPublicationRow(options));
          const candidate = await this.deriveClusterMembershipCandidate({
            ...options,
            latestPublicationRow,
            latestPublishedPublicationRow,
          });
          const workflow = await this.ensureWorkflow(ownerKey, candidate);
          if (latestPublicationRow && candidate.changed !== true) {
            if (
              candidate.priorityPartitionSummaryChanged === true &&
              ((candidate.priorityPartitionSummary &&
                typeof candidate.priorityPartitionSummary === TYPEOF.OBJECT) ||
                (candidate.membershipLifecycleSummary &&
                  typeof candidate.membershipLifecycleSummary === TYPEOF.OBJECT))
            ) {
              const refreshedRow = buildPublicationMetadataRefreshRow({
                publicationRow: latestPublicationRow,
                priorityPartitionSummary: candidate.priorityPartitionSummary,
                membershipLifecycleSummary: candidate.membershipLifecycleSummary,
                nowMs: this.now(),
              });
              const persistedRow = await this.persistPublicationRow(refreshedRow, options);
              return {
                candidate,
                publicationRow: normalizeControlPlanePublicationRow(persistedRow),
                workflow,
              };
            }
            return {
              candidate,
              publicationRow:
                String(
                  latestPublicationRow.status || MEMBERSHIP_PUBLICATION_COORDINATOR_LITERAL.EMPTY,
                ).toUpperCase() === MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED ||
                !latestPublishedPublicationRow ?
                  latestPublicationRow :
                  latestPublishedPublicationRow,
              workflow,
            };
          }
          await this.workflowCoordinator.transitionStep(workflow.workflowId, {
            nextStep: MEMBERSHIP_PUBLICATION_WORKFLOW_STEP.DERIVING,
            reason: PUBLICATION_WORKFLOW_REASON.DERIVE_MEMBERSHIP_PUBLICATION,
            metadata: {
              publicationEpoch: candidate.publicationEpoch,
            },
          });
          const row = buildMembershipPublicationRow({
            publicationId: options.publicationId,
            candidate,
            nowMs: this.now(),
          });
          await this.persistPublicationRow(row, options);
          await this.workflowCoordinator.transitionStep(
            workflow.workflowId,
            {
              nextStep: MEMBERSHIP_PUBLICATION_WORKFLOW_STEP.OPEN,
              reason: PUBLICATION_WORKFLOW_REASON.PERSIST_OPEN_PUBLICATION,
              metadata: {
                publicationId: row.publication_id,
                publicationEpoch: row.publication_epoch,
              },
            },
            {
              metadata: {
                publicationId: row.publication_id,
                publicationEpoch: row.publication_epoch,
              },
            },
          );
          return {
            candidate,
            publicationRow: row,
            workflow,
          };
        }),
    );
  }
  getLaneDiagnostics() {
    const inFlightExecutions =
      this.workflowCoordinator?.inFlightExecutionsByOwnerKey instanceof Map ?
        this.workflowCoordinator.inFlightExecutionsByOwnerKey :
        new Map();
    return Object.freeze({
      reconcileLane: Object.freeze({
        name: this.publicationReconcileLane?.name || null,
        activeExecutionCount: inFlightExecutions.has(this.buildOwnerKey()) ? NUM.ONE : NUM.ZERO,
      }),
      acknowledgementLane: Object.freeze({
        name: this.publicationAcknowledgementLane?.name || null,
        activeExecutionCount: [...inFlightExecutions.keys()].filter((ownerKey) =>
          String(ownerKey).startsWith(`${this.buildOwnerKey()}:ack:`),
        ).length,
      }),
    });
  }
  enqueueClusterMembershipReconcile(
    reason = MEMBERSHIP_PUBLICATION_COORDINATOR_LITERAL.MANUAL,
    context = {},
    options = {},
  ) {
    return this.reconcileQueue.enqueue(this.buildOwnerKey(), reason, context, options);
  }
}
export {
  MEMBERSHIP_PUBLICATION_KIND,
  MEMBERSHIP_PUBLICATION_OWNER_KEY,
  MEMBERSHIP_PUBLICATION_STATUS,
  MEMBERSHIP_PUBLICATION_WORKFLOW_STEP,
  MembershipPublicationCoordinator,
  acknowledgeMembershipPublication,
  abandonMembershipPublication,
  buildMembershipPublicationRow,
  buildTransitionHistoryEntry,
  deriveMembershipPublicationCandidate,
  hasPublicationTimedOut,
};
