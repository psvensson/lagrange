import {test} from '../../src/test-helpers/tap.js';
import Database from 'better-sqlite3';
import {
  PARTITION_DESCRIPTOR_EPOCH_ERROR_MSG,
  PARTITION_TRANSITION_METADATA_FIELD,
} from '../../src/partition/partition-constants.js';
import {
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
