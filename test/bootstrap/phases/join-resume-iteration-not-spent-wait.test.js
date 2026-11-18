/**
 * The join pipeline's per-phase retry windows are iterations of the join
 * resume loop (NodeJoiningAdmissionReadiness): each throws a retryable
 * error that the loop resumes, logging RETRYABLE_FAILURE_RESUMING per
 * iteration, and the loop reports its own exhausted budget
 * (retryableJoinResumePolicy.maxElapsedMs / .maxAttempts) as the one
 * wait_bound_spent. A single phase window expiring is therefore NOT a spent
 * wait: each site below throws its retryable error, logs exactly its base
 * line (or none), and reports no wait_bound_spent.
 */

import {test} from '../../../src/test-helpers/tap.js';
import {
  SeedContactFailureOwner,
} from '../../../src/bootstrap/phases/seed-contact-failure-owner.js';
import {
  SEED_CONTACT_SESSION_ABSENT,
} from '../../../src/bootstrap/phases/seed-contact-candidate-policy.js';
import {
  QuerySystemStatePhase,
} from '../../../src/bootstrap/phases/query-system-state-phase.js';
import {
  ConnectWebSocketPhase,
} from '../../../src/bootstrap/phases/connect-websocket-phase.js';
import {
  NodeJoiningService,
} from '../../../src/bootstrap/node-joining-service.js';
import {
  initializeTestEnvironment,
} from '../node-joining-service-test-support.js';
import {
  isRetryableControlPlaneError,
} from '../../../src/control-plane/control-plane-error-classification.js';
import {
  JOINING_LOG_MSG,
} from '../../../src/bootstrap/node-joining-constants.js';
import {SERVICE_STATUS} from '../../../src/constants/index.js';
import {captureLogger} from '../../test-helpers/wait-bound-spent-capture.js';

function seedContactOwner() {
  return new SeedContactFailureOwner({
    nodeId: 'joiner-seed-contact',
    updateDiagnostics: () => {},
    getDiagnostics: () => ({}),
    remainingBudgetMs: () => 0,
    buildRetryableErrorOptions: (options) => options,
  });
}

function seedContactContext(logger) {
  return {
    logger,
    now: () => 10000,
    startTime: 0,
    retryTimeoutMs: 5000,
    attempt: 3,
    seedContactCandidates: [],
    lastAttemptFailure: SEED_CONTACT_SESSION_ABSENT,
    lastBootstrapError: null,
    lastRetryableSeedContactError: SEED_CONTACT_SESSION_ABSENT,
    lastRetryAfterMs: 0,
    evidenceWindow: {budget: 0, grants: 0},
  };
}

function catchThrown(fn) {
  try {
    fn();
  } catch (error) {
    return error;
  }
  return null;
}

test('seed-contact budget exhaustion throws a retryable error and reports ' +
  'no wait_bound_spent', (t) => {
  const capture = captureLogger();
  const thrown = catchThrown(() => seedContactOwner()
    .throwBudgetExhaustion(seedContactContext(capture.logger)));
  t.ok(thrown, 'the exhausted seed-contact window throws');
  t.equal(isRetryableControlPlaneError(thrown), true,
    'the join resume loop resumes it');
  t.equal(capture.spent().length, 0, 'no wait_bound_spent');
  t.equal(capture.lines.length, 0, 'no line at all (as at base)');
  t.end();
});

test('seed-contact surfaced failure throws a retryable error and reports ' +
  'no wait_bound_spent', (t) => {
  const capture = captureLogger();
  const thrown = catchThrown(() => seedContactOwner().throwSurfacedFailure(
    seedContactContext(capture.logger),
    {
      error: new Error('connect ETIMEDOUT'),
      parsedError: null,
      classification: {retryableTimeout: true},
    }));
  t.ok(thrown, 'the surfaced seed-contact failure throws');
  t.equal(isRetryableControlPlaneError(thrown), true,
    'the join resume loop resumes it');
  t.equal(capture.spent().length, 0, 'no wait_bound_spent');
  t.equal(capture.lines.length, 0, 'no line at all (as at base)');
  t.end();
});

