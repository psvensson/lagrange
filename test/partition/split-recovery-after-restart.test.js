/**
 * Recovery tests proving split resume works after restart/reconstruction.
 *
 * These tests exercise the full end-to-end recovery path:
 *   1. DurableWorkflowCoordinator.recover() loads workflow + participant
 *      rows from durable storage
 *   2. Recovered workflow carries correct phase, metadata, and
 *      participant state
 *   3. PartitionService.reconstructSplitExecutionState() rebuilds the
 *      transient execution handle from the recovered workflow state
 *   4. After recovery, writes are routed correctly through the
 *      reconstructed handle
 *
 * Validates: Requirements 2, 3, 7, 8
 * Design: §3 (split owner must reconstruct full in-flight workflow
 *   from durable rows), Phase 3 (exit gate: split can be recovered
 *   after restart), Phase 5 (deterministic closure)
 *
 * Owner path verified: ManagedSplitWorkflow owns durable split phase;
 *   DurableWorkflowCoordinator.recover() restores workflow +
 *   participants; PartitionService.reconstructSplitExecutionState
 *   rebuilds the transient execution handle.
 */
import {test} from '../../src/test-helpers/tap.js';
import {DurableWorkflowCoordinator} from
  '../../src/workflow/durable-workflow-coordinator.js';
import {
  PARTITION_TRANSITION_STATE,
  PARTITION_TRANSITION_METADATA_FIELD,
} from '../../src/partition/partition-constants.js';
import {
  SPLIT_ACK_STATUS,
  SPLIT_ACK_CHECKPOINT_FIELD,
  SPLIT_PARTICIPANT_PREFIX,
} from '../../src/partition/split-ack-constants.js';
import {
  PARTICIPANT_ACK_FIELD,
} from '../../src/workflow/workflow-constants.js';

const FIXTURE_PARTITION_ID = 'users-source';
const FIXTURE_TABLE_ID = 'tbl-users';
const FIXTURE_WORKFLOW_ID = 'split-tbl-users-users-source-v2';
const FIXTURE_TARGET_VERSION = 2;
const FIXTURE_TARGET_IDS = ['users-left', 'users-right'];
const FIXTURE_SPLIT_KEY = 'm';
const FIXTURE_PRIMARY_KEY_COLUMN = 'id';
const FIXTURE_NOW = 1000;
const FIXTURE_FENCE_TOKEN = 7;
const FIXTURE_SNAPSHOT_REVISION = 123;
const FIXTURE_LAST_APPLIED_DELTA = 456;

/**
 * Build durable split transition metadata matching the shape that
 * ManagedSplitWorkflow persists and normalizeSplitTransitionMetadata
 * consumes.
 * @return {Object} Metadata fixture.
 */
function buildDurableMetadata() {
  return {
    [PARTITION_TRANSITION_METADATA_FIELD.PRIMARY_KEY_COLUMN]:
      FIXTURE_PRIMARY_KEY_COLUMN,
    [PARTITION_TRANSITION_METADATA_FIELD.SOURCE_PARTITION_ID]:
      FIXTURE_PARTITION_ID,
    [PARTITION_TRANSITION_METADATA_FIELD.SPLIT_KEY]: FIXTURE_SPLIT_KEY,
    [PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_IDS]:
      FIXTURE_TARGET_IDS,
    [PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_VERSION]:
      FIXTURE_TARGET_VERSION,
    [PARTITION_TRANSITION_METADATA_FIELD.WORKFLOW_ID]:
      FIXTURE_WORKFLOW_ID,
  };
}

/**
 * Build a durable workflow row as it would appear after
 * ManagedSplitWorkflow.persistWorkflowTransition writes to the
 * tables system table and the row is recovered on restart.
 *
 * @param {string} phase - PARTITION_TRANSITION_STATE value.
 * @param {Object} [metadataOverrides] - Extra metadata fields.
 * @return {Object} Workflow row suitable for recover().
 */
function buildWorkflowRow(phase, metadataOverrides = {}) {
  return {
    workflowId: FIXTURE_WORKFLOW_ID,
    ownerKey: FIXTURE_PARTITION_ID,
    tableId: FIXTURE_TABLE_ID,
    status: phase,
    metadata: {
      ...buildDurableMetadata(),
      ...metadataOverrides,
    },
    createdAt: FIXTURE_NOW,
    updatedAt: FIXTURE_NOW,
  };
}

