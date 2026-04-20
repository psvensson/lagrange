import {
  COLUMN,
  ENTITY_TYPE,
  NUM,
  SERVICE_TYPE,
  STATE,
  TABLES,
  TYPEOF,
} from '../constants/index.js';
import {getSystemCachePrimaryKeyFieldOrFallback} from
  '../cache/system-cache-key-descriptor.js';
import {resolveCdcPropagationDeliveryProfile} from
  '../cache/cdc-propagation-delivery-profile.js';
import {ControlPlaneField} from '../control-plane/control-plane-constants.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../control-plane/control-plane-readiness-constants.js';
import {
  CONTROL_PLANE_READ_STRATEGY,
} from '../control-plane/control-plane-system-table-gateway.js';
import {
  buildControlPlaneWorkloadProfile,
  CONTROL_PLANE_WORKLOAD_CLASS,
} from '../control-plane/control-plane-workload-profile.js';
import {
  INITIAL_PARTITION_IDS,
  SYSTEM_TABLE_NAME,
} from '../bootstrap/system-table-schemas-constants.js';
import {
  MESSAGE_GROUP_APPLICATION_ERROR_MSG,
  MESSAGE_GROUP_APPLICATION_MESSAGE_TYPE,
  MESSAGE_GROUP_CDC_ERROR_MSG,
} from './constants.js';
import {
  resolveMessageGroupForwardServiceCandidatesFromCache,
  resolveMessageGroupForwardServiceFromCache,
  resolveMessageGroupLeaderServiceFromCache,
} from './message-group-target-resolver.js';
import {createMessageGroupForwardingOwnerDeliveryMethods} from
  './message-group-forwarding-owner-delivery-methods.js';
import {normalizeCauseId} from '../utils/cause-id.js';
import {TRANSPORT_ERROR_MSG} from '../constants/transport.js';

const MESSAGE_GROUP_FORWARDING_OWNER_LITERAL = Object.freeze({
  AUTHORITATIVE_MESSAGE_DASH_GROUP_FORWARD_TOPOLOGY_REPAIR_FAILED:
    'Authoritative message-group forward topology repair failed',
  BACKGROUND: 'background',
  CDC_FORWARD_TO_LEADER_REJECTED: 'CDC forward to leader rejected',
  CLOSED: 'closed',
  CONNECTION_TO_NODE: 'Connection to node',
  CRITICAL: 'critical',
  EAI_AGAIN: 'EAI_AGAIN',
  ECONNREFUSED: 'ECONNREFUSED',
  ENOTFOUND: 'ENOTFOUND',
  FORWARD_SLASH: '/',
  IS_SATURATED: 'is saturated',
  MESSAGE_DASH_GROUP_DASH_SERVICE: 'message-group-service',
  METADATA_INGRESS: 'metadata_ingress',
  NO_CONNECTION_TO_NODE: 'No connection to node',
  NO_HANDLER_REGISTERED_FOR_ADDRESS: 'No handler registered for address',
  OUTBOUND_QUEUE_BACKPRESSURED: 'OUTBOUND_QUEUE_BACKPRESSURED',
  OUTBOUND_QUEUE_FOR_NODE: 'Outbound queue for node',
  REPAIRED_MESSAGE_DASH_GROUP_FORWARD_TOPOLOGY_FROM_AUTHORITATIVE_ROWS:
    'Repaired message-group forward topology from authoritative rows',
  ZERO: 0,
});

const STRICT_CDC_FORWARD_SYSTEM_TABLES = new Set(
  Object.values(SYSTEM_TABLE_NAME),
);
const FORWARD_TOPOLOGY_REPAIR_OUTCOME = Object.freeze({
  FAILED: 'failed',
  REPAIRED: 'repaired',
  UNCHANGED: 'unchanged',
});

const MESSAGE_GROUP_FORWARDING_REASON = Object.freeze({
  INGRESS_NOT_INITIALIZED: 'message-group ingress not initialized',
});

const MESSAGE_GROUP_CDC_INGRESS_ACTION = Object.freeze({
  APPLY_LOCAL: 'apply_local',
  DEFER: 'defer',
  FORWARD: 'forward',
});

const MESSAGE_GROUP_CDC_INGRESS_INITIALIZATION = Object.freeze({
  OPTIONAL: 'optional',
  REQUIRED: 'required',
});

const MESSAGE_GROUP_CDC_INGRESS_STATE = Object.freeze({
  DEFER_INGRESS_NOT_INITIALIZED: 'defer_ingress_not_initialized',
  DEFER_STRICT_TARGET_UNKNOWN: 'defer_strict_target_unknown',
  FORWARD_NON_STRICT: 'forward_non_strict',
  FORWARD_STRICT_RECOVERY_TARGET: 'forward_strict_recovery_target',
  FORWARD_STRICT_TARGET: 'forward_strict_target',
  LOCAL_RAFT_LEADER: 'local_raft_leader',
  LOCAL_STRICT_CONVERGENCE_INGRESS: 'local_strict_convergence_ingress',
  LOCAL_STRICT_RECOVERY_INGRESS: 'local_strict_recovery_ingress',
});

const MESSAGE_GROUP_CDC_RECOVERY_ROUTING_STATE = Object.freeze({
  LOCAL_ONLY: 'local_only',
  NONE: 'none',
  REMOTE_TARGETS_AVAILABLE: 'remote_targets_available',
});

const MESSAGE_GROUP_CDC_RELAY_CONVERGENCE_MIN_DEPTH = NUM.ONE;

const MESSAGE_GROUP_CDC_FORWARD_FAILURE_STATE = Object.freeze({
  NON_RETRYABLE_DEFER: 'non_retryable_defer',
  RETRYABLE_DEFER: 'retryable_defer',
});

const MESSAGE_GROUP_LEADER_IDENTITY_SOURCE = Object.freeze({
  CACHE_ROW: 'cache_row',
  LIVE_LOCAL_LEADER: 'live_local_leader',
  NONE: 'none',
  PENDING_PUBLICATION: 'pending_publication',
  PERSISTED_PUBLICATION: 'persisted_publication',
});

const MESSAGE_GROUP_LEADER_IDENTITY_STATE = Object.freeze({
  CACHE_CONFIRMED: 'cache_confirmed',
  LIVE_LOCAL_HINT: 'live_local_hint',
  MISSING: 'missing',
  PUBLICATION_PENDING: 'publication_pending',
  PUBLICATION_PERSISTED: 'publication_persisted',
});

