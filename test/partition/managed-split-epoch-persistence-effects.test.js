import {test} from '../../src/test-helpers/tap.js';
import {TABLES} from '../../src/constants/index.js';
import {
  PARTITION_TRANSITION_METADATA_FIELD,
  PARTITION_TRANSITION_STATE,
} from '../../src/partition/partition-constants.js';
import {
  QUERY_ERROR_MSG,
} from '../../src/query/query-constants.js';
import {
  PARTICIPANT_ACK_FIELD,
} from '../../src/workflow/workflow-constants.js';
import {
  SPLIT_ACK_STATUS,
  SPLIT_PARTICIPANT_PREFIX,
} from '../../src/partition/split-ack-constants.js';
import {
  buildWorkflow,
  createTransactionCoordinator,
} from './managed-split-workflow-test-helpers.js';

const FIXTURE_SIBLING_PARTITION_ID = 'users-p3';

function buildCutoverWorkflowRecord(workflowId) {
  return {
    workflowId,
    ownerKey: 'users-p1',
    tableId: 'tbl-users',
    tableName: 'users',
    partitionId: 'users-p1',
    status: PARTITION_TRANSITION_STATE.SPLIT_BACKFILLING,
    metadata: {
      [PARTITION_TRANSITION_METADATA_FIELD.WORKFLOW_ID]: workflowId,
      [PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_VERSION]: 2,
      [PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_IDS]: [
        'users-p-left',
        'users-p-right',
      ],
    },
    createdAt: 1000,
    updatedAt: 1000,
  };
}

test('split cutover transition refuses to advance in-memory status ' +
  'when the durable epoch flip lands zero rows', async (t) => {
  const {workflow} = buildWorkflow({
    cdcIntegrationService: {
      async updateSystemTableRow() {
        // Duplicate/coalesced delivery: gateway reports success but the
        // tables row did not actually change.
        return {success: true, affectedRows: 0};
      },
      async insertSystemTableRow() {
        return {success: true};
      },
    },
  });
  const record = buildCutoverWorkflowRecord('split-zero-row-cutover');
  await workflow.workflowCoordinator.registerWorkflow(record);

  await t.rejects(
    workflow.advanceSplitPhase(
      record.workflowId,
      PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE,
    ),
    /did not take effect/,
    'a zero-row epoch flip must throw, not advance the workflow',
  );
  const current = workflow.workflowCoordinator.getWorkflowById(
    record.workflowId,
  );
  t.equal(
    current.status,
    PARTITION_TRANSITION_STATE.SPLIT_BACKFILLING,
    'in-memory status must stay at the durable phase after the refusal',
  );
});

test('split cutover transition disallows pending visibility on the ' +
  'epoch flip while routine transitions still tolerate it', async (t) => {
  const updateCalls = [];
  const {workflow} = buildWorkflow({updateCalls});
  const record = buildCutoverWorkflowRecord('split-epoch-options');
  await workflow.workflowCoordinator.registerWorkflow(record);

  await workflow.advanceSplitPhase(
    record.workflowId,
    PARTITION_TRANSITION_STATE.SPLIT_CATCHUP,
  );
  const catchupUpdate = updateCalls.find((entry) =>
    entry.tableName === TABLES.TABLES &&
    entry.data.partition_transition_state ===
      PARTITION_TRANSITION_STATE.SPLIT_CATCHUP,
  );
  t.equal(
    catchupUpdate.options?.allowPendingVisibility,
    true,
    'routine transitions keep tolerating pending cache visibility',
  );

  await workflow.advanceSplitPhase(
    record.workflowId,
    PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE,
  );
  const cutoverUpdate = updateCalls.find((entry) =>
    entry.tableName === TABLES.TABLES &&
    entry.data.partition_transition_state ===
      PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE,
  );
  t.equal(
    cutoverUpdate.options?.allowPendingVisibility,
    false,
    'the epoch flip must not tolerate pending visibility: an ' +
    'unconverged cutover is a failed cutover',
  );
});

