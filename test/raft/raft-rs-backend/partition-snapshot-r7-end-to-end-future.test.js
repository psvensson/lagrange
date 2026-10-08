/**
 * Future-green R7 owner witness. The first current failure is the registered
 * checkpoint owner. Everything after that assertion requires a genuine
 * production-created image and native packet; this test never constructs a
 * Snapshot, Ready, transfer offer, or receiver database image itself.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';

import Database from 'better-sqlite3';

import * as raftRsRuntimeOwner from
  '../../../src/raft/raft-rs-runtime-owner.js';
import * as raftRsDurableStoreModule from
  '../../../src/raft/raft-rs-durable-store.js';
import * as partitionRaftInitBase from
  '../../../src/partition/partition-service-raft-init-base.js';

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
import {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  CONTROL_PLANE_READ_LEADER_MODE,
} from '../../../src/control-plane/control-plane-system-table-gateway.js';
import {RaftRsDurableStore} from
  '../../../src/raft/raft-rs-durable-store.js';
import {resolveReplicaCheckpointsRoot} from
  '../../../src/raft/snapshot-install.js';
import {sha256Digest} from
  '../../../src/runtime/oci-host-agent-durable-files.js';
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

const PARTITION_ID = 'snapshot-r7-e2e-p1';
const TABLE_NAME = 'committed_membership_table';
const MANIFEST_TABLE = 'raft_rs_checkpoint_manifest';
const FOUNDERS = Object.freeze([
  ['snapshot-r7-r1', 'snapshot-r7-n1'],
  ['snapshot-r7-r2', 'snapshot-r7-n2'],
  ['snapshot-r7-r3', 'snapshot-r7-n3'],
]);
const BOUNDARY_ROW = 71;
const TAIL_ROW = 72;
const PUBLICATION_EPOCH = 9;
const CLUSTER_ID = 'snapshot-r7-cluster';
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
          description: 'R7 authoritative cluster identity',
          default_value: '',
          updated_by: 'snapshot-r7-fixture',
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

function traceKind(event) {
  return event?.classification?.kind ?? event?.classification?.category ??
    event?.classification?.type ?? null;
}

function traceOperation(event) {
  return event?.classification?.operation ?? event?.classification?.statement ??
    event?.classification?.control ?? null;
}

function isTransactionControl(event, operation) {
  return traceKind(event) === 'transaction_control' &&
    traceOperation(event) === operation;
}

function isMutation(event) {
  return traceKind(event) === 'mutation';
}

function semanticPhase(event) {
  return event?.phase ?? event?.kind ?? null;
}

function semanticCategory(event) {
  return event?.category ?? event?.factCategory ?? null;
}

function requirePhysicalAtomicTrace({sqliteTraceEvents, physicalEvents,
  targetDbPath, targetMember, matchingReadyEvent, genuinePacket,
  nativeBindingDigest}) {
  assert.equal(nativeBindingDigest, sha256Digest(Buffer.from(
    genuinePacket.message.snapshot.data, 'base64')),
  'test computes native binding digest from exact canonical N bytes');
  const acceptedPhysical = physicalEvents.find((event) =>
    semanticPhase(event) === 'WORK_RETURNED' &&
    event.groupId === PARTITION_ID &&
    event.replicaIdentity === targetMember[0] &&
    event.runtimeGeneration === matchingReadyEvent.runtimeGeneration &&
    event.nativeBindingDigest === nativeBindingDigest);
  assert.notEqual(acceptedPhysical, undefined,
    'physical observer names the accepted image transaction for exact N');
  const {transactionId, connectionId} = acceptedPhysical;
  assert.notEqual(transactionId, undefined,
    'accepted image transaction has owner-minted transactionId');
  assert.notEqual(connectionId, undefined,
    'accepted image transaction is correlated to one traced connection');

  const opened = sqliteTraceEvents.filter((event) =>
    event.kind === 'connection_opened' &&
    event.connectionId === connectionId &&
    event.partitionId === PARTITION_ID &&
    event.replicaId === targetMember[0] &&
    event.dbPath === targetDbPath);
  assert.equal(opened.length, 1,
    'accepted image transaction uses the traced target receiver connection');

  const transactionEvents = physicalEvents.filter((event) =>
    event.transactionId === transactionId &&
    event.connectionId === connectionId &&
    event.groupId === PARTITION_ID &&
    event.replicaIdentity === targetMember[0]);
  const phases = new Set(transactionEvents.map(semanticPhase));
  for (const phase of ['FULL_ESTABLISHED', 'WORK_ENTERED',
    'WORK_RETURNED', 'COMMIT_ATTEMPTED', 'COMMIT_RETURNED']) {
    assert.equal(phases.has(phase), true,
      `physical transaction observer emits ${phase}`);
  }
  const factEvents = transactionEvents
    .filter((event) => semanticPhase(event) === 'FACT_WRITTEN');
  const intervals = factEvents
    .map((event) => event.physicalPositionInterval)
    .filter((interval) => Array.isArray(interval) && interval.length === 2 &&
      interval.every((position) => Number.isSafeInteger(position)));
  assert.equal(intervals.length, factEvents.length,
    'every accepted image fact carries a SQL position interval');
  assert.equal(intervals.length > 0, true,
    'accepted image facts carry SQL position intervals');
  const firstMutationPosition = Math.min(...intervals.map(([left]) => left));
  const lastMutationPosition = Math.max(...intervals.map(([, right]) => right));
  const connectionStatements = sqliteTraceEvents.filter((event) =>
    event.connectionId === connectionId && event.kind === 'statement_entered');
  const begin = connectionStatements
    .filter((event) => isTransactionControl(event, 'BEGIN') &&
      event.statementPosition < firstMutationPosition)
    .sort((left, right) => right.statementPosition - left.statementPosition)
    .at(0);
  const commit = connectionStatements
    .filter((event) => isTransactionControl(event, 'COMMIT') &&
      event.statementPosition > lastMutationPosition)
    .sort((left, right) => left.statementPosition - right.statementPosition)
    .at(0);
  assert.notEqual(begin, undefined,
    'accepted image transaction has a traced BEGIN before the first mutation');
  assert.notEqual(commit, undefined,
    'accepted image transaction has a traced COMMIT after the last mutation');
  const transactionStatements = connectionStatements.filter((event) =>
    event.statementPosition >= begin.statementPosition &&
    event.statementPosition <= commit.statementPosition);
  assert.equal(transactionStatements.filter((event) =>
    isTransactionControl(event, 'BEGIN')).length, 1,
  'accepted image transaction has exactly one traced BEGIN on target main DB');
  assert.equal(transactionStatements.filter((event) =>
    isTransactionControl(event, 'COMMIT')).length, 1,
  'accepted image transaction has exactly one traced COMMIT on target main DB');
  assert.equal(transactionStatements.some((event) =>
    ['SAVEPOINT', 'ATTACH', 'DETACH'].includes(traceOperation(event))),
  false, 'accepted image transaction has no savepoint or attached database');
  assert.equal(transactionStatements.some(isMutation), true,
    'accepted image transaction contains classified target mutations');
  for (const [left, right] of intervals) {
    assert.equal(left > begin.statementPosition, true,
      'accepted image mutation starts after BEGIN');
    assert.equal(right < commit.statementPosition, true,
      'accepted image mutation ends before COMMIT');
  }
  const commitAttempt = transactionEvents.find((event) =>
    semanticPhase(event) === 'COMMIT_ATTEMPTED');
  if (Number.isSafeInteger(commitAttempt?.physicalPosition)) {
    assert.equal(commitAttempt.physicalPosition, commit.statementPosition,
      'semantic COMMIT_ATTEMPTED points at the traced COMMIT statement');
  }
  const categories = new Set(factEvents.map(semanticCategory));
  for (const category of ['APPLICATION_ROWSET', 'READY_SNAPSHOT',
    'APPLIED_INDEX', 'FULL_CONF_STATE', 'MEMBERSHIP_GENERATION',
    'INSTALL_COMPLETION']) {
    assert.equal(categories.has(category), true,
      `physical transaction observer writes ${category}`);
  }
}


test('R7 registered source dispatch drives genuine native snapshot, atomic ' +
  'intact import, restart and committed tail replay',
{timeout: TEST_TIMEOUT_MS}, async (t) => {
  configure();
  const configOwnerCalls = [];
  const returnedReadyEvents = [];
  const returnedReadyObserverErrors = [];
  const feedbackEvents = [];
  const feedbackObserverErrors = [];
  const sqliteTraceEvents = [];
  const sqliteTraceObserverErrors = [];
  const physicalEvents = [];
  const physicalObserverErrors = [];
  const installReturnedReadyObserver =
    raftRsRuntimeOwner.setActualReturnedReadyObserver;
  const installFeedbackObserver =
    raftRsRuntimeOwner.setActualSnapshotFeedbackObserver;
  const installSqliteTraceObserver =
    partitionRaftInitBase.setPartitionSqliteTraceObserver;
  const installPhysicalObserver =
    raftRsDurableStoreModule.setRaftRsPhysicalTransactionObserver;
  if (typeof installReturnedReadyObserver === 'function') {
    installReturnedReadyObserver((event) => {
      try {
        returnedReadyEvents.push(event);
      } catch (error) {
        returnedReadyObserverErrors.push(error);
      }
    });
  }
  if (typeof installFeedbackObserver === 'function') {
    installFeedbackObserver((event) => {
      try {
        feedbackEvents.push(event);
      } catch (error) {
        feedbackObserverErrors.push(error);
      }
    });
  }
  if (typeof installSqliteTraceObserver === 'function') {
    installSqliteTraceObserver((event) => {
      try {
        sqliteTraceEvents.push(event);
      } catch (error) {
        sqliteTraceObserverErrors.push(error);
      }
    });
  }
  if (typeof installPhysicalObserver === 'function') {
    installPhysicalObserver((event) => {
      try {
        physicalEvents.push(event);
      } catch (error) {
        physicalObserverErrors.push(error);
      }
    });
  }
  t.after(() => {
    if (typeof installReturnedReadyObserver === 'function') {
      installReturnedReadyObserver(null);
    }
    if (typeof installFeedbackObserver === 'function') {
      installFeedbackObserver(null);
    }
    if (typeof installSqliteTraceObserver === 'function') {
      installSqliteTraceObserver(null);
    }
    if (typeof installPhysicalObserver === 'function') {
      installPhysicalObserver(null);
    }
  });
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
  const sourceRegistry = createBulkTransferChannelRegistry({
    nodeId: 'snapshot-r7-source-bulk', tokenBucket: tokenBucket(),
  });
  const targetRegistry = createBulkTransferChannelRegistry({
    nodeId: 'snapshot-r7-target-bulk', tokenBucket: tokenBucket(),
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
          'PHYSICAL_TRACE', 'SNAPSHOT_FEEDBACK_MATCHED_PATH',
          'MESSAGE_ROUTER_SERVICE_RESPONSE_NOT_CLAIMED',
          'SAME_SERVICE_CONTINUATION', 'RESTART', 'TAIL_REPLAY',
        ].map((stage) => ({stage, state: 'NOT_REACHED'})),
      }));
      assert.fail('NOT_REACHED: R7 genuine native/bulk/Ready/import chain');
    }

    assert.equal(dispatched.outcome,
      RAFT_SNAPSHOT_CATCHUP_DISPATCH_OUTCOME.SERVED,
      'registered production dispatch completes verified bulk staging');
    assert.equal(configOwnerCalls.length, 1,
      'source sealing reads cluster identity once from the CONFIG owner');
    assert.equal(routeOutcomes.length > 0, true,
      'production receiver offer routing reports its typed outcome');
    assert.equal(typeof installFeedbackObserver, 'function',
      'future owner exposes passive snapshot feedback observer before finite schedules can pass');
    assert.equal(feedbackObserverErrors.length, 0,
      'passive feedback collector does not affect source authority');

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

    assert.equal(typeof installReturnedReadyObserver, 'function',
      'future owner exposes the approved passive returned-Ready observer');
    const matchingReadyEvent = await waitForValue(() =>
      returnedReadyEvents.find((event) =>
        event.groupId === PARTITION_ID &&
        String(event.peerId) === String(targetPeer) &&
        event.replicaIdentity === targetMember[0] &&
        event.ready?.snapshot?.data === genuinePacket.message.snapshot.data &&
        sameSnapshotMetadata(event.ready.snapshot.metadata,
          genuinePacket.message.snapshot.metadata)));
    assert.notEqual(matchingReadyEvent, undefined,
      'target runtime reports exact returned Ready N before import');
    assert.equal(returnedReadyObserverErrors.length, 0,
      'passive returned-Ready collector does not affect authority');
    assert.equal(typeof matchingReadyEvent.sequence, 'number',
      'returned-Ready event carries a process observation sequence');
    assert.equal(typeof matchingReadyEvent.lifecycleIncarnation, 'string',
      'returned-Ready event binds target lifecycle identity');
    assert.equal(typeof matchingReadyEvent.ready.mustSync, 'boolean',
      'returned-Ready event preserves native mustSync');

    const imported = await waitFor(() => rowExists(targetDbPath, BOUNDARY_ROW));
    assert.equal(imported, true,
      'actual receiver ingress/Ready imports the boundary row');
    const coherentAfterImport = coherentBoundaryObservation(targetDbPath);
    assert.equal(coherentAfterImport.rowPresent, true,
      'readonly observer sees imported application row');
    assert.equal(coherentAfterImport.appliedIndex >= BigInt(boundary), true,
      'readonly observer sees Ready-applied boundary with imported row');
    const targetAfter = durableRecord(targetDbPath);
    assert.equal(targetAfter.appliedIndex, String(boundary),
      'application row and Ready applied boundary are jointly visible');
    assert.deepEqual(targetAfter.snapshot.data,
      genuinePacket.message.snapshot.data,
      'durable receiver snapshot is the exact admitted native binding');
    assert.equal(typeof installSqliteTraceObserver, 'function',
      'future owner exposes receiver PartitionService SQLite trace hook');
    assert.equal(typeof installPhysicalObserver, 'function',
      'future durable store exposes physical transaction observer');
    assert.equal(sqliteTraceObserverErrors.length, 0,
      'SQLite trace collector does not affect receiver authority');
    assert.equal(physicalObserverErrors.length, 0,
      'physical transaction collector does not affect receiver authority');
    requirePhysicalAtomicTrace({sqliteTraceEvents, physicalEvents,
      targetDbPath, targetMember, matchingReadyEvent, genuinePacket,
      nativeBindingDigest: sha256Digest(nativeBinding.bytes)});
    const matchingFeedback = feedbackEvents.find(
      (event) => event.groupId === PARTITION_ID &&
        String(event.targetPeerId) === String(targetPeer) &&
        event.snapshotIndex === String(boundary));
    if (matchingFeedback !== undefined) {
      assert.equal(matchingFeedback.status, 'finish',
        'held unresolved native response reports Finish only when admitted');
      assert.equal(matchingFeedback.nativeResult?.ok, true,
        'admitted Finish reports successful native report_snapshot');
    }
    assert.equal(feedbackObserverErrors.length, 0,
      'passive feedback collector does not affect source authority');
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
    if (typeof installReturnedReadyObserver === 'function') {
      installReturnedReadyObserver(null);
    }
    if (typeof installFeedbackObserver === 'function') {
      installFeedbackObserver(null);
    }
    if (typeof installSqliteTraceObserver === 'function') {
      installSqliteTraceObserver(null);
    }
    if (typeof installPhysicalObserver === 'function') {
      installPhysicalObserver(null);
    }
    sourceRegistry.closeAll();
    targetRegistry.closeAll();
    await harness.dispose();
  }
});
