import {PriorityPublicationSafetyTopology} from './priority-publication-safety-topology.js';
import {OPERATION_WORKFLOW_OWNER_SEGMENT_5_STAGE_SHARED as SHARED} from './priority-publication-safety-shared.js';
import {classifySystemPartition} from '../bootstrap/system-partition-classification.js';

const {
  DEFAULT_MIN_REPLICA_COUNT,
  INITIAL_PARTITION_IDS,
  OPERATION_WORKFLOW_OWNER_LITERAL,
  REMOVE_SAFETY_READ_QUERY_OPTIONS,
  REMOVE_SAFETY_SQL,
  SERVICE_TYPE,
  SYSTEM_TABLE_NAME,
  normalizePriorityRecoveryOperationPartitionId,
  readAuthoritativeControlPlaneRows,
} = SHARED;

class PriorityPublicationSafetyRows extends PriorityPublicationSafetyTopology {
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
      if (!row || typeof row !== 'object') {
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
        result.rows.length === 0
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
      typeof systemTableCache.get !== 'function'
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
        result.rows.length === 0
      ) {
        return cachedRow;
      }
      return this.mergePartitionRowForSafety(result.rows[0], cachedRow);
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
      if (Number.isFinite(minReplicaCount) && minReplicaCount > 0) {
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
      typeof options?.decisionDimension === 'string' &&
      options.decisionDimension.length > 0 ?
        options.decisionDimension :
        this.resolveOperationReadinessDecisionDimension(
          options?.partitionId || null,
        );
    const participationKind = options?.participationKind || null;
    if (
      participationKind &&
      this.controlPlaneReadinessService &&
      typeof this.controlPlaneReadinessService
        .getControlPlaneParticipationSync === 'function'
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
      !classifySystemPartition({
        partitionId,
      }).priorityControlPlane
    ) {
      return null;
    }

    const readinessService = this.controlPlaneReadinessService;
    if (
      !readinessService ||
      (typeof readinessService.getPriorityRecoveryPlanningAnswerForOwnerRead !==
        'function' &&
      (typeof readinessService.getPriorityRecoveryPlanningSnapshotBestEffort !==
        'function' &&
        typeof readinessService.getPriorityRecoveryPlanningSnapshotBestEffort !==
          'function' &&
        typeof readinessService.getMembershipPublicationPlanningSnapshotBestEffort !==
          'function' &&
        typeof readinessService.getMembershipPublicationPlanningSnapshotBestEffort !==
          'function'))
    ) {
      return null;
    }

    const publicationNodeId = String(this.nodeId || '').trim();
    const observedAt = Date.now();
    if (
      partitionId ===
        INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS] &&
      typeof readinessService.getPriorityRecoveryPlanningAnswerForOwnerRead ===
      'function'
    ) {
      return readinessService.getPriorityRecoveryPlanningAnswerForOwnerRead(
        publicationNodeId,
        observedAt,
      );
    }
    if (
      typeof readinessService.getPriorityRecoveryPlanningSnapshotBestEffort ===
      'function'
    ) {
      return readinessService.getPriorityRecoveryPlanningSnapshotBestEffort(
        publicationNodeId,
        observedAt,
      );
    }
    if (
      typeof readinessService.getPriorityRecoveryPlanningSnapshotBestEffort ===
      'function'
    ) {
      return readinessService.getPriorityRecoveryPlanningSnapshotBestEffort(
        publicationNodeId,
        observedAt,
      );
    }
    if (
      typeof readinessService.getMembershipPublicationPlanningSnapshotBestEffort ===
      'function'
    ) {
      return readinessService.getMembershipPublicationPlanningSnapshotBestEffort(
        publicationNodeId,
        observedAt,
      );
    }
    if (
      typeof readinessService.getMembershipPublicationPlanningSnapshotBestEffort ===
      'function'
    ) {
      return readinessService.getMembershipPublicationPlanningSnapshotBestEffort(
        publicationNodeId,
        observedAt,
      );
    }
    return null;
  }

  normalizePriorityPublicationStatus(planningSnapshot) {
    if (!planningSnapshot || typeof planningSnapshot !== 'object') {
      return null;
    }
    const publicationStatus =
      typeof planningSnapshot.publicationStatus === 'string' &&
      planningSnapshot.publicationStatus.length > 0 ?
        planningSnapshot.publicationStatus :
        typeof planningSnapshot.status === 'string' &&
            planningSnapshot.status.length > 0 ?
          planningSnapshot.status :
          null;
    return publicationStatus ? publicationStatus.trim().toUpperCase() : null;
  }
}

export {PriorityPublicationSafetyRows};
