import {test} from 'node:test';
import assert from 'node:assert/strict';
import {TABLES} from '../../src/constants/index.js';
import {
  PARTITION_TRANSITION_METADATA_FIELD,
  PARTITION_TRANSITION_STATE,
} from '../../src/partition/partition-constants.js';
import * as splitAckConstants from '../../src/partition/split-ack-constants.js';
import {
  PARTICIPANT_ACK_FIELD,
} from '../../src/workflow/workflow-constants.js';
import {TimeoutPolicy} from '../../src/workflow/timeout-policy.js';
import {
  TIMEOUT_BUDGET_DEFAULT,
} from '../../src/control-plane/timeout-budget.js';
import {
  QUERY_DEFAULTS,
  QUERY_ERROR_MSG,
} from '../../src/query/query-constants.js';
import {PartitionResolver} from '../../src/query/partition-resolver.js';
import {
  STORAGE_ADMISSION_DECISION_TYPE,
  STORAGE_ADMISSION_REASON,
} from '../../src/rebalancer/storage-admission-constants.js';
import {
  buildWorkflow,
  createAdmissionResult,
} from './managed-split-workflow-test-helpers.js';

// Deterministic witness for the MovieLens five-node live runs of
// 2026-08-30 (HEAD 403a92853): the `ratings` user table is split while
// 100,000 ratings are being loaded.
//
// Run 1 (node-0 boot 11:58:10Z): split plan #1 on p1 at 12:03:59.2
// (median 2501, children _p_22061800_left/_p_d0c6c180_right). The right
// child's routable-service wait timed out at 12:04:29.6 (30 s
// TABLE_CREATE_PROVISION_TIMEOUT_MS) and the split was persisted
// DEFERRED with the plan. The retry at 12:04:35.7 re-registered the
// workflow with buildPendingTransitionMetadata (no SPLIT_KEY /
// TARGET_PARTITION_IDS) and was admission-BLOCKED
// (source_quorum_not_routable); resolveExecutionGateOutcome persisted
// that blocked row from the pending metadata, DROPPING the plan. The
// retry at 12:04:46.4 therefore saw no persisted plan
// (resolvePersistedSplitPlan -> null) and RE-PLANNED (median 9001, new
// child ids), leaving four overlapping v2 rows; resolvePartitionForKey is
// first-match, and batch 40 of the load failed at 12:05:08.
//
// Run 2 (12:09Z): the retry resumed the plan, but "Managed split cutover
// applied" landed at 12:20:17.832 and the source dissolved at 12:20:18.4
// while the right child's canonical leader service was readiness-denied
// on the serve dimension (planning_snapshot_refresh_pending, 12:20:13.5 /
// 12:20:19.5 / 12:20:24.8), so writes to the right key range had no
// routable participant.
//
// Cure (ManagedSplitWorkflow owner only): (1) the persisted plan is
// resolved before registration and carried on every transition row the
// retry writes, so a retry always resumes the same children; (2) the
// cutover is decided from the query plane's child-leader routing
// evidence, waits on the existing provisioning budget/poll cadence while
// a child leader is unroutable, and is a typed refusal afterwards (the
// source keeps serving; no dissolution).
//
// Raw node:test so each scenario is selectable with --test-name-pattern
// by its anchored name; scripts/quest-evidence-managed-split-resume-
// under-write-load.js re-runs one scenario per receipt.

// The cutover readiness constants are read through the module namespace
// so the control scenarios still load (and stay green) on HEAD, where the
// cure's constants do not exist yet; only the red scenario touches them.
const {SPLIT_ACK_STATUS, SPLIT_PARTICIPANT_PREFIX} = splitAckConstants;
const SOURCE_PARTITION_ID = 'users-p1';
const TABLE_ID = 'tbl-users';
const TABLE_NAME = 'users';
const NODE_A = 'node-a';
const NODE_B = 'node-b';
const NORMAL_STATE = 'NORMAL';
const RETRY_WINDOW_ADVANCE_MS = 60000;
const CLOCK_START_MS = 1000;
// Run-1 plan identities.
const PLAN_ONE = Object.freeze({
  medianKey: 2501,
  leftPartitionId: 'users-p-22061800-left',
  rightPartitionId: 'users-p-d0c6c180-right',
});
const PLAN_TWO = Object.freeze({
  medianKey: 9001,
  leftPartitionId: 'users-p-51393667-left',
  rightPartitionId: 'users-p-788aff5c-right',
});
const PROBE_KEYS = Object.freeze([1, 2500, 2501, 9000, 9001, 100000]);
const TARGET_VERSION = 2;
const CHILD_LEADER_ROUTABLE_AFTER_MS = 10000;

