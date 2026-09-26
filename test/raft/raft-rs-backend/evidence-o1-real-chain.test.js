// The committed-read boundary through the production chain end to end
// (committed-read amendment 1, section 5): real PartitionService replicas on
// rs-raft, the creation owner's bootstrap read routed to the leader's node,
// the ReplicaHandler's stamp validation, the port opened from the stamp,
// row-driven admission by the leader. Every run plants a rows-vs-committed
// disagreement (a committed voter omitted from the rows, a removed founder
// and a phantom still present) so a stamp built from rows is
// distinguishable from the committed configuration.
//
//   M2  differential: the stamp the creation owner persists equals the fold
//       of the leader's durable log over the TEST'S genesis (O-a) and differs
//       from the row-derived stamp exactly on the planted disagreement; the
//       target opens on a configuration holding the omitted voter before it
//       participates and converges on the members (O-b);
//   M5  the D1 case-2 diagnostic: members' durable terms constant, leader
//       unchanged, no vote for the target, over 3 s at 100 ms samples, with
//       the target's timers asked for - the row never reaching the members,
//       and the row visible to every member while the target holds its own
//       AddNode unlearned (commit lag);
//   M3  a dropped AddNode (two rows in one turn) is re-driven by the
//       membership change: both targets admitted, one AddNode entry each in
//       the durable log, both gates open, no further row change;
//   anchors: NOT_LEADER without a leader address, no hint, and a follower
//       hint (one redirect); GENESIS refused where discovery shows a replica
//       outside the founders.

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
  bindingWireNumbers,
  durableAppliedState,
  durableHardState,
  durableLog,
  foldAt,
  logFold,
  reservedIdentities,
} from './committed-membership-oracles.js';
import {CDCOperation} from '../../../src/partition/partition-service.js';
import {TABLES} from '../../../src/constants/index.js';
import {RAFT_MEMBERSHIP_OPERATION} from
  '../../../src/raft/raft-operation-port-constants.js';
import {
  COMMITTED_MEMBERSHIP_REFUSAL,
  COMMITTED_MEMBERSHIP_STAMP_KIND,
} from '../../../src/raft/raft-committed-membership-constants.js';
import {ascendingPeerIdOrder} from
  '../../../src/raft/raft-rs-committed-membership-read.js';
import {deriveRaftRsPeerId} from '../../../src/raft/raft-rs-peer-identity.js';
import {ReplicaOperationField} from
  '../../../src/rebalancer/replica-operation-constants.js';
import {reservePartitionRaftPeerIdentity} from
  '../../../src/partition/partition-service-raft-membership-administration.js';

const PARTITION_ID = 'evidence-o1-real';
const WIRE = bindingWireNumbers();
const LEADER_ROLE = 'leader';
const CANDIDATE_ROLE = 'candidate';
const DIAGNOSTIC_WINDOW_MS = 3000;
const DIAGNOSTIC_SAMPLE_MS = 100;
const ADMISSION_BOUND_MS = 8000;
const CANDIDATE_TARGET_NAMES = 100;
const PHANTOM = ['real-phantom', 'node-phantom'];

function genesisPeerIds(harness, founders) {
  const reserved = new Map([...reservedIdentities(harness.dbPathOf(
    harness.leaderMember()))].map(([peerId, identity]) => [identity, peerId]));
  return founders.map(([replicaId]) => reserved.get(replicaId));
}

function leaderDurable(harness) {
  const dbFile = harness.dbPathOf(harness.leaderMember());
  return {dbFile, applied: durableAppliedState(dbFile, PARTITION_ID)};
}

// The stamp a creator that read the ROWS would produce: the rows' replica
// ids as raft peer ids by the production derivation.
function rowDerivedVoters(rows) {
  return rows.map((row) => deriveRaftRsPeerId(row.replica_id))
    .sort(ascendingPeerIdOrder);
}

