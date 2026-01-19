import {test} from 'tap';
import {ServicesView, SERVICE_TYPES} from
  '../../../src/cli/views/services-view.js';
import {ROW_STATUS} from '../../../src/cli/core/base-view.js';

/**
 * Create a sample service record
 * @param {Object} overrides - Field overrides
 * @return {Object} Service record
 */
function createService(overrides = {}) {
  return {
    service_id: 'svc-1',
    service_type: 'partition',
    node_id: 'node-1',
    status: 'active',
    address: '192.168.1.1:8080',
    role: null,
    partition_id: null,
    group_id: null,
    storage_bytes: null,
    ...overrides,
  };
}

test('ServicesView', async (t) => {
  t.test('constructor initializes with default state', async (t) => {
    const view = new ServicesView();

    t.equal(view.viewName, 'services');
    t.equal(view.cache, null);
    t.equal(view.nodeFilter, null);
    t.equal(view.typeFilter, null);
  });

  t.test('getColumns returns correct column definitions', async (t) => {
    const view = new ServicesView();
    const columns = view.getColumns();

    t.equal(columns.length, 5);
    t.equal(columns[0].key, 'service_id');
    t.equal(columns[1].key, 'service_type');
    t.equal(columns[2].key, 'node_id');
    t.equal(columns[3].key, 'status');
    t.equal(columns[4].key, 'address');
  });

  t.test('formatRow formats service data correctly', async (t) => {
    const view = new ServicesView();
    const service = createService();

    const row = view.formatRow(service);

    t.equal(row[0], 'svc-1');
    t.equal(row[1], 'Partition');
    t.equal(row[2], 'node-1');
    t.equal(row[3], 'active');
    t.equal(row[4], '192.168.1.1:8080');
  });

  t.test('formatRow handles missing values', async (t) => {
    const view = new ServicesView();
    const service = {
      service_id: null,
      service_type: null,
      node_id: undefined,
      status: null,
      address: null,
    };

    const row = view.formatRow(service);

    t.equal(row[0], 'N/A');
    t.equal(row[1], 'N/A');
    t.equal(row[2], 'N/A');
    t.equal(row[3], 'unknown');
    t.equal(row[4], 'N/A');
  });

  t.test('formatServiceType formats types correctly', async (t) => {
    const view = new ServicesView();

    t.equal(view.formatServiceType('partition'), 'Partition');
    t.equal(view.formatServiceType('message_group'), 'Message Group');
    t.equal(view.formatServiceType('node'), 'Node');
    t.equal(view.formatServiceType('custom'), 'custom');
    t.equal(view.formatServiceType(null), 'N/A');
  });

  t.test('formatStatus includes role when present', async (t) => {
    const view = new ServicesView();

    const leaderService = createService({status: 'active', role: 'leader'});
    t.equal(view.formatStatus(leaderService), 'active (leader)');

    const followerService = createService({status: 'active', role: 'follower'});
    t.equal(view.formatStatus(followerService), 'active (follower)');

    const noRoleService = createService({status: 'active', role: null});
    t.equal(view.formatStatus(noRoleService), 'active');
  });

  t.test('getRowStatus returns ERROR for failed services', async (t) => {
    const view = new ServicesView();

    t.equal(view.getRowStatus(createService({status: 'failed'})),
      ROW_STATUS.ERROR);
    t.equal(view.getRowStatus(createService({status: 'error'})),
      ROW_STATUS.ERROR);
  });

  t.test('getRowStatus returns WARNING for transitional states', async (t) => {
    const view = new ServicesView();

    t.equal(view.getRowStatus(createService({status: 'starting'})),
      ROW_STATUS.WARNING);
    t.equal(view.getRowStatus(createService({status: 'stopping'})),
      ROW_STATUS.WARNING);
  });

  t.test('getRowStatus returns NORMAL for active services', async (t) => {
    const view = new ServicesView();

    t.equal(view.getRowStatus(createService({status: 'active'})),
      ROW_STATUS.NORMAL);
  });

  t.test('getItemKey returns service_id', async (t) => {
    const view = new ServicesView();
    const service = createService({service_id: 'test-svc-123'});

    t.equal(view.getItemKey(service), 'test-svc-123');
  });

  t.test('setNodeFilter filters by node', async (t) => {
    const view = new ServicesView();
    const services = [
      createService({service_id: 'svc-1', node_id: 'node-1'}),
      createService({service_id: 'svc-2', node_id: 'node-2'}),
      createService({service_id: 'svc-3', node_id: 'node-1'}),
    ];
    view.setData(services);

    view.setNodeFilter('node-1');

    t.equal(view.filteredData.length, 2);
    t.ok(view.filteredData.every((s) => s.node_id === 'node-1'));
  });

  t.test('setTypeFilter filters by type', async (t) => {
    const view = new ServicesView();
    const services = [
      createService({service_id: 'svc-1', service_type: 'partition'}),
      createService({service_id: 'svc-2', service_type: 'message_group'}),
      createService({service_id: 'svc-3', service_type: 'partition'}),
    ];
    view.setData(services);

    view.setTypeFilter('partition');

    t.equal(view.filteredData.length, 2);
    t.ok(view.filteredData.every((s) => s.service_type === 'partition'));
  });

  t.test('clearServiceFilters removes all filters', async (t) => {
    const view = new ServicesView();
    const services = [
      createService({service_id: 'svc-1', node_id: 'node-1',
        service_type: 'partition'}),
      createService({service_id: 'svc-2', node_id: 'node-2',
        service_type: 'message_group'}),
    ];
    view.setData(services);

    view.setNodeFilter('node-1');
    view.setTypeFilter('partition');
    t.equal(view.filteredData.length, 1);

    view.clearServiceFilters();
    t.equal(view.filteredData.length, 2);
    t.equal(view.nodeFilter, null);
    t.equal(view.typeFilter, null);
  });

  t.test('handleDrillDown returns partition navigation', async (t) => {
    const view = new ServicesView();
    view.setData([createService({
      service_id: 'svc-1',
      service_type: 'partition',
      partition_id: 'part-1',
    })]);

    const action = view.handleDrillDown();

    t.same(action, {
      action: 'drillDown',
      view: 'partitions',
      context: {partitionId: 'part-1', serviceId: 'svc-1'},
    });
  });

  t.test('handleDrillDown returns message_group navigation', async (t) => {
    const view = new ServicesView();
    view.setData([createService({
      service_id: 'svc-1',
      service_type: 'message_group',
      group_id: 'mg-1',
    })]);

    const action = view.handleDrillDown();

    t.same(action, {
      action: 'drillDown',
      view: 'message_groups',
      context: {groupId: 'mg-1', serviceId: 'svc-1'},
    });
  });

  t.test('handleDrillDown returns node navigation for node services',
    async (t) => {
      const view = new ServicesView();
      view.setData([createService({
        service_id: 'svc-1',
        service_type: 'node',
        node_id: 'node-1',
      })]);

      const action = view.handleDrillDown();

      t.same(action, {
        action: 'drillDown',
        view: 'nodes',
        context: {nodeId: 'node-1'},
      });
    });

  t.test('handleDrillDown returns null for unknown types', async (t) => {
    const view = new ServicesView();
    view.setData([createService({
      service_id: 'svc-1',
      service_type: 'unknown',
    })]);

    const action = view.handleDrillDown();

    t.equal(action, null);
  });

  t.test('handleDrillDown returns null when no selection', async (t) => {
    const view = new ServicesView();
    view.setData([]);

    const action = view.handleDrillDown();

    t.equal(action, null);
  });

  t.test('getSelectedDetails returns service details', async (t) => {
    const view = new ServicesView();
    view.setData([createService()]);

    const details = view.getSelectedDetails();

    t.equal(details.title, 'Service: svc-1');
    t.ok(details.sections.length >= 1);
    t.equal(details.sections[0].title, 'Basic Information');
  });

  t.test('getSelectedDetails includes partition details', async (t) => {
    const view = new ServicesView();
    view.setData([createService({
      service_type: 'partition',
      partition_id: 'part-1',
      storage_bytes: 1024,
      role: 'leader',
    })]);

    const details = view.getSelectedDetails();

    t.equal(details.sections.length, 2);
    t.equal(details.sections[1].title, 'Partition Details');
  });

  t.test('getSelectedDetails includes message group details', async (t) => {
    const view = new ServicesView();
    view.setData([createService({
      service_type: 'message_group',
      group_id: 'mg-1',
      storage_bytes: 2048,
      role: 'follower',
    })]);

    const details = view.getSelectedDetails();

    t.equal(details.sections.length, 2);
    t.equal(details.sections[1].title, 'Message Group Details');
  });

  t.test('formatBytes formats sizes correctly', async (t) => {
    const view = new ServicesView();

    t.equal(view.formatBytes(null), 'N/A');
    t.equal(view.formatBytes(undefined), 'N/A');
    t.equal(view.formatBytes(0), '0 B');
    t.equal(view.formatBytes(512), '512.0 B');
    t.equal(view.formatBytes(1024), '1.0 KB');
    t.equal(view.formatBytes(1048576), '1.0 MB');
    t.equal(view.formatBytes(1073741824), '1.0 GB');
  });

  t.test('SERVICE_TYPES constants are correct', async (t) => {
    t.equal(SERVICE_TYPES.PARTITION, 'partition');
    t.equal(SERVICE_TYPES.MESSAGE_GROUP, 'message_group');
    t.equal(SERVICE_TYPES.NODE, 'node');
  });
});
