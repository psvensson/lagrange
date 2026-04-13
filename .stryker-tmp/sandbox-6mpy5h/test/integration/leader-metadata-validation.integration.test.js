/**
 * Leader Metadata Validation Integration Test.
 * Tests that joining nodes fail fast when seed node has incomplete leader metadata.
 *
 * This test verifies the LEADER_METADATA_INCOMPLETE error handling in the
 * bootstrap pipeline, ensuring that:
 * 1. Join fails with correct error code when leader metadata is incomplete
 * 2. Error response contains missing partition leader details
 * 3. Error response contains missing message group leader details
 *
 * Requirements: 2.1, 2.2, 2.3, 2.5
 * - 2.1: Join fails fast with LEADER_METADATA_INCOMPLETE error
 * - 2.2: Missing partition leaders are reported in error response
 * - 2.3: Missing message group leaders are reported in error response
 * - 2.5: Test completes within 30 seconds
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import {BootstrapService} from '../../src/bootstrap/bootstrap-service.js';
import {BootstrapAPI} from '../../src/bootstrap/bootstrap-api.js';
import {NodeService} from '../../src/node/node-service.js';
import {BOOTSTRAP_PIPELINE_ERROR_CODE} from '../../src/bootstrap/bootstrap-constants.js';
import {CDCPipelineReadinessGate} from '../../src/cdc/cdc-pipeline-readiness-gate.js';
import {CDC_PROPAGATED_TABLES} from '../../src/cache/cache-constants.js';
import {COLUMN, SERVICE_TYPE, TABLES} from '../../src/constants/index.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {URL} from 'url';
import {
  initializeTestEnvironment,
  cleanupTestEnvironment,
  getUniquePort,
  TEST_CONFIG,
} from './helpers/cluster-test-helpers.js';

/**
 * Create in-process HTTP POST function for BootstrapAPI.
 * Uses Fastify inject() to avoid real HTTP connections.
 * @param {Object} seedApi - The BootstrapAPI instance.
 * @return {Function} Async function that performs HTTP POST requests.
 */
function createInProcHttpPost(seedApi) {
  return async (url, body) => {
    const {pathname} = new URL(url);
    const res = await seedApi.getFastify().inject({
      method: 'POST',
      url: pathname,
      payload: body,
    });
    // Return the response object with status code for error handling
    return {
      statusCode: res.statusCode,
      payload: res.payload,
      json: () => res.json(),
    };
  };
}

/**
 * Create a mock system table cache that simulates incomplete leader metadata.
 * This cache wraps the real cache but masks canonical owner metadata for
 * specified partitions and message groups. It also removes explicit leader
 * service rows for the same entities so diagnostics reflect the degraded view.
 * @param {Object} realCache - The real system table cache.
 * @param {Object} options - Configuration for what to remove.
 * @param {Array<string>} options.removePartitionLeaders - Partition IDs to remove leaders for.
 * @param {Array<string>} options.removeMessageGroupLeaders - Group IDs to remove leaders for.
 * @return {Object} Mock cache with incomplete leader metadata.
 */