function buildMessageGroupLeaderIdentitySnapshot(
  state,
  source,
  leaderNodeId,
) {
  return Object.freeze({
    state,
    source,
    leaderNodeId,
  });
}

const MESSAGE_GROUP_CDC_LOG_CONTEXT_FIELD = Object.freeze({
  ADDRESSED_STRICT_CONVERGENCE: 'addressedStrictConvergence',
});

function extractCDCForwardPayloadRows(payload = null) {
  const events = Array.isArray(payload?.events) ?
    payload.events :
    [payload];
  return events
    .map((event) => event?.data && typeof event.data === TYPEOF.OBJECT ?
      event.data :
      null)
    .filter(Boolean);
}

function resolveCDCForwardDeliveryPriority(
  tableName,
  payload = null,
  replayOnly = false,
) {
  const payloadRows = extractCDCForwardPayloadRows(payload);
  const deliveryProfile = resolveCdcPropagationDeliveryProfile(
    payloadRows.length > NUM.ZERO ?
      payloadRows.map((row) => ({tableName, data: row})) :
      [{tableName, data: null}],
    {replayOnly},
  );
  return deliveryProfile.deliveryPriority;
}

function buildForwardTopologyRepairReadOptions(service, workloadProfile) {
  return {
    queryTimeoutMs: service.forwardTopologyRepairQueryTimeoutMs,
    sessionId:
      `message-group-forward-topology:${service.groupId}:${service.now()}`,
    routingReadinessDimension:
      CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
    workloadClass: workloadProfile.workloadClass,
    workClass: workloadProfile.workClass,
    allowPressureDegrade: workloadProfile.allowPressureDegrade,
    allowPressureDefer: workloadProfile.allowPressureDefer,
    preferOwnerRpcRead: false,
    requireOwnerRpcRead: false,
    allowOwnerRpcFallback: false,
    allowSqlFallback: false,
    confirmEmptyLocalReadWithOwnerRpc: false,
  };
}

class MessageGroupForwardingOwner {
  constructor(options = {}) {
    this.service = options.service;
    this.buildDeferredCdcForwardError =
      options.buildDeferredCdcForwardError;
    this.boundCdcForwardErrorDetail =
      options.boundCdcForwardErrorDetail;
    this.forwardTargetSuppression = new Map();
    this.lastForwardTopologyRepairAtMs = NUM.ZERO;
    this.lastForwardTopologyRepairCooldownMs =
      this.service?.forwardTopologyRepairCooldownMs || NUM.ZERO;
    this.forwardTopologyRepairInFlight = null;
  }

  resolveLiveLeaderForwardTarget() {
    const service = this.service;
    const leaderServiceId = service.normalizeLeaderReplicaId(service.leaderId);
    if (leaderServiceId === service.replicaId) {
      return null;
    }
    if (!leaderServiceId) {
      return null;
    }

    let address =
      service.resolveLivePeerAddressFromRaftNodes(leaderServiceId) ||
      service.resolvePeerAddressFromCache(leaderServiceId);
    if ((typeof address !== TYPEOF.STRING || address.length === NUM.ZERO) &&
        service.shouldAllowJoinConvergenceStrictTargeting()) {
      address = service.resolvePeerAddressFromHints(leaderServiceId);
      if (typeof address === TYPEOF.STRING &&
          address.length > NUM.ZERO &&
          typeof service.logBootstrapHintFallback === TYPEOF.FUNCTION) {
        service.logBootstrapHintFallback(leaderServiceId, address);
      }
    }
    if (typeof address !== TYPEOF.STRING || address.length === NUM.ZERO) {
      return null;
    }

    return {
      serviceId: leaderServiceId,
      address,
    };
  }

  normalizeLeaderReplicaId(candidate) {
    const service = this.service;
    if (typeof candidate !== TYPEOF.STRING || candidate.length === NUM.ZERO) {
      return null;
    }
    if (!candidate.includes(MESSAGE_GROUP_FORWARDING_OWNER_LITERAL.FORWARD_SLASH)) {
      return candidate;
    }
    try {
      const parsed = service.addressManager.parse(candidate);
      if (parsed?.serviceType === ENTITY_TYPE.MESSAGE_GROUP &&
          typeof parsed?.serviceId === TYPEOF.STRING &&
          parsed.serviceId.length > NUM.ZERO) {
        return parsed.serviceId;
      }
    } catch (_error) {
      // Ignore malformed addresses and preserve the original value.
    }
    return candidate;
  }

  resolveLivePeerAddressFromRaftNodes(peerId) {
    const service = this.service;
    if (typeof peerId !== TYPEOF.STRING ||
        peerId.length === NUM.ZERO ||
        !service.raft ||
        !Array.isArray(service.raft.nodes)) {
      return null;
    }

    for (const node of service.raft.nodes) {
      const address = node?.address;
      if (typeof address !== TYPEOF.STRING || address.length === NUM.ZERO) {
        continue;
      }
      try {
        const parsed = service.addressManager.parse(address);
        if (parsed.serviceType === ENTITY_TYPE.MESSAGE_GROUP &&
            parsed.serviceId === peerId) {
          return address;
        }
      } catch (_error) {
        // Ignore non-unified or stale addresses; callers can fall back to cache.
      }
    }

    return null;
  }

  resolveCDCForwardSelection(logContext = {}) {
    const service = this.service;
    const strictForwarding = service.shouldUseStrictCDCForwarding(logContext);
    const allowJoinConvergenceTargeting = strictForwarding &&
      service.shouldAllowJoinConvergenceStrictTargeting();
    const excludedReplicaId = allowJoinConvergenceTargeting ?
      null :
      service.replicaId;
    const strictForwardRetryAfterMs = strictForwarding ?
      service.resolveStrictCdcForwardRetryAfterMs() :
      NUM.ZERO;
    const isConnectedNode = (nodeId) => {
      if (typeof service.transport?.getConnectionState !== TYPEOF.FUNCTION) {
        return true;
      }
      return service.transport.getConnectionState(nodeId) === STATE.CONNECTED;
    };
    const cacheLeaderService = resolveMessageGroupLeaderServiceFromCache(
      service.systemTableCache,
      service.groupId,
      strictForwarding ?
        {
          excludeServiceId: excludedReplicaId,
          requireReadyNode: false,
          preferConnectedCandidates: false,
          allowStoppedService: false,
          isConnectedNode,
        } :
        {
          excludeServiceId: excludedReplicaId,
          isConnectedNode,
        },
    );
    const cacheForwardService = resolveMessageGroupForwardServiceFromCache(
      service.systemTableCache,
      service.groupId,
      {
        excludeServiceId: excludedReplicaId,
        isConnectedNode,
      },
    );
    const strictRecoveryRoutingContract = strictForwarding ?
      this.resolveStrictCdcRecoveryRoutingContract(logContext) :
      null;
    const canonicalLeaderIdentity =
      this.resolveCanonicalLeaderIdentityFromCache();
    const {
      targets,
      suppressedCount,
      recoveryCandidateWidened,
    } = service.buildCDCForwardTargets(
      cacheLeaderService,
      cacheForwardService,
      {
        strictForwarding,
        strictRecoveryRoutingContract,
      },
    );

    return {
      strictForwarding,
      strictForwardRetryAfterMs,
      cacheLeaderService,
      cacheForwardService,
      canonicalLeaderIdentity,
      strictRecoveryRoutingContract,
      recoveryCandidateWidened,
      targets,
      suppressedCount,
    };
  }

