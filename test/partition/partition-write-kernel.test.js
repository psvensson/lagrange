import {test} from '../../src/test-helpers/tap.js';
import {
  DURABLE_COMMIT_WITNESS_ERROR,
  PARTITION_WRITE_COMMIT_MODE,
  buildDurableCommitWitness,
  buildPartitionWriteEntry,
  buildPartitionWriteFailureResult,
  buildPartitionWriteSideEffectPlan,
  resolvePartitionWriteCommitMode,
} from '../../src/partition/partition-write-kernel.js';
import * as partitionWriteKernel from
  '../../src/partition/partition-write-kernel.js';
import * as errorConstants from '../../src/constants/errors.js';
import * as proposalQueueConstants from
  '../../src/partition/proposal-queue-constants.js';
import {ProposalQueue} from '../../src/partition/proposal-queue.js';
import {assertRaftOperationSucceeded} from
  '../../src/raft/raft-operation-port.js';
import {RAFT_OPERATION_OUTCOME} from
  '../../src/raft/raft-operation-port-constants.js';
import {RAFT_RS_PERSISTENCE_ADMISSION} from
  '../../src/raft/raft-rs-durable-store-constants.js';

const TEST_ENTRY_ID = 'entry-1';
const TEST_PROPOSED_AT = 1234;
const TEST_TIMESTAMP = '987654321';
const TEST_PARTITION_ID = 'partition-1';
const TEST_LOG_INDEX = 7;

function buildTestCommitWitness(term, index) {
  return buildDurableCommitWitness({
    partitionId: TEST_PARTITION_ID,
    leaderNodeId: 'node-1',
    leaderReplicaId: 'replica-1',
    logEntry: {
      term,
      index,
      data: {entryId: TEST_ENTRY_ID},
    },
  });
}

test('partition write kernel builds canonical write entries', async (t) => {
  const entry = buildPartitionWriteEntry(
    {
      type: 'INSERT',
      sql: 'INSERT INTO test_table (id) VALUES (?)',
      params: ['r1'],
      entryId: TEST_ENTRY_ID,
    },
    {
      timestamp: TEST_TIMESTAMP,
      proposedBy: 'replica-1',
      proposedAt: TEST_PROPOSED_AT,
    },
  );

  t.equal(entry.entryId, TEST_ENTRY_ID);
  t.equal(entry.timestamp, TEST_TIMESTAMP);
  t.equal(entry.proposedBy, 'replica-1');
  t.equal(entry.proposedAt, TEST_PROPOSED_AT);
});

test('partition write kernel rejects non-durable Raft positions', async (t) => {
  for (const position of [
    {term: -1, index: TEST_LOG_INDEX},
    {term: 1, index: 0},
    {term: 1, index: -1},
  ]) {
    t.throws(
      () => buildTestCommitWitness(position.term, position.index),
      new RegExp(DURABLE_COMMIT_WITNESS_ERROR),
      `term ${position.term}, index ${position.index} is not durable evidence`,
    );
  }
});

test('partition write kernel resolves raft and rejected commit modes',
  async (t) => {
    t.same(Object.values(PARTITION_WRITE_COMMIT_MODE).sort(),
      [PARTITION_WRITE_COMMIT_MODE.RAFT, PARTITION_WRITE_COMMIT_MODE.REJECTED]
        .sort(),
      'a write is either proposed through consensus or rejected; there is no ' +
      'direct-execution mode');
    t.equal(
      resolvePartitionWriteCommitMode({
        replicaIds: ['r1'],
        raftState: 'leader',
        raftLeaderState: 'leader',
      }),
      PARTITION_WRITE_COMMIT_MODE.RAFT,
      'a lone leader proposes: it commits its own proposal',
    );
    t.equal(
      resolvePartitionWriteCommitMode({
        replicaIds: ['r1'],
        raftState: 'follower',
        raftLeaderState: 'leader',
      }),
      PARTITION_WRITE_COMMIT_MODE.REJECTED,
      'a single replica that is not the consensus leader rejects',
    );
    t.equal(
      resolvePartitionWriteCommitMode({
        replicaIds: ['r1', 'r2'],
        raftState: 'leader',
        raftLeaderState: 'leader',
      }),
      PARTITION_WRITE_COMMIT_MODE.RAFT,
      'multi-replica leader writes should use raft commit mode',
    );
    t.equal(
      resolvePartitionWriteCommitMode({
        replicaIds: ['r1', 'r2'],
        raftState: 'follower',
        raftLeaderState: 'leader',
      }),
      PARTITION_WRITE_COMMIT_MODE.REJECTED,
      'multi-replica follower writes should be rejected before apply',
    );
  });

