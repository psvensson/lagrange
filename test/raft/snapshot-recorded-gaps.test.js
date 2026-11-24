import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {EventEmitter} from 'node:events';

import Database from 'better-sqlite3';

import {test} from '../../src/test-helpers/tap.js';

import {RaftRsDurableStore} from '../../src/raft/raft-rs-durable-store.js';
import {SQLiteLogAdapter} from '../../src/raft/sqlite-log-adapter.js';
import {requestSnapshotInstall} from '../../src/raft/snapshot-install.js';
import {
  RAFT_SNAPSHOT_BOUNDARY_STATE_KEY,
  RAFT_SNAPSHOT_INSTALL_OUTCOME,
} from '../../src/raft/snapshot-install-constants.js';
import {
  createSealedSourceGeneration,
  defaultFollowerReplicaId,
  seedEstablishedFollowerReceiver,
} from './snapshot-catchup-fixture.js';
import {
  RAFT_SNAPSHOT_TRANSFER_ACCEPT_OUTCOME,
  RAFT_SNAPSHOT_TRANSFER_CHUNK_SIZE_BYTES,
  RAFT_SNAPSHOT_TRANSFER_DIRNAME,
  RAFT_SNAPSHOT_TRANSFER_MESSAGE_KIND,
  RAFT_SNAPSHOT_TRANSFER_PROTOCOL_NAME,
  RAFT_SNAPSHOT_TRANSFER_PROTOCOL_VERSION,
} from '../../src/raft/snapshot-transfer-constants.js';
import {
  createSnapshotTransferReceiver,
  snapshotTransferChunkCount,
} from '../../src/raft/snapshot-transfer-receiver.js';
import {
  createBulkTransferChannelRegistry,
} from '../../src/transport/bulk-transfer-channel.js';
import {
  BULK_TRANSFER_CHANNEL_DEFAULT,
  ROUTER_IDENTIFY_CHANNEL,
} from '../../src/constants/transport.js';
import {TEST_BOOT_INCARNATION} from
  '../test-helpers/boot-incarnation-fixture.js';

// S4 recorded-gap guards (quest raft-snapshot-compacted-follower-catchup):
// previously-untested lines pinned - (2) the committed-truncation witness TRIP
// inside (boundary, committedIndex]; (3) stale target-sidecar deletion in
// swapStagingIntoReplica; (4) the explicit per-socket maxPayload on the bulk
// dial; (5) stale-staging cleanup at transfer accept.
//
// Gap (1), the wrong-term-at-boundary refusal and its no-dispatch disposition,
// drove the retired runtime's follower and leader and is deleted with it.
// Log matching at a snapshot boundary belongs to raft-rs, whose snapshot
// catch-up is an open release-blocking frontier of epic raft-rs-full-cutover
// R5 ("snapshot/restart/catch-up under rs-raft durable state").

const PARTITION_ID = 'sql_transactions-p1';
const STATE_TABLE = 'sql_transactions';
const TERM = 4;
const SEALED_EPOCH = 3;
const ENTRY_COUNT = 3;
const IDENTITY = Object.freeze({
  clusterId: 'cluster-incarnation-1234',
  raftGroupId: PARTITION_ID,
  entity: Object.freeze({kind: 'partition', id: STATE_TABLE}),
  membershipEpoch: SEALED_EPOCH,
});

async function createSealedGenerationFixture() {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'raft-gaps-'));
  const checkpointsRoot = path.join(workDir, 'checkpoints');
  const generation = await createSealedSourceGeneration({
    workDir,
    checkpointsRoot,
    partitionId: PARTITION_ID,
    stateTable: STATE_TABLE,
    term: TERM,
    identity: IDENTITY,
    entryCount: ENTRY_COUNT,
  });
  return {
    workDir,
    checkpointsRoot,
    created: generation.created,
    boundaryIndex: generation.boundaryIndex,
    close() {
      fs.rmSync(workDir, {recursive: true, force: true});
    },
  };
}

