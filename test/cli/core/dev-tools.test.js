/**
 * Unit tests for DevTools
 *
 * Requirements: 26.1, 26.2, 26.3, 26.4, 26.5, 26.6, 26.7, 26.8
 */

import {test} from '../../../src/test-helpers/tap.js';
import {DevTools} from '../../../src/cli/core/dev-tools.js';
import {EventBus} from '../../../src/cli/core/event-bus.js';
import {StateManager} from '../../../src/cli/core/state-manager.js';
import {ComponentRegistry} from '../../../src/cli/core/component-registry.js';

test('DevTools', async (t) => {
  await t.test('constructor initializes with default options', async (t) => {
    const devTools = new DevTools({enabled: true});

    t.equal(devTools.isVisible(), false, 'not visible by default');
    t.equal(devTools.getCurrentTab(), 'state', 'default tab is state');
    t.equal(devTools.isEnabled(), true, 'enabled when explicitly set');
  });

  await t.test('constructor respects enabled option', async (t) => {
    const devTools = new DevTools({enabled: false});
    t.equal(devTools.isEnabled(), false, 'disabled when option is false');
  });

  await t.test('show() sets visible and emits event', async (t) => {
    const eventBus = new EventBus();
    const devTools = new DevTools({eventBus, enabled: true});

    let emitted = false;
    eventBus.on('devtools:show', () => {
      emitted = true;
    });

    devTools.show();
    t.equal(devTools.isVisible(), true, 'is visible');
    t.equal(emitted, true, 'emitted devtools:show');
  });

  await t.test('show() does nothing when disabled', async (t) => {
    const devTools = new DevTools({enabled: false});

    devTools.show();
    t.equal(devTools.isVisible(), false, 'still not visible');
  });

  await t.test('hide() clears visible and emits event', async (t) => {
    const eventBus = new EventBus();
    const devTools = new DevTools({eventBus, enabled: true});

    devTools.show();

    let emitted = false;
    eventBus.on('devtools:hide', () => {
      emitted = true;
    });

    devTools.hide();
    t.equal(devTools.isVisible(), false, 'not visible');
    t.equal(emitted, true, 'emitted devtools:hide');
  });

  await t.test('toggle() toggles visibility', async (t) => {
    const devTools = new DevTools({enabled: true});

    t.equal(devTools.isVisible(), false);
    devTools.toggle();
    t.equal(devTools.isVisible(), true);
    devTools.toggle();
    t.equal(devTools.isVisible(), false);
  });

  await t.test('getTabs() returns all available tabs', async (t) => {
    const devTools = new DevTools();

    const tabs = devTools.getTabs();
    t.equal(tabs.length, 5, 'has 5 tabs');

    const tabIds = tabs.map((tab) => tab.id);
    t.ok(tabIds.includes('state'), 'has state tab');
    t.ok(tabIds.includes('events'), 'has events tab');
    t.ok(tabIds.includes('components'), 'has components tab');
    t.ok(tabIds.includes('cdc'), 'has cdc tab');
    t.ok(tabIds.includes('performance'), 'has performance tab');
  });

  await t.test('switchTab() changes current tab', async (t) => {
    const eventBus = new EventBus();
    const devTools = new DevTools({eventBus});

    let emittedTab = null;
    eventBus.on('devtools:tabChanged', (data) => {
      emittedTab = data.tab;
    });

    devTools.switchTab('events');
    t.equal(devTools.getCurrentTab(), 'events');
    t.equal(emittedTab, 'events', 'emitted tab change');
  });

  await t.test('switchTab() ignores invalid tabs', async (t) => {
    const devTools = new DevTools();

    devTools.switchTab('invalid');
    t.equal(devTools.getCurrentTab(), 'state', 'still on state tab');
  });

  await t.test('getStateContent() returns state tree', async (t) => {
    const eventBus = new EventBus();
    const stateManager = new StateManager(eventBus);
    const devTools = new DevTools({stateManager, eventBus});

    const content = devTools.getStateContent();
    t.equal(content.type, 'state');
    t.ok(content.state, 'has state');
    t.ok(content.stateTree, 'has state tree');
    t.ok(Array.isArray(content.snapshots), 'has snapshots array');
  });

  await t.test('getStateContent() handles missing stateManager', async (t) => {
    const devTools = new DevTools();

    const content = devTools.getStateContent();
    t.equal(content.type, 'state');
    t.equal(content.state, null);
    t.ok(content.error, 'has error message');
  });

  await t.test('formatStateTree() formats nested objects', async (t) => {
    const devTools = new DevTools();

    const obj = {
      name: 'test',
      count: 42,
      nested: {
        value: 'inner',
      },
      items: [1, 2, 3],
    };

    const tree = devTools.formatStateTree(obj);
    t.ok(tree.includes('name: "test"'), 'includes string value');
    t.ok(tree.includes('count: 42'), 'includes number value');
    t.ok(tree.includes('nested:'), 'includes nested object');
    t.ok(tree.includes('Array(3)'), 'includes array');
  });

  await t.test('formatValue() formats different types', async (t) => {
    const devTools = new DevTools();

    t.equal(devTools.formatValue(null), 'null');
    t.equal(devTools.formatValue(undefined), 'undefined');
    t.equal(devTools.formatValue(42), '42');
    t.equal(devTools.formatValue(true), 'true');
    t.equal(devTools.formatValue('test'), '"test"');
    t.ok(devTools.formatValue([1, 2]).includes('Array(2)'));
    t.ok(devTools.formatValue({a: 1}).includes('Object(1 keys)'));
  });

  await t.test('getEventsContent() returns event log', async (t) => {
    const eventBus = new EventBus({debugMode: true});
    const devTools = new DevTools({eventBus});

    // Emit some events
    eventBus.emit('test:event1', {data: 'one'});
    eventBus.emit('test:event2', {data: 'two'});

    const content = devTools.getEventsContent();
    t.equal(content.type, 'events');
    t.ok(Array.isArray(content.events), 'has events array');
    t.ok(content.totalCount >= 0, 'has total count');
  });

  await t.test('getEventsContent() handles missing eventBus', async (t) => {
    const devTools = new DevTools();

    const content = devTools.getEventsContent();
    t.equal(content.type, 'events');
    t.same(content.events, []);
    t.ok(content.error, 'has error message');
  });

  await t.test('getComponentsContent() returns registry info', async (t) => {
    const registry = new ComponentRegistry();
    registry.register('compA', () => ({}), {dependencies: []});
    registry.register('compB', () => ({}), {dependencies: ['compA']});

    const devTools = new DevTools({componentRegistry: registry});

    const content = devTools.getComponentsContent();
    t.equal(content.type, 'components');
    t.ok(content.components.includes('compA'), 'has compA');
    t.ok(content.components.includes('compB'), 'has compB');
    t.ok(content.dependencyGraph, 'has dependency graph');
    t.ok(content.initOrder, 'has init order');
  });

  await t.test('getComponentsContent() handles missing registry', async (t) => {
    const devTools = new DevTools();

    const content = devTools.getComponentsContent();
    t.equal(content.type, 'components');
    t.same(content.components, []);
    t.ok(content.error, 'has error message');
  });

  await t.test('trackCDCEvent() stores CDC events', async (t) => {
    const devTools = new DevTools();

    devTools.trackCDCEvent({
      timestamp: Date.now(),
      table: 'nodes',
      operation: 'INSERT',
      key: 'node-1',
    });

    const content = devTools.getCDCContent();
    t.equal(content.totalCount, 1);
    t.equal(content.events[0].table, 'nodes');
  });

  await t.test('setCDCFilter() filters CDC events', async (t) => {
    const devTools = new DevTools();

    devTools.trackCDCEvent({
      timestamp: Date.now(),
      table: 'nodes',
      operation: 'INSERT',
      key: 'node-1',
    });
    devTools.trackCDCEvent({
      timestamp: Date.now(),
      table: 'services',
      operation: 'UPDATE',
      key: 'svc-1',
    });

    devTools.setCDCFilter('nodes');
    const content = devTools.getCDCContent();

    t.equal(content.totalCount, 2, 'total count unchanged');
    t.equal(content.filteredCount, 1, 'filtered count is 1');
    t.equal(content.filter, 'nodes');
  });

  await t.test('trackRenderTime() stores render metrics', async (t) => {
    const devTools = new DevTools();

    devTools.trackRenderTime(10);
    devTools.trackRenderTime(20);
    devTools.trackRenderTime(15);

    const content = devTools.getPerformanceContent();
    t.equal(content.render.samples, 3);
    t.equal(content.render.avg, 15);
    t.equal(content.render.min, 10);
    t.equal(content.render.max, 20);
  });

  await t.test('trackEventLatency() stores latency metrics', async (t) => {
    const devTools = new DevTools();

    devTools.trackEventLatency(5);
    devTools.trackEventLatency(10);
    devTools.trackEventLatency(15);

    const content = devTools.getPerformanceContent();
    t.equal(content.eventLatency.samples, 3);
    t.equal(content.eventLatency.avg, 10);
  });

  await t.test('createSnapshot() creates state snapshot', async (t) => {
    const eventBus = new EventBus();
    const stateManager = new StateManager(eventBus);
    const devTools = new DevTools({stateManager, eventBus});

    let emittedIndex = null;
    eventBus.on('devtools:snapshotCreated', (data) => {
      emittedIndex = data.index;
    });

    const index = devTools.createSnapshot('test-snapshot');
    t.equal(typeof index, 'number');
    t.equal(emittedIndex, index, 'emitted snapshot created');
  });

  await t.test('createSnapshot() returns null without stateManager', async (t) => {
    const devTools = new DevTools();

    const index = devTools.createSnapshot();
    t.equal(index, null);
  });

  await t.test('restoreSnapshot() restores state', async (t) => {
    const eventBus = new EventBus();
    const stateManager = new StateManager(eventBus);
    const devTools = new DevTools({stateManager, eventBus});

    // Create snapshot
    const index = devTools.createSnapshot();

    // Modify state
    stateManager.setState({connectionStatus: 'connected'});

    // Restore
    const result = devTools.restoreSnapshot(index);
    t.equal(result, true);
    t.equal(stateManager.get('connectionStatus'), 'disconnected');
  });

  await t.test('restoreSnapshot() returns false on error', async (t) => {
    const eventBus = new EventBus();
    const stateManager = new StateManager(eventBus);
    const devTools = new DevTools({stateManager, eventBus});

    const result = devTools.restoreSnapshot(999);
    t.equal(result, false);
  });

  await t.test('getSnapshots() returns snapshot list', async (t) => {
    const eventBus = new EventBus();
    const stateManager = new StateManager(eventBus);
    const devTools = new DevTools({stateManager, eventBus});

    devTools.createSnapshot('snap1');
    devTools.createSnapshot('snap2');

    const snapshots = devTools.getSnapshots();
    t.equal(snapshots.length, 2);
  });

  await t.test('handleKey() switches tabs with number keys', async (t) => {
    const devTools = new DevTools({enabled: true});
    devTools.show();

    devTools.handleKey({name: '2', ch: '2'});
    t.equal(devTools.getCurrentTab(), 'events');

    devTools.handleKey({name: '3', ch: '3'});
    t.equal(devTools.getCurrentTab(), 'components');
  });

  await t.test('handleKey() closes with escape', async (t) => {
    const devTools = new DevTools({enabled: true});
    devTools.show();

    devTools.handleKey({name: 'escape'});
    t.equal(devTools.isVisible(), false);
  });

  await t.test('handleKey() closes with q', async (t) => {
    const devTools = new DevTools({enabled: true});
    devTools.show();

    devTools.handleKey({name: 'q', ch: 'q'});
    t.equal(devTools.isVisible(), false);
  });

  await t.test('handleKey() returns false when not visible', async (t) => {
    const devTools = new DevTools({enabled: true});

    const handled = devTools.handleKey({name: '1'});
    t.equal(handled, false);
  });

  await t.test('handleKey() creates snapshot with s', async (t) => {
    const eventBus = new EventBus();
    const stateManager = new StateManager(eventBus);
    const devTools = new DevTools({stateManager, eventBus, enabled: true});
    devTools.show();

    const handled = devTools.handleKey({name: 's', ch: 's'});
    t.equal(handled, true);

    const snapshots = devTools.getSnapshots();
    t.equal(snapshots.length, 1);
  });

  await t.test('handleKey() clears metrics with c on performance tab', async (t) => {
    const devTools = new DevTools({enabled: true});
    devTools.show();
    devTools.switchTab('performance');

    devTools.trackRenderTime(10);
    devTools.handleKey({name: 'c', ch: 'c'});

    const metrics = devTools.getMetrics();
    t.equal(metrics.renderTimes.length, 0);
  });

  await t.test('handleKey() clears CDC events with c on cdc tab', async (t) => {
    const devTools = new DevTools({enabled: true});
    devTools.show();
    devTools.switchTab('cdc');

    devTools.trackCDCEvent({
      timestamp: Date.now(),
      table: 'test',
      operation: 'INSERT',
      key: 'key-1',
    });

    devTools.handleKey({name: 'c', ch: 'c'});

    const content = devTools.getCDCContent();
    t.equal(content.totalCount, 0);
  });

  await t.test('formatTextContent() returns formatted string', async (t) => {
    const eventBus = new EventBus();
    const stateManager = new StateManager(eventBus);
    const devTools = new DevTools({stateManager, eventBus});

    const text = devTools.formatTextContent();
    t.ok(text.includes('DEV TOOLS'), 'has title');
    t.ok(text.includes('State'), 'has state tab');
    t.ok(text.includes('Keys:'), 'has key hints');
  });

  await t.test('resetMetrics() clears all metrics', async (t) => {
    const devTools = new DevTools();

    devTools.trackRenderTime(10);
    devTools.trackEventLatency(5);
    devTools.resetMetrics();

    const metrics = devTools.getMetrics();
    t.equal(metrics.renderTimes.length, 0);
    t.equal(metrics.eventLatencies.length, 0);
  });

  await t.test('clearCDCEvents() clears event history', async (t) => {
    const devTools = new DevTools();

    devTools.trackCDCEvent({
      timestamp: Date.now(),
      table: 'test',
      operation: 'INSERT',
      key: 'key-1',
    });

    devTools.clearCDCEvents();

    const content = devTools.getCDCContent();
    t.equal(content.totalCount, 0);
  });

  await t.test('destroy() cleans up resources', async (t) => {
    const eventBus = new EventBus();
    const devTools = new DevTools({eventBus, enabled: true});

    devTools.show();
    devTools.trackCDCEvent({
      timestamp: Date.now(),
      table: 'test',
      operation: 'INSERT',
      key: 'key-1',
    });
    devTools.trackRenderTime(10);

    let emitted = false;
    eventBus.on('devtools:destroyed', () => {
      emitted = true;
    });

    devTools.destroy();

    t.equal(devTools.isVisible(), false);
    t.equal(emitted, true, 'emitted devtools:destroyed');
  });

  await t.test('getTabContent() returns correct content for each tab', async (t) => {
    const eventBus = new EventBus();
    const stateManager = new StateManager(eventBus);
    const registry = new ComponentRegistry();
    const devTools = new DevTools({
      stateManager,
      eventBus,
      componentRegistry: registry,
    });

    devTools.switchTab('state');
    t.equal(devTools.getTabContent().type, 'state');

    devTools.switchTab('events');
    t.equal(devTools.getTabContent().type, 'events');

    devTools.switchTab('components');
    t.equal(devTools.getTabContent().type, 'components');

    devTools.switchTab('cdc');
    t.equal(devTools.getTabContent().type, 'cdc');

    devTools.switchTab('performance');
    t.equal(devTools.getTabContent().type, 'performance');
  });

  await t.test('calculateStats() handles empty array', async (t) => {
    const devTools = new DevTools();

    const stats = devTools.calculateStats([]);
    t.equal(stats.avg, 0);
    t.equal(stats.min, 0);
    t.equal(stats.max, 0);
  });

  await t.test('formatTimestamp() formats correctly', async (t) => {
    const devTools = new DevTools();

    // Use a known timestamp
    const timestamp = new Date('2024-01-15T10:30:45.123Z').getTime();
    const formatted = devTools.formatTimestamp(timestamp);

    t.ok(formatted.includes(':'), 'has time separator');
    t.equal(formatted.length, 12, 'correct length HH:mm:ss.SSS');
  });

  await t.test('formatDataPreview() truncates long data', async (t) => {
    const devTools = new DevTools();

    const longData = {key: 'a'.repeat(100)};
    const preview = devTools.formatDataPreview(longData);

    t.ok(preview.length <= 83, 'truncated to max length');
    t.ok(preview.endsWith('...'), 'ends with ellipsis');
  });

  await t.test('formatDataPreview() handles null/undefined', async (t) => {
    const devTools = new DevTools();

    t.equal(devTools.formatDataPreview(null), '');
    t.equal(devTools.formatDataPreview(undefined), '');
  });

  await t.test('metrics are limited to maxSamples', async (t) => {
    const devTools = new DevTools();
    devTools.metrics.maxSamples = 5;

    for (let i = 0; i < 10; i++) {
      devTools.trackRenderTime(i);
    }

    t.equal(devTools.metrics.renderTimes.length, 5);
    t.equal(devTools.metrics.renderTimes[0], 5, 'oldest samples removed');
  });

  await t.test('CDC events are limited to maxCDCEvents', async (t) => {
    const devTools = new DevTools();
    devTools.maxCDCEvents = 5;

    for (let i = 0; i < 10; i++) {
      devTools.trackCDCEvent({
        timestamp: Date.now(),
        table: 'test',
        operation: 'INSERT',
        key: `key-${i}`,
      });
    }

    const content = devTools.getCDCContent();
    t.equal(content.totalCount, 5);
  });

  await t.test('trackEventLatency() filters invalid values', async (t) => {
    const devTools = new DevTools();

    devTools.trackEventLatency(-1);
    devTools.trackEventLatency(10000);
    devTools.trackEventLatency(5);

    t.equal(devTools.metrics.eventLatencies.length, 1);
    t.equal(devTools.metrics.eventLatencies[0], 5);
  });
});
