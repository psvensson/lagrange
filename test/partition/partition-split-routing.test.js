import {test} from '../../src/test-helpers/tap.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  PARTITION_DESCRIPTOR_EPOCH_ERROR_MSG,
  PARTITION_TRANSITION_METADATA_FIELD,
  PARTITION_TRANSITION_STATE,
} from '../../src/partition/partition-constants.js';
import {
  loadDurableDeltasBehindWatermark,
} from '../../src/partition/partition-mirror-replay-cursor.js';
import {
  createDefaultPartitionRequestBuilder,
} from '../../src/query/query-executor-partition-request-builders.js';
import {
  decodeRemoteCdcEventsFromWire,
  handleRemoteLiveQueryCdcSubscribe,
} from '../../src/partition/partition-live-query-cdc-remote.js';
import {
  acquireDbForUpdateReservation,
  releaseDbPartitionTransactionReservations,
} from '../../src/partition/partition-locking-read-store.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {
  PARTITION_SERVICE_ERROR_MSG,
} from '../../src/partition/partition-service-constants.js';
import {
  cloneSplitEntry,
  replaySplitEntry,
  routeSplitSnapshotBatch,
} from '../../src/partition/partition-split-routing.js';
import {withFoundingStamp} from './partition-founding-stamp.js';
import {
  resumeFixtureParticipantAdmission,
} from '../test-helpers/participant-transaction-fixture.js';

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

const EXACT_ITEMS_TABLE = 'exact_items';
const EXACT_ITEMS_SCHEMA = Object.freeze({
  tableName: EXACT_ITEMS_TABLE,
  columns: [
    {name: 'id', type: 'TEXT', primaryKey: true},
    {name: 'big_int', type: 'INTEGER'},
    {name: 'raw_blob', type: 'BLOB'},
    {name: 'ratio', type: 'REAL'},
    {name: 'untyped_val', type: 'ANY'},
  ],
});

async function openUserPartition(partitionId, dbPath) {
  const service = new PartitionService(withFoundingStamp({
    partitionId,
    tableId: EXACT_ITEMS_TABLE,
    tableName: EXACT_ITEMS_TABLE,
    replicaId: `${partitionId}-r1`,
    replicaIds: [`${partitionId}-r1`],
    nodeId: 'split-routing-test-node',
    systemTableCache: new SystemTableCache(),
    dbPath,
    schema: EXACT_ITEMS_SCHEMA,
  }));
  await service.initialize();
  await resumeFixtureParticipantAdmission(service);
  return service;
}

