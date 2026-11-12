// The leader's snapshot re-ask over the PRODUCTION wiring on both sides
// (bootstrap/shared/snapshot-catchup-wiring.js): attachSnapshotCatchupDispatcher
// with its bulk dial on the leader node, armSnapshotOfferRouting on the
// follower node's registry, the real catch-up driver in front of the seam,
// and the real dispatch, transfer and install orchestration behind it. The
// transfer contract witnessed here: one bulk connection carries one
// transfer; the dispatching side dials it and closes it when its dispatch
// ends; a follower route that cannot take the offer answers a typed abort; a
// dispatch that reports no progress is aborted and frees the node's slot.
// In-process stand-ins: the dial and the node directory
// (snapshot-wiring-inproc-fixture.js) and the follower's replica handler (the
// four members the wiring calls), over service doubles and sealed fixture
// generations.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterEach, beforeEach, test} from 'node:test';

import {AddressManager} from '../../src/address/address-manager.js';
import {
  armSnapshotOfferRouting,
  attachSnapshotCatchupDispatcher,
} from '../../src/bootstrap/shared/snapshot-catchup-wiring.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  createPartitionSnapshotCatchupDriver,
} from '../../src/partition/partition-snapshot-catchup-driver.js';
import {
  PARTITION_SNAPSHOT_CATCHUP_CLOSE as CLOSE,
  PARTITION_SNAPSHOT_CATCHUP_DISPATCH_IDLE_BOUND_MS as IDLE_BOUND_MS,
  PARTITION_SNAPSHOT_CATCHUP_DRIVER_OUTCOME as DRIVER,
  PARTITION_SNAPSHOT_CATCHUP_REASK_BOUND_MS as REASK_BOUND_MS,
  PARTITION_SNAPSHOT_CATCHUP_TRIGGER as TRIGGER,
  PARTITION_SNAPSHOT_PROGRESS_EVENT as EVENT,
} from '../../src/partition/partition-snapshot-progress-constants.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {
  RAFT_SNAPSHOT_CATCHUP_DECISION_OUTCOME,
  RAFT_SNAPSHOT_CATCHUP_DISPATCH_OUTCOME as DISPATCH,
  RAFT_SNAPSHOT_CATCHUP_INSTALL_OUTCOME as INSTALL,
  RAFT_SNAPSHOT_DEFAULT_CLUSTER_ID,
  buildSnapshotCatchupDecision,
} from '../../src/raft/snapshot-catchup-constants.js';
import {listInFlightGenerationIndexes} from '../../src/raft/snapshot-catchup.js';
import {
  RAFT_SNAPSHOT_ADOPTED_LANE_IDLE_BOUND_MS as LANE_IDLE_BOUND_MS,
  RAFT_SNAPSHOT_OFFER_RECEIVER as RECEIVER,
  RAFT_SNAPSHOT_OFFER_ROUTE_OUTCOME as ROUTE,
  armSnapshotOfferRouter,
} from '../../src/raft/snapshot-offer-router.js';
import {
  RAFT_SNAPSHOT_TRANSFER_ABORT_REASON as ABORT,
  RAFT_SNAPSHOT_TRANSFER_MESSAGE_KIND as KIND,
} from '../../src/raft/snapshot-transfer-constants.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {leaderStatusOf} from '../test-helpers/raft-leader-status-fixture.js';
import {waitForCondition as waitFor} from './bulk-transfer-socket-fixture.js';
import {createSealedSourceGeneration} from './snapshot-catchup-fixture.js';
import {
  createInProcBulkNetwork,
  createNodeReplicaHandler,
  nodeDirectoryCache,
  routerFacts,
} from './snapshot-wiring-inproc-fixture.js';

const LEADER_NODE = 'node-a';
const FOLLOWER_NODE = 'node-b';
const SILENT_NODE = 'node-c';
const ADDRESS = Object.freeze({[LEADER_NODE]: 'ws://node-a:7000',
  [FOLLOWER_NODE]: 'ws://node-b:7000', [SILENT_NODE]: 'ws://node-c:7000'});
const START_MS = 1_000_000;
const SCENARIO = Object.freeze({timeout: 60000});
const SINGLETONS = [ConfigurationManager, LoggingService, AddressManager];

let workDir;

