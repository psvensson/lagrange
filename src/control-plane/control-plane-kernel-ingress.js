import {
  NUM,
  STATE,
  TYPEOF,
} from '../constants/index.js';

const CONTROL_PLANE_KERNEL_INGRESS_DEFAULT = Object.freeze({
  LEASE_MS: 30000,
  SUPPRESSION_MS: 5000,
});

function pushUniqueAddress(targets, address) {
  if (typeof address !== TYPEOF.STRING || address.length === NUM.ZERO) {
    return;
  }
  if (targets.includes(address)) {
    return;
  }
  targets.push(address);
}

function parseMessageGroupAddress(address) {
  if (typeof address !== TYPEOF.STRING || address.length === NUM.ZERO) {
    return null;
  }
  const match = address.match(/^([^/]+)\/message-group\/(.+)$/);
  if (!match) {
    return null;
  }
  return {
    nodeId: match[NUM.ONE],
    replicaId: match[NUM.TWO],
  };
}

class ControlPlaneKernelIngress {
  constructor(options = {}) {
    this.nodeId = options.nodeId || null;
    this.getBootstrapResponse =
      typeof options.getBootstrapResponse === TYPEOF.FUNCTION ?
        options.getBootstrapResponse :
        () => null;
    this.getSeedNodeId =
      typeof options.getSeedNodeId === TYPEOF.FUNCTION ?
        options.getSeedNodeId :
        () => null;
    this.getMessageRouter =
      typeof options.getMessageRouter === TYPEOF.FUNCTION ?
        options.getMessageRouter :
        () => null;
    this.getMessageGroupServices =
      typeof options.getMessageGroupServices === TYPEOF.FUNCTION ?
        options.getMessageGroupServices :
        () => new Map();
    this.now = typeof options.now === TYPEOF.FUNCTION ?
      options.now :
      () => Date.now();
    this.ingressLeaseMs =
      Number.isFinite(options.ingressLeaseMs) &&
      options.ingressLeaseMs > NUM.ZERO ?
        Math.floor(options.ingressLeaseMs) :
        CONTROL_PLANE_KERNEL_INGRESS_DEFAULT.LEASE_MS;
    this.targetSuppressionMs =
      Number.isFinite(options.targetSuppressionMs) &&
      options.targetSuppressionMs > NUM.ZERO ?
        Math.floor(options.targetSuppressionMs) :
        CONTROL_PLANE_KERNEL_INGRESS_DEFAULT.SUPPRESSION_MS;
    this.confirmedIngressLease = null;
    this.ingressEpoch = NUM.ZERO;
    this.suppressedTargetAddresses = new Map();
  }

  resolveTargetAddress(options = {}) {
    return this.resolveTargetCandidates(options)[NUM.ZERO] || null;
  }

  resolveTargetCandidates(options = {}) {
    this.pruneExpiredState();
    const targets = [];
    const fallbackTargets = [];
    const allowBootstrapHints = options.allowBootstrapHints !== false;
    const allowSelfTarget = options.allowSelfTarget === true;
    const requiredTables = Array.isArray(options.requiredTables) ?
      options.requiredTables :
      [];
    const localTargetMode =
      options.localTargetMode === 'any_replica' ?
        'any_replica' :
        'leader_only';
    const assignment = this.getBootstrapResponse()?.messageGroupAssignment ||
      null;
    const pushOrderedTarget = (address) => {
      if (typeof address !== TYPEOF.STRING || address.length === NUM.ZERO) {
        return;
      }
      if (this.isTargetReachable(address)) {
        pushUniqueAddress(targets, address);
        return;
      }
      pushUniqueAddress(fallbackTargets, address);
    };

    const confirmedIngressLease = this.getConfirmedIngressLease();
    if (confirmedIngressLease) {
      pushOrderedTarget(confirmedIngressLease.targetAddress);
    }
    if (allowSelfTarget) {
      pushOrderedTarget(
        this.resolveLocalTargetAddress(assignment, {
          localTargetMode,
          requiredTables,
        }),
      );
    }
    if (allowBootstrapHints) {
      for (const address of this.resolveBootstrapTargetAddresses(assignment)) {
        pushOrderedTarget(address);
      }
    }

    return [...targets, ...fallbackTargets];
  }

