/**
 * Raft Leader Election Integration Test.
 *
 * This test verifies that Raft leader election works correctly with
 * real Raft consensus. It specifically tests:
 * 1. Creating a 3-replica Raft group
 * 2. Verifying exactly one leader is elected
 * 3. Verifying followers recognize the leader
 * 4. Verifying leader election completes within expected timeout
 *
 * Requirements: 7.3, 7.4
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import {BootstrapService} from '../../src/bootstrap/bootstrap-service.js';
import {
  initializeTestEnvironment,
  cleanupTestEnvironment,
  TEST_CONFIG,
  stopAllRebalancers,
  gracefulShutdown,
  waitForPartitionLeaderElection,
  getPartitionServices,
  getPartitionId,
  isPartitionLeader,
} from './helpers/cluster-test-helpers.js';
import {createPortAllocator} from '../../src/test-helpers/port-allocator.js';

const ports = createPortAllocator(import.meta.url);

/**
 * Get a unique port for this test file.
 * @returns {number} Unique port number
 */
function getUniquePort() {
  return ports.getPort();
}

/**
 * Generate a unique UUID based on a base and counter.
 * @param {number} counter - Counter value
 * @returns {string} UUID string
 */
function generateUniqueNodeId(counter) {
  const hex = counter.toString(16).padStart(12, '0');
  return `880e8400-e29b-41d4-a716-${hex}`;
}

// Counter for generating unique node IDs
let nodeIdCounter = 0xc00000000000;

