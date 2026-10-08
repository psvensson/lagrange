import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';

import {test, beforeEach, afterEach} from
  '../../../src/test-helpers/tap.js';
import {AddressManager} from '../../../src/address/address-manager.js';
import {ConfigurationManager} from
  '../../../src/config/configuration-manager.js';
import {LoggingService} from '../../../src/logging/logging-service.js';
import {NodeService} from '../../../src/node/node-service.js';
import {PartitionService} from
  '../../../src/partition/partition-service.js';
import {ReplicaHandlerSetup} from
  '../../../src/bootstrap/shared/replica-handler-setup.js';
import {armSnapshotOfferRouting} from
  '../../../src/bootstrap/shared/snapshot-catchup-wiring.js';
import {MessageRouter} from '../../../src/transport/message-router.js';
import {createBulkTransferChannelRegistry} from
  '../../../src/transport/bulk-transfer-channel.js';
import {createInProcWebSocketPair} from
  '../../../src/transport/inproc-transport.js';
import {bulkConnectionTransferSocket} from
  '../../../src/raft/bulk-connection-transfer-socket.js';
import {
  RAFT_RS_INGRESS_REFUSAL,
  RAFT_RS_MESSAGE_TYPE,
} from '../../../src/raft/raft-rs-ingress-constants.js';
import {admitRaftRsMessage} from '../../../src/raft/raft-rs-ingress.js';
import {serveSnapshotTransfer} from
  '../../../src/raft/snapshot-transfer.js';
import {RAFT_SNAPSHOT_DEFAULT_CLUSTER_ID} from
  '../../../src/raft/snapshot-catchup-constants.js';
import {
  RAFT_SNAPSHOT_OFFER_ROUTE_OUTCOME,
} from '../../../src/raft/snapshot-offer-router.js';
import {
  RAFT_SNAPSHOT_TRANSFER_OUTCOME,
} from '../../../src/raft/snapshot-transfer-constants.js';
import {
  RAFT_SNAPSHOT_INSTALL_DIRNAME,
  RAFT_SNAPSHOT_INSTALL_MARKER_FILE,
  RAFT_SNAPSHOT_INSTALL_STAGING_FILE,
} from '../../../src/raft/snapshot-install-constants.js';
import {resolveReplicaCheckpointsRoot} from
  '../../../src/raft/snapshot-install.js';
import {createSqliteStateMachineCheckpoint} from
  '../../../src/raft/snapshot-checkpoint-store.js';
import {
  RAFT_CHECKPOINT_CREATION_OUTCOME,
  RAFT_CHECKPOINT_PAYLOAD_FILE,
} from '../../../src/raft/snapshot-checkpoint-constants.js';
import {RaftRsDurableStore} from
  '../../../src/raft/raft-rs-durable-store.js';
import {
  RaftRsPeerIdentityRegistry,
  deriveRaftRsPeerId,
} from '../../../src/raft/raft-rs-peer-identity.js';
import {
  PARTITION_REPLICA_MEMBERSHIP_STATE,
} from '../../../src/partition/partition-replica-membership-constants.js';
import {
  ReplicaOperationField,
  ReplicaOperationMessageType,
  ReplicaOperationResponseStatus,
} from '../../../src/rebalancer/replica-operation-constants.js';
import {withFoundingStamp} from
  '../../partition/partition-founding-stamp.js';
import {
  createLifecycleCdcService,
  createLifecycleServiceRow,
  createLifecycleStateStore,
} from '../../test-helpers/lifecycle-state-store.js';
import {TEST_BOOT_INCARNATION} from
  '../../test-helpers/boot-incarnation-fixture.js';

// R6 future-green suite. The target is a real initialized, file-backed
// PartitionService registered in both production ReplicaHandler registries.
// A real bulk OFFER carries a validly sealed native raft-rs image through the
// production offer router, receiver and orchestrator. Bulk arrival precedes
// any genuine native packet, so the image must remain pending: a ConfState
// difference in bulk metadata is not a native rejection oracle. Downstream
// native branches are encoded only after this first owner transition succeeds
// and only if a genuine sender-produced MsgSnapshot from the real runtime is
// available. On exact82b54, the first owner transition remains red and every
// downstream branch is explicitly NOT_REACHED rather than fabricated.

