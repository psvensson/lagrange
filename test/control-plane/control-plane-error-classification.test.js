import {test} from '../../src/test-helpers/tap.js';
import {
  CONTROL_PLANE_FAILURE_REASON,
  getControlPlaneErrorCode,
  getControlPlaneFailureSummary,
  getControlPlaneErrorMessage,
  getControlPlaneRetryAfterMs,
  isRetryableControlPlaneError,
} from '../../src/control-plane/control-plane-error-classification.js';
import {ROUTER_ERROR_MSG} from '../../src/constants/transport.js';
import {
  PARTITION_COMMITTED_COMMAND_ERROR_CODE,
  PARTITION_SERVICE_DEFAULT,
} from '../../src/partition/partition-service-constants.js';
import {runRetryableControlPlaneWrite} from
  '../../src/bootstrap/shared/retryable-control-plane-write.js';
import {CDC_INTEGRATION_SERVICE_SHARED} from
  '../../src/cdc/cdc-integration-service-shared.js';
import {runControlPlaneWrite} from
  '../../src/control-plane/control-plane-write-identity.js';
import * as partitionWriteKernel from
  '../../src/partition/partition-write-kernel.js';
import {PROPOSAL_QUEUE_PROPOSAL_STATE} from
  '../../src/partition/proposal-queue-constants.js';
import {assertRaftOperationSucceeded} from
  '../../src/raft/raft-operation-port.js';
import {RAFT_OPERATION_OUTCOME} from
  '../../src/raft/raft-operation-port-constants.js';

const PENDING_RESPONSE_TIMEOUT_RETRYABLE_TEST_NAME =
  'isRetryableControlPlaneError treats pending response timeouts as retryable';
const TEST_PARTITION_ID = 'classification-p1';
const TEST_ENTRY_ID = 'classification-entry';

test('isRetryableControlPlaneError detects typed pressure deferrals', async (t) => {
  const result = {
    success: false,
    error: 'Distributed operation failed due to participant failures',
    errorCode: 'CONTROL_PLANE_PRESSURE_DEGRADED',
    retryAfterMs: 250,
  };

  t.equal(getControlPlaneErrorMessage(result),
    'Distributed operation failed due to participant failures');
  t.equal(getControlPlaneErrorCode(result),
    'CONTROL_PLANE_PRESSURE_DEGRADED');
  t.equal(getControlPlaneRetryAfterMs(result), 250);
  t.equal(isRetryableControlPlaneError(result), true);
});

test('isRetryableControlPlaneError detects deferred connection failures', async (t) => {
  const error = new Error('No connection to node seed-1');

  t.equal(isRetryableControlPlaneError(error), true);
});

test('isRetryableControlPlaneError treats stale no-handler ingress targets as retryable',
  async (t) => {
    const error = new Error(
      'No handler registered for address seed-node-1/message-group/mg-1-r2',
    );

    t.equal(isRetryableControlPlaneError(error), true);
  });

test('isRetryableControlPlaneError detects explicit deferRetry marker', async (t) => {
  const error = new Error('validation deferred');
  error.deferRetry = true;

  t.equal(isRetryableControlPlaneError(error), true);
});

test(PENDING_RESPONSE_TIMEOUT_RETRYABLE_TEST_NAME, async (t) => {
  const error = new Error(ROUTER_ERROR_MSG.PENDING_RESPONSE_TIMEOUT);

  t.equal(isRetryableControlPlaneError(error), true);
});

