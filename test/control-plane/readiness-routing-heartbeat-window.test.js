import {test} from 'node:test';
import assert from 'node:assert/strict';

import {QueryExecutor} from '../../src/query/query-executor.js';
import {createMockMessageRouter} from '../query/query-executor-test-support.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {
  CDC_OPERATION,
  COLUMN,
  SERVICE_STATUS,
  SERVICE_TYPE,
  TABLES,
} from '../../src/constants/index.js';
import {CONTROL_PLANE_PUBLICATION_MODE} from
  '../../src/control-plane/control-plane-readiness-constants.js';
import {ControlPlaneReadinessService} from
  '../../src/control-plane/control-plane-readiness-service.js';
import {MembershipPublicationCoordinatorReads} from
  '../../src/control-plane/membership-publication-coordinator-reads.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';

// Production-shaped witness for the readiness-routing-cache-lag-bridge
// quest: the REAL SystemTableCache, the real readiness service with its
// single planning owner, and the real QueryExecutor. The cache has two
// change channels: the apply channel (onCacheApplyChange) classifies every
// applied revision into the planning owner synchronously, in the applying
// turn, so admission never sees an applied revision as unclassified; the
// deferred channel (onCacheChange, one macrotask later) still records
// liveness/capacity and invalidates stored readiness snapshots. Between the
// two, a change is applied and classified but its deferred delivery is
// pending: the stored-reuse witnesses have not yet learned of it. The
// routed-read bridge is therefore gated on the planning owner's
// deferred-delivery frontier: nothing beyond the nodes table may be pending
// there. A fresh heartbeat must never close routing to the node: not in the
// applying turn, not after its deferred delivery, not across the queued
// owner rebuilds; a non-nodes change never rides the bridge while its
// deferred delivery is pending; and routing stops exactly when the ready
// lease expires.

ConfigurationManager.getInstance().initialize();

const NODE_ID = 'node-heartbeat-window';
const SERVICE_ID = 'p1-r1';
const PARTITION_ID = 'p1';
const MESSAGE_GROUP_SERVICE_ID = 'mg-1';
const INACTIVE_STATUS = 'inactive';
const PEER_NODE_ID = 'node-heartbeat-peer';
const PUBLICATION_ID = 'pub-1';
const PUBLISHED_STATUS = 'PUBLISHED';
const ABANDONED_STATUS = 'ABANDONED';
const SATURATED_LOAD_PERCENT = 100;
const START_MS = 300000;
const LEASE_MS = 15000;
const PUBLICATION_ISO = new Date(START_MS).toISOString();
const HEARTBEAT_AGE_MS = 100;
const MACROTASK_ROUNDS = 4;
const MACROTASK_STEP_MS = 100;
const HEARTBEAT_STEP_MS = 5000;
const STALE_HEARTBEAT_MS = 31000;

function tick() {
  return new Promise((resolve) => setImmediate(resolve));
}

function macrotask() {
  return new Promise((resolve) => setTimeout(resolve, 15));
}

