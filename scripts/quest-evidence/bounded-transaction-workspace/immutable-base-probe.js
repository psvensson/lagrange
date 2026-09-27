// Gate A1 evidence harness for bounded-transaction-workspace.
//
// The production better-sqlite3 runtime does not expose sqlite_dbpage. This
// harness compiles a disposable reader from the vendored SQLite amalgamation
// with SQLITE_ENABLE_DBPAGE_VTAB to answer only the SQLite-feasibility
// question. It does not alter production build flags and does not implement a
// writable overlay.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {monitorEventLoopDelay, performance} from 'node:perf_hooks';
import {setImmediate as yieldTurn} from 'node:timers/promises';
import Database from 'better-sqlite3';

import {refuseUnderProbe} from '../../../src/test-helpers/probe-guard.js';
import {
  DbpageProbeError,
  compileDbpageProbe,
  openDbpageExecutor,
} from './dbpage-probe-client.js';

const BYTES_PER_MIB = 1024 * 1024;
const FIXTURE_CHUNK_BYTES = BYTES_PER_MIB;
const FIXTURE_BATCH_ROWS = 4;
const TARGET_MIB = Object.freeze([8, 64, 256]);
const STABILITY_TARGET_MIB = TARGET_MIB[0];
const LIVE_WRITE_COUNT = 128;
const READER_ATTEMPTS = 32;
const AUTOCHECKPOINT_PAGES = 4;
const EVENT_LOOP_RESOLUTION_MS = 1;
const NANOSECONDS_PER_MILLISECOND = 1e6;
const SQLITE_PRIMARY_CODE_MASK = 0xff;
const METRIC_DECIMAL_PLACES = 3;
const REPORT_SCHEMA = 'bounded-transaction-workspace-immutable-base/1';
const TEMP_PREFIX = 'bounded-transaction-immutable-base-';
const HARNESS_ACTIVITY = 'the bounded transaction immutable-base harness';
const GROUP_ID = 'probe-group';
const INITIAL_APPLIED_INDEX = 1;
const SQLITE_BUSY = 5;
const FILE_NOT_FOUND = 'ENOENT';
const DBPAGE_COMPILE_OPTION = 'ENABLE_DBPAGE_VTAB';
const SNAPSHOT_COMPILE_OPTION = 'ENABLE_SNAPSHOT';
const LIVENESS_PROXY_CLASSIFICATION =
  'local-owner-turn-proxy-not-raft-proof';
const CAPABILITY_CLASSIFICATION = 'probe-only-sqlite-feasibility';
const GATE_A_STATUS = 'open-authoritative-raft-liveness-not-yet-proven';
const READER_CAPACITY_CONDITION = Object.freeze({
  NOT_OBSERVED: 'not-observed-through-tested-bound',
  STALE: 'stale-read-mark-reuse',
  FAILURE: 'typed-sqlite-failure',
});
const READER_FAILURE_KIND = Object.freeze({
  NOT_OBSERVED: 'not-observed',
  SQLITE: 'sqlite-failure',
});
const SQL = Object.freeze({
  JOURNAL_WAL: 'journal_mode = WAL',
  SYNCHRONOUS_OFF: 'synchronous = OFF',
  SYNCHRONOUS_NORMAL: 'synchronous = NORMAL',
  CHECKPOINT_PASSIVE: 'wal_checkpoint(PASSIVE)',
  CHECKPOINT_TRUNCATE: 'wal_checkpoint(TRUNCATE)',
  BUSY_TIMEOUT_NONE: 'busy_timeout = 0',
  AUTOCHECKPOINT_NONE: 'wal_autocheckpoint = 0',
  DBPAGE_CAPABILITY:
    'SELECT pgno, length(data) AS bytes FROM sqlite_dbpage LIMIT 1',
  SQLITE_VERSION: 'SELECT sqlite_version() AS version',
});

function roundMetric(value) {
  return Number(value.toFixed(METRIC_DECIMAL_PLACES));
}

function elapsedSince(startedAt) {
  return roundMetric(performance.now() - startedAt);
}

