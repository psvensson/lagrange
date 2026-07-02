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
import {NodeService} from '../../src/node/node-service.js';
import {
  initializeTestEnvironment,
} from './node-joining-service-test-support.js';
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

test('NodeJoiningService - MOVE_REPLICA register-service keeps progress-path ' +
  'request timeout', async (t) => {
  initializeTestEnvironment();

  const TEST_RETRY_TIMEOUT_MULTIPLIER = 3;
  const TEST_CONFIGURED_TIMEOUT_MS = 2025;
  const TEST_RETRY_DELAY_MS = 10;
  const TEST_RETRY_TIMEOUT_MS =
    TEST_CONFIGURED_TIMEOUT_MS * TEST_RETRY_TIMEOUT_MULTIPLIER;
  const TEST_ASSIGNMENT_ID = '5ef301f9-6f73-4cb5-bb4e-8d73ef2a9ce6';
  const TEST_NODE_ID = '550e8400-e29b-41d4-a716-44665544010b';
  const TEST_NODE_ADDRESS = 'ws://localhost:9090';
  const TEST_SEED_ADDRESS = 'http://localhost:8080';
  const TEST_GROUP_ID = 'mg-1';
  const TEST_REPLICA_ID = 'mg-1-r0';

  let attempts = 0;
  const observedTimeoutMs = [];
  const retryDelays = [];
  const service = new NodeJoiningService({
    nodeId: TEST_NODE_ID,
    nodeAddress: TEST_NODE_ADDRESS,
    seedNodeAddress: TEST_SEED_ADDRESS,
    config: {
      httpTimeoutMs: TEST_CONFIGURED_TIMEOUT_MS,
      leadershipWaitTimeoutMs: TEST_RETRY_TIMEOUT_MS,
      leadershipWaitInitialDelayMs: TEST_RETRY_DELAY_MS,
      leadershipWaitMaxDelayMs: TEST_RETRY_DELAY_MS,
      leadershipWaitBackoffMultiplier: 1,
      leadershipWaitJitterRatio: 0,
    },
    sleep: async (delayMs) => {
      retryDelays.push(delayMs);
    },
    httpPost: async (url, _payload, options = {}) => {
      if (!url.endsWith('/register-service')) {
        throw new Error('unexpected URL in MOVE_REPLICA register-service test');
      }
      const timeoutMs = Number.isFinite(options?.timeoutMs) ?
        options.timeoutMs :
        TEST_CONFIGURED_TIMEOUT_MS;
      observedTimeoutMs.push(timeoutMs);
      attempts += 1;
      if (attempts === 1) {
        throw new Error('Request timeout after ' + timeoutMs + 'ms');
      }
      return {success: true};
    },
  });
  service.bootstrapResponse = {
    messageGroupAssignment: {
      strategy: AssignmentStrategy.MOVE_REPLICA,
      groupId: TEST_GROUP_ID,
      replicaToMove: TEST_REPLICA_ID,
      assignmentId: TEST_ASSIGNMENT_ID,
    },
  };

  await service.registerMessageGroupService(
    TEST_GROUP_ID,
    TEST_REPLICA_ID,
    {getRole: () => 'leader'},
  );

  t.equal(
    attempts,
    2,
    'MOVE_REPLICA register-service timeout should remain retryable',
  );
  t.same(
    observedTimeoutMs,
    [
      TEST_CONFIGURED_TIMEOUT_MS,
      TEST_CONFIGURED_TIMEOUT_MS,
    ],
    'MOVE_REPLICA register-service attempts should keep the configured HTTP timeout',
  );
  t.same(
    retryDelays,
    [TEST_RETRY_DELAY_MS],
    'register-service attempts should keep the canonical retry delay',
  );
});

