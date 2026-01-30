import {test} from '../../../src/test-helpers/tap.js';
import {
  OperationsView,
  OPERATION_STATUS,
  ADD_WORKFLOW_STEPS,
  REMOVE_WORKFLOW_STEPS,
} from '../../../src/cli/views/operations-view.js';
import {ROW_STATUS} from '../../../src/cli/core/base-view.js';

/**
 * Create a sample operation record
 * @param {Object} overrides - Field overrides
 * @return {Object} Operation record
 */
function createOperation(overrides = {}) {
  return {
    operation_id: 'op-12345678-1234-1234-1234-123456789012',
    type: 'ADD',
    partition_id: 'part-12345678-1234-1234-1234-123456789012',
    replica_id: 'rep-12345678-1234-1234-1234-123456789012',
    source_node_id: 'node-source-1234',
    target_node_id: 'node-target-5678',
    status: 'syncing',
    workflow_step: 'SYNCING',
    created_at: 1700000000000,
    updated_at: 1700000100000,
    completed_at: null,
    error_message: null,
    steps_history: JSON.stringify([
      {step: 'PENDING', timestamp: 1700000000000},
      {step: 'SENDING', timestamp: 1700000010000},
      {step: 'CREATING', timestamp: 1700000050000},
      {step: 'SYNCING', timestamp: 1700000100000},
    ]),
    ...overrides,
  };
}

