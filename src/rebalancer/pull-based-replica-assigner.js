/**
 * Pull-Based Replica Assigner - Handles replica assignment from joining node's perspective.
 * The goal is to relieve load from overloaded nodes while respecting table replication policies.
 * Requirements: 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.9, 4.10
 */

import {EventEmitter} from 'events';
import {ReplicaStatus} from './replica-status.js';

/**
 * Error thrown when placement policy is violated.
 */
class PlacementPolicyViolationError extends Error {
  /**
   * Create a PlacementPolicyViolationError.
   * @param {string} message - Error message.
   * @param {string[]} violations - List of policy violations.
   */
  constructor(message, violations = []) {
    super(message);
    this.name = 'PlacementPolicyViolationError';
    this.violations = violations;
  }
}

/**
 * PullBasedReplicaAssigner manages replica assignment from the joining node's perspective.
 * Key behaviors:
 * - Identifies overloaded nodes (more replicas than average)
 * - Selects replicas to pull that relieve overloaded nodes
 * - Respects table replication policies
 * - Ensures no two replicas of the same partition on the same node
 * - Creates local replicas after epoch acceptance
 * - Syncs data from existing replicas
 *
 * @extends EventEmitter
 */
class PullBasedReplicaAssigner extends EventEmitter {
  /**
   * Create a new PullBasedReplicaAssigner.
   * @param {Object} options - Configuration options.
   * @param {string} options.nodeId - The ID of this node.
   * @param {number} [options.maxReplicasToPull=10] - Maximum replicas to pull in one proposal.
   * @param {number} [options.syncRetryAttempts=3] - Number of retry attempts for sync.
   * @param {number} [options.syncRetryDelayMs=1000] - Delay between sync retries in ms.
   * @param {Object} [options.replicaHandler] - Handler for creating local replicas.
   * @param {Object} [options.rpcClient] - RPC client for syncing data from source nodes.
   */
  constructor(options = {}) {
    super();

    if (!options.nodeId || typeof options.nodeId !== 'string') {
      throw new Error('nodeId is required and must be a non-empty string');
    }

    this._nodeId = options.nodeId;
    this._maxReplicasToPull = options.maxReplicasToPull || 10;
    this._syncRetryAttempts = options.syncRetryAttempts || 3;
    this._syncRetryDelayMs = options.syncRetryDelayMs || 1000;
    this._replicaHandler = options.replicaHandler || null;
    this._rpcClient = options.rpcClient || null;

    // Track local replicas being created
    this._localReplicas = new Map();
  }

  /**
   * Analyze current epoch and decide which replicas to pull.
   *
   * Strategy:
   * 1. Identify overloaded nodes (more replicas than average)
   * 2. For each table, check if replication policy allows redistribution
   * 3. Select replicas to pull that:
   *    - Come from overloaded nodes
   *    - Don't violate placement constraints (e.g., no two replicas on same node)
   *    - Respect table-specific replication factor
   * 4. Propose new assignments that improve balance
   *
   * @param {Object} currentEpoch - The current AssignmentEpoch.
   * @param {string} thisNodeId - The ID of this (joining) node.
   * @param {string[]} allReadyNodes - Only READY nodes considered.
   * @param {Map<string, Object>} tablePolicies - Replication policies per table.
   * @return {Object} Proposed assignment changes.
   */
  analyzeAndPropose(currentEpoch, thisNodeId, allReadyNodes, tablePolicies) {
    // Validate inputs
    if (!currentEpoch || !currentEpoch.assignments) {
      return {
        success: false,
        error: 'Invalid current epoch',
        proposedAssignments: null,
        replicasToPull: [],
      };
    }

    if (!thisNodeId || typeof thisNodeId !== 'string') {
      return {
        success: false,
        error: 'Invalid thisNodeId',
        proposedAssignments: null,
        replicasToPull: [],
      };
    }

    if (!Array.isArray(allReadyNodes) || allReadyNodes.length === 0) {
      return {
        success: false,
        error: 'No ready nodes available',
        proposedAssignments: null,
        replicasToPull: [],
      };
    }

    // Include this node in the node list for calculations
    const allNodes = allReadyNodes.includes(thisNodeId) ?
      [...allReadyNodes] :
      [...allReadyNodes, thisNodeId];

    // Calculate replicas to pull
    const replicasToPull = this.calculateReplicasToPull(
      currentEpoch.assignments,
      thisNodeId,
      allNodes,
    );

    if (replicasToPull.length === 0) {
      return {
        success: true,
        proposedAssignments: null,
        replicasToPull: [],
        reason: 'no_rebalancing_needed',
      };
    }

    // Build proposed assignments
    const proposedAssignments = this._buildProposedAssignments(
      currentEpoch.assignments,
      replicasToPull,
      thisNodeId,
    );

    // Validate against policies
    const validation = this.validateAgainstPolicies(proposedAssignments, tablePolicies);

    if (!validation.valid) {
      return {
        success: false,
        error: 'Policy violations detected',
        violations: validation.violations,
        proposedAssignments: null,
        replicasToPull: [],
      };
    }

    return {
      success: true,
      proposedAssignments,
      replicasToPull,
      reason: 'rebalancing_proposed',
    };
  }

