// The placement owner's pure core (quest replica-placement-admission-owner,
// design sections 2.5 and 2.6): the class order and formation gate, the
// deficit model over declared hosts with per-target eligibility, and the
// admission statement with its level-triggered repair reservation.
//
// REAL: the owner's pure modules, the system-partition classification, the
// node liveness projection and readNodeHostIdentity. Inputs are committed
// node rows and replica descriptors written by the test.
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {test} from 'node:test';
import Database from 'better-sqlite3';
import {
  ControlPlaneSetup,
} from '../../src/bootstrap/shared/control-plane-setup.js';
import {
  REPLICA_OPERATIONS_SCHEMA,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
  generateCreateIndexSQL,
  generateCreateTableSQL,
} from '../../src/bootstrap/system-table-schema-sql.js';
import {COLUMN} from '../../src/constants/columns.js';
import {
  CDC_OPERATION,
  SERVICE_STATUS,
  TABLES,
  WORKFLOW_STEP,
} from '../../src/constants/index.js';
import {
  ServeEligibilityOwner,
} from '../../src/control-plane/serve-eligibility-owner.js';
import {
  PARTITION_CDC_EVENT_BUILD_STATE,
} from '../../src/partition/partition-cdc-generator.js';
import {
  ensureCdcObligationLedger,
} from '../../src/partition/partition-cdc-obligation-ledger.js';
import {
  committedStatementEntryKey,
  createCommittedStatementOutcomeTable,
} from '../../src/partition/partition-committed-statement-outcome.js';
import {
  openParticipantTransactionStore,
} from '../../src/partition/partition-participant-transaction-store.js';
import {
  buildPlacementCommand,
} from '../../src/partition/partition-placement-admission-command.js';
import {
  PLACEMENT_ADMIT_TYPE,
  PLACEMENT_RELEASE_HOLD_TYPE,
} from '../../src/partition/partition-placement-admission-constants.js';
import {
  LEDGER_PARTITION_ID,
} from '../../src/partition/partition-placement-admission-decision.js';
import {
  applyPlacementCommand,
} from '../../src/partition/partition-placement-admission.js';
import {
  PARTITION_SERVICE_OPERATION,
} from '../../src/partition/partition-service-constants.js';
import {
  PARTITION_WRITE_LEADERSHIP_REFUSAL,
} from '../../src/partition/partition-write-kernel.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {
  OperationType,
} from '../../src/rebalancer/replica-operation-progress.js';
import {
  ReplicaOperationField,
  ReplicaOperationResponseStatus,
} from '../../src/rebalancer/replica-operation-constants.js';
import {
  assignReplicaHandlerMembershipMethods,
} from '../../src/node/replica-handler-membership-methods.js';
import {
  PLACEMENT_CLASS, PLACEMENT_COPY_CAPACITY, PLACEMENT_DEFICIT_KIND, PLACEMENT_FORMATION_STATE,
  PLACEMENT_MOVE_TYPE, PLACEMENT_TRIGGER, PLACEMENT_WAITING_REASON,
} from '../../src/rebalancer/replica-placement-owner-constants.js';
import {
  REPLICA_PLACEMENT_OWNER_COLLABORATOR_INVALID,
  createReplicaPlacementOwner,
} from '../../src/rebalancer/replica-placement-owner.js';
import {
  PLACEMENT_ADAPTIVE_BUDGET_REASON as BUDGET_REASON,
  PLACEMENT_ADAPTIVE_WINDOW_ACTION as WINDOW_ACTION,
  decideAdaptiveResourceWindow, normalizeWindowConfig,
} from '../../src/rebalancer/replica-placement-adaptive-budget.js';
import {
  applyCommitted,
  clearFixtureSingletons,
  resetFixtureSingletons,
} from '../test-helpers/participant-transaction-fixture.js';
import {
  ledgerRows,
  onLedgerLeader,
} from '../partition/placement-admission-fixture.js';
import {
  INERT_RESYNC_TIMER,
  runCorrectionBProductionAssemblyWitness,
  runGrowthPromoteLeaderRedirectAndTimeoutWitness,
  runGrowthPromoteProductionWitness,
  runScopedRemovalPlacementAttachmentWitness,
} from './replica-placement-owner-test-support.js';
import {
  PRESSURE_STATE,
} from '../../src/rebalancer/storage-capacity-constants.js';
import {
  classifyPlacementClass, formationWaitingReasonOf, orderPlacementCandidates,
  resolveVoterTarget,
} from '../../src/rebalancer/replica-placement-owner-order.js';
import {
  PLACEMENT_DEFICIT_STATE, buildPartitionReplicaRows, buildPlacementNodeEligibility,
  evaluatePartitionDeficit, readPlacementNodeInputs, repairSourceNodeIdsOf,
} from '../../src/rebalancer/replica-placement-owner-deficits.js';
import {
  PLACEMENT_STATEMENT_VALIDITY, buildFoundingAdmissionStatement,
  buildPlacementAdmissionStatement, canonicalPlacementStatement,
  resolveSourceCapacityForClass,
} from '../../src/rebalancer/replica-placement-owner-admission-statement.js';
import {leadingLedgerStubFields} from '../test-helpers/controllable-consensus-port.js';

const NOW_MS = 1_000_000;
const LEASE_MS = 60_000;

function nodeRow(nodeId, hostId, {leaseExpiresAt = NOW_MS + LEASE_MS} = {}) {
  return {[COLUMN.NODE_ID]: nodeId, [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    [COLUMN.READY_LEASE_EXPIRES_AT]: leaseExpiresAt, [COLUMN.BOOT_INCARNATION]: 1,
    ...(hostId === null ? {} : {[COLUMN.HOST_ID]: hostId})};
}

// Five nodes on four declared hosts: n3 and n4 share host h3.
const FIVE_ON_FOUR = Object.freeze([nodeRow('n1', 'h1'), nodeRow('n2', 'h2'),
  nodeRow('n3', 'h3'), nodeRow('n4', 'h3'), nodeRow('n5', 'h4')]);

function replicas(partitionId, placements) {
  return placements.map(([nodeId, isLeader = false, failed = false], index) =>
    ({replicaId: `${partitionId}-r${index + 1}`, nodeId, isLeader, failed,
      role: isLeader ? RAFT_ROLE.LEADER : RAFT_ROLE.FOLLOWER, createdAt: NOW_MS,
      operationalVoter: !failed}));
}

function deficit(partitionId, placements, nodeRows = FIVE_ON_FOUR, replicationFactor = 3) {
  return evaluatePartitionDeficit({partitionId, replicationFactor,
    replicaRows: replicas(partitionId, placements),
    eligibility: buildPlacementNodeEligibility({nodeRows, nowMs: NOW_MS})});
}

test('copy target search scans eligible nodes once on success and preserves refusal attribution', () => {
  const partitionId = 'tbl-target-p1';
  const nodes = FIVE_ON_FOUR.slice(0, 3);
  const base = buildPlacementNodeEligibility({nodeRows: nodes, nowMs: NOW_MS});
  let scans = 0;
  const eligibility = {...base, get eligibleNodeIds() {
    scans++;
    return base.eligibleNodeIds;
  }};
  const evaluate = (storageExcludedTargets, saturatedTargetNodeIds = new Set()) =>
    evaluatePartitionDeficit({partitionId, replicationFactor: 3,
      replicaRows: replicas(partitionId, [['n1', true]]), eligibility,
      storageExcludedTargets, saturatedTargetNodeIds,
      targetCapacityRanker: (id) => id === 'n3' ? 5 : 1});
  assert.equal(evaluate(new Map()).candidate.move.targetNodeId, 'n3');
  assert.equal(scans, 1);
  const unknown = PLACEMENT_WAITING_REASON.TARGET_STORAGE_UNKNOWN;
  const constrained = PLACEMENT_WAITING_REASON.TARGET_STORAGE_CONSTRAINED;
  assert.equal(evaluate(new Map([['n3', constrained]])).candidate.move.targetNodeId, 'n2');
  assert.equal(evaluate(new Map(), new Set(['n3'])).candidate.move.targetNodeId, 'n2');
  assert.equal(evaluate(new Map(), new Set(['n2', 'n3'])).candidate.move.targetNodeId, 'n3');
  assert.equal(evaluate(new Map([['n3', constrained], ['n2', unknown]])).waiting.reason, unknown);
});

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
    'logs-p1', 'code-p1', 'config-p1', 'services-p1', 'tables-p1', 'indices-p1']);
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
  'node as a target and conserves its incumbent membership', () => {
  const nodes = [nodeRow('n1', 'h1'), nodeRow('n2', 'h2', {leaseExpiresAt: NOW_MS - 1}),
    nodeRow('n3', null), nodeRow('n4', 'h4'), nodeRow('n5', 'h5')];
  const eligibility = buildPlacementNodeEligibility({nodeRows: nodes, nowMs: NOW_MS});
  assert.deepEqual(eligibility.eligibleNodeIds, ['n1', 'n4', 'n5']);
  const retained = deficit('config-p1', [['n1', true], ['n2'], ['n4']], nodes);
  assert.equal(retained.state, PLACEMENT_DEFICIT_STATE.NONE);
  const unknownHost = deficit('config-p1', [['n1', true], ['n3'], ['n4']], nodes);
  assert.equal(unknownHost.state, PLACEMENT_DEFICIT_STATE.WAITING);
  assert.equal(unknownHost.waiting.reason,
    PLACEMENT_WAITING_REASON.INCUMBENT_AUTHORITY_UNAVAILABLE);
  const missingNode = deficit('config-p1', [['n1', true], ['n2'], ['n4']],
    nodes.filter((row) => row[COLUMN.NODE_ID] !== 'n2'));
  assert.equal(missingNode.state, PLACEMENT_DEFICIT_STATE.WAITING);
  assert.equal(missingNode.waiting.reason,
    PLACEMENT_WAITING_REASON.INCUMBENT_AUTHORITY_UNAVAILABLE);
  const disconnected = nodes.map((row) => row[COLUMN.NODE_ID] === 'n2' ?
    {...row, [COLUMN.CONNECTION_STATE]: 'disconnected',
      [COLUMN.READY_LEASE_EXPIRES_AT]: null, [COLUMN.BOOT_INCARNATION]: 1} : row);
  // This established voter has no historical ADD entry in the planner.
  const repair = deficit('config-p1', [['n1', true], ['n2'], ['n4']], disconnected);
  assert.equal(repair.candidate.deficitKind, PLACEMENT_DEFICIT_KIND.FAILED_OR_DEAD);
  assert.equal(repair.candidate.move.type, OperationType.REPLACE);
  assert.equal(repair.candidate.move.sourceReplicaId, 'config-p1-r2');
  // Another partition proceeds to the ready targets in the same pass.
  const other = deficit('tables-p1', [['n1', true], ['n1'], ['n4']], nodes);
  assert.equal(other.candidate.move.targetNodeId, 'n5');
  // An explicit replica failure still authorizes repair of that replica.
  const failed = deficit('indices-p1', [['n1', true], ['n4'], ['n5'], ['n2', false, true]], nodes);
  assert.equal(failed.candidate.deficitKind, PLACEMENT_DEFICIT_KIND.FAILED_OR_DEAD);
  assert.deepEqual(failed.candidate.move, {type: OperationType.REMOVE, targetNodeId: 'n2',
    replicaId: 'indices-p1-r4', sourceReplicaId: null, copySourceNodeId: null,
    voterRetirement: {nodeBootIncarnation: 1, replicaCreatedAt: NOW_MS}});
});