function createRig() {
  const clock = {now: START_MS};
  const lease = START_MS + LEASE_MS;
  const cache = new SystemTableCache();
  cache.applySystemTableChange(TABLES.NODES, CDC_OPERATION.INSERT, {
    [COLUMN.NODE_ID]: NODE_ID,
    [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    [COLUMN.CONNECTION_STATE]: 'ready',
    [COLUMN.READY_LEASE_EXPIRES_AT]: lease,
    [COLUMN.LAST_HEARTBEAT]: START_MS - HEARTBEAT_AGE_MS,
    [COLUMN.CPU_USAGE_PERCENT]: 10,
    [COLUMN.MEMORY_USAGE_PERCENT]: 10,
    [COLUMN.DISK_USAGE_PERCENT]: 10,
  });
  cache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.INSERT, {
    [COLUMN.SERVICE_ID]: SERVICE_ID,
    [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
    partition_id: PARTITION_ID,
    [COLUMN.NODE_ID]: NODE_ID,
    [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    [COLUMN.ADDRESS]: `${NODE_ID}/partition/${PARTITION_ID}`,
  });
  cache.applySystemTableChange(TABLES.NODES, CDC_OPERATION.INSERT, {
    [COLUMN.NODE_ID]: PEER_NODE_ID,
    [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    [COLUMN.CONNECTION_STATE]: 'ready',
    [COLUMN.READY_LEASE_EXPIRES_AT]: lease,
    [COLUMN.LAST_HEARTBEAT]: START_MS - HEARTBEAT_AGE_MS,
    [COLUMN.CPU_USAGE_PERCENT]: 10,
    [COLUMN.MEMORY_USAGE_PERCENT]: 10,
    [COLUMN.DISK_USAGE_PERCENT]: 10,
  });
  cache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.INSERT, {
    [COLUMN.SERVICE_ID]: MESSAGE_GROUP_SERVICE_ID,
    [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.MESSAGE_GROUP,
    [COLUMN.NODE_ID]: NODE_ID,
    [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    [COLUMN.ADDRESS]: `${NODE_ID}/mg/1`,
  });
  // A published cluster-membership row that names both nodes, so the real
  // publication reader feeds the serve lane; an ABANDONED transition whose
  // deferred delivery is pending must never be bridged.
  cache.applySystemTableChange(TABLES.CONTROL_PLANE_PUBLICATIONS,
    CDC_OPERATION.INSERT, {
      publication_id: PUBLICATION_ID,
      publication_kind: 'cluster_membership',
      publication_epoch: 1,
      publisher_node_id: 'seed-node',
      source_topology_epoch: 1,
      source_snapshot_version: 1,
      published_active_node_ids: JSON.stringify([NODE_ID, PEER_NODE_ID]),
      required_ack_node_ids: '[]',
      acknowledged_node_ids: '[]',
      status: PUBLISHED_STATUS,
      created_at: PUBLICATION_ISO,
      updated_at: PUBLICATION_ISO,
      published_at: PUBLICATION_ISO,
      transition_history: '[]',
    });
  const membershipPublicationService = new MembershipPublicationCoordinatorReads({
    nodeId: 'seed-node',
    systemTableCache: cache,
  });
  const readinessService = new ControlPlaneReadinessService({
    nodeId: 'seed-node',
    systemTableCache: cache,
    membershipPublicationService,
    cdcGroupPropagationService: {
      getPublicationModeDiagnostics: () => ({
        currentMode: CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
        reasonCode: null,
        enteredAt: '2026-03-04T00:00:00.000Z',
        recentTransitions: [],
      }),
    },
    now: () => clock.now,
  });
  const executor = new QueryExecutor({
    messageRouter: createMockMessageRouter(),
    systemCache: cache,
    controlPlaneReadinessService: readinessService,
  });
  const service = {
    service_id: SERVICE_ID,
    service_type: 'partition',
    partition_id: PARTITION_ID,
    node_id: NODE_ID,
    address: `${NODE_ID}/partition/${PARTITION_ID}`,
    status: 'active',
  };
  return {cache, clock, lease, readinessService, executor,
    route: () => executor.isRoutablePartitionService(service)};
}

function planningOwner(rig) {
  return rig.readinessService.readinessPlanningSnapshotOwner;
}

// The bridge's own gate: some non-nodes table has an applied revision whose
// deferred delivery the readiness service has not processed yet.
function nonNodeDeliveryPending(rig) {
  const owner = planningOwner(rig);
  return owner.hasNonNodeTableDeferredDeliveryPending(
    owner.readCurrentSourceObservation());
}

// The frontier for one table: true while an applied revision of it has not
// been delivered on the deferred channel.
function deliveryPending(rig, tableName) {
  const tracker = planningOwner(rig).semanticGenerationTracker;
  return tracker.deferredDeliveredSourceRevisions[tableName] !==
    rig.cache.getTableMutationVersion(tableName);
}

function unclassified(rig) {
  return planningOwner(rig).hasUnclassifiedSourceChange();
}

function deactivateMessageGroup(rig) {
  rig.cache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.UPDATE, {
    [COLUMN.SERVICE_ID]: MESSAGE_GROUP_SERVICE_ID,
    [COLUMN.STATUS]: INACTIVE_STATUS,
  });
}

function abandonPublication(rig) {
  rig.cache.applySystemTableChange(TABLES.CONTROL_PLANE_PUBLICATIONS,
    CDC_OPERATION.UPDATE, {publication_id: PUBLICATION_ID,
      status: ABANDONED_STATUS});
}

function renewingHeartbeat(rig) {
  rig.cache.applySystemTableChange(TABLES.NODES, CDC_OPERATION.UPDATE, {
    [COLUMN.NODE_ID]: NODE_ID,
    [COLUMN.LAST_HEARTBEAT]: rig.clock.now,
    [COLUMN.READY_LEASE_EXPIRES_AT]: rig.clock.now + LEASE_MS,
  });
}

async function settledRig(t) {
  const rig = createRig();
  t.after(() => rig.readinessService.shutdown?.());
  await tick();
  assert.equal(rig.route(), true, 'the bootstrap read routes');
  await tick();
  await tick();
  // Settle: the owner has built, persisted, and drained once, so stored
  // evidence exists for the bridge to consult.
  await macrotask();
  await macrotask();
  assert.equal(rig.route(), true, 'settled state routes');
  assert.equal(nonNodeDeliveryPending(rig), false,
    'settled: no deferred delivery is pending');
  return rig;
}

test('a fresh heartbeat never closes routing: applying turn, after its ' +
  'deferred delivery, queued rebuilds', async (t) => {
  const rig = createRig();
  t.after(() => rig.readinessService.shutdown?.());
  await tick();
  assert.equal(rig.route(), true, 'the bootstrap read routes');
  await tick();
  await tick();
  renewingHeartbeat(rig);
  assert.equal(unclassified(rig), false,
    'the apply channel classified the heartbeat in the applying turn');
  assert.equal(deliveryPending(rig, TABLES.NODES), true,
    'the heartbeat\'s deferred delivery is still pending');
  assert.equal(nonNodeDeliveryPending(rig), false,
    'nothing beyond the nodes table is pending: the bridge stays open');
  assert.equal(rig.route(), true,
    'the applying-turn read routes while the deferred delivery is pending');
  await tick();
  assert.equal(deliveryPending(rig, TABLES.NODES), false,
    'the deferred delivery caught the frontier up');
  assert.equal(rig.route(), true,
    'the read after the heartbeat\'s deferred delivery routes');
  for (let round = 0; round < MACROTASK_ROUNDS; round += 1) {
    await macrotask();
    rig.clock.now += MACROTASK_STEP_MS;
    assert.equal(rig.route(), true,
      `queued owner rebuild ${round + 1} keeps the replica routable`);
  }
});

test('a completed snapshot already stale on another table is never served ' +
  'through the nodes-only bridge while a heartbeat delivery is pending',
async (t) => {
  const rig = createRig();
  t.after(() => rig.readinessService.shutdown?.());
  await tick();
  assert.equal(rig.route(), true, 'the bootstrap read routes');
  await tick();
  await tick();
  // A services change (the node's message group goes inactive) is classified
  // and delivered; its rebuild is still queued when a heartbeat lands whose
  // deferred delivery is pending, so only the nodes table is outstanding and
  // the bridge's frontier gate passes: the services-stale record itself must
  // refuse.
  deactivateMessageGroup(rig);
  await tick();
  renewingHeartbeat(rig);
  assert.equal(nonNodeDeliveryPending(rig), false,
    'precondition: the services change is delivered, only nodes is pending');
  assert.equal(deliveryPending(rig, TABLES.NODES), true,
    'precondition: the heartbeat\'s deferred delivery is pending');
  assert.equal(rig.route(), false,
    'the pre-change record is stale on the services table: fail closed');
  await tick();
  await macrotask();
  await macrotask();
  assert.equal(rig.route(), false, 'the rebuilt answer is false too');
});

test('a delivered heartbeat never lets a services change whose deferred ' +
  'delivery is pending ride the bridge', async (t) => {
  const rig = createRig();
  t.after(() => rig.readinessService.shutdown?.());
  await tick();
  assert.equal(rig.route(), true, 'the bootstrap read routes');
  await tick();
  await tick();
  // The heartbeat is classified and delivered (rebuild queued); then the
  // message group goes inactive: classified in the applying turn, but its
  // deferred delivery is pending, and the pre-change record is stale on the
  // services table.
  renewingHeartbeat(rig);
  await tick();
  deactivateMessageGroup(rig);
  assert.equal(unclassified(rig), false,
    'precondition: the services change is classified in the applying turn');
  assert.equal(nonNodeDeliveryPending(rig), true,
    'precondition: its deferred delivery is pending');
  assert.equal(rig.route(), false,
    'a services change pending deferred delivery fails closed even after a ' +
    'delivered heartbeat');
  await tick();
  await macrotask();
  await macrotask();
  assert.equal(rig.route(), false, 'the rebuilt answer is false too');
});

// A peer node's async evaluation stores its snapshot and advances the
// readiness snapshot generation without any nodes-table change.
async function peerEvaluation(rig) {
  await rig.readinessService.evaluateNodeReadiness(PEER_NODE_ID, {});
}

test('a delivered services change plus a peer snapshot-generation advance ' +
  'never rides the bridge, with or without a pending heartbeat delivery',
async (t) => {
  for (const withHeartbeat of [false, true]) {
    const rig = createRig();
    t.after(() => rig.readinessService.shutdown?.());
    await tick();
    assert.equal(rig.route(), true, 'the bootstrap read routes');
    await tick();
    await tick();
    deactivateMessageGroup(rig);
    await tick();
    await peerEvaluation(rig);
    if (withHeartbeat) {
      rig.cache.applySystemTableChange(TABLES.NODES, CDC_OPERATION.UPDATE, {
        [COLUMN.NODE_ID]: NODE_ID,
        [COLUMN.LAST_HEARTBEAT]: rig.clock.now,
      });
    }
    // Only a nodes delivery can be outstanding, so the frontier gate passes
    // and the stored/completed witnesses themselves must refuse.
    assert.equal(nonNodeDeliveryPending(rig), false,
      `precondition: nothing beyond nodes is pending (heartbeat=${withHeartbeat})`);
    assert.equal(deliveryPending(rig, TABLES.NODES), withHeartbeat,
      `precondition: a nodes delivery is pending iff heartbeat=${withHeartbeat}`);
    assert.equal(rig.route(), false,
      `the services-stale record fails closed (heartbeat=${withHeartbeat})`);
    await tick();
    await macrotask();
    await macrotask();
    assert.equal(rig.route(), false, 'the rebuilt answer is false too');
  }
});

test('a classified publication change whose deferred delivery is pending ' +
  'never rides the stored-evidence bridge', async (t) => {
  const rig = await settledRig(t);
  abandonPublication(rig);
  assert.equal(unclassified(rig), false,
    'precondition: the publication change is classified in the applying turn');
  assert.equal(nonNodeDeliveryPending(rig), true,
    'precondition: its deferred delivery (the stored-snapshot invalidation) ' +
    'is pending');
  assert.equal(rig.route(), false,
    'the publication change is pending deferred delivery: neither stored ' +
    'nor completed evidence may bridge it');
  await tick();
  assert.equal(nonNodeDeliveryPending(rig), false,
    'the deferred delivery caught the frontier up');
  await macrotask();
  await macrotask();
  assert.equal(rig.route(), false, 'the rebuilt answer is false too');
});

test('a heartbeat carrying saturating load is never bridged, while its ' +
  'deferred delivery is pending or once delivered', async (t) => {
  const rig = await settledRig(t);
  rig.cache.applySystemTableChange(TABLES.NODES, CDC_OPERATION.UPDATE, {
    [COLUMN.NODE_ID]: NODE_ID,
    [COLUMN.LAST_HEARTBEAT]: rig.clock.now,
    [COLUMN.CPU_USAGE_PERCENT]: SATURATED_LOAD_PERCENT,
  });
  assert.equal(deliveryPending(rig, TABLES.NODES), true,
    'precondition: the heartbeat\'s deferred delivery is pending');
  assert.equal(nonNodeDeliveryPending(rig), false,
    'precondition: the frontier gate passes; the row itself must refuse');
  assert.equal(rig.route(), false,
    'saturating load fails closed while its deferred delivery is pending');
  await tick();
  assert.equal(rig.route(), false, 'and once the heartbeat is delivered');
  await macrotask();
  await macrotask();
  assert.equal(rig.route(), false, 'the rebuilt answer is false too');
});

// A nodes-table change that leaves the stored snapshot's liveness watermark
// (heartbeat, lease, connection state) unchanged: only the deferred
// invalidation could refute stored evidence beside it.
function loadMetricsUpdate(rig) {
  rig.cache.applySystemTableChange(TABLES.NODES, CDC_OPERATION.UPDATE, {
    [COLUMN.NODE_ID]: NODE_ID,
    [COLUMN.CPU_USAGE_PERCENT]: 11,
  });
}

// Adversarial: a nodes change alone bridges, so a non-nodes change applied
// in the SAME turn must not ride that bridge while its own deferred delivery
// is pending; services and publications, alone and together, beside a
// renewing heartbeat and beside a watermark-neutral nodes update.
test('a non-nodes change applied in the same turn as a heartbeat never ' +
  'rides the heartbeat\'s bridge', async (t) => {
  const nodesChanges = [
    {name: 'renewing heartbeat', apply: renewingHeartbeat},
    {name: 'load-metrics update', apply: loadMetricsUpdate},
  ];
  const nonNodeChanges = [
    {name: 'services', apply: [deactivateMessageGroup]},
    {name: 'publications', apply: [abandonPublication]},
    {name: 'services+publications',
      apply: [deactivateMessageGroup, abandonPublication]},
  ];
  for (const nodesChange of nodesChanges) {
    const control = await settledRig(t);
    nodesChange.apply(control);
    assert.equal(control.route(), true,
      `control: the ${nodesChange.name} alone bridges in the applying turn`);
    for (const nonNodeChange of nonNodeChanges) {
      const label = `${nonNodeChange.name} beside a ${nodesChange.name}`;
      const rig = await settledRig(t);
      nodesChange.apply(rig);
      for (const apply of nonNodeChange.apply) apply(rig);
      assert.equal(unclassified(rig), false,
        `precondition (${label}): classified in the applying turn`);
      assert.equal(deliveryPending(rig, TABLES.NODES), true,
        `precondition (${label}): the nodes delivery is pending`);
      assert.equal(nonNodeDeliveryPending(rig), true,
        `precondition (${label}): a non-nodes delivery is pending`);
      assert.equal(rig.route(), false,
        `${label} fails closed in the applying turn`);
      await tick();
      await macrotask();
      await macrotask();
      assert.equal(rig.route(), false, `${label}: the rebuilt answer is false too`);
    }
  }
});

function heartbeat(rig) {
  rig.cache.applySystemTableChange(TABLES.NODES, CDC_OPERATION.UPDATE, {
    [COLUMN.NODE_ID]: NODE_ID,
    [COLUMN.LAST_HEARTBEAT]: rig.clock.now,
  });
}

test('routing stops exactly when the ready lease expires', async (t) => {
  const rig = createRig();
  t.after(() => rig.readinessService.shutdown?.());
  await tick();
  assert.equal(rig.route(), true);
  await tick();
  // Heartbeats keep arriving; the lease does not get renewed.
  while (rig.clock.now + HEARTBEAT_STEP_MS < rig.lease) {
    rig.clock.now += HEARTBEAT_STEP_MS;
    heartbeat(rig);
    assert.equal(rig.route(), true,
      `a heartbeat at ${rig.clock.now} keeps the replica routable`);
    await tick();
  }
  rig.clock.now = rig.lease - 1;
  heartbeat(rig);
  assert.equal(rig.route(), true, 'one millisecond before expiry routes');
  await tick();
  // The node goes silent: the lease lapses and the heartbeat goes stale.
  rig.clock.now = rig.lease + STALE_HEARTBEAT_MS;
  assert.equal(rig.route(), false,
    'a positive completed snapshot is live-vetoed, never bridged, once ' +
    'the lease lapsed and no fresher row exists');
  await tick();
  await macrotask();
  assert.equal(rig.route(), false, 'and stays refused after the rebuild');
});
