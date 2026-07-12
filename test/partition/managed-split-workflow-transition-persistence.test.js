import {test} from '../../src/test-helpers/tap.js';
import {TABLES} from '../../src/constants/index.js';
import {
  MERGE_OWNER_MANAGED_PHASES,
  PARTITION_TRANSITION_METADATA_FIELD,
  PARTITION_TRANSITION_STATE,
  SPLIT_OWNER_MANAGED_PHASES,
} from '../../src/partition/partition-constants.js';
import {
  SPLIT_ACK_CHECKPOINT_FIELD,
  SPLIT_PARTICIPANT_PREFIX,
  SPLIT_ACK_STATUS,
} from '../../src/partition/split-ack-constants.js';
import {
  QUERY_ERROR_MSG,
} from '../../src/query/query-constants.js';
import {
  STORAGE_ADMISSION_DECISION_TYPE,
} from '../../src/rebalancer/storage-admission-constants.js';
import {
  TIMEOUT_BUDGET_CLASSIFICATION,
} from '../../src/control-plane/timeout-budget.js';
import {
} from '../../src/workflow/workflow-constants.js';
import {
  buildWorkflow,
  createAdmissionResult,
  createTransactionCoordinator,
} from './managed-split-workflow-test-helpers.js';

const DESCRIPTOR_EPOCH_REJECTED_MESSAGE =
  'Managed split partition descriptor epoch rejected stale evidence';

test('ManagedSplitWorkflow reuses persisted split plan and child metadata ' +
  'on retryable failed execution transitions', async (t) => {
  const existingWorkflowId = 'split-tbl-users-users-p1-v2';
  const existingTransition = {
    state: PARTITION_TRANSITION_STATE.FAILED,
    metadata: {
      [PARTITION_TRANSITION_METADATA_FIELD.WORKFLOW_ID]:
        existingWorkflowId,
      [PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_VERSION]: 2,
      [PARTITION_TRANSITION_METADATA_FIELD.SPLIT_KEY]: 'm',
      [PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_IDS]: [
        'users-p-left',
        'users-p-right',
      ],
      [PARTITION_TRANSITION_METADATA_FIELD.FAILURE]: {
        classification: 'split_execution_failure',
        message:
          'Timed out waiting for routable partition service for partition ' +
          'users-p-right',
        timeoutClassification: {
          classification:
            TIMEOUT_BUDGET_CLASSIFICATION.PUBLICATION_WAIT_TIMEOUT,
        },
      },
    },
  };
  const sourcePartition = {
    partition_id: 'users-p1',
    table_id: 'tbl-users',
    table_name: 'users',
    partition_key_start: null,
    partition_key_end: null,
    partition_version: 1,
    replica_count: 3,
    leader_node_id: 'node-a',
    size_bytes: 128,
  };
  const leftPartition = {
    partition_id: 'users-p-left',
    table_id: 'tbl-users',
    table_name: 'users',
    partition_key_start: null,
    partition_key_end: 'm',
    partition_version: 2,
    replica_count: 3,
    leader_node_id: null,
    size_bytes: 0,
  };
  const rightPartition = {
    partition_id: 'users-p-right',
    table_id: 'tbl-users',
    table_name: 'users',
    partition_key_start: 'm',
    partition_key_end: null,
    partition_version: 2,
    replica_count: 3,
    leader_node_id: null,
    size_bytes: 0,
  };
  const insertCalls = [];
  const {
    workflow,
    provisionCalls,
  } = buildWorkflow({
    getPartitionInfo: (partitionId) => {
      switch (partitionId) {
      case 'users-p1':
        return sourcePartition;
      case 'users-p-left':
        return leftPartition;
      case 'users-p-right':
        return rightPartition;
      default:
        return null;
      }
    },
    getTableInfo: () => ({
      table_id: 'tbl-users',
      table_name: 'users',
      partition_key: 'id',
      active_partition_version: 1,
      partition_transition_state: PARTITION_TRANSITION_STATE.FAILED,
      partition_transition_metadata: JSON.stringify(existingTransition.metadata),
    }),
    parsePartitionTransition: () => existingTransition,
    buildManagedSplitPlan: async () => {
      t.fail('retryable failed execution should reuse persisted split plan metadata');
    },
    cdcIntegrationService: {
      async updateSystemTableRow() {
        return {success: true, affectedRows: 1};
      },
      async insertSystemTableRow(tableName, row) {
        insertCalls.push({tableName, row});
        return {success: true};
      },
    },
  });

  const result = await workflow.execute('users-p1');

  t.equal(result.success, true);
  t.equal(
    insertCalls.length,
    0,
    'retryable failed execution should not reinsert child partition metadata when rows already exist',
  );
  t.same(
    provisionCalls.map((call) => call.partitionId),
    ['users-p-left', 'users-p-right'],
    'retryable failed execution should provision the persisted split child IDs',
  );
});

