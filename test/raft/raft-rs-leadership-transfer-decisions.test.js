// Characterization of the leadership transfer's pure decisions
// (src/raft/raft-rs-leadership-transfer.js): every refusal and command shape
// normalizedTransferRequest produces, and every answer decideLeadershipTransfer
// gives for the three successor kinds, so a restructuring of either function is
// proven to keep each answer.
import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  RAFT_LEADERSHIP_TRANSFER_SUCCESSOR as SUCCESSOR,
  RAFT_OPERATION_OUTCOME,
} from '../../src/raft/raft-operation-port-constants.js';
import {
  decideLeadershipTransfer,
  normalizedTransferRequest,
} from '../../src/raft/raft-rs-leadership-transfer.js';
import {
  RUNTIME_PHASE,
  RUNTIME_REASON,
} from '../../src/raft/raft-rs-runtime-owner-constants.js';

const LEADER_STATE = 2;
const FOLLOWER_STATE = 0;
const CANDIDATE_STATE = 1;
const SELF = '1';
const TARGET = '3';
const OTHER = '2';
const RESERVED = Object.freeze({'replica-target': 3, 'replica-other': 2});
const registry = Object.freeze({
  raftPeerIdOf: (identity) => RESERVED[identity] ?? null,
});
const admitExecution = () => true;

function refusal(reason, retryable = false) {
  return {
    outcome: RAFT_OPERATION_OUTCOME.CORE_REFUSED,
    reason,
    phase: RUNTIME_PHASE.LEADERSHIP_TRANSFER,
    retryable,
    recoveryRequired: false,
  };
}

function accepted(reason) {
  return {outcome: RAFT_OPERATION_OUTCOME.CORE_OK, reason};
}

function sourceRequest(overrides = {}) {
  return {
    successor: SUCCESSOR.SOURCE_NAMED,
    replicaIdentity: 'replica-target',
    term: 7,
    configurationKey: 'conf-a',
    membershipGenerationIndex: 4,
    lifecycleIncarnation: 'life-1',
    runtimeGeneration: 2,
    ...overrides,
  };
}

test('normalizedTransferRequest: canonical commands and every refusal', () => {
  const mostCaughtUp = normalizedTransferRequest(
    {successor: SUCCESSOR.MOST_CAUGHT_UP}, registry, undefined);
  assert.deepEqual(mostCaughtUp, {command: {successor: SUCCESSOR.MOST_CAUGHT_UP}});
  assert.equal(Object.isFrozen(mostCaughtUp.command), true);

  for (const request of [undefined, null, {}, {successor: 'sideways'}]) {
    assert.deepEqual(normalizedTransferRequest(request, registry),
      {refusal: refusal(RUNTIME_REASON.UNKNOWN_SUCCESSOR)});
  }
  for (const successor of [SUCCESSOR.NAMED, SUCCESSOR.SOURCE_NAMED]) {
    for (const replicaIdentity of [undefined, '', 5]) {
      assert.deepEqual(normalizedTransferRequest({successor, replicaIdentity}, registry,
        admitExecution), {refusal: refusal(RUNTIME_REASON.WITHOUT_REPLICA_IDENTITY)});
    }
    assert.deepEqual(normalizedTransferRequest({successor, replicaIdentity: 'unknown'},
      registry, admitExecution), {refusal: refusal(RUNTIME_REASON.TARGET_UNRESERVED)});
  }

  const named = normalizedTransferRequest(
    {successor: SUCCESSOR.NAMED, replicaIdentity: 'replica-target', term: 'ignored'},
    registry, admitExecution);
  assert.deepEqual(named, {command: {successor: SUCCESSOR.NAMED, target: TARGET}});
  assert.equal(Object.isFrozen(named.command), true);
});

