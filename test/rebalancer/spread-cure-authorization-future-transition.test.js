// AUDIT-WITNESS-KIND: guard-grid
// This file drives owners over constructed states. It proves GUARD
// behaviour, never that a production producer can reach that state.
// The transition enforcement will rely on, pinned NOW against the landed
// binding owner, together with its falsifiers (quest
// critical-spread-overflow-budget-audit, receipts
// future-honoured-transition-and-its-falsifiers-pinned and
// only-honoured-can-grant).
//
// Nothing here changes the carry stage. Where the landed evaluation does NOT
// refuse one of the owner's falsifiers, this file records the measured
// outcome and the decision matrix carries it as a gate finding; it is not
// repaired here.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  OPERATION_METADATA_KEY,
} from '../../src/rebalancer/replica-operation-progress.js';
import {
  SPREAD_CURE_AUTHORIZATION_BINDING_STATE,
  SPREAD_CURE_AUTHORIZATION_OUTCOME,
  SPREAD_CURE_TRANSITION_INTENT,
  decodeSpreadCureTransitionAuthorizationFromOperationRow,
  evaluateSpreadCureTransitionAuthorization,
} from '../../src/rebalancer/spread-cure-transition-authorization.js';
import {
  MATRIX_JSON,
  readJsonArtifact,
} from './overflow-budget-audit-support.js';

const PARTITION_ID = 'schema_operations-p1';
const OTHER_PARTITION_ID = 'sql_transactions-p1';
const LOCAL_NODE_ID = 'node-3';
const LOCAL_REPLICA_ID = `${PARTITION_ID}-r5`;
const OTHER_REPLICA_ID = `${OTHER_PARTITION_ID}-r5`;
const OPERATION_ID = 'op-future-transition';
const OTHER_OPERATION_ID = 'op-other';
const DESIRED_REPLICATION_FACTOR = 3;
const OBSERVED_VOTER_COUNT = 4;
const AUTHORIZED_RESULTING_VOTER_COUNT = 5;
const PARTITION_EPOCH = 7;
const STALE_EPOCH = 6;
const FUTURE_EPOCH = 9;
const INVALID_PARTITION_EPOCH = -1;
const ZERO_EPOCH = 0;
const OTHER_INTENT = 'ledger_quorum_hold';
const ABOVE_BOUND_VOTER_COUNT = 8;
const BELOW_BOUND_VOTER_COUNT = 4;
const BOUND = AUTHORIZED_RESULTING_VOTER_COUNT;
const SMALL_BOUND = 2;
const SMALL_BOUND_THRESHOLD = 5;

const OUTCOME = SPREAD_CURE_AUTHORIZATION_OUTCOME;
const REASON = Object.freeze({
  HONOURED: 'authorization_honoured',
  STALE: 'authorization_membership_generation_stale',
  FENCE_NOT_EVALUATED: 'authorization_membership_fence_not_evaluated',
  DESTINATION_MISMATCH: 'authorization_destination_mismatch',
  OPERATION_MISMATCH: 'authorization_operation_mismatch',
  DESIRED_RF_MISMATCH: 'authorization_desired_rf_mismatch',
  MALFORMED: 'authorization_malformed',
  ABSENT: 'authorization_absent',
  INTENT_UNKNOWN: 'authorization_intent_unknown',
});

// The authorization exactly as the coordinator stamps it.
function record(overrides = {}) {
  return {
    intent: SPREAD_CURE_TRANSITION_INTENT,
    desiredReplicationFactor: DESIRED_REPLICATION_FACTOR,
    observedMembershipEpoch: PARTITION_EPOCH,
    observedVoterCount: OBSERVED_VOTER_COUNT,
    authorizedResultingVoterCount: AUTHORIZED_RESULTING_VOTER_COUNT,
    destinationNodeId: LOCAL_NODE_ID,
    destinationReplicaId: LOCAL_REPLICA_ID,
    operationId: OPERATION_ID,
    ...overrides,
  };
}

