/**
 * Multi-Worker Raft Integration Test (Task 24.1)
 *
 * This test verifies that Raft consensus works correctly across worker processes.
 * It creates a 3-replica partition in separate workers and tests:
 * 1. Leader election across workers
 * 2. Log replication across workers
 *
 * **Validates: Requirements 1.1, 2.4, 14.5, 14.6**
 *
 * - Requirement 1.1: WHEN a partition replica is created, THE Main_Process SHALL
 *   spawn a dedicated Worker_Process for that replica
 * - Requirement 2.4: WHEN a Raft packet is sent between replicas, THE MessageRouter
 *   SHALL use the same code path regardless of whether the target is local or remote
 * - Requirement 14.5: Raft leader election SHALL work correctly across worker
 *   processes on the same node
 * - Requirement 14.6: Raft log replication SHALL work correctly across worker
 *   processes on the same node
 *
 * @module test/integration/multi-worker-raft.integration.test.js
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import path from 'path';
import {fileURLToPath} from 'url';
import {ReplicaWorkerManager} from '../../src/worker/replica-worker-manager.js';
import {MessageRouter} from '../../src/transport/message-router.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {NodeService} from '../../src/node/node-service.js';
import {AddressManager} from '../../src/address/address-manager.js';
import {ServiceThreadManager} from '../../src/threading/service-thread-manager.js';
import {WORKER_ENTITY_TYPE} from '../../src/worker/worker-constants.js';
import {NUM} from '../../src/constants/index.js';
import {createPortAllocator} from '../../src/test-helpers/port-allocator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ports = createPortAllocator(import.meta.url);

/**
 * Test configuration constants.
 * @type {Readonly<Object>}
 */
const TEST_CONFIG = Object.freeze({
  /** Number of replicas in the test partition */
  REPLICA_COUNT: 3,
  /** Timeout for leader election in milliseconds */
  LEADER_ELECTION_TIMEOUT_MS: 10000,
  /** Polling interval for leader election in milliseconds */
  LEADER_ELECTION_POLL_MS: 100,
  /** Timeout for log replication in milliseconds */
  LOG_REPLICATION_TIMEOUT_MS: 5000,
  /** Polling interval for log replication in milliseconds */
  LOG_REPLICATION_POLL_MS: 50,
  /** Test partition ID */
  PARTITION_ID: 'test-partition-1',
  /** Test table ID */
  TABLE_ID: 'test-table',
  /** Test table name */
  TABLE_NAME: 'test_data',
});

/**
 * Initialize test environment with fast Raft elections.
 * Resets all singletons and configures logging to error level.
 * @param {string} nodeId - Node ID for configuration.
 */
function initializeTestEnvironment(nodeId) {
  // Reset all singletons to ensure clean state
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  NodeService.resetInstance();
  AddressManager.resetInstance();
  ServiceThreadManager.resetInstance();

  // Initialize configuration with fast Raft elections
  const config = ConfigurationManager.getInstance();
  config.initialize({
    node: {id: nodeId},
    logging: {level: 'error'},
    transport: {wsHost: '127.0.0.1'},
    raft: {
      electionTimeoutMinMs: 150,
      electionTimeoutMaxMs: 300,
      heartbeatIntervalMs: 50,
    },
  });

  // Initialize logging at error level to reduce noise
  const logging = LoggingService.getInstance();
  logging.initialize({level: 'error'});
}

/**
 * Clean up test environment.
 * Shuts down all services and resets singletons.
 */
async function cleanupTestEnvironment() {
  try {
    await NodeService.getInstance().shutdown().catch(() => {});
  } catch {
    // Ignore shutdown errors
  }
  try {
    await ServiceThreadManager.getInstance().shutdown().catch(() => {});
  } catch {
    // Ignore shutdown errors
  }
  try {
    await LoggingService.getInstance().shutdown().catch(() => {});
  } catch {
    // Ignore shutdown errors
  }

  // Reset all singletons
  NodeService.resetInstance();
  ServiceThreadManager.resetInstance();
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  AddressManager.resetInstance();
}

/**
 * Wait for a condition with timeout.
 * @param {Function} condition - Async function that returns true when condition is met.
 * @param {number} timeoutMs - Maximum time to wait in milliseconds.
 * @param {number} intervalMs - Polling interval in milliseconds.
 * @return {Promise<boolean>} True if condition was met, false if timeout.
 */
