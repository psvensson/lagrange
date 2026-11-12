// Consumer seams retain the real decoder, transfer decision, message-group
// methods and partition write owner. Only the port's observation is substituted.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {refuseInboundStep} from '../../src/raft/raft-rs-runtime-faults.js';
import {RAFT_RS_MESSAGE_TYPE} from '../../src/raft/raft-rs-ingress-constants.js';
import {observeNativeRoleAndTerm, observeReplicaRoleAndTerm} from
  '../../src/raft/raft-rs-status-observation.js';
import {confChangeProposalRefusal} from '../../src/raft/raft-rs-conf-change-admission.js';
import {proposeMembershipTransition} from '../../src/raft/raft-rs-membership-transition-runtime.js';
import {removedLeaderAtApply, removedLeaderAtDrainEnd} from
  '../../src/raft/raft-rs-removed-leader-step-down.js';
import {decideLeadershipTransfer, removedLeaderAction} from '../../src/raft/raft-rs-leadership-transfer.js';
import {RAFT_LEADERSHIP_TRANSFER_SUCCESSOR as SUCCESSOR, RAFT_OPERATION_OUTCOME as OUTCOME,
  RAFT_EVENT} from '../../src/raft/raft-operation-port-constants.js';
import {MessageGroupService, RaftRole} from '../../src/message-group/message-group-service.js';
import {partitionWriteLeadershipRefusalOf} from
  '../../src/partition/partition-service-raft-write-commit.js';
import {buildPartitionWriteLeadershipRefusal,
  isRetryableWriteFailureCode, isReroutableWriteFailureCode, pickTypedWriteAnswer} from
  '../../src/partition/partition-write-kernel.js';
import {isRetryableControlPlaneError} from
  '../../src/control-plane/control-plane-error-classification.js';
import {QueryExecutorWriteRetryRouting} from
  '../../src/query/query-executor-write-retry-routing.js';
import {isRetryableWriteError, isReroutableWriteError} from '../../src/constants/errors.js';

const INVALID = [undefined, null, '2', 4, '__proto__', 'constructor'];
const TERM = 7;
const STALE_TERM = 42;
function nativeStatus(raftState) {
  return {raftState, term: TERM, lead: '1'};
}
function serviceObservation(raftState) {
  return observeReplicaRoleAndTerm({peerId: '1'}, {status: nativeStatus(raftState),
    confState: {voters: ['1'], votersOutgoing: [], learners: []},
    participation: {gateOpen: true}});
}
function messageGroup(read) {
  // Public composed prototype; controlled port and publication sinks, no fake
  // term decision or ledger fallback. This is not a physical MG startup proof.
  const service = Object.create(MessageGroupService.prototype);
  const events = new Map();
  const effects = [];
  const refusals = [];
  const withdrawals = [];
  let wired = false;
  Object.assign(service, {
    // Wiring captures initial membership for publication dedupe. Faults below
    // enter after this controlled valid opening; native tests prove real startup.
    raft: {readRoleAndTerm: () => wired ? read() : serviceObservation(0),
      subscribe: (event, callback) => events.set(event, callback)},
    operationLedger: {currentTerm: STALE_TERM, getLogLength: () => 0},
    pendingMessages: new Map(), acknowledgedMessages: new Map(),
    cdcHandler: {getSubscriptions: () => []},
    role: RaftRole.FOLLOWER, isLeader: false, leaderId: 'other',
    ignoreJoinPhaseRoleEvent: () => false,
    cancelLeaderOwnedActivation: () => withdrawals.push('cancel'),
    updateRebalancerLeadership: () => withdrawals.push('reconcile'),
    logger: {error: (_message, fields) => refusals.push(fields.consensus)},
    scheduleLeaderOwnedActivation: (term) => effects.push(term),
    queueRoleUpdate: (role) => effects.push(role),
    queueLeaderNodeUpdate: (nodeId) => effects.push(nodeId),
  });
  service.wireRaftEvents();
  wired = true;
  return {service, events, effects, refusals, withdrawals};
}

