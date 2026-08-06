import {test} from '../../src/test-helpers/tap.js';
import {TABLES} from '../../src/constants/index.js';
import {
  PARTITION_TRANSITION_METADATA_FIELD,
  PARTITION_TRANSITION_STATE,
} from '../../src/partition/partition-constants.js';
import {
  SPLIT_PARTICIPANT_PREFIX,
  SPLIT_ACK_STATUS,
} from '../../src/partition/split-ack-constants.js';
import {
  PARTICIPANT_ACK_FIELD,
} from '../../src/workflow/workflow-constants.js';
import {
  buildWorkflow,
} from './managed-split-workflow-test-helpers.js';

test('split terminal lifecycle: dissolution clears the durable ' +
'transition row and emits SPLIT_COMPLETED exactly at terminal',
async (t) => {
  const updateCalls = [];
  const deleteCalls = [];
  const completionPayloads = [];
  const removedReplicas = [];
  const partitionRows = [
    {partition_id: 'users-p1', partition_version: 1, state: 'NORMAL'},
    {partition_id: 'users-p-left', partition_version: 2, state: 'NORMAL'},
    {partition_id: 'users-p-right', partition_version: 2, state: 'NORMAL'},
    {partition_id: 'users-p3', partition_version: 1, state: 'NORMAL'},
  ];
  const {workflow} = buildWorkflow({
    updateCalls,
    topologyAdapter: null,
    listTablePartitionRows: () => partitionRows,
    listPartitionServiceRows: (partitionId) => ([
      {replica_id: `${partitionId}-r1`, node_id: 'node-a'},
    ]),
    deliverReplicaRemoval: async (request) => {
      removedReplicas.push(request.message);
      return {status: 'initiated'};
    },
    splitCompletionListener: (payload) => {
      completionPayloads.push(payload);
    },
    cdcIntegrationService: {
      async updateSystemTableRow(tableName, whereClause, data, updateOptions) {
        updateCalls.push({tableName, whereClause, data, options: updateOptions});
        return {success: true, affectedRows: 1};
      },
      async insertSystemTableRow() {
        return {success: true};
      },
      async deleteSystemTableRow(tableName, whereClause) {
        deleteCalls.push({tableName, whereClause});
        return {success: true, affectedRows: 1};
      },
    },
  });
  const workflowId = 'split-terminal-lifecycle';
  const record = {
    workflowId,
    ownerKey: 'users-p1',
    tableId: 'tbl-users',
    tableName: 'users',
    partitionId: 'users-p1',
    status: PARTITION_TRANSITION_STATE.SPLIT_BACKFILLING,
    metadata: {
      [PARTITION_TRANSITION_METADATA_FIELD.WORKFLOW_ID]: workflowId,
      [PARTITION_TRANSITION_METADATA_FIELD.PRIMARY_KEY_COLUMN]: 'id',
      [PARTITION_TRANSITION_METADATA_FIELD.SOURCE_PARTITION_ID]: 'users-p1',
      [PARTITION_TRANSITION_METADATA_FIELD.SPLIT_KEY]: 'm',
      [PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_IDS]: [
        'users-p-left',
        'users-p-right',
      ],
      [PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_VERSION]: 2,
      [PARTITION_TRANSITION_METADATA_FIELD.SIBLING_PARTITION_IDS]: [
        'users-p3',
      ],
    },
    createdAt: 1000,
    updatedAt: 1000,
    participants: new Map(),
  };
  await workflow.workflowCoordinator.registerWorkflow(record);
  const ownershipClaim = await workflow.claimSplitWorkflowOwnership(
    workflowId,
  );
  workflow.ensureCanonicalSplitParticipants(workflowId, record.metadata);
  const fenceToken = ownershipClaim.workflow.fenceToken;
  const sourceAck = (status, extra = {}) => ({
    [PARTICIPANT_ACK_FIELD.PARTICIPANT_KEY]:
      SPLIT_PARTICIPANT_PREFIX.SOURCE_PARTITION,
    [PARTICIPANT_ACK_FIELD.STATUS]: status,
    [PARTICIPANT_ACK_FIELD.FENCE_TOKEN]: fenceToken,
    ...extra,
  });

  // No terminal signal before the workflow actually lands: SPLIT_COMPLETED
  // must not fire at plan time, cutover, or any pre-terminal phase.
  await workflow.acknowledgeSourceParticipant(
    workflowId,
    sourceAck(SPLIT_ACK_STATUS.SNAPSHOT_STARTED, {
      [PARTICIPANT_ACK_FIELD.ACKNOWLEDGED_AT]: 999,
    }),
  );
  await workflow.acknowledgeSourceParticipant(
    workflowId,
    sourceAck(SPLIT_ACK_STATUS.CATCHUP_READY, {
      [PARTICIPANT_ACK_FIELD.ACKNOWLEDGED_AT]: 1000,
    }),
  );
  t.equal(
    completionPayloads.length,
    0,
    'SPLIT_COMPLETED must not fire at cutover — it is a terminal signal',
  );
  const cutoverWorkflow =
    workflow.workflowCoordinator.getWorkflowById(workflowId);
  t.equal(
    cutoverWorkflow.status,
    PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE,
    'the source catch-up ack must drive the durable cutover',
  );
  const cutoverUpdate = updateCalls.find((entry) =>
    entry.tableName === TABLES.TABLES &&
    entry.data.partition_transition_state ===
      PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE,
  );
  t.equal(
    cutoverUpdate.data.partition_count,
    3,
    'partition_count = 2 children + 1 carried-forward sibling = ' +
    'oldCount + 1',
  );

  // Terminal step: the source mirror-removed ack dissolves the source,
  // clears the tables transition row, and emits SPLIT_COMPLETED.
  await workflow.acknowledgeSourceParticipant(
    workflowId,
    sourceAck(SPLIT_ACK_STATUS.CLEANUP_COMPLETED, {
      [PARTICIPANT_ACK_FIELD.CHECKPOINT]: {sourceMirrorRemoved: true},
      [PARTICIPANT_ACK_FIELD.ACKNOWLEDGED_AT]: 1001,
    }),
  );

  t.equal(
    removedReplicas.length,
    1,
    'the retired source raft group must receive a replica removal',
  );
  t.ok(
    deleteCalls.some((entry) =>
      entry.tableName === TABLES.PARTITIONS &&
      entry.whereClause?.partition_id === 'users-p1'),
    'the retired source partition descriptor must be deleted',
  );

  const terminalClear = updateCalls.find((entry) =>
    entry.tableName === TABLES.TABLES &&
    entry.data.partition_transition_state === null,
  );
  t.ok(
    terminalClear,
    'the terminal step must clear the tables transition row so a ' +
    'second split of the table is admissible',
  );
  t.equal(
    terminalClear.data.pending_partition_version,
    null,
    'the terminal clear must also withdraw the pending epoch columns',
  );
  t.equal(
    terminalClear.options?.allowPendingVisibility,
    false,
    'the terminal clear is an epoch transition: no pending visibility',
  );

  t.equal(
    completionPayloads.length,
    1,
    'SPLIT_COMPLETED fires exactly once, at terminal',
  );
  t.same(
    {
      leftPartitionId: completionPayloads[0].leftPartition.partitionId,
      rightPartitionId: completionPayloads[0].rightPartition.partitionId,
      medianKey: completionPayloads[0].medianKey,
    },
    {
      leftPartitionId: 'users-p-left',
      rightPartitionId: 'users-p-right',
      medianKey: 'm',
    },
    'the terminal payload mirrors the planner result shape consumed by ' +
    'the stabilization-reset listener',
  );

  t.equal(
    workflow.workflowCoordinator.getWorkflowById(workflowId),
    null,
    'the in-memory workflow must be released at terminal',
  );

  // A second split of the same table is now admissible: the durable row
  // carries no transition state, so the admission gate sees a clean table.
  const secondSplitTableInfo = {
    table_id: 'tbl-users',
    table_name: 'users',
    partition_key: 'id',
    active_partition_version: 2,
    partition_transition_state: terminalClear.data
      .partition_transition_state,
    partition_transition_metadata: terminalClear.data
      .partition_transition_metadata,
  };
  t.equal(
    secondSplitTableInfo.partition_transition_state,
    null,
    'the durable row after terminal clear admits a second split',
  );
});
