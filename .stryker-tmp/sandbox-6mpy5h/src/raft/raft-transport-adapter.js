/**
 * RaftTransportAdapter - Bridges liferaft with MessageRouter for WebSocket communication.
 * Implements the write() method required by liferaft for peer communication.
 * Requirements: 1.4, 2.1, 2.2, 2.3, 2.4, 2.5
 */
// @ts-nocheck
function stryNS_9fa48() {
  var g = typeof globalThis === 'object' && globalThis && globalThis.Math === Math && globalThis || new Function("return this")();
  var ns = g.__stryker__ || (g.__stryker__ = {});
  if (ns.activeMutant === undefined && g.process && g.process.env && g.process.env.__STRYKER_ACTIVE_MUTANT__) {
    ns.activeMutant = g.process.env.__STRYKER_ACTIVE_MUTANT__;
  }
  function retrieveNS() {
    return ns;
  }
  stryNS_9fa48 = retrieveNS;
  return retrieveNS();
}
stryNS_9fa48();
function stryCov_9fa48() {
  var ns = stryNS_9fa48();
  var cov = ns.mutantCoverage || (ns.mutantCoverage = {
    static: {},
    perTest: {}
  });
  function cover() {
    var c = cov.static;
    if (ns.currentTestId) {
      c = cov.perTest[ns.currentTestId] = cov.perTest[ns.currentTestId] || {};
    }
    var a = arguments;
    for (var i = 0; i < a.length; i++) {
      c[a[i]] = (c[a[i]] || 0) + 1;
    }
  }
  stryCov_9fa48 = cover;
  cover.apply(null, arguments);
}
function stryMutAct_9fa48(id) {
  var ns = stryNS_9fa48();
  function isActive(id) {
    if (ns.activeMutant === id) {
      if (ns.hitCount !== void 0 && ++ns.hitCount > ns.hitLimit) {
        throw new Error('Stryker: Hit count limit reached (' + ns.hitCount + ')');
      }
      return true;
    }
    return false;
  }
  stryMutAct_9fa48 = isActive;
  return isActive(id);
}
import { AddressManager } from '../address/address-manager.js';
import { ADDRESS, TABLES } from '../constants/index.js';
import { RAFT_PACKET_MESSAGE_TYPE, RAFT_TRANSPORT_ERROR_MSG, RAFT_TRANSPORT_LOG_MSG, resolveRaftTransportDeliveryOptions } from './constants.js';

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
    if (stryMutAct_9fa48("128549")) {
      {}
    } else {
      stryCov_9fa48("128549");
      if (stryMutAct_9fa48("128552") ? false : stryMutAct_9fa48("128551") ? true : stryMutAct_9fa48("128550") ? options.messageRouter : (stryCov_9fa48("128550", "128551", "128552"), !options.messageRouter)) {
        if (stryMutAct_9fa48("128553")) {
          {}
        } else {
          stryCov_9fa48("128553");
          throw new Error(RAFT_TRANSPORT_ERROR_MSG.MESSAGE_ROUTER_REQUIRED);
        }
      }
      if (stryMutAct_9fa48("128556") ? false : stryMutAct_9fa48("128555") ? true : stryMutAct_9fa48("128554") ? options.entityType : (stryCov_9fa48("128554", "128555", "128556"), !options.entityType)) {
        if (stryMutAct_9fa48("128557")) {
          {}
        } else {
          stryCov_9fa48("128557");
          throw new Error(RAFT_TRANSPORT_ERROR_MSG.ENTITY_TYPE_REQUIRED);
        }
      }
      if (stryMutAct_9fa48("128560") ? false : stryMutAct_9fa48("128559") ? true : stryMutAct_9fa48("128558") ? options.nodeId : (stryCov_9fa48("128558", "128559", "128560"), !options.nodeId)) {
        if (stryMutAct_9fa48("128561")) {
          {}
        } else {
          stryCov_9fa48("128561");
          throw new Error(RAFT_TRANSPORT_ERROR_MSG.NODE_ID_REQUIRED);
        }
      }
      this.messageRouter = options.messageRouter;
      this.entityType = options.entityType;
      this.nodeId = options.nodeId;
      this.systemTableCache = stryMutAct_9fa48("128564") ? options.systemTableCache && null : stryMutAct_9fa48("128563") ? false : stryMutAct_9fa48("128562") ? true : (stryCov_9fa48("128562", "128563", "128564"), options.systemTableCache || null);
    }
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
    if (stryMutAct_9fa48("128565")) {
      {}
    } else {
      stryCov_9fa48("128565");
      // Use destination address if provided, otherwise fall back to packet.address
      // The destination is the peer we're sending to, packet.address is the sender
      const destinationId = stryMutAct_9fa48("128568") ? packet.destination && packet.address : stryMutAct_9fa48("128567") ? false : stryMutAct_9fa48("128566") ? true : (stryCov_9fa48("128566", "128567", "128568"), packet.destination || packet.address);
      const peerAddress = this.buildPeerAddress(destinationId);
      try {
        if (stryMutAct_9fa48("128569")) {
          {}
        } else {
          stryCov_9fa48("128569");
          // Build the message to send - include all liferaft packet fields
          // The receiver needs: type, term, address, state, leader, last, data
          const message = stryMutAct_9fa48("128570") ? {} : (stryCov_9fa48("128570"), {
            type: this.getRaftMessageType(packet.type),
            term: packet.term,
            address: packet.address,
            state: packet.state,
            leader: packet.leader,
            last: packet.last,
            data: packet.data
          });
          const result = await this.messageRouter.deliver(peerAddress, message, resolveRaftTransportDeliveryOptions(stryMutAct_9fa48("128571") ? {} : (stryCov_9fa48("128571"), {
            ...packet,
            targetAddress: peerAddress
          })));
          callback(null, result);
        }
      } catch (error) {
        if (stryMutAct_9fa48("128572")) {
          {}
        } else {
          stryCov_9fa48("128572");
          callback(error);
        }
      }
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
    if (stryMutAct_9fa48("128573")) {
      {}
    } else {
      stryCov_9fa48("128573");
      const addressManager = AddressManager.getInstance();

      // If already in unified format, validate and return as-is
      if (stryMutAct_9fa48("128576") ? peerId || peerId.includes(ADDRESS.SEPARATOR) : stryMutAct_9fa48("128575") ? false : stryMutAct_9fa48("128574") ? true : (stryCov_9fa48("128574", "128575", "128576"), peerId && peerId.includes(ADDRESS.SEPARATOR))) {
        if (stryMutAct_9fa48("128577")) {
          {}
        } else {
          stryCov_9fa48("128577");
          const validation = addressManager.validate(peerId);
          if (stryMutAct_9fa48("128579") ? false : stryMutAct_9fa48("128578") ? true : (stryCov_9fa48("128578", "128579"), validation.valid)) {
            if (stryMutAct_9fa48("128580")) {
              {}
            } else {
              stryCov_9fa48("128580");
              return peerId;
            }
          }
          throw new Error(stryMutAct_9fa48("128581") ? `` : (stryCov_9fa48("128581"), `Invalid unified address format: ${validation.error}`));
        }
      }

      // Look up nodeId from system table cache if available
      if (stryMutAct_9fa48("128583") ? false : stryMutAct_9fa48("128582") ? true : (stryCov_9fa48("128582", "128583"), this.systemTableCache)) {
        if (stryMutAct_9fa48("128584")) {
          {}
        } else {
          stryCov_9fa48("128584");
          const service = this.systemTableCache.get(TABLES.SERVICES, peerId);
          if (stryMutAct_9fa48("128587") ? service.node_id : stryMutAct_9fa48("128586") ? false : stryMutAct_9fa48("128585") ? true : (stryCov_9fa48("128585", "128586", "128587"), service?.node_id)) {
            if (stryMutAct_9fa48("128588")) {
              {}
            } else {
              stryCov_9fa48("128588");
              return addressManager.format(service.node_id, this.entityType, peerId);
            }
          }
        }
      }
      throw new Error(stryMutAct_9fa48("128589") ? `` : (stryCov_9fa48("128589"), `Unable to resolve unified peer address for ${peerId}`));
    }
  }

  /**
   * Map liferaft packet types to our message types.
   * @param {string} packetType - Liferaft packet type
   * @return {string} Our message type
   */
  getRaftMessageType(packetType) {
    if (stryMutAct_9fa48("128590")) {
      {}
    } else {
      stryCov_9fa48("128590");
      return stryMutAct_9fa48("128593") ? RAFT_PACKET_MESSAGE_TYPE[packetType] && packetType : stryMutAct_9fa48("128592") ? false : stryMutAct_9fa48("128591") ? true : (stryCov_9fa48("128591", "128592", "128593"), RAFT_PACKET_MESSAGE_TYPE[packetType] || packetType);
    }
  }
}
export { RaftTransportAdapter };