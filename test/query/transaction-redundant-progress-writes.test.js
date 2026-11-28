/**
 * Quest transaction-redundant-progress-writes, stage 0 red witnesses.
 *
 * The coordinator of a write transaction persists two progress writes whose
 * information is retained elsewhere (R1 commit-path trace, steps W4a and C4):
 * - the ACTIVE row on sql_transaction_participants at the first write to
 *   each table (the manifest on sql_transactions, appended before any
 *   participant request, is the admitted set);
 * - `status = PREPARED` on sql_transactions between the PREPARED participant
 *   rows and the decision (recovery restores a FROZEN undecided row as
 *   PREPARING and decides from the participant rows' evidence).
 * The first block fails on the unchanged tree because those writes exist:
 * it pins the coordinator-table work the quest's target state allows,
 * including the first witness for P > 1. The second block holds today and
 * must keep holding: what the removal may not take with it.
 *
 * World: test/query/transaction-progress-write-witness-support.js.
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
  countOf,
  measureWriteTransaction,
  timelinePositionsOf,
} from './transaction-progress-write-witness-support.js';

const ONE_TABLE = Object.freeze(['users']);
const TWO_TABLES = Object.freeze(['users', 'orders']);
const ACTIVE_ROW = 'participantRow:ACTIVE';
const PREPARED_STATUS = 'status:PREPARED';
const TRANSACTION_ROW_KINDS = Object.freeze(new Set(['registration',
  'manifestAppend', 'manifestFreeze', 'decision']));

function sorted(labels) {
  return [...labels].sort();
}

function transactionRowLabels(labels) {
  return labels.filter((label) => TRANSACTION_ROW_KINDS.has(label) ||
    label.startsWith('status:'));
}

// Target coordinator-table work (5 + 3P for COMMIT, 5 + 2P for ROLLBACK):
// INSERT, P manifest appends, one write-operation batch, freeze, P PREPARED
// rows, decision, P COMMITTED rows, COMMITTED status.
function targetCommitLabels(participants) {
  const perParticipant = (label) => Array.from({length: participants},
    () => label);
  return sorted(['registration', ...perParticipant('manifestAppend'),
    'writeOperations', 'manifestFreeze',
    ...perParticipant('participantRow:PREPARED'), 'decision',
    ...perParticipant('participantRow:COMMITTED'), 'status:COMMITTED']);
}

test('red: a one-table COMMIT submits 8 coordinator-table writes, with no ' +
  'ACTIVE participant row and no PREPARED status (10 on the unchanged tree)',
async () => {
  const facts = await measureWriteTransaction({tables: ONE_TABLE,
    finish: 'COMMIT'});
  assert.equal(facts.success, true, 'the transaction commits');
  assert.deepEqual({
    activeRows: countOf(facts.labels, ACTIVE_ROW),
    preparedStatus: countOf(facts.labels, PREPARED_STATUS),
    mutations: facts.mutationCount,
    labels: sorted(facts.labels),
  }, {
    activeRows: 0,
    preparedStatus: 0,
    mutations: 8,
    labels: targetCommitLabels(1),
  });
});

test('red: a two-table COMMIT submits 11 coordinator-table writes, with no ' +
  'ACTIVE participant row and no PREPARED status (14 on the unchanged tree)',
async () => {
  const facts = await measureWriteTransaction({tables: TWO_TABLES,
    finish: 'COMMIT'});
  assert.equal(facts.success, true, 'the transaction commits');
  assert.deepEqual({
    activeRows: countOf(facts.labels, ACTIVE_ROW),
    preparedStatus: countOf(facts.labels, PREPARED_STATUS),
    mutations: facts.mutationCount,
    labels: sorted(facts.labels),
  }, {
    activeRows: 0,
    preparedStatus: 0,
    mutations: 11,
    labels: targetCommitLabels(2),
  });
});

test('red: a one-table ROLLBACK submits 7 coordinator-table writes, with no ' +
  'ACTIVE participant row (8 on the unchanged tree)', async () => {
  const facts = await measureWriteTransaction({tables: ONE_TABLE,
    finish: 'ROLLBACK'});
  assert.equal(facts.success, true, 'the transaction rolls back');
  assert.deepEqual(sorted(facts.labels), sorted(['registration',
    'manifestAppend', 'writeOperations', 'manifestFreeze', 'decision',
    'participantRow:ROLLED_BACK', 'status:ROLLED_BACK']));
});

test('red: no sql_transaction_participants write precedes the first PREPARE ' +
  'delivery', async () => {
  const facts = await measureWriteTransaction({tables: TWO_TABLES,
    finish: 'COMMIT'});
  const positions = timelinePositionsOf(facts.timeline);
  assert.ok(positions.prepares.length === 2, 'both participants prepare');
  assert.deepEqual(positions.participantRows.filter((index) =>
    index < Math.min(...positions.prepares)), [],
  'participant progress rows start with the PREPARE evidence');
});

test('red: the decision is the next sql_transactions write after the ' +
  'manifest freeze (no PREPARED status between them)', async () => {
  const facts = await measureWriteTransaction({tables: TWO_TABLES,
    finish: 'COMMIT'});
  const rowWrites = transactionRowLabels(facts.labels);
  const freezeAt = rowWrites.indexOf('manifestFreeze');
  assert.ok(freezeAt >= 0, 'the manifest is frozen');
  assert.equal(rowWrites[freezeAt + 1], 'decision',
    `sql_transactions writes: ${rowWrites.join(', ')}`);
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
