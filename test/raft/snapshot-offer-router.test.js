import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';

import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {ReplicaHandler} from '../../src/node/replica-handler.js';
import {ReplicaStateMachine} from '../../src/node/replica-state-machine.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {createReplicaRuntimePublication} from '../../src/node/replica-runtime-publication.js';
import {captureReplicaRuntimeObservation} from '../../src/node/replica-runtime-observation.js';
import {PARTITION_RUNTIME_PUBLICATION_REFUSED} from
  '../../src/partition/partition-runtime-publication.js';
import {createRestoredPartitionServiceFixture} from
  '../test-helpers/restored-partition-service-fixture.js';
import {createLifecycleServiceRow, createLifecycleStateStore} from
  '../test-helpers/lifecycle-state-store.js';
import {
  bulkConnectionTransferSocket,
} from '../../src/raft/bulk-connection-transfer-socket.js';
import {
  listCheckpointGenerations,
} from '../../src/raft/snapshot-checkpoint-store.js';
import {
  RAFT_SNAPSHOT_OFFER_ROUTE_OUTCOME,
  armSnapshotOfferRouter,
} from '../../src/raft/snapshot-offer-router.js';
import {
  RAFT_SNAPSHOT_TRANSFER_MESSAGE_KIND,
  RAFT_SNAPSHOT_TRANSFER_OUTCOME,
} from '../../src/raft/snapshot-transfer-constants.js';
import {
  receiveSnapshotTransfer,
  serveSnapshotTransfer,
} from '../../src/raft/snapshot-transfer.js';
import {
  createAdoptedBulkConnectionPair,
  createSealedGuardGeneration,
} from './bulk-transfer-socket-fixture.js';

// S6 Phase A link 6 guard (quest raft-snapshot-live-rebuild): the
// peek-then-replay follower offer router. An OFFER control frame for
// partition P routes to P's local replica orchestrate WITH buffered-frame
// replay (without replay the receiver would hang awaiting the already-
// consumed OFFER — the deterministic red direction); a non-OFFER first
// frame is a typed refusal; an unknown raftGroupId is a typed refusal; and
// ReplicaHandler.replaceLocalReplicaService swaps localServices + the
// tracked service from its original predecessor, while ordinary registration
// refuses a different runtime.

const PARTITION_ID = 'offer_rows-p1';
const STATE_TABLE = 'offer_rows';
const REPLICA_ID = 'offer_rows-p1-r2';
const TERM = 5;
const ENTRY_COUNT = 4;
const IDENTITY = Object.freeze({
  clusterId: 'offer-cluster-1',
  raftGroupId: PARTITION_ID,
  entity: Object.freeze({kind: 'partition', id: STATE_TABLE}),
  membershipEpoch: 3,
});
const SMALL_CHUNK_BYTES = 4096;
const TRANSFER_ID = 'offer-router-transfer';
const UNKNOWN_PARTITION_ID = 'unknown_rows-p9';

beforeEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({
    node: {id: 'offer-router-node'},
    logging: {level: 'error'},
  });
  LoggingService.getInstance().initialize({level: 'error'});
});

afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

