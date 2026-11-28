import {issueSplitSiblingPlan} from '../../src/partition/managed-split-sibling-plan.js';
import {openDescriptorRecordStore, parsePartitionTransition, readAuthoritativelyFrom} from './workflow-record-sqlite-world.js';
import {registerFromRecordAsRead} from './workflow-record-test-support.js';
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
  // Every record write is a change of the record (managed-workflow-record-
  // store.js): a zero-row epoch flip with no authoritative answer is
  // UNCONFIRMED - it throws and the projection does not advance.
  let zeroRows = false;
  const {workflow, durableRow} = buildWorkflow({});
  const cdc = workflow.getCDCIntegrationService();
  const update = cdc.updateSystemTableRow.bind(cdc);
  cdc.updateSystemTableRow = async (...args) => (zeroRows ?
    {success: true, affectedRows: 0} : update(...args));
  workflow.readAuthoritativeWorkflowRecord = async () => {
    throw new Error('tables owner unavailable');
  };
  const record = buildCutoverWorkflowRecord('split-zero-row-cutover');
  await registerFromRecordAsRead(workflow, record);
  zeroRows = true;
  const before = durableRow.partition_transition_metadata;
  await t.rejects(
    workflow.workflowCoordinator.updateWorkflow(record.workflowId,
      (current) => ({...current,
        status: PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE})),
    /did not land|refused/,
    'a zero-row epoch flip must throw, not advance the workflow',
  );
  t.equal(workflow.workflowCoordinator.getWorkflowById(record.workflowId)
    .status, PARTITION_TRANSITION_STATE.SPLIT_BACKFILLING,
  'the projection did not advance');
  t.equal(durableRow.partition_transition_metadata, before,
    'the record did not move');
});

test('split fenced cutover refuses when another owner claimed the record ' +
  '(stale owner)', async (t) => {
  // A concurrent owner claimed and rewrote the row between this owner's
  // registration and its transition: the transition's change, applied to
  // the authoritative record, refuses - it never lands.
  const {workflow, durableRow} = buildWorkflow({});
  workflow.readAuthoritativeWorkflowRecord = async () => ({...durableRow});
  const record = buildCutoverWorkflowRecord('split-fenced-stale-cas');
  await registerFromRecordAsRead(workflow, record);
  const metadata = JSON.parse(durableRow.partition_transition_metadata);
  durableRow.partition_transition_metadata = JSON.stringify({...metadata,
    [PARTITION_TRANSITION_METADATA_FIELD.WORKFLOW_OWNER_ID]: 'owner-other',
    [PARTITION_TRANSITION_METADATA_FIELD.WORKFLOW_FENCE_TOKEN]:
      metadata[PARTITION_TRANSITION_METADATA_FIELD.WORKFLOW_FENCE_TOKEN] + 1,
    [PARTITION_TRANSITION_METADATA_FIELD.WORKFLOW_LEASE_EXPIRES_AT]:
      Number.MAX_SAFE_INTEGER});
  const claimed = durableRow.partition_transition_metadata;
  const advanced = await workflow.advanceSplitPhase(record.workflowId,
    PARTITION_TRANSITION_STATE.SPLIT_CATCHUP).then(() => true,
    () => false);
  t.equal(advanced, false, 'the stale owner\'s transition is refused');
  t.equal(durableRow.partition_transition_metadata, claimed,
    'the other owner\'s record is untouched');
  t.equal(durableRow.partition_transition_state,
    PARTITION_TRANSITION_STATE.SPLIT_BACKFILLING, 'no phase landed');
});

// Re-derived for answers at commit (quest
// replica-admission-from-committed-operation, attempt 2): no transition write
// carries a visibility opt-out any more; routine and epoch-flip writes alike
// answer at their commit, and a reader that needs the flipped epoch in its
// projection waits for it at the write's position (census site 7).
test('split cutover: routine transitions and the epoch flip both answer at ' +
  'their commit with no visibility opt-out', async (t) => {
  const updateCalls = [];
  const {workflow} = buildWorkflow({updateCalls});
  const record = buildCutoverWorkflowRecord('split-epoch-options');
  await registerFromRecordAsRead(workflow, record);
  // Claim durable ownership so the fenced advance path holds a live
  // lease (the claim lands its own durable write through the same row).
  await workflow.claimSplitWorkflowOwnership(record.workflowId);

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
    'allowPendingVisibility' in (catchupUpdate.options ?? {}),
    false,
    'a routine transition carries no visibility opt-out',
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
    'allowPendingVisibility' in (cutoverUpdate.options ?? {}),
    false,
    'the epoch flip carries no visibility opt-out: it answers at its commit',
  );
});

