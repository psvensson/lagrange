import {
  NUM,
  TABLES,
  TYPEOF,
} from '../constants/index.js';
import {MEMBERSHIP_PUBLICATION_PLANNING_SOURCE} from './control-plane-readiness-service.js';
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
            const shouldRefreshAcknowledgements =
              hasCandidateAcknowledgementRefresh(latestPublicationRow, candidate);
            const shouldRefreshStatus =
              hasCandidateStatusRefresh(latestPublicationRow, candidate);
            if (
              shouldRefreshPriorityMetadata ||
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
}

export {MembershipPublicationCoordinatorClassStage2};
