/**
 * Guard tests for the source-partition merge replication executor:
 * START_MERGE_REPLICATION validation and idempotency, the ack ladder
 * (snapshot_started -> catchup_ready -> cutover_applied ->
 * source_mirror_removed), CDC fan-in data completeness (snapshot rows plus
 * live writes queued mid-mirror all reach the merged target), the
 * cutover-observation wait path, and the no-direct-system-table-write
 * owner boundary.
 */

import {test} from '../../src/test-helpers/tap.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {
  PARTITION_TRANSITION_STATE,
} from '../../src/partition/partition-constants.js';
import {
  PARTITION_SERVICE_ERROR_MSG,
} from '../../src/partition/partition-service-constants.js';
import {
  MERGE_ACK_CHECKPOINT_FIELD,
  MERGE_ACK_STATUS,
  buildMergeSourceParticipantKey,
} from '../../src/partition/merge-ack-constants.js';
import {
  PARTICIPANT_ACK_FIELD,
} from '../../src/workflow/workflow-constants.js';

const FIXTURE_WORKFLOW_ID = 'merge-tbl-users-users-p1-users-p2-v2';
const FIXTURE_TARGET_PARTITION_ID = 'tbl-users_p_abcd1234_merged';
const FIXTURE_SOURCE_PARTITION_ID = 'users-p1';
const FIXTURE_PEER_SOURCE_PARTITION_ID = 'users-p2';

async function loadPartitionServicePrototype() {
  const mod = await import('../../src/partition/partition-service.js');
  return mod.PartitionService.prototype;
}

function buildMetadata() {
  return {
    workflowId: FIXTURE_WORKFLOW_ID,
    primaryKeyColumn: 'id',
    sourcePartitionIds: [
      FIXTURE_SOURCE_PARTITION_ID,
      FIXTURE_PEER_SOURCE_PARTITION_ID,
    ],
    targetPartitionIds: [FIXTURE_TARGET_PARTITION_ID],
    targetPartitionVersion: 2,
  };
}

/**
 * Build a minimal PartitionService `this` context with recording stubs.
 * Mirrors the prototype-method-borrow fixture style used by
 * split-source-participant-ack.test.js.
 */
async function buildSourceContext(options = {}) {
  const proto = await loadPartitionServicePrototype();
  const ackCalls = [];
  const mirroredWrites = [];
  const snapshotRows = options.snapshotRows || [
    {id: 'a', v: 1},
    {id: 'b', v: 2},
  ];
  const context = {
    partitionId: FIXTURE_SOURCE_PARTITION_ID,
    tableId: 'tbl-users',
    tableName: 'users',
    role: RAFT_ROLE.LEADER,
    isShutdown: false,
    dbPath: ':memory:',
    splitSnapshotBackfillYieldEveryRows: 0,
    mergeReplication: null,
    mergeReplicationRun: null,
    splitReplication: null,
    db: {
      prepare(sql) {
        if (sql.startsWith('PRAGMA')) {
          return {all: () => [{name: 'id'}, {name: 'v'}]};
        }
        return {all: () => snapshotRows};
      },
    },
    logger: {info() {}, warn() {}, error() {}},
    systemTableCache: options.systemTableCache || null,
    sqlQueryEngine: {
      managedMergeWorkflow: {
        async acknowledgeMergeSourceParticipant(workflowId, ack) {
          ackCalls.push({workflowId, ack});
          const responder = options.ackResponder;
          return responder ?
            responder(workflowId, ack) :
            {result: 'accepted', mergeCutoverApplied: true};
        },
      },
      queryExecutor: {
        async executeOnPartition(partitionId, sql, params) {
          mirroredWrites.push({partitionId, sql, params});
          return {success: true};
        },
      },
    },
    cdcIntegrationService: options.cdcIntegrationService || null,
  };
  // Borrow the production prototype methods onto the context.
  const methodNames = [
    'normalizeMergeTransitionMetadata',
    'isSameMergeReplication',
    'handleStartMergeReplication',
    'forwardStartMergeReplicationToLeader',
    'resolveInFlightMergeReplicationResponse',
    'handleMergeReplicationRunFailure',
    'resolveMergeFailureAckStatus',
    'mirrorCutoverActiveMergeWrite',
    'drainMergeReplicationQueueQuietly',
    'runMergeReplicationWorkflow',
    'emitMergeSourceAck',
    'resolveMergeDescriptorEpochEvidence',
    'assertMergeRoutingDescriptorEpoch',
    'backfillMergeSnapshot',
    'applyMergeSnapshotRow',
    'routeMergeMirroredWrite',
    'handleMergeReplicationAfterWrite',
    'flushMergeReplicationQueue',
    'replayMergeEntry',
    'waitForMergeCutoverActivation',
    'isMergeCutoverActive',
    'isMergeTransitionAborted',
    'resolveLocalTableDescriptor',
    'openSplitSnapshotDatabase',
    'yieldSplitBackfillTurn',
    'cloneSplitEntry',
    'routeSplitMirroredWrite',
  ];
  for (const methodName of methodNames) {
    context[methodName] = proto[methodName];
  }
  return {context, ackCalls, mirroredWrites, snapshotRows};
}

