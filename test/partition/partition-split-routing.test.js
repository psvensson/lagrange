import {test} from '../../src/test-helpers/tap.js';
import Database from 'better-sqlite3';
import {
  PARTITION_DESCRIPTOR_EPOCH_ERROR_MSG,
  PARTITION_TRANSITION_METADATA_FIELD,
} from '../../src/partition/partition-constants.js';
import {
  PARTITION_SERVICE_ERROR_MSG,
} from '../../src/partition/partition-service-constants.js';
import {
  cloneSplitEntry,
  replaySplitEntry,
  routeSplitSnapshotBatch,
} from '../../src/partition/partition-split-routing.js';

const TABLE_NAME = 'users';
const PRIMARY_KEY_COLUMN = 'id';
const SPLIT_KEY = 'm';
const ACTIVE_VERSION = 3;
const PENDING_VERSION = 4;
const STALE_VERSION = 2;
const LEFT_PARTITION_ID = 'users-left';
const RIGHT_PARTITION_ID = 'users-right';
const INSERT_SQL = 'INSERT INTO users (id, name) VALUES (?, ?)';

function createMetadata(targetVersion) {
  return {
    primaryKeyColumn: PRIMARY_KEY_COLUMN,
    splitKey: SPLIT_KEY,
    targetPartitionIds: [LEFT_PARTITION_ID, RIGHT_PARTITION_ID],
    [PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_VERSION]:
      targetVersion,
  };
}

function createDescriptorEvidence(tableDescriptor, partitionVersion) {
  return {
    tableDescriptor,
    targetPartitionDescriptors: [
      {
        partition_id: LEFT_PARTITION_ID,
        partition_version: partitionVersion,
      },
      {
        partition_id: RIGHT_PARTITION_ID,
        partition_version: partitionVersion,
      },
    ],
    requireTargetDescriptors: true,
  };
}

test('split routing rejects stale mirrored writes by descriptor epoch',
  async (t) => {
    const queryExecutor = {
      async executeOnPartition() {
        t.fail('stale descriptor epoch must reject before route dispatch');
      },
    };

    await t.rejects(
      replaySplitEntry(
        {
          sql: INSERT_SQL,
          params: ['n', 'Nina'],
          data: {[PRIMARY_KEY_COLUMN]: 'n'},
        },
        createMetadata(STALE_VERSION),
        {
          tableName: TABLE_NAME,
          queryExecutor,
          descriptorEpochEvidence: createDescriptorEvidence(
            {active_partition_version: ACTIVE_VERSION},
            STALE_VERSION,
          ),
        },
      ),
      {message: PARTITION_DESCRIPTOR_EPOCH_ERROR_MSG.STALE_ROUTE},
    );
  });

test('split routing accepts pending target descriptor epoch', async (t) => {
  const routed = [];
  const queryExecutor = {
    async executeOnPartition(partitionId, sql, params) {
      routed.push({partitionId, sql, params});
      return {success: true};
    },
  };

  await replaySplitEntry(
    {
      sql: INSERT_SQL,
      params: ['a', 'Ada'],
      data: {[PRIMARY_KEY_COLUMN]: 'a'},
    },
    createMetadata(PENDING_VERSION),
    {
      tableName: TABLE_NAME,
      queryExecutor,
      descriptorEpochEvidence: createDescriptorEvidence(
        {
          active_partition_version: ACTIVE_VERSION,
          pending_partition_version: PENDING_VERSION,
        },
        PENDING_VERSION,
      ),
    },
  );

  t.same(
    routed.map((entry) => entry.partitionId),
    [LEFT_PARTITION_ID],
  );
});

test('split snapshot batching groups ordered upserts by fenced child',
  async (t) => {
    const routed = [];
    const queryExecutor = {
      async executeOnPartition(
        partitionId,
        sql,
        params,
        _isRead,
        _waitForCommit,
        _isTransaction,
        deliveryOptions,
      ) {
        routed.push({partitionId, sql, params, deliveryOptions});
        return {success: true};
      },
    };

    await routeSplitSnapshotBatch(
      [
        {id: 'a', name: 'Ada'},
        {id: 'z', name: 'Zoe'},
        {id: 'b', name: 'Bob'},
      ],
      ['id', 'name'],
      createMetadata(PENDING_VERSION),
      {
        tableName: TABLE_NAME,
        queryExecutor,
        descriptorEpochEvidence: createDescriptorEvidence(
          {
            active_partition_version: ACTIVE_VERSION,
            pending_partition_version: PENDING_VERSION,
          },
          PENDING_VERSION,
        ),
      },
    );

    t.same(routed, [
      {
        partitionId: LEFT_PARTITION_ID,
        sql: 'INSERT OR REPLACE INTO users (id, name) VALUES (?, ?), (?, ?)',
        params: ['a', 'Ada', 'b', 'Bob'],
        deliveryOptions: {splitMirrorOrigin: 'snapshot'},
      },
      {
        partitionId: RIGHT_PARTITION_ID,
        sql: 'INSERT OR REPLACE INTO users (id, name) VALUES (?, ?)',
        params: ['z', 'Zoe'],
        deliveryOptions: {splitMirrorOrigin: 'snapshot'},
      },
    ]);
  });

