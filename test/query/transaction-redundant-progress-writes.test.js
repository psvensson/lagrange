/**
 * Quest transaction-redundant-progress-writes: witnesses of removing the
 * ACTIVE row the coordinator writes on sql_transaction_participants at the
 * first write to each table (R1 commit-path trace, step W4a). The manifest
 * on sql_transactions, appended before any participant request, is the
 * admitted set; the participant rows begin with the PREPARE evidence.
 *
 * "red:" tests fail on the unchanged tree because the ACTIVE row exists.
 * Their counts are on purposes, not totals: participant rows per
 * participant, admission submissions against manifest changes, and the
 * position of the first participant row, so an unrelated write being
 * batched or removed later does not move them.
 * "kept:" tests hold today and must keep holding. The begin gate (C1 of the
 * design review): a participant already begun is never begun again. With
 * the success-only participant double that is a BEGIN count; against a real
 * participant (fixture PartitionService) a lost session is not silently
 * reopened by a second BEGIN that would drop earlier staged writes.
 * The real-participant kept tests (stage 1) also cover a participant whose
 * BEGIN never arrived and a participant-leader change (its sessions
 * discarded) between enlistment and the client's COMMIT or ROLLBACK; their
 * answers were compared field by field against the unchanged tree. They
 * compare participant-row writes without the ACTIVE row, which only the
 * unchanged tree writes (the red tests own that difference).
 * The held-obligation tests pin the one answer that changes (lead ruling
 * 2026-11-28, design-note.md transition record item 9): before its
 * authoritative refresh, a transaction restored from rows lists the
 * participants it loaded from rows, so with no ACTIVE row an unprepared
 * participant is not listed; after the refresh both trees list the
 * manifest's participants and resolve identically.
 *
 * World: test/query/transaction-progress-write-witness-support.js.
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
  BEGIN_GATE_SCENARIO,
  REAL_PARTICIPANT_SCENARIO,
  measureBeginGate,
  measureWriteTransaction,
  runHeldObligationScenario,
  runParticipantSessionLossScenario,
  runRealParticipantScenario,
  timelinePositionsOf,
} from './transaction-progress-write-witness-support.js';

const ONE_TABLE = Object.freeze(['users']);
const TWO_TABLES = Object.freeze(['users', 'orders']);

test('red: a one-table COMMIT writes each participant row only as PREPARE ' +
  'evidence and settlement (unchanged tree: ACTIVE first)', async () => {
  const facts = await measureWriteTransaction({tables: ONE_TABLE,
    finish: 'COMMIT'});
  assert.equal(facts.success, true, 'the transaction commits');
  assert.deepEqual(facts.participantRowsByPartition,
    {p1: ['PREPARED', 'COMMITTED']});
});

test('red: a two-table COMMIT writes each participant row only as PREPARE ' +
  'evidence and settlement, none before the first PREPARE delivery',
async () => {
  const facts = await measureWriteTransaction({tables: TWO_TABLES,
    finish: 'COMMIT'});
  assert.equal(facts.success, true, 'the transaction commits');
  assert.deepEqual(facts.participantRowsByPartition, {
    p1: ['PREPARED', 'COMMITTED'], p2: ['PREPARED', 'COMMITTED']});
  const positions = timelinePositionsOf(facts.timeline);
  assert.equal(positions.prepares.length, 2, 'both participants prepare');
  assert.deepEqual(positions.participantRows.filter((index) =>
    index < Math.min(...positions.prepares)), []);
});

test('red: a one-table ROLLBACK writes the participant row only as its ' +
  'settlement', async () => {
  const facts = await measureWriteTransaction({tables: ONE_TABLE,
    finish: 'ROLLBACK'});
  assert.equal(facts.success, true, 'the transaction rolls back');
  assert.deepEqual(facts.participantRowsByPartition, {p1: ['ROLLED_BACK']});
});

test('red: participant-admission submissions equal the manifest changes ' +
  '(one manifest append per admitted participant, nothing else)', async () => {
  for (const tables of [ONE_TABLE, TWO_TABLES]) {
    const facts = await measureWriteTransaction({tables, finish: 'COMMIT'});
    assert.equal(facts.admission.manifestChanges, tables.length);
    assert.equal(facts.admission.submissions, facts.admission.manifestChanges,
      `admission writes for ${tables.length} participant(s)`);
  }
});

for (const scenario of Object.values(BEGIN_GATE_SCENARIO)) {
  test(`kept: one BEGIN per participant (${scenario})`, async () => {
    const facts = await measureBeginGate(scenario);
    assert.deepEqual(facts, {beginsByPartition: {p1: 1},
      statements: [true, true, true], committed: true});
  });
}

test('kept: a participant that lost its session is not begun again; the ' +
  'write is refused and the transaction rolls back with nothing applied ' +
  '(real participant)', async () => {
  const facts = await runParticipantSessionLossScenario();
  assert.deepEqual(facts, {
    begins: 1,
    statements: [true, true, false],
    beginsAfterLoss: 0,
    refusalAfterLoss: 'participant_transaction_not_active',
    rolledBack: true,
    appliedRows: 0,
    participantRows: [{state: 'ROLLED_BACK', decision: 'ROLLBACK'}],
    row: {status: 'ROLLED_BACK', decision: 'ROLLBACK'},
  });
});

const ROLLED_BACK_TOMBSTONE = Object.freeze([
  Object.freeze({state: 'ROLLED_BACK', decision: 'ROLLBACK'})]);
const REFUSED_PREPARES = Object.freeze([
  'PREPARE:participant_transaction_not_active',
  'PREPARE:participant_transaction_not_active',
  'PREPARE:participant_transaction_not_active',
  'PREPARE:participant_transaction_not_active',
  'ROLLBACK:ok']);

function settlementFactsOf(facts) {
  return {
    transactionRow: facts.transactionRow,
    settlementRowWrites: facts.participantRowWrites.filter((status) =>
      status !== 'ACTIVE'),
    participantRecords: facts.participantRecords,
    committedProposals: facts.committedProposals,
    appliedRows: facts.appliedRows,
  };
}

test('kept: two writes staged at a real participant are begun once and ' +
  'committed together', async () => {
  const facts = await runRealParticipantScenario(
    REAL_PARTICIPANT_SCENARIO.COMMITTED);
  assert.equal(facts.beginsDelivered, 1, 'one BEGIN for both writes');
  assert.deepEqual(facts.statements.map((answer) => answer.success),
    [true, true]);
  assert.deepEqual(facts.finished, {success: true, errorCode: null,
    stage: null});
  assert.deepEqual(settlementFactsOf(facts), {
    transactionRow: {status: 'COMMITTED', decision: 'COMMIT'},
    settlementRowWrites: ['PREPARED', 'COMMITTED'],
    participantRecords: [{state: 'COMMITTED', decision: 'COMMIT'}],
    committedProposals: ['PARTICIPANT_PREPARE', 'PARTICIPANT_DECISION'],
    appliedRows: 2,
  });
});

test('kept: a participant that never began (its BEGIN never arrived) ends ' +
  'in one ROLLBACK with a tombstone and nothing applied', async () => {
  const facts = await runRealParticipantScenario(
    REAL_PARTICIPANT_SCENARIO.NEVER_BEGAN);
  assert.equal(facts.beginsDelivered, 0, 'the participant never began');
  assert.ok(facts.beginsUndelivered > 0, 'the BEGIN was attempted');
  assert.deepEqual(facts.statements, [{success: false,
    errorCode: 'INTERNAL_ERROR', stage: null}]);
  assert.deepEqual(facts.finished, {success: false,
    errorCode: 'DISTRIBUTED_PARTICIPANT_FAILURE', stage: 'PREPARING'});
  assert.deepEqual(facts.finishAnswers, REFUSED_PREPARES,
    'PREPARE is refused, never answered by a session the COMMIT opened');
  assert.deepEqual(settlementFactsOf(facts), {
    transactionRow: {status: 'ROLLED_BACK', decision: 'ROLLBACK'},
    settlementRowWrites: ['FAILED', 'ROLLED_BACK'],
    participantRecords: ROLLED_BACK_TOMBSTONE,
    committedProposals: ['PARTICIPANT_DECISION'],
    appliedRows: 0,
  });
});

test('kept: a participant-leader change between enlistment and COMMIT is ' +
  'not reopened by a BEGIN; the COMMIT ends in one ROLLBACK with nothing ' +
  'applied', async () => {
  const facts = await runRealParticipantScenario(
    REAL_PARTICIPANT_SCENARIO.LOST_BEFORE_COMMIT);
  assert.equal(facts.beginsDelivered, 1, 'no second BEGIN after the loss');
  assert.deepEqual(facts.statements.map((answer) => answer.success),
    [true, true]);
  assert.deepEqual(facts.finished, {success: false,
    errorCode: 'DISTRIBUTED_PARTICIPANT_FAILURE', stage: 'PREPARING'});
  assert.deepEqual(facts.finishAnswers, REFUSED_PREPARES);
  assert.deepEqual(settlementFactsOf(facts), {
    transactionRow: {status: 'ROLLED_BACK', decision: 'ROLLBACK'},
    settlementRowWrites: ['FAILED', 'ROLLED_BACK'],
    participantRecords: ROLLED_BACK_TOMBSTONE,
    committedProposals: ['PARTICIPANT_DECISION'],
    appliedRows: 0,
  });
});

test('kept: a participant-leader change between enlistment and ROLLBACK ' +
  'ends in one ROLLBACK with a tombstone and nothing applied', async () => {
  const facts = await runRealParticipantScenario(
    REAL_PARTICIPANT_SCENARIO.LOST_BEFORE_ROLLBACK);
  assert.equal(facts.beginsDelivered, 1);
  assert.deepEqual(facts.finished, {success: true, errorCode: null,
    stage: null});
  assert.deepEqual(facts.finishAnswers, ['ROLLBACK:ok']);
  assert.deepEqual(settlementFactsOf(facts), {
    transactionRow: {status: 'ROLLED_BACK', decision: 'ROLLBACK'},
    settlementRowWrites: ['ROLLED_BACK'],
    participantRecords: ROLLED_BACK_TOMBSTONE,
    committedProposals: ['PARTICIPANT_DECISION'],
    appliedRows: 0,
  });
});

const MANIFEST_MEMBERS = Object.freeze(['p1', 'p2']);
const HELD_IN_DOUBT = 'TRANSACTION_DECISION_IN_DOUBT';

function heldBeforeRefresh(participants, statuses) {
  return {replayFailed: 1,
    obligation: {participants, statuses},
    clientCommit: {success: false, errorCode: HELD_IN_DOUBT,
      decisionReadState: 'unavailable', participants}};
}

// After the refresh: the manifest's members, without PREPARE evidence; the
// freeze write still fails, so the obligation stays held. Then one ROLLBACK.
const HELD_AFTER_REFRESH = Object.freeze({
  obligation: {participants: MANIFEST_MEMBERS, statuses: ['FAILED', 'FAILED']},
  clientCommit: {success: false, errorCode: HELD_IN_DOUBT,
    decisionReadState: 'absent', participants: MANIFEST_MEMBERS},
});
const HELD_RESOLUTION = Object.freeze({obligation: null, decision: 'ROLLBACK',
  status: 'ROLLED_BACK', participantDecisions: [['ROLLBACK'], ['ROLLBACK']],
  orphanedSessions: [], violations: []});

test('red: a transaction restored from rows and held before its authoritative ' +
  'refresh lists no participant (no participant row exists before the PREPARE ' +
  'evidence); after the refresh it lists the manifest\'s participants and rolls ' +
  'back as before (unchanged tree: the ACTIVE rows are listed)', async () => {
  const facts = await runHeldObligationScenario({tables: TWO_TABLES});
  assert.equal(facts.stopped, true);
  assert.deepEqual(facts.manifest, MANIFEST_MEMBERS);
  assert.deepEqual(facts.beforeRefresh, heldBeforeRefresh([], []));
  assert.deepEqual(facts.afterRefresh, HELD_AFTER_REFRESH);
  assert.deepEqual(facts.resolution, HELD_RESOLUTION);
});

test('kept: with the unchanged tree\'s ACTIVE rows planted (upgrade), the held ' +
  'obligation lists them before the refresh; the refresh restores the ' +
  'manifest\'s participants and the transaction rolls back identically',
async () => {
  const facts = await runHeldObligationScenario({tables: TWO_TABLES,
    plantActiveRows: true});
  assert.equal(facts.stopped, true);
  assert.deepEqual(facts.beforeRefresh, heldBeforeRefresh(MANIFEST_MEMBERS,
    ['ACTIVE', 'ACTIVE']));
  assert.deepEqual(facts.afterRefresh, HELD_AFTER_REFRESH);
  assert.deepEqual(facts.resolution, HELD_RESOLUTION);
});

test('kept: each participant is appended to the manifest before its first ' +
  'participant request', async () => {
  const facts = await measureWriteTransaction({tables: TWO_TABLES,
    finish: 'COMMIT'});
  const positions = timelinePositionsOf(facts.timeline);
  assert.equal(positions.manifestAppends.length, 2);
  assert.equal(positions.begins.length, 2);
  for (const [index, beginAt] of positions.begins.entries()) {
    assert.ok(positions.manifestAppends[index] < beginAt,
      `manifest append ${index} precedes BEGIN ${index}`);
  }
});

test('kept: every participant\'s PREPARED evidence row precedes the ' +
  'decision, which precedes every COMMIT delivery; the transaction settles',
async () => {
  const facts = await measureWriteTransaction({tables: TWO_TABLES,
    finish: 'COMMIT'});
  const positions = timelinePositionsOf(facts.timeline);
  assert.equal(positions.preparedRows.length, 2);
  assert.equal(positions.decisions.length, 1);
  assert.ok(Math.max(...positions.preparedRows) < positions.decisions[0],
    'PREPARE evidence is retained before the decision');
  assert.ok(positions.decisions[0] < Math.min(...positions.commits),
    'the decision is recorded before any decision fanout');
  assert.deepEqual({
    status: facts.row?.status,
    decision: facts.row?.decision,
    participantRows: facts.participantRows.map((row) =>
      [row.status, typeof row.prepared_digest === 'string']),
    participantDecisions: facts.ledger.map((entry) =>
      entry.decisions.map((applied) => applied.decision)),
    violations: facts.violations,
  }, {
    status: 'COMMITTED',
    decision: 'COMMIT',
    participantRows: [['COMMITTED', true], ['COMMITTED', true]],
    participantDecisions: [['COMMIT'], ['COMMIT']],
    violations: [],
  });
});