async function createCompactedLogReplicaFixture() {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'raft-gaps-log-'));
  const replicaDbPath = path.join(workDir, 'replica.db');
  const db = new Database(replicaDbPath);
  const adapter = new SQLiteLogAdapter(
    db, {address: PARTITION_ID, term: TERM});
  const upsert = db.prepare(
    'INSERT OR REPLACE INTO _raft_state (key, value) VALUES (?, ?)');
  upsert.run(RAFT_SNAPSHOT_BOUNDARY_STATE_KEY.LAST_INCLUDED_INDEX,
    String(ENTRY_COUNT));
  upsert.run(RAFT_SNAPSHOT_BOUNDARY_STATE_KEY.LAST_INCLUDED_TERM, String(TERM));
  upsert.run('committedIndex', String(ENTRY_COUNT));
  return {
    workDir,
    boundaryIndex: ENTRY_COUNT,
    replicaDbPath,
    db,
    adapter,
    close() {
      db.close();
      fs.rmSync(workDir, {recursive: true, force: true});
    },
  };
}

test('gap 2: the truncation witness TRIPS inside (boundary, committedIndex]',
  async (t) => {
    const fixture = await createCompactedLogReplicaFixture();
    try {
      const adapter = fixture.adapter;
      // Extend past the boundary so committedIndex (6) > boundary (3).
      for (let ordinal = 1; ordinal <= 3; ordinal += 1) {
        const entry = adapter.saveCommand({sql: `extra-${ordinal}`}, TERM);
        adapter.commit(entry.index);
      }
      const committedIndex = adapter.getCommittedIndex();
      t.equal(committedIndex, fixture.boundaryIndex + 3,
        'fixture: committedIndex sits above the boundary');

      const blockedBefore = adapter.committedTruncationBlockedCount;
      adapter.removeFrom(fixture.boundaryIndex + 2);
      t.equal(adapter.committedTruncationBlockedCount, blockedBefore + 1,
        'an inclusive truncation inside (boundary, committedIndex] trips');
      t.same(adapter.lastCommittedTruncationBlocked && {
        requestedIndex:
          adapter.lastCommittedTruncationBlocked.requestedIndex,
        committedIndex:
          adapter.lastCommittedTruncationBlocked.committedIndex,
      }, {
        requestedIndex: fixture.boundaryIndex + 2,
        committedIndex,
      }, 'the witness records the anomalous request');
      t.ok(await adapter.get(fixture.boundaryIndex + 2),
        'the committed suffix survives (clamped, not deleted)');

      adapter.removeFrom(fixture.boundaryIndex + 1);
      t.equal(adapter.committedTruncationBlockedCount, blockedBefore + 2,
        'a second inclusive truncation inside the committed suffix trips');

      adapter.removeFrom(fixture.boundaryIndex);
      t.equal(adapter.committedTruncationBlockedCount, blockedBefore + 2,
        'a truncation at or below the boundary clamps SILENTLY (no trip)');
    } finally {
      fixture.close();
    }
  });

test('gap 3: install deletes stale target sidecars and boots healthy',
  async (t) => {
    const generation = await createSealedGenerationFixture();
    try {
      const targetDbPath = path.join(generation.workDir, 'target.db');
      const followerReplica = defaultFollowerReplicaId(PARTITION_ID);
      seedEstablishedFollowerReceiver({
        replicaDbPath: targetDbPath,
        partitionId: PARTITION_ID,
        replicaId: followerReplica,
        term: 1,
        vote: 0,
      });
      const staleWal = `${targetDbPath}-wal`;
      const staleShm = `${targetDbPath}-shm`;
      fs.writeFileSync(staleWal, Buffer.from('stale-wal-garbage'));
      const refusedPendingWal = await requestSnapshotInstall({
        replicaDbPath: targetDbPath,
        checkpointsRoot: generation.checkpointsRoot,
        generationIndex: generation.boundaryIndex,
        expectedIdentity: IDENTITY,
        expectedReplicaIdentity: followerReplica,
      });
      t.equal(refusedPendingWal.outcome, RAFT_SNAPSHOT_INSTALL_OUTCOME.REJECTED,
        'a non-empty -wal sidecar is refused fail-closed before swap');
      // After the receiver checkpoints/truncates its WAL to 0 bytes, stale
      // empty -wal and -shm sidecars are removed before the atomic swap.
      fs.writeFileSync(staleWal, Buffer.alloc(0));
      fs.writeFileSync(staleShm, Buffer.from('stale-shm-garbage'));
      const installed = await requestSnapshotInstall({
        replicaDbPath: targetDbPath,
        checkpointsRoot: generation.checkpointsRoot,
        generationIndex: generation.boundaryIndex,
        expectedIdentity: IDENTITY,
        expectedReplicaIdentity: followerReplica,
      });
      t.equal(installed.outcome, RAFT_SNAPSHOT_INSTALL_OUTCOME.INSTALLED,
        'the install completes over the checkpointed target sidecars');
      t.notOk(fs.existsSync(staleWal),
        'the stale -wal sidecar is deleted before the swap');
      t.notOk(fs.existsSync(staleShm),
        'the stale -shm sidecar is deleted before the swap');
      const db = new Database(targetDbPath, {readonly: true});
      try {
        const record = RaftRsDurableStore.readDurableRecordIn(db, PARTITION_ID);
        t.equal(Number(record.appliedIndex), generation.boundaryIndex,
          'the installed db opens healthy with the raft-rs boundary');
      } finally {
        db.close();
      }
    } finally {
      generation.close();
    }
  });

