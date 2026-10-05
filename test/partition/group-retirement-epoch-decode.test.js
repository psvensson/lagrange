/**
 * R5 (re-verification 2026-10-04): string-typed integer epochs on a durable
 * workflow record. Decision: REFUSED (fail-closed), not decoded.
 *
 * Why: `tables.active_partition_version` is an INTEGER column, and SQLite's
 * integer affinity stores even a canonical integer string as an integer, so
 * the storage the record lives in never yields a string for it (witnessed
 * here on better-sqlite3, the engine the node uses); both workflows write
 * `targetPartitionVersion` as a number. A string epoch is therefore a
 * record no production writer produced: it is malformed, and neither the
 * resume (`retiringWorkflowOf`) nor the replica's open-time evidence read
 * treats it as retiring. Liveness only, never a retirement on a guess.
 */
import Database from 'better-sqlite3';

import {test} from '../../src/test-helpers/tap.js';
import {
  RECORD_EVIDENCE_STATE,
  groupRetirementEvidenceFromRecord,
  retiringWorkflowOf,
} from '../../src/partition/group-retirement-evidence.js';
import {PARTITION_TRANSITION_STATE} from
  '../../src/partition/partition-constants.js';
import {
  SPLIT_ACK_STATUS,
  SPLIT_PARTICIPANT_PREFIX,
} from '../../src/partition/split-ack-constants.js';

const TABLE_ID = 'tbl-epoch';

function record({active = 2, target = 2} = {}) {
  return {
    table_id: TABLE_ID,
    active_partition_version: active,
    partition_transition_state: PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE,
    partition_transition_metadata: JSON.stringify({
      workflowId: 'wf-epoch', workflowFenceToken: 3,
      targetPartitionVersion: target, sourcePartitionId: 'p1',
      targetPartitionIds: ['p1-l', 'p1-r'],
      participants: {[SPLIT_PARTICIPANT_PREFIX.SOURCE_PARTITION]:
        {status: SPLIT_ACK_STATUS.CLEANUP_COMPLETED}},
    }),
  };
}

// The authoritative read answering one row.
function gatewayAnswering(row) {
  return {readAuthoritativeRows: async () => ({success: true, rows: [row]})};
}

test('R5 SQLite never yields a string for the INTEGER epoch column',
  async (t) => {
    const db = new Database(':memory:');
    db.exec('CREATE TABLE tables (table_id TEXT PRIMARY KEY, ' +
      'active_partition_version INTEGER NOT NULL DEFAULT 1)');
    db.prepare('INSERT INTO tables VALUES (?, ?)').run('a', 2);
    db.prepare('INSERT INTO tables VALUES (?, ?)').run('b', '2');
    for (const id of ['a', 'b']) {
      const value = db.prepare(
        'SELECT active_partition_version AS v FROM tables WHERE table_id = ?')
        .get(id).v;
      t.equal(typeof value, 'number', `${id}: stored as a number`);
      t.equal(value, 2, `${id}: the value 2`);
    }
    db.close();
  });

test('R5 a string epoch is a malformed record: not retiring, no open-time ' +
  'retirement', async (t) => {
  t.equal(retiringWorkflowOf(record()).retiring, true,
    'control: the numeric record is retiring');
  for (const [label, epochs] of [['active', {active: '2'}],
    ['target', {target: '2'}]]) {
    const row = record(epochs);
    t.equal(retiringWorkflowOf(row).retiring, false,
      `${label} string epoch: the resume does not treat it as retiring`);
    const outcome = await groupRetirementEvidenceFromRecord(
      gatewayAnswering(row), TABLE_ID, 'p1');
    t.equal(outcome.state, RECORD_EVIDENCE_STATE.NOT_RETIRED,
      `${label} string epoch: the open-time read finds no retirement`);
  }
  const numeric = await groupRetirementEvidenceFromRecord(
    gatewayAnswering(record()), TABLE_ID, 'p1');
  t.equal(numeric.state, RECORD_EVIDENCE_STATE.RETIRE,
    'control: the numeric record retires the group');
});
