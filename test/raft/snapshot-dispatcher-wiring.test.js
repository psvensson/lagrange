import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';

import {AddressManager} from '../../src/address/address-manager.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {NodeService} from '../../src/node/node-service.js';
import {
  ReplicaHandlerSetup,
} from '../../src/bootstrap/shared/replica-handler-setup.js';
import {
  NodeJoiningPublicationActivation,
} from '../../src/bootstrap/node-joining-publication-activation.js';
import {
  attachSnapshotCatchupDispatcher,
} from '../../src/bootstrap/shared/snapshot-catchup-wiring.js';
import {
  bulkConnectionTransferSocket,
} from '../../src/raft/bulk-connection-transfer-socket.js';
import {
  RAFT_SNAPSHOT_CATCHUP_DECISION_OUTCOME,
  RAFT_SNAPSHOT_CATCHUP_DISPATCH_OUTCOME,
  RAFT_SNAPSHOT_DEFAULT_CLUSTER_ID,
  buildSnapshotCatchupDecision,
} from '../../src/raft/snapshot-catchup-constants.js';
import {
  RAFT_SNAPSHOT_TRANSFER_OUTCOME,
} from '../../src/raft/snapshot-transfer-constants.js';
import {
  receiveSnapshotTransfer,
  serveSnapshotTransfer,
} from '../../src/raft/snapshot-transfer.js';
import {
  createBulkTransferChannelRegistry,
} from '../../src/transport/bulk-transfer-channel.js';
import {
  createInProcWebSocketPair,
} from '../../src/transport/inproc-transport.js';
import {createSealedSourceGeneration} from './snapshot-catchup-fixture.js';
import {waitForCondition} from './bulk-transfer-socket-fixture.js';

// S6 Phase A link 2 guard (quest raft-snapshot-live-rebuild): the
// onSnapshotCatchupNeeded dispatcher seam is set on services built through
// BOTH production factory paths — the shared ReplicaHandlerSetup wrapper
// (which both the bootstrap and the join replica-handler factories flow
// through) and the join/durable-rejoin createJoinLocalPartitionService body
// (which durable-rejoin restores call WITHOUT the handler factory).
// Reverting either setter reds the corresponding precondition witness. The
// seam's dispatcher genuinely dispatches: a wired service serves a real
// transfer over an existing bulk connection, and an unreachable follower is
// the typed SOCKET_UNAVAILABLE refusal. The ReplicaHandlerSetup arming of
// the follower offer router is proven by a full production-shaped loop:
// adopt an inbound bulk socket, serve an OFFER, and observe install ->
// recreate (via the WRAPPED factory) -> replaceLocalReplicaService swap.

const PARTITION_ID = 'wiring_rows-p1';
const STATE_TABLE = 'wiring_rows';
const REPLICA_ID = 'wiring_rows-p1-r2';
const NODE_ID = 'wiring-node';
const PEER_NODE_ID = 'peer-node';
const TERM = 6;
const ENTRY_COUNT = 4;
// The production identity at bootstrap: default clusterId, epoch 0 (empty
// publication cache) — what buildSnapshotCatchupIdentityFromCache derives.
const PRODUCTION_IDENTITY = Object.freeze({
  clusterId: RAFT_SNAPSHOT_DEFAULT_CLUSTER_ID,
  raftGroupId: PARTITION_ID,
  entity: Object.freeze({kind: 'partition', id: STATE_TABLE}),
  membershipEpoch: 0,
});
const FOLLOWER_ADDRESS = `${PEER_NODE_ID}/partition/${REPLICA_ID}`;

beforeEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  AddressManager.resetInstance();
  NodeService.resetInstance();
  ConfigurationManager.getInstance().initialize({
    node: {id: NODE_ID},
    logging: {level: 'error'},
  });
  LoggingService.getInstance().initialize({level: 'error'});
});

afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  AddressManager.resetInstance();
  NodeService.resetInstance();
});

function createStubSystemTableCache() {
  return {
    filter: () => [],
    getAll: () => [],
  };
}

