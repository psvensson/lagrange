// Quest partition-checkpoint-epoch-generation: a partition's raft-rs
// replica-image checkpoint is valid by its own reader whatever the cluster
// membership-publication epoch is, the partition snapshot cadence compacts
// with a production identity, a lagging follower installs through the
// production dispatch and orchestration functions, and a refusal is typed,
// logged, held (not rebuilt every sweep) and re-asked.
//
// Composition: real PartitionServices on real rs-raft over one in-process
// router, each with its OWN system-table cache (the only source of the
// identity's publication epoch), the service's own cadence owner and
// catch-up driver riding its own 1s-sweep entry points. The leader's
// dispatcher seam is set by the production attachSnapshotCatchupDispatcher
// over the leader node's real bulk registry, and the follower node's real
// bulk registry is armed by the production armSnapshotOfferRouting: every
// dispatch dials, is routed by raft group to the follower's CURRENT local
// replica, transfers, installs and recreates through the production
// functions. In-process stand-ins: the bulk dial and node directory
// (test/raft/snapshot-wiring-inproc-fixture.js) and the follower's replica
// handler (the four members the wiring calls, recreating a real service).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterEach, beforeEach, test} from 'node:test';

import {AddressManager} from '../../../src/address/address-manager.js';
import {
  armSnapshotOfferRouting,
  attachSnapshotCatchupDispatcher,
} from '../../../src/bootstrap/shared/snapshot-catchup-wiring.js';
import {ConfigurationManager} from '../../../src/config/configuration-manager.js';
import {SERVICE_TYPE} from '../../../src/constants/service.js';
import {HLCTimestamp} from '../../../src/hlc/hlc-timestamp.js';
import {LoggingService} from '../../../src/logging/logging-service.js';
import {
  insertParticipantTransactionRow,
} from '../../../src/partition/partition-participant-transaction-store.js';
import {PartitionService} from '../../../src/partition/partition-service.js';
import {
  PARTITION_SERVICE_OPERATION,
} from '../../../src/partition/partition-service-constants.js';
import {
  createPartitionSnapshotCadence,
} from '../../../src/partition/partition-snapshot-cadence.js';
import {
  PARTITION_SNAPSHOT_CADENCE_RETRY,
  PARTITION_SNAPSHOT_CADENCE_RETRY_TRIGGER,
  PARTITION_SNAPSHOT_CATCHUP_REASK_BOUND_MS,
  PARTITION_SNAPSHOT_CATCHUP_TRIGGER,
  PARTITION_SNAPSHOT_PROGRESS_EVENT,
  RAFT_SNAPSHOT_CADENCE_OUTCOME,
} from '../../../src/partition/partition-snapshot-progress-constants.js';
import {
  RAFT_MEMBERSHIP_OPERATION,
  RAFT_OPERATION_OUTCOME,
} from '../../../src/raft/raft-operation-port-constants.js';
import {RaftRsDurableStore} from '../../../src/raft/raft-rs-durable-store.js';
import {
  raftRsMembershipAdministration,
} from '../../../src/raft/raft-rs-membership-administration.js';
import {turnChainValue} from '../../../src/raft/raft-rs-turn-answer.js';
import {
  RAFT_SNAPSHOT_CATCHUP_DECISION_OUTCOME,
  RAFT_SNAPSHOT_CATCHUP_DISPATCH_OUTCOME,
  RAFT_SNAPSHOT_CATCHUP_INSTALL_OUTCOME,
  buildSnapshotCatchupDecision,
} from '../../../src/raft/snapshot-catchup-constants.js';
import {
  buildSnapshotCatchupIdentityFromCache,
  listInFlightGenerationIndexes,
} from '../../../src/raft/snapshot-catchup.js';
import {
  RAFT_CHECKPOINT_CREATION_OUTCOME,
  RAFT_CHECKPOINT_VALIDATION_OUTCOME,
  RAFT_RS_CHECKPOINT_REASON,
} from '../../../src/raft/snapshot-checkpoint-constants.js';
import {
  validateCheckpointDescriptor,
} from '../../../src/raft/snapshot-checkpoint-format.js';
import {
  createSqliteStateMachineCheckpoint,
  listCheckpointGenerations,
  readCheckpoint,
} from '../../../src/raft/snapshot-checkpoint-store.js';
import {resolveReplicaCheckpointsRoot} from '../../../src/raft/snapshot-install.js';
import {
  RAFT_SNAPSHOT_OFFER_ROUTE_OUTCOME,
} from '../../../src/raft/snapshot-offer-router.js';
import {
  RAFT_SNAPSHOT_TRANSFER_ABORT_REASON,
} from '../../../src/raft/snapshot-transfer-constants.js';
import {REPLICA_SNAPSHOT_INSTALL_STATE} from
  '../../../src/node/replica-snapshot-install-constants.js';
import {MessageRouter} from '../../../src/transport/message-router.js';
import {withFoundingStamp} from '../../partition/partition-founding-stamp.js';
import {TEST_BOOT_INCARNATION} from '../../test-helpers/boot-incarnation-fixture.js';
import {waitForCondition as waitFor} from '../bulk-transfer-socket-fixture.js';
import {
  createInProcBulkNetwork,
  createNodeReplicaHandler,
  nodeDirectoryCache,
  routerFacts,
} from '../snapshot-wiring-inproc-fixture.js';

const TABLE = 'cpe_rows';
const PARTITION_ID = 'cpe_rows-p1';
const NODE_ID = 'cpe-node';
// The bulk listeners of the two registries. Every replica lives on NODE_ID
// (one in-process router), so the follower's node resolves to the address
// the follower registry listens on.
const LEADER_BULK_ADDRESS = 'ws://cpe-leader:7100';
const FOLLOWER_BULK_ADDRESS = 'ws://cpe-follower:7100';
// The smallest entry threshold the configuration owner admits: the service's
// own cadence reads it, so each scenario writes that many rows.
const CADENCE_ENTRY_THRESHOLD = 100;
const ROWS = CADENCE_ENTRY_THRESHOLD;
const HUGE_HEARTBEAT_MS = 3600000;
const HUGE_ELECTION_MIN_MS = 7200000;
const HUGE_ELECTION_MAX_MS = 7300000;
// The service's own 1s sweep, shortened so its cadence and re-ask ticks run
// by themselves inside a test; MANUAL_SWEEP_MS parks it so a test drives the
// same entry points with explicit timestamps.
const FAST_SWEEP_MS = 40;
const MANUAL_SWEEP_MS = 3600000;
// A scenario that cannot finish is a failure, never a hang.
const SCENARIO = Object.freeze({timeout: 120000});
const HLC_BASE_MS = 1720000000000;
const SCHEMA = Object.freeze({columns: [
  {name: 'id', type: 'TEXT', primaryKey: true},
  {name: 'payload', type: 'TEXT'},
]});
const SINGLETONS = [ConfigurationManager, LoggingService, AddressManager];

