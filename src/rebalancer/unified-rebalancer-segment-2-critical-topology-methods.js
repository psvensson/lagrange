import {UNIFIED_REBALANCER_SHARED} from './unified-rebalancer-shared.js';

const {
  COLUMN,
  CONTROL_PLANE_READINESS_DIMENSION,
  CRITICAL_SYSTEM_ENDPOINT_VISIBILITY_AUTHORITATIVE_READ,
  CRITICAL_SYSTEM_TOPOLOGY_SETTLING_BLOCKER_REASON,
  ENDPOINT_STATUS,
  ENDPOINT_SYNC_HEALTH,
  META_SERVICE_ID,
  NUM,
  NodeStatus,
  REBALANCER_LOG_MSG,
  REPLICA_OPERATION_VISIBILITY_READ_MODE,
  SYSTEM_TABLE_NAME,
  TABLES,
  TOPOLOGY_IN_FLIGHT_REPLICA_OPERATION_SOURCE,
  TRANSPORT_TYPE,
  TYPEOF,
  UNIFIED_REBALANCER_LITERAL,
  isNodeReadyLeaseExplicitlyCleared,
  normalizeNodeEndpointRow,
  normalizeNodeRow,
  normalizeServiceEndpointRow,
} = UNIFIED_REBALANCER_SHARED;

const SEGMENT_2_CRITICAL_TOPOLOGY_CONSTRUCTOR = 'constructor';

