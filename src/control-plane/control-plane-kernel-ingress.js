import {
  STATE,
} from '../constants/index.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from './control-plane-readiness-constants.js';
import {
  QUERY_ROUTING_DIAGNOSTIC_REASON,
} from '../query/query-constants.js';
import {
  CANONICAL_LEADER_ROUTING_GAP_STATE,
  resolveCanonicalLeaderRoutingGapState,
} from '../query/canonical-leader-routing.js';

const CONTROL_PLANE_KERNEL_INGRESS_DEFAULT = Object.freeze({
  LEASE_MS: 30000,
  SUPPRESSION_MS: 5000,
});

const CONTROL_PLANE_KERNEL_INGRESS_LOCAL_TARGET_MODE = Object.freeze({
  ANY_REPLICA: 'any_replica',
  LEADER_ONLY: 'leader_only',
});

const CONTROL_PLANE_KERNEL_INGRESS_ROUTING_DIMENSION = Object.freeze({
  DEFAULT: CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
  NODE_STATE_UPDATE:
    CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
});

const CONTROL_PLANE_KERNEL_INGRESS_LOCAL_ROUTING_STATE = Object.freeze({
  NO_REQUIRED_TABLES: 'no_required_tables',
  OWNER_UNAVAILABLE: 'owner_unavailable',
  ROUTABLE: 'routable',
  RECOVERY_ROUTABLE: 'recovery_routable',
  PARTITION_MISSING: 'partition_missing',
  NO_SERVICE_ROWS: QUERY_ROUTING_DIAGNOSTIC_REASON.NO_SERVICE_ROWS,
  CANONICAL_LEADER_OWNER_MISSING: 'canonical_leader_owner_missing',
  CANONICAL_LEADER_SERVICE_GAP: 'canonical_leader_service_gap',
  NOT_ROUTABLE: 'not_routable',
});

const CONTROL_PLANE_KERNEL_INGRESS_LOCAL_TARGET_STATE = Object.freeze({
  ELIGIBLE: 'eligible',
  ELIGIBLE_WITHOUT_ROUTING_OWNER: 'eligible_without_routing_owner',
  INGRESS_NOT_READY: 'ingress_not_ready',
  ROUTING_NOT_READY: 'routing_not_ready',
});

function normalizeRequiredTables(requiredTables) {
  return [...new Set(
    (Array.isArray(requiredTables) ? requiredTables : [])
      .filter((tableName) => {
        return typeof tableName === 'string' &&
          tableName.length > 0;
      }),
  )];
}

function normalizeLocalTargetMode(localTargetMode) {
  return localTargetMode ===
    CONTROL_PLANE_KERNEL_INGRESS_LOCAL_TARGET_MODE.ANY_REPLICA ?
    CONTROL_PLANE_KERNEL_INGRESS_LOCAL_TARGET_MODE.ANY_REPLICA :
    CONTROL_PLANE_KERNEL_INGRESS_LOCAL_TARGET_MODE.LEADER_ONLY;
}

function normalizeRoutingReadinessDimension(routingReadinessDimension) {
  return routingReadinessDimension ===
    CONTROL_PLANE_KERNEL_INGRESS_ROUTING_DIMENSION.NODE_STATE_UPDATE ?
    CONTROL_PLANE_KERNEL_INGRESS_ROUTING_DIMENSION.NODE_STATE_UPDATE :
    CONTROL_PLANE_KERNEL_INGRESS_ROUTING_DIMENSION.DEFAULT;
}

function buildLocalRoutingDecision(
  state,
  ready,
  ownerAvailable,
  tableDecisions = [],
) {
  return Object.freeze({
    state,
    ready,
    ownerAvailable,
    tableDecisions: Object.freeze([...tableDecisions]),
  });
}

function buildLocalTableRoutingDecision(
  tableName,
  partitionId,
  state,
  ready,
  routingSnapshot = null,
) {
  return Object.freeze({
    tableName,
    partitionId,
    state,
    ready,
    routingSnapshot,
  });
}

function buildLocalTargetDecision(state, eligible, routingDecision) {
  return Object.freeze({
    state,
    eligible,
    routingDecision,
  });
}

