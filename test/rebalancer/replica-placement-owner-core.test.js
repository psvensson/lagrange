// The placement owner's pure core (quest replica-placement-admission-owner,
// design sections 2.5 and 2.6): the class order and formation gate, the
// deficit model over declared hosts with per-target eligibility, and the
// admission statement with its level-triggered repair reservation.
//
// REAL: the owner's pure modules, the system-partition classification, the
// node liveness projection and readNodeHostIdentity. Inputs are committed
// node rows and replica descriptors written by the test.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {COLUMN} from '../../src/constants/columns.js';
import {SERVICE_STATUS} from '../../src/constants/index.js';
import {OperationType} from '../../src/rebalancer/replica-operation-progress.js';
import {
  PLACEMENT_CLASS, PLACEMENT_COPY_CAPACITY, PLACEMENT_DEFICIT_KIND, PLACEMENT_FORMATION_STATE,
  PLACEMENT_WAITING_REASON,
} from '../../src/rebalancer/replica-placement-owner-constants.js';
import {
  classifyPlacementClass, formationWaitingReasonOf, orderPlacementCandidates,
} from '../../src/rebalancer/replica-placement-owner-order.js';
import {
  PLACEMENT_DEFICIT_STATE, buildPlacementNodeEligibility, evaluatePartitionDeficit,
  readPlacementNodeInputs, repairSourceNodeIdsOf,
} from '../../src/rebalancer/replica-placement-owner-deficits.js';
import {
  PLACEMENT_STATEMENT_VALIDITY, buildFoundingAdmissionStatement,
  buildPlacementAdmissionStatement, canonicalPlacementStatement,
  resolveSourceCapacityForClass,
} from '../../src/rebalancer/replica-placement-owner-admission-statement.js';

const NOW_MS = 1_000_000;
const LEASE_MS = 60_000;

