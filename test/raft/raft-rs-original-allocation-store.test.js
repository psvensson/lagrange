// The original-allocation fields of a founder's lifecycle row and their rights
// transitions, written only by the lifecycle owner's named operations (owner
// decision 2026-10-26, Q3; formerly the separate original-allocation store).
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {prepareReplicaLifecycleForOriginalAllocation, readOriginalAllocationRow,
  prepareOriginalAllocationRow, markOriginalAllocationIssued, transitionOriginalRight} from
  '../../src/raft/raft-rs-replica-lifecycle-owner.js';
import {ORIGINAL_ALLOCATION as STATE, ORIGINAL_ALLOCATION_REASON as REASON,
  isOriginalAllocationHold,
  ORIGINAL_ALLOCATION_COLUMN as COLUMN} from
  '../../src/raft/raft-rs-original-allocation-constants.js';
import {REPLICA_LIFECYCLE_TABLE as TABLE} from
  '../../src/raft/raft-rs-replica-lifecycle-constants.js';
import {RAFT_RS_OPENING_HISTORY as HISTORY} from
  '../../src/raft/raft-rs-opening-history-constants.js';

function fixture(t) {
  const db = new Database(':memory:');
  t.after(() => db.close());
  const identity = {groupId: 'original-group', peerId: '1', replicaId: 'original-replica'};
  // The owner births the row and mints the stamp; the member carries it.
  const born = db.transaction(() => prepareReplicaLifecycleForOriginalAllocation({db,
    groupId: identity.groupId, peerId: identity.peerId,
    replicaIdentity: identity.replicaId}))();
  const member = Object.freeze({...identity, incarnation: born.detail.incarnation,
    createdAt: 17, createAttemptToken: 'original-attempt'});
  const declaration = Object.freeze({allocationId: 'original-allocation',
    anchorReplicaId: member.replicaId, members: [member]});
  prepareOriginalAllocationRow({db, declaration, member});
  const row = () => readOriginalAllocationRow({db, member});
  return {db, member, declaration, row};
}

// Positional shorthands for the owner's request-object operations.
function move(db, member, right, from, to) {
  return transitionOriginalRight({db, member, right, from, to});
}

function issue(db, declaration, anchor) {
  return markOriginalAllocationIssued({db, declaration, anchor});
}

function hold(reason) {
  return (error) => isOriginalAllocationHold(error, reason);
}

const RIGHTS = [COLUMN.SERVICE_RIGHT, COLUMN.IDENTITY_RIGHT];
const INVALID_TRANSITIONS = [
  [STATE.UNUSED, STATE.UNUSED], [STATE.UNUSED, STATE.TRANSFERRED],
  [STATE.SUBMITTED, STATE.UNUSED], [STATE.SUBMITTED, STATE.SUBMITTED],
  [STATE.TRANSFERRED, STATE.UNUSED], [STATE.TRANSFERRED, STATE.SUBMITTED],
  [STATE.TRANSFERRED, STATE.TRANSFERRED], [null, STATE.UNUSED],
  ['unrecognized', STATE.UNUSED], [STATE.UNUSED, 'unrecognized'],
  ['toString', STATE.SUBMITTED],
];

for (const column of RIGHTS) {
  test(`${column}: one durable submission and one transfer`, (t) => {
    const {db, member, row} = fixture(t);
    move(db, member, column, STATE.UNUSED, STATE.SUBMITTED);
    assert.equal(row()[column], STATE.SUBMITTED);
    assert.throws(() => move(db, member, column,
      STATE.UNUSED, STATE.SUBMITTED), hold(REASON.SPENT));
    move(db, member, column, STATE.SUBMITTED, STATE.TRANSFERRED);
    assert.equal(row()[column], STATE.TRANSFERRED);
  });
  for (const [from, to] of INVALID_TRANSITIONS) {
    test(`${column}: refuses ${from} -> ${to} without a write`, (t) => {
      const {db, member, row} = fixture(t);
      db.prepare(`UPDATE ${TABLE} SET ${column} = ?`).run(from);
      const before = row();
      const changes = () => db.prepare('SELECT total_changes() AS n').get().n;
      const count = changes();
      assert.throws(() => move(db, member, column, from, to),
        hold(REASON.TRANSITION));
      assert.deepEqual(row(), before);
      assert.equal(changes(), count);
    });
  }
}

test('changed reserved birth is not the original member', (t) => {
  const {db, member, row} = fixture(t);
  const forged = {...member, createAttemptToken: 'different-attempt'};
  assert.throws(() => move(db, forged, COLUMN.SERVICE_RIGHT,
    STATE.UNUSED, STATE.SUBMITTED), hold(REASON.IDENTITY));
  assert.equal(row()[COLUMN.SERVICE_RIGHT], STATE.UNUSED);
});

test('retirement cannot be bypassed by an original right', (t) => {
  const {db, member} = fixture(t);
  db.prepare(`UPDATE ${TABLE} SET state = 'retired'`).run();
  assert.throws(() => move(db, member, COLUMN.SERVICE_RIGHT,
    STATE.UNUSED, STATE.SUBMITTED), hold(REASON.IDENTITY));
  assert.equal(db.prepare(`SELECT ${COLUMN.SERVICE_RIGHT} AS right FROM ${TABLE}`)
    .get().right, STATE.UNUSED);
});

