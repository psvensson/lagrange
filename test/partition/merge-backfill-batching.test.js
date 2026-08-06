/**
 * Regression tests for F22 (merge-backfill-batching): the merge snapshot
 * backfill batches rows like the split path does — bounded multi-row
 * INSERT OR REPLACE tuples capped by SPLIT_SNAPSHOT_MAX_BIND_VARIABLES,
 * one descriptor-epoch assert per batch (not per row), primary-key order
 * preserved within and across batches, and the splitSnapshotBackfill
 * yield cadence still paces the copy.
 */

import {test} from '../../src/test-helpers/tap.js';
import Database from 'better-sqlite3';
import {
  PARTITION_SERVICE_ERROR_MSG,
} from '../../src/partition/partition-service-constants.js';
import {
  resolveSplitSnapshotBatchRowLimit,
} from '../../src/partition/partition-split-routing.js';

const FIXTURE_TARGET_PARTITION_ID = 'tbl-users_p_abcd1234_merged';
const FIXTURE_SOURCE_PARTITION_ID = 'users-p1';
const FIXTURE_PEER_SOURCE_PARTITION_ID = 'users-p2';
const MERGED_TARGET_VERSION = 2;

async function loadPartitionServicePrototype() {
  const mod = await import('../../src/partition/partition-service.js');
  return mod.PartitionService.prototype;
}

function buildMetadata() {
  return {
    workflowId: 'merge-tbl-users-users-p1-users-p2-v2',
    primaryKeyColumn: 'id',
    sourcePartitionIds: [
      FIXTURE_SOURCE_PARTITION_ID,
      FIXTURE_PEER_SOURCE_PARTITION_ID,
    ],
    targetPartitionIds: [FIXTURE_TARGET_PARTITION_ID],
    targetPartitionVersion: MERGED_TARGET_VERSION,
  };
}

function buildSystemTableCache(tableDescriptor) {
  return {
    get(table, key) {
      if (table === 'tables') {
        return tableDescriptor;
      }
      if (table === 'partitions' && key === FIXTURE_TARGET_PARTITION_ID) {
        return {
          partition_id: key,
          partition_version: MERGED_TARGET_VERSION,
        };
      }
      return null;
    },
  };
}

/**
 * Build a minimal PartitionService `this` context borrowing the real
 * merge backfill prototype methods, with a recording query executor.
 * Mirrors the fixture style of merge-source-replication.test.js.
 */
async function buildBackfillContext(options = {}) {
  const proto = await loadPartitionServicePrototype();
  const mirroredWrites = [];
  const context = {
    partitionId: FIXTURE_SOURCE_PARTITION_ID,
    tableId: 'tbl-users',
    tableName: options.tableName || 'users',
    splitSnapshotBackfillYieldEveryRows: options.yieldEveryRows ?? 0,
    mergeReplication: {phase: 'merge_backfilling'},
    systemTableCache: buildSystemTableCache(
      options.tableDescriptor || {
        table_id: 'tbl-users',
        active_partition_version: 1,
        pending_partition_version: MERGED_TARGET_VERSION,
      },
    ),
    sqlQueryEngine: {
      queryExecutor: {
        async executeOnPartition(partitionId, sql, params) {
          mirroredWrites.push({partitionId, sql, params});
          return {success: true};
        },
      },
    },
  };
  for (const methodName of [
    'normalizeMergeTransitionMetadata',
    'backfillMergeSnapshot',
    'applyMergeSnapshotBatch',
    'routeMergeMirroredWrite',
    'routeSplitMirroredWrite',
    'assertMergeRoutingDescriptorEpoch',
    'resolveMergeDescriptorEpochEvidence',
    'resolveLocalTableDescriptor',
    'yieldSplitBackfillTurn',
  ]) {
    context[methodName] = proto[methodName];
  }
  const metadata = context.normalizeMergeTransitionMetadata(buildMetadata());
  return {context, mirroredWrites, metadata};
}

function buildSnapshotDb(columns, rows) {
  return {
    prepare(sql) {
      if (sql.startsWith('PRAGMA')) {
        return {all: () => columns.map((name) => ({name}))};
      }
      return {iterate: () => rows[Symbol.iterator]()};
    },
  };
}

test('merge backfill routes ceil(N/batchSize) batched upserts in ' +
    'primary-key order', async (t) => {
  const columns = ['id', 'v'];
  const rows = [
    {id: 'a', v: 1},
    {id: 'b', v: 2},
    {id: 'c', v: 3},
    {id: 'd', v: 4},
    {id: 'e', v: 5},
  ];
  const {context, mirroredWrites, metadata} = await buildBackfillContext({
    yieldEveryRows: 2,
  });

  await context.backfillMergeSnapshot(
    buildSnapshotDb(columns, rows),
    metadata,
  );

  t.equal(
    mirroredWrites.length,
    3,
    'five rows at batch size 2 produce ceil(5/2) = 3 routed writes',
  );
  t.equal(
    mirroredWrites[0].sql,
    'INSERT OR REPLACE INTO users (id, v) VALUES (?, ?), (?, ?)',
  );
  t.equal(
    mirroredWrites[1].sql,
    'INSERT OR REPLACE INTO users (id, v) VALUES (?, ?), (?, ?)',
  );
  t.equal(
    mirroredWrites[2].sql,
    'INSERT OR REPLACE INTO users (id, v) VALUES (?, ?)',
  );
  t.same(
    mirroredWrites.flatMap((write) =>
      write.params.filter((_, index) => index % columns.length === 0)),
    ['a', 'b', 'c', 'd', 'e'],
    'rows land in primary-key order across batches',
  );
  for (const write of mirroredWrites) {
    t.equal(write.partitionId, FIXTURE_TARGET_PARTITION_ID);
  }
});