function buildPlan(plan) {
  return {
    medianKey: plan.medianKey,
    leftPartition: {
      partitionId: plan.leftPartitionId,
      keyRange: {start: null, end: plan.medianKey},
    },
    rightPartition: {
      partitionId: plan.rightPartitionId,
      keyRange: {start: plan.medianKey, end: null},
    },
  };
}

function matchesWhere(row, whereClause) {
  return Object.entries(whereClause || {}).every(([column, expected]) => {
    const actual = row?.[column];
    if (expected === null || expected === undefined) {
      return actual === null || actual === undefined;
    }
    return String(actual ?? '') === String(expected);
  });
}

// Mirrors SQLQueryEngine.parsePartitionTransition: the durable tables row
// is the only source of the existing transition on every retry.
function parseTransitionFromRow(row) {
  const state = row?.partition_transition_state ?? null;
  const rawMetadata = row?.partition_transition_metadata ?? null;
  if (!state || !rawMetadata) {
    return null;
  }
  return {state, metadata: JSON.parse(rawMetadata)};
}

// One durable tables row (the only source of the existing transition on
// every retry) and the source partition row at the active epoch.
function createFixtureRows() {
  return {
    tableRow: {
      table_id: TABLE_ID,
      table_name: TABLE_NAME,
      partition_key: 'id',
      active_partition_version: 1,
      partition_transition_state: null,
      partition_transition_metadata: null,
    },
    partitionRows: [{
      partition_id: SOURCE_PARTITION_ID,
      table_id: TABLE_ID,
      table_name: TABLE_NAME,
      partition_key_start: null,
      partition_key_end: null,
      partition_version: 1,
      replica_count: 3,
      leader_node_id: NODE_A,
      size_bytes: 128,
      state: NORMAL_STATE,
    }],
  };
}

function createRecordingLogger(events) {
  const record = (level) => (msg, fields) => {
    events.push({level, msg, ...(fields?.partitionId ?
      {partitionId: fields.partitionId} : {})});
  };
  return {info: record('info'), warn: record('warn'), error: record('error')};
}

// Drives the real ManagedSplitWorkflow through run 1's three attempts
// over one durable tables row and one partitions table.
async function driveRunOneRetrySequence() {
  let clock = CLOCK_START_MS;
  const now = () => clock;
  const events = [];
  const {tableRow, partitionRows} = createFixtureRows();
  const plans = [buildPlan(PLAN_ONE), buildPlan(PLAN_TWO)];
  let planCalls = 0;
  let attempt = 0;
  const admissionByAttempt = [
    createAdmissionResult(),
    createAdmissionResult({
      allowed: false,
      decisionType: STORAGE_ADMISSION_DECISION_TYPE.BLOCKED,
      eligibleNodeIds: [],
      blockingReasons: [STORAGE_ADMISSION_REASON.SOURCE_QUORUM_NOT_ROUTABLE],
    }),
    createAdmissionResult(),
  ];
  const {workflow} = buildWorkflow({
    now,
    durableTableRows: [tableRow],
    parsePartitionTransition: () => parseTransitionFromRow(tableRow),
    getPartitionInfo: (partitionId) =>
      partitionRows.find((row) => row.partition_id === partitionId) || null,
    listTablePartitionRows: () =>
      partitionRows.filter((row) => row.table_id === TABLE_ID),
    buildManagedSplitPlan: async () => {
      planCalls += 1;
      events.push({plan: planCalls});
      return plans[planCalls - 1];
    },
    storageAdmissionService: {
      async checkSplit() {
        return admissionByAttempt[attempt - 1];
      },
    },
    provisionInitialTablePartition: async (context) => {
      events.push({provision: context.partitionId, attempt});
      if (attempt === 1 &&
          context.partitionId === PLAN_ONE.rightPartitionId) {
        // Run 1 12:04:29.6: the right child's routable wait timed out.
        throw new Error(
          QUERY_ERROR_MSG.TABLE_PARTITION_ROUTING_TIMEOUT_PREFIX +
          context.partitionId,
        );
      }
    },
    cdcIntegrationService: {
      async updateSystemTableRow(tableName, whereClause, data) {
        if (tableName === TABLES.TABLES) {
          if (!matchesWhere(tableRow, whereClause)) {
            return {success: true, affectedRows: 0};
          }
          Object.assign(tableRow, data);
          if (data.partition_transition_state !== undefined) {
            events.push({state: data.partition_transition_state, attempt});
          }
          return {success: true, affectedRows: 1};
        }
        const row = partitionRows.find((entry) =>
          matchesWhere(entry, whereClause));
        if (row) {
          Object.assign(row, data);
        }
        return {success: true, affectedRows: row ? 1 : 0};
      },
      async insertSystemTableRow(tableName, row) {
        if (tableName === TABLES.PARTITIONS) {
          partitionRows.push({...row});
          events.push({insert: row.partition_id, attempt});
        }
        return {success: true, affectedRows: 1};
      },
      async deleteSystemTableRow(tableName, whereClause) {
        const index = partitionRows.findIndex((entry) =>
          matchesWhere(entry, whereClause));
        if (index >= 0) {
          partitionRows.splice(index, 1);
        }
        return {success: true, affectedRows: index >= 0 ? 1 : 0};
      },
    },
    logger: createRecordingLogger(events),
  });

  const results = [];
  const metadataAfterAttempt = [];
  for (attempt = 1; attempt <= admissionByAttempt.length; attempt += 1) {
    results.push(await workflow.execute(SOURCE_PARTITION_ID));
    metadataAfterAttempt.push(parseTransitionFromRow(tableRow)?.metadata);
    clock += RETRY_WINDOW_ADVANCE_MS;
  }
  return {
    workflow,
    results,
    events,
    partitionRows,
    metadataAfterAttempt,
    planCalls,
  };
}

