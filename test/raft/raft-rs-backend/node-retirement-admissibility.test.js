// Receipts:
//   retirement-is-refused-at-the-node-before-the-core-is-touched
//   a-retired-replica-neither-ticks-campaigns-proposes-nor-admits-envelopes
//   retirement-survives-restart-with-no-scheduler-running
//   retirement-does-not-rewrite-conf-state-and-never-reactivates-an-identity
//   bypassing-the-retirement-check-restores-the-disruptive-behaviour
//   a-non-retired-replica-still-admits-a-sender-absent-from-its-conf-state
//
// The prerequisite addendum's D2: retirement is an invariant of the NODE, not
// of the tick scheduler. The property holds today only because the scheduler
// is the sole caller, and the transport quest is about adding another one -
// so every drive here calls the node directly and never runs the scheduler.
//
// The reproducer is the verifier's own: the peer is partitioned, the cluster
// removes it, its stale local ConfState still lists it, retirement is
// recorded, the process restarts, the scheduler is never started, and the
// test calls tick itself and feeds envelopes the live leader really produced.
//
// The refusal name is read through a namespace import: a receipt must be red
// because no owner names the node-level refusal yet, not because the file
// cannot load.

import assert from 'node:assert/strict';
import {test} from 'node:test';
import {TextEncoder} from 'node:util';

import Database from 'better-sqlite3';

import * as nodeConstants from '../../../src/raft/raft-rs-node-constants.js';
import {PartitionNodeCluster} from './partition-node-cluster.js';
import {drainReady} from '../../../src/raft/raft-rs-ready-loop.js';
import {
  RAFT_PARTITION_NODE_REQUEST,
} from '../../../src/raft/raft-provider-contract-constants.js';
import {
  RAFT_RS_ELECTION_REFUSAL,
} from '../../../src/raft/raft-rs-election-safety-constants.js';
import {
  RAFT_RS_NODE_EVENT,
} from '../../../src/raft/raft-rs-node-constants.js';
import {
  RAFT_RS_SCHEDULING_ELIGIBILITY,
} from '../../../src/raft/raft-rs-durable-store-constants.js';
import {
  RAFT_RS_TICK_SCHEDULING,
} from '../../../src/raft/raft-rs-partition-node-constants.js';

const FOUNDING = Object.freeze(['replica-a', 'replica-b', 'replica-c']);
const CUT_OFF = 'replica-c';
const SETTLE_ROUNDS = 400;
const DISTURBANCE_TICKS = 60;
const CAPTURE_ROUNDS = 20;
const RETIRED_AT = '2026-09-21T00:00:00.000Z';
const COMMAND = 'a-command-from-a-retired-replica';
// ConfChangeType::RemoveNode and ConfChangeTransition::Auto, from the
// binding's own match arms.
const REMOVE_NODE = 1;
const AUTO_TRANSITION = 0;
const MSG_HEARTBEAT = 8;
const ZERO_POSITION = '0';

/**
 * A clock that records what it was asked to schedule and schedules nothing.
 * The scheduler never runs in this file; this is how that is measured rather
 * than assumed.
 * @return {Object} The recording clock.
 */
function recordingClock() {
  const scheduled = [];
  return {
    scheduled,
    now: () => 0,
    setTimeout: () => null,
    clearTimeout: () => undefined,
    setInterval: (fn, intervalMs) => {
      scheduled.push(intervalMs);
      return scheduled.length;
    },
    clearInterval: () => undefined,
  };
}

/**
 * The name the node answers an active call with once this replica is retired.
 * @return {string} The typed refusal name.
 */
function retiredRefusalName() {
  const admission = nodeConstants.RAFT_RS_NODE_ADMISSION;
  assert.ok(admission !== undefined,
    'the node owner must name its own admissibility refusal; it has no ' +
    'RAFT_RS_NODE_ADMISSION, so retirement is still only the scheduler\'s ' +
    'business');
  assert.equal(typeof admission.REPLICA_RETIRED, 'string',
    'the retired refusal must be a name, not ' +
    String(admission.REPLICA_RETIRED));
  return admission.REPLICA_RETIRED;
}

