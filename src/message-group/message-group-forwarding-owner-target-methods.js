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
    resolveCanonicalLeaderIdentityFromCache() {
      const service = this.service;
      if (
        typeof service.pendingLeaderNodeUpdate === typeofToken.STRING &&
        service.pendingLeaderNodeUpdate.length > num.ZERO
      ) {
        return buildMessageGroupLeaderIdentitySnapshot(
          messageGroupLeaderIdentityState.PUBLICATION_PENDING,
          messageGroupLeaderIdentitySource.PENDING_PUBLICATION,
          service.pendingLeaderNodeUpdate,
        );
      }
      if (
        typeof service.persistedLeaderNodeId === typeofToken.STRING &&
        service.persistedLeaderNodeId.length > num.ZERO
      ) {
        return buildMessageGroupLeaderIdentitySnapshot(
          messageGroupLeaderIdentityState.PUBLICATION_PERSISTED,
          messageGroupLeaderIdentitySource.PERSISTED_PUBLICATION,
          service.persistedLeaderNodeId,
        );
      }
      if (
        service.systemTableCache &&
        typeof service.systemTableCache.get === typeofToken.FUNCTION
      ) {
        const group = service.systemTableCache.get(
          tables.MESSAGE_GROUPS,
          service.groupId,
        );
        const cachedLeaderNodeId =
          group?.[column.LEADER_NODE_ID] ||
          group?.leader_node_id ||
          group?.leaderNodeId ||
          null;
        if (
          typeof cachedLeaderNodeId === typeofToken.STRING &&
          cachedLeaderNodeId.length > num.ZERO
        ) {
          return buildMessageGroupLeaderIdentitySnapshot(
            messageGroupLeaderIdentityState.CACHE_CONFIRMED,
            messageGroupLeaderIdentitySource.CACHE_ROW,
            cachedLeaderNodeId,
          );
        }
      }
      if (
        service.isLeader === true &&
        typeof service.nodeId === typeofToken.STRING &&
        service.nodeId.length > num.ZERO
      ) {
        return buildMessageGroupLeaderIdentitySnapshot(
          messageGroupLeaderIdentityState.LIVE_LOCAL_HINT,
          messageGroupLeaderIdentitySource.LIVE_LOCAL_LEADER,
          service.nodeId,
        );
      }
      return buildMessageGroupLeaderIdentitySnapshot(
        messageGroupLeaderIdentityState.MISSING,
        messageGroupLeaderIdentitySource.NONE,
        null,
      );
    },

    resolveCanonicalLeaderNodeIdFromCache() {
      return this.resolveCanonicalLeaderIdentityFromCache().leaderNodeId;
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

    resolveForwardTargetNodeId(target = null) {
      const service = this.service;
      const targetAddress =
        typeof target?.address === typeofToken.STRING &&
        target.address.length > num.ZERO ?
          target.address :
          service.resolvePeerAddressFromCache(target?.serviceId || null);

      if (
        typeof targetAddress === typeofToken.STRING &&
        targetAddress.length > num.ZERO
      ) {
        try {
          const parsed = service.addressManager.parse(targetAddress);
          if (
            typeof parsed?.nodeId === typeofToken.STRING &&
            parsed.nodeId.length > num.ZERO
          ) {
            return parsed.nodeId;
          }
        } catch (_error) {
          // Ignore malformed or stale addresses and fall through to cache rows.
        }
      }

      const cache = service.systemTableCache;
      if (!cache || typeof cache.get !== typeofToken.FUNCTION) {
        return null;
      }
      const serviceRow = cache.get(tables.SERVICES, target?.serviceId || null);
      const nodeId = serviceRow?.[column.NODE_ID] || null;
      return typeof nodeId === typeofToken.STRING &&
        nodeId.length > num.ZERO ?
        nodeId :
        null;
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