function coveringRows(resolver, rows, key) {
  return rows.filter((row) => resolver.isValueInPartition(key, row));
}

test('deferred-routing-timeout-resumes-persisted-plan: a DEFERRED split ' +
'whose failure is the child routable-wait timeout resumes the persisted ' +
'plan on retry, never re-plans, and no two v2 rows cover one key',
async () => {
  const drive = await driveRunOneRetrySequence();
  const [deferred, blocked, resumed] = drive.results;
  assert.equal(deferred.state, PARTITION_TRANSITION_STATE.DEFERRED,
    'attempt 1 must be deferred by the right child routable-wait timeout');
  assert.equal(deferred.error,
    QUERY_ERROR_MSG.TABLE_PARTITION_ROUTING_TIMEOUT_PREFIX +
    PLAN_ONE.rightPartitionId);
  assert.equal(blocked.state, PARTITION_TRANSITION_STATE.BLOCKED,
    'attempt 2 is admission-blocked (source_quorum_not_routable)');
  assert.equal(resumed.success, true, 'attempt 3 must prepare the split');
  assert.deepEqual(
    resumed.targetPartitionIds,
    [PLAN_ONE.leftPartitionId, PLAN_ONE.rightPartitionId],
    'the retry must resume the persisted child identities',
  );
  assert.equal(resumed.splitKey, PLAN_ONE.medianKey,
    'the retry must resume the persisted split key');
  assert.equal(drive.planCalls, 1,
    'buildManagedSplitPlan runs exactly once across the retry sequence');

  const v2Rows = drive.partitionRows.filter((row) =>
    row.partition_version === TARGET_VERSION);
  assert.deepEqual(
    v2Rows.map((row) => row.partition_id).sort(),
    [PLAN_ONE.leftPartitionId, PLAN_ONE.rightPartitionId].sort(),
    'exactly the two persisted children exist at the target epoch',
  );
  const resolver = new PartitionResolver();
  for (const key of PROBE_KEYS) {
    const covering = coveringRows(resolver, v2Rows, key);
    assert.equal(covering.length, 1,
      `key ${key} must be covered by exactly one v2 row`);
    assert.equal(
      resolver.resolvePartitionForKey(TABLE_NAME, key, v2Rows),
      covering[0].partition_id,
      `resolvePartitionForKey routes key ${key} to its unique v2 row`,
    );
  }
});

