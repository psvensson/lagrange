import {test} from '../../src/test-helpers/tap.js';
import {
  NodeJoiningService,
  JoiningPhase,
} from '../../src/bootstrap/node-joining-service.js';
import {
  RETRYABLE_JOIN_RESUME_ATTEMPT_BUDGET_MODE,
} from '../../src/bootstrap/node-joining-constants.js';
import {
  BOOTSTRAP_PIPELINE_ERROR_CODE,
} from '../../src/bootstrap/bootstrap-constants.js';
import {
  resolveNodeJoiningConfig,
} from '../../src/entrypoint-runtime-join-config.js';
import {ENTRYPOINT_ENV} from '../../src/constants/entrypoint.js';
import {
  initializeTestEnvironment,
} from './node-joining-service-test-support.js';

const TEST_MAX_ATTEMPTS = 4;
const TEST_RETRY_AFTER_MS = 1000;
const TEST_ELAPSED_WITHIN_BUDGET_MS = 41056;
const TEST_MAX_ELAPSED_MS = 300000;
const TEST_NODE_ADDRESS = 'ws://localhost:9104';
const TEST_SEED_ADDRESS = 'http://localhost:8080';

function createLeaderMetadataIncompleteError() {
  const error = new Error('Leader metadata incomplete');
  error.code = BOOTSTRAP_PIPELINE_ERROR_CODE.LEADER_METADATA_INCOMPLETE;
  error.deferRetry = true;
  error.retryAfterMs = TEST_RETRY_AFTER_MS;
  return error;
}

function createService(attemptBudgetMode) {
  return new NodeJoiningService({
    nodeId: `joining-node-${attemptBudgetMode}`,
    nodeAddress: TEST_NODE_ADDRESS,
    seedNodeAddress: TEST_SEED_ADDRESS,
    config: {
      autoResumeRetryableFailures: true,
      retryableFailureResumeMaxAttempts: TEST_MAX_ATTEMPTS,
      retryableFailureResumeMaxElapsedMs: TEST_MAX_ELAPSED_MS,
      retryableFailureResumeAttemptBudgetMode: attemptBudgetMode,
    },
  });
}

function resolveDecision(service, error, elapsedMs) {
  const policy = service.resolveRetryableJoinResumePolicy();
  service.startTime = 0;
  service.now = () => elapsedMs;
  return service.resolveRetryableJoinResumeDecision(
    error,
    {
      phase: JoiningPhase.CONTACTING_SEED,
      error: error.message,
    },
    TEST_MAX_ATTEMPTS,
    policy,
  );
}

test('join retry patience config exposes permanent limited and elapsed-only ' +
  'operator postures', async (t) => {
  const limitedConfig = resolveNodeJoiningConfig({
    [ENTRYPOINT_ENV.JOINING_RETRYABLE_FAILURE_RESUME_ATTEMPT_BUDGET_MODE]:
      RETRYABLE_JOIN_RESUME_ATTEMPT_BUDGET_MODE.LIMITED,
  });
  const elapsedOnlyConfig = resolveNodeJoiningConfig({
    [ENTRYPOINT_ENV.JOINING_RETRYABLE_FAILURE_RESUME_ATTEMPT_BUDGET_MODE]:
      RETRYABLE_JOIN_RESUME_ATTEMPT_BUDGET_MODE.ELAPSED_ONLY,
  });

  t.equal(
    limitedConfig.retryableFailureResumeAttemptBudgetMode,
    RETRYABLE_JOIN_RESUME_ATTEMPT_BUDGET_MODE.LIMITED,
    'limited is a selectable permanent operator posture',
  );
  t.equal(
    elapsedOnlyConfig.retryableFailureResumeAttemptBudgetMode,
    RETRYABLE_JOIN_RESUME_ATTEMPT_BUDGET_MODE.ELAPSED_ONLY,
    'elapsed-only is a selectable permanent operator posture',
  );
  t.equal(
    resolveNodeJoiningConfig({})
      .retryableFailureResumeAttemptBudgetMode,
    RETRYABLE_JOIN_RESUME_ATTEMPT_BUDGET_MODE.LIMITED,
    'absent operator config preserves the bounded-attempt default',
  );
});

test('leader-metadata retry uses selected attempt-budget posture', async (t) => {
  initializeTestEnvironment();

  const limitedDecision = resolveDecision(
    createService(RETRYABLE_JOIN_RESUME_ATTEMPT_BUDGET_MODE.LIMITED),
    createLeaderMetadataIncompleteError(),
    TEST_ELAPSED_WITHIN_BUDGET_MS,
  );
  const elapsedOnlyDecision = resolveDecision(
    createService(RETRYABLE_JOIN_RESUME_ATTEMPT_BUDGET_MODE.ELAPSED_ONLY),
    createLeaderMetadataIncompleteError(),
    TEST_ELAPSED_WITHIN_BUDGET_MS,
  );

  t.equal(limitedDecision.action, 'stop',
    'limited posture stops retryable leader-metadata failure at attempt cap');
  t.equal(
    limitedDecision.attemptBudgetMode,
    RETRYABLE_JOIN_RESUME_ATTEMPT_BUDGET_MODE.LIMITED,
    'limited decision reports the selected posture',
  );
  t.equal(elapsedOnlyDecision.action, 'resume',
    'elapsed-only posture keeps retrying while elapsed budget remains');
  t.equal(
    elapsedOnlyDecision.attemptBudgetMode,
    RETRYABLE_JOIN_RESUME_ATTEMPT_BUDGET_MODE.ELAPSED_ONLY,
    'patient decision reports the selected posture',
  );
});

test('elapsed-only posture still stops on elapsed exhaustion and ' +
  'non-retryable failures', async (t) => {
  initializeTestEnvironment();

  const elapsedOnlyService = createService(
    RETRYABLE_JOIN_RESUME_ATTEMPT_BUDGET_MODE.ELAPSED_ONLY,
  );
  const elapsedExhaustedDecision = resolveDecision(
    elapsedOnlyService,
    createLeaderMetadataIncompleteError(),
    TEST_MAX_ELAPSED_MS,
  );
  const terminalError = new Error('Node ID already registered');
  const nonRetryableDecision = resolveDecision(
    elapsedOnlyService,
    terminalError,
    TEST_ELAPSED_WITHIN_BUDGET_MS,
  );

  t.equal(elapsedExhaustedDecision.action, 'stop',
    'elapsed-only posture stops when its elapsed budget is exhausted');
  t.equal(elapsedExhaustedDecision.stopReason, 'elapsed_budget_exhausted',
    'elapsed exhaustion remains a typed stop reason');
  t.equal(nonRetryableDecision.action, 'stop',
    'elapsed-only posture never weakens non-retryable failure handling');
  t.equal(nonRetryableDecision.stopReason, 'non_retryable',
    'non-retryable failure remains a typed terminal decision');
});