test('ManagedSplitWorkflow rejects stale persisted split target version',
  async (t) => {
    const {workflow} = buildWorkflow();

    t.throws(
      () => workflow.resolveTargetPartitionVersion(
        {
          table_id: 'tbl-users',
          table_name: 'users',
          partition_key: 'id',
          active_partition_version: 4,
        },
        {
          metadata: {
            [PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_VERSION]:
              2,
          },
        },
      ),
      {message: DESCRIPTOR_EPOCH_REJECTED_MESSAGE},
    );
  });

test('ManagedSplitWorkflow wraps partition metadata insertion in ' +
  'transaction boundary', async (t) => {
  const txCalls = [];
  const txCoordinator = createTransactionCoordinator(() => 1000);
  const originalBegin = txCoordinator.begin.bind(txCoordinator);
  const originalCommit = txCoordinator.commit.bind(txCoordinator);
  txCoordinator.begin = async (sessionId) => {
    txCalls.push(`begin:${sessionId}`);
    return originalBegin(sessionId);
  };
  txCoordinator.commit = async (sessionId) => {
    txCalls.push(`commit:${sessionId}`);
    return originalCommit(sessionId);
  };

  const insertCalls = [];
  const {workflow} = buildWorkflow({
    transactionCoordinator: txCoordinator,
    cdcIntegrationService: {
      async updateSystemTableRow() {
        return {success: true, affectedRows: 1};
      },
      async insertSystemTableRow(tableName, row) {
        insertCalls.push({tableName, partitionId: row.partition_id});
        return {success: true};
      },
    },
  });
  workflow.transactionCoordinator = txCoordinator;

  const result = await workflow.execute('users-p1');

  t.equal(result.success, true);
  t.equal(
    insertCalls.length,
    2,
    'both partition metadata rows must be inserted',
  );
  t.ok(
    txCalls.some((c) => c.startsWith('begin:')),
    'transaction begin must be called for atomic partition insert',
  );
  t.ok(
    txCalls.some((c) => c.startsWith('commit:')),
    'transaction commit must be called for atomic partition insert',
  );
});

test('ManagedSplitWorkflow fails loudly when storageAdmissionService ' +
  'is not wired', async (t) => {
  // After removing the fallback dual-path, a missing admission service
  // must cause a hard failure rather than silently blocking splits.
  const {workflow} = buildWorkflow({
    storageAdmissionService: null,
    getRoutablePartitionServiceNodeIds: () => ['node-a'],
    calculateQuorumReplicaCount: () => 2,
    resolveProvisionTargetNodeIds: () => [],
  });

  try {
    await workflow.execute('users-p1');
    t.fail('should have thrown when storageAdmissionService is null');
  } catch (error) {
    t.ok(
      error instanceof TypeError,
      'missing admission service should throw TypeError',
    );
  }
});

