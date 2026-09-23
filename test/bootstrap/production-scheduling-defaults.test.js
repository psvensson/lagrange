// What a production node schedules on: the replicas it hosts, and the
// reconciler it converges with.
//
// Both arm their consensus scheduling, their coalescing hops and their
// per-action turn on a clock only when the node runtime was SUPPLIED one. A
// production runtime resolves its own real clock, and resolving one is not
// being given one: handing that resolved clock on routes the replica's
// consensus scheduling through it and moves every hop from setImmediate to a
// zero-delay timer, which is a different event-loop phase rather than a
// different substrate. The seed is the only path that hands out node-local
// authorities, so when it hands out a resolved clock the replicas a node
// hosts as seed schedule differently from the ones it hosts as joiner.
//
// A partition replica runs on one consensus backend, rs-raft, built through
// the one operation-port construction path; there is no backend to select.
// The consensus witness asks that port to start scheduling
// (`raft.startScheduling()`) and reads the primitive it arms; which timer
// manager the backend chose is the field, not the primitive, and is not
// read. The commit-apply yield witness this file once carried read liferaft's
// timer manager, which the operation port does not expose and rs-raft has no
// counterpart of (it applies a Ready's committed entries inside one ready
// cycle); it is gone with that subject. Message-group replicas still run
// liferaft, and their hop witnesses are unchanged.
//
// The reconciler's witness lives here rather than under test/service
// because what it proves is the same seam on the same composition, and one
// recorder cannot be copied into two files without duplicating it.
//
// Every witness here reads the primitive production actually armed, not the
// field it read to choose one.

import assert from 'node:assert/strict';
import {test} from 'node:test';

import {BootstrapService} from '../../src/bootstrap/bootstrap-service.js';
import {resolveHostedReplicaAuthorities} from
  '../../src/bootstrap/shared/hosted-replica-authorities.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {MessageGroupService} from
  '../../src/message-group/message-group-service.js';
import {NodeService} from '../../src/node/node-service.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {RAFT_OPERATION_OUTCOME} from
  '../../src/raft/raft-operation-port-constants.js';
import {
  RECONCILER_ACTION_TYPE,
  ServiceLifecycleManager,
  ServiceReconciler,
} from '../../src/service/index.js';

// The host primitives, captured before any recorder replaces them, so a
// supplied clock's own delegation is never counted as production reaching
// for the host.
const hostNow = Date.now;
const hostSetTimeout = globalThis.setTimeout;
const hostClearTimeout = globalThis.clearTimeout;
const hostSetInterval = globalThis.setInterval;
const hostClearInterval = globalThis.clearInterval;
const hostSetImmediate = globalThis.setImmediate;

const NODE_ID = 'seed-scheduling-node';
const NODE_ADDRESS = 'http://127.0.0.1:1';
const WS_PORT = 0;
const LOG_LEVEL = 'fatal';
const TABLE_ID = 'seed-scheduling-table';
const IN_MEMORY_DB = ':memory:';
const GROUP_ID = 'seed-scheduling-group';
const SERVICE_TYPE_WITHOUT_ADAPTER = 'no-such-service-type';
const TENANT_ID = 'seed-scheduling-tenant';
const DRIFT_REASON = 'drift';
const REPLICA_COUNT = 3;
const SET_IMMEDIATE = 'setImmediate';
const SET_TIMEOUT = 'setTimeout';
const SET_INTERVAL = 'setInterval';
const DELAY_OPEN = '(';
const DELAY_CLOSE = ')';
const ZERO_DELAY_MS = 0;
const NO_CLOCK_ARMS = 0;
const NO_HOST_PRIMITIVE = Object.freeze([]);
// The constructor arms one peer-reconciliation hop of its own; the witness
// waits for that hop to run so it measures the one it arms itself.
const CONSTRUCTOR_HOP_SETTLE_MS = 5;
const PLANNED_ACTION_COUNT = 2;
const HOP_COUNT_PER_REPLICA = 2;
const EMPTY_STATE = Object.freeze([]);

const timerName = (primitive, delayMs) =>
  `${primitive}${DELAY_OPEN}${delayMs}${DELAY_CLOSE}`;

// The primitive without its delay: an election timeout is randomized per
// replica, so two replicas that schedule alike still arm different delays.
const primitiveKind = (name) => name.split(DELAY_OPEN)[0];

