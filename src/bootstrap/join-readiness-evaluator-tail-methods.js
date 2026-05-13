import {NodeService} from '../node/node-service.js';
import {
  normalizeJoinSchemaVersion,
  compareJoinSchemaVersions,
} from './join-schema-version-resolver.js';
import {
  COLUMN,
  NUM,
  TABLES,
  TYPEOF,
} from '../constants/index.js';
import {
  isReplicaOperationInFlight,
  normalizeReplicaOperationRecord,
} from '../rebalancer/replica-operation-liveness.js';
import {
  normalizeNodeRow,
} from '../control-plane/system-row-normalizers.js';
import {
  JOIN_READINESS_REASON,
  JOINING_LOG_MSG,
} from './node-joining-constants.js';
import {
  isPriorityControlPlanePartition,
} from './system-partition-classification.js';
import {
  evaluateJoinPromotionState,
} from './join-promotion-state-owner.js';
import {
  OperationType,
} from '../rebalancer/replica-status.js';
import {NODE_STATE} from '../constants/node-state.js';
import {CONNECTION_STATE} from '../constants/transport.js';

const LOCAL_STR_EMPTY = '';
const LOCAL_STR_SYSTEM_TABLE_CACHE = 'system_table_cache';
const LOCAL_STR_BOOTSTRAP_SNAPSHOT = 'bootstrap_snapshot';
const LOCAL_STR_SYSTEM_TABLE_CACHE_WITH_BOOTSTRAP_SUPPLEMENT =
  'system_table_cache_with_bootstrap_supplement';
const LOCAL_STR_COMMA = ',';

const JOIN_READINESS_REPLICA_OPERATION_ENTITY_TYPE = Object.freeze({
  PARTITION: 'partition',
});
const JOIN_READINESS_PRIORITY_OPERATION_EXCLUSION_KIND = Object.freeze({
  NONE: 'none',
  REMOTE_ACTIVE_PEER_RECOVERY: 'remote_active_peer_recovery',
  SELF_SOURCE_ACTIVE_TARGET_REPLACEMENT:
    'self_source_active_target_replacement',
});
const MESH_CONNECTIVITY_ROW_SELECTION_KIND = Object.freeze({
  CACHE_WITH_BOOTSTRAP_SUPPLEMENT: 'cache_with_bootstrap_supplement',
  SYSTEM_TABLE_CACHE: 'system_table_cache',
  BOOTSTRAP_SNAPSHOT: 'bootstrap_snapshot',
});
const MESH_CONNECTIVITY_ROW_SELECTION_RULES = Object.freeze([
  Object.freeze({
    kind: MESH_CONNECTIVITY_ROW_SELECTION_KIND
      .CACHE_WITH_BOOTSTRAP_SUPPLEMENT,
    source: LOCAL_STR_SYSTEM_TABLE_CACHE_WITH_BOOTSTRAP_SUPPLEMENT,
    matches: (evidence) =>
      evidence.cacheRows.length > NUM.ZERO &&
      evidence.supplementalBootstrapRows.length > NUM.ZERO,
    resolveRows: (evidence) =>
      evidence.cacheRows.concat(evidence.supplementalBootstrapRows),
    resolveBootstrapSupplementNodeIds: (evidence) =>
      evidence.bootstrapSupplementNodeIds,
  }),
  Object.freeze({
    kind: MESH_CONNECTIVITY_ROW_SELECTION_KIND.SYSTEM_TABLE_CACHE,
    source: LOCAL_STR_SYSTEM_TABLE_CACHE,
    matches: (evidence) => evidence.cacheRows.length > NUM.ZERO,
    resolveRows: (evidence) => evidence.cacheRows,
    resolveBootstrapSupplementNodeIds: () => [],
  }),
  Object.freeze({
    kind: MESH_CONNECTIVITY_ROW_SELECTION_KIND.BOOTSTRAP_SNAPSHOT,
    source: LOCAL_STR_BOOTSTRAP_SNAPSHOT,
    matches: () => true,
    resolveRows: (evidence) => evidence.bootstrapRows,
    resolveBootstrapSupplementNodeIds: () => [],
  }),
]);
const MESH_CONNECTIVITY_BOOTSTRAP_SUPPLEMENT_LIFECYCLE_STATES = new Set([
  NODE_STATE.JOINING,
  CONNECTION_STATE.CONNECTING,
]);