  /**
   * Calculate which replicas to pull based on load balancing.
   * Identifies overloaded nodes and selects replicas to pull from them.
   *
   * @param {Object} currentAssignments - Current partition assignments.
   * @param {string} thisNodeId - The ID of this (joining) node.
   * @param {string[]} allNodes - All nodes to consider.
   * @return {{partitionId: string, fromNode: string}[]} Replicas to pull.
   */
  calculateReplicasToPull(currentAssignments, thisNodeId, allNodes) {
    if (!currentAssignments || typeof currentAssignments !== 'object') {
      return [];
    }

    if (!thisNodeId || typeof thisNodeId !== 'string') {
      return [];
    }

    if (!Array.isArray(allNodes) || allNodes.length === 0) {
      return [];
    }

    // Calculate replica count per node
    const nodeReplicaCounts = this._calculateNodeReplicaCounts(
      currentAssignments,
      allNodes,
    );

    // Calculate average replicas per node (target)
    const totalReplicas = Object.values(currentAssignments)
      .reduce((sum, nodeList) => sum + nodeList.length, 0);
    const avgReplicas = totalReplicas / allNodes.length;

    // Identify overloaded nodes (above average)
    const overloadedNodes = [];
    for (const [nodeId, count] of Object.entries(nodeReplicaCounts)) {
      if (count > avgReplicas && nodeId !== thisNodeId) {
        overloadedNodes.push({nodeId, count, excess: count - avgReplicas});
      }
    }

    // Sort by excess (most overloaded first)
    overloadedNodes.sort((a, b) => b.excess - a.excess);

    // Get current replica count for this node
    const thisNodeCount = nodeReplicaCounts[thisNodeId] || 0;

    // Calculate how many replicas this node should pull
    const targetCount = Math.floor(avgReplicas);
    const replicasNeeded = Math.max(0, targetCount - thisNodeCount);

    if (replicasNeeded === 0 || overloadedNodes.length === 0) {
      return [];
    }

    // Select replicas to pull from overloaded nodes
    const replicasToPull = [];
    const partitionsOnThisNode = this._getPartitionsOnNode(
      currentAssignments,
      thisNodeId,
    );

    for (const {nodeId: fromNode} of overloadedNodes) {
      if (replicasToPull.length >= replicasNeeded) {
        break;
      }

      if (replicasToPull.length >= this._maxReplicasToPull) {
        break;
      }

      // Find partitions on this overloaded node that we can pull
      for (const [partitionId, nodeList] of Object.entries(currentAssignments)) {
        if (replicasToPull.length >= replicasNeeded) {
          break;
        }

        if (replicasToPull.length >= this._maxReplicasToPull) {
          break;
        }

        // Skip if this partition is already on this node
        if (partitionsOnThisNode.has(partitionId)) {
          continue;
        }

        // Skip if we're already planning to pull this partition
        if (replicasToPull.some((r) => r.partitionId === partitionId)) {
          continue;
        }

        // Check if this partition has a replica on the overloaded node
        if (nodeList.includes(fromNode)) {
          replicasToPull.push({
            partitionId,
            fromNode,
          });
          // Track that we're pulling this partition
          partitionsOnThisNode.add(partitionId);
        }
      }
    }

    return replicasToPull;
  }

