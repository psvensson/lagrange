// Receipt tests for quest single-readiness-owner: one node process owns
// exactly ONE ControlPlaneReadinessService (and one
// ReadinessPlanningSnapshotOwner), composed by the node composition owner
// (ControlPlaneSetup.create) and handed to the node-scoped
// RebalanceCoordinator container; every partition rebalancer consumes that
// instance through the real composition path. Before this quest each
// UnifiedRebalancer constructed a private readiness service, adopted the
// container's one afterwards, and left the private one alive — measured on
// the seed as 52 planning owners, 51 serving no reads while doing 57.7k
// rebuilds and 52x the cache-change fan-out.
import {test} from '../../src/test-helpers/tap.js';
import {
  ControlPlaneSetup,
} from '../../src/bootstrap/shared/control-plane-setup.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {UnifiedRebalancer} from '../../src/rebalancer/unified-rebalancer.js';
import {
  ControlPlaneReadinessService,
} from '../../src/control-plane/control-plane-readiness-service.js';
import {
  ReadinessPlanningSnapshotOwner,
} from '../../src/control-plane/readiness-planning-snapshot-owner.js';
import {
  COLUMN,
  NODE_STATE,
  STATE,
  TABLES,
} from '../../src/constants/index.js';
import {
  CONTROL_PLANE_PUBLICATION_MODE,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  createActiveNode,
  createMessageGroupService,
  createPublicationService,
} from './control-plane-readiness-service-test-support.js';

const SEED = 'node-0';
const JOINER = 'node-1';
const TRANSITIONAL = 'node-2';
const NODE_ADDRESS = 'ws://127.0.0.1:1';
const PARTITION_ENTITY_TYPE = 'partition';
const MANY_PARTITIONS = 50;
const FEW_PARTITIONS = 1;
const CHURN_WRITES = 20;
const CLOCK_START_MS = 350000;
const LEASE_HORIZON_MS = 60000;
const EXPIRED_LEASE_AGE_MS = LEASE_HORIZON_MS + 1000;
const EMPTY_ROWS = Object.freeze([]);

function flushListeners() {
  return new Promise((resolve) => setImmediate(resolve));
}

// Drain every planning owner's reconcile queue (one owner key per
// setImmediate drain) so the reads below compare COMPLETED snapshots, not
// the deferred refresh-pending contract.
async function drainPlanning(...services) {
  const MAX_DRAIN_TICKS = 200;
  for (let tick = 0; tick < MAX_DRAIN_TICKS; tick += 1) {
    await flushListeners();
    const busy = services.some((service) => {
      const queue = service.readinessPlanningSnapshotOwner.queue;
      return queue.pending.size > 0 || queue.inFlight.size > 0;
    });
    if (!busy) return;
  }
  throw new Error('planning queues did not drain');
}

// The stub surface ControlPlaneSetup.create needs: no runtime access policy,
// no SQL engine, no live transport — the composition edges under test are
// setup -> coordinator -> rebalancer, all of which run for real.
function buildRuntimeStubs() {
  const transactionCoordinator = {
    async begin() {
      return {success: true};
    },
    async commit() {
      return {success: true};
    },
    async rollback() {
      return {success: true};
    },
  };
  const noop = () => {};
  const sqlQueryEngine = {
    async executeQuery() {
      return {success: true, rows: EMPTY_ROWS, affectedRows: 0};
    },
    transactionCoordinator,
    setRuntimeAccessPolicyOwner: noop,
    setInstallableServiceArtifactResolver: noop,
    setServiceLifecycleCommandOwner: noop,
    setSchemaAdmissionOwner: noop,
    setPartitionRouter: noop,
    setControlPlaneReadinessService: noop,
    setReplicaDispatchService: noop,
  };
  const cdcIntegrationService = {
    sqlQueryEngine,
    async waitForCacheUpdate() {},
    async executeAuthoritativeSystemTableRead() {
      return {success: true, rows: EMPTY_ROWS, affectedRows: 0};
    },
    on: noop, off: noop, subscribe: () => noop,
  };
  const messageRouter = {
    getConnectionState: () => STATE.CONNECTED,
    getConnectedNodes: () => new Set(),
    on: noop, off: noop, registerHandler: noop,
    send: async () => ({}),
    getNodeId: () => SEED,
  };
  const tablePolicyService = {getPolicy: () => null, resolveTablePolicy: () => null};
  const cdcGroupPropagationService = createPublicationService({
    currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
    reasonCode: null,
    enteredAt: '2026-09-04T00:00:00.000Z',
    recentTransitions: [],
  });
  return {
    sqlQueryEngine, cdcIntegrationService, messageRouter, tablePolicyService,
    cdcGroupPropagationService,
  };
}