beforeEach(() => {
  for (const singleton of SINGLETONS) singleton.resetInstance();
  ConfigurationManager.getInstance().initialize({
    node: {id: NODE_ID},
    raft: {
      heartbeatIntervalMs: HUGE_HEARTBEAT_MS,
      electionTimeoutMinMs: HUGE_ELECTION_MIN_MS,
      electionTimeoutMaxMs: HUGE_ELECTION_MAX_MS,
      snapshotThreshold: CADENCE_ENTRY_THRESHOLD,
    },
  });
  LoggingService.getInstance().initialize({level: 'error'});
});

afterEach(() => {
  for (const singleton of SINGLETONS) singleton.resetInstance();
});

// A node's system-table cache: the publication rows the identity builder
// reads (the cluster-id CONFIG row is absent) and the node directory the
// production dial resolves the follower's node from.
function publicationCache(initialEpoch) {
  let epoch = initialEpoch;
  return {
    setEpoch(next) {
      epoch = next;
    },
    cache: nodeDirectoryCache({nodes: {[NODE_ID]: FOLLOWER_BULK_ADDRESS},
      readEpoch: () => epoch}),
  };
}

function identityFrom(cache) {
  return buildSnapshotCatchupIdentityFromCache({partitionId: PARTITION_ID,
    tableName: TABLE, systemTableCache: cache.cache});
}

function hlc(ordinal) {
  return new HLCTimestamp(HLC_BASE_MS - ordinal * 1000, ordinal, NODE_ID).toString();
}

async function openRouter() {
  const router = new MessageRouter({bootIncarnation: TEST_BOOT_INCARNATION,
    nodeId: NODE_ID, nodeAddress: 'ws://cpe-node:7000', startServer: false});
  await router.initialize();
  return router;
}

function buildService(world, replicaId, cache, extra = {}) {
  const addressManager = AddressManager.getInstance();
  const options = {
    partitionId: PARTITION_ID, tableId: TABLE, tableName: TABLE, replicaId,
    replicaIds: world.ids,
    peerAddresses: world.ids.map((peer) =>
      addressManager.format(NODE_ID, 'partition', peer)),
    nodeId: NODE_ID, transport: world.router,
    dbPath: path.join(world.workDir, 'partition', `${replicaId}.db`),
    schema: SCHEMA, deferElection: true, systemTableCache: cache.cache,
    preparedStateHoldSweepIntervalMs: world.sweepMs, ...extra,
  };
  return new PartitionService(extra.bootstrapMembership ? options :
    withFoundingStamp(options));
}

async function insertRows(leader, from, to) {
  for (let ordinal = from; ordinal <= to; ordinal += 1) {
    const outcome = await turnChainValue(leader.raft.propose({
      type: PARTITION_SERVICE_OPERATION.INSERT,
      sql: `INSERT INTO ${TABLE} (id, payload) VALUES (?, ?)`,
      params: [`row-${ordinal}`, `payload-${ordinal}`],
      entryId: `entry-${ordinal}`, timestamp: hlc(ordinal)}));
    assert.equal(outcome.outcome, RAFT_OPERATION_OUTCOME.CORE_OK,
      JSON.stringify(outcome));
  }
}

function userRows(db) {
  return db.prepare(`SELECT id, payload FROM ${TABLE} ORDER BY id`).all();
}

function durableRecord(service) {
  return RaftRsDurableStore.readDurableRecordIn(service.db, PARTITION_ID);
}

function compactedIndex(service) {
  return Number(RaftRsDurableStore.readSnapshotIndexIn(service.db, PARTITION_ID));
}

// Every warn/info/error line a service writes, kept beside the real logger.
function recordLogs(service) {
  const lines = [];
  const logger = service.logger;
  service.logger = new Proxy(logger, {get(target, level) {
    const write = Reflect.get(target, level);
    return typeof write !== 'function' ? write : (message, fields) => {
      lines.push({level, message, fields});
      return write.call(target, message, fields);
    };
  }});
  return lines;
}

function linesOf(lines, event) {
  return lines.filter(({fields}) => fields?.event === event);
}

// The follower node: its bulk registry armed by the production offer routing
// over the node's REAL replica handler (its lifecycle state machine and its
// snapshot install owner), which hosts the follower as an established ACTIVE
// replica and reopens it, as a real service, from the replacement options.
function armFollowerNode(world) {
  world.followerNode = createNodeReplicaHandler({nodeId: NODE_ID,
    dataDir: world.workDir,
    createPartitionService: async (replacementOptions) => {
      const next = buildService(world, replacementOptions.replicaId,
        world.followerCache, replacementOptions);
      await next.initialize();
      world.follower = next;
      world.opened.push(next);
      return next;
    }});
  world.followerRegistry = world.network.registryFor(NODE_ID, FOLLOWER_BULK_ADDRESS);
  armSnapshotOfferRouting({
    registry: world.followerRegistry,
    replicaHandler: world.followerNode.replicaHandler,
    systemTableCache: world.followerCache.cache,
    onRouteOutcome: (route) => {
      world.routes.push(route.outcome);
      if (route.completion) world.installs.push(route.completion);
    }});
}

// The follower's recreation record on its node's handler.
function followerRecreation(world) {
  const [record] = world.followerNode.replicaHandler.snapshotInstallOwner
    .readDiagnostics().replicas;
  return {state: record.state, attempts: record.attempts};
}

// The leader's dispatcher seam, set by the production wiring over the leader
// node's bulk registry; the wrapper only keeps each typed result.
function wireLeaderDispatcher(world, leader) {
  world.leaderRegistry = world.network.registryFor(NODE_ID, LEADER_BULK_ADDRESS);
  attachSnapshotCatchupDispatcher({service: leader,
    systemTableCache: world.leaderCache.cache,
    messageRouter: routerFacts(NODE_ID, LEADER_BULK_ADDRESS, world.leaderRegistry)});
  const seam = leader.onSnapshotCatchupNeeded;
  leader.onSnapshotCatchupNeeded = (...notification) =>
    seam(...notification).then((result) => {
      world.dispatches.push(result);
      return result;
    });
}