test('split transition persistence fails closed when no CDC bridge is ' +
  'wired — in-memory status must not silently advance', async (t) => {
  const updateCalls = [];
  const {workflow} = buildWorkflow({updateCalls});
  const record = buildCutoverWorkflowRecord('split-no-cdc');
  await workflow.workflowCoordinator.registerWorkflow(record);

  // Simulate a lost CDC bridge AFTER registration: the durable write
  // path disappears between transitions.
  workflow.getCDCIntegrationService = () => null;

  await t.rejects(
    workflow.advanceSplitPhase(
      record.workflowId,
      PARTITION_TRANSITION_STATE.SPLIT_CATCHUP,
    ),
    {message: QUERY_ERROR_MSG.TABLE_SPLIT_TRANSITION_PERSIST_UNAVAILABLE},
  );
  const current = workflow.workflowCoordinator.getWorkflowById(
    record.workflowId,
  );
  t.equal(
    current.status,
    PARTITION_TRANSITION_STATE.SPLIT_BACKFILLING,
    'a missing durable write path must leave the in-memory phase unchanged',
  );
});

test('split sibling promotion refuses a zero-row partition epoch ' +
  'update', async (t) => {
  const {workflow} = buildWorkflow({
    cdcIntegrationService: {
      async updateSystemTableRow() {
        // Stale where-clause / vanished descriptor: no row changed.
        return {success: true, affectedRows: 0};
      },
      async insertSystemTableRow() {
        return {success: true};
      },
      async deleteSystemTableRow() {
        return {success: true};
      },
    },
  });

  await t.rejects(
    workflow.promoteSiblingPartitionVersion(
      FIXTURE_SIBLING_PARTITION_ID,
      2,
    ),
    /did not take effect/,
    'a sibling promotion that lands zero rows must throw — carrying a ' +
    'sibling forward on a phantom write strands its key range',
  );
});

test('split terminal transition clear refuses a zero-row tables ' +
  'update', async (t) => {
  const {workflow} = buildWorkflow({
    cdcIntegrationService: {
      async updateSystemTableRow() {
        return {success: true, affectedRows: 0};
      },
      async insertSystemTableRow() {
        return {success: true};
      },
      async deleteSystemTableRow() {
        return {success: true};
      },
    },
  });

  await t.rejects(
    workflow.persistTerminalTransitionClear({
      workflowId: 'split-terminal-clear',
      tableId: 'tbl-users',
    }),
    /did not take effect/,
    'a terminal clear that lands zero rows would wedge the table in ' +
    'transition state forever — it must throw',
  );
});

test('split FAILED transition withdraws the pending partition epoch ' +
  'fail-closed', async (t) => {
  const updateCalls = [];
  const {workflow} = buildWorkflow({updateCalls});
  const record = buildCutoverWorkflowRecord('split-failed-withdrawal');
  await workflow.workflowCoordinator.registerWorkflow(record);

  await workflow.advanceSplitPhase(
    record.workflowId,
    PARTITION_TRANSITION_STATE.FAILED,
  );
  const failedUpdate = updateCalls.find((entry) =>
    entry.tableName === TABLES.TABLES &&
    entry.data.partition_transition_state ===
      PARTITION_TRANSITION_STATE.FAILED,
  );
  t.ok(failedUpdate, 'the FAILED transition must persist to tables');
  t.equal(
    failedUpdate.data.pending_partition_version,
    null,
    'a FAILED split must withdraw pending_partition_version in the ' +
    'same mutation — the source stays authoritative at the active epoch',
  );
  t.equal(
    failedUpdate.options?.allowPendingVisibility,
    false,
    'the pending-version withdrawal is an epoch transition: it must ' +
    'not tolerate pending cache visibility',
  );
});

