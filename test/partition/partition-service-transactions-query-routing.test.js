/**
 * Unit tests for PartitionService.
 * Tests SQLite-backed Raft group for data storage.
 * Requirements: 3.2, 3.3, 3.4, 3.5, 4.4
 */

import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import LifeRaft from '@markwylde/liferaft';
import {
  checkLearnerPromotionWithGrantedProof,
  createLoopbackTransport,
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
  PARTITION_SERVICE_MESSAGE_TYPE,
  PARTITION_SERVICE_OPERATION,
} from '../../src/partition/partition-service-constants.js';
import {
  SYSTEM_TABLE_NAME,
  INITIAL_PARTITION_IDS,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {
} from '../../src/raft/constants.js';
import {
  SERVICE_TYPE,
  SERVICE_STATUS,
  TABLES,
} from '../../src/constants/index.js';
import {
  OperationType,
  ReplicaStatus,
} from '../../src/rebalancer/replica-status.js';
import {
} from '../../src/partition/partition-constants.js';
import {
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
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


test(
  'PartitionService - reconciled single-replica leader keeps promoted joiner follower',
  async (t) => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
    const config = ConfigurationManager.getInstance();
    config.initialize({
      node: {id: 'test-node'},
      raft: {
        heartbeatIntervalMs: 20,
        electionTimeoutMinMs: 100,
        electionTimeoutMaxMs: 200,
      },
    });
    const logger = LoggingService.getInstance();
    logger.initialize({level: 'error'});

    const systemTableCache = new SystemTableCache();
    // The persisted policy row: learner promotion resolves its desired RF
    // through the replication-target authority and DEFERS on an undeclared
    // policy, so the fixture carries what production always persists.
    systemTableCache.applySystemTableChange(
      TABLES.PARTITIONS, CDCOperation.INSERT, {
        partition_id: 'stable-join-partition',
        table_id: 'stable_join_table',
        replica_count: 2,
      });
    systemTableCache.applySystemTableChange(TABLES.SERVICES, CDCOperation.INSERT, {
      service_id: 'replica-1',
      partition_id: 'stable-join-partition',
      service_type: SERVICE_TYPE.PARTITION,
      node_id: 'node-1',
      status: SERVICE_STATUS.ACTIVE,
      raft_role: RaftRole.LEADER,
    });

    const transport = createLoopbackTransport();
    const leader = new PartitionService({
      partitionId: 'stable-join-partition',
      tableId: 'stable_join_table',
      tableName: 'stable_join_table',
      replicaId: 'replica-1',
      replicaIds: ['replica-1'],
      nodeId: 'node-1',
      transport,
      systemTableCache,
      dbPath: ':memory:',
    });
    const joiner = new PartitionService({
      partitionId: 'stable-join-partition',
      tableId: 'stable_join_table',
      tableName: 'stable_join_table',
      replicaId: 'replica-2',
      replicaIds: ['replica-1', 'replica-2'],
      peerAddresses: [
        'node-1/partition/replica-1',
        'node-2/partition/replica-2',
      ],
      nodeId: 'node-2',
      transport,
      systemTableCache,
      dbPath: ':memory:',
      isJoiningExistingGroup: true,
      leaderAddress: 'node-1/partition/replica-1',
      learnerCatchUpCheckIntervalMs: 25,
    });

    try {
      await leader.initialize();
      await joiner.initialize();

      t.equal(
        leader.raft.state,
        LifeRaft.LEADER,
        'single-replica owner should become a real raft leader before expansion',
      );

      systemTableCache.applySystemTableChange(TABLES.SERVICES, CDCOperation.INSERT, {
        service_id: 'replica-2',
        partition_id: 'stable-join-partition',
        service_type: SERVICE_TYPE.PARTITION,
        node_id: 'node-2',
        status: SERVICE_STATUS.ACTIVE,
        raft_role: RaftRole.LEARNER,
      });

      const peerJoined = await waitForCondition(
        () => leader.raft.nodes.some(
          (node) => node?.address === 'node-2/partition/replica-2',
        ),
        1000,
        10,
      );
      t.equal(peerJoined, true, 'leader should reconcile the joiner as a raft peer');

      const promoted = await waitForCondition(
        () => joiner.role === RaftRole.FOLLOWER,
        1000,
        10,
      );
      t.equal(promoted, true, 'joiner should promote from learner to follower');

      await new Promise((resolve) => setTimeout(resolve, 320));

      t.equal(
        joiner.role,
        RaftRole.FOLLOWER,
        'joiner should remain follower after promotion when leader heartbeats are active',
      );
      t.equal(
        joiner.raft.state,
        LifeRaft.FOLLOWER,
        'joiner raft state should stay follower instead of drifting to candidate',
      );
      t.equal(
        joiner.leaderId,
        'replica-1',
        'joiner should retain the reconciled leader replica identity after promotion',
      );
    } finally {
      await joiner.shutdown();
      await leader.shutdown();
    }
  },
);

test(
  'PartitionService - learner promotion resolves leader from canonical metadata when hint is absent',
  async (t) => {
    const partitionPolicyRow = {
      partition_id: 'test-partition',
      leader_node_id: 'node-1',
      // Persisted policy: the promotion path reads this row through the
      // replication-target authority and defers on an undeclared policy.
      replica_count: 3,
    };
    const mockCache = {
      get: (tableName, key) =>
        tableName === TABLES.PARTITIONS && key === 'test-partition' ?
          partitionPolicyRow :
          null,
      filter: (tableName, predicate) => {
        if (tableName === TABLES.PARTITIONS) {
          return [partitionPolicyRow].filter(predicate);
        }
        if (tableName === TABLES.SERVICES) {
          const services = [
            {
              service_id: 'replica-1',
              replica_id: 'replica-1',
              partition_id: 'test-partition',
              service_type: SERVICE_TYPE.PARTITION,
              node_id: 'node-1',
              status: SERVICE_STATUS.ACTIVE,
              raft_role: 'follower',
            },
            {
              service_id: 'replica-2',
              replica_id: 'replica-2',
              partition_id: 'test-partition',
              service_type: SERVICE_TYPE.PARTITION,
              node_id: 'node-2',
              status: SERVICE_STATUS.ACTIVE,
              raft_role: 'learner',
            },
            {
              service_id: 'replica-3',
              replica_id: 'replica-3',
              partition_id: 'test-partition',
              service_type: SERVICE_TYPE.PARTITION,
              node_id: 'node-3',
              status: SERVICE_STATUS.ACTIVE,
              raft_role: 'learner',
            },
          ];
          return services.filter(predicate);
        }
        return [];
      },
    };

    const partition = new PartitionService({
      partitionId: 'test-partition',
      tableId: 'test-table',
      replicaId: 'replica-3',
      replicaIds: ['replica-1', 'replica-2', 'replica-3'],
      nodeId: 'node-3',
      dbPath: ':memory:',
      isJoiningExistingGroup: true,
      systemTableCache: mockCache,
    });

    partition.role = RaftRole.LEARNER;
    partition.leaderId = null;
    let electionStarted = false;
    partition.startElection = () => {
      electionStarted = true;
    };

    await checkLearnerPromotionWithGrantedProof(partition);

    t.equal(
      partition.leaderId,
      'replica-1',
      'canonical partition leader_node_id should resolve the leader replica',
    );
    t.equal(
      partition.role,
      RaftRole.FOLLOWER,
      'learner should promote once canonical metadata identifies the leader',
    );
    t.equal(electionStarted, true, 'promotion should start elections as a voter');

    if (partition.learnerPromotionTimer) {
      clearTimeout(partition.learnerPromotionTimer);
      partition.learnerPromotionTimer = null;
    }
  },
);

test('PartitionService - critical partition defers second learner when replacement window is exhausted', async (t) => {
  const mockCache = {
    get: () => null,
    filter: (tableName, predicate) => {
      if (tableName === TABLES.PARTITIONS) {
        const partitions = [{
          partition_id: 'test-partition',
          replica_count: 3,
        }];
        return partitions.filter(predicate);
      }
      if (tableName === TABLES.SERVICES) {
        const services = [
          {
            service_id: 'replica-1',
            partition_id: `${SYSTEM_TABLE_NAME.CONFIG}-p1`,
            service_type: SERVICE_TYPE.PARTITION,
            status: SERVICE_STATUS.ACTIVE,
            raft_role: 'leader',
          },
          {
            service_id: 'replica-2',
            partition_id: `${SYSTEM_TABLE_NAME.CONFIG}-p1`,
            service_type: SERVICE_TYPE.PARTITION,
            status: SERVICE_STATUS.ACTIVE,
            raft_role: 'follower',
          },
          {
            service_id: 'replica-3',
            partition_id: `${SYSTEM_TABLE_NAME.CONFIG}-p1`,
            service_type: SERVICE_TYPE.PARTITION,
            status: SERVICE_STATUS.ACTIVE,
            raft_role: 'follower',
          },
          {
            service_id: 'replica-4',
            partition_id: `${SYSTEM_TABLE_NAME.CONFIG}-p1`,
            service_type: SERVICE_TYPE.PARTITION,
            status: SERVICE_STATUS.ACTIVE,
            raft_role: 'learner',
          },
          {
            service_id: 'replica-5',
            partition_id: `${SYSTEM_TABLE_NAME.CONFIG}-p1`,
            service_type: SERVICE_TYPE.PARTITION,
            status: SERVICE_STATUS.ACTIVE,
            raft_role: 'learner',
          },
        ];
        return services.filter(predicate);
      }
      return [];
    },
  };

  const partition = new PartitionService({
    partitionId: `${SYSTEM_TABLE_NAME.CONFIG}-p1`,
    tableId: SYSTEM_TABLE_NAME.CONFIG,
    replicaId: 'replica-5',
    replicaIds: ['replica-5'],
    nodeId: 'node-2',
    dbPath: ':memory:',
    isJoiningExistingGroup: true,
    systemTableCache: mockCache,
  });

  partition.role = RaftRole.LEARNER;
  partition.leaderId = 'replica-1';

  await partition.checkLearnerPromotion();

  t.equal(
    partition.role,
    RaftRole.LEARNER,
    'Critical partitions should defer when a second learner would exceed the bounded replacement window',
  );
  t.ok(
    partition.learnerPromotionTimer,
    'Exhausted critical replacement window should reschedule',
  );

  if (partition.learnerPromotionTimer) {
    clearTimeout(partition.learnerPromotionTimer);
    partition.learnerPromotionTimer = null;
  }
});

test('PartitionService - learner promotes when multiple learners reach odd count within target replica count', async (t) => {
  // Create a mock system table cache with 3 active voters and 2 learners
  // 3 voters + 2 learners = 5 (odd) - should allow promotion
  const mockCache = {
    get: (tableName, key) => {
      if (tableName === TABLES.PARTITIONS && key === 'test-partition') {
        return {
          partition_id: 'test-partition',
          replica_count: 5,
        };
      }
      return null;
    },
    filter: (tableName, predicate) => {
      if (tableName === TABLES.PARTITIONS) {
        const partitions = [{
          partition_id: 'test-partition',
          replica_count: 5,
        }];
        return partitions.filter(predicate);
      }
      if (tableName === TABLES.SERVICES) {
        const services = [
          {
            service_id: 'replica-1',
            partition_id: 'test-partition',
            service_type: SERVICE_TYPE.PARTITION,
            status: SERVICE_STATUS.ACTIVE,
            raft_role: 'leader',
          },
          {
            service_id: 'replica-2',
            partition_id: 'test-partition',
            service_type: SERVICE_TYPE.PARTITION,
            status: SERVICE_STATUS.ACTIVE,
            raft_role: 'follower',
          },
          {
            service_id: 'replica-3',
            partition_id: 'test-partition',
            service_type: SERVICE_TYPE.PARTITION,
            status: SERVICE_STATUS.ACTIVE,
            raft_role: 'follower',
          },
          // Two learners waiting to promote
          {
            service_id: 'replica-4',
            partition_id: 'test-partition',
            service_type: SERVICE_TYPE.PARTITION,
            status: SERVICE_STATUS.ACTIVE,
            raft_role: 'learner',
          },
          {
            service_id: 'replica-5',
            partition_id: 'test-partition',
            service_type: SERVICE_TYPE.PARTITION,
            status: SERVICE_STATUS.ACTIVE,
            raft_role: 'learner',
          },
        ];
        return services.filter(predicate);
      }
      return [];
    },
  };

  // Create partition as one of the learners
  const partition = new PartitionService({
    partitionId: 'test-partition',
    tableId: 'test-table',
    replicaId: 'replica-4',
    replicaIds: ['replica-4'],
    nodeId: 'node-2',
    dbPath: ':memory:',
    isJoiningExistingGroup: true,
    systemTableCache: mockCache,
  });

  // Manually set role to learner
  partition.role = RaftRole.LEARNER;
  partition.leaderId = 'replica-1';

  // Manually trigger learner promotion check
  await checkLearnerPromotionWithGrantedProof(partition);

  // Should promote because 3 voters + 2 learners = 5 (odd)
  // Even though 3 + 1 = 4 (even), all learners promoting gives odd count
  // and stays within the configured target of 5 voters.
  t.equal(partition.role, RaftRole.FOLLOWER,
    'Should promote when all learners would reach odd count within target');

  // Clean up any timers
  if (partition.learnerPromotionTimer) {
    clearTimeout(partition.learnerPromotionTimer);
    partition.learnerPromotionTimer = null;
  }
});

test('PartitionService - learner defers when multiple learners would exceed target replica count', async (t) => {
  const mockCache = {
    get: (tableName, key) => {
      if (tableName === TABLES.PARTITIONS && key === 'test-partition') {
        return {
          partition_id: 'test-partition',
          replica_count: 3,
        };
      }
      return null;
    },
    filter: (tableName, predicate) => {
      if (tableName === TABLES.PARTITIONS) {
        const partitions = [{
          partition_id: 'test-partition',
          replica_count: 3,
        }];
        return partitions.filter(predicate);
      }
      if (tableName === TABLES.SERVICES) {
        const services = [
          {
            service_id: 'replica-1',
            partition_id: 'test-partition',
            service_type: SERVICE_TYPE.PARTITION,
            status: SERVICE_STATUS.ACTIVE,
            raft_role: 'leader',
          },
          {
            service_id: 'replica-2',
            partition_id: 'test-partition',
            service_type: SERVICE_TYPE.PARTITION,
            status: SERVICE_STATUS.ACTIVE,
            raft_role: 'follower',
          },
          {
            service_id: 'replica-3',
            partition_id: 'test-partition',
            service_type: SERVICE_TYPE.PARTITION,
            status: SERVICE_STATUS.ACTIVE,
            raft_role: 'follower',
          },
          {
            service_id: 'replica-4',
            partition_id: 'test-partition',
            service_type: SERVICE_TYPE.PARTITION,
            status: SERVICE_STATUS.ACTIVE,
            raft_role: 'learner',
          },
          {
            service_id: 'replica-5',
            partition_id: 'test-partition',
            service_type: SERVICE_TYPE.PARTITION,
            status: SERVICE_STATUS.ACTIVE,
            raft_role: 'learner',
          },
        ];
        return services.filter(predicate);
      }
      return [];
    },
  };

  const partition = new PartitionService({
    partitionId: 'test-partition',
    tableId: 'test-table',
    replicaId: 'replica-4',
    replicaIds: ['replica-4'],
    nodeId: 'node-2',
    dbPath: ':memory:',
    isJoiningExistingGroup: true,
    systemTableCache: mockCache,
  });

  partition.role = RaftRole.LEARNER;
  partition.leaderId = 'replica-1';

  await partition.checkLearnerPromotion();

  t.equal(
    partition.role,
    RaftRole.LEARNER,
    'Should defer when multi-learner promotion would exceed target',
  );
  t.ok(partition.learnerPromotionTimer, 'Should reschedule promotion check');

  if (partition.learnerPromotionTimer) {
    clearTimeout(partition.learnerPromotionTimer);
    partition.learnerPromotionTimer = null;
  }
});

test('PartitionService - learner deferred when all learners would still be even', async (t) => {
  // Create a mock system table cache with 3 active voters and 3 learners.
  // 3 voters + 3 learners = 6 (even), so the learner should still defer.
  const mockCache = {
    get: (tableName, key) => {
      if (tableName === TABLES.PARTITIONS && key === 'test-partition') {
        return {
          partition_id: 'test-partition',
          replica_count: 6,
        };
      }
      return null;
    },
    filter: (tableName, predicate) => {
      if (tableName === TABLES.PARTITIONS) {
        return [{
          partition_id: 'test-partition',
          replica_count: 6,
        }].filter(predicate);
      }
      if (tableName === TABLES.SERVICES) {
        const services = [
          {
            service_id: 'replica-1',
            partition_id: 'test-partition',
            service_type: SERVICE_TYPE.PARTITION,
            status: SERVICE_STATUS.ACTIVE,
            raft_role: 'leader',
          },
          {
            service_id: 'replica-2',
            partition_id: 'test-partition',
            service_type: SERVICE_TYPE.PARTITION,
            status: SERVICE_STATUS.ACTIVE,
            raft_role: 'follower',
          },
          {
            service_id: 'replica-3',
            partition_id: 'test-partition',
            service_type: SERVICE_TYPE.PARTITION,
            status: SERVICE_STATUS.ACTIVE,
            raft_role: 'follower',
          },
          // Only one learner
          {
            service_id: 'replica-4',
            partition_id: 'test-partition',
            service_type: SERVICE_TYPE.PARTITION,
            status: SERVICE_STATUS.ACTIVE,
            raft_role: 'learner',
          },
          {
            service_id: 'replica-5',
            partition_id: 'test-partition',
            service_type: SERVICE_TYPE.PARTITION,
            status: SERVICE_STATUS.ACTIVE,
            raft_role: 'learner',
          },
          {
            service_id: 'replica-6',
            partition_id: 'test-partition',
            service_type: SERVICE_TYPE.PARTITION,
            status: SERVICE_STATUS.ACTIVE,
            raft_role: 'learner',
          },
        ];
        return services.filter(predicate);
      }
      return [];
    },
  };

  // Create partition as the learner
  const partition = new PartitionService({
    partitionId: 'test-partition',
    tableId: 'test-table',
    replicaId: 'replica-4',
    replicaIds: ['replica-4'],
    nodeId: 'node-2',
    dbPath: ':memory:',
    isJoiningExistingGroup: true,
    systemTableCache: mockCache,
  });

  // Manually set role to learner
  partition.role = RaftRole.LEARNER;
  partition.leaderId = 'replica-1';

  // Manually trigger learner promotion check
  await partition.checkLearnerPromotion();

  // Should remain learner because 3 + 1 = 4 (even) and promoting all learners
  // would still leave the group at an even count of 6.
  t.equal(partition.role, RaftRole.LEARNER,
    'Should remain learner when all learners would still be even');

  // Verify promotion timer was rescheduled
  t.ok(partition.learnerPromotionTimer, 'Should reschedule promotion check');

  // Clean up timer
  if (partition.learnerPromotionTimer) {
    clearTimeout(partition.learnerPromotionTimer);
    partition.learnerPromotionTimer = null;
  }
});

test(
  'PartitionService - critical operation-owned learner promotion tolerates stale peer learner',
  async (t) => {
    const criticalPartitionId =
      INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.REPLICA_OPERATIONS];
    const replicaCount = 3;
    const leaderReplicaId = 'replica-1';
    const leaderNodeId = 'node-1';
    const firstFollowerReplicaId = 'replica-2';
    const firstFollowerNodeId = 'node-2';
    const secondFollowerReplicaId = 'replica-3';
    const secondFollowerNodeId = 'node-3';
    const currentReplicaId = 'replica-6';
    const currentNodeId = 'node-6';
    const staleReplicaId = 'replica-5';
    const staleNodeId = 'node-5';
    const staleOperationId = 'operation-stale-replace';
    const currentOperationId = 'operation-current-replace';
    const memoryDbPath = ':memory:';
    const absentRow = null;
    const partitionRow = {
      partition_id: criticalPartitionId,
      replica_count: replicaCount,
    };
    const services = [
      {
        service_id: leaderReplicaId,
        replica_id: leaderReplicaId,
        node_id: leaderNodeId,
        partition_id: criticalPartitionId,
        service_type: SERVICE_TYPE.PARTITION,
        status: ReplicaStatus.ACTIVE,
        raft_role: RaftRole.LEADER,
      },
      {
        service_id: firstFollowerReplicaId,
        replica_id: firstFollowerReplicaId,
        node_id: firstFollowerNodeId,
        partition_id: criticalPartitionId,
        service_type: SERVICE_TYPE.PARTITION,
        status: ReplicaStatus.ACTIVE,
        raft_role: RaftRole.FOLLOWER,
      },
      {
        service_id: secondFollowerReplicaId,
        replica_id: secondFollowerReplicaId,
        node_id: secondFollowerNodeId,
        partition_id: criticalPartitionId,
        service_type: SERVICE_TYPE.PARTITION,
        status: ReplicaStatus.ACTIVE,
        raft_role: RaftRole.FOLLOWER,
      },
      {
        service_id: staleReplicaId,
        replica_id: staleReplicaId,
        node_id: staleNodeId,
        partition_id: criticalPartitionId,
        service_type: SERVICE_TYPE.PARTITION,
        status: ReplicaStatus.ACTIVE,
        raft_role: RaftRole.LEARNER,
      },
      {
        service_id: currentReplicaId,
        replica_id: currentReplicaId,
        node_id: currentNodeId,
        partition_id: criticalPartitionId,
        service_type: SERVICE_TYPE.PARTITION,
        status: ReplicaStatus.ACTIVE,
        raft_role: RaftRole.LEARNER,
      },
    ];
    const operations = [
      {
        operation_id: staleOperationId,
        type: OperationType.REPLACE,
        partition_id: criticalPartitionId,
        replica_id: staleReplicaId,
        target_node_id: staleNodeId,
        status: ReplicaStatus.SYNCING,
      },
      {
        operation_id: currentOperationId,
        type: OperationType.REPLACE,
        partition_id: criticalPartitionId,
        replica_id: currentReplicaId,
        target_node_id: currentNodeId,
        status: ReplicaStatus.SYNCING,
      },
    ];
    const mockCache = {
      get: (tableName, key) => {
        if (tableName === TABLES.PARTITIONS && key === criticalPartitionId) {
          return partitionRow;
        }
        return absentRow;
      },
      filter: (tableName, predicate) => {
        if (tableName === TABLES.PARTITIONS) {
          return [partitionRow].filter(predicate);
        }
        if (tableName === TABLES.SERVICES) {
          return services.filter(predicate);
        }
        if (tableName === TABLES.REPLICA_OPERATIONS) {
          return operations.filter(predicate);
        }
        return [];
      },
    };

    const partition = new PartitionService({
      partitionId: criticalPartitionId,
      tableId: SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
      replicaId: currentReplicaId,
      replicaIds: [currentReplicaId],
      nodeId: currentNodeId,
      dbPath: memoryDbPath,
      isJoiningExistingGroup: false,
      systemTableCache: mockCache,
    });
    let electionStarted = false;
    partition.role = RaftRole.LEARNER;
    partition.leaderId = leaderReplicaId;
    partition.startElection = () => {
      electionStarted = true;
    };

    await checkLearnerPromotionWithGrantedProof(partition);

    t.equal(
      partition.role,
      RaftRole.FOLLOWER,
      'current replacement learner should promote despite stale active peer learner evidence',
    );
    t.equal(
      partition.learnerPromotionTimer,
      null,
      'critical replacement promotion should not reschedule the learner timer',
    );
    t.equal(
      electionStarted,
      true,
      'critical replacement promotion should enter the voter election path',
    );

    if (partition.learnerPromotionTimer) {
      clearTimeout(partition.learnerPromotionTimer);
      partition.learnerPromotionTimer = null;
    }
  },
);

