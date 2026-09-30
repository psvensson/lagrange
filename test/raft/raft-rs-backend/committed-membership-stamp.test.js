// T2 witness (owner decision O1, committed-read amendment 1, sections
// 3.1-3.2 and 5 O-a): a join's bootstrap membership is the group's committed
// configuration read from its leader, never the services rows.
//
// Every run plants a rows-vs-committed disagreement: the rows the creation
// owner is handed omit a committed founding voter and name a phantom replica
// that was never a member. The oracle is the log fold (O-a): the leader's
// durable `_raft_rs_log` conf-change entries, decoded with the binding's own
// decoder on a connection of the test's own, folded over the TEST'S genesis
// founders. The read is routed by a stale hint (a follower's node), so the
// one NOT_LEADER redirect is on the path.

import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  addressOf,
  admitThroughRows,
  buildTargetFromOperation,
  configure,
  createCommittedMembershipHarness,
  createJoinOperation,
  formGroup,
  metadataCache,
  serviceRow,
  statusOf,
  waitFor,
} from './committed-membership-harness.js';
import {
  durableAppliedState,
  foldAt,
  logFold,
  reservedIdentities,
} from './committed-membership-oracles.js';
import {CDCOperation} from '../../../src/partition/partition-service.js';
import {TABLES} from '../../../src/constants/index.js';
import {ReplicaOperationField} from
  '../../../src/rebalancer/replica-operation-constants.js';

const PARTITION_ID = 'o1-stamp';
const PHANTOM = ['o1s-phantom', 'node-phantom'];

function peerIdsOf(identities, members) {
  const byIdentity = new Map([...identities].map(([peerId, identity]) =>
    [identity, peerId]));
  return members.map(([replicaId]) => byIdentity.get(replicaId));
}

test('T2: a join is stamped with the committed configuration its leader ' +
  'answers (log fold over the test founders), not the planted rows; the ' +
  'target replays to the fold', async () => {
  configure();
  const harness = createCommittedMembershipHarness(PARTITION_ID);
  const founderA = ['o1s-a', 'node-a'];
  const source = ['o1s-s', 'node-s'];
  const founderB = ['o1s-b', 'node-b'];
  const joiner = ['o1s-d', 'node-d'];
  const target = ['o1s-t', 'node-t'];
  const founders = [founderA, source, founderB];
  try {
    await formGroup(harness, founders);
    // A committed voter added by the group's own row-driven admission (it
    // never starts a process): the log now carries a conf-change entry, so
    // the fold is not the genesis list.
    for (const [replicaId] of founders) {
      harness.caches.get(replicaId).applySystemTableChange(TABLES.SERVICES,
        CDCOperation.INSERT, serviceRow(PARTITION_ID, joiner));
    }
    const leaderAtSetup = harness.leaderMember();
    const leaderDb = () => harness.dbPathOf(harness.leaderMember());
    const genesisPeerIds = peerIdsOf(
      reservedIdentities(harness.dbPathOf(leaderAtSetup)), founders);
    assert.equal(await waitFor(() => {
      const fold = logFold(leaderDb(), PARTITION_ID, genesisPeerIds);
      return fold.at(-1).voters.length === founders.length + 1;
    }), true, 'setup: the group committed the joiner as a voter');

    // The rows the creation owner sees omit the committed founder `source`
    // and name a phantom; the read is routed through a follower's node.
    const leading = harness.leaderMember();
    const follower = founders.find(([replicaId]) => replicaId !== leading[0]);
    const plantedRows = [founderA, founderB, PHANTOM]
      .filter(([replicaId]) => replicaId !== source[0])
      .map((member) => serviceRow(PARTITION_ID, member));
    const created = await createJoinOperation(harness, {
      target, rows: plantedRows, leaderHint: follower[1]});
    assert.equal(created.error, undefined,
      `the creation read succeeds (${created.error?.message})`);
    const operation = created.operation;
    const stamp = operation[ReplicaOperationField.BOOTSTRAP_MEMBERSHIP];
    assert.ok(stamp, 'the operation carries a committed-membership stamp');
    assert.equal(stamp.kind, 'committed', 'the stamp is COMMITTED');

    const fold = logFold(leaderDb(), PARTITION_ID, genesisPeerIds);
    assert.deepEqual([...stamp.voters].sort(),
      foldAt(fold, stamp.appliedIndex).voters,
      'O-a: the stamped voters are the committed configuration at the ' +
        'stamp\'s own applied index');
    const hints = operation[ReplicaOperationField.REPLICA_IDS];
    assert.ok(hints.includes(source[0]),
      'the committed founder the rows omitted is in the address hints');
    assert.equal(hints.includes(PHANTOM[0]), false,
      'the phantom row is not');
    assert.deepEqual([...hints].sort(),
      [...Object.values(stamp.identities), target[0]].sort(),
      'the address hints are the stamp identities plus the target');
    assert.equal(harness.router.delivered.length, 2,
      'the stale hint was redirected once to the leader');
    assert.equal(harness.router.delivered[1].nodeId, leading[1]);

    // The target, built through its handler from that stamp, starts from
    // the committed configuration plus itself (O2) and replays to the fold.
    const targetCache = metadataCache(PARTITION_ID, []);
    const {service: targetService} = await buildTargetFromOperation(harness, {
      target, operation, cache: targetCache});
    const targetDb = harness.dbPathOf(target);
    const targetPeerId = String(statusOf(targetService).peerId);
    const atCreation = durableAppliedState(targetDb, PARTITION_ID);
    assert.deepEqual(atCreation.voters,
      [...foldAt(fold, stamp.appliedIndex).voters, targetPeerId].sort(),
      'the target bootstrap is the stamped configuration plus itself');
    assert.equal(atCreation.bootstrapIndex, stamp.appliedIndex,
      'the durable bootstrap index is the stamp\'s committed index');
    assert.equal(atCreation.admissionIndex, null,
      'the target is not admitted at creation');
    const order = hints.map((replicaId) => [...reservedIdentities(targetDb)]
      .find(([, identity]) => identity === replicaId)[0]);
    assert.deepEqual(order, [...order].sort((left, right) =>
      left.length - right.length || left.localeCompare(right)),
    'the address hints are in ascending raft peer id order');

    assert.equal(await admitThroughRows(harness, target,
      [founderA, source, founderB]), true, 'the group admits the target');
    const targetFold = logFold(targetDb, PARTITION_ID, genesisPeerIds);
    const replayed = durableAppliedState(targetDb, PARTITION_ID);
    assert.deepEqual(replayed.voters,
      foldAt(targetFold, replayed.appliedIndex).voters,
      'O-a: caught up, the target configuration is the fold of its own log');
    const admittedAt = targetFold.find((snapshot) =>
      snapshot.voters.includes(targetPeerId)).index;
    assert.equal(replayed.admissionIndex, admittedAt,
      'the admission index is the applied AddNode of the target');
    assert.ok(addressOf(target).length > 0);
  } finally {
    await harness.dispose();
  }
});
