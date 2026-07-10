import {createHash} from 'node:crypto';
import {v4 as uuidv4} from 'uuid';
import {
  TABLES,
} from '../constants/index.js';
import {CONTROL_PLANE_AUTHORITATIVE_READ_MODE} from './control-plane-system-table-gateway.js';
import {resolveActiveNodeViews} from './active-node-projection.js';
import {
  buildMembershipLifecycleSummary,
  MEMBERSHIP_MEMBER_STATE,
  MEMBERSHIP_LIFECYCLE_STATE,
} from './membership-lifecycle-constants.js';
import {
  buildPublicationOwnerStreamState,
} from './publication-owner-state.js';
import {
  normalizeControlPlanePublicationRow,
  serializeControlPlanePublicationRow,
} from './system-row-normalizers.js';
import {mergeControlPlanePublicationRows} from './control-plane-publication-merge.js';
import {
  PUBLICATION_RECOVERY_MACHINE_ACTION,
  PUBLICATION_RECOVERY_MACHINE_CONTEXT,
  evaluatePublicationRecoveryMachine,
} from './publication-recovery-state-machine.js';
import {
  buildPublicationMetadataRefreshRow as buildPublicationMetadataRefreshRowCore,
  deriveMembershipPublicationCandidate as deriveMembershipPublicationCandidateCore,
  shouldPreferAuthoritativeMembershipState as shouldPreferAuthoritativeMembershipStateCore,
} from './membership-publication-planning.js';
import {buildMembershipEpochSnapshot} from './membership-epoch-contract.js';
import {
  MEMBERSHIP_PUBLICATION_COORDINATOR_LITERAL,
  MEMBERSHIP_PUBLICATION_KIND,
  MEMBERSHIP_PUBLICATION_PLANNING_EVIDENCE_KEY_FIELDS_BY_TABLE,
  MEMBERSHIP_PUBLICATION_PLANNING_EVIDENCE_VERSION_FIELDS,
  MEMBERSHIP_PUBLICATION_READ_PROFILE,
  MEMBERSHIP_PUBLICATION_STATUS,
} from './membership-publication-row-contract.js';
import {
  buildMembershipPublicationTargetNodeDecision,
  buildTransitionHistoryEntry,
  didOptionalSourceVersionChange,
  listEquals,
  normalizeLatestPublicationRow,
  normalizeNodeIdList,
  normalizePositiveInteger,
  normalizeStringList,
  resolveCarriedAcknowledgedNodeIds,
} from './membership-publication-row-helpers.js';

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
    if (key.length > 0) {
      return key;
    }
  }
  return MEMBERSHIP_PUBLICATION_COORDINATOR_LITERAL.EMPTY;
}

function resolvePlanningEvidenceRowVersion(row = {}) {
  const versions = MEMBERSHIP_PUBLICATION_PLANNING_EVIDENCE_VERSION_FIELDS
    .map((fieldName) => normalizePositiveInteger(row?.[fieldName], 0))
    .filter((value) => value > 0);
  if (versions.length === 0) {
    return 0;
  }
  return Math.max(...versions);
}

function countPlanningEvidenceRowFields(row = {}) {
  if (!row || typeof row !== 'object') {
    return 0;
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
  ].find((delta) => delta !== 0);
  return typeof decisiveDelta === 'number' ? decisiveDelta : 0;
}

