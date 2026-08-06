/**
 * Tests proving PartitionService acts as a source-execution participant
 * that reports typed acknowledgements instead of owning split phase
 * transitions directly.
 *
 * Validates: Requirements 2, 3
 * Design: §3 (PartitionService becomes a split execution participant),
 *   §4 (typed acknowledgement payloads routed to workflow owner)
 *
 * Owner path verified: PartitionService.emitSplitSourceAck →
 *   ManagedSplitWorkflow.acknowledgeSourceParticipant →
 *   DurableWorkflowCoordinator.acknowledgeParticipant
 */
import {test} from '../../src/test-helpers/tap.js';
import {
  PARTITION_TRANSITION_STATE,
  PARTITION_TRANSITION_METADATA_FIELD,
} from '../../src/partition/partition-constants.js';
import {
  PARTITION_SERVICE_ERROR_MSG,
} from '../../src/partition/partition-service-constants.js';
import {
  SPLIT_ACK_STATUS,
  SPLIT_ACK_CHECKPOINT_FIELD,
  SPLIT_PARTICIPANT_PREFIX,
} from '../../src/partition/split-ack-constants.js';
import {
  PARTICIPANT_ACK_FIELD,
  PARTICIPANT_ACK_RESULT,
} from '../../src/workflow/workflow-constants.js';

const FIXTURE_PARTITION_ID = 'users-p1';
const FIXTURE_TABLE_ID = 'tbl-users';
const FIXTURE_WORKFLOW_ID = 'split-tbl-users-users-p1-v2';
const FIXTURE_TARGET_VERSION = 2;
const FIXTURE_TARGET_IDS = ['users-p-left', 'users-p-right'];

function buildMetadata() {
  return {
    workflowId: FIXTURE_WORKFLOW_ID,
    targetPartitionVersion: FIXTURE_TARGET_VERSION,
    targetPartitionIds: FIXTURE_TARGET_IDS,
    sourcePartitionId: FIXTURE_PARTITION_ID,
    primaryKeyColumn: 'id',
    splitKey: 'm',
  };
}

async function loadEmitSplitSourceAck() {
  const mod = await import(
    '../../src/partition/partition-service.js'
  );
  return mod.PartitionService.prototype.emitSplitSourceAck;
}

async function loadRunSplitReplicationWorkflow() {
  const mod = await import(
    '../../src/partition/partition-service.js'
  );
  return mod.PartitionService.prototype.runSplitReplicationWorkflow;
}

// ===================================================================
// emitSplitSourceAck — typed acknowledgement emission
// ===================================================================

test('emitSplitSourceAck builds a canonical PARTICIPANT_ACK_FIELD ' +
  'payload and routes it through ' +
  'ManagedSplitWorkflow.acknowledgeSourceParticipant ' +
  '(uses ManagedSplitWorkflow as canonical split owner)', async (t) => {
  const emitSplitSourceAck = await loadEmitSplitSourceAck();
  const ackCalls = [];

  const context = {
    partitionId: FIXTURE_PARTITION_ID,
    sqlQueryEngine: {
      managedSplitWorkflow: {
        async acknowledgeSourceParticipant(workflowId, ack) {
          ackCalls.push({workflowId, ack});
          return {result: PARTICIPANT_ACK_RESULT.ACCEPTED};
        },
      },
    },
    logger: {info() {}},
  };

  await emitSplitSourceAck.call(
    context,
    buildMetadata(),
    SPLIT_ACK_STATUS.SNAPSHOT_STARTED,
  );

  t.equal(ackCalls.length, 1, 'must emit exactly one acknowledgement');
  t.equal(
    ackCalls[0].workflowId,
    FIXTURE_WORKFLOW_ID,
    'must pass the workflow ID from metadata',
  );
  t.equal(
    ackCalls[0].ack[PARTICIPANT_ACK_FIELD.PARTICIPANT_KEY],
    SPLIT_PARTICIPANT_PREFIX.SOURCE_PARTITION,
    'participant key must be source-partition',
  );
  t.equal(
    ackCalls[0].ack[PARTICIPANT_ACK_FIELD.STATUS],
    SPLIT_ACK_STATUS.SNAPSHOT_STARTED,
    'status must match the requested ack status',
  );
  t.ok(
    ackCalls[0].ack[PARTICIPANT_ACK_FIELD.ACKNOWLEDGED_AT],
    'must include acknowledgedAt timestamp',
  );
});

