// The pre-admission target on the real raft-rs port with no leader row in its
// cache (quest peer-and-leader-address-from-committed-configuration, attempt
// 2b; scenarios adopted from the verifier's probe). The target learns its
// leader only from committed facts: the stamp it was created from, a NOT_LEADER
// hint naming a member of that stamp, or the committed membership read again,
// starting at the stamp leader's node and walking the stamp's other members.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {admissionStampReads} from
  '../../../src/raft/raft-rs-committed-peer-address.js';
import {deriveRaftRsPeerId} from '../../../src/raft/raft-rs-peer-identity.js';
import {
  addressOf, configure, createCommittedMembershipHarness, formGroup,
  metadataCache, serviceRow, statusOf, waitFor,
} from './committed-membership-harness.js';
import {committedStampOfAnswer} from
  '../../../src/raft/raft-committed-membership-stamp.js';
import {COMMITTED_MEMBERSHIP_READ_PURPOSE} from
  '../../../src/raft/raft-committed-membership-constants.js';
import {committedAddOperation} from
  '../../partition/committed-operation-gateway-fixture.js';
import {CDCOperation} from '../../../src/partition/partition-service.js';
import {PARTITION_SERVICE_MESSAGE_TYPE} from
  '../../../src/partition/partition-service-constants.js';
import {ReplicaOperationMessageType} from
  '../../../src/rebalancer/replica-operation-constants.js';
import {TABLES} from '../../../src/constants/index.js';

const PARTITION_ID = 'c4-reread';
const A = ['c4-a', 'node-a'];
const B = ['c4-b', 'node-b'];
const C = ['c4-c', 'node-c'];
const T = ['c4-t', 'node-t'];
const RH = '/service/replica-handler';
const LEADER = 'leader';
const ADMIT = PARTITION_SERVICE_MESSAGE_TYPE.ADMIT_REPLICA;
const READ = ReplicaOperationMessageType.READ_COMMITTED_MEMBERSHIP;
const SCENARIO = {timeout: 120_000};

// The replica-handler addresses the re-read asks, in the order it must.
function memberReadOrder(stamp) {
  const leader = stamp.nodeIds[deriveRaftRsPeerId(stamp.leaderId)];
  const others = [...stamp.voters, ...stamp.learners]
    .map((peerId) => stamp.nodeIds[peerId])
    .filter((nodeId) => nodeId !== leader);
  return [leader, ...others].map((nodeId) => `${nodeId}${RH}`);
}

function registerReplicaHandlers(harness) {
  for (const [nodeId, handler] of harness.handlers) {
    harness.network.register(`${nodeId}${RH}`, async ({payload}) =>
      handler.handleMessage({payload, correlationId: `probe-${nodeId}`}));
  }
}

function recordDeliveries(harness) {
  const sent = [];
  const deliver = harness.network.deliver.bind(harness.network);
  harness.network.deliver = async (address, payload, options) => {
    if (typeof payload?.type === 'string') {
      sent.push({address, type: payload.type});
    }
    return deliver(address, payload, options);
  };
  return sent;
}

function recordAnswers(service) {
  const answered = [];
  const info = service.logger.info.bind(service.logger);
  service.logger.info = (message, fields) => {
    if (fields && typeof fields.outcome === 'string' && fields.operationId) {
      answered.push({...fields});
    }
    return info(message, fields);
  };
  return answered;
}

async function stampOf(leader) {
  return committedStampOfAnswer(await leader.raft.readCommittedMembership({
    purpose: COMMITTED_MEMBERSHIP_READ_PURPOSE.BOOTSTRAP}));
}

function otherLeader(harness, oldLeader) {
  return [...harness.services.values()].find((service) =>
    service.replicaId !== oldLeader.replicaId &&
    service.raft?.readStatus?.()?.role === LEADER) ?? null;
}

async function buildTarget(harness, stamp) {
  const target = harness.build(T, {
    replicaIds: [A[0], B[0], C[0], T[0]],
    cache: metadataCache(PARTITION_ID, []),
    bootstrapMembership: stamp,
    isJoiningExistingGroup: true,
  });
  // The cadence stays out of the deterministic part; B re-arms it.
  target.learnerCatchUpCheckIntervalMs = 60_000;
  await target.initialize();
  assert.equal(target.systemTableCache.get(TABLES.SERVICES, stamp.leaderId) ?? null,
    null, 'setup: the target cache holds no leader row');
  return target;
}