function createStubRouter(bulkChannelRegistry) {
  return {
    nodeId: NODE_ID,
    nodeAddress: `ws://${NODE_ID}:7000`,
    advertisedAddress: `ws://${NODE_ID}:7000`,
    bulkChannelRegistry: bulkChannelRegistry || null,
    register() {},
  };
}

function createHandlerSetup(options = {}) {
  const created = [];
  const setup = ReplicaHandlerSetup.create({
    nodeId: NODE_ID,
    messageRouter: createStubRouter(options.bulkChannelRegistry),
    cdcIntegrationService: {},
    systemTableCache: createStubSystemTableCache(),
    createPartitionService: async (serviceOptions) => {
      const service = {
        ...serviceOptions,
        isShutdown: false,
        shutdown: async () => {},
      };
      created.push(service);
      return service;
    },
    dataDir: os.tmpdir(),
  });
  return {...setup, created};
}

async function createProductionShapedGeneration(prefix) {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  // Seal the generation into source.db's OWN replica checkpoints root
  // ({workDir}/checkpoints/source) so a service whose dbPath is source.db
  // resolves it directly — the production layout.
  const checkpointsRoot = path.join(workDir, 'checkpoints', 'source');
  const generation = await createSealedSourceGeneration({
    workDir,
    checkpointsRoot,
    partitionId: PARTITION_ID,
    stateTable: STATE_TABLE,
    term: TERM,
    identity: PRODUCTION_IDENTITY,
    entryCount: ENTRY_COUNT,
  });
  return {
    workDir,
    checkpointsRoot,
    sourceDbPath: generation.sourceDbPath,
    boundaryIndex: generation.boundaryIndex,
    close() {
      fs.rmSync(workDir, {recursive: true, force: true});
    },
  };
}

test('PRECONDITION WITNESS: a service built through the shared ' +
  'ReplicaHandlerSetup factory has the dispatcher seam set', async (t) => {
  const setup = createHandlerSetup();
  try {
    const service = await setup.replicaHandler.createPartitionService({
      partitionId: PARTITION_ID,
      tableName: STATE_TABLE,
      replicaId: REPLICA_ID,
      dbPath: path.join(os.tmpdir(), 'wiring-witness.db'),
    });
    t.equal(typeof service.onSnapshotCatchupNeeded, 'function',
      'the factory-built service carries the onSnapshotCatchupNeeded seam ' +
      '(reverting the ReplicaHandlerSetup wrapper reds this)');
  } finally {
    setup.replicaStateMachine.stopTimeoutChecker();
  }
});

test('PRECONDITION WITNESS: the join/durable-rejoin factory sets the seam',
  async (t) => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wiring-join-'));
    const dbPath = path.join(workDir, 'partition', 'join-replica.db');
    fs.mkdirSync(path.dirname(dbPath), {recursive: true});
    const stubJoinService = {
      nodeId: NODE_ID,
      transport: null,
      messageRouter: createStubRouter(),
      rebalanceCoordinator: null,
      replicaStateMachine: null,
      bootstrapReadinessState: null,
      systemCacheHydrated: false,
      tablePolicyService: {},
      partitionServices: new Map(),
      createCdcIntegrationService: () => ({sqlQueryEngine: null}),
      trackJoinPartitionReplica() {},
    };
    let service = null;
    try {
      service = await NodeJoiningPublicationActivation.prototype
        .createJoinLocalPartitionService.call(stubJoinService, {
          partitionId: PARTITION_ID,
          tableId: STATE_TABLE,
          tableName: STATE_TABLE,
          replicaId: REPLICA_ID,
          replicaIds: [REPLICA_ID],
          nodeId: NODE_ID,
          dbPath,
          schema: {
            columns: [
              {name: 'id', type: 'TEXT', primaryKey: true},
              {name: 'payload', type: 'TEXT'},
            ],
          },
          deferElection: true,
          messageGroupService: {},
        });
      t.equal(typeof service.onSnapshotCatchupNeeded, 'function',
        'the join-factory-built service carries the seam (durable-rejoin ' +
        'restores use THIS path — reverting the join attach reds this)');
      t.equal(stubJoinService.partitionServices.get(REPLICA_ID), service,
        'anti-vacuous: the real join factory built and tracked the service');
    } finally {
      if (service && !service.isShutdown) {
        await service.shutdown();
      }
      fs.rmSync(workDir, {recursive: true, force: true});
    }
  });

