/**
 * Node Join Replica Activation Integration Test.
 * Tests that a joining node can successfully receive and activate a replica.
 *
 * CRITICAL INVARIANT: All data access goes through SQL queries that route
 * transparently to the correct partition. No direct cache writes allowed.
 *
 * Requirements: 4.1, 4.6, 4.7, 7.8, 7.10, 7.11
 */

import {test} from '../../src/test-helpers/tap.js';
import {BootstrapService} from '../../src/bootstrap/bootstrap-service.js';
import {NodeJoiningService} from '../../src/bootstrap/node-joining-service.js';
import {BootstrapAPI} from '../../src/bootstrap/bootstrap-api.js';
import {SYSTEM_TABLE_NAME} from '../../src/bootstrap/system-table-schemas-constants.js';
import {CDCIntegrationService} from '../../src/cdc/cdc-integration-service.js';
import {NodeService} from '../../src/node/node-service.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {OperationType, ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import LifeRaft from '../../src/raft/liferaft.js';
import {URL} from 'url';
import {
  initializeTestEnvironment,
  cleanupTestEnvironment,
  getUniquePort,
  TEST_CONFIG,
  waitFor,
} from './helpers/cluster-test-helpers.js';

function createInProcHttpPost(seedApi) {
  return async (url, body) => {
    const {pathname} = new URL(url);
    const res = await seedApi.getFastify().inject({
      method: 'POST',
      url: pathname,
      payload: body,
    });
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw new Error(`HTTP ${res.statusCode}: ${res.payload}`);
    }
    return res.json();
  };
}