function pushUniqueAddress(targets, address) {
  if (typeof address !== 'string' || address.length === 0) {
    return;
  }
  if (targets.includes(address)) {
    return;
  }
  targets.push(address);
}

function parseMessageGroupAddress(address) {
  if (typeof address !== 'string' || address.length === 0) {
    return null;
  }
  const match = address.match(/^([^/]+)\/message-group\/(.+)$/);
  if (!match) {
    return null;
  }
  return {
    nodeId: match[1],
    replicaId: match[2],
  };
}

class ControlPlaneKernelIngress {
  constructor(options = {}) {
    this.nodeId = options.nodeId || null;
    this.getBootstrapResponse =
      typeof options.getBootstrapResponse === 'function' ?
        options.getBootstrapResponse :
        () => null;
    this.getSeedNodeId =
      typeof options.getSeedNodeId === 'function' ?
        options.getSeedNodeId :
        () => null;
    this.getMessageRouter =
      typeof options.getMessageRouter === 'function' ?
        options.getMessageRouter :
        () => null;
    this.getMessageGroupServices =
      typeof options.getMessageGroupServices === 'function' ?
        options.getMessageGroupServices :
        () => new Map();
    this.getSqlQueryEngine =
      typeof options.getSqlQueryEngine === 'function' ?
        options.getSqlQueryEngine :
        () => null;
    this.now = typeof options.now === 'function' ?
      options.now :
      () => Date.now();
    this.ingressLeaseMs =
      Number.isFinite(options.ingressLeaseMs) &&
      options.ingressLeaseMs > 0 ?
        Math.floor(options.ingressLeaseMs) :
        CONTROL_PLANE_KERNEL_INGRESS_DEFAULT.LEASE_MS;
    this.targetSuppressionMs =
      Number.isFinite(options.targetSuppressionMs) &&
      options.targetSuppressionMs > 0 ?
        Math.floor(options.targetSuppressionMs) :
        CONTROL_PLANE_KERNEL_INGRESS_DEFAULT.SUPPRESSION_MS;
    this.confirmedIngressLease = null;
    this.ingressEpoch = 0;
    this.suppressedTargetAddresses = new Map();
  }

  resolveTargetAddress(options = {}) {
    return this.resolveTargetCandidates(options)[0] || null;
  }

  resolveNodeStateUpdateTargetCandidates(options = {}) {
    const sharedOptions = {
      allowBootstrapHints: options.allowBootstrapHints !== false,
      localTargetMode: normalizeLocalTargetMode(options.localTargetMode),
      requiredTables: normalizeRequiredTables(options.requiredTables),
      routingReadinessDimension:
        CONTROL_PLANE_KERNEL_INGRESS_ROUTING_DIMENSION.NODE_STATE_UPDATE,
    };
    const isHeartbeatPublication = Number.isFinite(options.heartbeatAt);
    if (!isHeartbeatPublication) {
      return this.resolveTargetCandidates({
        ...sharedOptions,
        allowSelfTarget: true,
      });
    }

    const remoteCandidates = this.resolveTargetCandidates({
      ...sharedOptions,
      allowSelfTarget: false,
    });
    const optimisticRemoteCandidates =
      remoteCandidates.length > 0 ?
        [] :
        this.resolveTargetCandidates({
          ...sharedOptions,
          allowSelfTarget: false,
          allowDisconnectedTargets: true,
        });
    const allCandidates = this.resolveTargetCandidates({
      ...sharedOptions,
      allowSelfTarget: true,
    });
    const mergedCandidates = [...remoteCandidates];
    for (const address of optimisticRemoteCandidates) {
      pushUniqueAddress(mergedCandidates, address);
    }
    for (const address of allCandidates) {
      pushUniqueAddress(mergedCandidates, address);
    }
    return mergedCandidates;
  }

