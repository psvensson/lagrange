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
  CONTROL_PLANE_READ_STRATEGY,
} from '../control-plane/control-plane-system-table-gateway.js';
import {
  buildControlPlaneWorkloadProfile,
  CONTROL_PLANE_WORKLOAD_CLASS,
} from '../control-plane/control-plane-workload-profile.js';
import {
  MESSAGE_GROUP_APPLICATION_ERROR_MSG,
  MESSAGE_GROUP_APPLICATION_MESSAGE_TYPE,
  MESSAGE_GROUP_CDC_ERROR_MSG,
} from './constants.js';
import {createMessageGroupForwardingOwnerDeliveryMethods} from
  './message-group-forwarding-owner-delivery-methods.js';
import {defineMessageGroupForwardingOwnerRoutingMethods} from
  './message-group-forwarding-owner-routing-methods.js';
import {normalizeCauseId} from '../utils/cause-id.js';
import {TRANSPORT_ERROR_MSG} from '../constants/transport.js';
import {
  FORWARD_TOPOLOGY_REPAIR_OUTCOME,
  MESSAGE_GROUP_CDC_FORWARD_FAILURE_STATE,
  MESSAGE_GROUP_CDC_INGRESS_ACTION,
  MESSAGE_GROUP_CDC_INGRESS_INITIALIZATION,
  MESSAGE_GROUP_CDC_INGRESS_STATE,
  MESSAGE_GROUP_CDC_LOG_CONTEXT_FIELD,
  MESSAGE_GROUP_CDC_RECOVERY_ROUTING_STATE,
  MESSAGE_GROUP_FORWARDING_OWNER_LITERAL,
  MESSAGE_GROUP_FORWARDING_REASON,
  MESSAGE_GROUP_LEADER_IDENTITY_SOURCE,
  MESSAGE_GROUP_LEADER_IDENTITY_STATE,
  STRICT_CDC_FORWARD_SYSTEM_TABLES,
  buildForwardTopologyRepairReadOptions,
  buildMessageGroupLeaderIdentitySnapshot,
  resolveCDCForwardDeliveryProfile,
} from './message-group-forwarding-owner-constants.js';

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

defineMessageGroupForwardingOwnerRoutingMethods(
  MessageGroupForwardingOwner.prototype,
);

Object.assign(
  MessageGroupForwardingOwner.prototype,
  createMessageGroupForwardingOwnerDeliveryMethods({
    buildMessageGroupLeaderIdentitySnapshot,
    buildForwardTopologyRepairReadOptions,
    resolveCDCForwardDeliveryProfile,
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
