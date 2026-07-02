import {
  COLUMN,
  TABLES,
} from '../constants/index.js';
import {
  isReplicaOperationInFlight,
  normalizeReplicaOperationRecord,
} from '../rebalancer/replica-operation-liveness.js';
import {
  isPriorityControlPlanePartition,
} from './system-partition-classification.js';
import {
  OperationType,
} from '../rebalancer/replica-status.js';

const JOIN_READINESS_REPLICA_OPERATION_ENTITY_TYPE = Object.freeze({
  PARTITION: 'partition',
});
const JOIN_READINESS_PRIORITY_OPERATION_EXCLUSION_KIND = Object.freeze({
  NONE: 'none',
  REMOTE_ACTIVE_PEER_RECOVERY: 'remote_active_peer_recovery',
  SELF_SOURCE_ACTIVE_TARGET_REPLACEMENT:
    'self_source_active_target_replacement',
});

function createJoinReadinessReplicaOperationMethods(options = {}) {
  const canonicalJoinDiscoveryCriticalTables =
    options.canonicalJoinDiscoveryCriticalTables || new Set();

  return {
    collectCanonicalInFlightReplicaOperationDetails(systemTableCache) {
      if (
        !systemTableCache ||
        typeof systemTableCache.getAll !== 'function'
      ) {
        return {
          inFlightOperations: [],
          excludedSelfTargetedCount: 0,
          excludedNonParticipatingCount: 0,
          excludedWarmingTargetCount: 0,
          excludedNonDiscoveryPartitionCount: 0,
          excludedRemotePriorityControlPlaneCount: 0,
          excludedRemotePriorityControlPlaneOperationDetails: [],
          excludedSelfSourcePriorityControlPlaneCount: 0,
          excludedSelfSourcePriorityControlPlaneOperationDetails: [],
        };
      }

      const activeNodeIds = new Set(
        this.getCanonicalJoinActiveNodeIds(systemTableCache),
      );
      const discoveryCriticalPartitionIds =
        this.resolveCanonicalDiscoveryCriticalPartitionIds(systemTableCache);

      const rows =
        systemTableCache.getAll(TABLES.REPLICA_OPERATIONS) || [];
      const serviceRows =
        systemTableCache.getAll(TABLES.SERVICES) || [];
      const inFlightOperations = [];
      const excludedRemotePriorityControlPlaneOperationDetails = [];
      const excludedSelfSourcePriorityControlPlaneOperationDetails = [];
      const excludedPriorityControlPlaneOperationDetailsByKind =
        Object.freeze({
          [JOIN_READINESS_PRIORITY_OPERATION_EXCLUSION_KIND
            .REMOTE_ACTIVE_PEER_RECOVERY]:
            excludedRemotePriorityControlPlaneOperationDetails,
          [JOIN_READINESS_PRIORITY_OPERATION_EXCLUSION_KIND
            .SELF_SOURCE_ACTIVE_TARGET_REPLACEMENT]:
            excludedSelfSourcePriorityControlPlaneOperationDetails,
        });
      let excludedSelfTargetedCount = 0;
      let excludedNonParticipatingCount = 0;
      let excludedWarmingTargetCount = 0;
      let excludedNonDiscoveryPartitionCount = 0;
      for (const row of rows) {
        const normalizedOperation = normalizeReplicaOperationRecord(row);
        if (isReplicaOperationInFlight(normalizedOperation, {serviceRows})) {
          if (normalizedOperation.targetNodeId === this.nodeId) {
            excludedSelfTargetedCount++;
            continue;
          }
          if (!activeNodeIds.has(normalizedOperation.targetNodeId)) {
            excludedWarmingTargetCount++;
            continue;
          }
          if (
            normalizedOperation.entityType ===
              JOIN_READINESS_REPLICA_OPERATION_ENTITY_TYPE.PARTITION &&
            discoveryCriticalPartitionIds.size > 0 &&
            normalizedOperation.partitionGroupId.length > 0 &&
            !discoveryCriticalPartitionIds.has(
              normalizedOperation.partitionGroupId,
            )
          ) {
            excludedNonDiscoveryPartitionCount++;
            continue;
          }
          const operationDetail =
            this.buildCanonicalJoinReplicaOperationDetail(
              normalizedOperation,
              row,
            );
          const priorityControlPlaneExclusion =
            this.classifyPriorityControlPlaneJoinOperationExclusion(
              normalizedOperation,
              activeNodeIds,
              discoveryCriticalPartitionIds,
            );
          const excludedPriorityControlPlaneOperationDetails =
            excludedPriorityControlPlaneOperationDetailsByKind[
              priorityControlPlaneExclusion.kind
            ];
          if (excludedPriorityControlPlaneOperationDetails) {
            excludedPriorityControlPlaneOperationDetails.push(operationDetail);
            continue;
          }
          // Last exclusion: an in-flight operation in which this joining node
          // is neither the source nor the target is a bystander — it moves a
          // replica between two other ACTIVE nodes and has no bearing on
          // whether this node can serve its own replicas or route (a REPLACE
          // keeps the partition's leader+quorum throughout, and the joiner
          // reads discovery-critical partitions from its bootstrap snapshot
          // pre-promotion). Counting such an op blocked a healthy joiner out
          // of published membership for minutes on unrelated topology churn —
          // the rolling-restart run6 (publication_missing_active_node) gate
          // failure. Requiring the source to be an active member mirrors the
          // sibling remote-active-peer exclusion and avoids trusting a move
          // whose source membership the joiner cannot confirm (the target is
          // already known-active, having survived the warming-target filter).
          // Placed last so it only affects ops that survive every other
          // exclusion; ops this node sources still count (non-self-targeted
          // preservation property).
          if (
            normalizedOperation.sourceNodeId !== this.nodeId &&
            normalizedOperation.targetNodeId !== this.nodeId &&
            activeNodeIds.has(normalizedOperation.sourceNodeId)
          ) {
            excludedNonParticipatingCount++;
            continue;
          }
          inFlightOperations.push(operationDetail);
        }
      }
      return {
        inFlightOperations,
        excludedSelfTargetedCount,
        excludedNonParticipatingCount,
        excludedWarmingTargetCount,
        excludedNonDiscoveryPartitionCount,
        excludedRemotePriorityControlPlaneCount:
          excludedRemotePriorityControlPlaneOperationDetails.length,
        excludedRemotePriorityControlPlaneOperationDetails,
        excludedSelfSourcePriorityControlPlaneCount:
          excludedSelfSourcePriorityControlPlaneOperationDetails.length,
        excludedSelfSourcePriorityControlPlaneOperationDetails,
      };
    },

    /**
     * @param {Object} normalizedOperation
     * @param {Set<string>} activeNodeIds
     * @param {Set<string>} discoveryCriticalPartitionIds
     * @return {Object}
     */
    buildPriorityControlPlaneJoinOperationEvidence(
      normalizedOperation,
      activeNodeIds,
      discoveryCriticalPartitionIds,
    ) {
      const partitionId = String(
        normalizedOperation?.partitionGroupId || '',
      );
      const sourceNodeId = String(
        normalizedOperation?.sourceNodeId || '',
      );
      const targetNodeId = String(
        normalizedOperation?.targetNodeId || '',
      );
      return Object.freeze({
        isPartitionOperation:
          normalizedOperation?.entityType ===
            JOIN_READINESS_REPLICA_OPERATION_ENTITY_TYPE.PARTITION,
        isReplaceOperation:
          normalizedOperation?.type === OperationType.REPLACE,
        partitionId,
        sourceNodeId,
        targetNodeId,
        discoveryCriticalPartition:
          partitionId.length > 0 &&
          discoveryCriticalPartitionIds.has(partitionId),
        priorityControlPlanePartition:
          partitionId.length > 0 &&
          isPriorityControlPlanePartition({partitionId}),
        sourceIsSelf: sourceNodeId === this.nodeId,
        targetIsSelf: targetNodeId === this.nodeId,
        sourceActive: activeNodeIds.has(sourceNodeId),
        targetActive: activeNodeIds.has(targetNodeId),
      });
    },

    /**
     * @param {Object} normalizedOperation
     * @param {Set<string>} activeNodeIds
     * @param {Set<string>} discoveryCriticalPartitionIds
     * @return {Object}
     */
    classifyPriorityControlPlaneJoinOperationExclusion(
      normalizedOperation,
      activeNodeIds,
      discoveryCriticalPartitionIds,
    ) {
      const evidence = this.buildPriorityControlPlaneJoinOperationEvidence(
        normalizedOperation,
        activeNodeIds,
        discoveryCriticalPartitionIds,
      );
      const priorityControlPlaneBase =
        evidence.isPartitionOperation &&
        evidence.discoveryCriticalPartition &&
        evidence.priorityControlPlanePartition;
      const decisions = Object.freeze([{
        kind:
          JOIN_READINESS_PRIORITY_OPERATION_EXCLUSION_KIND
            .REMOTE_ACTIVE_PEER_RECOVERY,
        matched:
          priorityControlPlaneBase &&
          evidence.sourceActive &&
          evidence.targetActive &&
          evidence.sourceIsSelf === false &&
          evidence.targetIsSelf === false,
      }, {
        kind:
          JOIN_READINESS_PRIORITY_OPERATION_EXCLUSION_KIND
            .SELF_SOURCE_ACTIVE_TARGET_REPLACEMENT,
        matched:
          priorityControlPlaneBase &&
          evidence.isReplaceOperation &&
          evidence.sourceIsSelf === true &&
          evidence.targetIsSelf === false &&
          evidence.targetActive,
      }]);
      const matchedDecision =
        decisions.find((decision) => decision.matched === true);
      return Object.freeze({
        kind: matchedDecision ?
          matchedDecision.kind :
          JOIN_READINESS_PRIORITY_OPERATION_EXCLUSION_KIND.NONE,
        evidence,
      });
    },

    /**
     * @param {Object} normalizedOperation
     * @param {Set<string>} activeNodeIds
     * @param {Set<string>} discoveryCriticalPartitionIds
     * @return {boolean}
     */
    isRemotePriorityControlPlaneRecoveryOperation(
      normalizedOperation,
      activeNodeIds,
      discoveryCriticalPartitionIds,
    ) {
      return this.classifyPriorityControlPlaneJoinOperationExclusion(
        normalizedOperation,
        activeNodeIds,
        discoveryCriticalPartitionIds,
      ).kind ===
          JOIN_READINESS_PRIORITY_OPERATION_EXCLUSION_KIND
            .REMOTE_ACTIVE_PEER_RECOVERY;
    },

    /**
     * @param {Object} normalizedOperation
     * @param {Object} row
     * @return {Object}
     */
    buildCanonicalJoinReplicaOperationDetail(
      normalizedOperation,
      row,
    ) {
      return {
        operationId: normalizedOperation.operationId,
        type: normalizedOperation.type,
        partitionId: normalizedOperation.partitionGroupId,
        replicaId: String(
          row?.replica_id || row?.replicaId || '',
        ),
        sourceNodeId: normalizedOperation.sourceNodeId,
        targetNodeId: normalizedOperation.targetNodeId,
        status: normalizedOperation.status,
        workflowStep: normalizedOperation.workflowStep,
        completedAt: normalizedOperation.completedAt,
        ageMs: normalizedOperation.ageMs,
      };
    },

    /**
     * Resolve the partition IDs that remain topology-critical for canonical
     * join readiness.
     * @param {Object|null} systemTableCache
     * @return {Set<string>}
     */
    resolveCanonicalDiscoveryCriticalPartitionIds(systemTableCache) {
      const partitionIds = new Set();
      for (const tableName of canonicalJoinDiscoveryCriticalTables) {
        partitionIds.add(`${tableName}-p1`);
      }
      if (
        !systemTableCache ||
        typeof systemTableCache.getAll !== 'function'
      ) {
        return partitionIds;
      }

      const partitionRows = systemTableCache.getAll(TABLES.PARTITIONS) || [];
      for (const row of partitionRows) {
        const tableName = String(
          row?.[COLUMN.TABLE_NAME] ||
          row?.table_name ||
          row?.tableName ||
          '',
        ).trim().toLowerCase();
        if (!canonicalJoinDiscoveryCriticalTables.has(tableName)) {
          continue;
        }
        const partitionId = String(
          row?.[COLUMN.PARTITION_ID] ||
          row?.partition_id ||
          row?.partitionId ||
          '',
        ).trim();
        if (partitionId.length === 0) {
          continue;
        }
        partitionIds.add(partitionId);
      }
      return partitionIds;
    },
  };
}

export {createJoinReadinessReplicaOperationMethods};
