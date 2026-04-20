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
    [null, null],
    'should clear the join-time reporter during writer activation and READY finalization',
  );
});

test('NodeJoiningService disables the join-time reporter during steady-state heartbeat start',
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
      [null],
      'steady-state cutover should disable the join-time reporter before heartbeat start',
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

test('NodeJoiningService forwards heartbeat reporter publication mode during control-plane initialization',
  async (t) => {
    initializeTestEnvironment();

    const originalCreate = ControlPlaneSetup.create;
    let assignedReporter = null;
    let capturedUpdateOptions = null;

    const service = new NodeJoiningService({
      nodeId: REPORTER_FORWARD_NODE_ID,
      nodeAddress: REPORTER_FORWARD_NODE_ADDRESS,
      seedNodeAddress: REPORTER_FORWARD_SEED_ADDRESS,
    });

    service.messageGroupServices = new Map([
      ['mg-1', {
        subscribeToCDC: async () => {},
      }],
    ]);
    service.tablePolicyService = {};
    service.getLeaderMessageGroupService = () => ({
      systemTableCache: new SystemTableCache(),
    });
    service.createCdcIntegrationService = () => ({});
    service.sendControlPlaneNodeStateUpdate = async (options = {}) => {
      capturedUpdateOptions = options;
      return {
        publicationPath: 'node_state_reporter',
        targetAddress: REPORTER_FORWARD_TARGET_ADDRESS,
      };
    };

    ControlPlaneSetup.create = async () => ({
      heartbeatService: {
        setNodeStateReporter(reporter) {
          assignedReporter = reporter;
        },
      },
      leaseService: null,
      endpointService: null,
      dispatchService: null,
      rebalanceCoordinator: {},
    });

    try {
      await service.initializeControlPlaneService();

      t.equal(typeof assignedReporter, 'function',
        'control-plane initialization should install one steady-state reporter');

      await assignedReporter({
        state: STATE.READY,
        capabilities: ['partition_replica'],
        heartbeatAt: REPORTER_FORWARD_HEARTBEAT_AT,
        readyLeaseExpiresAt: REPORTER_FORWARD_READY_LEASE_AT,
        nodeRow: {
          [COLUMN.NODE_ID]: REPORTER_FORWARD_NODE_ID,
        },
        nodeStatePublicationMode:
          CONTROL_PLANE_NODE_STATE_PUBLICATION_MODE.HEARTBEAT_RECOVERY,
      });

      t.match(capturedUpdateOptions, {
        state: STATE.READY,
        capabilities: ['partition_replica'],
        heartbeatAt: REPORTER_FORWARD_HEARTBEAT_AT,
        readyLeaseExpiresAt: REPORTER_FORWARD_READY_LEASE_AT,
        heartbeatOnly: true,
        nodeStatePublicationMode:
          CONTROL_PLANE_NODE_STATE_PUBLICATION_MODE.HEARTBEAT_RECOVERY,
      }, 'steady-state reporter should preserve the canonical publication mode');
      t.same(
        capturedUpdateOptions?.nodeRow,
        {
          [COLUMN.NODE_ID]: REPORTER_FORWARD_NODE_ID,
        },
        'steady-state reporter should preserve the canonical node row payload',
      );
    } finally {
      ControlPlaneSetup.create = originalCreate;
    }
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

test('NodeJoiningService - resets STOPPED lifecycle before retryable resume attempts',
  async (t) => {
    initializeTestEnvironment();

    const service = new NodeJoiningService({
      nodeId: 'joining-node-lifecycle-reset-1',
      nodeAddress: 'ws://localhost:9001',
      seedNodeAddress: 'http://localhost:8080',
    });

    service.lifecycleStateMachine.transition('connecting');
    service.lifecycleStateMachine.transition('stopped');
    service.phase = JoiningPhase.FAILED;
    service._completedJoinPhases = [JoiningPhase.CONTACTING_SEED];

    service.resetLifecycleStateForRetryableResumeAttempt(2);

    t.equal(
      service.lifecycleStateMachine.getState(),
      'starting',
      'retryable resume should reinitialize lifecycle from STARTING',
    );
    t.equal(
      service.getPhase(),
      JoiningPhase.NOT_STARTED,
      'retryable resume should reset join phase before next attempt',
    );
    t.equal(
      service._completedJoinPhases.length,
      0,
      'retryable resume should clear deferred completed sub-phases',
    );
    t.equal(
      service.lifecycleStateMachine.transition('connecting'),
      true,
      'reinitialized lifecycle should allow CONNECTING transition',
    );
  });

test('NodeJoiningService - retryable auto-resume budget covers one full ' +
  'contact-seed retry window', async (t) => {
  initializeTestEnvironment();

  const service = new NodeJoiningService({
    nodeId: 'joining-node-auto-resume-budget-1',
    nodeAddress: 'ws://localhost:9099',
    seedNodeAddress: 'http://localhost:8080',
    config: {
      autoResumeRetryableFailures: true,
      leadershipWaitTimeoutMs: 240000,
      httpTimeoutMs: 60000,
    },
  });

  const policy = service.resolveRetryableJoinResumePolicy();
  t.equal(
    policy.maxElapsedMs,
    300000,
    'resume budget should allow one full seed-contact retry window plus the in-flight HTTP timeout',
  );

  service.startTime = 0;
  service.now = () => 240668;
  const retryableSeedTimeout = new Error(
    'Failed to contact seed node: Request timeout after 60000ms',
  );
  retryableSeedTimeout.deferRetry = true;
  retryableSeedTimeout.retryAfterMs = 5000;

  t.equal(
    service.shouldAutoResumeRetryableJoinFailure(
      retryableSeedTimeout,
      {
        phase: 'contacting_seed',
        error: 'Failed to contact seed node: Request timeout after 60000ms',
      },
      1,
      policy,
    ),
    true,
    'one full contact-seed timeout window should not exhaust auto-resume before a retry can begin',
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

test('NodeJoiningService - canonical join readiness exposes promotable state once convergence is complete',
  async (t) => {
    initializeTestEnvironment();

    const service = new NodeJoiningService({
      nodeId: 'joining-node-promotion-ready',
      nodeAddress: 'ws://localhost:9090',
      seedNodeAddress: 'http://localhost:8080',
    });
    service.systemCacheHydrated = true;

    const evaluation = service.joinReadinessEvaluator
      .evaluateCanonicalJoinReadinessSnapshot({
        routingReady: true,
        topologyReady: true,
        requiredSchemaVersion: '1740589945123:7:seed-1',
        appliedSchemaVersion: '1740589945123:7:seed-1',
      });

    t.equal(
      evaluation.promotionState,
      JOIN_PROMOTION_STATE.PROMOTABLE,
      'converged readiness should surface the promotable intermediate state before READY transition',
    );
    t.equal(
      evaluation.ready,
      true,
      'promotable convergence should satisfy the readiness gate',
    );
  });

test('NodeJoiningService - durable rejoin readiness remains restoring until local restore completes',
  async (t) => {
    initializeTestEnvironment();

    const service = new NodeJoiningService({
      nodeId: 'joining-node-promotion-rejoin',
      nodeAddress: 'ws://localhost:9090',
      seedNodeAddress: 'http://localhost:8080',
      startupMode: STARTUP_JOIN_MODE.DURABLE_REJOIN,
    });
    service.systemCacheHydrated = true;
    service.durableRejoinRestoreState =
      JOIN_REJOIN_PROMOTION_RESTORE_STATE.RESTORING;

    const evaluation = service.joinReadinessEvaluator
      .evaluateCanonicalJoinReadinessSnapshot({
        routingReady: true,
        topologyReady: true,
        requiredSchemaVersion: '1740589945123:7:seed-1',
        appliedSchemaVersion: '1740589945123:7:seed-1',
      });

    t.equal(
      evaluation.promotionState,
      JOIN_PROMOTION_STATE.RESTORING,
      'durable rejoin should keep the join state in restoring until local services are restored',
    );
    t.same(
      evaluation.promotionReasons,
      ['durable_rejoin_restore_active'],
      'durable rejoin restore should surface one explicit promotion reason',
    );
    t.equal(
      evaluation.ready,
      false,
      'restore-in-progress should not satisfy the readiness gate',
    );
  });

test('NodeJoiningService - canonical join readiness stays catching_up while schema or replica convergence still lags',
  async (t) => {
    initializeTestEnvironment();

    const service = new NodeJoiningService({
      nodeId: 'joining-node-catching-up',
      nodeAddress: 'ws://localhost:9090',
      seedNodeAddress: 'http://localhost:8080',
    });
    service.systemCacheHydrated = true;

    const evaluation = service.joinReadinessEvaluator
      .evaluateCanonicalJoinReadinessSnapshot({
        routingReady: true,
        topologyReady: true,
        requiredSchemaVersion: '1740589945123:7:seed-1',
        appliedSchemaVersion: '1740589945123:6:seed-1',
        inFlightReplicaOperations: 2,
      });

    t.equal(
      evaluation.promotionState,
      JOIN_PROMOTION_STATE.CATCHING_UP,
      'fully hydrated routing/topology should remain catching_up while schema or replica convergence still lags',
    );
    t.same(
      evaluation.promotionReasons,
      ['schema_version_lag', 'in_flight_replica_operations'],
      'catching_up should preserve the explicit remaining convergence blockers',
    );
    t.equal(
      evaluation.ready,
      false,
      'catching_up should not satisfy the readiness gate',
    );
  });