function nodeRow(nodeId, hostId, {leaseExpiresAt = NOW_MS + LEASE_MS} = {}) {
  return {[COLUMN.NODE_ID]: nodeId, [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    [COLUMN.READY_LEASE_EXPIRES_AT]: leaseExpiresAt,
    ...(hostId === null ? {} : {[COLUMN.HOST_ID]: hostId})};
}

// Five nodes on four declared hosts: n3 and n4 share host h3.
const FIVE_ON_FOUR = Object.freeze([nodeRow('n1', 'h1'), nodeRow('n2', 'h2'),
  nodeRow('n3', 'h3'), nodeRow('n4', 'h3'), nodeRow('n5', 'h4')]);

function replicas(partitionId, placements) {
  return placements.map(([nodeId, isLeader = false, failed = false], index) =>
    ({replicaId: `${partitionId}-r${index + 1}`, nodeId, isLeader, failed}));
}

function deficit(partitionId, placements, nodeRows = FIVE_ON_FOUR, replicationFactor = 3) {
  return evaluatePartitionDeficit({partitionId, replicationFactor,
    replicaRows: replicas(partitionId, placements),
    eligibility: buildPlacementNodeEligibility({nodeRows, nowMs: NOW_MS})});
}

test('class order: the ledger, the priority control plane, nodes-p1, system, user', () => {
  assert.deepEqual(['replica_operations-p1', 'sql_transactions-p1', 'nodes-p1',
    'services-p1', 'tbl-orders-p1'].map(classifyPlacementClass), [
    PLACEMENT_CLASS.LEDGER, PLACEMENT_CLASS.PRIORITY,
    PLACEMENT_CLASS.FORMATION_DEPENDENCY, PLACEMENT_CLASS.SYSTEM, PLACEMENT_CLASS.USER]);
});

test('formation gate: classes 3-5 wait FORMATION_NOT_LATCHED until FORMED; 1-2 never', () => {
  for (const state of [PLACEMENT_FORMATION_STATE.FORMING,
    PLACEMENT_FORMATION_STATE.UNDECLARED, PLACEMENT_FORMATION_STATE.UNAVAILABLE]) {
    for (const placementClass of [PLACEMENT_CLASS.FORMATION_DEPENDENCY,
      PLACEMENT_CLASS.SYSTEM, PLACEMENT_CLASS.USER]) {
      assert.equal(formationWaitingReasonOf(placementClass, {state}),
        PLACEMENT_WAITING_REASON.FORMATION_NOT_LATCHED);
    }
    assert.equal(formationWaitingReasonOf(PLACEMENT_CLASS.LEDGER, {state}), null);
    assert.equal(formationWaitingReasonOf(PLACEMENT_CLASS.PRIORITY, {state}), null);
  }
  assert.equal(formationWaitingReasonOf(PLACEMENT_CLASS.USER,
    {state: PLACEMENT_FORMATION_STATE.FORMED, latchEpoch: 2}), null);
});

test('within a class: severity, then fewest distinct hosts, then fewest voters, then id; ' +
  'services, partitions and tables first among system partitions', () => {
  const candidate = (partitionId, deficitKind, distinctHostCount, voterCount) => ({
    partitionId, placementClass: classifyPlacementClass(partitionId), deficitKind,
    distinctHostCount, voterCount});
  const ordered = orderPlacementCandidates([
    candidate('config-p1', PLACEMENT_DEFICIT_KIND.HOST_SPREAD, 1, 3),
    candidate('indices-p1', PLACEMENT_DEFICIT_KIND.HOST_SPREAD, 2, 3),
    candidate('logs-p1', PLACEMENT_DEFICIT_KIND.UNDER_REPLICATED, 2, 2),
    candidate('tables-p1', PLACEMENT_DEFICIT_KIND.HOST_SPREAD, 2, 3),
    candidate('nodes-p1', PLACEMENT_DEFICIT_KIND.HOST_SPREAD, 1, 3),
    candidate('sql_transactions-p1', PLACEMENT_DEFICIT_KIND.HOST_SPREAD, 2, 3),
    candidate('replica_operations-p1', PLACEMENT_DEFICIT_KIND.HOST_SPREAD, 2, 3),
    candidate('services-p1', PLACEMENT_DEFICIT_KIND.HOST_SPREAD, 2, 3),
    candidate('code-p1', PLACEMENT_DEFICIT_KIND.HOST_SPREAD, 1, 2),
  ]).map((entry) => entry.partitionId);
  assert.deepEqual(ordered, ['replica_operations-p1', 'sql_transactions-p1', 'nodes-p1',
    'logs-p1', 'services-p1', 'tables-p1', 'code-p1', 'config-p1', 'indices-p1']);
});

test('HOST_SPREAD on declared hosts: two nodes of one host are one host; the source ' +
  'leaves the over-represented host, never the leader while a co-located non-leader exists',
() => {
  const result = deficit('config-p1', [['n1'], ['n3', true], ['n4']]);
  assert.equal(result.state, PLACEMENT_DEFICIT_STATE.CANDIDATE);
  const {candidate} = result;
  assert.equal(candidate.deficitKind, PLACEMENT_DEFICIT_KIND.HOST_SPREAD);
  assert.equal(candidate.distinctHostCount, 2);
  assert.equal(candidate.move.type, OperationType.REPLACE);
  assert.equal(candidate.move.sourceReplicaId, 'config-p1-r3');
  assert.ok(['n2', 'n5'].includes(candidate.move.targetNodeId));
  assert.equal(candidate.move.copySourceNodeId, 'n3');
  assert.equal(candidate.repair, false);
  // Three distinct declared hosts: no deficit.
  assert.equal(deficit('config-p1', [['n1', true], ['n3'], ['n5']]).state,
    PLACEMENT_DEFICIT_STATE.NONE);
});

test('per-target eligibility: a lapsed READY lease or an undeclared host only drops the ' +
  'node as a target; its replicas become FAILED_OR_DEAD repairs', () => {
  const nodes = [nodeRow('n1', 'h1'), nodeRow('n2', 'h2', {leaseExpiresAt: NOW_MS - 1}),
    nodeRow('n3', null), nodeRow('n4', 'h4'), nodeRow('n5', 'h5')];
  const eligibility = buildPlacementNodeEligibility({nodeRows: nodes, nowMs: NOW_MS});
  assert.deepEqual(eligibility.eligibleNodeIds, ['n1', 'n4', 'n5']);
  const repair = deficit('config-p1', [['n1', true], ['n2'], ['n4']], nodes);
  assert.equal(repair.candidate.deficitKind, PLACEMENT_DEFICIT_KIND.FAILED_OR_DEAD);
  assert.equal(repair.candidate.repair, true);
  assert.deepEqual(repair.candidate.move, {type: OperationType.REPLACE, targetNodeId: 'n5',
    replicaId: null, sourceReplicaId: 'config-p1-r2', copySourceNodeId: 'n1'});
  // Another partition proceeds to the ready targets in the same pass.
  const other = deficit('tables-p1', [['n1', true], ['n1'], ['n4']], nodes);
  assert.equal(other.candidate.move.targetNodeId, 'n5');
  // With enough live voters the dead replica is removed instead.
  const surplusDead = deficit('indices-p1', [['n1', true], ['n4'], ['n5'], ['n2']], nodes);
  assert.deepEqual(surplusDead.candidate.move, {type: OperationType.REMOVE, targetNodeId: 'n2',
    replicaId: 'indices-p1-r4', sourceReplicaId: null, copySourceNodeId: null});
});

test('UNDER_REPLICATED adds; SURPLUS removes; no leader waits LEADER_UNKNOWN; no ' +
  'eligible target waits NO_ELIGIBLE_TARGET', () => {
  const under = deficit('config-p1', [['n1', true], ['n2']]);
  assert.equal(under.candidate.deficitKind, PLACEMENT_DEFICIT_KIND.UNDER_REPLICATED);
  assert.equal(under.candidate.move.type, OperationType.ADD);
  assert.ok(['n3', 'n5'].includes(under.candidate.move.targetNodeId));
  const surplus = deficit('config-p1', [['n1', true], ['n2'], ['n3'], ['n4']]);
  assert.equal(surplus.candidate.deficitKind, PLACEMENT_DEFICIT_KIND.SURPLUS);
  assert.equal(surplus.candidate.move.type, OperationType.REMOVE);
  assert.ok(['config-p1-r3', 'config-p1-r4'].includes(surplus.candidate.move.replicaId));
  assert.deepEqual(deficit('config-p1', [['n1'], ['n3'], ['n4']]).waiting.reason,
    PLACEMENT_WAITING_REASON.LEADER_UNKNOWN);
  const twoHosts = [nodeRow('n1', 'h1'), nodeRow('n2', 'h2')];
  assert.equal(deficit('config-p1', [['n1', true], ['n1'], ['n2']], twoHosts).state,
    PLACEMENT_DEFICIT_STATE.NONE);
  const lone = deficit('config-p1', [['n1', true], ['n2']], twoHosts);
  assert.equal(lone.waiting.reason, PLACEMENT_WAITING_REASON.NO_ELIGIBLE_TARGET);
});

test('the repair reservation is level-triggered and travels in the statement as ' +
  'kSrcForClass', () => {
  const kSrc = PLACEMENT_COPY_CAPACITY.K_SRC;
  const resolve = (placementClass, repair, waiting) => resolveSourceCapacityForClass({
    placementClass, repair, copySourceNodeId: 'n1',
    repairWaitingSourceNodeIds: new Set(waiting), kSrc});
  assert.equal(resolve(PLACEMENT_CLASS.SYSTEM, false, []), kSrc);
  assert.equal(resolve(PLACEMENT_CLASS.SYSTEM, false, ['n1']), kSrc - 1);
  assert.equal(resolve(PLACEMENT_CLASS.SYSTEM, false, ['n2']), kSrc);
  assert.equal(resolve(PLACEMENT_CLASS.SYSTEM, true, ['n1']), kSrc);
  assert.equal(resolve(PLACEMENT_CLASS.PRIORITY, false, ['n1']), kSrc);
  assert.equal(resolve(PLACEMENT_CLASS.LEDGER, false, ['n1']), kSrc);
  // A repair candidate of this pass reserves its copy source; a spread move
  // and a REMOVE do not.
  const evaluations = [
    deficit('config-p1', [['n1', true], ['n2']]),
    deficit('tables-p1', [['n2', true], ['n3'], ['n4']]),
    deficit('indices-p1', [['n1', true], ['n2'], ['n3'], ['n5'], ['n4']]),
  ];
  assert.deepEqual(evaluations.map((evaluation) => evaluation.candidate.deficitKind), [
    PLACEMENT_DEFICIT_KIND.UNDER_REPLICATED, PLACEMENT_DEFICIT_KIND.HOST_SPREAD,
    PLACEMENT_DEFICIT_KIND.SURPLUS]);
  assert.deepEqual([...repairSourceNodeIdsOf(evaluations)], ['n1']);
  const statement = buildPlacementAdmissionStatement({partitionId: 'config-p1',
    placementClass: PLACEMENT_CLASS.SYSTEM, repair: false,
    move: {type: OperationType.ADD, targetNodeId: 'n2', copySourceNodeId: 'n1'}},
  {sourceNodeId: 'n1', repairWaitingSourceNodeIds: new Set(['n1']), formationLatchEpoch: 3,
    membershipPublicationEpoch: null, positions: {nodesEpoch: 9}});
  assert.equal(statement.kSrcForClass, kSrc - 1);
  assert.equal(statement.kTgt, PLACEMENT_COPY_CAPACITY.K_TGT);
});

test('the canonical statement refuses what its kind cannot carry', () => {
  const valid = buildPlacementAdmissionStatement({partitionId: 'config-p1',
    placementClass: PLACEMENT_CLASS.SYSTEM, repair: false,
    move: {type: OperationType.ADD, targetNodeId: 'n2', copySourceNodeId: 'n1'}},
  {sourceNodeId: 'n1', repairWaitingSourceNodeIds: new Set(), formationLatchEpoch: 3,
    membershipPublicationEpoch: 5, positions: {}});
  assert.deepEqual(canonicalPlacementStatement(JSON.parse(JSON.stringify(valid))),
    {validity: PLACEMENT_STATEMENT_VALIDITY.VALID, statement: valid});
  const invalid = {validity: PLACEMENT_STATEMENT_VALIDITY.INVALID};
  const variants = [
    {...valid, entityType: 'message_group'},
    {...valid, formationLatchEpoch: null},
    {...valid, dispatchHold: 'LEDGER_AWAITING_COPY_IDLE'},
    {...valid, kSrcForClass: valid.kSrc - 2},
    {...valid, moves: [{...valid.moves[0], copySourceNodeId: null}]},
    {...valid, moves: [valid.moves[0], valid.moves[0]]},
    {...valid, extra: true},
    {...valid, placementClass: PLACEMENT_CLASS.LEDGER},
  ];
  assert.deepEqual(variants.map(canonicalPlacementStatement), variants.map(() => invalid));
  assert.throws(() => buildPlacementAdmissionStatement({partitionId: 'config-p1',
    placementClass: PLACEMENT_CLASS.SYSTEM, repair: false,
    move: {type: OperationType.ADD, targetNodeId: 'n2', copySourceNodeId: 'n1'}},
  {sourceNodeId: 'n1', repairWaitingSourceNodeIds: new Set(), formationLatchEpoch: null,
    membershipPublicationEpoch: null, positions: {}}), /statement_invalid/u);
  const founding = buildFoundingAdmissionStatement({partitionId: 'tbl-x-p1',
    placementClass: PLACEMENT_CLASS.USER, foundingIntentId: 'job:tbl-x-p1',
    targetNodeIds: ['n1', 'n2', 'n3'], sourceNodeId: 'n1', formationLatchEpoch: 3,
    positions: {}});
  assert.equal(founding.moves.length, 3);
  assert.deepEqual(canonicalPlacementStatement({...founding, moves: [founding.moves[0],
    founding.moves[0]]}), invalid);
  assert.deepEqual(canonicalPlacementStatement({...founding, foundingIntentId: null}),
    invalid);
});

test('the node and formation inputs come from one committed answer of the injected ' +
  'node authority (answerCommittedNodes().formation, P4)', () => {
  const formed = {state: PLACEMENT_FORMATION_STATE.FORMED, latchEpoch: 6};
  const reader = (answer) => ({answerCommittedNodes: () => answer});
  const ready = readPlacementNodeInputs(reader({state: 'ready', epoch: 11,
    nodeRows: FIVE_ON_FOUR, formation: formed}), NOW_MS);
  assert.equal(ready.formation, formed);
  assert.equal(ready.epoch, 11);
  assert.deepEqual(ready.eligibility.eligibleNodeIds, ['n1', 'n2', 'n3', 'n4', 'n5']);
  assert.equal(formationWaitingReasonOf(PLACEMENT_CLASS.SYSTEM, ready.formation), null);
  const forming = readPlacementNodeInputs(reader({state: 'ready', epoch: 11,
    nodeRows: FIVE_ON_FOUR, formation: {state: PLACEMENT_FORMATION_STATE.FORMING}}), NOW_MS);
  assert.equal(formationWaitingReasonOf(PLACEMENT_CLASS.SYSTEM, forming.formation),
    PLACEMENT_WAITING_REASON.FORMATION_NOT_LATCHED);
  assert.deepEqual(readPlacementNodeInputs(reader({state: 'unavailable', reason: 'stale',
    nodeRows: []}), NOW_MS), {state: 'unavailable',
    reason: PLACEMENT_WAITING_REASON.NODE_AUTHORITY_UNAVAILABLE});
});
