/**
 * Tests for Node Joining Service.
 * Requirements: 7.8, 7.10, 7.11, 7.14
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  NodeJoiningService,
} from '../../src/bootstrap/node-joining-service.js';
import {
  MESSAGE_GROUP_ASSIGNMENT_STRATEGY as AssignmentStrategy,
} from '../../src/bootstrap/message-group-assignment.js';
import {NodeService} from '../../src/node/node-service.js';
import {
  initializeTestEnvironment,
} from './node-joining-service-test-support.js';
import {
} from '../../src/control-plane/control-plane-kernel-ingress.js';
import {
  PRESSURE_GOVERNOR_ERROR_CODE,
} from '../../src/control-plane/pressure-governor.js';
import {
} from '../../src/bootstrap/join-session-store.js';
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
} from '../../src/bootstrap/bootstrap-constants.js';
import {ENTRYPOINT_DEFAULT} from '../../src/constants/entrypoint.js';
import {SERVICE_STATUS} from '../../src/constants/index.js';

const DEFAULT_SEED_WS_ADDRESS =
  `ws://localhost:${8080 + ENTRYPOINT_DEFAULT.WS_PORT_OFFSET}`;
const QUERY_STATE_SERVICE_REGISTRATION_SHORTCUT_OPTION =
  'preferControlPlaneUpsert';
const QUERY_STATE_SERVICE_REGISTRATION_ADMISSION_TARGET =
  'create-self-hosted join metadata service registration';
const TEST_SHORTCUT_RETRY_AFTER_MS = 125;
const TEST_TERMINAL_SHORTCUT_ERROR_CODE =
  'SHORTCUT_VALIDATION_FAILED';
const TEST_SHORTCUT_NON_SUCCESS_ERROR_PATTERN =
  /shortcut returned non-success/;

test('NodeJoiningService - bypasses HTTP register-service for local seed self-registration',
  async (t) => {
    initializeTestEnvironment();

    let httpCalls = 0;
    const upsertCalls = [];
    const seededRows = [];
    const service = new NodeJoiningService({
      bootIncarnation: 1,
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
      bootIncarnation: 1,
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

test('NodeJoiningService - query-state shortcut preserves retryable ' +
  'control-plane pressure', async (t) => {
  initializeTestEnvironment();

  let httpCalls = 0;
  let upsertCalls = 0;
  const service = new NodeJoiningService({
    bootIncarnation: 1,
    nodeId: 'join-node-shortcut-pressure',
    nodeAddress: 'ws://localhost:9090',
    seedNodeAddress: 'http://localhost:8080',
    httpPost: async () => {
      httpCalls += 1;
      return {success: true};
    },
  });
  service.seedNodeId = 'seed-node-1';
  service.upsertJoinServiceRowWithRetry = async () => {
    upsertCalls += 1;
    return {
      success: false,
      error: 'control_plane_pressure_degraded',
      errorCode:
        PRESSURE_GOVERNOR_ERROR_CODE.CONTROL_PLANE_PRESSURE_DEGRADED,
      retryAfterMs: TEST_SHORTCUT_RETRY_AFTER_MS,
    };
  };

  const error = await t.rejects(
    service.registerMessageGroupService(
      'mg-1',
      'mg-1-r0',
      {getRole: () => 'leader'},
      {
        status: SERVICE_STATUS.STOPPED,
        [QUERY_STATE_SERVICE_REGISTRATION_SHORTCUT_OPTION]: true,
      },
    ),
    'retryable shortcut pressure should surface for outer resume',
  );

  t.equal(httpCalls, 0, 'retryable shortcut should not fall back to HTTP');
  t.equal(upsertCalls, 1, 'shortcut should attempt one owner write');
  t.equal(
    error?.deferRetry,
    true,
    'retryable shortcut failure should preserve defer semantics',
  );
  t.equal(
    error?.retryable,
    true,
    'retryable shortcut failure should preserve retryable metadata',
  );
  t.equal(
    error?.retryAfterMs,
    TEST_SHORTCUT_RETRY_AFTER_MS,
    'retryable shortcut failure should preserve retry delay hints',
  );
  t.equal(
    error?.code,
    PRESSURE_GOVERNOR_ERROR_CODE.CONTROL_PLANE_PRESSURE_DEGRADED,
    'retryable shortcut failure should preserve control-plane code',
  );
  t.equal(
    error?.bootstrapResponse?.success,
    false,
    'retryable shortcut failure should retain the owner result',
  );
});

test('NodeJoiningService - query-state shortcut keeps terminal ' +
  'non-retryable failures terminal', async (t) => {
  initializeTestEnvironment();

  let httpCalls = 0;
  let upsertCalls = 0;
  const service = new NodeJoiningService({
    bootIncarnation: 1,
    nodeId: 'join-node-shortcut-terminal',
    nodeAddress: 'ws://localhost:9090',
    seedNodeAddress: 'http://localhost:8080',
    httpPost: async () => {
      httpCalls += 1;
      return {success: true};
    },
  });
  service.seedNodeId = 'seed-node-1';
  service.upsertJoinServiceRowWithRetry = async () => {
    upsertCalls += 1;
    return {
      success: false,
      error: 'shortcut validation failed',
      errorCode: TEST_TERMINAL_SHORTCUT_ERROR_CODE,
    };
  };

  const error = await t.rejects(
    service.registerMessageGroupService(
      'mg-1',
      'mg-1-r0',
      {getRole: () => 'leader'},
      {
        status: SERVICE_STATUS.STOPPED,
        [QUERY_STATE_SERVICE_REGISTRATION_SHORTCUT_OPTION]: true,
      },
    ),
    'terminal shortcut failure should still reject',
  );

  t.equal(httpCalls, 0, 'terminal shortcut should not fall back to HTTP');
  t.equal(upsertCalls, 1, 'terminal shortcut should attempt one owner write');
  t.notOk(
    error?.deferRetry,
    'non-retryable shortcut failure should not defer retry',
  );
  t.notOk(
    error?.retryable,
    'non-retryable shortcut failure should not become retryable',
  );
  t.match(
    error?.message,
    TEST_SHORTCUT_NON_SUCCESS_ERROR_PATTERN,
    'terminal shortcut failure should preserve the shortcut failure message',
  );
});

test('NodeJoiningService - fails fast on unauthorized replica owner conflict at startup',
  async (t) => {
    initializeTestEnvironment();

    const service = new NodeJoiningService({
      bootIncarnation: 1,
      nodeId: 'joining-node-ownership-1',
      nodeAddress: 'ws://localhost:9090',
      seedNodeAddress: 'http://localhost:8080',
    });
    service.bootstrapResponse = {
      messageGroupAssignment: {
        strategy: 'MOVE_REPLICA',
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

// W8 (identity-reuse safety fix, A3): no assignment authorizes starting a
// message-group replica another node owns - not even a MOVE_REPLICA
// assignment with a token from a seed that still moves message-group
// identities; this test once pinned that takeover.
test(
  'NodeJoiningService - refuses replica startup even when an old-style ' +
    'MOVE_REPLICA assignment token names the replica',
  async (t) => {
    initializeTestEnvironment();

    const service = new NodeJoiningService({
      bootIncarnation: 1,
      nodeId: 'joining-node-ownership-2',
      nodeAddress: 'ws://localhost:9090',
      seedNodeAddress: 'http://localhost:8080',
    });
    service.bootstrapResponse = {
      messageGroupAssignment: {
        strategy: 'MOVE_REPLICA',
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

    t.throws(
      () => service.assertReplicaStartupOwnership('mg-1-r1'),
      /replica_owner_conflict/i,
      'a moved message-group identity is never started on a joiner',
    );
  },
);

test('NodeJoiningService - retries generic HTTP 503 and honors retry hints with jitter',
  async (t) => {
    initializeTestEnvironment();

    let attempts = 0;
    const retryDelays = [];
    const service = new NodeJoiningService({
      bootIncarnation: 1,
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
    bootIncarnation: 1,
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

test('NodeJoiningService - exhausted seed-contact transport failures preserve ' +
  'auto-resume hints', async (t) => {
  initializeTestEnvironment();

  let currentNow = 0;
  const retryDelays = [];
  const service = new NodeJoiningService({
    bootIncarnation: 1,
    nodeId: '550e8400-e29b-41d4-a716-446655440120',
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
      leadershipWaitInitialDelayMs: 10,
      leadershipWaitMaxDelayMs: 10,
      leadershipWaitBackoffMultiplier: 1,
      leadershipWaitJitterRatio: 0,
    },
    httpPost: async () => {
      currentNow += 10;
      throw new Error('fetch failed');
    },
  });

  const error = await t.rejects(
    service.phaseContactSeed(),
    'retryable transport exhaustion should still throw',
  );

  t.equal(
    error?.message,
    'Failed to contact seed node: fetch failed',
    'transport exhaustion should keep the contact-seed context',
  );
  t.equal(
    error?.deferRetry,
    true,
    'transport exhaustion should preserve retryability',
  );
  t.equal(
    error?.retryAfterMs,
    10,
    'transport exhaustion should preserve retry delay hints',
  );
  t.same(
    retryDelays,
    [10],
    'phase should make one bounded retry before surfacing transport failure',
  );
});

test('NodeJoiningService - contact-seed request timeout uses remaining retry budget',
  async (t) => {
    initializeTestEnvironment();

    const TEST_RETRY_AFTER_MS = 5;
    const TEST_RETRY_DELAY_MS = 10;
    const TEST_HTTP_TIMEOUT_MS = 25;
    const TEST_RETRY_TIMEOUT_MS = 40;
    const TEST_REMAINING_TIMEOUT_MS = 5;
    const TEST_BOOTSTRAP_PHASE = 'partitions';
    const TEST_RETRYABLE_RESPONSE = Object.freeze({
      success: false,
      error: 'Bootstrap not ready',
      code: BOOTSTRAP_PIPELINE_ERROR_CODE.BOOTSTRAP_NOT_READY,
      phase: TEST_BOOTSTRAP_PHASE,
      retryAfterMs: TEST_RETRY_AFTER_MS,
    });

    let attempts = 0;
    let currentNow = 0;
    const observedTimeoutMs = [];
    const retryDelays = [];
    const service = new NodeJoiningService({
      bootIncarnation: 1,
      nodeId: '550e8400-e29b-41d4-a716-446655440119',
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
        observedTimeoutMs.push(options.timeoutMs);
        currentNow += options.timeoutMs;
        if (attempts === 1) {
          const error = new Error(
            `HTTP 503: ${JSON.stringify(TEST_RETRYABLE_RESPONSE)}`,
          );
          error.statusCode = 503;
          throw error;
        }
        throw new Error('Request timeout after ' + options.timeoutMs + 'ms');
      },
    });

    const error = await t.rejects(
      service.phaseContactSeed(),
      'near the retry deadline, contact-seed should surface a retryable timeout',
    );

    t.equal(attempts, 2, 'phase should keep the existing bounded in-call retry');
    t.same(
      observedTimeoutMs,
      [TEST_HTTP_TIMEOUT_MS, TEST_REMAINING_TIMEOUT_MS],
      'later seed-contact transport attempts should not exceed the remaining retry budget',
    );
    t.equal(
      error?.message,
      'Failed to contact seed node: Request timeout after ' +
        TEST_REMAINING_TIMEOUT_MS + 'ms',
      'surfaced timeout should reflect the budget-bounded transport attempt',
    );
    t.equal(
      error?.deferRetry,
      true,
      'budget-bounded seed contact timeout should remain retryable',
    );
    t.same(
      retryDelays,
      [TEST_RETRY_DELAY_MS],
      'phase should spend only the canonical retry delay before the bounded attempt',
    );
  },
);

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
    bootIncarnation: 1,
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
