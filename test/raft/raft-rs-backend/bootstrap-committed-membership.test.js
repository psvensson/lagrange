// R2 boundary witness for owner decision D1 (2026-09-25): a new replica
// bootstraps from its group's current committed membership, so a REPLACE
// target starts with its source while the source is a committed voter.
//
// Real PartitionService replicas on the rs-raft backend, one database file
// each, on a loopback transport. The target's bootstrap membership comes
// through the production chain end to end: the creation owner stamps the
// operation (createOperationRecordInternal, which builds the bootstrap
// topology from the group's services rows), the target node's replica
// handler resolves the replica context from that stamp and its own cache
// view (resolveReplicaContext), and PartitionService hands the resolved list
// to the rs-raft port.
//
// Every expectation is read from raft-rs: the committed ConfState the
// group's leader reports and the ConfState the target's own core reports.
// The replica -> raft peer id map is the backend's own (each live replica's
// readStatus().peerId); no id and no membership is written here. The source
// is a founding voter, so no ConfChange in the log names it: whatever the
// target's bootstrap says about it is all the target will ever know until a
// real RemoveNode commits.
//
// The target node's cache holds no services row for the partition yet (a new
// node's cache lags; only the dispatched stamp knows the group), so the
// target's identity reservations come from its bootstrap and nothing else.

// Superseded under R09 by owner decision O1 (2026-09-26): the target's
// bootstrap membership is no longer resolved from services rows; the
// creation owner reads the group's committed configuration from its leader
// and stamps it (COMMITTED), and the target opens from that stamp through
// its handler. The same D1 claims are witnessed through that chain; the RF=1
// target's pre-admission campaign is now refused by its participation gate
// (GATE_CLOSED) instead of being counted out by raft-rs.

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
  membershipOf,
  metadataCache,
  serviceRow,
  statusOf,
  waitFor,
} from './committed-membership-harness.js';
import {
  RAFT_LEADERSHIP_TRANSFER_SUCCESSOR,
  RAFT_MEMBERSHIP_OPERATION,
  RAFT_OPERATION_OUTCOME,
} from '../../../src/raft/raft-operation-port-constants.js';
import {PARTICIPATION_GATE} from
  '../../../src/raft/raft-committed-membership-constants.js';
import {OperationType} from
  '../../../src/rebalancer/replica-operation-progress.js';
import {ReplicaOperationField} from
  '../../../src/rebalancer/replica-operation-constants.js';

const PARTITION_ID = 'd1-bootstrap';
const ISOLATION_WINDOW_MS = 600;
const QUORUM_WINDOW_MS = 2000;
const LEADER_ROLE = 'leader';
const POLL_MS = 10;

function committedMembership(service) {
  return membershipOf(statusOf(service).confState);
}

function withoutPeer(membership, peerId) {
  return {
    ...membership,
    voters: membership.voters.filter((id) => id !== String(peerId)),
  };
}

function createGroupHarness() {
  return createCommittedMembershipHarness(PARTITION_ID);
}

// The REPLACE target through the production chain: the creation owner's
// committed read (routed by the leader's own node), the target handler's
// stamp validation, PartitionService on rs-raft.
async function buildReplaceTarget(harness, {source, target, founders}) {
  const created = await createJoinOperation(harness, {
    type: OperationType.REPLACE,
    target,
    rows: founders.map((member) => serviceRow(PARTITION_ID, member)),
    leaderHint: harness.leaderMember()[1],
    sourceReplicaId: source[0],
    sourceNodeId: source[1],
  });
  assert.equal(created.error, undefined, created.error?.message);
  const targetCache = metadataCache(PARTITION_ID, []);
  const {service} = await buildTargetFromOperation(harness, {
    target, operation: created.operation, cache: targetCache});
  return {service, operation: created.operation};
}

function admit(harness, target, members) {
  return admitThroughRows(harness, target, members);
}

async function restart(harness, member, cache) {
  const before = harness.services.get(member[0]);
  const options = {
    replicaIds: [...before.replicaIds],
    peerAddresses: [...(before.peerAddresses || [])],
    cache,
    ...(before.bootstrapMembership === null ? {} :
      {bootstrapMembership: before.bootstrapMembership}),
  };
  await before.shutdown();
  const reopened = harness.build(member, options);
  await reopened.initialize();
  reopened.startElection();
  assert.equal(await waitFor(() => statusOf(reopened).leaderId !== null),
    true, 'the restarted replica hears its leader again');
  return reopened;
}