test(
  'PartitionService - learner promotion ignores orphan learners that do not have active add-like operations',
  async (t) => {
    const mockCache = {
      get: (tableName, key) => {
        if (tableName === TABLES.PARTITIONS && key === 'test-partition') {
          return {
            partition_id: 'test-partition',
            replica_count: 3,
          };
        }
        return null;
      },
      filter: (tableName, predicate) => {
        if (tableName === TABLES.PARTITIONS) {
          return [{
            partition_id: 'test-partition',
            replica_count: 3,
          }].filter(predicate);
        }
        if (tableName === TABLES.SERVICES) {
          const services = [
            {
              service_id: 'replica-1',
              partition_id: 'test-partition',
              service_type: SERVICE_TYPE.PARTITION,
              status: ReplicaStatus.ACTIVE,
              raft_role: 'leader',
            },
            {
              service_id: 'replica-2',
              partition_id: 'test-partition',
              service_type: SERVICE_TYPE.PARTITION,
              status: ReplicaStatus.ACTIVE,
              raft_role: 'follower',
            },
            {
              service_id: 'replica-3',
              partition_id: 'test-partition',
              service_type: SERVICE_TYPE.PARTITION,
              status: ReplicaStatus.ACTIVE,
              raft_role: 'follower',
            },
            {
              service_id: 'replica-4',
              partition_id: 'test-partition',
              service_type: SERVICE_TYPE.PARTITION,
              status: ReplicaStatus.ACTIVE,
              raft_role: 'learner',
            },
            {
              service_id: 'replica-5',
              partition_id: 'test-partition',
              service_type: SERVICE_TYPE.PARTITION,
              status: ReplicaStatus.ACTIVE,
              raft_role: 'learner',
            },
            {
              service_id: 'replica-6',
              partition_id: 'test-partition',
              service_type: SERVICE_TYPE.PARTITION,
              status: ReplicaStatus.ACTIVE,
              raft_role: 'learner',
            },
          ];
          return services.filter(predicate);
        }
        if (tableName === TABLES.REPLICA_OPERATIONS) {
          const operations = [
            {
              operation_id: 'op-replace-1',
              type: OperationType.REPLACE,
              partition_id: 'test-partition',
              replica_id: 'replica-4',
              status: ReplicaStatus.SYNCING,
            },
            {
              operation_id: 'op-replace-2',
              type: OperationType.REPLACE,
              partition_id: 'test-partition',
              replica_id: 'replica-5',
              status: ReplicaStatus.REMOVED,
            },
            {
              operation_id: 'op-replace-3',
              type: OperationType.REPLACE,
              partition_id: 'test-partition',
              replica_id: 'replica-6',
              status: ReplicaStatus.FAILED,
            },
          ];
          return operations.filter(predicate);
        }
        return [];
      },
    };

    const partition = new PartitionService({
      partitionId: 'test-partition',
      tableId: 'test-table',
      replicaId: 'replica-4',
      replicaIds: ['replica-4'],
      nodeId: 'node-2',
      dbPath: ':memory:',
      isJoiningExistingGroup: true,
      systemTableCache: mockCache,
    });

    partition.role = RaftRole.LEARNER;
    partition.leaderId = 'replica-1';

    await checkLearnerPromotionWithGrantedProof(partition);

    t.equal(
      partition.role,
      RaftRole.FOLLOWER,
      'orphan learner rows should not block promotion when only one add-like operation is active',
    );
    t.equal(
      partition.learnerPromotionTimer,
      null,
      'promotion should complete without a defer timer',
    );

    if (partition.learnerPromotionTimer) {
      clearTimeout(partition.learnerPromotionTimer);
      partition.learnerPromotionTimer = null;
    }
  },
);