test('split routing end-to-end across source executeQuery, durable restart, and child PartitionService execution preserves exact 64-bit BigInt, BLOB, storage classes, and comment/CTE DELETEs',
  async (t) => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
    ConfigurationManager.getInstance().initialize({
      node: {id: 'split-routing-test-node'},
    });
    LoggingService.getInstance().initialize({level: 'error'});

    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'split-routing-exact-e2e-'),
    );
    const sourceDbPath = path.join(tempDir, 'source.sqlite');
    const leftDbPath = path.join(tempDir, 'left.sqlite');
    const rightDbPath = path.join(tempDir, 'right.sqlite');

    let sourcePartition = null;
    let recoveredSource = null;
    let leftChild = null;
    let rightChild = null;

    const exactPos = 9007199254740993n;
    const exactNeg = -9007199254740993n;
    const updatedPos = 9007199254740995n;
    const updatedNeg = -9007199254740995n;
    const blobA = Buffer.from([0xde, 0xad, 0xbe, 0xef]);
    const blobB = Buffer.from([0x01, 0x02, 0x03, 0x04]);
    const blobC = Buffer.from([0x10, 0x20, 0x30]);
    const blobY = Buffer.from([0xfe, 0xed, 0xfa, 0xce]);
    const blobZ = Buffer.from([0xca, 0xfe, 0xba, 0xbe]);
    const updatedBlobC = Buffer.from([0xaa, 0xbb, 0xcc]);
    const updatedBlobW = Buffer.from([0xdd, 0xee, 0xff]);

    try {
      sourcePartition = await openUserPartition('exact-items-source', sourceDbPath);
      leftChild = await openUserPartition(LEFT_PARTITION_ID, leftDbPath);
      rightChild = await openUserPartition(RIGHT_PARTITION_ID, rightDbPath);

      const barrierInsert = await sourcePartition.executeQuery(
        `INSERT INTO ${EXACT_ITEMS_TABLE} (id, big_int, raw_blob, ratio, untyped_val) ` +
        'VALUES (?, ?, ?, ?, ?)',
        ['0-barrier', 1n, Buffer.from([0x00]), 1.0, 1n],
        {entryId: 'entry-barrier'},
      );
      t.equal(barrierInsert.success, true);
      const watermarkIndex = barrierInsert.logIndex;

      // 1. Multi-row INSERT via executeQuery (type: 'QUERY') spanning both children
      const multiInsert = await sourcePartition.executeQuery(
        `INSERT INTO ${EXACT_ITEMS_TABLE} (id, big_int, raw_blob, ratio, untyped_val) ` +
        'VALUES (?, ?, ?, ?, ?), (?, ?, ?, ?, ?), (?, ?, ?, ?, ?), ' +
        '(?, ?, ?, ?, ?), (?, ?, ?, ?, ?), (?, ?, ?, ?, ?)',
        [
          'a', exactPos, blobA, 1.25, 42n,
          'b', exactPos, blobB, 2.5, 43n,
          'c', exactPos, blobC, 3.75, 44n,
          'w', exactNeg, blobY, -3.75, -44n,
          'y', exactNeg, blobY, -2.5, -43n,
          'z', exactNeg, blobZ, -1.25, -42n,
        ],
        {entryId: 'entry-multi-insert'},
      );
      t.equal(multiInsert.success, true);
      t.equal(multiInsert.changes, 6);

      // 2. Multi-row UPDATE via executeQuery updating 64-bit integer and BLOB across both children
      const multiUpdate = await sourcePartition.executeQuery(
        `UPDATE ${EXACT_ITEMS_TABLE} ` +
        'SET big_int = CASE id WHEN ? THEN ? ELSE ? END, ' +
        'raw_blob = CASE id WHEN ? THEN ? ELSE ? END, ' +
        'untyped_val = CASE id WHEN ? THEN ? ELSE ? END ' +
        'WHERE id IN (?, ?)',
        [
          'c', updatedPos, updatedNeg,
          'c', updatedBlobC, updatedBlobW,
          'c', updatedPos, updatedNeg,
          'c', 'w',
        ],
        {entryId: 'entry-multi-update'},
      );
      t.equal(multiUpdate.success, true);
      t.equal(multiUpdate.changes, 2);

      // 3. Comment-prefixed DELETE via executeQuery spanning both children
      const commentDelete = await sourcePartition.executeQuery(
        `/* cleanup */ DELETE FROM ${EXACT_ITEMS_TABLE} WHERE id IN (?, ?)`,
        ['a', 'z'],
        {entryId: 'entry-comment-delete'},
      );
      t.equal(commentDelete.success, true);
      t.equal(commentDelete.changes, 2);

      // 4. CTE-prefixed WITH ... DELETE via executeQuery spanning both children
      const cteDelete = await sourcePartition.executeQuery(
        '-- remove doomed keys\nWITH doomed(id) AS (VALUES (?), (?)) ' +
        `DELETE FROM ${EXACT_ITEMS_TABLE} WHERE id IN (SELECT id FROM doomed)`,
        ['b', 'y'],
        {entryId: 'entry-cte-delete'},
      );
      t.equal(cteDelete.success, true);
      t.equal(cteDelete.changes, 2);

      // Shut down and restart source partition to test durable recovery
      await sourcePartition.shutdown();
      sourcePartition = null;
      recoveredSource = await openUserPartition('exact-items-source', sourceDbPath);

      const deltas = loadDurableDeltasBehindWatermark(
        recoveredSource,
        watermarkIndex,
      );
      t.equal(deltas.length, 4);
      t.same(
        deltas.map((d) => d.mutationKind),
        ['INSERT', 'UPDATE', 'DELETE', 'DELETE'],
        'durable deltas preserve canonical mutationKind across restart',
      );

      const metadata = createMetadata(PENDING_VERSION);
      const queryExecutor = {
        async executeOnPartition(
          partitionId,
          sql,
          params,
          isRead,
          _waitForCommit,
          _isTransaction,
          deliveryOptions,
        ) {
          const target =
            partitionId === LEFT_PARTITION_ID ? leftChild : rightChild;
          const buildRequest = createDefaultPartitionRequestBuilder({
            executionOptions: deliveryOptions || {},
            forRead: Boolean(isRead),
            params,
            partitionId,
            sql,
          });
          const serializedRequest = JSON.parse(JSON.stringify(buildRequest()));
          return target.handleRemoteQuery(serializedRequest);
        },
      };

      for (const delta of deltas) {
        await replaySplitEntry(delta, metadata, {
          queryExecutor,
          descriptorEpochEvidence: createDescriptorEvidence(
            {
              active_partition_version: ACTIVE_VERSION,
              pending_partition_version: PENDING_VERSION,
            },
            PENDING_VERSION,
          ),
        });
      }

      // 5. Also verify a small INTEGER (43n) in BLOB-affinity untyped_val across the
      // real request builder + JSON wire + handleRemoteQuery child delivery path:
      const smallIntInsert = await recoveredSource.executeQuery(
        `INSERT INTO ${EXACT_ITEMS_TABLE} (id, big_int, raw_blob, ratio, untyped_val) ` +
        'VALUES (?, ?, ?, ?, ?)',
        ['d', 7n, blobA, 0.5, 43n],
        {entryId: 'entry-small-int-blob-affinity'},
      );
      t.equal(smallIntInsert.success, true);
      const postUpdateDeltas = loadDurableDeltasBehindWatermark(
        recoveredSource,
        cteDelete.logIndex,
      );
      t.equal(postUpdateDeltas.length, 1);
      await replaySplitEntry(postUpdateDeltas[0], metadata, {
        queryExecutor,
        descriptorEpochEvidence: createDescriptorEvidence(
          {
            active_partition_version: ACTIVE_VERSION,
            pending_partition_version: PENDING_VERSION,
          },
          PENDING_VERSION,
        ),
      });

      const inspectChildRows = (db) =>
        db
          .prepare(
            'SELECT id, big_int, raw_blob, ratio, untyped_val, ' +
            'typeof(big_int) AS big_int_type, ' +
            'typeof(raw_blob) AS raw_blob_type, ' +
            'typeof(ratio) AS ratio_type, ' +
            'typeof(untyped_val) AS untyped_val_type ' +
            `FROM ${EXACT_ITEMS_TABLE} ORDER BY id`,
          )
          .safeIntegers(true)
          .all();

      const leftRows = inspectChildRows(leftChild.db);
      const rightRows = inspectChildRows(rightChild.db);

      t.equal(
        leftRows.length,
        2,
        'comment and CTE DELETEs removed a and b from left child while c and d remain',
      );
      t.equal(leftRows[0].id, 'c');
      t.equal(leftRows[0].big_int, updatedPos);
      t.ok(Buffer.isBuffer(leftRows[0].raw_blob));
      t.equal(Buffer.compare(leftRows[0].raw_blob, updatedBlobC), 0);
      t.equal(leftRows[0].ratio, 3.75);
      t.equal(leftRows[0].untyped_val, updatedPos);
      t.equal(leftRows[0].big_int_type, 'integer');
      t.equal(leftRows[0].raw_blob_type, 'blob');
      t.equal(leftRows[0].ratio_type, 'real');
      t.equal(leftRows[0].untyped_val_type, 'integer');

      t.equal(leftRows[1].id, 'd');
      t.equal(leftRows[1].big_int, 7n);
      t.equal(leftRows[1].untyped_val, 43n);
      t.equal(
        leftRows[1].untyped_val_type,
        'integer',
        'small INTEGER in BLOB-affinity column stays integer across JSON wire child delivery',
      );

      t.equal(
        rightRows.length,
        1,
        'comment and CTE DELETEs removed y and z from right child (never upserted)',
      );
      t.equal(rightRows[0].id, 'w');
      t.equal(rightRows[0].big_int, updatedNeg);
      t.ok(Buffer.isBuffer(rightRows[0].raw_blob));
      t.equal(Buffer.compare(rightRows[0].raw_blob, updatedBlobW), 0);
      t.equal(rightRows[0].ratio, -3.75);
      t.equal(rightRows[0].untyped_val, updatedNeg);
      t.equal(rightRows[0].big_int_type, 'integer');
      t.equal(rightRows[0].raw_blob_type, 'blob');
      t.equal(rightRows[0].ratio_type, 'real');
      t.equal(rightRows[0].untyped_val_type, 'integer');
    } finally {
      if (sourcePartition) await sourcePartition.shutdown();
      if (recoveredSource) await recoveredSource.shutdown();
      if (leftChild) await leftChild.shutdown();
      if (rightChild) await rightChild.shutdown();
      fs.rmSync(tempDir, {recursive: true, force: true});
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
    }
  });