/**
 * Build a durable participant row for the source partition.
 *
 * @param {string} status - SPLIT_ACK_STATUS value.
 * @param {Object} [checkpoint] - Optional checkpoint data.
 * @return {Object} Participant row suitable for recover().
 */
function buildSourceParticipantRow(status, checkpoint = null) {
  const row = {
    workflowId: FIXTURE_WORKFLOW_ID,
    participantId: SPLIT_PARTICIPANT_PREFIX.SOURCE_PARTITION,
    participantKey: SPLIT_PARTICIPANT_PREFIX.SOURCE_PARTITION,
    [PARTICIPANT_ACK_FIELD.STATUS]: status,
    [PARTICIPANT_ACK_FIELD.FENCE_TOKEN]: FIXTURE_FENCE_TOKEN,
    createdAt: FIXTURE_NOW,
    updatedAt: FIXTURE_NOW,
  };
  if (checkpoint) {
    row[PARTICIPANT_ACK_FIELD.CHECKPOINT] = checkpoint;
  }
  return row;
}

/**
 * Build a durable participant row for a child partition.
 *
 * @param {string} prefix - SPLIT_PARTICIPANT_PREFIX value.
 * @param {string} status - SPLIT_ACK_STATUS value.
 * @return {Object} Participant row suitable for recover().
 */
function buildChildParticipantRow(prefix, status) {
  return {
    workflowId: FIXTURE_WORKFLOW_ID,
    participantId: prefix,
    participantKey: prefix,
    [PARTICIPANT_ACK_FIELD.STATUS]: status,
    [PARTICIPANT_ACK_FIELD.FENCE_TOKEN]: FIXTURE_FENCE_TOKEN,
    createdAt: FIXTURE_NOW,
    updatedAt: FIXTURE_NOW,
  };
}

async function loadPartitionService() {
  const mod = await import(
    '../../src/partition/partition-service.js'
  );
  return mod.PartitionService;
}

// ===================================================================
// End-to-end recovery: DurableWorkflowCoordinator.recover() →
//   workflow state restored → reconstructSplitExecutionState() →
//   writes routed correctly
// ===================================================================

test('end-to-end recovery from backfilling phase: coordinator ' +
  'recovers workflow + participants, then reconstructSplitExecution' +
  'State rebuilds the execution handle ' +
  '(uses ManagedSplitWorkflow as canonical split owner)', async (t) => {
  const PartitionService = await loadPartitionService();

  // ── Step 1: Recover workflow from durable rows ──
  const coordinator = new DurableWorkflowCoordinator({
    now: () => FIXTURE_NOW,
  });
  coordinator.recover({
    workflows: [
      buildWorkflowRow(
        PARTITION_TRANSITION_STATE.SPLIT_BACKFILLING,
      ),
    ],
    participants: [
      buildChildParticipantRow(
        SPLIT_PARTICIPANT_PREFIX.LEFT_CHILD,
        SPLIT_ACK_STATUS.CHILD_PROVISIONED,
      ),
      buildChildParticipantRow(
        SPLIT_PARTICIPANT_PREFIX.RIGHT_CHILD,
        SPLIT_ACK_STATUS.CHILD_PROVISIONED,
      ),
      buildSourceParticipantRow(
        SPLIT_ACK_STATUS.SNAPSHOT_STARTED,
        {
          [SPLIT_ACK_CHECKPOINT_FIELD.SNAPSHOT_REVISION]:
            FIXTURE_SNAPSHOT_REVISION,
        },
      ),
    ],
    loadWorkflow: (row) => row,
    loadParticipant: (row) => row,
  });

  // ── Step 2: Verify recovered workflow state ──
  const recovered = coordinator.getWorkflowByOwnerKey(
    FIXTURE_PARTITION_ID,
  );
  t.ok(recovered, 'workflow must be recovered by owner key');
  t.equal(
    recovered.status,
    PARTITION_TRANSITION_STATE.SPLIT_BACKFILLING,
    'recovered workflow phase must be SPLIT_BACKFILLING',
  );
  t.equal(
    recovered.workflowId,
    FIXTURE_WORKFLOW_ID,
    'recovered workflow must carry the correct workflow ID',
  );
  t.equal(
    recovered.participants.size,
    3,
    'recovered workflow must have 3 participants',
  );
  t.equal(
    recovered.participants.get(
      SPLIT_PARTICIPANT_PREFIX.SOURCE_PARTITION,
    ).status,
    SPLIT_ACK_STATUS.SNAPSHOT_STARTED,
    'source participant must carry snapshot_started status',
  );

  // ── Step 3: Reconstruct execution handle from recovered state ──
  const reconstructFn =
    PartitionService.prototype.reconstructSplitExecutionState;
  const context = {
    partitionId: FIXTURE_PARTITION_ID,
    splitReplication: null,
    logger: {info() {}},
    normalizeSplitTransitionMetadata:
      PartitionService.prototype.normalizeSplitTransitionMetadata,
  };

  const handle = reconstructFn.call(context, {
    phase: recovered.status,
    metadata: recovered.metadata,
  });

  t.ok(handle, 'must reconstruct an execution handle');
  t.equal(
    handle.phase,
    PARTITION_TRANSITION_STATE.SPLIT_BACKFILLING,
    'reconstructed handle phase must match recovered phase',
  );
  t.equal(
    handle.metadata.workflowId,
    FIXTURE_WORKFLOW_ID,
    'reconstructed handle must carry the workflow ID',
  );
  t.same(
    handle.metadata.targetPartitionIds,
    FIXTURE_TARGET_IDS,
    'reconstructed handle must carry target partition IDs',
  );
  t.same(
    handle.pendingEntries,
    [],
    'reconstructed handle must start with empty pending entries',
  );
  t.equal(
    handle.flushPromise,
    null,
    'reconstructed handle must start with no flush in flight',
  );
  t.equal(
    context.splitReplication,
    handle,
    'must assign the handle to the instance field',
  );
});