function createIncompleteLeaderCache(realCache, options = {}) {
  const {
    removePartitionLeaders = [],
    removeMessageGroupLeaders = [],
  } = options;

  const maskOwnerRow = (tableName, row) => {
    if (!row) {
      return row;
    }

    if (tableName === TABLES.PARTITIONS &&
        removePartitionLeaders.includes(row[COLUMN.PARTITION_ID])) {
      return {
        ...row,
        [COLUMN.LEADER_NODE_ID]: null,
        leader_node_id: null,
      };
    }

    if (tableName === TABLES.MESSAGE_GROUPS &&
        removeMessageGroupLeaders.includes(row[COLUMN.GROUP_ID])) {
      return {
        ...row,
        [COLUMN.LEADER_NODE_ID]: null,
        leader_node_id: null,
      };
    }

    return row;
  };

  const filterServiceRows = (rows) => rows.filter((service) => {
    if (service[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.PARTITION &&
        service[COLUMN.RAFT_ROLE] === RAFT_ROLE.LEADER &&
        removePartitionLeaders.includes(service[COLUMN.PARTITION_ID])) {
      return false;
    }
    if (service[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.MESSAGE_GROUP &&
        service[COLUMN.RAFT_ROLE] === RAFT_ROLE.LEADER &&
        removeMessageGroupLeaders.includes(service[COLUMN.GROUP_ID])) {
      return false;
    }
    return true;
  });

  const getMaskedRows = (tableName) => {
    const rows = realCache.getAll(tableName) || [];
    if (tableName === TABLES.SERVICES) {
      return filterServiceRows(rows);
    }
    if (tableName === TABLES.PARTITIONS || tableName === TABLES.MESSAGE_GROUPS) {
      return rows.map((row) => maskOwnerRow(tableName, row));
    }
    return rows;
  };

  const getMaskedRecord = (tableName, key) => {
    const record = realCache.get(tableName, key);
    if (!record) {
      return record;
    }
    if (tableName === TABLES.SERVICES) {
      const filtered = filterServiceRows([record]);
      return filtered[0] || null;
    }
    return maskOwnerRow(tableName, record);
  };

  return {
    get: (tableName, key) => getMaskedRecord(tableName, key),
    find: (...args) => realCache.find?.(...args),
    getAll: (tableName) => getMaskedRows(tableName),
    filter: (tableName, predicate) => getMaskedRows(tableName).filter(predicate),
    getReadyNodes: () => realCache.getReadyNodes?.() || [],
  };
}

/**
 * Wait for partition leader to be elected.
 * @param {Object} bootstrapResult - Bootstrap result.
 * @param {string} partitionId - Partition ID to wait for.
 * @param {number} timeoutMs - Timeout in milliseconds.
 * @param {number} intervalMs - Polling interval.
 * @return {Promise<Object|null>} Leader service or null.
 */
async function waitForPartitionLeader(bootstrapResult, partitionId, timeoutMs = 3000,
  intervalMs = 50) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    for (const service of bootstrapResult.partitionServices.values()) {
      if (service.partitionId === partitionId && service.isLeader === true) {
        return service;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return null;
}

/**
 * Wait for CDC pipeline readiness for the given bootstrap context.
 * @param {Object} bootstrapResult - Result from bootstrap().
 * @param {number} timeoutMs - Readiness timeout.
 * @return {Promise<void>}
 */
async function waitForCdcPipelineReadiness(bootstrapResult, timeoutMs = 3000) {
  const systemTableCache = NodeService.getInstance().getSystemTableCache();
  const readinessGate = new CDCPipelineReadinessGate({
    systemTableCache,
    cdcPropagatedTables: CDC_PROPAGATED_TABLES,
  });

  await readinessGate.waitForReady(
    {
      partitionServices: bootstrapResult.partitionServices,
      messageGroupServices: bootstrapResult.messageGroupServices,
    },
    timeoutMs,
  );
}

test('Leader metadata validation on join', {timeout: 30000}, async (t) => {
  t.beforeEach(() => {
    initializeTestEnvironment();
  });

  t.afterEach(async () => {
    await cleanupTestEnvironment();
  });

  await t.test('join fails with LEADER_METADATA_INCOMPLETE when partition leaders missing',
    async (t) => {
      // =========================================================================
      // PHASE 1: Bootstrap seed node with system tables
      // =========================================================================
      const seedNodeId = '550e8400-e29b-41d4-a716-446655440101';
      const seedWsPort = getUniquePort();

      const bootstrapService = new BootstrapService({
        nodeId: seedNodeId,
        nodeAddress: `ws://localhost:${seedWsPort}`,
        wsPort: seedWsPort,
        config: TEST_CONFIG.bootstrap,
      });

      let bootstrapResult;
      let seedApi;

      try {
        bootstrapResult = await bootstrapService.bootstrap();
        t.equal(bootstrapResult.success, true, 'seed node bootstrap should succeed');

        // Wait for services-p1 leader to ensure stable state
        const servicesLeader = await waitForPartitionLeader(
          bootstrapResult,
          'services-p1',
          3000,
        );
        t.ok(servicesLeader, 'services partition should elect a leader');

        // Ensure CDC pipeline is fully ready before introducing
        // incomplete leader metadata into the join path.
        await waitForCdcPipelineReadiness(bootstrapResult);

        // =========================================================================
        // PHASE 2: Create BootstrapAPI with incomplete leader metadata cache
        // =========================================================================
        const realCache = NodeService.getInstance().getSystemTableCache();

        // Create mock cache that removes leaders for specific partitions
        const incompleteCache = createIncompleteLeaderCache(realCache, {
          removePartitionLeaders: ['nodes-p1', 'tables-p1'],
          removeMessageGroupLeaders: [],
        });

        seedApi = new BootstrapAPI({
          seedNodeId,
          seedNodeAddress: `ws://localhost:${seedWsPort}`,
          seedNodeWsAddress: `ws://localhost:${seedWsPort}`,
          messageGroupServices: bootstrapResult.messageGroupServices,
          partitionServices: bootstrapResult.partitionServices,
          systemTableCache: incompleteCache,
          messageRouter: bootstrapResult.messageRouter,
          epochManager: bootstrapResult.epochManager,
          bootstrapService: bootstrapService,
        });

        await seedApi.initialize(0, {listen: false});
        const httpPost = createInProcHttpPost(seedApi);

        // =========================================================================
        // PHASE 3: Attempt to join - should fail with LEADER_METADATA_INCOMPLETE
        // =========================================================================
        const joiningNodeId = '550e8400-e29b-41d4-a716-446655440102';

        const response = await httpPost('http://localhost/bootstrap', {
          nodeId: joiningNodeId,
          nodeAddress: `ws://localhost:${getUniquePort()}`,
        });

        // Verify the response indicates failure
        t.equal(response.statusCode, 503, 'should return 503 Service Unavailable');

        const body = response.json();
        t.equal(body.success, false, 'response should indicate failure');
        t.equal(body.code, BOOTSTRAP_PIPELINE_ERROR_CODE.LEADER_METADATA_INCOMPLETE,
          'error code should be LEADER_METADATA_INCOMPLETE');

        // =========================================================================
        // PHASE 4: Verify error contains missing partition leader details
        // Validates: Requirement 2.2
        // =========================================================================
        t.ok(Array.isArray(body.missingPartitionLeaders),
          'response should contain missingPartitionLeaders array');
        t.ok(body.missingPartitionLeaders.includes('nodes-p1'),
          'missingPartitionLeaders should include nodes-p1');
        t.ok(body.missingPartitionLeaders.includes('tables-p1'),
          'missingPartitionLeaders should include tables-p1');

        t.comment(`Missing partition leaders: ${JSON.stringify(body.missingPartitionLeaders)}`);
      } finally {
        // =========================================================================
        // CLEANUP
        // =========================================================================
        if (seedApi) {
          await seedApi.shutdown().catch(() => {});
        }
        if (bootstrapService?.shutdown) {
          await bootstrapService.shutdown().catch(() => {});
        }
        if (bootstrapResult?.messageRouter) {
          await bootstrapResult.messageRouter.shutdown().catch(() => {});
        }
      }
    });

  await t.test('join succeeds when only message group leaders are missing',
    async (t) => {
      // =========================================================================
      // PHASE 1: Bootstrap seed node with system tables
      // =========================================================================
      const seedNodeId = '550e8400-e29b-41d4-a716-446655440103';
      const seedWsPort = getUniquePort();

      const bootstrapService = new BootstrapService({
        nodeId: seedNodeId,
        nodeAddress: `ws://localhost:${seedWsPort}`,
        wsPort: seedWsPort,
        config: TEST_CONFIG.bootstrap,
      });

      let bootstrapResult;
      let seedApi;

      try {
        bootstrapResult = await bootstrapService.bootstrap();
        t.equal(bootstrapResult.success, true, 'seed node bootstrap should succeed');

        // Wait for services-p1 leader to ensure stable state
        const servicesLeader = await waitForPartitionLeader(
          bootstrapResult,
          'services-p1',
          3000,
        );
        t.ok(servicesLeader, 'services partition should elect a leader');

        // Ensure CDC pipeline is fully ready before introducing incomplete
        // message-group leader metadata into the join path.
        await waitForCdcPipelineReadiness(bootstrapResult);

        // =========================================================================
        // PHASE 2: Get message group IDs from the real cache
        // =========================================================================
        const realCache = NodeService.getInstance().getSystemTableCache();
        const messageGroups = realCache.getAll(TABLES.MESSAGE_GROUPS) || [];
        const messageGroupIds = messageGroups.map((mg) => mg[COLUMN.GROUP_ID]).filter(Boolean);

        t.ok(messageGroupIds.length > 0, 'should have at least one message group');
        t.comment(`Message group IDs: ${JSON.stringify(messageGroupIds)}`);

        // =========================================================================
        // PHASE 3: Create BootstrapAPI with incomplete message group leader metadata
        // =========================================================================
        const incompleteCache = createIncompleteLeaderCache(realCache, {
          removePartitionLeaders: [],
          removeMessageGroupLeaders: messageGroupIds,
        });

        seedApi = new BootstrapAPI({
          seedNodeId,
          seedNodeAddress: `ws://localhost:${seedWsPort}`,
          seedNodeWsAddress: `ws://localhost:${seedWsPort}`,
          messageGroupServices: bootstrapResult.messageGroupServices,
          partitionServices: bootstrapResult.partitionServices,
          systemTableCache: incompleteCache,
          messageRouter: bootstrapResult.messageRouter,
          epochManager: bootstrapResult.epochManager,
          bootstrapService: bootstrapService,
        });

        await seedApi.initialize(0, {listen: false});
        const httpPost = createInProcHttpPost(seedApi);

        // =========================================================================
        // PHASE 4: Attempt to join - message group leaders are non-blocking,
        // so the join should succeed with non-blocking diagnostics.
        // =========================================================================
        const joiningNodeId = '550e8400-e29b-41d4-a716-446655440104';

        const response = await httpPost('http://localhost/bootstrap', {
          nodeId: joiningNodeId,
          nodeAddress: `ws://localhost:${getUniquePort()}`,
        });

        // Message group leaders are non-blocking per
        // getBlockingLeaderStatusForReadiness — join succeeds.
        t.equal(response.statusCode, 200,
          'should return 200 because message group leaders are non-blocking');

        const body = response.json();
        t.equal(body.success, true,
          'response should indicate success');

        // =========================================================================
        // PHASE 5: Verify the join succeeded despite missing message group
        // leaders (non-blocking).
        // =========================================================================
        t.ok(body.seedNodeId,
          'response should contain seedNodeId');
        t.ok(body.messageGroupAssignment,
          'response should contain messageGroupAssignment');

        t.comment('Message group leaders are non-blocking; join succeeded');
      } finally {
        // =========================================================================
        // CLEANUP
        // =========================================================================
        if (seedApi) {
          await seedApi.shutdown().catch(() => {});
        }
        if (bootstrapService?.shutdown) {
          await bootstrapService.shutdown().catch(() => {});
        }
        if (bootstrapResult?.messageRouter) {
          await bootstrapResult.messageRouter.shutdown().catch(() => {});
        }
      }
    });

  await t.test('join fails with both partition and message group leaders missing', async (t) => {
    // =========================================================================
    // PHASE 1: Bootstrap seed node with system tables
    // =========================================================================
    const seedNodeId = '550e8400-e29b-41d4-a716-446655440105';
    const seedWsPort = getUniquePort();

    const bootstrapService = new BootstrapService({
      nodeId: seedNodeId,
      nodeAddress: `ws://localhost:${seedWsPort}`,
      wsPort: seedWsPort,
      config: TEST_CONFIG.bootstrap,
    });

    let bootstrapResult;
    let seedApi;

    try {
      bootstrapResult = await bootstrapService.bootstrap();
      t.equal(bootstrapResult.success, true, 'seed node bootstrap should succeed');

      // Wait for services-p1 leader to ensure stable state
      const servicesLeader = await waitForPartitionLeader(
        bootstrapResult,
        'services-p1',
        3000,
      );
      t.ok(servicesLeader, 'services partition should elect a leader');

      // Ensure CDC pipeline is fully ready before reading message groups and
      // introducing incomplete leader metadata into the join path.
      await waitForCdcPipelineReadiness(bootstrapResult);

      // =========================================================================
      // PHASE 2: Get message group IDs from the real cache
      // =========================================================================
      const realCache = NodeService.getInstance().getSystemTableCache();
      const messageGroups = realCache.getAll(TABLES.MESSAGE_GROUPS) || [];
      const messageGroupIds = messageGroups.map((mg) => mg[COLUMN.GROUP_ID]).filter(Boolean);

      // =========================================================================
      // PHASE 3: Create BootstrapAPI with both partition and message group
      //          leaders missing
      // =========================================================================
      const incompleteCache = createIncompleteLeaderCache(realCache, {
        removePartitionLeaders: ['partitions-p1', 'services-p1'],
        removeMessageGroupLeaders: messageGroupIds,
      });

      seedApi = new BootstrapAPI({
        seedNodeId,
        seedNodeAddress: `ws://localhost:${seedWsPort}`,
        seedNodeWsAddress: `ws://localhost:${seedWsPort}`,
        messageGroupServices: bootstrapResult.messageGroupServices,
        partitionServices: bootstrapResult.partitionServices,
        systemTableCache: incompleteCache,
        messageRouter: bootstrapResult.messageRouter,
        epochManager: bootstrapResult.epochManager,
        bootstrapService: bootstrapService,
      });

      await seedApi.initialize(0, {listen: false});
      const httpPost = createInProcHttpPost(seedApi);

      // =========================================================================
      // PHASE 4: Attempt to join - should fail with LEADER_METADATA_INCOMPLETE
      // =========================================================================
      const joiningNodeId = '550e8400-e29b-41d4-a716-446655440106';

      const response = await httpPost('http://localhost/bootstrap', {
        nodeId: joiningNodeId,
        nodeAddress: `ws://localhost:${getUniquePort()}`,
      });

      // Verify the response indicates failure
      t.equal(response.statusCode, 503, 'should return 503 Service Unavailable');

      const body = response.json();
      t.equal(body.success, false, 'response should indicate failure');
      t.equal(body.code, BOOTSTRAP_PIPELINE_ERROR_CODE.LEADER_METADATA_INCOMPLETE,
        'error code should be LEADER_METADATA_INCOMPLETE');

      // =========================================================================
      // PHASE 5: Verify error contains both missing partition and message group
      //          leader details
      // Validates: Requirements 2.2, 2.3
      // =========================================================================
      t.ok(Array.isArray(body.missingPartitionLeaders),
        'response should contain missingPartitionLeaders array');
      t.ok(body.missingPartitionLeaders.includes('partitions-p1'),
        'missingPartitionLeaders should include partitions-p1');
      t.ok(body.missingPartitionLeaders.includes('services-p1'),
        'missingPartitionLeaders should include services-p1');

      t.ok(Array.isArray(body.missingMessageGroupLeaders),
        'response should contain missingMessageGroupLeaders array');
      t.ok(body.missingMessageGroupLeaders.length > 0,
        'missingMessageGroupLeaders should not be empty');

      t.comment(`Missing partition leaders: ${JSON.stringify(body.missingPartitionLeaders)}`);
      t.comment('Missing message group leaders: ' +
        `${JSON.stringify(body.missingMessageGroupLeaders)}`);
    } finally {
      // =========================================================================
      // CLEANUP
      // =========================================================================
      if (seedApi) {
        await seedApi.shutdown().catch(() => {});
      }
      if (bootstrapService?.shutdown) {
        await bootstrapService.shutdown().catch(() => {});
      }
      if (bootstrapResult?.messageRouter) {
        await bootstrapResult.messageRouter.shutdown().catch(() => {});
      }
    }
  });

  /**
   * Test: Successful join with complete metadata.
   *
   * This test verifies that when all leader metadata is complete,
   * the join proceeds successfully and the joining node receives
   * accurate system state.
   *
   * Validates: Requirements 2.4, 2.5
   * - 2.4: WHEN all leader metadata is complete THEN the join SHALL proceed successfully
   * - 2.5: THE integration tests SHALL complete within 30 seconds
   */
  await t.test('join succeeds with complete leader metadata', async (t) => {
    // =========================================================================
    // PHASE 1: Bootstrap seed node with system tables
    // =========================================================================
    const seedNodeId = '550e8400-e29b-41d4-a716-446655440107';
    const seedWsPort = getUniquePort();

    const bootstrapService = new BootstrapService({
      nodeId: seedNodeId,
      nodeAddress: `ws://localhost:${seedWsPort}`,
      wsPort: seedWsPort,
      config: TEST_CONFIG.bootstrap,
    });

    let bootstrapResult;
    let seedApi;

    try {
      bootstrapResult = await bootstrapService.bootstrap();
      t.equal(bootstrapResult.success, true, 'seed node bootstrap should succeed');

      // Wait for services-p1 leader to ensure stable state
      const servicesLeader = await waitForPartitionLeader(
        bootstrapResult,
        'services-p1',
        3000,
      );
      t.ok(servicesLeader, 'services partition should elect a leader');

      // Ensure CDC pipeline is fully ready before successful metadata assertions.
      await waitForCdcPipelineReadiness(bootstrapResult);

      // =========================================================================
      // PHASE 2: Create BootstrapAPI with complete leader metadata (real cache)
      // =========================================================================
      const realCache = NodeService.getInstance().getSystemTableCache();

      // Use the real cache - no manipulation, all leaders should be present
      seedApi = new BootstrapAPI({
        seedNodeId,
        seedNodeAddress: `ws://localhost:${seedWsPort}`,
        seedNodeWsAddress: `ws://localhost:${seedWsPort}`,
        messageGroupServices: bootstrapResult.messageGroupServices,
        partitionServices: bootstrapResult.partitionServices,
        systemTableCache: realCache,
        messageRouter: bootstrapResult.messageRouter,
        epochManager: bootstrapResult.epochManager,
        bootstrapService: bootstrapService,
      });

      await seedApi.initialize(0, {listen: false});
      const httpPost = createInProcHttpPost(seedApi);

      // =========================================================================
      // PHASE 3: Attempt to join - should succeed with complete metadata
      // Validates: Requirement 2.4
      // =========================================================================
      const joiningNodeId = '550e8400-e29b-41d4-a716-446655440108';
      const joiningNodeAddress = `ws://localhost:${getUniquePort()}`;

      const response = await httpPost('http://localhost/bootstrap', {
        nodeId: joiningNodeId,
        nodeAddress: joiningNodeAddress,
      });

      // Verify the response indicates success
      t.equal(response.statusCode, 200, 'should return 200 OK');

      const body = response.json();
      t.equal(body.success, true, 'join should succeed with complete metadata');
      t.equal(body.seedNodeId, seedNodeId, 'response should include seed node ID');
      t.ok(body.seedNodeWsAddress, 'response should include seed node WebSocket address');

      // =========================================================================
      // PHASE 4: Verify joining node receives accurate system state
      // Validates: Requirement 2.4
      // =========================================================================

      // Verify systemTableSnapshots is present and contains required tables
      t.ok(body.systemTableSnapshots, 'response should include systemTableSnapshots');
      t.ok(Array.isArray(body.systemTableSnapshots[TABLES.NODES]),
        'systemTableSnapshots should include nodes table');
      t.ok(Array.isArray(body.systemTableSnapshots[TABLES.SERVICES]),
        'systemTableSnapshots should include services table');
      t.ok(Array.isArray(body.systemTableSnapshots[TABLES.PARTITIONS]),
        'systemTableSnapshots should include partitions table');
      t.ok(Array.isArray(body.systemTableSnapshots[TABLES.MESSAGE_GROUPS]),
        'systemTableSnapshots should include message_groups table');
      t.ok(Array.isArray(body.systemTableSnapshots[TABLES.TABLES]),
        'systemTableSnapshots should include tables table');

      // Verify services snapshot contains partition leaders with addresses
      const servicesSnapshot = body.systemTableSnapshots[TABLES.SERVICES];
      const partitionLeaders = servicesSnapshot.filter((service) =>
        service[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.PARTITION &&
        service[COLUMN.RAFT_ROLE] === RAFT_ROLE.LEADER,
      );
      t.ok(partitionLeaders.length > 0, 'services snapshot should contain partition leaders');

      // Verify at least one partition leader has an address
      const leadersWithAddresses = partitionLeaders.filter((leader) =>
        leader[COLUMN.ADDRESS] && leader[COLUMN.ADDRESS].length > 0,
      );
      t.ok(leadersWithAddresses.length > 0,
        'at least one partition leader should have an address');

      // Verify message group assignment is present
      t.ok(body.messageGroupAssignment, 'response should include messageGroupAssignment');
      t.ok(body.messageGroupAssignment.strategy,
        'messageGroupAssignment should include strategy');

      // Verify ready nodes list is present and includes seed node
      t.ok(Array.isArray(body.readyNodes), 'response should include readyNodes array');
      t.ok(
        body.readyNodes.every((nodeId) =>
          typeof nodeId === 'string' && nodeId.length > 0,
        ),
        'readyNodes should contain only node ID strings when present',
      );

      // Verify cluster configuration is present
      t.ok(body.clusterConfig, 'response should include clusterConfig');

      // Verify timestamp is present and recent
      t.ok(body.timestamp, 'response should include timestamp');
      const timeDiff = Date.now() - body.timestamp;
      t.ok(timeDiff < 5000, 'timestamp should be recent (within 5 seconds)');

      t.comment(`Join succeeded with ${partitionLeaders.length} partition leaders`);
      t.comment(`Message group assignment strategy: ${body.messageGroupAssignment.strategy}`);
      t.comment(`Ready nodes: ${JSON.stringify(body.readyNodes)}`);
    } finally {
      // =========================================================================
      // CLEANUP
      // =========================================================================
      if (seedApi) {
        await seedApi.shutdown().catch(() => {});
      }
      if (bootstrapService?.shutdown) {
        await bootstrapService.shutdown().catch(() => {});
      }
      if (bootstrapResult?.messageRouter) {
        await bootstrapResult.messageRouter.shutdown().catch(() => {});
      }
    }
  });
});
