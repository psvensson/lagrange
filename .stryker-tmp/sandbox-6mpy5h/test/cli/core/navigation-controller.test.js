// @ts-nocheck
import {test} from '../../../src/test-helpers/tap.js';
import {NavigationController} from '../../../src/cli/core/navigation-controller.js';
import {RemoteCache} from '../../../src/cli/core/remote-cache.js';
import {EventBus} from '../../../src/cli/core/event-bus.js';

test('NavigationController', async (t) => {
  t.test('constructor initializes with default state', async (t) => {
    const cache = new RemoteCache();
    const nav = new NavigationController(cache);

    t.equal(nav.currentView, 'nodes');
    t.equal(nav.currentContext, null);
    t.equal(nav.stack.length, 0);
  });

  t.test('getCurrentState returns correct state', async (t) => {
    const cache = new RemoteCache();
    const nav = new NavigationController(cache);

    const state = nav.getCurrentState();
    t.equal(state.view, 'nodes');
    t.equal(state.context, null);
    t.equal(state.stackDepth, 0);
    t.ok(state.breadcrumb.includes('Home'));
  });

  t.test('drillDown pushes current state to stack', async (t) => {
    const cache = new RemoteCache();
    const nav = new NavigationController(cache);

    nav.drillDown('services', {nodeId: 'node-1'});

    t.equal(nav.currentView, 'services');
    t.same(nav.currentContext, {nodeId: 'node-1'});
    t.equal(nav.stack.length, 1);
    t.equal(nav.stack[0].view, 'nodes');
  });

  t.test('drillDown throws on invalid view', async (t) => {
    const cache = new RemoteCache();
    const nav = new NavigationController(cache);

    t.throws(() => nav.drillDown('invalid_view', {}), /Invalid view/);
  });

  t.test('goBack restores previous state', async (t) => {
    const cache = new RemoteCache();
    const nav = new NavigationController(cache);

    nav.drillDown('services', {nodeId: 'node-1'});
    nav.drillDown('partitions', {partitionId: 'p-1'});

    t.equal(nav.stack.length, 2);

    const result = nav.goBack();
    t.equal(result, true);
    t.equal(nav.currentView, 'services');
    t.same(nav.currentContext, {nodeId: 'node-1'});
    t.equal(nav.stack.length, 1);
  });

  t.test('goBack returns false at root', async (t) => {
    const cache = new RemoteCache();
    const nav = new NavigationController(cache);

    const result = nav.goBack();
    t.equal(result, false);
    t.equal(nav.currentView, 'nodes');
  });

  t.test('goToView clears stack and navigates', async (t) => {
    const cache = new RemoteCache();
    const nav = new NavigationController(cache);

    nav.drillDown('services', {nodeId: 'node-1'});
    nav.drillDown('partitions', {partitionId: 'p-1'});

    nav.goToView('tables');

    t.equal(nav.currentView, 'tables');
    t.equal(nav.currentContext, null);
    t.equal(nav.stack.length, 0);
  });

  t.test('goToView throws on invalid view', async (t) => {
    const cache = new RemoteCache();
    const nav = new NavigationController(cache);

    t.throws(() => nav.goToView('invalid'), /Invalid view/);
  });

  t.test('jumpToEntity navigates directly to entity', async (t) => {
    const cache = new RemoteCache();
    const nav = new NavigationController(cache);

    nav.drillDown('services', {nodeId: 'node-1'});
    nav.jumpToEntity('table', 'table-123');

    t.equal(nav.currentView, 'tables');
    t.same(nav.currentContext, {tableId: 'table-123'});
    t.equal(nav.stack.length, 0);
  });

  t.test('jumpToEntity throws on unknown entity type', async (t) => {
    const cache = new RemoteCache();
    const nav = new NavigationController(cache);

    t.throws(() => nav.jumpToEntity('unknown', 'id'), /Unknown entity type/);
  });

  t.test('getBreadcrumb returns correct path', async (t) => {
    const cache = new RemoteCache();
    const nav = new NavigationController(cache);

    t.equal(nav.getBreadcrumb(), 'Home');

    nav.drillDown('services', {nodeId: 'node-1'});
    t.ok(nav.getBreadcrumb().includes('Services'));
    t.ok(nav.getBreadcrumb().includes('node-1'));

    nav.drillDown('partitions', {partitionId: 'p-1'});
    t.ok(nav.getBreadcrumb().includes('Partition'));
    t.ok(nav.getBreadcrumb().includes('p-1'));
  });

  t.test('getRelatedCounts returns counts for node', async (t) => {
    const cache = new RemoteCache();
    cache.loadFromDump({
      nodes: [{node_id: 'node-1'}],
      service_definitions: [
        {service_id: 'sys-admin-meta', replica_count: 2},
        {service_id: 'sys-wasm-meta', replica_count: 2},
      ],
      service_endpoints: [
        {
          endpoint_id: 'admin-ep-1',
          service_id: 'sys-admin-meta',
          node_id: 'node-1',
          health_status: 'healthy',
        },
        {
          endpoint_id: 'wasm-ep-1',
          service_id: 'sys-wasm-meta',
          node_id: 'node-1',
          health_status: 'healthy',
        },
        {
          endpoint_id: 'admin-ep-2',
          service_id: 'sys-admin-meta',
          node_id: 'node-2',
          health_status: 'healthy',
        },
      ],
    });

    const nav = new NavigationController(cache);
    const counts = nav.getRelatedCounts('node', 'node-1');

    t.equal(counts.services, 2);
    t.equal(counts.replicas, 2);
  });

  t.test('getRelatedCounts returns counts for table', async (t) => {
    const cache = new RemoteCache();
    cache.loadFromDump({
      tables: [{table_id: 'table-1'}],
      partitions: [
        {partition_id: 'p1', table_id: 'table-1'},
        {partition_id: 'p2', table_id: 'table-1'},
        {partition_id: 'p3', table_id: 'table-2'},
      ],
    });

    const nav = new NavigationController(cache);
    const counts = nav.getRelatedCounts('table', 'table-1');

    t.equal(counts.partitions, 2);
  });

  t.test('getViewData returns data from cache', async (t) => {
    const cache = new RemoteCache();
    cache.loadFromDump({
      nodes: [{node_id: 'node-1'}, {node_id: 'node-2'}],
      service_definitions: [{service_id: 'sys-admin-meta', replica_count: 1}],
      service_endpoints: [
        {
          endpoint_id: 'admin-ep-1',
          service_id: 'sys-admin-meta',
          node_id: 'node-1',
          health_status: 'healthy',
        },
      ],
    });

    const nav = new NavigationController(cache);

    const nodes = nav.getViewData();
    t.equal(nodes.length, 2);

    nav.goToView('services');
    const services = nav.getViewData();
    t.equal(services.length, 1);
  });

  t.test('canGoBack returns correct value', async (t) => {
    const cache = new RemoteCache();
    const nav = new NavigationController(cache);

    t.equal(nav.canGoBack(), false);

    nav.drillDown('services', {});
    t.equal(nav.canGoBack(), true);

    nav.goBack();
    t.equal(nav.canGoBack(), false);
  });

  t.test('reset clears navigation state', async (t) => {
    const cache = new RemoteCache();
    const nav = new NavigationController(cache);

    nav.drillDown('services', {nodeId: 'node-1'});
    nav.drillDown('partitions', {});

    nav.reset();

    t.equal(nav.currentView, 'nodes');
    t.equal(nav.currentContext, null);
    t.equal(nav.stack.length, 0);
  });

  t.test('emits events via event bus', async (t) => {
    const cache = new RemoteCache();
    const eventBus = new EventBus();
    const nav = new NavigationController(cache, eventBus);

    const events = [];
    eventBus.on('navigation:*', (data, event) => {
      events.push({event, data});
    });

    nav.drillDown('services', {nodeId: 'node-1'});
    nav.goBack();
    nav.goToView('tables');

    t.equal(events.length, 3);
    t.ok(events[0].event.includes('drillDown'));
    t.ok(events[1].event.includes('goBack'));
    t.ok(events[2].event.includes('goToView'));
  });
});
