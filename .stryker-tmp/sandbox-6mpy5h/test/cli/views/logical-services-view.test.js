// @ts-nocheck
import {test} from '../../../src/test-helpers/tap.js';
import {
  LogicalServicesView,
  LOGICAL_SERVICE_STATE,
} from '../../../src/cli/views/logical-services-view.js';
import {ROW_STATUS} from '../../../src/cli/core/base-view.js';

function createLogicalService(overrides = {}) {
  return {
    service_id: 'sys-admin-meta',
    service_name: 'sys-admin-meta',
    runtime_kind: 'native_js',
    replica_count: 2,
    replica_count_observed: 2,
    healthy_replica_count: 2,
    node_count: 2,
    nodes: ['node-1', 'node-2'],
    nodes_summary: 'node-1, node-2',
    status: LOGICAL_SERVICE_STATE.HEALTHY,
    ...overrides,
  };
}

test('LogicalServicesView', async (t) => {
  t.test('constructor initializes logical services view', async (t) => {
    const view = new LogicalServicesView();

    t.equal(view.viewName, 'services');
    t.equal(view.nodeFilter, null);
    t.equal(view.serviceIdFilter, null);
  });

  t.test('handleDrillDown navigates to replicas with serviceId filter', async (t) => {
    const view = new LogicalServicesView();
    view.setData([createLogicalService()]);

    const action = view.handleDrillDown();
    t.same(action, {
      action: 'drillDown',
      view: 'replicas',
      context: {serviceId: 'sys-admin-meta'},
    });
  });

  t.test('getRowStatus maps logical statuses to row status', async (t) => {
    const view = new LogicalServicesView();

    t.equal(
      view.getRowStatus(createLogicalService({status: LOGICAL_SERVICE_STATE.HEALTHY})),
      ROW_STATUS.NORMAL,
    );
    t.equal(
      view.getRowStatus(createLogicalService({status: LOGICAL_SERVICE_STATE.PARTIAL})),
      ROW_STATUS.WARNING,
    );
    t.equal(
      view.getRowStatus(createLogicalService({status: LOGICAL_SERVICE_STATE.DEGRADED})),
      ROW_STATUS.ERROR,
    );
  });

  t.test('node filter keeps only services with replicas on node', async (t) => {
    const view = new LogicalServicesView();
    view.setData([
      createLogicalService({service_id: 'svc-a', nodes: ['node-1']}),
      createLogicalService({service_id: 'svc-b', nodes: ['node-2']}),
    ]);

    view.setNodeFilter('node-1');

    t.equal(view.filteredData.length, 1);
    t.equal(view.filteredData[0].service_id, 'svc-a');
  });
});
