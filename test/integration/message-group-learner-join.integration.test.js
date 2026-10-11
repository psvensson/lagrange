/** Current CREATE through a real learner join (FreshMG 6.B slice B2).
 * The B1 chain (real operation row, membership claim, authorization CAS,
 * native ADD_LEARNER on three real raft-rs founders, recorder, CREATE
 * admission CAS, MATERIALIZED, sole worker) now reaches the real learner-join
 * capability: leader-produced descriptor, install through the install owner,
 * a MessageGroupService opened from the image alone, and RUNNING only after
 * the group's leader acknowledges it caught up. Interleavings are injected at
 * the descriptor route, which the worker crosses after MATERIALIZED and
 * before the install commit (the effect boundary). SENDING, boot rows, the
 * cross-node routes, a raw native REMOVE and the forged/altered descriptors
 * of the negatives are fixture actuation or test physics (see the fixtures);
 * this is no driver, production wiring, promotion or physical proof.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';
import Database from 'better-sqlite3';

import {ReplicaOperationResponseStatus as STATUS} from
  '../../src/rebalancer/replica-operation-constants.js';
import {RaftRsDurableStore} from '../../src/raft/raft-rs-durable-store.js';
import {deriveRaftRsPeerId} from '../../src/raft/raft-rs-peer-identity.js';
import {RAFT_MEMBERSHIP_OPERATION, RAFT_OPERATION} from
  '../../src/raft/raft-operation-port-constants.js';
import {resolveReplicaCheckpointsRoot} from '../../src/raft/snapshot-install.js';
import {RAFT_SNAPSHOT_INSTALL_DIRNAME, RAFT_SNAPSHOT_INSTALL_MARKER_FILE,
  RAFT_SNAPSHOT_INSTALL_STAGING_FILE} from '../../src/raft/snapshot-install-constants.js';
import {RAFT_CHECKPOINT_PAYLOAD_SIDECAR_SUFFIXES} from
  '../../src/raft/snapshot-checkpoint-constants.js';
import {MEMBERSHIP_OBLIGATION} from
  '../../src/rebalancer/replica-operation-message-group-membership-permit.js';
import {encodeCommittedLearnerAdmission, decodeCommittedLearnerAdmission} from
  '../../src/raft/raft-rs-committed-membership-context.js';
import {sha256Digest, writeAtomicDurable} from '../../src/runtime/oci-host-agent-durable-files.js';
import {MessageGroupServiceHandlerSetup} from
  '../../src/bootstrap/shared/message-group-service-handler-setup.js';
import {MessageGroupService} from '../../src/message-group/message-group-service.js';
import {durableRecordBootstrap} from '../../src/raft/raft-committed-membership-stamp.js';
import {FOUNDERS, GROUP, O, TARGET} from '../test-helpers/learner-operation-fixture.js';
import {createFixture, createHandler, createPayload, replaceBoot, selectAbortLearner,
  settle, settleFailed} from '../test-helpers/message-group-create-fixture.js';
import {LEARNER_ADDRESS, learnerJoinWorld, produceOn, transferImage} from
  '../test-helpers/message-group-learner-join-fixture.js';

const TARGET_PEER = deriveRaftRsPeerId(TARGET);
const OUTCOME = Object.freeze({RUNNING: 'message_group_learner_running',
  NOT_CAUGHT_UP: 'message_group_learner_not_caught_up'});
const REFUSAL = Object.freeze({
  TARGET_PRESENT: 'message_group_learner_join_target_present',
  DESCRIPTOR_UNAVAILABLE: 'message_group_learner_join_descriptor_unavailable',
  NOT_IN_CONFIGURATION: 'message_group_learner_join_learner_not_in_configuration',
  DESCRIPTOR_MISMATCH: 'message_group_learner_join_descriptor_mismatch',
  DESCRIPTOR_STALE: 'message_group_learner_join_descriptor_stale',
  INSTALL_REFUSED: 'message_group_learner_join_install_refused',
  OPEN_REFUSED: 'message_group_learner_join_open_refused',
  OPEN_NOT_LEARNER: 'message_group_learner_join_open_not_learner',
  DESCRIPTOR_MOVED: 'message_group_learner_join_descriptor_moved',
});
const ADMISSION_DEFERRED = 'REPLICA_CREATE_ADMISSION_DEFERRED';
const ADMISSION_RETAINED = 'message_group_create_admission_retained';
const NOT_LEADER = 'membership-read-not-leader';
const GENERATION_MISMATCH = 'create_generation_mismatch';

const leaderOf = (f) => f.cluster.leaderReplicaId();
const leaderStatus = (f) => f.cluster.node(leaderOf(f)).readStatus();
const learnerRequest = () => ({groupId: GROUP, targetReplicaId: TARGET, targetPeerId: TARGET_PEER});

function recordedOrigin(f) {
  const db = new Database(f.cluster.replica(f.leader).dbFile, {readonly: true});
  try {
    return db.prepare('SELECT learner_admission FROM raft_rs_peer_identity ' +
      'WHERE replica_identity = ?').get(TARGET).learner_admission;
  } finally {
    db.close();
  }
}

/** Real leadership transfer on the founders' own ports. */
function transferLeadership(f, successor) {
  const from = leaderOf(f);
  const transfer = f.cluster.node(from).transferLeadership({successor: 'named',
    replicaIdentity: successor});
  assert.equal(transfer.outcome, 'CORE_OK', JSON.stringify(transfer));
  f.cluster.tickers = [successor];
  assert.ok(f.cluster.settle(() => leaderOf(f) === successor, {rounds: 400}),
    `${successor} takes leadership from ${from}`);
  return from;
}

/** A join that answered with a typed refusal: CREATE_FAILED once, and no
 * learner left open by it (`openBefore` learners were already open). */
