// The carrier's learner-side witnesses (quest
// critical-spread-transition-authority-carry), registered against the host
// built by learner-promotion-count-check-inputs.test.js.
//
// They live beside that host rather than inside it for one reason: the host
// file is close to the test file-size threshold and this quest's witnesses,
// together with a sibling quest's, would push it over. Everything they drive
// - the fixtures, the frozen oracle, the read counters - is the host's.
//
// SCOPE. The guard decodes ONE spread-cure transition authorization off the
// in-flight add-like operation row it has already read, states it on the
// refusal line and the first-pass line, and decides exactly as main does for
// every value that row can carry.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';

import {SERVICE_TYPE} from '../../src/constants/index.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {
  OPERATION_METADATA_KEY,
} from '../../src/rebalancer/replica-operation-progress.js';
import {
  SPREAD_CURE_PARTITION_EPOCH_NOT_READ,
  SPREAD_CURE_TRANSITION_INTENT,
} from '../../src/rebalancer/spread-cure-transition-authorization.js';
import {
  evaluateLearnerPromotionCountCheck,
} from '../../src/partition/learner-promotion-count-check.js';
import {
  LIFECYCLE_PHASE,
} from '../../src/bootstrap/lifecycle-controller-constants.js';
import {TERMINAL_STATUSES} from '../../src/rebalancer/replica-status.js';

const AUTHORIZATION_KEY = OPERATION_METADATA_KEY.CURE_TRANSITION_AUTHORIZATION;
const PARTITION_PUBLICATION_EPOCH = 4;
const PUBLICATION_ROWS = Object.freeze([Object.freeze({
  status: 'PUBLISHED',
  publication_epoch: PARTITION_PUBLICATION_EPOCH,
})]);
const PUBLICATION_READ = 'filter:control_plane_publications';
const PUBLICATION_GET_ALL = 'getAll:control_plane_publications';
const CONFIG_READ = 'get:config';
// Design section 4's fixed key set, plus the partition's own epoch and the
// bound the lab measures the enforcing successor's effect with.
const AUTHORIZATION_PAYLOAD_KEYS = Object.freeze([
  'authorizedResultingVoterCount',
  'desiredReplicationFactor',
  'destinationNodeId',
  'destinationReplicaId',
  'honoured',
  'intent',
  'malformedValue',
  'observedMembershipEpoch',
  'observedVoterCount',
  'operationId',
  'outcome',
  'partitionMembershipEpoch',
  'present',
  'reason',
  'state',
  'wouldBeWithinAuthorizedBound',
]);
const ABSENT_PAYLOAD_KEYS = Object.freeze([
  'intent', 'desiredReplicationFactor', 'observedMembershipEpoch',
  'observedVoterCount', 'authorizedResultingVoterCount', 'destinationNodeId',
  'destinationReplicaId', 'operationId', 'malformedValue',
  'wouldBeWithinAuthorizedBound',
]);
const BINDING_PRESENT = 'present';
const BINDING_ABSENT = 'absent';
const BINDING_MALFORMED = 'malformed';
const AUTHORIZATION_ABSENT = 'authorization_absent';
const AUTHORIZATION_MALFORMED = 'authorization_malformed';
const AUTHORIZATION_FENCE_NOT_EVALUATED =
  'authorization_membership_fence_not_evaluated';
const AUTHORIZATION_DESTINATION_MISMATCH = 'authorization_destination_mismatch';
const AUTHORIZATION_OPERATION_MISMATCH = 'authorization_operation_mismatch';
const OUTCOME_NOT_HONOURED = 'not_honoured';
const OUTCOME_FENCE_NOT_EVALUATED = 'membership_fence_not_evaluated';
const HUGE_VALUE_LENGTH = 50000;
const BOUNDED_PAYLOAD_BUDGET_BYTES = 512;
const DECLARED_REPLICATION_FACTOR = 3;
const LEADER_ROLE = 'leader';
const FOLLOWER_ROLE = 'follower';
const LEARNER_ROLE = 'learner';
// Main's verbatim decisions over the whole 3456-row arithmetic grid, and its
// decision projection over the guard grid (every logged field EXCEPT the
// countCheckInputs.authorization key this quest adds). Both were captured by
// running main's own copies at f2fed102a, before this quest edited any src
// file.
const MAIN_ARITHMETIC_GRID_DIGEST =
  'b827943230027e1620d13224998b3982d34fb7a5f0da36b70eb12f2ac24e6a83';