test('D1 R2 witness: a REPLACE target of a founding voter bootstraps from ' +
  'the committed configuration, keeps the source until a real RemoveNode ' +
  'commits, then observes it; restart restores the same membership',
async () => {
  configure();
  const harness = createGroupHarness();
  const founderA = ['d1-a', 'node-a'];
  const source = ['d1-s', 'node-s'];
  const founderB = ['d1-b', 'node-b'];
  const target = ['d1-t', 'node-t'];
  const founders = [founderA, source, founderB];
  try {
    await formGroup(harness, founders);
    const committedAtCreation = committedMembership(harness.leader());
    const sourcePeerId = statusOf(harness.services.get(source[0])).peerId;
    assert.ok(committedAtCreation.voters.includes(String(sourcePeerId)),
      'setup: the source is a committed voter of the group');

    // (a) The target's bootstrap membership is the committed configuration
    // (plus the target itself, the joiner's own pending admission).
    const {service: replaceTarget} = await buildReplaceTarget(harness, {
      source, target, founders});
    const targetPeerId = statusOf(replaceTarget).peerId;
    const bootstrap = committedMembership(replaceTarget);
    assert.ok(bootstrap.voters.includes(String(targetPeerId)),
      'the target names itself, as every joiner does');
    assert.deepEqual(withoutPeer(bootstrap, targetPeerId),
      committedAtCreation,
      '(a) the target bootstrap equals the committed configuration');

    // (b)+(c) While the source is a committed voter the target represents
    // it; sampled through the whole catch-up, it never shows a removal the
    // group has not committed.
    const samples = [];
    const sampling = setInterval(() => {
      samples.push(committedMembership(replaceTarget));
    }, POLL_MS);
    const admitted = await admit(harness, target, founders);
    clearInterval(sampling);
    assert.equal(admitted, true, 'the group admits the target');
    assert.ok(samples.length > 0, 'the catch-up was sampled');
    assert.ok(samples.every((sample) =>
      sample.voters.includes(String(sourcePeerId))),
    '(c) no sample of the target configuration dropped the source before ' +
      'its removal was committed');
    assert.deepEqual(committedMembership(replaceTarget),
      committedMembership(harness.leader()),
      '(b) caught up, the target configuration is the leader committed one');

    // (e) Restart before the removal: the durable record, not the list.
    const restarted = await restart(harness, target,
      harness.caches.get(target[0]));
    assert.deepEqual(committedMembership(restarted),
      committedMembership(harness.leader()),
      '(e) a restart restores the committed membership, source included');

    // (d) The real removal, committed by the group; the target observes the
    // changed ConfState. Conf changes are taken only at the leader's port
    // (round 2 F-1): the target, a follower, refuses it typed naming the
    // leader, and the leader proposes it.
    const change = {
      type: RAFT_MEMBERSHIP_OPERATION.REMOVE_PEER,
      replicaIdentity: source[0],
      peerAddress: addressOf(source),
    };
    const refused = await restarted.raft.proposeConfChange(change);
    assert.equal(refused?.leaderReplicaId, harness.leader().replicaId,
      `the follower target refuses it typed, naming the leader (${
        JSON.stringify(refused)})`);
    const proposal = await harness.leader().raft.proposeConfChange(change);
    assert.equal(proposal?.outcome, RAFT_OPERATION_OUTCOME.CORE_OK,
      'REMOVE_PEER for the source is admissible on the leader ' +
      `(${JSON.stringify(proposal)})`);
    assert.equal(await waitFor(() => {
      const leader = harness.leader();
      return leader !== undefined && leader !== harness.services.get(
        source[0]) && !statusOf(leader).confState.voters.map(String)
        .includes(String(sourcePeerId)) &&
        statusOf(restarted).commitIndex === statusOf(leader).commitIndex;
    }), true, 'the group commits the removal of the source');
    const afterRemoval = committedMembership(restarted);
    assert.equal(afterRemoval.voters.includes(String(sourcePeerId)), false,
      '(d) the target observes the committed removal');
    assert.deepEqual(afterRemoval, committedMembership(harness.leader()),
      '(d) the target configuration is the leader committed one');

    const reopened = await restart(harness, target,
      harness.caches.get(target[0]));
    assert.deepEqual(committedMembership(reopened), afterRemoval,
      '(e) a restart after the removal restores the same membership');
  } finally {
    await harness.dispose();
  }
});

test('D1 R2 witness: the admitted target counts quorum over the committed ' +
  'configuration, so two of four committed voters elect no leader',
async () => {
  configure();
  const harness = createGroupHarness();
  const founderA = ['d1q-a', 'node-a'];
  const source = ['d1q-s', 'node-s'];
  const founderB = ['d1q-b', 'node-b'];
  const target = ['d1q-t', 'node-t'];
  const founders = [founderA, source, founderB];
  try {
    await formGroup(harness, founders);
    const {service: replaceTarget} = await buildReplaceTarget(harness, {
      source, target, founders});
    assert.equal(await admit(harness, target, founders), true,
      'the group admits the target');
    const committed = committedMembership(harness.leader());
    assert.equal(committed.voters.length, founders.length + 1,
      'setup: the committed configuration holds the source and the target');

    // Only the target and one founder remain: a minority of the committed
    // configuration, however the target counts it.
    for (const [replicaId] of [source, founderB]) {
      await harness.services.get(replicaId).shutdown();
    }
    const campaign = await replaceTarget.raft.campaign();
    assert.equal(campaign?.outcome, RAFT_OPERATION_OUTCOME.CORE_OK,
      `the target campaigned (${JSON.stringify(campaign)})`);
    const ledWithMinority = await waitFor(() =>
      statusOf(replaceTarget).role === LEADER_ROLE, QUORUM_WINDOW_MS);
    assert.equal(ledWithMinority, false,
      'the target cannot lead with two of the four committed voters');
  } finally {
    await harness.dispose();
  }
});