/**
 * What one replica's own database says, read on a connection of this test's
 * own.
 * @param {PartitionNodeCluster} cluster - The partition.
 * @param {string} replicaId - The replica.
 * @return {Object} {voters, retirementRows}.
 */
function durableFactsOf(cluster, replicaId) {
  const independent = new Database(cluster.dbFileOf(replicaId),
    {readonly: true});
  const applied = independent.prepare(
    'SELECT voters FROM _raft_rs_applied_state WHERE group_id = ?')
    .get(cluster.partitionId);
  const retirement = independent.prepare(
    'SELECT peer_id, retired_at FROM _raft_rs_retirement WHERE group_id = ?')
    .all(cluster.partitionId);
  independent.close();
  return {voters: JSON.parse(applied.voters), retirementRows: retirement};
}

/**
 * Form a partition, elect, capture real envelopes the leader addressed to one
 * replica, then cut that replica off and remove it from the configuration
 * while it cannot hear. It ends holding a configuration that still lists it.
 * @param {string} partitionId - The group.
 * @param {Object} [options] - {substrateFor}.
 * @return {Object} {cluster, leader, cutOffPeerId, captured}.
 */
function removedBehindItsBack(partitionId, options = {}) {
  const cluster = new PartitionNodeCluster({
    partitionId, replicaIds: FOUNDING, ...options});
  assert.ok(cluster.settle(() => cluster.leaderReplicaId() !== null,
    {rounds: SETTLE_ROUNDS}), 'the partition must elect a leader');
  const leader = cluster.leaderReplicaId();
  assert.notEqual(leader, CUT_OFF,
    'the replica this case removes must not be the one leading it');
  // Real traffic, produced by the live leader for this replica, taken off the
  // transport before it is delivered. Nothing here is a hand-written packet.
  const inbox = cluster.replica(CUT_OFF).inbox;
  const captured = [];
  for (let round = 0; round < CAPTURE_ROUNDS && captured.length === 0;
    round += 1) {
    cluster.node(leader).tickOnce();
    captured.push(...inbox.splice(0, inbox.length));
  }
  assert.ok(captured.length > 0,
    'the leader must really have addressed this replica');
  cluster.isolate(CUT_OFF);
  const cutOffPeerId = cluster.raftPeerIdOf(CUT_OFF);
  cluster.proposeConfigurationChange(
    [{changeType: REMOVE_NODE, nodeId: cutOffPeerId}], AUTO_TRANSITION,
    leader);
  assert.ok(cluster.settle(() =>
    !cluster.coreConfState(leader).voters.includes(cutOffPeerId),
  {rounds: SETTLE_ROUNDS}),
  'the removal must commit on the peers that can hear each other');
  return {cluster, leader, cutOffPeerId, captured};
}

/**
 * Retire the cut-off replica durably, through the provider production calls.
 * @param {PartitionNodeCluster} cluster - The partition.
 * @return {Object} What the provider recorded.
 */
function retire(cluster) {
  const retired = cluster.provider.retireFromScheduling(
    cluster.node(CUT_OFF), RETIRED_AT);
  assert.equal(retired.scheduling, RAFT_RS_TICK_SCHEDULING.REFUSED_RETIRED);
  return retired;
}

/**
 * How many of a node's answers admitted the call.
 * @param {Array<Object>} outcomes - What the node answered.
 * @return {number} The count admitted.
 */
function admittedCount(outcomes) {
  return outcomes.filter((outcome) => outcome.admitted !== false).length;
}

/**
 * The four calls production really makes on a group, driven on a retired
 * replica through the seam that resolves it.
 *
 * The seam is the provider: it takes the node the group holds in `this.raft`
 * and resolves it with `raftRsGroupParts()`. Whatever that hands back is the
 * whole of what production can reach, so it may not hand back an unguarded
 * core, and everything reached through it must be refused for a retired
 * replica exactly as the node's own methods are.
 * @param {PartitionNodeCluster} cluster - The partition.
 * @param {Object} node - The retired replica's node.
 * @param {string} refusal - The typed retirement refusal name.
 */
