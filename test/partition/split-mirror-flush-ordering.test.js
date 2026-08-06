import {test} from '../../src/test-helpers/tap.js';
import {
  PARTITION_TRANSITION_METADATA_FIELD,
  PARTITION_TRANSITION_STATE,
} from '../../src/partition/partition-constants.js';
import {
  SPLIT_ACK_STATUS,
} from '../../src/partition/split-ack-constants.js';

const FIXTURE_PARTITION_ID = 'users-p1';
const FIXTURE_WORKFLOW_ID = 'split-tbl-users-users-p1-v2';

function buildMetadata() {
  return {
    workflowId: FIXTURE_WORKFLOW_ID,
    primaryKeyColumn: 'id',
    sourcePartitionId: FIXTURE_PARTITION_ID,
    splitKey: 'm',
    targetPartitionIds: ['users-left', 'users-right'],
    [PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_VERSION]: 2,
  };
}

async function loadPartitionServicePrototype() {
  const mod = await import('../../src/partition/partition-service.js');
  return mod.PartitionService.prototype;
}

function buildSplitReplicationHandle(metadata, overrides = {}) {
  return {
    metadata,
    phase: PARTITION_TRANSITION_STATE.SPLIT_BACKFILLING,
    pendingEntries: [],
    flushPromise: null,
    startedAt: 1,
    lastError: null,
    ...overrides,
  };
}

test('flushSplitReplicationQueue joins concurrent callers on the same ' +
  'drain instead of returning while entries remain queued', async (t) => {
  const proto = await loadPartitionServicePrototype();
  const delivered = [];
  let releaseFirstReplay;
  const firstReplayGate = new Promise((resolve) => {
    releaseFirstReplay = resolve;
  });
  const splitReplication = buildSplitReplicationHandle(buildMetadata(), {
    pendingEntries: [
      {sql: 'INSERT INTO users (id) VALUES (?)', params: ['a']},
      {sql: 'INSERT INTO users (id) VALUES (?)', params: ['b']},
    ],
  });
  const context = {
    splitReplication,
    drainSplitReplicationQueue: proto.drainSplitReplicationQueue,
    async replaySplitEntry(entry) {
      if (entry.params[0] === 'a') {
        await firstReplayGate;
      }
      delivered.push(entry.params[0]);
    },
  };

  const firstFlush = proto.flushSplitReplicationQueue.call(context);
  // The second call arrives while the first drain is parked mid-entry:
  // it must join the in-flight drain, not return immediately.
  const secondFlush = proto.flushSplitReplicationQueue.call(context);
  let secondSettled = false;
  secondFlush.then(() => {
    secondSettled = true;
  });
  await new Promise((resolve) => {
    setImmediate(resolve);
  });
  t.equal(
    secondSettled,
    false,
    'a concurrent flush must not settle while the drain is parked',
  );
  t.equal(
    splitReplication.flushPromise !== null,
    true,
    'the in-flight flush must be exposed as a joinable promise',
  );

  releaseFirstReplay();
  await Promise.all([firstFlush, secondFlush]);
  t.same(delivered, ['a', 'b'], 'source order must be preserved');
  t.equal(
    splitReplication.flushPromise,
    null,
    'the flush promise must clear once the drain settles',
  );
});

test('runSplitReplicationWorkflow drains queued deltas BEFORE emitting ' +
  'catchup_ready so the owner cutover never fires over undelivered ' +
  'writes', async (t) => {
  const proto = await loadPartitionServicePrototype();
  const callOrder = [];
  const metadata = buildMetadata();
  const context = {
    partitionId: FIXTURE_PARTITION_ID,
    splitReplication: buildSplitReplicationHandle(metadata),
    logger: {info() {}},
    openSplitSnapshotDatabase() {
      return {prepare: () => ({all: () => []}), close() {}};
    },
    async backfillSplitSnapshot() {
      callOrder.push('backfill');
    },
    async flushSplitReplicationQueue() {
      callOrder.push('flush');
    },
    async markSplitCutoverActive() {
      callOrder.push('cutover');
    },
    async emitSplitSourceAck(_metadata, ackStatus) {
      callOrder.push(`ack:${ackStatus}`);
      if (ackStatus === SPLIT_ACK_STATUS.CATCHUP_READY) {
        callOrder.push('cutover');
        return {result: 'accepted', splitCutoverApplied: true};
      }
      return {result: 'accepted'};
    },
  };

  await proto.runSplitReplicationWorkflow.call(context);

  const catchupAckIndex = callOrder.indexOf(
    `ack:${SPLIT_ACK_STATUS.CATCHUP_READY}`,
  );
  const firstFlushIndex = callOrder.indexOf('flush');
  t.ok(catchupAckIndex > 0, 'catchup_ready must be emitted');
  t.ok(
    firstFlushIndex !== -1 && firstFlushIndex < catchupAckIndex,
    'the queue must drain before catchup_ready is acknowledged: the ' +
    'owner may apply the durable cutover on that ack',
  );
  t.ok(
    callOrder.indexOf('cutover') > catchupAckIndex,
    'cutover activation must follow the catchup acknowledgement',
  );
});

