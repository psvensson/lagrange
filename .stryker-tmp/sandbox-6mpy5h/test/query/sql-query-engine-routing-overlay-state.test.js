// @ts-nocheck
import {test} from '../../src/test-helpers/tap.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';

function createEngine() {
  const engine = Object.create(SQLQueryEngine.prototype);
  engine.authoritativeRoutingOverlayEntries = new Map();
  engine.bootstrapRoutingOverlayEntries = new Map();
  engine.nowFn = () => 1000;
  engine.getCachedPartitionRecord = () => null;
  engine.partitionMatchesTableRef = () => true;
  engine.isPartitionVisibleForRouting = () => true;
  engine.tablePartitionProvisioningTimeoutMs = 5000;
  return engine;
}

test('SQLQueryEngine exposes missing authoritative overlay state explicitly',
  async (t) => {
    const engine = createEngine();

    t.same(
      engine.getAuthoritativeRoutingOverlayEntryState('partition-1'),
      {
        state: 'missing',
        partitionState: 'unavailable',
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

    t.equal(state.state, 'available');
    t.equal(state.partitionState, 'unavailable');
    t.same(state.services, [{service_id: 'svc-1'}]);
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
        state: 'expired',
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

test('SQLQueryEngine marks bootstrap overlays superseded when cache leader exists',
  async (t) => {
    const engine = createEngine();
    engine.getCachedPartitionRecord = () => ({
      leader_node_id: 'node-1',
    });
    engine.bootstrapRoutingOverlayEntries.set('partition-1', {
      partition: {partition_id: 'partition-1'},
      services: [{service_id: 'svc-1'}],
      expiresAtMs: 2000,
    });

    const state = engine.getBootstrapRoutingOverlayEntryState('partition-1');

    t.same(
      state,
      {
        state: 'superseded',
        partitionState: 'unavailable',
        services: [],
      },
      'bootstrap overlay entries should resolve to a distinct superseded state',
    );
  });