test('PartitionService - countPendingLearners counts learner replicas', async (t) => {
  const mockCache = {
    get: () => null,
    filter: (tableName, predicate) => {
      if (tableName === TABLES.SERVICES) {
        const services = [
          {
            service_id: 'replica-1',
            partition_id: 'test-partition',
            service_type: SERVICE_TYPE.PARTITION,
            status: ReplicaStatus.ACTIVE,
            raft_role: 'leader',
          },
          {
            service_id: 'replica-2',
            partition_id: 'test-partition',
            service_type: SERVICE_TYPE.PARTITION,
            status: ReplicaStatus.ACTIVE,
            raft_role: 'learner',
          },
          {
            service_id: 'replica-3',
            partition_id: 'test-partition',
            service_type: SERVICE_TYPE.PARTITION,
            status: ReplicaStatus.ACTIVE,
            raft_role: 'learner',
          },
          {
            service_id: 'replica-4',
            partition_id: 'test-partition',
            service_type: SERVICE_TYPE.PARTITION,
            status: ReplicaStatus.FAILED, // Should be excluded
            raft_role: 'learner',
          },
        ];
        return services.filter(predicate);
      }
      return [];
    },
  };

  const partition = new PartitionService({
    partitionId: 'test-partition',
    tableId: 'test-table',
    replicaId: 'replica-5',
    replicaIds: ['replica-5'],
    nodeId: 'node-1',
    dbPath: ':memory:',
    systemTableCache: mockCache,
  });

  // Count pending learners - should count replica-2 and replica-3 (not failed replica-4)
  const learnerCount = partition.countPendingLearners();
  t.equal(learnerCount, 2, 'Should count only active learner replicas');
});