test('split transition persistence fails closed when no CDC bridge is ' +
  'wired — in-memory status must not silently advance', async (t) => {
  const updateCalls = [];
  const {workflow} = buildWorkflow({updateCalls});
  const record = buildCutoverWorkflowRecord('split-no-cdc');
  await registerFromRecordAsRead(workflow, record);
  await workflow.claimSplitWorkflowOwnership(record.workflowId);

  // Simulate a lost CDC bridge AFTER the claim: the durable write
  // path disappears before the transition. The record's encoder throws
  // TRANSITION_PERSIST_UNAVAILABLE (nothing is written).
  workflow.getCDCIntegrationService = () => null;

  await t.rejects(
    workflow.workflowCoordinator.updateWorkflow(record.workflowId,
      (current) => ({...current,
        status: PARTITION_TRANSITION_STATE.SPLIT_CATCHUP})),
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

async function openCutoverWorld(t) {
  const store = await openDescriptorRecordStore(t, {partitions: [
    {partition_id: 'users-p1'}, {partition_id: 'users-p-left', partition_version: 2},
    {partition_id: 'users-p-right', partition_version: 2}, {partition_id: FIXTURE_SIBLING_PARTITION_ID},
  ]});
  const {workflow} = buildWorkflow({topologyAdapter: null,
    cdcIntegrationService: store.cdcFor('owner'), getTableInfo: store.tablesRow,
    listTableInfos: () => [store.tablesRow()], getPartitionInfo: store.partitionRow,
    listTablePartitionRows: () => store.partitionIds().map(store.partitionRow),
    parsePartitionTransition});
  readAuthoritativelyFrom(workflow, store);
  const record = buildCutoverWorkflowRecord('split-cutover-partition-count');
  const live = await registerFromRecordAsRead(workflow, record);
  for (const status of [SPLIT_ACK_STATUS.SNAPSHOT_STARTED, SPLIT_ACK_STATUS.CATCHUP_READY]) {
    const ack = await workflow.workflowCoordinator.acknowledgeParticipant(record.workflowId, {
      participantKey: SPLIT_PARTICIPANT_PREFIX.SOURCE_PARTITION, status, fenceToken: live.fenceToken});
    if (ack.result !== 'accepted') throw new Error(JSON.stringify(ack));
  }
  return {workflow, store, workflowId: record.workflowId};
}

test('recovered split cannot promote an out-of-plan sibling or epoch', async (t) => {
  const {workflow, store, workflowId} = await openCutoverWorld(t);
  const subject = {partitionId: FIXTURE_SIBLING_PARTITION_ID, priorVersion: 1, priorAttempt: 0,
    targetVersion: 2};
  const invalid = [{...subject, partitionId: 'users-p1'}, {...subject, partitionId: 'users-p-left'},
    {...subject, targetVersion: 3}, {...subject, priorVersion: 2, targetVersion: 3}, {...subject, action: 'promoteSibling'}];
  for (const forged of invalid) {
    await workflow.workflowCoordinator.updateWorkflow(workflowId, (current) => ({...current,
      metadata: {...current.metadata, splitIssuedSiblings: [forged]}}));
    workflow.workflowCoordinator.removeWorkflow(workflowId);
    workflow.recoverWorkflowState(workflowId);
    await t.rejects(workflow.applySplitCutoverIfReady(workflowId), {code: 'split-sibling-preimage-invalid'});
  }
  // The fresh+planned ID union must also reject a poisoned unissued plan.
  await workflow.workflowCoordinator.updateWorkflow(workflowId, (current) => ({...current,
    metadata: {...current.metadata, splitIssuedSiblings: [], siblingPartitionIds: ['users-p1']}}));
  await t.rejects(workflow.applySplitCutoverIfReady(workflowId), {code: 'split-sibling-preimage-invalid'});
  const updated = await workflow.workflowCoordinator.updateWorkflow(workflowId,
    (current) => ({...current,
      metadata: {...current.metadata, splitIssuedSiblings: [subject],
        siblingPartitionIds: [subject.partitionId]}}));
  const asRead = {...updated, metadata: {...updated.metadata, splitIssuedSiblings: [{...subject}]}};
  await workflow.workflowCoordinator.updateWorkflow(workflowId, (current) => ({...current,
    metadata: {...current.metadata, splitIssuedSiblings: [{...subject, foreign: 'same known fields'}]}}));
  await t.rejects(issueSplitSiblingPlan(workflow, asRead), {code: 'split-sibling-preimage-invalid'},
    'the actual record acquired an unexpected property between the calculation and its CAS');
  t.same(store.writes.filter((w) => /^UPDATE partitions /u.test(w.sql)), []);
  t.equal(store.tablesRow().active_partition_version, 1);
});

test('cutover refuses a sibling plan extended after its first promotion', async (t) => {
  const {workflow, store, workflowId} = await openCutoverWorld(t);
  const promote = workflow.promoteSiblingPartitionVersion.bind(workflow);
  const added = 'users-p4';
  workflow.promoteSiblingPartitionVersion = async (issued, subject) => {
    const answer = await promote(issued, subject);
    workflow.promoteSiblingPartitionVersion = promote;
    const {partition_id: oldId, ...row} = store.partitionRow(FIXTURE_SIBLING_PARTITION_ID);
    await store.cdcFor('metadata').insertSystemTableRow(TABLES.PARTITIONS,
      {...row, partition_id: added, partition_version: 1, split_descriptor_attempt: 0});
    const extended = await issueSplitSiblingPlan(workflow, issued);
    t.same(extended.metadata.splitIssuedSiblings.map((entry) => entry.partitionId), [oldId, added]);
    return answer;
  };
  t.equal(await workflow.applySplitCutoverIfReady(workflowId), false,
    'the old pass cannot publish its shorter issued set');
  t.equal(store.tablesRow().active_partition_version, 1);
  t.equal(store.partitionRow(added).partition_version, 1);
  t.equal(await workflow.applySplitCutoverIfReady(workflowId), true);
  t.equal(store.partitionRow(added).partition_version, 2);
  t.equal(store.tablesRow().partition_count, 4);
});

test('split sibling promotion refuses a zero-row partition epoch update', async (t) => {
  const {workflow, store, workflowId} = await openCutoverWorld(t);
  const promote = workflow.promoteSiblingPartitionVersion.bind(workflow);
  let changed = false;
  workflow.promoteSiblingPartitionVersion = async (issued, subject) => {
    t.same(store.metadata().splitIssuedSiblings, [subject]);
    changed = store.db.prepare('DELETE FROM partitions WHERE partition_id = ?')
      .run(subject.partitionId).changes === 1;
    return promote(issued, subject);
  };
  await t.rejects(workflow.applySplitCutoverIfReady(workflowId), {code: 'split_descriptor_ownership_unresolved'});
  t.ok(changed, 'the destination preimage disappeared after TABLES issued the subject');
  t.equal(store.tablesRow().active_partition_version, 1);
});

test('split terminal transition clear refuses a zero-row tables ' +
  'update', async (t) => {
  let zeroRows = false;
  const {workflow} = buildWorkflow({});
  const cdc = workflow.getCDCIntegrationService();
  const update = cdc.updateSystemTableRow.bind(cdc);
  cdc.updateSystemTableRow = async (...args) => (zeroRows ?
    {success: true, affectedRows: 0} : update(...args));
  workflow.readAuthoritativeWorkflowRecord = async () => {
    throw new Error('tables owner unavailable');
  };
  const record = {...buildCutoverWorkflowRecord('split-terminal-clear'),
    status: 'split_source_dissolving'};
  const registered = await registerFromRecordAsRead(workflow, record);
  zeroRows = true;

  await t.rejects(
    workflow.persistTerminalTransitionClear(registered),
    /did not land|refused/,
    'a terminal clear that lands zero rows would wedge the table in ' +
    'transition state forever — it must throw',
  );
});

test('split FAILED transition withdraws the pending partition epoch ' +
  'fail-closed', async (t) => {
  const updateCalls = [];
  const {workflow} = buildWorkflow({updateCalls});
  const record = buildCutoverWorkflowRecord('split-failed-withdrawal');
  await registerFromRecordAsRead(workflow, record);
  await workflow.claimSplitWorkflowOwnership(record.workflowId);

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
    'allowPendingVisibility' in (failedUpdate.options ?? {}),
    false,
    'the pending-version withdrawal answers at its commit with no ' +
    'visibility opt-out',
  );
});

test('split cutover sets partition_count to target + sibling count ' +
  'and promotes the epoch', async (t) => {
  const {workflow, store, workflowId} = await openCutoverWorld(t);
  const cutoverApplied = await workflow.applySplitCutoverIfReady(workflowId);
  t.equal(cutoverApplied, true, 'the cutover must apply');
  t.equal(store.partitionRow(FIXTURE_SIBLING_PARTITION_ID).partition_version, 2,
    'the committed sibling descriptor was carried forward');
  const cutover = store.tablesRow();
  t.equal(cutover.partition_transition_state, PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE);
  t.equal(cutover.partition_count, 3, 'two targets plus the carried-forward sibling');
  t.equal(cutover.active_partition_version, 2, 'cutover promotes the pending epoch');
  t.equal(cutover.pending_partition_version, null, 'cutover clears the pending epoch');
});

test('split retry adopts a matching child and inserts only its missing peer', async (t) => {
  const partitionInfos = {
    'users-p-left': {
      partition_id: 'users-p-left',
      table_id: 'tbl-users',
      table_name: 'users',
      partition_key_start: null,
      partition_key_end: 'm',
      partition_version: 2,
      partition_key_type: 'TEXT',
      split_descriptor_attempt: 4,
      replica_count: 3,
      size_bytes: 0,
      state: 'NORMAL',
    },
  };
  const late = {cachedLeft: null};
  const acquisitions = [];
  const insertCalls = [];
  const {workflow} = buildWorkflow({
    transactionCoordinator: createTransactionCoordinator(),
    getPartitionInfo: (partitionId) => partitionId === 'users-p-left' && late.cachedLeft ?
      late.cachedLeft : partitionInfos[partitionId] || null,
    cdcIntegrationService: {
      async updateSystemTableRow(_tableName, where, data) {
        acquisitions.push({where, data});
        const row = partitionInfos[where.partition_id];
        if (!Object.entries(where).every(([field, value]) => row[field] === value)) {
          return {success: true, affectedRows: 0};
        }
        Object.assign(row, data);
        return {success: true, affectedRows: 1};
      },
      async insertSystemTableRow(_tableName, row) {
        insertCalls.push(row.partition_id);
        partitionInfos[row.partition_id] = {...row};
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
    partition_key_type: 'TEXT',
    split_descriptor_attempt: 8,
    replica_count: 3,
    size_bytes: 0,
    state: 'NORMAL',
  });

  await workflow.ensureChildPartitionMetadata({
    leftPartitionMetadata: childRow('users-p-left', null, 'm'),
    rightPartitionMetadata: childRow('users-p-right', 'm', null),
  });

  t.same(acquisitions, [{
    where: {table_id: 'tbl-users', table_name: 'users', partition_key_start: null,
      partition_key_end: 'm', partition_key_type: 'TEXT', partition_version: 2, split_descriptor_attempt: 4,
      partition_id: 'users-p-left'},
    data: {split_descriptor_attempt: 8},
  }]);
  t.same(insertCalls, ['users-p-right']);
  t.equal(partitionInfos['users-p-left'].split_descriptor_attempt, 8);
  await t.rejects(workflow.ensureChildPartitionMetadata({
    leftPartitionMetadata: {...childRow('users-p-left', null, 'm'), split_descriptor_attempt: 4},
    rightPartitionMetadata: {...childRow('users-p-right', 'm', null), split_descriptor_attempt: 4},
  }), {code: 'split_child_descriptor_owner_invalid'});
  t.equal(acquisitions.length, 1, 'an old attempt cannot acquire the successor row');
  late.cachedLeft = {...partitionInfos['users-p-left']};
  partitionInfos['users-p-left'].partition_key_end = 'z';
  await t.rejects(workflow.ensureChildPartitionMetadata({
    leftPartitionMetadata: childRow('users-p-left', null, 'm'),
    rightPartitionMetadata: childRow('users-p-right', 'm', null),
  }), {code: 'split_child_descriptor_write_refused'});
  t.equal(partitionInfos['users-p-left'].partition_key_end, 'z',
    'a matching cached attempt cannot authorize acquisition of a changed durable range');
  t.ok(
    partitionInfos['users-p-left'] && partitionInfos['users-p-right'],
    'both child rows must exist after recovery',
  );
});