function admitOperationFor(harness, admitters) {
  const operation = committedAddOperation(PARTITION_ID, T);
  harness.operations.push(operation);
  for (const [replicaId] of admitters) {
    harness.caches.get(replicaId).applySystemTableChange(TABLES.SERVICES,
      CDCOperation.INSERT, serviceRow(PARTITION_ID, T));
  }
  return operation;
}

async function becomesVoter(harness, target) {
  target.startElection();
  const targetPeerId = String(statusOf(target).peerId);
  return waitFor(() => {
    const leading = harness.leader();
    return Boolean(leading) && statusOf(leading).confState.voters
      .map(String).includes(targetPeerId);
  });
}

test('A: leadership moves before admission; the target follows the ' +
  'NOT_LEADER member hint at its committed node (real port, empty cache)',
SCENARIO, async () => {
  configure();
  const harness = createCommittedMembershipHarness(PARTITION_ID);
  try {
    await formGroup(harness, [A, B, C]);
    const oldLeader = harness.leader();
    const oldMember = harness.members.get(oldLeader.replicaId);
    const stamp = await stampOf(oldLeader);
    assert.equal(stamp.leaderId, oldLeader.replicaId,
      'setup: the stamp names the leader that served it');
    registerReplicaHandlers(harness);
    const target = await buildTarget(harness, stamp);
    // Leadership moves: the old leader is isolated until another leads,
    // then healed so it answers NOT_LEADER with the live leader.
    harness.network.cut(addressOf(oldMember), statusOf(oldLeader).peerId);
    assert.equal(await waitFor(() => otherLeader(harness, oldLeader) !== null, 40000),
      true, 'setup: another founder leads');
    const newLeader = otherLeader(harness, oldLeader);
    const newMember = harness.members.get(newLeader.replicaId);
    harness.network.heal();
    assert.equal(await waitFor(() =>
      statusOf(oldLeader).leaderId === newLeader.replicaId &&
      statusOf(oldLeader).role !== LEADER, 40000), true,
    'setup: the old leader follows the new one');
    const sent = recordDeliveries(harness);
    const admits = () => sent.filter((d) => d.type === ADMIT);
    const operation = admitOperationFor(harness, [A, B, C]);

    const request = await target.requestReplicaAdmission(operation.operation_id);
    assert.equal(admits()[0]?.address, addressOf(oldMember),
      'the first request goes to the stamp leader at its committed node');
    assert.equal(request.lastOutcome, 'not_leader', 'it answers NOT_LEADER');
    assert.equal(request.state, 'pending');
    assert.deepEqual({...request.leaderHint}, {replicaIdentity: newLeader.replicaId,
      address: addressOf(newMember)},
    'the hint names the live leader, a stamp member, at its committed node');
    assert.equal(request.rereadStamp, false, 'a usable hint: no re-read');
    assert.equal(target.leaderId, null, 'no leader id is seeded from the hint');

    await target.driveReplicaAdmission();
    assert.equal(admits()[1]?.address, addressOf(newMember),
      'the next request goes to the hinted member at its committed node');
    assert.equal(request.state, 'pending',
      'an in-flight proposal stays pending until committed');
    assert.equal(await becomesVoter(harness, target), true,
      'the target becomes a voter of the group');
    await target.driveReplicaAdmission();
    assert.equal(request.state, 'admitted',
      'committed membership settles the admission request');
  } finally {
    await harness.dispose();
  }
});