const MAIN_GUARD_GRID_DECISION_DIGEST =
  '022d8537f70187cd3f9060fe2f6a4d05f72c264158fb78c3c419b950b3c840c4';
const DECISION_INPUT_KEYS = Object.freeze([
  'criticalSystemPartition', 'joining', 'allowances',
  'maxAllowedVotersAfterPromotion', 'membership', 'inFlightAddLike',
  'priorityRecovery',
]);
const RECORDED_GUARD_SHAPES = JSON.parse(readFileSync(new URL(
  './fixtures/critical-spread-transition-authority/recorded-guard-shapes.json',
  import.meta.url), 'utf8'));

function authorizationRecord(host, overrides = {}) {
  return {
    intent: SPREAD_CURE_TRANSITION_INTENT,
    desiredReplicationFactor: DECLARED_REPLICATION_FACTOR,
    observedMembershipEpoch: PARTITION_PUBLICATION_EPOCH,
    observedVoterCount: 4,
    authorizedResultingVoterCount: 5,
    destinationNodeId: host.LEARNER_NODE_ID,
    destinationReplicaId: host.LEARNER_REPLICA_ID,
    operationId: host.SPREAD_CURE_OPERATION_ID,
    ...overrides,
  };
}

function stepsHistoryWith(value) {
  return [{step: 'PENDING', timestamp: 0, [AUTHORIZATION_KEY]: value}];
}

// The fixture overrides that put ONE authorization value on the guard's own
// in-flight add-like row, and give the partition a published epoch to judge
// it against. `undefined` leaves the host's row exactly as it built it.
function carriedOverrides(host, value) {
  return value === undefined ? {} : {
    operationRows: [host.spreadCureOperationRow(stepsHistoryWith(value))],
    publicationRows: PUBLICATION_ROWS,
  };
}

function authorizationOf(host, logLines, message) {
  return host.linesFor(logLines, message)[0]
    .fields.countCheckInputs.authorization;
}

function projectLine(line) {
  const fields = line.fields;
  if (!fields) return {level: line.level, message: line.message, fields: null};
  const projected = {};
  for (const [key, value] of Object.entries(fields)) {
    if (key !== 'countCheckInputs') projected[key] = value;
  }
  if (fields.countCheckInputs) {
    const projectedInputs = {};
    for (const key of DECISION_INPUT_KEYS) {
      projectedInputs[key] = fields.countCheckInputs[key] ?? null;
    }
    projected.countCheckInputs = projectedInputs;
  }
  return {level: line.level, message: line.message, fields: projected};
}

async function projectGuardGrid(host, value) {
  const projected = [];
  for (const row of host.GUARD_GRID) {
    const {context, logLines} = row.fixture(
      row.authorizable === true ? carriedOverrides(host, value) : {});
    await context.runLearnerPromotionCheck();
    projected.push(JSON.stringify([row.name, logLines.map(projectLine)]));
  }
  return projected;
}

function recordedServiceRow(shape, replicaId, nodeId, raftRole) {
  return {
    service_id: replicaId,
    replica_id: replicaId,
    partition_id: shape.partitionId,
    service_type: SERVICE_TYPE.PARTITION,
    status: ReplicaStatus.ACTIVE,
    raft_role: raftRole,
    node_id: nodeId,
  };
}

