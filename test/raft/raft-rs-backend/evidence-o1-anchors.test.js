// Direct semantic anchors of the committed-read boundary (committed-read
// amendment 1, section 5), on real rs-raft partition ports, so that a
// defect common to a relational witness and its oracle cannot make the
// comparison vacuously green:
//   - GENESIS x durable record: the founder restores its one group (O-a);
//   - COMMITTED naming self while no record exists: refused
//     DURABLE_RECORD_MISSING at the port, nothing opened;
//   - a joint configuration: the bootstrap read refuses it, the witness read
//     answers it with its outgoing voters, the target's validation refuses
//     it as a stamp, and the read answers the fold again once the group has
//     left the joint state;
//   - RF = 1: a transfer to the target below its admission is one typed
//     refusal, and the retry after admission completes (B13);
//   - B1 reachability: the construction that keeps a TimeoutNow away from
//     a target below its gate, checked on production behaviour (every
//     append carries commit >= a_self; a_self is held only applied;
//     TimeoutNow is sent only with the gate open);
//   - B12: R-1a answers WITNESS_BELOW_GATE on a witness whose replayed view
//     transiently omits a committed voter, and STILL_VOTER once its gate is
//     open.

import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  HISTORY,
  LEADER_ROLE,
  UNBOUNDED,
  WIRE,
  admissionIndexOf,
  commitVoterChange,
  createModelCluster,
  durableOf,
  formHistory,
  identityOf,
  joinFromStamp,
  leaderOf,
  liveReplicas,
  oracleStamp,
  peerIdIn,
  prefixFilter,
  reserveIdentity,
  restartWith,
  roleOf,
  settle,
  termAndVote,
} from './evidence-o1-model.js';
import {
  durableLog,
  foldAt,
  logFold,
} from './committed-membership-oracles.js';
import {
  RAFT_LEADERSHIP_TRANSFER_REASON,
  RAFT_LEADERSHIP_TRANSFER_SUCCESSOR,
  RAFT_MEMBERSHIP_OPERATION,
  RAFT_OPERATION,
  RAFT_OPERATION_OUTCOME,
} from '../../../src/raft/raft-operation-port-constants.js';
import {
  COMMITTED_MEMBERSHIP_ANSWER_KIND,
  COMMITTED_MEMBERSHIP_READ_PURPOSE,
  COMMITTED_MEMBERSHIP_REFUSAL,
  COMMITTED_MEMBERSHIP_STAMP_DEFECT,
} from '../../../src/raft/raft-committed-membership-constants.js';
import {RAFT_PARTITION_NODE_REQUEST} from
  '../../../src/raft/raft-provider-contract-constants.js';
import {genesisStamp} from
  '../../../src/raft/raft-committed-membership-stamp.js';
import {
  RUNTIME_PHASE,
  RUNTIME_REASON,
} from '../../../src/raft/raft-rs-runtime-owner-constants.js';
import {assignReplicaHandlerCommittedMembershipMethods} from
  '../../../src/node/replica-handler-committed-membership-methods.js';
import {
  REPLACE_COMPLETION_VERDICT,
  decideReplaceCompletion,
} from '../../../src/rebalancer/operation-workflow-replace-owner.js';
import {readPartitionReplicaMembership} from
  '../../../src/partition/partition-service-raft-membership-administration.js';
import {PARTITION_REPLICA_MEMBERSHIP_STATE} from
  '../../../src/partition/partition-replica-membership-constants.js';
import {
  ReplicaOperationField,
  ReplicaOperationResponseStatus,
} from '../../../src/rebalancer/replica-operation-constants.js';
import {OperationType} from
  '../../../src/rebalancer/replica-operation-progress.js';
import {SERVICE_TYPE} from '../../../src/constants/index.js';

const PARTITION_ID = 'evidence-o1-anchors';
const READ = RAFT_OPERATION.READ_COMMITTED_MEMBERSHIP;
const PROBE_ROUNDS = 400;