test('normalizedTransferRequest: a source-named request carries its whole binding', () => {
  const normalized = normalizedTransferRequest(sourceRequest(), registry, admitExecution);
  assert.deepEqual(Object.keys(normalized), ['command']);
  assert.equal(Object.isFrozen(normalized.command), true);
  assert.equal(normalized.command.admitExecution, admitExecution);
  assert.deepEqual({...normalized.command, admitExecution: null}, {
    successor: SUCCESSOR.SOURCE_NAMED, target: TARGET, term: 7, configurationKey: 'conf-a',
    membershipGenerationIndex: 4, lifecycleIncarnation: 'life-1', runtimeGeneration: 2,
    admitExecution: null,
  });
  const zeroIndices = normalizedTransferRequest(
    sourceRequest({membershipGenerationIndex: 0, runtimeGeneration: 0}), registry,
    admitExecution);
  assert.equal(zeroIndices.command.membershipGenerationIndex, 0);

  const invalid = [
    {term: 0}, {term: -1}, {term: 1.5}, {term: Number.NaN}, {term: '7'},
    {membershipGenerationIndex: -1}, {membershipGenerationIndex: '4'},
    {runtimeGeneration: -1}, {runtimeGeneration: 2.5},
    {lifecycleIncarnation: ''}, {lifecycleIncarnation: 5},
    {configurationKey: ''}, {configurationKey: 5},
  ];
  for (const overrides of invalid) {
    assert.deepEqual(normalizedTransferRequest(sourceRequest(overrides), registry,
      admitExecution), {refusal: refusal(RUNTIME_REASON.SOURCE_CHANGED)},
    JSON.stringify(overrides));
  }
  for (const missingPredicate of [undefined, true, {}]) {
    assert.deepEqual(normalizedTransferRequest(sourceRequest(), registry, missingPredicate),
      {refusal: refusal(RUNTIME_REASON.SOURCE_CHANGED)});
  }
});

function leaderObservation(overrides = {}) {
  const {status = {}, confState = {}, ...fields} = overrides;
  return {
    status: {raftState: LEADER_STATE, lead: SELF, term: 7, pendingConfIndex: 3,
      applied: 5, progress: [], ...status},
    confState: {voters: [SELF, OTHER, TARGET], votersOutgoing: [], learners: [],
      learnersNext: [], ...confState},
    configurationKey: 'conf-a',
    membershipGenerationIndex: 4,
    lifecycleIncarnation: 'life-1',
    runtimeGeneration: 2,
    participation: {gateOpen: true},
    ...fields,
  };
}

function sourceCommand(overrides = {}) {
  return normalizedTransferRequest(sourceRequest(overrides), registry, admitExecution).command;
}

test('decideLeadershipTransfer: a source-named transfer is decided from the captured source', () => {
  assert.deepEqual(decideLeadershipTransfer(SELF, leaderObservation(), sourceCommand()), {
    transferee: TARGET, accepted: accepted(RUNTIME_REASON.TRANSFER_REQUESTED)});
  assert.deepEqual(decideLeadershipTransfer(SELF,
    leaderObservation({status: {pendingConfIndex: undefined}}), sourceCommand()), {
    transferee: TARGET, accepted: accepted(RUNTIME_REASON.TRANSFER_REQUESTED)});

  const sourceChanged = {answer: refusal(RUNTIME_REASON.SOURCE_CHANGED, true)};
  const stale = [
    leaderObservation({status: {raftState: FOLLOWER_STATE}}),
    leaderObservation({status: {lead: OTHER}}),
    leaderObservation({status: {term: 8}}),
    leaderObservation({configurationKey: 'conf-b'}),
    leaderObservation({membershipGenerationIndex: 5}),
    leaderObservation({lifecycleIncarnation: 'life-2'}),
    leaderObservation({runtimeGeneration: 3}),
    leaderObservation({status: {pendingConfIndex: 6}}),
    leaderObservation({confState: {votersOutgoing: [OTHER]}}),
    leaderObservation({participation: {gateOpen: false}}),
  ];
  for (const observation of stale) {
    assert.deepEqual(decideLeadershipTransfer(SELF, observation, sourceCommand()),
      sourceChanged, JSON.stringify(observation));
  }
  const toSelf = {...sourceCommand(), target: SELF};
  assert.deepEqual(decideLeadershipTransfer(SELF, leaderObservation(), toSelf), sourceChanged);

  const notVoter = {answer: refusal(RUNTIME_REASON.TARGET_NOT_VOTER)};
  assert.deepEqual(decideLeadershipTransfer(SELF,
    leaderObservation({confState: {voters: [SELF, OTHER]}}), sourceCommand()), notVoter);
  assert.deepEqual(decideLeadershipTransfer(SELF,
    leaderObservation({confState: {learnersNext: [TARGET]}}), sourceCommand()), notVoter);
  assert.deepEqual(decideLeadershipTransfer(SELF,
    leaderObservation({confState: {learners: [TARGET]}}), sourceCommand()), notVoter);
});

