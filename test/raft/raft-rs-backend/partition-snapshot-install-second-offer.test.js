// Witness H1, adopted from the round-4 verifier (quest
// partition-checkpoint-epoch-generation, hand-over coverage model cell 2): two offers for ONE replica
// from two leaders (a leadership change while the first transfer's install
// orchestration is between its receive and its shutdown). Under the install
// episode the second offer is answered INSTALLING when it is routed (on tree
// 4441979d it was received and installed under the running replacement:
// scratchpad evidence-red5/second-offer.out). The only test seam
// beyond the fixture's: the pre-shutdown admission of each orchestration is
// held at a gate (in production that await is the authoritative lifecycle
// read, a control-plane round trip of unbounded duration).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {test} from 'node:test';

import {turnChainValue} from '../../../src/raft/raft-rs-turn-answer.js';
import {RAFT_SNAPSHOT_CATCHUP_DISPATCH_OUTCOME} from
  '../../../src/raft/snapshot-catchup-constants.js';
import {RAFT_SNAPSHOT_TRANSFER_ABORT_REASON} from
  '../../../src/raft/snapshot-transfer-constants.js';
import {
  CADENCE_ENTRY_THRESHOLD,
  PARTITION_ID,
  cutOff,
  gateAdmissions,
  reaskAfter,
  recreationOf,
  targetService,
  userRows,
  waitFor,
  withInstallWorld,
  writeAndCompact,
} from './snapshot-install-recreate-fixture.js';

const ROWS = CADENCE_ENTRY_THRESHOLD;
const REASK_BOUND_MS = 30001;

test('H1: a second offer (new leader) routed while the first install is ' +
  'before its shutdown never installs under the replacement that runs',
{timeout: 180000}, async () => {
  await withInstallWorld({establishedOnTarget: true}, async (world) => {
    const replicaId = world.third.replicaId;
    const original = world.third;
    const firstLeader = world.leader;
    const secondLeader = world.voter;
    const gates = gateAdmissions(world);
    let reconnect = cutOff(world, original);
    await writeAndCompact(world, 1, ROWS);
    reconnect();
    // Offer A (first leader) is received and held before its shutdown.
    await waitFor(() => gates.length === 1, 'offer A routed');
    await gates[0].reached;
    assert.equal(original.isShutdown, false);
    const indexA = gates[0].descriptor.lastIncludedIndex;
    // Leadership moves; the new leader writes and compacts further while the
    // follower is cut off again, then finds it behind its own compaction.
    reconnect = cutOff(world, original);
    const transfer = await turnChainValue(firstLeader.raft.transferLeadership({
      successor: 'named', replicaIdentity: secondLeader.replicaId}));
    assert.equal(typeof transfer, 'object');
    await waitFor(() => secondLeader.raft.readStatus().role === 'leader',
      'the voter leads');
    world.leader = secondLeader;
    world.voter = firstLeader;
    await writeAndCompact(world, ROWS + 1, 2 * ROWS);
    reconnect();
    // Offer B (new leader) arrives while A's episode is live: it is answered
    // INSTALLING at routing; nothing of it is received or orchestrated.
    const answeredInstalling = () => world.dispatches.filter((dispatch) =>
      dispatch?.outcome === RAFT_SNAPSHOT_CATCHUP_DISPATCH_OUTCOME.TRANSFER_ABORTED &&
      dispatch.transfer?.reason ===
        RAFT_SNAPSHOT_TRANSFER_ABORT_REASON.REPLICA_INSTALLING).length;
    await waitFor(() => answeredInstalling() === 1,
      'offer B answered installing while A is held ' +
      `(dispatches ${JSON.stringify(world.dispatches)})`);
    assert.equal(gates.length, 1, 'offer B reached no orchestration');
    assert.equal(original.isShutdown, false, 'and stopped nothing');
    // A proceeds: shutdown, install, recreation.
    gates[0].open();
    await waitFor(() => world.created.length === 1 &&
      targetService(world, replicaId) === world.created[0],
    'A recreated the replica');
    const replacement = world.created[0];
    const inodeBefore = fs.statSync(replacement.dbPath).ino;
    await new Promise((resolve) => setTimeout(resolve, 500));
    const facts = {
      indexA,
      orchestrations: gates.length,
      replacementShutdown: replacement.isShutdown,
      tracked: targetService(world, replicaId) === replacement ? 'replacement' :
        (targetService(world, replicaId) === original ? 'original' : 'other'),
      created: world.created.length,
      inodeBefore, inodeAfter: fs.statSync(replacement.dbPath).ino,
      record: recreationOf(world, replicaId),
      dispatches: world.dispatches.map((d) => ({outcome: d?.outcome,
        gen: d?.generationIndex, reason: d?.transfer?.reason ?? null})),
    };
    // The property: nothing is installed under a running service.
    assert.equal(facts.inodeAfter, facts.inodeBefore,
      `the database file was swapped under the running replacement: ${
        JSON.stringify(facts)}`);
    assert.deepEqual({orchestrations: facts.orchestrations,
      replacementShutdown: facts.replacementShutdown, tracked: facts.tracked,
      created: facts.created}, {orchestrations: 1, replacementShutdown: false,
      tracked: 'replacement', created: 1}, JSON.stringify(facts));
    // The new leader asks again on its own bound: the replica, behind its
    // compaction, installs through a new episode and converges.
    await reaskAfter(world, REASK_BOUND_MS);
    await waitFor(() => gates.length === 2, 'the re-asked offer is routed ' +
      `(dispatches ${JSON.stringify(world.dispatches.map((d) => ({
        outcome: d?.outcome, reason: d?.transfer?.reason ?? null})))})`);
    gates[1].open();
    await waitFor(() => {
      const current = targetService(world, replicaId);
      return current && current.isShutdown !== true &&
        current.raft?.readStatus?.().appliedIndex ===
          world.leader.raft.readStatus().appliedIndex;
    }, 'the replica converges on the new leader');
    assert.deepEqual(userRows(targetService(world, replicaId)),
      userRows(world.leader));
    assert.equal(PARTITION_ID, targetService(world, replicaId).partitionId);
  });
});