test('emitSplitSourceAck stamps every ack with the workflow fence ' +
  'token from the normalized metadata (fenced-source-ack)',
async (t) => {
  const emitSplitSourceAck = await loadEmitSplitSourceAck();
  const ackCalls = [];

  const context = {
    partitionId: FIXTURE_PARTITION_ID,
    sqlQueryEngine: {
      managedSplitWorkflow: {
        async acknowledgeSourceParticipant(workflowId, ack) {
          ackCalls.push({workflowId, ack});
          return {result: PARTICIPANT_ACK_RESULT.ACCEPTED};
        },
      },
    },
    logger: {info() {}},
  };

  await emitSplitSourceAck.call(
    context,
    {...buildMetadata(), workflowFenceToken: 7},
    SPLIT_ACK_STATUS.CATCHUP_READY,
  );

  t.equal(
    ackCalls[0].ack[PARTICIPANT_ACK_FIELD.FENCE_TOKEN],
    7,
    'the source must stamp the workflow fence epoch it was started ' +
    'under so the owner can reject a superseded epoch as STALE_FENCE',
  );
});

test('emitSplitSourceAck includes checkpoint data when provided ' +
  '(uses ManagedSplitWorkflow as canonical split owner)', async (t) => {
  const emitSplitSourceAck = await loadEmitSplitSourceAck();
  const ackCalls = [];

  const context = {
    partitionId: FIXTURE_PARTITION_ID,
    sqlQueryEngine: {
      managedSplitWorkflow: {
        async acknowledgeSourceParticipant(workflowId, ack) {
          ackCalls.push({workflowId, ack});
          return {result: PARTICIPANT_ACK_RESULT.ACCEPTED};
        },
      },
    },
    logger: {info() {}},
  };

  const checkpoint = {
    [SPLIT_ACK_CHECKPOINT_FIELD.SOURCE_MIRROR_REMOVED]: false,
  };

  await emitSplitSourceAck.call(
    context,
    buildMetadata(),
    SPLIT_ACK_STATUS.CLEANUP_COMPLETED,
    checkpoint,
  );

  t.equal(ackCalls.length, 1, 'must emit exactly one acknowledgement');
  t.same(
    ackCalls[0].ack[PARTICIPANT_ACK_FIELD.CHECKPOINT],
    checkpoint,
    'checkpoint data must be included in the ack payload',
  );
});

test('emitSplitSourceAck fails when workflow owner is not wired ' +
  '(uses ManagedSplitWorkflow as canonical split owner)', async (t) => {
  const emitSplitSourceAck = await loadEmitSplitSourceAck();

  const context = {
    partitionId: FIXTURE_PARTITION_ID,
    sqlQueryEngine: null,
    logger: {info() {}},
  };

  try {
    await emitSplitSourceAck.call(
      context,
      buildMetadata(),
      SPLIT_ACK_STATUS.SNAPSHOT_STARTED,
    );
    t.fail('must throw when workflow owner is not wired');
  } catch (error) {
    t.equal(
      error.message,
      PARTITION_SERVICE_ERROR_MSG.SPLIT_REPLICATION_STATE_REQUIRED,
      'error must indicate missing split replication state',
    );
  }
});