  /**
   * Verify proposed assignments respect table policies.
   * Checks:
   * - No partition has multiple replicas on the same node
   * - Replication factor is respected (if specified in policy)
   *
   * @param {Object} proposedAssignments - Proposed partition assignments.
   * @param {Map<string, Object>} tablePolicies - Replication policies per table.
   * @return {{valid: boolean, violations: string[]}} Validation result.
   */
  validateAgainstPolicies(proposedAssignments, tablePolicies) {
    const violations = [];

    if (!proposedAssignments || typeof proposedAssignments !== 'object') {
      return {valid: true, violations: []};
    }

    // Check each partition
    for (const [partitionId, nodeList] of Object.entries(proposedAssignments)) {
      if (!Array.isArray(nodeList)) {
        violations.push(`Invalid node list for partition ${partitionId}`);
        continue;
      }

      // Check for duplicate nodes (same partition on same node)
      const nodeSet = new Set();
      for (const nodeId of nodeList) {
        if (nodeSet.has(nodeId)) {
          violations.push(
            `Partition ${partitionId} has duplicate replica on node ${nodeId}`,
          );
        }
        nodeSet.add(nodeId);
      }

      // Check replication factor if policy exists
      if (tablePolicies && tablePolicies instanceof Map) {
        // Extract table name from partition ID (e.g., 'tables-p1' -> 'tables')
        const tableName = this._extractTableName(partitionId);
        const policy = tablePolicies.get(tableName);

        if (policy && policy.replicationFactor !== undefined) {
          if (nodeList.length !== policy.replicationFactor) {
            violations.push(
              `Partition ${partitionId} has ${nodeList.length} replicas, ` +
              `but policy requires ${policy.replicationFactor}`,
            );
          }
        }

        // Check minimum replicas if specified
        if (policy && policy.minReplicas !== undefined) {
          if (nodeList.length < policy.minReplicas) {
            violations.push(
              `Partition ${partitionId} has ${nodeList.length} replicas, ` +
              `but policy requires minimum ${policy.minReplicas}`,
            );
          }
        }

        // Check maximum replicas if specified
        if (policy && policy.maxReplicas !== undefined) {
          if (nodeList.length > policy.maxReplicas) {
            violations.push(
              `Partition ${partitionId} has ${nodeList.length} replicas, ` +
              `but policy allows maximum ${policy.maxReplicas}`,
            );
          }
        }
      }
    }

    return {
      valid: violations.length === 0,
      violations,
    };
  }

  /**
   * Calculate replica count per node.
   * @param {Object} assignments - Current partition assignments.
   * @param {string[]} allNodes - All nodes to consider.
   * @return {Object} Map of nodeId to replica count.
   * @private
   */
  _calculateNodeReplicaCounts(assignments, allNodes) {
    const counts = {};

    // Initialize all nodes with 0
    for (const nodeId of allNodes) {
      counts[nodeId] = 0;
    }

    // Count replicas per node
    for (const nodeList of Object.values(assignments)) {
      for (const nodeId of nodeList) {
        if (counts[nodeId] !== undefined) {
          counts[nodeId]++;
        }
      }
    }

    return counts;
  }