// Three founders on one router; r1 leads, r3 is cut off (its address takes
// every message and answers nothing) until reconnect().
async function withGroup(options, fn) {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cpe-'));
  fs.mkdirSync(path.join(workDir, 'partition'), {recursive: true});
  const router = await openRouter();
  const leaderCache = publicationCache(options.leaderEpoch);
  const world = {
    workDir, router, sweepMs: options.sweepMs, leaderCache,
    followerCache: options.followerEpoch === undefined ? leaderCache :
      publicationCache(options.followerEpoch),
    ids: ['r1', 'r2', 'r3'].map((name) => `${PARTITION_ID}-${name}`),
    opened: [], dispatches: [], installs: [], routes: [],
    network: createInProcBulkNetwork(),
  };
  try {
    world.opened.push(
      buildService(world, world.ids[0], leaderCache),
      buildService(world, world.ids[1], leaderCache),
      buildService(world, world.ids[2], world.followerCache));
    [world.leader, world.voter, world.follower] = world.opened;
    wireLeaderDispatcher(world, world.leader);
    armFollowerNode(world);
    for (const service of [...world.opened]) await service.initialize();
    await world.followerNode.host(world.follower);
    await turnChainValue(world.leader.raft.campaign());
    await waitFor(() => world.leader.raft.readStatus().role === 'leader' &&
      world.follower.raft.readStatus().appliedIndex >= 1, 'r1 leads the group');
    world.cutOff = () =>
      router.register(world.follower.getUnifiedAddress(), () => {});
    world.reconnect = () => router.register(
      world.follower.getUnifiedAddress(), world.follower.transportHandler);
    world.cutOff();
    await fn(world);
  } finally {
    await Promise.allSettled(world.installs);
    world.leaderRegistry.closeAll();
    world.followerRegistry.closeAll();
    world.followerNode.replicaStateMachine.stopTimeoutChecker();
    await world.followerNode.replicaHandler.shutdown();
    for (const service of [...world.opened].reverse()) {
      if (!service.isShutdown) await service.shutdown();
    }
    await router.shutdown();
    fs.rmSync(workDir, {recursive: true, force: true});
  }
}

// A reserved identity committed as a learner of the leader's group.
async function commitLearner(leader, joining) {
  raftRsMembershipAdministration.reservePeerIdentity({groupId: PARTITION_ID,
    localReplicaIdentity: leader.replicaId, joiningReplicaIdentity: joining});
  const changed = await turnChainValue(leader.raft.proposeConfChange({
    type: RAFT_MEMBERSHIP_OPERATION.ADD_LEARNER, replicaIdentity: joining,
    nodeId: NODE_ID}));
  assert.equal(changed.outcome, RAFT_OPERATION_OUTCOME.CORE_OK,
    JSON.stringify(changed));
  await waitFor(() => leader.raft.readStatus().confState.learners.length === 1,
    'the membership change is applied on the leader');
}

// One committed membership change: a reserved fourth identity becomes a
// learner, so the group's membership generation index is that entry's index.
function commitMembershipChange(world) {
  return commitLearner(world.leader, `${PARTITION_ID}-r4`);
}

async function writeOnMajority(world, from, to) {
  await insertRows(world.leader, from, to);
  await waitFor(() => userRows(world.leader.db).length === to &&
    userRows(world.voter.db).length === to, `${to} rows on the majority`);
}

// Heartbeats are test-driven (the raft timers are parked): probe the current
// follower replica until the predicate holds.
async function probeUntil(world, predicate, label) {
  await waitFor(async () => {
    if (!world.follower.isShutdown) {
      await turnChainValue(
        world.leader.raft.probePeerProgress(world.follower.replicaId));
    }
    return predicate();
  }, label);
}

function assertFollowerConverged(world, label) {
  assert.deepEqual(userRows(world.follower.db), userRows(world.leader.db),
    `${label}: the follower's rows equal the leader's`);
  assert.equal(world.follower.raft.readStatus().appliedIndex,
    world.leader.raft.readStatus().appliedIndex,
    `${label}: the follower applied the leader's last index`);
}

// One generation of a replica's checkpoints root, read through the reader
// under the identity the given cache yields.
function sealedGeneration(service, generationIndex, cache) {
  return readCheckpoint({
    checkpointDir: path.join(resolveReplicaCheckpointsRoot(service.dbPath),
      String(generationIndex)),
    expectedIdentity: identityFrom(cache)});
}

// The sweep runs beside the writes, so it may compact before the last one:
// wait until it has compacted and has nothing left to do (fewer entries past
// its boundary than the threshold). Answers the compacted boundary.
async function sweepCompacts(world) {
  const head = Number(durableRecord(world.leader).appliedIndex);
  await waitFor(() => compactedIndex(world.leader) > 0 &&
    head - compactedIndex(world.leader) < CADENCE_ENTRY_THRESHOLD,
  'the leader\'s own sweep compacts its log past the threshold');
  return compactedIndex(world.leader);
}

// The paired witness: the leader's own sweep compacts past the threshold
// with the identity its own cache gives, the sealed generation is valid by
// the reader, and the cut-off follower catches up by installing it.
async function cadenceCompactsAndFollowerInstalls(options) {
  await withGroup({leaderEpoch: options.publicationEpoch,
    sweepMs: FAST_SWEEP_MS}, async (world) => {
    if (options.membershipChange) await commitMembershipChange(world);
    await writeOnMajority(world, 1, ROWS);
    const sealedAt = await sweepCompacts(world);
    const sealed = sealedGeneration(world.leader, sealedAt, world.leaderCache);
    assert.equal(sealed.outcome, RAFT_CHECKPOINT_VALIDATION_OUTCOME.VALID,
      `the compaction proof is valid by its own reader: ${JSON.stringify(sealed)}`);
    assert.deepEqual({epoch: sealed.descriptor.membershipEpoch,
      generation: sealed.descriptor.raftRs.membershipGenerationIndex},
    {epoch: options.expected.epoch, generation: options.expected.generation},
    'the image carries the publication epoch and the group\'s own generation');
    const cadence = world.leader.getSnapshotCatchupDiagnostics().cadence;
    assert.equal(cadence.lastSuccess.outcome, RAFT_SNAPSHOT_CADENCE_OUTCOME.COMPACTED);
    assert.equal(cadence.lastSuccess.compactedUpToIndex, sealedAt);
    assert.equal(cadence.refusal, null, 'no refusal is standing');

    world.reconnect();
    await probeUntil(world, () => world.opened.length === 4,
      'the follower installs the checkpoint and is recreated');
    await probeUntil(world, () => !world.follower.isShutdown &&
      userRows(world.follower.db).length === ROWS,
    'the recreated follower holds the rows');
    assert.deepEqual(world.dispatches.map(({outcome}) => outcome),
      [RAFT_SNAPSHOT_CATCHUP_DISPATCH_OUTCOME.SERVED]);
    assert.deepEqual((await Promise.all(world.installs)).map(({outcome}) => outcome),
      [RAFT_SNAPSHOT_CATCHUP_INSTALL_OUTCOME.INSTALLED_AND_RECREATED]);
    assert.deepEqual({routes: world.routes, recreation: followerRecreation(world),
      dials: world.network.dials()},
    {routes: [RAFT_SNAPSHOT_OFFER_ROUTE_OUTCOME.ROUTED],
      recreation: {state: REPLICA_SNAPSHOT_INSTALL_STATE.RUNNING, attempts: 1},
      dials: 1},
    'the offer was dialled once, routed by raft group, and the node\'s ' +
    'handler brought the replica back at its first attempt');
    assertFollowerConverged(world, options.label);
  });
}