// One recorded live reading, replayed as a guard host: the recorded voter and
// learner rows, the recorded in-flight operation, and the summary reading each
// record states (the refusal read its spread satisfied; the passing reading
// read an open gap 58 s later).
function recordedReadingFixture(host, reading, authorizationValue) {
  const shape = RECORDED_GUARD_SHAPES[reading];
  const operation = shape.operations[0];
  return host.createGuardContext({
    partitionId: shape.partitionId,
    replicaId: shape.replicaId,
    nodeId: shape.nodeId,
    isJoiningExistingGroup: shape.joining,
    partitionRow: {
      partition_id: shape.partitionId,
      replica_count: shape.membership.targetReplicaCount,
    },
    serviceRows: [
      ...shape.membership.voterReplicas.map((replica, index) =>
        recordedServiceRow(shape, replica.replicaId, replica.nodeId,
          index === 0 ? LEADER_ROLE : FOLLOWER_ROLE)),
      ...shape.membership.learnerReplicaIds.map((replicaId) =>
        recordedServiceRow(shape, replicaId, shape.nodeId, LEARNER_ROLE)),
    ],
    operationRows: [{
      operation_id: operation.operationId,
      id: operation.operationId,
      partition_id: shape.partitionId,
      type: operation.type,
      status: operation.status,
      workflow_step: operation.workflowStep,
      replica_id: shape.replicaId,
      target_node_id: shape.nodeId,
      steps_history: JSON.stringify(stepsHistoryWith(authorizationValue)),
    }],
    publicationRows: PUBLICATION_ROWS,
    planningAnswer: host.planningAnswer(reading === 'refusal' ?
      host.satisfiedSummary() :
      host.spreadGapSummary(shape.partitionId)),
    readinessPhase: LIFECYCLE_PHASE.TRAFFIC_READY,
    readinessReasons: [],
  });
}

async function assertRecordedReading(host, reading) {
  const shape = RECORDED_GUARD_SHAPES[reading];
  const recorded = recordedReadingFixture(host, reading,
    authorizationRecord(host, {
      destinationNodeId: shape.nodeId,
      destinationReplicaId: shape.replicaId,
      operationId: shape.operations[0].operationId,
    }));
  await recorded.context.runLearnerPromotionCheck();
  const message = reading === 'refusal' ?
    host.REFUSAL_MESSAGE :
    host.INPUTS_MESSAGE;
  const fields = host.linesFor(recorded.logLines, message)[0].fields;
  const inputs = fields.countCheckInputs;
  assert.equal(inputs.membership.activeVoterCount,
    shape.membership.activeVoterCount, `${reading}: recorded voter count`);
  assert.equal(inputs.membership.learnerCount,
    shape.membership.learnerCount, `${reading}: recorded learner count`);
  assert.equal(inputs.membership.observedLearnerCount,
    shape.membership.observedLearnerCount,
    `${reading}: recorded raw learner count`);
  assert.equal(inputs.maxAllowedVotersAfterPromotion,
    shape.decision.maxAllowedVotersAfterPromotion,
    `${reading}: the recorded cap is unchanged`);
  assert.deepEqual({...inputs.allowances}, shape.decision.allowances,
    `${reading}: the recorded allowances are unchanged`);
  assert.equal(fields.reason ?? null, shape.decision.reason,
    `${reading}: the recorded outcome is unchanged`);
  assert.equal(
    inputs.priorityRecovery.completion.temporaryOverflowVoterBudget,
    shape.decision.temporaryOverflowVoterBudget,
    `${reading}: the recorded overflow budget is unchanged`);
  assert.equal(inputs.authorization.outcome, OUTCOME_FENCE_NOT_EVALUATED,
    `${reading}: every criterion this stage checks passed, unfenced`);
  assert.equal(inputs.authorization.honoured, false,
    `${reading}: and an unfenced record is never reported as honoured`);
  assert.equal(inputs.authorization.wouldBeWithinAuthorizedBound, true,
    `${reading}: its promotion is within the bound the record carried`);
}

function frozenArithmeticDigest(grid) {
  const lines = grid.map((row) => {
    const decision = evaluateLearnerPromotionCountCheck(row);
    return JSON.stringify([row, {
      refused: decision.refused,
      refusalReason: decision.refusalReason,
      maxAllowedVotersAfterPromotion: decision.maxAllowedVotersAfterPromotion,
      votersAfterPromotion: decision.votersAfterPromotion,
      allowances: decision.allowances,
      priorityRecoveryAdditionalVotersAllowed:
        decision.priorityRecoveryAdditionalVotersAllowed,
      wouldExceedTargetReplicaCount: decision.wouldExceedTargetReplicaCount,
      wouldBeEven: decision.wouldBeEven,
      votersAfterAllLearners: decision.votersAfterAllLearners,
      allLearnersWouldBeOdd: decision.allLearnersWouldBeOdd,
      allLearnersWithinTarget: decision.allLearnersWithinTarget,
    }]);
  });
  return createHash('sha256').update(lines.join('\n')).digest('hex');
}

