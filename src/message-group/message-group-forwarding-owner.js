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
import {ControlPlaneField} from '../control-plane/control-plane-constants.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../control-plane/control-plane-readiness-constants.js';
import {
  CONTROL_PLANE_READ_STRATEGY,
} from '../control-plane/control-plane-system-table-gateway.js';
import {PRESSURE_WORK_CLASS} from '../control-plane/pressure-governor.js';
import {
  SYSTEM_TABLE_NAME,
} from '../bootstrap/system-table-schemas-constants.js';
import {
  MESSAGE_GROUP_APPLICATION_ERROR_MSG,
  MESSAGE_GROUP_APPLICATION_MESSAGE_TYPE,
  MESSAGE_GROUP_CDC_ERROR_MSG,
} from './constants.js';
import {
  resolveMessageGroupForwardServiceFromCache,
  resolveMessageGroupLeaderServiceFromCache,
} from './message-group-target-resolver.js';
import {normalizeCauseId} from '../utils/cause-id.js';
import {TRANSPORT_ERROR_MSG} from '../constants/transport.js';
const MESSAGE_GROUP_FORWARDING_OWNER_LITERAL = Object.freeze({
  AUTHORITATIVE_MESSAGE_DASH_GROUP_FORWARD_TOPOLOGY_REPAIR_FAILED: "Authoritative message-group forward topology repair failed",
  BACKGROUND: "background",
  CDC_FORWARD_TO_LEADER_REJECTED: "CDC forward to leader rejected",
  CLOSED: "closed",
  CONNECTION_TO_NODE: "Connection to node",
  CRITICAL: "critical",
  EAI_AGAIN: "EAI_AGAIN",
  ECONNREFUSED: "ECONNREFUSED",
  ENOTFOUND: "ENOTFOUND",
  FORWARD_SLASH: "/",
  IS_SATURATED: "is saturated",
  MESSAGE_DASH_GROUP_DASH_SERVICE: "message-group-service",
  METADATA_INGRESS: "metadata_ingress",
  NO_CONNECTION_TO_NODE: "No connection to node",
  NO_HANDLER_REGISTERED_FOR_ADDRESS: "No handler registered for address",
  OUTBOUND_QUEUE_BACKPRESSURED: "OUTBOUND_QUEUE_BACKPRESSURED",
  OUTBOUND_QUEUE_FOR_NODE: "Outbound queue for node",
  REPAIRED_MESSAGE_DASH_GROUP_FORWARD_TOPOLOGY_FROM_AUTHORITATIVE_ROWS: "Repaired message-group forward topology from authoritative rows",
  ZERO: 0,
});


const STRICT_CDC_FORWARD_SYSTEM_TABLES = new Set(
  Object.values(SYSTEM_TABLE_NAME),
);
const BACKGROUND_CDC_FORWARD_SYSTEM_TABLES = new Set([
  SYSTEM_TABLE_NAME.MESSAGE_GROUPS,
  SYSTEM_TABLE_NAME.NODES,
  SYSTEM_TABLE_NAME.NODE_ENDPOINTS,
  SYSTEM_TABLE_NAME.SERVICE_ENDPOINTS,
]);

const FORWARD_TOPOLOGY_REPAIR_OUTCOME = Object.freeze({
  FAILED: 'failed',
  REPAIRED: 'repaired',
  UNCHANGED: 'unchanged',
});