// B7 / F-am (verification round 6): a partition write answer is classified
// by its one owner - by the write kernel's code when the classifier holds the
// answer, by the errors owner's texts when only an Error of its text reached
// it. The answers are the write kernel's own, built by its builders: a
// release at the partition's commit deadline (proposed: its outcome is not
// known; queued: never proposed), a queued write released when its replica
// stopped leading, and a host failure while proposing or an environmental
// failure of the write's own committed apply, whose outcome is not known
// either (AD): the control plane retries their answers, which carry the
// entryId a re-delivery is made under, but never an Error of their text - a
// text carries no entryId, and a retry from it re-proposes under a fresh one.
test('isRetryableControlPlaneError classifies the partition write kernel\'s ' +
  'answers by their owner, as the answer and as an Error of its text',
async (t) => {
  const {
    PARTITION_WRITE_RELEASE_CAUSE: CAUSE,
    buildPartitionWriteProposalRefusal,
    buildRejectedProposedWriteAnswer,
    buildReleasedPendingWriteAnswer,
  } = partitionWriteKernel;
  const released = (proposal, release) => buildReleasedPendingWriteAnswer(
    {entryId: TEST_ENTRY_ID, proposal, logIndex: null}, TEST_PARTITION_ID,
    release);
  const deadline = {cause: CAUSE?.COMMIT_DEADLINE_EXCEEDED,
    deadlineMs: PARTITION_SERVICE_DEFAULT.PENDING_REQUEST_TIMEOUT_MS};
  // Input: the port's host failure, raised as the write path raises it.
  let portRefusal = null;
  try {
    assertRaftOperationSucceeded({outcome: RAFT_OPERATION_OUTCOME.HOST_FAILURE,
      reason: 'database or disk is full', phase: 'ready-persistence',
      retryable: true, recoveryRequired: false});
  } catch (error) {
    portRefusal = error;
  }
  const retryable = {
    deadlineProposed: released(PROPOSAL_QUEUE_PROPOSAL_STATE.PROPOSED,
      deadline),
    deadlineQueued: released(PROPOSAL_QUEUE_PROPOSAL_STATE.QUEUED, deadline),
    notLeaderQueued: released(PROPOSAL_QUEUE_PROPOSAL_STATE.QUEUED,
      {cause: CAUSE?.LEADERSHIP_LOST}),
  };
  // Input: the environmental failure of the write's own committed apply, as
  // the application rejects the pending write with it.
  const environmental = new Error('Committed partition statement failed ' +
    'in the host environment: database is locked');
  environmental.code =
    PARTITION_COMMITTED_COMMAND_ERROR_CODE.STATEMENT_ENVIRONMENT_FAILED;
  const failedWhileProposedOrApplied = {
    hostFailure: buildPartitionWriteProposalRefusal(portRefusal, null,
      {partitionId: TEST_PARTITION_ID, entryId: TEST_ENTRY_ID}),
    environmental: buildRejectedProposedWriteAnswer(environmental,
      {partitionId: TEST_PARTITION_ID, entryId: TEST_ENTRY_ID}),
  };
  for (const [name, answer] of Object.entries(retryable)) {
    t.equal(isRetryableControlPlaneError(answer), true,
      `${name}: the answer (${answer.failureCode}) is retryable`);
    t.equal(isRetryableControlPlaneError(new Error(answer.error)), true,
      `${name}: an Error of its text is retryable (${answer.error})`);
  }
  for (const [name, answer] of Object.entries(failedWhileProposedOrApplied)) {
    t.equal(answer.entryId, TEST_ENTRY_ID, `${name}: setup: the answer ` +
      'carries its entryId');
    t.equal(isRetryableControlPlaneError(answer), true,
      `${name}: the answer (${answer.failureCode}) is retryable`);
    t.equal(isRetryableControlPlaneError(new Error(answer.error)), false,
      `${name}: an Error of its text is not retried (${answer.error})`);
  }
  t.equal(isRetryableControlPlaneError(
    new Error('an answer text no owner lists')), false,
  'a text no owner lists is not retried');
});

// AD: a write whose proposal the host failed may be committed. A caller that
// holds only its text - the CDC mutation owner surfaces a partition answer
// as an Error of its text, without its code or entryId - does not retry it:
// a retry from the text runs under a freshly minted key, so the write could
// apply twice. One attempt, under one key, and the failure is surfaced.
test('a text-only Error of a host failure while proposing is not retried: ' +
  'one attempt under one key', async (t) => {
  let portRefusal = null;
  try {
    assertRaftOperationSucceeded({outcome: RAFT_OPERATION_OUTCOME.HOST_FAILURE,
      reason: 'database or disk is full', phase: 'ready-persistence',
      retryable: true, recoveryRequired: true});
  } catch (error) {
    portRefusal = error;
  }
  const answer = partitionWriteKernel.buildPartitionWriteProposalRefusal(
    portRefusal, null,
    {partitionId: TEST_PARTITION_ID, entryId: TEST_ENTRY_ID});
  const thrown = CDC_INTEGRATION_SERVICE_SHARED.buildSystemTableMutationError(
    answer, 'system table update failed');
  t.same({failureCode: thrown.failureCode ?? null,
    entryId: thrown.entryId ?? null}, {failureCode: null, entryId: null},
  'setup: the Error carries the answer\'s text alone');
  const keys = [];
  const update = () => runControlPlaneWrite({}, {op: 'update'},
    async (idempotencyKey) => {
      keys.push(idempotencyKey);
      if (keys.length === 1) {
        throw thrown;
      }
      return {success: true};
    });
  let surfaced = null;
  try {
    await runRetryableControlPlaneWrite(() => update(),
      {timeoutMs: 2000, baseDelayMs: 1, maxDelayMs: 2});
  } catch (error) {
    surfaced = error;
  }
  t.same({attempts: keys.length, keys: new Set(keys).size,
    surfaced: surfaced === thrown}, {attempts: 1, keys: 1, surfaced: true},
  'one attempt under one key; the failure is surfaced, not re-proposed');
});