async function seamAttacksAreRefused(cluster, node, refusal) {
  const parts = node.raftRsGroupParts();
  assert.equal(parts.core, undefined,
    'the seam must not be handed the unguarded runtime: every path ' +
    'production uses has to be inside both boundaries');
  assert.equal(parts.handle, undefined,
    'nor a raw handle to call it with');

  // A raw tick, a campaign and a step, through whatever the seam resolves.
  const readyBefore = parts.classified((core, handle) =>
    core.has_ready(handle));
  const termBefore = cluster.coreStatus(CUT_OFF).term;
  for (const attack of [
    (core, handle) => core.tick(handle),
    (core, handle) => core.campaign(handle),
    (core, handle) => core.step(handle, {
      from: '1', to: node.peerId, msgType: MSG_HEARTBEAT, term: termBefore,
      logTerm: ZERO_POSITION, index: ZERO_POSITION, commit: ZERO_POSITION,
    }),
  ]) {
    assert.equal(parts.admitted(attack).outcome, refusal,
      'a retired replica must refuse this call through the seam too');
  }

  // And the literal production write: the partition service proposes through
  // the provider, with the node it holds in this.raft.
  await assert.rejects(
    () => cluster.provider.propose(node, new TextEncoder().encode(COMMAND)),
    (error) => error.outcome === refusal &&
      typeof error.message === 'string' && error.message.length > 0,
    'the provider must refuse a proposal from a retired replica, with a ' +
    'refusal a caller can read');

  // Nothing of it reached the core: the core would have had work to do.
  assert.equal(parts.classified((core, handle) =>
    core.has_ready(handle)).value, readyBefore.value,
  'the core must have been given nothing at all');
  assert.equal(cluster.coreStatus(CUT_OFF).term, termBefore,
    'and its own term must not have moved');
}

/**
 * The partition's own transport hook for one replica, addressed the way the
 * partition addresses it: the request's resolver turns a peer into an
 * address and the request's sender puts the envelope on the wire. No node
 * member is involved, which is what makes the bypass control a bypass.
 * @param {PartitionNodeCluster} cluster - The partition.
 * @param {string} replicaId - Whose transport.
 * @return {Function} A send hook for the Ready loop.
 */
function sendHookOf(cluster, replicaId) {
  const request = cluster.replica(replicaId).request;
  const replicaOfPeerId = new Map(FOUNDING.map((peer) =>
    [cluster.raftPeerIdOf(peer), peer]));
  return (messages) => {
    for (const message of messages) {
      const target = replicaOfPeerId.get(message.to);
      if (target === undefined) {
        continue;
      }
      request[RAFT_PARTITION_NODE_REQUEST.SEND_TO_PEER](
        request[RAFT_PARTITION_NODE_REQUEST.RESOLVE_PEER_ADDRESS](target),
        {groupId: cluster.partitionId, to: message.to, message});
    }
  };
}

/**
 * What the live cluster looks like, read off the leading replica's own core.
 *
 * Deliberately not the driver's cluster-wide leader question: that one asks
 * every replica including the retired one, whose opinion is exactly what
 * this quest stops mattering. The leader's own term and the peer it believes
 * leads are the core's answer about the live cluster.
 * @param {PartitionNodeCluster} cluster - The partition.
 * @param {string} leader - The replica measured as leading.
 * @return {Object} {term, lead}.
 */
function liveClusterState(cluster, leader) {
  const status = cluster.coreStatus(leader);
  return {term: status.term, lead: status.lead};
}

/**
 * Drop everything the transport is holding, so what appears afterwards can
 * only have been originated by the replica under drive.
 * @param {PartitionNodeCluster} cluster - The partition.
 */
function emptyTheTransport(cluster) {
  for (const replicaId of FOUNDING) {
    cluster.replica(replicaId).inbox.length = 0;
  }
}

