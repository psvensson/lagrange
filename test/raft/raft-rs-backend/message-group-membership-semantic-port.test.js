import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {test} from 'node:test';

import {
  RAFT_EVENT,
  RAFT_LEADERSHIP_TRANSFER_SUCCESSOR,
  RAFT_MEMBERSHIP_CHANGE_REFUSAL,
  RAFT_MEMBERSHIP_TRANSITION_REASON,
  RAFT_MEMBERSHIP_TRANSITION_STAGE,
  RAFT_OPERATION,
  RAFT_OPERATION_OUTCOME,
} from '../../../src/raft/raft-operation-port-constants.js';
import {
  deriveRaftRsPeerId,
  RaftRsPeerIdentityRegistry,
} from '../../../src/raft/raft-rs-peer-identity.js';
import {RAFT_RS_CONF_CHANGE_TYPE} from
  '../../../src/raft/raft-rs-ready-loop-constants.js';
import {durableLog} from './committed-membership-oracles.js';
import {PartitionNodeCluster} from './partition-node-cluster.js';
import {loadRaftRsCore} from './raw-raft-rs-test-core.js';

const GROUP = 'semantic-membership-group';
const FOUNDERS = Object.freeze(['semantic-a', 'semantic-b', 'semantic-c']);
const TARGET = 'semantic-fresh-target';

