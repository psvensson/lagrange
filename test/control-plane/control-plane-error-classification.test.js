import {readFile} from 'node:fs/promises';
import {test} from '../../src/test-helpers/tap.js';
import {
  CONTROL_PLANE_ERROR_CODE_DECISION,
  CONTROL_PLANE_FAILURE_REASON,
  classifyTypedDistributedFailure,
  getControlPlaneErrorCode,
  getControlPlaneFailureSummary,
  getControlPlaneErrorMessage,
  getControlPlaneRetryAfterMs,
  isRetryableControlPlaneError,
  isTerminalTypedDistributedFailure,
  TYPED_DISTRIBUTED_FAILURE_DECISION,
} from '../../src/control-plane/control-plane-error-classification.js';
import {isTransientProvisioningError} from
  '../../src/query/schema-provisioning-job-owner.js';
import {distributedTransactionDecisionProtocolMethods} from
  '../../src/query/distributed/distributed-transaction-decision-protocol.js';
import {ROUTER_ERROR_MSG, TRANSPORT_ERROR_MSG} from
  '../../src/constants/transport.js';
import {
  TRANSPORT_ACKNOWLEDGEMENT,
  TRANSPORT_DELIVERY_OUTCOME_REASON_CODE,
  classifyThrownDeliveryError,
  isDeliveryTimeoutTransportOutcome,
} from '../../src/transport/transport-semantic-outcome.js';
import * as TRANSPORT_ERROR_CODES from
  '../../src/transport/transport-error-codes.js';
import {CDC_ERROR_CODE} from '../../src/cdc/cdc-constants.js';
import {QUERY_AST_TYPE, QUERY_ERROR_CODE, QUERY_ERROR_MSG} from
  '../../src/query/query-constants.js';
import {SCHEMA_PROVISIONING_ERROR_CODE} from
  '../../src/query/schema-provisioning-job-constants.js';
import {DistributedWriteCoordinator} from
  '../../src/query/distributed/distributed-write-coordinator.js';
import {ParallelQueryCoordinator} from
  '../../src/query/distributed/parallel-query-coordinator.js';
import {QueryExecutor} from '../../src/query/query-executor.js';
import {CDC_INTEGRATION_SERVICE_SHARED as CDC_SHARED} from
  '../../src/cdc/cdc-integration-service-shared.js';
import {
  ROUTER_CONNECTION_CLOSED_ERROR_CODE,
  ROUTER_MESSAGE_TIMEOUT_ERROR_CODE,
} from '../../src/transport/transport-error-codes.js';
import {
  applyRebalanceCoordinatorOperationPersistenceCollisionMethods,
} from
  '../../src/rebalancer/rebalance-coordinator-operation-persistence-collision.js';
import {OPERATION_INTENT_TERMINAL_COLLISION_CODE} from
  '../../src/constants/errors.js';
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

const DELIVERY_TIMEOUT_RETRYABLE_TEST_NAME =
  'a delivery timeout is retried by its typed code in either wait, and ' +
  'never by its text';
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

