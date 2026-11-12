// One status read resolves each peer id it names with one read of the
// peer's reservation (its identity and committed node), and shapes the same
// status byte for byte as the shape before that change (the expected JSON
// was captured from the base tree 7d4fb6f5f through its own port wiring). A
// role-and-term read answers the status read's role and term and resolves
// no peer at all.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {SQLiteConnection} from '../../src/storage/sqlite-prepared-statement-owner.js';

import {peerResolutionOf} from '../../src/raft/raft-rs-operation-port.js';
import {RaftRsPeerIdentityRegistry} from '../../src/raft/raft-rs-peer-identity.js';
import {shapeGroupObservation} from '../../src/raft/raft-rs-status-observation.js';
import {RAFT_OPERATION_OUTCOME as OUTCOME} from
  '../../src/raft/raft-operation-port-constants.js';
import {turnChainValue} from '../../src/raft/raft-rs-turn-answer.js';
import {groupOf, hostAddress, observations, reserve} from
  './raft-rs-status-shape-fixture.js';
import {historyDb, openHistory} from
  './raft-rs-backend/opening-history-native-fixture.js';
import {PartitionNodeCluster} from './raft-rs-backend/partition-node-cluster.js';

const EXPECTED = JSON.parse(fs.readFileSync(new URL(
  './raft-rs-status-shape-expected.json', import.meta.url), 'utf8'));
const IDENTITY_TABLE = 'raft_rs_peer_identity';

// The registry's reservation reads, counted on the real registry.
function countingRegistry(db) {
  const registry = new RaftRsPeerIdentityRegistry(db);
  const reads = {count: 0};
  for (const read of ['reservationOfPeerId', 'reservationFor']) {
    const real = registry[read].bind(registry);
    registry[read] = (...args) => {
      reads.count += 1;
      return real(...args);
    };
  }
  return {registry, reads};
}

// The peer ids one observation names, other than this replica's own.
function namedPeerIds(group, observation) {
  const {status, confState} = observation;
  return new Set([status.lead, ...confState.voters, ...confState.learners,
    ...status.progress.map(({id}) => id)].filter((id) =>
    id !== group.peerId || id === status.lead).map(String));
}

test('a shaped status reads each named peer once and is byte-identical to the base shape',
  () => {
    const db = new SQLiteConnection(':memory:');
    try {
      const {registry, reads} = countingRegistry(db);
      const ids = reserve(registry);
      const group = groupOf(ids, peerResolutionOf(registry, hostAddress));
      for (const [name, observation] of Object.entries(observations(ids))) {
        reads.count = 0;
        const shaped = shapeGroupObservation(group, observation,
          (error) => ({unresolved: String(error)}));
        assert.equal(JSON.stringify(shaped), EXPECTED[name], `${name}: byte-identical`);
        assert.equal(reads.count, namedPeerIds(group, observation).size,
          `${name}: one reservation read per named peer`);
      }
    } finally {
      db.close();
    }
  });

test('one reservation read gives a peer its identity and committed node', () => {
  const db = new SQLiteConnection(':memory:');
  try {
    const {registry, reads} = countingRegistry(db);
    const ids = reserve(registry);
    reads.count = 0;
    assert.deepEqual(registry.resolvePeer(ids['shape-voter']),
      {status: 'reserved', replicaIdentity: 'shape-voter', nodeId: 'node-b'});
    assert.deepEqual(registry.resolvePeer(ids['shape-no-node']),
      {status: 'reserved', replicaIdentity: 'shape-no-node', nodeId: null});
    assert.deepEqual(registry.resolvePeer(ids.unknown),
      {status: 'unreserved', replicaIdentity: null, nodeId: null});
    assert.equal(reads.count, 3);
    const {resolvePeerAddress} = peerResolutionOf(registry, hostAddress);
    reads.count = 0;
    assert.equal(resolvePeerAddress(ids['shape-voter']), 'ws://node-b/raft/shape-voter');
    assert.equal(reads.count, 1, 'an address is one reservation read');
    assert.throws(() => resolvePeerAddress(ids.unknown), /unknown raft-rs peer identity/u);
  } finally {
    db.close();
  }
});

// The real port over a database whose peer-identity statements count their
// executions.
function countingDatabase(db) {
  const executions = {count: 0};
  const counted = (statement) => new Proxy(statement, {get(target, property) {
    const value = Reflect.get(target, property, target);
    if (['get', 'all', 'run'].includes(property)) {
      return (...args) => {
        executions.count += 1;
        return value.apply(target, args);
      };
    }
    return typeof value === 'function' ? value.bind(target) : value;
  }});
  const proxy = new Proxy(db, {get(target, property) {
    if (property === 'prepare') {
      return (sql) => {
        const statement = target.prepare(sql);
        return sql.includes(IDENTITY_TABLE) ? counted(statement) : statement;
      };
    }
    const value = Reflect.get(target, property, target);
    return typeof value === 'function' ? value.bind(target) : value;
  }});
  return {proxy, executions};
}

test('the role-and-term read answers the status read\'s role and term and reads no identity',
  async (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'role-and-term-'));
    const db = historyDb(path.join(dir, 'replica.db'));
    const {proxy, executions} = countingDatabase(db);
    const port = openHistory(proxy);
    t.after(() => {
      port.close();
      db.close();
      fs.rmSync(dir, {recursive: true, force: true});
    });
    for (const phase of ['follower', 'leader']) {
      if (phase === 'leader') {
        assert.equal((await turnChainValue(port.campaign())).outcome, OUTCOME.CORE_OK);
      }
      const status = port.readStatus();
      assert.equal(status.outcome, OUTCOME.CORE_OK);
      executions.count = 0;
      const read = port.readRoleAndTerm();
      assert.deepEqual(read, {outcome: OUTCOME.CORE_OK, role: status.role,
        term: status.term}, `${phase}: the status read's role and term`);
      assert.equal(read.role, phase);
      assert.ok(Object.isFrozen(read));
      assert.equal(executions.count, 0, `${phase}: no peer identity is read`);
    }
  });

test('a leader\'s status read of a three-replica group reads each peer\'s reservation once',
  (t) => {
    const counters = new Map();
    const cluster = new PartitionNodeCluster({partitionId: 'status-peer-reads',
      replicaIds: ['spr-a', 'spr-b', 'spr-c'],
      wrapDatabase: (replicaId, db) => {
        const {proxy, executions} = countingDatabase(db);
        counters.set(replicaId, executions);
        return proxy;
      }});
    t.after(() => cluster.dispose());
    cluster.tickers = ['spr-a'];
    assert.ok(cluster.settle(() => cluster.leaderReplicaId() === 'spr-a'));
    const executions = counters.get('spr-a');
    executions.count = 0;
    const status = cluster.node('spr-a').readStatus();
    assert.equal(status.role, 'leader');
    assert.deepEqual(status.peers.map(({addressStatus}) => addressStatus),
      ['resolved', 'resolved']);
    assert.deepEqual(Object.keys(status.followerProgress).sort(), ['spr-b', 'spr-c']);
    assert.equal(executions.count, 3, 'the leader and its two peers, one read each');
    executions.count = 0;
    assert.deepEqual(cluster.node('spr-a').readRoleAndTerm(),
      {outcome: OUTCOME.CORE_OK, role: 'leader', term: status.term});
    assert.equal(executions.count, 0);
  });
