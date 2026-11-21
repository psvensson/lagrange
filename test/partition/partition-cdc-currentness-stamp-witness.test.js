// Red witnesses for the CDC currentness check (repair cdc-currentness-stamp,
// stage 1; record: lagrange-takeover-20261121/reports/cdc-currentness-record.md).
//
// Real owners: the partition leader's obligation lane and its delivery
// invocation (src/cdc/cdc-delivery-invocation.js beginCdcDeliveryInvocation),
// the subscriber scope (scopeCdcDeliveryInvocation via cdcSubscriberInvocation)
// and the wave's child scope (openCdcDeliveryChildScope), the production
// subscriber factory, the topology owner (CDCGroupPropagationService) over a
// real SystemTableCache written through its own applySystemTableChange, and a
// real MessageRouter whose delivery lifetime
// (src/transport/message-router-delivery-lifetime.js) charges every budget
// read to the CDC invocation.
// Controlled: the source message group (the harness's one durable source
// double), the operational selection collaborator the subscriber factory takes
// (it answers the source; in production it is the bootstrap selection owner,
// whose local-leader path reads raft status once per evaluation, pinned by the
// selection anchor at the end of this file), and the remote recipient (an
// identified in-process peer answering through the current ACK +
// SERVICE_RESPONSE wire). The latency tree is the real owner over the same
// cache (only the routing-order case states an order by hand).
// Evidence ceiling: one process, component composition; no native recipient
// commit and no raft-rs status read inside the full chain.
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {CDC_OPERATION, COLUMN, NODE_STATE, SERVICE_STATUS, SERVICE_TYPE, TABLES} from
  '../../src/constants/index.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {RAFT_EVENT} from '../../src/raft/raft-operation-port-constants.js';
import {createRaftOperationPort} from '../../src/raft/raft-operation-port.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {getSystemCachePrimaryKeyField} from '../../src/cache/system-cache-key-descriptor.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {NodeService} from '../../src/node/node-service.js';
import {MessageRouter} from '../../src/transport/message-router.js';
import {MessageGroupService} from '../../src/message-group/message-group-service.js';
import {resolveOperationalMessageGroupSelection} from
  '../../src/bootstrap/shared/message-group-selection.js';
import {buildPartitionCdcPropagationSubscriber} from
  '../../src/bootstrap/shared/partition-cdc-propagation-subscriber.js';
import {CDC_COMPLETION, CDC_COVERAGE_STATE, buildCommittedCdcOutcome, unknownCdcAcceptance} from
  '../../src/cdc/cdc-delivery-outcome.js';
import {copyCdcEvent} from '../../src/cdc/cdc-event-envelope.js';
import {HLCTimestamp} from '../../src/hlc/hlc-timestamp.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {LATENCY_GROUP_STATE, LATENCY_PROPAGATION_MODE, LATENCY_TOPOLOGY_CONFIG_KEY} from
  '../../src/topology/latency-topology-constants.js';
import {CDC_GROUP_PROPAGATION_STATE, CDC_MESSAGE_GROUP_REPLICA_SUFFIX} from
  '../../src/topology/cdc-group-propagation-constants.js';
import {CDCGroupPropagationService} from '../../src/topology/cdc-group-propagation-service.js';
import {LatencyTreeService} from '../../src/topology/latency-tree-service.js';
import {createCdcObligationLane} from '../../src/partition/partition-cdc-obligation-lane.js';
import {PARTITION_CDC_OBLIGATION_DRIVE_STATE as DRIVE, PARTITION_CDC_OBLIGATION_REASON} from
  '../../src/partition/partition-cdc-obligation-constants.js';
import {countCdcObligations} from '../../src/partition/partition-cdc-obligation-ledger.js';
import {FAST_FOREGROUND_RETRY, createDurableSourceMessageGroupService,
  createMessageGroupServiceRow, deliveredEventsOf, setupConfig, teardownConfig} from
  '../topology/cdc-group-propagation-service-harness.js';
import {CDC_TABLE, applyCommitted, committedQueryOf, settleTicks, shutdownAll, startLeader} from
  '../test-helpers/participant-transaction-fixture.js';
import {CDC_ROUTER_TEST, controlledCdcPeer} from '../test-helpers/message-router-cdc-fixture.js';
import {TEST_BOOT_INCARNATION} from '../test-helpers/boot-incarnation-fixture.js';
import {ControllableConsensusPort} from '../test-helpers/controllable-consensus-port.js';
import {withTestDbPath} from '../test-helpers/message-group-db-path.js';

beforeEach(() => setupConfig(LATENCY_PROPAGATION_MODE.SAFE));
afterEach(teardownConfig);

// setupConfig names this node 'node-a'; the topology owner and router use it.
const SOURCE_NODE = 'node-a';
const PEER = CDC_ROUTER_TEST.PEER;
const SOURCE_GROUP = 'stamp-group-a';
const TARGET_GROUP = 'stamp-group-b';
const START_MS = 1000;
const SERVICE_BIRTH_MS = 100;
const RESPONSE = Object.freeze({NATIVE: 'native', UNKNOWN: 'unknown'});
// One foreground attempt per wave: a witness counts one delivery and observes
// one wave; the wave's own retry delays run on the platform timer and are
// witnessed in cdc-group-propagation-foreground-boundary and -wave-lifecycle.
const ONE_ATTEMPT_PER_DRIVE = 1;
const KIND = Object.freeze({
  NOT_CURRENT: 'not-current',
  REOBSERVED: 'reobserved',
  UNCHANGED: 'unchanged',
});

// The node's one clock, whose now() can move past a due timer before that
// timer is dispatched (the contract of message-router-cdc-fixture's private
// clock). A per-read deadline check must refuse on the read itself, not only
// once the deadline timer later retires the invocation.
function heldDispatchClock(startMs) {
  const timers = new VirtualTimeSource({startMs});
  const state = {nowMs: startMs};
  return {
    now: () => state.nowMs,
    setTimeout: (fn, ms, ...args) =>
      timers.setTimeout(fn, state.nowMs - timers.now() + Number(ms), ...args),
    clearTimeout: (handle) => timers.clearTimeout(handle),
    setInterval: (fn, ms, ...args) => timers.setInterval(fn, ms, ...args),
    clearInterval: (handle) => timers.clearInterval(handle),
    pendingTimerCount: () => timers.pendingTimerCount(),
    elapse: (ms) => {
      state.nowMs += ms;
    },
  };
}