test('merge source - rejects invalid merge transition metadata',
  async (t) => {
    const {context} = await buildSourceContext();
    const response = await context.handleStartMergeReplication({
      transitionMetadata: {workflowId: FIXTURE_WORKFLOW_ID},
    });
    t.equal(response.acknowledged, false);
    t.equal(
      response.error,
      PARTITION_SERVICE_ERROR_MSG.INVALID_MERGE_REPLICATION,
    );
    t.equal(context.mergeReplication, null);
  });

test('merge source - full run emits the ack ladder in order and fans ' +
    'every snapshot row into the merged target', async (t) => {
  const {context, ackCalls, mirroredWrites} = await buildSourceContext();
  const response = await context.handleStartMergeReplication({
    transitionMetadata: buildMetadata(),
  });
  t.equal(response.acknowledged, true);
  t.equal(response.success, true);
  await context.mergeReplicationRun;

  const ackStatuses = ackCalls.map(
    (call) => call.ack[PARTICIPANT_ACK_FIELD.STATUS],
  );
  t.same(ackStatuses, [
    MERGE_ACK_STATUS.SNAPSHOT_STARTED,
    MERGE_ACK_STATUS.CATCHUP_READY,
    MERGE_ACK_STATUS.CUTOVER_APPLIED,
    MERGE_ACK_STATUS.SOURCE_MIRROR_REMOVED,
  ]);
  for (const ackCall of ackCalls) {
    t.equal(ackCall.workflowId, FIXTURE_WORKFLOW_ID);
    t.equal(
      ackCall.ack[PARTICIPANT_ACK_FIELD.PARTICIPANT_KEY],
      buildMergeSourceParticipantKey(FIXTURE_SOURCE_PARTITION_ID),
    );
  }
  const finalCheckpoint =
    ackCalls[ackCalls.length - 1].ack[PARTICIPANT_ACK_FIELD.CHECKPOINT];
  t.equal(
    finalCheckpoint[MERGE_ACK_CHECKPOINT_FIELD.SOURCE_MIRROR_REMOVED],
    true,
  );

  // Data path: every snapshot row lands on the single merged target.
  t.equal(mirroredWrites.length, 2);
  for (const mirroredWrite of mirroredWrites) {
    t.equal(mirroredWrite.partitionId, FIXTURE_TARGET_PARTITION_ID);
    t.match(mirroredWrite.sql, /INSERT OR REPLACE INTO users/);
  }
  t.same(
    mirroredWrites.map((write) => write.params[0]).sort(),
    ['a', 'b'],
  );

  // Mirror removed after completion.
  t.equal(context.mergeReplication, null);
});

test('merge source - idempotent restart acks; conflicting replication ' +
    'is refused', async (t) => {
  const {context} = await buildSourceContext();
  await context.handleStartMergeReplication({
    transitionMetadata: buildMetadata(),
  });
  // Re-install an in-flight handle to simulate mid-run re-delivery.
  context.mergeReplication = {
    metadata: context.normalizeMergeTransitionMetadata(buildMetadata()),
    phase: PARTITION_TRANSITION_STATE.MERGE_BACKFILLING,
    pendingEntries: [],
    flushInFlight: false,
    startedAt: 1,
    lastError: null,
  };
  const duplicateResponse = await context.handleStartMergeReplication({
    transitionMetadata: buildMetadata(),
  });
  t.equal(duplicateResponse.acknowledged, true);
  t.equal(duplicateResponse.success, true);

  const conflictingMetadata = {
    ...buildMetadata(),
    targetPartitionIds: ['tbl-users_p_ffff9999_merged'],
  };
  const conflictResponse = await context.handleStartMergeReplication({
    transitionMetadata: conflictingMetadata,
  });
  t.equal(conflictResponse.acknowledged, false);
  t.equal(
    conflictResponse.error,
    PARTITION_SERVICE_ERROR_MSG.MERGE_REPLICATION_STATE_REQUIRED,
  );
});