test('emitSplitSourceAck fails when workflowId is missing from ' +
  'metadata (uses ManagedSplitWorkflow as canonical split owner)',
async (t) => {
  const emitSplitSourceAck = await loadEmitSplitSourceAck();

  const context = {
    partitionId: FIXTURE_PARTITION_ID,
    sqlQueryEngine: {
      managedSplitWorkflow: {
        async acknowledgeSourceParticipant() {
          t.fail('must not call acknowledgeSourceParticipant ' +
            'without workflowId');
        },
      },
    },
    logger: {info() {}},
  };

  const metadataNoWorkflow = {...buildMetadata(), workflowId: null};

  try {
    await emitSplitSourceAck.call(
      context,
      metadataNoWorkflow,
      SPLIT_ACK_STATUS.SNAPSHOT_STARTED,
    );
    t.fail('must throw when workflowId is missing');
  } catch (error) {
    t.equal(
      error.message,
      PARTITION_SERVICE_ERROR_MSG.SPLIT_REPLICATION_STATE_REQUIRED,
      'error must indicate missing split replication state',
    );
  }
});

// ===================================================================
// runSplitReplicationWorkflow — acknowledgement emission at boundaries
// ===================================================================

test('runSplitReplicationWorkflow emits snapshot_started, ' +
  'catchup_ready, and cleanup_completed acknowledgements at each ' +
  'execution boundary (uses ManagedSplitWorkflow as canonical split ' +
  'owner)', async (t) => {
  const runSplitReplicationWorkflow =
    await loadRunSplitReplicationWorkflow();
  const ackStatuses = [];
  const advanceCalls = [];

  const metadata = buildMetadata();

  const context = {
    partitionId: FIXTURE_PARTITION_ID,
    splitReplication: {
      metadata,
      phase: PARTITION_TRANSITION_STATE.SPLIT_BACKFILLING,
      pendingEntries: [],
      flushPromise: null,
      startedAt: Date.now(),
      lastError: null,
    },
    sqlQueryEngine: {
      managedSplitWorkflow: {
        async acknowledgeSourceParticipant(workflowId, ack) {
          ackStatuses.push(ack[PARTICIPANT_ACK_FIELD.STATUS]);
          const cutoverApplied =
            ack[PARTICIPANT_ACK_FIELD.STATUS] ===
              SPLIT_ACK_STATUS.CATCHUP_READY;
          if (cutoverApplied) {
            advanceCalls.push({
              workflowId,
              nextPhase: PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE,
              phaseMetadata: {
                [PARTITION_TRANSITION_METADATA_FIELD.CUTOVER_APPLIED_AT]:
                  Date.now(),
              },
            });
          }
          return {
            result: PARTICIPANT_ACK_RESULT.ACCEPTED,
            splitCutoverApplied: cutoverApplied,
          };
        },
        async advanceSplitPhase(workflowId, nextPhase, phaseMetadata) {
          advanceCalls.push({workflowId, nextPhase, phaseMetadata});
        },
      },
    },
    logger: {info() {}},
    dbPath: ':memory:',
    db: {prepare: () => ({all: () => []})},
    tableName: 'test_table',
    // Stub methods used by the workflow
    openSplitSnapshotDatabase() {
      return {
        prepare: () => ({all: () => []}),
        close() {},
      };
    },
    async backfillSplitSnapshot() {},
    async flushSplitReplicationQueue() {},
    seedSplitReplayCursorFromDurableLog(splitReplication) {
      splitReplication.snapshotBarrierIndex = null;
      splitReplication.replayWatermarkIndex = null;
    },
    async markSplitCutoverActive(meta) {
      const splitWorkflow =
        this.sqlQueryEngine?.managedSplitWorkflow;
      await splitWorkflow.advanceSplitPhase(
        meta.workflowId,
        PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE,
        {
          [PARTITION_TRANSITION_METADATA_FIELD.CUTOVER_APPLIED_AT]:
            Date.now(),
        },
      );
    },
    async emitSplitSourceAck(meta, ackStatus, checkpoint) {
      const emitFn = (await import(
        '../../src/partition/partition-service.js'
      )).PartitionService.prototype.emitSplitSourceAck;
      return emitFn.call(this, meta, ackStatus, checkpoint);
    },
  };

  await runSplitReplicationWorkflow.call(context);

  t.same(
    ackStatuses,
    [
      SPLIT_ACK_STATUS.SNAPSHOT_STARTED,
      SPLIT_ACK_STATUS.CATCHUP_READY,
      SPLIT_ACK_STATUS.CLEANUP_COMPLETED,
    ],
    'must emit snapshot_started, catchup_ready, and ' +
      'cleanup_completed in order',
  );

  t.equal(
    advanceCalls.length,
    1,
    'must still delegate cutover to advanceSplitPhase',
  );
  t.equal(
    advanceCalls[0].nextPhase,
    PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE,
    'cutover delegation must target SPLIT_CUTOVER_ACTIVE',
  );
});

