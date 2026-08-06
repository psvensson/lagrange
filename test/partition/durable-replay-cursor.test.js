// Regression tests for the durable-replay-cursor quest: a durable
// snapshot barrier index and replay watermark are persisted with the
// transition, queued deltas replay from the source partition's Raft log
// rather than the volatile pendingEntries array, the interim queue is
// bounded, and recovery starts-or-resumes the replication worker
// (reconstruction without resumption is NOT recovery).
//
// Each test was verified red-on-revert against the mechanism it pins.

import {test} from 'node:test';
import assert from 'node:assert/strict';

import {
  PARTITION_TRANSITION_METADATA_FIELD,
  PARTITION_TRANSITION_STATE,
} from '../../src/partition/partition-constants.js';
import {
  PARTITION_SERVICE_DEFAULT,
  PARTITION_SERVICE_ERROR_MSG,
} from '../../src/partition/partition-service-constants.js';
import {
  buildReplayCursorCheckpoint,
  loadDurableDeltasBehindWatermark,
  normalizeReplayCursor,
} from '../../src/partition/partition-mirror-replay-cursor.js';
import {
  normalizeSplitTransitionMetadataForService,
  reconstructSplitExecutionStateForService,
} from '../../src/partition/partition-service-split-replication-state.js';
import {
  PartitionService,
} from '../../src/partition/partition-service.js';
import {
  MERGE_ACK_CHECKPOINT_FIELD,
} from '../../src/partition/merge-ack-constants.js';
import {
  SPLIT_ACK_CHECKPOINT_FIELD,
} from '../../src/partition/split-ack-constants.js';
import {
  RAFT_ROLE,
} from '../../src/raft/constants.js';

const FIXTURE_PARTITION_ID = 'users-p1';
const FIXTURE_WORKFLOW_ID = 'split-wf-1';
const FIXTURE_TARGET_IDS = ['users-p1-a', 'users-p1-b'];

function buildSplitRawMetadata(overrides = {}) {
  return {
    [PARTITION_TRANSITION_METADATA_FIELD.WORKFLOW_ID]: FIXTURE_WORKFLOW_ID,
    [PARTITION_TRANSITION_METADATA_FIELD.PRIMARY_KEY_COLUMN]: 'id',
    [PARTITION_TRANSITION_METADATA_FIELD.SOURCE_PARTITION_ID]:
      FIXTURE_PARTITION_ID,
    [PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_IDS]: [
      ...FIXTURE_TARGET_IDS,
    ],
    [PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_VERSION]: 2,
    ...overrides,
  };
}

function buildLogger() {
  return {info() {}, warn() {}, error() {}, debug() {}};
}

// ── Receipt 1: persisted snapshot barrier + replay watermark ────────

test('replay cursor checkpoint rides the source ack into the durable ' +
  'transition metadata', () => {
  const checkpoint = buildReplayCursorCheckpoint(
    SPLIT_ACK_CHECKPOINT_FIELD,
    41,
    57,
  );
  assert.equal(
    checkpoint[SPLIT_ACK_CHECKPOINT_FIELD.SNAPSHOT_BARRIER_INDEX],
    41,
  );
  assert.equal(
    checkpoint[SPLIT_ACK_CHECKPOINT_FIELD.REPLAY_WATERMARK_INDEX],
    57,
  );

  // The owner persistence seam folds the source checkpoint into the
  // transition metadata under SOURCE_CHECKPOINT; the service-side
  // normalizer must surface the cursor from exactly that slot so a
  // restarted source sees it.
  const rawMetadata = buildSplitRawMetadata({
    [PARTITION_TRANSITION_METADATA_FIELD.SOURCE_CHECKPOINT]: checkpoint,
  });
  const service = {partitionId: FIXTURE_PARTITION_ID};
  const metadata = normalizeSplitTransitionMetadataForService(
    service,
    rawMetadata,
  );
  assert.ok(metadata, 'metadata must normalize');
  assert.equal(metadata.snapshotBarrierIndex, 41);
  assert.equal(metadata.replayWatermarkIndex, 57);
});