function databaseShape(db) {
  const pageCount = db.pragma('page_count', {simple: true});
  const pageSize = db.pragma('page_size', {simple: true});
  return {pageCount, pageSize, logicalBytes: pageCount * pageSize};
}

function checkpoint(db, mode) {
  const [result] = db.pragma(mode);
  return {
    busy: result.busy,
    logFrames: result.log,
    checkpointedFrames: result.checkpointed,
  };
}

function fileBytes(file) {
  try {
    return fs.statSync(file).size;
  } catch (error) {
    if (error.code === FILE_NOT_FOUND) return 0;
    throw error;
  }
}

function rootPages(db) {
  const rows = db.prepare(`
    SELECT name, rootpage
    FROM sqlite_schema
    WHERE name IN (
      'anchor_rows', 'anchor_value_idx', 'late_rows', 'late_value_idx'
    )
    ORDER BY name
  `).all();
  return Object.fromEntries(rows.map((row) => [row.name, row.rootpage]));
}

function createFixture(parentDirectory, targetMiB, label) {
  const directory = path.join(parentDirectory, label);
  fs.mkdirSync(directory, {recursive: true});
  const file = path.join(directory, 'partition.db');
  const db = new Database(file);
  db.pragma(SQL.JOURNAL_WAL);
  db.pragma(SQL.SYNCHRONOUS_OFF);
  db.exec(`
    CREATE TABLE _raft_rs_applied_state (
      group_id TEXT PRIMARY KEY,
      applied_index INTEGER NOT NULL
    );
    CREATE TABLE anchor_rows (
      id INTEGER PRIMARY KEY,
      value TEXT NOT NULL,
      payload BLOB NOT NULL
    );
    CREATE INDEX anchor_value_idx ON anchor_rows(value);
    CREATE TABLE late_rows (
      id INTEGER PRIMARY KEY,
      value TEXT NOT NULL,
      payload BLOB NOT NULL
    );
    CREATE INDEX late_value_idx ON late_rows(value);
    CREATE TABLE unrelated_partition_bytes (
      id INTEGER PRIMARY KEY,
      payload BLOB NOT NULL
    );
    INSERT INTO _raft_rs_applied_state (group_id, applied_index)
      VALUES ('${GROUP_ID}', ${INITIAL_APPLIED_INDEX});
    INSERT INTO anchor_rows (id, value, payload)
      VALUES (1, 'anchor-000001', X'01020304');
    INSERT INTO late_rows (id, value, payload)
      VALUES (1, 'late-000001', X'05060708');
  `);
  const insert = db.prepare(
    'INSERT INTO unrelated_partition_bytes (payload) VALUES (zeroblob(?))');
  const insertBatch = db.transaction(() => {
    for (let index = 0; index < FIXTURE_BATCH_ROWS; index += 1) {
      insert.run(FIXTURE_CHUNK_BYTES);
    }
  });
  let shape = databaseShape(db);
  while (shape.logicalBytes < targetMiB * BYTES_PER_MIB) {
    insertBatch();
    shape = databaseShape(db);
  }
  checkpoint(db, SQL.CHECKPOINT_TRUNCATE);
  db.pragma(SQL.SYNCHRONOUS_NORMAL);
  db.pragma(SQL.BUSY_TIMEOUT_NONE);
  return {
    db,
    directory,
    file,
    roots: rootPages(db),
    shape: databaseShape(db),
    targetMiB,
    walFile: `${file}-wal`,
  };
}

function closeFixture(fixture) {
  fixture.db.close();
}

async function readPages(binaryPath, fixture, pageNames) {
  const {executor, ready} = await openDbpageExecutor(binaryPath, fixture.file);
  const pages = {};
  try {
    for (const name of pageNames) {
      pages[name] = await executor.readPage(fixture.roots[name]);
    }
    return {ready, pages};
  } finally {
    await executor.dispose();
  }
}