test('committed row-lock check with BLOB/BigInt typedParams, remote live-query CDC JSON serialization, __proto__ row materialization, and checkpoint-gated split effect pruning',
  async (t) => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
    ConfigurationManager.getInstance().initialize({
      node: {id: 'split-routing-review-node'},
    });
    LoggingService.getInstance().initialize({level: 'error'});

    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'split-routing-review-'),
    );
    const dbPath = path.join(tempDir, 'review.sqlite');
    let partition = null;

    try {
      partition = await openUserPartition('review-items-p1', dbPath);
      const deadBlob = Buffer.from([0xde, 0xad]);
      const cafeBlob = Buffer.from([0xca, 0xfe]);
      const exactBig = 9007199254740993n;

      // 1. Subscribe remote live-query CDC with a real JSON.stringify transport
      const deliveredWirePayloads = [];
      partition.transport = {
        async deliver(_address, payload) {
          const serialized = JSON.stringify(payload);
          deliveredWirePayloads.push(JSON.parse(serialized));
          return {acknowledged: true, success: true};
        },
      };
      const subAck = await handleRemoteLiveQueryCdcSubscribe(partition, {
        subscriberId: 'sub-json-1',
        subscriberAddress: 'node-2/service/live-query-cdc',
        queryId: 'q-1',
      });
      t.equal(subAck.success, true);

      // Insert row with ordinary INTEGER (1), large 64-bit BigInt, and BLOB:
      const ins = await partition.executeQuery(
        `INSERT INTO ${EXACT_ITEMS_TABLE} (id, big_int, raw_blob, ratio, untyped_val) ` +
        'VALUES (?, ?, ?, ?, ?)',
        ['row-1', exactBig, deadBlob, 1.5, 1n],
        {entryId: 'entry-cdc-and-lock-seed'},
      );
      t.equal(ins.success, true);
      t.equal(
        typeof ins.affectedRows?.[0]?.untyped_val,
        'number',
        'safe integers in affectedRows are canonical JS numbers on user tables',
      );
      t.equal(ins.affectedRows?.[0]?.untyped_val, 1);

      await partition.flushPendingCDCEvents?.();
      t.equal(
        deliveredWirePayloads.length,
        1,
        'remote live-query CDC event serialized through JSON.stringify without throwing on BigInt or Buffer',
      );
      const decodedEvents = decodeRemoteCdcEventsFromWire(
        deliveredWirePayloads[0].events,
      );
      t.equal(decodedEvents[0].data.id, 'row-1');
      t.equal(decodedEvents[0].data.untyped_val, 1);
      t.equal(decodedEvents[0].data.big_int, exactBig);
      t.equal(Buffer.compare(decodedEvents[0].data.raw_blob, deadBlob), 0);

      // 2. Acquire a FOR UPDATE lock on row-1 and verify a committed write using a
      // BLOB parameter (WHERE raw_blob = ?) is refused with LOCK_NOT_AVAILABLE at committed apply:
      const lockRes = acquireDbForUpdateReservation(partition.db, {
        partitionId: partition.partitionId,
        tableName: EXACT_ITEMS_TABLE,
        rowKey: `${EXACT_ITEMS_TABLE}:${partition.partitionId}:row-1`,
        transactionId: 'tx-holder-1',
        sessionId: 'sess-holder-1',
        acquiredAt: Date.now(),
        expiresAt: Date.now() + 30_000,
      });
      t.equal(lockRes.status, 'acquired');

      const conflictReq = createDefaultPartitionRequestBuilder({
        executionOptions: {entryId: 'entry-blob-lock-conflict'},
        forRead: false,
        params: [deadBlob],
        partitionId: partition.partitionId,
        sql: `UPDATE ${EXACT_ITEMS_TABLE} SET ratio = 9.5 WHERE raw_blob = ?`,
      })();
      // Verify directly through proposeWrite (committed apply checkOperationsLockingReadConflict)
      // as well as handleRemoteQuery:
      const committedConflict = await partition.proposeWrite({
        type: 'QUERY',
        sql: `UPDATE ${EXACT_ITEMS_TABLE} SET ratio = 9.5 WHERE raw_blob = ?`,
        params: [deadBlob],
        entryId: 'entry-blob-lock-conflict-committed',
      });
      t.equal(committedConflict.success, false);
      t.equal(
        committedConflict.failureCode,
        'LOCK_NOT_AVAILABLE',
        'committed apply decodes typedParams for BLOB predicate and detects FOR UPDATE lock conflict',
      );
      const remoteConflict = await partition.handleRemoteQuery(
        JSON.parse(JSON.stringify(conflictReq)),
      );
      t.equal(remoteConflict.success, false);
      t.equal(remoteConflict.errorCode, 'LOCK_NOT_AVAILABLE');

      releaseDbPartitionTransactionReservations(
        partition.db,
        partition.partitionId,
        'tx-holder-1',
      );

      // 3. Verify drainage in mirrorCutoverActiveSplitWrite / drainSplitReplicationQueue
      // does NOT prune _partition_statement_outcome_effects before the durable checkpoint is confirmed:
      const metadata = {
        ...createMetadata(PENDING_VERSION),
        sourcePartitionId: partition.partitionId,
      };
      partition.splitReplication = {
        metadata,
        phase: PARTITION_TRANSITION_STATE.SPLIT_CATCHUP,
        pendingEntries: [],
        flushPromise: null,
        startedAt: Date.now(),
        lastError: null,
        snapshotBarrierIndex: ins.logIndex,
        replayWatermarkIndex: ins.logIndex,
        authorized: true,
        quiescing: false,
        quiesced: false,
        activities: new Set(),
      };
      partition.replaySplitEntry = async () => {};

      const ins2 = await partition.executeQuery(
        `INSERT INTO ${EXACT_ITEMS_TABLE} (id, big_int, raw_blob, ratio, untyped_val) ` +
        'VALUES (?, ?, ?, ?, ?)',
        ['row-2', 20n, cafeBlob, 2.0, 2n],
        {entryId: 'entry-pre-delete-seed'},
      );
      t.equal(ins2.success, true);

      const multiDel = await partition.executeQuery(
        `DELETE FROM ${EXACT_ITEMS_TABLE} WHERE id IN (?, ?)`,
        ['row-1', 'row-2'],
        {entryId: 'entry-uncheckpointed-delete'},
      );
      t.equal(multiDel.success, true);

      // Drain the queue (advancing volatile replayWatermarkIndex to multiDel.logIndex)
      // WITHOUT confirming a durable CATCHUP_READY checkpoint:
      await partition.flushSplitReplicationQueue();
      t.equal(partition.splitReplication.replayWatermarkIndex, multiDel.logIndex);

      // Simulate a crash before CATCHUP_READY is persisted: recovery reloads from the last
      // durable checkpoint (ins.logIndex) and MUST still find multiDel's effect row!
      const recoveredDeltas = loadDurableDeltasBehindWatermark(
        partition,
        ins.logIndex,
      );
      const recoveredDelete = recoveredDeltas.find(
        (d) => d.entryId === 'entry-uncheckpointed-delete',
      );
      t.ok(
        recoveredDelete,
        'uncheckpointed DELETE delta is recovered after queue drain when crash precedes durable checkpoint',
      );
      t.equal(recoveredDelete.mutationKind, 'DELETE');
      t.equal(
        recoveredDelete.affectedRows?.length,
        2,
        'outcome effects row was preserved until durable checkpoint confirmation',
      );
    } finally {
      if (partition) await partition.shutdown();
      fs.rmSync(tempDir, {recursive: true, force: true});
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
    }
  });
