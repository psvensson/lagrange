import {test} from '../../src/test-helpers/tap.js';
import {
  CONTROL_PLANE_FAILURE_REASON,
  getControlPlaneErrorCode,
  getControlPlaneFailureSummary,
  getControlPlaneErrorMessage,
  getControlPlaneRetryAfterMs,
  isRetryableControlPlaneError,
} from '../../src/control-plane/control-plane-error-classification.js';
import {CDCIntegrationService} from '../../src/cdc/cdc-integration-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {ERRORS} from '../../src/constants/errors.js';
import {ROUTER_ERROR_MSG} from '../../src/constants/transport.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  PARTITION_COMMITTED_COMMAND_ERROR_CODE,
  PARTITION_SERVICE_DEFAULT,
} from '../../src/partition/partition-service-constants.js';
import {joinPendingStatement} from
  '../../src/partition/partition-committed-statement-outcome.js';
import * as partitionWriteKernel from
  '../../src/partition/partition-write-kernel.js';
import {PROPOSAL_QUEUE_PROPOSAL_STATE} from
  '../../src/partition/proposal-queue-constants.js';
import {DistributedWriteCoordinator} from
  '../../src/query/distributed/distributed-write-coordinator.js';
import {QUERY_ERROR_MSG} from '../../src/query/query-constants.js';
import {SQLParser} from '../../src/query/sql-parser.js';
import {assertRaftOperationSucceeded} from
  '../../src/raft/raft-operation-port.js';
import {RAFT_OPERATION_OUTCOME} from
  '../../src/raft/raft-operation-port-constants.js';
import {ReplicaOperationRepository} from
  '../../src/rebalancer/replica-operation-repository.js';

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
// stopped leading, and a host failure while proposing, which the port's
// caller decides and the control plane does not retry.
test('isRetryableControlPlaneError classifies the partition write kernel\'s ' +
  'answers by their owner, as the answer and as an Error of its text',
async (t) => {
  const {
    PARTITION_WRITE_RELEASE_CAUSE: CAUSE,
    buildPartitionWriteProposalRefusal,
    buildReleasedPendingWriteAnswer,
  } = partitionWriteKernel;
  const released = (proposal, release) => buildReleasedPendingWriteAnswer(
    {entryId: TEST_ENTRY_ID, proposal, logIndex: null}, TEST_PARTITION_ID,
    release);
  const deadline = {cause: CAUSE?.COMMIT_DEADLINE_EXCEEDED,
    deadlineMs: PARTITION_SERVICE_DEFAULT.PENDING_REQUEST_TIMEOUT_MS};
  const retryable = {
    deadlineProposed: released(PROPOSAL_QUEUE_PROPOSAL_STATE.PROPOSED,
      deadline),
    deadlineQueued: released(PROPOSAL_QUEUE_PROPOSAL_STATE.QUEUED, deadline),
    notLeaderQueued: released(PROPOSAL_QUEUE_PROPOSAL_STATE.QUEUED,
      {cause: CAUSE?.LEADERSHIP_LOST}),
  };
  // Input: the port's host failure, raised as the write path raises it.
  let portRefusal = null;
  try {
    assertRaftOperationSucceeded({outcome: RAFT_OPERATION_OUTCOME.HOST_FAILURE,
      reason: 'database or disk is full', phase: 'ready-persistence',
      retryable: true, recoveryRequired: false});
  } catch (error) {
    portRefusal = error;
  }
  const hostFailure = buildPartitionWriteProposalRefusal(portRefusal, null,
    {partitionId: TEST_PARTITION_ID, entryId: TEST_ENTRY_ID});
  for (const [name, answer] of Object.entries(retryable)) {
    t.equal(isRetryableControlPlaneError(answer), true,
      `${name}: the answer (${answer.failureCode}) is retryable`);
    t.equal(isRetryableControlPlaneError(new Error(answer.error)), true,
      `${name}: an Error of its text is retryable (${answer.error})`);
  }
  t.equal(isRetryableControlPlaneError(hostFailure), false,
    'a host failure while proposing is not retried ' +
    `(${hostFailure.failureCode})`);
  t.equal(isRetryableControlPlaneError(new Error(hostFailure.error)), false,
    `nor an Error of its text (${hostFailure.error})`);
  t.equal(isRetryableControlPlaneError(
    new Error('an answer text no owner lists')), false,
  'a text no owner lists is not retried');
});