async function assertRefusedJoin(world, outcomes, code, message, openBefore = 0) {
  assert.equal(await world.answered(), true, `${message}: the join answers`);
  const [{error, answer}] = world.answers;
  assert.equal(answer, undefined, `${message}: ${JSON.stringify(answer)}`);
  assert.equal(error?.code, code, `${message}: ${error?.message}`);
  await settle();
  assert.deepEqual(outcomes.map(([type, operationId, , options]) =>
    [type, operationId, options.errorCode]), [['MESSAGE_GROUP_CREATE_FAILED', O, code]],
  `${message}: the coordinator learns the typed failure once`);
  assert.equal(world.learners.length, openBefore, `${message}: no learner is left open by it`);
  if (openBefore === 0) {
    assert.equal(world.bridge.router.getRegisteredHandler(LEARNER_ADDRESS), null,
      `${message}: no learner transport handler stays registered`);
  }
  return error;
}
function assertNotInstalled(world, message) {
  assert.equal(fs.existsSync(world.dbPath), false, `${message}: no target replica file`);
}
function assertDebtRetained(f) {
  assert.equal(f.row().message_group_membership_obligation_state, 'unknown',
    'the membership obligation stays outstanding');
}

/** The CREATE sent to a handler composing the world's real capability. */
async function sendCreate(t, f, world) {
  const created = createHandler(t, f, {learnerJoin: world.join});
  const response = await created.send(createPayload(f));
  assert.equal(response.status, STATUS.INITIATED, JSON.stringify(response));
  return created;
}

/** The answer of a join that did not refuse. */
async function joinAnswer(world) {
  assert.equal(await world.answered(), true, 'the learner join answers');
  const [{answer, error}] = world.answers;
  assert.equal(error, undefined, `the learner join must not refuse: ${error?.message}`);
  return answer;
}

async function joinRunning(t, f, hooks = {}) {
  const world = learnerJoinWorld(t, f, hooks);
  const created = await sendCreate(t, f, world);
  return {world, ...created, answer: await joinAnswer(world)};
}

/** The leader's own follower match for the learner (0 before any ack). */
function learnerProgress(f) {
  return leaderStatus(f).followerProgress[f.cluster.addressOf(TARGET)] ?? 0;
}

/** The learner's own applied voters, read from its durable record. */
function learnerDurableVoters(world) {
  const durable = new Database(world.dbPath, {readonly: true});
  try {
    return RaftRsDurableStore.readDurableRecordIn(durable, GROUP).confState.voters.map(String);
  } finally {
    durable.close();
  }
}

test('a recorded learner CREATE joins the real group as a non-voting learner, installs, opens and ' +
  'runs only after the leader acknowledges it caught up', async (t) => {
  const f = await createFixture(t);
  const termBefore = leaderStatus(f).term;
  const {world, send, outcomes, genesisCreates, handler, answer} = await joinRunning(t, f);
  assert.equal(answer.outcome, OUTCOME.RUNNING, JSON.stringify(answer));

  for (const replicaId of FOUNDERS) {
    const confState = f.cluster.node(replicaId).readStatus().confState;
    assert.ok(confState.learners.includes(TARGET_PEER), `${replicaId} names the learner`);
    assert.equal(confState.voters.includes(TARGET_PEER), false, `${replicaId}: never a voter`);
  }
  assert.equal(world.learners.length, 1, 'exactly one learner is open');
  const [learner] = world.learners;
  assert.equal(learner.initialized, true, 'the learner is open');
  const own = learner.raft.readStatus();
  assert.ok(own.confState.learners.includes(TARGET_PEER), JSON.stringify(own.confState));
  assert.equal(own.confState.voters.includes(TARGET_PEER), false, 'not a voter in its own view');
  assert.equal(own.role, 'follower', 'a learner never leads or campaigns');
  assert.equal(world.bridge.voteRequestsFromLearner(), 0, 'no vote or pre-vote request was sent');
  assert.equal(own.term, leaderStatus(f).term, 'no self-election: the learner follows the term');
  assert.equal(leaderStatus(f).term, termBefore, 'the founders never saw an election');
  assert.equal(learner.shouldSuppressJoinPhaseRaftParticipation(), true,
    'join suppression is held until promotion');
  assert.equal(learner.deferElection, true, 'its port schedules no election ticks');
  assert.equal(learner.electionStarted, false, 'its election timer is never armed');

  assert.equal(answer.leaderReplicaId, leaderOf(f), 'the acknowledging replica leads');
  assert.ok(answer.matchIndex >= answer.commitIndex, JSON.stringify(answer));
  assert.ok(answer.commitIndex >= answer.installedIndex, JSON.stringify(answer));
  assert.ok(leaderStatus(f).followerProgress[f.cluster.addressOf(TARGET)] >=
    answer.installedIndex, 'the leader\'s own progress for the learner');

  const durable = new Database(world.dbPath, {readonly: true});
  try {
    assert.equal(durable.prepare('SELECT learner_admission FROM raft_rs_peer_identity ' +
      'WHERE replica_identity = ?').get(TARGET).learner_admission, recordedOrigin(f),
    'the installed image carries the recorded learner\'s exact committed origin');
    const record = RaftRsDurableStore.readDurableRecordIn(durable, GROUP);
    assert.ok(record.confState.learners.map(String).includes(TARGET_PEER));
  } finally {
    durable.close();
  }

  const proposed = f.cluster.propose(leaderOf(f), {type: 'MESSAGE', messageId: 'b2-after-install'});
  assert.equal(proposed.outcome, 'CORE_OK', JSON.stringify(proposed));
  const commitIndex = () => leaderStatus(f).commitIndex;
  assert.equal(await world.until(() => commitIndex() > answer.commitIndex &&
    learner.raft.readStatus().appliedIndex >= commitIndex()), true,
  'the learner applies a command committed after its install');

  const redelivered = await send(createPayload(f));
  assert.equal(redelivered.status, STATUS.IN_PROGRESS, 'a redelivery finds the admission');
  assert.equal(redelivered.reason, ADMISSION_RETAINED);
  await settle();
  assert.equal(world.descriptorRequests.length, 1, 'one join, one descriptor request');
  assert.deepEqual(outcomes, [], 'no CREATE_ACTIVE or CREATE_FAILED outcome');
  assert.equal(genesisCreates(), 0, 'the lone-founder create is never called');
  assert.equal(handler.inProgressOperations.size, 0, 'the worker finished and released');
  const row = f.row();
  assert.equal(row.create_admission_state, 'MATERIALIZED');
  assert.equal(row.message_group_membership_phase, 'learner_committed');
  assertDebtRetained(f);
});