  buildStrictCdcRecoveryRoutingContract(contract = {}) {
    const routableNodeIds = [...new Set(
      (Array.isArray(contract.routableNodeIds) ? contract.routableNodeIds : [])
        .filter((nodeId) =>
          typeof nodeId === TYPEOF.STRING && nodeId.length > NUM.ZERO),
    )];
    const forwardCandidates = Array.isArray(contract.forwardCandidates) ?
      contract.forwardCandidates :
      [];
    const localSystemTableWriteAvailable =
      contract.localSystemTableWriteAvailable === true;
    const remoteForwardCandidates = forwardCandidates.filter((candidate) => {
      return candidate?.[COLUMN.NODE_ID] !== this.service.nodeId;
    });
    const state = remoteForwardCandidates.length > NUM.ZERO ?
      MESSAGE_GROUP_CDC_RECOVERY_ROUTING_STATE.REMOTE_TARGETS_AVAILABLE :
      localSystemTableWriteAvailable ?
        MESSAGE_GROUP_CDC_RECOVERY_ROUTING_STATE.LOCAL_ONLY :
        MESSAGE_GROUP_CDC_RECOVERY_ROUTING_STATE.NONE;
    return Object.freeze({
      state,
      partitionId:
        typeof contract.partitionId === TYPEOF.STRING &&
          contract.partitionId.length > NUM.ZERO ?
          contract.partitionId :
          null,
      routingSnapshot:
        contract.routingSnapshot && typeof contract.routingSnapshot === TYPEOF.OBJECT ?
          contract.routingSnapshot :
          null,
      routableNodeIds,
      localSystemTableWriteAvailable,
      forwardCandidates: remoteForwardCandidates,
      recoveryCandidateWidening:
        remoteForwardCandidates.length > NUM.ZERO ||
        localSystemTableWriteAvailable,
    });
  }

  resolveStrictCdcSystemTablePartitionId(tableName) {
    const service = this.service;
    const cdcIntegrationService = service.cdcIntegrationService || null;
    if (typeof cdcIntegrationService?.resolveSystemTablePartitionIds ===
        TYPEOF.FUNCTION) {
      const partitionIds = cdcIntegrationService.resolveSystemTablePartitionIds(
        tableName,
      );
      const partitionId = Array.isArray(partitionIds) ?
        partitionIds[NUM.ZERO] :
        null;
      if (typeof partitionId === TYPEOF.STRING && partitionId.length > NUM.ZERO) {
        return partitionId;
      }
    }

    const partitionId = INITIAL_PARTITION_IDS[tableName] || null;
    return typeof partitionId === TYPEOF.STRING && partitionId.length > NUM.ZERO ?
      partitionId :
      null;
  }

  resolveStrictCdcRecoveryRoutingContract(logContext = {}) {
    const service = this.service;
    const tableName = typeof logContext?.tableName === TYPEOF.STRING &&
      logContext.tableName.length > NUM.ZERO ?
      logContext.tableName :
      null;
    if (!tableName || !STRICT_CDC_FORWARD_SYSTEM_TABLES.has(tableName)) {
      return this.buildStrictCdcRecoveryRoutingContract();
    }

    const cdcIntegrationService = service.cdcIntegrationService || null;
    const partitionId = this.resolveStrictCdcSystemTablePartitionId(tableName);
    const queryExecutor = cdcIntegrationService?.sqlQueryEngine?.queryExecutor || null;
    let routingSnapshot = null;
    if (partitionId &&
        typeof queryExecutor?.getPartitionRoutingSnapshot === TYPEOF.FUNCTION) {
      try {
        routingSnapshot = queryExecutor.getPartitionRoutingSnapshot(
          partitionId,
          CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
        );
      } catch (_error) {
        routingSnapshot = null;
      }
    }

    const routableNodeIdSet = new Set(
      (Array.isArray(routingSnapshot?.routableServices) ?
        routingSnapshot.routableServices :
        [])
        .map((candidate) => candidate?.[COLUMN.NODE_ID] || null)
        .filter((nodeId) =>
          typeof nodeId === TYPEOF.STRING && nodeId.length > NUM.ZERO),
    );
    const forwardCandidates = resolveMessageGroupForwardServiceCandidatesFromCache(
      service.systemTableCache,
      service.groupId,
      {
        excludeServiceId: service.replicaId,
        isConnectedNode: (nodeId) => this.isStrictForwardNodeConnected(nodeId),
      },
    ).filter((candidate) => {
      if (routableNodeIdSet.size === NUM.ZERO) {
        return false;
      }
      return routableNodeIdSet.has(candidate?.[COLUMN.NODE_ID] || null);
    });

    const localSystemTableWriteAvailable =
      typeof cdcIntegrationService?.canWriteSystemTableLocally ===
        TYPEOF.FUNCTION &&
      cdcIntegrationService.canWriteSystemTableLocally(tableName) === true;

    return this.buildStrictCdcRecoveryRoutingContract({
      partitionId,
      routingSnapshot,
      routableNodeIds: [...routableNodeIdSet],
      forwardCandidates,
      localSystemTableWriteAvailable,
    });
  }