test('a non-right column cannot be selected for transition', (t) => {
  const {db, member, row} = fixture(t);
  assert.throws(() => move(db, member, COLUMN.ISSUE,
    STATE.UNUSED, STATE.SUBMITTED), hold(REASON.IDENTITY));
  assert.equal(row()[COLUMN.ISSUE], STATE.PREPARING);
});

test('issuance reads back the exact original declaration', (t) => {
  const {db, member, declaration, row} = fixture(t);
  issue(db, declaration, member);
  const other = {...declaration, allocationId: 'foreign-allocation'};
  assert.throws(() => issue(db, other, member),
    hold(REASON.INCOMPLETE));
  assert.equal(row()[COLUMN.DECLARATION], JSON.stringify(declaration));
  assert.equal(row()[COLUMN.ISSUE], STATE.ISSUED);
});

test('issuance refuses an anchor with native history before changing ISSUE', (t) => {
  const {db, member, declaration, row} = fixture(t);
  db.prepare(`UPDATE ${TABLE} SET native_history_state = ?`).run(HISTORY.ESTABLISHED);
  assert.throws(() => issue(db, declaration, member),
    hold(REASON.INCOMPLETE));
  assert.equal(row()[COLUMN.ISSUE], STATE.PREPARING);
});

test('issuance refuses a consumed right before changing ISSUE', (t) => {
  const {db, member, declaration, row} = fixture(t);
  move(db, member, COLUMN.SERVICE_RIGHT, STATE.UNUSED, STATE.SUBMITTED);
  assert.throws(() => issue(db, declaration, member),
    hold(REASON.INCOMPLETE));
  assert.equal(row()[COLUMN.ISSUE], STATE.PREPARING);
});

test('throw after actual COMMIT is resolved by exact readback, not resubmission', (t) => {
  const {db, member, row} = fixture(t);
  const transaction = db.transaction.bind(db);
  const lostAcknowledgement = new Error('after-commit acknowledgement lost');
  let commits = 0;
  db.transaction = (work) => () => {
    transaction(work)();
    commits++;
    assert.equal(db.inTransaction, false);
    throw lostAcknowledgement;
  };
  move(db, member, COLUMN.SERVICE_RIGHT, STATE.UNUSED, STATE.SUBMITTED);
  assert.equal(row()[COLUMN.SERVICE_RIGHT], STATE.SUBMITTED);
  assert.equal(commits, 1);
  assert.throws(() => move(db, member, COLUMN.SERVICE_RIGHT,
    STATE.UNUSED, STATE.SUBMITTED), hold(REASON.SPENT));
  assert.equal(commits, 1);
});

test('failure inside actual transaction rolls back and preserves both errors', (t) => {
  const {db, member, row} = fixture(t);
  const transaction = db.transaction.bind(db);
  const primary = new Error('fail-before-commit');
  db.transaction = (work) => transaction(() => {
    work();
    throw primary;
  });
  assert.throws(() => move(db, member, COLUMN.SERVICE_RIGHT,
    STATE.UNUSED, STATE.SUBMITTED), (error) => error instanceof AggregateError &&
      error.errors[0] === primary && error.errors[1].reason === REASON.INCOMPLETE);
  assert.equal(db.inTransaction, false);
  assert.equal(row()[COLUMN.SERVICE_RIGHT], STATE.UNUSED);
});

test('unreadable post-COMMIT observation does not restore UNUSED', (t) => {
  const {db, member, row} = fixture(t);
  const transaction = db.transaction.bind(db);
  const prepare = db.prepare.bind(db);
  const primary = new Error('lost-commit-answer');
  const unavailable = new Error('readback-unavailable');
  let committed = false;
  db.transaction = (work) => () => {
    transaction(work)();
    committed = true;
    throw primary;
  };
  db.prepare = (sql) => {
    // The owner's named-column row read, never the PRAGMA or the write.
    if (committed && sql.startsWith('SELECT state, incarnation')) throw unavailable;
    return prepare(sql);
  };
  assert.throws(() => move(db, member, COLUMN.SERVICE_RIGHT,
    STATE.UNUSED, STATE.SUBMITTED), (error) => error instanceof AggregateError &&
      error.errors[0] === primary && error.errors[1] === unavailable);
  db.prepare = prepare;
  assert.equal(row()[COLUMN.SERVICE_RIGHT], STATE.SUBMITTED);
  assert.throws(() => move(db, member, COLUMN.SERVICE_RIGHT,
    STATE.UNUSED, STATE.SUBMITTED), hold(REASON.SPENT));
});

test('an uncommitted matching ISSUE row is not durable issuance evidence', (t) => {
  const {db, member, declaration, row} = fixture(t);
  db.exec('BEGIN');
  db.prepare(`UPDATE ${TABLE} SET ${COLUMN.ISSUE} = ?`).run(STATE.ISSUED);
  assert.throws(() => issue(db, declaration, member),
    (error) => error instanceof AggregateError &&
      error.errors[1].reason === REASON.OBSERVATION);
  assert.equal(db.inTransaction, true);
  db.exec('ROLLBACK');
  assert.equal(row()[COLUMN.ISSUE], STATE.PREPARING);
});
