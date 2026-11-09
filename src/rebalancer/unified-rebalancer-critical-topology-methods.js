import {UNIFIED_REBALANCER_SHARED} from './unified-rebalancer-shared.js';
import {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
} from '../control-plane/control-plane-system-table-gateway-constants.js';
import {selectCurrentEndpointRows} from
  '../control-plane/owners/endpoint-incarnation-currentness.js';
import {SERVE_ELIGIBILITY_STATE} from '../control-plane/serve-eligibility-owner.js';
import {projectNodeLivenessSemantics} from
  '../control-plane/node-liveness-semantic-projection.js';

const {
  COLUMN,
  CONTROL_PLANE_READINESS_DIMENSION,
  CRITICAL_SYSTEM_ENDPOINT_VISIBILITY_AUTHORITATIVE_READ,
  CRITICAL_SYSTEM_TOPOLOGY_SETTLING_BLOCKER_REASON,
  ENDPOINT_STATUS,
  NodeStatus,
  REBALANCER_LOG_MSG,
  REPLICA_OPERATION_VISIBILITY_READ_MODE,
  TABLES,
  TOPOLOGY_IN_FLIGHT_REPLICA_OPERATION_SOURCE,
  TRANSPORT_TYPE,
  UNIFIED_REBALANCER_LITERAL,
  normalizeNodeEndpointRow,
  normalizeNodeRow,
  ownerNowMs,
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
  const list = Array.isArray(nodeIds) ?
    nodeIds :
    nodeIds instanceof Set ?
      Array.from(nodeIds) :
      [];
  return [
    ...new Set(
      list.filter(
        (nodeId) => typeof nodeId === 'string' && nodeId.length > 0,
      ),
    ),
  ];
}
// The rebalancer's readiness service is a required collaborator: the
// committed node answer is called, never probed.
function resolveCriticalNodeRows(rebalancer) {
  return rebalancer.controlPlaneReadinessService.answerCommittedNodes();
}
function buildCriticalNodeUnavailableBlocker(resolvedNodes) {
  return Object.freeze({
    reason: CRITICAL_SYSTEM_TOPOLOGY_SETTLING_BLOCKER_REASON.UNAVAILABLE,
    epoch: resolvedNodes?.epoch ?? null,
    retryAfterMs: resolvedNodes?.retryAfterMs ?? null,
  });
}
function buildCriticalNodeContext(rebalancer) {
  const startupAuthorityNodeIds = rebalancer.getStartupAuthorityNodeIdSet();
  return {
    nowMs: ownerNowMs(rebalancer),
    startupAuthorityNodeIds,
    constrainToStartupAuthority:
      startupAuthorityNodeIds instanceof Set &&
      startupAuthorityNodeIds.size > 0,
    readinessDecisionDimension:
      rebalancer.resolveNodeReadinessDecisionDimension(),
  };
}
function isWithinStartupAuthority(context, nodeId) {
  return !context.constrainToStartupAuthority ||
    context.startupAuthorityNodeIds.has(nodeId);
}
function isCriticalNodeReady(nodeRow, nowMs) {
  return projectNodeLivenessSemantics({nodeRow, nowMs}).projection.readyNow === true;
}
function classifyCriticalNode(rebalancer, nodeRow, context) {
  const {status, nodeId} = normalizeNodeRow(nodeRow);
  if (!isWithinStartupAuthority(context, nodeId) || !status) {
    return null;
  }
  if (rebalancer.isFormationCohortSpreadCureTarget(nodeRow)) return null;
  switch (status) {
  case NodeStatus.FAILED:
    return {kind: CRITICAL_NODE_KIND.FAILED, nodeId};
  case NodeStatus.ACTIVE:
    if (nodeId.length === UNIFIED_REBALANCER_LITERAL.ZERO) {
      return {kind: CRITICAL_NODE_KIND.TRANSITIONAL, nodeId};
    }
    return {
      kind: isCriticalNodeReady(nodeRow, context.nowMs) ?
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
  const cachedRows =
    typeof rebalancer.systemTableCache?.getAll === 'function' ?
      rebalancer.systemTableCache.getAll(tableName) :
      [];
  return [
    ...cachedRows,
    ...successfulAuthoritativeRows(authoritativeRead),
  ];
}

function warnTopologyRevalidationFailure(rebalancer, blocker, error) {
  rebalancer.logger?.warn?.(
    REBALANCER_LOG_MSG.REVALIDATE_TOPOLOGY_BLOCKER_FAILED,
    {
      entityId: rebalancer.entityId,
      entityType: rebalancer.entityType,
      reason: blocker?.reason || null,
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
    const nodeRead =
      await rebalancer.readCriticalSystemEndpointVisibilityAuthoritativeRows(
        TABLES.NODE_ENDPOINTS,
        requiredNodeIds,
      );
    const visibility = rebalancer.summarizeCriticalSystemEndpointVisibility(
      requiredNodeIds,
      mergeEndpointRows(rebalancer, TABLES.NODE_ENDPOINTS, nodeRead),
      {requiredReadyNodeCount: blocker.requiredReadyNodeCount},
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
    if (!Array.isArray(entityOperations)) {
      throw new TypeError(CRITICAL_SYSTEM_TOPOLOGY_SETTLING_BLOCKER_REASON.UNAVAILABLE);
    }
  } catch (error) {
    warnTopologyRevalidationFailure(rebalancer, blocker, error);
    return Object.freeze({
      reason:
        CRITICAL_SYSTEM_TOPOLOGY_SETTLING_BLOCKER_REASON.UNAVAILABLE,
      error: error?.message || String(error),
    });
  }

  const activeNodeIds = new Set(
    normalizeNodeIds(
      blocker?.activeNodeIds ||
      rebalancer.getPublishedActiveNodeIdSet() ||
      rebalancer.resolveConnectedClusterNodeIds(),
    ),
  );
  const nowMs = ownerNowMs(rebalancer);
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
    reason:
      CRITICAL_SYSTEM_TOPOLOGY_SETTLING_BLOCKER_REASON.TOPOLOGY_OPERATIONS_IN_FLIGHT,
    activeNodeIds: Object.freeze([...activeNodeIds]),
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
    const resolvedNodes = resolveCriticalNodeRows(this);
    const nodeRows = resolvedNodes?.nodeRows;
    if (resolvedNodes?.state !== SERVE_ELIGIBILITY_STATE.READY ||
        !Array.isArray(nodeRows) || nodeRows.length === 0) {
      return buildCriticalNodeUnavailableBlocker(resolvedNodes);
    }

    const evidence = collectCriticalNodeEvidence(this, nodeRows);
    return buildTransitionalNodeBlocker(this, evidence) ||
      buildTransportMembershipBlocker(this, nodeRows, evidence) ||
      buildEndpointVisibilityBlocker(this, evidence.activeNodeIds);
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
    const sql =
      `SELECT * FROM ${tableName} ` +
      `WHERE ${COLUMN.NODE_ID} IN (${placeholders})`;

    return this.controlPlaneSystemTableGateway.readAuthoritativeRows(
      tableName,
      sql,
      params,
      {
        authoritativeReadMode:
          CONTROL_PLANE_AUTHORITATIVE_READ_MODE
            .OWNER_LOCAL_PREFERRED_OWNER_RPC_FALLBACK,
        owner: CRITICAL_SYSTEM_ENDPOINT_VISIBILITY_AUTHORITATIVE_READ.OWNER,
        queryTimeoutMs: this.criticalCheckDelayMs,
        routingReadinessDimension:
          CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
      },
    );
  }

  // Summarize endpoint visibility from explicit cached/authoritative rows.
  // A node is endpoint-visible exactly when its bootstrap transport (an
  // ACTIVE WebSocket node_endpoints row) is published. Runtime-service
  // endpoints such as sys-postgres-wire are optional desired state placed
  // later by the runtime-service rebalancer and are not an input to topology
  // settling; readiness evidence never substitutes for the transport row.
  summarizeCriticalSystemEndpointVisibility(
    requiredNodeIds,
    nodeEndpointRows,
    options = {},
  ) {
    const normalizedRequiredNodeIds = normalizeNodeIds(requiredNodeIds);
    const requiredReadyNodeCount = resolveRequiredReadyNodeCount(
      normalizedRequiredNodeIds,
      options?.requiredReadyNodeCount,
    );
    if (normalizedRequiredNodeIds.length === 0) {
      return Object.freeze({
        ready: false,
        missingNodeEndpointNodeIds: [],
        endpointReadyNodeCount: 0,
        requiredReadyNodeCount,
        endpointReadyNodeIds: [],
      });
    }

    // Only the endpoint authority's current view is visibility evidence: a
    // stale incarnation's endpoint never satisfies its successor.
    const visibleNodeEndpointNodeIds = collectVisibleNodeEndpointNodeIds(
      selectCurrentEndpointRows(nodeEndpointRows,
        options.nodeRows ?? this.systemTableCache));
    const missingNodeEndpointNodeIds = normalizedRequiredNodeIds.filter(
      (nodeId) => !visibleNodeEndpointNodeIds.has(nodeId),
    );
    const endpointReadyNodeIds = normalizedRequiredNodeIds.filter(
      (nodeId) => visibleNodeEndpointNodeIds.has(nodeId),
    );
    return Object.freeze({
      ready: endpointReadyNodeIds.length >= requiredReadyNodeCount,
      missingNodeEndpointNodeIds,
      endpointReadyNodeCount: endpointReadyNodeIds.length,
      requiredReadyNodeCount,
      endpointReadyNodeIds,
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

  // Revalidate blockers against authoritative endpoint/operation rows.
  async revalidateCriticalSystemTopologySettlingBlocker(blocker) {
    let currentBlocker = blocker;
    if (
      currentBlocker?.reason ===
      CRITICAL_SYSTEM_TOPOLOGY_SETTLING_BLOCKER_REASON.ENDPOINT_VISIBILITY_INCOMPLETE
    ) {
      currentBlocker = await revalidateEndpointVisibilityBlocker(
        this,
        currentBlocker,
      );
    }
    if (
      !currentBlocker ||
      currentBlocker.reason ===
      CRITICAL_SYSTEM_TOPOLOGY_SETTLING_BLOCKER_REASON.TOPOLOGY_OPERATIONS_IN_FLIGHT
    ) {
      return revalidateInFlightTopologyBlocker(this, currentBlocker);
    }
    return currentBlocker;
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