test('the wired dispatcher types SOCKET_UNAVAILABLE for an unreachable ' +
  'follower and never throws into liferaft', async (t) => {
  const fixture = await createProductionShapedGeneration('wiring-socket-');
  try {
    const service = {
      partitionId: PARTITION_ID,
      tableName: STATE_TABLE,
      dbPath: fixture.sourceDbPath,
      db: null,
    };
    // Production registry present but the follower has NO endpoint row in
    // the cache and NO existing connection: the dial leg cannot resolve.
    const registry = createBulkTransferChannelRegistry({nodeId: NODE_ID});
    try {
      attachSnapshotCatchupDispatcher({
        service,
        systemTableCache: createStubSystemTableCache(),
        messageRouter: createStubRouter(registry),
      });
      // The fixture sealed its generation under source.db's own
      // checkpoints root, so the dispatch resolves an EXISTING generation
      // and reaches the socketProvider leg.
      const result = await service.onSnapshotCatchupNeeded(
        buildSnapshotCatchupDecision({
          outcome: RAFT_SNAPSHOT_CATCHUP_DECISION_OUTCOME.INSTALL_SNAPSHOT,
          followerAddress: FOLLOWER_ADDRESS,
          startIndex: 1,
          failedIndex: fixture.boundaryIndex,
          leaderBoundary: fixture.boundaryIndex,
        }));
      t.equal(result.outcome,
        RAFT_SNAPSHOT_CATCHUP_DISPATCH_OUTCOME.SOCKET_UNAVAILABLE,
        'the unreachable follower is the typed socket_unavailable refusal');
    } finally {
      registry.closeAll();
    }
  } finally {
    fixture.close();
  }
});

test('the wired dispatcher serves a real transfer over an existing bulk ' +
  'connection (no driver token bucket — pacing stays with sendChunkFrame)',
async (t) => {
  const fixture = await createProductionShapedGeneration('wiring-serve-');
  const registry = createBulkTransferChannelRegistry({nodeId: NODE_ID});
  const peerRegistry = createBulkTransferChannelRegistry(
    {nodeId: PEER_NODE_ID});
  const receiveRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'wiring-serve-recv-'));
  try {
    const pair = createInProcWebSocketPair();
    registry.adoptIncomingSocket({nodeId: PEER_NODE_ID, ws: pair.a});
    const peerConnection = peerRegistry.adoptIncomingSocket(
      {nodeId: NODE_ID, ws: pair.b});
    const service = {
      partitionId: PARTITION_ID,
      tableName: STATE_TABLE,
      dbPath: fixture.sourceDbPath,
      db: null,
    };
    attachSnapshotCatchupDispatcher({
      service,
      systemTableCache: createStubSystemTableCache(),
      messageRouter: createStubRouter(registry),
    });
    const [dispatched, received] = await Promise.all([
      service.onSnapshotCatchupNeeded(buildSnapshotCatchupDecision({
        outcome: RAFT_SNAPSHOT_CATCHUP_DECISION_OUTCOME.INSTALL_SNAPSHOT,
        followerAddress: FOLLOWER_ADDRESS,
        startIndex: 1,
        failedIndex: fixture.boundaryIndex,
        leaderBoundary: fixture.boundaryIndex,
      })),
      receiveSnapshotTransfer({
        socket: bulkConnectionTransferSocket(peerConnection),
        checkpointsRoot: receiveRoot,
        expectedIdentity: PRODUCTION_IDENTITY,
      }),
    ]);
    t.equal(dispatched.outcome,
      RAFT_SNAPSHOT_CATCHUP_DISPATCH_OUTCOME.SERVED,
      'the production dispatcher serves over the existing bulk connection');
    t.equal(received.outcome, RAFT_SNAPSHOT_TRANSFER_OUTCOME.COMPLETED,
      'the peer receives the complete generation');
  } finally {
    registry.closeAll();
    peerRegistry.closeAll();
    fs.rmSync(receiveRoot, {recursive: true, force: true});
    fixture.close();
  }
});

