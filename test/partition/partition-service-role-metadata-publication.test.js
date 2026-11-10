/**
 * Unit tests for PartitionService.
 * Tests SQLite-backed Raft group for data storage.
 * Requirements: 3.2, 3.3, 3.4, 3.5, 4.4
 */

import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import {
  checkLearnerPromotionWithGrantedProof,
  ControllableConsensusPort,
  createControllablePartitionService,
  createLoopbackTransport,
  createTrafficReadinessState,
  waitForCondition,
} from './partition-service-test-support.js';
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
import {CONTROL_PLANE_AUTHORITATIVE_READ_MODE} from
  '../../src/control-plane/control-plane-system-table-gateway.js';
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
import {withFoundingStamp} from './partition-founding-stamp.js';
import {createReadinessServiceForTest} from '../helpers/readiness-service-fixture.js';
import {
  authoritativeSystemTableRead,
  partitionCollaboratorFake,
  partitionCollaboratorOptions,
} from '../helpers/partition-service-fixture.js';
import {
  PARTITION_SERVICE_COLLABORATOR as COLLABORATOR,
} from '../../src/partition/partition-service-collaborators.js';

// The rows a test seeded into its cache, as durable-store entries.
const seededRows = (cache, tableNames = [TABLES.SERVICES, TABLES.PARTITIONS]) =>
  tableNames.flatMap((tableName) =>
    cache.getAll(tableName).map((row) => [tableName, row]));