/**
 * A node runtime that was actually supplied a clock. It delegates to the
 * host so the witness still runs in real time; what it records is which
 * scheduling calls production routed through it.
 */
class SuppliedClock {
  constructor() {
    this.armedDelays = [];
  }

  now() {
    return hostNow();
  }

  setTimeout(callback, delayMs, ...args) {
    this.armedDelays.push(delayMs);
    return hostSetTimeout(callback, delayMs, ...args);
  }

  clearTimeout(handle) {
    hostClearTimeout(handle);
  }

  setInterval(callback, delayMs, ...args) {
    this.armedDelays.push(delayMs);
    return hostSetInterval(callback, delayMs, ...args);
  }

  clearInterval(handle) {
    hostClearInterval(handle);
  }

  charge() {
    // The cost-model seam is inert outside the simulator's metered clock.
  }
}

const zeroDelayArmCount = (clock) =>
  clock.armedDelays.filter((delayMs) => delayMs === ZERO_DELAY_MS).length;

// Everything the clock has armed, whatever the delay: consensus scheduling
// arms its tick or election timer, never a zero-delay hop.
const armedCount = (clock) => clock.armedDelays.length;

/**
 * Record the host primitives production arms, passing each call through so
 * the deferred work still happens.
 * @param {Array<string>} armed - the list every armed primitive is named in.
 * @return {Function} restores the host primitives.
 */
function installPrimitiveRecorder(armed) {
  globalThis.setImmediate = (callback, ...args) => {
    armed.push(SET_IMMEDIATE);
    return hostSetImmediate(callback, ...args);
  };
  globalThis.setTimeout = (callback, delayMs, ...args) => {
    armed.push(timerName(SET_TIMEOUT, delayMs));
    return hostSetTimeout(callback, delayMs, ...args);
  };
  globalThis.setInterval = (callback, delayMs, ...args) => {
    armed.push(timerName(SET_INTERVAL, delayMs));
    return hostSetInterval(callback, delayMs, ...args);
  };
  return () => {
    globalThis.setImmediate = hostSetImmediate;
    globalThis.setTimeout = hostSetTimeout;
    globalThis.setInterval = hostSetInterval;
  };
}

/**
 * @param {Function} run - the call under measurement.
 * @return {Array<string>} the primitives it armed, in order.
 */
function primitivesArmedBy(run) {
  const armed = [];
  const restore = installPrimitiveRecorder(armed);
  try {
    run();
  } finally {
    restore();
  }
  return armed;
}

/**
 * @param {Function} run - the awaited call under measurement.
 * @return {Promise<Array<string>>} the primitives it armed, in order.
 */
async function primitivesArmedByAwaited(run) {
  const armed = [];
  const restore = installPrimitiveRecorder(armed);
  try {
    await run();
  } finally {
    restore();
  }
  return armed;
}

const settle = (delayMs) =>
  new Promise((resolve) => hostSetTimeout(resolve, delayMs));

/**
 * A bootstrap service composed as lagrange-runtime-startup.js composes it:
 * its own node runtime, and no clock supplied to that runtime.
 * @return {BootstrapService}
 */
function productionBootstrapService() {
  return new BootstrapService({
    nodeId: NODE_ID, nodeAddress: NODE_ADDRESS, wsPort: WS_PORT,
    nodeService: new NodeService(),
  });
}

/**
 * The same composition on a node runtime that WAS supplied a clock - the
 * simulator's shape.
 * @param {SuppliedClock} clock - the runtime's clock.
 * @return {BootstrapService}
 */
function suppliedClockBootstrapService(clock) {
  return new BootstrapService({
    nodeId: NODE_ID, nodeAddress: NODE_ADDRESS, wsPort: WS_PORT,
    nodeService: new NodeService({timeSource: clock}),
  });
}

/**
 * A real partition replica, composed with the authorities a seed phase
 * spreads into its construction, and registered for teardown.
 * @param {Array<Object>} open - the replicas this test still holds open.
 * @param {string} label - distinguishes this replica's ids.
 * @param {Object} authorities - hosted-replica authorities, or {}.
 * @return {Promise<PartitionService>}
 */
