/**
 * Future-green sender-native snapshot witness. It manually invokes the
 * production-registered callback; automatic lag detection remains separate.
 * Native transport packets are observed byte-for-byte and never fabricated.
 */

import assert from 'node:assert/strict';
import {test} from 'node:test';

import Database from 'better-sqlite3';

import {attachSnapshotCatchupDispatcher} from
  '../../../src/bootstrap/shared/snapshot-catchup-wiring.js';
import {
  RAFT_CHECKPOINT_CREATION_OUTCOME,
  RAFT_RS_CHECKPOINT_REASON,
} from '../../../src/raft/snapshot-checkpoint-constants.js';
import {
  RAFT_SNAPSHOT_CATCHUP_DECISION_OUTCOME,
  RAFT_SNAPSHOT_CATCHUP_DISPATCH_OUTCOME,
  buildSnapshotCatchupDecision,
} from '../../../src/raft/snapshot-catchup-constants.js';
import {RAFT_RS_MESSAGE_TYPE} from
  '../../../src/raft/raft-rs-ingress-constants.js';
import {durableRecordBootstrap} from
  '../../../src/raft/raft-committed-membership-stamp.js';
import {RaftRsDurableStore} from
  '../../../src/raft/raft-rs-durable-store.js';
import {
  addressOf,
  configure,
  createCommittedMembershipHarness,
  formGroup,
  waitFor,
} from './committed-membership-harness.js';

const PARTITION_ID = 'sender-native-snapshot-p1';
const FOUNDERS = Object.freeze([
  ['sender-snapshot-r1', 'sender-snapshot-n1'],
  ['sender-snapshot-r2', 'sender-snapshot-n2'],
  ['sender-snapshot-r3', 'sender-snapshot-n3'],
]);
const ROW_ID = 41;
const PUBLICATION_EPOCH = 9;
const TEST_TIMEOUT_MS = 30_000;

function publicationCache() {
  return {
    getAll() {
      return [{status: 'PUBLISHED', publication_epoch: PUBLICATION_EPOCH}];
    },
    get() {
      return null;
    },
  };
}

function durableRecord(dbPath) {
  const observer = new Database(dbPath, {readonly: true, fileMustExist: true});
  try {
    return RaftRsDurableStore.readDurableRecordIn(observer, PARTITION_ID);
  } finally {
    observer.close();
  }
}

function peerIdFor(dbPath, replicaIdentity) {
  const observer = new Database(dbPath, {readonly: true, fileMustExist: true});
  try {
    return observer.prepare(
      'SELECT raft_peer_id FROM raft_rs_peer_identity ' +
      'WHERE replica_identity = ?').get(replicaIdentity).raft_peer_id;
  } finally {
    observer.close();
  }
}