// The whole path a future enforcement would take: the durable row, the one
// decode, and the evaluation with a supplied partition epoch.
function operationRow(authorization) {
  const metadata = {step: 'ADD_REPLICA'};
  if (authorization !== undefined) {
    metadata[OPERATION_METADATA_KEY.CURE_TRANSITION_AUTHORIZATION] =
      authorization;
  }
  return {
    operation_id: OPERATION_ID,
    partition_id: PARTITION_ID,
    steps_history: JSON.stringify([metadata]),
  };
}

function evaluateRow(authorization, context = {}) {
  const binding =
    decodeSpreadCureTransitionAuthorizationFromOperationRow(
      operationRow(authorization));
  return {
    binding,
    evaluation: evaluateSpreadCureTransitionAuthorization({
      binding,
      operationId: context.operationId ?? OPERATION_ID,
      localNodeId: context.localNodeId ?? LOCAL_NODE_ID,
      localReplicaId: context.localReplicaId ?? LOCAL_REPLICA_ID,
      partitionDesiredReplicationFactor:
        context.partitionDesiredReplicationFactor ??
          DESIRED_REPLICATION_FACTOR,
      partitionMembershipEpoch: context.partitionMembershipEpoch,
      votersAfterPromotion:
        context.votersAfterPromotion ?? AUTHORIZED_RESULTING_VOTER_COUNT,
    }),
  };
}

// The owner's transition and its seven falsifiers. `refuses` states whether
// the LANDED evaluation refuses this case today; false rows are the gate
// findings the enforce quest inherits, recorded and not repaired.
const TRANSITION_CASES = Object.freeze([
  {id: 'honoured', authorization: record(),
    context: {partitionMembershipEpoch: PARTITION_EPOCH},
    bindingState: SPREAD_CURE_AUTHORIZATION_BINDING_STATE.PRESENT,
    outcome: OUTCOME.HONOURED, reason: REASON.HONOURED, refuses: false,
    grants: true},
  {id: 'honoured-above-the-authorized-bound', authorization: record(),
    context: {partitionMembershipEpoch: PARTITION_EPOCH,
      votersAfterPromotion: ABOVE_BOUND_VOTER_COUNT},
    bindingState: SPREAD_CURE_AUTHORIZATION_BINDING_STATE.PRESENT,
    outcome: OUTCOME.HONOURED, reason: REASON.HONOURED, refuses: false,
    withinBound: false, grants: false},
  {id: 'honoured-below-the-authorized-bound', authorization: record(),
    context: {partitionMembershipEpoch: PARTITION_EPOCH,
      votersAfterPromotion: BELOW_BOUND_VOTER_COUNT},
    bindingState: SPREAD_CURE_AUTHORIZATION_BINDING_STATE.PRESENT,
    outcome: OUTCOME.HONOURED, reason: REASON.HONOURED, refuses: false,
    withinBound: true, grants: true},
  {id: 'stale-epoch',
    authorization: record({observedMembershipEpoch: STALE_EPOCH}),
    context: {partitionMembershipEpoch: PARTITION_EPOCH},
    bindingState: SPREAD_CURE_AUTHORIZATION_BINDING_STATE.PRESENT,
    outcome: OUTCOME.NOT_HONOURED, reason: REASON.STALE, refuses: true,
    grants: false},
  {id: 'future-epoch',
    authorization: record({observedMembershipEpoch: FUTURE_EPOCH}),
    context: {partitionMembershipEpoch: PARTITION_EPOCH},
    bindingState: SPREAD_CURE_AUTHORIZATION_BINDING_STATE.PRESENT,
    outcome: OUTCOME.HONOURED, reason: REASON.HONOURED, refuses: false,
    grants: true},
  {id: 'wrong-epoch-unreadable-partition-view', authorization: record(),
    context: {partitionMembershipEpoch: INVALID_PARTITION_EPOCH},
    bindingState: SPREAD_CURE_AUTHORIZATION_BINDING_STATE.PRESENT,
    outcome: OUTCOME.MEMBERSHIP_FENCE_NOT_EVALUATED,
    reason: REASON.FENCE_NOT_EVALUATED, refuses: false, grants: false},
  {id: 'missing-epoch', authorization: record(), context: {},
    bindingState: SPREAD_CURE_AUTHORIZATION_BINDING_STATE.PRESENT,
    outcome: OUTCOME.MEMBERSHIP_FENCE_NOT_EVALUATED,
    reason: REASON.FENCE_NOT_EVALUATED, refuses: false, grants: false},
  {id: 'wrong-partition',
    authorization: record({destinationReplicaId: OTHER_REPLICA_ID}),
    context: {partitionMembershipEpoch: PARTITION_EPOCH},
    bindingState: SPREAD_CURE_AUTHORIZATION_BINDING_STATE.PRESENT,
    outcome: OUTCOME.NOT_HONOURED, reason: REASON.DESTINATION_MISMATCH,
    refuses: true, grants: false},
  {id: 'altered-authorized-bound',
    authorization: record({
      authorizedResultingVoterCount: AUTHORIZED_RESULTING_VOTER_COUNT + 1}),
    context: {partitionMembershipEpoch: PARTITION_EPOCH},
    bindingState: SPREAD_CURE_AUTHORIZATION_BINDING_STATE.MALFORMED,
    outcome: OUTCOME.NOT_HONOURED, reason: REASON.MALFORMED, refuses: true,
    grants: false},
  {id: 'wrong-semantic-authority',
    authorization: record({intent: OTHER_INTENT}),
    context: {partitionMembershipEpoch: PARTITION_EPOCH},
    bindingState: SPREAD_CURE_AUTHORIZATION_BINDING_STATE.MALFORMED,
    outcome: OUTCOME.NOT_HONOURED, reason: REASON.MALFORMED, refuses: true,
    grants: false},
]);