async function withLoneLeader(rowCount, fn) {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cpe-lone-'));
  fs.mkdirSync(path.join(workDir, 'partition'), {recursive: true});
  const router = await openRouter();
  const cache = publicationCache(1);
  const world = {workDir, router, sweepMs: MANUAL_SWEEP_MS,
    ids: [`${PARTITION_ID}-r1`], leaderCache: cache, dispatches: [],
    network: createInProcBulkNetwork()};
  const service = buildService(world, world.ids[0], cache);
  wireLeaderDispatcher(world, service);
  // A node that adopts a bulk connection and never answers on it.
  world.silentRegistry = world.network.registryFor(NODE_ID, FOLLOWER_BULK_ADDRESS);
  try {
    await service.initialize();
    await waitFor(() => service.raft.readStatus().role === 'leader', 'lone leader');
    await insertRows(service, 1, rowCount);
    await waitFor(() => userRows(service.db).length === rowCount, 'rows applied');
    await fn({service, cache, world,
      checkpointsRoot: resolveReplicaCheckpointsRoot(service.dbPath)});
    world.leaderRegistry.closeAll();
    world.silentRegistry.closeAll();
  } finally {
    if (!service.isShutdown) await service.shutdown();
    await router.shutdown();
    fs.rmSync(workDir, {recursive: true, force: true});
  }
}

test('W1 format: a partition image whose publication epoch differs from its ' +
  'group\'s membership generation is valid by the reader', SCENARIO, async () => {
  await withLoneLeader(2, async ({service, cache, checkpointsRoot}) => {
    cache.setEpoch(5);
    const created = await createSqliteStateMachineCheckpoint({db: service.db,
      identity: identityFrom(cache), checkpointsRoot, raftRsGroupId: PARTITION_ID});
    assert.equal(created.outcome, RAFT_CHECKPOINT_CREATION_OUTCOME.CREATED,
      JSON.stringify(created));
    assert.deepEqual({epoch: created.descriptor.membershipEpoch,
      generation: created.descriptor.raftRs.membershipGenerationIndex},
    {epoch: 5, generation: '0'});
    assert.equal(validateCheckpointDescriptor(created.descriptor).outcome,
      RAFT_CHECKPOINT_VALIDATION_OUTCOME.VALID);
    assert.equal(readCheckpoint({checkpointDir: created.checkpointDir,
      expectedIdentity: identityFrom(cache)}).outcome,
    RAFT_CHECKPOINT_VALIDATION_OUTCOME.VALID);
  });
});

test('W2 format: a message-group image is still held to its identity rule ' +
  '(its epoch is its own configuration generation)', SCENARIO, async () => {
  await withLoneLeader(2, async ({service, cache, checkpointsRoot}) => {
    cache.setEpoch(0);
    const created = await createSqliteStateMachineCheckpoint({db: service.db,
      identity: identityFrom(cache), checkpointsRoot, raftRsGroupId: PARTITION_ID});
    const asMessageGroup = (membershipEpoch) => ({...created.descriptor,
      entity: {kind: SERVICE_TYPE.MESSAGE_GROUP, id: PARTITION_ID}, membershipEpoch});
    assert.equal(created.descriptor.raftRs.membershipGenerationIndex, '0');
    assert.equal(validateCheckpointDescriptor(asMessageGroup(0)).outcome,
      RAFT_CHECKPOINT_VALIDATION_OUTCOME.VALID,
      'epoch equal to the configuration generation is the rule holding');
    const refusedAs = (descriptor) => {
      const judged = validateCheckpointDescriptor(descriptor);
      return {outcome: judged.outcome, reasons: [...judged.reasons]};
    };
    const corrupt = {outcome: RAFT_CHECKPOINT_VALIDATION_OUTCOME.CORRUPT_DESCRIPTOR,
      reasons: [RAFT_RS_CHECKPOINT_REASON.DESCRIPTOR]};
    assert.deepEqual(refusedAs(asMessageGroup(4)), corrupt);
    // The table of raft-rs image entity kinds is closed: a kind it does not
    // name is no image at all, whatever its epoch.
    for (const kind of ['message-group', 'MESSAGE_GROUP', 'anything']) {
      for (const membershipEpoch of [0, 7]) {
        assert.deepEqual(refusedAs({...created.descriptor,
          entity: {kind, id: PARTITION_ID}, membershipEpoch}), corrupt,
        `${kind} at epoch ${membershipEpoch}`);
      }
    }
  });
});

test('W3 creation: an image its own reader rejects is a typed refusal and ' +
  'is not left on disk', SCENARIO, async () => {
  await withLoneLeader(2, async ({service, cache, checkpointsRoot}) => {
    // A message-group identity sealed at an epoch that is not the image's
    // configuration generation: the one image the reader refuses by rule.
    const identity = {...identityFrom(cache),
      entity: {kind: SERVICE_TYPE.MESSAGE_GROUP, id: PARTITION_ID}, membershipEpoch: 7};
    const refused = await createSqliteStateMachineCheckpoint({db: service.db,
      identity, checkpointsRoot, raftRsGroupId: PARTITION_ID});
    assert.equal(refused.outcome, RAFT_CHECKPOINT_CREATION_OUTCOME.IMAGE_REJECTED,
      JSON.stringify(refused));
    assert.equal(refused.validation.outcome,
      RAFT_CHECKPOINT_VALIDATION_OUTCOME.CORRUPT_DESCRIPTOR);
    assert.deepEqual([...refused.reasons], [RAFT_RS_CHECKPOINT_REASON.DESCRIPTOR]);
    assert.deepEqual(listCheckpointGenerations(checkpointsRoot), []);
    assert.deepEqual(fs.readdirSync(checkpointsRoot), [],
      'neither the generation nor its staging survives the refusal');
    // An entity kind the table does not name is refused before any payload
    // rule is chosen for it.
    const unknown = await createSqliteStateMachineCheckpoint({db: service.db,
      identity: {...identityFrom(cache), entity: {kind: 'anything', id: PARTITION_ID}},
      checkpointsRoot, raftRsGroupId: PARTITION_ID});
    assert.deepEqual({outcome: unknown.outcome, reasons: [...unknown.reasons]},
      {outcome: RAFT_CHECKPOINT_CREATION_OUTCOME.UNSUPPORTED_ADAPTER,
        reasons: [RAFT_RS_CHECKPOINT_REASON.ENTITY_KIND]});
    assert.deepEqual(fs.readdirSync(checkpointsRoot), []);
  });
});