function inspectShippedRuntime() {
  const db = new Database(':memory:');
  try {
    const compileOptions = db.prepare('PRAGMA compile_options').all()
      .map((row) => Object.values(row)[0]).sort();
    let dbpageQuery;
    try {
      dbpageQuery = {
        available: true,
        rows: db.prepare(SQL.DBPAGE_CAPABILITY).all(),
      };
    } catch (error) {
      dbpageQuery = {available: false, code: error.code,
        message: error.message};
    }
    const modules = db.prepare(`
      SELECT name FROM pragma_module_list
      WHERE name IN ('dbstat', 'sqlite_dbpage')
      ORDER BY name
    `).all().map((row) => row.name);
    return {
      sqliteVersion: db.prepare(SQL.SQLITE_VERSION).get().version,
      compileOptions,
      modules,
      dbpageQuery,
      hasDbpageCompileOption: compileOptions.includes(DBPAGE_COMPILE_OPTION),
      hasSnapshotCompileOption: compileOptions.includes(SNAPSHOT_COMPILE_OPTION),
    };
  } finally {
    db.close();
  }
}

async function measureComplexityCase(binaryPath, fixture) {
  const wallStarted = performance.now();
  const {executor, ready} = await openDbpageExecutor(binaryPath, fixture.file);
  const openedMs = elapsedSince(wallStarted);
  const first = await executor.readPage(fixture.roots.anchor_rows);
  const second = await executor.readPage(fixture.roots.anchor_value_idx);
  const disposeStarted = performance.now();
  const disposed = await executor.dispose();
  return {
    targetMiB: fixture.targetMiB,
    source: fixture.shape,
    setup: {...ready, parentObservedMs: openedMs},
    firstRequestedPage: first,
    secondRequestedPage: second,
    disposal: {...disposed, parentObservedMs: elapsedSince(disposeStarted)},
    counters: {
      requestedPages: disposed.pageRequests,
      pageSqlStatements: disposed.pageSqlStatements,
      materializedBytes: first.bytes + second.bytes,
      totalDatabasePages: fixture.shape.pageCount,
    },
  };
}

function createLiveStateApplier(db) {
  const updateAnchor = db.prepare(
    'UPDATE anchor_rows SET value = ? WHERE id = 1');
  const updateLate = db.prepare(
    'UPDATE late_rows SET value = ? WHERE id = 1');
  const updateApplied = db.prepare(
    'UPDATE _raft_rs_applied_state SET applied_index = ? WHERE group_id = ?');
  return db.transaction((index) => {
    const suffix = String(index).padStart(6, '0');
    updateAnchor.run(`anchor-${suffix}`);
    updateLate.run(`late-${suffix}`);
    updateApplied.run(index, GROUP_ID);
  });
}

async function exercisePinnedSnapshot(binaryPath, fixture) {
  const baseline = await readPages(binaryPath, fixture,
    ['anchor_rows', 'anchor_value_idx', 'late_rows']);
  const {executor, ready} = await openDbpageExecutor(binaryPath, fixture.file);
  const initialState = await executor.readState();
  const initialAnchor = await executor.readPage(fixture.roots.anchor_rows);
  const initialIndex = await executor.readPage(fixture.roots.anchor_value_idx);
  const transaction = createLiveStateApplier(fixture.db);
  const eventLoop = monitorEventLoopDelay({resolution: EVENT_LOOP_RESOLUTION_MS});
  const commitMs = [];
  fixture.db.pragma(`wal_autocheckpoint = ${AUTOCHECKPOINT_PAGES}`);
  eventLoop.enable();
  try {
    for (let offset = 1; offset <= LIVE_WRITE_COUNT; offset += 1) {
      const started = performance.now();
      transaction(INITIAL_APPLIED_INDEX + offset);
      commitMs.push(performance.now() - started);
      await yieldTurn();
    }
  } finally {
    eventLoop.disable();
  }
  const walWhilePinnedBytes = fileBytes(fixture.walFile);
  const passiveWhilePinned = checkpoint(fixture.db, SQL.CHECKPOINT_PASSIVE);
  const truncateWhilePinned = checkpoint(fixture.db, SQL.CHECKPOINT_TRUNCATE);
  const pinnedStateAfterWrites = await executor.readState();
  const anchorAfterWrites = await executor.readPage(fixture.roots.anchor_rows);
  const indexAfterWrites = await executor.readPage(
    fixture.roots.anchor_value_idx);
  const lateFirstAccessAfterWrites = await executor.readPage(
    fixture.roots.late_rows);
  const lateStateAfterPageAccess = await executor.readLate();
  const disposed = await executor.dispose();
  const fresh = await readPages(binaryPath, fixture,
    ['anchor_rows', 'anchor_value_idx', 'late_rows']);
  const truncateAfterRelease = checkpoint(fixture.db, SQL.CHECKPOINT_TRUNCATE);
  const walAfterReleaseBytes = fileBytes(fixture.walFile);
  return {
    ready,
    initialState,
    pinnedStateAfterWrites,
    lateStateAfterPageAccess,
    pages: {
      baseline: baseline.pages,
      initialAnchor,
      initialIndex,
      anchorAfterWrites,
      indexAfterWrites,
      lateFirstAccessAfterWrites,
      fresh: fresh.pages,
    },
    liveWrites: {
      count: LIVE_WRITE_COUNT,
      finalAppliedIndex: INITIAL_APPLIED_INDEX + LIVE_WRITE_COUNT,
      maxCommitMs: roundMetric(Math.max(...commitMs)),
      averageCommitMs: roundMetric(
        commitMs.reduce((sum, value) => sum + value, 0) / commitMs.length),
    },
    livenessProxy: {
      classification: LIVENESS_PROXY_CLASSIFICATION,
      executorProcessIsSeparate: true,
      maximumEventLoopDelayMs: roundMetric(
        eventLoop.max / NANOSECONDS_PER_MILLISECOND),
    },
    checkpoints: {passiveWhilePinned, truncateWhilePinned,
      truncateAfterRelease},
    wal: {whilePinnedBytes: walWhilePinnedBytes,
      afterReleaseBytes: walAfterReleaseBytes},
    disposal: disposed,
  };
}