class BareHandler {}
assignReplicaHandlerCommittedMembershipMethods(BareHandler);

function found(founders, target, filter = {value: null}) {
  const model = createModelCluster({partitionId: PARTITION_ID, founders,
    target, filter});
  assert.ok(settle(model, () => leaderOf(model) !== null &&
    durableOf(model, leaderOf(model)).applied.appliedIndex > 0,
  [founders[0]]), 'setup: a leader that applied an entry');
  const leader = leaderOf(model);
  const genesis = founders.map((identity) => peerIdIn(model, leader,
    identity));
  return {model, leader, genesis};
}

function bootstrapRead(model, replicaId) {
  return model.node(replicaId)[READ]({
    purpose: COMMITTED_MEMBERSHIP_READ_PURPOSE.BOOTSTRAP});
}

test('anchor: a GENESIS stamp reaching a founder that holds a durable ' +
  'record restores that one group (O-a: one genesis at every index)', () => {
  const founder = 'gen-f';
  const {model, genesis} = found([founder], founder);
  try {
    const [peerId] = genesis;
    const logBefore = durableLog(model.replica(founder).dbFile, PARTITION_ID);
    const restarted = restartWith(model, founder,
      {[RAFT_PARTITION_NODE_REQUEST.BOOTSTRAP_MEMBERSHIP]:
        genesisStamp([founder])});
    assert.equal(restarted.refused, undefined,
      `the founder restores (${restarted.refused?.message})`);
    assert.equal(model.node(founder).readStatus().gateOpen, true,
      'restored open from the record');
    const durable = durableOf(model, founder).applied;
    assert.equal(durable.bootstrapIndex, 0);
    assert.equal(durable.admissionIndex, 0);
    const logAfter = durableLog(model.replica(founder).dbFile, PARTITION_ID);
    assert.deepEqual(logAfter.slice(0, logBefore.length).map((entry) =>
      [entry.index, entry.term]), logBefore.map((entry) =>
      [entry.index, entry.term]), 'the same group\'s log');
    assert.ok(settle(model, () => roleOf(model, founder) === LEADER_ROLE,
      [founder]), 'the restored sole voter leads again');
    const fold = logFold(model.replica(founder).dbFile, PARTITION_ID,
      [peerId]);
    assert.ok(fold.every((snapshot) => snapshot.voters.length === 1 &&
      snapshot.voters[0] === peerId),
    'O-a: one genesis configuration at every index');
  } finally {
    model.dispose();
  }
});

test('anchor: a COMMITTED stamp already naming the target a voter, with no ' +
  'durable record for it, is refused DURABLE_RECORD_MISSING at the port',
() => {
  const founders = ['zmb-a', 'zmb-b', 'zmb-c'];
  const target = 'zmb-t';
  const {model, leader, genesis} = found(founders, target);
  try {
    for (const member of liveReplicas(model)) {
      reserveIdentity(model, member, target);
    }
    commitVoterChange(model, RAFT_MEMBERSHIP_OPERATION.ADD_PEER, target);
    const stamp = oracleStamp(model, leader, genesis);
    const zombiePeerId = peerIdIn(model, leader, target);
    assert.ok(stamp.voters.includes(zombiePeerId),
      'setup: the committed configuration names the target');
    assert.throws(() => joinFromStamp(model, target, stamp), (error) => {
      assert.equal(error.consensus?.outcome,
        RAFT_OPERATION_OUTCOME.CORE_REFUSED);
      assert.equal(error.consensus?.reason,
        RUNTIME_REASON.DURABLE_RECORD_MISSING);
      assert.equal(error.consensus?.phase, RUNTIME_PHASE.DURABLE_RECORD_READ);
      assert.equal(error.consensus?.retryable, false);
      return true;
    }, 'the zombie identity is never opened');
    assert.equal(durableOf(model, target).applied, null,
      'no record was written');
  } finally {
    model.dispose();
  }
});

