// Performance/complexity falsifier for bounded-transaction-workspace.
//
// This is a harness, not a Solver probe. It creates generated SQLite
// fixtures, mutates private workspaces and writes a report, so R27 requires
// it to refuse under LAGRANGE_PROBE=1. The initial adapter is deliberately
// the rejected full-serialize mechanism: it calibrates the witness red before
// any candidate workspace is implemented.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {performance} from 'node:perf_hooks';
import Database from 'better-sqlite3';

import {refuseUnderProbe} from '../../../src/test-helpers/probe-guard.js';

const BYTES_PER_MIB = 1024 * 1024;
const FIXTURE_CHUNK_BYTES = BYTES_PER_MIB;
const FIXTURE_BATCH_ROWS = 4;
const FIXED_TRANSACTION_ROWS = 1;
const LARGE_TRANSACTION_ROWS = 4096;
const TRANSACTION_BLOB_BYTES = 64;
const METRIC_DECIMAL_PLACES = 3;
const TARGET_MIB = Object.freeze([8, 64, 256]);
const REPORT_SCHEMA = 'bounded-transaction-workspace-falsifier/1';
const NEGATIVE_CONTROL = 'full-sqlite-serialize';
const TEMP_PREFIX = 'bounded-transaction-workspace-';
const HARNESS_ACTIVITY = 'the bounded transaction workspace performance harness';
const CLASSIFICATION = Object.freeze({
  TOTAL_PARTITION_BYTES: 'O(total-partition-bytes)',
  NOT_DETECTED: 'not-detected',
});
const SQL = Object.freeze({
  BEGIN: 'BEGIN IMMEDIATE',
  COMMIT: 'COMMIT',
  FOREIGN_KEYS_ON: 'foreign_keys = ON',
  JOURNAL_WAL: 'journal_mode = WAL',
  SYNCHRONOUS_OFF: 'synchronous = OFF',
  WAL_CHECKPOINT_TRUNCATE: 'wal_checkpoint(TRUNCATE)',
  FIRST_WRITE: 'UPDATE workspace_rows SET value = value + 1 WHERE id = 1',
  EXPRESSION_UPDATE: 'UPDATE workspace_rows SET value = value + 5 WHERE id = 1',
});
const SQLITE_HEADER = Object.freeze({
  READ_VERSION_OFFSET: 18,
  WRITE_VERSION_OFFSET: 19,
  ROLLBACK_JOURNAL_VERSION: 1,
  WAL_JOURNAL_VERSION: 2,
});

function elapsedSince(startedAt) {
  return Number((performance.now() - startedAt).toFixed(METRIC_DECIMAL_PLACES));
}

function databaseShape(db) {
  const pageCount = db.pragma('page_count', {simple: true});
  const pageSize = db.pragma('page_size', {simple: true});
  return {pageCount, pageSize, logicalBytes: pageCount * pageSize};
}

function createFixture(parentDirectory, targetMiB, label = `${targetMiB}-mib`) {
  const directory = path.join(parentDirectory, label);
  fs.mkdirSync(directory, {recursive: true});
  const file = path.join(directory, 'partition.db');
  const db = new Database(file);
  db.pragma(SQL.JOURNAL_WAL);
  db.pragma(SQL.SYNCHRONOUS_OFF);
  db.pragma(SQL.FOREIGN_KEYS_ON);
  db.exec(`
    CREATE TABLE parents (
      id INTEGER PRIMARY KEY
    );
    CREATE TABLE workspace_rows (
      id INTEGER PRIMARY KEY,
      parent_id INTEGER NOT NULL REFERENCES parents(id),
      unique_value TEXT NOT NULL UNIQUE,
      value INTEGER NOT NULL,
      payload BLOB NOT NULL
    );
    CREATE INDEX workspace_rows_value_idx ON workspace_rows(value);
    CREATE TABLE workspace_audit (
      row_id INTEGER NOT NULL,
      value INTEGER NOT NULL
    );
    CREATE TRIGGER workspace_rows_insert_audit
    AFTER INSERT ON workspace_rows
    BEGIN
      INSERT INTO workspace_audit (row_id, value)
      VALUES (NEW.id, NEW.value);
    END;
    CREATE TABLE unrelated_partition_bytes (
      id INTEGER PRIMARY KEY,
      payload BLOB NOT NULL
    );
    INSERT INTO parents (id) VALUES (1);
    INSERT INTO workspace_rows
      (id, parent_id, unique_value, value, payload)
    VALUES (1, 1, 'anchor', 7, X'01');
  `);
  const insert = db.prepare(
    'INSERT INTO unrelated_partition_bytes (payload) VALUES (zeroblob(?))',
  );
  const batch = db.transaction(() => {
    for (let index = 0; index < FIXTURE_BATCH_ROWS; index += 1) {
      insert.run(FIXTURE_CHUNK_BYTES);
    }
  });
  let shape = databaseShape(db);
  while (shape.logicalBytes < targetMiB * BYTES_PER_MIB) {
    batch();
    shape = databaseShape(db);
  }
  db.pragma(SQL.WAL_CHECKPOINT_TRUNCATE);
  return {db, file, shape: databaseShape(db), targetMiB};
}

