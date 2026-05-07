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
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {
  PARTITION_SERVICE_ACTIVATION_ERROR,
} from '../../src/bootstrap/shared/partition-service-activation.js';
import {
} from '../../src/control-plane/control-plane-kernel-ingress.js';
import {
} from '../../src/bootstrap/join-session-store.js';
import {
  JOINING_ERROR_MSG,
} from '../../src/bootstrap/node-joining-constants.js';
import {
  BOOTSTRAP_API_PROBE_REASON,
  BOOTSTRAP_API_RESPONSE_FIELD,
} from '../../src/bootstrap/bootstrap-api-constants.js';
import {
  LIFECYCLE_PHASE,
  LIFECYCLE_REASON,
} from '../../src/bootstrap/lifecycle-controller-constants.js';
import {
} from '../../src/control-plane/membership-lifecycle-controller.js';
import {
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
} from '../../src/control-plane/owner-contract-outcome.js';
import {
} from '../../src/control-plane/control-plane-constants.js';
import {
} from '../../src/query/query-constants.js';
import {
  JOIN_PLAN_SEGMENT,
} from '../../src/bootstrap/bootstrap-constants.js';
import {STARTUP_JOIN_MODE} from '../../src/bootstrap/rejoin-hints-constants.js';
import {
  JOIN_PROMOTION_STATE,
} from '../../src/bootstrap/join-promotion-state-owner.js';
import {WORK_CLASS} from '../../src/runtime/work-class-scheduler.js';
import {ENTRYPOINT_DEFAULT} from '../../src/constants/entrypoint.js';
import {
  SERVICE_TYPE,
  SERVICE_STATUS,
  TABLES,
} from '../../src/constants/index.js';

const DEFAULT_SEED_WS_ADDRESS =
  `ws://localhost:${8080 + ENTRYPOINT_DEFAULT.WS_PORT_OFFSET}`;
const QUERY_STATE_SERVICE_REGISTRATION_SHORTCUT_OPTION =
  'preferControlPlaneUpsert';
const QUERY_STATE_SERVICE_REGISTRATION_ADMISSION_TARGET =
  'create-self-hosted join metadata service registration';
const ASSIGNMENT_TOKEN_UNKNOWN_ERROR_CODE =
  'ASSIGNMENT_TOKEN_UNKNOWN';
const TEST_SEED_CONTACT_AUTHORITY = Object.freeze({
  state: 'seed_locally_ready_unpublished',
  ready: false,
  authorityAvailable: true,
  publication: Object.freeze({
    observationState: 'unpublished',
  }),
  canonicalStartupNodeIds: Object.freeze(['seed-node-1']),
  failure: Object.freeze({
    state: 'none',
  }),
});

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