// A HAND-BUILT binding: the decode rejects a foreign intent, so
// authorization_intent_unknown is unreachable from a durable row and can only
// be produced by handing the evaluation a binding directly. The case set must
// still contain it, or a grant rule that maps it to grant survives.
function handBuiltBinding(overrides) {
  return Object.freeze({
    state: SPREAD_CURE_AUTHORIZATION_BINDING_STATE.PRESENT,
    raw: null,
    authorization: Object.freeze(record(overrides)),
  });
}

function evaluateBinding(binding, context = {}) {
  return evaluateSpreadCureTransitionAuthorization({
    binding,
    operationId: context.operationId ?? OPERATION_ID,
    localNodeId: LOCAL_NODE_ID,
    localReplicaId: context.localReplicaId ?? LOCAL_REPLICA_ID,
    partitionDesiredReplicationFactor:
      context.partitionDesiredReplicationFactor ?? DESIRED_REPLICATION_FACTOR,
    partitionMembershipEpoch: context.partitionMembershipEpoch,
    votersAfterPromotion:
      context.votersAfterPromotion ?? AUTHORIZED_RESULTING_VOTER_COUNT,
  });
}

// Two further shapes the owner's list does not name, measured because the
// enforce quest's bound depends on them.
const CONSISTENTLY_RAISED = Object.freeze(record({
  observedVoterCount: OBSERVED_VOTER_COUNT + 2,
  authorizedResultingVoterCount: AUTHORIZED_RESULTING_VOTER_COUNT + 2,
}));

