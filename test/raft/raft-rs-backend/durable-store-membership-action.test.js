// Exercise the actual durable-store read boundary. Direct SQL changes below
// deliberately corrupt this disposable record; they are not product mutations.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import Database from 'better-sqlite3';
import {RaftRsDurableStore} from '../../../src/raft/raft-rs-durable-store.js';
import {RAFT_RS_SQL, RAFT_RS_TABLE} from '../../../src/raft/raft-rs-durable-store-constants.js';
import {encodeCommittedMembershipContext} from
  '../../../src/raft/raft-rs-committed-membership-context.js';
import {RAFT_MEMBERSHIP_TRANSITION_STAGE as STAGE} from
  '../../../src/raft/raft-operation-port-constants.js';
import {deriveRaftRsPeerId} from '../../../src/raft/raft-rs-peer-identity.js';
import {RAFT_RS_CONF_CHANGE_TYPE as CHANGE} from
  '../../../src/raft/raft-rs-ready-loop-constants.js';
import {DeterministicRaftRsCluster} from './deterministic-raft-rs-cluster.js';

const GROUP = 'coherent-action-owner';
const TARGET = 'coherent-action-target';
const VOTERS = ['1', '2', '3'];
const ACTION = Object.freeze({operationId: 'coherent-action',
  transitionIdentity: 'coherent-transition',
  permitSequence: 1, stage: STAGE.ADD_LEARNER, replicaIdentity: TARGET,
  peerId: deriveRaftRsPeerId(TARGET)});

function fixture(t) {
  const c = new DeterministicRaftRsCluster({voters: VOTERS, groupId: GROUP,
    storeFactory: (db) => {
      db.pragma('journal_mode = WAL');
      db.pragma('synchronous = FULL');
      return new RaftRsDurableStore(db);
    }});
  t.after(() => c.dispose());
  assert.ok(c.campaign('1'));
  c.core.propose_conf_change_v2(c.peer('1').handle, {transition: 0,
    changes: [{changeType: CHANGE.ADD_LEARNER_NODE, nodeId: ACTION.peerId}],
    context: encodeCommittedMembershipContext(ACTION)});
  assert.ok(c.settle(() => VOTERS.every((id) => c.confState(id).learners.includes(ACTION.peerId)),
    {tickOnly: ['1']}));
  const peer = c.peer('1');
  return {c, peer, read: (group = GROUP, action = ACTION) =>
    peer.store.observeMembershipAction(group, action, c.core.decode_conf_change_entry)};
}

function unavailable(read) {
  assert.equal(read().kind, 'action-evidence-unavailable',
    'incoherent or uncommitted record must not produce action evidence');
}

test('store acquires exact same-group evidence without a persistence mutation', (t) => {
  const {peer, read} = fixture(t);
  const before = peer.store.readDurableRecord(GROUP);
  const changes = peer.db.prepare('SELECT total_changes() AS count').get().count;
  const result = read();
  assert.equal(result.kind, 'committed-action');
  assert.deepEqual(result.action, ACTION);
  assert.equal(result.groupId, GROUP);
  assert.equal(read('another-group').kind, 'action-evidence-unavailable');
  assert.equal(read(GROUP, {...ACTION, operationId: 'different-action'}).kind, 'unresolved-action');
  assert.deepEqual(peer.store.readDurableRecord(GROUP), before);
  assert.equal(peer.db.prepare('SELECT total_changes() AS count').get().count, changes);
  assert.equal(peer.db.inTransaction, false);
});

test('durable progress beyond the actual retained suffix is unavailable', (t) => {
  const {peer, read} = fixture(t);
  peer.db.prepare(`UPDATE ${RAFT_RS_TABLE.HARD_STATE} SET commit_index = 999 WHERE group_id = ?`)
    .run(GROUP);
  peer.db.prepare(`UPDATE ${RAFT_RS_TABLE.APPLIED_STATE}
    SET applied_index = 999 WHERE group_id = ?`)
    .run(GROUP);
  unavailable(read);
});