beforeEach(() => {
  for (const singleton of SINGLETONS) singleton.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: LEADER_NODE}});
  LoggingService.getInstance().initialize({level: 'error'});
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wiring-reask-'));
});

afterEach(() => {
  fs.rmSync(workDir, {recursive: true, force: true});
  for (const singleton of SINGLETONS) singleton.resetInstance();
});

// One node: its real registry armed by the production offer routing (with
// the lane clock for its adopted-connection idle bound), over the node's
// real replica handler; the factory answers a replica stand-in and counts.
function armedNode(network, world, nodeId) {
  const registry = network.registryFor(nodeId, ADDRESS[nodeId]);
  const node = {registry, routes: [], installs: [], opened: []};
  Object.assign(node, createNodeReplicaHandler({nodeId, dataDir: workDir,
    createPartitionService: async (options) => {
      node.opened.push(options.replicaId);
      return {...options, isShutdown: false, shutdown: async () => {},
        recordSnapshotInstallOutcome: (outcome) => world.installOutcomes.push(
          {replicaId: options.replicaId, reopened: true, ...outcome})};
    }}));
  armSnapshotOfferRouting({registry, replicaHandler: node.replicaHandler,
    timeSource: world.laneClock,
    systemTableCache: nodeDirectoryCache({nodes: ADDRESS,
      readEpoch: () => world.followerEpoch}),
    onRouteOutcome: (route) => {
      node.routes.push(route.outcome);
      if (route.completion) node.installs.push(route.completion);
    }});
  return node;
}

// One partition led on the leader node: a sealed generation in its own
// replica's checkpoints root, the production dispatcher on its service, the
// real driver in front, and (unless withheld) its replica on a node.
async function leaderPartition(world, name, options = {}) {
  const partitionId = `${name}-p1`;
  const replicaId = `${partitionId}-r2`;
  const followerNodeId = options.followerNode ?? FOLLOWER_NODE;
  const followerAddress = `${followerNodeId}/partition/${replicaId}`;
  const partitionDir = path.join(workDir, name);
  fs.mkdirSync(partitionDir, {recursive: true});
  const generation = await createSealedSourceGeneration({workDir: partitionDir,
    checkpointsRoot: path.join(partitionDir, 'checkpoints', 'source'),
    partitionId, stateTable: name, term: 6, entryCount: 4,
    identity: {clusterId: RAFT_SNAPSHOT_DEFAULT_CLUSTER_ID, raftGroupId: partitionId,
      entity: {kind: 'partition', id: name}, membershipEpoch: 0}});
  const lines = [];
  const record = (level) => (message, fields) => lines.push({level, message, fields});
  const service = {partitionId, tableName: name, dbPath: generation.sourceDbPath,
    db: null, role: RAFT_ROLE.LEADER, isShutdown: false,
    timeSource: {now: () => world.nowMs},
    logger: {warn: record('warn'), info: record('info')},
    systemTableCache: world.leaderCache,
    raft: {readStatus: () => leaderStatusOf({groupId: partitionId,
      leaderReplicaIdentity: `${partitionId}-r1`,
      leaderAddress: `${LEADER_NODE}/partition/${partitionId}-r1`,
      peers: [{peerId: '2', replicaIdentity: replicaId, address: followerAddress,
        matched: 1}]})}};
  attachSnapshotCatchupDispatcher({service, systemTableCache: world.leaderCache,
    messageRouter: routerFacts(LEADER_NODE, ADDRESS[LEADER_NODE], world.leaderRegistry)});
  if (options.replica !== false) {
    const targetDir = path.join(partitionDir, 'replica', 'partition');
    fs.mkdirSync(targetDir, {recursive: true});
    await world.follower.host({partitionId,
      tableId: name, tableName: name, replicaId, replicaIds: [replicaId],
      nodeId: FOLLOWER_NODE, dbPath: path.join(targetDir, 'target.db'),
      isShutdown: options.replicaShutDown === true, shutdown: async function() {
        this.isShutdown = true;
      },
      recordSnapshotInstallOutcome: (outcome) => world.installOutcomes.push(
        {replicaId, ...outcome})});
  }
  const driver = createPartitionSnapshotCatchupDriver({service});
  return {partitionId, replicaId, service, driver, lines,
    boundaryIndex: generation.boundaryIndex,
    decision: buildSnapshotCatchupDecision({
      outcome: RAFT_SNAPSHOT_CATCHUP_DECISION_OUTCOME.INSTALL_SNAPSHOT,
      followerAddress, startIndex: 1, failedIndex: generation.boundaryIndex,
      leaderBoundary: generation.boundaryIndex}),
    record: () => driver.readDiagnostics().followers[0],
    dispatchLines: () => lines.filter(({fields}) =>
      fields.event === EVENT.CATCHUP_DISPATCH_OUTCOME)};
}

