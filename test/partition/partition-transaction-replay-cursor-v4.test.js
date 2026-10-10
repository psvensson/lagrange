/**
 * TX1 (quest replicated-transaction-decision-and-apply) design revision 4,
 * section 8.1 item 2: the durable split/merge replay cursor mirrors only
 * entries whose committed-statement outcome is APPLIED. Measured over a real
 * rs-raft log (a lone-leader partition restarted over commands committed
 * through its own operation port, partition-rs-raft-restart-fixture.js), the
 * same surface durable-replay-cursor.test.js witnesses.
 *
 * RC1 is red on the sealed head through the existing mechanism (finding
 * F-MIR: loadDurableDeltasBehindWatermark returns a STATEMENT_FAILED entry).
 * RC2 is a new-surface red: the revision-4 transaction commands fail closed as
 * unrecognised before the reserved disposition can be observed.
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {PARTITION_SERVICE_OPERATION} from
  '../../src/partition/partition-service-constants.js';
import {loadDurableDeltasBehindWatermark} from
  '../../src/partition/partition-mirror-replay-cursor.js';
import {restartOverCommittedCommands} from './partition-rs-raft-restart-fixture.js';
import {
  V3,
  decisionCommandOf,
  identityOf,
  prepareCommandOf,
} from '../test-helpers/participant-transaction-fixture.js';

const PARTITION = 'users-p1';
const TABLE = 'users';
const SCHEMA = Object.freeze({columns: [
  {name: 'id', type: 'TEXT', primaryKey: true},
  {name: 'value', type: 'TEXT'},
]});
const INSERT = `INSERT INTO ${TABLE} (id, value) VALUES (?, ?)`;

function insertCommand(id, entryId = `insert-${id}`) {
  return {entryId, type: PARTITION_SERVICE_OPERATION.INSERT, sql: INSERT,
    params: [id, `value-${id}`]};
}

// The entryIds the replay cursor would mirror after the first committed entry.
async function mirroredAfterFirst(commands) {
  let source = null;
  try {
    source = await restartOverCommittedCommands({partitionId: PARTITION, tableId: TABLE,
      tableName: TABLE, schema: SCHEMA}, commands);
    return {setupFailure: null, mirrored: loadDurableDeltasBehindWatermark(
      source.restarted, source.committed[0].index).map((delta) => delta.entryId)};
  } catch (error) {
    return {setupFailure: error?.message ?? String(error), mirrored: null};
  } finally {
    await source?.dispose();
  }
}

test('TX1 v4 RC1: a source entry whose statement failed deterministically is never mirrored',
  async () => {
    const facts = await mirroredAfterFirst([insertCommand('a'),
      insertCommand('a', 'dup-a'), insertCommand('b')]);
    assert.deepEqual(facts, {setupFailure: null, mirrored: ['insert-b']},
      'only entries with an APPLIED outcome row are mirrorable (finding F-MIR)');
  });

test('TX1 v4 RC2: a write refused by the reservation and the transaction commands are never ' +
  'mirrored; the replay resumes with the next applied write', async () => {
  const tx = identityOf('rc2', {partitionId: PARTITION});
  // The write generation after the first applied insert is 1 (design 3.2).
  const prepare = prepareCommandOf(tx, [{entryId: 'op-x', sql: INSERT, params: ['x', 'v-x']}],
    1, PARTITION);
  const facts = await mirroredAfterFirst([insertCommand('a'), prepare,
    insertCommand('r', 'reserved-r'),
    decisionCommandOf(tx, V3.DECISION.ROLLBACK, prepare.preparedDigest), insertCommand('c')]);
  assert.deepEqual(facts, {setupFailure: null, mirrored: ['insert-c']},
    'a reserved_refused entry has no outcome row, so it is not mirrored');
});
