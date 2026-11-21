// S0 witness 4 (fallback-read closure). Owner path: readOwnerFact /
// buildOwnerFactRequest / readHint in control-plane-owner-fact-read.js.
// An owner-fact request has no mode: a caller cannot name one, omit one into
// a weaker default, or misspell one into "any replica". Whatever the caller
// passes, the reader port receives the leader-required token or nothing.
// Node-free: the reader port is a recording function that answers a failure;
// no witness or status is hand-built here (real witness producers are in
// test/cdc/cdc-owner-fact-non-leader-absence.test.js).
import {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE as MODE,
  CONTROL_PLANE_READ_LEADER_MODE as LEADER,
} from '../../src/control-plane/control-plane-system-table-gateway-constants.js';
import {
  CONTROL_PLANE_HINT_STATE as HINT_STATE,
  OWNER_FACT_REQUEST_REFUSAL as REFUSAL,
  OWNER_FACT_STATE as STATE,
  OWNER_FACT_UNAVAILABLE_REASON as REASON,
  OwnerFactRequestRefusal,
  isOwnerFactAnswer,
  ownerFactRows,
  readHint,
  readOwnerFact,
} from '../../src/control-plane/control-plane-owner-fact-read.js';
import {SYSTEM_TABLE_NAME} from '../../src/bootstrap/system-table-schemas-constants.js';
import {test} from '../../src/test-helpers/tap.js';

const TABLE = SYSTEM_TABLE_NAME.REPLICA_OPERATIONS;
const SQL = 'SELECT * FROM replica_operations WHERE operation_id = ?';
const VALID = Object.freeze({
  tableName: TABLE, sql: SQL, params: Object.freeze(['operation-1']),
  minimumIndex: 7, minimumTerm: 3,
});

function recordingReader() {
  const calls = [];
  return {
    calls,
    async read(tableName, sql, params, readOptions) {
      calls.push({tableName, sql, params, readOptions});
      return {success: false, error: 'the reader under test answers nothing'};
    },
  };
}

async function refusalOf(reader, draft) {
  try {
    await readOwnerFact(reader.read, draft);
  } catch (error) {
    return error;
  }
  return null;
}

test('readOwnerFact: a request that names no mode reaches the reader leader-required',
  async (t) => {
    const reader = recordingReader();
    const answer = await readOwnerFact(reader.read, VALID);
    t.equal(reader.calls.length, 1, 'one read');
    const [{tableName, sql, params, readOptions}] = reader.calls;
    t.equal(tableName, TABLE);
    t.equal(sql, SQL);
    t.same(params, ['operation-1']);
    t.equal(readOptions.authoritativeReadMode, MODE.OWNER_RPC_REQUIRED,
      'never a weaker default mode');
    t.equal(readOptions.leaderMode, LEADER.REQUIRED, 'never a weaker default leader mode');
    t.same(readOptions.ownerFactFloor, {minimumIndex: 7, minimumTerm: 3},
      'the caller\'s floors travel with the read');
    t.equal(Object.isFrozen(readOptions), true, 'the token cannot be weakened downstream');
    t.same(answer, {state: STATE.UNAVAILABLE, reason: REASON.READ_FAILED},
      'a failed read is typed unavailability, with no rows field');
    t.equal(isOwnerFactAnswer(answer), true);
  });

test('buildOwnerFactRequest: a caller-chosen, unknown or undefined mode is refused at construction',
  async (t) => {
    const chosen = [
      ['authoritativeReadMode', MODE.OWNER_LOCAL_ONLY],
      ['authoritativeReadMode', MODE.OWNER_RPC_PREFERRED_SQL_FALLBACK],
      ['authoritativeReadMode', MODE.OWNER_RPC_REQUIRED],
      ['authoritativeReadMode', 'no_such_mode'],
      ['authoritativeReadMode', undefined],
      ['leaderMode', LEADER.ANY],
      ['leaderMode', LEADER.PREFERRED],
      ['leaderMode', LEADER.REQUIRED],
      ['leaderMode', 'no_such_leader_mode'],
      ['leaderMode', undefined],
      ['strategy', 'cache'],
      ['readProfile', 'planning'],
      ['localReadConsistency', 'any_replica'],
      ['replicaFallbackConsistency', 'any_replica'],
      ['preferLeader', false],
    ];
    for (const [field, value] of chosen) {
      const reader = recordingReader();
      const refusal = await refusalOf(reader, {...VALID, [field]: value});
      const label = `${field}=${String(value)}`;
      t.ok(refusal instanceof OwnerFactRequestRefusal, `${label}: typed refusal`);
      t.equal(refusal?.code, REFUSAL.UNKNOWN_FIELD, `${label}: refusal code`);
      t.equal(refusal?.field, field, `${label}: the refused field is named`);
      t.equal(reader.calls.length, 0, `${label}: no read was issued`);
    }
  });

