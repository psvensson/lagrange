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
import {ManagedSplitWorkflow} from
  '../../src/partition/managed-split-workflow.js';
import {DurableWorkflowCoordinator} from
  '../../src/workflow/durable-workflow-coordinator.js';
import {
  DistributedTransactionCoordinator,
} from '../../src/query/distributed/distributed-transaction-coordinator.js';
import {
  STORAGE_ADMISSION_DECISION_TYPE,
} from '../../src/rebalancer/storage-admission-constants.js';

/**
 * Test-local fixture constants for identities and configuration.
 */
const FIXTURE_NODE_ID = 'node-split-owner';
const FIXTURE_PARTITION_ID = 'users-p1';
const FIXTURE_TABLE_ID = 'tbl-users';
const FIXTURE_TABLE_NAME = 'users';
const FIXTURE_PRIMARY_KEY_COLUMN = 'id';
const FIXTURE_LEFT_PARTITION_ID = 'users-p-left';
const FIXTURE_RIGHT_PARTITION_ID = 'users-p-right';
const FIXTURE_MEDIAN_KEY = 'm';
const FIXTURE_REPLICA_COUNT = 3;
const FIXTURE_QUORUM_REPLICA_COUNT = 2;
const FIXTURE_SIZE_BYTES = 128;
const FIXTURE_NOW = 1000;

/**
 * Build a ManagedSplitWorkflow with a DurableWorkflowCoordinator that
 * captures persisted workflow state, allowing recovery simulation.
 *
 * Reuses the buildWorkflow pattern from managed-split-workflow.test.js.
 *
 * @param {Object} options - Override options.
 * @return {Object} Workflow, coordinator, and captured state.
 */
function buildRecoverableWorkflow(options = {}) {
  const persistedWorkflows = [];
  const updateCalls = [];

  const workflowCoordinator = new DurableWorkflowCoordinator({
    persistWorkflow: async (workflow) => {
      persistedWorkflows.push(structuredClone(workflow));
      const cdcService = options.cdcIntegrationService;
      if (cdcService &&
          typeof cdcService.updateSystemTableRow === 'function') {
        const serializedMetadata = JSON.stringify(workflow.metadata);
        await cdcService.updateSystemTableRow(
          'tables',
          {table_id: workflow.tableId},
          {
            partition_transition_state: workflow.status,
            partition_transition_metadata: serializedMetadata,
            updated_at: workflow.updatedAt,
          },
        );
      }
    },
    now: () => FIXTURE_NOW,
  });

  const sourceReplicationState = {started: false, metadata: null};
  const transactionCoordinator =
    Object.prototype.hasOwnProperty.call(options, 'transactionCoordinator') ?
      options.transactionCoordinator :
      new DistributedTransactionCoordinator({
        beginParticipant: async () => {},
        prepareParticipant: async () => {},
        commitParticipant: async () => {},
        rollbackParticipant: async () => {},
        now: () => FIXTURE_NOW,
      });

  const workflow = new ManagedSplitWorkflow({
    nodeId: FIXTURE_NODE_ID,
    workflowCoordinator,
    cdcIntegrationService: options.cdcIntegrationService || {
      async updateSystemTableRow(tableName, whereClause, data, opts) {
        updateCalls.push({tableName, whereClause, data, options: opts});
        return {success: true, affectedRows: 1};
      },
      async insertSystemTableRow() {
        return {success: true};
      },
    },
    getPartitionInfo: () => ({
      partition_id: FIXTURE_PARTITION_ID,
      table_id: FIXTURE_TABLE_ID,
      table_name: FIXTURE_TABLE_NAME,
      partition_key_start: null,
      partition_key_end: null,
      replica_count: FIXTURE_REPLICA_COUNT,
      leader_node_id: FIXTURE_NODE_ID,
      size_bytes: FIXTURE_SIZE_BYTES,
    }),
    getTableInfo: () => ({
      table_id: FIXTURE_TABLE_ID,
      table_name: FIXTURE_TABLE_NAME,
      partition_key: FIXTURE_PRIMARY_KEY_COLUMN,
      active_partition_version: 1,
      partition_transition_state: null,
      partition_transition_metadata: null,
    }),
    parsePartitionTransition: () => null,
    isLocalManagedSplitLeader: () => true,
    resolveActivePartitionVersion: () => 1,
    buildManagedSplitPlan: async () => ({
      medianKey: FIXTURE_MEDIAN_KEY,
      leftPartition: {
        partitionId: FIXTURE_LEFT_PARTITION_ID,
        keyRange: {start: null, end: FIXTURE_MEDIAN_KEY},
      },
      rightPartition: {
        partitionId: FIXTURE_RIGHT_PARTITION_ID,
        keyRange: {start: FIXTURE_MEDIAN_KEY, end: null},
      },
    }),
    calculateQuorumReplicaCount: () => FIXTURE_QUORUM_REPLICA_COUNT,
    resolveProvisionTargetNodeIds: () => [
      FIXTURE_NODE_ID, 'node-b', 'node-c',
    ],
    getRoutablePartitionServiceNodeIds: () => [
      FIXTURE_NODE_ID, 'node-b',
    ],
    storageAdmissionService: {
      async checkSplit() {
        return {
          allowed: true,
          decisionType: STORAGE_ADMISSION_DECISION_TYPE.ADMITTED,
          requiredReplicaCount: FIXTURE_QUORUM_REPLICA_COUNT,
          eligibleNodeIds: [FIXTURE_NODE_ID, 'node-b', 'node-c'],
          ineligibleNodes: [],
          blockingReasons: [],
          decisionTimestamp: new Date(FIXTURE_NOW).toISOString(),
        };
      },
    },
    probeInitialTablePartitionProvisioning: async ({
      targetNodeIds,
      minimumRoutableReplicaCount,
    }) => {
      const admittedTargetNodeIds = targetNodeIds.slice(
        0,
        Math.max(minimumRoutableReplicaCount, 1),
      );
      return {
        existingRoutableNodeIds: [FIXTURE_NODE_ID],
        candidateTargetNodeIds: targetNodeIds,
        admittedTargetNodeIds,
        rejectedTargetNodePlans: [],
        maximumProvisionableReplicaCount:
          admittedTargetNodeIds.length + 1,
      };
    },
    waitForTablePartitionMetadata: async () => {},
    provisionInitialTablePartition: async () => {},
    startSplitReplicationOnSourcePartition: async (
      _partitionId, _tableId, _tableName, transitionMetadata,
    ) => {
      // Simulate what PartitionService does: store execution state
      // in process-local memory (this.splitReplication).
      sourceReplicationState.started = true;
      sourceReplicationState.metadata = transitionMetadata;
    },
    logger: {info() {}, error() {}},
    now: () => FIXTURE_NOW,
    transactionCoordinator,
  });

  return {
    workflow,
    workflowCoordinator,
    persistedWorkflows,
    updateCalls,
    sourceReplicationState,
  };
}

