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
  buildWorkflow,
  createTransactionCoordinator,
} from './managed-split-workflow-test-helpers.js';

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