async function flushDeliveries() {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

function createGuardGeneration(prefix) {
  return createSealedGuardGeneration({
    prefix,
    partitionId: PARTITION_ID,
    stateTable: STATE_TABLE,
    term: TERM,
    identity: IDENTITY,
    entryCount: ENTRY_COUNT,
  });
}

test('an OFFER for partition P routes to the P replica orchestrate with ' +
  'buffered-frame replay', async (t) => {
  const fixture = await createGuardGeneration('offer-router-route-');
  const channel = createAdoptedBulkConnectionPair();
  const localService = Object.freeze({
    partitionId: PARTITION_ID,
    tableName: STATE_TABLE,
    replicaId: REPLICA_ID,
    isShutdown: false,
  });
  const outcomes = [];
  const orchestrated = [];
  try {
    armSnapshotOfferRouter({
      connection: channel.receiveConnection,
      resolveLocalReplica: (raftGroupId) =>
        raftGroupId === PARTITION_ID ? localService : null,
      orchestrate: ({service, socket, offer}) => {
        orchestrated.push({service, offer});
        // The orchestrate seam runs the real receive driver over the handed
        // socket: this HANGS unless the buffered OFFER frame is replayed.
        return receiveSnapshotTransfer({
          socket,
          checkpointsRoot: fixture.receiveRoot,
          expectedIdentity: IDENTITY,
          chunkSizeBytes: SMALL_CHUNK_BYTES,
        });
      },
      onOutcome: (outcome) => outcomes.push(outcome),
    });
    const served = await serveSnapshotTransfer({
      socket: bulkConnectionTransferSocket(channel.serveConnection),
      checkpointsRoot: fixture.checkpointsRoot,
      generationIndex: fixture.boundaryIndex,
      transferId: TRANSFER_ID,
      chunkSizeBytes: SMALL_CHUNK_BYTES,
    });
    t.equal(served.outcome, RAFT_SNAPSHOT_TRANSFER_OUTCOME.COMPLETED,
      'the leader-side serve completes against the routed receiver');
    t.equal(outcomes.length, 1, 'exactly one route outcome is emitted');
    t.equal(outcomes[0].outcome, RAFT_SNAPSHOT_OFFER_ROUTE_OUTCOME.ROUTED,
      'the OFFER routes');
    t.equal(outcomes[0].raftGroupId, PARTITION_ID,
      'the route names the OFFER descriptor raftGroupId');
    const received = await outcomes[0].completion;
    t.equal(received.outcome, RAFT_SNAPSHOT_TRANSFER_OUTCOME.COMPLETED,
      'the routed orchestration completes the transfer (replay worked)');
    t.equal(orchestrated.length, 1, 'orchestrate ran exactly once');
    t.equal(orchestrated[0].service, localService,
      'the P replica service is handed to orchestrate');
    t.equal(orchestrated[0].offer.kind,
      RAFT_SNAPSHOT_TRANSFER_MESSAGE_KIND.OFFER,
      'the parsed OFFER travels with the handoff');
    t.same(listCheckpointGenerations(fixture.receiveRoot),
      [fixture.boundaryIndex],
      'the routed transfer published the generation');
  } finally {
    channel.close();
    fixture.close();
  }
});

test('a non-OFFER first frame is a typed refusal and the peek disarms',
  async (t) => {
    const channel = createAdoptedBulkConnectionPair();
    const outcomes = [];
    try {
      armSnapshotOfferRouter({
        connection: channel.receiveConnection,
        resolveLocalReplica: () => {
          throw new Error('a non-offer frame must never resolve a replica');
        },
        orchestrate: () => {
          throw new Error('a non-offer frame must never orchestrate');
        },
        onOutcome: (outcome) => outcomes.push(outcome),
      });
      channel.serveConnection.sendControl({
        kind: RAFT_SNAPSHOT_TRANSFER_MESSAGE_KIND.ACCEPT,
        transferId: TRANSFER_ID,
      });
      await flushDeliveries();
      t.equal(outcomes.length, 1, 'one typed outcome is emitted');
      t.equal(outcomes[0].outcome,
        RAFT_SNAPSHOT_OFFER_ROUTE_OUTCOME.NOT_OFFER,
        'the non-OFFER first frame is the typed not_offer refusal');
      // A later real OFFER must NOT route: the watcher disarmed terminally.
      channel.serveConnection.sendControl({
        kind: RAFT_SNAPSHOT_TRANSFER_MESSAGE_KIND.OFFER,
        transferId: TRANSFER_ID,
        descriptor: {raftGroupId: PARTITION_ID},
      });
      await flushDeliveries();
      t.equal(outcomes.length, 1,
        'the disarmed watcher never fires again');
    } finally {
      channel.close();
    }
  });

test('an OFFER for an unknown raft group is a typed replica_not_found',
  async (t) => {
    const channel = createAdoptedBulkConnectionPair();
    const outcomes = [];
    try {
      armSnapshotOfferRouter({
        connection: channel.receiveConnection,
        resolveLocalReplica: () => null,
        orchestrate: () => {
          throw new Error('an unmapped offer must never orchestrate');
        },
        onOutcome: (outcome) => outcomes.push(outcome),
      });
      channel.serveConnection.sendControl({
        kind: RAFT_SNAPSHOT_TRANSFER_MESSAGE_KIND.OFFER,
        transferId: TRANSFER_ID,
        descriptor: {raftGroupId: UNKNOWN_PARTITION_ID},
      });
      await flushDeliveries();
      t.equal(outcomes.length, 1, 'one typed outcome is emitted');
      t.equal(outcomes[0].outcome,
        RAFT_SNAPSHOT_OFFER_ROUTE_OUTCOME.REPLICA_NOT_FOUND,
        'the unmapped OFFER is the typed replica_not_found refusal');
      t.equal(outcomes[0].raftGroupId, UNKNOWN_PARTITION_ID,
        'the refusal names the unmapped raft group');
    } finally {
      channel.close();
    }
  });

test('replaceLocalReplicaService consumes the retained predecessor that registration cannot replace',
  async (t) => {
  const source = createLifecycleServiceRow({replicaId: REPLICA_ID, partitionId: PARTITION_ID,
    nodeId: 'offer-router-node', status: 'active', createdAt: 100, stateEnteredAt: 100});
  const store = createLifecycleStateStore({services: [source]});
  const owner = new ReplicaStateMachine({nodeId: source.node_id,
    systemTableCache: store.cache, controlPlaneSystemTableGateway: store.gateway});
  const handler = new ReplicaHandler({
    nodeId: source.node_id,
    systemTableCache: store.cache,
    controlPlaneSystemTableGateway: store.gateway,
    cdcIntegrationService: {},
    replicaStateMachine: owner,
    createPartitionService: async () => ({}),
  });
  const registration = await createRestoredPartitionServiceFixture(handler, source,
    {tableId: STATE_TABLE, tableName: STATE_TABLE});
  const original = registration.service;
  handler.registerExistingReplica(registration);
  const expected = captureReplicaRuntimeObservation(handler, REPLICA_ID);
  const replacement = new PartitionService({partitionId: PARTITION_ID, replicaId: REPLICA_ID,
    tableId: STATE_TABLE, tableName: STATE_TABLE, nodeId: source.node_id,
    runtimePublication: createReplicaRuntimePublication(handler, expected.sourceEvidence,
      expected.admission, original), resolveHandlerRetirementLane: () => owner});
  t.teardown(async () => {
    await Promise.all([original.shutdown(), replacement.shutdown()]);
    await owner.clear();
  });
  t.throws(() => handler.registerExistingReplica({...registration, service: replacement}),
    {code: PARTITION_RUNTIME_PUBLICATION_REFUSED},
    'a new runtime cannot use idempotent registration to replace its predecessor');
  t.equal(handler.localServices.get(REPLICA_ID), original,
    'refused registration preserves the original runtime');
  const statusBeforeSwap = handler.localReplicas.get(REPLICA_ID).status;
  const merged = handler.replaceLocalReplicaService(REPLICA_ID, replacement, expected);
  t.equal(handler.localServices.get(REPLICA_ID), replacement,
    'replaceLocalReplicaService swaps the localServices entry');
  t.equal(handler.localReplicas.get(REPLICA_ID).service, replacement,
    'replaceLocalReplicaService swaps the tracked replica service');
  t.equal(merged.partitionId, PARTITION_ID,
    'the tracked partition id survives the swap');
  t.equal(handler.localReplicas.get(REPLICA_ID).status, statusBeforeSwap,
    'the merge preserves the remaining tracked fields');
});