test('the founders\' leader changing mid-join: the new leader acknowledges the learner (positive control)',
  async (t) => {
    const f = await createFixture(t);
    const oldLeader = leaderOf(f);
    const successor = FOUNDERS.find((id) => id !== oldLeader);
    const termBefore = leaderStatus(f).term;
    const world = learnerJoinWorld(t, f, {answer: async (request, joined) => {
      const produced = await joined.produceAndTransfer(request, oldLeader);
      transferLeadership(f, successor);
      return produced;
    }});
    const {send} = createHandler(t, f, {learnerJoin: world.join});
    assert.equal((await send(createPayload(f))).status, STATUS.INITIATED);
    assert.equal(await world.answered(), true);
    const [{answer, error}] = world.answers;
    assert.equal(error, undefined, error?.message);
    assert.equal(answer.outcome, OUTCOME.RUNNING, JSON.stringify(answer));
    assert.equal(answer.leaderReplicaId, successor, 'the acknowledgement is the new leader\'s');
    assert.ok(answer.term > termBefore, 'under the new term');
    assert.equal(world.learners[0].raft.readStatus().confState.voters.includes(TARGET_PEER), false);
  });

test('a descriptor from a demoted leader is refused not-leader: nothing is installed or opened',
  async (t) => {
    const f = await createFixture(t);
    const demoted = transferLeadership(f, FOUNDERS.find((id) => id !== leaderOf(f)));
    const world = learnerJoinWorld(t, f, {descriptorFrom: () => demoted});
    const {send, outcomes} = createHandler(t, f, {learnerJoin: world.join});
    assert.equal((await send(createPayload(f))).status, STATUS.INITIATED);
    const error = await assertRefusedJoin(world, outcomes, REFUSAL.DESCRIPTOR_UNAVAILABLE,
      'demoted leader');
    assert.equal(error.detail, NOT_LEADER, 'the native read answers only on the leader');
    assert.equal(error.deferRetry, false,
      'definitive for this admission generation: no rotation exists yet to retry it');
    assertNotInstalled(world, 'demoted leader');
    assert.equal(f.row().create_admission_state, 'MATERIALIZED');
    assertDebtRetained(f);
  });

/** A raw native REMOVE of one founder voter that is not the leader (test
 * physics): a newer configuration generation in the same term that keeps the
 * learner. Answers the removed founder. */
function removeFollowerVoter(f) {
  const voter = FOUNDERS.find((id) => id !== leaderOf(f));
  const removed = f.cluster.node(leaderOf(f)).proposeConfChange({
    type: RAFT_MEMBERSHIP_OPERATION.REMOVE_PEER, replicaIdentity: voter});
  assert.equal(removed.outcome, 'CORE_OK', JSON.stringify(removed));
  assert.ok(f.cluster.settle(() => !leaderStatus(f).confState.voters
    .includes(deriveRaftRsPeerId(voter))), `the group committed the removal of ${voter}`);
  return voter;
}

test('a replayed descriptor older than the recorded learner fact is refused stale', async (t) => {
  // What moves the group past the old descriptor before the fact is recorded.
  const moves = [
    {name: 'older term', move: (f) => transferLeadership(f,
      FOUNDERS.find((id) => id !== leaderOf(f))),
    moved: (fact, old) => fact.term > old.term},
    {name: 'older configuration generation in the same term', move: removeFollowerVoter,
      moved: (fact, old) => fact.term === old.term &&
        fact.membershipGenerationIndex > old.membershipGenerationIndex},
  ];
  for (const {name, move, moved} of moves) {
    await t.test(name, async (t) => {
      const f = await createFixture(t, {record: false});
      const producer = leaderOf(f);
      const old = await produceOn(f, producer, learnerRequest());
      assert.ok(old.descriptor, JSON.stringify(old));
      move(f);
      const recorded = await f.repository.recordMessageGroupLearnerOutcome(f.request,
        (query) => f.cluster.node(leaderOf(f)).readCommittedMembership(query));
      assert.equal(recorded.outcome, 'recorded', 'the fact is recorded after the move');
      assert.ok(moved(JSON.parse(f.row().message_group_learner_stamp), old.descriptor.stamp),
        `${name}: the recorded fact is newer than the descriptor`);
      const world = learnerJoinWorld(t, f, {answer: async (request) => {
        await transferImage(path.join(f.cluster.directory, 'leader-checkpoints', producer),
          old.descriptor, request.checkpointsRoot);
        return old;
      }});
      const {send, outcomes} = createHandler(t, f, {learnerJoin: world.join});
      assert.equal((await send(createPayload(f))).status, STATUS.INITIATED);
      await assertRefusedJoin(world, outcomes, REFUSAL.DESCRIPTOR_STALE, name);
      assertNotInstalled(world, name);
    });
  }
});

test('a REMOVE selection recorded after MATERIALIZED defeats the install at its commit', async (t) => {
  const f = await createFixture(t);
  const world = learnerJoinWorld(t, f, {beforeDescriptor: () => selectAbortLearner(f)});
  const {send, outcomes} = createHandler(t, f, {learnerJoin: world.join});
  assert.equal((await send(createPayload(f))).status, STATUS.INITIATED);
  const error = await assertRefusedJoin(world, outcomes, REFUSAL.INSTALL_REFUSED,
    'REMOVE after MATERIALIZED');
  assert.equal(error.detail, GENERATION_MISMATCH, 'the install owner refused the moved row');
  assertNotInstalled(world, 'REMOVE after MATERIALIZED');
  assert.equal(f.row().message_group_membership_phase, 'target_removal_proposal_in_flight');
  assert.equal(f.row().create_admission_state, 'MATERIALIZED');
});