class UnifiedRebalancerSegment2CriticalTopologyMethods {
  /**
   * Return one blocker summary when critical system-partition rebalancing
   * should wait for cluster topology convergence.
   *
   * A joining or restarting cluster should not start background system-table
   * redistribution while nodes are still progressing through non-terminal
   * membership states, while endpoint publication is incomplete, or while
   * control-plane topology operations are still in flight. Hard failures
   * remain actionable and do not block.
   *
   * @return {Object|null}
   * @private
   */
  getCriticalSystemTopologySettlingBlocker() {
    if (!this.isSystemPartitionEntity()) {
      return null;
    }
    const nodeRows =
      typeof this.systemTableCache?.getAll === TYPEOF.FUNCTION ?
        this.systemTableCache.getAll(SYSTEM_TABLE_NAME.NODES) :
        [];
    if (
      !Array.isArray(nodeRows) ||
      nodeRows.length === UNIFIED_REBALANCER_LITERAL.ZERO
    ) {
      return null;
    }

    let hasTransitionalNode = false;
    let hasFailedNode = false;
    const startupAuthorityNodeIds = this.getStartupAuthorityNodeIdSet();
    const constrainToStartupAuthority =
      startupAuthorityNodeIds instanceof Set &&
      startupAuthorityNodeIds.size > NUM.ZERO;
    const bypassPriorityStartupReadiness =
      this.shouldBypassLocalPriorityControlPlaneStartupReadiness();
    const readinessDecisionDimension =
      this.resolveNodeReadinessDecisionDimension();
    const activeMembershipNodeIds = [];
    const activeNodeIds = [];
    const unreadyNodeIds = [];
    for (const nodeRow of nodeRows) {
      const normalizedNode = normalizeNodeRow(nodeRow);
      const {status, nodeId} = normalizedNode;
      if (
        constrainToStartupAuthority &&
        !startupAuthorityNodeIds.has(nodeId)
      ) {
        continue;
      }
      if (!status) {
        continue;
      }
      if (status === NodeStatus.FAILED) {
        hasFailedNode = true;
        continue;
      }
      if (
        status !== NodeStatus.ACTIVE ||
        nodeId.length === UNIFIED_REBALANCER_LITERAL.ZERO
      ) {
        hasTransitionalNode = true;
        if (nodeId.length > UNIFIED_REBALANCER_LITERAL.ZERO) {
          unreadyNodeIds.push(nodeId);
        }
        continue;
      }
      activeMembershipNodeIds.push(nodeId);
      const readiness =
        this.controlPlaneReadinessService &&
        typeof this.controlPlaneReadinessService.getNodeReadinessSync ===
          TYPEOF.FUNCTION ?
          this.controlPlaneReadinessService.getNodeReadinessSync(nodeId, {
            allowStaleOnCacheChange: false,
          }) :
          null;
      const nodeMembershipReady = this.isReadinessDimensionSatisfied(
        readiness,
        readinessDecisionDimension,
      );
      const localPriorityStartupLeaseClear =
        bypassPriorityStartupReadiness &&
        nodeId === this.nodeId &&
        isNodeReadyLeaseExplicitlyCleared(nodeRow, {
          requireActiveStatus: true,
        });
      if (localPriorityStartupLeaseClear) {
        activeNodeIds.push(nodeId);
        continue;
      }
      if (!nodeMembershipReady) {
        hasTransitionalNode = true;
        unreadyNodeIds.push(nodeId);
        continue;
      }
      activeNodeIds.push(nodeId);
    }

    if (hasTransitionalNode && !hasFailedNode) {
      const requiredHealthyNodeCount =
        this.resolveCriticalSystemRequiredHealthyNodeCount(
          activeMembershipNodeIds.length,
        );
      const hasRequiredHealthyNodes =
        activeNodeIds.length >= requiredHealthyNodeCount;
      const priorityRecoveryMayProceedOnQuorum =
        this.isControlPlanePriorityPartition() &&
        !this.isControlPlanePublicationPriorityPartition() &&
        hasRequiredHealthyNodes;
      if (priorityRecoveryMayProceedOnQuorum) {
        // Priority spread may proceed once quorum is ready; additional ACTIVE
        // nodes can still be converging without stalling every priority table.
      } else {
        return Object.freeze({
          reason:
            unreadyNodeIds.length > UNIFIED_REBALANCER_LITERAL.ZERO ?
              CRITICAL_SYSTEM_TOPOLOGY_SETTLING_BLOCKER_REASON.NODE_READY_LEASE_INCOMPLETE :
              CRITICAL_SYSTEM_TOPOLOGY_SETTLING_BLOCKER_REASON.TRANSITIONAL_NODE_MEMBERSHIP,
          unreadyNodeIds: Object.freeze([...unreadyNodeIds]),
          requiredHealthyNodeCount,
          healthyNodeCount: activeNodeIds.length,
          activeMembershipNodeCount: activeMembershipNodeIds.length,
        });
      }
    }

    const connectedNodeIds = this.resolveConnectedClusterNodeIds();
    if (connectedNodeIds.size > UNIFIED_REBALANCER_LITERAL.ZERO) {
      const knownNodeIds = new Set(
        nodeRows
          .map((nodeRow) => {
            return normalizeNodeRow(nodeRow).nodeId;
          })
          .filter(
            (nodeId) =>
              typeof nodeId === TYPEOF.STRING &&
              nodeId.length > NUM.ZERO &&
              (
                !constrainToStartupAuthority ||
                startupAuthorityNodeIds.has(nodeId)
              ),
          ),
      );
      const requiredHealthyNodeCount =
        this.resolveCriticalSystemRequiredHealthyNodeCount(
          activeMembershipNodeIds.length,
        );
      const hasRequiredHealthyNodes =
        activeNodeIds.length >= requiredHealthyNodeCount;
      const publishedActiveNodeIds =
        this.isControlPlanePriorityPartition() && hasRequiredHealthyNodes ?
          this.getPublishedActiveNodeIdSet() :
          null;
      for (const connectedNodeId of connectedNodeIds) {
        if (
          constrainToStartupAuthority &&
          !startupAuthorityNodeIds.has(connectedNodeId)
        ) {
          continue;
        }
        if (knownNodeIds.has(connectedNodeId)) {
          continue;
        }
        // Once priority recovery has a healthy quorum, published membership is
        // the canonical topology contract. Transport-vs-nodes cache lag should
        // not reopen the settling gate for either published or unpublished
        // peers in that lane.
        if (publishedActiveNodeIds) {
          continue;
        }
        return Object.freeze({
          reason:
            CRITICAL_SYSTEM_TOPOLOGY_SETTLING_BLOCKER_REASON.TRANSPORT_MEMBERSHIP_EXCEEDS_NODES_CACHE,
          connectedNodeId,
        });
      }
    }

    const endpointVisibilityPolicy =
      this.getCriticalSystemEndpointVisibilityPolicy(activeNodeIds);
    const endpointVisibility = this.evaluateCriticalSystemEndpointVisibility(
      activeNodeIds,
      endpointVisibilityPolicy,
    );
    if (endpointVisibility.ready !== true) {
      return Object.freeze({
        reason:
          CRITICAL_SYSTEM_TOPOLOGY_SETTLING_BLOCKER_REASON.ENDPOINT_VISIBILITY_INCOMPLETE,
        ...endpointVisibility,
      });
    }

    const inFlightTopologyOperations =
      this.collectCriticalSystemInFlightReplicaOperations(activeNodeIds, {
        // Topology settling should only wait on in-flight operations that
        // mutate this same entity. Unrelated critical-system operations must
        // not serialize every other partition behind one active move.
        scopeToEntity: true,
      });
    if (inFlightTopologyOperations.count > NUM.ZERO) {
      return Object.freeze({
        reason:
          CRITICAL_SYSTEM_TOPOLOGY_SETTLING_BLOCKER_REASON.TOPOLOGY_OPERATIONS_IN_FLIGHT,
        activeNodeIds: Object.freeze([...activeNodeIds]),
        inFlightReplicaOperations: inFlightTopologyOperations.count,
        inFlightReplicaOperationDetails: inFlightTopologyOperations.details,
        inFlightReplicaOperationsSource:
          inFlightTopologyOperations.source || null,
      });
    }

    return null;
  }

