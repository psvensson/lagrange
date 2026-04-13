/**
 * Tests for Bootstrap Sequence.
 * Verifies the ordering: server → self-connect → services
 * Requirements: 8.1, 8.2, 8.3, 8.4
 */
// @ts-nocheck


import t, {test} from '../../src/test-helpers/tap.js';
import {BootstrapService} from '../../src/bootstrap/bootstrap-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {NodeService} from '../../src/node/node-service.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {WORK_CLASS} from '../../src/runtime/work-class-scheduler.js';
import {createPortAllocator} from '../../src/test-helpers/port-allocator.js';
import {
  COLUMN,
  META_SERVICE_ID,
  SERVICE_STATUS,
  SERVICE_TYPE,
  TABLES,
} from '../../src/constants/index.js';

const ports = createPortAllocator(import.meta.url);

t.jobs = 1;

function createLocalServiceEndpointCache(nodeId) {
  const endpointRows = [{
    [COLUMN.ENDPOINT_ID]: `postgres-wire-endpoint-${nodeId}`,
    [COLUMN.SERVICE_ID]: META_SERVICE_ID.POSTGRES_WIRE,
    [COLUMN.NODE_ID]: nodeId,
    [COLUMN.PROTOCOL]: 'tcp',
    [COLUMN.ADDRESS]: nodeId,
    [COLUMN.PORT]: 5432,
    [COLUMN.METADATA]: '{}',
  }];

  return {
    filter(tableName, predicate) {
      if (tableName !== TABLES.SERVICE_ENDPOINTS) {
        return [];
      }
      return endpointRows.filter(predicate);
    },
    getAll(tableName) {
      if (tableName !== TABLES.SERVICE_ENDPOINTS) {
        return [];
      }
      return [...endpointRows];
    },
  };
}

// Initialize configuration and logging for tests
function initializeTestEnvironment() {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize({
      node: {id: 'test-bootstrap-node'},
      logging: {level: 'error'},
    });
  }

  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: 'error'});
  }

  // Reset NodeService for clean test state
  NodeService.resetInstance();
}

// Get a random available port
function getRandomPort() {
  return ports.getPort();
}

test('Bootstrap sequence - server starts before services', async (t) => {
  initializeTestEnvironment();

  const wsPort = getRandomPort();
  const nodeId = `test-node-${Date.now()}`;

  const bootstrap = new BootstrapService({
    nodeId,
    nodeAddress: `ws://localhost:${wsPort}`,
    wsPort,
    config: {
      leadershipWaitTimeoutMs: 5000,
      leadershipWaitInitialDelayMs: 10,
      partitionDbPath: ':memory:',
    },
  });

  // Track phase order
  const phaseOrder = [];
  bootstrap.on('phaseStart', ({phase}) => {
    phaseOrder.push(phase);
  });

  try {
    const result = await bootstrap.bootstrap();

    t.equal(result.success, true, 'bootstrap should succeed');
    t.ok(result.messageRouter, 'should have messageRouter');

    // Verify phase order
    t.equal(phaseOrder[0], 'infrastructure', 'infrastructure should be first phase');
    t.ok(phaseOrder.indexOf('infrastructure') < phaseOrder.indexOf('message_groups'),
      'infrastructure should come before message_groups');
    t.ok(phaseOrder.indexOf('infrastructure') < phaseOrder.indexOf('partitions'),
      'infrastructure should come before partitions');

    // Verify server is running
    t.ok(result.messageRouter.server, 'WebSocket server should be running');

    // Verify self-connection is established
    t.ok(result.messageRouter.hasSelfConnection(),
      'self-connection should be established');
  } finally {
    await bootstrap.shutdown();
  }
});

test('BootstrapService - executePhase routes work through class A scheduler', async (t) => {
  initializeTestEnvironment();

  const scheduledClasses = [];
  const scheduler = {
    enqueue: async (workClass, task) => {
      scheduledClasses.push(workClass);
      return task();
    },
  };

  const bootstrap = new BootstrapService({
    nodeId: 'bootstrap-scheduler-node',
    nodeAddress: 'ws://localhost:12000',
    wsPort: 12000,
    workClassScheduler: scheduler,
  });

  await bootstrap.executePhase('infrastructure', async () => {});

  t.same(scheduledClasses, [WORK_CLASS.A],
    'bootstrap phase execution should run through class A scheduler');
  await bootstrap.shutdown();
});