test('a later native REMOVE of the learner leaves the leader no descriptor for it', async (t) => {
  const f = await createFixture(t);
  const removed = await f.cluster.node(leaderOf(f)).proposeConfChange({
    type: RAFT_MEMBERSHIP_OPERATION.REMOVE_PEER, replicaIdentity: TARGET});
  assert.equal(removed.outcome, 'CORE_OK', JSON.stringify(removed));
  assert.ok(f.cluster.settle(() => FOUNDERS.every((id) =>
    !f.cluster.node(id).readStatus().confState.learners.includes(TARGET_PEER))),
  'the group committed the removal (raw native REMOVE: test physics)');
  const world = learnerJoinWorld(t, f);
  const {send, outcomes} = createHandler(t, f, {learnerJoin: world.join});
  assert.equal((await send(createPayload(f))).status, STATUS.INITIATED,
    'the operation row still records the learner');
  await assertRefusedJoin(world, outcomes, REFUSAL.NOT_IN_CONFIGURATION, 'native REMOVE');
  assertNotInstalled(world, 'native REMOVE');
});

test('a native REMOVE while the learner awaits the acknowledgement closes it: never reported running',
  async (t) => {
    const f = await createFixture(t);
    const world = learnerJoinWorld(t, f, {catchUpTimeoutMs: 8000});
    world.bridge.hold.inbound = true;
    const {send, outcomes} = createHandler(t, f, {learnerJoin: world.join});
    assert.equal((await send(createPayload(f))).status, STATUS.INITIATED);
    assert.equal(await world.until(() =>
      world.bridge.router.getRegisteredHandler(LEARNER_ADDRESS) !== null), true,
    'the learner opened and awaits the leader');
    const removed = await f.cluster.node(leaderOf(f)).proposeConfChange({
      type: RAFT_MEMBERSHIP_OPERATION.REMOVE_PEER, replicaIdentity: TARGET});
    assert.equal(removed.outcome, 'CORE_OK', JSON.stringify(removed));
    await assertRefusedJoin(world, outcomes, REFUSAL.NOT_IN_CONFIGURATION, 'removed while waiting');
    assert.equal(world.bridge.router.getRegisteredHandler(LEARNER_ADDRESS), null,
      'the learner was closed and its transport handler retired');
    assert.equal(fs.existsSync(world.dbPath), true,
      'its installed files stay for exact-generation cleanup');
  });

test('a descriptor for another group, target or cluster is refused before any install', async (t) => {
  const changes = {
    group: (descriptor) => ({...descriptor, groupId: 'another-group'}),
    cluster: (descriptor) => ({...descriptor,
      checkpointIdentity: {...descriptor.checkpointIdentity, clusterId: 'another-cluster'}}),
    target: (descriptor) => ({...descriptor, stamp: {...descriptor.stamp, learners: []}}),
  };
  for (const [name, alter] of Object.entries(changes)) {
    await t.test(name, async (t) => {
      const f = await createFixture(t);
      const world = learnerJoinWorld(t, f, {answer: async (request, joined) => {
        const produced = await joined.produceAndTransfer(request, leaderOf(f));
        return {descriptor: alter(produced.descriptor)};
      }});
      const {send, outcomes} = createHandler(t, f, {learnerJoin: world.join});
      assert.equal((await send(createPayload(f))).status, STATUS.INITIATED);
      await assertRefusedJoin(world, outcomes, REFUSAL.DESCRIPTOR_MISMATCH, name);
      assertNotInstalled(world, name);
    });
  }
});

test('an image whose learner origin names another operation is refused (identity anchoring)',
  async (t) => {
    const f = await createFixture(t);
    const world = learnerJoinWorld(t, f, {answer: async (request, joined) => {
      const produced = await joined.produceAndTransfer(request, leaderOf(f));
      const dir = path.join(request.checkpointsRoot, String(produced.descriptor.generationIndex));
      const payloadPath = path.join(dir, 'payload.db');
      const payload = new Database(payloadPath);
      const origin = decodeCommittedLearnerAdmission(payload.prepare('SELECT learner_admission ' +
        'FROM raft_rs_peer_identity WHERE replica_identity = ?').get(TARGET).learner_admission);
      const forged = encodeCommittedLearnerAdmission({...origin,
        context: {...origin.context, operationId: 'another-operation'}});
      payload.prepare('UPDATE raft_rs_peer_identity SET learner_admission = ? ' +
        'WHERE replica_identity = ?').run(forged, TARGET);
      payload.close();
      const descriptorPath = path.join(dir, 'checkpoint.json');
      const sealed = JSON.parse(fs.readFileSync(descriptorPath, 'utf8'));
      const bytes = fs.readFileSync(payloadPath);
      writeAtomicDurable(descriptorPath, {...sealed, payloadByteLength: bytes.length,
        payloadDigest: sha256Digest(bytes), raftRs: {...sealed.raftRs,
          peerReservations: sealed.raftRs.peerReservations.map((reservation) =>
            reservation.replicaIdentity === TARGET ?
              {...reservation, learnerAdmission: forged} : reservation)}});
      return produced;
    }});
    const {send, outcomes} = createHandler(t, f, {learnerJoin: world.join});
    assert.equal((await send(createPayload(f))).status, STATUS.INITIATED);
    await assertRefusedJoin(world, outcomes, REFUSAL.DESCRIPTOR_MISMATCH, 'foreign origin');
    assertNotInstalled(world, 'foreign origin');
  });

test('a replaced boot or a replaced admission generation fences the install', async (t) => {
  await t.test('boot replaced after MATERIALIZED', async (t) => {
    const f = await createFixture(t);
    const world = learnerJoinWorld(t, f, {beforeDescriptor: () => replaceBoot(f, 2)});
    const {send, outcomes} = createHandler(t, f, {learnerJoin: world.join});
    assert.equal((await send(createPayload(f))).status, STATUS.INITIATED);
    await assertRefusedJoin(world, outcomes, ADMISSION_DEFERRED, 'replaced boot');
    assertNotInstalled(world, 'replaced boot');
  });
  await t.test('admission attempt replaced after MATERIALIZED', async (t) => {
    const f = await createFixture(t);
    const world = learnerJoinWorld(t, f, {beforeDescriptor: () => f.execute(
      'UPDATE replica_operations SET create_admission_attempt_token = ? WHERE operation_id = ?',
      ['a-replacement-attempt', O])});
    const {send, outcomes} = createHandler(t, f, {learnerJoin: world.join});
    assert.equal((await send(createPayload(f))).status, STATUS.INITIATED);
    const error = await assertRefusedJoin(world, outcomes, REFUSAL.INSTALL_REFUSED,
      'replaced generation');
    assert.equal(error.detail, GENERATION_MISMATCH);
    assertNotInstalled(world, 'replaced generation');
  });
});

