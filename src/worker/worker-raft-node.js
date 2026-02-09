/**
 * WorkerRaftNode - Shared Raft node class for worker processes.
 *
 * Extends LifeRaft with WorkerMessageBridge transport.
 * Used by both MessageGroupWorkerService and PartitionWorkerService.
 *
 * This module eliminates duplicate WorkerRaftNode class definitions
 * by providing a single shared implementation.
 *
 * @module worker/worker-raft-node
 * @see Requirements 2.1, 2.3 - Code Path Uniqueness Compliance
 */

import LifeRaft from '@markwylde/liferaft';

/**
 * Error messages for WorkerRaftNode.
 * @type {Readonly<Object>}
 */
const WORKER_RAFT_NODE_ERROR_MSG = Object.freeze({
  MESSAGE_BRIDGE_NOT_INITIALIZED: 'WorkerMessageBridge not initialized',
});

/**
 * Log messages for WorkerRaftNode.
 * @type {Readonly<Object>}
 */
const WORKER_RAFT_NODE_LOG_MSG = Object.freeze({
  RAFT_PACKET_SENDING: 'Sending Raft packet via WorkerMessageBridge',
  RAFT_PACKET_SENT: 'Raft packet sent via WorkerMessageBridge',
  RAFT_PACKET_FAILED: 'Failed to send Raft packet via WorkerMessageBridge',
});

/**
 * Shared context storage for WorkerRaftNode instances.
 * When liferaft clones nodes via join(), it doesn't pass the context.
 * This WeakMap stores context by the parent node's address so cloned
 * nodes can access it.
 * @type {Map<string, Object>}
 */
const sharedContextByAddress = new Map();

/**
 * Custom Raft node class that extends LifeRaft with WorkerMessageBridge transport.
 * Implements write() method to route Raft packets through the worker message bridge.
 *
 * When liferaft creates peer nodes via clone(), it only passes options, not context.
 * This class handles that by storing context in a shared map keyed by the parent
 * node's address, allowing cloned peer nodes to access the context.
 *
 * @extends LifeRaft
 */
class WorkerRaftNode extends LifeRaft {
  /**
   * Create a new WorkerRaftNode instance.
   * @param {string|Object} address - Unified address for this Raft node, or options
   *   object when called by liferaft's clone() method.
   * @param {Object} [options] - LifeRaft configuration options.
   * @param {Object} [context] - Context object with dependencies.
   * @param {Object} [context.messageBridge] - WorkerMessageBridge instance for IPC.
   * @param {Object} [context.logger] - Logger instance for logging.
   * @param {string} [context.entityId] - Entity ID (partitionId or groupId) for logging.
   */
  constructor(address, options, context) {
    super(address, options);

    // When liferaft clones a node, it passes options as the first argument
    // and address is inside options. In this case, context will be undefined.
    if (context) {
      // This is the parent node - store context for cloned nodes to access
      this.context = context;
      // Store context in shared map so cloned peer nodes can access it
      // Use a unique key based on the context's entityId
      if (context.entityId) {
        sharedContextByAddress.set(context.entityId, context);
      }
    }
    // For cloned nodes, context will be retrieved in write() method
  }

  /**
   * Write method for sending Raft messages to peers via WorkerMessageBridge.
   * Routes Raft packets through the main process MessageRouter.
   *
   * For cloned peer nodes (created by liferaft's join()), this.context will be
   * undefined. In that case, we extract the entityId from the packet.address
   * and retrieve the context from the shared map.
   *
   * @param {Object} packet - Raft protocol packet from liferaft.
   * @param {Function} callback - Completion callback.
   */
  write(packet, callback) {
    // The destination is the peer address we're sending to
    // packet.address is the sender's address (this replica)
    // this.address is the peer's address (set by liferaft when calling write)
    const peerAddress = this.address;

    // Get context - either from this instance or from shared map
    // For cloned peer nodes, this.context is undefined, so we need to
    // extract the entityId from packet.address and look up the context
    let context = this.context;

    if (!context && packet.address) {
      // packet.address format: nodeId/entityType/replicaId
      // entityId is derived from replicaId (e.g., 'partition-1-r0' -> 'partition-1')
      // But we stored context by entityId, so we need to find it
      // The sender address contains the entityId in the replicaId portion
      // Try to find context by iterating through stored contexts
      for (const [entityId, storedContext] of sharedContextByAddress) {
        // Check if the packet.address contains this entityId
        if (packet.address.includes(entityId)) {
          context = storedContext;
          break;
        }
      }
    }

    // If still no context, try to get it from the first available context
    // This handles edge cases where address matching fails
    if (!context && sharedContextByAddress.size > 0) {
      context = sharedContextByAddress.values().next().value;
    }

    const messageBridge = context?.messageBridge;
    const logger = context?.logger;
    const entityId = context?.entityId;

    if (logger) {
      logger.debug(WORKER_RAFT_NODE_LOG_MSG.RAFT_PACKET_SENDING, {
        type: packet.type,
        term: packet.term,
        destination: peerAddress,
        sender: packet.address,
        entityId,
      });
    }

    // Send via WorkerMessageBridge which routes through main process MessageRouter
    // Use fire-and-forget since Raft protocol handles retries and timeouts
    if (messageBridge) {
      try {
        messageBridge.sendFireAndForget(peerAddress, packet);
        if (logger) {
          logger.debug(WORKER_RAFT_NODE_LOG_MSG.RAFT_PACKET_SENT, {
            type: packet.type,
            destination: peerAddress,
            entityId,
          });
        }
        // Call callback immediately - Raft handles retries
        callback(null);
      } catch (err) {
        if (logger) {
          logger.warn(WORKER_RAFT_NODE_LOG_MSG.RAFT_PACKET_FAILED, {
            type: packet.type,
            destination: peerAddress,
            error: err.message,
            entityId,
          });
        }
        callback(err);
      }
    } else {
      callback(new Error(WORKER_RAFT_NODE_ERROR_MSG.MESSAGE_BRIDGE_NOT_INITIALIZED));
    }
  }
}

/**
 * Clear the shared context for a specific entityId.
 * Should be called when a WorkerRaftNode is destroyed.
 * @param {string} entityId - The entity ID to clear.
 */
function clearSharedContext(entityId) {
  sharedContextByAddress.delete(entityId);
}

/**
 * Clear all shared contexts.
 * Useful for testing cleanup.
 */
function clearAllSharedContexts() {
  sharedContextByAddress.clear();
}

export {
  WorkerRaftNode,
  WORKER_RAFT_NODE_ERROR_MSG,
  WORKER_RAFT_NODE_LOG_MSG,
  clearSharedContext,
  clearAllSharedContexts,
};
