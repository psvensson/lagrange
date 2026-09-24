import fs from 'node:fs';

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
import {settleFailedCommittedStatement} from
  '../../src/partition/partition-committed-statement-outcome.js';
import {PARTITION_COMMITTED_COMMAND_ERROR_CODE} from
  '../../src/partition/partition-service-constants.js';
import * as proposalQueueConstants from
  '../../src/partition/proposal-queue-constants.js';
import {ProposalQueue} from '../../src/partition/proposal-queue.js';
import {assertRaftOperationSucceeded} from
  '../../src/raft/raft-operation-port.js';
import {RAFT_OPERATION_OUTCOME} from
  '../../src/raft/raft-operation-port-constants.js';
import {RAFT_RS_PERSISTENCE_ADMISSION} from
  '../../src/raft/raft-rs-durable-store-constants.js';
import {encodeProposal} from '../../src/raft/raft-rs-proposal-codec.js';

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
// code and a text that names its state. The routers route it again by its
// code alone (quest reroute-carries-the-entry-id: the answer crosses the wire
// whole, and no router classifies a partition answer by its text) - a write
// whose outcome is not known here only under its own entryId, since a
// re-proposal under a fresh one may apply it twice; its text names a
// retryable answer, never a failed write.
test('partition write kernel names the state of every write it did not ' +
  'take, in a code the routers route again by and a text naming it retryable',
async (t) => {
  const {
    PARTITION_WRITE_LEADERSHIP_REFUSAL: REFUSAL,
    buildPartitionWriteLeadershipRefusal,
    buildReleasedPendingWriteAnswer,
  } = partitionWriteKernel;
  const {ERRORS, isRetryableWriteError} = errorConstants;
  const {isReroutableWriteFailureCode} = partitionWriteKernel;
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
    const unknown = answer.failureCode === REFUSAL.OUTCOME_UNKNOWN;
    t.equal(isReroutableWriteFailureCode(answer.failureCode), !unknown,
      `${name}: ${unknown ? 'never routed again without its entryId' :
        'routed again by its code'} (${answer.failureCode})`);
    t.equal(isReroutableWriteFailureCode(answer.failureCode,
      {carriesEntryId: true}), true, `${name}: routed again under its ` +
      'entryId');
    t.equal(isRetryableWriteError?.(answer.error), true, `${name}: its ` +
      'text names a write that did not fail for good');
  }
});

// One answer's code and text agree on the control plane retrying it; a
// caller carrying the entryId routes again (by the code) every write that did
// not fail for good; a caller without it, every one but an unknown outcome.
function assertRetryAgreement(t, name, answer, owners) {
  const {failureCode: code, error: text} = answer;
  const retryableByCode = owners.isRetryableWriteFailureCode?.(code);
  const retryableByText = owners.isRetryableWriteError?.(text);
  t.equal(retryableByCode, retryableByText, `${name}: its code and its ` +
    `text agree on the control plane retrying it (${code}: ${text})`);
  t.equal(owners.isReroutableWriteFailureCode?.(code, {carriesEntryId: true}),
    retryableByCode, `${name}: a caller carrying its entryId routes again ` +
    'every write that did not fail for good');
  t.equal(owners.isReroutableWriteFailureCode?.(code),
    owners.unknown ? false : retryableByCode, `${name}: ${owners.unknown ?
      'an unknown outcome is never routed again without its entryId' :
      'a caller without its entryId routes it again as it retries it'}`);
}

// The two codes the kernel's predicates single out: an unknown outcome,
// routed again only under its entryId; a host failure, never.
function assertCodeRouting(t, REFUSAL, owners) {
  t.equal(owners.isReroutableWriteFailureCode?.(REFUSAL.OUTCOME_UNKNOWN),
    false, 'an unknown outcome is not routed again by a caller without its ' +
    'entryId');
  t.equal(owners.isReroutableWriteFailureCode?.(REFUSAL.OUTCOME_UNKNOWN,
    {carriesEntryId: true}), true, 'a caller that re-proposes it under its ' +
    'entryId routes it again');
  t.equal(owners.isReroutableWriteFailureCode?.(
    REFUSAL.CONSENSUS_HOST_FAILURE), false, 'a host failure while proposing ' +
    'is not routed again by code');
  t.equal(owners.isRetryableWriteFailureCode?.(REFUSAL.CONSENSUS_HOST_FAILURE),
    false, 'nor retried by the control plane');
}

// F-ak: the release at a commit deadline or at shutdown, a proposal queue at
// capacity and a proposal the port refused or failed on are answered by the
// kernel's two builders, typed with their entry; every answer's code and
// text agree on whether the control plane retries it, and a router routes it
// again by its code alone. The stated exception (F-aj after verification
// round 6): an unknown outcome is routed again only by a caller that
// re-proposes the write under its own entryId.
test('partition write kernel types every release and proposal refusal, ' +
  'routed again by its code but for the unknown outcome without its entryId',
async (t) => {
  const {
    PARTITION_WRITE_LEADERSHIP_REFUSAL: REFUSAL,
    PARTITION_WRITE_RELEASE_CAUSE: CAUSE,
    buildPartitionWriteLeadershipRefusal,
    buildPartitionWriteProposalRefusal,
    buildReleasedPendingWriteAnswer,
    isReroutableWriteFailureCode,
    isRetryableWriteFailureCode,
  } = partitionWriteKernel;
  const {isRetryableWriteError} = errorConstants;
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
    assertRetryAgreement(t, name, answer, {
      isReroutableWriteFailureCode,
      isRetryableWriteFailureCode, isRetryableWriteError,
      unknown: answer.failureCode === REFUSAL.OUTCOME_UNKNOWN,
    });
  }
  assertCodeRouting(t, REFUSAL, {isReroutableWriteFailureCode,
    isRetryableWriteFailureCode});
});