test('a competing terminal settlement after MATERIALIZED defeats the install; the debt stays',
  async (t) => {
    const f = await createFixture(t);
    const world = learnerJoinWorld(t, f, {beforeDescriptor: () => settleFailed(f)});
    const {send, outcomes} = createHandler(t, f, {learnerJoin: world.join});
    assert.equal((await send(createPayload(f))).status, STATUS.INITIATED);
    const error = await assertRefusedJoin(world, outcomes, REFUSAL.INSTALL_REFUSED,
      'terminal after MATERIALIZED');
    assert.equal(error.detail, GENERATION_MISMATCH);
    assertNotInstalled(world, 'terminal after MATERIALIZED');
    assert.notEqual(f.row().completed_at, null);
    assertDebtRetained(f);
  });

test('an install failure (a corrupt transferred image) opens nothing', async (t) => {
  const f = await createFixture(t);
  const world = learnerJoinWorld(t, f, {answer: async (request, joined) => {
    const produced = await joined.produceAndTransfer(request, leaderOf(f));
    const payloadPath = path.join(request.checkpointsRoot,
      String(produced.descriptor.generationIndex), 'payload.db');
    const bytes = fs.readFileSync(payloadPath);
    bytes[bytes.length - 1] ^= 0xff;
    fs.writeFileSync(payloadPath, bytes);
    return produced;
  }});
  const {send, outcomes} = createHandler(t, f, {learnerJoin: world.join});
  assert.equal((await send(createPayload(f))).status, STATUS.INITIATED);
  const error = await assertRefusedJoin(world, outcomes, REFUSAL.INSTALL_REFUSED, 'corrupt image');
  assert.equal(error.detail, 'corrupt_payload');
  assertNotInstalled(world, 'corrupt image');
});

test('process loss around install and open: the restarted node starts no second learner',
  async (t) => {
    const restart = async (t, f, old) => {
      old.handler.shutdown();
      replaceBoot(f, 2);
      const world = learnerJoinWorld(t, f, {pump: false});
      const restarted = createHandler(t, f, {bootIncarnation: 2, learnerJoin: world.join});
      const response = await restarted.send(createPayload(f));
      await settle();
      assert.equal(response.status, STATUS.IN_PROGRESS, JSON.stringify(response));
      assert.equal(response.reason, ADMISSION_RETAINED, 'an older boot\'s admission is retained');
      assert.equal(world.descriptorRequests.length, 0, 'no second join starts');
      assert.deepEqual(restarted.outcomes, []);
      assert.equal(f.row().create_admission_owner_incarnation, 1);
      assertDebtRetained(f);
    };
    await t.test('lost during the install, before the swap', async (t) => {
      const f = await createFixture(t);
      const world = learnerJoinWorld(t, f, {beforeDescriptor: () => {
        f.failReads('replica_operations');
      }});
      const old = createHandler(t, f, {learnerJoin: world.join});
      assert.equal((await old.send(createPayload(f))).status, STATUS.INITIATED);
      assert.equal(await world.answered(), true);
      assert.equal(world.answers[0].error?.code, ADMISSION_DEFERRED);
      assertNotInstalled(world, 'lost during install');
      assert.ok(fs.existsSync(path.join(path.dirname(world.dbPath), 'checkpoints', TARGET,
        'install', 'install-state.json')), 'the staging marker stays for its recovery owner');
      f.failReads(null);
      await restart(t, f, old);
      assertNotInstalled(world, 'after restart');
    });
    await t.test('lost after the install, before the open', async (t) => {
      const f = await createFixture(t);
      const world = learnerJoinWorld(t, f, {serviceOptions: {nodeService: {
        getSystemTableCache: () => {
          throw new Error('fixture: the process died before the open');
        }}}});
      const old = createHandler(t, f, {learnerJoin: world.join});
      assert.equal((await old.send(createPayload(f))).status, STATUS.INITIATED);
      assert.equal(await world.answered(), true);
      assert.equal(world.answers[0].error?.code, REFUSAL.OPEN_REFUSED);
      assert.equal(fs.existsSync(world.dbPath), true, 'the installed image is durable');
      await restart(t, f, old);
      assert.equal(world.learners.length, 0, 'nothing reopened it');
    });
    await t.test('lost while the learner is open', async (t) => {
      const f = await createFixture(t);
      const old = await joinRunning(t, f);
      assert.equal(old.answer.outcome, OUTCOME.RUNNING);
      await old.world.learners[0].shutdown();
      await restart(t, f, old);
      assert.ok(FOUNDERS.every((id) => f.cluster.node(id).readStatus().confState.learners
        .includes(TARGET_PEER)), 'the group still holds its committed learner');
    });
  });

test('a later admission for an installed target refuses target-present and leaves the learner alone',
  async (t) => {
    const f = await createFixture(t);
    const first = await joinRunning(t, f);
    assert.equal(first.answer.outcome, OUTCOME.RUNNING);
    const [learner] = first.world.learners;
    // A later admission generation for the same target (the shape attempt
    // rotation or recovery would take): fixture actuation of the row.
    f.execute(`UPDATE replica_operations SET create_admission_state = NULL,
      create_admission_token = NULL, create_admission_replica_created_at = NULL,
      create_admission_attempt_token = NULL, create_admission_attempt_seq = NULL,
      create_admission_workflow_updated_at = NULL, create_admission_owner_incarnation = NULL
      WHERE operation_id = ?`, [O]);
    first.world.answers.length = 0;
    assert.equal((await first.send(createPayload(f))).status, STATUS.INITIATED,
      'the new admission generation starts a worker');
    await assertRefusedJoin(first.world, first.outcomes, REFUSAL.TARGET_PRESENT,
      'second generation', 1);
    assert.equal(first.world.descriptorRequests.length, 1, 'the second worker installs nothing');
    assert.equal(first.world.learners.length, 1, 'still exactly one learner');
    assert.equal(learner.initialized, true, 'the running learner is untouched');
    assert.ok(learner.raft.readStatus().confState.learners.includes(TARGET_PEER));
  });

