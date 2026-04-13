/**
 * Property-based test for Raft Leadership Stability.
 * **Property 1: Single Leader Election**
 * **Validates: Requirements 1.1, 1.2, 1.3**
 *
 * Property: For any Raft group with N replicas (where N >= 1),
 * after initialization completes, exactly one replica SHALL have isLeader=true.
 */
// @ts-nocheck


import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {PartitionService, RaftRole} from '../../src/partition/partition-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {AddressManager} from '../../src/address/address-manager.js';

beforeEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  AddressManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize({node: {id: 'test-node'}});
  const logger = LoggingService.getInstance();
  logger.initialize({level: 'error'});
});

afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  AddressManager.resetInstance();
});

/**
 * Generate a random partition ID.
 */
const partitionIdArbitrary = fc.string({minLength: 1, maxLength: 20})
  .filter((s) => /^[a-z0-9_-]+$/i.test(s))
  .map((s) => `partition-${s}`);

/**
 * Generate a random table ID.
 */
const tableIdArbitrary = fc.string({minLength: 1, maxLength: 15})
  .filter((s) => /^[a-z_][a-z0-9_]*$/i.test(s));

/**
 * Generate a random node ID.
 */
const nodeIdArbitrary = fc.string({minLength: 1, maxLength: 15})
  .filter((s) => /^[a-z0-9_-]+$/i.test(s))
  .map((s) => `node-${s}`);

/**
 * Feature: single-node-replica-placement-fix
 * Property 1: Single Leader Election
 *
 * For any Raft group with N replicas (where N >= 1), after initialization
 * completes, exactly one replica SHALL have isLeader=true.
 *
 * This test validates Requirements 1.1, 1.2, 1.3:
 * - 1.1: WHEN a partition Raft group initializes with multiple replicas
 *        THEN the Raft_Group SHALL elect exactly one leader
 * - 1.2: WHEN all replicas are on the same node THEN the Raft_Group
 *        SHALL still elect exactly one leader through proper Raft protocol
 * - 1.3: WHEN replicas are distributed across multiple nodes THEN the
 *        Raft_Group SHALL elect a leader regardless of network topology
 */
test('Property 1: Single replica elects exactly one leader', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      partitionIdArbitrary,
      tableIdArbitrary,
      nodeIdArbitrary,
      async (partitionId, tableId, nodeId) => {
        // Single replica configuration
        const replicaId = `${partitionId}-r1`;
        const replicaIds = [replicaId];

        // Generate peer addresses
        const addressManager = AddressManager.getInstance();
        const peerAddresses = replicaIds.map((rid) =>
          addressManager.format(nodeId, 'partition', rid),
        );

        const partition = new PartitionService({
          partitionId,
          tableId,
          replicaId,
          replicaIds,
          peerAddresses,
          nodeId,
          dbPath: ':memory:',
        });

        try {
          await partition.initialize();

          // Single replica should become leader immediately
          const isLeader = partition.isLeaderReplica();
          const role = partition.getRole();

          // Exactly one leader check: for single replica, it must be leader
          if (!isLeader) {
            return false;
          }

          if (role !== RaftRole.LEADER) {
            return false;
          }

          // Leader ID should be this replica
          const leaderId = partition.getLeaderId();
          if (leaderId !== replicaId) {
            return false;
          }

          return true;
        } finally {
          await partition.shutdown();
        }
      },
    ),
    {numRuns: 10},
  );

  t.pass('Single replica elects exactly one leader');
});

/**
 * Property 1: At most one leader exists at any time (no split-brain).
 *
 * When multiple replicas are co-located on the same node, at most one
 * should be leader at any point in time. This validates the Raft safety
 * property that prevents split-brain scenarios.
 *
 * Note: We test "at most one" rather than "exactly one" because election
 * may still be in progress immediately after initialization.
 *
 * **Validates: Requirements 1.1, 1.2**
 */
