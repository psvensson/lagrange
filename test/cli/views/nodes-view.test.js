import {test} from '../../../src/test-helpers/tap.js';
import {NodesView, WARNING_THRESHOLDS} from
  '../../../src/cli/views/nodes-view.js';
import {ROW_STATUS} from '../../../src/cli/core/base-view.js';

/**
 * Create a sample node record
 * @param {Object} overrides - Field overrides
 * @return {Object} Node record
 */
function createNode(overrides = {}) {
  return {
    node_id: 'node-1',
    node_address: '192.168.1.1:8080',
    status: 'active',
    cpu_usage_percent: 45.5,
    memory_usage_percent: 60.0,
    disk_usage_percent: 50.0,
    services_count: 5,
    ...overrides,
  };
}

test('NodesView', async (t) => {
  t.test('constructor initializes with default state', async (t) => {
    const view = new NodesView();

    t.equal(view.viewName, 'nodes');
    t.equal(view.cache, null);
    t.equal(view.selectedIndex, 0);
  });

  t.test('getColumns returns correct column definitions', async (t) => {
    const view = new NodesView();
    const columns = view.getColumns();

    t.equal(columns.length, 7);
    t.equal(columns[0].key, 'node_id');
    t.equal(columns[0].label, 'Node ID');
    t.equal(columns[1].key, 'node_address');
    t.equal(columns[2].key, 'status');
    t.equal(columns[3].key, 'cpu_usage_percent');
    t.equal(columns[4].key, 'memory_usage_percent');
    t.equal(columns[5].key, 'disk_usage_percent');
    t.equal(columns[6].key, 'services_count');
    t.equal(columns[6].label, 'Replicas');
  });

  t.test('formatRow formats node data correctly', async (t) => {
    const view = new NodesView();
    const node = createNode();

    const row = view.formatRow(node);

    t.equal(row[0], 'node-1');
    t.equal(row[1], '192.168.1.1:8080');
    t.equal(row[2], 'active');
    t.equal(row[3], '45.5%');
    t.equal(row[4], '60.0%');
    t.equal(row[5], '50.0%');
    t.equal(row[6], '5');
  });

  t.test('formatRow handles missing values', async (t) => {
    const view = new NodesView();
    const node = {
      node_id: null,
      node_address: undefined,
      status: null,
      cpu_usage_percent: null,
      memory_usage_percent: undefined,
      disk_usage_percent: null,
      services_count: null,
    };

    const row = view.formatRow(node);

    t.equal(row[0], 'N/A');
    t.equal(row[1], 'N/A');
    t.equal(row[2], 'unknown');
    t.equal(row[3], 'N/A');
    t.equal(row[4], 'N/A');
    t.equal(row[5], 'N/A');
    t.equal(row[6], '0');
  });

  t.test('getRowStatus returns NORMAL for healthy node', async (t) => {
    const view = new NodesView();
    const node = createNode({
      status: 'active',
      cpu_usage_percent: 50,
      memory_usage_percent: 50,
      disk_usage_percent: 50,
    });

    t.equal(view.getRowStatus(node), ROW_STATUS.NORMAL);
  });

  t.test('getRowStatus returns ERROR for failed node', async (t) => {
    const view = new NodesView();

    t.equal(view.getRowStatus(createNode({status: 'failed'})), ROW_STATUS.ERROR);
    t.equal(view.getRowStatus(createNode({status: 'error'})), ROW_STATUS.ERROR);
  });

  t.test('getRowStatus returns WARNING for high CPU usage', async (t) => {
    const view = new NodesView();
    const node = createNode({
      cpu_usage_percent: WARNING_THRESHOLDS.CPU_PERCENT + 1,
    });

    t.equal(view.getRowStatus(node), ROW_STATUS.WARNING);
  });

  t.test('getRowStatus returns WARNING for high memory usage', async (t) => {
    const view = new NodesView();
    const node = createNode({
      memory_usage_percent: WARNING_THRESHOLDS.MEMORY_PERCENT + 1,
    });

    t.equal(view.getRowStatus(node), ROW_STATUS.WARNING);
  });

  t.test('getRowStatus returns WARNING for high disk usage', async (t) => {
    const view = new NodesView();
    const node = createNode({
      disk_usage_percent: WARNING_THRESHOLDS.DISK_PERCENT + 1,
    });

    t.equal(view.getRowStatus(node), ROW_STATUS.WARNING);
  });

  t.test('getRowStatus handles null resource values', async (t) => {
    const view = new NodesView();
    const node = createNode({
      cpu_usage_percent: null,
      memory_usage_percent: null,
      disk_usage_percent: null,
    });

    t.equal(view.getRowStatus(node), ROW_STATUS.NORMAL);
  });

  t.test('getItemKey returns node_id', async (t) => {
    const view = new NodesView();
    const node = createNode({node_id: 'test-node-123'});

    t.equal(view.getItemKey(node), 'test-node-123');
  });

  t.test('getItemKey handles missing node_id', async (t) => {
    const view = new NodesView();
    const node = {status: 'active'};

    t.equal(view.getItemKey(node), '');
  });

  t.test('handleDrillDown returns navigation action', async (t) => {
    const view = new NodesView();
    view.setData([createNode({node_id: 'node-1'})]);

    const action = view.handleDrillDown();

    t.same(action, {
      action: 'drillDown',
      view: 'replicas',
      context: {nodeId: 'node-1'},
    });
  });

  t.test('handleDrillDown returns null when no selection', async (t) => {
    const view = new NodesView();
    view.setData([]);

    const action = view.handleDrillDown();

    t.equal(action, null);
  });

  t.test('handleKey triggers drill-down on Enter', async (t) => {
    const view = new NodesView();
    view.setData([createNode({node_id: 'node-1'})]);

    const result = view.handleKey({name: 'enter'});

    t.same(result, {
      action: 'drillDown',
      view: 'replicas',
      context: {nodeId: 'node-1'},
    });
  });

  t.test('handleKey triggers drill-down on Return', async (t) => {
    const view = new NodesView();
    view.setData([createNode({node_id: 'node-1'})]);

    const result = view.handleKey({name: 'return'});

    t.same(result, {
      action: 'drillDown',
      view: 'replicas',
      context: {nodeId: 'node-1'},
    });
  });

  t.test('getSelectedDetails returns node details', async (t) => {
    const view = new NodesView();
    view.setData([createNode()]);

    const details = view.getSelectedDetails();

    t.equal(details.title, 'Node: node-1');
    t.equal(details.sections.length, 3);
    t.equal(details.sections[0].title, 'Basic Information');
    t.equal(details.sections[1].title, 'Resource Statistics');
    t.equal(details.sections[2].title, 'Replicas');
  });

  t.test('getSelectedDetails returns null when no selection', async (t) => {
    const view = new NodesView();
    view.setData([]);

    const details = view.getSelectedDetails();

    t.equal(details, null);
  });

  t.test('render includes all nodes', async (t) => {
    const view = new NodesView();
    const nodes = [
      createNode({node_id: 'node-1'}),
      createNode({node_id: 'node-2'}),
      createNode({node_id: 'node-3'}),
    ];
    view.setData(nodes);

    const result = view.render();

    t.equal(result.rows.length, 3);
    t.equal(result.totalCount, 3);
    t.equal(result.filteredCount, 3);
  });

  t.test('filter works correctly', async (t) => {
    const view = new NodesView();
    const nodes = [
      createNode({node_id: 'node-1', node_address: '192.168.1.1:8080'}),
      createNode({node_id: 'node-2', node_address: '192.168.1.2:8080'}),
      createNode({node_id: 'node-3', node_address: '10.0.0.1:8080'}),
    ];
    view.setData(nodes);
    view.setFilter('192.168');

    const result = view.render();

    t.equal(result.filteredCount, 2);
    t.equal(result.totalCount, 3);
  });

  t.test('sort works correctly', async (t) => {
    const view = new NodesView();
    const nodes = [
      createNode({node_id: 'node-3', cpu_usage_percent: 30}),
      createNode({node_id: 'node-1', cpu_usage_percent: 10}),
      createNode({node_id: 'node-2', cpu_usage_percent: 20}),
    ];
    view.setData(nodes);
    view.setSort('cpu_usage_percent', 'asc');

    const result = view.render();

    t.equal(result.rows[0].item.node_id, 'node-1');
    t.equal(result.rows[1].item.node_id, 'node-2');
    t.equal(result.rows[2].item.node_id, 'node-3');
  });
});