test('isRetryableControlPlaneError detects transaction lane contention', async (t) => {
  const error = new Error('Transaction already active on this partition');

  t.equal(isRetryableControlPlaneError(error), true);
});

test('isRetryableControlPlaneError detects transaction commit visibility ' +
  'gaps', async (t) => {
  const error = new Error('No active transaction to commit');

  t.equal(isRetryableControlPlaneError(error), true);
});

test('isRetryableControlPlaneError treats cache visibility lag as retryable',
  async (t) => {
    const error = new Error(
      'Cache update not observed for sql_transactions:tx-1 within 1000ms',
    );

    t.equal(isRetryableControlPlaneError(error), true);
  },
);

test('isRetryableControlPlaneError excludes hard validation failures', async (t) => {
  const error = new Error('Replica owner conflict');
  error.code = 'REPLICA_OWNER_CONFLICT';

  t.equal(isRetryableControlPlaneError(error), false);
});

test('isRetryableControlPlaneError follows nested participant pressure ' +
  'signals', async (t) => {
  const result = {
    success: false,
    error: 'Query execution failed',
    errorCode: 'DISTRIBUTED_PARTICIPANT_FAILURE',
    firstFailedParticipant: {
      error: 'control_plane_pressure_degraded',
      errorCode: 'CONTROL_PLANE_PRESSURE_DEGRADED',
      retryAfterMs: 250,
      deferRetry: true,
    },
    participantFailures: [{
      error: 'control_plane_pressure_degraded',
      errorCode: 'CONTROL_PLANE_PRESSURE_DEGRADED',
      retryAfterMs: 250,
      deferRetry: true,
    }],
  };

  t.equal(getControlPlaneErrorMessage(result), 'Query execution failed');
  t.equal(getControlPlaneErrorCode(result), 'DISTRIBUTED_PARTICIPANT_FAILURE');
  t.equal(
    getControlPlaneRetryAfterMs(result),
    250,
    'nested retry-after hints should surface through the shared classifier',
  );
  t.equal(
    isRetryableControlPlaneError(result),
    true,
    'nested participant pressure should classify the top-level failure as retryable',
  );
});

test('isRetryableControlPlaneError preserves typed deterministic aggregate outcomes',
  async (t) => {
    const terminal = {
      success: false,
      error: 'Distributed operation failed due to participant failures',
      errorCode: 'DISTRIBUTED_PARTICIPANT_FAILURE',
      participantFailures: [{
        error: 'UNIQUE constraint failed: services.service_id',
        failureCode: 'SQLITE_CONSTRAINT_PRIMARYKEY',
        committed: true,
        outcome: 'statement_failed',
      }],
    };
    t.equal(isRetryableControlPlaneError(terminal), false,
      'generic aggregate text cannot retry a committed deterministic failure');
    t.equal(isRetryableControlPlaneError({...terminal,
      participantFailures: [{
        error: 'No connection to node p2',
        failureCode: 'OUTCOME_UNKNOWN',
        committed: false,
        outcome: 'unknown',
      }]}), true, 'nested transport uncertainty remains retryable');
    t.equal(isRetryableControlPlaneError({...terminal,
      participantFailures: [{
        error: 'control_plane_pressure_degraded',
        errorCode: 'CONTROL_PLANE_PRESSURE_DEGRADED',
        deferRetry: true,
      }]}), true, 'nested pressure remains retryable');
  });

test('getControlPlaneFailureSummary prioritizes authoritative source gaps over ' +
  'broader participant failures', async (t) => {
  const result = {
    success: false,
    error: 'Distributed operation failed due to participant failures',
    errorCode: 'DISTRIBUTED_PARTICIPANT_FAILURE',
    participantFailures: [{
      error: 'authoritative_row_source_unavailable',
    }, {
      error: 'Connection to node node-2 closed',
    }],
  };

  const summary = getControlPlaneFailureSummary(result);

  t.equal(
    summary.primaryReason,
    CONTROL_PLANE_FAILURE_REASON.AUTHORITATIVE_ROW_SOURCE_UNAVAILABLE,
    'the most specific authoritative source blocker should win',
  );
  t.equal(summary.authoritativeRowSourceUnavailableCount, 1);
  t.equal(summary.distributedParticipantFailureCount, 1);
  t.equal(summary.reconnectDeliveryFailureCount, 1);
  t.equal(summary.retryable, true);
});