function openWorld() {
  const network = createInProcBulkNetwork();
  const world = {network, nowMs: START_MS, followerEpoch: 0, installOutcomes: [],
    laneClock: new VirtualTimeSource({startMs: START_MS})};
  world.leaderCache = nodeDirectoryCache({nodes: ADDRESS, readEpoch: () => null});
  world.leader = armedNode(network, world, LEADER_NODE);
  world.leaderRegistry = world.leader.registry;
  world.follower = armedNode(network, world, FOLLOWER_NODE);
  // A node that adopts a bulk connection and never answers on it.
  world.silentRegistry = network.registryFor(SILENT_NODE, ADDRESS[SILENT_NODE]);
  world.close = () => {
    world.leaderRegistry.closeAll();
    world.follower.registry.closeAll();
    world.silentRegistry.closeAll();
    for (const node of [world.leader, world.follower]) {
      node.replicaStateMachine.stopTimeoutChecker();
    }
  };
  return world;
}

// The dispatch a notification starts, awaited until its record leaves flight.
async function settled(partition, label) {
  await waitFor(() => partition.record()?.inFlight === false, label);
  return partition.record();
}

test('R1 after a refusal, the re-ask is dialled afresh, routed and served',
  SCENARIO, async () => {
    const world = openWorld();
    try {
      const partition = await leaderPartition(world, 'refused_rows');
      world.followerEpoch = 3;
      partition.driver.dispatch(partition.decision);
      const refused = await settled(partition, 'the first dispatch settles');
      assert.deepEqual([refused.lastOutcome, refused.lastReason],
        [DISPATCH.TRANSFER_ABORTED, ABORT.STALE_EPOCH]);
      assert.equal(world.leaderRegistry.getConnection(FOLLOWER_NODE), null,
        'the dispatching side closed its connection when the dispatch ended');
      await Promise.all(world.follower.installs);
      assert.deepEqual(world.installOutcomes, [{replicaId: partition.replicaId,
        outcome: INSTALL.RECEIVE_FAILED, reason: ABORT.STALE_EPOCH}],
      'the follower replica records the typed result of an install that did not complete');

      world.followerEpoch = 0;
      const swept = await partition.driver.sweep(refused.settledAtMs + REASK_BOUND_MS);
      assert.deepEqual(swept.reasked.map(({trigger}) => trigger),
        [TRIGGER.BOUND_ELAPSED]);
      const served = await settled(partition, 'the re-ask settles');
      assert.deepEqual([served.attempts, served.lastOutcome],
        [2, DISPATCH.SERVED], JSON.stringify(served));
      assert.deepEqual(world.follower.routes, [ROUTE.ROUTED, ROUTE.ROUTED]);
      assert.equal(world.network.dials(), 2, 'one connection per transfer');
      const installs = await Promise.all(world.follower.installs);
      assert.deepEqual(installs.map(({outcome}) => outcome),
        [INSTALL.RECEIVE_FAILED, INSTALL.INSTALLED_AND_RECREATED]);
      assert.deepEqual(world.follower.opened, [partition.replicaId],
        'the node\'s handler admitted the install and reopened the replica once');
      assert.equal(world.follower.replicaHandler.localServices
        .get(partition.replicaId).isShutdown, false, 'and holds the replacement');
      assert.deepEqual(listInFlightGenerationIndexes(), []);
    } finally {
      world.close();
    }
  });

