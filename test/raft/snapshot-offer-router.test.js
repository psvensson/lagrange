import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';

import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {ReplicaHandler} from '../../src/node/replica-handler.js';
import {
  bulkConnectionTransferSocket,
} from '../../src/raft/bulk-connection-transfer-socket.js';
import {
  listCheckpointGenerations,
} from '../../src/raft/snapshot-checkpoint-store.js';
import {
  RAFT_SNAPSHOT_OFFER_RECEIVER,
  RAFT_SNAPSHOT_OFFER_ROUTE_OUTCOME,
  armSnapshotOfferRouter,
} from '../../src/raft/snapshot-offer-router.js';
import {
  RAFT_SNAPSHOT_TRANSFER_ABORT_REASON,
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
// tracked service where registerExistingReplica's idempotent early-return
// cannot.

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

const ABSENT = Object.freeze({state: RAFT_SNAPSHOT_OFFER_RECEIVER.ABSENT});
const ADMITTED = Object.freeze({admitted: true});

function running(service) {
  return Object.freeze({state: RAFT_SNAPSHOT_OFFER_RECEIVER.RUNNING, service});
}

// Every control frame the offering side receives, as it arrives.
function controlFramesOf(connection) {
  const frames = [];
  connection.onMessage((data, isBinary) => {
    if (isBinary !== true) frames.push(JSON.parse(String(data)));
  });
  return frames;
}

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
  const admissions = [];
  try {
    armSnapshotOfferRouter({
      connection: channel.receiveConnection,
      resolveReceiver: (raftGroupId) =>
        raftGroupId === PARTITION_ID ? running(localService) : ABSENT,
      admitOffer: async ({service, offer}) => {
        admissions.push({service, kind: offer.kind});
        return ADMITTED;
      },
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
    t.same(admissions, [{service: localService,
      kind: RAFT_SNAPSHOT_TRANSFER_MESSAGE_KIND.OFFER}],
    'the offer was admitted once, for the P replica, before the handoff');
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
        resolveReceiver: () => {
          throw new Error('a non-offer frame must never resolve a replica');
        },
        admitOffer: () => {
          throw new Error('a non-offer frame must never be admitted');
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
        resolveReceiver: () => ABSENT,
        admitOffer: () => {
          throw new Error('an unmapped offer must never be admitted');
        },
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

// One OFFER against a router whose node answers `receiver` and `admission`:
// the route outcomes and the control frames the offering side got back.
async function offerTo({receiver, admitOffer}) {
  const channel = createAdoptedBulkConnectionPair();
  const outcomes = [];
  const answers = controlFramesOf(channel.serveConnection);
  try {
    armSnapshotOfferRouter({
      connection: channel.receiveConnection,
      resolveReceiver: () => receiver,
      admitOffer,
      orchestrate: () => {
        throw new Error('a refused offer must never orchestrate');
      },
      onOutcome: (outcome) => outcomes.push(outcome),
    });
    channel.serveConnection.sendControl({
      kind: RAFT_SNAPSHOT_TRANSFER_MESSAGE_KIND.OFFER,
      transferId: TRANSFER_ID,
      descriptor: {raftGroupId: PARTITION_ID},
    });
    await flushDeliveries();
    await flushDeliveries();
    return {outcomes, answers};
  } finally {
    channel.close();
  }
}

const ABORT_KIND = RAFT_SNAPSHOT_TRANSFER_MESSAGE_KIND.ABORT;

test('an OFFER for a replica stopped for an install is the typed ' +
  'replica_installing, answered to the offering side', async (t) => {
  const {outcomes, answers} = await offerTo({
    receiver: Object.freeze({state: RAFT_SNAPSHOT_OFFER_RECEIVER.INSTALLING,
      replicaId: REPLICA_ID}),
    admitOffer: () => {
      throw new Error('an installing replica must never be asked');
    },
  });
  t.same(outcomes, [{
    outcome: RAFT_SNAPSHOT_OFFER_ROUTE_OUTCOME.REPLICA_INSTALLING,
    raftGroupId: PARTITION_ID}], 'one typed route outcome');
  t.same(answers, [{kind: ABORT_KIND, transferId: TRANSFER_ID,
    reason: RAFT_SNAPSHOT_TRANSFER_ABORT_REASON.REPLICA_INSTALLING}],
  'the offering side is told installing, not replica_not_found');
});

test('an OFFER for a group the node runs two replicas of is the typed ' +
  'receiver_ambiguous: nothing is asked or received', async (t) => {
  const {outcomes, answers} = await offerTo({
    receiver: Object.freeze({state: RAFT_SNAPSHOT_OFFER_RECEIVER.AMBIGUOUS}),
    admitOffer: () => {
      throw new Error('an ambiguous receiver must never be asked');
    },
  });
  t.same(outcomes, [{
    outcome: RAFT_SNAPSHOT_OFFER_ROUTE_OUTCOME.RECEIVER_AMBIGUOUS,
    raftGroupId: PARTITION_ID}], 'one typed route outcome');
  t.same(answers, [{kind: ABORT_KIND, transferId: TRANSFER_ID,
    reason: RAFT_SNAPSHOT_TRANSFER_ABORT_REASON.RECEIVER_AMBIGUOUS}],
  'the offering side is told why');
});

test('an OFFER the node does not admit is refused before anything is ' +
  'received: not_admitted, with the admission, and a typed abort',
async (t) => {
  const admission = Object.freeze({admitted: false, decision: 'held',
    reason: 'row_unobservable'});
  const {outcomes, answers} = await offerTo({
    receiver: running(Object.freeze({partitionId: PARTITION_ID})),
    admitOffer: async () => admission,
  });
  t.same(outcomes, [{outcome: RAFT_SNAPSHOT_OFFER_ROUTE_OUTCOME.NOT_ADMITTED,
    raftGroupId: PARTITION_ID, admission}], 'one typed route outcome');
  t.same(answers, [{kind: ABORT_KIND, transferId: TRANSFER_ID,
    reason: RAFT_SNAPSHOT_TRANSFER_ABORT_REASON.RECEIVER_NOT_ADMITTED}],
  'the offering side is told the receiver was not admitted');
});

test('an admission that throws refuses the offer typed, with its detail',
  async (t) => {
    const {outcomes, answers} = await offerTo({
      receiver: running(Object.freeze({partitionId: PARTITION_ID})),
      admitOffer: () => {
        throw new Error('the lifecycle read threw');
      },
    });
    t.same(outcomes, [{outcome: RAFT_SNAPSHOT_OFFER_ROUTE_OUTCOME.NOT_ADMITTED,
      raftGroupId: PARTITION_ID, detail: 'the lifecycle read threw'}]);
    t.same(answers, [{kind: ABORT_KIND, transferId: TRANSFER_ID,
      reason: RAFT_SNAPSHOT_TRANSFER_ABORT_REASON.RECEIVER_NOT_ADMITTED}]);
  });

test('replaceLocalReplicaService swaps where registerExistingReplica ' +
  'cannot', async (t) => {
  const handler = new ReplicaHandler({
    nodeId: 'offer-router-node',
    systemTableCache: {filter: () => []},
    cdcIntegrationService: {},
    replicaStateMachine: {},
    createPartitionService: async () => ({}),
  });
  const original = {partitionId: PARTITION_ID, tableName: STATE_TABLE};
  const replacement = {partitionId: PARTITION_ID, tableName: STATE_TABLE};
  handler.registerExistingReplica({
    replicaId: REPLICA_ID,
    partitionId: PARTITION_ID,
    tableName: STATE_TABLE,
    service: original,
  });
  // The distinctness pin: registerExistingReplica early-returns on a
  // duplicate and can never swap the live service.
  handler.registerExistingReplica({
    replicaId: REPLICA_ID,
    partitionId: PARTITION_ID,
    tableName: STATE_TABLE,
    service: replacement,
  });
  t.equal(handler.localServices.get(REPLICA_ID), original,
    'registerExistingReplica is idempotent-by-early-return (no swap)');
  const statusBeforeSwap = handler.localReplicas.get(REPLICA_ID).status;
  const merged = handler.replaceLocalReplicaService(REPLICA_ID, replacement);
  t.equal(handler.localServices.get(REPLICA_ID), replacement,
    'replaceLocalReplicaService swaps the localServices entry');
  t.equal(handler.localReplicas.get(REPLICA_ID).service, replacement,
    'replaceLocalReplicaService swaps the tracked replica service');
  t.equal(merged.partitionId, PARTITION_ID,
    'the tracked partition id survives the swap');
  t.equal(handler.localReplicas.get(REPLICA_ID).status, statusBeforeSwap,
    'the merge preserves the remaining tracked fields');
});