test('ManagedSplitWorkflow with storageAdmissionService in observe mode ' +
  'overrides denial when quorum is transiently insufficient', async (t) => {
  // When the admission service is properly wired and in observe mode
  // (the default), it should override denials and allow the split even
  // when quorum is transiently insufficient.
  const admissionCalls = [];
  const {
    workflow,
    provisionCalls,
  } = buildWorkflow({
    storageAdmissionService: {
      async checkSplit(payload) {
        admissionCalls.push(payload);
        return createAdmissionResult({
          allowed: true,
          decisionType: STORAGE_ADMISSION_DECISION_TYPE.ADMITTED,
          eligibleNodeIds: payload.targetNodeIds,
        });
      },
    },
    getRoutablePartitionServiceNodeIds: () => ['node-a'],
    calculateQuorumReplicaCount: () => 2,
    resolveProvisionTargetNodeIds: () => ['node-b'],
  });

  const result = await workflow.execute('users-p1');

  t.equal(
    result.success,
    true,
    'admission service with observe mode should allow the split',
  );
  t.equal(admissionCalls.length, 1, 'admission service should be consulted');
  t.ok(
    provisionCalls.length > 0,
    'child provisioning should proceed after admission',
  );
});

test('ManagedSplitWorkflow silently falls back to sequential writes ' +
  'when transactionCoordinator is absent — atomic topology path must ' +
  'fail closed instead', async (t) => {
  // This test reproduces the architectural contradiction described in
  // Requirement 5 and Design §6: insertPartitionMetadataAtomically
  // silently degrades to sequential writes when the transaction
  // coordinator is not wired, instead of refusing to run the path.
  //
  // The correct behavior is fail-closed: if the atomic cut point
  // cannot be performed atomically, the path must throw rather than
  // silently weaken its semantics.
  const insertCalls = [];
  const {workflow} = buildWorkflow({
    transactionCoordinator: null,
    cdcIntegrationService: {
      async updateSystemTableRow() {
        return {success: true, affectedRows: 1};
      },
      async insertSystemTableRow(tableName, row) {
        insertCalls.push({tableName, partitionId: row.partition_id});
        return {success: true};
      },
    },
  });

  // Confirm the coordinator is absent.
  t.equal(
    workflow.transactionCoordinator,
    null,
    'transactionCoordinator must be absent for this test',
  );

  await t.rejects(
    workflow.execute('users-p1'),
    {
      message:
        QUERY_ERROR_MSG.TABLE_SPLIT_TRANSACTION_COORDINATOR_REQUIRED,
    },
    'atomic split cut point must fail closed without a transaction coordinator',
  );
  t.equal(
    insertCalls.length,
    0,
    'no child partition metadata rows may be inserted without a transaction',
  );
});


// ── Task 5.1: ManagedSplitWorkflow is the only split lifecycle owner ──

test('advanceSplitPhase rejects phases not in the owner-managed set ' +
  '(uses ManagedSplitWorkflow as canonical split owner)', async (t) => {
  const {workflow} = buildWorkflow();
  await workflow.execute('users-p1');

  // The workflow is removed in the finally block of executeInternal,
  // so we need a fresh workflow with an active registration.
  const {workflow: freshWorkflow} = buildWorkflow();
  // Register a workflow manually to test advanceSplitPhase in isolation.
  const wfCoordinator = freshWorkflow.workflowCoordinator;
  const wfRecord = await wfCoordinator.registerWorkflow({
    workflowId: 'split-test-phase-reject',
    ownerKey: 'users-p1',
    tableId: 'tbl-users',
    tableName: 'users',
    partitionId: 'users-p1',
    status: PARTITION_TRANSITION_STATE.SPLIT_PREPARING,
    metadata: {},
    createdAt: 1000,
    updatedAt: 1000,
  });

  try {
    await freshWorkflow.advanceSplitPhase(
      wfRecord.workflowId,
      'invalid_phase_not_in_set',
    );
    t.fail('advanceSplitPhase should reject invalid phases');
  } catch (error) {
    t.equal(
      error.message,
      QUERY_ERROR_MSG.TABLE_SPLIT_INVALID_PHASE_TRANSITION,
      'error message must reference the owner-managed phase set',
    );
  }
});