function createSerializedWorkspace(source) {
  const serializeStarted = performance.now();
  let image = source.db.serialize();
  const serializeMs = elapsedSince(serializeStarted);
  const headerBefore = {
    readVersion: image[SQLITE_HEADER.READ_VERSION_OFFSET],
    writeVersion: image[SQLITE_HEADER.WRITE_VERSION_OFFSET],
  };
  const normalizeStarted = performance.now();
  image[SQLITE_HEADER.READ_VERSION_OFFSET] =
    SQLITE_HEADER.ROLLBACK_JOURNAL_VERSION;
  image[SQLITE_HEADER.WRITE_VERSION_OFFSET] =
    SQLITE_HEADER.ROLLBACK_JOURNAL_VERSION;
  const normalizeMs = elapsedSince(normalizeStarted);
  const openStarted = performance.now();
  const db = new Database(image);
  const imageBytes = image.length;
  image = null;
  db.pragma(SQL.FOREIGN_KEYS_ON);
  db.exec(SQL.BEGIN);
  const openMs = elapsedSince(openStarted);
  return {
    db,
    counters: {
      baseBytesReadAtCreate: imageBytes,
      basePagesMaterializedAtCreate: source.shape.pageCount,
    },
    detail: {headerBefore, normalizeMs, openMs, serializeMs},
    finalize() {
      db.exec(SQL.COMMIT);
    },
    cleanup() {
      db.close();
    },
  };
}

function expectConstraintFailure(run, expectedCode) {
  try {
    run();
    return false;
  } catch (error) {
    return error.code === expectedCode;
  }
}

function executeTransactionFootprint(db, rowCount) {
  const insert = db.prepare(`
    INSERT INTO workspace_rows
      (id, parent_id, unique_value, value, payload)
    VALUES (?, 1, ?, ?, ?)
  `);
  const payload = Buffer.alloc(TRANSACTION_BLOB_BYTES, 7);
  for (let index = 0; index < rowCount; index += 1) {
    const id = index + 1000;
    insert.run(id, `tx-${id}`, index, payload);
  }
  db.prepare(SQL.EXPRESSION_UPDATE).run();
  const insertedAuditRows = db.prepare(
    'SELECT COUNT(*) AS count FROM workspace_audit WHERE row_id >= 1000',
  ).get().count;
  const blobBytes = db.prepare(
    'SELECT length(payload) AS bytes FROM workspace_rows WHERE id = 1000',
  ).get().bytes;
  const uniquenessHeld = expectConstraintFailure(() => {
    db.prepare(`
      INSERT INTO workspace_rows
        (id, parent_id, unique_value, value, payload)
      VALUES (?, 1, 'anchor', 0, X'02')
    `).run(rowCount + 10000);
  }, 'SQLITE_CONSTRAINT_UNIQUE');
  const foreignKeyHeld = expectConstraintFailure(() => {
    db.prepare(`
      INSERT INTO workspace_rows
        (id, parent_id, unique_value, value, payload)
      VALUES (?, 999, ?, 0, X'03')
    `).run(rowCount + 20000, `bad-parent-${rowCount}`);
  }, 'SQLITE_CONSTRAINT_FOREIGNKEY');
  return {blobBytes, foreignKeyHeld, insertedAuditRows, uniquenessHeld};
}