// F2 (quest reroute-carries-the-entry-id, verification round 1): the
// environmental failure of a committed write's own application, as the
// committed-statement outcome owner raises it and the kernel answers it, is a
// write that did not fail for good by its code AND by its text (the errors
// owner lists its text with the other retryable answers), and it is routed
// again only under its own entryId, like an unknown outcome.
test('F2: the environmental application failure agrees by code and text ' +
  'that it did not fail for good', async (t) => {
  const {
    PARTITION_WRITE_LEADERSHIP_REFUSAL: REFUSAL,
    buildPartitionWriteFailureResult: answerOf,
    isReroutableWriteFailureCode,
    isRetryableWriteFailureCode,
  } = partitionWriteKernel;
  const {isRetryableWriteError} = errorConstants;
  // Input: what SQLite raises when the host's disk is full (its own code).
  const hostError = Object.assign(new Error('database or disk is full'),
    {code: 'SQLITE_FULL'});
  let raised = null;
  try {
    settleFailedCommittedStatement({db: {open: true}}, {error: hostError,
      command: {entryId: TEST_ENTRY_ID}, afterCommit: () => {},
      afterRollback: () => {}});
  } catch (error) {
    raised = error;
  }
  const answer = answerOf(raised, TEST_PARTITION_ID);
  t.equal(typeof answer.failureCode, 'string',
    `the kernel types the environmental failure (${JSON.stringify(answer)})`);
  t.equal(isRetryableWriteFailureCode(answer.failureCode), true,
    'by its code it did not fail for good');
  assertRetryAgreement(t, 'environmentFailed', answer, {
    isReroutableWriteFailureCode, isRetryableWriteFailureCode,
    isRetryableWriteError, unknown: true});
  t.not(answer.failureCode, REFUSAL.OUTCOME_UNKNOWN,
    'it is its own state, not an unknown outcome');
});

// F12: the typed fields of a write answer are the kernel's exported
// contract; the sealed end-to-end witness names its eight fields as literals
// (it is sealed and stays unchanged), so they are compared here with the
// kernel's list: every sealed name is in it, and the only fields the kernel
// carries beyond them are the replay's affected-row state (F3, recorded) and
// how the replayed row binds the statement asking (F16, recorded).
test('F12: the sealed witness\'s write-answer fields are the kernel\'s ' +
  'exported contract', async (t) => {
  const sealedWitness = fs.readFileSync(new URL(
    '../query/write-identity-end-to-end.test.js', import.meta.url), 'utf8');
  const literal = sealedWitness.match(
    /WRITE_ANSWER_WIRE_FIELDS = Object\.freeze\(\[([^\]]*)\]\)/u)?.[1] ?? '';
  const sealedFields = [...literal.matchAll(/'([A-Za-z]+)'/gu)]
    .map((match) => match[1]);
  const kernelFields = partitionWriteKernel.PARTITION_WRITE_ANSWER_FIELDS;
  t.equal(sealedFields.length, 8, 'setup: the sealed witness names eight');
  t.ok(Array.isArray(kernelFields), 'the kernel exports its field list');
  t.same(sealedFields.filter((field) => !kernelFields?.includes(field)), [],
    'every field the sealed witness names is in the kernel\'s contract');
  t.same((kernelFields ?? []).filter((field) =>
    !sealedFields.includes(field)), ['changesKnown', 'statementBinding'],
  'the kernel carries beyond them only the replay\'s affected-row state ' +
    'and its statement binding');
});

// Verification round 3, F22 and F19: a key reused for another statement,
// and a statement the proposal codec cannot encode, are answers the
// partition refused for good - no attempt under the same key and statement
// can succeed - so they are the kernel's own codes, never retried and never
// routed again, with or without the write's entryId; the kernel's failure
// builder keeps them as the answer's failureCode.
test('F22/F19: the statement mismatch and an unencodable statement are ' +
  'kernel codes that failed for good', async (t) => {
  const {
    buildPartitionWriteFailureResult: answerOf,
    isPartitionWriteFailureCode,
    isReroutableWriteFailureCode,
    isRetryableWriteFailureCode,
  } = partitionWriteKernel;
  // Inputs: each refusal as its owner raises it.
  const mismatch = Object.assign(new Error('refused'), {code:
    PARTITION_COMMITTED_COMMAND_ERROR_CODE.ENTRY_ID_STATEMENT_MISMATCH});
  let unencodable = null;
  try {
    encodeProposal([TEST_ENTRY_ID, [BigInt(1)]]);
  } catch (error) {
    unencodable = error;
  }
  for (const [name, raised] of Object.entries({mismatch, unencodable})) {
    const answer = answerOf(raised, TEST_PARTITION_ID);
    t.equal(answer.failureCode, raised?.code,
      `${name}: the kernel keeps its code (${JSON.stringify(answer)})`);
    t.equal(isPartitionWriteFailureCode(raised?.code), true,
      `${name}: it is a partition write code`);
    t.equal(isRetryableWriteFailureCode(raised?.code), false,
      `${name}: it failed for good`);
    t.equal(isReroutableWriteFailureCode(raised?.code,
      {carriesEntryId: true}), false,
    `${name}: it is never routed again, even under its entryId`);
  }
});
