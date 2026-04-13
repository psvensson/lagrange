/**
 * PartitionRaftNode - Custom Raft node class for partition consensus.
 * Extends LifeRaft with transport integration and deferred election support.
 * Requirements: 1.1, 1.8, 10.1, 10.2, 10.3, 10.4
 *
 * @module partition/partition-raft-node
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
import LifeRaft from '../raft/liferaft.js';
import { resolveRaftTransportDeliveryOptions } from '../raft/constants.js';
import { PARTITION_RAFT_NODE_LOG_MSG } from './partition-raft-node-constants.js';

/**
 * Create a PartitionRaftNode class with the given context.
 * This factory function creates a custom LifeRaft subclass that integrates
 * with the partition service's transport and supports deferred elections.
 *
 * The factory pattern is used because the RaftNode class needs access to:
 * - The parent service's transport for message delivery
 * - The parent service's buildPeerAddress method for address resolution
 * - The parent service's logger for logging
 * - The deferElection flag to control election timing
 *
 * @param {Object} context - Context from the parent PartitionService.
 * @param {Object} context.transport - MessageRouter for Raft communication.
 * @param {Function} context.buildPeerAddress - Function to resolve peer addresses.
 * @param {Object} context.logger - Logger instance for debug/info messages.
 * @param {boolean} context.deferElection - Whether to defer election start.
 * @param {string} context.replicaId - This replica's ID for logging.
 * @param {string} context.partitionId - Partition ID for logging.
 * @return {Function} PartitionRaftNode class constructor.
 */
function createPartitionRaftNodeClass(context) {
  if (stryMutAct_9fa48("100835")) {
    {}
  } else {
    stryCov_9fa48("100835");
    const {
      transport,
      buildPeerAddress,
      logger,
      deferElection,
      replicaId,
      partitionId
    } = context;

    /**
     * Custom Raft node class that extends LifeRaft with partition transport.
     * Simplified to call transport.deliver() directly without type conversion.
     * Supports deferred election start to prevent election storms during bootstrap.
     *
     * @class PartitionRaftNode
     * @extends LifeRaft
     *
     * @description
     * This class provides the Raft consensus implementation for partition replicas.
     * It integrates with the MessageRouter transport layer for peer communication
     * and supports deferred election start for coordinated cluster bootstrap.
     *
     * Key features:
     * - Deferred election: When deferElection is true, the heartbeat timer won't
     *   start until startElection() is called on the parent PartitionService.
     * - Transport integration: Uses the MessageRouter to deliver Raft packets
     *   to peer replicas using unified addresses.
     * - Address resolution: Uses buildPeerAddress to convert replica IDs to
     *   fully qualified unified addresses for routing.
     *
     * Requirements: 10.1, 10.2, 10.3, 10.4
     */
    class PartitionRaftNode extends LifeRaft {
      /**
       * Override initialize to support deferred election start.
       * When deferElection is true, we don't start the heartbeat timer.
       * Call startElection() on the parent PartitionService later to begin
       * the election process.
       *
       * @param {Object} _options - Initialization options (unused).
       * @param {Function} callback - Completion callback.
       */
      initialize(_options, callback) {
        if (stryMutAct_9fa48("100836")) {
          {}
        } else {
          stryCov_9fa48("100836");
          if (stryMutAct_9fa48("100838") ? false : stryMutAct_9fa48("100837") ? true : (stryCov_9fa48("100837", "100838"), deferElection)) {
            if (stryMutAct_9fa48("100839")) {
              {}
            } else {
              stryCov_9fa48("100839");
              // Don't start heartbeat timer - election will be started manually
              logger.debug(PARTITION_RAFT_NODE_LOG_MSG.DEFERRING_ELECTION_START, stryMutAct_9fa48("100840") ? {} : (stryCov_9fa48("100840"), {
                replicaId,
                partitionId
              }));
              // Just signal initialization complete without starting timer
              if (stryMutAct_9fa48("100842") ? false : stryMutAct_9fa48("100841") ? true : (stryCov_9fa48("100841", "100842"), callback)) callback();
            }
          } else {
            if (stryMutAct_9fa48("100843")) {
              {}
            } else {
              stryCov_9fa48("100843");
              // Normal initialization - heartbeat timer will start automatically
              if (stryMutAct_9fa48("100845") ? false : stryMutAct_9fa48("100844") ? true : (stryCov_9fa48("100844", "100845"), callback)) callback();
            }
          }
        }
      }

      /**
       * Write method for sending Raft messages to peers.
       * Called by liferaft when it needs to communicate with other nodes.
       * Sends packets directly to transport without type conversion.
       *
       * Note: When liferaft calls node.write(), 'this' is the cloned node
       * representing the peer, so 'this.address' is the destination address.
       *
       * Requirements: 10.2, 10.3, 10.4
       *
       * @param {Object} packet - Raft protocol packet (packet.address is sender).
       * @param {Function} callback - Completion callback.
       */
      write(packet, callback) {
        if (stryMutAct_9fa48("100846")) {
          {}
        } else {
          stryCov_9fa48("100846");
          // Build peer address for routing
          // this.address is the destination, packet.address is the sender
          const peerAddress = buildPeerAddress(this.address);

          // Send packet unchanged - no type conversion
          // Only add destination address for routing, preserve all packet fields
          // Requirements: 10.2, 10.3
          transport.deliver(peerAddress, packet, resolveRaftTransportDeliveryOptions(stryMutAct_9fa48("100847") ? {} : (stryCov_9fa48("100847"), {
            ...packet,
            targetAddress: peerAddress
          }))).then(stryMutAct_9fa48("100848") ? () => undefined : (stryCov_9fa48("100848"), result => callback(null, result))).catch(stryMutAct_9fa48("100849") ? () => undefined : (stryCov_9fa48("100849"), err => callback(err)));
        }
      }
    }
    return PartitionRaftNode;
  }
}
export { createPartitionRaftNodeClass };