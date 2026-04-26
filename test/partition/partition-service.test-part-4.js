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
} from '../../src/partition/partition-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  PARTITION_SERVICE_LEARNER_PROMOTION_SCHEDULE_REASON,
} from '../../src/partition/partition-service-constants.js';
import {
  SYSTEM_TABLE_NAME,
  INITIAL_PARTITION_IDS,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
  LIFECYCLE_PHASE,
  LIFECYCLE_REASON,
} from '../../src/bootstrap/lifecycle-controller-constants.js';
import {
} from '../../src/raft/constants.js';
import {
  COLUMN,
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
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
} from '../../src/control-plane/pressure-governor.js';

const TEST_OWNER_NODE_ID = 'node-owner';
const TEST_LIVE_LEADER_NODE_ID = 'node-live-leader';
const TEST_STALE_LOCAL_PROMOTION_PARTITION_ID =
  INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.SQL_WRITE_OPERATIONS];
const TEST_STALE_LOCAL_PROMOTION_LEADER_REPLICA_ID =
  'replica-stale-local-leader';
const TEST_STALE_LOCAL_PROMOTION_FOLLOWER_REPLICA_ID =
  'replica-stale-local-follower';
const TEST_STALE_LOCAL_PROMOTION_LOCAL_REPLICA_ID =
  'replica-stale-local-learner';
const TEST_STALE_LOCAL_PROMOTION_LOCAL_NODE_ID = 'node-stale-local-learner';
const TEST_STALE_LOCAL_PROMOTION_REPLICA_COUNT = 3;
const TEST_STALE_LOCAL_PROMOTION_DB_PATH = ':memory:';

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

test('PartitionService - setRebalanceCoordinator replaces local coordinator',
  async (t) => {
    const partition = new PartitionService({
      partitionId: 'test-partition-24',
      tableId: 'services',
      tableName: 'services',
      replicaId: 'replica-1',
      replicaIds: ['replica-1'],
      nodeId: 'test-node',
      dbPath: ':memory:',
    });

    await partition.initialize();

    const previousCoordinator = {
      shutdownCalled: false,
      shutdown: async function() {
        this.shutdownCalled = true;
      },
    };
    const sharedCoordinator = {shared: true};
    let rebalancerCoordinator = null;

    partition.ownsRebalanceCoordinator = true;
    partition.rebalanceCoordinator = previousCoordinator;
    partition.rebalancer = {
      setRebalanceCoordinator: (coordinator) => {
        rebalancerCoordinator = coordinator;
      },
      shutdown: () => {},
      setLeader: () => {},
    };

    partition.setRebalanceCoordinator(sharedCoordinator);
    await new Promise((resolve) => setImmediate(resolve));

    t.equal(
      partition.rebalanceCoordinator,
      sharedCoordinator,
      'Should use shared coordinator',
    );
    t.equal(
      partition.ownsRebalanceCoordinator,
      false,
      'Shared coordinator should not be owned by partition',
    );
    t.equal(
      rebalancerCoordinator,
      sharedCoordinator,
      'Rebalancer should receive shared coordinator',
    );
    t.equal(
      previousCoordinator.shutdownCalled,
      true,
      'Owned coordinator should be shutdown when replaced',
    );

    await partition.shutdown();
  });