  resolveTargetCandidates(options = {}) {
    this.pruneExpiredState();
    const targets = [];
    const allowBootstrapHints = options.allowBootstrapHints !== false;
    const allowSelfTarget = options.allowSelfTarget === true;
    const allowDisconnectedTargets =
      options.allowDisconnectedTargets === true;
    const requiredTables = Array.isArray(options.requiredTables) ?
      normalizeRequiredTables(options.requiredTables) :
      [];
    const localTargetMode = normalizeLocalTargetMode(options.localTargetMode);
    const routingReadinessDimension = normalizeRoutingReadinessDimension(
      options.routingReadinessDimension,
    );
    const assignment = this.getBootstrapResponse()?.messageGroupAssignment ||
      null;
    const localTargetAddress = allowSelfTarget ?
      this.resolveLocalTargetAddress(assignment, {
        localTargetMode,
        requiredTables,
        routingReadinessDimension,
      }) :
      null;
    const pushOrderedTarget = (address) => {
      if (typeof address !== 'string' || address.length === 0) {
        return;
      }
      if (!this.isTargetReachable(address, {allowDisconnectedTargets})) {
        return;
      }
      pushUniqueAddress(targets, address);
    };

    if (localTargetAddress) {
      pushOrderedTarget(localTargetAddress);
    }
    const confirmedIngressLease = this.getConfirmedIngressLease();
    if (confirmedIngressLease) {
      const confirmedTargetParts = parseMessageGroupAddress(
        confirmedIngressLease.targetAddress,
      );
      const confirmedLocalTarget =
        confirmedTargetParts?.nodeId === this.nodeId;
      if (!confirmedLocalTarget ||
          confirmedIngressLease.targetAddress === localTargetAddress) {
        pushOrderedTarget(confirmedIngressLease.targetAddress);
      }
    }
    if (allowBootstrapHints) {
      for (const address of this.resolveBootstrapTargetAddresses(assignment, {
        allowDisconnectedTargets,
      })) {
        pushOrderedTarget(address);
      }
    }

    return targets;
  }

  getConfirmedIngressLease() {
    this.pruneExpiredState();
    return this.confirmedIngressLease;
  }

  noteSuccessfulTarget(targetAddress) {
    if (typeof targetAddress !== 'string' ||
        targetAddress.length === 0) {
      return null;
    }

    const existingLease = this.getConfirmedIngressLease();
    const epoch = existingLease?.targetAddress === targetAddress ?
      existingLease.epoch :
      this.ingressEpoch + 1;
    this.ingressEpoch = epoch;
    this.confirmedIngressLease = Object.freeze({
      targetAddress,
      epoch,
      expiresAt: this.now() + this.ingressLeaseMs,
    });
    this.suppressedTargetAddresses.delete(targetAddress);
    return this.confirmedIngressLease;
  }

  invalidateTarget(targetAddress) {
    if (typeof targetAddress !== 'string' ||
        targetAddress.length === 0) {
      return;
    }

    if (this.confirmedIngressLease?.targetAddress === targetAddress) {
      this.confirmedIngressLease = null;
    }
    if (this.targetSuppressionMs > 0) {
      this.suppressedTargetAddresses.set(
        targetAddress,
        this.now() + this.targetSuppressionMs,
      );
    }
  }

  resolveLocalTargetAddress(assignment = null, options = {}) {
    const services = this.getMessageGroupServices();
    if (!(services instanceof Map) || services.size === 0) {
      return null;
    }
    const requiredTables = normalizeRequiredTables(options.requiredTables);
    const localTargetMode = normalizeLocalTargetMode(options.localTargetMode);
    const routingReadinessDimension = normalizeRoutingReadinessDimension(
      options.routingReadinessDimension,
    );
    const localRoutingDecision =
      this.resolveLocalRequiredTableRoutingDecision(requiredTables, {
        routingReadinessDimension,
      });

    const groupId = assignment?.groupId || null;
    let replicaFallback = null;
    for (const service of services.values()) {
      if (!service?.unifiedAddress) {
        continue;
      }
      if (groupId && service.groupId && service.groupId !== groupId) {
        continue;
      }

      const isLeader = typeof service.isLeaderReplica === 'function' &&
        service.isLeaderReplica() === true;
      const localTargetDecision = this.resolveLocalTargetEligibilityDecision(
        service,
        {
          requiredTables,
          localRoutingDecision,
        },
      );
      if (isLeader) {
        if (localTargetDecision.eligible !== true) {
          continue;
        }
        return this.isTargetSuppressed(service.unifiedAddress) ?
          null :
          service.unifiedAddress;
      }
      if (localTargetMode ===
            CONTROL_PLANE_KERNEL_INGRESS_LOCAL_TARGET_MODE.ANY_REPLICA &&
          localTargetDecision.eligible === true &&
          replicaFallback === null &&
          !this.isTargetSuppressed(service.unifiedAddress)) {
        replicaFallback = service.unifiedAddress;
      }
    }
    return replicaFallback;
  }