test('registered source callback publishes a proof-gated native snapshot ' +
  'and the real sender emits MsgSnapshot after compaction',
{timeout: TEST_TIMEOUT_MS}, async (t) => {
  configure();
  const harness = createCommittedMembershipHarness(PARTITION_ID);
  const observedNativePackets = [];
  const deliver = harness.network.deliver.bind(harness.network);
  harness.network.deliver = async (address, packet) => {
    observedNativePackets.push({address, packet});
    return deliver(address, packet);
  };
  try {
    await formGroup(harness, FOUNDERS);
    const leader = harness.leader();
    assert.notEqual(leader, undefined,
      'real multi-peer PartitionService group elects a leader');
    const lagger = FOUNDERS.find(([replicaId]) =>
      replicaId !== leader.replicaId);
    const leaderDbPath = harness.dbPathOf(
      harness.members.get(leader.replicaId));
    const laggerPeerId = peerIdFor(harness.dbPathOf(lagger), lagger[0]);
    const leaderPeerId = peerIdFor(leaderDbPath, leader.replicaId);
    harness.network.cut(addressOf(lagger), laggerPeerId);

    const inserted = await leader.insertData('committed_membership_table', {
      seq: ROW_ID,
    });
    assert.equal(inserted.success, true,
      'application row is acknowledged by the real leader');
    assert.equal(await waitFor(() => {
      const observer = new Database(leaderDbPath,
        {readonly: true, fileMustExist: true});
      try {
        return observer.prepare(
          'SELECT seq FROM committed_membership_table WHERE seq = ?')
          .get(ROW_ID)?.seq === ROW_ID;
      } finally {
        observer.close();
      }
    }), true, 'acknowledged row reaches durable application storage');

    let bulkSocketLookups = 0;
    attachSnapshotCatchupDispatcher({
      service: leader,
      systemTableCache: publicationCache(),
      messageRouter: {
        nodeId: FOUNDERS.find(([, nodeId]) =>
          nodeId === leader.nodeId)?.[1] || leader.nodeId,
        nodeAddress: `ws://${leader.nodeId}:7000`,
        advertisedAddress: `ws://${leader.nodeId}:7000`,
        bootIncarnation: 1,
        bulkChannelRegistry: {
          getConnection() {
            bulkSocketLookups += 1;
            return null;
          },
          async dial() {
            bulkSocketLookups += 1;
            return null;
          },
        },
      },
    });
    const source = durableRecord(leaderDbPath);
    const boundary = Number(source.appliedIndex);
    assert.equal(Number.isSafeInteger(boundary), true);

    const dispatched = await leader.onSnapshotCatchupNeeded(
      buildSnapshotCatchupDecision({
        outcome: RAFT_SNAPSHOT_CATCHUP_DECISION_OUTCOME.INSTALL_SNAPSHOT,
        followerAddress: addressOf(lagger),
        startIndex: 1,
        failedIndex: boundary,
        leaderBoundary: boundary,
      }));

    if (dispatched.outcome ===
        RAFT_SNAPSHOT_CATCHUP_DISPATCH_OUTCOME.CHECKPOINT_CREATION_FAILED) {
      assert.equal(dispatched.creation.outcome,
        RAFT_CHECKPOINT_CREATION_OUTCOME.UNSUPPORTED_ADAPTER,
        'current red enters the checkpoint owner');
      assert.deepEqual(dispatched.creation.reasons,
        [RAFT_RS_CHECKPOINT_REASON.PAYLOAD_KIND_REQUIRED],
        'current red is precisely raft-rs payload-kind ownership');
      assert.equal(bulkSocketLookups, 0,
        'current failure precedes the deliberate bulk no-peer cut');
      t.diagnostic(JSON.stringify({
        stage: 'CHECKPOINT_CREATION',
        outcome: dispatched.outcome,
        creationOutcome: dispatched.creation.outcome,
        reasons: dispatched.creation.reasons,
        downstream: 'NOT_REACHED',
      }));
      assert.fail('NOT_REACHED: sender native publication, proof-gated ' +
        'compaction, MsgSnapshot observation and restart reproduction');
    }

    assert.equal(dispatched.outcome,
      RAFT_SNAPSHOT_CATCHUP_DISPATCH_OUTCOME.SOCKET_UNAVAILABLE,
      'image publication and native compaction precede the deliberate bulk cut');
    assert.equal(observedNativePackets.some(({packet}) =>
      packet?.message?.msgType === RAFT_RS_MESSAGE_TYPE.SNAPSHOT), false,
    'no MsgSnapshot is emitted before valid publication and peer demand');
    harness.network.rewriteTo(addressOf(lagger), (message) =>
      message.msgType === RAFT_RS_MESSAGE_TYPE.SNAPSHOT ? null : message);
    harness.network.heal();
    const belowBoundaryRequest = await waitFor(() =>
      observedNativePackets.some(({packet}) => {
        const message = packet?.message;
        return message?.msgType === RAFT_RS_MESSAGE_TYPE.APPEND_RESPONSE &&
          message.from === laggerPeerId && message.to === leaderPeerId &&
          message.reject === true &&
          typeof message.rejectHint === 'string' && BigInt(message.rejectHint) <=
            BigInt(boundary);
      }));
    assert.equal(belowBoundaryRequest, true,
      'real lagger rejects append with a hint at or below compacted boundary');
    const requestPosition = observedNativePackets.findIndex(({packet}) => {
      const message = packet?.message;
      return message?.msgType === RAFT_RS_MESSAGE_TYPE.APPEND_RESPONSE &&
        message.from === laggerPeerId && message.to === leaderPeerId &&
        message.reject === true && typeof message.rejectHint === 'string' &&
        BigInt(message.rejectHint) <= BigInt(boundary);
    });
    const emitted = await waitFor(() => observedNativePackets.slice(
      requestPosition + 1).some(({packet}) => packet?.message?.msgType ===
        RAFT_RS_MESSAGE_TYPE.SNAPSHOT));
    assert.equal(emitted, true,
      'real sendToPeer emits sender-produced MsgSnapshot');
    const snapshotPacket = observedNativePackets.slice(requestPosition + 1)
      .find(({packet}) =>
        packet?.message?.msgType === RAFT_RS_MESSAGE_TYPE.SNAPSHOT).packet;
    assert.equal(snapshotPacket.groupId, PARTITION_ID);
    assert.equal(snapshotPacket.message.to, laggerPeerId);
    assert.equal(snapshotPacket.message.snapshot.metadata.index,
      String(boundary));
    assert.equal(snapshotPacket.message.snapshot.metadata.term,
      durableRecord(leaderDbPath).snapshot.metadata.term);

    const beforeRestart = durableRecord(leaderDbPath).snapshot;
    assert.notEqual(beforeRestart, null,
      'sender publication is durable before restart');
    assert.equal(beforeRestart.metadata.index, String(boundary));
    assert.equal(beforeRestart.metadata.membershipGenerationIndex,
      source.membershipGenerationIndex,
      'native snapshot retains exact group generation, not publication epoch');

    const leaderMember = harness.members.get(leader.replicaId);
    await leader.shutdown();
    const restarted = harness.build(leaderMember, {
      replicaIds: FOUNDERS.map(([replicaId]) => replicaId),
      peerAddresses: FOUNDERS.map(addressOf),
      cache: harness.caches.get(leader.replicaId),
      deferElection: true,
      bootstrapMembership: durableRecordBootstrap(),
    });
    await restarted.initialize();
    const afterRestart = durableRecord(harness.dbPathOf(leaderMember)).snapshot;
    assert.deepEqual(afterRestart, beforeRestart,
      'restart reconstructs the exact published native snapshot binding');
    const priorPacketCount = observedNativePackets.length;
    restarted.startElection();
    assert.equal(await waitFor(() =>
      harness.leader()?.replicaId === restarted.replicaId), true,
    'same-file restarted sender becomes the real leader');
    const reemitted = await waitFor(() => observedNativePackets.slice(
      priorPacketCount).some(({packet}) => packet?.message?.msgType ===
        RAFT_RS_MESSAGE_TYPE.SNAPSHOT));
    assert.equal(reemitted, true,
      'restarted native core genuinely re-emits the durable snapshot');
  } finally {
    await harness.dispose();
  }
});
