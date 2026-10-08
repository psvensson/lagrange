/**
 * Future-green R1/R2 pre-seal acceptance witnesses. The registered callback
 * is invoked manually; automatic raft-rs lag detection remains R7 scope.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import {canonicalJsonBytes} from
  '../../../src/runtime/oci-host-agent-durable-files.js';
import Database from 'better-sqlite3';

import {wrapPartitionServiceFactoryWithSnapshotCatchup} from
  '../../../src/bootstrap/shared/snapshot-catchup-wiring.js';
import {ConfigurationManager} from
  '../../../src/config/configuration-manager.js';
import {LoggingService} from '../../../src/logging/logging-service.js';
import {PartitionService} from '../../../src/partition/partition-service.js';
import {
  PARTITION_TRANSACTION_PREPARED_STATE,
} from '../../../src/partition/partition-service-constants.js';
import * as CheckpointConstants from
  '../../../src/raft/snapshot-checkpoint-constants.js';
import {
  RAFT_CHECKPOINT_CREATION_OUTCOME,
  RAFT_CHECKPOINT_DESCRIPTOR_FILE,
  RAFT_CHECKPOINT_PAYLOAD_FILE,
  RAFT_CHECKPOINT_VALIDATION_OUTCOME,
} from '../../../src/raft/snapshot-checkpoint-constants.js';
import {validateCheckpointDescriptor} from
  '../../../src/raft/snapshot-checkpoint-format.js';
import {
  createSqliteStateMachineCheckpoint,
  readCheckpoint,
} from '../../../src/raft/snapshot-checkpoint-store.js';
import {
  RAFT_SNAPSHOT_CATCHUP_DECISION_OUTCOME,
  RAFT_SNAPSHOT_CATCHUP_DISPATCH_OUTCOME,
  RAFT_SNAPSHOT_DEFAULT_CLUSTER_ID,
  buildSnapshotCatchupDecision,
} from '../../../src/raft/snapshot-catchup-constants.js';
import {resolveReplicaCheckpointsRoot} from
  '../../../src/raft/snapshot-install.js';
import {RAFT_RS_TABLE} from
  '../../../src/raft/raft-rs-durable-store-constants.js';
import {RaftRsDurableStore} from
  '../../../src/raft/raft-rs-durable-store.js';
import {withFoundingStamp} from
  '../../partition/partition-founding-stamp.js';

const NODE_ID = 'snapshot-r1-r2-node';
const PARTITION_ID = 'snapshot_r1_r2-p1';
const REPLICA_ID = `${PARTITION_ID}-r1`;
const TABLE_NAME = 'snapshot_r1_r2';
const ROW_ID = 'acknowledged-snapshot-row';
const INDEX_NAME = 'snapshot_r1_r2_payload_idx';
const COMMITTED_SESSION = 'snapshot-r1-r2-committed';
const PUBLICATION_EPOCH = 9;
const TEST_TIMEOUT_MS = 30_000;

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
    clusterId: RAFT_SNAPSHOT_DEFAULT_CLUSTER_ID,
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

function indexExists(db, indexName) {
  return db.prepare(
    'SELECT 1 FROM sqlite_master WHERE type = ? AND name = ?')
    .get('index', indexName) !== undefined;
}


function checkpointGenerations(checkpointsRoot) {
  if (!fs.existsSync(checkpointsRoot)) return [];
  return fs.readdirSync(checkpointsRoot, {withFileTypes: true})
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
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
  assert.equal(canonicalJsonBytes(manifest).toString('utf8'),
    rows[0].manifest_json,
    'manifest_json bytes are the owner canonical JSON representation');
  assert.deepEqual(Object.keys(manifest), MANIFEST_KEYS,
    'manifest JSON has the exact v2 owner key set, no aliases');
  return manifest;
}

function assertV2ManifestMatchesDescriptor(manifest, descriptor) {
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
  assert.ok(Array.isArray(manifest.applicationSchema),
    'manifest owns exact application schema inventory');
  assert.ok(Array.isArray(manifest.sqliteSequences),
    'manifest owns exact AUTOINCREMENT sequence inventory');
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
  fs.writeFileSync(descriptorFile, `${JSON.stringify(mutated)}\n`);
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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'snapshot-r1-r2-'));
  const dbPath = path.join(root, `${REPLICA_ID}.db`);
  let socketLookups = 0;
  const createPartitionService =
    wrapPartitionServiceFactoryWithSnapshotCatchup({
      createPartitionService: async (options) => new PartitionService(options),
      systemTableCache: {
        getAll: () => [
          {status: 'PUBLISHED', publication_epoch: PUBLICATION_EPOCH},
        ],
        get: () => null,
      },
      messageRouter: {
        nodeId: NODE_ID,
        nodeAddress: `ws://${NODE_ID}:7000`,
        advertisedAddress: `ws://${NODE_ID}:7000`,
        bootIncarnation: 1,
        bulkChannelRegistry: {
          getConnection() {
            socketLookups += 1;
            return null;
          },
          async dial() {
            socketLookups += 1;
            return null;
          },
        },
      },
    });
  let service;
  let observer;
  try {
    service = await createPartitionService(withFoundingStamp({
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
    const inserted = await service.insertData(TABLE_NAME, {
      id: ROW_ID,
      payload: 'acknowledged-before-snapshot',
    });
    assert.equal(inserted.success, true);
    await waitFor(() => sourceRow(observer)?.payload ===
      'acknowledged-before-snapshot',
    'acknowledged application row did not become durable');
    assert.deepEqual(sourceRow(observer), {
      id: ROW_ID,
      payload: 'acknowledged-before-snapshot',
    });
    const begun = await service.beginTransaction(COMMITTED_SESSION, 1);
    assert.equal(begun.success, true);
    const committed = await service.commitTransaction(COMMITTED_SESSION);
    assert.equal(committed.success, true);
    await waitFor(() => observer.prepare(
      'SELECT outcome FROM _transaction_outcomes WHERE session_id = ?')
      .get(COMMITTED_SESSION)?.outcome === 'COMMITTED',
    'committed transaction outcome did not become durable');
    assert.equal(indexExists(observer, INDEX_NAME), true,
      'source application index exists before checkpointing');
    durableRecord(observer);
  } catch (error) {
    try {
      await closeFixtureResources({root, service, observer});
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError],
        'snapshot fixture setup and cleanup failed');
    }
    throw error;
  }
  return {
    root,
    dbPath,
    service,
    observer,
    socketLookups: () => socketLookups,
    async close() {
      await closeFixtureResources({root, service, observer});
    },
  };
}

test('R1 registered callback creates an application-complete native image ' +
  'before the unavailable-peer cut', {timeout: TEST_TIMEOUT_MS}, async () => {
  const fixture = await createFixture();
  try {
    assert.equal(typeof fixture.service.onSnapshotCatchupNeeded, 'function');
    const {record, appliedIndex} = durableRecord(fixture.observer);
    assert.equal(tableExists(fixture.observer,
      '_raft_rs_replica_lifecycle'), true,
    'source lifecycle state exists anti-vacuously before exclusion');
    const dispatched = await fixture.service.onSnapshotCatchupNeeded(
      buildSnapshotCatchupDecision({
        outcome: RAFT_SNAPSHOT_CATCHUP_DECISION_OUTCOME.INSTALL_SNAPSHOT,
        followerAddress: 'snapshot-no-peer/partition/snapshot-no-peer-r1',
        startIndex: 1,
        failedIndex: appliedIndex,
        leaderBoundary: appliedIndex,
      }));

    assert.equal(dispatched.outcome,
      RAFT_SNAPSHOT_CATCHUP_DISPATCH_OUTCOME.SOCKET_UNAVAILABLE,
      'generation creation succeeds before the deliberate no-peer cut');
    assert.equal(Number.isSafeInteger(dispatched.generationIndex), true,
      'the registered dispatcher publishes the selected generation');
    assert.equal(fixture.socketLookups() > 0, true,
      'the no-peer cut is reached only after checkpoint creation');

    const checkpointDir = path.join(
      resolveReplicaCheckpointsRoot(fixture.dbPath),
      String(dispatched.generationIndex));
    const checkpoint = readCheckpoint({
      checkpointDir,
      expectedIdentity: identity(),
    });
    assert.equal(checkpoint.outcome,
      RAFT_CHECKPOINT_VALIDATION_OUTCOME.VALID);
    const payload = new Database(path.join(checkpointDir,
      RAFT_CHECKPOINT_PAYLOAD_FILE), {readonly: true, fileMustExist: true});
    try {
      assert.notEqual(record.hardState, null,
        'the source has sender-local HardState to exclude');
      const tableSql = payload.prepare(
        'SELECT sql FROM sqlite_master WHERE type = ? AND name = ?')
        .get('table', TABLE_NAME)?.sql;
      assert.equal(typeof tableSql, 'string',
        'payload preserves the application schema');
      assert.deepEqual(sourceRow(payload), {
        id: ROW_ID,
        payload: 'acknowledged-before-snapshot',
      }, 'payload preserves the acknowledged application row');
      assert.equal(indexExists(payload, INDEX_NAME), true,
        'payload preserves the application index');
      assert.equal(payload.prepare(
        'SELECT outcome FROM _transaction_outcomes WHERE session_id = ?')
        .get(COMMITTED_SESSION)?.outcome, 'COMMITTED',
      'payload preserves committed transaction state');
      assert.equal(checkpoint.descriptor.lastIncludedIndex, appliedIndex,
        'sealed boundary equals the source durable applied boundary');
      for (const localTable of [...Object.values(RAFT_RS_TABLE),
        '_raft_rs_replica_lifecycle']) {
        assert.equal(tableExists(payload, localTable), false,
          `payload excludes sender-local table ${localTable}`);
      }
    } finally {
      payload.close();
    }
  } finally {
    await fixture.close();
  }
});

test('R1 refuses a prepared-undecided transaction before checkpoint or socket',
  {timeout: TEST_TIMEOUT_MS}, async () => {
    const fixture = await createFixture();
    try {
      const sessionId = 'snapshot-prepared-undecided';
      assert.equal((await fixture.service.beginTransaction(
        sessionId, 2)).success, true);
      const staged = await fixture.service.executeQuery(
        `INSERT INTO ${TABLE_NAME} (id, payload) VALUES (?, ?)`,
        ['prepared-staged-row', 'local-staging-only'],
        {sessionId});
      assert.equal(staged.success, true,
        'prepared witness uses a real staged write on the owner connection');
      assert.equal(staged.inTransaction, true);
      const prepared = await fixture.service.prepareTransaction(sessionId);
      assert.equal(prepared.success, true,
        'real PartitionService owns a prepared-undecided transaction');
      assert.equal(prepared.preparedState,
        PARTITION_TRANSACTION_PREPARED_STATE.LOCAL_STAGING,
        'prepared fixture is real local staging, not a durable PREPARE claim');
      const checkpointsRoot = resolveReplicaCheckpointsRoot(fixture.dbPath);
      const beforeGenerations = checkpointGenerations(checkpointsRoot);
      const {appliedIndex} = durableRecord(fixture.observer);
      const dispatched = await fixture.service.onSnapshotCatchupNeeded(
        buildSnapshotCatchupDecision({
          outcome: RAFT_SNAPSHOT_CATCHUP_DECISION_OUTCOME.INSTALL_SNAPSHOT,
          followerAddress: 'snapshot-no-peer/partition/snapshot-no-peer-r2',
          startIndex: 1,
          failedIndex: appliedIndex,
          leaderBoundary: appliedIndex,
        }));
      assert.deepEqual(checkpointGenerations(checkpointsRoot),
        beforeGenerations,
        'LOCAL_STAGING refusal leaves no checkpoint side effect');
      assert.equal(fixture.socketLookups(), 0,
        'prepared-undecided refusal occurs before socket selection');
      const rolledBack = await fixture.service.rollbackTransaction(sessionId);
      assert.equal(rolledBack.success, true,
        'prepared session remains controllable after the snapshot refusal');
      assert.equal(rolledBack.rolledBack, true);
      assert.equal(sourceRow(fixture.observer)?.id, ROW_ID,
        'rollback preserves the pre-existing committed row');
      assert.equal(fixture.observer.prepare(
        `SELECT COUNT(*) AS count FROM ${TABLE_NAME} WHERE id = ?`)
        .get('prepared-staged-row').count, 0,
      'rollback removes the LOCAL_STAGING-only row');
      assert.notEqual(dispatched, null,
        'NOT_REACHED today: registered callback returns a typed ' +
        'prepared-undecided owner refusal');
      assert.equal(dispatched.outcome,
        RAFT_SNAPSHOT_CATCHUP_DISPATCH_OUTCOME.CHECKPOINT_CREATION_FAILED);
      assert.equal(dispatched.creation?.outcome,
        RAFT_CHECKPOINT_CREATION_OUTCOME.PREPARED_TRANSACTIONS_PENDING);
    } finally {
      await fixture.close();
    }
  });

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
    corruptDescriptor.raftRs.membershipGenerationIndex = '00';
    fs.writeFileSync(descriptorFile,
      `${JSON.stringify(corruptDescriptor)}\n`);
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
        assertV2ManifestMatchesDescriptor(manifest, created.descriptor);
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
      const structural = validateCheckpointDescriptor(mutatedDescriptor);
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
