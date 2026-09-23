import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';

import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';

import {AddressManager} from '../../src/address/address-manager.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {
  LEGACY_PARTITION_CONSENSUS_OUTCOME,
} from '../../src/partition/partition-legacy-consensus-state-constants.js';
import {RAFT_RS_SQL} from '../../src/raft/raft-rs-durable-store-constants.js';
import {
  requestSnapshotInstall,
  resolveReplicaCheckpointsRoot,
} from '../../src/raft/snapshot-install.js';
import {
  createSealedSourceGeneration,
} from './snapshot-catchup-fixture.js';
import {
  RAFT_SNAPSHOT_INSTALL_OUTCOME,
} from '../../src/raft/snapshot-install-constants.js';

// Snapshot catch-up end to end on the rs-raft partition path (quest
// raft-rs-single-path-partition-cutover, design S26/S27 and Q5/Q6).
//
// The former end-to-end scenarios (a fresh follower recovered behind an
// installed leader through dispatch -> transfer -> install -> recreate, and
// an installed follower resuming against a full-log leader) drove the retired
// backend's log adapter and its SNAPSHOT_CATCHUP_NEEDED decision, which the
// rs-raft operation port never emits. Snapshot/catch-up is unowned on the
// rs-raft store (epic raft-rs-full-cutover finding F5) and is its own quest.
//
// Until that quest re-owns install, the boot-time install still reconstructs
// the retired backend's consensus rows (a durable currentTerm and committed
// index) and writes no rs-raft record. Such a replica must not start on those
// rows: this witness pins that an installed replica database fails closed with
// the typed legacy-state outcome and brings up no consensus port.

const TABLE = 'catchup_rows';
const PARTITION_ID = 'catchup_rows-p1';
const TERM = 4;
const SEALED_EPOCH = 7;
const BOUNDARY_ENTRY_COUNT = 3;
const IDENTITY = Object.freeze({
  clusterId: 'cluster-incarnation-1234',
  raftGroupId: PARTITION_ID,
  entity: Object.freeze({kind: 'partition', id: TABLE}),
  membershipEpoch: SEALED_EPOCH,
});
const SCHEMA = Object.freeze({
  columns: [
    {name: 'id', type: 'TEXT', primaryKey: true},
    {name: 'payload', type: 'TEXT'},
  ],
});
const CREATE_TABLE_NAME = /CREATE TABLE IF NOT EXISTS\s+(\w+)/u;
// The rs-raft record's tables, read off the store owner's own DDL.
const RS_RAFT_RECORD_TABLES = Object.freeze(Object.entries(RAFT_RS_SQL)
  .filter(([key]) => key.startsWith('CREATE_'))
  .map(([, sql]) => sql.match(CREATE_TABLE_NAME)[1]));

beforeEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  AddressManager.resetInstance();
  ConfigurationManager.getInstance().initialize({
    node: {id: 'catchup-e2e-node'},
  });
  LoggingService.getInstance().initialize({level: 'error'});
});

afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  AddressManager.resetInstance();
});

function presentTables(dbPath, names) {
  const db = new Database(dbPath, {readonly: true});
  try {
    return names.filter((name) => db.prepare(
      'SELECT 1 FROM sqlite_master WHERE type = \'table\' AND name = ?')
      .get(name) !== undefined);
  } finally {
    db.close();
  }
}

test('a snapshot-installed replica without an rs-raft record fails closed ' +
  'with the typed legacy-state outcome', async (t) => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'catchup-e2e-'));
  const dbPath = path.join(workDir, 'partition', 'replica.db');
  fs.mkdirSync(path.dirname(dbPath), {recursive: true});
  const checkpointsRoot = resolveReplicaCheckpointsRoot(dbPath);
  let service = null;
  try {
    const generation = await createSealedSourceGeneration({
      workDir,
      checkpointsRoot,
      partitionId: PARTITION_ID,
      stateTable: TABLE,
      term: TERM,
      identity: IDENTITY,
      entryCount: BOUNDARY_ENTRY_COUNT,
    });
    const installed = await requestSnapshotInstall({
      replicaDbPath: dbPath,
      checkpointsRoot,
      generationIndex: generation.boundaryIndex,
      expectedIdentity: IDENTITY,
    });
    t.equal(installed.outcome, RAFT_SNAPSHOT_INSTALL_OUTCOME.INSTALLED,
      'fixture: the replica is snapshot-installed');

    const replicaId = `${PARTITION_ID}-r1`;
    service = new PartitionService({
      partitionId: PARTITION_ID,
      tableId: TABLE,
      tableName: TABLE,
      replicaId,
      replicaIds: [replicaId],
      nodeId: 'catchup-e2e-node',
      dbPath,
      schema: SCHEMA,
      deferElection: true,
    });
    let outcome = null;
    try {
      await service.initialize();
    } catch (error) {
      outcome = error;
    }
    t.ok(outcome instanceof Error,
      'the installed replica does not start on its legacy consensus rows');
    t.equal(outcome?.code, LEGACY_PARTITION_CONSENSUS_OUTCOME.DETECTED,
      `the refusal is the typed legacy-state outcome: ${outcome?.message}`);
    t.ok(Array.isArray(outcome?.reasons) && outcome.reasons.length > 0,
      'the refusal carries its reasons');
    t.equal(service.raft ?? null, null, 'no consensus port came up');
    t.same(presentTables(dbPath, RS_RAFT_RECORD_TABLES), [],
      'the refusal created no rs-raft record over the installed image');
  } finally {
    if (service && !service.isShutdown) {
      await service.shutdown().catch(() => {});
    }
    fs.rmSync(workDir, {recursive: true, force: true});
  }
});