  getConfirmedIngressLease() {
    this.pruneExpiredState();
    return this.confirmedIngressLease;
  }

  noteSuccessfulTarget(targetAddress) {
    if (typeof targetAddress !== TYPEOF.STRING ||
        targetAddress.length === NUM.ZERO) {
      return null;
    }

    const existingLease = this.getConfirmedIngressLease();
    const epoch = existingLease?.targetAddress === targetAddress ?
      existingLease.epoch :
      this.ingressEpoch + NUM.ONE;
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
    if (typeof targetAddress !== TYPEOF.STRING ||
        targetAddress.length === NUM.ZERO) {
      return;
    }

    if (this.confirmedIngressLease?.targetAddress === targetAddress) {
      this.confirmedIngressLease = null;
    }
    if (this.targetSuppressionMs > NUM.ZERO) {
      this.suppressedTargetAddresses.set(
        targetAddress,
        this.now() + this.targetSuppressionMs,
      );
    }
  }

  resolveLocalTargetAddress(assignment = null, options = {}) {
    const services = this.getMessageGroupServices();
    if (!(services instanceof Map) || services.size === NUM.ZERO) {
      return null;
    }
    const requiredTables = Array.isArray(options.requiredTables) ?
      options.requiredTables :
      [];
    const localTargetMode =
      options.localTargetMode === 'any_replica' ?
        'any_replica' :
        'leader_only';

    const groupId = assignment?.groupId || null;
    let replicaFallback = null;
    for (const service of services.values()) {
      if (!service?.unifiedAddress) {
        continue;
      }
      if (groupId && service.groupId && service.groupId !== groupId) {
        continue;
      }

      const isLeader = typeof service.isLeaderReplica === TYPEOF.FUNCTION &&
        service.isLeaderReplica() === true;
      const ingressReady =
        typeof service.isMetadataIngressReady === TYPEOF.FUNCTION &&
        service.isMetadataIngressReady({requiredTables});
      if (isLeader) {
        if (!ingressReady) {
          continue;
        }
        return this.isTargetSuppressed(service.unifiedAddress) ?
          null :
          service.unifiedAddress;
      }
      if (localTargetMode === 'any_replica' &&
          ingressReady &&
          replicaFallback === null &&
          !this.isTargetSuppressed(service.unifiedAddress)) {
        replicaFallback = service.unifiedAddress;
      }
    }
    return replicaFallback;
  }

  resolveBootstrapTargetAddresses(assignment = null) {
    if (!assignment || typeof assignment !== TYPEOF.OBJECT) {
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
    const seedFallbackTargets = [];
    const remoteFallbackTargets = [];

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
      const reachable = this.isConnectedNode(parsed.nodeId);
      if (seedNodeId && parsed.nodeId === seedNodeId) {
        pushUniqueAddress(
          reachable ? seedTargets : seedFallbackTargets,
          address,
        );
        continue;
      }
      pushUniqueAddress(
        reachable ? remoteTargets : remoteFallbackTargets,
        address,
      );
    }

    return [
      ...seedTargets,
      ...remoteTargets,
      ...seedFallbackTargets,
      ...remoteFallbackTargets,
    ];
  }

  isConnectedNode(nodeId) {
    if (!nodeId || nodeId === this.nodeId) {
      return true;
    }

    const messageRouter = this.getMessageRouter();
    if (!messageRouter ||
        typeof messageRouter.getConnectionState !== TYPEOF.FUNCTION) {
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
    if (typeof targetAddress !== TYPEOF.STRING ||
        targetAddress.length === NUM.ZERO) {
      return false;
    }
    this.pruneExpiredState();
    const suppressedUntil = this.suppressedTargetAddresses.get(targetAddress);
    return Number.isFinite(suppressedUntil) && suppressedUntil > this.now();
  }

  isTargetReachable(targetAddress) {
    const parsed = parseMessageGroupAddress(targetAddress);
    if (!parsed) {
      return false;
    }
    return !this.isTargetSuppressed(targetAddress) &&
      this.isConnectedNode(parsed.nodeId);
  }
}

export {
  ControlPlaneKernelIngress,
  parseMessageGroupAddress,
};
