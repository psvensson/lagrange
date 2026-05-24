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
  PRESSURE_GOVERNOR_ERROR_CODE,
} from '../../src/control-plane/pressure-governor.js';
import {
} from '../../src/bootstrap/join-session-store.js';
import {
  JOINING_ERROR_MSG,
  JOINING_SEED_CONTACT_FAILURE_KIND,
} from '../../src/bootstrap/node-joining-constants.js';
import {
  BOOTSTRAP_API_DEFAULT,
  BOOTSTRAP_API_PROBE_REASON,
  BOOTSTRAP_API_REQUEST_FIELD,
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
  BOOTSTRAP_PIPELINE_ERROR_CODE,
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
  NUM,
  TIME_MS,
  CDC_OPERATION,
  ENDPOINT_STATUS,
  TRANSPORT_TYPE,
} from '../../src/constants/index.js';

const DEFAULT_SEED_WS_ADDRESS =
  `ws://localhost:${8080 + ENTRYPOINT_DEFAULT.WS_PORT_OFFSET}`;
const QUERY_STATE_SERVICE_REGISTRATION_SHORTCUT_OPTION =
  'preferControlPlaneUpsert';
const QUERY_STATE_SERVICE_REGISTRATION_ADMISSION_TARGET =
  'create-self-hosted join metadata service registration';
const ASSIGNMENT_TOKEN_UNKNOWN_ERROR_CODE =
  'ASSIGNMENT_TOKEN_UNKNOWN';
const TEST_SHORTCUT_RETRY_AFTER_MS = 125;
const TEST_TERMINAL_SHORTCUT_ERROR_CODE =
  'SHORTCUT_VALIDATION_FAILED';
const TEST_SHORTCUT_NON_SUCCESS_ERROR_PATTERN =
  /shortcut returned non-success/;
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
const TEST_CONTACT_SEED_ATTEMPT_NOW_MS = 1000;
const TEST_CONTACT_SEED_HTTP_TIMEOUT_MS = 50;
const TEST_CONTACT_SEED_RETRY_TIMEOUT_MS = 100;

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

test('NodeJoiningService - websocket phase receives configured retry policy',
  async (t) => {
    initializeTestEnvironment();

    const TEST_JOINING_NODE_ID = 'joining-node-websocket-retry-policy';
    const TEST_JOINING_NODE_ADDRESS = 'ws://localhost:9090';
    const TEST_SEED_NODE_ADDRESS = 'http://localhost:8080';
    const TEST_LEADERSHIP_WAIT_TIMEOUT_MS = 1200;
    const TEST_LEADERSHIP_WAIT_INITIAL_DELAY_MS = 25;
    const TEST_LEADERSHIP_WAIT_MAX_DELAY_MS = 75;
    const TEST_LEADERSHIP_WAIT_BACKOFF_MULTIPLIER = 2;

    const service = new NodeJoiningService({
      nodeId: TEST_JOINING_NODE_ID,
      nodeAddress: TEST_JOINING_NODE_ADDRESS,
      seedNodeAddress: TEST_SEED_NODE_ADDRESS,
      config: {
        leadershipWaitTimeoutMs: TEST_LEADERSHIP_WAIT_TIMEOUT_MS,
        leadershipWaitInitialDelayMs: TEST_LEADERSHIP_WAIT_INITIAL_DELAY_MS,
        leadershipWaitMaxDelayMs: TEST_LEADERSHIP_WAIT_MAX_DELAY_MS,
        leadershipWaitBackoffMultiplier:
          TEST_LEADERSHIP_WAIT_BACKOFF_MULTIPLIER,
      },
    });

    const retryPolicy =
      service.connectWebSocketPhase.resolveSeedWebSocketRetryPolicy();

    t.equal(
      retryPolicy.retryTimeoutMs,
      TEST_LEADERSHIP_WAIT_TIMEOUT_MS,
      'production websocket phase delegate should expose join retry timeout config',
    );
    t.equal(
      retryPolicy.initialDelayMs,
      TEST_LEADERSHIP_WAIT_INITIAL_DELAY_MS,
      'production websocket phase delegate should expose join retry initial delay config',
    );
    t.equal(
      retryPolicy.maxDelayMs,
      TEST_LEADERSHIP_WAIT_MAX_DELAY_MS,
      'production websocket phase delegate should expose join retry max delay config',
    );
    t.equal(
      retryPolicy.backoffMultiplier,
      TEST_LEADERSHIP_WAIT_BACKOFF_MULTIPLIER,
      'production websocket phase delegate should expose join retry backoff config',
    );
  });