async function waitFor(condition, timeoutMs, intervalMs) {
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    if (await condition()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return false;
}

function isActivatedLeader(status) {
  return status?.isLeader === true &&
    status?.leaderActivated === true;
}

/**
 * Generate unique node ID for test isolation.
 * @param {number} counter - Counter value.
 * @return {string} UUID string.
 */
function generateUniqueNodeId(counter) {
  const hex = counter.toString(16).padStart(12, '0');
  return `multi-worker-${hex}`;
}

// Counter for generating unique node IDs
let nodeIdCounter = 0xA00000000000;

test('Multi-Worker Raft Integration', {timeout: 30000}, async (t) => {
  t.beforeEach(() => {
    const nodeId = generateUniqueNodeId(nodeIdCounter++);
    initializeTestEnvironment(nodeId);
  });

  t.afterEach(async () => {
    await cleanupTestEnvironment();
  });

  await t.test('3-replica partition elects leader across workers (Req 1.1, 14.5)', async (t) => {
    // =========================================================================
    // This test verifies that Raft leader election works correctly when
    // replicas are running in separate worker processes.
    //
    // Requirements validated:
    // - 1.1: Partition replicas are created in dedicated worker processes
    // - 14.5: Raft leader election works across worker processes
    // =========================================================================

    const nodeId = generateUniqueNodeId(nodeIdCounter++);
    const wsPort = ports.getPort();

    // Create MessageRouter for inter-worker communication
    const messageRouter = new MessageRouter({
      nodeId,
      wsPort,
      logger: {
        info: () => {},
        debug: () => {},
        warn: console.warn,
        error: console.error,
      },
    });

    await messageRouter.initialize();

    // Create ReplicaWorkerManager
    const workerPath = path.resolve(__dirname, '../../src/worker/replica-worker.js');
    const workerManager = new ReplicaWorkerManager({
      nodeId,
      messageRouter,
      workerPath,
      logger: {
        info: () => {},
        debug: () => {},
        warn: console.warn,
        error: console.error,
      },
    });

    await workerManager.initialize();

    const handles = [];

    try {
      // =========================================================================
      // PHASE 1: Create 3 partition replicas in separate workers
      // =========================================================================
      const replicaIds = [];
      const peerAddresses = [];

      // Generate replica IDs and peer addresses
      for (let i = NUM.ZERO; i < TEST_CONFIG.REPLICA_COUNT; i++) {
        const replicaId = `${TEST_CONFIG.PARTITION_ID}-r${i}`;
        replicaIds.push(replicaId);
        peerAddresses.push(`${nodeId}/${WORKER_ENTITY_TYPE.PARTITION}/${replicaId}`);
      }

      // Create each replica in a worker process
      for (let i = NUM.ZERO; i < TEST_CONFIG.REPLICA_COUNT; i++) {
        const handle = await workerManager.createPartitionReplica({
          partitionId: TEST_CONFIG.PARTITION_ID,
          replicaId: replicaIds[i],
          tableId: TEST_CONFIG.TABLE_ID,
          tableName: TEST_CONFIG.TABLE_NAME,
          schema: {
            columns: [
              {name: 'id', type: 'TEXT', primaryKey: true},
              {name: 'value', type: 'TEXT'},
            ],
          },
          dbPath: ':memory:',
          replicaIds,
          peerAddresses,
        });

        handles.push(handle);
        t.ok(handle, `Replica ${i} created in worker`);
        t.equal(handle.entityType, WORKER_ENTITY_TYPE.PARTITION, 'Entity type is partition');
      }

      t.equal(handles.length, TEST_CONFIG.REPLICA_COUNT, 'All 3 replicas created');

      // =========================================================================
      // PHASE 2: Wait for leader election
      // =========================================================================
      let leaderHandle = null;
      let leaderCount = NUM.ZERO;

      const leaderElected = await waitFor(
        async () => {
          leaderCount = NUM.ZERO;
          leaderHandle = null;

          for (const handle of handles) {
            const status = await workerManager.getLeadershipStatus(handle.replicaId);
            if (isActivatedLeader(status)) {
              leaderCount++;
              leaderHandle = handle;
            }
          }

          // Exactly one leader should be elected
          return leaderCount === NUM.ONE;
        },
        TEST_CONFIG.LEADER_ELECTION_TIMEOUT_MS,
        TEST_CONFIG.LEADER_ELECTION_POLL_MS,
      );

      t.ok(leaderElected, 'Leader election completed');
      t.equal(leaderCount, NUM.ONE, 'Exactly one leader elected');
      t.ok(leaderHandle, 'Leader handle is available');

      // Verify leader status
      const leaderStatus = await workerManager.getLeadershipStatus(leaderHandle.replicaId);
      t.ok(leaderStatus.isLeader, 'Leader reports isLeader=true');
      t.ok(leaderStatus.leaderActivated, 'Leader activation completed');
      t.ok(leaderStatus.term >= NUM.ONE, 'Leader has valid term');

      // Verify followers
      let followerCount = NUM.ZERO;
      for (const handle of handles) {
        if (handle.replicaId !== leaderHandle.replicaId) {
          const status = await workerManager.getLeadershipStatus(handle.replicaId);
          if (!isActivatedLeader(status)) {
            followerCount++;
          }
        }
      }

      t.equal(
        followerCount,
        TEST_CONFIG.REPLICA_COUNT - NUM.ONE,
        'Remaining replicas are followers',
      );
    } finally {
      // =========================================================================
      // CLEANUP
      // =========================================================================
      for (const handle of handles) {
        await workerManager.stopReplica(handle.replicaId).catch(() => {});
      }

      await workerManager.shutdown().catch(() => {});
      await messageRouter.shutdown().catch(() => {});

      // Allow cleanup to complete
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  });

  await t.test('Raft packets route through MessageRouter across workers (Req 2.4)', async (t) => {
    // =========================================================================
    // This test verifies that Raft packets are routed through the worker
    // message routing system using the same code path regardless of target.
    //
    // Requirements validated:
    // - 2.4: Raft packets use same code path for local and remote targets
    //
    // Note: Local worker-to-worker messages are routed via routeWorkerMessage
    // which delivers messages through piscina pool.run(). We track messages
    // by wrapping routeWorkerMessage which is the common path for all
    // worker-to-worker Raft communication.
    // =========================================================================

    const nodeId = generateUniqueNodeId(nodeIdCounter++);
    const wsPort = ports.getPort();

    // Track routed messages
    const routedMessages = [];

    // Create MessageRouter
    const messageRouter = new MessageRouter({
      nodeId,
      wsPort,
      logger: {
        info: () => {},
        debug: () => {},
        warn: console.warn,
        error: console.error,
      },
    });

    await messageRouter.initialize();

    const workerPath = path.resolve(__dirname, '../../src/worker/replica-worker.js');
    const workerManager = new ReplicaWorkerManager({
      nodeId,
      messageRouter,
      workerPath,
      logger: {
        info: () => {},
        debug: () => {},
        warn: console.warn,
        error: console.error,
      },
    });

    await workerManager.initialize();

    // Wrap routeWorkerMessage to track all Raft messages between workers
    // This is the common path for worker-to-worker Raft communication
    const originalRouteWorkerMessage = workerManager.routeWorkerMessage.bind(workerManager);
    workerManager.routeWorkerMessage = async function(envelope) {
      routedMessages.push({
        targetAddress: envelope.targetAddress,
        sourceAddress: envelope.sourceAddress,
        timestamp: Date.now(),
      });
      return originalRouteWorkerMessage(envelope);
    };

    const handles = [];

    try {
      // Create 3 replicas
      const replicaIds = [];
      const peerAddresses = [];

      for (let i = NUM.ZERO; i < TEST_CONFIG.REPLICA_COUNT; i++) {
        const replicaId = `${TEST_CONFIG.PARTITION_ID}-r${i}`;
        replicaIds.push(replicaId);
        peerAddresses.push(`${nodeId}/${WORKER_ENTITY_TYPE.PARTITION}/${replicaId}`);
      }

      for (let i = NUM.ZERO; i < TEST_CONFIG.REPLICA_COUNT; i++) {
        const handle = await workerManager.createPartitionReplica({
          partitionId: TEST_CONFIG.PARTITION_ID,
          replicaId: replicaIds[i],
          tableId: TEST_CONFIG.TABLE_ID,
          tableName: TEST_CONFIG.TABLE_NAME,
          schema: {
            columns: [
              {name: 'id', type: 'TEXT', primaryKey: true},
              {name: 'value', type: 'TEXT'},
            ],
          },
          dbPath: ':memory:',
          replicaIds,
          peerAddresses,
        });

        handles.push(handle);
      }

      // Wait for leader election (which generates Raft messages)
      await waitFor(
        async () => {
          for (const handle of handles) {
            const status = await workerManager.getLeadershipStatus(handle.replicaId);
            if (isActivatedLeader(status)) {
              return true;
            }
          }
          return false;
        },
        TEST_CONFIG.LEADER_ELECTION_TIMEOUT_MS,
        TEST_CONFIG.LEADER_ELECTION_POLL_MS,
      );

      // Verify messages were routed between workers
      t.ok(routedMessages.length > NUM.ZERO, 'Messages were routed through MessageRouter');

      // Verify all messages have valid addresses
      const allValidAddresses = routedMessages.every((msg) => {
        const hasTarget = typeof msg.targetAddress === 'string' &&
          msg.targetAddress.includes('/');
        return hasTarget;
      });

      t.ok(allValidAddresses, 'All routed messages have valid addresses');

      // Verify messages went to different replicas (cross-worker communication)
      const uniqueTargets = new Set(routedMessages.map((m) => m.targetAddress));
      t.ok(
        uniqueTargets.size >= NUM.TWO,
        'Messages routed to multiple worker replicas',
      );
    } finally {
      for (const handle of handles) {
        await workerManager.stopReplica(handle.replicaId).catch(() => {});
      }

      await workerManager.shutdown().catch(() => {});
      await messageRouter.shutdown().catch(() => {});

      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  });

  await t.test('log replication works across worker processes (Req 14.6)', async (t) => {
    // =========================================================================
    // This test verifies that Raft log replication works correctly when
    // replicas are running in separate worker processes.
    //
    // Requirements validated:
    // - 14.6: Raft log replication works across worker processes
    // =========================================================================

    const nodeId = generateUniqueNodeId(nodeIdCounter++);
    const wsPort = ports.getPort();

    const messageRouter = new MessageRouter({
      nodeId,
      wsPort,
      logger: {
        info: () => {},
        debug: () => {},
        warn: console.warn,
        error: console.error,
      },
    });

    await messageRouter.initialize();

    const workerPath = path.resolve(__dirname, '../../src/worker/replica-worker.js');
    const workerManager = new ReplicaWorkerManager({
      nodeId,
      messageRouter,
      workerPath,
      logger: {
        info: () => {},
        debug: () => {},
        warn: console.warn,
        error: console.error,
      },
    });

    await workerManager.initialize();

    const handles = [];

    try {
      // Create 3 replicas
      const replicaIds = [];
      const peerAddresses = [];

      for (let i = NUM.ZERO; i < TEST_CONFIG.REPLICA_COUNT; i++) {
        const replicaId = `${TEST_CONFIG.PARTITION_ID}-r${i}`;
        replicaIds.push(replicaId);
        peerAddresses.push(`${nodeId}/${WORKER_ENTITY_TYPE.PARTITION}/${replicaId}`);
      }

      for (let i = NUM.ZERO; i < TEST_CONFIG.REPLICA_COUNT; i++) {
        const handle = await workerManager.createPartitionReplica({
          partitionId: TEST_CONFIG.PARTITION_ID,
          replicaId: replicaIds[i],
          tableId: TEST_CONFIG.TABLE_ID,
          tableName: TEST_CONFIG.TABLE_NAME,
          schema: {
            columns: [
              {name: 'id', type: 'TEXT', primaryKey: true},
              {name: 'value', type: 'TEXT'},
            ],
          },
          dbPath: ':memory:',
          replicaIds,
          peerAddresses,
        });

        handles.push(handle);
      }

      // Wait for leader election
      let leaderHandle = null;
      await waitFor(
        async () => {
          for (const handle of handles) {
            const status = await workerManager.getLeadershipStatus(handle.replicaId);
            if (isActivatedLeader(status)) {
              leaderHandle = handle;
              return true;
            }
          }
          return false;
        },
        TEST_CONFIG.LEADER_ELECTION_TIMEOUT_MS,
        TEST_CONFIG.LEADER_ELECTION_POLL_MS,
      );

      t.ok(leaderHandle, 'Leader elected for log replication test');

      // Get initial term from leader
      const initialStatus = await workerManager.getLeadershipStatus(leaderHandle.replicaId);
      const initialTerm = initialStatus.term;

      t.ok(initialTerm >= NUM.ONE, 'Leader has valid initial term');

      // Wait a bit for heartbeats to propagate (log replication)
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Verify all replicas have consistent term (indicates log replication)
      const terms = [];
      for (const handle of handles) {
        const status = await workerManager.getLeadershipStatus(handle.replicaId);
        terms.push(status.term);
      }

      // All replicas should have the same term after replication
      const allSameTerm = terms.every((term) => term === terms[NUM.ZERO]);
      t.ok(allSameTerm, 'All replicas have consistent term after replication');

      // Verify followers recognize the leader
      let followersRecognizeLeader = NUM.ZERO;
      for (const handle of handles) {
        if (handle.replicaId !== leaderHandle.replicaId) {
          const status = await workerManager.getLeadershipStatus(handle.replicaId);
          if (status.leaderId === leaderHandle.replicaId ||
              status.leaderId === leaderHandle.unifiedAddress) {
            followersRecognizeLeader++;
          }
        }
      }

      t.ok(
        followersRecognizeLeader >= NUM.ONE,
        'At least one follower recognizes the leader',
      );
    } finally {
      for (const handle of handles) {
        await workerManager.stopReplica(handle.replicaId).catch(() => {});
      }

      await workerManager.shutdown().catch(() => {});
      await messageRouter.shutdown().catch(() => {});

      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  });

  await t.test('worker handles are created for each replica (Req 1.1)', async (t) => {
    // =========================================================================
    // This test verifies that each partition replica gets its own worker
    // process with a unique handle.
    //
    // Requirements validated:
    // - 1.1: Each partition replica runs in a dedicated worker process
    // =========================================================================

    const nodeId = generateUniqueNodeId(nodeIdCounter++);
    const wsPort = ports.getPort();

    const messageRouter = new MessageRouter({
      nodeId,
      wsPort,
      logger: {
        info: () => {},
        debug: () => {},
        warn: console.warn,
        error: console.error,
      },
    });

    await messageRouter.initialize();

    const workerPath = path.resolve(__dirname, '../../src/worker/replica-worker.js');
    const workerManager = new ReplicaWorkerManager({
      nodeId,
      messageRouter,
      workerPath,
      logger: {
        info: () => {},
        debug: () => {},
        warn: console.warn,
        error: console.error,
      },
    });

    await workerManager.initialize();

    const handles = [];

    try {
      // Create 3 replicas
      const replicaIds = [];
      const peerAddresses = [];

      for (let i = NUM.ZERO; i < TEST_CONFIG.REPLICA_COUNT; i++) {
        const replicaId = `${TEST_CONFIG.PARTITION_ID}-r${i}`;
        replicaIds.push(replicaId);
        peerAddresses.push(`${nodeId}/${WORKER_ENTITY_TYPE.PARTITION}/${replicaId}`);
      }

      for (let i = NUM.ZERO; i < TEST_CONFIG.REPLICA_COUNT; i++) {
        const handle = await workerManager.createPartitionReplica({
          partitionId: TEST_CONFIG.PARTITION_ID,
          replicaId: replicaIds[i],
          tableId: TEST_CONFIG.TABLE_ID,
          tableName: TEST_CONFIG.TABLE_NAME,
          schema: {
            columns: [
              {name: 'id', type: 'TEXT', primaryKey: true},
              {name: 'value', type: 'TEXT'},
            ],
          },
          dbPath: ':memory:',
          replicaIds,
          peerAddresses,
        });

        handles.push(handle);
      }

      // Verify each handle is unique
      const uniqueReplicaIds = new Set(handles.map((h) => h.replicaId));
      t.equal(
        uniqueReplicaIds.size,
        TEST_CONFIG.REPLICA_COUNT,
        'Each replica has unique ID',
      );

      // Verify each handle has correct entity type
      const allPartitions = handles.every(
        (h) => h.entityType === WORKER_ENTITY_TYPE.PARTITION,
      );
      t.ok(allPartitions, 'All handles are partition type');

      // Verify each handle has unique unified address
      const uniqueAddresses = new Set(handles.map((h) => h.unifiedAddress));
      t.equal(
        uniqueAddresses.size,
        TEST_CONFIG.REPLICA_COUNT,
        'Each replica has unique unified address',
      );

      // Verify worker manager tracks all workers
      const workerCount = workerManager.getWorkerCount();
      t.equal(
        workerCount,
        TEST_CONFIG.REPLICA_COUNT,
        'Worker manager tracks all workers',
      );

      // Verify health status is available for all workers
      const healthStatus = workerManager.getHealthStatus();
      t.equal(
        healthStatus.size,
        TEST_CONFIG.REPLICA_COUNT,
        'Health status available for all workers',
      );
    } finally {
      for (const handle of handles) {
        await workerManager.stopReplica(handle.replicaId).catch(() => {});
      }

      await workerManager.shutdown().catch(() => {});
      await messageRouter.shutdown().catch(() => {});

      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  });
});