test('R2 after a served transfer, a second dispatch to the same node is routed again',
  SCENARIO, async () => {
    const world = openWorld();
    try {
      const partition = await leaderPartition(world, 'served_rows');
      partition.driver.dispatch(partition.decision);
      assert.equal((await settled(partition, 'first')).lastOutcome, DISPATCH.SERVED);
      await Promise.all(world.follower.installs);
      partition.driver.dispatch(partition.decision);
      await waitFor(() => partition.record().attempts === 2 &&
        partition.record().inFlight === false, 'the second dispatch settles');
      // The follower already holds this generation; what its receiver and
      // install owner answer the second time is theirs. The claim here is
      // the route: the second offer reaches a freshly armed router.
      assert.deepEqual(world.follower.routes, [ROUTE.ROUTED, ROUTE.ROUTED]);
      assert.equal(world.network.dials(), 2);
      assert.equal(world.leaderRegistry.getConnection(FOLLOWER_NODE), null);
      assert.equal((await Promise.all(world.follower.installs)).length, 2,
        'both follower orchestrations settle');
    } finally {
      world.close();
    }
  });

test('R3 a node with no running replica of the group answers a typed abort',
  SCENARIO, async () => {
    const world = openWorld();
    try {
      const absent = await leaderPartition(world, 'absent_rows', {replica: false});
      absent.driver.dispatch(absent.decision);
      const refused = await settled(absent, 'the dispatch to the absent replica settles');
      assert.deepEqual([refused.lastOutcome, refused.lastReason],
        [DISPATCH.TRANSFER_ABORTED, ABORT.REPLICA_NOT_FOUND]);
      // A replica that is shut down with no install of its own under way is
      // not this node's running replica either (one stopped for an install
      // answers installing: partition-snapshot-install-recreate.test.js).
      const installing = await leaderPartition(world, 'installing_rows',
        {replicaShutDown: true});
      installing.driver.dispatch(installing.decision);
      assert.equal((await settled(installing, 'the re-offer settles')).lastReason,
        ABORT.REPLICA_NOT_FOUND);
      assert.deepEqual(world.follower.routes,
        [ROUTE.REPLICA_NOT_FOUND, ROUTE.REPLICA_NOT_FOUND]);
      assert.deepEqual(world.follower.opened, []);
      assert.equal(absent.dispatchLines().length, 1, 'the refusal is logged');
    } finally {
      world.close();
    }
  });

test('R4 a first frame that is not an offer is answered with a typed abort',
  SCENARIO, async () => {
    const world = openWorld();
    try {
      const connection = await world.leaderRegistry.dial({nodeId: FOLLOWER_NODE,
        address: ADDRESS[FOLLOWER_NODE],
        identify: routerFacts(LEADER_NODE, ADDRESS[LEADER_NODE])});
      const answers = [];
      connection.onMessage((frame) => answers.push(JSON.parse(String(frame))));
      connection.sendControl({kind: 'not-a-snapshot-offer'});
      await waitFor(() => answers.length === 1, 'the follower answers');
      assert.deepEqual({kind: answers[0].kind, reason: answers[0].reason},
        {kind: KIND.ABORT, reason: ABORT.CHUNK_FRAME_INVALID});
      assert.deepEqual(world.follower.routes, [ROUTE.NOT_OFFER]);
    } finally {
      world.close();
    }
  });

test('R5 a dispatch nobody answers is aborted at the idle bound, typed and ' +
  'logged, and frees the node\'s transfer slot', SCENARIO, async () => {
  const world = openWorld();
  try {
    const partition = await leaderPartition(world, 'silent_rows',
      {followerNode: SILENT_NODE, replica: false});
    partition.driver.dispatch(partition.decision);
    await waitFor(() => world.silentRegistry.getConnection(LEADER_NODE) !== null,
      'the offer reaches the silent node');
    assert.deepEqual(listInFlightGenerationIndexes(), [partition.boundaryIndex]);
    await partition.driver.sweep(START_MS + IDLE_BOUND_MS - 1);
    assert.equal(partition.record().inFlight, true, 'not yet silent for the bound');

    await partition.driver.sweep(START_MS + IDLE_BOUND_MS);
    const aborted = await settled(partition, 'the unanswered dispatch settles');
    assert.deepEqual([aborted.attempts, aborted.lastOutcome],
      [1, DRIVER.DISPATCH_UNANSWERED]);
    assert.deepEqual(partition.dispatchLines().map(({level, fields}) =>
      [level, fields.outcome]), [['warn', DRIVER.DISPATCH_UNANSWERED]]);
    await waitFor(() => listInFlightGenerationIndexes().length === 0,
      'the aborted dispatch releases the follower node\'s slot');
    assert.equal(world.leaderRegistry.getConnection(SILENT_NODE), null,
      'and closes its connection');
  } finally {
    world.close();
  }
});

