/**
 * Unit tests for PartitionService.
 * Tests SQLite-backed Raft group for data storage.
 * Requirements: 3.2, 3.3, 3.4, 3.5, 4.4
 */

import {EventEmitter} from 'node:events';
import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import {
  PartitionService,
  RaftRole,
  CDCOperation,
} from '../../src/partition/partition-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
} from '../../src/partition/partition-service-constants.js';
import {
  SYSTEM_TABLE_NAME,
  INITIAL_PARTITION_IDS,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
  LIFECYCLE_PHASE,
  LIFECYCLE_REASON,
} from '../../src/bootstrap/lifecycle-controller-constants.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {
} from '../../src/raft/constants.js';
import {
  COLUMN,
  SERVICE_TYPE,
  SERVICE_STATUS,
  STATE,
  TABLES,
} from '../../src/constants/index.js';
import {
} from '../../src/rebalancer/replica-status.js';
import {
} from '../../src/partition/partition-constants.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  PRESSURE_WORK_CLASS,
} from '../../src/control-plane/pressure-governor.js';


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

function createLoopbackTransport() {
  const handlers = new Map();
  return {
    register(address, handler) {
      handlers.set(address, handler);
    },
    unregister(address) {
      handlers.delete(address);
    },
    async deliver(address, payload) {
      const handler = handlers.get(address);
      if (!handler) {
        throw new Error(`No handler registered for ${address}`);
      }
      return handler({payload});
    },
  };
}

async function waitForCondition(
  predicate,
  timeoutMs = 1000,
  intervalMs = 10,
) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await Promise.resolve(predicate())) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return false;
}

function createTrafficReadinessState() {
  const emitter = new EventEmitter();
  let snapshot = {
    phase: LIFECYCLE_PHASE.INIT,
    ready: false,
    reasons: [],
  };

  return {
    getSnapshot() {
      return {...snapshot};
    },
    on(eventName, listener) {
      emitter.on(eventName, listener);
    },
    off(eventName, listener) {
      emitter.off(eventName, listener);
    },
    transitionTo(phase, options = {}) {
      snapshot = {
        phase,
        ready: options.ready === true,
        reasons: Array.isArray(options.reasons) ? [...options.reasons] : [],
      };
      emitter.emit('transition', {...snapshot});
      return {...snapshot};
    },
  };
}

test('PartitionService - leader activation dedupes same-term flaps and cancels on candidate demotion', async (t) => {
  const partition = new PartitionService({
    partitionId: 'test-partition-leader-gate',
    tableId: 'leader_gate_test',
    replicaId: 'replica-1',
    replicaIds: ['replica-1', 'replica-2'],
    peerAddresses: ['node-2/partition/replica-2'],
    nodeId: 'node-1',
    transport: createLoopbackTransport(),
    dbPath: ':memory:',
    deferElection: true,
    leaderActivationStabilizationMs: 20,
  });

  await partition.initialize();

  let reconstructions = 0;
  let rebalancerLeadershipUpdates = 0;
  let leaderEvents = 0;
  partition.reconstructPreparedState = () => {
    reconstructions += 1;
    return {preparedTransactionCount: 0, prepareLostCount: 0};
  };
  partition.updateRebalancerLeadership = () => {
    rebalancerLeadershipUpdates += 1;
  };
  partition.on('leaderElected', () => {
    leaderEvents += 1;
  });

  partition.raft.term = 7;
  partition.raft.emit('leader');
  partition.raft.emit('leader');
  partition.raft.emit('leader');

  await waitForCondition(() => leaderEvents === 1, 500, 10);

  t.equal(reconstructions, 1, 'prepared-state reconstruction should run once');
  t.equal(
    rebalancerLeadershipUpdates,
    1,
    'leader-owned background work should activate once',
  );

  reconstructions = 0;
  leaderEvents = 0;
  rebalancerLeadershipUpdates = 0;

  partition.raft.term = 8;
  partition.raft.emit('leader');
  partition.raft.emit('candidate');

  await new Promise((resolve) => setTimeout(resolve, 60));

  t.equal(
    reconstructions,
    0,
    'candidate demotion should cancel pending leader reconstruction',
  );
  t.equal(
    leaderEvents,
    0,
    'candidate demotion should cancel pending leaderElected emission',
  );
  t.equal(
    rebalancerLeadershipUpdates,
    1,
    'candidate demotion should immediately revoke leader-owned background work',
  );

  await partition.shutdown();
});