test('BootstrapService - activates message-group rows after seed registration',
  async (t) => {
    initializeTestEnvironment();

    const order = [];
    const bootstrap = new BootstrapService({
      nodeId: 'bootstrap-activate-node',
      nodeAddress: 'ws://localhost:12001',
      wsPort: 12001,
    });

    bootstrap.seedInfrastructurePhase.phaseInfrastructure =
      async () => {
        order.push('infrastructure');
      };
    bootstrap.seedMessageGroupsPhase.phaseMessageGroups =
      async () => {
        order.push('message-groups');
      };
    bootstrap.seedPartitionsPhase.phasePartitions =
      async () => {
        order.push('partitions');
      };
    bootstrap.seedRegistrationPhase.phaseRegistration =
      async () => {
        order.push('registration');
      };
    bootstrap.seedCacheHydrationPhase.phaseCacheHydration =
      async () => {
        order.push('cache-hydration');
      };
    bootstrap.initializeReplicaHandler = () => {
      order.push('replica-handler');
    };
    bootstrap.initializeMessageGroupServiceHandler = () => {
      order.push('message-group-handler');
      bootstrap.messageGroupServiceHandler = {};
    };
    bootstrap.initializeControlPlaneService = async () => {
      order.push('control-plane');
    };
    bootstrap.registerSeedNodeWithControlPlane = async () => {
      order.push('seed-registration');
      bootstrap.systemTableCache = createLocalServiceEndpointCache(
        bootstrap.nodeId,
      );
    };
    bootstrap.activateMessageGroupServiceRows = async () => {
      order.push('activate-message-group-rows');
    };
    bootstrap.initializeRuntimeServiceHandler = () => {
      order.push('runtime-handler');
    };
    bootstrap.seedCacheHydrationPhase
      .startLatencyTopologyLifecycle = () => {
        order.push('latency-topology');
      };
    bootstrap.activateControlPlaneBackgroundWriters = () => {
      order.push('background-writers');
    };
    bootstrap.logger = {
      info() {},
      debug() {},
      warn() {},
      error() {},
    };

    const result = await bootstrap.bootstrap();

    t.equal(result.success, true, 'bootstrap should succeed');
    t.equal(bootstrap.hasPublishedLocalServiceEndpoints(), true,
      'bootstrap should observe local endpoint publication before activation');
    t.ok(
      order.indexOf('message-group-handler') <
        order.indexOf('seed-registration'),
      'handler registration should complete before seed control-plane registration',
    );
    t.ok(
      order.indexOf('seed-registration') <
        order.indexOf('activate-message-group-rows'),
      'message-group rows should activate after seed control-plane registration',
    );
  });

test('BootstrapService - notifies local admin runtime before seed self-publication',
  async (t) => {
    initializeTestEnvironment();

    const order = [];
    const bootstrap = new BootstrapService({
      nodeId: 'bootstrap-local-admin-node',
      nodeAddress: 'ws://localhost:12002',
      wsPort: 12002,
      onLocalAdminRuntimeReady: async ({owner, systemTableCache, messageRouter}) => {
        order.push('local-admin-runtime');
        t.equal(owner, bootstrap,
          'callback should receive the active bootstrap owner');
        t.same(systemTableCache, bootstrap.systemTableCache,
          'callback should receive the current system cache');
        t.same(messageRouter, bootstrap.messageRouter,
          'callback should receive the current message router');
      },
    });

    bootstrap.systemTableCache = {cache: true};
    bootstrap.messageRouter = {router: true};
    bootstrap.seedInfrastructurePhase.phaseInfrastructure = async () => {};
    bootstrap.seedMessageGroupsPhase.phaseMessageGroups = async () => {};
    bootstrap.seedPartitionsPhase.phasePartitions = async () => {};
    bootstrap.seedRegistrationPhase.phaseRegistration = async () => {};
    bootstrap.seedCacheHydrationPhase.phaseCacheHydration = async () => {};
    bootstrap.initializeReplicaHandler = () => {};
    bootstrap.initializeMessageGroupServiceHandler = () => {
      bootstrap.messageGroupServiceHandler = {};
    };
    bootstrap.initializeControlPlaneService = async () => {
      order.push('control-plane');
    };
    bootstrap.registerSeedNodeWithControlPlane = async () => {
      order.push('seed-registration');
      bootstrap.systemTableCache = createLocalServiceEndpointCache(
        bootstrap.nodeId,
      );
    };
    bootstrap.activateMessageGroupServiceRows = async () => {};
    bootstrap.initializeRuntimeServiceHandler = () => {};
    bootstrap.seedCacheHydrationPhase.startLatencyTopologyLifecycle = () => {};
    bootstrap.activateControlPlaneBackgroundWriters = () => {};
    bootstrap.logger = {
      info() {},
      debug() {},
      warn() {},
      error() {},
    };

    const result = await bootstrap.bootstrap();

    t.equal(result.success, true, 'bootstrap should succeed');
    t.ok(
      order.indexOf('control-plane') < order.indexOf('local-admin-runtime'),
      'local admin callback should wait for control-plane wiring',
    );
    t.ok(
      order.indexOf('local-admin-runtime') < order.indexOf('seed-registration'),
      'local admin callback should run before seed self-publication blocks startup',
    );
  });