function targetAddress(groupId, nodeId = PEER) {
  return `${nodeId}/message-group/${groupId}-r1`;
}

function targetServiceRow(groupId, nodeId = PEER, fields = {}) {
  return {...createMessageGroupServiceRow(`${groupId}-r1`, nodeId, targetAddress(groupId, nodeId),
    RAFT_ROLE.LEADER, groupId),
  [COLUMN.REPLICA_ID]: `${groupId}-r1`, [COLUMN.CREATED_AT]: SERVICE_BIRTH_MS,
  create_attempt_token: `${groupId}-birth-1`, ...fields};
}

// A known message group no route reaches (no address): it joins the required
// set unroutable, so it is never handed to the router.
function unroutableServiceRow(serviceId, groupId, nodeId, fields = {}) {
  return {...createMessageGroupServiceRow(serviceId, nodeId, '', RAFT_ROLE.LEADER, groupId),
    ...fields};
}

function latencyGroupRow(groupId, coordinatorNodeId, fields = {}) {
  return {[COLUMN.GROUP_ID]: groupId, [COLUMN.COORDINATOR_NODE_ID]: coordinatorNodeId,
    [COLUMN.STATE]: LATENCY_GROUP_STATE.ACTIVE, ...fields};
}

// Every input change goes through the cache owner's own write path, so its
// per-table mutation version moves exactly as in production; each row carries
// a newer updated_at, so the owner never refuses it as stale. The setup guard
// fails loudly (and separately from any witness) if the owner did not apply it.
function writeRow(f, tableName, row, operation = CDC_OPERATION.UPSERT) {
  f.updatedAt += 1;
  const data = {...row, [COLUMN.UPDATED_AT]: f.updatedAt};
  f.cache.applySystemTableChange(tableName, operation, data);
  const key = data[getSystemCachePrimaryKeyField(tableName)];
  const applied = f.cache.get(tableName, key);
  for (const [field, value] of Object.entries(row)) {
    assert.deepEqual(applied?.[field], value,
      `setup: the cache owner applied ${tableName}.${field} of ${key}`);
  }
}

function progressOf(f) {
  return f.leader.cdcDelivery.obligationLane.currentObligation?.branches[0]?.topology ?? null;
}

function leafOf(f, groupId) {
  return progressOf(f)?.targets.find((leaf) => leaf.groupId === groupId) ?? null;
}

function hasLeaf(groupId) {
  return (f) => leafOf(f, groupId) !== null;
}

function routeField(groupId, field) {
  return (f) => leafOf(f, groupId)?.route[field] ?? null;
}

function targetAnswer(f, frame) {
  const events = deliveredEventsOf(frame.payload);
  return f.targetMode === RESPONSE.NATIVE ?
    buildCommittedCdcOutcome(events, frame.payload.targetGroupId, {index: 17, term: 2}) :
    unknownCdcAcceptance();
}

// The identified peer answers each target delivery through the current wire
// protocol: the raw write completes, then the plain ACK and SERVICE_RESPONSE.
// `f.duringTarget` runs while the delivery is in flight and every scope of the
// invocation is open; a throw there is kept for the test, never left unhandled.
function answerTargetDeliveries(f) {
  (async () => {
    for (let index = 0; !f.closed; index += 1) {
      const write = await f.peer.nextWrite(index);
      if (f.closed) return;
      await write.handedOff;
      f.targetCalls.push({targetGroupId: write.frame.payload.targetGroupId,
        address: write.frame.targetAddress});
      const during = f.duringTarget;
      f.duringTarget = null;
      if (during) {
        try {
          await during();
        } catch (error) {
          f.duringError ??= error;
        }
      }
      write.release();
      f.peer.ack(write.frame.messageId, targetAnswer(f, write.frame));
    }
  })().catch((error) => {
    f.duringError ??= error;
  });
}

function buildSubscriber(f) {
  return buildPartitionCdcPropagationSubscriber({tableName: CDC_TABLE,
    partitionId: f.leader.partitionId, replicaId: f.leader.replicaId,
    preferredService: f.source,
    // The currentness accessor's selection (subscriber getCDCPropagationService):
    // the subscriber's readiness never reaches it while the preferred source is
    // ready, so every call here is one currentness evaluation.
    resolveOperationalMessageGroupSelection: () => {
      f.counts.checkSelections += 1;
      return {ready: true, service: f.selected};
    },
    resolveOperationalMessageGroupSelectionAsync: async () => {
      f.counts.deliverySelections += 1;
      return {ready: true, service: f.source};
    },
    buildMessageGroupOwnerNotReadyError: () => Object.assign(new Error('controlled readiness'),
      {retryAfterMs: 20}),
    // The production bridge (seed-runtime-bridge-owner.js propagatePartitionCDCEvent).
    propagatePartitionCDCEvent: (messageGroupService, events, deliveryContext) => {
      f.captured = deliveryContext;
      return f.topology.propagateCDCEvent({events: events.map((event) => copyCdcEvent(event)),
        sourceMessageGroupService: messageGroupService, deliveryContext});
    },
  });
}

function seedTopologyRows(f, targets) {
  writeRow(f, TABLES.NODES, {[COLUMN.NODE_ID]: SOURCE_NODE,
    [COLUMN.LATENCY_GROUP_ID]: SOURCE_GROUP}, CDC_OPERATION.INSERT);
  writeRow(f, TABLES.NODES, {[COLUMN.NODE_ID]: PEER, [COLUMN.BOOT_INCARNATION]: 1},
    CDC_OPERATION.INSERT);
  for (const groupId of targets) {
    writeRow(f, TABLES.SERVICES, targetServiceRow(groupId), CDC_OPERATION.INSERT);
  }
}

async function startRouterAndPeer(f, t) {
  f.router = new MessageRouter({nodeId: SOURCE_NODE, bootIncarnation: TEST_BOOT_INCARNATION,
    timeSource: f.clock, nowFn: f.clock.now});
  await f.router.initialize({startServer: false});
  const routerFixture = {router: f.router, clock: f.clock, closes: []};
  t.after(async () => {
    f.closed = true;
    for (const close of routerFixture.closes.reverse()) await close();
    await f.router.shutdown();
  });
  f.peer = await controlledCdcPeer(routerFixture);
  answerTargetDeliveries(f);
}