  buildCDCForwardTargets(cacheLeaderService, cacheForwardService, options = {}) {
    const service = this.service;
    const strictForwarding = options.strictForwarding === true;
    const strictRecoveryRoutingContract =
      options.strictRecoveryRoutingContract &&
      typeof options.strictRecoveryRoutingContract === TYPEOF.OBJECT ?
        options.strictRecoveryRoutingContract :
        this.buildStrictCdcRecoveryRoutingContract();
    const targets = [];
    let suppressedCount = NUM.ZERO;
    let recoveryCandidateWidened = false;
    const targetsByServiceId = new Map();
    const addTarget = (serviceId, address = null) => {
      if (typeof serviceId !== TYPEOF.STRING ||
        serviceId.length === NUM.ZERO ||
        service.isLocalForwardTarget(serviceId, address)) {
        return;
      }

      const normalizedAddress = typeof address === TYPEOF.STRING &&
        address.length > NUM.ZERO ?
        address :
        null;
      const existingTarget = targetsByServiceId.get(serviceId);
      if (existingTarget) {
        if (!existingTarget.address && normalizedAddress) {
          existingTarget.address = normalizedAddress;
        }
        return;
      }

      const target = {
        serviceId,
        address: normalizedAddress,
      };
      targetsByServiceId.set(serviceId, target);
      if (service.isForwardTargetSuppressed(target)) {
        suppressedCount += NUM.ONE;
        return;
      }
      targets.push(target);
    };

    if (strictForwarding) {
      const liveLeaderTarget = service.resolveLiveLeaderForwardTarget();
      if (service.isStrictForwardTargetEligible(liveLeaderTarget)) {
        addTarget(liveLeaderTarget.serviceId, liveLeaderTarget.address);
        return {targets, suppressedCount};
      }

      if (service.isStrictForwardTargetEligible({
        serviceId: cacheLeaderService?.[COLUMN.SERVICE_ID],
        address: cacheLeaderService?.[COLUMN.ADDRESS],
      })) {
        addTarget(
          cacheLeaderService?.[COLUMN.SERVICE_ID],
          cacheLeaderService?.[COLUMN.ADDRESS],
        );
      }
      if (targets.length === NUM.ZERO &&
          service.shouldAllowJoinConvergenceStrictTargeting()) {
        const bootstrapTarget =
          service.resolveJoinConvergenceBootstrapForwardTarget();
        if (service.isStrictForwardTargetEligible(bootstrapTarget)) {
          addTarget(bootstrapTarget.serviceId, bootstrapTarget.address);
        }
      }
      if (targets.length === NUM.ZERO &&
          strictRecoveryRoutingContract.state ===
            MESSAGE_GROUP_CDC_RECOVERY_ROUTING_STATE.REMOTE_TARGETS_AVAILABLE) {
        for (const recoveryCandidate of
          strictRecoveryRoutingContract.forwardCandidates) {
          addTarget(
            recoveryCandidate?.[COLUMN.SERVICE_ID] || null,
            recoveryCandidate?.[COLUMN.ADDRESS] || null,
          );
        }
        recoveryCandidateWidened = targets.length > NUM.ZERO;
      }
      return {targets, suppressedCount, recoveryCandidateWidened};
    }

    addTarget(
      cacheForwardService?.[COLUMN.SERVICE_ID],
      cacheForwardService?.[COLUMN.ADDRESS],
    );
    addTarget(
      cacheLeaderService?.[COLUMN.SERVICE_ID],
      cacheLeaderService?.[COLUMN.ADDRESS],
    );
    addTarget(service.leaderId);

    if (Array.isArray(service.replicaIds)) {
      for (const peerId of service.replicaIds) {
        addTarget(peerId);
      }
    }

    return {targets, suppressedCount, recoveryCandidateWidened};
  }

  shouldUseStrictCDCForwarding(logContext = {}) {
    const tableName = logContext?.tableName || null;
    return typeof tableName === TYPEOF.STRING &&
      STRICT_CDC_FORWARD_SYSTEM_TABLES.has(tableName);
  }

  shouldAllowRelayedStrictConvergenceIngress(logContext = {}) {
    const relayDepth = Number.isInteger(logContext?.relayDepth) &&
      logContext.relayDepth >= NUM.ZERO ?
      logContext.relayDepth :
      NUM.ZERO;
    return relayDepth >= MESSAGE_GROUP_CDC_RELAY_CONVERGENCE_MIN_DEPTH;
  }

  shouldAllowAddressedStrictConvergenceIngress(logContext = {}) {
    return logContext?.[
      MESSAGE_GROUP_CDC_LOG_CONTEXT_FIELD.ADDRESSED_STRICT_CONVERGENCE
    ] === true;
  }

  buildAddressedStrictConvergenceContext(logContext = {}) {
    return {
      ...logContext,
      [MESSAGE_GROUP_CDC_LOG_CONTEXT_FIELD.ADDRESSED_STRICT_CONVERGENCE]: true,
    };
  }

  shouldUseCanonicalLocalIngressForStrictCDC(
    selection = null,
    logContext = {},
  ) {
    const service = this.service;
    if (selection?.strictForwarding !== true) {
      return false;
    }

    if (selection?.strictRecoveryRoutingContract?.state ===
          MESSAGE_GROUP_CDC_RECOVERY_ROUTING_STATE.LOCAL_ONLY &&
        Array.isArray(selection?.targets) &&
        selection.targets.length === NUM.ZERO) {
      return true;
    }

    const allowMetadataPublicationConvergenceIngress =
      typeof service.isMetadataPublicationConvergenceWindowOpen ===
        TYPEOF.FUNCTION &&
      service.isMetadataPublicationConvergenceWindowOpen() === true;
    const allowRelayedStrictConvergenceIngress =
      this.shouldAllowRelayedStrictConvergenceIngress(logContext);
    const allowAddressedStrictConvergenceIngress =
      this.shouldAllowAddressedStrictConvergenceIngress(logContext);
    // Once strict CDC has already been relayed to this addressed replica,
    // re-running stale competing-target selection just reopens the same loop.
    // At that point the addressed local ingress is the canonical bounded
    // convergence path until leader metadata catches up.
    if (allowRelayedStrictConvergenceIngress ||
        allowAddressedStrictConvergenceIngress) {
      return true;
    }
    if (service.shouldAllowJoinConvergenceStrictTargeting() !== true &&
        !allowMetadataPublicationConvergenceIngress &&
        !allowRelayedStrictConvergenceIngress &&
        !allowAddressedStrictConvergenceIngress) {
      return false;
    }

    if (service.isLocalForwardTarget(
      selection?.cacheLeaderService?.[COLUMN.SERVICE_ID] || null,
      selection?.cacheLeaderService?.[COLUMN.ADDRESS] || null,
    )) {
      return true;
    }

    if (service.isLocalForwardTarget(
      service.normalizeLeaderReplicaId(service.leaderId),
    )) {
      return true;
    }

    // MOVE_REPLICA joiners can receive strict CDC directly before any
    // authoritative or live leader hints are locally visible. In that window,
    // fail closed causes a bootstrap deadlock because the local cache updates
    // needed to make ingress "ready" can only arrive through this strict path.
    // Seed/bootstrap convergence can hit the same self-deadlock while leader
    // metadata is still incomplete but lifecycle publication is already open.
    // Relayed strict CDC needs the same bounded local-ingress escape hatch once
    // another replica has already selected this addressed target.
    if (Array.isArray(selection?.targets) &&
        selection.targets.length === NUM.ZERO) {
      return true;
    }

    return this.resolveCanonicalLeaderIdentityFromCache().leaderNodeId ===
      service.nodeId;
  }