test('partition write kernel refuses a unilateral commit against contradicted topology',
  async (t) => {
    // Run-15 freeze poison: a REPLACE-added replica whose local replica list
    // was viability-filtered to self-only (CL-013 class) self-committed
    // coordinator writes as a phantom leader. A known remote leader - an
    // ACTUAL, observed via raft traffic or the published leader pointer -
    // rejects the write even when the self-only group elected itself.
    // Targets like replica_count are NOT witnesses: they legitimately exceed
    // placed membership on single-node and degraded clusters, and using them
    // rejected (and, through the query envelope, silently dropped) every
    // user-table write on a default-config single-node cluster.
    t.equal(
      resolvePartitionWriteCommitMode({
        replicaIds: ['r5'],
        raftState: 'leader',
        raftLeaderState: 'leader',
        hasKnownRemoteLeader: true,
      }),
      PARTITION_WRITE_COMMIT_MODE.REJECTED,
      'self-only list with a known remote leader must reject',
    );
    t.equal(
      resolvePartitionWriteCommitMode({
        replicaIds: ['r1'],
        raftState: 'leader',
        raftLeaderState: 'leader',
        hasKnownRemoteLeader: false,
      }),
      PARTITION_WRITE_COMMIT_MODE.RAFT,
      'genuine single-replica groups propose through their own leader',
    );
    t.equal(
      resolvePartitionWriteCommitMode({
        replicaIds: ['r1'],
        raftState: 'leader',
        raftLeaderState: 'leader',
        expectedReplicaCount: 3,
      }),
      PARTITION_WRITE_COMMIT_MODE.RAFT,
      'replica_count-style targets must NOT reject - 1-of-N placement is legitimate',
    );
  });

test('partition write kernel separates commit/apply from replayable side effects',
  async (t) => {
    const sideEffectPlan = buildPartitionWriteSideEffectPlan(
      {
        type: 'UPDATE',
        sql: 'UPDATE test_table SET value = ? WHERE id = ?',
        params: ['b', 'r1'],
      },
      {
        success: true,
        changes: 1,
      },
    );
    const failurePlan = buildPartitionWriteSideEffectPlan(
      {
        type: 'UPDATE',
        sql: 'UPDATE test_table SET value = ? WHERE id = ?',
        params: ['b', 'r1'],
      },
      buildPartitionWriteFailureResult(
        new Error('write failed'),
        TEST_PARTITION_ID,
      ),
    );

    t.same(
      sideEffectPlan,
      {
        emitCdcEntry: {
          type: 'UPDATE',
          sql: 'UPDATE test_table SET value = ? WHERE id = ?',
          params: ['b', 'r1'],
          changes: 1,
        },
        splitReplicationEntry: {
          type: 'UPDATE',
          sql: 'UPDATE test_table SET value = ? WHERE id = ?',
          params: ['b', 'r1'],
          changes: 1,
        },
        scheduleSizeUpdate: true,
        requestManagedSplitEvaluation: true,
      },
      'successful apply should return one explicit side-effect plan',
    );
    t.same(
      failurePlan,
      {
        emitCdcEntry: null,
        splitReplicationEntry: null,
        scheduleSizeUpdate: false,
        requestManagedSplitEvaluation: false,
      },
      'failed apply should not plan replayable side effects',
    );
  });