// A spent delivery lifetime is retried by the router's typed code. The
// transport owner names the two waits apart (ack_timeout: no ACK came;
// answer_timeout: the target accepted it and may have executed it); this
// classifier decides them alike, because the retry loop re-sends the same
// logical write under its one write identity (R14). Its text alone is no
// owner's answer, and the pending-response text has no producer at all.
test(DELIVERY_TIMEOUT_RETRYABLE_TEST_NAME, async (t) => {
  for (const [acknowledgement, reasonCode] of [
    [TRANSPORT_ACKNOWLEDGEMENT.UNACKNOWLEDGED,
      TRANSPORT_DELIVERY_OUTCOME_REASON_CODE.ACK_TIMEOUT],
    [TRANSPORT_ACKNOWLEDGEMENT.ACKNOWLEDGED,
      TRANSPORT_DELIVERY_OUTCOME_REASON_CODE.ANSWER_TIMEOUT]]) {
    const timeout = Object.assign(new Error(TRANSPORT_ERROR_MSG.MESSAGE_TIMEOUT),
      {code: ROUTER_MESSAGE_TIMEOUT_ERROR_CODE, acknowledgement});
    const reading = classifyThrownDeliveryError(timeout);
    t.ok(isDeliveryTimeoutTransportOutcome(reading) &&
      reading.reasonCode === reasonCode,
    `setup: the transport owner reads ${reasonCode}`);
    t.equal(classifyTypedDistributedFailure(timeout), 'retryable',
      `${reasonCode}: retried by its code`);
    t.equal(classifyTypedDistributedFailure({success: false,
      error: timeout.message, errorCode: timeout.code}), 'retryable',
    `${reasonCode}: an answer carrying the code is retried`);
  }
  for (const text of [TRANSPORT_ERROR_MSG.MESSAGE_TIMEOUT,
    ROUTER_ERROR_MSG.PENDING_RESPONSE_TIMEOUT]) {
    t.equal(isRetryableControlPlaneError(new Error(text)), false,
      `the text "${text}" alone is not retried`);
  }
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

test('retired partition-session contention text alone is not retryable',
  async (t) => {
    const retired = new Error('Transaction already active on this partition');

    t.equal(isRetryableControlPlaneError(retired), false,
      'retryability must come from a current typed or transport owner');
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

test('typed distributed failure classification handles participant outcomes', async (t) => {
  const retryableOutcomeUnknown = {
    error: 'Distributed operation failed due to participant failures',
    errorCode: 'DISTRIBUTED_PARTICIPANT_FAILURE',
    participantFailures: [{
      error: 'The proposal was accepted into consensus and its outcome is not known',
      failureCode: 'partition_write_outcome_unknown',
      deferRetry: true,
    }],
  };
  t.equal(classifyTypedDistributedFailure(retryableOutcomeUnknown), 'retryable');
  t.equal(isTerminalTypedDistributedFailure(retryableOutcomeUnknown), false);
  t.equal(isRetryableControlPlaneError(retryableOutcomeUnknown), true);

  const terminalPrimaryKey = {
    error: 'Distributed operation failed due to participant failures',
    errorCode: 'DISTRIBUTED_PARTICIPANT_FAILURE',
    participantFailures: [{
      error: 'UNIQUE constraint failed: test.id',
      failureCode: 'SQLITE_CONSTRAINT_PRIMARYKEY',
      committed: true,
      outcome: 'statement_failed',
    }],
  };
  t.equal(classifyTypedDistributedFailure(terminalPrimaryKey), 'terminal');
  t.equal(isTerminalTypedDistributedFailure(terminalPrimaryKey), true);
  t.equal(isRetryableControlPlaneError(terminalPrimaryKey), false);

  const mixedFailureSet = {
    error: 'Distributed operation failed due to participant failures',
    errorCode: 'DISTRIBUTED_PARTICIPANT_FAILURE',
    participantFailures: [
      {
        error: 'The proposal was accepted into consensus and its outcome is not known',
        failureCode: 'partition_write_outcome_unknown',
        deferRetry: true,
      },
      {
        error: 'UNIQUE constraint failed: test.id',
        failureCode: 'SQLITE_CONSTRAINT_PRIMARYKEY',
        committed: true,
        outcome: 'statement_failed',
      },
    ],
  };
  t.equal(classifyTypedDistributedFailure(mixedFailureSet), 'terminal');
  t.equal(isTerminalTypedDistributedFailure(mixedFailureSet), true);
  t.equal(isRetryableControlPlaneError(mixedFailureSet), false);

  const writerShutdown = {
    error: 'Distributed operation failed due to participant failures',
    errorCode: 'DISTRIBUTED_PARTICIPANT_FAILURE',
    participantFailures: [{
      error: 'writer shut down',
      errorCode: CDC_ERROR_CODE.SHUT_DOWN,
    }],
  };
  t.equal(classifyTypedDistributedFailure(writerShutdown), 'terminal');
  t.equal(isTerminalTypedDistributedFailure(writerShutdown), true);
  t.equal(isRetryableControlPlaneError(writerShutdown), false);
});

// The wrapper a failed distributed write answers with: the wrapper's own
// text and code say only that participants failed, so its participants (and
// the wrapper's own retry signals) decide.
function participantFailureWrapper(participantFailures, extra = {}) {
  return {
    success: false,
    error: QUERY_ERROR_MSG.DISTRIBUTED_PARTICIPANT_FAILURE,
    errorCode: QUERY_ERROR_CODE.DISTRIBUTED_PARTICIPANT_FAILURE,
    retryAfterMs: null,
    participantFailures,
    firstFailedParticipant: participantFailures[0],
    ...extra,
  };
}

const TYPED_CONSTRAINT_PARTICIPANT = Object.freeze({
  error: 'UNIQUE constraint failed: test.id',
  failureCode: 'SQLITE_CONSTRAINT_PRIMARYKEY',
  committed: true,
  outcome: 'statement_failed',
});
const TEXT_CONSTRAINT_PARTICIPANT = Object.freeze({
  error: 'UNIQUE constraint failed: test.id',
});
const TRANSIENT_PARTICIPANT = Object.freeze({
  error: 'No connection to node p2',
});
const UNCLASSIFIED_PARTICIPANT = Object.freeze({
  error: 'an answer text no owner lists',
});

// The participant entry the write coordinator records for a participant
// whose statement threw: its real catch, given the thrown error.
async function participantEntryOfThrown(thrown) {
  return DistributedWriteCoordinator.prototype.executePartitionStatement.call(
    {queryExecutor: {async executeInsert() {
      throw thrown;
    }}},
    QUERY_AST_TYPE.INSERT, {}, TEST_PARTITION_ID, [], {});
}

// B1 (R14): the write kernel's own code decides its answer. The unknown
// outcome of a write the host failed while proposing keeps the host failure
// as its cause; that cause's code is not a retryable answer code, and it
// must not veto the answer, which is re-delivered under its entryId.
test('a linked cause never vetoes the code of the answer it explains',
  async (t) => {
    const {PARTITION_WRITE_LEADERSHIP_REFUSAL: REFUSAL} = partitionWriteKernel;
    const answer = {
      success: false,
      failureCode: REFUSAL.OUTCOME_UNKNOWN,
      entryId: TEST_ENTRY_ID,
      cause: {failureCode: REFUSAL.CONSENSUS_HOST_FAILURE},
    };
    t.equal(classifyTypedDistributedFailure(answer), 'retryable');
    t.equal(isRetryableControlPlaneError(answer), true);
    t.equal(isRetryableControlPlaneError({
      success: false, failureCode: REFUSAL.CONSENSUS_HOST_FAILURE,
    }), false, 'the same code as the answer\'s own code is not retried');
    const deferredOverConstraint = Object.assign(new Error('write deferred'), {
      deferRetry: true,
      cause: Object.assign(new Error('constraint'),
        {code: 'SQLITE_CONSTRAINT_UNIQUE'}),
    });
    t.equal(isRetryableControlPlaneError(deferredOverConstraint), true,
      'a permanent cause does not veto its wrapper\'s own retry signal');
    const overShutDown = Object.assign(new Error('write deferred'), {
      deferRetry: true,
      cause: Object.assign(new Error('shut down'),
        {code: CDC_ERROR_CODE.SHUT_DOWN}),
    });
    t.equal(classifyTypedDistributedFailure(overShutDown), 'terminal',
      'only the writer\'s shut-down answer decides across links');
  });

// B2 (R12): the fan-out coordinator's chunk timeout carries a typed code
// from its producer, and that code survives the write coordinator's
// participant entry, so a CREATE TABLE under load is retried, not failed.
test('the coordinator chunk timeout is a typed transient participant failure',
  async (t) => {
    const coordinator = new ParallelQueryCoordinator({
      systemCache: {get: () => null, filter: () => [], getAll: () => []},
      partitionQueryExecutor: () => new Promise(() => {}),
    });
    coordinator.speculativeExecutionEnabled = false;
    let thrown = null;
    try {
      await coordinator.executeParallel('SELECT 1', ['p1'], [], {timeoutMs: 5});
    } catch (error) {
      thrown = error;
    }
    t.equal(thrown?.message, 'Query timeout after 5ms',
      'setup: the coordinator raised its chunk timeout');
    t.equal(thrown?.code, QUERY_ERROR_CODE.COORDINATOR_QUERY_TIMEOUT,
      'the producer types its timeout');
    const entry = await participantEntryOfThrown(thrown);
    t.same({errorCode: entry.errorCode, retryAfterMs: entry.retryAfterMs,
      deferRetry: entry.deferRetry},
    {errorCode: QUERY_ERROR_CODE.COORDINATOR_QUERY_TIMEOUT, retryAfterMs: null,
      deferRetry: false}, 'the participant entry carries the code alone');
    const wrapper = participantFailureWrapper([entry]);
    t.equal(classifyTypedDistributedFailure(wrapper), 'retryable');
    t.equal(isRetryableControlPlaneError(wrapper), true);
    t.equal(classifyTypedDistributedFailure(participantFailureWrapper([
      {error: thrown.message, errorCode: null}])), 'unclassified',
    'the same text without its code is no owner\'s answer');
  });

// F9(b): the one producer of QUERY_EXECUTOR_SHUTTING_DOWN is this process's
// own executor. A retry loop on a node that is going down stops at once with
// that typed state - it is neither retried to the loop's deadline nor
// recorded as a permanent failure - wherever the code is linked (a fan-out
// participant built from the local executor's throw included). Another
// node's shutdown reaches a caller as a transport failure, which is retried.
test('this node\'s own executor shutdown stops a retry loop at once: ' +
  'typed stopped, never retried, never terminal', async (t) => {
  let thrown = null;
  try {
    QueryExecutor.prototype.throwIfCancelled.call({_shuttingDown: true}, null);
  } catch (error) {
    thrown = error;
  }
  t.equal(thrown?.code, QUERY_ERROR_CODE.QUERY_EXECUTOR_SHUTTING_DOWN,
    'the producer\'s code is the owner constant');
  const wrapper = participantFailureWrapper(
    [await participantEntryOfThrown(thrown)]);
  for (const [name, failure] of [['thrown', thrown], ['participant', wrapper],
    ['behind a retry hint', Object.assign(new Error('write deferred'),
      {deferRetry: true, cause: thrown})]]) {
    t.equal(classifyTypedDistributedFailure(failure),
      TYPED_DISTRIBUTED_FAILURE_DECISION.STOPPED, `${name}: stopped`);
    t.equal(isRetryableControlPlaneError(failure), false,
      `${name}: not retried`);
    t.equal(isTerminalTypedDistributedFailure(failure), false,
      `${name}: not recorded as permanent`);
  }
  t.equal(isTransientProvisioningError(wrapper), true,
    'a schema job is left pending, not failed, by a local shutdown');
  let attempts = 0;
  let surfaced = null;
  let clock = 0;
  try {
    await runRetryableControlPlaneWrite(async () => {
      attempts += 1;
      throw thrown;
    }, {timeoutMs: 30000, now: () => clock,
      sleep: async (delayMs) => {
        clock += delayMs;
      }});
  } catch (error) {
    surfaced = error;
  }
  t.same({attempts, surfaced: surfaced === thrown, clock},
    {attempts: 1, surfaced: true, clock: 0},
    'one attempt; the shutdown is surfaced without spinning to the deadline');
  t.equal(isRetryableControlPlaneError(participantFailureWrapper([{
    error: ROUTER_ERROR_MSG.connectionClosed('node-2'),
    errorCode: ROUTER_CONNECTION_CLOSED_ERROR_CODE}])), true,
  'a remote node going down is a transport failure, which is retried');
});

// F9(a): every query and transport code is decided here, transient,
// permanent, stopped or unclassified, each with its reason; a code an owner
// adds fails this witness until it is decided.
test('every query and transport error code has an explicit decision',
  async (t) => {
    const owned = [...Object.values(QUERY_ERROR_CODE),
      ...Object.values(TRANSPORT_ERROR_CODES)];
    const classes = new Set(['transient', 'permanent', 'stopped',
      'unclassified']);
    for (const code of owned) {
      const decision = Object.hasOwn(CONTROL_PLANE_ERROR_CODE_DECISION, code) ?
        CONTROL_PLANE_ERROR_CODE_DECISION[code] : null;
      t.ok(decision !== null && classes.has(decision.candidateClass) &&
        typeof decision.reason === 'string' && decision.reason.length > 0,
      `${code} is decided with a reason`);
    }
  });

// F9(a): the codes that were retried only through a text fragment or a
// deferRetry hint are retried by the code alone.
test('transport and provisioning codes are decided by code alone', async (t) => {
  for (const code of [TRANSPORT_ERROR_CODES.ROUTER_NO_CONNECTION_ERROR_CODE,
    TRANSPORT_ERROR_CODES.WEBSOCKET_CONNECT_TIMEOUT_ERROR_CODE,
    TRANSPORT_ERROR_CODES.OUTBOUND_QUEUE_BACKPRESSURE_ERROR_CODE,
    TRANSPORT_ERROR_CODES.ROUTER_QUERY_TRANSPORT_NOT_READY_ERROR_CODE,
    QUERY_ERROR_CODE.TABLE_PARTITION_PROVISIONING_RETRYABLE,
    QUERY_ERROR_CODE.PROVISIONING_UNAVAILABLE,
    QUERY_ERROR_CODE.PARTITION_EPOCH_EVIDENCE_DEFERRED]) {
    const bare = Object.assign(new Error('refused'), {code});
    t.equal(classifyTypedDistributedFailure(bare), 'retryable',
      `${code}: retried by its code`);
    t.equal(classifyTypedDistributedFailure(participantFailureWrapper([
      {error: 'refused', errorCode: code}])), 'retryable',
    `${code}: a participant carrying it is retried`);
  }
});

// F9(a): an in-doubt COMMIT decision is resolved by transaction recovery,
// never by a blind re-send - not even behind a wrapper's retry hint.
test('an in-doubt transaction decision stops a retry loop', async (t) => {
  const inDoubt = distributedTransactionDecisionProtocolMethods
    .buildDecisionInDoubtResult.call(
      {getOrderedParticipantIds: () => ['p1']},
      {transactionId: 'tx-1', status: 'COMMITTING', decisionReadState: null});
  t.equal(inDoubt.errorCode, QUERY_ERROR_CODE.TRANSACTION_DECISION_IN_DOUBT,
    'setup: the producer\'s typed answer');
  for (const failure of [inDoubt,
    participantFailureWrapper([inDoubt], {deferRetry: true})]) {
    t.equal(classifyTypedDistributedFailure(failure), 'stopped');
    t.equal(isRetryableControlPlaneError(failure), false);
    t.equal(isTerminalTypedDistributedFailure(failure), false);
  }
});

// F9(c): a permanent failure that reached the classifier as its text alone
// - a partition error string, or the string cause of a wrapper or of a
// participant that says nothing of itself - is permanent, and the wrapper
// is not retried.
test('a permanent failure given as a string participant or cause is ' +
  'terminal', async (t) => {
  const constraint = 'UNIQUE constraint failed: services.service_id';
  const failures = {
    stringPartitionError: participantFailureWrapper([], {
      partitionErrors: [constraint]}),
    stringWrapperCause: Object.assign(
      new Error(QUERY_ERROR_MSG.DISTRIBUTED_PARTICIPANT_FAILURE),
      {cause: constraint}),
    participantCause: participantFailureWrapper([
      {error: 'participant failed', cause: constraint}]),
    participantErrorCause: participantFailureWrapper([
      {error: 'participant failed', cause: Object.assign(new Error('x'),
        {code: 'SQLITE_CONSTRAINT_UNIQUE'})}]),
  };
  for (const [name, failure] of Object.entries(failures)) {
    t.equal(classifyTypedDistributedFailure(failure), 'terminal', name);
    t.equal(isRetryableControlPlaneError(failure), false,
      `${name}: not retried`);
  }
  t.equal(classifyTypedDistributedFailure(participantFailureWrapper([
    {error: 'participant failed', deferRetry: true, cause: constraint}])),
  'retryable', 'a participant\'s own retry signal is not vetoed by its cause');
});

// F9(d): the classifier is a leaf every owner imports; it reads no
// rebalancer module (the collision code lives below both).
test('the control-plane classifier imports no rebalancer module',
  async (t) => {
    const source = await readFile(new URL(
      '../../src/control-plane/control-plane-error-classification.js',
      import.meta.url), 'utf8');
    const specifiers = [...source.matchAll(/from\s+'([^']+)'/g)]
      .map((match) => match[1]);
    t.ok(specifiers.length > 0, 'setup: the module has imports');
    t.same(specifiers.filter((specifier) =>
      specifier.includes('/rebalancer/')), [], 'no rebalancer import');
  });

// B2: one decision for every participant set. A permanent participant ends
// the set whatever else is in it (the constraint failure must not be retried
// behind a transient sibling or a wrapper hint); otherwise a transient
// participant keeps it retryable; unclassified participants are an explicit
// state that leaves the decision to the wrapper's own retry signals.
test('participant sets: permanent ends, transient retries, unclassified ' +
  'falls through to the wrapper\'s own retry signals', async (t) => {
  const cases = [
    ['all transient', [TRANSIENT_PARTICIPANT, TRANSIENT_PARTICIPANT], {},
      'retryable'],
    ['transient + typed permanent',
      [TRANSIENT_PARTICIPANT, TYPED_CONSTRAINT_PARTICIPANT], {}, 'terminal'],
    ['transient + text permanent',
      [TRANSIENT_PARTICIPANT, TEXT_CONSTRAINT_PARTICIPANT], {}, 'terminal'],
    ['typed permanent behind wrapper retry signals',
      [TYPED_CONSTRAINT_PARTICIPANT], {retryAfterMs: 250, deferRetry: true},
      'terminal'],
    ['text permanent with its own retry hint',
      [{...TEXT_CONSTRAINT_PARTICIPANT, deferRetry: true}], {}, 'terminal'],
    ['transient + unclassified',
      [TRANSIENT_PARTICIPANT, UNCLASSIFIED_PARTICIPANT], {}, 'retryable'],
    ['all unclassified, no wrapper signal', [UNCLASSIFIED_PARTICIPANT], {},
      'unclassified'],
    ['all unclassified, wrapper retryAfterMs', [UNCLASSIFIED_PARTICIPANT],
      {retryAfterMs: 250}, 'retryable'],
    ['all unclassified, wrapper deferRetry', [UNCLASSIFIED_PARTICIPANT],
      {deferRetry: true}, 'retryable'],
    ['no participants, no wrapper signal', [], {}, 'unclassified'],
  ];
  for (const [name, participants, extra, expected] of cases) {
    const wrapper = participantFailureWrapper(participants, extra);
    t.equal(classifyTypedDistributedFailure(wrapper), expected, name);
    // A retry loop retries a failed fan-out unless it is terminal: its
    // unclassified state is the three-state consumer's to decide.
    t.equal(isRetryableControlPlaneError(wrapper), expected !== 'terminal',
      `${name}: a retry loop's answer`);
    t.equal(isTerminalTypedDistributedFailure(wrapper),
      expected === 'terminal', `${name}: terminal`);
  }
  const rethrownText = new Error('Failed to register node: ' +
    QUERY_ERROR_MSG.DISTRIBUTED_PARTICIPANT_FAILURE);
  t.equal(classifyTypedDistributedFailure(rethrownText), 'unclassified',
    'a fan-out failure rethrown as its text names no participant');
  t.equal(isRetryableControlPlaneError(rethrownText), true,
    'a retry loop retries a failed fan-out it knows nothing permanent of');
  t.equal(isRetryableControlPlaneError(UNCLASSIFIED_PARTICIPANT), false,
    'an unclassified failure that is not a fan-out is not retried');
});

test('permanence comes from the owner\'s typed code, not from a code family',
  async (t) => {
    const noSuchTable = {error: 'no such table: orders',
      failureCode: 'SQLITE_ERROR'};
    t.equal(classifyTypedDistributedFailure(
      participantFailureWrapper([noSuchTable])), 'unclassified',
    'a bare SQLITE_ERROR also names a table a later attempt may find');
    t.equal(classifyTypedDistributedFailure(participantFailureWrapper([
      {...noSuchTable, committed: true, outcome: 'statement_failed'}])),
    'terminal', 'the committed statement failure is the typed permanent answer');
    const intentConflict = Object.assign(
      new Error('A different schema intent already owns global.t'),
      {code: SCHEMA_PROVISIONING_ERROR_CODE.INTENT_CONFLICT, deferRetry: true});
    t.equal(classifyTypedDistributedFailure(intentConflict), 'terminal',
      'a schema intent conflict is permanent whatever hint it carries');
    for (const code of ['CONTROL_PLANE_WRITER_SHUTDOWN', 'INTENT_CONFLICT',
      'SCHEMA_PROVISIONING_INTENT_CONFLICT', 'PLACEMENT_POLICY_REJECTED',
      'SCHEMA_VALIDATION_ERROR']) {
      t.equal(classifyTypedDistributedFailure(
        Object.assign(new Error('refused'), {code})), 'unclassified',
      `${code} has no producer and no meaning here`);
    }
  });

// A deterministic intent whose durable operation ended FAILED cannot be
// cured under the same intent id: its producer types that answer, and the
// classifier holds it permanent by the producer's own constant.
test('a durably terminal intent collision is a typed permanent failure',
  async (t) => {
    class Coordinator {
      isRecentOperationIntentTerminal() {
        return true;
      }
    }
    applyRebalanceCoordinatorOperationPersistenceCollisionMethods(Coordinator);
    let thrown = null;
    try {
      await new Coordinator().resolveCreatedOperationPersistenceCollision({
        operation: {operationId: 'job-1:operation:node-a'},
        persistResult: {operation: {operationId: 'job-1:operation:node-a',
          status: 'FAILED', workflowStep: 'FAILED'}},
        move: {operationIntentId: 'job-1:operation:node-a'},
      });
    } catch (error) {
      thrown = error;
    }
    t.match(thrown?.message, /durably terminal for deterministic intent/);
    t.equal(thrown?.code, OPERATION_INTENT_TERMINAL_COLLISION_CODE,
      'the producer types its refusal');
    t.equal(classifyTypedDistributedFailure(
      Object.assign(thrown, {deferRetry: true})), 'terminal',
    'the classifier holds it permanent whatever hint it carries');
  });

// The CDC consumers of a router failure read the router's codes from the
// transport owner. (They read two members of QUERY_ERROR_CODE that do not
// exist, so a real router code never matched.) Every transport code is
// decided by the one table (CONTROL_PLANE_ERROR_CODE_DECISION): it is never
// an owner handoff (the routed write loop re-sends it under its one key), and
// the selected read owner is retained. The production CDC transport and
// single-path roots cover the latter after removal of the SQL alternate.
// A failure with no code is not an owner handoff.
test('CDC classifies a router failure by the transport owner\'s code, and ' +
  'a failure with no code by none', async (t) => {
  const failure = (extra) => ({success: false, error: 'owner read failed',
    failedTable: 'nodes', ...extra});
  for (const code of Object.values(TRANSPORT_ERROR_CODES)) {
    t.equal(CDC_SHARED.isSystemTableOwnerHandoffFailure(
      failure({errorCode: code})), false,
    `${code}: a transport failure is never an owner handoff`);
  }
  for (const noCode of [{}, {errorCode: null}, {errorCode: ''},
    {errorCode: 'UNDEFINED'}]) {
    t.equal(CDC_SHARED.isSystemTableOwnerHandoffFailure(failure(noCode)),
      false, `${JSON.stringify(noCode)}: no owner handoff by code`);
  }
  t.equal(CDC_SHARED.isSystemTableOwnerHandoffFailure(failure({
    failureCode: partitionWriteKernel.PARTITION_WRITE_LEADERSHIP_REFUSAL
      .NOT_LEADER})), true,
  'the partition\'s own reroutable answer is the owner handoff');
});