test('OperationsView', async (t) => {
  t.test('constructor initializes with default state', async (t) => {
    const view = new OperationsView();

    t.equal(view.viewName, 'operations');
    t.equal(view.cache, null);
    t.equal(view.selectedIndex, 0);
  });

  t.test('getColumns returns correct column definitions', async (t) => {
    const view = new OperationsView();
    const columns = view.getColumns();

    t.equal(columns.length, 7);
    t.equal(columns[0].key, 'operation_id');
    t.equal(columns[1].key, 'type');
    t.equal(columns[2].key, 'partition_id');
    t.equal(columns[3].key, 'target_node_id');
    t.equal(columns[4].key, 'status');
    t.equal(columns[5].key, 'workflow_step');
    t.equal(columns[6].key, 'updated_at');
  });

  t.test('formatRow formats operation data correctly', async (t) => {
    const view = new OperationsView();
    const operation = createOperation();

    const row = view.formatRow(operation);

    t.equal(row[0], 'op-12345...');
    t.equal(row[1], 'ADD');
    t.equal(row[2], 'part-123...');
    t.equal(row[3], 'node-tar...');
    t.equal(row[4], 'syncing');
    t.equal(row[5], 'SYNCING');
    t.ok(row[6].includes('2023-11-14'));
  });

  t.test('formatRow handles missing values', async (t) => {
    const view = new OperationsView();
    const operation = {
      operation_id: null,
      type: null,
      partition_id: undefined,
      target_node_id: null,
      status: null,
      workflow_step: undefined,
      updated_at: null,
    };

    const row = view.formatRow(operation);

    t.equal(row[0], 'N/A');
    t.equal(row[1], 'N/A');
    t.equal(row[2], 'N/A');
    t.equal(row[3], 'N/A');
    t.equal(row[4], 'unknown');
    t.equal(row[5], 'N/A');
    t.equal(row[6], 'N/A');
  });

  t.test('getRowStatus returns NORMAL for completed operation', async (t) => {
    const view = new OperationsView();
    const operation = createOperation({status: OPERATION_STATUS.ACTIVE});

    t.equal(view.getRowStatus(operation), ROW_STATUS.NORMAL);
  });

  t.test('getRowStatus returns NORMAL for removed operation', async (t) => {
    const view = new OperationsView();
    const operation = createOperation({status: OPERATION_STATUS.REMOVED});

    t.equal(view.getRowStatus(operation), ROW_STATUS.NORMAL);
  });

  t.test('getRowStatus returns ERROR for failed operation', async (t) => {
    const view = new OperationsView();
    const operation = createOperation({status: OPERATION_STATUS.FAILED});

    t.equal(view.getRowStatus(operation), ROW_STATUS.ERROR);
  });

  t.test('getRowStatus returns WARNING for in-progress operation', async (t) => {
    const view = new OperationsView();

    t.equal(
      view.getRowStatus(createOperation({status: OPERATION_STATUS.PENDING})),
      ROW_STATUS.WARNING,
    );
    t.equal(
      view.getRowStatus(createOperation({status: OPERATION_STATUS.CREATING})),
      ROW_STATUS.WARNING,
    );
    t.equal(
      view.getRowStatus(createOperation({status: OPERATION_STATUS.SYNCING})),
      ROW_STATUS.WARNING,
    );
    t.equal(
      view.getRowStatus(createOperation({status: OPERATION_STATUS.REMOVING})),
      ROW_STATUS.WARNING,
    );
  });

  t.test('getItemKey returns operation_id', async (t) => {
    const view = new OperationsView();
    const operation = createOperation({operation_id: 'test-op-123'});

    t.equal(view.getItemKey(operation), 'test-op-123');
  });

  t.test('getItemKey handles missing operation_id', async (t) => {
    const view = new OperationsView();
    const operation = {status: 'active'};

    t.equal(view.getItemKey(operation), '');
  });

  t.test('handleDrillDown returns navigation action', async (t) => {
    const view = new OperationsView();
    view.setData([createOperation({partition_id: 'part-123'})]);

    const action = view.handleDrillDown();

    t.same(action, {
      action: 'drillDown',
      view: 'partitions',
      context: {partitionId: 'part-123'},
    });
  });

  t.test('handleDrillDown returns null when no selection', async (t) => {
    const view = new OperationsView();
    view.setData([]);

    const action = view.handleDrillDown();

    t.equal(action, null);
  });

  t.test('getSelectedDetails returns operation details', async (t) => {
    const view = new OperationsView();
    view.setData([createOperation()]);

    const details = view.getSelectedDetails();

    t.ok(details.title.includes('Operation:'));
    t.ok(details.sections.length >= 3);
    t.equal(details.sections[0].title, 'Operation Information');
    t.equal(details.sections[1].title, 'Target Information');
    t.equal(details.sections[2].title, 'Timestamps');
  });

  t.test('getSelectedDetails includes error section when error exists', async (t) => {
    const view = new OperationsView();
    view.setData([createOperation({
      status: OPERATION_STATUS.FAILED,
      error_message: 'Connection timeout',
    })]);

    const details = view.getSelectedDetails();

    const errorSection = details.sections.find((s) => s.title === 'Error');
    t.ok(errorSection);
    t.equal(errorSection.fields[0].value, 'Connection timeout');
  });

  t.test('getSelectedDetails includes workflow history', async (t) => {
    const view = new OperationsView();
    view.setData([createOperation()]);

    const details = view.getSelectedDetails();

    const historySection = details.sections.find((s) => s.title === 'Workflow History');
    t.ok(historySection);
    t.equal(historySection.fields.length, 4);
  });

  t.test('getSelectedDetails returns null when no selection', async (t) => {
    const view = new OperationsView();
    view.setData([]);

    const details = view.getSelectedDetails();

    t.equal(details, null);
  });

  t.test('render includes all operations', async (t) => {
    const view = new OperationsView();
    const operations = [
      createOperation({operation_id: 'op-1'}),
      createOperation({operation_id: 'op-2'}),
      createOperation({operation_id: 'op-3'}),
    ];
    view.setData(operations);

    const result = view.render();

    t.equal(result.rows.length, 3);
    t.equal(result.totalCount, 3);
    t.equal(result.filteredCount, 3);
  });

  t.test('filter works correctly', async (t) => {
    const view = new OperationsView();
    const operations = [
      createOperation({operation_id: 'op-1', type: 'ADD'}),
      createOperation({operation_id: 'op-2', type: 'REMOVE'}),
      createOperation({operation_id: 'op-3', type: 'ADD'}),
    ];
    view.setData(operations);
    view.setFilter('REMOVE');

    const result = view.render();

    t.equal(result.filteredCount, 1);
    t.equal(result.totalCount, 3);
  });

  t.test('getInFlightCount returns correct count', async (t) => {
    const view = new OperationsView();
    const operations = [
      createOperation({status: OPERATION_STATUS.SYNCING}),
      createOperation({status: OPERATION_STATUS.ACTIVE}),
      createOperation({status: OPERATION_STATUS.PENDING}),
      createOperation({status: OPERATION_STATUS.FAILED}),
    ];
    view.setData(operations);

    t.equal(view.getInFlightCount(), 2);
  });

  t.test('getCompletedCount returns correct count', async (t) => {
    const view = new OperationsView();
    const operations = [
      createOperation({status: OPERATION_STATUS.ACTIVE}),
      createOperation({status: OPERATION_STATUS.REMOVED}),
      createOperation({status: OPERATION_STATUS.SYNCING}),
      createOperation({status: OPERATION_STATUS.FAILED}),
    ];
    view.setData(operations);

    t.equal(view.getCompletedCount(), 2);
  });

  t.test('getFailedCount returns correct count', async (t) => {
    const view = new OperationsView();
    const operations = [
      createOperation({status: OPERATION_STATUS.ACTIVE}),
      createOperation({status: OPERATION_STATUS.FAILED}),
      createOperation({status: OPERATION_STATUS.FAILED}),
    ];
    view.setData(operations);

    t.equal(view.getFailedCount(), 2);
  });

  t.test('exports workflow step constants', async (t) => {
    t.same(ADD_WORKFLOW_STEPS, ['PENDING', 'SENDING', 'CREATING', 'SYNCING', 'ACTIVE']);
    t.same(REMOVE_WORKFLOW_STEPS, ['PENDING', 'SENDING', 'STOPPING', 'REMOVED']);
  });
});