test('retirement is refused at the node, before the core is touched',
  async () => {
    const {cluster} = removedBehindItsBack('retirement-before-the-core');
    try {
      retire(cluster);
      const node = cluster.node(CUT_OFF);
      const ticked = node.tickOnce();
      assert.equal(ticked.admitted, false,
        'a retired replica must not tick; the node answered ' +
        `${String(ticked.outcome)}`);

      // The sharp instrument for BEFORE: take this group's handle out of the
      // runtime, through the production teardown the provider performs. Any
      // call that reaches the core now answers the core's own "invalid
      // handle" refusal instead, so a check made after touching the core
      // cannot answer the retirement one.
      cluster.provider.shutdownNode(node);
      const afterFree = node.tickOnce();
      const refusal = retiredRefusalName();
      assert.equal(ticked.outcome, refusal,
        'the refusal must be the typed retirement one; it said ' +
        `${String(ticked.outcome)} (${String(ticked.detail)})`);
      assert.equal(afterFree.outcome, refusal,
        'the node judged retirement only after handing the call to the ' +
        `core: it answered ${String(afterFree.outcome)} ` +
        `(${String(afterFree.detail)})`);
    } finally {
      cluster.dispose();
    }
  });

test('a retired replica neither ticks, campaigns, proposes nor admits ' +
  'envelopes', async () => {
  const {cluster, leader, captured} =
    removedBehindItsBack('retirement-active-calls');
  try {
    retire(cluster);
    const node = cluster.node(CUT_OFF);
    cluster.heal(CUT_OFF);
    emptyTheTransport(cluster);
    const before = liveClusterState(cluster, leader);
    const ownTermBefore = cluster.coreStatus(CUT_OFF).term;

    const ticks = [];
    for (let round = 0; round < DISTURBANCE_TICKS; round += 1) {
      ticks.push(node.tickOnce());
    }
    const campaigned = cluster.provider.requestElectionNow(node);
    const proposed = node.proposeCommand(new TextEncoder().encode(COMMAND));
    const ingested = captured.map((envelope) =>
      node.emit(RAFT_RS_NODE_EVENT.DATA, envelope));

    assert.equal(admittedCount(ticks), 0,
      'every tick into a retired replica must be refused; ' +
      `${admittedCount(ticks)} of ${ticks.length} were admitted`);
    assert.equal(campaigned.campaigned, false);
    assert.equal(campaigned.refusal, RAFT_RS_ELECTION_REFUSAL.RETIRED_BY_HOST);
    assert.equal(proposed.admitted, false, 'and it accepts no proposal');
    assert.equal(admittedCount(ingested), 0,
      'a retired replica admits no envelope for active participation; ' +
      `${admittedCount(ingested)} of ${ingested.length} were admitted`);

    // Nothing left it, and the live cluster is exactly as it was.
    assert.equal(cluster.replica(leader).inbox.length, 0,
      'a retired replica must originate no Raft traffic');
    assert.equal(cluster.coreStatus(CUT_OFF).term, ownTermBefore,
      'and its own core must not have advanced its term');
    assert.deepEqual(liveClusterState(cluster, leader), before,
      'the live cluster\'s term and leader must be untouched');

    // And every refusal is the one typed name, not a quiet outcome.
    const refusal = retiredRefusalName();
    for (const outcome of [...ticks, proposed, ...ingested]) {
      assert.equal(outcome.outcome, refusal);
    }

    // THE PRODUCTION SEAM. Everything above goes through the node's own
    // methods; production reaches this group through the provider, which
    // resolves it with raftRsGroupParts. A guard the seam walks round is not
    // a guard, so the four calls the verifier drove through it are driven
    // here every time.
    await seamAttacksAreRefused(cluster, node, refusal);
  } finally {
    cluster.dispose();
  }
});