test('Bootstrap sequence - self-connection established before services', async (t) => {
  initializeTestEnvironment();

  const wsPort = getRandomPort();
  const nodeId = `test-node-${Date.now()}`;

  const bootstrap = new BootstrapService({
    nodeId,
    nodeAddress: `ws://localhost:${wsPort}`,
    wsPort,
    config: {
      leadershipWaitTimeoutMs: 5000,
      leadershipWaitInitialDelayMs: 10,
      partitionDbPath: ':memory:',
    },
  });

  let selfConnectionBeforeServices = false;

  // Check self-connection status when message_groups phase starts
  bootstrap.on('phaseStart', ({phase}) => {
    if (phase === 'message_groups') {
      // At this point, infrastructure phase is complete
      // Self-connection should already be established
      selfConnectionBeforeServices = bootstrap.messageRouter &&
        bootstrap.messageRouter.hasSelfConnection();
    }
  });

  try {
    const result = await bootstrap.bootstrap();

    t.equal(result.success, true, 'bootstrap should succeed');
    t.ok(selfConnectionBeforeServices,
      'self-connection should be established before services are created');
  } finally {
    await bootstrap.shutdown();
  }
});

test('Bootstrap sequence - services created after self-connection', async (t) => {
  initializeTestEnvironment();

  const wsPort = getRandomPort();
  const nodeId = `test-node-${Date.now()}`;

  const bootstrap = new BootstrapService({
    nodeId,
    nodeAddress: `ws://localhost:${wsPort}`,
    wsPort,
    config: {
      leadershipWaitTimeoutMs: 5000,
      leadershipWaitInitialDelayMs: 10,
      partitionDbPath: ':memory:',
    },
  });

  try {
    const result = await bootstrap.bootstrap();

    t.equal(result.success, true, 'bootstrap should succeed');

    // Verify services were created
    t.ok(result.messageGroupServices.size > 0, 'message group services should be created');
    t.ok(result.partitionServices.size > 0, 'partition services should be created');

    // Verify self-connection is still active
    t.ok(result.messageRouter.hasSelfConnection(),
      'self-connection should still be active after services created');
  } finally {
    await bootstrap.shutdown();
  }
});

test('Bootstrap sequence - without wsPort fails (no server)', async (t) => {
  initializeTestEnvironment();

  const nodeId = `test-node-${Date.now()}`;

  const bootstrap = new BootstrapService({
    nodeId,
    nodeAddress: 'ws://localhost:8080',
    // No wsPort - server won't start, leadership can't be established
    // System requires WebSocket-based communication for all messages (even local)
    // per system guidelines: "All nodes will have at least one replica of a message
    // group (liferaft) which will always be used for any communication (even local)"
    config: {
      leadershipWaitTimeoutMs: 100, // Short timeout since it will fail
      leadershipWaitInitialDelayMs: 10,
      partitionDbPath: ':memory:',
    },
  });

  try {
    const result = await bootstrap.bootstrap();

    // Without wsPort, bootstrap should fail because Raft elections require
    // WebSocket communication between replicas, even on the same node.
    t.equal(result.success, false, 'bootstrap should fail without wsPort');
    t.ok(result.error, 'should have error message');
    t.match(result.error, /leadership/i, 'error should mention leadership timeout');
  } finally {
    await bootstrap.shutdown();
  }
});