test('advanceSplitPhase rejects unknown workflow IDs ' +
  '(uses ManagedSplitWorkflow as canonical split owner)', async (t) => {
  const {workflow} = buildWorkflow();

  try {
    await workflow.advanceSplitPhase(
      'nonexistent-workflow-id',
      PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE,
    );
    t.fail('advanceSplitPhase should reject unknown workflow IDs');
  } catch (error) {
    t.equal(
      error.message,
      QUERY_ERROR_MSG.TABLE_SPLIT_WORKFLOW_NOT_FOUND,
      'error message must indicate workflow not found',
    );
  }
});

test('advanceSplitPhase persists the phase transition through the ' +
  'workflow coordinator (uses ManagedSplitWorkflow as canonical ' +
  'split owner)', async (t) => {
  const updateCalls = [];
  const {workflow} = buildWorkflow({updateCalls});

  // Register a workflow to test advanceSplitPhase in isolation.
  const wfCoordinator = workflow.workflowCoordinator;
  await wfCoordinator.registerWorkflow({
    workflowId: 'split-test-advance',
    ownerKey: 'users-p1',
    tableId: 'tbl-users',
    tableName: 'users',
    partitionId: 'users-p1',
    status: PARTITION_TRANSITION_STATE.SPLIT_BACKFILLING,
    metadata: {
      [PARTITION_TRANSITION_METADATA_FIELD.WORKFLOW_ID]:
        'split-test-advance',
      [PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_VERSION]: 2,
      [PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_IDS]: [
        'users-p-left',
        'users-p-right',
      ],
    },
    createdAt: 1000,
    updatedAt: 1000,
  });

  await workflow.advanceSplitPhase(
    'split-test-advance',
    PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE,
    {
      [PARTITION_TRANSITION_METADATA_FIELD.CUTOVER_APPLIED_AT]: 2000,
    },
  );

  const cutoverUpdate = updateCalls.find((entry) =>
    entry.tableName === TABLES.TABLES &&
    entry.data.partition_transition_state ===
      PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE,
  );
  t.ok(
    cutoverUpdate,
    'advanceSplitPhase must persist the cutover transition ' +
    'through the workflow coordinator',
  );
  t.equal(
    cutoverUpdate.data.active_partition_version,
    2,
    'cutover transition must promote target version to active',
  );
  t.equal(
    cutoverUpdate.data.pending_partition_version,
    null,
    'cutover transition must clear pending version',
  );
  t.equal(
    cutoverUpdate.data.partition_count,
    2,
    'cutover transition must set partition count from target IDs',
  );
  const persistedMetadata = JSON.parse(
    cutoverUpdate.data.partition_transition_metadata,
  );
  t.equal(
    persistedMetadata[
      PARTITION_TRANSITION_METADATA_FIELD.CUTOVER_APPLIED_AT
    ],
    2000,
    'phase metadata must be merged into persisted transition metadata',
  );
});

test('every PARTITION_TRANSITION_STATE value is owner-managed by its ' +
  'workflow: split phases by SPLIT_OWNER_MANAGED_PHASES, merge phases by ' +
  'MERGE_OWNER_MANAGED_PHASES', (t) => {
  const allPhases = Object.values(PARTITION_TRANSITION_STATE);
  const mergeOnlyPrefix = 'merge_';
  for (const phase of allPhases) {
    t.ok(
      SPLIT_OWNER_MANAGED_PHASES.has(phase) ||
        MERGE_OWNER_MANAGED_PHASES.has(phase),
      `${phase} must be owner-managed by a workflow phase set`,
    );
    if (!phase.startsWith(mergeOnlyPrefix)) {
      t.ok(
        SPLIT_OWNER_MANAGED_PHASES.has(phase),
        `${phase} must be in SPLIT_OWNER_MANAGED_PHASES`,
      );
    }
  }
  const ownerManagedUnion = new Set([
    ...SPLIT_OWNER_MANAGED_PHASES,
    ...MERGE_OWNER_MANAGED_PHASES,
  ]);
  t.equal(
    ownerManagedUnion.size,
    allPhases.length,
    'owner-managed phase sets must not contain extra entries',
  );
  t.end();
});

