import {test} from 'tap';
import {PartitionsView} from '../../../src/cli/views/partitions-view.js';
import {ROW_STATUS} from '../../../src/cli/core/base-view.js';

/**
 * Create a sample partition record
 * @param {Object} overrides - Field overrides
 * @return {Object} Partition record
 */
function createPartition(overrides = {}) {
  return {
    partition_id: 'part-1',
    table_id: 'tbl-1',
    partition_key_start: 'a',
    partition_key_end: 'm',
    replica_count: 3,
    leader_node_id: 'node-1',
    size_bytes: 1048576,
    status: 'active',
    ...overrides,
  };
}

test('PartitionsView', async (t) => {
  t.test('constructor initializes with default state', async (t) => {
    const view = new PartitionsView();

    t.equal(view.viewName, 'partitions');
    t.equal(view.cache, null);
    t.equal(view.tableFilter, null);
    t.equal(view.expectedReplicaCount, null);
  });

  t.test('getColumns returns correct column definitions', async (t) => {
    const view = new PartitionsView();
    const columns = view.getColumns();

    t.equal(columns.length, 6);
    t.equal(columns[0].key, 'partition_id');
    t.equal(columns[1].key, 'key_range');
    t.equal(columns[2].key, 'replica_count');
    t.equal(columns[3].key, 'leader_node_id');
    t.equal(columns[4].key, 'size_bytes');
    t.equal(columns[5].key, 'status');
  });

  t.test('formatRow formats partition data correctly', async (t) => {
    const view = new PartitionsView();
    const partition = createPartition();

    const row = view.formatRow(partition);

    t.equal(row[0], 'part-1');
    t.equal(row[1], '[a, m)');
    t.equal(row[2], '3');
    t.equal(row[3], 'node-1');
    t.equal(row[4], '1.0 MB');
    t.equal(row[5], 'active');
  });

  t.test('formatRow handles missing values', async (t) => {
    const view = new PartitionsView();
    const partition = {
      partition_id: null,
      partition_key_start: null,
      partition_key_end: null,
      replica_count: null,
      leader_node_id: null,
      size_bytes: null,
      status: null,
    };

    const row = view.formatRow(partition);

    t.equal(row[0], 'N/A');
    t.equal(row[1], '[-∞, +∞)');
    t.equal(row[2], 'N/A');
    t.equal(row[3], 'No Leader');
    t.equal(row[4], 'N/A');
    t.equal(row[5], 'unknown');
  });

  t.test('formatKeyRange formats ranges correctly', async (t) => {
    const view = new PartitionsView();

    t.equal(view.formatKeyRange({partition_key_start: 'a',
      partition_key_end: 'z'}), '[a, z)');
    t.equal(view.formatKeyRange({partition_key_start: null,
      partition_key_end: 'm'}), '[-∞, m)');
    t.equal(view.formatKeyRange({partition_key_start: 'n',
      partition_key_end: null}), '[n, +∞)');
    t.equal(view.formatKeyRange({partition_key_start: null,
      partition_key_end: null}), '[-∞, +∞)');
  });

  t.test('formatSize formats sizes correctly', async (t) => {
    const view = new PartitionsView();

    t.equal(view.formatSize(null), 'N/A');
    t.equal(view.formatSize(undefined), 'N/A');
    t.equal(view.formatSize(0), '0 B');
    t.equal(view.formatSize(1024), '1.0 KB');
    t.equal(view.formatSize(1048576), '1.0 MB');
  });

  t.test('getRowStatus returns ERROR for failed partitions', async (t) => {
    const view = new PartitionsView();

    t.equal(view.getRowStatus(createPartition({status: 'failed'})),
      ROW_STATUS.ERROR);
    t.equal(view.getRowStatus(createPartition({status: 'error'})),
      ROW_STATUS.ERROR);
  });

  t.test('getRowStatus returns ERROR for no leader', async (t) => {
    const view = new PartitionsView();
    const partition = createPartition({leader_node_id: null});

    t.equal(view.getRowStatus(partition), ROW_STATUS.ERROR);
  });

  t.test('getRowStatus returns WARNING for under-replicated', async (t) => {
    const view = new PartitionsView({expectedReplicaCount: 3});
    const partition = createPartition({replica_count: 2});

    t.equal(view.getRowStatus(partition), ROW_STATUS.WARNING);
  });

  t.test('getRowStatus returns NORMAL for healthy partitions', async (t) => {
    const view = new PartitionsView({expectedReplicaCount: 3});
    const partition = createPartition({replica_count: 3});

    t.equal(view.getRowStatus(partition), ROW_STATUS.NORMAL);
  });

  t.test('isUnderReplicated detects under-replication', async (t) => {
    const view = new PartitionsView({expectedReplicaCount: 3});

    t.equal(view.isUnderReplicated(createPartition({replica_count: 2})), true);
    t.equal(view.isUnderReplicated(createPartition({replica_count: 3})), false);
    t.equal(view.isUnderReplicated(createPartition({replica_count: 4})), false);
    t.equal(view.isUnderReplicated(createPartition({replica_count: null})), true);
  });

  t.test('isUnderReplicated returns false without expected count', async (t) => {
    const view = new PartitionsView();

    t.equal(view.isUnderReplicated(createPartition({replica_count: 1})), false);
  });

  t.test('setExpectedReplicaCount updates expected count', async (t) => {
    const view = new PartitionsView();

    view.setExpectedReplicaCount(5);

    t.equal(view.expectedReplicaCount, 5);
  });

  t.test('getItemKey returns partition_id', async (t) => {
    const view = new PartitionsView();
    const partition = createPartition({partition_id: 'test-part-123'});

    t.equal(view.getItemKey(partition), 'test-part-123');
  });

  t.test('setTableFilter filters by table', async (t) => {
    const view = new PartitionsView();
    const partitions = [
      createPartition({partition_id: 'p1', table_id: 'tbl-1'}),
      createPartition({partition_id: 'p2', table_id: 'tbl-2'}),
      createPartition({partition_id: 'p3', table_id: 'tbl-1'}),
    ];
    view.setData(partitions);

    view.setTableFilter('tbl-1');

    t.equal(view.filteredData.length, 2);
    t.ok(view.filteredData.every((p) => p.table_id === 'tbl-1'));
  });

  t.test('clearTableFilter removes filter', async (t) => {
    const view = new PartitionsView();
    const partitions = [
      createPartition({partition_id: 'p1', table_id: 'tbl-1'}),
      createPartition({partition_id: 'p2', table_id: 'tbl-2'}),
    ];
    view.setData(partitions);

    view.setTableFilter('tbl-1');
    t.equal(view.filteredData.length, 1);

    view.clearTableFilter();
    t.equal(view.filteredData.length, 2);
  });

  t.test('handleDrillDown returns navigation action', async (t) => {
    const view = new PartitionsView();
    view.setData([createPartition({partition_id: 'p1', table_id: 'tbl-1'})]);

    const action = view.handleDrillDown();

    t.same(action, {
      action: 'drillDown',
      view: 'replicas',
      context: {partitionId: 'p1', tableId: 'tbl-1'},
    });
  });

  t.test('handleDrillDown returns null when no selection', async (t) => {
    const view = new PartitionsView();
    view.setData([]);

    const action = view.handleDrillDown();

    t.equal(action, null);
  });

  t.test('navigateToLeaderNode returns navigation action', async (t) => {
    const view = new PartitionsView();
    view.setData([createPartition({leader_node_id: 'node-1'})]);

    const action = view.navigateToLeaderNode();

    t.same(action, {
      action: 'jumpToEntity',
      entityType: 'node',
      entityId: 'node-1',
    });
  });

  t.test('navigateToLeaderNode returns null without leader', async (t) => {
    const view = new PartitionsView();
    view.setData([createPartition({leader_node_id: null})]);

    const action = view.navigateToLeaderNode();

    t.equal(action, null);
  });

  t.test('handleKey triggers navigation on n key', async (t) => {
    const view = new PartitionsView();
    view.setData([createPartition({leader_node_id: 'node-1'})]);

    const result = view.handleKey({name: 'n'});

    t.same(result, {
      action: 'jumpToEntity',
      entityType: 'node',
      entityId: 'node-1',
    });
  });

  t.test('getSelectedDetails returns partition details', async (t) => {
    const view = new PartitionsView();
    view.setData([createPartition()]);

    const details = view.getSelectedDetails();

    t.equal(details.title, 'Partition: part-1');
    t.ok(details.sections.length >= 3);
    t.equal(details.sections[0].title, 'Basic Information');
    t.equal(details.sections[1].title, 'Replication');
    t.equal(details.sections[2].title, 'Storage');
  });

  t.test('getSelectedDetails includes Raft state when available', async (t) => {
    const view = new PartitionsView();
    view.setData([createPartition({raft_term: 5, raft_index: 100})]);

    const details = view.getSelectedDetails();

    const raftSection = details.sections.find((s) => s.title === 'Raft State');
    t.ok(raftSection);
  });

  t.test('getSelectedDetails returns null when no selection', async (t) => {
    const view = new PartitionsView();
    view.setData([]);

    const details = view.getSelectedDetails();

    t.equal(details, null);
  });
});