test('Bootstrap sequence - partition leadership wait fails when no leaders', async (t) => {
  initializeTestEnvironment();

  const bootstrap = new BootstrapService({
    nodeId: 'test-node',
    config: {
      leadershipWaitTimeoutMs: 5,
      leadershipWaitInitialDelayMs: 1,
      leadershipWaitBackoffMultiplier: 1,
    },
  });

  bootstrap.partitionServices = new Map([
    ['services-p1-r1', {partitionId: 'services-p1', isLeader: false}],
    ['nodes-p1-r1', {partitionId: 'nodes-p1', isLeader: false}],
  ]);

  const originalNow = Date.now;
  let now = 1000;
  Date.now = () => now;
  bootstrap.sleep = async () => {
    now += 10;
  };

  try {
    await bootstrap.seedPartitionsPhase
      .waitForPartitionLeadership();
    t.fail('should throw when partition leadership is missing');
  } catch (error) {
    t.match(error.message, /Partition leaders not established within 5ms/,
      'should report leadership timeout');
    t.match(error.message, /services-p1/, 'should list services partition');
    t.match(error.message, /nodes-p1/, 'should list nodes partition');
  } finally {
    Date.now = originalNow;
  }
});

test('Bootstrap sequence - partition leadership wait honors configured timeout beyond legacy cap', async (t) => {
  initializeTestEnvironment();

  const bootstrap = new BootstrapService({
    nodeId: 'test-node',
    config: {
      leadershipWaitTimeoutMs: 20,
      leadershipWaitInitialDelayMs: 1,
      leadershipWaitBackoffMultiplier: 1,
    },
  });

  const partition = {partitionId: 'sql_transactions-p1', isLeader: false};
  bootstrap.partitionServices = new Map([
    ['sql_transactions-p1-r1', partition],
  ]);

  const originalNow = Date.now;
  let now = 0;
  Date.now = () => now;
  bootstrap.sleep = async () => {
    now += 3;
    if (now >= 6) {
      partition.isLeader = true;
    }
  };

  try {
    await bootstrap.seedPartitionsPhase.waitForPartitionLeadership();
    t.pass('configured leadership wait budget should allow later leader election');
  } finally {
    Date.now = originalNow;
  }
});

test('Bootstrap sequence - partition leadership wait allows priority control-plane recovery bypass', async (t) => {
  initializeTestEnvironment();

  const bootstrap = new BootstrapService({
    nodeId: 'test-node',
    readinessState: {
      evaluate() {
        return {
          ready: false,
          phase: 'CONTROL_READY',
          reasons: ['PRIORITY_CONTROL_PLANE_RECOVERY_PENDING'],
        };
      },
    },
    config: {
      leadershipWaitTimeoutMs: 5,
      leadershipWaitInitialDelayMs: 1,
      leadershipWaitBackoffMultiplier: 1,
    },
  });

  bootstrap.partitionServices = new Map([
    [
      'control_plane_publications-p1-r1',
      {
        partitionId: 'control_plane_publications-p1',
        isLeader: false,
        initialized: true,
      },
    ],
  ]);

  await bootstrap.seedPartitionsPhase.waitForPartitionLeadership();
  t.pass('priority control-plane recovery should not require a local leader before bootstrap direct writes');
});

test('Bootstrap sequence - partition leadership wait allows init-phase priority control-plane bootstrap bypass', async (t) => {
  initializeTestEnvironment();

  const bootstrap = new BootstrapService({
    nodeId: 'test-node',
    readinessState: {
      evaluate() {
        return {
          ready: false,
          phase: 'INIT',
          reasons: [
            'BOOTSTRAP_PHASE_INCOMPLETE',
            'SQL_ENGINE_UNAVAILABLE',
            'LEADER_METADATA_INCOMPLETE',
            'PRIORITY_CONTROL_PLANE_RECOVERY_PENDING',
          ],
        };
      },
    },
    config: {
      leadershipWaitTimeoutMs: 5,
      leadershipWaitInitialDelayMs: 1,
      leadershipWaitBackoffMultiplier: 1,
    },
  });

  bootstrap.partitionServices = new Map([
    [
      'sql_transactions-p1-r1',
      {
        partitionId: 'sql_transactions-p1',
        isLeader: false,
        initialized: true,
      },
    ],
  ]);

  await bootstrap.seedPartitionsPhase.waitForPartitionLeadership();
  t.pass('init-phase priority control-plane bootstrap readiness should not block seed direct-write startup on a missing local sql_transactions leader');
});