test('W4 cadence: genesis group, publication epoch 1', SCENARIO, async () => {
  await cadenceCompactsAndFollowerInstalls({label: 'genesis, epoch 1',
    publicationEpoch: 1, membershipChange: false,
    expected: {epoch: 1, generation: '0'}});
});

test('W5 cadence: committed membership change, publication epoch 0', SCENARIO, async () => {
  await cadenceCompactsAndFollowerInstalls({label: 'membership change, epoch 0',
    publicationEpoch: null, membershipChange: true,
    expected: {epoch: 0, generation: '2'}});
});

test('W6 cadence: committed membership change, publication epoch 1', SCENARIO, async () => {
  await cadenceCompactsAndFollowerInstalls({label: 'membership change, epoch 1',
    publicationEpoch: 1, membershipChange: true,
    expected: {epoch: 1, generation: '2'}});
});

test('W7 epoch moved: a follower behind a compacted boundary installs a ' +
  'generation sealed under the current identity', SCENARIO, async () => {
  // Epoch 2 equals the generation of the one membership change, so the first
  // compaction also happens on a tree that still equates the two.
  await withGroup({leaderEpoch: 2, sweepMs: MANUAL_SWEEP_MS}, async (world) => {
    await commitMembershipChange(world);
    await writeOnMajority(world, 1, ROWS);
    const boundary = Number(durableRecord(world.leader).appliedIndex);
    const compacted = await world.leader.runSnapshotCadenceTick(Date.now());
    assert.equal(compacted.outcome, RAFT_SNAPSHOT_CADENCE_OUTCOME.COMPACTED,
      JSON.stringify(compacted));
    assert.equal(compactedIndex(world.leader), boundary);
    world.leaderCache.setEpoch(3);
    // Two more entries: below the threshold, so the cadence seals nothing.
    await writeOnMajority(world, ROWS + 1, ROWS + 2);
    const head = Number(durableRecord(world.leader).appliedIndex);
    const below = await world.leader.runSnapshotCadenceTick(Date.now());
    assert.equal(below.outcome, RAFT_SNAPSHOT_CADENCE_OUTCOME.BELOW_THRESHOLD);

    world.reconnect();
    await probeUntil(world, () => world.opened.length === 4,
      'the follower installs a checkpoint and is recreated');
    await probeUntil(world, () => !world.follower.isShutdown &&
      userRows(world.follower.db).length === ROWS + 2,
    'the recreated follower holds the rows');
    const [dispatch] = world.dispatches;
    assert.equal(world.dispatches.length, 1);
    assert.equal(dispatch.outcome, RAFT_SNAPSHOT_CATCHUP_DISPATCH_OUTCOME.SERVED,
      JSON.stringify(dispatch));
    assert.equal(dispatch.generationIndex, head,
      'the epoch-2 generation at the boundary is not servable under epoch 3: ' +
      'the leader seals one at its head under its current identity');
    const served = sealedGeneration(world.leader, head, world.leaderCache);
    assert.equal(served.outcome, RAFT_CHECKPOINT_VALIDATION_OUTCOME.VALID);
    assert.equal(served.descriptor.membershipEpoch, 3);
    assertFollowerConverged(world, 'epoch moved');
  });
});