function readerFailure(error) {
  if (!(error instanceof DbpageProbeError)) throw error;
  return {
    code: error.record.code,
    extendedCode: error.record.extendedCode,
    phase: error.record.phase,
    deterministicBusy:
      (error.record.code & SQLITE_PRIMARY_CODE_MASK) === SQLITE_BUSY,
  };
}

async function exerciseReaderMarks(binaryPath, fixture) {
  fixture.db.pragma(SQL.AUTOCHECKPOINT_NONE);
  const transaction = createLiveStateApplier(fixture.db);
  const readers = [];
  const acquisitions = [];
  let failure = {kind: READER_FAILURE_KIND.NOT_OBSERVED};
  let capacityCondition = READER_CAPACITY_CONDITION.NOT_OBSERVED;
  for (let attempt = 0; attempt < READER_ATTEMPTS; attempt += 1) {
    const expectedAppliedIndex =
      INITIAL_APPLIED_INDEX + LIVE_WRITE_COUNT + attempt + 1;
    transaction(expectedAppliedIndex);
    try {
      const opened = await openDbpageExecutor(binaryPath, fixture.file);
      readers.push({executor: opened.executor, expectedAppliedIndex});
      const observedAppliedIndex = Number(opened.ready.appliedIndex);
      acquisitions.push({expectedAppliedIndex, observedAppliedIndex,
        exactCurrent: observedAppliedIndex === expectedAppliedIndex});
      if (observedAppliedIndex !== expectedAppliedIndex) {
        capacityCondition = READER_CAPACITY_CONDITION.STALE;
        break;
      }
    } catch (error) {
      failure = {kind: READER_FAILURE_KIND.SQLITE,
        detail: readerFailure(error)};
      capacityCondition = READER_CAPACITY_CONDITION.FAILURE;
      break;
    }
  }
  const retained = [];
  for (const reader of readers) {
    const state = await reader.executor.readState();
    retained.push({expectedAppliedIndex: reader.expectedAppliedIndex,
      observedAppliedIndex: Number(state.appliedIndex),
      exact: Number(state.appliedIndex) === reader.expectedAppliedIndex});
  }
  let replacement;
  const usableDistinctSnapshots = acquisitions
    .filter((acquisition) => acquisition.exactCurrent).length;
  if (capacityCondition !== READER_CAPACITY_CONDITION.NOT_OBSERVED &&
      readers.length > 0) {
    await readers.shift().executor.dispose();
    try {
      const opened = await openDbpageExecutor(binaryPath, fixture.file);
      const expectedAppliedIndex = fixture.db.prepare(
        'SELECT applied_index FROM _raft_rs_applied_state WHERE group_id = ?',
      ).get(GROUP_ID).applied_index;
      const observedAppliedIndex = Number(opened.ready.appliedIndex);
      replacement = {opened: true, expectedAppliedIndex,
        observedAppliedIndex,
        exactCurrent: observedAppliedIndex === expectedAppliedIndex};
      readers.push({executor: opened.executor,
        expectedAppliedIndex: observedAppliedIndex});
    } catch (error) {
      replacement = {opened: false, failure: readerFailure(error)};
    }
  }
  for (const reader of readers) await reader.executor.dispose();
  const truncateAfterRelease = checkpoint(fixture.db, SQL.CHECKPOINT_TRUNCATE);
  return {
    attempted: READER_ATTEMPTS,
    acquisitions,
    retained,
    usableDistinctSnapshots,
    capacityCondition,
    failure,
    replacement,
    truncateAfterRelease,
    walAfterReleaseBytes: fileBytes(fixture.walFile),
  };
}