// F-ae / F-z: every write this replica did not take is answered with a typed
// code and a text that names its state, and every such text is one the
// routers route again (they classify by the fragments the errors owner
// lists, not by a text of their own).
test('partition write kernel names the state of every write it did not ' +
  'take, in a text the routers route again', async (t) => {
  const {
    PARTITION_WRITE_LEADERSHIP_REFUSAL: REFUSAL,
    buildPartitionWriteLeadershipRefusal,
    buildReleasedPendingWriteAnswer,
  } = partitionWriteKernel;
  const {ERRORS, REROUTABLE_WRITE_ERROR_FRAGMENTS} = errorConstants;
  const {PROPOSAL_QUEUE_PROPOSAL_STATE} = proposalQueueConstants;
  // Inputs: the port's own recovery outcomes (its outcome vocabulary).
  const recovering = (reason, retryAfterMs) => ({
    outcome: RAFT_OPERATION_OUTCOME.HOST_FAILURE,
    recoveryRequired: true,
    reason,
    phase: 'application',
    retryAfterMs,
  });
  const recovery = buildPartitionWriteLeadershipRefusal(
    recovering('recovery-deferred', 250), TEST_PARTITION_ID);
  t.ok(String(recovery.error).startsWith(
    ERRORS.CONSENSUS_RECOVERY_IN_PROGRESS) &&
    String(recovery.error).includes('250'),
  'a recovery refusal names the recovery and its retry time, not a missing ' +
    `leader (${recovery.error})`);
  const answers = {
    recovery,
    session: buildPartitionWriteLeadershipRefusal(recovering(
      RAFT_RS_PERSISTENCE_ADMISSION.USER_TRANSACTION_OPEN, 10),
    TEST_PARTITION_ID),
    notLeader: buildPartitionWriteLeadershipRefusal(
      {outcome: RAFT_OPERATION_OUTCOME.CORE_OK, role: 'follower'},
      TEST_PARTITION_ID),
    proposed: buildReleasedPendingWriteAnswer({entryId: TEST_ENTRY_ID,
      proposal: PROPOSAL_QUEUE_PROPOSAL_STATE.PROPOSED,
      logIndex: TEST_LOG_INDEX}, TEST_PARTITION_ID, {cause:
      partitionWriteKernel.PARTITION_WRITE_RELEASE_CAUSE?.LEADERSHIP_LOST}),
    queued: buildReleasedPendingWriteAnswer({entryId: TEST_ENTRY_ID,
      proposal: PROPOSAL_QUEUE_PROPOSAL_STATE.QUEUED, logIndex: null},
    TEST_PARTITION_ID, {cause:
      partitionWriteKernel.PARTITION_WRITE_RELEASE_CAUSE?.LEADERSHIP_LOST}),
  };
  t.same(Object.fromEntries(Object.entries(answers).map(([name, answer]) =>
    [name, answer.failureCode])), {
    recovery: REFUSAL.CONSENSUS_RECOVERY_REQUIRED,
    session: REFUSAL.CONSENSUS_SESSION_OPEN,
    notLeader: REFUSAL.NOT_LEADER,
    proposed: REFUSAL.OUTCOME_UNKNOWN,
    queued: REFUSAL.NOT_LEADER,
  }, 'each state has its own typed code');
  t.same({entryId: answers.proposed.entryId,
    logIndex: answers.proposed.logIndex}, {entryId: TEST_ENTRY_ID,
    logIndex: TEST_LOG_INDEX}, 'a released proposed write names its entry ' +
    'and its index when known');
  t.equal(Object.hasOwn(answers.queued, 'logIndex'), false,
    'an index that is not known is not reported');
  for (const [name, answer] of Object.entries(answers)) {
    t.ok(REROUTABLE_WRITE_ERROR_FRAGMENTS.some((fragment) =>
      answer.error.includes(fragment)), `${name}: routed again by the ` +
      `routers (${answer.error})`);
  }
});