test('retirement survives a restart with no scheduler running', async () => {
  const clocks = new Map(FOUNDING.map((replicaId) =>
    [replicaId, recordingClock()]));
  const {cluster, leader, cutOffPeerId, captured} =
    removedBehindItsBack('retirement-across-restart',
      {substrateFor: (replicaId) => ({timeSource: clocks.get(replicaId)})});
  try {
    retire(cluster);
    clocks.get(CUT_OFF).scheduled.length = 0;
    // Restart through the real seam: nothing in the process remembers the
    // decision, only the file does.
    cluster.restart(CUT_OFF);
    const restarted = cluster.node(CUT_OFF);
    const scheduling = cluster.provider.partitionScheduling(restarted);
    assert.equal(scheduling.retired, true,
      'the rebuilt replica must read its retirement from its own record');
    assert.equal(scheduling.peerId, cutOffPeerId,
      'and it is the same logical replica by the registry\'s identity');
    assert.deepEqual(clocks.get(CUT_OFF).scheduled, [],
      'the scheduler must never be started for it');

    cluster.heal(CUT_OFF);
    const before = liveClusterState(cluster, leader);
    const ticks = [];
    for (let round = 0; round < DISTURBANCE_TICKS; round += 1) {
      ticks.push(restarted.tickOnce());
      cluster.deliverAll();
    }
    const ingested = captured.map((envelope) =>
      restarted.emit(RAFT_RS_NODE_EVENT.DATA, envelope));
    assert.equal(admittedCount(ticks), 0,
      'a restarted retired replica must still refuse to tick; ' +
      `${admittedCount(ticks)} of ${ticks.length} ticks were admitted`);
    assert.equal(admittedCount(ingested), 0,
      'and still refuse real envelopes; ' +
      `${admittedCount(ingested)} of ${ingested.length} were admitted`);
    assert.equal(cluster.provider.partitionScheduling(restarted).ticksDriven,
      0, 'no tick was ever driven by a scheduler');
    assert.deepEqual(liveClusterState(cluster, leader), before,
      'the live cluster\'s term and leader must be untouched across all of ' +
      'it');
    assert.equal(durableFactsOf(cluster, CUT_OFF).retirementRows.length, 1,
      'and the durable retirement record is still exactly one row');
    const refusal = retiredRefusalName();
    for (const outcome of [...ticks, ...ingested]) {
      assert.equal(outcome.outcome, refusal);
    }
  } finally {
    cluster.dispose();
  }
});

test('retirement does not rewrite ConfState and never reactivates an ' +
  'identity', async () => {
  const {cluster, cutOffPeerId, captured} =
    removedBehindItsBack('retirement-is-not-membership');
  try {
    const votersBefore = durableFactsOf(cluster, CUT_OFF).voters;
    const confStateBefore = cluster.coreConfState(CUT_OFF);
    assert.ok(confStateBefore.voters.includes(cutOffPeerId),
      'this case exists because the stale configuration still lists it');
    retire(cluster);
    cluster.restart(CUT_OFF);
    const restarted = cluster.node(CUT_OFF);

    // Retirement records whether this local replica may participate at all.
    // What the node last knew about consensus membership is untouched.
    assert.deepEqual(cluster.coreConfState(CUT_OFF), confStateBefore,
      'retirement must not rewrite the committed configuration');
    assert.deepEqual(durableFactsOf(cluster, CUT_OFF).voters, votersBefore,
      'nor the durable configuration the record holds');
    assert.equal(restarted.peerId, cutOffPeerId,
      'and the retired identity is still the identity it was');

    // A later message does not bring it back.
    const ingested = captured.map((envelope) =>
      restarted.emit(RAFT_RS_NODE_EVENT.DATA, envelope));
    assert.equal(admittedCount(ingested), 0,
      'a later message must not reactivate a retired replica; ' +
      `${admittedCount(ingested)} of ${ingested.length} were admitted`);
    const after = cluster.provider.partitionScheduling(restarted);
    assert.equal(after.retired, true,
      'it is retired after the traffic exactly as it was before');
    assert.deepEqual(durableFactsOf(cluster, CUT_OFF).retirementRows,
      [{peer_id: cutOffPeerId, retired_at: RETIRED_AT}],
      'and the durable retirement record is unchanged by the traffic');
    assert.notEqual(RAFT_RS_SCHEDULING_ELIGIBILITY.ELIGIBLE,
      RAFT_RS_SCHEDULING_ELIGIBILITY.RETIRED);
    const refusal = retiredRefusalName();
    for (const outcome of ingested) {
      assert.equal(outcome.outcome, refusal);
    }
  } finally {
    cluster.dispose();
  }
});

