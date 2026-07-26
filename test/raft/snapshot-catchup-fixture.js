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

/**
 * Build a source replica with `entryCount` committed+applied rows in
 * `stateTable` and seal a checkpoint generation into `checkpointsRoot`.
 * @param {Object} options {workDir, checkpointsRoot, partitionId,
 *   stateTable, term, identity, entryCount, inProcessPins}
 * @return {Promise<Object>} {created, sourceDbPath, boundaryIndex}
 */
async function createSealedSourceGeneration(options) {
  const {
    workDir, checkpointsRoot, partitionId, stateTable, term, identity,
    entryCount, inProcessPins,
  } = options;
  const sourceDbPath = path.join(workDir, 'source.db');
  const sourceDb = new Database(sourceDbPath);
  const adapter = new SQLiteLogAdapter(
    sourceDb, {address: partitionId, term});
  const storage = new PartitionRaftStorage(sourceDb, partitionId, adapter);
  sourceDb.exec(`CREATE TABLE IF NOT EXISTS ${stateTable} ` +
    '(id TEXT PRIMARY KEY, payload TEXT)');
  let lastEntry = null;
  for (let ordinal = 1; ordinal <= entryCount; ordinal += 1) {
    lastEntry = adapter.saveCommand({sql: `row-${ordinal}`}, term);
    adapter.commit(lastEntry.index);
    sourceDb.prepare(
      `INSERT INTO ${stateTable} (id, payload) VALUES (?, ?)`,
    ).run(`row-${ordinal}`, `payload-${ordinal}`);
    storage.recordAppliedAdvance();
  }
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
  createSealedSourceGeneration,
  installSealedGeneration,
};