test('inactive voter rows reserve occupancy without adding to the REMOVE floor or sourcing copies',
  () => {
    const partitionId = 'config-p1';
    const rows = [
      ['n1', SERVICE_STATUS.ACTIVE, RAFT_ROLE.LEADER],
      ['n2', 'syncing', RAFT_ROLE.FOLLOWER],
      ['n3', SERVICE_STATUS.ACTIVE, RAFT_ROLE.FOLLOWER],
      ['n4', 'failed', RAFT_ROLE.FOLLOWER],
    ].map(([nodeId, status, role], index) => ({
      [COLUMN.REPLICA_ID]: `${partitionId}-r${index + 1}`,
      [COLUMN.NODE_ID]: nodeId,
      [COLUMN.STATUS]: status,
      [COLUMN.RAFT_ROLE]: role,
    }));
    const eligibility = buildPlacementNodeEligibility({nodeRows: FIVE_ON_FOUR, nowMs: NOW_MS});
    function measured(serviceRows, leaderNodeId) {
      return evaluatePartitionDeficit({partitionId, replicationFactor: 3, eligibility,
        replicaRows: buildPartitionReplicaRows(serviceRows, leaderNodeId, false)});
    }
    const repair = measured(rows, 'n1');
    assert.equal(repair.candidate.move.type, OperationType.REPLACE);
    assert.equal(repair.candidate.move.sourceReplicaId, `${partitionId}-r4`);
    assert.equal(repair.candidate.move.copySourceNodeId, 'n1');
    const withoutLeader = rows.map((row) => ({...row, [COLUMN.RAFT_ROLE]: RAFT_ROLE.FOLLOWER}));
    const waiting = measured(withoutLeader, 'n2');
    assert.equal(waiting.state, PLACEMENT_DEFICIT_STATE.WAITING);
    assert.equal(waiting.waiting.reason, PLACEMENT_WAITING_REASON.LEADER_UNKNOWN);
    const unresolvedRole = withoutLeader.map((row) => row[COLUMN.NODE_ID] === 'n2' ?
      {...row, [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE, [COLUMN.RAFT_ROLE]: null} : row).slice(0, 3);
    assert.equal(measured(unresolvedRole, 'n2').waiting.reason,
      PLACEMENT_WAITING_REASON.INCUMBENT_ROLE_UNAVAILABLE);
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
    membershipPublicationEpoch: null, positions: {nodesEpoch: 9},
    kSrc: PLACEMENT_COPY_CAPACITY.K_SRC, kTgt: PLACEMENT_COPY_CAPACITY.K_TGT});
  assert.equal(statement.kSrcForClass, kSrc - 1);
  assert.equal(statement.kTgt, PLACEMENT_COPY_CAPACITY.K_TGT);
});