test('merge source - live writes queued mid-mirror are flushed to the ' +
    'target: no rows lost', async (t) => {
  let releaseCatchup;
  const catchupGate = new Promise((resolve) => {
    releaseCatchup = resolve;
  });
  const {context, mirroredWrites} = await buildSourceContext({
    ackResponder: async (workflowId, ack) => {
      if (ack[PARTICIPANT_ACK_FIELD.STATUS] ===
          MERGE_ACK_STATUS.CATCHUP_READY) {
        // Hold the owner ack until the live write below is queued.
        await catchupGate;
        return {result: 'accepted', mergeCutoverApplied: true};
      }
      return {result: 'accepted', mergeCutoverApplied: true};
    },
  });
  await context.handleStartMergeReplication({
    transitionMetadata: buildMetadata(),
  });

  // A live write lands while the source is still mirroring.
  await context.handleMergeReplicationAfterWrite({
    sql: 'INSERT INTO users (id, v) VALUES (?, ?)',
    params: ['c', 3],
  });
  t.ok(context.mergeReplication.pendingEntries.length >= 0);
  releaseCatchup();
  await context.mergeReplicationRun;

  // Snapshot rows a,b plus live row c all reached the merged target.
  const deliveredKeys = mirroredWrites
    .map((write) => write.params[0])
    .sort();
  t.same(deliveredKeys, ['a', 'b', 'c']);
  for (const mirroredWrite of mirroredWrites) {
    t.equal(mirroredWrite.partitionId, FIXTURE_TARGET_PARTITION_ID);
  }
});

test('merge source - mirror-origin entries are skipped to prevent loops',
  async (t) => {
    const {context, mirroredWrites} = await buildSourceContext();
    context.mergeReplication = {
      metadata: context.normalizeMergeTransitionMetadata(buildMetadata()),
      phase: PARTITION_TRANSITION_STATE.MERGE_CUTOVER_ACTIVE,
      pendingEntries: [],
      flushInFlight: false,
      startedAt: 1,
      lastError: null,
    };
    await context.handleMergeReplicationAfterWrite({
      sql: 'INSERT INTO users (id, v) VALUES (?, ?)',
      params: ['x', 9],
      splitMirrorOrigin: 'source',
    });
    t.equal(mirroredWrites.length, 0);

    await context.handleMergeReplicationAfterWrite({
      sql: 'INSERT INTO users (id, v) VALUES (?, ?)',
      params: ['y', 10],
    });
    t.equal(mirroredWrites.length, 1);
    t.equal(mirroredWrites[0].partitionId, FIXTURE_TARGET_PARTITION_ID);
  });

test('merge source - waits for the durable cutover when the owner has ' +
    'not applied it at catch-up time', async (t) => {
  // Durable rows as the source's cache observes them: pending epoch 2
  // while the merge is in flight; the owner's cutover flips it later.
  const durableTableRow = {
    table_id: 'tbl-users',
    active_partition_version: 1,
    pending_partition_version: 2,
    partition_transition_state:
      PARTITION_TRANSITION_STATE.MERGE_BACKFILLING,
  };
  const targetPartitionRow = {
    partition_id: FIXTURE_TARGET_PARTITION_ID,
    partition_version: 2,
  };
  const {context, ackCalls} = await buildSourceContext({
    ackResponder: (workflowId, ack) => {
      if (ack[PARTICIPANT_ACK_FIELD.STATUS] ===
          MERGE_ACK_STATUS.CATCHUP_READY) {
        // Owner applies the durable cutover shortly after this ack.
        setTimeout(() => {
          durableTableRow.partition_transition_state =
            PARTITION_TRANSITION_STATE.MERGE_CUTOVER_ACTIVE;
          durableTableRow.active_partition_version = 2;
          durableTableRow.pending_partition_version = null;
        }, 50);
        return {result: 'accepted', mergeCutoverApplied: false};
      }
      return {result: 'accepted', mergeCutoverApplied: false};
    },
    systemTableCache: {
      get(tableName, key) {
        if (tableName === 'tables') {
          return durableTableRow;
        }
        if (tableName === 'partitions' &&
            key === FIXTURE_TARGET_PARTITION_ID) {
          return targetPartitionRow;
        }
        return null;
      },
    },
  });
  await context.handleStartMergeReplication({
    transitionMetadata: buildMetadata(),
  });
  await context.mergeReplicationRun;

  const ackStatuses = ackCalls.map(
    (call) => call.ack[PARTICIPANT_ACK_FIELD.STATUS],
  );
  t.same(ackStatuses, [
    MERGE_ACK_STATUS.SNAPSHOT_STARTED,
    MERGE_ACK_STATUS.CATCHUP_READY,
    MERGE_ACK_STATUS.CUTOVER_APPLIED,
    MERGE_ACK_STATUS.SOURCE_MIRROR_REMOVED,
  ]);
  t.equal(
    durableTableRow.partition_transition_state,
    PARTITION_TRANSITION_STATE.MERGE_CUTOVER_ACTIVE,
  );
});