function complexitySummary(samples) {
  const smallest = samples[0];
  const largest = samples.at(-1);
  return {
    databasePageGrowthFactor: roundMetric(
      largest.source.pageCount / smallest.source.pageCount),
    requestedPageGrowthFactor: roundMetric(
      largest.counters.requestedPages / smallest.counters.requestedPages),
    materializedByteGrowthFactor: roundMetric(
      largest.counters.materializedBytes /
        smallest.counters.materializedBytes),
  };
}

/**
 * Run the probe-only immutable-base witness.
 * @returns {Promise<object>}
 */
export async function runImmutableBaseProbe() {
  refuseUnderProbe(HARNESS_ACTIVITY);
  const parentDirectory = fs.mkdtempSync(path.join(os.tmpdir(), TEMP_PREFIX));
  const binaryPath = path.join(parentDirectory, 'dbpage-snapshot-probe');
  const runtime = inspectShippedRuntime();
  const compileStarted = performance.now();
  compileDbpageProbe(binaryPath);
  const probeBuild = {
    sqliteSource: 'node_modules/better-sqlite3/deps/sqlite3/sqlite3.c',
    dbpageCompileFlag: 'SQLITE_ENABLE_DBPAGE_VTAB',
    productionBuildChanged: false,
    compileMs: elapsedSince(compileStarted),
  };
  const complexity = [];
  let stability;
  let readerMarks;
  try {
    for (const targetMiB of TARGET_MIB) {
      const fixture = createFixture(parentDirectory, targetMiB,
        `complexity-${targetMiB}-mib`);
      try {
        complexity.push(await measureComplexityCase(binaryPath, fixture));
      } finally {
        closeFixture(fixture);
      }
    }
    const stabilityFixture = createFixture(parentDirectory,
      STABILITY_TARGET_MIB, 'snapshot-stability');
    try {
      stability = await exercisePinnedSnapshot(binaryPath, stabilityFixture);
    } finally {
      closeFixture(stabilityFixture);
    }
    const readerFixture = createFixture(parentDirectory,
      STABILITY_TARGET_MIB, 'reader-marks');
    try {
      readerMarks = await exerciseReaderMarks(binaryPath, readerFixture);
    } finally {
      closeFixture(readerFixture);
    }
    return {
      schema: REPORT_SCHEMA,
      host: os.hostname(),
      capabilityBoundary: {
        shippedRuntime: runtime,
        probeBuild,
        classification: CAPABILITY_CLASSIFICATION,
      },
      complexity: {
        samples: complexity,
        summary: complexitySummary(complexity),
      },
      stability,
      readerMarks,
      gateAStatus: GATE_A_STATUS,
    };
  } finally {
    fs.rmSync(parentDirectory, {recursive: true, force: true});
  }
}

export const IMMUTABLE_BASE_PROBE = Object.freeze({
  INITIAL_APPLIED_INDEX,
  LIVE_WRITE_COUNT,
  REPORT_SCHEMA,
  TARGET_MIB,
});