test('transfer refuses malformed native roles before already-leader or forward decisions', () => {
  for (const role of INVALID) {
    const status = nativeStatus(role);
    const refusal = observeNativeRoleAndTerm(status);
    for (const command of [{successor: SUCCESSOR.NAMED, target: '1'},
      {successor: SUCCESSOR.NAMED, target: '2'}, {successor: SUCCESSOR.MOST_CAUGHT_UP}]) {
      const decided = decideLeadershipTransfer('1',
        {status, confState: {voters: ['1', '2'], learners: []}}, command);
      assert.deepEqual(decided.answer, refusal);
      assert.equal(decided.transferee, undefined);
    }
  }
  const valid = {status: nativeStatus(0), confState: {voters: ['1', '2'], learners: []}};
  assert.equal(decideLeadershipTransfer('2', valid,
    {successor: SUCCESSOR.NAMED, target: '2'}).transferee, '2', 'valid follower forwards');
  assert.equal(decideLeadershipTransfer('2', valid,
    {successor: SUCCESSOR.NAMED, target: '1'}).answer.outcome, OUTCOME.CORE_OK);
});

test('message-group term and status preserve refused observation, never ledger term', () => {
  let observed = serviceObservation(undefined);
  const {service} = messageGroup(() => observed);
  const matches = (error) => error.raftResult === observed;
  assert.throws(() => service.getCurrentTerm(), matches);
  assert.throws(() => service.getStatus(), matches);
  observed = serviceObservation(2);
  assert.equal(service.getCurrentTerm(), TERM, 'finite failure clears at next owner read');
  assert.equal(service.getStatus().term, TERM);
  assert.equal(service.operationLedger.currentTerm, STALE_TERM, 'read performs no ledger repair');
});

test('message-group lifecycle refuses before role mutation or leader activation', () => {
  let observed = serviceObservation(undefined);
  const {service, events, effects, refusals, withdrawals} = messageGroup(() => observed);
  assert.equal(events.get(RAFT_EVENT.LEADER)(), observed);
  assert.deepEqual(refusals, [observed]);
  assert.deepEqual(withdrawals, []);
  assert.equal(service.role, RaftRole.FOLLOWER);
  assert.equal(service.isLeader, false);
  assert.deepEqual(effects, []);
  assert.equal(service.operationLedger.currentTerm, STALE_TERM);
  observed = serviceObservation(2);
  events.get(RAFT_EVENT.LEADER)();
  assert.equal(service.isLeader, true);
  assert.equal(effects.at(-1), TERM);
});

test('partition write admission preserves malformed-status refusal and terminal classification', () => {
  let observed = serviceObservation(undefined);
  let reads = 0;
  const service = {raft: {readRoleAndTerm: () => {
    reads++;
    return observed;
  }},
  partitionId: 'role-partition', replicaIds: ['a', 'b'],
  hasKnownRemoteLeaderWitness: () => false};
  const refused = partitionWriteLeadershipRefusalOf(service);
  assert.equal(refused.success, false);
  assert.equal(refused.consensus?.reason, observed.reason);
  assert.equal(refused.consensus?.phase, observed.phase);
  assert.equal(refused.consensus?.retryable, false);
  assert.equal(isRetryableWriteFailureCode(refused.failureCode), false);
  assert.equal(isReroutableWriteFailureCode(refused.failureCode), false);
  assert.equal(isRetryableWriteError(refused.error), false);
  assert.equal(isReroutableWriteError(refused.error), false);
  assert.equal(isRetryableControlPlaneError(refused), false);
  assert.equal(QueryExecutorWriteRetryRouting.prototype.isLeaderUnavailable.call(
    {}, refused.error, refused, true), false);
  assert.deepEqual(pickTypedWriteAnswer(refused).consensus, refused.consensus);
  observed = serviceObservation(0);
  assert.equal(isReroutableWriteFailureCode(
    partitionWriteLeadershipRefusalOf(service).failureCode), true, 'valid follower remains routing');
  observed = serviceObservation(2);
  assert.equal(partitionWriteLeadershipRefusalOf(service), null, 'valid leader is admitted');
  assert.equal(reads, 3, 'each decision consumes one compact read');
});


test('unopened message-group has explicit unavailability, not a ledger term', () => {
  const {service} = messageGroup(() => serviceObservation(2));
  service.raft = null;
  assert.throws(() => service.getCurrentTerm(), (error) =>
    error.raftResult?.outcome === OUTCOME.HOST_FAILURE &&
    error.raftResult.reason === 'replica-consensus-unavailable');
  service.role = RaftRole.LEADER;
  assert.equal(service.isCurrentRaftLeader(), false);
});


