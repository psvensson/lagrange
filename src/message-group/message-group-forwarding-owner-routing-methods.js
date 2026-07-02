import {COLUMN, ENTITY_TYPE, STATE} from
  '../constants/index.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../control-plane/control-plane-readiness-constants.js';
import {INITIAL_PARTITION_IDS} from
  '../bootstrap/system-table-schemas-constants.js';
import {
  resolveMessageGroupForwardServiceCandidatesFromCache,
  resolveMessageGroupForwardServiceFromCache,
  resolveMessageGroupLeaderServiceFromCache,
} from './message-group-target-resolver.js';
import {
  MESSAGE_GROUP_CDC_LOG_CONTEXT_FIELD,
  MESSAGE_GROUP_CDC_RECOVERY_ROUTING_STATE,
  MESSAGE_GROUP_CDC_RELAY_CONVERGENCE_MIN_DEPTH,
  MESSAGE_GROUP_FORWARDING_OWNER_LITERAL,
  STRICT_CDC_FORWARD_SYSTEM_TABLES,
} from './message-group-forwarding-owner-constants.js';

const MESSAGE_GROUP_FORWARDING_OWNER_ROUTING_LITERAL = Object.freeze({
  CONSTRUCTOR: 'constructor',
});

class MessageGroupForwardingOwnerRoutingMethods {
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
    if ((typeof address !== 'string' || address.length === 0) &&
        service.shouldAllowJoinConvergenceStrictTargeting()) {
      address = service.resolvePeerAddressFromHints(leaderServiceId);
      if (typeof address === 'string' &&
          address.length > 0 &&
          typeof service.logBootstrapHintFallback === 'function') {
        service.logBootstrapHintFallback(leaderServiceId, address);
      }
    }
    if (typeof address !== 'string' || address.length === 0) {
      return null;
    }