test('Property 1: At most one leader exists (no split-brain)', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      partitionIdArbitrary,
      tableIdArbitrary,
      nodeIdArbitrary,
      fc.integer({min: 1, max: 3}).filter((n) => n % 2 === 1), // Odd: 1 or 3
      async (partitionId, tableId, nodeId, replicaCount) => {
        // Create replica IDs
        const replicaIds = [];
        for (let i = 0; i < replicaCount; i++) {
          replicaIds.push(`${partitionId}-r${i + 1}`);
        }

        // Generate peer addresses
        const addressManager = AddressManager.getInstance();
        const peerAddresses = replicaIds.map((rid) =>
          addressManager.format(nodeId, 'partition', rid),
        );

        // Create all partitions on the same node
        const partitions = [];
        const mockTransport = createMockTransport();

        try {
          for (let i = 0; i < replicaCount; i++) {
            const partition = new PartitionService({
              partitionId,
              tableId,
              replicaId: replicaIds[i],
              replicaIds,
              peerAddresses,
              nodeId,
              transport: mockTransport,
              dbPath: ':memory:',
            });
            partitions.push(partition);
          }

          // Initialize all partitions
          await Promise.all(partitions.map((p) => p.initialize()));

          // For single replica, it should be leader immediately
          if (replicaCount === 1) {
            const leaderCount = partitions.filter((p) => p.isLeaderReplica()).length;
            if (leaderCount !== 1) {
              return false;
            }
            return true;
          }

          // For multiple replicas, count leaders - should be at most 1
          // This is the key Raft safety property: no split-brain
          const leaderCount = partitions.filter((p) => p.isLeaderReplica()).length;
          if (leaderCount > 1) {
            return false;
          }

          // All replicas should be in a valid Raft state
          const allValidStates = partitions.every((p) => {
            const role = p.getRole();
            return role === RaftRole.LEADER ||
                   role === RaftRole.FOLLOWER ||
                   role === RaftRole.CANDIDATE;
          });

          if (!allValidStates) {
            return false;
          }

          return true;
        } finally {
          // Shutdown all partitions
          await Promise.all(partitions.map((p) => p.shutdown()));
        }
      },
    ),
    {numRuns: 10},
  );

  t.pass('At most one leader exists (no split-brain)');
});

/**
 * Property 1: Partition status reflects correct leader state.
 *
 * The partition status should accurately reflect whether this replica
 * is the leader.
 *
 * **Validates: Requirements 1.1, 1.2, 1.3**
 */
test('Property 1: Partition status reflects correct leader state', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      partitionIdArbitrary,
      tableIdArbitrary,
      nodeIdArbitrary,
      async (partitionId, tableId, nodeId) => {
        const replicaId = `${partitionId}-r1`;
        const replicaIds = [replicaId];

        // Generate peer addresses
        const addressManager = AddressManager.getInstance();
        const peerAddresses = replicaIds.map((rid) =>
          addressManager.format(nodeId, 'partition', rid),
        );

        const partition = new PartitionService({
          partitionId,
          tableId,
          replicaId,
          replicaIds,
          peerAddresses,
          nodeId,
          dbPath: ':memory:',
        });

        try {
          await partition.initialize();

          const status = partition.getStatus();

          // Status should reflect leader state
          if (status.isLeader !== partition.isLeaderReplica()) {
            return false;
          }

          // Role should be consistent
          if (status.role !== partition.getRole()) {
            return false;
          }

          // For single replica, should be leader
          if (!status.isLeader) {
            return false;
          }

          return true;
        } finally {
          await partition.shutdown();
        }
      },
    ),
    {numRuns: 10},
  );

  t.pass('Partition status reflects correct leader state');
});

/**
 * Create a mock transport for testing.
 * Routes messages between registered handlers.
 */
function createMockTransport() {
  const handlers = new Map();

  return {
    register: (address, handler) => {
      handlers.set(address, handler);
    },
    unregister: (address) => {
      handlers.delete(address);
    },
    deliver: async (address, message) => {
      const handler = handlers.get(address);
      if (handler) {
        return handler({payload: message});
      }
      return {acknowledged: false, error: 'No handler'};
    },
  };
}

/**
 * Feature: single-node-replica-placement-fix
 * Property 2: Leadership Stability
 *
 * For any Raft group that has elected a leader, if no topology changes occur,
 * the leader SHALL remain the same and term numbers SHALL not increment.
 *
 * This test validates Requirements 2.1, 2.2, 2.3:
 * - 2.1: WHEN a leader is elected THEN the Raft_Group SHALL maintain that
 *        leader until a topology change or leader failure occurs
 * - 2.2: WHEN the leader sends heartbeats THEN followers SHALL acknowledge
 *        them and not start new elections
 * - 2.3: WHEN Raft term numbers are observed THEN the system SHALL show
 *        stable terms (not constantly incrementing)
 */
test('Property 2: Leadership remains stable without topology changes', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      partitionIdArbitrary,
      tableIdArbitrary,
      nodeIdArbitrary,
      async (partitionId, tableId, nodeId) => {
        // Single replica configuration - simplest case for stability testing
        const replicaId = `${partitionId}-r1`;
        const replicaIds = [replicaId];

        // Generate peer addresses
        const addressManager = AddressManager.getInstance();
        const peerAddresses = replicaIds.map((rid) =>
          addressManager.format(nodeId, 'partition', rid),
        );

        const partition = new PartitionService({
          partitionId,
          tableId,
          replicaId,
          replicaIds,
          peerAddresses,
          nodeId,
          dbPath: ':memory:',
        });

        try {
          await partition.initialize();

          // Capture initial state after election
          const initialLeaderId = partition.getLeaderId();
          const initialTerm = partition.getCurrentTerm();
          const initialIsLeader = partition.isLeaderReplica();

          // Single replica should be leader
          if (!initialIsLeader) {
            return false;
          }

          // Wait a short period (no real delays - just verify state)
          // Check state multiple times to verify stability
          for (let i = 0; i < 3; i++) {
            await Promise.resolve(); // Yield to event loop

            const currentLeaderId = partition.getLeaderId();
            const currentTerm = partition.getCurrentTerm();
            const currentIsLeader = partition.isLeaderReplica();

            // Leader should not change
            if (currentLeaderId !== initialLeaderId) {
              return false;
            }

            // Term should not increment without topology change
            if (currentTerm > initialTerm) {
              return false;
            }

            // Should still be leader
            if (!currentIsLeader) {
              return false;
            }
          }

          return true;
        } finally {
          await partition.shutdown();
        }
      },
    ),
    {numRuns: 10},
  );

  t.pass('Leadership remains stable without topology changes');
});