// F-ak: the release at a commit deadline or at shutdown, a proposal queue at
// capacity and a proposal the port refused or failed on are answered by the
// kernel's two builders, typed with their entry; and every answer's code and
// text agree on whether a router may route it again (a router holding the
// answer branches on the code, one holding only the text on the fragments).
test('partition write kernel types every release and proposal refusal, and ' +
  'its routable codes and texts agree', async (t) => {
  const {
    PARTITION_WRITE_LEADERSHIP_REFUSAL: REFUSAL,
    PARTITION_WRITE_RELEASE_CAUSE: CAUSE,
    buildPartitionWriteLeadershipRefusal,
    buildPartitionWriteProposalRefusal,
    buildReleasedPendingWriteAnswer,
    isReroutableWriteFailureCode,
  } = partitionWriteKernel;
  const {isReroutableWriteError} = errorConstants;
  const {PROPOSAL_QUEUE_PROPOSAL_STATE: STATE} = proposalQueueConstants;
  const released = (proposal, release) => buildReleasedPendingWriteAnswer(
    {entryId: TEST_ENTRY_ID, proposal, logIndex: null}, TEST_PARTITION_ID,
    release);
  // Inputs: the refusals as their owners raise them - the proposal queue at
  // capacity, and the port's outcomes as the write path asserts them.
  const queue = new ProposalQueue({maxCapacity: 1});
  queue.enqueue('entry-holding-the-slot', {});
  let backpressure = null;
  try {
    queue.enqueue(TEST_ENTRY_ID, {});
  } catch (error) {
    backpressure = error;
  }
  const portRefusal = (outcome) => {
    try {
      assertRaftOperationSucceeded({outcome, reason: `${outcome}-reason`,
        phase: 'propose', retryable: false, recoveryRequired: false});
    } catch (error) {
      return error;
    }
    return null;
  };
  const refused = (refusal) => buildPartitionWriteProposalRefusal(refusal,
    null, {partitionId: TEST_PARTITION_ID, entryId: TEST_ENTRY_ID});
  const deadline = {cause: CAUSE?.COMMIT_DEADLINE_EXCEEDED,
    deadlineMs: 30000};
  const answers = {
    deadlineProposed: released(STATE.PROPOSED, deadline),
    deadlineQueued: released(STATE.QUEUED, deadline),
    shutdownProposed: released(STATE.PROPOSED, {cause: CAUSE?.SHUTDOWN}),
    shutdownQueued: released(STATE.QUEUED, {cause: CAUSE?.SHUTDOWN}),
    backpressure: refused(backpressure),
    coreRefused: refused(portRefusal(RAFT_OPERATION_OUTCOME.CORE_REFUSED)),
    coreFatal: refused(portRefusal(RAFT_OPERATION_OUTCOME.CORE_FATAL)),
    hostFailure: refused(portRefusal(RAFT_OPERATION_OUTCOME.HOST_FAILURE)),
  };
  t.same(Object.fromEntries(Object.entries(answers).map(([name, answer]) =>
    [name, answer.failureCode])), {
    deadlineProposed: REFUSAL.OUTCOME_UNKNOWN,
    deadlineQueued: REFUSAL.COMMIT_DEADLINE_EXCEEDED,
    shutdownProposed: REFUSAL.OUTCOME_UNKNOWN,
    shutdownQueued: REFUSAL.SERVICE_SHUTDOWN,
    backpressure: REFUSAL.BACKPRESSURE,
    coreRefused: REFUSAL.CONSENSUS_REFUSED,
    coreFatal: REFUSAL.OUTCOME_UNKNOWN,
    hostFailure: REFUSAL.CONSENSUS_HOST_FAILURE,
  }, 'each release and refusal has its own typed code');
  for (const [name, answer] of Object.entries(answers)) {
    t.equal(answer.entryId, TEST_ENTRY_ID, `${name}: it names its entry`);
    t.equal(typeof answer.failureCode, 'string', `${name}: it is typed`);
  }
  t.same(answers.deadlineProposed.consensus, {reason:
    CAUSE?.COMMIT_DEADLINE_EXCEEDED, deadlineMs: 30000},
  'a deadline release names its cause and the deadline');
  t.equal(answers.backpressure.retryAfterMs, backpressure?.retryAfterMs,
    'backpressure carries the queue\'s own retry time');
  t.same(answers.coreRefused.consensus, {reason: 'CORE_REFUSED-reason',
    phase: 'propose', retryable: false},
  'a core refusal carries the port\'s reason and retryability');
  const all = {
    ...answers,
    notLeader: buildPartitionWriteLeadershipRefusal(
      {outcome: RAFT_OPERATION_OUTCOME.CORE_OK, role: 'follower'},
      TEST_PARTITION_ID),
    recovery: buildPartitionWriteLeadershipRefusal({
      outcome: RAFT_OPERATION_OUTCOME.HOST_FAILURE, recoveryRequired: true,
      reason: 'recovery-deferred', phase: 'application', retryAfterMs: 5},
    TEST_PARTITION_ID),
  };
  for (const [name, answer] of Object.entries(all)) {
    t.equal(isReroutableWriteFailureCode?.(answer.failureCode),
      isReroutableWriteError(answer.error), `${name}: its code and its ` +
      `text agree on routing it again (${answer.failureCode}: ` +
      `${answer.error})`);
  }
  t.equal(isReroutableWriteFailureCode?.(REFUSAL.CONSENSUS_HOST_FAILURE),
    false, 'a host failure while proposing is not routed again by code');
});
