import {UNIFIED_REBALANCER_SHARED} from './unified-rebalancer-shared.js';
import {readAllSharedRows} from '../cache/shared-row-read.js';

const {
  COLUMN,
  CONTROL_PLANE_READINESS_DIMENSION,
  CRITICAL_SYSTEM_ENDPOINT_VISIBILITY_AUTHORITATIVE_READ,
  CRITICAL_SYSTEM_TOPOLOGY_SETTLING_BLOCKER_REASON,
  ENDPOINT_STATUS,
  ENDPOINT_SYNC_HEALTH,
  META_SERVICE_ID,
  NodeStatus,
  REBALANCER_LOG_MSG,
  REPLICA_OPERATION_VISIBILITY_READ_MODE,
  SYSTEM_TABLE_NAME,
  TABLES,
  TOPOLOGY_IN_FLIGHT_REPLICA_OPERATION_SOURCE,
  TRANSPORT_TYPE,
  UNIFIED_REBALANCER_LITERAL,
  isNodeReadyLeaseExplicitlyCleared,
  normalizeNodeEndpointRow,
  normalizeNodeRow,
  normalizeServiceEndpointRow,
  resolveReplicaOperationSemanticPhase,
} = UNIFIED_REBALANCER_SHARED;

const CRITICAL_TOPOLOGY_CONSTRUCTOR = 'constructor';
const CRITICAL_NODE_KIND = Object.freeze({
  FAILED: 'failed',
  TRANSITIONAL: 'transitional',
  READY: 'ready',
  UNREADY_ACTIVE: 'unready-active',
});
const REPLICA_OPERATION_ID_FIELDS =
  Object.freeze(['operationId', 'operation_id']);
