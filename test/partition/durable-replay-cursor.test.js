// Regression tests for the durable-replay-cursor quest: a durable
// snapshot barrier index and replay watermark are persisted with the
// transition, queued deltas replay from the source partition's Raft log
// rather than the volatile pendingEntries array, the interim queue is
// bounded, and recovery starts-or-resumes the replication worker
// (reconstruction without resumption is NOT recovery).
//
// Each test was verified red-on-revert against the mechanism it pins.
//
// The durable Raft log is the rs-raft durable store: the barrier and the
// replayed deltas are read from a partition restarted over commands committed
// through its own operation port (partition-rs-raft-restart-fixture.js), and
// every index compared against is the core's, read back on an independent
// connection.

import {test} from 'node:test';
import assert from 'node:assert/strict';

import {
  PARTITION_TRANSITION_METADATA_FIELD,
  PARTITION_TRANSITION_STATE,
} from '../../src/partition/partition-constants.js';
import {
  PARTITION_SERVICE_DEFAULT,
  PARTITION_SERVICE_ERROR_MSG,
  PARTITION_SERVICE_OPERATION,
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
  startMergeReplicationHandleForService,
  startSplitReplicationHandleForService,
} from '../../src/partition/partition-service-source-replication-start-methods.js';
import {
  MERGE_ACK_CHECKPOINT_FIELD,
} from '../../src/partition/merge-ack-constants.js';
import {
  SPLIT_ACK_CHECKPOINT_FIELD,
} from '../../src/partition/split-ack-constants.js';
import {
  RAFT_ROLE,
} from '../../src/raft/constants.js';
import {
  readCommittedIndependently,
  restartOverCommittedCommands,
} from './partition-rs-raft-restart-fixture.js';
import {RaftRsDurableStore} from '../../src/raft/raft-rs-durable-store.js';
import {encodeProposal} from '../../src/raft/raft-rs-proposal-codec.js';
import {RAFT_RS_ENTRY_TYPE} from
  '../../src/raft/raft-rs-ready-loop-constants.js';

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

function deferred() {
  let resolve;
  const promise = new Promise((settle) => {
    resolve = settle;
  });
  return {promise, resolve};
}

const SOURCE_TABLE = 'users';
const SOURCE_SCHEMA = Object.freeze({
  columns: [
    {name: 'id', type: 'TEXT', primaryKey: true},
    {name: 'value', type: 'TEXT'},
  ],
});

function insertCommand(id) {
  return {
    entryId: `insert-${id}`,
    type: PARTITION_SERVICE_OPERATION.INSERT,
    sql: `INSERT INTO ${SOURCE_TABLE} (id, value) VALUES (?, ?)`,
    params: [id, `value-${id}`],
  };
}