  buildIngressReadinessResult(
    ready,
    reason = null,
    retryAfterMs = undefined,
    extra = {},
  ) {
    const result = {
      ready,
      ...extra,
    };
    if (reason !== null) {
      result.reason = reason;
    }
    if (Number.isFinite(retryAfterMs)) {
      result.retryAfterMs = retryAfterMs;
    }
    return result;
  }

  buildMetadataForwardSelectionResult(selection, extra = {}) {
    return {
      ...selection,
      ...extra,
    };
  }

  buildCdcIngressDecision(decision = {}) {
    const strictForwardRetryAfterMs = Number.isFinite(
      decision.strictForwardRetryAfterMs,
    ) ?
      decision.strictForwardRetryAfterMs :
      NUM.ZERO;
    const normalizedDecision = {
      action: decision.action,
      state: decision.state,
      ready: decision.ready === true,
      strictForwarding: decision.strictForwarding === true,
      strictForwardRetryAfterMs,
      cacheLeaderService: decision.cacheLeaderService || null,
      cacheForwardService: decision.cacheForwardService || null,
      canonicalLeaderNodeId:
        decision?.canonicalLeaderIdentity?.leaderNodeId || null,
      canonicalLeaderIdentityState:
        decision?.canonicalLeaderIdentity?.state || null,
      canonicalLeaderIdentitySource:
        decision?.canonicalLeaderIdentity?.source || null,
      targets: Array.isArray(decision.targets) ? decision.targets : [],
      suppressedCount: Number.isInteger(decision.suppressedCount) ?
        decision.suppressedCount :
        NUM.ZERO,
      localIngress: decision.localIngress === true,
      recoveryCandidateWidening: decision.recoveryCandidateWidening === true,
      strictRecoveryRoutingState:
        typeof decision.strictRecoveryRoutingState === TYPEOF.STRING &&
          decision.strictRecoveryRoutingState.length > NUM.ZERO ?
          decision.strictRecoveryRoutingState :
          null,
      shouldRepairAuthoritativeTopology:
        decision.shouldRepairAuthoritativeTopology === true,
    };
    if (typeof decision.reason === TYPEOF.STRING &&
        decision.reason.length > NUM.ZERO) {
      normalizedDecision.reason = decision.reason;
    }
    return normalizedDecision;
  }

  buildIngressReadinessFromDecision(decision = {}) {
    const includeRetryAfterMs =
      decision.ready !== true || decision.localIngress === true;
    return this.buildIngressReadinessResult(
      decision.ready === true,
      decision.reason || null,
      includeRetryAfterMs === true ?
        decision.strictForwardRetryAfterMs :
        undefined,
      {
        ...(decision.localIngress === true ? {localIngress: true} : {}),
        canonicalLeaderNodeId: decision.canonicalLeaderNodeId || null,
        canonicalLeaderIdentityState:
          decision.canonicalLeaderIdentityState || null,
        canonicalLeaderIdentitySource:
          decision.canonicalLeaderIdentitySource || null,
      },
    );
  }

  resolveForwardRetryAfterMs(baseRetryAfterMs, errorLike = null) {
    const normalizedBaseRetryAfterMs = Number.isFinite(baseRetryAfterMs) &&
      baseRetryAfterMs > NUM.ZERO ?
      Math.floor(baseRetryAfterMs) :
      NUM.ZERO;
    const boundedErrorRetryAfterMs = Number.isFinite(errorLike?.retryAfterMs) &&
      errorLike.retryAfterMs > NUM.ZERO ?
      Math.floor(errorLike.retryAfterMs) :
      NUM.ZERO;
    return Math.max(normalizedBaseRetryAfterMs, boundedErrorRetryAfterMs);
  }

  isRetryableForwardDeliveryFailure(deliveryResult = null, errorMessage = null) {
    const normalizedErrorMessage = typeof errorMessage === TYPEOF.STRING ?
      errorMessage :
      '';
    if (deliveryResult?.deferRetry === true) {
      return true;
    }
    return this.service.isForwardTargetBackpressured(
      deliveryResult,
      normalizedErrorMessage,
    ) ||
      normalizedErrorMessage === TRANSPORT_ERROR_MSG.MESSAGE_TIMEOUT ||
      normalizedErrorMessage.includes(
        MESSAGE_GROUP_FORWARDING_OWNER_LITERAL.ENOTFOUND,
      ) ||
      normalizedErrorMessage.includes(
        MESSAGE_GROUP_FORWARDING_OWNER_LITERAL.EAI_AGAIN,
      ) ||
      normalizedErrorMessage.includes(
        MESSAGE_GROUP_FORWARDING_OWNER_LITERAL.ECONNREFUSED,
      ) ||
      normalizedErrorMessage.includes(
        MESSAGE_GROUP_FORWARDING_OWNER_LITERAL.NO_CONNECTION_TO_NODE,
      ) ||
      (
        normalizedErrorMessage.includes(
          MESSAGE_GROUP_FORWARDING_OWNER_LITERAL.CONNECTION_TO_NODE,
        ) &&
        normalizedErrorMessage.includes(
          MESSAGE_GROUP_FORWARDING_OWNER_LITERAL.CLOSED,
        )
      );
  }

  resolveForwardFailureState(deliveryResult = null, errorLike = null) {
    const errorMessage = typeof errorLike?.message === TYPEOF.STRING ?
      errorLike.message :
      typeof errorLike === TYPEOF.STRING ?
        errorLike :
        null;
    if (errorLike?.deferRetry === true ||
        this.isRetryableForwardDeliveryFailure(
          deliveryResult,
          errorMessage,
        )) {
      return MESSAGE_GROUP_CDC_FORWARD_FAILURE_STATE.RETRYABLE_DEFER;
    }
    return MESSAGE_GROUP_CDC_FORWARD_FAILURE_STATE.NON_RETRYABLE_DEFER;
  }

