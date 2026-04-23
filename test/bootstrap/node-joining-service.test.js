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
import {ControlPlaneSetup} from '../../src/bootstrap/shared/control-plane-setup.js';
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
  OWNER_CONTRACT_NEXT_ACTION,
  OWNER_CONTRACT_STATE,
} from '../../src/control-plane/owner-contract-outcome.js';
import {
  CONTROL_PLANE_NODE_STATE_PUBLICATION_MODE,
} from '../../src/control-plane/control-plane-constants.js';
import {
  QUERY_ROUTING_DIAGNOSTIC_REASON,
} from '../../src/query/query-constants.js';
import {
  JOIN_PLAN_SEGMENT,
} from '../../src/bootstrap/bootstrap-constants.js';
import {STARTUP_JOIN_MODE} from '../../src/bootstrap/rejoin-hints-constants.js';
import {
  JOIN_PROMOTION_STATE,
  JOIN_REJOIN_PROMOTION_RESTORE_STATE,
} from '../../src/bootstrap/join-promotion-state-owner.js';
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
const NODES_ROUTING_PARTITION_ID = 'nodes-p1';
const QUERY_STATE_SERVICE_REGISTRATION_SHORTCUT_OPTION =
  'preferControlPlaneUpsert';
const QUERY_STATE_SERVICE_REGISTRATION_ADMISSION_TARGET =
  'create-self-hosted join metadata service registration';
const REMOTE_CANONICAL_LEADER_NODE_ID = 'seed-node-1';
const REPORTER_FORWARD_NODE_ID = 'joiner-reporter-publication-mode';
const REPORTER_FORWARD_NODE_ADDRESS = 'ws://localhost:19103';
const REPORTER_FORWARD_SEED_ADDRESS = 'http://localhost:8080';
const REPORTER_FORWARD_HEARTBEAT_AT = 4242;
const REPORTER_FORWARD_READY_LEASE_AT = 8484;
const REPORTER_FORWARD_TARGET_ADDRESS = 'seed-node-1/message-group/mg-1-r3';

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

