// Row-storage witnesses, not original-seed issuance or native recovery proof.
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {test} from '../../src/test-helpers/tap.js';
import {prepareOriginalAllocationRow, markOriginalAllocationIssued,
  transitionOriginalRight} from '../../src/raft/raft-rs-original-allocation-store.js';
import {ORIGINAL_ALLOCATION as STATE, ORIGINAL_ALLOCATION_REASON as REASON,
  ORIGINAL_ALLOCATION_COLUMN as COLUMN, REPLICA_LIFECYCLE_TABLE as TABLE} from
  '../../src/raft/raft-rs-original-allocation-constants.js';
import {RAFT_RS_OPENING_HISTORY} from
  '../../src/raft/raft-rs-opening-history-constants.js';

function fixture(t, {anchor = true, issue = true, beforePrepare = null} = {}) {
  const db = new Database(':memory:');
  t.teardown(() => db.close());
  // Minimal local lifecycle-row fixture; it never authorizes native entry.
  db.exec(`CREATE TABLE ${TABLE} (
    group_id TEXT, peer_id TEXT, replica_identity TEXT, incarnation TEXT,
    state TEXT, native_history_state TEXT,
    PRIMARY KEY (group_id, peer_id, replica_identity))`);
  const member = {groupId: 'group-a', peerId: '1', replicaId: 'replica-a',
    incarnation: 'incarnation-a', createAttemptToken: 'birth-a', createdAt: 100};
  const declaration = {allocationId: 'allocation-a',
    anchorReplicaId: anchor ? member.replicaId : 'another-replica', members: [member]};
  db.prepare(`INSERT INTO ${TABLE} VALUES (?, ?, ?, ?, ?, ?)`).run(
    member.groupId, member.peerId, member.replicaId, member.incarnation,
    'active', RAFT_RS_OPENING_HISTORY.NEVER_OPENED);
  beforePrepare?.(db);
  prepareOriginalAllocationRow(db, declaration, member);
  if (anchor && issue) markOriginalAllocationIssued(db, declaration, member);
  return {db, member, declaration};
}

function row(db) {
  return db.prepare(`SELECT * FROM ${TABLE}`).get();
}

function hold(reason) {
  return (error) => error.code === STATE.HOLD && error.reason === reason;
}

function advance(db, member, column, state) {
  if (state === STATE.UNUSED) return;
  transitionOriginalRight(db, member, column, STATE.UNUSED, STATE.SUBMITTED);
  if (state === STATE.TRANSFERRED) {
    transitionOriginalRight(db, member, column, STATE.SUBMITTED, STATE.TRANSFERRED);
  }
}

for (const column of [COLUMN.SERVICE_RIGHT, COLUMN.IDENTITY_RIGHT]) {
  test(`original allocation store consumes ${column} monotonically`, async (t) => {
    const {db, member} = fixture(t);
    const before = row(db);
    advance(db, member, column, STATE.TRANSFERRED);
    assert.deepEqual(row(db), {...before, [column]: STATE.TRANSFERRED});
  });

  const forbidden = [
    [STATE.UNUSED, STATE.UNUSED],
    [STATE.UNUSED, STATE.TRANSFERRED],
    [STATE.SUBMITTED, STATE.UNUSED],
    [STATE.SUBMITTED, STATE.SUBMITTED],
    [STATE.TRANSFERRED, STATE.UNUSED],
    [STATE.TRANSFERRED, STATE.SUBMITTED],
    [STATE.TRANSFERRED, STATE.TRANSFERRED],
    [STATE.UNUSED, null],
    [STATE.UNUSED, 'unknown-state'],
  ];
  for (const [from, to] of forbidden) {
    test(`original allocation store refuses ${column} ${from} -> ${to}`, async (t) => {
      const {db, member} = fixture(t);
      advance(db, member, column, from);
      const before = row(db);
      assert.throws(() => transitionOriginalRight(db, member, column, from, to),
        hold(REASON.SPENT));
      assert.deepEqual(row(db), before);
    });
  }
}