test('PartitionService - learner promotes one temporary replacement voter above target for non-critical partitions', async (t) => {
  // Create a mock system table cache with 3 active voters and a 3-voter target.
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
        // Return 3 active partition replicas (odd count)
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
        ];
        return services.filter(predicate);
      }
      return [];
    },
  };

  // Create partition without initializing to test checkLearnerPromotion directly
  const partition = new PartitionService({
    partitionId: 'test-partition',
    tableId: 'test-table',
    replicaId: 'replica-4', // New replica joining
    replicaIds: ['replica-4'], // Only self in replicaIds to avoid peer lookup
    nodeId: 'node-2',
    dbPath: ':memory:',
    isJoiningExistingGroup: true, // Start as learner
    systemTableCache: mockCache,
  });

  // Manually set role to learner (simulating post-initialization state)
  partition.role = RaftRole.LEARNER;
  partition.leaderId = 'replica-1';

  // Manually trigger learner promotion check
  partition.checkLearnerPromotion();

  // One temporary replacement learner above target is allowed so the
  // source voter can be removed after the replacement becomes ready.
  t.equal(
    partition.role,
    RaftRole.FOLLOWER,
    'Should promote one temporary replacement learner above target',
  );
  t.equal(
    partition.isJoiningExistingGroup,
    false,
    'Promotion should exit joining-existing-group mode',
  );
  t.equal(
    partition.learnerPromotionTimer,
    null,
    'Single replacement promotion should not reschedule',
  );

  // Clean up timer
  if (partition.learnerPromotionTimer) {
    clearTimeout(partition.learnerPromotionTimer);
    partition.learnerPromotionTimer = null;
  }
});

test('PartitionService - learner promotes one temporary replacement voter above target for critical partitions during REPLACE', async (t) => {
  const mockCache = {
    get: (tableName, key) => {
      if (tableName === TABLES.PARTITIONS && key === 'nodes-p1') {
        return {
          partition_id: 'nodes-p1',
          replica_count: 3,
        };
      }
      return null;
    },
    filter: (tableName, predicate) => {
      if (tableName === TABLES.PARTITIONS) {
        return [{
          partition_id: 'nodes-p1',
          replica_count: 3,
        }].filter(predicate);
      }
      if (tableName === TABLES.SERVICES) {
        const services = [
          {
            service_id: 'nodes-p1-r1',
            partition_id: 'nodes-p1',
            service_type: SERVICE_TYPE.PARTITION,
            status: SERVICE_STATUS.ACTIVE,
            raft_role: 'leader',
          },
          {
            service_id: 'nodes-p1-r2',
            partition_id: 'nodes-p1',
            service_type: SERVICE_TYPE.PARTITION,
            status: SERVICE_STATUS.ACTIVE,
            raft_role: 'follower',
          },
          {
            service_id: 'nodes-p1-r3',
            partition_id: 'nodes-p1',
            service_type: SERVICE_TYPE.PARTITION,
            status: SERVICE_STATUS.ACTIVE,
            raft_role: 'follower',
          },
        ];
        return services.filter(predicate);
      }
      return [];
    },
  };

  const partition = new PartitionService({
    partitionId: 'nodes-p1',
    tableId: 'nodes',
    replicaId: 'nodes-p1-r4',
    replicaIds: ['nodes-p1-r4'],
    nodeId: 'node-d',
    dbPath: ':memory:',
    isJoiningExistingGroup: true,
    systemTableCache: mockCache,
  });

  partition.role = RaftRole.LEARNER;
  partition.leaderId = 'nodes-p1-r1';

  partition.checkLearnerPromotion();

  t.equal(
    partition.role,
    RaftRole.FOLLOWER,
    'critical REPLACE should allow the bounded temporary replacement voter',
  );
  t.equal(
    partition.isJoiningExistingGroup,
    false,
    'Promotion should exit joining-existing-group mode for critical replacement learners',
  );
  t.equal(
    partition.learnerPromotionTimer,
    null,
    'critical replacement promotion should not reschedule',
  );

  if (partition.learnerPromotionTimer) {
    clearTimeout(partition.learnerPromotionTimer);
    partition.learnerPromotionTimer = null;
  }
});