test('anchor: a joint configuration is refused to a bootstrap read and as ' +
  'a stamp, answered to a witness read with its outgoing voters, and the ' +
  'read answers the fold again once the group left the joint state', () => {
  const founders = ['jnt-a', 'jnt-b', 'jnt-c'];
  const {model, leader, genesis} = found(founders, 'jnt-none');
  try {
    const leaving = founders.find((identity) => identity !== leader);
    model.node(leader).proposeConfChange({
      transition: WIRE.transition.Explicit,
      changes: [{changeType: WIRE.changeType.RemoveNode,
        nodeId: peerIdIn(model, leader, leaving)}],
    });
    assert.ok(settle(model, () =>
      durableOf(model, leader).applied.votersOutgoing.length > 0, [leader]),
    'setup: the leader applied a joint configuration');
    const durable = durableOf(model, leader).applied;
    const refused = bootstrapRead(model, leader);
    assert.equal(refused.kind, COMMITTED_MEMBERSHIP_ANSWER_KIND.REFUSED);
    assert.equal(refused.reason, COMMITTED_MEMBERSHIP_REFUSAL.JOINT);
    const witnessed = model.node(leader)[READ]({
      purpose: COMMITTED_MEMBERSHIP_READ_PURPOSE.WITNESS});
    assert.equal(witnessed.kind, COMMITTED_MEMBERSHIP_ANSWER_KIND.COMMITTED);
    assert.deepEqual([...witnessed.votersOutgoing].sort(),
      durable.votersOutgoing, 'the witness answer carries the durable ' +
        'outgoing voters');
    assert.throws(() => new BareHandler().resolveStampedBootstrapMembership({
      partitionId: PARTITION_ID, replicaId: 'jnt-t',
      bootstrapMembership: witnessed, observedServices: []}), (error) => {
      assert.equal(error.code, COMMITTED_MEMBERSHIP_REFUSAL.STAMP_INVALID);
      assert.equal(error.defect, COMMITTED_MEMBERSHIP_STAMP_DEFECT.JOINT);
      return true;
    }, 'a joint answer is no stamp');
    model.node(leader).proposeConfChange({transition: WIRE.transition.Auto,
      changes: []});
    assert.ok(settle(model, () =>
      durableOf(model, leader).applied.votersOutgoing.length === 0 &&
      durableOf(model, leader).applied.voters.length === 2, [leader]),
    'setup: the group left the joint state');
    const answer = bootstrapRead(model, leader);
    assert.equal(answer.kind, COMMITTED_MEMBERSHIP_ANSWER_KIND.COMMITTED);
    const fold = foldAt(logFold(model.replica(leader).dbFile, PARTITION_ID,
      genesis), answer.appliedIndex);
    assert.deepEqual([...answer.voters].sort(), fold.voters,
      'O-a: the answer is the fold at its label');
    assert.equal(answer.appliedIndex,
      durableOf(model, leader).applied.appliedIndex,
      'the label is the durable applied index');
  } finally {
    model.dispose();
  }
});