function selectMeshConnectivityRows(evidence) {
  const selectionRule = MESH_CONNECTIVITY_ROW_SELECTION_RULES.find((rule) =>
    rule.matches(evidence),
  );
  return {
    source: selectionRule.source,
    rows: selectionRule.resolveRows(evidence),
    bootstrapSupplementNodeIds:
      selectionRule.resolveBootstrapSupplementNodeIds(evidence),
  };
}

function createJoinReadinessEvaluatorTailMethods(options = {}) {
  const joinReadinessReasonPrecedence =
    options.joinReadinessReasonPrecedence || [];
  const meshIneligibleNodeStates =
    options.meshIneligibleNodeStates || new Set();
  const meshConnectedOrInFlightStates =
    options.meshConnectedOrInFlightStates || new Set();
  const canonicalJoinReadinessLogIntervalMs =
    options.canonicalJoinReadinessLogIntervalMs || NUM.ZERO;
  const canonicalJoinDiscoveryCriticalTables =
    options.canonicalJoinDiscoveryCriticalTables || new Set();

  return {
    /**
     * Resolve one node id from a mesh-connectivity row shape.
     * @param {Object|null} row
     * @return {string}
     */
    resolveMeshConnectivityNodeId(row) {
      return normalizeNodeRow(row).nodeId;
    },

    /**
     * Resolve one node status from a mesh-connectivity row shape.
     * @param {Object|null} row
     * @return {string}
     */
    resolveMeshConnectivityNodeStatus(row) {
      return normalizeNodeRow(row).status;
    },

    /**
     * Resolve lifecycle-state tokens relevant to peer mesh eligibility.
     * @param {Object|null} row
     * @return {string[]}
     */
    resolveMeshConnectivityLifecycleTokens(row) {
      return Array.from(new Set([
        row?.[COLUMN.STATUS],
        row?.status,
        row?.[COLUMN.CONNECTION_STATE],
        row?.connection_state,
        row?.connectionState,
      ].map((value) => {
        return String(value || LOCAL_STR_EMPTY).toLowerCase();
      }).filter((value) => value.length > NUM.ZERO)));
    },

    /**
     * Determine whether a node row should participate in mesh reconciliation.
     * @param {Object|null} row
     * @return {boolean}
     */
    isMeshEligibleNodeRow(row) {
      const nodeId = this.resolveMeshConnectivityNodeId(row);
      if (nodeId.length === NUM.ZERO) {
        return false;
      }

      const lifecycleTokens =
        this.resolveMeshConnectivityLifecycleTokens(row);
      if (lifecycleTokens.length === NUM.ZERO) {
        return true;
      }

      return !lifecycleTokens.some((token) => {
        return meshIneligibleNodeStates.has(token);
      });
    },

    /**
     * Determine whether a bootstrap row may supplement active membership.
     * @param {Object|null} row
     * @return {boolean}
     */
    isBootstrapMeshSupplementalNodeRow(row) {
      return this.resolveMeshConnectivityLifecycleTokens(row).some((token) =>
        MESH_CONNECTIVITY_BOOTSTRAP_SUPPLEMENT_LIFECYCLE_STATES.has(token),
      );
    },

    /**
     * Resolve bootstrap rows that can safely participate in mesh connectivity.
     * @param {Object|null} bootstrapResponse
     * @param {Set<string>} bootstrapActiveNodeIds
     * @return {Object[]}
     */
    resolveBootstrapMeshConnectivityNodeRows(
      bootstrapResponse,
      bootstrapActiveNodeIds,
    ) {
      return Array.isArray(bootstrapResponse?.systemTableSnapshots?.nodes) ?
        bootstrapResponse.systemTableSnapshots.nodes.filter((row) => {
          const nodeId = this.resolveMeshConnectivityNodeId(row);
          const belongsToPublishedActiveSet =
            bootstrapActiveNodeIds.size === NUM.ZERO ||
            (
              nodeId.length > NUM.ZERO &&
              bootstrapActiveNodeIds.has(nodeId)
            );
          return (
            belongsToPublishedActiveSet ||
            this.isBootstrapMeshSupplementalNodeRow(row)
          ) &&
            this.isMeshEligibleNodeRow(row);
        }) :
        [];
    },

    /**
     * Resolve bootstrap rows that fill gaps in a partial cache membership view.
     * @param {Object[]} cacheRows
     * @param {Object[]} bootstrapRows
     * @return {{rows: Object[], nodeIds: string[]}}
     */
    resolveBootstrapMeshConnectivitySupplement(cacheRows, bootstrapRows) {
      const cacheNodeIds = new Set(cacheRows.map((row) =>
        this.resolveMeshConnectivityNodeId(row),
      ).filter((nodeId) => nodeId.length > NUM.ZERO));
      const supplementalRows = bootstrapRows.filter((row) => {
        const nodeId = this.resolveMeshConnectivityNodeId(row);
        return nodeId.length > NUM.ZERO && !cacheNodeIds.has(nodeId);
      });
      const supplementalNodeIds = supplementalRows.map((row) =>
        this.resolveMeshConnectivityNodeId(row),
      );
      return {
        rows: supplementalRows,
        nodeIds: supplementalNodeIds,
      };
    },

    /**
     * Resolve node rows used for mesh connectivity.
     * @return {{source: string, rows: Object[]}}
     */
    resolveMeshConnectivityNodeRows() {
      const bootstrapActiveNodeIds = new Set(
        this.resolveBootstrapTopologySnapshotActiveNodeIds(),
      );
      const bootstrapResponse = this.delegates.getBootstrapResponse();
      const bootstrapRows = this.resolveBootstrapMeshConnectivityNodeRows(
        bootstrapResponse,
        bootstrapActiveNodeIds,
      );
      const systemTableCache =
        NodeService.getInstance().getSystemTableCache();
      let cacheRows = [];
      if (
        systemTableCache &&
        typeof systemTableCache.getAll === TYPEOF.FUNCTION
      ) {
        cacheRows =
          (systemTableCache.getAll(TABLES.NODES) || []).filter((row) => {
            return this.isMeshEligibleNodeRow(row);
          });
      }

      const bootstrapSupplement =
        this.resolveBootstrapMeshConnectivitySupplement(
          cacheRows,
          bootstrapRows,
        );
      return selectMeshConnectivityRows({
        cacheRows,
        bootstrapRows,
        supplementalBootstrapRows: bootstrapSupplement.rows,
        bootstrapSupplementNodeIds: bootstrapSupplement.nodeIds,
      });
    },

    /**
     * Build a stable mesh-membership signature for connection reconciliation.
     * @param {Array<Object>} nodeRows
     * @return {string}
     */
    buildClusterMeshSignature(nodeRows) {
      if (!Array.isArray(nodeRows) || nodeRows.length === NUM.ZERO) {
        return LOCAL_STR_EMPTY;
      }

      const members = nodeRows
        .map((row) => {
          const nodeId = this.resolveMeshConnectivityNodeId(row);
          if (
            nodeId.length === NUM.ZERO ||
            nodeId === this.nodeId ||
            !this.isMeshEligibleNodeRow(row)
          ) {
            return null;
          }
          const nodeAddress = String(
            row?.[COLUMN.NODE_ADDRESS] ||
              row?.node_address ||
              row?.nodeAddress ||
              '',
          );
          const lifecycleSignature =
            this.resolveMeshConnectivityLifecycleTokens(row)
              .sort()
              .join('+');
          return `${nodeId}|${nodeAddress}|${lifecycleSignature}`;
        })
        .filter(Boolean)
        .sort();

      return members.join(LOCAL_STR_COMMA);
    },

    /**
     * Determine whether steady-state READY heartbeats need mesh reconciliation.
     * @return {boolean}
     */
    shouldReconnectClusterMesh() {
      const messageRouter = this.delegates.getMessageRouter();
      if (!messageRouter) {
        return false;
      }

      const {rows: nodesSnapshot} = this.resolveMeshConnectivityNodeRows();
      if (
        !Array.isArray(nodesSnapshot) ||
        nodesSnapshot.length === NUM.ZERO
      ) {
        return false;
      }

      const signature = this.buildClusterMeshSignature(nodesSnapshot);
      if (signature !== this.lastClusterMeshSignature) {
        return true;
      }

      const hasConnectionState =
        typeof messageRouter.getConnectionState === TYPEOF.FUNCTION;
      if (!hasConnectionState) {
        return false;
      }

      return nodesSnapshot.some((node) => {
        const nodeId = this.resolveMeshConnectivityNodeId(node);
        return nodeId.length > NUM.ZERO &&
          nodeId !== this.nodeId &&
          !meshConnectedOrInFlightStates.has(
            messageRouter.getConnectionState(nodeId),
          );
      });
    },

    /**
     * Collect non-terminal replica operations from local cache.
     * @param {Object|null} systemTableCache
     * @return {Object}
     */
    collectCanonicalInFlightReplicaOperationDetails(systemTableCache) {
      if (
        !systemTableCache ||
        typeof systemTableCache.getAll !== TYPEOF.FUNCTION
      ) {
        return {
          inFlightOperations: [],
          excludedSelfTargetedCount: NUM.ZERO,
          excludedWarmingTargetCount: NUM.ZERO,
          excludedNonDiscoveryPartitionCount: NUM.ZERO,
          excludedRemotePriorityControlPlaneCount: NUM.ZERO,
          excludedRemotePriorityControlPlaneOperationDetails: [],
          excludedSelfSourcePriorityControlPlaneCount: NUM.ZERO,
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
      let excludedSelfTargetedCount = NUM.ZERO;
      let excludedWarmingTargetCount = NUM.ZERO;
      let excludedNonDiscoveryPartitionCount = NUM.ZERO;
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
            discoveryCriticalPartitionIds.size > NUM.ZERO &&
            normalizedOperation.partitionGroupId.length > NUM.ZERO &&
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
          inFlightOperations.push(operationDetail);
        }
      }
      return {
        inFlightOperations,
        excludedSelfTargetedCount,
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
          partitionId.length > NUM.ZERO &&
          discoveryCriticalPartitionIds.has(partitionId),
        priorityControlPlanePartition:
          partitionId.length > NUM.ZERO &&
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
          row?.replica_id || row?.replicaId || LOCAL_STR_EMPTY,
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
        typeof systemTableCache.getAll !== TYPEOF.FUNCTION
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
        if (partitionId.length === NUM.ZERO) {
          continue;
        }
        partitionIds.add(partitionId);
      }
      return partitionIds;
    },

    /**
     * Resolve node IDs required for join-readiness diagnostics.
     * @param {Object|null} systemTableCache
     * @return {Array<string>}
     */
    resolveJoinReadinessRequiredNodeIds(systemTableCache) {
      const nodeIds = [...new Set(
        this.getCanonicalJoinActiveNodeIds(systemTableCache),
      )];

      if (!nodeIds.includes(this.nodeId)) {
        nodeIds.push(this.nodeId);
      }
      return nodeIds;
    },

    /**
     * Evaluate one canonical join-readiness snapshot.
     * @param {Object} snapshot
     * @return {Object}
     */
    evaluateCanonicalJoinReadinessSnapshot(snapshot) {
      const normalized =
        this.normalizeCanonicalJoinReadinessSnapshot(snapshot);
      const promotion = evaluateJoinPromotionState({
        systemCacheHydrated:
          this.delegates.getSystemCacheHydrated?.() === true,
        startupMode:
          this.delegates.getJoinStartupMode?.() || null,
        restoreState:
          this.delegates.getDurableRejoinRestoreState?.() || null,
        routingReady: normalized.routingReady,
        topologyReady: normalized.topologyReady,
        requiredSchemaVersion: normalized.requiredSchemaVersion,
        appliedSchemaVersion: normalized.appliedSchemaVersion,
        inFlightReplicaOperations: normalized.inFlightReplicaOperations,
        lifecycleState:
          this.delegates.getLifecycleState?.() || null,
      });
      const reasons =
        this.classifyCanonicalJoinReadinessReasons(normalized);
      return {
        ...normalized,
        promotionState: promotion.state,
        promotionRestoreState: promotion.restoreState,
        promotionReasons: promotion.reasons,
        reasons,
        ready:
          reasons.length === NUM.ZERO &&
          promotion.readyToPromote === true,
      };
    },

    /**
     * Classify canonical join-readiness reasons with stable precedence.
     * @param {Object} snapshot
     * @return {Array<string>}
     */
    classifyCanonicalJoinReadinessReasons(snapshot) {
      const reasons = [];
      if (snapshot?.routingReady !== true) {
        reasons.push(JOIN_READINESS_REASON.ROUTING_NOT_READY);
      }

      const requiredVersion = normalizeJoinSchemaVersion(
        snapshot?.requiredSchemaVersion,
      );
      const appliedVersion = normalizeJoinSchemaVersion(
        snapshot?.appliedSchemaVersion,
      );
      if (!requiredVersion || !appliedVersion) {
        reasons.push(JOIN_READINESS_REASON.SCHEMA_VERSION_UNKNOWN);
      } else if (compareJoinSchemaVersions(
        appliedVersion,
        requiredVersion,
      ) < NUM.ZERO) {
        reasons.push(JOIN_READINESS_REASON.SCHEMA_VERSION_LAG);
      }

      if (snapshot?.topologyReady !== true) {
        reasons.push(JOIN_READINESS_REASON.TOPOLOGY_NOT_READY);
      }

      return reasons.sort((left, right) => {
        const leftRank = this.getJoinReadinessReasonRank(left);
        const rightRank = this.getJoinReadinessReasonRank(right);
        if (leftRank !== rightRank) {
          return leftRank - rightRank;
        }
        return String(left).localeCompare(String(right));
      });
    },

    /**
     * Normalize one canonical join-readiness snapshot.
     * @param {Object} snapshot
     * @return {Object}
     */
    normalizeCanonicalJoinReadinessSnapshot(snapshot) {
      const source = snapshot && typeof snapshot === TYPEOF.OBJECT ?
        snapshot :
        {};
      const requiredVersion = normalizeJoinSchemaVersion(
        source.requiredSchemaVersion,
      );
      const appliedVersion = normalizeJoinSchemaVersion(
        source.appliedSchemaVersion,
      );
      const requiredNodeIds = Array.isArray(source.requiredNodeIds) ?
        source.requiredNodeIds.filter((value) =>
          typeof value === TYPEOF.STRING && value.length > NUM.ZERO,
        ) :
        [this.nodeId];

      return {
        nodeId: source.nodeId || this.nodeId,
        tableName:
          source.tableName || this.resolveJoinReadinessTableName(),
        routingReady: source.routingReady === true,
        topologyReady: source.topologyReady === true,
        requiredSchemaVersion: requiredVersion,
        appliedSchemaVersion: appliedVersion,
        requiredNodeIds,
        topologySnapshotEpoch:
          Number.isFinite(source.topologySnapshotEpoch) ?
            Math.max(NUM.ZERO, Math.floor(source.topologySnapshotEpoch)) :
            null,
        appliedTopologyEpoch:
          Number.isFinite(source.appliedTopologyEpoch) ?
            Math.max(NUM.ZERO, Math.floor(source.appliedTopologyEpoch)) :
            null,
        missingLeaders:
          source.missingLeaders &&
          typeof source.missingLeaders === TYPEOF.OBJECT ?
            source.missingLeaders :
            null,
        inFlightReplicaOperations:
          Number.isFinite(source.inFlightReplicaOperations) ?
            Math.max(
              NUM.ZERO,
              Math.floor(source.inFlightReplicaOperations),
            ) :
            NUM.ZERO,
        inFlightReplicaOperationDetails:
          Array.isArray(source.inFlightReplicaOperationDetails) ?
            source.inFlightReplicaOperationDetails :
            [],
        excludedSelfTargetedCount:
          Number.isFinite(source.excludedSelfTargetedCount) ?
            Math.max(
              NUM.ZERO,
              Math.floor(source.excludedSelfTargetedCount),
            ) :
            NUM.ZERO,
        excludedWarmingTargetCount:
          Number.isFinite(source.excludedWarmingTargetCount) ?
            Math.max(
              NUM.ZERO,
              Math.floor(source.excludedWarmingTargetCount),
            ) :
            NUM.ZERO,
        excludedNonDiscoveryPartitionCount:
          Number.isFinite(source.excludedNonDiscoveryPartitionCount) ?
            Math.max(
              NUM.ZERO,
              Math.floor(source.excludedNonDiscoveryPartitionCount),
            ) :
            NUM.ZERO,
        excludedRemotePriorityControlPlaneCount:
          Number.isFinite(source.excludedRemotePriorityControlPlaneCount) ?
            Math.max(
              NUM.ZERO,
              Math.floor(source.excludedRemotePriorityControlPlaneCount),
            ) :
            NUM.ZERO,
        excludedRemotePriorityControlPlaneOperationDetails:
          Array.isArray(
            source.excludedRemotePriorityControlPlaneOperationDetails,
          ) ?
            source.excludedRemotePriorityControlPlaneOperationDetails :
            [],
        excludedSelfSourcePriorityControlPlaneCount:
          Number.isFinite(
            source.excludedSelfSourcePriorityControlPlaneCount,
          ) ?
            Math.max(
              NUM.ZERO,
              Math.floor(
                source.excludedSelfSourcePriorityControlPlaneCount,
              ),
            ) :
            NUM.ZERO,
        excludedSelfSourcePriorityControlPlaneOperationDetails:
          Array.isArray(
            source.excludedSelfSourcePriorityControlPlaneOperationDetails,
          ) ?
            source.excludedSelfSourcePriorityControlPlaneOperationDetails :
            [],
        missingNodeEndpointNodeIds:
          Array.isArray(source.missingNodeEndpointNodeIds) ?
            source.missingNodeEndpointNodeIds.filter((value) =>
              typeof value === TYPEOF.STRING &&
              value.length > NUM.ZERO,
            ) :
            [],
        missingPostgresWireNodeIds:
          Array.isArray(source.missingPostgresWireNodeIds) ?
            source.missingPostgresWireNodeIds.filter((value) =>
              typeof value === TYPEOF.STRING &&
              value.length > NUM.ZERO,
            ) :
            [],
        controlPlaneTargetAddress:
          typeof source.controlPlaneTargetAddress === TYPEOF.STRING &&
          source.controlPlaneTargetAddress.length > NUM.ZERO ?
            source.controlPlaneTargetAddress :
            null,
        controlPlaneTargetCandidates:
          Array.isArray(source.controlPlaneTargetCandidates) ?
            source.controlPlaneTargetCandidates.filter((value) =>
              typeof value === TYPEOF.STRING &&
              value.length > NUM.ZERO,
            ) :
            [],
        controlPlaneTargetConnectionStates:
          source.controlPlaneTargetConnectionStates &&
          typeof source.controlPlaneTargetConnectionStates === TYPEOF.OBJECT ?
            source.controlPlaneTargetConnectionStates :
            null,
        observedSchemaByNodeId:
          source.observedSchemaByNodeId &&
          typeof source.observedSchemaByNodeId === TYPEOF.OBJECT ?
            source.observedSchemaByNodeId :
            null,
        snapshotRevision:
          Number.isFinite(source.snapshotRevision) ?
            Math.max(NUM.ZERO, Math.floor(source.snapshotRevision)) :
            null,
        snapshotRevisionSource:
          typeof source.snapshotRevisionSource === TYPEOF.STRING &&
          source.snapshotRevisionSource.length > NUM.ZERO ?
            source.snapshotRevisionSource :
            null,
        snapshotRevisionState:
          typeof source.snapshotRevisionState === TYPEOF.STRING &&
          source.snapshotRevisionState.length > NUM.ZERO ?
            source.snapshotRevisionState :
            null,
        snapshotExpectedMinimumRevision:
          Number.isFinite(source.snapshotExpectedMinimumRevision) ?
            Math.max(
              NUM.ZERO,
              Math.floor(source.snapshotExpectedMinimumRevision),
            ) :
            null,
        snapshotRevisionGap:
          Number.isFinite(source.snapshotRevisionGap) ?
            Math.max(NUM.ZERO, Math.floor(source.snapshotRevisionGap)) :
            null,
        snapshotResumeToken:
          typeof source.snapshotResumeToken === TYPEOF.STRING &&
          source.snapshotResumeToken.length > NUM.ZERO ?
            source.snapshotResumeToken :
            null,
        snapshotObservedAt:
          typeof source.snapshotObservedAt === TYPEOF.STRING &&
          source.snapshotObservedAt.length > NUM.ZERO ?
            source.snapshotObservedAt :
            null,
        snapshotObservedAtMs:
          Number.isFinite(source.snapshotObservedAtMs) ?
            Math.max(NUM.ZERO, Math.floor(source.snapshotObservedAtMs)) :
            null,
      };
    },

    /**
     * Build per-node schema diagnostics for join timeout reporting.
     * @param {Object} evaluation
     * @return {Object}
     */
    buildJoinSchemaDiagnosticsByNode(evaluation) {
      const requiredVersion =
        evaluation?.requiredSchemaVersion || null;
      const observedVersion =
        evaluation?.appliedSchemaVersion || null;
      const reasons = Array.isArray(evaluation?.reasons) ?
        evaluation.reasons :
        [];
      const requiredNodeIds =
        Array.isArray(evaluation?.requiredNodeIds) &&
        evaluation.requiredNodeIds.length > NUM.ZERO ?
          evaluation.requiredNodeIds :
          [this.nodeId];
      const observedByNodeId =
        evaluation?.observedSchemaByNodeId &&
        typeof evaluation.observedSchemaByNodeId === TYPEOF.OBJECT ?
          evaluation.observedSchemaByNodeId :
          {};

      const diagnostics = {};
      for (const nodeId of requiredNodeIds) {
        diagnostics[nodeId] = {
          requiredSchemaVersion: requiredVersion,
          observedSchemaVersion:
            normalizeJoinSchemaVersion(observedByNodeId[nodeId]) ||
            observedVersion,
          unmetReasons: reasons,
        };
      }
      return diagnostics;
    },

    /**
     * Emit throttled diagnostics while canonical readiness remains blocked.
     * @param {Object|null} evaluation
     * @param {Object} options
     */
    logCanonicalJoinReadinessBlocked(evaluation, options = {}) {
      if (!evaluation || evaluation.ready === true) {
        return;
      }

      const nowMs = this.now();
      const force = options.force === true;
      if (
        !force &&
        this.lastCanonicalJoinBlockedLogAtMs > NUM.ZERO &&
        nowMs - this.lastCanonicalJoinBlockedLogAtMs <
          canonicalJoinReadinessLogIntervalMs
      ) {
        return;
      }

      this.lastCanonicalJoinBlockedLogAtMs = nowMs;
      this.delegates.getLogger().warn(
        JOINING_LOG_MSG.CANONICAL_READINESS_BLOCKED,
        {
          nodeId: this.nodeId,
          attempts: Number.isFinite(options.attempts) ?
            options.attempts :
            null,
          elapsedMs: Number.isFinite(options.elapsedMs) ?
            options.elapsedMs :
            null,
          reasons: evaluation.reasons,
          routingReady: evaluation.routingReady,
          topologyReady: evaluation.topologyReady,
          requiredSchemaVersion: evaluation.requiredSchemaVersion,
          appliedSchemaVersion: evaluation.appliedSchemaVersion,
          missingLeaders: evaluation.missingLeaders,
          inFlightReplicaOperations:
            evaluation.inFlightReplicaOperations,
          inFlightReplicaOperationDetails:
            evaluation.inFlightReplicaOperationDetails,
          excludedSelfTargetedCount:
            evaluation.excludedSelfTargetedCount,
          excludedWarmingTargetCount:
            evaluation.excludedWarmingTargetCount,
          excludedNonDiscoveryPartitionCount:
            evaluation.excludedNonDiscoveryPartitionCount,
          excludedRemotePriorityControlPlaneCount:
            evaluation.excludedRemotePriorityControlPlaneCount,
          excludedRemotePriorityControlPlaneOperationDetails:
            evaluation.excludedRemotePriorityControlPlaneOperationDetails,
          excludedSelfSourcePriorityControlPlaneCount:
            evaluation.excludedSelfSourcePriorityControlPlaneCount,
          excludedSelfSourcePriorityControlPlaneOperationDetails:
            evaluation.excludedSelfSourcePriorityControlPlaneOperationDetails,
          missingNodeEndpointNodeIds:
            evaluation.missingNodeEndpointNodeIds,
          missingPostgresWireNodeIds:
            evaluation.missingPostgresWireNodeIds,
          controlPlaneTargetAddress:
            evaluation.controlPlaneTargetAddress,
          controlPlaneTargetCandidates:
            evaluation.controlPlaneTargetCandidates,
          controlPlaneTargetConnectionStates:
            evaluation.controlPlaneTargetConnectionStates,
          topologySnapshotEpoch:
            evaluation.topologySnapshotEpoch,
          appliedTopologyEpoch:
            evaluation.appliedTopologyEpoch,
          promotionState:
            evaluation.promotionState,
          promotionReasons:
            evaluation.promotionReasons,
          snapshotRevision:
            evaluation.snapshotRevision,
          snapshotRevisionState:
            evaluation.snapshotRevisionState,
          snapshotExpectedMinimumRevision:
            evaluation.snapshotExpectedMinimumRevision,
          snapshotRevisionGap:
            evaluation.snapshotRevisionGap,
          snapshotResumeToken:
            evaluation.snapshotResumeToken,
          snapshotError: options.snapshotError?.message || null,
        },
      );
    },

    recordObservedSnapshotRevisionMetadata(revisionMetadata = null) {
      const revision =
        Number.isFinite(revisionMetadata?.revision) ?
          Math.max(NUM.ZERO, Math.floor(revisionMetadata.revision)) :
          null;
      if (revision === null) {
        return;
      }
      if (
        this.highestObservedSnapshotRevision !== null &&
        revision < this.highestObservedSnapshotRevision
      ) {
        return;
      }
      this.highestObservedSnapshotRevision = revision;
      this.highestObservedSnapshotResumeToken =
        typeof revisionMetadata?.resumeToken === TYPEOF.STRING &&
        revisionMetadata.resumeToken.length > NUM.ZERO ?
          revisionMetadata.resumeToken :
          null;
    },

    recordObservedSnapshotFromSnapshot(snapshot = null) {
      if (!snapshot || typeof snapshot !== TYPEOF.OBJECT) {
        return;
      }
      this.recordObservedSnapshotRevisionMetadata({
        revision: snapshot.snapshotRevision,
        resumeToken: snapshot.snapshotResumeToken,
      });
    },

    /**
     * Resolve the published bootstrap topology snapshot metadata.
     * @return {Object|null}
     */
    resolveBootstrapTopologySnapshotMeta() {
      const delegateMeta =
        this.delegates.getBootstrapTopologySnapshotMeta?.();
      if (delegateMeta && typeof delegateMeta === TYPEOF.OBJECT) {
        return delegateMeta;
      }

      const bootstrapResponse = this.delegates.getBootstrapResponse?.();
      const responseMeta = bootstrapResponse?.topologySnapshotMeta;
      return responseMeta && typeof responseMeta === TYPEOF.OBJECT ?
        responseMeta :
        null;
    },

    /**
     * Resolve active node IDs published with the bootstrap topology snapshot.
     * @return {Array<string>}
     */
    resolveBootstrapTopologySnapshotActiveNodeIds() {
      const topologySnapshotMeta =
        this.resolveBootstrapTopologySnapshotMeta();
      if (!Array.isArray(topologySnapshotMeta?.activeNodeIds)) {
        return [];
      }

      return [...new Set(topologySnapshotMeta.activeNodeIds.filter((value) =>
        typeof value === TYPEOF.STRING && value.length > NUM.ZERO,
      ))];
    },

    /**
     * Resolve the published bootstrap topology epoch.
     * @return {number|null}
     */
    resolveBootstrapTopologySnapshotEpoch() {
      const delegatedEpoch =
        this.delegates.getBootstrapTopologySnapshotEpoch?.();
      if (Number.isFinite(delegatedEpoch)) {
        return Math.max(NUM.ZERO, Math.floor(delegatedEpoch));
      }
      const topologySnapshotMeta =
        this.resolveBootstrapTopologySnapshotMeta();
      if (Number.isFinite(topologySnapshotMeta?.topologyEpoch)) {
        return Math.max(
          NUM.ZERO,
          Math.floor(topologySnapshotMeta.topologyEpoch),
        );
      }

      const bootstrapResponse = this.delegates.getBootstrapResponse?.();
      if (Number.isFinite(bootstrapResponse?.currentEpoch?.epoch)) {
        return Math.max(
          NUM.ZERO,
          Math.floor(bootstrapResponse.currentEpoch.epoch),
        );
      }
      return null;
    },

    /**
     * Resolve the locally applied topology epoch watermark.
     * @param {Object|null} systemTableCache
     * @return {number}
     */
    resolveAppliedTopologyEpoch(systemTableCache) {
      if (typeof systemTableCache?.getEpoch === TYPEOF.FUNCTION) {
        const cacheEpoch = systemTableCache.getEpoch();
        if (Number.isFinite(cacheEpoch)) {
          return Math.max(NUM.ZERO, Math.floor(cacheEpoch));
        }
      }
      return NUM.ZERO;
    },

    /**
     * Determine whether the local cache has applied the bootstrap topology
     * epoch.
     * @param {Object} options
     * @return {boolean}
     */
    isBootstrapTopologyEpochSatisfied(options = {}) {
      if (!Number.isFinite(options.topologySnapshotEpoch)) {
        return true;
      }
      return Number.isFinite(options.appliedTopologyEpoch) &&
        options.appliedTopologyEpoch >= options.topologySnapshotEpoch;
    },

    /**
     * Rank one join-readiness reason according to stable precedence.
     * @param {string} reason
     * @return {number}
     */
    getJoinReadinessReasonRank(reason) {
      const index = joinReadinessReasonPrecedence.indexOf(reason);
      return index >= NUM.ZERO ?
        index :
        joinReadinessReasonPrecedence.length;
    },
  };
}

export {createJoinReadinessEvaluatorTailMethods};
