/**
 * Future-green R6 owner witness. The first current failure is the registered
 * checkpoint owner. Everything after that assertion requires a genuine
 * production-created image and native packet; this test never constructs a
 * Snapshot, Ready, transfer offer, or receiver database image itself.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';

import Database from 'better-sqlite3';

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
import {durableRecordBootstrap} from
  '../../../src/raft/raft-committed-membership-stamp.js';
import {CLUSTER_ID_CONFIG_KEY} from
  '../../../src/bootstrap/cluster-identity-constants.js';
import {INITIAL_PARTITION_IDS} from
  '../../../src/bootstrap/system-table-schemas-constants.js';
import {TABLES} from '../../../src/constants/index.js';
import {digest as canonicalDataDigest} from
  '../../../src/utils/canonical-json-data.js';
import {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  CONTROL_PLANE_READ_LEADER_MODE,
} from '../../../src/control-plane/control-plane-system-table-gateway.js';
import {RaftRsDurableStore} from
  '../../../src/raft/raft-rs-durable-store.js';
import * as RaftRsRuntimeOwner from
  '../../../src/raft/raft-rs-runtime-owner.js';
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

const PARTITION_ID = 'snapshot-r6-e2e-p1';
const TABLE_NAME = 'committed_membership_table';
const MANIFEST_TABLE = 'raft_rs_checkpoint_manifest';
const FOUNDERS = Object.freeze([
  ['snapshot-r6-r1', 'snapshot-r6-n1'],
  ['snapshot-r6-r2', 'snapshot-r6-n2'],
  ['snapshot-r6-r3', 'snapshot-r6-n3'],
]);
const BOUNDARY_ROW = 71;
const TAIL_ROW = 72;
const PUBLICATION_EPOCH = 9;
const CLUSTER_ID = 'snapshot-r6-cluster';
const TEST_TIMEOUT_MS = 30_000;
const FAST_BYTES_PER_SECOND = 1024 * 1024 * 1024;
const FAST_CAPACITY_BYTES = 8 * 1024 * 1024;

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
          description: 'R6 authoritative cluster identity',
          default_value: '',
          updated_by: 'snapshot-r6-fixture',
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

function rowExists(dbPath, sequence) {
  return observe(dbPath, (db) => db.prepare(
    `SELECT seq FROM ${TABLE_NAME} WHERE seq = ?`).get(sequence)?.seq ===
      sequence);
}

function coherentBoundaryObservation(dbPath) {
  return observe(dbPath, (db) => ({
    rowPresent: db.prepare(
      `SELECT seq FROM ${TABLE_NAME} WHERE seq = ?`).get(BOUNDARY_ROW) !==
        undefined,
    appliedIndex: BigInt(
      RaftRsDurableStore.readDurableRecordIn(db, PARTITION_ID).appliedIndex),
  }));
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

async function waitForValue(read, boundMs = TEST_TIMEOUT_MS) {
  let value;
  const found = await waitFor(() => {
    value = read();
    return value !== undefined && value !== null && value !== false;
  }, boundMs);
  return found ? value : undefined;
}

test('R6 image-first staging waits for genuine native snapshot and preserves ' +
  'receiver ordering through atomic import, restart and tail replay',
{timeout: TEST_TIMEOUT_MS}, async (t) => {
  configure();
  const configOwnerCalls = [];
  const coreEntryObservations = [];
  const snapshotIngressObservations = [];
  const snapshotFeedbackObservations = [];
  const returnedReadyObservations = [];
  const coreEntryObserver = RaftRsRuntimeOwner.setActualCoreEntryObserver;
  const snapshotFeedbackObserver =
    RaftRsRuntimeOwner.setActualSnapshotFeedbackObserver;
  const snapshotIngressObserver =
    RaftRsRuntimeOwner.setActualSnapshotIngressObserver;
  const returnedReadyObserver =
    RaftRsRuntimeOwner.setActualReturnedReadyObserver;
  coreEntryObserver((observation) => {
    coreEntryObservations.push(observation);
  });
  if (typeof snapshotFeedbackObserver === 'function') {
    snapshotFeedbackObserver((observation) => {
      snapshotFeedbackObservations.push(observation);
    });
  }
  if (typeof snapshotIngressObserver === 'function') {
    snapshotIngressObserver((observation) => {
      snapshotIngressObservations.push(observation);
    });
  }
  if (typeof returnedReadyObserver === 'function') {
    returnedReadyObserver((observation) => {
      returnedReadyObservations.push(observation);
    });
  }
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
  const pair = createInProcWebSocketPair();
  let atomicObserver = null;
  const sourceRegistry = createBulkTransferChannelRegistry({
    nodeId: 'snapshot-r6-source-bulk', tokenBucket: tokenBucket(),
  });
  const targetRegistry = createBulkTransferChannelRegistry({
    nodeId: 'snapshot-r6-target-bulk', tokenBucket: tokenBucket(),
  });
  try {
    await formGroup(harness, FOUNDERS);
    const source = harness.leader();
    assert.notEqual(source, undefined,
      'real file-backed three-voter source elects a leader');
    const targetMember = FOUNDERS.find(([replicaId]) =>
      replicaId !== source.replicaId);
    const target = harness.members.get(targetMember[0]);
    const targetService = harness.services.get(targetMember[0]);
    const sourceDbPath = harness.dbPathOf(
      harness.members.get(source.replicaId));
    const targetDbPath = harness.dbPathOf(targetMember);
    const targetPeer = peerIdFor(targetDbPath, targetMember[0]);
    const atomicObservations = [];
    atomicObserver = setInterval(() => {
      atomicObservations.push(coherentBoundaryObservation(targetDbPath));
    }, 1);
    harness.network.cut(addressOf(targetMember), targetPeer);

    const inserted = await source.insertData(TABLE_NAME, {seq: BOUNDARY_ROW});
    assert.equal(inserted.success, true,
      'source acknowledges an application row while the intact target lags');
    assert.equal(await waitFor(() => rowExists(sourceDbPath, BOUNDARY_ROW)),
      true, 'source readonly observer sees the acknowledged boundary row');
    assert.equal(rowExists(targetDbPath, BOUNDARY_ROW), false,
      'target is an intact registered member and genuinely behind');

    const sourceConnection = sourceRegistry.adoptIncomingSocket({
      nodeId: targetMember[1], ws: pair.a,
    });
    armSnapshotOfferRouting({
      registry: targetRegistry,
      replicaHandler: {
        localServices: new Map([[targetMember[0], targetService]]),
        async requireActiveReplicaStorageAdmission() {
          throw new Error('NOT_REACHED: intact install cannot use CREATE');
        },
        async createPartitionService() {
          throw new Error('NOT_REACHED: intact install keeps the service');
        },
        replaceLocalReplicaService() {
          throw new Error('NOT_REACHED: intact install keeps registration');
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
          getConnection: (nodeId) =>
            nodeId === targetMember[1] ? sourceConnection : null,
          async dial() {
            return null;
          },
        },
      },
    });

    const sourceBefore = durableRecord(sourceDbPath);
    const boundary = Number(sourceBefore.appliedIndex);
    const nativePacketCursor = nativePackets.length;
    const packetsBeforeDispatch = snapshotPackets(nativePackets).length;
    const dispatched = await source.onSnapshotCatchupNeeded(
      buildSnapshotCatchupDecision({
        outcome: RAFT_SNAPSHOT_CATCHUP_DECISION_OUTCOME.INSTALL_SNAPSHOT,
        followerAddress: addressOf(targetMember),
        startIndex: 1,
        failedIndex: boundary,
        leaderBoundary: boundary,
      }));

    if (dispatched.outcome ===
        RAFT_SNAPSHOT_CATCHUP_DISPATCH_OUTCOME.CHECKPOINT_CREATION_FAILED) {
      assert.equal(dispatched.creation.outcome,
        RAFT_CHECKPOINT_CREATION_OUTCOME.UNSUPPORTED_ADAPTER,
        'current red enters the real registered checkpoint owner');
      assert.deepEqual(dispatched.creation.reasons,
        [RAFT_RS_CHECKPOINT_REASON.PAYLOAD_KIND_REQUIRED],
        'first red is exactly omitted raftRsGroupId/payload-kind ownership');
      assert.equal(snapshotPackets(nativePackets).length,
        packetsBeforeDispatch,
        'no fabricated/native snapshot packet appears after failed creation');
      assert.equal(routeOutcomes.length, 0,
        'receiver bulk ingress is downstream, not failed fixture setup');
      t.diagnostic(JSON.stringify({
        stage: 'REGISTERED_CHECKPOINT_OWNER',
        outcome: dispatched.outcome,
        creationOutcome: dispatched.creation.outcome,
        reasons: dispatched.creation.reasons,
        downstream: [
          'V2_IMAGE', 'NATIVE_PUBLICATION', 'GENUINE_MSG_SNAPSHOT',
          'VERIFIED_BULK_STAGE', 'RECEIVER_READY', 'ATOMIC_APP_READY_COMMIT',
          'SAME_SERVICE_CONTINUATION', 'RESTART', 'TAIL_REPLAY',
        ].map((stage) => ({stage, state: 'NOT_REACHED'})),
      }));
      assert.fail('NOT_REACHED: R6 genuine native/bulk/Ready/import chain');
    }

    assert.equal(dispatched.outcome,
      RAFT_SNAPSHOT_CATCHUP_DISPATCH_OUTCOME.SERVED,
      'image-first production dispatch completes verified bulk staging before native admission');
    assert.equal(routeOutcomes.length, 1,
      'stage-first transfer produces one registered receiver outcome');
    const stageFirst = await routeOutcomes[0].completion;
    assert.equal(stageFirst.outcome, 'awaiting_native_snapshot',
      'verified image remains pending until genuine native packet admission');
    assert.equal(returnedReadyObservations.some((observation) =>
      observation.peerId === targetPeer && observation.ready?.snapshot), false,
    'image-first stage remains pending before target returns native Ready');
    assert.equal(configOwnerCalls.length, 1,
      'source sealing reads cluster identity once from the CONFIG owner');
    assert.equal(routeOutcomes.length > 0, true,
      'production receiver offer routing reports its typed outcome');

    const sourceCheckpoint = path.join(
      resolveReplicaCheckpointsRoot(sourceDbPath), String(boundary));
    const targetCheckpoint = path.join(
      resolveReplicaCheckpointsRoot(targetDbPath), String(boundary));
    const sourceDescriptorBytes = fs.readFileSync(path.join(
      sourceCheckpoint, RAFT_CHECKPOINT_DESCRIPTOR_FILE));
    const targetDescriptorBytes = fs.readFileSync(path.join(
      targetCheckpoint, RAFT_CHECKPOINT_DESCRIPTOR_FILE));
    assert.deepEqual(targetDescriptorBytes, sourceDescriptorBytes,
      'verified bulk stage retains the exact offered descriptor');
    const sourcePayload = path.join(sourceCheckpoint,
      RAFT_CHECKPOINT_PAYLOAD_FILE);
    const targetPayload = path.join(targetCheckpoint,
      RAFT_CHECKPOINT_PAYLOAD_FILE);
    assert.deepEqual(fs.readFileSync(targetPayload), fs.readFileSync(sourcePayload),
      'verified bulk stage retains the exact application image bytes');
    const manifest = readManifest(sourcePayload);
    assert.equal(manifest.value.payloadVersion, 2,
      'bulk image contains the canonical v2 manifest');

    harness.network.heal();
    const genuinePacket = await waitForValue(() =>
      snapshotPackets(nativePackets.slice(nativePacketCursor))
        .find(({packet}) => packet.message.to === targetPeer)?.packet);
    assert.notEqual(genuinePacket, undefined,
      'native Storage produces the actual MsgSnapshot sent to the target');
    const nativeBinding = decodeNativeBinding(genuinePacket);
    assert.equal(nativeBinding.value.bindingVersion, 1);
    assert.deepEqual(nativeBinding.value.checkpoint.raftRs,
      manifest.value.raftRs,
      'native N and sealed M bind the exact same raft-rs boundary');
    assert.equal(genuinePacket.message.snapshot.metadata.index,
      String(boundary), 'native Ready message carries exact boundary B');

    let imported;
    try {
      imported = await waitFor(() => rowExists(targetDbPath, BOUNDARY_ROW));
    } finally {
      clearInterval(atomicObserver);
      atomicObserver = null;
    }
    assert.equal(imported, true,
      'actual receiver ingress/Ready imports the boundary row');
    atomicObservations.push(coherentBoundaryObservation(targetDbPath));
    assert.equal(atomicObservations.every((observation) =>
      !observation.rowPresent || observation.appliedIndex >= BigInt(boundary)),
    true, 'readonly observers never see application import before Ready state');
    const targetAfter = durableRecord(targetDbPath);
    assert.equal(targetAfter.appliedIndex, String(boundary),
      'application row and Ready applied boundary are jointly visible');
    assert.deepEqual(targetAfter.snapshot.data,
      genuinePacket.message.snapshot.data,
      'durable receiver snapshot is the exact admitted native binding');
    assert.equal(typeof returnedReadyObserver, 'function',
      'repaired native path must expose the approved passive Ready observer');
    assert.equal(typeof snapshotFeedbackObserver, 'function',
      'repaired sender path must expose passive current-attempt feedback');
    assert.equal(typeof snapshotIngressObserver, 'function',
      'repaired receiver path must expose passive ingress completion');
    const acceptedReady = returnedReadyObservations.find((observation) =>
      observation.groupId === PARTITION_ID &&
      observation.peerId === targetPeer &&
      observation.replicaIdentity === targetMember[0] &&
      Number.isSafeInteger(observation.runtimeGeneration) &&
      observation.runtimeGeneration > 0 &&
      typeof observation.lifecycleIncarnation === 'string' &&
      observation.lifecycleIncarnation.length > 0 &&
      observation.ready?.snapshot?.data ===
        genuinePacket.message.snapshot.data &&
      observation.ready.snapshot.metadata.index === String(boundary));
    assert.notEqual(acceptedReady, undefined,
      'matched control observes exact target identity/generation/N Ready');
    const acceptedIngress = await waitForValue(() =>
      snapshotIngressObservations.find((observation) =>
        observation.groupId === PARTITION_ID &&
        observation.peerId === targetPeer &&
        observation.replicaIdentity === targetMember[0] &&
        observation.lifecycleIncarnation ===
          acceptedReady.lifecycleIncarnation &&
        observation.runtimeGeneration === acceptedReady.runtimeGeneration &&
        observation.packet?.from === genuinePacket.message.from &&
        observation.packet?.to === genuinePacket.message.to &&
        observation.packet?.snapshotIndex === String(boundary) &&
        observation.packet.packetDigest ===
          canonicalDataDigest(genuinePacket.message) &&
        observation.step?.entered === true &&
        observation.drain?.completed === true &&
        observation.drain.returnedReadySequences?.includes(
          acceptedReady.sequence)));
    assert.notEqual(acceptedIngress, undefined,
      'matched control observes this exact packet through completed drain');
    assert.equal(acceptedIngress.drain.result?.outcome, 'CORE_OK',
      'matched packet completes its own receiver Ready drain');
    assert.equal(typeof acceptedIngress.packet.nativeBindingDigest, 'string',
      'matched completion binds the digest of actual validated N bytes');
    assert.equal(harness.services.get(targetMember[0]), targetService,
      'intact install continues with the same registered service object');
    assert.equal(targetService.isShutdown, false,
      'same service remains open after the atomic import');

    await targetService.shutdown();
    const restartedTarget = harness.build(target, {
      replicaIds: FOUNDERS.map(([replicaId]) => replicaId),
      peerAddresses: FOUNDERS.map(addressOf),
      cache: harness.caches.get(targetMember[0]),
      deferElection: true,
      bootstrapMembership: durableRecordBootstrap(),
    });
    await restartedTarget.initialize();
    assert.equal(rowExists(targetDbPath, BOUNDARY_ROW), true,
      'same-file restart preserves the atomic application image');
    assert.deepEqual(durableRecord(targetDbPath).snapshot.data,
      nativeBinding.bytes.toString('base64'),
      'restart preserves the exact native binding bytes');

    const tail = await source.insertData(TABLE_NAME, {seq: TAIL_ROW});
    assert.equal(tail.success, true,
      'source commits a later ordinary command after snapshot boundary');
    assert.equal(await waitFor(() => rowExists(targetDbPath, TAIL_ROW)), true,
      'restarted intact target applies the later committed tail');
  } finally {
    if (atomicObserver !== null) clearInterval(atomicObserver);
    coreEntryObserver(null);
    if (typeof snapshotFeedbackObserver === 'function') {
      snapshotFeedbackObserver(null);
    }
    if (typeof snapshotIngressObserver === 'function') {
      snapshotIngressObserver(null);
    }
    if (typeof returnedReadyObserver === 'function') {
      returnedReadyObserver(null);
    }
    sourceRegistry.closeAll();
    targetRegistry.closeAll();
    await harness.dispose();
  }
});