test('anchor (B13, RF = 1): a transfer to the target below its admission ' +
  'is one typed refusal; the retry after admission completes', () => {
  const source = 'rf1-s';
  const target = 'rf1-t';
  const {model, leader, genesis} = found([source], target);
  try {
    const stamp = oracleStamp(model, leader, genesis);
    joinFromStamp(model, target, stamp);
    const targetPeerId = peerIdIn(model, target, target);
    const before = termAndVote(durableOf(model, target).hard);
    const premature = model.node(source).transferLeadership({
      successor: RAFT_LEADERSHIP_TRANSFER_SUCCESSOR.NAMED,
      replicaIdentity: target});
    assert.equal(premature.outcome, RAFT_OPERATION_OUTCOME.CORE_REFUSED,
      `one typed refusal (${JSON.stringify(premature)})`);
    assert.equal(premature.reason,
      RAFT_LEADERSHIP_TRANSFER_REASON.TARGET_NOT_VOTER);
    settle(model, () => false, [source], 60);
    assert.equal(roleOf(model, source), LEADER_ROLE, 'the source still leads');
    assert.notEqual(roleOf(model, target), LEADER_ROLE);
    assert.deepEqual(termAndVote(durableOf(model, target).hard), before,
      'O-d: the refused transfer raised no term on the target');

    commitVoterChange(model, RAFT_MEMBERSHIP_OPERATION.ADD_PEER, target);
    const aSelf = admissionIndexOf(model, source, targetPeerId,
      stamp.appliedIndex);
    assert.ok(settle(model, () =>
      durableOf(model, target).applied.admissionIndex === aSelf &&
      model.node(target).readStatus().gateOpen === true, [source]),
    'the target applies its admission and opens');
    const retry = model.node(source).transferLeadership({
      successor: RAFT_LEADERSHIP_TRANSFER_SUCCESSOR.NAMED,
      replicaIdentity: target});
    assert.equal(retry.outcome, RAFT_OPERATION_OUTCOME.CORE_OK,
      `the retry is stepped (${JSON.stringify(retry)})`);
    assert.equal(retry.reason,
      RAFT_LEADERSHIP_TRANSFER_REASON.TRANSFER_REQUESTED);
    assert.ok(settle(model, () => roleOf(model, target) === LEADER_ROLE &&
      roleOf(model, source) !== LEADER_ROLE, [source, target]),
    'the transfer completes on the retry');
  } finally {
    model.dispose();
  }
});

// B1 reachability (lead ruling 2026-09-26): the synthetic cell "the target
// holds its AddNode with a commit index below it and receives MsgTimeoutNow"
// is unreachable by construction, and this anchor checks the construction
// on production behaviour instead of prose: the leader tracks the target
// only after applying AddNode(t), so every append it sends the target
// carries a commit index at or past a_self; the target's commit and apply
// reach a_self with the entry, in the same drain; and a TimeoutNow is sent
// to the target only once its progress is caught up - by then its gate is
// open, so the transfer is honoured at or past the gate and never below it.
test('anchor (B1 reachability): every append to the target after its ' +
  'AddNode carries commit >= a_self, the target holds a_self only applied, ' +
  'and TimeoutNow reaches it only with its gate open', () => {
  const founders = ['tn-a', 'tn-b', 'tn-c'];
  const target = 'tn-t';
  const sent = [];
  let model = null;
  const observe = (from, address, packet) => {
    if (model === null || address !== model.addressOf(target)) {
      return;
    }
    const message = packet?.message ?? {};
    sent.push({
      msgType: message.msgType,
      commit: message.commit === undefined ? null : Number(message.commit),
      targetApplied: durableOf(model, target).applied?.appliedIndex ?? null,
      targetGateOpen: model.node(target).readStatus().gateOpen,
    });
  };
  model = createModelCluster({partitionId: PARTITION_ID, founders, target,
    filter: {value: null}, observe});
  try {
    assert.ok(settle(model, () => leaderOf(model) !== null &&
      durableOf(model, leaderOf(model)).applied.appliedIndex > 0,
    [founders[0]]), 'setup: a leader that applied an entry');
    const leader = leaderOf(model);
    const genesis = founders.map((identity) => peerIdIn(model, leader,
      identity));
    const stamp = oracleStamp(model, leader, genesis);
    joinFromStamp(model, target, stamp);
    commitVoterChange(model, RAFT_MEMBERSHIP_OPERATION.ADD_PEER, target);
    const targetPeerId = peerIdIn(model, target, target);
    const aSelf = admissionIndexOf(model, leader, targetPeerId,
      stamp.appliedIndex);
    let holdsObserved = 0;
    const check = () => {
      const {applied, hard} = durableOf(model, target);
      const last = durableLog(model.replica(target).dbFile, PARTITION_ID)
        .at(-1)?.index ?? 0;
      if (last >= aSelf) {
        holdsObserved += 1;
        assert.ok(Number(hard.commit) >= aSelf,
          'the target learns a_self is committed with the entry itself');
        assert.ok(applied.appliedIndex >= aSelf,
          'the target applies a_self in the drain that stores it');
      }
      const status = model.node(target).readStatus();
      assert.ok(status.gateOpen === true || status.role !== LEADER_ROLE,
        'the target never leads below its gate');
    };
    model.tickers = [leader];
    assert.ok(model.settle(() => model.node(target).readStatus().gateOpen ===
      true, {rounds: PROBE_ROUNDS, between: check}),
    'setup: the target catches up and opens');
    assert.ok(holdsObserved > 0, 'the target was observed holding a_self');
    const appends = sent.filter((packet) =>
      packet.msgType === WIRE.messageType.MsgAppend);
    assert.ok(appends.length > 0, 'the leader appended to the target');
    assert.ok(appends.every((packet) => packet.commit >= aSelf),
      'every append the leader sent the target carries commit >= a_self ' +
        '(it tracks the target only after applying AddNode(t))');

    const transfer = model.node(leader).transferLeadership({
      successor: RAFT_LEADERSHIP_TRANSFER_SUCCESSOR.NAMED,
      replicaIdentity: target});
    assert.equal(transfer.outcome, RAFT_OPERATION_OUTCOME.CORE_OK,
      `the leader stepped the transfer (${JSON.stringify(transfer)})`);
    assert.ok(model.settle(() => roleOf(model, target) === LEADER_ROLE,
      {rounds: PROBE_ROUNDS, between: check}),
    'the transfer is honoured once the target is at its gate');
    const timeoutNows = sent.filter((packet) =>
      packet.msgType === WIRE.messageType.MsgTimeoutNow);
    assert.ok(timeoutNows.length > 0, 'a TimeoutNow was sent to the target');
    assert.ok(timeoutNows.every((packet) => packet.targetApplied >= aSelf &&
      packet.targetGateOpen === true),
    'every TimeoutNow was sent to the target with its gate already open');
    assert.equal(model.node(target).readStatus().gateOpen, true);
  } finally {
    model.dispose();
  }
});