function normalizeNodeIds(nodeIds) {
  return [
    ...new Set(
      (Array.isArray(nodeIds) ? nodeIds : []).filter(
        (nodeId) => typeof nodeId === 'string' && nodeId.length > 0,
      ),
    ),
  ];
}
function readCachedRows(rebalancer, tableName) {
  return typeof rebalancer.systemTableCache?.getAll === 'function' ?
    rebalancer.systemTableCache.getAll(tableName) :
    [];
}
function buildCriticalNodeContext(rebalancer) {
  const startupAuthorityNodeIds = rebalancer.getStartupAuthorityNodeIdSet();
  return {
    startupAuthorityNodeIds,
    constrainToStartupAuthority:
      startupAuthorityNodeIds instanceof Set &&
      startupAuthorityNodeIds.size > 0,
    bypassPriorityStartupReadiness:
      rebalancer.shouldBypassLocalPriorityControlPlaneStartupReadiness(),
    readinessDecisionDimension:
      rebalancer.resolveNodeReadinessDecisionDimension(),
  };
}
function isWithinStartupAuthority(context, nodeId) {
  return !context.constrainToStartupAuthority ||
    context.startupAuthorityNodeIds.has(nodeId);
}
function isCriticalNodeReady(rebalancer, nodeRow, nodeId, context) {
  const readiness =
    typeof rebalancer.controlPlaneReadinessService?.getNodeReadinessSync ===
      'function' ?
      rebalancer.controlPlaneReadinessService.getNodeReadinessSync(nodeId, {
        allowStaleOnCacheChange: false,
      }) :
      null;
  const membershipReady = rebalancer.isReadinessDimensionSatisfied(
    readiness,
    context.readinessDecisionDimension,
  );
  const startupLeaseClear =
    context.bypassPriorityStartupReadiness &&
    nodeId === rebalancer.nodeId &&
    isNodeReadyLeaseExplicitlyCleared(nodeRow, {requireActiveStatus: true});
  return startupLeaseClear || membershipReady;
}
function classifyCriticalNode(rebalancer, nodeRow, context) {
  const {status, nodeId} = normalizeNodeRow(nodeRow);
  if (!isWithinStartupAuthority(context, nodeId) || !status) {
    return null;
  }
  switch (status) {
  case NodeStatus.FAILED:
    return {kind: CRITICAL_NODE_KIND.FAILED, nodeId};
  case NodeStatus.ACTIVE:
    if (nodeId.length === UNIFIED_REBALANCER_LITERAL.ZERO) {
      return {kind: CRITICAL_NODE_KIND.TRANSITIONAL, nodeId};
    }
    return {
      kind: isCriticalNodeReady(rebalancer, nodeRow, nodeId, context) ?
        CRITICAL_NODE_KIND.READY :
        CRITICAL_NODE_KIND.UNREADY_ACTIVE,
      nodeId,
    };
  default:
    return {kind: CRITICAL_NODE_KIND.TRANSITIONAL, nodeId};
  }
}
function collectCriticalNodeEvidence(rebalancer, nodeRows) {
  const context = buildCriticalNodeContext(rebalancer);
  const evidence = {
    ...context,
    hasTransitionalNode: false,
    hasFailedNode: false,
    activeMembershipNodeIds: [],
    activeNodeIds: [],
    unreadyNodeIds: [],
  };
  for (const nodeRow of nodeRows) {
    const node = classifyCriticalNode(rebalancer, nodeRow, context);
    switch (node?.kind) {
    case CRITICAL_NODE_KIND.FAILED:
      evidence.hasFailedNode = true;
      break;
    case CRITICAL_NODE_KIND.TRANSITIONAL:
      evidence.hasTransitionalNode = true;
      if (node.nodeId.length > UNIFIED_REBALANCER_LITERAL.ZERO) {
        evidence.unreadyNodeIds.push(node.nodeId);
      }
      break;
    case CRITICAL_NODE_KIND.UNREADY_ACTIVE:
      evidence.hasTransitionalNode = true;
      evidence.activeMembershipNodeIds.push(node.nodeId);
      evidence.unreadyNodeIds.push(node.nodeId);
      break;
    case CRITICAL_NODE_KIND.READY:
      evidence.activeMembershipNodeIds.push(node.nodeId);
      evidence.activeNodeIds.push(node.nodeId);
      break;
    default:
      break;
    }
  }
  return evidence;
}
function buildTransitionalNodeBlocker(rebalancer, evidence) {
  if (!evidence.hasTransitionalNode || evidence.hasFailedNode) {
    return null;
  }
  const requiredHealthyNodeCount =
    rebalancer.resolveCriticalSystemRequiredHealthyNodeCount(
      evidence.activeMembershipNodeIds.length,
    );
  const hasRequiredHealthyNodes =
    evidence.activeNodeIds.length >= requiredHealthyNodeCount;
  const priorityRecoveryMayProceedOnQuorum =
    rebalancer.isRecoveryLanePartition() &&
    !rebalancer
      .shouldRequireFullControlPlanePublicationEndpointVisibility() &&
    hasRequiredHealthyNodes;
  if (priorityRecoveryMayProceedOnQuorum) {
    return null;
  }
  return Object.freeze({
    reason:
      evidence.unreadyNodeIds.length > UNIFIED_REBALANCER_LITERAL.ZERO ?
        CRITICAL_SYSTEM_TOPOLOGY_SETTLING_BLOCKER_REASON.NODE_READY_LEASE_INCOMPLETE :
        CRITICAL_SYSTEM_TOPOLOGY_SETTLING_BLOCKER_REASON.TRANSITIONAL_NODE_MEMBERSHIP,
    unreadyNodeIds: Object.freeze([...evidence.unreadyNodeIds]),
    requiredHealthyNodeCount,
    healthyNodeCount: evidence.activeNodeIds.length,
    activeMembershipNodeCount: evidence.activeMembershipNodeIds.length,
  });
}
function collectKnownNodeIds(nodeRows, evidence) {
  const knownNodeIds = new Set();
  for (const nodeRow of nodeRows) {
    const {nodeId} = normalizeNodeRow(nodeRow);
    if (nodeId.length > 0 && isWithinStartupAuthority(evidence, nodeId)) {
      knownNodeIds.add(nodeId);
    }
  }
  return knownNodeIds;
}
function findUnexpectedConnectedNodeId(
  connectedNodeIds,
  knownNodeIds,
  evidence,
  publishedActiveNodeIds,
) {
  if (publishedActiveNodeIds) {
    return null;
  }
  for (const connectedNodeId of connectedNodeIds) {
    if (
      isWithinStartupAuthority(evidence, connectedNodeId) &&
      !knownNodeIds.has(connectedNodeId)
    ) {
      return connectedNodeId;
    }
  }
  return null;
}
function buildTransportMembershipBlocker(rebalancer, nodeRows, evidence) {
  const connectedNodeIds = rebalancer.resolveConnectedClusterNodeIds();
  if (connectedNodeIds.size === UNIFIED_REBALANCER_LITERAL.ZERO) {
    return null;
  }
  const requiredHealthyNodeCount =
    rebalancer.resolveCriticalSystemRequiredHealthyNodeCount(
      evidence.activeMembershipNodeIds.length,
    );
  const hasRequiredHealthyNodes =
    evidence.activeNodeIds.length >= requiredHealthyNodeCount;
  const publishedActiveNodeIds =
    rebalancer.isRecoveryLanePartition() && hasRequiredHealthyNodes ?
      rebalancer.getPublishedActiveNodeIdSet() :
      null;
  const connectedNodeId = findUnexpectedConnectedNodeId(
    connectedNodeIds,
    collectKnownNodeIds(nodeRows, evidence),
    evidence,
    publishedActiveNodeIds,
  );
  return connectedNodeId === null ?
    null :
    Object.freeze({
      reason:
        CRITICAL_SYSTEM_TOPOLOGY_SETTLING_BLOCKER_REASON.TRANSPORT_MEMBERSHIP_EXCEEDS_NODES_CACHE,
      connectedNodeId,
    });
}
function buildEndpointVisibilityBlocker(rebalancer, activeNodeIds) {
  const policy =
    rebalancer.getCriticalSystemEndpointVisibilityPolicy(activeNodeIds);
  const visibility =
    rebalancer.evaluateCriticalSystemEndpointVisibility(activeNodeIds, policy);
  return visibility.ready === true ?
    null :
    Object.freeze({
      reason:
        CRITICAL_SYSTEM_TOPOLOGY_SETTLING_BLOCKER_REASON.ENDPOINT_VISIBILITY_INCOMPLETE,
      ...visibility,
    });
}
function buildInFlightTopologyBlocker(rebalancer, activeNodeIds) {
  const operations =
    rebalancer.collectCriticalSystemInFlightReplicaOperations(activeNodeIds, {
      scopeToEntity: true,
    });
  return operations.count === 0 ?
    null :
    Object.freeze({
      reason:
        CRITICAL_SYSTEM_TOPOLOGY_SETTLING_BLOCKER_REASON.TOPOLOGY_OPERATIONS_IN_FLIGHT,
      activeNodeIds: Object.freeze([...activeNodeIds]),
      inFlightReplicaOperations: operations.count,
      inFlightReplicaOperationDetails: operations.details,
      inFlightReplicaOperationsSource: operations.source || null,
    });
}
function resolveRequiredReadyNodeCount(requiredNodeIds, configuredCount) {
  if (requiredNodeIds.length === 0) {
    return 0;
  }
  const requestedCount =
    Number.isInteger(configuredCount) && configuredCount > 0 ?
      configuredCount :
      requiredNodeIds.length;
  return Math.max(1, Math.min(requiredNodeIds.length, requestedCount));
}
function collectVisibleNodeEndpointNodeIds(rows) {
  const nodeIds = new Set();
  for (const row of Array.isArray(rows) ? rows : []) {
    const {nodeId, status, transportType} = normalizeNodeEndpointRow(row);
    if (
      nodeId &&
      status === String(ENDPOINT_STATUS.ACTIVE).toLowerCase() &&
      transportType === String(TRANSPORT_TYPE.WEBSOCKET).toLowerCase()
    ) {
      nodeIds.add(nodeId);
    }
  }
  return nodeIds;
}