test('W8 re-ask: a follower whose snapshot was refused is asked again on a ' +
  'named event or the declared bound, and its stall is typed and visible', SCENARIO, async () => {
  // The leader's cache still reads epoch 2; the follower's node has already
  // seen the publication at epoch 3 and refuses the epoch-2 generation.
  await withGroup({leaderEpoch: 2, followerEpoch: 3, sweepMs: MANUAL_SWEEP_MS},
    async (world) => {
      const {leader} = world;
      const lines = recordLogs(leader);
      const followerLines = recordLogs(world.follower);
      await commitMembershipChange(world);
      await writeOnMajority(world, 1, ROWS);
      const compacted = await leader.runSnapshotCadenceTick(Date.now());
      assert.equal(compacted.outcome, RAFT_SNAPSHOT_CADENCE_OUTCOME.COMPACTED,
        JSON.stringify(compacted));
      const follower = () =>
        leader.getSnapshotCatchupDiagnostics().catchup.followers[0];
      const settled = (attempts) => () => world.dispatches.length === attempts &&
        follower()?.inFlight === false;

      world.reconnect();
      await probeUntil(world, () => world.dispatches.length === 1,
        'the leader dispatches for the follower');
      const refusedOutcome = {
        lastOutcome: RAFT_SNAPSHOT_CATCHUP_DISPATCH_OUTCOME.TRANSFER_ABORTED,
        lastReason: RAFT_SNAPSHOT_TRANSFER_ABORT_REASON.STALE_EPOCH};
      assert.deepEqual({outcome: world.dispatches[0].outcome,
        reason: world.dispatches[0].transfer.reason},
      {outcome: refusedOutcome.lastOutcome, reason: refusedOutcome.lastReason},
      'the receiver refuses the epoch-2 generation');
      // The follower replica that refused: its own typed line and diagnostics.
      await Promise.all(world.installs);
      const refusedInstall = {
        outcome: RAFT_SNAPSHOT_CATCHUP_INSTALL_OUTCOME.RECEIVE_FAILED,
        reason: RAFT_SNAPSHOT_TRANSFER_ABORT_REASON.STALE_EPOCH};
      assert.deepEqual(linesOf(followerLines,
        PARTITION_SNAPSHOT_PROGRESS_EVENT.INSTALL_OUTCOME).map(({level, fields}) =>
        ({level, outcome: fields.outcome, reason: fields.reason})),
      [{level: 'warn', ...refusedInstall}],
      'an install that did not complete is one typed line on the follower');
      const installDiagnostics = world.follower.getSnapshotCatchupDiagnostics().install;
      assert.ok(installDiagnostics, 'and is visible in the follower\'s diagnostics');
      assert.deepEqual({outcome: installDiagnostics.outcome,
        reason: installDiagnostics.reason}, refusedInstall);
      const logged = linesOf(lines,
        PARTITION_SNAPSHOT_PROGRESS_EVENT.CATCHUP_DISPATCH_OUTCOME);
      assert.equal(logged.length, 1, 'the refusal is logged once');
      assert.deepEqual({level: logged[0].level, outcome: logged[0].fields.outcome,
        reason: logged[0].fields.reason, partitionId: logged[0].fields.partitionId},
      {level: 'warn', outcome: refusedOutcome.lastOutcome,
        reason: refusedOutcome.lastReason, partitionId: PARTITION_ID});
      await probeUntil(world, settled(1), 'the first dispatch settles');
      assert.deepEqual({attempts: follower().attempts,
        trigger: follower().lastTrigger, lastOutcome: follower().lastOutcome,
        lastReason: follower().lastReason},
      {attempts: 1, trigger: PARTITION_SNAPSHOT_CATCHUP_TRIGGER.RUNTIME_NOTIFICATION,
        ...refusedOutcome}, 'the stall is visible in the leader\'s diagnostics');

      // Nothing changed and the bound has not elapsed: no dispatch, no rebuild.
      const firstSettledAt = follower().settledAtMs;
      await leader.runSnapshotCatchupReaskTick(firstSettledAt + 1000);
      await leader.runSnapshotCatchupReaskTick(
        firstSettledAt + PARTITION_SNAPSHOT_CATCHUP_REASK_BOUND_MS - 1);
      assert.equal(follower().attempts, 1, 'an unchanged refusal is not re-driven');

      // The declared bound: asked again, refused again for the same reason.
      await leader.runSnapshotCatchupReaskTick(
        firstSettledAt + PARTITION_SNAPSHOT_CATCHUP_REASK_BOUND_MS);
      await probeUntil(world, settled(2), 'the bounded re-ask settles');
      assert.deepEqual({attempts: follower().attempts,
        trigger: follower().lastTrigger, lastOutcome: follower().lastOutcome,
        lastReason: follower().lastReason},
      {attempts: 2, trigger: PARTITION_SNAPSHOT_CATCHUP_TRIGGER.BOUND_ELAPSED,
        ...refusedOutcome});

      // The named event: the leader's identity moves to the published epoch.
      world.leaderCache.setEpoch(3);
      await leader.runSnapshotCatchupReaskTick(follower().settledAtMs + 1000);
      await probeUntil(world, () => world.opened.length === 4,
        'the follower installs the checkpoint and is recreated');
      await probeUntil(world, () => !world.follower.isShutdown &&
        userRows(world.follower.db).length === ROWS,
      'the recreated follower holds the rows');
      assert.equal(world.dispatches.length, 3);
      assert.equal(world.dispatches[2].outcome,
        RAFT_SNAPSHOT_CATCHUP_DISPATCH_OUTCOME.SERVED,
        JSON.stringify(world.dispatches[2]));
      assert.equal(sealedGeneration(leader, world.dispatches[2].generationIndex,
        world.leaderCache).descriptor.membershipEpoch, 3);
      assertFollowerConverged(world, 're-asked follower');

      // Past its boundary, the follower's record closes on the next sweep.
      await probeUntil(world, async () => {
        await leader.runSnapshotCatchupReaskTick(Date.now());
        return leader.getSnapshotCatchupDiagnostics().catchup.followers.length === 0;
      }, 'the follower record closes once it is past the boundary');
      assert.equal(linesOf(lines,
        PARTITION_SNAPSHOT_PROGRESS_EVENT.CATCHUP_SETTLED).length, 1);
    });
});

test('W9 cadence refusal: typed, logged, held instead of rebuilt every ' +
  'sweep, retried on the named event or the declared bound', SCENARIO, async () => {
  await withLoneLeader(ROWS, async ({service}) => {
    const lines = recordLogs(service);
    let imagesBuilt = 0;
    const backup = service.db.backup.bind(service.db);
    service.db.backup = (...args) => {
      imagesBuilt += 1;
      return backup(...args);
    };
    insertParticipantTransactionRow(service.db, {transactionId: 'tx-held',
      participantId: `${PARTITION_ID}:p1`, commitMode: 'two_phase',
      transactionEpoch: 1, state: 'PREPARED'});
    const startMs = Date.now();
    const diagnostics = () => service.getSnapshotCatchupDiagnostics().cadence;
    const refusal = {outcome: RAFT_SNAPSHOT_CADENCE_OUTCOME.CREATION_REFUSED,
      reason: RAFT_CHECKPOINT_CREATION_OUTCOME.PREPARED_TRANSACTIONS_PENDING};

    const refused = await service.runSnapshotCadenceTick(startMs);
    assert.equal(refused.outcome, refusal.outcome, JSON.stringify(refused));
    assert.equal(imagesBuilt, 1);
    const logged = linesOf(lines, PARTITION_SNAPSHOT_PROGRESS_EVENT.CADENCE_OUTCOME);
    assert.equal(logged.length, 1, 'the refusal is logged');
    assert.deepEqual({level: logged[0].level, outcome: logged[0].fields.outcome,
      reason: logged[0].fields.reason, partitionId: logged[0].fields.partitionId},
    {level: 'warn', ...refusal, partitionId: PARTITION_ID});
    assert.ok(diagnostics().refusal, 'the refusal is a visible standing state');
    assert.deepEqual({outcome: diagnostics().refusal.outcome,
      reason: diagnostics().refusal.reason, attempts: diagnostics().refusal.attempts},
    {...refusal, attempts: 1});

    // The next sweep, nothing changed: held, no image is built. Every later
    // time is counted from the refusal's own stamp.
    const firstAt = diagnostics().refusal.lastAtMs;
    const held = await service.runSnapshotCadenceTick(
      firstAt + PARTITION_SNAPSHOT_CADENCE_RETRY.BASE_MS);
    assert.equal(held.outcome, RAFT_SNAPSHOT_CADENCE_OUTCOME.HELD_AFTER_REFUSAL,
      JSON.stringify(held));
    assert.equal(imagesBuilt, 1, 'an unchanged refusal does not rebuild the image');

    // The declared bound: one attempt, refused for the same reason.
    const bounded = await service.runSnapshotCadenceTick(
      firstAt + PARTITION_SNAPSHOT_CADENCE_RETRY.BOUND_MS);
    assert.equal(bounded.outcome, refusal.outcome);
    assert.equal(bounded.retryTrigger,
      PARTITION_SNAPSHOT_CADENCE_RETRY_TRIGGER.BOUND_ELAPSED);
    assert.equal(imagesBuilt, 2);
    assert.ok(diagnostics().refusal, 'the refusal still stands');
    assert.equal(diagnostics().refusal.attempts, 2);
    const secondAt = diagnostics().refusal.lastAtMs;

    // The named event: the hold settles and the log advances.
    service.db.prepare('UPDATE _participant_transactions SET state = ? ' +
      'WHERE transaction_id = ?').run('COMMITTED', 'tx-held');
    await insertRows(service, ROWS + 1, ROWS + 1);
    await waitFor(() => userRows(service.db).length === ROWS + 1,
      'the next row is applied');
    const tooSoon = await service.runSnapshotCadenceTick(
      secondAt + 2 * PARTITION_SNAPSHOT_CADENCE_RETRY.BASE_MS - 1);
    assert.equal(tooSoon.outcome, RAFT_SNAPSHOT_CADENCE_OUTCOME.HELD_AFTER_REFUSAL,
      'the second refusal doubled the spacing');
    const compacted = await service.runSnapshotCadenceTick(
      secondAt + 2 * PARTITION_SNAPSHOT_CADENCE_RETRY.BASE_MS);
    assert.equal(compacted.outcome, RAFT_SNAPSHOT_CADENCE_OUTCOME.COMPACTED,
      JSON.stringify(compacted));
    assert.equal(compacted.retryTrigger,
      PARTITION_SNAPSHOT_CADENCE_RETRY_TRIGGER.APPLIED_INDEX_ADVANCED);
    assert.equal(imagesBuilt, 3);
    assert.equal(diagnostics().refusal, null);
    assert.ok(diagnostics().lastSuccess, 'the compaction is recorded');
    assert.equal(diagnostics().lastSuccess.compactedUpToIndex,
      compactedIndex(service));
    assert.equal(linesOf(lines,
      PARTITION_SNAPSHOT_PROGRESS_EVENT.CADENCE_RECOVERED).length, 1);
  });
});