test('cutover-active mirrored writes never overtake a non-empty queue',
  async (t) => {
    const proto = await loadPartitionServicePrototype();
    const delivered = [];
    const splitReplication = buildSplitReplicationHandle(buildMetadata(), {
      phase: PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE,
      pendingEntries: [
        {sql: 'INSERT INTO users (id) VALUES (?)', params: ['older']},
      ],
    });
    const context = {
      partitionId: FIXTURE_PARTITION_ID,
      splitReplication,
      logger: {info() {}, warn() {}},
      cloneSplitEntry: proto.cloneSplitEntry,
      mirrorCutoverActiveSplitWrite: proto.mirrorCutoverActiveSplitWrite,
      drainSplitReplicationQueueQuietly:
        proto.drainSplitReplicationQueueQuietly,
      flushSplitReplicationQueue: proto.flushSplitReplicationQueue,
      drainSplitReplicationQueue: proto.drainSplitReplicationQueue,
      handleSplitReplicationAfterWrite:
        proto.handleSplitReplicationAfterWrite,
      async replaySplitEntry(entry) {
        delivered.push(entry.params[0]);
      },
    };

    await context.handleSplitReplicationAfterWrite({
      sql: 'INSERT INTO users (id) VALUES (?)',
      params: ['newer'],
    });

    t.same(
      delivered,
      ['older', 'newer'],
      'the newer write must queue behind undelivered entries and drain ' +
      'in source order',
    );
    t.equal(
      splitReplication.pendingEntries.length,
      0,
      'the queue must be empty after the joined drain',
    );

    await context.handleSplitReplicationAfterWrite({
      sql: 'INSERT INTO users (id) VALUES (?)',
      params: ['direct'],
    });
    t.same(
      delivered,
      ['older', 'newer', 'direct'],
      'direct replay must resume once the queue is empty and idle',
    );
  });

test('a failed cutover-active mirror queues the entry and the joined ' +
  'drain preserves source order', async (t) => {
  const proto = await loadPartitionServicePrototype();
  const delivered = [];
  const splitReplication = buildSplitReplicationHandle(buildMetadata(), {
    phase: PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE,
  });
  let failFirst = true;
  const context = {
    partitionId: FIXTURE_PARTITION_ID,
    splitReplication,
    logger: {info() {}, warn() {}},
    cloneSplitEntry: proto.cloneSplitEntry,
    mirrorCutoverActiveSplitWrite: proto.mirrorCutoverActiveSplitWrite,
    drainSplitReplicationQueueQuietly:
        proto.drainSplitReplicationQueueQuietly,
    flushSplitReplicationQueue: proto.flushSplitReplicationQueue,
    drainSplitReplicationQueue: proto.drainSplitReplicationQueue,
    handleSplitReplicationAfterWrite:
        proto.handleSplitReplicationAfterWrite,
    async replaySplitEntry(entry) {
      if (failFirst) {
        failFirst = false;
        throw new Error('route down');
      }
      delivered.push(entry.params[0]);
    },
  };

  await context.handleSplitReplicationAfterWrite({
    sql: 'INSERT INTO users (id) VALUES (?)',
    params: ['stranded'],
  });
  t.equal(
    splitReplication.lastError,
    'route down',
    'the flush failure must be recorded on the handle',
  );
  t.same(
    delivered,
    ['stranded'],
    'the queued retry must deliver the stranded write once the route ' +
      'recovers — it is never dropped',
  );

  await context.handleSplitReplicationAfterWrite({
    sql: 'INSERT INTO users (id) VALUES (?)',
    params: ['follow-up'],
  });
  t.same(
    delivered,
    ['stranded', 'follow-up'],
    'the retained entry must drain before later writes',
  );
});
