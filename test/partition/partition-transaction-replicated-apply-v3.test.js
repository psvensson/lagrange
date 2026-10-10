/**
 * TX1 (quest replicated-transaction-decision-and-apply, PR100 Leg A) red
 * witnesses, amended for design revision 4
 * (solve/quests/replicated-transaction-decision-and-apply/design-leg-a-v4-2026-10-10.md,
 * section 10). This is the live witness file; the revision-2 file
 * partition-transaction-replicated-apply.test.js stays as superseded history.
 * The real-log replay-cursor witnesses are in the sibling
 * partition-transaction-replay-cursor-v4.test.js; the shared fixture is
 * test/test-helpers/participant-transaction-fixture.js.
 *
 * Every participant witness drives the revision-4 protocol: a coordinator
 * transactionId with participantId, commitMode and transactionEpoch on every
 * request; PREPARE as a committed PARTICIPANT_PREPARE acknowledged only after
 * it applies; the decision as a committed PARTICIPANT_DECISION bound to the
 * prepared digest. Consensus is driven by the test while a request is pending.
 * The revision-1 mechanism proposes neither command, so it greens none.
 *
 * Each witness measures every fact before asserting any (one deepEqual). On
 * the sealed head every witness is red: the participant answers the old way
 * (LOCAL_STAGING, a session held open on the shared connection, NOT_COMMITTED
 * from absence, writes proposed while a transaction is prepared), or a
 * committed revision-4 command fails closed as an unrecognised command type (a
 * new-surface red). The seam falsifiers (S1-S8, W10a, W10c) measure the query
 * lane's coordinator and engine and are recorded, not repaired, here. Positive
 * controls run in their own tests and are green on the sealed head. The
 * controllable port proves scheduling and the application transaction, not
 * durable Ready/log persistence; real three-replica witnesses (PR100 A1-A5)
 * are bound into receipts 2-4 by the evidence producer.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {afterEach, beforeEach, test} from 'node:test';
import Database from 'better-sqlite3';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {RAFT_OPERATION_OUTCOME} from '../../src/raft/raft-operation-port-constants.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {
  PARTITION_SERVICE_DEFAULT,
  PARTITION_SERVICE_OPERATION,
} from '../../src/partition/partition-service-constants.js';
import {PARTITION_WRITE_LEADERSHIP_REFUSAL} from
  '../../src/partition/partition-write-kernel.js';
import {COMMIT_MODE, PARTICIPANT_COMMIT_OUTCOME} from '../../src/constants/transactions.js';
import {PARTICIPANT_SET_STATE, TRANSACTION_MODE} from '../../src/constants/index.js';
import {QUERY_ERROR_CODE, QUERY_ERROR_MSG} from '../../src/query/query-constants.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {
  DistributedTransactionCoordinator,
  TRANSACTION_STATUS,
} from '../../src/query/distributed/distributed-transaction-coordinator.js';
import {resolveParticipantCommitMiss} from
  '../../src/query/distributed/distributed-transaction-protocol.js';
import {
  EPOCH, INSERT_SQL, OTHER_ROW, REPLICAS, ROW, ROW_2, TABLE, V3,
  applyCommitted, awaitProposal, beginMessage, commitMessage,
  commitOrdinaryWrite, decisionCommandOf, durableAppliedIndex, generationOf,
  hasEntryId, identityOf, isDecisionCommand, isOrdinaryWrite, isPrepareCommand,
  operationOf, ordinaryWriteOf, outcomeOf, pick, plantAppliedStateFailure,
  plantStorageFault, prepareCommandOf, prepareMessage, queryMessage,
  removeAppliedStateFailure, removeStorageFault, rowCount, send, settleTicks,
  sha256, shutdownAll, stagedLeaderTransaction, startLeader, startReplica,
  statementState, temporaryDbPath, track, transactionOperationOutcomes, txMessage,
  validationTextOf,
} from '../test-helpers/participant-transaction-fixture.js';

const UNKNOWN_ANSWER = Object.freeze({success: false,
  outcome: PARTICIPANT_COMMIT_OUTCOME.UNKNOWN,
  failureCode: PARTITION_WRITE_LEADERSHIP_REFUSAL.OUTCOME_UNKNOWN});
const UNKNOWN_FIELDS = ['success', 'outcome', 'failureCode'];
const COMMITTED = Object.freeze({outcome: PARTICIPANT_COMMIT_OUTCOME.COMMITTED,
  state: V3.STATE.COMMITTED});
const PREPARED = Object.freeze({outcome: PARTICIPANT_COMMIT_OUTCOME.UNKNOWN,
  state: V3.STATE.PREPARED});
const CONFLICT_REFUSAL = Object.freeze({success: false,
  refusalCause: V3.REFUSAL_CAUSE.CONFLICT});

beforeEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: 'test-node'}});
  LoggingService.getInstance().initialize({level: 'error'});
});
afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

// --- W1: the protocol on the leader and on a follower ---

test('TX1 v3 W1a: PREPARE is acknowledged only after its committed PARTICIPANT_PREPARE ' +
  'applies, and the bound COMMIT carries no operations', async () => {
  const tx = identityOf('a1');
  const {leader, proposed, begun, staged} = await stagedLeaderTransaction(tx, [ROW]);
  try {
    const prepare = track(send(leader, prepareMessage(tx)));
    const prepareCommand = await awaitProposal(proposed, isPrepareCommand);
    const facts = {begun: begun?.success === true, staged: staged[0]?.success === true,
      prepareProposed: prepareCommand !== null, prepareSettledBeforeApply: prepare.settled,
      rowsVisibleWhilePreparing: rowCount(leader), prepareApply: null, prepareAnswer: null,
      rowsVisibleWhilePrepared: null, decisionCarriesOperations: null,
      commitSettledBeforeApply: null, decisionApply: null, commitAnswer: null,
      rowsAfterDecision: null};
    if (prepareCommand) {
      facts.prepareApply = applyCommitted(leader, prepareCommand);
      const answer = await prepare.promise;
      facts.prepareAnswer = {...pick(answer, ['success', 'state']),
        digestMatches: answer?.preparedDigest === prepareCommand.preparedDigest,
        prepareIndexMatches: answer?.prepareIndex === leader.controllablePort.committedIndex,
        prepareTerm: answer?.prepareTerm ?? null};
      facts.rowsVisibleWhilePrepared = rowCount(leader);
      const commit = track(send(leader, commitMessage(tx, answer?.preparedDigest)));
      const decision = await awaitProposal(proposed, isDecisionCommand);
      facts.decisionCarriesOperations = decision ?
        Object.hasOwn(decision, 'operations') || Object.hasOwn(decision, 'operationsText') :
        null;
      facts.commitSettledBeforeApply = commit.settled;
      if (decision) {
        facts.decisionApply = applyCommitted(leader, decision);
        facts.commitAnswer = pick(await commit.promise, ['success', 'state', 'outcome']);
        facts.rowsAfterDecision = rowCount(leader);
      }
    }
    assert.deepEqual(facts, {begun: true, staged: true, prepareProposed: true,
      prepareSettledBeforeApply: false, rowsVisibleWhilePreparing: 0, prepareApply: null,
      prepareAnswer: {success: true, state: V3.STATE.PREPARED, digestMatches: true,
        prepareIndexMatches: true, prepareTerm: 1},
      rowsVisibleWhilePrepared: 0, decisionCarriesOperations: false,
      commitSettledBeforeApply: false, decisionApply: null,
      commitAnswer: {success: true, ...COMMITTED}, rowsAfterDecision: 1},
    'PREPARE and COMMIT are committed commands, each acknowledged after it applies');
  } finally {
    await shutdownAll(leader);
  }
});

test('TX1 v3 W1b: a replica that staged nothing reaches PREPARED, then COMMITTED with the ' +
  'operations and the applied index, from the two committed commands', async () => {
  const tx = identityOf('a2');
  const follower = await startReplica(REPLICAS[1]);
  try {
    const prepareCommand = prepareCommandOf(tx, [operationOf(ROW)], generationOf(follower));
    const appliedBefore = durableAppliedIndex(follower);
    const facts = {prepareApply: applyCommitted(follower, prepareCommand)};
    facts.afterPrepare = await outcomeOf(follower, tx);
    facts.rowsAfterPrepare = rowCount(follower);
    facts.decisionApply = applyCommitted(follower,
      decisionCommandOf(tx, V3.DECISION.COMMIT, prepareCommand.preparedDigest));
    facts.afterDecision = await outcomeOf(follower, tx);
    facts.rowsAfterDecision = rowCount(follower);
    facts.appliedAdvance = durableAppliedIndex(follower) - appliedBefore;
    assert.deepEqual(facts, {prepareApply: null, afterPrepare: PREPARED, rowsAfterPrepare: 0,
      decisionApply: null, afterDecision: COMMITTED, rowsAfterDecision: 1, appliedAdvance: 2},
    'the committed commands are the transaction on every replica');
  } finally {
    await shutdownAll(follower);
  }
});

// --- W2: atomicity of the decision's application transaction ---

test('TX1 v3 W2a: a planted failure after the operations inside the decision\'s application ' +
  'transaction leaves no row, no outcome, no state change and the applied index unchanged',
async () => {
  const tx = identityOf('a3');
  const follower = await startReplica(REPLICAS[1]);
  try {
    const prepareCommand = prepareCommandOf(tx, [operationOf(ROW)], generationOf(follower));
    const facts = {prepareApply: applyCommitted(follower, prepareCommand)};
    const appliedBefore = durableAppliedIndex(follower);
    plantAppliedStateFailure(follower.db);
    facts.decisionApply = applyCommitted(follower,
      decisionCommandOf(tx, V3.DECISION.COMMIT, prepareCommand.preparedDigest));
    removeAppliedStateFailure(follower.db);
    facts.rows = rowCount(follower);
    facts.operationOutcomes = transactionOperationOutcomes(follower);
    facts.afterFailure = await outcomeOf(follower, tx);
    facts.appliedAdvance = durableAppliedIndex(follower) - appliedBefore;
    assert.deepEqual(facts, {prepareApply: null, decisionApply: 'SQLITE_CONSTRAINT_TRIGGER',
      rows: 0, operationOutcomes: 0, afterFailure: PREPARED, appliedAdvance: 0},
    'operations, outcomes, the state transition and the applied index are one transaction');
  } finally {
    await shutdownAll(follower);
  }
});

test('TX1 v3 W2b: the operations, the per-operation outcomes and the COMMITTED state are all ' +
  'written before the applied-state write of the same transaction', async () => {
  const tx = identityOf('a4');
  const follower = await startReplica(REPLICAS[1]);
  try {
    const prepareCommand = prepareCommandOf(tx, [operationOf(ROW)], generationOf(follower));
    const facts = {prepareApply: applyCommitted(follower, prepareCommand)};
    follower.db.exec('CREATE TABLE tx1_v3_probe (rows_seen INTEGER, state TEXT, txop INTEGER)');
    for (const event of ['INSERT', 'UPDATE']) {
      follower.db.exec(`CREATE TRIGGER tx1_v3_probe_${event.toLowerCase()} AFTER ${event} ON ` +
        '_raft_rs_applied_state BEGIN INSERT INTO tx1_v3_probe (rows_seen, state, txop) ' +
        'SELECT (SELECT COUNT(*) FROM test_table WHERE id = \'row-1\'), ' +
        '(SELECT state FROM _participant_transactions WHERE transaction_id = \'a4\'), ' +
        '(SELECT COUNT(*) FROM _partition_statement_outcomes WHERE entry_key LIKE ' +
        '\'txop:%\'); END');
    }
    facts.decisionApply = applyCommitted(follower,
      decisionCommandOf(tx, V3.DECISION.COMMIT, prepareCommand.preparedDigest));
    facts.seenAtAppliedStateWrite = follower.db.prepare('SELECT * FROM tx1_v3_probe').all()
      .map((row) => ({rows: row.rows_seen, state: row.state, txop: row.txop}));
    assert.deepEqual(facts, {prepareApply: null, decisionApply: null,
      seenAtAppliedStateWrite: [{rows: 1, state: V3.STATE.COMMITTED, txop: 1}]},
    'a post-commit effect writing the rows, the outcomes or the state cannot satisfy this');
  } finally {
    await shutdownAll(follower);
  }
});

// --- W3: identical refusals on every replica; host failure on one ---

async function refusalOnTwoReplicas(tx, operations, setup) {
  const replicas = [await startReplica(REPLICAS[1]), await startReplica(REPLICAS[2])];
  try {
    const perReplica = [];
    for (const replica of replicas) {
      const setupApply = setup ? applyCommitted(replica, setup) : null;
      const prepareCommand = prepareCommandOf(tx, operations, generationOf(replica));
      const appliedBefore = durableAppliedIndex(replica);
      const prepareApply = applyCommitted(replica, prepareCommand);
      const afterPrepare = await outcomeOf(replica, tx, ['refusalCause']);
      const decisionApply = applyCommitted(replica,
        decisionCommandOf(tx, V3.DECISION.COMMIT, prepareCommand.preparedDigest));
      perReplica.push({setupApply, prepareApply, afterPrepare, decisionApply,
        afterDecision: await outcomeOf(replica, tx), rows: rowCount(replica),
        appliedAdvance: durableAppliedIndex(replica) - appliedBefore});
    }
    return perReplica;
  } finally {
    await shutdownAll(...replicas);
  }
}
function refusedEverywhere(cause) {
  const refused = {setupApply: null, prepareApply: null,
    afterPrepare: {outcome: PARTICIPANT_COMMIT_OUTCOME.NOT_COMMITTED, state: V3.STATE.REFUSED,
      refusalCause: cause},
    decisionApply: null,
    afterDecision: {outcome: PARTICIPANT_COMMIT_OUTCOME.NOT_COMMITTED, state: V3.STATE.REFUSED},
    rows: 0, appliedAdvance: 2};
  return [refused, refused];
}

test('TX1 v3 W3a: a PREPARE whose operation fails deterministically is REFUSED identically on ' +
  'every replica, applies nothing, and a later COMMIT cannot apply it', async () => {
  const perReplica = await refusalOnTwoReplicas(identityOf('a5'),
    [operationOf(ROW), operationOf(ROW_2, {entryId: 'op-dup'})],
    ordinaryWriteOf('w3a-setup', ROW_2));
  assert.deepEqual(perReplica, refusedEverywhere(V3.REFUSAL_CAUSE.STATEMENT_FAILED),
    'every replica refuses the same PREPARE the same way and never applies it');
});

test('TX1 v3 W3c: a committed PREPARE carrying a nondeterministic operation is REFUSED ' +
  '`nondeterministic` identically on every replica before any dry run', async () => {
  const perReplica = await refusalOnTwoReplicas(identityOf('a5n'), [operationOf(ROW,
    {sql: 'INSERT INTO test_table (id, value) VALUES (?, datetime(\'now\'))', params: [ROW.id]})]);
  assert.deepEqual(perReplica, refusedEverywhere(V3.REFUSAL_CAUSE.NONDETERMINISTIC),
    'the determinism classifier is a function of the committed bytes, so every replica agrees');
});

test('TX1 v3 W3b: a single-replica storage failure while the COMMIT decision applies is the ' +
  'host failure: nothing recorded, applied index unchanged, re-applied after recovery',
async () => {
  const tx = identityOf('a6');
  const healthy = await startReplica(REPLICAS[1]);
  const faulty = await startReplica(REPLICAS[2]);
  try {
    const prepareCommand = prepareCommandOf(tx, [operationOf(ROW)], generationOf(healthy));
    const decision = decisionCommandOf(tx, V3.DECISION.COMMIT, prepareCommand.preparedDigest);
    const facts = {prepareApply: [applyCommitted(healthy, prepareCommand),
      applyCommitted(faulty, prepareCommand)], healthyDecision: applyCommitted(healthy, decision)};
    const faultyAppliedBefore = durableAppliedIndex(faulty);
    plantStorageFault(faulty.db);
    facts.faultyDecision = applyCommitted(faulty, decision);
    removeStorageFault(faulty.db);
    facts.faultyAfterFailure = {...(await outcomeOf(faulty, tx)), rows: rowCount(faulty),
      appliedAdvance: durableAppliedIndex(faulty) - faultyAppliedBefore};
    facts.faultyRedelivered = applyCommitted(faulty, decision);
    facts.converged = [await outcomeOf(healthy, tx), await outcomeOf(faulty, tx)];
    facts.rows = [rowCount(healthy), rowCount(faulty)];
    assert.deepEqual(facts, {prepareApply: [null, null], healthyDecision: null,
      faultyDecision: 'partition_committed_statement_environment_failed',
      faultyAfterFailure: {...PREPARED, rows: 0, appliedAdvance: 0},
      faultyRedelivered: null, converged: [COMMITTED, COMMITTED], rows: [1, 1]},
    'a host failure records nothing and the same decision applies once the host recovers');
  } finally {
    await shutdownAll(healthy, faulty);
  }
});

// --- W4, W13-W16: the conflict rule, its BEGIN-time base and the generation ---

test('TX1 v3 W4: a committed write after the transaction\'s base refuses its PREPARE on every ' +
  'replica; once PREPARED, a reserved write cannot make the COMMIT fail', async () => {
  const conflicted = identityOf('a7');
  const reserved = identityOf('a8');
  const replicas = [await startReplica(REPLICAS[1]), await startReplica(REPLICAS[2])];
  try {
    const perReplica = [];
    for (const replica of replicas) {
      const base = generationOf(replica);
      const intervening = applyCommitted(replica, ordinaryWriteOf('w4-intervening', OTHER_ROW));
      const conflictPrepare = applyCommitted(replica,
        prepareCommandOf(conflicted, [operationOf(ROW)], base));
      const conflictOutcome = await outcomeOf(replica, conflicted, ['refusalCause']);
      const prepareCommand = prepareCommandOf(reserved, [operationOf(ROW)], generationOf(replica));
      const reservedPrepare = applyCommitted(replica, prepareCommand);
      const appliedBefore = durableAppliedIndex(replica);
      const reservedWrite = applyCommitted(replica, ordinaryWriteOf('w4-reserved', ROW_2));
      const reservedWriteFacts = {rows: rowCount(replica, ROW_2.id),
        statement: statementState(replica, 'w4-reserved'),
        appliedAdvance: durableAppliedIndex(replica) - appliedBefore};
      const decisionApply = applyCommitted(replica,
        decisionCommandOf(reserved, V3.DECISION.COMMIT, prepareCommand.preparedDigest));
      perReplica.push({intervening, conflictPrepare, conflictOutcome, reservedPrepare,
        reservedWrite, reservedWriteFacts, decisionApply,
        committed: await outcomeOf(replica, reserved), rows: rowCount(replica)});
    }
    const expected = {intervening: null, conflictPrepare: null,
      conflictOutcome: {outcome: PARTICIPANT_COMMIT_OUTCOME.NOT_COMMITTED,
        state: V3.STATE.REFUSED, refusalCause: V3.REFUSAL_CAUSE.CONFLICT},
      reservedPrepare: null, reservedWrite: null,
      reservedWriteFacts: {rows: 0, statement: 'unsettled', appliedAdvance: 1},
      decisionApply: null, committed: COMMITTED, rows: 1};
    assert.deepEqual(perReplica, [expected, expected],
      'first committer wins at PREPARE apply, and the reservation keeps COMMIT infallible');
  } finally {
    await shutdownAll(...replicas);
  }
});

test('TX1 v3 W13: an intervening write is detected even after the statement-outcome rows are ' +
  'compacted (the write generation never revisits a value)', async () => {
  const tx = identityOf('a13');
  const {leader, proposed} = await stagedLeaderTransaction(tx, [ROW]);
  try {
    const intervening = await commitOrdinaryWrite(leader, proposed, 'w13-intervening', OTHER_ROW);
    leader.db.exec('DELETE FROM _partition_statement_outcomes');
    const prepare = track(send(leader, prepareMessage(tx)));
    const prepareCommand = await awaitProposal(proposed, isPrepareCommand);
    await settleTicks();
    assert.deepEqual({intervening, prepareProposed: prepareCommand !== null,
      answer: prepare.settled ? pick(prepare.value, ['success', 'refusalCause']) : 'pending'},
    {intervening: {apply: null, answer: true}, prepareProposed: false, answer: CONFLICT_REFUSAL},
    'compaction of outcome rows cannot hide a committed write (ABA)');
  } finally {
    await shutdownAll(leader);
  }
});

test('TX1 v3 W14: the conflict base is read at BEGIN: a committed write after a session read ' +
  'and write refuses the PREPARE request with nothing proposed', async () => {
  const tx = identityOf('a14');
  const {leader, proposed} = await startLeader();
  try {
    const facts = {begun: (await send(leader, beginMessage(tx)))?.success === true};
    facts.read = (await send(leader, queryMessage(tx, 'SELECT id FROM test_table')))?.success;
    facts.staged = (await send(leader, queryMessage(tx, INSERT_SQL, [ROW.id, ROW.value])))
      ?.success;
    facts.intervening = await commitOrdinaryWrite(leader, proposed, 'w14-intervening',
      OTHER_ROW);
    const prepare = track(send(leader, prepareMessage(tx)));
    facts.prepareProposed = (await awaitProposal(proposed, isPrepareCommand)) !== null;
    await settleTicks();
    facts.answer = prepare.settled ? pick(prepare.value, ['success', 'refusalCause']) :
      'pending';
    assert.deepEqual(facts, {begun: true, read: true, staged: true,
      intervening: {apply: null, answer: true}, prepareProposed: false,
      answer: CONFLICT_REFUSAL}, 'an implementation reading the base at PREPARE fails this');
  } finally {
    await shutdownAll(leader);
  }
});

test('TX1 v3 W15: the proposed PREPARE carries the BEGIN-time base, and its apply refuses it ' +
  'after a write committed between proposal and apply', async () => {
  const tx = identityOf('a15');
  const {leader, proposed} = await startLeader();
  try {
    await send(leader, beginMessage(tx));
    const beginBase = generationOf(leader);
    await send(leader, queryMessage(tx, INSERT_SQL, [ROW.id, ROW.value]));
    const prepare = track(send(leader, prepareMessage(tx)));
    const prepareCommand = await awaitProposal(proposed, isPrepareCommand);
    const facts = {prepareProposed: prepareCommand !== null, baseIsBeginTime: null,
      intervening: null, prepareApply: null, answer: null};
    if (prepareCommand) {
      facts.baseIsBeginTime = prepareCommand.validationText === validationTextOf(beginBase);
      facts.intervening = await commitOrdinaryWrite(leader, proposed, 'w15-intervening',
        OTHER_ROW);
      facts.prepareApply = applyCommitted(leader, prepareCommand);
      facts.answer = pick(await prepare.promise, ['success', 'state', 'refusalCause']);
    }
    assert.deepEqual(facts, {prepareProposed: true, baseIsBeginTime: true,
      intervening: {apply: null, answer: true}, prepareApply: null,
      answer: {success: false, state: V3.STATE.REFUSED, refusalCause: V3.REFUSAL_CAUSE.CONFLICT}},
    'the apply is the authority over the carried BEGIN-time base');
  } finally {
    await shutdownAll(leader);
  }
});

test('TX1 v3 W16: contention is measured: under a concurrent writer every PREPARE answer is ' +
  'typed (PREPARED, or refused `conflict`), and the abort rate is reported', async (t) => {
  const rounds = 4;
  const {leader, proposed} = await startLeader();
  try {
    const answers = [];
    for (let round = 0; round < rounds; round += 1) {
      const tx = identityOf(`a16-${round}`);
      await send(leader, beginMessage(tx));
      await send(leader, queryMessage(tx, INSERT_SQL, [`c-${round}`, 'contended']));
      await commitOrdinaryWrite(leader, proposed, `w16-${round}`,
        {id: `w-${round}`, value: 'writer'});
      const prepare = track(send(leader, prepareMessage(tx)));
      const command = await awaitProposal(proposed,
        (entry) => isPrepareCommand(entry) && entry.transactionId === tx.transactionId);
      if (command) {
        applyCommitted(leader, command);
      }
      await settleTicks();
      answers.push(prepare.settled ? prepare.value : null);
      await send(leader, txMessage(PARTITION_SERVICE_OPERATION.ROLLBACK, tx));
    }
    const typed = answers.every((answer) =>
      (answer?.success === true && answer.state === V3.STATE.PREPARED) ||
      (answer?.success === false && answer.refusalCause === V3.REFUSAL_CAUSE.CONFLICT));
    const aborts = answers.filter((answer) => answer?.success === false).length;
    t.diagnostic(`TX1 W16 measured abort rate under a concurrent writer: ${aborts}/${rounds}`);
    assert.deepEqual({answersTyped: typed}, {answersTyped: true},
      'the rate is measured, not promised (design section 3.6, limit L5)');
  } finally {
    await shutdownAll(leader);
  }
});

// --- W5: c' isolation throughout ACTIVE ---

test('TX1 v3 W5a: during ACTIVE no SQLite transaction is open, no other reader sees the staged ' +
  'row, the session reads its own write and later commits, a sessionless write applies',
async () => {
  const {directory, dbPath} = temporaryDbPath();
  const tx = identityOf('a9');
  let leader = null;
  try {
    let proposed;
    ({leader, proposed} = await startLeader({dbPath}));
    const read = async (id) => (await send(leader, queryMessage(tx,
      'SELECT id FROM test_table WHERE id = ?', [id])))?.rows?.length ?? null;
    const facts = {begun: (await send(leader, beginMessage(tx)))?.success === true};
    facts.inTransactionAfterBegin = leader.db.inTransaction;
    facts.staged = (await send(leader, queryMessage(tx, INSERT_SQL, [ROW.id, ROW.value])))
      ?.success === true;
    facts.inTransactionAfterWrite = leader.db.inTransaction;
    const independent = new Database(dbPath, {readonly: true});
    try {
      facts.independentReader = independent
        .prepare('SELECT COUNT(*) AS count FROM test_table WHERE id = ?').get(ROW.id).count;
    } finally {
      independent.close();
    }
    facts.sessionlessReader = (await leader.executeQuery(
      'SELECT id FROM test_table WHERE id = ?', [ROW.id])).rows.length;
    facts.sessionReader = await read(ROW.id);
    facts.sessionless = await commitOrdinaryWrite(leader, proposed, 'w5-sessionless', OTHER_ROW);
    facts.sessionSeesLaterCommit = await read(OTHER_ROW.id);
    assert.deepEqual(facts, {begun: true, inTransactionAfterBegin: false, staged: true,
      inTransactionAfterWrite: false, independentReader: 0, sessionlessReader: 0,
      sessionReader: 1, sessionless: {apply: null, answer: true}, sessionSeesLaterCommit: 1},
    'staging never holds the connection, and reads replay over current committed state ' +
      '(a private snapshot database fails sessionSeesLaterCommit)');
  } finally {
    await shutdownAll(leader);
    fs.rmSync(directory, {recursive: true, force: true});
  }
});

test('TX1 v3 W5b: a request without a transactionId is never absorbed into an open session, ' +
  'even one named the default session', async () => {
  const tx = identityOf('a10', {sessionId: 'default'});
  const {leader, proposed} = await startLeader();
  try {
    const begun = await send(leader, beginMessage(tx));
    const sessionless = track(leader.executeQuery(INSERT_SQL, [OTHER_ROW.id, OTHER_ROW.value],
      {entryId: 'w5b-sessionless'}));
    const write = await awaitProposal(proposed, hasEntryId('w5b-sessionless'));
    const facts = {begun: begun?.success === true, proposedAsOrdinaryWrite: write !== null,
      absorbedIntoSession: sessionless.settled && sessionless.value?.inTransaction === true};
    if (write) {
      applyCommitted(leader, write);
    }
    assert.deepEqual(facts, {begun: true, proposedAsOrdinaryWrite: true,
      absorbedIntoSession: false}, 'default-session absorption is gone');
  } finally {
    await shutdownAll(leader);
  }
});

// --- W6: determinism ---

test('TX1 v3 W6: staged replies are provisional; the PREPARE carries the client\'s SQL and ' +
  'params verbatim; final results come from the committed apply', async () => {
  const tx = identityOf('a11');
  const {leader, proposed} = await startLeader();
  try {
    await send(leader, beginMessage(tx));
    const staged = await send(leader, queryMessage(tx, INSERT_SQL, [ROW.id, ROW.value]));
    const prepare = track(send(leader, prepareMessage(tx)));
    const prepareCommand = await awaitProposal(proposed, isPrepareCommand);
    const facts = {stagedProvisional: staged?.provisional === true,
      prepareProposed: prepareCommand !== null, preparedOperations: null, commitResults: null};
    if (prepareCommand) {
      facts.preparedOperations = JSON.parse(prepareCommand.operationsText)
        .map((operation) => ({sql: operation.sql, params: operation.params,
          pinsStagedResult: Object.hasOwn(operation, 'changes') ||
            Object.hasOwn(operation, 'lastInsertRowid')}));
      applyCommitted(leader, prepareCommand);
      const prepared = await prepare.promise;
      const commit = track(send(leader, commitMessage(tx, prepared?.preparedDigest)));
      const decision = await awaitProposal(proposed, isDecisionCommand);
      if (decision) {
        applyCommitted(leader, decision);
        const answer = await commit.promise;
        const appliedRowid = leader.db.prepare('SELECT rowid AS rowid FROM test_table WHERE id = ?')
          .get(ROW.id)?.rowid ?? null;
        facts.commitResults = (answer?.results ?? []).map((result) => ({
          changes: result.changes, fromApply: result.lastInsertRowid === appliedRowid}));
      }
    }
    assert.deepEqual(facts, {stagedProvisional: true, prepareProposed: true,
      preparedOperations: [{sql: INSERT_SQL, params: [ROW.id, ROW.value],
        pinsStagedResult: false}],
      commitResults: [{changes: 1, fromApply: true}]},
    'transaction operations are evaluated at apply exactly like ordinary replicated writes');
  } finally {
    await shutdownAll(leader);
  }
});

test('TX1 v3 W6n: a session write using a nondeterministic function, an implicit key or an ' +
  'unsupported parameter is refused at staging and never reaches the PREPARE', async () => {
  const tx = identityOf('a11n');
  const {leader, proposed} = await startLeader();
  try {
    await send(leader, beginMessage(tx));
    const refusals = [];
    for (const [sql, params] of [
      ['INSERT INTO test_table (id, value) VALUES (?, datetime(\'now\'))', ['n1']],
      ['INSERT INTO test_table (id, value) VALUES (?, random())', ['n2']],
      ['INSERT INTO test_table (id, value) VALUES (?, hex(randomblob(4)))', ['n3']],
      ['INSERT INTO test_table (value) VALUES (?)', ['implicit key']],
      [INSERT_SQL, ['n5', Buffer.from('blob')]],
    ]) {
      refusals.push(pick(await send(leader, queryMessage(tx, sql, params)),
        ['success', 'failureCode']));
    }
    await send(leader, queryMessage(tx, INSERT_SQL, [ROW.id, ROW.value]));
    track(send(leader, prepareMessage(tx)));
    const prepareCommand = await awaitProposal(proposed, isPrepareCommand);
    const nondeterministic = {success: false, failureCode: V3.CODE.SESSION_WRITE_NONDETERMINISTIC};
    assert.deepEqual({refusals, sealedOperations: prepareCommand ?
      JSON.parse(prepareCommand.operationsText).length : null}, {refusals: [nondeterministic,
      nondeterministic, nondeterministic, nondeterministic,
      {success: false, failureCode: V3.CODE.SESSION_WRITE_PARAM_UNSUPPORTED}],
    sealedOperations: 1}, 'the dry run and the COMMIT then compute identical results everywhere');
  } finally {
    await shutdownAll(leader);
  }
});

// --- W7: reserved writers are parked under their own deadline and released by the decision ---

test('TX1 v3 W7a: a write arriving while PREPARED is parked unproposed and re-admitted by the ' +
  'decision\'s apply; a raced reserved entry never settles its entryId', async () => {
  const tx = identityOf('a12');
  const {leader, proposed} = await startLeader();
  try {
    const prepareCommand = prepareCommandOf(tx, [operationOf(ROW)], generationOf(leader));
    const facts = {prepareApply: applyCommitted(leader, prepareCommand)};
    const parked = track(leader.executeQuery(INSERT_SQL, [OTHER_ROW.id, OTHER_ROW.value],
      {entryId: 'w7-parked'}));
    await settleTicks();
    facts.whileReserved = {proposed: proposed.filter(hasEntryId('w7-parked')).length,
      settled: parked.settled};
    const appliedBefore = durableAppliedIndex(leader);
    facts.racedApply = applyCommitted(leader, ordinaryWriteOf('w7-raced', ROW_2));
    facts.raced = {rows: rowCount(leader, ROW_2.id), statement: statementState(leader, 'w7-raced'),
      appliedAdvance: durableAppliedIndex(leader) - appliedBefore};
    facts.release = applyCommitted(leader,
      decisionCommandOf(tx, V3.DECISION.ROLLBACK, prepareCommand.preparedDigest));
    const readmitted = await awaitProposal(proposed, hasEntryId('w7-parked'));
    if (readmitted) {
      applyCommitted(leader, readmitted);
    }
    await settleTicks();
    facts.afterRelease = {proposed: proposed.filter(hasEntryId('w7-parked')).length,
      success: parked.settled ? parked.value?.success === true : 'pending',
      rows: rowCount(leader, OTHER_ROW.id)};
    facts.racedRedelivered = applyCommitted(leader, ordinaryWriteOf('w7-raced', ROW_2));
    facts.racedRows = rowCount(leader, ROW_2.id);
    assert.deepEqual(facts, {prepareApply: null, whileReserved: {proposed: 0, settled: false},
      racedApply: null, raced: {rows: 0, statement: 'unsettled', appliedAdvance: 1},
      release: null, afterRelease: {proposed: 1, success: true, rows: 1},
      racedRedelivered: null, racedRows: 1},
    'the decision\'s apply wakes the parked writer; the reserved disposition never settles');
  } finally {
    await shutdownAll(leader);
  }
});

test('TX1 v3 W7b: a parked writer still reserved at its own commit deadline is answered ' +
  'COMMIT_DEADLINE_EXCEEDED, never proposed', async () => {
  const clock = new VirtualTimeSource({startMs: 1_000_000});
  const tx = identityOf('a12d');
  const {leader, proposed} = await startLeader({timeSource: clock});
  try {
    const facts = {prepareApply: applyCommitted(leader,
      prepareCommandOf(tx, [operationOf(ROW)], generationOf(leader)))};
    const parked = track(leader.executeQuery(INSERT_SQL, [OTHER_ROW.id, OTHER_ROW.value],
      {entryId: 'w7b-parked'}));
    await settleTicks();
    clock.advance(PARTITION_SERVICE_DEFAULT.PENDING_REQUEST_TIMEOUT_MS);
    await settleTicks();
    facts.proposed = proposed.filter(hasEntryId('w7b-parked')).length;
    facts.answer = parked.settled ? pick(parked.value, ['success', 'failureCode']) : 'pending';
    assert.deepEqual(facts, {prepareApply: null, proposed: 0, answer: {success: false,
      failureCode: PARTITION_WRITE_LEADERSHIP_REFUSAL.COMMIT_DEADLINE_EXCEEDED}},
    'the parked writer\'s budget is its own request deadline');
  } finally {
    await shutdownAll(leader);
  }
});

// --- W9: terminal commands are bound to the decision and the prepared content ---

test('TX1 v3 W9: an unbound ROLLBACK and a COMMIT with a foreign digest are refused against ' +
  'PREPARED; a bound ROLLBACK after COMMITTED cannot reverse it', async () => {
  const tx = identityOf('a20');
  const {leader, proposed} = await startLeader();
  try {
    const prepareCommand = prepareCommandOf(tx, [operationOf(ROW)], generationOf(leader));
    const facts = {prepareApply: applyCommitted(leader, prepareCommand)};
    const proposedBefore = proposed.length;
    const foreign = sha256('foreign prepared content');
    facts.unboundRollback = pick(await send(leader,
      txMessage(PARTITION_SERVICE_OPERATION.ROLLBACK, tx)), ['success', 'failureCode']);
    facts.foreignDigestCommit = pick(await send(leader, commitMessage(tx, foreign)),
      ['success', 'failureCode']);
    facts.proposedByRefusals = proposed.length - proposedBefore;
    facts.foreignDigestApply = applyCommitted(leader,
      decisionCommandOf(tx, V3.DECISION.COMMIT, foreign));
    facts.afterRefusals = await outcomeOf(leader, tx);
    facts.commitApply = applyCommitted(leader,
      decisionCommandOf(tx, V3.DECISION.COMMIT, prepareCommand.preparedDigest));
    facts.reversalApply = applyCommitted(leader,
      decisionCommandOf(tx, V3.DECISION.ROLLBACK, prepareCommand.preparedDigest));
    facts.final = await outcomeOf(leader, tx);
    facts.rows = rowCount(leader);
    assert.deepEqual(facts, {prepareApply: null,
      unboundRollback: {success: false, failureCode: V3.CODE.DECISION_BINDING_REQUIRED},
      foreignDigestCommit: {success: false, failureCode: V3.CODE.DECISION_DIGEST_MISMATCH},
      proposedByRefusals: 0, foreignDigestApply: null, afterRefusals: PREPARED,
      commitApply: null, reversalApply: null, final: COMMITTED, rows: 1},
    'only the bound decision terminalizes, and the first applied terminal stands');
  } finally {
    await shutdownAll(leader);
  }
});

// --- W10: identity ---

test('TX1 v3 W10a: two coordinators on the same node, in the same incarnation, with the same ' +
  'clock, mint distinct 128-bit random transaction identities', () => {
  const sameNode = {now: () => 1000, nodeId: 'node-a', bootIncarnation: 1};
  const ids = [new DistributedTransactionCoordinator(sameNode),
    new DistributedTransactionCoordinator(sameNode)]
    .map((coordinator) => coordinator.createTransactionId('default'));
  assert.deepEqual({distinct: ids[0] !== ids[1],
    random128: ids.map((id) => /^[0-9a-f]{32}$/u.test(id))},
  {distinct: true, random128: [true, true]},
  'no node, incarnation, sequence, session or clock component (seam B)');
});

test('TX1 v3 W10c: BEGIN persists the identity insert-once before any fanout and mints again ' +
  'on a primary-key collision', async () => {
  const calls = [];
  const coordinator = new DistributedTransactionCoordinator({
    persistTransaction: async (record, options) => {
      calls.push({id: record.transactionId, insertOnce: options?.insertOnce === true});
      if (calls.length === 1) {
        throw Object.assign(new Error('UNIQUE constraint failed: sql_transactions.transaction_id'),
          {code: 'SQLITE_CONSTRAINT_PRIMARYKEY'});
      }
    },
  });
  const begun = await coordinator.begin('w10c').catch((error) => ({thrown: error.message}));
  assert.deepEqual({success: begun.success === true, attempts: calls.length,
    insertOnce: calls.map((call) => call.insertOnce),
    remintedDistinct: calls.length === 2 && calls[0].id !== calls[1].id,
    usesSecond: begun.transactionId === calls[1]?.id},
  {success: true, attempts: 2, insertOnce: [true, true], remintedDistinct: true,
    usesSecond: true}, 'the sql_transactions primary key is the uniqueness authority');
});

test('TX1 v3 W10b: two transactions of one session are keyed by their transactionIds and ' +
  'never share an outcome', async () => {
  const first = identityOf('a21');
  const second = identityOf('a22');
  const follower = await startReplica(REPLICAS[1]);
  try {
    const firstPrepare = prepareCommandOf(first, [operationOf(ROW)], generationOf(follower));
    const facts = {applies: [applyCommitted(follower, firstPrepare), applyCommitted(follower,
      decisionCommandOf(first, V3.DECISION.COMMIT, firstPrepare.preparedDigest))]};
    const secondPrepare = prepareCommandOf(second, [operationOf(ROW_2)], generationOf(follower));
    facts.applies.push(applyCommitted(follower, secondPrepare), applyCommitted(follower,
      decisionCommandOf(second, V3.DECISION.ROLLBACK, secondPrepare.preparedDigest)));
    facts.outcomes = [await outcomeOf(follower, first), await outcomeOf(follower, second)];
    facts.rows = [rowCount(follower, ROW.id), rowCount(follower, ROW_2.id)];
    assert.deepEqual(facts, {applies: [null, null, null, null], outcomes: [COMMITTED,
      {outcome: PARTICIPANT_COMMIT_OUTCOME.NOT_COMMITTED, state: V3.STATE.ROLLED_BACK}],
    rows: [1, 0]}, 'the session is routing context only');
  } finally {
    await shutdownAll(follower);
  }
});

// --- W11: await, deadline, leader loss, non-leader, PREPARING and committed-may-commit ---

async function pendingPrepareAnswer(extra, interrupt) {
  const tx = identityOf(`a11-${extra?.label ?? 'x'}`);
  const {leader, proposed} = await stagedLeaderTransaction(tx, [ROW], extra);
  try {
    const prepare = track(send(leader, prepareMessage(tx)));
    const prepareCommand = await awaitProposal(proposed, isPrepareCommand);
    const settledBefore = prepare.settled;
    const interruption = prepareCommand ? interrupt(leader, prepareCommand) : null;
    await settleTicks();
    return {prepareProposed: prepareCommand !== null, settledBefore, interruption,
      answer: prepare.settled ? pick(prepare.value, UNKNOWN_FIELDS) : null};
  } finally {
    await shutdownAll(leader);
  }
}

test('TX1 v3 W11a: a PREPARE still pending at its commit deadline is answered UNKNOWN, ' +
  'not refused', async () => {
  const clock = new VirtualTimeSource({startMs: 1_000_000});
  const facts = await pendingPrepareAnswer({timeSource: clock, label: 'deadline'}, () => {
    clock.advance(PARTITION_SERVICE_DEFAULT.PENDING_REQUEST_TIMEOUT_MS);
    return null;
  });
  assert.deepEqual(facts, {prepareProposed: true, settledBefore: false, interruption: null,
    answer: UNKNOWN_ANSWER}, 'a proposed PREPARE may still commit');
});

test('TX1 v3 W11b: a PREPARE pending when the leader stops leading is answered UNKNOWN',
  async () => {
    const facts = await pendingPrepareAnswer({label: 'loss'}, (leader) => {
      leader.controllablePort.setRole(RAFT_ROLE.FOLLOWER);
      return null;
    });
    assert.deepEqual(facts, {prepareProposed: true, settledBefore: false, interruption: null,
      answer: UNKNOWN_ANSWER}, 'leadership loss releases the PREPARE as UNKNOWN');
  });

test('TX1 v3 W11e: a committed PREPARE whose own apply on the leader fails environmentally is ' +
  'answered UNKNOWN, never as a failure', async () => {
  const facts = await pendingPrepareAnswer({label: 'env'}, (leader, prepareCommand) => {
    plantStorageFault(leader.db);
    const apply = applyCommitted(leader, prepareCommand);
    removeStorageFault(leader.db);
    return apply;
  });
  assert.deepEqual(facts, {prepareProposed: true, settledBefore: false,
    interruption: 'partition_committed_statement_environment_failed', answer: UNKNOWN_ANSWER},
  'the entry is committed and re-applies after reconstruction');
});

test('TX1 v3 W11f: a decision whose proposal hits a host failure is answered UNKNOWN',
  async () => {
    const tx = identityOf('a11f');
    const {leader} = await startLeader();
    try {
      const prepareCommand = prepareCommandOf(tx, [operationOf(ROW)], generationOf(leader));
      const prepareApply = applyCommitted(leader, prepareCommand);
      leader.controllablePort.setProposeHandler(async () => ({
        outcome: RAFT_OPERATION_OUTCOME.HOST_FAILURE, reason: 'tx1-v4-planted',
        phase: 'propose', retryable: false, recoveryRequired: true}));
      const commit = track(send(leader, commitMessage(tx, prepareCommand.preparedDigest)));
      await settleTicks();
      assert.deepEqual({prepareApply,
        answer: commit.settled ? pick(commit.value, UNKNOWN_FIELDS) : 'pending'},
      {prepareApply: null, answer: UNKNOWN_ANSWER}, 'the entry may already be in the log');
    } finally {
      await shutdownAll(leader);
    }
  });

test('TX1 v3 W11c: a PREPARE on a non-leader is a typed NOT_LEADER refusal that proposes ' +
  'nothing', async () => {
  const follower = await startReplica(REPLICAS[1]);
  const proposed = [];
  follower.controllablePort.setProposeHandler(async (entry) => {
    proposed.push({...entry});
  });
  try {
    const answer = await send(follower, prepareMessage(identityOf('a18')));
    assert.deepEqual({answer: pick(answer, ['success', 'failureCode']), proposed: proposed.length},
      {answer: {success: false, failureCode: PARTITION_WRITE_LEADERSHIP_REFUSAL.NOT_LEADER},
        proposed: 0}, 'only the leader proposes a PREPARE');
  } finally {
    await shutdownAll(follower);
  }
});

test('TX1 v3 W11d: a session write while its PREPARE is in flight is refused and the PREPARE ' +
  'keeps exactly the operations it sealed', async () => {
  const tx = identityOf('a19');
  const {leader, proposed} = await stagedLeaderTransaction(tx, [ROW]);
  try {
    track(send(leader, prepareMessage(tx)));
    const prepareCommand = await awaitProposal(proposed, isPrepareCommand);
    const late = track(send(leader, queryMessage(tx, INSERT_SQL, [ROW_2.id, ROW_2.value])));
    await settleTicks();
    assert.deepEqual({prepareProposed: prepareCommand !== null,
      lateWrite: late.settled ? pick(late.value, ['success', 'failureCode']) : 'pending',
      sealedOperations: prepareCommand ? JSON.parse(prepareCommand.operationsText).length : null,
      ordinaryProposals: proposed.filter(isOrdinaryWrite).length},
    {prepareProposed: true, lateWrite: {success: false, failureCode: V3.CODE.PREPARING},
      sealedOperations: 1, ordinaryProposals: 0}, 'PREPARING seals the session');
  } finally {
    await shutdownAll(leader);
  }
});

// --- W12: the round-1 items still owed ---

test('TX1 v3 W12a: a PREPARE applied after a bound ROLLBACK tombstone is refused terminal, ' +
  'writes nothing and reserves nothing', async () => {
  const tx = identityOf('a23');
  const follower = await startReplica(REPLICAS[1]);
  try {
    const rolledBack = {outcome: PARTICIPANT_COMMIT_OUTCOME.NOT_COMMITTED,
      state: V3.STATE.ROLLED_BACK};
    const facts = {tombstone: applyCommitted(follower,
      decisionCommandOf(tx, V3.DECISION.ROLLBACK, null))};
    facts.afterTombstone = await outcomeOf(follower, tx);
    facts.latePrepare = applyCommitted(follower,
      prepareCommandOf(tx, [operationOf(ROW)], generationOf(follower)));
    facts.afterLatePrepare = await outcomeOf(follower, tx);
    facts.ordinaryWrite = applyCommitted(follower, ordinaryWriteOf('w12a-after', OTHER_ROW));
    facts.rows = [rowCount(follower, ROW.id), rowCount(follower, OTHER_ROW.id)];
    assert.deepEqual(facts, {tombstone: null, afterTombstone: rolledBack, latePrepare: null,
      afterLatePrepare: rolledBack, ordinaryWrite: null, rows: [0, 1]},
    'the first applied terminal is final');
  } finally {
    await shutdownAll(follower);
  }
});

test('TX1 v3 W12b: an outcome read answers UNKNOWN from absence or PREPARED, on any replica, ' +
  'and a terminal state only from its durable row', async () => {
  const tx = identityOf('a24');
  const replicas = [await startReplica(REPLICAS[0]), await startReplica(REPLICAS[1]),
    await startReplica(REPLICAS[2])];
  try {
    const facts = {nothingApplied: await outcomeOf(replicas[2], tx)};
    const prepareCommand = prepareCommandOf(tx, [operationOf(ROW)], generationOf(replicas[0]));
    const decision = decisionCommandOf(tx, V3.DECISION.COMMIT, prepareCommand.preparedDigest);
    facts.applies = [applyCommitted(replicas[0], prepareCommand),
      applyCommitted(replicas[0], decision), applyCommitted(replicas[1], prepareCommand)];
    facts.decided = await outcomeOf(replicas[0], tx);
    facts.preparedOnly = await outcomeOf(replicas[1], tx);
    assert.deepEqual(facts, {
      nothingApplied: {outcome: PARTICIPANT_COMMIT_OUTCOME.UNKNOWN, state: V3.STATE.ABSENT},
      applies: [null, null, null], decided: COMMITTED, preparedOnly: PREPARED},
    'absence is never NOT_COMMITTED');
  } finally {
    await shutdownAll(...replicas);
  }
});

test('TX1 v3 W12c: PREPARED survives a restart as a durable row that keeps the reservation ' +
  'and later applies its decision', async () => {
  const {directory, dbPath} = temporaryDbPath();
  const tx = identityOf('a25');
  let first = null;
  let restarted = null;
  try {
    first = await startReplica(REPLICAS[1], {dbPath});
    const prepareCommand = prepareCommandOf(tx, [operationOf(ROW)], generationOf(first));
    const facts = {prepareApply: applyCommitted(first, prepareCommand)};
    await first.shutdown();
    first = null;
    restarted = await startReplica(REPLICAS[1], {dbPath});
    restarted.controllablePort.committedIndex = durableAppliedIndex(restarted);
    facts.afterRestart = await outcomeOf(restarted, tx);
    facts.reservedWrite = applyCommitted(restarted, ordinaryWriteOf('w12c-reserved', OTHER_ROW));
    facts.reservedRows = rowCount(restarted, OTHER_ROW.id);
    facts.decisionApply = applyCommitted(restarted,
      decisionCommandOf(tx, V3.DECISION.COMMIT, prepareCommand.preparedDigest));
    facts.final = await outcomeOf(restarted, tx);
    facts.rows = rowCount(restarted);
    assert.deepEqual(facts, {prepareApply: null, afterRestart: PREPARED, reservedWrite: null,
      reservedRows: 0, decisionApply: null, final: COMMITTED, rows: 1},
    'the row owner, not a log scan, is the prepared authority after restart');
  } finally {
    await shutdownAll(first, restarted);
    fs.rmSync(directory, {recursive: true, force: true});
  }
});

test('TX1 v3 W12d: the hold sweep discards an expired ACTIVE session and keeps an expired ' +
  'PREPARED row (paired invariants, one sweep)', async () => {
  const active = identityOf('a26');
  const prepared = identityOf('a27');
  const {leader} = await stagedLeaderTransaction(active, [ROW_2]);
  try {
    const facts = {preparedApply: applyCommitted(leader,
      prepareCommandOf(prepared, [operationOf(ROW)], generationOf(leader)))};
    leader.enforcePreparedStateHoldTimeouts(Date.now() + leader.preparedStateHoldTimeoutMs + 1);
    facts.inTransaction = leader.db.inTransaction;
    facts.activeAfterSweep = pick(await send(leader,
      queryMessage(active, INSERT_SQL, [OTHER_ROW.id, OTHER_ROW.value])),
    ['success', 'failureCode']);
    facts.preparedAfterSweep = await outcomeOf(leader, prepared);
    assert.deepEqual(facts, {preparedApply: null, inTransaction: false,
      activeAfterSweep: {success: false, failureCode: V3.CODE.NOT_ACTIVE},
      preparedAfterSweep: PREPARED},
    'expiry discards volatile staging and never terminalizes PREPARED');
  } finally {
    await shutdownAll(leader);
  }
});

test('TX1 v3 W12e: a transaction operation\'s outcome never occupies an ordinary write\'s ' +
  'entry key, even when their entryIds collide', async () => {
  const tx = identityOf('a28');
  const follower = await startReplica(REPLICAS[1]);
  try {
    const prepareCommand = prepareCommandOf(tx, [operationOf(ROW, {entryId: 'shared-entry'})],
      generationOf(follower));
    const facts = {applies: [applyCommitted(follower, prepareCommand), applyCommitted(follower,
      decisionCommandOf(tx, V3.DECISION.COMMIT, prepareCommand.preparedDigest))]};
    facts.ordinaryApply = applyCommitted(follower, ordinaryWriteOf('shared-entry', OTHER_ROW));
    facts.rows = [rowCount(follower, ROW.id), rowCount(follower, OTHER_ROW.id)];
    assert.deepEqual(facts, {applies: [null, null], ordinaryApply: null, rows: [1, 1]},
      'per-operation outcomes are keyed by (participant, ordinal), not by entryId');
  } finally {
    await shutdownAll(follower);
  }
});

// --- seam falsifiers (query lane): executable, recorded, not repaired here ---

function twoParticipantCoordinator(overrides) {
  const calls = {prepare: [], commit: [], rollback: []};
  const coordinator = new DistributedTransactionCoordinator({
    participantRetryMaxRetries: 0,
    sleep: async () => {},
    beginParticipant: async () => {},
    prepareParticipant: async (sessionId, partitionId) => {
      calls.prepare.push(partitionId);
    },
    commitParticipant: async (sessionId, partitionId) => {
      calls.commit.push(partitionId);
    },
    rollbackParticipant: async (sessionId, partitionId) => {
      calls.rollback.push(partitionId);
    },
    ...overrides(calls),
  });
  return {coordinator, calls};
}
const statusOf = (coordinator, sessionId) =>
  coordinator.getTransaction(sessionId)?.status ?? 'ended';

test('TX1 v3 seam S1: once a transaction is COMMITTING, an exceeded budget never rolls a ' +
  'participant back, and the caller learns the commit point was reached', async () => {
  let nowMs = 1_000;
  const {coordinator, calls} = twoParticipantCoordinator((record) => ({
    now: () => nowMs,
    participantRetryMaxRetries: 1,
    commitParticipant: async (sessionId, partitionId) => {
      record.commit.push(partitionId);
      if (partitionId === 'p2') {
        nowMs += 120_000;
        throw new Error('commit answer lost');
      }
    },
  }));
  await coordinator.begin('s1');
  await coordinator.enlistParticipants('s1', ['p1', 'p2']);
  const result = await coordinator.commit('s1');
  assert.deepEqual({rollbackCalls: calls.rollback, status: statusOf(coordinator, 's1'),
    commitPointReached: result.commitPointReached ?? null},
  {rollbackCalls: [], status: TRANSACTION_STATUS.COMMITTING, commitPointReached: true},
  'the client answer is in doubt (TRANSACTION_OUTCOME_UNKNOWN), never a rollback');
});

test('TX1 v3 seam S2: a two-phase NO_TRANSACTION commit miss is resolved by an outcome read, ' +
  'never assumed COMMITTED', async () => {
  const reads = [];
  const owner = {resolveParticipantCommitOutcome: async (...args) => {
    reads.push(args);
    return PARTICIPANT_COMMIT_OUTCOME.UNKNOWN;
  }};
  const error = new Error(QUERY_ERROR_MSG.NO_TRANSACTION_COMMIT);
  error.errorCode = QUERY_ERROR_CODE.NO_TRANSACTION;
  const resolution = await resolveParticipantCommitMiss.call(owner,
    {sessionId: 's2', transactionEpoch: EPOCH, commitMode: COMMIT_MODE.TWO_PHASE_COMMIT},
    TRANSACTION_STATUS.COMMITTING, 'p1', error);
  assert.deepEqual({resolution, reads: reads.length},
    {resolution: PARTICIPANT_COMMIT_OUTCOME.UNKNOWN, reads: 1},
    'protocol.js resolveParticipantCommitMiss must read the participant outcome');
});

test('TX1 v3 seam S3: a non-timeout commit failure after COMMITTING keeps the transaction ' +
  'COMMITTING; re-driving it never prepares or rolls back again', async () => {
  const {coordinator, calls} = twoParticipantCoordinator((record) => ({
    commitParticipant: async (sessionId, partitionId) => {
      record.commit.push(partitionId);
      if (partitionId === 'p2' && record.commit.length <= 2) {
        throw new Error('commit answer lost');
      }
    },
  }));
  await coordinator.begin('s3');
  await coordinator.enlistParticipants('s3', ['p1', 'p2']);
  await coordinator.commit('s3');
  const statusAfterFailure = statusOf(coordinator, 's3');
  const preparesBefore = calls.prepare.length;
  await coordinator.commit('s3');
  assert.deepEqual({statusAfterFailure, reprepares: calls.prepare.length - preparesBefore,
    rollbackCalls: calls.rollback}, {statusAfterFailure: TRANSACTION_STATUS.COMMITTING,
    reprepares: 0, rollbackCalls: []}, 'protocol.js:397-399 sets FAILED, :300-303 re-prepares');
});

test('TX1 v3 seam S4a: recovery completes a transaction left FAILED after its COMMIT decision',
  async () => {
    const {coordinator, calls} = twoParticipantCoordinator(() => ({}));
    const row = (partitionId, status) => ({participant_id: `t-s4:${partitionId}`,
      transaction_id: 't-s4', partition_id: partitionId, status, created_at: 1, updated_at: 1});
    coordinator.recoverFromSystemTables({
      transactions: [{transaction_id: 't-s4', session_id: 's4', status: TRANSACTION_STATUS.FAILED,
        transaction_mode: TRANSACTION_MODE.EXPLICIT,
        participant_set_state: PARTICIPANT_SET_STATE.FROZEN,
        commit_mode: COMMIT_MODE.TWO_PHASE_COMMIT, frozen_participant_count: 2,
        created_at: 1, updated_at: 1}],
      participants: [row('p1', TRANSACTION_STATUS.COMMITTED),
        row('p2', TRANSACTION_STATUS.COMMITTING)],
      decisions: [{transaction_id: 't-s4', decision: 'COMMIT'}],
    });
    await coordinator.resumeRecoveredTransactions();
    assert.deepEqual({commitCalls: calls.commit, rollbackCalls: calls.rollback,
      active: coordinator.hasActiveTransaction('s4')},
    {commitCalls: ['p2'], rollbackCalls: [], active: false},
    'recovery.js:297-306 and :406-410 skip FAILED, stranding PREPARED reservations');
  });

test('TX1 v3 seam S4b: transaction state that cannot be persisted is a typed refusal, never a ' +
  'silent skip', async () => {
  const engine = new SQLQueryEngine({autoStartDistributedTransactionRecovery: false});
  const outcome = await engine.persistDistributedTransactionRow({transactionId: 't-s4b',
    sessionId: 's4b', status: TRANSACTION_STATUS.ACTIVE, createdAt: 1, updatedAt: 1})
    .then(() => 'skipped silently', (error) => error?.code ?? error?.errorCode ?? error?.message);
  assert.deepEqual({outcome}, {outcome: 'TRANSACTION_STATE_PERSISTENCE_UNAVAILABLE'},
    'sql-query-engine.js:115-117 returns without persisting');
});

test('TX1 v3 seam S5: every participant request carries the transaction identity (seam A)',
  async () => {
    const engine = new SQLQueryEngine({autoStartDistributedTransactionRecovery: false});
    let request = null;
    engine.queryExecutor = {executeOnPartition: async (...args) => {
      request = args[6].buildRequest();
      return {success: true};
    }};
    await engine.deliverTransactionOperation('s5', 'p1', PARTITION_SERVICE_OPERATION.COMMIT, {
      transactionEpoch: EPOCH, ...identityOf('t-s5', {partitionId: 'p1'})});
    assert.deepEqual(pick(request, ['transactionId', 'participantId', 'commitMode',
      'transactionEpoch']), {transactionId: 't-s5', participantId: 't-s5:p1',
      commitMode: COMMIT_MODE.TWO_PHASE_COMMIT, transactionEpoch: EPOCH},
    'sql-query-engine.js:569-627 sends only sessionId (and an optional epoch)');
  });

test('TX1 v3 seam S6: each participant\'s PREPARE answer (digest, index, term) is retained on ' +
  'its durable row before the COMMIT decision (seam E)', async () => {
  const persisted = [];
  const {coordinator} = twoParticipantCoordinator(() => ({
    prepareParticipant: async (sessionId, partitionId) => ({success: true,
      preparedDigest: `digest-${partitionId}`, prepareIndex: 5, prepareTerm: 2}),
    persistParticipant: async (record) => {
      persisted.push(record);
    },
  }));
  await coordinator.begin('s6');
  await coordinator.enlistParticipants('s6', ['p1', 'p2']);
  await coordinator.commit('s6');
  const retained = persisted.find((record) => record.partitionId === 'p1' &&
    record.preparedDigest === 'digest-p1');
  assert.deepEqual(pick(retained, ['preparedDigest', 'prepareIndex', 'prepareTerm']),
    {preparedDigest: 'digest-p1', prepareIndex: 5, prepareTerm: 2},
    'the decision text is built from retained answers');
});

test('TX1 v3 seam S7: a single-participant transaction prepares before its decision (seam F, ' +
  'option A; replaced if the query owner chooses option B)', async () => {
  const order = [];
  const coordinator = new DistributedTransactionCoordinator({
    beginParticipant: async () => {},
    prepareParticipant: async () => {
      order.push('prepare');
    },
    commitParticipant: async () => {
      order.push('commit');
    },
    resolveParticipantCommitOutcome: async () => PARTICIPANT_COMMIT_OUTCOME.UNKNOWN,
  });
  await coordinator.begin('s7');
  await coordinator.enlistParticipants('s7', ['p1']);
  await coordinator.commit('s7');
  assert.deepEqual(order, ['prepare', 'commit'], 'prepare-first single participant');
});

test('TX1 v3 seam S8: two recovering coordinators driving one transaction record exactly one ' +
  'insert-once decision (seam G)', async () => {
  const decisions = new Map();
  const recovering = () => twoParticipantCoordinator(() => ({
    persistTransactionDecision: async (record) => {
      if (decisions.has(record.transactionId)) {
        throw Object.assign(new Error('duplicate decision'),
          {code: 'SQLITE_CONSTRAINT_PRIMARYKEY'});
      }
      decisions.set(record.transactionId, record.decision);
    },
  }));
  const pair = [recovering(), recovering()];
  for (const {coordinator} of pair) {
    coordinator.recoverFromSystemTables({
      transactions: [{transaction_id: 't-s8', session_id: 's8',
        status: TRANSACTION_STATUS.PREPARED, transaction_mode: TRANSACTION_MODE.EXPLICIT,
        participant_set_state: PARTICIPANT_SET_STATE.FROZEN,
        commit_mode: COMMIT_MODE.TWO_PHASE_COMMIT, frozen_participant_count: 1,
        created_at: 1, updated_at: 1}],
      participants: [{participant_id: 't-s8:p1', transaction_id: 't-s8', partition_id: 'p1',
        status: TRANSACTION_STATUS.PREPARED, created_at: 1, updated_at: 1}],
    });
  }
  await Promise.all(pair.map(({coordinator}) => coordinator.resumeRecoveredTransactions()));
  assert.deepEqual({decisions: [...decisions.entries()],
    rollbackCalls: pair.flatMap(({calls}) => calls.rollback)},
  {decisions: [['t-s8', 'COMMIT']], rollbackCalls: []},
  'concurrent recovery converges on the first inserted decision (finding F-REC)');
});

// --- positive controls (green on the sealed head) ---

test('control: an ordinary committed write applies exactly once and advances the applied index',
  async () => {
    const {leader, proposed} = await startLeader();
    try {
      const appliedBefore = durableAppliedIndex(leader);
      const pending = leader.insertData(TABLE, {...ROW});
      const entry = await awaitProposal(proposed, isOrdinaryWrite);
      assert.ok(entry, 'the write is proposed while its request is pending');
      assert.equal(rowCount(leader), 0, 'an ordinary write is not visible before its commit');
      leader.controllablePort.commit(entry);
      assert.equal((await pending).success, true, 'the proposer is answered after application');
      assert.equal(rowCount(leader), 1, 'the committed write applies once');
      assert.equal(durableAppliedIndex(leader), appliedBefore + 1, 'the applied index advances');
    } finally {
      await shutdownAll(leader);
    }
  });

test('control: a planted applied-state failure leaves an ordinary write unapplied, unrecorded ' +
  'and the applied index unchanged', async () => {
  const replica = await startReplica(REPLICAS[1]);
  try {
    const appliedBefore = durableAppliedIndex(replica);
    plantAppliedStateFailure(replica.db);
    const failed = applyCommitted(replica, ordinaryWriteOf('control-planted', ROW));
    removeAppliedStateFailure(replica.db);
    assert.equal(failed, 'SQLITE_CONSTRAINT_TRIGGER', 'the planted failure fails the apply');
    assert.equal(rowCount(replica), 0, 'the statement rolled back with the transaction');
    assert.equal(statementState(replica, 'control-planted'), 'unsettled',
      'its outcome row rolled back with it');
    assert.equal(durableAppliedIndex(replica), appliedBefore, 'the applied index is unchanged');
  } finally {
    await shutdownAll(replica);
  }
});

test('control: a single-replica storage failure on an ordinary write is the host failure: ' +
  'nothing recorded, applied index unchanged', async () => {
  const replica = await startReplica(REPLICAS[1]);
  try {
    const appliedBefore = durableAppliedIndex(replica);
    plantStorageFault(replica.db);
    const failed = applyCommitted(replica, ordinaryWriteOf('control-storage', ROW));
    removeStorageFault(replica.db);
    assert.equal(failed, 'partition_committed_statement_environment_failed',
      'an environmental failure fails the application closed');
    assert.equal(statementState(replica, 'control-storage'), 'unsettled', 'nothing is recorded');
    assert.equal(durableAppliedIndex(replica), appliedBefore, 'the applied index is unchanged');
    assert.equal(applyCommitted(replica, ordinaryWriteOf('control-storage', ROW)), null,
      'the same entry applies once the host recovers');
    assert.equal(rowCount(replica), 1, 'and applies exactly once');
  } finally {
    await shutdownAll(replica);
  }
});

test('control: an ordinary write carries its SQL verbatim and answers the lastInsertRowid of ' +
  'its own committed apply (the class transaction operations inherit)', async () => {
  const {leader, proposed} = await startLeader();
  try {
    const pending = leader.executeQuery(INSERT_SQL, [ROW.id, ROW.value],
      {entryId: 'control-parity'});
    const entry = await awaitProposal(proposed, hasEntryId('control-parity'));
    assert.ok(entry, 'the write is proposed');
    assert.deepEqual({sql: entry.sql, params: entry.params},
      {sql: INSERT_SQL, params: [ROW.id, ROW.value]}, 'the entry carries the statement verbatim');
    leader.controllablePort.commit(entry);
    const answer = await pending;
    const appliedRowid = leader.db.prepare('SELECT rowid AS rowid FROM test_table WHERE id = ?')
      .get(ROW.id).rowid;
    assert.equal(answer.lastInsertRowid, appliedRowid, 'the answer is the apply\'s own result');
    assert.equal(statementState(leader, 'control-parity'), 'settled',
      'and its outcome row is settled for a replay');
  } finally {
    await shutdownAll(leader);
  }
});