test('PARTITION_TRANSITION_STATE includes SPLIT_CATCHUP as a ' +
  'canonical constant — no bare string allowed', (t) => {
  t.equal(
    PARTITION_TRANSITION_STATE.SPLIT_CATCHUP,
    'split_catchup',
    'SPLIT_CATCHUP must be a named constant in PARTITION_TRANSITION_STATE',
  );
  t.ok(
    SPLIT_OWNER_MANAGED_PHASES.has(
      PARTITION_TRANSITION_STATE.SPLIT_CATCHUP,
    ),
    'SPLIT_CATCHUP must be in the owner-managed phase set',
  );
  t.end();
});

// ── Task 5.2: Persist participant state and source checkpoint ──

test('persistWorkflowTransition includes participant state in ' +
  'durable metadata when participants exist (Req 2, 3)', async (t) => {
  const updateCalls = [];
  const {workflow} = buildWorkflow({updateCalls});

  // Register a workflow and add participants via the coordinator.
  const wfCoordinator = workflow.workflowCoordinator;
  const wfRecord = await wfCoordinator.registerWorkflow({
    workflowId: 'split-participant-persist',
    ownerKey: 'users-p1',
    tableId: 'tbl-users',
    tableName: 'users',
    partitionId: 'users-p1',
    status: PARTITION_TRANSITION_STATE.SPLIT_BACKFILLING,
    metadata: {
      [PARTITION_TRANSITION_METADATA_FIELD.WORKFLOW_ID]:
        'split-participant-persist',
      [PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_VERSION]: 2,
    },
    createdAt: 1000,
    updatedAt: 1000,
  });

  // Add participants through the canonical coordinator path.
  await wfCoordinator.upsertParticipant(wfRecord.workflowId, {
    participantId: SPLIT_PARTICIPANT_PREFIX.LEFT_CHILD,
    participantKey: SPLIT_PARTICIPANT_PREFIX.LEFT_CHILD,
    status: SPLIT_ACK_STATUS.CHILD_PROVISIONED,
    fenceToken: 1,
  });
  await wfCoordinator.upsertParticipant(wfRecord.workflowId, {
    participantId: SPLIT_PARTICIPANT_PREFIX.RIGHT_CHILD,
    participantKey: SPLIT_PARTICIPANT_PREFIX.RIGHT_CHILD,
    status: SPLIT_ACK_STATUS.CHILD_PROVISIONED,
    fenceToken: 1,
  });
  await wfCoordinator.upsertParticipant(wfRecord.workflowId, {
    participantId: SPLIT_PARTICIPANT_PREFIX.SOURCE_PARTITION,
    participantKey: SPLIT_PARTICIPANT_PREFIX.SOURCE_PARTITION,
    status: SPLIT_ACK_STATUS.BACKFILL_PROGRESS,
    fenceToken: 1,
  });

  // Advance the phase to trigger a persist with participants.
  await workflow.advanceSplitPhase(
    wfRecord.workflowId,
    PARTITION_TRANSITION_STATE.SPLIT_CATCHUP,
  );

  const catchupUpdate = updateCalls.find((entry) =>
    entry.tableName === TABLES.TABLES &&
    entry.data.partition_transition_state ===
      PARTITION_TRANSITION_STATE.SPLIT_CATCHUP,
  );
  t.ok(catchupUpdate, 'catchup transition must be persisted');

  const persisted = JSON.parse(
    catchupUpdate.data.partition_transition_metadata,
  );
  const participants =
    persisted[PARTITION_TRANSITION_METADATA_FIELD.PARTICIPANTS];
  t.ok(participants, 'persisted metadata must include participants');
  t.equal(
    participants[SPLIT_PARTICIPANT_PREFIX.LEFT_CHILD].status,
    SPLIT_ACK_STATUS.CHILD_PROVISIONED,
    'left-child participant status must be persisted',
  );
  t.equal(
    participants[SPLIT_PARTICIPANT_PREFIX.RIGHT_CHILD].status,
    SPLIT_ACK_STATUS.CHILD_PROVISIONED,
    'right-child participant status must be persisted',
  );
  t.equal(
    participants[SPLIT_PARTICIPANT_PREFIX.SOURCE_PARTITION].status,
    SPLIT_ACK_STATUS.BACKFILL_PROGRESS,
    'source-partition participant status must be persisted',
  );
});

