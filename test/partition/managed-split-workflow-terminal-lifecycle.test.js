import {registerFromRecordAsRead} from './workflow-record-test-support.js';
import {test} from '../../src/test-helpers/tap.js';
import {
  openRecordStore,
  openView,
  parsePartitionTransition,
  readAuthoritativelyFrom,
} from './workflow-record-sqlite-world.js';
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
      return {status: 'completed'};
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
  await registerFromRecordAsRead(workflow, record);
  const ownershipClaim = await workflow.claimSplitWorkflowOwnership(
    workflowId,
  );
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

// The production release-then-recover shape (the case the test above never
// exercised: it keeps the workflow in memory throughout). execute() releases
// the in-memory workflow in `finally`; here it is ALSO dropped before every
// acknowledgement, so each one recovers the workflow from the durable row
// (recoverWorkflowState). Every write is a change of the record, so nothing
// durable is lost with the projection: the owner-recorded SOURCE_DISSOLVED
// lands, the terminal clear runs and SPLIT_COMPLETED fires exactly once.
test('split terminal lifecycle recovered from the durable row between ' +
  'every acknowledgement reaches its terminal clear', async (t) => {
  const store = openRecordStore({partitions: [{partition_id: 'users-p1'},
    {partition_id: 'users-p3'}]});
  const view = openView(store);
  const completions = [];
  const {workflow} = buildWorkflow({cdcIntegrationService: store.cdcFor('A'),
    getTableInfo: () => view.row(), listTableInfos: () => view.list(),
    getPartitionInfo: (id) => store.partitionRow(id),
    parsePartitionTransition, topologyAdapter: null,
    listTablePartitionRows: () => store.partitionIds()
      .map((id) => store.partitionRow(id)),
    splitCompletionListener: (payload) => completions.push(payload),
    groupRetirementScheduler: {setTimeout: () => null, clearTimeout() {}},
    groupRetirementLeaseScheduler: {setTimeout: () => null,
      clearTimeout() {}}});
  readAuthoritativelyFrom(workflow, store);
  workflow.readCommittedGroupMembers = async () => ['r1'];
  workflow.listPartitionServiceRows = (partitionId) => [{
    partition_id: partitionId, replica_id: 'r1', node_id: 'n-r1'}];
  workflow.deliverReplicaRemoval = async () => ({status: 'completed'});
  const {workflowId} = await workflow.execute('users-p1');
  const fenceToken = store.metadata().workflowFenceToken;
  t.equal(workflow.workflowCoordinator.getWorkflowById(workflowId), null,
    'setup: execute released the in-memory workflow');
  for (const status of [SPLIT_ACK_STATUS.SNAPSHOT_STARTED,
    SPLIT_ACK_STATUS.CATCHUP_READY, SPLIT_ACK_STATUS.CUTOVER_APPLIED,
    SPLIT_ACK_STATUS.CLEANUP_COMPLETED]) {
    workflow.workflowCoordinator.removeWorkflow(workflowId);
    const ack = await workflow.acknowledgeSourceParticipant(workflowId, {
      [PARTICIPANT_ACK_FIELD.PARTICIPANT_KEY]:
        SPLIT_PARTICIPANT_PREFIX.SOURCE_PARTITION,
      [PARTICIPANT_ACK_FIELD.STATUS]: status,
      [PARTICIPANT_ACK_FIELD.FENCE_TOKEN]: fenceToken,
      [PARTICIPANT_ACK_FIELD.ACKNOWLEDGED_AT]: 1000});
    t.equal(ack.result, 'accepted', `${status} accepted after recovery`);
  }
  t.equal(store.tablesRow().partition_transition_state, null,
    'the terminal clear ran: the table carries no transition');
  t.notOk(store.partitionIds().includes('users-p1'),
    'the dissolved source row is gone');
  t.equal(completions.length, 1, 'SPLIT_COMPLETED fired exactly once');
});