test('Bootstrap sequence - partition leadership wait allows direct bootstrap priority partition bypass during registration', async (t) => {
  initializeTestEnvironment();

  const bootstrap = new BootstrapService({
    nodeId: 'test-node',
    readinessState: {
      evaluate() {
        return {
          ready: false,
          phase: 'INIT',
          reasons: ['LEADER_METADATA_INCOMPLETE'],
        };
      },
    },
    config: {
      leadershipWaitTimeoutMs: 5,
      leadershipWaitInitialDelayMs: 1,
      leadershipWaitBackoffMultiplier: 1,
    },
  });
  bootstrap.phase = 'registration';

  bootstrap.partitionServices = new Map([
    [
      'sql_transactions-p1-r1',
      {
        partitionId: 'sql_transactions-p1',
        isLeader: false,
        initialized: true,
      },
    ],
  ]);

  await bootstrap.seedPartitionsPhase.waitForPartitionLeadership();
  t.pass('registration should not block bootstrap-direct startup on a local priority control-plane partition before the SQL engine exists');
});

test('Bootstrap sequence - partition leadership wait memoizes satisfied bootstrap partition set', async (t) => {
  initializeTestEnvironment();

  let allowBootstrapBypass = true;
  const bootstrap = new BootstrapService({
    nodeId: 'test-node',
    readinessState: {
      evaluate() {
        return allowBootstrapBypass ? {
          ready: false,
          phase: 'INIT',
          reasons: [
            'BOOTSTRAP_PHASE_INCOMPLETE',
            'SQL_ENGINE_UNAVAILABLE',
            'LEADER_METADATA_INCOMPLETE',
            'PRIORITY_CONTROL_PLANE_RECOVERY_PENDING',
          ],
        } : {
          ready: false,
          phase: 'INIT',
          reasons: ['LEADER_METADATA_INCOMPLETE'],
        };
      },
    },
    config: {
      leadershipWaitTimeoutMs: 5,
      leadershipWaitInitialDelayMs: 1,
      leadershipWaitBackoffMultiplier: 1,
    },
  });

  bootstrap.partitionServices = new Map([
    [
      'sql_transactions-p1-r1',
      {
        partitionId: 'sql_transactions-p1',
        isLeader: false,
        initialized: true,
      },
    ],
  ]);

  await bootstrap.seedPartitionsPhase.waitForPartitionLeadership();
  allowBootstrapBypass = false;
  await bootstrap.seedPartitionsPhase.waitForPartitionLeadership();

  t.pass('registration should not re-block on the same partition set after partitions phase already satisfied startup leadership');
});

test('Bootstrap sequence - partition leadership wait allows canonical remote leader bypass', async (t) => {
  initializeTestEnvironment();

  const bootstrap = new BootstrapService({
    nodeId: 'test-node',
    config: {
      leadershipWaitTimeoutMs: 5,
      leadershipWaitInitialDelayMs: 1,
      leadershipWaitBackoffMultiplier: 1,
    },
  });

  bootstrap.partitionServices = new Map([
    [
      'sql_transactions-p1-r2',
      {
        partitionId: 'sql_transactions-p1',
        isLeader: false,
        initialized: true,
      },
    ],
  ]);

  bootstrap.systemTableCache = {
    get(tableName, key) {
      if (tableName === TABLES.PARTITIONS && key === 'sql_transactions-p1') {
        return {
          [COLUMN.PARTITION_ID]: 'sql_transactions-p1',
          [COLUMN.LEADER_NODE_ID]: 'remote-node',
        };
      }
      return null;
    },
    getAll(tableName) {
      if (tableName === TABLES.PARTITIONS) {
        return [{
          [COLUMN.PARTITION_ID]: 'sql_transactions-p1',
          [COLUMN.LEADER_NODE_ID]: 'remote-node',
        }];
      }
      if (tableName === TABLES.SERVICES) {
        return [{
          [COLUMN.SERVICE_ID]: 'sql_transactions-p1-r1',
          [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
          [COLUMN.PARTITION_ID]: 'sql_transactions-p1',
          [COLUMN.NODE_ID]: 'remote-node',
          [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
          [COLUMN.ADDRESS]: 'remote-node/message-group/mg-1-r1',
          [COLUMN.RAFT_ROLE]: RAFT_ROLE.LEADER,
        }];
      }
      return [];
    },
    filter(tableName, predicate) {
      return this.getAll(tableName).filter(predicate);
    },
  };

  await bootstrap.seedPartitionsPhase.waitForPartitionLeadership();
  t.pass('initialized follower replicas should not require local leadership when canonical leader metadata already exists');
});
