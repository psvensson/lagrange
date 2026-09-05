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
// quest: the REAL SystemTableCache (listeners deferred to a macrotask, so
// the planning owner's classification barrier is closed in the
// apply-before-listener window), the real readiness service with its single
// planning owner, and the real QueryExecutor. A fresh heartbeat must never
// close routing to the node: not synchronously in the barrier window, not
// after the deferred listener classifies it, not across the queued owner
// rebuilds; and routing stops exactly when the ready lease expires.

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
  // publication reader feeds the serve lane; an ABANDONED transition in the
  // apply-before-listener window must never be bridged.
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

test('a fresh heartbeat never closes routing: barrier window, classified ' +
  'window, queued rebuilds', async (t) => {
  const rig = createRig();
  t.after(() => rig.readinessService.shutdown?.());
  await tick();
  assert.equal(rig.route(), true, 'the bootstrap read routes');
  await tick();
  await tick();
  const owner = rig.readinessService.readinessPlanningSnapshotOwner;
  rig.cache.applySystemTableChange(TABLES.NODES, CDC_OPERATION.UPDATE, {
    [COLUMN.NODE_ID]: NODE_ID,
    [COLUMN.LAST_HEARTBEAT]: rig.clock.now,
    [COLUMN.READY_LEASE_EXPIRES_AT]: rig.clock.now + LEASE_MS,
  });
  assert.equal(owner.hasUnclassifiedSourceChange(), true,
    'the apply-before-listener window is open: the barrier is closed');
  assert.equal(rig.route(), true,
    'the barrier-window read bridges the completed snapshot');
  await tick();
  assert.equal(rig.route(), true,
    'the read after the deferred listener classified the heartbeat routes');
  for (let round = 0; round < MACROTASK_ROUNDS; round += 1) {
    await macrotask();
    rig.clock.now += MACROTASK_STEP_MS;
    assert.equal(rig.route(), true,
      `queued owner rebuild ${round + 1} keeps the replica routable`);
  }
});

test('a completed snapshot already stale on another table is never served ' +
  'through the nodes-only barrier bridge', async (t) => {
  const rig = createRig();
  t.after(() => rig.readinessService.shutdown?.());
  await tick();
  assert.equal(rig.route(), true, 'the bootstrap read routes');
  await tick();
  await tick();
  // A services change (the node's message group goes inactive) is classified
  // by the deferred listener; its rebuild is still queued when a heartbeat
  // lands in the next apply-before-listener window.
  rig.cache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.UPDATE, {
    [COLUMN.SERVICE_ID]: MESSAGE_GROUP_SERVICE_ID,
    [COLUMN.STATUS]: INACTIVE_STATUS,
  });
  await tick();
  rig.cache.applySystemTableChange(TABLES.NODES, CDC_OPERATION.UPDATE, {
    [COLUMN.NODE_ID]: NODE_ID,
    [COLUMN.LAST_HEARTBEAT]: rig.clock.now,
    [COLUMN.READY_LEASE_EXPIRES_AT]: rig.clock.now + LEASE_MS,
  });
  assert.equal(rig.route(), false,
    'the pre-change record is stale on the services table: fail closed');
  await tick();
  await macrotask();
  await macrotask();
  assert.equal(rig.route(), false, 'the rebuilt answer is false too');
});

test('a classified heartbeat never lets an unclassified change on another ' +
  'table ride the bridge', async (t) => {
  const rig = createRig();
  t.after(() => rig.readinessService.shutdown?.());
  await tick();
  assert.equal(rig.route(), true, 'the bootstrap read routes');
  await tick();
  await tick();
  // The heartbeat is classified (nodes revision advanced, rebuild queued);
  // then the message group goes inactive in the next apply-before-listener
  // window: the pre-change record is stale on the services table.
  rig.cache.applySystemTableChange(TABLES.NODES, CDC_OPERATION.UPDATE, {
    [COLUMN.NODE_ID]: NODE_ID,
    [COLUMN.LAST_HEARTBEAT]: rig.clock.now,
    [COLUMN.READY_LEASE_EXPIRES_AT]: rig.clock.now + LEASE_MS,
  });
  await tick();
  rig.cache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.UPDATE, {
    [COLUMN.SERVICE_ID]: MESSAGE_GROUP_SERVICE_ID,
    [COLUMN.STATUS]: INACTIVE_STATUS,
  });
  assert.equal(rig.route(), false,
    'an unclassified services change fails closed even after a classified heartbeat');
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

test('a classified services change plus a peer snapshot-generation advance ' +
  'never rides the bridge, at either site', async (t) => {
  for (const withHeartbeat of [false, true]) {
    const rig = createRig();
    t.after(() => rig.readinessService.shutdown?.());
    await tick();
    assert.equal(rig.route(), true, 'the bootstrap read routes');
    await tick();
    await tick();
    rig.cache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.UPDATE, {
      [COLUMN.SERVICE_ID]: MESSAGE_GROUP_SERVICE_ID,
      [COLUMN.STATUS]: INACTIVE_STATUS,
    });
    await tick();
    await peerEvaluation(rig);
    if (withHeartbeat) {
      rig.cache.applySystemTableChange(TABLES.NODES, CDC_OPERATION.UPDATE, {
        [COLUMN.NODE_ID]: NODE_ID,
        [COLUMN.LAST_HEARTBEAT]: rig.clock.now,
      });
    }
    assert.equal(rig.route(), false,
      `the services-stale record fails closed (heartbeat=${withHeartbeat})`);
    await tick();
    await macrotask();
    await macrotask();
    assert.equal(rig.route(), false, 'the rebuilt answer is false too');
  }
});

test('an unclassified publication change never rides the stored-evidence ' +
  'bridge in the apply-before-listener window', async (t) => {
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
  rig.cache.applySystemTableChange(TABLES.CONTROL_PLANE_PUBLICATIONS,
    CDC_OPERATION.UPDATE, {publication_id: PUBLICATION_ID,
      status: ABANDONED_STATUS});
  assert.equal(rig.route(), false,
    'the publication change is unclassified: neither stored nor completed ' +
    'evidence may bridge it');
  await tick();
  await macrotask();
  await macrotask();
  assert.equal(rig.route(), false, 'the rebuilt answer is false too');
});

test('a heartbeat carrying saturating load is never bridged, in the window ' +
  'or once classified', async (t) => {
  const rig = createRig();
  t.after(() => rig.readinessService.shutdown?.());
  await tick();
  assert.equal(rig.route(), true, 'the bootstrap read routes');
  await tick();
  await tick();
  await macrotask();
  await macrotask();
  assert.equal(rig.route(), true, 'settled state routes');
  rig.cache.applySystemTableChange(TABLES.NODES, CDC_OPERATION.UPDATE, {
    [COLUMN.NODE_ID]: NODE_ID,
    [COLUMN.LAST_HEARTBEAT]: rig.clock.now,
    [COLUMN.CPU_USAGE_PERCENT]: SATURATED_LOAD_PERCENT,
  });
  assert.equal(rig.route(), false,
    'saturating load in the apply-before-listener window fails closed');
  await tick();
  assert.equal(rig.route(), false, 'and once the heartbeat is classified');
  await macrotask();
  await macrotask();
  assert.equal(rig.route(), false, 'the rebuilt answer is false too');
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
