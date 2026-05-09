import {OperationWorkflowOwnerSegment5Stage1} from './operation-workflow-owner-segment-5-stage-1.js';
import {OPERATION_WORKFLOW_OWNER_SEGMENT_5_STAGE_SHARED as SHARED} from './operation-workflow-owner-segment-5-stage-shared.js';

const {
  DEFAULT_MIN_REPLICA_COUNT,
  INITIAL_PARTITION_IDS,
  NUM,
  OPERATION_WORKFLOW_OWNER_LITERAL,
  REMOVE_SAFETY_READ_QUERY_OPTIONS,
  REMOVE_SAFETY_SQL,
  SERVICE_TYPE,
  SYSTEM_TABLE_NAME,
  TYPEOF,
  isPriorityControlPlanePartition,
  normalizePriorityRecoveryOperationPartitionId,
  readAuthoritativeControlPlaneRows,
} = SHARED;

class OperationWorkflowOwnerSegment5Stage2 extends OperationWorkflowOwnerSegment5Stage1 {
  mergeReplicaRowsForSafety(authoritativeRows, cachedRows) {
    const mergedRowsById = new Map();
    const mergeDefinedReplicaRowFields = (baseRow, incomingRow) => {
      const mergedRow = {
        ...(baseRow || {}),
      };
      for (const [fieldName, fieldValue] of Object.entries(incomingRow || {})) {
        if (fieldValue === null || fieldValue === undefined) {
          continue;
        }
        mergedRow[fieldName] = fieldValue;
      }
      return mergedRow;
    };
    const appendRow = (row, preferIncoming = false) => {
      if (!row || typeof row !== TYPEOF.OBJECT) {
        return;
      }
      const rowId = this.getReplicaRowIdentity(row);
      if (!rowId) {
        mergedRowsById.set(Symbol('service_row'), {...row});
        return;
      }
      if (!preferIncoming || !mergedRowsById.has(rowId)) {
        mergedRowsById.set(rowId, {...row});
        return;
      }
      mergedRowsById.set(
        rowId,
        mergeDefinedReplicaRowFields(mergedRowsById.get(rowId), row),
      );
    };
    for (const cachedRow of cachedRows) {
      appendRow(cachedRow, false);
    }
    for (const authoritativeRow of authoritativeRows) {
      appendRow(authoritativeRow, true);
    }
    return [...mergedRowsById.values()];
  }

  async getCriticalReplicaRowsForSafety(partitionId) {
    const cachedRows = this.getCachedCriticalReplicaRows(partitionId);
    const gateway = this.repository?.controlPlaneSystemTableGateway;
    if (!gateway) {
      return cachedRows;
    }
    try {
      const result = await readAuthoritativeControlPlaneRows(
        gateway,
        SYSTEM_TABLE_NAME.SERVICES,
        REMOVE_SAFETY_SQL.SELECT_PARTITION_REPLICA_ROWS,
        [SERVICE_TYPE.PARTITION, partitionId],
        REMOVE_SAFETY_READ_QUERY_OPTIONS,
      );
      if (
        !result?.success ||
        !Array.isArray(result.rows) ||
        result.rows.length === NUM.ZERO
      ) {
        return cachedRows;
      }
      return this.mergeReplicaRowsForSafety(result.rows, cachedRows);
    } catch {
      return cachedRows;
    }
  }

  getCachedCriticalPartitionRow(partitionId) {
    const systemTableCache = this.repository.systemTableCache;
    if (
      !partitionId ||
      !systemTableCache ||
      typeof systemTableCache.get !== TYPEOF.FUNCTION
    ) {
      return null;
    }
    return (
      systemTableCache.get(SYSTEM_TABLE_NAME.PARTITIONS, partitionId) || null
    );
  }

  mergePartitionRowForSafety(authoritativeRow, cachedRow) {
    if (!cachedRow && !authoritativeRow) {
      return null;
    }
    return {
      ...(cachedRow || {}),
      ...(authoritativeRow || {}),
    };
  }

  async getCriticalPartitionRowForSafety(partitionId) {
    const cachedRow = this.getCachedCriticalPartitionRow(partitionId);
    const gateway = this.repository?.controlPlaneSystemTableGateway;
    if (!partitionId || !gateway) {
      return cachedRow;
    }
    try {
      const result = await readAuthoritativeControlPlaneRows(
        gateway,
        SYSTEM_TABLE_NAME.PARTITIONS,
        REMOVE_SAFETY_SQL.SELECT_PARTITION_ROW,
        [partitionId],
        REMOVE_SAFETY_READ_QUERY_OPTIONS,
      );
      if (
        !result?.success ||
        !Array.isArray(result.rows) ||
        result.rows.length === NUM.ZERO
      ) {
        return cachedRow;
      }
      return this.mergePartitionRowForSafety(result.rows[NUM.ZERO], cachedRow);
    } catch {
      return cachedRow;
    }
  }