test('join node registration retries exhausted throw the retryable error ' +
  'and report no wait_bound_spent', async (t) => {
  const capture = captureLogger();
  const phase = new QuerySystemStatePhase({
    nodeId: 'joiner-registration',
    nodeAddress: 'ws://joiner-registration:9090',
    delegates: {
      getLogger: () => capture.logger,
      getConfig: () => ({joinRegistrationMaxAttempts: 1}),
      getSleep: () => async () => {},
    },
  });
  const retryable = Object.assign(new Error('control plane busy'), {
    deferRetry: true,
    retryable: true,
  });
  phase.nodeRegistrationOwner = {
    registerNodeInCluster: async () => {
      throw retryable;
    },
  };

  await t.rejects(phase.registerNodeInCluster(), /control plane busy/,
    'the last retryable error is thrown to the resume loop');
  t.equal(isRetryableControlPlaneError(retryable), true);
  t.equal(capture.spent().length, 0, 'no wait_bound_spent');
  t.equal(capture.errors().length, 0, 'no ERROR (as at base)');
});

test('seed websocket connect window spent throws the retryable error and ' +
  'reports no wait_bound_spent', async (t) => {
  const capture = captureLogger();
  let nowMs = 0;
  const phase = new ConnectWebSocketPhase({
    nodeId: 'joiner-ws',
    delegates: {
      getLogger: () => capture.logger,
      getNow: () => () => nowMs,
      getSleep: () => async (delayMs) => {
        nowMs += delayMs;
      },
      getConfig: () => ({
        leadershipWaitTimeoutMs: 100,
        leadershipWaitInitialDelayMs: 60,
        leadershipWaitMaxDelayMs: 60,
      }),
    },
  });
  phase.connectToClusterNodes = async () => {};
  const messageRouter = {
    getConnectedNodes: () => [],
    connectToNode: async () => {
      nowMs += 10;
      throw Object.assign(new Error('seed websocket timeout'),
        {code: 'WEBSOCKET_CONNECT_TIMEOUT'});
    },
  };

  await t.rejects(
    phase.connectToSeedNode(messageRouter, 'seed-1', 'ws://seed-1:9091'),
    /seed websocket timeout/, 'the last connect error is thrown');
  t.equal(capture.spent().length, 0, 'no wait_bound_spent');
  t.equal(capture.errors().length, 0, 'no ERROR (as at base)');
  t.ok(capture.warns().some((line) =>
    line.message === JOINING_LOG_MSG.SEED_WS_RETRYING),
  'each retry still logs its WARN');
});

test('message-group registration window spent logs the base ERROR line ' +
  'and no wait_bound_spent', async (t) => {
  initializeTestEnvironment();
  const capture = captureLogger();
  const service = new NodeJoiningService({
    bootIncarnation: 1,
    nodeId: 'joiner-mg-registration',
    nodeAddress: 'ws://localhost:9090',
    seedNodeAddress: 'http://localhost:8080',
    httpPost: async () => ({success: true}),
  });
  service.logger = capture.logger;
  service.seedNodeId = 'seed-node-1';
  service.resolveJoinRetryPolicy = () => ({
    retryTimeoutMs: 0,
    initialDelayMs: 1,
    maxDelayMs: 1,
    backoffMultiplier: 2,
  });

  await t.rejects(service.registerMessageGroupService(
    'mg-1', 'mg-1-r0', {getRole: () => 'leader'},
    {status: SERVICE_STATUS.STOPPED}),
  'the spent registration window rejects');
  t.equal(capture.spent().length, 0, 'no wait_bound_spent');
  const failed = capture.errors().filter((line) =>
    line.message === JOINING_LOG_MSG.MESSAGE_GROUP_REGISTER_FAILED);
  t.equal(failed.length, 1, 'the base ERROR line is logged once');
  t.match(failed[0].context, {
    nodeId: 'joiner-mg-registration',
    replicaId: 'mg-1-r0',
    groupId: 'mg-1',
    attempts: 0,
  });
  t.type(failed[0].context.error, 'string');
});
