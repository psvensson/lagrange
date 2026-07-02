import {
  COLUMN,
  WORKFLOW_STEP,
} from '../constants/index.js';
import {normalizeControlPlanePublicationRow} from './system-row-normalizers.js';
import {isTerminalPublicationRecoveryStatus} from './publication-recovery-state-machine.js';
import {OperationType} from '../rebalancer/replica-status.js';
import {
  isSystemTablePartition,
} from '../bootstrap/system-partition-classification.js';
import {
  DISPATCH_RETRY_READY_NODE_PHASE,
  MEMBERSHIP_PUBLICATION_ACK_REFRESH_DECISION_RULES,
  MEMBERSHIP_PUBLICATION_ACK_REFRESH_STATE,
  MEMBERSHIP_PUBLICATION_COORDINATOR_LITERAL,
  MEMBERSHIP_PUBLICATION_STATUS,
  MEMBERSHIP_PUBLICATION_TARGET_NODE_STATE,
  NO_MEMBERSHIP_PUBLICATION_TARGET_NODE_ID,
  PUBLICATION_REASON_ACK_TIMEOUT_EXCEEDED,
} from './membership-publication-row-contract.js';

function normalizeNodeIdList(values = []) {
  return [
    ...new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => String(value || MEMBERSHIP_PUBLICATION_COORDINATOR_LITERAL.EMPTY).trim())
        .filter((value) => value.length > 0),
    ),
  ].sort();
}

function normalizeStringList(values = []) {
  return [
    ...new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => String(value || MEMBERSHIP_PUBLICATION_COORDINATOR_LITERAL.EMPTY).trim())
        .filter((value) => value.length > 0),
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
  if (Number.isFinite(normalized) && normalized >= 0) {
    return Math.trunc(normalized);
  }
  return fallback;
}

function normalizeMembershipPublicationNodeId(value) {
  return typeof value === 'string' && value.length > 0 ?
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
      typeof options.priorityRecoveryPlanningSnapshot === 'object' ?
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
    publisherNodeId.length > 0 &&
    collectMembershipPublicationEvidenceNodeIds(options).includes(publisherNodeId);
  const targetDecision = [
    {
      matches: explicitTargetNodeId.length > 0,
      nodeId: explicitTargetNodeId,
      state: MEMBERSHIP_PUBLICATION_TARGET_NODE_STATE.AVAILABLE,
    },
    {
      matches: planningTargetNodeId.length > 0,
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
    return typeof nodeId === 'string' && nodeId.length > 0;
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
  if (typeof nodeId !== 'string' || nodeId.length === 0) {
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
      typeof operationId !== 'string' ||
      operationId.length === 0 ||
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
  if (typeof reasonCode === 'string' && reasonCode.length > 0) {
    entry.reasonCode = reasonCode;
  }
  if (metadata && typeof metadata === 'object') {
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
    typeof options.reasonCode === 'string' && options.reasonCode.length > 0 ?
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
  if (!row || typeof row !== 'object') {
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
  if (requiredAckNodeIds.length === 0) {
    return [];
  }
  const acknowledgementBaselineRow = resolveAcknowledgementBaselinePublicationRow(options);
  const baselineAcknowledgedNodeIds = normalizeNodeIdList(
    acknowledgementBaselineRow?.acknowledgedNodeIds,
  );
  if (baselineAcknowledgedNodeIds.length === 0) {
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
  if (!coordinator || typeof coordinator.getLatestPublicationRow !== 'function') {
    return null;
  }
  try {
    return await coordinator.getLatestPublicationRow(options);
  } catch (_error) {
    return null;
  }
}

async function readMembershipPublicationConvergence(readinessService, nodeId, observedAt) {
  if (!readinessService || typeof readinessService !== 'object') {
    return null;
  }
  if (typeof readinessService.getMembershipPublicationDiagnosticsSync === 'function') {
    return readinessService.getMembershipPublicationDiagnosticsSync(nodeId, observedAt);
  }
  if (typeof readinessService.getMembershipPublicationDiagnostics === 'function') {
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