  /**
   * Get set of partitions currently on a node.
   * @param {Object} assignments - Current partition assignments.
   * @param {string} nodeId - The node ID.
   * @return {Set<string>} Set of partition IDs.
   * @private
   */
  _getPartitionsOnNode(assignments, nodeId) {
    const partitions = new Set();

    for (const [partitionId, nodeList] of Object.entries(assignments)) {
      if (nodeList.includes(nodeId)) {
        partitions.add(partitionId);
      }
    }

    return partitions;
  }

  /**
   * Build proposed assignments by applying replica pulls.
   * @param {Object} currentAssignments - Current partition assignments.
   * @param {{partitionId: string, fromNode: string}[]} replicasToPull - Replicas to pull.
   * @param {string} thisNodeId - The ID of this node.
   * @return {Object} Proposed assignments.
   * @private
   */
  _buildProposedAssignments(currentAssignments, replicasToPull, thisNodeId) {
    // Deep copy current assignments
    const proposed = {};
    for (const [partitionId, nodeList] of Object.entries(currentAssignments)) {
      proposed[partitionId] = [...nodeList];
    }

    // Apply each replica pull
    for (const {partitionId, fromNode} of replicasToPull) {
      const nodeList = proposed[partitionId];
      if (!nodeList) {
        continue;
      }

      // Replace fromNode with thisNodeId
      const idx = nodeList.indexOf(fromNode);
      if (idx !== -1) {
        nodeList[idx] = thisNodeId;
      }
    }

    return proposed;
  }

  /**
   * Extract table name from partition ID.
   * @param {string} partitionId - The partition ID (e.g., 'tables-p1').
   * @return {string} The table name.
   * @private
   */
  _extractTableName(partitionId) {
    // Partition IDs are typically formatted as '{tableName}-p{number}'
    const match = partitionId.match(/^(.+)-p\d+$/);
    if (match) {
      return match[1];
    }
    // Fallback: return the whole partition ID
    return partitionId;
  }

  /**
   * Create replicas locally based on accepted epoch.
   * This method creates local storage for the given partition IDs.
   * Requirements: 4.7
   *
   * @param {string[]} partitionIds - Partitions to create replicas for.
   * @return {Promise<{success: boolean, created: string[], failed: string[]}>}
   */
  async createLocalReplicas(partitionIds) {
    if (!Array.isArray(partitionIds) || partitionIds.length === 0) {
      return {
        success: true,
        created: [],
        failed: [],
      };
    }

    const created = [];
    const failed = [];

    for (const partitionId of partitionIds) {
      try {
        // Track the replica as creating
        this._localReplicas.set(partitionId, {
          partitionId,
          status: ReplicaStatus.CREATING,
          createdAt: Date.now(),
        });

        // If we have a replica handler, use it to create the replica
        if (this._replicaHandler) {
          const result = await this._replicaHandler.handleCreateReplica({
            partitionId,
            replicaId: `${partitionId}-${this._nodeId}`,
            nodeId: this._nodeId,
          });

          if (result.status === 'error') {
            throw new Error(result.error || 'Replica creation failed');
          }
        }

        // Update status to created
        const replica = this._localReplicas.get(partitionId);
        if (replica) {
          replica.status = ReplicaStatus.SYNCING;
        }

        created.push(partitionId);

        this.emit('replicaCreated', {
          partitionId,
          nodeId: this._nodeId,
        });
      } catch (error) {
        // Mark as failed
        const replica = this._localReplicas.get(partitionId);
        if (replica) {
          replica.status = ReplicaStatus.FAILED;
          replica.error = error.message;
        }

        failed.push(partitionId);

        this.emit('replicaCreationFailed', {
          partitionId,
          nodeId: this._nodeId,
          error: error.message,
        });
      }
    }

    return {
      success: failed.length === 0,
      created,
      failed,
    };
  }