async function startPartitionReplica(open, label, authorities) {
  const partition = new PartitionService({
    partitionId: `${TABLE_ID}-${label}`,
    tableId: TABLE_ID,
    replicaId: `${TABLE_ID}-${label}-r1`,
    nodeId: NODE_ID,
    dbPath: IN_MEMORY_DB,
    ...authorities,
  });
  open.push(partition);
  await partition.initialize();
  await settle(CONSTRUCTOR_HOP_SETTLE_MS);
  assert.equal(partition.peerReconciliationScheduled, false,
    'the constructor\'s own hop has run, so the witness arms the next one');
  // The size-update debounce is not what this witness measures: the replica
  // goes back to the state its constructor starts in, where the next
  // write's size update is due.
  partition.lastSizeUpdate = ZERO_DELAY_MS;
  return partition;
}

const messageGroupTransport = () => ({
  register() {},
  deliver: async () => ({}),
  initialize() {},
  setServiceNodeResolver() {},
  on() {},
  once() {},
  off() {},
  removeListener() {},
});

/**
 * A real message-group replica with the same authorities. Election is
 * deferred: the witness is about which primitive a hop arms, not about
 * consensus.
 * @param {Array<Object>} open - the replicas this test still holds open.
 * @param {string} label - distinguishes this replica's ids.
 * @param {Object} authorities - hosted-replica authorities, or {}.
 * @return {Promise<MessageGroupService>}
 */
async function messageGroupReplica(open, label, authorities) {
  const group = new MessageGroupService({
    groupId: `${GROUP_ID}-${label}`,
    replicaId: `${GROUP_ID}-${label}-r1`,
    replicaIds: [`${GROUP_ID}-${label}-r1`],
    nodeId: NODE_ID,
    peerAddresses: [],
    transport: messageGroupTransport(),
    deferElection: true,
    ...authorities,
  });
  open.push(group);
  await settle(CONSTRUCTOR_HOP_SETTLE_MS);
  assert.equal(group.peerReconciliationScheduled, false,
    'the constructor\'s own hop has run, so the witness arms the next one');
  return group;
}

/**
 * Shut one replica down now and stop holding it open, so no live cadence of
 * it arms a primitive inside a later witness's measurement window.
 * @param {Array<Object>} open - the replicas this test still holds open.
 * @param {Object} replica - the replica to close.
 * @return {Promise<void>}
 */
async function closeReplica(open, replica) {
  open.splice(open.indexOf(replica), 1);
  await replica.shutdown();
}

/**
 * What a replica's consensus scheduling arms: one partition replica, composed
 * with the given authorities, whose operation port is asked to start
 * scheduling. The replica is shut down once measured.
 * @param {Array<Object>} open - the replicas this test still holds open.
 * @param {string} label - distinguishes this composition's ids.
 * @param {Object} authorities - hosted-replica authorities, or {}.
 * @param {Function} [countClockArms] - how many primitives a supplied clock
 *   has armed so far.
 * @return {Promise<Object>} the host primitives armed, and how many the
 *   supplied clock armed meanwhile.
 */
async function consensusScheduling(open, label, authorities,
  countClockArms = () => NO_CLOCK_ARMS) {
  const partition = await startPartitionReplica(open, `${label}-consensus`,
    authorities);
  const beforeStart = countClockArms();
  let started = null;
  const armed = primitivesArmedBy(() => {
    started = partition.raft.startScheduling();
  });
  assert.equal(started?.outcome, RAFT_OPERATION_OUTCOME.CORE_OK,
    'the port starts its scheduling before it returns');
  const clockArms = countClockArms() - beforeStart;
  await closeReplica(open, partition);
  return {armed, clockArms};
}

/**
 * @param {Object} measured - from consensusScheduling.
 * @return {Array<string>} the kinds of host primitive it armed.
 */
const armedKinds = ({armed}) => armed.map(primitiveKind);

/**
 * Run one witness and leave nothing armed: a witness that fails early must
 * still let the process exit.
 * @param {Function} run - receives the open-replica collection.
 * @return {Promise<void>}
 */
async function withHostedReplicas(run) {
  LoggingService.getInstance().initialize({level: LOG_LEVEL});
  const open = [];
  try {
    await run(open);
  } finally {
    for (const replica of open.reverse()) {
      await replica.shutdown();
    }
  }
}