function assertMalformedStageSubprocess(stageExpression) {
  const script = `
    import assert from 'node:assert/strict';
    import {
      RAFT_MEMBERSHIP_TRANSITION_REASON,
    } from './src/raft/raft-operation-port-constants.js';
    import {
      normalizeMembershipTransition,
    } from './src/raft/raft-rs-membership-transition.js';

    let registryReads = 0;
    const registry = {
      raftPeerIdOf() {
        registryReads += 1;
        throw new Error('registry must not be read for malformed stage');
      },
    };
    const request = {
      operationId: 'malformed-stage-operation',
      transitionIdentity: 'malformed-stage-transition',
      permitSequence: 1,
      stage: ${stageExpression},
      replicaIdentity: 'malformed-stage-target',
      peerAddress: 'raft-rs://malformed-stage-target',
      replicaLifecycleIncarnation: 'malformed-stage-incarnation',
      runtimeGeneration: 1,
      leaderTerm: 1,
      leaderConfigurationStamp: {
        configurationKey: '1|2|3',
        membershipGenerationIndex: 1,
      },
    };

    const before = Object.isFrozen(Object.prototype);
    const normalized = normalizeMembershipTransition(request, registry);
    const after = Object.isFrozen(Object.prototype);
    assert.equal(normalized.refusal?.reason,
      RAFT_MEMBERSHIP_TRANSITION_REASON.MALFORMED);
    assert.equal(registryReads, 0);
    assert.equal(before, false);
    assert.equal(after, false);
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e',
    script], {cwd: process.cwd(), encoding: 'utf8'});
  assert.equal(result.status, 0, result.stderr || result.stdout);
}


function electedWithoutTargetRegistration(t, suffix = 'peer-apply') {
  const cluster = new PartitionNodeCluster({partitionId: `${GROUP}-${suffix}`,
    replicaIds: FOUNDERS});
  t.after(() => cluster.dispose());
  cluster.tickers = [...FOUNDERS];
  assert.ok(cluster.settle(() => cluster.leaderReplicaId() !== null));
  return {cluster, leader: cluster.leaderReplicaId()};
}

function elected(t) {
  const cluster = new PartitionNodeCluster({partitionId: GROUP,
    replicaIds: FOUNDERS});
  t.after(() => cluster.dispose());
  cluster.tickers = [FOUNDERS[0]];
  assert.ok(cluster.settle(() => cluster.leaderReplicaId() !== null));
  const leader = cluster.leaderReplicaId();
  for (const replicaId of FOUNDERS) {
    new RaftRsPeerIdentityRegistry(cluster.replica(replicaId).db)
      .registerReplica(TARGET);
  }
  return {cluster, leader};
}

function permit(cluster, leader, stage, sequence, overrides = {}) {
  const status = cluster.node(leader).readStatus();
  return {
    operationId: 'fresh-membership-operation',
    transitionIdentity: 'fresh-membership-transition',
    permitSequence: sequence,
    stage,
    replicaIdentity: TARGET,
    peerAddress: cluster.addressOf(TARGET),
    replicaLifecycleIncarnation: status.lifecycleIncarnation,
    runtimeGeneration: status.runtimeGeneration,
    leaderTerm: status.term,
    leaderConfigurationStamp: {
      configurationKey: status.configurationKey,
      membershipGenerationIndex: status.membershipGenerationIndex,
    },
    ...overrides,
  };
}

function propose(cluster, leader, request) {
  return cluster.node(leader)[RAFT_OPERATION.PROPOSE_MEMBERSHIP_TRANSITION](
    request);
}

function transferTo(cluster, from, to) {
  const transferred = cluster.node(from).transferLeadership({
    successor: RAFT_LEADERSHIP_TRANSFER_SUCCESSOR.NAMED,
    replicaIdentity: to,
  });
  assert.equal(transferred.outcome, RAFT_OPERATION_OUTCOME.CORE_OK);
  cluster.tickers = [to];
  assert.ok(cluster.settle(() => cluster.leaderReplicaId() === to),
    `leadership transfers from ${from} to ${to}`);
}

test('malformed membership stages refuse before registry access or built-in ' +
  'mutation', () => {
  const stages = [
    '"constructor"',
    '"toString"',
    '"__proto__"',
    '({toString() { throw new Error("stage coerced"); }})',
  ];
  for (const stage of stages) {
    assertMalformedStageSubprocess(stage);
  }
});

test('the semantic port anchors ADD_LEARNER, keeps ordinary traffic out of ' +
  'the configuration generation, and never demotes a promoted voter', (t) => {
  const {cluster, leader} = elected(t);
  const initial = cluster.node(leader).readStatus();
  let priorApplied = initial.appliedIndex;
  for (let index = 0; index < 5; index += 1) {
    cluster.propose(leader, `sustained-data-before-permit-${index}`);
    assert.ok(cluster.settle(() => cluster.node(leader).readStatus()
      .appliedIndex > priorApplied));
    priorApplied = cluster.node(leader).readStatus().appliedIndex;
    assert.equal(cluster.node(leader).readStatus().membershipGenerationIndex,
      initial.membershipGenerationIndex);
  }
  assert.equal(cluster.node(leader).readStatus().membershipGenerationIndex,
    initial.membershipGenerationIndex);

  const added = propose(cluster, leader, permit(cluster, leader,
    RAFT_MEMBERSHIP_TRANSITION_STAGE.ADD_LEARNER, 1));
  assert.equal(added.reason, RAFT_MEMBERSHIP_TRANSITION_REASON.PROPOSED);
  assert.ok(added.proposalIndex > initial.appliedIndex);
  const targetPeer = new RaftRsPeerIdentityRegistry(cluster.replica(leader).db)
    .raftPeerIdOf(TARGET);
  assert.ok(cluster.settle(() => cluster.node(leader).readStatus()
    .confState.learners.includes(targetPeer)));
  const entry = durableLog(cluster.replica(leader).dbFile, GROUP)
    .find(({index}) => index === added.proposalIndex);
  const decoded = loadRaftRsCore().decode_conf_change_entry(
    entry.entryType, entry.data);
  assert.deepEqual(JSON.parse(Buffer.from(decoded.context, 'base64')),
    {operationId: 'fresh-membership-operation',
      transitionIdentity: 'fresh-membership-transition', permitSequence: 1,
      stage: RAFT_MEMBERSHIP_TRANSITION_STAGE.ADD_LEARNER,
      replicaIdentity: TARGET, peerId: targetPeer},
    'the exact membership identity survives native ready/apply bytes');

  const parkedPromotion = propose(cluster, leader, permit(cluster, leader,
    RAFT_MEMBERSHIP_TRANSITION_STAGE.PROMOTE, 2));
  assert.equal(parkedPromotion.reason,
    RAFT_MEMBERSHIP_TRANSITION_REASON.PROMOTION_PROOF_REQUIRED);
  const promoted = cluster.node(leader).proposeConfChange({transition: 0,
    changes: [{changeType: RAFT_RS_CONF_CHANGE_TYPE.ADD_NODE,
      nodeId: targetPeer}]});
  assert.equal(promoted.outcome, RAFT_OPERATION_OUTCOME.CORE_OK,
    'legacy proposal is test setup for a voter reached before duplicate ADD');
  assert.ok(cluster.settle(() => cluster.node(leader).readStatus()
    .confState.voters.includes(targetPeer)));
  const duplicate = propose(cluster, leader, permit(cluster, leader,
    RAFT_MEMBERSHIP_TRANSITION_STAGE.ADD_LEARNER, 3));
  assert.equal(duplicate.reason,
    RAFT_MEMBERSHIP_TRANSITION_REASON.ALREADY_VOTER);
  assert.ok(cluster.node(leader).readStatus().confState.voters
    .includes(targetPeer));
  const removed = propose(cluster, leader, permit(cluster, leader,
    RAFT_MEMBERSHIP_TRANSITION_STAGE.REMOVE, 4));
  assert.equal(removed.reason,
    RAFT_MEMBERSHIP_TRANSITION_REASON.PROPOSED,
    'REMOVE of an exact voter reaches the native configuration owner');
  assert.ok(cluster.settle(() => !cluster.node(leader).readStatus()
    .confState.voters.includes(targetPeer)));
});

test('semantic REMOVE preserves the native last-voter refusal', (t) => {
  const cluster = new PartitionNodeCluster({partitionId: `${GROUP}-last`,
    replicaIds: [FOUNDERS[0]]});
  t.after(() => cluster.dispose());
  cluster.tickers = [FOUNDERS[0]];
  assert.ok(cluster.settle(() => cluster.leaderReplicaId() !== null));
  const leader = cluster.leaderReplicaId();
  const answer = propose(cluster, leader, permit(cluster, leader,
    RAFT_MEMBERSHIP_TRANSITION_STAGE.REMOVE, 1, {
      replicaIdentity: leader,
      peerAddress: cluster.addressOf(leader),
    }));
  assert.equal(answer.reason,
    RAFT_MEMBERSHIP_CHANGE_REFUSAL.REMOVES_LAST_VOTER);
  assert.ok(cluster.node(leader).readStatus().confState.voters
    .includes(cluster.raftPeerIdOf(leader)));
});

test('same-turn runtime, lifecycle, term, configuration, address and stage ' +
  'fences refuse stale transported permits', (t) => {
  const {cluster, leader} = elected(t);
  const base = permit(cluster, leader,
    RAFT_MEMBERSHIP_TRANSITION_STAGE.ADD_LEARNER, 1);
  const cases = [
    [{runtimeGeneration: base.runtimeGeneration + 1},
      RAFT_MEMBERSHIP_TRANSITION_REASON.STALE_RUNTIME],
    [{replicaLifecycleIncarnation: 'stale-incarnation'},
      RAFT_MEMBERSHIP_TRANSITION_REASON.STALE_LIFECYCLE],
    [{leaderTerm: base.leaderTerm + 1},
      RAFT_MEMBERSHIP_TRANSITION_REASON.STALE_LEADERSHIP],
    [{peerAddress: 'raft-rs://replica-wrong'},
      RAFT_MEMBERSHIP_TRANSITION_REASON.IDENTITY_MISMATCH],
    [{leaderConfigurationStamp: {...base.leaderConfigurationStamp,
      membershipGenerationIndex:
        base.leaderConfigurationStamp.membershipGenerationIndex + 1}},
    RAFT_MEMBERSHIP_TRANSITION_REASON.STALE_CONFIGURATION],
  ];
  for (const [override, reason] of cases) {
    assert.equal(propose(cluster, leader, {...base, ...override}).reason,
      reason);
  }
  const add = propose(cluster, leader, base);
  assert.equal(add.reason, RAFT_MEMBERSHIP_TRANSITION_REASON.PROPOSED);
  const remove = permit(cluster, leader,
    RAFT_MEMBERSHIP_TRANSITION_STAGE.REMOVE, 2);
  assert.equal(propose(cluster, leader, remove).reason,
    RAFT_MEMBERSHIP_TRANSITION_REASON.ALREADY_ABSENT);
  const regressed = propose(cluster, leader, {...remove,
    stage: RAFT_MEMBERSHIP_TRANSITION_STAGE.ADD_LEARNER,
    permitSequence: 3});
  assert.equal(regressed.reason,
    RAFT_MEMBERSHIP_TRANSITION_REASON.STALE_PERMIT);
});

test('an exact old port cannot rebind to a same-core reopen', (t) => {
  const {cluster, leader} = elected(t);
  const oldPort = cluster.node(leader);
  const oldPermit = permit(cluster, leader,
    RAFT_MEMBERSHIP_TRANSITION_STAGE.ADD_LEARNER, 1);
  cluster.restart(leader);
  const closed = oldPort[RAFT_OPERATION.PROPOSE_MEMBERSHIP_TRANSITION](
    oldPermit);
  assert.equal(closed.reason, 'closed');
  const reopened = cluster.node(leader)[
    RAFT_OPERATION.PROPOSE_MEMBERSHIP_TRANSITION](oldPermit);
  assert.equal(reopened.reason,
    RAFT_MEMBERSHIP_TRANSITION_REASON.STALE_LEADERSHIP);
});

test('configuration ABA advances its dedicated generation and rejects the ' +
  'old permit even when the peer set returns to the same key', (t) => {
  const {cluster, leader} = elected(t);
  const stale = permit(cluster, leader,
    RAFT_MEMBERSHIP_TRANSITION_STAGE.ADD_LEARNER, 1);
  assert.equal(propose(cluster, leader, stale).reason,
    RAFT_MEMBERSHIP_TRANSITION_REASON.PROPOSED);
  const targetPeer = new RaftRsPeerIdentityRegistry(cluster.replica(leader).db)
    .raftPeerIdOf(TARGET);
  assert.ok(cluster.settle(() => cluster.node(leader).readStatus()
    .confState.learners.includes(targetPeer)));
  assert.equal(propose(cluster, leader, permit(cluster, leader,
    RAFT_MEMBERSHIP_TRANSITION_STAGE.REMOVE, 2)).reason,
  RAFT_MEMBERSHIP_TRANSITION_REASON.PROPOSED);
  assert.ok(cluster.settle(() => !cluster.node(leader).readStatus()
    .confState.learners.includes(targetPeer)));
  const after = cluster.node(leader).readStatus();
  assert.equal(after.configurationKey,
    stale.leaderConfigurationStamp.configurationKey);
  assert.ok(after.membershipGenerationIndex >
    stale.leaderConfigurationStamp.membershipGenerationIndex);
  assert.equal(propose(cluster, leader, {...stale,
    permitSequence: 3,
    leaderTerm: after.term,
    runtimeGeneration: after.runtimeGeneration,
    replicaLifecycleIncarnation: after.lifecycleIncarnation}).reason,
  RAFT_MEMBERSHIP_TRANSITION_REASON.STALE_CONFIGURATION);
});

test('a two-node leadership round trip cannot revive an old owner permit ' +
  'after a later owner adds and removes the exact learner', (t) => {
  const {cluster, leader: firstLeader} = elected(t);
  const nextLeader = FOUNDERS.find((replicaId) => replicaId !== firstLeader);
  const stale = permit(cluster, firstLeader,
    RAFT_MEMBERSHIP_TRANSITION_STAGE.ADD_LEARNER, 1);
  transferTo(cluster, firstLeader, nextLeader);
  const added = propose(cluster, nextLeader, permit(cluster, nextLeader,
    RAFT_MEMBERSHIP_TRANSITION_STAGE.ADD_LEARNER, 2));
  assert.equal(added.reason, RAFT_MEMBERSHIP_TRANSITION_REASON.PROPOSED);
  const targetPeer = new RaftRsPeerIdentityRegistry(
    cluster.replica(nextLeader).db).raftPeerIdOf(TARGET);
  assert.ok(cluster.settle(() => cluster.node(nextLeader).readStatus()
    .confState.learners.includes(targetPeer)));
  const removed = propose(cluster, nextLeader, permit(cluster, nextLeader,
    RAFT_MEMBERSHIP_TRANSITION_STAGE.REMOVE, 3));
  assert.equal(removed.reason, RAFT_MEMBERSHIP_TRANSITION_REASON.PROPOSED);
  assert.ok(cluster.settle(() => !cluster.node(nextLeader).readStatus()
    .confState.learners.includes(targetPeer)));
  transferTo(cluster, nextLeader, firstLeader);
  const late = propose(cluster, firstLeader, stale);
  assert.ok([
    RAFT_MEMBERSHIP_TRANSITION_REASON.STALE_LEADERSHIP,
    RAFT_MEMBERSHIP_TRANSITION_REASON.STALE_CONFIGURATION,
  ].includes(late.reason), `late permit was ${JSON.stringify(late)}`);
  assert.equal(cluster.node(firstLeader).readStatus().confState.learners
    .includes(targetPeer), false);
});

test('a one-voter proposal buffers its settlement before the anchored answer ' +
  'returns', (t) => {
  const cluster = new PartitionNodeCluster({partitionId: `${GROUP}-single`,
    replicaIds: [FOUNDERS[0]]});
  t.after(() => cluster.dispose());
  cluster.tickers = [FOUNDERS[0]];
  assert.ok(cluster.settle(() => cluster.leaderReplicaId() !== null));
  const leader = cluster.leaderReplicaId();
  new RaftRsPeerIdentityRegistry(cluster.replica(leader).db)
    .registerReplica(TARGET);
  const settlements = [];
  cluster.node(leader).subscribe(RAFT_EVENT.CONF_CHANGE_APPLIED,
    (event) => settlements.push(event));
  const answer = propose(cluster, leader, permit(cluster, leader,
    RAFT_MEMBERSHIP_TRANSITION_STAGE.ADD_LEARNER, 1));
  assert.equal(answer.reason, RAFT_MEMBERSHIP_TRANSITION_REASON.PROPOSED);
  assert.ok(settlements.some(({appliedIndex}) =>
    appliedIndex >= answer.proposalIndex),
  'the settlement emitted synchronously is observable before the answer');
});


test('committed semantic ConfChange context reserves the target identity on ' +
  'followers only after real apply and survives reopen and log pruning', (t) => {
  const {cluster, leader} = electedWithoutTargetRegistration(t);
  const follower = FOUNDERS.find((replicaId) => replicaId !== leader);
  const leaderRegistry = new RaftRsPeerIdentityRegistry(
    cluster.replica(leader).db);
  const followerRegistry = new RaftRsPeerIdentityRegistry(
    cluster.replica(follower).db);
  const targetPeer = leaderRegistry.registerReplica(TARGET);
  assert.equal(followerRegistry.raftPeerIdOf(TARGET), null,
    'setup: follower is not pre-registered with the target identity');
  const added = propose(cluster, leader, permit(cluster, leader,
    RAFT_MEMBERSHIP_TRANSITION_STAGE.ADD_LEARNER, 1));
  assert.equal(added.reason, RAFT_MEMBERSHIP_TRANSITION_REASON.PROPOSED);
  assert.ok(cluster.settle(() => cluster.node(follower).readStatus()
    .confState.learners.includes(targetPeer), {rounds: 400}),
  'follower applies the committed ConfChange containing the target peer');
  assert.equal(followerRegistry.raftPeerIdOf(TARGET), targetPeer);
  cluster.restart(follower);
  assert.equal(new RaftRsPeerIdentityRegistry(cluster.replica(follower).db)
    .raftPeerIdOf(TARGET), targetPeer,
  'the committed identity mapping survives close/reopen');
  cluster.replica(follower).db.prepare(
    'DELETE FROM _raft_rs_log WHERE group_id = ? AND log_index <= ?')
    .run(cluster.partitionId, added.proposalIndex);
  assert.equal(new RaftRsPeerIdentityRegistry(cluster.replica(follower).db)
    .raftPeerIdOf(TARGET), targetPeer,
  'operation-history pruning does not remove the permanent identity mapping');
});

test('malformed managed ConfChange context refuses before durable ' +
  'identity mutation or native configuration mutation', (t) => {
  const {cluster, leader} = electedWithoutTargetRegistration(t,
    'managed-context-negative');
  const targetPeer = deriveRaftRsPeerId(TARGET);
  const proposed = cluster.node(leader).proposeConfChange({
    transition: 0,
    changes: [{changeType: RAFT_RS_CONF_CHANGE_TYPE.ADD_LEARNER_NODE,
      nodeId: targetPeer}],
    context: Buffer.from('not json').toString('base64'),
  });
  assert.equal(proposed.outcome, RAFT_OPERATION_OUTCOME.CORE_OK);
  assert.ok(cluster.settle(() => cluster.node(leader).readStatus()
    .outcome === RAFT_OPERATION_OUTCOME.HOST_FAILURE, {rounds: 400}),
  'committed malformed managed context holds the group safely');
  const failed = cluster.node(leader).readStatus();
  assert.equal(failed.outcome, RAFT_OPERATION_OUTCOME.HOST_FAILURE);
  assert.equal(failed.recoveryRequired, true);
  assert.equal(new RaftRsPeerIdentityRegistry(cluster.replica(leader).db)
    .raftPeerIdOf(TARGET), null,
  'malformed managed context does not durably reserve the target');
});

test('decoded null managed ConfChange context refuses before durable or ' +
  'native progress', (t) => {
  const {cluster, leader} = electedWithoutTargetRegistration(t,
    'managed-null-context');
  const targetPeer = deriveRaftRsPeerId(TARGET);
  const before = cluster.node(leader).readStatus();
  const proposed = cluster.node(leader).proposeConfChange({
    transition: 0,
    changes: [{changeType: RAFT_RS_CONF_CHANGE_TYPE.ADD_LEARNER_NODE,
      nodeId: targetPeer}],
    context: Buffer.from('null').toString('base64'),
  });
  assert.equal(proposed.outcome, RAFT_OPERATION_OUTCOME.CORE_OK);
  assert.ok(cluster.settle(() => cluster.node(leader).readStatus()
    .outcome === RAFT_OPERATION_OUTCOME.HOST_FAILURE, {rounds: 400}),
  'committed null managed context holds the group safely');
  assert.equal(new RaftRsPeerIdentityRegistry(cluster.replica(leader).db)
    .raftPeerIdOf(TARGET), null,
  'decoded null managed context does not durably reserve the target');
  const durable = cluster.replica(leader).db.prepare(
    'SELECT applied_index, membership_generation_index FROM ' +
    '_raft_rs_applied_state WHERE group_id = ?').get(cluster.partitionId);
  assert.equal(durable.membership_generation_index,
    before.membershipGenerationIndex,
    'decoded null context does not advance the durable generation');
  assert.equal(cluster.node(leader).readStatus().recoveryRequired, true,
    'decoded null context leaves the live runtime held before usable progress');
});

test('legacy empty-context ConfChange remains valid', (t) => {
  const {cluster, leader} = electedWithoutTargetRegistration(t,
    'legacy-empty-context');
  const targetPeer = deriveRaftRsPeerId(TARGET);
  const legacy = cluster.node(leader).proposeConfChange({
    transition: 0,
    changes: [{changeType: RAFT_RS_CONF_CHANGE_TYPE.ADD_LEARNER_NODE,
      nodeId: targetPeer}],
  });
  assert.equal(legacy.outcome, RAFT_OPERATION_OUTCOME.CORE_OK,
    'empty legacy ConfChange context remains valid');
  assert.ok(cluster.settle(() => cluster.node(leader).readStatus()
    .confState.learners.includes(targetPeer)));
});

test('committed context validates exact logical identity binding and rolls ' +
  'back registry writes with applied-state failure', (t) => {
  const {cluster, leader} = electedWithoutTargetRegistration(t,
    'managed-context-atomicity');
  const follower = FOUNDERS.find((replicaId) => replicaId !== leader);
  const targetPeer = new RaftRsPeerIdentityRegistry(cluster.replica(leader).db)
    .registerReplica(TARGET);
  const followerDb = cluster.replica(follower).db;
  const before = followerDb.prepare(
    'SELECT applied_index, membership_generation_index FROM ' +
    '_raft_rs_applied_state WHERE group_id = ?').get(cluster.partitionId);
  followerDb.prepare(
    'INSERT INTO raft_rs_peer_identity (replica_identity, raft_peer_id) ' +
    'VALUES (?, ?)').run('conflicting-logical-replica', targetPeer);
  const answer = propose(cluster, leader, permit(cluster, leader,
    RAFT_MEMBERSHIP_TRANSITION_STAGE.ADD_LEARNER, 1));
  assert.equal(answer.reason, RAFT_MEMBERSHIP_TRANSITION_REASON.PROPOSED);
  assert.ok(cluster.settle(() => cluster.node(follower).readStatus()
    .outcome === RAFT_OPERATION_OUTCOME.HOST_FAILURE, {rounds: 400}),
  'follower fails conservatively after native apply cannot commit registry');
  assert.equal(new RaftRsPeerIdentityRegistry(followerDb)
    .raftPeerIdOf(TARGET), null,
  'failed committed-context reservation leaves no target registry row');
  const after = followerDb.prepare(
    'SELECT applied_index, membership_generation_index FROM ' +
    '_raft_rs_applied_state WHERE group_id = ?').get(cluster.partitionId);
  assert.equal(after.membership_generation_index,
    before.membership_generation_index,
    'membership generation rolls back with the failed registry write');
  assert.ok(after.applied_index < answer.proposalIndex,
    'applied state does not advance to the failed ConfChange index');
});

test('committed context never treats an address as the replica identity', (t) => {
  const {cluster, leader} = electedWithoutTargetRegistration(t,
    'address-as-identity');
  const targetPeer = deriveRaftRsPeerId(TARGET);
  const proposed = cluster.node(leader).proposeConfChange({
    transition: 0,
    changes: [{changeType: RAFT_RS_CONF_CHANGE_TYPE.ADD_LEARNER_NODE,
      nodeId: targetPeer}],
    context: Buffer.from(JSON.stringify({
      operationId: 'address-as-identity-operation',
      transitionIdentity: 'address-as-identity-transition',
      permitSequence: 1,
      stage: RAFT_MEMBERSHIP_TRANSITION_STAGE.ADD_LEARNER,
      replicaIdentity: cluster.addressOf(TARGET),
      peerId: targetPeer,
    })).toString('base64'),
  });
  assert.equal(proposed.outcome, RAFT_OPERATION_OUTCOME.CORE_OK);
  assert.ok(cluster.settle(() => cluster.node(leader).readStatus()
    .outcome === RAFT_OPERATION_OUTCOME.HOST_FAILURE, {rounds: 400}));
  const failed = cluster.node(leader).readStatus();
  assert.equal(failed.outcome, RAFT_OPERATION_OUTCOME.HOST_FAILURE);
  assert.equal(failed.recoveryRequired, true);
  assert.equal(new RaftRsPeerIdentityRegistry(cluster.replica(leader).db)
    .raftPeerIdOf(TARGET), null);
});
