// The process-local raft-rs lifecycle registry is an exact-generation
// projection (owner decision round 4, D2; invariant I10): every destructive
// runtime effect carries the exact runtime generation it targets. Reusing a
// logical (group, replica) name opens a new runtime; delayed work that belongs
// to the old runtime can never retire, close or unregister the new one.
import assert from 'node:assert/strict';
import {test} from 'node:test';

import {raftRsLifecycleAdministration} from
  '../../../src/raft/raft-rs-lifecycle-administration.js';
import {
  raftRsMembershipAdministration,
  registerPeerIdentityReservationOwner,
} from '../../../src/raft/raft-rs-membership-administration.js';
import {
  RaftRsReplicaLifecycleOwner,
  registerRuntimeLifecycle,
  retireReplicaLifecycle,
  unregisterRuntimeLifecycle,
} from '../../../src/raft/raft-rs-replica-lifecycle-owner.js';
import {PartitionNodeCluster} from './partition-node-cluster.js';

const GROUP_ID = 'registry-generation-group';
const REPLICA_ID = 'registry-generation-replica';

// One runtime generation: its own lifecycle record store and its own handle.
function openGeneration(label) {
  const retired = [];
  const owner = new RaftRsReplicaLifecycleOwner({
    groupId: GROUP_ID,
    peerId: `peer-${label}`,
    replicaIdentity: REPLICA_ID,
    db: {
      // The members the lifecycle row's durable commit uses.
      inTransaction: false,
      pragma: () => 1,
      transaction: (work) => work,
      exec() {},
      prepare(sql) {
        return {
          all: () => [],
          get: () => undefined,
          run: () => {
            if (sql.includes('SET state = \'retired\'')) retired.push(label);
          },
        };
      },
    },
  });
  const runtime = Object.freeze({label});
  registerRuntimeLifecycle(runtime, owner);
  return {owner, runtime, retired};
}

function retire(generation, reason = 'delayed-g1-work') {
  return retireReplicaLifecycle({runtime: generation.runtime,
    groupId: GROUP_ID, replicaIdentity: REPLICA_ID, reason});
}

test('a delayed G1 retirement callback lands on G1 only; G2 stays running',
  async () => {
    const g1 = openGeneration('g1');
    // G1 retirement starts while G1 still runs work: it waits for the drain.
    let releaseWork;
    const work = g1.owner.execute(() => new Promise((resolve) => {
      releaseWork = resolve;
    }));
    const pendingRetire = retire(g1);
    // G1 teardown completes and the logical name is reused by G2.
    unregisterRuntimeLifecycle(g1.runtime, g1.owner);
    const g2 = openGeneration('g2');
    releaseWork();
    await work;
    const result = await pendingRetire;
    assert.equal(result.outcome, 'CORE_OK', 'G1 retires its own runtime');
    assert.deepEqual(g1.retired, ['g1']);
    assert.deepEqual(g2.retired, [], 'G2 is never retired by G1 work');
    assert.equal(g2.owner.active, true, 'G2 stays registered and running');
    unregisterRuntimeLifecycle(g2.runtime, g2.owner);
  });

test('duplicate, post-close and post-recreation G1 work is a typed stale ' +
  'result, never a retirement of G2', async () => {
  const g1 = openGeneration('g1');
  assert.equal((await retire(g1)).outcome, 'CORE_OK');
  const duplicate = await retire(g1);
  assert.equal(duplicate.outcome, 'CORE_REFUSED', 'duplicate is idempotent');
  assert.equal(duplicate.reason, 'retired');

  // Delayed G1 shutdown completion after G2 registered removes only G1.
  const g2 = openGeneration('g2');
  unregisterRuntimeLifecycle(g1.runtime, g1.owner);
  const afterClose = await retire(g1);
  assert.equal(afterClose.outcome, 'NOT_MANAGED');
  assert.equal(afterClose.reason, 'runtime-generation-not-registered',
    'G1 absent: stale, with no fallback to the current logical runtime');
  assert.deepEqual(g2.retired, []);
  assert.equal(g2.owner.active, true);

  // A G1 handle can never unregister G2, and G2 is still exactly reachable.
  unregisterRuntimeLifecycle(g2.runtime, g1.owner);
  assert.equal((await retire(g2, 'g2-own-removal')).outcome, 'CORE_OK',
    'G2 remains registered under its own runtime');
  assert.deepEqual(g2.retired, ['g2']);
  unregisterRuntimeLifecycle(g2.runtime, g2.owner);
});

