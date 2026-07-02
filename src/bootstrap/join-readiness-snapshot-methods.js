import {NodeService} from '../node/node-service.js';
import {
  ControlPlaneMessageType,
  getControlPlaneMessageRequiredTables,
} from '../control-plane/control-plane-constants.js';
import {
  getMissingSystemServiceLeaderCount,
} from '../cache/leader-readiness-gate.js';
import {
  resolveCanonicalRequiredSchemaVersion,
  resolveCanonicalAppliedSchemaVersion,
} from './join-schema-version-resolver.js';
import {
  ENDPOINT_STATUS,
  NODE_STATE,
  STATE,
  TABLES,
  TRANSPORT_TYPE,
} from '../constants/index.js';
import {ENDPOINT_SYNC_HEALTH} from '../runtime/endpoint-sync-constants.js';
import {META_SERVICE_ID} from '../constants/wasm-meta.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../control-plane/control-plane-readiness-constants.js';
import {
  normalizeNodeEndpointRow,
  normalizeNodeRow,
  normalizeServiceEndpointRow,
} from '../control-plane/system-row-normalizers.js';
import {
  getLocalQueryTransportReadiness,
  isLocalQueryTransportReady,
} from './shared/local-query-transport-readiness.js';
import {
  JOIN_READINESS_DEFAULT_TABLE,
} from './node-joining-constants.js';
import {
  resolveControlPlaneSnapshotRevisionMetadata,
} from '../control-plane/control-plane-snapshot-revision.js';

const LOCAL_STR_SELF = 'self';
const LOCAL_STR_UNKNOWN = 'unknown';

const JOIN_READINESS_ACTIVE_NODE_AUTHORITY_KIND = Object.freeze({
  READINESS_SERVICE: 'readiness_service',
  STARTUP_AUTHORITY: 'startup_authority',
  UNAVAILABLE: 'unavailable',
});

class JoinReadinessEvaluatorSnapshotMethods {
  /**
   * Determine the table scope for canonical join schema checks.
   * @return {string}
   */
  resolveJoinReadinessTableName() {
    const config = this.delegates.getConfig();
    if (typeof config.joinReadinessTableName === 'string') {
      const normalized =
        config.joinReadinessTableName.trim().toLowerCase();
      if (normalized.length > 0) {
        return normalized;
      }
    }
    return JOIN_READINESS_DEFAULT_TABLE;
  }

  /**
   * Collect one canonical join-readiness snapshot.
   * Provider errors are folded into a fail-closed snapshot.
   * @return {Promise<{snapshot: Object, error: Error|null}>}
   */
  async collectCanonicalJoinReadinessSnapshot() {
    const messageRouter = this.delegates.getMessageRouter();
    const context = {
      nodeId: this.nodeId,
      tableName: this.resolveJoinReadinessTableName(),
      bootstrapResponse: this.delegates.getBootstrapResponse(),
      systemTableCache: NodeService.getInstance().getSystemTableCache(),
      messageRouter,
      expectedMinimumRevision: this.highestObservedSnapshotRevision,
      expectedResumeToken: this.highestObservedSnapshotResumeToken,
    };

    try {
      const provider = this.delegates.getJoinReadinessSnapshotProvider();
      const snapshot = provider ?
        await provider(context) :
        this.buildCanonicalJoinReadinessSnapshot(context);
      this.recordObservedSnapshotFromSnapshot(snapshot);
      return {
        snapshot,
        error: null,
      };
    } catch (error) {
      return {
        snapshot: {
          nodeId: this.nodeId,
          tableName: context.tableName,
          routingReady: false,
          topologyReady: false,
          requiredSchemaVersion: null,
          appliedSchemaVersion: null,
        },
        error,
      };
    }
  }