  buildStrictForwardError(message, retryAfterMs, options = {}) {
    const error = this.buildDeferredCdcForwardError(message, retryAfterMs);
    if (options.failureState ===
        MESSAGE_GROUP_CDC_FORWARD_FAILURE_STATE.RETRYABLE_DEFER) {
      error.retryable = true;
    }
    if (typeof options.code === TYPEOF.STRING &&
        options.code.length > NUM.ZERO) {
      error.code = options.code;
    }
    return error;
  }

  requestAuthoritativeTopologyRepair(
    decision = {},
    logContext = {},
  ) {
    if (decision.shouldRepairAuthoritativeTopology !== true) {
      return;
    }
    void this.service.maybeRepairAuthoritativeForwardTopology({
      errorMessage: MESSAGE_GROUP_CDC_ERROR_MSG.FORWARD_LEADER_UNKNOWN,
      tableName: logContext?.tableName || null,
      operation: logContext?.operation || null,
    });
  }

  async resolveCdcIngressDecisionWithRepair(
    logContext = {},
    options = {},
  ) {
    let decision = this.resolveCdcIngressDecision(logContext, options);
    if (decision.shouldRepairAuthoritativeTopology !== true) {
      return decision;
    }

    await this.service.maybeRepairAuthoritativeForwardTopology({
      errorMessage: MESSAGE_GROUP_CDC_ERROR_MSG.FORWARD_LEADER_UNKNOWN,
      tableName: logContext?.tableName || null,
      operation: logContext?.operation || null,
    });
    decision = this.resolveCdcIngressDecision(logContext, options);
    return decision;
  }

  resolveCdcIngressDecision(logContext = {}, options = {}) {
    const service = this.service;
    const tableName = typeof logContext?.tableName === TYPEOF.STRING &&
      logContext.tableName.length > NUM.ZERO ?
      logContext.tableName :
      null;
    const operation = typeof logContext?.operation === TYPEOF.STRING &&
      logContext.operation.length > NUM.ZERO ?
      logContext.operation :
      null;
    const initializationRequirement =
      options.initializationRequirement ===
        MESSAGE_GROUP_CDC_INGRESS_INITIALIZATION.REQUIRED ?
        MESSAGE_GROUP_CDC_INGRESS_INITIALIZATION.REQUIRED :
        MESSAGE_GROUP_CDC_INGRESS_INITIALIZATION.OPTIONAL;
    const strictForwarding = service.shouldUseStrictCDCForwarding({
      tableName,
      operation,
    });
    const strictForwardRetryAfterMs = strictForwarding === true ?
      service.resolveStrictCdcForwardRetryAfterMs() :
      NUM.ZERO;

    if (initializationRequirement ===
          MESSAGE_GROUP_CDC_INGRESS_INITIALIZATION.REQUIRED &&
        service.initialized !== true) {
      return this.buildCdcIngressDecision({
        action: MESSAGE_GROUP_CDC_INGRESS_ACTION.DEFER,
        state:
          MESSAGE_GROUP_CDC_INGRESS_STATE.DEFER_INGRESS_NOT_INITIALIZED,
        ready: false,
        reason: MESSAGE_GROUP_FORWARDING_REASON.INGRESS_NOT_INITIALIZED,
        strictForwarding,
        strictForwardRetryAfterMs:
          service.resolveStrictCdcForwardRetryAfterMs(),
      });
    }

    if (service.isCurrentRaftLeader()) {
      return this.buildCdcIngressDecision({
        action: MESSAGE_GROUP_CDC_INGRESS_ACTION.APPLY_LOCAL,
        state: MESSAGE_GROUP_CDC_INGRESS_STATE.LOCAL_RAFT_LEADER,
        ready: true,
        strictForwarding,
        strictForwardRetryAfterMs,
        canonicalLeaderIdentity:
          this.resolveCanonicalLeaderIdentityFromCache(),
      });
    }

    const selection = service.resolveCDCForwardSelection({
      tableName,
      operation,
    });
    const resolvedStrictForwardRetryAfterMs = Number.isFinite(
      selection.strictForwardRetryAfterMs,
    ) ?
      selection.strictForwardRetryAfterMs :
      strictForwardRetryAfterMs;
    if (selection.strictForwarding !== true) {
      return this.buildCdcIngressDecision({
        action: MESSAGE_GROUP_CDC_INGRESS_ACTION.FORWARD,
        state: MESSAGE_GROUP_CDC_INGRESS_STATE.FORWARD_NON_STRICT,
        ready: true,
        strictForwarding: false,
        strictForwardRetryAfterMs: resolvedStrictForwardRetryAfterMs,
        cacheLeaderService: selection.cacheLeaderService,
        cacheForwardService: selection.cacheForwardService,
        canonicalLeaderIdentity: selection.canonicalLeaderIdentity,
        targets: selection.targets,
        suppressedCount: selection.suppressedCount,
      });
    }

    if (this.shouldUseCanonicalLocalIngressForStrictCDC(
      selection,
      logContext,
    )) {
      const strictRecoveryRoutingState =
        selection?.strictRecoveryRoutingContract?.state || null;
      return this.buildCdcIngressDecision({
        action: MESSAGE_GROUP_CDC_INGRESS_ACTION.APPLY_LOCAL,
        state: strictRecoveryRoutingState ===
            MESSAGE_GROUP_CDC_RECOVERY_ROUTING_STATE.LOCAL_ONLY ?
          MESSAGE_GROUP_CDC_INGRESS_STATE.LOCAL_STRICT_RECOVERY_INGRESS :
          MESSAGE_GROUP_CDC_INGRESS_STATE.LOCAL_STRICT_CONVERGENCE_INGRESS,
        ready: true,
        strictForwarding: true,
        strictForwardRetryAfterMs: resolvedStrictForwardRetryAfterMs,
        cacheLeaderService: selection.cacheLeaderService,
        cacheForwardService: selection.cacheForwardService,
        canonicalLeaderIdentity: selection.canonicalLeaderIdentity,
        targets: selection.targets,
        suppressedCount: selection.suppressedCount,
        localIngress: true,
        recoveryCandidateWidening:
          selection?.strictRecoveryRoutingContract?.recoveryCandidateWidening ===
            true,
        strictRecoveryRoutingState,
      });
    }

    if (selection.targets.length > NUM.ZERO) {
      const strictRecoveryRoutingState =
        selection?.strictRecoveryRoutingContract?.state || null;
      return this.buildCdcIngressDecision({
        action: MESSAGE_GROUP_CDC_INGRESS_ACTION.FORWARD,
        state: selection.recoveryCandidateWidened === true ?
          MESSAGE_GROUP_CDC_INGRESS_STATE.FORWARD_STRICT_RECOVERY_TARGET :
          MESSAGE_GROUP_CDC_INGRESS_STATE.FORWARD_STRICT_TARGET,
        ready: true,
        strictForwarding: true,
        strictForwardRetryAfterMs: resolvedStrictForwardRetryAfterMs,
        cacheLeaderService: selection.cacheLeaderService,
        cacheForwardService: selection.cacheForwardService,
        canonicalLeaderIdentity: selection.canonicalLeaderIdentity,
        targets: selection.targets,
        suppressedCount: selection.suppressedCount,
        recoveryCandidateWidening: selection.recoveryCandidateWidened === true,
        strictRecoveryRoutingState,
      });
    }

    return this.buildCdcIngressDecision({
      action: MESSAGE_GROUP_CDC_INGRESS_ACTION.DEFER,
      state: MESSAGE_GROUP_CDC_INGRESS_STATE.DEFER_STRICT_TARGET_UNKNOWN,
      ready: false,
      reason: MESSAGE_GROUP_CDC_ERROR_MSG.FORWARD_LEADER_UNKNOWN,
      strictForwarding: true,
      strictForwardRetryAfterMs: resolvedStrictForwardRetryAfterMs,
      cacheLeaderService: selection.cacheLeaderService,
      cacheForwardService: selection.cacheForwardService,
      canonicalLeaderIdentity: selection.canonicalLeaderIdentity,
      targets: selection.targets,
      suppressedCount: selection.suppressedCount,
      shouldRepairAuthoritativeTopology: true,
    });
  }

