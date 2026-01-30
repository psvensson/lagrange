import {test} from '../../../src/test-helpers/tap.js';
import {StateManager} from '../../../src/cli/core/state-manager.js';
import {EventBus} from '../../../src/cli/core/event-bus.js';

test('StateManager - getState returns immutable copy', async (t) => {
  const eventBus = new EventBus();
  const manager = new StateManager(eventBus);

  const state1 = manager.getState();
  const state2 = manager.getState();

  t.not(state1, state2);
  t.same(state1, state2);

  // Modifying returned state should not affect internal state
  state1.connectionStatus = 'connected';
  t.equal(manager.getState().connectionStatus, 'disconnected');
});

test('StateManager - setState updates state', async (t) => {
  const eventBus = new EventBus();
  const manager = new StateManager(eventBus);

  manager.setState({connectionStatus: 'connected'});

  t.equal(manager.getState().connectionStatus, 'connected');
});

test('StateManager - setState deep merges objects', async (t) => {
  const eventBus = new EventBus();
  const manager = new StateManager(eventBus);

  manager.setState({
    navigation: {currentView: 'tables'},
  });

  const state = manager.getState();
  t.equal(state.navigation.currentView, 'tables');
  // Other navigation properties should be preserved
  t.ok(state.navigation.stack !== undefined);
});

test('StateManager - setState validates connection status', async (t) => {
  const eventBus = new EventBus();
  const manager = new StateManager(eventBus);

  t.throws(() => {
    manager.setState({connectionStatus: 'invalid'});
  }, /Invalid connection status/);
});

test('StateManager - setState validates view', async (t) => {
  const eventBus = new EventBus();
  const manager = new StateManager(eventBus);

  t.throws(() => {
    manager.setState({navigation: {currentView: 'invalid'}});
  }, /Invalid view/);
});

test('StateManager - setState emits state:changed event', async (t) => {
  const eventBus = new EventBus();
  const manager = new StateManager(eventBus);
  const events = [];

  eventBus.on('state:changed', (data) => {
    events.push(data);
  });

  manager.setState({connectionStatus: 'connected'});

  t.equal(events.length, 1);
  t.equal(events[0].oldState.connectionStatus, 'disconnected');
  t.equal(events[0].newState.connectionStatus, 'connected');
});

test('StateManager - get() retrieves nested values', async (t) => {
  const eventBus = new EventBus();
  const manager = new StateManager(eventBus);

  t.equal(manager.get('navigation.currentView'), 'nodes');
  t.equal(manager.get('config.refreshInterval'), 5000);
});

test('StateManager - batchUpdate applies multiple changes', async (t) => {
  const eventBus = new EventBus();
  const manager = new StateManager(eventBus);

  manager.batchUpdate((_state) => ({
    connectionStatus: 'connected',
    navigation: {currentView: 'tables'},
  }));

  const state = manager.getState();
  t.equal(state.connectionStatus, 'connected');
  t.equal(state.navigation.currentView, 'tables');
});

test('StateManager - createSnapshot and restoreSnapshot', async (t) => {
  const eventBus = new EventBus();
  const manager = new StateManager(eventBus);

  manager.setState({connectionStatus: 'connected'});
  const snapshotIndex = manager.createSnapshot('test-snapshot');

  manager.setState({connectionStatus: 'disconnected'});
  t.equal(manager.getState().connectionStatus, 'disconnected');

  manager.restoreSnapshot(snapshotIndex);
  t.equal(manager.getState().connectionStatus, 'connected');
});

test('StateManager - restoreSnapshot throws for invalid index', async (t) => {
  const eventBus = new EventBus();
  const manager = new StateManager(eventBus);

  t.throws(() => {
    manager.restoreSnapshot(999);
  }, /does not exist/);
});

test('StateManager - getSnapshots returns snapshot metadata', async (t) => {
  const eventBus = new EventBus();
  const manager = new StateManager(eventBus);

  manager.createSnapshot('snap1');
  manager.createSnapshot('snap2');

  const snapshots = manager.getSnapshots();
  t.equal(snapshots.length, 2);
  t.equal(snapshots[0].name, 'snap1');
  t.equal(snapshots[1].name, 'snap2');
});

test('StateManager - reset() restores initial state', async (t) => {
  const eventBus = new EventBus();
  const manager = new StateManager(eventBus);

  manager.setState({connectionStatus: 'connected'});
  manager.reset();

  t.equal(manager.getState().connectionStatus, 'disconnected');
});

test('StateManager - subscribe notifies on path changes', async (t) => {
  const eventBus = new EventBus();
  const manager = new StateManager(eventBus);
  const changes = [];

  manager.subscribe('connectionStatus', (newVal, oldVal) => {
    changes.push({newVal, oldVal});
  });

  manager.setState({connectionStatus: 'connected'});
  manager.setState({connectionStatus: 'disconnected'});

  t.equal(changes.length, 2);
  t.equal(changes[0].newVal, 'connected');
  t.equal(changes[0].oldVal, 'disconnected');
});

test('StateManager - validates selectedIndex', async (t) => {
  const eventBus = new EventBus();
  const manager = new StateManager(eventBus);

  t.throws(() => {
    manager.setState({ui: {selectedIndex: -1}});
  }, /Invalid selected index/);
});

test('StateManager - validates sortDirection', async (t) => {
  const eventBus = new EventBus();
  const manager = new StateManager(eventBus);

  t.throws(() => {
    manager.setState({ui: {sortDirection: 'invalid'}});
  }, /Invalid sort direction/);
});

test('StateManager - validates refreshInterval', async (t) => {
  const eventBus = new EventBus();
  const manager = new StateManager(eventBus);

  t.throws(() => {
    manager.setState({config: {refreshInterval: 100}});
  }, /Invalid refresh interval/);
});