test('a learner held behind is not reported running: NOT_CAUGHT_UP, still a learner', async (t) => {
  const f = await createFixture(t);
  const world = learnerJoinWorld(t, f, {catchUpTimeoutMs: 400});
  world.bridge.hold.inbound = true;
  const {send, outcomes} = createHandler(t, f, {learnerJoin: world.join});
  assert.equal((await send(createPayload(f))).status, STATUS.INITIATED);
  assert.equal(await world.answered(), true);
  const [{answer, error}] = world.answers;
  assert.equal(error, undefined, error?.message);
  assert.equal(answer.outcome, OUTCOME.NOT_CAUGHT_UP, JSON.stringify(answer));
  assert.equal(answer.acknowledgement, 'behind');
  assert.equal(answer.proofReason, 'progress_behind',
    'the existing promotion-progress predicate does not grant');
  const progress = () => leaderStatus(f).followerProgress[f.cluster.addressOf(TARGET)];
  assert.ok(progress() < leaderStatus(f).commitIndex, 'the leader holds it behind');
  assert.equal(world.learners.length, 1, 'the learner stays open and hosted');
  assert.ok(world.learners[0].raft.readStatus().confState.learners.includes(TARGET_PEER));
  await settle();
  assert.deepEqual(outcomes, [], 'not caught up is no failure');
  world.bridge.hold.inbound = false;
  assert.equal(await world.until(() => progress() >= leaderStatus(f).commitIndex), true,
    'released, it catches up');
});

test('a replica opened from the durable-record bootstrap alone is refused without its image, ' +
  'joining flag or not: it is never founded', async (t) => {
  const f = await createFixture(t);
  const world = learnerJoinWorld(t, f, {pump: false});
  for (const joining of [false, true]) {
    const service = new MessageGroupService({...world.host.serviceOptions,
      groupId: 'b2-image-only', replicaId: `b2-image-only-${joining}`, nodeId: 'b2-node',
      replicaIds: [`b2-image-only-${joining}`, 'b2-image-only-peer'],
      transport: world.host.messageRouter, deferElection: true,
      dbPath: path.join(path.dirname(world.dbPath), `image-only-${joining}.db`),
      isJoiningExistingGroup: joining, bootstrapMembership: durableRecordBootstrap()});
    await assert.rejects(service.initialize(), (error) =>
      error.code === 'message_group_consensus_init_refused' &&
      error.consensus?.reason === 'durable-record-missing',
    `joining=${joining}: no image, no group (never a GENESIS founder)`);
    assert.equal(service.raft, null, 'nothing stays open');
  }
});

test('the handler setup composes the learner-join capability only from a host', async () => {
  const host = {nodeId: 'node-target', clusterId: 'c', messageRouter: {},
    dbPathOf: () => '/nonexistent', requestJoinDescriptor: async () => ({}),
    observeLeader: async () => null, adoptLearner: () => undefined};
  const compose = (extra) => MessageGroupServiceHandlerSetup.create({
    nodeId: 'node-target', messageRouter: {register() {}}, cdcIntegrationService: {},
    systemTableCache: {get: () => null, filter: () => []},
    createMessageGroupReplica: async () => ({}), startMessageGroupReplica: async () => ({}),
    stopMessageGroupReplica: async () => ({}), ...extra}).messageGroupServiceHandler;
  const composed = compose({messageGroupLearnerJoinHost: host, ownerIncarnation: 3,
    replicaOperationRepository: {}});
  assert.equal(typeof composed.joinMessageGroupReplicaAsLearner, 'function');
  assert.equal(composed.ownerIncarnation, 3);
  const production = compose({});
  assert.equal(production.joinMessageGroupReplicaAsLearner, null,
    'without a host (every production root today) no capability is composed');
  assert.equal(production.replicaOperationRepository, null);
  composed.shutdown();
  production.shutdown();
});

// The independent review of 2026-10-11: the install commit's last await
// before its swap, and the load-bearing checks of the RUNNING decision.

/** The install commit's last gateway read before its swap, found by a dry run
 * of the same join (a subtest, so its node and boot are released before the
 * measured run): the ordinal, after the descriptor answer, of the last read
 * issued while the target's replica file was still absent. */
async function lastPreSwapReadOrdinal(t) {
  let ordinal = null;
  await t.test('dry run: the install commit\'s reads before its swap', async (t) => {
    const f = await createFixture(t);
    const absent = [];
    let armed = false;
    const world = learnerJoinWorld(t, f, {answer: async (request, joined) => {
      const produced = await joined.produceAndTransfer(request, leaderOf(f));
      armed = true;
      return produced;
    }});
    const record = async () => {
      if (armed) absent.push(!fs.existsSync(world.dbPath));
    };
    f.pauseOperation(record);
    f.pauseNodes(record);
    await sendCreate(t, f, world);
    assert.equal((await joinAnswer(world)).outcome, OUTCOME.RUNNING, 'the dry run installs');
    assert.ok(absent.includes(true), 'the install commit reads before its swap');
    ordinal = absent.lastIndexOf(true);
  });
  return ordinal;
}

/** A join with `change` recorded while the install commit's last read before
 * its swap is in flight (before that read executes). */
async function joinChangedInLastPreSwapRead(t, change) {
  const ordinal = await lastPreSwapReadOrdinal(t);
  const f = await createFixture(t);
  let armed = false;
  let busy = false;
  let reads = 0;
  let changed = false;
  const inject = async () => {
    if (!armed || busy || reads++ !== ordinal) return;
    busy = true;
    try {
      await change(f);
      changed = true;
    } finally {
      busy = false;
    }
  };
  f.pauseOperation(inject);
  f.pauseNodes(inject);
  const world = learnerJoinWorld(t, f, {answer: async (request, joined) => {
    const produced = await joined.produceAndTransfer(request, leaderOf(f));
    armed = true;
    return produced;
  }});
  const {outcomes} = await sendCreate(t, f, world);
  assert.equal(await world.answered(), true);
  assert.equal(changed, true, 'the change was recorded in the last read before the swap');
  return {f, world, outcomes};
}