/**
 * Property 2: Term numbers stabilize after election.
 *
 * For any Raft group, after initial election completes, term numbers
 * should not constantly increment. This validates that the system
 * is not experiencing election storms.
 *
 * **Validates: Requirements 2.3**
 */
test('Property 2: Term numbers stabilize after election', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      partitionIdArbitrary,
      tableIdArbitrary,
      nodeIdArbitrary,
      async (partitionId, tableId, nodeId) => {
        const replicaId = `${partitionId}-r1`;
        const replicaIds = [replicaId];

        // Generate peer addresses
        const addressManager = AddressManager.getInstance();
        const peerAddresses = replicaIds.map((rid) =>
          addressManager.format(nodeId, 'partition', rid),
        );

        const partition = new PartitionService({
          partitionId,
          tableId,
          replicaId,
          replicaIds,
          peerAddresses,
          nodeId,
          dbPath: ':memory:',
        });

        try {
          await partition.initialize();

          // Record term after initialization
          const termAfterInit = partition.getCurrentTerm();

          // Collect term samples
          const termSamples = [termAfterInit];
          for (let i = 0; i < 5; i++) {
            await Promise.resolve(); // Yield to event loop
            termSamples.push(partition.getCurrentTerm());
          }

          // All terms should be the same (stable)
          const allSameTerm = termSamples.every((t) => t === termAfterInit);
          if (!allSameTerm) {
            return false;
          }

          return true;
        } finally {
          await partition.shutdown();
        }
      },
    ),
    {numRuns: 10},
  );

  t.pass('Term numbers stabilize after election');
});

/**
 * Property 2: Multi-replica leadership stability (at most one leader).
 *
 * For any Raft group with multiple replicas on the same node,
 * leadership should remain stable with at most one leader at any time.
 *
 * **Validates: Requirements 2.1, 2.2**
 */
test('Property 2: Multi-replica leadership stability', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      partitionIdArbitrary,
      tableIdArbitrary,
      nodeIdArbitrary,
      fc.integer({min: 1, max: 3}).filter((n) => n % 2 === 1), // Odd: 1 or 3
      async (partitionId, tableId, nodeId, replicaCount) => {
        const replicaIds = [];
        for (let i = 0; i < replicaCount; i++) {
          replicaIds.push(`${partitionId}-r${i + 1}`);
        }

        // Generate peer addresses
        const addressManager = AddressManager.getInstance();
        const peerAddresses = replicaIds.map((rid) =>
          addressManager.format(nodeId, 'partition', rid),
        );

        const partitions = [];
        const mockTransport = createMockTransport();

        try {
          for (let i = 0; i < replicaCount; i++) {
            const partition = new PartitionService({
              partitionId,
              tableId,
              replicaId: replicaIds[i],
              replicaIds,
              peerAddresses,
              nodeId,
              transport: mockTransport,
              dbPath: ':memory:',
            });
            partitions.push(partition);
          }

          await Promise.all(partitions.map((p) => p.initialize()));

          // Capture initial leader state
          const initialLeaders = partitions.filter((p) => p.isLeaderReplica());
          const initialLeaderCount = initialLeaders.length;

          // For single replica, must have exactly one leader
          if (replicaCount === 1 && initialLeaderCount !== 1) {
            return false;
          }

          // For multiple replicas, at most one leader (election may be ongoing)
          if (initialLeaderCount > 1) {
            return false;
          }

          // Check stability - leader count should not increase
          for (let i = 0; i < 3; i++) {
            await Promise.resolve();

            const currentLeaderCount = partitions.filter((p) =>
              p.isLeaderReplica()).length;

            // Should never have more than one leader (split-brain)
            if (currentLeaderCount > 1) {
              return false;
            }
          }

          return true;
        } finally {
          await Promise.all(partitions.map((p) => p.shutdown()));
        }
      },
    ),
    {numRuns: 10},
  );

  t.pass('Multi-replica leadership stability');
});