// A restarted source partition whose rs-raft store holds `commands`.
function restartedSource(commands) {
  return restartOverCommittedCommands({
    partitionId: FIXTURE_PARTITION_ID,
    tableId: SOURCE_TABLE,
    tableName: SOURCE_TABLE,
    schema: SOURCE_SCHEMA,
  }, commands);
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
  const source = await restartedSource(
    [insertCommand('a'), insertCommand('b')]);
  try {
    const proto = PartitionService.prototype;
    const acks = [];
    // The restarted source itself, with the snapshot/backfill/transport
    // collaborators replaced: the barrier is read from its own durable log.
    const context = Object.assign(Object.create(source.restarted), {
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
      openSplitSnapshotDatabase: () => ({close() {}}),
      backfillSplitSnapshot: async () => {},
      flushSplitReplicationQueue: async () => {},
      emitSplitSourceAck: async (metadata, status, checkpoint) => {
        acks.push({status, checkpoint: checkpoint || null});
        return {result: 'accepted', splitCutoverApplied: true};
      },
    });
    // The window the runtime owner opens between persisting a commit index
    // and applying the entries it covers (finishReady: putCommitIndex, then
    // sends, then applyEntries): one more entry is durably committed but
    // not yet applied, so the state machine the backfill copies does not
    // hold it. Written through the store's own write API.
    const store = new RaftRsDurableStore(source.restarted.db);
    const {hardState} = store.readDurableRecord(FIXTURE_PARTITION_ID);
    const unapplied = String(Number(hardState.commit) + 1);
    store.appendEntries(FIXTURE_PARTITION_ID, [{
      index: unapplied,
      term: hardState.term,
      entryType: RAFT_RS_ENTRY_TYPE.NORMAL,
      data: Buffer.from(encodeProposal(insertCommand('unapplied')))
        .toString('base64'),
    }]);
    store.putCommitIndex(FIXTURE_PARTITION_ID, unapplied);
    await proto.runSplitReplicationWorkflow.call(context);
    // The restarted incarnation may have committed and applied its own
    // leader entry, so the applied index is read when the barrier was taken,
    // not before.
    const {appliedIndex, commitIndex} = readCommittedIndependently(
      source.dbPath, FIXTURE_PARTITION_ID);
    assert.ok(commitIndex > appliedIndex,
      `precondition: the commit index ${commitIndex} runs ahead of the ` +
      `applied index ${appliedIndex}`);
    const catchupAck = acks.find(
      (ack) => ack.status === 'catchup_ready',
    );
    assert.ok(catchupAck, 'the catch-up ack must be emitted');
    assert.equal(
      catchupAck.checkpoint?.[
        SPLIT_ACK_CHECKPOINT_FIELD.SNAPSHOT_BARRIER_INDEX
      ],
      appliedIndex,
      'the barrier must be the rs-raft applied index (what the backfill ' +
        'copies)',
    );
    assert.equal(
      catchupAck.checkpoint?.[
        SPLIT_ACK_CHECKPOINT_FIELD.REPLAY_WATERMARK_INDEX
      ],
      appliedIndex,
    );
  } finally {
    await source.dispose();
  }
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
  'log behind the persisted watermark, not the volatile array', async () => {
  const deleteCommand = {
    entryId: 'delete-a',
    type: PARTITION_SERVICE_OPERATION.DELETE,
    sql: `DELETE FROM ${SOURCE_TABLE} WHERE id = ?`,
    params: ['a'],
  };
  const source = await restartedSource([
    insertCommand('a'),
    insertCommand('b'),
    // The barrier: covered by the snapshot, never replayed.
    insertCommand('c'),
    // Non-write control entries are filtered out of the mirror replay.
    {
      type: PARTITION_SERVICE_OPERATION.PREPARE_TRANSACTION,
      sessionId: 'session-control',
      epoch: 1,
      writeSet: [`${SOURCE_TABLE}:z`],
    },
    deleteCommand,
  ]);
  try {
    const [, second, third, , fifth] = source.committed;
    const checkpoint = buildReplayCursorCheckpoint(
      SPLIT_ACK_CHECKPOINT_FIELD, second.index, third.index);
    const metadata = normalizeSplitTransitionMetadataForService(
      source.restarted,
      buildSplitRawMetadata({
        [PARTITION_TRANSITION_METADATA_FIELD.SOURCE_CHECKPOINT]: checkpoint,
      }),
    );

    const handle = reconstructSplitExecutionStateForService(
      source.restarted, {
        phase: PARTITION_TRANSITION_STATE.SPLIT_CATCHUP,
        metadata: buildSplitRawMetadata({
          [PARTITION_TRANSITION_METADATA_FIELD.SOURCE_CHECKPOINT]: checkpoint,
        }),
      });

    assert.ok(handle, 'execution handle must reconstruct');
    assert.deepEqual(
      handle.pendingEntries.map((entry) => entry.logIndex),
      [fifth.index],
      'deltas behind the watermark must replay from the log in order',
    );
    assert.deepEqual(
      handle.pendingEntries.map((entry) => entry.sql),
      [fifth.command.sql],
    );
    assert.equal(handle.snapshotBarrierIndex, second.index);
    assert.equal(handle.replayWatermarkIndex, third.index);
    assert.ok(metadata, 'normalizer must surface the same cursor');
  } finally {
    await source.dispose();
  }
});

test('loadDurableDeltasBehindWatermark stamps each delta with its ' +
  'logIndex so the drain advances the watermark per delivery', async () => {
  const source = await restartedSource([
    insertCommand('a'),
    {
      entryId: 'update-a',
      type: PARTITION_SERVICE_OPERATION.UPDATE,
      sql: `UPDATE ${SOURCE_TABLE} SET value = ? WHERE id = ?`,
      params: ['updated', 'a'],
    },
  ]);
  try {
    const [inserted, updated] = source.committed;
    const deltas = loadDurableDeltasBehindWatermark(
      source.restarted, inserted.index);
    assert.equal(deltas.length, 1);
    assert.equal(deltas[0].logIndex, updated.index);
    assert.equal(deltas[0].sql, updated.command.sql);
    // No durable log / no watermark: no replay (the live queue alone
    // serves post-resumption writes).
    assert.deepEqual(loadDurableDeltasBehindWatermark({}, inserted.index), []);
    assert.deepEqual(
      loadDurableDeltasBehindWatermark(source.restarted, null), []);
  } finally {
    await source.dispose();
  }
});