test('R6 several partitions lagging on one node are each served, one ' +
  'transfer at a time, none waiting on the refused-dispatch bound',
SCENARIO, async () => {
  const world = openWorld();
  try {
    const partitions = [];
    for (const name of ['slot_a', 'slot_b', 'slot_c']) {
      partitions.push(await leaderPartition(world, name));
    }
    // All three are notified in the same turn: one takes the node's slot.
    for (const partition of partitions) partition.driver.dispatch(partition.decision);
    await Promise.all(partitions.map((partition) => settled(partition, 'first round')));
    assert.deepEqual(partitions.map((partition) => partition.record().lastOutcome).sort(),
      [DISPATCH.ALREADY_IN_FLIGHT, DISPATCH.ALREADY_IN_FLIGHT, DISPATCH.SERVED]);

    // The 1 s sweep: each waiting partition asks again on its next sweep.
    const servedOrder = partitions.filter((partition) =>
      partition.record().lastOutcome === DISPATCH.SERVED).map(({partitionId}) => partitionId);
    let sweeps = 0;
    while (servedOrder.length < partitions.length && sweeps < 6) {
      sweeps += 1;
      world.nowMs += 1000;
      for (const partition of partitions) await partition.driver.sweep(world.nowMs);
      await Promise.all(partitions.map((partition) => settled(partition, 'sweep round')));
      for (const partition of partitions) {
        if (partition.record().lastOutcome === DISPATCH.SERVED &&
            !servedOrder.includes(partition.partitionId)) {
          servedOrder.push(partition.partitionId);
        }
      }
    }
    assert.equal(servedOrder.length, 3, `served: ${servedOrder} after ${sweeps} sweeps`);
    assert.equal(sweeps, 2, 'one more partition is served per sweep');
    assert.ok(world.nowMs - START_MS < REASK_BOUND_MS);
    assert.equal(world.network.dials(), 3);
    assert.deepEqual(world.follower.routes, [ROUTE.ROUTED, ROUTE.ROUTED, ROUTE.ROUTED]);
    assert.deepEqual((await Promise.all(world.follower.installs))
      .map(({outcome}) => outcome), Array(3).fill(INSTALL.INSTALLED_AND_RECREATED));
    for (const partition of partitions) {
      assert.equal(partition.record().lastTrigger === TRIGGER.RUNTIME_NOTIFICATION ||
        partition.record().lastTrigger === TRIGGER.FOLLOWER_NODE_SLOT_BUSY, true);
    }
  } finally {
    world.close();
  }
});

test('R7 a node already transferring to this node holds the lane: the ' +
  'dispatch answers socket_unavailable and leaves that connection alone',
SCENARIO, async () => {
  const world = openWorld();
  try {
    const partition = await leaderPartition(world, 'busy_rows');
    // The follower node's own dispatch towards this node: its dial is this
    // node's adopted, open connection for that node.
    const inbound = await world.follower.registry.dial({nodeId: LEADER_NODE,
      address: ADDRESS[LEADER_NODE],
      identify: routerFacts(FOLLOWER_NODE, ADDRESS[FOLLOWER_NODE])});
    const seen = [];
    inbound.onMessage((frame) => seen.push(frame));
    await waitFor(() => world.leaderRegistry.getConnection(FOLLOWER_NODE) !== null,
      'the inbound connection is adopted');
    partition.driver.dispatch(partition.decision);
    const busy = await settled(partition, 'the dispatch settles');
    assert.equal(busy.lastOutcome, DISPATCH.SOCKET_UNAVAILABLE, JSON.stringify(busy));
    assert.equal(inbound.isOpen(), true);
    assert.deepEqual(seen, [], 'nothing was sent into the other transfer\'s lane');
    assert.equal(world.network.dials(), 1);
  } finally {
    world.close();
  }
});