test('split snapshot batching refreshes epoch evidence before each child',
  async (t) => {
    let pendingVersion = PENDING_VERSION;
    const routedPartitionIds = [];
    const queryExecutor = {
      async executeOnPartition(partitionId) {
        routedPartitionIds.push(partitionId);
        pendingVersion += 1;
        return {success: true};
      },
    };

    await t.rejects(
      routeSplitSnapshotBatch(
        [
          {id: 'a', name: 'Ada'},
          {id: 'z', name: 'Zoe'},
        ],
        ['id', 'name'],
        createMetadata(PENDING_VERSION),
        {
          tableName: TABLE_NAME,
          queryExecutor,
          resolveDescriptorEpochEvidence: () => createDescriptorEvidence(
            {
              active_partition_version: ACTIVE_VERSION,
              pending_partition_version: pendingVersion,
            },
            pendingVersion,
          ),
        },
      ),
      {message: PARTITION_DESCRIPTOR_EPOCH_ERROR_MSG.STALE_ROUTE},
    );
    t.same(
      routedPartitionIds,
      [LEFT_PARTITION_ID],
      'stale epoch rejects before dispatching the second child batch',
    );
  });

test('split snapshot batching stays within SQLite bind limits for wide tables',
  async (t) => {
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
    const queryExecutor = {
      async executeOnPartition(_partitionId, sql, params) {
        parameterCounts.push(params.length);
        database.prepare(sql).run(...params);
        return {success: true};
      },
    };

    try {
      database.exec(
        'CREATE TABLE wide_rows (' +
        columns.map((column, index) =>
          `${column} INTEGER${index === 0 ? ' PRIMARY KEY' : ''}`,
        ).join(', ') +
        ')',
      );

      await routeSplitSnapshotBatch(
        rows,
        columns,
        {
          primaryKeyColumn: 'id',
          splitKey: 1_000,
          targetPartitionIds: ['wide-left', 'wide-right'],
        },
        {tableName: 'wide_rows', queryExecutor},
      );

      t.same(parameterCounts, [32_256, 512]);
      t.equal(
        database.prepare('SELECT COUNT(*) AS count FROM wide_rows').get().count,
        64,
      );
    } finally {
      database.close();
    }
  });

test('split routing uses canonical SQLite affectedRows for trim(?) and refuses unexecuted function expressions',
  async (t) => {
    const routed = [];
    const queryExecutor = {
      async executeOnPartition(partitionId, sql, params) {
        routed.push({partitionId, sql, params});
        return {success: true};
      },
    };
    const metadata = {
      primaryKeyColumn: PRIMARY_KEY_COLUMN,
      splitKey: 'A',
      targetPartitionIds: [LEFT_PARTITION_ID, RIGHT_PARTITION_ID],
      [PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_VERSION]:
        PENDING_VERSION,
    };
    const options = {
      tableName: 'items',
      queryExecutor,
      descriptorEpochEvidence: createDescriptorEvidence(
        {
          active_partition_version: ACTIVE_VERSION,
          pending_partition_version: PENDING_VERSION,
        },
        PENDING_VERSION,
      ),
    };

    const rawEntry = {
      sql: 'DELETE FROM items WHERE id = trim(?)',
      params: ['\tA\t'],
      affectedRows: [{id: '\tA\t'}],
    };
    const cloned = cloneSplitEntry(rawEntry);
    await replaySplitEntry(cloned, metadata, options);

    t.same(
      routed.map((entry) => entry.partitionId),
      [LEFT_PARTITION_ID],
      'canonical affectedRows key "\\tA\\t" (< "A") routes to the left child',
    );

    await t.rejects(
      replaySplitEntry(
        {
          sql: 'DELETE FROM items WHERE id = trim(?)',
          params: ['\tA\t'],
        },
        metadata,
        options,
      ),
      {message: PARTITION_SERVICE_ERROR_MSG.SPLIT_REPLICATION_ROUTING_FAILED},
      'without canonical affectedRows, trim(?) refuses instead of misrouting via JS .trim()',
    );
  });

test('split routing settles zero-row mutations (changes: 0, affectedRows: []) as a no-op',
  async (t) => {
    const routed = [];
    const queryExecutor = {
      async executeOnPartition(partitionId, sql, params) {
        routed.push({partitionId, sql, params});
        return {success: true};
      },
    };
    const metadata = createMetadata(PENDING_VERSION);
    const options = {
      tableName: 'items',
      queryExecutor,
      descriptorEpochEvidence: createDescriptorEvidence(
        {
          active_partition_version: ACTIVE_VERSION,
          pending_partition_version: PENDING_VERSION,
        },
        PENDING_VERSION,
      ),
    };

    await replaySplitEntry(
      cloneSplitEntry({
        sql: 'DELETE FROM items WHERE id = trim(?)',
        params: ['\tA\t'],
        changes: 0,
        affectedRows: [],
      }),
      metadata,
      options,
    );

    await replaySplitEntry(
      cloneSplitEntry({
        sql: 'UPDATE items SET name = ? WHERE id = trim(?)',
        params: ['none', 'missing'],
        changes: 0,
      }),
      metadata,
      options,
    );

    t.same(
      routed,
      [],
      'zero-row mutations require no child writes and must not fall back to SQL expression parsing',
    );
  });

