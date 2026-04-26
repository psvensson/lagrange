import {test} from '../../src/test-helpers/tap.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {
  SERVICE_STATUS,
  SERVICE_TYPE,
  TABLES,
} from '../../src/constants/index.js';

const SYSTEM_TABLE_BRIDGE_RETENTION_MODE = 'system_table_service_gap_bridge';
const SYSTEM_TABLE_NODES = TABLES.NODES;
const NON_EXPIRING_RETENTION_MS = Number.POSITIVE_INFINITY;
const AUTHORITATIVE_OVERLAY_STATE = Object.freeze({
  AVAILABLE: 'available',
  AUTHORITATIVE_MISSING: 'authoritative_missing',
  MISSING: 'missing',
});
const AUTHORITATIVE_OVERLAY_PARTITION_STATE = Object.freeze({
  AVAILABLE: 'available',
  UNAVAILABLE: 'unavailable',
});
const AUTHORITATIVE_OVERLAY_CACHE_SERVICE_STATE = Object.freeze({
  ELIGIBLE: 'eligible',
  MASKED: 'masked',
});

function createEngine() {
  const engine = Object.create(SQLQueryEngine.prototype);
  engine.authoritativeRoutingOverlayEntries = new Map();
  engine.bootstrapRoutingOverlayEntries = new Map();
  engine.nowFn = () => 1000;
  engine.getCachedPartitionRecord = () => null;
  engine.getPartitionServiceRows = () => [];
  engine.partitionMatchesTableRef = () => true;
  engine.isPartitionVisibleForRouting = () => true;
  engine.isSystemTable = (tableRef) => tableRef === SYSTEM_TABLE_NODES;
  engine.tablePartitionProvisioningTimeoutMs = 5000;
  return engine;
}

test('SQLQueryEngine exposes missing authoritative overlay state explicitly',
  async (t) => {
    const engine = createEngine();

    t.same(
      engine.getAuthoritativeRoutingOverlayEntryState('partition-1'),
      {
        state: AUTHORITATIVE_OVERLAY_STATE.MISSING,
        partitionState: AUTHORITATIVE_OVERLAY_PARTITION_STATE.UNAVAILABLE,
        cacheServiceState: AUTHORITATIVE_OVERLAY_CACHE_SERVICE_STATE.ELIGIBLE,
        services: [],
      },
      'missing authoritative overlay entries should use an explicit state',
    );
  });

test('SQLQueryEngine exposes authoritative overlay service-only state explicitly',
  async (t) => {
    const engine = createEngine();
    engine.authoritativeRoutingOverlayEntries.set('partition-1', {
      services: [
        {service_id: 'svc-1'},
      ],
    });

    const state = engine.getAuthoritativeRoutingOverlayEntryState('partition-1');

    t.equal(state.state, AUTHORITATIVE_OVERLAY_STATE.AVAILABLE);
    t.equal(
      state.partitionState,
      AUTHORITATIVE_OVERLAY_PARTITION_STATE.UNAVAILABLE,
    );
    t.equal(
      state.cacheServiceState,
      AUTHORITATIVE_OVERLAY_CACHE_SERVICE_STATE.MASKED,
    );
    t.same(state.services, [{service_id: 'svc-1'}]);
  });

test('SQLQueryEngine exposes authoritative-missing overlay state explicitly',
  async (t) => {
    const engine = createEngine();
    engine.authoritativeRoutingOverlayEntries.set('partition-1', {
      state: AUTHORITATIVE_OVERLAY_STATE.AUTHORITATIVE_MISSING,
      partition: null,
      services: [],
    });

    t.same(
      engine.getAuthoritativeRoutingOverlayEntryState('partition-1'),
      {
        state: AUTHORITATIVE_OVERLAY_STATE.AUTHORITATIVE_MISSING,
        partitionState: AUTHORITATIVE_OVERLAY_PARTITION_STATE.UNAVAILABLE,
        cacheServiceState: AUTHORITATIVE_OVERLAY_CACHE_SERVICE_STATE.MASKED,
        services: [],
      },
      'authoritative absence should remain explicit so stale cache rows can be masked',
    );
    t.equal(
      engine.shouldAuthoritativeRoutingOverlayMaskCacheServices('partition-1'),
      true,
      'authoritative absence should suppress stale cached service rows',
    );
  });

test('SQLQueryEngine expires bootstrap overlay entries into an explicit state',
  async (t) => {
    const engine = createEngine();
    engine.bootstrapRoutingOverlayEntries.set('partition-1', {
      partition: {partition_id: 'partition-1'},
      services: [{service_id: 'svc-1'}],
      expiresAtMs: 999,
    });

    const state = engine.getBootstrapRoutingOverlayEntryState('partition-1');

    t.same(
      state,
      {
        entry: null,
        partition: null,
        state: 'expired',
        reason: 'expired',
        partitionState: 'unavailable',
        services: [],
      },
      'expired bootstrap overlay entries should not masquerade as missing',
    );
    t.equal(
      engine.bootstrapRoutingOverlayEntries.has('partition-1'),
      false,
      'expired bootstrap overlay entries should be removed',
    );
  });

