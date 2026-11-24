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
  RAFT_CHECKPOINT_DESCRIPTOR_FILE,
  RAFT_CHECKPOINT_ENVELOPE_VERSION,
  RAFT_CHECKPOINT_PAYLOAD_FILE,
  RAFT_CHECKPOINT_PAYLOAD_KIND,
  RAFT_CHECKPOINT_PAYLOAD_VERSION,
  RAFT_CHECKPOINT_VALIDATION_OUTCOME,
} from '../../src/raft/snapshot-checkpoint-constants.js';
import {
  requestSnapshotInstall,
  resolveReplicaCheckpointsRoot,
} from '../../src/raft/snapshot-install.js';
import {
  RAFT_SNAPSHOT_INSTALL_OUTCOME,
  RAFT_SNAPSHOT_INSTALL_REJECTION,
} from '../../src/raft/snapshot-install-constants.js';
import {
  sha256Digest,
  writeAtomicDurable,
} from '../../src/runtime/oci-host-agent-durable-files.js';
import {withFoundingStamp} from '../partition/partition-founding-stamp.js';

// Snapshot catch-up end to end rejection witnesses on the canonical raft-rs
// path: obsolete non-raft-rs checkpoints are refused at install time, and a
// replica database holding legacy consensus rows without an rs-raft record
// fails closed at PartitionService.initialize() without creating an rs-raft
// record.

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

test('legacy non-raft-rs checkpoint install is rejected and legacy consensus DB ' +
  'fails closed at PartitionService boot', async (t) => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'catchup-e2e-'));
  const dbPath = path.join(workDir, 'partition', 'replica.db');
  fs.mkdirSync(path.dirname(dbPath), {recursive: true});
  const checkpointsRoot = resolveReplicaCheckpointsRoot(dbPath);
  let service = null;
  try {
    const generationDir = path.join(checkpointsRoot, String(BOUNDARY_ENTRY_COUNT));
    fs.mkdirSync(generationDir, {recursive: true});
    const payloadPath = path.join(generationDir, RAFT_CHECKPOINT_PAYLOAD_FILE);
    const payloadDb = new Database(payloadPath);
    payloadDb.exec(`CREATE TABLE ${TABLE} (id TEXT PRIMARY KEY, payload TEXT)`);
    payloadDb.close();
    const payloadBytes = fs.readFileSync(payloadPath);
    writeAtomicDurable(
      path.join(generationDir, RAFT_CHECKPOINT_DESCRIPTOR_FILE),
      {
        envelopeVersion: RAFT_CHECKPOINT_ENVELOPE_VERSION,
        clusterId: IDENTITY.clusterId,
        raftGroupId: IDENTITY.raftGroupId,
        entity: IDENTITY.entity,
        membershipEpoch: IDENTITY.membershipEpoch,
        lastIncludedIndex: BOUNDARY_ENTRY_COUNT,
        lastIncludedTerm: TERM,
        maxCommittedHlc: '0',
        payloadKind: RAFT_CHECKPOINT_PAYLOAD_KIND.SQLITE_STATE_MACHINE_IMAGE,
        payloadVersion: RAFT_CHECKPOINT_PAYLOAD_VERSION[
          RAFT_CHECKPOINT_PAYLOAD_KIND.SQLITE_STATE_MACHINE_IMAGE],
        payloadByteLength: payloadBytes.length,
        payloadDigest: sha256Digest(payloadBytes),
      },
    );
    const installRefusal = await requestSnapshotInstall({
      replicaDbPath: dbPath,
      checkpointsRoot,
      generationIndex: BOUNDARY_ENTRY_COUNT,
      expectedIdentity: IDENTITY,
      expectedReplicaIdentity: `${PARTITION_ID}-r1`,
    });
    t.equal(installRefusal.outcome, RAFT_SNAPSHOT_INSTALL_OUTCOME.REJECTED,
      'legacy non-raft-rs checkpoint is refused at install');
    t.equal(installRefusal.reason,
      RAFT_SNAPSHOT_INSTALL_REJECTION.CHECKPOINT_INVALID,
      'refusal names checkpoint_invalid');
    t.equal(installRefusal.validationOutcome,
      RAFT_CHECKPOINT_VALIDATION_OUTCOME.UNSUPPORTED_PAYLOAD_KIND,
      'refusal names unsupported_payload_kind');
    t.notOk(fs.existsSync(dbPath),
      'refused legacy checkpoint never materializes a replica database');

    // Seed explicit legacy _raft_state consensus rows without an rs-raft record
    // and prove PartitionService.initialize() still fails closed.
    const legacyDb = new Database(dbPath);
    legacyDb.exec(
      'CREATE TABLE _raft_state (key TEXT PRIMARY KEY, value TEXT); ' +
      'INSERT INTO _raft_state (key, value) VALUES (\'currentTerm\', \'4\'); ' +
      'INSERT INTO _raft_state (key, value) VALUES (\'committedIndex\', \'3\');',
    );
    legacyDb.close();

    const replicaId = `${PARTITION_ID}-r1`;
    service = new PartitionService(withFoundingStamp({
      partitionId: PARTITION_ID,
      tableId: TABLE,
      tableName: TABLE,
      replicaId,
      replicaIds: [replicaId],
      nodeId: 'catchup-e2e-node',
      dbPath,
      schema: SCHEMA,
      deferElection: true,
    }));
    let outcome = null;
    try {
      await service.initialize();
    } catch (error) {
      outcome = error;
    }
    t.ok(outcome instanceof Error,
      'the replica does not start on legacy consensus rows');
    t.equal(outcome?.code, LEGACY_PARTITION_CONSENSUS_OUTCOME.DETECTED,
      `the refusal is the typed legacy-state outcome: ${outcome?.message}`);
    t.ok(Array.isArray(outcome?.reasons) && outcome.reasons.length > 0,
      'the refusal carries its reasons');
    t.equal(service.raft ?? null, null, 'no consensus port came up');
    t.same(presentTables(dbPath, RS_RAFT_RECORD_TABLES), [],
      'the refusal created no rs-raft record over the legacy image');
  } finally {
    if (service && !service.isShutdown) {
      await service.shutdown().catch(() => {});
    }
    fs.rmSync(workDir, {recursive: true, force: true});
  }
});
