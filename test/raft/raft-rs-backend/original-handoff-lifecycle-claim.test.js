// R1 prerequisite: one exact-runtime lifecycle participation claim, not a
// second mutex. Full registered activation and public startup are not invoked.
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {createRaftRsOperationPort} from '../../../src/raft/raft-rs-operation-port.js';
import {genesisStamp} from '../../../src/raft/raft-committed-membership-stamp.js';
import {raftRsLifecycleAdministration as administration} from
  '../../../src/raft/raft-rs-lifecycle-administration.js';

const GROUP = 'original-claim-group';
const REPLICA = 'original-claim-replica';
const TIMING = Object.freeze({heartbeatMs: 50, electionMinMs: 150,
  electionMaxMs: 300, tickIntervalMs: 10});
const deferred = () => Promise.withResolvers();

function generation(t) {
  const db = new Database(':memory:');
  const port = createRaftRsOperationPort({groupId: GROUP, peerId: REPLICA,
    peerAddress: 'local-replica', durableStorage: db, timing: TIMING,
    bootstrapPeerIds: [REPLICA], bootstrapMembership: genesisStamp([REPLICA]),
    resolvePeerAddress: () => 'local-replica', sendToPeer: () => {},
    applyCommittedEntry: () => {}, deferElection: true});
  const request = Object.freeze({runtime: port, groupId: GROUP,
    replicaIdentity: REPLICA, incarnation: port.readStatus().lifecycleIncarnation});
  t.after(() => {
    port.close();
    if (db.open) db.close();
  });
  return {db, port, request};
}

function refused(reason) {
  return (error) => error.code === 'REPLICA_LIFECYCLE_CLAIM_REFUSED' &&
    error.lifecycle.reason === reason;
}

function retire(generation) {
  return administration.retireReplica(REPLICA, 'original-claim-test', {
    groupId: GROUP, runtime: generation.port});
}

test('claim holds retirement through awaited effects and permits native progress', async (t) => {
  const g = generation(t);
  const release = deferred();
  const entered = deferred();
  let assertCurrent;
  const work = administration.withReplicaLifecycleClaim(g.request, async (check) => {
    assertCurrent = check;
    check();
    assert.equal(g.port.tick().outcome, 'CORE_OK', 'participation claim is not a native mutex');
    entered.resolve();
    await release.promise;
    return 'settled';
  });
  await entered.promise;
  let retired = false;
  const retirement = retire(g).then((result) => {
    retired = true;
    return result;
  });
  await Promise.resolve();
  assert.equal(retired, false, 'durable retirement waits for the admitted effect');
  assert.throws(assertCurrent, refused('retired'), 'pending retirement closes new effects');
  release.resolve();
  assert.equal(await work, 'settled');
  assert.equal((await retirement).outcome, 'CORE_OK');
  assert.equal(retired, true);
});

test('a settled check cannot lend authority to a later callback', async (t) => {
  const g = generation(t);
  let retained;
  const result = await administration.withReplicaLifecycleClaim(g.request, (check) => {
    retained = check;
    check();
    return 42;
  });
  assert.equal(result, 42);
  assert.equal(g.port.readStatus().outcome, 'CORE_OK');
  assert.throws(retained, refused('lifecycle-claim-settled'));
});

test('synchronous throws and asynchronous rejections release the existing claim', async (t) => {
  for (const asynchronous of [false, true]) {
    await t.test(asynchronous ? 'rejection' : 'throw', async (t) => {
      const g = generation(t);
      const primary = new Error('handoff write failed');
      await assert.rejects(administration.withReplicaLifecycleClaim(g.request, () => {
        if (asynchronous) return Promise.reject(primary);
        throw primary;
      }), (error) => error === primary);
      assert.equal((await retire(g)).outcome, 'CORE_OK');
    });
  }
});

test('missing or mismatched runtime generation never invokes work', async (t) => {
  const g = generation(t);
  for (const [name, override, reason] of [
    ['unregistered', {runtime: Object.freeze({})}, 'runtime-generation-not-registered'],
    ['wrong group', {groupId: 'other-group'}, 'lifecycle-identity-mismatch'],
    ['wrong replica', {replicaIdentity: 'other-replica'}, 'lifecycle-identity-mismatch'],
    ['wrong incarnation', {incarnation: 'replacement'}, 'lifecycle-identity-mismatch'],
    ['missing incarnation', {incarnation: undefined}, 'lifecycle-identity-mismatch'],
  ]) {
    await t.test(name, async () => {
      let called = false;
      await assert.rejects(
        administration.withReplicaLifecycleClaim({...g.request, ...override}, () => {
          called = true;
        }),
        refused(reason));
      assert.equal(called, false);
    });
  }
});

test('claim after native retirement is refused without work', async (t) => {
  const g = generation(t);
  await retire(g);
  let called = false;
  await assert.rejects(administration.withReplicaLifecycleClaim(g.request, () => {
    called = true;
  }), refused('retired'));
  assert.equal(called, false);
});

test('closing the captured runtime never retargets an admitted claim to its successor', async (t) => {
  const old = generation(t);
  const successor = generation(t);
  let retained;
  await administration.withReplicaLifecycleClaim(old.request, (check) => {
    retained = check;
    old.port.close();
    assert.throws(check, refused('runtime-generation-not-registered'));
    assert.equal(successor.port.readStatus().outcome, 'CORE_OK');
  });
  assert.throws(retained, refused('lifecycle-claim-settled'));
  assert.equal(successor.port.readStatus().outcome, 'CORE_OK');
});

test('multiple admitted effects independently retain retirement debt', async (t) => {
  const g = generation(t);
  const first = deferred();
  const second = deferred();
  const a = administration.withReplicaLifecycleClaim(g.request, () => first.promise);
  const b = administration.withReplicaLifecycleClaim(g.request, () => second.promise);
  let retired = false;
  const retirement = retire(g).then((result) => {
    retired = true;
    return result;
  });
  first.resolve();
  await a;
  assert.equal(retired, false, 'one settled effect does not discard the other claim');
  second.resolve();
  await b;
  assert.equal((await retirement).outcome, 'CORE_OK');
});