// One plan observation (captureDurablePropagationPlan) reads the routing order
// exactly once, in safe and grouped mode alike, so a plan rebuild is counted at
// the tree collaborator. The real tree owner by default (its routing views are
// recomputed from this cache, as in production); a stated routing order only
// where a case changes that order by hand.
function startTree(f, t, stubTree) {
  if (stubTree) {
    return {getRoutingOrder: () => {
      f.counts.planBuilds += 1;
      return [...f.routingOrder];
    }};
  }
  const tree = new LatencyTreeService({nodeId: SOURCE_NODE, systemTableCache: f.cache,
    nowFn: f.clock.now});
  tree.initialize();
  tree.start();
  t.after(() => tree.stop());
  const read = tree.getRoutingOrder.bind(tree);
  tree.getRoutingOrder = (...args) => {
    f.counts.planBuilds += 1;
    return read(...args);
  };
  return tree;
}

function startTopology(f, t, {stubTree = false} = {}) {
  f.tree = startTree(f, t, stubTree);
  f.topology = new CDCGroupPropagationService({nodeId: SOURCE_NODE, systemTableCache: f.cache,
    messageRouter: f.router, latencyTreeService: f.tree, nowFn: f.clock.now,
    ...FAST_FOREGROUND_RETRY, deliveryRetryMaxAttempts: ONE_ATTEMPT_PER_DRIVE});
  f.topology.initialize();
  f.topology.start();
  t.after(() => f.topology.stop());
}

// One owed row on a leading partition with one production subscriber; no
// subscriber callback runs during setup (readiness is withheld until the end).
async function currentnessFixture(t, {targets = [TARGET_GROUP], stubTree = false} = {}) {
  const clock = heldDispatchClock(START_MS);
  const f = {clock, cache: new SystemTableCache({timeSource: clock}), updatedAt: START_MS,
    ready: false, closed: false, targetMode: RESPONSE.NATIVE, routingOrder: [],
    targetCalls: [], duringTarget: null, duringError: null, captured: null,
    counts: {planBuilds: 0, checkSelections: 0, deliverySelections: 0}};
  seedTopologyRows(f, targets);
  await startRouterAndPeer(f, t);
  startTopology(f, t, {stubTree});
  f.source = createDurableSourceMessageGroupService(SOURCE_GROUP,
    {canAcceptCDCEvent: () => f.ready});
  f.selected = f.source;
  const {leader} = await startLeader({tableName: CDC_TABLE, timeSource: clock});
  f.leader = leader;
  t.after(() => shutdownAll(leader));
  leader.controllablePort.setRole(RAFT_ROLE.FOLLOWER);
  f.subscriber = buildSubscriber(f);
  await leader.subscribeToCDCWithHandshake(f.subscriber, {subscriberId: 'currentness-stamp-0'});
  const command = committedQueryOf('currentness-stamp-row',
    `INSERT INTO ${CDC_TABLE} (id, value) VALUES (?, ?)`);
  command.params = ['A', 'currentness-stamp-body'];
  command.timestamp = new HLCTimestamp(1000, 0, 'currentness-stamp').toString();
  assert.equal(applyCommitted(leader, command), null);
  leader.controllablePort.setRole(RAFT_ROLE.LEADER);
  await settleTicks();
  assert.equal(f.targetCalls.length, 0, 'setup: no delivery ran before the witness');
  assert.deepEqual(countCdcObligations(leader.db), {owed: 1, delivered: 0});
  f.ready = true;
  f.drive = () => leader.cdcDelivery.driveCdcObligations(
    PARTITION_CDC_OBLIGATION_REASON.DELIVERY_RETRY);
  return f;
}

function resetCounts(f) {
  for (const key of Object.keys(f.counts)) f.counts[key] = 0;
}

// --- witness 1: the cost of one delivery with nothing changing ---

// One delivery of one range with nothing changing, counted whole: the wave's
// own plan captures (admission and post-success) included.
async function countOneDelivery(t, targetCount) {
  const targets = Array.from({length: targetCount}, (_unused, index) =>
    `stamp-target-${index}`);
  const f = await currentnessFixture(t, {targets});
  resetCounts(f);
  const outcome = await f.drive();
  if (f.duringError) throw f.duringError;
  assert.equal(outcome.state, DRIVE.DRAINED, 'setup: the delivery completed');
  assert.deepEqual(f.targetCalls.map((call) => call.targetGroupId).sort(), targets,
    'setup: every target was delivered through the real router');
  const today = `measured: ${f.counts.planBuilds} plan rebuilds, ` +
    `${f.counts.checkSelections} currentness selection evaluations (each one raft status ` +
    'read on a node whose local message-group replica leads), ' +
    `${f.counts.deliverySelections} delivery selection(s), for one delivery of one range to ` +
    `${targetCount} target group(s)`;
  t.diagnostic(today);
  return {counts: {...f.counts}, today};
}

for (const targetCount of [1, 3]) {
  test(`one CDC delivery to ${targetCount} target group(s) with nothing changing rebuilds ` +
    'the propagation plan at most once', async (t) => {
    const {counts, today} = await countOneDelivery(t, targetCount);
    assert.ok(counts.planBuilds <= 1, `plan rebuilds must be at most 1; ${today}`);
  });

  test(`one CDC delivery to ${targetCount} target group(s) with nothing changing reads raft ` +
    'status for currentness at most once', async (t) => {
    const {counts, today} = await countOneDelivery(t, targetCount);
    assert.ok(counts.checkSelections <= 1,
      `currentness raft status reads must be at most 1; ${today}`);
  });
}

// --- witness 2: every input of the check, changed after a first check ---

function setPartitionField(field, value) {
  return (f) => {
    f.leader[field] = value;
  };
}

function setSourceField(field, value) {
  return (f) => {
    f.source[field] = value;
  };
}

function setTopologyField(field, value) {
  return (f) => {
    f.topology[field] = value;
  };
}

function subscriberWrapper(f) {
  return [...f.leader.cdcSubscribers][0];
}

