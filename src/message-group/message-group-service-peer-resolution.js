/**
 * Message Group Service - peer-address resolution and cache reconciliation
 * triggering. A peer's address is the one its committed configuration places
 * it at (read through the replica's raft status); a services cache change
 * only triggers raft peer reconciliation (discovery, A8).
 * Requirements: 1.1, 1.4, 9.1
 */
import {
  COLUMN,
  SERVICE_TYPE,
  TABLES,
} from '../constants/index.js';
import {RAFT_OPERATION_OUTCOME} from '../raft/raft-operation-port-constants.js';
import {RAFT_RS_PEER_ADDRESS_REFUSAL} from
  '../raft/raft-rs-peer-identity-constants.js';
import {PEER_ADDRESS_STATUS} from '../raft/raft-rs-runtime-owner-constants.js';
import {
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
     * The address of a peer replica outside the transport: this replica's
     * own address, or the address the group's committed configuration
     * places the peer at, as this replica's raft status reports it (the
     * port resolves every configured peer from its committed node). No
     * services row or hint list is read.
     * @param {string} peerId - Peer replica identity.
     * @return {string} Its unified address.
     * @throws {Error} CONFIGURATION_UNAVAILABLE without a usable status;
     *   PEER_NOT_IN_CONFIGURATION for a peer without a committed address.
     */
    resolveCommittedPeerAddress(peerId) {
      if (peerId === this.replicaId) {
        return this.unifiedAddress;
      }
      const status = this.raft?.readStatus?.();
      if (status?.outcome !== RAFT_OPERATION_OUTCOME.CORE_OK ||
          status.groupId !== this.groupId ||
          status.replicaIdentity !== this.replicaId) {
        throw Object.assign(new Error(
          RAFT_RS_PEER_ADDRESS_REFUSAL.CONFIGURATION_UNAVAILABLE),
        {replicaIdentity: peerId});
      }
      const peer = status.peers.find((candidate) =>
        candidate.replicaIdentity === peerId);
      if (peer?.addressStatus !== PEER_ADDRESS_STATUS.RESOLVED) {
        throw Object.assign(new Error(
          RAFT_RS_PEER_ADDRESS_REFUSAL.PEER_NOT_IN_CONFIGURATION),
        {replicaIdentity: peerId});
      }
      return peer.address;
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
      // The coalescing hop is this replica's next turn. A node that owns a
      // clock takes it from there; otherwise setImmediate stays, because a
      // zero-delay timer is a DIFFERENT event-loop phase and swapping one for
      // the other would change production's ordering, not just its substrate.
      const hop = () => {
        this.peerReconciliationScheduled = false;
        this.reconcileRaftPeersFromCache();
      };
      if (this.providedTimeSource) {
        this.providedTimeSource.setTimeout(hop, 0);
        return;
      }
      setImmediate(hop);
    },
  });
}

export {assignPeerResolution};