test('R8 a leader service shut down mid-dispatch aborts its flight and ' +
  'closes its record: another partition\'s dispatch to that node is served',
SCENARIO, async () => {
  const world = openWorld();
  try {
    const stopping = await leaderPartition(world, 'stopping_rows');
    const waiting = await leaderPartition(world, 'waiting_rows');
    // The follower node's listener answers nothing for now.
    world.network.listen(ADDRESS[FOLLOWER_NODE], world.silentRegistry);
    stopping.driver.dispatch(stopping.decision);
    await waitFor(() => world.silentRegistry.getConnection(LEADER_NODE) !== null,
      'the offer reaches the silent listener');
    waiting.driver.dispatch(waiting.decision);
    assert.equal((await settled(waiting, 'the second partition settles')).lastOutcome,
      DISPATCH.ALREADY_IN_FLIGHT, 'the node\'s slot is held by the first dispatch');

    assert.equal(typeof stopping.driver.shutdown, 'function',
      'the driver ends with its service');
    stopping.driver.shutdown();
    assert.deepEqual(stopping.driver.readDiagnostics().followers, []);
    assert.deepEqual(stopping.lines.filter(({fields}) =>
      fields.event === EVENT.CATCHUP_SETTLED).map(({fields}) => fields.reason),
    [CLOSE.SERVICE_SHUT_DOWN]);
    await waitFor(() => listInFlightGenerationIndexes().length === 0,
      'the aborted dispatch releases the node\'s slot');
    const refusedLate = await stopping.driver.dispatch(stopping.decision);
    assert.equal(refusedLate.outcome, DRIVER.SERVICE_SHUT_DOWN);

    world.network.listen(ADDRESS[FOLLOWER_NODE], world.follower.registry);
    world.nowMs += 1000;
    const swept = await waiting.driver.sweep(world.nowMs);
    assert.deepEqual(swept.reasked.map(({trigger}) => trigger),
      [TRIGGER.FOLLOWER_NODE_SLOT_BUSY]);
    assert.equal((await settled(waiting, 'the waiting partition is served')).lastOutcome,
      DISPATCH.SERVED);
  } finally {
    world.close();
  }
});

test('R9 a half-open adopted connection (its peer stopped without a close) ' +
  'is closed at the lane idle bound, typed, and the dispatch towards that ' +
  'node is then dialled and served', SCENARIO, async () => {
  const world = openWorld();
  try {
    const partition = await leaderPartition(world, 'halfopen_rows');
    // The follower node once dialled this node and has since gone silent.
    await world.follower.registry.dial({nodeId: LEADER_NODE,
      address: ADDRESS[LEADER_NODE],
      identify: routerFacts(FOLLOWER_NODE, ADDRESS[FOLLOWER_NODE])});
    await waitFor(() => world.leaderRegistry.getConnection(FOLLOWER_NODE) !== null,
      'the inbound connection is adopted');
    partition.driver.dispatch(partition.decision);
    assert.equal((await settled(partition, 'blocked')).lastOutcome,
      DISPATCH.SOCKET_UNAVAILABLE);

    world.laneClock.advance(LANE_IDLE_BOUND_MS - 1);
    assert.equal(world.leaderRegistry.getConnection(FOLLOWER_NODE)?.isOpen(), true,
      'not yet silent for the bound');
    world.laneClock.advance(1);
    await waitFor(() => world.leaderRegistry.getConnection(FOLLOWER_NODE) === null,
      'the adopting side closes the silent lane');
    assert.deepEqual(world.leader.routes, [ROUTE.LANE_IDLE_CLOSED]);

    const swept = await partition.driver.sweep(partition.record().settledAtMs + REASK_BOUND_MS);
    assert.deepEqual(swept.reasked.map(({trigger}) => trigger), [TRIGGER.BOUND_ELAPSED]);
    assert.equal((await settled(partition, 'served')).lastOutcome, DISPATCH.SERVED,
      JSON.stringify(partition.record()));
  } finally {
    world.close();
  }
});

// One adopted connection as the router sees it, with the frames a test
// delivers and what the router did to it.
function adoptedConnection() {
  const connection = {listeners: [], closeListeners: [], sent: [], closed: false,
    onMessage: (listener) => connection.listeners.push(listener),
    offMessage: (listener) => {
      connection.listeners = connection.listeners.filter((kept) => kept !== listener);
    },
    onClose: (listener) => connection.closeListeners.push(listener),
    sendControl: (message) => connection.sent.push(message),
    isOpen: () => !connection.closed,
    close: () => {
      connection.closed = true;
      for (const listener of connection.closeListeners) listener();
    },
    deliver: (frame) => {
      for (const listener of [...connection.listeners]) listener(frame, false);
    }};
  return connection;
}