test('NodeJoiningService - runtime owner exposes system table cache for bootstrap peers',
  async (t) => {
    initializeTestEnvironment();

    const nodeRow = {
      node_id: 'seed-node-1',
      node_address: 'ws://localhost:8080',
      status: 'active',
    };
    const runtimeOwnerCache = {
      get() {
        return null;
      },
      getAll(tableName) {
        return tableName === TABLES.NODES ? [nodeRow] : [];
      },
      filter() {
        return [];
      },
      find() {
        return null;
      },
      getReadyNodes() {
        return [];
      },
    };
    NodeService.getInstance().setSystemCacheProxy(runtimeOwnerCache);

    const service = new NodeJoiningService({
      nodeId: 'test-node-runtime-owner-cache',
      nodeAddress: 'ws://localhost:9098',
      seedNodeAddress: 'http://localhost:8080',
    });
    const bootstrapApi = new BootstrapAPI({
      seedNodeId: 'seed-node-1',
      seedNodeAddress: 'ws://localhost:8080',
      systemTableCache: null,
      runtimeOwner: service.runtimeDependencyOwner,
    });

    await bootstrapApi.initialize(0, {listen: false});

    t.same(
      bootstrapApi.buildSystemTableSnapshots()[TABLES.NODES],
      [nodeRow],
      'bootstrap peers should see the joined runtime cache through the runtime owner fallback',
    );

    await bootstrapApi.shutdown();
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

test('NodeJoiningService - getStatus surfaces promotion and snapshot revision metadata',
  async (t) => {
    initializeTestEnvironment();

    const service = new NodeJoiningService({
      nodeId: 'test-node-status-metadata',
      nodeAddress: 'ws://localhost:9090',
      seedNodeAddress: 'http://localhost:8080',
    });

    service.joinReadinessEvaluator = {
      buildCanonicalJoinReadinessSnapshot() {
        return {snapshot: true};
      },
      evaluateCanonicalJoinReadinessSnapshot() {
        return {
          promotionState: JOIN_PROMOTION_STATE.CATCHING_UP,
          promotionReasons: ['schema_version_lag'],
          snapshotRevision: 22,
          snapshotRevisionState: 'behind',
          snapshotExpectedMinimumRevision: 24,
          snapshotRevisionGap: 2,
          snapshotResumeToken: 'control-plane-revision:captured_at:22',
        };
      },
    };

    const status = service.getStatus();

    t.equal(
      status.promotionState,
      JOIN_PROMOTION_STATE.CATCHING_UP,
      'status should preserve the canonical promotion state',
    );
    t.same(
      status.promotionReasons,
      ['schema_version_lag'],
      'status should preserve canonical promotion reasons',
    );
    t.equal(status.snapshotRevision, 22);
    t.equal(status.snapshotRevisionState, 'behind');
    t.equal(status.snapshotExpectedMinimumRevision, 24);
    t.equal(status.snapshotRevisionGap, 2);
    t.equal(
      status.snapshotResumeToken,
      'control-plane-revision:captured_at:22',
      'status should preserve resume-token diagnostics',
    );
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
    service.upsertJoinServiceRowWithRetry = async (row, options) => {
      upsertCalls.push({row, options});
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

test('NodeJoiningService - bypasses HTTP register-service for query-state self-hosted metadata publication',
  async (t) => {
    initializeTestEnvironment();

    let httpCalls = 0;
    const upsertCalls = [];
    const seededRows = [];
    const service = new NodeJoiningService({
      nodeId: 'join-node-self-hosted',
      nodeAddress: 'ws://localhost:9090',
      seedNodeAddress: 'http://localhost:8080',
      httpPost: async () => {
        httpCalls += 1;
        return {success: true};
      },
    });
    service.seedNodeId = 'seed-node-1';
    service.upsertJoinServiceRowWithRetry = async (row, options) => {
      upsertCalls.push({row, options});
      return {success: true};
    };
    service.seedJoinTimeCacheRow = (tableName, row) => {
      seededRows.push({tableName, row});
    };

    await service.registerMessageGroupService(
      'mg-1',
      'mg-1-r0',
      {getRole: () => 'leader'},
      {
        status: SERVICE_STATUS.STOPPED,
        [QUERY_STATE_SERVICE_REGISTRATION_SHORTCUT_OPTION]: true,
      },
    );

    t.equal(
      httpCalls,
      0,
      'query-state self-hosted metadata publication should not loop through bootstrap HTTP',
    );
    t.equal(
      upsertCalls.length,
      1,
      'query-state shortcut should persist the service row directly',
    );
    t.equal(
      upsertCalls[0].options?.admissionTarget,
      QUERY_STATE_SERVICE_REGISTRATION_ADMISSION_TARGET,
      'query-state shortcut should use the join-time control-plane admission target',
    );
    t.equal(
      seededRows.length,
      1,
      'query-state shortcut should seed the join-time cache row',
    );
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

test('NodeJoiningService - exhausted retryable seed-contact timeouts preserve ' +
  'auto-resume hints', async (t) => {
  initializeTestEnvironment();

  let currentNow = 0;
  const retryDelays = [];
  const service = new NodeJoiningService({
    nodeId: '550e8400-e29b-41d4-a716-446655440109',
    nodeAddress: 'ws://localhost:9090',
    seedNodeAddress: 'http://localhost:8080',
    now: () => currentNow,
    sleep: async (delayMs) => {
      retryDelays.push(delayMs);
      currentNow += delayMs;
    },
    config: {
      httpTimeoutMs: 10,
      leadershipWaitTimeoutMs: 20,
      leadershipWaitInitialDelayMs: 5,
      leadershipWaitMaxDelayMs: 5,
      leadershipWaitBackoffMultiplier: 1,
      leadershipWaitJitterRatio: 0,
    },
    httpPost: async () => {
      currentNow += 10;
      throw new Error('Request timeout after 10ms');
    },
  });

  const error = await t.rejects(
    service.phaseContactSeed(),
    'retryable timeout exhaustion should still throw',
  );

  t.equal(
    error?.message,
    'Failed to contact seed node: Request timeout after 10ms',
    'retryable timeout exhaustion should keep the contact-seed context',
  );
  t.equal(error?.deferRetry, true, 'retryable timeout exhaustion should preserve retryability');
  t.equal(error?.retryAfterMs, 10, 'retryable timeout exhaustion should preserve retry delay hints');
  t.same(retryDelays, [10], 'phase should make one bounded retry before surfacing exhaustion');
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