  /**
   * Build canonical join-readiness snapshot from local control-plane state.
   * This is the owner that combines topology, endpoint visibility, routing,
   * and topology-epoch convergence into one readiness view.
   * @param {Object} context
   * @return {Object}
   */
  buildCanonicalJoinReadinessSnapshot(context = {}) {
    const systemTableCache = context.systemTableCache ||
      NodeService.getInstance().getSystemTableCache();
    const tableName =
      context.tableName || this.resolveJoinReadinessTableName();
    const topologySnapshotEpoch =
      this.resolveBootstrapTopologySnapshotEpoch();
    const appliedTopologyEpoch =
      this.resolveAppliedTopologyEpoch(systemTableCache);
    const targetCandidates =
      this.resolveJoinReadinessTargetCandidates();
    const targetAddress = targetCandidates[0] || null;
    const routingReady =
      this.isControlPlaneAddressReachable(targetAddress);
    const topology =
      this.evaluateCanonicalJoinTopologyReadiness(systemTableCache);
    const endpointVisibility =
      this.evaluateCanonicalJoinEndpointVisibility(systemTableCache);
    const bootstrapResponse = this.delegates.getBootstrapResponse();
    const requiredSchemaVersion = resolveCanonicalRequiredSchemaVersion(
      tableName,
      systemTableCache,
      bootstrapResponse?.systemTableSnapshots,
    );
    const appliedSchemaVersion = resolveCanonicalAppliedSchemaVersion(
      tableName,
      systemTableCache,
    );
    const expectedResumeToken =
      typeof context.expectedResumeToken === 'string' &&
      context.expectedResumeToken.length > 0 ?
        context.expectedResumeToken :
        this.highestObservedSnapshotResumeToken;
    const snapshotRevisionMetadata =
      resolveControlPlaneSnapshotRevisionMetadata({
        topologySnapshotEpoch,
        capturedAt:
          this.delegates.getBootstrapTopologySnapshotHydratedAtMs?.() ||
          null,
      }, {
        expectedResumeToken,
      });
    this.recordObservedSnapshotRevisionMetadata(snapshotRevisionMetadata);

    return {
      nodeId: this.nodeId,
      tableName,
      routingReady,
      topologyReady: topology.ready &&
        endpointVisibility.ready === true &&
        this.isBootstrapTopologyEpochSatisfied({
          topologySnapshotEpoch,
          appliedTopologyEpoch,
        }),
      controlPlaneTargetAddress: targetAddress,
      controlPlaneTargetCandidates: targetCandidates,
      controlPlaneTargetConnectionStates:
        this.resolveControlPlaneTargetConnectionStates(
          targetCandidates,
        ),
      topologySnapshotEpoch,
      appliedTopologyEpoch,
      requiredSchemaVersion,
      appliedSchemaVersion,
      snapshotRevision: snapshotRevisionMetadata.revision,
      snapshotRevisionSource: snapshotRevisionMetadata.revisionSource,
      snapshotRevisionState: snapshotRevisionMetadata.revisionState,
      snapshotExpectedMinimumRevision:
        snapshotRevisionMetadata.expectedMinimumRevision,
      snapshotRevisionGap: snapshotRevisionMetadata.revisionGap,
      snapshotResumeToken: snapshotRevisionMetadata.resumeToken,
      snapshotObservedAt: snapshotRevisionMetadata.observedAt,
      snapshotObservedAtMs: snapshotRevisionMetadata.observedAtMs,
      requiredNodeIds:
        this.resolveJoinReadinessRequiredNodeIds(systemTableCache),
      missingLeaders: topology.missingLeaders,
      inFlightReplicaOperations: topology.inFlightReplicaOperations,
      inFlightReplicaOperationDetails:
        topology.inFlightReplicaOperationDetails,
      excludedSelfTargetedCount:
        topology.excludedSelfTargetedCount,
      excludedWarmingTargetCount:
        topology.excludedWarmingTargetCount,
      excludedNonDiscoveryPartitionCount:
        topology.excludedNonDiscoveryPartitionCount,
      excludedRemotePriorityControlPlaneCount:
        topology.excludedRemotePriorityControlPlaneCount,
      excludedRemotePriorityControlPlaneOperationDetails:
        topology.excludedRemotePriorityControlPlaneOperationDetails,
      excludedSelfSourcePriorityControlPlaneCount:
        topology.excludedSelfSourcePriorityControlPlaneCount,
      excludedSelfSourcePriorityControlPlaneOperationDetails:
        topology.excludedSelfSourcePriorityControlPlaneOperationDetails,
      missingNodeEndpointNodeIds:
        endpointVisibility.missingNodeEndpointNodeIds,
      missingPostgresWireNodeIds:
        endpointVisibility.missingPostgresWireNodeIds,
    };
  }