const NODE_ID = 'snapshot-r6-target-node';
const SOURCE_NODE_ID = 'snapshot-r6-source-node';
const PARTITION_ID = 'snapshot_r6_rows-p1';
const TABLE_ID = 'snapshot_r6_rows';
const REPLICA_ID = 'snapshot_r6_rows-p1-r1';
const SOURCE_REPLICA_ID = 'snapshot_r6_rows-p1-source';
const APPLIED_INDEX = '2';
const APPLIED_TERM = '1';
const MEMBERSHIP_GENERATION = '0';
const HUGE_TIMER_MS = 3_600_000;
const AWAITING_NATIVE_SNAPSHOT = 'awaiting_native_snapshot';
const NATIVE_SNAPSHOT_NOT_ADMITTED = 'native_snapshot_not_admitted';
const NATIVE_SNAPSHOT_BINDING_MISMATCH = 'native_snapshot_binding_mismatch';
const NOT_REACHED = 'NOT_REACHED';
const SCHEMA = Object.freeze({
  columns: [
    {name: 'id', type: 'TEXT', primaryKey: true},
    {name: 'payload', type: 'TEXT'},
  ],
});
const IDENTITY = Object.freeze({
  clusterId: RAFT_SNAPSHOT_DEFAULT_CLUSTER_ID,
  raftGroupId: PARTITION_ID,
  entity: Object.freeze({kind: 'partition', id: TABLE_ID}),
  membershipEpoch: Number(MEMBERSHIP_GENERATION),
});

beforeEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  AddressManager.resetInstance();
  NodeService.resetInstance();
  ConfigurationManager.getInstance().initialize({
    node: {id: NODE_ID},
    logging: {level: 'error'},
    raft: {
      heartbeatIntervalMs: HUGE_TIMER_MS,
      electionTimeoutMinMs: HUGE_TIMER_MS,
      electionTimeoutMaxMs: HUGE_TIMER_MS + 1,
    },
  });
  LoggingService.getInstance().initialize({level: 'error'});
});

afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  AddressManager.resetInstance();
  NodeService.resetInstance();
});

function normalizedValue(value) {
  if (Buffer.isBuffer(value)) return {buffer: value.toString('base64')};
  if (typeof value === 'bigint') return String(value);
  return value;
}

// A test-owned readonly observer of the complete logical target database.
// It does not use PartitionService.db or an arbitrary SQL method on the live
// service, so the oracle remains valid after those capabilities are private.
function readLogicalDatabase(dbPath) {
  const db = new Database(dbPath, {readonly: true, fileMustExist: true});
  try {
    const tables = db.prepare(`
      SELECT name, sql FROM sqlite_master
      WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `).all();
    return tables.map(({name, sql}) => ({
      name,
      sql,
      rows: db.prepare(`SELECT * FROM "${name.replaceAll('"', '""')}"`)
        .all()
        .map((row) => Object.fromEntries(Object.entries(row)
          .map(([key, value]) => [key, normalizedValue(value)]))),
    }));
  } finally {
    db.close();
  }
}


function describeUnavailableNativeSnapshotProducer() {
  return 'exact82b54 has no production sender native-snapshot producer: ' +
    'raft-rs ingress classifies MsgSnapshot as message-type-without-producer ' +
    'and the private publication/report_snapshot owner is not implemented';
}

function recordNotReached(t, branch, reason) {
  t.pass(`${branch}: ${NOT_REACHED} (${reason})`);
}

async function proveNoCurrentMsgSnapshotIngressProducer(t) {
  const result = admitRaftRsMessage({
    envelope: {
      groupId: PARTITION_ID,
      to: '1',
      message: {
        msgType: RAFT_RS_MESSAGE_TYPE.SNAPSHOT,
        from: '2',
        to: '1',
        term: '1',
      },
    },
    localGroupId: PARTITION_ID,
    localPeerId: '1',
  });
  t.equal(result?.outcome,
    RAFT_RS_INGRESS_REFUSAL.MESSAGE_TYPE_WITHOUT_PRODUCER,
    'anti-vacuous: current production ingress has no MsgSnapshot producer path');
  return null;
}

async function captureGenuineSenderMsgSnapshotIfAvailable(t) {
  // This deliberately does not construct a packet or Ready. The future source
  // repair must replace this current capability probe with an observation of
  // actual Ready.messages from the real sender runtime/private Storage owner.
  await proveNoCurrentMsgSnapshotIngressProducer(t);
  return {
    available: false,
    reason: describeUnavailableNativeSnapshotProducer(),
  };
}

