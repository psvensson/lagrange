/**
 * Tests for Node Joining Service.
 * Requirements: 7.8, 7.10, 7.11, 7.14
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  NodeJoiningService,
  JoiningPhase,
} from '../../src/bootstrap/node-joining-service.js';
import {BootstrapAPI} from '../../src/bootstrap/bootstrap-api.js';
import {
  MESSAGE_GROUP_ASSIGNMENT_STRATEGY as AssignmentStrategy,
} from '../../src/bootstrap/message-group-assignment.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {NodeService} from '../../src/node/node-service.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {CACHE_HYDRATION_TABLES} from '../../src/cache/cache-constants.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {ReplicaHandlerSetup} from '../../src/bootstrap/shared/replica-handler-setup.js';
import {
  PARTITION_SERVICE_ACTIVATION_ERROR,
} from '../../src/bootstrap/shared/partition-service-activation.js';
import {
  ControlPlaneKernelIngress,
} from '../../src/control-plane/control-plane-kernel-ingress.js';
import {
  JOIN_CHECKPOINT,
  JoinSessionStore,
} from '../../src/bootstrap/join-session-store.js';
import {
  JOINING_ERROR_MSG,
  JOINING_LOG_MSG,
} from '../../src/bootstrap/node-joining-constants.js';
import {
  MEMBERSHIP_LIFECYCLE_INTENT,
} from '../../src/control-plane/membership-lifecycle-controller.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  JOIN_PLAN_SEGMENT,
} from '../../src/bootstrap/bootstrap-constants.js';
import {STARTUP_JOIN_MODE} from '../../src/bootstrap/rejoin-hints-constants.js';
import {WORK_CLASS} from '../../src/runtime/work-class-scheduler.js';
import {ENTRYPOINT_DEFAULT} from '../../src/constants/entrypoint.js';
import {
  CDC_OPERATION,
  COLUMN,
  ENDPOINT_STATUS,
  SERVICE_TYPE,
  SERVICE_STATUS,
  STATE,
  TABLES,
  TRANSPORT_TYPE,
} from '../../src/constants/index.js';
import {CDC_EVENT} from '../../src/cdc/cdc-constants.js';
import {META_SERVICE_ID} from '../../src/constants/wasm-meta.js';
import {URL} from 'url';
import {EventEmitter} from 'events';

const DEFAULT_SEED_WS_ADDRESS =
  `ws://localhost:${8080 + ENTRYPOINT_DEFAULT.WS_PORT_OFFSET}`;

// Initialize configuration and logging for tests
function initializeTestEnvironment() {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize({
      node: {id: 'test-node'},
      logging: {level: 'error'},
    });
  }

  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: 'error'});
  }

  NodeService.resetInstance();
}

test('NodeJoiningService - initialization', async (t) => {
  initializeTestEnvironment();

  const service = new NodeJoiningService({
    nodeId: 'test-node-1',
    nodeAddress: 'ws://localhost:9090',
    seedNodeAddress: 'http://localhost:8080',
  });

  t.equal(service.getPhase(), JoiningPhase.NOT_STARTED);
  t.equal(service.nodeId, 'test-node-1');
  t.equal(service.nodeAddress, 'ws://localhost:9090');
  t.equal(service.seedNodeAddress, 'http://localhost:8080');
});

test('NodeJoiningService - runtime owner exposes control-plane readiness service',
  async (t) => {
    initializeTestEnvironment();

    const service = new NodeJoiningService({
      nodeId: 'test-node-runtime-owner-readiness',
      nodeAddress: 'ws://localhost:9099',
      seedNodeAddress: 'http://localhost:8080',
    });

    t.equal(
      service.runtimeDependencyOwner.controlPlaneReadinessService,
      null,
      'runtime owner should report no readiness service before coordinator wiring',
    );

    const controlPlaneReadinessService = {
      getMembershipPublicationDiagnosticsSync() {
        return null;
      },
    };
    service.rebalanceCoordinator = {
      controlPlaneReadinessService,
    };

    t.equal(
      service.runtimeDependencyOwner.controlPlaneReadinessService,
      controlPlaneReadinessService,
      'runtime owner should expose the coordinator readiness service for bootstrap probes',
    );
  });

test('NodeJoiningService - initializeJoinInfrastructure opens external transport admission after handlers are ready',
  async (t) => {
    initializeTestEnvironment();

    const calls = [];
    const service = new NodeJoiningService({
      nodeId: 'joining-node-open-admission',
      nodeAddress: 'ws://localhost:9090',
      seedNodeAddress: 'http://localhost:8080',
    });

    service.messageRouter = {
      setExternalAdmissionEnabled(value) {
        calls.push(['setExternalAdmissionEnabled', value]);
      },
    };
    service.getLeaderMessageGroupService = () => ({sendMessage: async () => ({})});
    service.createCdcIntegrationService = () => {
      calls.push(['createCdcIntegrationService']);
      service.cdcIntegrationService = {};
    };
    service.ensureLatencyTopologyOwners = () => {
      calls.push(['ensureLatencyTopologyOwners']);
    };
    service.initializeReplicaHandler = () => {
      calls.push(['initializeReplicaHandler']);
    };
    service.initializeMessageGroupServiceHandler = () => {
      calls.push(['initializeMessageGroupServiceHandler']);
    };
    service.initializeControlPlaneService = async () => {
      calls.push(['initializeControlPlaneService']);
    };
    service.initializeRuntimeServiceHandler = () => {
      calls.push(['initializeRuntimeServiceHandler']);
    };

    await service.initializeJoinInfrastructure();

    t.same(
      calls,
      [
        ['createCdcIntegrationService'],
        ['ensureLatencyTopologyOwners'],
        ['initializeReplicaHandler'],
        ['initializeMessageGroupServiceHandler'],
        ['initializeControlPlaneService'],
        ['initializeRuntimeServiceHandler'],
        ['setExternalAdmissionEnabled', true],
      ],
      'join infrastructure should only open external admission after runtime handlers are initialized',
    );
  });

test('NodeJoiningService - runJoinInfrastructurePhases notifies local admin runtime before JOINING',
  async (t) => {
    initializeTestEnvironment();

    const cache = {cache: true};
    const originalGetNodeService = NodeService.getInstance;
    const calls = [];
    try {
      NodeService.getInstance = () => ({
        getSystemTableCache() {
          return cache;
        },
      });

      const service = new NodeJoiningService({
        nodeId: 'joining-node-local-admin',
        nodeAddress: 'ws://localhost:9090',
        seedNodeAddress: 'http://localhost:8080',
        onLocalAdminRuntimeReady: async ({owner, systemTableCache}) => {
          calls.push(['onLocalAdminRuntimeReady']);
          t.equal(owner, service,
            'callback should receive the active join owner');
          t.same(systemTableCache, cache,
            'callback should receive the current system cache');
        },
      });

      service.initializeJoinInfrastructure = async () => {
        calls.push(['initializeJoinInfrastructure']);
      };
      service._applyDeferredJoinSubPhases = () => {
        calls.push(['applyDeferredJoinSubPhases']);
      };
      const originalTransition = service.lifecycleStateMachine.transition
        .bind(service.lifecycleStateMachine);
      service.lifecycleStateMachine.transition = (state) => {
        calls.push(['transition', state]);
        return originalTransition(state);
      };

      await service.runJoinInfrastructurePhases({
        run: async () => {},
      }, {
        segments: {
          [JOIN_PLAN_SEGMENT.INFRASTRUCTURE]: ['phase-a', 'phase-b'],
        },
      });

      t.same(
        calls,
        [
          ['transition', 'discovering'],
          ['initializeJoinInfrastructure'],
          ['onLocalAdminRuntimeReady'],
          ['transition', 'joining'],
          ['applyDeferredJoinSubPhases'],
        ],
        'join runtime should expose local admin surfaces before transitioning into JOINING',
      );
    } finally {
      NodeService.getInstance = originalGetNodeService;
    }
  });

test('NodeJoiningService - getStatus', async (t) => {
  initializeTestEnvironment();

  const service = new NodeJoiningService({
    nodeId: 'test-node-1',
    nodeAddress: 'ws://localhost:9090',
    seedNodeAddress: 'http://localhost:8080',
  });

  const status = service.getStatus();

  t.equal(status.nodeId, 'test-node-1');
  t.equal(status.phase, JoiningPhase.NOT_STARTED);
  t.equal(status.messageGroupCount, 0);
  t.equal(status.lastError, null);
});

test('NodeJoiningService - classifies transient control-plane publication failures',
  async (t) => {
    initializeTestEnvironment();

    const service = new NodeJoiningService({
      nodeId: 'joining-node-classifier',
      nodeAddress: 'ws://localhost:9090',
      seedNodeAddress: 'http://localhost:8080',
    });

    t.equal(
      service.shouldRetryControlPlaneNodeStateUpdate(
        new Error('Connection to node seed-node-1 closed'),
      ),
      true,
      'closed target connections should defer connected publication',
    );
    t.equal(
      service.shouldRetryControlPlaneNodeStateUpdate(
        new Error(JOINING_ERROR_MSG.CONTROL_PLANE_TARGET_MISSING),
      ),
      true,
      'temporarily missing ingress targets should defer connected publication',
    );
    t.equal(
      service.shouldRetryControlPlaneNodeStateUpdate(
        new Error('validation failed'),
      ),
      false,
      'non-transport publication failures should still fail fast',
    );
  });

test('NodeJoiningService - executePhase routes work through class A scheduler', async (t) => {
  initializeTestEnvironment();

  const scheduledClasses = [];
  const scheduler = {
    enqueue: async (workClass, task) => {
      scheduledClasses.push(workClass);
      return task();
    },
  };

  const service = new NodeJoiningService({
    nodeId: 'test-node-scheduler',
    nodeAddress: 'ws://localhost:9090',
    seedNodeAddress: 'http://localhost:8080',
    workClassScheduler: scheduler,
  });

  await service.executePhase(JoiningPhase.CONTACT_SEED, async () => {});

  t.same(scheduledClasses, [WORK_CLASS.A],
    'joining phase execution should run through class A scheduler');
});

test('NodeJoiningService - initializeMessageGroupServiceHandler uses NodeService cache',
  async (t) => {
    initializeTestEnvironment();

    const registeredHandlers = new Map();
    const cache = new SystemTableCache();
    const originalGetNodeService = NodeService.getInstance;

    try {
      NodeService.getInstance = () => ({
        getSystemTableCache() {
          return cache;
        },
      });

      const service = new NodeJoiningService({
        nodeId: 'joining-node-message-group-handler',
        nodeAddress: 'ws://localhost:9090',
        seedNodeAddress: 'http://localhost:8080',
      });
      service.messageRouter = {
        register(address, handler) {
          registeredHandlers.set(address, handler);
        },
        unregister() {},
      };
      service.cdcIntegrationService = {
        updateSystemTableRow: async () => true,
      };
      service.createJoinMessageGroupReplica = async () => {};
      service.startJoinMessageGroupReplica = async () => {};
      service.stopJoinMessageGroupReplica = async () => {};

      t.doesNotThrow(
        () => service.initializeMessageGroupServiceHandler(),
        'joiner handler initialization should use the canonical NodeService cache',
      );
      t.ok(
        service.messageGroupServiceHandler,
        'should retain the initialized message-group service handler',
      );
      t.ok(
        registeredHandlers.has(
          'joining-node-message-group-handler/service/message-group-handler',
        ),
        'should register the service handler at the control-plane address',
      );
    } finally {
      NodeService.getInstance = originalGetNodeService;
    }
  });

test('NodeJoiningService - durable rejoin restore queues local partition replicas as existing voters',
  async (t) => {
    initializeTestEnvironment();

    const service = new NodeJoiningService({
      nodeId: 'durable-join-node',
      nodeAddress: 'ws://localhost:9090',
      seedNodeAddress: 'http://localhost:8080',
      startupMode: STARTUP_JOIN_MODE.DURABLE_REJOIN,
      dataDir: '/tmp/durable-join-data',
    });

    const calls = [];
    service.messageRouter = {
      isRegistered(address) {
        return address === 'durable-join-node/partition/nodes-p1-r1';
      },
    };
    service.cdcIntegrationService = {
      updateSystemTableRow: async (_tableName, predicate) => {
        calls.push(`activate:${predicate.service_id}`);
      },
      upsertSystemTableRow: async (_tableName, row) => {
        calls.push(`activate:${row.service_id}`);
      },
    };
    service.initializeJoiningLifecycleOwners = async () => {
      calls.push('init');
    };
    service.triggerJoinReconciler = async () => {
      calls.push('reconcile');
      for (const replicaId of service.joinReplicaOptionsByServiceId.keys()) {
        service.partitionServices.set(replicaId, {
          initialized: true,
          partitionId: 'nodes-p1',
          startElection() {
            calls.push(`start:${replicaId}`);
          },
        });
      }
    };

    const schemaDefinition = {
      tableName: 'nodes',
      columns: [{name: 'node_id', type: 'TEXT', primaryKey: true}],
    };
    const rowsByTable = new Map([
      [TABLES.TABLES, [{
        table_id: 'nodes',
        table_name: 'nodes',
        schema_definition: JSON.stringify(schemaDefinition),
      }]],
      [TABLES.PARTITIONS, [{
        partition_id: 'nodes-p1',
        table_id: 'nodes',
        table_name: 'nodes',
        partition_key_start: null,
        partition_key_end: null,
        leader_node_id: 'durable-join-node',
      }]],
      [TABLES.SERVICES, [{
        service_id: 'nodes-p1-r1',
        replica_id: 'nodes-p1-r1',
        service_type: SERVICE_TYPE.PARTITION,
        node_id: 'durable-join-node',
        partition_id: 'nodes-p1',
        status: 'active',
        address: 'durable-join-node/partition/nodes-p1-r1',
      }, {
        service_id: 'nodes-p1-r2',
        replica_id: 'nodes-p1-r2',
        service_type: SERVICE_TYPE.PARTITION,
        node_id: 'peer-node-2',
        partition_id: 'nodes-p1',
        status: 'active',
        address: 'peer-node-2/partition/nodes-p1-r2',
      }, {
        service_id: 'nodes-p1-r3',
        replica_id: 'nodes-p1-r3',
        service_type: SERVICE_TYPE.PARTITION,
        node_id: 'peer-node-3',
        partition_id: 'nodes-p1',
        status: 'active',
        address: 'peer-node-3/partition/nodes-p1-r3',
      }]],
    ]);
    const systemTableCache = {
      getAll(tableName) {
        return rowsByTable.get(tableName) || [];
      },
      get(tableName, key) {
        const rows = rowsByTable.get(tableName) || [];
        return rows.find((row) =>
          row.partition_id === key ||
          row.table_id === key ||
          row.service_id === key,
        ) || null;
      },
    };

    const restored =
      await service.restoreDurableRejoinLocalPartitionServices(
        systemTableCache,
      );

    t.same(
      calls,
      ['init', 'reconcile', 'activate:nodes-p1-r1', 'start:nodes-p1-r1'],
      'durable rejoin should activate restored partition services before starting their elections',
    );
    t.same(
      restored.map((plan) => plan.replicaId),
      ['nodes-p1-r1'],
      'only cached local active partition replicas should be restored',
    );
    const restorePlan =
      service.joinReplicaOptionsByServiceId.get('nodes-p1-r1');
    t.equal(
      restorePlan.isJoiningExistingGroup,
      false,
      'durable restore should reactivate existing voters instead of restarting them as learners',
    );
    t.equal(
      restorePlan.deferElection,
      true,
      'durable restore should defer elections until the local restore batch is recreated',
    );
    t.same(
      restorePlan.replicaIds,
      ['nodes-p1-r1', 'nodes-p1-r2', 'nodes-p1-r3'],
      'restore plan should preserve the canonical durable peer set',
    );
    t.match(
      restorePlan.dbPath,
      /\/tmp\/durable-join-data\/partitions\/nodes-p1\/nodes-p1-r1\.db$/,
      'restore plan should point at the durable local partition database path',
    );
  });

test('NodeJoiningService - durable rejoin restore fails closed until restored partition handlers are routable',
  async (t) => {
    initializeTestEnvironment();

    const service = new NodeJoiningService({
      nodeId: 'durable-join-node',
      nodeAddress: 'ws://localhost:9090',
      seedNodeAddress: 'http://localhost:8080',
      startupMode: STARTUP_JOIN_MODE.DURABLE_REJOIN,
      dataDir: '/tmp/durable-join-data',
    });

    service.messageRouter = {
      isRegistered() {
        return false;
      },
    };
    service.cdcIntegrationService = {
      updateSystemTableRow: async () => ({success: true}),
      upsertSystemTableRow: async () => ({success: true}),
    };
    service.initializeJoiningLifecycleOwners = async () => {};
    service.triggerJoinReconciler = async () => {
      for (const replicaId of service.joinReplicaOptionsByServiceId.keys()) {
        service.partitionServices.set(replicaId, {
          initialized: true,
          partitionId: 'nodes-p1',
          startElection() {},
        });
      }
    };

    const schemaDefinition = {
      tableName: 'nodes',
      columns: [{name: 'node_id', type: 'TEXT', primaryKey: true}],
    };
    const rowsByTable = new Map([
      [TABLES.TABLES, [{
        table_id: 'nodes',
        table_name: 'nodes',
        schema_definition: JSON.stringify(schemaDefinition),
      }]],
      [TABLES.PARTITIONS, [{
        partition_id: 'nodes-p1',
        table_id: 'nodes',
        table_name: 'nodes',
        partition_key_start: null,
        partition_key_end: null,
        leader_node_id: 'durable-join-node',
      }]],
      [TABLES.SERVICES, [{
        service_id: 'nodes-p1-r1',
        replica_id: 'nodes-p1-r1',
        service_type: SERVICE_TYPE.PARTITION,
        node_id: 'durable-join-node',
        partition_id: 'nodes-p1',
        status: 'active',
        address: 'durable-join-node/partition/nodes-p1-r1',
      }]],
    ]);
    const systemTableCache = {
      getAll(tableName) {
        return rowsByTable.get(tableName) || [];
      },
      get(tableName, key) {
        const rows = rowsByTable.get(tableName) || [];
        return rows.find((row) =>
          row.partition_id === key ||
          row.table_id === key ||
          row.service_id === key,
        ) || null;
      },
    };

    await t.rejects(
      service.restoreDurableRejoinLocalPartitionServices(systemTableCache),
      new Error(
        PARTITION_SERVICE_ACTIVATION_ERROR
          .replicaHandlerRequired('nodes-p1-r1'),
      ),
      'durable rejoin should fail closed until restored partition handlers are routable through the shared activation owner',
    );
  });

test('NodeJoiningService - durable rejoin restore skips ambiguous over-target ' +
  'partition replicas without a live replica-operation owner', async (t) => {
  initializeTestEnvironment();

  const service = new NodeJoiningService({
    nodeId: 'durable-join-node',
    nodeAddress: 'ws://localhost:9090',
    seedNodeAddress: 'http://localhost:8080',
    startupMode: STARTUP_JOIN_MODE.DURABLE_REJOIN,
    dataDir: '/tmp/durable-join-data',
  });

  const calls = [];
  service.initializeJoiningLifecycleOwners = async () => {
    calls.push('init');
  };
  service.triggerJoinReconciler = async () => {
    calls.push('reconcile');
  };
  service.cdcIntegrationService = {
    updateSystemTableRow: async () => {
      calls.push('activate:update');
    },
    upsertSystemTableRow: async () => {
      calls.push('activate:upsert');
    },
  };

  const schemaDefinition = {
    tableName: 'control_plane_publications',
    columns: [{name: 'publication_id', type: 'TEXT', primaryKey: true}],
  };
  const rowsByTable = new Map([
    [TABLES.TABLES, [{
      table_id: 'control_plane_publications',
      table_name: 'control_plane_publications',
      schema_definition: JSON.stringify(schemaDefinition),
    }]],
    [TABLES.PARTITIONS, [{
      partition_id: 'control_plane_publications-p1',
      table_id: 'control_plane_publications',
      table_name: 'control_plane_publications',
      partition_key_start: null,
      partition_key_end: null,
      leader_node_id: 'seed-node',
      replica_count: 3,
    }]],
    [TABLES.SERVICES, [{
      service_id: 'control_plane_publications-p1-r1',
      replica_id: 'control_plane_publications-p1-r1',
      service_type: SERVICE_TYPE.PARTITION,
      node_id: 'seed-node',
      partition_id: 'control_plane_publications-p1',
      status: 'active',
      address: 'seed-node/partition/control_plane_publications-p1-r1',
    }, {
      service_id: 'control_plane_publications-p1-r2',
      replica_id: 'control_plane_publications-p1-r2',
      service_type: SERVICE_TYPE.PARTITION,
      node_id: 'peer-node-2',
      partition_id: 'control_plane_publications-p1',
      status: 'active',
      address: 'peer-node-2/partition/control_plane_publications-p1-r2',
    }, {
      service_id: 'control_plane_publications-p1-r3',
      replica_id: 'control_plane_publications-p1-r3',
      service_type: SERVICE_TYPE.PARTITION,
      node_id: 'peer-node-3',
      partition_id: 'control_plane_publications-p1',
      status: 'active',
      address: 'peer-node-3/partition/control_plane_publications-p1-r3',
    }, {
      service_id: 'control_plane_publications-p1-r4',
      replica_id: 'control_plane_publications-p1-r4',
      service_type: SERVICE_TYPE.PARTITION,
      node_id: 'durable-join-node',
      partition_id: 'control_plane_publications-p1',
      status: 'active',
      address: 'durable-join-node/partition/control_plane_publications-p1-r4',
    }]],
    [TABLES.REPLICA_OPERATIONS, []],
  ]);
  const systemTableCache = {
    getAll(tableName) {
      return rowsByTable.get(tableName) || [];
    },
    get(tableName, key) {
      const rows = rowsByTable.get(tableName) || [];
      return rows.find((row) =>
        row.partition_id === key ||
        row.table_id === key ||
        row.service_id === key,
      ) || null;
    },
  };

  const restored =
    await service.restoreDurableRejoinLocalPartitionServices(
      systemTableCache,
    );

  t.same(
    restored,
    [],
    'durable rejoin should not restore an over-target partition when no ' +
      'replica operation still owns the topology',
  );
  t.same(
    calls,
    [],
    'ambiguous over-target restore should not initialize join lifecycle ' +
      'owners or activate service rows',
  );
});

test('NodeJoiningService - retries bootstrap when seed responds BOOTSTRAP_NOT_READY',
  async (t) => {
    initializeTestEnvironment();

    let attempts = 0;
    const service = new NodeJoiningService({
      nodeId: '550e8400-e29b-41d4-a716-446655440099',
      nodeAddress: 'ws://localhost:9090',
      seedNodeAddress: 'http://localhost:8080',
      config: {
        httpTimeoutMs: 100,
        leadershipWaitTimeoutMs: 400,
        leadershipWaitInitialDelayMs: 10,
        leadershipWaitMaxDelayMs: 10,
      },
      httpPost: async () => {
        attempts++;
        if (attempts === 1) {
          throw new Error(
            'HTTP 503: {"success":false,"error":"Bootstrap not ready",' +
            '"code":"BOOTSTRAP_NOT_READY","phase":"partitions"}',
          );
        }
        return {
          success: true,
          seedNodeId: 'seed-node-1',
          seedNodeWsAddress: DEFAULT_SEED_WS_ADDRESS,
          messageGroupAssignment: {
            strategy: AssignmentStrategy.CREATE_SELF_HOSTED,
          },
        };
      },
    });

    await service.phaseContactSeed();

    t.equal(attempts, 2, 'should retry bootstrap request after bootstrap-not-ready response');
    t.equal(service.seedNodeId, 'seed-node-1', 'should capture seed node id after retry');
    t.equal(service.seedNodeWsAddress, DEFAULT_SEED_WS_ADDRESS,
      'should capture seed node websocket address after retry');
    t.equal(
      service.bootstrapResponse?.messageGroupAssignment?.strategy,
      AssignmentStrategy.CREATE_SELF_HOSTED,
      'should store bootstrap response after retry succeeds',
    );
  });

test('NodeJoiningService - retries bootstrap when seed request times out',
  async (t) => {
    initializeTestEnvironment();

    let attempts = 0;
    const service = new NodeJoiningService({
      nodeId: '550e8400-e29b-41d4-a716-446655440100',
      nodeAddress: 'ws://localhost:9090',
      seedNodeAddress: 'http://localhost:8080',
      config: {
        httpTimeoutMs: 10000,
        leadershipWaitTimeoutMs: 400,
        leadershipWaitInitialDelayMs: 10,
        leadershipWaitMaxDelayMs: 10,
      },
      httpPost: async () => {
        attempts++;
        if (attempts === 1) {
          throw new Error('Request timeout after 10000ms');
        }
        return {
          success: true,
          seedNodeId: 'seed-node-1',
          seedNodeWsAddress: DEFAULT_SEED_WS_ADDRESS,
          messageGroupAssignment: {
            strategy: AssignmentStrategy.CREATE_SELF_HOSTED,
          },
        };
      },
    });

    await service.phaseContactSeed();

    t.equal(attempts, 2, 'should retry bootstrap request after timeout');
    t.equal(service.seedNodeId, 'seed-node-1',
      'should still complete seed contact after retry');
  });

test('NodeJoiningService - retries register-service request after timeout',
  async (t) => {
    initializeTestEnvironment();

    let attempts = 0;
    const retryDelays = [];
    const service = new NodeJoiningService({
      nodeId: '550e8400-e29b-41d4-a716-446655440104',
      nodeAddress: 'ws://localhost:9090',
      seedNodeAddress: 'http://localhost:8080',
      config: {
        httpTimeoutMs: 1000,
        leadershipWaitTimeoutMs: 200,
        leadershipWaitInitialDelayMs: 10,
        leadershipWaitMaxDelayMs: 10,
        leadershipWaitBackoffMultiplier: 2,
        leadershipWaitJitterRatio: 0,
      },
      sleep: async (delayMs) => {
        retryDelays.push(delayMs);
      },
      httpPost: async (url) => {
        if (!url.endsWith('/register-service')) {
          throw new Error('unexpected URL in register-service retry test');
        }
        attempts += 1;
        if (attempts === 1) {
          throw new Error('Request timeout after 1000ms');
        }
        return {success: true};
      },
    });

    await service.registerMessageGroupService(
      'mg-1',
      'mg-1-r0',
      {getRole: () => 'leader'},
    );

    t.equal(attempts, 2, 'should retry register-service once after timeout');
    t.same(retryDelays, [10], 'should apply configured retry delay before retry');
  });

test('NodeJoiningService - retries register-service on cache visibility timeout code',
  async (t) => {
    initializeTestEnvironment();

    let attempts = 0;
    const retryDelays = [];
    const warnEvents = [];
    const service = new NodeJoiningService({
      nodeId: '550e8400-e29b-41d4-a716-446655440106',
      nodeAddress: 'ws://localhost:9090',
      seedNodeAddress: 'http://localhost:8080',
      config: {
        httpTimeoutMs: 1000,
        leadershipWaitTimeoutMs: 200,
        leadershipWaitInitialDelayMs: 10,
        leadershipWaitMaxDelayMs: 10,
        leadershipWaitBackoffMultiplier: 2,
        leadershipWaitJitterRatio: 0,
      },
      sleep: async (delayMs) => {
        retryDelays.push(delayMs);
      },
      httpPost: async (url) => {
        if (!url.endsWith('/register-service')) {
          throw new Error('unexpected URL in register-service retry test');
        }
        attempts += 1;
        if (attempts === 1) {
          const error = new Error(
            'HTTP 500: {"success":false,"error":"cache visibility timeout",' +
            '"code":"SERVICE_REGISTRATION_CACHE_VISIBILITY_TIMEOUT"}',
          );
          error.statusCode = 500;
          error.responseJson = {
            success: false,
            error: 'cache visibility timeout',
            code: 'SERVICE_REGISTRATION_CACHE_VISIBILITY_TIMEOUT',
            details: {
              lastVisibilityCheck: {
                reason: 'field_mismatch',
                mismatchFields: ['node_id'],
              },
            },
          };
          throw error;
        }
        return {success: true};
      },
    });
    service.logger = {
      debug() {},
      info() {},
      warn(message, details) {
        warnEvents.push({message, details});
      },
      error() {},
    };

    await service.registerMessageGroupService(
      'mg-1',
      'mg-1-r0',
      {getRole: () => 'leader'},
    );

    t.equal(
      attempts,
      2,
      'should retry register-service once after typed cache visibility timeout',
    );
    t.same(retryDelays, [10], 'should apply configured retry delay before retry');
    const retryEvent = warnEvents.find((event) =>
      event.details &&
      event.details.lastCode === 'SERVICE_REGISTRATION_CACHE_VISIBILITY_TIMEOUT',
    );
    t.ok(retryEvent, 'should emit retry warning for typed cache visibility timeout');
    t.same(
      retryEvent.details.lastErrorDetails,
      {
        lastVisibilityCheck: {
          reason: 'field_mismatch',
          mismatchFields: ['node_id'],
        },
      },
      'retry warning should preserve seed-provided timeout diagnostics',
    );
  });

test('NodeJoiningService - includes assignment_id on MOVE_REPLICA register-service',
  async (t) => {
    initializeTestEnvironment();

    let capturedPayload = null;
    const service = new NodeJoiningService({
      nodeId: '550e8400-e29b-41d4-a716-446655440105',
      nodeAddress: 'ws://localhost:9090',
      seedNodeAddress: 'http://localhost:8080',
      httpPost: async (_url, payload) => {
        capturedPayload = payload;
        return {success: true};
      },
    });
    service.bootstrapResponse = {
      messageGroupAssignment: {
        strategy: AssignmentStrategy.MOVE_REPLICA,
        groupId: 'mg-1',
        replicaToMove: 'mg-1-r0',
        assignmentId: '5ef301f9-6f73-4cb5-bb4e-8d73ef2a9ce5',
      },
    };

    await service.registerMessageGroupService(
      'mg-1',
      'mg-1-r0',
      {getRole: () => 'leader'},
    );

    t.ok(capturedPayload, 'register-service payload should be captured');
    t.equal(
      capturedPayload.assignment_id,
      '5ef301f9-6f73-4cb5-bb4e-8d73ef2a9ce5',
      'MOVE_REPLICA register-service should include assignment_id token',
    );
  });

test('NodeJoiningService - bypasses HTTP register-service for local seed self-registration',
  async (t) => {
    initializeTestEnvironment();

    let httpCalls = 0;
    const upsertCalls = [];
    const seededRows = [];
    const service = new NodeJoiningService({
      nodeId: 'seed-node-1',
      nodeAddress: 'ws://localhost:9090',
      seedNodeAddress: 'http://localhost:8080',
      httpPost: async () => {
        httpCalls += 1;
        return {success: true};
      },
    });
    service.seedNodeId = 'seed-node-1';
    service.upsertSystemTableRowWithRetry = async (tableName, row, options) => {
      upsertCalls.push({tableName, row, options});
      return {success: true};
    };
    service.seedJoinTimeCacheRow = (tableName, row) => {
      seededRows.push({tableName, row});
    };

    await service.registerMessageGroupService(
      'mg-1',
      'mg-1-r0',
      {getRole: () => 'leader'},
      {status: SERVICE_STATUS.STOPPED},
    );

    t.equal(
      httpCalls,
      0,
      'local seed CREATE_SELF_HOSTED registration should not loop through HTTP',
    );
    t.equal(upsertCalls.length, 1,
      'local seed shortcut should persist the service row directly');
    t.equal(upsertCalls[0].tableName, 'services',
      'local seed shortcut should write to the services table');
    t.equal(
      upsertCalls[0].row.service_id,
      'mg-1-r0',
      'local seed shortcut should write the targeted replica row',
    );
    t.equal(
      upsertCalls[0].row.status,
      SERVICE_STATUS.STOPPED,
      'local seed shortcut should preserve requested status',
    );
    t.equal(seededRows.length, 1,
      'local seed shortcut should seed the join-time cache row');
  });

test('NodeJoiningService - fails fast on unauthorized replica owner conflict at startup',
  async (t) => {
    initializeTestEnvironment();

    const service = new NodeJoiningService({
      nodeId: 'joining-node-ownership-1',
      nodeAddress: 'ws://localhost:9090',
      seedNodeAddress: 'http://localhost:8080',
    });
    service.bootstrapResponse = {
      messageGroupAssignment: {
        strategy: AssignmentStrategy.MOVE_REPLICA,
        groupId: 'mg-1',
        replicaToMove: 'mg-1-r1',
        sourceNodeId: 'seed-node-1',
      },
    };

    const nodeService = NodeService.getInstance();
    nodeService.initialize({nodeId: 'joining-node-ownership-1'});
    const cache = nodeService.getSystemTableCache();
    cache.applySystemTableChange('services', 'INSERT', {
      service_id: 'mg-1-r1',
      service_type: 'message_group',
      node_id: 'seed-node-1',
      group_id: 'mg-1',
      replica_id: 'mg-1-r1',
      raft_role: 'follower',
      status: 'active',
      address: 'seed-node-1/message-group/mg-1-r1',
    });

    t.throws(
      () => service.assertReplicaStartupOwnership('mg-1-r1'),
      /replica_owner_conflict/i,
      'startup guard should reject unauthorized duplicate active ownership',
    );
  });

test(
  'NodeJoiningService - allows replica startup when MOVE_REPLICA assignment token ' +
    'authorizes ownership transfer',
  async (t) => {
    initializeTestEnvironment();

    const service = new NodeJoiningService({
      nodeId: 'joining-node-ownership-2',
      nodeAddress: 'ws://localhost:9090',
      seedNodeAddress: 'http://localhost:8080',
    });
    service.bootstrapResponse = {
      messageGroupAssignment: {
        strategy: AssignmentStrategy.MOVE_REPLICA,
        groupId: 'mg-1',
        replicaToMove: 'mg-1-r1',
        sourceNodeId: 'seed-node-1',
        assignmentId: '6201a7c2-e6d6-4fd2-9278-a8233f4f0ad3',
      },
    };

    const nodeService = NodeService.getInstance();
    nodeService.initialize({nodeId: 'joining-node-ownership-2'});
    const cache = nodeService.getSystemTableCache();
    cache.applySystemTableChange('services', 'INSERT', {
      service_id: 'mg-1-r1',
      service_type: 'message_group',
      node_id: 'seed-node-1',
      group_id: 'mg-1',
      replica_id: 'mg-1-r1',
      raft_role: 'follower',
      status: 'active',
      address: 'seed-node-1/message-group/mg-1-r1',
    });

    t.doesNotThrow(
      () => service.assertReplicaStartupOwnership('mg-1-r1'),
      'authorized MOVE_REPLICA assignment should permit startup handoff',
    );
  },
);

test('NodeJoiningService - retries generic HTTP 503 and honors retry hints with jitter',
  async (t) => {
    initializeTestEnvironment();

    let attempts = 0;
    const retryDelays = [];
    const service = new NodeJoiningService({
      nodeId: '550e8400-e29b-41d4-a716-446655440101',
      nodeAddress: 'ws://localhost:9090',
      seedNodeAddress: 'http://localhost:8080',
      config: {
        httpTimeoutMs: 1000,
        leadershipWaitTimeoutMs: 400,
        leadershipWaitInitialDelayMs: 10,
        leadershipWaitMaxDelayMs: 100,
        leadershipWaitBackoffMultiplier: 2,
        leadershipWaitJitterRatio: 0.5,
      },
      random: () => 1,
      sleep: async (delayMs) => {
        retryDelays.push(delayMs);
      },
      httpPost: async () => {
        attempts++;
        if (attempts === 1) {
          const error = new Error(
            'HTTP 503: {"success":false,"error":"temporarily unavailable",' +
            '"retryAfterMs":30}',
          );
          error.statusCode = 503;
          error.retryAfterMs = 30;
          throw error;
        }
        return {
          success: true,
          seedNodeId: 'seed-node-1',
          seedNodeWsAddress: DEFAULT_SEED_WS_ADDRESS,
          messageGroupAssignment: {
            strategy: AssignmentStrategy.CREATE_SELF_HOSTED,
          },
        };
      },
    });

    await service.phaseContactSeed();

    t.equal(attempts, 2, 'should retry after HTTP 503 response class');
    t.equal(retryDelays.length, 1, 'should wait exactly once before retry');
    t.ok(retryDelays[0] >= 30, 'should honor retryAfterMs lower bound');
    t.ok(retryDelays[0] > 30, 'should apply positive jitter on top of retry hint');
  });

test('NodeJoiningService - treats bootstrap validation/conflict failures as terminal',
  async (t) => {
    initializeTestEnvironment();

    let attempts = 0;
    const retryDelays = [];
    const service = new NodeJoiningService({
      nodeId: '550e8400-e29b-41d4-a716-446655440102',
      nodeAddress: 'ws://localhost:9090',
      seedNodeAddress: 'http://localhost:8080',
      config: {
        httpTimeoutMs: 1000,
        leadershipWaitTimeoutMs: 400,
        leadershipWaitInitialDelayMs: 10,
        leadershipWaitMaxDelayMs: 10,
      },
      sleep: async (delayMs) => {
        retryDelays.push(delayMs);
      },
      httpPost: async () => {
        attempts++;
        const error = new Error('HTTP 409: {"error":"Node ID already registered"}');
        error.statusCode = 409;
        throw error;
      },
    });

    await t.rejects(
      service.phaseContactSeed(),
      /Failed to contact seed node:/,
      'should fail immediately on conflict/validation classes',
    );
    t.equal(attempts, 1, 'should not retry terminal conflict response');
    t.same(retryDelays, [], 'should not wait/backoff for terminal errors');
  });

test('NodeJoiningService - retry diagnostics include attempt, elapsed, code, and next delay',
  async (t) => {
    initializeTestEnvironment();

    const debugEvents = [];
    let attempts = 0;
    const service = new NodeJoiningService({
      nodeId: '550e8400-e29b-41d4-a716-446655440103',
      nodeAddress: 'ws://localhost:9090',
      seedNodeAddress: 'http://localhost:8080',
      config: {
        httpTimeoutMs: 1000,
        leadershipWaitTimeoutMs: 400,
        leadershipWaitInitialDelayMs: 20,
        leadershipWaitMaxDelayMs: 20,
        leadershipWaitBackoffMultiplier: 2,
        leadershipWaitJitterRatio: 0,
      },
      sleep: async () => {},
      httpPost: async () => {
        attempts++;
        if (attempts === 1) {
          throw new Error(
            'HTTP 503: {"success":false,"error":"Bootstrap not ready",' +
            '"code":"BOOTSTRAP_NOT_READY","phase":"registration"}',
          );
        }
        return {
          success: true,
          seedNodeId: 'seed-node-1',
          seedNodeWsAddress: DEFAULT_SEED_WS_ADDRESS,
          messageGroupAssignment: {
            strategy: AssignmentStrategy.CREATE_SELF_HOSTED,
          },
        };
      },
    });

    service.logger = {
      debug(message, details) {
        debugEvents.push({message, details});
      },
      info() {},
      warn() {},
      error() {},
    };

    await service.phaseContactSeed();

    const retryEvent = debugEvents.find((event) =>
      event.details &&
      event.details.attempt === 1 &&
      event.details.lastCode === 'BOOTSTRAP_NOT_READY',
    );

    t.ok(retryEvent, 'should emit retry diagnostics for first retryable failure');
    t.equal(typeof retryEvent.details.elapsedMs, 'number',
      'retry diagnostics should include elapsedMs');
    t.equal(typeof retryEvent.details.nextDelayMs, 'number',
      'retry diagnostics should include nextDelayMs');
    t.equal(retryEvent.details.nextDelayMs, 20,
      'retry diagnostics should report computed delay');
  });

test('NodeJoiningService - resolves control plane target from kernel bootstrap ingress',
  async (t) => {
    initializeTestEnvironment();

    const service = new NodeJoiningService({
      nodeId: 'joining-node-1',
      nodeAddress: 'ws://localhost:9090',
      seedNodeAddress: 'http://localhost:8080',
    });

    service.controlPlaneTargetAddress = 'stale-node/message-group/mg-1-r9';
    service.seedNodeId = 'seed-node-1';
    service.bootstrapResponse = {
      seedNodeId: 'seed-node-1',
      messageGroupAssignment: {
        strategy: AssignmentStrategy.MOVE_REPLICA,
        groupId: 'mg-1',
        replicaToMove: 'mg-1-r1',
        peerAddresses: [
          'seed-node-1/message-group/mg-1-r1',
          'seed-node-1/message-group/mg-1-r2',
        ],
      },
    };

    service.messageRouter = {
      getConnectionState: (nodeId) => {
        return nodeId === 'seed-node-1' ? 'connected' : 'disconnected';
      },
    };

    const target = service.resolveControlPlaneTargetAddress();

    t.equal(
      target,
      'seed-node-1/message-group/mg-1-r2',
      'should use kernel bootstrap ingress instead of requiring services metadata',
    );
  });

test('NodeJoiningService - uses kernel bootstrap ingress when no local target exists',
  async (t) => {
    initializeTestEnvironment();

    const service = new NodeJoiningService({
      nodeId: 'joining-node-2',
      nodeAddress: 'ws://localhost:9091',
      seedNodeAddress: 'http://localhost:8080',
    });

    service.seedNodeId = 'seed-node-1';
    service.bootstrapResponse = {
      seedNodeId: 'seed-node-1',
      messageGroupAssignment: {
        strategy: AssignmentStrategy.MOVE_REPLICA,
        groupId: 'mg-1',
        replicaToMove: 'mg-1-r1',
        peerAddresses: [
          'seed-node-1/message-group/mg-1-r1',
          'seed-node-1/message-group/mg-1-r3',
        ],
      },
    };

    const target = service.resolveControlPlaneTargetAddress();

    t.equal(
      target,
      'seed-node-1/message-group/mg-1-r3',
      'should use non-moved bootstrap hint when metadata is unavailable',
    );
  });

test('NodeJoiningService - does not self-target move-replica heartbeats ' +
  'when only local services metadata is present', async (t) => {
  initializeTestEnvironment();

  const service = new NodeJoiningService({
    nodeId: 'joining-node-3',
    nodeAddress: 'ws://localhost:9092',
    seedNodeAddress: 'http://localhost:8080',
  });

  service.seedNodeId = 'seed-node-1';
  service.bootstrapResponse = {
    seedNodeId: 'seed-node-1',
    messageGroupAssignment: {
      strategy: AssignmentStrategy.MOVE_REPLICA,
      groupId: 'mg-1',
      replicaToMove: 'mg-1-r1',
      peerAddresses: [
        'seed-node-1/message-group/mg-1-r1',
        'seed-node-1/message-group/mg-1-r3',
      ],
    },
  };

  service.messageRouter = {
    getConnectionState: (nodeId) => {
      return nodeId === 'seed-node-1' ||
        nodeId === 'joining-node-3' ?
        'connected' :
        'disconnected';
    },
  };

  const nodeService = NodeService.getInstance();
  nodeService.initialize({nodeId: 'joining-node-3'});
  const cache = nodeService.getSystemTableCache();
  cache.applySystemTableChange('services', 'INSERT', {
    service_id: 'mg-1-r1',
    group_id: 'mg-1',
    node_id: 'joining-node-3',
    service_type: 'message_group',
    address: 'joining-node-3/message-group/mg-1-r1',
    status: 'active',
    raft_role: 'leader',
  });

  t.equal(
    service.resolveControlPlaneTargetAddress({allowBootstrapHints: false}),
    null,
    'local-only resolution should refuse self-loop admission targets',
  );
  t.equal(
    service.resolveControlPlaneTargetAddress(),
    'seed-node-1/message-group/mg-1-r3',
    'move-replica admission should use seed ingress instead of self-targeting',
  );
});

test('NodeJoiningService - accepts canonical message-group leader metadata without leader service role',
  async (t) => {
    initializeTestEnvironment();

    const service = new NodeJoiningService({
      nodeId: 'joining-node-canonical-mg-leader',
      nodeAddress: 'ws://localhost:9090',
      seedNodeAddress: 'http://localhost:8080',
    });
    service.messageGroupServices.set('mg-join-r1', {groupId: 'mg-join'});

    const cache = {
      filter(tableName, predicate) {
        if (tableName === TABLES.SERVICES) {
          return [{
            [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.MESSAGE_GROUP,
            [COLUMN.GROUP_ID]: 'mg-join',
            [COLUMN.NODE_ID]: 'node-canonical',
            [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
            [COLUMN.RAFT_ROLE]: 'follower',
          }].filter(predicate);
        }
        if (tableName === TABLES.MESSAGE_GROUPS) {
          return [{
            [COLUMN.GROUP_ID]: 'mg-join',
            [COLUMN.LEADER_NODE_ID]: 'node-canonical',
          }].filter(predicate);
        }
        return [];
      },
      getAll() {
        return [];
      },
    };

    t.equal(
      service.hasMessageGroupLeaderInCache(cache),
      true,
      'canonical message-group leader_node_id should satisfy join leadership visibility',
    );
  });

test('NodeJoiningService - prefers local kernel ingress for NODE_STATE_UPDATE',
  async (t) => {
  initializeTestEnvironment();

  const service = new NodeJoiningService({
    nodeId: 'joining-node-local',
    nodeAddress: 'ws://localhost:9093',
    seedNodeAddress: 'http://localhost:8080',
  });

  service.seedNodeId = 'seed-node-1';
  service.bootstrapResponse = {
    seedNodeId: 'seed-node-1',
    messageGroupAssignment: {
      strategy: AssignmentStrategy.MOVE_REPLICA,
      groupId: 'mg-1',
      replicaToMove: 'mg-1-r1',
      peerAddresses: [
        'seed-node-1/message-group/mg-1-r1',
        'seed-node-1/message-group/mg-1-r3',
      ],
    },
  };

  const deliveries = [];
  service.messageRouter = {
    getConnectionState(nodeId) {
      return nodeId === 'joining-node-local' || nodeId === 'seed-node-1' ?
        'connected' :
        'disconnected';
    },
    async deliver(targetAddress, message) {
      deliveries.push({targetAddress, state: message.state});
      return {acknowledged: true};
    },
  };

  service.messageGroupServices.set('mg-1-r2', {
    groupId: 'mg-1',
    unifiedAddress: 'joining-node-local/message-group/mg-1-r2',
    isLeaderReplica: () => true,
    getLeaderId: () => 'mg-1-r2',
    isMetadataIngressReady: () => true,
  });

  await service.sendControlPlaneNodeStateUpdate({state: 'connected'});

  t.same(deliveries, [
    {
      targetAddress: 'joining-node-local/message-group/mg-1-r2',
      state: 'connected',
    },
  ], 'NODE_STATE_UPDATE should use the local kernel ingress before remote routes');
});

test('NodeJoiningService - resolves ordered control-plane target candidates ' +
  'for NODE_STATE_UPDATE', async (t) => {
  initializeTestEnvironment();

  const service = new NodeJoiningService({
    nodeId: 'joining-node-candidates',
    nodeAddress: 'ws://localhost:9094',
    seedNodeAddress: 'http://localhost:8080',
  });

  service.bootstrapResponse = {
    seedNodeId: 'seed-node-1',
    messageGroupAssignment: {
      strategy: AssignmentStrategy.MOVE_REPLICA,
      groupId: 'mg-1',
      replicaToMove: 'mg-1-r1',
      peerAddresses: [
        'seed-node-2/message-group/mg-1-r4',
        'seed-node-1/message-group/mg-1-r3',
      ],
    },
  };
  service.messageRouter = {
    getConnectionState(nodeId) {
      return nodeId === 'joining-node-candidates' ||
        nodeId === 'seed-node-1' ||
        nodeId === 'seed-node-2' ?
        'connected' :
        'disconnected';
    },
  };
  service.messageGroupServices.set('mg-1-r2', {
    groupId: 'mg-1',
    unifiedAddress: 'joining-node-candidates/message-group/mg-1-r2',
    isLeaderReplica: () => true,
    getLeaderId: () => 'mg-1-r2',
    isMetadataIngressReady: () => true,
  });

  t.same(
    service.resolveControlPlaneTargetAddressCandidates({
      allowBootstrapHints: true,
      allowSelfTarget: true,
    }),
    [
      'joining-node-candidates/message-group/mg-1-r2',
      'seed-node-1/message-group/mg-1-r3',
      'seed-node-2/message-group/mg-1-r4',
    ],
    'candidate resolution should prefer local ingress, then seed ingress, then remote ingress',
  );
});

test('NodeJoiningService - NODE_STATE_UPDATE prefers local non-leader ingress ' +
  'for any-replica delivery', async (t) => {
  initializeTestEnvironment();

  const service = new NodeJoiningService({
    nodeId: 'joining-node-local-follower',
    nodeAddress: 'ws://localhost:90941',
    seedNodeAddress: 'http://localhost:8080',
  });

  service.bootstrapResponse = {
    seedNodeId: 'seed-node-1',
    messageGroupAssignment: {
      strategy: AssignmentStrategy.MOVE_REPLICA,
      groupId: 'mg-1',
      replicaToMove: 'mg-1-r2',
      peerAddresses: [
        'seed-node-1/message-group/mg-1-r1',
      ],
    },
  };
  service.messageRouter = {
    getConnectionState() {
      return 'connected';
    },
    async deliver(targetAddress, message) {
      return {
        acknowledged: true,
        targetAddress,
        state: message.state,
      };
    },
  };
  const deliveries = [];
  service.messageRouter.deliver = async (targetAddress, message) => {
    deliveries.push({targetAddress, state: message.state});
    return {acknowledged: true};
  };
  service.messageGroupServices.set('mg-1-r2', {
    groupId: 'mg-1',
    unifiedAddress: 'joining-node-local-follower/message-group/mg-1-r2',
    isLeaderReplica: () => false,
    getLeaderId: () => 'mg-1-r1',
    isMetadataIngressReady: () => true,
  });

  await service.sendControlPlaneNodeStateUpdate({state: 'ready'});

  t.same(deliveries, [
    {
      targetAddress: 'joining-node-local-follower/message-group/mg-1-r2',
      state: 'ready',
    },
  ], 'NODE_STATE_UPDATE should use the local ingress replica even before it becomes leader');
});

test('NodeJoiningService - READY heartbeat NODE_STATE_UPDATE prefers remote ' +
  'authoritative ingress before local self-target', async (t) => {
  initializeTestEnvironment();

  const service = new NodeJoiningService({
    nodeId: 'joining-node-ready-heartbeat',
    nodeAddress: 'ws://localhost:909411',
    seedNodeAddress: 'http://localhost:8080',
  });

  service.bootstrapResponse = {
    seedNodeId: 'seed-node-1',
    messageGroupAssignment: {
      strategy: AssignmentStrategy.MOVE_REPLICA,
      groupId: 'mg-1',
      replicaToMove: 'mg-1-r2',
      peerAddresses: [
        'seed-node-1/message-group/mg-1-r1',
      ],
    },
  };
  const deliveries = [];
  service.messageRouter = {
    getConnectionState() {
      return 'connected';
    },
    async deliver(targetAddress, message) {
      deliveries.push({targetAddress, state: message.state});
      return {acknowledged: true};
    },
  };
  service.messageGroupServices.set('mg-1-r2', {
    groupId: 'mg-1',
    unifiedAddress: 'joining-node-ready-heartbeat/message-group/mg-1-r2',
    isLeaderReplica: () => false,
    getLeaderId: () => 'mg-1-r1',
    isMetadataIngressReady: () => true,
  });

  await service.sendControlPlaneNodeStateUpdate({
    state: STATE.READY,
    heartbeatAt: Date.now(),
  });

  t.same(deliveries, [
    {
      targetAddress: 'seed-node-1/message-group/mg-1-r1',
      state: STATE.READY,
    },
  ], 'READY heartbeats should prefer remote authoritative ingress before local self-target');
});

test('NodeJoiningService - READY heartbeat NODE_STATE_UPDATE falls back to ' +
  'local ingress when no remote target is reachable', async (t) => {
  initializeTestEnvironment();

  const service = new NodeJoiningService({
    nodeId: 'joining-node-ready-heartbeat-local-fallback',
    nodeAddress: 'ws://localhost:909412',
    seedNodeAddress: 'http://localhost:8080',
  });

  service.bootstrapResponse = {
    seedNodeId: 'seed-node-1',
    messageGroupAssignment: {
      strategy: AssignmentStrategy.MOVE_REPLICA,
      groupId: 'mg-1',
      replicaToMove: 'mg-1-r2',
      peerAddresses: [
        'seed-node-1/message-group/mg-1-r1',
      ],
    },
  };
  const deliveries = [];
  service.messageRouter = {
    getConnectionState(nodeId) {
      return nodeId === 'joining-node-ready-heartbeat-local-fallback' ?
        'connected' :
        'disconnected';
    },
    async deliver(targetAddress, message) {
      deliveries.push({targetAddress, state: message.state});
      return {acknowledged: true};
    },
  };
  service.messageGroupServices.set('mg-1-r2', {
    groupId: 'mg-1',
    unifiedAddress:
      'joining-node-ready-heartbeat-local-fallback/message-group/mg-1-r2',
    isLeaderReplica: () => false,
    getLeaderId: () => 'mg-1-r1',
    isMetadataIngressReady: () => true,
  });

  await service.sendControlPlaneNodeStateUpdate({
    state: STATE.READY,
    heartbeatAt: Date.now(),
  });

  t.same(deliveries, [
    {
      targetAddress:
        'joining-node-ready-heartbeat-local-fallback/message-group/mg-1-r2',
      state: STATE.READY,
    },
  ], 'READY heartbeats should retain local fallback when no remote ingress is reachable');
});

test('NodeJoiningService - query transport selection uses initialized local ' +
  'relay during join convergence', (t) => {
  initializeTestEnvironment();
  t.plan(3);

  const service = new NodeJoiningService({
    nodeId: 'joining-node-query-transport-relay',
    nodeAddress: 'ws://localhost:90942',
    seedNodeAddress: 'http://localhost:8080',
  });

  const relayService = {
    initialized: true,
    sendMessage: async () => ({acknowledged: true}),
    isLeaderReplica: () => false,
    getMetadataIngressReadiness: () => ({
      ready: false,
      reason: 'operational message-group ingress not ready',
      retryAfterMs: 50,
    }),
  };
  service.messageGroupServices.set('mg-1-r1', relayService);

  t.equal(
    service.resolveOperationalMessageGroupSelection().service,
    null,
    'metadata-ingress selection should continue to block the relay',
  );

  const selection = service.resolveQueryTransportMessageGroupSelection();

  t.equal(
    selection.service,
    relayService,
    'query transport selection should still bind the initialized local relay',
  );
  t.equal(
    selection.route,
    'relay',
    'query transport selection should report the relay route',
  );
});

test('NodeJoiningService - connect websocket phase wires the dedicated query ' +
  'transport selector', (t) => {
  initializeTestEnvironment();
  t.plan(3);

  const service = new NodeJoiningService({
    nodeId: 'joining-node-query-transport-phase-wiring',
    nodeAddress: 'ws://localhost:90943',
    seedNodeAddress: 'http://localhost:8080',
  });

  const relayService = {
    initialized: true,
    sendMessage: async () => ({acknowledged: true}),
    isLeaderReplica: () => false,
    getMetadataIngressReadiness: () => ({
      ready: false,
      reason: 'operational message-group ingress not ready',
      retryAfterMs: 25,
    }),
  };
  service.messageGroupServices.set('mg-1-r1', relayService);

  t.equal(
    service.connectWebSocketPhase.delegates.getLeaderMessageGroupService(),
    null,
    'operational selector should still block the relay while metadata ingress is deferred',
  );
  t.equal(
    typeof service.connectWebSocketPhase.delegates
      .resolveQueryTransportMessageGroupSelection,
    'function',
    'connect websocket phase should receive the dedicated query transport selector',
  );
  t.equal(
    service.connectWebSocketPhase.delegates
      .resolveQueryTransportMessageGroupSelection()
      ?.service,
    relayService,
    'connect websocket phase should route query transport through the dedicated relay selection',
  );
});

test('NodeJoiningService - excludes disconnected control-plane ingress candidates',
  async (t) => {
    initializeTestEnvironment();

    const service = new NodeJoiningService({
      nodeId: 'joining-node-reconnectable-target',
      nodeAddress: 'ws://localhost:90945',
      seedNodeAddress: 'http://localhost:8080',
    });

    service.bootstrapResponse = {
      seedNodeId: 'seed-node-1',
      messageGroupAssignment: {
        strategy: AssignmentStrategy.MOVE_REPLICA,
        groupId: 'mg-1',
        peerAddresses: [
          'seed-node-1/message-group/mg-1-r3',
        ],
      },
    };
    service.messageRouter = {
      getConnectionState() {
        return 'disconnected';
      },
      async deliver(targetAddress) {
        return {
          acknowledged: true,
          targetAddress,
        };
      },
    };

    t.same(
      service.resolveControlPlaneTargetAddressCandidates({
        allowBootstrapHints: true,
        allowSelfTarget: false,
      }),
      [],
      'disconnected ingress should not be returned until connectivity is re-established',
    );

    await t.rejects(
      service.sendControlPlaneNodeStateUpdate({state: STATE.READY}),
      /No reachable control plane target address available/,
      'READY publication should fail closed when no reachable control-plane ingress exists',
    );
  });

test('NodeJoiningService - retries NODE_STATE_UPDATE on stale control-plane target',
  async (t) => {
    initializeTestEnvironment();

    const service = new NodeJoiningService({
      nodeId: 'joining-node-retry',
      nodeAddress: 'ws://localhost:9095',
      seedNodeAddress: 'http://localhost:8080',
    });

    service.bootstrapResponse = {
      seedNodeId: 'seed-node-1',
      messageGroupAssignment: {
        strategy: AssignmentStrategy.MOVE_REPLICA,
        groupId: 'mg-1',
      },
    };

    const deliveries = [];
    service.controlPlaneKernelIngress = {
      resolveTargetCandidates: () => [
        'stale-node/message-group/mg-1-r9',
        'seed-node-1/message-group/mg-1-r3',
      ],
    };
    service.messageRouter = {
      async deliver(targetAddress) {
        deliveries.push(targetAddress);
        if (targetAddress === 'stale-node/message-group/mg-1-r9') {
          return {
            acknowledged: false,
            error: 'No connection to node stale-node',
          };
        }
        return {acknowledged: true};
      },
    };

    await service.sendControlPlaneNodeStateUpdate({state: STATE.READY});

    t.same(deliveries, [
      'stale-node/message-group/mg-1-r9',
      'seed-node-1/message-group/mg-1-r3',
    ], 'should retry NODE_STATE_UPDATE against the fallback target');
    t.equal(
      service.controlPlaneTargetAddress,
      'seed-node-1/message-group/mg-1-r3',
      'should retain the successful control-plane target after retry',
    );
  });

test('NodeJoiningService - reuses confirmed control-plane ingress after stale-target retry',
  async (t) => {
    initializeTestEnvironment();

    const service = new NodeJoiningService({
      nodeId: 'joining-node-confirmed-ingress',
      nodeAddress: 'ws://localhost:90955',
      seedNodeAddress: 'http://localhost:8080',
    });

    service.bootstrapResponse = {
      seedNodeId: 'seed-node-1',
      messageGroupAssignment: {
        strategy: AssignmentStrategy.MOVE_REPLICA,
        groupId: 'mg-1',
        peerAddresses: [
          'stale-node/message-group/mg-1-r9',
          'seed-node-1/message-group/mg-1-r3',
        ],
      },
    };
    service.messageRouter = {
      getConnectionState(nodeId) {
        return nodeId === 'stale-node' ||
          nodeId === 'seed-node-1' ?
          'connected' :
          'disconnected';
      },
    };
    service.controlPlaneKernelIngress = new ControlPlaneKernelIngress({
      nodeId: service.nodeId,
      ingressLeaseMs: 5000,
      targetSuppressionMs: 5000,
      getBootstrapResponse: () => service.bootstrapResponse,
      getMessageRouter: () => service.messageRouter,
    });
    service.controlPlaneKernelIngress
      .noteSuccessfulTarget('stale-node/message-group/mg-1-r9');

    const deliveries = [];
    service.messageRouter.deliver = async (targetAddress) => {
      deliveries.push(targetAddress);
      if (targetAddress === 'stale-node/message-group/mg-1-r9') {
        return {
          acknowledged: false,
          error: 'No connection to node stale-node',
        };
      }
      return {acknowledged: true};
    };

    await service.sendControlPlaneNodeStateUpdate({state: STATE.READY});
    await service.sendControlPlaneNodeStateUpdate({state: STATE.READY});

    t.same(deliveries, [
      'stale-node/message-group/mg-1-r9',
      'seed-node-1/message-group/mg-1-r3',
      'seed-node-1/message-group/mg-1-r3',
    ], 'subsequent publications should reuse the confirmed fallback ingress');
    t.equal(
      service.controlPlaneKernelIngress.getConfirmedIngressLease()?.targetAddress,
      'seed-node-1/message-group/mg-1-r3',
      'successful retry should promote the fallback ingress into the kernel lease owner',
    );
  });

test('NodeJoiningService - prefers live local control-plane ingress over a stale confirmed remote lease',
  async (t) => {
    initializeTestEnvironment();

    const service = new NodeJoiningService({
      nodeId: 'joining-node-local-ingress',
      nodeAddress: 'ws://localhost:90956',
      seedNodeAddress: 'http://localhost:8080',
    });

    service.bootstrapResponse = {
      seedNodeId: 'seed-node-1',
      messageGroupAssignment: {
        strategy: AssignmentStrategy.MOVE_REPLICA,
        groupId: 'mg-1',
        peerAddresses: [
          'seed-node-1/message-group/mg-1-r3',
        ],
      },
    };
    service.messageRouter = {
      getConnectionState() {
        return 'connected';
      },
    };
    service.controlPlaneKernelIngress = new ControlPlaneKernelIngress({
      nodeId: service.nodeId,
      ingressLeaseMs: 5000,
      targetSuppressionMs: 5000,
      getBootstrapResponse: () => service.bootstrapResponse,
      getMessageRouter: () => service.messageRouter,
      getMessageGroupServices: () => new Map([
        ['mg-1-r1', {
          groupId: 'mg-1',
          unifiedAddress:
            'joining-node-local-ingress/message-group/mg-1-r1',
          isLeaderReplica: () => true,
          isMetadataIngressReady: () => true,
        }],
      ]),
    });
    service.controlPlaneKernelIngress
      .noteSuccessfulTarget('seed-node-1/message-group/mg-1-r3');

    const deliveries = [];
    service.messageRouter.deliver = async (targetAddress) => {
      deliveries.push(targetAddress);
      return {acknowledged: true};
    };

    await service.sendControlPlaneNodeStateUpdate({state: STATE.READY});

    t.same(deliveries, [
      'joining-node-local-ingress/message-group/mg-1-r1',
    ], 'node-state publication should use the live local ingress before the stale remote lease');
    t.equal(
      service.controlPlaneKernelIngress.getConfirmedIngressLease()?.targetAddress,
      'joining-node-local-ingress/message-group/mg-1-r1',
      'successful local delivery should replace the stale remote lease',
    );
  });

test('NodeJoiningService - does not retry NODE_STATE_UPDATE on non-transport failures',
  async (t) => {
    initializeTestEnvironment();

    const service = new NodeJoiningService({
      nodeId: 'joining-node-no-retry',
      nodeAddress: 'ws://localhost:9096',
      seedNodeAddress: 'http://localhost:8080',
    });

    service.bootstrapResponse = {
      seedNodeId: 'seed-node-1',
      messageGroupAssignment: {
        strategy: AssignmentStrategy.MOVE_REPLICA,
        groupId: 'mg-1',
      },
    };

    const deliveries = [];
    service.controlPlaneKernelIngress = {
      resolveTargetCandidates: () => [
        'seed-node-2/message-group/mg-1-r4',
        'seed-node-1/message-group/mg-1-r3',
      ],
    };
    service.messageRouter = {
      async deliver(targetAddress) {
        deliveries.push(targetAddress);
        return {
          acknowledged: false,
          error: 'validation failed',
        };
      },
    };

    await t.rejects(
      service.sendControlPlaneNodeStateUpdate({state: STATE.READY}),
      /validation failed/,
      'should surface non-transport publication failures without fallback retry',
    );
    t.same(deliveries, [
      'seed-node-2/message-group/mg-1-r4',
    ], 'should stop after the first non-retryable target failure');
  });

test('NodeJoiningService - reconnects disconnected cluster peers during mesh connect',
  async (t) => {
    initializeTestEnvironment();

    const service = new NodeJoiningService({
      nodeId: 'joining-node-3',
      nodeAddress: 'ws://localhost:9092',
      seedNodeAddress: 'http://localhost:8080',
    });

    const reconnectCalls = [];
    service.bootstrapResponse = {
      systemTableSnapshots: {
        nodes: [
          {node_id: 'joining-node-3', node_address: 'localhost:9092'},
          {node_id: 'peer-disconnected', node_address: 'localhost:8081'},
          {node_id: 'peer-connected', node_address: 'localhost:8082'},
        ],
        node_endpoints: [
          {
            endpoint_id: 'ep-peer-disconnected-ws',
            node_id: 'peer-disconnected',
            transport_type: TRANSPORT_TYPE.WEBSOCKET,
            address: 'ws://peer-disconnected:8083',
            priority: 0,
            status: ENDPOINT_STATUS.ACTIVE,
          },
          {
            endpoint_id: 'ep-peer-connected-ws',
            node_id: 'peer-connected',
            transport_type: TRANSPORT_TYPE.WEBSOCKET,
            address: 'ws://peer-connected:8084',
            priority: 0,
            status: ENDPOINT_STATUS.ACTIVE,
          },
        ],
      },
    };
    service.messageRouter = {
      nodeConnections: new Map([
        ['peer-disconnected', {state: 'disconnected'}],
        ['peer-connected', {state: 'connected'}],
      ]),
      getConnectionState(nodeId) {
        return this.nodeConnections.get(nodeId)?.state || null;
      },
      async connectToNode(nodeId, wsAddress) {
        reconnectCalls.push({nodeId, wsAddress});
        this.nodeConnections.set(nodeId, {state: 'connected'});
      },
      getConnectedNodes() {
        return ['peer-connected'];
      },
    };

    await service.connectToClusterNodes();

    t.equal(reconnectCalls.length, 1, 'should reconnect only disconnected peers');
    t.equal(reconnectCalls[0].nodeId, 'peer-disconnected', 'should reconnect stale entry');
    t.equal(
      reconnectCalls[0].wsAddress,
      'ws://peer-disconnected:8083',
      'should use the canonical node_endpoints websocket address',
    );
  });

test('NodeJoiningService - prefers authoritative cache nodes during mesh connect',
  async (t) => {
    initializeTestEnvironment();

    const service = new NodeJoiningService({
      nodeId: 'joining-node-4',
      nodeAddress: 'ws://localhost:9093',
      seedNodeAddress: 'http://localhost:8080',
    });

    service.bootstrapResponse = {
      systemTableSnapshots: {
        nodes: [
          {node_id: 'joining-node-4', node_address: 'localhost:9093'},
          {node_id: 'seed-node', node_address: 'localhost:8080'},
        ],
      },
    };

    const nodeService = NodeService.getInstance();
    const systemTableCache = nodeService.getSystemTableCache();
    service.systemTableCache = systemTableCache;
    systemTableCache.applySystemTableChange(TABLES.NODES, CDC_OPERATION.INSERT, {
      node_id: 'joining-node-4',
      node_address: 'localhost:9093',
      status: 'active',
    });
    systemTableCache.applySystemTableChange(TABLES.NODES, CDC_OPERATION.INSERT, {
      node_id: 'seed-node',
      node_address: 'localhost:8080',
      status: 'active',
    });
    systemTableCache.applySystemTableChange(TABLES.NODES, CDC_OPERATION.INSERT, {
      node_id: 'late-peer',
      node_address: 'localhost:8084',
      status: 'active',
    });
    systemTableCache.applySystemTableChange(
      TABLES.NODE_ENDPOINTS,
      CDC_OPERATION.INSERT,
      {
        endpoint_id: 'ep-late-peer-ws',
        node_id: 'late-peer',
        transport_type: TRANSPORT_TYPE.WEBSOCKET,
        address: 'ws://late-peer:8086',
        priority: 0,
        status: ENDPOINT_STATUS.ACTIVE,
      },
    );

    const connectCalls = [];
    service.messageRouter = {
      nodeConnections: new Map([
        ['seed-node', {state: 'connected'}],
      ]),
      getConnectionState(nodeId) {
        return this.nodeConnections.get(nodeId)?.state || null;
      },
      async connectToNode(nodeId, wsAddress) {
        connectCalls.push({nodeId, wsAddress});
        this.nodeConnections.set(nodeId, {state: 'connected'});
      },
      getConnectedNodes() {
        return ['seed-node', 'late-peer'];
      },
    };

    await service.connectToClusterNodes();

    t.equal(connectCalls.length, 1, 'should connect only the late cache-discovered peer');
    t.equal(connectCalls[0].nodeId, 'late-peer', 'should target peer missing from bootstrap snapshot');
    t.equal(connectCalls[0].wsAddress, 'ws://late-peer:8086',
      'should use the authoritative cache-backed node_endpoints row');
  });

test('NodeJoiningService - mesh connect includes non-terminal peers once canonical endpoints are visible',
  async (t) => {
    initializeTestEnvironment();

    const service = new NodeJoiningService({
      nodeId: 'joining-node-4b',
      nodeAddress: 'ws://localhost:9098',
      seedNodeAddress: 'http://localhost:8080',
    });

    const nodeService = NodeService.getInstance();
    const systemTableCache = nodeService.getSystemTableCache();
    service.systemTableCache = systemTableCache;
    systemTableCache.applySystemTableChange(TABLES.NODES, CDC_OPERATION.INSERT, {
      node_id: 'joining-node-4b',
      node_address: 'localhost:9098',
      status: 'active',
    });
    systemTableCache.applySystemTableChange(TABLES.NODES, CDC_OPERATION.INSERT, {
      node_id: 'peer-joining',
      node_address: 'localhost:8088',
      status: 'joining',
      connection_state: 'connected',
    });
    systemTableCache.applySystemTableChange(
      TABLES.NODE_ENDPOINTS,
      CDC_OPERATION.INSERT,
      {
        endpoint_id: 'ep-peer-joining-ws',
        node_id: 'peer-joining',
        transport_type: TRANSPORT_TYPE.WEBSOCKET,
        address: 'ws://peer-joining:8088',
        priority: 0,
        status: ENDPOINT_STATUS.ACTIVE,
      },
    );

    const connectCalls = [];
    service.messageRouter = {
      nodeConnections: new Map(),
      getConnectionState(nodeId) {
        return this.nodeConnections.get(nodeId)?.state || null;
      },
      async connectToNode(nodeId, wsAddress) {
        connectCalls.push({nodeId, wsAddress});
        this.nodeConnections.set(nodeId, {state: 'connected'});
      },
      getConnectedNodes() {
        return ['peer-joining'];
      },
    };

    await service.connectToClusterNodes();

    t.same(connectCalls, [
      {nodeId: 'peer-joining', wsAddress: 'ws://peer-joining:8088'},
    ], 'mesh reconciliation should connect to joining peers when node_endpoints are authoritative');
  });

test('NodeJoiningService - ready state update triggers mesh reconciliation without blocking',
  async (t) => {
    initializeTestEnvironment();

    const service = new NodeJoiningService({
      nodeId: 'joining-node-5',
      nodeAddress: 'ws://localhost:9094',
      seedNodeAddress: 'http://localhost:8080',
    });

    service.bootstrapResponse = {
      systemTableSnapshots: {
        nodes: [
          {node_id: 'joining-node-5', node_address: 'localhost:9094'},
          {node_id: 'seed-node', node_address: 'localhost:8080'},
        ],
      },
    };

    const nodeService = NodeService.getInstance();
    const systemTableCache = nodeService.getSystemTableCache();
    service.systemTableCache = systemTableCache;
    systemTableCache.applySystemTableChange(TABLES.NODES, CDC_OPERATION.INSERT, {
      node_id: 'joining-node-5',
      node_address: 'localhost:9094',
      status: 'active',
    });
    systemTableCache.applySystemTableChange(TABLES.NODES, CDC_OPERATION.INSERT, {
      node_id: 'seed-node',
      node_address: 'localhost:8080',
      status: 'active',
    });
    systemTableCache.applySystemTableChange(TABLES.NODES, CDC_OPERATION.INSERT, {
      node_id: 'late-peer',
      node_address: 'localhost:8085',
      status: 'active',
    });
    systemTableCache.applySystemTableChange(
      TABLES.NODE_ENDPOINTS,
      CDC_OPERATION.INSERT,
      {
        endpoint_id: 'ep-late-peer-ready-ws',
        node_id: 'late-peer',
        transport_type: TRANSPORT_TYPE.WEBSOCKET,
        address: 'ws://late-peer:8087',
        priority: 0,
        status: ENDPOINT_STATUS.ACTIVE,
      },
    );

    const callOrder = [];
    service.resolveControlPlaneTargetAddressCandidates = () => [
      'seed-node/message-group/mg-1-r1',
    ];
    service.messageRouter = {
      nodeConnections: new Map([
        ['seed-node', {state: 'connected'}],
      ]),
      getConnectionState(nodeId) {
        return this.nodeConnections.get(nodeId)?.state || null;
      },
      async connectToNode(nodeId, wsAddress) {
        callOrder.push(`connect:${nodeId}:${wsAddress}`);
        this.nodeConnections.set(nodeId, {state: 'connected'});
      },
      async deliver(targetAddress, message) {
        callOrder.push(`deliver:${targetAddress}:${message.state}`);
        return {acknowledged: true};
      },
      getConnectedNodes() {
        return ['seed-node', 'late-peer'];
      },
    };

    await service.sendControlPlaneNodeStateUpdate({state: 'ready'});

    t.same(callOrder, [
      'deliver:seed-node/message-group/mg-1-r1:ready',
      'connect:late-peer:ws://late-peer:8087',
    ], 'ready update should not wait on best-effort peer mesh repair');
  });

test('NodeJoiningService - canonical endpoint CDC triggers one coalesced mesh reconciliation',
  async (t) => {
    initializeTestEnvironment();

    const service = new NodeJoiningService({
      nodeId: 'joining-node-cdc-mesh',
      nodeAddress: 'ws://localhost:9101',
      seedNodeAddress: 'http://localhost:8080',
    });

    let releaseReconciliation;
    const connectCalls = [];
    service.messageRouter = {};
    service.joinReadinessEvaluator.shouldReconnectClusterMesh =
      () => true;
    service.connectToClusterNodes = async () => {
      connectCalls.push('connect');
      await new Promise((resolve) => {
        releaseReconciliation = resolve;
      });
    };

    const cdcIntegrationService = new EventEmitter();
    service.cdcIntegrationService = cdcIntegrationService;

    await service.subscribeToCDCEvents();

    cdcIntegrationService.emit(CDC_EVENT.UPSERT, {
      tableName: TABLES.NODE_ENDPOINTS,
      operation: CDC_EVENT.UPSERT,
    });
    cdcIntegrationService.emit(CDC_EVENT.UPDATE, {
      tableName: TABLES.NODE_ENDPOINTS,
      operation: CDC_EVENT.UPDATE,
    });
    cdcIntegrationService.emit(CDC_EVENT.UPDATE, {
      tableName: TABLES.SERVICES,
      operation: CDC_EVENT.UPDATE,
    });

    await new Promise((resolve) => setImmediate(resolve));

    t.same(
      connectCalls,
      ['connect'],
      'authoritative node_endpoints CDC should trigger one coalesced mesh reconciliation',
    );

    releaseReconciliation();
    await service.pendingClusterMeshReconciliation;

    cdcIntegrationService.emit(CDC_EVENT.INSERT, {
      tableName: TABLES.NODES,
      operation: CDC_EVENT.INSERT,
    });
    await new Promise((resolve) => setImmediate(resolve));

    t.same(
      connectCalls,
      ['connect', 'connect'],
      'canonical node membership CDC should re-arm reconciliation after the prior run completes',
    );

    releaseReconciliation();
    await service.pendingClusterMeshReconciliation;
  });

test('NodeJoiningService - steady ready heartbeats skip redundant mesh reconciliation',
  async (t) => {
    initializeTestEnvironment();

    const service = new NodeJoiningService({
      nodeId: 'joining-node-6',
      nodeAddress: 'ws://localhost:9095',
      seedNodeAddress: 'http://localhost:8080',
    });

    const nodeService = NodeService.getInstance();
    const systemTableCache = nodeService.getSystemTableCache();
    for (const row of [
      {
        node_id: 'joining-node-6',
        node_address: 'localhost:9095',
        status: 'active',
      },
      {
        node_id: 'seed-node',
        node_address: 'localhost:8080',
        status: 'active',
      },
      {
        node_id: 'late-peer',
        node_address: 'localhost:8085',
        status: 'active',
      },
    ]) {
      systemTableCache.applySystemTableChange(TABLES.NODES, CDC_OPERATION.INSERT, row);
    }

    const callOrder = [];
    service.resolveControlPlaneTargetAddressCandidates = () => [
      'seed-node/message-group/mg-1-r1',
    ];
    service.messageRouter = {
      nodeConnections: new Map([
        ['seed-node', {state: 'connected'}],
        ['late-peer', {state: 'connected'}],
      ]),
      getConnectionState(nodeId) {
        return this.nodeConnections.get(nodeId)?.state || null;
      },
      async connectToNode(nodeId, wsAddress) {
        callOrder.push(`connect:${nodeId}:${wsAddress}`);
        this.nodeConnections.set(nodeId, {state: 'connected'});
      },
      async deliver(targetAddress, message) {
        callOrder.push(`deliver:${targetAddress}:${message.state}`);
        return {acknowledged: true};
      },
      getConnectedNodes() {
        return ['seed-node', 'late-peer'];
      },
    };

    await service.connectToClusterNodes();
    callOrder.length = 0;

    await service.sendControlPlaneNodeStateUpdate({state: 'ready'});

    t.same(callOrder, [
      'deliver:seed-node/message-group/mg-1-r1:ready',
    ], 'should skip mesh reconciliation when the ready heartbeat sees the same connected mesh');
  });

test('NodeJoiningService - steady ready heartbeats ignore stopped peers in mesh reconciliation',
  async (t) => {
    initializeTestEnvironment();

    const service = new NodeJoiningService({
      nodeId: 'joining-node-7',
      nodeAddress: 'ws://localhost:9096',
      seedNodeAddress: 'http://localhost:8080',
    });

    const nodeService = NodeService.getInstance();
    const systemTableCache = nodeService.getSystemTableCache();
    for (const row of [
      {
        node_id: 'joining-node-7',
        node_address: 'localhost:9096',
        status: 'active',
      },
      {
        node_id: 'seed-node',
        node_address: 'localhost:8080',
        status: 'active',
      },
      {
        node_id: 'stopped-peer',
        node_address: 'localhost:8086',
        status: 'stopped',
      },
    ]) {
      systemTableCache.applySystemTableChange(TABLES.NODES, CDC_OPERATION.INSERT, row);
    }

    const callOrder = [];
    service.resolveControlPlaneTargetAddressCandidates = () => [
      'seed-node/message-group/mg-1-r1',
    ];
    service.messageRouter = {
      nodeConnections: new Map([
        ['seed-node', {state: 'connected'}],
        ['stopped-peer', {state: 'disconnected'}],
      ]),
      getConnectionState(nodeId) {
        return this.nodeConnections.get(nodeId)?.state || null;
      },
      async connectToNode(nodeId, wsAddress) {
        callOrder.push(`connect:${nodeId}:${wsAddress}`);
        this.nodeConnections.set(nodeId, {state: 'connected'});
      },
      async deliver(targetAddress, message) {
        callOrder.push(`deliver:${targetAddress}:${message.state}`);
        return {acknowledged: true};
      },
      getConnectedNodes() {
        return ['seed-node'];
      },
    };

    await service.connectToClusterNodes();
    t.equal(
      service.joinReadinessEvaluator.shouldReconnectClusterMesh(),
      false,
      'stopped peers should not keep mesh reconciliation armed',
    );
    callOrder.length = 0;

    await service.sendControlPlaneNodeStateUpdate({state: 'ready'});

    t.same(callOrder, [
      'deliver:seed-node/message-group/mg-1-r1:ready',
    ], 'ready heartbeats should ignore stopped peers when deciding whether to reconcile mesh');
  });

test('NodeJoiningService - shouldReconnectClusterMesh ignores peers already connecting or reconnecting',
  async (t) => {
    initializeTestEnvironment();

    for (const peerConnectionState of ['connecting', 'reconnecting']) {
      const service = new NodeJoiningService({
        nodeId: `joining-node-${peerConnectionState}`,
        nodeAddress: 'ws://localhost:9097',
        seedNodeAddress: 'http://localhost:8080',
      });

      const nodeService = NodeService.getInstance();
      const systemTableCache = nodeService.getSystemTableCache();
      systemTableCache.clear?.();
      for (const row of [
        {
          node_id: `joining-node-${peerConnectionState}`,
          node_address: 'localhost:9097',
          status: 'active',
        },
        {
          node_id: 'seed-node',
          node_address: 'localhost:8080',
          status: 'active',
        },
        {
          node_id: 'late-peer',
          node_address: 'localhost:8087',
          status: 'active',
        },
      ]) {
        systemTableCache.applySystemTableChange(TABLES.NODES, CDC_OPERATION.INSERT, row);
      }

      service.messageRouter = {
        nodeConnections: new Map([
          ['seed-node', {state: 'connected'}],
          ['late-peer', {state: peerConnectionState}],
        ]),
        getConnectionState(nodeId) {
          return this.nodeConnections.get(nodeId)?.state || null;
        },
        async connectToNode() {
          throw new Error('unexpected reconnect attempt');
        },
        getConnectedNodes() {
          return ['seed-node'];
        },
      };

      await service.connectToClusterNodes();

      t.equal(
        service.joinReadinessEvaluator.shouldReconnectClusterMesh(),
        false,
        `mesh reconciliation should treat ${peerConnectionState} as already in progress`,
      );
    }
  });

test('NodeJoiningService - fails without seed node address', async (t) => {
  initializeTestEnvironment();

  const service = new NodeJoiningService({
    nodeId: 'test-node-1',
    nodeAddress: 'ws://localhost:9090',
    // No seedNodeAddress
  });

  const result = await service.join();

  t.equal(result.success, false);
  t.ok(result.error.includes('Seed node address'));
  t.equal(service.getPhase(), JoiningPhase.FAILED);
});

test('NodeJoiningService - submits join and durable rejoin intent through membership lifecycle controller',
  async (t) => {
    initializeTestEnvironment();

    for (const startupMode of [
      STARTUP_JOIN_MODE.FRESH_JOIN,
      STARTUP_JOIN_MODE.DURABLE_REJOIN,
    ]) {
      const intents = [];
      const service = new NodeJoiningService({
        nodeId: `test-node-${startupMode}`,
        nodeAddress: 'ws://localhost:9090',
        seedNodeAddress: 'http://localhost:8080',
        startupMode,
        membershipLifecycleController: {
          async submitJoinIntent(intent) {
            intents.push(intent);
            return {
              intentType:
                startupMode === STARTUP_JOIN_MODE.DURABLE_REJOIN ?
                  MEMBERSHIP_LIFECYCLE_INTENT.RESTART_REENTRY :
                  MEMBERSHIP_LIFECYCLE_INTENT.JOIN_ADMISSION,
            };
          },
        },
      });
      service.buildJoinCheckpointSteps = () => [];
      service.joinCoordinator.run = async () => {};

      const result = await service.join();

      t.equal(result.success, true,
        `${startupMode} should still complete the delegated join wrapper`);
      t.equal(intents.length, 1,
        `${startupMode} should submit exactly one lifecycle intent`);
      t.match(intents[0], {
        nodeId: `test-node-${startupMode}`,
        startupMode,
        joinSessionId: service.joinSessionId,
        seedNodeAddress: 'http://localhost:8080',
      });
    }
  });

test('NodeJoiningService - full join with CREATE_SELF_HOSTED', async (t) => {
  initializeTestEnvironment();

  // Configure faster Raft elections for testing
  const config = ConfigurationManager.getInstance();
  config.config.raft = {
    ...config.config.raft,
    electionTimeoutMinMs: 25,
    electionTimeoutMaxMs: 50,
    heartbeatIntervalMs: 10,
  };

  // Start a seed node API
  const seedApi = new BootstrapAPI({
    seedNodeId: 'seed-node-1',
    seedNodeAddress: 'ws://localhost:8080',
    messageGroupServices: new Map(),
    systemTableCache: new SystemTableCache(),
  });

  const httpPost = async (url, body) => {
    const u = new URL(url);
    const res = await seedApi.getFastify().inject({
      method: 'POST',
      url: u.pathname,
      payload: body,
    });
    return JSON.parse(res.payload);
  };

  let service = null;
  // Use random port to avoid conflicts
  const joiningNodeWsPort = 19090 + Math.floor(Math.random() * 1000);

  try {
    await seedApi.initialize(0, {listen: false});

    // Create joining service with wsPort for WebSocket server
    service = new NodeJoiningService({
      nodeId: '550e8400-e29b-41d4-a716-446655440010',
      nodeAddress: `ws://localhost:${joiningNodeWsPort}`,
      seedNodeAddress: 'http://localhost:0',
      wsPort: joiningNodeWsPort, // Enable WebSocket server for self-connection
      httpPost,
      config: {
        httpTimeoutMs: 2000,
        leadershipWaitTimeoutMs: 5000,
        leadershipWaitInitialDelayMs: 10,
        leadershipWaitMaxDelayMs: 100,
      },
    });

    // Mock the WebSocket connection to seed node (no real seed WS server in this test)
    service.phaseConnectWebSocket = async function() {
      // Initialize MessageRouter for local communication only
      const {MessageRouter} = await import('../../src/transport/message-router.js');
      this.messageRouter = new MessageRouter({
        nodeId: this.nodeId,
        nodeAddress: this.nodeAddress,
        wsPort: this.wsPort,
      });
      this.messageRouter.setServiceNodeResolver((address) => {
        const match = address.match(/^([^/]+)\//);
        return match ? match[1] : null;
      });
      await this.messageRouter.initialize({startServer: true});
      this.transport = this.messageRouter;
    };
    service.triggerJoinReconciler = async function() {};
    service.getLeaderMessageGroupService = function() {
      const firstService = this.messageGroupServices.values().next().value;
      return firstService || null;
    };
    service.phaseCreateSelfHostedMessageGroup = async function() {
      const replicaId = 'mg-join-r1';
      const unifiedAddress = `${this.nodeId}/message-group/${replicaId}`;
      this.messageGroupServices.set(replicaId, {
        groupId: 'mg-1',
        unifiedAddress,
        isLeaderReplica: () => true,
        getLeaderId: () => replicaId,
      });
      this.messageRouter.register(unifiedAddress, async () => ({acknowledged: true}));
    };

    // Mock phases that require system tables (not available in this unit test)
    service.phaseQuerySystemState = async function() {
      NodeService.getInstance().getSystemTableCache()
        .applySystemTableChange(TABLES.SERVICE_ENDPOINTS, 'INSERT', {
          endpoint_id: `postgres-wire-endpoint-${this.nodeId}`,
          service_id: META_SERVICE_ID.POSTGRES_WIRE,
          node_id: this.nodeId,
          protocol: 'tcp',
          address: this.nodeId,
          port: 5432,
          metadata: '{}',
        });
    };
    service.initializeReplicaHandler = function() {
      // Skip replica handler initialization
    };
    service.createCdcIntegrationService = function() {
      this.cdcIntegrationService = {
        upsertSystemTableRow: async () => ({success: true}),
        updateSystemTableRow: async () => ({success: true}),
        deleteSystemTableRow: async () => ({success: true}),
      };
      return this.cdcIntegrationService;
    };
    service.initializeControlPlaneService = async function() {
      // Skip control plane service initialization
    };
    service.initializeRuntimeServiceHandler = function() {
      // Skip runtime service handler initialization
    };
    service.registerMessageGroupService = async function() {
      // Skip seed-side /register-service dependency in this unit fixture.
    };
    service.phaseWaitForLeadership = async function() {
      // Skip raft leadership wait in unit test environment
    };
    service.signalReadyForReplicas = async function() {
      // Skip ready signal
    };

    // Track phase events
    const phases = [];
    service.on('phaseStart', (data) => phases.push(data.phase));

    const result = await service.join();

    // The join should succeed
    t.equal(result.success, true, 'join should succeed');
    t.equal(service.getPhase(), JoiningPhase.COMPLETE, 'phase should be complete');
    t.ok(result.messageGroupServices.size > 0, 'should have message group services');
    t.ok(result.transport, 'should have transport');
    t.ok(
      result.bootstrapResponse.messageGroupAssignment.strategy ===
        AssignmentStrategy.CREATE_SELF_HOSTED,
      'should use CREATE_SELF_HOSTED strategy',
    );

    // Verify phases were executed
    t.ok(phases.includes(JoiningPhase.CONTACTING_SEED), 'should have contacted seed');
    t.ok(
      phases.includes(JoiningPhase.CREATING_MESSAGE_GROUP),
      'should have created message group',
    );
    t.ok(phases.includes(JoiningPhase.WAITING_LEADERSHIP), 'should have waited for leadership');
    t.ok(phases.includes(JoiningPhase.QUERYING_STATE), 'should have queried state');
  } finally {
    // Cleanup in reverse order
    if (service) {
      await service.cleanup();
    }
    await seedApi.shutdown();
  }
});

test('NodeJoiningService - signals readiness after querying state', async (t) => {
  initializeTestEnvironment();

  const service = new NodeJoiningService({
    nodeId: '550e8400-e29b-41d4-a716-446655440013',
    nodeAddress: 'ws://localhost:19100',
    seedNodeAddress: 'http://localhost:0',
  });

  const order = [];
  const reporterAssignments = [];
  service.heartbeatService = {
    stop() {},
    start() {},
    setNodeStateReporter(reporter) {
      reporterAssignments.push(reporter);
    },
    setVerifyReporterVisibilityOnSuccess() {},
  };

  // Mock getLeaderMessageGroupService to return a mock service
  service.getLeaderMessageGroupService = () => ({
    isLeaderReplica: () => true,
    getLeaderId: () => 'mg-1-r0',
    unifiedAddress: 'seed-node-1/message-group/mg-1-r0',
  });

  service.phaseContactSeed = async () => {
    service.bootstrapResponse = {
      seedNodeId: 'seed-node-1',
      seedNodeWsAddress: 'ws://localhost:8080',
      messageGroupAssignment: {
        strategy: AssignmentStrategy.CREATE_SELF_HOSTED,
        groupId: 'mg-1',
        replicaCount: 1,
      },
      systemTableSnapshots: {
        nodes: [],
        partitions: [],
        services: [],
        tables: [],
        message_groups: [],
        replica_operations: [],
      },
    };
    service.seedNodeId = 'seed-node-1';
    service.seedNodeWsAddress = 'ws://localhost:8080';
  };
  service.phaseConnectWebSocket = async () => {
    service.messageRouter = {
      deliver: async () => ({acknowledged: true}),
    };
    service.controlPlaneTargetAddress = 'seed-node-1/message-group/mg-1-r0';
  };
  service.phaseCreateSelfHostedMessageGroup = async () => {};
  service.phaseJoinExistingMessageGroup = async () => {};
  service.phaseWaitForLeadership = async () => {};
  service.initializeReplicaHandler = () => {};
  service.initializeMessageGroupServiceHandler = () => {};
  service.initializeControlPlaneService = async () => {};
  service.initializeRuntimeServiceHandler = () => {};
  service.phaseQuerySystemState = async () => {
    order.push('query');
  };
  service.activateMessageGroupServiceRows = async () => {
    order.push('activate-message-group-rows');
  };
  service.signalReadyForReplicas = async () => {
    order.push('ready');
  };

  const result = await service.join();

  t.equal(result.success, true, 'join should succeed');
  t.equal(order.includes('query'), true, 'should query system state');
  t.equal(order.includes('activate-message-group-rows'), true,
    'should activate message-group rows before ready publication');
  t.equal(order.includes('ready'), true, 'should signal readiness');
  t.equal(order.indexOf('query') < order.indexOf('activate-message-group-rows'),
    true, 'should activate rows after state query');
  t.equal(order.indexOf('activate-message-group-rows') < order.indexOf('ready'),
    true, 'should signal readiness after row activation');
  t.same(
    reporterAssignments,
    [],
    'should keep the reporter path active when steady-state heartbeats take over',
  );
});

test('NodeJoiningService keeps the join-time reporter during steady-state heartbeat start',
  async (t) => {
    initializeTestEnvironment();

    const reporterAssignments = [];
    const heartbeatStartOptions = [];
    const service = new NodeJoiningService({
      nodeId: 'joiner-heartbeat-owner-cutover',
      nodeAddress: 'ws://localhost:19101',
      seedNodeAddress: 'http://localhost:0',
    });

    service.heartbeatService = {
      setNodeStateReporter(reporter) {
        reporterAssignments.push(reporter);
      },
      start(options) {
        heartbeatStartOptions.push(options);
      },
    };
    service.getNodeCapabilities = () => ['partition_replica'];

    service.activateControlPlaneBackgroundWriters();

    t.same(
      reporterAssignments,
      [],
      'steady-state cutover should keep the join-time reporter active',
    );
    t.equal(
      heartbeatStartOptions.length,
      1,
      'steady-state heartbeat loop should start once after cutover',
    );
    t.equal(typeof heartbeatStartOptions[0]?.getStats, 'function',
      'steady-state heartbeat loop should derive stats access when cutover occurs');
    t.same(heartbeatStartOptions[0]?.capabilities, ['partition_replica'],
      'steady-state heartbeat loop should derive capabilities when cutover occurs');
  });

test('NodeJoiningService - join-time CDC engine defers distributed transaction ' +
  'recovery until steady-state activation',
async (t) => {
  initializeTestEnvironment();

  const cache = new SystemTableCache();
  const service = new NodeJoiningService({
    nodeId: 'joining-node-recovery-gate',
    nodeAddress: 'ws://localhost:19102',
    seedNodeAddress: 'http://localhost:8080',
  });

  service.seedNodeId = 'seed-node-1';
  service.bootstrapResponse = {
    systemTableSnapshots: {},
  };
  service.messageRouter = {
    deliver: async () => ({acknowledged: true, success: true}),
  };
  service.rebalanceCoordinator = {
    controlPlaneReadinessService: null,
  };
  service.messageGroupServices = new Map([
    ['mg-1', {
      getReadOnlyCache() {
        return cache;
      },
      getWritableCache() {
        return cache;
      },
      setCdcIntegrationService() {},
    }],
  ]);

  const cdcIntegrationService = service.createCdcIntegrationService();
  const sqlQueryEngine = cdcIntegrationService.sqlQueryEngine;
  t.equal(
    sqlQueryEngine.defaultRoutingReadinessDimension,
    CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
    'join-time CDC query routing should remain recovery-eligible while readiness converges',
  );
  const replay = await sqlQueryEngine.waitForDistributedTransactionRecoveryReplay();

  t.equal(
    sqlQueryEngine.transactionCoordinator.recoverySweepTimer,
    null,
    'join-time engine should not start periodic recovery before READY cutover',
  );
  t.same(
    replay,
    {
      totalRecovered: 0,
      resumed: 0,
      failed: 0,
      results: [],
    },
    'join-time engine should keep replay dormant until the owner activates it',
  );

  await sqlQueryEngine.shutdown();
});

test('NodeJoiningService - completeSuccessfulJoin activates distributed ' +
  'transaction recovery after steady-state cutover',
async (t) => {
  initializeTestEnvironment();

  const order = [];
  const service = new NodeJoiningService({
    nodeId: 'joining-node-recovery-activate',
    nodeAddress: 'ws://localhost:19103',
    seedNodeAddress: 'http://localhost:8080',
  });

  service.lifecycleStateMachine.transition = () => {
    order.push('state-transition');
  };
  service.cdcIntegrationService = {
    sqlQueryEngine: {
      activateDistributedTransactionRecovery() {
        order.push('tx-recovery');
        return Promise.resolve({
          totalRecovered: 0,
          resumed: 0,
          failed: 0,
          results: [],
        });
      },
    },
  };
  service.activateControlPlaneBackgroundWriters = () => {
    order.push('background-writers');
  };
  service.createMessageGroupPhase = {
    flushDeferredCreateSelfHostedMetadata() {
      order.push('self-hosted-metadata');
      return Promise.resolve({success: true});
    },
  };
  service.startLatencyTopologyLifecycle = () => {
    order.push('latency-topology');
  };

  service.completeSuccessfulJoin();

  t.same(
    order,
    [
      'state-transition',
      'background-writers',
      'self-hosted-metadata',
      'tx-recovery',
      'latency-topology',
    ],
    'steady-state recovery should start only after the READY cutover owners activate',
  );
});

test('NodeJoiningService - activates message-group rows after membership write',
  async (t) => {
    initializeTestEnvironment();

    const order = [];
    const service = new NodeJoiningService({
      nodeId: 'joining-node-activate-1',
      nodeAddress: 'ws://localhost:9098',
      seedNodeAddress: 'http://localhost:8080',
    });

    service.lifecycleStateMachine.transition = () => {};
    service.getLeaderMessageGroupService = () => ({});
    service.phaseContactSeed = async () => {
      service.bootstrapResponse = {
        success: true,
        seedNodeId: 'seed-node-1',
        seedNodeWsAddress: 'ws://localhost:8080',
        messageGroupAssignment: {
          strategy: AssignmentStrategy.CREATE_SELF_HOSTED,
          groupId: 'mg-1',
          replicaCount: 1,
        },
        systemTableSnapshots: {
          nodes: [],
          partitions: [],
          services: [],
          tables: [],
          message_groups: [],
          replica_operations: [],
        },
      };
      service.seedNodeId = 'seed-node-1';
      service.seedNodeWsAddress = 'ws://localhost:8080';
    };
    service.phaseConnectWebSocket = async () => {
      service.messageRouter = {
        deliver: async () => ({acknowledged: true}),
      };
    };
    service.phaseCreateSelfHostedMessageGroup = async () => {
      service.messageGroupServices.set('mg-1-r0', {
        groupId: 'mg-1',
        unifiedAddress: 'joining-node-activate-1/message-group/mg-1-r0',
        isLeaderReplica: () => true,
        getLeaderId: () => 'mg-1-r0',
      });
    };
    service.phaseJoinExistingMessageGroup = async () => {};
    service.phaseWaitForLeadership = async () => {};
    service.createCdcIntegrationService = () => {
      service.cdcIntegrationService = {
        updateSystemTableRow: async () => ({success: true}),
      };
      return service.cdcIntegrationService;
    };
    service.ensureLatencyTopologyOwners = () => {};
    service.initializeReplicaHandler = () => {};
    service.initializeMessageGroupServiceHandler = () => {
      service.messageGroupServiceHandler = {};
    };
    service.initializeControlPlaneService = async () => {
      service.heartbeatService = {ready: true};
    };
    service.initializeRuntimeServiceHandler = () => {};
    service.phaseQuerySystemState = async () => {
      order.push('query');
    };
    service.activateMessageGroupServiceRows = async () => {
      order.push('activate-message-group-rows');
    };
    service.startJoinOpportunisticBackfill = () => {
      order.push('opportunistic-backfill');
      return Promise.resolve();
    };
    service.joinReadinessEvaluator
      .waitForCanonicalJoinReadinessConvergence = async () => {
      order.push('readiness');
    };
    service.signalReadyForReplicas = async () => {
      order.push('ready-signal');
    };
    service.activateControlPlaneBackgroundWriters = () => {};
    service.startLatencyTopologyLifecycle = () => {};

    const result = await service.join();

    t.equal(result.success, true, 'join should succeed');
    t.same(
      order,
      [
        'query',
        'activate-message-group-rows',
        'opportunistic-backfill',
        'readiness',
        'ready-signal',
      ],
      'service rows should activate before background repair and ready publication',
    );
  });

test('NodeJoiningService - resumes same join session without replaying ' +
  'completed startup checkpoints', async (t) => {
  initializeTestEnvironment();

  const joinSessionStore = new JoinSessionStore({
    storage: new Map(),
    now: () => Date.now(),
  });
  const phaseCalls = [];
  let queryAttempts = 0;
  const service = new NodeJoiningService({
    nodeId: 'joining-node-resume-1',
    nodeAddress: 'ws://localhost:9097',
    seedNodeAddress: 'http://localhost:8080',
    joinSessionId: 'session-resume-1',
    joinSessionStore,
  });

  service.handleJoiningFailure = async (error) => ({
    success: false,
    error: error.message,
  });
  service.lifecycleStateMachine.transition = () => {};
  service.getLeaderMessageGroupService = () => ({});
  service.phaseContactSeed = async () => {
    phaseCalls.push('contact');
    service.bootstrapResponse = {
      success: true,
      seedNodeId: 'seed-node-1',
      seedNodeWsAddress: 'ws://localhost:8080',
      messageGroupAssignment: {
        strategy: AssignmentStrategy.CREATE_SELF_HOSTED,
        groupId: 'mg-1',
        replicaCount: 1,
      },
      systemTableSnapshots: {
        nodes: [],
        partitions: [],
        services: [],
        tables: [],
        message_groups: [],
        replica_operations: [],
      },
    };
    service.seedNodeId = 'seed-node-1';
    service.seedNodeWsAddress = 'ws://localhost:8080';
  };
  service.phaseConnectWebSocket = async () => {
    phaseCalls.push('connect');
    service.messageRouter = {
      deliver: async () => ({acknowledged: true}),
    };
    service.controlPlaneTargetAddress = 'seed-node-1/message-group/mg-1-r0';
  };
  service.phaseCreateSelfHostedMessageGroup = async () => {
    phaseCalls.push('message-group');
    service.messageGroupServices.set('mg-1-r0', {
      groupId: 'mg-1',
      unifiedAddress: 'joining-node-resume-1/message-group/mg-1-r0',
      isLeaderReplica: () => true,
      getLeaderId: () => 'mg-1-r0',
    });
  };
  service.phaseJoinExistingMessageGroup = async () => {};
  service.phaseWaitForLeadership = async () => {
    phaseCalls.push('leadership');
  };
  service.createCdcIntegrationService = () => {
    phaseCalls.push('cdc');
    service.cdcIntegrationService = {
      ready: true,
      updateSystemTableRow: async () => ({success: true}),
    };
    return service.cdcIntegrationService;
  };
  service.ensureLatencyTopologyOwners = () => {
    phaseCalls.push('latency-owners');
    service.latencyTopology = {ready: true};
  };
  service.initializeReplicaHandler = () => {
    phaseCalls.push('replica-handler');
  };
  service.initializeMessageGroupServiceHandler = () => {
    phaseCalls.push('message-group-handler');
  };
  service.initializeControlPlaneService = async () => {
    phaseCalls.push('control-plane');
    service.heartbeatService = {ready: true};
  };
  service.initializeRuntimeServiceHandler = () => {
    phaseCalls.push('runtime-handler');
  };
  service.phaseQuerySystemState = async () => {
    phaseCalls.push('query');
    queryAttempts += 1;
    if (queryAttempts === 1) {
      throw new Error('query failed');
    }
  };
  service.joinReadinessEvaluator
    .waitForCanonicalJoinReadinessConvergence = async () => {
    phaseCalls.push('readiness');
  };
  service.activateMessageGroupServiceRows = async () => {
    phaseCalls.push('activate-message-group-rows');
  };
  service.signalReadyForReplicas = async () => {
    phaseCalls.push('ready-signal');
  };
  service.activateControlPlaneBackgroundWriters = () => {
    phaseCalls.push('activate');
  };
  service.startLatencyTopologyLifecycle = () => {
    phaseCalls.push('latency-start');
  };

  const firstResult = await service.join();
  t.equal(firstResult.success, false, 'first join attempt should fail at query state');
  t.match(firstResult.error, /query failed/,
    'failure should surface the query-state error');

  const secondResult = await service.join();
  t.equal(secondResult.success, true, 'second join attempt should resume and succeed');
  t.same(phaseCalls, [
    'contact',
    'connect',
    'message-group',
    'leadership',
    'cdc',
    'latency-owners',
    'replica-handler',
    'message-group-handler',
    'control-plane',
    'runtime-handler',
    'query',
    'query',
    'activate-message-group-rows',
    'readiness',
    'ready-signal',
    'activate',
    'latency-start',
  ], 'same-session retry should skip completed startup checkpoints');

  const persistedSession = await joinSessionStore.loadSession({
    nodeId: 'joining-node-resume-1',
    sessionId: 'session-resume-1',
  });
  t.equal(
    persistedSession?.checkpoint,
    JOIN_CHECKPOINT.FINALIZED,
    'successful retry should persist the finalized join checkpoint',
  );
});

test('NodeJoiningService - auto-resumes retryable join failures in the same process',
  async (t) => {
    initializeTestEnvironment();

    const sleepCalls = [];
    let queryAttempts = 0;
    const phaseCalls = [];
    const service = new NodeJoiningService({
      nodeId: 'joining-node-auto-resume-1',
      nodeAddress: 'ws://localhost:9098',
      seedNodeAddress: 'http://localhost:8080',
      sleep: async (delayMs) => {
        sleepCalls.push(delayMs);
      },
      config: {
        autoResumeRetryableFailures: true,
        retryableFailureResumeBaseDelayMs: 10,
        retryableFailureResumeMaxDelayMs: 25,
      },
    });

    service.lifecycleStateMachine.transition = () => {};
    service.handleJoiningFailure = async (error) => ({
      success: false,
      nodeId: service.nodeId,
      duration: 0,
      error: error.message,
      phase: service.getPhase(),
      retryable: true,
      retryAfterMs: error.retryAfterMs,
    });
    service.phaseContactSeed = async () => {
      phaseCalls.push('contact');
      service.bootstrapResponse = {
        success: true,
        seedNodeId: 'seed-node-1',
        seedNodeWsAddress: 'ws://localhost:8080',
        messageGroupAssignment: {
          strategy: AssignmentStrategy.CREATE_SELF_HOSTED,
          groupId: 'mg-1',
          replicaCount: 1,
        },
        systemTableSnapshots: {
          nodes: [],
          partitions: [],
          services: [],
          tables: [],
          message_groups: [],
          replica_operations: [],
        },
      };
      service.seedNodeId = 'seed-node-1';
      service.seedNodeWsAddress = 'ws://localhost:8080';
    };
    service.phaseConnectWebSocket = async () => {
      phaseCalls.push('connect');
      service.messageRouter = {
        deliver: async () => ({acknowledged: true}),
      };
      service.controlPlaneTargetAddress = 'seed-node-1/message-group/mg-1-r0';
    };
    service.phaseCreateSelfHostedMessageGroup = async () => {
      phaseCalls.push('message-group');
      service.messageGroupServices.set('mg-1-r0', {
        groupId: 'mg-1',
        unifiedAddress: 'joining-node-auto-resume-1/message-group/mg-1-r0',
        isLeaderReplica: () => true,
        getLeaderId: () => 'mg-1-r0',
      });
    };
    service.phaseJoinExistingMessageGroup = async () => {};
    service.phaseWaitForLeadership = async () => {
      phaseCalls.push('leadership');
    };
    service.createCdcIntegrationService = () => {
      phaseCalls.push('cdc');
      service.cdcIntegrationService = {
        ready: true,
        updateSystemTableRow: async () => ({success: true}),
      };
      return service.cdcIntegrationService;
    };
    service.ensureLatencyTopologyOwners = () => {
      phaseCalls.push('latency-owners');
      service.latencyTopology = {ready: true};
    };
    service.initializeReplicaHandler = () => {
      phaseCalls.push('replica-handler');
    };
    service.initializeMessageGroupServiceHandler = () => {
      phaseCalls.push('message-group-handler');
    };
    service.initializeControlPlaneService = async () => {
      phaseCalls.push('control-plane');
      service.heartbeatService = {ready: true};
    };
    service.initializeRuntimeServiceHandler = () => {
      phaseCalls.push('runtime-handler');
    };
    service.phaseQuerySystemState = async () => {
      phaseCalls.push('query');
      queryAttempts += 1;
      if (queryAttempts === 1) {
        const error = new Error('Connection to node seed-node-1 closed');
        error.retryAfterMs = 15;
        throw error;
      }
    };
    service.joinReadinessEvaluator
      .waitForCanonicalJoinReadinessConvergence = async () => {
        phaseCalls.push('readiness');
      };
    service.activateMessageGroupServiceRows = async () => {
      phaseCalls.push('activate-message-group-rows');
    };
    service.signalReadyForReplicas = async () => {
      phaseCalls.push('ready-signal');
    };
    service.activateControlPlaneBackgroundWriters = () => {
      phaseCalls.push('activate');
    };
    service.startLatencyTopologyLifecycle = () => {
      phaseCalls.push('latency-start');
    };

    const result = await service.join();

    t.equal(result.success, true, 'join should succeed after one retryable auto-resume');
    t.same(
      sleepCalls,
      [15],
      'auto-resume should honor retryAfterMs before retrying',
    );
    t.equal(
      phaseCalls.filter((step) => step === 'contact').length,
      1,
      'auto-resume should keep the same session and skip completed checkpoints',
    );
    t.equal(
      phaseCalls.filter((step) => step === 'query').length,
      2,
      'auto-resume should rerun the failed membership checkpoint',
    );
  });

test(
  'NodeJoiningService - does not transition READY when canonical join readiness has ' +
    'unknown schema version',
  async (t) => {
    initializeTestEnvironment();

    const service = new NodeJoiningService({
      nodeId: 'joining-node-join-gate-1',
      nodeAddress: 'ws://localhost:9090',
      seedNodeAddress: 'http://localhost:8080',
      config: {
        joinReadinessTimeoutMs: 40,
        joinReadinessPollIntervalMs: 5,
      },
    });

    service.phaseContactSeed = async () => {
      service.bootstrapResponse = {
        success: true,
        seedNodeId: 'seed-node-1',
        seedNodeWsAddress: 'ws://localhost:8080',
        messageGroupAssignment: {
          strategy: AssignmentStrategy.CREATE_SELF_HOSTED,
          groupId: 'mg-1',
          replicaCount: 1,
        },
        systemTableSnapshots: {
          nodes: [],
          partitions: [],
          services: [],
          tables: [],
          message_groups: [],
          replica_operations: [],
        },
      };
      service.seedNodeId = 'seed-node-1';
      service.seedNodeWsAddress = 'ws://localhost:8080';
    };
    service.phaseConnectWebSocket = async () => {
      service.messageRouter = {
        deliver: async () => ({acknowledged: true}),
        isRegistered: (address) =>
          address === 'joining-node-join-gate-1/message-group/mg-join-r1',
      };
      service.controlPlaneTargetAddress = 'seed-node-1/message-group/mg-1-r0';
    };
    service.phaseCreateSelfHostedMessageGroup = async () => {
      service.messageGroupServices.set('mg-join-r1', {
        groupId: 'mg-1',
        unifiedAddress: 'joining-node-join-gate-1/message-group/mg-join-r1',
        isLeaderReplica: () => true,
        getLeaderId: () => 'mg-join-r1',
      });
    };
    service.phaseJoinExistingMessageGroup = async () => {};
    service.phaseWaitForLeadership = async () => {};
    service.initializeReplicaHandler = () => {};
    service.initializeMessageGroupServiceHandler = () => {
      service.messageGroupServiceHandler = {};
    };
    service.initializeControlPlaneService = async () => {};
    service.createCdcIntegrationService = () => {
      service.cdcIntegrationService = {
        upsertSystemTableRow: async () => ({success: true}),
        updateSystemTableRow: async () => ({success: true}),
      };
      return service.cdcIntegrationService;
    };
    service.ensureLatencyTopologyOwners = () => ({});
    service.rpcClient = {
      shutdown: async () => {},
    };
    service.initializeRuntimeServiceHandler = () => {};
    service.phaseQuerySystemState = async () => {
      NodeService.getInstance().getSystemTableCache()
        .applySystemTableChange(TABLES.SERVICE_ENDPOINTS, 'INSERT', {
          endpoint_id: `postgres-wire-endpoint-${service.nodeId}`,
          service_id: META_SERVICE_ID.POSTGRES_WIRE,
          node_id: service.nodeId,
          protocol: 'tcp',
          address: service.nodeId,
          port: 5432,
          metadata: '{}',
        });
    };
    service.signalReadyForReplicas = async () => {};
    service.activateMessageGroupServiceRows = async () => {};
    service.systemCacheHydrated = true;
    service.joinReadinessSnapshotProvider = async () => {
      return {
        routingReady: true,
        topologyReady: true,
        requiredSchemaVersion: '1740589945123:7:seed-1',
        appliedSchemaVersion: null,
      };
    };

    const result = await service.join();
    t.equal(
      result.success,
      false,
      'join should fail when canonical schema version is unknown',
    );
    t.match(
      result.error,
      /schema_version_unknown/i,
      'failure should classify schema version unknown',
    );
  },
);

test('NodeJoiningService - canonical join readiness reason classification is deterministic',
  async (t) => {
    initializeTestEnvironment();

    const service = new NodeJoiningService({
      nodeId: 'joining-node-join-gate-2',
      nodeAddress: 'ws://localhost:9090',
      seedNodeAddress: 'http://localhost:8080',
    });

    const reasons = service.joinReadinessEvaluator
      .classifyCanonicalJoinReadinessReasons({
      routingReady: false,
      topologyReady: false,
      requiredSchemaVersion: '1740589945123:7:seed-1',
      appliedSchemaVersion: null,
    });

    t.same(
      reasons,
      ['routing_not_ready', 'schema_version_unknown', 'topology_not_ready'],
      'classification should use stable precedence for canonical reasons',
    );
  });

test('NodeJoiningService - canonical readiness accepts local kernel ingress',
  async (t) => {
    initializeTestEnvironment();

    const service = new NodeJoiningService({
      nodeId: 'joining-node-local-ingress',
      nodeAddress: 'ws://localhost:9090',
      seedNodeAddress: 'http://localhost:8080',
    });
    service.bootstrapResponse = {
      messageGroupAssignment: {
        groupId: 'mg-1',
        peerAddresses: ['seed-node/message-group/mg-1-r1'],
      },
    };
    service.messageRouter = {
      getConnectionState() {
        return STATE.DISCONNECTED;
      },
    };
    service.messageGroupServices.set('mg-local-r1', {
      groupId: 'mg-1',
      unifiedAddress:
        'joining-node-local-ingress/message-group/mg-local-r1',
      isLeaderReplica: () => true,
      isMetadataIngressReady: () => true,
    });

    const snapshot = service.joinReadinessEvaluator
      .buildCanonicalJoinReadinessSnapshot({
        systemTableCache: new SystemTableCache(),
        tableName: TABLES.SERVICES,
      });

    t.equal(
      snapshot.controlPlaneTargetAddress,
      'joining-node-local-ingress/message-group/mg-local-r1',
      'local kernel ingress should be preferred for readiness checks',
    );
    t.equal(
      snapshot.routingReady,
      true,
      'local control-plane ingress should satisfy routing readiness',
    );
  },
);

test('NodeJoiningService - canonical readiness snapshot tracks active required node IDs',
  async (t) => {
    initializeTestEnvironment();

    const service = new NodeJoiningService({
      nodeId: 'joining-node-required-node-ids',
      nodeAddress: 'ws://localhost:9090',
      seedNodeAddress: 'http://localhost:8080',
    });
    const cache = new SystemTableCache();

    cache.applySystemTableChange(TABLES.NODES, CDC_OPERATION.UPSERT, {
      [COLUMN.NODE_ID]: 'seed-node',
      [COLUMN.STATUS]: 'active',
    });
    cache.applySystemTableChange(TABLES.NODES, CDC_OPERATION.UPSERT, {
      [COLUMN.NODE_ID]: 'joining-node-required-node-ids',
      [COLUMN.STATUS]: 'active',
    });

    const snapshot = service.joinReadinessEvaluator
      .buildCanonicalJoinReadinessSnapshot({
        systemTableCache: cache,
        tableName: TABLES.SERVICES,
      });

    t.same(
      snapshot.requiredNodeIds.sort(),
      ['joining-node-required-node-ids', 'seed-node'],
      'canonical readiness snapshot should retain active node diagnostics',
    );
  });

test('NodeJoiningService - canonical readiness snapshot uses bootstrap topology metadata when cache is incomplete',
  async (t) => {
    initializeTestEnvironment();

    const service = new NodeJoiningService({
      nodeId: 'joining-node-topology-meta',
      nodeAddress: 'ws://localhost:9090',
      seedNodeAddress: 'http://localhost:8080',
    });
    service.bootstrapResponse = {
      currentEpoch: {
        epoch: 7,
        assignments: {},
        proposedBy: 'seed-node',
        timestamp: '1740000000000:1:seed-node',
      },
      topologySnapshotMeta: {
        topologyEpoch: 7,
        activeNodeIds: ['seed-node', 'joining-node-topology-meta'],
        hydrationTables: CACHE_HYDRATION_TABLES,
        tableRowCounts: {
          [TABLES.NODES]: 2,
        },
      },
      systemTableSnapshots: {
        nodes: [
          {[COLUMN.NODE_ID]: 'seed-node', [COLUMN.STATUS]: 'active'},
          {[COLUMN.NODE_ID]: 'joining-node-topology-meta', [COLUMN.STATUS]: 'active'},
        ],
      },
    };

    const snapshot = service.joinReadinessEvaluator
      .buildCanonicalJoinReadinessSnapshot({
        systemTableCache: new SystemTableCache(),
        tableName: TABLES.SERVICES,
      });

    t.same(
      snapshot.requiredNodeIds.sort(),
      ['joining-node-topology-meta', 'seed-node'],
      'required-node diagnostics should fall back to bootstrap topology metadata',
    );
    t.equal(
      snapshot.topologySnapshotEpoch,
      7,
      'snapshot diagnostics should include the bootstrap topology epoch',
    );
    t.equal(
      snapshot.appliedTopologyEpoch,
      0,
      'snapshot diagnostics should include the locally applied topology epoch',
    );
  });

test('NodeJoiningService - canonical join timeout preserves topology diagnostics',
  async (t) => {
    initializeTestEnvironment();

    let now = 0;
    const errorEvents = [];
    const service = new NodeJoiningService({
      nodeId: 'joining-node-join-gate-3',
      nodeAddress: 'ws://localhost:9090',
      seedNodeAddress: 'http://localhost:8080',
      now: () => now,
      sleep: async (delayMs = 0) => {
        now += delayMs;
      },
      config: {
        joinReadinessTimeoutMs: 20,
        joinReadinessPollIntervalMs: 5,
      },
    });
    service.systemCacheHydrated = true;
    service.logger = {
      debug() {},
      info() {},
      warn() {},
      error(message, context) {
        errorEvents.push({message, context});
      },
    };
    service.joinReadinessSnapshotProvider = async () => ({
      routingReady: true,
      topologyReady: false,
      requiredSchemaVersion: '1740589945123:7:seed-1',
      appliedSchemaVersion: '1740589945123:7:seed-1',
      missingLeaders: {
        [TABLES.NODE_ENDPOINTS]: ['seed-node'],
      },
      inFlightReplicaOperations: 1,
      inFlightReplicaOperationDetails: [{
        operationId: 'op-1',
        type: 'MOVE_REPLICA',
        partitionId: 'services-p1',
        replicaId: 'services-p1-r2',
        sourceNodeId: 'seed-node',
        targetNodeId: 'joining-node-join-gate-3',
        status: 'pending',
        workflowStep: 'ASSIGNED',
        completedAt: null,
      }],
      missingNodeEndpointNodeIds: ['joining-node-join-gate-3'],
      missingPostgresWireNodeIds: ['seed-node'],
    });

    let thrownError = null;
    try {
      await service.joinReadinessEvaluator
        .waitForCanonicalJoinReadinessConvergence();
    } catch (error) {
      thrownError = error;
    }

    t.equal(thrownError?.code, 'JOIN_READINESS_TIMEOUT',
      'timeout should surface the canonical join readiness error code');
    t.same(
      thrownError?.joinReadiness?.missingNodeEndpointNodeIds,
      ['joining-node-join-gate-3'],
      'timeout should retain missing websocket endpoint diagnostics',
    );
    t.same(
      thrownError?.joinReadiness?.missingPostgresWireNodeIds,
      ['seed-node'],
      'timeout should retain missing postgres-wire diagnostics',
    );
    t.equal(
      thrownError?.joinReadiness?.inFlightReplicaOperations,
      1,
      'timeout should retain in-flight replica operation counts',
    );
    t.equal(
      thrownError?.joinReadiness?.timeoutKind,
      'no_progress',
      'timeout should classify stagnant readiness as no_progress',
    );
    t.same(
      thrownError?.joinReadiness?.inFlightReplicaOperationDetails,
      [{
        operationId: 'op-1',
        type: 'MOVE_REPLICA',
        partitionId: 'services-p1',
        replicaId: 'services-p1-r2',
        sourceNodeId: 'seed-node',
        targetNodeId: 'joining-node-join-gate-3',
        status: 'pending',
        workflowStep: 'ASSIGNED',
        completedAt: null,
      }],
      'timeout should retain in-flight replica operation details',
    );
    t.same(
      errorEvents.at(-1)?.context?.missingNodeEndpointNodeIds,
      ['joining-node-join-gate-3'],
      'timeout log should include missing websocket endpoint diagnostics',
    );
    t.same(
      errorEvents.at(-1)?.context?.missingPostgresWireNodeIds,
      ['seed-node'],
      'timeout log should include missing postgres-wire diagnostics',
    );
    t.equal(
      errorEvents.at(-1)?.context?.timeoutKind,
      'no_progress',
      'timeout log should classify stagnant readiness explicitly',
    );
  });

test('NodeJoiningService - canonical readiness blocked log includes control-plane diagnostics',
  async (t) => {
    initializeTestEnvironment();

    let now = 0;
    const warnEvents = [];
    const service = new NodeJoiningService({
      nodeId: 'joining-node-join-gate-blocked',
      nodeAddress: 'ws://localhost:9090',
      seedNodeAddress: 'http://localhost:8080',
      now: () => now,
      sleep: async (delayMs = 0) => {
        now += delayMs;
      },
      config: {
        joinReadinessTimeoutMs: 6,
        joinReadinessPollIntervalMs: 2,
      },
    });
    service.systemCacheHydrated = true;
    service.logger = {
      debug() {},
      info() {},
      warn(message, context) {
        warnEvents.push({message, context});
      },
      error() {},
    };
    service.joinReadinessSnapshotProvider = async () => ({
      routingReady: false,
      topologyReady: false,
      requiredSchemaVersion: '1740589945123:7:seed-1',
      appliedSchemaVersion: '1740589945123:7:seed-1',
      missingNodeEndpointNodeIds: ['joining-node-join-gate-blocked'],
      missingPostgresWireNodeIds: ['seed-node'],
      controlPlaneTargetAddress: 'seed-node/message-group/mg-1-r1',
      controlPlaneTargetCandidates: [
        'joining-node-join-gate-blocked/message-group/mg-local-r1',
        'seed-node/message-group/mg-1-r1',
      ],
      controlPlaneTargetConnectionStates: {
        'joining-node-join-gate-blocked/message-group/mg-local-r1': 'self',
        'seed-node/message-group/mg-1-r1': STATE.DISCONNECTED,
      },
    });

    try {
      await service.joinReadinessEvaluator
        .waitForCanonicalJoinReadinessConvergence();
    } catch (_error) {
      // Expected timeout for the blocked readiness snapshot.
    }

    t.equal(
      warnEvents[0]?.message,
      JOINING_LOG_MSG.CANONICAL_READINESS_BLOCKED,
      'blocked canonical readiness should emit a progress log',
    );
    t.same(
      warnEvents[0]?.context?.reasons,
      ['routing_not_ready', 'topology_not_ready'],
      'blocked progress log should classify the current readiness reasons',
    );
    t.equal(
      warnEvents[0]?.context?.controlPlaneTargetAddress,
      'seed-node/message-group/mg-1-r1',
      'blocked progress log should include the selected control-plane target',
    );
    t.same(
      warnEvents[0]?.context?.controlPlaneTargetCandidates,
      [
        'joining-node-join-gate-blocked/message-group/mg-local-r1',
        'seed-node/message-group/mg-1-r1',
      ],
      'blocked progress log should include all target candidates',
    );
  });

test('NodeJoiningService - canonical readiness treats self target as unreachable until local query transport is ready',
  async (t) => {
    initializeTestEnvironment();

    const service = new NodeJoiningService({
      nodeId: 'joining-node-self-transport-gate',
      nodeAddress: 'ws://localhost:9090',
      seedNodeAddress: 'http://localhost:8080',
    });

    service.messageRouter = {
      getQueryDataPlaneTransportReadiness() {
        return {
          ready: false,
          state: 'deferred',
          reason: 'Query/data-plane message-group transport is not configured',
          retryAfterMs: 100,
        };
      },
    };

    t.equal(
      service.joinReadinessEvaluator.isControlPlaneAddressReachable(
        'joining-node-self-transport-gate/message-group/mg-local-r1',
      ),
      false,
      'self target should stay ineligible while local query transport is deferred',
    );

    service.messageRouter.getQueryDataPlaneTransportReadiness = () => ({
      ready: true,
      state: 'ready',
    });

    t.equal(
      service.joinReadinessEvaluator.isControlPlaneAddressReachable(
        'joining-node-self-transport-gate/message-group/mg-local-r1',
      ),
      true,
      'self target should become reachable once local query transport is ready',
    );
    t.same(
      service.joinReadinessEvaluator.resolveControlPlaneTargetConnectionStates([
        'joining-node-self-transport-gate/message-group/mg-local-r1',
      ]),
      {
        'joining-node-self-transport-gate/message-group/mg-local-r1': 'self',
      },
      'diagnostics should report self once the local query transport is ready',
    );
  });

test('NodeJoiningService - canonical join readiness repairs endpoint visibility',
  async (t) => {
    initializeTestEnvironment();

    const service = new NodeJoiningService({
      nodeId: 'joining-node-join-gate-repair',
      nodeAddress: 'ws://localhost:9090',
      seedNodeAddress: 'http://localhost:8080',
      sleep: async () => {},
      config: {
        joinReadinessTimeoutMs: 20,
        joinReadinessPollIntervalMs: 1,
      },
    });
    const cache = new SystemTableCache();
    const repairCalls = [];

    service.systemCacheHydrated = true;
    service.cdcIntegrationService = {sqlQueryEngine: {}};
    service.getMissingSystemServiceLeaders = () => ({});
    service.getBlockingSystemServiceLeaders = (missing) => missing;
    service.joinReadinessSnapshotProvider = async () => {
      return {
        ...service.joinReadinessEvaluator
          .buildCanonicalJoinReadinessSnapshot({systemTableCache: cache}),
        routingReady: true,
        requiredSchemaVersion: '1740589945123:7:seed-1',
        appliedSchemaVersion: '1740589945123:7:seed-1',
      };
    };
    service.backfillPropagatedCacheTablesFromAuthoritativeState = async (tableNames) => {
      repairCalls.push(Array.isArray(tableNames) ? [...tableNames] : []);
      cache.applySystemTableChange(TABLES.SERVICE_ENDPOINTS, CDC_OPERATION.UPSERT, {
        [COLUMN.ENDPOINT_ID]: 'sys-postgres-wire-ep-joining-node-join-gate-repair',
        [COLUMN.SERVICE_ID]: META_SERVICE_ID.POSTGRES_WIRE,
        [COLUMN.NODE_ID]: 'joining-node-join-gate-repair',
        health_status: 'healthy',
        [COLUMN.UPDATED_AT]: 3,
      });
    };

    cache.applySystemTableChange(TABLES.NODES, CDC_OPERATION.UPSERT, {
      [COLUMN.NODE_ID]: 'seed-node',
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    });
    cache.applySystemTableChange(TABLES.NODES, CDC_OPERATION.UPSERT, {
      [COLUMN.NODE_ID]: 'joining-node-join-gate-repair',
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    });
    cache.applySystemTableChange(TABLES.NODE_ENDPOINTS, CDC_OPERATION.UPSERT, {
      [COLUMN.ENDPOINT_ID]: 'ep-joining-node-join-gate-repair-ws',
      [COLUMN.NODE_ID]: 'joining-node-join-gate-repair',
      [COLUMN.TRANSPORT_TYPE]: TRANSPORT_TYPE.WEBSOCKET,
      [COLUMN.STATUS]: ENDPOINT_STATUS.ACTIVE,
      [COLUMN.UPDATED_AT]: 2,
    });

    await service.joinReadinessEvaluator
      .waitForCanonicalJoinReadinessConvergence();

    t.equal(
      repairCalls.length,
      1,
      'canonical readiness should trigger one authoritative repair backfill',
    );
    t.ok(
      repairCalls[0].includes(TABLES.SERVICE_ENDPOINTS),
      'repair backfill should refresh service_endpoints visibility',
    );
    t.ok(
      repairCalls[0].includes(TABLES.NODE_ENDPOINTS),
      'repair backfill should include discovery-critical node endpoints',
    );
  });

test('NodeJoiningService - canonical join readiness snapshot waits for endpoint visibility',
  async (t) => {
    initializeTestEnvironment();

    const service = new NodeJoiningService({
      nodeId: 'joining-node-endpoint-gate',
      nodeAddress: 'ws://localhost:9090',
      seedNodeAddress: 'http://localhost:8080',
    });
    const cache = new SystemTableCache();

    service.getMissingSystemServiceLeaders = () => ({});
    service.getBlockingSystemServiceLeaders = (missing) => missing;

    cache.applySystemTableChange(TABLES.NODES, CDC_OPERATION.UPSERT, {
      [COLUMN.NODE_ID]: 'seed-node',
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    });
    cache.applySystemTableChange(TABLES.NODES, CDC_OPERATION.UPSERT, {
      [COLUMN.NODE_ID]: 'joining-node-endpoint-gate',
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    });

    let snapshot = service.joinReadinessEvaluator
      .buildCanonicalJoinReadinessSnapshot({systemTableCache: cache});
    t.equal(snapshot.topologyReady, false, 'topology should fail closed without endpoints');
    t.same(
      snapshot.missingNodeEndpointNodeIds,
      ['joining-node-endpoint-gate'],
      'topology should require websocket node endpoints for the joining node',
    );
    t.same(
      snapshot.missingPostgresWireNodeIds,
      ['joining-node-endpoint-gate'],
      'topology should require postgres-wire endpoints for the joining node',
    );

    cache.applySystemTableChange(TABLES.NODE_ENDPOINTS, CDC_OPERATION.UPSERT, {
      [COLUMN.ENDPOINT_ID]: 'ep-joining-node-endpoint-gate-ws',
      [COLUMN.NODE_ID]: 'joining-node-endpoint-gate',
      [COLUMN.TRANSPORT_TYPE]: TRANSPORT_TYPE.WEBSOCKET,
      [COLUMN.STATUS]: ENDPOINT_STATUS.ACTIVE,
    });

    snapshot = service.joinReadinessEvaluator
      .buildCanonicalJoinReadinessSnapshot({systemTableCache: cache});
    t.equal(snapshot.topologyReady, false, 'topology should wait for every active postgres endpoint');
    t.same(
      snapshot.missingPostgresWireNodeIds,
      ['joining-node-endpoint-gate'],
      'topology should identify nodes missing postgres-wire visibility',
    );

    cache.applySystemTableChange(TABLES.SERVICE_ENDPOINTS, CDC_OPERATION.UPSERT, {
      [COLUMN.ENDPOINT_ID]: 'sys-postgres-wire-ep-joining-node-endpoint-gate',
      [COLUMN.SERVICE_ID]: META_SERVICE_ID.POSTGRES_WIRE,
      [COLUMN.NODE_ID]: 'joining-node-endpoint-gate',
      health_status: 'healthy',
    });

    snapshot = service.joinReadinessEvaluator
      .buildCanonicalJoinReadinessSnapshot({systemTableCache: cache});
    t.equal(snapshot.topologyReady, true, 'topology should become ready once endpoint visibility converges');
  });

test('NodeJoiningService - authoritative cache backfill closes the CDC blind window',
  async (t) => {
    initializeTestEnvironment();

    const cache = new SystemTableCache();
    const originalGetNodeService = NodeService.getInstance;
    const queriedTables = [];

    try {
      NodeService.getInstance = () => ({
        getSystemTableCache() {
          return cache;
        },
      });

      const service = new NodeJoiningService({
        nodeId: 'joining-node-backfill-gate',
        nodeAddress: 'ws://localhost:9090',
        seedNodeAddress: 'http://localhost:8080',
      });
      service.getMissingSystemServiceLeaders = () => ({});
      service.getBlockingSystemServiceLeaders = (missing) => missing;

      cache.applySystemTableChange(TABLES.NODES, CDC_OPERATION.UPSERT, {
        [COLUMN.NODE_ID]: 'seed-node',
        [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      });
      cache.applySystemTableChange(TABLES.NODES, CDC_OPERATION.UPSERT, {
        [COLUMN.NODE_ID]: 'joining-node-backfill-gate',
        [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      });
      cache.applySystemTableChange(TABLES.NODE_ENDPOINTS, CDC_OPERATION.UPSERT, {
        [COLUMN.ENDPOINT_ID]: 'ep-seed-node-ws',
        [COLUMN.NODE_ID]: 'seed-node',
        [COLUMN.TRANSPORT_TYPE]: TRANSPORT_TYPE.WEBSOCKET,
        [COLUMN.STATUS]: ENDPOINT_STATUS.ACTIVE,
        [COLUMN.UPDATED_AT]: 2,
      });
      cache.applySystemTableChange(TABLES.SERVICE_ENDPOINTS, CDC_OPERATION.UPSERT, {
        [COLUMN.ENDPOINT_ID]: 'sys-postgres-wire-ep-seed-node',
        [COLUMN.SERVICE_ID]: META_SERVICE_ID.POSTGRES_WIRE,
        [COLUMN.NODE_ID]: 'seed-node',
        health_status: 'healthy',
        [COLUMN.UPDATED_AT]: 2,
      });

      service.cdcIntegrationService = {
        sqlQueryEngine: {
          executeQuery: async (sql) => {
            const tableName = sql.replace(/^SELECT \* FROM /, '');
            queriedTables.push(tableName);
            switch (tableName) {
            case TABLES.NODES:
              return {
                success: true,
                rows: cache.getAll(TABLES.NODES),
              };
            case TABLES.NODE_ENDPOINTS:
              return {
                success: true,
                rows: [
                  ...cache.getAll(TABLES.NODE_ENDPOINTS),
                  {
                    [COLUMN.ENDPOINT_ID]: 'ep-joining-node-backfill-gate-ws',
                    [COLUMN.NODE_ID]: 'joining-node-backfill-gate',
                    [COLUMN.TRANSPORT_TYPE]: TRANSPORT_TYPE.WEBSOCKET,
                    [COLUMN.STATUS]: ENDPOINT_STATUS.ACTIVE,
                    [COLUMN.UPDATED_AT]: 3,
                  },
                ],
              };
            case TABLES.SERVICE_ENDPOINTS:
              return {
                success: true,
                rows: [
                  ...cache.getAll(TABLES.SERVICE_ENDPOINTS),
                  {
                    [COLUMN.ENDPOINT_ID]: 'sys-postgres-wire-ep-joining-node-backfill-gate',
                    [COLUMN.SERVICE_ID]: META_SERVICE_ID.POSTGRES_WIRE,
                    [COLUMN.NODE_ID]: 'joining-node-backfill-gate',
                    health_status: 'healthy',
                    [COLUMN.UPDATED_AT]: 3,
                  },
                ],
              };
            default:
              return {success: true, rows: []};
            }
          },
        },
      };

      let snapshot = service.joinReadinessEvaluator
        .buildCanonicalJoinReadinessSnapshot({systemTableCache: cache});
      t.equal(snapshot.topologyReady, false,
        'topology should fail before authoritative backfill restores missed rows');
      t.same(
        snapshot.missingNodeEndpointNodeIds,
        ['joining-node-backfill-gate'],
        'joining node websocket endpoint should be missing before backfill',
      );
      t.same(
        snapshot.missingPostgresWireNodeIds,
        ['joining-node-backfill-gate'],
        'joining node postgres-wire endpoint should be missing before backfill',
      );

      await service.backfillPropagatedCacheTablesFromAuthoritativeState();

      snapshot = service.joinReadinessEvaluator
        .buildCanonicalJoinReadinessSnapshot({systemTableCache: cache});
      t.equal(snapshot.topologyReady, true,
        'topology should converge after authoritative backfill restores missed rows');
      t.ok(
        queriedTables.includes(TABLES.NODE_ENDPOINTS),
        'backfill should query node_endpoints authoritatively',
      );
      t.ok(
        queriedTables.includes(TABLES.SERVICE_ENDPOINTS),
        'backfill should query service_endpoints authoritatively',
      );
    } finally {
      NodeService.getInstance = originalGetNodeService;
    }
  });

test('NodeJoiningService - authoritative backfill merges divergent replica snapshots',
  async (t) => {
    initializeTestEnvironment();

    const cache = new SystemTableCache();
    const originalGetNodeService = NodeService.getInstance;

    try {
      NodeService.getInstance = () => ({
        getSystemTableCache() {
          return cache;
        },
      });

      const service = new NodeJoiningService({
        nodeId: 'joining-node-replica-merge',
        nodeAddress: 'ws://localhost:9090',
        seedNodeAddress: 'http://localhost:8080',
      });

      const incompleteSeedRows = [
        {
          [COLUMN.ENDPOINT_ID]: 'sys-postgres-wire-ep-joining-node-replica-merge',
          [COLUMN.SERVICE_ID]: META_SERVICE_ID.POSTGRES_WIRE,
          [COLUMN.NODE_ID]: 'joining-node-replica-merge',
          health_status: 'healthy',
          [COLUMN.UPDATED_AT]: 10,
        },
      ];
      const replicaRowsA = [
        ...incompleteSeedRows,
        {
          [COLUMN.ENDPOINT_ID]: 'sys-postgres-wire-ep-seed-node',
          [COLUMN.SERVICE_ID]: META_SERVICE_ID.POSTGRES_WIRE,
          [COLUMN.NODE_ID]: 'seed-node',
          health_status: 'healthy',
          [COLUMN.UPDATED_AT]: 11,
        },
      ];
      const replicaRowsB = [
        ...incompleteSeedRows,
        {
          [COLUMN.ENDPOINT_ID]: 'sys-postgres-wire-ep-peer-node',
          [COLUMN.SERVICE_ID]: META_SERVICE_ID.POSTGRES_WIRE,
          [COLUMN.NODE_ID]: 'peer-node',
          health_status: 'healthy',
          [COLUMN.UPDATED_AT]: 12,
        },
      ];

      service.messageRouter = {
        async deliver(address, payload) {
          t.equal(payload.type, 'QUERY', 'replica fanout should issue partition queries');
          t.equal(
            payload.sql,
            `SELECT * FROM ${TABLES.SERVICE_ENDPOINTS}`,
            'replica fanout should query the propagated table directly',
          );
          if (address === 'seed/partition/service_endpoints-p1-r1') {
            return {
              acknowledged: true,
              success: true,
              rows: replicaRowsA,
            };
          }
          if (address === 'seed/partition/service_endpoints-p1-r2') {
            return {
              acknowledged: true,
              success: true,
              rows: replicaRowsB,
            };
          }
          throw new Error(`unexpected address ${address}`);
        },
      };

      service.cdcIntegrationService = {
        sqlQueryEngine: {
          async executeQuery(sql) {
            if (sql === `SELECT * FROM ${TABLES.SERVICE_ENDPOINTS}`) {
              return {
                success: true,
                rows: incompleteSeedRows,
              };
            }
            return {success: true, rows: []};
          },
          getTablePartitions(tableName) {
            if (tableName === TABLES.SERVICE_ENDPOINTS) {
              return [{partition_id: 'service_endpoints-p1'}];
            }
            return [];
          },
          queryExecutor: {
            getRoutablePartitionServices(partitionId) {
              if (partitionId !== 'service_endpoints-p1') {
                return [];
              }
              return [
                {
                  service_id: 'service_endpoints-p1-r1',
                  partition_id: partitionId,
                  service_type: SERVICE_TYPE.PARTITION,
                  status: SERVICE_STATUS.ACTIVE,
                  address: 'seed/partition/service_endpoints-p1-r1',
                },
                {
                  service_id: 'service_endpoints-p1-r2',
                  partition_id: partitionId,
                  service_type: SERVICE_TYPE.PARTITION,
                  status: SERVICE_STATUS.ACTIVE,
                  address: 'seed/partition/service_endpoints-p1-r2',
                },
              ];
            },
          },
        },
      };

      await service.backfillPropagatedCacheTablesFromAuthoritativeState();

      const endpointRows = cache.getAll(TABLES.SERVICE_ENDPOINTS);
      t.same(
        endpointRows
          .filter((row) => row.service_id === META_SERVICE_ID.POSTGRES_WIRE)
          .map((row) => row.node_id)
          .sort(),
        ['joining-node-replica-merge', 'peer-node', 'seed-node'],
        'replica fanout merge should recover rows hidden by a stale routed read',
      );
    } finally {
      NodeService.getInstance = originalGetNodeService;
    }
  });

test('NodeJoiningService - authoritative backfill canonicalizes ' +
  'control-plane publication rows before cache apply',
async (t) => {
  initializeTestEnvironment();

  const cache = new SystemTableCache();
  const originalGetNodeService = NodeService.getInstance;

  try {
    NodeService.getInstance = () => ({
      getSystemTableCache() {
        return cache;
      },
    });

    const service = new NodeJoiningService({
      nodeId: 'joining-node-publication-backfill',
      nodeAddress: 'ws://localhost:9090',
      seedNodeAddress: 'http://localhost:8080',
    });

    service.cdcIntegrationService = {
      sqlQueryEngine: {
        async executeQuery(sql) {
          if (sql === `SELECT * FROM ${TABLES.CONTROL_PLANE_PUBLICATIONS}`) {
            return {
              success: true,
              rows: [{
                publicationId: 'publication-backfill-1',
                publicationKind: 'cluster_membership',
                publicationEpoch: 9,
                publisherNodeId: 'seed-node',
                publishedActiveNodeIds: ['node-a', 'node-b'],
                requiredAckNodeIds: ['node-a', 'node-b'],
                acknowledgedNodeIds: ['node-a'],
                status: 'ack_pending',
                updatedAt: 25,
              }],
            };
          }
          return {success: true, rows: []};
        },
        getTablePartitions() {
          return [];
        },
        queryExecutor: {},
      },
    };

    await service.backfillPropagatedCacheTablesFromAuthoritativeState([
      TABLES.CONTROL_PLANE_PUBLICATIONS,
    ]);

    t.same(
      cache.getAll(TABLES.CONTROL_PLANE_PUBLICATIONS),
      [{
        publication_id: 'publication-backfill-1',
        publication_kind: 'cluster_membership',
        publication_epoch: 9,
        publisher_node_id: 'seed-node',
        source_topology_epoch: null,
        source_snapshot_version: null,
        published_active_node_ids: ['node-a', 'node-b'],
        required_ack_node_ids: ['node-a', 'node-b'],
        acknowledged_node_ids: ['node-a'],
        priority_partition_summary: null,
        membership_lifecycle_summary: null,
        status: 'ACK_PENDING',
        reason_code: '',
        created_at: null,
        updated_at: 25,
        published_at: null,
        closed_at: null,
        transition_history: [],
      }],
      'authoritative backfill should persist publication rows in canonical cache shape',
    );
  } finally {
    NodeService.getInstance = originalGetNodeService;
  }
});

test(
  'NodeJoiningService - authoritative backfill preserves bootstrap snapshot rows',
  async (t) => {
    initializeTestEnvironment();

    const cache = new SystemTableCache();
    const originalGetNodeService = NodeService.getInstance;

    try {
      NodeService.getInstance = () => ({
        getSystemTableCache() {
          return cache;
        },
      });

      const service = new NodeJoiningService({
        nodeId: 'joining-node-bootstrap-snapshot',
        nodeAddress: 'ws://localhost:9090',
        seedNodeAddress: 'http://localhost:8080',
      });

      const bootstrapSnapshotRows = [
        {
          [COLUMN.ENDPOINT_ID]: 'sys-postgres-wire-ep-seed-node',
          [COLUMN.SERVICE_ID]: META_SERVICE_ID.POSTGRES_WIRE,
          [COLUMN.NODE_ID]: 'seed-node',
          health_status: 'healthy',
          [COLUMN.UPDATED_AT]: 10,
        },
        {
          [COLUMN.ENDPOINT_ID]: 'sys-postgres-wire-ep-peer-node',
          [COLUMN.SERVICE_ID]: META_SERVICE_ID.POSTGRES_WIRE,
          [COLUMN.NODE_ID]: 'peer-node',
          health_status: 'healthy',
          [COLUMN.UPDATED_AT]: 20,
        },
      ];
      service.bootstrapResponse = {
        systemTableSnapshots: {
          [TABLES.SERVICE_ENDPOINTS]: bootstrapSnapshotRows,
        },
      };
      service.cdcIntegrationService = {
        sqlQueryEngine: {
          async executeQuery(sql) {
            if (sql === `SELECT * FROM ${TABLES.SERVICE_ENDPOINTS}`) {
              return {
                success: true,
                rows: [bootstrapSnapshotRows[0]],
              };
            }
            return {success: true, rows: []};
          },
          getTablePartitions() {
            return [];
          },
          queryExecutor: {},
        },
      };

      await service.backfillPropagatedCacheTablesFromAuthoritativeState();

      const endpointRows = cache.getAll(TABLES.SERVICE_ENDPOINTS);
      t.same(
        endpointRows
          .filter((row) => row.service_id === META_SERVICE_ID.POSTGRES_WIRE)
          .map((row) => row.node_id)
          .sort(),
        ['peer-node', 'seed-node'],
        'bootstrap snapshot rows should survive a stale routed backfill query',
      );
    } finally {
      NodeService.getInstance = originalGetNodeService;
    }
  },
);

test(
  'NodeJoiningService - blocking authoritative backfill prefers bootstrap snapshot over immediate live reread',
  async (t) => {
    initializeTestEnvironment();

    const cache = new SystemTableCache();
    const originalGetNodeService = NodeService.getInstance;

    try {
      NodeService.getInstance = () => ({
        getSystemTableCache() {
          return cache;
        },
      });

      const service = new NodeJoiningService({
        nodeId: 'joining-node-snapshot-first',
        nodeAddress: 'ws://localhost:9090',
        seedNodeAddress: 'http://localhost:8080',
      });

      service.bootstrapResponse = {
        systemTableSnapshots: {
          [TABLES.SERVICE_ENDPOINTS]: [
            {
              [COLUMN.ENDPOINT_ID]: 'sys-postgres-wire-ep-seed-node',
              [COLUMN.SERVICE_ID]: META_SERVICE_ID.POSTGRES_WIRE,
              [COLUMN.NODE_ID]: 'seed-node',
              health_status: 'healthy',
              [COLUMN.UPDATED_AT]: 10,
            },
          ],
        },
      };

      let routedReadCount = 0;
      const replicaDeliveries = [];
      service.messageRouter = {
        getOutboundPressureSummary() {
          return {
            backpressured: false,
            saturatedNodeCount: 0,
            totalPending: 0,
            maxPendingUtilization: 0,
          };
        },
        async deliver(address, payload, options) {
          replicaDeliveries.push({address, payload, options});
          return {
            acknowledged: true,
            success: true,
            rows: [],
          };
        },
      };
      service.cdcIntegrationService = {
        sqlQueryEngine: {
          async executeQuery() {
            routedReadCount += 1;
            return {
              success: true,
              rows: [],
            };
          },
          getTablePartitions() {
            return [{partition_id: 'service_endpoints-p1'}];
          },
          queryExecutor: {
            getRoutablePartitionServices() {
              return [
                {
                  service_id: 'service_endpoints-p1-r1',
                  partition_id: 'service_endpoints-p1',
                  service_type: SERVICE_TYPE.PARTITION,
                  status: SERVICE_STATUS.ACTIVE,
                  address: 'seed/partition/service_endpoints-p1-r1',
                },
              ];
            },
          },
        },
      };

      await service.backfillPropagatedCacheTablesFromAuthoritativeState([
        TABLES.SERVICE_ENDPOINTS,
      ]);

      t.equal(
        routedReadCount,
        0,
        'blocking backfill should not immediately reread a table already covered by bootstrap snapshot',
      );
      t.equal(
        replicaDeliveries.length,
        0,
        'blocking backfill should not fan out to replicas when bootstrap snapshot already covers the table',
      );
    } finally {
      NodeService.getInstance = originalGetNodeService;
    }
  },
);

test('NodeJoiningService - authoritative backfill coalesces concurrent identical requests',
  async (t) => {
    initializeTestEnvironment();

    const cache = new SystemTableCache();
    const originalGetNodeService = NodeService.getInstance;

    try {
      NodeService.getInstance = () => ({
        getSystemTableCache() {
          return cache;
        },
      });

      const service = new NodeJoiningService({
        nodeId: 'joining-node-backfill-single-flight',
        nodeAddress: 'ws://localhost:9090',
        seedNodeAddress: 'http://localhost:8080',
      });

      let executeCount = 0;
      let releaseQuery = null;
      const queryGate = new Promise((resolve) => {
        releaseQuery = resolve;
      });
      service.cdcIntegrationService = {
        sqlQueryEngine: {
          async executeQuery(sql) {
            executeCount += 1;
            t.equal(
              sql,
              `SELECT * FROM ${TABLES.SERVICE_ENDPOINTS}`,
              'single-flight test should query the requested propagated table',
            );
            await queryGate;
            return {
              success: true,
              rows: [],
            };
          },
          getTablePartitions() {
            return [];
          },
          queryExecutor: {},
        },
      };

      const firstBackfill = service
        .backfillPropagatedCacheTablesFromAuthoritativeState([
          TABLES.SERVICE_ENDPOINTS,
        ]);
      const secondBackfill = service
        .backfillPropagatedCacheTablesFromAuthoritativeState([
          TABLES.SERVICE_ENDPOINTS,
        ]);

      await new Promise((resolve) => setTimeout(resolve, 0));

      t.equal(
        executeCount,
        1,
        'concurrent identical backfill requests should share one in-flight owner path',
      );

      releaseQuery();
      await Promise.all([firstBackfill, secondBackfill]);
    } finally {
      NodeService.getInstance = originalGetNodeService;
    }
  });

test('NodeJoiningService - blocking authoritative backfill uses critical delivery priority',
  async (t) => {
    initializeTestEnvironment();

    const cache = new SystemTableCache();
    const originalGetNodeService = NodeService.getInstance;

    try {
      NodeService.getInstance = () => ({
        getSystemTableCache() {
          return cache;
        },
      });

      const service = new NodeJoiningService({
        nodeId: 'joining-node-backfill-critical',
        nodeAddress: 'ws://localhost:9090',
        seedNodeAddress: 'http://localhost:8080',
      });

      const routedQueryOptions = [];
      const replicaDeliveries = [];
      service.messageRouter = {
        getOutboundPressureSummary() {
          return {
            backpressured: false,
            saturatedNodeCount: 0,
            totalPending: 0,
            maxPendingUtilization: 0,
          };
        },
        async deliver(address, payload, options) {
          replicaDeliveries.push({address, payload, options});
          return {
            acknowledged: true,
            success: true,
            rows: [],
          };
        },
      };
      service.cdcIntegrationService = {
        sqlQueryEngine: {
          async executeQuery(sql, params, options) {
            routedQueryOptions.push(options);
            if (sql === `SELECT * FROM ${TABLES.SERVICE_ENDPOINTS}`) {
              return {
                success: true,
                rows: [],
              };
            }
            return {success: true, rows: []};
          },
          getTablePartitions(tableName) {
            if (tableName === TABLES.SERVICE_ENDPOINTS) {
              return [{partition_id: 'service_endpoints-p1'}];
            }
            return [];
          },
          queryExecutor: {
            getRoutablePartitionServices(partitionId) {
              if (partitionId !== 'service_endpoints-p1') {
                return [];
              }
              return [
                {
                  service_id: 'service_endpoints-p1-r1',
                  partition_id: partitionId,
                  service_type: SERVICE_TYPE.PARTITION,
                  status: SERVICE_STATUS.ACTIVE,
                  address: 'seed/partition/service_endpoints-p1-r1',
                },
                {
                  service_id: 'service_endpoints-p1-r2',
                  partition_id: partitionId,
                  service_type: SERVICE_TYPE.PARTITION,
                  status: SERVICE_STATUS.ACTIVE,
                  address: 'seed/partition/service_endpoints-p1-r2',
                },
              ];
            },
          },
        },
      };

      await service.backfillPropagatedCacheTablesFromAuthoritativeState([
        TABLES.SERVICE_ENDPOINTS,
      ]);

      t.equal(
        routedQueryOptions[0]?.deliveryPriority,
        'critical',
        'blocking backfill should route the authoritative SQL read with critical delivery priority',
      );
      t.equal(
        routedQueryOptions[0]?.timeoutMs,
        30000,
        'blocking backfill should use the join leadership timeout budget for authoritative reads',
      );
      t.same(
        replicaDeliveries.map(({options}) => options?.deliveryPriority),
        ['critical', 'critical'],
        'blocking backfill replica fanout should use critical delivery priority',
      );
    } finally {
      NodeService.getInstance = originalGetNodeService;
    }
  });

test('NodeJoiningService - pressure-degraded backfill skips replica fanout',
  async (t) => {
    initializeTestEnvironment();

    const cache = new SystemTableCache();
    const originalGetNodeService = NodeService.getInstance;

    try {
      NodeService.getInstance = () => ({
        getSystemTableCache() {
          return cache;
        },
      });

      const service = new NodeJoiningService({
        nodeId: 'joining-node-backfill-pressure',
        nodeAddress: 'ws://localhost:9090',
        seedNodeAddress: 'http://localhost:8080',
      });

      const replicaDeliveries = [];
      service.messageRouter = {
        getOutboundPressureSummary() {
          return {
            backpressured: true,
            saturatedNodeCount: 1,
            totalPending: 48,
            maxPendingUtilization: 0.75,
          };
        },
        async deliver(address, payload, options) {
          replicaDeliveries.push({address, payload, options});
          return {
            acknowledged: true,
            success: true,
            rows: [],
          };
        },
      };
      service.cdcIntegrationService = {
        sqlQueryEngine: {
          async executeQuery(sql, params, options) {
            t.equal(
              options?.deliveryPriority,
              'critical',
              'pressure-degraded blocking backfill should keep the routed read on the critical lane',
            );
            return {
              success: true,
              rows: [],
            };
          },
          getTablePartitions(tableName) {
            if (tableName === TABLES.SERVICE_ENDPOINTS) {
              return [{partition_id: 'service_endpoints-p1'}];
            }
            return [];
          },
          queryExecutor: {
            getRoutablePartitionServices(partitionId) {
              if (partitionId !== 'service_endpoints-p1') {
                return [];
              }
              return [
                {
                  service_id: 'service_endpoints-p1-r1',
                  partition_id: partitionId,
                  service_type: SERVICE_TYPE.PARTITION,
                  status: SERVICE_STATUS.ACTIVE,
                  address: 'seed/partition/service_endpoints-p1-r1',
                },
                {
                  service_id: 'service_endpoints-p1-r2',
                  partition_id: partitionId,
                  service_type: SERVICE_TYPE.PARTITION,
                  status: SERVICE_STATUS.ACTIVE,
                  address: 'seed/partition/service_endpoints-p1-r2',
                },
              ];
            },
          },
        },
      };

      await service.backfillPropagatedCacheTablesFromAuthoritativeState([
        TABLES.SERVICE_ENDPOINTS,
      ]);

      t.equal(
        replicaDeliveries.length,
        0,
        'pressure-degraded authoritative backfill should avoid full replica fanout',
      );
    } finally {
      NodeService.getInstance = originalGetNodeService;
    }
  });

test('NodeJoiningService - registerNodeInCluster seeds local discovery-critical cache rows',
  async (t) => {
    initializeTestEnvironment();

    const cache = new SystemTableCache();
    const originalGetNodeService = NodeService.getInstance;

    try {
      NodeService.getInstance = () => ({
        getSystemTableCache() {
          return cache;
        },
      });

      const service = new NodeJoiningService({
        nodeId: 'join-cache-seed-node',
        nodeAddress: 'ws://localhost:9090',
        seedNodeAddress: 'http://localhost:8080',
        wsPort: 9090,
      });

      service.cdcIntegrationService = {
        upsertSystemTableRow: async () => ({success: true}),
        sqlQueryEngine: {},
      };
      service.getNodeStorageBudgetService = () => ({
        resolveBudgetRow: (nodeRow) => ({
          budgetRow: {
            ...nodeRow,
            [COLUMN.STORAGE_BUDGET_BYTES]: 1024,
            [COLUMN.STORAGE_BUDGET_SOURCE]: 'test',
          },
          resolution: {
            isValid: true,
            budgetBytes: 1024,
            source: 'test',
            diskBytes: 1024,
          },
        }),
      });
      service.sendControlPlaneNodeStateUpdate = async () => {
        throw new Error('legacy node-state owner path should not be used');
      };

      await service.registerNodeInCluster();

      t.ok(
        cache.get(TABLES.NODES, 'join-cache-seed-node'),
        'join should seed the local nodes cache row',
      );
      t.equal(
        cache.get(TABLES.NODES, 'join-cache-seed-node')?.[COLUMN.CONNECTION_STATE],
        STATE.CONNECTED,
        'join should seed the local nodes cache with the connected admission state',
      );
      t.ok(
        cache.get(TABLES.NODE_ENDPOINTS, 'ep-join-cache-seed-node-ws'),
        'join should seed the local node_endpoints cache row',
      );
      t.equal(service.hasPublishedLocalServiceEndpoints(), true,
        'join should expose local endpoint publication from cached service_endpoints rows');
      t.same(
        cache.filter(TABLES.SERVICE_ENDPOINTS, (row) =>
          row[COLUMN.NODE_ID] === 'join-cache-seed-node').map((row) =>
          row[COLUMN.SERVICE_ID]).sort(),
        [
          META_SERVICE_ID.ADMIN_META,
          META_SERVICE_ID.POSTGRES_WIRE,
          META_SERVICE_ID.WASM_META,
        ],
        'join should seed built-in service_endpoints in the local cache',
      );
    } finally {
      NodeService.getInstance = originalGetNodeService;
    }
  });

test('NodeJoiningService - full join with MOVE_REPLICA', async (t) => {
  initializeTestEnvironment();

  // Configure faster Raft elections for testing
  const config = ConfigurationManager.getInstance();
  config.config.raft = {
    ...config.config.raft,
    electionTimeoutMinMs: 25,
    electionTimeoutMaxMs: 50,
    heartbeatIntervalMs: 10,
  };

test('NodeJoiningService - activates message-group rows from cache-visible endpoint publication without phase flag truth',
  async (t) => {
    initializeTestEnvironment();

    const originalGetNodeService = NodeService.getInstance;
    const cache = new SystemTableCache();
    cache.applySystemTableChange(TABLES.SERVICE_ENDPOINTS, 'INSERT', {
      endpoint_id: 'postgres-wire-endpoint-join-activation-node',
      service_id: META_SERVICE_ID.POSTGRES_WIRE,
      node_id: 'join-activation-node',
      protocol: 'tcp',
      address: 'join-activation-node',
      port: 5432,
      metadata: '{}',
    });
    NodeService.getInstance = () => ({
      getSystemTableCache() {
        return cache;
      },
    });

    try {
      const service = new NodeJoiningService({
        nodeId: 'join-activation-node',
        nodeAddress: 'ws://localhost:9191',
        seedNodeAddress: 'ws://seed:8000',
      });
      const activated = [];

      service.messageGroupServiceHandler = {};
      service.messageRouter = {
        isRegistered: () => true,
      };
      service.messageGroupServices.set('mg-cache-r1', {
        groupId: 'mg-cache',
        unifiedAddress: 'join-activation-node/message-group/mg-cache-r1',
      });
      service.registerMessageGroupService = async (
        groupId,
        replicaId,
        replicaService,
        options,
      ) => {
        activated.push({groupId, replicaId, replicaService, options});
      };

      const activatedCount =
        await service.activateMessageGroupServiceRows();

      t.equal(activatedCount, 1,
        'activation should proceed once local service_endpoints rows are visible in cache');
      t.equal(activated.length, 1,
        'activation should register the visible replica');
      t.same(activated[0]?.options, {status: SERVICE_STATUS.ACTIVE},
        'activation should mark the replica service row active');
    } finally {
      NodeService.getInstance = originalGetNodeService;
    }
  });

  // Create system table cache with message group data
  // This triggers MOVE_REPLICA strategy when there are 2+ replicas on same node
  const systemTableCache = new SystemTableCache();

  // Add message group to cache - no message_groups table entry means no leader check
  // The services table entries are used for MOVE_REPLICA assignment

  // Add 3 replicas on the same node (seed-node-1) with leader role and addresses
  // This satisfies the leader readiness check
  systemTableCache.applySystemTableChange('services', 'INSERT', {
    id: 'mg-1-r1',
    service_id: 'mg-1-r1',
    replica_id: 'mg-1-r1',
    group_id: 'mg-1',
    node_id: 'seed-node-1',
    service_type: 'message_group',
    address: 'seed-node-1/message-group/mg-1-r1',
    raft_role: 'leader',
    status: 'active',
  });
  systemTableCache.applySystemTableChange('services', 'INSERT', {
    id: 'mg-1-r2',
    service_id: 'mg-1-r2',
    replica_id: 'mg-1-r2',
    group_id: 'mg-1',
    node_id: 'seed-node-1',
    service_type: 'message_group',
    address: 'seed-node-1/message-group/mg-1-r2',
    raft_role: 'follower',
    status: 'active',
  });
  systemTableCache.applySystemTableChange('services', 'INSERT', {
    id: 'mg-1-r3',
    service_id: 'mg-1-r3',
    replica_id: 'mg-1-r3',
    group_id: 'mg-1',
    node_id: 'seed-node-1',
    service_type: 'message_group',
    address: 'seed-node-1/message-group/mg-1-r3',
    raft_role: 'follower',
    status: 'active',
  });

  // Start a seed node API with the system table cache
  const seedApi = new BootstrapAPI({
    seedNodeId: 'seed-node-1',
    seedNodeAddress: 'ws://localhost:8080',
    systemTableCache: systemTableCache,
  });

  const httpPost = async (url, body) => {
    const u = new URL(url);
    const res = await seedApi.getFastify().inject({
      method: 'POST',
      url: u.pathname,
      payload: body,
    });
    return JSON.parse(res.payload);
  };

  let service = null;
  // Use random port to avoid conflicts
  const joiningNodeWsPort = 19091 + Math.floor(Math.random() * 1000);

  try {
    await seedApi.initialize(0, {listen: false});

    // Create joining service with wsPort for WebSocket server
    // Use short leadership timeout since mock peers can't respond
    service = new NodeJoiningService({
      nodeId: '550e8400-e29b-41d4-a716-446655440011',
      nodeAddress: `ws://localhost:${joiningNodeWsPort}`,
      seedNodeAddress: 'http://localhost:0',
      wsPort: joiningNodeWsPort, // Enable WebSocket server for self-connection
      httpPost,
      config: {
        httpTimeoutMs: 2000,
        leadershipWaitTimeoutMs: 500, // Short timeout - mock peers can't respond
        leadershipWaitInitialDelayMs: 10,
        leadershipWaitMaxDelayMs: 50,
      },
    });

    // Mock the WebSocket connection to seed node (no real seed WS server in this test)
    service.phaseConnectWebSocket = async function() {
      // Initialize MessageRouter for local communication only
      const {MessageRouter} = await import('../../src/transport/message-router.js');
      this.messageRouter = new MessageRouter({
        nodeId: this.nodeId,
        nodeAddress: this.nodeAddress,
        wsPort: this.wsPort,
      });
      this.messageRouter.setServiceNodeResolver((address) => {
        const match = address.match(/^([^/]+)\//);
        return match ? match[1] : null;
      });
      await this.messageRouter.initialize({startServer: true});
      this.transport = this.messageRouter;
    };
    service.triggerJoinReconciler = async function() {};

    // Mock phaseJoinExistingMessageGroup - it requires SQL engine which isn't available
    service.phaseJoinExistingMessageGroup = async function() {
      // Skip actual message group joining - just mark as complete
    };

    service.phaseWaitForLeadership = async () => {
      throw new Error('leadership timeout (test)');
    };

    const result = await service.join();

    // With mock peers that can't respond, leadership won't establish
    // But we can verify the assignment strategy was correct
    if (result.success) {
      t.equal(result.success, true, 'join should succeed');
      t.equal(service.getPhase(), JoiningPhase.COMPLETE, 'phase should be complete');
    } else {
      // Expected: leadership fails with mock peers, but verify strategy was correct
      t.equal(result.success, false, 'join fails with mock peers');
      t.ok(result.error.includes('leadership'), 'error should mention leadership');
    }

    // Verify the bootstrap response had correct MOVE_REPLICA strategy
    // This is available even if join failed
    t.ok(service.bootstrapResponse, 'should have bootstrap response');
    t.ok(
      service.bootstrapResponse.messageGroupAssignment.strategy ===
        AssignmentStrategy.MOVE_REPLICA,
      'should use MOVE_REPLICA strategy',
    );
    t.equal(
      service.bootstrapResponse.messageGroupAssignment.groupId,
      'mg-1',
      'should target existing group',
    );
  } finally {
    // Cleanup
    if (service) {
      await service.cleanup();
    }
    await seedApi.shutdown();
  }
});

test('NodeJoiningService - hasOperationalMessageGroup', async (t) => {
  initializeTestEnvironment();

  const service = new NodeJoiningService({
    nodeId: 'test-node-1',
    nodeAddress: 'ws://localhost:9090',
    seedNodeAddress: 'http://localhost:8080',
  });

  // Initially no operational message group
  t.equal(service.hasOperationalMessageGroup(), false);
});

test('NodeJoiningService - cleanup on failure', async (t) => {
  initializeTestEnvironment();

  const service = new NodeJoiningService({
    nodeId: 'test-node-1',
    nodeAddress: 'ws://localhost:9090',
    seedNodeAddress: 'http://localhost:99999', // Invalid port
    config: {
      httpTimeoutMs: 1000,
    },
  });

  const result = await service.join();

  t.equal(result.success, false);
  t.equal(service.getPhase(), JoiningPhase.FAILED);
  t.equal(service.messageGroupServices.size, 0, 'should have cleaned up services');
  t.equal(service.transport, null, 'should have cleaned up transport');
});

test('NodeJoiningService - emits events', async (t) => {
  initializeTestEnvironment();

  // Configure faster Raft elections for testing
  const config = ConfigurationManager.getInstance();
  config.config.raft = {
    ...config.config.raft,
    electionTimeoutMinMs: 25,
    electionTimeoutMaxMs: 50,
    heartbeatIntervalMs: 10,
  };

  // Start a seed node API
  const seedApi = new BootstrapAPI({
    seedNodeId: 'seed-node-1',
    seedNodeAddress: 'ws://localhost:8080',
    messageGroupServices: new Map(),
    systemTableCache: new SystemTableCache(),
  });

  const httpPost = async (url, body) => {
    const u = new URL(url);
    const res = await seedApi.getFastify().inject({
      method: 'POST',
      url: u.pathname,
      payload: body,
    });
    return JSON.parse(res.payload);
  };

  let service = null;
  // Use random port to avoid conflicts
  const joiningNodeWsPort = 19092 + Math.floor(Math.random() * 1000);

  try {
    await seedApi.initialize(0, {listen: false});

    service = new NodeJoiningService({
      nodeId: '550e8400-e29b-41d4-a716-446655440012',
      nodeAddress: `ws://localhost:${joiningNodeWsPort}`,
      seedNodeAddress: 'http://localhost:0',
      wsPort: joiningNodeWsPort, // Enable WebSocket server for self-connection
      httpPost,
      config: {
        httpTimeoutMs: 2000,
        leadershipWaitTimeoutMs: 5000,
        leadershipWaitInitialDelayMs: 10,
        leadershipWaitMaxDelayMs: 100,
      },
    });

    // Mock the WebSocket connection to seed node (no real seed WS server in this test)
    service.phaseConnectWebSocket = async function() {
      // Initialize MessageRouter for local communication only
      const {MessageRouter} = await import('../../src/transport/message-router.js');
      this.messageRouter = new MessageRouter({
        nodeId: this.nodeId,
        nodeAddress: this.nodeAddress,
        wsPort: this.wsPort,
      });
      this.messageRouter.setServiceNodeResolver((address) => {
        const match = address.match(/^([^/]+)\//);
        return match ? match[1] : null;
      });
      await this.messageRouter.initialize({startServer: true});
      this.transport = this.messageRouter;
    };
    service.triggerJoinReconciler = async function() {};
    service.phaseCreateSelfHostedMessageGroup = async function() {
      const replicaId = 'mg-join-r1';
      const unifiedAddress = `${this.nodeId}/message-group/${replicaId}`;
      this.messageGroupServices.set(replicaId, {
        groupId: 'mg-1',
        unifiedAddress,
        isLeaderReplica: () => true,
        getLeaderId: () => replicaId,
      });
      this.messageRouter.register(unifiedAddress, async () => ({acknowledged: true}));
    };
    service.phaseWaitForLeadership = async function() {};
    service.getLeaderMessageGroupService = function() {
      const firstService = this.messageGroupServices.values().next().value;
      return firstService || null;
    };

    // Mock phases that require system tables (not available in this unit test)
    service.phaseQuerySystemState = async function() {
      NodeService.getInstance().getSystemTableCache()
        .applySystemTableChange(TABLES.SERVICE_ENDPOINTS, 'INSERT', {
          endpoint_id: `postgres-wire-endpoint-${this.nodeId}`,
          service_id: META_SERVICE_ID.POSTGRES_WIRE,
          node_id: this.nodeId,
          protocol: 'tcp',
          address: this.nodeId,
          port: 5432,
          metadata: '{}',
        });
    };
    service.initializeReplicaHandler = function() {};
    service.createCdcIntegrationService = function() {
      this.cdcIntegrationService = {
        upsertSystemTableRow: async () => ({success: true}),
        updateSystemTableRow: async () => ({success: true}),
        deleteSystemTableRow: async () => ({success: true}),
      };
      return this.cdcIntegrationService;
    };
    service.initializeControlPlaneService = async function() {};
    service.initializeRuntimeServiceHandler = function() {};
    service.signalReadyForReplicas = async function() {};
    service.activateMessageGroupServiceRows = async function() {};
    service.joinReadinessEvaluator
      .waitForCanonicalJoinReadinessConvergence = async function() {};

    const events = [];
    service.on('phaseStart', (data) => events.push({type: 'start', phase: data.phase}));
    service.on('phaseComplete', (data) => events.push({type: 'complete', phase: data.phase}));
    service.on('complete', () => events.push({type: 'joinComplete'}));

    await service.join();

    t.ok(events.length > 0, 'should emit events');
    t.ok(events.some((e) => e.type === 'start'), 'should emit phaseStart');
    t.ok(events.some((e) => e.type === 'complete'), 'should emit phaseComplete');
    t.ok(events.some((e) => e.type === 'joinComplete'), 'should emit complete');
  } finally {
    if (service) {
      await service.cleanup();
    }
    await seedApi.shutdown();
  }
});

test('NodeJoiningService - replica factory should preserve join mode from replica handler',
  async (t) => {
    initializeTestEnvironment();

    const service = new NodeJoiningService({
      nodeId: 'test-node-join-factory',
      nodeAddress: 'ws://localhost:9090',
      seedNodeAddress: 'http://localhost:8080',
    });

    const cache = new SystemTableCache();
    let capturedCreatePartitionService = null;
    const originalReplicaHandlerCreate = ReplicaHandlerSetup.create;
    const originalGetNodeService = NodeService.getInstance;
    const originalInitialize = PartitionService.prototype.initialize;

    try {
      service.messageRouter = {registerHandler() {}, unregisterHandler() {}};
      service.transport = {unregister() {}};
      service.systemCacheHydrated = true;
      service.tablePolicyService = {};
      service.rebalanceCoordinator = {};
      service.createCdcIntegrationService = () => ({
        updateSystemTableRow: async () => true,
        upsertSystemTableRow: async () => true,
      });
      service.getLeaderMessageGroupService = () => null;

      NodeService.getInstance = () => ({
        getSystemTableCache() {
          return cache;
        },
      });

      PartitionService.prototype.initialize = async function() {};

      ReplicaHandlerSetup.create = ({createPartitionService}) => {
        capturedCreatePartitionService = createPartitionService;
        return {
          replicaHandler: {},
          replicaStateMachine: {},
        };
      };

      service.initializeReplicaHandler();

      t.equal(
        typeof capturedCreatePartitionService,
        'function',
        'should build a replica partition factory',
      );

      const partition = await capturedCreatePartitionService({
        partitionId: 'partition-1',
        tableId: 'table-1',
        tableName: null,
        schema: {columns: [{name: 'id', type: 'TEXT', primaryKey: true}]},
        keyRange: {start: null, end: null},
        replicaId: 'replica-1',
        replicaIds: ['replica-1'],
        peerAddresses: [],
        nodeId: 'test-node-join-factory',
        isJoiningExistingGroup: false,
      });

      t.equal(
        partition.isJoiningExistingGroup,
        false,
        'post-join partition creation should honor replica-handler join mode',
      );

      await partition.shutdown();
    } finally {
      ReplicaHandlerSetup.create = originalReplicaHandlerCreate;
      NodeService.getInstance = originalGetNodeService;
      PartitionService.prototype.initialize = originalInitialize;
    }
  });

test('NodeJoiningService - replica factory subscribes exactly the propagated cache tables',
  async (t) => {
    initializeTestEnvironment();

    const service = new NodeJoiningService({
      nodeId: 'test-node-join-cache-sync',
      nodeAddress: 'ws://localhost:9090',
      seedNodeAddress: 'http://localhost:8080',
    });

    const cache = new SystemTableCache();
    const subscribedTables = [];
    const handshakeSubscriberIds = [];
    let capturedCreatePartitionService = null;
    const originalReplicaHandlerCreate = ReplicaHandlerSetup.create;
    const originalGetNodeService = NodeService.getInstance;
    const originalInitialize = PartitionService.prototype.initialize;
    const originalSubscribeToCDCWithHandshake =
      PartitionService.prototype.subscribeToCDCWithHandshake;

    try {
      service.messageRouter = {registerHandler() {}, unregisterHandler() {}};
      service.transport = {unregister() {}};
      service.systemCacheHydrated = true;
      service.tablePolicyService = {};
      service.rebalanceCoordinator = {};
      service.messageGroupServices = new Map([
        ['mg-1', {
          groupId: 'mg-1',
          initialized: true,
          isLeaderReplica: () => true,
          isMetadataIngressReady: () => true,
          getMetadataIngressReadiness: () => ({ready: true}),
          getLeaderId: () => null,
          subscribeToCDC: async (tableName) => {
            subscribedTables.push(tableName);
          },
        }],
      ]);
      service.createCdcIntegrationService = () => ({
        updateSystemTableRow: async () => true,
        upsertSystemTableRow: async () => true,
      });

      NodeService.getInstance = () => ({
        getSystemTableCache() {
          return cache;
        },
      });

      PartitionService.prototype.initialize = async function() {};
      PartitionService.prototype.subscribeToCDCWithHandshake =
        async function(_subscriber, options = {}) {
          handshakeSubscriberIds.push(options.subscriberId);
          return {
            subscriberId: options.subscriberId || 'sub-1',
            subscriptionEpoch: 1,
            catchup: {
              mode: 'none',
              bufferedEventsReplayed: 0,
            },
          };
        };

      ReplicaHandlerSetup.create = ({createPartitionService}) => {
        capturedCreatePartitionService = createPartitionService;
        return {
          replicaHandler: {},
          replicaStateMachine: {},
        };
      };

      service.initializeReplicaHandler();

      for (const tableName of CACHE_HYDRATION_TABLES) {
        await capturedCreatePartitionService({
          partitionId: `${tableName}-p1`,
          tableId: tableName,
          tableName,
          schema: {columns: [{name: 'id', type: 'TEXT', primaryKey: true}]},
          keyRange: {start: null, end: null},
          replicaId: `${tableName}-r1`,
          replicaIds: [`${tableName}-r1`],
          peerAddresses: [],
          nodeId: 'test-node-join-cache-sync',
          isJoiningExistingGroup: true,
        });
      }

      await capturedCreatePartitionService({
        partitionId: `${TABLES.LOGS}-p1`,
        tableId: TABLES.LOGS,
        tableName: TABLES.LOGS,
        schema: {columns: [{name: 'id', type: 'TEXT', primaryKey: true}]},
        keyRange: {start: null, end: null},
        replicaId: `${TABLES.LOGS}-r1`,
        replicaIds: [`${TABLES.LOGS}-r1`],
        peerAddresses: [],
        nodeId: 'test-node-join-cache-sync',
        isJoiningExistingGroup: true,
      });

      t.same(
        subscribedTables,
        CACHE_HYDRATION_TABLES,
        'join-time replica factory should subscribe every propagated cache table once',
      );
      t.equal(
        handshakeSubscriberIds.length,
        CACHE_HYDRATION_TABLES.length,
        'join-time replica factory should register one CDC handshake per propagated cache table',
      );
      t.notOk(
        subscribedTables.includes(TABLES.LOGS),
        'non-propagated tables must not join the default cache-sync subscriptions',
      );
    } finally {
      ReplicaHandlerSetup.create = originalReplicaHandlerCreate;
      NodeService.getInstance = originalGetNodeService;
      PartitionService.prototype.initialize = originalInitialize;
      PartitionService.prototype.subscribeToCDCWithHandshake =
        originalSubscribeToCDCWithHandshake;
    }
  });