test('SQLQueryEngine keeps bootstrap overlays available during a cache leader service gap',
  async (t) => {
    const engine = createEngine();
    engine.getCachedPartitionRecord = () => ({
      leader_node_id: 'node-1',
    });
    engine.bootstrapRoutingOverlayEntries.set('partition-1', {
      partition: {partition_id: 'partition-1'},
      services: [
        {
          service_id: 'svc-1',
          service_type: SERVICE_TYPE.PARTITION,
          partition_id: 'partition-1',
          node_id: 'node-1',
          status: SERVICE_STATUS.ACTIVE,
          address: 'node-1/partition/partition-1-r1',
        },
        {
          service_id: 'svc-2',
          service_type: SERVICE_TYPE.PARTITION,
          partition_id: 'partition-1',
          node_id: 'node-2',
          status: SERVICE_STATUS.ACTIVE,
          address: 'node-2/partition/partition-1-r2',
        },
      ],
      expiresAtMs: 2000,
    });

    const state = engine.getBootstrapRoutingOverlayEntryState('partition-1');

    t.equal(state.state, 'available');
    t.equal(state.reason, 'leader_service_gap');
    t.equal(state.partitionState, 'available');
    t.equal(state.partition?.leader_node_id, 'node-1');
    t.same(
      state.services.map((service) => service.node_id),
      ['node-1'],
      'bootstrap overlay should narrow to current-leader services while cache service rows are missing',
    );
  },
);

test('SQLQueryEngine keeps system-table bootstrap overlays alive past the ' +
  'provisioning timeout while the leader service gap persists',
async (t) => {
  const engine = createEngine();
  engine.getCachedPartitionRecord = () => ({
    leader_node_id: 'node-1',
    table_name: SYSTEM_TABLE_NODES,
  });
  engine.bootstrapRoutingOverlayEntries.set('partition-1', {
    partition: {
      partition_id: 'partition-1',
      table_name: SYSTEM_TABLE_NODES,
    },
    services: [
      {
        service_id: 'svc-1',
        service_type: SERVICE_TYPE.PARTITION,
        partition_id: 'partition-1',
        node_id: 'node-1',
        status: SERVICE_STATUS.ACTIVE,
        address: 'node-1/partition/partition-1-r1',
      },
    ],
    expiresAtMs: 999,
    retentionMode: SYSTEM_TABLE_BRIDGE_RETENTION_MODE,
  });

  const state = engine.getBootstrapRoutingOverlayEntryState('partition-1');

  t.equal(state.state, 'available');
  t.equal(state.reason, 'leader_service_gap');
  t.equal(state.partitionState, 'available');
  t.equal(
    engine.bootstrapRoutingOverlayEntries.has('partition-1'),
    true,
    'system-table service-gap bridges should not expire on the provisioning timer',
  );
});

test('SQLQueryEngine marks bootstrap overlays superseded when cache leader service exists',
  async (t) => {
    const engine = createEngine();
    engine.getCachedPartitionRecord = () => ({
      leader_node_id: 'node-1',
    });
    engine.getPartitionServiceRows = () => [{
      service_id: 'svc-cache',
      service_type: SERVICE_TYPE.PARTITION,
      partition_id: 'partition-1',
      node_id: 'node-1',
      status: SERVICE_STATUS.ACTIVE,
      address: 'node-1/partition/partition-1-r1',
    }];
    engine.bootstrapRoutingOverlayEntries.set('partition-1', {
      partition: {partition_id: 'partition-1'},
      services: [{service_id: 'svc-1'}],
      expiresAtMs: 2000,
    });

    const state = engine.getBootstrapRoutingOverlayEntryState('partition-1');

    t.same(
      state,
      {
        entry: null,
        partition: null,
        state: 'superseded',
        reason: 'cache_leader_service_ready',
        partitionState: 'unavailable',
        services: [],
      },
      'bootstrap overlay entries should resolve to a distinct superseded state once cache routing is covered',
    );
  });

test('SQLQueryEngine retains system-table bootstrap bridges after cache ' +
  'coverage so they can reactivate on later service regressions',
async (t) => {
  const engine = createEngine();
  engine.getCachedPartitionRecord = () => ({
    leader_node_id: 'node-1',
    table_name: SYSTEM_TABLE_NODES,
  });
  engine.getPartitionServiceRows = () => [{
    service_id: 'svc-cache',
    service_type: SERVICE_TYPE.PARTITION,
    partition_id: 'partition-1',
    node_id: 'node-1',
    status: SERVICE_STATUS.ACTIVE,
    address: 'node-1/partition/partition-1-r1',
  }];
  engine.bootstrapRoutingOverlayEntries.set('partition-1', {
    partition: {
      partition_id: 'partition-1',
      table_name: SYSTEM_TABLE_NODES,
    },
    services: [{
      service_id: 'svc-1',
      service_type: SERVICE_TYPE.PARTITION,
      partition_id: 'partition-1',
      node_id: 'node-1',
      status: SERVICE_STATUS.ACTIVE,
      address: 'node-1/partition/partition-1-r1',
    }],
    expiresAtMs: NON_EXPIRING_RETENTION_MS,
    retentionMode: SYSTEM_TABLE_BRIDGE_RETENTION_MODE,
  });

  const state = engine.getBootstrapRoutingOverlayEntryState('partition-1');

  t.equal(state.state, 'superseded');
  t.equal(
    engine.bootstrapRoutingOverlayEntries.has('partition-1'),
    true,
    'system-table bootstrap bridges should remain installed while cache routing is healthy',
  );
});