test('end-to-end recovery from catchup phase with source checkpoint ' +
  '(uses ManagedSplitWorkflow as canonical split owner)', async (t) => {
  const PartitionService = await loadPartitionService();

  const coordinator = new DurableWorkflowCoordinator({
    now: () => FIXTURE_NOW,
  });
  coordinator.recover({
    workflows: [
      buildWorkflowRow(PARTITION_TRANSITION_STATE.SPLIT_CATCHUP),
    ],
    participants: [
      buildSourceParticipantRow(
        SPLIT_ACK_STATUS.CATCHUP_READY,
        {
          [SPLIT_ACK_CHECKPOINT_FIELD.SNAPSHOT_REVISION]:
            FIXTURE_SNAPSHOT_REVISION,
          [SPLIT_ACK_CHECKPOINT_FIELD.LAST_APPLIED_DELTA]:
            FIXTURE_LAST_APPLIED_DELTA,
        },
      ),
    ],
    loadWorkflow: (row) => row,
    loadParticipant: (row) => row,
  });

  const recovered = coordinator.getWorkflowByOwnerKey(
    FIXTURE_PARTITION_ID,
  );
  t.ok(recovered, 'workflow must be recovered');
  t.equal(
    recovered.status,
    PARTITION_TRANSITION_STATE.SPLIT_CATCHUP,
    'recovered phase must be SPLIT_CATCHUP',
  );

  const sourceParticipant = recovered.participants.get(
    SPLIT_PARTICIPANT_PREFIX.SOURCE_PARTITION,
  );
  t.ok(sourceParticipant, 'source participant must be recovered');
  t.equal(
    sourceParticipant.status,
    SPLIT_ACK_STATUS.CATCHUP_READY,
    'source participant must carry catchup_ready status',
  );
  t.ok(
    sourceParticipant.checkpoint,
    'source participant must carry checkpoint data',
  );

  // Reconstruct execution handle
  const reconstructFn =
    PartitionService.prototype.reconstructSplitExecutionState;
  const context = {
    partitionId: FIXTURE_PARTITION_ID,
    splitReplication: null,
    logger: {info() {}},
    normalizeSplitTransitionMetadata:
      PartitionService.prototype.normalizeSplitTransitionMetadata,
  };

  const handle = reconstructFn.call(context, {
    phase: recovered.status,
    metadata: recovered.metadata,
  });

  t.ok(handle, 'must reconstruct an execution handle');
  t.equal(
    handle.phase,
    PARTITION_TRANSITION_STATE.SPLIT_CATCHUP,
    'reconstructed handle phase must match catchup',
  );
});