// The REPLACE owner's R-1a, reading its witness through the port's
// committed-membership read (WITNESS purpose) as production does.
// F1 (owner ruling 2026-09-26, merged in integration 2): the completion
// authority is the group's leader-answered committed configuration, reached
// from the target's answer with one redirect; each witness message is
// answered by the port of the replica it addresses, and the replicas route
// by their own node ids (as participation-gate.test.js B12).
function serviceOf(model, replicaId) {
  return {raft: model.node(replicaId), replicaId, partitionId: PARTITION_ID,
    replicaIds: [], raftTimingConfig: null};
}

function replaceOwnerOver(model, target, source) {
  return {
    repository: {
      getReplaceSourceReplicaId: () => source,
      getReplaceTargetReplicaId: () => target,
      getObservedReplicaStatusFromCache: () => 'active',
    },
    getCachedCriticalReplicaRows: () => [...model.replicas.keys()].map(
      (replicaId) => ({replica_id: replicaId, node_id: `${replicaId}-node`})),
    messageRouter: {
      deliver: async (_target, payload) => ({
        status: ReplicaOperationResponseStatus.COMPLETED,
        [ReplicaOperationField.MEMBERSHIP]:
          await readPartitionReplicaMembership(serviceOf(model,
            payload[ReplicaOperationField.REPLICA_ID]), source),
      }),
    },
  };
}

