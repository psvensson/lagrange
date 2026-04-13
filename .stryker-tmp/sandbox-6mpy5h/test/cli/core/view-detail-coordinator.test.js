// @ts-nocheck
import {test} from '../../../src/test-helpers/tap.js';
import {
  ViewDetailCoordinator,
  DETAIL_LAYOUT,
} from '../../../src/cli/core/view-detail-coordinator.js';
// ViewManager imported for potential future use
import {BaseView} from '../../../src/cli/core/base-view.js';
import {EventBus} from '../../../src/cli/core/event-bus.js';

/**
 * Test view implementation
 */
class _TestView extends BaseView {
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

test('ViewDetailCoordinator', async (t) => {
  t.test('constructor initializes with default state', async (t) => {
    const coordinator = new ViewDetailCoordinator();

    t.equal(coordinator.detailPanelVisible, false);
    t.equal(coordinator.currentLayout, DETAIL_LAYOUT.SIDE);
    t.equal(coordinator.currentDetailData, null);
    t.equal(coordinator.getRegisteredViewCount(), 0);
  });

  t.test('registerView adds view configuration', async (t) => {
    const coordinator = new ViewDetailCoordinator();

    coordinator.registerView('nodes', {
      hasDetails: true,
      layout: DETAIL_LAYOUT.BOTTOM,
    });

    t.ok(coordinator.hasView('nodes'));
    t.equal(coordinator.getRegisteredViewCount(), 1);

    const config = coordinator.getViewConfig('nodes');
    t.equal(config.hasDetails, true);
    t.equal(config.layout, DETAIL_LAYOUT.BOTTOM);
  });

  t.test('registerView uses defaults for missing config', async (t) => {
    const coordinator = new ViewDetailCoordinator();

    coordinator.registerView('nodes', {});

    const config = coordinator.getViewConfig('nodes');
    t.equal(config.hasDetails, true);
    t.equal(config.layout, DETAIL_LAYOUT.SIDE);
    t.equal(config.preserveOnSwitch, false);
  });

  t.test('unregisterView removes view', async (t) => {
    const coordinator = new ViewDetailCoordinator();

    coordinator.registerView('nodes', {});
    t.ok(coordinator.hasView('nodes'));

    coordinator.unregisterView('nodes');
    t.notOk(coordinator.hasView('nodes'));
  });

  t.test('showDetailPanel sets visibility', async (t) => {
    const coordinator = new ViewDetailCoordinator();

    t.equal(coordinator.isDetailPanelVisible(), false);

    coordinator.showDetailPanel();
    t.equal(coordinator.isDetailPanelVisible(), true);
  });

  t.test('hideDetailPanel clears visibility', async (t) => {
    const coordinator = new ViewDetailCoordinator();

    coordinator.showDetailPanel();
    t.equal(coordinator.isDetailPanelVisible(), true);

    coordinator.hideDetailPanel();
    t.equal(coordinator.isDetailPanelVisible(), false);
  });

  t.test('toggleDetailPanel toggles visibility', async (t) => {
    const coordinator = new ViewDetailCoordinator();

    t.equal(coordinator.isDetailPanelVisible(), false);

    coordinator.toggleDetailPanel();
    t.equal(coordinator.isDetailPanelVisible(), true);

    coordinator.toggleDetailPanel();
    t.equal(coordinator.isDetailPanelVisible(), false);
  });

  t.test('setLayout changes layout', async (t) => {
    const coordinator = new ViewDetailCoordinator();

    t.equal(coordinator.getLayout(), DETAIL_LAYOUT.SIDE);

    coordinator.setLayout(DETAIL_LAYOUT.BOTTOM);
    t.equal(coordinator.getLayout(), DETAIL_LAYOUT.BOTTOM);

    coordinator.setLayout(DETAIL_LAYOUT.OVERLAY);
    t.equal(coordinator.getLayout(), DETAIL_LAYOUT.OVERLAY);
  });

  t.test('setLayout throws on invalid layout', async (t) => {
    const coordinator = new ViewDetailCoordinator();

    t.throws(() => coordinator.setLayout('invalid'), /Invalid layout/);
  });

  t.test('updateDetailPanel stores detail data', async (t) => {
    const coordinator = new ViewDetailCoordinator();

    const detailData = {type: 'node', item: {id: 'node-1'}};
    coordinator.updateDetailPanel(detailData);

    t.same(coordinator.getDetailData(), detailData);
  });

  t.test('clearDetailData clears detail data', async (t) => {
    const coordinator = new ViewDetailCoordinator();

    coordinator.updateDetailPanel({type: 'test'});
    t.ok(coordinator.getDetailData());

    coordinator.clearDetailData();
    t.equal(coordinator.getDetailData(), null);
  });

  t.test('getDefaultDetailData creates detail from item', async (t) => {
    const coordinator = new ViewDetailCoordinator();

    const item = {id: 'test-1', name: 'Test', value: 42};
    const detail = coordinator.getDefaultDetailData(item);

    t.equal(detail.type, 'default');
    t.equal(detail.item, item);
    t.ok(Array.isArray(detail.fields));
    t.equal(detail.fields.length, 3);
    t.ok(detail.fields.some((f) => f.key === 'id' && f.value === 'test-1'));
  });

  t.test('handleSelectionChange updates detail panel', async (t) => {
    const eventBus = new EventBus();
    const coordinator = new ViewDetailCoordinator({eventBus});

    coordinator.registerView('nodes', {hasDetails: true});

    const events = [];
    eventBus.on('detailCoordinator:detailUpdated', (data) => {
      events.push(data);
    });

    coordinator.handleSelectionChange({
      viewName: 'nodes',
      selectedItem: {id: 'node-1', name: 'Node 1'},
    });

    t.equal(events.length, 1);
    t.ok(coordinator.getDetailData());
  });

  t.test('handleSelectionChange clears on empty selection', async (t) => {
    const eventBus = new EventBus();
    const coordinator = new ViewDetailCoordinator({eventBus});

    coordinator.registerView('nodes', {hasDetails: true});
    coordinator.updateDetailPanel({type: 'test'});

    coordinator.handleSelectionChange({
      viewName: 'nodes',
      selectedItem: null,
    });

    t.equal(coordinator.getDetailData(), null);
  });

  t.test('handleSelectionChange uses custom getDetailData', async (t) => {
    const coordinator = new ViewDetailCoordinator();

    coordinator.registerView('nodes', {
      hasDetails: true,
      getDetailData: (item) => ({type: 'custom', nodeId: item.id}),
    });

    coordinator.handleSelectionChange({
      viewName: 'nodes',
      selectedItem: {id: 'node-1'},
    });

    const detail = coordinator.getDetailData();
    t.equal(detail.type, 'custom');
    t.equal(detail.nodeId, 'node-1');
  });

  t.test('handleViewSwitch updates layout from config', async (t) => {
    const coordinator = new ViewDetailCoordinator();

    coordinator.registerView('nodes', {layout: DETAIL_LAYOUT.SIDE});
    coordinator.registerView('services', {layout: DETAIL_LAYOUT.BOTTOM});

    coordinator.handleViewSwitch({viewName: 'nodes'});
    t.equal(coordinator.getLayout(), DETAIL_LAYOUT.SIDE);

    coordinator.handleViewSwitch({viewName: 'services'});
    t.equal(coordinator.getLayout(), DETAIL_LAYOUT.BOTTOM);
  });

  t.test('handleViewSwitch clears detail when not preserving', async (t) => {
    const coordinator = new ViewDetailCoordinator();

    coordinator.registerView('nodes', {preserveOnSwitch: false});
    coordinator.updateDetailPanel({type: 'test'});

    coordinator.handleViewSwitch({viewName: 'nodes'});

    t.equal(coordinator.getDetailData(), null);
  });

  t.test('handleViewSwitch preserves detail when configured', async (t) => {
    const coordinator = new ViewDetailCoordinator();

    coordinator.registerView('nodes', {preserveOnSwitch: true});
    coordinator.updateDetailPanel({type: 'test'});

    coordinator.handleViewSwitch({viewName: 'nodes'});

    t.ok(coordinator.getDetailData());
  });

  t.test('handleViewSwitch hides panel for view without details', async (t) => {
    const coordinator = new ViewDetailCoordinator();

    coordinator.registerView('sql', {hasDetails: false});
    coordinator.showDetailPanel();

    coordinator.handleViewSwitch({viewName: 'sql'});

    t.equal(coordinator.isDetailPanelVisible(), false);
  });

  t.test('setPreserveDetailOnSwitch affects behavior', async (t) => {
    const coordinator = new ViewDetailCoordinator();

    coordinator.registerView('nodes', {preserveOnSwitch: false});
    coordinator.setPreserveDetailOnSwitch(true);
    coordinator.updateDetailPanel({type: 'test'});

    coordinator.handleViewSwitch({viewName: 'nodes'});

    // Global preserve should override view config
    t.ok(coordinator.getDetailData());
  });

  t.test('emits events via event bus', async (t) => {
    const eventBus = new EventBus();
    const coordinator = new ViewDetailCoordinator({eventBus});

    const events = [];
    eventBus.on('detailCoordinator:*', (data, event) => {
      events.push({event, data});
    });

    coordinator.registerView('nodes', {});
    coordinator.showDetailPanel();
    coordinator.hideDetailPanel();
    coordinator.setLayout(DETAIL_LAYOUT.BOTTOM);

    t.ok(events.some((e) => e.event.includes('viewRegistered')));
    t.ok(events.some((e) => e.event.includes('panelShown')));
    t.ok(events.some((e) => e.event.includes('panelHidden')));
    t.ok(events.some((e) => e.event.includes('layoutChanged')));
  });

  t.test('responds to viewManager:viewSwitched events', async (t) => {
    const eventBus = new EventBus();
    const coordinator = new ViewDetailCoordinator({eventBus});

    coordinator.registerView('nodes', {layout: DETAIL_LAYOUT.BOTTOM});

    eventBus.emit('viewManager:viewSwitched', {viewName: 'nodes'});

    t.equal(coordinator.getLayout(), DETAIL_LAYOUT.BOTTOM);
  });

  t.test('responds to view:selectionChanged events', async (t) => {
    const eventBus = new EventBus();
    const coordinator = new ViewDetailCoordinator({eventBus});

    coordinator.registerView('nodes', {hasDetails: true});

    eventBus.emit('view:selectionChanged', {
      viewName: 'nodes',
      selectedItem: {id: 'node-1'},
    });

    t.ok(coordinator.getDetailData());
  });

  t.test('destroy cleans up state', async (t) => {
    const coordinator = new ViewDetailCoordinator();

    coordinator.registerView('nodes', {});
    coordinator.showDetailPanel();
    coordinator.updateDetailPanel({type: 'test'});

    coordinator.destroy();

    t.equal(coordinator.getRegisteredViewCount(), 0);
    t.equal(coordinator.isDetailPanelVisible(), false);
    t.equal(coordinator.getDetailData(), null);
  });

  t.test('DETAIL_LAYOUT exports correct values', async (t) => {
    t.equal(DETAIL_LAYOUT.SIDE, 'side');
    t.equal(DETAIL_LAYOUT.BOTTOM, 'bottom');
    t.equal(DETAIL_LAYOUT.OVERLAY, 'overlay');
  });
});