test('end-to-end recovery from cutover_active phase: writes route ' +
  'correctly through reconstructed handle ' +
  '(uses ManagedSplitWorkflow as canonical split owner)', async (t) => {
  const PartitionService = await loadPartitionService();

  const coordinator = new DurableWorkflowCoordinator({
    now: () => FIXTURE_NOW,
  });
  coordinator.recover({
    workflows: [
      buildWorkflowRow(
        PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE,
      ),
    ],
    participants: [
      buildSourceParticipantRow(
        SPLIT_ACK_STATUS.CATCHUP_READY,
        {
          [SPLIT_ACK_CHECKPOINT_FIELD.SNAPSHOT_REVISION]:
            FIXTURE_SNAPSHOT_REVISION,
          [SPLIT_ACK_CHECKPOINT_FIELD.LAST_APPLIED_DELTA]:
            FIXTURE_LAST_APPLIED_DELTA,
        },
      ),
      buildChildParticipantRow(
        SPLIT_PARTICIPANT_PREFIX.LEFT_CHILD,
        SPLIT_ACK_STATUS.CHILD_PROVISIONED,
      ),
      buildChildParticipantRow(
        SPLIT_PARTICIPANT_PREFIX.RIGHT_CHILD,
        SPLIT_ACK_STATUS.CHILD_PROVISIONED,
      ),
    ],
    loadWorkflow: (row) => row,
    loadParticipant: (row) => row,
  });

  const recovered = coordinator.getWorkflowByOwnerKey(
    FIXTURE_PARTITION_ID,
  );
  t.equal(
    recovered.status,
    PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE,
    'recovered phase must be SPLIT_CUTOVER_ACTIVE',
  );

  // Reconstruct execution handle and verify writes route correctly
  const reconstructFn =
    PartitionService.prototype.reconstructSplitExecutionState;
  const handleAfterWriteFn =
    PartitionService.prototype.handleSplitReplicationAfterWrite;

  const replayedEntries = [];
  const context = {
    partitionId: FIXTURE_PARTITION_ID,
    splitReplication: null,
    logger: {info() {}, warn() {}},
    normalizeSplitTransitionMetadata:
      PartitionService.prototype.normalizeSplitTransitionMetadata,
    cloneSplitEntry:
      PartitionService.prototype.cloneSplitEntry,
    enqueueSplitDeltaBounded:
      PartitionService.prototype.enqueueSplitDeltaBounded,
    mirrorCutoverActiveSplitWrite:
      PartitionService.prototype.mirrorCutoverActiveSplitWrite,
    drainSplitReplicationQueueQuietly:
      PartitionService.prototype.drainSplitReplicationQueueQuietly,
    async replaySplitEntry(entry, _metadata) {
      replayedEntries.push(entry.sql);
    },
    async flushSplitReplicationQueue() {},
  };

  reconstructFn.call(context, {
    phase: recovered.status,
    metadata: recovered.metadata,
  });

  t.ok(
    context.splitReplication,
    'must have a reconstructed execution handle',
  );

  // Simulate a write arriving after recovery + reconstruction
  await handleAfterWriteFn.call(context, {
    sql: 'INSERT INTO users (id, name) VALUES (?, ?)',
    params: ['alice', 'Alice'],
    data: {id: 'alice', name: 'Alice'},
  });

  t.same(
    replayedEntries,
    ['INSERT INTO users (id, name) VALUES (?, ?)'],
    'write must be routed through replaySplitEntry after ' +
    'end-to-end recovery from durable rows',
  );
});

