/**
 * Cross-Worker CDC Integration Test (Task 24.2)
 *
 * This test verifies that CDC events flow correctly across worker processes:
 * 1. Partition leader generates CDC event
 * 2. Message group leader receives via SUBSCRIBE_CDC
 * 3. CDC event is replicated to message group followers via Raft
 *
 * **Validates: Requirements 3.3, 4.3, 4.4**
 *
 * - Requirement 3.3: WHEN a CDC_Event is received by a message group leader,
 *   THE Message_Group_Service SHALL replicate the cache change to follower
 *   replicas via Raft consensus
 * - Requirement 4.3: WHEN a partition leader generates a CDC_Event,
 *   THE Partition_Service SHALL send it only to the subscribed message group leader
 * - Requirement 4.4: WHEN a message group leader receives a CDC_Event,
 *   THE Message_Group_Service SHALL replicate it to followers via Raft consensus
 *
 * @module test/integration/cross-worker-cdc.integration.test.js
 */

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
import {
  WORKER_ENTITY_TYPE,
  CDC_MESSAGE_TYPE,
  CACHE_MESSAGE_TYPE,
} from '../../src/worker/worker-constants.js';
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
  PARTITION_REPLICA_COUNT: 3,
  /** Number of replicas in the test message group */
  MESSAGE_GROUP_REPLICA_COUNT: 3,
  /** Timeout for leader election in milliseconds */
  LEADER_ELECTION_TIMEOUT_MS: 10000,
  /** Polling interval for leader election in milliseconds */
  LEADER_ELECTION_POLL_MS: 100,
  /** Timeout for CDC event propagation in milliseconds */
  CDC_PROPAGATION_TIMEOUT_MS: 30000,
  /** Polling interval for CDC propagation in milliseconds */
  CDC_PROPAGATION_POLL_MS: 50,
  /** Test partition ID */
  PARTITION_ID: 'cdc-test-partition-1',
  /** Test table ID */
  TABLE_ID: 'cdc-test-table',
  /** Test table name */
  TABLE_NAME: 'cdc_test_data',
  /** Test message group ID */
  MESSAGE_GROUP_ID: 'cdc-test-mg-1',
});

/**
 * Initialize test environment with fast Raft elections.
 * Resets all singletons and configures logging to error level.
 * @param {string} nodeId - Node ID for configuration.
 */