test('B: the stamp leader is unreachable and leadership moved; the target ' +
  're-reads its committed membership on the learner cadence and is admitted ' +
  'while it hears no raft leader of its own', SCENARIO, async () => {
  configure();
  const harness = createCommittedMembershipHarness(PARTITION_ID);
  try {
    await formGroup(harness, [A, B, C]);
    const oldLeader = harness.leader();
    const oldMember = harness.members.get(oldLeader.replicaId);
    const stamp = await stampOf(oldLeader);
    registerReplicaHandlers(harness);
    const target = await buildTarget(harness, stamp);
    const answered = recordAnswers(target);
    const sent = recordDeliveries(harness);
    const admits = () => sent.filter((d) => d.type === ADMIT);
    const reads = () => sent.filter((d) => d.type === READ);
    // No member's node answers a read; the stamp leader's partition traffic
    // is cut as well, so the first request fails.
    harness.network.cut(addressOf(oldMember), statusOf(oldLeader).peerId);
    for (const [, nodeId] of [A, B, C]) {
      harness.network.cut(`${nodeId}${RH}`, 'no-peer');
    }
    assert.equal(await waitFor(() => otherLeader(harness, oldLeader) !== null, 40000),
      true, 'setup: another founder leads');
    const newLeader = otherLeader(harness, oldLeader);
    const newMember = harness.members.get(newLeader.replicaId);
    const operation = admitOperationFor(harness, [A, B, C]);

    const request = await target.requestReplicaAdmission(operation.operation_id);
    assert.equal(admits()[0]?.address, addressOf(oldMember),
      'the first request goes to the stamp leader at its committed node');
    assert.equal(request.lastOutcome, 'transport_failed', 'the delivery fails');
    assert.equal(request.state, 'pending');
    assert.equal(request.leaderHint, null);
    assert.equal(request.rereadStamp, true, 'a failed delivery: re-read next');

    await target.driveReplicaAdmission();
    assert.deepEqual(reads().map((d) => d.address), memberReadOrder(stamp),
      'the re-read asks the stamp leader\'s node first (not the target\'s ' +
      'own node, not a row), then the stamp\'s other members in stamp order');
    assert.equal(request.lastOutcome, 'not_leader');
    assert.equal(answered.at(-1)?.reason, 'admission_stamp_unreadable',
      'typed STAMP_UNREADABLE while no member answers');
    assert.equal(request.rereadStamp, true, 'and the re-read is kept');
    assert.equal(admits().length, 1, 'no request is sent without a readable membership');
    assert.equal(request.stamp.leaderId, oldLeader.replicaId,
      'the held stamp is unchanged');

    // The finite failure clears; the old leader follows the new one.
    const askedWhileUnreachable = reads().length;
    harness.network.heal();
    assert.equal(await waitFor(() =>
      statusOf(oldLeader).leaderId === newLeader.replicaId &&
      statusOf(oldLeader).role !== LEADER, 40000), true,
    'setup: the old leader follows the new one');
    assert.equal(statusOf(target).leaderId ?? null, null,
      'the target hears no raft leader before its admission');
    assert.equal(target.readLiveRaftLeaderId(), null,
      'readLiveRaftLeaderId: none');
    // The learner cadence, not a manual drive, carries the request from here.
    if (target.learnerPromotionTimer) {
      clearTimeout(target.learnerPromotionTimer);
      target.learnerPromotionTimer = null;
    }
    target.learnerCatchUpCheckIntervalMs = 40;
    target.scheduleLearnerPromotion();
    assert.ok(target.learnerPromotionTimer, 'setup: the cadence is armed');
    assert.equal(await waitFor(() => request.state === 'admitted', 6000), true,
      'the cadence admits it (the drive runs before the leader gate)');
    assert.equal(request.stamp.leaderId, newLeader.replicaId,
      'the re-read stamp names the live leader');
    const healed = reads().slice(askedWhileUnreachable).map((d) => d.address);
    assert.deepEqual(healed, [`${oldMember[1]}${RH}`, `${newMember[1]}${RH}`],
      'the successful re-read asked the stamp leader\'s node first and ' +
      'followed its NOT_LEADER redirect to the live leader\'s node');
    assert.equal(admits().at(-1)?.address, addressOf(newMember),
      'the admitting request went to the live leader at its committed node');
    assert.equal(await becomesVoter(harness, target), true,
      'the target becomes a voter of the group');
  } finally {
    await harness.dispose();
  }
});