test('persistWorkflowTransition includes source checkpoint in ' +
  'durable metadata when source-partition has checkpoint ' +
  '(Req 2, Design §3)', async (t) => {
  const updateCalls = [];
  const {workflow} = buildWorkflow({updateCalls});

  const wfCoordinator = workflow.workflowCoordinator;
  const wfRecord = await wfCoordinator.registerWorkflow({
    workflowId: 'split-checkpoint-persist',
    ownerKey: 'users-p1',
    tableId: 'tbl-users',
    tableName: 'users',
    partitionId: 'users-p1',
    status: PARTITION_TRANSITION_STATE.SPLIT_BACKFILLING,
    metadata: {
      [PARTITION_TRANSITION_METADATA_FIELD.WORKFLOW_ID]:
        'split-checkpoint-persist',
      [PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_VERSION]: 2,
    },
    createdAt: 1000,
    updatedAt: 1000,
  });

  // Add source-partition participant with checkpoint data.
  await wfCoordinator.upsertParticipant(wfRecord.workflowId, {
    participantId: SPLIT_PARTICIPANT_PREFIX.SOURCE_PARTITION,
    participantKey: SPLIT_PARTICIPANT_PREFIX.SOURCE_PARTITION,
    status: SPLIT_ACK_STATUS.CATCHUP_READY,
    fenceToken: 1,
    checkpoint: {
      [SPLIT_ACK_CHECKPOINT_FIELD.SNAPSHOT_REVISION]: 123,
      [SPLIT_ACK_CHECKPOINT_FIELD.LAST_APPLIED_DELTA]: 456,
    },
  });

  // Advance phase to trigger persist.
  await workflow.advanceSplitPhase(
    wfRecord.workflowId,
    PARTITION_TRANSITION_STATE.SPLIT_CATCHUP,
  );

  const catchupUpdate = updateCalls.find((entry) =>
    entry.tableName === TABLES.TABLES &&
    entry.data.partition_transition_state ===
      PARTITION_TRANSITION_STATE.SPLIT_CATCHUP,
  );
  t.ok(catchupUpdate, 'catchup transition must be persisted');

  const persisted = JSON.parse(
    catchupUpdate.data.partition_transition_metadata,
  );

  // Verify source checkpoint is extracted to top-level metadata.
  const sourceCheckpoint =
    persisted[PARTITION_TRANSITION_METADATA_FIELD.SOURCE_CHECKPOINT];
  t.ok(sourceCheckpoint, 'persisted metadata must include sourceCheckpoint');
  t.equal(
    sourceCheckpoint[SPLIT_ACK_CHECKPOINT_FIELD.SNAPSHOT_REVISION],
    123,
    'sourceCheckpoint.snapshotRevision must match participant checkpoint',
  );
  t.equal(
    sourceCheckpoint[SPLIT_ACK_CHECKPOINT_FIELD.LAST_APPLIED_DELTA],
    456,
    'sourceCheckpoint.lastAppliedDelta must match participant checkpoint',
  );

  // Verify participant also carries checkpoint inline.
  const participants =
    persisted[PARTITION_TRANSITION_METADATA_FIELD.PARTICIPANTS];
  t.same(
    participants[SPLIT_PARTICIPANT_PREFIX.SOURCE_PARTITION].checkpoint,
    {
      [SPLIT_ACK_CHECKPOINT_FIELD.SNAPSHOT_REVISION]: 123,
      [SPLIT_ACK_CHECKPOINT_FIELD.LAST_APPLIED_DELTA]: 456,
    },
    'source-partition participant must carry checkpoint inline',
  );
});

