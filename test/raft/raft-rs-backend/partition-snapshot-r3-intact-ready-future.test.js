/**
 * Future-green R3 intact-member native Ready/image-binding witness. Current
 * exact82b54 is expected to stop at the registered source checkpoint owner.
 * Downstream assertions require a production-created MsgSnapshot and receiver
 * live native Ready; this test never calls requestSnapshotInstall as a positive
 * and never constructs Snapshot, Ready, transfer offer or receiver DB image.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';

import Database from 'better-sqlite3';

import * as raftRsRuntimeOwner from
  '../../../src/raft/raft-rs-runtime-owner.js';

import {
  armSnapshotOfferRouting,
  attachSnapshotCatchupDispatcher,
} from '../../../src/bootstrap/shared/snapshot-catchup-wiring.js';
import {
  RAFT_CHECKPOINT_CREATION_OUTCOME,
  RAFT_CHECKPOINT_DESCRIPTOR_FILE,
  RAFT_CHECKPOINT_PAYLOAD_FILE,
  RAFT_RS_CHECKPOINT_REASON,
} from '../../../src/raft/snapshot-checkpoint-constants.js';
import {
  RAFT_SNAPSHOT_CATCHUP_DECISION_OUTCOME,
  RAFT_SNAPSHOT_CATCHUP_DISPATCH_OUTCOME,
  buildSnapshotCatchupDecision,
} from '../../../src/raft/snapshot-catchup-constants.js';
import {RAFT_RS_MESSAGE_TYPE} from
  '../../../src/raft/raft-rs-ingress-constants.js';
import {bindingWireNumbers} from './committed-membership-oracles.js';
import {CLUSTER_ID_CONFIG_KEY} from
  '../../../src/bootstrap/cluster-identity-constants.js';
import {INITIAL_PARTITION_IDS} from
  '../../../src/bootstrap/system-table-schemas-constants.js';
import {TABLES} from '../../../src/constants/index.js';
import {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  CONTROL_PLANE_READ_LEADER_MODE,
} from '../../../src/control-plane/control-plane-system-table-gateway.js';
import {RaftRsDurableStore} from
  '../../../src/raft/raft-rs-durable-store.js';
import {resolveReplicaCheckpointsRoot} from
  '../../../src/raft/snapshot-install.js';
import {
  createBulkTransferChannelRegistry,
  createByteRateTokenBucket,
} from '../../../src/transport/bulk-transfer-channel.js';
import {createInProcWebSocketPair} from
  '../../../src/transport/inproc-transport.js';
import {
  addressOf,
  configure,
  createCommittedMembershipHarness,
  formGroup,
  waitFor,
} from './committed-membership-harness.js';

const PARTITION_ID = 'snapshot-r3-intact-p1';
const TABLE_NAME = 'committed_membership_table';
const MANIFEST_TABLE = 'raft_rs_checkpoint_manifest';
const FOUNDERS = Object.freeze([
  ['snapshot-r3-r1', 'snapshot-r3-n1'],
  ['snapshot-r3-r2', 'snapshot-r3-n2'],
  ['snapshot-r3-r3', 'snapshot-r3-n3'],
]);
const BOUNDARY_ROW = 31;
const POST_COMMIT_ROW = 32;
const PUBLICATION_EPOCH = 9;
const CLUSTER_ID = 'snapshot-r3-cluster';
const TEST_TIMEOUT_MS = 30_000;
const FAST_BYTES_PER_SECOND = 1024 * 1024 * 1024;
const FAST_CAPACITY_BYTES = 8 * 1024 * 1024;
const WIRE = bindingWireNumbers();

function publicationCache() {
  return {
    getAll() {
      return [{status: 'PUBLISHED', publication_epoch: PUBLICATION_EPOCH}];
    },
    get(tableName, key) {
      if (tableName === TABLES.CONFIG && key === CLUSTER_ID_CONFIG_KEY) {
        return {config_key: key, config_value: CLUSTER_ID};
      }
      return null;
    },
  };
}

function authoritativeConfigOwner(member, calls) {
  return {
    async executeAuthoritativeSystemTableRead(tableName, sql, params, options) {
      calls.push({tableName, sql, params, options, member});
      assert.equal(tableName, TABLES.CONFIG);
      assert.match(sql, /SELECT config_value FROM config WHERE config_key = \?/u);
      assert.deepEqual(params, [CLUSTER_ID_CONFIG_KEY]);
      assert.equal(options.readAuthority.authoritativeReadMode,
        CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED);
      assert.equal(options.readAuthority.leaderMode,
        CONTROL_PLANE_READ_LEADER_MODE.REQUIRED);
      return {
        success: true,
        rows: [{
          config_key: CLUSTER_ID_CONFIG_KEY,
          config_value: CLUSTER_ID,
          value_type: 'string',
          requires_restart: 0,
          description: 'R3 authoritative cluster identity',
          default_value: '',
          updated_by: 'snapshot-r3-fixture',
          updated_at: 1,
          created_at: 1,
        }],
        readAuthorityWitness: {
          state: 'observed',
          partitionId: INITIAL_PARTITION_IDS[TABLES.CONFIG],
          role: 'leader',
          servingNodeId: member[1],
          servingReplicaId: `${INITIAL_PARTITION_IDS[TABLES.CONFIG]}-r1`,
          observedAtMs: 1,
        },
      };
    },
  };
}

function tokenBucket() {
  return createByteRateTokenBucket({
    bytesPerSecond: FAST_BYTES_PER_SECOND,
    capacityBytes: FAST_CAPACITY_BYTES,
  });
}

function observe(dbPath, callback) {
  const db = new Database(dbPath, {readonly: true, fileMustExist: true});
  try {
    return callback(db);
  } finally {
    db.close();
  }
}

function durableRecord(dbPath) {
  return observe(dbPath, (db) =>
    RaftRsDurableStore.readDurableRecordIn(db, PARTITION_ID));
}

function peerIdFor(dbPath, replicaIdentity) {
  return observe(dbPath, (db) => db.prepare(
    'SELECT raft_peer_id FROM raft_rs_peer_identity ' +
    'WHERE replica_identity = ?').get(replicaIdentity).raft_peer_id);
}

function lifecycleRow(dbPath, replicaIdentity) {
  return observe(dbPath, (db) => {
    const columns = db.prepare(
      'PRAGMA table_info(_raft_rs_replica_lifecycle)').all()
      .map((column) => column.name);
    const row = db.prepare(
      'SELECT * FROM _raft_rs_replica_lifecycle WHERE group_id = ? ' +
      'AND replica_identity = ?').get(PARTITION_ID, replicaIdentity);
    assert.equal(row === undefined || row.replica_identity === replicaIdentity,
      true, 'lifecycle observer reads the exact target replica identity');
    return {columns, row};
  });
}

function rowExists(dbPath, sequence) {
  return observe(dbPath, (db) => db.prepare(
    `SELECT seq FROM ${TABLE_NAME} WHERE seq = ?`).get(sequence)?.seq ===
      sequence);
}

function readManifest(payloadPath) {
  return observe(payloadPath, (db) => {
    const row = db.prepare(
      `SELECT manifest_json FROM ${MANIFEST_TABLE} WHERE singleton = 1`).get();
    return {bytes: row.manifest_json, value: JSON.parse(row.manifest_json)};
  });
}

function decodeNativeBinding(snapshotPacket) {
  const encoded = snapshotPacket.message.snapshot.data;
  const bytes = Buffer.from(encoded, 'base64');
  assert.equal(bytes.toString('base64'), encoded,
    'native Snapshot.data uses canonical padded base64');
  return {bytes, value: JSON.parse(bytes.toString('utf8'))};
}

function snapshotPackets(records) {
  return records.filter(({packet}) =>
    packet?.message?.msgType === RAFT_RS_MESSAGE_TYPE.SNAPSHOT);
}

function sameSnapshotMetadata(left, right) {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

async function waitForValue(read, boundMs = TEST_TIMEOUT_MS) {
  let value;
  const found = await waitFor(() => {
    value = read();
    return value !== undefined && value !== null && value !== false;
  }, boundMs);
  return found ? value : undefined;
}

function snapshotDecisionFor(address, boundary) {
  return buildSnapshotCatchupDecision({
    outcome: RAFT_SNAPSHOT_CATCHUP_DECISION_OUTCOME.INSTALL_SNAPSHOT,
    followerAddress: address,
    startIndex: 1,
    failedIndex: boundary,
    leaderBoundary: boundary,
  });
}

test('R3 intact member catch-up requires real native Ready and preserves ' +
  'target identity and election state', {timeout: TEST_TIMEOUT_MS}, async (t) => {
  configure();
  const configOwnerCalls = [];
  const harness = createCommittedMembershipHarness(PARTITION_ID, {
    cdcIntegrationServiceFactory: (member) =>
      authoritativeConfigOwner(member, configOwnerCalls),
  });
  const nativePackets = [];
  const routeOutcomes = [];
  const nativeDeliver = harness.network.deliver.bind(harness.network);
  harness.network.deliver = async (address, packet) => {
    nativePackets.push({address, packet});
    return nativeDeliver(address, packet);
  };
  const sourceRegistry = createBulkTransferChannelRegistry({
    nodeId: 'snapshot-r3-source-bulk', tokenBucket: tokenBucket(),
  });
  const targetRegistry = createBulkTransferChannelRegistry({
    nodeId: 'snapshot-r3-target-bulk', tokenBucket: tokenBucket(),
  });
  const pair = createInProcWebSocketPair();
  const returnedReadyEvents = [];
  const returnedReadyObserverErrors = [];
  const installReturnedReadyObserver =
    raftRsRuntimeOwner.setActualReturnedReadyObserver;
  if (typeof installReturnedReadyObserver === 'function') {
    installReturnedReadyObserver((event) => {
      try {
        returnedReadyEvents.push(event);
      } catch (error) {
        returnedReadyObserverErrors.push(error);
      }
    });
  }
  try {
    await formGroup(harness, FOUNDERS);
    const source = harness.leader();
    assert.notEqual(source, undefined,
      'real file-backed three-voter source elects a leader');
    const targetMember = FOUNDERS.find(([replicaId]) =>
      replicaId !== source.replicaId);
    const targetService = harness.services.get(targetMember[0]);
    const sourceDbPath = harness.dbPathOf(
      harness.members.get(source.replicaId));
    const targetDbPath = harness.dbPathOf(targetMember);
    const targetPeer = peerIdFor(targetDbPath, targetMember[0]);
    const targetLifecycleBefore = lifecycleRow(targetDbPath, targetMember[0]);
    const targetBefore = durableRecord(targetDbPath);
    const targetRuntimeGenerationBefore =
      targetService.raft.readStatus().runtimeGeneration;
    assert.equal(typeof targetRuntimeGenerationBefore, 'number',
      'target runtime generation is observable before catch-up');
    assert.notEqual(targetLifecycleBefore, undefined,
      'target lifecycle/incarnation is durable before snapshot catch-up');
    assert.notEqual(targetBefore.hardState, null,
      'target durable HardState exists before catch-up');

    harness.network.cut(addressOf(targetMember), targetPeer);
    const inserted = await source.insertData(TABLE_NAME, {seq: BOUNDARY_ROW});
    assert.equal(inserted.success, true,
      'source acknowledges a boundary row while the intact target lags');
    assert.equal(await waitFor(() => rowExists(sourceDbPath, BOUNDARY_ROW)),
      true, 'source readonly observer sees the acknowledged boundary row');
    assert.equal(rowExists(targetDbPath, BOUNDARY_ROW), false,
      'target is an intact registered member and genuinely behind');

    armSnapshotOfferRouting({
      registry: targetRegistry,
      replicaHandler: {
        localServices: new Map([[targetMember[0], targetService]]),
        async requireActiveReplicaStorageAdmission() {
          throw new Error('NOT_REACHED: R3 intact install cannot use CREATE');
        },
        async createPartitionService() {
          throw new Error('NOT_REACHED: R3 intact install keeps the service');
        },
        replaceLocalReplicaService() {
          throw new Error('NOT_REACHED: R3 intact install keeps registration');
        },
      },
      systemTableCache: publicationCache(),
      onRouteOutcome: (outcome) => routeOutcomes.push(outcome),
    });
    targetRegistry.adoptIncomingSocket({
      nodeId: source.nodeId, ws: pair.b,
    });
    attachSnapshotCatchupDispatcher({
      service: source,
      systemTableCache: publicationCache(),
      controlPlaneSystemTableGateway: source.controlPlaneSystemTableGateway,
      messageRouter: {
        nodeId: source.nodeId,
        nodeAddress: `ws://${source.nodeId}:7000`,
        advertisedAddress: `ws://${source.nodeId}:7000`,
        bootIncarnation: 1,
        bulkChannelRegistry: {
          getConnection: () => null,
          async dial() {
            return null;
          },
        },
      },
    });

    const sourceBefore = durableRecord(sourceDbPath);
    const boundary = Number(sourceBefore.appliedIndex);
    const packetsBeforeDispatch = snapshotPackets(nativePackets).length;
    const precreated = await source.onSnapshotCatchupNeeded(
      snapshotDecisionFor(addressOf(targetMember), boundary));

    if (precreated.outcome ===
        RAFT_SNAPSHOT_CATCHUP_DISPATCH_OUTCOME.CHECKPOINT_CREATION_FAILED) {
      assert.equal(precreated.creation.outcome,
        RAFT_CHECKPOINT_CREATION_OUTCOME.UNSUPPORTED_ADAPTER,
        'current red enters the real registered checkpoint owner');
      assert.deepEqual(precreated.creation.reasons,
        [RAFT_RS_CHECKPOINT_REASON.PAYLOAD_KIND_REQUIRED],
        'first red is exactly omitted raftRsGroupId/payload-kind ownership');
      assert.equal(snapshotPackets(nativePackets).length,
        packetsBeforeDispatch,
        'no fabricated native snapshot packet appears after failed creation');
      assert.equal(routeOutcomes.length, 0,
        'receiver native Ready/image binding is downstream, not setup failure');
      t.diagnostic(JSON.stringify({
        stage: 'REGISTERED_CHECKPOINT_OWNER',
        outcome: precreated.outcome,
        creationOutcome: precreated.creation.outcome,
        reasons: precreated.creation.reasons,
        downstream: [
          'V2_IMAGE', 'GENUINE_MSG_SNAPSHOT', 'RECEIVER_READY',
          'TARGET_IDENTITY_INCARNATION', 'ELECTION_STATE_PRESERVATION',
          'HISTORICAL_B_CONFSTATE_GENERATION',
          'B_LT_K_JOINT_CONFIG',
          'DELAYED_PACKET_AFTER_SOURCE_QUORUM_LOSS',
          'NO_ORDINARY_PUTSNAPSHOT_REJECTION', 'NO_EXTRA_MAJORITY_PROOF',
        ].map((stage) => ({stage, state: 'NOT_REACHED'})),
      }));
      assert.fail('NOT_REACHED: R3 requires receiver native Ready/image binding');
    }

    assert.equal(precreated.outcome,
      RAFT_SNAPSHOT_CATCHUP_DISPATCH_OUTCOME.SOCKET_UNAVAILABLE,
      'registered production dispatcher seals B before socket refusal');
    assert.equal(configOwnerCalls.length, 1,
      'source precreation reads cluster identity once from the CONFIG owner');
    assert.equal(routeOutcomes.length, 0,
      'precreation does not reach receiver bulk ingress');

    const jointChange = await source.raft.proposeConfChange({
      transition: WIRE.transition.Explicit,
      changes: [{
        changeType: WIRE.changeType.RemoveNode,
        nodeId: targetPeer,
      }],
    });
    assert.equal(jointChange.outcome, 'CORE_OK',
      'source accepts explicit RemoveNode(target) for K>B: ' +
        JSON.stringify(jointChange));
    const sourceAfterJoint = await waitForValue(() => {
      const record = durableRecord(sourceDbPath);
      return BigInt(record.membershipGenerationIndex) >
          BigInt(sourceBefore.membershipGenerationIndex) &&
        (record.confState.votersOutgoing || []).length > 0 ? record : null;
    });
    assert.notEqual(sourceAfterJoint, undefined,
      'source reaches deterministic K>B joint ConfState after historical B');

    const sourceConnection = sourceRegistry.adoptIncomingSocket({
      nodeId: targetMember[1], ws: pair.a,
    });
    attachSnapshotCatchupDispatcher({
      service: source,
      systemTableCache: publicationCache(),
      controlPlaneSystemTableGateway: source.controlPlaneSystemTableGateway,
      messageRouter: {
        nodeId: source.nodeId,
        nodeAddress: `ws://${source.nodeId}:7000`,
        advertisedAddress: `ws://${source.nodeId}:7000`,
        bootIncarnation: 1,
        bulkChannelRegistry: {
          getConnection: (nodeId) =>
            nodeId === targetMember[1] ? sourceConnection : null,
          async dial() {
            return null;
          },
        },
      },
    });
    const staged = await source.onSnapshotCatchupNeeded(
      snapshotDecisionFor(addressOf(targetMember), boundary));
    assert.equal(staged.outcome,
      RAFT_SNAPSHOT_CATCHUP_DISPATCH_OUTCOME.SERVED,
      'registered production dispatch serves precreated B over real bulk');
    assert.equal(configOwnerCalls.length, 1,
      'serving precreated B does not reseal another CONFIG-owned image');
    assert.equal(routeOutcomes.length > 0, true,
      'production receiver offer routing reports its typed outcome');

    const sourceCheckpoint = path.join(
      resolveReplicaCheckpointsRoot(sourceDbPath), String(boundary));
    const targetCheckpoint = path.join(
      resolveReplicaCheckpointsRoot(targetDbPath), String(boundary));
    const targetDescriptor = fs.readFileSync(path.join(targetCheckpoint,
      RAFT_CHECKPOINT_DESCRIPTOR_FILE));
    const sourceDescriptor = fs.readFileSync(path.join(sourceCheckpoint,
      RAFT_CHECKPOINT_DESCRIPTOR_FILE));
    assert.deepEqual(targetDescriptor, sourceDescriptor,
      'verified bulk stage retains the exact offered descriptor');
    const targetPayloadBytes = fs.readFileSync(path.join(targetCheckpoint,
      RAFT_CHECKPOINT_PAYLOAD_FILE));
    const sourcePayloadPath = path.join(sourceCheckpoint,
      RAFT_CHECKPOINT_PAYLOAD_FILE);
    assert.deepEqual(targetPayloadBytes, fs.readFileSync(sourcePayloadPath),
      'verified bulk stage retains the exact application image bytes');
    const manifest = readManifest(sourcePayloadPath);
    assert.equal(manifest.value.payloadVersion, 2,
      'bulk image contains the canonical v2 manifest');
    const sourceCurrentAfterPublication = durableRecord(sourceDbPath);
    const sourceAppliedAtOrAfterBoundary =
      BigInt(sourceCurrentAfterPublication.appliedIndex) >= BigInt(boundary);
    assert.equal(sourceAppliedAtOrAfterBoundary, true,
      'source current applied remains at or beyond historical boundary B');
    assert.equal(sourceCurrentAfterPublication.membershipGenerationIndex,
      sourceAfterJoint.membershipGenerationIndex,
      'source remains at the inspected K generation while serving B');
    assert.equal(
      BigInt(sourceCurrentAfterPublication.membershipGenerationIndex) >
        BigInt(manifest.value.raftRs.membershipGenerationIndex),
      true,
      'source current K is strictly after historical B generation');
    assert.deepEqual(sourceCurrentAfterPublication.confState,
      sourceAfterJoint.confState,
      'source current ConfState is the inspected post-B joint configuration');
    assert.equal((sourceCurrentAfterPublication.confState.votersOutgoing || [])
      .length > 0, true, 'source current K is a real joint ConfState');
    assert.notDeepEqual(sourceCurrentAfterPublication.confState,
      manifest.value.raftRs.confState,
      'B<K schedule proves current ConfState/generation advanced after B');

    let heldSnapshotPacket = null;
    harness.network.rewriteTo(addressOf(targetMember), (message) => {
      if (message?.msgType === RAFT_RS_MESSAGE_TYPE.SNAPSHOT &&
          String(message.to) === String(targetPeer)) {
        heldSnapshotPacket = {message};
        return null;
      }
      return message;
    });
    harness.network.heal();
    const genuinePacket = await waitForValue(() => heldSnapshotPacket);
    assert.notEqual(genuinePacket, undefined,
      'native Storage produces the actual MsgSnapshot sent to the target');
    assert.equal(typeof installReturnedReadyObserver, 'function',
      'future owner exposes the approved passive returned-Ready observer');
    const nativeBinding = decodeNativeBinding(genuinePacket);
    assert.equal(nativeBinding.value.bindingVersion, 1);
    assert.deepEqual(nativeBinding.value.checkpoint.raftRs,
      manifest.value.raftRs,
      'native N and sealed M bind the exact same raft-rs boundary');
    assert.equal(genuinePacket.message.snapshot.metadata.index,
      String(boundary), 'native packet carries historical boundary B');

    const sourcePeer = peerIdFor(sourceDbPath, source.replicaId);
    const otherMember = FOUNDERS.find(([replicaId]) =>
      replicaId !== source.replicaId && replicaId !== targetMember[0]);
    const otherPeer = peerIdFor(harness.dbPathOf(otherMember), otherMember[0]);
    harness.network.cut(addressOf(harness.members.get(source.replicaId)),
      sourcePeer);
    harness.network.cut(addressOf(otherMember), otherPeer);
    const targetHandler = harness.network.getRegisteredHandler(
      addressOf(targetMember));
    assert.equal(typeof targetHandler, 'function',
      'target has an exact registered transport handler for delayed N');
    await targetHandler({payload: genuinePacket});

    const matchingReadyEvent = await waitForValue(() =>
      returnedReadyEvents.find((event) =>
        event.groupId === PARTITION_ID &&
        String(event.peerId) === String(targetPeer) &&
        event.replicaIdentity === targetMember[0] &&
        event.lifecycleIncarnation ===
          targetLifecycleBefore.row.incarnation &&
        event.runtimeGeneration === targetRuntimeGenerationBefore &&
        event.ready?.snapshot?.data === genuinePacket.message.snapshot.data &&
        sameSnapshotMetadata(event.ready.snapshot.metadata,
          genuinePacket.message.snapshot.metadata)));
    assert.notEqual(matchingReadyEvent, undefined,
      'target runtime reports the passive returned Ready for this exact N');
    assert.equal(returnedReadyObserverErrors.length, 0,
      'passive returned-Ready collector does not affect runtime authority');
    assert.equal(typeof matchingReadyEvent.sequence, 'number',
      'returned-Ready event carries a process observation sequence');
    assert.equal(matchingReadyEvent.runtimeGeneration,
      targetRuntimeGenerationBefore,
      'returned-Ready event binds the selected target runtime generation');
    assert.equal(typeof matchingReadyEvent.ready.mustSync, 'boolean',
      'returned-Ready event preserves the actual native mustSync flag');
    assert.equal(matchingReadyEvent.ready.snapshot.data,
      genuinePacket.message.snapshot.data,
      'returned-Ready N.data matches the admitted native packet bytes');
    assert.deepEqual(matchingReadyEvent.ready.snapshot.metadata,
      genuinePacket.message.snapshot.metadata,
      'returned-Ready metadata preserves index/term/full ConfState');

    const imported = await waitFor(() => rowExists(targetDbPath, BOUNDARY_ROW));
    assert.equal(imported, true,
      'actual receiver ingress/Ready imports the boundary row');
    const targetAfter = durableRecord(targetDbPath);
    const targetLifecycleAfter = lifecycleRow(targetDbPath, targetMember[0]);
    assert.deepEqual(targetLifecycleAfter, targetLifecycleBefore,
      'intact install preserves target-owned lifecycle/incarnation');
    assert.equal(targetAfter.snapshot.data, genuinePacket.message.snapshot.data,
      'durable receiver snapshot is the exact admitted native binding');
    assert.equal(BigInt(targetAfter.appliedIndex) >= BigInt(boundary), true,
      'target applied boundary advances to at least historical B');
    assert.equal(targetAfter.membershipGenerationIndex,
      manifest.value.raftRs.membershipGenerationIndex,
      'target durable generation matches the accepted manifest boundary');
    assert.deepEqual(targetAfter.confState, manifest.value.raftRs.confState,
      'target durable ConfState matches the accepted full snapshot ConfState');
    assert.equal(BigInt(targetAfter.membershipGenerationIndex) <=
      BigInt(sourceCurrentAfterPublication.membershipGenerationIndex), true,
    'receiver accepts historical B without ordinary putSnapshot rejecting G_B below current G_K');
    assert.equal(BigInt(targetAfter.hardState.term) >=
      BigInt(targetBefore.hardState.term), true,
    'target term never regresses across native Ready admission');
    if (targetAfter.hardState.term === targetBefore.hardState.term) {
      assert.equal(targetAfter.hardState.vote, targetBefore.hardState.vote,
        'same-term target vote is preserved');
    }
    assert.equal(harness.services.get(targetMember[0]), targetService,
      'intact install continues with the same registered service object');
    assert.equal(targetService.isShutdown, false,
      'same service remains open after native Ready/image admission');
    const afterInstallInsert = await source.insertData(TABLE_NAME, {
      seq: POST_COMMIT_ROW,
    });
    assert.equal(afterInstallInsert.success, true,
      'source continues to commit ordinary rows after image admission');
    assert.equal(await waitFor(() => rowExists(targetDbPath, POST_COMMIT_ROW)),
      true, 'target service continues applying ordinary rows after image admission');
  } finally {
    if (typeof installReturnedReadyObserver === 'function') {
      installReturnedReadyObserver(null);
    }
    sourceRegistry.closeAll();
    targetRegistry.closeAll();
    await harness.dispose();
  }
});