test('C: the stamp leader never returns; the re-read walks the stamp\'s ' +
  'other committed members and the live leader admits the target',
SCENARIO, async () => {
  configure();
  const harness = createCommittedMembershipHarness(PARTITION_ID);
  try {
    await formGroup(harness, [A, B, C]);
    const oldLeader = harness.leader();
    const oldMember = harness.members.get(oldLeader.replicaId);
    const stamp = await stampOf(oldLeader);
    registerReplicaHandlers(harness);
    const target = await buildTarget(harness, stamp);
    const sent = recordDeliveries(harness);
    harness.network.cut(addressOf(oldMember), statusOf(oldLeader).peerId);
    harness.network.cut(`${oldMember[1]}${RH}`, 'no-peer');
    assert.equal(await waitFor(() => otherLeader(harness, oldLeader) !== null, 40000),
      true, 'setup: another founder leads');
    const newLeader = otherLeader(harness, oldLeader);
    const newMember = harness.members.get(newLeader.replicaId);
    const operation = admitOperationFor(harness, [A, B, C]);
    const request = await target.requestReplicaAdmission(operation.operation_id);
    assert.equal(request.rereadStamp, true, 'the dead leader: re-read next');

    await target.driveReplicaAdmission();
    const reads = sent.filter((d) => d.type === READ).map((d) => d.address);
    const order = memberReadOrder(stamp);
    assert.equal(reads[0], order[0], 'the stamp leader\'s node is asked first');
    assert.equal(reads[1], order[1], 'then the next member in stamp order');
    assert.ok(new Set(reads).size > 1, 'it does not stop at the dead node');
    assert.equal(request.state, 'pending',
      'an in-flight proposal stays pending until committed');
    assert.equal(request.stamp.leaderId, newLeader.replicaId,
      'the re-read stamp names the live leader');
    assert.equal(sent.filter((d) => d.type === ADMIT).at(-1).address,
      addressOf(newMember), 'at the live leader committed node');
    assert.equal(await becomesVoter(harness, target), true,
      'the target becomes a voter of the group');
    await target.driveReplicaAdmission();
    assert.equal(request.state, 'admitted',
      'committed membership settles the admission request');
  } finally {
    await harness.dispose();
  }
});

test('the re-read order is the stamp leader then the other members in stamp ' +
  'order; a stamp placing no one leaves the read its own routing', async () => {
  const peer = (name) => deriveRaftRsPeerId(name);
  const stamp = {kind: 'committed', leaderId: 'r2',
    voters: [peer('r1'), peer('r2')], learners: [peer('r3')],
    identities: {}, nodeIds: {[peer('r1')]: 'n1', [peer('r2')]: 'n2',
      [peer('r3')]: 'n3'}};
  assert.deepEqual(admissionStampReads(stamp).map((read) => read.firstNodeId),
    ['n2', 'n1', 'n3']);
  assert.deepEqual(admissionStampReads({...stamp, nodeIds: {
    [peer('r1')]: 'n1', [peer('r2')]: 'n1', [peer('r3')]: 'n3'}})
    .map((read) => read.firstNodeId), ['n1', 'n3'], 'one read per node');
  assert.deepEqual(admissionStampReads({...stamp, leaderId: null})
    .map((read) => read.firstNodeId), ['n1', 'n2', 'n3'], 'no leader: stamp order');
  assert.deepEqual(admissionStampReads(null), [{}], 'no stamp: self routed');
});