async function exerciseDownstreamR6BranchesWhenNativePacketExists(t) {
  const packet = await captureGenuineSenderMsgSnapshotIfAvailable(t);
  if (!packet.available) {
    recordNotReached(t, 'native no-Ready rejection', packet.reason);
    recordNotReached(t, 'native/image binding mismatch', packet.reason);
    recordNotReached(t, 'packet-before-stage Failure and retry', packet.reason);
    recordNotReached(t, 'source crash and lost-response recovery', packet.reason);
    recordNotReached(t, 'target crash and same-service preservation', packet.reason);
    recordNotReached(t, 'finite stage expiry', packet.reason);
    t.fail('R6 downstream native branches require a genuine sender-produced ' +
      'MsgSnapshot from the real runtime; exact82b54 cannot produce one');
    return;
  }

  // Future-green requirements. These assertions are intentionally below the
  // genuine-packet gate, so exact82b54 never fabricates their authority.
  t.equal(packet.noReadyRefusal?.reason, NATIVE_SNAPSHOT_NOT_ADMITTED,
    'a real native packet with no accepted Ready refuses image install only');
  t.equal(packet.bindingMismatch?.reason, NATIVE_SNAPSHOT_BINDING_MISMATCH,
    'a real native packet with mismatched staged binding refuses before import');
  t.equal(packet.packetBeforeStage?.reported, 'failure',
    'packet-before-stage reports Failure through the private native attempt');
  t.equal(packet.sourceCrashLostResponse?.recovered, true,
    'source crash/lost response recovers from durable publication and retry');
  t.equal(packet.targetCrashContinuation?.sameService, true,
    'target crash preserves or reconstructs the same service without install');
  t.equal(packet.stageExpiry?.released, true,
    'finite stage expiry releases bytes without granting install authority');
}

async function readTrackedMembership(replicaHandler) {
  return replicaHandler.handleMessage({
    correlationId: `snapshot-r6-membership-${Date.now()}`,
    payload: {
      [ReplicaOperationField.TYPE]:
        ReplicaOperationMessageType.READ_REPLICA_MEMBERSHIP,
      [ReplicaOperationField.OPERATION_ID]: 'snapshot-r6-live-refusal',
      [ReplicaOperationField.PARTITION_ID]: PARTITION_ID,
      [ReplicaOperationField.REPLICA_ID]: REPLICA_ID,
      [ReplicaOperationField.SOURCE_REPLICA_ID]: REPLICA_ID,
      [ReplicaOperationField.ATTEMPT_SEQ]: 1,
    },
  });
}

async function createNativeLearnerGeneration(root) {
  const sourceDbPath = path.join(root, 'source.db');
  const checkpointsRoot = path.join(root, 'checkpoints');
  const db = new Database(sourceDbPath);
  try {
    db.exec(`CREATE TABLE ${TABLE_ID} (
      id TEXT PRIMARY KEY,
      payload TEXT NOT NULL
    )`);
    db.prepare(`INSERT INTO ${TABLE_ID} (id, payload) VALUES (?, ?)`)
      .run('source-row', 'native-image');
    const reservations = new RaftRsPeerIdentityRegistry(db);
    const sourcePeerId = reservations.registerReplica(SOURCE_REPLICA_ID);
    const targetPeerId = reservations.registerReplica(REPLICA_ID);
    const store = new RaftRsDurableStore(db);
    store.putAppliedState(PARTITION_ID, APPLIED_INDEX, {
      voters: [sourcePeerId],
      learners: [targetPeerId],
      votersOutgoing: [],
      learnersNext: [],
      autoLeave: false,
    }, undefined, MEMBERSHIP_GENERATION);
    store.appendEntries(PARTITION_ID, [{
      index: APPLIED_INDEX,
      term: APPLIED_TERM,
      entryType: 0,
      data: Buffer.from('{}').toString('base64'),
    }]);
    store.putHardState(PARTITION_ID, {
      term: APPLIED_TERM,
      vote: '0',
      commit: APPLIED_INDEX,
    });
    const created = await createSqliteStateMachineCheckpoint({
      db,
      identity: IDENTITY,
      checkpointsRoot,
      raftRsGroupId: PARTITION_ID,
    });
    return {created, checkpointsRoot, targetPeerId};
  } finally {
    db.close();
  }
}