test('an unexplained interior log gap is unavailable', (t) => {
  const {peer, read} = fixture(t);
  peer.db.prepare(`UPDATE ${RAFT_RS_TABLE.LOG}
    SET log_index = 4 WHERE group_id = ? AND log_index = 2`)
    .run(GROUP);
  unavailable(read);
});

test('regressing retained entry terms are unavailable', (t) => {
  const {peer, read} = fixture(t);
  peer.db.prepare(`UPDATE ${RAFT_RS_TABLE.HARD_STATE} SET term = 3 WHERE group_id = ?`).run(GROUP);
  peer.db.prepare(`UPDATE ${RAFT_RS_TABLE.LOG} SET term = 3 WHERE group_id = ? AND log_index = 1`)
    .run(GROUP);
  unavailable(read);
});

test('the outcome reader refuses an already-open transaction and keeps its writes untouched',
  (t) => {
    const {peer, read} = fixture(t);
    peer.db.transaction(() => {
      assert.equal(peer.db.inTransaction, true);
      unavailable(read);
      assert.equal(peer.db.inTransaction, true, 'reader cannot commit its caller transaction');
    })();
    assert.equal(read().kind, 'committed-action');
  });

test('a coherent snapshot-covered prefix may be absent; no receipt is invented', (t) => {
  const {peer, read} = fixture(t);
  const receipt = read();
  const record = peer.store.readDurableRecord(GROUP);
  peer.store.putSnapshot(GROUP, {metadata: {index: receipt.index, term: receipt.term,
    confState: record.confState, membershipGenerationIndex: record.membershipGenerationIndex}});
  assert.equal(read().kind, 'unresolved-action', 'covered residual entries do not create receipts');
  peer.db.prepare(`DELETE FROM ${RAFT_RS_TABLE.LOG} WHERE group_id = ? AND log_index <= ?`)
    .run(GROUP, BigInt(receipt.index));
  assert.equal(peer.store.readDurableRecord(GROUP).entries.length, 0);
  assert.equal(read().kind, 'unresolved-action',
    'snapshot coverage permits pruning, not inference');
  // An active suffix cannot skip an index even after a legitimate snapshot cut.
  peer.store.appendEntries(GROUP, [{index: String(BigInt(receipt.index) + 2n),
    term: receipt.term, entryType: 0}]);
  unavailable(read);
});

test('a peer of the same action on another replica reconstructs the same durable evidence', (t) => {
  const {c, read} = fixture(t);
  const expected = read();
  const previous = c.peer('2').db;
  c.crash('2');
  assert.equal(previous.open, false);
  c.restart('2');
  assert.equal(c.peer('2').db === previous, false);
  assert.deepEqual(c.peer('2').store.observeMembershipAction(GROUP, ACTION,
    c.core.decode_conf_change_entry), expected);
});

test('all record tables belong to one SQL snapshot despite an intervening committed writer',
  (t) => {
    const {peer, read} = fixture(t);
    const writer = new Database(peer.dbFile);
    t.after(() => writer.close());
    const prepare = peer.db.prepare.bind(peer.db);
    let interleaved = 0;
    peer.db.prepare = (sql) => {
      const statement = prepare(sql);
      if (sql !== RAFT_RS_SQL.SELECT_HARD_STATE) return statement;
      const get = statement.get.bind(statement);
      statement.get = (...params) => {
        const row = get(...params);
        writer.transaction(() => {
          writer.prepare(`UPDATE ${RAFT_RS_TABLE.HARD_STATE}
          SET commit_index = 999 WHERE group_id = ?`)
            .run(GROUP);
          writer.prepare(`UPDATE ${RAFT_RS_TABLE.APPLIED_STATE}
          SET applied_index = 999 WHERE group_id = ?`)
            .run(GROUP);
        })();
        interleaved += 1;
        return row;
      };
      return statement;
    };
    try {
      assert.equal(read().kind, 'committed-action',
        'one snapshot must exclude the intervening write');
      assert.equal(interleaved, 1, 'the competing writer must actually commit between table reads');
    } finally {
      peer.db.prepare = prepare;
    }
    unavailable(read);
  });