test('NodeJoiningService - ready signal metadata gate uses seed-contact authority after infrastructure readiness',
  async (t) => {
    initializeTestEnvironment();

    const readinessSnapshot = {
      ready: false,
      phase: LIFECYCLE_PHASE.INIT,
      state: 'bootstrapping',
      reasons: [
        BOOTSTRAP_API_PROBE_REASON.BOOTSTRAP_PHASE_INCOMPLETE,
        LIFECYCLE_REASON.PRIORITY_CONTROL_PLANE_RECOVERY_PENDING,
      ],
      retryAfterMs: 500,
      timestamp: Date.now(),
    };
    const service = new NodeJoiningService({
      nodeId: 'joining-node-ready-signal-authority',
      nodeAddress: 'ws://localhost:9090',
      seedNodeAddress: 'http://localhost:8080',
      readinessState: {
        evaluate() {
          return readinessSnapshot;
        },
      },
    });

    service.bootstrapResponse = {};
    service.messageRouter = {};
    service.rpcClient = {};
    service.cdcIntegrationService = {};
    service.heartbeatService = {};
    service.getLeaderMessageGroupService = () => ({});
    service.seedContactStartupAuthority = TEST_SEED_CONTACT_AUTHORITY;

    const projectedSnapshot =
      service.getReadySignalMetadataPublicationReadinessSnapshot();

    t.equal(
      service.isBootstrapStartupComplete(),
      true,
      'join-local bootstrap startup should complete when infrastructure is ready',
    );
    t.equal(
      projectedSnapshot.phase,
      LIFECYCLE_PHASE.DEGRADED,
      'ready-signal projection should move INIT metadata evidence into a metadata-publication phase',
    );
    t.same(
      projectedSnapshot.reasons,
      [LIFECYCLE_REASON.PRIORITY_CONTROL_PLANE_RECOVERY_PENDING],
      'ready-signal projection should remove only the local bootstrap phase blocker',
    );

    service.seedContactStartupAuthority = null;
    t.equal(
      service.getReadySignalMetadataPublicationReadinessSnapshot().phase,
      LIFECYCLE_PHASE.INIT,
      'ready-signal projection should stay closed without seed-contact authority',
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
          const notReadyBody = JSON.stringify({
            success: false,
            error: 'Bootstrap not ready',
            code: 'BOOTSTRAP_NOT_READY',
            phase: 'partitions',
            [BOOTSTRAP_API_RESPONSE_FIELD.STARTUP_AUTHORITY]:
              TEST_SEED_CONTACT_AUTHORITY,
          });
          throw new Error(
            `HTTP 503: ${notReadyBody}`,
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
    t.same(
      service.getSeedContactStartupAuthoritySnapshot(),
      TEST_SEED_CONTACT_AUTHORITY,
      'should retain startup authority from the retryable seed response',
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

test('NodeJoiningService - retries register-service on assignment token unknown',
  async (t) => {
    initializeTestEnvironment();

    let attempts = 0;
    const registerPayloads = [];
    const retryDelays = [];
    const warnEvents = [];
    const service = new NodeJoiningService({
      nodeId: '550e8400-e29b-41d4-a716-446655440107',
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
      httpPost: async (url, payload) => {
        if (!url.endsWith('/register-service')) {
          throw new Error('unexpected URL in register-service retry test');
        }
        registerPayloads.push(payload);
        attempts += 1;
        if (attempts === 1) {
          const error = new Error(
            'HTTP 409: {"success":false,"error":"assignment token unknown",' +
            `"code":"${ASSIGNMENT_TOKEN_UNKNOWN_ERROR_CODE}"}`,
          );
          error.statusCode = 409;
          error.responseJson = {
            success: false,
            error: 'assignment token unknown',
            code: ASSIGNMENT_TOKEN_UNKNOWN_ERROR_CODE,
          };
          throw error;
        }
        return {success: true};
      },
    });
    service.bootstrapResponse = {
      messageGroupAssignment: {
        strategy: AssignmentStrategy.MOVE_REPLICA,
        groupId: 'mg-1',
        replicaToMove: 'mg-1-r2',
        assignmentId: 'assignment-1',
      },
    };
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
      'mg-1-r2',
      {getRole: () => 'leader'},
    );

    t.equal(
      attempts,
      2,
      'should retry register-service once after assignment token miss',
    );
    t.equal(
      registerPayloads[0]?.assignment_id,
      'assignment-1',
      'first register attempt should carry the MOVE_REPLICA assignment token',
    );
    t.equal(
      registerPayloads[1]?.assignment_id,
      'assignment-1',
      'retry should preserve the same MOVE_REPLICA assignment token',
    );
    t.same(retryDelays, [10], 'should apply configured retry delay before retry');
    const retryEvent = warnEvents.find((event) =>
      event.details &&
      event.details.lastCode === ASSIGNMENT_TOKEN_UNKNOWN_ERROR_CODE,
    );
    t.ok(retryEvent, 'should emit retry warning for assignment token miss');
  });

test('NodeJoiningService - surfaces repeated assignment token unknown for outer retryable resume',
  async (t) => {
    initializeTestEnvironment();

    let attempts = 0;
    const registerPayloads = [];
    const retryDelays = [];
    const warnEvents = [];
    const service = new NodeJoiningService({
      nodeId: '550e8400-e29b-41d4-a716-44665544010a',
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
      httpPost: async (url, payload) => {
        if (!url.endsWith('/register-service')) {
          throw new Error('unexpected URL in stale assignment token retry test');
        }
        registerPayloads.push(payload);
        attempts += 1;
        const error = new Error(
          'HTTP 409: {"success":false,"error":"assignment token unknown",' +
          `"code":"${ASSIGNMENT_TOKEN_UNKNOWN_ERROR_CODE}"}`,
        );
        error.statusCode = 409;
        error.responseJson = {
          success: false,
          error: 'assignment token unknown',
          code: ASSIGNMENT_TOKEN_UNKNOWN_ERROR_CODE,
        };
        throw error;
      },
    });
    service.bootstrapResponse = {
      messageGroupAssignment: {
        strategy: AssignmentStrategy.MOVE_REPLICA,
        groupId: 'mg-1',
        replicaToMove: 'mg-1-r2',
        assignmentId: 'assignment-1',
      },
    };
    service.logger = {
      debug() {},
      info() {},
      warn(message, details) {
        warnEvents.push({message, details});
      },
      error() {},
    };

    const error = await t.rejects(
      service.registerMessageGroupService(
        'mg-1',
        'mg-1-r2',
        {getRole: () => 'leader'},
      ),
      'repeated stale assignment tokens should surface as retryable join failure',
    );

    t.equal(
      attempts,
      2,
      'should stop local register-service retries after one bounded assignment-token retry',
    );
    t.same(
      registerPayloads.map((payload) => payload?.assignment_id),
      ['assignment-1', 'assignment-1'],
      'bounded retries should preserve the original MOVE_REPLICA assignment token',
    );
    t.same(
      retryDelays,
      [10],
      'should only spend one bounded delay before surfacing the stale token',
    );
    t.equal(
      error?.deferRetry,
      true,
      'stale assignment token exhaustion should remain retryable for outer auto-resume',
    );
    t.equal(
      error?.code,
      ASSIGNMENT_TOKEN_UNKNOWN_ERROR_CODE,
      'surfaced retryable error should preserve the assignment token code',
    );
    const retryEvents = warnEvents.filter((event) =>
      event.details &&
      event.details.lastCode === ASSIGNMENT_TOKEN_UNKNOWN_ERROR_CODE,
    );
    t.equal(
      retryEvents.length,
      1,
      'should emit exactly one in-call retry warning before surfacing for outer resume',
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

test('NodeJoiningService - retryable seed-contact bootstrap authority ' +
  'preserves the configured request timeout on the retried transport ' +
  'attempt', async (t) => {
  initializeTestEnvironment();

  const TEST_RETRY_AFTER_MS = 5;
  const TEST_RETRY_DELAY_MS = 10;
  const TEST_HTTP_TIMEOUT_MS = 25;
  const TEST_RETRY_TIMEOUT_MS = 60;
  const TEST_BOOTSTRAP_PHASE = 'partitions';
  const TEST_STARTUP_AUTHORITY = Object.freeze({
    authorityAvailable: true,
    source: 'bootstrap_ready',
  });
  const TEST_RETRYABLE_RESPONSE = Object.freeze({
    success: false,
    error: 'Bootstrap not ready',
    code: 'BOOTSTRAP_NOT_READY',
    phase: TEST_BOOTSTRAP_PHASE,
    retryAfterMs: TEST_RETRY_AFTER_MS,
    startupAuthority: TEST_STARTUP_AUTHORITY,
  });

  let attempts = 0;
  let currentNow = 0;
  const observedTimeoutMs = [];
  const retryDelays = [];
  const service = new NodeJoiningService({
    nodeId: '550e8400-e29b-41d4-a716-446655440110',
    nodeAddress: 'ws://localhost:9090',
    seedNodeAddress: 'http://localhost:8080',
    now: () => currentNow,
    sleep: async (delayMs) => {
      retryDelays.push(delayMs);
      currentNow += delayMs;
    },
    config: {
      httpTimeoutMs: TEST_HTTP_TIMEOUT_MS,
      leadershipWaitTimeoutMs: TEST_RETRY_TIMEOUT_MS,
      leadershipWaitInitialDelayMs: TEST_RETRY_DELAY_MS,
      leadershipWaitMaxDelayMs: TEST_RETRY_DELAY_MS,
      leadershipWaitBackoffMultiplier: 1,
      leadershipWaitJitterRatio: 0,
    },
    httpPost: async (_url, _payload, options = {}) => {
      attempts += 1;
      const timeoutMs = Number.isFinite(options?.timeoutMs) ?
        options.timeoutMs :
        TEST_HTTP_TIMEOUT_MS;
      observedTimeoutMs.push(timeoutMs);
      currentNow += timeoutMs;
      if (attempts === 1) {
        const error = new Error(
          `HTTP 503: ${JSON.stringify(TEST_RETRYABLE_RESPONSE)}`,
        );
        error.statusCode = 503;
        throw error;
      }
      throw new Error('Request timeout after ' + timeoutMs + 'ms');
    },
  });

  const error = await t.rejects(
    service.phaseContactSeed(),
    'retryable bootstrap authority should keep the failure resumable',
  );

  t.equal(attempts, 2, 'phase should perform one retry before surfacing the transport failure');
  t.equal(
    error?.message,
    'Failed to contact seed node: Request timeout after ' +
      TEST_HTTP_TIMEOUT_MS + 'ms',
    'phase should keep the transport-timeout context while preserving the configured request timeout on the retried request',
  );
  t.equal(
    error?.deferRetry,
    true,
    'phase should preserve retryability for join auto-resume',
  );
  t.equal(
    error?.retryAfterMs,
    TEST_RETRY_DELAY_MS,
    'phase should preserve the last retry delay hint',
  );
  t.same(
    error?.bootstrapResponse,
    {
      ...TEST_RETRYABLE_RESPONSE,
      statusCode: 503,
    },
    'phase should retain the last retryable bootstrap evidence',
  );
  t.same(
    service.getSeedContactStartupAuthoritySnapshot(),
    TEST_STARTUP_AUTHORITY,
    'phase should retain startup authority from the retryable seed response',
  );
  t.same(
    retryDelays,
    [TEST_RETRY_DELAY_MS],
    'phase should still use one bounded retry before surfacing the resumable failure',
  );
  t.same(
    observedTimeoutMs,
    [TEST_HTTP_TIMEOUT_MS, TEST_HTTP_TIMEOUT_MS],
    'phase should keep the configured request timeout for retryable transport attempts',
  );
});

test('NodeJoiningService - retained retryable seed-contact evidence ' +
  'survives a later cross-attempt transport failure', async (t) => {
  initializeTestEnvironment();

  const TEST_RETRY_AFTER_MS = 5;
  const TEST_HTTP_TIMEOUT_MS = 10;
  const TEST_BOOTSTRAP_PHASE = 'partitions';
  const TEST_STARTUP_AUTHORITY = Object.freeze({
    authorityAvailable: true,
    source: 'bootstrap_ready',
  });
  const TEST_RETRYABLE_RESPONSE = Object.freeze({
    success: false,
    error: 'Bootstrap not ready',
    code: 'BOOTSTRAP_NOT_READY',
    phase: TEST_BOOTSTRAP_PHASE,
    retryAfterMs: TEST_RETRY_AFTER_MS,
    startupAuthority: TEST_STARTUP_AUTHORITY,
  });

  let attempts = 0;
  let currentNow = 0;
  const observedTimeoutMs = [];
  const service = new NodeJoiningService({
    nodeId: '550e8400-e29b-41d4-a716-446655440111',
    nodeAddress: 'ws://localhost:9090',
    seedNodeAddress: 'http://localhost:8080',
    now: () => currentNow,
    sleep: async () => {},
    config: {
      httpTimeoutMs: TEST_HTTP_TIMEOUT_MS,
      leadershipWaitTimeoutMs: TEST_HTTP_TIMEOUT_MS,
      leadershipWaitInitialDelayMs: TEST_HTTP_TIMEOUT_MS,
      leadershipWaitMaxDelayMs: TEST_HTTP_TIMEOUT_MS,
      leadershipWaitBackoffMultiplier: 1,
      leadershipWaitJitterRatio: 0,
    },
    httpPost: async (_url, _payload, options = {}) => {
      attempts += 1;
      const timeoutMs = Number.isFinite(options?.timeoutMs) ?
        options.timeoutMs :
        TEST_HTTP_TIMEOUT_MS;
      observedTimeoutMs.push(timeoutMs);
      currentNow += timeoutMs;
      if (attempts === 1) {
        const error = new Error(
          `HTTP 503: ${JSON.stringify(TEST_RETRYABLE_RESPONSE)}`,
        );
        error.statusCode = 503;
        throw error;
      }
      throw new Error('Request timeout after ' + timeoutMs + 'ms');
    },
  });

  const firstError = await t.rejects(
    service.phaseContactSeed(),
    'first attempt should surface retryable bootstrap-not-ready evidence',
  );
  t.equal(
    firstError?.message,
    'Seed bootstrap not ready (phase: ' + TEST_BOOTSTRAP_PHASE + ')',
    'first attempt should keep the canonical retryable bootstrap message',
  );
  t.equal(
    firstError?.deferRetry,
    true,
    'first attempt should remain retryable for auto-resume',
  );

  const secondError = await t.rejects(
    service.phaseContactSeed(),
    'second attempt should preserve retained retryable seed-contact evidence',
  );

  t.equal(attempts, 2, 'phase should execute one request per cross-attempt check');
  t.equal(
    secondError?.message,
    'Failed to contact seed node: Request timeout after ' +
      TEST_HTTP_TIMEOUT_MS + 'ms',
    'later transport timeout should preserve contact-seed context while keeping the configured request timeout',
  );
  t.equal(
    secondError?.deferRetry,
    true,
    'retained retryable evidence should keep the later transport failure retryable',
  );
  t.equal(
    secondError?.retryAfterMs,
    TEST_RETRY_AFTER_MS,
    'retained retryable evidence should keep the retry hint across attempts',
  );
  t.same(
    secondError?.bootstrapResponse,
    {
      ...TEST_RETRYABLE_RESPONSE,
      statusCode: 503,
    },
    'later transport failure should retain the earlier retryable bootstrap evidence',
  );
  t.same(
    service.getSeedContactStartupAuthoritySnapshot(),
    TEST_STARTUP_AUTHORITY,
    'service should retain startup authority across attempts',
  );
  t.same(
    observedTimeoutMs,
    [TEST_HTTP_TIMEOUT_MS, TEST_HTTP_TIMEOUT_MS],
    'phase should keep the configured request timeout once retryable seed evidence is retained',
  );
  t.equal(
    currentNow,
    TEST_HTTP_TIMEOUT_MS + TEST_HTTP_TIMEOUT_MS,
    'retained retryable seed evidence should not shrink the later transport timeout budget',
  );
});

test('NodeJoiningService - surfaces retryable bootstrap authority after one ' +
  'bounded in-call retry', async (t) => {
  initializeTestEnvironment();

  const TEST_RETRY_AFTER_MS = 5;
  const TEST_RETRY_DELAY_MS = 10;
  const TEST_HTTP_TIMEOUT_MS = 1;
  const TEST_RETRY_TIMEOUT_MS = 100;
  const TEST_BOOTSTRAP_PHASE = 'partitions';
  const TEST_STARTUP_AUTHORITY = Object.freeze({
    authorityAvailable: true,
    source: 'bootstrap_ready',
  });
  const TEST_RETRYABLE_RESPONSE = Object.freeze({
    success: false,
    error: 'Bootstrap not ready',
    code: 'BOOTSTRAP_NOT_READY',
    phase: TEST_BOOTSTRAP_PHASE,
    retryAfterMs: TEST_RETRY_AFTER_MS,
    startupAuthority: TEST_STARTUP_AUTHORITY,
  });

  let attempts = 0;
  let currentNow = 0;
  const retryDelays = [];
  const service = new NodeJoiningService({
    nodeId: '550e8400-e29b-41d4-a716-446655440112',
    nodeAddress: 'ws://localhost:9090',
    seedNodeAddress: 'http://localhost:8080',
    now: () => currentNow,
    sleep: async (delayMs) => {
      retryDelays.push(delayMs);
      currentNow += delayMs;
    },
    config: {
      httpTimeoutMs: TEST_HTTP_TIMEOUT_MS,
      leadershipWaitTimeoutMs: TEST_RETRY_TIMEOUT_MS,
      leadershipWaitInitialDelayMs: TEST_RETRY_DELAY_MS,
      leadershipWaitMaxDelayMs: TEST_RETRY_DELAY_MS,
      leadershipWaitBackoffMultiplier: 1,
      leadershipWaitJitterRatio: 0,
    },
    httpPost: async () => {
      attempts += 1;
      currentNow += TEST_HTTP_TIMEOUT_MS;
      const error = new Error(
        `HTTP 503: ${JSON.stringify(TEST_RETRYABLE_RESPONSE)}`,
      );
      error.statusCode = 503;
      throw error;
    },
  });

  const error = await t.rejects(
    service.phaseContactSeed(),
    'phase should stop after one bounded retry once seed-owned retryable ' +
      'authority is established',
  );

  t.equal(
    attempts,
    2,
    'phase should perform only one bounded retry after canonical retryable ' +
      'seed evidence',
  );
  t.equal(
    error?.message,
    'Seed bootstrap not ready (phase: ' + TEST_BOOTSTRAP_PHASE + ')',
    'phase should preserve the canonical retryable bootstrap message',
  );
  t.equal(
    error?.deferRetry,
    true,
    'phase should preserve retryability for join auto-resume',
  );
  t.equal(
    error?.retryAfterMs,
    TEST_RETRY_DELAY_MS,
    'phase should preserve the retry hint from the retryable seed response',
  );
  t.same(
    error?.bootstrapResponse,
    {
      ...TEST_RETRYABLE_RESPONSE,
      statusCode: 503,
    },
    'phase should retain the last retryable bootstrap evidence',
  );
  t.same(
    service.getSeedContactStartupAuthoritySnapshot(),
    TEST_STARTUP_AUTHORITY,
    'phase should retain startup authority from the retryable seed response',
  );
  t.same(
    retryDelays,
    [TEST_RETRY_DELAY_MS],
    'phase should spend one bounded retry delay before surfacing the retryable outcome',
  );
  t.ok(
    currentNow < TEST_RETRY_TIMEOUT_MS,
    'phase should not consume the full contact-seed retry window after canonical retryable seed evidence',
  );
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
