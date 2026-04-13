// @ts-nocheck
import {test} from '../../../src/test-helpers/tap.js';
import {TablesView, SIZE_UNITS, POLICY_SUMMARY_MAX_LENGTH} from
  '../../../src/cli/views/tables-view.js';
import {ROW_STATUS} from '../../../src/cli/core/base-view.js';

/**
 * Create a sample table record
 * @param {Object} overrides - Field overrides
 * @return {Object} Table record
 */
function createTable(overrides = {}) {
  return {
    table_id: 'tbl-1',
    table_name: 'users',
    partition_count: 4,
    replica_factor: 3,
    total_size: 1048576,
    table_policies: null,
    schema: null,
    ...overrides,
  };
}

test('TablesView', async (t) => {
  t.test('constructor initializes with default state', async (t) => {
    const view = new TablesView();

    t.equal(view.viewName, 'tables');
    t.equal(view.cache, null);
  });

  t.test('getColumns returns correct column definitions', async (t) => {
    const view = new TablesView();
    const columns = view.getColumns();

    t.equal(columns.length, 5);
    t.equal(columns[0].key, 'table_name');
    t.equal(columns[1].key, 'partition_count');
    t.equal(columns[2].key, 'replica_factor');
    t.equal(columns[3].key, 'total_size');
    t.equal(columns[4].key, 'policy_summary');
  });

  t.test('formatRow formats table data correctly', async (t) => {
    const view = new TablesView();
    const table = createTable();

    const row = view.formatRow(table);

    t.equal(row[0], 'users');
    t.equal(row[1], '4');
    t.equal(row[2], '3');
    t.equal(row[3], '1.0 MB');
    t.equal(row[4], 'Default');
  });

  t.test('formatRow handles missing values', async (t) => {
    const view = new TablesView();
    const table = {
      table_id: null,
      table_name: null,
      partition_count: null,
      replica_factor: null,
      total_size: null,
      table_policies: null,
    };

    const row = view.formatRow(table);

    t.equal(row[0], 'N/A');
    t.equal(row[1], 'N/A');
    t.equal(row[2], 'N/A');
    t.equal(row[3], 'N/A');
    t.equal(row[4], 'Default');
  });

  t.test('formatSize formats sizes correctly', async (t) => {
    const view = new TablesView();

    t.equal(view.formatSize(null), 'N/A');
    t.equal(view.formatSize(undefined), 'N/A');
    t.equal(view.formatSize(0), '0 B');
    t.equal(view.formatSize(512), '512.0 B');
    t.equal(view.formatSize(1024), '1.0 KB');
    t.equal(view.formatSize(1048576), '1.0 MB');
    t.equal(view.formatSize(1073741824), '1.0 GB');
    t.equal(view.formatSize(1099511627776), '1.0 TB');
  });

  t.test('formatPolicySummary returns Default for no policies', async (t) => {
    const view = new TablesView();

    t.equal(view.formatPolicySummary({}), 'Default');
    t.equal(view.formatPolicySummary({table_policies: null}), 'Default');
    t.equal(view.formatPolicySummary({table_policies: '{}'}), 'Default');
  });

  t.test('formatPolicySummary includes placement_policy', async (t) => {
    const view = new TablesView();
    const table = {
      table_policies: JSON.stringify({placement_policy: 'rack-aware'}),
    };

    const summary = view.formatPolicySummary(table);

    t.ok(summary.includes('Placement: rack-aware'));
  });

  t.test('formatPolicySummary includes replication_policy', async (t) => {
    const view = new TablesView();
    const table = {
      table_policies: JSON.stringify({replication_policy: 'async'}),
    };

    const summary = view.formatPolicySummary(table);

    t.ok(summary.includes('Replication: async'));
  });

  t.test('formatPolicySummary includes consistency_level', async (t) => {
    const view = new TablesView();
    const table = {
      table_policies: JSON.stringify({consistency_level: 'strong'}),
    };

    const summary = view.formatPolicySummary(table);

    t.ok(summary.includes('Consistency: strong'));
  });

  t.test('formatPolicySummary includes durability', async (t) => {
    const view = new TablesView();
    const table = {
      table_policies: JSON.stringify({durability: 'persistent'}),
    };

    const summary = view.formatPolicySummary(table);

    t.ok(summary.includes('Durability: persistent'));
  });

  t.test('formatPolicySummary includes compression', async (t) => {
    const view = new TablesView();
    const table = {
      table_policies: JSON.stringify({compression: 'lz4'}),
    };

    const summary = view.formatPolicySummary(table);

    t.ok(summary.includes('Compression: lz4'));
  });

  t.test('formatPolicySummary truncates long summaries', async (t) => {
    const view = new TablesView();
    const table = {
      table_policies: JSON.stringify({
        placement_policy: 'rack-aware-distributed',
        replication_policy: 'synchronous-multi-region',
        consistency_level: 'strong-serializable',
        durability: 'persistent-replicated',
        compression: 'zstd-high-compression',
      }),
    };

    const summary = view.formatPolicySummary(table);

    t.ok(summary.length <= POLICY_SUMMARY_MAX_LENGTH);
    t.ok(summary.endsWith('...'));
  });

  t.test('formatPolicySummary handles malformed JSON', async (t) => {
    const view = new TablesView();
    const table = {
      table_policies: 'not valid json',
    };

    const summary = view.formatPolicySummary(table);

    t.equal(summary, 'Default');
  });

  t.test('formatPolicySummary handles object policies', async (t) => {
    const view = new TablesView();
    const table = {
      table_policies: {placement_policy: 'local'},
    };

    const summary = view.formatPolicySummary(table);

    t.ok(summary.includes('Placement: local'));
  });

  t.test('getRowStatus returns WARNING for zero partitions', async (t) => {
    const view = new TablesView();
    const table = createTable({partition_count: 0});

    t.equal(view.getRowStatus(table), ROW_STATUS.WARNING);
  });

  t.test('getRowStatus returns NORMAL for tables with partitions', async (t) => {
    const view = new TablesView();
    const table = createTable({partition_count: 4});

    t.equal(view.getRowStatus(table), ROW_STATUS.NORMAL);
  });

  t.test('getItemKey returns table_id', async (t) => {
    const view = new TablesView();
    const table = createTable({table_id: 'test-tbl-123'});

    t.equal(view.getItemKey(table), 'test-tbl-123');
  });

  t.test('getItemKey falls back to table_name', async (t) => {
    const view = new TablesView();
    const table = createTable({table_id: null, table_name: 'my_table'});

    t.equal(view.getItemKey(table), 'my_table');
  });

  t.test('handleDrillDown returns navigation action', async (t) => {
    const view = new TablesView();
    view.setData([createTable({table_id: 'tbl-1', table_name: 'users'})]);

    const action = view.handleDrillDown();

    t.same(action, {
      action: 'drillDown',
      view: 'partitions',
      context: {tableId: 'tbl-1', tableName: 'users'},
    });
  });

  t.test('handleDrillDown returns null when no selection', async (t) => {
    const view = new TablesView();
    view.setData([]);

    const action = view.handleDrillDown();

    t.equal(action, null);
  });

  t.test('getSelectedDetails returns table details', async (t) => {
    const view = new TablesView();
    view.setData([createTable()]);

    const details = view.getSelectedDetails();

    t.equal(details.title, 'Table: users');
    t.ok(details.sections.length >= 2);
    t.equal(details.sections[0].title, 'Basic Information');
  });

  t.test('getSelectedDetails includes schema when available', async (t) => {
    const view = new TablesView();
    view.setData([createTable({schema: {columns: ['id', 'name']}})]);

    const details = view.getSelectedDetails();

    const schemaSection = details.sections.find((s) => s.title === 'Schema');
    t.ok(schemaSection);
  });

  t.test('getSelectedDetails includes policy fields', async (t) => {
    const view = new TablesView();
    view.setData([createTable({
      table_policies: JSON.stringify({placement_policy: 'local'}),
    })]);

    const details = view.getSelectedDetails();

    const policySection = details.sections.find((s) => s.title === 'Policies');
    t.ok(policySection);
    t.ok(policySection.fields.some((f) => f.label === 'Placement'));
  });

  t.test('SIZE_UNITS constant is correct', async (t) => {
    t.same(SIZE_UNITS, ['B', 'KB', 'MB', 'GB', 'TB']);
  });

  t.test('POLICY_SUMMARY_MAX_LENGTH constant is correct', async (t) => {
    t.equal(POLICY_SUMMARY_MAX_LENGTH, 50);
  });
});