test('D1 R2 witness (f): an ordinary ADD stamps the committed ' +
  'configuration plus its target, as before',
async () => {
  configure();
  const harness = createGroupHarness();
  const founders = [['d1f-a', 'node-a'], ['d1f-b', 'node-b'],
    ['d1f-c', 'node-c']];
  const joiner = ['d1f-j', 'node-j'];
  try {
    await formGroup(harness, founders);
    const committed = committedMembership(harness.leader());
    const created = await createJoinOperation(harness, {
      type: OperationType.ADD,
      target: joiner,
      rows: founders.map((member) => serviceRow(PARTITION_ID, member)),
      leaderHint: harness.leaderMember()[1],
    });
    const operation = created.operation;
    const stamp = operation[ReplicaOperationField.BOOTSTRAP_MEMBERSHIP];
    assert.deepEqual([...stamp.voters].sort(), committed.voters,
      '(f) the ADD stamp is the committed voter set');
    assert.deepEqual(
      [...operation[ReplicaOperationField.REPLICA_IDS]].sort(),
      [...founders.map(([replicaId]) => replicaId), joiner[0]].sort(),
      '(f) its address hints are the committed members plus its target');
  } finally {
    await harness.dispose();
  }
});

test('D1 R2 witness (RF=1): the sole voter is replaced through ' +
  'add-voter, leadership transfer and remove-voter, and the target never ' +
  'leads alone before the removal commits',
async () => {
  configure();
  const harness = createGroupHarness();
  const source = ['d1r-s', 'node-s'];
  const target = ['d1r-t', 'node-t'];
  try {
    await formGroup(harness, [source]);
    const sourceService = harness.services.get(source[0]);
    const committedAtCreation = committedMembership(sourceService);
    const {service: replaceTarget} = await buildReplaceTarget(harness, {
      source, target, founders: [source]});
    const targetPeerId = statusOf(replaceTarget).peerId;
    assert.deepEqual(
      withoutPeer(committedMembership(replaceTarget), targetPeerId),
      committedAtCreation,
      'the target bootstrap is the committed configuration: it is not a ' +
        'sole voter');
    // Before its admission the target is below its participation gate: an
    // explicit campaign is refused typed and nothing is stepped (O1).
    const campaign = await replaceTarget.raft.campaign();
    assert.equal(campaign?.reason, PARTICIPATION_GATE.GATE_CLOSED,
      `the unadmitted target's campaign is refused (${
        JSON.stringify(campaign)})`);
    const ledAlone = await waitFor(() =>
      statusOf(replaceTarget).role === LEADER_ROLE, ISOLATION_WINDOW_MS);
    assert.equal(ledAlone, false,
      'the target cannot elect itself while the source is a voter');
    assert.equal(await waitFor(() =>
      statusOf(sourceService).role === LEADER_ROLE), true,
    'the sole voter leads again');

    assert.equal(await admit(harness, target, [source]), true,
      'the sole voter admits the target');
    const transfer = await sourceService.raft.transferLeadership({
      successor: RAFT_LEADERSHIP_TRANSFER_SUCCESSOR.NAMED,
      replicaIdentity: target[0],
    });
    assert.equal(transfer?.outcome, RAFT_OPERATION_OUTCOME.CORE_OK,
      `leadership transfer to the target (${JSON.stringify(transfer)})`);
    assert.equal(await waitFor(() =>
      statusOf(replaceTarget).role === LEADER_ROLE), true,
    'the target leads the two-voter group');
    const proposal = await replaceTarget.raft.proposeConfChange({
      type: RAFT_MEMBERSHIP_OPERATION.REMOVE_PEER,
      replicaIdentity: source[0],
      peerAddress: addressOf(source),
    });
    assert.equal(proposal?.outcome, RAFT_OPERATION_OUTCOME.CORE_OK,
      `REMOVE_PEER for the source (${JSON.stringify(proposal)})`);
    assert.equal(await waitFor(() => {
      const voters = committedMembership(replaceTarget).voters;
      return voters.length === 1 && voters[0] === String(targetPeerId);
    }), true, 'the committed configuration is the target alone');
    assert.equal(statusOf(replaceTarget).role, LEADER_ROLE,
      'the target leads its sole-voter group');
  } finally {
    await harness.dispose();
  }
});
