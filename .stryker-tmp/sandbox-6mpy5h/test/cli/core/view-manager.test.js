// @ts-nocheck
import {test} from '../../../src/test-helpers/tap.js';
import {ViewManager} from '../../../src/cli/core/view-manager.js';
import {BaseView} from '../../../src/cli/core/base-view.js';
import {EventBus} from '../../../src/cli/core/event-bus.js';
import {NavigationController} from '../../../src/cli/core/navigation-controller.js';
import {RemoteCache} from '../../../src/cli/core/remote-cache.js';

/**
 * Test view implementation
 */
class TestView extends BaseView {
  constructor(options = {}) {
    super(options);
    this.name = options.name || 'test';
  }

  getColumns() {
    return [{key: 'id', label: 'ID'}, {key: 'name', label: 'Name'}];
  }

  formatRow(item) {
    return [item.id, item.name];
  }

  getItemKey(item) {
    return item.id;
  }
}

test('ViewManager', async (t) => {
  t.test('constructor initializes with default state', async (t) => {
    const manager = new ViewManager();

    t.equal(manager.currentViewName, null);
    t.equal(manager.currentView, null);
    t.equal(manager.getViewCount(), 0);
  });

  t.test('registerView adds view to manager', async (t) => {
    const manager = new ViewManager();
    const view = new TestView({name: 'nodes'});

    manager.registerView('nodes', view);

    t.equal(manager.getViewCount(), 1);
    t.ok(manager.hasView('nodes'));
    t.equal(manager.getView('nodes'), view);
  });

  t.test('unregisterView removes view', async (t) => {
    const manager = new ViewManager();
    const view = new TestView({name: 'nodes'});

    manager.registerView('nodes', view);
    t.ok(manager.hasView('nodes'));

    manager.unregisterView('nodes');
    t.notOk(manager.hasView('nodes'));
    t.equal(manager.getViewCount(), 0);
  });

  t.test('getViewNames returns all registered names', async (t) => {
    const manager = new ViewManager();

    manager.registerView('nodes', new TestView());
    manager.registerView('services', new TestView());
    manager.registerView('tables', new TestView());

    const names = manager.getViewNames();
    t.same(names.sort(), ['nodes', 'services', 'tables']);
  });

  t.test('switchView changes current view', async (t) => {
    const manager = new ViewManager();
    const nodesView = new TestView({name: 'nodes'});
    const servicesView = new TestView({name: 'services'});

    manager.registerView('nodes', nodesView);
    manager.registerView('services', servicesView);

    const result = manager.switchView('nodes');
    t.equal(result, true);
    t.equal(manager.getCurrentViewName(), 'nodes');
    t.equal(manager.getCurrentView(), nodesView);
    t.ok(nodesView.isVisible());

    manager.switchView('services');
    t.equal(manager.getCurrentViewName(), 'services');
    t.notOk(nodesView.isVisible());
    t.ok(servicesView.isVisible());
  });

  t.test('switchView returns false for unknown view', async (t) => {
    const manager = new ViewManager();

    const result = manager.switchView('unknown');
    t.equal(result, false);
    t.equal(manager.getCurrentViewName(), null);
  });

  t.test('refresh updates current view with navigation data', async (t) => {
    const cache = new RemoteCache();
    cache.loadFromDump({
      nodes: [
        {node_id: 'node-1', node_address: 'localhost:8001'},
        {node_id: 'node-2', node_address: 'localhost:8002'},
      ],
    });

    const navigation = new NavigationController(cache);
    const manager = new ViewManager({navigation});
    const view = new TestView();

    manager.registerView('nodes', view);
    manager.switchView('nodes');

    // View should have data from navigation
    t.equal(view.data.length, 2);
  });

  t.test('handleCDCUpdate tracks changed rows', async (t) => {
    const manager = new ViewManager();
    const view = new TestView();

    manager.registerView('nodes', view);
    manager.switchView('nodes');

    manager.handleCDCUpdate({
      table: 'nodes',
      key: 'node-1',
      operation: 'UPDATE',
    });

    t.ok(view.isChanged('node-1'));
  });

  t.test('handleCDCUpdate only affects relevant view', async (t) => {
    const manager = new ViewManager();
    const nodesView = new TestView();
    const servicesView = new TestView();

    manager.registerView('nodes', nodesView);
    manager.registerView('services', servicesView);
    manager.switchView('nodes');

    // Update to services table shouldn't affect nodes view
    manager.handleCDCUpdate({
      table: 'services',
      key: 'service-1',
      operation: 'UPDATE',
    });

    t.notOk(nodesView.isChanged('service-1'));
  });

  t.test('clearChangedRow removes highlight', async (t) => {
    const manager = new ViewManager();
    const view = new TestView();

    manager.registerView('nodes', view);
    manager.switchView('nodes');

    manager.handleCDCUpdate({
      table: 'nodes',
      key: 'node-1',
      operation: 'UPDATE',
    });

    t.ok(view.isChanged('node-1'));

    manager.clearChangedRow('nodes', 'node-1');
    t.notOk(view.isChanged('node-1'));
  });

  t.test('clearAllChangedRows clears all highlights', async (t) => {
    const manager = new ViewManager();
    const view = new TestView();

    manager.registerView('nodes', view);
    manager.switchView('nodes');

    manager.handleCDCUpdate({table: 'nodes', key: 'node-1', operation: 'UPDATE'});
    manager.handleCDCUpdate({table: 'nodes', key: 'node-2', operation: 'UPDATE'});

    t.ok(view.isChanged('node-1'));
    t.ok(view.isChanged('node-2'));

    manager.clearAllChangedRows('nodes');
    t.notOk(view.isChanged('node-1'));
    t.notOk(view.isChanged('node-2'));
  });

  t.test('isChangeRelevant returns correct value', async (t) => {
    const manager = new ViewManager();
    manager.registerView('nodes', new TestView());
    manager.switchView('nodes');

    t.ok(manager.isChangeRelevant({table: 'nodes'}));
    t.notOk(manager.isChangeRelevant({table: 'services'}));
  });

  t.test('emits events via event bus', async (t) => {
    const eventBus = new EventBus();
    const manager = new ViewManager({eventBus});
    const view = new TestView();

    const events = [];
    eventBus.on('viewManager:*', (data, event) => {
      events.push({event, data});
    });

    manager.registerView('nodes', view);
    manager.switchView('nodes');

    t.ok(events.some((e) => e.event.includes('viewRegistered')));
    t.ok(events.some((e) => e.event.includes('viewSwitched')));
  });

  t.test('destroy cleans up all views', async (t) => {
    const manager = new ViewManager();
    const view1 = new TestView();
    const view2 = new TestView();

    manager.registerView('nodes', view1);
    manager.registerView('services', view2);
    manager.switchView('nodes');

    manager.destroy();

    t.equal(manager.getViewCount(), 0);
    t.equal(manager.getCurrentView(), null);
    t.equal(manager.getCurrentViewName(), null);
  });

  t.test('unregisterView clears current if unregistering current', async (t) => {
    const manager = new ViewManager();
    const view = new TestView();

    manager.registerView('nodes', view);
    manager.switchView('nodes');

    t.equal(manager.getCurrentViewName(), 'nodes');

    manager.unregisterView('nodes');

    t.equal(manager.getCurrentViewName(), null);
    t.equal(manager.getCurrentView(), null);
  });

  t.test('responds to cache:update events', async (t) => {
    const eventBus = new EventBus();
    const manager = new ViewManager({eventBus});
    const view = new TestView();

    manager.registerView('nodes', view);
    manager.switchView('nodes');

    // Emit cache update event
    eventBus.emit('cache:update', {
      table: 'nodes',
      key: 'node-1',
      operation: 'INSERT',
    });

    t.ok(view.isChanged('node-1'));
  });
});