  /**
   * Check whether control-plane target address is currently reachable.
   * @param {string|null} targetAddress
   * @return {boolean}
   */
  isControlPlaneAddressReachable(targetAddress) {
    if (typeof targetAddress !== 'string' ||
        targetAddress.length === 0) {
      return false;
    }

    const match = targetAddress.match(/^([^/]+)\//);
    const targetNodeId = match ? match[1] : null;
    if (!targetNodeId) {
      return false;
    }
    if (targetNodeId === this.nodeId) {
      const readiness = getLocalQueryTransportReadiness(
        this.delegates.getMessageRouter?.() || null,
      );
      if (isLocalQueryTransportReady(readiness)) {
        return true;
      }
      return this.resolveJoinReadinessTargetCandidates()
        .includes(targetAddress);
    }

    const messageRouter = this.delegates.getMessageRouter();
    if (typeof messageRouter?.getConnectionState !== 'function') {
      return true;
    }
    return messageRouter.getConnectionState(targetNodeId) ===
      STATE.CONNECTED;
  }

  /**
   * Resolve ordered control-plane target candidates for readiness checks.
   * Local ingress is included because READY publication is allowed to route
   * through a live local kernel path when available.
   * @return {Array<string>}
   */
  resolveJoinReadinessTargetCandidates() {
    if (
      typeof this.delegates.resolveControlPlaneTargetAddressCandidates ===
      'function'
    ) {
      const candidates =
        this.delegates.resolveControlPlaneTargetAddressCandidates({
          allowBootstrapHints: true,
          allowSelfTarget: true,
          localTargetMode: 'any_replica',
          requiredTables: getControlPlaneMessageRequiredTables(
            ControlPlaneMessageType.NODE_STATE_UPDATE,
          ),
        });
      return Array.isArray(candidates) ?
        [...new Set(candidates.filter((value) =>
          typeof value === 'string' && value.length > 0,
        ))] :
        [];
    }

    if (typeof this.delegates.resolveControlPlaneTargetAddress !==
        'function') {
      return [];
    }

    const candidates = [
      this.delegates.resolveControlPlaneTargetAddress({
        allowBootstrapHints: false,
        allowSelfTarget: true,
        localTargetMode: 'any_replica',
        requiredTables: getControlPlaneMessageRequiredTables(
          ControlPlaneMessageType.NODE_STATE_UPDATE,
        ),
      }),
      this.delegates.resolveControlPlaneTargetAddress({
        allowBootstrapHints: true,
        allowSelfTarget: true,
        localTargetMode: 'any_replica',
        requiredTables: getControlPlaneMessageRequiredTables(
          ControlPlaneMessageType.NODE_STATE_UPDATE,
        ),
      }),
    ];
    return [...new Set(candidates.filter((value) =>
      typeof value === 'string' && value.length > 0,
    ))];
  }

  /**
   * Resolve per-target router connection states for diagnostics.
   * @param {Array<string>} targetCandidates
   * @return {Object|null}
   */
  resolveControlPlaneTargetConnectionStates(targetCandidates) {
    if (!Array.isArray(targetCandidates) ||
        targetCandidates.length === 0) {
      return null;
    }

    const messageRouter = this.delegates.getMessageRouter();
    const connectionStates = {};
    for (const targetAddress of targetCandidates) {
      if (typeof targetAddress !== 'string' ||
          targetAddress.length === 0) {
        continue;
      }
      const match = targetAddress.match(/^([^/]+)\//);
      const targetNodeId = match ? match[1] : null;
      if (!targetNodeId) {
        connectionStates[targetAddress] = null;
        continue;
      }
      if (targetNodeId === this.nodeId) {
        const readiness = getLocalQueryTransportReadiness(
          messageRouter || null,
        );
        connectionStates[targetAddress] =
          isLocalQueryTransportReady(readiness) ?
            LOCAL_STR_SELF :
            `self:${readiness.state || LOCAL_STR_UNKNOWN}`;
        continue;
      }
      if (typeof messageRouter?.getConnectionState !== 'function') {
        connectionStates[targetAddress] = null;
        continue;
      }
      connectionStates[targetAddress] =
        messageRouter.getConnectionState(targetNodeId) || null;
    }
    return Object.keys(connectionStates).length > 0 ?
      connectionStates :
      null;
  }

  /**
   * Evaluate topology readiness for canonical join convergence.
   * @param {Object|null} systemTableCache
   * @return {{
   *   ready: boolean,
   *   missingLeaders: Object|null,
   *   inFlightReplicaOperations: number,
   *   inFlightReplicaOperationDetails: Array<Object>,
   *   excludedSelfTargetedCount: number,
   *   excludedWarmingTargetCount: number,
   *   excludedNonDiscoveryPartitionCount: number,
   *   excludedRemotePriorityControlPlaneCount: number,
   *   excludedRemotePriorityControlPlaneOperationDetails: Array<Object>,
   *   excludedSelfSourcePriorityControlPlaneCount: number,
   *   excludedSelfSourcePriorityControlPlaneOperationDetails: Array<Object>,
   * }}
   */
  evaluateCanonicalJoinTopologyReadiness(systemTableCache) {
    if (!systemTableCache) {
      return {
        ready: false,
        missingLeaders: null,
        inFlightReplicaOperations: 0,
        inFlightReplicaOperationDetails: [],
        excludedSelfTargetedCount: 0,
        excludedWarmingTargetCount: 0,
        excludedNonDiscoveryPartitionCount: 0,
        excludedRemotePriorityControlPlaneCount: 0,
        excludedRemotePriorityControlPlaneOperationDetails: [],
        excludedSelfSourcePriorityControlPlaneCount: 0,
        excludedSelfSourcePriorityControlPlaneOperationDetails: [],
        missingNodeEndpointNodeIds: [],
        missingPostgresWireNodeIds: [],
      };
    }

    let missingLeaders = null;
    let missingCount = Number.POSITIVE_INFINITY;
    try {
      const missing =
        this.delegates.getMissingSystemServiceLeaders(systemTableCache);
      missingLeaders = this.delegates.getBlockingSystemServiceLeaders(
        missing,
        systemTableCache,
      );
      missingCount = getMissingSystemServiceLeaderCount(missingLeaders);
    } catch (_evalErr) {
      missingLeaders = null;
      missingCount = Number.POSITIVE_INFINITY;
    }

    const operationDetails =
      this.collectCanonicalInFlightReplicaOperationDetails(
        systemTableCache,
      );
    const inFlightReplicaOperationDetails =
      operationDetails.inFlightOperations;
    const inFlightReplicaOperations =
      inFlightReplicaOperationDetails.length;
    const excludedSelfTargetedCount =
      operationDetails.excludedSelfTargetedCount;
    const excludedWarmingTargetCount =
      operationDetails.excludedWarmingTargetCount;
    const excludedNonDiscoveryPartitionCount =
      operationDetails.excludedNonDiscoveryPartitionCount;
    const excludedRemotePriorityControlPlaneCount =
      operationDetails.excludedRemotePriorityControlPlaneCount;
    const excludedSelfSourcePriorityControlPlaneCount =
      operationDetails.excludedSelfSourcePriorityControlPlaneCount;
    return {
      ready: missingCount === 0 &&
        inFlightReplicaOperations === 0,
      missingLeaders,
      inFlightReplicaOperations,
      inFlightReplicaOperationDetails,
      excludedSelfTargetedCount,
      excludedWarmingTargetCount,
      excludedNonDiscoveryPartitionCount,
      excludedRemotePriorityControlPlaneCount,
      excludedRemotePriorityControlPlaneOperationDetails:
        operationDetails.excludedRemotePriorityControlPlaneOperationDetails,
      excludedSelfSourcePriorityControlPlaneCount,
      excludedSelfSourcePriorityControlPlaneOperationDetails:
        operationDetails
          .excludedSelfSourcePriorityControlPlaneOperationDetails,
      missingNodeEndpointNodeIds: [],
      missingPostgresWireNodeIds: [],
    };
  }

  /**
   * Ensure local discovery-critical endpoint rows cover this joining node.
   * Peer endpoint visibility converges independently and should not block the
   * local node from becoming ready once authoritative topology is otherwise
   * settled.
   * @param {Object|null} systemTableCache
   * @return {{
   *   ready: boolean,
   *   missingNodeEndpointNodeIds: string[],
   *   missingPostgresWireNodeIds: string[],
   * }}
   */
  evaluateCanonicalJoinEndpointVisibility(systemTableCache) {
    if (!systemTableCache ||
        typeof systemTableCache.getAll !== 'function') {
      return {
        ready: false,
        missingNodeEndpointNodeIds: [],
        missingPostgresWireNodeIds: [],
      };
    }

    const requiredNodeIds = [this.nodeId];

    const nodeEndpointRows =
      systemTableCache.getAll(TABLES.NODE_ENDPOINTS) || [];
    const serviceEndpointRows =
      systemTableCache.getAll(TABLES.SERVICE_ENDPOINTS) || [];
    const visibleNodeEndpointNodeIds = new Set();
    const visiblePostgresWireNodeIds = new Set();

    for (const row of nodeEndpointRows) {
      const normalizedRow = normalizeNodeEndpointRow(row);
      const {nodeId, transportType, status} = normalizedRow;
      if (nodeId.length === 0) {
        continue;
      }
      if (status !==
          String(ENDPOINT_STATUS.ACTIVE).toLowerCase()) {
        continue;
      }
      if (transportType !==
          String(TRANSPORT_TYPE.WEBSOCKET).toLowerCase()) {
        continue;
      }
      visibleNodeEndpointNodeIds.add(nodeId);
    }

    for (const row of serviceEndpointRows) {
      const normalizedRow = normalizeServiceEndpointRow(row);
      const {nodeId, serviceId, healthStatus} = normalizedRow;
      if (nodeId.length === 0) {
        continue;
      }
      if (serviceId !== META_SERVICE_ID.POSTGRES_WIRE) {
        continue;
      }
      if (healthStatus !==
          String(ENDPOINT_SYNC_HEALTH.HEALTHY).toLowerCase()) {
        continue;
      }
      visiblePostgresWireNodeIds.add(nodeId);
    }

    const missingNodeEndpointNodeIds = requiredNodeIds.filter(
      (nodeId) => !visibleNodeEndpointNodeIds.has(nodeId),
    );
    const missingPostgresWireNodeIds = requiredNodeIds.filter(
      (nodeId) => !visiblePostgresWireNodeIds.has(nodeId),
    );

    return {
      ready: missingNodeEndpointNodeIds.length === 0 &&
        missingPostgresWireNodeIds.length === 0,
      missingNodeEndpointNodeIds,
      missingPostgresWireNodeIds,
    };
  }

  /**
   * Return node ids admitted by readiness-owned startup authority.
   * @param {Object|null} systemTableCache
   * @return {string[]}
   */
  getCanonicalJoinActiveNodeIds(systemTableCache) {
    return this.resolveCanonicalJoinActiveNodeAuthority(
      systemTableCache,
    ).nodeIds;
  }

  /**
   * Resolve the single authority that can identify active peers for canonical
   * join readiness.
   * @param {Object|null} systemTableCache
   * @return {{kind: string, nodeIds: string[]}}
   */
  resolveCanonicalJoinActiveNodeAuthority(systemTableCache) {
    const readinessService =
      this.delegates.getControlPlaneReadinessService?.() || null;
    const cacheNodeRows =
      systemTableCache &&
      typeof systemTableCache.getAll === 'function' ?
        systemTableCache.getAll(TABLES.NODES) || [] :
        [];
    const startupAuthority =
      this.resolveStartupAuthorityActiveNodeAuthority(readinessService);
    if (startupAuthority.available) {
      return Object.freeze({
        kind: JOIN_READINESS_ACTIVE_NODE_AUTHORITY_KIND.STARTUP_AUTHORITY,
        nodeIds: startupAuthority.nodeIds,
      });
    }
    const readinessActiveNodeIds =
      this.getReadinessActiveNodeIds(
        readinessService,
        cacheNodeRows,
      );
    const candidates = Object.freeze([{
      kind: JOIN_READINESS_ACTIVE_NODE_AUTHORITY_KIND.READINESS_SERVICE,
      nodeIds: readinessActiveNodeIds,
    }]);
    const selected = candidates.find((candidate) =>
      candidate.nodeIds.length > 0,
    );
    return Object.freeze(selected || {
      kind: JOIN_READINESS_ACTIVE_NODE_AUTHORITY_KIND.UNAVAILABLE,
      nodeIds: [],
    });
  }

  getCacheActiveNodeIds(nodeRows) {
    const activeNodeIds = [];
    for (const row of Array.isArray(nodeRows) ? nodeRows : []) {
      const normalizedRow = normalizeNodeRow(row);
      const {nodeId, status} = normalizedRow;
      if (nodeId.length === 0) {
        continue;
      }
      if (status === String(NODE_STATE.ACTIVE).toLowerCase()) {
        activeNodeIds.push(nodeId);
      }
    }
    return [...new Set(activeNodeIds)];
  }

  getReadinessActiveNodeIds(readinessService, nodeRows) {
    if (typeof readinessService?.getNodeReadinessSync !== 'function') {
      return [];
    }
    const activeNodeIds = [];
    for (const row of nodeRows) {
      const normalizedRow = normalizeNodeRow(row);
      const {nodeId} = normalizedRow;
      if (nodeId.length === 0) {
        continue;
      }
      const readiness = readinessService.getNodeReadinessSync(
        nodeId,
        {
          decisionDimension:
            CONTROL_PLANE_READINESS_DIMENSION
              .CONTROL_PLANE_RECOVERY_ELIGIBLE,
        },
      );
      if (readiness?.dimensions?.[
        CONTROL_PLANE_READINESS_DIMENSION
          .CONTROL_PLANE_RECOVERY_ELIGIBLE
      ] === true) {
        activeNodeIds.push(nodeId);
      }
    }
    return activeNodeIds;
  }

  resolveStartupAuthorityActiveNodeAuthority(readinessService) {
    if (typeof readinessService?.getStartupAuthoritySnapshotSync !==
        'function') {
      return Object.freeze({available: false, nodeIds: []});
    }
    const startupAuthority = readinessService.getStartupAuthoritySnapshotSync(
      this.nodeId,
      this.now(),
    );
    if (
      startupAuthority?.authorityAvailable !== true ||
      !Array.isArray(startupAuthority?.canonicalStartupNodeIds)
    ) {
      return Object.freeze({available: false, nodeIds: []});
    }
    return Object.freeze({
      available: true,
      nodeIds: [...new Set(
        startupAuthority.canonicalStartupNodeIds.filter((nodeId) =>
          typeof nodeId === 'string' && nodeId.length > 0,
        ),
      )],
    });
  }

  getStartupAuthorityActiveNodeIds(readinessService) {
    return this.resolveStartupAuthorityActiveNodeAuthority(
      readinessService,
    ).nodeIds;
  }
}

function createJoinReadinessEvaluatorSnapshotMethods() {
  const descriptors = Object.getOwnPropertyDescriptors(
    JoinReadinessEvaluatorSnapshotMethods.prototype,
  );
  delete descriptors.constructor;
  return descriptors;
}

export {createJoinReadinessEvaluatorSnapshotMethods};
