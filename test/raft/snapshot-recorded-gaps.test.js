import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {EventEmitter} from 'node:events';

import Database from 'better-sqlite3';

import {test} from '../../src/test-helpers/tap.js';

import LifeRaft from '../../src/raft/liferaft.js';
import {InMemoryLogAdapter} from '../../src/raft/in-memory-log-adapter.js';
import {SQLiteLogAdapter} from '../../src/raft/sqlite-log-adapter.js';
import {RAFT_ERROR_CODE} from '../../src/raft/constants.js';
import {requestSnapshotInstall} from '../../src/raft/snapshot-install.js';
import {
  RAFT_SNAPSHOT_BOUNDARY_STATE_KEY,
  RAFT_SNAPSHOT_INSTALL_OUTCOME,
} from '../../src/raft/snapshot-install-constants.js';
import {
  createSealedSourceGeneration,
  installSealedGeneration,
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

// S4 recorded-gap guards (quest raft-snapshot-compacted-follower-catchup):
// five previously-untested lines pinned — (1) the wrong-term-at-boundary
// refusal in liferaft's validateCommittedPrevLogIdentity boundary branch,
// plus its deliberate no-dispatch livelock disposition against a full-log
// leader; (2) the committed-truncation witness TRIP inside
// (boundary, committedIndex]; (3) stale target-sidecar deletion in
// swapStagingIntoReplica; (4) the explicit per-socket maxPayload on the
// bulk dial; (5) stale-staging cleanup at transfer accept.

const PARTITION_ID = 'sql_transactions-p1';
const STATE_TABLE = 'sql_transactions';
const TERM = 4;
const WRONG_TERM = 9;
const SEALED_EPOCH = 7;
const ENTRY_COUNT = 3;
const IDENTITY = Object.freeze({
  clusterId: 'cluster-incarnation-1234',
  raftGroupId: PARTITION_ID,
  entity: Object.freeze({kind: 'partition', id: STATE_TABLE}),
  membershipEpoch: SEALED_EPOCH,
});
const HUGE_TIMERS = Object.freeze({
  'heartbeat': '10s',
  'election min': '20s',
  'election max': '30s',
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

async function createInstalledReplicaFixture() {
  const generation = await createSealedGenerationFixture();
  const replicaDbPath = path.join(generation.workDir, 'replica.db');
  await installSealedGeneration({
    replicaDbPath,
    checkpointsRoot: generation.checkpointsRoot,
    generationIndex: generation.boundaryIndex,
    identity: IDENTITY,
  });
  const db = new Database(replicaDbPath);
  const adapter = new SQLiteLogAdapter(
    db, {address: PARTITION_ID, term: TERM});
  return {...generation, replicaDbPath, db, adapter,
    close() {
      db.close();
      generation.close();
    }};
}

test('gap 1: wrong-term-at-boundary is a typed refusal with NO dispatch',
  async (t) => {
    const fixture = await createInstalledReplicaFixture();
    const adapter = fixture.adapter;
    const follower = new LifeRaft('node-f/partition/sql_transactions-p1-r2', {
      ...HUGE_TIMERS,
      'Log': function SQLiteLogFactory() {
        return adapter;
      },
    });
    const leaderDecisions = [];
    const leader = new LifeRaft('node-l/partition/sql_transactions-p1-r1', {
      ...HUGE_TIMERS,
      'Log': InMemoryLogAdapter,
      'onSnapshotCatchupNeeded': (decision) => leaderDecisions.push(decision),
    });
    try {
      // Full-log leader: entries 1..boundary+2 with a DIVERGENT term at the
      // boundary index (unreachable for honest committed history — this is
      // the corruption/forgery disposition).
      for (let index = 1; index <= fixture.boundaryIndex + 2; index += 1) {
        await leader.log.saveCommand({type: 'entry', index}, WRONG_TERM, index);
      }
      await leader.log.commit(fixture.boundaryIndex + 2);
      leader.change({state: LifeRaft.LEADER, term: WRONG_TERM});

      const followerOutgoing = [];
      follower.message = (_who, packet) => {
        followerOutgoing.push(packet);
        return follower;
      };
      const followerIncoming = follower.listeners('data')[0];
      const followerWrites = [];
      await followerIncoming({
        type: 'append',
        term: WRONG_TERM,
        state: LifeRaft.LEADER,
        address: leader.address,
        leader: leader.address,
        last: {
          index: fixture.boundaryIndex,
          term: WRONG_TERM,
          committedIndex: fixture.boundaryIndex,
        },
        data: [],
      }, (packet) => followerWrites.push(packet ?? null));
      await new Promise((resolve) => setImmediate(resolve));

      const refusals = followerOutgoing.filter(
        (packet) => packet?.type === 'append fail' &&
          packet?.data?.code === RAFT_ERROR_CODE.COMMITTED_ENTRY_CONFLICT);
      t.equal(refusals.length, 1,
        'the boundary-term divergence is refused with the typed conflict');
      t.equal(refusals[0].data.index, fixture.boundaryIndex,
        'the refusal names the boundary index');
      const info = await follower.log.getLastInfo();
      t.same({index: info.index, term: info.term},
        {index: fixture.boundaryIndex, term: TERM},
        'the installed boundary identity is untouched by the attack');

      // Disposition: feed the REAL refusal to the full-log leader — its
      // boundary is 0, so the livelock settles with NO catch-up dispatch.
      const leaderIncoming = leader.listeners('data')[0];
      await leaderIncoming(refusals[0], () => {});
      t.same(leaderDecisions, [],
        'the full-log leader never emits a catch-up decision (no dispatch)');
      t.equal(leader._lastSnapshotCatchupDecision, undefined,
        'no decision is recorded on the leader instance either');
    } finally {
      follower.end();
      leader.end();
      fixture.close();
    }
  });

test('gap 2: the truncation witness TRIPS inside (boundary, committedIndex]',
  async (t) => {
    const fixture = await createInstalledReplicaFixture();
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
      adapter.removeEntriesAfter(fixture.boundaryIndex + 1);
      t.equal(adapter.committedTruncationBlockedCount, blockedBefore + 1,
        'an exclusive truncation inside (boundary, committedIndex] trips');
      t.same(adapter.lastCommittedTruncationBlocked && {
        requestedIndex:
          adapter.lastCommittedTruncationBlocked.requestedIndex,
        committedIndex:
          adapter.lastCommittedTruncationBlocked.committedIndex,
      }, {
        requestedIndex: fixture.boundaryIndex + 1,
        committedIndex,
      }, 'the witness records the anomalous request');
      t.ok(await adapter.get(fixture.boundaryIndex + 2),
        'the committed suffix survives (clamped, not deleted)');

      adapter.removeFrom(fixture.boundaryIndex + 2);
      t.equal(adapter.committedTruncationBlockedCount, blockedBefore + 2,
        'an inclusive truncation inside (boundary, committedIndex] trips');

      adapter.removeEntriesAfter(fixture.boundaryIndex);
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
      const staleWal = `${targetDbPath}-wal`;
      fs.writeFileSync(staleWal, Buffer.from('stale-wal-garbage'));
      const installed = await requestSnapshotInstall({
        replicaDbPath: targetDbPath,
        checkpointsRoot: generation.checkpointsRoot,
        generationIndex: generation.boundaryIndex,
        expectedIdentity: IDENTITY,
      });
      t.equal(installed.outcome, RAFT_SNAPSHOT_INSTALL_OUTCOME.INSTALLED,
        'the install completes over the seeded stale sidecar');
      t.notOk(fs.existsSync(staleWal),
        'the stale -wal sidecar is deleted before the swap');
      const db = new Database(targetDbPath, {readonly: true});
      try {
        const row = db.prepare(
          'SELECT value FROM _raft_state WHERE key = ?',
        ).get(RAFT_SNAPSHOT_BOUNDARY_STATE_KEY.LAST_INCLUDED_INDEX);
        t.equal(Number(row?.value), generation.boundaryIndex,
          'the installed db opens healthy with the boundary keys');
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
        identify: {nodeId: 'self-node', nodeAddress: 'ws://self:9999'},
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
        identify: {nodeId: 'self-node', nodeAddress: 'ws://self:9999'},
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