test('persisted-plan-survives-admission-block: the blocked transition row ' +
'written by an intermediate admission denial still carries the persisted ' +
'split key and child ids',
async () => {
  const drive = await driveRunOneRetrySequence();
  const blockedMetadata = drive.metadataAfterAttempt[1];
  assert.equal(
    blockedMetadata?.[PARTITION_TRANSITION_METADATA_FIELD.SPLIT_KEY],
    PLAN_ONE.medianKey,
    'the blocked row keeps the persisted split key',
  );
  assert.deepEqual(
    blockedMetadata?.[PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_IDS],
    [PLAN_ONE.leftPartitionId, PLAN_ONE.rightPartitionId],
    'the blocked row keeps the persisted child ids',
  );
  assert.equal(
    blockedMetadata?.[PARTITION_TRANSITION_METADATA_FIELD.RETRY]?.attemptCount,
    2,
    'the retry accounting is unchanged',
  );
});

function buildBackfillingRecord(workflowId) {
  return {
    workflowId,
    ownerKey: SOURCE_PARTITION_ID,
    tableId: TABLE_ID,
    tableName: TABLE_NAME,
    partitionId: SOURCE_PARTITION_ID,
    status: PARTITION_TRANSITION_STATE.SPLIT_BACKFILLING,
    metadata: {
      [PARTITION_TRANSITION_METADATA_FIELD.WORKFLOW_ID]: workflowId,
      [PARTITION_TRANSITION_METADATA_FIELD.PRIMARY_KEY_COLUMN]: 'id',
      [PARTITION_TRANSITION_METADATA_FIELD.SOURCE_PARTITION_ID]:
        SOURCE_PARTITION_ID,
      [PARTITION_TRANSITION_METADATA_FIELD.SPLIT_KEY]: PLAN_ONE.medianKey,
      [PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_IDS]: [
        PLAN_ONE.leftPartitionId,
        PLAN_ONE.rightPartitionId,
      ],
      [PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_VERSION]:
        TARGET_VERSION,
      [PARTITION_TRANSITION_METADATA_FIELD.SIBLING_PARTITION_IDS]: [],
    },
    createdAt: CLOCK_START_MS,
    updatedAt: CLOCK_START_MS,
    participants: new Map(),
  };
}

// Drives one backfilling split to the CATCHUP_READY ack with the right
// child's canonical leader (node-a) readiness-denied on the serve
// dimension (only the follower node-b routable) until `routableAfterMs`.
async function driveCutoverWithDeniedRightLeader(options) {
  let clock = CLOCK_START_MS;
  const now = () => clock;
  const startedAt = clock;
  const events = [];
  const delays = [];
  const updateStates = [];
  const deleteCalls = [];
  const removedReplicas = [];
  const {workflow} = buildWorkflow({
    now,
    delay: async (ms) => {
      delays.push(ms);
      clock += ms;
    },
    createExecutionTimeoutBudget: () =>
      new TimeoutPolicy({operationName: TABLE_NAME, now})
        .createTopLevelBudget({
          configuredBudgetMs: QUERY_DEFAULTS.TABLE_CREATE_PROVISION_TIMEOUT_MS,
        }),
    resolveRoutingWaitPollIntervalMs: () =>
      QUERY_DEFAULTS.TABLE_CREATE_PROVISION_POLL_INTERVAL_MS,
    resolveSplitChildLeaderRoutingEvidence: (partitionId) => {
      const leaderRoutable =
        partitionId !== PLAN_ONE.rightPartitionId ||
        clock - startedAt >= options.routableAfterMs;
      return {
        leaderNodeId: NODE_A,
        routableNodeIds: leaderRoutable ? [NODE_A, NODE_B] : [NODE_B],
      };
    },
    listPartitionServiceRows: (partitionId) => ([
      {replica_id: `${partitionId}-r1`, node_id: NODE_A},
    ]),
    deliverReplicaRemoval: async (request) => {
      removedReplicas.push(request.message);
      return {status: 'initiated'};
    },
    cdcIntegrationService: {
      async updateSystemTableRow(tableName, whereClause, data) {
        if (tableName === TABLES.TABLES &&
            data.partition_transition_state !== undefined) {
          updateStates.push(data.partition_transition_state);
        }
        return {success: true, affectedRows: 1};
      },
      async insertSystemTableRow() {
        return {success: true, affectedRows: 1};
      },
      async deleteSystemTableRow(tableName, whereClause) {
        deleteCalls.push({tableName, whereClause});
        return {success: true, affectedRows: 1};
      },
    },
    logger: createRecordingLogger(events),
  });
  const workflowId = options.workflowId;
  const record = buildBackfillingRecord(workflowId);
  await workflow.workflowCoordinator.registerWorkflow(record);
  const claim = await workflow.claimSplitWorkflowOwnership(workflowId);
  workflow.ensureCanonicalSplitParticipants(workflowId, record.metadata);
  const fenceToken = claim.workflow.fenceToken;
  const sourceAck = (status) => ({
    [PARTICIPANT_ACK_FIELD.PARTICIPANT_KEY]:
      SPLIT_PARTICIPANT_PREFIX.SOURCE_PARTITION,
    [PARTICIPANT_ACK_FIELD.STATUS]: status,
    [PARTICIPANT_ACK_FIELD.FENCE_TOKEN]: fenceToken,
    [PARTICIPANT_ACK_FIELD.ACKNOWLEDGED_AT]: now(),
  });
  await workflow.acknowledgeSourceParticipant(
    workflowId,
    sourceAck(SPLIT_ACK_STATUS.SNAPSHOT_STARTED),
  );
  const catchupResult = await workflow.acknowledgeSourceParticipant(
    workflowId,
    sourceAck(SPLIT_ACK_STATUS.CATCHUP_READY),
  );
  return {
    workflow,
    workflowId,
    catchupResult,
    events,
    delays,
    updateStates,
    deleteCalls,
    removedReplicas,
    elapsedMs: clock - startedAt,
  };
}