test('buildOwnerFactRequest: floors, statement, table and reader are required, never defaulted',
  async (t) => {
    const {minimumIndex: _index, ...withoutIndex} = VALID;
    const {minimumTerm: _term, ...withoutTerm} = VALID;
    const cases = [
      ['no index floor', withoutIndex, REFUSAL.FLOOR_REQUIRED, 'minimumIndex'],
      ['no term floor', withoutTerm, REFUSAL.FLOOR_REQUIRED, 'minimumTerm'],
      ['negative index floor', {...VALID, minimumIndex: -1}, REFUSAL.FLOOR_REQUIRED,
        'minimumIndex'],
      ['fractional term floor', {...VALID, minimumTerm: 1.5}, REFUSAL.FLOOR_REQUIRED,
        'minimumTerm'],
      ['text index floor', {...VALID, minimumIndex: '7'}, REFUSAL.FLOOR_REQUIRED,
        'minimumIndex'],
      ['no statement', {...VALID, sql: ''}, REFUSAL.STATEMENT_REQUIRED, 'sql'],
      ['params not a list', {...VALID, params: null}, REFUSAL.STATEMENT_REQUIRED, 'params'],
      ['a table with no owner partition', {...VALID, tableName: 'no_such_table'},
        REFUSAL.TABLE_NOT_OWNER_READABLE, 'tableName'],
      ['half an expected replica', {...VALID, expectedReplica: {nodeId: 'node-a'}},
        REFUSAL.EXPECTED_REPLICA_MALFORMED, 'expectedReplica'],
    ];
    for (const [label, draft, code, field] of cases) {
      const reader = recordingReader();
      const refusal = await refusalOf(reader, draft);
      t.ok(refusal instanceof OwnerFactRequestRefusal, `${label}: typed refusal`);
      t.equal(refusal?.code, code, `${label}: refusal code`);
      t.equal(refusal?.field, field, `${label}: the refused field is named`);
      t.equal(reader.calls.length, 0, `${label}: no read was issued`);
    }
    const noReader = await refusalOf({read: null}, VALID);
    t.ok(noReader instanceof OwnerFactRequestRefusal, 'a missing reader port: typed refusal');
    t.equal(noReader?.code, REFUSAL.READER_REQUIRED);
  });

test('readHint: a hint is not an owner fact and cannot be read as one', async (t) => {
  const rows = [{operation_id: 'operation-1'}];
  const hint = await readHint(async () => ({success: true, rows}), {tableName: TABLE});
  t.equal(hint.state, HINT_STATE.OBSERVED);
  t.same(hint.rows, rows);
  t.equal(isOwnerFactAnswer(hint), false, 'a hint carries no owner-fact identity');
  t.throws(() => ownerFactRows(hint), 'a hint cannot be passed where an owner fact is required');
  const lookalike = {state: STATE.READY, rows: []};
  t.equal(isOwnerFactAnswer(lookalike), false, 'a shape-compatible object is not an owner fact');
  t.throws(() => ownerFactRows(lookalike), 'only an answer readOwnerFact issued yields rows');
  const unavailable = await readHint(async () => ({success: false, error: 'no projection'}),
    {tableName: TABLE});
  t.equal(unavailable.state, HINT_STATE.UNAVAILABLE, 'a failed hint read is typed, never []');
  t.equal(Object.hasOwn(unavailable, 'rows'), false);
});