test('original allocation store does not grant a non-anchor identity right', async (t) => {
  const {db, member} = fixture(t, {anchor: false});
  const before = row(db);
  assert.equal(before[COLUMN.IDENTITY_RIGHT], null);
  assert.throws(() => transitionOriginalRight(db, member, COLUMN.IDENTITY_RIGHT,
    null, STATE.UNUSED), hold(REASON.SPENT));
  assert.deepEqual(row(db), before);
});

test('original allocation store rejects a mismatched expected right', async (t) => {
  const {db, member} = fixture(t);
  const before = row(db);
  assert.throws(() => transitionOriginalRight(db, member, COLUMN.SERVICE_RIGHT,
    STATE.SUBMITTED, STATE.TRANSFERRED), hold(REASON.SPENT));
  assert.deepEqual(row(db), before);
});

test('original allocation store binds transitions to the exact reserved birth', async (t) => {
  const {db, member} = fixture(t);
  const before = row(db);
  assert.throws(() => transitionOriginalRight(db,
    {...member, createAttemptToken: 'foreign-birth'}, COLUMN.SERVICE_RIGHT,
    STATE.UNUSED, STATE.SUBMITTED), hold(REASON.IDENTITY));
  assert.deepEqual(row(db), before);
});

test('original allocation store cannot mistake foreign issuance for its readback', async (t) => {
  const {db, member, declaration} = fixture(t);
  const before = row(db);
  assert.throws(() => markOriginalAllocationIssued(db,
    {...declaration, allocationId: 'foreign-allocation'}, member),
  hold(REASON.INCOMPLETE));
  assert.deepEqual(row(db), before);
});

test('original allocation store cannot issue a member as a different anchor', async (t) => {
  const {db, member, declaration} = fixture(t, {anchor: false});
  const before = row(db);
  assert.throws(() => markOriginalAllocationIssued(db, declaration, member),
    hold(REASON.IDENTITY));
  assert.deepEqual(row(db), before);
});