// A refused owner-recorded outcome is never dispatched-and-done: the
// SOURCE_DISSOLVED acknowledgement the record refuses (here: the source
// participant carries a newer fence than the owner's) fails typed and loud -
// one ERROR naming the workflow, the fences and the reason - no "dissolution
// dispatched", no terminal clear, the step stays re-drivable.
test('split dissolution: a refused SOURCE_DISSOLVED acknowledgement fails ' +
  'typed and loud, never treated as done', async (t) => {
  const store = openRecordStore({partitions: [{partition_id: 'users-p1'},
    {partition_id: 'users-p3'}]});
  const view = openView(store);
  const lines = [];
  const sink = (level) => (message, fields) =>
    lines.push({level, message, fields});
  const {workflow} = buildWorkflow({cdcIntegrationService: store.cdcFor('A'),
    getTableInfo: () => view.row(), listTableInfos: () => view.list(),
    getPartitionInfo: (id) => store.partitionRow(id),
    parsePartitionTransition, topologyAdapter: null,
    logger: {debug() {}, info: sink('info'), warn: sink('warn'),
      error: sink('error')},
    listTablePartitionRows: () => store.partitionIds()
      .map((id) => store.partitionRow(id)),
    groupRetirementScheduler: {setTimeout: () => null, clearTimeout() {}},
    groupRetirementLeaseScheduler: {setTimeout: () => null,
      clearTimeout() {}}});
  readAuthoritativelyFrom(workflow, store);
  workflow.readCommittedGroupMembers = async () => ['r1'];
  workflow.listPartitionServiceRows = (partitionId) => [{
    partition_id: partitionId, replica_id: 'r1', node_id: 'n-r1'}];
  workflow.deliverReplicaRemoval = async () => ({status: 'completed'});
  const {workflowId} = await workflow.execute('users-p1');
  const fence = store.metadata().workflowFenceToken;
  const ack = (status, fenceToken) => workflow.acknowledgeSourceParticipant(
    workflowId, {
      [PARTICIPANT_ACK_FIELD.PARTICIPANT_KEY]:
        SPLIT_PARTICIPANT_PREFIX.SOURCE_PARTITION,
      [PARTICIPANT_ACK_FIELD.STATUS]: status,
      [PARTICIPANT_ACK_FIELD.FENCE_TOKEN]: fenceToken,
      [PARTICIPANT_ACK_FIELD.ACKNOWLEDGED_AT]: 1000});
  for (const status of [SPLIT_ACK_STATUS.SNAPSHOT_STARTED,
    SPLIT_ACK_STATUS.CATCHUP_READY, SPLIT_ACK_STATUS.CUTOVER_APPLIED]) {
    await ack(status, fence);
  }
  t.equal(store.tablesRow().partition_transition_state,
    'split_cutover_active', 'setup: cut over');
  // Right after the source row is deleted, the source participant's record
  // moves to a NEWER fence (a later acknowledgement): the record then
  // refuses the owner's SOURCE_DISSOLVED at the owner's fence.
  const deleteRow = workflow.deletePartitionMetadata.bind(workflow);
  workflow.deletePartitionMetadata = async (partitionId) => {
    const deleted = await deleteRow(partitionId);
    const metadata = store.metadata();
    metadata.participants['source-partition'].fenceToken = fence + 5;
    store.db.prepare('UPDATE tables SET partition_transition_metadata = ? ' +
      'WHERE table_id = ?').run(JSON.stringify(metadata), store.tableId);
    return deleted;
  };
  await ack(SPLIT_ACK_STATUS.CLEANUP_COMPLETED, fence);
  t.equal(store.tablesRow().partition_transition_state,
    'split_cutover_active', 'no terminal clear');
  t.equal(store.metadata().participants?.['source-partition']?.status,
    SPLIT_ACK_STATUS.CLEANUP_COMPLETED,
    'SOURCE_DISSOLVED is not on the record');
  t.notOk(store.partitionIds().includes('users-p1'),
    'setup: the source row was deleted');
  t.notOk(lines.some((line) => /dissolution dispatched/iu.test(line.message)),
    'never logged as dispatched');
  const refused = lines.filter((line) => line.level === 'error' &&
    /outcome refused/u.test(line.message));
  t.ok(refused.length >= 1, 'one typed ERROR');
  t.equal(refused[0]?.fields?.workflowId, workflowId, 'naming the workflow');
  t.equal(refused[0]?.fields?.status, SPLIT_ACK_STATUS.SOURCE_DISSOLVED,
    'the outcome');
  t.equal(refused[0]?.fields?.result, 'stale_fence', 'and the reason');
  t.equal(refused[0]?.fields?.receivedFenceToken, fence, 'the owner fence');
  t.equal(refused[0]?.fields?.currentFenceToken, fence + 5,
    'the record\'s fence');
});