  /**
   * Sync data from existing replicas on source nodes.
   * Implements retry logic for failed syncs.
   * Requirements: 4.9, 4.10
   *
   * @param {string} partitionId - Partition to sync data for.
   * @param {string[]} sourceNodes - Nodes that have existing replicas.
   * @return {Promise<{success: boolean, syncedFrom?: string, error?: string}>}
   */
  async syncReplicaData(partitionId, sourceNodes) {
    if (!partitionId || typeof partitionId !== 'string') {
      return {
        success: false,
        error: 'Invalid partitionId',
      };
    }

    if (!Array.isArray(sourceNodes) || sourceNodes.length === 0) {
      return {
        success: false,
        error: 'No source nodes provided',
      };
    }

    // Filter out this node from source nodes
    const validSourceNodes = sourceNodes.filter((n) => n !== this._nodeId);

    if (validSourceNodes.length === 0) {
      return {
        success: false,
        error: 'No valid source nodes available',
      };
    }

    // Update replica status to syncing
    const replica = this._localReplicas.get(partitionId);
    if (replica) {
      replica.status = ReplicaStatus.SYNCING;
    }

    let lastError = null;

    // Try each source node with retries
    for (const sourceNode of validSourceNodes) {
      for (let attempt = 1; attempt <= this._syncRetryAttempts; attempt++) {
        try {
          await this._syncFromNode(partitionId, sourceNode);

          // Update replica status to active
          if (replica) {
            replica.status = ReplicaStatus.ACTIVE;
            replica.syncedFrom = sourceNode;
          }

          this.emit('replicaSynced', {
            partitionId,
            nodeId: this._nodeId,
            sourceNode,
          });

          return {
            success: true,
            syncedFrom: sourceNode,
          };
        } catch (error) {
          lastError = error;

          // If not the last attempt, wait before retrying
          if (attempt < this._syncRetryAttempts) {
            await this._delay(this._syncRetryDelayMs);
          }
        }
      }
    }

    // All attempts failed - mark replica as failed
    if (replica) {
      replica.status = ReplicaStatus.FAILED;
      replica.error = lastError?.message || 'Sync failed from all source nodes';
    }

    this.emit('replicaSyncFailed', {
      partitionId,
      nodeId: this._nodeId,
      error: lastError?.message || 'Sync failed from all source nodes',
    });

    return {
      success: false,
      error: lastError?.message || 'Sync failed from all source nodes',
    };
  }

  /**
   * Sync data from a specific source node.
   * @param {string} partitionId - Partition to sync.
   * @param {string} sourceNode - Node to sync from.
   * @return {Promise<void>}
   * @private
   */
  async _syncFromNode(partitionId, sourceNode) {
    // If we have an RPC client, use it to request data sync
    if (this._rpcClient) {
      const response = await this._rpcClient.send(sourceNode, {
        type: 'SYNC_REPLICA_DATA',
        partitionId,
        targetNode: this._nodeId,
      });

      if (response.status === 'error') {
        throw new Error(response.error || 'Sync request failed');
      }
    }

    // If no RPC client, just emit an event for external handling
    this.emit('syncRequested', {
      partitionId,
      sourceNode,
      targetNode: this._nodeId,
    });
  }

  /**
   * Delay helper for retry logic.
   * @param {number} ms - Milliseconds to delay.
   * @return {Promise<void>}
   * @private
   */
  _delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get the status of a local replica.
   * @param {string} partitionId - Partition ID.
   * @return {Object|null} Replica info or null if not found.
   */
  getLocalReplicaStatus(partitionId) {
    return this._localReplicas.get(partitionId) || null;
  }

  /**
   * Get all local replicas.
   * @return {Map<string, Object>} Map of partition ID to replica info.
   */
  getAllLocalReplicas() {
    return new Map(this._localReplicas);
  }

  /**
   * Get the node ID of this assigner.
   * @return {string} The node ID.
   */
  getNodeId() {
    return this._nodeId;
  }

  /**
   * Get the maximum replicas to pull per proposal.
   * @return {number} Maximum replicas to pull.
   */
  getMaxReplicasToPull() {
    return this._maxReplicasToPull;
  }
}

export {
  PullBasedReplicaAssigner,
  PlacementPolicyViolationError,
};