test('bypassing the retirement check restores the disruptive behaviour',
  async () => {
    const {cluster, leader} = removedBehindItsBack('retirement-bypass');
    try {
      retire(cluster);
      cluster.restart(CUT_OFF);
      const node = cluster.node(CUT_OFF);
      cluster.heal(CUT_OFF);
      const before = liveClusterState(cluster, leader);

      // Gated: the node's own admissibility refuses every tick.
      const ticks = [];
      for (let round = 0; round < DISTURBANCE_TICKS; round += 1) {
        ticks.push(node.tickOnce());
        cluster.deliverAll();
      }
      assert.equal(admittedCount(ticks), 0,
        'with the check in place every tick is refused; ' +
        `${admittedCount(ticks)} of ${ticks.length} were admitted`);
      assert.deepEqual(liveClusterState(cluster, leader), before,
        'and the live cluster is untouched');
      const refusal = retiredRefusalName();
      for (const outcome of ticks) {
        assert.equal(outcome.outcome, refusal);
      }

      // Bypassed: the SAME work, reaching the core through the group's
      // classifying path - which asks no admission, because reads and
      // teardown go that way - instead of the admitted path every active
      // call uses. Nothing else differs: the Ready loop runs on this
      // replica's own store and its packets go out through the partition's
      // own send hook, the one the request carries, not through any node
      // member. If the old behaviour does not come back, the admission check
      // is not what is protecting the cluster.
      const group = node.raftRsGroupParts();
      const sendRoundTheNode = sendHookOf(cluster, CUT_OFF);
      for (let round = 0; round < DISTURBANCE_TICKS; round += 1) {
        group.classified((core, handle) => {
          core.tick(handle);
          return drainReady({
            core, handle, store: group.store, groupId: group.groupId,
            send: sendRoundTheNode,
          });
        });
        cluster.deliverAll();
      }
      const after = liveClusterState(cluster, leader);
      assert.ok(BigInt(after.term) > BigInt(before.term),
        'bypassing the check must raise the live cluster\'s term again; it ' +
        `went ${before.term} -> ${after.term}`);
      assert.notEqual(after.lead, before.lead,
        'and the replica that was leading must lose the leader it had; it ' +
        `still believes ${after.lead} leads`);
    } finally {
      cluster.dispose();
    }
  });

test('a non-retired replica still admits a sender absent from its ConfState',
  async () => {
    const {cluster, leader, cutOffPeerId} =
      removedBehindItsBack('membership-race-ingress');
    try {
      // The membership race, driven: the removed replica is NOT retired, it
      // can hear again, and it sends real traffic to a leader whose applied
      // configuration no longer holds it.
      cluster.heal(CUT_OFF);
      cluster.node(CUT_OFF).tickOnce();
      const inbox = cluster.replica(leader).inbox;
      const envelopes = inbox.splice(0, inbox.length);
      assert.ok(envelopes.length > 0,
        'the non-retired replica must really have sent something');
      assert.ok(!cluster.coreConfState(leader).voters.includes(cutOffPeerId),
        'and the receiver\'s applied configuration must not list the sender');
      for (const envelope of envelopes) {
        const admitted = cluster.node(leader)
          .emit(RAFT_RS_NODE_EVENT.DATA, envelope);
        assert.equal(admitted.admitted, true,
          'a sender absent from the applied configuration is still ' +
          `admitted; it answered ${String(admitted.outcome)}`);
      }
    } finally {
      cluster.dispose();
    }
  });