test('split routing projects multi-child INSERT, UPDATE, and DELETE mutations to both children with partial-retry idempotency',
  async (t) => {
    const leftDb = new Database(':memory:');
    const rightDb = new Database(':memory:');
    const createTableSql =
      'CREATE TABLE items (id TEXT PRIMARY KEY, name TEXT, score INTEGER)';
    leftDb.exec(createTableSql);
    rightDb.exec(createTableSql);

    const routed = [];
    let failRightOnce = false;
    const queryExecutor = {
      async executeOnPartition(
        partitionId,
        sql,
        params,
        _isRead,
        _waitForCommit,
        _isTransaction,
        deliveryOptions,
      ) {
        if (partitionId === RIGHT_PARTITION_ID && failRightOnce) {
          failRightOnce = false;
          return {success: false, error: 'transient right child failure'};
        }
        routed.push({partitionId, sql, params, deliveryOptions});
        const targetDb =
          partitionId === LEFT_PARTITION_ID ? leftDb : rightDb;
        targetDb.prepare(sql).run(...params);
        return {success: true};
      },
    };
    const metadata = createMetadata(PENDING_VERSION);
    const options = {
      tableName: 'items',
      queryExecutor,
      descriptorEpochEvidence: createDescriptorEvidence(
        {
          active_partition_version: ACTIVE_VERSION,
          pending_partition_version: PENDING_VERSION,
        },
        PENDING_VERSION,
      ),
    };

    try {
      // 1. Multi-child INSERT ... SELECT affecting 2 rows on left and 1 on right
      const insertEntry = cloneSplitEntry({
        type: 'WRITE',
        sql: 'INSERT INTO items (id, name, score) SELECT id, name, score FROM staging',
        params: [],
        entryId: 'multi-insert-1',
        changes: 3,
        affectedRows: [
          {id: 'a', name: 'Ada', score: 10},
          {id: 'b', name: 'Bob', score: 20},
          {id: 'z', name: 'Zoe', score: 30},
        ],
      });
      failRightOnce = true;
      await t.rejects(
        replaySplitEntry(insertEntry, metadata, options),
        {message: 'transient right child failure'},
      );
      t.equal(
        routed.length,
        1,
        'left child succeeded before right child failed',
      );
      // Retry with cloned entry preserves settledTargetPartitionIds so left child is not re-sent
      const retriedInsertEntry = cloneSplitEntry(insertEntry);
      await replaySplitEntry(retriedInsertEntry, metadata, options);
      t.equal(
        routed.length,
        2,
        'retry dispatches only the remaining unsettled right child',
      );

      // 2. Multi-child UPDATE affecting rows in both children
      await replaySplitEntry(
        cloneSplitEntry({
          type: 'UPDATE',
          sql: 'UPDATE items SET score = score + 5 WHERE score >= ?',
          params: [10],
          entryId: 'multi-update-1',
          changes: 3,
          affectedRows: [
            {id: 'a', name: 'Ada', score: 15},
            {id: 'b', name: 'Bob', score: 25},
            {id: 'z', name: 'Zoe', score: 35},
          ],
        }),
        metadata,
        options,
      );

      t.same(
        leftDb.prepare('SELECT id, name, score FROM items ORDER BY id').all(),
        [
          {id: 'a', name: 'Ada', score: 15},
          {id: 'b', name: 'Bob', score: 25},
        ],
      );
      t.same(
        rightDb.prepare('SELECT id, name, score FROM items ORDER BY id').all(),
        [
          {id: 'z', name: 'Zoe', score: 35},
        ],
      );

      // 3. Multi-child DELETE affecting rows in both children
      await replaySplitEntry(
        cloneSplitEntry({
          type: 'DELETE',
          sql: 'DELETE FROM items WHERE id = trim(?) OR id = trim(?)',
          params: [' a ', ' z '],
          entryId: 'multi-delete-1',
          changes: 2,
          affectedRows: [
            {id: 'a', name: 'Ada', score: 15},
            {id: 'z', name: 'Zoe', score: 35},
          ],
        }),
        metadata,
        options,
      );

      t.same(
        leftDb.prepare('SELECT id, name, score FROM items ORDER BY id').all(),
        [{id: 'b', name: 'Bob', score: 25}],
      );
      t.same(
        rightDb.prepare('SELECT id, name, score FROM items ORDER BY id').all(),
        [],
      );
    } finally {
      leftDb.close();
      rightDb.close();
    }
  });