const plannedAction = (index) => ({
  type: RECONCILER_ACTION_TYPE.START_REPLICA,
  driftReason: DRIFT_REASON,
  definition: {
    serviceId: `svc-${index}`,
    serviceType: SERVICE_TYPE_WITHOUT_ADAPTER,
    tenantId: TENANT_ID,
    replicaCount: REPLICA_COUNT,
  },
  replica: {
    serviceId: `svc-${index}`,
    serviceType: SERVICE_TYPE_WITHOUT_ADAPTER,
    replicaId: `svc-${index}-r1`,
    tenantId: TENANT_ID,
  },
});

// One action per service id, so the reconciler runs them in separate queues
// and each is followed by its own per-action turn. The service type has no
// adapter, so every action fails at the lifecycle owner and nothing is
// created; the turn is taken either way.
const PLANNED_ACTIONS = Object.freeze(
  Array.from({length: PLANNED_ACTION_COUNT}, (_unused, index) =>
    plannedAction(index)));

const executePlannedActions = (reconciler) =>
  reconciler.executePlan([...PLANNED_ACTIONS],
    {reason: DRIFT_REASON, metadata: {}});

// One setImmediate per action, and nothing else.
const EXPECTED_TURNS = Object.freeze(PLANNED_ACTIONS.map(() => SET_IMMEDIATE));

/**
 * A reconciler with no clock offered at all - the shape the joining path
 * constructs, and the constructor default.
 * @return {ServiceReconciler}
 */
function unclockedReconciler() {
  return new ServiceReconciler({
    lifecycleManager: new ServiceLifecycleManager(),
    desiredStateReader: async () => EMPTY_STATE,
    actualStateReader: async () => EMPTY_STATE,
  });
}

test('a seed-hosted replica schedules like a production replica', () =>
  withHostedReplicas(async (open) => {
    const bootstrap = productionBootstrapService();
    const authorities =
      resolveHostedReplicaAuthorities(bootstrap.seedPartitionsPhase.delegates);
    assert.equal(authorities.timeSource, undefined,
      'a production node runtime supplies no clock to the replicas it hosts');
    assert.equal(authorities.nodeService, bootstrap.nodeService,
      'the hosting runtime is still the replica\'s node-local authority');

    const {armed} = await consensusScheduling(open, 'seed', authorities);
    assert.notDeepEqual(armed, NO_HOST_PRIMITIVE,
      'consensus scheduling runs on a host timer');

    const partition = await startPartitionReplica(open, 'seed', authorities);
    assert.deepEqual(
      primitivesArmedBy(() => partition.scheduleRaftPeerReconciliation()),
      [SET_IMMEDIATE], 'the peer-reconciliation hop is a setImmediate');
    assert.deepEqual(
      primitivesArmedBy(() => partition.scheduleSizeUpdate()),
      [SET_IMMEDIATE], 'the size-update hop is a setImmediate');
    await closeReplica(open, partition);

    const group = await messageGroupReplica(open, 'seed', authorities);
    assert.deepEqual(
      primitivesArmedBy(() => group.scheduleRaftPeerReconciliation()),
      [SET_IMMEDIATE],
      'a seed-hosted message-group replica hops the same way');
  }));

test('a seed-hosted and a joiner-hosted replica schedule alike', () =>
  withHostedReplicas(async (open) => {
    const bootstrap = productionBootstrapService();
    // What a seed phase spreads, against what every non-seed construction
    // site passes: on one production node these must not differ.
    const hosted = resolveHostedReplicaAuthorities(
      bootstrap.seedMessageGroupsPhase.delegates);
    assert.deepEqual(
      armedKinds(await consensusScheduling(open, 'alike-seed', hosted)),
      armedKinds(await consensusScheduling(open, 'alike-join', {})),
      'both replicas arm the same consensus scheduling primitive');

    const seeded = await startPartitionReplica(open, 'alike-seed', hosted);
    const joined = await startPartitionReplica(open, 'alike-join', {});
    assert.deepEqual(
      primitivesArmedBy(() => seeded.scheduleRaftPeerReconciliation()),
      primitivesArmedBy(() => joined.scheduleRaftPeerReconciliation()),
      'both take the peer-reconciliation hop the same way');
    assert.deepEqual(
      primitivesArmedBy(() => seeded.scheduleSizeUpdate()),
      primitivesArmedBy(() => joined.scheduleSizeUpdate()),
      'both take the size-update hop the same way');
    await closeReplica(open, seeded);
    await closeReplica(open, joined);

    const seedGroup = await messageGroupReplica(open, 'alike-seed', hosted);
    const joinGroup = await messageGroupReplica(open, 'alike-join', {});
    assert.deepEqual(
      primitivesArmedBy(() => seedGroup.scheduleRaftPeerReconciliation()),
      primitivesArmedBy(() => joinGroup.scheduleRaftPeerReconciliation()),
      'and so do the message-group replicas the same node hosts');
  }));

