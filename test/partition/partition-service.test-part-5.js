/**
 * Unit tests for PartitionService.
 * Tests SQLite-backed Raft group for data storage.
 * Requirements: 3.2, 3.3, 3.4, 3.5, 4.4
 */

import {EventEmitter} from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import LifeRaft from '@markwylde/liferaft';
import {
  PartitionService,
  PartitionState,
  RaftRole,
  CDCOperation,
} from '../../src/partition/partition-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  PARTITION_SERVICE_INIT_STAGE,
  PARTITION_SERVICE_LEARNER_PROMOTION_SCHEDULE_REASON,
  PARTITION_SERVICE_LOG_MSG,
  PARTITION_SERVICE_OPERATION,
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
  RAFT_TRANSPORT_BACKGROUND_DELIVERY_OPTIONS,
} from '../../src/raft/constants.js';
import {
  COLUMN,
  SERVICE_TYPE,
  SERVICE_STATUS,
  STATE,
  TABLES,
} from '../../src/constants/index.js';
import {
  OperationType,
  ReplicaStatus,
} from '../../src/rebalancer/replica-status.js';
import {
  PARTITION_SPLIT_MIRROR_ORIGIN,
  PARTITION_TRANSITION_METADATA_FIELD,
  PARTITION_TRANSITION_STATE,
} from '../../src/partition/partition-constants.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  PRESSURE_WORK_CLASS,
} from '../../src/control-plane/pressure-governor.js';

const TEST_PARTITION_ID = 'partition-1';
const TEST_OWNER_NODE_ID = 'node-owner';
const TEST_STALE_OWNER_NODE_ID = 'node-stale-owner';
const TEST_LIVE_LEADER_NODE_ID = 'node-live-leader';
const TEST_OWNER_REPLICA_ID = 'replica-owner-row';
const TEST_LIVE_LEADER_REPLICA_ID = 'replica-live-leader';

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
      learnerPromotionDelayMs: 25,
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
    const mockCache = {
      get: () => null,
      filter: (tableName, predicate) => {
        if (tableName === TABLES.PARTITIONS) {
          return [
            {
              partition_id: 'test-partition',
              leader_node_id: 'node-1',
            },
          ].filter(predicate);
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

    partition.checkLearnerPromotion();

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

  partition.checkLearnerPromotion();

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
  partition.checkLearnerPromotion();

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

  partition.checkLearnerPromotion();

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
  partition.checkLearnerPromotion();

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

    partition.checkLearnerPromotion();

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