test('gap 4: the bulk dial passes an explicit per-socket maxPayload',
  async (t) => {
    class FakeBulkSocket extends EventEmitter {
      constructor() {
        super();
        this.sent = [];
        queueMicrotask(() => this.emit('open'));
      }
      send(data) {
        this.sent.push(data);
      }
      close() {}
      terminate() {}
    }
    const dials = [];
    const sockets = [];
    const registry = createBulkTransferChannelRegistry({
      createWebSocket: (address, wsOptions) => {
        dials.push({address, wsOptions});
        const socket = new FakeBulkSocket();
        sockets.push(socket);
        return socket;
      },
    });
    try {
      await registry.dial({
        nodeId: 'peer-1',
        address: 'ws://peer-1:9999',
        identify: {nodeId: 'self-node', nodeAddress: 'ws://self:9999',
          bootIncarnation: TEST_BOOT_INCARNATION},
      });
      t.equal(dials[0].wsOptions.maxPayload,
        BULK_TRANSFER_CHANNEL_DEFAULT.MAX_PAYLOAD_BYTES,
        'the ws constructor receives the default per-socket maxPayload');
      const identify = JSON.parse(sockets[0].sent[0]);
      t.equal(identify.channel, ROUTER_IDENTIFY_CHANNEL.BULK,
        'the first frame on the dialed socket is the bulk IDENTIFY');

      await registry.dial({
        nodeId: 'peer-2',
        address: 'ws://peer-2:9999',
        identify: {nodeId: 'self-node', nodeAddress: 'ws://self:9999',
          bootIncarnation: TEST_BOOT_INCARNATION},
        maxPayload: 12345,
      });
      t.equal(dials[1].wsOptions.maxPayload, 12345,
        'an explicit dial maxPayload is passed through to the socket');
    } finally {
      registry.closeAll();
    }
  });

test('gap 5: transfer accept sweeps stale staging, keeping its own directory',
  async (t) => {
    const generation = await createSealedGenerationFixture();
    const receiverRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'raft-gaps-recv-'));
    try {
      const transferRoot = path.join(
        receiverRoot, RAFT_SNAPSHOT_TRANSFER_DIRNAME);
      const staleDir = path.join(transferRoot, '999');
      fs.mkdirSync(staleDir, {recursive: true});
      fs.writeFileSync(path.join(staleDir, 'transfer-payload'),
        Buffer.from('stale-bytes'));

      const descriptor = generation.created.descriptor;
      const receiver = createSnapshotTransferReceiver({
        checkpointsRoot: receiverRoot,
        expectedIdentity: IDENTITY,
      });
      const admission = receiver.acceptOffer({
        kind: RAFT_SNAPSHOT_TRANSFER_MESSAGE_KIND.OFFER,
        protocolName: RAFT_SNAPSHOT_TRANSFER_PROTOCOL_NAME,
        protocolVersion: RAFT_SNAPSHOT_TRANSFER_PROTOCOL_VERSION,
        transferId: 'gap5-transfer',
        descriptor,
        chunkSizeBytes: RAFT_SNAPSHOT_TRANSFER_CHUNK_SIZE_BYTES,
        chunkCount: snapshotTransferChunkCount(
          descriptor.payloadByteLength,
          RAFT_SNAPSHOT_TRANSFER_CHUNK_SIZE_BYTES),
      });
      t.equal(admission.outcome,
        RAFT_SNAPSHOT_TRANSFER_ACCEPT_OUTCOME.ACCEPTED,
        'the offer is admitted');
      t.notOk(fs.existsSync(staleDir),
        'the stale transfer staging directory is swept at accept');
      t.ok(fs.existsSync(path.join(
        transferRoot, String(descriptor.lastIncludedIndex))),
      'the accepted transfer keeps its own staging directory');
      receiver.cancel();
    } finally {
      fs.rmSync(receiverRoot, {recursive: true, force: true});
      generation.close();
    }
  });