function measureWorkspaceCase(source, rowCount) {
  const canonicalBefore = source.db.prepare(
    'SELECT value FROM workspace_rows WHERE id = 1',
  ).get().value;
  const rssBefore = process.memoryUsage().rss;
  const creationStarted = performance.now();
  const workspace = createSerializedWorkspace(source);
  const workspaceCreationMs = elapsedSince(creationStarted);

  const readStarted = performance.now();
  const firstRead = workspace.db.prepare(
    'SELECT id, value FROM workspace_rows WHERE unique_value = ?',
  ).get('anchor');
  const firstReadMs = elapsedSince(readStarted);

  const writeStarted = performance.now();
  workspace.db.prepare(SQL.FIRST_WRITE).run();
  const firstWriteMs = elapsedSince(writeStarted);

  const executionStarted = performance.now();
  const semantics = executeTransactionFootprint(workspace.db, rowCount);
  const transactionExecutionMs = elapsedSince(executionStarted);

  const finalizeStarted = performance.now();
  workspace.finalize();
  const finalizationMs = elapsedSince(finalizeStarted);
  const rssWhileOpen = process.memoryUsage().rss;

  const cleanupStarted = performance.now();
  workspace.cleanup();
  const cleanupMs = elapsedSince(cleanupStarted);
  const canonicalAfter = source.db.prepare(
    'SELECT value FROM workspace_rows WHERE id = 1',
  ).get().value;

  return {
    authoritativeUnchanged: canonicalAfter === canonicalBefore,
    counters: workspace.counters,
    detail: workspace.detail,
    firstRead,
    phasesMs: {
      workspaceCreation: workspaceCreationMs,
      firstRead: firstReadMs,
      firstWrite: firstWriteMs,
      transactionExecution: transactionExecutionMs,
      finalization: finalizationMs,
      cleanup: cleanupMs,
    },
    resources: {
      rssBefore,
      rssWhileOpen,
      rssIncreaseBytes: Math.max(0, rssWhileOpen - rssBefore),
    },
    semantics,
    source: source.shape,
    targetMiB: source.targetMiB,
    transactionFootprint: {
      rows: rowCount,
      payloadBytes: rowCount * TRANSACTION_BLOB_BYTES,
    },
  };
}

function closeFixture(fixture) {
  fixture.db.close();
}

function ratio(numerator, denominator) {
  return Number((numerator / denominator).toFixed(METRIC_DECIMAL_PLACES));
}

/**
 * Calibrate the complexity witness against the rejected full-serialization
 * architecture. The result must classify it as total-state work without
 * relying on machine speed.
 * @returns {Object}
 */
export function runFullSerializeNegativeControl() {
  refuseUnderProbe(HARNESS_ACTIVITY);
  const parentDirectory = fs.mkdtempSync(path.join(os.tmpdir(), TEMP_PREFIX));
  const fixedTransaction = [];
  try {
    for (const targetMiB of TARGET_MIB) {
      const fixture = createFixture(parentDirectory, targetMiB);
      try {
        fixedTransaction.push(measureWorkspaceCase(
          fixture, FIXED_TRANSACTION_ROWS));
      } finally {
        closeFixture(fixture);
      }
    }
    const largeFixture = createFixture(
      parentDirectory, TARGET_MIB[0], 'small-base-large-transaction');
    let largeTransaction;
    try {
      largeTransaction = measureWorkspaceCase(
        largeFixture, LARGE_TRANSACTION_ROWS);
    } finally {
      closeFixture(largeFixture);
    }
    const smallest = fixedTransaction[0];
    const largest = fixedTransaction[fixedTransaction.length - 1];
    const databaseGrowthFactor = ratio(
      largest.source.logicalBytes, smallest.source.logicalBytes);
    const createReadGrowthFactor = ratio(
      largest.counters.baseBytesReadAtCreate,
      smallest.counters.baseBytesReadAtCreate);
    const totalStateScalingDetected = createReadGrowthFactor >=
      databaseGrowthFactor * 0.9;
    return {
      schema: REPORT_SCHEMA,
      host: os.hostname(),
      mechanism: NEGATIVE_CONTROL,
      classification: totalStateScalingDetected ?
        CLASSIFICATION.TOTAL_PARTITION_BYTES : CLASSIFICATION.NOT_DETECTED,
      complexity: {
        createReadGrowthFactor,
        databaseGrowthFactor,
        totalStateScalingDetected,
      },
      fixedTransaction,
      smallBaseLargeTransaction: largeTransaction,
    };
  } finally {
    fs.rmSync(parentDirectory, {recursive: true, force: true});
  }
}

export const BOUNDED_TRANSACTION_WORKSPACE_FALSIFIER = Object.freeze({
  FIXED_TRANSACTION_ROWS,
  LARGE_TRANSACTION_ROWS,
  NEGATIVE_CONTROL,
  REPORT_SCHEMA,
  SQLITE_HEADER,
  TARGET_MIB,
  TRANSACTION_BLOB_BYTES,
});
