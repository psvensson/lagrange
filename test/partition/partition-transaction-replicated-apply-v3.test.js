/**
 * TX1 (quest replicated-transaction-decision-and-apply, PR100 Leg A) participant
 * red witnesses for design revision 7 (design-leg-a-v7-2026-10-10.md, section
 * 10). Siblings: test/query/partition-transaction-seam-falsifiers.test.js (query
 * lane) and partition-transaction-replay-cursor-v4.test.js (real rs-raft log; since
 * revision 6 the positive controls, since revision 7 the classifier witnesses W6n,
 * W6s, W6p and W6r); fixture:
 * test/test-helpers/participant-transaction-fixture.js. The revision-2
 * file partition-transaction-replicated-apply.test.js is superseded history.
 * Consensus is driven by the test while a request is pending; each witness
 * measures every fact before one deepEqual. Red on the sealed head through the
 * old participant behaviour, a new-surface UNRECOGNISED command or the absent
 * classifier owner. The controllable port proves scheduling and the application
 * transaction, not durable persistence (A1-A5 are bound by the producer).
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
import {PARTICIPANT_COMMIT_OUTCOME} from '../../src/constants/transactions.js';
import {
  COMMITTED, GENERATION_SQL, alterCommandOf, columnsOf,
  commitDecision, decidedOnTwoReplicas, INSERT_SQL, notCommitted,
  OTHER_ROW, PREPARED, REPLICAS, ROW, ROW_2, TABLE, UNKNOWN_ANSWER, UNKNOWN_FIELDS, V3,
  applyCommitted, awaitProposal, beginMessage, commitMessage, commitOrdinaryWrite,
  decisionCommandOf, durableAppliedIndex, generationOf, hasEntryId, identityOf,
  isDecisionCommand, isOrdinaryWrite, isPrepareCommand, onTwoReplicas, operationOf,
  ordinaryWriteOf, outcomeOf, pendingPrepareAnswer, pick, plantAppliedStateFailure,
  plantStorageFault, prepareCommandOf, prepareMessage, probeAppliedStateWrite, queryMessage,
  removeAppliedStateFailure, removeStorageFault, rowCount, send, settleTicks, sha256,
  shutdownAll, stagedLeaderTransaction, startLeader, startReplica, statementState,
  temporaryDbPath, track, transactionOperationOutcomes, txMessage, validationTextOf,
} from '../test-helpers/participant-transaction-fixture.js';

const CONFLICT_REFUSAL = Object.freeze({success: false, refusalCause: V3.REFUSAL_CAUSE.CONFLICT});

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
    facts.decisionApply = applyCommitted(follower, commitDecision(tx, prepareCommand));
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

// --- W2: atomicity of the application transaction, including the generation ---
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
    facts.decisionApply = applyCommitted(follower, commitDecision(tx, prepareCommand));
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

test('TX1 v3 W2b: the operations, the per-operation outcomes, the COMMITTED state and the ' +
  'write generation are all written before the applied-state write of the decision', async () => {
  const tx = identityOf('a4');
  const follower = await startReplica(REPLICAS[1]);
  try {
    const prepareCommand = prepareCommandOf(tx, [operationOf(ROW)], generationOf(follower));
    const facts = {prepareApply: applyCommitted(follower, prepareCommand)};
    const seen = probeAppliedStateWrite(follower.db,
      ['rows_seen', 'state', 'txop', 'generation'],
      'SELECT (SELECT COUNT(*) FROM test_table WHERE id = \'row-1\'), ' +
      '(SELECT state FROM _participant_transactions WHERE transaction_id = \'a4\'), ' +
      '(SELECT COUNT(*) FROM _partition_statement_outcomes WHERE entry_key LIKE \'txop:%\'), ' +
      GENERATION_SQL);
    facts.decisionApply = applyCommitted(follower, commitDecision(tx, prepareCommand));
    facts.seenAtAppliedStateWrite = seen().map((row) => ({rows: row.rows_seen,
      state: row.state, txop: row.txop, generation: row.generation}));
    assert.deepEqual(facts, {prepareApply: null, decisionApply: null,
      seenAtAppliedStateWrite: [{rows: 1, state: V3.STATE.COMMITTED, txop: 1, generation: 1}]},
    'a post-commit effect writing rows, outcomes, state or the generation cannot satisfy this');
  } finally {
    await shutdownAll(follower);
  }
});

test('TX1 v3 W2c: an ordinary write increments the write generation inside its own application ' +
  'transaction, before the applied-state write', async () => {
  const follower = await startReplica(REPLICAS[1]);
  try {
    const warmUp = applyCommitted(follower, ordinaryWriteOf('w2c-warm-up', OTHER_ROW));
    const seen = probeAppliedStateWrite(follower.db, ['rows_seen', 'generation'],
      `SELECT (SELECT COUNT(*) FROM test_table WHERE id = 'row-1'), ${GENERATION_SQL}`);
    const apply = applyCommitted(follower, ordinaryWriteOf('w2c-write', ROW));
    assert.deepEqual({warmUp, apply, seen: seen().map((row) => ({rows: row.rows_seen,
      generation: row.generation}))}, {warmUp: null, apply: null,
      seen: [{rows: 1, generation: 2}]},
    'the generation is application state, written with the data it counts');
  } finally {
    await shutdownAll(follower);
  }
});

// --- W3: identical outcomes on every replica; host failure on one ---

test('TX1 v3 W3a: a PREPARE whose operation fails deterministically is REFUSED identically on ' +
  'every replica, applies nothing, and a later COMMIT cannot apply it', async () => {
  const perReplica = await decidedOnTwoReplicas(identityOf('a5'),
    [operationOf(ROW), operationOf(ROW_2, {entryId: 'op-dup'})],
    ordinaryWriteOf('w3a-setup', ROW_2));
  const refused = {setupApply: null, prepareApply: null,
    afterPrepare: {...notCommitted(V3.STATE.REFUSED),
      refusalCause: V3.REFUSAL_CAUSE.STATEMENT_FAILED},
    decisionApply: null, afterDecision: notCommitted(V3.STATE.REFUSED), rows: 0, values: [],
    appliedAdvance: 2};
  assert.deepEqual(perReplica, [refused, refused],
    'every replica refuses the same PREPARE the same way and never applies it');
});

test('TX1 v3 W3c: a committed PREPARE is applied exactly as carried: the apply side never ' +
  're-classifies an operation the staging classifier would refuse', async () => {
  const perReplica = await decidedOnTwoReplicas(identityOf('a5c'), [operationOf(ROW,
    {sql: 'INSERT INTO test_table (id, value) VALUES (?, datetime(\'2020-01-01\'))',
      params: [ROW.id]})]);
  const applied = {setupApply: null, prepareApply: null,
    afterPrepare: {...PREPARED, refusalCause: null}, decisionApply: null,
    afterDecision: COMMITTED, rows: 1, values: ['2020-01-01 00:00:00'], appliedAdvance: 2};
  assert.deepEqual(perReplica, [applied, applied],
    'a classifier change between versions cannot make replicas disagree on a committed PREPARE');
});

test('TX1 v3 W3b: a single-replica storage failure while the COMMIT decision applies is the ' +
  'host failure: nothing recorded, applied index unchanged, re-applied after recovery',
async () => {
  const tx = identityOf('a6');
  const healthy = await startReplica(REPLICAS[1]);
  const faulty = await startReplica(REPLICAS[2]);
  try {
    const prepareCommand = prepareCommandOf(tx, [operationOf(ROW)], generationOf(healthy));
    const decision = commitDecision(tx, prepareCommand);
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

// --- W4, W13-W17: the conflict rule, its BEGIN-time base and the generation ---
test('TX1 v3 W4: a committed write after the transaction\'s base refuses its PREPARE on every ' +
  'replica; once PREPARED, a reserved write cannot make the COMMIT fail', async () => {
  const conflicted = identityOf('a7');
  const reserved = identityOf('a8');
  const perReplica = await onTwoReplicas(async (replica) => {
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
    const decisionApply = applyCommitted(replica, commitDecision(reserved, prepareCommand));
    return {intervening, conflictPrepare, conflictOutcome, reservedPrepare, reservedWrite,
      reservedWriteFacts, decisionApply, committed: await outcomeOf(replica, reserved),
      rows: rowCount(replica)};
  });
  const expected = {intervening: null, conflictPrepare: null,
    conflictOutcome: {...notCommitted(V3.STATE.REFUSED), refusalCause: V3.REFUSAL_CAUSE.CONFLICT},
    reservedPrepare: null, reservedWrite: null,
    reservedWriteFacts: {rows: 0, statement: 'unsettled', appliedAdvance: 1},
    decisionApply: null, committed: COMMITTED, rows: 1};
  assert.deepEqual(perReplica, [expected, expected],
    'first committer wins at PREPARE apply, and the reservation keeps COMMIT infallible');
});

test('TX1 v3 W17: a foreign TOMBSTONE, a foreign COMMIT for an absent transaction and two ' +
  'digest_invalid PREPAREs (foreign and same-identity) applied while T1 is PREPARED move no ' +
  'generation and stall nothing; T1\'s COMMIT then applies on every replica', async () => {
  const [first, tombstoned, forged, absent] = ['a17', 'a17-t', 'a17-f', 'a17-a'].map(
    (id) => identityOf(id));
  const perReplica = await onTwoReplicas(async (replica) => {
    const prepareCommand = prepareCommandOf(first, [operationOf(ROW)], generationOf(replica));
    const prepareApply = applyCommitted(replica, prepareCommand);
    const generations = [generationOf(replica)];
    const appliedBefore = durableAppliedIndex(replica);
    const forgedOf = (identity) => ({...prepareCommandOf(identity, [operationOf(ROW_2)],
      generationOf(replica)), preparedDigest: sha256('not the carried bytes')});
    const controls = [applyCommitted(replica,
      decisionCommandOf(tombstoned, V3.DECISION.ROLLBACK, null)),
    applyCommitted(replica, decisionCommandOf(absent, V3.DECISION.COMMIT, sha256('absent'))),
    applyCommitted(replica, forgedOf(forged)), applyCommitted(replica, forgedOf(first))];
    generations.push(generationOf(replica));
    const reserved = {...(await outcomeOf(replica, first)), digestKept: (await send(replica,
      txMessage(PARTITION_SERVICE_OPERATION.TRANSACTION_OUTCOME, first)))?.preparedDigest ===
      prepareCommand.preparedDigest, appliedAdvance: durableAppliedIndex(replica) - appliedBefore};
    const decisionApply = applyCommitted(replica, commitDecision(first, prepareCommand));
    generations.push(generationOf(replica));
    return {prepareApply, controls, reserved, decisionApply, generations,
      outcomes: [await outcomeOf(replica, first), await outcomeOf(replica, tombstoned),
        await outcomeOf(replica, absent), await outcomeOf(replica, forged, ['refusalCause'])],
      rows: [rowCount(replica, ROW.id), rowCount(replica, ROW_2.id)]};
  });
  const expected = {prepareApply: null, controls: [null, null, null, null],
    reserved: {...PREPARED, digestKept: true, appliedAdvance: 4}, decisionApply: null,
    generations: [0, 0, 1], outcomes: [COMMITTED, notCommitted(V3.STATE.ROLLED_BACK),
      {outcome: PARTICIPANT_COMMIT_OUTCOME.UNKNOWN, state: V3.STATE.ABSENT},
      {...notCommitted(V3.STATE.REFUSED), refusalCause: V3.REFUSAL_CAUSE.DIGEST_INVALID}],
    rows: [1, 0]};
  assert.deepEqual(perReplica, [expected, expected],
    'control rows never move the generation, and a same-identity forgery never collides');
});

test('TX1 v3 W18: a MIGRATION_ALTER_TABLE applied while T1 is PREPARED is reserved_refused ' +
  '(no schema change, outcome or generation); T1\'s COMMIT applies, then the redelivered ' +
  'ALTER applies', async () => {
  const tx = identityOf('a18');
  const alter = alterCommandOf('w18-alter', `ALTER TABLE ${TABLE} ADD COLUMN extra TEXT`);
  const schemaOf = (replica) => ({columns: columnsOf(replica),
    statement: statementState(replica, alter.entryId), generation: generationOf(replica)});
  const perReplica = await onTwoReplicas(async (replica) => {
    const prepareCommand = prepareCommandOf(tx, [operationOf(ROW)], generationOf(replica));
    const facts = {prepareApply: applyCommitted(replica, prepareCommand)};
    const appliedBefore = durableAppliedIndex(replica);
    facts.alterApply = applyCommitted(replica, alter);
    facts.whileReserved = {...schemaOf(replica),
      appliedAdvance: durableAppliedIndex(replica) - appliedBefore};
    facts.decisionApply = applyCommitted(replica, commitDecision(tx, prepareCommand));
    facts.committed = {...(await outcomeOf(replica, tx)), rows: rowCount(replica)};
    facts.redelivered = applyCommitted(replica, alter);
    facts.after = schemaOf(replica);
    return facts;
  });
  const expected = {prepareApply: null, alterApply: null,
    whileReserved: {columns: ['id', 'value'], statement: 'unsettled', generation: 0,
      appliedAdvance: 1}, decisionApply: null, committed: {...COMMITTED, rows: 1},
    redelivered: null, after: {columns: ['id', 'value', 'extra'], statement: 'settled',
      generation: 2}};
  assert.deepEqual(perReplica, [expected, expected],
    'a schema change is an application-data change: the reservation holds it like a write');
});

test('TX1 v3 W19: a zero-operation COMMIT decision changes no application data and moves no ' +
  'generation', async () => {
  const tx = identityOf('a19');
  const perReplica = await onTwoReplicas(async (replica) => {
    const warmUp = applyCommitted(replica, ordinaryWriteOf('w19-warm-up', OTHER_ROW));
    const generations = [generationOf(replica)];
    const prepareCommand = prepareCommandOf(tx, [], generations[0]);
    const applies = [applyCommitted(replica, prepareCommand),
      applyCommitted(replica, commitDecision(tx, prepareCommand))];
    generations.push(generationOf(replica));
    return {warmUp, applies, outcome: await outcomeOf(replica, tx), generations,
      txop: transactionOperationOutcomes(replica)};
  });
  const expected = {warmUp: null, applies: [null, null], outcome: COMMITTED,
    generations: [1, 1], txop: 0};
  assert.deepEqual(perReplica, [expected, expected],
    'g counts application-data changes, so a decision that applies no operation leaves it');
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
    'staging never holds the connection; reads replay over current committed state');
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
  'COMMIT_DEADLINE_EXCEEDED, and a decision applied afterwards proposes nothing', async () => {
  const clock = new VirtualTimeSource({startMs: 1_000_000});
  const tx = identityOf('a12d');
  const {leader, proposed} = await startLeader({timeSource: clock});
  try {
    const prepareCommand = prepareCommandOf(tx, [operationOf(ROW)], generationOf(leader));
    const facts = {prepareApply: applyCommitted(leader, prepareCommand)};
    const parked = track(leader.executeQuery(INSERT_SQL, [OTHER_ROW.id, OTHER_ROW.value],
      {entryId: 'w7b-parked'}));
    await settleTicks();
    clock.advance(PARTITION_SERVICE_DEFAULT.PENDING_REQUEST_TIMEOUT_MS);
    await settleTicks();
    facts.answer = parked.settled ? pick(parked.value, ['success', 'failureCode']) : 'pending';
    facts.release = applyCommitted(leader,
      decisionCommandOf(tx, V3.DECISION.ROLLBACK, prepareCommand.preparedDigest));
    await settleTicks();
    facts.proposed = proposed.filter(hasEntryId('w7b-parked')).length;
    assert.deepEqual(facts, {prepareApply: null, answer: {success: false,
      failureCode: PARTITION_WRITE_LEADERSHIP_REFUSAL.COMMIT_DEADLINE_EXCEEDED}, release: null,
    proposed: 0}, 'a released waiter is never proposed (proposal-queue markProposal guard)');
  } finally {
    await shutdownAll(leader);
  }
});

// --- W9, W10b: terminals bound to the decision; identity keys outcomes ---
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
    facts.commitApply = applyCommitted(leader, commitDecision(tx, prepareCommand));
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

test('TX1 v3 W10b: two transactions of one session are keyed by their transactionIds and ' +
  'never share an outcome', async () => {
  const first = identityOf('a21');
  const second = identityOf('a22');
  const follower = await startReplica(REPLICAS[1]);
  try {
    const firstPrepare = prepareCommandOf(first, [operationOf(ROW)], generationOf(follower));
    const facts = {applies: [applyCommitted(follower, firstPrepare),
      applyCommitted(follower, commitDecision(first, firstPrepare))]};
    const secondPrepare = prepareCommandOf(second, [operationOf(ROW_2)], generationOf(follower));
    facts.applies.push(applyCommitted(follower, secondPrepare), applyCommitted(follower,
      decisionCommandOf(second, V3.DECISION.ROLLBACK, secondPrepare.preparedDigest)));
    facts.outcomes = [await outcomeOf(follower, first), await outcomeOf(follower, second)];
    facts.rows = [rowCount(follower, ROW.id), rowCount(follower, ROW_2.id)];
    assert.deepEqual(facts, {applies: [null, null, null, null],
      outcomes: [COMMITTED, notCommitted(V3.STATE.ROLLED_BACK)], rows: [1, 0]},
    'the session is routing context only');
  } finally {
    await shutdownAll(follower);
  }
});

// --- W11: await, deadline, leader loss, non-leader, PREPARING and may-be-committed answers ---
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

test('TX1 v3 W11e-ord: an ordinary write whose own committed apply on the leader fails ' +
  'environmentally is answered UNKNOWN by the write kernel (finding F-ANS)', async () => {
  const {leader, proposed} = await startLeader();
  try {
    const pending = track(leader.executeQuery(INSERT_SQL, [ROW.id, ROW.value],
      {entryId: 'w11e-ord'}));
    const entry = await awaitProposal(proposed, hasEntryId('w11e-ord'));
    plantStorageFault(leader.db);
    const apply = entry ? applyCommitted(leader, entry) : 'not proposed';
    removeStorageFault(leader.db);
    await settleTicks();
    assert.deepEqual({apply, answer: pending.settled ? pick(pending.value,
      ['success', 'failureCode']) : 'pending'}, {
      apply: 'partition_committed_statement_environment_failed', answer: {success: false,
        failureCode: PARTITION_WRITE_LEADERSHIP_REFUSAL.OUTCOME_UNKNOWN}},
    'the committed entry re-applies after reconstruction, so its outcome is not a failure');
  } finally {
    await shutdownAll(leader);
  }
});

test('TX1 v3 W11f: a decision whose proposal hits a host failure is answered UNKNOWN',
  async () => {
    const tx = identityOf('a11f');
    const {leader} = await startLeader();
    try {
      const prepareCommand = prepareCommandOf(tx, [operationOf(ROW)], generationOf(leader));
      const prepareApply = applyCommitted(leader, prepareCommand);
      leader.controllablePort.setProposeHandler(async () => ({
        outcome: RAFT_OPERATION_OUTCOME.HOST_FAILURE, reason: 'tx1-planted',
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

test('TX1 v3 W11f-ord: an ordinary write whose proposal hits a host failure is answered ' +
  'UNKNOWN by the write kernel (finding F-ANS)', async () => {
  const {leader} = await startLeader();
  try {
    leader.controllablePort.setProposeHandler(async () => ({
      outcome: RAFT_OPERATION_OUTCOME.HOST_FAILURE, reason: 'tx1-planted',
      phase: 'propose', retryable: false, recoveryRequired: true}));
    const pending = track(leader.executeQuery(INSERT_SQL, [ROW.id, ROW.value],
      {entryId: 'w11f-ord'}));
    await settleTicks();
    assert.deepEqual(pending.settled ? pick(pending.value, ['success', 'failureCode']) :
      'pending', {success: false, failureCode: PARTITION_WRITE_LEADERSHIP_REFUSAL.OUTCOME_UNKNOWN},
    'a host failure while proposing may leave the entry in the log');
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
    const facts = {tombstone: applyCommitted(follower,
      decisionCommandOf(tx, V3.DECISION.ROLLBACK, null))};
    facts.afterTombstone = await outcomeOf(follower, tx);
    facts.latePrepare = applyCommitted(follower,
      prepareCommandOf(tx, [operationOf(ROW)], generationOf(follower)));
    facts.afterLatePrepare = await outcomeOf(follower, tx);
    facts.ordinaryWrite = applyCommitted(follower, ordinaryWriteOf('w12a-after', OTHER_ROW));
    facts.rows = [rowCount(follower, ROW.id), rowCount(follower, OTHER_ROW.id)];
    const rolledBack = notCommitted(V3.STATE.ROLLED_BACK);
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
    facts.applies = [applyCommitted(replicas[0], prepareCommand),
      applyCommitted(replicas[0], commitDecision(tx, prepareCommand)),
      applyCommitted(replicas[1], prepareCommand)];
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
    facts.decisionApply = applyCommitted(restarted, commitDecision(tx, prepareCommand));
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
    const facts = {applies: [applyCommitted(follower, prepareCommand),
      applyCommitted(follower, commitDecision(tx, prepareCommand))]};
    facts.ordinaryApply = applyCommitted(follower, ordinaryWriteOf('shared-entry', OTHER_ROW));
    facts.rows = [rowCount(follower, ROW.id), rowCount(follower, OTHER_ROW.id)];
    assert.deepEqual(facts, {applies: [null, null], ordinaryApply: null, rows: [1, 1]},
      'per-operation outcomes are keyed by (participant, ordinal), not by entryId');
  } finally {
    await shutdownAll(follower);
  }
});