test('NodeJoiningService - supplements partial cache mesh from bootstrap snapshot',
  async (t) => {
    initializeTestEnvironment();

    const TEST_JOINING_NODE_ID = 'joining-node-partial-cache-mesh';
    const TEST_JOINING_NODE_ADDRESS = 'ws://localhost:9102';
    const TEST_SEED_NODE_ADDRESS = 'http://localhost:8080';
    const TEST_SEED_NODE_ID = 'seed-node-partial-cache';
    const TEST_SEED_NODE_REST_ADDRESS = 'seed-node-partial-cache:8080';
    const TEST_PEER_NODE_ID = 'peer-node-bootstrap-supplement';
    const TEST_PEER_NODE_REST_ADDRESS = 'peer-node-bootstrap-supplement:8080';
    const TEST_PEER_WS_ADDRESS = 'ws://peer-node-bootstrap-supplement:8082';
    const TEST_PEER_ENDPOINT_ID = 'peer-node-bootstrap-supplement-ws';
    const TEST_ACTIVE_STATUS = 'active';
    const TEST_JOINING_STATUS = 'joining';
    const TEST_CONNECTING_STATE = 'connecting';
    const TEST_CONNECTED_STATE = 'connected';
    const TEST_ENDPOINT_PRIORITY = 0;

    const service = new NodeJoiningService({
      nodeId: TEST_JOINING_NODE_ID,
      nodeAddress: TEST_JOINING_NODE_ADDRESS,
      seedNodeAddress: TEST_SEED_NODE_ADDRESS,
    });

    service.bootstrapResponse = {
      systemTableSnapshots: {
        nodes: [
          {
            node_id: TEST_JOINING_NODE_ID,
            node_address: TEST_JOINING_NODE_ADDRESS,
            status: TEST_ACTIVE_STATUS,
          },
          {
            node_id: TEST_SEED_NODE_ID,
            node_address: TEST_SEED_NODE_REST_ADDRESS,
            status: TEST_ACTIVE_STATUS,
          },
          {
            node_id: TEST_PEER_NODE_ID,
            node_address: TEST_PEER_NODE_REST_ADDRESS,
            status: TEST_JOINING_STATUS,
            connection_state: TEST_CONNECTING_STATE,
          },
        ],
        node_endpoints: [
          {
            endpoint_id: TEST_PEER_ENDPOINT_ID,
            node_id: TEST_PEER_NODE_ID,
            transport_type: TRANSPORT_TYPE.WEBSOCKET,
            address: TEST_PEER_WS_ADDRESS,
            priority: TEST_ENDPOINT_PRIORITY,
            status: ENDPOINT_STATUS.ACTIVE,
          },
        ],
      },
      topologySnapshotMeta: {
        activeNodeIds: [TEST_SEED_NODE_ID],
      },
    };

    const systemTableCache =
      NodeService.getInstance().getSystemTableCache();
    service.systemTableCache = systemTableCache;
    systemTableCache.applySystemTableChange(
      TABLES.NODES,
      CDC_OPERATION.INSERT,
      {
        node_id: TEST_JOINING_NODE_ID,
        node_address: TEST_JOINING_NODE_ADDRESS,
        status: TEST_ACTIVE_STATUS,
      },
    );
    systemTableCache.applySystemTableChange(
      TABLES.NODES,
      CDC_OPERATION.INSERT,
      {
        node_id: TEST_SEED_NODE_ID,
        node_address: TEST_SEED_NODE_REST_ADDRESS,
        status: TEST_ACTIVE_STATUS,
      },
    );

    const connectCalls = [];
    service.messageRouter = {
      nodeConnections: new Map([
        [TEST_SEED_NODE_ID, {state: TEST_CONNECTED_STATE}],
      ]),
      getConnectionState(nodeId) {
        return this.nodeConnections.get(nodeId)?.state || null;
      },
      async connectToNode(nodeId, wsAddress) {
        connectCalls.push({nodeId, wsAddress});
        this.nodeConnections.set(nodeId, {
          state: TEST_CONNECTED_STATE,
          address: wsAddress,
        });
      },
      getConnectedNodes() {
        return Array.from(this.nodeConnections.keys());
      },
    };

    await service.connectToClusterNodes();

    t.same(
      connectCalls,
      [{
        nodeId: TEST_PEER_NODE_ID,
        wsAddress: TEST_PEER_WS_ADDRESS,
      }],
      'partial cache mesh reconciliation should connect bootstrap-supplemented peers',
    );
  });

