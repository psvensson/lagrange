import {RAFT_OPERATION_OUTCOME} from '../raft/raft-operation-port-constants.js';
import {PEER_ADDRESS_STATUS} from '../raft/raft-rs-runtime-owner-constants.js';

// This replica's own raft status, or the port's thrown failure as its
// answer: a status that could not be read is never a leader.
// The port's status read threw: the host failed, a typed outcome.
function hostFailureStatus(error) {
  return {outcome: RAFT_OPERATION_OUTCOME.HOST_FAILURE, error};
}

function readOwnRaftStatus(service) {
  try {
    return service.raft?.readStatus?.();
  } catch (error) {
    return hostFailureStatus(error);
  }
}

function createMessageGroupForwardingOwnerTargetMethods(options = {}) {
  const buildMessageGroupLeaderIdentitySnapshot =
    options.buildMessageGroupLeaderIdentitySnapshot;
  const column = options.column || {};
  const entityType = options.entityType || {};
  const messageGroupLeaderIdentitySource =
    options.messageGroupLeaderIdentitySource || {};
  const messageGroupLeaderIdentityState =
    options.messageGroupLeaderIdentityState || {};
  const num = options.num || {};
  const state = options.state || {};
  const tables = options.tables || {};
  const typeofToken = options.typeofToken || {};

  return {
    // The group's canonical leader: the live raft leader this replica's own
    // status names, on the node its committed address places it. A
    // publication memo, a message_groups row or a role hint never stands in
    // for it; no live leader is a named state.
    resolveCanonicalLeaderIdentity() {
      const service = this.service;
      const status = readOwnRaftStatus(service);
      if (status?.outcome !== RAFT_OPERATION_OUTCOME.CORE_OK ||
          status.groupId !== service.groupId ||
          status.replicaIdentity !== service.replicaId) {
        return buildMessageGroupLeaderIdentitySnapshot(
          messageGroupLeaderIdentityState.STATUS_UNAVAILABLE,
          messageGroupLeaderIdentitySource.NONE, null);
      }
      if (!status.leaderId) {
        return buildMessageGroupLeaderIdentitySnapshot(
          messageGroupLeaderIdentityState.NO_LEADER,
          messageGroupLeaderIdentitySource.RAFT_STATUS, null);
      }
      if (status.leaderAddressStatus !== PEER_ADDRESS_STATUS.RESOLVED) {
        return buildMessageGroupLeaderIdentitySnapshot(
          messageGroupLeaderIdentityState.LEADER_UNADDRESSED,
          messageGroupLeaderIdentitySource.RAFT_STATUS, null);
      }
      return buildMessageGroupLeaderIdentitySnapshot(
        messageGroupLeaderIdentityState.LIVE_LEADER,
        messageGroupLeaderIdentitySource.RAFT_STATUS,
        service.addressManager.parse(status.leaderAddress).nodeId,
        {leaderId: status.leaderId, leaderAddress: status.leaderAddress});
    },

    isLocalForwardTarget(serviceId, address = null) {
      const service = this.service;
      if (
        typeof address === typeofToken.STRING &&
        address.length > num.ZERO
      ) {
        if (address === service.unifiedAddress) {
          return true;
        }
        try {
          const parsed = service.addressManager.parse(address);
          return parsed?.serviceType === entityType.MESSAGE_GROUP &&
            parsed?.serviceId === service.replicaId &&
            parsed?.nodeId === service.nodeId;
        } catch (_error) {
          // Ignore malformed addresses and fall back to service-id-only logic.
        }
      }

      return typeof serviceId === typeofToken.STRING &&
        serviceId.length > num.ZERO &&
        serviceId === service.replicaId;
    },

    // The node a forward target lives on: its own unified address, or the
    // node the committed configuration places the configured peer on.
    resolveForwardTargetNodeId(target = null) {
      const service = this.service;
      let targetAddress;
      try {
        targetAddress = service.resolveCommittedPeerAddress(target?.serviceId || null);
        const nodeId = service.addressManager.parse(targetAddress)?.nodeId;
        return typeof nodeId === typeofToken.STRING &&
          nodeId.length > num.ZERO ? nodeId : null;
      } catch {
        // Unplaced (typed refusal) or malformed: no node to forward to.
        return null;
      }
    },

    isStrictForwardNodeReady(nodeId) {
      const service = this.service;
      if (typeof nodeId !== typeofToken.STRING || nodeId.length === num.ZERO) {
        return false;
      }

      const cache = service.systemTableCache;
      if (!cache) {
        return true;
      }

      if (typeof cache.getReadyNodes === typeofToken.FUNCTION) {
        const readyNodes = cache.getReadyNodes();
        if (Array.isArray(readyNodes)) {
          return readyNodes.includes(nodeId);
        }
      }

      const allNodeRows = typeof cache.getAll === typeofToken.FUNCTION ?
        cache.getAll(tables.NODES) || [] :
        typeof cache.filter === typeofToken.FUNCTION ?
          cache.filter(tables.NODES, () => true) || [] :
          [];
      if (!Array.isArray(allNodeRows) || allNodeRows.length === num.ZERO) {
        return true;
      }

      const nodeRow = typeof cache.get === typeofToken.FUNCTION ?
        cache.get(tables.NODES, nodeId) :
        allNodeRows.find((row) => row?.[column.NODE_ID] === nodeId) || null;
      if (!nodeRow) {
        return false;
      }

      const readyLeaseExpiresAt = Number(
        nodeRow?.[column.READY_LEASE_EXPIRES_AT],
      );
      return nodeRow?.[column.CONNECTION_STATE] === state.READY &&
        Number.isFinite(readyLeaseExpiresAt) &&
        readyLeaseExpiresAt > Date.now();
    },

    isStrictForwardNodeConnected(nodeId) {
      const service = this.service;
      if (typeof nodeId !== typeofToken.STRING || nodeId.length === num.ZERO) {
        return false;
      }
      if (nodeId === service.nodeId) {
        return true;
      }

      if (
        typeof service.transport?.getConnectionState !== typeofToken.FUNCTION
      ) {
        return true;
      }

      return service.transport.getConnectionState(nodeId) === state.CONNECTED;
    },

    getForwardTargetSuppressionKeys(target = {}) {
      const keys = [];
      if (
        typeof target.serviceId === typeofToken.STRING &&
        target.serviceId.length > num.ZERO
      ) {
        keys.push(`service:${target.serviceId}`);
      }
      if (
        typeof target.address === typeofToken.STRING &&
        target.address.length > num.ZERO
      ) {
        keys.push(`address:${target.address}`);
      }
      return keys;
    },

    pruneForwardTargetSuppressions(nowMs = this.service.now()) {
      for (const [key, expiresAt] of this.forwardTargetSuppression.entries()) {
        if (!Number.isFinite(expiresAt) || expiresAt <= nowMs) {
          this.forwardTargetSuppression.delete(key);
        }
      }
    },

    isForwardTargetSuppressed(target = {}) {
      const nowMs = this.service.now();
      this.pruneForwardTargetSuppressions(nowMs);
      return this.getForwardTargetSuppressionKeys(target).some((key) => {
        const expiresAt = this.forwardTargetSuppression.get(key);
        return Number.isFinite(expiresAt) && expiresAt > nowMs;
      });
    },

    suppressForwardTarget(target = {}) {
      const service = this.service;
      const suppressionMs =
        Number.isFinite(service.forwardTargetSuppressionMs) &&
        service.forwardTargetSuppressionMs > num.ZERO ?
          Math.floor(service.forwardTargetSuppressionMs) :
          num.ZERO;
      if (suppressionMs <= num.ZERO) {
        return;
      }
      const expiresAt = service.now() + suppressionMs;
      for (const key of this.getForwardTargetSuppressionKeys(target)) {
        this.forwardTargetSuppression.set(key, expiresAt);
      }
    },

    clearForwardTargetSuppression(target = {}) {
      for (const key of this.getForwardTargetSuppressionKeys(target)) {
        this.forwardTargetSuppression.delete(key);
      }
    },
  };
}

export {createMessageGroupForwardingOwnerTargetMethods};