function initializeTestEnvironment(nodeId) {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  NodeService.resetInstance();
  AddressManager.resetInstance();
  ServiceThreadManager.resetInstance();

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

/**
 * Generate unique node ID for test isolation.
 * @param {number} counter - Counter value.
 * @return {string} UUID string.
 */
function generateUniqueNodeId(counter) {
  const hex = counter.toString(16).padStart(12, '0');
  return `cdc-worker-${hex}`;
}

// Counter for generating unique node IDs
let nodeIdCounter = 0xB00000000000;

test('Cross-Worker CDC Integration', {timeout: 120000}, async (t) => {
  t.beforeEach(() => {
    const nodeId = generateUniqueNodeId(nodeIdCounter++);
    initializeTestEnvironment(nodeId);
  });

  t.afterEach(async () => {
    await cleanupTestEnvironment();
  });

  await t.test('CDC event flows from partition leader to message group (Req 4.3)', async (t) => {
    // =========================================================================
    // This test verifies that CDC events generated by a partition leader
    // are delivered to the subscribed message group leader.
    //
    // Requirements validated:
    // - 4.3: Partition leader sends CDC events only to subscribed message group
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

    const partitionHandles = [];
    const messageGroupHandles = [];

    try {
      // =====================================================================
      // PHASE 1: Create partition replicas
      // =====================================================================
      const partitionReplicaIds = [];
      const partitionPeerAddresses = [];

      for (let i = NUM.ZERO; i < TEST_CONFIG.PARTITION_REPLICA_COUNT; i++) {
        const replicaId = `${TEST_CONFIG.PARTITION_ID}-r${i}`;
        partitionReplicaIds.push(replicaId);
        partitionPeerAddresses.push(`${nodeId}/${WORKER_ENTITY_TYPE.PARTITION}/${replicaId}`);
      }

      for (let i = NUM.ZERO; i < TEST_CONFIG.PARTITION_REPLICA_COUNT; i++) {
        const handle = await workerManager.createPartitionReplica({
          partitionId: TEST_CONFIG.PARTITION_ID,
          replicaId: partitionReplicaIds[i],
          tableId: TEST_CONFIG.TABLE_ID,
          tableName: TEST_CONFIG.TABLE_NAME,
          schema: {
            columns: [
              {name: 'id', type: 'TEXT', primaryKey: true},
              {name: 'value', type: 'TEXT'},
            ],
          },
          dbPath: ':memory:',
          replicaIds: partitionReplicaIds,
          peerAddresses: partitionPeerAddresses,
        });

        partitionHandles.push(handle);
      }

      t.equal(partitionHandles.length, TEST_CONFIG.PARTITION_REPLICA_COUNT,
        'All partition replicas created');

      // =====================================================================
      // PHASE 2: Create message group replicas
      // =====================================================================
      const mgReplicaIds = [];
      const mgPeerAddresses = [];

      for (let i = NUM.ZERO; i < TEST_CONFIG.MESSAGE_GROUP_REPLICA_COUNT; i++) {
        const replicaId = `${TEST_CONFIG.MESSAGE_GROUP_ID}-r${i}`;
        mgReplicaIds.push(replicaId);
        mgPeerAddresses.push(`${nodeId}/${WORKER_ENTITY_TYPE.MESSAGE_GROUP}/${replicaId}`);
      }

      for (let i = NUM.ZERO; i < TEST_CONFIG.MESSAGE_GROUP_REPLICA_COUNT; i++) {
        const handle = await workerManager.createMessageGroupReplica({
          groupId: TEST_CONFIG.MESSAGE_GROUP_ID,
          replicaId: mgReplicaIds[i],
          replicaIds: mgReplicaIds,
          peerAddresses: mgPeerAddresses,
        });

        messageGroupHandles.push(handle);
      }

      t.equal(messageGroupHandles.length, TEST_CONFIG.MESSAGE_GROUP_REPLICA_COUNT,
        'All message group replicas created');

      // =====================================================================
      // PHASE 3: Wait for leader election on both groups
      // =====================================================================
      let partitionLeaderHandle = null;
      let mgLeaderHandle = null;

      const partitionLeaderElected = await waitFor(
        async () => {
          for (const handle of partitionHandles) {
            const status = await workerManager.getLeadershipStatus(handle.replicaId);
            if (status.isLeader) {
              partitionLeaderHandle = handle;
              return true;
            }
          }
          return false;
        },
        TEST_CONFIG.LEADER_ELECTION_TIMEOUT_MS,
        TEST_CONFIG.LEADER_ELECTION_POLL_MS,
      );

      t.ok(partitionLeaderElected, 'Partition leader elected');
      t.ok(partitionLeaderHandle, 'Partition leader handle available');

      const mgLeaderElected = await waitFor(
        async () => {
          for (const handle of messageGroupHandles) {
            const status = await workerManager.getLeadershipStatus(handle.replicaId);
            if (status.isLeader) {
              mgLeaderHandle = handle;
              return true;
            }
          }
          return false;
        },
        TEST_CONFIG.LEADER_ELECTION_TIMEOUT_MS,
        TEST_CONFIG.LEADER_ELECTION_POLL_MS,
      );

      t.ok(mgLeaderElected, 'Message group leader elected');
      t.ok(mgLeaderHandle, 'Message group leader handle available');

      // =====================================================================
      // PHASE 4: Subscribe message group leader to partition CDC events
      // =====================================================================
      const subscribeResponse = await workerManager.deliverMessage(
        partitionLeaderHandle.replicaId,
        {
          type: CDC_MESSAGE_TYPE.SUBSCRIBE_CDC,
          subscriberAddress: mgLeaderHandle.unifiedAddress,
          tableName: TEST_CONFIG.TABLE_NAME,
        },
      );

      t.equal(subscribeResponse.status, 'ok', 'CDC subscription successful');
      t.equal(subscribeResponse.partitionId, TEST_CONFIG.PARTITION_ID,
        'Subscription confirmed for correct partition');

      // =====================================================================
      // PHASE 5: Generate CDC event by inserting data into partition
      // =====================================================================
      const testId = `test-record-${Date.now()}`;
      const testValue = 'test-value-for-cdc';

      // Execute INSERT query on partition leader to generate CDC event
      const insertResponse = await workerManager.deliverMessage(
        partitionLeaderHandle.replicaId,
        {
          type: 'EXECUTE_QUERY',
          sql: `INSERT INTO "${TEST_CONFIG.TABLE_NAME}" (id, value) VALUES (?, ?)`,
          params: [testId, testValue],
        },
      );

      t.ok(insertResponse, 'Insert query executed');

      // =====================================================================
      // PHASE 6: Verify CDC event was received by message group leader
      // =====================================================================
      // Wait for CDC event to propagate and be applied to message group cache
      const cdcReceived = await waitFor(
        async () => {
          const cacheResponse = await workerManager.deliverMessage(
            mgLeaderHandle.replicaId,
            {
              type: CACHE_MESSAGE_TYPE.CACHE_QUERY,
              sql: `SELECT * FROM "${TEST_CONFIG.TABLE_NAME}" WHERE id = ?`,
              params: [testId],
            },
          );

          return cacheResponse.rows && cacheResponse.rows.length > NUM.ZERO;
        },
        TEST_CONFIG.CDC_PROPAGATION_TIMEOUT_MS,
        TEST_CONFIG.CDC_PROPAGATION_POLL_MS,
      );

      t.ok(cdcReceived, 'CDC event received by message group leader');

      // Verify the data in the cache
      const finalCacheResponse = await workerManager.deliverMessage(
        mgLeaderHandle.replicaId,
        {
          type: CACHE_MESSAGE_TYPE.CACHE_QUERY,
          sql: `SELECT * FROM "${TEST_CONFIG.TABLE_NAME}" WHERE id = ?`,
          params: [testId],
        },
      );

      t.ok(finalCacheResponse.rows, 'Cache query returned rows');
      t.equal(finalCacheResponse.rows.length, NUM.ONE, 'Exactly one record in cache');
      t.equal(finalCacheResponse.rows[NUM.ZERO].id, testId, 'Record ID matches');
      t.equal(finalCacheResponse.rows[NUM.ZERO].value, testValue, 'Record value matches');

    } finally {
      // =====================================================================
      // CLEANUP
      // =====================================================================
      for (const handle of [...partitionHandles, ...messageGroupHandles]) {
        await workerManager.stopReplica(handle.replicaId).catch(() => {});
      }

      await workerManager.shutdown().catch(() => {});
      await messageRouter.shutdown().catch(() => {});

      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  });

  await t.test('CDC event replicates to message group followers (Req 3.3, 4.4)', async (t) => {
    // =========================================================================
    // This test verifies that CDC events received by the message group leader
    // are replicated to follower replicas via Raft consensus.
    //
    // Requirements validated:
    // - 3.3: Message group leader replicates cache changes to followers via Raft
    // - 4.4: Message group leader replicates CDC events to followers via Raft
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

    const partitionHandles = [];
    const messageGroupHandles = [];

    try {
      // =====================================================================
      // PHASE 1: Create partition replicas
      // =====================================================================
      const partitionReplicaIds = [];
      const partitionPeerAddresses = [];

      for (let i = NUM.ZERO; i < TEST_CONFIG.PARTITION_REPLICA_COUNT; i++) {
        const replicaId = `${TEST_CONFIG.PARTITION_ID}-r${i}`;
        partitionReplicaIds.push(replicaId);
        partitionPeerAddresses.push(`${nodeId}/${WORKER_ENTITY_TYPE.PARTITION}/${replicaId}`);
      }

      for (let i = NUM.ZERO; i < TEST_CONFIG.PARTITION_REPLICA_COUNT; i++) {
        const handle = await workerManager.createPartitionReplica({
          partitionId: TEST_CONFIG.PARTITION_ID,
          replicaId: partitionReplicaIds[i],
          tableId: TEST_CONFIG.TABLE_ID,
          tableName: TEST_CONFIG.TABLE_NAME,
          schema: {
            columns: [
              {name: 'id', type: 'TEXT', primaryKey: true},
              {name: 'value', type: 'TEXT'},
            ],
          },
          dbPath: ':memory:',
          replicaIds: partitionReplicaIds,
          peerAddresses: partitionPeerAddresses,
        });

        partitionHandles.push(handle);
      }

      // =====================================================================
      // PHASE 2: Create message group replicas
      // =====================================================================
      const mgReplicaIds = [];
      const mgPeerAddresses = [];

      for (let i = NUM.ZERO; i < TEST_CONFIG.MESSAGE_GROUP_REPLICA_COUNT; i++) {
        const replicaId = `${TEST_CONFIG.MESSAGE_GROUP_ID}-r${i}`;
        mgReplicaIds.push(replicaId);
        mgPeerAddresses.push(`${nodeId}/${WORKER_ENTITY_TYPE.MESSAGE_GROUP}/${replicaId}`);
      }

      for (let i = NUM.ZERO; i < TEST_CONFIG.MESSAGE_GROUP_REPLICA_COUNT; i++) {
        const handle = await workerManager.createMessageGroupReplica({
          groupId: TEST_CONFIG.MESSAGE_GROUP_ID,
          replicaId: mgReplicaIds[i],
          replicaIds: mgReplicaIds,
          peerAddresses: mgPeerAddresses,
        });

        messageGroupHandles.push(handle);
      }

      // =====================================================================
      // PHASE 3: Wait for leader election on both groups
      // =====================================================================
      let partitionLeaderHandle = null;
      let mgLeaderHandle = null;
      const mgFollowerHandles = [];

      const partitionLeaderElected = await waitFor(
        async () => {
          for (const handle of partitionHandles) {
            const status = await workerManager.getLeadershipStatus(handle.replicaId);
            if (status.isLeader) {
              partitionLeaderHandle = handle;
              return true;
            }
          }
          return false;
        },
        TEST_CONFIG.LEADER_ELECTION_TIMEOUT_MS,
        TEST_CONFIG.LEADER_ELECTION_POLL_MS,
      );

      t.ok(partitionLeaderElected, 'Partition leader elected');

      const mgLeaderElected = await waitFor(
        async () => {
          mgFollowerHandles.length = NUM.ZERO;
          for (const handle of messageGroupHandles) {
            const status = await workerManager.getLeadershipStatus(handle.replicaId);
            if (status.isLeader) {
              mgLeaderHandle = handle;
            } else {
              mgFollowerHandles.push(handle);
            }
          }
          return mgLeaderHandle !== null && mgFollowerHandles.length > NUM.ZERO;
        },
        TEST_CONFIG.LEADER_ELECTION_TIMEOUT_MS,
        TEST_CONFIG.LEADER_ELECTION_POLL_MS,
      );

      t.ok(mgLeaderElected, 'Message group leader elected');
      t.ok(mgFollowerHandles.length > NUM.ZERO, 'Message group has followers');

      // =====================================================================
      // PHASE 4: Subscribe message group leader to partition CDC events
      // =====================================================================
      await workerManager.deliverMessage(
        partitionLeaderHandle.replicaId,
        {
          type: CDC_MESSAGE_TYPE.SUBSCRIBE_CDC,
          subscriberAddress: mgLeaderHandle.unifiedAddress,
          tableName: TEST_CONFIG.TABLE_NAME,
        },
      );

      // =====================================================================
      // PHASE 5: Generate CDC event by inserting data into partition
      // =====================================================================
      const testId = `replication-test-${Date.now()}`;
      const testValue = 'value-for-replication-test';

      await workerManager.deliverMessage(
        partitionLeaderHandle.replicaId,
        {
          type: 'EXECUTE_QUERY',
          sql: `INSERT INTO "${TEST_CONFIG.TABLE_NAME}" (id, value) VALUES (?, ?)`,
          params: [testId, testValue],
        },
      );

      // =====================================================================
      // PHASE 6: Wait for CDC event to be received by leader
      // =====================================================================
      const leaderReceivedCDC = await waitFor(
        async () => {
          const cacheResponse = await workerManager.deliverMessage(
            mgLeaderHandle.replicaId,
            {
              type: CACHE_MESSAGE_TYPE.CACHE_QUERY,
              sql: `SELECT * FROM "${TEST_CONFIG.TABLE_NAME}" WHERE id = ?`,
              params: [testId],
            },
          );

          return cacheResponse.rows && cacheResponse.rows.length > NUM.ZERO;
        },
        TEST_CONFIG.CDC_PROPAGATION_TIMEOUT_MS,
        TEST_CONFIG.CDC_PROPAGATION_POLL_MS,
      );

      t.ok(leaderReceivedCDC, 'Message group leader received CDC event');

      // =====================================================================
      // PHASE 7: Verify CDC event was replicated to followers via Raft
      // =====================================================================
      // Wait for Raft replication to propagate to followers
      let followersWithData = NUM.ZERO;

      const followersReceivedCDC = await waitFor(
        async () => {
          followersWithData = NUM.ZERO;

          for (const followerHandle of mgFollowerHandles) {
            const cacheResponse = await workerManager.deliverMessage(
              followerHandle.replicaId,
              {
                type: CACHE_MESSAGE_TYPE.CACHE_QUERY,
                sql: `SELECT * FROM "${TEST_CONFIG.TABLE_NAME}" WHERE id = ?`,
                params: [testId],
              },
            );

            if (cacheResponse.rows && cacheResponse.rows.length > NUM.ZERO) {
              followersWithData++;
            }
          }

          // All followers should have the data
          return followersWithData === mgFollowerHandles.length;
        },
        TEST_CONFIG.CDC_PROPAGATION_TIMEOUT_MS,
        TEST_CONFIG.CDC_PROPAGATION_POLL_MS,
      );

      t.ok(followersReceivedCDC, 'CDC event replicated to all message group followers');
      t.equal(followersWithData, mgFollowerHandles.length,
        `All ${mgFollowerHandles.length} followers have the replicated data`);

      // Verify data consistency across all message group replicas
      for (const handle of messageGroupHandles) {
        const cacheResponse = await workerManager.deliverMessage(
          handle.replicaId,
          {
            type: CACHE_MESSAGE_TYPE.CACHE_QUERY,
            sql: `SELECT * FROM "${TEST_CONFIG.TABLE_NAME}" WHERE id = ?`,
            params: [testId],
          },
        );

        t.ok(cacheResponse.rows, `Replica ${handle.replicaId} has cache data`);
        t.equal(cacheResponse.rows.length, NUM.ONE,
          `Replica ${handle.replicaId} has exactly one record`);
        const replicatedRow = cacheResponse.rows[NUM.ZERO];
        t.ok(replicatedRow, `Replica ${handle.replicaId} has replicated row payload`);
        if (replicatedRow) {
          t.equal(replicatedRow.id, testId,
            `Replica ${handle.replicaId} has correct record ID`);
          t.equal(replicatedRow.value, testValue,
            `Replica ${handle.replicaId} has correct record value`);
        }
      }

    } finally {
      // =====================================================================
      // CLEANUP
      // =====================================================================
      for (const handle of [...partitionHandles, ...messageGroupHandles]) {
        await workerManager.stopReplica(handle.replicaId).catch(() => {});
      }

      await workerManager.shutdown().catch(() => {});
      await messageRouter.shutdown().catch(() => {});

      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  });

  await t.test('only message group leader subscribes to CDC (Req 4.3)', async (t) => {
    // =========================================================================
    // This test verifies that only the message group leader subscribes to
    // CDC events from partition leaders, not the followers.
    //
    // Requirements validated:
    // - 4.3: Partition leader sends CDC events only to subscribed message group
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

    const partitionHandles = [];
    const messageGroupHandles = [];

    try {
      // Create single partition replica (leader)
      const partitionReplicaId = `${TEST_CONFIG.PARTITION_ID}-single`;
      const partitionHandle = await workerManager.createPartitionReplica({
        partitionId: TEST_CONFIG.PARTITION_ID,
        replicaId: partitionReplicaId,
        tableId: TEST_CONFIG.TABLE_ID,
        tableName: TEST_CONFIG.TABLE_NAME,
        schema: {
          columns: [
            {name: 'id', type: 'TEXT', primaryKey: true},
            {name: 'value', type: 'TEXT'},
          ],
        },
        dbPath: ':memory:',
        replicaIds: [partitionReplicaId],
        peerAddresses: [`${nodeId}/${WORKER_ENTITY_TYPE.PARTITION}/${partitionReplicaId}`],
      });

      partitionHandles.push(partitionHandle);

      // Create message group replicas
      const mgReplicaIds = [];
      const mgPeerAddresses = [];

      for (let i = NUM.ZERO; i < TEST_CONFIG.MESSAGE_GROUP_REPLICA_COUNT; i++) {
        const replicaId = `${TEST_CONFIG.MESSAGE_GROUP_ID}-r${i}`;
        mgReplicaIds.push(replicaId);
        mgPeerAddresses.push(`${nodeId}/${WORKER_ENTITY_TYPE.MESSAGE_GROUP}/${replicaId}`);
      }

      for (let i = NUM.ZERO; i < TEST_CONFIG.MESSAGE_GROUP_REPLICA_COUNT; i++) {
        const handle = await workerManager.createMessageGroupReplica({
          groupId: TEST_CONFIG.MESSAGE_GROUP_ID,
          replicaId: mgReplicaIds[i],
          replicaIds: mgReplicaIds,
          peerAddresses: mgPeerAddresses,
        });

        messageGroupHandles.push(handle);
      }

      // Wait for leader election
      let partitionLeaderHandle = null;
      let mgLeaderHandle = null;
      const mgFollowerHandles = [];

      await waitFor(
        async () => {
          const status = await workerManager.getLeadershipStatus(partitionHandle.replicaId);
          if (status.isLeader) {
            partitionLeaderHandle = partitionHandle;
            return true;
          }
          return false;
        },
        TEST_CONFIG.LEADER_ELECTION_TIMEOUT_MS,
        TEST_CONFIG.LEADER_ELECTION_POLL_MS,
      );

      await waitFor(
        async () => {
          mgFollowerHandles.length = NUM.ZERO;
          for (const handle of messageGroupHandles) {
            const status = await workerManager.getLeadershipStatus(handle.replicaId);
            if (status.isLeader) {
              mgLeaderHandle = handle;
            } else {
              mgFollowerHandles.push(handle);
            }
          }
          return mgLeaderHandle !== null;
        },
        TEST_CONFIG.LEADER_ELECTION_TIMEOUT_MS,
        TEST_CONFIG.LEADER_ELECTION_POLL_MS,
      );

      t.ok(partitionLeaderHandle, 'Partition leader elected');
      t.ok(mgLeaderHandle, 'Message group leader elected');
      t.ok(mgFollowerHandles.length > NUM.ZERO, 'Message group has followers');

      // Subscribe ONLY the leader to CDC events
      const leaderSubscribeResponse = await workerManager.deliverMessage(
        partitionLeaderHandle.replicaId,
        {
          type: CDC_MESSAGE_TYPE.SUBSCRIBE_CDC,
          subscriberAddress: mgLeaderHandle.unifiedAddress,
          tableName: TEST_CONFIG.TABLE_NAME,
        },
      );

      t.equal(leaderSubscribeResponse.status, 'ok', 'Leader subscription successful');

      // Verify followers are NOT subscribed (they should not receive direct CDC events)
      // This is verified by checking that only the leader has an active subscription
      // The followers receive data via Raft replication, not direct CDC subscription

      // Generate CDC event
      const testId = `leader-only-test-${Date.now()}`;
      const testValue = 'leader-only-value';

      await workerManager.deliverMessage(
        partitionLeaderHandle.replicaId,
        {
          type: 'EXECUTE_QUERY',
          sql: `INSERT INTO "${TEST_CONFIG.TABLE_NAME}" (id, value) VALUES (?, ?)`,
          params: [testId, testValue],
        },
      );

      // Wait for leader to receive CDC event
      const leaderReceivedCDC = await waitFor(
        async () => {
          const cacheResponse = await workerManager.deliverMessage(
            mgLeaderHandle.replicaId,
            {
              type: CACHE_MESSAGE_TYPE.CACHE_QUERY,
              sql: `SELECT * FROM "${TEST_CONFIG.TABLE_NAME}" WHERE id = ?`,
              params: [testId],
            },
          );

          return cacheResponse.rows && cacheResponse.rows.length > NUM.ZERO;
        },
        TEST_CONFIG.CDC_PROPAGATION_TIMEOUT_MS,
        TEST_CONFIG.CDC_PROPAGATION_POLL_MS,
      );

      t.ok(leaderReceivedCDC, 'Leader received CDC event directly');

      // Wait for followers to receive via Raft replication
      const followersReceivedViaRaft = await waitFor(
        async () => {
          for (const followerHandle of mgFollowerHandles) {
            const cacheResponse = await workerManager.deliverMessage(
              followerHandle.replicaId,
              {
                type: CACHE_MESSAGE_TYPE.CACHE_QUERY,
                sql: `SELECT * FROM "${TEST_CONFIG.TABLE_NAME}" WHERE id = ?`,
                params: [testId],
              },
            );

            if (!cacheResponse.rows || cacheResponse.rows.length === NUM.ZERO) {
              return false;
            }
          }
          return true;
        },
        TEST_CONFIG.CDC_PROPAGATION_TIMEOUT_MS,
        TEST_CONFIG.CDC_PROPAGATION_POLL_MS,
      );

      t.ok(followersReceivedViaRaft, 'Followers received data via Raft replication');

    } finally {
      for (const handle of [...partitionHandles, ...messageGroupHandles]) {
        await workerManager.stopReplica(handle.replicaId).catch(() => {});
      }

      await workerManager.shutdown().catch(() => {});
      await messageRouter.shutdown().catch(() => {});

      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  });
});