test('split cutover sets partition_count to target + sibling count ' +
  'and promotes the epoch', async (t) => {
  const updateCalls = [];
  const partitionRows = [
    {partition_id: 'users-p1', partition_version: 1, state: 'NORMAL'},
    {partition_id: 'users-p-left', partition_version: 2, state: 'NORMAL'},
    {partition_id: 'users-p-right', partition_version: 2, state: 'NORMAL'},
    {
      partition_id: FIXTURE_SIBLING_PARTITION_ID,
      partition_version: 1,
      state: 'NORMAL',
    },
  ];
  // No topologyAdapter: the workflow's authoritative partitions view is
  // the plain option, avoiding the cache-backed adapter binding.
  const {workflow} = buildWorkflow({
    updateCalls,
    topologyAdapter: null,
    listTablePartitionRows: (tableId) =>
      partitionRows.filter((row) => row.partition_id && tableId),
  });
  const record = {
    ...buildCutoverWorkflowRecord('split-cutover-partition-count'),
    participants: new Map(),
  };
  await workflow.workflowCoordinator.registerWorkflow(record);
  workflow.ensureCanonicalSplitParticipants(
    record.workflowId,
    record.metadata,
  );
  await workflow.workflowCoordinator.acknowledgeParticipant(
    record.workflowId,
    {
      [PARTICIPANT_ACK_FIELD.PARTICIPANT_KEY]:
        SPLIT_PARTICIPANT_PREFIX.SOURCE_PARTITION,
      [PARTICIPANT_ACK_FIELD.STATUS]: SPLIT_ACK_STATUS.CATCHUP_READY,
      [PARTICIPANT_ACK_FIELD.ACKNOWLEDGED_AT]: 1000,
    },
  );

  const cutoverApplied = await workflow.applySplitCutoverIfReady(
    record.workflowId,
  );
  t.equal(cutoverApplied, true, 'the cutover must apply');

  const siblingPromotion = updateCalls.find((entry) =>
    entry.tableName === TABLES.PARTITIONS &&
    (entry.whereClause?.partition_id === FIXTURE_SIBLING_PARTITION_ID ||
      entry.whereClause?.partitionId === FIXTURE_SIBLING_PARTITION_ID),
  );
  t.ok(
    siblingPromotion,
    'the sibling descriptor must be carried forward at cutover',
  );
  t.equal(
    siblingPromotion.data.partition_version,
    2,
    'the sibling must be promoted into the split target epoch',
  );

  const cutoverUpdate = updateCalls.find((entry) =>
    entry.tableName === TABLES.TABLES &&
    entry.data.partition_transition_state ===
      PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE,
  );
  t.ok(cutoverUpdate, 'the cutover transition must persist to tables');
  t.equal(
    cutoverUpdate.data.partition_count,
    3,
    'partition_count = targetIds (2) + carried-forward siblings (1) = ' +
    'oldCount + 1',
  );
  t.equal(
    cutoverUpdate.data.active_partition_version,
    2,
    'the cutover must promote the pending epoch to active',
  );
  t.equal(
    cutoverUpdate.data.pending_partition_version,
    null,
    'the cutover must clear the pending epoch',
  );
});

test('ensureChildPartitionMetadata removes an orphaned single child ' +
  'from a crashed attempt and re-inserts both children', async (t) => {
  const partitionInfos = {
    'users-p-left': {
      partition_id: 'users-p-left',
      table_id: 'tbl-users',
      table_name: 'users',
      partition_key_start: null,
      partition_key_end: 'm',
      partition_version: 2,
      replica_count: 3,
      size_bytes: 0,
      state: 'NORMAL',
    },
  };
  const deleteCalls = [];
  const insertCalls = [];
  const {workflow} = buildWorkflow({
    transactionCoordinator: createTransactionCoordinator(),
    getPartitionInfo: (partitionId) => partitionInfos[partitionId] || null,
    cdcIntegrationService: {
      async updateSystemTableRow() {
        return {success: true, affectedRows: 1};
      },
      async insertSystemTableRow(_tableName, row) {
        insertCalls.push(row.partition_id);
        partitionInfos[row.partition_id] = {...row};
        return {success: true};
      },
      async deleteSystemTableRow(_tableName, whereClause) {
        deleteCalls.push(whereClause.partition_id);
        delete partitionInfos[whereClause.partition_id];
        return {success: true, affectedRows: 1};
      },
    },
  });

  const childRow = (partitionId, keyStart, keyEnd) => ({
    partition_id: partitionId,
    table_id: 'tbl-users',
    table_name: 'users',
    partition_key_start: keyStart,
    partition_key_end: keyEnd,
    partition_version: 2,
    replica_count: 3,
    size_bytes: 0,
    state: 'NORMAL',
  });

  await workflow.ensureChildPartitionMetadata({
    leftPartitionMetadata: childRow('users-p-left', null, 'm'),
    rightPartitionMetadata: childRow('users-p-right', 'm', null),
  });

  t.same(
    deleteCalls,
    ['users-p-left'],
    'the orphaned survivor must be deleted, not wedged behind a ' +
    'terminal inconsistency error',
  );
  t.same(
    insertCalls.sort(),
    ['users-p-left', 'users-p-right'],
    'both children must be re-inserted after the orphan cleanup',
  );
  t.ok(
    partitionInfos['users-p-left'] && partitionInfos['users-p-right'],
    'both child rows must exist after recovery',
  );
});
