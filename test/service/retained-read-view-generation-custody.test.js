/**
 * Physical custody, storage-incarnation fencing, snapshot-local watermark
 * agreement, real WAL byte/age/count bounds, and query-vs-CDC policy
 * separation for retained shard read views (0.4.1).
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {after, before, describe, it} from 'node:test';
import Database from 'better-sqlite3';

import {
  removeReplicaStorageArtifacts,
} from '../../src/node/replica-storage-artifacts.js';
import {PartitionRaftStorage} from '../../src/partition/partition-raft-storage.js';
import {RaftRsDurableStore} from '../../src/raft/raft-rs-durable-store.js';
import {SQLiteLogAdapter} from '../../src/raft/sqlite-log-adapter.js';
import {requestSnapshotInstall} from '../../src/raft/snapshot-install.js';
import {createSqliteStateMachineCheckpoint} from
  '../../src/raft/snapshot-checkpoint-store.js';
import {
  PAGED_CONSISTENCY_SCOPE,
  PAGED_EXECUTION_ERROR_CODE,
  createPagedShardProgressTracker,
  createShardReadViewManager,
  executeLocalShardPageRead,
  executePagedShardSlot,
} from '../../src/service/call-shard-paged-execution.js';
import {
  CUSTODY_ERROR_CODE,
  assertStorageArtifactsUnlinkSafe,
  endStorageIncarnationCustody,
  inspectDbPathCustody,
} from '../../src/storage/retained-read-view-custody.js';
import {
  createControllablePartitionService,
  createLoopbackTransport,
} from '../partition/partition-service-test-support.js';

const QUEST_ID = 'retained-read-view-generation-custody';
const NODE_ID = 'node-custody-1';
const PARTITION_ID = 'custody_p0';
const TABLE_NAME = 'custody_events';
const REPLICA_ID = 'custody_p0_r1';
const BINDING_NAME = 'custody-test--call--scan';
const SELECTOR_SQL = 'SELECT id, payload FROM custody_events ORDER BY id ASC';
const KEY_COLUMNS = Object.freeze(['id']);
const CREATE_TABLE_SQL =
  'CREATE TABLE IF NOT EXISTS custody_events (' +
  'id INTEGER PRIMARY KEY, ' +
  'payload TEXT NOT NULL)';
const INSERT_EVENT_SQL =
  'INSERT INTO custody_events (id, payload) VALUES (?, ?)';
const WAL_PRAGMA = 'journal_mode = WAL';
const WAL_TRUNCATE_PRAGMA = 'wal_checkpoint(TRUNCATE)';
const WAL_SUFFIX = '-wal';

const NATIVE_HANDLE_OVERHEAD_BYTES = 4096;
const SMALL_WAL_LIMIT_BYTES = 32768;
const SHARED_WAL_LIMIT_BYTES = 1048576;
const REAP_AGE_MS = 180;
const REAP_INTERVAL_MS = 30;
const REAP_WAIT_MS = 380;
const VIRTUAL_NOW_START_MS = 1000000;
const VIRTUAL_DEADLINE_OFFSET_MS = 500;
const VIRTUAL_AGE_LIMIT_MS = 400;
const VIRTUAL_IDLE_LIMIT_MS = 200;
const VIRTUAL_STEP_REFRESH_MS = 150;
const VIRTUAL_STEP_EXPIRE_IDLE_MS = 100;
const VIRTUAL_STEP_RE_REFRESH_MS = 50;
const VIRTUAL_STEP_EXPIRE_AGE_MS = 150;
const VIRTUAL_STEP_EXPIRE_DEADLINE_MS = 100;
const VIRTUAL_LARGE_BOUND_MS = 5000;
const DEADLINE_WINDOW_MS = 30000;
const PAGE_ROW_BOUND_SMALL = 2;
const PAGE_ROW_BOUND_MED = 10;
const PAGE_BYTE_BOUND = 4194304;
const BULK_PAYLOAD_BYTES = 2048;
const BULK_WRITE_COUNT = 64;
const PLATEAU_CYCLES = 5;
const INITIAL_ROW_COUNT = 6;
const STALE_APPLIED_INDEX = '999';
const EXPECTED_AFTER_OPEN_INDEX = '3';
const EXPECTED_AFTER_OPEN_TERM = '5';
const COMMIT_INDEX_FOUR = 4;
const COMMIT_TERM_SIX = 6;
const TEST_CONF_STATE = Object.freeze({
  autoLeave: false,
  learners: Object.freeze([]),
  learnersNext: Object.freeze([]),
  voters: Object.freeze([REPLICA_ID]),
  votersOutgoing: Object.freeze([]),
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readActualWalBytes(dbPath) {
  const walPath = `${dbPath}${WAL_SUFFIX}`;
  if (!fs.existsSync(walPath)) return 0;
  return fs.statSync(walPath).size;
}

function seedWalPartitionDb(dbPath, rowCount = INITIAL_ROW_COUNT) {
  const db = new Database(dbPath);
  db.pragma(WAL_PRAGMA);
  db.exec(CREATE_TABLE_SQL);
  const insertStmt = db.prepare(INSERT_EVENT_SQL);
  const insertBatch = db.transaction((count) => {
    for (let idx = 1; idx <= count; idx += 1) {
      insertStmt.run(idx, `row-${idx}`);
    }
  });
  insertBatch(rowCount);
  return db;
}

function writeAppliedEntry(db, partitionId, index, term, payload) {
  const store = new RaftRsDurableStore(db);
  store.transaction(() => {
    db.prepare(INSERT_EVENT_SQL).run(index, payload);
    db.prepare(
      'INSERT OR REPLACE INTO _raft_rs_log ' +
      '(group_id, log_index, term, entry_type, data) VALUES (?, ?, ?, 0, NULL)',
    ).run(partitionId, BigInt(index), BigInt(term));
    store.putAppliedState(partitionId, String(index), TEST_CONF_STATE);
    store.putHardState(partitionId, {
      commit: String(index),
      term: String(term),
      vote: '1',
    });
  });
}

function createTestPartitionService(dbPath) {
  return createControllablePartitionService({
    dbPath,
    nodeId: NODE_ID,
    partitionId: PARTITION_ID,
    replicaId: REPLICA_ID,
    replicaIds: [REPLICA_ID],
    schema: {
      columns: [
        {name: 'id', primaryKey: true, type: 'INTEGER'},
        {name: 'payload', type: 'TEXT'},
      ],
    },
    systemTableCache: {
      filter: () => [],
      get: () => null,
      getAll: () => [],
    },
    tableId: TABLE_NAME,
    tableName: TABLE_NAME,
    transport: createLoopbackTransport(),
  });
}

function makeInvocation(id, deadlineMs = Date.now() + DEADLINE_WINDOW_MS) {
  return {
    callCell: {batchByteBound: PAGE_BYTE_BOUND, batchRowBound: PAGE_ROW_BOUND_SMALL},
    deadlineMs,
    id,
  };
}

function makeRoute(bindingVersionId = 'bv-custody') {
  return {
    bindingVersionId,
    pageKey: KEY_COLUMNS,
    statement: SELECTOR_SQL,
  };
}

function makePagePayload(pageIndex, pageRowBound, pageCursor, readViewId) {
  return {
    pageRequest: {
      attemptId: 'attempt-1',
      ...(pageCursor ? {pageCursor} : {}),
      pageIndex,
      pageKey: KEY_COLUMNS,
      pageRowBound,
      ...(readViewId ? {readViewId} : {}),
    },
    partitionFence: {partitionVersion: 1},
    partitionId: PARTITION_ID,
  };
}

describe(`Retained read-view generation custody (${QUEST_ID})`, () => {
  let tempDir;

  before(async () => {
    tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'lagrange-rv-custody-'));
  });

  after(async () => {
    if (tempDir) {
      await fsp.rm(tempDir, {force: true, recursive: true});
    }
  });

  it('close-failure-and-same-path-incarnation: injected close failure retains custody and accounting until actual closure', async () => {
    const dbPath = path.join(tempDir, 'close-failure.sqlite');
    const mainDb = seedWalPartitionDb(dbPath, INITIAL_ROW_COUNT);
    let allowClose = false;
    const manager = createShardReadViewManager({
      closeReader: (readerDb) => {
        if (!allowClose) {
          return false;
        }
        if (readerDb.open) {
          if (readerDb.inTransaction) readerDb.exec('ROLLBACK');
          readerDb.close();
        }
        return !readerDb.open;
      },
      maxRetainedViews: 1,
      nativeHandleOverheadBytes: NATIVE_HANDLE_OVERHEAD_BYTES,
    });
    const partitionService = {
      dbPath,
      partitionId: PARTITION_ID,
      store: {dbPath, storageIncarnationId: 'inc-close-1'},
    };

    try {
      const view = await manager.acquireReadView({
        attemptId: 'attempt-1',
        boundParameters: [],
        deadlineMs: Date.now() + DEADLINE_WINDOW_MS,
        invocationId: 'inv-close-fail',
        keyColumns: KEY_COLUMNS,
        partitionId: PARTITION_ID,
        partitionService,
        partitionVersion: 1,
        statement: SELECTOR_SQL,
      });

      const page0 = manager.readPage({
        boundParameters: [],
        deadlineMs: Date.now() + DEADLINE_WINDOW_MS,
        keyColumns: KEY_COLUMNS,
        pageByteBound: PAGE_BYTE_BOUND,
        pageIndex: 0,
        pageRowBound: PAGE_ROW_BOUND_SMALL,
        partitionService,
        partitionVersion: 1,
        readViewId: view.readViewId,
        statement: SELECTOR_SQL,
      });
      assert.equal(page0.rows.length, PAGE_ROW_BOUND_SMALL);
      assert.equal(page0.pageMeta.hasMore, true);

      const firstCloseResult = manager.releaseReadView(view.readViewId);
      assert.equal(
        firstCloseResult,
        false,
        'failed close must not report released=true',
      );
      assert.equal(
        view.readerDb.open,
        true,
        'native handle must still be open on close failure',
      );

      const statsWhileUnclosed = manager.stats();
      assert.equal(statsWhileUnclosed.unclosedViewCount, 1);
      assert.equal(statsWhileUnclosed.retainedViewCount, 1);
      assert.ok(
        statsWhileUnclosed.totalPinnedBytes >= NATIVE_HANDLE_OVERHEAD_BYTES,
        'failed close must retain pinned byte accounting',
      );

      assert.throws(
        () =>
          manager.readPage({
            boundParameters: [],
            deadlineMs: Date.now() + DEADLINE_WINDOW_MS,
            keyColumns: KEY_COLUMNS,
            pageByteBound: PAGE_BYTE_BOUND,
            pageCursor: page0.pageMeta.nextCursor,
            pageIndex: 1,
            pageRowBound: PAGE_ROW_BOUND_SMALL,
            partitionService,
            partitionVersion: 1,
            readViewId: view.readViewId,
            statement: SELECTOR_SQL,
          }),
        (err) => err.pagedCode === PAGED_EXECUTION_ERROR_CODE.READ_VIEW_LOST,
        'closing-failed view must be fenced against further reads',
      );

      await assert.rejects(
        () =>
          manager.acquireReadView({
            attemptId: 'attempt-2',
            boundParameters: [],
            deadlineMs: Date.now() + DEADLINE_WINDOW_MS,
            invocationId: 'inv-slot-reuse-blocked',
            keyColumns: KEY_COLUMNS,
            partitionId: PARTITION_ID,
            partitionService: {
              dbPath,
              partitionId: PARTITION_ID,
              store: {dbPath, storageIncarnationId: 'inc-close-2'},
            },
            partitionVersion: 1,
            statement: SELECTOR_SQL,
          }),
        (err) => err.pagedCode === PAGED_EXECUTION_ERROR_CODE.READ_VIEW_UNAVAILABLE,
        'unclosed slot must not be reusable before closure succeeds',
      );

      const blockedRemoval = await removeReplicaStorageArtifacts(fs, dbPath);
      assert.equal(blockedRemoval.allAbsent, false);
      assert.equal(blockedRemoval.blockedByRetainedReader, true);
      assert.equal(fs.existsSync(dbPath), true);

      allowClose = true;
      const retryCloseResult = manager.releaseReadView(view.readViewId);
      assert.equal(retryCloseResult, true);

      const statsAfterRetry = manager.stats();
      assert.equal(statsAfterRetry.unclosedViewCount, 0);
      assert.equal(statsAfterRetry.retainedViewCount, 0);
      assert.equal(statsAfterRetry.totalPinnedBytes, 0);

      const viewReopened = await manager.acquireReadView({
        attemptId: 'attempt-3',
        boundParameters: [],
        deadlineMs: Date.now() + DEADLINE_WINDOW_MS,
        invocationId: 'inv-after-close',
        keyColumns: KEY_COLUMNS,
        partitionId: PARTITION_ID,
        partitionService: {
          dbPath,
          partitionId: PARTITION_ID,
          store: {dbPath, storageIncarnationId: 'inc-close-2'},
        },
        partitionVersion: 1,
        statement: SELECTOR_SQL,
      });
      assert.equal(manager.releaseReadView(viewReopened.readViewId), true);
      mainDb.close();

      const cleanRemoval = await removeReplicaStorageArtifacts(fs, dbPath);
      assert.equal(cleanRemoval.allAbsent, true);
    } finally {
      allowClose = true;
      manager.shutdown?.();
      if (mainDb.open) mainDb.close();
    }
  });

  it('snapshot-replacement-reader-closure: pauses reader across shutdown, same-path reopen, and blocks sidecar/snapshot replacement while live', async () => {
    const dbPath = path.join(tempDir, 'replacement-incarnation.sqlite');
    const mainDb = seedWalPartitionDb(dbPath, INITIAL_ROW_COUNT);
    const manager = createShardReadViewManager();
    const storeV1 = {
      checkpointGeneration: 1,
      db: mainDb,
      dbPath,
      storageIncarnationId: 'inc-v1',
    };
    const serviceV1 = {
      checkpointGeneration: 1,
      db: mainDb,
      dbPath,
      initialized: true,
      partitionId: PARTITION_ID,
      storageIncarnationId: 'inc-v1',
      store: storeV1,
    };
    const handler = {nodeId: NODE_ID, readViewManager: manager};
    const route = makeRoute('bv-replace');
    const invocation = makeInvocation('inv-replace');

    try {
      const page0 = await executeLocalShardPageRead({
        boundParameters: [],
        handler,
        invocation,
        partitionService: serviceV1,
        payload: makePagePayload(0, PAGE_ROW_BOUND_SMALL),
        route,
      });
      assert.equal(page0.rows.length, PAGE_ROW_BOUND_SMALL);
      assert.equal(page0.pageMeta.hasMore, true);
      assert.equal(page0.pageMeta.storageIncarnationId, 'inc-v1');
      assert.equal(page0.pageMeta.checkpointGeneration, 1);

      const blockedSidecarRemoval = await removeReplicaStorageArtifacts(fs, dbPath);
      assert.equal(blockedSidecarRemoval.allAbsent, false);
      assert.equal(blockedSidecarRemoval.blockedByRetainedReader, true);
      assert.equal(fs.existsSync(dbPath), true);
      assert.equal(fs.existsSync(`${dbPath}${WAL_SUFFIX}`), true);

      const checkpointsRoot = path.join(tempDir, 'checkpoints-replace');
      const cpDb = seedWalPartitionDb(path.join(tempDir, 'cp-seed.sqlite'), INITIAL_ROW_COUNT);
      const adapter = new SQLiteLogAdapter(cpDb, {address: PARTITION_ID, term: 1});
      const raftStorage = new PartitionRaftStorage(cpDb, PARTITION_ID, adapter);
      const cpEntry = adapter.saveCommand({sql: 'seed'}, 1);
      adapter.commit(cpEntry.index);
      raftStorage.recordAppliedAdvance();
      const cp = await createSqliteStateMachineCheckpoint({
        checkpointsRoot,
        db: cpDb,
        identity: {
          clusterId: 'cluster-test',
          entity: {id: TABLE_NAME, kind: 'partition'},
          membershipEpoch: 1,
          raftGroupId: PARTITION_ID,
        },
      });
      cpDb.close();
      assert.equal(cp.outcome, 'created');

      await assert.rejects(
        () =>
          requestSnapshotInstall({
            checkpointsRoot,
            generationIndex: cp.descriptor.lastIncludedIndex,
            replicaDbPath: dbPath,
          }),
        (err) => err.code === 'RETAINED_READ_VIEW_CUSTODY_BLOCKED',
        'snapshot replacement must refuse while an active reader pins the dbPath',
      );

      const storeV2 = {
        checkpointGeneration: 2,
        db: mainDb,
        dbPath,
        storageIncarnationId: 'inc-v2',
      };
      const serviceV2 = {
        checkpointGeneration: 2,
        db: mainDb,
        dbPath,
        initialized: true,
        partitionId: PARTITION_ID,
        storageIncarnationId: 'inc-v2',
        store: storeV2,
      };

      await assert.rejects(
        () =>
          executeLocalShardPageRead({
            boundParameters: [],
            handler,
            invocation,
            partitionService: serviceV2,
            payload: makePagePayload(
              1,
              PAGE_ROW_BOUND_SMALL,
              page0.pageMeta.nextCursor,
              page0.pageMeta.readViewId,
            ),
            route,
          }),
        (err) => err.pagedCode === PAGED_EXECUTION_ERROR_CODE.READ_VIEW_LOST,
        'old readViewId cannot attach to reopened/bumped incarnation at same dbPath',
      );

      // Real PartitionService shutdown + same-path reopen must drain/fence old readers.
      const svcDbPath = path.join(tempDir, 'svc-reopen.sqlite');
      const svc1 = createTestPartitionService(svcDbPath);
      const svc2 = createTestPartitionService(svcDbPath);
      try {
        await svc1.initialize();
        for (let idx = 1; idx <= INITIAL_ROW_COUNT; idx += 1) {
          svc1.db.prepare(INSERT_EVENT_SQL).run(idx, `svc-row-${idx}`);
        }
        const svcPage0 = await executeLocalShardPageRead({
          boundParameters: [],
          handler,
          invocation: makeInvocation('inv-svc-reopen'),
          partitionService: svc1,
          payload: makePagePayload(0, PAGE_ROW_BOUND_SMALL),
          route,
        });
        assert.equal(svcPage0.pageMeta.hasMore, true);
        assert.equal(
          svcPage0.pageMeta.storageIncarnationId,
          svc1.storageIncarnationId,
        );
        await svc1.shutdown();
        await svc2.initialize();
        assert.notEqual(svc2.storageIncarnationId, svc1.storageIncarnationId);
        await assert.rejects(
          () =>
            executeLocalShardPageRead({
              boundParameters: [],
              handler,
              invocation: makeInvocation('inv-svc-reopen'),
              partitionService: svc2,
              payload: makePagePayload(
                1,
                PAGE_ROW_BOUND_SMALL,
                svcPage0.pageMeta.nextCursor,
                svcPage0.pageMeta.readViewId,
              ),
              route,
            }),
          (err) => err.pagedCode === PAGED_EXECUTION_ERROR_CODE.READ_VIEW_LOST,
          'paused reader from shut-down PartitionService cannot attach after same-path reopen',
        );
      } finally {
        await svc1.shutdown();
        await svc2.shutdown();
      }
    } finally {
      manager.shutdown?.();
      if (mainDb.open) mainDb.close();
    }
  });

  it('snapshot-local-position-and-row-agreement: reads appliedIndex/term/schemaVersion from pinned readerDb across concurrent commits', async () => {
    const dbPath = path.join(tempDir, 'snapshot-watermark.sqlite');
    const mainDb = seedWalPartitionDb(dbPath, 0);
    writeAppliedEntry(mainDb, PARTITION_ID, 1, 4, 'entry-1');
    writeAppliedEntry(mainDb, PARTITION_ID, 2, 4, 'entry-2');

    let committedAfterOpen = false;
    let committedAfterPin = false;
    const manager = createShardReadViewManager({
      onSnapshotStage: (stage) => {
        if (stage === 'after_open' && !committedAfterOpen) {
          committedAfterOpen = true;
          writeAppliedEntry(
            mainDb,
            PARTITION_ID,
            Number(EXPECTED_AFTER_OPEN_INDEX),
            Number(EXPECTED_AFTER_OPEN_TERM),
            'entry-3',
          );
        }
        if (stage === 'after_pin' && !committedAfterPin) {
          committedAfterPin = true;
          writeAppliedEntry(
            mainDb,
            PARTITION_ID,
            COMMIT_INDEX_FOUR,
            COMMIT_TERM_SIX,
            'entry-4',
          );
        }
      },
    });
    const partitionService = {
      appliedIndex: STALE_APPLIED_INDEX,
      dbPath,
      lastApplied: Number(STALE_APPLIED_INDEX),
      partitionId: PARTITION_ID,
      store: {dbPath, storageIncarnationId: 'inc-wm-1'},
    };

    try {
      const view = await manager.acquireReadView({
        attemptId: 'attempt-wm',
        boundParameters: [],
        deadlineMs: Date.now() + DEADLINE_WINDOW_MS,
        invocationId: 'inv-wm',
        keyColumns: KEY_COLUMNS,
        partitionId: PARTITION_ID,
        partitionService,
        partitionVersion: 1,
        statement: SELECTOR_SQL,
      });

      assert.equal(view.snapshotAppliedIndex, EXPECTED_AFTER_OPEN_INDEX);
      assert.equal(view.snapshotTerm, EXPECTED_AFTER_OPEN_TERM);
      assert.equal(Number.isInteger(view.schemaVersion), true);

      const page0 = manager.readPage({
        boundParameters: [],
        deadlineMs: Date.now() + DEADLINE_WINDOW_MS,
        keyColumns: KEY_COLUMNS,
        pageByteBound: PAGE_BYTE_BOUND,
        pageIndex: 0,
        pageRowBound: PAGE_ROW_BOUND_MED,
        partitionService,
        partitionVersion: 1,
        readViewId: view.readViewId,
        statement: SELECTOR_SQL,
      });

      assert.deepEqual(
        page0.rows.map((r) => r.id),
        [1, 2, 3],
        'rows must match exact pinned snapshot at appliedIndex=3, excluding commit 4',
      );
      assert.equal(page0.pageMeta.snapshotAppliedIndex, EXPECTED_AFTER_OPEN_INDEX);
      assert.equal(page0.pageMeta.snapshotTerm, EXPECTED_AFTER_OPEN_TERM);
      assert.equal(page0.pageMeta.schemaVersion, view.schemaVersion);

      manager.invalidateReadView(view.readViewId, 'simulated_custody_loss');
      const tracker = createPagedShardProgressTracker();
      await assert.rejects(
        () =>
          executePagedShardSlot({
            dispatchPage: async () => {
              manager.readPage({
                boundParameters: [],
                deadlineMs: Date.now() + DEADLINE_WINDOW_MS,
                keyColumns: KEY_COLUMNS,
                pageByteBound: PAGE_BYTE_BOUND,
                pageIndex: 0,
                pageRowBound: PAGE_ROW_BOUND_MED,
                partitionService,
                partitionVersion: 1,
                readViewId: view.readViewId,
                statement: SELECTOR_SQL,
              });
              return {};
            },
            progressTracker: tracker,
            reduceCoordinator: null,
            request: {
              argumentsJson: '{}',
              attemptId: 'attempt-wm',
              deadlineMs: Date.now() + DEADLINE_WINDOW_MS,
              invocationId: 'inv-wm-discard',
              name: BINDING_NAME,
              resolution: {replicaId: REPLICA_ID},
              shard: {partitionId: PARTITION_ID},
              slotId: 0,
            },
          }),
        (err) =>
          err.pagedCode === PAGED_EXECUTION_ERROR_CODE.READ_VIEW_LOST &&
          err.wholeAttemptDiscard === true,
      );
    } finally {
      manager.shutdown?.();
      if (mainDb.open) mainDb.close();
    }
  });

  it('idle-reader-wal-byte-age-count-bounds: tracks real -wal bytes without double-counting, enforces WAL-byte/count limits, reaps idle expired views, and plateaus', async () => {
    const dbPath = path.join(tempDir, 'wal-bounds.sqlite');
    const mainDb = seedWalPartitionDb(dbPath, INITIAL_ROW_COUNT);
    const manager = createShardReadViewManager({
      maxRetainedViews: 2,
      maxRetainedWalBytes: SMALL_WAL_LIMIT_BYTES,
      maxViewAgeMs: REAP_AGE_MS,
      nativeHandleOverheadBytes: NATIVE_HANDLE_OVERHEAD_BYTES,
      reapIntervalMs: REAP_INTERVAL_MS,
    });
    const sharedManager = createShardReadViewManager({
      maxRetainedViews: 4,
      maxRetainedWalBytes: SHARED_WAL_LIMIT_BYTES,
      nativeHandleOverheadBytes: NATIVE_HANDLE_OVERHEAD_BYTES,
      reapIntervalMs: 0,
    });
    const partitionService = {
      dbPath,
      partitionId: PARTITION_ID,
      store: {dbPath, storageIncarnationId: 'inc-wal-1'},
    };

    try {
      const idleView = await manager.acquireReadView({
        attemptId: 'attempt-idle',
        boundParameters: [],
        deadlineMs: Date.now() + DEADLINE_WINDOW_MS,
        invocationId: 'inv-idle-1',
        keyColumns: KEY_COLUMNS,
        partitionId: PARTITION_ID,
        partitionService,
        partitionVersion: 1,
        statement: SELECTOR_SQL,
      });

      const bigPayload = 'x'.repeat(BULK_PAYLOAD_BYTES);
      const insertStmt = mainDb.prepare(INSERT_EVENT_SQL);
      const writeMany = mainDb.transaction((startId) => {
        for (let idx = 0; idx < BULK_WRITE_COUNT; idx += 1) {
          insertStmt.run(startId + idx, bigPayload);
        }
      });
      writeMany(100);

      const actualWalBytes = readActualWalBytes(dbPath);
      assert.ok(
        actualWalBytes > SMALL_WAL_LIMIT_BYTES,
        `expected -wal (${actualWalBytes}) to exceed ${SMALL_WAL_LIMIT_BYTES}`,
      );

      const pressureStats = manager.stats();
      assert.equal(pressureStats.totalObservedWalBytes, actualWalBytes);
      assert.equal(pressureStats.totalNativeHandleBytes, NATIVE_HANDLE_OVERHEAD_BYTES);
      assert.equal(
        pressureStats.totalPinnedBytes,
        actualWalBytes + NATIVE_HANDLE_OVERHEAD_BYTES,
      );

      await assert.rejects(
        () =>
          manager.acquireReadView({
            attemptId: 'attempt-2',
            boundParameters: [],
            deadlineMs: Date.now() + DEADLINE_WINDOW_MS,
            invocationId: 'inv-wal-over-budget',
            keyColumns: KEY_COLUMNS,
            partitionId: PARTITION_ID,
            partitionService,
            partitionVersion: 1,
            statement: SELECTOR_SQL,
          }),
        (err) => err.pagedCode === PAGED_EXECUTION_ERROR_CODE.READ_VIEW_UNAVAILABLE,
        'over-budget WAL growth must refuse new read-view acquisition',
      );

      const shared1 = await sharedManager.acquireReadView({
        attemptId: 'attempt-s1',
        boundParameters: [],
        deadlineMs: Date.now() + DEADLINE_WINDOW_MS,
        invocationId: 'inv-shared-1',
        keyColumns: KEY_COLUMNS,
        partitionId: PARTITION_ID,
        partitionService,
        partitionVersion: 1,
        statement: SELECTOR_SQL,
      });
      const shared2 = await sharedManager.acquireReadView({
        attemptId: 'attempt-s2',
        boundParameters: [],
        deadlineMs: Date.now() + DEADLINE_WINDOW_MS,
        invocationId: 'inv-shared-2',
        keyColumns: KEY_COLUMNS,
        partitionId: PARTITION_ID,
        partitionService,
        partitionVersion: 1,
        statement: SELECTOR_SQL,
      });
      const sharedStats = sharedManager.stats();
      assert.equal(sharedStats.activeViewCount, 2);
      assert.equal(
        sharedStats.totalObservedWalBytes,
        readActualWalBytes(dbPath),
        'shared -wal file bytes must not be double-counted across concurrent views',
      );
      assert.equal(
        sharedStats.totalNativeHandleBytes,
        2 * NATIVE_HANDLE_OVERHEAD_BYTES,
      );
      sharedManager.releaseReadView(shared1.readViewId);
      sharedManager.releaseReadView(shared2.readViewId);

      await sleep(REAP_WAIT_MS);
      const afterReapStats = manager.stats();
      assert.equal(
        afterReapStats.activeViewCount,
        0,
        'idle view past maxViewAgeMs must be reaped without a next-page request',
      );
      assert.equal(afterReapStats.retainedViewCount, 0);
      assert.equal(afterReapStats.totalObservedWalBytes, 0);
      assert.ok(afterReapStats.reapedViewCount >= 1);
      assert.equal(idleView.readerDb, null);

      assert.throws(
        () =>
          manager.readPage({
            boundParameters: [],
            deadlineMs: Date.now() + DEADLINE_WINDOW_MS,
            keyColumns: KEY_COLUMNS,
            pageByteBound: PAGE_BYTE_BOUND,
            pageIndex: 0,
            pageRowBound: PAGE_ROW_BOUND_SMALL,
            partitionService,
            partitionVersion: 1,
            readViewId: idleView.readViewId,
            statement: SELECTOR_SQL,
          }),
        (err) => err.pagedCode === PAGED_EXECUTION_ERROR_CODE.READ_VIEW_EXPIRED,
        'late readPage on an already-reaped expired view must throw READ_VIEW_EXPIRED',
      );

      // Verify READ_VIEW_EXPIRED is preserved across deadlineMs, maxViewAgeMs,
      // and maxIdleMs both before and after reapExpiredViews() runs.
      let virtualNowMs = VIRTUAL_NOW_START_MS;
      const expiryManager = createShardReadViewManager({
        maxIdleMs: VIRTUAL_IDLE_LIMIT_MS,
        maxViewAgeMs: VIRTUAL_AGE_LIMIT_MS,
        nowProvider: () => virtualNowMs,
        reapIntervalMs: 0,
      });
      const deadlineOnlyManager = createShardReadViewManager({
        maxIdleMs: VIRTUAL_LARGE_BOUND_MS,
        maxViewAgeMs: VIRTUAL_LARGE_BOUND_MS,
        nowProvider: () => virtualNowMs,
        reapIntervalMs: 0,
      });
      try {
        const deadlineView = await deadlineOnlyManager.acquireReadView({
          attemptId: 'attempt-c1-deadline',
          boundParameters: [],
          deadlineMs: virtualNowMs + VIRTUAL_DEADLINE_OFFSET_MS,
          invocationId: 'inv-c1-deadline',
          keyColumns: KEY_COLUMNS,
          partitionId: PARTITION_ID,
          partitionService,
          partitionVersion: 1,
          statement: SELECTOR_SQL,
        });
        const idleLimitView = await expiryManager.acquireReadView({
          attemptId: 'attempt-c1-idle',
          boundParameters: [],
          deadlineMs: virtualNowMs + DEADLINE_WINDOW_MS,
          invocationId: 'inv-c1-idle',
          keyColumns: KEY_COLUMNS,
          partitionId: PARTITION_ID,
          partitionService,
          partitionVersion: 1,
          statement: SELECTOR_SQL,
        });
        const ageLimitView = await expiryManager.acquireReadView({
          attemptId: 'attempt-c1-age',
          boundParameters: [],
          deadlineMs: virtualNowMs + DEADLINE_WINDOW_MS,
          invocationId: 'inv-c1-age',
          keyColumns: KEY_COLUMNS,
          partitionId: PARTITION_ID,
          partitionService,
          partitionVersion: 1,
          statement: SELECTOR_SQL,
        });

        // At +150ms, refresh ageLimitView before maxIdleMs (200ms) elapses.
        virtualNowMs += VIRTUAL_STEP_REFRESH_MS;
        expiryManager.readPage({
          boundParameters: [],
          deadlineMs: virtualNowMs + DEADLINE_WINDOW_MS,
          keyColumns: KEY_COLUMNS,
          pageByteBound: PAGE_BYTE_BOUND,
          pageIndex: 0,
          pageRowBound: PAGE_ROW_BOUND_SMALL,
          partitionService,
          partitionVersion: 1,
          readViewId: ageLimitView.readViewId,
          statement: SELECTOR_SQL,
        });

        // At +250ms, idleLimitView is past maxIdleMs (200ms); readPage before reap throws READ_VIEW_EXPIRED.
        virtualNowMs += VIRTUAL_STEP_EXPIRE_IDLE_MS;
        assert.throws(
          () =>
            expiryManager.readPage({
              boundParameters: [],
              deadlineMs: virtualNowMs + DEADLINE_WINDOW_MS,
              keyColumns: KEY_COLUMNS,
              pageByteBound: PAGE_BYTE_BOUND,
              pageIndex: 0,
              pageRowBound: PAGE_ROW_BOUND_SMALL,
              partitionService,
              partitionVersion: 1,
              readViewId: idleLimitView.readViewId,
              statement: SELECTOR_SQL,
            }),
          (err) => err.pagedCode === PAGED_EXECUTION_ERROR_CODE.READ_VIEW_EXPIRED,
          'readPage past maxIdleMs before reap must throw READ_VIEW_EXPIRED',
        );

        // At +300ms (150ms since last read, < 200ms maxIdleMs and < 400ms maxViewAgeMs),
        // refresh ageLimitView again, then advance +150ms to +450ms (idle=150ms < 200ms,
        // age=450ms >= 400ms maxViewAgeMs).
        virtualNowMs += VIRTUAL_STEP_RE_REFRESH_MS;
        expiryManager.readPage({
          boundParameters: [],
          deadlineMs: virtualNowMs + DEADLINE_WINDOW_MS,
          keyColumns: KEY_COLUMNS,
          pageByteBound: PAGE_BYTE_BOUND,
          pageIndex: 0,
          pageRowBound: PAGE_ROW_BOUND_SMALL,
          partitionService,
          partitionVersion: 1,
          readViewId: ageLimitView.readViewId,
          statement: SELECTOR_SQL,
        });
        virtualNowMs += VIRTUAL_STEP_EXPIRE_AGE_MS;

        // Explicitly run reapExpiredViews() on ageLimitView before calling readPage.
        const reapOutcome = expiryManager.reapExpiredViews(virtualNowMs);
        assert.equal(reapOutcome.closedIds.includes(ageLimitView.readViewId), true);
        assert.throws(
          () =>
            expiryManager.readPage({
              boundParameters: [],
              deadlineMs: virtualNowMs + DEADLINE_WINDOW_MS,
              keyColumns: KEY_COLUMNS,
              pageByteBound: PAGE_BYTE_BOUND,
              pageIndex: 0,
              pageRowBound: PAGE_ROW_BOUND_SMALL,
              partitionService,
              partitionVersion: 1,
              readViewId: ageLimitView.readViewId,
              statement: SELECTOR_SQL,
            }),
          (err) => err.pagedCode === PAGED_EXECUTION_ERROR_CODE.READ_VIEW_EXPIRED,
          'readPage past maxViewAgeMs after reapExpiredViews must still throw READ_VIEW_EXPIRED',
        );

        // Advance +100ms to +550ms (past deadlineView's 500ms deadlineMs) before reap.
        virtualNowMs += VIRTUAL_STEP_EXPIRE_DEADLINE_MS;
        assert.throws(
          () =>
            deadlineOnlyManager.readPage({
              boundParameters: [],
              deadlineMs: virtualNowMs + DEADLINE_WINDOW_MS,
              keyColumns: KEY_COLUMNS,
              pageByteBound: PAGE_BYTE_BOUND,
              pageIndex: 0,
              pageRowBound: PAGE_ROW_BOUND_SMALL,
              partitionService,
              partitionVersion: 1,
              readViewId: deadlineView.readViewId,
              statement: SELECTOR_SQL,
            }),
          (err) => err.pagedCode === PAGED_EXECUTION_ERROR_CODE.READ_VIEW_EXPIRED,
          'readPage past deadlineMs before reap must throw READ_VIEW_EXPIRED',
        );
      } finally {
        deadlineOnlyManager.shutdown();
        expiryManager.shutdown();
      }

      mainDb.pragma(WAL_TRUNCATE_PRAGMA);
      assert.equal(readActualWalBytes(dbPath), 0);

      for (let cycle = 0; cycle < PLATEAU_CYCLES; cycle += 1) {
        const v = await manager.acquireReadView({
          attemptId: `attempt-cycle-${cycle}`,
          boundParameters: [],
          deadlineMs: Date.now() + DEADLINE_WINDOW_MS,
          invocationId: `inv-cycle-${cycle}`,
          keyColumns: KEY_COLUMNS,
          partitionId: PARTITION_ID,
          partitionService,
          partitionVersion: 1,
          statement: SELECTOR_SQL,
        });
        assert.equal(manager.releaseReadView(v.readViewId), true);
      }
      assert.equal(manager.stats().retainedViewCount, 0);
      assert.equal(manager.stats().totalPinnedBytes, 0);
    } finally {
      sharedManager.shutdown?.();
      manager.shutdown?.();
      if (mainDb.open) mainDb.close();
    }
  });

  it('query-attempt-and-cdc-policy-separation: query read-view expiry/loss preserves CDC hydration image semantics', async () => {
    const dbPath = path.join(tempDir, 'cdc-separation.sqlite');
    const service = createTestPartitionService(dbPath);
    const manager = createShardReadViewManager();

    try {
      await service.initialize();
      service.isLeader = true;
      writeAppliedEntry(service.db, PARTITION_ID, 1, 1, 'cdc-1');
      writeAppliedEntry(service.db, PARTITION_ID, 2, 1, 'cdc-2');

      const queryView = await manager.acquireReadView({
        attemptId: 'attempt-sep',
        boundParameters: [],
        deadlineMs: Date.now() + DEADLINE_WINDOW_MS,
        invocationId: 'inv-sep',
        keyColumns: KEY_COLUMNS,
        partitionId: PARTITION_ID,
        partitionService: service,
        partitionVersion: 1,
        statement: SELECTOR_SQL,
      });
      assert.equal(queryView.policyDomain, 'query_read_view');

      manager.invalidateReadView(queryView.readViewId, 'query_attempt_cancelled');
      assert.throws(
        () =>
          manager.readPage({
            boundParameters: [],
            deadlineMs: Date.now() + DEADLINE_WINDOW_MS,
            keyColumns: KEY_COLUMNS,
            pageByteBound: PAGE_BYTE_BOUND,
            pageIndex: 0,
            pageRowBound: PAGE_ROW_BOUND_MED,
            partitionService: service,
            partitionVersion: 1,
            readViewId: queryView.readViewId,
            statement: SELECTOR_SQL,
          }),
        (err) =>
          err.pagedCode === PAGED_EXECUTION_ERROR_CODE.READ_VIEW_LOST &&
          err.wholeAttemptDiscard === true &&
          err.consistencyScope !== 'cdc_hydration_image',
      );

      const cdcImage = service.readHydrationImage(SELECTOR_SQL);
      assert.equal(cdcImage.state, 'read');
      assert.equal(cdcImage.appliedIndex, '2');
      assert.deepEqual(
        cdcImage.rows.map((r) => r.id),
        [1, 2],
      );
      assert.equal(PAGED_CONSISTENCY_SCOPE, 'per_shard_retained_read_view');
    } finally {
      manager.shutdown?.();
      await service.shutdown();
    }
  });

  it('opening-window-retirement-and-post-open-failure-custody: closes or preserves custody for native readers opened before failure or retirement', async () => {
    // Case 1: Retirement between native reader opening and custody registration (close succeeds).
    const dbPath1 = path.join(tempDir, 'opening-retire-ok.sqlite');
    const mainDb1 = seedWalPartitionDb(dbPath1, INITIAL_ROW_COUNT);
    let openedReader1 = null;
    const service1 = {
      db: mainDb1,
      dbPath: dbPath1,
      partitionId: PARTITION_ID,
      store: {db: mainDb1, dbPath: dbPath1, storageIncarnationId: 'inc-open-1'},
    };
    const mgr1 = createShardReadViewManager({
      onSnapshotStage: (stage, ctx) => {
        if (stage === 'after_open') {
          openedReader1 = ctx.readerDb;
          endStorageIncarnationCustody(service1, 'concurrent_retirement');
        }
      },
    });
    try {
      await assert.rejects(
        () =>
          mgr1.acquireReadView({
            attemptId: 'attempt-open-1',
            boundParameters: [],
            deadlineMs: Date.now() + DEADLINE_WINDOW_MS,
            invocationId: 'inv-open-1',
            keyColumns: KEY_COLUMNS,
            partitionId: PARTITION_ID,
            partitionService: service1,
            partitionVersion: 1,
            statement: SELECTOR_SQL,
          }),
        (err) =>
          err.pagedCode === PAGED_EXECUTION_ERROR_CODE.READ_VIEW_UNAVAILABLE ||
          err.code === CUSTODY_ERROR_CODE.INCARNATION_ENDED,
        'concurrent retirement during opening must fail acquireReadView',
      );
      assert.ok(openedReader1, 'native readerDb must have been opened');
      assert.equal(openedReader1.open, false, 'opening readerDb must be closed on retirement');
      assert.equal(mgr1.stats().activeViewCount, 0);
      assert.equal(mgr1.stats().unclosedViewCount, 0);
      assert.equal(inspectDbPathCustody(dbPath1).hasLiveOrUnclosedReaders, false);
    } finally {
      mgr1.shutdown();
      if (mainDb1.open) mainDb1.close();
    }

    // Case 2: Retirement between native reader opening and custody registration when closeReader FAILS.
    const dbPath2 = path.join(tempDir, 'opening-retire-close-fail.sqlite');
    const mainDb2 = seedWalPartitionDb(dbPath2, INITIAL_ROW_COUNT);
    let openedReader2 = null;
    let allowClose2 = false;
    const service2 = {
      db: mainDb2,
      dbPath: dbPath2,
      partitionId: PARTITION_ID,
      store: {db: mainDb2, dbPath: dbPath2, storageIncarnationId: 'inc-open-2'},
    };
    const mgr2 = createShardReadViewManager({
      closeReader: (readerDb) => {
        if (!allowClose2) return false;
        if (readerDb.open) {
          if (readerDb.inTransaction) readerDb.exec('ROLLBACK');
          readerDb.close();
        }
        return !readerDb.open;
      },
      nativeHandleOverheadBytes: NATIVE_HANDLE_OVERHEAD_BYTES,
      onSnapshotStage: (stage, ctx) => {
        if (stage === 'after_watermark') {
          openedReader2 = ctx.readerDb;
          endStorageIncarnationCustody(service2, 'concurrent_retirement');
        }
      },
    });
    try {
      await assert.rejects(
        () =>
          mgr2.acquireReadView({
            attemptId: 'attempt-open-2',
            boundParameters: [],
            deadlineMs: Date.now() + DEADLINE_WINDOW_MS,
            invocationId: 'inv-open-2',
            keyColumns: KEY_COLUMNS,
            partitionId: PARTITION_ID,
            partitionService: service2,
            partitionVersion: 1,
            statement: SELECTOR_SQL,
          }),
        (err) =>
          err.pagedCode === PAGED_EXECUTION_ERROR_CODE.READ_VIEW_UNAVAILABLE ||
          err.code === CUSTODY_ERROR_CODE.INCARNATION_ENDED,
      );
      assert.ok(openedReader2);
      assert.equal(openedReader2.open, true, 'native readerDb remains open on close failure');
      const stats2 = mgr2.stats();
      assert.equal(stats2.activeViewCount, 0);
      assert.equal(stats2.unclosedViewCount, 1);
      assert.equal(stats2.closeFailureCount, 1);
      assert.ok(stats2.totalPinnedBytes >= NATIVE_HANDLE_OVERHEAD_BYTES);
      const custody2 = inspectDbPathCustody(dbPath2);
      assert.equal(custody2.hasLiveOrUnclosedReaders, true);
      assert.equal(custody2.unclosedViewIds.length, 1);
      assert.throws(
        () => assertStorageArtifactsUnlinkSafe(dbPath2),
        (err) => err.code === CUSTODY_ERROR_CODE.CUSTODY_BLOCKED,
      );

      allowClose2 = true;
      const reap2 = mgr2.reapExpiredViews();
      assert.equal(reap2.closedIds.length, 1);
      assert.equal(openedReader2.open, false);
      assert.equal(mgr2.stats().unclosedViewCount, 0);
      assert.equal(mgr2.stats().totalPinnedBytes, 0);
      assert.equal(inspectDbPathCustody(dbPath2).hasLiveOrUnclosedReaders, false);
    } finally {
      allowClose2 = true;
      mgr2.shutdown();
      if (mainDb2.open) mainDb2.close();
    }

    // Case 3: Post-open failure during openPinnedWalReader when closeReader FAILS.
    const dbPath3 = path.join(tempDir, 'post-open-error-close-fail.sqlite');
    const mainDb3 = seedWalPartitionDb(dbPath3, INITIAL_ROW_COUNT);
    let openedReader3 = null;
    let allowClose3 = false;
    const service3 = {
      db: mainDb3,
      dbPath: dbPath3,
      partitionId: PARTITION_ID,
      store: {db: mainDb3, dbPath: dbPath3, storageIncarnationId: 'inc-open-3'},
    };
    const mgr3 = createShardReadViewManager({
      closeReader: (readerDb) => {
        if (!allowClose3) return false;
        if (readerDb.open) {
          if (readerDb.inTransaction) readerDb.exec('ROLLBACK');
          readerDb.close();
        }
        return !readerDb.open;
      },
      nativeHandleOverheadBytes: NATIVE_HANDLE_OVERHEAD_BYTES,
      onSnapshotStage: (stage, ctx) => {
        if (stage === 'after_pin') {
          openedReader3 = ctx.readerDb;
          throw new Error('injected_after_pin_failure');
        }
      },
    });
    try {
      await assert.rejects(
        () =>
          mgr3.acquireReadView({
            attemptId: 'attempt-open-3',
            boundParameters: [],
            deadlineMs: Date.now() + DEADLINE_WINDOW_MS,
            invocationId: 'inv-open-3',
            keyColumns: KEY_COLUMNS,
            partitionId: PARTITION_ID,
            partitionService: service3,
            partitionVersion: 1,
            statement: SELECTOR_SQL,
          }),
        (err) => err.message === 'injected_after_pin_failure',
      );
      assert.ok(openedReader3);
      assert.equal(openedReader3.open, true);
      const stats3 = mgr3.stats();
      assert.equal(stats3.activeViewCount, 0);
      assert.equal(stats3.unclosedViewCount, 1);
      assert.equal(stats3.closeFailureCount, 1);
      assert.ok(stats3.totalPinnedBytes >= NATIVE_HANDLE_OVERHEAD_BYTES);
      const custody3 = inspectDbPathCustody(dbPath3);
      assert.equal(custody3.hasLiveOrUnclosedReaders, true);
      assert.equal(custody3.unclosedViewIds.length, 1);
      assert.throws(
        () => assertStorageArtifactsUnlinkSafe(dbPath3),
        (err) => err.code === CUSTODY_ERROR_CODE.CUSTODY_BLOCKED,
      );

      allowClose3 = true;
      const reap3 = mgr3.reapExpiredViews();
      assert.equal(reap3.closedIds.length, 1);
      assert.equal(openedReader3.open, false);
      assert.equal(mgr3.stats().unclosedViewCount, 0);
      assert.equal(mgr3.stats().totalPinnedBytes, 0);
      assert.equal(inspectDbPathCustody(dbPath3).hasLiveOrUnclosedReaders, false);
    } finally {
      allowClose3 = true;
      mgr3.shutdown();
      if (mainDb3.open) mainDb3.close();
    }
  });
});
