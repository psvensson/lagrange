import {
  NUM,
  TABLES,
  TYPEOF,
} from '../constants/index.js';
import {MEMBERSHIP_PUBLICATION_PLANNING_SOURCE} from './control-plane-readiness-service.js';
import {
  CONTROL_PLANE_FAILURE_REASON,
  getControlPlaneFailureSummary,
  getControlPlaneRetryAfterMs,
  isRetryableControlPlaneError,
} from './control-plane-error-classification.js';
import {normalizeControlPlanePublicationRow} from './system-row-normalizers.js';
import {publicationRowSatisfiesDesiredState} from './control-plane-publication-merge.js';
import {
  resolvePublicationActiveGateMembershipPublicationTarget,
} from './publication-active-gate-handoff-contract.js';
import {
  MEMBERSHIP_PUBLICATION_COORDINATOR_LITERAL,
  MEMBERSHIP_PUBLICATION_READ_PROFILE,
  MEMBERSHIP_PUBLICATION_STATUS,
  MEMBERSHIP_PUBLICATION_WORKFLOW_STEP,
  PUBLICATION_WORKFLOW_REASON,
  PUBLICATION_WRITE_MAX_ATTEMPTS,
  listEquals,
  normalizeNodeIdList,
  normalizePositiveInteger,
} from './membership-publication-coordinator-stage-1.js';
import {
  buildMembershipPublicationEvidenceSnapshot,
  buildMembershipPublicationRow,
  buildPublicationMetadataRefreshRow,
  buildPublicationReadOptions,
  deriveMembershipPublicationCandidate,
  hasExplicitMembershipPublicationTarget,
  mergePublicationRows,
  serializeMembershipPublicationRow,
  shouldPreferAuthoritativeMembershipState,
} from './membership-publication-coordinator-stage-2.js';
import {acknowledgeMembershipPublication} from './membership-publication-coordinator-stage-3.js';
import {MembershipPublicationCoordinatorClassStage1} from './membership-publication-coordinator-class-stage-1.js';

function hasCandidateAcknowledgementRefresh(latestPublicationRow, candidate = {}) {
  const normalizedLatestPublication =
    normalizeControlPlanePublicationRow(latestPublicationRow);
  return Array.isArray(candidate.acknowledgedNodeIds) &&
    !listEquals(
      normalizedLatestPublication.acknowledgedNodeIds,
      candidate.acknowledgedNodeIds,
    );
}

function hasCandidateStatusRefresh(latestPublicationRow, candidate = {}) {
  const normalizedLatestPublication =
    normalizeControlPlanePublicationRow(latestPublicationRow);
  const candidateStatus =
    typeof candidate.publicationStatus === TYPEOF.STRING ?
      candidate.publicationStatus.toUpperCase() :
      MEMBERSHIP_PUBLICATION_COORDINATOR_LITERAL.EMPTY;
  return candidateStatus.length > NUM.ZERO &&
    candidateStatus !== normalizedLatestPublication.status;
}

const ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_SCHEMA_VERSION = 1;
const ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_REASON =
  'active_gate_handoff_owner_reconcile';
const ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_READ_PROFILE =
  'diagnostics';
const ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_EMPTY_TEXT = '';
const ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_ALLOW_EMPTY_PRELOADED_ROWS =
  true;
const ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_EMPTY_ROWS = Object.freeze(
  [],
);
const ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_OUTCOME = Object.freeze({
  NO_CHANGE: 'no_change',
  PRESSURE_DEFERRED: 'pressure_deferred',
  PUBLISHED_VISIBLE: 'published_visible',
  TARGET_BLOCKED: 'target_blocked',
  WRITE_DEFERRED: 'write_deferred',
});
const ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_WRITE_DEFERRED_FRAGMENTS =
  Object.freeze([
    'readback',
  ]);
const ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_FIELD = Object.freeze({
  DISABLE_NESTED_PRIORITY_RECOVERY_PLANNING:
    'disableNestedPriorityRecoveryPlanning',
  PUBLICATION_ROW: 'publicationRow',
  PUBLICATION_CONVERGENCE: 'publicationConvergence',
  PUBLISHED_MEMBERSHIP_OBSERVATION: 'publishedMembershipObservation',
});
const ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD =
  Object.freeze({
    ACKNOWLEDGED_NODE_IDS: 'acknowledgedNodeIds',
    ALLOW_EMPTY_PRELOADED_ROWS: 'allowEmptyPreloadedRows',
    ALLOW_PENDING_VISIBILITY: 'allowPendingVisibility',
    ALLOW_PRESSURE_DEFER: 'allowPressureDefer',
    DISABLE_NESTED_PRIORITY_RECOVERY_PLANNING:
      'disableNestedPriorityRecoveryPlanning',
    LATEST_PUBLICATION_ROW: 'latestPublicationRow',
    NODE_ENDPOINT_ROWS: 'nodeEndpointRows',
    NODE_ROWS: 'nodeRows',
    PARTITION_ROWS: 'partitionRows',
    PUBLISHED_ACTIVE_NODE_IDS: 'publishedActiveNodeIds',
    PUBLICATION_ACTIVE_GATE_HANDOFF: 'publicationActiveGateHandoff',
    READ_PROFILE: 'readProfile',
    READINESS_ENTRIES: 'readinessEntries',
    REPLICA_OPERATION_ROWS: 'replicaOperationRows',
    REQUIRED_ACK_NODE_IDS: 'requiredAckNodeIds',
    SERVICE_ROWS: 'serviceRows',
    SKIP_PUBLICATION_WRITE_READBACK: 'skipPublicationWriteReadback',
  });

function selectLatestActiveGateMembershipPublicationRow(rows = []) {
  const normalizedRows = (Array.isArray(rows) ? rows : [])
    .map((row) => {
      if (!row || typeof row !== TYPEOF.OBJECT) {
        return null;
      }
      return normalizeControlPlanePublicationRow(
        row[
          ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_FIELD.PUBLICATION_ROW
        ] || row,
      );
    })
    .filter((row) =>
      row &&
      (
        row.publicationId ||
        row.publicationEpoch ||
        row.status ||
        normalizeNodeIdList(row.publishedActiveNodeIds).length > NUM.ZERO
      ),
    );
  if (normalizedRows.length === NUM.ZERO) {
    return null;
  }
  normalizedRows.sort((left, right) => {
    const epochDelta =
      (right.publicationEpoch || NUM.ZERO) -
      (left.publicationEpoch || NUM.ZERO);
    if (epochDelta !== NUM.ZERO) {
      return epochDelta;
    }
    return (
      (right.updatedAt || right.publishedAt || NUM.ZERO) -
      (left.updatedAt || left.publishedAt || NUM.ZERO)
    );
  });
  return normalizedRows[NUM.ZERO] || null;
}

function resolveActiveGateMembershipPublicationLatestRow(
  publicationActiveGateHandoff,
) {
  if (
    !publicationActiveGateHandoff ||
    typeof publicationActiveGateHandoff !== TYPEOF.OBJECT ||
    Array.isArray(publicationActiveGateHandoff)
  ) {
    return null;
  }
  const publicationConvergence =
    publicationActiveGateHandoff[
      ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_FIELD
        .PUBLICATION_CONVERGENCE
    ];
  return selectLatestActiveGateMembershipPublicationRow([
    publicationActiveGateHandoff[
      ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_FIELD
        .PUBLISHED_MEMBERSHIP_OBSERVATION
    ],
    publicationConvergence,
    publicationConvergence?.[
      ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_FIELD
        .PUBLISHED_MEMBERSHIP_OBSERVATION
    ],
  ]);
}

function resolveActiveGateMembershipPublicationPreloadedRows(
  options,
  fieldName,
) {
  const rows = options[fieldName];
  return Array.isArray(rows) ?
    rows :
    ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_EMPTY_ROWS;
}

function activeGateMembershipPublicationNodeListContainsAll(
  observedValues,
  targetValues,
) {
  const observedNodeIds = new Set(normalizeNodeIdList(observedValues));
  return normalizeNodeIdList(targetValues).every((nodeId) =>
    observedNodeIds.has(nodeId),
  );
}

function isActiveGateMembershipPublicationRowVisibleForTarget(
  publicationRow,
  target,
) {
  const normalizedRow = normalizeControlPlanePublicationRow(publicationRow);
  const targetPublishedNodeIds = normalizeNodeIdList(
    target?.publishedActiveNodeIds,
  );
  if (
    targetPublishedNodeIds.length === NUM.ZERO ||
    normalizedRow.status !== MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED
  ) {
    return false;
  }
  return (
    activeGateMembershipPublicationNodeListContainsAll(
      normalizedRow.publishedActiveNodeIds,
      targetPublishedNodeIds,
    ) &&
    activeGateMembershipPublicationNodeListContainsAll(
      normalizedRow.requiredAckNodeIds,
      target?.requiredAckNodeIds,
    ) &&
    activeGateMembershipPublicationNodeListContainsAll(
      normalizedRow.acknowledgedNodeIds,
      target?.acknowledgedNodeIds,
    )
  );
}

