/**
 * Integration test: node-join convergence SLOs.
 *
 * Validates that after a node join:
 * 1. Leadership changes stay bounded.
 * 2. Partition voter counts do not remain above target.
 * 3. The system settles within a fixed window.
 */

import {test} from '../../src/test-helpers/tap.js';
import {BootstrapService} from '../../src/bootstrap/bootstrap-service.js';
import {BootstrapAPI} from '../../src/bootstrap/bootstrap-api.js';
import {NodeJoiningService} from '../../src/bootstrap/node-joining-service.js';
import {SystemTableName} from '../../src/bootstrap/system-table-schemas-constants.js';
import {NodeService} from '../../src/node/node-service.js';
import {PARTITION_SERVICE_EVENT} from '../../src/partition/partition-service-constants.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {
  TEST_CONFIG,
  cleanupTestEnvironment,
  createInProcHttpPost,
  getUniquePort,
  gracefulJoiningShutdown,
  gracefulShutdown,
  initializeTestEnvironment,
  waitFor,
} from './helpers/cluster-test-helpers.js';

const TARGET_VOTER_COUNT = 3;
const SETTLE_TIMEOUT_MS = 20000;
const QUIET_WINDOW_MS = 5000;
const MAX_SUSTAINED_OVERTARGET_MS = 2000;
const SAMPLE_INTERVAL_MS = 250;

function isVoterReadyPartitionReplica(row) {
  if (!row) {
    return false;
  }
  if (row.service_type !== 'partition') {
    return false;
  }
  if (row.status !== ReplicaStatus.ACTIVE) {
    return false;
  }
  const raftRole = typeof row.raft_role === 'string' ?
    row.raft_role.toLowerCase() :
    null;
  // Require an explicit non-learner raft role to count as a voter.
  // Transitional rows without role metadata are not voter-ready yet.
  if (!raftRole || raftRole === 'learner') {
    return false;
  }
  if (!row.address) {
    return false;
  }
  return true;
}

function collectPartitionVoterCounts(systemTableCache) {
  const rows = systemTableCache.filter(
    SystemTableName.SERVICES,
    (row) => isVoterReadyPartitionReplica(row),
  ) || [];

  const byPartition = new Map();
  for (const row of rows) {
    const partitionId = row.partition_id;
    if (!partitionId) {
      continue;
    }
    byPartition.set(partitionId, (byPartition.get(partitionId) || 0) + 1);
  }
  return byPartition;
}

function updateOverTargetState(overTargetState, countsByPartition, now) {
  const partitionIds = new Set([
    ...countsByPartition.keys(),
    ...overTargetState.keys(),
  ]);

  for (const partitionId of partitionIds) {
    const count = countsByPartition.get(partitionId) || 0;
    const state = overTargetState.get(partitionId) || {
      inOverTargetSince: null,
      maxOverTargetMs: 0,
    };

    if (count > TARGET_VOTER_COUNT) {
      if (state.inOverTargetSince === null) {
        state.inOverTargetSince = now;
      }
    } else if (state.inOverTargetSince !== null) {
      const duration = now - state.inOverTargetSince;
      state.maxOverTargetMs = Math.max(state.maxOverTargetMs, duration);
      state.inOverTargetSince = null;
    }

    overTargetState.set(partitionId, state);
  }
}

function finalizeOverTargetState(overTargetState, endTimeMs) {
  for (const state of overTargetState.values()) {
    if (state.inOverTargetSince !== null) {
      const duration = endTimeMs - state.inOverTargetSince;
      state.maxOverTargetMs = Math.max(state.maxOverTargetMs, duration);
      state.inOverTargetSince = null;
    }
  }
}

function registerLeaderChangeTracking(partitionServices, counter) {
  const subscriptions = [];
  if (!partitionServices || typeof partitionServices.values !== 'function') {
    return () => {};
  }

  for (const service of partitionServices.values()) {
    const partitionId = service?.partitionId;
    if (!partitionId) {
      continue;
    }
    const handler = () => {
      counter.total++;
      counter.lastChangeAt = Date.now();
      counter.byPartition.set(
        partitionId,
        (counter.byPartition.get(partitionId) || 0) + 1,
      );
    };
    service.on(PARTITION_SERVICE_EVENT.LEADER_ELECTED, handler);
    subscriptions.push({service, handler});
  }

  return () => {
    for (const subscription of subscriptions) {
      subscription.service.off(
        PARTITION_SERVICE_EVENT.LEADER_ELECTED,
        subscription.handler,
      );
    }
  };
}