test('accepted recovery refreshes writes committed while START waits and ' +
  'never re-runs a completed snapshot', async () => {
  for (const scenario of [
    {family: 'split', phase: PARTITION_TRANSITION_STATE.SPLIT_CATCHUP},
    {family: 'split', phase: PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE},
    {family: 'merge', phase: PARTITION_TRANSITION_STATE.MERGE_CATCHUP},
    {family: 'merge', phase: PARTITION_TRANSITION_STATE.MERGE_CUTOVER_ACTIVE},
  ]) {
    const source = await restartedSource([insertCommand('barrier')]);
    try {
      await source.restarted.raft.campaign();
      source.restarted.role = RAFT_ROLE.LEADER;
      const watermark = source.committed[0].index;
      const authorizationEntered = deferred();
      const authorizationGate = deferred();
      const replayed = [];
      let snapshots = 0;
      const isSplit = scenario.family === 'split';
      const handle = {
        metadata: isSplit ? {
          workflowId: `${scenario.family}-${scenario.phase}`,
          workflowAttempt: 1,
          workflowFenceToken: 1,
          sourcePartitionId: FIXTURE_PARTITION_ID,
          targetPartitionIds: [...FIXTURE_TARGET_IDS],
          targetPartitionVersion: 2,
          primaryKeyColumn: 'id',
          splitKey: 'm',
        } : {
          workflowId: `${scenario.family}-${scenario.phase}`,
          workflowAttempt: 1,
          workflowFenceToken: 1,
          sourcePartitionIds: [FIXTURE_PARTITION_ID, 'users-p2'],
          targetPartitionId: 'users-merged',
          targetPartitionVersion: 2,
          primaryKeyColumn: 'id',
        },
        phase: scenario.phase,
        pendingEntries: [],
        flushPromise: null,
        snapshotBarrierIndex: watermark,
        replayWatermarkIndex: watermark,
      };
      Object.assign(source.restarted, {
        splitReplication: isSplit ? handle : null,
        mergeReplication: isSplit ? null : handle,
        openSplitSnapshotDatabase() {
          snapshots += 1;
          return {close() {}};
        },
        replaySplitEntry: async (entry) => replayed.push(entry),
        replayMergeEntry: async (entry) => replayed.push(entry),
        waitForMergeCutoverActivation: async () => {},
        emitSplitSourceAck: async (_metadata, status) => {
          if (status === 'snapshot_started') {
            authorizationEntered.resolve();
            await authorizationGate.promise;
          }
          return {result: status === 'catchup_ready' ? 'duplicate' : 'accepted',
            splitCutoverApplied: status === 'catchup_ready',
            splitSourceRetired: status === 'cleanup_completed'};
        },
        emitMergeSourceAck: async (_metadata, status) => {
          if (status === 'snapshot_started') {
            authorizationEntered.resolve();
            await authorizationGate.promise;
          }
          return {result: status === 'catchup_ready' ? 'duplicate' : 'accepted',
            mergeCutoverApplied: status === 'catchup_ready'};
        },
      });

      const start = isSplit ?
        startSplitReplicationHandleForService(source.restarted, handle) :
        startMergeReplicationHandleForService(source.restarted, handle);
      await authorizationEntered.promise;
      const duringAuthorization = insertCommand(
        `${scenario.family}-${scenario.phase}`);
      await source.restarted.raft.propose(duringAuthorization);
      assert.equal(handle.pendingEntries.length, 0,
        `${scenario.family} ${scenario.phase}: unauthorized after-write ` +
        'cannot enter the volatile queue');
      authorizationGate.resolve();
      const response = await start;
      assert.equal(response.acknowledged, true,
        `${scenario.family} ${scenario.phase}: durable START is accepted`);
      await (isSplit ? source.restarted.splitReplicationRun :
        source.restarted.mergeReplicationRun);
      assert.equal(snapshots, 0,
        `${scenario.family} ${scenario.phase}: recovery does not regress ` +
        'to snapshot backfill');
      assert.deepEqual(replayed.map((entry) => entry.entryId),
        [duringAuthorization.entryId],
        `${scenario.family} ${scenario.phase}: the authorization window is ` +
        'recovered from the committed source log');
    } finally {
      await source.dispose();
    }
  }
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
      authorized: true,
      quiescing: false,
      quiesced: false,
      activities: new Set(),
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
  const source = await restartedSource(
    [insertCommand('a'), insertCommand('b')]);
  try {
    const [first, second] = source.committed;
    const proto = PartitionService.prototype;
    const rawMetadata = buildSplitRawMetadata({
      [PARTITION_TRANSITION_METADATA_FIELD.SOURCE_CHECKPOINT]:
        buildReplayCursorCheckpoint(
          SPLIT_ACK_CHECKPOINT_FIELD, first.index, first.index),
    });
    const workerCalls = [];
    const context = Object.assign(Object.create(source.restarted), {
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
      runSplitReplicationWorkflow() {
        workerCalls.push(this.splitReplication?.phase || null);
        return Promise.resolve();
      },
      emitSplitSourceAck() {
        return Promise.resolve({result: 'accepted'});
      },
    });

    const resumed = await proto.startOrResumeSplitReplicationFromDurable
      .call(context);

    assert.equal(resumed, true, 'the worker must be resumed');
    assert.equal(workerCalls.length, 1, 'the worker must run exactly once');
    assert.ok(context.splitReplication, 'execution state must reconstruct');
    assert.deepEqual(
      context.splitReplication.pendingEntries.map((entry) => entry.logIndex),
      [second.index],
      'the resumed worker replays from the durable log behind the ' +
        'persisted watermark',
    );
    assert.equal(context.splitReplication.replayWatermarkIndex, first.index);
  } finally {
    await source.dispose();
  }
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