// A prepared participant transaction: the creation owner refuses the image.
function holdPreparedTransaction(service) {
  insertParticipantTransactionRow(service.db, {transactionId: 'tx-held',
    participantId: `${PARTITION_ID}:p1`, commitMode: 'two_phase',
    transactionEpoch: 1, state: 'PREPARED'});
}

// Counts the images a replica builds and, when asked, makes each build take
// `buildMs` on the replica's own clock.
function countImageBuilds(service, buildMs = 0) {
  const built = {count: 0, clockSkewMs: 0};
  const backup = service.db.backup.bind(service.db);
  service.db.backup = (...args) => {
    built.count += 1;
    built.clockSkewMs += buildMs;
    return backup(...args);
  };
  const clock = service.timeSource;
  service.timeSource = new Proxy(clock, {get(target, member) {
    if (member === 'now') return () => target.now() + built.clockSkewMs;
    const value = Reflect.get(target, member);
    return typeof value === 'function' ? value.bind(target) : value;
  }});
  return built;
}

test('W10 second episode: a follower served once is served again over a ' +
  'fresh connection when it falls behind a later boundary', SCENARIO, async () => {
  await withGroup({leaderEpoch: 1, sweepMs: FAST_SWEEP_MS}, async (world) => {
    const catchesUp = async (rows, replicas) => {
      await sweepCompacts(world);
      world.reconnect();
      await probeUntil(world, () => world.opened.length === replicas,
        'the follower installs the checkpoint and is recreated');
      await probeUntil(world, () => !world.follower.isShutdown &&
        userRows(world.follower.db).length === rows &&
        world.leader.getSnapshotCatchupDiagnostics().catchup.followers.length === 0,
      'the recreated follower holds the rows and its record is closed');
    };
    await writeOnMajority(world, 1, ROWS);
    await catchesUp(ROWS, 4);
    world.cutOff();
    await writeOnMajority(world, ROWS + 1, 2 * ROWS);
    await catchesUp(2 * ROWS, 5);
    assert.deepEqual(world.dispatches.map(({outcome}) => outcome),
      Array(2).fill(RAFT_SNAPSHOT_CATCHUP_DISPATCH_OUTCOME.SERVED));
    assert.deepEqual({routes: world.routes, dials: world.network.dials()},
      {routes: Array(2).fill(RAFT_SNAPSHOT_OFFER_ROUTE_OUTCOME.ROUTED), dials: 2});
    assertFollowerConverged(world, 'second episode');
  });
});

test('W11 cadence refusal: stamped when the attempt completes, so a slow ' +
  'image build is not retried back to back', SCENARIO, async () => {
  await withLoneLeader(ROWS, async ({service, cache}) => {
    const buildMs = 5 * PARTITION_SNAPSHOT_CADENCE_RETRY.BASE_MS;
    const built = countImageBuilds(service, buildMs);
    holdPreparedTransaction(service);
    const startMs = service.timeSource.now();
    const refused = await service.runSnapshotCadenceTick(startMs);
    assert.equal(refused.outcome, RAFT_SNAPSHOT_CADENCE_OUTCOME.CREATION_REFUSED);
    const {refusal} = service.getSnapshotCatchupDiagnostics().cadence;
    assert.ok(refusal, 'the refusal stands');
    assert.ok(refusal.lastAtMs >= startMs + buildMs,
      `stamped at completion: ${refusal.lastAtMs - startMs} ms after the tick began`);
    // The identity changes: a wake, but only one spacing after COMPLETION.
    cache.setEpoch(2);
    const tooSoon = await service.runSnapshotCadenceTick(
      refusal.lastAtMs + PARTITION_SNAPSHOT_CADENCE_RETRY.BASE_MS - 1);
    assert.equal(tooSoon.outcome, RAFT_SNAPSHOT_CADENCE_OUTCOME.HELD_AFTER_REFUSAL);
    assert.equal(built.count, 1);
    const retried = await service.runSnapshotCadenceTick(
      refusal.lastAtMs + PARTITION_SNAPSHOT_CADENCE_RETRY.BASE_MS);
    assert.equal(retried.retryTrigger,
      PARTITION_SNAPSHOT_CADENCE_RETRY_TRIGGER.IDENTITY_CHANGED);
    assert.equal(built.count, 2);
  });
});