const PARTITION_INPUTS = [
  {id: 'partition.obligation-lane', reads: 'partition-cdc-obligation-progress.js:44',
    kind: KIND.NOT_CURRENT, mutate: (f) => {
      const lane = f.leader.cdcDelivery.obligationLane;
      f.leader.cdcDelivery.obligationLane = createCdcObligationLane(lane.tenure);
    }},
  {id: 'partition.current-obligation', reads: 'partition-cdc-obligation-progress.js:44',
    kind: KIND.NOT_CURRENT, mutate: (f) => {
      f.leader.cdcDelivery.obligationLane.currentObligation = null;
    }},
  {id: 'partition.is-leader', reads: 'partition-cdc-obligation-progress.js:45',
    kind: KIND.NOT_CURRENT, mutate: setPartitionField('isLeader', false)},
  {id: 'partition.is-shutdown', reads: 'partition-cdc-obligation-progress.js:45',
    kind: KIND.NOT_CURRENT, mutate: setPartitionField('isShutdown', true),
    restore: setPartitionField('isShutdown', false)},
  {id: 'partition.leadership-tenure', reads: 'partition-cdc-obligation-progress.js:46',
    kind: KIND.NOT_CURRENT, mutate: (f) => {
      // The owner's path: a term this leader observes mints a new tenure.
      const before = f.leader.leadershipTenure;
      f.leader.controllablePort.emitEvent(RAFT_EVENT.TERM_CHANGE,
        (before?.term ?? 1) + 1);
      assert.notEqual(f.leader.leadershipTenure, before, 'setup: a new tenure was minted');
      assert.equal(f.leader.isLeader, true, 'setup: the replica still leads');
    }},
  {id: 'partition.subscriber-count', reads: 'partition-cdc-obligation-progress.js:47',
    kind: KIND.NOT_CURRENT, mutate: async (f) => {
      await f.leader.subscribeToCDCWithHandshake(async () => undefined,
        {subscriberId: 'currentness-stamp-extra'});
    }},
  {id: 'partition.subscriber-membership', reads: 'partition-cdc-obligation-progress.js:26',
    kind: KIND.NOT_CURRENT, mutate: (f) => f.leader.unsubscribeFromCDC(f.subscriber)},
  {id: 'partition.subscriber-source', reads: 'partition-cdc-obligation-progress.js:27',
    kind: KIND.NOT_CURRENT, mutate: (f) => {
      subscriberWrapper(f).cdcSourceSubscriber = async () => undefined;
    }},
  {id: 'partition.subscriber-state', reads: 'partition-cdc-obligation-progress.js:28',
    kind: KIND.NOT_CURRENT, mutate: (f) => {
      const states = f.leader.cdcSubscriberStates;
      states.set(f.subscriber, {...states.get(f.subscriber)});
    }},
  {id: 'partition.subscriber-epoch', reads: 'partition-cdc-obligation-progress.js:29',
    kind: KIND.NOT_CURRENT, mutate: (f) => {
      f.leader.cdcSubscriberStates.get(f.subscriber).subscriptionEpoch += 1;
    }},
  {id: 'invocation.active-slot', reads: 'cdc-delivery-invocation.js:225',
    kind: KIND.NOT_CURRENT, mutate: (f) => {
      f.leader.cdcDelivery.activeCdcInvocation = null;
    }},
  {id: 'invocation.retired', reads: 'cdc-delivery-invocation.js:224-225',
    kind: KIND.NOT_CURRENT, mutate: (f) => f.captured.finish()},
];

const TOPOLOGY_AND_SOURCE_INPUTS = [
  {id: 'topology.durable-lifetime', reads: 'cdc-propagation-progress.js:144',
    kind: KIND.NOT_CURRENT,
    mutate: setTopologyField('durablePropagationLifetime', Object.freeze({}))},
  {id: 'topology.stopped', reads: 'cdc-propagation-progress.js:144',
    kind: KIND.NOT_CURRENT,
    mutate: setTopologyField('state', CDC_GROUP_PROPAGATION_STATE.STOPPED)},
  {id: 'topology.cache-identity', reads: 'cdc-propagation-progress.js:145',
    kind: KIND.NOT_CURRENT, mutate: (f) => {
      f.topology.systemTableCache = new SystemTableCache({timeSource: f.clock});
    }},
  {id: 'topology.tree-identity', reads: 'cdc-propagation-progress.js:145',
    kind: KIND.NOT_CURRENT, mutate: (f) => {
      f.topology.latencyTreeService = {getRoutingOrder: () => []};
    }},
  {id: 'topology.router-identity', reads: 'cdc-propagation-progress.js:146',
    kind: KIND.NOT_CURRENT, mutate: (f) => {
      f.topology.messageRouter = {deliver: f.router.deliver.bind(f.router)};
    }},
  {id: 'topology.node-id', reads: 'cdc-group-propagation-durable-plan.js:25; ' +
    'cdc-group-propagation-routing.js:330,545', kind: KIND.REOBSERVED,
  prepare: (f) => writeRow(f, TABLES.LATENCY_GROUPS, latencyGroupRow('stamp-lg-9', SOURCE_NODE)),
  mutate: setTopologyField('nodeId', 'node-renamed'), observe: hasLeaf('stamp-lg-9'),
  after: true},
  {id: 'topology.replica-suffix', reads: 'cdc-group-propagation-durable-plan.js:28; ' +
    'cdc-group-propagation-routing.js:97-107', kind: KIND.REOBSERVED,
  prepare: (f) => {
    f.topology.messageGroupReplicaSuffix = '-nomatch';
    writeRow(f, TABLES.SERVICES, unroutableServiceRow('stamp-suffix-r1', null, PEER));
  },
  mutate: setTopologyField('messageGroupReplicaSuffix', CDC_MESSAGE_GROUP_REPLICA_SUFFIX),
  observe: hasLeaf('stamp-suffix'), after: true},
  {id: 'source.is-shutdown', reads: 'cdc-propagation-progress.js:147',
    kind: KIND.NOT_CURRENT, mutate: setSourceField('isShutdown', true)},
  {id: 'source.initialized', reads: 'cdc-propagation-progress.js:147',
    kind: KIND.NOT_CURRENT, mutate: setSourceField('initialized', false)},
  {id: 'source.raft', reads: 'cdc-propagation-progress.js:147',
    kind: KIND.NOT_CURRENT, mutate: setSourceField('raft', Object.freeze({}))},
  {id: 'source.commit-lifetime', reads: 'cdc-propagation-progress.js:148',
    kind: KIND.NOT_CURRENT, mutate: setSourceField('cdcCommitLifetime', Object.freeze({}))},
  {id: 'source.group-id', reads: 'cdc-propagation-progress.js:149',
    kind: KIND.NOT_CURRENT, mutate: setSourceField('groupId', 'stamp-group-renamed')},
  {id: 'selection.selected-service', reads: 'partition-cdc-obligation-progress.js:39-40',
    kind: KIND.NOT_CURRENT, mutate: (f) => {
      // A replacement service object with equal group text is not the owner.
      f.selected = createDurableSourceMessageGroupService(SOURCE_GROUP);
    }},
  {id: 'config.propagation-mode', reads: 'cdc-group-propagation-service.js:221-242; ' +
    'cdc-group-propagation-durable-plan.js:15-18', kind: KIND.NOT_CURRENT,
  prepare: (f) => {
    // Safe mode skips the local group; grouped mode finds the source contradicted.
    writeRow(f, TABLES.NODES, {[COLUMN.NODE_ID]: SOURCE_NODE,
      [COLUMN.LATENCY_GROUP_ID]: 'stamp-contradiction'});
    writeRow(f, TABLES.LATENCY_GROUPS, latencyGroupRow('stamp-contradiction', SOURCE_NODE));
  },
  mutate: () => ConfigurationManager.getInstance().setByPath(
    LATENCY_TOPOLOGY_CONFIG_KEY.PROPAGATION_MODE, LATENCY_PROPAGATION_MODE.GROUPED)},
  {id: 'tree.routing-order', reads: 'cdc-group-propagation-routing.js:412-421',
    kind: KIND.UNCHANGED, discriminating: false, fixture: {stubTree: true},
    // The routing order only orders the required set; the set itself is the
    // cache's (routing.js:351-367), so an order change alone changes neither
    // the answer nor the leaves. Kept so the list stays complete.
    mutate: (f) => {
      f.routingOrder = ['stamp-unknown-group', TARGET_GROUP];
    }, observe: (f) => progressOf(f).targets.map((leaf) => leaf.groupId).join()},
];

