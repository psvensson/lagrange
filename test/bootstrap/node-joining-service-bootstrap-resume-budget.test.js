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

test('NodeJoiningService - move-replica bootstrap defer keeps configured ' +
  'seed-contact timeout on the progress path', async (t) => {
  initializeTestEnvironment();

  const TEST_RETRY_AFTER_MS = 5;
  const TEST_RETRY_DELAY_MS = 10;
  const TEST_HTTP_TIMEOUT_MS = 1030;
  const TEST_RETRY_TIMEOUT_MS =
    TEST_HTTP_TIMEOUT_MS + TEST_RETRY_DELAY_MS + TEST_HTTP_TIMEOUT_MS;
  const TEST_NODE_ID = '550e8400-e29b-41d4-a716-446655440123';
  const TEST_NODE_ADDRESS = 'ws://localhost:9090';
  const TEST_SEED_ADDRESS = 'http://localhost:8080';
  const TEST_BOOTSTRAP_PHASE = 'partitions';
  const TEST_BOOTSTRAP_ERROR = 'Bootstrap not ready';
  const TEST_RETRYABLE_RESPONSE = Object.freeze({
    success: false,
    error: TEST_BOOTSTRAP_ERROR,
    code: BOOTSTRAP_PIPELINE_ERROR_CODE.BOOTSTRAP_NOT_READY,
    phase: TEST_BOOTSTRAP_PHASE,
    reasons: Object.freeze([
      BOOTSTRAP_API_PROBE_REASON.MOVE_REPLICA_HANDOFF_STABILIZING,
    ]),
    retryAfterMs: TEST_RETRY_AFTER_MS,
  });

  let attempts = 0;
  let currentNow = 0;
  const observedTimeoutMs = [];
  const retryDelays = [];
  const service = new NodeJoiningService({
    nodeId: TEST_NODE_ID,
    nodeAddress: TEST_NODE_ADDRESS,
    seedNodeAddress: TEST_SEED_ADDRESS,
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
    'move-replica handoff evidence should keep the failure resumable',
  );

  t.equal(attempts, 2, 'phase should keep the existing bounded in-call retry');
  t.equal(
    error?.message,
    JOINING_ERROR_MSG.contactSeedFailed(
      JOINING_ERROR_MSG.httpTimeout(TEST_HTTP_TIMEOUT_MS),
    ),
    'move-replica retained evidence should surface the configured request ' +
      'timeout',
  );
  t.equal(
    error?.deferRetry,
    true,
    'move-replica retained evidence should remain retryable',
  );
  t.equal(
    error?.seedContactFailureKind,
    JOINING_SEED_CONTACT_FAILURE_KIND.BOOTSTRAP_NOT_READY,
    'move-replica retained evidence should keep the seed-contact owner marker',
  );
  t.same(
    observedTimeoutMs,
    [TEST_HTTP_TIMEOUT_MS, TEST_HTTP_TIMEOUT_MS],
    'move-replica retained evidence should keep the configured request ' +
      'timeout for the next attempt',
  );
  t.same(
    retryDelays,
    [TEST_RETRY_DELAY_MS],
    'phase should still use the canonical retry delay before the bounded attempt',
  );
});

test('NodeJoiningService - fresh bootstrap-not-ready evidence bounds long ' +
  'seed-contact timeout', async (t) => {
  initializeTestEnvironment();

  const TEST_RETRY_AFTER_MS = TIME_MS.SECOND;
  const TEST_RETRY_DELAY_MS = NUM.TEN;
  const TEST_HTTP_TIMEOUT_MS = NUM.THIRTY_THOUSAND;
  const TEST_RETAINED_EVIDENCE_TIMEOUT_MS = TIME_MS.SECOND * NUM.FIVE;
  const TEST_RETRY_TIMEOUT_MS = TEST_HTTP_TIMEOUT_MS;
  const TEST_BOOTSTRAP_PHASE = 'partitions';
  const TEST_RETRYABLE_RESPONSE = Object.freeze({
    success: false,
    error: 'Bootstrap not ready',
    code: BOOTSTRAP_PIPELINE_ERROR_CODE.BOOTSTRAP_NOT_READY,
    phase: TEST_BOOTSTRAP_PHASE,
    reasons: Object.freeze([
      BOOTSTRAP_API_PROBE_REASON.MOVE_REPLICA_HANDOFF_STABILIZING,
    ]),
    retryAfterMs: TEST_RETRY_AFTER_MS,
  });

  let attempts = 0;
  let currentNow = 0;
  const observedTimeoutMs = [];
  const service = new NodeJoiningService({
    nodeId: '550e8400-e29b-41d4-a716-446655440124',
    nodeAddress: 'ws://localhost:9090',
    seedNodeAddress: 'http://localhost:8080',
    now: () => currentNow,
    sleep: async (delayMs) => {
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
      if (attempts === 1) {
        const error = new Error(
          `HTTP 503: ${JSON.stringify(TEST_RETRYABLE_RESPONSE)}`,
        );
        error.statusCode = 503;
        throw error;
      }
      currentNow += timeoutMs;
      throw new Error('Request timeout after ' + timeoutMs + 'ms');
    },
  });

  const error = await t.rejects(
    service.phaseContactSeed(),
    'retained bootstrap-not-ready evidence should keep the failure resumable',
  );

  t.equal(attempts, 2, 'phase should keep the existing bounded in-call retry');
  t.same(
    observedTimeoutMs,
    [
      TEST_HTTP_TIMEOUT_MS,
      TEST_RETAINED_EVIDENCE_TIMEOUT_MS,
    ],
    'retained bootstrap-not-ready evidence should cap the next long seed-contact request',
  );
  t.equal(
    error?.message,
    JOINING_ERROR_MSG.contactSeedFailed(
      JOINING_ERROR_MSG.httpTimeout(TEST_RETAINED_EVIDENCE_TIMEOUT_MS),
    ),
    'surfaced timeout should reflect the retained-evidence request cap',
  );
  t.equal(
    error?.deferRetry,
    true,
    'retained bootstrap-not-ready transport timeout should remain retryable',
  );
  t.equal(
    error?.seedContactFailureKind,
    JOINING_SEED_CONTACT_FAILURE_KIND.BOOTSTRAP_NOT_READY,
    'fresh evidence should keep the seed-contact owner marker',
  );
});

test('NodeJoiningService - retained bootstrap-not-ready timeout clears stale ' +
  'evidence before retry', async (t) => {
  initializeTestEnvironment();

  const TEST_RETRY_AFTER_MS = TIME_MS.SECOND;
  const TEST_RETRY_DELAY_MS = NUM.TEN;
  const TEST_HTTP_TIMEOUT_MS = NUM.THIRTY_THOUSAND;
  const TEST_RETAINED_EVIDENCE_TIMEOUT_MS = TIME_MS.SECOND * NUM.FIVE;
  const TEST_RETRY_TIMEOUT_MS = TEST_HTTP_TIMEOUT_MS;
  const TEST_SERVICE_UNAVAILABLE_STATUS = 503;
  const TEST_BOOTSTRAP_PHASE = 'partitions';
  const TEST_SEED_NODE_ID = 'seed-node-retained-evidence-clear';
  const TEST_SEED_NODE_WS_ADDRESS = 'ws://localhost:9091';
  const TEST_SUCCESSFUL_RESPONSE = Object.freeze({
    success: true,
    seedNodeId: TEST_SEED_NODE_ID,
    seedNodeWsAddress: TEST_SEED_NODE_WS_ADDRESS,
    messageGroupAssignment: Object.freeze({
      strategy: AssignmentStrategy.LEAST_LOADED,
    }),
  });
  const TEST_RETAINED_EVIDENCE = Object.freeze({
    success: false,
    error: 'Bootstrap not ready',
    code: BOOTSTRAP_PIPELINE_ERROR_CODE.BOOTSTRAP_NOT_READY,
    phase: TEST_BOOTSTRAP_PHASE,
    reasons: Object.freeze([
      BOOTSTRAP_API_PROBE_REASON.MOVE_REPLICA_HANDOFF_STABILIZING,
    ]),
    retryAfterMs: TEST_RETRY_AFTER_MS,
    statusCode: TEST_SERVICE_UNAVAILABLE_STATUS,
  });

  let attempts = 0;
  let currentNow = 0;
  const observedTimeoutMs = [];
  const service = new NodeJoiningService({
    nodeId: '550e8400-e29b-41d4-a716-446655440125',
    nodeAddress: 'ws://localhost:9090',
    seedNodeAddress: 'http://localhost:8080',
    now: () => currentNow,
    sleep: async (delayMs) => {
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
      if (attempts === 1) {
        currentNow += timeoutMs;
        throw new Error('Request timeout after ' + timeoutMs + 'ms');
      }
      return TEST_SUCCESSFUL_RESPONSE;
    },
  });
  service.lastRetryableSeedContactEvidence = TEST_RETAINED_EVIDENCE;

  await service.phaseContactSeed();

  t.equal(
    attempts,
    2,
    'retained evidence should spend one bounded probe before normal retry',
  );
  t.same(
    observedTimeoutMs,
    [
      TEST_RETAINED_EVIDENCE_TIMEOUT_MS,
      TEST_HTTP_TIMEOUT_MS -
        TEST_RETAINED_EVIDENCE_TIMEOUT_MS -
        TEST_RETRY_DELAY_MS,
    ],
    'stale retained evidence should clear before the remaining-budget retry',
  );
  t.equal(
    service.lastRetryableSeedContactEvidence,
    null,
    'successful retry should leave no stale retained seed evidence',
  );
  t.equal(
    service.bootstrapResponse,
    TEST_SUCCESSFUL_RESPONSE,
    'normal retry should be able to accept a fresh successful seed response',
  );
  t.equal(
    service.seedNodeId,
    TEST_SEED_NODE_ID,
    'successful retry should update seed node identity',
  );
});

test('NodeJoiningService - retained retryable seed-contact evidence ' +
  'survives a later cross-attempt transport failure', async (t) => {
  initializeTestEnvironment();

  const TEST_ELAPSED_MS = 41056;
  const TEST_MAX_ATTEMPTS = 4;
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
      autoResumeRetryableFailures: true,
      httpTimeoutMs: TEST_HTTP_TIMEOUT_MS,
      leadershipWaitTimeoutMs: TEST_HTTP_TIMEOUT_MS,
      leadershipWaitInitialDelayMs: TEST_HTTP_TIMEOUT_MS,
      leadershipWaitMaxDelayMs: TEST_HTTP_TIMEOUT_MS,
      leadershipWaitBackoffMultiplier: 1,
      leadershipWaitJitterRatio: 0,
      retryableFailureResumeMaxAttempts: TEST_MAX_ATTEMPTS,
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
  t.equal(
    firstError?.seedContactFailureKind,
    JOINING_SEED_CONTACT_FAILURE_KIND.BOOTSTRAP_NOT_READY,
    'direct bootstrap-not-ready should carry the seed-contact failure marker',
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
    secondError?.seedContactFailureKind,
    JOINING_SEED_CONTACT_FAILURE_KIND.BOOTSTRAP_NOT_READY,
    'retained bootstrap-not-ready evidence should keep the seed-contact owner marker',
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

  const policy = service.resolveRetryableJoinResumePolicy();
  service.startTime = 0;
  service.now = () => TEST_ELAPSED_MS;
  t.equal(
    service.shouldAutoResumeRetryableJoinFailure(
      secondError,
      {
        phase: JoiningPhase.CONTACTING_SEED,
        error: secondError.message,
      },
      TEST_MAX_ATTEMPTS,
      policy,
    ),
    true,
    'retained bootstrap-not-ready transport timeout should keep the seed-contact resume budget',
  );
});

test('NodeJoiningService - client deadline bootstrap defer uses fixed resume cap',
  async (t) => {
    initializeTestEnvironment();

    const TEST_MAX_ATTEMPTS = 4;
    const TEST_ELAPSED_MS = 41056;
    const TEST_RETRY_AFTER_MS = 5;
    const TEST_HTTP_TIMEOUT_MS = 10;
    const TEST_RETRYABLE_RESPONSE = Object.freeze({
      success: false,
      error: 'Bootstrap not ready',
      code: BOOTSTRAP_PIPELINE_ERROR_CODE.BOOTSTRAP_NOT_READY,
      reasons: Object.freeze([
        BOOTSTRAP_API_PROBE_REASON.CLIENT_ATTEMPT_DEADLINE_EXHAUSTED,
      ]),
      retryAfterMs: TEST_RETRY_AFTER_MS,
    });

    let currentNow = 0;
    const service = new NodeJoiningService({
      nodeId: '550e8400-e29b-41d4-a716-446655440121',
      nodeAddress: 'ws://localhost:9090',
      seedNodeAddress: 'http://localhost:8080',
      now: () => currentNow,
      sleep: async () => {},
      config: {
        autoResumeRetryableFailures: true,
        httpTimeoutMs: TEST_HTTP_TIMEOUT_MS,
        leadershipWaitTimeoutMs: TEST_HTTP_TIMEOUT_MS,
        leadershipWaitInitialDelayMs: TEST_HTTP_TIMEOUT_MS,
        leadershipWaitMaxDelayMs: TEST_HTTP_TIMEOUT_MS,
        leadershipWaitBackoffMultiplier: 1,
        leadershipWaitJitterRatio: 0,
        retryableFailureResumeMaxAttempts: TEST_MAX_ATTEMPTS,
      },
      httpPost: async () => {
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
      'client-deadline bootstrap defer should remain retryable',
    );

    t.equal(
      error?.seedContactFailureKind,
      JOINING_SEED_CONTACT_FAILURE_KIND.CLIENT_ATTEMPT_DEADLINE_EXHAUSTED,
      'client-deadline bootstrap defer should carry the deadline failure marker',
    );
    t.equal(
      error?.deferRetry,
      true,
      'client-deadline bootstrap defer should stay retryable',
    );
    const policy = service.resolveRetryableJoinResumePolicy();
    service.startTime = 0;
    service.now = () => TEST_ELAPSED_MS;
    t.equal(
      service.shouldAutoResumeRetryableJoinFailure(
        error,
        {
          phase: JoiningPhase.CONTACTING_SEED,
          error: error.message,
        },
        TEST_MAX_ATTEMPTS,
        policy,
      ),
      false,
      'client-deadline bootstrap defer should not bypass the fixed resume cap',
    );
  });

test('NodeJoiningService - retained client deadline evidence keeps transport ' +
  'timeout on the fixed resume cap', async (t) => {
  initializeTestEnvironment();

  const TEST_MAX_ATTEMPTS = 4;
  const TEST_ELAPSED_MS = 41056;
  const TEST_RETRY_AFTER_MS = 5;
  const TEST_HTTP_TIMEOUT_MS = 10;
  const TEST_RETRYABLE_RESPONSE = Object.freeze({
    success: false,
    error: 'Bootstrap not ready',
    code: BOOTSTRAP_PIPELINE_ERROR_CODE.BOOTSTRAP_NOT_READY,
    reasons: Object.freeze([
      BOOTSTRAP_API_PROBE_REASON.CLIENT_ATTEMPT_DEADLINE_EXHAUSTED,
    ]),
    retryAfterMs: TEST_RETRY_AFTER_MS,
  });

  let attempts = 0;
  let currentNow = 0;
  const service = new NodeJoiningService({
    nodeId: '550e8400-e29b-41d4-a716-446655440122',
    nodeAddress: 'ws://localhost:9090',
    seedNodeAddress: 'http://localhost:8080',
    now: () => currentNow,
    sleep: async () => {},
    config: {
      autoResumeRetryableFailures: true,
      httpTimeoutMs: TEST_HTTP_TIMEOUT_MS,
      leadershipWaitTimeoutMs: TEST_HTTP_TIMEOUT_MS,
      leadershipWaitInitialDelayMs: TEST_HTTP_TIMEOUT_MS,
      leadershipWaitMaxDelayMs: TEST_HTTP_TIMEOUT_MS,
      leadershipWaitBackoffMultiplier: 1,
      leadershipWaitJitterRatio: 0,
      retryableFailureResumeMaxAttempts: TEST_MAX_ATTEMPTS,
    },
    httpPost: async () => {
      attempts += 1;
      currentNow += TEST_HTTP_TIMEOUT_MS;
      if (attempts === 1) {
        const error = new Error(
          `HTTP 503: ${JSON.stringify(TEST_RETRYABLE_RESPONSE)}`,
        );
        error.statusCode = 503;
        throw error;
      }
      throw new Error('Request timeout after ' + TEST_HTTP_TIMEOUT_MS + 'ms');
    },
  });

  await t.rejects(
    service.phaseContactSeed(),
    'first attempt should retain client-deadline bootstrap evidence',
  );
  const timeoutError = await t.rejects(
    service.phaseContactSeed(),
    'later transport timeout should retain client-deadline evidence',
  );

  t.equal(
    timeoutError?.seedContactFailureKind,
    JOINING_SEED_CONTACT_FAILURE_KIND.CLIENT_ATTEMPT_DEADLINE_EXHAUSTED,
    'retained client-deadline evidence should keep the deadline marker',
  );
  t.equal(
    timeoutError?.deferRetry,
    true,
    'retained client-deadline transport timeout should remain retryable',
  );
  const policy = service.resolveRetryableJoinResumePolicy();
  service.startTime = 0;
  service.now = () => TEST_ELAPSED_MS;
  t.equal(
    service.shouldAutoResumeRetryableJoinFailure(
      timeoutError,
      {
        phase: JoiningPhase.CONTACTING_SEED,
        error: timeoutError.message,
      },
      TEST_MAX_ATTEMPTS,
      policy,
    ),
    false,
    'retained client-deadline transport timeout should not use elapsed-only resume',
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
    error?.seedContactFailureKind,
    JOINING_SEED_CONTACT_FAILURE_KIND.BOOTSTRAP_NOT_READY,
    'direct bootstrap-not-ready should use the explicit seed-contact marker',
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

test('NodeJoiningService - contacting-seed bootstrap-not-ready resumes on ' +
  'elapsed budget after the fixed attempt cap', async (t) => {
  initializeTestEnvironment();

  const TEST_NODE_ID = 'joining-node-auto-resume-bootstrap-defer-1';
  const TEST_NODE_ADDRESS = 'ws://localhost:9100';
  const TEST_SEED_ADDRESS = 'http://localhost:8080';
  const TEST_MAX_ATTEMPTS = 4;
  const TEST_ELAPSED_MS = 41056;
  const TEST_RETRY_AFTER_MS = 1000;
  const TEST_ERROR_PHASE = 'partitions';
  const TEST_CONTACTING_SEED_FAILURE = {
    phase: JoiningPhase.CONTACTING_SEED,
    error: 'Seed bootstrap not ready (phase: ' + TEST_ERROR_PHASE + ')',
  };

  const service = new NodeJoiningService({
    nodeId: TEST_NODE_ID,
    nodeAddress: TEST_NODE_ADDRESS,
    seedNodeAddress: TEST_SEED_ADDRESS,
    config: {
      autoResumeRetryableFailures: true,
      retryableFailureResumeMaxAttempts: TEST_MAX_ATTEMPTS,
    },
  });

  const policy = service.resolveRetryableJoinResumePolicy();
  service.startTime = 0;
  service.now = () => TEST_ELAPSED_MS;
  const bootstrapNotReady = new Error(TEST_CONTACTING_SEED_FAILURE.error);
  bootstrapNotReady.deferRetry = true;
  bootstrapNotReady.retryAfterMs = TEST_RETRY_AFTER_MS;
  bootstrapNotReady.seedContactFailureKind =
    JOINING_SEED_CONTACT_FAILURE_KIND.BOOTSTRAP_NOT_READY;

  t.equal(
    service.shouldAutoResumeRetryableJoinFailure(
      bootstrapNotReady,
      TEST_CONTACTING_SEED_FAILURE,
      TEST_MAX_ATTEMPTS,
      policy,
    ),
    true,
    'contacting-seed bootstrap-not-ready should keep resuming while elapsed budget remains',
  );
});

test('NodeJoiningService - leader metadata incomplete uses fixed retryable ' +
  'resume cap', async (t) => {
  initializeTestEnvironment();

  const TEST_NODE_ID = 'joining-node-leader-metadata-fixed-cap-1';
  const TEST_NODE_ADDRESS = 'ws://localhost:9104';
  const TEST_SEED_ADDRESS = 'http://localhost:8080';
  const TEST_MAX_ATTEMPTS = 4;
  const TEST_ELAPSED_MS = 41056;
  const TEST_RETRY_AFTER_MS = 1000;
  const TEST_HTTP_TIMEOUT_MS = 1;
  const TEST_RETRY_TIMEOUT_MS = 100;
  const TEST_RETRY_DELAY_MS = 10;
  const TEST_MISSING_PARTITION_LEADERS = Object.freeze(['partition-a']);
  const TEST_LEADER_METADATA_RESPONSE = Object.freeze({
    success: false,
    error: 'Leader metadata incomplete',
    code: BOOTSTRAP_PIPELINE_ERROR_CODE.LEADER_METADATA_INCOMPLETE,
    retryAfterMs: TEST_RETRY_AFTER_MS,
    missingPartitionLeaders: TEST_MISSING_PARTITION_LEADERS,
  });

  let currentNow = 0;
  const service = new NodeJoiningService({
    nodeId: TEST_NODE_ID,
    nodeAddress: TEST_NODE_ADDRESS,
    seedNodeAddress: TEST_SEED_ADDRESS,
    now: () => currentNow,
    sleep: async (delayMs) => {
      currentNow += delayMs;
    },
    config: {
      autoResumeRetryableFailures: true,
      retryableFailureResumeMaxAttempts: TEST_MAX_ATTEMPTS,
      httpTimeoutMs: TEST_HTTP_TIMEOUT_MS,
      leadershipWaitTimeoutMs: TEST_RETRY_TIMEOUT_MS,
      leadershipWaitInitialDelayMs: TEST_RETRY_DELAY_MS,
      leadershipWaitMaxDelayMs: TEST_RETRY_DELAY_MS,
      leadershipWaitBackoffMultiplier: 1,
      leadershipWaitJitterRatio: 0,
    },
    httpPost: async () => {
      currentNow += TEST_HTTP_TIMEOUT_MS;
      const error = new Error(
        `HTTP 503: ${JSON.stringify(TEST_LEADER_METADATA_RESPONSE)}`,
      );
      error.statusCode = 503;
      throw error;
    },
  });

  const leaderMetadataIncomplete = await t.rejects(
    service.phaseContactSeed(),
    'contact-seed should surface leader metadata incomplete as retryable',
  );
  const leaderMetadataFailure = {
    phase: JoiningPhase.CONTACTING_SEED,
    error: leaderMetadataIncomplete.message,
  };
  const policy = service.resolveRetryableJoinResumePolicy();
  service.startTime = 0;
  service.now = () => TEST_ELAPSED_MS;

  t.notOk(
    Object.hasOwn(leaderMetadataIncomplete, 'seedContactFailureKind'),
    'leader metadata incomplete must not carry the bootstrap-not-ready marker',
  );
  t.equal(
    service.shouldAutoResumeRetryableJoinFailure(
      leaderMetadataIncomplete,
      leaderMetadataFailure,
      TEST_MAX_ATTEMPTS - 1,
      policy,
    ),
    true,
    'leader metadata incomplete should remain retryable before the fixed cap',
  );
  t.equal(
    service.shouldAutoResumeRetryableJoinFailure(
      leaderMetadataIncomplete,
      leaderMetadataFailure,
      TEST_MAX_ATTEMPTS,
      policy,
    ),
    false,
    'leader metadata incomplete should stop at the fixed retryable cap',
  );
});

test('NodeJoiningService - retained seed-contact evidence does not turn a ' +
  'transport timeout into elapsed-only auto-resume', async (t) => {
  initializeTestEnvironment();

  const TEST_NODE_ID = 'joining-node-retained-seed-evidence-timeout-1';
  const TEST_NODE_ADDRESS = 'ws://localhost:9103';
  const TEST_SEED_ADDRESS = 'http://localhost:8080';
  const TEST_MAX_ATTEMPTS = 4;
  const TEST_ELAPSED_MS = 41056;
  const TEST_RETRY_AFTER_MS = 1000;
  const TEST_HTTP_TIMEOUT_MS = 30000;
  const TEST_TIMEOUT_MESSAGE = JOINING_ERROR_MSG.contactSeedFailed(
    JOINING_ERROR_MSG.httpTimeout(TEST_HTTP_TIMEOUT_MS),
  );
  const TEST_FAILURE = {
    phase: JoiningPhase.CONTACTING_SEED,
    error: TEST_TIMEOUT_MESSAGE,
  };
  const TEST_RETAINED_BOOTSTRAP_RESPONSE = Object.freeze({
    code: BOOTSTRAP_PIPELINE_ERROR_CODE.BOOTSTRAP_NOT_READY,
    retryAfterMs: TEST_RETRY_AFTER_MS,
  });

  const service = new NodeJoiningService({
    nodeId: TEST_NODE_ID,
    nodeAddress: TEST_NODE_ADDRESS,
    seedNodeAddress: TEST_SEED_ADDRESS,
    config: {
      autoResumeRetryableFailures: true,
      retryableFailureResumeMaxAttempts: TEST_MAX_ATTEMPTS,
    },
  });

  const policy = service.resolveRetryableJoinResumePolicy();
  service.startTime = 0;
  service.now = () => TEST_ELAPSED_MS;
  const retainedEvidenceTimeout = new Error(TEST_TIMEOUT_MESSAGE);
  retainedEvidenceTimeout.deferRetry = true;
  retainedEvidenceTimeout.retryAfterMs = TEST_RETRY_AFTER_MS;
  retainedEvidenceTimeout.code =
    BOOTSTRAP_PIPELINE_ERROR_CODE.BOOTSTRAP_NOT_READY;
  retainedEvidenceTimeout.bootstrapResponse =
    TEST_RETAINED_BOOTSTRAP_RESPONSE;

  t.equal(
    service.shouldAutoResumeRetryableJoinFailure(
      retainedEvidenceTimeout,
      TEST_FAILURE,
      TEST_MAX_ATTEMPTS,
      policy,
    ),
    false,
    'retained bootstrap-not-ready evidence should not bypass the fixed cap ' +
      'for a transport timeout',
  );
});

test('NodeJoiningService - fixed attempt cap still stops non-bootstrap ' +
  'retryable join failures', async (t) => {
  initializeTestEnvironment();

  const TEST_NODE_ID = 'joining-node-auto-resume-attempt-cap-1';
  const TEST_NODE_ADDRESS = 'ws://localhost:9101';
  const TEST_SEED_ADDRESS = 'http://localhost:8080';
  const TEST_MAX_ATTEMPTS = 4;
  const TEST_ELAPSED_MS = 41056;
  const TEST_RETRY_AFTER_MS = 1000;
  const TEST_FAILURE_MESSAGE = 'Connection to node seed-node-1 closed';
  const TEST_FAILURE_PHASE = JoiningPhase.QUERYING_STATE;

  const service = new NodeJoiningService({
    nodeId: TEST_NODE_ID,
    nodeAddress: TEST_NODE_ADDRESS,
    seedNodeAddress: TEST_SEED_ADDRESS,
    config: {
      autoResumeRetryableFailures: true,
      retryableFailureResumeMaxAttempts: TEST_MAX_ATTEMPTS,
    },
  });

  const policy = service.resolveRetryableJoinResumePolicy();
  service.startTime = 0;
  service.now = () => TEST_ELAPSED_MS;
  const genericRetryableFailure = new Error(TEST_FAILURE_MESSAGE);
  genericRetryableFailure.deferRetry = true;
  genericRetryableFailure.retryAfterMs = TEST_RETRY_AFTER_MS;

  t.equal(
    service.shouldAutoResumeRetryableJoinFailure(
      genericRetryableFailure,
      {
        phase: TEST_FAILURE_PHASE,
        error: TEST_FAILURE_MESSAGE,
      },
      TEST_MAX_ATTEMPTS,
      policy,
    ),
    false,
    'the fixed attempt cap should still apply to other retryable join failures',
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