test('the split worker stamps the snapshot barrier from the durable ' +
  'Raft log and carries the cursor on the catch-up acknowledgement',
async () => {
  const proto = PartitionService.prototype;
  const acks = [];
  const context = {
    partitionId: FIXTURE_PARTITION_ID,
    logger: buildLogger(),
    splitReplication: {
      metadata: {
        sourcePartitionId: FIXTURE_PARTITION_ID,
        targetPartitionIds: [...FIXTURE_TARGET_IDS],
        targetPartitionVersion: 2,
        workflowId: FIXTURE_WORKFLOW_ID,
        primaryKeyColumn: 'id',
      },
      phase: PARTITION_TRANSITION_STATE.SPLIT_BACKFILLING,
      pendingEntries: [],
      flushPromise: null,
      lastError: null,
    },
    storage: {
      getLastIndex: () => 77,
    },
    seedSplitReplayCursorFromDurableLog:
      proto.seedSplitReplayCursorFromDurableLog,
    openSplitSnapshotDatabase: () => ({close() {}}),
    backfillSplitSnapshot: async () => {},
    flushSplitReplicationQueue: async () => {},
    emitSplitSourceAck: async (metadata, status, checkpoint) => {
      acks.push({status, checkpoint: checkpoint || null});
      return {result: 'accepted', splitCutoverApplied: true};
    },
  };
  await proto.runSplitReplicationWorkflow.call(context);
  const catchupAck = acks.find(
    (ack) => ack.status === 'catchup_ready',
  );
  assert.ok(catchupAck, 'the catch-up ack must be emitted');
  assert.equal(
    catchupAck.checkpoint?.[
      SPLIT_ACK_CHECKPOINT_FIELD.SNAPSHOT_BARRIER_INDEX
    ],
    77,
    'the barrier must come from the durable Raft log index',
  );
  assert.equal(
    catchupAck.checkpoint?.[
      SPLIT_ACK_CHECKPOINT_FIELD.REPLAY_WATERMARK_INDEX
    ],
    77,
  );
});

test('a transition without a recorded cursor normalizes to null ' +
  'indices (never undefined, never fabricated)', () => {
  const service = {partitionId: FIXTURE_PARTITION_ID};
  const metadata = normalizeSplitTransitionMetadataForService(
    service,
    buildSplitRawMetadata(),
  );
  assert.ok(metadata, 'metadata must normalize');
  assert.equal(metadata.snapshotBarrierIndex, null);
  assert.equal(metadata.replayWatermarkIndex, null);
  const cursor = normalizeReplayCursor(null, MERGE_ACK_CHECKPOINT_FIELD);
  assert.equal(cursor.snapshotBarrierIndex, null);
  assert.equal(cursor.replayWatermarkIndex, null);
});

// ── Receipt 2: raft-log delta replay behind the watermark ───────────

test('reconstruction seeds the catch-up queue from the durable Raft ' +
  'log behind the persisted watermark, not the volatile array', () => {
  const logEntries = [
    {index: 40, data: {type: 'INSERT', sql: 'ins-40'}},
    {index: 41, data: {type: 'INSERT', sql: 'ins-41'}},
    // The barrier: covered by the snapshot, never replayed.
    {index: 42, data: {type: 'INSERT', sql: 'ins-42'}},
    // Non-write control entries are filtered out of the mirror replay.
    {index: 43, data: {type: 'PREPARE_TRANSACTION', sql: 'prep-43'}},
    {index: 44, data: {type: 'DELETE', sql: 'del-44'}},
  ];
  const service = {
    partitionId: FIXTURE_PARTITION_ID,
    logger: buildLogger(),
    normalizeSplitTransitionMetadata:
      PartitionService.prototype.normalizeSplitTransitionMetadata,
    storage: {
      getEntriesFrom(startIndex) {
        return logEntries.filter((entry) => entry.index >= startIndex);
      },
    },
    splitReplication: null,
  };
  const metadata = normalizeSplitTransitionMetadataForService(
    service,
    buildSplitRawMetadata({
      [PARTITION_TRANSITION_METADATA_FIELD.SOURCE_CHECKPOINT]:
        buildReplayCursorCheckpoint(SPLIT_ACK_CHECKPOINT_FIELD, 41, 42),
    }),
  );

  const handle = reconstructSplitExecutionStateForService(service, {
    phase: PARTITION_TRANSITION_STATE.SPLIT_CATCHUP,
    metadata: buildSplitRawMetadata({
      [PARTITION_TRANSITION_METADATA_FIELD.SOURCE_CHECKPOINT]:
        buildReplayCursorCheckpoint(SPLIT_ACK_CHECKPOINT_FIELD, 41, 42),
    }),
  });

  assert.ok(handle, 'execution handle must reconstruct');
  assert.deepEqual(
    handle.pendingEntries.map((entry) => entry.logIndex),
    [44],
    'deltas behind the watermark must replay from the log in order',
  );
  assert.deepEqual(
    handle.pendingEntries.map((entry) => entry.sql),
    ['del-44'],
  );
  assert.equal(handle.snapshotBarrierIndex, 41);
  assert.equal(handle.replayWatermarkIndex, 42);
  assert.ok(metadata, 'normalizer must surface the same cursor');
});