test('the future honoured transition and its seven falsifiers are pinned',
  () => {
    const matrix = readJsonArtifact(MATRIX_JSON);
    const recorded = new Map(
      matrix.futureTransition.map((entry) => [entry.id, entry]),
    );
    assert.equal(recorded.size, TRANSITION_CASES.length,
      'the matrix records exactly the pinned transition cases');
    for (const testCase of TRANSITION_CASES) {
      const {binding, evaluation} =
        evaluateRow(testCase.authorization, testCase.context);
      assert.equal(binding.state, testCase.bindingState,
        `binding state on: ${testCase.id}`);
      assert.equal(evaluation.outcome, testCase.outcome,
        `outcome on: ${testCase.id}`);
      assert.equal(evaluation.reason, testCase.reason,
        `reason on: ${testCase.id}`);
      // The landed field, which is decided WITHOUT the authorized bound.
      assert.equal(evaluation.honoured, testCase.reason === REASON.HONOURED,
        `the honoured field on: ${testCase.id}`);
      // ...and the separate bound field the grant rule must AND with it.
      if (Object.hasOwn(testCase, 'withinBound')) {
        assert.equal(evaluation.wouldBeWithinAuthorizedBound,
          testCase.withinBound, `the bound field on: ${testCase.id}`);
      }
      const entry = recorded.get(testCase.id);
      assert.ok(entry, `the matrix carries the case: ${testCase.id}`);
      assert.equal(entry.outcome, testCase.outcome,
        `matrix outcome on: ${testCase.id}`);
      assert.equal(entry.reason, testCase.reason,
        `matrix reason on: ${testCase.id}`);
      assert.equal(entry.landedEvaluationRefuses, testCase.refuses,
        `matrix refusal finding on: ${testCase.id}`);
    }
    // A supplied epoch of 0 is a BOUND epoch, so every record's observed
    // epoch is at or above it and the fence can refuse nothing.
    assert.equal(
      evaluateRow(record({observedMembershipEpoch: ZERO_EPOCH}),
        {partitionMembershipEpoch: ZERO_EPOCH}).evaluation.reason,
      REASON.HONOURED, 'a zero partition epoch honours a zero-epoch record');
    assert.equal(
      evaluateRow(record({observedMembershipEpoch: FUTURE_EPOCH}),
        {partitionMembershipEpoch: ZERO_EPOCH}).evaluation.reason,
      REASON.HONOURED, 'a zero partition epoch honours any record');
    // The bound is self-consistent arithmetic: raising BOTH counts keeps the
    // record well formed, and nothing the receiver reads contradicts it.
    const raised = evaluateRow(CONSISTENTLY_RAISED,
      {partitionMembershipEpoch: PARTITION_EPOCH,
        votersAfterPromotion: AUTHORIZED_RESULTING_VOTER_COUNT + 2});
    assert.equal(raised.binding.state,
      SPREAD_CURE_AUTHORIZATION_BINDING_STATE.PRESENT,
      'a consistently raised observed/authorized pair decodes present');
    assert.equal(raised.evaluation.reason, REASON.HONOURED,
      'a consistently raised bound is honoured at its own higher bound');
    // An operation id that is not this row's is the one identity mismatch
    // the receiver can still see.
    assert.equal(
      evaluateRow(record(), {partitionMembershipEpoch: PARTITION_EPOCH,
        operationId: OTHER_OPERATION_ID}).evaluation.reason,
      REASON.OPERATION_MISMATCH, 'a foreign operation id is refused');
    assert.equal(
      evaluateRow(record(), {partitionMembershipEpoch: PARTITION_EPOCH,
        partitionDesiredReplicationFactor: DESIRED_REPLICATION_FACTOR + 1})
        .evaluation.reason,
      REASON.DESIRED_RF_MISMATCH, 'a foreign replication factor is refused');
    assert.equal(evaluateRow(undefined,
      {partitionMembershipEpoch: PARTITION_EPOCH}).evaluation.reason,
    REASON.ABSENT, 'a row with no record is absent, never coerced');
  });

