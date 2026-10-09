/** Existing store's coherent action-read boundary; no workflow or CREATE.
 * Record damage and concurrent connection updates are deliberate fixture actions.
 * Snapshot rows below are storage views, not native snapshot-install proof.
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import Database from 'better-sqlite3';
import {refuseUnderProbe} from '../../../src/test-helpers/probe-guard.js';
import {RaftRsDurableStore} from '../../../src/raft/raft-rs-durable-store.js';
import {RAFT_RS_SQL, RAFT_RS_TABLE} from
  '../../../src/raft/raft-rs-durable-store-constants.js';
import {encodeCommittedMembershipContext, MEMBERSHIP_ACTION_OBSERVATION as OUTCOME,
  MEMBERSHIP_ACTION_EVIDENCE_REASON as REASON} from
  '../../../src/raft/raft-rs-committed-membership-context.js';
import {deriveRaftRsPeerId} from '../../../src/raft/raft-rs-peer-identity.js';
import {RAFT_MEMBERSHIP_TRANSITION_STAGE as STAGE} from
  '../../../src/raft/raft-operation-port-constants.js';
import {RAFT_RS_CONF_CHANGE_TYPE as CHANGE} from
  '../../../src/raft/raft-rs-ready-loop-constants.js';
import {DeterministicRaftRsCluster} from './deterministic-raft-rs-cluster.js';

refuseUnderProbe('the issued-action durable-read fixture');
const GROUP = 'owned-action-read';
const VOTERS = ['1', '2', '3'];
const TARGET = 'owned-read-target';
const ACTION = Object.freeze({operationId: 'owned-read-operation',
  transitionIdentity: 'owned-read-transition', permitSequence: 1,
  stage: STAGE.ADD_LEARNER, replicaIdentity: TARGET, peerId: deriveRaftRsPeerId(TARGET)});

function fixture(t) {
  const cluster = new DeterministicRaftRsCluster({groupId: GROUP, voters: VOTERS,
    storeFactory: (db) => {
      db.pragma('journal_mode = WAL');
      db.pragma('synchronous = FULL');
      assert.equal(db.pragma('journal_mode', {simple: true}), 'wal');
      assert.equal(db.pragma('synchronous', {simple: true}), 2);
      return new RaftRsDurableStore(db);
    }});
  t.after(() => cluster.dispose());
  assert.ok(cluster.campaign('1'));
  assert.ok(cluster.settle(() => VOTERS.every((id) =>
    BigInt(cluster.peer(id).store.readDurableRecord(GROUP).appliedIndex) > 0n),
  {tickOnly: ['1']}));
  const peer = cluster.peer('1');
  const beforeAdd = peer.store.readDurableRecord(GROUP);
  cluster.core.propose_conf_change_v2(peer.handle, {transition: 0,
    changes: [{changeType: CHANGE.ADD_LEARNER_NODE, nodeId: ACTION.peerId}],
    context: encodeCommittedMembershipContext(ACTION)});
  assert.ok(cluster.settle(() => VOTERS.every((id) =>
    cluster.confState(id).learners.includes(ACTION.peerId)), {tickOnly: ['1']}));
  const read = (group = GROUP, action = ACTION) =>
    peer.store.readMembershipActionEvidence(group, action, cluster.core.decode_conf_change_entry);
  assert.equal(typeof peer.store.readMembershipActionEvidence, 'function',
    'the existing durable store must own coherent action observation');
  assert.equal(read().kind, OUTCOME.COMMITTED);
  return {cluster, peer, read, beforeAdd, good: peer.store.readDurableRecord(GROUP)};
}

function unavailable(read, message) {
  assert.equal(read().kind, OUTCOME.UNAVAILABLE, message);
}

test('owner-selected action read is read-only and bound to the requested stored group', (t) => {
  const {peer, read} = fixture(t);
  const before = peer.db.prepare('SELECT total_changes() AS n').get().n;
  const journal = peer.store.writesMade();
  const evidence = read();
  assert.deepEqual(evidence.action, ACTION);
  assert.equal(evidence.groupId, GROUP);
  assert.equal(evidence.index, '2');
  assert.equal(read('unrelated-group').kind, OUTCOME.UNAVAILABLE,
    'a caller group label cannot relabel a different group record');
  assert.equal(read(GROUP, {...ACTION, operationId: 'wrong-operation'}).kind, OUTCOME.UNRESOLVED);
  assert.equal(peer.db.prepare('SELECT total_changes() AS n').get().n, before);
  assert.deepEqual(peer.store.writesMade(), journal);
  assert.equal(peer.db.inTransaction, false);
});

test('applied and committed beyond retained history cannot produce evidence', (t) => {
  const {peer, read} = fixture(t);
  peer.db.prepare(`UPDATE ${RAFT_RS_TABLE.HARD_STATE} SET commit_index = 999
    WHERE group_id = ?`).run(GROUP);
  peer.db.prepare(`UPDATE ${RAFT_RS_TABLE.APPLIED_STATE} SET applied_index = 999
    WHERE group_id = ?`).run(GROUP);
  unavailable(read, 'the store must refuse progress beyond its retained suffix');
});

test('an interior gap in the complete retained suffix cannot produce evidence', (t) => {
  const {peer, read} = fixture(t);
  peer.db.prepare(`UPDATE ${RAFT_RS_TABLE.LOG} SET log_index = 4
    WHERE group_id = ? AND log_index = 2`).run(GROUP);
  peer.db.prepare(`UPDATE ${RAFT_RS_TABLE.HARD_STATE} SET commit_index = 4
    WHERE group_id = ?`).run(GROUP);
  peer.db.prepare(`UPDATE ${RAFT_RS_TABLE.APPLIED_STATE} SET applied_index = 4
    WHERE group_id = ?`).run(GROUP);
  unavailable(read, 'the store must refuse an unexplained interior log gap');
});

test('decreasing retained terms cannot produce evidence', (t) => {
  const {peer, read} = fixture(t);
  peer.db.prepare(`UPDATE ${RAFT_RS_TABLE.HARD_STATE} SET term = 3
    WHERE group_id = ?`).run(GROUP);
  peer.db.prepare(`UPDATE ${RAFT_RS_TABLE.LOG} SET term = 3
    WHERE group_id = ? AND log_index = 1`).run(GROUP);
  unavailable(read, 'the store must refuse decreasing terms across increasing indices');
});

test('a snapshot-anchored compacted prefix is supported without fabricating covered receipts',
  (t) => {
    const {peer, read, good, beforeAdd} = fixture(t);
    peer.store.putSnapshot(GROUP, {metadata: {index: '1', term: '1',
      confState: beforeAdd.confState}});
    peer.db.prepare(`DELETE FROM ${RAFT_RS_TABLE.LOG}
    WHERE group_id = ? AND log_index <= 1`).run(GROUP);
    assert.equal(read().kind, OUTCOME.COMMITTED,
      'a complete post-snapshot suffix must remain supported');
    peer.store.putSnapshot(GROUP, {metadata: {index: '2', term: '1',
      confState: good.confState}});
    assert.equal(read().kind, OUTCOME.UNRESOLVED,
      'covered residual bytes are not snapshot provenance');
    peer.db.prepare(`DELETE FROM ${RAFT_RS_TABLE.LOG} WHERE group_id = ?`).run(GROUP);
    assert.equal(read().kind, OUTCOME.UNRESOLVED,
      'a snapshot-only record is coherent but lacks the original action provenance');
  });

test('a pruned prefix without a snapshot and an impossible snapshot boundary are refused', (t) => {
  const {peer, read} = fixture(t);
  peer.db.prepare(`DELETE FROM ${RAFT_RS_TABLE.LOG}
    WHERE group_id = ? AND log_index = 1`).run(GROUP);
  unavailable(read, 'missing history without a snapshot anchor must remain unavailable');
  // Deliberately bypass snapshot-write validation to exercise corrupted disk input.
  peer.store.putSnapshot(GROUP, {metadata: {index: '1', term: '1', confState: {}}});
  peer.db.prepare(`UPDATE ${RAFT_RS_TABLE.SNAPSHOT} SET snapshot_term = 9
    WHERE group_id = ?`).run(GROUP);
  unavailable(read, 'an impossible snapshot term must not anchor a positive read');
});

test('action reads refuse both caller and store-owned uncommitted transactions', (t) => {
  const {peer, read} = fixture(t);
  let nestedAttempts = 0;
  const transaction = peer.db.transaction.bind(peer.db);
  const check = () => {
    peer.db.transaction = (...args) => {
      nestedAttempts += 1; return transaction(...args);
    };
    try {
      assert.equal(peer.db.inTransaction, true);
      assert.deepEqual(read(), {kind: OUTCOME.UNAVAILABLE, reason: REASON.TRANSACTION_OPEN},
        'an uncommitted view must not be labeled durable');
      assert.equal(nestedAttempts, 0, 'action read must not enter a nested transaction');
      assert.equal(peer.db.inTransaction, true, 'caller transaction remains untouched');
    } finally {
      peer.db.transaction = transaction;
    }
  };
  transaction(check)();
  peer.store.transaction(check);
  peer.db.exec('BEGIN');
  try {
    check();
  } finally {
    peer.db.exec('ROLLBACK');
  }
  assert.equal(read().kind, OUTCOME.COMMITTED);
});

test('one read snapshot survives a real writer commit between record SELECTs', (t) => {
  const {peer, read, good, beforeAdd} = fixture(t);
  peer.store.putAppliedState(GROUP, beforeAdd.appliedIndex, beforeAdd.confState);
  const writer = new Database(peer.dbFile);
  const prepare = peer.db.prepare.bind(peer.db);
  let engaged = 0;
  let observedReadTransaction = false;
  try {
    writer.pragma('journal_mode = WAL');
    writer.pragma('synchronous = FULL');
    const writerStore = new RaftRsDurableStore(writer);
    peer.db.prepare = (sql) => {
      const statement = prepare(sql);
      if (sql !== RAFT_RS_SQL.SELECT_HARD_STATE) return statement;
      const get = statement.get.bind(statement);
      statement.get = (...args) => {
        const row = get(...args);
        if (engaged === 0) {
          observedReadTransaction = peer.db.inTransaction;
          writerStore.putAppliedState(GROUP, good.appliedIndex, good.confState);
          engaged += 1;
        }
        return row;
      };
      return statement;
    };
    assert.equal(read().kind, OUTCOME.UNRESOLVED,
      'later SELECTs must not incorporate the intervening writer commit');
    assert.equal(engaged, 1, 'the separate writer actually committed during the read');
    assert.equal(observedReadTransaction, true, 'the store must hold a single read transaction');
  } finally {
    peer.db.prepare = prepare;
    writer.close();
  }
  assert.equal(read().kind, OUTCOME.COMMITTED,
    'the next independent read must observe the completed writer commit');
});

test('read failures never recreate missing tables or manufacture a receipt', (t) => {
  const {peer, read, cluster} = fixture(t);
  assert.equal(peer.store.readMembershipActionEvidence(GROUP, ACTION,
    () => {
      throw new Error('decoder unavailable');
    }).kind, OUTCOME.UNAVAILABLE);
  peer.db.exec(`DROP TABLE ${RAFT_RS_TABLE.LOG}`);
  unavailable(read, 'missing evidence storage must not become a positive outcome');
  assert.equal(peer.db.prepare('SELECT name FROM sqlite_master WHERE type = \'table\' ' +
    'AND name = ?').get(RAFT_RS_TABLE.LOG), undefined);
  assert.equal(cluster.peer('1').live, true,
    'the diagnostic does not pretend to repair the runtime');
});