  buildForwardTopologyRepairOutcome(repaired, outcome) {
    return {
      repaired,
      outcome,
    };
  }

  canAcceptCDCEvent(cdcEvent = {}) {
    const decision = this.resolveCdcIngressDecision(cdcEvent);
    this.requestAuthoritativeTopologyRepair(decision, cdcEvent);
    return this.buildIngressReadinessFromDecision(decision);
  }

  getMetadataIngressReadiness(options = {}) {
    const service = this.service;
    if (service.initialized !== true) {
      return this.buildIngressReadinessResult(
        false,
        MESSAGE_GROUP_FORWARDING_REASON.INGRESS_NOT_INITIALIZED,
        service.resolveStrictCdcForwardRetryAfterMs(),
      );
    } else if (service.isCurrentRaftLeader()) {
      return this.buildIngressReadinessResult(true);
    }

    const requiredTables = [...new Set(
      (Array.isArray(options.requiredTables) ? options.requiredTables : [])
        .filter((tableName) =>
          typeof tableName === TYPEOF.STRING &&
          tableName.length > NUM.ZERO,
        ),
    )];
    if (requiredTables.length === NUM.ZERO) {
      return this.buildIngressReadinessResult(
        false,
        MESSAGE_GROUP_CDC_ERROR_MSG.FORWARD_LEADER_UNKNOWN,
        service.resolveStrictCdcForwardRetryAfterMs(),
      );
    }

    let retryAfterMs = NUM.ZERO;
    for (const tableName of requiredTables) {
      const decision = this.resolveCdcIngressDecision(
        {
          tableName,
          operation: MESSAGE_GROUP_FORWARDING_OWNER_LITERAL.METADATA_INGRESS,
        },
        {
          initializationRequirement:
            MESSAGE_GROUP_CDC_INGRESS_INITIALIZATION.REQUIRED,
        },
      );
      this.requestAuthoritativeTopologyRepair(
        decision,
        {
          tableName,
          operation: MESSAGE_GROUP_FORWARDING_OWNER_LITERAL.METADATA_INGRESS,
        },
      );
      const readiness = this.buildIngressReadinessFromDecision(decision);
      if (decision.ready !== true) {
        return this.buildIngressReadinessResult(
          false,
          readiness.reason ||
            MESSAGE_GROUP_CDC_ERROR_MSG.FORWARD_LEADER_UNKNOWN,
          Number.isFinite(readiness.retryAfterMs) ?
            readiness.retryAfterMs :
            service.resolveStrictCdcForwardRetryAfterMs(),
        );
      }
      if (Number.isFinite(readiness.retryAfterMs)) {
        retryAfterMs = Math.max(retryAfterMs, readiness.retryAfterMs);
      }
    }

    return this.buildIngressReadinessResult(
      true,
      null,
      retryAfterMs > NUM.ZERO ? retryAfterMs : undefined,
    );
  }

  async resolveMetadataIngressForwardSelection(options = {}) {
    const requiredTables = [...new Set(
      (Array.isArray(options.requiredTables) ? options.requiredTables : [])
        .filter((tableName) =>
          typeof tableName === TYPEOF.STRING &&
          tableName.length > NUM.ZERO,
        ),
    )];
    const tableName = requiredTables.find((candidate) =>
      STRICT_CDC_FORWARD_SYSTEM_TABLES.has(candidate),
    ) || requiredTables[NUM.ZERO] || null;
    if (!tableName) {
      return this.buildMetadataForwardSelectionResult({
        strictForwarding: false,
        strictForwardRetryAfterMs: NUM.ZERO,
        targets: [],
        suppressedCount: NUM.ZERO,
      });
    }

    const decision = await this.resolveCdcIngressDecisionWithRepair(
      {
        tableName,
        operation: MESSAGE_GROUP_FORWARDING_OWNER_LITERAL.METADATA_INGRESS,
      },
      {
        initializationRequirement:
          MESSAGE_GROUP_CDC_INGRESS_INITIALIZATION.REQUIRED,
      },
    );
    return this.buildMetadataForwardSelectionResult(decision);
  }