test('loadDurableDeltasBehindWatermark stamps each delta with its ' +
  'logIndex so the drain advances the watermark per delivery', () => {
  const service = {
    storage: {
      getEntriesFrom(startIndex) {
        return startIndex === 8 ?
          [{index: 8, data: {type: 'UPDATE', sql: 'u8'}}] :
          [];
      },
    },
  };
  const deltas = loadDurableDeltasBehindWatermark(service, 7);
  assert.equal(deltas.length, 1);
  assert.equal(deltas[0].logIndex, 8);
  assert.equal(deltas[0].sql, 'u8');
  // No durable log / no watermark: no replay (the live queue alone
  // serves post-resumption writes).
  assert.deepEqual(loadDurableDeltasBehindWatermark({}, 7), []);
  assert.deepEqual(loadDurableDeltasBehindWatermark(service, null), []);
});

// ── Receipt 3: bounded delta queue ──────────────────────────────────

test('the split mirror delta queue is bounded: at capacity the write ' +
  'path applies backpressure', async () => {
  const proto = PartitionService.prototype;
  const context = {
    partitionId: FIXTURE_PARTITION_ID,
    splitReplication: {
      metadata: {sourcePartitionId: FIXTURE_PARTITION_ID},
      phase: PARTITION_TRANSITION_STATE.SPLIT_BACKFILLING,
      pendingEntries: Array.from(
        {length: PARTITION_SERVICE_DEFAULT.MIRROR_DELTA_QUEUE_CAPACITY},
        (_, index) => ({sql: `queued-${index}`}),
      ),
      flushPromise: null,
      lastError: null,
    },
    cloneSplitEntry: proto.cloneSplitEntry,
    enqueueSplitDeltaBounded: proto.enqueueSplitDeltaBounded,
    mirrorCutoverActiveSplitWrite: proto.mirrorCutoverActiveSplitWrite,
  };
  await assert.rejects(
    () => proto.handleSplitReplicationAfterWrite.call(context, {
      sql: 'overflow',
    }),
    (error) => error.message ===
      PARTITION_SERVICE_ERROR_MSG.MIRROR_DELTA_QUEUE_AT_CAPACITY,
    'a write at queue capacity must be rejected with backpressure',
  );
  assert.equal(
    context.splitReplication.pendingEntries.length,
    PARTITION_SERVICE_DEFAULT.MIRROR_DELTA_QUEUE_CAPACITY,
    'the queue must never exceed its bound',
  );
});

test('the merge mirror delta queue is bounded by the same capacity ' +
  'helper', () => {
  const proto = PartitionService.prototype;
  const mergeReplication = {
    pendingEntries: Array.from(
      {length: PARTITION_SERVICE_DEFAULT.MIRROR_DELTA_QUEUE_CAPACITY},
      (_, index) => ({sql: `queued-${index}`}),
    ),
  };
  const context = {cloneSplitEntry: proto.cloneSplitEntry};
  assert.throws(
    () => proto.enqueueMergeDeltaBounded.call(
      context,
      mergeReplication,
      {sql: 'overflow'},
    ),
    (error) => error.message ===
      PARTITION_SERVICE_ERROR_MSG.MIRROR_DELTA_QUEUE_AT_CAPACITY,
  );
});