// A record this learner could honour, read off its own row: every criterion
// the CARRY stage can check passed, and the membership fence - the one
// criterion that would need a read - was never applied, which the payload
// states as its own named outcome rather than as a grant or a refusal.
function assertUnfencedPayload(authorization, host) {
  assert.deepEqual(Object.keys(authorization).sort(),
    [...AUTHORIZATION_PAYLOAD_KEYS], 'the payload is a fixed key set');
  assert.equal(authorization.state, BINDING_PRESENT);
  assert.equal(authorization.present, true);
  assert.equal(authorization.outcome, OUTCOME_FENCE_NOT_EVALUATED,
    'the third outcome: neither honoured nor refused');
  assert.equal(authorization.honoured, false,
    'an unfenced record is never reported as honoured');
  assert.equal(authorization.reason, AUTHORIZATION_FENCE_NOT_EVALUATED);
  assert.equal(authorization.intent, SPREAD_CURE_TRANSITION_INTENT);
  assert.equal(authorization.desiredReplicationFactor,
    DECLARED_REPLICATION_FACTOR);
  assert.equal(authorization.observedMembershipEpoch,
    PARTITION_PUBLICATION_EPOCH,
    'the epoch the PLANNER observed still travels on the record');
  assert.equal(authorization.partitionMembershipEpoch,
    SPREAD_CURE_PARTITION_EPOCH_NOT_READ,
    'and the partition states, by name, that it read none of its own');
  assert.equal(authorization.observedVoterCount, 4);
  assert.equal(authorization.authorizedResultingVoterCount, 5);
  assert.equal(authorization.destinationNodeId, host.LEARNER_NODE_ID);
  assert.equal(authorization.destinationReplicaId, host.LEARNER_REPLICA_ID);
  assert.equal(authorization.operationId, host.SPREAD_CURE_OPERATION_ID);
  assert.equal(authorization.malformedValue, null);
}


// ---------------------------------------------------------------------------
// The traversal the carrier replaced, against a VERBATIM frozen copy of
// main's own getInFlightAddLikeOperationReplicaIds (f2fed102a). The carrier
// turned that method into one traversal that also yields the row the
// authorization rides on; the replica-id set it produces is a decision input
// and must still be main's, member for member, for every row shape - not
// only for the handful the guard grid happens to build.
// ---------------------------------------------------------------------------

const FROZEN_ADD_LIKE_TYPES = Object.freeze(new Set(['ADD', 'REPLACE']));
const FROZEN_TERMINAL_STATUSES = Object.freeze([...TERMINAL_STATUSES]);
const FROZEN_EMPTY = '';

function frozenInFlightAddLikeReplicaIds(operationRows, local) {
  const matching = operationRows.filter((operationRow) => {
    return (
      operationRow?.partition_id === local.partitionId &&
        FROZEN_ADD_LIKE_TYPES.has(operationRow?.type) &&
        !FROZEN_TERMINAL_STATUSES.includes(
          String(
            operationRow?.status ??
              operationRow?.operation_status ??
              operationRow?.operationStatus ??
              FROZEN_EMPTY,
          ).toLowerCase(),
        )
    );
  });
  const replicaIds = new Set();
  for (const operationRow of matching) {
    const replicaId = String(
      operationRow?.replica_id || FROZEN_EMPTY).trim();
    if (replicaId.length > 0) {
      replicaIds.add(replicaId);
    }
    const targetNodeId = String(
      operationRow?.target_node_id || FROZEN_EMPTY).trim();
    const localNodeId = String(local.nodeId || FROZEN_EMPTY).trim();
    const localReplicaId = String(local.replicaId || FROZEN_EMPTY).trim();
    if (
      targetNodeId.length > 0 &&
      localReplicaId.length > 0 &&
      targetNodeId === localNodeId
    ) {
      replicaIds.add(localReplicaId);
    }
  }
  return replicaIds;
}