function mergePlanningEvidenceRows(tableName, authoritativeRows = [], projectionRows = []) {
  const keyFields =
    MEMBERSHIP_PUBLICATION_PLANNING_EVIDENCE_KEY_FIELDS_BY_TABLE[tableName] || [];
  if (keyFields.length === 0) {
    return authoritativeRows;
  }
  const rowByKey = new Map();
  const unkeyedRows = [];
  for (const row of [
    ...normalizeTableRowsResult(authoritativeRows),
    ...normalizeTableRowsResult(projectionRows),
  ]) {
    const key = resolvePlanningEvidenceRowKey(tableName, row);
    if (key.length === 0) {
      unkeyedRows.push(row);
      continue;
    }
    const existingRow = rowByKey.get(key);
    if (!existingRow || comparePlanningEvidenceRows(existingRow, row) >= 0) {
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
    typeof membershipPublicationRuntimeOwner.getControlPlanePublicationsOwner === 'function'
  ) {
    return membershipPublicationRuntimeOwner.getControlPlanePublicationsOwner() || null;
  }
  return null;
}

function resolveMembershipPublicationReadProfile(readProfile = null) {
  if (readProfile === MEMBERSHIP_PUBLICATION_READ_PROFILE.ACKNOWLEDGEMENT) {
    return MEMBERSHIP_PUBLICATION_READ_PROFILE.ACKNOWLEDGEMENT;
  }
  return readProfile === MEMBERSHIP_PUBLICATION_READ_PROFILE.DIAGNOSTICS ?
    MEMBERSHIP_PUBLICATION_READ_PROFILE.DIAGNOSTICS :
    MEMBERSHIP_PUBLICATION_READ_PROFILE.PLANNING;
}

function normalizeReplicaOperationView(operation) {
  if (!operation || typeof operation !== 'object') {
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
  const publicationReadOptions = buildPublicationReadOptions(options);
  return publicationReadOptions.readProfile ===
    MEMBERSHIP_PUBLICATION_READ_PROFILE.DIAGNOSTICS ||
    publicationReadOptions.readProfile ===
      MEMBERSHIP_PUBLICATION_READ_PROFILE.ACKNOWLEDGEMENT ?
    publicationReadOptions :
    {
      ...publicationReadOptions,
      authoritativeReadMode:
        CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_LOCAL_ONLY,
    };
}

function buildPublicationAcknowledgementReadOptions(options = {}) {
  return {
    ...options,
    preferAuthoritativeRead: true,
    readProfile: MEMBERSHIP_PUBLICATION_READ_PROFILE.ACKNOWLEDGEMENT,
  };
}

function hasExplicitMembershipPublicationTarget(options = {}) {
  return normalizeNodeIdList(options.publishedActiveNodeIds).length > 0 &&
    normalizeNodeIdList(options.requiredAckNodeIds).length > 0;
}

function resolveMembershipEvidenceAuthoritativeReadMode(options = {}) {
  if (
    options.preferAuthoritativeRead === true ||
    options.requireAuthoritative === true
  ) {
    return options.tableName === TABLES.NODES ?
      CONTROL_PLANE_AUTHORITATIVE_READ_MODE
        .OWNER_RPC_PREFERRED_SQL_FALLBACK :
      CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_PREFERRED;
  }
  return CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_LOCAL_ONLY;
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
      typeof options.priorityRecoveryPlanningSnapshot === 'object' ?
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
      options.readinessByNodeId && typeof options.readinessByNodeId === 'object' ?
        options.readinessByNodeId :
        null,
    readinessEntries: Array.isArray(options.readinessEntries) ? options.readinessEntries : [],
    recoveryEpochsByNodeId:
      options.recoveryEpochsByNodeId && typeof options.recoveryEpochsByNodeId === 'object' ?
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
    membershipEpochSnapshot: buildMembershipEpochSnapshot({
      latestPublicationRow: options.latestPublicationRow,
      latestPublishedPublicationRow: options.latestPublishedPublicationRow,
      sourceTopologyEpoch: options.sourceTopologyEpoch,
      sourceSnapshotVersion: options.sourceSnapshotVersion,
    }),
    priorityPartitionSummary:
      options.priorityPartitionSummary &&
      typeof options.priorityPartitionSummary === 'object' ?
        options.priorityPartitionSummary :
        null,
    priorityRecoveryPlanningSnapshot,
    membershipLifecycleSummary:
      options.membershipLifecycleSummary &&
      typeof options.membershipLifecycleSummary === 'object' ?
        options.membershipLifecycleSummary :
        null,
    targetNodeId: targetNodeDecision.nodeId,
    targetNodeState: targetNodeDecision.state,
    admissionState:
      typeof options.admissionState === 'string' &&
        options.admissionState.length > 0 ?
        options.admissionState :
        typeof priorityRecoveryPlanningSnapshot?.admissionState === 'string' &&
          priorityRecoveryPlanningSnapshot.admissionState.length > 0 ?
          priorityRecoveryPlanningSnapshot.admissionState :
          null,
    admissionReasonCodes: Array.isArray(options.admissionReasonCodes) ?
      options.admissionReasonCodes :
      Array.isArray(priorityRecoveryPlanningSnapshot?.admissionReasonCodes) ?
        priorityRecoveryPlanningSnapshot.admissionReasonCodes :
        [],
    clusterIncarnationFence:
      options.clusterIncarnationFence &&
        typeof options.clusterIncarnationFence === 'object' ?
        options.clusterIncarnationFence :
        priorityRecoveryPlanningSnapshot?.clusterIncarnationFence &&
          typeof priorityRecoveryPlanningSnapshot.clusterIncarnationFence === 'object' ?
          priorityRecoveryPlanningSnapshot.clusterIncarnationFence :
          null,
    publisherNodeId: String(
      options.publisherNodeId || MEMBERSHIP_PUBLICATION_COORDINATOR_LITERAL.EMPTY,
    ),
    localNodeId: String(options.localNodeId || MEMBERSHIP_PUBLICATION_COORDINATOR_LITERAL.EMPTY),
    localNodeResponsive: options.localNodeResponsive === true,
    reasonCode:
      typeof options.reasonCode === 'string' && options.reasonCode.length > 0 ?
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
    publishedBaselineNodeIds.length > 0 ?
      {
        publication_epoch:
            latestPublishedPublicationRow?.publicationEpoch ??
            latestPublicationRow?.publicationEpoch ??
            1,
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
  if (!recoveryEpochsByNodeId || typeof recoveryEpochsByNodeId !== 'object') {
    return entries;
  }
  for (const [nodeId, history] of Object.entries(recoveryEpochsByNodeId)) {
    const epochs = Array.isArray(history) ? history : [];
    const latestEpoch = epochs[epochs.length - 1] || null;
    if (!latestEpoch || typeof latestEpoch !== 'object') {
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

function closeAcknowledgedMetadataRefreshRow(options = {}) {
  const publicationRow = options.publicationRow;
  if (!publicationRow || typeof publicationRow !== 'object') {
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
    normalizedPublication.publishedActiveNodeIds.length > 0 ?
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
    existingStates && typeof existingStates === 'object' ? existingStates : {};
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
    normalizePositiveInteger(candidate.publicationEpoch, 1) +
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
    publication_epoch: normalizePositiveInteger(candidate.publicationEpoch, 1),
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
      typeof candidate.priorityPartitionSummary === 'object' ?
        candidate.priorityPartitionSummary :
        null,
    membership_lifecycle_summary:
      candidate.membershipLifecycleSummary &&
      typeof candidate.membershipLifecycleSummary === 'object' ?
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
  const publicationOwnerStream = buildPublicationOwnerStreamState({
    publicationRevision: normalizedPublication.publicationEpoch,
    publicationStatus: normalizedPublication.status,
    requiredAckNodeIds: normalizedPublication.requiredAckNodeIds,
    acknowledgedNodeIds,
  });
  return Object.freeze({
    state: machineDecision.action,
    action: machineDecision.action,
    nextStatus: machineDecision.nextStatus,
    reasonCode: machineDecision.reasonCode,
    publicationOwnerStream,
    ackState: publicationOwnerStream.ackState,
    acknowledgementChanged,
    allAcknowledged:
      machineDecision.evidence.requiredAckCount > 0 &&
      machineDecision.evidence.pendingAckCount === 0,
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
      machineDecision.evidence.requiredAckCount > 0 &&
      machineDecision.evidence.pendingAckCount === 0,
    terminalPublication: machineDecision.evidence.terminalPublication,
    shouldClose:
      machineDecision.action ===
        PUBLICATION_RECOVERY_MACHINE_ACTION.CLOSE_ACK_COMPLETE,
    machineDecision,
  });
}

export {
  MEMBERSHIP_PUBLICATION_PLANNING_HELPERS,
  buildLatestRecoveryEpochByNodeId,
  buildLocalAuthoritativeMembershipReadOptions,
  buildMembershipPublicationAcknowledgementDecision,
  buildMembershipPublicationEvidenceSnapshot,
  buildMembershipPublicationRow,
  buildPublicationAcknowledgementReadOptions,
  buildPublicationListReadOptions,
  buildPublicationMetadataRefreshDecision,
  buildPublicationMetadataRefreshRow,
  buildPublicationReadOptions,
  buildServingMemberStatesByNodeId,
  comparePlanningEvidenceRows,
  closeAcknowledgedMetadataRefreshRow,
  countPlanningEvidenceRowFields,
  deriveMembershipPublicationCandidate,
  deriveMembershipPublicationId,
  hasExplicitMembershipPublicationTarget,
  mergePlanningEvidenceRows,
  mergePublicationRows,
  normalizeReplicaOperationView,
  normalizeTableRowsResult,
  resolveControlPlanePublicationsOwner,
  resolveMembershipEvidenceAuthoritativeReadMode,
  resolveMembershipPublicationReadProfile,
  resolveObservedActiveNodeIds,
  resolvePlanningEvidenceRowKey,
  resolvePlanningEvidenceRowVersion,
  serializeMembershipPublicationRow,
  shouldMergePlanningEvidenceRows,
  shouldPreferAuthoritativeMembershipState,
};
