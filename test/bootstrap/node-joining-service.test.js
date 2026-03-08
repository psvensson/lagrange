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
import {WORK_CLASS} from '../../src/runtime/work-class-scheduler.js';
import {ENTRYPOINT_DEFAULT} from '../../src/constants/entrypoint.js';
import {
  CDC_OPERATION,
  COLUMN,
  ENDPOINT_STATUS,
  SERVICE_TYPE,
  SERVICE_STATUS,
  TABLES,
  TRANSPORT_TYPE,
} from '../../src/constants/index.js';
import {META_SERVICE_ID} from '../../src/constants/wasm-meta.js';
import {URL} from 'url';

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

test('NodeJoiningService - resolves control plane target from services metadata first',
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
          'seed-node-1/message-group/mg-1-r3',
        ],
      },
    };

    service.messageRouter = {
      getConnectionState: (nodeId) => {
        return nodeId === 'seed-node-1' ? 'connected' : 'disconnected';
      },
    };

    const nodeService = NodeService.getInstance();
    nodeService.initialize({nodeId: 'joining-node-1'});
    const cache = nodeService.getSystemTableCache();
    cache.applySystemTableChange('services', 'INSERT', {
      service_id: 'mg-1-r1',
      group_id: 'mg-1',
      node_id: 'joining-node-1',
      service_type: 'message_group',
      address: 'joining-node-1/message-group/mg-1-r1',
      status: 'active',
      raft_role: 'follower',
    });
    cache.applySystemTableChange('services', 'INSERT', {
      service_id: 'mg-1-r2',
      group_id: 'mg-1',
      node_id: 'seed-node-1',
      service_type: 'message_group',
      address: 'seed-node-1/message-group/mg-1-r2',
      status: 'active',
      raft_role: 'leader',
    });

    const target = service.resolveControlPlaneTargetAddress({
      allowBootstrapHints: false,
    });

    t.equal(
      target,
      'seed-node-1/message-group/mg-1-r2',
      'should use authoritative services metadata target instead of stale cached target',
    );
  });

test('NodeJoiningService - falls back to bootstrap hints when authoritative target missing',
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
    'authoritative target resolution should refuse self-loop heartbeats',
  );
  t.equal(
    service.resolveControlPlaneTargetAddress(),
    'seed-node-1/message-group/mg-1-r3',
    'move-replica heartbeats should fall back to seed bootstrap hints instead of self-targeting',
  );
});