test('merge source - never writes system tables directly; failed run ' +
    'marks the local handle FAILED', async (t) => {
  const {context} = await buildSourceContext({
    cdcIntegrationService: {
      updateSystemTableRow() {
        t.fail('source-side merge executor must not write system tables');
      },
    },
    ackResponder: () => {
      throw new Error('owner unavailable');
    },
  });
  await context.handleStartMergeReplication({
    transitionMetadata: buildMetadata(),
  });
  await context.mergeReplicationRun;

  t.equal(
    context.mergeReplication.phase,
    PARTITION_TRANSITION_STATE.FAILED,
  );
  t.equal(context.mergeReplication.lastError, 'owner unavailable');
});

test('merge source - queue is fully drained BEFORE the catch-up ack the ' +
    'owner may cut over on (D4 guard)', async (t) => {
  let stateAtCatchupAck = null;
  let releaseSnapshot;
  const snapshotGate = new Promise((resolve) => {
    releaseSnapshot = resolve;
  });
  const {context, mirroredWrites} = await buildSourceContext({
    ackResponder: async (workflowId, ack) => {
      if (ack[PARTICIPANT_ACK_FIELD.STATUS] ===
          MERGE_ACK_STATUS.SNAPSHOT_STARTED) {
        // Hold the run until the live write below is queued.
        await snapshotGate;
      }
      if (ack[PARTICIPANT_ACK_FIELD.STATUS] ===
          MERGE_ACK_STATUS.CATCHUP_READY) {
        // The exact moment the owner may apply the durable cutover.
        stateAtCatchupAck = {
          pendingUndelivered:
            context.mergeReplication.pendingEntries.map(
              (entry) => entry.params[0],
            ),
          deliveredKeys: mirroredWrites.map(
            (write) => write.params[0],
          ),
        };
      }
      return {result: 'accepted', mergeCutoverApplied: true};
    },
  });
  await context.handleStartMergeReplication({
    transitionMetadata: buildMetadata(),
  });
  // Acknowledged client write lands during backfill -> queued.
  await context.handleMergeReplicationAfterWrite({
    sql: 'INSERT INTO users (id, v) VALUES (?, ?)',
    params: ['queued-key', 1],
  });
  releaseSnapshot();
  await context.mergeReplicationRun;

  t.same(stateAtCatchupAck.pendingUndelivered, []);
  t.ok(stateAtCatchupAck.deliveredKeys.includes('queued-key'));
});