function nodeRow(nodeId, nowMs, overrides = {}) {
  return {
    ...createActiveNode(nodeId),
    [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
    [COLUMN.LAST_HEARTBEAT]: nowMs - 100,
    [COLUMN.READY_LEASE_EXPIRES_AT]: nowMs + LEASE_HORIZON_MS,
    ...overrides,
  };
}

function seedCache(nowMs) {
  const cache = new SystemTableCache();
  for (const nodeId of [SEED, JOINER]) {
    cache.applySystemTableChange(TABLES.NODES, 'INSERT', nodeRow(nodeId, nowMs));
    cache.applySystemTableChange(TABLES.SERVICES, 'INSERT',
      createMessageGroupService(nodeId));
  }
  cache.applySystemTableChange(TABLES.NODES, 'INSERT',
    nodeRow(TRANSITIONAL, nowMs, {[COLUMN.STATUS]: NODE_STATE.JOINING}));
  return cache;
}

// The real node composition owner: ControlPlaneSetup.create builds ONE
// readiness service and hands it to the RebalanceCoordinator container.
async function composeNode(cache, stubs) {
  const setup = await ControlPlaneSetup.create({
    nodeId: SEED,
    nodeAddress: NODE_ADDRESS,
    messageRouter: stubs.messageRouter,
    cdcIntegrationService: stubs.cdcIntegrationService,
    cdcGroupPropagationService: stubs.cdcGroupPropagationService,
    systemTableCache: cache,
    tablePolicyService: stubs.tablePolicyService,
    messageGroupServices: new Map(),
  });
  return setup;
}

// The node owner's teardown as the seed/join cleanup handlers perform it.
async function teardownNode(setup) {
  setup.dispatchService.stop();
  await setup.rebalanceCoordinator.shutdown();
}

// Exactly the option set partition-service-rebalancer-methods.js passes.
function attachPartitionRebalancer(index, cache, stubs, coordinator) {
  const rebalancer = new UnifiedRebalancer({
    entityId: `partition-${index}`,
    entityType: PARTITION_ENTITY_TYPE,
    systemTableCache: cache,
    cdcIntegrationService: stubs.cdcIntegrationService,
    tablePolicyService: stubs.tablePolicyService,
    sqlQueryEngine: stubs.sqlQueryEngine,
    nodeId: SEED,
    replicaId: `replica-${index}`,
    messageRouter: stubs.messageRouter,
    rebalanceCoordinator: coordinator,
  });
  rebalancer.initialize();
  return rebalancer;
}

function readinessListenerCount(cache) {
  // Every readiness service subscribes exactly one listener (its
  // cacheChangeListener); other node services subscribe their own.
  return cache.listeners.size;
}

// Count readiness-service cache-change invocations through the REAL
// subscription path (the listener registered by subscribeToCacheChanges).
function spyCacheChangeInvocations() {
  const proto = ControlPlaneReadinessService.prototype;
  const original = proto.handleCacheChange;
  const calls = {count: 0, services: new Set()};
  proto.handleCacheChange = function(tableName, record) {
    calls.count += 1;
    calls.services.add(this);
    return original.call(this, tableName, record);
  };
  return {calls, restore: () => {
    proto.handleCacheChange = original;
  }};
}

// Count planning rebuilds per owner INSTANCE through the real reconcile
// path, so owners no consumer can reach any more (the pre-quest leak) are
// still observed.
function spyPlanningRebuilds() {
  const proto = ReadinessPlanningSnapshotOwner.prototype;
  const original = proto.reconcile;
  const buildsByOwner = new Map();
  proto.reconcile = function(ownerKey, context) {
    buildsByOwner.set(this, (buildsByOwner.get(this) || 0) + 1);
    return original.call(this, ownerKey, context);
  };
  return {buildsByOwner, restore: () => {
    proto.reconcile = original;
  }};
}

// ---- O1 + O2: one construction, every consumer the same instance ----------

test('O1/O2: on the real composition path a process hosting many partitions ' +
  'constructs exactly one readiness service and every partition rebalancer ' +
  'consumes that same instance', async (t) => {
  const stubs = buildRuntimeStubs();
  const cache = seedCache(CLOCK_START_MS);
  const setup = await composeNode(cache, stubs);
  const coordinator = setup.rebalanceCoordinator;
  const service = coordinator.controlPlaneReadinessService;
  t.ok(service instanceof ControlPlaneReadinessService,
    'the composition owner handed the container a readiness service');
  const listenersAfterCompose = readinessListenerCount(cache);
  const rebalancers = [];
  for (let index = 0; index < MANY_PARTITIONS; index += 1) {
    rebalancers.push(attachPartitionRebalancer(index, cache, stubs, coordinator));
  }
  t.equal(readinessListenerCount(cache), listenersAfterCompose,
    `${MANY_PARTITIONS} partition rebalancers added zero cache listeners — ` +
    'no readiness service was constructed per rebalancer');
  for (const rebalancer of rebalancers) {
    t.equal(rebalancer.controlPlaneReadinessService, service,
      `${rebalancer.entityId}: r.controlPlaneReadinessService === container's`);
    t.equal(rebalancer.ownsControlPlaneReadinessService, false,
      `${rebalancer.entityId}: consumes, does not own`);
  }
  const owners = new Set(rebalancers.map((r) =>
    r.controlPlaneReadinessService.readinessPlanningSnapshotOwner));
  t.equal(owners.size, 1, 'one ReadinessPlanningSnapshotOwner across all rebalancers');
  t.equal([...owners][0], service.readinessPlanningSnapshotOwner,
    'and it is the container service\'s planning owner');
  t.equal(setup.dispatchService.controlPlaneReadinessService, service,
    'the replica dispatch service consumes the same instance');
  for (const rebalancer of rebalancers) rebalancer.shutdown();
  await teardownNode(setup);
  t.end();
});

// ---- O3: semantics unchanged ------------------------------------------------

// Null-safe field read without optional chains (each `?.`/`??` is a branch
// for the complexity ratchet).
function pick(record, key) {
  return record && record[key] !== undefined ? record[key] : null;
}

function readReasonCodes(snapshot) {
  const reasons = pick(snapshot, 'reasons');
  if (!Array.isArray(reasons)) {
    return pick(snapshot, 'reasonCodes');
  }
  return reasons.map((reason) => pick(reason, 'code') || reason);
}

function decisionSurface(snapshot) {
  const contract = pick(snapshot, 'projectionReadinessContract');
  const readiness = pick(contract, 'readiness');
  return JSON.stringify({
    dimensions: pick(snapshot, 'dimensions'),
    reasonCodes: readReasonCodes(snapshot),
    state: pick(contract, 'state'),
    serve: pick(readiness, 'serveEligible'),
    recovery: pick(readiness, 'recoveryEligible'),
    repair: pick(readiness, 'repairEligible'),
    missing: pick(snapshot, 'missingNodeReadinessState'),
  });
}

test('O3: sharing the node service changes no readiness decision — two ' +
  'identical compositions agree, and attaching 50 partition consumers to one ' +
  'of them alters neither its dependencies nor any decision across seed, ' +
  'joiner, transitional membership, planning refresh, reuse and live veto',
async (t) => {
  // Two processes of the same node identity with identical inputs and one
  // virtual clock: A hosts 50 partition consumers, B hosts none.
  const clock = new VirtualTimeSource({startMs: CLOCK_START_MS});
  const stubsA = buildRuntimeStubs();
  const stubsB = buildRuntimeStubs();
  const cacheA = seedCache(CLOCK_START_MS);
  const cacheB = seedCache(CLOCK_START_MS);
  const setupA = await composeNode(cacheA, stubsA);
  const setupB = await composeNode(cacheB, stubsB);
  const serviceA = setupA.rebalanceCoordinator.controlPlaneReadinessService;
  const serviceB = setupB.rebalanceCoordinator.controlPlaneReadinessService;
  serviceA.timeSource = clock;
  serviceB.timeSource = clock;
  const dependencyNames = [
    'systemTableCache', 'cacheMutationTarget', 'messageRouter',
    'cdcIntegrationService', 'cdcGroupPropagationService', 'nodesOwner',
    'servicesOwner', 'heartbeatService', 'membershipPublicationService',
    'controlPlaneSystemTableGateway', 'storageAccountingService',
  ];
  const dependenciesBefore = dependencyNames.map((name) => serviceA[name]);
  const rebalancers = [];
  for (let index = 0; index < MANY_PARTITIONS; index += 1) {
    rebalancers.push(attachPartitionRebalancer(index, cacheA, stubsA,
      setupA.rebalanceCoordinator));
  }
  dependencyNames.forEach((name, index) => {
    t.equal(serviceA[name], dependenciesBefore[index],
      `attaching consumers left the node service's ${name} untouched`);
    t.ok(serviceA[name] !== null && serviceA[name] !== undefined,
      `${name} is still wired`);
  });
  const consumer = rebalancers[MANY_PARTITIONS - 1].controlPlaneReadinessService;
  const REFRESH_PENDING = 'planning_snapshot_refresh_pending';
  const applyToBoth = (tableName, row) => {
    cacheA.applySystemTableChange(tableName, 'UPDATE', row);
    cacheB.applySystemTableChange(tableName, 'UPDATE', row);
  };
  const compare = async (label, nodeId, options = {}) => {
    // first read registers the build variant; the drained re-read is the
    // completed decision
    consumer.getNodeReadinessSync(nodeId, options);
    serviceB.getNodeReadinessSync(nodeId, options);
    await drainPlanning(serviceA, serviceB);
    const viaConsumer = consumer.getNodeReadinessSync(nodeId, options);
    const viaContainer = serviceA.getNodeReadinessSync(nodeId, options);
    const b = serviceB.getNodeReadinessSync(nodeId, options);
    t.equal(viaConsumer, viaContainer,
      `${label}: a partition consumer reads the container's own snapshot`);
    const surface = decisionSurface(viaContainer);
    t.equal(surface, decisionSurface(b),
      `${label}: same decision with and without 50 consumers attached`);
    t.equal(surface.includes(REFRESH_PENDING), false,
      `${label}: compared a completed decision, not the deferred contract`);
    return [viaContainer, b];
  };
  const [seed] = await compare('seed', SEED);
  t.equal(seed.dimensions.processAlive, true, 'seed decision is live');
  await compare('joiner', JOINER);
  const [transitional] = await compare('transitional membership', TRANSITIONAL);
  t.equal(transitional.dimensions.clusterMemberHealthy, false,
    'transitional membership is not a healthy cluster member');
  // planning refresh: an authoritative change invalidates the completed
  // snapshot; both owners must rebuild to the same decision
  applyToBoth(TABLES.SERVICES,
    {...createMessageGroupService(JOINER), updated_at: CLOCK_START_MS + 5});
  const [refreshed] = await compare('planning refresh after a source change', JOINER);
  // completed-snapshot reuse: an unchanged re-read returns the same frozen
  // snapshot object
  const [reused] = await compare('reuse', JOINER);
  t.equal(reused, refreshed, 'the shared owner reuses its completed snapshot');
  t.equal(consumer.getNodeReadinessSync(JOINER, {}), reused,
    'and every consumer reuses that same snapshot');
  // live veto: the ready lease and heartbeat evidence age past their bounds
  // with no source change — both owners veto the completed snapshot
  // identically and rebuild to the same negative decision
  t.equal(reused.nodeEvidence.readyNow, true, 'joiner is ready before aging');
  clock.advance(EXPIRED_LEASE_AGE_MS);
  const [vetoed] = await compare('live veto (lease and heartbeat aged out)', JOINER);
  t.equal(vetoed.nodeEvidence.readyNow, false,
    'aged lease evidence vetoes the completed positive decision');
  t.not(vetoed, reused, 'the vetoed read is a rebuilt snapshot');
  for (const rebalancer of rebalancers) rebalancer.shutdown();
  await teardownNode(setupA);
  await teardownNode(setupB);
  t.end();
});

// ---- O4: subscriptions owned once -----------------------------------------

test('O4: one cache change causes exactly one readiness-owner listener ' +
  'invocation in a process hosting many partitions', async (t) => {
  const stubs = buildRuntimeStubs();
  const cache = seedCache(CLOCK_START_MS);
  const setup = await composeNode(cache, stubs);
  const coordinator = setup.rebalanceCoordinator;
  const rebalancers = [];
  for (let index = 0; index < MANY_PARTITIONS; index += 1) {
    rebalancers.push(attachPartitionRebalancer(index, cache, stubs, coordinator));
  }
  const spy = spyCacheChangeInvocations();
  try {
    cache.applySystemTableChange(TABLES.NODES, 'UPDATE', {
      [COLUMN.NODE_ID]: JOINER,
      [COLUMN.LAST_HEARTBEAT]: CLOCK_START_MS + 7,
      updated_at: CLOCK_START_MS + 7,
    });
    await flushListeners();
  } finally {
    spy.restore();
  }
  t.equal(spy.calls.count, 1,
    `one source change -> one readiness cache-change invocation (not ${MANY_PARTITIONS + 1})`);
  t.equal(spy.calls.services.size, 1, 'served by exactly one readiness service');
  t.equal([...spy.calls.services][0], coordinator.controlPlaneReadinessService,
    'which is the container\'s node-owned service');
  for (const rebalancer of rebalancers) rebalancer.shutdown();
  await teardownNode(setup);
  t.end();
});

// ---- O5: lifecycle cleanup --------------------------------------------------

test('O5: shutting down and reconstructing the node owner unsubscribes the ' +
  'old service, stops its planning queue, and constructs the new one exactly ' +
  'once with no duplicate listener', async (t) => {
  const stubs = buildRuntimeStubs();
  const cache = seedCache(CLOCK_START_MS);
  const listenersBefore = readinessListenerCount(cache);
  const first = await composeNode(cache, stubs);
  const oldService = first.rebalanceCoordinator.controlPlaneReadinessService;
  const oldListener = oldService.cacheChangeListener;
  t.ok(cache.listeners.has(oldListener), 'the old service is subscribed');
  const listenersLive = readinessListenerCount(cache);
  await teardownNode(first);
  t.equal(oldService.isShutDown, true, 'the container shut the service down');
  t.equal(cache.listeners.has(oldListener), false,
    'the old service\'s listener is off the cache');
  t.equal(oldService.cacheChangeListener, null, 'no listener retained');
  t.equal(oldService.readinessPlanningSnapshotOwner.queue.stopped, true,
    'the planning queue is stopped');
  t.equal(readinessListenerCount(cache), listenersBefore,
    'every node-owner listener is gone after teardown');
  // A late dependency sync on the dead service must not resubscribe it.
  oldService.syncOwnerDependencies({systemTableCache: new SystemTableCache()});
  t.equal(oldService.cacheChangeListener, null,
    'a dead service never resubscribes (no singleton-by-leak)');
  const second = await composeNode(cache, stubs);
  const newService = second.rebalanceCoordinator.controlPlaneReadinessService;
  t.not(newService, oldService, 'reconstruction built a new service');
  t.equal(readinessListenerCount(cache), listenersLive,
    'listener count returned to the live count — exactly one readiness ' +
    'listener again');
  t.ok(cache.listeners.has(newService.cacheChangeListener),
    'the new service is subscribed');
  const spy = spyCacheChangeInvocations();
  try {
    cache.applySystemTableChange(TABLES.NODES, 'UPDATE', {
      [COLUMN.NODE_ID]: JOINER,
      [COLUMN.LAST_HEARTBEAT]: CLOCK_START_MS + 9,
      updated_at: CLOCK_START_MS + 9,
    });
    await flushListeners();
  } finally {
    spy.restore();
  }
  t.equal(spy.calls.count, 1, 'one change -> one readiness invocation after restart');
  t.equal([...spy.calls.services][0], newService,
    'served by the new service, never the old one');
  await teardownNode(second);
  t.equal(readinessListenerCount(cache), listenersBefore,
    'after the second teardown every node listener is gone');
  t.end();
});

// ---- O6: partition lifecycle never owns the node service ------------------

test('O6: creating, shutting down and re-creating partition rebalancers never ' +
  'creates, resets or destroys the node-level readiness service', async (t) => {
  const stubs = buildRuntimeStubs();
  const cache = seedCache(CLOCK_START_MS);
  const setup = await composeNode(cache, stubs);
  const coordinator = setup.rebalanceCoordinator;
  const service = coordinator.controlPlaneReadinessService;
  const owner = service.readinessPlanningSnapshotOwner;
  const listeners = readinessListenerCount(cache);
  const warm = service.getNodeReadinessSync(SEED, {});
  for (let round = 0; round < 3; round += 1) {
    const batch = [];
    for (let index = 0; index < 10; index += 1) {
      batch.push(attachPartitionRebalancer(round * 10 + index, cache, stubs, coordinator));
    }
    for (const rebalancer of batch) rebalancer.shutdown();
  }
  t.equal(coordinator.controlPlaneReadinessService, service,
    'the container still holds the same service');
  t.not(service.isShutDown, true, 'partition shutdowns did not shut it down');
  t.equal(service.readinessPlanningSnapshotOwner, owner,
    'the planning owner was not reset');
  t.equal(readinessListenerCount(cache), listeners,
    'listener count unchanged across 30 partition lifecycles');
  t.equal(service.getNodeReadinessSync(SEED, {}), warm,
    'the completed snapshot survived every partition lifecycle');
  await teardownNode(setup);
  t.end();
});

// ---- ENGAGEMENT / BOUNDED-WORK ---------------------------------------------

async function planningWorkUnderChurn(partitionCount) {
  const stubs = buildRuntimeStubs();
  const cache = seedCache(CLOCK_START_MS);
  const setup = await composeNode(cache, stubs);
  const coordinator = setup.rebalanceCoordinator;
  const service = coordinator.controlPlaneReadinessService;
  const rebalancers = [];
  for (let index = 0; index < partitionCount; index += 1) {
    rebalancers.push(attachPartitionRebalancer(index, cache, stubs, coordinator));
  }
  const spy = spyCacheChangeInvocations();
  const rebuildSpy = spyPlanningRebuilds();
  const buildsBefore = service.readinessPlanningSnapshotOwner.buildCount;
  try {
    for (let write = 1; write <= CHURN_WRITES; write += 1) {
      cache.applySystemTableChange(TABLES.SERVICES, 'UPDATE', {
        ...createMessageGroupService(JOINER),
        updated_at: CLOCK_START_MS + write,
        load_hint: write,
      });
      await flushListeners();
      service.getNodeReadinessSync(SEED, {});
      service.getNodeReadinessSync(JOINER, {});
      await flushListeners();
      await flushListeners();
    }
    await drainPlanning(service);
  } finally {
    spy.restore();
    rebuildSpy.restore();
  }
  const nodeOwner = service.readinessPlanningSnapshotOwner;
  let unusedOwnerBuilds = 0;
  for (const [owner, builds] of rebuildSpy.buildsByOwner) {
    if (owner !== nodeOwner) unusedOwnerBuilds += builds;
  }
  const result = {
    listenerInvocations: spy.calls.count,
    servicesInvoked: spy.calls.services.size,
    planningBuilds: nodeOwner.buildCount - buildsBefore,
    // every owner instance that rebuilt under churn, reachable or not
    planningOwners: rebuildSpy.buildsByOwner.size,
    unusedOwnerBuilds,
  };
  for (const rebalancer of rebalancers) rebalancer.shutdown();
  await teardownNode(setup);
  return result;
}

test('ENGAGEMENT: under source churn a process hosting many partitions runs ' +
  'one planning owner, zero unused-owner rebuilds and one cache-change ' +
  'fan-out per source change — reds if per-rebalancer construction returns',
async (t) => {
  const many = await planningWorkUnderChurn(MANY_PARTITIONS);
  t.equal(many.planningOwners, 1, 'one planning owner across 50 partitions');
  t.equal(many.unusedOwnerBuilds, 0, 'zero rebuilds by unused owners');
  t.equal(many.listenerInvocations, CHURN_WRITES,
    `${CHURN_WRITES} source changes -> ${CHURN_WRITES} readiness listener ` +
    `invocations (not ${CHURN_WRITES * (MANY_PARTITIONS + 1)})`);
  t.equal(many.servicesInvoked, 1, 'all served by the one node service');
  t.ok(many.planningBuilds > 0, 'the one owner actually rebuilt under churn');
  t.end();
});

test('BOUNDED-WORK: readiness planning work scales with authoritative changes, ' +
  'not with the number of hosted partitions', async (t) => {
  const few = await planningWorkUnderChurn(FEW_PARTITIONS);
  const many = await planningWorkUnderChurn(MANY_PARTITIONS);
  t.equal(many.planningBuilds, few.planningBuilds,
    `planning rebuilds with ${MANY_PARTITIONS} partitions (${many.planningBuilds}) ` +
    `== with ${FEW_PARTITIONS} (${few.planningBuilds})`);
  t.equal(many.listenerInvocations, few.listenerInvocations,
    'cache-change fan-out is independent of partition count');
  t.equal(many.unusedOwnerBuilds + few.unusedOwnerBuilds, 0,
    'no unused owner did any work in either shape');
  t.end();
});