// A replica's durable services row: registered, no role published yet.
const registeredServiceRow = (replicaId, partitionId, nodeId) => [
  TABLES.SERVICES, {
    [COLUMN.SERVICE_ID]: replicaId,
    [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
    [COLUMN.PARTITION_ID]: partitionId,
    [COLUMN.REPLICA_ID]: replicaId,
    [COLUMN.NODE_ID]: nodeId,
    [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
  }];

// Settle the role flush the election queued: it confirms against the
// authoritative row, so it is still in flight when initialize() returns.
async function settleRoleFlush(partition, maxSpins = 20) {
  for (let spin = 0; spin < maxSpins; spin += 1) {
    const flushed = await partition.flushRoleUpdate();
    if (flushed?.reason !== 'in-flight') return;
    await new Promise((resolve) => setImmediate(resolve));
  }
}

// A CDC service fake completed to the partition's collaborator interface.
const cdcFake = (fake) =>
  partitionCollaboratorFake(COLLABORATOR.CDC_INTEGRATION_SERVICE, fake);

// The durable system tables a CDC service reads authoritatively (production
// always does): the given [tableName, row] entries, or (a function) the
// entries it answers when first read, e.g. the rows the test seeded into its
// cache. Each accepted update is applied, so a post-write confirmation reads
// the written row back.
function createDurableSystemTables(entries) {
  let store = null;
  const durableStore = () => {
    if (store === null) {
      store = new SystemTableCache();
      const seeded = typeof entries === 'function' ? entries() : entries;
      for (const [tableName, row] of seeded) {
        store.applySystemTableChange(tableName, CDCOperation.INSERT, {...row});
      }
    }
    return store;
  };
  const read = authoritativeSystemTableRead({
    get: (tableName, key) => durableStore().get(tableName, key),
  });
  return {
    read,
    apply(tableName, whereClause, data) {
      const rows = durableStore();
      const key = whereClause?.[COLUMN.SERVICE_ID] ??
        whereClause?.[COLUMN.PARTITION_ID];
      const row = rows.get(tableName, key);
      if (row) {
        rows.applySystemTableChange(tableName, CDCOperation.UPDATE,
          {...row, ...data});
      }
    },
  };
}


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

test('PartitionService - leader activation dedupes same-term flaps and cancels on candidate demotion', async (t) => {
  const consensusPort = new ControllableConsensusPort();
  const partition = createControllablePartitionService({
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
  }, consensusPort);

  await partition.initialize();

  let mirrorResumptions = 0;
  let rebalancerLeadershipUpdates = 0;
  let leaderEvents = 0;
  partition.resumeDurableMirrorReplicationWorkers = () => {
    mirrorResumptions += 1;
  };
  partition.updateRebalancerLeadership = () => {
    rebalancerLeadershipUpdates += 1;
  };
  partition.on('leaderElected', () => {
    leaderEvents += 1;
  });

  consensusPort.setTerm(7);
  consensusPort.setRole(RaftRole.LEADER);
  consensusPort.setRole(RaftRole.LEADER);
  consensusPort.setRole(RaftRole.LEADER);

  await waitForCondition(() => leaderEvents === 1, 500, 10);

  t.equal(mirrorResumptions, 1, 'durable mirror resumption should run once');
  t.equal(
    rebalancerLeadershipUpdates,
    1,
    'leader-owned background work should activate once',
  );

  mirrorResumptions = 0;
  leaderEvents = 0;
  rebalancerLeadershipUpdates = 0;

  consensusPort.setTerm(8);
  consensusPort.setRole(RaftRole.LEADER);
  consensusPort.setRole(RaftRole.CANDIDATE);

  await new Promise((resolve) => setTimeout(resolve, 60));

  t.equal(
    mirrorResumptions,
    0,
    'candidate demotion should cancel pending mirror resumption',
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
  const durable = createDurableSystemTables([
    registeredServiceRow('replica-1', 'test-partition-21', 'seed-node')]);
  const mockCdcIntegrationService = cdcFake({
    executeAuthoritativeSystemTableRead: durable.read,
    updateSystemTableRow: async (tableName, whereClause, data, options) => {
      updates.push({tableName, whereClause, data, options});
      durable.apply(tableName, whereClause, data);
      return {success: true};
    },
  });
  const systemTableCache = new SystemTableCache();
  const servicesPartitionId = INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.SERVICES];
  systemTableCache.applySystemTableChange(TABLES.PARTITIONS, CDCOperation.INSERT, {
    [COLUMN.PARTITION_ID]: servicesPartitionId,
    [COLUMN.TABLE_ID]: SYSTEM_TABLE_NAME.SERVICES,
    replica_count: 3,
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

  const partition = new PartitionService(partitionCollaboratorOptions(withFoundingStamp({
    partitionId: 'test-partition-21',
    tableId: 'services',
    tableName: 'services',
    replicaId: 'replica-1',
    replicaIds: ['replica-1'],
    nodeId: 'seed-node',
    dbPath: ':memory:',
    cdcIntegrationService: mockCdcIntegrationService,
  })));

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
  t.notOk(
    updates.some((update) => update.data?.raft_role === RaftRole.LEADER),
    'leader authority should not be republished through services.raft_role',
  );

  await partition.shutdown();
});

test('PartitionService - publishes candidate role as follower metadata', async (t) => {
  const updates = [];
  const systemTableCache = new SystemTableCache();
  const servicesPartitionId = INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.SERVICES];
  systemTableCache.applySystemTableChange(TABLES.PARTITIONS, CDCOperation.INSERT, {
    [COLUMN.PARTITION_ID]: servicesPartitionId,
    [COLUMN.TABLE_ID]: SYSTEM_TABLE_NAME.SERVICES,
    replica_count: 3,
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

  // The durable rows hold what the test seeds into its cache.
  const durable = createDurableSystemTables(() => seededRows(systemTableCache));
  const mockCdcIntegrationService = cdcFake({
    executeAuthoritativeSystemTableRead: durable.read,
    updateSystemTableRow: async (tableName, whereClause, data, options) => {
      updates.push({tableName, whereClause, data, options});
      durable.apply(tableName, whereClause, data);
      return {success: true};
    },
  });

  const partition = new PartitionService(partitionCollaboratorOptions(withFoundingStamp({
    partitionId: 'test-partition-candidate',
    tableId: 'services',
    tableName: 'services',
    replicaId: 'replica-1',
    replicaIds: ['replica-1'],
    nodeId: 'seed-node',
    dbPath: ':memory:',
    systemTableCache,
    cdcIntegrationService: mockCdcIntegrationService,
  })));

  await partition.initialize();
  await settleRoleFlush(partition);
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
    const durable = createDurableSystemTables([
      registeredServiceRow('replica-1', 'test-partition-21-retry', 'seed-node')]);
    const mockCdcIntegrationService = cdcFake({
      executeAuthoritativeSystemTableRead: durable.read,
      canWriteSystemTableLocally: (tableName) =>
        tableName === SYSTEM_TABLE_NAME.SERVICES,
      updateSystemTableRow: async (tableName, whereClause, data, options) => {
        updates.push({tableName, whereClause, data, options});
        const roleUpdateCount = updates.filter(
          (update) => update.tableName === SYSTEM_TABLE_NAME.SERVICES,
        ).length;
        if (
          tableName === SYSTEM_TABLE_NAME.SERVICES &&
          roleUpdateCount === 1
        ) {
          throw new Error('Cache update not observed for services:replica-1 within 1000ms');
        }
        return {success: true};
      },
    });
    const systemTableCache = new SystemTableCache();
    const servicesPartitionId = INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.SERVICES];
    systemTableCache.applySystemTableChange(TABLES.PARTITIONS, CDCOperation.INSERT, {
      [COLUMN.PARTITION_ID]: servicesPartitionId,
      [COLUMN.TABLE_ID]: SYSTEM_TABLE_NAME.SERVICES,
      replica_count: 3,
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

    const partition = new PartitionService(partitionCollaboratorOptions(withFoundingStamp({
      partitionId: 'test-partition-21-retry',
      tableId: 'services',
      tableName: 'services',
      replicaId: 'replica-1',
      replicaIds: ['replica-1'],
      nodeId: 'seed-node',
      dbPath: ':memory:',
      systemTableCache,
      cdcIntegrationService: mockCdcIntegrationService,
    })));

    await partition.initialize();
    await new Promise((resolve) => setImmediate(resolve));

    let roleUpdates = updates.filter(
      (update) => update.tableName === SYSTEM_TABLE_NAME.SERVICES,
    );
    t.same(
      roleUpdates[0]?.options?.expectedCacheFields,
      {
        raft_role: RaftRole.FOLLOWER,
      },
      'retryable role persistence should only wait for the published role visibility',
    );

    await new Promise((resolve) => setTimeout(resolve, 1200));

    roleUpdates = updates.filter(
      (update) => update.tableName === SYSTEM_TABLE_NAME.SERVICES,
    );
    t.equal(
      roleUpdates.length,
      2,
      'cache visibility false negatives should trigger a role persistence retry',
    );
    t.equal(
      roleUpdates[1]?.data?.raft_role,
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
      replica_count: 3,
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
      replica_count: 3,
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

    const mockCdcIntegrationService = cdcFake({
      // The seeded cache stands for the durable rows here: the test moves
      // the learner row (updated_at 2) to model an observed durable change.
      executeAuthoritativeSystemTableRead:
        authoritativeSystemTableRead(systemTableCache),
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
    });

    const partition = new PartitionService(partitionCollaboratorOptions(withFoundingStamp({
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
    })));

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

    await checkLearnerPromotionWithGrantedProof(partition);
    // The publication confirms against the authoritative row first.
    await waitForCondition(() => updates.length > 0);

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
      service_type: SERVICE_TYPE.PARTITION,
      partition_id: 'stable-join-partition',
      replica_id: 'replica-3',
      node_id: 'node-3',
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
      service_type: SERVICE_TYPE.PARTITION,
      partition_id: 'stable-join-partition',
      replica_id: 'replica-3',
      node_id: 'node-3',
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
    const durable = createDurableSystemTables([
      registeredServiceRow('replica-2', 'test-partition-multi', 'node-2')]);
    const mockCdcIntegrationService = cdcFake({
      executeAuthoritativeSystemTableRead: durable.read,
      updateSystemTableRow: async (tableName, whereClause, data) => {
        updates.push({tableName, whereClause, data});
        durable.apply(tableName, whereClause, data);
        return {success: true};
      },
    });
    const systemTableCache = new SystemTableCache();
    const servicesPartitionId = INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.SERVICES];
    systemTableCache.applySystemTableChange(TABLES.PARTITIONS, CDCOperation.INSERT, {
      [COLUMN.PARTITION_ID]: servicesPartitionId,
      [COLUMN.TABLE_ID]: SYSTEM_TABLE_NAME.SERVICES,
      replica_count: 3,
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

    const partition = new PartitionService(partitionCollaboratorOptions(withFoundingStamp({
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
    })));

    await partition.initialize();
    await settleRoleFlush(partition);

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
    const durable = createDurableSystemTables([registeredServiceRow(
      'replica-ready-gate', 'test-partition-ready-gate', 'node-2')]);
    const mockCdcIntegrationService = cdcFake({
      executeAuthoritativeSystemTableRead: durable.read,
      canWriteSystemTableLocally: (tableName) => tableName === SYSTEM_TABLE_NAME.SERVICES,
      updateSystemTableRow: async (tableName, whereClause, data) => {
        updates.push({tableName, whereClause, data});
        durable.apply(tableName, whereClause, data);
        return {success: true};
      },
    });
    const systemTableCache = new SystemTableCache();
    systemTableCache.applySystemTableChange(TABLES.NODES, CDCOperation.INSERT, {
      [COLUMN.NODE_ID]: 'node-2',
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
      [COLUMN.LAST_HEARTBEAT]: now,
      [COLUMN.READY_LEASE_EXPIRES_AT]: null,
    });

    const partition = new PartitionService(partitionCollaboratorOptions(withFoundingStamp({
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
    })));

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
    const partition = new PartitionService(partitionCollaboratorOptions(withFoundingStamp({
      partitionId: 'test-partition-rebalancer-ready-gate',
      tableId: 'services',
      tableName: 'services',
      replicaId: 'replica-ready-gate',
      replicaIds: ['replica-ready-gate'],
      nodeId: 'node-2',
      dbPath: ':memory:',
      bootstrapReadinessState: readinessState,
    })));

    await partition.initialize();
    partition.isLeader = true;
    partition.systemTableCache = partitionCollaboratorFake(
      COLLABORATOR.SYSTEM_TABLE_CACHE, {
        get: () => null,
        filter: () => [],
        onCacheChange: () => {},
        offCacheChange: () => {},
      });
    partition.cdcIntegrationService = partitionCollaboratorFake(
      COLLABORATOR.CDC_INTEGRATION_SERVICE, {
        insertSystemTableRow: async () => ({success: true}),
        updateSystemTableRow: async () => ({success: true}),
        deleteSystemTableRow: async () => ({success: true}),
      });
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
    partition.rebalanceCoordinator = partitionCollaboratorFake(
      COLLABORATOR.REBALANCE_COORDINATOR, {
        controlPlaneReadinessService: createReadinessServiceForTest(),
        initialize: () => {},
      });

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
    const partition = new PartitionService(partitionCollaboratorOptions(withFoundingStamp({
      partitionId:
        INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.REPLICA_OPERATIONS],
      tableId: SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
      tableName: SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
      replicaId: 'replica-control-plane-ready-gate',
      replicaIds: ['replica-control-plane-ready-gate'],
      nodeId: 'node-2',
      dbPath: ':memory:',
      bootstrapReadinessState: readinessState,
    })));

    await partition.initialize();
    partition.isLeader = true;
    partition.systemTableCache = partitionCollaboratorFake(
      COLLABORATOR.SYSTEM_TABLE_CACHE, {
        get: () => null,
        filter: () => [],
        onCacheChange: () => {},
        offCacheChange: () => {},
      });
    partition.cdcIntegrationService = partitionCollaboratorFake(
      COLLABORATOR.CDC_INTEGRATION_SERVICE, {
        insertSystemTableRow: async () => ({success: true}),
        updateSystemTableRow: async () => ({success: true}),
        deleteSystemTableRow: async () => ({success: true}),
      });
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
    partition.rebalanceCoordinator = partitionCollaboratorFake(
      COLLABORATOR.REBALANCE_COORDINATOR, {
        controlPlaneReadinessService: createReadinessServiceForTest(),
        initialize: () => {},
      });

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
  const mockCdcIntegrationService = cdcFake({
    executeAuthoritativeSystemTableRead: async (tableName) => ({
      success: true,
      rows: tableName === SYSTEM_TABLE_NAME.PARTITIONS ?
        [{
          [COLUMN.PARTITION_ID]: 'test-partition-23',
          [COLUMN.LEADER_NODE_ID]: 'previous-node',
        }] :
        [],
    }),
    updateSystemTableRow: async (tableName, whereClause, data, options) => {
      updates.push({tableName, whereClause, data, options});
      return {success: true};
    },
  });

  const systemTableCache = new SystemTableCache();
  const partitionsPartitionId = INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.PARTITIONS];
  systemTableCache.applySystemTableChange(TABLES.PARTITIONS, CDCOperation.INSERT, {
    [COLUMN.PARTITION_ID]: partitionsPartitionId,
    [COLUMN.TABLE_ID]: SYSTEM_TABLE_NAME.PARTITIONS,
    [COLUMN.LEADER_NODE_ID]: 'seed-node',
  });
  systemTableCache.applySystemTableChange(TABLES.PARTITIONS, CDCOperation.INSERT, {
    [COLUMN.PARTITION_ID]: 'test-partition-23',
    [COLUMN.TABLE_ID]: 'services',
    [COLUMN.LEADER_NODE_ID]: 'previous-node',
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

  const partition = new PartitionService(partitionCollaboratorOptions(withFoundingStamp({
    partitionId: 'test-partition-23',
    tableId: 'services',
    tableName: 'services',
    replicaId: 'replica-1',
    replicaIds: ['replica-1'],
    nodeId: 'seed-node',
    dbPath: ':memory:',
    systemTableCache,
    cdcIntegrationService: mockCdcIntegrationService,
  })));

  await partition.initialize();
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
    'critical',
    'a stale authoritative leader must be corrected on the critical lane',
  );
  t.equal(
    leaderUpdate?.options?.workClass,
    PRESSURE_WORK_CLASS.CRITICAL,
    'a genuine leader divergence is critical even for a user partition',
  );

  await partition.shutdown();
});

test('PartitionService - initial leader publication routes while partitions ' +
  'cache ownership is not ready', async (t) => {
  const updates = [];
  const authoritativeReads = [];
  const mockCdcIntegrationService = cdcFake({
    async executeAuthoritativeSystemTableRead(
      tableName,
      _sql,
      params,
    ) {
      authoritativeReads.push({tableName, params});
      return {
        success: true,
        rows: [{
          [COLUMN.PARTITION_ID]: 'fresh-user-partition',
          [COLUMN.LEADER_NODE_ID]: null,
          [COLUMN.UPDATED_AT]: 77,
        }],
      };
    },
    async updateSystemTableRow(tableName, whereClause, data, options) {
      updates.push({tableName, whereClause, data, options});
      return {success: true, partitionResult: {affectedRows: 1}};
    },
  });
  const systemTableCache = new SystemTableCache();
  systemTableCache.applySystemTableChange(
    TABLES.PARTITIONS,
    CDCOperation.INSERT,
    {
      [COLUMN.PARTITION_ID]: 'fresh-user-partition',
      [COLUMN.TABLE_ID]: 'fresh-user-table',
      [COLUMN.LEADER_NODE_ID]: null,
      [COLUMN.UPDATED_AT]: 77,
    },
  );
  const partition = new PartitionService(partitionCollaboratorOptions(withFoundingStamp({
    partitionId: 'fresh-user-partition',
    tableId: 'fresh-user-table',
    tableName: 'fresh_user_table',
    replicaId: 'fresh-user-partition-r1',
    replicaIds: ['fresh-user-partition-r1'],
    nodeId: 'fresh-node',
    dbPath: ':memory:',
    systemTableCache,
    cdcIntegrationService: mockCdcIntegrationService,
  })));

  partition.isLeader = true;
  partition.isPartitionsLeaderAvailable = () => false;
  partition.leaderNodeMutationHelper.pendingValue = 'fresh-node';

  const result = await partition.flushLeaderNodeUpdate();
  const leaderUpdate = updates.find(
    (update) => update.tableName === SYSTEM_TABLE_NAME.PARTITIONS,
  );

  t.equal(authoritativeReads.length, 1,
    'the owner should acquire the authoritative CAS row through the gateway');
  t.equal(result.reason, 'applied',
    'gateway-owned routing should apply the initial leader publication');
  t.same(leaderUpdate?.whereClause, {
    [COLUMN.PARTITION_ID]: 'fresh-user-partition',
    [COLUMN.UPDATED_AT]: 77,
  });
  t.equal(leaderUpdate?.data?.[COLUMN.LEADER_NODE_ID], 'fresh-node');
  t.equal(leaderUpdate?.options?.deliveryPriority, 'critical',
    'an initially empty canonical leader is bootstrap correctness work');
  t.equal(leaderUpdate?.options?.workClass, PRESSURE_WORK_CLASS.CRITICAL);

  await partition.shutdown();
});

test('PartitionService - post-handoff leader publication reads the remote ' +
  'authoritative owner before replacing a stale canonical leader', async (t) => {
  const partitionId =
    INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS];
  const readCalls = [];
  const updates = [];
  const mockCdcIntegrationService = cdcFake({
    async executeAuthoritativeSystemTableRead() {
      throw new Error('gateway read seam should own this test');
    },
    async updateSystemTableRow(tableName, whereClause, data, options) {
      updates.push({tableName, whereClause, data, options});
      return {success: true, partitionResult: {affectedRows: 1}};
    },
  });
  const systemTableCache = new SystemTableCache();
  systemTableCache.applySystemTableChange(
    TABLES.PARTITIONS,
    CDCOperation.INSERT,
    {
      [COLUMN.PARTITION_ID]: partitionId,
      [COLUMN.TABLE_ID]: SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS,
      [COLUMN.LEADER_NODE_ID]: 'seed-node',
      [COLUMN.UPDATED_AT]: 91,
    },
  );
  const partition = new PartitionService(partitionCollaboratorOptions(withFoundingStamp({
    partitionId,
    tableId: SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS,
    tableName: SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS,
    replicaId: 'replacement-r1',
    replicaIds: ['replacement-r1'],
    nodeId: 'replacement-node',
    dbPath: ':memory:',
    systemTableCache,
    cdcIntegrationService: mockCdcIntegrationService,
  })));
  partition.controlPlaneSystemTableGateway.readAuthoritativeRows =
    async (tableName, sql, params, options) => {
      readCalls.push({tableName, sql, params, options});
      return {
        success: true,
        rows: [{
          [COLUMN.PARTITION_ID]: partitionId,
          [COLUMN.LEADER_NODE_ID]: 'seed-node',
          [COLUMN.UPDATED_AT]: 91,
        }],
      };
    };
  partition.isLeader = true;
  partition.leaderNodeMutationHelper.pendingValue = 'replacement-node';

  const result = await partition.flushLeaderNodeUpdate();
  const leaderUpdate = updates.find(
    (update) => update.tableName === SYSTEM_TABLE_NAME.PARTITIONS,
  );

  t.equal(result.reason, 'applied');
  t.equal(readCalls.length, 1);
  t.equal(
    readCalls[0]?.options?.authoritativeReadMode,
    CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_PREFERRED,
    'a remote replacement must confirm the CAS row through its owner');
  t.equal(readCalls[0]?.options?.deliveryPriority, 'critical');
  t.equal(readCalls[0]?.options?.workClass, PRESSURE_WORK_CLASS.CRITICAL);
  t.same(leaderUpdate?.whereClause, {
    [COLUMN.PARTITION_ID]: partitionId,
    [COLUMN.LEADER_NODE_ID]: 'seed-node',
    [COLUMN.UPDATED_AT]: 91,
  });
  t.equal(
    leaderUpdate?.data?.[COLUMN.LEADER_NODE_ID],
    'replacement-node',
  );

  await partition.shutdown();
});

test('PartitionService - keeps control-plane metadata publication critical', async (t) => {
  const updates = [];
  // The replica's durable services row and its partition's durable row.
  const durable = createDurableSystemTables([
    registeredServiceRow('nodes-p1-r1',
      INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.NODES], 'seed-node'),
    [TABLES.PARTITIONS, {
      [COLUMN.PARTITION_ID]: INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.NODES],
      [COLUMN.TABLE_ID]: SYSTEM_TABLE_NAME.NODES,
    }]]);
  const mockCdcIntegrationService = cdcFake({
    executeAuthoritativeSystemTableRead: durable.read,
    updateSystemTableRow: async (tableName, whereClause, data, options) => {
      updates.push({tableName, whereClause, data, options});
      durable.apply(tableName, whereClause, data);
      return {success: true};
    },
  });
  const systemTableCache = new SystemTableCache();
  const servicesPartitionId = INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.SERVICES];
  const partitionsPartitionId = INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.PARTITIONS];
  systemTableCache.applySystemTableChange(TABLES.PARTITIONS, CDCOperation.INSERT, {
    [COLUMN.PARTITION_ID]: servicesPartitionId,
    [COLUMN.TABLE_ID]: SYSTEM_TABLE_NAME.SERVICES,
    replica_count: 3,
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

  const partition = new PartitionService(partitionCollaboratorOptions(withFoundingStamp({
    partitionId: INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.NODES],
    tableId: SYSTEM_TABLE_NAME.NODES,
    tableName: SYSTEM_TABLE_NAME.NODES,
    replicaId: 'nodes-p1-r1',
    replicaIds: ['nodes-p1-r1'],
    nodeId: 'seed-node',
    dbPath: ':memory:',
    cdcIntegrationService: mockCdcIntegrationService,
  })));

  await partition.initialize();
  partition.setSystemTableCache(systemTableCache);
  partition.setCdcIntegrationService(mockCdcIntegrationService);

  // Both publications confirm against their authoritative rows first.
  await waitForCondition(() =>
    updates.some((update) => update.tableName === SYSTEM_TABLE_NAME.SERVICES) &&
    updates.some((update) => update.tableName === SYSTEM_TABLE_NAME.PARTITIONS));

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

  await partition.shutdown();
});

test('PartitionService - retries leader node persistence after cache visibility false negative',
  async (t) => {
    const updates = [];
    // The partition's durable row (no leader published yet).
    const durable = createDurableSystemTables([[TABLES.PARTITIONS, {
      [COLUMN.PARTITION_ID]: 'test-partition-23-retry',
      [COLUMN.TABLE_ID]: 'services',
    }]]);
    const mockCdcIntegrationService = cdcFake({
      executeAuthoritativeSystemTableRead: durable.read,
      updateSystemTableRow: async (tableName, whereClause, data, options) => {
        updates.push({tableName, whereClause, data, options});
        if (updates.length === 1) {
          throw new Error(
            'Cache update not observed for partitions:test-partition-23-retry within 1000ms',
          );
        }
        return {success: true};
      },
    });

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

    const partition = new PartitionService(partitionCollaboratorOptions(withFoundingStamp({
      partitionId: 'test-partition-23-retry',
      tableId: 'services',
      tableName: 'services',
      replicaId: 'replica-1',
      replicaIds: ['replica-1'],
      nodeId: 'seed-node',
      dbPath: ':memory:',
      systemTableCache,
      cdcIntegrationService: mockCdcIntegrationService,
    })));

    await partition.initialize();
    // The publication confirms against the authoritative row first.
    await waitForCondition(() => updates.length > 0);

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