test('R11 a rejected install: the node\'s handler returns the replica it ' +
  'stopped, and the result is recorded on the replica that runs', SCENARIO,
async () => {
  const world = openWorld();
  try {
    const partition = await leaderPartition(world, 'rejected_rows');
    // The publication epoch moves after the receive and before the install:
    // the handler's second lifecycle read is its admission before the
    // shutdown, and the install reads the identity next.
    let lifecycleReads = 0;
    world.follower.store.setBeforeAuthoritativeRead(() => {
      lifecycleReads += 1;
      if (lifecycleReads === 2) world.followerEpoch = 4;
    });
    partition.driver.dispatch(partition.decision);
    await settled(partition, 'the dispatch settles');
    const [install] = await Promise.all(world.follower.installs);
    assert.equal(install.outcome, INSTALL.INSTALL_REJECTED, JSON.stringify(install));
    assert.deepEqual(world.follower.opened, [partition.replicaId],
      'the stopped replica was reopened by the node\'s handler');
    assert.deepEqual(world.installOutcomes, [{replicaId: partition.replicaId,
      reopened: true, outcome: INSTALL.INSTALL_REJECTED, reason: 'rejected',
      installReason: 'identity_mismatch', validationOutcome: 'stale_epoch',
      recreation: {state: 'running'}}],
    'the reopened replica records the install owner\'s own reason and that it is back');
    // The fourth read is the registered replacement's group check: a
    // replica opened from disk is asked whether its group ended as a unit,
    // exactly as an established replica registered at startup is.
    assert.equal(lifecycleReads, 4, 'offer, before the shutdown, the ' +
      'recreation, and the group check of the registered replacement');
  } finally {
    world.close();
  }
});

test('R10 the lane idle bound is armed at adoption, reset by every frame, ' +
  'and ends with the receive, which closes the lane', SCENARIO, async () => {
  const clock = new VirtualTimeSource({startMs: START_MS});
  const offer = JSON.stringify({kind: KIND.OFFER, transferId: 't',
    descriptor: {raftGroupId: 'group'}});
  const arm = (connection, orchestrate, outcomes) => armSnapshotOfferRouter({
    connection, timeSource: clock, orchestrate,
    resolveReceiver: () => ({state: RECEIVER.RUNNING, service: {}}),
    admitOffer: () => ({admitted: true}),
    onOutcome: (route) => outcomes.push(route.outcome)});

  // Armed at adoption: no frame at all.
  const silent = adoptedConnection();
  const silentOutcomes = [];
  arm(silent, () => new Promise(() => {}), silentOutcomes);
  clock.advance(LANE_IDLE_BOUND_MS - 1);
  assert.equal(silent.closed, false);
  clock.advance(1);
  assert.equal(silent.closed, true);
  assert.deepEqual(silentOutcomes, [ROUTE.LANE_IDLE_CLOSED]);

  // Reset by every frame while the transfer runs.
  const live = adoptedConnection();
  const liveOutcomes = [];
  let endReceive;
  arm(live, ({onTransferEnded}) => new Promise(() => {
    endReceive = onTransferEnded;
  }), liveOutcomes);
  clock.advance(LANE_IDLE_BOUND_MS - 1);
  live.deliver(offer);
  // The offer is admitted, then handed off, in a later turn.
  await new Promise((resolve) => setImmediate(resolve));
  clock.advance(LANE_IDLE_BOUND_MS - 1);
  live.deliver('chunk');
  clock.advance(LANE_IDLE_BOUND_MS - 1);
  assert.equal(live.closed, false, 'each frame restarts the bound');
  assert.deepEqual(liveOutcomes, [ROUTE.ROUTED]);

  // The receive ends: the bound no longer runs and the lane is closed.
  assert.equal(typeof endReceive, 'function',
    'the orchestration is handed the receive-ended notification');
  endReceive();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(live.closed, true, 'the lane closes when the receive ends');
  clock.advance(LANE_IDLE_BOUND_MS);
  assert.deepEqual(liveOutcomes, [ROUTE.ROUTED], 'no idle outcome after the receive ended');
});