test('Node join convergence SLO', {timeout: 30000}, async (t) => {
  t.beforeEach(() => {
    initializeTestEnvironment({
      raft: {
        electionTimeoutMinMs: 300,
        electionTimeoutMaxMs: 900,
        heartbeatIntervalMs: 75,
      },
      rebalancer: {
        periodicCheckIntervalMs: 4000,
        periodicCheckJitterMs: 500,
        criticalCheckDelayMs: 1000,
        stabilizationPeriodMs: 2000,
      },
      replicaHandler: {
        syncTimeoutMs: 15000,
      },
    });
  });

  t.afterEach(async () => {
    await cleanupTestEnvironment();
  });

  await t.test('settles after join without prolonged over-target voters', async (t) => {
    const seedNodeId = '550e8400-e29b-41d4-a716-446655440201';
    const joiningNodeId = '550e8400-e29b-41d4-a716-446655440202';
    const seedWsPort = getUniquePort();
    const joiningWsPort = getUniquePort();

    const bootstrapService = new BootstrapService({
      nodeId: seedNodeId,
      nodeAddress: `ws://localhost:${seedWsPort}`,
      wsPort: seedWsPort,
      config: TEST_CONFIG.bootstrap,
    });

    let bootstrapResult = null;
    let seedApi = null;
    let joiningService = null;
    let removeSeedSubscriptions = () => {};
    let removeJoiningSubscriptions = () => {};

    try {
      bootstrapResult = await bootstrapService.bootstrap();
      t.equal(bootstrapResult.success, true, 'seed bootstrap should succeed');

      const systemTableCache = NodeService.getInstance().getSystemTableCache();
      const seedQueryEngine = new SQLQueryEngine({
        systemCache: systemTableCache,
        messageRouter: bootstrapResult.messageRouter,
        nodeId: seedNodeId,
      });

      seedApi = new BootstrapAPI({
        seedNodeId,
        seedNodeAddress: `ws://localhost:${seedWsPort}`,
        seedNodeWsAddress: `ws://localhost:${seedWsPort}`,
        messageGroupServices: bootstrapResult.messageGroupServices,
        partitionServices: bootstrapResult.partitionServices,
        systemTableCache,
        messageRouter: bootstrapResult.messageRouter,
        epochManager: bootstrapResult.epochManager,
        bootstrapService,
      });
      await seedApi.initialize(0, {listen: false});
      seedApi.setSqlQueryEngine(seedQueryEngine);

      const leaderCounter = {
        total: 0,
        byPartition: new Map(),
        lastChangeAt: Date.now(),
      };

      removeSeedSubscriptions = registerLeaderChangeTracking(
        bootstrapResult.partitionServices,
        leaderCounter,
      );

      joiningService = new NodeJoiningService({
        nodeId: joiningNodeId,
        nodeAddress: `ws://localhost:${joiningWsPort}`,
        seedNodeAddress: 'http://localhost:0',
        seedNodeWsAddress: `ws://localhost:${seedWsPort}`,
        wsPort: joiningWsPort,
        config: {
          ...TEST_CONFIG.bootstrap,
          httpTimeoutMs: 5000,
          leadershipWaitTimeoutMs: 12000,
        },
        httpPost: createInProcHttpPost(seedApi),
      });

      const joinResult = await joiningService.join();
      t.equal(joinResult.success, true, 'joining node should join successfully');

      removeJoiningSubscriptions = registerLeaderChangeTracking(
        joinResult.partitionServices,
        leaderCounter,
      );

      const nodeReadyObserved = await waitFor(async () => {
        const nodeRow = systemTableCache.get(SystemTableName.NODES, joiningNodeId);
        return !!nodeRow &&
          nodeRow.status === 'active' &&
          nodeRow.connection_state === 'ready';
      }, 10000, 100);
      t.equal(nodeReadyObserved, true, 'joining node should become ready in cache');

      const overTargetState = new Map();
      let settled = false;
      let finalCounts = new Map();
      const settleStart = Date.now();
      const settleDeadline = settleStart + SETTLE_TIMEOUT_MS;

      while (Date.now() <= settleDeadline) {
        const now = Date.now();
        finalCounts = collectPartitionVoterCounts(systemTableCache);
        updateOverTargetState(overTargetState, finalCounts, now);

        const hasCurrentOverTarget = [...finalCounts.values()].some(
          (count) => count > TARGET_VOTER_COUNT,
        );
        const quietElapsedMs = now - leaderCounter.lastChangeAt;
        if (!hasCurrentOverTarget && quietElapsedMs >= QUIET_WINDOW_MS) {
          settled = true;
          break;
        }

        await new Promise((resolve) => setTimeout(resolve, SAMPLE_INTERVAL_MS));
      }

      finalizeOverTargetState(overTargetState, Date.now());

      const systemPartitionCount = new Set(
        [...bootstrapResult.partitionServices.values()].map((service) => service.partitionId),
      ).size;
      const maxAllowedLeaderChanges = systemPartitionCount * 4;
      const maxObservedOverTargetMs = Math.max(
        0,
        ...[...overTargetState.values()].map((state) => state.maxOverTargetMs),
      );

      t.equal(settled, true, 'cluster should settle within convergence SLO window');
      t.ok(
        leaderCounter.total <= maxAllowedLeaderChanges,
        `leadership changes should stay bounded (${leaderCounter.total} <= ` +
          `${maxAllowedLeaderChanges})`,
      );
      t.ok(
        maxObservedOverTargetMs <= MAX_SUSTAINED_OVERTARGET_MS,
        'over-target voter duration should stay bounded (' +
          `${maxObservedOverTargetMs}ms <= ${MAX_SUSTAINED_OVERTARGET_MS}ms)`,
      );
      t.notOk(
        [...finalCounts.values()].some((count) => count > TARGET_VOTER_COUNT),
        'final voter counts should not exceed target',
      );
    } finally {
      removeSeedSubscriptions();
      removeJoiningSubscriptions();
      await gracefulJoiningShutdown(joiningService);
      await gracefulShutdown(bootstrapService, bootstrapResult, seedApi);
    }
  });
});