// Quest reroute-carries-the-entry-id (F-at, F-as): the environmental failure
// of a committed write's application did not fail the write for good (it is
// applied again when the host recovers), so it is retried - and routed again
// only under its entryId; and a distributed write's participant results are
// walked for the partition answers they carry.
test('isRetryableControlPlaneError lists a committed write\'s environmental ' +
  'application failure as not failed for good, and walks participant results',
async (t) => {
  const {
    PARTITION_WRITE_RELEASE_CAUSE: CAUSE,
    buildPartitionWriteFailureResult,
    buildReleasedPendingWriteAnswer,
    isReroutableWriteFailureCode,
  } = partitionWriteKernel;
  // Input: the application's environmental failure, as its owner types it.
  const environmental = buildPartitionWriteFailureResult(Object.assign(
    new Error('database or disk is full'), {code:
      PARTITION_COMMITTED_COMMAND_ERROR_CODE.STATEMENT_ENVIRONMENT_FAILED}),
  TEST_PARTITION_ID);
  t.equal(isRetryableControlPlaneError(environmental), true,
    `the environmental failure is retried (${environmental.failureCode})`);
  t.equal(isReroutableWriteFailureCode(environmental.failureCode), false,
    'it is not routed again without its entryId');
  t.equal(isReroutableWriteFailureCode(environmental.failureCode,
    {carriesEntryId: true}), true, 'it is routed again under its entryId');
  const unknown = buildReleasedPendingWriteAnswer({entryId: TEST_ENTRY_ID,
    proposal: PROPOSAL_QUEUE_PROPOSAL_STATE.PROPOSED, logIndex: null},
  TEST_PARTITION_ID, {cause: CAUSE?.LEADERSHIP_LOST});
  const constraint = {success: false, error: 'UNIQUE constraint failed',
    failureCode: 'SQLITE_CONSTRAINT_PRIMARYKEY'};
  const withParticipant = (participant) => ({
    success: false,
    error: 'an answer text no owner lists',
    participantResults: [
      {success: true, partitionId: 'classification-p0'},
      {success: false, partitionId: TEST_PARTITION_ID,
        error: 'a participant text no owner lists',
        participantFailures: [participant]},
    ],
  });
  t.equal(isRetryableControlPlaneError(withParticipant(unknown)), true,
    'a participant result carrying an unknown outcome is retried');
  t.equal(isRetryableControlPlaneError(withParticipant(constraint)), false,
    'a participant result carrying a failed statement is not');
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

// Verification round 3, F22 and F21: a partition answer's code decides the
// retry before any summary text. The distributed write coordinator summarizes
// a failed write with its generic text (a retryable text for failures that
// are not partition answers); a participant's code that failed for good -
// the key reused for another statement, a host failure while proposing - is
// never retried for that text, whether the write had one participant or
// several, by the classifier or by the CDC routed mutation's retry test. A
// participant whose code did not fail for good is still retried.
// The coordinator's summary of a write over partitionIds whose participant
// answers are answerOf(partitionId) (a success when it gives none).
async function coordinatorSummaryOf(answerOf, partitionIds) {
  const coordinator = new DistributedWriteCoordinator({
    partitionResolver: {},
    queryExecutor: {
      async executeUpdate(_ast, [partitionId]) {
        const answer = answerOf(partitionId);
        return answer ? {...answer} : {success: true, changes: 1, rows: []};
      },
    },
    getTableInfo: () => ({primaryKey: 'id'}),
  });
  coordinator.logger = {debug() {}, info() {}, warn() {}, error() {}};
  const plan = coordinator.createWritePlan(
    new SQLParser('UPDATE t SET v = ? WHERE id = ?').parse(), ['v', 'id'],
    {partitionIds, idempotencyKey: 'classification-key'});
  return coordinator.executePlan(plan, ['v', 'id']);
}

// Each participant answer as its owner builds it: a write reaching a
// pending write under its entryId with another statement, the port's host
// failure raised as the write path raises it, and a replica that does not
// lead.
function ownerBuiltAnswers() {
  const {
    buildPartitionWriteLeadershipRefusal,
    buildPartitionWriteProposalRefusal,
  } = partitionWriteKernel;
  let portRefusal = null;
  try {
    assertRaftOperationSucceeded({outcome: RAFT_OPERATION_OUTCOME.HOST_FAILURE,
      reason: 'database or disk is full', phase: 'ready-persistence',
      retryable: true, recoveryRequired: false});
  } catch (error) {
    portRefusal = error;
  }
  return {
    failedForGood: {
      statementMismatch: joinPendingStatement({partitionId: TEST_PARTITION_ID},
        {pending: {command: {sql: 'UPDATE t SET v = ?', params: ['a']},
          outcome: null},
        command: {sql: 'UPDATE t SET v = ?', params: ['b'],
          entryId: TEST_ENTRY_ID}}),
      hostFailure: buildPartitionWriteProposalRefusal(portRefusal, null,
        {partitionId: TEST_PARTITION_ID, entryId: TEST_ENTRY_ID}),
    },
    notFailedForGood: {
      notLeader: buildPartitionWriteLeadershipRefusal({}, TEST_PARTITION_ID)},
  };
}

async function onClassifierNode(body) {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: 'classifier'}});
  LoggingService.getInstance().initialize({level: 'fatal'});
  try {
    await body(new CDCIntegrationService({nodeId: 'classifier'}));
  } finally {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  }
}

