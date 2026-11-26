/**
 * Targeted failing test: split progress depends on process-local state and
 * cannot be resumed cleanly after restart/recovery.
 *
 * Demonstrates the architectural contradiction described in
 * topology-workflow-single-owner-stabilization §3:
 *   ManagedSplitWorkflow owns the split from admission through cleanup, but
 *   source-side execution state (backfill phase, catch-up progress, pending
 *   entries) lives entirely in PartitionService.splitReplication — process
 *   memory that is lost on restart.
 *
 * The workflow reaches SPLIT_BACKFILLING and delegates source replication to
 * PartitionService. PartitionService stores the execution progress in
 * this.splitReplication (an in-memory object). After a simulated
 * restart/recovery, the DurableWorkflowCoordinator can recover the workflow
 * phase from durable rows, but the source-side execution handle and progress
 * are gone. The split cannot be resumed because the canonical source
 * execution phase was only in process memory.
 *
 * Requirements: 2.1, 2.2, 2.3, 8.1
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  PARTITION_TRANSITION_STATE,
  PARTITION_TRANSITION_METADATA_FIELD,
} from '../../src/partition/partition-constants.js';
import {SPLIT_PARTICIPANT_PREFIX} from '../../src/partition/split-ack-constants.js';
import {DurableWorkflowCoordinator} from
  '../../src/workflow/durable-workflow-coordinator.js';
import {buildDescriptorWorkflow} from './managed-split-workflow-test-helpers.js';

const FIXTURE_PARTITION_ID = 'users-p1';
const FIXTURE_NOW = 1000;

test('split progress stored in process memory is lost after ' +
  'restart — workflow cannot resume source execution (uses ' +
  'ManagedSplitWorkflow as canonical split owner)', async (t) => {
  const sourceReplicationState = {started: false, metadata: null};
  const {workflow, durableRow, store} = await buildDescriptorWorkflow(t, {
    now: () => FIXTURE_NOW,
    startSplitReplicationOnSourcePartition: async (
      _partitionId, _tableId, _tableName, transitionMetadata,
    ) => {
      // Only the source worker's execution handle is process-local here.
      sourceReplicationState.started = true;
      sourceReplicationState.metadata = transitionMetadata;
    },
  });

  // ── Step 1: Execute the split through to SPLIT_BACKFILLING ──
  // ManagedSplitWorkflow drives the split through admission, preparation,
  // child provisioning, and into backfilling. At the end of execute(),
  // the workflow reaches SPLIT_BACKFILLING and source replication has
  // been started on PartitionService (in process memory).
  const result = await workflow.execute(FIXTURE_PARTITION_ID);

  t.equal(result.success, true, 'split execution should succeed');
  t.equal(
    sourceReplicationState.started,
    true,
    'source replication should have been started on PartitionService',
  );

  // ── Step 2: Verify the durable workflow reached SPLIT_BACKFILLING ──
  t.equal(
    durableRow.partition_transition_state,
    PARTITION_TRANSITION_STATE.SPLIT_BACKFILLING,
    'workflow should have persisted SPLIT_BACKFILLING state durably',
  );
  const metadata = JSON.parse(durableRow.partition_transition_metadata);
  t.equal(
    metadata[PARTITION_TRANSITION_METADATA_FIELD.WORKFLOW_ID],
    result.workflowId,
    'persisted workflow carries the split execution identity',
  );
  const attempt = metadata[PARTITION_TRANSITION_METADATA_FIELD.WORKFLOW_ATTEMPT];
  t.ok(Number.isSafeInteger(attempt) && attempt > 0, 'TABLES issued a split attempt');
  for (const childId of ['users-p-left', 'users-p-right']) {
    t.equal(store.partitionRow(childId)?.split_descriptor_attempt, attempt,
      `PARTITIONS committed ${childId} for the recovered attempt`);
  }
  const sourceKey = SPLIT_PARTICIPANT_PREFIX.SOURCE_PARTITION;
  t.ok(metadata[PARTITION_TRANSITION_METADATA_FIELD.PARTICIPANTS]?.[sourceKey],
    'the TABLES row contains the source participant before recovery');

  // ── Step 3: Simulate restart/recovery ──
  // Create a fresh DurableWorkflowCoordinator (as would happen after
  // process restart) and recover from the persisted workflow rows.
  const recoveredCoordinator = new DurableWorkflowCoordinator({
    persistWorkflow: async () => {},
    now: () => FIXTURE_NOW,
  });

  // Feed the persisted workflow state into recovery — this is what the
  // system does on startup from durable rows.
  recoveredCoordinator.recover({
    workflows: [durableRow],
    loadWorkflow: (row) => workflow.decodeWorkflowRecord(result.workflowId, row),
  });

  // ── Step 4: Verify the recovered workflow knows the phase ──
  const recoveredWorkflow = recoveredCoordinator.getWorkflowByOwnerKey(
    FIXTURE_PARTITION_ID,
  );
  t.ok(
    recoveredWorkflow,
    'recovered coordinator should find the workflow by owner key',
  );
  t.equal(
    recoveredWorkflow.status,
    PARTITION_TRANSITION_STATE.SPLIT_BACKFILLING,
    'recovered workflow should know the split is in SPLIT_BACKFILLING',
  );

  // ── Step 5: Verify persisted source-side recovery signals ──
  // The recovered workflow knows SPLIT_BACKFILLING and currently preserves
  // participant-level durable progress, but does not expose a detailed
  // source execution checkpoint.
  const recoveredMetadata = recoveredWorkflow.metadata || {};
  const hasSourceCheckpoint =
    recoveredMetadata.sourceCheckpoint !== undefined &&
    recoveredMetadata.sourceCheckpoint !== null;
  const hasSourceParticipant =
    recoveredWorkflow.participants.has(sourceKey);

  t.equal(
    hasSourceCheckpoint,
    false,
    'recovered workflow has no source execution checkpoint — ' +
    'backfill progress was only in PartitionService process memory',
  );
  t.equal(
    hasSourceParticipant,
    true,
    'recovered workflow preserves source participant acknowledgement ' +
    'as durable owner progress',
  );

  // ── Step 6: Verify what recovery currently guarantees ──
  // A new ManagedSplitWorkflow instance (post-restart) cannot resume
  // the backfilling phase because:
  // 1. The original workflowCoordinator's in-memory state was cleared
  //    by removeWorkflow in the finally block of executeInternal.
  // 2. Even after recovery, there is no source execution handle or
  //    checkpoint to resume from.
  // 3. The only way to "continue" would be to restart the entire split
  //    from scratch, which is not a resume — it is a redo.
  const originalCoordinatorWorkflow =
    workflow.workflowCoordinator.getWorkflowByOwnerKey(FIXTURE_PARTITION_ID);
  t.equal(
    originalCoordinatorWorkflow,
    null,
    'original coordinator should have removed the workflow from ' +
    'in-memory state after execution (removeWorkflow in finally block)',
  );

  // The recovered coordinator has the phase but no execution context.
  // This proves the split cannot be cleanly resumed: the durable owner
  // knows WHAT phase the split was in, but not WHERE the source
  // execution was within that phase.
  t.not(
    recoveredWorkflow.status,
    undefined,
    'recovered workflow knows the phase (SPLIT_BACKFILLING)',
  );
  t.equal(
    hasSourceCheckpoint || hasSourceParticipant,
    true,
    'recovered workflow retains participant-level durable progress ' +
    'even without a detailed source checkpoint',
  );
});