  /**
   * Return true when critical system-partition rebalancing should wait for
   * topology convergence.
   *
   * @return {boolean}
   * @private
   */
  isCriticalSystemTopologySettling() {
    return this.getCriticalSystemTopologySettlingBlocker() !== null;
  }

  /**
   * Return the required node ids encoded in one endpoint-visibility blocker.
   *
   * @param {Object|null} blocker
   * @return {string[]}
   * @private
   */
  getCriticalSystemEndpointVisibilityRequiredNodeIds(blocker) {
    return [
      ...new Set(
        [
          ...(Array.isArray(blocker?.endpointReadyNodeIds) ?
            blocker.endpointReadyNodeIds :
            []),
          ...(Array.isArray(blocker?.missingNodeEndpointNodeIds) ?
            blocker.missingNodeEndpointNodeIds :
            []),
          ...(Array.isArray(blocker?.missingPostgresWireNodeIds) ?
            blocker.missingPostgresWireNodeIds :
            []),
        ].filter(
          (nodeId) =>
            typeof nodeId === TYPEOF.STRING && nodeId.length > NUM.ZERO,
        ),
      ),
    ];
  }

  /**
   * Read authoritative endpoint rows for one set of required node ids.
   *
   * @param {string} tableName
   * @param {string[]} requiredNodeIds
   * @param {Object} [options={}]
   * @param {string|null} [options.serviceId=null]
   * @return {Promise<Object|null>}
   * @private
   */
  async readCriticalSystemEndpointVisibilityAuthoritativeRows(
    tableName,
    requiredNodeIds,
    options = {},
  ) {
    if (
      !this.controlPlaneSystemTableGateway ||
      typeof this.controlPlaneSystemTableGateway.readAuthoritativeRows !==
        TYPEOF.FUNCTION
    ) {
      return null;
    }
    const normalizedNodeIds = [
      ...new Set(
        (Array.isArray(requiredNodeIds) ? requiredNodeIds : []).filter(
          (nodeId) =>
            typeof nodeId === TYPEOF.STRING && nodeId.length > NUM.ZERO,
        ),
      ),
    ];
    if (normalizedNodeIds.length === NUM.ZERO) {
      return null;
    }

    const placeholders = normalizedNodeIds.map(() => '?').join(', ');
    const params = [...normalizedNodeIds];
    let sql =
      `SELECT * FROM ${tableName} ` +
      `WHERE ${COLUMN.NODE_ID} IN (${placeholders})`;
    if (
      typeof options?.serviceId === TYPEOF.STRING &&
      options.serviceId.length > NUM.ZERO
    ) {
      sql += ` AND ${COLUMN.SERVICE_ID} = ?`;
      params.push(options.serviceId);
    }

    return this.controlPlaneSystemTableGateway.readAuthoritativeRows(
      tableName,
      sql,
      params,
      {
        owner: CRITICAL_SYSTEM_ENDPOINT_VISIBILITY_AUTHORITATIVE_READ.OWNER,
        queryTimeoutMs: this.criticalCheckDelayMs,
        routingReadinessDimension:
          CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
      },
    );
  }