function collectVisiblePostgresWireNodeIds(rows) {
  const nodeIds = new Set();
  for (const row of Array.isArray(rows) ? rows : []) {
    const {nodeId, serviceId, healthStatus} =
      normalizeServiceEndpointRow(row);
    if (
      nodeId &&
      serviceId === META_SERVICE_ID.POSTGRES_WIRE &&
      healthStatus === String(ENDPOINT_SYNC_HEALTH.HEALTHY).toLowerCase()
    ) {
      nodeIds.add(nodeId);
    }
  }
  return nodeIds;
}

function collectReadinessEndpointNodeIds(rebalancer, requiredNodeIds) {
  const visibleNodeIds = new Set();
  const writableNodeIds = new Set();
  const readinessService = rebalancer.controlPlaneReadinessService;
  if (typeof readinessService?.getNodeReadinessSync !== 'function') {
    return {visibleNodeIds, writableNodeIds};
  }
  for (const nodeId of requiredNodeIds) {
    const readiness = readinessService.getNodeReadinessSync(nodeId, {
      allowStaleOnCacheChange: false,
    });
    if (rebalancer.isReadinessDimensionSatisfied(
      readiness,
      CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY,
    )) {
      visibleNodeIds.add(nodeId);
    }
    if (rebalancer.isReadinessDimensionSatisfied(
      readiness,
      CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE,
    )) {
      writableNodeIds.add(nodeId);
    }
  }
  return {visibleNodeIds, writableNodeIds};
}

