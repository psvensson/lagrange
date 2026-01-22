/**
 * Property-based test for Message Group Replica Distribution.
 * Property 8: For any cluster configuration, every node should have at least
 * one local message group replica, and the rebalancer should create/move
 * replicas to maintain this invariant as nodes join or leave.
 * Validates: Requirements 4.3, 7.6, 7.7, 8.6
 */

import {test, beforeEach, afterEach} from 'tap';
import fc from 'fast-check';
import {MessageGroupService} from '../../src/message-group/message-group-service.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {MessageRouter} from '../../src/transport/message-router.js';

// Port counter for unique ports per test
let testPortCounter = 30000;

beforeEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize({node: {id: 'test-node'}});
  const logger = LoggingService.getInstance();
  logger.initialize({level: 'error'});
});

afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

/**
 * Create a real WebSocket transport for testing.
 * @return {Promise<{router: MessageRouter, nodeId: string, cleanup: Function}>}
 */
async function createTestTransport() {
  const port = testPortCounter++;
  const nodeId = `test-node-${port}`;
  const router = new MessageRouter({nodeId, wsPort: port});
  await router.initialize({startServer: true});
  return {
    router,
    nodeId,
    cleanup: async () => {
      await router.shutdown();
    },
  };
}

/**
 * Simulates a cluster with nodes and message group replicas.
 * Used to test the distribution invariant.
 */
class ClusterSimulator {
  constructor() {
    this.nodes = new Map(); // nodeId -> {status, replicas: Set<replicaId>}
    this.messageGroups = new Map(); // groupId -> {replicas: Map<replicaId, nodeId>}
    this.replicaCount = 3; // Default replica count per message group
  }

  /**
   * Add a node to the cluster.
   * @param {string} nodeId - Node ID.
   */
  addNode(nodeId) {
    if (!this.nodes.has(nodeId)) {
      this.nodes.set(nodeId, {
        status: 'active',
        replicas: new Set(),
      });
    }
  }

  /**
   * Remove a node from the cluster.
   * @param {string} nodeId - Node ID.
   */
  removeNode(nodeId) {
    const node = this.nodes.get(nodeId);
    if (node) {
      // Remove all replicas on this node
      for (const replicaId of node.replicas) {
        this.removeReplica(replicaId);
      }
      this.nodes.delete(nodeId);
    }
  }

  /**
   * Create a message group with replicas.
   * @param {string} groupId - Group ID.
   * @param {Array<string>} nodeIds - Node IDs for replicas.
   */
  createMessageGroup(groupId, nodeIds) {
    const replicas = new Map();
    for (let i = 0; i < nodeIds.length; i++) {
      const replicaId = `${groupId}-r${i}`;
      const nodeId = nodeIds[i];
      replicas.set(replicaId, nodeId);

      // Track replica on node
      const node = this.nodes.get(nodeId);
      if (node) {
        node.replicas.add(replicaId);
      }
    }
    this.messageGroups.set(groupId, {replicas});
  }

  /**
   * Remove a replica from the cluster.
   * @param {string} replicaId - Replica ID.
   */
  removeReplica(replicaId) {
    for (const group of this.messageGroups.values()) {
      if (group.replicas.has(replicaId)) {
        const replicaNodeId = group.replicas.get(replicaId);
        group.replicas.delete(replicaId);

        const node = this.nodes.get(replicaNodeId);
        if (node) {
          node.replicas.delete(replicaId);
        }
        break;
      }
    }
  }

  /**
   * Move a replica to a different node.
   * @param {string} replicaId - Replica ID.
   * @param {string} targetNodeId - Target node ID.
   */
  moveReplica(replicaId, targetNodeId) {
    for (const group of this.messageGroups.values()) {
      if (group.replicas.has(replicaId)) {
        const sourceNodeId = group.replicas.get(replicaId);

        // Remove from source node
        const sourceNode = this.nodes.get(sourceNodeId);
        if (sourceNode) {
          sourceNode.replicas.delete(replicaId);
        }

        // Add to target node
        group.replicas.set(replicaId, targetNodeId);
        const targetNode = this.nodes.get(targetNodeId);
        if (targetNode) {
          targetNode.replicas.add(replicaId);
        }
        break;
      }
    }
  }

  /**
   * Check if every node has at least one local replica.
   * @return {boolean} True if invariant holds.
   */
  everyNodeHasLocalReplica() {
    for (const [_nodeId, node] of this.nodes) {
      if (node.status === 'active' && node.replicas.size === 0) {
        return false;
      }
    }
    return true;
  }