test('PartitionService - countActiveVoters excludes learners, failed replicas, ' +
  'and roleless rows', async (t) => {
  const mockCache = {
    get: () => null, // Not used for voter counting
    filter: (tableName, predicate) => {
      if (tableName === TABLES.SERVICES) {
        const services = [
          {
            service_id: 'replica-1',
            partition_id: 'test-partition',
            service_type: SERVICE_TYPE.PARTITION,
            status: ReplicaStatus.ACTIVE,
            raft_role: 'leader',
          },
          {
            service_id: 'replica-2',
            partition_id: 'test-partition',
            service_type: SERVICE_TYPE.PARTITION,
            status: ReplicaStatus.ACTIVE,
            raft_role: 'follower',
          },
          {
            service_id: 'replica-3',
            partition_id: 'test-partition',
            service_type: SERVICE_TYPE.PARTITION,
            status: ReplicaStatus.ACTIVE,
            raft_role: 'learner', // Should be excluded
          },
          {
            service_id: 'replica-4',
            partition_id: 'test-partition',
            service_type: SERVICE_TYPE.PARTITION,
            status: ReplicaStatus.FAILED, // Should be excluded
            raft_role: 'follower',
          },
          {
            service_id: 'replica-5',
            partition_id: 'test-partition',
            service_type: SERVICE_TYPE.PARTITION,
            status: ReplicaStatus.REMOVING, // Should be excluded
            raft_role: 'follower',
          },
          {
            service_id: 'replica-6',
            partition_id: 'test-partition',
            service_type: SERVICE_TYPE.PARTITION,
            status: ReplicaStatus.ACTIVE,
            raft_role: null, // Roleless replicas must not count as voters
          },
        ];
        return services.filter(predicate);
      }
      return [];
    },
  };

  const partition = new PartitionService({
    partitionId: 'test-partition',
    tableId: 'test-table',
    replicaId: 'replica-7',
    replicaIds: ['replica-7'], // Only self in replicaIds to avoid peer lookup
    nodeId: 'node-1',
    dbPath: ':memory:',
    systemTableCache: mockCache,
  });

  // Count active voters - should only count replica-1 and replica-2
  const voterCount = partition.countActiveVoters();
  t.equal(voterCount, 2, 'Should count only active non-learner replicas');
});