function intersectNodeIds(requiredNodeIds, first, second) {
  return new Set(
    requiredNodeIds.filter(
      (nodeId) => first.has(nodeId) && second.has(nodeId),
    ),
  );
}

function buildEffectiveNodeIds(primary, readinessBacked, allowBackfill) {
  return new Set([
    ...primary,
    ...(allowBackfill ? readinessBacked : []),
  ]);
}

function readFirstTruthyField(record, fieldNames, fallback = null) {
  const fieldName = fieldNames.find((name) => record?.[name]);
  return fieldName ? record[fieldName] : fallback;
}

function readReplicaOperationId(operation) {
  return String(
    readFirstTruthyField(operation, REPLICA_OPERATION_ID_FIELDS, ''),
  ).trim();
}

function criticalOperationMatchesScope(rebalancer, operation, options) {
  if (!rebalancer.isTopologySettlingInFlightOperation(
    operation,
    {nowMs: options.nowMs},
  )) {
    return false;
  }
  if (options.scopeToEntity && !rebalancer.isOperationForEntity(operation)) {
    return false;
  }
  const operationId = readReplicaOperationId(operation);
  return operationId.length === 0 ||
    !options.nonBlockingOperationIds.has(operationId);
}

function targetMatchesRequiredNodeIds(detail, requiredNodeIds) {
  if (!detail.targetNodeId) {
    return false;
  }
  return requiredNodeIds.size === 0 ||
    requiredNodeIds.has(detail.targetNodeId);
}

function collectCriticalOperationDetails(
  rebalancer,
  operations,
  requiredNodeIds,
  options,
) {
  const details = [];
  for (const operation of operations) {
    if (!criticalOperationMatchesScope(rebalancer, operation, options)) {
      continue;
    }
    const detail =
      rebalancer.buildCriticalSystemInFlightReplicaOperationDetail(operation);
    if (targetMatchesRequiredNodeIds(detail, requiredNodeIds)) {
      details.push(detail);
    }
  }
  return details;
}

function successfulAuthoritativeRows(read) {
  return read?.success === true ? read.rows || [] : [];
}

function mergeEndpointRows(rebalancer, tableName, authoritativeRead) {
  return [
    ...readCachedRows(rebalancer, tableName),
    ...successfulAuthoritativeRows(authoritativeRead),
  ];
}