function buildActiveGateMembershipPublicationReconcileContext({
  publicationActiveGateHandoff,
  target,
  options,
}) {
  const latestPublicationRow =
    resolveActiveGateMembershipPublicationLatestRow(
      publicationActiveGateHandoff,
    );
  return {
    ...options,
    preferAuthoritativeRead: true,
    [ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD
      .PUBLISHED_ACTIVE_NODE_IDS]: [...target.publishedActiveNodeIds],
    [ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD
      .REQUIRED_ACK_NODE_IDS]: [...target.requiredAckNodeIds],
    [ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD
      .ACKNOWLEDGED_NODE_IDS]: [...target.acknowledgedNodeIds],
    [ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD
      .ALLOW_PENDING_VISIBILITY]: true,
    [ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD
      .ALLOW_PRESSURE_DEFER]: false,
    [ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD
      .ALLOW_EMPTY_PRELOADED_ROWS]:
      ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_ALLOW_EMPTY_PRELOADED_ROWS,
    [ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD.READ_PROFILE]:
      ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_READ_PROFILE,
    [ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD
      .DISABLE_NESTED_PRIORITY_RECOVERY_PLANNING]: true,
    [ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD.NODE_ROWS]:
      resolveActiveGateMembershipPublicationPreloadedRows(
        options,
        ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD.NODE_ROWS,
      ),
    [ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD
      .NODE_ENDPOINT_ROWS]:
      resolveActiveGateMembershipPublicationPreloadedRows(
        options,
        ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD
          .NODE_ENDPOINT_ROWS,
      ),
    [ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD.SERVICE_ROWS]:
      resolveActiveGateMembershipPublicationPreloadedRows(
        options,
        ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD
          .SERVICE_ROWS,
      ),
    [ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD.PARTITION_ROWS]:
      resolveActiveGateMembershipPublicationPreloadedRows(
        options,
        ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD
          .PARTITION_ROWS,
      ),
    [ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD
      .REPLICA_OPERATION_ROWS]:
      resolveActiveGateMembershipPublicationPreloadedRows(
        options,
        ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD
          .REPLICA_OPERATION_ROWS,
      ),
    [ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD
      .READINESS_ENTRIES]:
      resolveActiveGateMembershipPublicationPreloadedRows(
        options,
        ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD
          .READINESS_ENTRIES,
      ),
    [ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD
      .PUBLICATION_ACTIVE_GATE_HANDOFF]: publicationActiveGateHandoff,
    [ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD
      .SKIP_PUBLICATION_WRITE_READBACK]: false,
    ...(latestPublicationRow ?
      {
        [ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD
          .LATEST_PUBLICATION_ROW]: latestPublicationRow,
      } :
      {}),
  };
}

function buildActiveGateMembershipPublicationReconcileOutcome(
  state,
  options = {},
) {
  const publicationRow =
    options.publicationRow && typeof options.publicationRow === TYPEOF.OBJECT ?
      normalizeControlPlanePublicationRow(options.publicationRow) :
      null;
  return Object.freeze({
    schemaVersion: ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_SCHEMA_VERSION,
    state,
    target: options.target || null,
    publicationRow,
    enqueued: options.enqueued === true,
    ...(Number.isFinite(options.retryAfterMs) && options.retryAfterMs > NUM.ZERO ?
      {retryAfterMs: Math.floor(options.retryAfterMs)} :
      {}),
    ...(typeof options.reasonCode === TYPEOF.STRING &&
      options.reasonCode.length > NUM.ZERO ?
      {reasonCode: options.reasonCode} :
      {}),
  });
}

function resolveActiveGateMembershipPublicationErrorOutcome(error) {
  if (error?.activeGateMembershipPublicationReadbackFailed === true) {
    return ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_OUTCOME.WRITE_DEFERRED;
  }
  const errorMessage = String(error?.message || error || '');
  if (
    ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_WRITE_DEFERRED_FRAGMENTS
      .some((fragment) => errorMessage.includes(fragment))
  ) {
    return ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_OUTCOME.WRITE_DEFERRED;
  }
  const failureSummary = getControlPlaneFailureSummary(error);
  if (
    failureSummary.primaryReason === CONTROL_PLANE_FAILURE_REASON
      .PRESSURE_DEGRADED
  ) {
    return ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_OUTCOME
      .PRESSURE_DEFERRED;
  }
  if (isRetryableControlPlaneError(error)) {
    return ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_OUTCOME.WRITE_DEFERRED;
  }
  return ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_EMPTY_TEXT;
}

