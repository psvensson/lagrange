/**
 * Message Group Service - peer-address resolution and authoritative cache
 * reconciliation triggering. Resolves unified peer addresses from the services
 * cache, live raft peers, and bootstrap hints, and schedules raft peer
 * reconciliation in response to cache changes.
 * Requirements: 1.1, 1.4, 9.1
 */
import {
  ADDRESS,
  COLUMN,
  ENTITY_TYPE,
  NUM,
  SERVICE_TYPE,
  TABLES,
} from '../constants/index.js';
import {
  MESSAGE_GROUP_SERVICE_LITERAL,
  isWebSocketBasedMessageRouterTransport,
} from './message-group-service-runtime-support.js';

/**
 * Attach peer-address resolution and cache-reconciliation triggering to the
 * MessageGroupService prototype.
 * @param {Function} serviceClass - The MessageGroupService class.
 * @return {void}
 */
function assignPeerResolution(serviceClass) {
  Object.assign(serviceClass.prototype, {
    isWebSocketBasedTransport(transport) {
      return isWebSocketBasedMessageRouterTransport(transport);
    },
    /**
     * Get the unified address for this service.
     * Format: ${nodeId}/message-group/${replicaId}
     * Requirements: 1.1, 5.1
     * @return {string} Unified address.
     */
    getUnifiedAddress() {
      return this.unifiedAddress;
    },
    /**
     * Build a unified address for a peer replica.
     * Looks up the address from the authoritative cache first, then live raft
     * peers, and only uses bootstrap hints when a caller explicitly opts in.
     * Uses AddressManager for consistent address formatting and validation.
     * Requirements: 1.1, 1.4, 9.1
     * @param {string} peerId - Peer replica ID.
     * @param {Object} [options]
     * @param {boolean} [options.allowBootstrapHints=false] - Permit
     * bootstrap-time peer hints when authoritative runtime location has not
     * converged yet.
     * @return {string} Unified address for the peer.
     */
    buildPeerAddress(peerId, options = {}) {
      // If peerId is already in unified format, validate and return as-is.
      // Fail fast (and log) when a provided address is not unified.
      // Requirements: 1.4
      if (peerId.includes(ADDRESS.SEPARATOR)) {
        const validation = this.addressManager.validate(peerId);
        if (validation.valid) {
          return peerId;
        }
        this.logger.error(
          MESSAGE_GROUP_SERVICE_LITERAL.PEER_ADDRESS_MUST_BE_IN_UNIFIED_FORMAT,
          {
            peerId,
            groupId: this.groupId,
            replicaId: this.replicaId,
            error: validation.error,
          },
        );
        throw new Error(`Peer address must be unified: ${peerId}`);
      }
      // Prefer cache-backed topology first so handoff/move metadata wins over
      // bootstrap-time peer hints.
      const cachedAddress = this.resolvePeerAddressFromCache(peerId);
      if (cachedAddress) {
        this.bootstrapHintFallbackLogged.delete(peerId);
        return cachedAddress;
      }
      const livePeerAddress = this.resolveLivePeerAddressFromRaftNodes(peerId);
      if (livePeerAddress) {
        return livePeerAddress;
      }
      if (options.allowBootstrapHints !== true) {
        throw new Error(`Unable to resolve unified peer address for ${peerId}`);
      }
      const hintedAddress = this.resolvePeerAddressFromHints(peerId);
      if (hintedAddress) {
        this.logBootstrapHintFallback(peerId, hintedAddress);
        return hintedAddress;
      }
      throw new Error(`Unable to resolve unified peer address for ${peerId}`);
    },
    resolvePeerAddressFromHints(peerId) {
      if (!this.peerAddresses || this.peerAddresses.length === NUM.ZERO) {
        return null;
      }
      for (const addr of this.peerAddresses) {
        const validation = this.addressManager.validate(addr);
        if (!validation.valid) {
          this.logger.error(
            MESSAGE_GROUP_SERVICE_LITERAL.PEER_ADDRESS_MUST_BE_IN_UNIFIED_FORMAT,
            {
              peerId: addr,
              groupId: this.groupId,
              replicaId: this.replicaId,
              error: validation.error,
            },
          );
          throw new Error(`Peer address must be unified: ${addr}`);
        }
        try {
          const parsed = this.addressManager.parse(addr);
          if (parsed.serviceId === peerId) {
            return addr;
          }
        } catch (_e) {
          void _e;
        }
      }
      return null;
    },
    /**
     * Resolve an authoritative join candidate without failing closed when the
     * local replica has no remote same-id peer yet.
     * @param {string} peerId
     * @return {string|null}
     * @private
     */
    resolveOptionalRaftJoinPeerAddress(peerId) {
      const cachedAddress = this.resolvePeerAddressFromCache(peerId);
      if (cachedAddress) {
        this.bootstrapHintFallbackLogged.delete(peerId);
        return cachedAddress;
      }
      const livePeerAddress = this.resolveLivePeerAddressFromRaftNodes(peerId);
      if (livePeerAddress) {
        return livePeerAddress;
      }
      const hintedAddress = this.resolvePeerAddressFromHints(peerId);
      if (hintedAddress) {
        this.logBootstrapHintFallback(peerId, hintedAddress);
        return hintedAddress;
      }
      return null;
    },
    /**
     * Resolve one canonical join decision for the shared raft runtime owner.
     * @param {string} peerId
     * @return {{address: string|null, shouldJoin: boolean}}
     * @private
     */
    resolveRaftJoinTarget(peerId) {
      const optionalPeerAddress =
        this.resolveOptionalRaftJoinPeerAddress(peerId);
      if (peerId === this.replicaId && !optionalPeerAddress) {
        return {
          address: null,
          shouldJoin: false,
        };
      }
      const peerAddress =
        optionalPeerAddress ||
        this.buildPeerAddress(peerId, {allowBootstrapHints: true});
      return {
        address: peerAddress,
        shouldJoin: this.shouldJoinRaftPeer(peerId, peerAddress),
      };
    },
    /**
     * Build one shared peer-address resolver surface for the canonical raft owner.
     * @return {{resolve: Function}}
     * @private
     */
    createRaftPeerAddressResolver() {
      return {
        resolve: (peerId) => {
          return this.buildPeerAddress(peerId, {allowBootstrapHints: true});
        },
        resolveJoinTarget: (peerId) => {
          return this.resolveRaftJoinTarget(peerId);
        },
      };
    },
    shouldJoinRaftPeer(peerId, peerAddress) {
      return !this.isLocalForwardTarget(peerId, peerAddress);
    },
    /**
     * Resolve peer address from the services cache.
     * @param {string} peerId - Peer replica ID.
     * @return {string|null} Unified address from cache, otherwise null.
     * @private
     */
    resolvePeerAddressFromCache(peerId) {
      if (!this.systemTableCache) {
        return null;
      }
      const service = this.systemTableCache.get(TABLES.SERVICES, peerId);
      if (!service) {
        return null;
      }
      if (service.address) {
        const validation = this.addressManager.validate(service.address);
        if (validation.valid) {
          return service.address;
        }
      }
      if (service.node_id) {
        return this.addressManager.format(
          service.node_id,
          ENTITY_TYPE.MESSAGE_GROUP,
          peerId,
        );
      }
      return null;
    },
    /**
     * Emit a structured warning when bootstrap peer hints are used as fallback.
     * @param {string} peerId - Peer replica ID.
     * @param {string} address - Resolved bootstrap hint address.
     * @private
     */
    logBootstrapHintFallback(peerId, address) {
      if (this.bootstrapHintFallbackLogged.has(peerId)) {
        return;
      }
      this.bootstrapHintFallbackLogged.add(peerId);
      this.logger.warn(
        MESSAGE_GROUP_SERVICE_LITERAL.USING_BOOTSTRAP_PEER_HINT_BECAUSE_SERVICES_CACHE_HAS_NO_PEER_LOCATION,
        {
          groupId: this.groupId,
          replicaId: this.replicaId,
          peerId,
          address,
          resolutionSource: MESSAGE_GROUP_SERVICE_LITERAL.BOOTSTRAP_HINT,
        },
      );
    },
    /**
     * React to authoritative services cache changes for this message group.
     * Existing replicas need this to discover newly added or moved peers.
     * @param {string} tableName
     * @param {string} _operation
     * @param {Object} record
     * @private
     */
    handleSystemTableCacheChange(tableName, _operation, record) {
      if (tableName !== TABLES.SERVICES || !record) {
        return;
      }
      if (
        (record?.[COLUMN.GROUP_ID] || record?.group_id) !== this.groupId ||
        (record?.[COLUMN.SERVICE_TYPE] || record?.service_type) !==
          SERVICE_TYPE.MESSAGE_GROUP
      ) {
        return;
      }
      this.scheduleRaftPeerReconciliation();
    },
    /**
     * Coalesce peer reconciliation work triggered by cache updates.
     * @private
     */
    scheduleRaftPeerReconciliation() {
      if (this.peerReconciliationScheduled) {
        return;
      }
      this.peerReconciliationScheduled = true;
      setImmediate(() => {
        this.peerReconciliationScheduled = false;
        this.reconcileRaftPeersFromCache();
      });
    },
  });
}

export {assignPeerResolution};