function warnTopologyRevalidationFailure(rebalancer, blocker, error) {
  rebalancer.logger.warn(
    REBALANCER_LOG_MSG.REVALIDATE_TOPOLOGY_BLOCKER_FAILED,
    {
      entityId: rebalancer.entityId,
      entityType: rebalancer.entityType,
      reason: blocker.reason || null,
      error: error?.message || String(error),
    },
  );
}

async function revalidateEndpointVisibilityBlocker(rebalancer, blocker) {
  const requiredNodeIds =
    rebalancer.getCriticalSystemEndpointVisibilityRequiredNodeIds(blocker);
  if (requiredNodeIds.length === 0) {
    return blocker;
  }
  try {
    const [nodeRead, serviceRead] = await Promise.all([
      rebalancer.readCriticalSystemEndpointVisibilityAuthoritativeRows(
        TABLES.NODE_ENDPOINTS,
        requiredNodeIds,
      ),
      rebalancer.readCriticalSystemEndpointVisibilityAuthoritativeRows(
        TABLES.SERVICE_ENDPOINTS,
        requiredNodeIds,
        {serviceId: META_SERVICE_ID.POSTGRES_WIRE},
      ),
    ]);
    const visibility = rebalancer.summarizeCriticalSystemEndpointVisibility(
      requiredNodeIds,
      mergeEndpointRows(rebalancer, TABLES.NODE_ENDPOINTS, nodeRead),
      mergeEndpointRows(rebalancer, TABLES.SERVICE_ENDPOINTS, serviceRead),
      {
        allowReadinessBackfill: blocker.allowReadinessBackfill !== false,
        requiredReadyNodeCount: blocker.requiredReadyNodeCount,
      },
    );
    return visibility.ready === true ?
      null :
      Object.freeze({...blocker, ...visibility});
  } catch (error) {
    warnTopologyRevalidationFailure(rebalancer, blocker, error);
    return blocker;
  }
}

async function revalidateInFlightTopologyBlocker(rebalancer, blocker) {
  if (
    typeof rebalancer.rebalanceCoordinator?.getOperationsByEntity !==
      'function'
  ) {
    return blocker;
  }
  let entityOperations;
  try {
    entityOperations =
      await rebalancer.rebalanceCoordinator.getOperationsByEntity(
        rebalancer.entityType,
        rebalancer.entityId,
        {
          visibilityReadMode:
            REPLICA_OPERATION_VISIBILITY_READ_MODE.OWNER_RPC_REQUIRED,
        },
      );
  } catch (error) {
    warnTopologyRevalidationFailure(rebalancer, blocker, error);
    return blocker;
  }

  const activeNodeIds = new Set(normalizeNodeIds(blocker.activeNodeIds));
  const nowMs = Date.now();
  const nonBlockingOperationIds =
    await rebalancer.buildNonBlockingPriorityOperationIdSet(entityOperations);
  const details = collectCriticalOperationDetails(
    rebalancer,
    entityOperations,
    activeNodeIds,
    {
      nowMs,
      scopeToEntity: true,
      nonBlockingOperationIds,
    },
  );
  if (details.length === 0) {
    return null;
  }
  return Object.freeze({
    ...blocker,
    inFlightReplicaOperations: details.length,
    inFlightReplicaOperationDetails: Object.freeze(details),
    inFlightReplicaOperationsSource:
      TOPOLOGY_IN_FLIGHT_REPLICA_OPERATION_SOURCE.AUTHORITATIVE,
  });
}

