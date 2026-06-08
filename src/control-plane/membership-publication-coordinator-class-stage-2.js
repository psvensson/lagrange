import {
  NUM,
  TABLES,
  TYPEOF,
} from '../constants/index.js';
import {MEMBERSHIP_PUBLICATION_PLANNING_SOURCE} from './control-plane-readiness-service.js';
import {
  CONTROL_PLANE_CONVERGENCE_CLASS,
} from './control-plane-error-classification.js';
import {normalizeControlPlanePublicationRow} from './system-row-normalizers.js';
import {publicationRowSatisfiesDesiredState} from './control-plane-publication-merge.js';
import {
  MEMBERSHIP_PUBLICATION_COORDINATOR_LITERAL,
  MEMBERSHIP_PUBLICATION_READ_PROFILE,
  MEMBERSHIP_PUBLICATION_STATUS,
  MEMBERSHIP_PUBLICATION_WORKFLOW_STEP,
  PUBLICATION_WORKFLOW_REASON,
  PUBLICATION_WRITE_MAX_ATTEMPTS,
  listEquals,
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
import {
  ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD,
  ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_OUTCOME,
  readActiveGateMembershipPublicationVisibleRow,
  readActiveGateMembershipPublicationVisibleReconcileRow,
  reconcileActiveGateMembershipPublication,
  shouldRouteActiveGateMembershipPublicationReconcile,
} from './membership-publication-active-gate-reconcile.js';
import {
  CONTROL_PLANE_CONVERGENCE_FIELD,
  CONTROL_PLANE_CRITICAL_CONVERGENCE_OPERATION,
  buildCriticalControlPlaneConvergenceOptions,
} from './membership-publication-control-plane-convergence.js';
import {buildPublicationActiveGateHandoffContract} from './publication-active-gate-handoff-contract.js';
import {isControlPlanePublicationsWriteLeader} from './control-plane-publications-leadership.js';

// Owner-driven membership liveness (Workstream A). A dedicated always-on interval
// — started UNCONDITIONALLY, independent of metadata-publication readiness so it
// cannot be gated behind the very progress it exists to create — drives the
// membership reconcile on the partition leader. Each drive is timeout-bounded so a
// slow/doomed reconcile can never wedge the in-flight guard.
const OWNER_MEMBERSHIP_DRIVER_INTERVAL_MS = 5000;
const OWNER_MEMBERSHIP_RECONCILE_TIMEOUT_MS = 15000;
const OWNER_MEMBERSHIP_DRIVER_ERROR_MSG =
  'Owner-driven membership reconcile error';
// B4 tripwire: owner-driven membership assumes control_plane_publications is a
// single partition (one Raft leader = one authoritative writer = single source of
// truth). B1 enforces non-splittable, but if that ever regressed this surfaces it
// loudly instead of silently splitting the brain across fragments.
const MEMBERSHIP_MULTI_PARTITION_MSG =
  'CRITICAL: control_plane_publications has >1 partition — membership ' +
  'single-source-of-truth assumption violated (see B1 non-split policy)';

const MEMBERSHIP_RECONCILE_DEFERRED_NOT_WRITE_LEADER_MSG =
  'Membership reconcile deferred: not the control_plane_publications write-leader';
const NOT_PUBLICATIONS_WRITE_LEADER_REASON = 'not_publications_write_leader';

// Phase 4: defer the membership reconcile when leader-driven mode is enabled and
// this node is NOT the control_plane_publications write-leader. Fail OPEN — never
// block a reconcile on a missing/throwing predicate or when the flag is off, so
// default behavior is unchanged.
function shouldDeferMembershipReconcileToWriteLeader(coordinator) {
  if (coordinator.membershipLeaderDrivenEnabled !== true) {
    return false;
  }
  if (
    typeof coordinator.resolveIsControlPlanePublicationsWriteLeader !==
    TYPEOF.FUNCTION
  ) {
    return false;
  }
  try {
    return coordinator.resolveIsControlPlanePublicationsWriteLeader() !== true;
  } catch {
    return false;
  }
}

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
      options.deferNestedPriorityRecoveryPlanning === true ?
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
    const ownerKey =
      options[CONTROL_PLANE_CONVERGENCE_FIELD
        .CONTROL_PLANE_CONVERGENCE_OWNER_KEY] || this.buildOwnerKey();
    const publicationOptions = buildCriticalControlPlaneConvergenceOptions(
      options,
      {
        ownerKey,
        operation:
          options[CONTROL_PLANE_CONVERGENCE_FIELD
            .CONTROL_PLANE_CONVERGENCE_OPERATION] ||
          CONTROL_PLANE_CRITICAL_CONVERGENCE_OPERATION.MEMBERSHIP_PUBLICATION,
      },
    );
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
            buildPublicationReadOptions(publicationOptions),
          );
          persistedRow = serializeMembershipPublicationRow(
            mergePublicationRows(persistedRow, currentRow),
          );
        }
        try {
          await this.controlPlanePublicationsOwner.upsertPublication(
            persistedRow,
            publicationOptions,
          );
        } catch (error) {
          if (!canVerifyPersistedRow || attempt + NUM.ONE >= maxAttempts) {
            throw error;
          }
          const durableRow = await this.controlPlanePublicationsOwner.getPublication(
            publicationId,
            buildPublicationReadOptions(publicationOptions),
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
          buildPublicationReadOptions(publicationOptions),
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
    const acknowledgementOwnerKey = `${this.buildOwnerKey()}:ack:${publicationId}`;
    const acknowledgementOptions = buildCriticalControlPlaneConvergenceOptions(
      options,
      {
        ownerKey: acknowledgementOwnerKey,
        operation: CONTROL_PLANE_CRITICAL_CONVERGENCE_OPERATION.PUBLICATION_ACK,
      },
    );
    return this.publicationAcknowledgementLane.run(
      {
        ownerKey: acknowledgementOwnerKey,
        [CONTROL_PLANE_CONVERGENCE_FIELD.CONTROL_PLANE_CONVERGENCE_CLASS]:
          CONTROL_PLANE_CONVERGENCE_CLASS.CRITICAL,
      },
      async () => {
        let existingRow = null;
        if (
          this.controlPlanePublicationsOwner &&
          typeof this.controlPlanePublicationsOwner.getPublication === TYPEOF.FUNCTION
        ) {
          existingRow = await this.controlPlanePublicationsOwner.getPublication(
            publicationId,
            buildPublicationReadOptions(acknowledgementOptions),
          );
        }
        const baseRow = mergePublicationRows(
          existingRow,
          acknowledgementOptions.publicationRow || null,
        );
        if (!baseRow) {
          return null;
        }
        const normalizedBaseRow = normalizeControlPlanePublicationRow(baseRow);
        const acknowledgedRow = acknowledgeMembershipPublication({
          publicationRow: baseRow,
          nodeId,
          nowMs: this.now(),
          timeoutMs: acknowledgementOptions.timeoutMs,
          timeoutReasonCode: acknowledgementOptions.timeoutReasonCode,
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
        return this.persistPublicationRow(acknowledgedRow, acknowledgementOptions);
      },
    );
  }

  async reconcileClusterMembership(options = {}) {
    const ownerKey = this.buildOwnerKey();
    if (shouldDeferMembershipReconcileToWriteLeader(this)) {
      this.logger?.info?.(
        MEMBERSHIP_RECONCILE_DEFERRED_NOT_WRITE_LEADER_MSG,
        {nodeId: this.nodeId, ownerKey},
      );
      return {
        deferred: true,
        reason: NOT_PUBLICATIONS_WRITE_LEADER_REASON,
        ownerKey,
      };
    }
    const convergenceOptions = buildCriticalControlPlaneConvergenceOptions(
      options,
      {
        ownerKey,
        operation:
          CONTROL_PLANE_CRITICAL_CONVERGENCE_OPERATION.MEMBERSHIP_PUBLICATION,
      },
    );
    if (shouldRouteActiveGateMembershipPublicationReconcile(
      convergenceOptions,
    )) {
      return this.reconcileActiveGateMembershipPublication(
        convergenceOptions[
          ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD
            .PUBLICATION_ACTIVE_GATE_HANDOFF
        ],
        convergenceOptions,
      );
    }
    return this.publicationReconcileLane.run(
      {
        ownerKey,
        [CONTROL_PLANE_CONVERGENCE_FIELD.CONTROL_PLANE_CONVERGENCE_CLASS]:
          CONTROL_PLANE_CONVERGENCE_CLASS.CRITICAL,
      },
      async () =>
        this.workflowCoordinator.runExclusive(ownerKey, async () => {
          const latestPublicationRow =
            convergenceOptions.latestPublicationRow ||
            (await this.getLatestPublicationRow(convergenceOptions));
          const latestPublishedPublicationRow =
            convergenceOptions.latestPublishedPublicationRow ||
            (String(latestPublicationRow?.status || '').toUpperCase() ===
            MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED ?
              latestPublicationRow :
              await this.getLatestPublishedPublicationRow(convergenceOptions));
          const candidate = await this.deriveClusterMembershipCandidate({
            ...convergenceOptions,
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
              const persistedRow = await this.persistPublicationRow(
                refreshedRow,
                convergenceOptions,
              );
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
          const persistedRow = await this.persistPublicationRow(
            row,
            convergenceOptions,
          );
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
    return readActiveGateMembershipPublicationVisibleRow(
      this,
      publicationRow,
      target,
      context,
    );
  }

  async readActiveGateMembershipPublicationVisibleReconcileRow(
    reconcileOutcome,
    target,
    context,
  ) {
    return readActiveGateMembershipPublicationVisibleReconcileRow(
      this,
      reconcileOutcome,
      target,
      context,
    );
  }

  async reconcileActiveGateMembershipPublication(
    publicationActiveGateHandoff,
    options = {},
  ) {
    return reconcileActiveGateMembershipPublication(
      this,
      publicationActiveGateHandoff,
      options,
    );
  }

  getControlPlaneOwnerQueueDepth() {
    const ownerKey = this.buildOwnerKey();
    const queueDiagnostics =
      typeof this.reconcileQueue?.getDiagnostics === TYPEOF.FUNCTION ?
        this.reconcileQueue.getDiagnostics() :
        null;
    const pendingKeys = Array.isArray(queueDiagnostics?.pendingKeys) ?
      queueDiagnostics.pendingKeys.map(String) :
      (
        this.reconcileQueue?.pending instanceof Map ?
          [...this.reconcileQueue.pending.keys()].map(String) :
          []
      );
    const retryingKeys = Array.isArray(queueDiagnostics?.retryingKeys) ?
      queueDiagnostics.retryingKeys.map(String) :
      (
        this.reconcileQueue?.retryWorkItems instanceof Map ?
          [...this.reconcileQueue.retryWorkItems.keys()].map(String) :
          []
      );
    const inFlightKeys = Array.isArray(queueDiagnostics?.inFlightKeys) ?
      queueDiagnostics.inFlightKeys.map(String) :
      (
        this.reconcileQueue?.inFlight instanceof Set ?
          [...this.reconcileQueue.inFlight].map(String) :
          []
      );
    const pendingWrites = [
      pendingKeys.includes(ownerKey),
      retryingKeys.includes(ownerKey),
      inFlightKeys.includes(ownerKey),
    ].filter(Boolean).length;
    const retryableDrainFailureCount = Number.isFinite(
      queueDiagnostics?.retryableDrainFailureCount,
    ) ?
      Math.max(NUM.ZERO, Math.floor(
        queueDiagnostics.retryableDrainFailureCount,
      )) :
      NUM.ZERO;
    return Object.freeze({
      pendingWrites,
      pendingWriteGrowthCount: NUM.ZERO,
      retainedBacklogGrowthCount:
        retryingKeys.includes(ownerKey) ? NUM.ONE : NUM.ZERO,
      sharedPressureBackpressured: false,
      transportPressureBackpressured: false,
      queryPressureBackpressured: false,
      ownerKey,
      pendingKeys,
      retryingKeys,
      inFlightKeys,
      retryableDrainFailureCount,
    });
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

  /**
   * Owner-driven membership reconcile (Workstream A). When this node is the
   * control_plane_publications write-leader and active nodes are unpublished,
   * drive the authoritative reconcile locally (Raft-quorum-committed). Timeout-
   * bounded so a slow/doomed reconcile can never wedge the in-flight guard.
   * @return {Promise<boolean>} whether a reconcile was driven.
   */
  async driveOwnerMembershipReconcile() {
    if (this.ownerMembershipReconcileInFlight === true) {
      return false;
    }
    if (
      !isControlPlanePublicationsWriteLeader(this.systemTableCache, this.nodeId)
    ) {
      return false;
    }
    this.assertSingleMembershipPartition();
    this.ownerMembershipReconcileInFlight = true;
    try {
      const planningSnapshot = await this.readPublicationPlanningSnapshot({
        preferAuthoritativeRead: true,
      });
      if (!planningSnapshot) {
        return false;
      }
      const latestPublishedRow = planningSnapshot.latestPublishedPublicationRow;
      const latestRow = planningSnapshot.latestPublicationRow;
      const publicationEpoch =
        latestPublishedRow?.publicationEpoch ??
        latestRow?.publicationEpoch ??
        0;
      const publishedActiveNodeIds =
        latestPublishedRow?.publishedActiveNodeIds ??
        latestRow?.publishedActiveNodeIds ??
        [];
      const handoffContract = buildPublicationActiveGateHandoffContract({
        nodeRows: planningSnapshot.nodeRows,
        readinessByNodeId: planningSnapshot.readinessByNodeId,
        publicationConvergence: {publicationEpoch, publishedActiveNodeIds},
      });
      const missingCount = handoffContract?.missingPublishedCount ?? 0;
      if (missingCount <= 0) {
        return false;
      }
      let timer = null;
      await Promise.race([
        this.reconcileActiveGateMembershipPublication(handoffContract, {
          reconcileAuthoritativeMembershipPublication: true,
        }),
        new Promise((resolve) => {
          timer = setTimeout(resolve, OWNER_MEMBERSHIP_RECONCILE_TIMEOUT_MS);
        }),
      ]);
      if (timer) {
        clearTimeout(timer);
      }
      return true;
    } catch (error) {
      this.logger?.error?.(OWNER_MEMBERSHIP_DRIVER_ERROR_MSG, {
        nodeId: this.nodeId,
        message: error?.message,
      });
      return false;
    } finally {
      this.ownerMembershipReconcileInFlight = false;
    }
  }

  /**
   * B4 tripwire: assert control_plane_publications resolves to a single partition.
   * One-time (until violated). Never throws / never affects behavior.
   * @private
   */
  assertSingleMembershipPartition() {
    if (this.membershipSinglePartitionAsserted === true) {
      return;
    }
    try {
      const partitions = this.systemTableCache?.getAll?.(TABLES.PARTITIONS) || [];
      const pubPartitions = partitions.filter(
        (p) =>
          p.table_id === TABLES.CONTROL_PLANE_PUBLICATIONS ||
          p.table_name === TABLES.CONTROL_PLANE_PUBLICATIONS,
      );
      if (pubPartitions.length > 1) {
        this.logger?.error?.(MEMBERSHIP_MULTI_PARTITION_MSG, {
          nodeId: this.nodeId,
          partitionCount: pubPartitions.length,
          partitionIds: pubPartitions.map((p) => p.partition_id),
        });
        return;
      }
      if (pubPartitions.length === 1) {
        this.membershipSinglePartitionAsserted = true;
      }
    } catch {
      // tripwire must never affect behavior
    }
  }

  /**
   * Start the always-on owner-membership driver. MUST be called UNCONDITIONALLY
   * at node startup — never behind metadata-publication readiness, or it can be
   * gated behind the very progress it exists to create. No-op unless leader-driven
   * mode is enabled.
   */
  startOwnerMembershipDriver(options = {}) {
    if (this.ownerMembershipDriverTimer) {
      return;
    }
    const enabled =
      options.enabled ??
      process.env.LAGRANGE_MEMBERSHIP_LEADER_DRIVEN === 'true';
    if (!enabled) {
      return;
    }
    const intervalMs =
      options.intervalMs || OWNER_MEMBERSHIP_DRIVER_INTERVAL_MS;
    const setIntervalFn =
      typeof options.setIntervalFn === TYPEOF.FUNCTION ?
        options.setIntervalFn :
        setInterval;
    this.ownerMembershipDriverTimer = setIntervalFn(() => {
      this.driveOwnerMembershipReconcile().catch(() => {});
    }, intervalMs);
    if (typeof this.ownerMembershipDriverTimer?.unref === TYPEOF.FUNCTION) {
      this.ownerMembershipDriverTimer.unref();
    }
  }

  stopOwnerMembershipDriver() {
    if (this.ownerMembershipDriverTimer) {
      clearInterval(this.ownerMembershipDriverTimer);
      this.ownerMembershipDriverTimer = null;
    }
  }
}

export {
  ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_OUTCOME,
  MembershipPublicationCoordinatorClassStage2,
  shouldDeferMembershipReconcileToWriteLeader,
  NOT_PUBLICATIONS_WRITE_LEADER_REASON,
};