test('ManagedSplitWorkflow tolerates pending visibility on durable split ' +
  'transition writes', async (t) => {
  const updateCalls = [];
  const {workflow} = buildWorkflow({
    updateCalls,
    cdcIntegrationService: {
      async updateSystemTableRow(tableName, whereClause, data, updateOptions) {
        updateCalls.push({tableName, whereClause, data, options: updateOptions});
        return {
          success: true,
          affectedRows: 1,
          visibilityState: 'deferred_by_pressure',
        };
      },
      async insertSystemTableRow(tableName, row) {
        updateCalls.push({tableName, row, options: null});
        return {success: true};
      },
    },
  });

  const result = await workflow.execute('users-p1');

  t.equal(result.success, true,
    'split execution should continue after authoritative transition writes');
  const workflowUpdates = updateCalls.filter((entry) =>
    entry.tableName === TABLES.TABLES && entry.data,
  );
  t.ok(workflowUpdates.length > 0,
    'workflow transition writes should be recorded through the gateway');
  for (const update of workflowUpdates) {
    t.equal(update.options?.allowPendingVisibility, true,
      'durable split transition writes must tolerate pending cache visibility');
  }
});

test('ManagedSplitWorkflow tolerates authoritative confirmation pending on durable split ' +
  'transition writes', async (t) => {
  const updateCalls = [];
  const {workflow} = buildWorkflow({
    updateCalls,
    cdcIntegrationService: {
      async updateSystemTableRow(tableName, whereClause, data, updateOptions) {
        updateCalls.push({tableName, whereClause, data, options: updateOptions});
        return {
          success: true,
          affectedRows: 1,
          visibilityState: 'authoritative_confirmation_pending',
        };
      },
      async insertSystemTableRow(tableName, row) {
        updateCalls.push({tableName, row, options: null});
        return {success: true};
      },
    },
  });

  const result = await workflow.execute('users-p1');

  t.equal(result.success, true,
    'split execution should continue while durable transition confirmation is still pending');
  const workflowUpdates = updateCalls.filter((entry) =>
    entry.tableName === TABLES.TABLES && entry.data,
  );
  t.ok(workflowUpdates.length > 0,
    'workflow transition writes should still route through the gateway');
  for (const update of workflowUpdates) {
    t.equal(update.options?.allowPendingVisibility, true,
      'durable split transition writes must continue to allow pending visibility confirmation');
  }
});

test('persistWorkflowTransition persists canonical split participants and ' +
  'omits sourceCheckpoint before acknowledgements arrive', async (t) => {
  const updateCalls = [];
  const {workflow} = buildWorkflow({updateCalls});

  // Execute a normal split before any participant acknowledgements arrive.
  await workflow.execute('users-p1');

  // Find the backfilling transition (last phase in executeInternal).
  const backfillUpdate = updateCalls.find((entry) =>
    entry.tableName === TABLES.TABLES &&
    entry.data.partition_transition_state ===
      PARTITION_TRANSITION_STATE.SPLIT_BACKFILLING,
  );
  t.ok(backfillUpdate, 'backfilling transition must be persisted');

  const persisted = JSON.parse(
    backfillUpdate.data.partition_transition_metadata,
  );
  const participants =
    persisted[PARTITION_TRANSITION_METADATA_FIELD.PARTICIPANTS];
  t.ok(participants, 'metadata must include the canonical split participants');
  t.equal(
    participants[SPLIT_PARTICIPANT_PREFIX.SOURCE_PARTITION].status,
    null,
    'source participant should exist before acknowledgements are emitted',
  );
  t.equal(
    participants[SPLIT_PARTICIPANT_PREFIX.LEFT_CHILD].status,
    null,
    'left child participant should exist before acknowledgements are emitted',
  );
  t.equal(
    participants[SPLIT_PARTICIPANT_PREFIX.RIGHT_CHILD].status,
    null,
    'right child participant should exist before acknowledgements are emitted',
  );
  t.equal(
    persisted[PARTITION_TRANSITION_METADATA_FIELD.SOURCE_CHECKPOINT],
    undefined,
    'metadata must not include sourceCheckpoint when none exist',
  );
});
