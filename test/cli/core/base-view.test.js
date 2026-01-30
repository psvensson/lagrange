import {test} from '../../../src/test-helpers/tap.js';
import {BaseView, ROW_STATUS, STATUS_COLORS} from
  '../../../src/cli/core/base-view.js';
import {EventBus} from '../../../src/cli/core/event-bus.js';

/**
 * Test view implementation
 */
class TestView extends BaseView {
  getColumns() {
    return [
      {key: 'id', label: 'ID'},
      {key: 'name', label: 'Name'},
      {key: 'status', label: 'Status'},
      {key: 'value', label: 'Value'},
    ];
  }

  formatRow(item) {
    return [item.id, item.name, item.status, String(item.value)];
  }

  getRowStatus(item) {
    if (item.status === 'error') return ROW_STATUS.ERROR;
    if (item.status === 'warning') return ROW_STATUS.WARNING;
    return ROW_STATUS.NORMAL;
  }

  getItemKey(item) {
    return item.id;
  }
}

test('BaseView', async (t) => {
  t.test('constructor initializes with default state', async (t) => {
    const view = new BaseView();

    t.equal(view.selectedIndex, 0);
    t.equal(view.filter, '');
    t.equal(view.sortColumn, null);
    t.equal(view.sortDirection, 'asc');
    t.equal(view.visible, false);
  });

  t.test('setData stores data and updates filtered data', async (t) => {
    const view = new TestView();
    const data = [
      {id: '1', name: 'Item 1', status: 'active', value: 10},
      {id: '2', name: 'Item 2', status: 'active', value: 20},
    ];

    view.setData(data);

    t.equal(view.data.length, 2);
    t.equal(view.filteredData.length, 2);
  });

  t.test('applyFilter filters data by string match', async (t) => {
    const view = new TestView();
    const data = [
      {id: '1', name: 'Apple', status: 'active', value: 10},
      {id: '2', name: 'Banana', status: 'active', value: 20},
      {id: '3', name: 'Cherry', status: 'active', value: 30},
    ];

    view.setData(data);
    view.setFilter('ban');

    t.equal(view.filteredData.length, 1);
    t.equal(view.filteredData[0].name, 'Banana');
  });

  t.test('applyFilter is case insensitive', async (t) => {
    const view = new TestView();
    const data = [
      {id: '1', name: 'Apple', status: 'active', value: 10},
      {id: '2', name: 'BANANA', status: 'active', value: 20},
    ];

    view.setData(data);
    view.setFilter('banana');

    t.equal(view.filteredData.length, 1);
    t.equal(view.filteredData[0].name, 'BANANA');
  });

  t.test('clearFilter removes filter', async (t) => {
    const view = new TestView();
    const data = [
      {id: '1', name: 'Apple', status: 'active', value: 10},
      {id: '2', name: 'Banana', status: 'active', value: 20},
    ];

    view.setData(data);
    view.setFilter('apple');
    t.equal(view.filteredData.length, 1);

    view.clearFilter();
    t.equal(view.filteredData.length, 2);
    t.equal(view.filter, '');
  });

  t.test('applySort sorts data ascending', async (t) => {
    const view = new TestView();
    const data = [
      {id: '3', name: 'Cherry', status: 'active', value: 30},
      {id: '1', name: 'Apple', status: 'active', value: 10},
      {id: '2', name: 'Banana', status: 'active', value: 20},
    ];

    view.setData(data);
    view.setSort('name', 'asc');

    t.equal(view.filteredData[0].name, 'Apple');
    t.equal(view.filteredData[1].name, 'Banana');
    t.equal(view.filteredData[2].name, 'Cherry');
  });

  t.test('applySort sorts data descending', async (t) => {
    const view = new TestView();
    const data = [
      {id: '1', name: 'Apple', status: 'active', value: 10},
      {id: '2', name: 'Banana', status: 'active', value: 20},
      {id: '3', name: 'Cherry', status: 'active', value: 30},
    ];

    view.setData(data);
    view.setSort('name', 'desc');

    t.equal(view.filteredData[0].name, 'Cherry');
    t.equal(view.filteredData[1].name, 'Banana');
    t.equal(view.filteredData[2].name, 'Apple');
  });

  t.test('applySort sorts numbers correctly', async (t) => {
    const view = new TestView();
    const data = [
      {id: '1', name: 'A', status: 'active', value: 100},
      {id: '2', name: 'B', status: 'active', value: 20},
      {id: '3', name: 'C', status: 'active', value: 5},
    ];

    view.setData(data);
    view.setSort('value', 'asc');

    t.equal(view.filteredData[0].value, 5);
    t.equal(view.filteredData[1].value, 20);
    t.equal(view.filteredData[2].value, 100);
  });

  t.test('setSort toggles direction on same column', async (t) => {
    const view = new TestView();
    view.setData([{id: '1', name: 'A', status: 'active', value: 10}]);

    view.setSort('name');
    t.equal(view.sortDirection, 'asc');

    view.setSort('name');
    t.equal(view.sortDirection, 'desc');

    view.setSort('name');
    t.equal(view.sortDirection, 'asc');
  });

  t.test('clearSort removes sorting', async (t) => {
    const view = new TestView();
    view.setData([{id: '1', name: 'A', status: 'active', value: 10}]);

    view.setSort('name', 'desc');
    t.equal(view.sortColumn, 'name');

    view.clearSort();
    t.equal(view.sortColumn, null);
    t.equal(view.sortDirection, 'asc');
  });

  t.test('render returns correct structure', async (t) => {
    const view = new TestView();
    const data = [
      {id: '1', name: 'Apple', status: 'active', value: 10},
      {id: '2', name: 'Banana', status: 'warning', value: 20},
    ];

    view.setData(data);
    const result = view.render();

    t.same(result.headers, ['ID', 'Name', 'Status', 'Value']);
    t.equal(result.rows.length, 2);
    t.equal(result.totalCount, 2);
    t.equal(result.filteredCount, 2);
  });

  t.test('render includes row status', async (t) => {
    const view = new TestView();
    const data = [
      {id: '1', name: 'A', status: 'active', value: 10},
      {id: '2', name: 'B', status: 'warning', value: 20},
      {id: '3', name: 'C', status: 'error', value: 30},
    ];

    view.setData(data);
    const result = view.render();

    t.equal(result.rows[0].status, ROW_STATUS.NORMAL);
    t.equal(result.rows[1].status, ROW_STATUS.WARNING);
    t.equal(result.rows[2].status, ROW_STATUS.ERROR);
  });

  t.test('markChanged and isChanged work correctly', async (t) => {
    const view = new TestView();

    t.equal(view.isChanged('key1'), false);

    view.markChanged('key1');
    t.equal(view.isChanged('key1'), true);
    t.equal(view.isChanged('key2'), false);

    view.clearChanged('key1');
    t.equal(view.isChanged('key1'), false);
  });

  t.test('clearChanged without key clears all', async (t) => {
    const view = new TestView();

    view.markChanged('key1');
    view.markChanged('key2');
    t.equal(view.isChanged('key1'), true);
    t.equal(view.isChanged('key2'), true);

    view.clearChanged();
    t.equal(view.isChanged('key1'), false);
    t.equal(view.isChanged('key2'), false);
  });

  t.test('selection methods work correctly', async (t) => {
    const view = new TestView();
    const data = [
      {id: '1', name: 'A', status: 'active', value: 10},
      {id: '2', name: 'B', status: 'active', value: 20},
      {id: '3', name: 'C', status: 'active', value: 30},
      {id: '4', name: 'D', status: 'active', value: 40},
    ];

    view.setData(data);

    t.equal(view.selectedIndex, 0);

    view.selectDown();
    t.equal(view.selectedIndex, 1);

    view.selectDown(2);
    t.equal(view.selectedIndex, 3);

    view.selectUp();
    t.equal(view.selectedIndex, 2);

    view.selectFirst();
    t.equal(view.selectedIndex, 0);

    view.selectLast();
    t.equal(view.selectedIndex, 3);
  });

  t.test('selection stays within bounds', async (t) => {
    const view = new TestView();
    const data = [
      {id: '1', name: 'A', status: 'active', value: 10},
      {id: '2', name: 'B', status: 'active', value: 20},
    ];

    view.setData(data);

    view.selectUp(10);
    t.equal(view.selectedIndex, 0);

    view.selectDown(10);
    t.equal(view.selectedIndex, 1);
  });

  t.test('getSelectedItem returns correct item', async (t) => {
    const view = new TestView();
    const data = [
      {id: '1', name: 'A', status: 'active', value: 10},
      {id: '2', name: 'B', status: 'active', value: 20},
    ];

    view.setData(data);
    t.equal(view.getSelectedItem().id, '1');

    view.selectDown();
    t.equal(view.getSelectedItem().id, '2');
  });

  t.test('getSelectedItem returns null for empty data', async (t) => {
    const view = new TestView();
    view.setData([]);

    t.equal(view.getSelectedItem(), null);
  });

  t.test('show and hide update visibility', async (t) => {
    const view = new TestView();

    t.equal(view.isVisible(), false);

    view.show();
    t.equal(view.isVisible(), true);

    view.hide();
    t.equal(view.isVisible(), false);
  });

  t.test('emits events via event bus', async (t) => {
    const eventBus = new EventBus();
    const view = new TestView({eventBus});

    const events = [];
    eventBus.on('view:*', (data, event) => {
      events.push({event, data});
    });

    view.show();
    view.hide();
    view.refresh();

    t.equal(events.length, 3);
    t.ok(events[0].event.includes('show'));
    t.ok(events[1].event.includes('hide'));
    t.ok(events[2].event.includes('refresh'));
  });

  t.test('styleRow applies correct styling', async (t) => {
    const view = new TestView();
    const row = ['A', 'B', 'C'];

    const normalStyled = view.styleRow(row, 'normal', false, false);
    t.ok(normalStyled[0].includes('white'));

    const warningStyled = view.styleRow(row, 'warning', false, false);
    t.ok(warningStyled[0].includes('yellow'));

    const errorStyled = view.styleRow(row, 'error', false, false);
    t.ok(errorStyled[0].includes('red'));

    const changedStyled = view.styleRow(row, 'normal', true, false);
    t.ok(changedStyled[0].includes('cyan'));

    const selectedStyled = view.styleRow(row, 'normal', false, true);
    t.ok(selectedStyled[0].includes('inverse'));
  });

  t.test('STATUS_COLORS exports correct values', async (t) => {
    t.equal(STATUS_COLORS.normal, 'white');
    t.equal(STATUS_COLORS.warning, 'yellow');
    t.equal(STATUS_COLORS.error, 'red');
    t.equal(STATUS_COLORS.changed, 'cyan');
  });

  t.test('filter resets selection index', async (t) => {
    const view = new TestView();
    const data = [
      {id: '1', name: 'Apple', status: 'active', value: 10},
      {id: '2', name: 'Banana', status: 'active', value: 20},
      {id: '3', name: 'Cherry', status: 'active', value: 30},
    ];

    view.setData(data);
    view.selectDown(2);
    t.equal(view.selectedIndex, 2);

    view.setFilter('apple');
    t.equal(view.selectedIndex, 0);
  });

  t.test('handles null values in sort', async (t) => {
    const view = new TestView();
    const data = [
      {id: '1', name: 'Apple', status: 'active', value: null},
      {id: '2', name: 'Banana', status: 'active', value: 20},
      {id: '3', name: null, status: 'active', value: 30},
    ];

    view.setData(data);
    view.setSort('value', 'asc');

    // Null values should sort to end in ascending order
    t.equal(view.filteredData[0].value, 20);
    t.equal(view.filteredData[1].value, 30);
    t.equal(view.filteredData[2].value, null);
  });
});