class UnifiedRebalancerCriticalTopologyMethods {
  // Block critical work on transitional membership, visibility, or topology.
  getCriticalSystemTopologySettlingBlocker() {
    if (!this.isSystemPartitionEntity()) {
      return null;
    }
    const nodeRows = readCachedRows(this, SYSTEM_TABLE_NAME.NODES);
    if (
      !Array.isArray(nodeRows) ||
      nodeRows.length === UNIFIED_REBALANCER_LITERAL.ZERO
    ) {
      return null;
    }

    const evidence = collectCriticalNodeEvidence(this, nodeRows);
    return buildTransitionalNodeBlocker(this, evidence) ||
      buildTransportMembershipBlocker(this, nodeRows, evidence) ||
      buildEndpointVisibilityBlocker(this, evidence.activeNodeIds) ||
      buildInFlightTopologyBlocker(this, evidence.activeNodeIds);
  }

  // Report whether the critical topology still has a blocker.
  isCriticalSystemTopologySettling() {
    return this.getCriticalSystemTopologySettlingBlocker() !== null;
  }

  // Read the required node cohort encoded in a visibility blocker.
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
            typeof nodeId === 'string' && nodeId.length > 0,
        ),
      ),
    ];
  }

  // Read authoritative endpoint rows for a required node cohort.
  async readCriticalSystemEndpointVisibilityAuthoritativeRows(
    tableName,
    requiredNodeIds,
    options = {},
  ) {
    if (
      !this.controlPlaneSystemTableGateway ||
      typeof this.controlPlaneSystemTableGateway.readAuthoritativeRows !==
        'function'
    ) {
      return null;
    }
    const normalizedNodeIds = [
      ...new Set(
        (Array.isArray(requiredNodeIds) ? requiredNodeIds : []).filter(
          (nodeId) =>
            typeof nodeId === 'string' && nodeId.length > 0,
        ),
      ),
    ];
    if (normalizedNodeIds.length === 0) {
      return null;
    }

    const placeholders = normalizedNodeIds.map(() => '?').join(', ');
    const params = [...normalizedNodeIds];
    let sql =
      `SELECT * FROM ${tableName} ` +
      `WHERE ${COLUMN.NODE_ID} IN (${placeholders})`;
    if (
      typeof options?.serviceId === 'string' &&
      options.serviceId.length > 0
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

  // Summarize endpoint visibility from explicit cached/authoritative rows.
  summarizeCriticalSystemEndpointVisibility(
    requiredNodeIds,
    nodeEndpointRows,
    serviceEndpointRows,
    options = {},
  ) {
    const normalizedRequiredNodeIds = normalizeNodeIds(requiredNodeIds);
    const allowReadinessBackfill = options?.allowReadinessBackfill !== false;
    const requiredReadyNodeCount = resolveRequiredReadyNodeCount(
      normalizedRequiredNodeIds,
      options?.requiredReadyNodeCount,
    );
    if (normalizedRequiredNodeIds.length === 0) {
      return Object.freeze({
        ready: false,
        missingNodeEndpointNodeIds: [],
        missingPostgresWireNodeIds: [],
        endpointReadyNodeCount: 0,
        requiredReadyNodeCount,
        endpointReadyNodeIds: [],
      });
    }

    const visibleNodeEndpointNodeIds =
      collectVisibleNodeEndpointNodeIds(nodeEndpointRows);
    const visiblePostgresWireNodeIds =
      collectVisiblePostgresWireNodeIds(serviceEndpointRows);
    const {
      visibleNodeIds: readinessVisibleNodeIds,
      writableNodeIds: readinessWritableNodeIds,
    } = collectReadinessEndpointNodeIds(this, normalizedRequiredNodeIds);

    const readinessBackedNodeEndpointNodeIds = intersectNodeIds(
      normalizedRequiredNodeIds,
      readinessVisibleNodeIds,
      visiblePostgresWireNodeIds,
    );
    const readinessBackedPostgresWireNodeIds = intersectNodeIds(
      normalizedRequiredNodeIds,
      readinessWritableNodeIds,
      visibleNodeEndpointNodeIds,
    );
    const effectiveNodeEndpointNodeIds = buildEffectiveNodeIds(
      visibleNodeEndpointNodeIds,
      readinessBackedNodeEndpointNodeIds,
      allowReadinessBackfill,
    );
    const effectivePostgresWireNodeIds = buildEffectiveNodeIds(
      visiblePostgresWireNodeIds,
      readinessBackedPostgresWireNodeIds,
      allowReadinessBackfill,
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

  // Normalize an in-flight operation for topology diagnostics.
  buildCriticalSystemInFlightReplicaOperationDetail(row) {
    const operationId =
      readFirstTruthyField(row, ['operation_id', 'operationId']);
    const type = readFirstTruthyField(row, ['type']);
    const partitionId = readFirstTruthyField(row, [
      'partition_group_id',
      'partitionGroupId',
      'partition_id',
      'partitionId',
    ]);
    const targetNodeId = String(
      readFirstTruthyField(row, ['target_node_id', 'targetNodeId'], ''),
    );
    const status = readFirstTruthyField(row, ['status']);
    const workflowStep =
      readFirstTruthyField(row, ['workflow_step', 'workflowStep']);
    const semanticPhase = resolveReplicaOperationSemanticPhase(
      type,
      workflowStep,
      status,
    );

    return Object.freeze({
      operationId,
      type,
      partitionId,
      targetNodeId,
      status,
      workflowStep,
      semanticPhase,
    });
  }

  // Return non-terminal operations that still indicate topology churn.
  collectCriticalSystemInFlightReplicaOperations(
    activeNodeIds = [],
    options = {},
  ) {
    const requiredNodeIds = new Set(normalizeNodeIds(activeNodeIds));
    if (
      requiredNodeIds.size === 0 ||
      typeof this.systemTableCache?.getAll !== 'function'
    ) {
      return Object.freeze({
        count: 0,
        details: Object.freeze([]),
        source: null,
      });
    }

    const rows = readAllSharedRows(
      this.systemTableCache,
      TABLES.REPLICA_OPERATIONS,
    );
    const nowMs = Date.now();
    const nonBlockingPriorityOperationIds =
      this.buildNonBlockingPriorityOperationIdSetSync(rows, {
        observedAt: nowMs,
      });
    const details = collectCriticalOperationDetails(
      this,
      rows,
      requiredNodeIds,
      {
        nowMs,
        scopeToEntity: options.scopeToEntity === true,
        nonBlockingOperationIds: nonBlockingPriorityOperationIds,
      },
    );

    return Object.freeze({
      count: details.length,
      details: Object.freeze(details),
      source: TOPOLOGY_IN_FLIGHT_REPLICA_OPERATION_SOURCE.CACHE,
    });
  }

  // Revalidate cache blockers against authoritative endpoint/operation rows.
  async revalidateCriticalSystemTopologySettlingBlocker(blocker) {
    if (!blocker) {
      return blocker;
    }
    if (
      blocker.reason ===
      CRITICAL_SYSTEM_TOPOLOGY_SETTLING_BLOCKER_REASON.ENDPOINT_VISIBILITY_INCOMPLETE
    ) {
      return revalidateEndpointVisibilityBlocker(this, blocker);
    }
    if (
      blocker.reason ===
      CRITICAL_SYSTEM_TOPOLOGY_SETTLING_BLOCKER_REASON.TOPOLOGY_OPERATIONS_IN_FLIGHT
    ) {
      return revalidateInFlightTopologyBlocker(this, blocker);
    }
    return blocker;
  }
}

function applyUnifiedRebalancerCriticalTopologyMethods(targetClass) {
  const sourcePrototype =
    UnifiedRebalancerCriticalTopologyMethods.prototype;
  for (const methodName of Object.getOwnPropertyNames(sourcePrototype)) {
    if (methodName === CRITICAL_TOPOLOGY_CONSTRUCTOR) {
      continue;
    }
    const descriptor = Object.getOwnPropertyDescriptor(
      sourcePrototype,
      methodName,
    );
    Object.defineProperty(targetClass.prototype, methodName, descriptor);
  }
}

export {applyUnifiedRebalancerCriticalTopologyMethods};