test('W12 cadence refusal: any compaction ends it, the one through an ' +
  'already sealed generation included', SCENARIO, async () => {
  await withLoneLeader(ROWS, async ({service}) => {
    let faults = 1;
    const cadence = createPartitionSnapshotCadence({service,
      onAfterCreateCheckpoint: () => {
        if (faults > 0) {
          faults -= 1;
          throw new Error('fault after the generation was sealed');
        }
      }});
    const startMs = Date.now();
    const failed = await cadence.tick(startMs);
    assert.equal(failed.outcome, RAFT_SNAPSHOT_CADENCE_OUTCOME.TICK_FAILED,
      JSON.stringify(failed));
    assert.ok(cadence.readDiagnostics().refusal, 'the failed attempt leaves a refusal');
    // The sealed generation covers the log: the next tick compacts through
    // it without building an image.
    const compacted = await cadence.tick(startMs + 1000);
    assert.equal(compacted.outcome, RAFT_SNAPSHOT_CADENCE_OUTCOME.COMPACTED,
      JSON.stringify(compacted));
    assert.equal(cadence.readDiagnostics().refusal, null,
      'no refusal stands after a compaction');
  });
});

test('W13 one creation owner: the dispatch path does not rebuild an image ' +
  'the cadence is holding', SCENARIO, async () => {
  await withLoneLeader(ROWS, async ({service}) => {
    const built = countImageBuilds(service);
    holdPreparedTransaction(service);
    const refused = await service.runSnapshotCadenceTick(service.timeSource.now());
    assert.equal(refused.outcome, RAFT_SNAPSHOT_CADENCE_OUTCOME.CREATION_REFUSED);
    assert.equal(built.count, 1);
    // A follower needs a snapshot and no generation exists: the dispatcher
    // would seal one.
    const boundary = Number(durableRecord(service).appliedIndex);
    const dispatched = await service.onSnapshotCatchupNeeded(
      buildSnapshotCatchupDecision({
        outcome: RAFT_SNAPSHOT_CATCHUP_DECISION_OUTCOME.INSTALL_SNAPSHOT,
        followerAddress: AddressManager.getInstance().format(
          NODE_ID, 'partition', `${PARTITION_ID}-r2`),
        startIndex: 1, failedIndex: boundary, leaderBoundary: boundary}));
    assert.equal(dispatched.outcome,
      RAFT_SNAPSHOT_CATCHUP_DISPATCH_OUTCOME.CHECKPOINT_CREATION_FAILED,
      JSON.stringify(dispatched));
    assert.equal(dispatched.creation.outcome,
      RAFT_CHECKPOINT_CREATION_OUTCOME.SEALER_HELD);
    assert.equal(built.count, 1, 'the held image is not rebuilt for the follower');
    assert.equal(service.getSnapshotCatchupDiagnostics().cadence.refusal.attempts, 1);
  });
});

test('W14 shutdown: a leader service shut down while its dispatch waits on ' +
  'a silent follower aborts the dispatch and frees the node\'s slot',
SCENARIO, async () => {
  await withLoneLeader(ROWS, async ({service, world}) => {
    // The follower is a committed learner, so the leader's image names it.
    await commitLearner(service, `${PARTITION_ID}-r2`);
    const compacted = await service.runSnapshotCadenceTick(service.timeSource.now());
    assert.equal(compacted.outcome, RAFT_SNAPSHOT_CADENCE_OUTCOME.COMPACTED,
      JSON.stringify(compacted));
    const boundary = compactedIndex(service);
    // The consensus runtime's notification, through the service's own driver
    // and the production dispatcher, towards a node that never answers.
    service.requestSnapshotCatchupDispatch(buildSnapshotCatchupDecision({
      outcome: RAFT_SNAPSHOT_CATCHUP_DECISION_OUTCOME.INSTALL_SNAPSHOT,
      followerAddress: AddressManager.getInstance().format(
        NODE_ID, 'partition', `${PARTITION_ID}-r2`),
      startIndex: 1, failedIndex: boundary, leaderBoundary: boundary}));
    await waitFor(() => world.silentRegistry.getConnection(NODE_ID) !== null,
      'the offer reaches the silent node');
    assert.deepEqual(listInFlightGenerationIndexes(), [boundary]);
    assert.equal(service.getSnapshotCatchupDiagnostics().catchup.followers.length, 1);

    await service.shutdown();
    await waitFor(() => listInFlightGenerationIndexes().length === 0,
      'the shut-down service\'s dispatch releases the node\'s slot');
    assert.deepEqual(service.getSnapshotCatchupDiagnostics().catchup.followers, []);
    await waitFor(() => world.dispatches.length === 1, 'the aborted dispatch settles');
  });
});

test('W15 generation names the follower: a generation sealed before the ' +
  'leader applied a follower\'s admission is not served to it; one sealed ' +
  'after is, and a follower the leader never admitted is a typed refusal',
SCENARIO, async () => {
  await withLoneLeader(ROWS, async ({service, world, checkpointsRoot}) => {
    const compacted = await service.runSnapshotCadenceTick(service.timeSource.now());
    assert.equal(compacted.outcome, RAFT_SNAPSHOT_CADENCE_OUTCOME.COMPACTED,
      JSON.stringify(compacted));
    const boundary = compactedIndex(service);
    const decisionFor = (replicaIdentity) => buildSnapshotCatchupDecision({
      outcome: RAFT_SNAPSHOT_CATCHUP_DECISION_OUTCOME.INSTALL_SNAPSHOT,
      followerAddress: AddressManager.getInstance().format(
        NODE_ID, 'partition', replicaIdentity),
      startIndex: 1, failedIndex: boundary, leaderBoundary: boundary});

    // Never admitted: the boundary generation omits it, and so does the one
    // the leader seals now. Nothing is dialled.
    const stranger = await service.onSnapshotCatchupNeeded(
      decisionFor(`${PARTITION_ID}-r9`));
    assert.equal(stranger.outcome,
      RAFT_SNAPSHOT_CATCHUP_DISPATCH_OUTCOME.GENERATION_OMITS_FOLLOWER,
      JSON.stringify(stranger));
    assert.equal(world.network.dials(), 0);

    // Admitted after the boundary generation was sealed: that generation is
    // valid and at the boundary, yet not servable to this follower; the
    // leader seals one that names it and offers that one.
    await commitLearner(service, `${PARTITION_ID}-r2`);
    const head = Number(durableRecord(service).appliedIndex);
    assert.ok(listCheckpointGenerations(checkpointsRoot).includes(boundary));
    service.requestSnapshotCatchupDispatch(decisionFor(`${PARTITION_ID}-r2`));
    await waitFor(() => world.silentRegistry.getConnection(NODE_ID) !== null,
      'the offer reaches the follower\'s node');
    assert.deepEqual(listInFlightGenerationIndexes(), [head],
      'the generation offered is the one sealed after the admission');
    assert.ok(head > boundary);
    await service.shutdown();
  });
});