function seededRandom(seed) {
  let state = seed;
  return () => {
    state |= 0;
    state = state + 0x6D2B79F5 | 0;
    let value = Math.imul(state ^ state >>> 15, 1 | state);
    value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value;
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

const TRAVERSAL_RANDOM_CASES = 2000;
const TRAVERSAL_MAX_ROWS = 4;

function buildRandomOperationRow(random, host, partitionId) {
  const pick = (values) => values[Math.floor(random() * values.length)];
  const row = {
    operation_id: pick(['op-a', 'op-b', host.SPREAD_CURE_OPERATION_ID]),
    partition_id: pick([partitionId, 'other-p1', undefined]),
    type: pick(['ADD', 'REPLACE', 'REMOVE', 'add', undefined]),
    replica_id: pick(
      [host.LEARNER_REPLICA_ID, `${partitionId}-r7`, '', '  ', undefined]),
    target_node_id: pick(
      [host.LEARNER_NODE_ID, 'node-9', '', undefined]),
  };
  const statusField = pick(['status', 'operation_status', 'operationStatus']);
  row[statusField] = pick([
    'in_progress', 'pending', 'syncing', 'completed', 'COMPLETED',
    'failed', 'removed', 'cancelled', undefined,
  ]);
  return row;
}

// A randomized differential over the row shapes the guard grid never builds:
// terminal spellings, alternative status fields, foreign partitions, unnamed
// replicas and absent target nodes.
function assertInFlightTraversalMatchesMain(host) {
  const random = seededRandom(1);
  const partitionId = host.CRITICAL_PARTITION_ID;
  let compared = 0;
  for (let index = 0; index < TRAVERSAL_RANDOM_CASES; index += 1) {
    const rowCount = Math.floor(random() * (TRAVERSAL_MAX_ROWS + 1));
    const operationRows = Array.from({length: rowCount},
      () => buildRandomOperationRow(random, host, partitionId));
    const {context} = host.createGuardContext({operationRows});
    const collected = context.collectInFlightAddLikeOperationsForPromotion();
    const expected = frozenInFlightAddLikeReplicaIds(operationRows, {
      partitionId,
      nodeId: host.LEARNER_NODE_ID,
      replicaId: host.LEARNER_REPLICA_ID,
    });
    assert.deepEqual([...collected.replicaIds].sort(), [...expected].sort(),
      `the replica-id set is main's on random row set ${index}`);
    compared += 1;
  }
  assert.equal(compared, TRAVERSAL_RANDOM_CASES,
    'the whole randomized differential ran');
}

// The owned-row selection itself, over the shapes main's set cannot express.
// A row that NAMES this learner wins over an unnamed row that merely targets
// its node, whatever the row order.
function assertOwnedRowSelection(host) {
  const named = {
    ...host.spreadCureOperationRow(),
    operation_id: 'op-named', id: 'op-named',
  };
  const unnamed = {
    ...host.spreadCureOperationRow(),
    operation_id: 'op-unnamed', id: 'op-unnamed', replica_id: '',
  };
  const foreign = {
    ...host.spreadCureOperationRow(),
    operation_id: 'op-foreign', id: 'op-foreign',
    replica_id: `${host.CRITICAL_PARTITION_ID}-r7`,
    target_node_id: 'node-9',
  };
  const selections = [
    ['unnamed first, named second', [unnamed, named], 'op-named'],
    ['named first, unnamed second', [named, unnamed], 'op-named'],
    ['only an unnamed row for this node', [unnamed], 'op-unnamed'],
    ['only a foreign row', [foreign], null],
    ['foreign then unnamed', [foreign, unnamed], 'op-unnamed'],
  ];
  for (const [name, operationRows, expected] of selections) {
    const {context} = host.createGuardContext({operationRows});
    const collected = context.collectInFlightAddLikeOperationsForPromotion();
    assert.equal(collected.ownedOperationRow?.operation_id ?? null, expected,
      `the owned row is the one that names this learner: ${name}`);
  }
}


/**
 * Register the carrier's learner-side witnesses against one guard host.
 * @param {Object} host the fixtures and constants of
 *   learner-promotion-count-check-inputs.test.js
 * @return {void}
 */
function registerSpreadCureTransitionAuthorizationCases(host) {
  test('the guard states the authorization it read', async () => {
    const honoured = host.refusalFixture(
      carriedOverrides(host, authorizationRecord(host)));
    await honoured.context.runLearnerPromotionCheck();
    const refusalFields =
      host.linesFor(honoured.logLines, host.REFUSAL_MESSAGE)[0].fields;
    assertUnfencedPayload(refusalFields.countCheckInputs.authorization, host);
    assert.equal(
      refusalFields.countCheckInputs.authorization
        .wouldBeWithinAuthorizedBound, true,
      'five voters after promotion is within the authorized five');
    // The decision is main's: this stage carries, it does not enforce.
    assert.equal(refusalFields.reason, host.WOULD_EXCEED);
    assert.equal(refusalFields.maxAllowedVotersAfterPromotion, 4);

    // The FIRST pass of a learner states it too.
    const passing = host.grantFixture(
      carriedOverrides(host, authorizationRecord(host)));
    await passing.context.runLearnerPromotionCheck();
    const passInputs = host.linesFor(
      passing.logLines, host.INPUTS_MESSAGE)[0].fields.countCheckInputs;
    assertUnfencedPayload(passInputs.authorization, host);
    assert.equal(passInputs.maxAllowedVotersAfterPromotion, 6,
      'and the cap the overflow budget produced is still main\'s');

    // No authorization: every field is an explicit absent value, never a
    // fabricated one, and the state says why.
    const absent = host.refusalFixture();
    await absent.context.runLearnerPromotionCheck();
    const absentAuthorization =
      authorizationOf(host, absent.logLines, host.REFUSAL_MESSAGE);
    assert.deepEqual(Object.keys(absentAuthorization).sort(),
      [...AUTHORIZATION_PAYLOAD_KEYS]);
    assert.equal(absentAuthorization.state, BINDING_ABSENT);
    assert.equal(absentAuthorization.present, false);
    assert.equal(absentAuthorization.honoured, false);
    assert.equal(absentAuthorization.outcome, OUTCOME_NOT_HONOURED);
    assert.equal(absentAuthorization.reason, AUTHORIZATION_ABSENT);
    for (const key of ABSENT_PAYLOAD_KEYS) {
      assert.equal(absentAuthorization[key], null,
        `${key} is an explicit absent value, not a fabricated one`);
    }
    assert.equal(absentAuthorization.partitionMembershipEpoch,
      SPREAD_CURE_PARTITION_EPOCH_NOT_READ,
      'the partition epoch is stated as not read, never as a null or a zero');

    // Malformed: named by type and a bounded size, never echoed.
    const malformed = host.refusalFixture(
      carriedOverrides(host, 'x'.repeat(HUGE_VALUE_LENGTH)));
    await malformed.context.runLearnerPromotionCheck();
    const malformedAuthorization =
      authorizationOf(host, malformed.logLines, host.REFUSAL_MESSAGE);
    assert.equal(malformedAuthorization.state, BINDING_MALFORMED);
    assert.equal(malformedAuthorization.honoured, false);
    assert.equal(malformedAuthorization.reason, AUTHORIZATION_MALFORMED);
    assert.deepEqual({...malformedAuthorization.malformedValue},
      {type: 'string', size: HUGE_VALUE_LENGTH});
    assert.ok(
      JSON.stringify(malformedAuthorization).length <
        BOUNDED_PAYLOAD_BUDGET_BYTES,
      'the logged authorization stays bounded whatever the row carried');

    // A record whose membership epoch is older than the one the planner
    // observed is NOT judged here: this stage applies no fence, so it reads
    // exactly as any other unfenced record. The stale reason itself is
    // proven at the binding owner, with a supplied epoch.
    const olderEpoch = host.refusalFixture(carriedOverrides(host,
      authorizationRecord(host, {observedMembershipEpoch: 3})));
    await olderEpoch.context.runLearnerPromotionCheck();
    const olderEpochAuthorization =
      authorizationOf(host, olderEpoch.logLines, host.REFUSAL_MESSAGE);
    assert.equal(olderEpochAuthorization.state, BINDING_PRESENT);
    assert.equal(olderEpochAuthorization.outcome, OUTCOME_FENCE_NOT_EVALUATED);
    assert.equal(olderEpochAuthorization.reason,
      AUTHORIZATION_FENCE_NOT_EVALUATED);
    assert.equal(olderEpochAuthorization.authorizedResultingVoterCount, 5,
      'an unfenced authorization still states the bound it carried');

    // The criteria this stage CAN check are named, never silently dropped.
    const mismatched = host.refusalFixture(carriedOverrides(host,
      authorizationRecord(host, {destinationNodeId: 'node-9'})));
    await mismatched.context.runLearnerPromotionCheck();
    const mismatchedAuthorization =
      authorizationOf(host, mismatched.logLines, host.REFUSAL_MESSAGE);
    assert.equal(mismatchedAuthorization.outcome, OUTCOME_NOT_HONOURED);
    assert.equal(mismatchedAuthorization.honoured, false);
    assert.equal(mismatchedAuthorization.reason,
      AUTHORIZATION_DESTINATION_MISMATCH);

    // The operation-id criterion compares the RECORD with the ROW it rode
    // on, so a record naming another operation is caught. Without this the
    // check could compare the record with itself and never fire.
    const foreignOperation = host.refusalFixture({
      operationRows: [{
        ...host.spreadCureOperationRow(
          stepsHistoryWith(authorizationRecord(host))),
        operation_id: 'op-other-row',
        id: 'op-other-row',
      }],
      publicationRows: PUBLICATION_ROWS,
    });
    await foreignOperation.context.runLearnerPromotionCheck();
    const foreignAuthorization =
      authorizationOf(host, foreignOperation.logLines, host.REFUSAL_MESSAGE);
    assert.equal(foreignAuthorization.outcome, OUTCOME_NOT_HONOURED);
    assert.equal(foreignAuthorization.reason,
      AUTHORIZATION_OPERATION_MISMATCH,
      'the record is judged against the row it rode on, not against itself');
    assert.equal(foreignAuthorization.operationId,
      host.SPREAD_CURE_OPERATION_ID,
      'and the payload states the record\'s own id, not the row\'s');

    // The bound is computed from the count check's OWN votersAfterPromotion,
    // not from the voter census: with five voters the promotion would make
    // six, one past the authorized five.
    const fiveVoters = host.refusalFixture({
      ...carriedOverrides(host, authorizationRecord(host)),
      serviceRows: [
        host.voterRow(1, 'node-0'), host.voterRow(2, 'node-0'),
        host.voterRow(3, 'node-1'), host.voterRow(4, 'node-1'),
        host.voterRow(6, 'node-3'), host.learnerRow(),
      ],
    });
    await fiveVoters.context.runLearnerPromotionCheck();
    const fiveVoterInputs = host.linesFor(
      fiveVoters.logLines, host.REFUSAL_MESSAGE)[0].fields.countCheckInputs;
    assert.equal(fiveVoterInputs.membership.activeVoterCount, 5);
    assert.equal(fiveVoterInputs.authorization.wouldBeWithinAuthorizedBound,
      false, 'six voters after promotion is past the authorized five');

    // The two recorded live readings, replayed as hosts.
    await assertRecordedReading(host, 'refusal');
    await assertRecordedReading(host, 'passing');
  });

  test('an authorization on the row changes no count-check decision',
    async () => {
      // Layer 1: the arithmetic owner, verbatim against main's own decisions.
      assert.equal(frozenArithmeticDigest(host.ARITHMETIC_GRID),
        MAIN_ARITHMETIC_GRID_DIGEST,
        'every row of the arithmetic grid decides exactly as main did');

      // Layer 2: the real guard over the whole guard grid with NO
      // authorization, against main's own decision projection.
      const baseline = await projectGuardGrid(host, undefined);
      assert.equal(
        createHash('sha256').update(baseline.join('\n')).digest('hex'),
        MAIN_GUARD_GRID_DECISION_DIGEST,
        'the guard grid decides exactly as main\'s copy of it did');

      // Layer 3: the same grid with an authorization-bearing row.
      const variants = [
        ['valid', authorizationRecord(host)],
        ['stale', authorizationRecord(host, {observedMembershipEpoch: 0})],
        ['operation mismatch',
          authorizationRecord(host, {operationId: 'op-other'})],
        ['destination mismatch',
          authorizationRecord(host, {destinationNodeId: 'node-9'})],
        ['desired rf mismatch',
          authorizationRecord(host, {desiredReplicationFactor: 5})],
        ['malformed object', {intent: SPREAD_CURE_TRANSITION_INTENT}],
        ['malformed scalar', 42],
        ['explicit null', null],
      ];
      for (const [name, value] of variants) {
        assert.deepEqual(await projectGuardGrid(host, value), baseline,
          `an authorization decides nothing differently: ${name}`);
      }

      // The traversal the carrier replaced, against main's own measured
      // answer - including the target-node fallback the guard grid above
      // never reaches.
      assertInFlightTraversalMatchesMain(host);
      assertOwnedRowSelection(host);

      // A throwing logger behaves exactly as on main: the carrier adds no log
      // call and catches nothing, so the throw still leaves the check.
      for (const value of [undefined, authorizationRecord(host), 'junk']) {
        const throwing = host.refusalFixture(carriedOverrides(host, value));
        const thrown = new Error('logger sink failure');
        throwing.context.logger.info = () => {
          throw thrown;
        };
        await assert.rejects(
          () => throwing.context.runLearnerPromotionCheck(),
          (error) => error === thrown,
          'a logger failure leaves the check exactly as it does on main');
      }

      // The whole read budget, for EVERY row class: main's reads, plus ONE
      // memoised steps_history parse of the row the guard had already read.
      // No row class adds a source read - the partition's own membership
      // epoch is not among the things this stage reads.
      for (const [name, value] of [
        ['a present authorization', authorizationRecord(host)],
        ['a malformed authorization', 42],
        ['no authorization at all', undefined],
      ]) {
        const counted = host.refusalFixture(carriedOverrides(host, value));
        await counted.context.runLearnerPromotionCheck();
        assert.equal(counted.counts[host.STEPS_HISTORY_READ], 3,
          `${name}: the row already read is parsed once more, and once only`);
        assert.equal(counted.counts[PUBLICATION_READ], undefined,
          `${name}: no publication read`);
        assert.equal(counted.counts[CONFIG_READ], undefined,
          `${name}: no config read`);
        assert.deepEqual(counted.trace, [...host.CARRIED_READ_ORDER],
          `${name}: main's read order plus one memoised parse, and nothing
           else`.replace(/\s+/gu, ' '));
      }

      // And a cache that FAULTS on both of those tables leaves the refusal
      // path identical to main's: the same line, the same recheck, nothing
      // thrown. It cannot fault on a read that never happens.
      const faulted = host.refusalFixture({
        ...carriedOverrides(host, authorizationRecord(host)),
        faultOnTables: [PUBLICATION_READ, CONFIG_READ, PUBLICATION_GET_ALL],
        withGetAll: true,
      });
      const baselineRefusal = host.refusalFixture();
      await baselineRefusal.context.runLearnerPromotionCheck();
      await faulted.context.runLearnerPromotionCheck();
      await faulted.context.runLearnerPromotionCheck();
      const faultedRefusals =
        host.linesFor(faulted.logLines, host.REFUSAL_MESSAGE);
      assert.equal(faultedRefusals.length, 2,
        'both rechecks logged their refusal');
      assert.deepEqual(
        faultedRefusals.map((line) => projectLine(line)),
        [projectLine(host.linesFor(
          baselineRefusal.logLines, host.REFUSAL_MESSAGE)[0]),
        projectLine(faultedRefusals[1])],
        'the refusal a faulting publications/config cache produces is main\'s');
      assert.deepEqual(
        faulted.logLines.filter((line) => line.level === 'schedule')
          .map((line) => line.message),
        [host.DEFERRED_RECHECK, host.DEFERRED_RECHECK],
        'and each one still schedules its recheck');
    });
}

export {registerSpreadCureTransitionAuthorizationCases};