test('PartitionService - handleRemoteQuery returns redirect for writes on follower', async (t) => {
  const partition = new PartitionService({
    partitionId: 'test-partition',
    tableId: 'test-table',
    replicaId: 'replica-1',
    replicaIds: ['replica-1'],
    nodeId: 'node-1',
    dbPath: ':memory:',
  });

  await partition.initialize();

  // Set role to follower and set a known leader
  partition.role = 'follower';
  partition.leaderId = 'leader-replica';

  // Mock resolveLeaderAddress to return a known address
  partition.resolveLeaderAddress = () => 'leader-node/partition/test-partition';

  // Call handleRemoteQuery with a write query
  const result = await partition.handleRemoteQuery({
    sql: 'INSERT INTO test_table (id, name) VALUES (1, \'test\')',
    params: [],
  });

  t.equal(result.acknowledged, true, 'should acknowledge the request');
  t.equal(result.success, false, 'should not succeed (redirect instead)');
  t.equal(result.redirect, 'LEADER_REDIRECT', 'should return redirect type');
  t.equal(result.leaderAddress, 'leader-node/partition/test-partition',
    'should include leader address');

  partition.shutdown();
});

test('PartitionService - handleRemoteQuery executes reads on follower', async (t) => {
  const partition = new PartitionService({
    partitionId: 'test-partition',
    tableId: 'test-table',
    replicaId: 'replica-1',
    replicaIds: ['replica-1'],
    nodeId: 'node-1',
    dbPath: ':memory:',
  });

  await partition.initialize();

  // Create a test table
  partition.db.exec('CREATE TABLE test_data (id INTEGER PRIMARY KEY, name TEXT)');
  partition.db.exec('INSERT INTO test_data (id, name) VALUES (1, \'Alice\')');

  // Set role to follower
  partition.role = 'follower';

  // Call handleRemoteQuery with a read query - should execute locally
  const result = await partition.handleRemoteQuery({
    sql: 'SELECT * FROM test_data',
    params: [],
  });

  t.equal(result.acknowledged, true, 'should acknowledge the request');
  t.equal(result.success, true, 'should succeed for reads');
  t.equal(result.rows.length, 1, 'should return data');
  t.equal(result.rows[0].name, 'Alice', 'should return correct data');

  partition.shutdown();
});

