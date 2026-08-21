import {PriorityPublicationSafetyTopology} from './priority-publication-safety-topology.js';
import {OPERATION_WORKFLOW_OWNER_SEGMENT_5_STAGE_SHARED as SHARED} from './priority-publication-safety-shared.js';
import {classifySystemPartition} from '../bootstrap/system-partition-classification.js';
import {UNIFIED_SERVICE_TYPE} from
  '../constants/unified-service-lifecycle.js';
import {REBALANCER_DEFAULT_POLICY} from './rebalancer-constants.js';
import {
  readAuthoritativeEntityServiceRows,
} from './entity-service-row-read.js';

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

  /**
   * Read the service rows owned by a non-partition rebalancer entity. The
   * canonical owner read is shared with coordinator admission. Removal safety
   * never merges or substitutes cache projection for owner evidence.
   * @param {Object} identity
   * @return {Promise<{available: boolean, rows: Object[]}>}
   */
  async getEntityReplicaRowsForSafety(identity) {
    const gateway = this.repository?.controlPlaneSystemTableGateway;
    if (!gateway) {
      return Object.freeze({
        available: false,
        rows: [],
      });
    }
    try {
      const result = await readAuthoritativeEntityServiceRows(
        gateway,
        identity,
        REMOVE_SAFETY_READ_QUERY_OPTIONS,
      );
      if (!result?.success || !Array.isArray(result.rows)) {
        return Object.freeze({
          available: false,
          rows: [],
        });
      }
      return Object.freeze({
        available: true,
        rows: result.rows,
      });
    } catch {
      return Object.freeze({
        available: false,
        rows: [],
      });
    }
  }

  /**
   * Resolve the minimum live-replica floor from the policy owner for the
   * entity type. Runtime services own an availability floor; message groups
   * own a replicated-group target floor. Unknown types fail closed.
   * @param {string} entityType
   * @param {string} entityId
   * @return {Promise<number|null>}
   */
  async getEntityRemoveSafetyMinReplicaCount(entityType, entityId) {
    if (entityType === UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE) {
      return REBALANCER_DEFAULT_POLICY.RUNTIME_SERVICE.minReplicaCount;
    }
    if (entityType !== SERVICE_TYPE.MESSAGE_GROUP) {
      return null;
    }
    const defaultCount =
      REBALANCER_DEFAULT_POLICY.MESSAGE_GROUP.targetReplicaCount;
    if (
      !this.tablePolicyService ||
      typeof this.tablePolicyService.getMessageGroupPolicy !== 'function'
    ) {
      return defaultCount;
    }
    try {
      const policy = await this.tablePolicyService.getMessageGroupPolicy(
        entityId,
      );
      const count = Number(
        policy?.minReplicaCount ?? policy?.targetReplicaCount,
      );
      return Number.isFinite(count) && count > 0 ?
        Math.floor(count) :
        defaultCount;
    } catch {
      return defaultCount;
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
    const mergedRow = {
      ...(cachedRow || {}),
      ...(authoritativeRow || {}),
    };
    // The owner-local canonical leader seed (the PARTITIONS-row sibling of
    // CL-035, partition-service-metadata-delivery-methods.js) makes an
    // actually-won LOCAL election visible before the durable leader
    // publication lands. A blunt authoritative-wins merge re-imposes the
    // stale durable leader for the whole publication round-trip (measured
    // 5-6s per ledger self-move during formation), deferring remove safety
    // on leadership the local raft already committed.
    //
    // The preference is TENURE-BOUND, not content-based (quest
    // local-leadership-tenure-bound-safety-evidence): it fires only when the
    // cached row carries this node's live tenure claim — the local-only
    // leader_claim_* annotations the projection stamps at election time with
    // the raft term the election was won at, nulled on demotion,
    // supersession, and replica teardown, and impossible for a CDC replay of
    // any durable row to carry. A row merely NAMING this node (a fossil of
    // an old tenure) or naming any other node keeps deferring to the
    // authoritative read.
    const localNodeId = this.repository?.nodeId;
    const cachedClaimNodeId =
      typeof cachedRow?.leader_claim_node_id === 'string' &&
      cachedRow.leader_claim_node_id.length > 0 ?
        cachedRow.leader_claim_node_id :
        null;
    const rawClaimTerm = cachedRow?.leader_claim_raft_term;
    const cachedClaimTerm =
      rawClaimTerm === null || rawClaimTerm === undefined ?
        Number.NaN :
        Number(rawClaimTerm);
    const liveLocalClaim =
      cachedClaimNodeId !== null &&
      cachedClaimNodeId === localNodeId &&
      cachedRow?.leader_node_id === cachedClaimNodeId &&
      Number.isFinite(cachedClaimTerm);
    if (liveLocalClaim && mergedRow.leader_node_id !== cachedClaimNodeId) {
      mergedRow.leader_node_id = cachedClaimNodeId;
    }
    return mergedRow;
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
      // Revalidate AFTER the await: a demotion (or successor publication)
      // landing while the authoritative read was in flight clears or
      // replaces the cached leader projection, and a pre-await capture must
      // not resurrect the superseded self-belief into the merge (external
      // review TOCTOU, 2026-07-17). The post-await cache state is the
      // freshest local truth the preference may consult.
      const postAwaitCachedRow =
        this.getCachedCriticalPartitionRow(partitionId);
      if (
        !result?.success ||
        !Array.isArray(result.rows) ||
        result.rows.length === 0
      ) {
        return postAwaitCachedRow;
      }
      return this.mergePartitionRowForSafety(
        result.rows[0],
        postAwaitCachedRow,
      );
    } catch {
      return this.getCachedCriticalPartitionRow(partitionId) || cachedRow;
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