test('refused lifecycle observations withdraw an existing tenure without publishing a term', () => {
  const observed = serviceObservation(undefined);
  for (const event of [RAFT_EVENT.FOLLOWER, RAFT_EVENT.CANDIDATE, RAFT_EVENT.LEADER_CHANGE]) {
    const {service, events, refusals, withdrawals, effects} = messageGroup(() => observed);
    service.role = RaftRole.LEADER;
    service.isLeader = true;
    service.leadershipTenure = Object.freeze({term: STALE_TERM});
    assert.equal(events.get(event)('other'), observed);
    assert.equal(service.isLeader, false, 'unreadable authority cannot sustain leadership');
    assert.equal(service.isLeaderReplica(), false, 'withdrawal reaches published-leader callers');
    assert.equal(service.leadershipTenure, null);
    assert.equal(service.role, RaftRole.LEADER, 'no role is invented from refused observation');
    assert.equal(service.operationLedger.currentTerm, STALE_TERM);
    assert.deepEqual(effects, []);
    assert.deepEqual(refusals, [observed]);
    assert.deepEqual(withdrawals, ['cancel', 'reconcile']);
  }
});


test('membership commands preserve malformed-role refusal before identity lookup or proposal', () => {
  for (const role of INVALID) {
    const status = nativeStatus(role);
    const expected = observeNativeRoleAndTerm(status);
    const confState = {voters: ['1', '2'], learners: []};
    const lookup = () => assert.fail('malformed role cannot reach leader identity lookup');
    assert.deepEqual(confChangeProposalRefusal({status, confState, change: {changes: []},
      leaderReplicaIdOf: lookup, liveVoters: new Set(['1', '2'])}), expected);
  }
});

test('fenced membership transition preserves malformed role before native mutation', () => {
  for (const role of INVALID) {
    const status = nativeStatus(role);
    const expected = observeNativeRoleAndTerm(status);
    const confState = {voters: ['1', '2'], learners: []};
    const operations = [];
    const result = proposeMembershipTransition({group: {lifecycleIncarnation: 1,
      membershipGenerationKnown: true}, expectedGeneration: 1, runtimeGeneration: 1,
    command: {expectedRuntimeGeneration: 1, replicaLifecycleIncarnation: 1,
      expectedLeaderTerm: String(TERM)},
    invokeCoreAt: (_group, _generation, operation) => {
      operations.push(operation);
      assert.ok(['status', 'conf_state'].includes(operation), 'no mutation reaches native core');
      return {ok: true, value: operation === 'status' ? status : confState};
    }});
    assert.deepEqual(result.result, expected);
    assert.deepEqual(operations, ['status', 'conf_state']);
  }
});


test('retryable core refusals retain matching typed and text retry classification', () => {
  const refusal = confChangeProposalRefusal({status: nativeStatus(0),
    leaderReplicaIdOf: () => 'leader-replica'});
  assert.equal(refusal.retryable, true, 'actual owner produces the transient refusal');
  const answer = buildPartitionWriteLeadershipRefusal(refusal, 'role-partition');
  assert.equal(answer.consensus, refusal);
  assert.equal(isRetryableWriteFailureCode(answer.failureCode), true);
  assert.equal(isRetryableWriteError(answer.error), true);
});


test('inbound local-log guard refuses malformed recorded role before accepting a delivery', () => {
  const group = {lastStatus: nativeStatus(undefined), gateOpen: true, persistedLastIndex: 0n,
    statusObservation: {status: nativeStatus(undefined),
      confState: {voters: ['1', '2'], learners: []}}, inboundStepRefusals: new Map()};
  const envelope = {message: {msgType: RAFT_RS_MESSAGE_TYPE.HEARTBEAT_RESPONSE,
    from: '2', to: '1', term: String(TERM)}};
  assert.deepEqual(refuseInboundStep(group, envelope, 1),
    observeNativeRoleAndTerm(group.lastStatus));
  group.statusObservation.status = nativeStatus(0);
  assert.equal(refuseInboundStep(group, envelope, 1), null, 'valid recorded follower admits reply');
});


test('removed-leader decision and both runtime settlement entries preserve refusal', () => {
  for (const role of INVALID) {
    const status = nativeStatus(role);
    const refusal = observeNativeRoleAndTerm(status);
    const value = {status, confState: {voters: ['2'], learners: []},
      lastIndex: 1n, voterLiveness: {liveVoters: ['2'], transferRunning: false}};
    const forbidden = () => assert.fail('no step or transfer with invalid authority');
    assert.deepEqual(removedLeaderAction('1', value), refusal);
    assert.deepEqual(removedLeaderAtApply({peerId: '1', confState: value.confState,
      observe: () => ({ok: true, value}), stepDown: forbidden}), {ok: false, result: refusal});
    assert.deepEqual(removedLeaderAtDrainEnd({peerId: '1', observed: {ok: true, value},
      stepDown: forbidden, queueTransfer: forbidden}), {ok: false, result: refusal});
  }
});