test('cutover-refused-while-child-leader-denied: the cutover is a typed ' +
'refusal while a child\'s canonical leader is readiness-denied, the ' +
'source stays pre-cutover and undissolved, and it applies once the leader ' +
'is routable',
async () => {
  const refused = await driveCutoverWithDeniedRightLeader({
    workflowId: 'split-cutover-refused',
    routableAfterMs: Number.POSITIVE_INFINITY,
  });
  assert.equal(refused.catchupResult.splitCutoverApplied, false,
    'the cutover must not apply while the right child leader is denied');
  assert.equal(
    refused.catchupResult.cutoverReadiness?.decision,
    splitAckConstants.SPLIT_CUTOVER_READINESS_DECISION.REFUSED,
  );
  assert.equal(
    refused.catchupResult.cutoverReadiness?.reason,
    splitAckConstants.SPLIT_CUTOVER_REFUSAL_REASON.CHILD_LEADER_NOT_ROUTABLE,
  );
  assert.equal(
    refused.catchupResult.cutoverReadiness?.childPartitionId,
    PLAN_ONE.rightPartitionId,
  );
  assert.equal(
    refused.workflow.workflowCoordinator.getWorkflowById(refused.workflowId)
      .status,
    PARTITION_TRANSITION_STATE.SPLIT_BACKFILLING,
    'the workflow stays in its pre-cutover state',
  );
  assert.ok(
    !refused.updateStates.includes(
      PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE,
    ),
    'no durable cutover row was written',
  );
  assert.equal(refused.deleteCalls.length, 0,
    'the source descriptor is not deleted');
  assert.equal(refused.removedReplicas.length, 0,
    'no source replica removal is dispatched');
  assert.equal(
    refused.elapsedMs,
    QUERY_DEFAULTS.TABLE_CREATE_PROVISION_TIMEOUT_MS,
    'the wait is bounded by the existing provisioning budget',
  );

  const applied = await driveCutoverWithDeniedRightLeader({
    workflowId: 'split-cutover-applied',
    routableAfterMs: CHILD_LEADER_ROUTABLE_AFTER_MS,
  });
  assert.equal(applied.catchupResult.splitCutoverApplied, true,
    'the cutover applies once the child leader is serve-routable');
  assert.equal(
    applied.catchupResult.cutoverReadiness?.decision,
    splitAckConstants.SPLIT_CUTOVER_READINESS_DECISION.ROUTABLE,
  );
  assert.equal(
    applied.workflow.workflowCoordinator.getWorkflowById(applied.workflowId)
      .status,
    PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE,
  );
  assert.equal(applied.elapsedMs, CHILD_LEADER_ROUTABLE_AFTER_MS,
    'the cutover lands on the first poll after the leader is routable');
  assert.ok(
    applied.delays.every((ms) =>
      ms === QUERY_DEFAULTS.TABLE_CREATE_PROVISION_POLL_INTERVAL_MS),
    'the wait polls on the existing provisioning cadence',
  );
});