// Candidate grant rules an enforce quest could write.
//
// The OWNER'S TARGET (decision 1 of 2026-09-19 night) is that
// `evaluation.outcome === honoured` alone grants, with the bound folded
// INSIDE the canonical evaluation predicate. The landed evaluation does not
// do that yet - it decides `honoured` without the bound and reports
// `wouldBeWithinAuthorizedBound` separately, and its own source says a
// consumer must AND them (src/rebalancer/
// spread-cure-transition-authorization.js:422-428).
//
// So the rule pinned here is the INTERIM one: the conjunction. It is what a
// consumer of TODAY'S carrier must use to be safe. The gate document records
// what the inherited test must become once the evaluation is repaired, and
// this quest changes no carrier.
const INTERIM_GRANT_RULE = Object.freeze({
  id: 'interim: outcome honoured AND within the authorized bound',
  grants: (evaluation) => evaluation.outcome === OUTCOME.HONOURED &&
    evaluation.wouldBeWithinAuthorizedBound === true,
});
// Each mutant sees the evaluation AND the promotion count the guard computed,
// because a rule that reconstructs the bound arithmetic itself is exactly the
// kind an enforce quest might write.
const MUTANT_GRANT_RULES = Object.freeze([
  {id: 'V1 off-by-one bound (honoured and voters <= authorized + 1)',
    grants: (evaluation, context) => evaluation.outcome === OUTCOME.HONOURED &&
      Number.isSafeInteger(context.votersAfterPromotion) &&
      context.votersAfterPromotion <=
        evaluation.authorizedResultingVoterCount + 1},
  {id: 'V2 unreadable promotion count treated as within (within !== false)',
    grants: (evaluation) => evaluation.outcome === OUTCOME.HONOURED &&
      evaluation.wouldBeWithinAuthorizedBound !== false},
  {id: 'V3 honoured field, bound only checked when the bound is at least five',
    grants: (evaluation) => evaluation.honoured === true &&
      (evaluation.authorizedResultingVoterCount < SMALL_BOUND_THRESHOLD ||
        evaluation.wouldBeWithinAuthorizedBound === true)},
  {id: 'honoured-alone-grants-above-bound',
    grants: (evaluation) => evaluation.outcome === OUTCOME.HONOURED},
  {id: 'honoured-field-alone-grants',
    grants: (evaluation) => evaluation.honoured === true},
  {id: 'within-bound-alone-grants',
    grants: (evaluation) => evaluation.wouldBeWithinAuthorizedBound === true},
  {id: 'fence-not-evaluated-also-grants',
    grants: (evaluation) => INTERIM_GRANT_RULE.grants(evaluation) ||
      evaluation.outcome === OUTCOME.MEMBERSHIP_FENCE_NOT_EVALUATED},
  {id: 'not-refused-grants',
    grants: (evaluation) => evaluation.outcome !== OUTCOME.NOT_HONOURED},
  {id: 'a-bound-was-stated-grants',
    grants: (evaluation) =>
      evaluation.authorizedResultingVoterCount !== null},
  {id: 'present-and-not-absent-grants',
    grants: (evaluation) => evaluation.reason !== REASON.ABSENT},
  {id: 'not-malformed-grants',
    grants: (evaluation) => evaluation.reason !== REASON.MALFORMED},
  {id: 'stale-is-tolerated',
    grants: (evaluation) => INTERIM_GRANT_RULE.grants(evaluation) ||
      evaluation.reason === REASON.STALE},
  {id: 'membership-reason-also-grants',
    grants: (evaluation) => INTERIM_GRANT_RULE.grants(evaluation) ||
      evaluation.reason === REASON.STALE ||
      evaluation.reason === REASON.FENCE_NOT_EVALUATED},
  {id: 'operation-mismatch-grants',
    grants: (evaluation) => INTERIM_GRANT_RULE.grants(evaluation) ||
      evaluation.reason === REASON.OPERATION_MISMATCH},
  {id: 'rf-mismatch-grants',
    grants: (evaluation) => INTERIM_GRANT_RULE.grants(evaluation) ||
      evaluation.reason === REASON.DESIRED_RF_MISMATCH},
  {id: 'destination-mismatch-grants',
    grants: (evaluation) => INTERIM_GRANT_RULE.grants(evaluation) ||
      evaluation.reason === REASON.DESTINATION_MISMATCH},
  {id: 'intent-unknown-grants',
    grants: (evaluation) => INTERIM_GRANT_RULE.grants(evaluation) ||
      evaluation.reason === REASON.INTENT_UNKNOWN},
]);