  /**
   * Get nodes without local replicas.
   * @return {Array<string>} Node IDs without replicas.
   */
  getNodesWithoutReplicas() {
    const result = [];
    for (const [nodeId, node] of this.nodes) {
      if (node.status === 'active' && node.replicas.size === 0) {
        result.push(nodeId);
      }
    }
    return result;
  }

  /**
   * Find a message group with movable replicas (2+ on same node).
   * @return {Object|null} Group info with movable replica.
   */
  findMovableReplica() {
    for (const [groupId, group] of this.messageGroups) {
      const replicasByNode = new Map();

      for (const [replicaId, nodeId] of group.replicas) {
        if (!replicasByNode.has(nodeId)) {
          replicasByNode.set(nodeId, []);
        }
        replicasByNode.get(nodeId).push(replicaId);
      }

      for (const [nodeId, replicas] of replicasByNode) {
        if (replicas.length >= 2) {
          return {
            groupId,
            sourceNodeId: nodeId,
            replicaId: replicas[0],
          };
        }
      }
    }
    return null;
  }

  /**
   * Rebalance to ensure every node has a local replica.
   * Implements the bootstrap strategy from the design.
   */
  rebalance() {
    const nodesWithoutReplicas = this.getNodesWithoutReplicas();

    for (const targetNodeId of nodesWithoutReplicas) {
      // Strategy 1: Move replica from node with 2+ replicas
      const movable = this.findMovableReplica();
      if (movable) {
        this.moveReplica(movable.replicaId, targetNodeId);
        continue;
      }

      // Strategy 2: Create self-hosted message group
      const groupId = `mg-${targetNodeId}`;
      this.createMessageGroup(groupId, [
        targetNodeId,
        targetNodeId,
        targetNodeId,
      ]);
    }
  }

  /**
   * Get cluster state summary.
   * @return {Object} Cluster state.
   */
  getState() {
    const nodeStates = {};
    for (const [nodeId, node] of this.nodes) {
      nodeStates[nodeId] = {
        status: node.status,
        replicaCount: node.replicas.size,
      };
    }

    return {
      nodeCount: this.nodes.size,
      messageGroupCount: this.messageGroups.size,
      nodeStates,
      everyNodeHasReplica: this.everyNodeHasLocalReplica(),
    };
  }
}

/**
 * Feature: message-group, Property 8: Message Group Replica Distribution
 * For any cluster configuration, every node should have at least one
 * local message group replica.
 * Validates: Requirements 4.3, 7.6, 7.7, 8.6
 */
test('Property 8: Message Group Replica Distribution - seed node', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      // Generate seed node ID
      fc.uuid(),
      async (seedNodeId) => {
        const cluster = new ClusterSimulator();

        // Add seed node
        cluster.addNode(seedNodeId);

        // Create initial message group (3 replicas on seed node)
        cluster.createMessageGroup('mg-1', [seedNodeId, seedNodeId, seedNodeId]);

        // Property: Seed node should have local replica
        t.ok(
          cluster.everyNodeHasLocalReplica(),
          'Seed node should have local message group replica',
        );

        const state = cluster.getState();
        t.equal(state.nodeCount, 1, 'Should have 1 node');
        t.equal(state.messageGroupCount, 1, 'Should have 1 message group');
        t.equal(
          state.nodeStates[seedNodeId].replicaCount,
          3,
          'Seed node should have 3 replicas',
        );

        return true;
      },
    ),
    {numRuns: 10},
  );
});

/**
 * Feature: message-group, Property 8: Message Group Replica Distribution
 * When nodes join, rebalancing should ensure every node has a local replica.
 * Validates: Requirements 4.3, 7.6, 7.7, 8.6
 */
test('Property 8: Message Group Replica Distribution - node joining', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      // Generate node IDs for cluster
      fc.array(fc.uuid(), {minLength: 1, maxLength: 5}),
      async (nodeIds) => {
        const cluster = new ClusterSimulator();

        // Add seed node with initial message group
        const seedNodeId = nodeIds[0];
        cluster.addNode(seedNodeId);
        cluster.createMessageGroup('mg-1', [seedNodeId, seedNodeId, seedNodeId]);

        // Add remaining nodes one by one
        for (let i = 1; i < nodeIds.length; i++) {
          cluster.addNode(nodeIds[i]);
          cluster.rebalance();

          // Property: After each join, every node should have a local replica
          t.ok(
            cluster.everyNodeHasLocalReplica(),
            `After node ${i + 1} joins, every node should have local replica`,
          );
        }

        return true;
      },
    ),
    {numRuns: 10},
  );
});