test('decideLeadershipTransfer: a named transfer by role and leader', () => {
  const command = normalizedTransferRequest(
    {successor: SUCCESSOR.NAMED, replicaIdentity: 'replica-target'}, registry).command;
  const decide = (observation) => decideLeadershipTransfer(SELF, observation, command);
  assert.deepEqual(decide(leaderObservation({status: {lead: TARGET, raftState: FOLLOWER_STATE}})),
    {answer: accepted(RUNTIME_REASON.ALREADY_LEADER)});
  assert.deepEqual(decide(leaderObservation({confState: {voters: [SELF, OTHER]}})),
    {answer: refusal(RUNTIME_REASON.TARGET_NOT_VOTER)});
  assert.deepEqual(decide(leaderObservation()),
    {transferee: TARGET, accepted: accepted(RUNTIME_REASON.TRANSFER_REQUESTED)});
  assert.deepEqual(decide(leaderObservation({status: {raftState: FOLLOWER_STATE, lead: OTHER}})),
    {transferee: TARGET, accepted: accepted(RUNTIME_REASON.TRANSFER_FORWARDED)});
  assert.deepEqual(decide(leaderObservation({status: {raftState: FOLLOWER_STATE, lead: '0'}})),
    {answer: refusal(RUNTIME_REASON.NO_KNOWN_LEADER, true)});
  assert.deepEqual(decide(leaderObservation({status: {raftState: CANDIDATE_STATE, lead: OTHER}})),
    {answer: refusal(RUNTIME_REASON.NO_KNOWN_LEADER, true)});
});

test('decideLeadershipTransfer: the most caught-up successor by matched index, then raft id', () => {
  const command = normalizedTransferRequest({successor: SUCCESSOR.MOST_CAUGHT_UP}, registry)
    .command;
  const decide = (observation) => decideLeadershipTransfer(SELF, observation, command);
  assert.deepEqual(decide(leaderObservation({status: {raftState: FOLLOWER_STATE}})),
    {answer: refusal(RUNTIME_REASON.NOT_LEADER)});
  assert.deepEqual(decide(leaderObservation({status: {progress: [{id: SELF, matched: '9'}]}})),
    {answer: refusal(RUNTIME_REASON.NO_ELIGIBLE_SUCCESSOR)});
  assert.deepEqual(decide(leaderObservation({status: {progress: [
    {id: SELF, matched: '9'}, {id: OTHER, matched: '4'}, {id: TARGET, matched: '5'}]}})),
  {transferee: TARGET, accepted: accepted(RUNTIME_REASON.TRANSFER_REQUESTED)});
  assert.deepEqual(decide(leaderObservation({status: {progress: [
    {id: TARGET, matched: '5'}, {id: OTHER, matched: '5'}]}})),
  {transferee: OTHER, accepted: accepted(RUNTIME_REASON.TRANSFER_REQUESTED)});
});
