import {COLUMN, ENTITY_TYPE, STATE} from
  '../constants/index.js';
import {RAFT_ROLE} from '../raft/constants.js';
import {RAFT_OPERATION_OUTCOME} from '../raft/raft-operation-port-constants.js';
import {HEALTHY, PEER_ADDRESS_STATUS, USABLE} from '../raft/raft-rs-runtime-owner-constants.js';
import {CDC_COMPLETION, hasDurableCdcEvents} from '../cdc/cdc-delivery-outcome.js';
import {cdcDeliveryBudgetError} from '../cdc/cdc-delivery-budget.js';
import {CDC_FORWARD_MAX_RELAY_DEPTH} from './message-group-service-runtime-support.js';
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
  MESSAGE_GROUP_CDC_FORWARD_MODE,
  MESSAGE_GROUP_CDC_INGRESS_ACTION,
  MESSAGE_GROUP_CDC_INGRESS_STATE,
  MESSAGE_GROUP_CDC_RECOVERY_ROUTING_STATE,
  MESSAGE_GROUP_CDC_RELAY_CONVERGENCE_MIN_DEPTH,
  MESSAGE_GROUP_FORWARDING_OWNER_LITERAL,
  STRICT_CDC_FORWARD_SYSTEM_TABLES,
} from './message-group-forwarding-owner-constants.js';

const MESSAGE_GROUP_FORWARDING_OWNER_ROUTING_LITERAL = Object.freeze({
  CONSTRUCTOR: 'constructor',
});
const MESSAGE_GROUP_NATIVE_CDC_INGRESS_STATE = Object.freeze({
  CACHE_SELECTION_REQUIRED: 'cache_selection_required',
});

// Binding custody stays private to this owner. Public targets expose no port,
// native object, command authority or reusable opening grant.
const nativeForwardBindings = new WeakMap();
const NATIVE_FORWARD_BINDING_FIELDS = Object.freeze([
  'groupId', 'replicaIdentity', 'peerId', 'term', 'role', 'leaderId', 'leaderAddress',
  'configurationKey', 'membershipGenerationIndex', 'lifecycleIncarnation',
  'runtimeGeneration', 'bootstrapIndex', 'admissionIndex',
]);

function usableNativeCdcStatus(service, status) {
  return status?.outcome === RAFT_OPERATION_OUTCOME.CORE_OK &&
    status.groupId === service.groupId && status.replicaIdentity === service.replicaId &&
    status.runtimeHealth === HEALTHY && status.groupHealth === USABLE &&
    status.gateOpen === true && status.identityRecorded === true;
}

function nativeCdcObservation(service) {
  if (service.isShutdown || !service.initialized || !service.raft) return null;
  const port = service.raft;
  try {
    const status = port.readStatus();
    return usableNativeCdcStatus(service, status) ? {port, status} : null;
  } catch {
    return null;
  }
}

function observedNativeLeaderTarget(service, observation) {
  if (observation === null) return null;
  const {status} = observation;
  if (!status.leaderId || status.leaderId === service.replicaId ||
      status.leaderAddressStatus !== PEER_ADDRESS_STATUS.RESOLVED) return null;
  const peer = status.peers.find((candidate) =>
    candidate.replicaIdentity === status.leaderId);
  if (!peer || peer.learner || peer.addressStatus !== PEER_ADDRESS_STATUS.RESOLVED ||
      peer.address !== status.leaderAddress) return null;
  const target = Object.freeze({serviceId: status.leaderId, address: status.leaderAddress});
  nativeForwardBindings.set(target, observation);
  return target;
}

function durableCacheTargetConstraint(service, logContext) {
  if (!hasDurableCdcEvents(logContext.events ?? [logContext])) return null;
  const observation = nativeCdcObservation(service);
  return (replicaId) => nativeCacheTargetEligible(observation, replicaId);
}

function nativeCacheTargetEligible(observation, replicaId) {
  if (observation === null) return false;
  const {status} = observation;
  return (!status.leaderId || status.leaderId === replicaId) &&
    status.peers.some((peer) => peer.replicaIdentity === replicaId && peer.learner !== true);
}

class MessageGroupForwardingOwnerRoutingMethods {
  resolveLiveLeaderForwardTarget() {
    return observedNativeLeaderTarget(this.service, nativeCdcObservation(this.service));
  }

  isNativeCdcForwardTarget(target) {
    return nativeForwardBindings.has(target);
  }

  assertNativeForwardTarget(target) {
    const bound = nativeForwardBindings.get(target);
    const current = nativeCdcObservation(this.service);
    if (!bound || !current || bound.port !== current.port ||
        !NATIVE_FORWARD_BINDING_FIELDS.every((field) =>
          bound.status[field] === current.status[field])) throw cdcDeliveryBudgetError();
    const resolved = observedNativeLeaderTarget(this.service, current);
    if (resolved?.serviceId !== target.serviceId || resolved?.address !== target.address) {
      throw cdcDeliveryBudgetError();
    }
  }