  /**
   * Build one endpoint-visibility summary from explicit row evidence.
   *
   * @param {string[]} requiredNodeIds
   * @param {Object[]} nodeEndpointRows
   * @param {Object[]} serviceEndpointRows
   * @param {Object} [options={}]
   * @param {boolean} [options.allowReadinessBackfill=true]
   * @param {number} [options.requiredReadyNodeCount]
   * @return {Object}
   * @private
   */
  summarizeCriticalSystemEndpointVisibility(
    requiredNodeIds,
    nodeEndpointRows,
    serviceEndpointRows,
    options = {},
  ) {
    const normalizedRequiredNodeIds = Array.isArray(requiredNodeIds) ?
      [
        ...new Set(
          requiredNodeIds.filter(
            (nodeId) =>
              typeof nodeId === TYPEOF.STRING && nodeId.length > NUM.ZERO,
          ),
        ),
      ] :
      [];
    const allowReadinessBackfill = options?.allowReadinessBackfill !== false;
    const configuredRequiredReadyNodeCount =
      Number.isInteger(options?.requiredReadyNodeCount) &&
      options.requiredReadyNodeCount > NUM.ZERO ?
        options.requiredReadyNodeCount :
        normalizedRequiredNodeIds.length;
    const requiredReadyNodeCount =
      normalizedRequiredNodeIds.length > NUM.ZERO ?
        Math.max(
          NUM.ONE,
          Math.min(
            normalizedRequiredNodeIds.length,
            configuredRequiredReadyNodeCount,
          ),
        ) :
        NUM.ZERO;
    if (normalizedRequiredNodeIds.length === NUM.ZERO) {
      return Object.freeze({
        ready: false,
        missingNodeEndpointNodeIds: [],
        missingPostgresWireNodeIds: [],
        endpointReadyNodeCount: NUM.ZERO,
        requiredReadyNodeCount,
        endpointReadyNodeIds: [],
      });
    }

    const visibleNodeEndpointNodeIds = new Set();
    const visiblePostgresWireNodeIds = new Set();
    const readinessVisibleNodeIds = new Set();
    const readinessWritableNodeIds = new Set();

    for (const row of Array.isArray(nodeEndpointRows) ? nodeEndpointRows : []) {
      const normalizedRow = normalizeNodeEndpointRow(row);
      const {nodeId, status, transportType} = normalizedRow;
      if (
        !nodeId ||
        status !== String(ENDPOINT_STATUS.ACTIVE).toLowerCase() ||
        transportType !== String(TRANSPORT_TYPE.WEBSOCKET).toLowerCase()
      ) {
        continue;
      }
      visibleNodeEndpointNodeIds.add(nodeId);
    }

    for (const row of Array.isArray(serviceEndpointRows) ?
      serviceEndpointRows :
      []) {
      const normalizedRow = normalizeServiceEndpointRow(row);
      const {nodeId, serviceId, healthStatus} = normalizedRow;
      if (
        !nodeId ||
        serviceId !== META_SERVICE_ID.POSTGRES_WIRE ||
        healthStatus !== String(ENDPOINT_SYNC_HEALTH.HEALTHY).toLowerCase()
      ) {
        continue;
      }
      visiblePostgresWireNodeIds.add(nodeId);
    }

    if (
      this.controlPlaneReadinessService &&
      typeof this.controlPlaneReadinessService.getNodeReadinessSync ===
        TYPEOF.FUNCTION
    ) {
      for (const nodeId of normalizedRequiredNodeIds) {
        const readiness =
          this.controlPlaneReadinessService.getNodeReadinessSync(nodeId, {
            allowStaleOnCacheChange: false,
          });
        if (
          this.isReadinessDimensionSatisfied(
            readiness,
            CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY,
          )
        ) {
          readinessVisibleNodeIds.add(nodeId);
        }
        if (
          this.isReadinessDimensionSatisfied(
            readiness,
            CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE,
          )
        ) {
          readinessWritableNodeIds.add(nodeId);
        }
      }
    }

    const readinessBackedNodeEndpointNodeIds = new Set(
      normalizedRequiredNodeIds.filter(
        (nodeId) =>
          readinessVisibleNodeIds.has(nodeId) &&
          visiblePostgresWireNodeIds.has(nodeId),
      ),
    );
    const readinessBackedPostgresWireNodeIds = new Set(
      normalizedRequiredNodeIds.filter(
        (nodeId) =>
          readinessWritableNodeIds.has(nodeId) &&
          visibleNodeEndpointNodeIds.has(nodeId),
      ),
    );
    const effectiveNodeEndpointNodeIds = new Set(
      allowReadinessBackfill ?
        [...visibleNodeEndpointNodeIds, ...readinessBackedNodeEndpointNodeIds] :
        [...visibleNodeEndpointNodeIds],
    );
    const effectivePostgresWireNodeIds = new Set(
      allowReadinessBackfill ?
        [...visiblePostgresWireNodeIds, ...readinessBackedPostgresWireNodeIds] :
        [...visiblePostgresWireNodeIds],
    );
    const missingNodeEndpointNodeIds = normalizedRequiredNodeIds.filter(
      (nodeId) => !effectiveNodeEndpointNodeIds.has(nodeId),
    );
    const missingPostgresWireNodeIds = normalizedRequiredNodeIds.filter(
      (nodeId) => !effectivePostgresWireNodeIds.has(nodeId),
    );
    const endpointReadyNodeIds = normalizedRequiredNodeIds.filter(
      (nodeId) =>
        effectiveNodeEndpointNodeIds.has(nodeId) &&
        effectivePostgresWireNodeIds.has(nodeId),
    );
    return Object.freeze({
      ready: endpointReadyNodeIds.length >= requiredReadyNodeCount,
      allowReadinessBackfill,
      missingNodeEndpointNodeIds,
      missingPostgresWireNodeIds,
      endpointReadyNodeCount: endpointReadyNodeIds.length,
      requiredReadyNodeCount,
      endpointReadyNodeIds,
      readinessBackedNodeEndpointNodeIds: Object.freeze([
        ...readinessBackedNodeEndpointNodeIds,
      ]),
      readinessBackedPostgresWireNodeIds: Object.freeze([
        ...readinessBackedPostgresWireNodeIds,
      ]),
    });
  }