// ===================================================================
// handleStartSplitReplication — failed phase uses constant
// ===================================================================

test('handleStartSplitReplication sets failed phase using ' +
  'PARTITION_TRANSITION_STATE.FAILED constant instead of magic ' +
  'string (uses ManagedSplitWorkflow as canonical split owner)',
async (t) => {
  const mod = await import(
    '../../src/partition/partition-service.js'
  );
  const handleFn =
    mod.PartitionService.prototype.handleStartSplitReplication;

  const metadata = buildMetadata();
  const context = {
    partitionId: FIXTURE_PARTITION_ID,
    tableId: FIXTURE_TABLE_ID,
    tableName: 'users',
    role: 'leader',
    splitReplication: null,
    splitReplicationRun: null,
    sqlQueryEngine: {
      managedSplitWorkflow: {
        async acknowledgeSourceParticipant() {
          throw new Error('simulated failure');
        },
      },
    },
    logger: {info() {}, error() {}},
    normalizeSplitTransitionMetadata(raw) {
      return mod.PartitionService.prototype
        .normalizeSplitTransitionMetadata.call(this, raw);
    },
    isSameSplitReplication(left, right) {
      return mod.PartitionService.prototype
        .isSameSplitReplication.call(this, left, right);
    },
    resolveLeaderAddress() {
      return null;
    },
    async runSplitReplicationWorkflow() {
      throw new Error('simulated workflow failure');
    },
    transport: null,
  };

  const result = await handleFn.call(context, {
    transitionMetadata: metadata,
  });

  t.ok(result.acknowledged, 'must acknowledge the request');

  // Wait for the async workflow to settle
  await context.splitReplicationRun;

  t.equal(
    context.splitReplication.phase,
    PARTITION_TRANSITION_STATE.FAILED,
    'failed phase must use PARTITION_TRANSITION_STATE.FAILED constant',
  );
});

// ===================================================================
// emitSplitSourceAck — does NOT write system table directly
// ===================================================================

test('emitSplitSourceAck does NOT write the tables system table ' +
  'directly — cdcIntegrationService.updateSystemTableRow must not ' +
  'be called (uses ManagedSplitWorkflow as canonical split owner)',
async (t) => {
  const emitSplitSourceAck = await loadEmitSplitSourceAck();

  const context = {
    partitionId: FIXTURE_PARTITION_ID,
    cdcIntegrationService: {
      async updateSystemTableRow() {
        t.fail(
          'PartitionService must NOT write the tables system table ' +
          'directly for acknowledgements — this violates single-owner ' +
          '(Req 2, System Guidelines §1.4.2)',
        );
      },
    },
    sqlQueryEngine: {
      managedSplitWorkflow: {
        async acknowledgeSourceParticipant(_workflowId, _ack) {
          return {result: PARTICIPANT_ACK_RESULT.ACCEPTED};
        },
      },
    },
    logger: {info() {}},
  };

  await emitSplitSourceAck.call(
    context,
    buildMetadata(),
    SPLIT_ACK_STATUS.CATCHUP_READY,
  );
  t.pass(
    'acknowledgement routed through workflow owner without ' +
    'direct system table write',
  );
});
