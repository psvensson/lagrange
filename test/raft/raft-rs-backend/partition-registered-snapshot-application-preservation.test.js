/**
 * R1/R2 pre-seal witness. A real PartitionService is created through the
 * production snapshot-catchup factory wrapper and its registered callback is
 * invoked manually. This does not claim an automatic lag trigger exists.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import Database from 'better-sqlite3';

import {wrapPartitionServiceFactoryWithSnapshotCatchup} from
  '../../../src/bootstrap/shared/snapshot-catchup-wiring.js';
import {ConfigurationManager} from
  '../../../src/config/configuration-manager.js';
import {LoggingService} from '../../../src/logging/logging-service.js';
import {PartitionService} from '../../../src/partition/partition-service.js';
import {
  RAFT_CHECKPOINT_CREATION_OUTCOME,
  RAFT_CHECKPOINT_PAYLOAD_FILE,
  RAFT_CHECKPOINT_VALIDATION_OUTCOME,
  RAFT_RS_CHECKPOINT_REASON,
} from '../../../src/raft/snapshot-checkpoint-constants.js';
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
import {withFoundingStamp} from
  '../../partition/partition-founding-stamp.js';

const NODE_ID = 'registered-snapshot-application-node';
const PARTITION_ID = 'registered_snapshot_application-p1';
const REPLICA_ID = `${PARTITION_ID}-r1`;
const TABLE_NAME = 'registered_snapshot_application';
const ROW_ID = 'acknowledged-registered-row';
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

function identity(membershipEpoch) {
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

test('registered PartitionService snapshot callback exposes the real R1/R2 ' +
  'application and generation boundary', {timeout: TEST_TIMEOUT_MS},
async () => {
  initializeEnvironment();
  const root = fs.mkdtempSync(path.join(os.tmpdir(),
    'registered-snapshot-application-'));
  const dbPath = path.join(root, `${REPLICA_ID}.db`);
  let socketLookups = 0;
  const bulkChannelRegistry = {
    getConnection() {
      socketLookups += 1;
      return null;
    },
    async dial() {
      socketLookups += 1;
      throw new Error('checkpoint refusal must precede socket dial');
    },
  };
  const systemTableCache = {
    getAll() {
      return [{status: 'PUBLISHED', publication_epoch: PUBLICATION_EPOCH}];
    },
    get() {
      return null;
    },
  };
  const createPartitionService =
    wrapPartitionServiceFactoryWithSnapshotCatchup({
      createPartitionService: async (options) => new PartitionService(options),
      systemTableCache,
      messageRouter: {
        nodeId: NODE_ID,
        nodeAddress: `ws://${NODE_ID}:7000`,
        advertisedAddress: `ws://${NODE_ID}:7000`,
        bootIncarnation: 1,
        bulkChannelRegistry,
      },
    });
  let service;
  let sourceObserver;
  try {
    service = await createPartitionService(withFoundingStamp({
      partitionId: PARTITION_ID,
      tableId: TABLE_NAME,
      tableName: TABLE_NAME,
      replicaId: REPLICA_ID,
      replicaIds: [REPLICA_ID],
      nodeId: NODE_ID,
      dbPath,
      schema: {columns: [
        {name: 'id', type: 'TEXT', primaryKey: true},
        {name: 'payload', type: 'TEXT', notNull: true},
      ]},
    }));
    assert.equal(typeof service.onSnapshotCatchupNeeded, 'function',
      'the production wrapper registered the callback on the real service');
    await service.initialize();
    sourceObserver = new Database(dbPath, {readonly: true, fileMustExist: true});
    await waitFor(() => service.getRole() === 'leader',
      'single-voter partition did not elect a leader');
    const inserted = await service.insertData(TABLE_NAME, {
      id: ROW_ID,
      payload: 'acknowledged-before-registered-checkpoint',
    });
    assert.equal(inserted.success, true,
      'ordinary admitted PartitionService write is acknowledged');
    await waitFor(() => sourceRow(sourceObserver)?.payload ===
      'acknowledged-before-registered-checkpoint',
    'acknowledged application row did not become durable');
    assert.deepEqual(sourceRow(sourceObserver), {
      id: ROW_ID,
      payload: 'acknowledged-before-registered-checkpoint',
    }, 'separate readonly observer sees the source application row');

    // Manual callback invocation only. Current raft-rs runtime has no proven
    // automatic lag signal that calls this registered seam.
    const status = service.raft.readStatus();
    assert.equal(status.membershipGenerationIndex, 0,
      'durable group generation is independently zero');
    const registered = await service.onSnapshotCatchupNeeded(
      buildSnapshotCatchupDecision({
        outcome: RAFT_SNAPSHOT_CATCHUP_DECISION_OUTCOME.INSTALL_SNAPSHOT,
        followerAddress: 'registered-target/partition/registered-target-r1',
        startIndex: 1,
        failedIndex: Number(status.appliedIndex),
        leaderBoundary: Number(status.appliedIndex),
      }));
    assert.equal(registered.outcome,
      RAFT_SNAPSHOT_CATCHUP_DISPATCH_OUTCOME.CHECKPOINT_CREATION_FAILED,
      'the registered callback reaches the checkpoint owner');
    assert.equal(registered.creation.outcome,
      RAFT_CHECKPOINT_CREATION_OUTCOME.UNSUPPORTED_ADAPTER);
    assert.deepEqual(registered.creation.reasons,
      [RAFT_RS_CHECKPOINT_REASON.PAYLOAD_KIND_REQUIRED],
      'current registered shape fails first on missing raft-rs payload kind');
    assert.equal(socketLookups, 0,
      'typed checkpoint refusal occurs before socket lookup or dial');

    // Diagnostic-only native option sensitivities. These direct owner calls
    // do not substitute for the registered callback positive above.
    const mismatchRoot = path.join(root, 'diagnostic-epoch-9');
    const mismatchCreated = await createSqliteStateMachineCheckpoint({
      db: service.db,
      identity: identity(PUBLICATION_EPOCH),
      checkpointsRoot: mismatchRoot,
      raftRsGroupId: PARTITION_ID,
    });
    assert.equal(mismatchCreated.outcome,
      RAFT_CHECKPOINT_CREATION_OUTCOME.CREATED);
    const mismatchRead = readCheckpoint({
      checkpointDir: mismatchCreated.checkpointDir,
      expectedIdentity: identity(PUBLICATION_EPOCH),
    });
    assert.equal(mismatchRead.outcome,
      RAFT_CHECKPOINT_VALIDATION_OUTCOME.CORRUPT_DESCRIPTOR,
      'publication epoch 9 is incorrectly equated with group generation 0');

    const matchedRoot = path.join(root, 'diagnostic-generation-0');
    const matchedCreated = await createSqliteStateMachineCheckpoint({
      db: service.db,
      identity: identity(0),
      checkpointsRoot: matchedRoot,
      raftRsGroupId: PARTITION_ID,
    });
    assert.equal(matchedCreated.outcome,
      RAFT_CHECKPOINT_CREATION_OUTCOME.CREATED);
    const matchedRead = readCheckpoint({
      checkpointDir: matchedCreated.checkpointDir,
      expectedIdentity: identity(0),
    });
    assert.equal(matchedRead.outcome,
      RAFT_CHECKPOINT_VALIDATION_OUTCOME.VALID,
      'matched native generation remains the diagnostic control');
    const payload = new Database(path.join(matchedCreated.checkpointDir,
      RAFT_CHECKPOINT_PAYLOAD_FILE), {readonly: true, fileMustExist: true});
    try {
      const tablePresent = payload.prepare(
        'SELECT 1 FROM sqlite_master WHERE type = ? AND name = ?')
        .get('table', TABLE_NAME) !== undefined;
      assert.deepEqual({
        tablePresent,
        row: tablePresent ? sourceRow(payload) : null,
      }, {
        tablePresent: true,
        row: {id: ROW_ID,
          payload: 'acknowledged-before-registered-checkpoint'},
      }, 'matched native payload preserves acknowledged application state');
    } finally {
      payload.close();
    }
  } finally {
    sourceObserver?.close();
    await service?.shutdown();
    fs.rmSync(root, {recursive: true, force: true});
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  }
});