test('Raft leader election', {timeout: 30000}, async (t) => {
  t.beforeEach(() => {
    initializeTestEnvironment();
  });

  t.afterEach(async () => {
    await cleanupTestEnvironment();
  });

  await t.test('seed node creates 3-replica Raft groups with leader election', async (t) => {
    // =========================================================================
    // This test verifies that when a seed node bootstraps, it creates
    // 3-replica Raft groups for system partitions and elects leaders.
    //
    // Requirements: 7.3, 7.4
    // =========================================================================

    const seedNodeId = generateUniqueNodeId(nodeIdCounter++);
    const seedWsPort = getUniquePort();

    const bootstrapService = new BootstrapService({
      nodeId: seedNodeId,
      nodeAddress: `ws://localhost:${seedWsPort}`,
      wsPort: seedWsPort,
      config: {
        ...TEST_CONFIG.bootstrap,
        leadershipWaitTimeoutMs: 5000,
      },
    });

    let bootstrapResult;

    try {
      // =========================================================================
      // PHASE 1: Bootstrap seed node with real Raft partitions
      // =========================================================================
      const bootstrapStartTime = Date.now();
      bootstrapResult = await bootstrapService.bootstrap();
      const bootstrapElapsedMs = Date.now() - bootstrapStartTime;

      t.equal(bootstrapResult.success, true, 'seed node bootstrap should succeed');
      t.ok(bootstrapResult.partitionServices.size > 0, 'seed should have partitions');
      t.ok(
        bootstrapElapsedMs < 15000,
        `bootstrap should complete within 15s (took ${bootstrapElapsedMs}ms)`,
      );

      // =========================================================================
      // PHASE 2: Verify 3-replica groups are created
      // =========================================================================
      // Count replicas per partition
      const replicasPerPartition = new Map();
      for (const service of getPartitionServices(bootstrapResult, bootstrapService)) {
        const partitionId = getPartitionId(service);
        const count = replicasPerPartition.get(partitionId) || 0;
        replicasPerPartition.set(partitionId, count + 1);
      }

      // Verify key system partitions have 3 replicas
      const systemPartitions = ['nodes-p1', 'services-p1', 'tables-p1', 'partitions-p1'];
      for (const partitionId of systemPartitions) {
        const replicaCount = replicasPerPartition.get(partitionId) || 0;
        t.equal(
          replicaCount,
          3,
          `${partitionId} should have 3 replicas (has ${replicaCount})`,
        );
      }

      // =========================================================================
      // PHASE 3: Wait for leader election on system partitions
      // =========================================================================
      const electionResults = [];

      for (const partitionId of systemPartitions) {
        const electionStart = Date.now();
        const leader = await waitForPartitionLeaderElection(
          bootstrapResult,
          bootstrapService,
          partitionId,
          5000,
        );
        const electionTime = Date.now() - electionStart;

        electionResults.push({
          partitionId,
          hasLeader: !!leader,
          electionTimeMs: electionTime,
        });
      }

      // Verify all partitions elected leaders
      for (const result of electionResults) {
        t.ok(
          result.hasLeader,
          `${result.partitionId} should have elected a leader`,
        );
        t.ok(
          result.electionTimeMs < 5000,
          `${result.partitionId} election within 5s (took ${result.electionTimeMs}ms)`,
        );
      }

      // =========================================================================
      // PHASE 4: Verify exactly one leader per partition
      // =========================================================================
      const partitionLeaderCounts = new Map();

      for (const service of getPartitionServices(bootstrapResult, bootstrapService)) {
        const partitionId = getPartitionId(service);
        const isLeader = await isPartitionLeader(service, bootstrapService);

        if (isLeader) {
          const count = partitionLeaderCounts.get(partitionId) || 0;
          partitionLeaderCounts.set(partitionId, count + 1);
        }
      }

      for (const partitionId of systemPartitions) {
        const leaderCount = partitionLeaderCounts.get(partitionId) || 0;
        t.equal(
          leaderCount,
          1,
          `${partitionId} should have exactly 1 leader (has ${leaderCount})`,
        );
      }

      // =========================================================================
      // PHASE 5: Verify total time is reasonable
      // =========================================================================
      const totalTime = Date.now() - bootstrapStartTime;
      t.ok(
        totalTime < 20000,
        `total bootstrap and election should complete within 20s (took ${totalTime}ms)`,
      );
    } finally {
      if (bootstrapResult?.partitionServices) {
        stopAllRebalancers(bootstrapResult.partitionServices);
      }

      await new Promise((resolve) => setTimeout(resolve, 50));
      await gracefulShutdown(bootstrapService, bootstrapResult, null);
    }
  });

  await t.test('followers recognize elected leader', async (t) => {
    // =========================================================================
    // This test verifies that after leader election, followers correctly
    // identify who the leader is.
    //
    // Requirements: 7.3, 7.4
    // =========================================================================

    const seedNodeId = generateUniqueNodeId(nodeIdCounter++);
    const seedWsPort = getUniquePort();

    const bootstrapService = new BootstrapService({
      nodeId: seedNodeId,
      nodeAddress: `ws://localhost:${seedWsPort}`,
      wsPort: seedWsPort,
      config: {
        ...TEST_CONFIG.bootstrap,
        leadershipWaitTimeoutMs: 5000,
      },
    });

    let bootstrapResult;

    try {
      // =========================================================================
      // PHASE 1: Bootstrap seed node
      // =========================================================================
      bootstrapResult = await bootstrapService.bootstrap();
      t.equal(bootstrapResult.success, true, 'seed bootstrap should succeed');

      // Wait for leader election on nodes-p1
      const leader = await waitForPartitionLeaderElection(
        bootstrapResult,
        bootstrapService,
        'nodes-p1',
        5000,
      );
      t.ok(leader, 'nodes-p1 should elect a leader');

      // =========================================================================
      // PHASE 2: Find leader and followers for nodes-p1
      // =========================================================================
      let leaderService = null;
      const followerServices = [];

      for (const service of bootstrapResult.partitionServices.values()) {
        if (service.partitionId === 'nodes-p1') {
          if (service.isLeader) {
            leaderService = service;
          } else {
            followerServices.push(service);
          }
        }
      }

      // =========================================================================
      // PHASE 3: Verify leader/follower relationship
      // =========================================================================
      t.ok(leaderService, 'should have a leader for nodes-p1');
      t.ok(followerServices.length > 0, 'should have followers for nodes-p1');

      if (leaderService) {
        // Leader should know it's the leader
        t.equal(leaderService.isLeader, true, 'leader should know it is leader');

        // Leader's getLeaderId should return a value containing its replicaId
        const leaderReportedId = leaderService.getLeaderId();
        t.ok(leaderReportedId, 'leader should report a leader ID');
        t.ok(
          leaderReportedId.includes(leaderService.replicaId),
          'leader should report itself as leader',
        );

        // Verify followers know who the leader is
        let followersWithLeader = 0;
        for (const follower of followerServices) {
          const followerLeaderId = follower.getLeaderId();
          if (followerLeaderId) {
            followersWithLeader++;
            // Follower's leader ID should contain the leader's replica ID
            t.ok(
              followerLeaderId.includes(leaderService.replicaId),
              `follower ${follower.replicaId} should recognize leader`,
            );
          }
        }

        // At least some followers should recognize the leader
        const followerCount = followerServices.length;
        t.ok(
          followersWithLeader > 0,
          `some followers should recognize leader (${followersWithLeader}/${followerCount})`,
        );
      }
    } finally {
      if (bootstrapResult?.partitionServices) {
        stopAllRebalancers(bootstrapResult.partitionServices);
      }

      await new Promise((resolve) => setTimeout(resolve, 50));
      await gracefulShutdown(bootstrapService, bootstrapResult, null);
    }
  });

  await t.test('leader election completes within expected timeout', async (t) => {
    // =========================================================================
    // This test verifies that leader election completes within the configured
    // timeout for all system partitions.
    //
    // Requirements: 7.3
    // =========================================================================

    const seedNodeId = generateUniqueNodeId(nodeIdCounter++);
    const seedWsPort = getUniquePort();

    const bootstrapService = new BootstrapService({
      nodeId: seedNodeId,
      nodeAddress: `ws://localhost:${seedWsPort}`,
      wsPort: seedWsPort,
      config: {
        ...TEST_CONFIG.bootstrap,
        leadershipWaitTimeoutMs: 3000,
      },
    });

    let bootstrapResult;

    try {
      // =========================================================================
      // PHASE 1: Bootstrap and measure leader election time
      // =========================================================================
      const startTime = Date.now();
      bootstrapResult = await bootstrapService.bootstrap();
      t.equal(bootstrapResult.success, true, 'bootstrap should succeed');

      // Wait for leader election on all system partitions
      const systemPartitions = [
        'nodes-p1',
        'services-p1',
        'tables-p1',
        'partitions-p1',
        'message_groups-p1',
        'replica_operations-p1',
      ];

      for (const partitionId of systemPartitions) {
        const electionStart = Date.now();
        const leader = await waitForPartitionLeaderElection(
          bootstrapResult,
          bootstrapService,
          partitionId,
          5000,
        );
        const electionTime = Date.now() - electionStart;

        t.ok(leader, `${partitionId} should have elected a leader`);
        t.ok(
          electionTime < 5000,
          `${partitionId} election should complete within 5s (took ${electionTime}ms)`,
        );
      }

      // =========================================================================
      // PHASE 2: Verify total time is reasonable
      // =========================================================================
      const totalTime = Date.now() - startTime;
      t.ok(
        totalTime < 20000,
        `total bootstrap and election should complete within 20s (took ${totalTime}ms)`,
      );
    } finally {
      if (bootstrapResult?.partitionServices) {
        stopAllRebalancers(bootstrapResult.partitionServices);
      }

      await new Promise((resolve) => setTimeout(resolve, 50));
      await gracefulShutdown(bootstrapService, bootstrapResult, null);
    }
  });
});