const MESSAGE_GROUP_FORWARDING_REASON = Object.freeze({
  INGRESS_NOT_INITIALIZED: 'message-group ingress not initialized',
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

function isCriticalPartitionServiceRow(row = null) {
  const serviceType = String(
    row?.[COLUMN.SERVICE_TYPE] ??
    row?.service_type ??
    row?.serviceType ??
    '',
  ).toLowerCase();
  return serviceType === SERVICE_TYPE.PARTITION;
}

function resolveCDCForwardDeliveryPriority(
  tableName,
  payload = null,
  replayOnly = false,
) {
  if (replayOnly === true) {
    return MESSAGE_GROUP_FORWARDING_OWNER_LITERAL.BACKGROUND;
  }
  if (tableName === SYSTEM_TABLE_NAME.SERVICES) {
    const payloadRows = extractCDCForwardPayloadRows(payload);
    return payloadRows.some((row) => isCriticalPartitionServiceRow(row)) ?
      MESSAGE_GROUP_FORWARDING_OWNER_LITERAL.CRITICAL :
      MESSAGE_GROUP_FORWARDING_OWNER_LITERAL.BACKGROUND;
  }
  return typeof tableName === TYPEOF.STRING &&
    BACKGROUND_CDC_FORWARD_SYSTEM_TABLES.has(tableName) ?
    MESSAGE_GROUP_FORWARDING_OWNER_LITERAL.BACKGROUND :
    MESSAGE_GROUP_FORWARDING_OWNER_LITERAL.CRITICAL;
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
    const {
      targets,
      suppressedCount,
    } = service.buildCDCForwardTargets(
      cacheLeaderService,
      cacheForwardService,
      {strictForwarding},
    );

    return {
      strictForwarding,
      strictForwardRetryAfterMs,
      cacheLeaderService,
      cacheForwardService,
      targets,
      suppressedCount,
    };
  }

  buildCDCForwardTargets(cacheLeaderService, cacheForwardService, options = {}) {
    const service = this.service;
    const strictForwarding = options.strictForwarding === true;
    const targets = [];
    let suppressedCount = NUM.ZERO;
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
      return {targets, suppressedCount};
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

    return {targets, suppressedCount};
  }

  shouldUseStrictCDCForwarding(logContext = {}) {
    const tableName = logContext?.tableName || null;
    return typeof tableName === TYPEOF.STRING &&
      STRICT_CDC_FORWARD_SYSTEM_TABLES.has(tableName);
  }

  shouldUseCanonicalLocalIngressForStrictCDC(selection = null) {
    const service = this.service;
    const allowMetadataPublicationConvergenceIngress =
      typeof service.isMetadataPublicationConvergenceWindowOpen ===
        TYPEOF.FUNCTION &&
      service.isMetadataPublicationConvergenceWindowOpen() === true;
    if (selection?.strictForwarding !== true ||
        (service.shouldAllowJoinConvergenceStrictTargeting() !== true &&
          !allowMetadataPublicationConvergenceIngress)) {
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
    if (Array.isArray(selection?.targets) &&
        selection.targets.length === NUM.ZERO) {
      return true;
    }

    return service.resolveCanonicalLeaderNodeIdFromCache() === service.nodeId;
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

  buildForwardTopologyRepairOutcome(repaired, outcome) {
    return {
      repaired,
      outcome,
    };
  }

  canAcceptCDCEvent(cdcEvent = {}) {
    const service = this.service;
    if (service.isCurrentRaftLeader()) {
      return this.buildIngressReadinessResult(true);
    }

    const selection = service.resolveCDCForwardSelection({
      tableName: cdcEvent?.tableName || null,
      operation: cdcEvent?.operation || null,
    });
    if (!selection.strictForwarding) {
      return this.buildIngressReadinessResult(true);
    }
    if (this.shouldUseCanonicalLocalIngressForStrictCDC(selection)) {
      return this.buildIngressReadinessResult(
        true,
        null,
        selection.strictForwardRetryAfterMs,
        {
          localIngress: true,
        },
      );
    }
    if (selection.targets.length > NUM.ZERO) {
      return this.buildIngressReadinessResult(true);
    }

    void service.maybeRepairAuthoritativeForwardTopology({
      errorMessage: MESSAGE_GROUP_CDC_ERROR_MSG.FORWARD_LEADER_UNKNOWN,
      tableName: cdcEvent?.tableName || null,
      operation: cdcEvent?.operation || null,
    });

    return this.buildIngressReadinessResult(
      false,
      MESSAGE_GROUP_CDC_ERROR_MSG.FORWARD_LEADER_UNKNOWN,
      selection.strictForwardRetryAfterMs,
    );
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
      const readiness = service.canAcceptCDCEvent({tableName});
      if (readiness.ready !== true) {
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
    const service = this.service;
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

    let selection = service.resolveCDCForwardSelection({
      tableName,
      operation: MESSAGE_GROUP_FORWARDING_OWNER_LITERAL.METADATA_INGRESS,
    });
    if (selection.strictForwarding === true &&
        selection.targets.length === NUM.ZERO) {
      await service.maybeRepairAuthoritativeForwardTopology({
        errorMessage: MESSAGE_GROUP_CDC_ERROR_MSG.FORWARD_LEADER_UNKNOWN,
        tableName,
        operation: MESSAGE_GROUP_FORWARDING_OWNER_LITERAL.METADATA_INGRESS,
      });
      selection = service.resolveCDCForwardSelection({
        tableName,
        operation: MESSAGE_GROUP_FORWARDING_OWNER_LITERAL.METADATA_INGRESS,
      });
    }
    if (selection.strictForwarding === true &&
        selection.targets.length === NUM.ZERO) {
      const readiness = service.canAcceptCDCEvent({
        tableName,
        operation: 'metadata_ingress',
      });
      if (readiness?.ready === true && readiness?.localIngress === true) {
        return this.buildMetadataForwardSelectionResult(
          selection,
          {
            localIngress: true,
            strictForwardRetryAfterMs: Number.isFinite(readiness.retryAfterMs) ?
              readiness.retryAfterMs :
              selection.strictForwardRetryAfterMs,
          },
        );
      }
    }
    return selection;
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

    const leaderNodeId = service.resolveCanonicalLeaderNodeIdFromCache();
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

  resolveCanonicalLeaderNodeIdFromCache() {
    const service = this.service;
    if (!service.systemTableCache ||
        typeof service.systemTableCache.get !== TYPEOF.FUNCTION) {
      return null;
    }

    const group = service.systemTableCache.get(TABLES.MESSAGE_GROUPS, service.groupId);
    const leaderNodeId =
      group?.[COLUMN.LEADER_NODE_ID] ||
      group?.leader_node_id ||
      group?.leaderNodeId ||
      null;
    return typeof leaderNodeId === TYPEOF.STRING &&
      leaderNodeId.length > NUM.ZERO ?
      leaderNodeId :
      null;
  }

  isLocalForwardTarget(serviceId, address = null) {
    const service = this.service;
    if (typeof address === TYPEOF.STRING && address.length > NUM.ZERO) {
      if (address === service.unifiedAddress) {
        return true;
      }
      try {
        const parsed = service.addressManager.parse(address);
        return parsed?.serviceType === ENTITY_TYPE.MESSAGE_GROUP &&
          parsed?.serviceId === service.replicaId &&
          parsed?.nodeId === service.nodeId;
      } catch (_error) {
        // Ignore malformed addresses and fall back to service-id-only logic.
      }
    }

    return typeof serviceId === TYPEOF.STRING &&
      serviceId.length > NUM.ZERO &&
      serviceId === service.replicaId;
  }

  resolveForwardTargetNodeId(target = null) {
    const service = this.service;
    const targetAddress = typeof target?.address === TYPEOF.STRING &&
      target.address.length > NUM.ZERO ?
      target.address :
      service.resolvePeerAddressFromCache(target?.serviceId || null);

    if (typeof targetAddress === TYPEOF.STRING &&
        targetAddress.length > NUM.ZERO) {
      try {
        const parsed = service.addressManager.parse(targetAddress);
        if (typeof parsed?.nodeId === TYPEOF.STRING &&
            parsed.nodeId.length > NUM.ZERO) {
          return parsed.nodeId;
        }
      } catch (_error) {
        // Ignore malformed or stale addresses and fall through to cache rows.
      }
    }

    const cache = service.systemTableCache;
    if (!cache || typeof cache.get !== TYPEOF.FUNCTION) {
      return null;
    }
    const serviceRow = cache.get(TABLES.SERVICES, target?.serviceId || null);
    const nodeId = serviceRow?.[COLUMN.NODE_ID] || null;
    return typeof nodeId === TYPEOF.STRING && nodeId.length > NUM.ZERO ?
      nodeId :
      null;
  }

  isStrictForwardNodeReady(nodeId) {
    const service = this.service;
    if (typeof nodeId !== TYPEOF.STRING || nodeId.length === NUM.ZERO) {
      return false;
    }

    const cache = service.systemTableCache;
    if (!cache) {
      return true;
    }

    if (typeof cache.getReadyNodes === TYPEOF.FUNCTION) {
      const readyNodes = cache.getReadyNodes();
      if (Array.isArray(readyNodes)) {
        return readyNodes.includes(nodeId);
      }
    }

    const allNodeRows = typeof cache.getAll === TYPEOF.FUNCTION ?
      cache.getAll(TABLES.NODES) || [] :
      typeof cache.filter === TYPEOF.FUNCTION ?
        cache.filter(TABLES.NODES, () => true) || [] :
        [];
    if (!Array.isArray(allNodeRows) || allNodeRows.length === NUM.ZERO) {
      return true;
    }

    const nodeRow = typeof cache.get === TYPEOF.FUNCTION ?
      cache.get(TABLES.NODES, nodeId) :
      allNodeRows.find((row) => row?.[COLUMN.NODE_ID] === nodeId) || null;
    if (!nodeRow) {
      return false;
    }

    const readyLeaseExpiresAt = Number(nodeRow?.[COLUMN.READY_LEASE_EXPIRES_AT]);
    return nodeRow?.[COLUMN.CONNECTION_STATE] === STATE.READY &&
      Number.isFinite(readyLeaseExpiresAt) &&
      readyLeaseExpiresAt > Date.now();
  }

  isStrictForwardNodeConnected(nodeId) {
    const service = this.service;
    if (typeof nodeId !== TYPEOF.STRING || nodeId.length === NUM.ZERO) {
      return false;
    }
    if (nodeId === service.nodeId) {
      return true;
    }

    if (typeof service.transport?.getConnectionState !== TYPEOF.FUNCTION) {
      return true;
    }

    return service.transport.getConnectionState(nodeId) === STATE.CONNECTED;
  }

  getForwardTargetSuppressionKeys(target = {}) {
    const keys = [];
    if (typeof target.serviceId === TYPEOF.STRING &&
        target.serviceId.length > NUM.ZERO) {
      keys.push(`service:${target.serviceId}`);
    }
    if (typeof target.address === TYPEOF.STRING &&
        target.address.length > NUM.ZERO) {
      keys.push(`address:${target.address}`);
    }
    return keys;
  }

  pruneForwardTargetSuppressions(nowMs = this.service.now()) {
    for (const [key, expiresAt] of this.forwardTargetSuppression.entries()) {
      if (!Number.isFinite(expiresAt) || expiresAt <= nowMs) {
        this.forwardTargetSuppression.delete(key);
      }
    }
  }

  isForwardTargetSuppressed(target = {}) {
    const nowMs = this.service.now();
    this.pruneForwardTargetSuppressions(nowMs);
    return this.getForwardTargetSuppressionKeys(target).some((key) => {
      const expiresAt = this.forwardTargetSuppression.get(key);
      return Number.isFinite(expiresAt) && expiresAt > nowMs;
    });
  }

  suppressForwardTarget(target = {}) {
    const service = this.service;
    const suppressionMs = Number.isFinite(service.forwardTargetSuppressionMs) &&
      service.forwardTargetSuppressionMs > NUM.ZERO ?
      Math.floor(service.forwardTargetSuppressionMs) :
      NUM.ZERO;
    if (suppressionMs <= NUM.ZERO) {
      return;
    }
    const expiresAt = service.now() + suppressionMs;
    for (const key of this.getForwardTargetSuppressionKeys(target)) {
      this.forwardTargetSuppression.set(key, expiresAt);
    }
  }

  clearForwardTargetSuppression(target = {}) {
    for (const key of this.getForwardTargetSuppressionKeys(target)) {
      this.forwardTargetSuppression.delete(key);
    }
  }

  shouldRepairForwardTopology(errorMessage) {
    return typeof errorMessage === TYPEOF.STRING &&
      errorMessage.includes(MESSAGE_GROUP_CDC_ERROR_MSG.FORWARD_LEADER_UNKNOWN);
  }

  canRepairAuthoritativeForwardTopology() {
    const service = this.service;
    const gateway = service.getControlPlaneSystemTableGateway();
    return Boolean(
      service.systemTableCache &&
      typeof service.systemTableCache.applySystemTableChange === TYPEOF.FUNCTION &&
      gateway &&
      typeof gateway.executeRead === TYPEOF.FUNCTION,
    );
  }

  async maybeRepairAuthoritativeForwardTopology(context = {}) {
    const service = this.service;
    if (!service.canRepairAuthoritativeForwardTopology()) {
      return false;
    }

    if (this.forwardTopologyRepairInFlight) {
      return this.forwardTopologyRepairInFlight;
    }

    const nowMs = service.now();
    if ((nowMs - this.lastForwardTopologyRepairAtMs) <
      this.lastForwardTopologyRepairCooldownMs) {
      return false;
    }

    this.forwardTopologyRepairInFlight = (async () => {
      try {
        const repairResult =
          await service.repairAuthoritativeForwardTopology(context);
        if (repairResult.repaired === true) {
          this.lastForwardTopologyRepairCooldownMs =
            service.forwardTopologyRepairCooldownMs;
        } else if (
          repairResult.outcome ===
            FORWARD_TOPOLOGY_REPAIR_OUTCOME.UNCHANGED
        ) {
          this.lastForwardTopologyRepairCooldownMs =
            service.forwardTopologyRepairNoChangeCooldownMs;
        } else {
          this.lastForwardTopologyRepairCooldownMs =
            service.forwardTopologyRepairFailureCooldownMs;
        }
        return repairResult.repaired === true;
      } catch (error) {
        this.lastForwardTopologyRepairCooldownMs =
          service.forwardTopologyRepairFailureCooldownMs;
        service.logger.warn(
          MESSAGE_GROUP_FORWARDING_OWNER_LITERAL.AUTHORITATIVE_MESSAGE_DASH_GROUP_FORWARD_TOPOLOGY_REPAIR_FAILED,
          {
            groupId: service.groupId,
            replicaId: service.replicaId,
            staleServiceId: context?.serviceId || null,
            staleAddress: context?.address || null,
            error: error?.message || String(error),
          },
        );
        return false;
      } finally {
        this.lastForwardTopologyRepairAtMs = service.now();
        this.forwardTopologyRepairInFlight = null;
      }
    })();

    return this.forwardTopologyRepairInFlight;
  }

  async repairAuthoritativeForwardTopology(context = {}) {
    const service = this.service;
    const gateway = service.getControlPlaneSystemTableGateway();
    if (!gateway || typeof gateway.executeRead !== TYPEOF.FUNCTION) {
      return this.buildForwardTopologyRepairOutcome(
        false,
        FORWARD_TOPOLOGY_REPAIR_OUTCOME.FAILED,
      );
    }
    const sessionId =
      `message-group-forward-topology:${service.groupId}:${service.now()}`;
    const readOptions = {
      queryTimeoutMs: service.forwardTopologyRepairQueryTimeoutMs,
      sessionId,
      routingReadinessDimension:
        CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
      workClass: PRESSURE_WORK_CLASS.INTERACTIVE,
    };
    const [groupResult, serviceResult] = await Promise.all([
      gateway.executeRead(
        {
          tableName: TABLES.MESSAGE_GROUPS,
          sql: `SELECT * FROM ${TABLES.MESSAGE_GROUPS} WHERE ${COLUMN.GROUP_ID} = ?`,
          params: [service.groupId],
          strategy: CONTROL_PLANE_READ_STRATEGY.AUTHORITATIVE_REQUIRED,
          owner: MESSAGE_GROUP_FORWARDING_OWNER_LITERAL.MESSAGE_DASH_GROUP_DASH_SERVICE,
        },
        readOptions,
      ),
      gateway.executeRead(
        {
          tableName: TABLES.SERVICES,
          sql: `SELECT * FROM ${TABLES.SERVICES} WHERE ${COLUMN.GROUP_ID} = ? ` +
            `AND ${COLUMN.SERVICE_TYPE} = ?`,
          params: [service.groupId, SERVICE_TYPE.MESSAGE_GROUP],
          strategy: CONTROL_PLANE_READ_STRATEGY.AUTHORITATIVE_REQUIRED,
          owner: MESSAGE_GROUP_FORWARDING_OWNER_LITERAL.MESSAGE_DASH_GROUP_DASH_SERVICE,
        },
        readOptions,
      ),
    ]);

    const groupRows = groupResult?.success === true &&
      Array.isArray(groupResult.rows) ?
      groupResult.rows :
      [];
    const serviceRows = serviceResult?.success === true &&
      Array.isArray(serviceResult.rows) ?
      serviceResult.rows :
      [];
    const nodeIds = [...new Set(serviceRows
      .map((row) => row?.[COLUMN.NODE_ID] || row?.node_id || null)
      .filter((nodeId) => {
        return typeof nodeId === TYPEOF.STRING && nodeId.length > NUM.ZERO;
      }))];

    let nodeRows = [];
    if (nodeIds.length > NUM.ZERO) {
      const placeholders = nodeIds.map(() => '?').join(', ');
      const nodeResult = await gateway.executeRead(
        {
          tableName: TABLES.NODES,
          sql: `SELECT * FROM ${TABLES.NODES} WHERE ${COLUMN.NODE_ID} IN (${placeholders})`,
          params: nodeIds,
          strategy: CONTROL_PLANE_READ_STRATEGY.AUTHORITATIVE_REQUIRED,
          owner: 'message-group-service',
        },
        readOptions,
      );
      if (nodeResult?.success === true && Array.isArray(nodeResult.rows)) {
        nodeRows = nodeResult.rows;
      }
    }

    let repairedRowCount = NUM.ZERO;
    repairedRowCount += await service.applyAuthoritativeForwardTopologyRows(
      TABLES.MESSAGE_GROUPS,
      groupRows,
    );
    repairedRowCount += await service.reconcileAuthoritativeForwardServiceRows(
      serviceRows,
    );
    repairedRowCount += await service.applyAuthoritativeForwardTopologyRows(
      TABLES.NODES,
      nodeRows,
    );

    if (repairedRowCount > NUM.ZERO) {
      service.logger.warn(
        MESSAGE_GROUP_FORWARDING_OWNER_LITERAL.REPAIRED_MESSAGE_DASH_GROUP_FORWARD_TOPOLOGY_FROM_AUTHORITATIVE_ROWS,
        {
          groupId: service.groupId,
          replicaId: service.replicaId,
          staleServiceId: context?.serviceId || null,
          staleAddress: context?.address || null,
          repairedRowCount,
          repairedGroupRowCount: groupRows.length,
          repairedServiceRowCount: serviceRows.length,
          repairedNodeRowCount: nodeRows.length,
        },
      );
      return this.buildForwardTopologyRepairOutcome(
        true,
        FORWARD_TOPOLOGY_REPAIR_OUTCOME.REPAIRED,
      );
    }

    return this.buildForwardTopologyRepairOutcome(
      false,
      FORWARD_TOPOLOGY_REPAIR_OUTCOME.UNCHANGED,
    );
  }

  async applyAuthoritativeForwardTopologyRows(tableName, rows = []) {
    const service = this.service;
    const gateway = service.getControlPlaneSystemTableGateway();
    const cache = service.systemTableCache;
    if (!cache || !gateway) {
      return NUM.ZERO;
    }
    const result = await gateway.reconcileAuthoritativeCacheRows(tableName, rows, {
      primaryKeyField: getSystemCachePrimaryKeyFieldOrFallback(tableName),
      deleteMissing: false,
      areRowsEqual: (left, right) =>
        service.areForwardTopologyRowsEqual(left, right),
      systemTableCache: cache,
    });
    return result?.mutationCount || NUM.ZERO;
  }

  async reconcileAuthoritativeForwardServiceRows(authoritativeRows = []) {
    const service = this.service;
    const gateway = service.getControlPlaneSystemTableGateway();
    const cache = service.systemTableCache;
    if (!cache || !gateway) {
      return NUM.ZERO;
    }
    const cachedRows = typeof cache.filter === TYPEOF.FUNCTION ?
      cache.filter(TABLES.SERVICES, (row) => {
        return row?.[COLUMN.GROUP_ID] === service.groupId &&
          row?.[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.MESSAGE_GROUP;
      }) :
      [];
    const result = await gateway.reconcileAuthoritativeCacheRows(
      TABLES.SERVICES,
      authoritativeRows,
      {
        cachedRows,
        areRowsEqual: (left, right) =>
          service.areForwardTopologyRowsEqual(left, right),
        systemTableCache: cache,
      },
    );
    return result?.mutationCount || NUM.ZERO;
  }

  areForwardTopologyRowsEqual(left, right) {
    if (!left || !right ||
      typeof left !== TYPEOF.OBJECT ||
      typeof right !== TYPEOF.OBJECT) {
      return false;
    }
    const keys = new Set([
      ...Object.keys(left),
      ...Object.keys(right),
    ]);
    for (const key of keys) {
      if (left[key] !== right[key]) {
        return false;
      }
    }
    return true;
  }

  shouldSuppressForwardTarget(deliveryResult, errorMessage) {
    if (typeof errorMessage !== TYPEOF.STRING || errorMessage.length === NUM.ZERO) {
      return false;
    }
    return this.service.shouldRepairForwardTopology(errorMessage) ||
      this.service.isForwardTargetBackpressured(deliveryResult, errorMessage) ||
      errorMessage === TRANSPORT_ERROR_MSG.MESSAGE_TIMEOUT ||
      errorMessage.includes(MESSAGE_GROUP_FORWARDING_OWNER_LITERAL.ENOTFOUND) ||
      errorMessage.includes(MESSAGE_GROUP_FORWARDING_OWNER_LITERAL.EAI_AGAIN) ||
      errorMessage.includes(MESSAGE_GROUP_FORWARDING_OWNER_LITERAL.ECONNREFUSED) ||
      errorMessage.includes(MESSAGE_GROUP_FORWARDING_OWNER_LITERAL.NO_CONNECTION_TO_NODE) ||
      (errorMessage.includes(MESSAGE_GROUP_FORWARDING_OWNER_LITERAL.CONNECTION_TO_NODE) &&
        errorMessage.includes(MESSAGE_GROUP_FORWARDING_OWNER_LITERAL.CLOSED)) ||
      errorMessage.includes(MESSAGE_GROUP_FORWARDING_OWNER_LITERAL.NO_HANDLER_REGISTERED_FOR_ADDRESS);
  }

  isForwardTargetBackpressured(deliveryResult, errorMessage) {
    const normalizedErrorMessage =
      typeof errorMessage === TYPEOF.STRING ?
        errorMessage :
        '';
    if (deliveryResult?.errorCode === MESSAGE_GROUP_FORWARDING_OWNER_LITERAL.OUTBOUND_QUEUE_BACKPRESSURED) {
      return true;
    }
    return normalizedErrorMessage.includes(MESSAGE_GROUP_FORWARDING_OWNER_LITERAL.OUTBOUND_QUEUE_FOR_NODE) &&
      normalizedErrorMessage.includes(MESSAGE_GROUP_FORWARDING_OWNER_LITERAL.IS_SATURATED);
  }

  async forwardCDCEventToLeader(tableName, operation, data, options = {}) {
    const service = this.service;
    const eventTimestamp = typeof options.timestamp === 'string' &&
      options.timestamp.length > NUM.ZERO ?
      options.timestamp :
      service.hlcClock.now().toString();
    const replayOnly = options.replayOnly === true;
    const relayDepth = Number.isInteger(options.relayDepth) &&
      options.relayDepth >= NUM.ZERO ?
      options.relayDepth :
      NUM.ZERO;
    const causeId = normalizeCauseId(options.causeId);
    const payload = {
      type: MESSAGE_GROUP_APPLICATION_MESSAGE_TYPE.LATENCY_CDC_PROPAGATION,
      tableName,
      operation,
      data,
      timestamp: eventTimestamp,
      sourceNodeId: service.nodeId,
      relayDepth,
      causeId,
      replayOnly,
    };
    return service.forwardCDCPayloadToLeader(payload, {
      tableName,
      operation,
      relayDepth,
      causeId,
      replayOnly,
    });
  }

  async forwardCDCBatchToLeader(events, options = {}) {
    const service = this.service;
    const replayOnly = options.replayOnly === true;
    const relayDepth = Number.isInteger(options.relayDepth) &&
      options.relayDepth >= NUM.ZERO ?
      options.relayDepth :
      NUM.ZERO;
    const normalizedEvents = (Array.isArray(events) ? events : [])
      .filter((event) => event?.tableName && event?.operation && event?.data)
      .map((event) => {
        const timestamp = typeof event.timestamp === 'string' &&
          event.timestamp.length > NUM.ZERO ?
          event.timestamp :
          service.hlcClock.now().toString();
        return {
          tableName: event.tableName,
          operation: event.operation,
          data: event.data,
          timestamp,
          causeId: normalizeCauseId(event.causeId),
          replayOnly: event.replayOnly === true || replayOnly,
        };
      });
    if (normalizedEvents.length === NUM.ZERO) {
      throw new Error(
        MESSAGE_GROUP_APPLICATION_ERROR_MSG.INVALID_LATENCY_CDC_BATCH_PAYLOAD,
      );
    }

    const payload = {
      type: MESSAGE_GROUP_APPLICATION_MESSAGE_TYPE.LATENCY_CDC_PROPAGATION_BATCH,
      events: normalizedEvents,
      sourceNodeId: service.nodeId,
      relayDepth,
      replayOnly:
        replayOnly || normalizedEvents.every((event) => event.replayOnly === true),
    };
    return service.forwardCDCPayloadToLeader(payload, {
      tableName: normalizedEvents[MESSAGE_GROUP_FORWARDING_OWNER_LITERAL.ZERO].tableName,
      operation: `batch:${normalizedEvents.length}`,
      relayDepth,
      causeId: normalizeCauseId(normalizedEvents[MESSAGE_GROUP_FORWARDING_OWNER_LITERAL.ZERO].causeId),
      replayOnly:
        replayOnly || normalizedEvents.every((event) => event.replayOnly === true),
    });
  }

  async forwardCDCPayloadToLeader(payload, logContext = {}) {
    const service = this.service;
    const tableName = logContext.tableName || null;
    const operation = logContext.operation || null;
    const replayOnly = logContext.replayOnly === true ||
      payload?.replayOnly === true;
    const deliveryPriority = resolveCDCForwardDeliveryPriority(
      tableName,
      payload,
      replayOnly,
    );
    const relayDepth = Number.isInteger(logContext.relayDepth) ?
      logContext.relayDepth :
      NUM.ZERO;
    const causeId = normalizeCauseId(logContext.causeId);
    let selection = service.resolveCDCForwardSelection(logContext);
    if (selection.strictForwarding === true &&
        selection.targets.length === NUM.ZERO) {
      await service.maybeRepairAuthoritativeForwardTopology({
        errorMessage: MESSAGE_GROUP_CDC_ERROR_MSG.FORWARD_LEADER_UNKNOWN,
        tableName,
        operation,
        causeId,
      });
      selection = service.resolveCDCForwardSelection(logContext);
    }
    const {
      strictForwarding,
      strictForwardRetryAfterMs,
      targets: forwardTargets,
      suppressedCount,
    } = selection;
    if (forwardTargets.length === NUM.ZERO) {
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
    let lastAddressError = null;
    let lastDeliveryError = null;

    for (const target of forwardTargets) {
      let leaderAddress = target.address;
      try {
        if (!leaderAddress) {
          leaderAddress = service.buildPeerAddress(target.serviceId);
        }
        if (!leaderAddress) {
          throw new Error(
            MESSAGE_GROUP_CDC_ERROR_MSG.FORWARD_LEADER_ADDRESS_UNRESOLVED,
          );
        }
      } catch (error) {
        lastAddressError = error;
        continue;
      }

      const forwardStartMs = service.now();
      try {
        const deliveryResult = await service.transport.deliver(
          leaderAddress,
          payload,
          {deliveryPriority},
        );
        const deliveryAcked = deliveryResult?.acknowledged === true;
        const deliverySucceeded = deliveryResult?.success !== false;
        const deliveryErrorMessage =
          typeof deliveryResult?.error === TYPEOF.STRING &&
          deliveryResult.error.length > NUM.ZERO ?
            deliveryResult.error :
            null;
        const deliveryRejectedByHandler = deliveryResult?.noHandler === true ||
          deliveryErrorMessage !== null;
        if (!deliveryAcked || !deliverySucceeded || deliveryRejectedByHandler) {
          const shouldRepairTopology =
            service.shouldRepairForwardTopology(deliveryErrorMessage);
          if (service.shouldSuppressForwardTarget(
            deliveryResult,
            deliveryErrorMessage,
          )) {
            service.suppressForwardTarget({
              serviceId: target.serviceId,
              address: leaderAddress,
            });
          }
          if (shouldRepairTopology) {
            await service.maybeRepairAuthoritativeForwardTopology({
              serviceId: target.serviceId,
              address: leaderAddress,
              errorMessage: deliveryErrorMessage,
            });
          }
          service.logger.warn(MESSAGE_GROUP_FORWARDING_OWNER_LITERAL.CDC_FORWARD_TO_LEADER_REJECTED, {
            groupId: service.groupId,
            replicaId: service.replicaId,
            leaderId: target.serviceId,
            leaderServiceId: target.serviceId,
            leaderAddress,
            tableName,
            operation,
            relayDepth,
            causeId,
            durationMs: service.now() - forwardStartMs,
            deliveryRejectedByHandler,
            acknowledged: deliveryAcked,
            success: deliverySucceeded,
            noHandler: deliveryResult?.noHandler === true,
            replayIsolationEngaged: replayOnly,
            deliveryPriority,
            strictForwarding,
            strictForwardRetryAfterMs,
            error: deliveryErrorMessage,
          });
          const deliveryError = deliveryErrorMessage !== null ?
            `: ${this.boundCdcForwardErrorDetail(deliveryErrorMessage)}` :
            '';
          const forwardErrorMessage =
            `${MESSAGE_GROUP_CDC_ERROR_MSG.FORWARD_DELIVERY_REJECTED}${deliveryError}`;
          lastDeliveryError = strictForwarding ?
            this.buildDeferredCdcForwardError(
              forwardErrorMessage,
              strictForwardRetryAfterMs,
            ) :
            new Error(forwardErrorMessage);
          continue;
        }
        service.clearForwardTargetSuppression({
          serviceId: target.serviceId,
          address: leaderAddress,
        });
        return;
      } catch (error) {
        const shouldRepairTopology =
          service.shouldRepairForwardTopology(error?.message || null);
        if (service.shouldSuppressForwardTarget(
          null,
          error?.message || null,
        )) {
          service.suppressForwardTarget({
            serviceId: target.serviceId,
            address: leaderAddress,
          });
        }
        if (shouldRepairTopology) {
          await service.maybeRepairAuthoritativeForwardTopology({
            serviceId: target.serviceId,
            address: leaderAddress,
            errorMessage: error?.message || null,
          });
        }
        lastDeliveryError = strictForwarding ?
          this.buildDeferredCdcForwardError(
            this.boundCdcForwardErrorDetail(error?.message) ||
              MESSAGE_GROUP_CDC_ERROR_MSG.FORWARD_LEADER_UNKNOWN,
            strictForwardRetryAfterMs,
          ) :
          error;
      }
    }

    if (lastDeliveryError) {
      throw lastDeliveryError;
    }
    if (lastAddressError) {
      const message =
        `${MESSAGE_GROUP_CDC_ERROR_MSG.FORWARD_LEADER_ADDRESS_UNRESOLVED}: ` +
        `${this.boundCdcForwardErrorDetail(lastAddressError.message)}`;
      throw strictForwarding ?
        this.buildDeferredCdcForwardError(message, strictForwardRetryAfterMs) :
        new Error(message);
    }

    throw strictForwarding ?
      this.buildDeferredCdcForwardError(
        MESSAGE_GROUP_CDC_ERROR_MSG.FORWARD_LEADER_UNKNOWN,
        strictForwardRetryAfterMs,
      ) :
      new Error(MESSAGE_GROUP_CDC_ERROR_MSG.FORWARD_LEADER_UNKNOWN);
  }
}

export {MessageGroupForwardingOwner};