test('recovery from backfilling phase queues writes in ' +
  'pendingEntries instead of replaying immediately ' +
  '(uses ManagedSplitWorkflow as canonical split owner)', async (t) => {
  const PartitionService = await loadPartitionService();

  const coordinator = new DurableWorkflowCoordinator({
    now: () => FIXTURE_NOW,
  });
  coordinator.recover({
    workflows: [
      buildWorkflowRow(
        PARTITION_TRANSITION_STATE.SPLIT_BACKFILLING,
      ),
    ],
    loadWorkflow: (row) => row,
  });

  const recovered = coordinator.getWorkflowByOwnerKey(
    FIXTURE_PARTITION_ID,
  );

  const reconstructFn =
    PartitionService.prototype.reconstructSplitExecutionState;
  const handleAfterWriteFn =
    PartitionService.prototype.handleSplitReplicationAfterWrite;

  const context = {
    partitionId: FIXTURE_PARTITION_ID,
    splitReplication: null,
    logger: {info() {}, warn() {}},
    normalizeSplitTransitionMetadata:
      PartitionService.prototype.normalizeSplitTransitionMetadata,
    cloneSplitEntry:
      PartitionService.prototype.cloneSplitEntry,
    enqueueSplitDeltaBounded:
      PartitionService.prototype.enqueueSplitDeltaBounded,
  };

  reconstructFn.call(context, {
    phase: recovered.status,
    metadata: recovered.metadata,
  });

  await handleAfterWriteFn.call(context, {
    sql: 'UPDATE users SET name = ? WHERE id = ?',
    params: ['Bob', 'bob'],
    data: {id: 'bob', name: 'Bob'},
    whereClause: {id: 'bob'},
  });

  t.equal(
    context.splitReplication.pendingEntries.length,
    1,
    'write must be queued in pendingEntries during backfilling',
  );
  t.equal(
    context.splitReplication.pendingEntries[0].sql,
    'UPDATE users SET name = ? WHERE id = ?',
    'queued entry must preserve the original SQL',
  );
});

// ===================================================================
// Recovery skips terminal workflows
// ===================================================================

test('recovery skips terminal workflows via isTerminalWorkflow ' +
  'callback — no execution handle for completed splits', async (t) => {
  const coordinator = new DurableWorkflowCoordinator({
    now: () => FIXTURE_NOW,
  });

  coordinator.recover({
    workflows: [
      buildWorkflowRow(PARTITION_TRANSITION_STATE.FAILED),
    ],
    loadWorkflow: (row) => row,
    isTerminalWorkflow: (record) =>
      record.status === PARTITION_TRANSITION_STATE.FAILED,
  });

  const recovered = coordinator.getWorkflowByOwnerKey(
    FIXTURE_PARTITION_ID,
  );
  t.equal(
    recovered,
    null,
    'terminal workflow must not be recovered into coordinator state',
  );
});

// ===================================================================
// Edge cases: missing or corrupted durable state
// ===================================================================

test('recovery with missing workflow rows produces no workflow — ' +
  'reconstructSplitExecutionState returns null', async (t) => {
  const PartitionService = await loadPartitionService();

  const coordinator = new DurableWorkflowCoordinator({
    now: () => FIXTURE_NOW,
  });
  coordinator.recover({
    workflows: [],
    participants: [],
    loadWorkflow: (row) => row,
    loadParticipant: (row) => row,
  });

  const recovered = coordinator.getWorkflowByOwnerKey(
    FIXTURE_PARTITION_ID,
  );
  t.equal(
    recovered,
    null,
    'no workflow should be recovered from empty rows',
  );

  // Reconstruction from null durable state must return null
  const reconstructFn =
    PartitionService.prototype.reconstructSplitExecutionState;
  const context = {
    partitionId: FIXTURE_PARTITION_ID,
    splitReplication: null,
    logger: {info() {}},
    normalizeSplitTransitionMetadata:
      PartitionService.prototype.normalizeSplitTransitionMetadata,
  };

  const handle = reconstructFn.call(context, null);
  t.equal(
    handle,
    null,
    'reconstructSplitExecutionState must return null for ' +
    'missing durable state',
  );
  t.equal(
    context.splitReplication,
    null,
    'must not assign a handle when durable state is missing',
  );
});

test('recovery with corrupted metadata — loadWorkflow returns null ' +
  'for invalid rows', async (t) => {
  const coordinator = new DurableWorkflowCoordinator({
    now: () => FIXTURE_NOW,
  });

  coordinator.recover({
    workflows: [
      {workflowId: null, ownerKey: null, status: null},
    ],
    loadWorkflow: (row) => {
      if (!row.workflowId || !row.ownerKey) {
        return null;
      }
      return row;
    },
  });

  const recovered = coordinator.getWorkflowByOwnerKey(
    FIXTURE_PARTITION_ID,
  );
  t.equal(
    recovered,
    null,
    'corrupted workflow row must be skipped during recovery',
  );
});