    return {
      serviceId: leaderServiceId,
      address,
    };
  }

  normalizeLeaderReplicaId(candidate) {
    const service = this.service;
    if (typeof candidate !== 'string' || candidate.length === 0) {
      return null;
    }
    if (!candidate.includes(MESSAGE_GROUP_FORWARDING_OWNER_LITERAL.FORWARD_SLASH)) {
      return candidate;
    }
    try {
      const parsed = service.addressManager.parse(candidate);
      if (parsed?.serviceType === ENTITY_TYPE.MESSAGE_GROUP &&
          typeof parsed?.serviceId === 'string' &&
          parsed.serviceId.length > 0) {
        return parsed.serviceId;
      }
    } catch (_error) {
      // Ignore malformed addresses and preserve the original value.
    }
    return candidate;
  }

  resolveLivePeerAddressFromRaftNodes(peerId) {
    const service = this.service;
    if (typeof peerId !== 'string' ||
        peerId.length === 0 ||
        !service.raft ||
        !Array.isArray(service.raft.nodes)) {
      return null;
    }

    for (const node of service.raft.nodes) {
      const address = node?.address;
      if (typeof address !== 'string' || address.length === 0) {
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
      0;
    const isConnectedNode = (nodeId) => {
      if (typeof service.transport?.getConnectionState !== 'function') {
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
          typeof nodeId === 'string' && nodeId.length > 0),
    )];
    const forwardCandidates = Array.isArray(contract.forwardCandidates) ?
      contract.forwardCandidates :
      [];
    const localSystemTableWriteAvailable =
      contract.localSystemTableWriteAvailable === true;
    const remoteForwardCandidates = forwardCandidates.filter((candidate) => {
      return candidate?.[COLUMN.NODE_ID] !== this.service.nodeId;
    });
    const state = remoteForwardCandidates.length > 0 ?
      MESSAGE_GROUP_CDC_RECOVERY_ROUTING_STATE.REMOTE_TARGETS_AVAILABLE :
      localSystemTableWriteAvailable ?
        MESSAGE_GROUP_CDC_RECOVERY_ROUTING_STATE.LOCAL_ONLY :
        MESSAGE_GROUP_CDC_RECOVERY_ROUTING_STATE.NONE;
    return Object.freeze({
      state,
      partitionId:
        typeof contract.partitionId === 'string' &&
          contract.partitionId.length > 0 ?
          contract.partitionId :
          null,
      routingSnapshot:
        contract.routingSnapshot && typeof contract.routingSnapshot === 'object' ?
          contract.routingSnapshot :
          null,
      routableNodeIds,
      localSystemTableWriteAvailable,
      forwardCandidates: remoteForwardCandidates,
      recoveryCandidateWidening:
        remoteForwardCandidates.length > 0 ||
        localSystemTableWriteAvailable,
    });
  }

  resolveStrictCdcSystemTablePartitionId(tableName) {
    const service = this.service;
    const cdcIntegrationService = service.cdcIntegrationService || null;
    if (typeof cdcIntegrationService?.resolveSystemTablePartitionIds ===
        'function') {
      const partitionIds = cdcIntegrationService.resolveSystemTablePartitionIds(
        tableName,
      );
      const partitionId = Array.isArray(partitionIds) ?
        partitionIds[0] :
        null;
      if (typeof partitionId === 'string' && partitionId.length > 0) {
        return partitionId;
      }
    }

    const partitionId = INITIAL_PARTITION_IDS[tableName] || null;
    return typeof partitionId === 'string' && partitionId.length > 0 ?
      partitionId :
      null;
  }

  resolveStrictCdcRecoveryRoutingContract(logContext = {}) {
    const service = this.service;
    const tableName = typeof logContext?.tableName === 'string' &&
      logContext.tableName.length > 0 ?
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
        typeof queryExecutor?.getPartitionRoutingSnapshot === 'function') {
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
          typeof nodeId === 'string' && nodeId.length > 0),
    );
    const forwardCandidates = resolveMessageGroupForwardServiceCandidatesFromCache(
      service.systemTableCache,
      service.groupId,
      {
        excludeServiceId: service.replicaId,
        isConnectedNode: (nodeId) => this.isStrictForwardNodeConnected(nodeId),
      },
    ).filter((candidate) => {
      if (routableNodeIdSet.size === 0) {
        return false;
      }
      return routableNodeIdSet.has(candidate?.[COLUMN.NODE_ID] || null);
    });

    const localSystemTableWriteAvailable =
      typeof cdcIntegrationService?.canWriteSystemTableLocally ===
        'function' &&
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
      typeof options.strictRecoveryRoutingContract === 'object' ?
        options.strictRecoveryRoutingContract :
        this.buildStrictCdcRecoveryRoutingContract();
    const targets = [];
    let suppressedCount = 0;
    let recoveryCandidateWidened = false;
    const targetsByServiceId = new Map();
    const addTarget = (serviceId, address = null) => {
      if (typeof serviceId !== 'string' ||
        serviceId.length === 0 ||
        service.isLocalForwardTarget(serviceId, address)) {
        return;
      }

      const normalizedAddress = typeof address === 'string' &&
        address.length > 0 ?
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
        suppressedCount += 1;
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
      if (targets.length === 0 &&
          service.shouldAllowJoinConvergenceStrictTargeting()) {
        const bootstrapTarget =
          service.resolveJoinConvergenceBootstrapForwardTarget();
        if (service.isStrictForwardTargetEligible(bootstrapTarget)) {
          addTarget(bootstrapTarget.serviceId, bootstrapTarget.address);
        }
      }
      if (targets.length === 0 &&
          strictRecoveryRoutingContract.state ===
            MESSAGE_GROUP_CDC_RECOVERY_ROUTING_STATE.REMOTE_TARGETS_AVAILABLE) {
        for (const recoveryCandidate of
          strictRecoveryRoutingContract.forwardCandidates) {
          addTarget(
            recoveryCandidate?.[COLUMN.SERVICE_ID] || null,
            recoveryCandidate?.[COLUMN.ADDRESS] || null,
          );
        }
        recoveryCandidateWidened = targets.length > 0;
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
    return typeof tableName === 'string' &&
      STRICT_CDC_FORWARD_SYSTEM_TABLES.has(tableName);
  }

  shouldAllowRelayedStrictConvergenceIngress(logContext = {}) {
    const relayDepth = Number.isInteger(logContext?.relayDepth) &&
      logContext.relayDepth >= 0 ?
      logContext.relayDepth :
      0;
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
        selection.targets.length === 0) {
      return true;
    }

    const allowMetadataPublicationConvergenceIngress =
      typeof service.isMetadataPublicationConvergenceWindowOpen ===
        'function' &&
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
        selection.targets.length === 0) {
      return true;
    }

    return this.resolveCanonicalLeaderIdentityFromCache().leaderNodeId ===
      service.nodeId;
  }
}

function defineMessageGroupForwardingOwnerRoutingMethods(prototype) {
  const descriptors = Object.getOwnPropertyDescriptors(
    MessageGroupForwardingOwnerRoutingMethods.prototype,
  );
  delete descriptors[
    MESSAGE_GROUP_FORWARDING_OWNER_ROUTING_LITERAL.CONSTRUCTOR
  ];
  Object.defineProperties(prototype, descriptors);
}

export {defineMessageGroupForwardingOwnerRoutingMethods};