test('a supplied clock still owns hosted replica and reconciler scheduling',
  () => withHostedReplicas(async (open) => {
    const clock = new SuppliedClock();
    const bootstrap = suppliedClockBootstrapService(clock);
    const authorities =
      resolveHostedReplicaAuthorities(bootstrap.seedPartitionsPhase.delegates);
    assert.equal(authorities.timeSource, clock,
      'a runtime that owns a clock hands that clock to its replicas');

    const {armed, clockArms} = await consensusScheduling(open, 'supplied',
      authorities, () => armedCount(clock));
    assert.deepEqual(armed, NO_HOST_PRIMITIVE,
      'consensus scheduling never reaches for a host primitive');
    assert.equal(clockArms > NO_CLOCK_ARMS, true,
      'consensus scheduling is armed on the supplied clock');

    const partition = await startPartitionReplica(open, 'supplied', authorities);
    const beforeHops = zeroDelayArmCount(clock);
    assert.deepEqual(
      primitivesArmedBy(() => partition.scheduleRaftPeerReconciliation()),
      NO_HOST_PRIMITIVE,
      'the peer-reconciliation hop never reaches for a host primitive');
    assert.deepEqual(
      primitivesArmedBy(() => partition.scheduleSizeUpdate()),
      NO_HOST_PRIMITIVE, 'and neither does the size-update hop');
    assert.equal(zeroDelayArmCount(clock) - beforeHops, HOP_COUNT_PER_REPLICA,
      'both hops were taken on the supplied clock');
    await closeReplica(open, partition);

    const group = await messageGroupReplica(open, 'supplied', authorities);
    assert.deepEqual(
      primitivesArmedBy(() => group.scheduleRaftPeerReconciliation()),
      NO_HOST_PRIMITIVE,
      'a message-group replica hops on the supplied clock too');

    await bootstrap.seedInfrastructurePhase.initializeUnifiedLifecycleOwners();
    try {
      const beforeTurns = zeroDelayArmCount(clock);
      const armed = await primitivesArmedByAwaited(() =>
        executePlannedActions(bootstrap.serviceReconciler));
      assert.equal(armed.includes(SET_IMMEDIATE), false,
        'the reconciler takes no per-action turn on the host');
      assert.equal(zeroDelayArmCount(clock) - beforeTurns, PLANNED_ACTION_COUNT,
        'it takes one turn per action on the supplied clock');
    } finally {
      bootstrap.seedInfrastructurePhase.stopUnifiedLifecycleOwners();
    }
  }));

// One real event-loop turn per action is the point of the boundary: replica
// creation is long synchronous work whose awaits resolve as microtasks, and
// without a macrotask between actions a bootstrap batch starves the node's
// own timers. setImmediate is that boundary in production.
test('a production reconciler takes each per-action turn on setImmediate',
  async () => {
    LoggingService.getInstance().initialize({level: LOG_LEVEL});
    const bootstrap = productionBootstrapService();
    const phase = bootstrap.seedInfrastructurePhase;
    await phase.initializeUnifiedLifecycleOwners();
    try {
      assert.deepEqual(
        await primitivesArmedByAwaited(() =>
          executePlannedActions(bootstrap.serviceReconciler)),
        EXPECTED_TURNS,
        'the reconciler the seed path builds yields on setImmediate');
    } finally {
      phase.stopUnifiedLifecycleOwners();
    }

    assert.deepEqual(
      await primitivesArmedByAwaited(() =>
        executePlannedActions(unclockedReconciler())),
      EXPECTED_TURNS,
      'and so does one built with no clock offered');
  });
