/**
 * Unit tests for MessageGroupsView
 *
 * Tests the message groups view component including:
 * - Column definitions
 * - Row formatting
 * - Status highlighting for unhealthy replicas
 * - Drill-down navigation
 * - Detail panel information
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5
 */
// @ts-nocheck


import {test} from '../../../src/test-helpers/tap.js';
import {MessageGroupsView} from '../../../src/cli/views/message-groups-view.js';
import {ROW_STATUS} from '../../../src/cli/core/base-view.js';

test('MessageGroupsView', async (t) => {
  t.test('constructor', async (t) => {
    t.test('creates view with default options', async (t) => {
      const view = new MessageGroupsView();
      t.equal(view.viewName, 'message_groups');
      t.equal(view.cache, null);
    });

    t.test('creates view with cache option', async (t) => {
      const mockCache = {getMessageGroups: () => []};
      const view = new MessageGroupsView({cache: mockCache});
      t.equal(view.cache, mockCache);
    });
  });

  t.test('getColumns', async (t) => {
    t.test('returns correct column definitions', async (t) => {
      const view = new MessageGroupsView();
      const columns = view.getColumns();

      t.equal(columns.length, 4);
      t.equal(columns[0].key, 'group_id');
      t.equal(columns[0].label, 'Group ID');
      t.equal(columns[1].key, 'replica_count');
      t.equal(columns[1].label, 'Replicas');
      t.equal(columns[2].key, 'nodes_covered');
      t.equal(columns[2].label, 'Nodes Covered');
      t.equal(columns[3].key, 'status');
      t.equal(columns[3].label, 'Status');
    });

    t.test('all columns have width defined', async (t) => {
      const view = new MessageGroupsView();
      const columns = view.getColumns();

      for (const col of columns) {
        t.ok(col.width > 0, `Column ${col.key} should have width`);
      }
    });
  });

  t.test('formatRow', async (t) => {
    t.test('formats complete message group record', async (t) => {
      const view = new MessageGroupsView();
      const group = {
        group_id: 'mg-001',
        replica_count: 3,
        nodes_covered: ['node-1', 'node-2', 'node-3'],
        status: 'healthy',
      };

      const row = view.formatRow(group);

      t.equal(row[0], 'mg-001');
      t.equal(row[1], '3');
      t.equal(row[2], 'node-1, node-2, node-3');
      t.equal(row[3], 'healthy');
    });

    t.test('handles missing group_id', async (t) => {
      const view = new MessageGroupsView();
      const group = {replica_count: 3, status: 'healthy'};

      const row = view.formatRow(group);
      t.equal(row[0], 'N/A');
    });

    t.test('handles missing replica_count', async (t) => {
      const view = new MessageGroupsView();
      const group = {group_id: 'mg-001', status: 'healthy'};

      const row = view.formatRow(group);
      t.equal(row[1], 'N/A');
    });

    t.test('handles null replica_count', async (t) => {
      const view = new MessageGroupsView();
      const group = {group_id: 'mg-001', replica_count: null, status: 'healthy'};

      const row = view.formatRow(group);
      t.equal(row[1], 'N/A');
    });

    t.test('handles missing status', async (t) => {
      const view = new MessageGroupsView();
      const group = {group_id: 'mg-001', replica_count: 3};

      const row = view.formatRow(group);
      t.equal(row[3], 'unknown');
    });
  });

  t.test('formatNodesCovered', async (t) => {
    t.test('formats array of nodes', async (t) => {
      const view = new MessageGroupsView();
      const result = view.formatNodesCovered(['node-1', 'node-2', 'node-3']);
      t.equal(result, 'node-1, node-2, node-3');
    });

    t.test('handles single node array', async (t) => {
      const view = new MessageGroupsView();
      const result = view.formatNodesCovered(['node-1']);
      t.equal(result, 'node-1');
    });

    t.test('handles empty array', async (t) => {
      const view = new MessageGroupsView();
      const result = view.formatNodesCovered([]);
      t.equal(result, 'None');
    });

    t.test('handles null', async (t) => {
      const view = new MessageGroupsView();
      const result = view.formatNodesCovered(null);
      t.equal(result, 'N/A');
    });

    t.test('handles undefined', async (t) => {
      const view = new MessageGroupsView();
      const result = view.formatNodesCovered(undefined);
      t.equal(result, 'N/A');
    });

    t.test('handles string value', async (t) => {
      const view = new MessageGroupsView();
      const result = view.formatNodesCovered('node-1');
      t.equal(result, 'node-1');
    });
  });

  t.test('formatReplicaCount', async (t) => {
    t.test('formats positive number', async (t) => {
      const view = new MessageGroupsView();
      t.equal(view.formatReplicaCount(3), '3');
      t.equal(view.formatReplicaCount(5), '5');
    });

    t.test('formats zero', async (t) => {
      const view = new MessageGroupsView();
      t.equal(view.formatReplicaCount(0), '0');
    });

    t.test('handles null', async (t) => {
      const view = new MessageGroupsView();
      t.equal(view.formatReplicaCount(null), 'N/A');
    });

    t.test('handles undefined', async (t) => {
      const view = new MessageGroupsView();
      t.equal(view.formatReplicaCount(undefined), 'N/A');
    });
  });

  t.test('getRowStatus', async (t) => {
    t.test('returns NORMAL for healthy group', async (t) => {
      const view = new MessageGroupsView();
      const group = {
        group_id: 'mg-001',
        status: 'healthy',
        unhealthy_replica_count: 0,
      };

      t.equal(view.getRowStatus(group), ROW_STATUS.NORMAL);
    });

    t.test('returns ERROR for failed status', async (t) => {
      const view = new MessageGroupsView();
      const group = {group_id: 'mg-001', status: 'failed'};

      t.equal(view.getRowStatus(group), ROW_STATUS.ERROR);
    });

    t.test('returns ERROR for error status', async (t) => {
      const view = new MessageGroupsView();
      const group = {group_id: 'mg-001', status: 'error'};

      t.equal(view.getRowStatus(group), ROW_STATUS.ERROR);
    });

    t.test('returns WARNING for degraded status', async (t) => {
      const view = new MessageGroupsView();
      const group = {group_id: 'mg-001', status: 'degraded'};

      t.equal(view.getRowStatus(group), ROW_STATUS.WARNING);
    });

    t.test('returns WARNING when unhealthy_replica_count > 0', async (t) => {
      const view = new MessageGroupsView();
      const group = {
        group_id: 'mg-001',
        status: 'healthy',
        unhealthy_replica_count: 1,
      };

      t.equal(view.getRowStatus(group), ROW_STATUS.WARNING);
    });

    t.test('returns WARNING when replica_statuses has unhealthy', async (t) => {
      const view = new MessageGroupsView();
      const group = {
        group_id: 'mg-001',
        status: 'healthy',
        replica_statuses: ['healthy', 'unhealthy', 'healthy'],
      };

      t.equal(view.getRowStatus(group), ROW_STATUS.WARNING);
    });

    t.test('returns NORMAL when all replica_statuses healthy', async (t) => {
      const view = new MessageGroupsView();
      const group = {
        group_id: 'mg-001',
        status: 'healthy',
        replica_statuses: ['healthy', 'healthy', 'active'],
      };

      t.equal(view.getRowStatus(group), ROW_STATUS.NORMAL);
    });
  });

  t.test('hasUnhealthyReplicas', async (t) => {
    t.test('returns false when unhealthy_replica_count is 0', async (t) => {
      const view = new MessageGroupsView();
      const group = {unhealthy_replica_count: 0};

      t.equal(view.hasUnhealthyReplicas(group), false);
    });

    t.test('returns true when unhealthy_replica_count > 0', async (t) => {
      const view = new MessageGroupsView();
      const group = {unhealthy_replica_count: 2};

      t.equal(view.hasUnhealthyReplicas(group), true);
    });

    t.test('returns false when replica_statuses all healthy', async (t) => {
      const view = new MessageGroupsView();
      const group = {replica_statuses: ['healthy', 'active', 'healthy']};

      t.equal(view.hasUnhealthyReplicas(group), false);
    });

    t.test('returns true when replica_statuses has unhealthy', async (t) => {
      const view = new MessageGroupsView();
      const group = {replica_statuses: ['healthy', 'failed', 'healthy']};

      t.equal(view.hasUnhealthyReplicas(group), true);
    });

    t.test('returns false when no health info available', async (t) => {
      const view = new MessageGroupsView();
      const group = {group_id: 'mg-001'};

      t.equal(view.hasUnhealthyReplicas(group), false);
    });
  });

  t.test('getItemKey', async (t) => {
    t.test('returns group_id', async (t) => {
      const view = new MessageGroupsView();
      const group = {group_id: 'mg-001'};

      t.equal(view.getItemKey(group), 'mg-001');
    });

    t.test('returns empty string for missing group_id', async (t) => {
      const view = new MessageGroupsView();
      const group = {};

      t.equal(view.getItemKey(group), '');
    });
  });

  t.test('handleDrillDown', async (t) => {
    t.test('returns null when no item selected', async (t) => {
      const view = new MessageGroupsView();

      t.equal(view.handleDrillDown(), null);
    });

    t.test('returns navigation action for selected group', async (t) => {
      const view = new MessageGroupsView();
      view.setData([
        {group_id: 'mg-001', status: 'healthy'},
        {group_id: 'mg-002', status: 'healthy'},
      ]);

      const result = view.handleDrillDown();

      t.same(result, {
        action: 'drillDown',
        view: 'replicas',
        context: {
          groupId: 'mg-001',
          entityType: 'message_group',
        },
      });
    });
  });

  t.test('navigateToNode', async (t) => {
    t.test('returns null when no item selected', async (t) => {
      const view = new MessageGroupsView();

      t.equal(view.navigateToNode(), null);
    });

    t.test('returns null when nodes_covered is empty', async (t) => {
      const view = new MessageGroupsView();
      view.setData([{group_id: 'mg-001', nodes_covered: []}]);

      t.equal(view.navigateToNode(), null);
    });

    t.test('returns null when nodes_covered is not array', async (t) => {
      const view = new MessageGroupsView();
      view.setData([{group_id: 'mg-001', nodes_covered: 'node-1'}]);

      t.equal(view.navigateToNode(), null);
    });

    t.test('navigates to first node by default', async (t) => {
      const view = new MessageGroupsView();
      view.setData([{
        group_id: 'mg-001',
        nodes_covered: ['node-1', 'node-2', 'node-3'],
      }]);

      const result = view.navigateToNode();

      t.same(result, {
        action: 'jumpToEntity',
        entityType: 'node',
        entityId: 'node-1',
      });
    });

    t.test('navigates to specified node index', async (t) => {
      const view = new MessageGroupsView();
      view.setData([{
        group_id: 'mg-001',
        nodes_covered: ['node-1', 'node-2', 'node-3'],
      }]);

      const result = view.navigateToNode(1);

      t.same(result, {
        action: 'jumpToEntity',
        entityType: 'node',
        entityId: 'node-2',
      });
    });

    t.test('clamps index to array bounds', async (t) => {
      const view = new MessageGroupsView();
      view.setData([{
        group_id: 'mg-001',
        nodes_covered: ['node-1', 'node-2'],
      }]);

      const result = view.navigateToNode(10);

      t.same(result, {
        action: 'jumpToEntity',
        entityType: 'node',
        entityId: 'node-2',
      });
    });
  });

  t.test('handleKey', async (t) => {
    t.test('handles enter key for drill-down', async (t) => {
      const view = new MessageGroupsView();
      view.setData([{group_id: 'mg-001', status: 'healthy'}]);

      const result = view.handleKey({name: 'enter'});

      t.ok(result);
      t.equal(result.action, 'drillDown');
    });

    t.test('handles return key for drill-down', async (t) => {
      const view = new MessageGroupsView();
      view.setData([{group_id: 'mg-001', status: 'healthy'}]);

      const result = view.handleKey({name: 'return'});

      t.ok(result);
      t.equal(result.action, 'drillDown');
    });

    t.test('handles n key for node navigation', async (t) => {
      const view = new MessageGroupsView();
      view.setData([{
        group_id: 'mg-001',
        nodes_covered: ['node-1', 'node-2'],
      }]);

      const result = view.handleKey({name: 'n'});

      t.ok(result);
      t.equal(result.action, 'jumpToEntity');
      t.equal(result.entityType, 'node');
    });

    t.test('handles N key for node navigation', async (t) => {
      const view = new MessageGroupsView();
      view.setData([{
        group_id: 'mg-001',
        nodes_covered: ['node-1'],
      }]);

      const result = view.handleKey({name: 'N'});

      t.ok(result);
      t.equal(result.action, 'jumpToEntity');
    });

    t.test('delegates other keys to base class', async (t) => {
      const view = new MessageGroupsView();
      view.setData([
        {group_id: 'mg-001'},
        {group_id: 'mg-002'},
      ]);

      // Unknown key should return result from base class
      const result = view.handleKey({name: 'x'});
      t.equal(result, false);
    });
  });

  t.test('getSelectedDetails', async (t) => {
    t.test('returns null when no item selected', async (t) => {
      const view = new MessageGroupsView();

      t.equal(view.getSelectedDetails(), null);
    });

    t.test('returns basic details for selected group', async (t) => {
      const view = new MessageGroupsView();
      view.setData([{
        group_id: 'mg-001',
        replica_count: 3,
        nodes_covered: ['node-1', 'node-2', 'node-3'],
        status: 'healthy',
      }]);

      const details = view.getSelectedDetails();

      t.equal(details.title, 'Message Group: mg-001');
      t.equal(details.sections.length, 2);
      t.equal(details.sections[0].title, 'Basic Information');
      t.equal(details.sections[1].title, 'Replication');
    });

    t.test('includes leader node when available', async (t) => {
      const view = new MessageGroupsView();
      view.setData([{
        group_id: 'mg-001',
        status: 'healthy',
        leader_node_id: 'node-1',
      }]);

      const details = view.getSelectedDetails();
      const basicInfo = details.sections[0];
      const leaderField = basicInfo.fields.find(
        (f) => f.label === 'Leader Node');

      t.ok(leaderField);
      t.equal(leaderField.value, 'node-1');
    });

    t.test('includes Raft state when available', async (t) => {
      const view = new MessageGroupsView();
      view.setData([{
        group_id: 'mg-001',
        status: 'healthy',
        raft_term: 5,
        raft_index: 100,
      }]);

      const details = view.getSelectedDetails();
      const raftSection = details.sections.find(
        (s) => s.title === 'Raft State');

      t.ok(raftSection);
      t.equal(raftSection.fields[0].value, '5');
      t.equal(raftSection.fields[1].value, '100');
    });

    t.test('shows unhealthy replicas status', async (t) => {
      const view = new MessageGroupsView();
      view.setData([{
        group_id: 'mg-001',
        status: 'healthy',
        unhealthy_replica_count: 1,
      }]);

      const details = view.getSelectedDetails();
      const replicationSection = details.sections[1];
      const unhealthyField = replicationSection.fields.find(
        (f) => f.label === 'Has Unhealthy Replicas');

      t.ok(unhealthyField);
      t.equal(unhealthyField.value, 'Yes');
    });
  });

  t.test('data management', async (t) => {
    t.test('setData stores and filters data', async (t) => {
      const view = new MessageGroupsView();
      const data = [
        {group_id: 'mg-001', status: 'healthy'},
        {group_id: 'mg-002', status: 'degraded'},
      ];

      view.setData(data);

      t.equal(view.filteredData.length, 2);
    });

    t.test('filter applies to group_id', async (t) => {
      const view = new MessageGroupsView();
      view.setData([
        {group_id: 'mg-001', status: 'healthy'},
        {group_id: 'mg-002', status: 'healthy'},
        {group_id: 'other-group', status: 'healthy'},
      ]);

      view.setFilter('mg-00');

      t.equal(view.filteredData.length, 2);
    });
  });
});