test('PartitionService - executeQuery keeps non-transactional writes out of unrelated active transactions', async (t) => {
  const partition = new PartitionService({
    partitionId: 'test-partition',
    tableId: 'test-table',
    replicaId: 'replica-1',
    replicaIds: ['replica-1'],
    nodeId: 'node-1',
    dbPath: ':memory:',
  });

  await partition.initialize();
  partition.db.exec('CREATE TABLE test_data (id INTEGER PRIMARY KEY, name TEXT)');

  const beginResult = await partition.beginTransaction('tx-active', 101);
  t.equal(beginResult.success, true, 'setup transaction should begin');

  const proposedWrites = [];
  partition.proposeWrite = async (operation) => {
    proposedWrites.push(operation);
    return {
      success: true,
      changes: 1,
      partitionId: partition.partitionId,
    };
  };

  const result = await partition.executeQuery(
    'INSERT INTO test_data (id, name) VALUES (?, ?)',
    [1, 'Alice'],
    {sessionId: 'rebalance-coordinator:op-1'},
  );

  t.equal(result.success, true, 'non-transactional write should still succeed');
  t.equal(proposedWrites.length, 1, 'write should use the normal propose path');
  t.equal(
    partition.activeTransactions.get('tx-active')?.operations.length,
    0,
    'unrelated active transaction should not capture the write',
  );

  await partition.rollbackTransaction('tx-active');
  partition.shutdown();
});