// The healthy path: admitted split, both children provision, source
// catch-up, cutover with routable child leaders. The event sequence is
// pinned byte-for-byte to HEAD so the cure is proven inert here.
async function driveHealthySplit() {
  let clock = CLOCK_START_MS;
  const now = () => clock;
  const events = [];
  const {tableRow, partitionRows} = createFixtureRows();
  const {workflow} = buildWorkflow({
    now,
    durableTableRows: [tableRow],
    parsePartitionTransition: () => parseTransitionFromRow(tableRow),
    getPartitionInfo: (partitionId) =>
      partitionRows.find((row) => row.partition_id === partitionId) || null,
    listTablePartitionRows: () => partitionRows,
    buildManagedSplitPlan: async () => {
      events.push({plan: 1});
      return buildPlan(PLAN_ONE);
    },
    provisionInitialTablePartition: async (context) => {
      events.push({provision: context.partitionId});
    },
    listPartitionServiceRows: (partitionId) => ([
      {replica_id: `${partitionId}-r1`, node_id: NODE_A},
    ]),
    deliverReplicaRemoval: async (request) => {
      events.push({remove: request.message.partitionId});
      return {status: 'initiated'};
    },
    cdcIntegrationService: {
      async updateSystemTableRow(tableName, whereClause, data) {
        if (tableName === TABLES.TABLES) {
          if (!matchesWhere(tableRow, whereClause)) {
            return {success: true, affectedRows: 0};
          }
          Object.assign(tableRow, data);
          if (data.partition_transition_state !== undefined) {
            events.push({state: data.partition_transition_state});
          }
          return {success: true, affectedRows: 1};
        }
        return {success: true, affectedRows: 1};
      },
      async insertSystemTableRow(tableName, row) {
        if (tableName === TABLES.PARTITIONS) {
          partitionRows.push({...row});
          events.push({insert: row.partition_id});
        }
        return {success: true, affectedRows: 1};
      },
      async deleteSystemTableRow(tableName, whereClause) {
        events.push({delete: whereClause.partition_id});
        return {success: true, affectedRows: 1};
      },
    },
    logger: createRecordingLogger(events),
  });
  const prepared = await workflow.execute(SOURCE_PARTITION_ID);
  const workflowId = prepared.workflowId;
  // The prepared workflow is released from memory at the end of execute
  // (the source's acks re-resolve it from the durable row); re-register
  // the durable snapshot the way the ack ingress does.
  const transition = parseTransitionFromRow(tableRow);
  await workflow.workflowCoordinator.registerWorkflow({
    workflowId,
    ownerKey: SOURCE_PARTITION_ID,
    tableId: TABLE_ID,
    tableName: TABLE_NAME,
    partitionId: SOURCE_PARTITION_ID,
    status: transition.state,
    metadata: transition.metadata,
    createdAt: clock,
    updatedAt: clock,
    participants: new Map(),
  });
  const claim = await workflow.claimSplitWorkflowOwnership(workflowId);
  workflow.ensureCanonicalSplitParticipants(workflowId, transition.metadata);
  const sourceAck = (status, checkpoint) => ({
    [PARTICIPANT_ACK_FIELD.PARTICIPANT_KEY]:
      SPLIT_PARTICIPANT_PREFIX.SOURCE_PARTITION,
    [PARTICIPANT_ACK_FIELD.STATUS]: status,
    [PARTICIPANT_ACK_FIELD.FENCE_TOKEN]: claim.workflow.fenceToken,
    [PARTICIPANT_ACK_FIELD.ACKNOWLEDGED_AT]: now(),
    ...(checkpoint ? {[PARTICIPANT_ACK_FIELD.CHECKPOINT]: checkpoint} : {}),
  });
  for (const status of [
    SPLIT_ACK_STATUS.SNAPSHOT_STARTED,
    SPLIT_ACK_STATUS.CATCHUP_READY,
  ]) {
    clock += 1;
    const ackResult = await workflow.acknowledgeSourceParticipant(
      workflowId,
      sourceAck(status),
    );
    events.push({ack: status, cutover: ackResult.splitCutoverApplied});
  }
  clock += 1;
  await workflow.acknowledgeSourceParticipant(
    workflowId,
    sourceAck(SPLIT_ACK_STATUS.CLEANUP_COMPLETED, {sourceMirrorRemoved: true}),
  );
  return {prepared, events, tableRow};
}