test('PartitionService - learner promotion discounts stale local voter row',
  async (t) => {
    const mockCache = {
      get: (tableName, key) => {
        if (
          tableName === TABLES.PARTITIONS &&
          key === TEST_STALE_LOCAL_PROMOTION_PARTITION_ID
        ) {
          return {
            [COLUMN.PARTITION_ID]: TEST_STALE_LOCAL_PROMOTION_PARTITION_ID,
            replica_count: TEST_STALE_LOCAL_PROMOTION_REPLICA_COUNT,
          };
        }
        return null;
      },
      filter: (tableName, predicate) => {
        if (tableName === TABLES.PARTITIONS) {
          return [{
            [COLUMN.PARTITION_ID]: TEST_STALE_LOCAL_PROMOTION_PARTITION_ID,
            replica_count: TEST_STALE_LOCAL_PROMOTION_REPLICA_COUNT,
          }].filter(predicate);
        }
        if (tableName === TABLES.SERVICES) {
          const services = [
            {
              [COLUMN.SERVICE_ID]:
                TEST_STALE_LOCAL_PROMOTION_LEADER_REPLICA_ID,
              [COLUMN.REPLICA_ID]:
                TEST_STALE_LOCAL_PROMOTION_LEADER_REPLICA_ID,
              [COLUMN.PARTITION_ID]:
                TEST_STALE_LOCAL_PROMOTION_PARTITION_ID,
              [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
              [COLUMN.NODE_ID]: TEST_LIVE_LEADER_NODE_ID,
              [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
              [COLUMN.RAFT_ROLE]: RaftRole.LEADER,
            },
            {
              [COLUMN.SERVICE_ID]:
                TEST_STALE_LOCAL_PROMOTION_FOLLOWER_REPLICA_ID,
              [COLUMN.REPLICA_ID]:
                TEST_STALE_LOCAL_PROMOTION_FOLLOWER_REPLICA_ID,
              [COLUMN.PARTITION_ID]:
                TEST_STALE_LOCAL_PROMOTION_PARTITION_ID,
              [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
              [COLUMN.NODE_ID]: TEST_OWNER_NODE_ID,
              [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
              [COLUMN.RAFT_ROLE]: RaftRole.FOLLOWER,
            },
            {
              [COLUMN.SERVICE_ID]: TEST_STALE_LOCAL_PROMOTION_LOCAL_REPLICA_ID,
              [COLUMN.REPLICA_ID]: TEST_STALE_LOCAL_PROMOTION_LOCAL_REPLICA_ID,
              [COLUMN.PARTITION_ID]:
                TEST_STALE_LOCAL_PROMOTION_PARTITION_ID,
              [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
              [COLUMN.NODE_ID]: TEST_STALE_LOCAL_PROMOTION_LOCAL_NODE_ID,
              [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
              [COLUMN.RAFT_ROLE]: RaftRole.FOLLOWER,
            },
          ];
          return services.filter(predicate);
        }
        return [];
      },
    };

    const partition = new PartitionService({
      partitionId: TEST_STALE_LOCAL_PROMOTION_PARTITION_ID,
      tableId: SYSTEM_TABLE_NAME.SQL_WRITE_OPERATIONS,
      replicaId: TEST_STALE_LOCAL_PROMOTION_LOCAL_REPLICA_ID,
      replicaIds: [TEST_STALE_LOCAL_PROMOTION_LOCAL_REPLICA_ID],
      nodeId: TEST_STALE_LOCAL_PROMOTION_LOCAL_NODE_ID,
      dbPath: TEST_STALE_LOCAL_PROMOTION_DB_PATH,
      isJoiningExistingGroup: true,
      systemTableCache: mockCache,
    });

    partition.role = RaftRole.LEARNER;
    partition.leaderId = TEST_STALE_LOCAL_PROMOTION_LEADER_REPLICA_ID;

    partition.checkLearnerPromotion();

    t.equal(
      partition.role,
      RaftRole.FOLLOWER,
      'local learner state should override a stale voter row during promotion',
    );
    t.equal(
      partition.learnerPromotionTimer,
      null,
      'promotion should not reschedule after local learner normalization',
    );

    if (partition.learnerPromotionTimer) {
      clearTimeout(partition.learnerPromotionTimer);
      partition.learnerPromotionTimer = null;
    }
  });

test('PartitionService - learner promotes when voter count would be odd', async (t) => {
  // Create a mock system table cache with 2 active voters (one was removed)
  const mockCache = {
    get: () => null, // Not used for voter counting
    filter: (tableName, predicate) => {
      if (tableName === TABLES.SERVICES) {
        // Return 2 active partition replicas (one was removed)
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
        ];
        return services.filter(predicate);
      }
      return [];
    },
  };

  // Create partition without initializing to test checkLearnerPromotion directly
  const partition = new PartitionService({
    partitionId: 'test-partition',
    tableId: 'test-table',
    replicaId: 'replica-3', // New replica joining
    replicaIds: ['replica-3'], // Only self in replicaIds to avoid peer lookup
    nodeId: 'node-2',
    dbPath: ':memory:',
    isJoiningExistingGroup: true, // Start as learner
    systemTableCache: mockCache,
  });

  // Manually set role to learner (simulating post-initialization state)
  partition.role = RaftRole.LEARNER;
  partition.leaderId = 'replica-1';

  // Manually trigger learner promotion check
  partition.checkLearnerPromotion();

  // Should promote because 2 + 1 = 3 voters (odd)
  t.equal(partition.role, RaftRole.FOLLOWER, 'Should promote to follower for odd voter count');

  // Clean up any timers
  if (partition.learnerPromotionTimer) {
    clearTimeout(partition.learnerPromotionTimer);
    partition.learnerPromotionTimer = null;
  }
});

test('PartitionService - learner promotion deferred until leader is known', async (t) => {
  const mockCache = {
    get: () => null,
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
            raft_role: 'follower',
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
    replicaIds: ['replica-3'],
    nodeId: 'node-2',
    dbPath: ':memory:',
    isJoiningExistingGroup: true,
    systemTableCache: mockCache,
  });

  partition.role = RaftRole.LEARNER;
  partition.leaderId = null;

  partition.checkLearnerPromotion();

  t.equal(
    partition.role,
    RaftRole.LEARNER,
    'Should remain learner until canonical leader metadata is discovered',
  );
  t.ok(partition.learnerPromotionTimer, 'Should reschedule promotion check');

  if (partition.learnerPromotionTimer) {
    clearTimeout(partition.learnerPromotionTimer);
    partition.learnerPromotionTimer = null;
  }
});

test(
  'PartitionService - deferred learner promotion uses catch-up recheck cadence',
  async (t) => {
    const scheduledDelayMs = [];
    const originalSetTimeout = global.setTimeout;
    global.setTimeout = (callback, delayMs) => {
      scheduledDelayMs.push(delayMs);
      return {callback, delayMs};
    };
    t.teardown(() => {
      global.setTimeout = originalSetTimeout;
    });

    const mockCache = {
      get: () => null,
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
              raft_role: 'follower',
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
      replicaIds: ['replica-3'],
      nodeId: 'node-2',
      dbPath: ':memory:',
      isJoiningExistingGroup: true,
      systemTableCache: mockCache,
      learnerPromotionDelayMs: 30000,
      learnerCatchUpCheckIntervalMs: 1000,
    });

    partition.role = RaftRole.LEARNER;
    partition.leaderId = null;
    partition.checkLearnerPromotion();

    t.equal(
      scheduledDelayMs[0],
      1000,
      'deferred promotion checks should use catch-up interval instead of full floor',
    );
    partition.learnerPromotionTimer = null;
  },
);

test(
  'PartitionService - priority recovery expedites initial learner promotion check',
  async (t) => {
    const scheduledDelayMs = [];
    const originalSetTimeout = global.setTimeout;
    global.setTimeout = (callback, delayMs) => {
      scheduledDelayMs.push(delayMs);
      return {callback, delayMs};
    };
    t.teardown(() => {
      global.setTimeout = originalSetTimeout;
    });

    const readinessState = createTrafficReadinessState();
    readinessState.transitionTo(LIFECYCLE_PHASE.CONTROL_READY, {
      ready: false,
      reasons: [LIFECYCLE_REASON.PRIORITY_CONTROL_PLANE_RECOVERY_PENDING],
    });

    const partition = new PartitionService({
      partitionId: `${SYSTEM_TABLE_NAME.SQL_TRANSACTIONS}-p1`,
      tableId: SYSTEM_TABLE_NAME.SQL_TRANSACTIONS,
      replicaId: 'replica-3',
      replicaIds: ['replica-3'],
      nodeId: 'node-3',
      dbPath: ':memory:',
      isJoiningExistingGroup: true,
      bootstrapReadinessState: readinessState,
      learnerPromotionDelayMs: 30000,
      learnerPromotionPriorityRecoveryDelayMs: 5000,
    });

    partition.scheduleLearnerPromotion(
      PARTITION_SERVICE_LEARNER_PROMOTION_SCHEDULE_REASON.INITIAL_DELAY,
    );

    t.equal(
      scheduledDelayMs[0],
      5000,
      'priority control-plane recovery should shorten initial promotion floor',
    );
    partition.learnerPromotionTimer = null;
  },
);

test(
  'PartitionService - priority recovery allows one bounded overflow learner promotion for critical partitions',
  async (t) => {
    const readinessState = createTrafficReadinessState();
    readinessState.transitionTo(LIFECYCLE_PHASE.CONTROL_READY, {
      ready: false,
      reasons: [LIFECYCLE_REASON.PRIORITY_CONTROL_PLANE_RECOVERY_PENDING],
    });

    const mockCache = {
      get: (tableName, key) => {
        if (tableName === TABLES.PARTITIONS && key === `${SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS}-p1`) {
          return {
            partition_id: `${SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS}-p1`,
            replica_count: 3,
          };
        }
        return null;
      },
      filter: (tableName, predicate) => {
        if (tableName === TABLES.PARTITIONS) {
          return [{
            partition_id: `${SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS}-p1`,
            replica_count: 3,
          }].filter(predicate);
        }
        if (tableName === TABLES.SERVICES) {
          const services = [
            {
              service_id: 'replica-1',
              partition_id: `${SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS}-p1`,
              service_type: SERVICE_TYPE.PARTITION,
              status: SERVICE_STATUS.ACTIVE,
              raft_role: 'leader',
            },
            {
              service_id: 'replica-2',
              partition_id: `${SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS}-p1`,
              service_type: SERVICE_TYPE.PARTITION,
              status: SERVICE_STATUS.ACTIVE,
              raft_role: 'follower',
            },
            {
              service_id: 'replica-3',
              partition_id: `${SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS}-p1`,
              service_type: SERVICE_TYPE.PARTITION,
              status: SERVICE_STATUS.ACTIVE,
              raft_role: 'follower',
            },
            {
              service_id: 'replica-4',
              partition_id: `${SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS}-p1`,
              service_type: SERVICE_TYPE.PARTITION,
              status: SERVICE_STATUS.ACTIVE,
              raft_role: 'follower',
            },
            {
              service_id: 'replica-5',
              partition_id: `${SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS}-p1`,
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
      partitionId: `${SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS}-p1`,
      tableId: SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS,
      replicaId: 'replica-5',
      replicaIds: ['replica-5'],
      nodeId: 'node-5',
      dbPath: ':memory:',
      bootstrapReadinessState: readinessState,
      systemTableCache: mockCache,
    });

    partition.role = RaftRole.LEARNER;
    partition.leaderId = 'replica-1';

    partition.checkLearnerPromotion();

    t.equal(
      partition.role,
      RaftRole.FOLLOWER,
      'priority recovery should allow one extra temporary voter to unblock critical control-plane convergence',
    );
    t.equal(
      partition.learnerPromotionTimer,
      null,
      'successful overflow promotion should not reschedule',
    );
  },
);

test(
  'PartitionService - priority recovery promotes replacement-owned learners even when voters are already target+2',
  async (t) => {
    const partitionId = `${SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS}-p1`;
    const readinessState = createTrafficReadinessState();
    readinessState.transitionTo(LIFECYCLE_PHASE.CONTROL_READY, {
      ready: false,
      reasons: [LIFECYCLE_REASON.PRIORITY_CONTROL_PLANE_RECOVERY_PENDING],
    });

    const mockCache = {
      get: (tableName, key) => {
        if (tableName === TABLES.PARTITIONS && key === partitionId) {
          return {
            partition_id: partitionId,
            replica_count: 3,
          };
        }
        return null;
      },
      filter: (tableName, predicate) => {
        if (tableName === TABLES.PARTITIONS) {
          return [{
            partition_id: partitionId,
            replica_count: 3,
          }].filter(predicate);
        }
        if (tableName === TABLES.SERVICES) {
          const services = [
            {
              service_id: 'replica-1',
              partition_id: partitionId,
              service_type: SERVICE_TYPE.PARTITION,
              status: ReplicaStatus.ACTIVE,
              raft_role: 'leader',
            },
            {
              service_id: 'replica-2',
              partition_id: partitionId,
              service_type: SERVICE_TYPE.PARTITION,
              status: ReplicaStatus.ACTIVE,
              raft_role: 'follower',
            },
            {
              service_id: 'replica-3',
              partition_id: partitionId,
              service_type: SERVICE_TYPE.PARTITION,
              status: ReplicaStatus.ACTIVE,
              raft_role: 'follower',
            },
            {
              service_id: 'replica-4',
              partition_id: partitionId,
              service_type: SERVICE_TYPE.PARTITION,
              status: ReplicaStatus.ACTIVE,
              raft_role: 'follower',
            },
            {
              service_id: 'replica-5',
              partition_id: partitionId,
              service_type: SERVICE_TYPE.PARTITION,
              status: ReplicaStatus.ACTIVE,
              raft_role: 'follower',
            },
            {
              service_id: 'replica-6',
              partition_id: partitionId,
              service_type: SERVICE_TYPE.PARTITION,
              status: ReplicaStatus.ACTIVE,
              raft_role: 'learner',
            },
          ];
          return services.filter(predicate);
        }
        if (tableName === TABLES.REPLICA_OPERATIONS) {
          const operations = [{
            operation_id: 'op-replace-6',
            type: OperationType.REPLACE,
            partition_id: partitionId,
            target_node_id: 'node-6',
            status: ReplicaStatus.SYNCING,
          }];
          return operations.filter(predicate);
        }
        return [];
      },
    };

    const partition = new PartitionService({
      partitionId,
      tableId: SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS,
      replicaId: 'replica-6',
      replicaIds: ['replica-6'],
      nodeId: 'node-6',
      dbPath: ':memory:',
      isJoiningExistingGroup: false,
      bootstrapReadinessState: readinessState,
      systemTableCache: mockCache,
    });

    partition.role = RaftRole.LEARNER;
    partition.leaderId = 'replica-1';

    partition.checkLearnerPromotion();

    t.equal(
      partition.role,
      RaftRole.FOLLOWER,
      'priority recovery should not deadlock when replacement-owned learners must promote above target to unblock removals',
    );
    t.equal(
      partition.learnerPromotionTimer,
      null,
      'successful bounded overflow promotion should not reschedule',
    );
  },
);

test(
  'PartitionService - priority recovery completion uses the planning snapshot to allow bounded overflow before lifecycle reasons catch up',
  async (t) => {
    const partitionId = `${SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS}-p1`;
    const mockCache = {
      get: (tableName, key) => {
        if (tableName === TABLES.PARTITIONS && key === partitionId) {
          return {
            partition_id: partitionId,
            replica_count: 3,
          };
        }
        return null;
      },
      filter: (tableName, predicate) => {
        if (tableName === TABLES.PARTITIONS) {
          return [{
            partition_id: partitionId,
            replica_count: 3,
          }].filter(predicate);
        }
        if (tableName === TABLES.SERVICES) {
          const services = [
            {
              service_id: 'replica-1',
              partition_id: partitionId,
              service_type: SERVICE_TYPE.PARTITION,
              status: ReplicaStatus.ACTIVE,
              raft_role: 'leader',
            },
            {
              service_id: 'replica-2',
              partition_id: partitionId,
              service_type: SERVICE_TYPE.PARTITION,
              status: ReplicaStatus.ACTIVE,
              raft_role: 'follower',
            },
            {
              service_id: 'replica-3',
              partition_id: partitionId,
              service_type: SERVICE_TYPE.PARTITION,
              status: ReplicaStatus.ACTIVE,
              raft_role: 'follower',
            },
            {
              service_id: 'replica-4',
              partition_id: partitionId,
              service_type: SERVICE_TYPE.PARTITION,
              status: ReplicaStatus.ACTIVE,
              raft_role: 'follower',
            },
            {
              service_id: 'replica-5',
              partition_id: partitionId,
              service_type: SERVICE_TYPE.PARTITION,
              status: ReplicaStatus.ACTIVE,
              raft_role: 'learner',
              node_id: 'node-5',
            },
          ];
          return services.filter(predicate);
        }
        if (tableName === TABLES.REPLICA_OPERATIONS) {
          return [];
        }
        return [];
      },
    };

    const partition = new PartitionService({
      partitionId,
      tableId: SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS,
      replicaId: 'replica-5',
      replicaIds: ['replica-5'],
      nodeId: 'node-5',
      dbPath: ':memory:',
      systemTableCache: mockCache,
    });

    partition.rebalanceCoordinator = {
      controlPlaneReadinessService: {
        getPriorityRecoveryPlanningAnswerSync() {
          return {
            publicationStatus: 'PENDING',
            priorityPartitionSummary: {
              blockedPartitions: [{
                partitionId,
                requiredDistinctNodeCount: 3,
                readyDistinctNodeCount: 2,
                spreadGap: 1,
              }],
              missingPartitionIds: [partitionId],
              requiredDistinctNodeCount: 3,
            },
            membershipLifecycleSummary: {
              projectedServingNodeIds: [
                'node-1',
                'node-2',
                'node-3',
                'node-4',
                'node-5',
              ],
              locallyEligibleNodeIds: [
                'node-1',
                'node-2',
                'node-3',
                'node-4',
                'node-5',
              ],
            },
          };
        },
        getNodeReadinessSync(nodeId) {
          return {
            nodeId,
            dimensions: {
              [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: true,
            },
            reasonCodes: [],
          };
        },
      },
    };
    partition.role = RaftRole.LEARNER;
    partition.leaderId = 'replica-1';

    partition.checkLearnerPromotion();

    t.equal(
      partition.role,
      RaftRole.FOLLOWER,
      'the planning snapshot should allow the bounded overflow promotion before lifecycle readiness reasons have fully converged',
    );
    t.equal(
      partition.learnerPromotionTimer,
      null,
      'planning-snapshot-driven overflow promotion should complete without scheduling another retry',
    );
  },
);

test(
  'PartitionService - priority recovery allows bounded multi-learner overflow promotion for critical replacements',
  async (t) => {
    const partitionId = `${SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS}-p1`;
    const readinessState = createTrafficReadinessState();
    readinessState.transitionTo(LIFECYCLE_PHASE.CONTROL_READY, {
      ready: false,
      reasons: [LIFECYCLE_REASON.PRIORITY_CONTROL_PLANE_RECOVERY_PENDING],
    });

    const mockCache = {
      get: (tableName, key) => {
        if (tableName === TABLES.PARTITIONS && key === partitionId) {
          return {
            partition_id: partitionId,
            replica_count: 3,
          };
        }
        return null;
      },
      filter: (tableName, predicate) => {
        if (tableName === TABLES.PARTITIONS) {
          return [{
            partition_id: partitionId,
            replica_count: 3,
          }].filter(predicate);
        }
        if (tableName === TABLES.SERVICES) {
          const services = [
            {
              service_id: 'replica-1',
              partition_id: partitionId,
              service_type: SERVICE_TYPE.PARTITION,
              status: ReplicaStatus.ACTIVE,
              raft_role: 'leader',
            },
            {
              service_id: 'replica-2',
              partition_id: partitionId,
              service_type: SERVICE_TYPE.PARTITION,
              status: ReplicaStatus.ACTIVE,
              raft_role: 'follower',
            },
            {
              service_id: 'replica-3',
              partition_id: partitionId,
              service_type: SERVICE_TYPE.PARTITION,
              status: ReplicaStatus.ACTIVE,
              raft_role: 'follower',
            },
            {
              service_id: 'replica-4',
              partition_id: partitionId,
              service_type: SERVICE_TYPE.PARTITION,
              status: ReplicaStatus.ACTIVE,
              raft_role: 'learner',
            },
            {
              service_id: 'replica-5',
              partition_id: partitionId,
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
              operation_id: 'op-replace-4',
              type: OperationType.REPLACE,
              partition_id: partitionId,
              replica_id: 'replica-4',
              target_node_id: 'node-4',
              status: ReplicaStatus.SYNCING,
            },
            {
              operation_id: 'op-replace-5',
              type: OperationType.REPLACE,
              partition_id: partitionId,
              replica_id: 'replica-5',
              target_node_id: 'node-5',
              status: ReplicaStatus.SYNCING,
            },
          ];
          return operations.filter(predicate);
        }
        return [];
      },
    };

    const partition = new PartitionService({
      partitionId,
      tableId: SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS,
      replicaId: 'replica-4',
      replicaIds: ['replica-4'],
      nodeId: 'node-4',
      dbPath: ':memory:',
      bootstrapReadinessState: readinessState,
      systemTableCache: mockCache,
    });

    partition.role = RaftRole.LEARNER;
    partition.leaderId = 'replica-1';

    partition.checkLearnerPromotion();

    t.equal(
      partition.role,
      RaftRole.FOLLOWER,
      'critical recovery should allow the first learner promotion when all replacement learners together fit inside the bounded overflow budget',
    );
    t.equal(
      partition.learnerPromotionTimer,
      null,
      'successful bounded overflow promotion should not reschedule',
    );
  },
);

test(
  'PartitionService - learner promotion uses startup leader hint for stable joins',
  async (t) => {
    const mockCache = {
      get: () => null,
      filter: (tableName, predicate) => {
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
      leaderAddress: 'node-1/partition/replica-1',
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
      'startup leader hint should seed leader identity for learner promotion',
    );
    t.equal(
      partition.role,
      RaftRole.FOLLOWER,
      'learner should promote once leader identity is known and voter count stays odd',
    );
    t.equal(
      partition.isJoiningExistingGroup,
      false,
      'Promotion should clear join-mode gating before elections restart',
    );
    t.equal(electionStarted, true, 'promotion should start elections as a voter');

    if (partition.learnerPromotionTimer) {
      clearTimeout(partition.learnerPromotionTimer);
      partition.learnerPromotionTimer = null;
    }
  },
);

test(
  'PartitionService - joining learner ignores candidate and follower demotion events before promotion',
  async (t) => {
    const partition = new PartitionService({
      partitionId: 'joiner-partition',
      tableId: 'joiner-table',
      replicaId: 'replica-2',
      replicaIds: ['replica-1', 'replica-2'],
      peerAddresses: ['node-1/partition/replica-1'],
      nodeId: 'node-2',
      transport: createLoopbackTransport(),
      dbPath: ':memory:',
      isJoiningExistingGroup: true,
    });

    try {
      await partition.initialize();
      const initialPendingRoleUpdate = partition.pendingRoleUpdate;

      t.equal(
        partition.role,
        RaftRole.LEARNER,
        'joining replica should start as learner',
      );

      partition.raft.emit('candidate');
      partition.raft.emit('follower');

      t.equal(
        partition.role,
        RaftRole.LEARNER,
        'joining learner should ignore raw demotion events before promotion',
      );
      t.equal(
        partition.pendingRoleUpdate,
        initialPendingRoleUpdate,
        'joining learner should not queue a persisted demotion before promotion',
      );
      t.equal(
        partition.electionStarted,
        false,
        'joining learner should keep elections disabled before promotion',
      );
    } finally {
      await partition.shutdown();
    }
  },
);