test('a REMOVE selection recorded while the install commit\'s last read before its swap is ' +
  'in flight defeats the install: no await follows that read', async (t) => {
  const {f, world, outcomes} = await joinChangedInLastPreSwapRead(t, selectAbortLearner);
  const error = await assertRefusedJoin(world, outcomes, REFUSAL.INSTALL_REFUSED,
    'REMOVE in the last pre-swap read');
  assert.equal(error.detail, GENERATION_MISMATCH, 'the commit\'s own row read saw it');
  assertNotInstalled(world, 'REMOVE in the last pre-swap read');
  assert.equal(f.row().message_group_membership_phase, 'target_removal_proposal_in_flight');
});

test('a terminal settlement recorded while the install commit\'s last read before its swap ' +
  'is in flight defeats the install; the debt stays', async (t) => {
  const {f, world, outcomes} = await joinChangedInLastPreSwapRead(t, settleFailed);
  const error = await assertRefusedJoin(world, outcomes, REFUSAL.INSTALL_REFUSED,
    'terminal in the last pre-swap read');
  assert.equal(error.detail, GENERATION_MISMATCH, 'the commit\'s own row read saw it');
  assertNotInstalled(world, 'terminal in the last pre-swap read');
  assert.notEqual(f.row().completed_at, null);
  assertDebtRetained(f);
});

test('one basis column moved after MATERIALIZED defeats the install at its commit', async (t) => {
  // Fixture actuation of a single column each (no writer moves either alone):
  // the admission CLOSED with its tokens kept, and the recorded obligation.
  const moves = [
    ['admission CLOSED, tokens kept', 'create_admission_state', 'CLOSED'],
    ['membership obligation moved', 'message_group_membership_obligation_state',
      MEMBERSHIP_OBLIGATION.INTENT_RECORDED],
  ];
  for (const [name, column, value] of moves) {
    await t.test(name, async (t) => {
      const f = await createFixture(t);
      const world = learnerJoinWorld(t, f, {beforeDescriptor: () => f.execute(
        `UPDATE replica_operations SET ${column} = ? WHERE operation_id = ?`, [value, O])});
      const {outcomes} = await sendCreate(t, f, world);
      const error = await assertRefusedJoin(world, outcomes, REFUSAL.INSTALL_REFUSED, name);
      assert.equal(error.detail, GENERATION_MISMATCH,
        `${name}: the install commit re-requires the column on its own row read`);
      assertNotInstalled(world, name);
      assert.equal(f.row()[column], value);
    });
  }
});

test('a configuration that moves between the leader\'s committed read and its image seal ' +
  'answers descriptor-moved, and the target refuses it', async (t) => {
  const f = await createFixture(t);
  const producer = leaderOf(f);
  const port = f.cluster.node(producer);
  let moved = false;
  // The producer's own port, except that a raw native REMOVE of the learner
  // commits and applies right after its committed read answers (test physics).
  const raft = {[RAFT_OPERATION.READ_COMMITTED_MEMBERSHIP]: (query) => {
    const answer = port[RAFT_OPERATION.READ_COMMITTED_MEMBERSHIP](query);
    if (!moved) {
      moved = true;
      const removed = port.proposeConfChange({type: RAFT_MEMBERSHIP_OPERATION.REMOVE_PEER,
        replicaIdentity: TARGET});
      assert.equal(removed.outcome, 'CORE_OK', JSON.stringify(removed));
      assert.ok(f.cluster.settle(() => !leaderStatus(f).confState.learners.includes(TARGET_PEER)));
    }
    return answer;
  }};
  const produced = await produceOn(f, producer, learnerRequest(), raft);
  assert.equal(produced.refusal, REFUSAL.DESCRIPTOR_MOVED,
    `no image is sealed across a moved configuration: ${JSON.stringify(produced)}`);
  assert.equal(produced.detail, 'corrupt_descriptor',
    'the checkpoint owner holds the image to the answered epoch');
  const world = learnerJoinWorld(t, f, {answer: async () => produced});
  const {outcomes} = await sendCreate(t, f, world);
  await assertRefusedJoin(world, outcomes, REFUSAL.DESCRIPTOR_MOVED, 'moved configuration');
  assertNotInstalled(world, 'moved configuration');
});

test('a learner that acked its installed boundary but is held below the leader\'s commit is ' +
  'not running: NOT_CAUGHT_UP, behind', async (t) => {
  const f = await createFixture(t);
  const installed = Number(leaderStatus(f).appliedIndex);
  const world = learnerJoinWorld(t, f, {catchUpTimeoutMs: 2500});
  const observeLeader = world.host.observeLeader;
  // The leader route answers nothing until the learner is held behind.
  world.host.observeLeader = async () => null;
  const {outcomes} = await sendCreate(t, f, world);
  assert.equal(await world.until(() => learnerProgress(f) >= installed), true,
    'the opened learner acked its installed boundary');
  world.bridge.hold.inbound = true;
  for (const messageId of ['b2-held-1', 'b2-held-2', 'b2-held-3']) {
    const proposed = f.cluster.propose(leaderOf(f), {type: 'MESSAGE', messageId});
    assert.equal(proposed.outcome, 'CORE_OK', JSON.stringify(proposed));
  }
  assert.equal(await world.until(() => leaderStatus(f).commitIndex > learnerProgress(f)), true,
    'the leader commits past the learner\'s match');
  world.host.observeLeader = observeLeader;
  const answer = await joinAnswer(world);
  assert.equal(answer.outcome, OUTCOME.NOT_CAUGHT_UP,
    `a match at the installed boundary below the leader's commit: ${JSON.stringify(answer)}`);
  assert.equal(answer.acknowledgement, 'behind', 'the leader was observed within the bound');
  assert.equal(answer.proofReason, 'progress_behind');
  assert.ok(learnerProgress(f) < leaderStatus(f).commitIndex, 'still held behind');
  await settle();
  assert.deepEqual(outcomes, [], 'not caught up is no failure');
});