// Cases beyond the owner's named falsifiers. Every reason the owner defines
// must appear, and the bound must be exercised at the bound, one above it,
// below five, and with a promotion count the guard could not read.
const EXTRA_CASES = Object.freeze([
  {id: 'absent', grants: false, votersAfterPromotion: BOUND,
    evaluation: () => evaluateRow(undefined,
      {partitionMembershipEpoch: PARTITION_EPOCH}).evaluation},
  {id: 'operation-mismatch', grants: false, votersAfterPromotion: BOUND,
    evaluation: () => evaluateRow(record(),
      {partitionMembershipEpoch: PARTITION_EPOCH,
        operationId: OTHER_OPERATION_ID}).evaluation},
  {id: 'desired-rf-mismatch', grants: false, votersAfterPromotion: BOUND,
    evaluation: () => evaluateRow(record(),
      {partitionMembershipEpoch: PARTITION_EPOCH,
        partitionDesiredReplicationFactor: DESIRED_REPLICATION_FACTOR + 1})
      .evaluation},
  {id: 'intent-unknown-hand-built-binding', grants: false,
    votersAfterPromotion: BOUND,
    evaluation: () => evaluateBinding(handBuiltBinding({intent: OTHER_INTENT}),
      {partitionMembershipEpoch: PARTITION_EPOCH})},
  {id: 'bound-exceeded-by-exactly-one', grants: false,
    votersAfterPromotion: BOUND + 1,
    evaluation: () => evaluateRow(record(),
      {partitionMembershipEpoch: PARTITION_EPOCH,
        votersAfterPromotion: BOUND + 1}).evaluation},
  {id: 'unreadable-promotion-count', grants: false,
    votersAfterPromotion: Number.NaN,
    evaluation: () => evaluateRow(record(),
      {partitionMembershipEpoch: PARTITION_EPOCH,
        votersAfterPromotion: Number.NaN}).evaluation},
  {id: 'small-bound-exactly-reached', grants: true,
    votersAfterPromotion: SMALL_BOUND,
    evaluation: () => evaluateRow(
      record({observedVoterCount: SMALL_BOUND - 1,
        authorizedResultingVoterCount: SMALL_BOUND}),
      {partitionMembershipEpoch: PARTITION_EPOCH,
        votersAfterPromotion: SMALL_BOUND}).evaluation},
  {id: 'missing-authorized-bound', grants: false, votersAfterPromotion: BOUND,
    evaluation: () => evaluateRow(
      record({authorizedResultingVoterCount: undefined}),
      {partitionMembershipEpoch: PARTITION_EPOCH}).evaluation},
  {id: 'zero-authorized-bound', grants: false, votersAfterPromotion: 0,
    evaluation: () => evaluateRow(
      record({observedVoterCount: 0, authorizedResultingVoterCount: 0}),
      {partitionMembershipEpoch: PARTITION_EPOCH,
        votersAfterPromotion: 0}).evaluation},
  {id: 'small-bound-exceeded', grants: false,
    votersAfterPromotion: SMALL_BOUND + 1,
    evaluation: () => evaluateRow(
      record({observedVoterCount: SMALL_BOUND - 1,
        authorizedResultingVoterCount: SMALL_BOUND}),
      {partitionMembershipEpoch: PARTITION_EPOCH,
        votersAfterPromotion: SMALL_BOUND + 1}).evaluation},
]);