  resolveLocalTargetEligibilityDecision(service, options = {}) {
    const requiredTables = normalizeRequiredTables(options.requiredTables);
    const localRoutingDecision =
      options.localRoutingDecision ||
      this.resolveLocalRequiredTableRoutingDecision(requiredTables);
    const ingressReady =
      typeof service?.isMetadataIngressReady === 'function' &&
      service.isMetadataIngressReady({requiredTables}) === true;

    if (!ingressReady) {
      return buildLocalTargetDecision(
        CONTROL_PLANE_KERNEL_INGRESS_LOCAL_TARGET_STATE.INGRESS_NOT_READY,
        false,
        localRoutingDecision,
      );
    }

    if (localRoutingDecision.ownerAvailable !== true) {
      return buildLocalTargetDecision(
        CONTROL_PLANE_KERNEL_INGRESS_LOCAL_TARGET_STATE
          .ELIGIBLE_WITHOUT_ROUTING_OWNER,
        true,
        localRoutingDecision,
      );
    }

    if (localRoutingDecision.ready !== true) {
      return buildLocalTargetDecision(
        CONTROL_PLANE_KERNEL_INGRESS_LOCAL_TARGET_STATE.ROUTING_NOT_READY,
        false,
        localRoutingDecision,
      );
    }

    return buildLocalTargetDecision(
      CONTROL_PLANE_KERNEL_INGRESS_LOCAL_TARGET_STATE.ELIGIBLE,
      true,
      localRoutingDecision,
    );
  }

  resolveLocalRequiredTableRoutingDecision(requiredTables = [], options = {}) {
    const normalizedRequiredTables = normalizeRequiredTables(requiredTables);
    const routingReadinessDimension = normalizeRoutingReadinessDimension(
      options.routingReadinessDimension,
    );
    if (normalizedRequiredTables.length === 0) {
      return buildLocalRoutingDecision(
        CONTROL_PLANE_KERNEL_INGRESS_LOCAL_ROUTING_STATE.NO_REQUIRED_TABLES,
        true,
        false,
      );
    }

    const sqlQueryEngine = this.getSqlQueryEngine();
    const queryExecutor = sqlQueryEngine?.queryExecutor || null;
    if (typeof sqlQueryEngine?.getTablePartitions !== 'function' ||
        typeof queryExecutor?.getPartitionRoutingSnapshot !== 'function') {
      return buildLocalRoutingDecision(
        CONTROL_PLANE_KERNEL_INGRESS_LOCAL_ROUTING_STATE.OWNER_UNAVAILABLE,
        true,
        false,
      );
    }

    const tableDecisions = normalizedRequiredTables.map((tableName) => {
      return this.resolveLocalTableRoutingDecision(
        sqlQueryEngine,
        tableName,
        routingReadinessDimension,
      );
    });
    const blockingDecision = tableDecisions.find((decision) => {
      return decision.ready !== true;
    }) || null;

    if (!blockingDecision) {
      const recoveryRoutableDecision = tableDecisions.find((decision) => {
        return decision.state ===
          CONTROL_PLANE_KERNEL_INGRESS_LOCAL_ROUTING_STATE
            .RECOVERY_ROUTABLE;
      }) || null;
      return buildLocalRoutingDecision(
        recoveryRoutableDecision ?
          CONTROL_PLANE_KERNEL_INGRESS_LOCAL_ROUTING_STATE
            .RECOVERY_ROUTABLE :
          CONTROL_PLANE_KERNEL_INGRESS_LOCAL_ROUTING_STATE.ROUTABLE,
        true,
        true,
        tableDecisions,
      );
    }

    return buildLocalRoutingDecision(
      blockingDecision.state,
      false,
      true,
      tableDecisions,
    );
  }

