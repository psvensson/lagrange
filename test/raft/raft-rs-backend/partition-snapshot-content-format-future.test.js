/**
 * Future-green direct checkpoint content/format owner witnesses. No
 * registered callback, native publication, transfer or receiver is invoked.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import Database from 'better-sqlite3';

import {ConfigurationManager} from
  '../../../src/config/configuration-manager.js';
import {LoggingService} from '../../../src/logging/logging-service.js';
import {PartitionService} from '../../../src/partition/partition-service.js';
import * as CheckpointConstants from
  '../../../src/raft/snapshot-checkpoint-constants.js';
import {
  RAFT_CHECKPOINT_CREATION_OUTCOME,
  RAFT_CHECKPOINT_DESCRIPTOR_FILE,
  RAFT_CHECKPOINT_PAYLOAD_FILE,
  RAFT_CHECKPOINT_VALIDATION_OUTCOME,
} from '../../../src/raft/snapshot-checkpoint-constants.js';
import * as SnapshotCheckpointFormat from
  '../../../src/raft/snapshot-checkpoint-format.js';
import {
  createSqliteStateMachineCheckpoint,
  readCheckpoint,
} from '../../../src/raft/snapshot-checkpoint-store.js';
import {RAFT_RS_TABLE} from
  '../../../src/raft/raft-rs-durable-store-constants.js';
import {RaftRsDurableStore} from
  '../../../src/raft/raft-rs-durable-store.js';
import {RaftRsPeerIdentityRegistry, readRaftRsPeerIdentityReservations} from
  '../../../src/raft/raft-rs-peer-identity.js';
import {RAFT_MEMBERSHIP_OPERATION, RAFT_OPERATION_OUTCOME} from
  '../../../src/raft/raft-operation-port-constants.js';
import {PartitionNodeCluster} from './partition-node-cluster.js';
import {assertSnapshotCodecContract} from './snapshot-content-codec-fixture.js';
import {requestSnapshotInstall} from '../../../src/raft/snapshot-install.js';
import * as SnapshotInstallConstants from
  '../../../src/raft/snapshot-install-constants.js';
import {ReplicaCreateAdmissionOwner} from
  '../../../src/node/replica-create-admission-owner.js';
import {OperationType} from '../../../src/rebalancer/replica-status.js';
import {withFoundingStamp} from
  '../../partition/partition-founding-stamp.js';

const NODE_ID = 'snapshot-r1-r2-node';
const PARTITION_ID = 'snapshot_r1_r2-p1';
const REPLICA_ID = `${PARTITION_ID}-r1`;
const FRESH_REPLICA_ID = `${PARTITION_ID}-fresh-learner`;
const TABLE_NAME = 'snapshot_r1_r2';
const ROW_ID = 'acknowledged-snapshot-row';
const INDEX_NAME = 'snapshot_r1_r2_payload_idx';
const VIEW_NAME = 'snapshot_r1_r2_view';
const TRIGGER_NAME = 'snapshot_r1_r2_update_trigger';
const AUTOINCREMENT_TABLE = 'snapshot_r1_r2_sequence';
const COMMITTED_SESSION = 'snapshot-r1-r2-committed';
const PUBLICATION_EPOCH = 9;
const TEST_TIMEOUT_MS = 30_000;
const AUTHORITATIVE_CLUSTER_ID = 'snapshot-r1-r2-cluster';

function initializeEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: NODE_ID}});
  LoggingService.getInstance().initialize({level: 'error'});
}

async function waitFor(predicate, message) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(message);
}

function identity(membershipEpoch = PUBLICATION_EPOCH) {
  return {
    clusterId: AUTHORITATIVE_CLUSTER_ID,
    raftGroupId: PARTITION_ID,
    entity: {kind: 'partition', id: TABLE_NAME},
    membershipEpoch,
  };
}

function sourceRow(db) {
  return db.prepare(`SELECT id, payload FROM ${TABLE_NAME} WHERE id = ?`)
    .get(ROW_ID);
}

function tableExists(db, tableName) {
  return db.prepare(
    'SELECT 1 FROM sqlite_master WHERE type = ? AND name = ?')
    .get('table', tableName) !== undefined;
}

const MANIFEST_TABLE = 'raft_rs_checkpoint_manifest';
const MANIFEST_COLUMNS = Object.freeze(['singleton', 'manifest_json']);
const MANIFEST_KEYS = Object.freeze([
  'manifestVersion', 'clusterId', 'raftGroupId', 'entity',
  'lastIncludedIndex', 'lastIncludedTerm', 'maxCommittedHlc',
  'payloadKind', 'payloadVersion', 'raftRs', 'applicationSchema',
  'sqliteSequences',
]);
const RAFT_RS_REPLICA_IMAGE_PAYLOAD_VERSION_V2 = 2;

function exactColumnNames(db, tableName) {
  return db.prepare(`PRAGMA table_info(${tableName})`).all()
    .map((column) => column.name);
}

function readPayloadManifest(payload) {
  assert.equal(tableExists(payload, MANIFEST_TABLE), true,
    'NOT_REACHED today: sealed payload-owned raft-rs checkpoint manifest ' +
    'is required before canonical generation tamper can be validated');
  assert.deepEqual(exactColumnNames(payload, MANIFEST_TABLE),
    MANIFEST_COLUMNS,
    'v2 manifest uses only singleton and canonical manifest_json columns');
  const rows = payload.prepare(
    `SELECT singleton, manifest_json FROM ${MANIFEST_TABLE}`).all();
  assert.equal(rows.length, 1,
    'sealed payload-owned manifest is a singleton authority record');
  assert.equal(rows[0].singleton, 1,
    'manifest singleton key is exactly 1');
  assert.equal(typeof rows[0].manifest_json, 'string',
    'manifest_json is canonical UTF-8 JSON text');
  assert.equal(rows[0].manifest_json.endsWith('\n'), true,
    'manifest_json stores canonical JSON with trailing newline');
  const manifest = JSON.parse(rows[0].manifest_json);
  const canonicalSnapshotJsonBytes =
    SnapshotCheckpointFormat.canonicalSnapshotJsonBytes;
  assert.equal(typeof canonicalSnapshotJsonBytes, 'function',
    'future snapshot format exports its bounded canonical codec');
  assert.equal(canonicalSnapshotJsonBytes(manifest).toString('utf8'),
    rows[0].manifest_json,
    'manifest_json bytes are the owner canonical JSON representation');
  assert.deepEqual(Object.keys(manifest).sort(), [...MANIFEST_KEYS].sort(),
    'manifest JSON has the exact v2 owner key set, no aliases');
  return manifest;
}

function canonicalSnapshotBytes(value) {
  const encode = SnapshotCheckpointFormat.canonicalSnapshotJsonBytes;
  assert.equal(typeof encode, 'function',
    'future snapshot format owns one bounded M/D/N codec');
  return encode(value);
}

function applicationSchemaInventory(db) {
  const ownedTables = [TABLE_NAME, AUTOINCREMENT_TABLE, VIEW_NAME,
    '_transaction_outcomes', '_partition_statement_outcomes'];
  const placeholders = ownedTables.map(() => '?').join(', ');
  return db.prepare(
    'SELECT type, name, tbl_name AS tableName, sql FROM sqlite_schema ' +
    `WHERE tbl_name IN (${placeholders}) AND type IN ` +
    '(\'table\', \'index\', \'trigger\', \'view\') ' +
    'ORDER BY type, name').all(...ownedTables);
}

function sqliteSequenceInventory(db) {
  if (!tableExists(db, 'sqlite_sequence')) return [];
  return db.prepare(
    'SELECT name AS tableName, CAST(seq AS TEXT) AS sequence ' +
    'FROM sqlite_sequence WHERE name = ? ORDER BY name')
    .all(AUTOINCREMENT_TABLE);
}

function numericPeerOrder(left, right) {
  return BigInt(left) < BigInt(right) ? -1 : BigInt(left) > BigInt(right) ? 1 : 0;
}

function canonicalObservedConfState(confState) {
  return {...confState, ...Object.fromEntries([
    'voters', 'learners', 'votersOutgoing', 'learnersNext',
  ].map((field) => [field, [...confState[field]].sort(numericPeerOrder)]))};
}

function assertV2ManifestMatchesDescriptor(manifest, descriptor, sourceDb) {
  assert.equal(manifest.manifestVersion, 1);
  assert.equal(manifest.clusterId, descriptor.clusterId);
  assert.equal(manifest.raftGroupId, descriptor.raftGroupId);
  assert.deepEqual(manifest.entity, descriptor.entity);
  assert.equal(Object.hasOwn(manifest, 'membershipEpoch'), false,
    'immutable manifest deliberately excludes routing publication epoch');
  assert.equal(manifest.lastIncludedIndex, descriptor.lastIncludedIndex);
  assert.equal(manifest.lastIncludedTerm, descriptor.lastIncludedTerm);
  assert.equal(manifest.maxCommittedHlc, descriptor.maxCommittedHlc);
  assert.equal(manifest.payloadKind, descriptor.payloadKind);
  assert.equal(manifest.payloadVersion, RAFT_RS_REPLICA_IMAGE_PAYLOAD_VERSION_V2,
    'v2 application-complete native images advertise payloadVersion 2');
  assert.equal(descriptor.payloadVersion,
    RAFT_RS_REPLICA_IMAGE_PAYLOAD_VERSION_V2,
    'outer descriptor advertises payloadVersion 2');
  assert.deepEqual(manifest.raftRs, descriptor.raftRs,
    'manifest and descriptor share exact raft-rs boundary facts before tamper');
  const sourceRecord = RaftRsDurableStore.readDurableRecordIn(
    sourceDb, PARTITION_ID);
  assert.equal(descriptor.raftRs.appliedIndex, sourceRecord.appliedIndex);
  assert.equal(descriptor.raftRs.membershipGenerationIndex,
    sourceRecord.membershipGenerationIndex);
  assert.deepEqual(descriptor.raftRs.confState,
    canonicalObservedConfState(sourceRecord.confState));
  assert.deepEqual(descriptor.raftRs.peerReservations,
    [...readRaftRsPeerIdentityReservations(sourceDb)]
      .sort((left, right) => numericPeerOrder(left.peerId, right.peerId)));
  assert.equal(String(descriptor.lastIncludedIndex), sourceRecord.appliedIndex);
  const boundary = sourceDb.prepare('SELECT term FROM _raft_rs_log ' +
    'WHERE group_id = ? AND log_index = ?')
    .get(PARTITION_ID, sourceRecord.appliedIndex);
  assert.ok(boundary, 'live source still owns the exact applied log boundary');
  assert.equal(String(descriptor.lastIncludedTerm), String(boundary.term));
  assert.equal(descriptor.raftRs.appliedTerm, String(boundary.term));
  assert.deepEqual(manifest.applicationSchema,
    applicationSchemaInventory(sourceDb),
    'manifest owns exact tables, indexes, implicit indexes and outcome schema');
  assert.deepEqual(manifest.sqliteSequences,
    sqliteSequenceInventory(sourceDb),
    'manifest preserves deleted AUTOINCREMENT high-water exactly');
}

function statementOutcomes(db) {
  return db.prepare('SELECT * FROM _partition_statement_outcomes ' +
    'ORDER BY entry_key').all();
}

function assertApplicationPayload(payload, source) {
  assert.deepEqual(applicationSchemaInventory(payload),
    applicationSchemaInventory(source),
    'actual payload schema and indexes equal source, independently of M');
  assert.deepEqual(sourceRow(payload), {
    id: ROW_ID, payload: 'acknowledged-before-snapshot',
  }, 'payload contains the acknowledged application row, not declarations only');
  assert.deepEqual(payload.prepare(`SELECT * FROM ${VIEW_NAME}`).all(),
    source.prepare(`SELECT * FROM ${VIEW_NAME}`).all(),
    'copied declared application view resolves to the same rows');
  assert.equal(payload.prepare(
    'SELECT outcome FROM _transaction_outcomes WHERE session_id = ?')
    .get(COMMITTED_SESSION)?.outcome, 'COMMITTED',
  'payload contains committed retry outcome data');
  assert.deepEqual(payload.prepare(
    `SELECT sequence_id, payload FROM ${AUTOINCREMENT_TABLE} ` +
    'ORDER BY sequence_id').all(), [
    {sequence_id: 1, payload: 'sequence-1'},
    {sequence_id: 2, payload: 'sequence-2'},
  ], 'payload contains surviving AUTOINCREMENT rows exactly');
  assert.equal(payload.prepare(
    'SELECT seq FROM sqlite_sequence WHERE name = ?')
    .get(AUTOINCREMENT_TABLE)?.seq, 3,
  'payload contains deleted-row AUTOINCREMENT high-water');
  const outcomes = statementOutcomes(source);
  assert.ok(outcomes.length > 0, 'real source committed outcomes are nonempty');
  assert.deepEqual(statementOutcomes(payload), outcomes,
    'payload preserves exact committed statement outcomes and replay results');
  assert.deepEqual(payload.prepare('SELECT * FROM _transaction_outcomes ' +
    'ORDER BY session_id').all(), source.prepare(
    'SELECT * FROM _transaction_outcomes ORDER BY session_id').all());
}

function mutateCanonicalWrongGeneration(checkpointDir, originalDescriptor) {
  const mutatedDir = path.join(
    path.dirname(checkpointDir),
    `${path.basename(checkpointDir)}-wrong-generation`);
  fs.cpSync(checkpointDir, mutatedDir, {recursive: true});
  const descriptorFile = path.join(mutatedDir,
    RAFT_CHECKPOINT_DESCRIPTOR_FILE);
  const mutated = JSON.parse(fs.readFileSync(descriptorFile, 'utf8'));
  const current = String(originalDescriptor.raftRs.membershipGenerationIndex);
  mutated.raftRs.membershipGenerationIndex = current === '0' ? '1' : '0';
  fs.writeFileSync(descriptorFile, canonicalSnapshotBytes(mutated));
  return mutatedDir;
}

function durableRecord(observer) {
  const record = RaftRsDurableStore.readDurableRecordIn(
    observer, PARTITION_ID);
  assert.notEqual(record.hardState, null,
    'test-owned observer sees a real durable HardState');
  assert.equal(record.membershipGenerationIndex, '0',
    'test-owned observer sees canonical durable generation zero');
  const appliedIndex = Number(record.appliedIndex);
  assert.equal(Number.isSafeInteger(appliedIndex), true,
    'dispatch boundary is exactly representable by its current API');
  return {record, appliedIndex};
}

async function closeFixtureResources({root, service, observer}) {
  const errors = [];
  try {
    observer?.close();
  } catch (error) {
    errors.push(error);
  }
  try {
    await service?.shutdown();
  } catch (error) {
    errors.push(error);
  }
  try {
    fs.rmSync(root, {recursive: true, force: true});
  } catch (error) {
    errors.push(error);
  }
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  if (errors.length > 0) {
    throw new AggregateError(errors, 'snapshot fixture cleanup failed');
  }
}

async function createFixture() {
  initializeEnvironment();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'snapshot-content-'));
  const dbPath = path.join(root, `${REPLICA_ID}.db`);
  let service;
  let observer;
  try {
    service = new PartitionService(withFoundingStamp({
      partitionId: PARTITION_ID,
      tableId: TABLE_NAME,
      tableName: TABLE_NAME,
      replicaId: REPLICA_ID,
      replicaIds: [REPLICA_ID],
      nodeId: NODE_ID,
      dbPath,
      schema: {tableName: TABLE_NAME, columns: [
        {name: 'id', type: 'TEXT', primaryKey: true},
        {name: 'payload', type: 'TEXT', notNull: true},
      ], indices: [{name: INDEX_NAME, columns: ['payload']}]},
    }));
    await service.initialize();
    observer = new Database(dbPath, {readonly: true, fileMustExist: true});
    await waitFor(() => service.getRole() === 'leader',
      'single-voter partition did not elect a leader');
    assert.equal((await service.insertData(TABLE_NAME, {
      id: ROW_ID, payload: 'acknowledged-before-snapshot',
    })).success, true);
    await waitFor(() => sourceRow(observer)?.payload ===
      'acknowledged-before-snapshot', 'application row did not become durable');
    assert.equal((await service.beginTransaction(COMMITTED_SESSION, 1)).success,
      true);
    assert.equal((await service.commitTransaction(COMMITTED_SESSION)).success,
      true);
    await waitFor(() => observer.prepare(
      'SELECT outcome FROM _transaction_outcomes WHERE session_id = ?')
      .get(COMMITTED_SESSION)?.outcome === 'COMMITTED',
    'transaction outcome did not become durable');
    assert.equal((await service.executeQuery(
      `CREATE TABLE ${AUTOINCREMENT_TABLE} (` +
      'sequence_id INTEGER PRIMARY KEY AUTOINCREMENT, payload TEXT NOT NULL)'))
      .success, true);
    for (const sequence of [1, 2, 3]) {
      assert.equal((await service.executeQuery(
        `INSERT INTO ${AUTOINCREMENT_TABLE} (payload) VALUES (?)`,
        [`sequence-${sequence}`])).success, true);
    }
    assert.equal((await service.executeQuery(
      `DELETE FROM ${AUTOINCREMENT_TABLE} WHERE sequence_id = ?`, [3]))
      .success, true);
    await waitFor(() => observer.prepare(
      'SELECT seq FROM sqlite_sequence WHERE name = ?')
      .get(AUTOINCREMENT_TABLE)?.seq === 3,
    'AUTOINCREMENT high-water did not become durable');
    assert.equal((await service.executeQuery(
      `CREATE VIEW ${VIEW_NAME} AS SELECT id, payload FROM ${TABLE_NAME}`))
      .success, true, 'application view is admitted through replicated DDL');
    assert.equal((await service.executeQuery(
      `CREATE TRIGGER ${TRIGGER_NAME} AFTER UPDATE ON ${TABLE_NAME} ` +
      'BEGIN SELECT 1; END')).success, true,
    'application-only trigger is admitted through replicated DDL');
    durableRecord(observer);
    assert.ok(statementOutcomes(observer).length > 0,
      'fixture reached committed statement outcome owner before checkpoint');
  } catch (error) {
    try {
      await closeFixtureResources({root, service, observer});
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError],
        'snapshot fixture setup and cleanup failed');
    }
    throw error;
  }
  return {root, dbPath, service, observer, async close() {
    await closeFixtureResources({root, service, observer});
  }};
}

function createAdmission() {
  const row = {operation_id: 'content-v2-create-refusal',
    type: OperationType.REPLACE, entity_type: 'partition',
    entity_id: PARTITION_ID, partition_id: PARTITION_ID,
    replica_id: FRESH_REPLICA_ID, target_node_id: NODE_ID,
    workflow_step: 'SENDING', updated_at: 11, completed_at: null,
    create_admission_state: null, create_admission_token: null,
    create_admission_replica_created_at: null,
    create_admission_attempt_token: null,
    create_admission_previous_attempt_token: null,
    create_admission_attempt_seq: null,
    create_admission_workflow_updated_at: null,
    create_admission_owner_incarnation: null};
  const gateway = {
    async readAuthoritativeRows(_table, sql, params) {
      if (sql.includes('FROM nodes')) {
        return {success: true, rows: [{
          node_id: NODE_ID, boot_incarnation: 7,
        }]};
      }
      if (sql.includes('WHERE operation_id = ?')) {
        return {success: true, rows: params[0] === row.operation_id ?
          [row] : []};
      }
      return {success: true, rows: [row]};
    },
    async updateSystemTableRow(_table, where, data) {
      if (!Object.entries(where).every(([key, value]) => row[key] === value)) {
        return {success: true, outcome: 'no_op'};
      }
      Object.assign(row, data);
      return {success: true, outcome: 'applied'};
    },
  };
  const owner = new ReplicaCreateAdmissionOwner({
    gateway, nodeId: NODE_ID, ownerIncarnation: 7, now: () => 20,
  });
  const request = {operationId: row.operation_id, operationType: row.type,
    entityType: row.entity_type, entityId: row.entity_id,
    partitionId: row.partition_id, replicaId: row.replica_id,
    admissionToken: 'content-v2-admission', attemptToken: 'content-v2-attempt',
    attemptSeq: 1, workflowUpdatedAt: 11};
  return {owner, request, row};
}

test('R2 publication epoch 9 and durable group generation 0 validate ' +
  'independently while corrupt and foreign inputs refuse',
{timeout: TEST_TIMEOUT_MS}, async () => {
  const fixture = await createFixture();
  try {
    const checkpointsRoot = path.join(fixture.root, 'r2-checkpoints');
    const created = await createSqliteStateMachineCheckpoint({
      db: fixture.observer,
      identity: identity(PUBLICATION_EPOCH),
      checkpointsRoot,
      raftRsGroupId: PARTITION_ID,
    });
    assert.equal(created.outcome, RAFT_CHECKPOINT_CREATION_OUTCOME.CREATED,
      'readonly owner input can be backed up into private checkpoint staging');
    const descriptor = created.descriptor;
    assert.equal(descriptor.membershipEpoch, PUBLICATION_EPOCH);
    assert.equal(descriptor.raftRs.membershipGenerationIndex, '0',
      'publication and group generation retain distinct owner values');
    const expected = readCheckpoint({
      checkpointDir: created.checkpointDir,
      expectedIdentity: identity(PUBLICATION_EPOCH),
    });
    assert.equal(expected.outcome, RAFT_CHECKPOINT_VALIDATION_OUTCOME.VALID,
      'independently valid publication and group generations are accepted');

    const foreign = readCheckpoint({
      checkpointDir: created.checkpointDir,
      expectedIdentity: {...identity(PUBLICATION_EPOCH),
        raftGroupId: 'foreign-snapshot-group'},
    });
    assert.equal(foreign.outcome,
      RAFT_CHECKPOINT_VALIDATION_OUTCOME.FOREIGN_GROUP);

    const stalePublication = readCheckpoint({
      checkpointDir: created.checkpointDir,
      expectedIdentity: identity(PUBLICATION_EPOCH + 1),
    });
    assert.equal(stalePublication.outcome,
      RAFT_CHECKPOINT_VALIDATION_OUTCOME.STALE_EPOCH);

    const corruptRoot = path.join(fixture.root, 'r2-corrupt');
    const corruptDir = path.join(corruptRoot,
      String(descriptor.lastIncludedIndex));
    fs.cpSync(created.checkpointDir, corruptDir, {recursive: true});
    const descriptorFile = path.join(corruptDir,
      RAFT_CHECKPOINT_DESCRIPTOR_FILE);
    const corruptDescriptor = JSON.parse(
      fs.readFileSync(descriptorFile, 'utf8'));
    const before = fs.readFileSync(descriptorFile, 'utf8');
    const token = '"membershipGenerationIndex":"0"';
    assert.equal(before.split(token).length, 2, 'one exact generation token');
    const malformed = before.replace(token,
      '"membershipGenerationIndex":"00"');
    fs.writeFileSync(descriptorFile, malformed);
    const reparsed = JSON.parse(malformed);
    reparsed.raftRs.membershipGenerationIndex = '0';
    assert.deepEqual(reparsed, corruptDescriptor,
      'the adversarial byte edit changes only the generation spelling');
    const corrupt = readCheckpoint({
      checkpointDir: corruptDir,
      expectedIdentity: identity(PUBLICATION_EPOCH),
    });
    assert.equal(corrupt.outcome,
      RAFT_CHECKPOINT_VALIDATION_OUTCOME.CORRUPT_DESCRIPTOR);
  } finally {
    await fixture.close();
  }
});

test('R2 canonical wrong generation is bound to sealed payload manifest',
  {timeout: TEST_TIMEOUT_MS}, async () => {
    const fixture = await createFixture();
    try {
      const created = await createSqliteStateMachineCheckpoint({
        db: fixture.observer,
        identity: identity(PUBLICATION_EPOCH),
        checkpointsRoot: path.join(fixture.root, 'r2-generation-binding'),
        raftRsGroupId: PARTITION_ID,
      });
      assert.equal(created.outcome, RAFT_CHECKPOINT_CREATION_OUTCOME.CREATED);
      const payloadPath = path.join(created.checkpointDir,
        RAFT_CHECKPOINT_PAYLOAD_FILE);
      const payloadBytes = fs.readFileSync(payloadPath);
      const payloadDigest = created.descriptor.payloadDigest;
      const payload = new Database(payloadPath,
        {readonly: true, fileMustExist: true});
      try {
        assert.equal(fs.existsSync(payloadPath), true,
          'sealed payload exists before manifest binding validation');
        for (const localTable of [...Object.values(RAFT_RS_TABLE),
          '_raft_rs_replica_lifecycle']) {
          assert.equal(tableExists(payload, localTable), false,
            `payload excludes sender-local table ${localTable}`);
        }
        const manifest = readPayloadManifest(payload);
        assertV2ManifestMatchesDescriptor(
          manifest, created.descriptor, fixture.observer);
        assertApplicationPayload(payload, fixture.observer);
        assert.equal(manifest.raftRs.groupId, PARTITION_ID,
          'payload manifest binds the canonical raft group');
        assert.equal(manifest.raftRs.membershipGenerationIndex, '0',
          'payload manifest owns durable generation independently of epoch');
      } finally {
        payload.close();
      }

      const valid = readCheckpoint({
        checkpointDir: created.checkpointDir,
        expectedIdentity: identity(PUBLICATION_EPOCH),
      });
      assert.equal(valid.outcome, RAFT_CHECKPOINT_VALIDATION_OUTCOME.VALID,
        'sealed v2 manifest and descriptor agree before tamper');
      const mutatedDir = mutateCanonicalWrongGeneration(
        created.checkpointDir, created.descriptor);
      const mutatedPayloadPath = path.join(mutatedDir,
        RAFT_CHECKPOINT_PAYLOAD_FILE);
      assert.deepEqual(fs.readFileSync(mutatedPayloadPath), payloadBytes,
        'canonical wrong-generation mutation leaves payload bytes unchanged');
      const mutatedDescriptor = JSON.parse(fs.readFileSync(path.join(
        mutatedDir, RAFT_CHECKPOINT_DESCRIPTOR_FILE), 'utf8'));
      assert.notEqual(mutatedDescriptor.payloadDigest, undefined);
      assert.equal(mutatedDescriptor.payloadDigest, payloadDigest,
        'canonical wrong-generation mutation preserves payload digest');
      assert.equal(mutatedDescriptor.payloadVersion,
        RAFT_RS_REPLICA_IMAGE_PAYLOAD_VERSION_V2,
        'mutated descriptor remains a v2 application-complete native image');
      assert.equal(mutatedDescriptor.membershipEpoch, PUBLICATION_EPOCH,
        'mutation does not alter routing publication epoch');
      assert.equal(mutatedDescriptor.raftRs.membershipGenerationIndex, '1',
        'mutation is canonical decimal wrong generation, not malformed input');
      const structural = SnapshotCheckpointFormat.validateCheckpointDescriptor(
        mutatedDescriptor);
      assert.equal(structural.outcome,
        RAFT_CHECKPOINT_VALIDATION_OUTCOME.VALID,
        'pure descriptor validation accepts generation1 with publication epoch9');
      const wrongGeneration = readCheckpoint({
        checkpointDir: mutatedDir,
        expectedIdentity: identity(PUBLICATION_EPOCH),
      });
      const manifestGenerationMismatchReason =
        CheckpointConstants.RAFT_RS_CHECKPOINT_REASON
          ?.MANIFEST_GENERATION_MISMATCH;
      assert.equal(typeof manifestGenerationMismatchReason, 'string',
        'owner exports the manifest generation mismatch reason');
      assert.equal(wrongGeneration.outcome,
        RAFT_CHECKPOINT_VALIDATION_OUTCOME.CORRUPT_PAYLOAD,
        'well-shaped descriptor generation mismatch is a payload binding error');
      assert.deepEqual(wrongGeneration.reasons, [
        manifestGenerationMismatchReason,
      ], 'wrong generation reports the owner manifest mismatch reason');
    } finally {
      await fixture.close();
    }
  });

test('v2.3 codec owns bounded hostile input and exact native N bytes',
  {timeout: TEST_TIMEOUT_MS}, async () => {
    assert.equal(typeof SnapshotCheckpointFormat.canonicalSnapshotJsonBytes,
      'function', 'future owned codec must exist; absence never skips');
    const fixture = await createFixture();
    try {
      const created = await createSqliteStateMachineCheckpoint({
        db: fixture.observer, identity: identity(),
        checkpointsRoot: path.join(fixture.root, 'codec-source'),
        raftRsGroupId: PARTITION_ID,
      });
      assert.equal(created.outcome, RAFT_CHECKPOINT_CREATION_OUTCOME.CREATED);
      assert.equal(created.descriptor.payloadVersion, 2);
      const payload = new Database(path.join(created.checkpointDir,
        RAFT_CHECKPOINT_PAYLOAD_FILE), {readonly: true, fileMustExist: true});
      try {
        assertSnapshotCodecContract({descriptor: created.descriptor,
          manifest: readPayloadManifest(payload), root: fixture.root});
      } finally {
        payload.close();
      }
    } finally {
      await fixture.close();
    }
  });

test('fresh CREATE owner typed-refuses an owner-produced v2 image',
  {timeout: TEST_TIMEOUT_MS}, async () => {
    const cluster = new PartitionNodeCluster({partitionId: PARTITION_ID,
      replicaIds: [REPLICA_ID]});
    let observer = null;
    let admission = null;
    let worker = null;
    try {
      const source = cluster.replica(REPLICA_ID);
      // Test-owned initial application schema. Consensus membership below
      // is produced by the live operation port, never by SQL mutation.
      source.db.exec(`DROP TABLE services; CREATE TABLE ${TABLE_NAME} (` +
        'id TEXT PRIMARY KEY, payload TEXT NOT NULL)');
      assert.equal(cluster.node(REPLICA_ID).campaign().outcome,
        RAFT_OPERATION_OUTCOME.CORE_OK);
      assert.ok(cluster.settle(() => cluster.leaderReplicaId() === REPLICA_ID));
      const peerId = new RaftRsPeerIdentityRegistry(source.db)
        .registerReplica(FRESH_REPLICA_ID);
      const proposed = cluster.node(REPLICA_ID).proposeConfChange({
        type: RAFT_MEMBERSHIP_OPERATION.ADD_LEARNER,
        replicaIdentity: FRESH_REPLICA_ID,
      });
      assert.equal(proposed.outcome, RAFT_OPERATION_OUTCOME.CORE_OK);
      assert.ok(cluster.settle(() =>
        cluster.node(REPLICA_ID).readStatus().confState.learners
          .includes(peerId)), 'real native ADD_LEARNER commits');
      observer = new Database(source.dbFile,
        {readonly: true, fileMustExist: true});
      const durable = RaftRsDurableStore.readDurableRecordIn(
        observer, PARTITION_ID);
      assert.ok(durable.confState.learners.includes(peerId));
      assert.ok(!durable.confState.voters.includes(peerId));
      admission = createAdmission();
      const evidence = await admission.owner.claim(admission.request);
      worker = await admission.owner.claimPhysicalWorker(evidence);
      assert.ok(worker);
      assert.equal(await admission.owner.revalidatePhysicalWorker(worker,
        evidence), true, 'real current worker is valid before version gate');
      assert.equal(admission.row.completed_at, null);
      const checkpointsRoot = path.join(cluster.directory, 'v2-create');
      const created = await createSqliteStateMachineCheckpoint({
        db: observer, identity: identity(), checkpointsRoot,
        raftRsGroupId: PARTITION_ID,
      });
      assert.equal(created.outcome, RAFT_CHECKPOINT_CREATION_OUTCOME.CREATED);
      assert.equal(created.descriptor.payloadVersion, 2,
        'version control uses an owner-produced v2 artifact');
      assert.equal(readCheckpoint({checkpointDir: created.checkpointDir,
        expectedIdentity: identity()}).outcome,
      RAFT_CHECKPOINT_VALIDATION_OUTCOME.VALID);
      assert.equal(evidence.entityId, created.descriptor.raftGroupId);
      assert.equal(evidence.partitionId, created.descriptor.raftGroupId);
      assert.equal(evidence.replicaId, FRESH_REPLICA_ID);
      assert.ok(created.descriptor.raftRs.confState.learners.includes(peerId));
      const target = path.join(cluster.directory, 'fresh-v2-target.db');
      const before = fs.readdirSync(checkpointsRoot).sort();
      const result = await requestSnapshotInstall({
        replicaDbPath: target, checkpointsRoot,
        generationIndex: created.descriptor.lastIncludedIndex,
        expectedIdentity: identity(), expectedReplicaIdentity: FRESH_REPLICA_ID,
        expectedPeerId: peerId, createAdmissionOwner: admission.owner,
        createAdmissionEvidence: evidence, createPhysicalWorkerClaim: worker,
      });
      const reason = SnapshotInstallConstants.RAFT_SNAPSHOT_INSTALL_REJECTION
        ?.PAYLOAD_VERSION_UNSUPPORTED_FOR_CREATE;
      assert.equal(reason, 'payload_version_unsupported_for_create');
      assert.equal(result.outcome,
        SnapshotInstallConstants.RAFT_SNAPSHOT_INSTALL_OUTCOME.REJECTED);
      assert.equal(result.reason, reason);
      assert.equal(fs.existsSync(target), false);
      assert.deepEqual(fs.readdirSync(checkpointsRoot).sort(), before,
        'version refusal creates no marker or staging artifacts');
      assert.equal(await admission.owner.revalidatePhysicalWorker(worker,
        evidence), true, 'refusal does not consume or counterfeit authority');
    } finally {
      if (worker) admission.owner.releasePhysicalWorker(worker);
      observer?.close();
      cluster.dispose();
    }
  });

test('R2 same-B idempotence refuses a changed application image without overwrite',
  {timeout: TEST_TIMEOUT_MS}, async () => {
    const fixture = await createFixture();
    let changedDb = null;
    try {
      const checkpointsRoot = path.join(fixture.root, 'same-boundary');
      const first = await createSqliteStateMachineCheckpoint({
        db: fixture.observer,
        identity: identity(),
        checkpointsRoot,
        raftRsGroupId: PARTITION_ID,
      });
      assert.equal(first.outcome, RAFT_CHECKPOINT_CREATION_OUTCOME.CREATED);
      const descriptorPath = path.join(first.checkpointDir,
        RAFT_CHECKPOINT_DESCRIPTOR_FILE);
      const payloadPath = path.join(first.checkpointDir,
        RAFT_CHECKPOINT_PAYLOAD_FILE);
      const d0Bytes = fs.readFileSync(descriptorPath);
      const payloadBytes = fs.readFileSync(payloadPath);
      const provenance = durableRecord(fixture.observer).record;

      const idempotent = await createSqliteStateMachineCheckpoint({
        db: fixture.observer,
        identity: identity(),
        checkpointsRoot,
        raftRsGroupId: PARTITION_ID,
      });
      assert.equal(idempotent.outcome, RAFT_CHECKPOINT_CREATION_OUTCOME.CREATED);
      assert.deepEqual(fs.readFileSync(descriptorPath), d0Bytes);
      assert.deepEqual(fs.readFileSync(payloadPath), payloadBytes);

      const changedPath = path.join(fixture.root, 'same-B-mutant.db');
      await fixture.observer.backup(changedPath);
      changedDb = new Database(changedPath);
      changedDb.prepare(`UPDATE ${TABLE_NAME} SET payload = ? WHERE id = ?`)
        .run('changed-only-in-controlled-mutant', ROW_ID);
      const changedRecord = RaftRsDurableStore.readDurableRecordIn(
        changedDb, PARTITION_ID);
      assert.equal(changedRecord.appliedIndex, provenance.appliedIndex);
      assert.equal(changedRecord.membershipGenerationIndex,
        provenance.membershipGenerationIndex);
      assert.deepEqual(changedRecord.confState, provenance.confState,
        'mutant retains owner-observed B/generation/ConfState provenance');
      const conflict = await createSqliteStateMachineCheckpoint({
        db: changedDb,
        identity: identity(),
        checkpointsRoot,
        raftRsGroupId: PARTITION_ID,
      });
      const sameBoundaryConflict =
        CheckpointConstants.RAFT_CHECKPOINT_CREATION_OUTCOME
          ?.SAME_BOUNDARY_CONFLICT;
      assert.equal(typeof sameBoundaryConflict, 'string',
        'creation owner exports the same-boundary conflict outcome');
      assert.equal(conflict.outcome, sameBoundaryConflict,
        'canonical owner refuses changed bytes at already sealed B');
      assert.deepEqual(fs.readFileSync(descriptorPath), d0Bytes);
      assert.deepEqual(fs.readFileSync(payloadPath), payloadBytes,
        'conflict cannot overwrite immutable D0 payload/M/N');
    } finally {
      changedDb?.close();
      await fixture.close();
    }
  });