  assertCachedCdcForwardTarget(target, address) {
    const current = nativeCdcObservation(this.service);
    if (!nativeCacheTargetEligible(current, target.serviceId) ||
        observedNativeLeaderTarget(this.service, current) !== null) {
      // Missing leader location cannot conceal a contrary leader, removed
      // voter or closed participation. A resolved leader gets a fresh decision.
      throw cdcDeliveryBudgetError();
    }
    const peer = current.status.peers.find((candidate) =>
      candidate.replicaIdentity === target.serviceId);
    if (peer.addressStatus === PEER_ADDRESS_STATUS.RESOLVED && peer.address !== address) {
      throw cdcDeliveryBudgetError();
    }
  }

  resolveNativeCdcIngressDecision(logContext) {
    const service = this.service;
    const observation = nativeCdcObservation(service);
    const common = {strictForwarding: service.shouldUseStrictCDCForwarding(logContext),
      strictForwardRetryAfterMs: service.resolveStrictCdcForwardRetryAfterMs()};
    if (logContext.targetGroupId !== undefined && logContext.targetGroupId !== service.groupId) {
      return this.nativeCdcIngressUnavailable(common);
    }
    if (observation?.status.role === RAFT_ROLE.LEADER && service.isCurrentRaftLeader()) {
      return this.buildCdcIngressDecision({...common, ready: true,
        action: MESSAGE_GROUP_CDC_INGRESS_ACTION.APPLY_LOCAL,
        state: MESSAGE_GROUP_CDC_INGRESS_STATE.LOCAL_RAFT_LEADER});
    }
    if (logContext.cdcForwardMode === MESSAGE_GROUP_CDC_FORWARD_MODE.NATIVE_COMMIT) {
      return this.nativeCdcIngressUnavailable(common);
    }
    const target = observedNativeLeaderTarget(service, observation);
    if (target === null) {
      return {state: MESSAGE_GROUP_NATIVE_CDC_INGRESS_STATE.CACHE_SELECTION_REQUIRED};
    }
    if (service.isForwardTargetSuppressed(target)) {
      return this.nativeCdcIngressUnavailable({...common, suppressedCount: 1});
    }
    if (logContext.relayDepth >= CDC_FORWARD_MAX_RELAY_DEPTH) {
      return this.nativeCdcIngressUnavailable(common);
    }
    return this.buildCdcIngressDecision({...common, ready: true,
      action: MESSAGE_GROUP_CDC_INGRESS_ACTION.FORWARD,
      state: MESSAGE_GROUP_CDC_INGRESS_STATE.FORWARD_NATIVE_LEADER, targets: [target]});
  }

  nativeCdcIngressUnavailable(common) {
    return this.buildCdcIngressDecision({...common, ready: false,
      action: MESSAGE_GROUP_CDC_INGRESS_ACTION.DEFER,
      state: MESSAGE_GROUP_CDC_INGRESS_STATE.DEFER_NATIVE_TARGET_UNAVAILABLE,
      reason: CDC_COMPLETION.UNKNOWN});
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

  // The address this replica's own consensus configuration places a peer
  // at: the runtime's resolution of a configured voter or learner.
  resolveLivePeerAddressFromConsensus(peerId) {
    const service = this.service;
    if (typeof peerId !== 'string' || peerId.length === 0 || !service.raft) {
      return null;
    }
    const status = service.raft.readStatus();
    if (status?.outcome !== RAFT_OPERATION_OUTCOME.CORE_OK ||
        status.groupId !== service.groupId || status.replicaIdentity !== service.replicaId) {
      return null;
    }
    const peers = status.peers;
    const peer = Array.isArray(peers) ?
      peers.find((candidate) => candidate?.replicaIdentity === peerId) :
      undefined;
    return typeof peer?.address === 'string' && peer.address.length > 0 ?
      peer.address :
      null;
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
        acceptsNativeTarget: durableCacheTargetConstraint(service, logContext),
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
    const acceptsNativeTarget = options.acceptsNativeTarget ?? (() => true);
    const addTarget = (serviceId, address = null) => {
      if (!acceptsNativeTarget(serviceId) || typeof serviceId !== 'string' ||
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
    if (hasDurableCdcEvents(logContext.events ?? [logContext]) &&
        this.resolveLiveLeaderForwardTarget() !== null) return false;
    if (logContext.cdcForwardMode === MESSAGE_GROUP_CDC_FORWARD_MODE.NATIVE_COMMIT) return false;

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

export {MESSAGE_GROUP_NATIVE_CDC_INGRESS_STATE, defineMessageGroupForwardingOwnerRoutingMethods};