test('merge backfill batching stays within SQLite bind limits for wide ' +
    'tables', async (t) => {
  const database = new Database(':memory:');
  const columns = [
    'id',
    ...Array.from({length: 511}, (_, index) => `value_${index + 1}`),
  ];
  const rows = Array.from({length: 64}, (_, rowIndex) =>
    Object.fromEntries(
      columns.map((column, columnIndex) => [
        column,
        columnIndex === 0 ? rowIndex + 1 : columnIndex,
      ]),
    ));
  const parameterCounts = [];
  const {context, metadata} = await buildBackfillContext({
    tableName: 'wide_rows',
    // A generous cadence: the bind-variable cap, not the yield cadence,
    // must bound the batch.
    yieldEveryRows: 1_000_000,
  });
  context.sqlQueryEngine.queryExecutor.executeOnPartition =
    async (_partitionId, sql, params) => {
      parameterCounts.push(params.length);
      database.prepare(sql).run(...params);
      return {success: true};
    };

  try {
    database.exec(
      'CREATE TABLE wide_rows (' +
      columns.map((column, index) =>
        `${column} INTEGER${index === 0 ? ' PRIMARY KEY' : ''}`,
      ).join(', ') +
      ')',
    );

    await context.backfillMergeSnapshot(
      buildSnapshotDb(columns, rows),
      metadata,
    );

    t.equal(
      resolveSplitSnapshotBatchRowLimit(columns, 1_000_000),
      63,
      'bind-limited row limit for 512 columns is floor(32766/512) = 63',
    );
    t.same(parameterCounts, [32_256, 512]);
    t.ok(
      parameterCounts.every((count) => count <= 32_766),
      'no batch exceeds the SQLite bind-variable cap',
    );
    t.equal(
      database.prepare('SELECT COUNT(*) AS count FROM wide_rows').get().count,
      64,
    );
  } finally {
    database.close();
  }
});

test('merge backfill asserts the descriptor epoch once per batch, not ' +
    'per row', async (t) => {
  let assertCount = 0;
  const columns = ['id', 'v'];
  const rows = [
    {id: 'a', v: 1},
    {id: 'b', v: 2},
    {id: 'c', v: 3},
  ];
  const {context, mirroredWrites, metadata} = await buildBackfillContext({
    yieldEveryRows: 2,
  });
  const baseAssert = context.assertMergeRoutingDescriptorEpoch;
  context.assertMergeRoutingDescriptorEpoch = function(metadata) {
    assertCount += 1;
    return baseAssert.call(this, metadata);
  };

  await context.backfillMergeSnapshot(
    buildSnapshotDb(columns, rows),
    metadata,
  );

  t.equal(mirroredWrites.length, 2, 'three rows at batch size 2');
  t.equal(
    assertCount,
    mirroredWrites.length,
    'epoch assertion count equals the batch count, not the row count',
  );
});

test('merge backfill rejects a stale descriptor epoch per batch before ' +
    'dispatch', async (t) => {
  let assertCount = 0;
  const columns = ['id', 'v'];
  const rows = [
    {id: 'a', v: 1},
    {id: 'b', v: 2},
    {id: 'c', v: 3},
  ];
  const {context, mirroredWrites, metadata} = await buildBackfillContext({
    yieldEveryRows: 1,
  });
  context.assertMergeRoutingDescriptorEpoch = function() {
    assertCount += 1;
    if (assertCount === 2) {
      throw new Error(
        PARTITION_SERVICE_ERROR_MSG.MERGE_REPLICATION_ROUTING_FAILED,
      );
    }
    return null;
  };

  await t.rejects(
    context.backfillMergeSnapshot(
      buildSnapshotDb(columns, rows),
      metadata,
    ),
    {message: PARTITION_SERVICE_ERROR_MSG.MERGE_REPLICATION_ROUTING_FAILED},
  );
  t.equal(assertCount, 2, 'the assert fires once per attempted batch');
  t.equal(
    mirroredWrites.length,
    1,
    'the stale epoch rejects before dispatching the second batch',
  );
  t.same(mirroredWrites[0].params, ['a', 1]);
});

test('merge backfill preserves the yield cadence: one yield per batch ' +
    'boundary', async (t) => {
  let yieldCount = 0;
  const columns = ['id', 'v'];
  const rows = [
    {id: 'a', v: 1},
    {id: 'b', v: 2},
    {id: 'c', v: 3},
  ];
  const {context, metadata} =
    await buildBackfillContext({yieldEveryRows: 2});
  context.yieldSplitBackfillTurn = async () => {
    yieldCount += 1;
  };

  await context.backfillMergeSnapshot(
    buildSnapshotDb(columns, rows),
    metadata,
  );

  t.equal(
    yieldCount,
    1,
    'the cadence yields once per flushed full batch — the final ' +
      'partial flush pays no yield',
  );
});