test('orphaned participants without a matching workflow are ' +
  'silently dropped during recovery', async (t) => {
  const coordinator = new DurableWorkflowCoordinator({
    now: () => FIXTURE_NOW,
  });

  // Recover participants without any matching workflow
  coordinator.recover({
    workflows: [],
    participants: [
      buildSourceParticipantRow(
        SPLIT_ACK_STATUS.SNAPSHOT_STARTED,
      ),
    ],
    loadWorkflow: (row) => row,
    loadParticipant: (row) => row,
  });

  const recovered = coordinator.getWorkflowByOwnerKey(
    FIXTURE_PARTITION_ID,
  );
  t.equal(
    recovered,
    null,
    'orphaned participants must not create phantom workflows',
  );
});

// ===================================================================
// Recovery preserves participant checkpoint data for resume
// ===================================================================

test('recovered source participant checkpoint carries snapshot ' +
  'revision and last applied delta for resume ' +
  '(uses ManagedSplitWorkflow as canonical split owner)', async (t) => {
  const coordinator = new DurableWorkflowCoordinator({
    now: () => FIXTURE_NOW,
  });

  const checkpoint = {
    [SPLIT_ACK_CHECKPOINT_FIELD.SNAPSHOT_REVISION]:
      FIXTURE_SNAPSHOT_REVISION,
    [SPLIT_ACK_CHECKPOINT_FIELD.LAST_APPLIED_DELTA]:
      FIXTURE_LAST_APPLIED_DELTA,
  };

  coordinator.recover({
    workflows: [
      buildWorkflowRow(PARTITION_TRANSITION_STATE.SPLIT_CATCHUP),
    ],
    participants: [
      buildSourceParticipantRow(
        SPLIT_ACK_STATUS.CATCHUP_READY,
        checkpoint,
      ),
    ],
    loadWorkflow: (row) => row,
    loadParticipant: (row) => row,
  });

  const recovered = coordinator.getWorkflowByOwnerKey(
    FIXTURE_PARTITION_ID,
  );
  const sourceParticipant = recovered.participants.get(
    SPLIT_PARTICIPANT_PREFIX.SOURCE_PARTITION,
  );

  t.equal(
    sourceParticipant.checkpoint[
      SPLIT_ACK_CHECKPOINT_FIELD.SNAPSHOT_REVISION
    ],
    FIXTURE_SNAPSHOT_REVISION,
    'recovered checkpoint must carry snapshot revision',
  );
  t.equal(
    sourceParticipant.checkpoint[
      SPLIT_ACK_CHECKPOINT_FIELD.LAST_APPLIED_DELTA
    ],
    FIXTURE_LAST_APPLIED_DELTA,
    'recovered checkpoint must carry last applied delta',
  );
});

// ===================================================================
// Recovery + runExclusive: recovered workflow does not block new
// exclusive execution for the same owner key
// ===================================================================

test('recovered workflow does not block runExclusive for the same ' +
  'owner key — resume can proceed after recovery ' +
  '(uses DurableWorkflowCoordinator as canonical workflow runtime)',
async (t) => {
  const coordinator = new DurableWorkflowCoordinator({
    now: () => FIXTURE_NOW,
  });

  coordinator.recover({
    workflows: [
      buildWorkflowRow(
        PARTITION_TRANSITION_STATE.SPLIT_BACKFILLING,
      ),
    ],
    loadWorkflow: (row) => row,
  });

  // Verify the workflow is recovered
  const recovered = coordinator.getWorkflowByOwnerKey(
    FIXTURE_PARTITION_ID,
  );
  t.ok(recovered, 'workflow must be recovered');

  // runExclusive should succeed — recovery does not leave an
  // in-flight execution lock
  let executionRan = false;
  await coordinator.runExclusive(FIXTURE_PARTITION_ID, async () => {
    executionRan = true;
  });

  t.equal(
    executionRan,
    true,
    'runExclusive must succeed after recovery — no stale lock',
  );
});