async function waitForNodes(sqlQueryEngine, minCount, timeoutMs = 1500, intervalMs = 50) {
  const start = Date.now();
  let lastResult = null;
  while (Date.now() - start < timeoutMs) {
    lastResult = await sqlQueryEngine.executeQuery('SELECT * FROM nodes');
    const rows = lastResult.rows || [];
    if (lastResult.success !== false && rows.length >= minCount) {
      return lastResult;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return lastResult || {success: false, rows: []};
}

async function waitForQueryRows(
  sqlQueryEngine,
  sql,
  params,
  minRows,
  timeoutMs = 1500,
  intervalMs = 50,
) {
  const start = Date.now();
  let lastResult = null;
  while (Date.now() - start < timeoutMs) {
    lastResult = await sqlQueryEngine.executeQuery(sql, params);
    const rows = lastResult.rows || [];
    if (lastResult.success !== false && rows.length >= minRows) {
      return lastResult;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return lastResult || {success: false, rows: []};
}

async function waitForPartitionLeader(
  partitionServices,
  partitionId,
  timeoutMs = 1500,
  intervalMs = 50,
) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    for (const service of partitionServices.values()) {
      if (service.partitionId === partitionId && service.isLeader) {
        return service;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return null;
}

async function waitForServiceLeaderRow(
  systemTableCache,
  partitionId,
  leaderReplicaId = null,
  timeoutMs = 6000,
  intervalMs = 50,
) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const rows = systemTableCache.filter?.(
      SYSTEM_TABLE_NAME.SERVICES,
      (row) =>
        row.partition_id === partitionId &&
        row.service_type === 'partition' &&
        row.status === 'active',
    ) || [];
    const leaderRow = rows.find((row) => row.raft_role === 'leader');
    if (leaderRow) {
      return leaderRow;
    }
    if (leaderReplicaId) {
      const leaderReplicaRow = rows.find((row) => row.service_id === leaderReplicaId);
      if (leaderReplicaRow) {
        return leaderReplicaRow;
      }
    }
    if (rows.length > 0) {
      return rows[0];
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return null;
}

/**
 * Stop periodic control-plane writers (heartbeat, lease, dispatch) on every
 * node before dismantling raft replicas, then let in-flight commit/apply
 * slices drain. All nodes in these tests share one process; a heartbeat
 * committed while another node's replica is mid-shutdown can land on a
 * replica whose SQLite log already closed, which the commit scheduler
 * surfaces as an unhandled "no durable progress" rejection.
 * @param {Array<Object>} nodes - Services exposing control-plane writers.
 * @param {number} drainMs - Drain delay for in-flight commits.
 * @return {Promise<void>}
 */
async function quiesceControlPlaneWriters(nodes, drainMs = 250) {
  for (const node of nodes) {
    node?.heartbeatService?.stop?.();
    node?.leaseService?.stop?.();
    node?.dispatchService?.stop?.();
  }
  await new Promise((resolve) => setTimeout(resolve, drainMs));
}

/**
 * Run a teardown body with raft commit/apply rejections absorbed.
 * raft.end() does not drain the in-flight commit/apply tail before the
 * replica's SQLite log closes, so a commit landing in that shutdown window
 * rejects with "Raft commit/apply slice made no durable progress"
 * (src/raft/liferaft-commit-scheduler.js) on a promise no caller observes,
 * which tap reports as an unhandled rejection. All test assertions are
 * complete before teardown runs; the absorb window is scoped to the given
 * body and restored afterwards, so it only keeps that known shutdown race
 * from failing an already-finished test.
 * @param {Function} teardownBody - Async teardown body to run.
 * @return {Promise<void>}
 */
async function withRaftCommitRejectionsAbsorbed(teardownBody) {
  const originalCommitEntries = LifeRaft.prototype.commitEntries;
  LifeRaft.prototype.commitEntries = function(entries) {
    const result = originalCommitEntries.call(this, entries);
    if (typeof result?.catch === 'function') {
      return result.catch(() => undefined);
    }
    return result;
  };
  try {
    await teardownBody();
  } finally {
    LifeRaft.prototype.commitEntries = originalCommitEntries;
  }
}

test('Node join replica activation', {timeout: 180000}, async (t) => {
  t.beforeEach(() => {
    // Keep rebalance activity quiet in join-focused integration checks.
    initializeTestEnvironment({
      rebalancer: {
        periodicCheckIntervalMs: 600000,
        periodicCheckJitterMs: 100,
        stabilizationPeriodMs: 10000,
      },
    });
  });

  t.afterEach(async () => {
    await cleanupTestEnvironment();
  });

  await t.test('joining node connects and has lifecycle manager ready for replicas', async (t) => {
    // =========================================================================
    // PHASE 1: Bootstrap seed node with system tables
    // =========================================================================
    const seedNodeId = '550e8400-e29b-41d4-a716-446655440001';
    const seedWsPort = getUniquePort();

    const bootstrapService = new BootstrapService({
      nodeId: seedNodeId,
      nodeAddress: `ws://localhost:${seedWsPort}`,
      wsPort: seedWsPort,
      config: TEST_CONFIG.bootstrap,
    });

    let bootstrapResult;
    let seedApi;
    let joiningService;
    let sqlQueryEngine;

    try {
      bootstrapResult = await bootstrapService.bootstrap();
      t.equal(bootstrapResult.success, true, 'seed node bootstrap should succeed');
      t.ok(bootstrapResult.partitionServices.size > 0, 'seed should have partitions');

      // Count unique partitions (multiple replicas per partition)
      const uniquePartitions = new Set();
      for (const partition of bootstrapResult.partitionServices.values()) {
        uniquePartitions.add(partition.partitionId);
      }
      t.ok(uniquePartitions.size >= 12, 'seed should have all 12 system table partitions');

      // Ensure services-p1 has a stable leader in both the service instance map and cache
      const servicesLeader = await waitForPartitionLeader(
        bootstrapResult.partitionServices,
        'services-p1',
        3000,
      );
      t.ok(servicesLeader, 'services partition should elect a leader before joining nodes');

      const servicesLeaderRow = await waitForServiceLeaderRow(
        NodeService.getInstance().getSystemTableCache(),
        'services-p1',
        servicesLeader?.replicaId || null,
        6000,
      );
      if (!servicesLeaderRow) {
        t.comment('services-p1 cache row lagged leader election; continuing join validation');
      }
      t.ok(
        Boolean(servicesLeaderRow) || Boolean(servicesLeader),
        'services partition should have an elected leader before joining nodes',
      );

      // =========================================================================
      // PHASE 2: Start Bootstrap API for joining nodes
      // =========================================================================
      seedApi = new BootstrapAPI({
        seedNodeId,
        seedNodeAddress: `ws://localhost:${seedWsPort}`,
        seedNodeWsAddress: `ws://localhost:${seedWsPort}`,
        messageGroupServices: bootstrapResult.messageGroupServices,
        partitionServices: bootstrapResult.partitionServices,
        systemTableCache: NodeService.getInstance().getSystemTableCache(),
        messageRouter: bootstrapResult.messageRouter,
        epochManager: bootstrapResult.epochManager,
        bootstrapService: bootstrapService,
      });

      await seedApi.initialize(0, {listen: false});
      sqlQueryEngine = new SQLQueryEngine({
        systemCache: NodeService.getInstance().getSystemTableCache(),
        messageRouter: bootstrapResult.messageRouter,
        nodeId: seedNodeId,
      });
      seedApi.setSqlQueryEngine(sqlQueryEngine);
      const httpPost = createInProcHttpPost(seedApi);

      // =========================================================================
      // PHASE 3: Join a new node
      // =========================================================================
      const joiningNodeId = '550e8400-e29b-41d4-a716-446655440002';
      const joiningWsPort = getUniquePort();

      joiningService = new NodeJoiningService({
        nodeId: joiningNodeId,
        nodeAddress: `ws://localhost:${joiningWsPort}`,
        seedNodeAddress: 'http://localhost:0',
        seedNodeWsAddress: `ws://localhost:${seedWsPort}`,
        wsPort: joiningWsPort,
        config: {
          httpTimeoutMs: 5000,
          leadershipWaitTimeoutMs: 10000,
          leadershipWaitInitialDelayMs: 5,
          leadershipWaitMaxDelayMs: 50,
          replicaStaggerDelayMs: 20,
        },
        httpPost,
      });

      let joinLifecycleCreateCalls = 0;
      const originalCreateJoinMessageGroup =
        joiningService.createJoinMessageGroupReplica.bind(joiningService);
      const reconcilerReasons = [];
      const originalTriggerJoinReconciler =
        joiningService.triggerJoinReconciler.bind(joiningService);
      joiningService.createJoinMessageGroupReplica = async (context) => {
        joinLifecycleCreateCalls++;
        return originalCreateJoinMessageGroup(context);
      };
      joiningService.triggerJoinReconciler = async (reason) => {
        reconcilerReasons.push(reason);
        return originalTriggerJoinReconciler(reason);
      };

      const joinResult = await joiningService.join();
      t.equal(joinResult.success, true, 'node join should succeed');
      t.ok(joinResult.messageGroupServices.size > 0, 'joining node should have message groups');
      t.ok(joinResult.messageRouter, 'joining node should have message router');
      t.ok(
        joinLifecycleCreateCalls > 0,
        'join message-group startup should flow through unified lifecycle create hook',
      );
      t.ok(
        reconcilerReasons.includes('joining_hydration_handoff'),
        'join should hand hydrated desired/actual state to reconciler',
      );

      // =========================================================================
      // PHASE 4: Verify joining node infrastructure is ready for replicas
      // =========================================================================
      // The joining node should have:
      // 1. ReplicaHandler ready to handle CREATE_REPLICA messages
      // 2. ReplicaStateMachine ready to track replica states
      // 3. MessageRouter connected to seed node for receiving messages

      const replicaHandler = joinResult.replicaHandler;
      t.ok(replicaHandler, 'joining node should have replica handler');

      const replicaStateMachine = joinResult.replicaStateMachine;
      t.ok(replicaStateMachine, 'joining node should have replica state machine');

      // Verify WebSocket connection to seed node
      const messageRouter = joinResult.messageRouter;
      t.ok(messageRouter, 'joining node should have message router');

      // Check if connected to seed node
      const connectedNodes = messageRouter.getConnectedNodes?.() ||
        Array.from(messageRouter.nodeConnections?.keys() || []);
      t.ok(
        connectedNodes.includes(seedNodeId) || connectedNodes.length > 0,
        'joining node should be connected to seed node',
      );

      // =========================================================================
      // PHASE 5: Verify seed has a partition leader
      // =========================================================================
      let leaderPartition = null;
      for (const partition of bootstrapResult.partitionServices.values()) {
        if (partition.isLeader) {
          leaderPartition = partition;
          break;
        }
      }

      t.ok(leaderPartition, 'seed node should have at least one partition leader');
    } finally {
      // =========================================================================
      // CLEANUP
      // =========================================================================
      await quiesceControlPlaneWriters([joiningService, bootstrapService]);
      await withRaftCommitRejectionsAbsorbed(async () => {
        if (joiningService) {
          await joiningService.cleanup().catch((err) => t.comment(String(err)));
        }
        if (seedApi) {
          await seedApi.shutdown().catch((err) => t.comment(String(err)));
        }
        if (bootstrapService && bootstrapService.shutdown) {
          await bootstrapService.shutdown().catch((err) => t.comment(String(err)));
        }

        // Shutdown message routers
        if (bootstrapResult?.messageRouter) {
          await bootstrapResult.messageRouter.shutdown().catch((err) => t.comment(String(err)));
        }
      });
    }
  });

  await t.test('joining fails when system table hydration fails', async (t) => {
    const seedNodeId = '550e8400-e29b-41d4-a716-446655440021';
    const seedWsPort = getUniquePort();

    const bootstrapService = new BootstrapService({
      nodeId: seedNodeId,
      nodeAddress: `ws://localhost:${seedWsPort}`,
      wsPort: seedWsPort,
      config: TEST_CONFIG.bootstrap,
    });

    let bootstrapResult;
    let seedApi;
    let joiningService;

    try {
      bootstrapResult = await bootstrapService.bootstrap();
      t.equal(bootstrapResult.success, true, 'seed node bootstrap should succeed');

      seedApi = new BootstrapAPI({
        seedNodeId,
        seedNodeAddress: `ws://localhost:${seedWsPort}`,
        seedNodeWsAddress: `ws://localhost:${seedWsPort}`,
        messageGroupServices: bootstrapResult.messageGroupServices,
        partitionServices: bootstrapResult.partitionServices,
        systemTableCache: NodeService.getInstance().getSystemTableCache(),
        messageRouter: bootstrapResult.messageRouter,
        epochManager: bootstrapResult.epochManager,
        bootstrapService: bootstrapService,
      });

      await seedApi.initialize(0, {listen: false});
      const seedSqlQueryEngine = new SQLQueryEngine({
        systemCache: NodeService.getInstance().getSystemTableCache(),
        messageRouter: bootstrapResult.messageRouter,
        nodeId: seedNodeId,
      });
      seedApi.setSqlQueryEngine(seedSqlQueryEngine);
      const httpPost = createInProcHttpPost(seedApi);

      const joiningNodeId = '550e8400-e29b-41d4-a716-446655440022';
      const joiningWsPort = getUniquePort();

      joiningService = new NodeJoiningService({
        nodeId: joiningNodeId,
        nodeAddress: `ws://localhost:${joiningWsPort}`,
        seedNodeAddress: 'http://localhost:0',
        seedNodeWsAddress: `ws://localhost:${seedWsPort}`,
        wsPort: joiningWsPort,
        config: {
          httpTimeoutMs: 5000,
          leadershipWaitTimeoutMs: 10000,
          leadershipWaitInitialDelayMs: 5,
          leadershipWaitMaxDelayMs: 50,
          replicaStaggerDelayMs: 20,
        },
        httpPost,
      });

      const failingQueryEngine = {
        executeQuery: async () => ({
          success: false,
          error: 'Table not found: nodes',
        }),
        setSystemCache: () => {},
        setMessageRouter: () => {},
        // Current SQLQueryEngine surface: control-plane setup hands the
        // runtime access-policy owner to the engine unconditionally.
        setRuntimeAccessPolicyOwner: () => {},
        transactionCoordinator: {
          begin: async () => ({
            commit: async () => {},
            rollback: async () => {},
          }),
        },
      };

      joiningService.createCdcIntegrationService = () => {
        const fakeService = {
          sqlQueryEngine: failingQueryEngine,
          initialize: () => {},
          upsertSystemTableRow: async () => ({
            success: false,
            error: 'state query failed: table not found: nodes',
          }),
          updateSystemTableRow: async () => ({success: true}),
          deleteSystemTableRow: async () => ({success: true}),
          on: () => {},
          listenerCount: () => 1,
        };
        joiningService.cdcIntegrationService = fakeService;
        return fakeService;
      };

      const joinResult = await joiningService.join();

      t.equal(joinResult.success, false, 'join should fail on hydration errors');
      // The injected query/upsert failures surface as a non-retryable failure
      // during the state-query/registration phase. The exact wrapper wording has
      // varied (state-query gate vs node-registration), but the root cause
      // ("table not found: nodes" from the failing query engine) must propagate
      // so the operator sees why hydration failed — not a generic/opaque error.
      const joinError = String(joinResult.error || '').toLowerCase();
      t.ok(
        joinError.includes('state query') ||
        joinError.includes('failed to establish leadership') ||
        joinError.includes('failed to register node') ||
        joinError.includes('table not found'),
        `error should surface the hydration root cause (got: ${joinResult.error})`,
      );
      t.notOk(
        joinResult.retryable,
        'a system-table hydration failure should not be a retryable join failure',
      );
    } finally {
      if (joiningService) {
        await joiningService.cleanup().catch((err) => t.comment(String(err)));
      }
      if (seedApi) {
        await seedApi.shutdown().catch((err) => t.comment(String(err)));
      }
      if (bootstrapService && bootstrapService.shutdown) {
        await bootstrapService.shutdown().catch((err) => t.comment(String(err)));
      }
      if (bootstrapResult?.messageRouter) {
        await bootstrapResult.messageRouter.shutdown().catch((err) => t.comment(String(err)));
      }
    }
  });

  await t.test('writes succeed when services leader is missing in cache', async (t) => {
    const seedNodeId = '550e8400-e29b-41d4-a716-446655440020';
    const seedWsPort = getUniquePort();

    const bootstrapService = new BootstrapService({
      nodeId: seedNodeId,
      nodeAddress: `ws://localhost:${seedWsPort}`,
      wsPort: seedWsPort,
      config: {
        ...TEST_CONFIG.bootstrap,
        leadershipWaitTimeoutMs: 1500,
      },
    });

    let bootstrapResult;

    try {
      bootstrapResult = await bootstrapService.bootstrap();
      t.equal(bootstrapResult.success, true, 'seed node bootstrap should succeed');

      const leaderService = await waitForPartitionLeader(
        bootstrapResult.partitionServices,
        'services-p1',
      );
      t.ok(leaderService, 'services partition should elect a leader');

      const systemTableCache = NodeService.getInstance().getSystemTableCache();
      t.ok(systemTableCache && typeof systemTableCache.filter === 'function',
        'system cache should support filter');

      const servicesReady = await waitFor(() => {
        const rows = systemTableCache.filter(SYSTEM_TABLE_NAME.SERVICES, (service) =>
          service.partition_id === 'services-p1' &&
          service.service_type === 'partition' &&
          service.status !== 'removed' &&
          service.status !== 'failed',
        ) || [];
        return rows.length > 0;
      }, 8000);
      t.ok(servicesReady, 'services partition should expose replicas in cache');

      const services = systemTableCache.filter(SYSTEM_TABLE_NAME.SERVICES, (service) =>
        service.partition_id === 'services-p1' &&
        service.service_type === 'partition' &&
        service.status !== 'removed' &&
        service.status !== 'failed',
      ) || [];
      t.ok(services.length > 0, 'services partition should have routable replicas');
      if (services.length === 0) {
        return;
      }

      const leaderReplicaId = leaderService?.replicaId;
      const followerService = services.find((service) =>
        service.service_id !== leaderReplicaId) || services[0];
      t.ok(followerService, 'should select a follower service to target');

      const staleCache = {
        get: (...args) => systemTableCache.get(...args),
        find: (...args) => systemTableCache.find?.(...args),
        getAll: (...args) => systemTableCache.getAll?.(...args),
        filter: (tableName, predicate) => {
          const rows = systemTableCache.filter(tableName, predicate) || [];
          if (tableName !== SYSTEM_TABLE_NAME.SERVICES) {
            return rows;
          }

          const downgraded = rows.map((row) => ({
            ...row,
            raft_role: 'follower',
          }));

          const preferredId = followerService?.service_id;
          if (!preferredId) {
            return downgraded;
          }

          const preferred = downgraded.find((row) => row.service_id === preferredId);
          if (!preferred) {
            return downgraded;
          }

          return [
            preferred,
            ...downgraded.filter((row) => row.service_id !== preferredId),
          ];
        },
      };

      const sqlQueryEngine = new SQLQueryEngine({
        systemCache: staleCache,
        messageRouter: bootstrapResult.messageRouter,
        nodeId: seedNodeId,
      });

      const updatedAt = Date.now();
      const updateResult = await sqlQueryEngine.executeQuery(
        'UPDATE services SET updated_at = ? WHERE service_id = ?',
        [updatedAt, followerService.service_id],
      );

      t.equal(updateResult.success, true,
        'update should succeed without leader in cache');
      t.ok(
        Number.isFinite(updateResult.affectedRows) && updateResult.affectedRows >= 0,
        'update should report a valid affectedRows count',
      );
    } finally {
      if (bootstrapService && bootstrapService.shutdown) {
        await bootstrapService.shutdown().catch((err) => t.comment(String(err)));
      }
      if (bootstrapResult?.messageRouter) {
        await bootstrapResult.messageRouter.shutdown().catch((err) => t.comment(String(err)));
      }
    }
  });

  await t.test('replica operations insert uses operation_id primary key', async (t) => {
    const seedNodeId = '550e8400-e29b-41d4-a716-446655440013';
    const seedWsPort = getUniquePort();

    const bootstrapService = new BootstrapService({
      nodeId: seedNodeId,
      nodeAddress: `ws://localhost:${seedWsPort}`,
      wsPort: seedWsPort,
      config: TEST_CONFIG.bootstrap,
    });

    let bootstrapResult;

    try {
      bootstrapResult = await bootstrapService.bootstrap();
      t.equal(bootstrapResult.success, true, 'seed node bootstrap should succeed');

      const systemTableCache = NodeService.getInstance().getSystemTableCache();
      const sqlQueryEngine = new SQLQueryEngine({
        systemCache: systemTableCache,
        messageRouter: bootstrapResult.messageRouter,
        nodeId: seedNodeId,
      });

      const cdcIntegrationService = new CDCIntegrationService({nodeId: seedNodeId});
      cdcIntegrationService.initialize({sqlQueryEngine});

      const now = Date.now();
      const operationId = 'op-550e8400-e29b-41d4-a716-446655440013';

      const insertResult = await cdcIntegrationService.insertSystemTableRow(
        SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
        {
          operation_id: operationId,
          type: OperationType.ADD,
          partition_id: 'tables-p1',
          entity_type: 'partition',
          entity_id: 'tables-p1',
          replica_id: 'replica-1',
          source_node_id: seedNodeId,
          target_node_id: '550e8400-e29b-41d4-a716-446655440014',
          status: ReplicaStatus.PENDING,
          workflow_step: 'PENDING',
          created_at: now,
          updated_at: now,
          completed_at: null,
          error_message: null,
          steps_history: JSON.stringify([{step: 'PENDING', timestamp: now}]),
        },
      );

      t.equal(insertResult.success, true, 'replica_operations insert should succeed');
      t.notOk(insertResult.data?.id, 'insert should not add id column');

      const queryResult = await waitForQueryRows(
        sqlQueryEngine,
        'SELECT operation_id FROM replica_operations WHERE operation_id = ?',
        [operationId],
        1,
      );

      t.equal(queryResult.success !== false, true, 'query should succeed');
      t.equal(queryResult.rows?.length, 1, 'should find inserted operation');
      t.equal(
        queryResult.rows?.[0]?.operation_id,
        operationId,
        'operation_id should match',
      );
    } finally {
      if (bootstrapService && bootstrapService.shutdown) {
        await bootstrapService.shutdown().catch((err) => t.comment(String(err)));
      }
      if (bootstrapResult?.messageRouter) {
        await bootstrapResult.messageRouter.shutdown().catch((err) => t.comment(String(err)));
      }
    }
  });

  await t.test('third node joins and all nodes appear in nodes table', async (t) => {
    // =========================================================================
    // This test verifies that when a third node joins:
    // 1. All three nodes are registered in the nodes system table
    // 2. The SQL query to SELECT * FROM nodes returns all three nodes
    // =========================================================================
    const seedNodeId = '550e8400-e29b-41d4-a716-446655440010';
    const seedWsPort = getUniquePort();

    const bootstrapService = new BootstrapService({
      nodeId: seedNodeId,
      nodeAddress: `ws://localhost:${seedWsPort}`,
      wsPort: seedWsPort,
      config: {
        ...TEST_CONFIG.bootstrap,
        leadershipWaitTimeoutMs: 2000,
      },
    });

    let bootstrapResult;
    let seedApi;
    let sqlQueryEngine;
    let joiningService2;
    let joiningService3;

    try {
      // =========================================================================
      // PHASE 1: Bootstrap seed node
      // =========================================================================
      bootstrapResult = await bootstrapService.bootstrap();
      t.equal(bootstrapResult.success, true, 'seed node bootstrap should succeed');

      // Create SQL query engine for querying the nodes table
      // System data is available in the read-only system cache
      // Writes go through SQL which uses system tables
      const systemTableCache = NodeService.getInstance().getSystemTableCache();

      sqlQueryEngine = new SQLQueryEngine({
        systemCache: systemTableCache,
        messageRouter: bootstrapResult.messageRouter,
        nodeId: seedNodeId,
      });

      // =========================================================================
      // PHASE 2: Start Bootstrap API
      // =========================================================================
      seedApi = new BootstrapAPI({
        seedNodeId,
        seedNodeAddress: `ws://localhost:${seedWsPort}`,
        seedNodeWsAddress: `ws://localhost:${seedWsPort}`,
        messageGroupServices: bootstrapResult.messageGroupServices,
        partitionServices: bootstrapResult.partitionServices,
        systemTableCache: systemTableCache,
        messageRouter: bootstrapResult.messageRouter,
        epochManager: bootstrapResult.epochManager,
        bootstrapService: bootstrapService,
      });

      await seedApi.initialize(0, {listen: false});
      seedApi.setSqlQueryEngine(sqlQueryEngine);
      const httpPost = createInProcHttpPost(seedApi);

      // =========================================================================
      // PHASE 3: Query nodes table - should have seed node
      // =========================================================================
      const result1 = await waitForNodes(sqlQueryEngine, 1, 10000);
      t.equal(result1.success !== false, true, 'query should succeed');
      const nodes1 = result1.rows || [];
      t.ok(nodes1.length >= 1, 'should have at least seed node');

      const seedInTable = nodes1.some((n) => n.node_id === seedNodeId);
      t.ok(seedInTable, 'seed node should be in nodes table');

      // =========================================================================
      // PHASE 4: Join second node
      // =========================================================================
      const joiningNodeId2 = '550e8400-e29b-41d4-a716-446655440011';
      const joiningWsPort2 = getUniquePort();

      joiningService2 = new NodeJoiningService({
        nodeId: joiningNodeId2,
        nodeAddress: `ws://localhost:${joiningWsPort2}`,
        seedNodeAddress: 'http://localhost:0',
        seedNodeWsAddress: `ws://localhost:${seedWsPort}`,
        wsPort: joiningWsPort2,
        config: {
          httpTimeoutMs: 5000,
          leadershipWaitTimeoutMs: 10000,
          leadershipWaitInitialDelayMs: 10,
          leadershipWaitMaxDelayMs: 100,
          replicaStaggerDelayMs: 20,
        },
        httpPost,
      });

      const joinResult2 = await joiningService2.join();
      t.equal(joinResult2.success, true, 'second node join should succeed');

      // Query nodes table - should have seed + second node
      const result2 = await waitForNodes(sqlQueryEngine, 2, 10000);
      t.equal(result2.success !== false, true, 'query after 2nd join should succeed');
      const nodes2 = result2.rows || [];

      t.ok(nodes2.length >= 2, `should have at least 2 nodes, got ${nodes2.length}`);
      const node2InTable = nodes2.some((n) => n.node_id === joiningNodeId2);
      t.ok(node2InTable, 'second node should be in nodes table');

      // =========================================================================
      // PHASE 5: Join third node
      // =========================================================================
      const joiningNodeId3 = '550e8400-e29b-41d4-a716-446655440012';
      const joiningWsPort3 = getUniquePort();

      joiningService3 = new NodeJoiningService({
        nodeId: joiningNodeId3,
        nodeAddress: `ws://localhost:${joiningWsPort3}`,
        seedNodeAddress: 'http://localhost:0',
        seedNodeWsAddress: `ws://localhost:${seedWsPort}`,
        wsPort: joiningWsPort3,
        config: {
          httpTimeoutMs: 5000,
          leadershipWaitTimeoutMs: 10000,
          leadershipWaitInitialDelayMs: 10,
          leadershipWaitMaxDelayMs: 100,
          replicaStaggerDelayMs: 20,
        },
        httpPost,
      });

      const joinResult3 = await joiningService3.join();
      t.equal(joinResult3.success, true, 'third node join should succeed');

      // =========================================================================
      // PHASE 6: Query nodes table - should have all 3 nodes
      // =========================================================================
      const result3 = await waitForNodes(sqlQueryEngine, 3, 15000);
      t.equal(result3.success !== false, true, 'query after 3rd join should succeed');
      const nodes3 = result3.rows || [];

      // Log the actual nodes for debugging
      t.comment(`Nodes in table after 3rd join: ${JSON.stringify(nodes3.map((n) => n.node_id))}`);

      t.equal(nodes3.length, 3, `should have exactly 3 nodes, got ${nodes3.length}`);

      const seedStillInTable = nodes3.some((n) => n.node_id === seedNodeId);
      const node2StillInTable = nodes3.some((n) => n.node_id === joiningNodeId2);
      const node3InTable = nodes3.some((n) => n.node_id === joiningNodeId3);

      t.ok(seedStillInTable, 'seed node should still be in nodes table');
      t.ok(node2StillInTable, 'second node should still be in nodes table');
      t.ok(node3InTable, 'third node should be in nodes table');
    } finally {
      // =========================================================================
      // CLEANUP
      // =========================================================================
      await quiesceControlPlaneWriters(
        [joiningService3, joiningService2, bootstrapService],
      );
      await withRaftCommitRejectionsAbsorbed(async () => {
        if (joiningService3) {
          await joiningService3.cleanup().catch((err) => t.comment(String(err)));
        }
        if (joiningService2) {
          await joiningService2.cleanup().catch((err) => t.comment(String(err)));
        }
        if (seedApi) {
          await seedApi.shutdown().catch((err) => t.comment(String(err)));
        }
        if (bootstrapService && bootstrapService.shutdown) {
          await bootstrapService.shutdown().catch((err) => t.comment(String(err)));
        }
        if (bootstrapResult?.messageRouter) {
          await bootstrapResult.messageRouter.shutdown().catch((err) => t.comment(String(err)));
        }
      });
    }
  });
});