test('BootstrapAPI - retains admission peer hints in bootstrap snapshots',
  async (t) => {
    initializeTestEnvironment();

    const TEST_SEED_NODE_ID = 'seed-node-admission-hint';
    const TEST_SEED_NODE_ADDRESS = 'seed-node-admission-hint:8080';
    const TEST_SEED_WS_ADDRESS = 'ws://seed-node-admission-hint:8082';
    const TEST_PEER_NODE_ID = 'peer-node-admission-hint';
    const TEST_PEER_NODE_ADDRESS = 'peer-node-admission-hint:8080';
    const TEST_PEER_WS_ADDRESS = 'ws://peer-node-admission-hint:8082';
    const TEST_ACTIVE_STATUS = 'active';
    const TEST_JOINING_STATUS = 'joining';
    const TEST_CONNECTING_STATE = 'connecting';
    const TEST_LEASE_MS = 5000;
    const TEST_NOW_MS = Date.now();
    const TEST_EXPIRED_NOW_MS = TEST_NOW_MS + TEST_LEASE_MS + 1;

    const api = new BootstrapAPI({
      seedNodeId: TEST_SEED_NODE_ID,
      seedNodeAddress: TEST_SEED_NODE_ADDRESS,
      seedNodeWsAddress: TEST_SEED_WS_ADDRESS,
      bootstrapAdmissionLeaseMs: TEST_LEASE_MS,
      systemTableCache: {
        getAll() {
          return [];
        },
      },
    });

    const admission = api.acquireBootstrapAdmission({
      nodeId: TEST_PEER_NODE_ID,
      nodeAddress: TEST_PEER_NODE_ADDRESS,
      now: TEST_NOW_MS,
    });
    api.releaseBootstrapAdmission(admission);

    const envelope = api.bootstrapRequestOwner
      .attachBootstrapAdmissionPeerHints({
        systemTableSnapshots: {
          [TABLES.NODES]: [{
            node_id: TEST_SEED_NODE_ID,
            node_address: TEST_SEED_NODE_ADDRESS,
            status: TEST_ACTIVE_STATUS,
          }],
          [TABLES.NODE_ENDPOINTS]: [],
        },
        topologySnapshotMeta: {
          activeNodeIds: [TEST_SEED_NODE_ID],
          tableRowCounts: {
            [TABLES.NODES]: 1,
            [TABLES.NODE_ENDPOINTS]: 0,
          },
        },
      });

    t.match(
      envelope.systemTableSnapshots[TABLES.NODES].find((row) =>
        row.node_id === TEST_PEER_NODE_ID,
      ),
      {
        node_id: TEST_PEER_NODE_ID,
        node_address: TEST_PEER_NODE_ADDRESS,
        status: TEST_JOINING_STATUS,
        connection_state: TEST_CONNECTING_STATE,
      },
      'bootstrap response snapshots should retain recently admitted peers as joining hints',
    );
    t.match(
      envelope.systemTableSnapshots[TABLES.NODE_ENDPOINTS].find((row) =>
        row.node_id === TEST_PEER_NODE_ID,
      ),
      {
        node_id: TEST_PEER_NODE_ID,
        transport_type: TRANSPORT_TYPE.WEBSOCKET,
        address: TEST_PEER_WS_ADDRESS,
        status: ENDPOINT_STATUS.ACTIVE,
      },
      'bootstrap response snapshots should include websocket endpoints for admission hints',
    );
    t.same(
      api.getBootstrapAdmissionPeerHints(TEST_EXPIRED_NOW_MS),
      [],
      'admission peer hints should expire on the bootstrap admission lease',
    );
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

test('NodeJoiningService - sends contact-seed attempt deadline to seed',
  async (t) => {
    initializeTestEnvironment();

    let capturedBootstrapRequest = null;
    const service = new NodeJoiningService({
      nodeId: '550e8400-e29b-41d4-a716-446655440098',
      nodeAddress: 'ws://localhost:9090',
      seedNodeAddress: 'http://localhost:8080',
      now: () => TEST_CONTACT_SEED_ATTEMPT_NOW_MS,
      config: {
        httpTimeoutMs: TEST_CONTACT_SEED_HTTP_TIMEOUT_MS,
        leadershipWaitTimeoutMs: TEST_CONTACT_SEED_RETRY_TIMEOUT_MS,
      },
      httpPost: async (_url, request) => {
        capturedBootstrapRequest = request;
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

    t.equal(
      capturedBootstrapRequest?.[
        BOOTSTRAP_API_REQUEST_FIELD.CLIENT_ATTEMPT_DEADLINE_MS
      ],
      TEST_CONTACT_SEED_ATTEMPT_NOW_MS + TEST_CONTACT_SEED_HTTP_TIMEOUT_MS,
      'bootstrap request should carry the client contact-seed attempt deadline',
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