// ── Receipt 4: worker start-or-resume on recovery ───────────────────

test('leader activation on a restarted source resumes the split ' +
  'replication worker against the durable cursor', async () => {
  const proto = PartitionService.prototype;
  const rawMetadata = buildSplitRawMetadata({
    [PARTITION_TRANSITION_METADATA_FIELD.SOURCE_CHECKPOINT]:
      buildReplayCursorCheckpoint(SPLIT_ACK_CHECKPOINT_FIELD, 10, 12),
  });
  const workerCalls = [];
  const context = {
    partitionId: FIXTURE_PARTITION_ID,
    role: RAFT_ROLE.LEADER,
    splitReplication: null,
    mergeReplication: null,
    logger: buildLogger(),
    systemTableCache: {
      getAll(tableName) {
        return tableName === 'tables' ?
          [{
            partition_transition_state:
              PARTITION_TRANSITION_STATE.SPLIT_CATCHUP,
            partition_transition_metadata: rawMetadata,
          }] :
          [];
      },
    },
    storage: {
      getEntriesFrom() {
        return [{index: 13, data: {type: 'INSERT', sql: 'ins-13'}}];
      },
    },
    normalizeSplitTransitionMetadata(rawMetadata) {
      return proto.normalizeSplitTransitionMetadata.call(this, rawMetadata);
    },
    reconstructSplitExecutionState: proto.reconstructSplitExecutionState,
    runSplitReplicationWorkflow() {
      workerCalls.push(this.splitReplication?.phase || null);
      return Promise.resolve();
    },
  };

  const resumed = await proto.startOrResumeSplitReplicationFromDurable
    .call(context);

  assert.equal(resumed, true, 'the worker must be resumed');
  assert.equal(workerCalls.length, 1, 'the worker must run exactly once');
  assert.ok(context.splitReplication, 'execution state must reconstruct');
  assert.deepEqual(
    context.splitReplication.pendingEntries.map((entry) => entry.logIndex),
    [13],
    'the resumed worker replays from the durable log behind the ' +
      'persisted watermark',
  );
  assert.equal(context.splitReplication.replayWatermarkIndex, 12);
});

test('leader-owned activation invokes mirror worker resumption: ' +
  'reconstruction without resumption is NOT recovery', async () => {
  const proto = PartitionService.prototype;
  const calls = [];
  const context = {
    partitionId: FIXTURE_PARTITION_ID,
    logger: buildLogger(),
    startOrResumeSplitReplicationFromDurable() {
      calls.push('split');
      return Promise.resolve(false);
    },
    startOrResumeMergeReplicationFromDurable() {
      calls.push('merge');
      return Promise.resolve(false);
    },
  };
  proto.resumeDurableMirrorReplicationWorkers.call(context);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(
    calls.sort(),
    ['merge', 'split'],
    'leader activation must drive BOTH mirror resumers',
  );

  // The wiring itself: leader activation must actually CALL the
  // resumption helper — a revert that drops the call leaves
  // reconstruction-only "recovery" and must turn this test red.
  const {readFileSync} = await import('node:fs');
  const source = readFileSync(
    new URL(
      '../../src/partition/partition-service-core-base.js',
      import.meta.url,
    ),
    'utf8',
  );
  const activationSection = source.slice(
    source.indexOf('PREPARED_STATE_RECONSTRUCTED'),
  );
  assert.ok(
    activationSection.includes('resumeDurableMirrorReplicationWorkers'),
    'leader activation must resume mirror workers after state ' +
      'reconstruction',
  );
});

test('no durable transition naming this source: resumption is a no-op ' +
  'and no worker starts', async () => {
  const proto = PartitionService.prototype;
  const context = {
    partitionId: FIXTURE_PARTITION_ID,
    role: RAFT_ROLE.LEADER,
    splitReplication: null,
    mergeReplication: null,
    logger: buildLogger(),
    systemTableCache: {getAll: () => []},
    normalizeSplitTransitionMetadata:
      proto.normalizeSplitTransitionMetadata,
  };
  const resumed = await proto.startOrResumeSplitReplicationFromDurable
    .call(context);
  assert.equal(resumed, false);
  assert.equal(context.splitReplication, null);
});
