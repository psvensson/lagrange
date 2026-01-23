/**
 * RaftTransportAdapter - Bridges liferaft with MessageRouter for WebSocket communication.
 * Implements the write() method required by liferaft for peer communication.
 * Requirements: 1.4, 2.1, 2.2, 2.3, 2.4, 2.5
 */

import {AddressManager} from '../address/address-manager.js';

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
      throw new Error('messageRouter is required');
    }
    if (!options.entityType) {
      throw new Error('entityType is required');
    }
    if (!options.nodeId) {
      throw new Error('nodeId is required');
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

    // Debug logging for Raft message delivery

    console.log('[RaftTransportAdapter] write:', {
      type: packet.type,
      destination: destinationId,
      peerAddress,
      sender: packet.address,
      term: packet.term,
    });

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

      const result = await this.messageRouter.deliver(peerAddress, message);
      callback(null, result);
    } catch (error) {
      console.log('[RaftTransportAdapter] write error:', error.message);
      callback(error);
    }
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
    if (peerId && peerId.includes('/')) {
      const validation = addressManager.validate(peerId);
      if (validation.valid) {
        return peerId;
      }
      // If invalid unified format, fall through to construct a new address
    }

    // Look up nodeId from system table cache if available
    if (this.systemTableCache) {
      const service = this.systemTableCache.get('services', peerId);
      if (service?.node_id) {
        return addressManager.format(service.node_id, this.entityType, peerId);
      }
    }

    // Fallback: assume same node during bootstrap
    return addressManager.format(this.nodeId, this.entityType, peerId);
  }

  /**
   * Map liferaft packet types to our message types.
   * @param {string} packetType - Liferaft packet type
   * @return {string} Our message type
   */
  getRaftMessageType(packetType) {
    const typeMap = {
      'vote': 'RAFT_REQUEST_VOTE',
      'voted': 'RAFT_REQUEST_VOTE_RESPONSE',
      'append': 'RAFT_APPEND_ENTRIES',
      'appended': 'RAFT_APPEND_ENTRIES_RESPONSE',
    };
    return typeMap[packetType] || packetType;
  }
}

export {RaftTransportAdapter};