test('PartitionService - beginTransaction is idempotent for the same active session', async (t) => {
  const partition = new PartitionService({
    partitionId: 'test-partition',
    tableId: 'test-table',
    replicaId: 'replica-1',
    replicaIds: ['replica-1'],
    nodeId: 'node-1',
    dbPath: ':memory:',
  });

  await partition.initialize();

  const firstResult = await partition.beginTransaction('tx-active', 101);
  const secondResult = await partition.beginTransaction('tx-active', 101);

  t.equal(firstResult.success, true, 'initial transaction should begin');
  t.equal(secondResult.success, true, 'same-session begin retry should succeed');
  t.equal(secondResult.idempotent, true,
    'same-session begin retry should be marked idempotent');
  t.equal(partition.activeTransactions.size, 1,
    'same-session begin retry should not create a second active transaction');

  await partition.rollbackTransaction('tx-active');
  partition.shutdown();
});

test('PartitionService - beginTransaction is idempotent for the same prepared session', async (t) => {
  const partition = new PartitionService({
    partitionId: 'test-partition',
    tableId: 'test-table',
    replicaId: 'replica-1',
    replicaIds: ['replica-1'],
    nodeId: 'node-1',
    dbPath: ':memory:',
  });

  await partition.initialize();
  partition.db.exec('CREATE TABLE test_data (id INTEGER PRIMARY KEY, name TEXT)');

  const beginResult = await partition.beginTransaction('tx-prepared', 202);
  t.equal(beginResult.success, true, 'initial transaction should begin');

  await partition.executeQuery(
    'INSERT INTO test_data (id, name) VALUES (?, ?)',
    [1, 'Alice'],
    {sessionId: 'tx-prepared'},
  );

  const prepareResult = await partition.prepareTransaction('tx-prepared');
  t.equal(prepareResult.success, true, 'transaction should prepare');
  t.equal(partition.isInTransaction(), true,
    'prepared transaction should still count as in-flight');

  const retryResult = await partition.beginTransaction('tx-prepared', 202);
  t.equal(retryResult.success, true, 'same-session begin retry should succeed');
  t.equal(retryResult.idempotent, true,
    'same-session begin retry should be marked idempotent');
  t.equal(partition.preparedTransactions.size, 1,
    'same-session begin retry should not create a second prepared transaction');

  await partition.rollbackTransaction('tx-prepared');
  partition.shutdown();
});

test('PartitionService - replica removal fence admits no new work and drains the existing transaction owner', async (t) => {
  const partition = new PartitionService({
    partitionId: 'test-partition',
    tableId: 'test-table',
    replicaId: 'replica-1',
    replicaIds: ['replica-1'],
    nodeId: 'node-1',
    dbPath: ':memory:',
  });

  await partition.initialize();
  await partition.beginTransaction('tx-before-removal', 404);

  const fence = partition.fenceServingAdmissionForRemoval();
  t.equal(fence.activeTransactionCount, 1,
    'the removal fence observes the transaction it must drain');
  const sameOwnerRetry = await partition.beginTransaction(
    'tx-before-removal',
    404,
  );
  t.equal(sameOwnerRetry.idempotent, true,
    'the admitted transaction keeps its canonical session ownership');
  await t.rejects(
    () => partition.beginTransaction('tx-after-removal', 405),
    /Serving admission fenced for replica removal/,
    'a later transaction cannot overtake the removal fence',
  );
  const deniedQuery = await partition.handleApplicationMessage({
    type: PARTITION_SERVICE_MESSAGE_TYPE.QUERY,
    sql: 'SELECT 1',
  });
  t.equal(deniedQuery.success, false,
    'a later non-transactional query cannot enter the retiring runtime');
  t.equal(deniedQuery.deferRetry, true,
    'the serving fence exposes one typed retry outcome');
  const deniedBegin = await partition.handleApplicationMessage({
    type: PARTITION_SERVICE_MESSAGE_TYPE.TRANSACTION,
    operation: PARTITION_SERVICE_OPERATION.BEGIN_TRANSACTION,
    sessionId: 'tx-after-removal-transport',
    transactionEpoch: 406,
  });
  t.equal(deniedBegin.success, false,
    'the transport transaction ingress shares the partition-owned fence');
  t.equal(deniedBegin.deferRetry, true,
    'transaction ingress preserves the same retryable fence outcome');

  let drained = false;
  const drain = partition.waitForRemovalServingDrain({pollIntervalMs: 1})
    .then(() => {
      drained = true;
    });
  await new Promise((resolve) => setTimeout(resolve, 5));
  t.equal(drained, false,
    'removal waits while the pre-fence transaction remains active');
  await partition.rollbackTransaction('tx-before-removal');
  await drain;
  t.equal(drained, true,
    'removal resumes only after the transaction owner reaches terminal');

  await partition.shutdown();
});