  async forwardMetadataIngressPayloadToLeader(payload, options = {}) {
    const service = this.service;
    const selection = await service.resolveMetadataIngressForwardSelection({
      requiredTables: options.requiredTables,
    });
    const {
      strictForwarding,
      strictForwardRetryAfterMs,
      targets,
      suppressedCount,
    } = selection;
    if (!Array.isArray(targets) || targets.length === NUM.ZERO) {
      const error = strictForwarding ?
        this.buildDeferredCdcForwardError(
          MESSAGE_GROUP_CDC_ERROR_MSG.FORWARD_LEADER_UNKNOWN,
          strictForwardRetryAfterMs,
        ) :
        new Error(MESSAGE_GROUP_CDC_ERROR_MSG.FORWARD_LEADER_UNKNOWN);
      if (suppressedCount > NUM.ZERO) {
        error.retryable = false;
      }
      throw error;
    }

    const forwardedByNodeId =
      typeof options.forwardedByNodeId === TYPEOF.STRING &&
      options.forwardedByNodeId.length > NUM.ZERO ?
        options.forwardedByNodeId :
        service.nodeId;
    const forwardedBy = Array.isArray(payload?.[ControlPlaneField.FORWARDED_BY]) ?
      payload[ControlPlaneField.FORWARDED_BY] :
      payload?.[ControlPlaneField.FORWARDED_BY] ?
        [payload[ControlPlaneField.FORWARDED_BY]] :
        [];
    if (forwardedBy.includes(forwardedByNodeId)) {
      return;
    }

    const forwardedPayload = {
      ...payload,
      [ControlPlaneField.FORWARDED_BY]: [
        ...forwardedBy,
        forwardedByNodeId,
      ],
    };

    let lastError = null;
    for (const target of targets) {
      const targetAddress = typeof target?.address === TYPEOF.STRING &&
        target.address.length > NUM.ZERO ?
        target.address :
        service.buildPeerAddress(target?.serviceId || null);
      if (typeof targetAddress !== TYPEOF.STRING ||
          targetAddress.length === NUM.ZERO) {
        lastError = new Error(
          MESSAGE_GROUP_CDC_ERROR_MSG.FORWARD_LEADER_ADDRESS_UNRESOLVED,
        );
        continue;
      }
      try {
        await service.sendMessage(targetAddress, forwardedPayload);
        return;
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError || new Error(
      MESSAGE_GROUP_CDC_ERROR_MSG.FORWARD_LEADER_UNKNOWN,
    );
  }

  isMetadataIngressReady(options = {}) {
    return this.service.getMetadataIngressReadiness(options).ready === true;
  }

  isStrictForwardTargetEligible(target = null) {
    const service = this.service;
    if (!target ||
        typeof target !== TYPEOF.OBJECT ||
        typeof target.serviceId !== TYPEOF.STRING ||
        target.serviceId.length === NUM.ZERO) {
      return false;
    }

    const nodeId = service.resolveForwardTargetNodeId(target);
    if (typeof nodeId !== TYPEOF.STRING || nodeId.length === NUM.ZERO) {
      return false;
    }

    if (!service.isStrictForwardNodeConnected(nodeId)) {
      return false;
    }

    return true;
  }

  shouldAllowJoinConvergenceStrictTargeting() {
    return this.service.shouldSuppressJoinPhaseRaftParticipation();
  }

  resolveJoinConvergenceBootstrapForwardTarget() {
    const service = this.service;
    if (!Array.isArray(service.peerAddresses) ||
        service.peerAddresses.length === NUM.ZERO) {
      return null;
    }

    const leaderNodeId =
      this.resolveCanonicalLeaderIdentityFromCache().leaderNodeId;
    if (typeof leaderNodeId !== TYPEOF.STRING ||
        leaderNodeId.length === NUM.ZERO) {
      return null;
    }

    for (const address of service.peerAddresses) {
      if (typeof address !== TYPEOF.STRING || address.length === NUM.ZERO) {
        continue;
      }
      try {
        const parsed = service.addressManager.parse(address);
        if (parsed.serviceType !== ENTITY_TYPE.MESSAGE_GROUP ||
            parsed.nodeId !== leaderNodeId ||
            service.isLocalForwardTarget(parsed.serviceId, address)) {
          continue;
        }
        return {
          serviceId: parsed.serviceId,
          address,
        };
      } catch (_error) {
        continue;
      }
    }

    return null;
  }
}

Object.assign(
  MessageGroupForwardingOwner.prototype,
  createMessageGroupForwardingOwnerDeliveryMethods({
    buildMessageGroupLeaderIdentitySnapshot,
    buildForwardTopologyRepairReadOptions,
    resolveCDCForwardDeliveryPriority,
    getSystemCachePrimaryKeyFieldOrFallback,
    buildControlPlaneWorkloadProfile,
    normalizeCauseId,
    column: COLUMN,
    controlPlaneReadStrategy: CONTROL_PLANE_READ_STRATEGY,
    entityType: ENTITY_TYPE,
    forwardTopologyRepairOutcome: FORWARD_TOPOLOGY_REPAIR_OUTCOME,
    messageGroupApplicationErrorMsg: MESSAGE_GROUP_APPLICATION_ERROR_MSG,
    messageGroupApplicationMessageType: MESSAGE_GROUP_APPLICATION_MESSAGE_TYPE,
    messageGroupCdcErrorMsg: MESSAGE_GROUP_CDC_ERROR_MSG,
    messageGroupCdcIngressAction: MESSAGE_GROUP_CDC_INGRESS_ACTION,
    messageGroupCdcLogContextField: MESSAGE_GROUP_CDC_LOG_CONTEXT_FIELD,
    messageGroupForwardingOwnerLiteral:
      MESSAGE_GROUP_FORWARDING_OWNER_LITERAL,
    messageGroupLeaderIdentitySource: MESSAGE_GROUP_LEADER_IDENTITY_SOURCE,
    messageGroupLeaderIdentityState: MESSAGE_GROUP_LEADER_IDENTITY_STATE,
    num: NUM,
    serviceType: SERVICE_TYPE,
    state: STATE,
    tables: TABLES,
    transportErrorMsg: TRANSPORT_ERROR_MSG,
    typeofToken: TYPEOF,
    forwardTopologyRepairWorkloadClass:
      CONTROL_PLANE_WORKLOAD_CLASS.MESSAGE_GROUP_FORWARD_TOPOLOGY_REPAIR,
  }),
);

export {
  MESSAGE_GROUP_CDC_INGRESS_ACTION,
  MESSAGE_GROUP_CDC_INGRESS_INITIALIZATION,
  MESSAGE_GROUP_CDC_INGRESS_STATE,
  MESSAGE_GROUP_CDC_LOG_CONTEXT_FIELD,
  MESSAGE_GROUP_LEADER_IDENTITY_SOURCE,
  MESSAGE_GROUP_LEADER_IDENTITY_STATE,
  MessageGroupForwardingOwner,
};