test('R6: a valid bulk image received before its native packet remains ' +
  'pending and preserves the exact live voter service',
{timeout: 20_000}, async (t) => {
  const workDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'snapshot-r6-live-refusal-'));
  const targetDbPath = path.join(workDir, 'target', 'replica.db');
  const sourceRoot = path.join(workDir, 'source');
  fs.mkdirSync(path.dirname(targetDbPath), {recursive: true});
  fs.mkdirSync(sourceRoot, {recursive: true});

  const receiverRegistry = createBulkTransferChannelRegistry({nodeId: NODE_ID});
  const sourceRegistry = createBulkTransferChannelRegistry(
    {nodeId: SOURCE_NODE_ID});
  let router = null;
  let setup = null;
  const createdServices = [];
  let targetService = null;
  let routeResolve;
  const routed = new Promise((resolve) => {
    routeResolve = resolve;
  });
  try {
    // The registry is armed explicitly below with the production wiring's
    // observation seam. The real MessageRouter still owns ordinary partition
    // transport and ReplicaHandler registration.
    router = new MessageRouter({
      bootIncarnation: TEST_BOOT_INCARNATION,
      nodeId: NODE_ID,
      nodeAddress: `ws://${NODE_ID}:7000`,
    });
    await router.initialize();
    const lifecycleStore = createLifecycleStateStore({
      services: [createLifecycleServiceRow({
        serviceId: REPLICA_ID,
        replicaId: REPLICA_ID,
        partitionId: PARTITION_ID,
        nodeId: NODE_ID,
        status: 'active',
      })],
    });
    setup = ReplicaHandlerSetup.create({
      nodeId: NODE_ID,
      messageRouter: router,
      cdcIntegrationService: createLifecycleCdcService({store: lifecycleStore}),
      systemTableCache: lifecycleStore.cache,
      ownerIncarnation: TEST_BOOT_INCARNATION,
      dataDir: workDir,
      createPartitionService: async (serviceOptions) => {
        const service = new PartitionService(withFoundingStamp({
          ...serviceOptions,
          tableId: serviceOptions.tableId || TABLE_ID,
          tableName: serviceOptions.tableName || TABLE_ID,
          schema: serviceOptions.schema || SCHEMA,
          replicaIds: serviceOptions.replicaIds || [REPLICA_ID],
          nodeId: NODE_ID,
          dbPath: serviceOptions.dbPath || targetDbPath,
          transport: router,
          systemTableCache: lifecycleStore.cache,
          deferElection: true,
          suppressLifecycleLogs: true,
        }));
        await service.initialize();
        createdServices.push(service);
        return service;
      },
    });
    targetService = await setup.replicaHandler.createPartitionService({
      partitionId: PARTITION_ID,
      tableId: TABLE_ID,
      tableName: TABLE_ID,
      replicaId: REPLICA_ID,
      replicaIds: [REPLICA_ID],
      nodeId: NODE_ID,
      dbPath: targetDbPath,
      schema: SCHEMA,
      deferElection: true,
    });
    setup.replicaHandler.registerExistingReplica({
      replicaId: REPLICA_ID,
      partitionId: PARTITION_ID,
      tableName: TABLE_ID,
      service: targetService,
    });

    const targetPeerId = deriveRaftRsPeerId(REPLICA_ID);
    const membershipBefore = await readTrackedMembership(setup.replicaHandler);
    t.equal(membershipBefore.status, ReplicaOperationResponseStatus.COMPLETED,
      'anti-vacuous: the registered owner endpoint reaches the real service');
    t.equal(membershipBefore[ReplicaOperationField.MEMBERSHIP]?.state,
      PARTITION_REPLICA_MEMBERSHIP_STATE.VOTER,
      'anti-vacuous: the target owner reports its exact self as a voter');

    const native = await createNativeLearnerGeneration(sourceRoot);
    t.equal(native.created.outcome, RAFT_CHECKPOINT_CREATION_OUTCOME.CREATED,
      'anti-vacuous: the canonical owner sealed a valid native image');
    t.equal(native.targetPeerId, targetPeerId,
      'the image learner reservation names this exact target identity');

    const targetFactsBefore = readLogicalDatabase(targetDbPath);
    const targetCheckpointsRoot = resolveReplicaCheckpointsRoot(targetDbPath);
    const installDir = path.join(
      targetCheckpointsRoot, RAFT_SNAPSHOT_INSTALL_DIRNAME);
    const markerPath = path.join(
      installDir, RAFT_SNAPSHOT_INSTALL_MARKER_FILE);
    const stagingPath = path.join(
      installDir, RAFT_SNAPSHOT_INSTALL_STAGING_FILE);

    armSnapshotOfferRouting({
      registry: receiverRegistry,
      replicaHandler: setup.replicaHandler,
      systemTableCache: lifecycleStore.cache,
      onRouteOutcome(outcome) {
        if (outcome.outcome === RAFT_SNAPSHOT_OFFER_ROUTE_OUTCOME.ROUTED) {
          routeResolve(outcome);
        }
      },
    });

    const pair = createInProcWebSocketPair();
    receiverRegistry.adoptIncomingSocket({
      nodeId: SOURCE_NODE_ID,
      ws: pair.b,
    });
    const sourceConnection = sourceRegistry.adoptIncomingSocket({
      nodeId: NODE_ID,
      ws: pair.a,
    });
    const served = await serveSnapshotTransfer({
      socket: bulkConnectionTransferSocket(sourceConnection),
      checkpointsRoot: native.checkpointsRoot,
      generationIndex: Number(APPLIED_INDEX),
      transferId: 'snapshot-r6-live-refusal',
    });
    t.equal(served.outcome, RAFT_SNAPSHOT_TRANSFER_OUTCOME.COMPLETED,
      'anti-vacuous: the real bulk OFFER and payload completed');

    const route = await routed;
    const orchestration = await route.completion;
    const firstOwnerTransitionIsFutureGreen =
      orchestration.outcome === AWAITING_NATIVE_SNAPSHOT;
    t.equal(orchestration.outcome, AWAITING_NATIVE_SNAPSHOT,
      'bulk completion remains pending until a genuine native packet is ' +
        'admitted by the receiver core');

    if (!firstOwnerTransitionIsFutureGreen) {
      t.equal(orchestration.outcome, 'install_rejected',
        'current baseline red: snapshot-catchup shuts down/install-attempts ' +
          'before native Ready instead of returning pending');
      t.equal(fs.existsSync(path.join(targetCheckpointsRoot, APPLIED_INDEX,
        RAFT_CHECKPOINT_PAYLOAD_FILE)), true,
      'current baseline still preserves the exact verified bulk payload');
      t.same(readLogicalDatabase(targetDbPath), targetFactsBefore,
        'current baseline leaves the complete logical target database unchanged');
      recordNotReached(t, 'native no-Ready rejection',
        'blocked by first owner red before AWAITING_NATIVE_SNAPSHOT');
      recordNotReached(t, 'native/image binding mismatch',
        'blocked by first owner red before AWAITING_NATIVE_SNAPSHOT');
      recordNotReached(t, 'packet-before-stage Failure and retry',
        'blocked by first owner red before AWAITING_NATIVE_SNAPSHOT');
      recordNotReached(t, 'source crash and lost-response recovery',
        'blocked by first owner red before AWAITING_NATIVE_SNAPSHOT');
      recordNotReached(t, 'target crash and same-service preservation',
        'blocked by first owner red before AWAITING_NATIVE_SNAPSHOT');
      recordNotReached(t, 'finite stage expiry',
        'blocked by first owner red before AWAITING_NATIVE_SNAPSHOT');
      return;
    }

    const membershipAfter = await readTrackedMembership(setup.replicaHandler);
    t.equal(membershipAfter.status, ReplicaOperationResponseStatus.COMPLETED,
      'the same registered owner endpoint remains available while pending');
    t.equal(membershipAfter[ReplicaOperationField.MEMBERSHIP]?.state,
      PARTITION_REPLICA_MEMBERSHIP_STATE.VOTER,
      'the pending target remains a live voter through its semantic owner');
    t.equal(fs.existsSync(markerPath), false,
      'pending transfer creates no durable install marker');
    t.equal(fs.existsSync(stagingPath), false,
      'pending transfer creates no closed-handle install staging payload');
    t.equal(fs.existsSync(path.join(targetCheckpointsRoot, APPLIED_INDEX,
      RAFT_CHECKPOINT_PAYLOAD_FILE)), true,
    'the exact verified bulk image remains durably staged for native binding');
    t.same(readLogicalDatabase(targetDbPath), targetFactsBefore,
      'the complete logical target database is unchanged');
    t.equal(createdServices.length, 1,
      'pending transfer creates no replacement service generation');

    await exerciseDownstreamR6BranchesWhenNativePacketExists(t);
  } finally {
    setup?.replicaStateMachine.stopTimeoutChecker();
    receiverRegistry.closeAll();
    sourceRegistry.closeAll();
    await targetService?.shutdown().catch(() => {});
    await setup?.replicaHandler.shutdown().catch(() => {});
    await router?.shutdown().catch(() => {});
    fs.rmSync(workDir, {recursive: true, force: true});
  }
});