function serviceUpdate(groupId, fields) {
  return (f) => writeRow(f, TABLES.SERVICES, targetServiceRow(groupId, PEER, fields));
}

const SERVICES_INPUTS = [
  {id: 'services.address', reads: 'cdc-group-propagation-routing.js:52-54,604',
    kind: KIND.REOBSERVED,
    mutate: serviceUpdate(TARGET_GROUP, {[COLUMN.ADDRESS]: `${PEER}/message-group/repaired`}),
    observe: routeField(TARGET_GROUP, 'address'), after: `${PEER}/message-group/repaired`},
  {id: 'services.node-id', reads: 'cdc-group-propagation-routing.js:603',
    kind: KIND.REOBSERVED,
    mutate: serviceUpdate(TARGET_GROUP, {[COLUMN.NODE_ID]: 'replacement-node'}),
    observe: routeField(TARGET_GROUP, 'coordinatorNodeId'), after: 'replacement-node'},
  {id: 'services.service-id', reads: 'cdc-group-propagation-routing.js:150',
    kind: KIND.REOBSERVED, mutate: (f) => {
      serviceUpdate(TARGET_GROUP, {[COLUMN.STATUS]: SERVICE_STATUS.STOPPED})(f);
      writeRow(f, TABLES.SERVICES, {...targetServiceRow(TARGET_GROUP),
        [COLUMN.SERVICE_ID]: `${TARGET_GROUP}-r9`}, CDC_OPERATION.INSERT);
    }, observe: routeField(TARGET_GROUP, 'serviceId'), after: `${TARGET_GROUP}-r9`},
  {id: 'services.created-at', reads: 'cdc-group-propagation-routing.js:152',
    kind: KIND.REOBSERVED,
    mutate: serviceUpdate(TARGET_GROUP, {[COLUMN.CREATED_AT]: SERVICE_BIRTH_MS + 1}),
    observe: routeField(TARGET_GROUP, 'serviceCreatedAt'), after: SERVICE_BIRTH_MS + 1},
  {id: 'services.create-attempt-token', reads: 'cdc-group-propagation-routing.js:153',
    kind: KIND.REOBSERVED,
    mutate: serviceUpdate(TARGET_GROUP, {create_attempt_token: 'replacement-birth-attempt'}),
    observe: routeField(TARGET_GROUP, 'createAttemptToken'), after: 'replacement-birth-attempt'},
  {id: 'services.replica-id', reads: 'cdc-group-propagation-routing.js:151',
    kind: KIND.REOBSERVED,
    mutate: serviceUpdate(TARGET_GROUP, {[COLUMN.REPLICA_ID]: 'replacement-replica'}),
    observe: routeField(TARGET_GROUP, 'replicaId'), after: 'replacement-replica'},
  {id: 'services.raft-role', reads: 'cdc-group-propagation-routing.js:65-86,596',
    kind: KIND.REOBSERVED,
    // A second replica of the target group whose id sorts first wins once it leads.
    prepare: (f) => writeRow(f, TABLES.SERVICES, {...targetServiceRow(TARGET_GROUP, 'node-c'),
      [COLUMN.SERVICE_ID]: 'aaa-stamp-replica', [COLUMN.RAFT_ROLE]: RAFT_ROLE.FOLLOWER}),
    mutate: (f) => writeRow(f, TABLES.SERVICES, {...targetServiceRow(TARGET_GROUP, 'node-c'),
      [COLUMN.SERVICE_ID]: 'aaa-stamp-replica', [COLUMN.RAFT_ROLE]: RAFT_ROLE.LEADER}),
    observe: routeField(TARGET_GROUP, 'serviceId'), after: 'aaa-stamp-replica'},
  {id: 'services.status', reads: 'cdc-group-propagation-routing.js:228-233',
    kind: KIND.REOBSERVED,
    prepare: (f) => writeRow(f, TABLES.SERVICES, unroutableServiceRow('stamp-group-c-r1',
      'stamp-group-c', PEER, {[COLUMN.STATUS]: SERVICE_STATUS.STOPPED})),
    mutate: (f) => writeRow(f, TABLES.SERVICES, unroutableServiceRow('stamp-group-c-r1',
      'stamp-group-c', PEER, {[COLUMN.STATUS]: SERVICE_STATUS.ACTIVE})),
    observe: hasLeaf('stamp-group-c'), after: true},
  {id: 'services.service-type', reads: 'cdc-group-propagation-routing.js:228-233',
    kind: KIND.REOBSERVED,
    prepare: (f) => writeRow(f, TABLES.SERVICES, unroutableServiceRow('stamp-group-d-r1',
      'stamp-group-d', PEER, {[COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION})),
    mutate: (f) => writeRow(f, TABLES.SERVICES, unroutableServiceRow('stamp-group-d-r1',
      'stamp-group-d', PEER, {[COLUMN.SERVICE_TYPE]: SERVICE_TYPE.MESSAGE_GROUP})),
    observe: hasLeaf('stamp-group-d'), after: true},
  {id: 'services.group-id', reads: 'cdc-group-propagation-routing.js:88-92,272',
    kind: KIND.REOBSERVED,
    prepare: (f) => writeRow(f, TABLES.SERVICES,
      unroutableServiceRow('stamp-svc-e-r1', 'stamp-group-e', PEER)),
    mutate: (f) => writeRow(f, TABLES.SERVICES,
      unroutableServiceRow('stamp-svc-e-r1', 'stamp-group-f', PEER)),
    observe: hasLeaf('stamp-group-f'), after: true},
];

function nodeUpdate(nodeId, fields) {
  return (f) => writeRow(f, TABLES.NODES, {[COLUMN.NODE_ID]: nodeId, ...fields});
}

const NODES_INPUTS = [
  {id: 'nodes.boot-incarnation', reads: 'cdc-group-propagation-routing.js:146,154',
    kind: KIND.REOBSERVED, mutate: nodeUpdate(PEER, {[COLUMN.BOOT_INCARNATION]: 2}),
    observe: routeField(TARGET_GROUP, 'nodeBootIncarnation'), after: 2},
  {id: 'nodes.latency-group-id', reads: 'cdc-group-propagation-routing.js:278-280',
    kind: KIND.REOBSERVED, prepare: (f) => {
      // stamp-lg-1 is mapped only through the group its member node hosts.
      writeRow(f, TABLES.LATENCY_GROUPS, latencyGroupRow('stamp-lg-1', 'node-x'));
      nodeUpdate('node-y', {[COLUMN.LATENCY_GROUP_ID]: 'stamp-lg-1'})(f);
      writeRow(f, TABLES.SERVICES,
        unroutableServiceRow('stamp-group-y-r1', 'stamp-group-y', 'node-y'));
    }, mutate: nodeUpdate('node-y', {[COLUMN.LATENCY_GROUP_ID]: 'stamp-lg-elsewhere'}),
    observe: hasLeaf('stamp-lg-1'), after: true},
  {id: 'nodes.status', reads: 'cdc-group-propagation-routing.js:498-502',
    kind: KIND.REOBSERVED, prepare: (f) => {
      // A group whose coordinator still joins is pre-activation, not unmapped.
      writeRow(f, TABLES.LATENCY_GROUPS, latencyGroupRow('stamp-lg-2', 'node-j'));
      nodeUpdate('node-j', {[COLUMN.STATUS]: NODE_STATE.JOINING})(f);
    }, mutate: nodeUpdate('node-j', {[COLUMN.STATUS]: NODE_STATE.ACTIVE}),
    observe: hasLeaf('stamp-lg-2'), after: true},
  {id: 'nodes.local-latency-group-id', reads: 'cdc-group-propagation-routing.js:522-536',
    kind: KIND.REOBSERVED, prepare: (f) => {
      writeRow(f, TABLES.LATENCY_GROUPS, latencyGroupRow('stamp-lg-3', 'node-z'));
      nodeUpdate(SOURCE_NODE, {[COLUMN.LATENCY_GROUP_ID]: 'stamp-lg-3'})(f);
    }, mutate: nodeUpdate(SOURCE_NODE, {[COLUMN.LATENCY_GROUP_ID]: SOURCE_GROUP}),
    observe: hasLeaf('stamp-lg-3'), after: true},
];

function latencyUpdate(groupId, coordinatorNodeId, fields = {}) {
  return (f) => writeRow(f, TABLES.LATENCY_GROUPS,
    latencyGroupRow(groupId, coordinatorNodeId, fields));
}

function messageGroupUpdate(groupId, fields) {
  return (f) => writeRow(f, TABLES.MESSAGE_GROUPS, {[COLUMN.GROUP_ID]: groupId, ...fields});
}

const GROUP_TABLE_INPUTS = [
  {id: 'latency-groups.row', reads: 'cdc-group-propagation-routing.js:196-199',
    kind: KIND.REOBSERVED, mutate: latencyUpdate('stamp-lg-4', 'node-q'),
    observe: hasLeaf('stamp-lg-4'), after: true},
  {id: 'latency-groups.state', reads: 'cdc-group-propagation-routing.js:167-179,201-215',
    kind: KIND.REOBSERVED,
    prepare: latencyUpdate('stamp-lg-5', 'node-q', {[COLUMN.STATE]: LATENCY_GROUP_STATE.DRAINING}),
    mutate: latencyUpdate('stamp-lg-5', 'node-q', {[COLUMN.STATE]: LATENCY_GROUP_STATE.ACTIVE}),
    observe: hasLeaf('stamp-lg-5'), after: true},
  {id: 'latency-groups.coordinator', reads: 'cdc-group-propagation-routing.js:326-337,541-544',
    kind: KIND.REOBSERVED, prepare: latencyUpdate('stamp-lg-6', PEER),
    mutate: latencyUpdate('stamp-lg-6', 'node-w'), observe: hasLeaf('stamp-lg-6'), after: true},
  {id: 'latency-groups.representative', reads: 'cdc-group-propagation-routing.js:326-329',
    kind: KIND.REOBSERVED,
    prepare: latencyUpdate('stamp-lg-7', null, {[COLUMN.REPRESENTATIVE_NODE_ID]: PEER}),
    mutate: latencyUpdate('stamp-lg-7', null, {[COLUMN.REPRESENTATIVE_NODE_ID]: 'node-w'}),
    observe: hasLeaf('stamp-lg-7'), after: true},
  {id: 'message-groups.row', reads: 'cdc-group-propagation-routing.js:223-226,268-270',
    kind: KIND.REOBSERVED,
    mutate: messageGroupUpdate('stamp-mg-h', {[COLUMN.STATUS]: SERVICE_STATUS.ACTIVE}),
    observe: hasLeaf('stamp-mg-h'), after: true},
  {id: 'message-groups.status', reads: 'cdc-group-propagation-routing.js:190-192',
    kind: KIND.REOBSERVED,
    prepare: messageGroupUpdate('stamp-mg-i', {[COLUMN.STATUS]: 'retired'}),
    mutate: messageGroupUpdate('stamp-mg-i', {[COLUMN.STATUS]: SERVICE_STATUS.ACTIVE}),
    observe: hasLeaf('stamp-mg-i'), after: true},
  {id: 'message-groups.state', reads: 'cdc-group-propagation-routing.js:190-192',
    kind: KIND.REOBSERVED,
    prepare: messageGroupUpdate('stamp-mg-j',
      {[COLUMN.STATUS]: SERVICE_STATUS.ACTIVE, [COLUMN.STATE]: 'retired'}),
    mutate: messageGroupUpdate('stamp-mg-j',
      {[COLUMN.STATUS]: SERVICE_STATUS.ACTIVE, [COLUMN.STATE]: SERVICE_STATUS.ACTIVE}),
    observe: hasLeaf('stamp-mg-j'), after: true},
  {id: 'message-groups.leader-node-id', reads: 'cdc-group-propagation-routing.js:269,289-293',
    kind: KIND.REOBSERVED, prepare: (f) => {
      // stamp-lg-8 is mapped only through the group its coordinator leads.
      latencyUpdate('stamp-lg-8', 'node-m')(f);
      messageGroupUpdate('stamp-mg-k',
        {[COLUMN.STATUS]: SERVICE_STATUS.ACTIVE, leader_node_id: 'node-m'})(f);
    }, mutate: messageGroupUpdate('stamp-mg-k',
      {[COLUMN.STATUS]: SERVICE_STATUS.ACTIVE, leader_node_id: 'node-n'}),
    observe: hasLeaf('stamp-lg-8'), after: true},
];

// The one list: every input the check reads (directly or transitively) and
// that this fixture can change. Inputs it cannot change here are listed with
// the witness that covers them instead.
const CURRENTNESS_INPUTS = [...PARTITION_INPUTS, ...TOPOLOGY_AND_SOURCE_INPUTS,
  ...SERVICES_INPUTS, ...NODES_INPUTS, ...GROUP_TABLE_INPUTS];

const INPUTS_COVERED_ELSEWHERE = [
  {id: 'invocation.deadline', reads: 'cdc-delivery-invocation.js:226,289; ' +
    'message-router-delivery-lifetime.js:101-121',
  coveredBy: 'the per-read deadline anchor in this file'},
  {id: 'selection.message-group-leadership', reads: 'message-group-selection.js:292-305; ' +
    'message-group-forwarding-owner.js:425-435; ' +
    'message-group-service-leadership-state-runtime-methods.js:9-12,35-38,134-136',
  coveredBy: 'the selection anchor in this file (one raft status read per evaluation)'},
  {id: 'topology.router-deliverable', reads: 'cdc-group-propagation-routing.js:687-692',
    coveredBy: 'read only in grouped mode (default is safe, config-definitions.js:193); ' +
      'the router object itself is topology.router-identity'},
];

async function observeCheckAcrossChange(f, input) {
  const observation = {threw: null, before: undefined, after: undefined};
  f.duringTarget = async () => {
    const context = f.captured;
    assert.ok(context, 'setup: the subscriber handed the wave its invocation');
    context.assertCurrent();
    observation.before = input.observe?.(f);
    await input.mutate(f);
    try {
      context.assertCurrent();
    } catch (error) {
      observation.threw = error;
    }
    observation.after = input.observe?.(f);
    input.restore?.(f);
    observation.ran = true;
  };
  await f.drive();
  if (f.duringError) throw f.duringError;
  assert.equal(observation.ran, true, 'setup: the check ran while the delivery was in flight');
  return observation;
}

test('the currentness input list is one complete, well-formed enumeration', () => {
  const ids = [...CURRENTNESS_INPUTS, ...INPUTS_COVERED_ELSEWHERE].map((input) => input.id);
  assert.equal(new Set(ids).size, ids.length, 'every input appears once');
  for (const input of CURRENTNESS_INPUTS) {
    assert.ok(Object.values(KIND).includes(input.kind), `${input.id} names its expectation`);
    assert.equal(typeof input.mutate, 'function', `${input.id} has its change`);
    assert.ok(typeof input.reads === 'string' && input.reads.length > 0, `${input.id} reads`);
    if (input.kind !== KIND.NOT_CURRENT) {
      assert.equal(typeof input.observe, 'function', `${input.id} has its observation`);
    }
    if (input.kind === KIND.REOBSERVED) {
      assert.ok(Object.hasOwn(input, 'after'), `${input.id} states the new fact`);
    }
  }
  for (const input of INPUTS_COVERED_ELSEWHERE) {
    assert.ok(input.coveredBy && input.reads, `${input.id} names its covering witness`);
  }
});

for (const input of CURRENTNESS_INPUTS) {
  test(`the next currentness check after ${input.id} changes answers per the new fact ` +
    `(${input.kind})`, async (t) => {
    const f = await currentnessFixture(t, input.fixture);
    await input.prepare?.(f);
    const observed = await observeCheckAcrossChange(f, input);
    if (input.kind === KIND.NOT_CURRENT) {
      assert.ok(observed.threw, `${input.id}: the next check must answer not current`);
      assert.equal(observed.threw.code ?? observed.threw.message, CDC_COMPLETION.UNKNOWN,
        `${input.id}: the refusal is the invocation's typed unknown`);
      return;
    }
    assert.equal(observed.threw, null, `${input.id}: the source is still current`);
    if (input.kind === KIND.UNCHANGED) {
      assert.equal(observed.after, observed.before,
        `${input.id}: an order change alone changes nothing the check answers or keeps`);
      return;
    }
    assert.notDeepEqual(observed.before, input.after, `setup: ${input.id} was not already true`);
    assert.deepEqual(observed.after, input.after,
      `${input.id}: the very next check re-observed the new fact`);
  });
}

// --- witness 3: the time-dependent input is read on every check ---

test('the currentness check evaluates the response deadline on every read with nothing ' +
  'else changing', async (t) => {
  const f = await currentnessFixture(t);
  const observed = {};
  f.duringTarget = () => {
    const context = f.captured;
    observed.first = context.remainingMs();
    f.clock.elapse(1);
    observed.second = context.remainingMs();
    observed.pendingTimers = f.clock.pendingTimerCount();
    // Past the deadline; no timer is dispatched, so only the read can refuse.
    f.clock.elapse(observed.second);
    try {
      context.assertCurrent();
    } catch (error) {
      observed.threw = error;
    }
  };
  await f.drive();
  if (f.duringError) throw f.duringError;
  assert.ok(Number.isFinite(observed.first) && observed.first > 1, 'setup: a live budget');
  assert.equal(observed.second, observed.first - 1, 'each read charges the elapsed time');
  assert.ok(observed.pendingTimers > 0, 'setup: the deadline timer was armed, not dispatched');
  assert.ok(observed.threw, 'a read past the deadline answers not current by itself');
});

// --- witness 4: the plan is observed once per change of its inputs ---

function progressSnapshot(f) {
  const progress = progressOf(f);
  return JSON.parse(JSON.stringify({sourceCoverage: progress.sourceCoverage,
    nextLeaf: progress.nextLeaf, targets: progress.targets.map(({groupId, route, coverage}) =>
      ({groupId, route, coverage}))}));
}

test('checks of one delivery with no plan input changed reuse the owner-held plan',
  async (t) => {
    const f = await currentnessFixture(t);
    const observed = {};
    f.duringTarget = () => {
      const context = f.captured;
      context.assertCurrent();
      observed.before = f.counts.planBuilds;
      context.assertCurrent();
      context.remainingMs();
      observed.after = f.counts.planBuilds;
    };
    await f.drive();
    if (f.duringError) throw f.duringError;
    assert.ok(Number.isSafeInteger(observed.before), 'setup: the checks ran in flight');
    assert.equal(observed.after - observed.before, 0,
      `checks over unchanged plan inputs rebuild nothing (rebuilt ${observed.after -
        observed.before})`);
  });

test('an unrelated row change in a plan table re-observes the plan and leaves stable ' +
  'progress untouched', async (t) => {
  const f = await currentnessFixture(t);
  const observed = {};
  f.duringTarget = () => {
    const context = f.captured;
    context.assertCurrent();
    observed.before = progressSnapshot(f);
    const builds = f.counts.planBuilds;
    writeRow(f, TABLES.NODES, {[COLUMN.NODE_ID]: 'node-unrelated',
      [COLUMN.STATUS]: NODE_STATE.ACTIVE}, CDC_OPERATION.INSERT);
    context.assertCurrent();
    observed.rebuilt = f.counts.planBuilds - builds;
    observed.after = progressSnapshot(f);
  };
  await f.drive();
  if (f.duringError) throw f.duringError;
  assert.equal(observed.before.sourceCoverage.state, CDC_COVERAGE_STATE.COMMITTED,
    'setup: the progress already holds a covered leaf');
  assert.equal(observed.rebuilt, 1, 'the moved stamp re-observes the plan exactly once');
  assert.deepEqual(observed.after, observed.before,
    'the re-observation keeps every leaf, route and coverage: stable progress is not restarted');
});

test('a plan input changed between two drives (different turns) is seen by the next read',
  async (t) => {
    const f = await currentnessFixture(t);
    f.targetMode = RESPONSE.UNKNOWN;
    assert.equal((await f.drive()).state, DRIVE.HELD_BY_SUBSCRIBER,
      'setup: the range is held at its target');
    await settleTicks();
    const moved = `${PEER}/message-group/moved-between-turns`;
    writeRow(f, TABLES.SERVICES,
      targetServiceRow(TARGET_GROUP, PEER, {[COLUMN.ADDRESS]: moved}));
    await settleTicks();
    f.targetMode = RESPONSE.NATIVE;
    const outcome = await f.drive();
    if (f.duringError) throw f.duringError;
    assert.equal(f.targetCalls.at(-1).address, moved, 'the next read re-observed the moved route');
    assert.equal(outcome.state, DRIVE.DRAINED, 'the moved route covered the range');
  });

// --- anchor: one production selection evaluation is one raft status read ---

const ANCHOR_TRANSPORT = Object.freeze({
  async deliver() {
    throw new Error('the selection anchor delivers nothing');
  },
  async initialize() {},
  async shutdown() {},
  setServiceNodeResolver() {},
});

test('production operational selection reads raft status once per evaluation through a ' +
  'local leader replica (the currentness accessor\'s raft read)', (t) => {
  NodeService.resetInstance();
  t.after(() => NodeService.resetInstance());
  const controllable = new ControllableConsensusPort({peers: [], role: RAFT_ROLE.LEADER});
  const base = controllable.createOperationPort({});
  let statusReads = 0;
  // The production port shape, counting the one operation this anchor pins.
  const port = createRaftOperationPort({...base, readStatus: () => {
    statusReads += 1;
    return base.readStatus();
  }});
  const service = new MessageGroupService(withTestDbPath({groupId: 'stamp-anchor',
    replicaId: 'stamp-anchor-r1', nodeId: SOURCE_NODE, transport: ANCHOR_TRANSPORT}));
  service.initialized = true;
  service.role = RAFT_ROLE.LEADER;
  service.raft = port;
  // The options the subscriber factory's currentness accessor passes
  // (partition-cdc-propagation-subscriber.js:142-152,283-284).
  const options = {requiredTables: [CDC_TABLE], preferredService: service,
    reuseCapturedIngress: true};
  for (let evaluation = 1; evaluation <= 3; evaluation += 1) {
    assert.equal(resolveOperationalMessageGroupSelection([service], options).service, service);
    assert.equal(statusReads, evaluation, 'one raft status read per selection evaluation');
  }
});