test('PartitionService - removal drain waits for a query admitted before its serving fence', async (t) => {
  const partition = new PartitionService({
    partitionId: 'test-partition',
    tableId: 'test-table',
    replicaId: 'replica-1',
    replicaIds: ['replica-1'],
    nodeId: 'node-1',
    dbPath: ':memory:',
  });
  await partition.initialize();

  let announceStarted;
  const started = new Promise((resolve) => {
    announceStarted = resolve;
  });
  let releaseQuery;
  const queryGate = new Promise((resolve) => {
    releaseQuery = resolve;
  });
  partition.handleRemoteQuery = async () => {
    announceStarted();
    await queryGate;
    return {acknowledged: true, success: true};
  };
  const admittedQuery = partition.handleApplicationMessage({
    type: PARTITION_SERVICE_MESSAGE_TYPE.QUERY,
    sql: 'SELECT 1',
  });
  await started;

  const fence = partition.fenceServingAdmissionForRemoval();
  t.equal(fence.activeServingRequestCount, 1,
    'the removal fence observes a request admitted before it was raised');
  let drained = false;
  const drain = partition.waitForRemovalServingDrain({pollIntervalMs: 1})
    .then(() => {
      drained = true;
    });
  await new Promise((resolve) => setTimeout(resolve, 5));
  t.equal(drained, false,
    'runtime teardown cannot overtake an admitted query');

  releaseQuery();
  await admittedQuery;
  await drain;
  t.equal(drained, true,
    'runtime teardown resumes after the admitted request returns');
  await partition.shutdown();
});

test('PartitionService - beginTransaction rejects other sessions while a prepared transaction is open', async (t) => {
  const partition = new PartitionService({
    partitionId: 'test-partition',
    tableId: 'test-table',
    replicaId: 'replica-1',
    replicaIds: ['replica-1'],
    nodeId: 'node-1',
    dbPath: ':memory:',
  });

  await partition.initialize();
  partition.db.exec('CREATE TABLE test_data (id INTEGER PRIMARY KEY, name TEXT)');

  await partition.beginTransaction('tx-prepared', 202);
  await partition.executeQuery(
    'INSERT INTO test_data (id, name) VALUES (?, ?)',
    [1, 'Alice'],
    {sessionId: 'tx-prepared'},
  );
  const prepareResult = await partition.prepareTransaction('tx-prepared');
  t.equal(prepareResult.success, true, 'transaction should prepare');

  await t.rejects(
    () => partition.beginTransaction('tx-other', 303),
    /Transaction already active on this partition/,
    'different-session begin should fail before SQLite re-entry',
  );

  await partition.rollbackTransaction('tx-prepared');
  partition.shutdown();
});

test('PartitionService - isWriteQuery detects write operations', async (t) => {
  const partition = new PartitionService({
    partitionId: 'test-partition',
    tableId: 'test-table',
    replicaId: 'replica-1',
    replicaIds: ['replica-1'],
    nodeId: 'node-1',
    dbPath: ':memory:',
  });

  t.equal(partition.isWriteQuery('INSERT INTO t VALUES (1)'), true, 'INSERT is write');
  t.equal(partition.isWriteQuery('UPDATE t SET x = 1'), true, 'UPDATE is write');
  t.equal(partition.isWriteQuery('DELETE FROM t'), true, 'DELETE is write');
  t.equal(partition.isWriteQuery('CREATE TABLE t (id INT)'), true, 'CREATE is write');
  t.equal(partition.isWriteQuery('DROP TABLE t'), true, 'DROP is write');
  t.equal(partition.isWriteQuery('ALTER TABLE t ADD col INT'), true, 'ALTER is write');
  t.equal(partition.isWriteQuery('SELECT * FROM t'), false, 'SELECT is not write');
  t.equal(partition.isWriteQuery('  select * from t'), false, 'lowercase SELECT is not write');
  t.equal(partition.isWriteQuery(null), false, 'null is not write');
  t.equal(partition.isWriteQuery(''), false, 'empty string is not write');
});

test('PartitionService - election jitter prevents timeout overlap', async (t) => {
  // Bug: ELECTION_JITTER_PER_REPLICA_MS (500ms) is smaller than the
  // election timeout range width (3000 - 1000 = 2000ms). This means
  // r1 [1000,3000] and r2 [1500,3500] overlap, so r2 can fire before
  // r1, causing unnecessary re-elections and leadership instability.
  // The jitter must be >= (electionMax - electionMin) to guarantee
  // that replica N always times out before replica N+1.
  const {PARTITION_SERVICE_VALUE} = await import(
    '../../src/partition/partition-service-constants.js'
  );

  const electionRange =
    PARTITION_SERVICE_VALUE.LIFERAFT_ELECTION_MAX_DEFAULT_MS -
    PARTITION_SERVICE_VALUE.LIFERAFT_ELECTION_MIN_DEFAULT_MS;
  const jitter = PARTITION_SERVICE_VALUE.ELECTION_JITTER_PER_REPLICA_MS;

  t.ok(
    jitter >= electionRange,
    `Jitter (${jitter}ms) must be >= election range width ` +
    `(${electionRange}ms) to prevent timeout overlap between replicas`,
  );
});
