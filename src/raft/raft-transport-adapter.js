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
import {RaftPeerBackpressureMute} from './raft-peer-backpressure-mute.js';

const LOCAL_STR_FUNCTION = 'function';
const LOCAL_STR_STRING = 'string';
const LOCAL_NUM_ZERO = 0;
const LOCAL_NUM_ONE = 1;

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
    // CL-009(ii)/CL-003: per-peer mute honoring outbound backpressure
    // rejections (see raft-peer-backpressure-mute.js for the rationale and
    // safety analysis).
    this.peerBackpressureMute = new RaftPeerBackpressureMute();
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
    const deliveryOptions = resolveRaftTransportDeliveryOptions({
      ...packet,
      targetAddress: peerAddress,
      targetReplicaStatus: this.resolveTargetReplicaStatus(peerAddress),
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

      const result = await this.peerBackpressureMute.deliver(
        this.messageRouter,
        peerAddress,
        message,
        deliveryOptions,
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
        typeof this.systemTableCache.get !== LOCAL_STR_FUNCTION ||
        typeof peerAddress !== LOCAL_STR_STRING ||
        peerAddress.length === LOCAL_NUM_ZERO) {
      return null;
    }
    const separatorIndex = peerAddress.lastIndexOf(ADDRESS.SEPARATOR);
    if (separatorIndex <= LOCAL_NUM_ZERO || separatorIndex === peerAddress.length - LOCAL_NUM_ONE) {
      return null;
    }
    const serviceId = peerAddress.slice(
      separatorIndex + ADDRESS.SEPARATOR.length,
    );
    const serviceRow = this.systemTableCache.get(TABLES.SERVICES, serviceId);
    const status = serviceRow?.status;
    return typeof status === LOCAL_STR_STRING && status.length > LOCAL_NUM_ZERO ? status : null;
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