test('a learner applying its own native REMOVE while no leader is observable is closed: ' +
  'open-not-learner, nothing adopted', async (t) => {
  const f = await createFixture(t);
  const installed = Number(leaderStatus(f).appliedIndex);
  const world = learnerJoinWorld(t, f, {catchUpTimeoutMs: 8000});
  world.host.observeLeader = async () => null;
  const {outcomes} = await sendCreate(t, f, world);
  assert.equal(await world.until(() => learnerProgress(f) >= installed), true,
    'the opened learner acked its installed boundary');
  const removed = f.cluster.node(leaderOf(f)).proposeConfChange({
    type: RAFT_MEMBERSHIP_OPERATION.REMOVE_PEER, replicaIdentity: TARGET});
  assert.equal(removed.outcome, 'CORE_OK', JSON.stringify(removed));
  await assertRefusedJoin(world, outcomes, REFUSAL.OPEN_NOT_LEARNER,
    'own REMOVE applied while no leader is observable');
});

test('a leader answer at an older configuration than the learner applied is no ' +
  'acknowledgement: the two configuration epochs are compared', async (t) => {
  const f = await createFixture(t);
  const installed = Number(leaderStatus(f).appliedIndex);
  const world = learnerJoinWorld(t, f, {catchUpTimeoutMs: 2500});
  const observeLeader = world.host.observeLeader;
  let stale = null;
  // The leader route pairs that leader's committed answer from before the
  // configuration moved with the same leader's current status.
  world.host.observeLeader = async () => stale && {membership: stale, status: leaderStatus(f)};
  await sendCreate(t, f, world);
  assert.equal(await world.until(() => learnerProgress(f) >= installed), true,
    'the opened learner acked its installed boundary');
  const {membership} = await observeLeader();
  const voterPeer = deriveRaftRsPeerId(removeFollowerVoter(f));
  assert.equal(await world.until(() => !learnerDurableVoters(world).includes(voterPeer)), true,
    'the learner applied the newer configuration');
  stale = membership;
  const answer = await joinAnswer(world);
  assert.equal(answer.outcome, OUTCOME.NOT_CAUGHT_UP,
    `an older leader configuration is no acknowledgement: ${JSON.stringify(answer)}`);
  assert.equal(answer.proofReason, 'epoch_mismatch', 'the shared predicate refused the epochs');
});

test('a leader observation pairing one leader\'s committed answer with another leader\'s ' +
  'status is no acknowledgement', async (t) => {
  const f = await createFixture(t);
  const world = learnerJoinWorld(t, f, {catchUpTimeoutMs: 2500});
  const {membership} = await world.host.observeLeader();
  transferLeadership(f, FOUNDERS.find((id) => id !== leaderOf(f)));
  // The leader route's two reads straddle the leadership change.
  world.host.observeLeader = async () => ({membership, status: leaderStatus(f)});
  await sendCreate(t, f, world);
  const answer = await joinAnswer(world);
  assert.equal(answer.outcome, OUTCOME.NOT_CAUGHT_UP,
    `a mixed leader observation is no acknowledgement: ${JSON.stringify(answer)}`);
  assert.equal(answer.acknowledgement, 'leader_unavailable');
  assert.ok(learnerProgress(f) >= leaderStatus(f).commitIndex,
    'the learner did catch up with the new leader');
});

test('a pending install marker, staging or replica sidecar of the target is a present ' +
  'generation: refused before any descriptor request', async (t) => {
  const installDir = (dbPath) => path.join(resolveReplicaCheckpointsRoot(dbPath),
    RAFT_SNAPSHOT_INSTALL_DIRNAME);
  const parts = {
    'install marker': (dbPath) => path.join(installDir(dbPath), RAFT_SNAPSHOT_INSTALL_MARKER_FILE),
    'install staging': (dbPath) => path.join(installDir(dbPath), RAFT_SNAPSHOT_INSTALL_STAGING_FILE),
    'replica sidecar': (dbPath) => `${dbPath}${RAFT_CHECKPOINT_PAYLOAD_SIDECAR_SUFFIXES[0]}`,
  };
  for (const [name, fileOf] of Object.entries(parts)) {
    await t.test(name, async (t) => {
      const f = await createFixture(t);
      const world = learnerJoinWorld(t, f);
      // Fixture actuation: an earlier generation's leftover of this target.
      const present = fileOf(world.dbPath);
      fs.mkdirSync(path.dirname(present), {recursive: true});
      fs.writeFileSync(present, '');
      const {outcomes} = await sendCreate(t, f, world);
      await assertRefusedJoin(world, outcomes, REFUSAL.TARGET_PRESENT, name);
      assert.equal(world.descriptorRequests.length, 0, `${name}: no descriptor is requested`);
      assertNotInstalled(world, name);
    });
  }
});

test('a leader answer whose commit or match index is absent or not an exact integer is no ' +
  'acknowledgement: NOT_CAUGHT_UP, never running', async (t) => {
  const PROGRESS_FIELDS = ['commitIndex', 'followerProgress'];
  const answers = {
    'absent': (status) => Object.fromEntries(Object.entries(status)
      .filter(([field]) => !PROGRESS_FIELDS.includes(field))),
    'not integers': (status) => ({...status, commitIndex: String(status.commitIndex),
      followerProgress: Object.fromEntries(Object.entries(status.followerProgress)
        .map(([address, match]) => [address, String(match)]))}),
  };
  for (const [name, alter] of Object.entries(answers)) {
    await t.test(name, async (t) => {
      const f = await createFixture(t);
      const world = learnerJoinWorld(t, f, {catchUpTimeoutMs: 600});
      const observeLeader = world.host.observeLeader;
      world.host.observeLeader = async () => {
        const observed = await observeLeader();
        return observed && {...observed, status: alter(observed.status)};
      };
      const {outcomes} = await sendCreate(t, f, world);
      const answer = await joinAnswer(world);
      assert.equal(answer.outcome, OUTCOME.NOT_CAUGHT_UP, `${name}: ${JSON.stringify(answer)}`);
      assert.equal(answer.proofReason, 'progress_unobserved',
        `${name}: no exact progress, so the shared predicate is not consulted`);
      await settle();
      assert.deepEqual(outcomes, [], 'not caught up is no failure');
    });
  }
});