test('split progress stored in process memory is lost after ' +
  'restart — workflow cannot resume source execution (uses ' +
  'ManagedSplitWorkflow as canonical split owner)', async (t) => {
  const {
    workflow,
    workflowCoordinator,
    persistedWorkflows,
    sourceReplicationState,
  } = buildRecoverableWorkflow();

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
  const backfillingPersist = persistedWorkflows.find(
    (w) => w.status === PARTITION_TRANSITION_STATE.SPLIT_BACKFILLING,
  );
  t.ok(
    backfillingPersist,
    'workflow should have persisted SPLIT_BACKFILLING state durably',
  );
  t.ok(
    backfillingPersist?.metadata?.[
      PARTITION_TRANSITION_METADATA_FIELD.WORKFLOW_ID
    ],
    'persisted workflow should carry the workflow identity',
  );

  // ── Step 3: Simulate restart/recovery ──
  // Create a fresh DurableWorkflowCoordinator (as would happen after
  // process restart) and recover from the persisted workflow rows.
  const recoveredCoordinator = new DurableWorkflowCoordinator({
    persistWorkflow: async () => {},
    now: () => FIXTURE_NOW,
  });

  // Feed the persisted workflow state into recovery — this is what the
  // system does on startup from durable rows.
  const lastPersistedWorkflow =
    persistedWorkflows[persistedWorkflows.length - 1];
  recoveredCoordinator.recover({
    workflows: [lastPersistedWorkflow],
    loadWorkflow: (row) => row,
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

  // ── Step 5: Prove the contradiction ──
  // The recovered workflow knows the phase is SPLIT_BACKFILLING, but
  // there is no durable record of source-side execution progress.
  // PartitionService.splitReplication was process-local memory — it is
  // gone after restart.
  //
  // The workflow metadata does NOT contain source execution checkpoints
  // (snapshot revision, last applied delta, backfill progress) because
  // that state lived only in PartitionService.splitReplication.
  const recoveredMetadata = recoveredWorkflow.metadata || {};
  const hasSourceCheckpoint =
    recoveredMetadata.sourceCheckpoint !== undefined &&
    recoveredMetadata.sourceCheckpoint !== null;
  const hasSourceParticipant =
    recoveredWorkflow.participants &&
    recoveredWorkflow.participants.size > 0;

  t.equal(
    hasSourceCheckpoint,
    false,
    'recovered workflow has no source execution checkpoint — ' +
    'backfill progress was only in PartitionService process memory',
  );
  t.equal(
    hasSourceParticipant,
    false,
    'recovered workflow has no source participant acknowledgement — ' +
    'PartitionService did not report durable progress to the owner',
  );

  // ── Step 6: Prove resume is impossible ──
  // A new ManagedSplitWorkflow instance (post-restart) cannot resume
  // the backfilling phase because:
  // 1. The original workflowCoordinator's in-memory state was cleared
  //    by removeWorkflow in the finally block of executeInternal.
  // 2. Even after recovery, there is no source execution handle or
  //    checkpoint to resume from.
  // 3. The only way to "continue" would be to restart the entire split
  //    from scratch, which is not a resume — it is a redo.
  const originalCoordinatorWorkflow =
    workflowCoordinator.getWorkflowByOwnerKey(FIXTURE_PARTITION_ID);
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
    false,
    'but has no source execution progress — resume is impossible ' +
    'without re-executing the entire backfill from scratch',
  );
});
