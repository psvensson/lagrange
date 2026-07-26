import path from 'node:path';

import Database from 'better-sqlite3';

import {SQLiteLogAdapter} from '../../src/raft/sqlite-log-adapter.js';
import {PartitionRaftStorage} from '../../src/partition/partition-raft-storage.js';
import {
  createSqliteStateMachineCheckpoint,
} from '../../src/raft/snapshot-checkpoint-store.js';
import {requestSnapshotInstall} from '../../src/raft/snapshot-install.js';
import {
  RAFT_SNAPSHOT_INSTALL_OUTCOME,
} from '../../src/raft/snapshot-install-constants.js';

// Shared S4 guard fixture (quest raft-snapshot-compacted-follower-catchup):
// build a SOURCE replica with committed+applied entries and seal one
// checkpoint generation from it (the S2 createInstallFixture shape), and
// install a sealed generation into a fresh replica database. Extracted so
// the dispatch, end-to-end, and recorded-gap guards share one copy.

// Fat-row payload shaping for the S6 scaled fixture: deterministic filler
// (no RNG) so re-runs digest identically.
const FIXTURE_PAYLOAD_FILL = 'x';
const FIXTURE_DEFAULT_LARGE_ROW_PAYLOAD_BYTES = 64 * 1024;

function buildRowPayload(ordinal, payloadBytes) {
  const base = `payload-${ordinal}`;
  if (!Number.isSafeInteger(payloadBytes) || payloadBytes <= base.length) {
    return base;
  }
  return base + FIXTURE_PAYLOAD_FILL.repeat(payloadBytes - base.length);
}

/**
 * Build a source replica with `entryCount` committed+applied rows in
 * `stateTable` and seal a checkpoint generation into `checkpointsRoot`.
 * The whole insert loop runs in ONE SQLite transaction so scaled (fat-row)
 * generations build in bounded wall-clock (S6 scaled fixture).
 * @param {Object} options {workDir, checkpointsRoot, partitionId,
 *   stateTable, term, identity, entryCount, inProcessPins, payloadBytes}
 *   payloadBytes: optional per-row payload size (fat rows)
 * @return {Promise<Object>} {created, sourceDbPath, boundaryIndex}
 */
async function createSealedSourceGeneration(options) {
  const {
    workDir, checkpointsRoot, partitionId, stateTable, term, identity,
    entryCount, inProcessPins, payloadBytes,
  } = options;
  const sourceDbPath = path.join(workDir, 'source.db');
  const sourceDb = new Database(sourceDbPath);
  const adapter = new SQLiteLogAdapter(
    sourceDb, {address: partitionId, term});
  const storage = new PartitionRaftStorage(sourceDb, partitionId, adapter);
  sourceDb.exec(`CREATE TABLE IF NOT EXISTS ${stateTable} ` +
    '(id TEXT PRIMARY KEY, payload TEXT)');
  let lastEntry = null;
  const insertStatement = sourceDb.prepare(
    `INSERT INTO ${stateTable} (id, payload) VALUES (?, ?)`);
  const insertAllRows = sourceDb.transaction(() => {
    for (let ordinal = 1; ordinal <= entryCount; ordinal += 1) {
      lastEntry = adapter.saveCommand({sql: `row-${ordinal}`}, term);
      adapter.commit(lastEntry.index);
      insertStatement.run(
        `row-${ordinal}`, buildRowPayload(ordinal, payloadBytes));
      storage.recordAppliedAdvance();
    }
  });
  insertAllRows();
  const created = await createSqliteStateMachineCheckpoint({
    db: sourceDb,
    identity,
    checkpointsRoot,
    inProcessPins,
  });
  sourceDb.close();
  return {created, sourceDbPath, boundaryIndex: lastEntry.index};
}

/**
 * Build a LARGE sealed generation (S6 multi-chunk fixture): fat rows sized
 * so the sealed payload spans many transfer chunks — tens of MiB at the
 * default row size. totalPayloadBytes is a floor on raw row bytes; the
 * sealed sqlite image carries page overhead on top.
 * @param {Object} options createSealedSourceGeneration options plus
 *   {totalPayloadBytes, rowPayloadBytes}
 * @return {Promise<Object>} {created, sourceDbPath, boundaryIndex,
 *   entryCount, rowPayloadBytes}
 */
async function createLargeSealedSourceGeneration(options) {
  const rowPayloadBytes = options.rowPayloadBytes ||
    FIXTURE_DEFAULT_LARGE_ROW_PAYLOAD_BYTES;
  const entryCount = Math.ceil(options.totalPayloadBytes / rowPayloadBytes);
  const generation = await createSealedSourceGeneration({
    ...options,
    entryCount,
    payloadBytes: rowPayloadBytes,
  });
  return {...generation, entryCount, rowPayloadBytes};
}

/**
 * Install one sealed generation into a fresh replica database, throwing on
 * any non-INSTALLED outcome (fixture failure, not an assertion subject).
 * @param {Object} options {replicaDbPath, checkpointsRoot, generationIndex,
 *   identity}
 * @return {Promise<Object>} the typed install result
 */
async function installSealedGeneration(options) {
  const {replicaDbPath, checkpointsRoot, generationIndex, identity} = options;
  const installed = await requestSnapshotInstall({
    replicaDbPath,
    checkpointsRoot,
    generationIndex,
    expectedIdentity: identity,
  });
  if (installed.outcome !== RAFT_SNAPSHOT_INSTALL_OUTCOME.INSTALLED) {
    throw new Error(`install fixture failed: ${installed.outcome}`);
  }
  return installed;
}

export {
  createLargeSealedSourceGeneration,
  createSealedSourceGeneration,
  installSealedGeneration,
};
