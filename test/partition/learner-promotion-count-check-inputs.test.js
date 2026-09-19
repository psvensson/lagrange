// Witness for the learner-promotion-guard-inputs-observed quest.
// Raw node:test so the anchored receipt runner selects exactly one scenario.
//
// SCOPE. The learner-side count check of runLearnerPromotionCheck refuses a
// spread-cure ADD's promotion in every failing nightly with
// would_exceed_target_replica_count and maxAllowedVotersAfterPromotion 4,
// because the priority-recovery overflow budget evaluated on the learner's
// node is 0 where the grants had 2. These witnesses pin that the refusal (and
// the first pass of each learner) now LOGS the inputs the decision was made
// on, that those values come from the one evaluation that decided, and that
// no decision, reason, cap or recheck moved.
//
// The guard is driven through its own methods bag over a hand-built context —
// the same seam test/bootstrap/behaviour-changing-consumer-convergence.test.js
// uses for getTargetReplicaCountForPromotion — so every source read is
// counted and every input is stated by the fixture rather than inferred.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createPartitionServiceLearnerPromotionMethods,
} from '../../src/partition/partition-service-learner-promotion-methods.js';
import {
  createPartitionServiceLearnerPromotionProofMethods,
} from '../../src/partition/partition-service-learner-promotion-proof-methods.js';
import {
  registerSpreadCureTransitionAuthorizationCases,
} from './learner-promotion-count-check-authorization-cases.js';
import {
  LEARNER_PROMOTION_COUNT_CHECK_REFUSAL,
  evaluateLearnerPromotionCountCheck,
} from '../../src/partition/learner-promotion-count-check.js';
import {
  LEARNER_PROMOTION_INPUTS_LIST_LIMIT,
  buildLearnerPromotionCountCheckInputs,
} from '../../src/partition/learner-promotion-count-check-evidence.js';
import {TABLES, SERVICE_TYPE} from '../../src/constants/index.js';
import {OperationType, ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {
  LIFECYCLE_LEGACY_STATE,
  LIFECYCLE_PHASE,
  LIFECYCLE_REASON,
} from '../../src/bootstrap/lifecycle-controller-constants.js';
import {
  INITIAL_PARTITION_IDS,
  SYSTEM_TABLE_NAME,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

if (!ConfigurationManager.getInstance().isInitialized()) {
  ConfigurationManager.getInstance().initialize({});
}
if (!LoggingService.getInstance().isInitialized()) {
  LoggingService.getInstance().initialize({level: 'error'});
}

// The live shape: schema_operations-p1 is both bootstrap-critical and a
// priority control-plane partition, so it is the partition whose learner the
// nightlies refuse. users-p1 is neither.
const CRITICAL_PARTITION_ID =
  INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.SCHEMA_OPERATIONS];
const ORDINARY_PARTITION_ID = 'users-p1';
const LEARNER_REPLICA_ID = `${CRITICAL_PARTITION_ID}-r5`;
const LEARNER_NODE_ID = 'node-2';
const LEADER_REPLICA_ID = `${CRITICAL_PARTITION_ID}-r1`;
const SPREAD_CURE_OPERATION_ID = 'op-08b39435';
const REFUSAL_MESSAGE = 'Learner promotion deferred';
const INPUTS_MESSAGE = 'Learner promotion count check inputs';
const WOULD_EXCEED = 'would_exceed_target_replica_count';
const WOULD_BE_EVEN = 'would_cause_even_voter_count';
const DEFERRED_RECHECK = 'deferred_recheck';
const TARGET_SOURCE_PARTITION_ROW = 'partition_row_replica_count';
const TARGET_SOURCE_UNDECLARED = 'undeclared';
const ORIGIN_UNSTATED = 'unstated';
const SUMMARY_SOURCE_UNRECORDED = 'unrecorded';
const LEARNER_ROLE = 'learner';
const FOLLOWER_ROLE = 'follower';
const LEADER_ROLE = 'leader';
const IN_PROGRESS = 'in_progress';
const ADD_REPLICA_STEP = 'ADD_REPLICA';
const STEPS_HISTORY_READ = 'read:steps_history';
// Main's ORDERED per-check source-read trace, measured by running HEAD's own
// copy of the guard over this fixture (see the read-order section below).
// The two trailing steps_history reads are MAIN's own: the priority-recovery
// operation context normalises and then parses the in-flight operation row's
// steps_history once each per check. Quest
// critical-spread-transition-authority-carry measured them at f2fed102a by
// installing the accessor in createGuardContext, before it edited any src
// file; the pin got longer because the accessor made an existing read
// visible, not because a read was added.
const MAIN_READ_ORDER = Object.freeze([
  'filter:replica_operations',
  'filter:services', 'filter:services', 'filter:services', 'filter:services',
  'get:partitions',
  'readinessSnapshot',
  'planningAnswer',
  'filter:services',
  `nodeReadiness:${LEARNER_NODE_ID}`,
  'filter:replica_operations',
  STEPS_HISTORY_READ, STEPS_HISTORY_READ,
]);
// The ONE read the carrier quest adds, and the whole of its read-order delta:
// the memoised steps_history parse that decodes the spread-cure transition
// authorization off the operation row the guard has already read. It runs
// where the payload is built - on a refusal, and on the first pass - so a
// later pass adds nothing at all.
const CARRIED_READ_ORDER = Object.freeze([
  ...MAIN_READ_ORDER, STEPS_HISTORY_READ,
]);

const methods = createPartitionServiceLearnerPromotionMethods();
const proofMethods = createPartitionServiceLearnerPromotionProofMethods();

function voterRow(index, nodeId) {
  const replicaId = `${CRITICAL_PARTITION_ID}-r${index}`;
  return {
    service_id: replicaId,
    replica_id: replicaId,
    partition_id: CRITICAL_PARTITION_ID,
    service_type: SERVICE_TYPE.PARTITION,
    status: ReplicaStatus.ACTIVE,
    raft_role: index === 1 ? LEADER_ROLE : FOLLOWER_ROLE,
    node_id: nodeId,
  };
}

function learnerRow(replicaId = LEARNER_REPLICA_ID, nodeId = LEARNER_NODE_ID) {
  return {
    service_id: replicaId,
    replica_id: replicaId,
    partition_id: CRITICAL_PARTITION_ID,
    service_type: SERVICE_TYPE.PARTITION,
    status: ReplicaStatus.ACTIVE,
    raft_role: LEARNER_ROLE,
    node_id: nodeId,
  };
}

function spreadCureOperationRow(stepsHistory) {
  const row = {
    operation_id: SPREAD_CURE_OPERATION_ID,
    id: SPREAD_CURE_OPERATION_ID,
    partition_id: CRITICAL_PARTITION_ID,
    type: OperationType.ADD,
    status: IN_PROGRESS,
    workflow_step: ADD_REPLICA_STEP,
    replica_id: LEARNER_REPLICA_ID,
    target_node_id: LEARNER_NODE_ID,
  };
  return stepsHistory === undefined ?
    row :
    {...row, steps_history: JSON.stringify(stepsHistory)};
}

// The 09-16 refusal view: spread satisfied, no blocked partition.
function satisfiedSummary() {
  return Object.freeze({
    satisfied: true,
    requiredDistinctNodeCount: 3,
    readyEligibleNodeCount: 3,
    blockedPartitions: Object.freeze([]),
    missingPartitionIds: Object.freeze([]),
  });
}

// The 09-15 grant view: this partition sits on 2 of the 3 required nodes.
function spreadGapSummary(partitionId = CRITICAL_PARTITION_ID) {
  return Object.freeze({
    satisfied: false,
    requiredDistinctNodeCount: 3,
    readyEligibleNodeCount: 3,
    blockedPartitions: Object.freeze([Object.freeze({
      partitionId,
      requiredDistinctNodeCount: 3,
      readyDistinctNodeCount: 2,
      spreadGap: 1,
    })]),
    missingPartitionIds: Object.freeze([]),
  });
}

// A summary whose readyEligibleNodeCount counts its own reads. Only the
// evidence payload reads that field (the decision path reads satisfied,
// blockedPartitions, missingPartitionIds and requiredDistinctNodeCount), so
// the count is exactly the number of payloads built.
function countingSummary(base) {
  const reads = {payloadBuilds: 0};
  const summary = {};
  for (const [key, value] of Object.entries(base)) {
    if (key === 'readyEligibleNodeCount') continue;
    summary[key] = value;
  }
  Object.defineProperty(summary, 'readyEligibleNodeCount', {
    enumerable: true,
    get() {
      reads.payloadBuilds += 1;
      return base.readyEligibleNodeCount;
    },
  });
  return {summary: Object.freeze(summary), reads};
}

function planningAnswer(summary, epoch = 7, status = 'published') {
  return Object.freeze({
    nodeId: LEARNER_NODE_ID,
    publicationEpoch: epoch,
    publicationStatus: status,
    priorityPartitionSummary: summary,
    publishedActiveNodeIds: Object.freeze(['node-0', 'node-1', LEARNER_NODE_ID]),
  });
}

// A counted system-table cache. `poison` is a per-table read budget: after
// that many reads the double serves DIFFERENT rows, so a value logged from a
// second read is visibly the poisoned one.
function createCountingCache(fixture) {
  const {partitionId, partitionRow, poison, counts, bump, trace} = fixture;
  // `serviceRowsByRead` scripts a DIFFERENT row set per services read, so the
  // ORDER the guard reads them in is observable in the counts it logs.
  const servicesFor = () => {
    const script = fixture.serviceRowsByRead;
    if (!Array.isArray(script)) return fixture.serviceRows;
    const index = counts[`filter:${TABLES.SERVICES}`] - 1;
    return script[Math.min(index, script.length - 1)];
  };
  const rowsFor = (tableName) => tableName === TABLES.SERVICES ?
    servicesFor() :
    tableName === TABLES.REPLICA_OPERATIONS ? fixture.operationRows :
      tableName === TABLES.CONTROL_PLANE_PUBLICATIONS ?
        fixture.publicationRows :
        null;
  const poisoned = (key, rows) => {
    const limit = poison[key];
    if (!Number.isFinite(limit) || counts[key] <= limit) return rows;
    return poison.rows === undefined ? [] : poison.rows;
  };
  const partitionRows = () => (partitionRow ? [partitionRow] : []);
  // A table this cache FAULTS on. The guard must survive a source it never
  // reads being broken, exactly as main survives it: main reads neither the
  // publications nor the config table on the promotion path.
  const faultOn = new Set(fixture.faultOnTables || []);
  const faultIfAsked = (key) => {
    if (faultOn.has(key)) {
      throw new Error(`cache read failed: ${key}`);
    }
  };
  const cache = {
    get(tableName, key) {
      faultIfAsked(`get:${tableName}`);
      const reads = bump(`get:${tableName}`);
      trace.push(`get:${tableName}`);
      const beyondBudget = reads > (poison[`get:${tableName}`] ?? Infinity);
      const matches = tableName === TABLES.PARTITIONS && key === partitionId;
      return matches && !beyondBudget ? partitionRow : null;
    },
    filter(tableName, predicate) {
      const key = `filter:${tableName}`;
      faultIfAsked(key);
      bump(key);
      trace.push(key);
      const rows = rowsFor(tableName);
      return (rows === null ? partitionRows() : poisoned(key, rows))
        .filter(predicate);
    },
  };
  if (fixture.withGetAll !== true) {
    return cache;
  }
  // The other cache surface a publication reader may prefer. Opt-in, so the
  // pinned read order of every other fixture is untouched.
  cache.getAll = (tableName) => {
    const key = `getAll:${tableName}`;
    faultIfAsked(key);
    bump(key);
    trace.push(key);
    return rowsFor(tableName) || partitionRows();
  };
  return cache;
}

// The readiness owner double: it answers once per call from a script, so a
// second read of either source serves a different, visibly wrong answer.
function createCountingReadinessService(options, bump, trace) {
  if (options.controlPlaneReadinessService !== undefined) {
    return options.controlPlaneReadinessService;
  }
  const answers = options.planningAnswers || [options.planningAnswer ?? null];
  return {
    getPriorityRecoveryPlanningAnswerSync() {
      const index = bump('planningAnswer') - 1;
      trace.push('planningAnswer');
      return answers[Math.min(index, answers.length - 1)];
    },
    getNodeReadinessSync(nodeId) {
      bump(`nodeReadiness:${nodeId}`);
      trace.push(`nodeReadiness:${nodeId}`);
      return {
        nodeId,
        ready: true,
        phase: LIFECYCLE_PHASE.TRAFFIC_READY,
        reasons: [],
      };
    },
  };
}

function createCountingReadinessState(options, bump, trace) {
  const snapshots = options.readinessSnapshots || [{
    phase: options.readinessPhase || LIFECYCLE_LEGACY_STATE.WARMING,
    ready: false,
    reasons: options.readinessReasons || [],
    draining: options.readinessDraining === true,
  }];
  return {
    getSnapshot() {
      const index = bump('readinessSnapshot') - 1;
      trace.push('readinessSnapshot');
      return snapshots[Math.min(index, snapshots.length - 1)];
    },
  };
}

// An operation row whose steps_history is read through a counting accessor,
// so a parse of the row's metadata is as visible in the trace as a cache read
// is. The value is captured once and the accessor is pure, so a memoised
// parse and a raw one are told apart by the COUNT, not by the value.
function traceStepsHistoryReads(operationRows, bump, trace) {
  return operationRows.map((row) => {
    const value = row.steps_history;
    const traced = {...row};
    delete traced.steps_history;
    Object.defineProperty(traced, 'steps_history', {
      enumerable: true,
      get() {
        bump(STEPS_HISTORY_READ);
        trace.push(STEPS_HISTORY_READ);
        return value;
      },
    });
    return traced;
  });
}

/**
 * Build a learner-side guard context whose every source read is counted.
 * @param {Object} options fixture declaration
 * @return {Object} {context, logLines, counts, cache}
 */
function createGuardContext(options = {}) {
  const partitionId = options.partitionId || CRITICAL_PARTITION_ID;
  const replicaId = options.replicaId || LEARNER_REPLICA_ID;
  const serviceRows = options.serviceRows || [];
  const operationRows = options.operationRows || [];
  const partitionRow = options.partitionRow === undefined ?
    {partition_id: partitionId, replica_count: 3} :
    options.partitionRow;
  const counts = {};
  const logLines = [];
  const trace = [];
  const bump = (key) => {
    counts[key] = (counts[key] || 0) + 1;
    return counts[key];
  };
  const cache = createCountingCache({
    partitionId, partitionRow, serviceRows,
    operationRows: traceStepsHistoryReads(operationRows, bump, trace),
    publicationRows: options.publicationRows || [],
    faultOnTables: options.faultOnTables,
    withGetAll: options.withGetAll,
    serviceRowsByRead: options.serviceRowsByRead,
    poison: options.poison || {}, counts, bump, trace,
  });
  const readinessService =
    createCountingReadinessService(options, bump, trace);
  const context = {
    ...methods,
    // The promotion-proof bag is composed here exactly as
    // partition-service-assembly.js composes it, so the partition's own
    // membership epoch comes from its production reader over this same
    // counted cache rather than from a double.
    ...proofMethods,
    role: options.role || LEARNER_ROLE,
    leaderId: options.leaderId === undefined ? LEADER_REPLICA_ID : options.leaderId,
    partitionId,
    replicaId,
    nodeId: options.nodeId || LEARNER_NODE_ID,
    systemTableCache: cache,
    controlPlaneReadinessService: readinessService,
    metadataPublicationReadinessState:
      createCountingReadinessState(options, bump, trace),
    isJoiningExistingGroup: options.isJoiningExistingGroup === true,
    isShutdown: false,
    learnerPromotionTimer: null,
    learnerPromotionCountCheckInputsLogged: false,
    learnerCatchUpCheckIntervalMs: 1000,
    logger: {
      info: (message, fields) => logLines.push({level: 'info', message, fields}),
      warn: (message, fields) => logLines.push({level: 'warn', message, fields}),
      debug: () => {},
    },
    scheduleLearnerPromotion(scheduleReason = DEFERRED_RECHECK) {
      logLines.push({level: 'schedule', message: scheduleReason, fields: null});
    },
    applyLearnerPromotionProofGate: async () => {
      logLines.push({level: 'proof-gate', message: null, fields: null});
    },
  };
  return {context, logLines, counts, trace, cache};
}

function linesFor(logLines, message) {
  return logLines.filter((line) => line.message === message);
}

// ---------------------------------------------------------------------------
// The frozen oracle: main's count-check arithmetic and the overflow-budget
// rule it reads, copied verbatim so the witness compares against a value the
// implementation under test cannot influence.
// ---------------------------------------------------------------------------

const FROZEN_OVERFLOW_VOTER_BUDGET = 2;

function frozenTemporaryOverflowVoterBudget(row) {
  if (!row.priorityRecoveryActive ||
      row.targetReplicaCount <= 0 ||
      row.learnerCount <= 0 ||
      row.activeVoterCount < row.targetReplicaCount) {
    return 0;
  }
  if (!(row.activeOperationCount > 0 || row.plannerUnresolved)) {
    return 0;
  }
  return FROZEN_OVERFLOW_VOTER_BUDGET;
}

function frozenAllowances(row) {
  const {
    activeVoterCount, learnerCount, targetReplicaCount,
    isJoiningExistingGroup, hasOwnedAddLikeOperation,
    isCriticalSystemPartition, temporaryOverflowVoterBudget,
  } = row;
  const singleReplacementPromotionAllowed =
    (isJoiningExistingGroup === true || hasOwnedAddLikeOperation) &&
    learnerCount === 1 &&
    activeVoterCount >= targetReplicaCount;
  const operationOwnedCriticalReplacementPromotionAllowed =
    isCriticalSystemPartition &&
    hasOwnedAddLikeOperation &&
    activeVoterCount >= targetReplicaCount;
  const priorityRecoveryAdditionalVotersAllowed =
    isCriticalSystemPartition &&
    Number.isFinite(temporaryOverflowVoterBudget) ?
      temporaryOverflowVoterBudget :
      0;
  return {
    replacement:
      singleReplacementPromotionAllowed ||
      operationOwnedCriticalReplacementPromotionAllowed,
    singleVoterExpansion:
      isJoiningExistingGroup === true &&
      learnerCount === 1 &&
      activeVoterCount === 1,
    priorityRecoveryOverflow: priorityRecoveryAdditionalVotersAllowed > 0,
    additionalVoters: priorityRecoveryAdditionalVotersAllowed,
  };
}

function frozenCountCheck(row) {
  const {activeVoterCount, learnerCount, targetReplicaCount} = row;
  const allowed = frozenAllowances(row);
  const maxAllowedVotersAfterPromotion =
    targetReplicaCount +
    (allowed.replacement || allowed.singleVoterExpansion ? 1 : 0) +
    allowed.additionalVoters;
  const votersAfterPromotion = activeVoterCount + 1;
  const wouldExceedTargetReplicaCount =
    votersAfterPromotion > maxAllowedVotersAfterPromotion;
  const wouldBeEven = votersAfterPromotion % 2 === 0;
  const votersAfterAllLearners = activeVoterCount + learnerCount;
  const allLearnersWouldBeOdd = votersAfterAllLearners % 2 === 1;
  const allLearnersWithinTarget = votersAfterAllLearners <= targetReplicaCount;
  const refused =
    wouldExceedTargetReplicaCount ||
    (wouldBeEven &&
      !allowed.replacement &&
      !allowed.singleVoterExpansion &&
      !allowed.priorityRecoveryOverflow &&
      !(allLearnersWouldBeOdd && allLearnersWithinTarget));
  return {
    refused,
    reason: refused ?
      (wouldExceedTargetReplicaCount ? WOULD_EXCEED : WOULD_BE_EVEN) :
      null,
    maxAllowedVotersAfterPromotion,
    allowances: {
      replacement: allowed.replacement,
      singleVoterExpansion: allowed.singleVoterExpansion,
      priorityRecoveryOverflow: allowed.priorityRecoveryOverflow,
    },
  };
}

// ---------------------------------------------------------------------------
// The 09-16 refusal, reproduced: 4 voters on 2 nodes, one learner owning the
// retained spread-cure ADD, target 3, spread reported satisfied.
// ---------------------------------------------------------------------------

function refusalFixture(overrides = {}) {
  return createGuardContext({
    serviceRows: [
      voterRow(1, 'node-0'), voterRow(2, 'node-0'),
      voterRow(3, 'node-1'), voterRow(4, 'node-1'),
      learnerRow(),
    ],
    operationRows: [spreadCureOperationRow()],
    planningAnswer: planningAnswer(satisfiedSummary()),
    readinessReasons: [LIFECYCLE_REASON.READINESS_STABLE_WINDOW_PENDING],
    ...overrides,
  });
}

function ordinaryRow(index, nodeId, raftRole) {
  return {
    service_id: `${ORDINARY_PARTITION_ID}-r${index}`,
    replica_id: `${ORDINARY_PARTITION_ID}-r${index}`,
    partition_id: ORDINARY_PARTITION_ID,
    service_type: SERVICE_TYPE.PARTITION,
    status: ReplicaStatus.ACTIVE,
    raft_role: raftRole,
    node_id: nodeId,
  };
}

// One leader and one learner on an ordinary partition: the shape both the
// even-voter deferral and the joining single-voter expansion start from.
function ordinaryLeaderAndLearnerFixture(options = {}) {
  return createGuardContext({
    partitionId: ORDINARY_PARTITION_ID,
    replicaId: `${ORDINARY_PARTITION_ID}-r2`,
    serviceRows: [
      ordinaryRow(1, 'node-0', LEADER_ROLE),
      ordinaryRow(2, LEARNER_NODE_ID, LEARNER_ROLE),
    ],
    operationRows: [],
    planningAnswer: null,
    readinessReasons: [],
    ...options,
  });
}

// Three voters, one learner on LEARNER_NODE_ID, target 3, no operation. The
// third voter's node is the row's own variable: on the learner's own node the
// promotion counts discount it as a stale local voter row.
function ordinaryThreeVoterFixture(thirdVoterNodeId) {
  return createGuardContext({
    partitionId: ORDINARY_PARTITION_ID,
    replicaId: `${ORDINARY_PARTITION_ID}-r4`,
    serviceRows: [
      ordinaryRow(1, 'node-0', LEADER_ROLE),
      ordinaryRow(2, 'node-1', FOLLOWER_ROLE),
      ordinaryRow(3, thirdVoterNodeId, FOLLOWER_ROLE),
      ordinaryRow(4, LEARNER_NODE_ID, LEARNER_ROLE),
    ],
    operationRows: [],
    planningAnswer: planningAnswer(spreadGapSummary()),
    readinessReasons: [
      LIFECYCLE_REASON.PRIORITY_CONTROL_PLANE_RECOVERY_PENDING,
    ],
  });
}

function grantFixture(overrides = {}) {
  return createGuardContext({
    serviceRows: [
      voterRow(1, 'node-0'), voterRow(2, 'node-0'),
      voterRow(3, 'node-1'), voterRow(4, 'node-1'),
      learnerRow(),
    ],
    operationRows: [spreadCureOperationRow()],
    planningAnswer: planningAnswer(spreadGapSummary()),
    readinessReasons: [
      LIFECYCLE_REASON.PRIORITY_CONTROL_PLANE_RECOVERY_PENDING,
    ],
    ...overrides,
  });
}

test('a count-check refusal logs the inputs the decision was made on', async () => {
  const {context, logLines} = refusalFixture();
  await context.runLearnerPromotionCheck();

  const refusals = linesFor(logLines, REFUSAL_MESSAGE);
  assert.equal(refusals.length, 1, 'exactly one refusal line');
  const fields = refusals[0].fields;
  // The existing line is untouched: same message, same fields, same values.
  assert.equal(fields.reason, WOULD_EXCEED);
  assert.equal(fields.replicaId, LEARNER_REPLICA_ID);
  assert.equal(fields.partitionId, CRITICAL_PARTITION_ID);
  assert.equal(fields.activeVoterCount, 4);
  assert.equal(fields.learnerCount, 1);
  assert.equal(fields.targetReplicaCount, 3);
  assert.equal(fields.maxAllowedVotersAfterPromotion, 4,
    'the live cap the nightlies print');

  const inputs = fields.countCheckInputs;
  assert.ok(inputs, 'the refusal carries the decided inputs');
  assert.equal(inputs.criticalSystemPartition, true);
  assert.equal(inputs.joining, false);
  assert.deepEqual(inputs.allowances, {
    replacement: true,
    singleVoterExpansion: false,
    priorityRecoveryOverflow: false,
  }, 'the three promotion allowances');

  // The membership view, before and after the local-row correction.
  assert.deepEqual(inputs.membership.voterReplicas, [
    {replicaId: `${CRITICAL_PARTITION_ID}-r1`, nodeId: 'node-0'},
    {replicaId: `${CRITICAL_PARTITION_ID}-r2`, nodeId: 'node-0'},
    {replicaId: `${CRITICAL_PARTITION_ID}-r3`, nodeId: 'node-1'},
    {replicaId: `${CRITICAL_PARTITION_ID}-r4`, nodeId: 'node-1'},
  ], 'voter replica ids with their node ids');
  assert.equal(inputs.membership.voterReplicasWithheld, 0);
  assert.deepEqual(inputs.membership.learnerReplicaIds, [LEARNER_REPLICA_ID]);
  assert.equal(inputs.membership.learnerReplicaIdsWithheld, 0);
  assert.equal(inputs.membership.observedActiveVoterCount, 4,
    'the raw count before the local-row correction');
  assert.equal(inputs.membership.observedLearnerCount, 1);
  assert.equal(inputs.membership.targetReplicaCount, 3);
  assert.equal(inputs.membership.targetReplicaCountSource,
    TARGET_SOURCE_PARTITION_ROW, 'the target carries its source');

  // The in-flight add-like operation view.
  assert.deepEqual(inputs.inFlightAddLike.replicaIds, [LEARNER_REPLICA_ID]);
  assert.equal(inputs.inFlightAddLike.replicaIdsWithheld, 0);
  assert.equal(inputs.inFlightAddLike.ownedByThisLearner, true);

  // The priority-recovery evaluation that produced the zero budget.
  const recovery = inputs.priorityRecovery;
  assert.equal(recovery.evaluated, true);
  assert.equal(recovery.nodeReadiness.present, true);
  assert.equal(recovery.nodeReadiness.phase, LIFECYCLE_LEGACY_STATE.WARMING);
  assert.deepEqual(recovery.nodeReadiness.reasons,
    [LIFECYCLE_REASON.READINESS_STABLE_WINDOW_PENDING]);
  assert.equal(recovery.nodeReadiness.reasonsWithheld, 0);
  assert.equal(recovery.nodeReadiness.draining, false);
  assert.equal(recovery.nodeReadiness.recoveryPending, false,
    'the recovery-pending bit that gates the budget');

  // Draining is part of the bit, and the payload says so: the readiness
  // reasons that grant the budget grant nothing while the node drains. The
  // summary here reports the spread satisfied, so the readiness bit is the
  // only thing that could open the budget.
  const notDraining = refusalFixture({
    readinessReasons: [LIFECYCLE_REASON.PRIORITY_CONTROL_PLANE_RECOVERY_PENDING],
  });
  await notDraining.context.runLearnerPromotionCheck();
  assert.equal(linesFor(notDraining.logLines, REFUSAL_MESSAGE).length, 0,
    'the same readiness reasons grant the promotion when not draining');

  const draining = refusalFixture({
    readinessReasons: [LIFECYCLE_REASON.PRIORITY_CONTROL_PLANE_RECOVERY_PENDING],
    readinessDraining: true,
  });
  await draining.context.runLearnerPromotionCheck();
  const drainingFields =
    linesFor(draining.logLines, REFUSAL_MESSAGE)[0].fields;
  assert.equal(drainingFields.reason, WOULD_EXCEED,
    'a draining node earns no overflow budget');
  assert.equal(drainingFields.maxAllowedVotersAfterPromotion, 4);
  const drainingReadiness =
    drainingFields.countCheckInputs.priorityRecovery.nodeReadiness;
  assert.equal(drainingReadiness.draining, true,
    'the draining flag the decision read is logged');
  assert.equal(drainingReadiness.recoveryPending, false,
    'and it is why the recovery-pending bit is false');
  assert.deepEqual(drainingReadiness.reasons,
    [LIFECYCLE_REASON.PRIORITY_CONTROL_PLANE_RECOVERY_PENDING],
    'even though the recovery-pending reason is present');

  assert.equal(recovery.planningAnswer.present, true);
  assert.equal(recovery.planningAnswer.publicationEpoch, 7);
  assert.equal(recovery.planningAnswer.publicationStatus, 'published');
  assert.equal(recovery.planningAnswer.origin, ORIGIN_UNSTATED,
    'a readiness double states no origin, and the guard says so');
  assert.equal(recovery.planningAnswer.servedFromMemo, false,
    'and the reuse half of the origin is stated too');

  assert.equal(recovery.prioritySummary.present, true);
  assert.equal(recovery.prioritySummary.satisfied, true);
  assert.equal(recovery.prioritySummary.requiredDistinctNodeCount, 3);
  assert.equal(recovery.prioritySummary.readyEligibleNodeCount, 3);
  assert.deepEqual(recovery.prioritySummary.blockedPartitionIds, []);
  assert.equal(recovery.prioritySummary.blockedPartitionIdsWithheld, 0);
  assert.equal(recovery.prioritySummary.source, SUMMARY_SOURCE_UNRECORDED,
    'a hand-built summary was chosen by nobody, and the guard says so');

  assert.equal(recovery.planner.ready, true);
  assert.equal(recovery.planner.spreadGap, 0);
  assert.equal(recovery.planner.readyDistinctNodeCount, null);
  assert.deepEqual(recovery.planner.reasons, []);
  assert.equal(recovery.planner.reasonsWithheld, 0);

  assert.equal(recovery.operations.activeOperationCount, 1);
  assert.deepEqual(recovery.operations.counted, [{
    operationId: SPREAD_CURE_OPERATION_ID,
    type: OperationType.ADD,
    status: IN_PROGRESS,
    workflowStep: ADD_REPLICA_STEP,
  }], 'every counted operation names itself');
  assert.equal(recovery.operations.countedWithheld, 0);

  assert.equal(recovery.completion.temporaryOverflowVoterBudget, 0,
    'the zero budget the nightlies produce');
  assert.equal(typeof recovery.completion.state, 'string');
  assert.equal(typeof recovery.completion.reasonCode, 'string');

  // The reason literals the live nightlies print are this owner's.
  assert.equal(
    LEARNER_PROMOTION_COUNT_CHECK_REFUSAL.WOULD_EXCEED_TARGET_REPLICA_COUNT,
    WOULD_EXCEED);
  assert.equal(
    LEARNER_PROMOTION_COUNT_CHECK_REFUSAL.WOULD_CAUSE_EVEN_VOTER_COUNT,
    WOULD_BE_EVEN);

  // Every list is capped, and a capped list says how many it withheld.
  const overflowing = Array.from(
    {length: LEARNER_PROMOTION_INPUTS_LIST_LIMIT + 4},
    (unused, index) => ({replicaId: `r${index}`, nodeId: `node-${index}`}),
  );
  const capped = buildLearnerPromotionCountCheckInputs({
    voterReplicas: overflowing,
    learnerReplicaIds: overflowing.map((entry) => entry.replicaId),
    inFlightAddLikeReplicaIds: overflowing.map((entry) => entry.replicaId),
  });
  assert.equal(capped.membership.voterReplicas.length,
    LEARNER_PROMOTION_INPUTS_LIST_LIMIT);
  assert.equal(capped.membership.voterReplicasWithheld, 4);
  assert.equal(capped.membership.learnerReplicaIdsWithheld, 4);
  assert.equal(capped.inFlightAddLike.replicaIdsWithheld, 4);

  // Rendering a payload never freezes an array its owner still holds: the
  // census arrays belong to the evaluation, not to the log line.
  const ownedShort = [{replicaId: 'r1', nodeId: 'node-0'}];
  const ownedLong = [...overflowing];
  buildLearnerPromotionCountCheckInputs({
    voterReplicas: ownedShort,
    learnerReplicaIds: ownedLong.map((entry) => entry.replicaId),
    inFlightAddLikeReplicaIds: ownedLong.map((entry) => entry.replicaId),
  });
  assert.equal(Object.isFrozen(ownedShort), false,
    'an uncapped caller array is left mutable');
  assert.equal(Object.isFrozen(ownedLong), false,
    'and so is a capped one');

  // The same check on the grant side keeps the budget of 2 the planner had.
  const grant = grantFixture();
  await grant.context.runLearnerPromotionCheck();
  const granted = linesFor(grant.logLines, INPUTS_MESSAGE);
  assert.equal(granted.length, 1, 'the grant logs its inputs too');
  assert.equal(
    granted[0].fields.countCheckInputs.priorityRecovery.completion
      .temporaryOverflowVoterBudget,
    2, 'the budget the grants had');
  assert.equal(
    granted[0].fields.countCheckInputs.maxAllowedVotersAfterPromotion, 6);
  assert.equal(granted[0].fields.maxAllowedVotersAfterPromotion, undefined,
    'the pass line never carries the refusal line\'s top-level cap field');
});

test('the first count-check pass of a learner logs its inputs exactly once', async () => {
  const {context, logLines} = grantFixture();
  await context.runLearnerPromotionCheck();
  await context.runLearnerPromotionCheck();
  await context.runLearnerPromotionCheck();

  assert.equal(linesFor(logLines, INPUTS_MESSAGE).length, 1,
    'the inputs line is emitted once per learner, not once per pass');
  assert.equal(
    logLines.filter((line) => line.level === 'proof-gate').length, 3,
    'every pass still reaches the progress-proof gate');
  const inputs = linesFor(logLines, INPUTS_MESSAGE)[0].fields.countCheckInputs;
  assert.equal(inputs.priorityRecovery.evaluated, true);
  assert.equal(inputs.priorityRecovery.nodeReadiness.recoveryPending, true);
  assert.equal(inputs.priorityRecovery.prioritySummary.satisfied, false);
  assert.deepEqual(inputs.priorityRecovery.prioritySummary.blockedPartitionIds,
    [CRITICAL_PARTITION_ID]);
  assert.equal(inputs.priorityRecovery.planner.spreadGap, 1);
  assert.equal(inputs.priorityRecovery.planner.ready, false);
  assert.equal(inputs.priorityRecovery.planner.readyDistinctNodeCount, 2,
    'this partition\'s ready distinct node count');

  // A refusal is not throttled: every refusal states its inputs.
  const refused = refusalFixture();
  await refused.context.runLearnerPromotionCheck();
  await refused.context.runLearnerPromotionCheck();
  const refusals = linesFor(refused.logLines, REFUSAL_MESSAGE);
  assert.equal(refusals.length, 2, 'both refusals logged');
  for (const line of refusals) {
    assert.ok(line.fields.countCheckInputs,
      'every refusal carries the decided inputs');
  }
  assert.equal(linesFor(refused.logLines, INPUTS_MESSAGE).length, 0,
    'a refusal never emits the pass line');

  // The payload is BUILT only where it is logged: on a refusal, and on the
  // first pass. A pass after the first must build nothing.
  const passCounter = countingSummary(spreadGapSummary());
  const countedPasses = grantFixture({
    planningAnswer: planningAnswer(passCounter.summary),
  });
  await countedPasses.context.runLearnerPromotionCheck();
  assert.equal(passCounter.reads.payloadBuilds, 1,
    'the first pass builds the payload once');
  await countedPasses.context.runLearnerPromotionCheck();
  await countedPasses.context.runLearnerPromotionCheck();
  assert.equal(passCounter.reads.payloadBuilds, 1,
    'later passes build no payload at all');

  const refusalCounter = countingSummary(satisfiedSummary());
  const countedRefusals = refusalFixture({
    planningAnswer: planningAnswer(refusalCounter.summary),
  });
  await countedRefusals.context.runLearnerPromotionCheck();
  await countedRefusals.context.runLearnerPromotionCheck();
  assert.equal(refusalCounter.reads.payloadBuilds, 2,
    'each refusal builds exactly one payload');
});

test('the logged inputs come from the one evaluation that decided', async () => {
  // Main's measured per-check source reads for this scenario (measured in the
  // unchanged tree before this quest touched the guard).
  const MAIN_READS = Object.freeze({
    'filter:replica_operations': 2,
    'filter:services': 5,
    'get:partitions': 1,
    'readinessSnapshot': 1,
    'planningAnswer': 1,
    [`nodeReadiness:${LEARNER_NODE_ID}`]: 1,
    [STEPS_HISTORY_READ]: 2,
  });
  // The carrier's whole read budget: main's reads, plus ONE memoised parse of
  // the steps_history the guard's own in-flight add-like row already carried.
  const CARRIED_READS = Object.freeze({
    ...MAIN_READS,
    [STEPS_HISTORY_READ]: MAIN_READS[STEPS_HISTORY_READ] + 1,
  });

  // Every double changes its answer after the read the decision used: a value
  // logged from a second read is visibly the poisoned one.
  const poisonedSummary = Object.freeze({
    satisfied: false,
    requiredDistinctNodeCount: 9,
    readyEligibleNodeCount: 9,
    blockedPartitions: Object.freeze([]),
    missingPartitionIds: Object.freeze([]),
  });
  const {context, logLines, counts} = refusalFixture({
    planningAnswers: [
      planningAnswer(satisfiedSummary()),
      planningAnswer(poisonedSummary, 99, 'poisoned'),
    ],
    readinessSnapshots: [
      {
        phase: LIFECYCLE_LEGACY_STATE.WARMING,
        ready: false,
        reasons: [LIFECYCLE_REASON.READINESS_STABLE_WINDOW_PENDING],
      },
      {
        phase: LIFECYCLE_LEGACY_STATE.DEGRADED,
        ready: false,
        reasons: [LIFECYCLE_REASON.PRIORITY_CONTROL_PLANE_RECOVERY_PENDING],
      },
    ],
    poison: {
      'filter:services': MAIN_READS['filter:services'],
      'filter:replica_operations': MAIN_READS['filter:replica_operations'],
      'get:partitions': MAIN_READS['get:partitions'],
      'rows': [learnerRow('poison-r9', 'node-poison')],
    },
  });
  await context.runLearnerPromotionCheck();

  assert.deepEqual(counts, {...CARRIED_READS},
    'each source is read exactly as often per check as on main, and the ' +
      'steps_history of the row the guard already read once more');

  const fields = linesFor(logLines, REFUSAL_MESSAGE)[0].fields;
  const inputs = fields.countCheckInputs;
  assert.equal(fields.reason, WOULD_EXCEED, 'the decision is the decided one');
  assert.equal(inputs.priorityRecovery.planningAnswer.publicationEpoch, 7,
    'the planning answer logged is the one the decision used');
  assert.equal(inputs.priorityRecovery.planningAnswer.publicationStatus,
    'published');
  assert.equal(inputs.priorityRecovery.prioritySummary.satisfied, true);
  assert.equal(inputs.priorityRecovery.prioritySummary.requiredDistinctNodeCount,
    3, 'not the 9 a second planning read would have served');
  assert.equal(inputs.priorityRecovery.nodeReadiness.phase,
    LIFECYCLE_LEGACY_STATE.WARMING,
    'the readiness snapshot logged is the one the decision used');
  assert.deepEqual(inputs.priorityRecovery.nodeReadiness.reasons,
    [LIFECYCLE_REASON.READINESS_STABLE_WINDOW_PENDING]);
  assert.equal(inputs.priorityRecovery.nodeReadiness.recoveryPending, false,
    'not the pending bit a second readiness read would have served');
  assert.equal(inputs.membership.voterReplicas.length, 4,
    'the membership logged is the one the decision counted');
  assert.equal(inputs.membership.targetReplicaCountSource,
    TARGET_SOURCE_PARTITION_ROW,
    'the target logged is the one the decision used');
  assert.deepEqual(inputs.inFlightAddLike.replicaIds, [LEARNER_REPLICA_ID]);

  // The readiness service is read through its property ONCE per check, and
  // the origin is read off that same instance: a second read of the getter
  // could hand the origin a different owner than the one that answered.
  let getterReads = 0;
  const instances = [];
  const single = refusalFixture();
  const answeringService = single.context.controlPlaneReadinessService;
  Object.defineProperty(single.context, 'controlPlaneReadinessService', {
    configurable: true,
    get() {
      getterReads += 1;
      // A DIFFERENT instance on every read: only the answering one states an
      // origin, so a second read would lose it.
      const instance = Object.create(answeringService);
      instances.push(instance);
      return instance;
    },
  });
  await single.context.runLearnerPromotionCheck();
  assert.equal(getterReads, 1,
    'the readiness service property is read once per check');
  assert.equal(instances.length, 1);
  const singleFields = linesFor(single.logLines, REFUSAL_MESSAGE)[0].fields;
  assert.equal(singleFields.countCheckInputs.priorityRecovery
    .planningAnswer.present, true,
  'the instance that was read is the one that answered');

  // The ORDER, not only the count. A services double that serves a different
  // row set per read makes the order observable: swapping the voter and
  // learner censuses moves the voter count onto the second set. The expected
  // values are HEAD's own, measured by running HEAD's copy of the guard over
  // this same fixture.
  const firstSet = [
    voterRow(1, 'node-0'), voterRow(2, 'node-0'),
    voterRow(3, 'node-1'), voterRow(4, 'node-1'),
    learnerRow(),
  ];
  const secondSet = [
    voterRow(1, 'node-0'),
    learnerRow(),
    learnerRow(`${CRITICAL_PARTITION_ID}-r6`, 'node-3'),
    learnerRow(`${CRITICAL_PARTITION_ID}-r7`, 'node-4'),
  ];
  const ordered = refusalFixture({
    serviceRowsByRead: [firstSet, secondSet, firstSet, firstSet, firstSet],
  });
  await ordered.context.runLearnerPromotionCheck();
  assert.deepEqual(ordered.trace, [...CARRIED_READ_ORDER],
    'every source is read in main\'s order, with exactly one memoised ' +
      'steps_history parse appended');
  const orderedFields = linesFor(ordered.logLines, REFUSAL_MESSAGE)[0].fields;
  assert.equal(orderedFields.reason, WOULD_EXCEED,
    'the outcome is the one main reaches in this order');
  assert.equal(orderedFields.maxAllowedVotersAfterPromotion, 4);
  assert.equal(orderedFields.activeVoterCount, 4);
  assert.equal(orderedFields.learnerCount, 1);
  const orderedMembership = orderedFields.countCheckInputs.membership;
  assert.equal(orderedMembership.observedActiveVoterCount, 4,
    'the voter census read the FIRST services set, as main does');
  assert.equal(orderedMembership.observedLearnerCount, 3,
    'the learner census read the SECOND, as main does');
  assert.equal(orderedMembership.voterReplicas.length, 4);
  assert.deepEqual(orderedMembership.learnerReplicaIds, [
    LEARNER_REPLICA_ID,
    `${CRITICAL_PARTITION_ID}-r6`,
    `${CRITICAL_PARTITION_ID}-r7`,
  ]);
});

// ---------------------------------------------------------------------------
// decisions-unchanged: the grid.
// ---------------------------------------------------------------------------

const ARITHMETIC_GRID_BUDGETS = Object.freeze([undefined, 0, 2]);
const ARITHMETIC_GRID_VOTERS = Object.freeze([0, 1, 2, 3, 4, 5]);
const ARITHMETIC_GRID_LEARNERS = Object.freeze([0, 1, 2, 3]);
const ARITHMETIC_GRID_TARGETS = Object.freeze([0, 1, 2, 3, 4, 5]);
const ARITHMETIC_GRID_FLAGS = Object.freeze([false, true]);

// The whole input space of the arithmetic, as one flat table.
const ARITHMETIC_GRID = Object.freeze(
  ARITHMETIC_GRID_VOTERS.flatMap((activeVoterCount) =>
    ARITHMETIC_GRID_LEARNERS.flatMap((learnerCount) =>
      ARITHMETIC_GRID_TARGETS.flatMap((targetReplicaCount) =>
        ARITHMETIC_GRID_FLAGS.flatMap((isJoiningExistingGroup) =>
          ARITHMETIC_GRID_FLAGS.flatMap((hasOwnedAddLikeOperation) =>
            ARITHMETIC_GRID_FLAGS.flatMap((isCriticalSystemPartition) =>
              ARITHMETIC_GRID_BUDGETS.map((temporaryOverflowVoterBudget) => ({
                activeVoterCount, learnerCount, targetReplicaCount,
                isJoiningExistingGroup, hasOwnedAddLikeOperation,
                isCriticalSystemPartition, temporaryOverflowVoterBudget,
              })))))))),
);

// Rows state their inputs, the counts the local-row correction must produce,
// and the upstream facts the fixture means; the frozen oracle derives the
// outcome from those alone.
const GUARD_GRID = Object.freeze([
  {
    name: '09-16 refusal: satisfied summary, no recovery-pending bit',
    authorizable: true,
    fixture: (overrides) => refusalFixture(overrides),
    activeVoterCount: 4, learnerCount: 1, targetReplicaCount: 3,
    isJoiningExistingGroup: false, hasOwnedAddLikeOperation: true,
    isCriticalSystemPartition: true,
    priorityRecoveryActive: false, activeOperationCount: 1,
    plannerUnresolved: false,
  },
  {
    name: '09-15 grant: recovery-pending bit and an open spread gap',
    authorizable: true,
    fixture: (overrides) => grantFixture(overrides),
    activeVoterCount: 4, learnerCount: 1, targetReplicaCount: 3,
    isJoiningExistingGroup: false, hasOwnedAddLikeOperation: true,
    isCriticalSystemPartition: true,
    priorityRecoveryActive: true, activeOperationCount: 1,
    plannerUnresolved: true,
  },
  {
    name: 'critical: spread gap alone activates recovery without the bit',
    authorizable: true,
    fixture: (overrides) => refusalFixture({
      planningAnswer: planningAnswer(spreadGapSummary()),
      ...overrides,
    }),
    activeVoterCount: 4, learnerCount: 1, targetReplicaCount: 3,
    isJoiningExistingGroup: false, hasOwnedAddLikeOperation: true,
    isCriticalSystemPartition: true,
    priorityRecoveryActive: true, activeOperationCount: 1,
    plannerUnresolved: true,
  },
  {
    name: 'critical: no planning answer leaves the planner unresolved',
    authorizable: true,
    fixture: (overrides) => refusalFixture({
      planningAnswer: null,
      readinessReasons: [
        LIFECYCLE_REASON.PRIORITY_CONTROL_PLANE_RECOVERY_PENDING,
      ],
      ...overrides,
    }),
    activeVoterCount: 4, learnerCount: 1, targetReplicaCount: 3,
    isJoiningExistingGroup: false, hasOwnedAddLikeOperation: true,
    isCriticalSystemPartition: true,
    priorityRecoveryActive: true, activeOperationCount: 1,
    plannerUnresolved: true,
  },
  {
    name: 'critical: a draining node is never recovery-pending',
    authorizable: true,
    fixture: (overrides) => refusalFixture({
      readinessReasons: [
        LIFECYCLE_REASON.PRIORITY_CONTROL_PLANE_RECOVERY_PENDING,
      ],
      readinessDraining: true,
      planningAnswer: planningAnswer(satisfiedSummary()),
      ...overrides,
    }),
    activeVoterCount: 4, learnerCount: 1, targetReplicaCount: 3,
    isJoiningExistingGroup: false, hasOwnedAddLikeOperation: true,
    isCriticalSystemPartition: true,
    priorityRecoveryActive: false, activeOperationCount: 1,
    plannerUnresolved: false,
  },
  {
    name: 'critical: no in-flight operation, planner resolved, no budget',
    fixture: () => createGuardContext({
      serviceRows: [
        voterRow(1, 'node-0'), voterRow(2, 'node-0'),
        voterRow(3, 'node-1'), voterRow(4, 'node-1'),
        learnerRow(),
      ],
      operationRows: [],
      planningAnswer: planningAnswer(satisfiedSummary()),
      readinessReasons: [
        LIFECYCLE_REASON.PRIORITY_CONTROL_PLANE_RECOVERY_PENDING,
      ],
    }),
    activeVoterCount: 4, learnerCount: 1, targetReplicaCount: 3,
    isJoiningExistingGroup: false, hasOwnedAddLikeOperation: false,
    isCriticalSystemPartition: true,
    priorityRecoveryActive: true, activeOperationCount: 0,
    plannerUnresolved: false,
  },
  {
    name: 'critical: voters below target earn no overflow budget',
    authorizable: true,
    fixture: (overrides) => createGuardContext({
      serviceRows: [
        voterRow(1, 'node-0'), voterRow(2, 'node-1'),
        learnerRow(),
      ],
      operationRows: [spreadCureOperationRow()],
      planningAnswer: planningAnswer(spreadGapSummary()),
      readinessReasons: [
        LIFECYCLE_REASON.PRIORITY_CONTROL_PLANE_RECOVERY_PENDING,
      ],
      ...overrides,
    }),
    activeVoterCount: 2, learnerCount: 1, targetReplicaCount: 3,
    isJoiningExistingGroup: false, hasOwnedAddLikeOperation: true,
    isCriticalSystemPartition: true,
    priorityRecoveryActive: true, activeOperationCount: 1,
    plannerUnresolved: true,
  },
  {
    name: 'ordinary partition: the stale local voter row is discounted',
    fixture: () => ordinaryThreeVoterFixture(LEARNER_NODE_ID),
    activeVoterCount: 2, learnerCount: 1, targetReplicaCount: 3,
    isJoiningExistingGroup: false, hasOwnedAddLikeOperation: false,
    isCriticalSystemPartition: false,
    priorityRecoveryActive: false, activeOperationCount: 0,
    plannerUnresolved: false,
  },
  {
    name: 'ordinary partition: no priority-recovery evaluation at all',
    fixture: () => ordinaryThreeVoterFixture('node-3'),
    activeVoterCount: 3, learnerCount: 1, targetReplicaCount: 3,
    isJoiningExistingGroup: false, hasOwnedAddLikeOperation: false,
    isCriticalSystemPartition: false,
    priorityRecoveryActive: false, activeOperationCount: 0,
    plannerUnresolved: false,
  },
  {
    name: 'ordinary partition: an even voter count defers',
    fixture: () => ordinaryLeaderAndLearnerFixture({
      partitionRow: {partition_id: ORDINARY_PARTITION_ID, replica_count: 5},
    }),
    activeVoterCount: 1, learnerCount: 1, targetReplicaCount: 5,
    isJoiningExistingGroup: false, hasOwnedAddLikeOperation: false,
    isCriticalSystemPartition: false,
    priorityRecoveryActive: false, activeOperationCount: 0,
    plannerUnresolved: false,
  },
  {
    name: 'ordinary partition: a joining single-voter expansion promotes',
    fixture: () => ordinaryLeaderAndLearnerFixture({
      isJoiningExistingGroup: true,
    }),
    activeVoterCount: 1, learnerCount: 1, targetReplicaCount: 3,
    isJoiningExistingGroup: true, hasOwnedAddLikeOperation: false,
    isCriticalSystemPartition: false,
    priorityRecoveryActive: false, activeOperationCount: 0,
    plannerUnresolved: false,
  },
  {
    name: 'an undeclared replication target defers, fail closed',
    fixture: () => refusalFixture({partitionRow: null}),
    activeVoterCount: 4, learnerCount: 1, targetReplicaCount: 0,
    isJoiningExistingGroup: false, hasOwnedAddLikeOperation: true,
    isCriticalSystemPartition: true,
    priorityRecoveryActive: false, activeOperationCount: 1,
    plannerUnresolved: false,
  },
]);

test('every count-check decision matches the frozen copy of main\'s arithmetic',
  async () => {
    // Layer 1: the arithmetic owner against the frozen copy, exhaustively.
    for (const row of ARITHMETIC_GRID) {
      const expected = frozenCountCheck(row);
      const actual = evaluateLearnerPromotionCountCheck(row);
      const where = JSON.stringify(row);
      assert.equal(actual.refused, expected.refused,
        `refused mismatch on ${where}`);
      assert.equal(
        actual.refused ? actual.refusalReason : null,
        expected.reason,
        `reason mismatch on ${where}`);
      assert.equal(actual.maxAllowedVotersAfterPromotion,
        expected.maxAllowedVotersAfterPromotion, `cap mismatch on ${where}`);
      assert.deepEqual({...actual.allowances}, expected.allowances,
        `allowance mismatch on ${where}`);
    }
    assert.equal(ARITHMETIC_GRID.length, 6 * 4 * 6 * 2 * 2 * 2 * 3,
      'the whole arithmetic grid ran');

    // Layer 2: the real guard, end to end, against the same frozen copy fed
    // with the facts each row states.
    for (const row of GUARD_GRID) {
      const expected = frozenCountCheck({
        ...row,
        temporaryOverflowVoterBudget: row.isCriticalSystemPartition ?
          frozenTemporaryOverflowVoterBudget(row) :
          undefined,
      });
      const {context, logLines} = row.fixture();
      await context.runLearnerPromotionCheck();
      const refusals = linesFor(logLines, REFUSAL_MESSAGE);
      const passes = linesFor(logLines, INPUTS_MESSAGE);
      const schedules = logLines.filter((line) => line.level === 'schedule');
      const proofGates = logLines.filter((line) => line.level === 'proof-gate');
      assert.equal(refusals.length, expected.refused ? 1 : 0,
        `outcome mismatch on: ${row.name}`);
      const fields = (expected.refused ? refusals[0] : passes[0]).fields;
      const inputs = fields.countCheckInputs;
      assert.equal(inputs.membership.activeVoterCount, row.activeVoterCount,
        `corrected voter count mismatch on: ${row.name}`);
      assert.equal(inputs.membership.learnerCount, row.learnerCount,
        `corrected learner count mismatch on: ${row.name}`);
      assert.equal(inputs.membership.targetReplicaCount,
        row.targetReplicaCount, `target mismatch on: ${row.name}`);
      assert.equal(inputs.maxAllowedVotersAfterPromotion,
        expected.maxAllowedVotersAfterPromotion,
        `cap mismatch on: ${row.name}`);
      if (expected.refused) {
        assert.equal(fields.activeVoterCount, row.activeVoterCount,
          `refusal line voter count mismatch on: ${row.name}`);
        assert.equal(fields.learnerCount, row.learnerCount,
          `refusal line learner count mismatch on: ${row.name}`);
        assert.equal(fields.targetReplicaCount, row.targetReplicaCount,
          `refusal line target mismatch on: ${row.name}`);
        assert.equal(fields.maxAllowedVotersAfterPromotion,
          expected.maxAllowedVotersAfterPromotion,
          `refusal line cap mismatch on: ${row.name}`);
        assert.equal(fields.reason, expected.reason,
          `reason mismatch on: ${row.name}`);
        assert.deepEqual(schedules.map((line) => line.message),
          [DEFERRED_RECHECK], `recheck mismatch on: ${row.name}`);
        assert.equal(proofGates.length, 0,
          `a refusal never reaches the proof gate: ${row.name}`);
      } else {
        assert.equal(schedules.length, 0,
          `a pass schedules nothing here: ${row.name}`);
        assert.equal(proofGates.length, 1,
          `a pass reaches the proof gate: ${row.name}`);
      }
      assert.deepEqual({...inputs.allowances}, expected.allowances,
        `allowance mismatch on: ${row.name}`);
      if (row.targetReplicaCount === 0) {
        assert.equal(inputs.membership.targetReplicaCountSource,
          TARGET_SOURCE_UNDECLARED, `undeclared target on: ${row.name}`);
      }
    }
  });

// The carrier's learner-side witnesses (quest
// critical-spread-transition-authority-carry) run against THIS host: the same
// fixtures, the same frozen oracle, the same read counters. They are
// registered from beside it because this file is close to the test
// file-size threshold.
registerSpreadCureTransitionAuthorizationCases(Object.freeze({
  ARITHMETIC_GRID,
  CARRIED_READ_ORDER,
  CRITICAL_PARTITION_ID,
  DEFERRED_RECHECK,
  GUARD_GRID,
  INPUTS_MESSAGE,
  LEARNER_NODE_ID,
  LEARNER_REPLICA_ID,
  REFUSAL_MESSAGE,
  SPREAD_CURE_OPERATION_ID,
  STEPS_HISTORY_READ,
  WOULD_EXCEED,
  createGuardContext,
  grantFixture,
  learnerRow,
  linesFor,
  planningAnswer,
  refusalFixture,
  satisfiedSummary,
  spreadCureOperationRow,
  spreadGapSummary,
  voterRow,
}));