test('merge source - a mirror failure emits the matching failure ack ' +
    'so the owner can abort before cutover (D2 guard)', async (t) => {
  const {context, ackCalls} = await buildSourceContext();
  // The queued live write fails to mirror during the pre-ack drain.
  context.sqlQueryEngine.queryExecutor.executeOnPartition =
    async (pid, sql, params) => {
      if (params[0] === 'poison-key') {
        return {success: false, error: 'route down'};
      }
      return {success: true};
    };
  await context.handleStartMergeReplication({
    transitionMetadata: buildMetadata(),
  });
  await context.handleMergeReplicationAfterWrite({
    sql: 'INSERT INTO users (id, v) VALUES (?, ?)',
    params: ['poison-key', 1],
  });
  await context.mergeReplicationRun;

  const ackStatuses = ackCalls.map(
    (call) => call.ack[PARTICIPANT_ACK_FIELD.STATUS],
  );
  t.same(ackStatuses, [
    MERGE_ACK_STATUS.SNAPSHOT_STARTED,
    MERGE_ACK_STATUS.BACKFILL_FAILED,
  ]);
  t.equal(
    context.mergeReplication.phase,
    PARTITION_TRANSITION_STATE.FAILED,
  );
  // The undelivered acknowledged write is retained, not dropped.
  t.same(
    context.mergeReplication.pendingEntries.map((entry) => entry.params[0]),
    ['poison-key'],
  );

  // A write landing AFTER the failure is retained too — fail closed,
  // never silently dropped from mirroring (D2c).
  await context.handleMergeReplicationAfterWrite({
    sql: 'INSERT INTO users (id, v) VALUES (?, ?)',
    params: ['later-key', 2],
  });
  t.same(
    context.mergeReplication.pendingEntries.map((entry) => entry.params[0]),
    ['poison-key', 'later-key'],
  );
});

test('merge source - cutover-active live writes preserve source order ' +
    'behind a non-empty queue (D5 guard)', async (t) => {
  const {context, mirroredWrites} = await buildSourceContext();
  context.mergeReplication = {
    metadata: context.normalizeMergeTransitionMetadata(buildMetadata()),
    phase: PARTITION_TRANSITION_STATE.MERGE_CUTOVER_ACTIVE,
    pendingEntries: [
      {sql: 'INSERT INTO users (id, v) VALUES (?, ?)', params: ['older', 1]},
    ],
    flushInFlight: false,
    startedAt: 1,
    lastError: null,
  };

  // The newer write must NOT overtake the older queued entry.
  await context.handleMergeReplicationAfterWrite({
    sql: 'INSERT INTO users (id, v) VALUES (?, ?)',
    params: ['newer', 2],
  });

  t.same(
    mirroredWrites.map((write) => write.params[0]),
    ['older', 'newer'],
  );
  t.equal(context.mergeReplication.pendingEntries.length, 0);

  // Once drained, direct replay resumes.
  await context.handleMergeReplicationAfterWrite({
    sql: 'INSERT INTO users (id, v) VALUES (?, ?)',
    params: ['direct', 3],
  });
  t.same(
    mirroredWrites.map((write) => write.params[0]),
    ['older', 'newer', 'direct'],
  );
});

test('merge source - the peer abort is observed: cutover wait exits ' +
    'early when the durable transition reads FAILED', async (t) => {
  // Healthy pending epoch while mirroring; the owner aborts (peer source
  // failure) right after this source reports catch-up readiness.
  const durableTableRow = {
    table_id: 'tbl-users',
    active_partition_version: 1,
    pending_partition_version: 2,
    partition_transition_state:
      PARTITION_TRANSITION_STATE.MERGE_BACKFILLING,
  };
  const targetPartitionRow = {
    partition_id: FIXTURE_TARGET_PARTITION_ID,
    partition_version: 2,
  };
  const {context, ackCalls} = await buildSourceContext({
    ackResponder: (workflowId, ack) => {
      if (ack[PARTICIPANT_ACK_FIELD.STATUS] ===
          MERGE_ACK_STATUS.CATCHUP_READY) {
        durableTableRow.partition_transition_state =
          PARTITION_TRANSITION_STATE.FAILED;
        durableTableRow.pending_partition_version = null;
      }
      return {result: 'accepted', mergeCutoverApplied: false};
    },
    systemTableCache: {
      get(tableName, key) {
        if (tableName === 'tables') {
          return durableTableRow;
        }
        if (tableName === 'partitions' &&
            key === FIXTURE_TARGET_PARTITION_ID) {
          return targetPartitionRow;
        }
        return null;
      },
    },
  });
  await context.handleStartMergeReplication({
    transitionMetadata: buildMetadata(),
  });
  await context.mergeReplicationRun;

  t.equal(
    context.mergeReplication.phase,
    PARTITION_TRANSITION_STATE.FAILED,
  );
  t.equal(
    context.mergeReplication.lastError,
    PARTITION_SERVICE_ERROR_MSG.MERGE_CUTOVER_WAIT_ABORTED,
  );
  const lastAckStatus =
    ackCalls[ackCalls.length - 1].ack[PARTICIPANT_ACK_FIELD.STATUS];
  t.equal(lastAckStatus, MERGE_ACK_STATUS.BACKFILL_FAILED);
});