  /**
   * Revalidate in-flight topology blockers with authoritative entity
   * operations to avoid stale cache observations deadlocking planning.
   *
   * @param {Object|null} blocker
   * @return {Promise<Object|null>}
   * @private
   */
  async revalidateCriticalSystemTopologySettlingBlocker(blocker) {
    if (!blocker) {
      return blocker;
    }
    if (
      blocker.reason ===
      CRITICAL_SYSTEM_TOPOLOGY_SETTLING_BLOCKER_REASON.ENDPOINT_VISIBILITY_INCOMPLETE
    ) {
      const requiredNodeIds =
        this.getCriticalSystemEndpointVisibilityRequiredNodeIds(blocker);
      if (requiredNodeIds.length === NUM.ZERO) {
        return blocker;
      }
      try {
        const [
          authoritativeNodeEndpointRead,
          authoritativeServiceEndpointRead,
        ] = await Promise.all([
          this.readCriticalSystemEndpointVisibilityAuthoritativeRows(
            TABLES.NODE_ENDPOINTS,
            requiredNodeIds,
          ),
          this.readCriticalSystemEndpointVisibilityAuthoritativeRows(
            TABLES.SERVICE_ENDPOINTS,
            requiredNodeIds,
            {serviceId: META_SERVICE_ID.POSTGRES_WIRE},
          ),
        ]);
        const nodeEndpointRows =
          typeof this.systemTableCache?.getAll === TYPEOF.FUNCTION ?
            [
              ...this.systemTableCache.getAll(TABLES.NODE_ENDPOINTS),
              ...(authoritativeNodeEndpointRead?.success === true ?
                authoritativeNodeEndpointRead.rows || [] :
                []),
            ] :
            authoritativeNodeEndpointRead?.success === true ?
              authoritativeNodeEndpointRead.rows || [] :
              [];
        const serviceEndpointRows =
          typeof this.systemTableCache?.getAll === TYPEOF.FUNCTION ?
            [
              ...this.systemTableCache.getAll(TABLES.SERVICE_ENDPOINTS),
              ...(authoritativeServiceEndpointRead?.success === true ?
                authoritativeServiceEndpointRead.rows || [] :
                []),
            ] :
            authoritativeServiceEndpointRead?.success === true ?
              authoritativeServiceEndpointRead.rows || [] :
              [];
        const endpointVisibility =
          this.summarizeCriticalSystemEndpointVisibility(
            requiredNodeIds,
            nodeEndpointRows,
            serviceEndpointRows,
            {
              allowReadinessBackfill: blocker.allowReadinessBackfill !== false,
              requiredReadyNodeCount: blocker.requiredReadyNodeCount,
            },
          );
        return endpointVisibility.ready === true ?
          null :
          Object.freeze({
            ...blocker,
            ...endpointVisibility,
          });
      } catch (error) {
        this.logger.warn(
          REBALANCER_LOG_MSG.REVALIDATE_TOPOLOGY_BLOCKER_FAILED,
          {
            entityId: this.entityId,
            entityType: this.entityType,
            reason: blocker.reason || null,
            error: error?.message || String(error),
          },
        );
        return blocker;
      }
    }
    if (
      blocker.reason !==
      CRITICAL_SYSTEM_TOPOLOGY_SETTLING_BLOCKER_REASON.TOPOLOGY_OPERATIONS_IN_FLIGHT
    ) {
      return blocker;
    }
    if (
      !this.rebalanceCoordinator ||
      typeof this.rebalanceCoordinator.getOperationsByEntity !== TYPEOF.FUNCTION
    ) {
      return blocker;
    }

    let entityOperations = [];
    try {
      entityOperations = await this.rebalanceCoordinator.getOperationsByEntity(
        this.entityType,
        this.entityId,
        {
          visibilityReadMode:
            REPLICA_OPERATION_VISIBILITY_READ_MODE.OWNER_RPC_REQUIRED,
        },
      );
    } catch (error) {
      this.logger.warn(REBALANCER_LOG_MSG.REVALIDATE_TOPOLOGY_BLOCKER_FAILED, {
        entityId: this.entityId,
        entityType: this.entityType,
        reason: blocker.reason || null,
        error: error?.message || String(error),
      });
      return blocker;
    }

    const activeNodeIds = new Set(
      (Array.isArray(blocker.activeNodeIds) ?
        blocker.activeNodeIds :
        []
      ).filter(
        (nodeId) => typeof nodeId === TYPEOF.STRING && nodeId.length > NUM.ZERO,
      ),
    );
    const inFlightDetails = [];
    const nowMs = Date.now();
    const nonBlockingPriorityOperationIds =
      await this.buildNonBlockingPriorityOperationIdSet(entityOperations);
    for (const operation of entityOperations) {
      if (
        !this.isTopologySettlingInFlightOperation(operation, {nowMs}) ||
        !this.isOperationForEntity(operation)
      ) {
        continue;
      }
      const operationId = String(
        operation?.operationId || operation?.operation_id || '',
      ).trim();
      if (
        operationId.length > NUM.ZERO &&
        nonBlockingPriorityOperationIds.has(operationId)
      ) {
        continue;
      }
      const detail =
        this.buildCriticalSystemInFlightReplicaOperationDetail(operation);
      if (!detail.targetNodeId) {
        continue;
      }
      if (
        activeNodeIds.size > NUM.ZERO &&
        !activeNodeIds.has(detail.targetNodeId)
      ) {
        continue;
      }
      inFlightDetails.push(detail);
    }

    if (inFlightDetails.length === NUM.ZERO) {
      return null;
    }

    return Object.freeze({
      ...blocker,
      inFlightReplicaOperations: inFlightDetails.length,
      inFlightReplicaOperationDetails: Object.freeze(inFlightDetails),
      inFlightReplicaOperationsSource:
        TOPOLOGY_IN_FLIGHT_REPLICA_OPERATION_SOURCE.AUTHORITATIVE,
    });
  }
}

function applyUnifiedRebalancerSegment2CriticalTopologyMethods(targetClass) {
  const sourcePrototype =
    UnifiedRebalancerSegment2CriticalTopologyMethods.prototype;
  for (const methodName of Object.getOwnPropertyNames(sourcePrototype)) {
    if (methodName === SEGMENT_2_CRITICAL_TOPOLOGY_CONSTRUCTOR) {
      continue;
    }
    const descriptor = Object.getOwnPropertyDescriptor(
      sourcePrototype,
      methodName,
    );
    Object.defineProperty(targetClass.prototype, methodName, descriptor);
  }
}

export {applyUnifiedRebalancerSegment2CriticalTopologyMethods};