// A target identity whose derived raft id sorts first among the members:
// its election jitter index is 0, so its first election timeout would fall
// inside the diagnostic window if its timers ran.
function firstSortingTarget(prefix, others) {
  const otherIds = others.map(([replicaId]) => deriveRaftRsPeerId(replicaId));
  for (let index = 0; index < CANDIDATE_TARGET_NAMES; index += 1) {
    const candidate = `${prefix}-${index}`;
    const id = deriveRaftRsPeerId(candidate);
    if (otherIds.every((other) => ascendingPeerIdOrder(id, other) < 0)) {
      return candidate;
    }
  }
  throw new Error('no candidate target identity sorts first');
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

// Commit one change through the leader's port, settled on the leader's
// durable applied configuration.
async function commitOnLeader(harness, type, replicaId) {
  const leader = harness.leader();
  reservePartitionRaftPeerIdentity(leader, replicaId);
  const peerId = deriveRaftRsPeerId(replicaId);
  const shows = () => leaderDurable(harness).applied.voters.includes(peerId) ===
    (type === RAFT_MEMBERSHIP_OPERATION.ADD_PEER);
  await leader.raft.proposeConfChange({type, replicaIdentity: replicaId});
  assert.equal(await waitFor(shows), true, `setup: ${type} ${replicaId}`);
}

// A group with a committed configuration that disagrees with its founders'
// rows: founders a, b, c; +d joined through the chain; -b committed.
async function skewedGroup(harness, founders, joiner) {
  await formGroup(harness, founders);
  const created = await createJoinOperation(harness, {target: joiner,
    rows: founders.map((member) => serviceRow(PARTITION_ID, member)),
    leaderHint: harness.leaderMember()[1]});
  assert.equal(created.error, undefined, created.error?.message);
  await buildTargetFromOperation(harness, {target: joiner,
    operation: created.operation, cache: metadataCache(PARTITION_ID, [])});
  assert.equal(await admitThroughRows(harness, joiner, founders), true,
    'setup: the group admits the joiner');
  const [, removed] = founders;
  await commitOnLeader(harness, RAFT_MEMBERSHIP_OPERATION.REMOVE_PEER,
    removed[0]);
  harness.network.cut(addressOf(removed), deriveRaftRsPeerId(removed[0]));
  return {removed};
}

test('M2 (differential): the persisted stamp is the fold of the leader ' +
  'durable log, not the rows; the target holds the omitted committed voter ' +
  'before it participates and converges on the members', async () => {
  configure();
  const harness = createCommittedMembershipHarness(PARTITION_ID);
  const founders = [['m2-a', 'node-a'], ['m2-b', 'node-b'],
    ['m2-c', 'node-c']];
  const joiner = ['m2-d', 'node-d'];
  const target = ['m2-t', 'node-t'];
  try {
    const {removed} = await skewedGroup(harness, founders, joiner);
    const genesis = genesisPeerIds(harness, founders);
    // The rows handed to the creation owner: the founders (b still present
    // though removed) and a phantom; d, a committed voter, omitted.
    const rows = [...founders, PHANTOM].map((member) =>
      serviceRow(PARTITION_ID, member));
    const created = await createJoinOperation(harness, {target, rows,
      leaderHint: harness.leaderMember()[1]});
    assert.equal(created.error, undefined, created.error?.message);
    const stamp = created.operation[ReplicaOperationField.BOOTSTRAP_MEMBERSHIP];
    const {dbFile, applied} = leaderDurable(harness);
    const fold = foldAt(logFold(dbFile, PARTITION_ID, genesis),
      stamp.appliedIndex);
    assert.equal(stamp.kind, COMMITTED_MEMBERSHIP_STAMP_KIND.COMMITTED);
    assert.deepEqual([...stamp.voters].sort(), fold.voters,
      'O-a: the stamp voters are the fold of the leader log at its label');
    assert.deepEqual([...stamp.learners].sort(), fold.learners);
    assert.deepEqual(stamp.votersOutgoing, []);
    assert.equal(stamp.appliedIndex, applied.appliedIndex,
      'the label is the leader durable applied index');
    const reserved = reservedIdentities(dbFile);
    for (const peerId of stamp.voters) {
      assert.equal(stamp.identities[peerId], reserved.get(peerId),
        'identities are the leader durable reservations');
    }
    const fromRows = rowDerivedVoters(rows);
    assert.notDeepEqual(fromRows, [...stamp.voters].sort(ascendingPeerIdOrder),
      'differential: a row-derived stamp differs');
    const joinerPeerId = deriveRaftRsPeerId(joiner[0]);
    assert.ok(stamp.voters.includes(joinerPeerId) &&
      !fromRows.includes(joinerPeerId),
    'the committed voter the rows omit is in the stamp');
    for (const absent of [removed[0], PHANTOM[0]]) {
      assert.ok(fromRows.includes(deriveRaftRsPeerId(absent)) &&
        !stamp.voters.includes(deriveRaftRsPeerId(absent)),
      `the row-only id ${absent} is not in the stamp`);
    }

    // The target opens from the stamp over a cache that claims the rows.
    const {service} = await buildTargetFromOperation(harness, {target,
      operation: created.operation,
      cache: metadataCache(PARTITION_ID, [...founders, PHANTOM])});
    const targetPeerId = String(statusOf(service).peerId);
    const opened = durableAppliedState(harness.dbPathOf(target), PARTITION_ID);
    assert.equal(opened.appliedIndex, 0);
    assert.equal(opened.bootstrapIndex, stamp.appliedIndex);
    assert.equal(opened.admissionIndex, null);
    assert.deepEqual(opened.voters, [...fold.voters, targetPeerId].sort(),
      'the index-0 configuration is the fold plus self: the omitted voter ' +
        'is held before the target participates');
    assert.equal(statusOf(service).gateOpen, false);

    // Admission by the group; the target converges.
    const members = [founders[0], founders[2], joiner];
    const samples = [];
    const sampling = setInterval(() => samples.push(durableAppliedState(
      harness.dbPathOf(target), PARTITION_ID)), 10);
    assert.equal(await admitThroughRows(harness, target, members), true,
      'the group admits the target');
    assert.equal(await waitFor(() => statusOf(service).gateOpen === true),
      true, 'the target gate opens');
    clearInterval(sampling);
    for (const sample of samples) {
      assert.ok(sample.voters.includes(joinerPeerId),
        'the omitted committed voter is never erased from the target view');
      assert.ok(!sample.voters.includes(deriveRaftRsPeerId(PHANTOM[0])),
        'the phantom never enters the target view');
    }
    const leaderLog = durableLog(dbFile, PARTITION_ID);
    const admission = logFold(dbFile, PARTITION_ID, []).find((snapshot) =>
      snapshot.voters.includes(targetPeerId)).index;
    const converged = durableAppliedState(harness.dbPathOf(target),
      PARTITION_ID);
    assert.equal(converged.admissionIndex, admission,
      'a_self is the AddNode of the target in the leader durable log');
    const targetLog = durableLog(harness.dbPathOf(target), PARTITION_ID);
    assert.deepEqual(targetLog.map((entry) => [entry.index, entry.term,
      entry.data ?? null]), leaderLog.slice(0, targetLog.length).map(
      (entry) => [entry.index, entry.term, entry.data ?? null]),
    'O-c: the target log is a prefix of the leader log, payload for payload');
    assert.deepEqual(converged.voters, foldAt(logFold(dbFile, PARTITION_ID,
      genesis), converged.appliedIndex).voters,
    'O-a: the converged configuration is the fold at its index');
    for (const member of members) {
      const durable = durableAppliedState(harness.dbPathOf(member),
        PARTITION_ID);
      if (durable.appliedIndex === converged.appliedIndex) {
        assert.deepEqual(durable.voters, converged.voters,
          `O-b: ${member[0]} agrees at index ${durable.appliedIndex}`);
      }
    }
  } finally {
    await harness.dispose();
  }
});

// Members' durable hard states and the leader, sampled over the window.
async function sampleMembers(harness, members, target) {
  const targetPeerId = deriveRaftRsPeerId(target[0]);
  const samples = [];
  const deadline = Date.now() + DIAGNOSTIC_WINDOW_MS;
  while (Date.now() < deadline) {
    samples.push({
      leader: harness.leaderMember()?.[0] ?? null,
      hard: members.map((member) => durableHardState(harness.dbPathOf(member),
        PARTITION_ID)),
      target: {
        hard: durableHardState(harness.dbPathOf(target), PARTITION_ID),
        role: statusOf(harness.services.get(target[0])).role,
      },
    });
    await sleep(DIAGNOSTIC_SAMPLE_MS);
  }
  assert.ok(samples.length >= DIAGNOSTIC_WINDOW_MS / DIAGNOSTIC_SAMPLE_MS - 5,
    'the window was sampled');
  const terms = new Set(samples.map((sample) =>
    JSON.stringify(sample.hard.map((hard) => hard.term))));
  assert.equal(terms.size, 1, 'M5: every member\'s durable term is constant');
  assert.equal(new Set(samples.map((sample) => sample.leader)).size, 1,
    'M5: the leader is unchanged (zero step-downs)');
  assert.notEqual(samples[0].leader, null, 'M5: there is a leader throughout');
  for (const sample of samples) {
    for (const hard of sample.hard) {
      assert.notEqual(hard.vote, targetPeerId, 'no member voted for the target');
    }
    assert.notEqual(sample.target.role, LEADER_ROLE);
    assert.notEqual(sample.target.role, CANDIDATE_ROLE,
      'the target never campaigns');
    assert.notEqual(sample.target.hard?.vote, targetPeerId,
      'O-d: the target never voted for itself');
  }
  const groupTerm = Number(samples[0].hard[0].term);
  assert.ok(samples.every((sample) =>
    Number(sample.target.hard?.term ?? 0) <= groupTerm),
  'O-d: the target term never exceeds the group term');
}

test('M5 (row never reaches the members): the unadmitted target with its ' +
  'timers asked for disturbs nothing over 3 s', async () => {
  configure();
  const harness = createCommittedMembershipHarness(PARTITION_ID);
  const founders = [['m5a-a', 'node-a'], ['m5a-b', 'node-b'],
    ['m5a-c', 'node-c']];
  const target = [firstSortingTarget('m5a-t', founders), 'node-t'];
  try {
    await formGroup(harness, founders);
    const created = await createJoinOperation(harness, {target,
      rows: [...founders, PHANTOM].map((member) =>
        serviceRow(PARTITION_ID, member)),
      leaderHint: harness.leaderMember()[1]});
    assert.equal(created.error, undefined, created.error?.message);
    const {service} = await buildTargetFromOperation(harness, {target,
      operation: created.operation,
      cache: metadataCache(PARTITION_ID, [...founders, target])});
    service.startElection();
    await sampleMembers(harness, founders, target);
    assert.equal(statusOf(service).gateOpen, false);
  } finally {
    await harness.dispose();
  }
});

test('M5 (row visible to every member, commit lag): the admitted-but-not-' +
  'yet-applied target with its timers asked for disturbs nothing over 3 s, ' +
  'then joins without an election', async () => {
  configure();
  const harness = createCommittedMembershipHarness(PARTITION_ID);
  const founders = [['m5b-a', 'node-a'], ['m5b-b', 'node-b'],
    ['m5b-c', 'node-c']];
  const target = [firstSortingTarget('m5b-t', founders), 'node-t'];
  try {
    await formGroup(harness, founders);
    const created = await createJoinOperation(harness, {target,
      rows: founders.map((member) => serviceRow(PARTITION_ID, member)),
      leaderHint: harness.leaderMember()[1]});
    assert.equal(created.error, undefined, created.error?.message);
    const {service} = await buildTargetFromOperation(harness, {target,
      operation: created.operation,
      cache: metadataCache(PARTITION_ID, [...founders, target])});
    const cap = {value: durableLog(leaderDurable(harness).dbFile,
      PARTITION_ID).at(-1).index};
    harness.network.rewriteTo(addressOf(target), (message) => ({
      ...message,
      ...(message.commit === undefined ? {} : {commit: String(Math.min(
        Number(message.commit), cap.value))}),
    }));
    for (const [replicaId] of founders) {
      harness.caches.get(replicaId).applySystemTableChange(TABLES.SERVICES,
        CDCOperation.INSERT, serviceRow(PARTITION_ID, target));
    }
    const targetPeerId = deriveRaftRsPeerId(target[0]);
    const admitted = () => logFold(leaderDurable(harness).dbFile,
      PARTITION_ID, []).find((snapshot) =>
      snapshot.voters.includes(targetPeerId))?.index ?? null;
    assert.equal(await waitFor(() => admitted() !== null), true,
      'setup: the leader committed the target AddNode from its row');
    const aSelf = admitted();
    cap.value = aSelf - 1;
    assert.equal(await waitFor(() => {
      const applied = durableAppliedState(harness.dbPathOf(target),
        PARTITION_ID);
      return applied.appliedIndex === aSelf - 1 &&
        (durableLog(harness.dbPathOf(target), PARTITION_ID).at(-1)?.index ??
          0) >= aSelf;
    }), true, 'setup: the target holds its AddNode, applied one below it');
    service.startElection();
    await sampleMembers(harness, founders, target);
    assert.equal(statusOf(service).gateOpen, false);
    const termsBefore = founders.map((member) =>
      durableHardState(harness.dbPathOf(member), PARTITION_ID).term);
    harness.network.rewriteTo(addressOf(target), null);
    assert.equal(await waitFor(() => statusOf(service).gateOpen === true),
      true, 'the gate opens once the commit is learned');
    await sleep(DIAGNOSTIC_WINDOW_MS / 3);
    assert.deepEqual(founders.map((member) =>
      durableHardState(harness.dbPathOf(member), PARTITION_ID).term),
    termsBefore, 'the admitted target joined without an election');
    assert.equal(durableAppliedState(harness.dbPathOf(target),
      PARTITION_ID).admissionIndex, aSelf);
  } finally {
    await harness.dispose();
  }
});

test('M5 (row visible to every member, catch-up stalled): the admitted-but-' +
  'not-yet-applied target hears nothing for 3 s with its timers asked for, ' +
  'and disturbs nothing', async () => {
  configure();
  const harness = createCommittedMembershipHarness(PARTITION_ID);
  const founders = [['m5c-a', 'node-a'], ['m5c-b', 'node-b'],
    ['m5c-c', 'node-c']];
  const target = [firstSortingTarget('m5c-t', founders), 'node-t'];
  try {
    await formGroup(harness, founders);
    const created = await createJoinOperation(harness, {target,
      rows: founders.map((member) => serviceRow(PARTITION_ID, member)),
      leaderHint: harness.leaderMember()[1]});
    assert.equal(created.error, undefined, created.error?.message);
    const {service} = await buildTargetFromOperation(harness, {target,
      operation: created.operation,
      cache: metadataCache(PARTITION_ID, [...founders, target])});
    const cap = {value: durableLog(leaderDurable(harness).dbFile,
      PARTITION_ID).at(-1).index};
    harness.network.rewriteTo(addressOf(target), (message) => ({
      ...message,
      ...(message.commit === undefined ? {} : {commit: String(Math.min(
        Number(message.commit), cap.value))}),
    }));
    for (const [replicaId] of founders) {
      harness.caches.get(replicaId).applySystemTableChange(TABLES.SERVICES,
        CDCOperation.INSERT, serviceRow(PARTITION_ID, target));
    }
    const targetPeerId = deriveRaftRsPeerId(target[0]);
    const admitted = () => logFold(leaderDurable(harness).dbFile,
      PARTITION_ID, []).find((snapshot) =>
      snapshot.voters.includes(targetPeerId))?.index ?? null;
    assert.equal(await waitFor(() => admitted() !== null), true,
      'setup: the leader committed the target AddNode from its row');
    const aSelf = admitted();
    cap.value = aSelf - 1;
    assert.equal(await waitFor(() => durableAppliedState(harness.dbPathOf(
      target), PARTITION_ID).appliedIndex === aSelf - 1), true,
    'setup: the target applied one below its AddNode');
    // The catch-up stalls: nothing reaches the target any more (a slow
    // leader, an admission stall); its own timers are asked for.
    harness.network.rewriteTo(addressOf(target), () => null);
    service.startElection();
    await sampleMembers(harness, founders, target);
    assert.equal(statusOf(service).gateOpen, false);
    harness.network.rewriteTo(addressOf(target), null);
    assert.equal(await waitFor(() => statusOf(service).gateOpen === true),
      true, 'the gate opens once the catch-up resumes');
  } finally {
    await harness.dispose();
  }
});

test('M3 (dropped AddNode): two rows in one turn, the second AddNode ' +
  'dropped behind the first, both admitted by the membership-change ' +
  're-drive - one AddNode entry each, both gates open, no further row',
async () => {
  configure();
  const harness = createCommittedMembershipHarness(PARTITION_ID);
  const founders = [['m3-a', 'node-a'], ['m3-b', 'node-b'],
    ['m3-c', 'node-c']];
  const joins = [['m3-t1', 'node-t1'], ['m3-t2', 'node-t2']];
  try {
    await formGroup(harness, founders);
    const services = [];
    for (const join of joins) {
      const created = await createJoinOperation(harness, {target: join,
        rows: founders.map((member) => serviceRow(PARTITION_ID, member)),
        leaderHint: harness.leaderMember()[1]});
      assert.equal(created.error, undefined, created.error?.message);
      services.push((await buildTargetFromOperation(harness, {target: join,
        operation: created.operation,
        cache: metadataCache(PARTITION_ID, [])})).service);
    }
    const {dbFile} = leaderDurable(harness);
    const entriesBefore = durableLog(dbFile, PARTITION_ID).length;
    for (const [replicaId] of founders) {
      for (const join of joins) {
        harness.caches.get(replicaId).applySystemTableChange(TABLES.SERVICES,
          CDCOperation.INSERT, serviceRow(PARTITION_ID, join));
      }
    }
    const peerIds = joins.map(([replicaId]) => deriveRaftRsPeerId(replicaId));
    assert.equal(await waitFor(() => services.every((service) =>
      statusOf(service).gateOpen === true), ADMISSION_BOUND_MS), true,
    'both joins are admitted and open: the dropped AddNode was re-driven');
    const log = durableLog(dbFile, PARTITION_ID).slice(entriesBefore);
    const addNodesOf = (peerId) => log.filter((entry) =>
      entry.entryType !== WIRE.entryType.EntryNormal &&
      logFold(dbFile, PARTITION_ID, []).find((snapshot) =>
        snapshot.index === entry.index).voters.includes(peerId) &&
      !logFold(dbFile, PARTITION_ID, []).find((snapshot) =>
        snapshot.index === entry.index - 1).voters.includes(peerId));
    const [first, second] = peerIds.map((peerId) => addNodesOf(peerId));
    assert.equal(first.length, 1, 'one AddNode entry for the first join');
    assert.equal(second.length, 1, 'one AddNode entry for the second join');
    const dropped = log.filter((entry) =>
      entry.entryType === WIRE.entryType.EntryNormal && entry.data == null);
    assert.ok(dropped.length >= 1,
      'setup: the core replaced the dropped proposal with an empty entry');
    for (const [index, join] of joins.entries()) {
      const durable = durableAppliedState(harness.dbPathOf(join),
        PARTITION_ID);
      assert.equal(durable.admissionIndex, [first, second][index][0].index,
        `${join[0]}: a_self is its AddNode in the leader durable log`);
    }
  } finally {
    await harness.dispose();
  }
});

test('anchors (routing): NOT_LEADER without a leader address, no hint at ' +
  'all, and a follower hint (one redirect) - only the last persists a stamp',
async () => {
  configure();
  const harness = createCommittedMembershipHarness(PARTITION_ID);
  const founders = [['rt-a', 'node-a'], ['rt-b', 'node-b'],
    ['rt-c', 'node-c']];
  const target = ['rt-t', 'node-t'];
  const rows = founders.map((member) => serviceRow(PARTITION_ID, member));
  try {
    // Built but not elected: every replica answers NOT_LEADER with no
    // leader to redirect to.
    for (const founder of founders) {
      harness.build(founder, {
        replicaIds: founders.map(([replicaId]) => replicaId),
        peerAddresses: founders.map(addressOf),
        cache: metadataCache(PARTITION_ID, founders),
        deferElection: true,
      });
    }
    for (const founder of founders) {
      await harness.services.get(founder[0]).initialize();
    }
    const leaderless = await createJoinOperation(harness, {target, rows,
      leaderHint: founders[0][1]});
    assert.equal(leaderless.operation, undefined,
      'nothing is persisted');
    assert.equal(leaderless.error?.code,
      COMMITTED_MEMBERSHIP_REFUSAL.MEMBERSHIP_UNREADABLE,
      'NOT_LEADER without a leader address is MEMBERSHIP_UNREADABLE');

    for (const founder of founders) {
      harness.services.get(founder[0]).startElection();
    }
    assert.equal(await waitFor(() =>
      harness.leader()?.raft.readStatus().appliedIndex > 0), true,
    'setup: a leader');
    const noHint = await createJoinOperation(harness, {target, rows,
      leaderHint: null});
    assert.equal(noHint.error?.code,
      COMMITTED_MEMBERSHIP_REFUSAL.MEMBERSHIP_UNREADABLE,
      'without a hint the coordinator asks its own node, which hosts ' +
        'nothing here: unreadable, nothing persisted');
    const follower = founders.find((member) =>
      member[1] !== harness.leaderMember()[1]);
    const redirected = await createJoinOperation(harness, {target, rows,
      leaderHint: follower[1]});
    assert.equal(redirected.error, undefined, redirected.error?.message);
    const stamp = redirected.operation[ReplicaOperationField.BOOTSTRAP_MEMBERSHIP];
    const {dbFile, applied} = leaderDurable(harness);
    assert.deepEqual([...stamp.voters].sort(), foldAt(logFold(dbFile,
      PARTITION_ID, genesisPeerIds(harness, founders)), applied.appliedIndex)
      .voters, 'O-a: one redirect reaches the leader and its fold');
    assert.deepEqual(harness.router.delivered.slice(-2).map(({nodeId}) =>
      nodeId), [follower[1], harness.leaderMember()[1]],
    'exactly one redirect: the follower node, then the leader node');
  } finally {
    await harness.dispose();
  }
});

test('anchor: GENESIS is refused where discovery shows a replica outside ' +
  'the founders, and founds where it does not', async () => {
  configure();
  const harness = createCommittedMembershipHarness(PARTITION_ID);
  const founders = [['gx-t', 'node-t'], ['gx-a', 'node-a'], ['gx-b', 'node-b']];
  const stamp = {kind: COMMITTED_MEMBERSHIP_STAMP_KIND.GENESIS,
    founders: founders.map(([replicaId]) => replicaId)};
  const resolve = (cache) => {
    const handler = harness.handlerOf('node-t');
    handler.systemTableCache = cache;
    return handler.resolveReplicaContext(PARTITION_ID, 'gx-t', {
      bootstrapReplicaIds: stamp.founders,
      bootstrapPeerAddresses: founders.map(addressOf),
      bootstrapMembership: stamp,
    });
  };
  try {
    assert.throws(() => resolve(metadataCache(PARTITION_ID,
      [...founders, ['gx-foreign', 'node-f']])), (error) => {
      assert.equal(error.code,
        COMMITTED_MEMBERSHIP_REFUSAL.GENESIS_REFUSED_GROUP_EXISTS);
      return true;
    }, 'a discovered replica outside the founders refuses GENESIS');
    const founding = resolve(metadataCache(PARTITION_ID, founders,
      {leaderNodeId: 'node-a'}));
    assert.equal(founding.existingReplicaCount, 0,
      'rows naming a leader and the founders do not make a founder a joiner');
    assert.deepEqual(founding.bootstrapMembership, stamp);
  } finally {
    await harness.dispose();
  }
});