test('the canonical statement refuses what its kind cannot carry', () => {
  const valid = buildPlacementAdmissionStatement({partitionId: 'config-p1',
    placementClass: PLACEMENT_CLASS.SYSTEM, repair: false,
    move: {type: OperationType.ADD, targetNodeId: 'n2', copySourceNodeId: 'n1'}},
  {sourceNodeId: 'n1', repairWaitingSourceNodeIds: new Set(), formationLatchEpoch: 3,
    membershipPublicationEpoch: 5, positions: {},
    kSrc: PLACEMENT_COPY_CAPACITY.K_SRC, kTgt: PLACEMENT_COPY_CAPACITY.K_TGT});
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
    membershipPublicationEpoch: null, positions: {},
    kSrc: PLACEMENT_COPY_CAPACITY.K_SRC, kTgt: PLACEMENT_COPY_CAPACITY.K_TGT}), /statement_invalid/u);
  assert.throws(() => buildPlacementAdmissionStatement({partitionId: 'config-p1',
    placementClass: PLACEMENT_CLASS.SYSTEM, repair: false,
    move: {type: OperationType.ADD, targetNodeId: 'n2', copySourceNodeId: 'n1'}},
  {sourceNodeId: 'n1', repairWaitingSourceNodeIds: new Set(), formationLatchEpoch: 3,
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

function createSimpleSystemCache(initialPartitions = [], initialServices = []) {
  const listeners = new Set();
  const rowsByTable = new Map([
    [TABLES.PARTITIONS, [...initialPartitions]],
    [TABLES.SERVICES, [...initialServices]],
    [TABLES.REPLICA_OPERATIONS, []],
  ]);
  return {
    getAll(tableName) {
      return [...(rowsByTable.get(tableName) || [])];
    },
    onCacheApplyChange(fn) {
      listeners.add(fn);
    },
    offCacheApplyChange(fn) {
      listeners.delete(fn);
    },
    applySystemTableChange(tableName, operation, row) {
      const list = rowsByTable.get(tableName) || [];
      if (tableName === TABLES.REPLICA_OPERATIONS) {
        const idx = list.findIndex((r) => r.operation_id === row.operation_id);
        if (operation === CDC_OPERATION.DELETE) {
          if (idx >= 0) list.splice(idx, 1);
        } else if (idx >= 0) {
          list[idx] = {...row};
        } else {
          list.push({...row});
        }
        rowsByTable.set(tableName, list);
      }
      for (const fn of listeners) fn(tableName, operation, row);
    },
  };
}

function createRealSqlLedgerHarness(cache, nodeId = 'n1') {
  const db = new Database(':memory:');
  db.exec(generateCreateTableSQL(REPLICA_OPERATIONS_SCHEMA));
  for (const indexSql of generateCreateIndexSQL(REPLICA_OPERATIONS_SCHEMA)) {
    db.exec(indexSql);
  }
  createCommittedStatementOutcomeTable(db);
  openParticipantTransactionStore(db);
  ensureCdcObligationLedger(db);
  let logIndex = 0;
  const resolvedWrites = new Map();
  const entryIdsSeen = [];
  const emitter = new EventEmitter();
  const service = Object.assign(emitter, {
    ...leadingLedgerStubFields(),
    partitionId: LEDGER_PARTITION_ID,
    tableName: REPLICA_OPERATIONS_SCHEMA.tableName,
    replicaId: `${LEDGER_PARTITION_ID}-r1`,
    nodeId,
    db,
    systemTableCache: cache,
    timeSource: {now: () => NOW_MS},
    hlcClock: {now: () => `${NOW_MS}:0:${nodeId}`},
    logger: {debug() {}, info() {}, warn() {}, error() {}},
    cdcPipelineMetrics: {increment() {}},
    isLeader: true,
    isShutdown: false,
    trackPendingCDCEvent() {},
    cdcDelivery: {driveCdcObligations: async () => {}},
    getCommittedEntryKey: (command) => committedStatementEntryKey(command),
    syncCDCGeneratorDependencies: () => ({
      buildEvent: ({type, tableName, data, whereClause, entryId, timestamp}) => ({
        state: PARTITION_CDC_EVENT_BUILD_STATE.BUILT,
        cdcEvent: {
          type,
          tableName,
          operation:
            type === PARTITION_SERVICE_OPERATION.INSERT ?
              CDC_OPERATION.INSERT :
              CDC_OPERATION.UPDATE,
          data,
          whereClause,
          entryId,
          timestamp,
        },
      }),
    }),
    resolveCommittedWrite: (entryId, answer) => {
      resolvedWrites.set(entryId, answer);
    },
    rejectCommittedWrite: (_entryId, error) => {
      throw error;
    },
  });

  const executeCommand = (type, {entryId, body}) => {
    entryIdsSeen.push(entryId);
    const command = buildPlacementCommand(service, {type, entryId, body});
    logIndex += 1;
    const afterCommit = [];
    const afterRollback = [];
    db.transaction(() => {
      applyPlacementCommand(service, {
        command,
        index: logIndex,
        term: 1,
        afterCommit: (fn) => afterCommit.push(fn),
        afterRollback: (fn) => afterRollback.push(fn),
      });
    })();
    for (const fn of afterCommit) fn();
    const answer = resolvedWrites.get(command.entryId);
    resolvedWrites.delete(command.entryId);
    return answer;
  };

  return {
    db,
    service,
    entryIdsSeen,
    admitPlacement: (payload) => executeCommand(PLACEMENT_ADMIT_TYPE, payload),
    releasePlacementHold: (payload) => executeCommand(PLACEMENT_RELEASE_HOLD_TYPE, payload),
  };
}

function seededPartitionRow(partitionId, leaderNodeId = 'n1') {
  return {
    [COLUMN.PARTITION_ID]: partitionId,
    [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    replica_count: 3,
    [COLUMN.LEADER_NODE_ID]: leaderNodeId,
  };
}

function seededServiceRows(partitionId, nodeId = 'n1') {
  return [1, 2, 3].map((idx) => ({
    [COLUMN.REPLICA_ID]: `${partitionId}-r${idx}`,
    [COLUMN.PARTITION_ID]: partitionId,
    [COLUMN.NODE_ID]: nodeId,
    [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    [COLUMN.RAFT_ROLE]: idx === 1 ? RAFT_ROLE.LEADER : RAFT_ROLE.FOLLOWER,
  }));
}

test('real ServeEligibilityOwner transitions through UNAVAILABLE -> UNDECLARED -> FORMING -> FORMED and drives ReplicaPlacementOwner over seeded partitions', async () => {
  const threeNodes = [nodeRow('n1', 'h1'), nodeRow('n2', 'h2'), nodeRow('n3', 'h3')];
  let currentPublications = [];
  let allowRead = false;
  const serveEligibilityOwner = new ServeEligibilityOwner({
    now: () => NOW_MS,
    readTimeoutMs: 5_000,
    setTimeout: () => 1,
    clearTimeout: () => {},
    isNodeLoadReady: () => true,
    readCommittedRows: async (tableName) => {
      if (!allowRead) return {success: false, error: 'not_ready_yet', rows: []};
      if (tableName === TABLES.NODES) return {success: true, rows: threeNodes};
      if (tableName === TABLES.CONTROL_PLANE_PUBLICATIONS) {
        return {success: true, rows: [...currentPublications]};
      }
      return {success: false, error: 'unexpected', rows: []};
    },
  });

  const partitions = [
    seededPartitionRow('sql_transactions-p1'),
    seededPartitionRow('nodes-p1'),
    seededPartitionRow('services-p1'),
    seededPartitionRow('tbl-orders-p1'),
  ];
  const services = [
    ...seededServiceRows('sql_transactions-p1'),
    ...seededServiceRows('nodes-p1'),
    ...seededServiceRows('services-p1'),
    ...seededServiceRows('tbl-orders-p1'),
  ];
  const cache = createSimpleSystemCache(partitions, services);
  const ledger = createRealSqlLedgerHarness(cache, 'n1');
  try {
    const owner = createReplicaPlacementOwner({
      nodeId: 'n1',
      ledgerPartitionService: ledger.service,
      nodeAuthority: serveEligibilityOwner,
      systemTableCache: cache,
      now: () => NOW_MS,
      logger: ledger.service.logger,
      admitPlacement: ledger.admitPlacement,
      releasePlacementHold: ledger.releasePlacementHold,
    });

    // 1. UNAVAILABLE: before first committed read succeeds
    assert.equal(
      serveEligibilityOwner.answerCommittedNodes().formation.state,
      PLACEMENT_FORMATION_STATE.UNAVAILABLE,
    );
    owner.setLeader(true);
    await owner.awaitCurrentWorkIdle();
    assert.equal(
      owner.lastPassSnapshot.reason,
      PLACEMENT_WAITING_REASON.NODE_AUTHORITY_UNAVAILABLE,
    );
    assert.deepEqual(owner.lastPassSnapshot.admitted, []);

    // 2. UNDECLARED: membership published, no cluster_formation row yet
    allowRead = true;
    const membership1 = {
      publication_id: 'cluster_membership-1',
      publication_kind: 'cluster_membership',
      publication_epoch: 1,
      publisher_node_id: 'n1',
      published_active_node_ids: JSON.stringify(['n1', 'n2', 'n3']),
      required_ack_node_ids: JSON.stringify(['n1', 'n2', 'n3']),
      acknowledged_node_ids: JSON.stringify(['n1', 'n2', 'n3']),
      priority_partition_summary: null,
      status: 'PUBLISHED',
      created_at: NOW_MS,
      updated_at: NOW_MS,
    };
    currentPublications = [membership1];
    await serveEligibilityOwner.readServeEligibility();
    await new Promise((resolve) => setImmediate(resolve));
    await owner.awaitCurrentWorkIdle();
    assert.equal(
      serveEligibilityOwner.answerCommittedNodes().formation.state,
      PLACEMENT_FORMATION_STATE.UNDECLARED,
    );
    // Only priority class (sql_transactions-p1) is admitted while UNDECLARED; classes 3-5 wait:
    const rowsAfterUndeclared = ledger.db
      .prepare('SELECT partition_id FROM replica_operations ORDER BY operation_id')
      .all();
    assert.deepEqual(
      rowsAfterUndeclared.map((r) => r.partition_id),
      ['sql_transactions-p1'],
    );

    // 3. FORMING: cluster_formation row is DECLARED
    const declaredFormationRow = {
      publication_id: 'cluster_formation',
      publication_kind: 'cluster_formation',
      publication_epoch: 0,
      publisher_node_id: 'n1',
      status: 'DECLARED',
      created_at: NOW_MS,
      updated_at: NOW_MS,
      formation_record: JSON.stringify({
        version: 1,
        status: 'DECLARED',
        clusterId: 'cluster-placement-test',
        declaredHostCount: 3,
        declaredByNodeId: 'n1',
        declaredAt: NOW_MS,
        formedAt: null,
        formedByNodeId: null,
        formedPublicationEpoch: null,
        formedHostIds: null,
        formedReadyNodeIds: null,
        priorityPartitionVoters: null,
      }),
    };
    const membership2 = {
      ...membership1,
      publication_id: 'cluster_membership-2',
      publication_epoch: 2,
    };
    currentPublications = [membership2, declaredFormationRow];
    serveEligibilityOwner.noteSourceChange(
      TABLES.CONTROL_PLANE_PUBLICATIONS,
      declaredFormationRow,
    );
    await serveEligibilityOwner.readServeEligibility();
    await new Promise((resolve) => setImmediate(resolve));
    await owner.awaitCurrentWorkIdle();
    assert.equal(
      serveEligibilityOwner.answerCommittedNodes().formation.state,
      PLACEMENT_FORMATION_STATE.FORMING,
    );
    assert.equal(
      ledger.db.prepare('SELECT COUNT(*) AS c FROM replica_operations').get().c,
      1,
    );

    // Move the priority operation out of copy phase (to ACTIVE removal phase)
    // so sql_transactions-p1 stays busy while freeing copy-source slots on n1:
    ledger.db.prepare(
      'UPDATE replica_operations SET workflow_step = ?, status = ?',
    ).run(WORKFLOW_STEP.ACTIVE, SERVICE_STATUS.ACTIVE);

    // 4. FORMED: cluster_formation row latched to FORMED at epoch 3
    const formedFormationRow = {
      ...declaredFormationRow,
      publication_epoch: 3,
      status: 'FORMED',
      formation_record: JSON.stringify({
        version: 1,
        status: 'FORMED',
        clusterId: 'cluster-placement-test',
        declaredHostCount: 3,
        declaredByNodeId: 'n1',
        declaredAt: NOW_MS,
        formedAt: NOW_MS + 10,
        formedByNodeId: 'n1',
        formedPublicationEpoch: 3,
        formedHostIds: ['h1', 'h2', 'h3'],
        formedReadyNodeIds: ['n1', 'n2', 'n3'],
        priorityPartitionVoters: {},
      }),
    };
    const membership3 = {
      ...membership2,
      publication_id: 'cluster_membership-3',
      publication_epoch: 3,
    };
    currentPublications = [membership3, formedFormationRow];
    serveEligibilityOwner.noteSourceChange(
      TABLES.CONTROL_PLANE_PUBLICATIONS,
      formedFormationRow,
    );
    await serveEligibilityOwner.readServeEligibility();
    await new Promise((resolve) => setImmediate(resolve));
    await owner.awaitCurrentWorkIdle();
    assert.equal(
      serveEligibilityOwner.answerCommittedNodes().formation.state,
      PLACEMENT_FORMATION_STATE.FORMED,
    );
    assert.equal(
      serveEligibilityOwner.answerCommittedNodes().formation.latchEpoch,
      3,
    );
    const allRows = ledger.db
      .prepare('SELECT partition_id FROM replica_operations ORDER BY rowid')
      .all()
      .map((r) => r.partition_id);
    // Admits nodes-p1, services-p1, and tbl-orders-p1 in priority order once FORMED:
    assert.deepEqual(allRows, [
      'sql_transactions-p1',
      'nodes-p1',
      'services-p1',
      'tbl-orders-p1',
    ]);
    owner.shutdown();
  } finally {
    serveEligibilityOwner.shutdown();
    ledger.db.close();
  }
});

test('ReplicaPlacementOwner reuses entryId on OUTCOME_UNKNOWN retry, mints non-colliding entryIds across owner reconstruction, and consults storageAccountingService', async () => {
  const threeNodes = [nodeRow('n1', 'h1'), nodeRow('n2', 'h2'), nodeRow('n3', 'h3')];
  const nodeAuthority = {
    subscribe: () => () => {},
    scheduleRefresh: () => {},
    answerCommittedNodes: () => ({
      state: 'ready',
      epoch: {publicationEpoch: 5},
      nodeRows: threeNodes,
      formation: {state: PLACEMENT_FORMATION_STATE.FORMED, latchEpoch: 5},
    }),
  };
  const cache = createSimpleSystemCache(
    [seededPartitionRow('tables-p1')],
    seededServiceRows('tables-p1'),
  );
  const ledger = createRealSqlLedgerHarness(cache, 'n1');
  try {
    let unknownPhase = 'before_commit';
    let lastStatement = null;
    const owner1 = createReplicaPlacementOwner({
      nodeId: 'n1',
      ledgerPartitionService: ledger.service,
      nodeAuthority,
      systemTableCache: cache,
      now: () => NOW_MS,
      logger: ledger.service.logger,
      admitPlacement: async (payload) => {
        lastStatement = payload.body;
        if (unknownPhase === 'before_commit') {
          unknownPhase = 'commit_then_lose_reply';
          ledger.entryIdsSeen.push(payload.entryId);
          return {
            success: false,
            failureCode: PARTITION_WRITE_LEADERSHIP_REFUSAL.OUTCOME_UNKNOWN,
          };
        }
        const answer = ledger.admitPlacement(payload);
        if (unknownPhase === 'commit_then_lose_reply') {
          unknownPhase = 'normal';
          return {
            success: false,
            failureCode: PARTITION_WRITE_LEADERSHIP_REFUSAL.OUTCOME_UNKNOWN,
          };
        }
        return answer;
      },
      releasePlacementHold: ledger.releasePlacementHold,
    });

    owner1.setLeader(true);
    await owner1.awaitCurrentWorkIdle();
    assert.equal(ledger.entryIdsSeen.length, 1);
    const firstAttemptEntryId = ledger.entryIdsSeen[0];
    assert.equal(
      ledger.db.prepare('SELECT COUNT(*) AS c FROM replica_operations').get().c,
      0,
    );

    // 1. Retry pass after pre-commit OUTCOME_UNKNOWN reuses the exact same entryId,
    // commits the row in SQLite, and loses the reply (commit_then_lose_reply):
    owner1.notify(PLACEMENT_TRIGGER.LEDGER_COMMIT);
    await owner1.awaitCurrentWorkIdle();
    assert.equal(ledger.entryIdsSeen.length, 2);
    assert.equal(ledger.entryIdsSeen[1], firstAttemptEntryId);
    assert.equal(
      ledger.db.prepare('SELECT COUNT(*) AS c FROM replica_operations').get().c,
      1,
    );

    // 2. Direct retry of the uncertain statement after commit + lost reply reuses the
    // same entryId and replays the settled outcome without inserting a second row:
    const replayAnswer = await owner1.submitAdmission(lastStatement);
    assert.equal(replayAnswer.committed, true);
    assert.equal(ledger.entryIdsSeen.length, 3);
    assert.equal(ledger.entryIdsSeen[2], firstAttemptEntryId);
    assert.equal(
      ledger.db.prepare('SELECT COUNT(*) AS c FROM replica_operations').get().c,
      1,
    );
    owner1.shutdown();

    // Mark the first operation completed so tables-p1 needs its second spread move:
    ledger.db.prepare(
      'UPDATE replica_operations SET workflow_step = ?, status = ?, completed_at = ?',
    ).run(WORKFLOW_STEP.REMOVED, SERVICE_STATUS.ACTIVE, NOW_MS);

    // Reconstruct a brand-new ReplicaPlacementOwner on the same node ('n1') over the same
    // durable SQLite ledger DB (which retains the settled _partition_statement_outcomes):
    // Also attach storageAccountingService marking 'n2' as EXHAUSTED so 'n3' must be chosen!
    const storageAccountingService = {
      subscribeCapacitySemanticChanges: () => () => {},
      getCapacitySemanticIdentity: (nodeId) => ({
        generation: 1,
        projection: {
          capacity: {
            nodeId,
            budgetBytes: 1_000_000,
            pressureState:
              nodeId === 'n2' ? PRESSURE_STATE.EXHAUSTED : PRESSURE_STATE.NORMAL,
          },
        },
      }),
    };
    const owner2 = createReplicaPlacementOwner({
      nodeId: 'n1',
      ledgerPartitionService: ledger.service,
      nodeAuthority,
      systemTableCache: cache,
      storageAccountingService,
      now: () => NOW_MS,
      logger: ledger.service.logger,
      admitPlacement: ledger.admitPlacement,
      releasePlacementHold: ledger.releasePlacementHold,
    });
    owner2.setLeader(true);
    await owner2.awaitCurrentWorkIdle();

    assert.equal(ledger.entryIdsSeen.length, 4);
    assert.notEqual(ledger.entryIdsSeen[3], firstAttemptEntryId);
    const rows = ledger.db
      .prepare('SELECT operation_id, target_node_id FROM replica_operations ORDER BY operation_id')
      .all();
    assert.equal(rows.length, 2);
    // owner2 excluded storage-exhausted 'n2' and admitted the new move to 'n3':
    assert.equal(rows[1].target_node_id, 'n3');
    owner2.shutdown();
  } finally {
    ledger.db.close();
  }
});

test('P3 & P5: createReplicaPlacementOwner validates required and optional collaborators before side effects, and statement builders deep-clone caller-owned inputs', () => {
  const cache = createSimpleSystemCache();
  const ledger = createRealSqlLedgerHarness(cache, 'n1');
  try {
    const validOptions = {
      nodeId: 'n1',
      ledgerPartitionService: ledger.service,
      nodeAuthority: {
        answerCommittedNodes: () => ({state: 'unavailable', reason: 'init', nodeRows: []}),
        scheduleRefresh: () => {},
        subscribe: () => () => {},
      },
      systemTableCache: cache,
      now: () => NOW_MS,
      logger: ledger.service.logger,
    };
    const invalidCases = [
      [{...validOptions, nodeId: ''}, 'nodeId'],
      [{...validOptions, ledgerPartitionService: null}, 'ledgerPartitionService'],
      [
        {
          ...validOptions,
          ledgerPartitionService: {...ledger.service, partitionId: 'tables-p1'},
        },
        'ledgerPartitionService',
      ],
      [{...validOptions, nodeAuthority: {answerCommittedNodes: () => ({})}}, 'nodeAuthority'],
      [{...validOptions, systemTableCache: {getAll: () => []}}, 'systemTableCache'],
      [{...validOptions, now: null}, 'now'],
      [{...validOptions, logger: {info() {}}}, 'logger'],
      [{...validOptions, workflowOwner: {}}, 'workflowOwner'],
      [{...validOptions, storageAccountingService: {}}, 'storageAccountingService'],
      [{...validOptions, setIntervalFn: () => 1}, 'resyncTimer'],
    ];
    for (const [badOptions, expectedCollaborator] of invalidCases) {
      assert.throws(
        () => createReplicaPlacementOwner(badOptions),
        (error) =>
          error.code === REPLICA_PLACEMENT_OWNER_COLLABORATOR_INVALID &&
          error.collaborator === expectedCollaborator,
      );
    }

    // P5: Mutating caller-owned nested inputs after building a statement or command
    // cannot mutate the frozen statement or canonical command bytes:
    const mutableCandidate = {
      partitionId: 'config-p1',
      placementClass: PLACEMENT_CLASS.SYSTEM,
      repair: false,
      move: {type: OperationType.ADD, targetNodeId: 'n2', copySourceNodeId: 'n1'},
    };
    const mutableContext = {
      sourceNodeId: 'n1',
      repairWaitingSourceNodeIds: new Set(['n1']),
      formationLatchEpoch: 3,
      membershipPublicationEpoch: null,
      positions: {nodesEpoch: 9},
      kSrc: PLACEMENT_COPY_CAPACITY.K_SRC,
      kTgt: PLACEMENT_COPY_CAPACITY.K_TGT,
    };
    const built = buildPlacementAdmissionStatement(mutableCandidate, mutableContext);
    const mutableBody = structuredClone(built);
    const cmd = buildPlacementCommand(ledger.service, {
      type: PLACEMENT_ADMIT_TYPE,
      entryId: 'p5-immut-1',
      body: mutableBody,
    });
    const originalBodyText = cmd.bodyText;
    mutableCandidate.move.targetNodeId = 'n99';
    mutableContext.positions.nodesEpoch = 999;
    mutableBody.moves[0].targetNodeId = 'n99';
    assert.equal(built.moves[0].targetNodeId, 'n2');
    assert.equal(built.positions.nodesEpoch, 9);
    assert.equal(cmd.body.moves[0].targetNodeId, 'n2');
    assert.equal(cmd.bodyText, originalBodyText);
  } finally {
    ledger.db.close();
  }
});

test('control-plane attachment admits a scoped voter removal only with its workflow owner',
  () => runScopedRemovalPlacementAttachmentWitness({
    nodeRow, createSimpleSystemCache, seededPartitionRow, seededServiceRows,
  }));

test('P3 & P4 (Findings 3a, 3b, 4): automatic production attachment via PartitionService.maybeInitializeRebalancer, late committed REFUSED recovery on LEADERSHIP_START, and reconstructed owner replay of unsettled attempts from durable state', async () => {
  resetFixtureSingletons();
  try {
    const threeNodes = [nodeRow('n1', 'h1'), nodeRow('n2', 'h2'), nodeRow('n3', 'h3')];
    const nodeAuthority = {
      subscribe: () => () => {},
      scheduleRefresh: () => {},
      answerCommittedNodes: () => ({
        state: 'ready',
        epoch: {publicationEpoch: 8},
        nodeRows: threeNodes,
        formation: {state: PLACEMENT_FORMATION_STATE.FORMED, latchEpoch: 8},
      }),
    };
    const cache = createSimpleSystemCache(
      [seededPartitionRow('tables-p1')],
      [...seededServiceRows('tables-p1')],
    );

    await onLedgerLeader(async (leader, proposed) => {
      // 1. Finding 4: Production attachment via rebalanceCoordinator + leader.maybeInitializeRebalancer()
      // (test never calls ControlPlaneSetup.attachReplicaPlacementOwner directly):
      const coordinator = {
        nodeId: 'n1',
        systemTableCache: cache,
        workflowOwner: null,
        storageAccountingService: null,
        attachLedgerReplicaPlacementOwner(service) {
          return ControlPlaneSetup.attachReplicaPlacementOwner({
            nodeId: this.nodeId,
            ledgerPartitionService: service,
            nodeAuthority,
            workflowOwner: this.workflowOwner,
            systemTableCache: this.systemTableCache,
            storageAccountingService: this.storageAccountingService,
            now: () => NOW_MS,
            logger: service.logger,
            ...INERT_RESYNC_TIMER,
          });
        },
      };
      // Intercept the first proposal so it records the proposed command and rejects
      // (producing OUTCOME_UNKNOWN while remaining UNSETTLED in _partition_statement_outcomes):
      leader.controllablePort.setProposeHandler(async (entry) => {
        proposed.push(entry);
        throw new Error('simulated proposal drop');
      });
      leader.setRebalanceCoordinator(coordinator);
      const attachment1 = leader.replicaPlacementOwnerAttachment;
      assert.ok(attachment1?.owner, 'PartitionService automatically attached ReplicaPlacementOwner');
      assert.equal(leader.rebalancerLeadershipSink, attachment1.owner);
      await attachment1.owner.awaitCurrentWorkIdle();
      assert.equal(proposed.length, 1);
      const firstAttemptCmd = proposed[0];
      const firstEntryId = firstAttemptCmd.entryId;

      // 2. Finding 3b: Owner 1 detaches/shuts down while firstEntryId is still UNSETTLED in _partition_statement_outcomes.
      // Reconstruct a fresh Owner 2 on the same SQLite database; it must recover firstEntryId and body from
      // _placement_owner_unresolved_attempts and replay the exact same entryId and canonical bodyText!
      attachment1.detach();
      leader.replicaPlacementOwnerAttachment = null;

      leader.maybeInitializeRebalancer();
      const attachment2 = leader.replicaPlacementOwnerAttachment;
      assert.ok(attachment2?.owner && attachment2.owner !== attachment1.owner);
      await attachment2.owner.awaitCurrentWorkIdle();
      assert.equal(proposed.length, 2);
      const replayedCmd = proposed[1];
      assert.equal(replayedCmd.entryId, firstEntryId);
      assert.equal(replayedCmd.bodyText, firstAttemptCmd.bodyText);

      // 3. Finding 3a: Owner 2 loses leadership while firstEntryId is still uncertain.
      // While Owner 2 is inactive, firstEntryId commits in the Raft log as REFUSED
      // (because an external/busy row temporarily occupied tables-p1), and then that blocking
      // condition clears before Owner 2 regains leadership.
      // When Owner 2 regains leadership, its LEADERSHIP_START pass must reconcile the settled
      // REFUSED outcome from _partition_statement_outcomes, allocate a fresh entryId, and admit
      // tables-p1 in that same LEADERSHIP_START pass without any extra wake or timer!
      leader.isLeader = false;
      leader.updateRebalancerLeadership();
      assert.equal(attachment2.owner.isLeader, false);

      // Plant a temporary busy row on tables-p1 so firstAttemptCmd commits as REFUSED (PARTITION_BUSY),
      // then mark that temporary row terminal (FAILED) so the blocking condition is cleared:
      leader.db.prepare(
        `INSERT INTO replica_operations (
          operation_id, type, partition_id, replica_id, source_node_id, target_node_id,
          status, workflow_step, created_at, updated_at, completed_at, steps_history,
          entity_type, entity_id
        ) VALUES (?, 'ADD', 'tables-p1', 'temp-r9', 'n1', 'n2', 'pending', 'PENDING', 1, 1, NULL, '[]', 'partition', 'tables-p1')`,
      ).run('temp-busy-op');
      assert.equal(applyCommitted(leader, firstAttemptCmd), null);
      leader.db.prepare(
        'UPDATE replica_operations SET status = \'failed\', workflow_step = \'FAILED\', ' +
        'completed_at = 2 WHERE operation_id = \'temp-busy-op\'',
      ).run();

      // Now proposals commit synchronously when Owner 2 regains leadership:
      leader.controllablePort.setProposeHandler(async (entry) => {
        proposed.push(entry);
        assert.equal(applyCommitted(leader, entry), null);
      });
      leader.isLeader = true;
      leader.updateRebalancerLeadership();
      await attachment2.owner.awaitCurrentWorkIdle();

      assert.equal(proposed.length, 3);
      const freshCmd = proposed[2];
      assert.notEqual(freshCmd.entryId, firstEntryId);
      const admittedRows = ledgerRows(leader).filter((r) => r.operation_id !== 'temp-busy-op');
      assert.equal(admittedRows.length, 1);
      assert.equal(admittedRows[0].partition_id, 'tables-p1');
      attachment2.detach();
    }, {systemTableCache: cache});
  } finally {
    clearFixtureSingletons();
  }
});

test('WP-F1 & WP-F2: resolveVoterTarget, 1-voter founding at H=1, 2-host learner window at H=2, 3-host odd-voter growth (LEARNER_DEFICIT -> GROWTH_PROMOTE) at H=3, and DEAD_LEARNER repair', () => {
  assert.equal(resolveVoterTarget(3, 0), 0);
  assert.equal(resolveVoterTarget(3, 1), 1);
  assert.equal(resolveVoterTarget(3, 2), 1);
  assert.equal(resolveVoterTarget(3, 3), 3);
  assert.equal(resolveVoterTarget(5, 4), 3);
  assert.equal(resolveVoterTarget(5, 5), 5);

  const oneHost = [nodeRow('n1', 'h1')];
  const twoHosts = [nodeRow('n1', 'h1'), nodeRow('n2', 'h2')];
  const threeHosts = [nodeRow('n1', 'h1'), nodeRow('n2', 'h2'), nodeRow('n3', 'h3')];

  // H = 1: 1 voter on seed is satisfied (V(3, 1) = 1 -> NONE):
  const atH1 = evaluatePartitionDeficit({
    partitionId: 'config-p1',
    replicationFactor: 3,
    replicaRows: [{replicaId: 'config-p1-r1', nodeId: 'n1', isLeader: true, failed: false,
      operationalVoter: true}],
    eligibility: buildPlacementNodeEligibility({nodeRows: oneHost, nowMs: NOW_MS}),
  });
  assert.equal(atH1.state, PLACEMENT_DEFICIT_STATE.NONE);

  // H = 2 with 0 learners: LEARNER_DEFICIT ADD onto n2:
  const atH2NoLearner = evaluatePartitionDeficit({
    partitionId: 'config-p1',
    replicationFactor: 3,
    replicaRows: [{replicaId: 'config-p1-r1', nodeId: 'n1', isLeader: true, failed: false,
      operationalVoter: true}],
    eligibility: buildPlacementNodeEligibility({nodeRows: twoHosts, nowMs: NOW_MS}),
  });
  assert.equal(atH2NoLearner.state, PLACEMENT_DEFICIT_STATE.CANDIDATE);
  assert.equal(atH2NoLearner.candidate.deficitKind, PLACEMENT_DEFICIT_KIND.LEARNER_DEFICIT);
  assert.equal(atH2NoLearner.candidate.move.type, OperationType.ADD);
  assert.equal(atH2NoLearner.candidate.move.targetNodeId, 'n2');

  // H = 2 with 1 caught-up learner on n2: V(3, 2) = 1, distinctReplicaHostCount = 2 -> NONE (never promotes to 2 voters!):
  const atH2WithLearner = evaluatePartitionDeficit({
    partitionId: 'config-p1',
    replicationFactor: 3,
    replicaRows: [
      {replicaId: 'config-p1-r1', nodeId: 'n1', isLeader: true, failed: false,
        operationalVoter: true},
      {replicaId: 'config-p1-r2', nodeId: 'n2', isLearner: true, caughtUp: true, failed: false},
    ],
    eligibility: buildPlacementNodeEligibility({nodeRows: twoHosts, nowMs: NOW_MS}),
  });
  assert.equal(atH2WithLearner.state, PLACEMENT_DEFICIT_STATE.NONE);

  // H = 3 with 1 learner on n2: LEARNER_DEFICIT ADD onto n3:
  const atH3OneLearner = evaluatePartitionDeficit({
    partitionId: 'config-p1',
    replicationFactor: 3,
    replicaRows: [
      {replicaId: 'config-p1-r1', nodeId: 'n1', isLeader: true, failed: false,
        operationalVoter: true},
      {replicaId: 'config-p1-r2', nodeId: 'n2', isLearner: true, caughtUp: true, failed: false},
    ],
    eligibility: buildPlacementNodeEligibility({nodeRows: threeHosts, nowMs: NOW_MS}),
  });
  assert.equal(atH3OneLearner.state, PLACEMENT_DEFICIT_STATE.CANDIDATE);
  assert.equal(atH3OneLearner.candidate.deficitKind, PLACEMENT_DEFICIT_KIND.LEARNER_DEFICIT);
  assert.equal(atH3OneLearner.candidate.move.type, OperationType.ADD);
  assert.equal(atH3OneLearner.candidate.move.targetNodeId, 'n3');

  // H = 3 with 2 learners where the second is still catching up (caughtUp: false): NONE until caught up:
  const atH3SecondSyncing = evaluatePartitionDeficit({
    partitionId: 'config-p1',
    replicationFactor: 3,
    replicaRows: [
      {replicaId: 'config-p1-r1', nodeId: 'n1', isLeader: true, failed: false,
        operationalVoter: true},
      {replicaId: 'config-p1-r2', nodeId: 'n2', isLearner: true, caughtUp: true, failed: false},
      {replicaId: 'config-p1-r3', nodeId: 'n3', isLearner: true, caughtUp: false, failed: false},
    ],
    eligibility: buildPlacementNodeEligibility({nodeRows: threeHosts, nowMs: NOW_MS}),
  });
  assert.equal(atH3SecondSyncing.state, PLACEMENT_DEFICIT_STATE.NONE);

  // H = 3 with 2 caught-up learners on n2 and n3: PROMOTION_READY GROWTH_PROMOTE [r2, r3]:
  const atH3TwoLearners = evaluatePartitionDeficit({
    partitionId: 'config-p1',
    replicationFactor: 3,
    replicaRows: [
      {replicaId: 'config-p1-r1', nodeId: 'n1', isLeader: true, failed: false,
        operationalVoter: true},
      {replicaId: 'config-p1-r2', nodeId: 'n2', isLearner: true, caughtUp: true, failed: false},
      {replicaId: 'config-p1-r3', nodeId: 'n3', isLearner: true, caughtUp: true, failed: false},
    ],
    eligibility: buildPlacementNodeEligibility({nodeRows: threeHosts, nowMs: NOW_MS}),
  });
  assert.equal(atH3TwoLearners.state, PLACEMENT_DEFICIT_STATE.CANDIDATE);
  assert.equal(atH3TwoLearners.candidate.deficitKind, PLACEMENT_DEFICIT_KIND.PROMOTION_READY);
  assert.deepEqual(atH3TwoLearners.candidate.move, {
    type: PLACEMENT_MOVE_TYPE.GROWTH_PROMOTE,
    targetNodeId: 'n1',
    replicaId: 'config-p1-r2',
    sourceReplicaId: 'config-p1-r3',
    copySourceNodeId: null,
    promoteReplicaIds: ['config-p1-r2', 'config-p1-r3'],
  });

  // Lease expiry preserves the existing learner and its host reservation.
  const expiredN2 = [
    nodeRow('n1', 'h1'),
    nodeRow('n2', 'h2', {leaseExpiresAt: NOW_MS - 1}),
    nodeRow('n3', 'h3'),
  ];
  const retainedLearnerResult = evaluatePartitionDeficit({
    partitionId: 'config-p1',
    replicationFactor: 3,
    replicaRows: [
      {replicaId: 'config-p1-r1', nodeId: 'n1', isLeader: true, failed: false,
        operationalVoter: true},
      {replicaId: 'config-p1-r2', nodeId: 'n2', isLearner: true, caughtUp: true, failed: false},
    ],
    eligibility: buildPlacementNodeEligibility({nodeRows: expiredN2, nowMs: NOW_MS}),
  });
  assert.equal(retainedLearnerResult.state, PLACEMENT_DEFICIT_STATE.NONE);

  // Failed pre-voter create row (status: 'failed', raft_role: null) and
  // partition_cleanup tombstone are excluded from buildPartitionReplicaRows:
  const rowsWithFailedCreate = buildPartitionReplicaRows([
    {[COLUMN.REPLICA_ID]: 'replica_operations-p1-r1', [COLUMN.NODE_ID]: 'n1',
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE, [COLUMN.RAFT_ROLE]: RAFT_ROLE.LEADER},
    {[COLUMN.REPLICA_ID]: 'replace-replica-learner-n2', [COLUMN.NODE_ID]: 'n2',
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE, [COLUMN.RAFT_ROLE]: RAFT_ROLE.LEARNER},
    {[COLUMN.REPLICA_ID]: 'replace-replica-failed-create-n3', [COLUMN.NODE_ID]: 'n3',
      [COLUMN.STATUS]: 'failed', [COLUMN.RAFT_ROLE]: null, previous_state: 'pending'},
    {[COLUMN.REPLICA_ID]: 'replace-replica-cleanup-tombstone-n3', [COLUMN.NODE_ID]: 'n3',
      service_type: 'partition_cleanup', [COLUMN.STATUS]: 'owned', [COLUMN.RAFT_ROLE]: null},
  ], 'n1', false);
  const afterFailedCreate = evaluatePartitionDeficit({
    partitionId: 'replica_operations-p1',
    replicationFactor: 3,
    replicaRows: rowsWithFailedCreate,
    eligibility: buildPlacementNodeEligibility({nodeRows: threeHosts, nowMs: NOW_MS}),
  });
  assert.equal(afterFailedCreate.state, PLACEMENT_DEFICIT_STATE.CANDIDATE);
  assert.equal(afterFailedCreate.candidate.deficitKind, PLACEMENT_DEFICIT_KIND.LEARNER_DEFICIT);
  assert.equal(afterFailedCreate.candidate.move.type, OperationType.ADD);
  assert.equal(afterFailedCreate.candidate.move.targetNodeId, 'n3');

  // Finding 4 regression witness: a committed voter that failed while campaigning
  // (status: 'failed', raft_role: 'candidate', previous_state: 'active', cleanup_token: null)
  // is retained as a failed voter row and produces a FAILED_OR_DEAD REPLACE:
  const rowsWithFailedCandidateVoter = buildPartitionReplicaRows([
    {[COLUMN.REPLICA_ID]: 'config-p1-r1', [COLUMN.NODE_ID]: 'n1',
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE, [COLUMN.RAFT_ROLE]: RAFT_ROLE.LEADER},
    {[COLUMN.REPLICA_ID]: 'config-p1-r2', [COLUMN.NODE_ID]: 'n2',
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE, [COLUMN.RAFT_ROLE]: RAFT_ROLE.FOLLOWER},
    {[COLUMN.REPLICA_ID]: 'config-p1-r3', [COLUMN.NODE_ID]: 'n3',
      [COLUMN.STATUS]: 'failed', [COLUMN.RAFT_ROLE]: RAFT_ROLE.CANDIDATE,
      previous_state: 'active', cleanup_token: null},
  ], 'n1', false);
  const failedCandidateEval = evaluatePartitionDeficit({
    partitionId: 'config-p1',
    replicationFactor: 3,
    replicaRows: rowsWithFailedCandidateVoter,
    eligibility: buildPlacementNodeEligibility({nodeRows: threeHosts, nowMs: NOW_MS}),
  });
  assert.equal(failedCandidateEval.state, PLACEMENT_DEFICIT_STATE.CANDIDATE);
  assert.equal(failedCandidateEval.candidate.deficitKind, PLACEMENT_DEFICIT_KIND.FAILED_OR_DEAD);
  assert.equal(failedCandidateEval.candidate.repair, true);
  assert.deepEqual(failedCandidateEval.candidate.move, {
    type: OperationType.REPLACE,
    targetNodeId: 'n3',
    replicaId: null,
    sourceReplicaId: 'config-p1-r3',
    copySourceNodeId: 'n1',
  });
});

test('WP-F1 & WP-F2 end-to-end: ReplicaPlacementOwner drives 1-voter founding -> ADD learner n2 -> ADD learner n3 -> GROWTH_PROMOTE and executes PartitionService & ReplicaHandler membership administration', async () => {
  resetFixtureSingletons();
  try {
    const threeNodes = [nodeRow('n1', 'h1'), nodeRow('n2', 'h2'), nodeRow('n3', 'h3')];
    const nodeAuthority = {
      subscribe: () => () => {},
      scheduleRefresh: () => {},
      answerCommittedNodes: () => ({
        state: 'ready',
        epoch: {publicationEpoch: 9},
        nodeRows: threeNodes,
        formation: {state: PLACEMENT_FORMATION_STATE.FORMED, latchEpoch: 9},
      }),
    };
    const singleVoterServices = [{
      [COLUMN.REPLICA_ID]: 'tables-p1-r1',
      [COLUMN.PARTITION_ID]: 'tables-p1',
      [COLUMN.NODE_ID]: 'n1',
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.RAFT_ROLE]: RAFT_ROLE.LEADER,
    }];
    const cache = createSimpleSystemCache([seededPartitionRow('tables-p1')], singleVoterServices);
    const ledger = createRealSqlLedgerHarness(cache, 'n1');
    try {
      const owner = createReplicaPlacementOwner({
        nodeId: 'n1',
        ledgerPartitionService: ledger.service,
        nodeAuthority,
        systemTableCache: cache,
        now: () => NOW_MS,
        logger: ledger.service.logger,
        admitPlacement: ledger.admitPlacement,
        releasePlacementHold: ledger.releasePlacementHold,
      });
      owner.setLeader(true);
      await owner.awaitCurrentWorkIdle();
      let ops = ledger.db.prepare('SELECT * FROM replica_operations ORDER BY operation_id').all();
      assert.equal(ops.length, 1);
      assert.equal(ops[0].type, OperationType.ADD);
      assert.equal(ops[0].target_node_id, 'n2');

      const firstLearnerId = ops[0].replica_id;
      ledger.db.prepare(
        'UPDATE replica_operations SET workflow_step = ?, status = ?, completed_at = ? WHERE operation_id = ?',
      ).run(WORKFLOW_STEP.ACTIVE, SERVICE_STATUS.ACTIVE, NOW_MS, ops[0].operation_id);
      singleVoterServices.push({
        [COLUMN.REPLICA_ID]: firstLearnerId,
        [COLUMN.PARTITION_ID]: 'tables-p1',
        [COLUMN.NODE_ID]: 'n2',
        [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
        [COLUMN.RAFT_ROLE]: RAFT_ROLE.LEARNER,
      });
      cache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.INSERT, singleVoterServices[1]);
      cache.getAll(TABLES.SERVICES).push(singleVoterServices[1]);
      const originalGetAll = cache.getAll.bind(cache);
      cache.getAll = (tableName) =>
        tableName === TABLES.SERVICES ? [...singleVoterServices] : originalGetAll(tableName);

      owner.notify(PLACEMENT_TRIGGER.LEDGER_COMMIT);
      await owner.awaitCurrentWorkIdle();
      ops = ledger.db.prepare('SELECT * FROM replica_operations ORDER BY operation_id').all();
      assert.equal(ops.length, 2);
      assert.equal(ops[1].type, OperationType.ADD);
      assert.equal(ops[1].target_node_id, 'n3');

      const secondLearnerId = ops[1].replica_id;
      ledger.db.prepare(
        'UPDATE replica_operations SET workflow_step = ?, status = ?, completed_at = ? WHERE operation_id = ?',
      ).run(WORKFLOW_STEP.ACTIVE, SERVICE_STATUS.ACTIVE, NOW_MS, ops[1].operation_id);
      singleVoterServices.push({
        [COLUMN.REPLICA_ID]: secondLearnerId,
        [COLUMN.PARTITION_ID]: 'tables-p1',
        [COLUMN.NODE_ID]: 'n3',
        [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
        [COLUMN.RAFT_ROLE]: RAFT_ROLE.LEARNER,
      });

      owner.notify(PLACEMENT_TRIGGER.LEDGER_COMMIT);
      await owner.awaitCurrentWorkIdle();
      ops = ledger.db.prepare('SELECT * FROM replica_operations ORDER BY operation_id').all();
      assert.equal(ops.length, 3);
      assert.equal(ops[2].type, PLACEMENT_MOVE_TYPE.GROWTH_PROMOTE);
      assert.equal(ops[2].target_node_id, 'n1');
      assert.equal(ops[2].replica_id, firstLearnerId);
      assert.equal(ops[2].source_replica_id, secondLearnerId);
      const promoteHistory = JSON.parse(ops[2].steps_history);
      assert.deepEqual(promoteHistory[0].promoteReplicaIds, [firstLearnerId, secondLearnerId]);

      await onLedgerLeader(async (leaderService) => {
        leaderService.learnerFirstAdmission = true;
        const admitL1 = leaderService.admitRaftLearner({replicaIdentity: firstLearnerId, nodeId: 'n2'});
        const admitL2 = leaderService.admitRaftLearner({replicaIdentity: secondLearnerId, nodeId: 'n3'});
        assert.ok(admitL1.outcome);
        assert.ok(admitL2.outcome);
        class TestHandler {
          constructor() {
            this.nodeId = 'n1';
            this.localServices = new Map([[leaderService.replicaId, leaderService]]);
          }
          getTrackedService(id) {
            return this.localServices.get(id) || null;
          }
          buildReplicaOperationResponse(status, extra = {}) {
            return {status, ...extra};
          }
        }
        assignReplicaHandlerMembershipMethods(TestHandler);
        const handler = new TestHandler();
        const catchUpResp = await handler.handleEvaluateLearnerCatchUp({
          [ReplicaOperationField.OPERATION_ID]: ops[0].operation_id,
          [ReplicaOperationField.PARTITION_ID]: leaderService.partitionId,
          [ReplicaOperationField.REPLICA_ID]: firstLearnerId,
        });
        assert.equal(catchUpResp.status, ReplicaOperationResponseStatus.COMPLETED);
        assert.ok(catchUpResp[ReplicaOperationField.CATCH_UP]);
        const missingCohort = await handler.handleProposeGrowthPromote({
          [ReplicaOperationField.OPERATION_ID]: ops[2].operation_id,
          [ReplicaOperationField.PARTITION_ID]: leaderService.partitionId,
          [ReplicaOperationField.REPLICA_ID]: firstLearnerId,
          [ReplicaOperationField.SOURCE_REPLICA_ID]: secondLearnerId,
        });
        assert.equal(missingCohort.status, ReplicaOperationResponseStatus.ERROR);
        assert.equal(missingCohort.errorCode, 'growth_promotion_cohort_unresolved');
        const promoteResp = await handler.handleProposeGrowthPromote({
          [ReplicaOperationField.OPERATION_ID]: ops[2].operation_id,
          [ReplicaOperationField.PARTITION_ID]: leaderService.partitionId,
          [ReplicaOperationField.REPLICA_ID]: firstLearnerId,
          [ReplicaOperationField.SOURCE_REPLICA_ID]: secondLearnerId,
          [ReplicaOperationField.PROMOTE_REPLICA_IDS]: [firstLearnerId, secondLearnerId],
        });
        assert.equal(promoteResp.status, ReplicaOperationResponseStatus.INITIATED);
        assert.ok(promoteResp[ReplicaOperationField.PROPOSAL]);
        const withdrawResp = await handler.handleWithdrawPromotion({
          [ReplicaOperationField.OPERATION_ID]: ops[2].operation_id,
          [ReplicaOperationField.PARTITION_ID]: leaderService.partitionId,
          [ReplicaOperationField.PROMOTE_REPLICA_IDS]: [firstLearnerId, secondLearnerId],
        });
        assert.equal(withdrawResp.status, ReplicaOperationResponseStatus.COMPLETED);
      });
      owner.shutdown();
    } finally {
      ledger.db.close();
    }
  } finally {
    clearFixtureSingletons();
  }
});

test('Item 2 production witness: 1-voter PartitionService admits 2 learners via normal ADD with placementAdmissionEnabled, RebalanceCoordinator/OperationWorkflowOwner dispatches GROWTH_PROMOTE, recovers an interrupted attempt, observes 3 committed voters + SERVICES.raft_role, and releases placement hold', async () => {
  resetFixtureSingletons();
  try {
    await runGrowthPromoteProductionWitness({
      createSimpleSystemCache,
      nodeRow,
      seededPartitionRow,
    });
  } finally {
    clearFixtureSingletons();
  }
});

test('Correction B production-assembly witness: ControlPlaneSetup.create binds ReplicaPlacementOwner factory, attaches once on replica_operations-p1 only, enables placementAdmissionEnabled, drives leadership start/stop, and shuts down cleanly', async () => {
  resetFixtureSingletons();
  try {
    await runCorrectionBProductionAssemblyWitness({
      createSimpleSystemCache,
      seededPartitionRow,
      seededServiceRows,
    });
  } finally {
    clearFixtureSingletons();
  }
});

test('Finding 2 & 3 production witness: 3->5 GROWTH_PROMOTE redirects to new leader on not_leader refusal while preserving operationId/promoteReplicaIds, and enforces step timeout budget on persistent refusal', async () => {
  resetFixtureSingletons();
  try {
    await runGrowthPromoteLeaderRedirectAndTimeoutWitness({
      createSimpleSystemCache,
      nodeRow,
      seededPartitionRow,
    });
  } finally {
    clearFixtureSingletons();
  }
});

test('decreased minLimit floor recovers to 2 within healthyEventLoopDelayMs then holds in hysteresis band', () => {
  const floorConfig = normalizeWindowConfig({
    initialLimit: 2, minLimit: 1, maxLimit: 6,
    minAdjustIntervalMs: 1_000, requiredHealthySamplesAfterDecrease: 2,
  });
  const baseObs = {
    sampledAtMs: NOW_MS, sampleId: 601, congestionEpochId: 601, bootIncarnation: 1,
    processCpuCores: 1.08, mainThreadCpuPercent: 25, eventLoopDelayMs: 120,
    eventLoopUtilizationPercent: 45, availableMemoryBytes: 4096 * 1024 * 1024,
  };
  const demand = (occ, nowMs) => ({
    occupancy: occ, waitingDemandCount: 4, nowMs, expectedBootIncarnation: 1,
  });
  const obsAt = (id, nowMs) => ({
    ...baseObs, sampleId: id, congestionEpochId: id, sampledAtMs: nowMs,
    eventLoopDelayMs: 15, eventLoopUtilizationPercent: 84, mainThreadCpuPercent: 82,
  });
  const decreased = decideAdaptiveResourceWindow(null, baseObs, demand(2, NOW_MS), floorConfig);
  assert.equal(decreased.action, WINDOW_ACTION.DECREASE);
  assert.equal(decreased.limit, 1);
  const sample1 = decideAdaptiveResourceWindow(
    decreased.nextState, obsAt(602, NOW_MS + 1_100), demand(1, NOW_MS + 1_100), floorConfig,
  );
  assert.equal(sample1.reason, BUDGET_REASON.RECOVERY_HYSTERESIS_HOLD);
  assert.equal(sample1.limit, 1);
  const sample2 = decideAdaptiveResourceWindow(
    sample1.nextState, obsAt(603, NOW_MS + 2_200), demand(1, NOW_MS + 2_200), floorConfig,
  );
  assert.equal(sample2.action, WINDOW_ACTION.INCREASE);
  assert.equal(sample2.limit, 2);
  const holdAboveFloor = decideAdaptiveResourceWindow(
    sample2.nextState, obsAt(604, NOW_MS + 3_500), demand(2, NOW_MS + 3_500), floorConfig,
  );
  assert.equal(holdAboveFloor.reason, BUDGET_REASON.HYSTERESIS_BAND_HOLD);
  assert.equal(holdAboveFloor.limit, 2);
});