  resolveLocalTableRoutingDecision(
    sqlQueryEngine,
    tableName,
    routingReadinessDimension,
  ) {
    const partitions =
      typeof sqlQueryEngine?.getTablePartitions === 'function' ?
        sqlQueryEngine.getTablePartitions(tableName) :
        [];
    if (!Array.isArray(partitions) || partitions.length === 0) {
      return buildLocalTableRoutingDecision(
        tableName,
        null,
        CONTROL_PLANE_KERNEL_INGRESS_LOCAL_ROUTING_STATE.PARTITION_MISSING,
        false,
      );
    }

    for (const partition of partitions) {
      const partitionId =
        partition?.partition_id ||
        partition?.partitionId ||
        null;
      if (typeof partitionId !== 'string' ||
          partitionId.length === 0) {
        return buildLocalTableRoutingDecision(
          tableName,
          null,
          CONTROL_PLANE_KERNEL_INGRESS_LOCAL_ROUTING_STATE.PARTITION_MISSING,
          false,
        );
      }
      const queryExecutor = sqlQueryEngine?.queryExecutor || null;
      const normalizedRoutingReadinessDimension =
        normalizeRoutingReadinessDimension(routingReadinessDimension);
      const routingSnapshot =
        queryExecutor.getPartitionRoutingSnapshot(
          partitionId,
          normalizedRoutingReadinessDimension,
        );
      const canonicalLeaderRoutingGapState =
        resolveCanonicalLeaderRoutingGapState(routingSnapshot);
      const canonicalLeaderGapRecoveryRoutingContract =
        typeof queryExecutor?.resolveCanonicalLeaderGapRecoveryRoutingContract ===
          'function' ?
          queryExecutor.resolveCanonicalLeaderGapRecoveryRoutingContract(
            partitionId,
            routingSnapshot,
            normalizedRoutingReadinessDimension,
            false,
          ) :
          null;
      const serviceRowCount = Number(routingSnapshot?.serviceRowCount);
      const routableServiceCount = Number(routingSnapshot?.routableServiceCount);
      if (routingSnapshot?.reasonCode ===
            QUERY_ROUTING_DIAGNOSTIC_REASON.NO_SERVICE_ROWS ||
          !(serviceRowCount > 0)) {
        return buildLocalTableRoutingDecision(
          tableName,
          partitionId,
          CONTROL_PLANE_KERNEL_INGRESS_LOCAL_ROUTING_STATE.NO_SERVICE_ROWS,
          false,
          routingSnapshot,
        );
      }
      if (canonicalLeaderRoutingGapState ===
            CANONICAL_LEADER_ROUTING_GAP_STATE.OWNER_MISSING) {
        if (canonicalLeaderGapRecoveryRoutingContract
          ?.recoveryCandidateWidening === true &&
            routableServiceCount > 0) {
          return buildLocalTableRoutingDecision(
            tableName,
            partitionId,
            CONTROL_PLANE_KERNEL_INGRESS_LOCAL_ROUTING_STATE
              .RECOVERY_ROUTABLE,
            true,
            routingSnapshot,
          );
        }
        return buildLocalTableRoutingDecision(
          tableName,
          partitionId,
          CONTROL_PLANE_KERNEL_INGRESS_LOCAL_ROUTING_STATE
            .CANONICAL_LEADER_OWNER_MISSING,
          false,
          routingSnapshot,
        );
      }
      if (canonicalLeaderRoutingGapState ===
            CANONICAL_LEADER_ROUTING_GAP_STATE.SERVICE_MISSING) {
        if (canonicalLeaderGapRecoveryRoutingContract
          ?.recoveryCandidateWidening === true &&
            routableServiceCount > 0) {
          return buildLocalTableRoutingDecision(
            tableName,
            partitionId,
            CONTROL_PLANE_KERNEL_INGRESS_LOCAL_ROUTING_STATE
              .RECOVERY_ROUTABLE,
            true,
            routingSnapshot,
          );
        }
        return buildLocalTableRoutingDecision(
          tableName,
          partitionId,
          CONTROL_PLANE_KERNEL_INGRESS_LOCAL_ROUTING_STATE
            .CANONICAL_LEADER_SERVICE_GAP,
          false,
          routingSnapshot,
        );
      }
      if (!(routableServiceCount > 0)) {
        return buildLocalTableRoutingDecision(
          tableName,
          partitionId,
          CONTROL_PLANE_KERNEL_INGRESS_LOCAL_ROUTING_STATE.NOT_ROUTABLE,
          false,
          routingSnapshot,
        );
      }
    }

    const firstPartition = partitions[0];
    return buildLocalTableRoutingDecision(
      tableName,
      firstPartition?.partition_id || firstPartition?.partitionId || null,
      CONTROL_PLANE_KERNEL_INGRESS_LOCAL_ROUTING_STATE.ROUTABLE,
      true,
      null,
    );
  }