  async getCriticalMinReplicaCount(partitionId) {
    if (
      !this.tablePolicyService ||
      typeof this.tablePolicyService.getPolicyForPartition !==
        OPERATION_WORKFLOW_OWNER_LITERAL.FUNCTION
    ) {
      return DEFAULT_MIN_REPLICA_COUNT;
    }

    try {
      const policy =
        await this.tablePolicyService.getPolicyForPartition(partitionId);
      const minReplicaCount = Number(policy?.minReplicaCount);
      if (Number.isFinite(minReplicaCount) && minReplicaCount > NUM.ZERO) {
        return Math.floor(minReplicaCount);
      }
    } catch (error) {
      this.logger.warn(
        OPERATION_WORKFLOW_OWNER_LITERAL.FAILED_TO_RESOLVE_MINREPLICACOUNT_FOR_CRITICAL +
          OPERATION_WORKFLOW_OWNER_LITERAL.PARTITION_SAFETY_CHECK,
        {
          partitionId,
          error: error.message,
        },
      );
    }

    return DEFAULT_MIN_REPLICA_COUNT;
  }

  isNodeReadyForRouting(nodeId, options = {}) {
    if (!nodeId) {
      return false;
    }
    const decisionDimension =
      typeof options?.decisionDimension === TYPEOF.STRING &&
      options.decisionDimension.length > NUM.ZERO ?
        options.decisionDimension :
        this.resolveOperationReadinessDecisionDimension(
          options?.partitionId || null,
        );
    const participationKind = options?.participationKind || null;
    if (
      participationKind &&
      this.controlPlaneReadinessService &&
      typeof this.controlPlaneReadinessService
        .getControlPlaneParticipationSync === TYPEOF.FUNCTION
    ) {
      const participation =
        this.controlPlaneReadinessService.getControlPlaneParticipationSync(
          nodeId,
          {
            decisionDimension,
            participationKind,
            partitionId: options?.partitionId || null,
          },
        );
      return participation?.eligible === true;
    }
    const readiness = this.controlPlaneReadinessService.getNodeReadinessSync(
      nodeId,
      {
        decisionDimension: decisionDimension,
      },
    );
    return this.isReadinessDimensionSatisfied(readiness, decisionDimension);
  }

  async getPriorityRecoveryPlanningSnapshot(operation) {
    const partitionId = normalizePriorityRecoveryOperationPartitionId(
      operation,
    );
    if (
      !operation ||
      !isPriorityControlPlanePartition({
        partitionId,
      })
    ) {
      return null;
    }

    const readinessService = this.controlPlaneReadinessService;
    if (
      !readinessService ||
      (typeof readinessService.getPriorityRecoveryPlanningAnswerForOwnerRead !==
        TYPEOF.FUNCTION &&
      (typeof readinessService.getPriorityRecoveryPlanningSnapshotBestEffort !==
        TYPEOF.FUNCTION &&
        typeof readinessService.getPriorityRecoveryPlanningSnapshotBestEffort !==
          TYPEOF.FUNCTION &&
        typeof readinessService.getMembershipPublicationPlanningSnapshotBestEffort !==
          TYPEOF.FUNCTION &&
        typeof readinessService.getMembershipPublicationPlanningSnapshotBestEffort !==
          TYPEOF.FUNCTION))
    ) {
      return null;
    }

    const publicationNodeId = String(this.nodeId || '').trim();
    const observedAt = Date.now();
    if (
      partitionId ===
        INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS] &&
      typeof readinessService.getPriorityRecoveryPlanningAnswerForOwnerRead ===
      TYPEOF.FUNCTION
    ) {
      return readinessService.getPriorityRecoveryPlanningAnswerForOwnerRead(
        publicationNodeId,
        observedAt,
      );
    }
    if (
      typeof readinessService.getPriorityRecoveryPlanningSnapshotBestEffort ===
      TYPEOF.FUNCTION
    ) {
      return readinessService.getPriorityRecoveryPlanningSnapshotBestEffort(
        publicationNodeId,
        observedAt,
      );
    }
    if (
      typeof readinessService.getPriorityRecoveryPlanningSnapshotBestEffort ===
      TYPEOF.FUNCTION
    ) {
      return readinessService.getPriorityRecoveryPlanningSnapshotBestEffort(
        publicationNodeId,
        observedAt,
      );
    }
    if (
      typeof readinessService.getMembershipPublicationPlanningSnapshotBestEffort ===
      TYPEOF.FUNCTION
    ) {
      return readinessService.getMembershipPublicationPlanningSnapshotBestEffort(
        publicationNodeId,
        observedAt,
      );
    }
    if (
      typeof readinessService.getMembershipPublicationPlanningSnapshotBestEffort ===
      TYPEOF.FUNCTION
    ) {
      return readinessService.getMembershipPublicationPlanningSnapshotBestEffort(
        publicationNodeId,
        observedAt,
      );
    }
    return null;
  }

  normalizePriorityPublicationStatus(planningSnapshot) {
    if (!planningSnapshot || typeof planningSnapshot !== TYPEOF.OBJECT) {
      return null;
    }
    const publicationStatus =
      typeof planningSnapshot.publicationStatus === TYPEOF.STRING &&
      planningSnapshot.publicationStatus.length > NUM.ZERO ?
        planningSnapshot.publicationStatus :
        typeof planningSnapshot.status === TYPEOF.STRING &&
            planningSnapshot.status.length > NUM.ZERO ?
          planningSnapshot.status :
          null;
    return publicationStatus ? publicationStatus.trim().toUpperCase() : null;
  }
}

export {OperationWorkflowOwnerSegment5Stage2};