test('NodeJoiningService - prefers local target for NODE_STATE_UPDATE ' +
  'when authoritative metadata has a local active replica', async (t) => {
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

  const nodeService = NodeService.getInstance();
  nodeService.initialize({nodeId: 'joining-node-local'});
  const cache = nodeService.getSystemTableCache();
  cache.applySystemTableChange('services', 'INSERT', {
    service_id: 'mg-1-r2',
    group_id: 'mg-1',
    node_id: 'joining-node-local',
    service_type: 'message_group',
    address: 'joining-node-local/message-group/mg-1-r2',
    status: 'active',
    raft_role: 'follower',
    updated_at: 20,
  });
  cache.applySystemTableChange('services', 'INSERT', {
    service_id: 'mg-1-r3',
    group_id: 'mg-1',
    node_id: 'seed-node-1',
    service_type: 'message_group',
    address: 'seed-node-1/message-group/mg-1-r3',
    status: 'active',
    raft_role: 'leader',
    updated_at: 10,
  });

  await service.sendControlPlaneNodeStateUpdate({state: 'connected'});

  t.same(deliveries, [
    {
      targetAddress: 'joining-node-local/message-group/mg-1-r2',
      state: 'connected',
    },
  ], 'NODE_STATE_UPDATE should use the local active replica before remote routes');
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
      'ws://localhost:8083',
      'should derive reconnect address from node_address',
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
    t.equal(connectCalls[0].wsAddress, 'ws://localhost:8086',
      'should derive websocket address from authoritative cache row');
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

    const callOrder = [];
    service.resolveControlPlaneTargetAddress = () => 'seed-node/message-group/mg-1-r1';
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
      'connect:late-peer:ws://localhost:8087',
    ], 'ready update should not wait on best-effort peer mesh repair');
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
    service.resolveControlPlaneTargetAddress = () => 'seed-node/message-group/mg-1-r1';
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
      this.messageGroupServices.set(replicaId, {
        groupId: 'mg-1',
        unifiedAddress: `${this.nodeId}/message-group/${replicaId}`,
        isLeaderReplica: () => true,
        getLeaderId: () => replicaId,
      });
    };

    // Mock phases that require system tables (not available in this unit test)
    service.phaseQuerySystemState = async function() {
      // Skip actual system table queries - just mark as complete
    };
    service.initializeReplicaHandler = function() {
      // Skip replica handler initialization
    };
    service.initializeControlPlaneService = async function() {
      // Skip control plane service initialization
    };
    service.initializeRuntimeServiceHandler = function() {
      // Skip runtime service handler initialization
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
    setNodeStateReporter(reporter) {
      reporterAssignments.push(reporter);
    },
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
  service.signalReadyForReplicas = async () => {
    order.push('ready');
  };

  const result = await service.join();

  t.equal(result.success, true, 'join should succeed');
  t.equal(order.includes('query'), true, 'should query system state');
  t.equal(order.includes('ready'), true, 'should signal readiness');
  t.equal(order.indexOf('query') < order.indexOf('ready'), true,
    'should signal readiness after state query');
  t.same(
    reporterAssignments,
    [],
    'should not force control-plane reporter teardown after the initial ready signal',
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
      };
      service.controlPlaneTargetAddress = 'seed-node-1/message-group/mg-1-r0';
    };
    service.phaseCreateSelfHostedMessageGroup = async () => {};
    service.phaseJoinExistingMessageGroup = async () => {};
    service.phaseWaitForLeadership = async () => {};
    service.initializeReplicaHandler = () => {};
    service.initializeMessageGroupServiceHandler = () => {};
    service.initializeControlPlaneService = async () => {};
    service.createCdcIntegrationService = () => ({});
    service.ensureLatencyTopologyOwners = () => ({});
    service.rpcClient = {
      shutdown: async () => {},
    };
    service.initializeRuntimeServiceHandler = () => {};
    service.phaseQuerySystemState = async () => {};
    service.signalReadyForReplicas = async () => {};
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

    const reasons = service.classifyCanonicalJoinReadinessReasons({
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
      await service.waitForCanonicalJoinReadinessConvergence();
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
      const topology = service.evaluateCanonicalJoinTopologyReadiness(cache);
      return {
        routingReady: true,
        topologyReady: topology.ready,
        requiredSchemaVersion: '1740589945123:7:seed-1',
        appliedSchemaVersion: '1740589945123:7:seed-1',
        missingLeaders: topology.missingLeaders,
        inFlightReplicaOperations: topology.inFlightReplicaOperations,
        inFlightReplicaOperationDetails: topology.inFlightReplicaOperationDetails,
        missingNodeEndpointNodeIds: topology.missingNodeEndpointNodeIds,
        missingPostgresWireNodeIds: topology.missingPostgresWireNodeIds,
      };
    };
    service.backfillPropagatedCacheTablesFromAuthoritativeState = async (tableNames) => {
      repairCalls.push(Array.isArray(tableNames) ? [...tableNames] : []);
      cache.applySystemTableChange(TABLES.SERVICE_ENDPOINTS, CDC_OPERATION.UPSERT, {
        [COLUMN.ENDPOINT_ID]: 'sys-postgres-wire-ep-seed-node',
        [COLUMN.SERVICE_ID]: META_SERVICE_ID.POSTGRES_WIRE,
        [COLUMN.NODE_ID]: 'seed-node',
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
      [COLUMN.ENDPOINT_ID]: 'ep-seed-node-ws',
      [COLUMN.NODE_ID]: 'seed-node',
      [COLUMN.TRANSPORT_TYPE]: TRANSPORT_TYPE.WEBSOCKET,
      [COLUMN.STATUS]: ENDPOINT_STATUS.ACTIVE,
      [COLUMN.UPDATED_AT]: 1,
    });
    cache.applySystemTableChange(TABLES.NODE_ENDPOINTS, CDC_OPERATION.UPSERT, {
      [COLUMN.ENDPOINT_ID]: 'ep-joining-node-join-gate-repair-ws',
      [COLUMN.NODE_ID]: 'joining-node-join-gate-repair',
      [COLUMN.TRANSPORT_TYPE]: TRANSPORT_TYPE.WEBSOCKET,
      [COLUMN.STATUS]: ENDPOINT_STATUS.ACTIVE,
      [COLUMN.UPDATED_AT]: 2,
    });
    cache.applySystemTableChange(TABLES.SERVICE_ENDPOINTS, CDC_OPERATION.UPSERT, {
      [COLUMN.ENDPOINT_ID]:
        'sys-postgres-wire-ep-joining-node-join-gate-repair',
      [COLUMN.SERVICE_ID]: META_SERVICE_ID.POSTGRES_WIRE,
      [COLUMN.NODE_ID]: 'joining-node-join-gate-repair',
      health_status: 'healthy',
      [COLUMN.UPDATED_AT]: 2,
    });

    await service.waitForCanonicalJoinReadinessConvergence();

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

test('NodeJoiningService - canonical join topology waits for endpoint visibility',
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

    let topology = service.evaluateCanonicalJoinTopologyReadiness(cache);
    t.equal(topology.ready, false, 'topology should fail closed without endpoints');
    t.same(
      topology.missingNodeEndpointNodeIds.sort(),
      ['joining-node-endpoint-gate', 'seed-node'],
      'topology should require websocket node endpoints for all active nodes',
    );
    t.same(
      topology.missingPostgresWireNodeIds.sort(),
      ['joining-node-endpoint-gate', 'seed-node'],
      'topology should require postgres-wire endpoints for all active nodes',
    );

    cache.applySystemTableChange(TABLES.NODE_ENDPOINTS, CDC_OPERATION.UPSERT, {
      [COLUMN.ENDPOINT_ID]: 'ep-seed-node-ws',
      [COLUMN.NODE_ID]: 'seed-node',
      [COLUMN.TRANSPORT_TYPE]: TRANSPORT_TYPE.WEBSOCKET,
      [COLUMN.STATUS]: ENDPOINT_STATUS.ACTIVE,
    });
    cache.applySystemTableChange(TABLES.NODE_ENDPOINTS, CDC_OPERATION.UPSERT, {
      [COLUMN.ENDPOINT_ID]: 'ep-joining-node-endpoint-gate-ws',
      [COLUMN.NODE_ID]: 'joining-node-endpoint-gate',
      [COLUMN.TRANSPORT_TYPE]: TRANSPORT_TYPE.WEBSOCKET,
      [COLUMN.STATUS]: ENDPOINT_STATUS.ACTIVE,
    });
    cache.applySystemTableChange(TABLES.SERVICE_ENDPOINTS, CDC_OPERATION.UPSERT, {
      [COLUMN.ENDPOINT_ID]: 'sys-postgres-wire-ep-seed-node',
      [COLUMN.SERVICE_ID]: META_SERVICE_ID.POSTGRES_WIRE,
      [COLUMN.NODE_ID]: 'seed-node',
      health_status: 'healthy',
    });

    topology = service.evaluateCanonicalJoinTopologyReadiness(cache);
    t.equal(topology.ready, false, 'topology should wait for every active postgres endpoint');
    t.same(
      topology.missingPostgresWireNodeIds,
      ['joining-node-endpoint-gate'],
      'topology should identify nodes missing postgres-wire visibility',
    );

    cache.applySystemTableChange(TABLES.SERVICE_ENDPOINTS, CDC_OPERATION.UPSERT, {
      [COLUMN.ENDPOINT_ID]: 'sys-postgres-wire-ep-joining-node-endpoint-gate',
      [COLUMN.SERVICE_ID]: META_SERVICE_ID.POSTGRES_WIRE,
      [COLUMN.NODE_ID]: 'joining-node-endpoint-gate',
      health_status: 'healthy',
    });

    topology = service.evaluateCanonicalJoinTopologyReadiness(cache);
    t.equal(topology.ready, true, 'topology should become ready once endpoint visibility converges');
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
        [COLUMN.ENDPOINT_ID]: 'ep-joining-node-backfill-gate-ws',
        [COLUMN.NODE_ID]: 'joining-node-backfill-gate',
        [COLUMN.TRANSPORT_TYPE]: TRANSPORT_TYPE.WEBSOCKET,
        [COLUMN.STATUS]: ENDPOINT_STATUS.ACTIVE,
        [COLUMN.UPDATED_AT]: 2,
      });
      cache.applySystemTableChange(TABLES.SERVICE_ENDPOINTS, CDC_OPERATION.UPSERT, {
        [COLUMN.ENDPOINT_ID]: 'sys-postgres-wire-ep-joining-node-backfill-gate',
        [COLUMN.SERVICE_ID]: META_SERVICE_ID.POSTGRES_WIRE,
        [COLUMN.NODE_ID]: 'joining-node-backfill-gate',
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
                    [COLUMN.ENDPOINT_ID]: 'ep-seed-node-ws',
                    [COLUMN.NODE_ID]: 'seed-node',
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
                    [COLUMN.ENDPOINT_ID]: 'sys-postgres-wire-ep-seed-node',
                    [COLUMN.SERVICE_ID]: META_SERVICE_ID.POSTGRES_WIRE,
                    [COLUMN.NODE_ID]: 'seed-node',
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

      let topology = service.evaluateCanonicalJoinTopologyReadiness(cache);
      t.equal(topology.ready, false,
        'topology should fail before authoritative backfill restores missed rows');
      t.same(
        topology.missingNodeEndpointNodeIds,
        ['seed-node'],
        'seed websocket endpoint should be missing before backfill',
      );
      t.same(
        topology.missingPostgresWireNodeIds,
        ['seed-node'],
        'seed postgres-wire endpoint should be missing before backfill',
      );

      await service.backfillPropagatedCacheTablesFromAuthoritativeState();

      topology = service.evaluateCanonicalJoinTopologyReadiness(cache);
      t.equal(topology.ready, true,
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
        registerNodeBudget: async ({nodeRow}) => ({
          result: {success: true},
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

      await service.registerNodeInCluster();

      t.ok(
        cache.get(TABLES.NODES, 'join-cache-seed-node'),
        'join should seed the local nodes cache row',
      );
      t.ok(
        cache.get(TABLES.NODE_ENDPOINTS, 'ep-join-cache-seed-node-ws'),
        'join should seed the local node_endpoints cache row',
      );
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
      this.messageGroupServices.set(replicaId, {
        groupId: 'mg-1',
        unifiedAddress: `${this.nodeId}/message-group/${replicaId}`,
        isLeaderReplica: () => true,
        getLeaderId: () => replicaId,
      });
    };
    service.phaseWaitForLeadership = async function() {};
    service.getLeaderMessageGroupService = function() {
      const firstService = this.messageGroupServices.values().next().value;
      return firstService || null;
    };

    // Mock phases that require system tables (not available in this unit test)
    service.phaseQuerySystemState = async function() {};
    service.initializeReplicaHandler = function() {};
    service.initializeControlPlaneService = async function() {};
    service.initializeRuntimeServiceHandler = function() {};
    service.signalReadyForReplicas = async function() {};

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
          isLeaderReplica: () => true,
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