test('ENGAGEMENT: ReplicaHandlerSetup arms the offer router — an adopted ' +
  'bulk OFFER drives install, recreate via the wrapped factory, and the ' +
  'replaceLocalReplicaService swap', async (t) => {
  const fixture = await createProductionShapedGeneration('wiring-loop-');
  const registry = createBulkTransferChannelRegistry({nodeId: NODE_ID});
  const serveRegistry = createBulkTransferChannelRegistry(
    {nodeId: PEER_NODE_ID});
  const setup = createHandlerSetup({bulkChannelRegistry: registry});
  const replicaDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'wiring-loop-replica-'));
  try {
    const targetDbPath = path.join(replicaDir, 'partition', 'target.db');
    fs.mkdirSync(path.dirname(targetDbPath), {recursive: true});
    const targetService = {
      partitionId: PARTITION_ID,
      tableId: STATE_TABLE,
      tableName: STATE_TABLE,
      replicaId: REPLICA_ID,
      replicaIds: [REPLICA_ID],
      nodeId: NODE_ID,
      dbPath: targetDbPath,
      isShutdown: false,
      shutdown: async function() {
        this.isShutdown = true;
      },
    };
    setup.replicaHandler.registerExistingReplica({
      replicaId: REPLICA_ID,
      partitionId: PARTITION_ID,
      tableName: STATE_TABLE,
      service: targetService,
    });

    // Inbound bulk adoption on the node under test: the ReplicaHandlerSetup
    // arming must have hooked registry.onAdopt.
    const pair = createInProcWebSocketPair();
    registry.adoptIncomingSocket({nodeId: PEER_NODE_ID, ws: pair.b});
    const serveConnection = serveRegistry.adoptIncomingSocket(
      {nodeId: NODE_ID, ws: pair.a});

    // Default chunk geometry: the production receiver pins the 1 MiB
    // default, so a non-default serve geometry would be refused.
    const served = await serveSnapshotTransfer({
      socket: bulkConnectionTransferSocket(serveConnection),
      checkpointsRoot: fixture.checkpointsRoot,
      generationIndex: fixture.boundaryIndex,
      transferId: 'wiring-loop-transfer',
    });
    t.equal(served.outcome, RAFT_SNAPSHOT_TRANSFER_OUTCOME.COMPLETED,
      'the leader-side serve completes against the production-armed router');

    const replacement = await waitForCondition(
      () => {
        const current = setup.replicaHandler.localServices.get(REPLICA_ID);
        return current && current !== targetService ? current : null;
      },
      'replaceLocalReplicaService swaps in the recreated service');
    t.equal(targetService.isShutdown, true,
      'the old service was shut down at the closed-handle boundary');
    t.equal(replacement.dbPath, targetDbPath,
      'the replacement was recreated over the SAME replica dbPath');
    t.equal(setup.created.includes(replacement), true,
      'the replacement came from the production factory');
    t.equal(typeof replacement.onSnapshotCatchupNeeded, 'function',
      'the replacement flowed through the WRAPPED factory — the seam ' +
      're-attached itself');
    t.equal(
      setup.replicaHandler.localReplicas.get(REPLICA_ID).service,
      replacement,
      'the tracked replica metadata swapped too');
    t.ok(fs.existsSync(targetDbPath),
      'the installed replica database exists at the target path');
  } finally {
    setup.replicaStateMachine.stopTimeoutChecker();
    registry.closeAll();
    serveRegistry.closeAll();
    fs.rmSync(replicaDir, {recursive: true, force: true});
    fixture.close();
  }
});