// B12 over two transient shapes: H1 + self (C_j = {b}; the replayed view
// passes through {t}: b ABSENT, nothing unresolved) and H5 + self (C_j =
// {a}; the view passes through {b, t}: a absent while b, removed by j, was
// never reserved on the target: UNRESOLVED). Both fail closed; only the
// first reaches the gate branch of R-1a.
const B12_SHAPES = Object.freeze([
  {key: 'H1', sourceLetter: 'b',
    belowGate: PARTITION_REPLICA_MEMBERSHIP_STATE.ABSENT,
    verdict: REPLACE_COMPLETION_VERDICT.WITNESS_BELOW_GATE},
  {key: 'H5', sourceLetter: 'a',
    belowGate: PARTITION_REPLICA_MEMBERSHIP_STATE.UNRESOLVED,
    verdict: REPLACE_COMPLETION_VERDICT.UNAVAILABLE},
]);

for (const shape of B12_SHAPES) {
  test(`anchor (B12, ${shape.key} + self): R-1a answers ${shape.verdict} ` +
    'on a witness below its gate whose replayed view omits the committed ' +
    'voter it asks about, and STILL_VOTER once the gate is open', async () => {
    await b12Shape(shape);
  });
}

async function b12Shape({key, sourceLetter, belowGate, verdict}) {
  const target = identityOf(key, 't');
  const source = identityOf(key, sourceLetter);
  const founders = HISTORY[key].genesis.map((letter) =>
    identityOf(key, letter));
  const filter = {value: null};
  const cap = {value: UNBOUNDED};
  const model = createModelCluster({partitionId: PARTITION_ID, founders,
    target, filter});
  try {
    const {leader, stamp, changeIndices} = formHistory(model, key);
    const sourcePeerId = peerIdIn(model, leader, source);
    assert.deepEqual(stamp.voters, [sourcePeerId],
      'setup: C_j = {a}: the source is the committed voter');
    filter.value = prefixFilter(cap);
    cap.value = 0;
    joinFromStamp(model, target, stamp);
    commitVoterChange(model, RAFT_MEMBERSHIP_OPERATION.ADD_PEER, target);
    const targetPeerId = peerIdIn(model, target, target);
    const transient = changeIndices.find((index) =>
      !foldAt(logFold(model.replica(leader).dbFile, PARTITION_ID,
        [...stamp.voters, targetPeerId]), index).voters.includes(
        sourcePeerId));
    assert.ok(transient !== undefined, 'setup: a cut where the replayed ' +
      'view omits the source');
    cap.value = transient;
    assert.ok(settle(model, () =>
      durableOf(model, target).applied.appliedIndex === transient, [leader]),
    'setup: the target replays to the transient cut');
    const owner = replaceOwnerOver(model, target, source);
    const operation = {operationId: 'b12', type: OperationType.REPLACE,
      entityType: SERVICE_TYPE.PARTITION, entityId: PARTITION_ID,
      partitionId: PARTITION_ID,
      replicaId: target, targetNodeId: 'b12-node'};
    const targetView = await readPartitionReplicaMembership(
      serviceOf(model, target), source);
    assert.equal(targetView.state, belowGate,
      'the below-gate witness does not show the committed voter');
    assert.equal(targetView.gateOpen, false);
    const below = await decideReplaceCompletion(owner, operation);
    assert.notEqual(below.verdict, REPLACE_COMPLETION_VERDICT.SOURCE_RETIRED,
      'R-1a never retires a source from a below-gate witness');
    assert.ok([verdict, REPLACE_COMPLETION_VERDICT.STILL_VOTER]
      .includes(below.verdict),
    `it waits, typed (${below.verdict}; under F1 the leader's answer may ` +
      'already decide STILL_VOTER)');
    cap.value = UNBOUNDED;
    assert.ok(settle(model, () =>
      model.node(target).readStatus().gateOpen === true, [leader]),
    'setup: the gate opens');
    const open = await decideReplaceCompletion(owner, operation);
    assert.equal(open.verdict, REPLACE_COMPLETION_VERDICT.STILL_VOTER,
      'at the gate the group\'s committed configuration holds the voter');
    assert.equal(open.observation.leaderReplicaId, open.observation.replicaId,
      'the verdict is the leader\'s own answer');
  } finally {
    model.dispose();
  }
}
