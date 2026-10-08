/**
 * Diagnostic only: the existing raft-rs checkpoint owner is exercised with
 * one real PartitionService application row. No dispatcher/install success is
 * synthesized here.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import Database from 'better-sqlite3';

import {ConfigurationManager} from '../../../src/config/configuration-manager.js';
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
import {dispatchSnapshotCatchup} from '../../../src/raft/snapshot-catchup.js';
import {
  RAFT_SNAPSHOT_CATCHUP_DECISION_OUTCOME,
  RAFT_SNAPSHOT_CATCHUP_DISPATCH_OUTCOME,
} from '../../../src/raft/snapshot-catchup-constants.js';
import {withFoundingStamp} from
  '../../partition/partition-founding-stamp.js';

const NODE_ID = 'native-checkpoint-application-node';
const PARTITION_ID = 'native_checkpoint_application-p1';
const REPLICA_ID = `${PARTITION_ID}-r1`;
const TABLE_NAME = 'native_checkpoint_application';
const ROW_ID = 'durable-application-row';
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
    clusterId: 'native-checkpoint-application-cluster',
    raftGroupId: PARTITION_ID,
    entity: {kind: 'partition', id: TABLE_NAME},
    membershipEpoch,
  };
}

function sourceRow(db) {
  return db.prepare(`SELECT id, payload FROM ${TABLE_NAME} WHERE id = ?`)
    .get(ROW_ID);
}

test('native raft-rs checkpoint distinguishes epoch mismatch from dropped ' +
  'partition application state', {timeout: TEST_TIMEOUT_MS}, async () => {
  initializeEnvironment();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'native-checkpoint-app-'));
  const dbPath = path.join(root, `${REPLICA_ID}.db`);
  const partition = new PartitionService(withFoundingStamp({
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
  let sourceObserver;
  try {
    await partition.initialize();
    sourceObserver = new Database(dbPath, {
      readonly: true,
      fileMustExist: true,
    });
    await waitFor(() => partition.getRole() === 'leader',
      'single-voter partition did not elect a leader');
    const inserted = await partition.insertData(TABLE_NAME, {
      id: ROW_ID,
      payload: 'acknowledged-before-checkpoint',
    });
    assert.equal(inserted.success, true,
      'ordinary admitted PartitionService write is acknowledged');
    await waitFor(() => sourceRow(sourceObserver)?.payload ===
      'acknowledged-before-checkpoint',
    'acknowledged application row did not become durable');
    assert.deepEqual(sourceRow(sourceObserver), {
      id: ROW_ID,
      payload: 'acknowledged-before-checkpoint',
    }, 'source row exists before either checkpoint');

    // Diagnostic only: a future de-export witness must consume the named
    // consensus status owner or its readonly durable state instead.
    const status = partition.raft.readStatus();
    assert.equal(status.membershipGenerationIndex, 0,
      'native single-voter record has configuration generation zero');

    const registeredShape = await dispatchSnapshotCatchup({
      decision: {
        outcome: RAFT_SNAPSHOT_CATCHUP_DECISION_OUTCOME.INSTALL_SNAPSHOT,
        followerAddress: 'snapshot-target/partition/snapshot-target-r1',
        leaderBoundary: Number(status.appliedIndex),
      },
      checkpointsRoot: path.join(root, 'registered-dispatch-shape'),
      identity: identity(0),
      db: partition.db,
      socketProvider: () => {
        throw new Error('typed creation refusal must precede socket creation');
      },
    });
    assert.equal(registeredShape.outcome,
      RAFT_SNAPSHOT_CATCHUP_DISPATCH_OUTCOME.CHECKPOINT_CREATION_FAILED,
      'registered dispatch shape omits raftRsGroupId and cannot seal rs state');
    assert.equal(registeredShape.creation.outcome,
      RAFT_CHECKPOINT_CREATION_OUTCOME.UNSUPPORTED_ADAPTER,
      'the omission is a typed checkpoint-owner refusal, not a fake dispatch');
    assert.deepEqual(registeredShape.creation.reasons,
      [RAFT_RS_CHECKPOINT_REASON.PAYLOAD_KIND_REQUIRED],
      'the refusal is specifically the missing raft-rs payload-kind input');

    const mismatchRoot = path.join(root, 'epoch-9');
    const mismatchCreated = await createSqliteStateMachineCheckpoint({
      db: partition.db,
      identity: identity(9),
      checkpointsRoot: mismatchRoot,
      raftRsGroupId: PARTITION_ID,
    });
    assert.equal(mismatchCreated.outcome,
      RAFT_CHECKPOINT_CREATION_OUTCOME.CREATED,
      'checkpoint owner seals before descriptor coherence validation');
    const mismatchRead = readCheckpoint({
      checkpointDir: mismatchCreated.checkpointDir,
      expectedIdentity: identity(9),
    });
    assert.equal(mismatchRead.outcome,
      RAFT_CHECKPOINT_VALIDATION_OUTCOME.CORRUPT_DESCRIPTOR,
      'publication epoch 9 conflicts with native membership generation 0');

    const nativeRoot = path.join(root, 'generation-0');
    const nativeCreated = await createSqliteStateMachineCheckpoint({
      db: partition.db,
      identity: identity(0),
      checkpointsRoot: nativeRoot,
      raftRsGroupId: PARTITION_ID,
    });
    assert.equal(nativeCreated.outcome,
      RAFT_CHECKPOINT_CREATION_OUTCOME.CREATED);
    const nativeRead = readCheckpoint({
      checkpointDir: nativeCreated.checkpointDir,
      expectedIdentity: identity(0),
    });
    assert.equal(nativeRead.outcome,
      RAFT_CHECKPOINT_VALIDATION_OUTCOME.VALID,
      'metadata-only generation-zero native image remains a valid control');

    const payload = new Database(path.join(nativeCreated.checkpointDir,
      RAFT_CHECKPOINT_PAYLOAD_FILE), {readonly: true, fileMustExist: true});
    try {
      const tables = payload.prepare(
        'SELECT name FROM sqlite_master WHERE type = \'table\' ORDER BY name')
        .all().map(({name}) => name);
      assert.equal(tables.includes('raft_rs_peer_identity'), true,
        'native payload retains its canonical peer-identity metadata');
      const tablePresent = tables.includes(TABLE_NAME);
      const preserved = {
        tablePresent,
        row: tablePresent ? sourceRow(payload) : null,
      };
      assert.deepEqual(preserved, {
        tablePresent: true,
        row: {id: ROW_ID, payload: 'acknowledged-before-checkpoint'},
      }, 'a valid native partition image preserves its application target');
    } finally {
      payload.close();
    }
  } finally {
    sourceObserver?.close();
    await partition.shutdown();
    fs.rmSync(root, {recursive: true, force: true});
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  }
});