  resolveBootstrapTargetAddresses(assignment = null, options = {}) {
    if (!assignment || typeof assignment !== 'object') {
      return [];
    }

    const seedNodeId = this.getBootstrapResponse()?.seedNodeId ||
      this.getSeedNodeId();
    const replicaToMove = assignment.replicaToMove || null;
    const hintCandidates = [
      ...(Array.isArray(assignment.peerAddresses) ?
        assignment.peerAddresses :
        []),
      ...(Array.isArray(assignment.replicaAddresses) ?
        assignment.replicaAddresses :
        []),
    ];
    const seedTargets = [];
    const remoteTargets = [];
    const allowDisconnectedTargets =
      options.allowDisconnectedTargets === true;

    for (const address of hintCandidates) {
      const parsed = parseMessageGroupAddress(address);
      if (!parsed) {
        continue;
      }
      if (parsed.nodeId === this.nodeId) {
        continue;
      }
      if (this.isTargetSuppressed(address)) {
        continue;
      }
      if (replicaToMove && parsed.replicaId === replicaToMove) {
        continue;
      }
      const reachable = allowDisconnectedTargets === true ||
        this.isConnectedNode(parsed.nodeId);
      if (seedNodeId && parsed.nodeId === seedNodeId) {
        if (reachable) {
          pushUniqueAddress(seedTargets, address);
        }
        continue;
      }
      if (reachable) {
        pushUniqueAddress(remoteTargets, address);
      }
    }

    return [
      ...seedTargets,
      ...remoteTargets,
    ];
  }

  isConnectedNode(nodeId) {
    if (!nodeId || nodeId === this.nodeId) {
      return true;
    }

    const messageRouter = this.getMessageRouter();
    if (!messageRouter ||
        typeof messageRouter.getConnectionState !== 'function') {
      return true;
    }

    return messageRouter.getConnectionState(nodeId) === STATE.CONNECTED;
  }

  pruneExpiredState(nowMs = this.now()) {
    for (const [targetAddress, expiresAt] of this.suppressedTargetAddresses) {
      if (!Number.isFinite(expiresAt) || expiresAt <= nowMs) {
        this.suppressedTargetAddresses.delete(targetAddress);
      }
    }
    if (this.confirmedIngressLease &&
        (!Number.isFinite(this.confirmedIngressLease.expiresAt) ||
          this.confirmedIngressLease.expiresAt <= nowMs)) {
      this.confirmedIngressLease = null;
    }
  }

  isTargetSuppressed(targetAddress) {
    if (typeof targetAddress !== 'string' ||
        targetAddress.length === 0) {
      return false;
    }
    this.pruneExpiredState();
    const suppressedUntil = this.suppressedTargetAddresses.get(targetAddress);
    return Number.isFinite(suppressedUntil) && suppressedUntil > this.now();
  }

  isTargetReachable(targetAddress, options = {}) {
    const parsed = parseMessageGroupAddress(targetAddress);
    if (!parsed) {
      return false;
    }
    if (this.isTargetSuppressed(targetAddress)) {
      return false;
    }
    if (options.allowDisconnectedTargets === true) {
      return true;
    }
    return this.isConnectedNode(parsed.nodeId);
  }
}

export {
  ControlPlaneKernelIngress,
  CONTROL_PLANE_KERNEL_INGRESS_LOCAL_TARGET_MODE,
  parseMessageGroupAddress,
};