function faultingCommit(db, {beforeCommit, beforeWork, afterCommit, afterReadback} = {}) {
  let committed = false;
  return new Proxy(db, {
    get(target, key) {
      if (key === 'transaction') return (work) => () => {
        if (beforeCommit) throw beforeCommit;
        beforeWork?.();
        const result = target.transaction(work)();
        committed = true;
        if (afterCommit) throw afterCommit;
        return result;
      };
      if (key === 'prepare') return (sql) => {
        if (committed && afterReadback) throw afterReadback;
        return target.prepare(sql);
      };
      const value = Reflect.get(target, key, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

test('original allocation store resolves a lost COMMIT answer without a second submission', async (t) => {
  const {db, member} = fixture(t);
  const fault = new Error('lost COMMIT answer');
  transitionOriginalRight(faultingCommit(db, {afterCommit: fault}), member,
    COLUMN.SERVICE_RIGHT, STATE.UNUSED, STATE.SUBMITTED);
  assert.equal(row(db)[COLUMN.SERVICE_RIGHT], STATE.SUBMITTED);
  assert.throws(() => transitionOriginalRight(db, member, COLUMN.SERVICE_RIGHT,
    STATE.UNUSED, STATE.SUBMITTED), hold(REASON.SPENT));
  assert.equal(row(db)[COLUMN.SERVICE_RIGHT], STATE.SUBMITTED);
});

test('original allocation store preserves unknown committed debt when readback fails', async (t) => {
  const {db, member} = fixture(t);
  const commitFailure = new Error('lost COMMIT answer');
  const observationFailure = new Error('unreadable committed row');
  assert.throws(() => transitionOriginalRight(faultingCommit(db, {
    afterCommit: commitFailure, afterReadback: observationFailure,
  }), member, COLUMN.SERVICE_RIGHT, STATE.UNUSED, STATE.SUBMITTED), (error) => {
    assert.ok(error instanceof AggregateError);
    assert.deepEqual(error.errors, [commitFailure, observationFailure]);
    return true;
  });
  assert.equal(row(db)[COLUMN.SERVICE_RIGHT], STATE.SUBMITTED);
});

test('original allocation store does not grant success after a pre-COMMIT failure', async (t) => {
  const {db, member} = fixture(t);
  const failure = new Error('transaction refused before work');
  assert.throws(() => transitionOriginalRight(faultingCommit(db,
    {beforeCommit: failure}), member, COLUMN.SERVICE_RIGHT,
  STATE.UNUSED, STATE.SUBMITTED), (error) => {
    assert.ok(error instanceof AggregateError);
    assert.equal(error.errors[0], failure);
    assert.equal(error.errors[1].reason, REASON.INCOMPLETE);
    return true;
  });
  assert.equal(row(db)[COLUMN.SERVICE_RIGHT], STATE.UNUSED);
});


test('original allocation store accepts only an exact idempotent issuance readback', async (t) => {
  const {db, member, declaration} = fixture(t);
  const before = row(db);
  markOriginalAllocationIssued(db, declaration, member);
  assert.deepEqual(row(db), before);
});

test('original allocation store cannot reissue after native opening', async (t) => {
  const {db, member, declaration} = fixture(t);
  db.prepare(`UPDATE ${TABLE} SET native_history_state = ?`)
    .run(RAFT_RS_OPENING_HISTORY.ESTABLISHED);
  const before = row(db);
  assert.throws(() => markOriginalAllocationIssued(db, declaration, member),
    hold(REASON.INCOMPLETE));
  assert.deepEqual(row(db), before);
});

test('original allocation store refuses a declaration replaced after observation', async (t) => {
  const {db, member, declaration} = fixture(t);
  const foreign = JSON.stringify({...declaration, allocationId: 'replacement-allocation'});
  const observed = faultingCommit(db, {beforeWork: () => {
    db.prepare(`UPDATE ${TABLE} SET ${COLUMN.DECLARATION} = ?`).run(foreign);
  }});
  assert.throws(() => transitionOriginalRight(observed, member, COLUMN.SERVICE_RIGHT,
    STATE.UNUSED, STATE.SUBMITTED), hold(REASON.INCOMPLETE));
  assert.equal(row(db)[COLUMN.DECLARATION], foreign);
  assert.equal(row(db)[COLUMN.SERVICE_RIGHT], STATE.UNUSED);
});

test('original allocation store verifies the prepared identity right in actual readback', async (t) => {
  let database;
  assert.throws(() => fixture(t, {issue: false, beforePrepare: (db) => {
    database = db;
    for (const column of Object.values(COLUMN)) {
      db.exec(`ALTER TABLE ${TABLE} ADD COLUMN ${column} TEXT`);
    }
    // Deliberately corrupt the committed result, not the write's return value.
    db.exec(`CREATE TRIGGER corrupt_identity AFTER UPDATE OF ${COLUMN.DECLARATION}
      ON ${TABLE} BEGIN UPDATE ${TABLE} SET ${COLUMN.IDENTITY_RIGHT} = NULL
      WHERE group_id = NEW.group_id AND peer_id = NEW.peer_id
        AND replica_identity = NEW.replica_identity; END`);
  }}), hold(REASON.INCOMPLETE));
  assert.equal(row(database)[COLUMN.ISSUE], STATE.PREPARING);
  assert.equal(row(database)[COLUMN.IDENTITY_RIGHT], null);
});

test('original allocation store rejects a non-right column without changing the row', async (t) => {
  const {db, member} = fixture(t);
  const before = row(db);
  assert.throws(() => transitionOriginalRight(db, member, COLUMN.DECLARATION,
    STATE.UNUSED, STATE.SUBMITTED), hold(REASON.IDENTITY));
  assert.deepEqual(row(db), before);
});