/**
 * Feature: message-group, Property 8: Message Group Replica Distribution
 * Message groups should have exactly 3 replicas (odd number for Raft).
 * Validates: Requirements 4.3, 7.6, 7.7, 8.6
 */
test('Property 8: Message Group Replica Distribution - replica count', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      // Generate cluster size
      fc.integer({min: 1, max: 7}),
      async (clusterSize) => {
        const cluster = new ClusterSimulator();

        // Build cluster
        for (let i = 0; i < clusterSize; i++) {
          const nodeId = `node-${i}`;
          cluster.addNode(nodeId);

          if (i === 0) {
            // Seed node creates initial message group
            cluster.createMessageGroup('mg-1', [nodeId, nodeId, nodeId]);
          } else {
            cluster.rebalance();
          }
        }

        // Property: Each message group should have exactly 3 replicas
        for (const [groupId, group] of cluster.messageGroups) {
          t.equal(
            group.replicas.size,
            3,
            `Message group ${groupId} should have 3 replicas`,
          );
        }

        return true;
      },
    ),
    {numRuns: 10},
  );
});

/**
 * Feature: message-group, Property 8: Message Group Replica Distribution
 * The number of message groups should scale with cluster size.
 * Validates: Requirements 4.3, 7.6, 7.7, 8.6
 */
test('Property 8: Message Group Replica Distribution - scaling', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      // Generate cluster size
      fc.integer({min: 1, max: 10}),
      async (clusterSize) => {
        const cluster = new ClusterSimulator();

        // Build cluster
        for (let i = 0; i < clusterSize; i++) {
          const nodeId = `node-${i}`;
          cluster.addNode(nodeId);

          if (i === 0) {
            cluster.createMessageGroup('mg-1', [nodeId, nodeId, nodeId]);
          } else {
            cluster.rebalance();
          }
        }

        // Property: Number of message groups should be ceil(nodes / 3)
        // because each message group can serve up to 3 nodes
        const expectedMinGroups = Math.ceil(clusterSize / 3);
        t.ok(
          cluster.messageGroups.size >= expectedMinGroups,
          `Should have at least ${expectedMinGroups} message groups for ${clusterSize} nodes`,
        );

        // Property: Every node should have at least one replica
        t.ok(
          cluster.everyNodeHasLocalReplica(),
          'Every node should have local replica after scaling',
        );

        return true;
      },
    ),
    {numRuns: 10},
  );
});

/**
 * Feature: message-group, Property 8: Message Group Replica Distribution
 * MessageGroupService instances should be creatable for each replica.
 * Validates: Requirements 4.3, 7.6, 7.7, 8.6
 */
test('Property 8: Message Group Replica Distribution - service instantiation', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      // Generate replica configuration
      fc.record({
        groupId: fc.string({minLength: 3, maxLength: 20}).filter((s) => /^[a-z0-9-]+$/.test(s)),
        replicaIndex: fc.integer({min: 0, max: 2}),
      }),
      async (config) => {
        const {router, nodeId, cleanup} = await createTestTransport();
        try {
          const replicaId = `${config.groupId}-r${config.replicaIndex}`;
          const replicaIds = [
            `${config.groupId}-r0`,
            `${config.groupId}-r1`,
            `${config.groupId}-r2`,
          ];

          // Create message group service
          const service = new MessageGroupService({
            groupId: config.groupId,
            replicaId,
            nodeId,
            replicaIds,
            transport: router,
          });

          // Property: Service should be creatable with valid config
          t.ok(service, 'Service should be created');
          t.equal(service.groupId, config.groupId, 'Should have correct groupId');
          t.equal(service.replicaId, replicaId, 'Should have correct replicaId');
          t.equal(service.nodeId, nodeId, 'Should have correct nodeId');
          t.equal(service.replicaIds.length, 3, 'Should have 3 replica IDs');

          // Initialize and verify
          await service.initialize();
          t.ok(service.initialized, 'Service should be initialized');

          await service.shutdown();
        } finally {
          await cleanup();
        }

        return true;
      },
    ),
    {numRuns: 10},
  );
});