test('F22/F21: a participant\'s failed-for-good code is never retried for ' +
  'the coordinator\'s summary text', async (t) => {
  const {failedForGood, notFailedForGood} = ownerBuiltAnswers();
  const shapes = {
    single: [[TEST_PARTITION_ID], [TEST_PARTITION_ID]],
    oneOfTwo: [['classification-p0', TEST_PARTITION_ID], [TEST_PARTITION_ID]],
    bothOfTwo: [['classification-p0', TEST_PARTITION_ID],
      ['classification-p0', TEST_PARTITION_ID]],
  };
  await onClassifierNode(async (cdc) => {
    for (const [expected, answers] of [[false, failedForGood],
      [true, notFailedForGood]]) {
      for (const [name, answer] of Object.entries(answers)) {
        for (const [shape, [partitionIds, failing]] of Object.entries(shapes)) {
          const summary = await coordinatorSummaryOf((partitionId) =>
            (failing.includes(partitionId) ? answer : null), partitionIds);
          t.equal(summary.error, QUERY_ERROR_MSG.DISTRIBUTED_PARTICIPANT_FAILURE,
            `setup: ${name} ${shape}: the coordinator's summary text`);
          t.equal(isRetryableControlPlaneError(summary), expected,
            `${name} ${shape}: the classifier decides by the code`);
          t.equal(cdc.isTransientCdcError(summary), expected,
            `${name} ${shape}: the CDC routed mutation's retry test too`);
        }
      }
    }
  });
});

// Verification round 4, F23: the classifier decides a write's retry over
// every participant answer the failure links, bounded by the failure itself
// (each linked answer read once), never over a fixed window of them: a write
// of nine participants whose one failed-for-good answer comes last is not
// retried for the eight not-leader answers before it.
test('F23: every linked participant answer decides the retry, the last of ' +
  'nine too', async (t) => {
  const {failedForGood, notFailedForGood} = ownerBuiltAnswers();
  const partitionIds = Array.from({length: 9},
    (_, index) => `classification-p${index}`);
  await onClassifierNode(async (cdc) => {
    for (const [name, answer] of Object.entries(failedForGood)) {
      const summary = await coordinatorSummaryOf((partitionId) =>
        (partitionId === partitionIds.at(-1) ? answer :
          notFailedForGood.notLeader), partitionIds);
      t.equal(summary.participantFailures?.at(-1)?.failureCode,
        answer.failureCode, `setup: ${name}: the summary links the ` +
        'failed-for-good answer last');
      t.equal(isRetryableControlPlaneError(summary), false,
        `${name} last of nine: the classifier does not retry it`);
      t.equal(cdc.isTransientCdcError(summary), false,
        `${name} last of nine: nor does the CDC routed mutation`);
    }
  });
});

// Verification round 4, F27: the replica-operation repository defers a
// failure that links a coded partition answer to the classifier before its
// own retry texts. The input is a summary linking a participant that failed
// for good, carrying a text the repository's own list retries (a routing
// text the classifier does not): the code decides, not the text.
test('F27: the rebalancer\'s retry texts never retry a linked answer that ' +
  'failed for good', async (t) => {
  const {failedForGood} = ownerBuiltAnswers();
  await onClassifierNode(async () => {
    const repository = new ReplicaOperationRepository({
      nodeId: 'classifier',
      systemTableCache: {get: () => null, getAll: () => [], filter: () => []},
      cdcIntegrationService: {waitForCacheUpdate: async () => {}},
      controlPlaneSystemTableGateway: {},
      logger: {info() {}, warn() {}, error() {}, debug() {}},
    });
    const routingText = {success: false,
      error: ERRORS.PARTITION_SERVICE_NOT_FOUND};
    t.equal(isRetryableControlPlaneError(routingText), false,
      'setup: the classifier does not retry the routing text');
    t.equal(repository.isRetryableOperationPersistError(routingText), true,
      'setup: the repository\'s own texts retry it');
    for (const [name, answer] of Object.entries(failedForGood)) {
      const summary = await coordinatorSummaryOf(() => answer,
        [TEST_PARTITION_ID]);
      t.equal(repository.isRetryableOperationPersistError(
        {...summary, error: routingText.error}), false,
      `${name}: the linked code decides before the repository's texts`);
    }
  });
});