const HEALTHY_SEQUENCE = Object.freeze([
  {level: 'info', msg: 'Starting managed partition split',
    partitionId: SOURCE_PARTITION_ID},
  {state: PARTITION_TRANSITION_STATE.ADMISSION_PENDING},
  {level: 'info', msg: 'Managed split workflow ownership claimed',
    partitionId: SOURCE_PARTITION_ID},
  {plan: 1},
  {state: PARTITION_TRANSITION_STATE.SPLIT_PREPARING},
  {insert: PLAN_ONE.leftPartitionId},
  {insert: PLAN_ONE.rightPartitionId},
  {provision: PLAN_ONE.leftPartitionId},
  {provision: PLAN_ONE.rightPartitionId},
  {state: PARTITION_TRANSITION_STATE.SPLIT_BACKFILLING},
  {level: 'info', msg: 'Prepared managed partition split',
    partitionId: SOURCE_PARTITION_ID},
  {state: PARTITION_TRANSITION_STATE.SPLIT_BACKFILLING},
  {state: PARTITION_TRANSITION_STATE.SPLIT_BACKFILLING},
  {ack: SPLIT_ACK_STATUS.SNAPSHOT_STARTED, cutover: false},
  {state: PARTITION_TRANSITION_STATE.SPLIT_BACKFILLING},
  {state: PARTITION_TRANSITION_STATE.SPLIT_CATCHUP},
  {state: PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE},
  {level: 'info', msg: 'Managed split cutover applied'},
  {ack: SPLIT_ACK_STATUS.CATCHUP_READY, cutover: true},
  {state: PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE},
  {remove: SOURCE_PARTITION_ID},
  {delete: SOURCE_PARTITION_ID},
  {state: PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE},
  {level: 'info', msg: 'Managed split source dissolution dispatched'},
  {state: PARTITION_TRANSITION_STATE.SPLIT_SOURCE_DISSOLVING},
  {state: null},
  {level: 'info',
    msg: 'Managed split terminal transition cleared after dissolution'},
]);

test('healthy-split-sequence-unchanged: the normal split path (plan, ' +
'provision, catch-up, cutover, dissolution) produces the HEAD event ' +
'sequence byte-for-byte',
async () => {
  const drive = await driveHealthySplit();
  assert.equal(drive.prepared.success, true);
  assert.deepEqual(drive.events, HEALTHY_SEQUENCE);
  assert.equal(drive.tableRow.active_partition_version, TARGET_VERSION);
});

test('budgets-and-cadence-unchanged: retry backoff, the provisioning ' +
'budget and poll cadence, and the split operation budget are the HEAD ' +
'values and the readiness wait reuses them',
async () => {
  const drive = await driveRunOneRetrySequence();
  assert.equal(drive.workflow.retryBaseDelayMs, 5000);
  assert.equal(drive.workflow.retryMaxDelayMs, 60000);
  assert.equal(QUERY_DEFAULTS.TABLE_CREATE_PROVISION_TIMEOUT_MS, 30000);
  assert.equal(QUERY_DEFAULTS.TABLE_CREATE_PROVISION_POLL_INTERVAL_MS, 50);
  assert.equal(TIMEOUT_BUDGET_DEFAULT.SPLIT_OPERATION_BUDGET_MS, 300000);
  const deferredRetry = drive.metadataAfterAttempt[0]?.[
    PARTITION_TRANSITION_METADATA_FIELD.RETRY
  ];
  assert.equal(deferredRetry?.backoffMs, 5000,
    'the first deferral schedules the unchanged base backoff');
  assert.equal(deferredRetry?.attemptCount, 1);
});

test('witness-deterministic: two identical virtual-clock drives produce ' +
'the identical event sequence',
async () => {
  const first = await driveRunOneRetrySequence();
  const second = await driveRunOneRetrySequence();
  assert.deepEqual(first.events, second.events);
  assert.deepEqual(
    first.partitionRows.map((row) => row.partition_id),
    second.partitionRows.map((row) => row.partition_id),
  );
  const refusedA = await driveCutoverWithDeniedRightLeader({
    workflowId: 'split-deterministic-a',
    routableAfterMs: CHILD_LEADER_ROUTABLE_AFTER_MS,
  });
  const refusedB = await driveCutoverWithDeniedRightLeader({
    workflowId: 'split-deterministic-b',
    routableAfterMs: CHILD_LEADER_ROUTABLE_AFTER_MS,
  });
  assert.deepEqual(refusedA.updateStates, refusedB.updateStates);
  assert.equal(refusedA.elapsedMs, refusedB.elapsedMs);
});