test('a runtime handle for a different logical replica is refused', async () => {
  const g1 = openGeneration('g1');
  const mismatch = await retireReplicaLifecycle({runtime: g1.runtime,
    groupId: GROUP_ID, replicaIdentity: 'another-replica', reason: 'x'});
  assert.equal(mismatch.outcome, 'CORE_REFUSED');
  assert.equal(mismatch.reason, 'lifecycle-identity-mismatch');
  assert.deepEqual(g1.retired, []);
  unregisterRuntimeLifecycle(g1.runtime, g1.owner);
});

test('real raft-rs ports: old-generation removal after the name is reused ' +
  'leaves the new generation serving', async () => {
  const oldWorld = new PartitionNodeCluster({partitionId: GROUP_ID,
    replicaIds: [REPLICA_ID]});
  const oldPort = oldWorld.node(REPLICA_ID);
  const newWorld = new PartitionNodeCluster({partitionId: GROUP_ID,
    replicaIds: [REPLICA_ID]});
  try {
    const newPort = newWorld.node(REPLICA_ID);
    // The old generation's delayed removal names its own runtime.
    const result = await raftRsLifecycleAdministration.retireReplica(
      REPLICA_ID, 'old-generation-removal',
      {groupId: GROUP_ID, runtime: oldPort});
    assert.equal(result.outcome, 'CORE_OK');
    assert.equal((await oldPort.readStatus()).reason, 'retired');
    const status = await newPort.readStatus();
    assert.equal(status.outcome, 'CORE_OK',
      'the new generation is not retired by the old one');
    assert.equal(status.replicaIdentity, REPLICA_ID);
    // Closing the old runtime afterwards cannot unregister the new one.
    oldWorld.dispose();
    const newRemoval = await raftRsLifecycleAdministration.retireReplica(
      REPLICA_ID, 'new-generation-removal',
      {groupId: GROUP_ID, runtime: newPort});
    assert.equal(newRemoval.outcome, 'CORE_OK',
      'the new generation stays exactly addressable');
  } finally {
    oldWorld.dispose();
    newWorld.dispose();
  }
});

test('a delayed G1 close cannot unregister the G2 peer-reservation owner',
  () => {
    const unregisterG1 = registerPeerIdentityReservationOwner({
      groupId: GROUP_ID, localReplicaIdentity: REPLICA_ID,
      reserve: () => 'g1-peer'});
    const unregisterG2 = registerPeerIdentityReservationOwner({
      groupId: GROUP_ID, localReplicaIdentity: REPLICA_ID,
      reserve: () => 'g2-peer'});
    unregisterG1();
    const reserved = raftRsMembershipAdministration.reservePeerIdentity({
      groupId: GROUP_ID, localReplicaIdentity: REPLICA_ID,
      joiningReplicaIdentity: 'joiner'});
    assert.equal(reserved.outcome, 'RESERVED',
      'G2 remains the reservation owner');
    assert.equal(reserved.peerId, 'g2-peer');
    unregisterG2();
  });

test('registry operation census: exact-generation only, no logical lookup',
  async () => {
    const {readFileSync, readdirSync, statSync} = await import('node:fs');
    const {join} = await import('node:path');
    const root = new URL('../../../', import.meta.url).pathname;
    const owner = readFileSync(
      join(root, 'src/raft/raft-rs-replica-lifecycle-owner.js'), 'utf8');
    assert.equal(/new Map\(/u.test(owner), false,
      'no registry map keyed by logical (group, replica)');
    assert.match(owner, /new WeakMap\(\)/u,
      'the registry is keyed by the exact runtime a generation opened');
    const files = [];
    const walk = (dir) => {
      for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) walk(path);
        else if (path.endsWith('.js')) files.push(path);
      }
    };
    walk(join(root, 'src'));
    const retireCalls = files.flatMap((path) => {
      const source = readFileSync(path, 'utf8');
      return [...source.matchAll(
        /\.retireReplica\(([\s\S]*?)\);/gu)].map((match) => match[1]);
    });
    assert.ok(retireCalls.length > 0, 'the removal path retires a runtime');
    for (const call of retireCalls) {
      assert.match(call, /runtime:/u,
        'every retirement names the exact runtime it targets');
    }
  });
