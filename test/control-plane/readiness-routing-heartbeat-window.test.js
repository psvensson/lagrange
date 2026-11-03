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

// Superseded in part 2026-11-02 by quest serve-eligibility-committed-epoch-read
// (attempt 1): user-table serving is the readiness owner's committed-epoch
// answer, so the routed-read stored-snapshot bridge and its deferred-delivery
// frontier no longer decide routing; the bridge-only witnesses were removed.
// The heartbeat-window guarantees are kept against the committed answer: a
// renewing heartbeat never closes routing, a revoking change (abandoned
// publication, saturating load) closes it at once, and routing stops exactly
// when the committed ready lease expires.
//
// Original: production-shaped witness for the readiness-routing-cache-lag-bridge
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
      priority_partition_summary: JSON.stringify({
        satisfied: true, blockedPartitions: [],
      }),
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
  // The committed state the serve answer is read from: in this rig the
  // committed rows are the rows the cache holds at read time (a leader that
  // has applied every change), read through the readiness-owner read.
  const committedView = {
    async readReadinessOwnerRows(tableName) {
      return {success: true, rows: cache.getAll(tableName)};
    },
  };
  const readinessService = new ControlPlaneReadinessService({
    nodeId: 'seed-node',
    systemTableCache: cache,
    authoritativeControlPlaneView: committedView,
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

function heartbeat(rig) {
  rig.cache.applySystemTableChange(TABLES.NODES, CDC_OPERATION.UPDATE, {
    [COLUMN.NODE_ID]: NODE_ID,
    [COLUMN.LAST_HEARTBEAT]: rig.clock.now,
  });
}

async function settledRig(t) {
  const rig = createRig();
  t.after(() => rig.readinessService.shutdown?.());
  await rig.readinessService.readServeEligibility();
  assert.equal(rig.route(), true, 'the committed record routes');
  await tick();
  await macrotask();
  assert.equal(rig.route(), true, 'settled state routes');
  return rig;
}

test('a fresh heartbeat never closes routing: applying turn, after its ' +
  'deferred delivery, queued refreshes', async (t) => {
  const rig = await settledRig(t);
  renewingHeartbeat(rig);
  assert.equal(rig.route(), true,
    'a lease extension leaves the committed answer valid in the applying turn');
  await tick();
  assert.equal(rig.route(), true,
    'the read after the heartbeat\'s deferred delivery routes');
  for (let round = 0; round < MACROTASK_ROUNDS; round += 1) {
    await macrotask();
    rig.clock.now += MACROTASK_STEP_MS;
    assert.equal(rig.route(), true,
      `queued refresh ${round + 1} keeps the replica routable`);
  }
});

test('an abandoned publication closes routing at once and after the ' +
  'committed refresh', async (t) => {
  const rig = await settledRig(t);
  abandonPublication(rig);
  assert.equal(rig.route(), false,
    'the publication change makes the committed record stale: no serving');
  await rig.readinessService.readServeEligibility();
  assert.equal(rig.route(), false,
    'the refreshed committed record has no published membership');
});

test('a heartbeat carrying saturating load closes routing at once and after ' +
  'the committed refresh', async (t) => {
  const rig = await settledRig(t);
  rig.cache.applySystemTableChange(TABLES.NODES, CDC_OPERATION.UPDATE, {
    [COLUMN.NODE_ID]: NODE_ID,
    [COLUMN.LAST_HEARTBEAT]: rig.clock.now,
    [COLUMN.CPU_USAGE_PERCENT]: SATURATED_LOAD_PERCENT,
  });
  assert.equal(rig.route(), false,
    'saturating load is a revoking change: the committed record is stale');
  await rig.readinessService.readServeEligibility();
  assert.equal(rig.route(), false,
    'the refreshed committed answer refuses the saturated node');
});

test('a control-plane service row is not a serve input', async (t) => {
  const rig = await settledRig(t);
  deactivateMessageGroup(rig);
  await tick();
  await macrotask();
  assert.equal(rig.route(), true,
    'serving is the committed lease and published membership only');
});

test('routing stops exactly when the ready lease expires', async (t) => {
  const rig = await settledRig(t);
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
  rig.clock.now = rig.lease;
  assert.equal(rig.route(), false,
    'at the committed lease expiry the answer is stale, never eligible');
  rig.clock.now = rig.lease + STALE_HEARTBEAT_MS;
  await rig.readinessService.readServeEligibility();
  assert.equal(rig.route(), false,
    'the refreshed committed record still holds the lapsed lease');
});