test('D: NOT_LEADER naming a non-member on the real port: the hint is ' +
  'ignored, the stamp is re-read, the target is admitted', SCENARIO, async () => {
  configure();
  const harness = createCommittedMembershipHarness(PARTITION_ID);
  try {
    await formGroup(harness, [A, B, C]);
    const oldLeader = harness.leader();
    const oldMember = harness.members.get(oldLeader.replicaId);
    const stamp = await stampOf(oldLeader);
    registerReplicaHandlers(harness);
    const target = await buildTarget(harness, stamp);
    harness.network.cut(addressOf(oldMember), statusOf(oldLeader).peerId);
    assert.equal(await waitFor(() => otherLeader(harness, oldLeader) !== null, 40000),
      true, 'setup: another founder leads');
    const newLeader = otherLeader(harness, oldLeader);
    const newMember = harness.members.get(newLeader.replicaId);
    harness.network.heal();
    assert.equal(await waitFor(() =>
      statusOf(oldLeader).leaderId === newLeader.replicaId &&
      statusOf(oldLeader).role !== LEADER, 40000), true, 'setup: old leader follows');
    const sent = recordDeliveries(harness);
    const operation = admitOperationFor(harness, [A, B, C]);
    const live = oldLeader.readLiveRaftLeaderId;
    oldLeader.readLiveRaftLeaderId = () => 'c4-stranger';
    const request = await target.requestReplicaAdmission(operation.operation_id);
    oldLeader.readLiveRaftLeaderId = live;
    assert.equal(request.lastOutcome, 'not_leader');
    assert.equal(request.leaderHint, null, 'the non-member hint is ignored');
    assert.equal(request.rereadStamp, true, 'the stamp is re-read next');
    await target.driveReplicaAdmission();
    assert.equal(request.state, 'pending',
      'an in-flight proposal stays pending until committed');
    assert.equal(request.stamp.leaderId, newLeader.replicaId, 'fresh stamp');
    assert.equal(sent.filter((d) => d.type === ADMIT).at(-1).address,
      addressOf(newMember), 'at the live leader committed node');
    assert.equal(sent.some((d) => d.address.includes('c4-stranger')), false,
      'nothing is sent to the stranger');
    assert.equal(await becomesVoter(harness, target), true,
      'the target becomes a voter of the group');
    await target.driveReplicaAdmission();
    assert.equal(request.state, 'admitted', 'admitted after commit');
  } finally {
    await harness.dispose();
  }
});

test('E: old leader accepts proposal (in_flight) while isolated from quorum ' +
  'and disappears before commit; a founder that was never asked becomes ' +
  'leader and the target re-drives admission to become a voter',
SCENARIO, async () => {
  configure();
  const harness = createCommittedMembershipHarness(PARTITION_ID);
  try {
    await formGroup(harness, [A, B, C]);
    const oldLeader = harness.leader();
    const oldMember = harness.members.get(oldLeader.replicaId);
    const stamp = await stampOf(oldLeader);
    registerReplicaHandlers(harness);
    const target = await buildTarget(harness, stamp);
    const sent = recordDeliveries(harness);
    const operation = admitOperationFor(harness, [A, B, C]);

    // Drop outgoing Raft packets from oldLeader so its proposal cannot commit,
    // while still allowing target's ADMIT_REPLICA RPC to reach oldLeader.
    harness.network.cut('no-address', statusOf(oldLeader).peerId);
    const request = await target.requestReplicaAdmission(operation.operation_id);
    assert.equal(request.lastOutcome, 'in_flight',
      'old leader accepted the proposal into its uncommitted local log');
    assert.equal(request.state, 'pending',
      'uncommitted proposal does not settle the target admission request');

    // Now oldLeader disappears completely and the surviving founders elect a
    // new leader that was never asked to admit the target.
    harness.network.cut(addressOf(oldMember), statusOf(oldLeader).peerId);
    harness.network.cut(`${oldMember[1]}${RH}`, 'no-peer');
    assert.equal(await waitFor(() => otherLeader(harness, oldLeader) !== null, 40000),
      true, 'setup: surviving founders elect a new leader');
    const newLeader = otherLeader(harness, oldLeader);
    const newMember = harness.members.get(newLeader.replicaId);

    await target.driveReplicaAdmission();
    assert.equal(request.lastOutcome, 'transport_failed',
      're-drive to disappeared old leader fails and arms stamp re-read');
    assert.equal(request.rereadStamp, true);

    await target.driveReplicaAdmission();
    assert.equal(request.stamp.leaderId, newLeader.replicaId,
      'stamp re-read discovers the new leader');
    assert.equal(sent.filter((d) => d.type === ADMIT).at(-1).address,
      addressOf(newMember),
      'target sends ADMIT_REPLICA to the new leader that was never asked');
    assert.equal(await becomesVoter(harness, target), true,
      'the target is admitted by the new leader and becomes a committed voter');
    await target.driveReplicaAdmission();
    assert.equal(request.state, 'admitted',
      'committed membership settles the admission request');
  } finally {
    await harness.dispose();
  }
});