test('PartitionService - publishes leader state as follower metadata in services table', async (t) => {
  const updates = [];
  const mockCdcIntegrationService = {
    updateSystemTableRow: async (tableName, whereClause, data, options) => {
      updates.push({tableName, whereClause, data, options});
      return {success: true};
    },
  };
  const systemTableCache = new SystemTableCache();
  const servicesPartitionId = INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.SERVICES];
  systemTableCache.applySystemTableChange(TABLES.PARTITIONS, CDCOperation.INSERT, {
    [COLUMN.PARTITION_ID]: servicesPartitionId,
    [COLUMN.TABLE_ID]: SYSTEM_TABLE_NAME.SERVICES,
    [COLUMN.LEADER_NODE_ID]: 'seed-node',
  });
  systemTableCache.applySystemTableChange(TABLES.SERVICES, CDCOperation.INSERT, {
    [COLUMN.SERVICE_ID]: 'services-leader',
    [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
    [COLUMN.PARTITION_ID]: servicesPartitionId,
    [COLUMN.NODE_ID]: 'seed-node',
    [COLUMN.RAFT_ROLE]: RaftRole.LEADER,
    [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    [COLUMN.ADDRESS]: 'seed-node/partition/services-leader',
  });

  const partition = new PartitionService({
    partitionId: 'test-partition-21',
    tableId: 'services',
    tableName: 'services',
    replicaId: 'replica-1',
    replicaIds: ['replica-1'],
    nodeId: 'seed-node',
    dbPath: ':memory:',
    cdcIntegrationService: mockCdcIntegrationService,
  });

  await partition.initialize();
  partition.setSystemTableCache(systemTableCache);
  partition.setCdcIntegrationService(mockCdcIntegrationService);

  await new Promise((resolve) => setImmediate(resolve));

  const roleUpdate = updates.find(
    (update) =>
      update.tableName === SYSTEM_TABLE_NAME.SERVICES &&
      update.whereClause?.service_id === 'replica-1' &&
      update.data?.raft_role === RaftRole.FOLLOWER,
  );

  t.ok(roleUpdate, 'raft role update should be persisted via CDC');
  t.same(
    roleUpdate?.options?.expectedCacheFields,
    {
      raft_role: RaftRole.FOLLOWER,
    },
    'cache visibility should converge only the published role field',
  );
  t.equal(
    roleUpdate?.options?.routingReadinessDimension,
    CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
    'raft role persistence should route through control-plane recovery readiness',
  );
  t.equal(
    roleUpdate?.options?.deliveryPriority,
    'background',
    'non-control-plane partition role publication should not consume the critical lane',
  );
  t.equal(
    roleUpdate?.options?.workClass,
    'background',
    'partition raft-role publication should use background admission',
  );
  t.equal(
    roleUpdate?.options?.allowPressureDefer,
    true,
    'partition raft-role publication should defer under pressure',
  );
  t.notOk(
    updates.some((update) => update.data?.raft_role === RaftRole.LEADER),
    'leader authority should not be republished through services.raft_role',
  );

  await partition.shutdown();
});

test('PartitionService - publishes candidate role as follower metadata', async (t) => {
  const updates = [];
  const mockCdcIntegrationService = {
    updateSystemTableRow: async (tableName, whereClause, data, options) => {
      updates.push({tableName, whereClause, data, options});
      return {success: true};
    },
  };
  const systemTableCache = new SystemTableCache();
  const servicesPartitionId = INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.SERVICES];
  systemTableCache.applySystemTableChange(TABLES.PARTITIONS, CDCOperation.INSERT, {
    [COLUMN.PARTITION_ID]: servicesPartitionId,
    [COLUMN.TABLE_ID]: SYSTEM_TABLE_NAME.SERVICES,
    [COLUMN.LEADER_NODE_ID]: 'seed-node',
  });
  systemTableCache.applySystemTableChange(TABLES.SERVICES, CDCOperation.INSERT, {
    [COLUMN.SERVICE_ID]: 'services-leader',
    [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
    [COLUMN.PARTITION_ID]: servicesPartitionId,
    [COLUMN.NODE_ID]: 'seed-node',
    [COLUMN.RAFT_ROLE]: RaftRole.LEADER,
    [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    [COLUMN.ADDRESS]: 'seed-node/partition/services-leader',
  });
  systemTableCache.applySystemTableChange(TABLES.SERVICES, CDCOperation.INSERT, {
    [COLUMN.SERVICE_ID]: 'replica-1',
    [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
    [COLUMN.PARTITION_ID]: 'test-partition-candidate',
    [COLUMN.REPLICA_ID]: 'replica-1',
    [COLUMN.NODE_ID]: 'seed-node',
    [COLUMN.RAFT_ROLE]: RaftRole.CANDIDATE,
    [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    [COLUMN.ADDRESS]: 'seed-node/partition/replica-1',
    [COLUMN.UPDATED_AT]: 1,
  });

  const partition = new PartitionService({
    partitionId: 'test-partition-candidate',
    tableId: 'services',
    tableName: 'services',
    replicaId: 'replica-1',
    replicaIds: ['replica-1'],
    nodeId: 'seed-node',
    dbPath: ':memory:',
    systemTableCache,
    cdcIntegrationService: mockCdcIntegrationService,
  });

  await partition.initialize();
  updates.length = 0;

  partition.queueRoleUpdate(RaftRole.CANDIDATE);
  await new Promise((resolve) => setImmediate(resolve));

  const candidateUpdate = updates.find(
    (update) =>
      update.tableName === SYSTEM_TABLE_NAME.SERVICES &&
      update.whereClause?.service_id === 'replica-1',
  );

  t.notOk(
    candidateUpdate,
    'candidate publication should not emit a redundant write once follower metadata is converged',
  );
  t.equal(
    partition.persistedRole,
    RaftRole.FOLLOWER,
    'candidate publication should still converge the advisory metadata role to follower',
  );
  t.notOk(
    updates.some((update) => update.data?.raft_role === RaftRole.CANDIDATE),
    'candidate metadata should not be written to services',
  );

  await partition.shutdown();
});

test('PartitionService - retries raft role persistence after cache visibility false negative',
  async (t) => {
    const updates = [];
    const mockCdcIntegrationService = {
      canWriteSystemTableLocally: (tableName) =>
        tableName === SYSTEM_TABLE_NAME.SERVICES,
      updateSystemTableRow: async (tableName, whereClause, data, options) => {
        updates.push({tableName, whereClause, data, options});
        if (updates.length === 1) {
          throw new Error('Cache update not observed for services:replica-1 within 1000ms');
        }
        return {success: true};
      },
    };
    const systemTableCache = new SystemTableCache();
    const servicesPartitionId = INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.SERVICES];
    systemTableCache.applySystemTableChange(TABLES.PARTITIONS, CDCOperation.INSERT, {
      [COLUMN.PARTITION_ID]: servicesPartitionId,
      [COLUMN.TABLE_ID]: SYSTEM_TABLE_NAME.SERVICES,
      [COLUMN.LEADER_NODE_ID]: 'seed-node',
    });
    systemTableCache.applySystemTableChange(TABLES.SERVICES, CDCOperation.INSERT, {
      [COLUMN.SERVICE_ID]: 'services-leader',
      [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
      [COLUMN.PARTITION_ID]: servicesPartitionId,
      [COLUMN.NODE_ID]: 'seed-node',
      [COLUMN.RAFT_ROLE]: RaftRole.LEADER,
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.ADDRESS]: 'seed-node/partition/services-leader',
    });

    const partition = new PartitionService({
      partitionId: 'test-partition-21-retry',
      tableId: 'services',
      tableName: 'services',
      replicaId: 'replica-1',
      replicaIds: ['replica-1'],
      nodeId: 'seed-node',
      dbPath: ':memory:',
      systemTableCache,
      cdcIntegrationService: mockCdcIntegrationService,
    });

    await partition.initialize();
    await new Promise((resolve) => setImmediate(resolve));

    t.same(
      updates[0]?.options?.expectedCacheFields,
      {
        raft_role: RaftRole.FOLLOWER,
      },
      'retryable role persistence should only wait for the published role visibility',
    );

    await new Promise((resolve) => setTimeout(resolve, 1200));

    t.equal(
      updates.length,
      2,
      'cache visibility false negatives should trigger a role persistence retry',
    );
    t.equal(
      updates[1]?.data?.raft_role,
      RaftRole.FOLLOWER,
      'retry should target the same raft role',
    );

    await partition.shutdown();
  });

test(
  'PartitionService - learner promotion retries follower metadata publication after observed state change',
  async (t) => {
    const updates = [];
    const scheduledRetries = [];
    const systemTableCache = new SystemTableCache();
    const servicesPartitionId = INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.SERVICES];

    systemTableCache.applySystemTableChange(TABLES.PARTITIONS, CDCOperation.INSERT, {
      [COLUMN.PARTITION_ID]: servicesPartitionId,
      [COLUMN.TABLE_ID]: SYSTEM_TABLE_NAME.SERVICES,
      [COLUMN.LEADER_NODE_ID]: 'seed-node',
    });
    systemTableCache.applySystemTableChange(TABLES.SERVICES, CDCOperation.INSERT, {
      [COLUMN.SERVICE_ID]: 'services-leader',
      [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
      [COLUMN.PARTITION_ID]: servicesPartitionId,
      [COLUMN.NODE_ID]: 'seed-node',
      [COLUMN.RAFT_ROLE]: RaftRole.LEADER,
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.ADDRESS]: 'seed-node/partition/services-leader',
    });
    systemTableCache.applySystemTableChange(TABLES.PARTITIONS, CDCOperation.INSERT, {
      [COLUMN.PARTITION_ID]: 'stable-join-partition',
      [COLUMN.REPLICA_COUNT]: 3,
    });
    systemTableCache.applySystemTableChange(TABLES.SERVICES, CDCOperation.INSERT, {
      [COLUMN.SERVICE_ID]: 'replica-1',
      [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
      [COLUMN.PARTITION_ID]: 'stable-join-partition',
      [COLUMN.REPLICA_ID]: 'replica-1',
      [COLUMN.NODE_ID]: 'node-1',
      [COLUMN.RAFT_ROLE]: RaftRole.LEADER,
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.ADDRESS]: 'node-1/partition/replica-1',
      [COLUMN.UPDATED_AT]: 1,
    });
    systemTableCache.applySystemTableChange(TABLES.SERVICES, CDCOperation.INSERT, {
      [COLUMN.SERVICE_ID]: 'replica-2',
      [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
      [COLUMN.PARTITION_ID]: 'stable-join-partition',
      [COLUMN.REPLICA_ID]: 'replica-2',
      [COLUMN.NODE_ID]: 'node-2',
      [COLUMN.RAFT_ROLE]: RaftRole.FOLLOWER,
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.ADDRESS]: 'node-2/partition/replica-2',
      [COLUMN.UPDATED_AT]: 1,
    });
    systemTableCache.applySystemTableChange(TABLES.SERVICES, CDCOperation.INSERT, {
      [COLUMN.SERVICE_ID]: 'replica-3',
      [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
      [COLUMN.PARTITION_ID]: 'stable-join-partition',
      [COLUMN.REPLICA_ID]: 'replica-3',
      [COLUMN.NODE_ID]: 'node-3',
      [COLUMN.RAFT_ROLE]: RaftRole.LEARNER,
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.ADDRESS]: 'node-3/partition/replica-3',
      [COLUMN.UPDATED_AT]: 1,
    });

    const mockCdcIntegrationService = {
      updateSystemTableRow: async (tableName, whereClause, data, options) => {
        updates.push({tableName, whereClause, data, options});
        if (updates.length === 1) {
          return {
            success: true,
            partitionResult: {affectedRows: 0},
          };
        }
        return {
          success: true,
          partitionResult: {affectedRows: 1},
        };
      },
    };

    const partition = new PartitionService({
      partitionId: 'stable-join-partition',
      tableId: 'stable_join_table',
      tableName: 'stable_join_table',
      replicaId: 'replica-3',
      replicaIds: ['replica-3'],
      nodeId: 'node-3',
      dbPath: ':memory:',
      isJoiningExistingGroup: true,
      systemTableCache,
      cdcIntegrationService: mockCdcIntegrationService,
    });

    let electionStarted = false;
    partition.startElection = () => {
      electionStarted = true;
    };
    partition.roleMutationHelper.setTimeoutFn = (callback) => {
      scheduledRetries.push(callback);
      return callback;
    };
    partition.roleMutationHelper.clearTimeoutFn = () => {};

    partition.role = RaftRole.LEARNER;
    partition.leaderId = 'replica-1';

    partition.checkLearnerPromotion();
    await new Promise((resolve) => setImmediate(resolve));

    t.equal(partition.role, RaftRole.FOLLOWER,
      'promotion should advance the learner to follower before persistence converges');
    t.equal(partition.isJoiningExistingGroup, false,
      'promotion should clear join-mode gating before the retry path runs');
    t.equal(electionStarted, true,
      'promotion should restart elections once the learner becomes a voter');
    t.equal(updates.length, 1,
      'promotion should attempt follower metadata publication immediately');
    t.equal(updates[0]?.tableName, SYSTEM_TABLE_NAME.SERVICES,
      'promotion should publish through the services table');
    t.same(updates[0]?.whereClause, {
      service_id: 'replica-3',
      raft_role: RaftRole.LEARNER,
      updated_at: 1,
    }, 'first promotion write should target the learner row snapshot');
    t.equal(updates[0]?.data?.raft_role, RaftRole.FOLLOWER,
      'promotion should publish follower metadata for the promoted learner');
    t.equal(scheduledRetries.length, 1,
      'guard misses during learner promotion should schedule a retry');

    systemTableCache.applySystemTableChange(TABLES.SERVICES, CDCOperation.UPDATE, {
      [COLUMN.SERVICE_ID]: 'replica-3',
      [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
      [COLUMN.PARTITION_ID]: 'stable-join-partition',
      [COLUMN.REPLICA_ID]: 'replica-3',
      [COLUMN.NODE_ID]: 'node-3',
      [COLUMN.RAFT_ROLE]: RaftRole.LEARNER,
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.ADDRESS]: 'node-3/partition/replica-3',
      [COLUMN.UPDATED_AT]: 2,
    });

    await scheduledRetries[0]();

    t.equal(updates.length, 2,
      'retry should re-attempt follower publication after the guarded miss');
    t.same(updates[1].whereClause, {
      service_id: 'replica-3',
      raft_role: RaftRole.LEARNER,
      updated_at: 2,
    }, 'retry should refresh the guard from the latest observed learner row');
    t.equal(updates[1].data.raft_role, RaftRole.FOLLOWER,
      'retry should keep publishing follower metadata for the promoted learner');
    t.equal(partition.persistedRole, RaftRole.FOLLOWER,
      'successful retry should converge the persisted follower metadata');
    t.equal(partition.pendingRoleUpdate, null,
      'successful retry should clear the queued role update');

    partition.roleMutationHelper.shutdown();
  },
);

test('PartitionService - persists initial follower role for multi-replica startup',
  async (t) => {
    const updates = [];
    const mockCdcIntegrationService = {
      updateSystemTableRow: async (tableName, whereClause, data) => {
        updates.push({tableName, whereClause, data});
        return {success: true};
      },
    };
    const systemTableCache = new SystemTableCache();
    const servicesPartitionId = INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.SERVICES];
    systemTableCache.applySystemTableChange(TABLES.PARTITIONS, CDCOperation.INSERT, {
      [COLUMN.PARTITION_ID]: servicesPartitionId,
      [COLUMN.TABLE_ID]: SYSTEM_TABLE_NAME.SERVICES,
      [COLUMN.LEADER_NODE_ID]: 'seed-node',
    });
    systemTableCache.applySystemTableChange(TABLES.SERVICES, CDCOperation.INSERT, {
      [COLUMN.SERVICE_ID]: 'services-leader',
      [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
      [COLUMN.PARTITION_ID]: servicesPartitionId,
      [COLUMN.NODE_ID]: 'seed-node',
      [COLUMN.RAFT_ROLE]: RaftRole.LEADER,
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.ADDRESS]: 'seed-node/partition/services-leader',
    });

    const partition = new PartitionService({
      partitionId: 'test-partition-multi',
      tableId: 'user-table',
      tableName: 'user_table',
      replicaId: 'replica-2',
      replicaIds: ['replica-1', 'replica-2', 'replica-3'],
      peerAddresses: [
        'node-1/partition/replica-1',
        'node-3/partition/replica-3',
      ],
      nodeId: 'node-2',
      dbPath: ':memory:',
      deferElection: true,
      systemTableCache,
      cdcIntegrationService: mockCdcIntegrationService,
    });

    await partition.initialize();
    await new Promise((resolve) => setImmediate(resolve));

    const roleUpdate = updates.find(
      (update) =>
        update.tableName === SYSTEM_TABLE_NAME.SERVICES &&
        update.whereClause?.service_id === 'replica-2' &&
        update.data?.raft_role === RaftRole.FOLLOWER,
    );

    t.ok(roleUpdate, 'initial follower role should be persisted via CDC');
    t.notOk(
      Object.prototype.hasOwnProperty.call(roleUpdate?.data || {}, 'status'),
      'initial follower role persistence should not rewrite lifecycle status',
    );

    await partition.shutdown();
  });

test(
  'PartitionService - publishes role metadata before traffic ready when services leader is local',
  async (t) => {
    const updates = [];
    const now = Date.now();
    const readinessState = createTrafficReadinessState();
    const mockCdcIntegrationService = {
      canWriteSystemTableLocally: (tableName) => tableName === SYSTEM_TABLE_NAME.SERVICES,
      updateSystemTableRow: async (tableName, whereClause, data) => {
        updates.push({tableName, whereClause, data});
        return {success: true};
      },
    };
    const systemTableCache = new SystemTableCache();
    systemTableCache.applySystemTableChange(TABLES.NODES, CDCOperation.INSERT, {
      [COLUMN.NODE_ID]: 'node-2',
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
      [COLUMN.LAST_HEARTBEAT]: now,
      [COLUMN.READY_LEASE_EXPIRES_AT]: null,
    });

    const partition = new PartitionService({
      partitionId: 'test-partition-ready-gate',
      tableId: 'user-table',
      tableName: 'user_table',
      replicaId: 'replica-ready-gate',
      replicaIds: ['replica-ready-gate'],
      nodeId: 'node-2',
      dbPath: ':memory:',
      systemTableCache,
      cdcIntegrationService: mockCdcIntegrationService,
      bootstrapReadinessState: readinessState,
    });

    partition.pendingRoleUpdate = RaftRole.LEADER;
    partition.persistedRole = null;

    const publishResult = await partition.flushRoleUpdate();
    t.equal(
      publishResult.reason,
      'applied',
      'partition role publication should not wait on lifecycle readiness once the local services leader can accept the write',
    );
    t.equal(
      updates.length,
      1,
      'partition role publication should write immediately when the local services leader is available',
    );

    systemTableCache.applySystemTableChange(TABLES.NODES, CDCOperation.UPDATE, {
      [COLUMN.NODE_ID]: 'node-2',
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.CONNECTION_STATE]: STATE.READY,
      [COLUMN.LAST_HEARTBEAT]: now + 1,
      [COLUMN.READY_LEASE_EXPIRES_AT]: now + 60_000,
    });

    readinessState.transitionTo(LIFECYCLE_PHASE.CONTROL_READY, {
      ready: false,
      reasons: [LIFECYCLE_REASON.LEADER_METADATA_INCOMPLETE],
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    const noopResult = await partition.flushRoleUpdate();
    t.equal(noopResult.reason, 'noop', 'later readiness transitions should not force duplicate writes');
    t.equal(updates.length, 1, 'later readiness transitions should not create duplicate role writes');

    await partition.shutdown();
  },
);

test(
  'PartitionService - defers rebalancer initialization until traffic ready',
  async (t) => {
    const readinessState = createTrafficReadinessState();
    const partition = new PartitionService({
      partitionId: 'test-partition-rebalancer-ready-gate',
      tableId: 'services',
      tableName: 'services',
      replicaId: 'replica-ready-gate',
      replicaIds: ['replica-ready-gate'],
      nodeId: 'node-2',
      dbPath: ':memory:',
      bootstrapReadinessState: readinessState,
    });

    await partition.initialize();
    partition.isLeader = true;
    partition.systemTableCache = {
      get: () => null,
      filter: () => [],
      onCacheChange: () => {},
      offCacheChange: () => {},
    };
    partition.cdcIntegrationService = {
      insertSystemTableRow: async () => ({success: true}),
      updateSystemTableRow: async () => ({success: true}),
      deleteSystemTableRow: async () => ({success: true}),
    };
    partition.tablePolicyService = {
      getPolicyForPartition: () => ({targetReplicaCount: 3}),
    };
    partition.messageRouter = {
      getConnectionState: () => 'connected',
      send: async () => {},
    };
    partition.sqlQueryEngine = {
      executeQuery: async () => ({success: true, rows: []}),
    };
    partition.rebalanceCoordinator = {
      initialize: () => {},
    };

    readinessState.transitionTo(LIFECYCLE_PHASE.CONTROL_READY, {
      ready: false,
      reasons: [LIFECYCLE_REASON.LEADER_METADATA_INCOMPLETE],
    });
    partition.maybeInitializeRebalancer();
    t.notOk(
      partition.rebalancer,
      'should not initialize rebalancer before traffic-ready lifecycle',
    );

    readinessState.transitionTo(LIFECYCLE_PHASE.TRAFFIC_READY, {
      ready: true,
      reasons: [],
    });
    partition.maybeInitializeRebalancer();
    t.ok(
      partition.rebalancer,
      'should initialize rebalancer after traffic-ready lifecycle',
    );

    await partition.shutdown();
  },
);

test(
  'PartitionService - priority control-plane rebalancer starts once lifecycle owner opens metadata publication',
  async (t) => {
    const readinessState = createTrafficReadinessState();
    const partition = new PartitionService({
      partitionId:
        INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.REPLICA_OPERATIONS],
      tableId: SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
      tableName: SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
      replicaId: 'replica-control-plane-ready-gate',
      replicaIds: ['replica-control-plane-ready-gate'],
      nodeId: 'node-2',
      dbPath: ':memory:',
      bootstrapReadinessState: readinessState,
    });

    await partition.initialize();
    partition.isLeader = true;
    partition.systemTableCache = {
      get: () => null,
      filter: () => [],
      onCacheChange: () => {},
      offCacheChange: () => {},
    };
    partition.cdcIntegrationService = {
      insertSystemTableRow: async () => ({success: true}),
      updateSystemTableRow: async () => ({success: true}),
      deleteSystemTableRow: async () => ({success: true}),
    };
    partition.tablePolicyService = {
      getPolicyForPartition: () => ({targetReplicaCount: 3}),
    };
    partition.messageRouter = {
      getConnectionState: () => 'connected',
      send: async () => {},
    };
    partition.sqlQueryEngine = {
      executeQuery: async () => ({success: true, rows: []}),
    };
    partition.rebalanceCoordinator = {
      initialize: () => {},
    };

    readinessState.transitionTo(LIFECYCLE_PHASE.JOIN_READY, {
      ready: false,
      reasons: [LIFECYCLE_REASON.READINESS_STABLE_WINDOW_PENDING],
    });
    partition.maybeInitializeRebalancer();
    t.ok(
      partition.rebalancer,
      'priority control-plane partitions should initialize the rebalancer once metadata publication is allowed',
    );

    await partition.shutdown();
  },
);

test('PartitionService - persists leader node updates to partitions table', async (t) => {
  const updates = [];
  const mockCdcIntegrationService = {
    updateSystemTableRow: async (tableName, whereClause, data, options) => {
      updates.push({tableName, whereClause, data, options});
      return {success: true};
    },
  };

  const systemTableCache = new SystemTableCache();
  const partitionsPartitionId = INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.PARTITIONS];
  systemTableCache.applySystemTableChange(TABLES.PARTITIONS, CDCOperation.INSERT, {
    [COLUMN.PARTITION_ID]: partitionsPartitionId,
    [COLUMN.TABLE_ID]: SYSTEM_TABLE_NAME.PARTITIONS,
    [COLUMN.LEADER_NODE_ID]: 'seed-node',
  });
  systemTableCache.applySystemTableChange(TABLES.SERVICES, CDCOperation.INSERT, {
    [COLUMN.SERVICE_ID]: 'partitions-leader',
    [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
    [COLUMN.PARTITION_ID]: partitionsPartitionId,
    [COLUMN.NODE_ID]: 'seed-node',
    [COLUMN.RAFT_ROLE]: RaftRole.LEADER,
    [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    [COLUMN.ADDRESS]: 'seed-node/partition/partitions-leader',
  });

  const partition = new PartitionService({
    partitionId: 'test-partition-23',
    tableId: 'services',
    tableName: 'services',
    replicaId: 'replica-1',
    replicaIds: ['replica-1'],
    nodeId: 'seed-node',
    dbPath: ':memory:',
    cdcIntegrationService: mockCdcIntegrationService,
  });

  await partition.initialize();
  partition.setSystemTableCache(systemTableCache);
  partition.setCdcIntegrationService(mockCdcIntegrationService);

  await new Promise((resolve) => setImmediate(resolve));

  const leaderUpdate = updates.find(
    (update) =>
      update.tableName === SYSTEM_TABLE_NAME.PARTITIONS &&
      update.whereClause?.[COLUMN.PARTITION_ID] === 'test-partition-23' &&
      update.data?.[COLUMN.LEADER_NODE_ID] === 'seed-node',
  );

  t.ok(leaderUpdate, 'leader node update should be persisted via CDC');
  t.same(
    leaderUpdate?.options?.expectedCacheFields,
    {leader_node_id: 'seed-node'},
    'cache visibility should only depend on leader identity',
  );
  t.equal(
    leaderUpdate?.options?.routingReadinessDimension,
    CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
    'leader node persistence should route through control-plane recovery readiness',
  );
  t.equal(
    leaderUpdate?.options?.deliveryPriority,
    'background',
    'non-control-plane partition leader publication should not consume the critical lane',
  );
  t.equal(
    leaderUpdate?.options?.workClass,
    PRESSURE_WORK_CLASS.BACKGROUND,
    'non-control-plane partition leader publication should stay in the background work class',
  );
  t.equal(
    leaderUpdate?.options?.allowPressureDefer,
    true,
    'non-control-plane partition leader publication should remain pressure deferable',
  );

  await partition.shutdown();
});

test('PartitionService - keeps control-plane metadata publication critical', async (t) => {
  const updates = [];
  const mockCdcIntegrationService = {
    updateSystemTableRow: async (tableName, whereClause, data, options) => {
      updates.push({tableName, whereClause, data, options});
      return {success: true};
    },
  };
  const systemTableCache = new SystemTableCache();
  const servicesPartitionId = INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.SERVICES];
  const partitionsPartitionId = INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.PARTITIONS];
  systemTableCache.applySystemTableChange(TABLES.PARTITIONS, CDCOperation.INSERT, {
    [COLUMN.PARTITION_ID]: servicesPartitionId,
    [COLUMN.TABLE_ID]: SYSTEM_TABLE_NAME.SERVICES,
    [COLUMN.LEADER_NODE_ID]: 'seed-node',
  });
  systemTableCache.applySystemTableChange(TABLES.PARTITIONS, CDCOperation.INSERT, {
    [COLUMN.PARTITION_ID]: partitionsPartitionId,
    [COLUMN.TABLE_ID]: SYSTEM_TABLE_NAME.PARTITIONS,
    [COLUMN.LEADER_NODE_ID]: 'seed-node',
  });
  systemTableCache.applySystemTableChange(TABLES.SERVICES, CDCOperation.INSERT, {
    [COLUMN.SERVICE_ID]: 'services-leader',
    [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
    [COLUMN.PARTITION_ID]: servicesPartitionId,
    [COLUMN.NODE_ID]: 'seed-node',
    [COLUMN.RAFT_ROLE]: RaftRole.LEADER,
    [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    [COLUMN.ADDRESS]: 'seed-node/partition/services-leader',
  });
  systemTableCache.applySystemTableChange(TABLES.SERVICES, CDCOperation.INSERT, {
    [COLUMN.SERVICE_ID]: 'partitions-leader',
    [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
    [COLUMN.PARTITION_ID]: partitionsPartitionId,
    [COLUMN.NODE_ID]: 'seed-node',
    [COLUMN.RAFT_ROLE]: RaftRole.LEADER,
    [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    [COLUMN.ADDRESS]: 'seed-node/partition/partitions-leader',
  });

  const partition = new PartitionService({
    partitionId: INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.NODES],
    tableId: SYSTEM_TABLE_NAME.NODES,
    tableName: SYSTEM_TABLE_NAME.NODES,
    replicaId: 'nodes-p1-r1',
    replicaIds: ['nodes-p1-r1'],
    nodeId: 'seed-node',
    dbPath: ':memory:',
    cdcIntegrationService: mockCdcIntegrationService,
  });

  await partition.initialize();
  partition.setSystemTableCache(systemTableCache);
  partition.setCdcIntegrationService(mockCdcIntegrationService);

  await new Promise((resolve) => setImmediate(resolve));

  const roleUpdate = updates.find(
    (update) =>
      update.tableName === SYSTEM_TABLE_NAME.SERVICES &&
      update.whereClause?.service_id === 'nodes-p1-r1',
  );
  const leaderUpdate = updates.find(
    (update) =>
      update.tableName === SYSTEM_TABLE_NAME.PARTITIONS &&
      update.whereClause?.[COLUMN.PARTITION_ID] === INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.NODES],
  );

  t.equal(
    roleUpdate?.options?.deliveryPriority,
    'background',
    'control-plane partition role publication should be advisory background metadata',
  );
  t.equal(
    leaderUpdate?.options?.deliveryPriority,
    'critical',
    'control-plane partition leader publication should stay on the critical lane',
  );
  t.equal(
    leaderUpdate?.options?.workClass,
    PRESSURE_WORK_CLASS.CRITICAL,
    'control-plane partition leader publication should stay in the critical work class',
  );
  t.equal(
    leaderUpdate?.options?.allowPressureDefer,
    false,
    'control-plane partition leader publication should not be pressure deferable',
  );

  await partition.shutdown();
});

test('PartitionService - retries leader node persistence after cache visibility false negative',
  async (t) => {
    const updates = [];
    const mockCdcIntegrationService = {
      updateSystemTableRow: async (tableName, whereClause, data, options) => {
        updates.push({tableName, whereClause, data, options});
        if (updates.length === 1) {
          throw new Error(
            'Cache update not observed for partitions:test-partition-23-retry within 1000ms',
          );
        }
        return {success: true};
      },
    };

    const systemTableCache = new SystemTableCache();
    const partitionsPartitionId = INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.PARTITIONS];
    systemTableCache.applySystemTableChange(TABLES.PARTITIONS, CDCOperation.INSERT, {
      [COLUMN.PARTITION_ID]: partitionsPartitionId,
      [COLUMN.TABLE_ID]: SYSTEM_TABLE_NAME.PARTITIONS,
      [COLUMN.LEADER_NODE_ID]: 'seed-node',
    });
    systemTableCache.applySystemTableChange(TABLES.SERVICES, CDCOperation.INSERT, {
      [COLUMN.SERVICE_ID]: 'partitions-leader',
      [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
      [COLUMN.PARTITION_ID]: partitionsPartitionId,
      [COLUMN.NODE_ID]: 'seed-node',
      [COLUMN.RAFT_ROLE]: RaftRole.LEADER,
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.ADDRESS]: 'seed-node/partition/partitions-leader',
    });

    const partition = new PartitionService({
      partitionId: 'test-partition-23-retry',
      tableId: 'services',
      tableName: 'services',
      replicaId: 'replica-1',
      replicaIds: ['replica-1'],
      nodeId: 'seed-node',
      dbPath: ':memory:',
      systemTableCache,
      cdcIntegrationService: mockCdcIntegrationService,
    });

    await partition.initialize();
    await new Promise((resolve) => setImmediate(resolve));

    t.same(
      updates[0]?.options?.expectedCacheFields,
      {leader_node_id: 'seed-node'},
      'retryable leader persistence should only wait on leader_node_id visibility',
    );

    await new Promise((resolve) => setTimeout(resolve, 1200));

    t.equal(
      updates.length,
      2,
      'cache visibility false negatives should trigger a leader persistence retry',
    );
    t.equal(
      updates[1]?.data?.[COLUMN.LEADER_NODE_ID],
      'seed-node',
      'retry should target the same leader node',
    );

    await partition.shutdown();
  });

test('PartitionService - setCdcIntegrationService sets service on partition and rebalancer',
  async (t) => {
    const mockCdcIntegrationService = {
      deleteSystemTableRow: async () => ({success: true}),
      insertSystemTableRow: async () => ({success: true}),
    };

    const partition = new PartitionService({
      partitionId: 'test-partition-22',
      tableId: 'services',
      tableName: 'services',
      replicaId: 'replica-1',
      replicaIds: ['replica-1'],
      nodeId: 'test-node',
      dbPath: ':memory:',
    });

    await partition.initialize();

    // Initially no cdcIntegrationService
    t.equal(partition.cdcIntegrationService, null, 'Initially null');

    // Provide stubbed rebalancer/coordinator to verify propagation.
    partition.rebalancer = {
      cdcIntegrationService: null,
      setRebalanceCoordinator: () => {},
      shutdown: () => {},
    };
    partition.rebalanceCoordinator = {cdcIntegrationService: null};

    // Set the CDC integration service
    partition.setCdcIntegrationService(mockCdcIntegrationService);

    // Verify it was set on the partition
    t.equal(
      partition.cdcIntegrationService,
      mockCdcIntegrationService,
      'Should be set on partition',
    );

    // Verify it was set on the rebalancer
    t.equal(
      partition.rebalancer.cdcIntegrationService,
      mockCdcIntegrationService,
      'Should be set on rebalancer',
    );

    // Verify it was set on the coordinator
    t.equal(
      partition.rebalanceCoordinator.cdcIntegrationService,
      mockCdcIntegrationService,
      'Should be set on coordinator',
    );

    await partition.shutdown();
  });

test('PartitionService - initializeRebalancer passes sqlQueryEngine to gateway',
  async (t) => {
    // Bug reproduction: initializeRebalancer() creates UnifiedRebalancer
    // without passing sqlQueryEngine, so the gateway is created with null.
    // Later, maybeInitializeRebalancer() sets rebalancer.sqlQueryEngine
    // but does NOT propagate to the gateway. The gateway retains null
    // forever, causing "requires sqlQueryEngine" errors when the
    // rebalancer tries to call getConfiguredRebalanceBudget() or
    // getGlobalInFlightOperationCount().
    const mockSqlQueryEngine = {
      executeQuery: async () => ({success: true, rows: []}),
    };
    const mockSystemTableCache = {
      get: () => null,
      filter: () => [],
      onCacheChange: () => {},
      offCacheChange: () => {},
    };
    const mockCdcIntegrationService = {
      insertSystemTableRow: async () => ({success: true}),
      updateSystemTableRow: async () => ({success: true}),
      deleteSystemTableRow: async () => ({success: true}),
    };
    const mockTablePolicyService = {
      getPolicyForPartition: () => ({targetReplicaCount: 3}),
    };
    const mockMessageRouter = {
      getConnectionState: () => 'connected',
      send: async () => {},
    };
    const mockRebalanceCoordinator = {
      systemTableCache: null,
      cdcIntegrationService: null,
      tablePolicyService: null,
      sqlQueryEngine: null,
      initialize: () => {},
    };

    const partition = new PartitionService({
      partitionId: 'test-partition-gw-1',
      tableId: 'services',
      tableName: 'services',
      replicaId: 'replica-1',
      replicaIds: ['replica-1'],
      nodeId: 'test-node',
      dbPath: ':memory:',
    });

    await partition.initialize();

    // Wire all dependencies so initializeRebalancer() fires
    partition.rebalanceCoordinator = mockRebalanceCoordinator;
    partition.systemTableCache = mockSystemTableCache;
    partition.cdcIntegrationService = mockCdcIntegrationService;
    partition.tablePolicyService = mockTablePolicyService;
    partition.messageRouter = mockMessageRouter;
    partition.isLeader = true;
    partition.setSqlQueryEngine(mockSqlQueryEngine);

    // Rebalancer should now exist
    t.ok(partition.rebalancer, 'rebalancer should be initialized');

    // The gateway must have the sqlQueryEngine — this is the bug
    const gateway = partition.rebalancer.controlPlaneSystemTableGateway;
    t.ok(gateway, 'gateway should exist on rebalancer');
    t.equal(
      gateway.sqlQueryEngine,
      mockSqlQueryEngine,
      'gateway.sqlQueryEngine must be set after initializeRebalancer ' +
      '(uses injected owner path via constructor)',
    );

    // Verify the gateway can actually execute a query without throwing
    const result = await gateway.executeQuery(
      'SELECT 1',
      [],
      {},
    );
    t.ok(result, 'gateway.executeQuery should succeed');

    await partition.shutdown();
  });

test('PartitionService - maybeInitializeRebalancer propagates sqlQueryEngine ' +
  'to gateway on refresh',
async (t) => {
  // Bug reproduction: when maybeInitializeRebalancer() refreshes an
  // existing rebalancer, it sets rebalancer.sqlQueryEngine but does NOT
  // propagate to the gateway. The gateway retains the stale engine.
  const firstEngine = {
    executeQuery: async () => ({success: true, rows: [], tag: 'first'}),
  };
  const secondEngine = {
    executeQuery: async () => ({success: true, rows: [], tag: 'second'}),
  };
  const mockSystemTableCache = {
    get: () => null,
    filter: () => [],
    onCacheChange: () => {},
    offCacheChange: () => {},
  };
  const mockCdcIntegrationService = {
    insertSystemTableRow: async () => ({success: true}),
    updateSystemTableRow: async () => ({success: true}),
    deleteSystemTableRow: async () => ({success: true}),
  };
  const mockTablePolicyService = {
    getPolicyForPartition: () => ({targetReplicaCount: 3}),
  };
  const mockMessageRouter = {
    getConnectionState: () => 'connected',
    send: async () => {},
  };
  const mockRebalanceCoordinator = {
    systemTableCache: null,
    cdcIntegrationService: null,
    tablePolicyService: null,
    sqlQueryEngine: null,
    initialize: () => {},
  };

  const partition = new PartitionService({
    partitionId: 'test-partition-gw-2',
    tableId: 'services',
    tableName: 'services',
    replicaId: 'replica-1',
    replicaIds: ['replica-1'],
    nodeId: 'test-node',
    dbPath: ':memory:',
  });

  await partition.initialize();

  // Initialize with first engine
  partition.rebalanceCoordinator = mockRebalanceCoordinator;
  partition.systemTableCache = mockSystemTableCache;
  partition.cdcIntegrationService = mockCdcIntegrationService;
  partition.tablePolicyService = mockTablePolicyService;
  partition.messageRouter = mockMessageRouter;
  partition.isLeader = true;
  partition.setSqlQueryEngine(firstEngine);

  t.ok(partition.rebalancer, 'rebalancer should be initialized');

  const gateway = partition.rebalancer.controlPlaneSystemTableGateway;
  t.equal(
    gateway.sqlQueryEngine,
    firstEngine,
    'gateway should have first engine after init',
  );

  // Now update to second engine — this triggers maybeInitializeRebalancer
  partition.setSqlQueryEngine(secondEngine);

  // The gateway must have the updated engine — this is the bug
  t.equal(
    gateway.sqlQueryEngine,
    secondEngine,
    'gateway.sqlQueryEngine must be updated when ' +
    'maybeInitializeRebalancer refreshes (uses injected owner path)',
  );

  await partition.shutdown();
});
