/**
 * RaftTransportAdapter - Bridges liferaft with MessageRouter for WebSocket communication.
 * Implements the write() method required by liferaft for peer communication.
 * Requirements: 1.4, 2.1, 2.2, 2.3, 2.4, 2.5
 */

import {AddressManager} from '../address/address-manager.js';
import {ADDRESS, TABLES} from '../constants/index.js';
import {
  RAFT_PACKET_MESSAGE_TYPE,
  RAFT_TRANSPORT_ERROR_MSG,
  resolveRaftTransportDeliveryOptions,
} from './constants.js';

/**
 * Transport adapter for liferaft that uses MessageRouter.
 * Implements the write() method required by liferaft.
 */
class RaftTransportAdapter {
  /**
   * @param {Object} options
   * @param {MessageRouter} options.messageRouter - WebSocket message router
   * @param {string} options.entityType - 'message-group' or 'partition'
   * @param {string} options.nodeId - This node's ID
   * @param {Object} options.systemTableCache - For peer address lookup (optional)
   */
  constructor(options) {
    if (!options.messageRouter) {
      throw new Error(RAFT_TRANSPORT_ERROR_MSG.MESSAGE_ROUTER_REQUIRED);
    }
    if (!options.entityType) {
      throw new Error(RAFT_TRANSPORT_ERROR_MSG.ENTITY_TYPE_REQUIRED);
    }
    if (!options.nodeId) {
      throw new Error(RAFT_TRANSPORT_ERROR_MSG.NODE_ID_REQUIRED);
    }

    this.messageRouter = options.messageRouter;
    this.entityType = options.entityType;
    this.nodeId = options.nodeId;
    this.systemTableCache = options.systemTableCache || null;
  }

  /**
   * Send a Raft message to a peer.
   * Called by liferaft when it needs to communicate with other nodes.
   * @param {Object} packet - Raft protocol packet from liferaft
   * @param {string} packet.destination - Destination peer address (added by RaftNode.write)
   * @param {string} packet.address - Sender's address (from liferaft)
   * @param {Function} callback - Completion callback
   */
  async write(packet, callback) {
    // Use destination address if provided, otherwise fall back to packet.address
    // The destination is the peer we're sending to, packet.address is the sender
    const destinationId = packet.destination || packet.address;
    const peerAddress = this.buildPeerAddress(destinationId);

    try {
      // Build the message to send - include all liferaft packet fields
      // The receiver needs: type, term, address, state, leader, last, data
      const message = {
        type: this.getRaftMessageType(packet.type),
        term: packet.term,
        address: packet.address,
        state: packet.state,
        leader: packet.leader,
        last: packet.last,
        data: packet.data,
      };

      const result = await this.messageRouter.deliver(
        peerAddress,
        message,
        resolveRaftTransportDeliveryOptions({
          ...packet,
          targetAddress: peerAddress,
          targetReplicaStatus: this.resolveTargetReplicaStatus(peerAddress),
        }),
      );
      callback(null, result);
    } catch (error) {
      callback(error);
    }
  }

  /**
   * Resolve the current target replica status from the services cache when the
   * peer address identifies one partition replica. This lets transport keep
   * control-plane learner catch-up off the critical lane without weakening
   * steady-state control traffic.
   * @param {string} peerAddress
   * @return {string|null}
   */
  resolveTargetReplicaStatus(peerAddress) {
    if (!this.systemTableCache ||
        typeof this.systemTableCache.get !== 'function' ||
        typeof peerAddress !== 'string' ||
        peerAddress.length === 0) {
      return null;
    }
    const separatorIndex = peerAddress.lastIndexOf(ADDRESS.SEPARATOR);
    if (separatorIndex <= 0 || separatorIndex === peerAddress.length - 1) {
      return null;
    }
    const serviceId = peerAddress.slice(
      separatorIndex + ADDRESS.SEPARATOR.length,
    );
    const serviceRow = this.systemTableCache.get(TABLES.SERVICES, serviceId);
    const status = serviceRow?.status;
    return typeof status === 'string' && status.length > 0 ? status : null;
  }

  /**
   * Build unified address for a peer.
   * Format: ${nodeId}/${entityType}/${entityId}
   * Requirements: 1.4, 2.3
   * @param {string} peerId - Peer identifier
   * @return {string} Unified address
   */
  buildPeerAddress(peerId) {
    const addressManager = AddressManager.getInstance();

    // If already in unified format, validate and return as-is
    if (peerId && peerId.includes(ADDRESS.SEPARATOR)) {
      const validation = addressManager.validate(peerId);
      if (validation.valid) {
        return peerId;
      }
      throw new Error(`Invalid unified address format: ${validation.error}`);
    }

    // Look up nodeId from system table cache if available
    if (this.systemTableCache) {
      const service = this.systemTableCache.get(TABLES.SERVICES, peerId);
      if (service?.node_id) {
        return addressManager.format(service.node_id, this.entityType, peerId);
      }
    }

    throw new Error(`Unable to resolve unified peer address for ${peerId}`);
  }

  /**
   * Map liferaft packet types to our message types.
   * @param {string} packetType - Liferaft packet type
   * @return {string} Our message type
   */
  getRaftMessageType(packetType) {
    return RAFT_PACKET_MESSAGE_TYPE[packetType] || packetType;
  }
}

export {RaftTransportAdapter};
