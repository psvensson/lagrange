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
 *
 * World: test/query/transaction-progress-write-witness-support.js.
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
  BEGIN_GATE_SCENARIO,
  measureBeginGate,
  measureWriteTransaction,
  runParticipantSessionLossScenario,
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