test('a grant rule that maps any outcome but honoured to grant is caught',
  () => {
    const matrix = readJsonArtifact(MATRIX_JSON);
    const evaluations = TRANSITION_CASES.map((testCase) => ({
      id: testCase.id,
      grants: testCase.grants,
      votersAfterPromotion:
        testCase.context.votersAfterPromotion ?? BOUND,
      evaluation: evaluateRow(testCase.authorization, testCase.context)
        .evaluation,
    }));
    for (const extra of EXTRA_CASES) {
      evaluations.push({id: extra.id, grants: extra.grants,
        votersAfterPromotion: extra.votersAfterPromotion,
        evaluation: extra.evaluation()});
    }
    // Every reason the owner defines is in the case set, or a rule that maps
    // that reason to grant survives untested.
    const reasons = new Set(evaluations.map((entry) => entry.evaluation.reason));
    for (const reason of Object.values(REASON)) {
      assert.ok(reasons.has(reason),
        `the case set contains the reason: ${reason}`);
    }
    // The bound is exercised at it, one above it, below five, and with a
    // promotion count the guard could not read.
    const unreadable = evaluations.find((entry) =>
      entry.id === 'unreadable-promotion-count').evaluation;
    assert.equal(unreadable.outcome, OUTCOME.HONOURED,
      'an unreadable promotion count still reads outcome honoured');
    assert.equal(unreadable.wouldBeWithinAuthorizedBound, null,
      'and the bound field is null, not false');
    assert.equal(INTERIM_GRANT_RULE.grants(unreadable), false,
      'so only a rule requiring within === true refuses it');
    const smallBound = evaluations.find((entry) =>
      entry.id === 'small-bound-exceeded').evaluation;
    assert.ok(smallBound.authorizedResultingVoterCount <
      SMALL_BOUND_THRESHOLD,
    'the case set contains a bound below five');
    // The interim rule grants exactly the cases whose complete result is
    // honoured AND within the authorized bound.
    for (const {id, grants, evaluation} of evaluations) {
      assert.equal(INTERIM_GRANT_RULE.grants(evaluation), grants,
        `the interim conjunction rule decides: ${id}`);
    }
    for (const mutant of MUTANT_GRANT_RULES) {
      const killers = evaluations.filter((entry) =>
        mutant.grants(entry.evaluation, entry) !==
          INTERIM_GRANT_RULE.grants(entry.evaluation));
      assert.ok(killers.length > 0,
        `the mutant grant rule survives every case: ${mutant.id}`);
    }
    // The gate records the owner's TARGET rule and what the inherited test
    // must become; this quest pins the interim one and changes no carrier.
    const target = matrix.grantRuleTarget;
    assert.equal(target.targetRule, 'evaluation.outcome === honoured');
    assert.equal(target.interimRule, INTERIM_GRANT_RULE.id);
    assert.ok(target.notHonouredCases.length >= 9,
      'the target states every case that must NOT be honoured');
    for (const required of ['bound exceeded by exactly one',
      'malformed bound', 'absent bound', 'missing bound field', 'zero bound',
      'a very small bound, exceeded', 'unreadable promotion count',
      'wrong partition', 'wrong semantic authority', 'future epoch',
      'invalid supplied epoch', 'zero supplied epoch']) {
      assert.ok(target.notHonouredCases.some((entry) =>
        entry.includes(required)),
      `the target names the case: ${required}`);
    }
    assert.equal(target.honouredCase, 'the bound exactly reached');
    assert.equal(target.carrierChangedByThisQuest, false);
    // The owner's rule 6: the requirement this pin INHERITS is recorded
    // verbatim, and today's honoured is never described as complete.
    assert.equal(target.inheritedRequirement,
      'after that quest, the only consumer rule is `outcome === honoured`; ' +
      'every bound and identity failure produces a non-honoured outcome');
    assert.equal(target.interimPin, 'honoured && wouldBeWithinAuthorizedBound');
    assert.ok(target.interimPinScope.includes('This audit only'));
    assert.ok(target.todaysHonouredIsNotComplete.includes('WITHOUT'));
  });