class MembershipPublicationCoordinatorClassStage2 extends
  MembershipPublicationCoordinatorClassStage1 {
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
    const preferAuthoritativeMembershipState =
      hasExplicitMembershipPublicationTarget(options) !== true &&
      shouldPreferAuthoritativeMembershipState({
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
              .getMembershipPublicationPlanningSnapshotBestEffort === TYPEOF.FUNCTION ?
          await this.controlPlaneReadinessService.getMembershipPublicationPlanningSnapshotBestEffort(
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
            const shouldRefreshPriorityMetadata =
              candidate.priorityPartitionSummaryChanged === true &&
              ((candidate.priorityPartitionSummary &&
                typeof candidate.priorityPartitionSummary === TYPEOF.OBJECT) ||
              (candidate.membershipLifecycleSummary &&
                typeof candidate.membershipLifecycleSummary === TYPEOF.OBJECT));
            const shouldRefreshMembershipLifecycleMetadata =
              candidate.membershipLifecycleSummaryChanged === true &&
              candidate.membershipLifecycleSummary &&
              typeof candidate.membershipLifecycleSummary === TYPEOF.OBJECT;
            const shouldRefreshAcknowledgements =
              hasCandidateAcknowledgementRefresh(latestPublicationRow, candidate);
            const shouldRefreshStatus =
              hasCandidateStatusRefresh(latestPublicationRow, candidate);
            if (
              shouldRefreshPriorityMetadata ||
              shouldRefreshMembershipLifecycleMetadata ||
              shouldRefreshAcknowledgements ||
              shouldRefreshStatus
            ) {
              const refreshedRow = buildPublicationMetadataRefreshRow({
                publicationRow: latestPublicationRow,
                priorityPartitionSummary: candidate.priorityPartitionSummary,
                membershipLifecycleSummary: candidate.membershipLifecycleSummary,
                acknowledgedNodeIds: candidate.acknowledgedNodeIds,
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
          const persistedRow = await this.persistPublicationRow(row, options);
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
            publicationRow: normalizeControlPlanePublicationRow(persistedRow),
            workflow,
          };
        }),
    );
  }

  async readActiveGateMembershipPublicationVisibleRow(
    publicationRow,
    target,
    context,
  ) {
    const normalizedPublicationRow =
      normalizeControlPlanePublicationRow(publicationRow);
    if (
      !normalizedPublicationRow.publicationId ||
      !this.controlPlanePublicationsOwner ||
      typeof this.controlPlanePublicationsOwner.getPublication !==
        TYPEOF.FUNCTION
    ) {
      return null;
    }
    let durableRow = null;
    try {
      durableRow = await this.controlPlanePublicationsOwner.getPublication(
        normalizedPublicationRow.publicationId,
        buildPublicationReadOptions({
          ...context,
          preferAuthoritativeRead: true,
        }),
      );
    } catch (error) {
      error.activeGateMembershipPublicationReadbackFailed = true;
      throw error;
    }
    return isActiveGateMembershipPublicationRowVisibleForTarget(
      durableRow,
      target,
    ) ?
      normalizeControlPlanePublicationRow(durableRow) :
      null;
  }

  async reconcileActiveGateMembershipPublication(
    publicationActiveGateHandoff,
    options = {},
  ) {
    const target = resolvePublicationActiveGateMembershipPublicationTarget(
      publicationActiveGateHandoff,
    );
    if (target.reconcileRequired !== true) {
      return buildActiveGateMembershipPublicationReconcileOutcome(
        target.handoffContract ?
          ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_OUTCOME.TARGET_BLOCKED :
          ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_OUTCOME.NO_CHANGE,
        {target},
      );
    }
    const context = buildActiveGateMembershipPublicationReconcileContext({
      publicationActiveGateHandoff,
      target,
      options,
    });
    try {
      const reconcileOutcome = await this.reconcileClusterMembership(context);
      const visibleRow =
        await this.readActiveGateMembershipPublicationVisibleRow(
          reconcileOutcome?.publicationRow,
          target,
          context,
        );
      if (visibleRow) {
        return buildActiveGateMembershipPublicationReconcileOutcome(
          ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_OUTCOME
            .PUBLISHED_VISIBLE,
          {publicationRow: visibleRow, target},
        );
      }
      const enqueued = this.enqueueClusterMembershipReconcile(
        ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_REASON,
        context,
      );
      return buildActiveGateMembershipPublicationReconcileOutcome(
        ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_OUTCOME.WRITE_DEFERRED,
        {
          publicationRow: reconcileOutcome?.publicationRow || null,
          target,
          enqueued,
        },
      );
    } catch (error) {
      const deferredOutcome =
        resolveActiveGateMembershipPublicationErrorOutcome(error);
      if (!deferredOutcome) {
        throw error;
      }
      const enqueued = this.enqueueClusterMembershipReconcile(
        ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_REASON,
        context,
      );
      return buildActiveGateMembershipPublicationReconcileOutcome(
        deferredOutcome,
        {
          target,
          enqueued,
          retryAfterMs: getControlPlaneRetryAfterMs(error),
        },
      );
    }
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
}

export {
  ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_OUTCOME,
  MembershipPublicationCoordinatorClassStage2,
};