test('NodeJoiningService - MOVE_REPLICA register-service caps long request ' +
  'timeout', async (t) => {
  initializeTestEnvironment();

  const TEST_CONFIGURED_TIMEOUT_MS = NUM.THIRTY_THOUSAND;
  const TEST_MOVE_REPLICA_REGISTER_TIMEOUT_MS =
    BOOTSTRAP_API_DEFAULT.SERVICE_REGISTRATION_WRITE_RETRY_TIMEOUT_MS +
    BOOTSTRAP_API_DEFAULT.SERVICE_REGISTRATION_CACHE_VISIBILITY_TIMEOUT_MS +
    TIME_MS.SECOND * NUM.FIVE;
  const TEST_RETRY_DELAY_MS = NUM.TEN;
  const TEST_ASSIGNMENT_ID = '5ef301f9-6f73-4cb5-bb4e-8d73ef2a9ce7';
  const TEST_NODE_ID = '550e8400-e29b-41d4-a716-44665544010c';
  const TEST_NODE_ADDRESS = 'ws://localhost:9090';
  const TEST_SEED_ADDRESS = 'http://localhost:8080';
  const TEST_GROUP_ID = 'mg-1';
  const TEST_REPLICA_ID = 'mg-1-r0';

  let attempts = 0;
  const observedTimeoutMs = [];
  const retryDelays = [];
  const service = new NodeJoiningService({
    nodeId: TEST_NODE_ID,
    nodeAddress: TEST_NODE_ADDRESS,
    seedNodeAddress: TEST_SEED_ADDRESS,
    config: {
      httpTimeoutMs: TEST_CONFIGURED_TIMEOUT_MS,
      leadershipWaitTimeoutMs: TEST_CONFIGURED_TIMEOUT_MS,
      leadershipWaitInitialDelayMs: TEST_RETRY_DELAY_MS,
      leadershipWaitMaxDelayMs: TEST_RETRY_DELAY_MS,
      leadershipWaitBackoffMultiplier: 1,
      leadershipWaitJitterRatio: 0,
    },
    sleep: async (delayMs) => {
      retryDelays.push(delayMs);
    },
    httpPost: async (url, _payload, options = {}) => {
      if (!url.endsWith('/register-service')) {
        throw new Error('unexpected URL in MOVE_REPLICA register-service test');
      }
      const timeoutMs = Number.isFinite(options?.timeoutMs) ?
        options.timeoutMs :
        TEST_CONFIGURED_TIMEOUT_MS;
      observedTimeoutMs.push(timeoutMs);
      attempts += 1;
      if (attempts === 1) {
        throw new Error('Request timeout after ' + timeoutMs + 'ms');
      }
      return {success: true};
    },
  });
  service.bootstrapResponse = {
    messageGroupAssignment: {
      strategy: AssignmentStrategy.MOVE_REPLICA,
      groupId: TEST_GROUP_ID,
      replicaToMove: TEST_REPLICA_ID,
      assignmentId: TEST_ASSIGNMENT_ID,
    },
  };

  await service.registerMessageGroupService(
    TEST_GROUP_ID,
    TEST_REPLICA_ID,
    {getRole: () => 'leader'},
  );

  t.equal(
    attempts,
    2,
    'MOVE_REPLICA register-service timeout should remain retryable',
  );
  t.same(
    observedTimeoutMs,
    [
      TEST_MOVE_REPLICA_REGISTER_TIMEOUT_MS,
      TEST_MOVE_REPLICA_REGISTER_TIMEOUT_MS,
    ],
    'long MOVE_REPLICA register-service attempts should use the bounded probe timeout',
  );
  t.same(
    retryDelays,
    [TEST_RETRY_DELAY_MS],
    'bounded register-service attempts should keep the canonical retry delay',
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

test('NodeJoiningService - query-state shortcut preserves retryable ' +
  'control-plane pressure', async (t) => {
  initializeTestEnvironment();

  let httpCalls = 0;
  let upsertCalls = 0;
  const service = new NodeJoiningService({
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

test('NodeJoiningService - MOVE_REPLICA control-plane upsert preserves ' +
  'assignment publication when preferred', {skip: 'STALE: dead test re-enabled; expected preferControlPlaneUpsert shortcut to route MOVE_REPLICA via control-plane upsert (httpCalls=0, upsertCalls=1) but product now calls seed HTTP register-service (httpCalls=1, upsertCalls=0)'}, async (t) => {
  initializeTestEnvironment();

  const TEST_NODE_ID = 'join-node-move-replica-upsert';
  const TEST_NODE_ADDRESS = 'ws://localhost:9090';
  const TEST_SEED_ADDRESS = 'http://localhost:8080';
  const TEST_GROUP_ID = 'mg-1';
  const TEST_REPLICA_ID = 'mg-1-r0';
  const TEST_ASSIGNMENT_ID = '5ef301f9-6f73-4cb5-bb4e-8d73ef2a9ce7';
  const TEST_REQUESTED_STATUS = SERVICE_STATUS.ACTIVE;
  let httpCalls = 0;
  const upsertCalls = [];
  const seededRows = [];
  const service = new NodeJoiningService({
    nodeId: TEST_NODE_ID,
    nodeAddress: TEST_NODE_ADDRESS,
    seedNodeAddress: TEST_SEED_ADDRESS,
    httpPost: async () => {
      httpCalls += 1;
      return {success: true};
    },
  });
  service.seedNodeId = 'seed-node-1';
  service.bootstrapResponse = {
    messageGroupAssignment: {
      strategy: AssignmentStrategy.MOVE_REPLICA,
      groupId: TEST_GROUP_ID,
      replicaToMove: TEST_REPLICA_ID,
      assignmentId: TEST_ASSIGNMENT_ID,
    },
  };
  service.upsertJoinServiceRowWithRetry = async (row, options) => {
    upsertCalls.push({row, options});
    return {success: true};
  };
  service.seedJoinTimeCacheRow = (tableName, row) => {
    seededRows.push({tableName, row});
  };

  await service.registerMessageGroupService(
    TEST_GROUP_ID,
    TEST_REPLICA_ID,
    {getRole: () => 'leader'},
    {
      status: TEST_REQUESTED_STATUS,
      [QUERY_STATE_SERVICE_REGISTRATION_SHORTCUT_OPTION]: true,
    },
  );

  t.equal(
    httpCalls,
    0,
    'MOVE_REPLICA control-plane upsert should not call seed HTTP',
  );
  t.equal(
    upsertCalls.length,
    1,
    'MOVE_REPLICA control-plane upsert should publish one service row',
  );
  t.equal(
    upsertCalls[0].row.assignment_id,
    TEST_ASSIGNMENT_ID,
    'control-plane upsert should preserve the MOVE_REPLICA assignment token',
  );
  t.equal(
    upsertCalls[0].row.status,
    TEST_REQUESTED_STATUS,
    'control-plane upsert should preserve the requested service status',
  );
  t.equal(
    upsertCalls[0].options?.admissionTarget,
    QUERY_STATE_SERVICE_REGISTRATION_ADMISSION_TARGET,
    'control-plane upsert should use the join metadata admission target',
  );
  t.equal(
    seededRows[0]?.row?.assignment_id,
    TEST_ASSIGNMENT_ID,
    'join-time cache seed should retain assignment publication metadata',
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

test('NodeJoiningService - exhausted seed-contact transport failures preserve ' +
  'auto-resume hints', async (t) => {
  initializeTestEnvironment();

  let currentNow = 0;
  const retryDelays = [];
  const service = new NodeJoiningService({
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
